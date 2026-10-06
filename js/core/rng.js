// Seeded random numbers. Everything here uses only integer ops (Math.imul, >>>)
// and + - * / on doubles, so every browser produces the exact same stream for a
// seed — that is what makes the Daaglikse Toring identical for all players.
// Do NOT change these algorithms: it would change every past and future daily.

/** cyrb53 string hash, low 32 bits. Stable across engines (UTF-16 code units). */
export function hashString(str) {
  const s = String(str);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return h1 >>> 0;
}

/** Small, fast 32-bit PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(seedUint32) {
  let a = seedUint32 >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded RNG with helpers. `seed` may be a string or number (numbers are
 * hashed via their string form, so createRng(7) === createRng('7')).
 */
export function createRng(seed) {
  const seedKey = String(seed);
  const next = mulberry32(hashString(seedKey));

  const rng = {
    seed: seedKey,
    next,
    /** Uniform float in [min, max). */
    float(min = 0, max = 1) {
      return min + next() * (max - min);
    },
    /** Uniform integer in [min, maxInclusive]. */
    int(min, maxInclusive) {
      let lo = Math.ceil(min);
      let hi = Math.floor(maxInclusive);
      if (hi < lo) [lo, hi] = [hi, lo];
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick(array) {
      if (!array || array.length === 0) return undefined;
      return array[Math.floor(next() * array.length)];
    },
    /** items: [{ w, v }] — returns v with probability w / sum(w). Non-positive weights never win. */
    weighted(items) {
      if (!items || items.length === 0) return undefined;
      let total = 0;
      for (const it of items) if (it.w > 0) total += it.w;
      if (total <= 0) return items[items.length - 1].v;
      let r = next() * total;
      let last;
      for (const it of items) {
        if (!(it.w > 0)) continue;
        last = it;
        r -= it.w;
        if (r < 0) return it.v;
      }
      return last.v; // float rounding guard
    },
    chance(p) {
      return next() < p;
    },
    /** Independent stream derived from seed + label (not affected by values already drawn). */
    fork(label) {
      return createRng(`${seedKey}/${label}`);
    },
  };
  return rng;
}
