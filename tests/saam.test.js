// (1.21) Saam gly: two players on one river. The messages are checked and clamped (the friend's game is not trusted);
// the maker starts each round once the friend said hello; both count only when both rivers are up; "again" from both
// starts the next round; (1.21.2) a phone that drops (WhatsApp, a call) is only away: back, both say again where they
// stand; "bye" or a long absence ends it. The room connection comes back by itself and takes its own seat again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDuelMsg, duelWinner, duelSeed, createRiverDuel, DUEL_V } from '../js/rivier/duel.js';
import { connectSaam, seekSaam, saamKey, FAIL_MS } from '../js/rivier/saamNet.js';

test('a friend’s message is cleaned: numbers clamped, unknown kinds and bad seeds dropped', () => {
  assert.deepEqual(cleanDuelMsg({ t: 'st', n: 0, d: 120.5, x: 99, y: -3, k: 2, l: -7, h: 2.9 }), { t: 'st', n: 0, d: 120.5, x: 8, a: NaN, y: 0, k: 1, l: -1, h: 2 });
  // (1.21.4: the lane it glides to, clamped; an older phone sends none)
  assert.equal(cleanDuelMsg({ t: 'st', n: 0, d: 1, x: 0, a: -3.4 }).a, -3.4);
  assert.equal(cleanDuelMsg({ t: 'st', n: 0, d: 1, x: 0, a: 50 }).a, 8);
  assert.ok(Number.isNaN(cleanDuelMsg({ t: 'st', n: 0, d: 1, x: 0, a: 'x' }).a));
  assert.equal(cleanDuelMsg({ t: 'st', n: -1, d: 1 }), null);
  assert.equal(cleanDuelMsg({ t: 'st', n: 0, d: NaN }).d, 0);
  assert.equal(cleanDuelMsg({ t: 'go', n: 0, seed: '../../evil' }), null);
  assert.equal(cleanDuelMsg({ t: 'boom' }), null);
  assert.equal(cleanDuelMsg(null), null);
  assert.deepEqual(cleanDuelMsg({ t: 'bye', x: 1 }), { t: 'bye' });
  const hi = cleanDuelMsg({ t: 'hi', v: 1, name: '<b>x</b>'.repeat(20), skin: 'goud' });
  assert.equal(hi.t, 'hi');
  assert.ok(hi.name.length <= 16 && !hi.name.includes('<'));
  assert.equal(cleanDuelMsg({ t: 'hi', skin: '"><img>' }).skin, 'kleur');
});

test('the seed is a river name both phones can ride; who rode further', () => {
  let i = 0;
  const s = duelSeed(() => (i++ % 31) / 31);
  assert.match(s, /^gly-[a-z0-9]{8}$/);
  assert.deepEqual(cleanDuelMsg({ t: 'go', n: 3, seed: s }), { t: 'go', n: 3, seed: s });
  assert.equal(duelWinner(900, 640), 'me');
  assert.equal(duelWinner(640, 900), 'them');
  assert.equal(duelWinner(640.2, 640), 'tie');
  assert.match(saamKey(), /^[a-z0-9]{16}$/);
});

/**
 * A room as the server keeps one, for two links: both in -> 'ready' to both; a link that drops -> 'meLost' to it and
 * 'away' to the other (what it sends meanwhile is lost); back -> 'meBack', then 'ready' to both.
 */
