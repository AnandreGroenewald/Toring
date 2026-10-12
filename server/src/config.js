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
    // 'live' | 'test' | 'unknown', from the key prefix. A test key in production would let anyone
    // "pay" with Paystack's test cards, so test payments never count while a live key is set.
    paystackMode: /^sk_live_/.test(str(e.PAYSTACK_SECRET_KEY)) ? 'live'
      : /^sk_test_/.test(str(e.PAYSTACK_SECRET_KEY)) ? 'test' : 'unknown',
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
      // the daily leaderboard: a player posts once or twice a day, but a school or a mobile network
      // puts many players behind one address (as for /score)
      boardPostPerHour: int(e.RATE_LIMIT_BOARD_POST_PER_HOUR, 60, 1),
      boardGetPerHour: int(e.RATE_LIMIT_BOARD_GET_PER_HOUR, 240, 1),
      // Wrong admin tokens per hashed address and hour before even the right one is refused.
      adminFailsPerHour: int(e.RATE_LIMIT_ADMIN_FAILS_PER_HOUR, 20, 1),
      // (1.13) Sign in with Google, and the saved progress (a game saves after each tower; many players
      // can share one address)
      signInPerHour: int(e.RATE_LIMIT_SIGNIN_PER_HOUR, 60, 1),
      accountPerHour: int(e.RATE_LIMIT_ACCOUNT_PER_HOUR, 900, 1),
      // (1.14) saves per ACCOUNT and hour, whatever the address: a real player saves after each tower (one every
      // 1-3 minutes at the most, plus a purchase or a new name now and then: a few dozen an hour on two devices), so
      // 120 is far above real play, while one scripted account can't eat the free plan's 100 000 D1 rows a day
      // (120 x ~5 rows x 24 h = ~14 400). Like every limit here it counts per isolate (memory only), so it bounds
      // the damage rather than counting exactly.
      accountStoresPerHour: int(e.RATE_LIMIT_ACCOUNT_STORES_PER_HOUR, 120, 1),
    },
    // (1.13.1) The Daaglikse Toring's free tries a day from DAILY_FREE_FROM (the days before: one), for GET /daily/config:
    // the game asks at its start, so this changes without a new app (1..4; the game's own default is 3 from 2026-10-12).
    dailyFreeTries: int(e.DAILY_FREE_TRIES, 3, 1, 4),
    dailyFreeFrom: /^\d{4}-\d{2}-\d{2}$/.test(str(e.DAILY_FREE_FROM)) ? str(e.DAILY_FREE_FROM) : '2026-10-12',
    // (1.15, the owner: "Isnt there a way to do it through a app notification?") the newest Android app on Google Play, for
    // GET /daily/config `app`: a 1.15+ app that's older shows "Nuwe weergawe!" with a Play Store button. Set it only once Play
    // has the version for everyone (an internal test isn't enough); empty = no card.
    appLatest: /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str(e.APP_LATEST)) ? str(e.APP_LATEST) : '',
    // (1.13) Sign in with Google: the web client ID (public; the app asks Google for tokens for it too)
    // and the secret that turns a Google account's number into Stapel's account number. Without both,
    // /account/* answers 503 not_configured and the game hides the sign-in.
    googleClientId: /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(str(e.GOOGLE_CLIENT_ID)) ? str(e.GOOGLE_CLIENT_ID) : '',
    authSecret: str(e.AUTH_SECRET).length >= 32 ? str(e.AUTH_SECRET) : '',
    // Audience counts are added up in memory and written at most this often (D1 write budget).
    statsFlushMs: int(e.STATS_FLUSH_SECONDS, 60, 0, 3600) * 1000,
    // A secret salt: a fixed public fallback would let anyone reverse the stored address hashes.
    ipSalt: str(e.IP_HASH_SALT) || adminToken || str(e.PAYSTACK_SECRET_KEY) || 'stapel',
  };
  if (env && typeof env === 'object') cache.set(env, cfg);
  return cfg;
}

/** True when a sponsorship for `tier` can be sold right now. */
export function salesConfigured(cfg, tier) {
  return Boolean(cfg.paystackSecret && cfg.siteUrl && cfg.plans[tier]);
}
