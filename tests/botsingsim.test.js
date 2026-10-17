// (1.18) Blokbotsing's physics between two phones (js/botsing/sim.js). The phone whose turn it is sends its world at
// the turn's end; both phones take it, and the next turn plays out the same on both (code review 18 Oct 2026: a block
// or a crown the other phone's replay had lost never came back, so the two phones could end the battle differently).
// Matter comes from Phaser's own build (lib/phaser.min.js), loaded here with just enough of a page to start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : k === 'measureText' ? () => ({ width: 1 }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
const el = () => ({ style: {}, getContext: () => ctx2d, addEventListener() {}, removeEventListener() {}, setAttribute() {}, appendChild() {}, width: 1, height: 1, toDataURL: () => 'data:image/png;base64,' });
Object.assign(globalThis, {
  window: globalThis, self: globalThis, Image: function Image() { return el(); }, HTMLCanvasElement: function () {}, screen: { width: 800, height: 600 }, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {}, requestAnimationFrame: (f) => setTimeout(f, 16), cancelAnimationFrame: (id) => clearTimeout(id),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { search: '', href: 'http://x/', hostname: 'x' },
  document: { createElement: el, createElementNS: el, documentElement: { style: {} }, addEventListener() {}, removeEventListener() {}, body: el(), readyState: 'complete', getElementsByTagName: () => [] },
});
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', maxTouchPoints: 0 }, configurable: true }); } catch { /* */ }
vm.runInThisContext(readFileSync(new URL('../lib/phaser.min.js', import.meta.url), 'utf8'), { filename: 'phaser.min.js' });
const { createSim } = await import('../js/botsing/sim.js');
const { towerX, BUILD, STACK, sideX } = await import('../js/botsing/rules.js');

const settle = (sim, max = 900) => { for (let i = 0; i < max; i++) { sim.step(); sim.drain(); if (i > 60 && sim.settled()) return i; } return max; };
/** A block built on `side`'s tower, `dx` px off its middle, settled. */
function build(sim, side, shape, element, dx = 0) {
  const e = sim.release(side, shape, element, towerX(side) + dx, sim.towerTopY(side) - BUILD.hang, 0);
  settle(sim);
  return e;
}
const rowsOf = (sim) => sim.snap().rows;

test('a snapshot brings back what this phone lost, and makes what it never had', () => {
  const mover = createSim({ seed: 7 });
  const other = createSim({ seed: 7 });
  for (const sim of [mover, other]) { build(sim, 0, 'plank', 'gras'); build(sim, 0, 'cube', 'water', 6); }
  // the mover builds once more; the other phone never heard of it, and its replay broke a block the mover still has
  const extra = build(mover, 1, 'crate', 'plof');
  const lost = other.entries.find((e) => e.role === 'built' && e.shape === 'cube');
  other.hurt(lost, 99);
  other.drain();
  assert.equal(lost.alive, false);
  const snap = mover.snap();
  mover.applySnap(snap);
  other.applySnap(JSON.parse(JSON.stringify(snap)));
  assert.equal(lost.alive, true);
  const made = other.entries.find((e) => e.id === extra.id);
  assert.ok(made && made.alive && made.shape === 'crate' && made.element === 'plof' && made.springReady);
  assert.deepEqual(rowsOf(other), rowsOf(mover));
  // the next block gets the same number on both phones
  assert.equal(other.release(0, 'pillar', 'vuur', towerX(0), -900, 0).id, mover.release(0, 'pillar', 'vuur', towerX(0), -900, 0).id);
});

test('a snapshot carries how heavy and grippy each block is, and its glass', () => {
  const mover = createSim({ seed: 7 });
  const other = createSim({ seed: 7 });
  const a = build(mover, 0, 'plank', 'gras');   // (a Rankanker: rooted, heavier, grippier)
  mover.hurt(mover.crowns[1], 3);
  mover.hurt(mover.crowns[1], 3);
  mover.hurt(mover.crowns[1], 3);
  mover.hurt(mover.crowns[1], 3);   // (its glass gone: the crown is light)
  mover.drain();
  const snap = mover.snap();
  mover.applySnap(snap);
  other.applySnap(snap);
  const b = other.entries.find((e) => e.id === a.id);
  assert.equal(b.rooted, true);
  assert.equal(b.body.density, a.body.density);
  assert.equal(b.body.frictionStatic, a.body.frictionStatic);
  assert.equal(other.crowns[1].hp, 0);
  assert.equal(other.crowns[1].body.density, mover.crowns[1].body.density);
});

test('from the same snapshot, the same throw plays out exactly the same on both phones', () => {
  const mover = createSim({ seed: 7 });
  const other = createSim({ seed: 7 });
  for (const sim of [mover, other]) { build(sim, 0, 'plank', null); build(sim, 1, 'cube', null); build(sim, 1, 'wedge', null, 14); }
  // different pasts: the other phone ran on for a while and was shoved about
  for (let i = 0; i < 97; i++) other.step();
  other.drain();
  for (const e of other.entries) if (e.alive && e.role !== 'crown') other.M.Body.setVelocity(e.body, { x: 1.5, y: -2 });
  for (let i = 0; i < 40; i++) other.step();
  other.drain();
  const snap = mover.snap();
  mover.applySnap(snap);
  other.applySnap(JSON.parse(JSON.stringify(snap)));
  for (const sim of [mover, other]) { sim.reseed(1234); sim.setWind(0.012); }
  for (const [shape, el, theta, power] of [['cube', 'plof', 0.62, 0.95], ['plank', 'vuur', 0.7, 0.9], ['pillar', 'gras', 0.55, 1]]) {
    for (const sim of [mover, other]) { sim.launch(0, shape, el, theta, sim.predict(0, shape, theta, power).perfect, power); settle(sim, 700); }
    assert.deepEqual(rowsOf(other), rowsOf(mover), `after the ${el} throw`);
    const s = mover.snap();
    mover.applySnap(s);
    other.applySnap(s);
  }
});

test('a block left with nothing under it falls (it never sleeps in the air)', () => {
  const sim = createSim({ seed: 7 });
  const low = build(sim, 0, 'plank', null);
  const high = build(sim, 0, 'cube', null);
  for (let i = 0; i < 400; i++) sim.step();
  sim.drain();
  assert.ok(low.body.isSleeping && high.body.isSleeping, 'the tower sleeps');
  const y0 = high.body.position.y;
  // the block under it is shoved away fast (a wave, vines, a blast: only that block is woken)
  sim.M.Sleeping.set(low.body, false);
  sim.M.Body.setVelocity(low.body, { x: 30, y: -1 });
  for (let i = 0; i < 90; i++) sim.step();
  sim.drain();
  assert.ok(high.body.position.y > y0 + 20, `the block above fell (${(high.body.position.y - y0).toFixed(1)} px)`);
  assert.ok(Math.abs(STACK.topY) > 0 && Math.abs(sideX(0)) > 0);
});
