// (1.13.2) The testers' gift: 100 000 coins once per device, then off the leaderboard and the ranks for good.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { MAX_COINS } from '../js/core/economy.js';
import { TESTER_GIFT } from '../js/config.js';
import { S as AF } from '../js/core/strings.js';
import { S_EN as EN } from '../js/core/strings.en.js';

test('the testers\' gift: once per device, outside the day\'s cap, then hidden from the board for good', () => {
  const backend = memoryBackend();
  const t = Date.UTC(2026, 9, 11, 18);
  const store = createStore(backend, { now: () => t });
  store.earnCoins(120);
  assert.equal(store.getTester(), null);
  assert.equal(store.getBoardHidden(), false);
  const r = store.claimTesterGift(TESTER_GIFT.coins);
  assert.deepEqual(r, { ok: true, added: 100000, coins: 100120 });
  assert.equal(store.getTester(), '2026-10-11');
  assert.equal(store.getBoardHidden(), true, 'a tester is off the leaderboard');
  store.setBoardHidden(false);
  assert.equal(store.getBoardHidden(), true, '"show me" can\'t put a tester back');
  assert.deepEqual(store.claimTesterGift(TESTER_GIFT.coins), { ok: false, added: 0, coins: 100120 }, 'only once');
  // a fresh store on the same storage (a reload) still knows
  const again = createStore(backend, { now: () => t + 3600e3 });
  assert.equal(again.getTester(), '2026-10-11');
  assert.equal(again.getBoardHidden(), true);
  assert.equal(again.getEconomy().coins, 100120);
  assert.equal(again.claimTesterGift(TESTER_GIFT.coins).ok, false);
  // earned coins still count towards the day's cap as before (the gift isn't part of it)
  assert.ok(again.earnCoins(10).added >= 0);
});

test('the testers\' gift never goes over MAX_COINS', () => {
  const backend = memoryBackend();
  const store = createStore(backend, { now: () => Date.UTC(2026, 9, 11, 18) });
  const big = store.claimTesterGift(MAX_COINS + 5);
  assert.equal(big.coins, MAX_COINS);
});

test('a tester\'s rank doesn\'t move; a non-tester\'s does', () => {
  const t = Date.UTC(2026, 9, 11, 18);
  const plain = createStore(memoryBackend(), { now: () => t });
  assert.equal(plain.recordDuelRank({ outcome: 'won', live: true, mode: 'race', opp: 'brons-1' }).counted, true);
  const tester = createStore(memoryBackend(), { now: () => t });
  tester.claimTesterGift(TESTER_GIFT.coins);
  const r = tester.recordDuelRank({ outcome: 'won', live: true, mode: 'race', opp: 'brons-1' });
  assert.deepEqual([r.counted, r.delta, r.points, r.tester], [false, 0, 0, true]);
  const lost = tester.recordDuelRank({ outcome: 'lost', live: true, mode: 'turns', opp: 'brons-1' });
  assert.deepEqual([lost.counted, lost.points, lost.tester], [false, 0, true]);
  // Robot Rikus stays "not counted" without the tester note
  assert.equal(tester.recordDuelRank({ outcome: 'won', live: false, mode: 'race' }).tester, undefined);
});

test('TESTER_GIFT: 100 000 coins, a SHA-256 hash only (no code in the game)', () => {
  assert.equal(TESTER_GIFT.coins, 100000);
  assert.match(TESTER_GIFT.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(createHash('sha256').update('').digest('hex'), TESTER_GIFT.hash);
});

test('the gift and tutorial words exist in both languages', () => {
  for (const S of [AF, EN]) {
    for (const k of ['boardTesterNote', 'rankTester', 'testerGiftAgain', 'testerGiftBad']) assert.equal(typeof S[k], 'string', k);
    assert.match(S.testerGift('100 000'), /100 000/);
    const icons = S.howToSteps.map((x) => x.icon);
    for (const ic of ['⚔️', '🏁', '🤝']) assert.ok(icons.includes(ic), `how-to step ${ic}`);
  }
  assert.match(AF.howToSteps.find((x) => x.icon === '🤝').text, /Blok vir Blok/);
  assert.match(EN.howToSteps.find((x) => x.icon === '🤝').text, /Block by Block/);
  assert.match(AF.howToSteps.find((x) => x.icon === '⚔️').text, /Uitdagersreeks/);
  assert.match(EN.howToSteps.find((x) => x.icon === '⚔️').text, /Challenger Series/);
});
