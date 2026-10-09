// Merging saves (1.13, js/core/cloudsave.js + the store's exportSave/importSave/resetProgress): a phone and
// the website signed in to one account. Nothing earned on either side is lost, nothing counts twice, a
// choice made on one side wins, and a tower being played right now stays out of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, cleanSave } from '../js/core/storage.js';
import { mergeSaves, sameSave, fitSave } from '../js/core/cloudsave.js';
import { addDays } from '../js/core/daily.js';

const D1 = '2026-10-05';
const at = (key, h = 10) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10), h);
const result = (dateKey, heightM, score = heightM * 10, perfects = 2) => ({ mode: 'daily', dateKey, heightM, score, perfects, blocksDropped: 20, grid: 'PG' });

/** A device: its own storage and clock. */
function device(start = D1) {
  const clock = { t: at(start) };
  const backend = memoryBackend();
  const store = createStore(backend, { now: () => clock.t });
  return {
    store, backend, clock,
    day(key) { clock.t = at(key); },
    play(key, heightM, opts = {}) {
      this.day(key);
      store.startDaily(key, result(key, 0));
      store.finishDaily(key, result(key, heightM, opts.score, opts.perfects));
    },
  };
}

/** One sync as js/account.js does it: merge, take the result here, and the account keeps it. */
function sync(dev, account) {
  const merged = mergeSaves(dev.store.exportSave(), account.save, dev.base, { today: dev.store.exportSave().main.stats.lastDateKey });
  dev.store.importSave(merged);
  account.save = merged;
  dev.base = merged;
  return merged;
}

test('the first sign-in: a new phone takes the account; the first device gives the account its progress', () => {
  const web = device();
  web.play(D1, 30);
  web.store.earnCoins(80, { capped: false });
  const account = { save: null };
  const first = sync(web, account);
  assert.ok(sameSave(first, web.store.exportSave()));
  assert.equal(first.econ.coins, web.store.getEconomy().coins);
  const phone = device();
  sync(phone, account);
  assert.ok(sameSave(phone.store.exportSave(), web.store.exportSave()), 'the new phone shows the same progress');
  assert.equal(phone.store.getStats(D1).bestHeightM, 30);
  assert.equal(phone.store.getDailyBest(D1).heightM, 30, "today's tower is done there too: no second free try");
});

test('two piles that grew apart add up; a day both played counts once, with the better tower', () => {
  const phone = device();
  const web = device();
  phone.play(D1, 20, { perfects: 3 });
  phone.play(addDays(D1, 1), 25, { perfects: 4 });
  web.play(addDays(D1, 1), 40, { perfects: 6 });   // the same day, played on the website too
  web.play(addDays(D1, 2), 35, { perfects: 1 });
  phone.store.earnCoins(100, { capped: false });
  web.store.earnCoins(60, { capped: false });
  const phoneCoins = phone.store.getEconomy().coins;
  const webCoins = web.store.getEconomy().coins;
  const account = { save: null };
  sync(web, account);
  const m = sync(phone, account);
  assert.equal(m.econ.coins, phoneCoins + webCoins, 'coins earned apart add up');
  assert.deepEqual(Object.keys(m.main.daily), [D1, addDays(D1, 1), addDays(D1, 2)]);
  assert.equal(m.main.daily[addDays(D1, 1)].result.heightM, 40, 'the better tower of the day both played');
  assert.equal(m.main.stats.played, 3, 'three days, not four');
  assert.equal(m.main.stats.totalPerfects, 3 + 6 + 1, "the dropped tower's Perfeks don't count");
  assert.equal(m.main.stats.streak, 3, 'the days join up into one streak');
  assert.equal(m.main.stats.bestHeightM, 40);
  // both devices now agree, and another sync changes nothing
  sync(web, account);
  assert.ok(sameSave(web.store.exportSave(), phone.store.exportSave()));
  const again = mergeSaves(phone.store.exportSave(), account.save, phone.base);
  assert.ok(sameSave(again, account.save));
});

test('after joining: each side adds only what it did since the last sync, in either order', () => {
  const phone = device();
  const web = device();
  phone.play(D1, 20);
  phone.store.earnCoins(200, { capped: false });
  const account = { save: null };
  sync(phone, account);
  sync(web, account);
  const start = account.save.econ.coins;
  // apart: the phone earns 50, the website buys a power-up and a second try
  phone.store.earnCoins(50, { capped: false });
  web.store.buyPowerup('slow');
  const spent = start - web.store.getEconomy().coins;
  assert.ok(spent > 0);
  web.store.buyDailyRetry(D1);
  const spentAll = start - web.store.getEconomy().coins;
  sync(web, account);
  sync(phone, account);
  sync(web, account);
  const coins = start + 50 - spentAll;
  assert.equal(phone.store.getEconomy().coins, coins);
  assert.equal(web.store.getEconomy().coins, coins);
  assert.equal(phone.store.getEconomy().stock.slow, 1, 'the power-up reached the phone');
  assert.equal(phone.store.getDailyRetry(D1).status, 'ready', 'the second try too');
  // the same thing synced twice is still counted once
  sync(phone, account);
  sync(phone, account);
  assert.equal(phone.store.getEconomy().coins, coins);
});

