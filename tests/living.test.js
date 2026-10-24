// (1.16) Die Lewende Toring: the rules of the rooms (js/core/living.js) and the battles in Blok vir Blok (the referee in
// js/core/turns.js: a joker spent on a mission, the people, nobody left loses, the most people after the last turn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomsFor, titleFor, titleProgress, createCasting, createLivingStore, CAST_IDS, LIVING } from '../js/core/living.js';
import { createTurnReferee, cleanPeople, cleanMission } from '../js/core/turns.js';
import { TURNS } from '../js/config.js';
import { memoryBackend } from '../js/core/storage.js';

test('rooms: Skeef 0, Goed 1, a Perfek 1 + the Perfeks in a row, six at most', () => {
  assert.equal(roomsFor('S', 0), 0);
  assert.equal(roomsFor('X', 0), 0);
  assert.equal(roomsFor('G', 3), 1);
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((c) => roomsFor('P', c)), [2, 3, 4, 5, 6, LIVING.maxRoomsPerLanding]);
});

test('titles: by people, with the way to the next one', () => {
  assert.equal(titleFor(4).now, null);
  assert.equal(titleFor(5).now.id, 'huisie');
  assert.equal(titleFor(25).now.id, 'woonstel');
  assert.equal(titleFor(25).next.id, 'hotel');
  assert.equal(titleFor(1000).next, null);
  assert.equal(titleProgress(0), 0);
  assert.equal(titleProgress(1000), 1);
});

test('casting: the same seed, the same people; (1.20) the whole cast, no tribe first', () => {
  const a = createCasting('s1', 'water');
  const b = createCasting('s1', 'water');
  const xs = Array.from({ length: 240 }, () => a.next());
  assert.deepEqual(xs.slice(0, 20), Array.from({ length: 20 }, () => b.next()));
  const water = xs.filter((x) => ['haai', 'seekat', 'duiker', 'brandweer'].includes(x.who)).length;
  assert.ok(water > 45 && water < 115, `a third or so are the old water tribe: ${water}/240`);
  assert.ok(xs.every((x) => CAST_IDS.includes(x.who)));
  assert.equal(new Set(xs.map((x) => x.who)).size, CAST_IDS.length, 'everyone comes');
});

test('the store: tribe, record, who lived there, junk cleaned', () => {
  const be = memoryBackend();
  const st = createLivingStore(be);
  assert.equal(st.tribe(), 'vuur');
  assert.equal(st.setTribe('gras'), 'gras');
  assert.equal(st.setTribe('nonsense'), 'gras');
  const r1 = st.record({ people: 12, met: ['boer', 'bytjie'], gold: ['boer'] });
  assert.deepEqual([r1.best, r1.newBest, r1.first], [12, true, true]);
  const r2 = st.record({ people: 7, met: ['boer'] });
  assert.deepEqual([r2.best, r2.newBest, r2.first], [12, false, false]);
  assert.equal(st.known('boer'), true);
  assert.equal(st.known('boer', true), true);
  assert.equal(st.known('haai'), false);
  be.setItem('stapel.v1.lewende', '{"tribe":"<x>","best":-4,"met":{"boer":"a","haai":2}}');
  const c = createLivingStore(be).get();
  assert.deepEqual([c.tribe, c.best, c.met], ['vuur', 0, { haai: 2 }]);
});

const play = (ref, rating = () => 'G', pp = () => null) => {
  const out = [];
  let guard = 0;
  while (!ref.result && guard++ < 400) {
    const seat = ref.seat;
    const ev = ref.settled(seat, { n: ref.n, r: rating(seat, ref.n), pp: pp(seat, ref.n) });
    out.push(...ev);
    if (!ev.length) break;
  }
  return out;
};

test('battles: a joker spent on a mission; the people from the reports; nobody left loses (from turn lvSafeTurns)', () => {
  const ref = createTurnReferee({ first: 0, seed: 'abcdef12', v7: true, lv: true });
  assert.equal(ref.lv, true);
  ref.start();
  assert.deepEqual(ref.mission(0, [1, 1]), [], 'no joker yet');
  // seat 0: three Perfeks in a row = a joker
  let ev = [];
  for (let k = 0; k < 6; k++) ev.push(...ref.settled(ref.seat, { n: ref.n, r: ref.seat === 0 ? 'P' : 'G', pp: [3, 2] }));
  assert.ok(ev.some((e) => e.type === 'joker' && e.seat === 0));
  assert.deepEqual(ref.jokers, [1, 0]);
  // early: nobody left is no loss yet
  const early = createTurnReferee({ first: 0, seed: 'abcdef12', v7: true, lv: true });
  early.start();
  ev = early.settled(0, { n: 1, r: 'S', pp: [0, 0] });
  assert.ok(!ev.some((e) => e.type === 'result'));
  ev = early.settled(1, { n: 2, r: 'G', pp: [0, 1] });
  assert.ok(!ev.some((e) => e.type === 'result'), `before turn ${TURNS.lvSafeTurns}`);
  // the mission takes the last of seat 1's people: one more turn for them (still nobody at its end: seat 0 wins)
  ev = ref.mission(0, [4, 0]);
  assert.equal(ev[0].type, 'mission');
  assert.ok(!ev.some((e) => e.type === 'result'), 'a last chance first');
  assert.deepEqual(ref.empty, [false, true]);
  assert.deepEqual(ref.jokers, [0, 0]);
  const saved = createTurnReferee({ init: ref.snapshot() });
  ev = ref.settled(ref.seat, { n: ref.n, r: 'G', pp: [4, 0] });   // (seat 0's turn: seat 1 is still waiting for theirs)
  assert.ok(!ev.some((e) => e.type === 'result'));
  ev = ref.settled(ref.seat, { n: ref.n, r: 'S', pp: [4, 0] });   // seat 1 lands Skeef: still nobody
  const res = ev.find((e) => e.type === 'result');
  assert.deepEqual([res.winner, res.reason, res.people], [0, 'people', [4, 0]]);
  // ...or lands well and is back
  saved.settled(saved.seat, { n: saved.n, r: 'G', pp: [4, 0] });
  ev = saved.settled(saved.seat, { n: saved.n, r: 'G', pp: [4, 1] });
  assert.ok(!ev.some((e) => e.type === 'result'));
  assert.deepEqual(saved.empty, [false, false]);
});

