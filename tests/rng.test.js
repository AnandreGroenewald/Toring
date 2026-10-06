import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashString, mulberry32, createRng } from '../js/core/rng.js';

const take = (fn, n) => Array.from({ length: n }, fn);

test('hashString is a stable uint32', () => {
  for (const s of ['', 'a', 'stapel-2026-10-06', 'ëêé 🏗️ Reën', 'x'.repeat(1000)]) {
    const h = hashString(s);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `${s} -> ${h}`);
    assert.equal(hashString(s), h);
  }
  // Golden values: changing the hash would change every player's daily tower.
  assert.equal(hashString(''), 451841411);
  assert.equal(hashString('stapel-2026-10-06'), 1365545319);
  assert.equal(hashString('stapel-2026-10-06'), hashString('stapel-2026-10-06'));
  assert.notEqual(hashString('stapel-2026-10-06'), hashString('stapel-2026-10-07'));
  assert.equal(hashString(42), hashString('42'));
});

test('hashString spreads similar keys', () => {
  const seen = new Set();
  for (let d = 0; d < 2000; d++) seen.add(hashString(`stapel-${d}`));
  assert.equal(seen.size, 2000);
});

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  for (let k = 0; k < 1000; k++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notDeepEqual(take(mulberry32(1), 5), take(mulberry32(2), 5));
});

test('createRng: same seed => same stream, different seed => different stream', () => {
  const a = createRng('stapel-2026-10-06');
  const b = createRng('stapel-2026-10-06');
  const c = createRng('stapel-2026-10-07');
  const sa = take(() => a.next(), 50);
  assert.deepEqual(sa, take(() => b.next(), 50));
  assert.notDeepEqual(sa, take(() => c.next(), 50));
  assert.deepEqual(take(() => createRng(7).next(), 5), take(() => createRng('7').next(), 5));
  assert.equal(a.seed, 'stapel-2026-10-06');
});

test('next(): uniform distribution sanity (mean, buckets)', () => {
  const r = createRng('distribution');
  const N = 100000;
  const buckets = new Array(10).fill(0);
  let sum = 0;
  for (let k = 0; k < N; k++) {
    const x = r.next();
    sum += x;
    buckets[Math.floor(x * 10)]++;
  }
  assert.ok(Math.abs(sum / N - 0.5) < 0.01, `mean ${sum / N}`);
  // Chi-square with 9 dof: 99.9th percentile ~ 27.9
  const exp = N / 10;
  const chi = buckets.reduce((acc, o) => acc + ((o - exp) ** 2) / exp, 0);
  assert.ok(chi < 27.9, `chi2 ${chi}`);
});

test('float/int ranges', () => {
  const r = createRng('ranges');
  const counts = new Map();
  for (let k = 0; k < 60000; k++) {
    const f = r.float(-0.1, 0.1);
    assert.ok(f >= -0.1 && f < 0.1);
    const i = r.int(1, 6);
    assert.ok(Number.isInteger(i) && i >= 1 && i <= 6);
    counts.set(i, (counts.get(i) || 0) + 1);
  }
  assert.equal(counts.size, 6);
  for (const [, c] of counts) assert.ok(Math.abs(c / 60000 - 1 / 6) < 0.01);
  assert.equal(r.int(3, 3), 3);
  for (let k = 0; k < 100; k++) {
    const v = r.int(4, 2); // swapped bounds tolerated
    assert.ok(v >= 2 && v <= 4);
  }
  for (let k = 0; k < 100; k++) {
    const f = r.float();
    assert.ok(f >= 0 && f < 1);
  }
});

test('pick covers every element; empty => undefined', () => {
  const r = createRng('pick');
  const arr = ['a', 'b', 'c', 'd'];
  const seen = new Set();
  for (let k = 0; k < 400; k++) seen.add(r.pick(arr));
  assert.deepEqual([...seen].sort(), arr);
  assert.equal(r.pick([]), undefined);
});

test('weighted follows the weights and skips zero weights', () => {
  const r = createRng('weighted');
  const items = [{ w: 1, v: 'a' }, { w: 3, v: 'b' }, { w: 0, v: 'never' }, { w: 6, v: 'c' }];
  const c = { a: 0, b: 0, c: 0, never: 0 };
  const N = 50000;
  for (let k = 0; k < N; k++) c[r.weighted(items)]++;
  assert.equal(c.never, 0);
  assert.ok(Math.abs(c.a / N - 0.1) < 0.01);
  assert.ok(Math.abs(c.b / N - 0.3) < 0.015);
  assert.ok(Math.abs(c.c / N - 0.6) < 0.015);
  assert.equal(r.weighted([]), undefined);
  assert.equal(r.weighted([{ w: 5, v: 'only' }]), 'only');
});

test('chance', () => {
  const r = createRng('chance');
  let hits = 0;
  for (let k = 0; k < 20000; k++) {
    assert.equal(r.chance(0), false);
    assert.equal(r.chance(1), true);
    if (r.chance(0.25)) hits++;
  }
  assert.ok(Math.abs(hits / 20000 - 0.25) < 0.015);
});

test('fork: deterministic, independent of parent consumption, label-specific', () => {
  const p1 = createRng('seed');
  const p2 = createRng('seed');
  take(() => p2.next(), 37); // consume parent 2 only
  const f1 = take(p1.fork('blocks').next, 20);
  const f2 = take(p2.fork('blocks').next, 20);
  assert.deepEqual(f1, f2);
  assert.notDeepEqual(f1, take(p1.fork('weather').next, 20));
  assert.notDeepEqual(f1, take(createRng('seed2').fork('blocks').next, 20));
  // The fork is not just the parent's own stream.
  assert.notDeepEqual(f1, take(createRng('seed').next, 20));
  // Drawing from a fork does not disturb the parent.
  const p3 = createRng('seed');
  const f3 = p3.fork('x');
  take(f3.next, 100);
  assert.deepEqual(take(p3.next, 10), take(createRng('seed').next, 10));
  // Nested forks are stable too.
  assert.deepEqual(take(createRng('s').fork('a').fork('b').next, 5), take(createRng('s').fork('a').fork('b').next, 5));
});

test('fork streams are uncorrelated', () => {
  const a = createRng('corr').fork('blocks');
  const b = createRng('corr').fork('weather');
  const N = 20000;
  let sab = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  for (let k = 0; k < N; k++) {
    const x = a.next();
    const y = b.next();
    sab += x * y;
    sa += x;
    sb += y;
    saa += x * x;
    sbb += y * y;
  }
  const cov = sab / N - (sa / N) * (sb / N);
  const corr = cov / Math.sqrt((saa / N - (sa / N) ** 2) * (sbb / N - (sb / N) ** 2));
  assert.ok(Math.abs(corr) < 0.03, `corr ${corr}`);
});
