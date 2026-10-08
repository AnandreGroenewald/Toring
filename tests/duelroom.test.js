// A friend room on the device (js/duel.js): the host shares the link from another app, so the game
// goes to the background and its connection may drop. The room must survive that: the game comes
// back to the same room (and keeps it closed while hidden, so a match never starts unseen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bus } from '../js/core/bus.js';
import { createDuel } from '../js/duel.js';
import { S } from '../js/core/strings.js';
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
  drop() {   // the network (or the phone) closed it
    this.readyState = 3;
    this.onclose?.();
  }
}

function setup() {
  sockets.length = 0;
  const timers = fakeTimers();
  const calls = [];
  const duel = createDuel({
    bus: new Bus(),
    apiUrl: 'https://borge.example',
    nickname: () => 'Anna',
    WebSocketImpl: FakeSocket,
    fetchImpl: async () => ({ ok: true, json: async () => ({ code: 'ABCD23' }) }),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    now: timers.now,
  });
  const cb = {
    onCode: (c) => calls.push(['code', c]),
    onWait: () => calls.push(['wait']),
    onRetry: () => calls.push(['retry']),
    onStart: (m) => calls.push(['start', m.oppName]),
    onFail: (msg) => calls.push(['fail', msg]),
  };
  return { duel, timers, calls, cb };
}

const SEED = 'abcdef12';

test('a dropped wait comes back to the same room, and the match starts there', async () => {
  const { duel, timers, calls, cb } = setup();
  await duel.createRoom(cb);
  assert.equal(sockets.length, 1);
  assert.match(sockets[0].url, /\/match\/room\/ABCD23$/);
  sockets[0].open();
  assert.equal(sockets[0].sent[0].t, 'hello');
  sockets[0].hear({ t: 'wait' });
  sockets[0].drop();   // WhatsApp is open; the connection went
  assert.deepEqual(calls.slice(-1), [['retry']], 'not a failure');
  assert.equal(sockets.length, 1, 'waits a moment first');
  timers.advance(1000);
  assert.equal(sockets.length, 2);
  assert.equal(sockets[1].url, sockets[0].url, 'the same room');
  sockets[1].open();
  sockets[1].hear({ t: 'wait' });
  sockets[1].hear({ t: 'start', seed: SEED, you: 1, opp: { name: 'Bennie' } });
  assert.deepEqual(calls.filter((c) => c[0] !== 'retry' && c[0] !== 'wait'), [['code', 'ABCD23'], ['start', 'Bennie']]);
  assert.ok(!calls.some((c) => c[0] === 'fail'));
});

test('hidden, the room lets go of its connection; back, it reconnects at once', async () => {
  const { duel, timers, calls, cb } = setup();
  await duel.createRoom(cb);
  sockets[0].open();
  sockets[0].hear({ t: 'wait' });
  duel.away();
  assert.equal(sockets[0].readyState, 3, 'closed while away: no match can start unseen');
  timers.advance(60000);
  assert.equal(sockets.length, 1, 'no reconnects while away');
  duel.back();
  assert.equal(sockets.length, 2, 'straight back in');
  sockets[1].open();
  sockets[1].hear({ t: 'wait' });
  sockets[1].hear({ t: 'start', seed: SEED, you: 0, opp: { name: 'Carla' } });
  assert.deepEqual(calls.at(-1), ['start', 'Carla']);
});

test('reconnects back off, and give up only when the room has had its time', async () => {
  const { duel, timers, calls, cb } = setup();
  await duel.createRoom(cb);
  sockets[0].open();
  sockets[0].hear({ t: 'wait' });
  sockets[0].drop();
  const waits = [];
  let last = sockets.length;
  for (let k = 0; k < 6; k++) {
    let ms = 0;
    while (sockets.length === last && ms < 20000) {
      timers.advance(250);
      ms += 250;
    }
    waits.push(ms);
    last = sockets.length;
    sockets.at(-1).drop();   // the server can't be reached
  }
  assert.deepEqual(waits, [1000, 2000, 4000, 8000, 8000, 8000]);
  timers.advance(DUEL.roomWaitMs);
  assert.deepEqual(calls.at(-1), ['fail', S.duelRoomGone]);
});

