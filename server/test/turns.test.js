// Blok vir Blok live (1.11): a room in 'turns' mode starts with the first turn drawn, passes a drop and a
// turn's report on only from the player whose turn it is, keeps hearts and jokers with js/core/turns.js,
// and ends on hearts, leaving or a turn that never ends; the lobby pairs only the same mode; the friend
// room route takes the mode. Fake Durable Object state and sockets (as in match.test.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom, MatchLobby } from '../src/match.js';
import { createWorker } from '../src/worker.js';
import { DUEL, TURNS } from '../../js/config.js';
import { ORIGIN, T0 } from './support/harness.js';

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
  };
  return st;
}

const upgrade = () => {
  const ws = fakeSocket();
  return [{ status: 101, ws }, ws];
};

function clock(t = T0) {
  const c = { t, tick: (ms) => { c.t += ms; } };
  c.now = Object.assign(() => c.t, { tick: c.tick });
  return c;
}

const say = (room, ws, o) => room.onMessage(ws, JSON.stringify(o));
const POSE = [360.125, -812.5, 0.0314, 120.5, -3.25];
const snap = (i, r = 'G') => (r === 'X' ? { blocks: [], lost: [i] } : { blocks: [[i, 360 + i, 400 - 40 * i, 0.001, 0, r]], lost: [] });

/** A Blok vir Blok room with two players who said hello (protocol v: 3 = 1.11, 4 = 1.12). Returns sockets by seat. */
async function turnsRoom({ fresh = false, v = [3, 3] } = {}) {
  const clk = clock();
  const state = fakeState();
  let room = new MatchRoom(state, {}, { now: clk.now, upgrade });
  const init = await room.init({ kind: 'friend', seed: 'seedabc123', mode: 'turns' });
  const a = fakeSocket();
  const b = fakeSocket();
  await room.join(a);
  await room.join(b);
  await say(room, a, { t: 'hello', name: 'Anna', v: v[0] });
  await say(room, b, { t: 'hello', name: 'Bennie', v: v[1] });
  clk.tick(DUEL.countdownMs);
  if (fresh) room = new MatchRoom(state, {}, { now: clk.now, upgrade });   // woken after hibernation
  const first = a.last('start').turn.seat;
  const bySeat = [a.last('start').you === 0 ? a : b, a.last('start').you === 0 ? b : a];
  return { room, a, b, clk, state, init, first, bySeat };
}

/** Plays turn n for `ws` (drop, then the report), a second later than the last (a room takes 10 messages a second). */
async function play(room, ws, n, { r = 'G', lost = false } = {}) {
  room.now.tick?.(1000);
  await say(room, ws, { t: 'drop', n, p: POSE });
  await say(room, ws, { t: 'settled', n, lost, r, snap: snap(n - 1, r) });
}

test('turns room: the mode is kept; both start together with the same first turn, drawn by the room', async () => {
  const { a, b, init, state, first } = await turnsRoom();
  assert.equal((await init.json()).mode, 'turns');
  const sa = a.last('start');
  const sb = b.last('start');
  assert.equal(sa.mode, 'turns');
  assert.deepEqual(sa.turn, sb.turn);
  assert.deepEqual(sa.turn, { n: 1, seat: first, hearts: [TURNS.hearts, TURNS.hearts], streaks: [0, 0], sab: null });
  assert.notEqual(sa.you, sb.you);
  assert.equal(sa.opp.name, 'Bennie');
  assert.equal(state.alarm, T0 + DUEL.countdownMs + TURNS.serverTurnMs, 'a turn that never ends is caught');
});

