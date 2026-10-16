// (1.17) Vrugteslag: the rules (js/core/slag.js): the castle, the four fruits as the owner set them, the defenders who
// stop them where they stand, the weak spots and combos, Herbou, the weather, Robot Rikus, the fruit basket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLAG, makeCastle, castlePeople, placeDefenders, botDefenders, weatherFor, rateImpact, applyShot, rebuild, nextCombo,
  winner, botShot, newBasket, cleanBasket, harvest, addFruit, battleFruit, battleReward,
} from '../js/core/slag.js';
import { createRng } from '../js/core/rng.js';

const flat = (rows, people) => {
  const c = makeCastle({ rows, people: rows * people });
  c.rows.forEach((r) => { r.people = people; r.cap = people; r.cracked = false; });
  return c;
};

test('a castle: 6-14 rows, 2-5 people a row, the same for the same seed', () => {
  const c = makeCastle({ rows: 10, people: 36, seed: 'x' });
  assert.equal(c.rows.length, 10);
  assert.equal(castlePeople(c), 36);
  assert.ok(c.rows.every((r) => r.people >= 2 && r.people <= 5));
  assert.deepEqual(makeCastle({ rows: 10, people: 36, seed: 'x' }).rows, c.rows);
  assert.equal(makeCastle({ rows: 99 }).rows.length, SLAG.rowsMax);
  assert.equal(makeCastle({ rows: 1 }).rows.length, SLAG.rowsMin);
});

test('the fruits as the owner set them: grapes splash over 4 blocks, a banana takes a whole block, juice floods 2 rows, a watermelon 6-10', () => {
  let c = flat(10, 4);
  let r = applyShot(c, { fruit: 'druiwe', row: 5, hit: 'G' });
  assert.deepEqual(r.hits.map((h) => h.row).sort((a, b) => a - b), [4, 5, 6, 7]);
  assert.equal(r.lost, 4);
  c = flat(10, 4);
  assert.equal(applyShot(c, { fruit: 'druiwe', row: 5, hit: 'P' }).hits.find((h) => h.row === 5).lost, 3);   // (2 x1.5)
  for (const n of [2, 5]) {
    c = flat(10, n);
    r = applyShot(c, { fruit: 'piesang', row: 3, hit: 'G' });
    assert.deepEqual(r.hits, [{ row: 3, lost: n }]);   // "no matter if its 2 or 5 people in that row"
  }
  c = flat(10, 4);
  r = applyShot(c, { fruit: 'sap', row: 6, hit: 'G' });
  assert.deepEqual(r.hits.map((h) => h.row).sort(), [5, 6]);
  assert.equal(r.lost, 8);
  for (const [hit, span] of [['P', 10], ['G', 8], ['S', 6]]) {
    c = flat(12, 5);
    r = applyShot(c, { fruit: 'waatlemoen', row: 6, hit });
    assert.equal(r.hits.length, span, hit);
  }
  // a miss does nothing
  c = flat(10, 4);
  assert.equal(applyShot(c, { fruit: 'waatlemoen', row: 5, hit: 'X' }).lost, 0);
});

test('the defenders stop their own fruit where they stand: swords grapes (and half the splash), the monkey bananas (thrown back), Joe juice (and grows), Sarel the watermelon', () => {
  let c = placeDefenders(flat(10, 4), { ridder: 5, aap: 3, joe: 8, sarel: 1 });
  let r = applyShot(c, { fruit: 'druiwe', row: 5, hit: 'G' });
  assert.equal(r.countered, 'ridder');
  assert.equal(r.lost, 0);   // (the splash of 1 halves to 0)
  r = applyShot(c, { fruit: 'piesang', row: 3, hit: 'P' });
  assert.deepEqual([r.countered, r.back, r.lost], ['aap', true, 0]);
  r = applyShot(c, { fruit: 'piesang', row: 4, hit: 'G' });   // (one row up: the monkey can't reach it)
  assert.equal(r.countered, null);
  assert.equal(r.lost, 4);
  r = applyShot(c, { fruit: 'sap', row: 8, hit: 'G' });
  assert.deepEqual([r.countered, r.lost, c.joeBig], ['joe', 0, true]);
  r = applyShot(c, { fruit: 'sap', row: 9, hit: 'G' });   // (big Joe: the juice beside him too)
  assert.equal(r.countered, 'joe');
  r = applyShot(c, { fruit: 'waatlemoen', row: 1, hit: 'P' });
  assert.deepEqual([r.countered, r.lost], ['sarel', 0]);
  assert.deepEqual([...c.revealed].sort(), ['aap', 'joe', 'ridder', 'sarel']);
  // and a fruit their defender doesn't stop goes through
  c = placeDefenders(flat(10, 4), { ridder: 5 });
  assert.equal(applyShot(c, { fruit: 'piesang', row: 5, hit: 'G' }).lost, 4);
});

