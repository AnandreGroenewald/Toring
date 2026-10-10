// Uitdagersreeks live matches: the room (relay, height marks, results, leaving, limits, sleeping),
// the lobby (pairing, recordings) and the /match routes. Fake Durable Object state and sockets.

import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom, MatchLobby } from '../src/match.js';
import { createWorker } from '../src/worker.js';
import { decodeChallenge, encodeChallenge, isRoomCode } from '../../js/core/duel.js';
import { DUEL } from '../../js/config.js';
import { cleanCard } from '../../js/core/economy.js';
import { ORIGIN, T0, ADMIN, createHarness } from './support/harness.js';

// ---------------------------------------------------------------- fakes
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
      async delete(k) {
        return store.delete(k);
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

/** A room with two players who said hello (games of protocol `v`, 1 when left out); returns { room, a, b, clk, state }. */
async function startedRoom({ env = {}, names = ['Anna', 'Bennie'], v = [undefined, undefined] } = {}) {
  const clk = clock();
  const state = fakeState();
  const room = new MatchRoom(state, env, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', seed: 'seedabc123' });
  const a = fakeSocket();
  const b = fakeSocket();
  await room.join(a);
  await room.join(b);
  await room.onMessage(a, JSON.stringify({ t: 'hello', name: names[0], v: v[0] }));
  await room.onMessage(b, JSON.stringify({ t: 'hello', name: names[1], v: v[1] }));
  clk.tick(DUEL.countdownMs);
  return { room, a, b, clk, state };
}

const say = (room, ws, o) => room.onMessage(ws, JSON.stringify(o));

// ---------------------------------------------------------------- room
test('room: init once, two players, hello -> both start with the same seed and each other\'s name and card', async () => {
  const clk = clock();
  const state = fakeState();
  const room = new MatchRoom(state, {}, { now: clk.now, upgrade });
  const r1 = await room.init({ kind: 'friend', seed: 'seedabc123' });
  assert.equal(r1.status, 200);
  assert.equal((await room.init({})).status, 409, 'a room is made once');
  assert.equal(state.alarm, T0 + DUEL.roomWaitMs, 'a friend room waits 10 minutes');
  const a = fakeSocket();
  const b = fakeSocket();
  await room.join(a);
  assert.deepEqual(a.sent, [{ t: 'wait' }]);
  await room.join(b);
  // a card goes through as known looks only (an older game sends none: the default card)
  await say(room, a, { t: 'hello', name: 'Anna', card: { frame: 'goud', badge: 'leeu', title: '<b>baas</b>', celebration: 'braai', style: 'kroon', rank: 'goud', extra: 'x' } });
  assert.equal(a.of('start').length, 0, 'not before both said hello');
  await say(room, b, { t: 'hello', name: 'kak' });   // refused by the name rules -> the default
  // (1.12: opp.v, the other game's protocol; a hello without one is protocol 1)
  assert.deepEqual(a.last('start'), { t: 'start', seed: 'seedabc123', you: 0, opp: { name: 'Bouer', card: cleanCard(null), v: 1 } });
  assert.deepEqual(b.last('start'), {
    t: 'start', seed: 'seedabc123', you: 1,
    opp: { name: 'Anna', card: { frame: 'goud', badge: 'leeu', title: 'bouer', celebration: 'braai', style: 'kroon', rank: 'goud', rl: 'goud-1', rk: { race: 'goud-1', turns: 'goud-1' } }, v: 1 },
  });
  // a third player, or anyone after the start, is turned away
  const c = fakeSocket();
  await room.join(c);
  assert.deepEqual(c.sent, [{ t: 'gone' }]);
  assert.equal(c.closed, true);
});

test('room: a player back on a new connection replaces the old one (the same key); no match against it', async () => {
  const clk = clock();
  const room = new MatchRoom(fakeState(), {}, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', seed: 'seedabc123' });
  const old = fakeSocket();
  await room.join(old);
  await say(room, old, { t: 'hello', name: 'Anna', key: 'annakey12345' });
  // the phone's network changed: it closed the connection, the server never heard
  const back = fakeSocket();
  await room.join(back);
  await say(room, back, { t: 'hello', name: 'Anna', key: 'annakey12345' });
  assert.equal(old.closed, true, 'the old connection goes');
  assert.equal(back.of('start').length, 0, 'no match against herself');
  const friend = fakeSocket();
  await room.join(friend);
  // (1.12.1: a friend room says who invites, so the friend's game can ask "Speel" or "Sorry, besig nou")
  assert.deepEqual(friend.sent, [{ t: 'wait', host: { name: 'Anna', mode: 'race' } }]);
  await say(room, friend, { t: 'hello', name: 'Bennie', key: 'bennie123456' });
  assert.equal(back.last('start').opp.name, 'Bennie');
  assert.equal(friend.last('start').opp.name, 'Anna');
  assert.equal(old.of('start').length, 0);
  // the old connection's close (when it comes) doesn't count as leaving the match
  await room.onClose(old);
  assert.equal(back.of('result').length, 0);
});

test('room: both seats taken (an old connection and the friend): the one who comes back gets their seat; a stranger does not', async () => {
  const clk = clock();
  const room = new MatchRoom(fakeState(), {}, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', seed: 'seedabc123' });
  const old = fakeSocket();
  await room.join(old);
  await say(room, old, { t: 'hello', name: 'Anna', key: 'annakey12345' });
  const friend = fakeSocket();
  await room.join(friend);   // seat 1, hello still on its way
  const stranger = fakeSocket();
  await room.join(stranger);
  await say(room, stranger, { t: 'hello', name: 'Carla', key: 'carlakey1234' });
  assert.deepEqual(stranger.last('gone'), { t: 'gone' });
  assert.equal(stranger.closed, true);
  assert.equal(old.closed, false, 'a stranger never takes anyone\'s seat');
  const back = fakeSocket();
  await room.join(back);
  await say(room, back, { t: 'hello', name: 'Anna', key: 'annakey12345' });
  assert.equal(old.closed, true);
  await say(room, friend, { t: 'hello', name: 'Bennie', key: 'bennie123456' });
  assert.equal(back.last('start').you, 0, 'her own seat');
  assert.equal(friend.last('start').opp.name, 'Anna');
});

test('room: an unknown code is "gone"', async () => {
  const room = new MatchRoom(fakeState(), {}, { now: clock().now, upgrade });
  const a = fakeSocket();
  await room.join(a);
  assert.deepEqual(a.sent, [{ t: 'gone' }]);
  assert.equal(a.closed, true);
});

test('room: heights are relayed; with older games (protocol 1) the first to a mark sends its default visitor at once', async () => {
  const { room, a, b, clk } = await startedRoom();
  clk.tick(5000);
  await say(room, a, { t: 'state', h: 6, best: 6 });
  assert.deepEqual(b.last('opp'), { t: 'opp', h: 6, best: 6 });
  await say(room, a, { t: 'state', h: 10.4, best: 10.4 });
  assert.deepEqual(b.last('attack'), { t: 'attack', m: 10, kind: 'monkey' });
  assert.deepEqual(a.last('sent'), { t: 'sent', m: 10, kind: 'monkey' });
  clk.tick(4000);
  await say(room, b, { t: 'state', h: 12, best: 12 });
  assert.equal(a.of('attack').length, 0, 'the 10 m mark was already taken');
  clk.tick(4000);
  await say(room, b, { t: 'state', h: 21, best: 21 });
  assert.deepEqual(a.last('attack'), { t: 'attack', m: 20, kind: 'thief' });
});

test('room: the first to a mark chooses the punishment (protocol 2); it goes once, and only theirs', async () => {
  const { room, a, b, clk } = await startedRoom({ v: [2, 2] });
  clk.tick(6000);
  await say(room, a, { t: 'state', h: 10.4, best: 10.4 });
  assert.deepEqual(a.last('choose'), { t: 'choose', m: 10, def: 'monkey' });
  assert.equal(b.of('attack').length, 0, 'nothing goes before Anna chooses');
  assert.equal(a.of('sent').length, 0);
  await say(room, b, { t: 'punish', m: 10, kind: 'fog' });   // not Bennie's to choose
  await say(room, a, { t: 'punish', m: 20, kind: 'fog' });   // no such choice
  await say(room, a, { t: 'punish', m: 10, kind: 'bomb' });  // no such punishment
  assert.equal(b.of('attack').length, 0);
  await say(room, a, { t: 'punish', m: 10, kind: 'fog' });
  assert.deepEqual(b.last('attack'), { t: 'attack', m: 10, kind: 'fog' });
  assert.deepEqual(a.last('sent'), { t: 'sent', m: 10, kind: 'fog' });
  await say(room, a, { t: 'punish', m: 10, kind: 'heat' });  // once only
  assert.equal(b.of('attack').length, 1);
  // Bennie takes 20 m and sends the heat wave
  clk.tick(8000);
  await say(room, b, { t: 'state', h: 20.5, best: 20.5 });
  assert.deepEqual(b.last('choose'), { t: 'choose', m: 20, def: 'thief' });
  await say(room, b, { t: 'punish', m: 20, kind: 'heat' });
  assert.deepEqual(a.last('attack'), { t: 'attack', m: 20, kind: 'heat' });
});

test('room: a choice not made in time gets the mark\'s default (also after hibernation)', async () => {
  const { room, a, b, clk, state } = await startedRoom({ v: [2, 2] });
  clk.tick(6000);
  await say(room, a, { t: 'state', h: 10.4, best: 10.4 });
  assert.equal(a.of('choose').length, 1);
  clk.tick(DUEL.chooseMs);
  await say(room, b, { t: 'state', h: 4, best: 4 });
  assert.equal(b.of('attack').length, 0, 'the server waits a little longer than the game');
  // the room sleeps; the next message wakes a fresh object from storage
  const again = new MatchRoom(state, {}, { now: clk.now, upgrade });
  clk.tick(1600);
  await say(again, b, { t: 'state', h: 4.2, best: 4.2 });
  assert.deepEqual(b.last('attack'), { t: 'attack', m: 10, kind: 'monkey' });
  assert.deepEqual(a.last('sent'), { t: 'sent', m: 10, kind: 'monkey' });
  await say(again, a, { t: 'punish', m: 10, kind: 'fog' });   // too late
  assert.equal(b.of('attack').length, 1);
  assert.equal(a.of('sent').length, 1);
  assert.ok(room, 'the first object is simply gone');
});

test('room: an older game gets only the default punishment, and the chooser hears what went', async () => {
  const { room, a, b, clk } = await startedRoom({ v: [2, 1] });
  clk.tick(6000);
  await say(room, a, { t: 'state', h: 10.4, best: 10.4 });
  await say(room, a, { t: 'punish', m: 10, kind: 'heat' });
  assert.deepEqual(b.last('attack'), { t: 'attack', m: 10, kind: 'monkey' }, '1.7.5 can only show the default');
  assert.deepEqual(a.last('sent'), { t: 'sent', m: 10, kind: 'monkey' });
  clk.tick(6000);
  await say(room, a, { t: 'state', h: 20.4, best: 20.4 });
  await say(room, a, { t: 'punish', m: 20, kind: 'thief' });   // the default itself goes as chosen
  assert.deepEqual(b.last('attack'), { t: 'attack', m: 20, kind: 'thief' });
  // the older game reaches a mark first: it never asks, so the default goes at once
  clk.tick(30000);
  await say(room, b, { t: 'state', h: 30.4, best: 30.4 });
  assert.equal(b.of('choose').length, 0);
  assert.deepEqual(a.last('attack'), { t: 'attack', m: 30, kind: 'monkey' });
  assert.deepEqual(b.last('sent'), { t: 'sent', m: 30, kind: 'monkey' });
});

test('room: when the match ends, open choices are dropped', async () => {
  const { room, a, b, clk } = await startedRoom({ v: [2, 2] });
  clk.tick(6000);
  await say(room, a, { t: 'state', h: 10.4, best: 10.4 });
  await say(room, b, { t: 'over', reason: 'lives', best: 3 });
  assert.equal(a.last('result').winner, 0);
  await say(room, a, { t: 'punish', m: 10, kind: 'fog' });
  clk.tick(10000);
  await say(room, a, { t: 'state', h: 12, best: 12 });
  assert.equal(b.of('attack').length, 0);
});

test('room: the first to 50 m wins; after the result nothing changes', async () => {
  const { room, a, b, clk } = await startedRoom();
  clk.tick(40000);
  await say(room, b, { t: 'state', h: 50.2, best: 50.2 });
  const r = { t: 'result', winner: 1, reason: 'goal', best: [0, 50.2] };
  assert.deepEqual(a.last('result'), r);
  assert.deepEqual(b.last('result'), r);
  assert.equal(a.of('opp').length, 1, 'Bennie\'s last height reached Anna with the result');
  await say(room, a, { t: 'state', h: 55, best: 55 });
  assert.equal(a.of('result').length, 1);
  assert.equal(b.of('opp').length, 0, 'nothing is relayed after the result');
});

test('room: a tower that falls loses at once (hearts, flood or quitting)', async () => {
  const { room, a, b, clk } = await startedRoom();
  clk.tick(30000);
  await say(room, a, { t: 'state', h: 20, best: 20 });
  await say(room, a, { t: 'over', reason: 'flood', best: 20 });
  assert.equal(b.last('result').winner, 1);
  assert.equal(b.last('result').reason, 'flood');
  assert.equal(a.last('result').winner, 1);
});

test('room: leaving a running match hands the other player the win', async () => {
  const { room, a, b } = await startedRoom();
  a.closed = true;
  await room.onClose(a);
  assert.deepEqual(b.last('result'), { t: 'result', winner: 1, reason: 'left', best: [0, 0] });
});

test('room: impossible heights are cut back (no faster than 2 m/s, plus a little slack)', async () => {
  const { room, a, b, clk } = await startedRoom();
  clk.tick(10000);
  await say(room, a, { t: 'state', h: 900, best: 900 });
  assert.equal(a.of('result').length, 0, 'no goal from a made-up number');
  assert.equal(b.last('opp').best, DUEL.maxClimbMps * 10 + 5);
});

test('room: junk, unknown and too many messages are ignored', async () => {
  const { room, a, b, clk } = await startedRoom();
  clk.tick(5000);
  for (const junk of ['nope', '[1,2]', 'null', JSON.stringify({ t: 'state', h: 'x', best: 2 }), JSON.stringify({ t: 'boom' }), `{"t":"state","h":1,"best":1,"pad":"${'x'.repeat(600)}"}`]) {
    await room.onMessage(a, junk);
  }
  assert.equal(b.of('opp').length, 0);
  clk.tick(1000);
  for (let k = 0; k < 15; k++) await say(room, a, { t: 'state', h: 1 + k * 0.1, best: 1 + k * 0.1 });
  assert.equal(b.of('opp').length, 10, 'ten messages a second per player');
});

test('room: a sleeping room wakes up where it was (seats, hello, marks, result)', async () => {
  const clk = clock();
  const state = fakeState();
  let room = new MatchRoom(state, {}, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', seed: 'seedabc123' });
  const a = fakeSocket();
  await room.join(a);
  await say(room, a, { t: 'hello', name: 'Anna', card: { style: 'pet' } });
  // ... minutes later, after hibernation, the friend comes
  room = new MatchRoom(state, {}, { now: clk.now, upgrade });
  const b = fakeSocket();
  await room.join(b);
  await say(room, b, { t: 'hello', name: 'Bennie' });
  assert.equal(a.last('start').opp.name, 'Bennie', 'the host\'s hello survived the sleep');
  assert.equal(b.last('start').opp.card.style, 'pet', 'and so did the host\'s card');
  clk.tick(DUEL.countdownMs + 8000);
  await say(room, a, { t: 'state', h: 11, best: 11 });
  room = new MatchRoom(state, {}, { now: clk.now, upgrade });
  clk.tick(4000);
  await say(room, b, { t: 'state', h: 12, best: 12 });
  assert.equal(a.of('attack').length, 0, 'the 10 m mark stayed Anna\'s');
  clk.tick(30000);
  await say(room, b, { t: 'over', reason: 'lives', best: 12 });
  assert.equal(a.last('result').winner, 0);
});

test('room: few storage writes (the free plan allows 100 000 a day)', async () => {
  const { room, a, b, clk, state } = await startedRoom();
  const before = state.writes;
  for (let k = 0; k < 250; k++) {
    clk.tick(400);
    const h = Math.min(49, k * 0.2);
    await say(room, a, { t: 'state', h, best: h });
    await say(room, b, { t: 'state', h: h * 0.9, best: h * 0.9 });
  }
  const writes = state.writes - before;
  assert.ok(writes <= 40, `${writes} writes for a 100 s match`);
});

test('room: a finished match sends both runs to the lobby (as challenge payloads) and closes later', async () => {
  const posts = [];
  const env = {
    MATCH_LOBBY: {
      idFromName: (n) => n,
      get: () => ({ fetch: async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return new Response('{}'); } }),
    },
  };
  const { room, a, b, clk, state } = await startedRoom({ env });
  for (let k = 1; k <= 30; k++) {
    clk.tick(1000);
    await say(room, a, { t: 'state', h: k * 1.5, best: k * 1.5 });
    await say(room, b, { t: 'state', h: k + 3, best: k });   // b's top counts a block still in the air
  }
  clk.tick(500);
  await say(room, a, { t: 'state', h: 50, best: 50 });
  assert.equal(b.last('result').reason, 'goal');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://lobby/runs');
  const runs = posts[0].body.payloads.map(decodeChallenge);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].seed, 'seedabc123');
  assert.equal(runs[0].name, 'Anna');
  assert.equal(runs[0].run.end, 'goal');
  assert.equal(runs[1].run.end, 'stop', 'the loser\'s tower simply stopped');
  assert.ok(runs[1].run.samples.length >= 30);
  assert.equal(Math.max(...runs[1].run.samples), 300, 'a recording keeps the best height, not the top');
  assert.equal(Math.max(...runs[0].run.samples), 500);
  assert.equal(state.alarm, clk.t + 60 * 1000);
  await room.alarm();
  assert.equal(a.closed && b.closed, true);
  assert.equal(state.store.size, 0, 'a finished room forgets everything');
});

test('room: a friend room nobody joined says "gone" when its time is up', async () => {
  const state = fakeState();
  const room = new MatchRoom(state, {}, { now: clock().now, upgrade });
  await room.init({ kind: 'friend' });
  const a = fakeSocket();
  await room.join(a);
  await room.alarm();
  assert.deepEqual(a.last('gone'), { t: 'gone' });
  assert.equal(a.closed, true);
});

// ---------------------------------------------------------------- lobby
function lobbyWith() {
  const inits = [];
  const env = {
    MATCH_ROOM: {
      idFromName: (n) => n,
      get: (code) => ({
        fetch: async (url, init) => {
          inits.push({ code, url, body: JSON.parse(init.body) });
          return new Response('{}', { status: 200 });
        },
      }),
    },
  };
  const clk = clock();
  const state = fakeState();
  let n = 0;
  const lobby = new MatchLobby(state, env, { now: clk.now, upgrade, roomCode: () => ['ABCDEF', 'GHJKMN'][n++ % 2] });
  return { lobby, inits, clk, state };
}

test('lobby: the longest-waiting player is paired with the next; both go to a new random room', async () => {
  const { lobby, inits, clk } = lobbyWith();
  const r1 = await lobby.fetch(new Request('https://x/match/lobby', { headers: { Upgrade: 'websocket' } }));
  const a = r1.ws;
  clk.tick(1000);
  const b = (await lobby.fetch(new Request('https://x/match/lobby', { headers: { Upgrade: 'websocket' } }))).ws;
  const quiet = (await lobby.fetch(new Request('https://x/match/lobby', { headers: { Upgrade: 'websocket' } }))).ws;   // never says hello
  await lobby.onMessage(a, JSON.stringify({ t: 'hello', name: 'Anna' }));
  assert.deepEqual(a.sent, [{ t: 'wait' }]);
  await lobby.onMessage(b, JSON.stringify({ t: 'hello', name: 'Bennie' }));
  assert.deepEqual(a.last('match'), { t: 'match', room: 'ABCDEF' });
  assert.deepEqual(b.last('match'), { t: 'match', room: 'ABCDEF' });
  assert.equal(a.closed && b.closed, true);
  assert.equal(quiet.sent.length, 0, 'someone who never said hello is not paired');
  assert.equal(inits.length, 1);
  assert.equal(inits[0].body.kind, 'random');
  assert.match(inits[0].body.seed, /^[a-z0-9]{10}$/);
  assert.ok(isRoomCode(inits[0].code));
});

test('lobby: only games with the same rules are paired (older games, sending none, with each other)', async () => {
  const { lobby } = lobbyWith();
  const open = async () => (await lobby.fetch(new Request('https://x/match/lobby', { headers: { Upgrade: 'websocket' } }))).ws;
  const old = await open();
  const now = await open();
  await lobby.onMessage(old, JSON.stringify({ t: 'hello', name: 'Anna' }));   // a 1.9 game: no rules
  await lobby.onMessage(now, JSON.stringify({ t: 'hello', name: 'Bennie', rules: DUEL.rules }));
  assert.equal(now.of('match').length, 0, 'a 1.10 tower is not raced against a 1.9 one');
  assert.deepEqual(now.sent, [{ t: 'wait' }]);
  const now2 = await open();
  await lobby.onMessage(now2, JSON.stringify({ t: 'hello', name: 'Carla', rules: DUEL.rules }));
  assert.equal(now.last('match').room, now2.last('match').room);
  const old2 = await open();
  await lobby.onMessage(old2, JSON.stringify({ t: 'hello', name: 'Dawie' }));
  assert.equal(old.last('match').room, old2.last('match').room);
});

test('lobby: recordings are validated, capped and expire after a week; a ghost is one of them', async () => {
  const { lobby, clk } = lobbyWith();
  assert.equal((await lobby.ghost()).status, 404, 'nothing yet');
  const good = encodeChallenge({ seed: 'seedabc123', name: 'Anna', run: { samples: [0, 10, 20, 30], endT: 4000, end: 'goal' } });
  const post = (payloads) => lobby.fetch(new Request('https://lobby/runs', { method: 'POST', body: JSON.stringify({ payloads }) }));
  await post([good, 'junk', 12]);
  const g = await (await lobby.ghost()).json();
  assert.equal(g.payload, good);
  for (let k = 0; k < 70; k++) await post([good]);
  assert.equal((await lobby.state.storage.get('runs')).length, 60);
  clk.tick(8 * 864e5);
  assert.equal((await lobby.ghost()).status, 404, 'a week later they are gone');
});

test('lobby: the owner can list the recordings and forget them by nickname (a test match, a rude name)', async () => {
  const { lobby } = lobbyWith();
  const run = (name, end = 'goal') => encodeChallenge({ seed: 'seedabc123', name, run: { samples: [0, 10, 25, 40], endT: 4000, end } });
  const post = (payloads) => lobby.fetch(new Request('https://lobby/runs', { method: 'POST', body: JSON.stringify({ payloads }) }));
  await post([run('Anna'), run('Toets A', 'quit')]);
  await post([run('Bennie'), run('Toets B', 'quit')]);
  const list = await (await lobby.fetch(new Request('https://lobby/runs/list'))).json();
  assert.deepEqual(list.runs.map((r) => [r.name, r.best, r.end]), [['Anna', 4, 'goal'], ['Toets A', 4, 'quit'], ['Bennie', 4, 'goal'], ['Toets B', 4, 'quit']]);
  const forget = (body) => lobby.fetch(new Request('https://lobby/runs/forget', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal((await forget({})).status, 400);
  assert.equal((await forget({ names: [] })).status, 400);
  const res = await (await forget({ names: ['Toets A', 'Toets B', 'Nobody'] })).json();
  assert.deepEqual(res, { ok: true, removed: 2, left: 2 });
  const names = (await lobby.state.storage.get('runs')).map((r) => decodeChallenge(r.payload).name);
  assert.deepEqual(names, ['Anna', 'Bennie']);
});

test('admin routes: /admin/runs lists and forgets recordings, only with the owner\'s token', async () => {
  const { lobby } = lobbyWith();
  await lobby.fetch(new Request('https://lobby/runs', {
    method: 'POST', body: JSON.stringify({ payloads: [encodeChallenge({ seed: 'seedabc123', name: 'Toets Oud', run: { samples: [0, 100], endT: 1500, end: 'quit' } })] }),
  }));
  const h = createHarness({ MATCH_LOBBY: { idFromName: (n) => n, get: () => lobby }, MATCH_ROOM: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response('{}') }) } });
  assert.equal((await h.admin('GET', '/admin/runs', undefined, null)).status, 401);
  assert.equal((await h.admin('POST', '/admin/runs', { names: ['Toets Oud'] }, `${ADMIN}x`)).status, 401);
  const list = await h.admin('GET', '/admin/runs');
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.runs.map((r) => r.name), ['Toets Oud']);
  const res = await h.admin('POST', '/admin/runs', { names: ['Toets Oud'] });
  assert.equal(res.status, 200);
  assert.equal(res.json.removed, 1);
  assert.equal((await h.admin('GET', '/admin/runs')).json.runs.length, 0);
  assert.equal((await h.admin('DELETE', '/admin/runs')).status, 405);
  // the public ghost route can't reach the owner's actions
  assert.equal((await h.request('POST', '/match/runs/forget', { body: { names: ['x'] } })).status, 404);
});

