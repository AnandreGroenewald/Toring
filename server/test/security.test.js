// Security and billing regression tests (T4). Each test pins down one attack or payment edge case
// that was open before the hardening pass.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createHarness, signupBody, premiumBody, chargeSuccess, subscriptionCreate, subscriptionEvent,
  PLAN_PREMIUM, ADMIN, ORIGIN, T0, DAY,
} from './support/harness.js';
import { addMonthsUTC, computePaidUntil } from '../src/entitlement.js';
import { loadConfig } from '../src/config.js';
import { checkName, checkUrl } from '../src/moderation.js';

const GRACE = 3 * DAY;
const MIN = 60 * 1000;
const sponsor = (h, id) => h.db.q('SELECT * FROM sponsors WHERE id = ?', id)[0];

async function signup(h, body = signupBody()) {
  const res = await h.request('POST', '/subscribe', { body });
  assert.equal(res.status, 200, res.text);
  return res.json;
}

async function feedNames(h) {
  h.clock.now += 60_000; // past the in-memory feed cache
  const res = await h.request('GET', '/sponsors');
  return [...res.json.block, ...res.json.premium].map((s) => s.name);
}

async function paidBlock(h, body, domain = 'live') {
  const { sponsorId, reference } = await signup(h, body);
  await h.webhook(chargeSuccess({ reference, paidAt: h.clock.now, metadata: { sponsorId }, domain }));
  return { sponsorId, reference };
}

const alerts = async (h) => (await h.admin('GET', '/admin/sponsors')).json.alerts;

// ------------------------------------------------------------------ webhooks

test('webhook: a re-serialised body (same JSON, different bytes) fails the signature', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  const evt = chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } });
  const sig = createHmac('sha512', 'fake-paystack-secret-for-tests').update(JSON.stringify(evt)).digest('hex');
  const res = await h.request('POST', '/paystack/webhook', {
    rawBody: JSON.stringify(evt, null, 2), origin: null,
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
  });
  assert.equal(res.status, 401);
  const noHeader = await h.request('POST', '/paystack/webhook', { rawBody: JSON.stringify(evt), origin: null });
  assert.equal(noHeader.status, 401);
  assert.equal(sponsor(h, sponsorId).status, 'pending');
});

test('refund.processed (full) stops the entitlement; a partial refund does not', async () => {
  const h = createHarness();
  const a = await paidBlock(h);
  const b = await paidBlock(h, signupBody({ name: 'Slaghuis Smit', email: 'piet@example.co.za' }));
  assert.deepEqual((await feedNames(h)).sort(), ['Bakkery Lekker', 'Slaghuis Smit']);

  const refund = (reference, amount, id) => ({
    event: 'refund.processed',
    data: { id, status: 'processed', transaction_reference: reference, refund_reference: `RF_${id}`, amount, currency: 'ZAR', domain: 'test' },
  });
  assert.equal((await h.webhook(refund(a.reference, 4900, 1))).status, 200);
  assert.equal((await h.webhook(refund(b.reference, 1000, 2))).status, 200);
  assert.deepEqual(await feedNames(h), ['Slaghuis Smit'], 'fully refunded sponsor is gone, partial stays');
  assert.equal(sponsor(h, a.sponsorId).paid_until, null);

  // Duplicate delivery changes nothing; a second partial refund that completes the amount does.
  await h.webhook(refund(b.reference, 1000, 2));
  assert.deepEqual(await feedNames(h), ['Slaghuis Smit']);
  await h.webhook(refund(b.reference, 3900, 3));
  assert.deepEqual(await feedNames(h), []);

  const pay = (await h.admin('GET', '/admin/payments')).json.payments.find((p) => p.reference === b.reference);
  assert.equal(pay.refunded, 4900);
});

test('a refund that arrives before its charge still wins (order-independent)', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  await h.webhook({ event: 'refund.processed', data: { id: 7, status: 'processed', transaction_reference: reference, amount: 4900, currency: 'ZAR' } });
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  assert.deepEqual(await feedNames(h), []);
});

