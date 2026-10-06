// WebCrypto helpers (identical in Workers and Node 22).

const enc = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(String(text))));
}

async function hmacKey(secret, hash, usages) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash }, false, usages);
}

export async function hmacHex(secret, message, hash = 'SHA-256') {
  const key = await hmacKey(secret, hash, ['sign']);
  const data = typeof message === 'string' ? enc.encode(message) : message;
  return toHex(await crypto.subtle.sign('HMAC', key, data));
}

/**
 * Paystack signs the raw request body with HMAC-SHA512 keyed by the secret key and
 * sends it hex-encoded in `x-paystack-signature`. subtle.verify compares in constant time.
 */
export async function verifyPaystackSignature(secret, rawBody, signatureHex) {
  if (!secret || !signatureHex) return false;
  const sig = fromHex(String(signatureHex).trim());
  if (!sig || sig.length !== 64) return false;
  const key = await hmacKey(secret, 'SHA-512', ['verify']);
  return crypto.subtle.verify('HMAC', key, sig, rawBody);
}

/** Constant-time string equality: compares fixed-length digests so length doesn't leak either. */
export async function safeEqual(a, b) {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a ?? ''))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b ?? ''))),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function randomHex(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

export function newSponsorId() {
  return crypto.randomUUID();
}

/** Our own Paystack transaction reference (allowed chars: alphanumerics, - . =). */
export function newReference() {
  return `stp-${randomHex(12)}`;
}

/** Keyed hash so stored IP fingerprints can't be reversed by brute-forcing the IPv4 space. */
export async function hashIp(ip, salt) {
  if (!ip) return null;
  return (await hmacHex(salt, `ip:${ip}`)).slice(0, 32);
}
