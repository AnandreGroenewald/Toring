// (1.21) Saam gly: two friends on one river. The messages are checked and clamped (the friend's game is not trusted);
// the maker starts each round once the friend said hello; both count only when both rivers are up; "again" from both
// starts the next round; a friend gone is heard once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDuelMsg, duelWinner, duelSeed, createRiverDuel } from '../js/rivier/duel.js';

test('a friend’s message is cleaned: numbers clamped, unknown kinds and bad seeds dropped', () => {
  assert.deepEqual(cleanDuelMsg({ t: 'st', n: 0, d: 120.5, x: 99, y: -3, k: 2, l: -7, h: 2.9 }), { t: 'st', n: 0, d: 120.5, x: 8, y: 0, k: 1, l: -1, h: 2 });
  assert.equal(cleanDuelMsg({ t: 'st', n: -1, d: 1 }), null);
  assert.equal(cleanDuelMsg({ t: 'st', n: 0, d: NaN }).d, 0);
  assert.equal(cleanDuelMsg({ t: 'go', n: 0, seed: '../../evil' }), null);
  assert.equal(cleanDuelMsg({ t: 'boom' }), null);
  assert.equal(cleanDuelMsg(null), null);
  const hi = cleanDuelMsg({ t: 'hi', v: 1, name: '<b>x</b>'.repeat(20), skin: 'goud' });
  assert.equal(hi.t, 'hi');
  assert.ok(hi.name.length <= 16 && !hi.name.includes('<'));
  assert.equal(cleanDuelMsg({ t: 'hi', skin: '"><img>' }).skin, 'kleur');
});

test('the seed is a river name both phones can ride', () => {
  let i = 0;
  const s = duelSeed(() => (i++ % 31) / 31);
  assert.match(s, /^gly-[a-z0-9]{8}$/);
  assert.deepEqual(cleanDuelMsg({ t: 'go', n: 3, seed: s }), { t: 'go', n: 3, seed: s });
});

test('who rode further', () => {
  assert.equal(duelWinner(900, 640), 'me');
  assert.equal(duelWinner(640, 900), 'them');
  assert.equal(duelWinner(640.2, 640), 'tie');
});

/** Two connections joined like the room joins two seats: each send arrives at the other in order. */
function pair() {
  const mk = () => {
    const queue = [];
    const waiters = [];
    let gone = false;
    let readyOk;
    const c = {
      ready: new Promise((r) => { readyOk = r; }),
      sent: [],
      peer: null,
      deliver(m) {
        if (gone) return;
        const i = waiters.findIndex((w) => w.types.includes(m.t) || m.t === 'gone');
        if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
        else queue.push(m);
        if (m.t === 'gone') { gone = true; for (const w of waiters.splice(0)) w.resolve(m); }
      },
      send(o) { c.sent.push(o); queueMicrotask(() => c.peer?.deliver(JSON.parse(JSON.stringify(o)))); },
      next(types) {
        const i = queue.findIndex((m) => types.includes(m.t) || m.t === 'gone');
        if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
        if (gone) return Promise.resolve({ t: 'gone' });
        return new Promise((resolve) => waiters.push({ types, resolve }));
      },
      close() { queueMicrotask(() => c.peer?.deliver({ t: 'gone' })); gone = true; },
      open() { readyOk(true); },
    };
    return c;
  };
  const a = mk();
  const b = mk();
  a.peer = b;
  b.peer = a;
  return [a, b];
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('a round: hello, the maker’s go, both ready, riding news, again from both, gone', async () => {
  const [ca, cb] = pair();
  const host = createRiverDuel(ca, { host: true, name: 'Anandre', skin: 'goud' });
  const guest = createRiverDuel(cb, { host: false, name: 'Marietjie' });
  const hev = [];
  const gev = [];
  host.onEvent((e) => { hev.push(e.t); if (e.t === 'hi') host.start(); });
  guest.onEvent((e) => gev.push(e.t));
  ca.open();
  cb.open();
  await tick();
  assert.equal(host.friend.name, 'Marietjie');
  assert.equal(guest.friend.name, 'Anandre');
  assert.ok(hev.includes('go') && gev.includes('go'));
  assert.equal(host.seed, guest.seed);
  assert.equal(host.round, 0);
  // (the count waits for both rivers)
  const hm = [];
  const gm = [];
  host.onMsg((m) => hm.push(m));
  guest.onMsg((m) => gm.push(m));
  host.ready();
  await tick();
  assert.ok(!hm.some((m) => m.t === 'start'));
  guest.ready();
  await tick();
  assert.ok(hm.some((m) => m.t === 'start') && gm.some((m) => m.t === 'start'));
  guest.send({ t: 'st', d: 40, x: 3.4, y: 0, k: 0, l: 0, h: 3 });
  guest.send({ t: 'end', m: 412 });
  await tick();
  assert.deepEqual(hm.filter((m) => m.t !== 'start').map((m) => m.t), ['st', 'end']);
  assert.equal(hm.find((m) => m.t === 'end').m, 412);
  // (again: the round goes on once both said it)
  guest.again();
  await tick();
  assert.equal(host.round, 0);
  host.again();
  await tick();
  assert.equal(host.round, 1);
  assert.equal(guest.round, 1);
  assert.equal(host.seed, guest.seed);
  // (an old round's news is not this round's)
  cb.send({ t: 'st', n: 0, d: 5, x: 0, y: 0, k: 0, l: 0, h: 3 });
  await tick();
  assert.equal(hm.filter((m) => m.t === 'st').length, 1);
  // (the friend leaves: heard once)
  guest.close();
  await tick();
  assert.equal(hm.filter((m) => m.t === 'gone').length, 1);
  assert.ok(host.gone);
  const before = ca.sent.length;
  host.send({ t: 'st', d: 1, x: 0, y: 0, k: 0, l: 0, h: 3 });
  assert.equal(ca.sent.length, before, 'nothing goes into an empty room');
});

test('only the maker starts a round', async () => {
  const [ca, cb] = pair();
  const host = createRiverDuel(ca, { host: true, name: 'A' });
  const guest = createRiverDuel(cb, { host: false, name: 'B' });
  ca.open();
  cb.open();
  await tick();
  guest.start();
  cb.send({ t: 'go', n: 0, seed: 'gly-abcdefgh' });   // (a guest's game can't make the host ride its river)
  await tick();
  assert.equal(host.round, -1);
});