function room() {
  const links = [];
  const mk = () => {
    const fns = new Set();
    const L = {
      in: false,
      sent: [],
      on(fn) { fns.add(fn); },
      hear(m) { for (const f of [...fns]) f(m); },
      send(o) {
        L.sent.push(o);
        const other = links.find((x) => x !== L);
        if (L.in && other?.in) queueMicrotask(() => other.hear(JSON.parse(JSON.stringify(o))));
      },
      close() { L.in = false; L.closed = true; const other = links.find((x) => x !== L); if (other?.in) queueMicrotask(() => other.hear({ t: 'away' })); },
      enter() {
        L.in = true;
        const other = links.find((x) => x !== L);
        if (other?.in) queueMicrotask(() => { L.hear({ t: 'ready' }); other.hear({ t: 'ready' }); });
      },
      drop() {
        L.in = false;
        L.hear({ t: 'meLost' });
        const other = links.find((x) => x !== L);
        if (other?.in) queueMicrotask(() => other.hear({ t: 'away' }));
      },
      back() { L.hear({ t: 'meBack' }); L.enter(); },
    };
    links.push(L);
    return L;
  };
  return { a: mk(), b: mk() };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('a round: hello, the maker’s go, both ready, riding news, again from both; bye ends it', async () => {
  const { a, b } = room();
  const host = createRiverDuel(a, { host: true, name: 'Anandre', skin: 'goud' });
  const guest = createRiverDuel(b, { host: false, name: 'Marietjie' });
  const hev = [];
  const gev = [];
  host.onEvent((e) => { hev.push(e.t); if (e.t === 'hi') host.start(); });
  guest.onEvent((e) => gev.push(e.t));
  a.enter();
  b.enter();
  await tick();
  assert.equal(host.friend.name, 'Marietjie');
  assert.equal(guest.friend.name, 'Anandre');
  assert.ok(hev.includes('go') && gev.includes('go'));
  assert.equal(host.seed, guest.seed);
  const hm = [];
  const gm = [];
  host.onMsg((m) => hm.push(m));
  guest.onMsg((m) => gm.push(m));
  host.ready();
  await tick();
  assert.ok(!hm.some((m) => m.t === 'start'), 'the count waits for both rivers');
  guest.ready();
  await tick();
  assert.ok(hm.some((m) => m.t === 'start') && gm.some((m) => m.t === 'start'));
  guest.send({ t: 'st', d: 40, x: 3.4, y: 0, k: 0, l: 0, h: 3 });
  guest.send({ t: 'end', m: 412 });
  await tick();
  assert.deepEqual(hm.filter((m) => m.t === 'st' || m.t === 'end').map((m) => m.t), ['st', 'end']);
  guest.again();
  await tick();
  assert.equal(host.round, 0);
  host.again();
  await tick();
  assert.equal(host.round, 1);
  assert.equal(guest.round, 1);
  assert.equal(host.seed, guest.seed);
  // (an old round's news is not this round's)
  b.send({ t: 'st', n: 0, d: 5, x: 0, y: 0, k: 0, l: 0, h: 3 });
  await tick();
  assert.equal(hm.filter((m) => m.t === 'st').length, 1);
  // Klaar: the friend hears it's for good
  guest.close();
  await tick();
  assert.equal(hm.filter((m) => m.t === 'gone').length, 1);
  assert.ok(host.gone);
});

test('the host goes to WhatsApp before the friend is in: back, they meet and the round starts', async () => {
  const { a, b } = room();
  const host = createRiverDuel(a, { host: true, name: 'Anandre' });
  const guest = createRiverDuel(b, { host: false, name: 'Vrou' });
  host.onEvent((e) => { if (e.t === 'hi') host.start(); });
  a.enter();
  a.drop();          // (the share sheet: the phone leaves the game)
  b.enter();         // (the friend opens the link meanwhile)
  await tick();
  assert.equal(guest.round, -1, 'nothing yet');
  a.back();
  await tick();
  assert.equal(guest.friend.name, 'Anandre');
  assert.equal(guest.round, 0, 'the round started once both were in');
  assert.ok(!host.gone && !guest.gone);
});

test('a phone that drops mid-round is away, then back: both say where they stand again; nothing is lost', async () => {
  const { a, b } = room();
  const host = createRiverDuel(a, { host: true, name: 'A' });
  const guest = createRiverDuel(b, { host: false, name: 'B' });
  host.onEvent((e) => { if (e.t === 'hi') host.start(); });
  a.enter();
  b.enter();
  await tick();
  const hm = [];
  const gm = [];
  host.onMsg((m) => hm.push(m.t));
  guest.onMsg((m) => gm.push(m.t));
  host.ready();
  b.drop();
  guest.ready();      // (said while away: lost)
  guest.send({ t: 'end', m: 300 });   // (lost too)
  await tick();
  assert.ok(hm.includes('away'));
  assert.ok(!hm.includes('start'));
  b.back();
  await tick();
  assert.ok(hm.includes('here'), 'the friend is back');
  assert.ok(hm.includes('start') && gm.includes('start'), 'the ready said again: both count');
  assert.ok(hm.includes('end'), 'the end said again');
  assert.ok(gm.includes('meLost') && gm.includes('meBack'));
});

test('a friend away too long is gone for good', async () => {
  const { a, b } = room();
  const host = createRiverDuel(a, { host: true, name: 'A', awayMs: 30 });
  createRiverDuel(b, { host: false, name: 'B' });
  host.onEvent((e) => { if (e.t === 'hi') host.start(); });
  a.enter();
  b.enter();
  await tick();
  b.drop();
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(host.gone);
});

test('only the maker starts a round', async () => {
  const { a, b } = room();
  const host = createRiverDuel(a, { host: true, name: 'A' });
  const guest = createRiverDuel(b, { host: false, name: 'B' });
  a.enter();
  b.enter();
  await tick();
  guest.start();
  b.send({ t: 'go', n: 0, seed: 'gly-abcdefgh' });   // (a guest's game can't make the host ride its river)
  await tick();
  assert.equal(host.round, -1);
});

// ---------------------------------------------------------------- the connection, with a stand-in socket
function fakeWS() {
  const made = [];
  class WS {
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; made.push(this); }
    send(s) { this.sent.push(JSON.parse(s)); }
    close() { this.readyState = 3; }
    hear(o) { this.onmessage?.({ data: JSON.stringify(o) }); }
    die() { this.readyState = 3; this.onclose?.(); }
  }
  return { WS, made };
}
function fakeDoc() {
  const fns = [];
  return { visibilityState: 'visible', addEventListener: (t, f) => fns.push(f), removeEventListener() {}, set(v) { this.visibilityState = v; for (const f of fns) f(); } };
}
function fakeTimers() {
  let now = 0;
  let id = 0;
  const q = new Map();
  return {
    now: () => now,
    setTimeout(f, ms) { q.set(++id, { f, at: now + ms }); return id; },
    clearTimeout(i) { q.delete(i); },
    run(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...q].filter(([, v]) => v.at <= end).sort((x, y) => x[1].at - y[1].at)[0];
        if (!next) break;
        q.delete(next[0]);
        now = next[1].at;
        next[1].f();
      }
      now = end;
    },
  };
}