test('turns room: a drop and a report count only from the player whose turn it is', async () => {
  const { room, first, bySeat } = await turnsRoom();
  const me = bySeat[first];
  const them = bySeat[1 - first];
  await say(room, them, { t: 'drop', n: 1, p: POSE });
  await say(room, me, { t: 'drop', n: 2, p: POSE });
  await say(room, me, { t: 'drop', n: 1, p: [1, 2, 3] });
  assert.equal(them.of('drop').length + me.of('drop').length, 0, 'out of turn, the wrong number, or a broken pose');
  await say(room, me, { t: 'drop', n: 1, p: POSE });
  assert.deepEqual(them.last('drop'), { t: 'drop', n: 1, p: POSE }, 'passed on exactly');
  assert.equal(me.of('drop').length, 0, 'not echoed back');
  await say(room, them, { t: 'settled', n: 1, r: 'P', snap: snap(0) });
  await say(room, me, { t: 'settled', n: 1, r: 'P', snap: { blocks: 'x', lost: [] } });
  assert.equal(them.of('turn').length, 0);
  await say(room, me, { t: 'settled', n: 1, r: 'P', snap: snap(0, 'P') });
  assert.deepEqual(them.last('settled'), { t: 'settled', n: 1, lost: false, r: 'P', snap: snap(0, 'P') });
  for (const ws of [me, them]) {
    assert.deepEqual(ws.last('turn'), { t: 'turn', n: 2, seat: 1 - first, hearts: [TURNS.hearts, TURNS.hearts], streaks: first === 0 ? [1, 0] : [0, 1], sab: null });
  }
});

test('turns room: hearts go with lost turns; the first out of hearts loses, and the room closes later', async () => {
  const { room, clk, state, first, bySeat } = await turnsRoom({ fresh: true });
  let n = 1;
  let seat = first;
  for (let k = 0; k < TURNS.hearts; k++) {
    await play(room, bySeat[seat], n++, { r: 'X', lost: true });   // the first player keeps missing
    if (k < TURNS.hearts - 1) await play(room, bySeat[1 - seat], n++, { r: 'G' });
  }
  seat = 1 - first;
  for (const ws of bySeat) {
    assert.equal(ws.last('result').winner, seat);
    assert.equal(ws.last('result').reason, 'hearts');
  }
  assert.equal(bySeat[0].last('result').hearts[first], 0);
  assert.equal(state.alarm, clk.t + 60 * 1000, 'the finished room is cleared a minute later');
  await play(room, bySeat[seat], n, { r: 'P' });
  assert.equal(bySeat[seat].of('turn').length, TURNS.hearts * 2 - 2 + 0, 'nothing after the result');
});

test('turns room: five Perfeks in a row -> choose; the sabotage comes with the other player\'s next block', async () => {
  const { room, first, bySeat } = await turnsRoom();
  const me = bySeat[first];
  const them = bySeat[1 - first];
  let n = 1;
  for (let k = 0; k < TURNS.jokerStreak - 1; k++) {
    await play(room, me, n++, { r: 'P' });
    await play(room, them, n++, { r: 'G' });
  }
  await play(room, me, n++, { r: 'P' });
  assert.deepEqual(me.last('choose'), { t: 'choose', options: [...TURNS.sabotages], def: TURNS.sabotages[0] });
  assert.equal(them.of('choose').length, 0);
  assert.equal(them.last('turn').sab, null, 'their block was already on the crane');
  await say(room, them, { t: 'joker', kind: 'fog' });
  assert.equal(them.of('sent').length, 0, 'no joker, no sabotage');
  await say(room, me, { t: 'joker', kind: 'rain' });
  assert.deepEqual(me.last('sent'), { t: 'sent', kind: 'rain' });
  assert.deepEqual(them.last('sabotage'), { t: 'sabotage', kind: 'rain' });
  await play(room, them, n++, { r: 'G' });
  assert.equal(me.last('turn').seat, first);
  assert.equal(me.last('turn').sab, null);
  await play(room, me, n++, { r: 'G' });
  assert.equal(them.last('turn').seat, 1 - first);
  assert.equal(them.last('turn').sab, 'rain');
  assert.equal(me.last('turn').sab, 'rain', 'both games show it');
});

test('turns room: leaving (quit or a closed connection) hands the match to the other player', async () => {
  let { room, first, bySeat } = await turnsRoom();
  await say(room, bySeat[first], { t: 'over', reason: 'quit' });
  assert.equal(bySeat[1 - first].last('result').winner, 1 - first);
  assert.equal(bySeat[1 - first].last('result').reason, 'quit');

  ({ room, first, bySeat } = await turnsRoom());
  bySeat[1 - first].closed = true;
  await room.onClose(bySeat[1 - first]);
  assert.equal(bySeat[first].last('result').winner, first);
});

