// Pure-module unit tests: entitlement maths, moderation rules, Paystack client behaviour, config.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsUTC, computePaidUntil, isLive, statusAfterCharge, statusAfterDisable, statusAfterNotRenew, chargeProblem, DAY_MS,
} from '../src/entitlement.js';
import { checkName, checkTagline, checkUrl, normalizeText } from '../src/moderation.js';
import { createPaystack, PaystackError } from '../src/paystack.js';
import { isOriginAllowed, loadConfig, parseOrigins } from '../src/config.js';
import { verifyPaystackSignature, safeEqual } from '../src/crypto.js';
import { parseAdminDate } from '../src/validate.js';
import { createHmac } from 'node:crypto';

const iso = (s) => Date.parse(s);

test('addMonthsUTC clamps to month end and handles leap years and year ends', () => {
  assert.equal(addMonthsUTC(iso('2026-01-31T12:00:00Z'), 1), iso('2026-02-28T12:00:00Z'));
  assert.equal(addMonthsUTC(iso('2028-01-31T00:00:00Z'), 1), iso('2028-02-29T00:00:00Z'));
  assert.equal(addMonthsUTC(iso('2026-12-15T08:30:00Z'), 1), iso('2027-01-15T08:30:00Z'));
  assert.equal(addMonthsUTC(iso('2026-10-06T10:00:00Z'), 12), iso('2027-10-06T10:00:00Z'));
});

test('computePaidUntil: order-independent, idempotent, grace added once', () => {
  const t0 = iso('2026-10-06T10:00:00Z');
  const pays = [t0, addMonthsUTC(t0, 1), addMonthsUTC(t0, 2)];
  const expected = addMonthsUTC(t0, 3) + 3 * DAY_MS;
  assert.equal(computePaidUntil(pays, { graceDays: 3 }), expected);
  assert.equal(computePaidUntil([...pays].reverse(), { graceDays: 3 }), expected);
  // A renewal charged 2 days late (inside the grace) buys a month from the charge time.
  const late = addMonthsUTC(t0, 1) + 2 * DAY_MS;
  assert.equal(computePaidUntil([t0, late], { graceDays: 3 }), addMonthsUTC(late, 1) + 3 * DAY_MS);
  // Paying early never loses days.
  const early = t0 + 10 * DAY_MS;
  assert.equal(computePaidUntil([t0, early], { graceDays: 3 }), addMonthsUTC(t0, 2) + 3 * DAY_MS);
  assert.equal(computePaidUntil([], { graceDays: 3 }), null);
  assert.equal(computePaidUntil([], { graceDays: 3, adminUntil: 5 }), 5);
  assert.equal(computePaidUntil([t0], { graceDays: 3, adminUntil: 5 }), addMonthsUTC(t0, 1) + 3 * DAY_MS);
});

test('isLive implements the entitlement rule exactly', () => {
  const base = { status: 'active', approved: 1, hidden: 0, paid_until: 100 };
  assert.equal(isLive(base, 99), true);
  assert.equal(isLive({ ...base, status: 'cancelling' }, 99), true);
  assert.equal(isLive(base, 100), false);
  assert.equal(isLive({ ...base, status: 'ended' }, 0), false);
  assert.equal(isLive({ ...base, status: 'pending' }, 0), false);
  assert.equal(isLive({ ...base, approved: 0 }, 0), false);
  assert.equal(isLive({ ...base, hidden: 1 }, 0), false);
  assert.equal(isLive({ ...base, paid_until: null }, 0), false);
});

test('status transitions', () => {
  assert.equal(statusAfterCharge('pending'), 'active');
  assert.equal(statusAfterCharge('abandoned'), 'active');
  assert.equal(statusAfterCharge('cancelling'), 'cancelling');
  assert.equal(statusAfterCharge('ended'), 'ended');
  assert.equal(statusAfterNotRenew('active'), 'cancelling');
  assert.equal(statusAfterNotRenew('pending'), 'cancelling');
  assert.equal(statusAfterNotRenew('ended'), 'ended');
  assert.equal(statusAfterDisable({ status: 'active', paid_until: 10 }, 5), 'ended');
  assert.equal(statusAfterDisable({ status: 'cancelling', paid_until: 10 }, 5), 'cancelling');
  assert.equal(statusAfterDisable({ status: 'cancelling', paid_until: 10 }, 11), 'ended');
});

