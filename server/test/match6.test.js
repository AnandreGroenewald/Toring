// Protocol 6 (1.13, the owner: coin matches with earned coins only): a room can be played for a stake. A friend room
// takes one (POST /match/room { stake }), says it with the invite, and gives it to both games at the start (they
// hold it; the winner the room names takes both); a game older than 1.13 can't join a staked room; "Speel weer"
// plays for the same stake; the lobby pairs only players looking for the same stake (an older game never asks for
// one). Rooms without a stake play exactly as before.

import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom, MatchLobby } from '../src/match.js';
import { createWorker } from '../src/worker.js';
import { DUEL } from '../../js/config.js';
import { T0, ORIGIN } from './support/harness.js';

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

async function friendRoom(stake, mode = 'race') {
  const clk = clock();
  const room = new MatchRoom(fakeState(), {}, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', mode, seed: 'seedabc123', stake });
  return { room, clk };
}

test('a staked friend room says its stake with the invite and gives it to both games at the start', async () => {
  const { room } = await friendRoom(50);
  const host = fakeSocket();
  await room.join(host);
  await say(room, host, { t: 'hello', name: 'Anna', v: 6, key: 'annakey12345' });
  const friend = fakeSocket();
  await room.join(friend);
  assert.deepEqual(friend.last('wait'), { t: 'wait', host: { name: 'Anna', mode: 'race', stake: 50 } });
  await say(room, friend, { t: 'hello', name: 'Bennie', v: 6, key: 'bennie123456' });
  for (const ws of [host, friend]) {
    const s = ws.last('start');
    assert.equal(s.stake, 50);
    assert.equal(s.sv, 6, 'the room says it knows stakes');
  }
});

test('a game older than 1.13 cannot join a staked room (it would play without holding the stake)', async () => {
  const { room } = await friendRoom(100, 'turns');
  const host = fakeSocket();
  await room.join(host);
  await say(room, host, { t: 'hello', name: 'Anna', v: 6, key: 'annakey12345' });
  const old = fakeSocket();
  await room.join(old);
  await say(room, old, { t: 'hello', name: 'Bennie', v: 5, key: 'bennie123456' });
  assert.deepEqual(old.last('gone'), { t: 'gone' });
  assert.equal(old.closed, true);
  assert.equal(host.of('start').length, 0, 'nothing started');
});

test('only the allowed stakes count; a room without one plays as before (protocol 5 games too)', async () => {
  const { room } = await friendRoom(30);
  const a = fakeSocket();
  const b = fakeSocket();
  await room.join(a);
  await say(room, a, { t: 'hello', name: 'Anna', v: 5, key: 'annakey12345' });
  await room.join(b);
  assert.deepEqual(b.last('wait'), { t: 'wait', host: { name: 'Anna', mode: 'race' } }, '30 is not a stake: none');
  await say(room, b, { t: 'hello', name: 'Bennie', v: 6, key: 'bennie123456' });
  assert.equal(a.last('start').stake, undefined);
  assert.equal(a.last('start').sv, 5, 'a protocol 5 game hears its own protocol');
  assert.equal(b.last('start').sv, 6);
  assert.equal(b.last('start').stake, undefined);
});

test('"Speel weer" in a staked friend room plays for the same stake', async () => {
  const { room, clk } = await friendRoom(200);
  const a = fakeSocket();
  const b = fakeSocket();
  await room.join(a);
  await say(room, a, { t: 'hello', name: 'Anna', v: 6, key: 'annakey12345' });
  await room.join(b);
  await say(room, b, { t: 'hello', name: 'Bennie', v: 6, key: 'bennie123456' });
  assert.equal(a.of('start').length, 1);
  clk.tick(DUEL.countdownMs + 1000);
  await room.restart(clk.now());
  assert.equal(a.of('start').length, 2);
  assert.equal(a.last('start').stake, 200);
  assert.equal(b.last('start').stake, 200);
});

function lobbyWith() {
  const inits = [];
  const env = {
    MATCH_ROOM: {
      idFromName: (n) => n,
      get: (code) => ({
        fetch: async (url, init) => {
          inits.push({ code, body: JSON.parse(init.body) });
          return new Response('{}', { status: 200 });
        },
      }),
    },
  };
  const clk = clock();
  let n = 0;
  const lobby = new MatchLobby(fakeState(), env, { now: clk.now, upgrade, roomCode: () => ['ABCDEF', 'GHJKMN', 'PQRSTU'][n++ % 3] });
  const open = async () => (await lobby.fetch(new Request('https://x/match/lobby', { headers: { Upgrade: 'websocket' } }))).ws;
  return { lobby, inits, open };
}

test('the lobby pairs only players looking for the same stake; an older game is never paired for one', async () => {
  const { lobby, inits, open } = lobbyWith();
  const hi = (ws, o) => lobby.onMessage(ws, JSON.stringify({ t: 'hello', rules: DUEL.rules, ...o }));
  const a50 = await open();
  const b0 = await open();
  await hi(a50, { name: 'Anna', v: 6, stake: 50 });
  await hi(b0, { name: 'Bennie', v: 6 });
  assert.equal(a50.of('match').length + b0.of('match').length, 0, '50 and none do not meet');
  const old50 = await open();
  await hi(old50, { name: 'Ouma', v: 5, stake: 50 });   // a 1.12 game can't ask for a stake: it plays for none
  assert.deepEqual(old50.last('match'), b0.last('match'), 'the old game meets the one looking for no stake');
  assert.equal(inits.at(-1).body.stake, 0);
  const c50 = await open();
  await hi(c50, { name: 'Carla', v: 6, stake: 50 });
  assert.deepEqual(c50.last('match'), a50.last('match'));
  assert.equal(inits.at(-1).body.stake, 50, 'their room is a 50 room');
});

test('POST /match/room takes a stake for the friend room (anything else: none)', async () => {
  const worker = createWorker({ now: () => T0, log: () => {} });
  const forwarded = [];
  const env = {
    ALLOWED_ORIGINS: ORIGIN,
    MATCH_LOBBY: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response('{}') }) },
    MATCH_ROOM: {
      idFromName: (n) => n,
      get: () => ({
        fetch: async (url, init) => {
          forwarded.push(JSON.parse(init.body));
          return new Response('{}', { status: 200 });
        },
      }),
    },
  };
  const post = (body, ip) => worker.fetch(new Request('https://w/match/room', {
    method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body,
  }), env);
  assert.equal((await post(JSON.stringify({ mode: 'turns', stake: 100 }), '2.2.2.1')).status, 200);
  assert.equal((await post(JSON.stringify({ stake: 'lots' }), '2.2.2.2')).status, 200);
  assert.deepEqual(forwarded.map((b) => [b.mode, b.stake]), [['turns', 100], ['race', 0]]);
  // (the room itself keeps only an allowed stake: see "only the allowed stakes count")
});

