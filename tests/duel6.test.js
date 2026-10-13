// Protocol 6 (1.13, the owner: coin matches with earned coins only) on the device (js/duel.js): the stake goes with
// the friend room's POST and the lobby's hello, the invite says it, and the match takes the stake the room's start
// says (only a live match against a person; a Worker older than 1.13 says none). A friend with too few coins can
// say so. Rejoin, pauses and "Speel weer" still need protocol 5 only (a 1.12.1 game plays them with a 1.13 one).
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
  const posts = [];
  const duel = createDuel({
    bus, apiUrl: 'https://borge.example', nickname: () => 'Anna', WebSocketImpl: FakeSocket,
    fetchImpl: async (url, init) => {
      posts.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      return { ok: true, json: async () => ({ code: 'DDDD55' }) };
    },
    setTimer: timers.setTimer, clearTimer: timers.clearTimer, now: timers.now,
  });
  return { duel, timers, bus, posts };
}

const START = { t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie', v: 6 }, sv: 6, room: 'friend' };

test('a friend room asks for its stake (only an allowed one); without one the POST is as before', async () => {
  const { duel, posts } = setup();
  await duel.createRoom({ stake: 50 });
  await duel.createRoom({ mode: 'turns', stake: 500 });
  await duel.createRoom({ stake: 30 });
  await duel.createRoom({});
  assert.deepEqual(posts.map((p) => p.body), [{ stake: 50 }, { mode: 'turns', stake: 500 }, {}, {}]);
  assert.equal(sockets.at(-1).url, 'wss://borge.example/match/room/DDDD55');
});

test('the lobby hears the stake looked for (protocol 6); the room it pairs us in hears none; a retry keeps it', async () => {
  const { duel } = setup();
  duel.findOpponent({ mode: 'turns', stake: 100 });
  const lobby = sockets.at(-1);
  lobby.open();
  const hi = lobby.of('hello')[0];
  assert.equal(hi.v, 7, '(1.15.3: protocol 7)');
  assert.equal(hi.stake, 100);
  assert.equal(hi.mode, 'turns');
  lobby.hear({ t: 'match', room: 'EEEE66' });
  const room = sockets.at(-1);
  room.open();
  assert.equal(room.of('hello')[0].stake, undefined, 'the room has its own stake');
  room.hear({ t: 'gone' });   // the pair didn't come: back to the lobby, for the same stake
  const again = sockets.at(-1);
  again.open();
  assert.match(again.url, /\/match\/lobby$/);
  assert.equal(again.of('hello')[0].stake, 100);
  // no stake: the hello as before
  const plain = setup();
  plain.duel.findOpponent({});
  sockets.at(-1).open();
  assert.equal('stake' in sockets.at(-1).of('hello')[0], false);
});

test('the invite says what each puts in (anything else: none)', () => {
  const { duel } = setup();
  const hosts = [];
  duel.joinRoom('FFFF77', { invite: true, onInvite: (h) => hosts.push(h) });
  const ws = sockets.at(-1);
  ws.open();
  assert.deepEqual(ws.sent, [{ t: 'look' }]);
  ws.hear({ t: 'wait', host: { name: 'Anna', mode: 'race', stake: 200 } });
  ws.hear({ t: 'wait', host: { name: 'Anna', mode: 'turns', stake: 7 } });
  ws.hear({ t: 'wait', host: { name: 'Anna' } });
  assert.deepEqual(hosts, [
    { name: 'Anna', mode: 'race', stake: 200 },
    { name: 'Anna', mode: 'turns', stake: 0 },
    { name: 'Anna', mode: 'race', stake: 0 },
  ]);
});

test('"Laat weet: te min munte" tells the one who invited why; they hear it', () => {
  const { duel } = setup();
  duel.joinRoom('FFFF77', { invite: true });
  const ws = sockets.at(-1);
  ws.open();
  ws.hear({ t: 'wait', host: { name: 'Anna', mode: 'race', stake: 500 } });
  assert.equal(duel.declineInvite({ coins: true }), true);
  assert.deepEqual(ws.of('decline'), [{ t: 'decline', name: 'Anna', coins: true }]);
  // the host's side
  const host = setup();
  const said = [];
  host.duel.joinRoom('GGGG88', { onDeclined: (name, why) => said.push([name, why]) });
  const hw = sockets.at(-1);
  hw.open();
  hw.hear({ t: 'declined', name: 'Bennie', coins: true });
  hw.hear({ t: 'declined', name: 'Carla' });
  hw.hear({ t: 'declined', name: 'Ouma', old: true });   // (her Stapel is too old for a coin match)
  assert.deepEqual(said, [['Bennie', { coins: true, old: false }], ['Carla', { coins: false, old: false }], ['Ouma', { coins: false, old: true }]]);
});

test('the match plays for the stake its room\'s start says; none from an older Worker, a bad one, or a robot', async () => {
  const { duel } = setup();
  const starts = [];
  await duel.createRoom({ stake: 50, onStart: (m) => starts.push(m) });
  sockets.at(-1).open();
  sockets.at(-1).hear({ ...START, stake: 50 });
  assert.equal(starts[0].stake, 50);
  await duel.createRoom({ stake: 50, onStart: (m) => starts.push(m) });
  sockets.at(-1).open();
  sockets.at(-1).hear({ ...START, sv: 5, opp: { name: 'Bennie', v: 5 } });   // a 1.12 Worker: no stake in its start
  assert.equal(starts[1].stake, 0);
  await duel.createRoom({ onStart: (m) => starts.push(m) });
  sockets.at(-1).open();
  sockets.at(-1).hear({ ...START, stake: 33 });
  assert.equal(starts[2].stake, 0);
  assert.equal(duel.startBot().stake, 0);
});

test('a 1.13 game with a 1.12.1 friend (or an older Worker) still gets "Speel weer", the pause for both and rejoin', async () => {
  for (const start of [{ ...START, opp: { name: 'Bennie', v: 5 } }, { ...START, sv: 5 }]) {
    const { duel, bus } = setup();
    await duel.createRoom({});
    const room = sockets.at(-1);
    room.open();
    room.hear(start);
    bus.emit('duel:ready');
    assert.equal(duel.canPauseBoth(), true);
    room.drop();
    assert.match(sockets.at(-1).url, /\?rejoin=1$/, 'back to its room');
  }
});

test('"Speel weer" in a coin match: the new start keeps the stake', async () => {
  const { duel, bus } = setup();
  const rematches = [];
  bus.on('duel:rematch', (m) => rematches.push(m));
  await duel.createRoom({ stake: 100 });
  const room = sockets.at(-1);
  room.open();
  room.hear({ ...START, stake: 100 });
  bus.emit('duel:ready');
  room.hear({ t: 'result', winner: 0, reason: 'goal' });
  assert.equal(duel.canAgain(), true);
  duel.again();
  room.hear({ ...START, seed: 'bcdefa23', stake: 100 });
  assert.equal(rematches.length, 1);
  assert.equal(rematches[0].stake, 100);
  assert.equal(rematches[0].room.code, 'DDDD55', 'the same room (its stake settles there)');
});

// ------------------------------------------------------------------------------------ the room's word on the stakes
/** A coin match (Wedloop unless `turns`), started and on screen; `heard` collects 'duel:stake' and 'duel:dropped'. */
async function coinMatch({ stake = 50, turns = false } = {}) {
  const env = setup();
  const heard = [];
  env.bus.on('duel:stake', (e) => heard.push(['stake', e.on]));
  env.bus.on('duel:dropped', () => heard.push(['dropped']));
  const ends = [];
  env.bus.on('duel:end', (e) => ends.push(e.outcome));
  await env.duel.createRoom({ stake });
  const room = sockets.at(-1);
  room.open();
  room.hear({ ...START, stake, ...(turns ? { mode: 'turns', turn: { n: 1, seat: 0, hearts: [3, 3], streaks: [0, 0], sab: null } } : {}) });
  env.bus.emit(turns ? 'turns:ready' : 'duel:ready');
  return { ...env, room, heard, ends, m: env.duel.match };
}

test('a coin match: the game says whether it holds its stake (once); the room\'s word comes as duel:stake', async () => {
  const { duel, room, heard, m } = await coinMatch();
  assert.equal(duel.answerStake(true), true);
  assert.equal(duel.answerStake(false), false, 'once');
  assert.deepEqual(room.of('stake'), [{ t: 'stake', ok: true }]);
  room.hear({ t: 'stake', on: true });
  room.hear({ t: 'stake', on: true });
  assert.equal(m.stakeOn, true);
  // later the room may still call it off (a coin match out of time with level towers): heard once
  room.hear({ t: 'stake', on: false });
  room.hear({ t: 'stake', on: false });
  assert.deepEqual(heard, [['stake', true], ['stake', false]]);
  // a match without a stake answers nothing
  const plain = setup();
  await plain.duel.createRoom({});
  sockets.at(-1).open();
  sockets.at(-1).hear(START);
  assert.equal(plain.duel.answerStake(true), false);
});

test('a coin match is settled by the room\'s result: quitting waits for it (it may name us the winner)', async () => {
  const { duel, bus, room, timers } = await coinMatch();
  duel.answerStake(true);
  bus.emit('duel:self', { t: 3000, h: 50.2, best: 50.2, lives: 3 });
  bus.emit('duel:over', { reason: 'quit', t: 3100 });
  timers.advance(1000);
  assert.equal(duel.match.outcome, null, 'no local verdict');
  room.hear({ t: 'result', winner: 0, reason: 'goal', best: [50.2, 12] });
  assert.equal(duel.match.outcome, 'won');
  // no word from the room at all: a loss, after STAKE_RESULT_WAIT_MS
  const quiet = await coinMatch();
  quiet.bus.emit('duel:over', { reason: 'quit', t: 3100 });
  quiet.timers.advance(9000);
  assert.equal(quiet.duel.match.outcome, null);
  quiet.timers.advance(2000);
  assert.equal(quiet.duel.match.outcome, 'lost');
  // without a stake quitting is a loss at once, as before
  const plain = setup();
  await plain.duel.createRoom({});
  sockets.at(-1).open();
  sockets.at(-1).hear(START);
  plain.bus.emit('duel:ready');
  plain.bus.emit('duel:over', { reason: 'quit', t: 3100 });
  assert.equal(plain.duel.match.outcome, 'lost');
});

test('after coming back to the room the verdict gets a full wait (it is on its way once the room hears our tower)', async () => {
  const { duel, bus, room, timers } = await coinMatch();
  duel.answerStake(true);
  room.drop();
  const back = sockets.at(-1);
  bus.emit('duel:self', { t: 3000, h: 51, best: 51, lives: 3 });
  bus.emit('duel:over', { reason: 'hearts', t: 3100 });
  timers.advance(5000);
  back.open();
  assert.deepEqual(back.of('hello')[0].rejoin, true);
  back.hear({ t: 'rejoined', you: 0, stake: null, opp: null });
  assert.deepEqual(back.of('stake'), [{ t: 'stake', ok: true }], 'our answer again: the room had none yet');
  assert.equal(back.of('state').at(-1).best, 51, 'the room hears where our tower got to');
  timers.advance(9000);
  assert.equal(duel.match.outcome, null, 'still waiting for the room');
  back.hear({ t: 'result', winner: 0, reason: 'goal', best: [51, 30] });
  assert.equal(duel.match.outcome, 'won');
});

test('rejoined says the room\'s word so far; a connection that doesn\'t come back is heard as duel:dropped (also after the tower ended)', async () => {
  const { duel, bus, room, timers, heard } = await coinMatch({ turns: true });
  duel.answerStake(true);
  room.drop();
  const back = sockets.at(-1);
  back.open();
  back.hear({ t: 'rejoined', you: 0, stake: true });
  assert.equal(duel.match.stakeOn, true);
  assert.equal(back.of('stake').length, 0, 'decided already: nothing to say again');
  // the tower ends (quit), then the connection goes for good
  bus.emit('duel:over', { reason: 'quit', t: 4000 });
  back.drop();
  timers.advance(DUEL.rejoinMs + 2000);
  assert.deepEqual(heard.at(-1), ['dropped']);
  assert.equal(duel.match.lostConn, true);
});

test('leaving a live match before its result tells the room it quits (the other player wins at once)', async () => {
  const race = await coinMatch();
  race.bus.emit('duel:self', { t: 3000, h: 12.4, best: 12.4, lives: 3 });
  const ws = race.room;
  race.duel.leave();
  assert.deepEqual(ws.of('over'), [{ t: 'over', reason: 'quit', best: 12.4 }]);
  assert.equal(ws.readyState, 3, 'then the connection closes');
  const turns = await coinMatch({ turns: true });
  turns.duel.leave();
  assert.deepEqual(turns.room.of('over'), [{ t: 'over', reason: 'quit' }]);
  // decided already (or the tower already said it ended): nothing more is said
  const done = await coinMatch();
  done.room.hear({ t: 'result', winner: 0, reason: 'goal', best: [50, 20] });
  done.duel.leave();
  assert.equal(done.room.of('over').length, 0);
});