test('chargeback: charge.dispute.create stops the ad and flags it; a won dispute restores it, a lost one does not', async () => {
  const h = createHarness();
  const a = await paidBlock(h);
  const dispute = (event, id, extra = {}) => ({
    event,
    data: { id, status: 'awaiting-merchant-feedback', resolution: null, refund_amount: 4900, currency: 'ZAR', transaction: { reference: a.reference, amount: 4900 }, ...extra },
  });
  await h.webhook(dispute('charge.dispute.create', 11));
  assert.deepEqual(await feedNames(h), []);
  const flagged = await alerts(h);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].kind, 'dispute');
  assert.equal(flagged[0].sponsor_id, a.sponsorId);

  await h.webhook(dispute('charge.dispute.resolve', 11, { status: 'resolved', resolution: 'declined' }));
  assert.deepEqual(await feedNames(h), ['Bakkery Lekker'], 'merchant won: entitlement back');
  // A late remind must not reopen a resolved dispute.
  await h.webhook(dispute('charge.dispute.remind', 11));
  assert.deepEqual(await feedNames(h), ['Bakkery Lekker']);

  const b = await paidBlock(h, signupBody({ name: 'Slaghuis Smit', email: 'piet@example.co.za' }));
  const lost = (event, extra = {}) => ({ event, data: { id: 12, status: 'resolved', resolution: 'merchant-accepted', transaction: { reference: b.reference }, ...extra } });
  await h.webhook(lost('charge.dispute.resolve'));
  await h.webhook(lost('charge.dispute.create', { status: 'awaiting-merchant-feedback', resolution: null }));
  assert.deepEqual(await feedNames(h), ['Bakkery Lekker'], 'chargeback lost (even out of order): no ad');
});

test('subscription.disable without a prior not_renew keeps the paid month (terms §3/§5), then lapses', async () => {
  const h = createHarness();
  const { sponsorId } = await paidBlock(h);
  await h.webhook(subscriptionCreate({}));
  h.clock.now = T0 + DAY;
  await h.webhook(subscriptionEvent('subscription.disable', {}));
  assert.equal(sponsor(h, sponsorId).status, 'cancelling');
  assert.deepEqual(await feedNames(h), ['Bakkery Lekker']);
  h.clock.now = sponsor(h, sponsorId).paid_until + 1;
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  assert.equal(sponsor(h, sponsorId).status, 'ended');
  assert.deepEqual(await feedNames(h), []);
});

// ------------------------------------------------------------------ entitlement

test('premium race: the hold expired, someone else paid first -> no second billboard, refund flagged, Paystack sub disabled', async () => {
  const h = createHarness();
  const a = await signup(h, premiumBody());
  h.clock.now = T0 + 31 * MIN; // A's checkout hold is over; A is still on Paystack's page
  const b = await signup(h, premiumBody({ name: 'Wes Motors', email: 'info@wesmotors.co.za', url: '' }));
  const paidPremium = (who, email, cust) => h.webhook(chargeSuccess({
    reference: who.reference, paidAt: h.clock.now, amount: 149900, plan: PLAN_PREMIUM, email, customerCode: cust, metadata: { sponsorId: who.sponsorId },
  }));
  await paidPremium(b, 'info@wesmotors.co.za', 'CUS_wes');
  h.clock.now += MIN;
  await paidPremium(a, 'info@kaapmotors.co.za', 'CUS_kaap');

  assert.deepEqual(await feedNames(h), ['Wes Motors'], 'only one billboard');
  assert.equal(sponsor(h, a.sponsorId).status, 'ended');
  const [flag] = await alerts(h);
  assert.equal(flag.kind, 'slot_taken');
  assert.equal(flag.sponsor_id, a.sponsorId);
  assert.equal(flag.reference, a.reference);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 2, 'the money is still on the books');

  // The buyer's callback page says so instead of "expired".
  const st = await h.request('GET', `/status?sponsor=${a.sponsorId}&reference=${a.reference}`);
  assert.equal(st.json.status, 'taken');

  // Paystack then creates A's subscription: we stop it at once so A is never billed again.
  h.paystack.subscriptions.set('SUB_kaap', { email_token: 'tok_kaap' });
  await h.webhook(subscriptionCreate({ code: 'SUB_kaap', token: 'tok_kaap', plan: PLAN_PREMIUM, email: 'info@kaapmotors.co.za', customerCode: 'CUS_kaap' }));
  assert.equal(h.paystack.subscriptions.get('SUB_kaap').status, 'cancelled');

  // The owner marks the flag as handled.
  const res = await h.admin('POST', `/admin/alerts/${encodeURIComponent(flag.id)}/resolve`);
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(await alerts(h), []);
});