test('a friend with too few coins for a coin match says so (live, or when the host is back); elsewhere it is a plain no', async () => {
  const { room } = await friendRoom(500);
  const host = fakeSocket();
  await room.join(host);
  await say(room, host, { t: 'hello', name: 'Anna', v: 6, key: 'annakey12345' });
  const friend = fakeSocket();
  await room.join(friend);
  await say(room, friend, { t: 'look' });
  await say(room, friend, { t: 'decline', name: 'Bennie', coins: true });
  assert.deepEqual(host.last('declined'), { t: 'declined', name: 'Bennie', coins: true });
  assert.equal(host.closed, false, 'the host still waits (the link may have gone to a group)');
  // the host's game is away (sharing the link): it hears the reason when it is back
  host.closed = true;
  await room.onClose(host);
  const carla = fakeSocket();
  await room.join(carla);
  await say(room, carla, { t: 'decline', name: 'Carla', coins: true });
  const ouma = fakeSocket();
  await room.join(ouma);
  await say(room, ouma, { t: 'decline', name: 'Ouma' });
  const back = fakeSocket();
  await room.join(back);
  await say(room, back, { t: 'hello', name: 'Anna', v: 6, key: 'annakey12345' });
  assert.deepEqual(back.of('declined'), [{ t: 'declined', name: 'Carla', coins: true }, { t: 'declined', name: 'Ouma' }]);
  // a room without a stake: "too few coins" means nothing there
  const plain = await friendRoom(0);
  const h2 = fakeSocket();
  await plain.room.join(h2);
  await say(plain.room, h2, { t: 'hello', name: 'Anna', v: 6, key: 'annakey12345' });
  const f2 = fakeSocket();
  await plain.room.join(f2);
  await say(plain.room, f2, { t: 'decline', name: 'Bennie', coins: true });
  assert.deepEqual(h2.last('declined'), { t: 'declined', name: 'Bennie' });
});