test('a second try bought on the phone can be played on the website; a better one counts everywhere', () => {
  const phone = device();
  phone.play(D1, 20);
  phone.store.earnCoins(100, { capped: false });
  const account = { save: null };
  sync(phone, account);
  const web = device();
  sync(web, account);
  phone.store.buyDailyRetry(D1);
  sync(phone, account);
  sync(web, account);
  web.store.startDailyRetry(D1, result(D1, 0));
  web.store.finishDailyRetry(D1, result(D1, 33));
  sync(web, account);
  sync(phone, account);
  assert.deepEqual([phone.store.getDailyBest(D1).heightM, phone.store.getDailyBest(D1).retried], [33, true]);
});

test('choices: the side that changed it wins; the first time, the account keeps its own', () => {
  const phone = device();
  const web = device();
  phone.store.setDuelName('Anna');
  web.store.setDuelName('Gas');
  // each has its leaderboard number (js/account.js makes sure of one before joining)
  const phoneNo = phone.store.getBoardPlayer();
  assert.notEqual(web.store.getBoardPlayer(), phoneNo);
  const account = { save: null };
  sync(phone, account);
  sync(web, account);
  assert.equal(web.store.getDuel().name, 'Anna', "the account's name, not the newcomer's");
  web.store.setDuelName('Anna B');
  web.store.setBoardHidden(true);
  sync(web, account);
  sync(phone, account);
  assert.equal(phone.store.getDuel().name, 'Anna B', 'changed on the website: it wins');
  assert.equal(phone.store.getBoardHidden(), true);
  phone.store.setBoardHidden(false);
  sync(phone, account);
  sync(web, account);
  assert.equal(web.store.getBoardHidden(), false);
  assert.equal(web.store.getBoardPlayer(), phoneNo, "one leaderboard number for the account: the first device's");
  assert.equal(phone.store.getBoardPlayer(), phoneNo);
});

test('ranks: matches on both sides add up within a month; a new month on one side wins', () => {
  const phone = device();
  const web = device();
  const account = { save: null };
  phone.day(D1);
  web.day(D1);
  sync(phone, account);
  sync(web, account);
  phone.store.recordDuelRank({ outcome: 'won', live: true, mode: 'race' });
  const afterPhone = phone.store.getSeasonRank('race').points;
  web.store.recordDuelRank({ outcome: 'won', live: true, mode: 'race' });
  const afterWeb = web.store.getSeasonRank('race').points;
  sync(phone, account);
  sync(web, account);
  assert.equal(web.store.getSeasonRank('race').points, afterPhone + afterWeb, 'two wins from zero');
  assert.equal(web.store.getSeasonRank('race').played, 2);
  // November begins on the phone (a tier down, last month's badge): that is the rank now
  phone.day('2026-11-02');
  const nov = phone.store.getSeasonRank('race');
  assert.equal(nov.season, '2026-11');
  sync(phone, account);
  sync(web, account);
  const w = web.store.exportSave().econ.ranks.race;
  assert.equal(w.season, '2026-11');
  assert.equal(w.points, nov.points);
  assert.ok(web.store.getEconomy().owned.badge.some((b) => b.startsWith('s-')), "last month's badge came along");
});

test('the weekkis follows the later box; a tower being played right now never leaves this device', () => {
  const phone = device();
  phone.play(D1, 20);
  phone.store.openWeekBox(D1);
  const account = { save: null };
  sync(phone, account);
  const web = device();
  sync(web, account);
  phone.play(addDays(D1, 1), 22);
  phone.store.openWeekBox(addDays(D1, 1));
  // the website is in the middle of tomorrow's tower
  web.day(addDays(D1, 2));
  web.store.startDaily(addDays(D1, 2), result(addDays(D1, 2), 5));
  assert.equal(web.store.exportSave().main.daily[addDays(D1, 2)], undefined, 'not in the save');
  sync(phone, account);
  sync(web, account);
  assert.equal(web.store.getWeek().day, 2);
  assert.equal(web.store.getDaily(addDays(D1, 2)).status, 'playing', 'still being played here');
  web.store.finishDaily(addDays(D1, 2), result(addDays(D1, 2), 30));
  sync(web, account);
  sync(phone, account);
  assert.equal(phone.store.getStats(addDays(D1, 2)).currentStreak, 3);
});

test('signing out starts this device over; settings stay; signing in again brings it all back', () => {
  const phone = device();
  phone.play(D1, 20);
  phone.store.earnCoins(90, { capped: false });
  phone.store.setSettings({ sound: false });
  const account = { save: null };
  sync(phone, account);
  const before = phone.store.exportSave();
  phone.store.resetProgress();
  phone.base = null;
  assert.equal(phone.store.getEconomy().coins, 0);
  assert.equal(phone.store.getStats(D1).played, 0);
  assert.equal(phone.store.getSettings().sound, false, 'settings stay');
  sync(phone, account);
  assert.ok(sameSave(phone.store.exportSave(), before));
});

