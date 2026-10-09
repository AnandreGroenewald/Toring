// "Nog 'n kans" (1.12): one more Daaglikse Toring try a day, bought with coins (js/core/storage.js). The
// better of the two tries counts (the stats' bests, the skyline, the board), the second try earns no
// streak, it can be bought once a day, only after the first try, and only with the coins; it lives under
// a key of its own, so a page still on 1.11 rebuilding the main blob can't lose it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { DAILY_RETRY } from '../js/config.js';

const DAY = '2026-10-09';
const result = (heightM, score, extra = {}) => ({ mode: 'daily', dateKey: DAY, heightM, score, perfects: 3, blocksDropped: 20, grid: 'PPGS', ...extra });

function setup(coins = 80) {
  const backend = memoryBackend();
  const t = Date.UTC(2026, 9, 9, 10);
  const store = createStore(backend, { now: () => t });
  store.earnCoins(coins, { capped: false });
  return { backend, store, t };
}

test('Nog \'n kans: only after the first try, once a day, and only with the coins', () => {
  const { store } = setup(80);
  assert.deepEqual(store.buyDailyRetry(DAY), { ok: false, reason: 'done', coins: 80 }, 'the first try comes first');
  store.startDaily(DAY, result(0, 0));
  store.finishDaily(DAY, result(31.3, 415));
  const streak = store.getStats(DAY).currentStreak;
  const bought = store.buyDailyRetry(DAY);
  assert.deepEqual(bought, { ok: true, coins: 80 - DAILY_RETRY.price });
  assert.equal(store.getEconomy().coins, 80 - DAILY_RETRY.price);
  assert.equal(store.getDailyRetry(DAY).status, 'ready');
  assert.equal(store.buyDailyRetry(DAY).reason, 'once', 'once a day');
  const poor = setup(20).store;
  poor.startDaily(DAY, result(0, 0));
  poor.finishDaily(DAY, result(10, 100));
  assert.deepEqual(poor.buyDailyRetry(DAY), { ok: false, reason: 'coins', coins: 20 });
  assert.equal(poor.getDailyRetry(DAY), null);
  // the second try plays and ends: the better try counts, no second streak day, the day's played count stays
  store.startDailyRetry(DAY, result(0, 0), { owner: 'tab' });
  assert.equal(store.getDailyRetry(DAY).status, 'playing');
  const s = store.finishDailyRetry(DAY, result(45.5, 700));
  assert.equal(s.applied, true);
  assert.equal(s.isNewBestHeight, true);
  assert.equal(s.currentStreak, streak, 'no extra streak');
  assert.equal(s.played, 1, 'still one day played');
  assert.deepEqual([store.getDailyBest(DAY).heightM, store.getDailyBest(DAY).retried], [45.5, true]);
  assert.equal(store.getDailyHeights(DAY)[DAY], 45.5, 'the skyline shows the better try');
  assert.equal(store.finishDailyRetry(DAY, result(99, 999)).applied, false, 'once');
});

test('Nog \'n kans: a worse second try leaves the first standing (still marked as two tries)', () => {
  const { store } = setup(60);
  store.startDaily(DAY, result(0, 0));
  store.finishDaily(DAY, result(31.3, 415));
  store.buyDailyRetry(DAY);
  store.startDailyRetry(DAY, result(0, 0));
  store.finishDailyRetry(DAY, result(12, 90));
  const best = store.getDailyBest(DAY);
  assert.deepEqual([best.heightM, best.score, best.retried], [31.3, 415, true]);
  assert.equal(store.getStats(DAY).bestHeightM, 31.3);
});

test('Nog \'n kans: a second try cut short counts as it stood; a 1.11 page can\'t lose it', () => {
  const { backend, store, t } = setup(60);
  store.startDaily(DAY, result(0, 0));
  store.finishDaily(DAY, result(20, 200));
  store.buyDailyRetry(DAY);
  store.startDailyRetry(DAY, result(0, 0), { owner: 'gone-tab' });
  store.saveDailyRetryProgress(DAY, result(26, 260));
  // a page still on 1.11 rewrites the main blob from the fields it knows
  const main = JSON.parse(backend.getItem('stapel.v1'));
  backend.setItem('stapel.v1', JSON.stringify({ ...main, settings: { sound: false } }));
  const later = createStore(backend, { now: () => t + 60 * 60 * 1000 });
  assert.equal(later.getDailyRetry(DAY).status, 'playing', 'kept under its own key');
  later.recoverUnfinished(DAY, { staleMs: 60 * 1000 });
  assert.equal(later.getDailyRetry(DAY).status, 'done');
  assert.equal(later.getDailyBest(DAY).heightM, 26);
});