// ------------------------------------------------------------------------------------ both hold it, or nobody does
const KEYS = ['annakey12345', 'bennie123456'];

/** A started coin match (both games 1.13), 3-2-1 over. */
async function coinMatch(stake = 50, mode = 'race') {
  const { room, clk } = await friendRoom(stake, mode);
  const a = fakeSocket();
  const b = fakeSocket();
  await room.join(a);
  await say(room, a, { t: 'hello', name: 'Anna', v: 6, key: KEYS[0] });
  await room.join(b);
  await say(room, b, { t: 'hello', name: 'Bennie', v: 6, key: KEYS[1] });
  clk.tick(DUEL.countdownMs);
  return { room, clk, a, b };
}

test('a coin match counts once both games hold the stake; one that can\'t makes it a match without coins for both', async () => {
  const on = await coinMatch(50);
  await say(on.room, on.a, { t: 'stake', ok: true });
  assert.equal(on.b.of('stake').length, 0, 'nothing yet: one answer');
  await say(on.room, on.b, { t: 'stake', ok: true });
  assert.deepEqual(on.a.of('stake'), [{ t: 'stake', on: true }]);
  assert.deepEqual(on.b.of('stake'), [{ t: 'stake', on: true }]);
  await say(on.room, on.a, { t: 'stake', ok: false });   // (too late to change: once only)
  assert.equal(on.a.of('stake').length, 1);
  // Bennie's game can't hold it (another window of the same player has a coin match on): none for either
  const off = await coinMatch(200);
  await say(off.room, off.b, { t: 'stake', ok: false });
  assert.deepEqual(off.a.of('stake'), [{ t: 'stake', on: false }], 'at once, without waiting for Anna');
  assert.deepEqual(off.b.of('stake'), [{ t: 'stake', on: false }]);
  await say(off.room, off.a, { t: 'stake', ok: true });
  assert.equal(off.a.of('stake').length, 1);
});

test('a coin match decided before both said they hold it plays for none (they hear it before the result)', async () => {
  const { room, a, b } = await coinMatch(100);
  await say(room, a, { t: 'stake', ok: true });
  await say(room, b, { t: 'over', reason: 'quit', best: 0 });
  const order = a.sent.map((m) => m.t).filter((t) => t === 'stake' || t === 'result');
  assert.deepEqual(order, ['stake', 'result']);
  assert.deepEqual(a.last('stake'), { t: 'stake', on: false });
  assert.equal(a.last('result').winner, 0);
});

test('back on a new connection: the coin match\'s verdict so far comes with "rejoined"', async () => {
  const { room, a, b, clk } = await coinMatch(20);
  await say(room, a, { t: 'stake', ok: true });
  a.closed = true;
  await room.onClose(a);
  clk.tick(2000);
  const back1 = fakeSocket();
  await room.join(back1, { rejoin: true });
  await say(room, back1, { t: 'hello', v: 6, key: KEYS[0], rejoin: true, name: 'x' });
  assert.equal(back1.last('rejoined').stake, null, 'not decided yet: the game says its answer again');
  await say(room, b, { t: 'stake', ok: true });
  assert.deepEqual(back1.last('stake'), { t: 'stake', on: true });
  back1.closed = true;
  await room.onClose(back1);
  const back2 = fakeSocket();
  await room.join(back2, { rejoin: true });
  await say(room, back2, { t: 'hello', v: 6, key: KEYS[0], rejoin: true, name: 'x' });
  assert.equal(back2.last('rejoined').stake, true);
  // a room without a stake says nothing about it
  const plain = await coinMatch(0);
  plain.a.closed = true;
  await plain.room.onClose(plain.a);
  const back3 = fakeSocket();
  await plain.room.join(back3, { rejoin: true });
  await say(plain.room, back3, { t: 'hello', v: 6, key: KEYS[0], rejoin: true, name: 'x' });
  assert.equal('stake' in back3.last('rejoined'), false);
});

