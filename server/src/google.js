// "Sign in with Google" (1.13): checks a Google ID token (a JWT signed by Google) without any library.
// The game gets the token from Google (the website's button, or Android's Credential Manager in the app)
// and sends it here once; this checks Google's signature against Google's published keys, that the token
// was made for Stapel (`aud` = the web client ID: both the website and the app ask for it), that Google
// made it (`iss`) and that it is still valid (`exp`). Only `sub`, the Google account's number, is used.

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const SKEW_S = 120;                 // clocks a little apart
const MAX_TOKEN_CHARS = 4096;       // a Google ID token is about 1 200 characters
const KEYS_MIN_MS = 10 * 60 * 1000; // keep Google's keys at least this long...
const KEYS_MAX_MS = 24 * 60 * 60 * 1000;   // ...and at most this long (Google says how long in Cache-Control)
const REFETCH_MS = 60 * 1000;       // an unknown key id fetches the keys again at most this often (Google rotates them)

const dec = new TextDecoder();

function b64urlBytes(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(pad);
    const out = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
    return out;
  } catch {
    return null;
  }
}

function b64urlJson(s) {
  const bytes = b64urlBytes(s);
  if (!bytes) return null;
  try {
    const v = JSON.parse(dec.decode(bytes));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Google's signing keys, kept in this isolate as long as Google allows (refetched for an unknown key id). */
export function createGoogleKeys({ fetch: fetchImpl, now = () => Date.now() } = {}) {
  let keys = null;
  let until = 0;
  let loadedAt = -Infinity;
  let pending = null;

  async function load() {
    let res;
    let body;
    try {
      res = await fetchImpl(JWKS_URL, { headers: { Accept: 'application/json' } });
    } catch {
      throw new Error('google_keys_fetch');
    }
    if (!res || !res.ok) throw new Error(`google_keys_${res ? res.status : 'none'}`);
    try {
      body = await res.json();
    } catch {
      throw new Error('google_keys_json');
    }
    const list = Array.isArray(body?.keys) ? body.keys.filter((k) => k && k.kty === 'RSA' && typeof k.kid === 'string' && k.n && k.e) : [];
    if (!list.length) throw new Error('google_keys_empty');
    const age = /max-age=(\d+)/i.exec(res.headers?.get?.('Cache-Control') || '');
    const ms = age ? Number(age[1]) * 1000 : KEYS_MIN_MS;
    keys = new Map(list.map((k) => [k.kid, k]));
    loadedAt = now();
    until = loadedAt + Math.min(KEYS_MAX_MS, Math.max(KEYS_MIN_MS, ms));
    return keys;
  }

  return {
    /**
     * The key `kid`, or null. Fetches the keys when they are old, or (`fresh`) don't know `kid` and weren't
     * fetched in the last REFETCH_MS (so made-up key ids can't make this ask Google on every request).
     */
    async get(kid, { fresh = false } = {}) {
      if (!keys || now() >= until || (fresh && !keys.has(kid) && now() - loadedAt >= REFETCH_MS)) {
        pending ||= load().finally(() => { pending = null; });
        await pending;
      }
      return keys.get(kid) || null;
    },
  };
}

/**
 * A Google ID token, checked. Returns { sub } or throws an Error whose message says why (never the token).
 * `clientId`: the web client ID the token must be for.
 */
export async function verifyGoogleIdToken(token, { clientId, keys, now = Date.now() }) {
  if (!clientId) throw new Error('not_configured');
  if (typeof token !== 'string' || token.length > MAX_TOKEN_CHARS) throw new Error('malformed');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const header = b64urlJson(parts[0]);
  const claims = b64urlJson(parts[1]);
  const sig = b64urlBytes(parts[2]);
  if (!header || !claims || !sig || !sig.length) throw new Error('malformed');
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('bad_alg');

  let jwk = await keys.get(header.kid);
  if (!jwk) jwk = await keys.get(header.kid, { fresh: true });
  if (!jwk) throw new Error('unknown_key');
  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed))) throw new Error('bad_signature');

  if (!ISSUERS.has(claims.iss)) throw new Error('bad_issuer');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) throw new Error('bad_audience');
  const t = Math.floor(now / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp + SKEW_S < t) throw new Error('expired');
  if (Number.isFinite(claims.iat) && claims.iat - SKEW_S > t) throw new Error('not_yet');
  if (typeof claims.sub !== 'string' || !/^[0-9A-Za-z_-]{1,255}$/.test(claims.sub)) throw new Error('bad_subject');
  return { sub: claims.sub };
}
