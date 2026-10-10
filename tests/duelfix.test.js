// The Uitdagersreeks on the device (js/duel.js), the 1.12.1 fixes: a room asked for twice on a slow line
// (only the latest counts, nothing lingers), a recording that arrives after Kanselleer (let go), a lobby
// pairing whose other player never comes (back to the lobby), and a Wedloop match whose connection goes or
// that is decided during the 3-2-1 (it ends, and a dropped one doesn't count).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bus } from '../js/core/bus.js';
import { createDuel } from '../js/duel.js';

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
      t += ms;
      for (const [k, d] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (d.at <= t && due.has(k)) {
          due.delete(k);
          d.fn();
        }
      }
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
}

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const open = () => sockets.filter((s) => s.readyState === 1);

function setup(fetchImpl) {
  sockets.length = 0;
  const timers = fakeTimers();
  const bus = new Bus();
  const ends = [];
  bus.on('duel:end', (e) => ends.push(e.outcome));
  const duel = createDuel({
    bus, apiUrl: 'https://borge.example', nickname: () => 'Anna', WebSocketImpl: FakeSocket, fetchImpl,
    setTimer: timers.setTimer, clearTimer: timers.clearTimer, now: timers.now,
  });
  return { duel, timers, bus, ends };
}

test('"Daag \'n vriend uit" tapped twice on a slow line: only the second room counts, in either order, nothing lingers', async () => {
  for (const order of [['second', 'first'], ['first', 'second']]) {
    const answers = { first: deferred(), second: deferred() };
    const queue = [answers.first, answers.second];
    const { duel } = setup(() => queue.shift().promise);
    const codes = [];
    const cb = { onCode: (c) => codes.push(c) };
    const one = duel.createRoom(cb);
    const two = duel.createRoom(cb);
    const reply = (code) => ({ ok: true, json: async () => ({ code }) });
    for (const k of order) {
      answers[k].resolve(reply(k === 'first' ? 'AAAA22' : 'BBBB33'));
      await flush();
    }
    await Promise.all([one, two]);
    assert.deepEqual(codes, ['BBBB33'], `${order}: the link shown is the second room's`);
    assert.equal(open().length, 1, `${order}: one connection`);
    assert.match(open()[0].url, /BBBB33$/);
  }
});

test('a recording that arrives after Kanselleer (and a match against Robot Rikus) is let go', async () => {
  const ghost = deferred();
  const { duel } = setup(() => ghost.promise);
  const found = [];
  duel.findOpponent({ onFallback: (m) => found.push(m.kind) });
  duel.playNow();          // "Speel dadelik": asks the server for a recording
  duel.cancel();           // Kanselleer
  const bot = duel.startBot();   // "Speel teen die rekenaar"
  ghost.resolve({ ok: true, json: async () => ({ payload: 'whatever' }) });
  await flush();
  await flush();
  assert.equal(duel.match, bot, 'still the match against Robot Rikus');
  assert.deepEqual(found, [], 'the late recording started nothing');
});

test('the lobby pairs us, but the other player never comes: back to the lobby after 20 s', () => {
  const { duel, timers } = setup(async () => ({ ok: false }));
  duel.findOpponent({ onFound: () => {} });
  const lobby = sockets.at(-1);
  lobby.open();
  lobby.hear({ t: 'match', room: 'CCCC44' });
  const room = sockets.at(-1);
  assert.match(room.url, /CCCC44$/);
  room.open();
  room.hear({ t: 'wait' });
  timers.advance(19000);
  assert.equal(room.readyState, 1, 'still waiting');
  timers.advance(1500);
  assert.equal(room.readyState, 3, 'that room is left');
  assert.match(sockets.at(-1).url, /\/match\/lobby$/, 'looking again');
});

function liveRace() {
  const env = setup(async () => ({ ok: true, json: async () => ({ code: 'DDDD55' }) }));
  return env;
}

test('Wedloop: the connection goes during the match: it ends at once and does not count', async () => {
  const { duel, bus, ends } = liveRace();
  let m = null;
  await duel.createRoom({ onStart: (x) => { m = x; } });
  const room = sockets.at(-1);
  room.open();
  room.hear({ t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie' } });
  assert.ok(m);
  bus.emit('duel:ready');   // the match scene is up
  room.drop();
  assert.deepEqual(ends, ['none'], 'the tower stops');
  assert.equal(duel.summary().outcome, 'none', "the results say it doesn't count");
});

test('Wedloop: decided during the 3-2-1 (the other player left): it ends the moment the scene is up', async () => {
  const { duel, bus } = liveRace();
  await duel.createRoom({ onStart: () => {} });
  const room = sockets.at(-1);
  room.open();
  room.hear({ t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie' } });
  room.hear({ t: 'result', winner: 0, reason: 'left' });
  // the scene only listens once it is up (as GameScene does): what was said before it existed must come again
  const seen = [];
  bus.on('duel:end', (e) => seen.push(e.outcome));
  bus.emit('duel:ready');
  assert.deepEqual(seen, ['won']);
  assert.equal(duel.summary().outcome, 'won');
});

test('Wedloop: the connection goes during the 3-2-1: it ends (not counted) the moment the scene is up', async () => {
  const { duel, bus, ends } = liveRace();
  await duel.createRoom({ onStart: () => {} });
  const room = sockets.at(-1);
  room.open();
  room.hear({ t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie' } });
  room.drop();
  assert.deepEqual(ends, [], 'no scene yet');
  bus.emit('duel:ready');
  assert.deepEqual(ends, ['none']);
});
