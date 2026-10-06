import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHarness, signupBody, premiumBody, ORIGIN, SITE, PLAN_BLOCK, PLAN_PREMIUM, T0, DAY,
} from './support/harness.js';

test('subscribe happy path: pending sponsor, consent, Paystack checkout with plan + metadata', async () => {
  const h = createHarness();
  const res = await h.request('POST', '/subscribe', { body: signupBody() });
  assert.equal(res.status, 200, res.text);
  assert.match(res.json.url, /^https:\/\/checkout\.paystack\.com\//);
  assert.match(res.json.sponsorId, /^[0-9a-f-]{36}$/);
  assert.match(res.json.reference, /^stp-[0-9a-f]{24}$/);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  const [s] = h.db.q('SELECT * FROM sponsors');
  assert.equal(s.id, res.json.sponsorId);
  assert.equal(s.status, 'pending');
  assert.equal(s.tier, 'block');
  assert.equal(s.name, 'Bakkery Lekker');
  assert.equal(s.email, 'anna@example.co.za');
  assert.equal(s.approved, 1);
  assert.equal(s.plan_code, PLAN_BLOCK);
  assert.equal(s.init_reference, res.json.reference);
  assert.equal(s.paid_until, null);
  assert.equal(s.tagline, null, 'block tier never stores a tagline');

  const [c] = h.db.q('SELECT * FROM consents');
  assert.equal(c.sponsor_id, s.id);
  assert.equal(c.terms_version, '2026-10-06');
  assert.equal(c.accepted_at, T0);
  assert.match(c.ip_hash, /^[0-9a-f]{32}$/);
  assert.ok(!c.ip_hash.includes('198.51'), 'raw IP is never stored');

  const init = h.paystack.calls.find((c) => c.path === '/transaction/initialize');
  assert.equal(init.body.plan, PLAN_BLOCK);
  assert.equal(init.body.currency, 'ZAR');
  assert.equal(init.body.amount, '4900', 'block amount comes from the Paystack plan');
  assert.equal(init.body.email, 'anna@example.co.za');
  assert.equal(init.body.reference, res.json.reference);
  assert.equal(init.body.callback_url, `${SITE}adverteer.html?sponsor=${s.id}`);
  assert.deepEqual(init.body.channels, ['card']);
  assert.equal(init.body.metadata.sponsorId, s.id);
  assert.equal(init.body.metadata.tier, 'block');
});

test('premium uses the fixed R1 499 price and keeps tagline + https url', async () => {
  const h = createHarness();
  const res = await h.request('POST', '/subscribe', { body: premiumBody() });
  assert.equal(res.status, 200, res.text);
  const init = h.paystack.calls.find((c) => c.path === '/transaction/initialize');
  assert.equal(init.body.plan, PLAN_PREMIUM);
  assert.equal(init.body.amount, '149900');
  assert.ok(!h.paystack.calls.some((c) => c.path.startsWith('/plan/')), 'no plan lookup needed');
  const [s] = h.db.q('SELECT tagline, url FROM sponsors');
  assert.equal(s.tagline, 'Betroubare karre sedert 1985');
  assert.equal(s.url, 'https://kaapmotors.co.za/');
});

test('soft rule: shouting caps are auto-fixed, not rejected', async () => {
  const h = createHarness();
  const res = await h.request('POST', '/subscribe', { body: signupBody({ name: 'DIE GROOT WINKEL' }) });
  assert.equal(res.status, 200);
  assert.equal(res.json.name, 'Die Groot Winkel');
  assert.equal(h.db.q('SELECT name FROM sponsors')[0].name, 'Die Groot Winkel');
});

test('AUTO_APPROVE=false stores the sponsor unapproved', async () => {
  const h = createHarness({ AUTO_APPROVE: 'false' });
  const res = await h.request('POST', '/subscribe', { body: signupBody() });
  assert.equal(res.status, 200);
  assert.equal(res.json.needsApproval, true);
  assert.equal(h.db.q('SELECT approved FROM sponsors')[0].approved, 0);
});

const invalid = [
  ['invalid_tier', { tier: 'gold' }],
  ['terms_required', { acceptTerms: false }],
  ['terms_required', { acceptPrivacy: 'yes' }],
  ['terms_required', { termsVersion: '' }],
  ['invalid_name', { name: 'A' }],
  ['invalid_name', { name: 'x'.repeat(23) }],
  ['invalid_name', { name: '<script>' }],
  ['invalid_name', { name: '!!!' }],
  ['invalid_name', { name: 42 }],
  ['name_rejected', { name: 'Sh1t Happens' }],
  ['name_rejected', { name: 'Stapel' }],
  ['name_rejected', { name: 'test' }],
  ['name_rejected', { name: 'koop.co.za' }],
  ['name_rejected', { name: '082 555 1234' }],
  ['invalid_contact', { contactName: '' }],
  ['invalid_email', { email: 'not-an-email' }],
  ['invalid_email', { email: 'a@b' }],
  ['invalid_phone', { phone: 'call me' }],
];
for (const [code, patch] of invalid) {
  test(`validation: ${code} for ${JSON.stringify(patch)}`, async () => {
    const h = createHarness();
    const res = await h.request('POST', '/subscribe', { body: signupBody(patch) });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, code);
    assert.equal(h.db.q('SELECT COUNT(*) AS n FROM sponsors')[0].n, 0, 'nothing stored');
    assert.equal(h.paystack.calls.length, 0, 'Paystack never called');
  });
}

