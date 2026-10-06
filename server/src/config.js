// Parses the Worker env (wrangler vars + secrets) into a typed config object.
// Every value has a safe default so a half-configured deploy fails closed
// (sales disabled, admin disabled) instead of half-working.

export const TIERS = ['block', 'premium'];
export const CURRENCY = 'ZAR';
export const ADMIN_TOKEN_MIN_LENGTH = 32;

const cache = new WeakMap();

function int(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** "https://a.b, http://localhost:*" -> [{ exact } | { prefix }] */
export function parseOrigins(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map((o) => (o.endsWith(':*') ? { prefix: o.slice(0, -1) } : { exact: o }));
}

export function isOriginAllowed(origin, patterns) {
  if (!origin || origin === 'null') return false;
  return patterns.some((p) => {
    if (p.exact) return origin === p.exact;
    // "http://localhost:*" matches "http://localhost:8080" but never "http://localhost.evil.com".
    return origin.startsWith(p.prefix) && /^\d{1,5}$/.test(origin.slice(p.prefix.length));
  });
}

export function loadConfig(env) {
  if (env && typeof env === 'object' && cache.has(env)) return cache.get(env);
  const e = env || {};
  let siteUrl = str(e.SITE_URL);
  if (siteUrl && !siteUrl.endsWith('/')) siteUrl += '/';
  const adminToken = str(e.ADMIN_TOKEN);
  const cfg = {
    paystackSecret: str(e.PAYSTACK_SECRET_KEY),
    paystackBaseUrl: str(e.PAYSTACK_BASE_URL) || 'https://api.paystack.co',
    paystackTimeoutMs: int(e.PAYSTACK_TIMEOUT_MS, 8000, 1000, 30000),
    // Optional extra control on top of the signature check.
    paystackIpAllowlist: bool(e.PAYSTACK_IP_ALLOWLIST, false),
    adminToken: adminToken.length >= ADMIN_TOKEN_MIN_LENGTH ? adminToken : '',
    plans: { block: str(e.PLAN_BLOCK), premium: str(e.PLAN_PREMIUM) },
    // Minimum accepted charge per tier (cents). 0 = trust the plan's amount.
    priceCents: {
      premium: int(e.PREMIUM_PRICE_CENTS, 149900, 0),
      block: int(e.BLOCK_PRICE_CENTS, 0, 0),
    },
    siteUrl,
    allowedOrigins: parseOrigins(e.ALLOWED_ORIGINS),
    max: { premium: int(e.PREMIUM_MAX, 1, 0, 100), block: int(e.BLOCK_MAX, 60, 0, 10000) },
    autoApprove: bool(e.AUTO_APPROVE, true),
    graceDays: int(e.GRACE_DAYS, 3, 0, 31),
    // A pending checkout holds its slot this long so two buyers can't both pay for one billboard.
    holdMinutes: int(e.PENDING_HOLD_MINUTES, 30, 0, 24 * 60),
    rate: {
      emailPerHour: int(e.RATE_LIMIT_EMAIL_PER_HOUR, 5, 1),
      ipPerHour: int(e.RATE_LIMIT_IP_PER_HOUR, 10, 1),
      globalPerHour: int(e.RATE_LIMIT_GLOBAL_PER_HOUR, 200, 1),
      // Anonymous audience counts, per hashed address and hour. Generous: a school or a mobile
      // network can put many players behind one address.
      statsPerHour: int(e.RATE_LIMIT_STATS_PER_HOUR, 120, 1),
      scorePerHour: int(e.RATE_LIMIT_SCORE_PER_HOUR, 60, 1),
    },
    ipSalt: str(e.IP_HASH_SALT) || adminToken || 'stapel',
  };
  if (env && typeof env === 'object') cache.set(env, cfg);
  return cfg;
}

/** True when a sponsorship for `tier` can be sold right now. */
export function salesConfigured(cfg, tier) {
  return Boolean(cfg.paystackSecret && cfg.siteUrl && cfg.plans[tier]);
}