test('the connection: its key on the address; the friend dropping is away; ours dropping comes back by itself', () => {
  const { WS, made } = fakeWS();
  const doc = fakeDoc();
  const tm = fakeTimers();
  const c = connectSaam('ABC234', { api: 'https://x.test', WS, doc, now: tm.now, timers: tm, key: 'k1k1k1k1k1k1k1k1' });
  const got = [];
  c.on((m) => got.push(m.t));
  assert.equal(made[0].url, 'wss://x.test/slag/room/ABC234?k=k1k1k1k1k1k1k1k1');
  made[0].hear({ t: 'seat', seat: 0 });
  made[0].hear({ t: 'ready' });
  made[0].hear({ t: 'gone' });   // (the friend's socket went)
  assert.deepEqual(got, ['ready', 'away']);
  made[0].die();                 // (ours went: WhatsApp)
  assert.equal(got.at(-1), 'meLost');
  tm.run(400);
  assert.equal(made.length, 2, 'it tries again by itself');
  made[1].hear({ t: 'seat', seat: 0 });
  assert.equal(got.at(-1), 'meBack');
  assert.ok(c.send({ t: 'hi' }));
  assert.deepEqual(made[1].sent, [{ t: 'hi' }]);
});

test('the connection: hidden it waits; back on the screen after a while a fresh socket (the old one may be dead)', () => {
  const { WS, made } = fakeWS();
  const doc = fakeDoc();
  const tm = fakeTimers();
  connectSaam('ABC234', { WS, doc, now: tm.now, timers: tm });
  made[0].hear({ t: 'seat', seat: 1 });
  doc.set('hidden');
  tm.run(10000);
  doc.set('visible');
  assert.equal(made.length, 2, 'a fresh socket on return');
  tm.run(2000);
  assert.equal(made[0].readyState, 3, 'the old one let go');
  // our socket dies while hidden: nothing until the screen is back
  made[1].hear({ t: 'seat', seat: 1 });
  doc.set('hidden');
  made[1].die();
  tm.run(30000);
  assert.equal(made.length, 2);
  doc.set('visible');
  assert.equal(made.length, 3);
});

