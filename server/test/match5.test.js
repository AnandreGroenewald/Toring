// Protocol 5 (1.12.1) in the room: a game whose connection went keeps its seat for DUEL.rejoinMs and comes back
// on a new connection with what it missed (Wedloop and Blok vir Blok); the friend who opens a link sees who
// invites and may answer "Sorry, besig nou"; a finished friend match starts again when both say "Speel weer";
// a pause in a friend match stops both games. Older games (protocol 4) play exactly as before.
// Fake Durable Object state and sockets (as in match.test.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom } from '../src/match.js';
import { DUEL, TURNS } from '../../js/config.js';
import { T0 } from './support/harness.js';

function fakeSocket() {
  return {
    sent: [],
    closed: false,
    att: null,
    send(s) {
      if (this.closed) throw new Error('closed');
      this.sent.push(JSON.parse(s));
    },
    close(code, reason) {
      this.closed = true;
      this.reason = reason;
    },
    serializeAttachment(v) {
      this.att = structuredClone(v);
    },
    deserializeAttachment() {
      return this.att ? structuredClone(this.att) : null;
    },
    of(t) {
      return this.sent.filter((m) => m.t === t);
    },
    last(t) {
      return this.of(t).at(-1);
    },
  };
}

function fakeState() {
  const store = new Map();
  const sockets = [];
  const st = {
    writes: 0,
    alarm: null,
    storage: {
      async get(k) {
        return store.has(k) ? structuredClone(store.get(k)) : undefined;
      },
      async put(k, v) {
        st.writes++;
        store.set(k, structuredClone(v));
      },
      async deleteAll() {
        store.clear();
      },
      async setAlarm(t) {
        st.alarm = t;
      },
    },
    acceptWebSocket(ws, tags = []) {
      sockets.push({ ws, tags });
    },
    getWebSockets(tag) {
      return sockets.filter((s) => !s.ws.closed && (!tag || s.tags.includes(tag))).map((s) => s.ws);
    },
    store,
  };
  return st;
}

const upgrade = () => {
  const ws = fakeSocket();
  return [{ status: 101, ws }, ws];
};

function clock(t = T0) {
  const c = { t, now: () => c.t, tick: (ms) => { c.t += ms; } };
  return c;
}

const say = (room, ws, o) => room.onMessage(ws, JSON.stringify(o));
const KEYS = ['annakey12345', 'bennie123456'];
const POSE = [360.125, -812.5, 0.0314, 120.5, -3.25];
const snap = (i, r = 'G') => (r === 'X' ? { blocks: [], lost: [i] } : { blocks: [[i, 360 + i, 400 - 40 * i, 0.001, 0, r]], lost: [] });

/** A started room of two games (protocol v each), with their keys. */
async function room5({ kind = 'friend', mode = 'race', v = [5, 5] } = {}) {
  const clk = clock();
  const state = fakeState();
  const room = new MatchRoom(state, {}, { now: clk.now, upgrade });
  await room.init({ kind, mode, seed: 'seedabc123' });
  const a = fakeSocket();
  const b = fakeSocket();
  await room.join(a);
  await room.join(b);
  await say(room, a, { t: 'hello', name: 'Anna', v: v[0], key: KEYS[0] });
  await say(room, b, { t: 'hello', name: 'Bennie', v: v[1], key: KEYS[1] });
  clk.tick(DUEL.countdownMs);
  return { room, a, b, clk, state };
}

/** A game back on a new connection (?rejoin=1, its key). */
async function comeBack(room, key, { v = 5, have = {} } = {}) {
  const ws = fakeSocket();
  await room.join(ws, { rejoin: true });
  await say(room, ws, { t: 'hello', v, key, rejoin: true, name: 'x', have });
  return ws;
}

