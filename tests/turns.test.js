// Blok vir Blok (js/core/turns.js): turns alternate, a turn that loses blocks costs that player a heart,
// five Perfeks in a row of your own earn a joker whose sabotage waits for the other player's next block,
// and the first out of hearts loses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTurnReferee, cleanPose, cleanSnap, cleanRating, snapFits, isSabotage, botSabotage, SABOTAGES,
  turnRounds, roundFor, roundStage, cleanRound, beatVisitor, cleanVis, botCatch, ROUND_KINDS,
} from '../js/core/turns.js';
import { TURNS } from '../js/config.js';

const types = (ev) => ev.map((e) => e.type);

test('turns alternate from the first seat; hearts and streaks travel with every turn', () => {
  const ref = createTurnReferee({ first: 1 });
  const [t1] = ref.start();
  assert.deepEqual(t1, { type: 'turn', n: 1, seat: 1, hearts: [TURNS.hearts, TURNS.hearts], streaks: [0, 0], sab: null, ev: null, nx: null });
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

// ------------------------------------------------------------------------------- rondtes (1.12)
const MILD = ['wind', 'rain', 'fog', 'heat', 'monkey'];

test('rondtes: the same plan from the same seed; a calm start; odd gaps, so who faces a round first takes turns', () => {
  for (const seed of ['abcdef12', 'zz99yy88', 'q1w2e3r4', 'mmmmmmmm']) {
    const plan = turnRounds(seed);
    assert.deepEqual(turnRounds(seed), plan, 'pure');
    assert.ok(plan.length >= 20, `a long match has many rounds (${plan.length})`);
    assert.ok(plan[0].n >= TURNS.rounds[0].from, 'nothing in the calm start');
    for (let k = 1; k < plan.length; k++) {
      const gap = plan[k].n - plan[k - 1].n - 2;
      assert.ok(gap >= 1 && gap % 2 === 1, `odd gap between rounds (${gap})`);
      assert.notEqual(plan[k].n % 2, plan[k - 1].n % 2, 'the other player faces the next round first');
      assert.notEqual(plan[k].kind, plan[k - 1].kind, 'never the same twice in a row');
    }
    assert.ok(plan.filter((r) => r.kind === 'thief').length <= 3, 'Skelm Sakkie at most three times');
    for (const r of plan) {
      assert.ok(ROUND_KINDS.includes(r.kind));
      if (roundStage(r.n) === 1) assert.ok(MILD.includes(r.kind), `the first stage is mild (${r.kind} at ${r.n})`);
      assert.ok(r.strength >= 0.5 && r.strength <= 1.6);
      assert.ok(r.n + 1 <= TURNS.maxTurns);
    }
  }
  assert.notDeepEqual(turnRounds('abcdef12'), turnRounds('zz99yy88'), 'another match, other rounds');
});

test('rondtes: both turns of a round get exactly the same event', () => {
  const plan = turnRounds('abcdef12');
  const r = plan[3];
  const a = roundFor(plan, r.n);
  const b = roundFor(plan, r.n + 1);
  assert.equal(a.first, true);
  assert.equal(b.first, false);
  assert.deepEqual({ ...a, first: null }, { ...b, first: null });
  assert.equal(roundFor(plan, r.n - 1)?.key === r.key, false);
  assert.equal(roundFor(plan, 1), null);
});

test('rondtes: turns carry the round and the one coming; a sabotage waits past a round', () => {
  const seed = 'abcdef12';
  const plan = turnRounds(seed);
  const ref = createTurnReferee({ first: 0, seed, rounds: true });
  let [t] = ref.start();
  const seen = [];
  while (t && t.type === 'turn' && t.n < plan[2].n + 2) {
    seen.push(t);
    const evs = ref.settled(t.seat, { n: t.n, r: 'G' });
    t = evs.find((e) => e.type === 'turn');
  }
  const r1 = plan[0];
  assert.equal(seen[r1.n - 2].nx.key, r1.key, 'the turn before a round shows it coming');
  assert.equal(seen[r1.n - 1].ev.key, r1.key);
  assert.equal(seen[r1.n].ev.key, r1.key, 'the other player gets the same');
  assert.notEqual(seen[r1.n - 1].seat, seen[r1.n].seat, 'a turn each');
  assert.equal(seen[r1.n].nx, null, 'nothing coming while the round is on');
  // a sabotage sent just before a round waits for that player's next turn without one
  const ref2 = createTurnReferee({ first: 0, seed, rounds: true });
  [t] = ref2.start();
  while (t.n < r1.n - 1) t = ref2.settled(t.seat, { n: t.n, r: 'G' }).find((e) => e.type === 'turn');
  const victim = roundFor(plan, r1.n) ? (t.seat === 0 ? 1 : 0) : 0;
  const s = ref2.snapshot();
  s.jokers[1 - victim] = 1;
  const ref3 = createTurnReferee({ init: s });
  ref3.joker(1 - victim, 'fog');
  let next = ref3.settled(t.seat, { n: t.n, r: 'G' }).find((e) => e.type === 'turn');
  const got = [];
  while (next && next.n <= r1.n + 4) {
    if (next.sab) got.push(next.n);
    next = ref3.settled(next.seat, { n: next.n, r: 'G' }).find((e) => e.type === 'turn');
  }
  assert.equal(got.length, 1, 'the sabotage comes once');
  assert.ok(!roundFor(plan, got[0]), `never on a round's turn (turn ${got[0]})`);
});

test('rondtes: beating the visitor gives a heart back (never above the start); a loss in the same turn evens it', () => {
  const seed = 'abcdef12';
  const plan = turnRounds(seed);
  const monkey = plan.find((r) => r.kind === 'monkey');
  const play = (r, report) => {
    const ref = createTurnReferee({ first: 0, seed, rounds: true });
    let [t] = ref.start();
    const who = r.n % 2 ? 0 : 1;   // (first: 0 plays the odd turns) the round's player loses one heart first
    let lostOne = false;
    while (t.n < r.n) {
      const lose = t.seat === who && !lostOne;
      if (lose) lostOne = true;
      t = ref.settled(t.seat, { n: t.n, lost: lose, r: lose ? 'X' : 'G' }).find((e) => e.type === 'turn');
    }
    const before = ref.hearts[t.seat];
    ref.settled(t.seat, { n: t.n, ...report });
    return { before, after: ref.hearts[t.seat], beats: ref.beats[t.seat] };
  };
  const p = play(monkey, { r: 'P' });
  assert.equal(p.after, Math.min(TURNS.hearts, p.before + 1), 'a Perfek scares Blouaap off: a heart back');
  assert.equal(p.beats, 1);
  const g = play(monkey, { r: 'G' });
  assert.equal(g.after, g.before, 'not a Perfek: no heart, none lost (his doing)');
  const both = play(monkey, { r: 'P', lost: true });
  assert.equal(both.after, both.before, 'a Perfek and a lost block: even');
  assert.equal(beatVisitor('thief', 'G', 'caught'), true);
  assert.equal(beatVisitor('thief', 'P', 'stole'), false);
  assert.equal(beatVisitor('wind', 'P', null), false);
  assert.equal(cleanVis('caught'), 'caught');
  assert.equal(cleanVis('x'), null);
  // at full hearts nothing changes
  const ref = createTurnReferee({ first: 0, seed, rounds: true });
  let [t] = ref.start();
  while (t.n < monkey.n) t = ref.settled(t.seat, { n: t.n, r: 'G' }).find((e) => e.type === 'turn');
  ref.settled(t.seat, { n: t.n, r: 'P' });
  assert.equal(ref.hearts[t.seat], TURNS.hearts);
});

test('rondtes: off without the flag or a seed (a 1.11 game in the match); the plan survives a snapshot', () => {
  const ref = createTurnReferee({ first: 0, seed: 'abcdef12' });
  let [t] = ref.start();
  for (let k = 0; k < 40; k++) {
    assert.equal(t.ev, null);
    assert.equal(t.nx, null);
    t = ref.settled(t.seat, { n: t.n, r: 'G' }).find((e) => e.type === 'turn');
  }
  const on = createTurnReferee({ first: 0, seed: 'abcdef12', rounds: true });
  on.start();
  const again = createTurnReferee({ init: on.snapshot() });
  assert.equal(again.rounds, true);
  assert.equal(createTurnReferee({ first: 0, rounds: true }).rounds, false, 'no seed: no rounds');
});

test('rondtes: a round from a message is checked; Robot Rikus catches Skelm Sakkie by the seed', () => {
  assert.deepEqual(cleanRound({ kind: 'gust', dir: -1, strength: 1.2, side: 1, key: 'r4', first: true }), { kind: 'gust', dir: -1, strength: 1.2, side: 1, key: 'r4', first: true });
  assert.equal(cleanRound({ kind: 'clown', key: 'r1' }), null, 'Hanswors is no round');
  assert.equal(cleanRound({ kind: 'wind', key: 'x' }), null);
  assert.equal(cleanRound({ kind: 'wind', key: 'r1', strength: 99 }).strength, 2);
  assert.equal(cleanRound(null), null);
  assert.deepEqual(botCatch('abcdef12', 9), botCatch('abcdef12', 9));
  const c = botCatch('abcdef12', 9);
  assert.ok(c.at >= 0.35 && c.at <= 0.85);
});
