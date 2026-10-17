// (1.16, after the 17 Oct 2026 review) Die Lewende Toring's battles hold together on two phones: the referee's "nobody
// left" rule gives the same last chance whichever of a mission and a turn's report comes first (and only a player's own
// count of their people brings them back), a result carries the people of the report that ended it, a mission must be
// one a joker can do; the town (js/game/living.js) brings back a floor the other game's report has standing with its
// owner and its people, never reports a window a mission or a fall emptied again, and counts everyone still on their way
// in when the game ends (the record is the most people at once, as the toast says).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnReferee, missionFits, cleanMission } from '../js/core/turns.js';
import { createLivingStore } from '../js/core/living.js';
import { memoryBackend } from '../js/core/storage.js';
import { TURNS } from '../js/config.js';

globalThis.Phaser ??= { BlendModes: { ADD: 1 } };
const { Living } = await import('../js/game/living.js');

/** A referee at the turn `upTo` (seat 0 first; everyone has people), seat 0 holding a joker. */
function refereeAt(upTo) {
  const ref = createTurnReferee({ first: 0, seed: 'abcdef12', v7: true, lv: true });
  ref.start();
  while (ref.n < upTo) ref.settled(ref.seat, { n: ref.n, r: ref.seat === 0 ? 'P' : 'G', pp: [5, 5] });
  return ref;
}
const results = (evs) => evs.filter((e) => e.type === 'result');

test('nobody left: the same last chance whether the mission or the victim\'s report reaches the referee first', () => {
  const start = Math.max(TURNS.lvSafeTurns, TURNS.jokerStreak7 * 2) + 2;   // seat 1's turn, seat 0 holds a joker
  const v = start % 2 === 0 ? start : start + 1;
  // A: the mission lands in the victim's (seat 1's) turn, then their report (nobody, as their game counts after it)
  const a = refereeAt(v);
  assert.equal(a.seat, 1);
  assert.ok(a.jokers[0] >= 1, 'seat 0 has a joker');
  assert.deepEqual(results(a.mission(0, [5, 0])), []);
  assert.deepEqual(results(a.settled(1, { n: v, r: 'S', pp: [5, 0] })), [], 'not at the end of the turn it came in');
  let ev = a.settled(0, { n: v + 1, r: 'G', pp: [5, 0] });
  assert.equal(ev.find((e) => e.type === 'turn').lc, true, 'their next turn is the last chance (said with it)');
  const ra = results(a.settled(1, { n: v + 2, r: 'S', pp: [5, 0] }))[0];
  // B: their report first (their game hadn't the mission yet: people), then the mission in seat 0's turn
  const b = refereeAt(v);
  assert.deepEqual(results(b.settled(1, { n: v, r: 'S', pp: [5, 3] })), []);
  assert.deepEqual(results(b.mission(0, [5, 0])), []);
  ev = b.settled(0, { n: v + 1, r: 'G', pp: [5, 0] });
  assert.equal(ev.find((e) => e.type === 'turn').lc, true);
  const rb = results(b.settled(1, { n: v + 2, r: 'S', pp: [5, 0] }))[0];
  assert.deepEqual([ra.winner, ra.reason], [0, 'people']);
  assert.deepEqual([rb.winner, rb.reason], [0, 'people'], 'the same outcome in the same turn');
  // ...and people back in the last chance save them
  const c = refereeAt(v);
  c.mission(0, [5, 0]);
  c.settled(1, { n: v, r: 'S', pp: [5, 0] });
  c.settled(0, { n: v + 1, r: 'G', pp: [5, 0] });
  assert.deepEqual(results(c.settled(1, { n: v + 2, r: 'P', pp: [5, 2] })), []);
  assert.deepEqual(c.empty, [false, false]);
});

test('nobody left: only a player\'s own count brings them back (the other game\'s count of them can lag behind)', () => {
  const ref = createTurnReferee({ first: 0, seed: 'abcdef12', v7: true, lv: true });
  ref.start();
  let res = null;
  for (let k = 0; k < 30 && !res; k++) {
    const seat = ref.seat;
    // seat 0's game still counts 4 of seat 1's people (they fell there only), seat 1's own game counts none
    res = results(ref.settled(seat, { n: ref.n, r: 'G', pp: seat === 0 ? [3, 4] : [3, 0] }))[0];
  }
  assert.ok(res, 'decided');
  assert.deepEqual([res.winner, res.reason], [0, 'people']);
});

