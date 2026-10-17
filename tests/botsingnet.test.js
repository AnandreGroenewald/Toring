// (1.18) Blokbotsing between two players: the room's connection (js/slagNet.js). The friend leaving must always reach
// the game, however many times it asked for messages before (code review 18 Oct 2026: a waiter left over from the
// start swallowed the room's only 'gone', and the other phone waited for ever).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlagNet } from '../js/slagNet.js';

/** A WebSocket stand-in: `serverSays(obj)` delivers a message, `drop()` closes it from the far end. */
function fakeWs() {
  const made = [];
  class WS {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.listeners = {};
      made.push(this);
      setTimeout(() => { this.readyState = 1; for (const f of this.listeners.open || []) f(); }, 0);
    }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    send(s) { this.sent.push(JSON.parse(s)); }
    close() { this.readyState = 3; setTimeout(() => this.onclose?.({}), 0); }
    serverSays(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
    drop() { this.readyState = 3; this.onclose?.({}); }
  }
  return { WS, made };
}
const tick = () => new Promise((r) => setTimeout(r, 2));
/** `p`, or a failure after `ms` (a promise that never settles is the bug these tests are about). */
function within(p, ms, what) {
  let t;
  return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error(what)), ms); })]).finally(() => clearTimeout(t));
}

test('the friend leaving reaches the game after the start had waited for "ready or gone"', async () => {
  const { WS, made } = fakeWs();
  const conn = createSlagNet({ api: 'http://x', WS }).connect('ABC123');
  await tick();
  const ws = made[0];
  ws.serverSays({ t: 'seat', seat: 0 });
  ws.serverSays({ t: 'ready' });
  // (the start's way before the fix: a waiter for 'gone' that is never used again stays behind)
  const first = await within(Promise.race([conn.ready, conn.next(['gone'])]), 2000, 'no start');
  assert.equal(first, true);
  assert.equal(await within(Promise.race([conn.ready, conn.gone]), 2000, 'no start'), true);
  // the game's loop: every move, until the friend is gone
  const got = [];
  const loop = (async () => {
    for (;;) {
      const m = await conn.next(['pick', 'build', 'throw', 'done', 'bye']);
      got.push(m.t);
      if (m.t === 'gone' || m.t === 'bye') return;
    }
  })();
  ws.serverSays({ t: 'pick', i: 1, n: 1 });
  ws.serverSays({ t: 'build', i: 1, n: 1 });
  await tick();
  ws.serverSays({ t: 'gone' });
  await within(loop, 2000, 'the loop never heard the friend go');
  assert.deepEqual(got, ['pick', 'build', 'gone']);
});

test('gone stays gone: every waiter hears it, and so does anyone who asks later, after what came before', async () => {
  const { WS, made } = fakeWs();
  const conn = createSlagNet({ api: 'http://x', WS }).connect('ABC123');
  await tick();
  const ws = made[0];
  const a = conn.next(['hello']);
  const b = conn.next(['done']);
  ws.serverSays({ t: 'pick', i: 0, n: 1 });   // (nobody waits for it: it waits in the queue)
  ws.drop();
  assert.deepEqual(await within(a, 2000, 'a waiter never heard'), { t: 'gone' });
  assert.deepEqual(await within(b, 2000, 'a second waiter never heard'), { t: 'gone' });
  assert.deepEqual(await within(conn.next(['pick']), 2000, 'the queue lost a message'), { t: 'pick', i: 0, n: 1 });   // (what came before 'gone' first)
  assert.deepEqual(await within(conn.next(['pick']), 2000, 'a later ask never heard'), { t: 'gone' });
  assert.deepEqual(await within(conn.gone, 2000, 'no gone promise'), { t: 'gone' });
});

test('a message for nobody yet waits for the one who asks for it', async () => {
  const { WS, made } = fakeWs();
  const conn = createSlagNet({ api: 'http://x', WS }).connect('ABC123');
  await tick();
  made[0].serverSays({ t: 'hello', name: 'Marietjie' });
  assert.deepEqual(await conn.next(['hello']), { t: 'hello', name: 'Marietjie' });
  conn.send({ t: 'pick', i: 2 });
  assert.deepEqual(made[0].sent, [{ t: 'pick', i: 2 }]);
});