test('the connection: no such room (never in) fails at once; never back in FAIL_MS fails', () => {
  const { WS, made } = fakeWS();
  const tm = fakeTimers();
  const c = connectSaam('NOPE23', { WS, doc: fakeDoc(), now: tm.now, timers: tm });
  const got = [];
  c.on((m) => got.push(m.t));
  made[0].hear({ t: 'gone' });
  assert.deepEqual(got, ['fail']);
  const w2 = fakeWS();
  const tm2 = fakeTimers();
  const c2 = connectSaam('ABC234', { WS: w2.WS, doc: fakeDoc(), now: tm2.now, timers: tm2 });
  const got2 = [];
  c2.on((m) => got2.push(m.t));
  w2.made[0].hear({ t: 'seat', seat: 0 });
  w2.made[0].die();
  for (let k = 0; k < 60 && !got2.includes('fail'); k++) {
    tm2.run(4000);
    w2.made.at(-1).die?.();
  }
  assert.ok(got2.includes('fail'), 'gone for good after FAIL_MS out');
  assert.ok(tm2.now() >= FAIL_MS);
});

test('the lobby: waiting, then a match (its code checked, the name cleaned); a socket gone before a match fails', () => {
  const { WS, made } = fakeWS();
  const s = seekSaam({ api: 'http://h.test', name: 'Anandre', WS, key: 'abcd1234abcd1234' });
  const got = [];
  s.on((m) => got.push(m));
  assert.equal(made[0].url, 'ws://h.test/slag/seek?n=Anandre&k=abcd1234abcd1234');
  made[0].hear({ t: 'wait', n: 1 });
  made[0].hear({ t: 'match', code: 'bad code', host: true, name: 'x' });
  made[0].hear({ t: 'match', code: 'QRS234', host: false, name: '<i>Vrou' });
  assert.deepEqual(got[0], { t: 'wait', n: 1 });
  assert.equal(got.length, 2);
  assert.equal(got[1].code, 'QRS234');
  assert.equal(got[1].host, false);
  assert.ok(!got[1].name.includes('<'));
  const w2 = fakeWS();
  const s2 = seekSaam({ WS: w2.WS });
  const got2 = [];
  s2.on((m) => got2.push(m.t));
  w2.made[0].die();
  assert.deepEqual(got2, ['fail']);
});

test('a friend on another version (another river) ends the room at once: bye to them, "version" to us', async () => {
  // (28 Oct 2026: 3 = the river with its waterfalls; an older phone would ride a different river)
  const { a, b } = room();
  const events = [];
  const da = createRiverDuel(a, { host: true, name: 'Nuut' });
  da.onEvent((e) => events.push(e));
  a.enter();
  b.enter();
  await tick();
  b.send({ t: 'hi', v: DUEL_V - 1, name: 'Oud', skin: 'kleur' });
  await tick();
  assert.ok(a.sent.some((m) => m.t === 'bye'), 'the older phone hears bye');
  assert.ok(events.some((e) => e.t === 'gone' && e.why === 'version'), 'ours hears why');
  assert.equal(da.friend, null, 'no friend made');
  assert.ok(!a.sent.some((m) => m.t === 'go'), 'no round started');
  // (the same version: the round starts as ever)
  const r2 = room();
  const d1 = createRiverDuel(r2.a, { host: true, name: 'A' });
  const d2 = createRiverDuel(r2.b, { host: false, name: 'B' });
  d1.onEvent((e) => { if (e.t === 'hi') d1.start(); });
  r2.a.enter();
  r2.b.enter();
  await tick(); await tick(); await tick();
  assert.ok(d1.friend && d2.friend && d1.round === 0 && d2.round === 0, 'same version: in, round 0');
});