test('a result carries the people of the report that ended it (not the report before)', () => {
  const ref = refereeAt(TURNS.lvSafeTurns + 2);
  const seat = ref.seat;
  let res = null;
  for (let k = 0; k < 10 && !res; k++) {
    const s = ref.seat;
    res = results(ref.settled(s, { n: ref.n, lost: s === seat, r: s === seat ? 'X' : 'G', pp: s === seat ? [7, 1] : [6, 2] }))[0];
  }
  assert.equal(res.reason, 'hearts');
  assert.deepEqual(res.people, [7, 1], 'the losing report\'s own count');
});

test('a mission must be one a joker can do: the sender\'s tribe, the other player\'s dropped floors, within its reach', () => {
  const ms = (o) => cleanMission({ kind: 'vuur', at: [360, -400], hits: [], ...o });
  const at = { seat: 0, first: 0, n: 9, tribe: 'vuur', pos: { 1: [360, -380], 3: [370, -1400], 5: [360, -430] } };
  assert.equal(missionFits(ms({ hits: [[1, 0], [5, 2]] }), at), true);
  assert.equal(missionFits(ms({ hits: [[1, 0]] }), { ...at, tribe: 'gras' }), false, 'another tribe');
  assert.equal(missionFits(ms({ hits: [[2, 0]] }), at), false, 'a floor of the sender\'s own (block 2 is turn 3\'s: seat 0)');
  assert.equal(missionFits(ms({ hits: [[9, 0]] }), at), false, 'not dropped yet');
  assert.equal(missionFits(ms({ hits: [[1, 5]] }), at), false, 'no such window');
  assert.equal(missionFits(ms({ hits: [[3, 0]] }), at), false, 'far from where it was aimed');
  assert.equal(missionFits(ms({ hits: [[7, 0]] }), at), true, 'a block no report has placed yet (the turn now)');
  const water = cleanMission({ kind: 'water', at: [360, -400], hits: [[1, 0], [3, 0], [5, 0], [7, 0]] });
  assert.equal(missionFits(water, { ...at, tribe: 'water' }), false, 'Waterwiel washes three floors at most');
  const gras = cleanMission({ kind: 'gras', at: [360, -400], hits: [[1, 0], [3, 1], [5, 0]] });
  assert.equal(missionFits(gras, { ...at, tribe: 'gras' }), true, 'the column, and one grab elsewhere');
});

// ------------------------------------------------------------------------------------------------- the town on a phone
/** A scene with just what Living uses, a clock of its own (run(ms) fires what is due). */
function scene() {
  let now = 0;
  const q = [];
  const any = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : any), apply: () => any });
  return {
    turns: { cur: { n: 1 } },
    textures: { exists: () => true, remove() {}, createCanvas: () => any, get: () => any },
    add: any, tweens: any, effects: null, water: null, topBlock: null, W: 720, over: false,
    cameras: { main: { scrollX: 0, scrollY: -2000, width: 720, height: 1280, zoom: 1 } },
    time: { delayedCall(ms, fn) { q.push({ at: now + ms, fn }); } },
    run(ms) {
      const end = now + ms;
      for (;;) {
        q.sort((x, y) => x.at - y.at);
        if (!q.length || q[0].at > end) break;
        const e = q.shift();
        now = e.at;
        e.fn();
      }
      now = end;
    },
  };
}
let uid = 0;
function block(index, y = 1000 - index * 50) {
  return {
    uid: ++uid, index, spec: {}, destroyed: false, state: 'settled', landedAt: 0, winImage: null,
    geom: { shape: 'crate', w: 84, h: 84, cx: 42, cy: 42 },
    body: { position: { x: 360, y }, angle: 0, velocity: { x: 0, y: 0 } },
    centerX: 360, centerY: y, left: 318, right: 402, top: y - 42, bottom: y + 42,
    setWindowTexture() {},
  };
}