test('turns room: a turn that never ends loses the match for that player (the alarm)', async () => {
  const { room, clk, state, first, bySeat } = await turnsRoom();
  const first0 = state.alarm;
  await play(room, bySeat[first], 1);
  const deadline = clk.t + TURNS.serverTurnMs;   // each new turn gets its own deadline...
  assert.equal(state.alarm, first0, '...without a storage write per turn: the first alarm moves itself on');
  clk.t = first0;
  await room.alarm();
  assert.equal(bySeat[0].of('result').length, 0, 'not yet');
  assert.equal(state.alarm, deadline);
  clk.t = deadline - 1;
  await room.alarm();
  assert.equal(bySeat[0].of('result').length, 0, 'still not');
  clk.t = deadline;
  const woken = new MatchRoom(state, {}, { now: clk.now, upgrade });
  // the sockets live on in the state: the woken room finds them
  await woken.alarm();
  for (const ws of bySeat) {
    assert.equal(ws.last('result').winner, first, 'the second player never ended their turn');
    assert.equal(ws.last('result').reason, 'timeout');
  }
});

test('turns room: a Wedloop room ignores turn messages, and a turns room ignores heights', async () => {
  const { room, first, bySeat } = await turnsRoom();
  await say(room, bySeat[first], { t: 'state', h: 12, best: 12 });
  assert.equal(bySeat[1 - first].of('opp').length, 0);
});

test('lobby: only the same mode is paired (an older game, sending none, plays Wedloop)', async () => {
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
  let k = 0;
  const lobby = new MatchLobby(fakeState(), env, { now: clk.now, upgrade, roomCode: () => ['ABCDEF', 'GHJKMN'][k++ % 2] });
  const open = async () => (await lobby.fetch(new Request('https://x/match/lobby', { headers: { Upgrade: 'websocket' } }))).ws;
  const old = await open();
  const turns = await open();
  await lobby.onMessage(old, JSON.stringify({ t: 'hello', name: 'Anna', rules: DUEL.rules }));
  await lobby.onMessage(turns, JSON.stringify({ t: 'hello', name: 'Bennie', rules: DUEL.rules, mode: 'turns' }));
  assert.equal(turns.of('match').length, 0, 'Blok vir Blok is not paired with Wedloop');
  const race = await open();
  await lobby.onMessage(race, JSON.stringify({ t: 'hello', name: 'Carla', rules: DUEL.rules, mode: 'race' }));
  assert.equal(old.last('match').room, race.last('match').room);
  assert.equal(inits[0].body.mode, 'race');
  const turns2 = await open();
  await lobby.onMessage(turns2, JSON.stringify({ t: 'hello', name: 'Dawie', rules: DUEL.rules, mode: 'turns' }));
  assert.equal(turns.last('match').room, turns2.last('match').room);
  assert.equal(inits[1].body.mode, 'turns');
});

test('routes: a friend room takes the mode from its request ({} or no body: Wedloop)', async () => {
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
    method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip, ...(body !== null ? { 'Content-Type': 'application/json' } : {}) }, body,
  }), env);
  assert.equal((await post(JSON.stringify({ mode: 'turns' }), '1.1.1.1')).status, 200);
  assert.equal((await post('{}', '1.1.1.2')).status, 200);
  assert.equal((await post(null, '1.1.1.3')).status, 200);
  assert.equal((await post('not json', '1.1.1.4')).status, 200);
  assert.deepEqual(forwarded.map((b) => b.mode), ['turns', 'race', 'race', 'race']);
  assert.ok(forwarded.every((b) => b.kind === 'friend'));
});

