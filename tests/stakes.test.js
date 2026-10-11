// Coin matches (1.13, the owner: stakes with earned coins only): the wallet holds a match's stake from its start
// until the result the room names: the winner gets both, a loss (or leaving) keeps nothing, a match that never began
// gives it back. One stake at a time; a stake says which tab plays it and when it last said so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultEconomy, cleanEconomy, holdStake, settleStake, touchStake, cleanStake, MAX_COINS } from '../js/core/economy.js';
import { createStore } from '../js/core/storage.js';
import { DUEL } from '../js/config.js';

const wallet = (coins) => ({ ...defaultEconomy(), coins });

function memoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    m,
  };
}

test('the stakes are 20, 50, 100, 200 and 500 coins', () => {
  assert.deepEqual(DUEL.stakes, [20, 50, 100, 200, 500]);
});

test('holding: only an allowed amount, only one at a time, never more than the wallet', () => {
  let r = holdStake(wallet(120), 50, 'ABC123', 1000, 'tab1');
  assert.equal(r.ok, true);
  assert.equal(r.economy.coins, 70);
  assert.deepEqual(r.economy.stake, { n: 50, room: 'ABC123', at: 1000, tab: 'tab1', beat: 1000 });
  assert.equal(holdStake(r.economy, 20, 'XYZ789', 2000).reason, 'busy');
  assert.equal(holdStake(wallet(120), 30, 'ABC123').reason, 'stake');
  assert.equal(holdStake(wallet(120), 200, 'ABC123').reason, 'coins');
  r = holdStake(wallet(200), 200, 'ABC123');
  assert.equal(r.ok, true, 'all of it may go in');
  assert.equal(r.economy.coins, 0);
});

test('settling: won pays both, refund gives it back, lost keeps nothing; only for its own room', () => {
  const held = holdStake(wallet(120), 50, 'ABC123', 1000).economy;
  const won = settleStake(held, 'won', 'ABC123');
  assert.deepEqual([won.n, won.paid, won.economy.coins, won.economy.stake], [50, 100, 170, null]);
  const lost = settleStake(held, 'lost', 'ABC123');
  assert.deepEqual([lost.n, lost.paid, lost.economy.coins, lost.economy.stake], [50, 0, 70, null]);
  const back = settleStake(held, 'refund', 'ABC123');
  assert.deepEqual([back.n, back.paid, back.economy.coins], [50, 50, 120]);
  const other = settleStake(held, 'won', 'XYZ789');
  assert.deepEqual([other.n, other.paid, other.economy.coins, other.economy.stake.n], [0, 0, 70, 50], 'another room: nothing moves');
  const none = settleStake(wallet(10), 'won', 'ABC123');
  assert.deepEqual([none.n, none.paid, none.economy.coins], [0, 0, 10], 'nothing held: nothing paid');
  // the wallet's ceiling holds
  const full = holdStake(wallet(MAX_COINS), 500, 'ABC123').economy;
  assert.equal(settleStake(full, 'won', 'ABC123').economy.coins, MAX_COINS);
});

test('the playing tab says it still plays (its room only); a stored stake is cleaned', () => {
  const held = holdStake(wallet(120), 20, 'ABC123', 1000, 'tab1').economy;
  assert.equal(touchStake(held, 'ABC123', 6000).economy.stake.beat, 6000);
  assert.equal(touchStake(held, 'XYZ789', 6000).ok, false);
  assert.equal(cleanStake({ n: 25, room: 'ABC123' }), null);
  assert.equal(cleanStake({ n: 20, room: '<script>', tab: 'x y', at: 5 }).room, null);
  assert.equal(cleanStake({ n: 20, room: 'ABC123', tab: 'x y', at: 5 }).tab, null);
  assert.equal(cleanStake({ n: 20, room: 'ABC123', at: 5 }).beat, 5, 'an old stake without a beat: its start');
  assert.equal(cleanEconomy({ coins: 5, stake: { n: 100, room: 'ABC123', at: 1 } }).stake.n, 100, 'kept across a reload');
  assert.equal(cleanEconomy({ coins: 5, stake: 'lots' }).stake, null);
});

test('the store holds, beats and settles a stake, and keeps it across a reload', () => {
  const backend = memoryBackend();
  let t = 1000;
  const store = createStore(backend, { now: () => t });
  store.earnCoins(300, { capped: false });
  assert.equal(store.getEconomy().coins, 300);
  const h = store.holdStake(100, 'ABC123', 'tab1');
  assert.deepEqual(h, { ok: true, reason: null, coins: 200 });
  assert.deepEqual(store.holdStake(20, 'XYZ789', 'tab1'), { ok: false, reason: 'busy', coins: 200 });
  t = 9000;
  assert.equal(store.touchStake('ABC123'), true);
  // a reload (the app closed mid-match): the stake is still there, with its tab and beat
  const again = createStore(backend, { now: () => t });
  assert.deepEqual(again.heldStake(), { n: 100, room: 'ABC123', at: 1000, tab: 'tab1', beat: 9000 });
  assert.deepEqual(again.settleStake('won', 'ABC123'), { n: 100, paid: 200, coins: 400 });
  assert.equal(again.heldStake(), null);
  assert.deepEqual(again.settleStake('won', 'ABC123'), { n: 0, paid: 0, coins: 400 }, 'paid once');
});

test('the chosen stake is kept (an unknown amount is none)', () => {
  const backend = memoryBackend();
  const store = createStore(backend);
  assert.equal(store.getDuel().stake, 0);
  assert.equal(store.setDuelStake(200), 200);
  assert.equal(createStore(backend).getDuel().stake, 200);
  assert.equal(store.setDuelStake(250), 0);
  assert.equal(store.setDuelStake('50'), 50);
});