test('a floor the other game\'s report brings back keeps its owner and its people (even after the sweep)', () => {
  for (const sweepFirst of [true, false]) {
    const sc = scene();
    const turn = { mine: true };
    const L = new Living(sc, { tribe: 'vuur', theirTribe: 'water', seat: 0, seed: 'm', reducedMotion: true, ownerOf: () => turn.mine });
    const b = block(3);
    L.landed(b);
    L.rated(b, 'P', 3);   // 4 rooms
    sc.run(2000);
    assert.equal(L.people, 4);
    turn.mine = false;   // their turn: my floor falls here only
    sc.turns.cur.n = 2;
    L.lost(b);
    b.destroyed = true;
    assert.equal(L.people, 0);
    if (sweepFirst) L.update(5000);
    const back = block(3);   // their report (this turn's) has it standing: it comes back
    L.landed(back);
    assert.equal(L.floorMine(back), true, `still mine (${sweepFirst ? 'swept' : 'not swept'})`);
    assert.equal(L.people, 4, 'my people are home again');
    assert.equal(L.jumped, 0);
    L.rated(back, 'P', 1);   // (the report's rating: no second set of rooms)
    sc.run(2000);
    assert.equal(L.people, 4);
  }
  // a floor that fell in an earlier turn (that turn's report had it down too) brings nobody back
  const sc = scene();
  const L = new Living(sc, { tribe: 'vuur', theirTribe: 'water', seat: 0, seed: 'm', reducedMotion: true, ownerOf: () => true });
  const b = block(5);
  L.landed(b);
  L.rated(b, 'G', 0);
  sc.run(1000);
  L.lost(b);
  b.destroyed = true;
  sc.turns.cur.n = 4;
  L.landed(block(5));
  assert.equal(L.people, 0);
});

test('a window a mission (or a fall) empties again never goes out with the turn\'s rooms', () => {
  const sc = scene();
  const L = new Living(sc, { tribe: 'vuur', theirTribe: 'water', seat: 1, seed: 'm', reducedMotion: true, ownerOf: () => true });
  const b = block(3);
  L.landed(b);
  L.rated(b, 'P', 3);   // 4 rooms on their way in
  sc.run(300);           // two home, two still coming
  const spots = L.spotsOf([[3, 0], [3, 1], [3, 2], [3, 3]]);
  L.strike('water', { x: 360, y: b.centerY }, spots, { mine: false, quiet: true });
  sc.run(2000);
  assert.deepEqual(L.takeOpened(), [], 'nobody to move in on the other phone');
  assert.equal(L.peopleBySeat(1, { coming: true })[1], 0);
  const c = block(4);
  L.landed(c);
  L.rated(c, 'G', 0);
  sc.run(50);
  L.lost(c);   // it falls before its people are in
  assert.deepEqual(L.takeOpened(), []);
});

test('the end of a game: everyone on the way in counts; the record is the most people at once', () => {
  const sc = scene();
  const L = new Living(sc, { tribe: 'vuur', seed: 'e', reducedMotion: true });
  const floors = [];
  for (let k = 0; k < 4; k++) {
    const b = block(k);
    floors.push(b);
    L.landed(b);
    L.rated(b, 'G', 0);
    sc.run(1000);
  }
  const goal = block(4);
  L.landed(goal);
  L.rated(goal, 'P', 5);   // 6 rooms: 4 here, 2 lower down
  sc.run(330);             // the goal is decided before they are all in
  sc.over = true;
  const s = L.summary();
  assert.equal(s.people, 10, 'all of them');
  assert.equal(L.peopleBySeat(0, { coming: true })[0], 10, 'as a referee counts them');
  sc.run(3000);
  assert.equal(L.people, 10, 'nobody moves in twice behind the card');
  // the peak: a fall after it doesn't take the record back
  for (const b of floors.slice(0, 2)) { b.state = 'lost'; L.lost(b); }
  const t = L.summary();
  assert.ok(t.peak > t.people);
  const store = createLivingStore(memoryBackend());
  store.record({ people: 3 });
  const rec = store.record({ people: t.people, peak: t.peak, met: t.met });
  assert.deepEqual([rec.best, rec.newBest], [t.peak, true]);
});
