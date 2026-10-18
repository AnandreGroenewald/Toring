// (1.19 3D) Glybaan's rules (js/gly/rules.js): the lanes a block takes and how it turns, what each element does to each
// player (Stapel's own circle), the Shadow Gates' fit, the speed, and a track that can always be passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANES, ELEMENTS, lanesOf, moveLane, turn, effectOf, gateFit, speedAt, gapAt, createTrack, waysThrough, killerOf, victimOf } from '../js/gly/rules.js';

test('the lanes a block takes, and a swipe stays inside the chute', () => {
  assert.deepEqual(lanesOf('square', 'flat', 2), [2]);
  assert.deepEqual(lanesOf('rect', 'flat', 1), [1, 2]);
  assert.deepEqual(lanesOf('rect', 'tall', 3), [3]);
  assert.equal(moveLane('square', 'flat', 0, -1), 0);
  assert.equal(moveLane('square', 'flat', 3, 1), 3);
  assert.equal(moveLane('rect', 'flat', 2, 1), 2, 'lying, two lanes wide: its left lane goes to 2 at most');
  assert.equal(moveLane('rect', 'tall', 2, 1), 3);
});

test('a turn: the Rectangle stands up in the lane nearer the middle, lies down inside the chute', () => {
  assert.deepEqual(turn('rect', 'flat', 0), { orient: 'tall', lane: 1 });
  assert.deepEqual(turn('rect', 'flat', 2), { orient: 'tall', lane: 2 });
  assert.deepEqual(turn('rect', 'flat', 1, -1), { orient: 'tall', lane: 1 });
  assert.deepEqual(turn('rect', 'flat', 1, 1), { orient: 'tall', lane: 2 });
  assert.deepEqual(turn('rect', 'tall', 3), { orient: 'flat', lane: 2 });
  assert.deepEqual(turn('rect', 'tall', 0), { orient: 'flat', lane: 0 });
  assert.deepEqual(turn('square', 'flat', 3), { orient: 'flat', lane: 3 });
});

test('the elements follow Stapel\'s circle: what beats you ends the run, what you beat clouds your view, your own is safe', () => {
  assert.equal(killerOf('water'), 'gras');
  assert.equal(victimOf('water'), 'vuur');
  for (const me of ELEMENTS) {
    assert.equal(effectOf(me, 'stone'), 'kill');
    assert.equal(effectOf(me, killerOf(me)), 'kill');
    assert.equal(effectOf(me, victimOf(me)), 'blind');
    assert.equal(effectOf(me, me), 'safe');
  }
});

test('a Shadow Gate: exactly the hole is a Perfek, inside it goes through, any of it on the wall crashes', () => {
  assert.equal(gateFit('square', 'flat', 2, { lane: 2, w: 1, h: 1 }), 'perfect');
  assert.equal(gateFit('square', 'flat', 2, { lane: 1, w: 2, h: 1 }), 'fit');
  assert.equal(gateFit('square', 'flat', 0, { lane: 1, w: 2, h: 1 }), 'crash');
  assert.equal(gateFit('rect', 'flat', 1, { lane: 1, w: 2, h: 1 }), 'perfect');
  assert.equal(gateFit('rect', 'tall', 1, { lane: 1, w: 1, h: 2 }), 'perfect');
  assert.equal(gateFit('rect', 'flat', 1, { lane: 1, w: 1, h: 2 }), 'crash', 'lying, too wide for a standing hole');
  assert.equal(gateFit('rect', 'tall', 1, { lane: 1, w: 2, h: 1 }), 'crash', 'standing, too high for a lying hole');
});

test('always faster, never past 40 m/s; about a second between rows', () => {
  let last = 0;
  for (let d = 0; d < 20000; d += 250) {
    const v = speedAt(d);
    assert.ok(v > last && v < 40, `${d} m: ${v}`);
    last = v;
  }
  assert.ok(Math.abs(gapAt(15) / 15 - 1.05) < 1e-9);
  assert.ok(gapAt(40) / 40 < 0.9);
});

test('every row of a long track can be passed, by each shape and element, and the way on never jumps', () => {
  for (const shape of ['square', 'rect']) {
    for (const element of ELEMENTS) {
      for (const seed of [1, 7, 2026, 'daily-2026-10-18']) {
        const t = createTrack(seed, { shape, element });
        let prev = null;
        let gates = 0;
        for (let i = 0; i < 400; i++) {
          const row = t.next();
          const ways = waysThrough(row, shape, element);
          assert.ok(ways.length > 0, `${shape} ${element} ${seed}: row ${i} (${row.kind} at ${Math.round(row.at)} m) has no way through`);
          if (row.kind === 'gate') gates++;
          if (prev) {
            // from some way through the last row, a way through this one is at most two lanes over (one swipe a lane)
            const near = ways.some((w) => prev.some((p) => Math.abs(p.lane - w.lane) <= 2));
            assert.ok(near, `${shape} ${element} ${seed}: row ${i} is out of reach of the last one`);
            assert.ok(row.at - prevAt > 12, 'rows at least 12 m apart');
          }
          prev = ways;
          var prevAt = row.at;   // eslint-disable-line no-var
          assert.ok(row.cells.every((c) => c.lane >= 0 && c.lane < LANES));
        }
        assert.ok(gates > 10, `${shape} ${element} ${seed}: gates come (${gates})`);
      }
    }
  }
});

test('the same seed, the same track (a Daily slide could share one)', () => {
  const a = createTrack('x', { shape: 'rect', element: 'vuur' });
  const b = createTrack('x', { shape: 'rect', element: 'vuur' });
  for (let i = 0; i < 50; i++) assert.deepEqual(a.next(), b.next());
});