test('chargeProblem guards plan, amount and currency', () => {
  const cfg = loadConfig({ PLAN_BLOCK: 'PLN_b', PLAN_PREMIUM: 'PLN_p', PREMIUM_PRICE_CENTS: '149900' });
  const prem = { tier: 'premium', plan_code: 'PLN_p' };
  const ok = { currency: 'ZAR', amount: 149900, planCode: 'PLN_p', matchedBy: 'metadata' };
  assert.equal(chargeProblem(cfg, prem, ok), null);
  assert.equal(chargeProblem(cfg, prem, { ...ok, planCode: 'PLN_old' }), 'plan_mismatch');
  assert.equal(chargeProblem(cfg, { ...prem, plan_code: 'PLN_old' }, { ...ok, planCode: 'PLN_old' }), null, 'legacy plan still renews');
  assert.equal(chargeProblem(cfg, prem, { ...ok, amount: 149899 }), 'amount_too_low');
  assert.equal(chargeProblem(cfg, prem, { ...ok, currency: 'USD' }), 'currency');
  assert.equal(chargeProblem(cfg, prem, { ...ok, planCode: null }), 'no_plan');
  assert.equal(chargeProblem(cfg, prem, { ...ok, planCode: null, currency: null, matchedBy: 'subscription' }), null);
  assert.equal(chargeProblem(cfg, { tier: 'block', plan_code: 'PLN_b' }, { ...ok, amount: 1, planCode: 'PLN_b' }), null, 'block price is the plan\'s business');
});

test('moderation: names', () => {
  const ok = (n, v = n) => assert.deepEqual([n, checkName(n).ok && checkName(n).value], [n, v]);
  const bad = (n, code) => assert.equal(checkName(n).code, code, n);
  ok('Smit & Seuns');
  ok('Bakkery ’n Lekker');
  ok("Bakkery 'n Lekker");
  ok('Kafee Ôkêï');
  ok('7-Eleven');
  ok('Fokus Fotografie');
  ok('Hoërskool Ermelo');
  ok('Therapist Jan');
  ok('Smith & Co.');
  ok('Niger Trading');
  ok('Moer en Bout');
  ok('  Twee   Spasies  ', 'Twee Spasies');
  ok('DIE GROOT WINKEL', 'Die Groot Winkel');
  ok('Kaap!!!', 'Kaap!');
  ok('Ex​ample', 'Example');
  ok('Bakkery ʼn Lekker', 'Bakkery ’n Lekker');
  bad('A', 'invalid_name');
  bad('x'.repeat(23), 'invalid_name');
  bad('!!!', 'invalid_name');
  bad('a@b.com', 'invalid_name');
  bad('Ѕhit', 'invalid_name'); // Cyrillic Ѕ
  bad('emoji 😀', 'invalid_name');
  bad('ＳＨＩＴ', 'name_rejected'); // full-width folded by NFKC
  bad('f.u.c.k', 'name_rejected');
  bad('Sh1t Happens', 'name_rejected');
  bad('niiiiggger', 'name_rejected');
  bad('Kak Kafee', 'name_rejected');
  bad('Poes', 'name_rejected');
  bad('Stapel', 'name_rejected');
  bad('ADMIN', 'name_rejected');
  bad('test', 'name_rejected');
  bad('Paystack Pro', 'name_rejected');
  bad('Jou advertensie hier', 'name_rejected');
  bad('www winkel', 'name_rejected');
  bad('koop.co.za', 'name_rejected');
  bad('082 555 1234', 'name_rejected');
  assert.equal(checkName('Stapel', { admin: true }).ok, true, 'owner may use reserved words');
  assert.equal(checkName('Test Kitchen').ok, true, '"test" is only reserved on its own');
  assert.equal(normalizeText(' a  b '), 'a b');
});

test('moderation: tagline and url', () => {
  assert.deepEqual(checkTagline(''), { ok: true, value: null, fixed: false });
  assert.deepEqual(checkTagline(undefined), { ok: true, value: null, fixed: false });
  assert.equal(checkTagline('Altyd vars. Net vir jou').ok, true, 'Afrikaans "Net" is not a domain');
  assert.equal(checkTagline('20% afslag, net hier!').ok, true);
  assert.equal(checkTagline('Besoek abc.com').code, 'tagline_rejected');
  assert.equal(checkTagline('x'.repeat(41)).code, 'invalid_tagline');
  assert.equal(checkUrl('').value, null);
  assert.equal(checkUrl('example.co.za').value, 'https://example.co.za/');
  assert.equal(checkUrl('http://Example.co.za/Winkel?x=1#top').value, 'https://example.co.za/Winkel?x=1');
  for (const u of ['javascript:alert(1)', 'data:text/html,hi', 'https://user:pw@x.com', 'https://1.2.3.4', 'https://example.com:8443', 'ftp://x.com', 'https://localhost', 'https://fuck.co.za', `https://a.com/${'x'.repeat(250)}`]) {
    assert.equal(checkUrl(u).ok, false, u);
  }
});

