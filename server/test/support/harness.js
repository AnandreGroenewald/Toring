// Test harness: real worker + real SQL (node:sqlite) + a fake clock + a scriptable fake Paystack.

import { createHmac } from 'node:crypto';
import { createWorker } from '../../src/worker.js';
import { createTestDb } from './d1.js';

export const SECRET = 'sk_test_0123456789abcdef0123456789abcdef';
export const ADMIN = 'adm_' + 'x'.repeat(40);
export const PLAN_BLOCK = 'PLN_block123';
export const PLAN_PREMIUM = 'PLN_premium456';
export const SITE = 'https://example.github.io/Toring/';
export const ORIGIN = 'https://example.github.io';
export const T0 = Date.UTC(2026, 9, 6, 10, 0, 0); // 6 Oct 2026 10:00 UTC
export const DAY = 24 * 60 * 60 * 1000;

export function baseEnv(db, overrides = {}) {
  return {
    DB: db,
    PAYSTACK_SECRET_KEY: SECRET,
    ADMIN_TOKEN: ADMIN,
    PLAN_BLOCK,
    PLAN_PREMIUM,
    PREMIUM_PRICE_CENTS: '149900',
    BLOCK_PRICE_CENTS: '',
    SITE_URL: SITE,
    ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:*`,
    PREMIUM_MAX: '1',
    BLOCK_MAX: '60',
    AUTO_APPROVE: 'true',
    GRACE_DAYS: '3',
    ...overrides,
  };
}

/** A scriptable fake of api.paystack.co. */
export function fakePaystack() {
  const calls = [];
  const plans = { [PLAN_BLOCK]: 4900, [PLAN_PREMIUM]: 149900 };
  const transactions = new Map(); // reference -> verify data
  const subscriptions = new Map(); // code -> { email_token }
  let nextInit = null; // optional override: () => Response

  const ok = (data) => new Response(JSON.stringify({ status: true, message: 'ok', data }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
  const fail = (status, message) => new Response(JSON.stringify({ status: false, message }), {
    status, headers: { 'Content-Type': 'application/json' },
  });

  async function fetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body, auth: init.headers?.Authorization });
    if (init.headers?.Authorization !== `Bearer ${SECRET}`) return fail(401, 'Invalid key');
    if (method === 'POST' && url.pathname === '/transaction/initialize') {
      if (nextInit) {
        const r = nextInit;
        nextInit = null;
        return r(body, init);
      }
      return ok({
        authorization_url: `https://checkout.paystack.com/${body.reference}`,
        access_code: 'acc_' + body.reference,
        reference: body.reference,
      });
    }
    let m = /^\/transaction\/verify\/(.+)$/.exec(url.pathname);
    if (method === 'GET' && m) {
      const tx = transactions.get(decodeURIComponent(m[1]));
      return tx ? ok(tx) : fail(400, 'Transaction reference not found');
    }
    m = /^\/plan\/(.+)$/.exec(url.pathname);
    if (method === 'GET' && m) {
      const amount = plans[decodeURIComponent(m[1])];
      return amount ? ok({ plan_code: m[1], amount, currency: 'ZAR', interval: 'monthly' }) : fail(404, 'Plan not found');
    }
    m = /^\/subscription\/([^/]+)\/manage\/link$/.exec(url.pathname);
    if (method === 'GET' && m) {
      return subscriptions.has(m[1]) ? ok({ link: `https://paystack.com/manage/subscriptions/${m[1]}` }) : fail(404, 'Not found');
    }
    m = /^\/subscription\/([^/]+)$/.exec(url.pathname);
    if (method === 'GET' && m) {
      const sub = subscriptions.get(m[1]);
      return sub ? ok({ subscription_code: m[1], ...sub }) : fail(404, 'Not found');
    }
    if (method === 'POST' && url.pathname === '/subscription/disable') {
      const sub = subscriptions.get(body.code);
      if (!sub || sub.email_token !== body.token) return fail(400, 'Subscription not found');
      sub.status = 'cancelled';
      return ok(null);
    }
    return fail(404, 'Not found');
  }

  return {
    fetch,
    calls,
    plans,
    transactions,
    subscriptions,
    failNextInit(status = 500, message = 'Server error') {
      nextInit = () => fail(status, message);
    },
    timeoutNextInit() {
      // Hangs like a dead connection; only the client's abort signal ends it.
      nextInit = (_body, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    },
  };
}

