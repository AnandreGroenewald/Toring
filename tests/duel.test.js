// Uitdagersreeks (head-to-head; docs/CHALLENGE-SPEC.md): the referee, recordings and their playback,
// attacks on a recording, the computer's run, challenge links, room codes, nicknames, the share text
// and the stored wins and losses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReferee, createRecorder, heightAt, createGhost, botRun, encodeChallenge, decodeChallenge,
  challengeLink, parseChallengeQuery, parseRoomQuery, isRoomCode, newRoomCode, ROOM_ALPHABET, newMatchSeed,
  isMatchSeed, duelSeedKey, cleanNickname, defaultNickname, cleanReport, attackFor, heightDm,
} from '../js/core/duel.js';
import { createRng } from '../js/core/rng.js';
import { createSequence } from '../js/core/sequence.js';
import { buildDuelShareText } from '../js/core/share.js';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { DUEL } from '../js/config.js';

const NB = ' ';

// ---------------------------------------------------------------------------------- referee
test('referee: the first to each height mark sends its visitor, once', () => {
  const r = createReferee();
  assert.deepEqual(r.report(0, { h: 9.9 }), []);
  assert.deepEqual(r.report(0, { h: 10 }), [{ type: 'attack', from: 0, to: 1, m: 10, kind: 'monkey' }]);
  assert.deepEqual(r.report(1, { h: 15 }), [], 'already taken');
  // a big jump passes two marks at once
  assert.deepEqual(r.report(1, { h: 31 }).map((e) => e.m), [20, 30]);
  assert.equal(r.claimedBy(10), 0);
  assert.equal(r.claimedBy(20), 1);
  assert.equal(r.claimedBy(40), null);
  assert.equal(attackFor(20), 'thief');
  assert.equal(attackFor(40), 'thief');
  assert.equal(attackFor(50), null);
});

test('referee: best heights never go down (a tower that lost blocks must climb back)', () => {
  const r = createReferee();
  r.report(0, { h: 18 });
  r.report(0, { h: 12 });
  assert.equal(r.best(0), 18);
  assert.deepEqual(r.report(0, { h: 19.5 }), []);
});

test('referee: first to 50 m wins; a falling tower loses; leaving loses; then nothing changes', () => {
  const goal = createReferee();
  const ev = goal.report(1, { h: 50.1 });
  assert.deepEqual(ev.at(-1), { type: 'result', winner: 1, reason: 'goal' });
  assert.equal(ev.filter((e) => e.type === 'attack').length, 4, 'all four marks on the way');
  assert.deepEqual(goal.report(0, { h: 60 }), []);
  assert.deepEqual(goal.result, { winner: 1, reason: 'goal' });

  for (const why of ['lives', 'flood', 'quit']) {
    const r = createReferee();
    assert.deepEqual(r.report(0, { h: 30, over: why }).at(-1), { type: 'result', winner: 1, reason: why });
  }
  assert.equal(createReferee().report(0, { over: 'boom' }).at(-1).reason, 'quit');
  const left = createReferee();
  assert.deepEqual(left.leave(1), [{ type: 'result', winner: 0, reason: 'left' }]);
  assert.deepEqual(left.leave(0), []);
  assert.deepEqual(createReferee().report(2, { h: 50 }), [], 'only players 0 and 1');
});

test('referee: a snapshot restores marks, heights and the result exactly', () => {
  const r = createReferee();
  r.report(0, { h: 22 });
  r.report(1, { h: 12 });
  const back = createReferee({ init: JSON.parse(JSON.stringify(r.snapshot())) });
  assert.equal(back.best(0), 22);
  assert.equal(back.claimedBy(10), 0);
  assert.deepEqual(back.report(1, { h: 25 }), [], '10 and 20 m were already taken');
  assert.deepEqual(back.report(1, { h: 30 }).map((e) => e.m), [30]);
  const done = createReferee({ init: { ...r.snapshot(), result: { winner: 0, reason: 'goal' } } });
  assert.deepEqual(done.report(1, { h: 50 }), []);
  // junk in a snapshot is ignored
  const junk = createReferee({ init: { best: ['x', -4], claimed: [[10, 7], [99, 0]], result: { winner: 3 } } });
  assert.deepEqual(junk.snapshot(), { best: [0, 0], claimed: [], result: null });
});

