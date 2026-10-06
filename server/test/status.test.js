import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, signupBody, chargeSuccess, PLAN_BLOCK, T0, DAY } from './support/harness.js';
import { addMonthsUTC } from '../src/entitlement.js';

async function signup(h) {
  const res = await h.request('POST', '/subscribe', { body: signupBody() });
  assert.equal(res.status, 200, res.text);
  return res.json;
}

function verifyData({ reference, sponsorId, status = 'success', paidAt = T0, amount = 4900, plan = PLAN_BLOCK }) {
  return {
    id: 1, status, reference, amount, currency: 'ZAR', paid_at: new Date(paidAt).toISOString(),
    metadata: { sponsorId, tier: 'block' },
    customer: { email: 'anna@example.co.za', customer_code: 'CUS_anna' },
    plan, plan_object: { plan_code: plan, amount, interval: 'monthly' },
  };
}

const statusUrl = (id, ref) => `/status?sponsor=${id}&reference=${ref}`;

test('/status verifies with Paystack and activates idempotently', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);

  // Not paid yet: Paystack reports the checkout as abandoned/ongoing.
  h.paystack.transactions.set(reference, verifyData({ reference, sponsorId, status: 'abandoned' }));
  let res = await h.request('GET', statusUrl(sponsorId, reference));
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'pending');

  // Paid.
  h.clock.now += 5000;
  h.paystack.transactions.set(reference, verifyData({ reference, sponsorId }));
  res = await h.request('GET', statusUrl(sponsorId, reference));
  assert.deepEqual(Object.keys(res.json).sort(), ['liveFrom', 'name', 'needsApproval', 'paidUntil', 'status', 'tier']);
  assert.equal(res.json.status, 'active');
  assert.equal(res.json.name, 'Bakkery Lekker');
  assert.equal(res.json.tier, 'block');
  assert.equal(res.json.needsApproval, false);
  assert.equal(res.json.liveFrom, new Date(T0).toISOString());
  const paidUntil = h.db.q('SELECT paid_until FROM sponsors')[0].paid_until;
  assert.equal(paidUntil, addMonthsUTC(T0, 1) + 3 * DAY);
  assert.equal(h.db.q("SELECT source FROM payments")[0].source, 'verify');

  // The webhook for the same charge arrives later: nothing changes.
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  assert.equal(h.db.q('SELECT paid_until FROM sponsors')[0].paid_until, paidUntil);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 1);

  // Once active, /status no longer calls Paystack.
  const verifies = h.paystack.calls.filter((c) => c.path.startsWith('/transaction/verify')).length;
  h.clock.now += 10_000;
  res = await h.request('GET', statusUrl(sponsorId, reference));
  assert.equal(res.json.status, 'active');
  assert.equal(h.paystack.calls.filter((c) => c.path.startsWith('/transaction/verify')).length, verifies);
});

test('/status reports failed payments and needsApproval', async () => {
  const h = createHarness({ AUTO_APPROVE: 'false' });
  const { sponsorId, reference } = await signup(h);
  h.paystack.transactions.set(reference, verifyData({ reference, sponsorId, status: 'failed' }));
  let res = await h.request('GET', statusUrl(sponsorId, reference));
  assert.equal(res.json.status, 'failed');
  assert.equal(res.json.needsApproval, true);

  h.clock.now += 5000;
  h.paystack.transactions.set(reference, verifyData({ reference, sponsorId }));
  res = await h.request('GET', statusUrl(sponsorId, reference));
  assert.equal(res.json.status, 'active');
  assert.equal(res.json.needsApproval, true);
  assert.equal(res.json.liveFrom, null, 'not shown until the owner approves');
});

test('/status: wrong reference or unknown sponsor -> 404; malformed -> 400', async () => {
  const h = createHarness();
  const { sponsorId } = await signup(h);
  let res = await h.request('GET', statusUrl(sponsorId, 'stp-000000000000000000000000'));
  assert.equal(res.status, 404);
  res = await h.request('GET', statusUrl('00000000-0000-4000-8000-000000000000', 'stp-1'));
  assert.equal(res.status, 404);
  res = await h.request('GET', statusUrl('not-a-uuid', 'x'));
  assert.equal(res.status, 400);
  res = await h.request('GET', `/status?sponsor=${sponsorId}&reference=${encodeURIComponent('a b<')}`);
  assert.equal(res.status, 400);
  assert.equal(h.paystack.calls.filter((c) => c.path.startsWith('/transaction/verify')).length, 0);
});

test('/status: a verify for someone else\'s transaction cannot activate this sponsor', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  h.paystack.transactions.set(reference, verifyData({ reference, sponsorId: '11111111-1111-4111-8111-111111111111' }));
  const res = await h.request('GET', statusUrl(sponsorId, reference));
  assert.equal(res.json.status, 'pending');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 0);
});

test('/status: Paystack is throttled per sponsor and outages degrade to pending', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  await h.request('GET', statusUrl(sponsorId, reference));
  await h.request('GET', statusUrl(sponsorId, reference));
  await h.request('GET', statusUrl(sponsorId, reference));
  assert.equal(h.paystack.calls.filter((c) => c.path.startsWith('/transaction/verify')).length, 1);

  h.clock.now += 5000;
  const res = await h.request('GET', statusUrl(sponsorId, reference)); // fake returns 400 "not found"
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'pending');
});

test('/status accepts Paystack\'s trxref parameter name too', async () => {
  const h = createHarness();
  const { sponsorId, reference } = await signup(h);
  h.paystack.transactions.set(reference, verifyData({ reference, sponsorId }));
  const res = await h.request('GET', `/status?sponsor=${sponsorId}&trxref=${reference}`);
  assert.equal(res.json.status, 'active');
});