test('Wedloop room: a height report may carry the player\'s hearts; the other player hears them', async () => {
  const clk = clock();
  const state = fakeState();
  const room = new MatchRoom(state, {}, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', seed: 'seedabc123' });
  const a = fakeSocket();
  const b = fakeSocket();
  await room.join(a);
  await room.join(b);
  await say(room, a, { t: 'hello', name: 'Anna', v: 2 });
  await say(room, b, { t: 'hello', name: 'Bennie', v: 2 });
  clk.tick(DUEL.countdownMs + 5000);
  await say(room, a, { t: 'state', h: 4, best: 4, lives: 3 });
  assert.deepEqual(b.last('opp'), { t: 'opp', h: 4, best: 4, lives: 3 });
  clk.tick(1000);
  await say(room, a, { t: 'state', h: 5, best: 5 });
  assert.deepEqual(b.last('opp'), { t: 'opp', h: 5, best: 5 }, 'an older game sends none');
  clk.tick(1000);
  await say(room, a, { t: 'state', h: 6, best: 6, lives: 'x' });
  assert.equal(b.last('opp').lives, undefined);
});

test('turns room: a game too old for Blok vir Blok (protocol < 3) hears "gone" and its seat stays free', async () => {
  const clk = clock();
  const state = fakeState();
  const room = new MatchRoom(state, {}, { now: clk.now, upgrade });
  await room.init({ kind: 'friend', seed: 'seedabc123', mode: 'turns' });
  const host = fakeSocket();
  const old = fakeSocket();
  await room.join(host);
  await say(room, host, { t: 'hello', name: 'Anna', v: 3 });
  await room.join(old);
  await say(room, old, { t: 'hello', name: 'Ou App', v: 2 });
  assert.deepEqual(old.last('gone'), { t: 'gone' });
  assert.equal(old.closed, true);
  assert.equal(host.of('start').length, 0, 'no match with it');
  const friend = fakeSocket();
  await room.join(friend);
  await say(room, friend, { t: 'hello', name: 'Bennie', v: 3 });
  assert.equal(host.last('start').mode, 'turns', 'the seat was still there for a game that can play');
});

test('turns room: a report that doesn\'t fit the turn is ignored (future blocks; a lost block not rated X)', async () => {
  const { room, first, bySeat } = await turnsRoom();
  const me = bySeat[first];
  const them = bySeat[1 - first];
  room.now.tick(1000);
  await say(room, me, { t: 'settled', n: 1, lost: false, r: 'G', snap: { blocks: [[5, 1, 2, 0, 0, 'G']], lost: [] } });
  await say(room, me, { t: 'settled', n: 1, lost: true, r: 'G', snap: { blocks: [], lost: [0] } });
  assert.equal(them.of('settled').length + them.of('turn').length, 0);
  await say(room, me, { t: 'settled', n: 1, lost: true, r: 'X', snap: { blocks: [], lost: [0] } });
  assert.equal(them.last('turn').hearts[first], TURNS.hearts - 1);
});

// ------------------------------------------------------------------------------- 1.12
import { turnRounds } from '../../js/core/turns.js';

test('1.12 turns room: rondtes only when both games know them; the turns carry the round and the one coming', async () => {
  const old = await turnsRoom({ v: [4, 3] });
  assert.equal(old.a.last('start').rounds, undefined, 'a 1.11 game in the match: no rounds');
  assert.equal(old.a.last('start').opp.v, 3, 'each game hears the other\'s protocol');
  const { room, a, b, first, bySeat } = await turnsRoom({ v: [4, 4] });
  assert.equal(a.last('start').rounds, true);
  assert.equal(b.last('start').rounds, true);
  const plan = turnRounds('seedabc123');
  const r1 = plan[0];
  let seat = first;
  for (let n = 1; n < r1.n; n++) {
    await play(room, bySeat[seat], n);
    seat = 1 - seat;
  }
  const before = a.of('turn').find((t) => t.n === r1.n - 1);
  assert.deepEqual(before.nx, { kind: r1.kind, dir: r1.dir, strength: r1.strength, side: r1.side, key: r1.key, first: true }, 'shown coming');
  const t1 = a.of('turn').find((t) => t.n === r1.n);
  assert.equal(t1.ev.key, r1.key);
  assert.deepEqual(b.of('turn').find((t) => t.n === r1.n), t1, 'both hear the same');
  await play(room, bySeat[seat], r1.n);
  const t2 = a.of('turn').find((t) => t.n === r1.n + 1);
  assert.equal(t2.ev.key, r1.key, 'the other player gets the same round');
  assert.equal(t2.ev.first, false);
  assert.notEqual(t2.seat, t1.seat);
});

test('1.12 turns room: go, the report\'s steps and Skelm Sakkie\'s outcome pass on only from the player whose turn it is', async () => {
  const { room, first, bySeat } = await turnsRoom({ v: [4, 4] });
  const me = bySeat[first];
  const them = bySeat[1 - first];
  await say(room, them, { t: 'go', n: 1 });
  await say(room, me, { t: 'go', n: 2 });
  assert.equal(me.of('go').length + them.of('go').length, 0);
  await say(room, me, { t: 'go', n: 1 });
  assert.deepEqual(them.last('go'), { t: 'go', n: 1 });
  room.now.tick?.(1000);
  await say(room, me, { t: 'visit', n: 1, what: 'stole', at: 2100.4, idx: [3, 4, 'x', -1, 99999] });
  assert.deepEqual(them.last('visit'), { t: 'visit', n: 1, what: 'stole', at: 2100, idx: [3, 4] });
  await say(room, me, { t: 'visit', n: 1, what: 'ate', at: 1 });
  await say(room, them, { t: 'visit', n: 1, what: 'caught', at: 1 });
  assert.equal(them.of('visit').length, 1, 'a strange outcome, or out of turn: not passed on');
  await say(room, me, { t: 'drop', n: 1, p: POSE });
  await say(room, me, { t: 'settled', n: 1, r: 'G', snap: snap(0), k: 131 });
  assert.equal(them.last('settled').k, 131, 'the steps from the drop to the report');
  assert.equal(me.of('visit').length, 0, 'not echoed back');
});

test('1.12 turns room: beating the round\'s visitor gives a heart back on the server too', async () => {
  const seed = 'seedabc123';
  const plan = turnRounds(seed);
  const thief = plan.find((r) => r.kind === 'thief');
  const { room, a, first, bySeat } = await turnsRoom({ v: [4, 4] });
  let seat = first;
  const who = thief.n % 2 ? first : 1 - first;
  let lostOne = false;
  for (let n = 1; n < thief.n; n++) {
    const lose = seat === who && !lostOne;
    if (lose) lostOne = true;
    await play(room, bySeat[seat], n, lose ? { r: 'X', lost: true } : {});
    seat = 1 - seat;
  }
  assert.equal(seat, who);
  const hearts = a.last('turn').hearts[who];
  assert.equal(hearts, TURNS.hearts - 1);
  room.now.tick?.(1000);
  await say(room, bySeat[seat], { t: 'drop', n: thief.n, p: POSE });
  await say(room, bySeat[seat], { t: 'settled', n: thief.n, r: 'G', snap: snap(thief.n - 1), vis: 'caught' });
  assert.equal(a.last('turn').hearts[who], TURNS.hearts, 'caught: a heart back');
});

test('1.12 emoji reactions: passed on in either mode, a known one only, at most one every few seconds', async () => {
  const { EMOTE } = await import('../../js/config.js');
  const { room, first, bySeat } = await turnsRoom({ v: [4, 4] });
  const me = bySeat[first];
  const them = bySeat[1 - first];
  await say(room, me, { t: 'emote', e: 'lag' });
  assert.deepEqual(them.last('emote'), { t: 'emote', e: 'lag' });
  await say(room, me, { t: 'emote', e: 'vuur' });
  assert.equal(them.of('emote').length, 1, 'too soon');
  room.now.tick?.(EMOTE.serverGapMs);
  await say(room, me, { t: 'emote', e: '<script>' });
  assert.equal(them.of('emote').length, 1, 'unknown');
  await say(room, me, { t: 'emote', e: 'vuur' });
  assert.equal(them.of('emote').length, 2);
  await say(room, them, { t: 'emote', e: 'klap' });
  assert.deepEqual(me.last('emote'), { t: 'emote', e: 'klap' }, 'either player, whoever\'s turn it is');
  assert.equal(me.of('emote').length, 1);
});
