// (1.18) Die Kasteelreeks after the 17 Oct code review: a castle's check keeps every piece on a spot that takes it (and
// no 'constructor' switches the budget off); a siege given up at once pays no base coins; the keep is named by its day,
// so a new Daily never moves it (in the planner, your own test and the castle your friends attack).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCastle, costOf, budgetFor, lootFor, fitsSpot } from '../js/kasteel/rules.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
const P = await import('../js/kasteel/plan.js');

const blocks = (n) => Array.from({ length: n }, (_, i) => ({ s: 'brick', k: 1, x: 0, y: i * 2.24, r: 0, q: 'G' }));
function keepDays(days) {
  localStorage.setItem(P.DAYS_KEY, JSON.stringify(Object.fromEntries(days.map(([k, h]) => [k, { h, b: blocks(3) }]))));
}

test('a castle\'s check: pieces only where they may stand, and names of other things are no pieces', () => {
  const place = { w0: 'constructor', w1: 'ballista', g0: 'ballista', oil: 'ballista', f0: 'ballista', t0: 'ballista', t1: 'ballista', t2: 'ballista', t3: 'ballista', t4: 'ballista', f9: 'toString' };
  const c = cleanCastle(JSON.parse(JSON.stringify({ seed: 5, place, days: [] })));
  assert.deepEqual(Object.keys(c.place).sort(), ['t0', 't1', 't2', 't3', 't4']);
  assert.ok(costOf(c) <= budgetFor(0));
  assert.equal(costOf({ place: { w0: 'constructor', w1: 'boog' } }), 1);
  assert.ok(fitsSpot('t3', 'ballista') && fitsSpot('g1', 'ridder') && fitsSpot('oil', 'olie') && fitsSpot('f2', 'pieke'));
  assert.ok(!fitsSpot('w0', 'ballista') && !fitsSpot('w9', 'boog') && !fitsSpot('t5', 'boog') && !fitsSpot('w0', 'constructor'));
});

test('the loot: a siege played out pays its base; one given up only what its stars bring', () => {
  assert.deepEqual(lootFor(0), { coins: 5, trophies: -5 });
  assert.deepEqual(lootFor(0, false), { coins: 0, trophies: -5 });
  assert.equal(lootFor(2, false).coins, 20);
  mem.clear();
  for (let i = 0; i < 40; i++) P.recordSiege(0, false);
  assert.equal(P.castleStats().pending, 0);
  assert.equal(P.recordSiege(3).coins, 35);
});

test('the keep is named by its day: a new Daily never moves it, and it stays in the castle while the game keeps its day', () => {
  mem.clear();
  keepDays([['2026-10-12', 15], ['2026-10-13', 41], ['2026-10-14', 20]]);
  // a plan from before 1.18: its keep by its place (Tuesday is second, newest first), read by its day from now on
  P.savePlan({ seed: 77, plan: { keep: 1, place: { t0: 'boog' } } });
  assert.equal(P.loadPlan().plan.keepDay, '2026-10-13');
  keepDays([['2026-10-12', 15], ['2026-10-13', 41], ['2026-10-14', 20], ['2026-10-15', 30], ['2026-10-16', 12], ['2026-10-17', 18], ['2026-10-18', 25]]);
  const plan = P.loadPlan().plan;
  const info = P.myDayInfo(5, plan.keepDay);
  assert.equal(info.length, 5);
  assert.equal(info[P.keepIndex(plan, info)].dateKey, '2026-10-13');
  const snap = P.castleSnapshot();
  assert.equal(snap.days[snap.keep].dateKey, '2026-10-13');
  const friend = P.castleFromSnapshot(JSON.parse(JSON.stringify(snap)));
  assert.equal(friend.days[P.keepIndex(friend.plan, friend.days)].dateKey, '2026-10-13');
  // a foundation as the keep stays that foundation
  assert.equal(P.keepDayOf(3, info.slice(0, 1)), 'f2');
  assert.equal(P.keepIndex({ keepDay: 'f2' }, info.slice(0, 2)), 4);
  assert.equal(P.keepIndex({ keepDay: '2020-01-01' }, info), 0);
});
