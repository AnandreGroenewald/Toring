// (1.23) The public launch: a device or an account save from the testing weeks starts again from nothing, keeping its name,
// settings, leaderboard number and the "seen it" marks, and whoever had played gets the testers' skin (js/core/launch.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchReset, launchSave, playedBefore, MODE_KEYS } from '../js/core/launch.js';
import { createStore, memoryBackend, cleanSave } from '../js/core/storage.js';
import { mergeSaves, sameSave } from '../js/core/cloudsave.js';
import { LAUNCH, STORAGE_KEY } from '../js/config.js';
import { priceOf, skin } from '../js/core/economy.js';

function testerDevice() {
  const be = memoryBackend();
  be.setItem(STORAGE_KEY, JSON.stringify({
    v: 1, settings: { sound: false, howtoSeen: true }, tutorialSeen: true,
    stats: { played: 12, streak: 3, maxStreak: 5, bestScore: 900, bestHeightM: 41, totalPerfects: 30, lastDateKey: '2026-10-26' },
    practice: { played: 4, heightM: 20, score: 300 },
    duel: { name: 'Toetser1', played: 6, wins: 4, losses: 2, streak: 1, bestStreak: 3, mode: 'race', stake: 50 },
    daily: { '2026-10-26': { status: 'done', result: { heightM: 41, score: 900 } } },
  }));
  be.setItem(`${STORAGE_KEY}.econ`, JSON.stringify({ coins: 100000, skins: { owned: { blocks: ['kleur', 'heelal'] }, wear: { blocks: 'heelal' } } }));
  be.setItem(`${STORAGE_KEY}.ranks`, JSON.stringify({ race: { points: 400 } }));
  be.setItem(`${STORAGE_KEY}.board`, JSON.stringify({ player: 'abcdefghijkl1234', hidden: true, posted: '2026-10-26', pending: false, tester: '2026-10-14' }));
  be.setItem(`${STORAGE_KEY}.lang`, 'en');
  be.setItem(`${STORAGE_KEY}.remind`, JSON.stringify({ on: true, at: '18:00' }));
  be.setItem(`${STORAGE_KEY}.cloud`, JSON.stringify({ token: 't' }));
  be.setItem('stapel.v1.lewende', JSON.stringify({ best: 9 }));
  be.setItem('stapel.v1.rvTaught', '1');
  return be;
}

test('a tester device starts from scratch, keeps who it is, and wears the testers skin', () => {
  const be = testerDevice();
  const r = launchReset(be);
  assert.deepEqual(r, { done: true, founder: true });
  assert.equal(be.getItem(`${STORAGE_KEY}.ranks`), null, 'ranks go (the store then starts fresh ones)');
  const store = createStore(be);
  const econ = JSON.parse(be.getItem(`${STORAGE_KEY}.econ`));
  assert.deepEqual(econ.skins.owned.blocks, ['kleur', LAUNCH.skin]);
  assert.equal(econ.skins.wear.blocks, LAUNCH.skin);
  assert.equal(store.getSkins().wear.blocks, LAUNCH.skin, 'the store wears it');
  assert.equal(JSON.parse(be.getItem(`${STORAGE_KEY}.ranks`)).race.points, 0);
  assert.equal(be.getItem('stapel.v1.lewende'), null);
  const main = JSON.parse(be.getItem(STORAGE_KEY));
  assert.equal(main.duel.name, 'Toetser1', 'the name stays');
  assert.equal(main.settings.sound, false, 'settings stay');
  assert.equal(main.stats, undefined, 'records go');
  assert.equal(be.getItem(`${STORAGE_KEY}.lang`), 'en');
  assert.ok(be.getItem(`${STORAGE_KEY}.remind`));
  assert.ok(be.getItem(`${STORAGE_KEY}.cloud`), 'a signed-in link stays');
  assert.equal(be.getItem('stapel.v1.rvTaught'), '1', 'seen-it marks stay');
  const board = JSON.parse(be.getItem(`${STORAGE_KEY}.board`));
  assert.deepEqual([board.player, board.hidden, board.tester], ['abcdefghijkl1234', false, null], 'back on the leaderboard');
  assert.equal(store.getCoins?.() ?? JSON.parse(be.getItem(`${STORAGE_KEY}.econ`)).coins ?? 0, 0);
});

test('once per device: a second start changes nothing', () => {
  const be = testerDevice();
  launchReset(be);
  be.setItem(`${STORAGE_KEY}.econ`, JSON.stringify({ coins: 55, skins: { owned: { blocks: ['kleur', LAUNCH.skin] }, wear: { blocks: 'kleur' } } }));
  assert.deepEqual(launchReset(be), { done: false, founder: false });
  assert.equal(JSON.parse(be.getItem(`${STORAGE_KEY}.econ`)).coins, 55);
});

test('a new player gets no testers skin', () => {
  const be = memoryBackend();
  assert.deepEqual(launchReset(be), { done: true, founder: false });
  assert.equal(be.getItem(`${STORAGE_KEY}.econ`), null);
  assert.equal(be.getItem(`${STORAGE_KEY}.launch`), LAUNCH.id);
  // only settings saved (opened once, never played) is not a tester
  const be2 = memoryBackend();
  be2.setItem(STORAGE_KEY, JSON.stringify({ v: 1, settings: { sound: true } }));
  assert.equal(launchReset(be2).founder, false);
  assert.equal(playedBefore(null, null, true), true, 'another mode played counts');
  assert.ok(MODE_KEYS.includes('stapel.v1.dorp'));
});

test('an account save from before the launch merges in as a fresh one with the testers skin, and is written back', () => {
  const old = cleanSave({ main: { duel: { name: 'Ou Toetser', played: 9 }, stats: { played: 30 } }, econ: { coins: 99999, skins: { owned: { blocks: ['kleur', 'goud'] }, wear: { blocks: 'goud' } } }, board: { player: 'zzzzzzzzzzzz9999', tester: '2026-10-14' } });
  assert.equal(old.launch, undefined, 'an old save carries no launch mark');
  const fresh = launchSave(old);
  assert.equal(fresh.launch, LAUNCH.id);
  const local = createStore(memoryBackend()).exportSave();
  assert.equal(local.launch, LAUNCH.id, 'a save made now carries the mark');
  // (a new phone signing in for the first time: no base yet, so the account's name comes first)
  const merged = mergeSaves(local, fresh, null);
  assert.equal(merged.launch, LAUNCH.id);
  assert.equal(merged.econ.coins, 0, 'the testers coins never come back');
  assert.ok(merged.econ.skins.owned.blocks.includes(LAUNCH.skin));
  assert.equal(merged.main.duel.name, 'Ou Toetser');
  assert.equal(merged.board.player, 'zzzzzzzzzzzz9999');
  assert.equal(merged.board.tester, null);
  assert.equal(launchSave(merged), merged, 'a launch save passes through');
  assert.ok(!sameSave(old, merged));
});

test('the testers skin is never sold, and the prices are back', () => {
  const st = skin('blocks', LAUNCH.skin);
  assert.ok(st && st.tester, 'in the catalogue, marked for testers');
  assert.equal(priceOf(skin('blocks', 'heelal')), 3500);
  const store = createStore(memoryBackend());
  assert.equal(store.buySkin('blocks', LAUNCH.skin).ok, false);
});
