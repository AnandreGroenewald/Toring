// (1.20) Ons dorp on the phone (js/span.js): a Daily gives a build turn (two can wait) and today's ride (once); the ride's
// people (yours first, strays after); rescued people move in and pay; a turn's floors join the tower; a new week turns the
// tower into a monument and starts again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpan } from '../js/span.js';
import { memoryBackend } from '../js/core/storage.js';
import { SPAN } from '../js/core/span.js';

const CAST = ['boer', 'haai', 'bytjie', 'klippie', 'rissie', 'seekat', 'braai', 'duiker', 'madelief', 'draakie', 'brandweer', 'vuurhoutjie'];
function make(day = { v: '2026-10-27' }, backend = memoryBackend()) {
  const coins = { n: 0 };
  const s = createSpan({ backend, castIds: CAST, earn: (n) => { coins.n += n; return n; }, today: () => day.v });
  return { s, coins, day, backend };
}
const plank = (y, q = 'G') => ({ s: 'plank', k: 1, c: 1, x: 0, y, r: 0, q, p: 1 });

test('span client: a Daily gives a turn and today\'s ride; a second Daily the same day gives neither again', () => {
  const { s } = make();
  assert.equal(s.view().turns, 0);
  assert.equal(s.ride(), null);
  s.dailyDone('2026-10-27', 40, ['haai', 'boer', 'nobody']);
  const v = s.view();
  assert.equal(v.turns, 1);
  assert.equal(v.rideToday, true);
  s.dailyDone('2026-10-27', 55, []);
  assert.equal(s.view().turns, 1, 'one turn a day');
  assert.equal(s.view().metres, 55, 'the day\'s best height counts');
  const r = s.ride();
  assert.deepEqual(r.who.slice(0, 0), []);
  assert.ok(r.who.length >= 6 && r.who.length <= 12);
  assert.equal(new Set(r.who).size, r.who.length, 'nobody twice');
});

test('span client: who fell is on the ride first; rescued people move in and pay a coin each; the ride is once', () => {
  const { s, coins } = make();
  s.dailyDone('2026-10-27', 40, ['haai', 'boer', 'haai', 'nobody']);
  const r = s.ride();
  assert.deepEqual(r.who.slice(0, 2), ['haai', 'boer']);
  assert.equal(r.mine, 2);
  const out = s.rideDone('2026-10-27', ['haai', 'bytjie', 'boer']);
  assert.equal(out.coins, 3 * SPAN.coinsPerRescue);
  assert.equal(coins.n, 3);
  assert.equal(s.view().people, 3);
  assert.equal(s.ride(), null);
  assert.equal(s.rideDone('2026-10-27', ['seekat']).coins, 0, 'no second ride');
  assert.equal(s.view().rodeToday, true);
});

test('span client: a turn\'s floors join the tower; two turns wait at most; the turn is used', () => {
  const { s, day } = make();
  s.dailyDone('2026-10-27', 40, []);
  day.v = '2026-10-28';
  s.dailyDone('2026-10-28', 40, []);
  day.v = '2026-10-29';
  s.dailyDone('2026-10-29', 40, []);
  assert.equal(s.view().turns, SPAN.turnsMax, 'a third Daily while two wait gives none');
  const t = s.turn('2026-10-29');
  assert.equal(t.blocks, SPAN.turnBlocks);
  const out = s.turnDone([plank(0, 'P'), plank(1.6)], { skin: 'goud' });
  assert.equal(out.added, 2);
  assert.equal(out.heightM, 3.2);
  assert.equal(out.gain, 3.2);
  const v = s.view();
  assert.equal(v.turns, 1);
  assert.equal(v.floors.length, 2);
  assert.equal(v.floors[0].sk, 'goud');
  assert.equal(v.people, 2, 'the floors\' people count in the town');
  assert.equal(s.turnDone([{ s: 'house' }]).added, 0, 'nonsense adds nothing (the turn is still used)');
  assert.equal(s.turnDone([plank(3.2)]), null, 'no turn left');
});

test('span client: Sunday gives no turn; a new week makes last week\'s tower a monument and starts again', () => {
  const { s, day, backend } = make({ v: '2026-11-01' });   // a Sunday
  s.dailyDone('2026-11-01', 40, []);
  assert.equal(s.view().turns, 0);
  day.v = '2026-10-30';
  const b2 = make({ v: '2026-10-30' }, backend);
  b2.s.dailyDone('2026-10-30', 30, []);
  b2.s.turnDone([plank(0), plank(1.6)]);
  b2.day.v = '2026-11-02';   // the next Monday
  const v = b2.s.view();
  assert.equal(v.week, '2026-11-02');
  assert.equal(v.floors.length, 0);
  assert.equal(v.monuments[0].week, '2026-10-26');
  assert.equal(v.monuments[0].h, 3.2);
  assert.equal(v.turns, 0);
});

test('span client: a debug session keeps its own week', () => {
  const backend = memoryBackend();
  const a = createSpan({ backend, castIds: CAST, today: () => '2026-10-27' });
  const b = createSpan({ backend, debug: true, castIds: CAST, today: () => '2026-10-27' });
  b.dailyDone('2026-10-27', 40, []);
  assert.equal(b.view().turns, 1);
  assert.equal(a.view().turns, 0);
});