test('premium: a checkout marked abandoned that pays later cannot take a slot someone else holds', async () => {
  const h = createHarness();
  const a = await signup(h, premiumBody());
  h.clock.now = T0 + 8 * DAY;
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  assert.equal(sponsor(h, a.sponsorId).status, 'abandoned');
  const b = await signup(h, premiumBody({ name: 'Wes Motors', email: 'info@wesmotors.co.za' }));
  await h.webhook(chargeSuccess({ reference: b.reference, paidAt: h.clock.now, amount: 149900, plan: PLAN_PREMIUM, customerCode: 'CUS_wes', metadata: { sponsorId: b.sponsorId } }));
  await h.webhook(chargeSuccess({ reference: a.reference, paidAt: h.clock.now, amount: 149900, plan: PLAN_PREMIUM, customerCode: 'CUS_kaap', metadata: { sponsorId: a.sponsorId } }));
  assert.deepEqual(await feedNames(h), ['Wes Motors']);
  assert.equal((await alerts(h))[0].kind, 'slot_taken');
  // The owner refunds in Paystack: the flag clears itself, the slot stays with the first payer.
  await h.webhook({ event: 'refund.processed', data: { id: 99, status: 'processed', transaction_reference: a.reference, amount: 149900, currency: 'ZAR' } });
  assert.deepEqual(await alerts(h), []);
  assert.deepEqual(await feedNames(h), ['Wes Motors']);
});

test('malformed ids in admin paths answer 404, not a server error', async () => {
  const h = createHarness();
  assert.equal((await h.admin('PATCH', '/admin/sponsors/%E0%A4%A', { hidden: true })).status, 404);
  assert.equal((await h.admin('POST', '/admin/alerts/%ZZ/resolve')).status, 404);
  assert.equal((await h.admin('POST', '/admin/alerts/nope/resolve')).status, 404);
});

test('/status verify cannot activate a premium sponsor past a full slot either', async () => {
  const h = createHarness();
  const a = await signup(h, premiumBody());
  h.clock.now = T0 + 31 * MIN;
  const b = await signup(h, premiumBody({ name: 'Wes Motors', email: 'info@wesmotors.co.za' }));
  await h.webhook(chargeSuccess({ reference: b.reference, paidAt: h.clock.now, amount: 149900, plan: PLAN_PREMIUM, customerCode: 'CUS_wes', metadata: { sponsorId: b.sponsorId } }));
  h.paystack.transactions.set(a.reference, {
    reference: a.reference, status: 'success', amount: 149900, currency: 'ZAR', paid_at: new Date(h.clock.now).toISOString(),
    plan: PLAN_PREMIUM, plan_object: { plan_code: PLAN_PREMIUM }, customer: { customer_code: 'CUS_kaap' }, metadata: { sponsorId: a.sponsorId },
  });
  h.clock.now += 10_000;
  const st = await h.request('GET', `/status?sponsor=${a.sponsorId}&reference=${a.reference}`);
  assert.equal(st.json.status, 'taken');
  assert.deepEqual(await feedNames(h), ['Wes Motors']);
});

test('test-mode keys: a live key refuses test charges; test payments stop counting once the key is live', async () => {
  const live = createHarness({ PAYSTACK_SECRET_KEY: 'sk_live_' + 'a'.repeat(40) });
  const { sponsorId, reference } = await signup(live);
  await live.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId }, domain: 'test' }));
  assert.equal(sponsor(live, sponsorId).status, 'pending');
  assert.equal(live.db.q('SELECT note FROM webhook_events')[0].note, 'rejected:test_mode');
  await live.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId }, domain: 'live' }));
  assert.equal(sponsor(live, sponsorId).status, 'active');

  // A sponsor "paid" with a test card while testing ...
  const h = createHarness({ PAYSTACK_SECRET_KEY: 'sk_test_' + 'b'.repeat(40) });
  const t = await paidBlock(h, undefined, 'test');
  assert.deepEqual(await feedNames(h), ['Bakkery Lekker']);
  assert.equal(h.db.q('SELECT source FROM payments')[0].source, 'webhook:test');
  assert.equal((await h.admin('GET', '/admin/sponsors')).json.paystackMode, 'test');
  // ... disappears at the next housekeeping run after the owner switches to the live key.
  h.env.PAYSTACK_SECRET_KEY = 'sk_live_' + 'c'.repeat(40);
  const liveEnv = { ...h.env };
  await h.worker.scheduled({}, liveEnv, { waitUntil() {} });
  assert.equal(sponsor(h, t.sponsorId).paid_until, null);
  const feed = await h.worker.fetch(new Request('https://api.test/sponsors'), liveEnv);
  assert.deepEqual((await feed.json()).block, []);
});

