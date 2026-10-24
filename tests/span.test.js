// (1.20) Ons dorp's week (js/core/span.js) and the Weektoring (js/core/weektower.js): South African days and weeks,
// Saturday's phases and whistle, the ticket and bombs, and what a bomb does to a tower.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPAN, sastOf, weekOf, dowOf, plusDays, saturdayOf, sastAt, whistleAt, phaseAt, crewLocked, weekStats,
  isSpanId, isSpanKey, isInvite, newSpanId, newSpanKey, newInvite, cleanCrewName, cleanSkin,
} from '../js/core/span.js';
import {
  dimsOf, cornersOf, topOf, heightOf, withAdds, floorAt, hit, addFloors, moveIn, peopleIn, cleanFloor, ROOMS, TOWER,
} from '../js/core/weektower.js';

const WK = '2026-10-26';   // a Monday

test('span: South African dates, weeks and the days of the week', () => {
  // 22:30 UTC on Friday 30 Oct is 00:30 on Saturday 31 Oct in South Africa
  const s = sastOf(Date.UTC(2026, 9, 30, 22, 30));
  assert.deepEqual(s, { key: '2026-10-31', dow: 6, h: 0, m: 30 });
  assert.equal(dowOf('2026-10-26'), 1);
  assert.equal(dowOf('2026-11-01'), 7);
  assert.equal(weekOf('2026-10-26'), WK);
  assert.equal(weekOf('2026-11-01'), WK);
  assert.equal(weekOf('2026-11-02'), '2026-11-02');
  assert.equal(plusDays('2026-12-31', 1), '2027-01-01');
  assert.equal(saturdayOf(WK), '2026-10-31');
  assert.equal(sastAt('2026-10-31', 6), Date.UTC(2026, 9, 31, 4, 0));
});

test('span: the week has three phases; the whistle is between 20:00 and 21:00, the same for one river', () => {
  const sat = saturdayOf(WK);
  assert.equal(phaseAt(sastAt(sat, 5, 59)).phase, 'bou');
  assert.equal(phaseAt(sastAt(sat, 6, 0)).phase, 'uitdaging');
  assert.equal(phaseAt(sastAt(sat, 20, 59)).phase, 'uitdaging');   // (without a whistle: until 21:00)
  assert.equal(phaseAt(sastAt(sat, 21, 0)).phase, 'kroning');
  assert.equal(phaseAt(sastAt('2026-11-01', 23, 59)).phase, 'kroning');
  assert.equal(phaseAt(sastAt('2026-11-02', 0, 0)).phase, 'bou');
  assert.equal(phaseAt(sastAt('2026-11-02', 0, 0)).week, '2026-11-02');
  const seen = new Set();
  for (let k = 0; k < 40; k++) {
    const w = whistleAt(WK, `R${k}`, 'salt');
    assert.ok(w >= sastAt(sat, 20, 0) && w <= sastAt(sat, 20, 59), 'between 20:00 and 20:59');
    assert.equal(w, whistleAt(WK, `R${k}`, 'salt'));
    seen.add(w);
  }
  assert.ok(seen.size > 10, 'rivers get different whistles');
  // without the river's secret salt the time can't be worked out: other salts give other times
  const salted = new Set([...Array(20)].map((_, k) => whistleAt(WK, 'R1', `s${k}`)));
  assert.ok(salted.size > 8);
  const w = whistleAt(WK, 'R1', 'x');
  assert.equal(phaseAt(w - 1, w).phase, 'uitdaging');
  assert.equal(phaseAt(w, w).phase, 'kroning');
  assert.equal(crewLocked(sastAt(sat, 0, 0)), true);
  assert.equal(crewLocked(sastAt('2026-11-01', 23, 59)), true);
  assert.equal(crewLocked(sastAt('2026-10-30', 23, 59)), false);
});

test('span: the ticket is 3 of the 5 weekdays; bombs are 1 per 25 m of Mon-Sat, at most 10', () => {
  const d = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [plusDays(WK, Number(k)), v]));
  assert.deepEqual(weekStats({}, WK), { weekdays: 0, ticket: false, metres: 0, bombs: 0 });
  assert.equal(weekStats(d({ 0: 40, 1: 30 }), WK).ticket, false);
  assert.equal(weekStats(d({ 0: 40, 2: 30, 4: 12 }), WK).ticket, true);
  // Saturday's Daily counts for bombs, not for the ticket; Sunday's for nothing
  const s = weekStats(d({ 0: 40, 5: 60, 6: 500 }), WK);
  assert.equal(s.weekdays, 1);
  assert.equal(s.metres, 100);
  assert.equal(s.bombs, 4);
  assert.equal(weekStats(d({ 0: 900, 1: 900 }), WK).bombs, SPAN.bombsMax);
  assert.equal(weekStats(d({ 0: 'x', 1: -4, 2: null }), WK).weekdays, 0);
  // a Daily from another week doesn't count
  assert.equal(weekStats({ '2026-10-19': 80 }, WK).metres, 0);
});

test('span: ids, keys, invites and crew names', () => {
  for (let k = 0; k < 20; k++) {
    assert.ok(isSpanId(newSpanId()));
    assert.ok(isSpanKey(newSpanKey()));
    assert.ok(isInvite(newInvite()));
  }
  assert.equal(isSpanId('ABCDEFG1'), false);
  assert.equal(isInvite('abcdef'), false);
  assert.equal(cleanCrewName('Die Bouers'), 'Die Bouers');
  assert.equal(cleanCrewName('x'), null);
  assert.equal(cleanCrewName('a'.repeat(40)), null);
  assert.equal(cleanSkin('goud'), 'goud');
  assert.equal(cleanSkin('<b>'), 'kleur');
});

