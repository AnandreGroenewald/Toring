import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHarness, signupBody, premiumBody, chargeSuccess, subscriptionCreate, subscriptionEvent, invoiceEvent,
  PLAN_BLOCK, PLAN_PREMIUM, T0, DAY,
} from './support/harness.js';
import { addMonthsUTC } from '../src/entitlement.js';

const GRACE = 3 * DAY;

async function signup(h, body = signupBody()) {
  const res = await h.request('POST', '/subscribe', { body });
  assert.equal(res.status, 200, res.text);
  return res.json;
}

const sponsor = (h, id) => h.db.q('SELECT * FROM sponsors WHERE id = ?', id)[0];

async function feedNames(h) {
  h.clock.now += 60_000; // past the in-memory feed cache
  const res = await h.request('GET', '/sponsors');
  return [...res.json.block, ...res.json.premium].map((s) => s.name);
}

test('bad or missing signature -> 401 and nothing changes', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  const evt = chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } });

  let res = await h.webhook(evt, { secret: 'sk_test_wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.json.error, 'invalid_signature');
  res = await h.webhook(evt, { signature: '' });
  assert.equal(res.status, 401);
  res = await h.webhook(evt, { signature: 'zz'.repeat(64) });
  assert.equal(res.status, 401);

  // Valid signature for a different body (tampered amount).
  const { createHmac } = await import('node:crypto');
  const sig = createHmac('sha512', 'sk_test_0123456789abcdef0123456789abcdef').update(JSON.stringify(evt)).digest('hex');
  const tampered = JSON.stringify({ ...evt, data: { ...evt.data, amount: 1 } });
  res = await h.request('POST', '/paystack/webhook', {
    rawBody: tampered, origin: null, headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
  });
  assert.equal(res.status, 401);

  assert.equal(sponsor(h, sponsorId).status, 'pending');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 0);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM webhook_events')[0].n, 0);
});

test('initial charge.success activates: paid_until = charge + 1 month + 3 days grace', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  const paidAt = T0 + 5 * 60 * 1000;
  h.clock.now = paidAt + 1000;
  const res = await h.webhook(chargeSuccess({ reference, paidAt, metadata: { sponsorId, tier: 'block' } }));
  assert.equal(res.status, 200);

  const s = sponsor(h, sponsorId);
  assert.equal(s.status, 'active');
  assert.equal(s.paid_until, addMonthsUTC(paidAt, 1) + GRACE);
  assert.equal(new Date(s.paid_until).toISOString(), '2026-11-09T10:05:00.000Z');
  assert.equal(s.paystack_customer, 'CUS_anna');
  const [p] = h.db.q('SELECT * FROM payments');
  assert.deepEqual(p, { reference, sponsor_id: sponsorId, amount: 4900, currency: 'ZAR', paid_at: paidAt, source: 'webhook' });
  assert.deepEqual(await feedNames(h), ['Bakkery Lekker']);

  const [e] = h.db.q('SELECT * FROM webhook_events');
  assert.equal(e.handled, 1);
  assert.equal(e.sponsor_id, sponsorId);
  assert.ok(!e.payload.includes('4081'), 'card details are redacted from the stored payload');
  assert.ok(!e.payload.includes('authorization'), 'authorization object removed');
});

test('metadata sent as a JSON string is understood too', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: JSON.stringify({ sponsorId }) }));
  assert.equal(sponsor(h, sponsorId).status, 'active');
});

test('subscription.create stores subscription code + email token', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  const res = await h.webhook(subscriptionCreate({}));
  assert.equal(res.status, 200);
  const s = sponsor(h, sponsorId);
  assert.equal(s.paystack_subscription, 'SUB_anna');
  assert.equal(s.paystack_email_token, 'tok_anna');
  assert.equal(s.status, 'active');
});

