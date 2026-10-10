// Blok vir Blok on the device (js/duel.js, 1.11): a room in turns mode, the room's messages to the game
// (held back until the scene is up), the game's drop and report to the room, the joker's choice, the
// result, a lost connection; and against Robot Rikus, the referee running here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bus } from '../js/core/bus.js';
import { createDuel } from '../js/duel.js';
import { TURNS } from '../js/config.js';

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
}

function setup() {
  sockets.length = 0;
  const bus = new Bus();
  const heard = [];
  for (const name of ['turns:turn', 'turns:drop', 'turns:settled', 'duel:end', 'duel:choose', 'duel:chosen', 'hud:toast']) {
    bus.on(name, (p) => heard.push([name, p]));
  }
  const posts = [];
  const timers = [];
  const duel = createDuel({
    bus,
    apiUrl: 'https://borge.example',
    nickname: () => 'Anna',
    WebSocketImpl: FakeSocket,
    fetchImpl: async (url, init) => {
      posts.push({ url, body: init?.body });
      return { ok: true, json: async () => ({ code: 'ABCD23' }) };
    },
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  return { bus, duel, heard, posts, timers, of: (n) => heard.filter((h) => h[0] === n).map((h) => h[1]) };
}

const T1 = { n: 1, seat: 1, hearts: [3, 3], streaks: [0, 0], sab: null };
const POSE = [360.5, -800.25, 0.01, 50, 3];
const SNAP = { blocks: [[0, 360, 1200, 0, 0, 'P']], lost: [] };

test('a friend room in Blok vir Blok: the mode goes to the server; the start carries the first turn', async () => {
  const { duel, posts, of, bus } = setup();
  let started = null;
  await duel.createRoom({ mode: 'turns', onStart: (m) => { started = m; } });
  assert.deepEqual(JSON.parse(posts[0].body), { mode: 'turns' });
  sockets[0].open();
  assert.equal(sockets[0].sent[0].t, 'hello');
  assert.equal(sockets[0].sent[0].v, 5, 'protocol 5 (1.12.1; 4: Blok vir Blok with go and the report\'s steps)');
  sockets[0].hear({ t: 'wait' });
  sockets[0].hear({ t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie' }, mode: 'turns', turn: T1 });
  assert.equal(started.mode, 'turns');
  assert.equal(started.turn.seat, 1);
  // the room speaks before the scene is up (the 3-2-1): nothing reaches the game yet
  sockets[0].hear({ t: 'drop', n: 1, p: POSE });
  assert.equal(of('turns:turn').length + of('turns:drop').length, 0);
  bus.emit('turns:ready');
  assert.deepEqual(of('turns:turn')[0], { ...T1, ev: null, nx: null, mine: false, you: 0, names: ['', 'Bennie'], bot: false });
  assert.deepEqual(of('turns:drop')[0], { n: 1, p: POSE, ct: null }, 'then what came meanwhile, in order');
});

test('the other player\'s drop and report reach the game; ours go to the room; out of turn nothing does', async () => {
  const { duel, of, bus } = setup();
  await duel.createRoom({ mode: 'turns' });
  sockets[0].open();
  sockets[0].hear({ t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie' }, mode: 'turns', turn: T1 });
  bus.emit('turns:ready');
  const ws = sockets[0];
  bus.emit('turns:mydrop', { n: 1, p: POSE });   // not our turn
  assert.equal(ws.sent.filter((m) => m.t === 'drop').length, 0);
  ws.hear({ t: 'drop', n: 1, p: POSE, ct: 1234 });
  ws.hear({ t: 'drop', n: 2, p: POSE });           // a wrong turn number
  assert.deepEqual(of('turns:drop'), [{ n: 1, p: POSE, ct: 1234 }]);
  const MISSED = { blocks: [], lost: [0] };
  ws.hear({ t: 'settled', n: 1, lost: true, r: 'X', snap: SNAP });   // an X that stands: doesn't fit
  ws.hear({ t: 'settled', n: 1, lost: false, r: 'P', snap: { blocks: 'nope', lost: [] } });
  ws.hear({ t: 'settled', n: 1, lost: true, r: 'X', snap: MISSED });
  assert.deepEqual(of('turns:settled'), [{ n: 1, lost: true, r: 'X', snap: MISSED }]);
  ws.hear({ t: 'turn', n: 2, seat: 0, hearts: [3, 2], streaks: [0, 0], sab: null });
  assert.equal(of('turns:turn').at(-1).mine, true);
  bus.emit('turns:mydrop', { n: 2, p: POSE, ct: 2500.4 });
  assert.deepEqual(ws.sent.filter((m) => m.t === 'drop'), [{ t: 'drop', n: 2, p: POSE, ct: 2500 }]);
  bus.emit('turns:mysettled', { n: 2, lost: false, r: 'P', snap: SNAP });
  assert.deepEqual(ws.sent.filter((m) => m.t === 'settled'), [{ t: 'settled', n: 2, lost: false, r: 'P', snap: SNAP }]);
  ws.hear({ t: 'turn', n: 2, seat: 0, hearts: [3, 2], streaks: [0, 0], sab: null });
  assert.equal(of('turns:turn').length, 2, 'a repeated turn is not a new one');
});

test('a joker: the choice (sabotages, the default in time), the pick to the room, the heads-up; the result', async () => {
  const { duel, of, bus, timers } = setup();
  await duel.createRoom({ mode: 'turns' });
  sockets[0].open();
  sockets[0].hear({ t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie' }, mode: 'turns', turn: { ...T1, seat: 0 } });
  bus.emit('turns:ready');
  const ws = sockets[0];
  ws.hear({ t: 'choose', options: TURNS.sabotages, def: TURNS.sabotages[0] });
  const c = of('duel:choose')[0];
  assert.deepEqual({ ...c }, { m: 0, opp: 'Bennie', def: TURNS.sabotages[0], options: [...TURNS.sabotages], ms: TURNS.chooseMs, joker: true });
  assert.equal(timers.at(-1).ms, TURNS.chooseMs, 'the default comes by itself');
  bus.emit('ui:duel-punish', { m: 0, kind: 'rain' });
  assert.deepEqual(ws.sent.filter((m) => m.t === 'joker'), [{ t: 'joker', kind: 'rain' }]);
  ws.hear({ t: 'sent', kind: 'rain' });
  assert.match(of('hud:toast').at(-1).text, /Bennie/);
  ws.hear({ t: 'sabotage', kind: 'fog' });
  assert.match(of('hud:toast').at(-1).text, /Bennie/);
  ws.hear({ t: 'result', winner: 0, reason: 'hearts', hearts: [2, 0] });
  assert.deepEqual(of('duel:end').at(-1), { outcome: 'won' });
  const sum = duel.summary();
  assert.equal(sum.mode, 'turns');
  assert.equal(sum.youHearts, 2);
  assert.equal(sum.oppHearts, 0);
  assert.equal(sum.challenge, null, 'no run to race later');
});

test('a lost connection ends a Blok vir Blok match (it can\'t go on alone); quitting tells the room', async () => {
  let { duel, of, bus } = setup();
  await duel.createRoom({ mode: 'turns' });
  sockets[0].open();
  sockets[0].hear({ t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie' }, mode: 'turns', turn: T1 });
  bus.emit('turns:ready');
  sockets[0].drop();
  assert.deepEqual(of('duel:end').at(-1), { outcome: 'none' });
  assert.equal(duel.summary().outcome, 'none');

  ({ duel, of, bus } = setup());
  await duel.createRoom({ mode: 'turns' });
  sockets[0].open();
  sockets[0].hear({ t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie' }, mode: 'turns', turn: T1 });
  bus.emit('turns:ready');
  bus.emit('duel:over', { reason: 'quit' });   // (the scene ended the tower itself)
  assert.deepEqual(sockets[0].sent.filter((m) => m.t === 'over'), [{ t: 'over', reason: 'quit' }]);
  assert.equal(duel.summary().outcome, 'lost');
  assert.equal(duel.summary().reason, 'quit');
});

test('looking for a Blok vir Blok opponent says so; "play now" is Robot Rikus (no recordings)', async () => {
  const { duel } = setup();
  let fell = null;
  duel.findOpponent({ mode: 'turns', onFallback: (m) => { fell = m; } });
  sockets[0].open();
  assert.equal(sockets[0].sent[0].mode, 'turns');
  duel.playNow();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fell.kind, 'bot');
  assert.equal(fell.mode, 'turns');
});

test('against Robot Rikus the referee runs here: turns follow the reports, his joker sabotages us, hearts decide', () => {
  const { duel, of, bus } = setup();
  const m = duel.startBot('turns');
  assert.equal(m.mode, 'turns');
  bus.emit('turns:ready');
  const first = of('turns:turn')[0];
  assert.equal(first.n, 1);
  assert.equal(first.bot, true);
  let seat = first.seat;
  let n = 1;
  // Robot Rikus lands 5 Perfeks in a row on his turns: his joker goes straight onto our next block
  for (let k = 0; k < 2 * TURNS.jokerStreak; k++) {
    const mine = seat === 0;
    bus.emit('turns:mysettled', { n, lost: false, r: mine ? 'G' : 'P', snap: SNAP });
    n++;
    seat = 1 - seat;
  }
  assert.ok(of('hud:toast').some((t) => /Robot Rikus/.test(t.text)), 'a heads-up for us');
  // then we miss until our hearts are gone
  let guard = 0;
  while (!of('duel:end').length && guard++ < 40) {
    const t = of('turns:turn').at(-1);
    bus.emit('turns:mysettled', { n: t.n, lost: t.mine, r: t.mine ? 'X' : 'G', snap: SNAP });
  }
  assert.deepEqual(of('duel:end').at(-1), { outcome: 'lost' });
  // his sabotage came with the first block of ours after his choice (ours already on the crane kept clear)
  assert.equal(of('turns:turn').filter((t) => t.sab && t.mine).length, 1, 'one block of ours gets it');
  assert.equal(of('turns:turn').filter((t) => t.sab && !t.mine).length, 0);
  assert.equal(duel.summary().youHearts, 0);
  assert.ok(duel.summary().oppPerfects >= TURNS.jokerStreak);
});

// ------------------------------------------------------------------------------- emoji reactions (1.12)
import { EMOTES, EMOTE } from '../js/config.js';

test('emoji reactions: shown here and sent live; one every few seconds and a handful a match; muting hides theirs', async () => {
  let t = 1000;
  const sockets2 = [];
  const bus = new Bus();
  const shown = [];
  bus.on('hud:emote', (e) => shown.push(e));
  class Sock extends FakeSocket { constructor(u) { super(u); sockets2.push(this); } }
  const duel = createDuel({
    bus, apiUrl: 'https://borge.example', nickname: () => 'Anna', WebSocketImpl: Sock, now: () => t,
    fetchImpl: async () => ({ ok: true, json: async () => ({ code: 'ABCD23' }) }),
    setTimer: (fn) => 0, clearTimer: () => {},
  });
  await duel.createRoom({ mode: 'turns', onStart: () => {} });
  const ws = sockets2.at(-1);
  ws.open();
  ws.hear({ t: 'wait' });
  ws.hear({ t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie', v: 4 }, mode: 'turns', turn: { n: 1, seat: 0, hearts: [3, 3], streaks: [0, 0], sab: null } });
  bus.emit('turns:ready');   // (the match scene is up: messages are no longer held back)
  bus.emit('ui:emote', 'lag');
  assert.deepEqual(shown.at(-1), { side: 'you', emoji: EMOTES.lag });
  assert.deepEqual(ws.sent.filter((m) => m.t === 'emote'), [{ t: 'emote', e: 'lag' }]);
  bus.emit('ui:emote', 'vuur');
  assert.equal(ws.sent.filter((m) => m.t === 'emote').length, 1, 'not again within the cooldown');
  bus.emit('ui:emote', 'nope');
  t += EMOTE.cooldownMs;
  bus.emit('ui:emote', 'vuur');
  assert.equal(ws.sent.filter((m) => m.t === 'emote').length, 2);
  for (let k = 0; k < EMOTE.perMatch + 3; k++) {
    t += EMOTE.cooldownMs;
    bus.emit('ui:emote', 'klap');
  }
  assert.equal(ws.sent.filter((m) => m.t === 'emote').length, EMOTE.perMatch, 'a handful a match');
  assert.equal(duel.emoteState().spent, true);
  // theirs: shown, unless muted; an unknown one never
  ws.hear({ t: 'emote', e: 'koel' });
  assert.deepEqual(shown.at(-1), { side: 'them', emoji: EMOTES.koel });
  ws.hear({ t: 'emote', e: '<b>' });
  assert.deepEqual(shown.at(-1), { side: 'them', emoji: EMOTES.koel });
  bus.emit('ui:emote-mute');
  const n = shown.length;
  ws.hear({ t: 'emote', e: 'oeps' });
  assert.equal(shown.length, n, 'muted');
});