// ------------------------------------------------------------------------------------ "Sorry, besig nou"
test('a friend room says who invites; the friend answers "Sorry, besig nou": the host hears it, the room stays open', async () => {
  const clk = clock();
  const room = new MatchRoom(fakeState(), {}, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', mode: 'turns', seed: 'seedabc123' });
  const host = fakeSocket();
  await room.join(host);
  assert.deepEqual(host.sent, [{ t: 'wait' }], 'nobody invited yet');
  await say(room, host, { t: 'hello', name: 'Anna', v: 5, key: KEYS[0] });
  const friend = fakeSocket();
  await room.join(friend);
  assert.deepEqual(friend.last('wait'), { t: 'wait', host: { name: 'Anna', mode: 'turns' } });
  await say(room, friend, { t: 'decline', name: 'Bennie' });
  assert.deepEqual(host.last('declined'), { t: 'declined', name: 'Bennie' });
  assert.equal(friend.closed, true);
  assert.equal(host.closed, false, 'the host still waits (the link may have gone to a group)');
  // someone else from the group comes and plays
  const carla = fakeSocket();
  await room.join(carla);
  await say(room, carla, { t: 'hello', name: 'Carla', v: 5, key: 'carlakey1234' });
  assert.equal(host.last('start').opp.name, 'Carla');
  assert.equal(carla.last('start').opp.name, 'Anna');
});

test('"Sorry, besig nou" while the host\'s game is away (sharing the link): they hear it when it is back', async () => {
  const clk = clock();
  const room = new MatchRoom(fakeState(), {}, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', seed: 'seedabc123' });
  const host = fakeSocket();
  await room.join(host);
  await say(room, host, { t: 'hello', name: 'Anna', v: 5, key: KEYS[0] });
  host.closed = true;   // WhatsApp is open: the game let its connection go
  await room.onClose(host);
  const friend = fakeSocket();
  await room.join(friend);
  assert.deepEqual(friend.last('wait'), { t: 'wait', host: { name: 'Anna', mode: 'race' } }, 'who invites is known while they are away');
  await say(room, friend, { t: 'decline', name: 'Bennie' });
  const back = fakeSocket();
  await room.join(back);
  await say(room, back, { t: 'hello', name: 'Anna', v: 5, key: KEYS[0] });
  assert.deepEqual(back.of('declined'), [{ t: 'declined', name: 'Bennie' }]);
  // said once only
  const again = fakeSocket();
  await room.join(again);
  await say(room, again, { t: 'hello', name: 'Anna', v: 5, key: KEYS[0] });
  assert.equal(again.of('declined').length, 0);
});

test('a decline after hello, in a random room or after the start does nothing', async () => {
  const { room, a, b } = await room5({ kind: 'random' });
  await say(room, b, { t: 'decline', name: 'Bennie' });
  assert.equal(a.of('declined').length, 0);
  assert.equal(b.closed, false);
});

// ------------------------------------------------------------------------------------ back after a dropped connection
test('Wedloop: a dropped connection keeps its seat; back within the time, it hears where the other tower is and what it missed', async () => {
  const { room, a, b, clk } = await room5();
  assert.equal(a.last('start').sv, 5, 'a 1.12.1 game hears the room can take it back');
  assert.equal(a.last('start').room, 'friend');
  clk.tick(4000);
  await say(room, a, { t: 'state', h: 8, best: 8 });
  // Anna's phone moves from Wi-Fi to mobile data: her connection goes
  a.closed = true;
  await room.onClose(a);
  assert.deepEqual(b.last('away'), { t: 'away' });
  assert.equal(b.of('result').length, 0, 'not decided: she may come back');
  // meanwhile Bennie reaches 10 m first: he chooses, and the punishment goes to her tower
  clk.tick(3000);
  await say(room, b, { t: 'state', h: 10.5, best: 10.5 });
  await say(room, b, { t: 'punish', m: 10, kind: 'fog' });
  assert.deepEqual(b.last('sent'), { t: 'sent', m: 10, kind: 'fog' });
  // she is back (a new connection, her key)
  clk.tick(5000);
  const a2 = await comeBack(room, KEYS[0]);
  const rej = a2.last('rejoined');
  assert.equal(rej.you, 0);
  assert.deepEqual(rej.opp, { t: 'opp', h: 10.5, best: 10.5 });
  assert.deepEqual(a2.of('attack'), [{ t: 'attack', m: 10, kind: 'fog' }], 'the punishment she missed comes again');
  assert.deepEqual(b.last('back'), { t: 'back' });
  // the match goes on: her reports count again, the race is decided as usual
  clk.tick(30000);
  await say(room, a2, { t: 'state', h: 50, best: 50 });
  assert.equal(b.last('result').winner, 0);
  assert.equal(a2.last('result').winner, 0);
});

test('Wedloop: not back within DUEL.rejoinMs: the other player wins, as if she left', async () => {
  const { room, a, b, clk, state } = await room5();
  a.closed = true;
  await room.onClose(a);
  assert.equal(state.alarm, clk.t + DUEL.rejoinMs, 'the room wakes when her seat is no longer kept');
  clk.tick(DUEL.rejoinMs);
  await room.alarm();
  assert.deepEqual(b.last('result'), { t: 'result', winner: 1, reason: 'left', best: [0, 0] });
  // back after that: she hears the result (it was hers to hear)
  const a2 = await comeBack(room, KEYS[0]);
  assert.equal(a2.last('result').winner, 1);
});

test('back while the room never heard the old connection close: the old one goes and never counts as leaving', async () => {
  const { room, a, b, clk } = await room5();
  clk.tick(2000);
  const a2 = await comeBack(room, KEYS[0]);
  assert.equal(a.closed, true, 'the old connection is replaced');
  assert.equal(a2.last('rejoined').you, 0);
  assert.equal(b.of('back').length, 0, 'nobody heard she was away');
  await room.onClose(a);   // its close arrives late
  assert.equal(b.of('result').length, 0);
  assert.equal(b.of('away').length, 0);
});

test('a stranger, a wrong key or an old game cannot take a seat back', async () => {
  const { room, a } = await room5();
  a.closed = true;
  await room.onClose(a);
  const x = await comeBack(room, 'strangerkey1');
  assert.deepEqual(x.sent, [{ t: 'gone' }]);
  assert.equal(x.closed, true);
  const old = await comeBack(room, KEYS[0], { v: 4 });
  assert.deepEqual(old.sent, [{ t: 'gone' }]);
  // and a plain join (no ?rejoin) of a started room is "gone", as always
  const c = fakeSocket();
  await room.join(c);
  assert.deepEqual(c.sent, [{ t: 'gone' }]);
});

test('an older game (protocol 4) that drops still loses at once, as before', async () => {
  const { room, a, b } = await room5({ v: [4, 5] });
  a.closed = true;
  await room.onClose(a);
  assert.equal(b.last('result').reason, 'left');
  assert.equal(b.of('away').length, 0);
});

test('Blok vir Blok: the watching player drops; the turn played meanwhile and their own turn wait for them', async () => {
  const { room, a, b, clk, state } = await room5({ mode: 'turns' });
  const first = a.last('start').turn.seat;
  const [mover, watcher] = first === 0 ? [a, b] : [b, a];
  const watcherKey = KEYS[first === 0 ? 1 : 0];
  watcher.closed = true;
  await room.onClose(watcher);
  assert.deepEqual(mover.last('away'), { t: 'away' });
  // the mover plays turn 1 meanwhile
  await say(room, mover, { t: 'go', n: 1 });
  await say(room, mover, { t: 'drop', n: 1, p: POSE, ct: 1200 });
  clk.tick(2000);
  await say(room, mover, { t: 'settled', n: 1, lost: false, r: 'G', snap: snap(0) });
  assert.equal(mover.last('turn').n, 2, 'turn 2 is the watcher\'s');
  assert.ok(state.alarm <= clk.t + DUEL.rejoinMs + 1000, 'their turn waits no longer than their seat is kept');
  clk.tick(6000);
  const w2 = await comeBack(room, watcherKey, { have: { n: 1 } });
  const got = w2.sent.map((m) => m.t);
  assert.equal(got[0], 'rejoined');
  for (const t of ['go', 'drop', 'settled', 'turn']) assert.ok(got.includes(t), `missed ${t} comes again`);
  assert.equal(w2.last('turn').n, 2);
  assert.deepEqual(mover.last('back'), { t: 'back' });
  // the watcher plays their turn as usual
  await say(room, w2, { t: 'go', n: 2 });
  await say(room, w2, { t: 'drop', n: 2, p: POSE, ct: 900 });
  assert.equal(mover.last('drop').n, 2);
  await say(room, w2, { t: 'settled', n: 2, lost: false, r: 'G', snap: snap(1) });
  assert.equal(mover.last('turn').n, 3);
});

test('Blok vir Blok: the mover drops mid-turn and sends the turn again when back: passed on once, scored once', async () => {
  const { room, a, b, clk } = await room5({ mode: 'turns' });
  const first = a.last('start').turn.seat;
  const [mover, watcher] = first === 0 ? [a, b] : [b, a];
  const moverKey = KEYS[first];
  await say(room, mover, { t: 'go', n: 1 });
  await say(room, mover, { t: 'drop', n: 1, p: POSE, ct: 1000 });
  mover.closed = true;   // its 'settled' never went
  await room.onClose(mover);
  clk.tick(4000);
  const m2 = await comeBack(room, moverKey, { have: { n: 1 } });
  assert.equal(m2.last('rejoined').you, first);
  // the game sends its turn's messages again
  await say(room, m2, { t: 'go', n: 1 });
  await say(room, m2, { t: 'drop', n: 1, p: POSE, ct: 1000 });
  await say(room, m2, { t: 'settled', n: 1, lost: false, r: 'P', snap: snap(0, 'P') });
  assert.equal(watcher.of('go').length, 1, 'go passed on once');
  assert.equal(watcher.of('drop').length, 1, 'drop passed on once');
  assert.equal(watcher.of('settled').length, 1);
  assert.equal(watcher.last('turn').n, 2);
  await say(room, m2, { t: 'settled', n: 1, lost: false, r: 'P', snap: snap(0, 'P') });
  assert.equal(watcher.of('settled').length, 1, 'a report sent twice counts once');
});

test('Blok vir Blok: a player away when their turn comes, not back in time: the other one wins', async () => {
  const { room, a, b, clk } = await room5({ mode: 'turns' });
  const first = a.last('start').turn.seat;
  const [mover, watcher] = first === 0 ? [a, b] : [b, a];
  watcher.closed = true;
  await room.onClose(watcher);
  await say(room, mover, { t: 'settled', n: 1, lost: false, r: 'G', snap: snap(0) });
  clk.tick(DUEL.rejoinMs);
  await room.alarm();
  assert.equal(mover.last('result').winner, first);
  assert.equal(mover.last('result').reason, 'quit');
});

// ------------------------------------------------------------------------------------ a pause for both
test('a friend match: a pause stops both games; either goes on; the race\'s clock skips the pause', async () => {
  const { room, a, b, clk, state } = await room5();
  clk.tick(5000);
  await say(room, a, { t: 'state', h: 9, best: 9 });
  await say(room, a, { t: 'pause' });
  assert.deepEqual(a.last('paused'), { t: 'paused', by: 0, ms: DUEL.pauseMs, left: DUEL.pauses - 1 });
  assert.deepEqual(b.last('paused'), { t: 'paused', by: 0, ms: DUEL.pauseMs, left: DUEL.pauses });
  await say(room, b, { t: 'pause' });
  assert.equal(b.last('nopause').left, DUEL.pauses, 'one pause at a time');
  clk.tick(20000);
  await say(room, b, { t: 'resume' });
  assert.deepEqual(a.last('resumed'), { t: 'resumed', ms: DUEL.resumeMs });
  assert.deepEqual(b.last('resumed'), { t: 'resumed', ms: DUEL.resumeMs });
  // the climb limit skips the pause: 9 m + a fast climb right after is still possible, but not 20 m more
  clk.tick(DUEL.resumeMs + 1000);
  await say(room, a, { t: 'state', h: 60, best: 60 });
  assert.equal(b.of('result').length, 0, 'no 50 m from the pause\'s time');
  assert.ok(b.last('opp').best < 30);
  assert.ok(state.alarm > clk.t);
});

test('a pause runs out by itself after DUEL.pauseMs; each player has DUEL.pauses', async () => {
  const { room, a, b, clk } = await room5();
  clk.tick(2000);
  for (let k = 0; k < DUEL.pauses; k++) {
    await say(room, a, { t: 'pause' });
    assert.equal(a.last('paused').left, DUEL.pauses - 1 - k);
    clk.tick(DUEL.pauseMs);
    await room.alarm();
    assert.equal(b.of('resumed').length, k + 1, 'it ran out: both go on');
    clk.tick(DUEL.resumeMs + 1000);
  }
  await say(room, a, { t: 'pause' });
  assert.deepEqual(a.last('nopause'), { t: 'nopause', left: 0 });
  await say(room, b, { t: 'pause' });
  assert.equal(b.last('paused').by, 1, 'Bennie still has his');
});

test('no pause for both in a random match, with an older game, or while one is away', async () => {
  {
    const { room, a, b, clk } = await room5({ kind: 'random' });
    clk.tick(1000);
    await say(room, a, { t: 'pause' });
    assert.equal(a.of('nopause').length, 1);
    assert.equal(b.of('paused').length, 0);
  }
  {
    const { room, a, b, clk } = await room5({ v: [5, 4] });
    clk.tick(1000);
    await say(room, a, { t: 'pause' });
    assert.equal(a.of('nopause').length, 1);
    assert.equal(b.of('paused').length, 0);
  }
  {
    const { room, a, b, clk } = await room5();
    clk.tick(1000);
    b.closed = true;
    await room.onClose(b);
    await say(room, a, { t: 'pause' });
    assert.equal(a.of('nopause').length, 1);
  }
});

test('Blok vir Blok: a pause moves the turn\'s deadline on by the pause', async () => {
  const { room, a, b, clk } = await room5({ mode: 'turns' });
  clk.tick(1000);
  await say(room, a, { t: 'pause' });
  const before = room.m.deadline;
  clk.tick(30000);
  await say(room, a, { t: 'resume' });
  assert.equal(room.m.deadline, before + 30000 + DUEL.resumeMs);
  clk.tick(TURNS.serverTurnMs - 1000);
  await room.alarm();
  assert.equal(a.of('result').length, 0, 'the pause doesn\'t count against the player whose turn it is');
});

// ------------------------------------------------------------------------------------ "Speel weer"
test('a finished friend match starts again in the same room once both say "Speel weer"', async () => {
  const { room, a, b, clk, state } = await room5();
  clk.tick(30000);
  await say(room, a, { t: 'state', h: 50, best: 50 });
  assert.equal(b.last('result').winner, 0);
  assert.equal(state.alarm, clk.t + DUEL.againMs, 'the room waits for "Speel weer"');
  await say(room, b, { t: 'again' });
  assert.deepEqual(a.last('again'), { t: 'again' });
  assert.equal(a.of('start').length, 1, 'not before both said it');
  clk.tick(5000);
  await say(room, a, { t: 'again' });
  const s1 = a.last('start');
  const s2 = b.last('start');
  assert.equal(a.of('start').length, 2);
  assert.notEqual(s1.seed, 'seedabc123', 'a new tower');
  assert.equal(s1.seed, s2.seed);
  assert.equal(s1.opp.name, 'Bennie');
  // the new match runs as usual
  clk.tick(DUEL.countdownMs + 6000);
  await say(room, b, { t: 'state', h: 10.2, best: 10.2 });
  assert.deepEqual(b.last('choose'), { t: 'choose', m: 10, def: 'monkey' });
  assert.equal(b.of('choose').length, 1);
});

test('"Speel weer" when the other player already went: they hear "bye"', async () => {
  const { room, a, b, clk, state } = await room5({ mode: 'turns' });
  await say(room, a, { t: 'over', reason: 'quit' });
  assert.ok(b.last('result'));
  b.closed = true;
  await room.onClose(b);
  assert.deepEqual(a.last('bye'), { t: 'bye' });
  await say(room, a, { t: 'again' });
  assert.equal(a.of('bye').length, 2);
  assert.equal(a.of('start').length, 1);
  // early wakes don't close the room; at its time it closes
  await room.alarm();
  assert.equal(a.closed, false);
  clk.tick(DUEL.againMs);
  await room.alarm();
  assert.equal(a.closed, true);
  assert.equal(state.store.size, 0);
});

test('a random match or an older game: no "Speel weer" in the room (it closes as before)', async () => {
  const { room, a, b, clk, state } = await room5({ kind: 'random' });
  clk.tick(30000);
  await say(room, a, { t: 'state', h: 50, best: 50 });
  assert.equal(state.alarm, clk.t + 60 * 1000);
  await say(room, a, { t: 'again' });
  await say(room, b, { t: 'again' });
  assert.equal(a.of('start').length, 1);
});

// ------------------------------------------------------------------------------------ the review's findings (1.12.1)
test('Blok vir Blok: a pause longer than the turn\'s time left: the room sleeps until the pause ends (no alarm loop)', async () => {
  const { room, a, clk, state } = await room5({ mode: 'turns' });
  clk.tick(30000);   // most of the turn's 45 s gone
  await say(room, a, { t: 'pause' });
  const until = room.m.paused.until;
  assert.equal(state.alarm, until, 'the alarm waits for the pause\'s end, not the (passing) turn deadline');
  clk.tick(20000);   // past the old deadline, still paused
  await room.alarm();
  assert.equal(state.alarm, until, 'woken early: back to sleep until the pause ends (not now + 1 ms)');
  assert.equal(a.of('result').length, 0);
  clk.tick(until - clk.t);
  await room.alarm();
  assert.equal(a.last('resumed').t, 'resumed');
  assert.ok(state.alarm > clk.t + 10000, 'then the moved-on deadline');
});

test('a group\'s link: whoever reads the invite holds no seat; the first to say "Speel" plays, after a decline too', async () => {
  const clk = clock();
  const room = new MatchRoom(fakeState(), {}, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', seed: 'seedabc123' });
  const host = fakeSocket();
  await room.join(host);
  await say(room, host, { t: 'hello', name: 'Anna', v: 5, key: KEYS[0] });
  const reader = fakeSocket();   // reads the invite, decides nothing yet
  await room.join(reader);
  await say(room, reader, { t: 'look' });
  const late = fakeSocket();     // came while the reader still held the seat
  await room.join(late);
  await say(room, late, { t: 'look' });
  await say(room, reader, { t: 'decline', name: 'Bennie' });
  assert.deepEqual(host.last('declined'), { t: 'declined', name: 'Bennie' });
  await say(room, late, { t: 'hello', name: 'Carla', v: 5, key: 'carlakey1234' });
  assert.equal(host.last('start').opp.name, 'Carla');
  assert.equal(late.last('start').opp.name, 'Anna');
  // and two readers: the first to say "Speel" plays, the other hears the room is gone
  const r2 = new MatchRoom(fakeState(), {}, { now: clk.now, upgrade });
  await r2.init({ kind: 'friend', seed: 'seedabc123' });
  const h2 = fakeSocket();
  await r2.join(h2);
  await say(r2, h2, { t: 'hello', name: 'Anna', v: 5, key: KEYS[0] });
  const x = fakeSocket();
  const y = fakeSocket();
  await r2.join(x);
  await say(r2, x, { t: 'look' });
  await r2.join(y);
  await say(r2, y, { t: 'look' });
  await say(r2, y, { t: 'hello', name: 'Yolande', v: 5, key: 'yolandekey12' });
  assert.equal(h2.last('start').opp.name, 'Yolande');
  await say(r2, x, { t: 'hello', name: 'Xander', v: 5, key: 'xanderkey123' });
  assert.deepEqual(x.last('gone'), { t: 'gone' });
});

test('a "Sorry, besig nou" kept while the host was away goes to the host only, never to another friend', async () => {
  const clk = clock();
  const room = new MatchRoom(fakeState(), {}, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', seed: 'seedabc123' });
  const host = fakeSocket();
  await room.join(host);
  await say(room, host, { t: 'hello', name: 'Anna', v: 5, key: KEYS[0] });
  host.closed = true;
  await room.onClose(host);
  const guest = fakeSocket();   // a friend who said "Speel" while Anna is away
  await room.join(guest);
  await say(room, guest, { t: 'hello', name: 'Carla', v: 5, key: 'carlakey1234' });
  const busy = fakeSocket();
  await room.join(busy);
  await say(room, busy, { t: 'look' });
  await say(room, busy, { t: 'decline', name: 'Bennie' });
  assert.equal(guest.of('declined').length, 0, 'not for Carla');
  const back = fakeSocket();
  await room.join(back);
  await say(room, back, { t: 'hello', name: 'Anna', v: 5, key: KEYS[0] });
  assert.deepEqual(back.of('declined'), [{ t: 'declined', name: 'Bennie' }]);
});