test('renewal charge without metadata extends the right sponsor (customer + plan)', async () => {
  const h = createHarness();
  const a = await signup(h);
  const b = await signup(h, signupBody({ name: 'Ander Winkel', email: 'ben@example.com', contactName: 'Ben' }));
  const p = await signup(h, premiumBody({ email: 'anna@example.co.za' })); // same customer, other plan
  await h.webhook(chargeSuccess({ reference: a.reference, paidAt: T0, metadata: { sponsorId: a.sponsorId } }));
  await h.webhook(chargeSuccess({ reference: b.reference, paidAt: T0, metadata: { sponsorId: b.sponsorId }, email: 'ben@example.com', customerCode: 'CUS_ben' }));
  await h.webhook(chargeSuccess({ reference: p.reference, paidAt: T0, amount: 149900, plan: PLAN_PREMIUM, metadata: { sponsorId: p.sponsorId } }));
  const before = { a: sponsor(h, a.sponsorId).paid_until, b: sponsor(h, b.sponsorId).paid_until, p: sponsor(h, p.sponsorId).paid_until };

  const renewAt = addMonthsUTC(T0, 1);
  h.clock.now = renewAt + 1000;
  const res = await h.webhook(chargeSuccess({ reference: 'T_renew_1', paidAt: renewAt, plan: PLAN_BLOCK }));
  assert.equal(res.status, 200);

  assert.equal(sponsor(h, a.sponsorId).paid_until, addMonthsUTC(T0, 2) + GRACE, 'Anna\'s block renewed');
  assert.equal(sponsor(h, b.sponsorId).paid_until, before.b, 'Ben untouched');
  assert.equal(sponsor(h, p.sponsorId).paid_until, before.p, 'Anna\'s premium (other plan) untouched');
  assert.equal(h.db.q("SELECT sponsor_id FROM payments WHERE reference = 'T_renew_1'")[0].sponsor_id, a.sponsorId);
});

test('renewal via invoice.update (subscription code) and the matching charge.success count once', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  await h.webhook(subscriptionCreate({}));
  const renewAt = addMonthsUTC(T0, 1);
  h.clock.now = renewAt + 5000;
  await h.webhook(invoiceEvent('invoice.update', { reference: 'T_renew_2', paidAt: renewAt }));
  const after1 = sponsor(h, sponsorId).paid_until;
  assert.equal(after1, addMonthsUTC(T0, 2) + GRACE);
  await h.webhook(chargeSuccess({ reference: 'T_renew_2', paidAt: renewAt }));
  assert.equal(sponsor(h, sponsorId).paid_until, after1, 'same transaction reference -> no second month');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 2);
});

test('duplicate delivery of the same event is a no-op', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  const evt = chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } });
  await h.webhook(evt);
  const once = sponsor(h, sponsorId).paid_until;
  const res = await h.webhook(evt);
  assert.equal(res.status, 200);
  assert.equal(res.json.duplicate, true);
  // Even a re-shaped duplicate (new event id, same reference) must not extend again.
  await h.webhook({ ...evt, data: { ...evt.data, id: 999 } });
  assert.equal(sponsor(h, sponsorId).paid_until, once);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 1);
});

test('out of order: subscription.create before charge.success', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  let res = await h.webhook(subscriptionCreate({}));
  assert.equal(res.status, 200);
  let s = sponsor(h, sponsorId);
  assert.equal(s.paystack_subscription, 'SUB_anna', 'matched by checkout e-mail + plan');
  assert.equal(s.status, 'pending', 'no money seen yet');
  res = await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  s = sponsor(h, sponsorId);
  assert.equal(s.status, 'active');
  assert.equal(s.paid_until, addMonthsUTC(T0, 1) + GRACE);
  assert.equal(s.paystack_subscription, 'SUB_anna');
});

test('out of order: renewals processed newest-first give the same paid_until', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  const m1 = addMonthsUTC(T0, 1);
  const m2 = addMonthsUTC(T0, 2);
  h.clock.now = m2 + 1000;
  await h.webhook(chargeSuccess({ reference: 'T_m2', paidAt: m2, metadata: { sponsorId } }));
  await h.webhook(chargeSuccess({ reference: 'T_m1', paidAt: m1, metadata: { sponsorId } }));
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  assert.equal(sponsor(h, sponsorId).paid_until, addMonthsUTC(T0, 3) + GRACE);
});

test('double-clicked checkout: subscription first lands on the unpaid twin, then moves to the payer', async () => {
  const h = createHarness();
  const first = await signup(h);
  const second = await signup(h); // same e-mail; this is the checkout that gets paid
  // subscription.create arrives first and picks the newest pending checkout for this e-mail...
  await h.webhook(subscriptionCreate({}));
  // ...then simulate the worst case: it was stored on the older twin.
  h.db.db.prepare('UPDATE sponsors SET paystack_subscription = NULL, paystack_email_token = NULL').run();
  h.db.db.prepare("UPDATE sponsors SET paystack_subscription = 'SUB_anna', paystack_email_token = 'tok_anna', paystack_customer = 'CUS_anna' WHERE id = ?").run(first.sponsorId);
  await h.webhook(chargeSuccess({ reference: second.reference, paidAt: T0, metadata: { sponsorId: second.sponsorId } }));
  assert.equal(sponsor(h, second.sponsorId).paystack_subscription, 'SUB_anna');
  assert.equal(sponsor(h, first.sponsorId).paystack_subscription, null);
  assert.equal(sponsor(h, first.sponsorId).status, 'pending');
});