test('a room that was never reached, or is gone, fails as before (no retries)', async () => {
  let { duel, timers, calls, cb } = setup();
  await duel.createRoom(cb);
  sockets[0].drop();   // closed before the room answered
  assert.deepEqual(calls.at(-1), ['fail', S.duelNoServer]);
  timers.advance(10000);
  assert.equal(sockets.length, 1);

  ({ duel, timers, calls, cb } = setup());
  duel.joinRoom('ABCD23', cb);
  sockets[0].open();
  sockets[0].hear({ t: 'gone' });
  assert.deepEqual(calls.at(-1), ['fail', S.duelRoomGone]);
  timers.advance(10000);
  assert.equal(sockets.length, 1);
});

test('leaving the room (cancel) stops the reconnects', async () => {
  const { duel, timers, cb } = setup();
  await duel.createRoom(cb);
  sockets[0].open();
  sockets[0].hear({ t: 'wait' });
  sockets[0].drop();
  duel.cancel();
  timers.advance(20000);
  assert.equal(sockets.length, 1);
});

// ------------------------------------------------------------------ the random search (1.10): no time limit
function setupSearch() {
  sockets.length = 0;
  const timers = fakeTimers();
  const calls = [];
  const duel = createDuel({
    bus: new Bus(),
    apiUrl: 'https://borge.example',
    nickname: () => 'Anna',
    WebSocketImpl: FakeSocket,
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),   // no recordings: Robot Rikus
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    now: timers.now,
  });
  const cb = {
    onFound: (m) => calls.push(['found', m.oppName]),
    onFallback: (m) => calls.push(['fallback', m.kind]),
    onRetry: () => calls.push(['retry']),
  };
  return { duel, timers, calls, cb };
}

test('the search has no time limit: minutes later it is still looking (and pinging)', async () => {
  const { duel, timers, calls, cb } = setupSearch();
  duel.findOpponent(cb);
  assert.match(sockets[0].url, /\/match\/lobby$/);
  sockets[0].open();
  assert.equal(sockets[0].sent[0].t, 'hello');
  assert.equal(sockets[0].sent[0].rules, DUEL.rules, 'the lobby pairs the same rules');
  timers.advance(10 * 60 * 1000);
  assert.deepEqual(calls, [], 'no recording or Robot Rikus by itself');
  assert.equal(duel.searching, true);
  assert.ok(sockets[0].sent.some((m) => m.t === 'ping'), 'a quiet ping keeps the line open');
  // someone comes: the room, then the match
  sockets[0].hear({ t: 'match', room: 'ABCD23' });
  assert.equal(duel.searching, false);
  sockets[1].open();
  sockets[1].hear({ t: 'wait' });
  sockets[1].hear({ t: 'start', seed: 'abcdef12', you: 0, opp: { name: 'Bennie' } });
  assert.deepEqual(calls.at(-1), ['found', 'Bennie']);
});

test('a dropped search comes back; hidden it waits; "play now" gives Robot Rikus at once', async () => {
  const { duel, timers, calls, cb } = setupSearch();
  duel.findOpponent(cb);
  sockets[0].open();
  sockets[0].drop();
  assert.deepEqual(calls.at(-1), ['retry']);
  timers.advance(1000);
  assert.equal(sockets.length, 2, 'back in the lobby');
  sockets[1].open();
  duel.away();
  assert.equal(sockets[1].readyState, 3, 'closed while the game is hidden');
  timers.advance(60000);
  assert.equal(sockets.length, 2);
  duel.back();
  assert.equal(sockets.length, 3, 'looking again at once');
  duel.playNow();
  assert.equal(duel.searching, false);
  await new Promise((r) => setTimeout(r, 0));   // the recording request (none here)
  assert.deepEqual(calls.at(-1), ['fallback', 'bot']);
  timers.advance(60000);
  assert.equal(sockets.length, 3, 'no more lobby after playing now');
});
