// Blok vir Blok (js/core/turns.js): turns alternate, a turn that loses blocks costs that player a heart,
// five Perfeks in a row of your own earn a joker whose sabotage waits for the other player's next block,
// and the first out of hearts loses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnReferee, cleanPose, cleanSnap, cleanRating, snapFits, isSabotage, botSabotage, SABOTAGES } from '../js/core/turns.js';
import { TURNS } from '../js/config.js';

const types = (ev) => ev.map((e) => e.type);

test('turns alternate from the first seat; hearts and streaks travel with every turn', () => {
  const ref = createTurnReferee({ first: 1 });
  const [t1] = ref.start();
  assert.deepEqual(t1, { type: 'turn', n: 1, seat: 1, hearts: [TURNS.hearts, TURNS.hearts], streaks: [0, 0], sab: null });
  assert.deepEqual(ref.start(), [], 'only once');
  const [t2] = ref.settled(1, { n: 1, r: 'G' });
  assert.equal(t2.n, 2);
  assert.equal(t2.seat, 0);
  const [t3] = ref.settled(0, { n: 2, r: 'P' });
  assert.equal(t3.seat, 1);
  assert.deepEqual(t3.streaks, [1, 0]);
});

test('a report out of turn (wrong seat or number) changes nothing', () => {
  const ref = createTurnReferee({ first: 0 });
  ref.start();
  assert.deepEqual(ref.settled(1, { n: 1, lost: true }), []);
  assert.deepEqual(ref.settled(0, { n: 2, lost: true }), []);
  assert.deepEqual(ref.hearts, [TURNS.hearts, TURNS.hearts]);
  assert.equal(ref.n, 1);
});

test('a lost block costs that player a heart; the first out of hearts loses', () => {
  const ref = createTurnReferee({ first: 0 });
  ref.start();
  let n = 1;
  let last = [];
  for (let k = 0; k < TURNS.hearts; k++) {
    ref.settled(0, { n: n++, lost: true, r: 'X' });          // seat 0 misses
    last = ref.settled(1, { n: n++, lost: false, r: 'G' });   // seat 1 lands
    if (k < TURNS.hearts - 1) assert.equal(last.at(-1).type, 'turn');
  }
  // seat 0's last heart went on their turn: the result came there, seat 1 never played that turn
  assert.deepEqual(ref.hearts, [0, TURNS.hearts]);
  assert.deepEqual(ref.result, { winner: 1, reason: 'hearts' });
  assert.deepEqual(ref.settled(1, { n, r: 'P' }), [], 'nothing after the result');
});

test('five Perfeks in a row of your own earn a joker; the other player\'s blocks in between don\'t break it', () => {
  const ref = createTurnReferee({ first: 0 });
  ref.start();
  let n = 1;
  const events = [];
  for (let k = 0; k < TURNS.jokerStreak; k++) {
    events.push(...ref.settled(0, { n: n++, r: 'P' }));
    events.push(...ref.settled(1, { n: n++, r: 'S' }));
  }
  assert.equal(events.filter((e) => e.type === 'joker' && e.seat === 0).length, 1);
  assert.deepEqual(ref.perfects, [TURNS.jokerStreak, 0]);
  // a non-Perfek starts the count again
  ref.settled(0, { n: n++, r: 'G' });
  assert.deepEqual(ref.streaks, [0, 0]);
});

test('the joker\'s sabotage lands on the other player\'s next block, once', () => {
  const ref = createTurnReferee({ first: 0 });
  ref.start();
  let n = 1;
  for (let k = 0; k < TURNS.jokerStreak - 1; k++) {
    ref.settled(0, { n: n++, r: 'P' });
    ref.settled(1, { n: n++, r: 'G' });
  }
  const ev = ref.settled(0, { n: n++, r: 'P' });   // the fifth: a joker, and seat 1's turn begins
  assert.deepEqual(types(ev), ['joker', 'turn']);
  assert.equal(ev[1].sab, null, 'chosen later: not on the block already on the crane');
  assert.deepEqual(ref.joker(1, 'fog'), [], 'seat 1 has no joker');
  assert.deepEqual(ref.joker(0, 'lava'), [], 'not a sabotage');
  assert.deepEqual(ref.joker(0, 'fog'), [{ type: 'sent', seat: 0, kind: 'fog' }]);
  assert.deepEqual(ref.joker(0, 'heat'), [], 'one joker, one sabotage');
  const [mine] = ref.settled(1, { n: n++, r: 'G' });
  assert.equal(mine.seat, 0);
  assert.equal(mine.sab, null, 'not on the chooser');
  const [theirs] = ref.settled(0, { n: n++, r: 'G' });
  assert.equal(theirs.seat, 1);
  assert.equal(theirs.sab, 'fog');
  const [after] = ref.settled(1, { n: n++, r: 'G' });
  const [again] = ref.settled(0, { n: n++, r: 'G' });
  assert.equal(after.sab, null);
  assert.equal(again.sab, null, 'one block only');
});