test('subscription.not_renew -> cancelling, still live until paid_until, then ended by the cron', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  await h.webhook(subscriptionCreate({}));
  h.clock.now = T0 + 10 * DAY;
  await h.webhook(subscriptionEvent('subscription.not_renew', {}));
  let s = sponsor(h, sponsorId);
  assert.equal(s.status, 'cancelling');
  assert.deepEqual(await feedNames(h), ['Bakkery Lekker'], 'paid month is honoured');

  // At period end Paystack disables it; the sponsor keeps the grace days, then lapses.
  h.clock.now = addMonthsUTC(T0, 1);
  await h.webhook(subscriptionEvent('subscription.disable', { status: 'complete' }));
  assert.equal(sponsor(h, sponsorId).status, 'cancelling');
  h.clock.now = s.paid_until + 1;
  assert.deepEqual(await feedNames(h), []);
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  s = sponsor(h, sponsorId);
  assert.equal(s.status, 'ended');
});

test('subscription.disable on an active sponsor -> ended immediately', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  await h.webhook(subscriptionCreate({}));
  h.clock.now = T0 + DAY;
  await h.webhook(subscriptionEvent('subscription.disable', {}));
  assert.equal(sponsor(h, sponsorId).status, 'ended');
  assert.deepEqual(await feedNames(h), []);

  // A late duplicate charge (new delivery id, same transaction) must not bring it back.
  const late = chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } });
  const res = await h.webhook(late);
  assert.equal(res.json.duplicate, undefined, 'processed as a new delivery');
  assert.equal(h.db.q('SELECT note FROM webhook_events ORDER BY rowid DESC LIMIT 1')[0].note, 'duplicate');
  await h.webhook(subscriptionEvent('subscription.not_renew', {}));
  assert.equal(sponsor(h, sponsorId).status, 'ended');
});

test('invoice.payment_failed -> no extension; the sponsorship lapses at paid_until', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  await h.webhook(subscriptionCreate({}));
  const paidUntil = sponsor(h, sponsorId).paid_until;
  h.clock.now = addMonthsUTC(T0, 1);
  const res = await h.webhook(invoiceEvent('invoice.payment_failed', { paid: false }));
  assert.equal(res.status, 200);
  assert.equal(sponsor(h, sponsorId).paid_until, paidUntil);
  assert.deepEqual(await feedNames(h), ['Bakkery Lekker'], 'grace days still live');
  h.clock.now = paidUntil + 1;
  assert.deepEqual(await feedNames(h), []);
  const [e] = h.db.q("SELECT note, sponsor_id FROM webhook_events WHERE type = 'invoice.payment_failed'");
  assert.equal(e.note, 'payment_failed');
  assert.equal(e.sponsor_id, sponsorId);

  // A later successful retry brings it back from the retry time.
  const retry = paidUntil + DAY;
  h.clock.now = retry + 1000;
  await h.webhook(chargeSuccess({ reference: 'T_retry', paidAt: retry }));
  assert.equal(sponsor(h, sponsorId).paid_until, addMonthsUTC(retry, 1) + GRACE);
  assert.deepEqual(await feedNames(h), ['Bakkery Lekker']);
});

test('charges that do not match the sponsor are rejected (wrong plan, too cheap, wrong currency, no plan)', async () => {
  const h = createHarness();
  const prem = await signup(h, premiumBody());
  const cases = [
    ['plan_mismatch', { plan: PLAN_BLOCK, amount: 149900 }],
    ['amount_too_low', { plan: PLAN_PREMIUM, amount: 100 }],
    ['currency', { plan: PLAN_PREMIUM, amount: 149900, currency: 'NGN' }],
    ['no_plan', { plan: null, amount: 149900 }],
  ];
  for (const [i, [reason, opts]] of cases.entries()) {
    const res = await h.webhook(chargeSuccess({ reference: `T_bad_${i}`, paidAt: T0, metadata: { sponsorId: prem.sponsorId }, ...opts }));
    assert.equal(res.status, 200);
    const [e] = h.db.q('SELECT note FROM webhook_events ORDER BY rowid DESC LIMIT 1');
    assert.equal(e.note, `rejected:${reason}`);
  }
  assert.equal(sponsor(h, prem.sponsorId).status, 'pending');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 0);
});