// ---------------------------------------------------------------- routes
function matchEnv(extra = {}) {
  const forwarded = [];
  const room = {
    idFromName: (n) => n,
    get: (code) => ({
      fetch: async (req, init) => {
        forwarded.push({ code, url: typeof req === 'string' ? req : req.url, method: init?.method || req.method });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    }),
  };
  const lobby = { idFromName: (n) => n, get: () => ({ fetch: async () => new Response(JSON.stringify({ payload: 'x' }), { status: 200 }) }) };
  return { env: { ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:*`, MATCH_ROOM: room, MATCH_LOBBY: lobby, ...extra }, forwarded };
}

test('routes: no bindings -> 503; a foreign site -> 403; a friend room -> a code', async () => {
  const worker = createWorker({ now: () => T0, log: () => {} });
  const res0 = await worker.fetch(new Request('https://w/match/room', { method: 'POST', headers: { Origin: ORIGIN } }), { ALLOWED_ORIGINS: ORIGIN });
  assert.equal(res0.status, 503);
  const { env, forwarded } = matchEnv();
  const bad = await worker.fetch(new Request('https://w/match/room', { method: 'POST', headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(bad.status, 403);
  const res = await worker.fetch(new Request('https://w/match/room', { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': '1.2.3.4' } }), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const { code } = await res.json();
  assert.ok(isRoomCode(code));
  assert.equal(forwarded[0].url, 'https://room/init');
  assert.equal(forwarded[0].code, code);
});

test('routes: an address can open 30 friend rooms an hour', async () => {
  const worker = createWorker({ now: () => T0, log: () => {} });
  const { env } = matchEnv();
  let last;
  for (let k = 0; k < 31; k++) {
    last = await worker.fetch(new Request('https://w/match/room', { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': '9.9.9.9' } }), env);
  }
  assert.equal(last.status, 429);
});

test('routes: room codes are checked; sockets must be upgrades', async () => {
  const worker = createWorker({ now: () => T0, log: () => {} });
  const { env } = matchEnv();
  const h = { Origin: ORIGIN, Upgrade: 'websocket' };
  assert.equal((await worker.fetch(new Request('https://w/match/room/abc', { headers: h }), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://w/match/room/ABCDE0', { headers: h }), env)).status, 404, 'no 0 in codes');
  assert.equal((await worker.fetch(new Request('https://w/match/room/ABCDEF', { headers: { Origin: ORIGIN } }), env)).status, 426);
  assert.equal((await worker.fetch(new Request('https://w/match/lobby', { headers: { Origin: ORIGIN } }), env)).status, 426);
  assert.equal((await worker.fetch(new Request('https://w/match/ghost', { headers: { Origin: ORIGIN } }), env)).status, 200);
  assert.equal((await worker.fetch(new Request('https://w/match/nope', { headers: { Origin: ORIGIN } }), env)).status, 404);
});
