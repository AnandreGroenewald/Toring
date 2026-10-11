// Free daily tries (1.13.1, the owner: "let's do the 3 and see how it goes", from Monday 12 Oct 2026): the day's first
// tries are free (the extra ones after the first cost 0), then "Nog 'n kans" sells up to four more (50, 100, 200, 400);
// the days before keep one free try. The setting is the game's own or the Worker's (GET /daily/config), kept for an
// offline start. The share line says the tries played of the free ones ("2/3").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { cleanTries, freeTriesFor, triesLadder, triesLabel, MAX_EXTRA } from '../js/core/tries.js';
import { buildShareText } from '../js/core/share.js';
import { DAILY_TRIES, DAILY_RETRY } from '../js/config.js';

const MON = '2026-10-12';
const SUN = '2026-10-11';
const result = (dateKey, heightM, score) => ({ mode: 'daily', dateKey, heightM, score, perfects: 3, blocksDropped: 20, grid: 'PPGS' });

test('the setting: 3 free tries from 12 Oct 2026; a bad word from the Worker keeps the game\'s own', () => {
  assert.deepEqual(DAILY_TRIES, { free: 3, from: '2026-10-12', maxFree: 4 });
  assert.deepEqual(cleanTries({ free: 2, from: '2026-11-01' }), { free: 2, from: '2026-11-01' });
  assert.deepEqual(cleanTries({ free: 9, from: 'Monday' }), { free: 3, from: '2026-10-12' });
  assert.deepEqual(cleanTries(null), { free: 3, from: '2026-10-12' });
  assert.equal(freeTriesFor(SUN), 1, 'Sunday keeps one free try');
  assert.equal(freeTriesFor(MON), 3);
  assert.deepEqual(triesLadder(SUN), [50, 100, 200, 400]);
  assert.deepEqual(triesLadder(MON), [0, 0, 50, 100, 200, 400]);
  assert.equal(MAX_EXTRA, 3 + DAILY_RETRY.prices.length);
});

test('the share label: "2/3" within the free tries, "3/3 +2🔁" past them, nothing on a one-try day', () => {
  assert.equal(triesLabel(1, 3), '1/3');
  assert.equal(triesLabel(3, 3), '3/3');
  assert.equal(triesLabel(5, 3), '3/3 +2🔁');
  assert.equal(triesLabel(2, 1), '');
  const r = { ...result(MON, 41.2, 900), dayNumber: 7, tryNo: 2, freeTries: 3 };
  assert.match(buildShareText(r, { url: 'https://x/' }).split('\n')[0], /^Stapel #7 🏗️ 41,2 m · 2\/3$/);
  const old = { ...result(SUN, 41.2, 900), dayNumber: 6, tryNo: 2, retry: true };
  assert.match(buildShareText(old, { url: 'https://x/' }).split('\n')[0], /^Stapel #6 🔁 🏗️ 41,2 m$/, 'a one-try day: as before');
});

test('from 12 Oct: two free tries after the first (no coins), then "Nog \'n kans" for coins; the best try counts', () => {
  const store = createStore(memoryBackend(), { now: () => Date.UTC(2026, 9, 12, 8) });
  store.earnCoins(80, { capped: false });
  store.startDaily(MON, result(MON, 0, 0));
  store.finishDaily(MON, result(MON, 20, 300));
  assert.deepEqual(store.dailyTries(MON), { free: 3, played: 1, extra: 0, maxExtra: 6 });
  assert.equal(store.nextRetryPrice(MON), 0);
  assert.deepEqual(store.buyDailyRetry(MON), { ok: true, coins: 80, price: 0, n: 1 }, 'a free try costs nothing');
  store.startDailyRetry(MON, result(MON, 0, 0));
  store.finishDailyRetry(MON, result(MON, 27, 410));
  assert.equal(store.nextRetryPrice(MON), 0, 'the third try is free too');
  store.buyDailyRetry(MON);
  store.startDailyRetry(MON, result(MON, 0, 0));
  store.finishDailyRetry(MON, result(MON, 22, 350));
  assert.deepEqual(store.dailyTries(MON), { free: 3, played: 3, extra: 2, maxExtra: 6 });
  assert.equal(store.nextRetryPrice(MON), 50, 'then "Nog \'n kans"');
  const best = store.getDailyBest(MON);
  assert.deepEqual([best.heightM, best.tries, best.retried], [27, 3, true]);
  assert.deepEqual(store.buyDailyRetry(MON), { ok: true, coins: 30, price: 50, n: 3 });
  // before 12 Oct nothing changed: one free try, then 50
  const sun = createStore(memoryBackend(), { now: () => Date.UTC(2026, 9, 11, 8) });
  sun.earnCoins(80, { capped: false });
  sun.startDaily(SUN, result(SUN, 0, 0));
  sun.finishDaily(SUN, result(SUN, 20, 300));
  assert.equal(sun.nextRetryPrice(SUN), 50);
  assert.deepEqual(sun.dailyTries(SUN), { free: 1, played: 1, extra: 0, maxExtra: 4 });
});

test('a free try taken and never played gives no coins back; the Worker\'s setting counts and is kept', () => {
  const backend = memoryBackend();
  const store = createStore(backend, { now: () => Date.UTC(2026, 9, 12, 8) });
  store.earnCoins(10, { capped: false });
  store.startDaily(MON, result(MON, 0, 0));
  store.finishDaily(MON, result(MON, 20, 300));
  store.buyDailyRetry(MON);
  assert.equal(store.refundOldRetries('2026-10-13'), 0, 'nothing was paid');
  assert.equal(store.getEconomy().coins, 10);
  // the Worker says 2 free tries from 12 Oct: the next start (offline too) knows it
  assert.deepEqual(store.setDailyTries({ free: 2, from: MON }), { free: 2, from: MON });
  const again = createStore(backend, { now: () => Date.UTC(2026, 9, 12, 9) });
  assert.deepEqual(again.getDailyTries(), { free: 2, from: MON });
  assert.equal(again.dailyTries('2026-10-14').free, 2);
});