test('validation: premium tagline and url', async () => {
  const h = createHarness();
  let res = await h.request('POST', '/subscribe', { body: premiumBody({ tagline: 'Besoek ons by koop.com' }) });
  assert.equal(res.json.error, 'tagline_rejected');
  res = await h.request('POST', '/subscribe', { body: premiumBody({ tagline: 'x'.repeat(41) }) });
  assert.equal(res.json.error, 'invalid_tagline');
  res = await h.request('POST', '/subscribe', { body: premiumBody({ url: 'javascript:alert(1)' }) });
  assert.equal(res.json.error, 'invalid_url');
  res = await h.request('POST', '/subscribe', { body: premiumBody({ url: 'https://user:pw@evil.com' }) });
  assert.equal(res.json.error, 'invalid_url');
});

test('honeypot filled -> generic bad_request, nothing stored', async () => {
  const h = createHarness();
  const res = await h.request('POST', '/subscribe', { body: signupBody({ website: 'http://spam.example' }) });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'bad_request');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM sponsors')[0].n, 0);
});

test('malformed requests: wrong content type, bad JSON, oversized body, foreign origin', async () => {
  const h = createHarness();
  let res = await h.request('POST', '/subscribe', { rawBody: JSON.stringify(signupBody()), headers: { 'Content-Type': 'text/plain' } });
  assert.equal(res.status, 415);
  res = await h.request('POST', '/subscribe', { rawBody: '{nope', headers: { 'Content-Type': 'application/json' } });
  assert.equal(res.json.error, 'bad_request');
  res = await h.request('POST', '/subscribe', { rawBody: JSON.stringify(signupBody({ notes: 'x'.repeat(9000) })), headers: { 'Content-Type': 'application/json' } });
  assert.equal(res.status, 413);
  res = await h.request('POST', '/subscribe', { body: signupBody(), origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal(res.json.error, 'forbidden_origin');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  res = await h.request('POST', '/subscribe', { body: signupBody(), origin: 'http://localhost:8401' });
  assert.equal(res.status, 200, 'localhost:* is allowed for testing');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8401');
});

test('premium_taken when the billboard is paid for, and while a checkout holds it', async () => {
  const h = createHarness();
  const first = await h.request('POST', '/subscribe', { body: premiumBody() });
  assert.equal(first.status, 200);

  // Someone else during the 30-minute checkout hold.
  let res = await h.request('POST', '/subscribe', { body: premiumBody({ email: 'other@example.com', name: 'Ander Firma' }), ip: '203.0.113.9' });
  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'premium_taken');

  // The same buyer may retry (e.g. closed the Paystack tab).
  res = await h.request('POST', '/subscribe', { body: premiumBody() });
  assert.equal(res.status, 200);

  // Hold expires; once paid, the slot is taken for the whole paid period.
  h.db.db.prepare("UPDATE sponsors SET status = 'active', paid_until = ? WHERE id = ?").run(T0 + 30 * DAY, first.json.sponsorId);
  h.clock.now = T0 + 2 * 60 * 60 * 1000;
  res = await h.request('POST', '/subscribe', { body: premiumBody({ email: 'other@example.com', name: 'Ander Firma' }), ip: '203.0.113.9' });
  assert.equal(res.json.error, 'premium_taken');

  const avail = await h.request('GET', '/availability');
  assert.deepEqual(avail.json, { premium: { available: false }, block: { available: true } });

  // After it lapses the slot opens again.
  h.clock.now = T0 + 31 * DAY;
  res = await h.request('POST', '/subscribe', { body: premiumBody({ email: 'other@example.com', name: 'Ander Firma' }), ip: '203.0.113.9' });
  assert.equal(res.status, 200);
});

test('block_full when BLOCK_MAX is reached', async () => {
  const h = createHarness({ BLOCK_MAX: '1' });
  assert.equal((await h.request('POST', '/subscribe', { body: signupBody() })).status, 200);
  const res = await h.request('POST', '/subscribe', { body: signupBody({ email: 'b@example.com', name: 'Tweede' }), ip: '203.0.113.2' });
  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'block_full');
});