test('month arithmetic: months stay anchored to the first charge (31 Jan, leap years)', () => {
  const at = (s) => Date.parse(s);
  const opts = { graceDays: 0 };
  // Renewals on the last day of a short month must not drift the anchor to the 28th.
  assert.equal(computePaidUntil([at('2027-01-31T10:00:00Z'), at('2027-02-28T09:00:00Z')], opts), at('2027-03-31T10:00:00Z'));
  assert.equal(computePaidUntil([at('2027-01-31T10:00:00Z'), at('2027-02-28T09:00:00Z'), at('2027-03-31T09:00:00Z')], opts),
    at('2027-04-30T10:00:00Z'));
  // Leap years.
  assert.equal(computePaidUntil([at('2028-01-31T10:00:00Z')], opts), at('2028-02-29T10:00:00Z'));
  assert.equal(addMonthsUTC(at('2028-02-29T10:00:00Z'), 12), at('2029-02-28T10:00:00Z'));
  // A lapse starts a new month chain at the late charge.
  assert.equal(computePaidUntil([at('2027-01-31T10:00:00Z'), at('2027-04-15T08:00:00Z')], opts), at('2027-05-15T08:00:00Z'));
  // A renewal a few hours after the period ended (inside the grace days) is the same billing cycle.
  assert.equal(computePaidUntil([at('2027-01-31T10:00:00Z'), at('2027-02-28T14:00:00Z')], { graceDays: 3 }), at('2027-03-31T10:00:00Z') + GRACE);
  // Order doesn't matter; grace is added once.
  const ts = [at('2027-03-31T10:00:00Z'), at('2027-01-31T10:00:00Z'), at('2027-02-28T09:00:00Z')];
  assert.equal(computePaidUntil(ts, { graceDays: 3 }), at('2027-04-30T10:00:00Z') + GRACE);
});

// ------------------------------------------------------------------ admin

test('admin: wrong tokens are rate limited per address (brute force), other addresses unaffected', async () => {
  const h = createHarness();
  for (let i = 0; i < 20; i++) {
    const res = await h.admin('GET', '/admin/sponsors', undefined, 'z'.repeat(44));
    assert.equal(res.status, 401);
  }
  const blocked = await h.admin('GET', '/admin/sponsors', undefined, ADMIN);
  assert.equal(blocked.status, 429, 'even the right token waits after 20 misses');
  const other = await h.request('GET', '/admin/sponsors', { ip: '203.0.113.9', headers: { Authorization: `Bearer ${ADMIN}` } });
  assert.equal(other.status, 200);
  h.clock.now += 61 * MIN;
  assert.equal((await h.admin('GET', '/admin/sponsors')).status, 200);
  assert.ok(!JSON.stringify(h.logs).includes(ADMIN), 'the token never reaches the logs');
});

test('admin routes: CORS only for site origins, no token in errors', async () => {
  const h = createHarness();
  const res = await h.request('GET', '/admin/sponsors', { origin: 'https://evil.example', headers: { Authorization: `Bearer ${ADMIN}` } });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  const pre = await h.request('OPTIONS', '/admin/sponsors', { origin: 'https://evil.example' });
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), null);
  const bad = await h.admin('GET', '/admin/sponsors', undefined, 'q'.repeat(40));
  assert.deepEqual(bad.json, { error: 'unauthorized' });
});

test('config: the address-hash salt never falls back to a public constant when a secret exists', () => {
  assert.equal(loadConfig({ PAYSTACK_SECRET_KEY: 'sk_test_x' }).ipSalt, 'sk_test_x');
  assert.equal(loadConfig({ PAYSTACK_SECRET_KEY: 'sk_live_x' }).paystackMode, 'live');
});

// ------------------------------------------------------------------ anonymous counts

