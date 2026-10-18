// (1.19 3D) Glybaan's rules (js/gly/rules.js): the lanes, what each element does to each man (Stapel's own circle), jumps
// and slides through barriers and over low hazards, the speed, a track that can always be passed, bags, missions, levels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANES, ELEMENTS, ACTS, moveLane, effectOf, passes, speedAt, gapAt, createTrack, waysThrough, killerOf, victimOf, CAN_BE_LOW, runXp, MISSIONS, missionReward, newMission, cleanMissions, levelOf, levelReward } from '../js/gly/rules.js';
import { rng } from '../js/kasteel/world.js';

test('a swipe moves one lane and stays inside the slide', () => {
  assert.equal(moveLane(0, -1), 0);
  assert.equal(moveLane(0, 1), 1);
  assert.equal(moveLane(3, 1), 3);
  assert.equal(moveLane(2, -1), 1);
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

test('a low beam wants a jump, a high one a slide, a wall its gap; a deadly hazard is passed only by jumping it, when low', () => {
  const low = { kind: 'bar', bar: 'low', cells: [] };
  const high = { kind: 'bar', bar: 'high', cells: [] };
  const wall = { kind: 'wall', gap: 2, cells: [] };
  for (const lane of [0, 3]) {
    assert.deepEqual(ACTS.filter((a) => passes(low, lane, a, 'water')), ['jump']);
    assert.deepEqual(ACTS.filter((a) => passes(high, lane, a, 'water')), ['slide']);
  }
  assert.ok(passes(wall, 2, 'run', 'water') && !passes(wall, 1, 'run', 'water') && !passes(wall, 1, 'jump', 'water'));
  // water: grass kills it; a whirlpool (water, your own) is safe; fire clouds the view
  const row = { kind: 'hazards', cells: [{ lane: 0, type: 'gras', low: false }, { lane: 1, type: 'stone', low: false }, { lane: 2, type: 'vuur', low: true }, { lane: 3, type: 'water', low: true }] };
  assert.deepEqual(ACTS.filter((a) => passes(row, 0, a, 'water')), [], 'tall vines: no way');
  assert.deepEqual(ACTS.filter((a) => passes(row, 1, a, 'water')), [], 'a boulder: no way');
  assert.deepEqual(ACTS.filter((a) => passes(row, 2, a, 'water')), ACTS, 'lava only clouds a water man');
  assert.deepEqual(ACTS.filter((a) => passes(row, 3, a, 'water')), ACTS, 'his own whirlpool');
  const lava = { kind: 'hazards', cells: [{ lane: 1, type: 'vuur', low: true }] };
  assert.deepEqual(ACTS.filter((a) => passes(lava, 1, a, 'gras')), ['jump'], 'lava kills grass: jump it');
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

test('every row of a long track can be passed by each element, and the way on is never out of reach', () => {
  for (const element of ELEMENTS) {
    for (const seed of [1, 7, 2026, 'daily-2026-10-18']) {
      const t = createTrack(seed, { element });
      let prev = null;
      let prevAt = 0;
      let bars = 0;
      let walls = 0;
      for (let i = 0; i < 500; i++) {
        const row = t.next();
        const ways = waysThrough(row, element);
        assert.ok(ways.length > 0, `${element} ${seed}: row ${i} (${row.kind} at ${Math.round(row.at)} m) has no way through`);
        if (row.kind === 'bar') bars++;
        if (row.kind === 'wall') walls++;
        if (prev) {
          // from some way through the last row, a way through this one is at most two lanes over (one swipe a lane)
          assert.ok(ways.some((w) => prev.some((p) => Math.abs(p.lane - w.lane) <= 2)), `${element} ${seed}: row ${i} is out of reach of the last one`);
          assert.ok(row.at - prevAt > 12, 'rows at least 12 m apart');
        }
        prev = ways;
        prevAt = row.at;
        assert.ok(row.cells.every((c) => c.lane >= 0 && c.lane < LANES && (!c.low || CAN_BE_LOW[c.type])), 'only water and fire lie low');
        assert.ok(row.coins.every((c) => !c.high || row.cells.some((x) => x.lane === c.lane && x.low)), 'coins in the air only over something to jump');
      }
      assert.ok(bars > 10 && walls > 3, `${element} ${seed}: barriers come (${bars} beams, ${walls} walls)`);
    }
  }
});

test('bags of coins only in hazards of your own element, about half of them, 3 to 20 coins', () => {
  for (const element of ELEMENTS) {
    const tr = createTrack(99, { element });
    let own = 0;
    let bags = 0;
    for (let i = 0; i < 600; i++) {
      for (const c of tr.next().cells) {
        if (c.type !== element) { assert.equal(c.bag, undefined, 'no bag in another element or stone'); continue; }
        own++;
        if (c.bag) { bags++; assert.ok(c.bag >= 3 && c.bag <= 20, `bag ${c.bag}`); }
      }
    }
    assert.ok(own > 30 && bags / own > 0.35 && bags / own < 0.75, `${element}: ${bags} bags in ${own} of its own`);
  }
});

test('the same seed, the same track (a Daily slide could share one)', () => {
  const a = createTrack('x', { element: 'vuur' });
  const b = createTrack('x', { element: 'vuur' });
  for (let i = 0; i < 80; i++) assert.deepEqual(a.next(), b.next());
});

test('XP: metres, barriers, perfect timing, hazards jumped', () => {
  assert.equal(runXp({ d: 512.7, bars: 3, perfects: 2, jumps: 4 }), 512 + 60 + 60 + 20);
  assert.equal(runXp({}), 0);
});

test('missions: three of different kinds, harder (and better paid) every third one done, rubbish kept made right', () => {
  const r = rng(5);
  const ms = cleanMissions(null, r, 0);
  assert.equal(ms.length, 3);
  assert.equal(new Set(ms.map((m) => m.kind)).size, 3);
  for (const m of ms) { assert.equal(m.n, MISSIONS[m.kind].targets[0]); assert.equal(m.r, 15); assert.equal(m.p, 0); }
  const later = newMission(r, [], 9);
  assert.equal(later.n, MISSIONS[later.kind].targets[3]);
  assert.equal(later.r, missionReward(3));
  assert.equal(newMission(r, Object.keys(MISSIONS).slice(1), 0).kind, Object.keys(MISSIONS)[0], 'only the kind left');
  const fixed = cleanMissions([{ kind: 'coins', n: 1e9, p: -5, r: 1e9 }, { kind: 'nope' }, { kind: 'coins', n: 15 }, { kind: 'dist', n: 400, done: true }, 'x'], r, 0);
  assert.equal(fixed.length, 3);
  assert.equal(new Set(fixed.map((m) => m.kind)).size, 3);
  assert.deepEqual(fixed[0], { kind: 'coins', n: 100, p: 0, r: 40 });
  assert.ok(fixed.every((m) => m.p >= 0 && m.p < m.n && m.r >= 15 && m.r <= 40));
});

test('levels: 400 XP to level 2, then 800 more, then 1 200 more; each level pays more', () => {
  assert.deepEqual(levelOf(0), { level: 1, into: 0, need: 400 });
  assert.deepEqual(levelOf(399), { level: 1, into: 399, need: 400 });
  assert.deepEqual(levelOf(400), { level: 2, into: 0, need: 800 });
  assert.deepEqual(levelOf(1300), { level: 3, into: 100, need: 1200 });
  assert.deepEqual(levelOf(-5), levelOf(0));
  assert.deepEqual(levelOf('rubbish'), levelOf(0));
  assert.ok(levelReward(3) > levelReward(2) && levelReward(50) === levelReward(10));
});