test('rate limited per e-mail and per IP (hashed)', async () => {
  const h = createHarness({ RATE_LIMIT_EMAIL_PER_HOUR: '2', RATE_LIMIT_IP_PER_HOUR: '3' });
  for (let i = 0; i < 2; i++) {
    assert.equal((await h.request('POST', '/subscribe', { body: signupBody(), ip: `10.0.0.${i}` })).status, 200);
  }
  let res = await h.request('POST', '/subscribe', { body: signupBody(), ip: '10.0.0.9' });
  assert.equal(res.status, 429);
  assert.equal(res.json.error, 'rate_limited');
  assert.equal(res.headers.get('Retry-After'), '3600');

  // Same IP, different e-mails.
  for (let i = 0; i < 3; i++) {
    const r = await h.request('POST', '/subscribe', { body: signupBody({ email: `p${i}@example.com` }), ip: '10.9.9.9' });
    assert.equal(r.status, 200, r.text);
  }
  res = await h.request('POST', '/subscribe', { body: signupBody({ email: 'p9@example.com' }), ip: '10.9.9.9' });
  assert.equal(res.json.error, 'rate_limited');

  // An hour later it's fine again.
  h.clock.now += 61 * 60 * 1000;
  res = await h.request('POST', '/subscribe', { body: signupBody({ email: 'p9@example.com' }), ip: '10.9.9.9' });
  assert.equal(res.status, 200);
});

test('payment_init_failed when Paystack errors or times out; the sponsor is abandoned', async () => {
  const h = createHarness({ PAYSTACK_TIMEOUT_MS: '1000' });
  h.paystack.failNextInit(500);
  let res = await h.request('POST', '/subscribe', { body: signupBody() });
  assert.equal(res.status, 502);
  assert.equal(res.json.error, 'payment_init_failed');
  assert.equal(h.db.q('SELECT status FROM sponsors')[0].status, 'abandoned');

  h.paystack.timeoutNextInit();
  res = await h.request('POST', '/subscribe', { body: signupBody({ email: 'x@example.com' }) });
  assert.equal(res.json.error, 'payment_init_failed');
  assert.ok(h.logs.some((l) => l.event === 'paystack_init_failed' && l.code === 'timeout'));

  // An abandoned failed checkout must not hold the premium slot.
  h.paystack.failNextInit(400, 'Invalid plan');
  res = await h.request('POST', '/subscribe', { body: premiumBody() });
  assert.equal(res.json.error, 'payment_init_failed');
  res = await h.request('POST', '/subscribe', { body: premiumBody({ email: 'z@example.com' }), ip: '203.0.113.50' });
  assert.equal(res.status, 200);
});

test('sales_disabled when the plan for a tier is not configured', async () => {
  const h = createHarness({ PLAN_PREMIUM: '' });
  const res = await h.request('POST', '/subscribe', { body: premiumBody() });
  assert.equal(res.status, 503);
  assert.equal(res.json.error, 'sales_disabled');
  const avail = await h.request('GET', '/availability');
  assert.equal(avail.json.premium.available, false);
});

test('CORS preflight for /subscribe only allows site origins', async () => {
  const h = createHarness();
  let res = await h.request('OPTIONS', '/subscribe', { headers: { 'Access-Control-Request-Method': 'POST' } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  res = await h.request('OPTIONS', '/subscribe', { origin: 'https://evil.example' });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  res = await h.request('OPTIONS', '/subscribe', { origin: 'http://localhost.evil.example:80' });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});
