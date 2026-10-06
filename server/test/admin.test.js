import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, signupBody, chargeSuccess, subscriptionCreate, ADMIN, ORIGIN, T0, DAY } from './support/harness.js';
import { addMonthsUTC } from '../src/entitlement.js';

async function paidWithSubscription(h) {
  const res = await h.request('POST', '/subscribe', { body: signupBody() });
  const { sponsorId, reference } = res.json;
  await h.webhook(chargeSuccess({ reference, paidAt: T0, metadata: { sponsorId } }));
  await h.webhook(subscriptionCreate({}));
  h.paystack.subscriptions.set('SUB_anna', { email_token: 'tok_anna', status: 'active' });
  return sponsorId;
}

test('admin auth: missing, malformed, wrong and right token', async () => {
  const h = createHarness();
  let res = await h.admin('GET', '/admin/sponsors', undefined, null);
  assert.equal(res.status, 401);
  assert.equal(res.json.error, 'unauthorized');
  res = await h.request('GET', '/admin/sponsors', { headers: { Authorization: `Basic ${ADMIN}` } });
  assert.equal(res.status, 401);
  res = await h.admin('GET', '/admin/sponsors', undefined, ADMIN.slice(0, -1));
  assert.equal(res.status, 401);
  res = await h.admin('GET', '/admin/sponsors', undefined, `${ADMIN}x`);
  assert.equal(res.status, 401);
  res = await h.admin('GET', '/admin/sponsors');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.sponsors, []);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  // Unknown admin paths are hidden behind auth too.
  res = await h.admin('GET', '/admin/whatever', undefined, null);
  assert.equal(res.status, 401);
});

test('admin is disabled when ADMIN_TOKEN is missing or too short', async () => {
  for (const token of ['', 'short-token']) {
    const h = createHarness({ ADMIN_TOKEN: token });
    const res = await h.admin('GET', '/admin/sponsors', undefined, token || 'x');
    assert.equal(res.status, 503);
    assert.equal(res.json.error, 'admin_disabled');
  }
});