test('broken or strange saves never break the merge; caps hold; old days drop off', () => {
  const phone = device();
  phone.play(D1, 20);
  const local = phone.store.exportSave();
  for (const junk of [null, 'nonsense', 42, [], { v: 9, econ: { coins: -500 } }]) {
    const m = mergeSaves(local, junk, null);
    assert.equal(m.econ.coins, local.econ.coins);
    assert.equal(m.main.stats.played, 1);
  }
  const rich = cleanSave({ econ: { coins: 999990 } });
  assert.equal(mergeSaves(cleanSave({ econ: { coins: 999990 } }), rich, null).econ.coins, 999999, 'never past the wallet cap');
  const spentElsewhere = mergeSaves(cleanSave({ econ: { coins: 0 } }), cleanSave({ econ: { coins: 10 } }), cleanSave({ econ: { coins: 50 } }));
  assert.equal(spentElsewhere.econ.coins, 0, 'never below zero');
  const old = mergeSaves(local, null, null, { today: addDays(D1, 120) });
  assert.deepEqual(old.main.daily, {}, 'days older than the store keeps');
  assert.equal(old.main.stats.played, 1, 'but they still count');
});

// --- the review's cases (9 Oct 2026) ----------------------------------------------------------------------

test('the weekkis: a device that played on an old copy and started the week over is put right by the merged days', () => {
  const phone = device();
  phone.play(D1, 20);
  phone.store.openWeekBox(D1);
  const account = { save: null };
  sync(phone, account);
  const web = device();
  sync(web, account);
  // the phone plays the next day; the website, not synced yet, the day after: it thinks a day was missed
  phone.play(addDays(D1, 1), 22);
  phone.store.openWeekBox(addDays(D1, 1));
  web.play(addDays(D1, 2), 24);
  assert.equal(web.store.openWeekBox(addDays(D1, 2)).day, 1, 'on its old copy the week started over');
  sync(phone, account);
  sync(web, account);
  assert.equal(web.store.getWeek().day, 3, 'three days in a row: box 3');
  assert.equal(web.store.getStats(addDays(D1, 2)).currentStreak, 3);
});

test('a second try played on both devices: its Perfeks count once', () => {
  const phone = device();
  const web = device();
  for (const d of [phone, web]) {
    d.play(D1, 20, { perfects: 1 });
    d.store.earnCoins(100, { capped: false });
  }
  const account = { save: null };
  sync(phone, account);
  sync(web, account);
  const before = account.save.main.stats.totalPerfects;
  for (const [d, p] of [[phone, 4], [web, 6]]) {
    d.store.buyDailyRetry(D1);
    d.store.startDailyRetry(D1, result(D1, 0));
    d.store.finishDailyRetry(D1, result(D1, 30 + p, undefined, p));
  }
  sync(phone, account);
  sync(web, account);
  assert.equal(account.save.main.stats.totalPerfects, before + 6, 'the kept try\'s 6, not 4 + 6');
  assert.equal(web.store.getDailyBest(D1).heightM, 36);
});

test('old second tries drop off like old towers; a save never grows past what the server takes', () => {
  const phone = device();
  phone.play(D1, 20);
  phone.store.earnCoins(100, { capped: false });
  phone.store.buyDailyRetry(D1);
  const local = phone.store.exportSave();
  assert.ok(local.retry[D1]);
  const later = mergeSaves(local, null, null, { today: addDays(D1, 120) });
  assert.deepEqual(later.retry, {}, 'gone after 90 days');
  // 1 200 towers (far more than the store keeps): fitSave trims the oldest until it fits
  const big = cleanSave(local);
  for (let k = 0; k < 1200; k++) {
    const key = addDays(D1, -k);
    big.main.daily[key] = { status: 'done', result: result(key, 30), startedAt: 1, finishedAt: 2 };
  }
  assert.ok(JSON.stringify(cleanSave(big)).length > 240 * 1024);
  const fit = fitSave(big);
  assert.ok(JSON.stringify(fit).length <= 240 * 1024);
  assert.ok(fit.main.daily[D1], 'the newest stay');
  assert.equal(fit.main.stats.played, big.main.stats.played, 'the stats stand');
});

test('the leaderboard numbers a device used before it joined go on the account\'s list (deleting takes their rows)', () => {
  const phone = device();
  const web = device();
  const phoneNo = phone.store.getBoardPlayer();
  const webNo = web.store.getBoardPlayer();
  const account = { save: null };
  sync(phone, account);
  sync(web, account);
  assert.equal(account.save.board.player, phoneNo);
  assert.deepEqual(account.save.board.past, [webNo]);
  // a fresh device that never made a number adds nothing
  const fresh = device();
  sync(fresh, account);
  assert.deepEqual(account.save.board.past, [webNo]);
});