test('/stats and /score need the site Origin (no Origin = a script, not the game)', async () => {
  const h = createHarness();
  const body = { dateKey: '2026-10-06', mode: 'practice' };
  assert.equal((await h.request('POST', '/stats', { body, origin: null })).status, 403);
  assert.equal((await h.request('POST', '/score', { body: { dateKey: '2026-10-06', dayNumber: 1, heightM: 5 }, origin: null })).status, 403);
  assert.equal((await h.request('GET', '/score?dateKey=2026-10-06&heightM=5', { origin: null })).status, 403);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM stats_daily')[0].n, 0);
  assert.equal((await h.request('POST', '/stats', { body })).status, 200);
});

test('/stats are added up in memory and written in one batch per flush interval (D1 write budget)', async () => {
  const h = createHarness({ STATS_FLUSH_SECONDS: '60' });
  const writes = () => h.db.q('SELECT COALESCE(SUM(count), 0) AS n FROM stats_daily')[0].n;
  const body = { dateKey: '2026-10-06', mode: 'daily', menu: true };
  for (let i = 0; i < 9; i++) {
    assert.equal((await h.request('POST', '/stats', { body, ip: `198.51.100.${i}` })).status, 200);
    h.clock.now += 1000;
  }
  const first = writes();
  assert.ok(first <= 2, `at most the first request is written straight away (got ${first})`);
  h.clock.now += 60_000;
  await h.request('POST', '/stats', { body });
  const rows = Object.fromEntries(h.db.q('SELECT metric, count FROM stats_daily').map((r) => [r.metric, r.count]));
  assert.deepEqual(rows, { games_daily: 10, menu_views: 10 });
});

// ------------------------------------------------------------------ moderation

test('moderation: look-alike letters, spacing and stretching tricks are refused', () => {
  for (const name of ['ꜰᴜᴄᴋ', 'ƒuck', 'ɴɪɢɢᴇʀ', 'Ｆｕｃｋ', '𝐟𝐮𝐜𝐤', 'fu​ck', 'fu‮ck', 'f̶uck', 'S H I T', 'P.O.E.S',
    'Ka K', 'Shiiit Happens', 'Sexxx', 'Phuk', 'føk', 'Fuc King', 'fu-cking', 'Pornhub', 'Cuntface', 'MotherFucker', 'sh1t', 'Kont Winkel']) {
    assert.equal(checkName(name).ok, false, name);
  }
});

test('moderation: innocent names with a bad word inside them are allowed (Scunthorpe)', () => {
  for (const name of ['Scunthorpe Motors', 'Top Ornaments', 'Hot Notes', 'Who Reads', 'Glass Holes', 'Mother Farm', 'Swanker',
    'Phokeng Bakkery', 'Kaak Kliniek', 'Café Ølberg', 'Ærø Sjokolade', '’n Plek', 'Hoërskool Wes', 'Fokus Fiks', 'Niger Delta']) {
    const r = checkName(name);
    assert.equal(r.ok, true, `${name}: ${r.reason}`);
  }
  assert.equal(checkUrl('https://scunthorpe.co.uk').ok, true);
  assert.equal(checkUrl('https://f-u-c-k.co.za').ok, false);
});

// ------------------------------------------------------------------ secrets

test('no Paystack keys, admin tokens or D1 ids are committed', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const skip = new Set(['node_modules', '.git', 'lib', 'icons']);
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) walk(path);
      else if (st.size < 2_000_000 && /\.(js|mjs|json|toml|html|md|sql|txt|css|yml|yaml)$/.test(name)) {
        const text = readFileSync(path, 'utf8');
        if (/\b[sp]k_(live|test)_[A-Za-z0-9]{20,}/.test(text)) hits.push(path);
        if (/database_id\s*=\s*"[0-9a-f]{8}-[0-9a-f]{4}/.test(text)) hits.push(path);
        if (/ADMIN_TOKEN\s*=\s*["'][^"'<]{16,}/.test(text)) hits.push(path);
      }
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
});

test('site origin check is exact (no suffix tricks)', async () => {
  const h = createHarness();
  for (const origin of [`${ORIGIN}.evil.example`, 'http://localhost.evil.example:80', 'null']) {
    const res = await h.request('POST', '/subscribe', { body: signupBody(), origin });
    assert.equal(res.status, 403, origin);
  }
});