test('leaving or a timeout ends it for the other player; the match cap goes to hearts, then Perfeks', () => {
  let ref = createTurnReferee({ first: 0 });
  ref.start();
  assert.deepEqual(ref.leave(0).map((e) => [e.winner, e.reason]), [[1, 'quit']]);
  ref = createTurnReferee({ first: 1 });
  assert.deepEqual(ref.timeout(), [], 'not before the first turn');
  ref.start();
  assert.deepEqual(ref.timeout().map((e) => [e.winner, e.reason]), [[0, 'timeout']]);

  ref = createTurnReferee({ first: 0 });
  ref.start();
  let seat = 0;
  let last = [];
  for (let n = 1; n <= TURNS.maxTurns; n++) {
    last = ref.settled(seat, { n, lost: n === 3, r: seat === 1 && n < 9 ? 'P' : 'G' });
    seat = 1 - seat;
  }
  assert.deepEqual(last.at(-1), { type: 'result', winner: 1, reason: 'turns', hearts: [TURNS.hearts - 1, TURNS.hearts] });
});

test('the referee survives a snapshot (the server saves it between messages)', () => {
  const a = createTurnReferee({ first: 0 });
  a.start();
  a.settled(0, { n: 1, lost: true, r: 'X' });
  const b = createTurnReferee({ init: a.snapshot() });
  assert.equal(b.n, 2);
  assert.equal(b.seat, 1);
  assert.deepEqual(b.hearts, [TURNS.hearts - 1, TURNS.hearts]);
  assert.equal(b.settled(1, { n: 2 }).at(-1).seat, 0);
});

test('poses and tower reports from the other game are checked', () => {
  assert.deepEqual(cleanPose([360.25, -812.5, 0.031, 120.4, -3.5]), [360.25, -812.5, 0.031, 120.4, -3.5]);
  assert.equal(cleanPose([1, 2, 3, 4]), null);
  assert.equal(cleanPose([1, 2, NaN, 4, 5]), null);
  assert.equal(cleanPose([1, 2, 30, 4, 5]), null, 'an angle like that is not a block');
  assert.equal(cleanPose('x'), null);

  const ok = { blocks: [[0, 360, 200, 0, 1, 'P'], [1, 361.5, 150, 0.01, 0, 'G'], [3, 359, 100, -0.2, 0, null]], lost: [2] };
  assert.deepEqual(cleanSnap(ok), ok);
  assert.equal(cleanSnap({ blocks: [[0, 1, 2, 3, 2, 'P']], lost: [] }), null, 'frozen is 0 or 1');
  assert.equal(cleanSnap({ blocks: [[0, 1, 2, 3, 0, 'Q']], lost: [] }), null);
  assert.equal(cleanSnap({ blocks: [[0, 1, 2, 3, 0, 'P'], [0, 1, 2, 3, 0, 'P']], lost: [] }), null, 'one entry per block');
  assert.equal(cleanSnap({ blocks: [[0, 1, 2, 3, 0, 'P']], lost: [0] }), null, 'not both standing and lost');
  assert.equal(cleanSnap({ blocks: new Array(40).fill(0).map((_, i) => [i, 1, 2, 0, 0, 'S']), lost: [] }), null);
  assert.equal(cleanSnap({ blocks: [] }), null);
  assert.equal(cleanRating('P'), 'P');
  assert.equal(cleanRating('?'), 'S');
});

test('sabotages: the list, and Robot Rikus picks one the same way for the same match', () => {
  assert.ok(SABOTAGES.length >= 2);
  assert.ok(SABOTAGES.every(isSabotage));
  assert.equal(isSabotage('monkey'), false, 'no visitors on a shared tower');
  assert.equal(botSabotage('abc123', 4), botSabotage('abc123', 4));
  assert.ok(isSabotage(botSabotage('abc123', 4)));
});

test('a turn\'s report must fit the turn: no blocks not dropped yet; its block lost exactly when rated X', () => {
  const snap = (blocks, lost) => ({ blocks: blocks.map((i) => [i, 1, 2, 0, 0, 'S']), lost });
  assert.equal(snapFits(snap([0, 1, 2], []), 3, 'G'), true);
  assert.equal(snapFits(snap([0, 1], [2]), 3, 'X'), true);
  assert.equal(snapFits(snap([0, 1, 2, 3], []), 3, 'G'), false, 'block 3 has not been dropped');
  assert.equal(snapFits(snap([0, 1], [7]), 3, 'G'), false);
  assert.equal(snapFits(snap([0, 1], [2]), 3, 'P'), false, 'a lost block is not a Perfek');
  assert.equal(snapFits(snap([0, 1, 2], []), 3, 'X'), false, 'an X that stands');
  assert.equal(snapFits(null, 3, 'G'), false);
});