test('Paystack client: auth header, error mapping, timeout, retry only for reads', async () => {
  const calls = [];
  let mode = 'ok';
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (mode === 'down') return new Response('{"status":false,"message":"Down"}', { status: 503 });
    if (mode === 'auth') return new Response('{"status":false,"message":"Invalid key"}', { status: 401 });
    if (mode === 'html') return new Response('<html>', { status: 200 });
    if (mode === 'hang') {
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('a', 'AbortError'))));
    }
    return new Response(JSON.stringify({ status: true, data: { link: 'https://paystack.com/m', status: 'success' } }), { status: 200 });
  };
  const ps = createPaystack({ secretKey: 'fake-paystack-key', fetch, timeoutMs: 50 });

  assert.equal((await ps.verify('ref/../x')).status, 'success');
  assert.equal(calls[0].url, 'https://api.paystack.co/transaction/verify/ref%2F..%2Fx', 'path segments are encoded');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-paystack-key');

  mode = 'down';
  calls.length = 0;
  await assert.rejects(ps.verify('r'), (e) => e instanceof PaystackError && e.code === 'unavailable');
  assert.equal(calls.length, 2, 'GET retried once');
  calls.length = 0;
  await assert.rejects(ps.initialize({ email: 'a@b.co', amount: 1, plan: 'PLN_x', callbackUrl: 'https://x', reference: 'r', metadata: {} }));
  assert.equal(calls.length, 1, 'initialize never retried');

  mode = 'auth';
  await assert.rejects(ps.getPlan('PLN_x'), (e) => e.code === 'auth' && !e.message.includes('fake-paystack-key'));
  mode = 'html';
  await assert.rejects(ps.manageLink('SUB_x'), (e) => e.code === 'bad_response');
  mode = 'hang';
  await assert.rejects(ps.disableSubscription('SUB_x', 'tok'), (e) => e.code === 'timeout');
});

test('webhook signature verification and constant-time compare', async () => {
  const body = new TextEncoder().encode('{"event":"x"}');
  const sig = createHmac('sha512', 'sk').update(body).digest('hex');
  assert.equal(await verifyPaystackSignature('sk', body, sig), true);
  assert.equal(await verifyPaystackSignature('sk', body, sig.toUpperCase()), true);
  assert.equal(await verifyPaystackSignature('other', body, sig), false);
  assert.equal(await verifyPaystackSignature('sk', body, sig.slice(0, -2)), false);
  assert.equal(await verifyPaystackSignature('sk', body, null), false);
  assert.equal(await verifyPaystackSignature('', body, sig), false);
  assert.equal(await safeEqual('abc', 'abc'), true);
  assert.equal(await safeEqual('abc', 'abd'), false);
  assert.equal(await safeEqual('abc', 'abcd'), false);
});

test('config: origins, defaults, admin token length', () => {
  const o = parseOrigins('https://a.github.io/, http://localhost:*');
  assert.equal(isOriginAllowed('https://a.github.io', o), true);
  assert.equal(isOriginAllowed('http://localhost:8401', o), true);
  assert.equal(isOriginAllowed('http://localhost', o), false);
  assert.equal(isOriginAllowed('http://localhost:80.evil.com', o), false);
  assert.equal(isOriginAllowed('https://a.github.io.evil.com', o), false);
  assert.equal(isOriginAllowed('null', o), false);
  const cfg = loadConfig({ SITE_URL: 'https://a.github.io/Toring', ADMIN_TOKEN: 'short' });
  assert.equal(cfg.siteUrl, 'https://a.github.io/Toring/');
  assert.equal(cfg.adminToken, '');
  assert.equal(cfg.max.premium, 1);
  assert.equal(cfg.max.block, 60);
  assert.equal(cfg.graceDays, 3);
  assert.equal(cfg.autoApprove, true);
  assert.equal(cfg.priceCents.premium, 149900);
});

test('parseAdminDate', () => {
  assert.equal(new Date(parseAdminDate('2026-12-31')).toISOString(), '2026-12-31T21:59:59.999Z');
  assert.equal(parseAdminDate('2026-02-30'), undefined);
  assert.equal(parseAdminDate('2026-12-31T10:00:00Z'), iso('2026-12-31T10:00:00Z'));
  assert.equal(parseAdminDate(1234), 1234);
  assert.equal(parseAdminDate(null), null);
  assert.equal(parseAdminDate('soon'), undefined);
  assert.equal(parseAdminDate(true), undefined);
});
