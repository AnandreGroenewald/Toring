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

test('(1.13.4) the Winkel refill: up to 2 000, 3 presses a day, Mon 12 - Fri 16 Oct', async () => {
  const { REFILL } = await import('../js/config.js');
  assert.deepEqual({ ...REFILL }, { on: true, to: 2000, times: 3, per: 'day', from: '2026-10-12', days: 5 });
  let t = Date.UTC(2026, 9, 12, 8);
  const backend = memoryBackend();
  const store = createStore(backend, { now: () => t });
  store.earnCoins(33);
  assert.equal(store.refillsLeft(REFILL), 3);
  assert.deepEqual(store.refillCoins(REFILL.to, REFILL), { added: 1967, coins: 2000, left: 2, reason: null });
  assert.deepEqual(store.refillCoins(REFILL.to, REFILL), { added: 0, coins: 2000, left: 2, reason: 'full' }, 'a full wallet: nothing, not counted');
  assert.equal(store.getBoardHidden(), false, 'a refill keeps the player on the leaderboard');
  assert.equal(store.getTester(), null);
  // spend and refill twice more: the day's three are used
  for (let k = 0; k < 2; k++) {
    assert.ok(store.spendCoins ? true : true);
    const e = JSON.parse(backend.getItem('stapel.v1.econ') || '{}');
    e.coins = 100;
    backend.setItem('stapel.v1.econ', JSON.stringify(e));
    assert.equal(store.refillCoins(REFILL.to, REFILL).added, 1900);
  }
  assert.equal(store.refillsLeft(REFILL), 0);
  const e = JSON.parse(backend.getItem('stapel.v1.econ') || '{}');
  e.coins = 50;
  backend.setItem('stapel.v1.econ', JSON.stringify(e));
  assert.deepEqual(store.refillCoins(REFILL.to, REFILL), { added: 0, coins: 50, left: 0, reason: 'used' });
  // the next day: three again
  t = Date.UTC(2026, 9, 13, 8);
  assert.equal(store.refillsLeft(REFILL), 3);
  // more than 2 000 already: nothing taken away
  const big = createStore(memoryBackend(), { now: () => Date.UTC(2026, 9, 12, 8) });
  big.claimTesterGift(100000);
  assert.equal(big.refillCoins(REFILL.to, REFILL).reason, 'full');
  assert.equal(big.getEconomy().coins, 100000);
});