// ---------------------------------------------------------------------------------- recordings
test('recorder: one height a second (the last in each second), gaps filled, how and when it ended', () => {
  const rec = createRecorder();
  rec.add(0, 0);
  rec.add(400, 1.2);
  rec.add(900, 1.66);
  rec.add(3200, 5);        // seconds 1 and 2 were never reported: they keep the last height
  rec.add(-5, 9);          // junk
  rec.finish(3400, 'flood');
  rec.add(4000, 99);       // after the end: ignored
  assert.deepEqual(rec.run(), { samples: [17, 17, 17, 50], endT: 3400, end: 'flood' });
  const r2 = createRecorder();
  r2.finish(10, 'weird');
  assert.equal(r2.run().end, 'quit');
  assert.deepEqual(createRecorder().run().samples, [0]);
});

test('recorder: heights round to 0,1 m, but never up onto a height mark or the goal', () => {
  assert.equal(heightDm(1.66), 17);
  assert.equal(heightDm(9.97), 99, '9,97 m has not reached 10 m');
  assert.equal(heightDm(10), 100);
  assert.equal(heightDm(10.04), 100);
  assert.equal(heightDm(49.96), 499);
  assert.equal(heightDm(50), 500);
  assert.equal(heightDm(14.96), 150, 'between the marks it simply rounds');
  assert.equal(heightDm(-3), 0);
  assert.equal(heightDm('x'), 0);
  assert.equal(heightDm(99999), DUEL.maxHeightM * 10);
});

test('heightAt: each second counts from its middle, the last sample from the end of the run', () => {
  const run = { samples: [0, 20, 40, 40], endT: 4000, end: 'stop' };
  assert.equal(heightAt(run, 0), 0);
  assert.equal(heightAt(run, 1499), 0);
  assert.equal(heightAt(run, 1500), 2);
  assert.equal(heightAt(run, 2499), 2);
  assert.equal(heightAt(run, 2500), 4);
  assert.equal(heightAt(run, 99000), 4);
  const goal = { samples: [0, 20, 500], endT: 2300, end: 'goal' };
  assert.equal(heightAt(goal, 2299), 2);
  assert.equal(heightAt(goal, 2300), 50, 'the goal exactly when the run reached it');
  assert.equal(heightAt({ ...goal, endT: 3000 }, 2999), 2, 'a link rounds endT to 0,1 s: up to the end of the last second is fine');
  assert.equal(heightAt({ samples: [70], endT: 800, end: 'quit' }, 799), 0);
  assert.equal(heightAt({ samples: [70], endT: 800, end: 'quit' }, 800), 7);
  assert.equal(heightAt({ samples: [] }, 100), 0);
});

test('a recording plays back without a head start: marks within half a second, the goal on time', () => {
  const r = createRng('recording-timing');
  const FRAME = 1000 / 60;
  const marks = [...DUEL.marks, DUEL.goalM];
  const errs = [];
  for (let n = 0; n < 40; n++) {
    // a real tower: its best height steps up as blocks settle; recorded every frame, like the game does
    const rec = createRecorder();
    const real = {};
    let best = 0;
    let next = r.float(2000, 4000);
    let t = 0;
    for (; ; t += FRAME) {
      if (t >= next) {
        best += r.float(1.2, 2.2);
        next = t + r.float(2500, 4500);
      }
      for (const m of marks) if (best >= m && real[m] === undefined) real[m] = t;
      rec.add(t, best);
      if (best >= DUEL.goalM) break;
    }
    rec.finish(t, 'goal');
    const run = rec.run();
    const viaLink = decodeChallenge(encodeChallenge({ seed: 'abc123def0', name: 'Anna', run })).run;
    for (const [how, played] of [['recording', run], ['link', viaLink]]) {
      const g = createGhost(played);
      const seen = {};
      for (let u = 0; u <= t + 2000; u += FRAME) {
        const b = g.step(u).best;
        for (const m of marks) if (b >= m && seen[m] === undefined) seen[m] = u;
      }
      for (const m of DUEL.marks) {
        const e = seen[m] - real[m];
        assert.ok(Math.abs(e) <= 500 + FRAME, `${how}, ${m} m: ${Math.round(e)} ms`);
        if (how === 'recording') errs.push(e);
      }
      // on time to the frame (endT is kept in whole ms; a link keeps it to 0,1 s)
      assert.ok(Math.abs(seen[DUEL.goalM] - real[DUEL.goalM]) <= (how === 'link' ? 50 : 0) + FRAME + 1, `${how}: the goal on time`);
    }
  }
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  assert.ok(Math.abs(mean) < 120, `on average ${Math.round(mean)} ms early or late`);
});