test('admin preflight allows Authorization from the site origin only', async () => {
  const h = createHarness();
  let res = await h.request('OPTIONS', '/admin/sponsors');
  assert.equal(res.status, 204);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  assert.match(res.headers.get('Access-Control-Allow-Methods'), /PATCH/);
  res = await h.request('OPTIONS', '/admin/sponsors', { origin: 'https://evil.example' });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('GET /admin/sponsors includes contact + Paystack fields and a live flag', async () => {
  const h = createHarness();
  const id = await paidWithSubscription(h);
  const res = await h.admin('GET', '/admin/sponsors');
  const [s] = res.json.sponsors;
  assert.equal(s.id, id);
  assert.equal(s.email, 'anna@example.co.za');
  assert.equal(s.contact_name, 'Anna Smit');
  assert.equal(s.phone, '082 123 4567');
  assert.equal(s.paystack_customer, 'CUS_anna');
  assert.equal(s.paystack_subscription, 'SUB_anna');
  assert.equal(s.live, true);
});

test('POST /admin/sponsors adds a manual sponsor that is live until the given date', async () => {
  const h = createHarness();
  let res = await h.admin('POST', '/admin/sponsors', {
    tier: 'premium', name: 'sportscard.co.za', tagline: 'Kaarte vir kenners', url: 'https://sportscard.co.za',
    email: 'eienaar@example.com', paid_until: '2026-12-31', notes: 'EFT ontvang',
  });
  assert.equal(res.status, 400, 'still no domains in a name, even for the owner');
  assert.equal(res.json.error, 'name_rejected');

  res = await h.admin('POST', '/admin/sponsors', {
    tier: 'premium', name: 'Sportscard', tagline: 'Kaarte vir kenners', url: 'https://sportscard.co.za',
    email: 'eienaar@example.com', paid_until: '2026-12-31', notes: 'EFT ontvang',
  });
  assert.equal(res.status, 201, res.text);
  const s = res.json.sponsor;
  assert.equal(s.manual, 1);
  assert.equal(s.status, 'active');
  assert.equal(s.approved, 1);
  assert.equal(s.name, 'Sportscard', 'owner may use reserved words');
  assert.equal(new Date(s.paid_until).toISOString(), '2026-12-31T21:59:59.999Z', 'end of the day in SA time');
  assert.equal(s.live, true);
  h.clock.now += 60_000;
  const feed = await h.request('GET', '/sponsors');
  assert.equal(feed.json.premium[0].name, 'Sportscard');

  res = await h.admin('POST', '/admin/sponsors', { tier: 'block', name: 'Geen Datum' });
  assert.equal(res.json.error, 'invalid_field');
  res = await h.admin('POST', '/admin/sponsors', { tier: 'gold', name: 'X Y', paid_until: '2026-12-31' });
  assert.equal(res.json.error, 'invalid_tier');
  res = await h.admin('POST', '/admin/sponsors', { tier: 'block', name: 'X Y', paid_until: '2026-02-30' });
  assert.equal(res.json.error, 'invalid_field');
});

test('PATCH /admin/sponsors/:id hides, approves, edits and extends', async () => {
  const h = createHarness();
  const id = await paidWithSubscription(h);
  let res = await h.admin('PATCH', `/admin/sponsors/${id}`, { hidden: true });
  assert.equal(res.status, 200);
  assert.equal(res.json.sponsor.hidden, 1);
  assert.equal(res.json.sponsor.live, false);
  h.clock.now += 60_000;
  assert.equal((await h.request('GET', '/sponsors')).json.block.length, 0);

  res = await h.admin('PATCH', `/admin/sponsors/${id}`, { hidden: false, name: 'Nuwe Naam', notes: 'Naam verander op versoek' });
  assert.equal(res.json.sponsor.name, 'Nuwe Naam');
  assert.equal(res.json.sponsor.live, true);

  // Extending: the admin date acts as a minimum on top of what was paid.
  const paid = addMonthsUTC(T0, 1) + 3 * DAY;
  res = await h.admin('PATCH', `/admin/sponsors/${id}`, { paid_until: paid + 10 * DAY });
  assert.equal(res.json.sponsor.paid_until, paid + 10 * DAY);
  res = await h.admin('PATCH', `/admin/sponsors/${id}`, { paid_until: T0 });
  assert.equal(res.json.sponsor.paid_until, paid, 'cannot shorten below what was paid; hide or cancel instead');

  res = await h.admin('PATCH', `/admin/sponsors/${id}`, { status: 'bogus' });
  assert.equal(res.status, 400);
  res = await h.admin('PATCH', `/admin/sponsors/${id}`, { approved: 'maybe' });
  assert.equal(res.status, 400);
  res = await h.admin('PATCH', `/admin/sponsors/${id}`, {});
  assert.equal(res.status, 400);
  res = await h.admin('PATCH', '/admin/sponsors/00000000-0000-4000-8000-000000000000', { hidden: true });
  assert.equal(res.status, 404);
  res = await h.admin('PATCH', `/admin/sponsors/${id}`, { email: 'nuut@example.com', id: 'hijack', paid_at: 1 });
  assert.equal(res.json.sponsor.email, 'nuut@example.com');
  assert.equal(res.json.sponsor.id, id, 'unknown fields are ignored');
});

test('POST /admin/sponsors/:id/cancel disables at Paystack; stays live until paid_until', async () => {
  const h = createHarness();
  const id = await paidWithSubscription(h);
  h.db.db.prepare('UPDATE sponsors SET paystack_email_token = NULL WHERE id = ?').run(id); // fetched on demand
  h.clock.now = T0 + 5 * DAY;
  const res = await h.admin('POST', `/admin/sponsors/${id}/cancel`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.sponsor.status, 'cancelling');
  assert.equal(res.json.sponsor.live, true);
  const disable = h.paystack.calls.find((c) => c.path === '/subscription/disable');
  assert.deepEqual(disable.body, { code: 'SUB_anna', token: 'tok_anna' });

  // Paystack then sends subscription.disable: the paid month is still honoured.
  const { subscriptionEvent } = await import('./support/harness.js');
  await h.webhook(subscriptionEvent('subscription.disable', {}));
  assert.equal(h.db.q('SELECT status FROM sponsors')[0].status, 'cancelling');
});

test('cancel with immediate=true ends the sponsorship now; Paystack errors surface as 502', async () => {
  const h = createHarness();
  const id = await paidWithSubscription(h);
  h.paystack.subscriptions.get('SUB_anna').email_token = 'tok_other'; // Paystack will refuse
  let res = await h.admin('POST', `/admin/sponsors/${id}/cancel`, { immediate: true });
  assert.equal(res.status, 502);
  assert.equal(res.json.error, 'paystack_error');
  assert.equal(h.db.q('SELECT status FROM sponsors')[0].status, 'active', 'nothing changed locally');

  h.paystack.subscriptions.get('SUB_anna').email_token = 'tok_anna';
  res = await h.admin('POST', `/admin/sponsors/${id}/cancel`, { immediate: true });
  assert.equal(res.status, 200);
  assert.equal(res.json.sponsor.status, 'ended');
  assert.equal(res.json.sponsor.live, false);
});

test('cancel on a manual sponsor needs no Paystack call', async () => {
  const h = createHarness();
  const created = await h.admin('POST', '/admin/sponsors', { tier: 'block', name: 'Hand Matig', paid_until: T0 + 10 * DAY });
  const res = await h.admin('POST', `/admin/sponsors/${created.json.sponsor.id}/cancel`, { immediate: true });
  assert.equal(res.json.sponsor.status, 'ended');
  assert.equal(h.paystack.calls.length, 0);
});

test('POST /admin/sponsors/:id/manage-link returns the Paystack link', async () => {
  const h = createHarness();
  const id = await paidWithSubscription(h);
  let res = await h.admin('POST', `/admin/sponsors/${id}/manage-link`);
  assert.equal(res.status, 200);
  assert.equal(res.json.link, 'https://paystack.com/manage/subscriptions/SUB_anna');
  const manual = await h.admin('POST', '/admin/sponsors', { tier: 'block', name: 'Hand Matig', paid_until: T0 + DAY });
  res = await h.admin('POST', `/admin/sponsors/${manual.json.sponsor.id}/manage-link`);
  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'no_subscription');
});

test('DELETE /admin/sponsors/:id refuses while billing is active unless forced', async () => {
  const h = createHarness();
  const id = await paidWithSubscription(h);
  let res = await h.admin('DELETE', `/admin/sponsors/${id}`);
  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'cancel_first');
  res = await h.admin('DELETE', `/admin/sponsors/${id}?force=1`);
  assert.equal(res.status, 200);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM sponsors')[0].n, 0);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM consents')[0].n, 0, 'consents removed with the sponsor');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM payments')[0].n, 1, 'payments kept for accounting');
  res = await h.admin('DELETE', `/admin/sponsors/${id}`);
  assert.equal(res.status, 404);
});

test('GET /admin/payments and /admin/events', async () => {
  const h = createHarness();
  await paidWithSubscription(h);
  let res = await h.admin('GET', '/admin/payments');
  assert.equal(res.status, 200);
  assert.equal(res.json.payments.length, 1);
  assert.equal(res.json.payments[0].sponsor_name, 'Bakkery Lekker');
  assert.equal(res.json.payments[0].amount, 4900);

  res = await h.admin('GET', '/admin/events?limit=1');
  assert.equal(res.json.events.length, 1);
  assert.equal(res.json.events[0].type, 'subscription.create');
  assert.equal(typeof res.json.events[0].payload, 'object');
  res = await h.admin('GET', '/admin/events?limit=abc');
  assert.equal(res.json.events.length, 2);

  res = await h.admin('POST', '/admin/payments', {});
  assert.equal(res.status, 405);
});