test('unrelated charges on the same Paystack account are acknowledged but not stored', async () => {
  const h = createHarness();
  await signup(h);
  const res = await h.webhook(chargeSuccess({ reference: 'SHOP_1', paidAt: T0, plan: null, email: 'shopper@example.com', customerCode: 'CUS_shop' }));
  assert.equal(res.status, 200);
  const [e] = h.db.q('SELECT note, payload FROM webhook_events');
  assert.equal(e.note, 'unmatched');
  assert.equal(e.payload, null, 'no copy of another business\'s customer data');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 0);
});

test('unknown and malformed events are acknowledged', async () => {
  const h = createHarness();
  let res = await h.webhook({ event: 'transfer.success', data: { reference: 'x' } });
  assert.equal(res.status, 200);
  res = await h.webhook({ hello: 'world' });
  assert.equal(res.status, 200);
  res = await h.webhook({ event: 'invoice.create', data: { paid: false, subscription: { subscription_code: 'SUB_none' } } });
  assert.equal(res.status, 200);
});

test('a handler failure answers 500 (Paystack retries) and the retry succeeds', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  const evt = chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } });
  const realPrepare = h.db.prepare.bind(h.db);
  h.db.prepare = (sql) => {
    if (sql.includes('INSERT INTO payments')) throw new Error('D1 overloaded');
    return realPrepare(sql);
  };
  let res = await h.webhook(evt);
  assert.equal(res.status, 500);
  assert.equal(h.db.q('SELECT handled FROM webhook_events')[0].handled, 0);
  h.db.prepare = realPrepare;
  res = await h.webhook(evt);
  assert.equal(res.status, 200);
  assert.equal(sponsor(h, sponsorId).status, 'active');
  assert.equal(h.db.q('SELECT handled FROM webhook_events')[0].handled, 1);
});

test('optional Paystack IP allowlist', async () => {
  const h = createHarness({ PAYSTACK_IP_ALLOWLIST: 'true' });
  const evt = { event: 'transfer.success', data: {} };
  const { createHmac } = await import('node:crypto');
  const raw = JSON.stringify(evt);
  const sig = createHmac('sha512', 'sk_test_0123456789abcdef0123456789abcdef').update(raw).digest('hex');
  const send = (ip) => h.request('POST', '/paystack/webhook', {
    rawBody: raw, ip, origin: null, headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
  });
  assert.equal((await send('198.51.100.1')).status, 401);
  assert.equal((await send('52.31.139.75')).status, 200);
});

test('webhook rejects other methods and has no CORS', async () => {
  const h = createHarness();
  const res = await h.request('GET', '/paystack/webhook');
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('two sponsorships on one customer + plan: the invoice\'s subscription code corrects a wrong guess', async () => {
  const h = createHarness();
  const a = await signup(h);
  h.clock.now = T0 + 10 * DAY;
  const b = await signup(h, signupBody({ name: 'Tweede Naam' })); // same e-mail -> same Paystack customer
  await h.webhook(chargeSuccess({ reference: a.reference, paidAt: T0, metadata: { sponsorId: a.sponsorId } }));
  await h.webhook(subscriptionCreate({ code: 'SUB_A', token: 'tok_A' }));
  await h.webhook(chargeSuccess({ reference: b.reference, paidAt: T0 + 10 * DAY, metadata: { sponsorId: b.sponsorId } }));
  await h.webhook(subscriptionCreate({ code: 'SUB_B', token: 'tok_B' }));
  assert.equal(sponsor(h, a.sponsorId).paystack_subscription, 'SUB_A');
  assert.equal(sponsor(h, b.sponsorId).paystack_subscription, 'SUB_B');
  const aUntil = sponsor(h, a.sponsorId).paid_until;

  // A's renewal failed, so A has the earliest paid_until; B's renewal (no metadata) gets guessed onto A...
  const renewB = addMonthsUTC(T0 + 10 * DAY, 1);
  h.clock.now = renewB + 1000;
  await h.webhook(chargeSuccess({ reference: 'T_B2', paidAt: renewB }));
  assert.equal(h.db.q("SELECT sponsor_id FROM payments WHERE reference = 'T_B2'")[0].sponsor_id, a.sponsorId);

  // ...until the invoice names the subscription: the payment moves and A falls back to what A paid.
  await h.webhook(invoiceEvent('invoice.update', { code: 'SUB_B', reference: 'T_B2', paidAt: renewB, invoice: 'INV_B2' }));
  assert.equal(h.db.q("SELECT sponsor_id FROM payments WHERE reference = 'T_B2'")[0].sponsor_id, b.sponsorId);
  assert.equal(sponsor(h, a.sponsorId).paid_until, aUntil);
  assert.equal(sponsor(h, b.sponsorId).paid_until, addMonthsUTC(T0 + 10 * DAY, 2) + GRACE);
});