test('ghost: punishments take height off its tower from then on (Blouaap 3 m, Skelm Sakkie 4 m, Mis and Hittegolf 2 m)', () => {
  assert.deepEqual(DUEL.ghostPenaltyM, { monkey: 3, thief: 4, fog: 2, heat: 2 });
  const g = createGhost({ samples: [0, 100, 200, 300], endT: 3000, end: 'stop' });
  assert.deepEqual(g.step(1500), { h: 10, best: 10, over: null });
  g.hit('monkey');
  assert.equal(g.step(1500).h, 7);
  assert.equal(g.step(1500).best, 10, 'its best height so far stays');
  g.hit('thief');
  assert.equal(g.step(2500).h, 13);
  g.hit('fog');
  g.hit('heat');
  assert.equal(g.step(3000).h, 19);
  assert.equal(g.penalty, 11);
  g.hit('bomb');
  assert.equal(g.penalty, 11, 'an unknown punishment takes nothing');
  assert.equal(g.step(9000).over, null, 'a run that simply stopped never falls');
  const fell = createGhost({ samples: [0, 50], endT: 1500, end: 'lives' });
  assert.equal(fell.step(1400).over, null);
  assert.equal(fell.step(1500).over, 'lives');
  const won = createGhost({ samples: [0, 500], endT: 1000, end: 'goal' });
  assert.equal(won.step(5000).over, null);
});

// ---------------------------------------------------------------------------------- the computer
test('Robot Rikus: the same seed gives the same run; usually ~0.3 m/s; one in four falls', () => {
  assert.deepEqual(botRun('abc123def0'), botRun('abc123def0'));
  assert.notDeepEqual(botRun('abc123def0'), botRun('abc123def1'));
  let goal = 0;
  const rates = [];
  const N = 300;
  for (let k = 0; k < N; k++) {
    const run = botRun(`seed${k}x`);
    assert.ok(['goal', 'lives', 'flood'].includes(run.end), run.end);
    assert.ok(run.samples.every((s) => s >= 0 && s <= DUEL.maxHeightM * 10));
    if (run.end === 'goal') {
      goal++;
      rates.push(DUEL.goalM / (run.endT / 1000));
      assert.ok(run.samples.at(-1) >= DUEL.goalM * 10);
    }
  }
  rates.sort((a, b) => a - b);
  const median = rates[rates.length >> 1];
  assert.ok(goal / N > 0.65 && goal / N < 0.85, `reached 50 m in ${goal}/${N}`);
  assert.ok(median > 0.28 && median < 0.42, `median ${median} m/s`);
});

// ---------------------------------------------------------------------------------- links
test('challenge link: a run survives the round trip exactly, and stays short', () => {
  for (const seed of ['abc123def0', 'zzzz', 'a1b2c3d4e5f6g7h8i9j0k1l2']) {
    const run = botRun(seed);
    const p = encodeChallenge({ seed, name: 'Anandré', run });
    assert.ok(p.length < 600, `payload ${p.length}`);
    const back = decodeChallenge(p);
    assert.deepEqual({ ...back, run: { ...back.run, endT: 0 } }, { seed, name: 'Anandré', run: { ...run, endT: 0 } });
    assert.ok(Math.abs(back.run.endT - run.endT) <= 50, 'the end time is kept to a tenth of a second');
  }
  const link = challengeLink('https://anandregroenewald.github.io/Toring/', { seed: 'abc123def0', name: 'Rikus', run: botRun('abc123def0') });
  assert.match(link, /^https:\/\/anandregroenewald\.github\.io\/Toring\/\?teen=1\.abc123def0\./);
  assert.deepEqual(parseChallengeQuery(new URL(link).search).run.samples, botRun('abc123def0').samples);
  // the nickname goes through the name rules (a rude one is dropped, the run still works)
  const rude = decodeChallenge(encodeChallenge({ seed: 'abc123def0', name: 'poes', run: botRun('abc123def0') }));
  assert.equal(rude.name, null);
  assert.equal(challengeLink('https://x/', { seed: 'bad seed!', run: botRun('x') }), 'https://x/');
});

