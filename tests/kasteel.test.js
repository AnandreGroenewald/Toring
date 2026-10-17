// (1.17) Die Kasteelreeks with friends: the castle's rules (js/kasteel/rules.js: what may stand where, the budget, the
// loot, the check a castle passes before it travels) and the server's castles (server/src/kasteel.js: kept for
// neighbours to attack any time, news on the defender's castle, one result a minute per target).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, budgetFor, costOf, lootFor, cleanCastle, cleanDay, CASTLE } from '../js/kasteel/rules.js';
import { createDorp } from '../server/src/dorp.js';
import { createKasteel } from '../server/src/kasteel.js';
import { newTownId, newTownKey } from '../js/core/dorp.js';

const memStore = () => {
  const m = new Map();
  return { m, async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; }, async put(k, v) { m.set(k, structuredClone(v)); } };
};
const town = () => ({ id: newTownId(), key: newTownKey() });
const day = (n = 3) => ({ dateKey: '2026-10-14', h: 23.4, b: Array.from({ length: n }, (_, i) => ({ s: 'plank', k: 1, x: 0, y: i * 0.5, r: 0, q: 'P' })) });

test('the rules: the budget grows with the Daily Towers, the loot by stars, a castle is cleaned before it travels', () => {
  assert.equal(budgetFor(0), 16);
  assert.equal(budgetFor(3), 22);
  assert.equal(budgetFor(9), 26);
  assert.equal(costOf({ place: { w0: 'boog', t1: 'ballista', g0: 'ridder' } }), 6);
  assert.deepEqual(lootFor(0), { coins: 5, trophies: -5 });
  assert.deepEqual(lootFor(3), { coins: 35, trophies: 30 });
  assert.equal(cleanCastle(null), null);
  assert.equal(cleanCastle({ seed: 'x' }), null);
  // unknown spots and pieces go; a plan over the budget keeps what fits
  const greedy = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`w${i}`, 'ballista']).concat([['nope', 'boog'], ['g0', 'draak']]));
  const c = cleanCastle({ seed: 7, keep: 9, place: greedy, days: [] });
  assert.equal(c.keep, 0);
  assert.ok(costOf(c) <= budgetFor(0));
  assert.ok(!('nope' in c.place) && !('g0' in c.place));
  // blocks: unknown shapes and broken numbers go; a day with nothing left goes; at most five days of 120 blocks
  assert.equal(cleanDay({ b: [{ s: 'nope', x: 0, y: 0, r: 0 }] }), null);
  assert.equal(cleanDay({ b: [{ s: 'plank', x: NaN, y: 0, r: 0 }] }), null);
  const many = cleanCastle({ seed: 7, days: Array.from({ length: 9 }, () => day(400)) });
  assert.equal(many.days.length, CASTLE.days);
  assert.equal(many.days[0].b.length, CASTLE.blocks);
  assert.ok(Object.keys(PIECES).length === 6);
});

test('the server: your castle is kept for your neighbours; only a neighbour may attack it; the news says who and how', async () => {
  const store = memStore();
  const dorp = createDorp(store);
  const k = createKasteel(store);
  const anna = town();
  const jan = town();
  const sara = town();
  for (const [t, name] of [[anna, 'Anna'], [jan, 'Jan'], [sara, 'Sara']]) await dorp.handle('POST', '/dorp/sync', { ...t, name, gains: [] });
  // Anna and Jan are neighbours (a friend's link); Sara isn't
  assert.equal((await dorp.handle('POST', '/dorp/buur', { ...anna, buur: jan.id }))[0], 200);
  // saving needs the town's own key and a real castle
  assert.equal((await k.handle('POST', '/kasteel/save', { ...anna, key: newTownKey(), castle: { seed: 5, place: {}, days: [] } }))[0], 403);
  assert.equal((await k.handle('POST', '/kasteel/save', { ...anna, castle: { seed: 'x' } }))[0], 400);
  assert.equal((await k.handle('POST', '/kasteel/save', { id: newTownId(), key: newTownKey(), castle: { seed: 5 } }))[0], 404);
  const [s1, r1] = await k.handle('POST', '/kasteel/save', { ...anna, castle: { seed: 4242, keep: 1, place: { w0: 'boog', oil: 'olie' }, days: [day()] } });
  assert.equal(s1, 200);
  assert.ok(r1.ok);
  // Jan sees Anna's castle among his friends, and can fetch it to attack
  const [, home] = await k.handle('POST', '/kasteel/home', { ...jan });
  assert.deepEqual(home.friends.map((f) => [f.id, f.name]), [[anna.id, 'Anna']]);
  const [sc, castle] = await k.handle('GET', `/kasteel/c/${anna.id}`, null);
  assert.equal(sc, 200);
  assert.equal(castle.name, 'Anna');
  assert.equal(castle.castle.seed, 4242);
  assert.deepEqual(castle.castle.place, { w0: 'boog', oil: 'olie' });
  assert.equal(castle.castle.days[0].b.length, 3);
  assert.equal((await k.handle('GET', `/kasteel/c/${sara.id}`, null))[0], 404);   // (no castle yet)
  // Sara isn't Anna's neighbour: no siege; Jan's goes through and Anna hears of it
  assert.equal((await k.handle('POST', '/kasteel/siege', { ...sara, target: anna.id, stars: 3, destroyed: 99 }))[0], 403);
  assert.equal((await k.handle('POST', '/kasteel/siege', { ...jan, target: anna.id, stars: 9, destroyed: 140 }))[0], 200);
  // one result a minute per target
  assert.equal((await k.handle('POST', '/kasteel/siege', { ...jan, target: anna.id, stars: 1, destroyed: 20 }))[0], 429);
  const [, mine] = await k.handle('POST', '/kasteel/home', { ...anna });
  assert.equal(mine.newsN, 1);
  assert.equal(mine.seenN, 0);
  assert.deepEqual({ ...mine.news[0], at: 0 }, { n: 1, from: jan.id, name: 'Jan', stars: 3, destroyed: 100, at: 0 });
  // seen: the count follows
  const [, seen] = await k.handle('POST', '/kasteel/home', { ...anna, seen: 1 });
  assert.equal(seen.seenN, 1);
});

test('the server: a castle that held (no star) counts as its owner\'s win; news keeps the last 20', async () => {
  let t = 1_000_000;
  const store = memStore();
  const dorp = createDorp(store, { now: () => t });
  const k = createKasteel(store, { now: () => t });
  const anna = town();
  const jan = town();
  await dorp.handle('POST', '/dorp/sync', { ...anna, name: 'Anna', gains: [] });
  await dorp.handle('POST', '/dorp/sync', { ...jan, name: 'Jan', gains: [] });
  await dorp.handle('POST', '/dorp/buur', { ...anna, buur: jan.id });
  await k.handle('POST', '/kasteel/save', { ...anna, castle: { seed: 9, place: {}, days: [] } });
  for (let i = 0; i < 25; i++) {
    t += 61_000;
    assert.equal((await k.handle('POST', '/kasteel/siege', { ...jan, target: anna.id, stars: i % 2, destroyed: 10 }))[0], 200);
  }
  const [, home] = await k.handle('POST', '/kasteel/home', { ...anna });
  assert.equal(home.newsN, 25);
  assert.equal(home.news.length, 20);
  assert.equal(home.news[0].n, 6);
  const [, jans] = await k.handle('POST', '/kasteel/home', { ...jan });
  assert.equal(jans.friends[0].wins, 13);   // (the sieges with no star: Anna's castle held)
});
