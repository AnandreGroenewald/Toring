import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, signupBody, chargeSuccess, T0, DAY } from './support/harness.js';

test('scheduled(): abandons stale checkouts, scrubs contact data, prunes payloads, keeps payments', async () => {
  const h = createHarness();
  const stale = (await h.request('POST', '/subscribe', { body: signupBody({ email: 'stale@example.com', name: 'Ou Winkel' }) })).json;
  const paid = (await h.request('POST', '/subscribe', { body: signupBody() })).json;
  await h.webhook(chargeSuccess({ reference: paid.reference, paidAt: T0, metadata: { sponsorId: paid.sponsorId } }));

  // Day 8: the unpaid checkout is abandoned but still has its contact details.
  h.clock.now = T0 + 8 * DAY;
  const fresh = (await h.request('POST', '/subscribe', { body: signupBody({ email: 'fresh@example.com', name: 'Nuwe Winkel' }) })).json;
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  const row = (id) => h.db.q('SELECT * FROM sponsors WHERE id = ?', id)[0];
  assert.equal(row(stale.sponsorId).status, 'abandoned');
  assert.equal(row(stale.sponsorId).email, 'stale@example.com');
  assert.equal(row(fresh.sponsorId).status, 'pending', 'recent checkouts are left alone');
  assert.equal(row(paid.sponsorId).status, 'active');
  assert.ok(h.logs.some((l) => l.event === 'retention' && l.abandoned === 1));

  // Day 31: contact details of the abandoned checkout are gone.
  h.clock.now = T0 + 31 * DAY;
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  const s = row(stale.sponsorId);
  assert.equal(s.email, '');
  assert.equal(s.contact_name, null);
  assert.equal(s.phone, null);
  assert.equal(h.db.q('SELECT ip_hash FROM consents WHERE sponsor_id = ?', stale.sponsorId)[0].ip_hash, null);
  assert.equal(row(paid.sponsorId).email, 'anna@example.co.za', 'paying sponsors keep their details');

  // Day 91: stored webhook payloads are pruned; the dedupe rows and payments stay.
  h.clock.now = T0 + 91 * DAY;
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM webhook_events WHERE payload IS NOT NULL')[0].n, 0);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM webhook_events')[0].n, 1);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 1);

  // Day 401: old webhook rows are deleted; payments are never pruned.
  h.clock.now = T0 + 401 * DAY;
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM webhook_events')[0].n, 0);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 1);
});

test('scheduled(): cancelled sponsorships end once paid_until passes', async () => {
  const h = createHarness();
  const { sponsorId, reference } = (await h.request('POST', '/subscribe', { body: signupBody() })).json;
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  h.db.db.prepare("UPDATE sponsors SET status = 'cancelling'").run();
  const paidUntil = h.db.q('SELECT paid_until FROM sponsors')[0].paid_until;
  h.clock.now = paidUntil - 1;
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  assert.equal(h.db.q('SELECT status FROM sponsors')[0].status, 'cancelling');
  h.clock.now = paidUntil + 1;
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  assert.equal(h.db.q('SELECT status FROM sponsors')[0].status, 'ended');
});

test('scheduled(): uses waitUntil and never throws', async () => {
  const h = createHarness();
  let waited = null;
  await h.worker.scheduled({}, h.env, { waitUntil(p) { waited = p; } });
  assert.ok(waited instanceof Promise);
  await h.worker.scheduled({}, { ...h.env, DB: { batch: () => Promise.reject(new Error('down')), prepare: () => ({ bind: () => ({}) }) } }, {});
  assert.ok(h.logs.some((l) => l.event === 'retention_failed'));
});