test('a coin match at its longest: the higher tower wins; level towers get their coins back', async () => {
  const win = await coinMatch(50);
  await say(win.room, win.a, { t: 'stake', ok: true });
  await say(win.room, win.b, { t: 'stake', ok: true });
  win.clk.tick(60000);
  await say(win.room, win.a, { t: 'state', h: 21, best: 21 });
  await say(win.room, win.b, { t: 'state', h: 14, best: 14 });
  win.clk.tick(DUEL.maxRunMs + DUEL.countdownMs);
  await win.room.alarm();
  assert.deepEqual(win.b.last('result'), { t: 'result', winner: 0, reason: 'time', best: [21, 14] });
  assert.equal(win.b.of('stake').at(-1).on, true, 'the stake stands: Anna gets both');
  const level = await coinMatch(50);
  await say(level.room, level.a, { t: 'stake', ok: true });
  await say(level.room, level.b, { t: 'stake', ok: true });
  level.clk.tick(60000);
  await say(level.room, level.a, { t: 'state', h: 9, best: 9 });
  await say(level.room, level.b, { t: 'state', h: 9, best: 9 });
  level.clk.tick(DUEL.maxRunMs + DUEL.countdownMs);
  await level.room.alarm();
  assert.equal(level.a.of('result').length, 0);
  assert.deepEqual(level.a.last('stake'), { t: 'stake', on: false }, 'both get their coins back');
  assert.deepEqual(level.b.last('stake'), { t: 'stake', on: false });
  assert.equal(level.a.closed, true);
  // a Wedloop without a stake closes at its longest as before (no result)
  const plain = await coinMatch(0);
  plain.clk.tick(DUEL.maxRunMs + DUEL.countdownMs + 60000);
  await plain.room.alarm();
  assert.equal(plain.a.of('result').length + plain.a.of('stake').length, 0);
  assert.equal(plain.a.closed, true);
});

test('"Speel weer" in a coin room asks both games again', async () => {
  const { room, a, b, clk } = await coinMatch(20);
  await say(room, a, { t: 'stake', ok: true });
  await say(room, b, { t: 'stake', ok: true });
  await say(room, b, { t: 'over', reason: 'quit', best: 0 });
  clk.tick(1000);
  await say(room, a, { t: 'again' });
  await say(room, b, { t: 'again' });
  assert.equal(a.of('start').length, 2);
  await say(room, a, { t: 'stake', ok: true });
  assert.equal(a.of('stake').length, 1, 'the new match waits for both again');
  await say(room, b, { t: 'stake', ok: true });
  assert.deepEqual(a.of('stake').at(-1), { t: 'stake', on: true });
});

test('a friend whose Stapel is too old for coin matches: the one who invited hears why (also when back)', async () => {
  const { room } = await friendRoom(50);
  const host = fakeSocket();
  await room.join(host);
  await say(room, host, { t: 'hello', name: 'Anna', v: 6, key: KEYS[0] });
  const old = fakeSocket();
  await room.join(old);
  await say(room, old, { t: 'hello', name: 'Ouma', v: 5, key: 'oumakey12345' });
  assert.deepEqual(old.last('gone'), { t: 'gone' });
  assert.deepEqual(host.last('declined'), { t: 'declined', name: 'Ouma', old: true });
  host.closed = true;
  await room.onClose(host);
  const old2 = fakeSocket();
  await room.join(old2);
  await say(room, old2, { t: 'hello', name: 'Oupa', v: 4, key: 'oupakey12345' });
  const back = fakeSocket();
  await room.join(back);
  await say(room, back, { t: 'hello', name: 'Anna', v: 6, key: KEYS[0] });
  assert.deepEqual(back.of('declined'), [{ t: 'declined', name: 'Oupa', old: true }]);
});