export function createHarness(envOverrides = {}) {
  const db = createTestDb();
  const clock = { now: T0 };
  const paystack = fakePaystack();
  const logs = [];
  const worker = createWorker({
    now: () => clock.now,
    fetch: (...a) => paystack.fetch(...a),
    log: (level, event, fields) => logs.push({ level, event, ...fields }),
  });
  const env = baseEnv(db, envOverrides);

  async function request(method, path, { body, headers = {}, rawBody, ip = '198.51.100.7', origin = ORIGIN } = {}) {
    const h = { 'CF-Connecting-IP': ip, ...headers };
    if (origin) h.Origin = origin;
    let payload;
    if (rawBody !== undefined) payload = rawBody;
    else if (body !== undefined) {
      payload = JSON.stringify(body);
      h['Content-Type'] ??= 'application/json';
    }
    const res = await worker.fetch(new Request(`https://api.test${path}`, { method, headers: h, body: payload }), env);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  const admin = (method, path, body, token = ADMIN) => request(method, path, {
    body, headers: token === null ? {} : { Authorization: `Bearer ${token}` },
  });

  async function webhook(evt, { secret = SECRET, signature } = {}) {
    const raw = JSON.stringify(evt);
    const sig = signature ?? createHmac('sha512', secret).update(raw).digest('hex');
    return request('POST', '/paystack/webhook', {
      rawBody: raw,
      origin: null,
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
    });
  }

  return { db, clock, paystack, logs, worker, env, request, admin, webhook };
}

export function signupBody(overrides = {}) {
  return {
    tier: 'block',
    name: 'Bakkery Lekker',
    contactName: 'Anna Smit',
    email: 'anna@example.co.za',
    phone: '082 123 4567',
    acceptTerms: true,
    acceptPrivacy: true,
    termsVersion: '2026-10-06',
    privacyVersion: '2026-10-06',
    website: '',
    ...overrides,
  };
}

export function premiumBody(overrides = {}) {
  return signupBody({
    tier: 'premium',
    name: 'Kaap Motors',
    tagline: 'Betroubare karre sedert 1985',
    url: 'kaapmotors.co.za',
    email: 'info@kaapmotors.co.za',
    ...overrides,
  });
}

// ---------------------------------------------------------------- Paystack event builders

const customer = (email, code) => ({ id: 1, email, customer_code: code, first_name: 'Anna', last_name: 'Smit', phone: '0821234567' });
const planObj = (code, amount) => ({ id: 9, name: 'Stapel', plan_code: code, amount, interval: 'monthly', currency: 'ZAR' });

export function chargeSuccess({ reference, amount = 4900, plan = PLAN_BLOCK, email = 'anna@example.co.za', customerCode = 'CUS_anna', paidAt, metadata = null, currency = 'ZAR' }) {
  return {
    event: 'charge.success',
    data: {
      id: Math.floor(Math.random() * 1e9),
      domain: 'test',
      status: 'success',
      reference,
      amount,
      currency,
      paid_at: new Date(paidAt).toISOString(),
      channel: 'card',
      metadata: metadata ?? 0,
      customer: customer(email, customerCode),
      authorization: { authorization_code: 'AUTH_x', last4: '4081', bin: '408408', exp_month: '12', exp_year: '2030', reusable: true },
      plan: plan ? planObj(plan, amount) : {},
      log: { history: [] },
    },
  };
}

export function subscriptionCreate({ code = 'SUB_anna', token = 'tok_anna', plan = PLAN_BLOCK, email = 'anna@example.co.za', customerCode = 'CUS_anna', next }) {
  return {
    event: 'subscription.create',
    data: {
      domain: 'test',
      status: 'active',
      subscription_code: code,
      email_token: token,
      amount: 4900,
      cron_expression: '0 0 6 * *',
      next_payment_date: new Date(next ?? T0 + 30 * DAY).toISOString(),
      plan: planObj(plan, 4900),
      customer: customer(email, customerCode),
      authorization: { last4: '4081' },
      created_at: new Date(T0).toISOString(),
    },
  };
}

export function subscriptionEvent(event, { code = 'SUB_anna', token = 'tok_anna', plan = PLAN_BLOCK, email = 'anna@example.co.za', customerCode = 'CUS_anna', status }) {
  return {
    event,
    data: {
      domain: 'test',
      status: status ?? (event === 'subscription.not_renew' ? 'non-renewing' : 'cancelled'),
      subscription_code: code,
      email_token: token,
      amount: 4900,
      plan: planObj(plan, 4900),
      customer: customer(email, customerCode),
    },
  };
}

export function invoiceEvent(event, { code = 'SUB_anna', reference, paid = true, amount = 4900, paidAt, customerCode = 'CUS_anna', email = 'anna@example.co.za', invoice = 'INV_1' }) {
  return {
    event,
    data: {
      domain: 'test',
      invoice_code: invoice,
      amount,
      status: paid ? 'success' : 'failed',
      paid,
      paid_at: paid ? new Date(paidAt).toISOString() : null,
      subscription: { status: 'active', subscription_code: code, amount, next_payment_date: null },
      customer: customer(email, customerCode),
      transaction: reference ? { reference, status: paid ? 'success' : 'failed', amount, currency: 'ZAR' } : {},
      authorization: { last4: '4081' },
    },
  };
}