test('battles: both empty plays on; after the last turn the most people win; without lv nothing changes', () => {
  const ref = createTurnReferee({ first: 1, seed: 'abcdef12', v7: true, lv: true });
  ref.start();
  for (let k = 0; k < 8; k++) ref.settled(ref.seat, { n: ref.n, r: 'G', pp: [0, 0] });
  assert.equal(ref.result, null, 'nobody on either side: no winner by people');
  const long = createTurnReferee({ first: 0, seed: 'abcdef12', v7: true, lv: true });
  long.start();
  const evs = play(long, () => 'G', (seat, n) => (n < 10 ? [1, 1] : [5, 9]));
  const res = evs.find((e) => e.type === 'result');
  assert.deepEqual([res.reason, res.winner], ['turns', 1], 'seat 1 has more people at the end');
  const old = createTurnReferee({ first: 0, seed: 'abcdef12', v7: true });
  old.start();
  for (let k = 0; k < 8; k++) old.settled(old.seat, { n: old.n, r: 'G', pp: [0, 5] });
  assert.equal(old.result, null, 'no battles: the people never decide');
  assert.deepEqual(old.mission(0, [1, 1]), []);
  assert.equal(createTurnReferee({ first: 0, lv: true }).lv, false, 'the battles need the newer rules (v7)');
});

test('battles: a mission and the people are checked on the way in', () => {
  assert.deepEqual(cleanPeople([3, 0]), [3, 0]);
  assert.equal(cleanPeople([3]), null);
  assert.equal(cleanPeople([-1, 2]), null);
  assert.equal(cleanPeople([1.5, 2]), null);
  const ok = cleanMission({ kind: 'water', at: [300.5, -1200], hits: [[4, 0], [4, 1], [6, 2]], pp: [3, 1], extra: 'x' });
  assert.deepEqual(ok, { kind: 'water', at: [300.5, -1200], hits: [[4, 0], [4, 1], [6, 2]], pp: [3, 1] });
  assert.equal(cleanMission({ kind: 'lava', at: [1, 1], hits: [] }), null);
  assert.equal(cleanMission({ kind: 'vuur', at: [1], hits: [] }), null);
  assert.equal(cleanMission({ kind: 'vuur', at: [1, 1], hits: [[1, 9]] }), null, 'a window beyond 7');
  assert.equal(cleanMission({ kind: 'vuur', at: [1, 1], hits: Array(60).fill([1, 1]) }), null, 'too many');
  assert.deepEqual(cleanMission({ kind: 'gras', at: [1, 2], hits: [] }), { kind: 'gras', at: [1, 2], hits: [] });
});

test('tribes: the first one free, another for coins, one owned worn for nothing; junk cleaned', async () => {
  const { chooseTribe, cleanEconomy, defaultEconomy, TRIBE_PRICE } = await import('../js/core/economy.js');
  let e = defaultEconomy();
  e.coins = 1500;
  let r = chooseTribe(e, 'water');
  assert.deepEqual([r.ok, r.paid, r.economy.coins, r.economy.tribes.wear], [true, 0, 1500, 'water'], 'the first is free');
  r = chooseTribe(r.economy, 'gras');
  assert.deepEqual([r.ok, r.paid, r.economy.coins, r.economy.tribes.owned], [true, TRIBE_PRICE, 1500 - TRIBE_PRICE, ['water', 'gras']]);
  r = chooseTribe(r.economy, 'water');
  assert.deepEqual([r.ok, r.paid, r.economy.tribes.wear], [true, 0, 'water'], 'owned: just worn');
  const poor = chooseTribe(r.economy, 'vuur');
  assert.deepEqual([poor.ok, poor.why], [false, 'coins']);
  assert.deepEqual(chooseTribe(e, 'lava').ok, false);
  const c = cleanEconomy({ tribes: { owned: ['gras', 'x', 'gras'], wear: 'vuur' } });
  assert.deepEqual(c.tribes, { owned: ['gras'], wear: 'gras' });
  assert.deepEqual(cleanEconomy(null).tribes, { owned: [], wear: null });
});

test('tribes in the cloud save: bought on either device stays bought; the worn one follows the newer choice', async () => {
  const { mergeSaves } = await import('../js/core/cloudsave.js');
  const { cleanSave } = await import('../js/core/storage.js');
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const base = cleanSave(null);
  base.econ.coins = 3000;
  const s0 = cleanSave(base);
  const phone = clone(s0);
  phone.econ.tribes = { owned: ['water'], wear: 'water' };
  const web = clone(s0);
  web.econ.tribes = { owned: ['gras'], wear: 'gras' };
  web.econ.coins = 2000;
  const out = mergeSaves(cleanSave(phone), cleanSave(web), s0);
  assert.deepEqual(out.econ.tribes.owned, ['water', 'gras']);
  assert.ok(['water', 'gras'].includes(out.econ.tribes.wear));
  const kept = mergeSaves(cleanSave(phone), cleanSave(s0), s0);
  assert.deepEqual(kept.econ.tribes, { owned: ['water'], wear: 'water' }, 'an account copy without tribes keeps this device\'s');
});