// ------------------------------------------------------------------------------------------- the Weektoring
const F = (id, s, x, y, q = 'G', extra = {}) => ({ id, s, k: 1, c: 0, x, y, r: 0, q, sk: 'kleur', by: 'P', d: WK, cr: 0, p: 0, ...extra });
/** A straight stack of planks (1.6 m each), ratings in order. */
function stack(qs) {
  let y = 0;
  return withAdds(qs.map((q, i) => {
    const f = F(i + 1, 'plank', 0, y, q);
    y += 1.6;
    return f;
  }));
}

test('weektower: sizes, corners, height and what each floor added', () => {
  assert.deepEqual(dimsOf({ s: 'plank', k: 1 }), { W: 8, H: 1.6 });
  assert.deepEqual(dimsOf({ s: 'cube', k: 1.5 }), { W: 3.6, H: 3.6 });
  const tilted = { ...F(1, 'cube', 0, 0), r: Math.PI / 2 };
  const c = cornersOf(tilted).map((p) => p.map((v) => Math.round(v * 100) / 100));
  assert.deepEqual(c[2], [-2.4, 1.2]);
  assert.equal(heightOf([]), 0);
  const t = stack(['P', 'G', 'S']);
  assert.equal(heightOf(t), 4.8);
  assert.deepEqual(t.map((f) => f.a), [1.6, 1.6, 1.6]);
  // a floor beside the tower adds nothing
  const side = withAdds([...t, F(4, 'cube', 9, 0)]);
  assert.equal(side[3].a, 0);
  assert.equal(topOf(side[3]), 2.4);
});

test('weektower: a hit cracks a Perfek first, knocks out the rest; the tower above drops into its place', () => {
  const t = stack(['P', 'G', 'G', 'G']);
  assert.equal(floorAt(t, 0, 0.8), 0);
  assert.equal(floorAt(t, 30, 0.8), -1);
  assert.equal(floorAt(t, 0, 10), -1);
  const r1 = hit(t, 0);
  assert.equal(r1.cracked, true);
  assert.equal(heightOf(r1.floors), 6.4);
  const r2 = hit(r1.floors, 0);
  assert.equal(r2.cracked, false);
  assert.deepEqual(r2.removed, [1]);
  assert.equal(r2.lost, 1.6);
  assert.equal(heightOf(r2.floors), 4.8);
  assert.equal(r2.floors[0].y, 0, 'the floor above dropped to the ground');
  const g = hit(t, 2);
  assert.deepEqual(g.removed, [3]);
  assert.equal(heightOf(g.floors), 4.8);
  assert.equal(hit(t, -1).floors, t);
  assert.equal(hit(t, 99).removed.length, 0);
});

test('weektower: a crooked floor takes the crooked floor on top of it along; people fall into the river', () => {
  const t = stack(['G', 'S', 'S', 'G']).map((f) => ({ ...f, p: 2 }));
  const r = hit(t, 1);
  assert.deepEqual(r.removed, [2, 3]);
  assert.equal(r.lost, 3.2);
  assert.equal(r.people, 4);
  assert.equal(heightOf(r.floors), 3.2);
  assert.equal(peopleIn(r.floors), 4);
  // a crooked floor under a good one goes alone
  const t2 = stack(['G', 'S', 'G']);
  assert.deepEqual(hit(t2, 1).removed, [2]);
});

test('weektower: a build turn\'s floors are cleaned and numbered; nonsense is refused', () => {
  const t = stack(['G', 'G']);
  const add = [{ s: 'cube', k: 1, c: 3, x: 0.3, y: 3.2, r: 0.02, q: 'P', p: 9 }, { s: 'plank', k: 1.1, c: 1, x: -0.2, y: 5.6, r: 0, q: 'G' }];
  const out = addFloors(t, add, { max: 10, by: 'ME', day: '2026-10-27', skin: 'goud' });
  assert.equal(out.length, 4);
  assert.deepEqual(out.slice(2).map((f) => f.id), [3, 4]);
  assert.equal(out[2].sk, 'goud');
  assert.equal(out[2].by, 'ME');
  assert.equal(out[2].p, ROOMS.cube, 'people capped at the rooms');
  assert.ok(out[3].a > 0);
  assert.equal(addFloors(t, [...Array(11)].map(() => add[0]), { max: 10 }), null);
  assert.equal(addFloors(t, [{ ...add[0], s: 'house' }], { max: 10 }), null);
  assert.equal(addFloors(t, [{ ...add[0], x: 40 }], { max: 10 }), null);
  assert.equal(addFloors(t, [{ ...add[0], y: NaN }], { max: 10 }), null);
  assert.equal(addFloors(t, [{ ...add[0], y: 3.2 + TOWER.climbMax + 1 }], { max: 10 }), null);
  assert.equal(addFloors(t, 'x', { max: 10 }), null);
});

test('weektower: rescued people move into free rooms, lowest floors first', () => {
  const t = stack(['G', 'G', 'G']).map((f, i) => ({ ...f, p: i === 0 ? 3 : 0 }));
  const r = moveIn(t, 6);
  assert.equal(r.placed, 6);
  assert.deepEqual(r.floors.map((f) => f.p), [4, 4, 1]);
  const full = moveIn(r.floors, 50);
  assert.equal(full.placed, 3);
  assert.equal(peopleIn(full.floors), 12);
  assert.equal(cleanFloor({ ...t[0], extra: 'x' }).extra, undefined);
  assert.equal(cleanFloor({ s: 'house' }), null);
});
