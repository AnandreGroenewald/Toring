// Protocol 5 (1.12.1) on the device (js/duel.js): a live match whose connection goes comes back to its room
// (the owner: "it just switch from Wifi to data and it disconnected, cant you make it reconnecting"); a friend's
// link asks "Speel" or "Sorry, besig nou" first; a friend match can pause both games; "Speel weer" after a friend
// match plays the same friend again in the same room. A room of an older Worker (no `sv`) works as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bus } from '../js/core/bus.js';
import { createDuel } from '../js/duel.js';
import { DUEL } from '../js/config.js';

function fakeTimers() {
  let id = 0;
  let t = 0;
  const due = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      due.set(++id, { fn, at: t + ms });
      return id;
    },
    clearTimer: (k) => {
      due.delete(k);
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...due].filter(([, d]) => d.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        t = Math.max(t, next[1].at);
        due.delete(next[0]);
        next[1].fn();
      }
      t = end;
    },
  };
}

const sockets = [];
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.sent = [];
    sockets.push(this);
  }
  send(s) {
    this.sent.push(JSON.parse(s));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.onopen?.();
  }
  hear(o) {
    this.onmessage?.({ data: JSON.stringify(o) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  of(t) {
    return this.sent.filter((m) => m.t === t);
  }
}

function setup() {
  sockets.length = 0;
  const timers = fakeTimers();
  const bus = new Bus();
  const seen = [];
  for (const ev of ['duel:end', 'duel:conn', 'duel:paused', 'duel:resumed', 'duel:nopause', 'duel:again', 'turns:drop', 'turns:settled', 'turns:turn', 'duel:attack', 'hud:toast']) {
    bus.on(ev, (e) => seen.push([ev, e]));
  }
  const duel = createDuel({
    bus, apiUrl: 'https://borge.example', nickname: () => 'Anna', WebSocketImpl: FakeSocket,
    fetchImpl: async () => ({ ok: true, json: async () => ({ code: 'DDDD55' }) }),
    setTimer: timers.setTimer, clearTimer: timers.clearTimer, now: timers.now,
  });
  const of = (ev) => seen.filter(([e]) => e === ev).map(([, x]) => x);
  return { duel, timers, bus, of };
}

const START = { t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie', v: 5 }, sv: 5, room: 'friend' };
const TURN1 = { n: 1, seat: 0, hearts: [3, 3], streaks: [0, 0], sab: null };
const POSE = [360.125, -812.5, 0.0314, 120.5, -3.25];
const SNAP = { blocks: [[0, 360, 400, 0.001, 0, 'G']], lost: [] };

/** A live friend match (Wedloop unless `turns`), started and on screen. */
async function liveMatch({ turns = false, start = START } = {}) {
  const env = setup();
  const starts = [];
  await env.duel.createRoom({ onStart: (m) => starts.push(m), ...(turns ? { mode: 'turns' } : {}) });
  const room = sockets.at(-1);
  room.open();
  room.hear(turns ? { ...start, mode: 'turns', turn: TURN1 } : start);
  env.bus.emit(turns ? 'turns:ready' : 'duel:ready');
  return { ...env, room, starts };
}

// ------------------------------------------------------------------------------------ back after a dropped connection
test('Wedloop: the connection goes (Wi-Fi to mobile data): the game comes back to its room, the match goes on', async () => {
  const { duel, timers, bus, room, of } = await liveMatch();
  bus.emit('duel:self', { t: 4000, h: 8.2, best: 8.2, lives: 3 });
  room.drop();
  assert.deepEqual(of('duel:end'), [], 'the match does not end');
  assert.deepEqual(of('duel:conn').at(-1), { state: 'lost', mine: true });
  const back = sockets.at(-1);
  assert.match(back.url, /\/match\/room\/DDDD55\?rejoin=1$/, 'its own room again, at once');
  back.open();
  const hello = back.of('hello')[0];
  assert.equal(hello.rejoin, true);
  assert.equal(hello.key, room.sent[0].key, 'the same key as before');
  // the room takes it back: the other tower's height, then what was missed (an attack, heard twice: once)
  back.hear({ t: 'rejoined', you: 0, opp: { t: 'opp', h: 11, best: 11, lives: 2 } });
  back.hear({ t: 'attack', m: 10, kind: 'fog' });
  back.hear({ t: 'attack', m: 10, kind: 'fog' });
  assert.deepEqual(of('duel:conn').at(-1), { state: 'back', mine: true });
  assert.equal(of('duel:attack').length, 1);
  assert.equal(duel.match.oppBest, 11);
  assert.deepEqual(back.of('state').at(-1), { t: 'state', h: 8.2, best: 8.2, lives: 3 }, 'where our tower is, again');
  // the match runs on the new connection
  bus.emit('duel:self', { t: 4500, h: 9, best: 9, lives: 3 });
  timers.advance(DUEL.stateEveryMs + 10);
  bus.emit('duel:self', { t: 4900, h: 9.4, best: 9.4, lives: 3 });
  assert.equal(back.of('state').at(-1).best, 9.4);
  back.hear({ t: 'result', winner: 0, reason: 'goal', best: [50, 30] });
  assert.equal(duel.summary().outcome, 'won');
});

test('a punishment chosen while the connection was gone is said again when the game is back', async () => {
  const { bus, room } = await liveMatch();
  room.hear({ t: 'choose', m: 10, def: 'monkey' });
  room.drop();
  bus.emit('ui:duel-punish', { m: 10, kind: 'thief' });
  const back = sockets.at(-1);
  back.open();
  back.hear({ t: 'rejoined', you: 0, opp: null });
  assert.deepEqual(back.of('punish'), [{ t: 'punish', m: 10, kind: 'thief' }]);
  back.hear({ t: 'sent', m: 10, kind: 'thief' });
  back.hear({ t: 'sent', m: 10, kind: 'thief' });   // heard again: once
});

test('not back within DUEL.rejoinMs: the match ends and does not count, as before 1.12.1', async () => {
  const { duel, timers, room, of } = await liveMatch();
  room.drop();
  for (let k = 0; k < 20; k++) {
    timers.advance(1000);
    const s = sockets.at(-1);
    if (s.readyState === 1 && !s.failed) {   // every try fails (no network)
      s.failed = true;
      s.drop();
    }
  }
  assert.deepEqual(of('duel:end'), [{ outcome: 'none' }]);
  assert.equal(of('duel:conn').at(-1).state, 'gone');
  assert.equal(duel.summary().outcome, 'none');
  assert.ok(sockets.length > 3, 'it kept trying meanwhile');
});

test('the room no longer knows the game ("gone"): it ends at once and does not count', async () => {
  const { room, of } = await liveMatch();
  room.drop();
  const back = sockets.at(-1);
  back.open();
  back.hear({ t: 'gone' });
  assert.deepEqual(of('duel:end'), [{ outcome: 'none' }]);
});

test('a room of an older Worker (no sv): a dropped connection ends the match at once, as before', async () => {
  const { room, of } = await liveMatch({ start: { t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie', v: 4 } } });
  const n = sockets.length;
  room.drop();
  assert.deepEqual(of('duel:end'), [{ outcome: 'none' }]);
  assert.equal(sockets.length, n, 'no new connection');
});

test('Blok vir Blok: our turn\'s messages go again when back; the room\'s again are taken once', async () => {
  const { bus, room, of } = await liveMatch({ turns: true });
  bus.emit('turns:mygo', { n: 1 });
  bus.emit('turns:mydrop', { n: 1, p: POSE, ct: 1500 });
  room.drop();   // the report never went
  bus.emit('turns:mysettled', { n: 1, lost: false, r: 'G', snap: SNAP });
  const back = sockets.at(-1);
  back.open();
  back.hear({ t: 'rejoined', you: 0 });
  assert.deepEqual(back.sent.filter((m) => m.t !== 'hello').map((m) => m.t), ['go', 'drop', 'settled'], 'this turn, again, in order');
  // the room's next turn, then the other player's turn (said twice: once)
  back.hear({ t: 'turn', n: 2, seat: 1, hearts: [3, 3], streaks: [0, 0], sab: null });
  back.hear({ t: 'drop', n: 2, p: POSE, ct: 900 });
  back.hear({ t: 'drop', n: 2, p: POSE, ct: 900 });
  back.hear({ t: 'settled', n: 2, lost: false, r: 'G', snap: { blocks: [[1, 360, 360, 0, 0, 'G']], lost: [] } });
  back.hear({ t: 'settled', n: 2, lost: false, r: 'G', snap: { blocks: [[1, 360, 360, 0, 0, 'G']], lost: [] } });
  assert.equal(of('turns:drop').length, 1);
  assert.equal(of('turns:settled').length, 1);
});

test('the other player\'s connection goes and comes back: the game hears both', async () => {
  const { room, of } = await liveMatch();
  room.hear({ t: 'away' });
  assert.deepEqual(of('duel:conn').at(-1), { state: 'lost', mine: false, name: 'Bennie' });
  room.hear({ t: 'back' });
  assert.deepEqual(of('duel:conn').at(-1), { state: 'back', mine: false, name: 'Bennie' });
});

// ------------------------------------------------------------------------------------ "Speel" or "Sorry, besig nou"
test('a friend\'s link: who invites first; nothing starts until "Speel"', async () => {
  const { duel } = setup();
  const invites = [];
  const starts = [];
  duel.joinRoom('EEEE66', { invite: true, onInvite: (h) => invites.push(h), onStart: (m) => starts.push(m) });
  const ws = sockets.at(-1);
  ws.open();
  assert.equal(ws.of('hello').length, 0, 'no hello before the player chose');
  ws.hear({ t: 'wait', host: { name: 'Anna', mode: 'turns' } });
  assert.deepEqual(invites, [{ name: 'Anna', mode: 'turns' }]);
  assert.equal(duel.acceptInvite(), true);
  assert.equal(ws.of('hello').length, 1);
  ws.hear({ ...START, you: 1, opp: { name: 'Anna', v: 5 }, mode: 'turns', turn: TURN1 });
  assert.equal(starts.length, 1);
});

test('"Sorry, besig nou": the answer goes to the room, then the game lets the room go', async () => {
  const { duel, timers } = setup();
  const invites = [];
  duel.joinRoom('EEEE66', { invite: true, onInvite: (h) => invites.push(h) });
  const ws = sockets.at(-1);
  ws.open();
  ws.hear({ t: 'wait', host: { name: 'Anna', mode: 'race' } });
  assert.equal(duel.declineInvite(), true);
  assert.deepEqual(ws.of('decline'), [{ t: 'decline', name: 'Anna' }]);
  timers.advance(500);
  assert.equal(ws.readyState, 3);
  assert.equal(ws.of('hello').length, 0);
});

test('the one who invited hears "Sorry, besig nou" and keeps waiting', async () => {
  const { duel } = setup();
  const declined = [];
  await duel.createRoom({ onDeclined: (n) => declined.push(n) });
  const ws = sockets.at(-1);
  ws.open();
  ws.hear({ t: 'wait' });
  ws.hear({ t: 'declined', name: 'Bennie' });
  assert.deepEqual(declined, ['Bennie']);
  assert.equal(ws.readyState, 1, 'still in the room');
});

// ------------------------------------------------------------------------------------ a pause for both
test('a friend match: a pause for both, either goes on; none with an older game or in a random room', async () => {
  const { duel, room, of } = await liveMatch();
  assert.equal(duel.canPauseBoth(), true);
  assert.equal(duel.pauseBoth(), true);
  assert.deepEqual(room.of('pause'), [{ t: 'pause' }]);
  room.hear({ t: 'paused', by: 0, ms: DUEL.pauseMs, left: DUEL.pauses - 1 });
  assert.deepEqual(of('duel:paused').at(-1), { mine: true, name: 'Bennie', ms: DUEL.pauseMs, left: DUEL.pauses - 1 });
  assert.equal(duel.pausedBoth, true);
  assert.equal(duel.canPauseBoth(), false, 'one at a time');
  assert.equal(duel.resumeBoth(), true);
  room.hear({ t: 'resumed', ms: DUEL.resumeMs });
  assert.deepEqual(of('duel:resumed').at(-1), { ms: DUEL.resumeMs });
  assert.equal(duel.pausedBoth, false);
  room.hear({ t: 'paused', by: 1, ms: DUEL.pauseMs, left: DUEL.pauses - 1 });
  assert.equal(of('duel:paused').at(-1).mine, false, 'the other player paused');
  {
    const r = await liveMatch({ start: { ...START, opp: { name: 'Bennie', v: 4 } } });
    assert.equal(r.duel.canPauseBoth(), false, 'their game is older');
  }
  {
    const r = await liveMatch({ start: { ...START, room: 'random' } });
    assert.equal(r.duel.canPauseBoth(), false, 'a random opponent');
  }
});

// ------------------------------------------------------------------------------------ "Speel weer"
test('"Speel weer" after a friend match: the same room, a new match once both said it', async () => {
  const { duel, timers, bus, room, starts, of } = await liveMatch();
  room.hear({ t: 'result', winner: 1, reason: 'goal', best: [31, 50] });
  timers.advance(3000);
  assert.equal(room.readyState, 1, 'the room stays open for "Speel weer"');
  assert.equal(duel.canAgain(), true);
  room.hear({ t: 'again' });
  assert.deepEqual(of('duel:again').at(-1), { state: 'they', name: 'Bennie' });
  assert.equal(duel.again(), true);
  assert.deepEqual(room.of('again'), [{ t: 'again' }]);
  const rematch = [];
  bus.on('duel:rematch', (m) => rematch.push(m));
  room.hear({ ...START, seed: 'feedbeef' });
  assert.equal(starts.length, 1, 'not through the old flow (it ended with the first match)');
  assert.equal(rematch.length, 1, 'the game shows the new match');
  assert.equal(rematch[0], duel.match);
  assert.equal(duel.match.seed, 'feedbeef');
  assert.equal(duel.match.ws, room, 'on the same connection');
});

test('"Speel weer": the other player went ("bye"), or a random match: no rematch in the room', async () => {
  {
    const { duel, room, of } = await liveMatch();
    room.hear({ t: 'result', winner: 0, reason: 'left', best: [12, 9] });
    room.hear({ t: 'bye' });
    assert.deepEqual(of('duel:again').at(-1), { state: 'gone', name: 'Bennie' });
    assert.equal(duel.canAgain(), false);
  }
  {
    const { duel, timers, room } = await liveMatch({ start: { ...START, room: 'random' } });
    room.hear({ t: 'result', winner: 0, reason: 'goal', best: [50, 9] });
    assert.equal(duel.canAgain(), false);
    timers.advance(2000);
    assert.equal(room.readyState, 3, 'a random match closes its room as before');
  }
});

// ------------------------------------------------------------------------------------ the review's findings (1.12.1)
test('a rematch on the connection the game came back on: the new match hears its room (and comes back too)', async () => {
  const { duel, bus, room } = await liveMatch();
  room.drop();
  const back = sockets.at(-1);
  back.open();
  back.hear({ t: 'rejoined', you: 0, opp: null });
  back.hear({ t: 'result', winner: 1, reason: 'goal', best: [20, 50] });
  const rematch = [];
  bus.on('duel:rematch', (m) => rematch.push(m));
  duel.again();
  back.hear({ ...START, seed: 'feedbeef' });
  assert.equal(rematch.length, 1);
  bus.emit('duel:ready');
  back.hear({ t: 'opp', h: 7, best: 7 });
  assert.equal(duel.match.oppBest, 7, 'the new match hears its room');
  back.hear({ t: 'result', winner: 0, reason: 'goal', best: [50, 7] });
  assert.equal(duel.match.outcome, 'won');
  // a drop in the next rematch's match also comes back
  const { duel: d2, bus: b2, room: r2 } = await liveMatch();
  r2.drop();
  const k2 = sockets.at(-1);
  k2.open();
  k2.hear({ t: 'rejoined', you: 0, opp: null });
  k2.hear({ t: 'result', winner: 1, reason: 'goal', best: [20, 50] });
  d2.again();
  k2.hear({ ...START, seed: 'feedbeef' });
  b2.emit('duel:ready');
  k2.drop();
  assert.match(sockets.at(-1).url, /\?rejoin=1$/, 'the rematch comes back to its room too');
});

test('our tower fell while the connection was gone: the results wait for the room\'s verdict', async () => {
  const { duel, timers, bus, room } = await liveMatch();
  room.drop();
  bus.emit('duel:over', { reason: 'lives', t: 9000 });
  let shown = null;
  duel.whenDecided(() => { shown = duel.summary().outcome; });
  timers.advance(4000);
  assert.equal(shown, null, 'not "doesn\'t count" while the game comes back');
  const back = sockets.at(-1);
  back.open();
  back.hear({ t: 'rejoined', you: 0, opp: null });
  assert.deepEqual(back.of('over').at(-1), { t: 'over', reason: 'lives', best: 0 }, 'how our tower ended, said again');
  back.hear({ t: 'result', winner: 1, reason: 'lives', best: [0, 12] });
  timers.advance(200);
  assert.equal(shown, 'lost');
});

test('a pause refused while both games are paused says nothing; a pause that ended while away ends here too', async () => {
  const { room, of } = await liveMatch();
  room.hear({ t: 'paused', by: 1, ms: DUEL.pauseMs, left: DUEL.pauses });
  room.hear({ t: 'nopause', left: DUEL.pauses - 1 });
  assert.equal(of('duel:nopause').length, 0, 'both tapped pause at once: no "no pauses left"');
  room.drop();
  const back = sockets.at(-1);
  back.open();
  back.hear({ t: 'rejoined', you: 0, opp: null });   // (no pause on now)
  assert.equal(of('duel:resumed').length, 1, 'the 3-2-1 back here too');
});

test('a friend\'s link reading the invite says "look" (it holds no seat until "Speel")', async () => {
  const { duel } = setup();
  duel.joinRoom('EEEE66', { invite: true });
  const ws = sockets.at(-1);
  ws.open();
  assert.deepEqual(ws.sent, [{ t: 'look' }]);
});
