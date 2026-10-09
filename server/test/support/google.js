// A fake Google for "Sign in with Google" tests: its own RSA key, the key list it publishes, and ID tokens
// signed with that key (or with a stranger's key, or with claims of the test's choosing).

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const b64json = (o) => b64url(Buffer.from(JSON.stringify(o)));
const RSA = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

export const CLIENT_ID = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
export const AUTH_SECRET = 'test-auth-secret-'.padEnd(48, 'x');

export async function fakeGoogle({ kid = 'key-1' } = {}) {
  const pair = await crypto.subtle.generateKey(RSA, true, ['sign', 'verify']);
  const stranger = await crypto.subtle.generateKey(RSA, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const calls = [];
  let down = false;

  async function sign(claims, { header = {}, key = pair.privateKey } = {}) {
    const head = b64json({ alg: 'RS256', kid, typ: 'JWT', ...header });
    const body = b64json(claims);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
  }

  return {
    calls,
    setDown(v) { down = !!v; },
    async fetch(input) {
      calls.push(String(typeof input === 'string' ? input : input.url));
      if (down) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' },
      });
    },
    /** A token Google would make for `sub` at `now` (ms), with `over` claims on top. */
    token(sub, now, over = {}, opts = {}) {
      const t = Math.floor(now / 1000);
      return sign({ iss: 'https://accounts.google.com', aud: CLIENT_ID, azp: CLIENT_ID, sub, email: `${sub}@example.com`, name: 'Anna Smit', iat: t, exp: t + 3600, ...over }, opts);
    },
    /** Signed with a key Google never published. */
    forged(sub, now) {
      const t = Math.floor(now / 1000);
      return sign({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub, iat: t, exp: t + 3600 }, { key: stranger.privateKey });
    },
  };
}
