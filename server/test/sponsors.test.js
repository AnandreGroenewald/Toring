import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, signupBody, premiumBody, chargeSuccess, PLAN_PREMIUM, T0, DAY } from './support/harness.js';

async function paidSponsor(h, body, { amount = 4900, plan } = {}) {
  const res = await h.request('POST', '/subscribe', { body, ip: `10.1.1.${Math.floor(Math.random() * 250)}` });
  assert.equal(res.status, 200, res.text);
  const { sponsorId, reference } = res.json;
  await h.webhook(chargeSuccess({ reference, paidAt: h.clock.now, amount, plan, email: body.email, customerCode: `CUS_${sponsorId.slice(0, 6)}`, metadata: { sponsorId } }));
  return sponsorId;
}

function deepStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) deepStrings(v, out);
  return out;
}

test('/sponsors lists only live sponsors with public fields, never contact data', async () => {
  const h = createHarness();
  const a = await paidSponsor(h, signupBody({ name: 'Bakkery Lekker', email: 'anna@example.co.za' }));
  const b = await paidSponsor(h, signupBody({ name: 'Versteek My', email: 'hide@example.com' }));
  const c = await paidSponsor(h, signupBody({ name: 'Nog Nie Goed', email: 'wait@example.com' }));
  const p = await paidSponsor(h, premiumBody(), { amount: 149900, plan: PLAN_PREMIUM });
  await h.request('POST', '/subscribe', { body: signupBody({ name: 'Nooit Betaal', email: 'pending@example.com' }) });
  h.db.db.prepare('UPDATE sponsors SET hidden = 1 WHERE id = ?').run(b);
  h.db.db.prepare('UPDATE sponsors SET approved = 0 WHERE id = ?').run(c);
  h.clock.now += 60_000;

  const res = await h.request('GET', '/sponsors', { origin: 'https://anyone.example' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=300');
  assert.equal(res.json.updatedAt, new Date(h.clock.now).toISOString());
  assert.deepEqual(res.json.block, [{ id: a, name: 'Bakkery Lekker' }]);
  assert.deepEqual(res.json.premium, [{ id: p, name: 'Kaap Motors', tagline: 'Betroubare karre sedert 1985', url: 'https://kaapmotors.co.za/' }]);

  const strings = deepStrings(res.json);
  assert.ok(!res.text.includes('@'), 'no e-mail address anywhere in the response');
  for (const secret of ['Anna Smit', '082 123 4567', 'CUS_', 'stp-', 'PLN_']) {
    assert.ok(!strings.some((s) => s.includes(secret)), `"${secret}" must not leak`);
  }
});

test('/sponsors drops a sponsor the moment paid_until passes', async () => {
  const h = createHarness();
  await paidSponsor(h, signupBody());
  const paidUntil = h.db.q('SELECT paid_until FROM sponsors')[0].paid_until;
  h.clock.now = paidUntil - 60_000;
  assert.equal((await h.request('GET', '/sponsors')).json.block.length, 1);
  h.clock.now = paidUntil + 1;
  assert.equal((await h.request('GET', '/sponsors')).json.block.length, 0);
});

test('/sponsors is cached briefly in memory and refreshed after writes', async () => {
  const h = createHarness();
  const first = await h.request('GET', '/sponsors');
  assert.deepEqual(first.json.block, []);
  const reads = h.db.queries;
  await h.request('GET', '/sponsors');
  assert.equal(h.db.queries, reads, 'second read served from memory');
  await paidSponsor(h, signupBody());
  const after = await h.request('GET', '/sponsors');
  assert.equal(after.json.block.length, 1, 'a webhook write invalidates the cache');
});

test('/availability is public and reflects capacity', async () => {
  const h = createHarness();
  let res = await h.request('GET', '/availability', { origin: 'https://anyone.example' });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(res.json, { premium: { available: true }, block: { available: true } });
  await paidSponsor(h, premiumBody(), { amount: 149900, plan: PLAN_PREMIUM });
  h.clock.now += 60_000;
  res = await h.request('GET', '/availability');
  assert.deepEqual(res.json, { premium: { available: false }, block: { available: true } });
  h.clock.now = T0 + 40 * DAY;
  res = await h.request('GET', '/availability');
  assert.equal(res.json.premium.available, true);
});

test('public preflight, unknown routes and wrong methods', async () => {
  const h = createHarness();
  let res = await h.request('OPTIONS', '/sponsors', { origin: 'https://x.example' });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  res = await h.request('POST', '/sponsors', { body: {} });
  assert.equal(res.status, 405);
  res = await h.request('GET', '/nope');
  assert.equal(res.status, 404);
  assert.equal(res.json.error, 'not_found');
  res = await h.request('GET', '/');
  assert.equal(res.json.ok, true);
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('missing D1 binding -> 503 not_configured instead of a crash', async () => {
  const h = createHarness();
  const res = await h.worker.fetch(new Request('https://api.test/sponsors'), { ...h.env, DB: undefined });
  assert.equal(res.status, 503);
});