test('challenge link: anything malformed is refused, never throws', () => {
  const good = encodeChallenge({ seed: 'abc123def0', name: 'Rikus', run: { samples: [0, 10, 20], endT: 2500, end: 'lives' } });
  const [v, seed, name, data] = good.split('.');
  const bad = [
    '', null, 42, 'x', `2.${seed}.${name}.${data}`, `1.BAD!.${name}.${data}`, `1.${seed}.${name}`,
    `1.${seed}.${name}.${data}.extra`, `1.${seed}.${name}.${data}AA`, `1.${seed}.${name}.${data.slice(0, -2)}`,
    `1.${seed}.${name}.%%%`, `1.${seed}.${'Q'.repeat(200)}.${data}`, `${v}.${seed}.${name}.${data}`.repeat(20),
    `1.${seed}.${name}.AAAA`, `1.${seed}.${name}.____`,
  ];
  for (const p of bad) assert.equal(decodeChallenge(p), null, String(p).slice(0, 40));
  // hand-made data: a height above 2 000 m, an unknown end code, a count that doesn't match
  const varint = (n) => {
    const out = [];
    for (let v = n; ; v = Math.floor(v / 128)) {
      if (v < 128) {
        out.push(v);
        return out;
      }
      out.push((v & 127) | 128);
    }
  };
  const payload = (bytes) => `1.${seed}.${name}.${Buffer.from(bytes).toString('base64url')}`;
  assert.ok(decodeChallenge(payload([...varint(25), 103, ...varint(1), ...varint(2 * 500)])), 'a sane hand-made run decodes');
  assert.equal(decodeChallenge(payload([...varint(25), 103, ...varint(1), ...varint(2 * 20001)])), null, 'over 2 000 m');
  assert.equal(decodeChallenge(payload([...varint(25), 120, ...varint(1), ...varint(2)])), null, 'end code x');
  assert.equal(decodeChallenge(payload([...varint(25), 103, ...varint(3), ...varint(2)])), null, 'too few samples');
  assert.equal(decodeChallenge(payload([...varint(25), 103, ...varint(0)])), null, 'no samples');
  assert.equal(decodeChallenge(payload([...varint(99999), 103, ...varint(1), ...varint(2)])), null, 'longer than 15 minutes');
  assert.equal(parseChallengeQuery(`?teen=${good}&teen=${good}`), null, 'twice is refused');
  assert.equal(parseChallengeQuery('?klop=375'), null);
  assert.equal(parseChallengeQuery(''), null);
});

test('room codes: six letters/digits without look-alikes; ?kamer= is checked', () => {
  let n = 0;
  const code = newRoomCode(() => n++ * 7919);
  assert.ok(isRoomCode(code));
  assert.ok(!/[01OIL]/.test(ROOM_ALPHABET));
  assert.equal(parseRoomQuery('?kamer=abcdef'), 'ABCDEF', 'lower case is fine');
  for (const q of ['?kamer=ABCDE', '?kamer=ABCDEFG', '?kamer=ABCDE0', '?kamer=ABC DE', '?kamer=ABCDEF&kamer=ABCDEF', '?teen=x']) {
    assert.equal(parseRoomQuery(q), null, q);
  }
});

