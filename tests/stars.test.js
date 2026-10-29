// (29 Oct 2026, the owner: the stars "trade it in for coins", 100 for a coin) the tower's stars bank and its trade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EARN, MAX_STARS, addStars, tradeStars, cleanEconomy, defaultEconomy } from '../js/core/economy.js';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { mergeSaves } from '../js/core/cloudsave.js';

test('stars: a wallet keeps its bank (whole, never below 0 or above the top); old wallets start at 0', () => {
  assert.equal(defaultEconomy().stars, 0);
  assert.equal(cleanEconomy({ coins: 5 }).stars, 0);
  assert.equal(cleanEconomy({ stars: 1234.8 }).stars, 1234);
  assert.equal(cleanEconomy({ stars: -5 }).stars, 0);
  assert.equal(cleanEconomy({ stars: 'x' }).stars, 0);
  assert.equal(cleanEconomy({ stars: MAX_STARS * 2 }).stars, MAX_STARS);
  const r = addStars(defaultEconomy(), 2345);
  assert.equal(r.added, 2345);
  assert.equal(r.economy.stars, 2345);
});

test('stars: 100 trade for a coin; only the stars of the coins paid go, within the day cap', () => {
  assert.equal(EARN.starsPerCoin, 100);
  const day = '2026-10-29';
  // 2 345 stars: 23 coins, 45 stars stay
  let r = tradeStars({ ...defaultEconomy(), stars: 2345 }, { dayKey: day });
  assert.deepEqual([r.coins, r.stars, r.economy.stars, r.economy.coins, r.economy.earned.n], [23, 2300, 45, 23, 23]);
  // under 100: nothing
  r = tradeStars({ ...defaultEconomy(), stars: 99 }, { dayKey: day });
  assert.deepEqual([r.coins, r.stars, r.economy.stars], [0, 0, 99]);
  // 140 of the day's 150 already earned: 10 coins, 1 000 stars; the rest stays for tomorrow
  r = tradeStars({ ...defaultEconomy(), stars: 5000, earned: { day, n: 140 } }, { dayKey: day });
  assert.deepEqual([r.coins, r.stars, r.economy.stars, r.economy.earned.n], [10, 1000, 4000, 150]);
  // the cap full: nothing goes
  r = tradeStars({ ...defaultEconomy(), stars: 5000, earned: { day, n: 150 } }, { dayKey: day });
  assert.deepEqual([r.coins, r.economy.stars], [0, 5000]);
  // a new day: the cap starts again
  r = tradeStars({ ...defaultEconomy(), stars: 5000, earned: { day: '2026-10-28', n: 150 } }, { dayKey: day });
  assert.equal(r.coins, 50);
});

test('stars: the store banks a tower, quotes and trades (the quote changes nothing)', () => {
  const t = Date.parse('2026-10-29T10:00:00+02:00');
  const store = createStore(memoryBackend(), { now: () => t });
  assert.deepEqual(store.addStars(1250), { added: 1250, stars: 1250 });
  assert.deepEqual(store.starsQuote(), { coins: 12, stars: 1200 });
  assert.equal(store.getEconomy().stars, 1250);
  const tr = store.tradeStars();
  assert.deepEqual([tr.coins, tr.stars, tr.left], [12, 1200, 50]);
  assert.equal(store.getEconomy().coins, tr.total);
  assert.deepEqual(store.starsQuote(), { coins: 0, stars: 0 });
});

test('stars: an account merge adds what each side banked since the last sync', () => {
  const base = { econ: { ...defaultEconomy(), stars: 1000 } };
  const local = { econ: { ...defaultEconomy(), stars: 1500 } };
  const cloud = { econ: { ...defaultEconomy(), stars: 1300 } };
  const m = mergeSaves(local, cloud, base);
  assert.equal(m.econ.stars, 1800);
});