test('weak spots: a cracked row takes double; combos: three hits, then a fire shot', () => {
  const c = flat(10, 5);
  applyShot(c, { fruit: 'druiwe', row: 5, hit: 'G' });   // rows 4-7 lose 1 and crack
  const r = applyShot(c, { fruit: 'druiwe', row: 5, hit: 'G' });
  assert.ok(r.cracked.includes(5));
  assert.equal(r.hits.find((h) => h.row === 5).lost, 2);
  let k = { n: 0, fire: false };
  k = nextCombo(k, { landed: true });
  k = nextCombo(k, { landed: true });
  assert.equal(k.fire, false);
  k = nextCombo(k, { landed: true });
  assert.deepEqual(k, { n: 0, fire: true });
  assert.deepEqual(nextCombo({ n: 2, fire: false }, { landed: false }), { n: 0, fire: false });
  const f = flat(10, 5);
  assert.equal(applyShot(f, { fruit: 'druiwe', row: 5, hit: 'G', fire: true }).hits.find((h) => h.row === 5).lost, 2);
});

test('rating a landing, rain, Herbou, the end, the weather', () => {
  assert.equal(rateImpact({ dx: 0.1, dy: 0.1 }), 'P');
  assert.equal(rateImpact({ dx: 0.6, dy: 0.3 }), 'G');
  assert.equal(rateImpact({ dx: 0.95, dy: 0.45 }), 'S');
  assert.equal(rateImpact({ dx: 0.95, dy: 0.45, rain: true }), 'X');
  assert.equal(rateImpact({ dx: 1.2 }), 'X');
  assert.equal(rateImpact({ onCastle: false }), 'X');
  const c = flat(6, 3);
  assert.equal(rebuild(c, 'P'), 4);
  assert.equal(c.rows.length, 7);
  assert.equal(rebuild(c, 'S'), 0);
  assert.equal(c.rows.length, 7);
  const a = flat(6, 3);
  const b = flat(6, 3);
  assert.equal(winner(a, b, 3), null);
  b.rows.forEach((r) => { r.people = 0; });
  assert.equal(winner(a, b, 3), 'a');
  assert.equal(winner(flat(6, 3), flat(6, 2), SLAG.maxTurns), 'a');
  const w = weatherFor('seed', 4);
  assert.deepEqual(weatherFor('seed', 4), w);
  assert.ok(w.wind >= -3 && w.wind <= 3);
});

test('Robot Rikus: defenders in real rows, shots at full rows with what he has left, mostly hits', () => {
  const c = flat(10, 4);
  const d = botDefenders(c, createRng('r1').next);
  for (const id of ['ridder', 'aap', 'joe', 'sarel']) assert.ok(d[id] >= 0 && d[id] < 10);
  const rng = createRng('r2');
  let hits = 0;
  for (let k = 0; k < 200; k++) {
    const s = botShot(flat(10, 4), { piesang: 0, sap: 0, waatlemoen: 0 }, { rand: rng.next });
    assert.equal(s.fruit, 'druiwe');   // (nothing else left)
    if (s.hit !== 'X') hits++;
  }
  assert.ok(hits > 150 && hits < 195, `${hits}`);
});

test('the fruit basket: a start, the Daily Tower fills it (capped), a battle takes at most a few', () => {
  assert.deepEqual(newBasket(), { piesang: 3, sap: 2, waatlemoen: 1 });
  assert.deepEqual(harvest({ perfects: 12, streak: 3 }), { piesang: 2, sap: 1, waatlemoen: 1 });
  assert.deepEqual(harvest({ perfects: 4, streak: 2 }), { piesang: 0, sap: 0, waatlemoen: 0 });
  assert.deepEqual(addFruit({ piesang: 8, sap: 5, waatlemoen: 0 }, { piesang: 5, sap: 1, waatlemoen: 1 }), { piesang: 9, sap: 5, waatlemoen: 1 });
  assert.deepEqual(cleanBasket({ piesang: -1, sap: 'x' }), newBasket());
  const f = battleFruit({ piesang: 9, sap: 1, waatlemoen: 3 });
  assert.deepEqual([f.piesang, f.sap, f.waatlemoen, f.druiwe], [3, 1, 1, Infinity]);
  assert.deepEqual(battleReward({ won: true, theirStart: 40 }), { coins: 40, trophies: 25, people: 4 });
  assert.deepEqual(battleReward({ won: false }), { coins: 10, trophies: -10, people: 0 });
});