test('seeds, nicknames and live reports', () => {
  const s = newMatchSeed(() => 0.5);
  assert.ok(isMatchSeed(s) && s.length === 10);
  assert.equal(duelSeedKey(s), `duel/${s}`);
  // a match's tower is its own: never a daily's or a practice's
  assert.notDeepEqual(
    [0, 1, 2, 3, 4].map((i) => createSequence(duelSeedKey('stapel-2026-10-06')).block(i)),
    [0, 1, 2, 3, 4].map((i) => createSequence('stapel-2026-10-06').block(i)),
  );
  assert.equal(cleanNickname(' Rikus '), 'Rikus');
  assert.equal(cleanNickname('x'), null);
  assert.equal(cleanNickname('a'.repeat(17)), null);
  assert.equal(cleanNickname('kak'), null);
  assert.equal(cleanNickname(7), null);
  assert.match(defaultNickname(() => 0), /^Bouer 100$/);
  assert.equal(defaultNickname(() => 355.5 / 900), 'Bouer 456', '455 reads as a rude word to the name rules: the next number');
  for (let n = 100; n < 1000; n++) {
    const d = defaultNickname(() => (n - 100 + 0.5) / 900);
    assert.equal(cleanNickname(d), d, `every default name passes the name rules (${d})`);
  }
  for (let k = 0; k < 20; k++) {
    const d = defaultNickname();
    assert.equal(cleanNickname(d), d, 'the default names pass the name rules');
  }
  assert.deepEqual(cleanReport({ h: 3.5, best: 4 }), { h: 3.5, best: 4, over: null });
  assert.deepEqual(cleanReport({ h: 1e9, best: 2, over: 'flood' }), { h: DUEL.maxHeightM, best: 2, over: 'flood' });
  assert.equal(cleanReport({ h: -1, best: 2 }), null);
  assert.equal(cleanReport({ h: 'x', best: 2 }), null);
  assert.equal(cleanReport(null), null);
  assert.equal(cleanReport({ h: 1, best: 1, over: 'nonsense' }).over, 'quit');
});

// ---------------------------------------------------------------------------------- share + stats
test('share text after a match: who won and the link to play against your run', () => {
  const t = buildDuelShareText({ outcome: 'won', youBest: 50.3, oppName: 'Rikus', oppBest: 41.25, link: 'https://x/?teen=1.a' });
  assert.equal(t, [
    'Stapel Uitdagersreeks ⚔️',
    `Ek 50,3${NB}m · Rikus 41,3${NB}m: gewen! 🏆`,
    'Kan jy my klop? Speel teen my rondte:',
    'https://x/?teen=1.a',
    'Stapel hoog. Staan sterk.',
  ].join('\n'));
  const lost = buildDuelShareText({ outcome: 'lost', youBest: 12, oppName: '', oppBest: 50 }).split('\n');
  assert.equal(lost[1], `Ek 12,0${NB}m · ’n Vriend 50,0${NB}m: verloor`);
  assert.equal(lost.length, 3, 'no link line without a link');
  assert.equal(buildDuelShareText({ outcome: 'none' }).split('\n').length, 2);
});

test('stats: nickname (name rules) and wins/losses with a winning streak', () => {
  const s = createStore(memoryBackend());
  assert.deepEqual(s.getDuel(), { name: null, played: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, mode: 'race' });
  assert.deepEqual(s.setDuelName('  Sannie '), { ok: true, name: 'Sannie' });
  assert.deepEqual(s.setDuelName('kak'), { ok: false, name: 'Sannie' });
  s.recordDuel('won');
  s.recordDuel('won');
  s.recordDuel('lost');
  s.recordDuel('won');
  assert.deepEqual(s.getDuel(), { name: 'Sannie', played: 4, wins: 3, losses: 1, streak: 1, bestStreak: 2, mode: 'race' });
  assert.deepEqual(s.setDuelName(''), { ok: true, name: null });
  // junk in storage is cleaned on load
  const be = memoryBackend();
  be.setItem('stapel.v1', JSON.stringify({ v: 1, duel: { name: 'kak', played: -3, wins: 2, losses: 'x', streak: 5, bestStreak: 1 } }));
  assert.deepEqual(createStore(be).getDuel(), { name: null, played: 2, wins: 2, losses: 0, streak: 5, bestStreak: 5, mode: 'race' });
  // the way to play last chosen (1.11): Blok vir Blok kept, anything else is Wedloop
  const s2 = createStore(be);
  assert.equal(s2.setDuelMode('turns'), 'turns');
  assert.equal(createStore(be).getDuel().mode, 'turns');
  assert.equal(s2.setDuelMode('chess'), 'race');
});
