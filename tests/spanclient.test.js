// (1.20) Ons dorp on the phone (js/span.js): a Daily gives a build turn (two can wait) and today's ride (once); the ride's
// people (yours first, strays after); rescued people move in and pay; a turn's floors join the tower; a new week turns the
// tower into a monument and starts again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpan } from '../js/span.js';
import { memoryBackend } from '../js/core/storage.js';
import { SPAN } from '../js/core/span.js';

const CAST = ['boer', 'haai', 'bytjie', 'klippie', 'rissie', 'seekat', 'braai', 'duiker', 'madelief', 'draakie', 'brandweer', 'vuurhoutjie'];
function make(day = { v: '2026-10-27' }, backend = memoryBackend()) {
  const coins = { n: 0 };
  const s = createSpan({ backend, castIds: CAST, earn: (n) => { coins.n += n; return n; }, today: () => day.v });
  return { s, coins, day, backend };
}
const plank = (y, q = 'G') => ({ s: 'plank', k: 1, c: 1, x: 0, y, r: 0, q, p: 1 });

test('span client: a Daily gives a turn and today\'s ride; a second Daily the same day gives neither again', () => {
  const { s } = make();
  assert.equal(s.view().turns, 0);
  assert.equal(s.ride(), null);
  s.dailyDone('2026-10-27', 40, ['haai', 'boer', 'nobody']);
  const v = s.view();
  assert.equal(v.turns, 1);
  assert.equal(v.rideToday, true);
  s.dailyDone('2026-10-27', 55, []);
  assert.equal(s.view().turns, 1, 'one turn a day');
  assert.equal(s.view().metres, 55, 'the day\'s best height counts');
  const r = s.ride();
  assert.deepEqual(r.who.slice(0, 0), []);
  assert.ok(r.who.length >= 6 && r.who.length <= 12);
  assert.equal(new Set(r.who).size, r.who.length, 'nobody twice');
});

test('span client: who fell is on the ride first; rescued people move in and pay a coin each; the ride is once', async () => {
  const { s, coins } = make();
  s.dailyDone('2026-10-27', 40, ['haai', 'boer', 'haai', 'nobody']);
  const r = s.ride();
  assert.deepEqual(r.who.slice(0, 2), ['haai', 'boer']);
  assert.equal(r.mine, 2);
  const out = await s.rideDone('2026-10-27', ['haai', 'bytjie', 'boer']);
  assert.equal(out.coins, 3 * SPAN.coinsPerRescue);
  assert.equal(coins.n, 3);
  assert.equal(s.view().people, 3);
  assert.equal(s.ride(), null);
  assert.equal((await s.rideDone('2026-10-27', ['seekat'])).coins, 0, 'no second ride');
  assert.equal(s.view().rodeToday, true);
});

test('span client: a turn\'s floors join the tower; two turns wait at most; the turn is used', async () => {
  const { s, day } = make();
  s.dailyDone('2026-10-27', 40, []);
  day.v = '2026-10-28';
  s.dailyDone('2026-10-28', 40, []);
  day.v = '2026-10-29';
  s.dailyDone('2026-10-29', 40, []);
  assert.equal(s.view().turns, SPAN.turnsMax, 'a third Daily while two wait gives none');
  const t = await s.turn('2026-10-29');
  assert.equal(t.blocks, SPAN.turnBlocks);
  const out = await s.turnDone([plank(0, 'P'), plank(1.6)], { skin: 'goud' });
  assert.equal(out.added, 2);
  assert.equal(out.heightM, 3.2);
  assert.equal(out.gain, 3.2);
  const v = s.view();
  assert.equal(v.turns, 1);
  assert.equal(v.floors.length, 2);
  assert.equal(v.floors[0].sk, 'goud');
  assert.equal(v.people, 2, 'the floors\' people count in the town');
  assert.equal((await s.turnDone([{ s: 'house' }])).added, 0, 'nonsense adds nothing (the turn is still used)');
  assert.equal(await s.turnDone([plank(3.2)]), null, 'no turn left');
});

test('span client: Sunday gives no turn; a new week makes last week\'s tower a monument and starts again', async () => {
  const { s, day, backend } = make({ v: '2026-11-01' });   // a Sunday
  s.dailyDone('2026-11-01', 40, []);
  assert.equal(s.view().turns, 0);
  day.v = '2026-10-30';
  const b2 = make({ v: '2026-10-30' }, backend);
  b2.s.dailyDone('2026-10-30', 30, []);
  await b2.s.turnDone([plank(0), plank(1.6)]);
  b2.day.v = '2026-11-02';   // the next Monday
  const v = b2.s.view();
  assert.equal(v.week, '2026-11-02');
  assert.equal(v.floors.length, 0);
  assert.equal(v.monuments[0].week, '2026-10-26');
  assert.equal(v.monuments[0].h, 3.2);
  assert.equal(v.turns, 0);
});

test('span client: a debug session keeps its own week', () => {
  const backend = memoryBackend();
  const a = createSpan({ backend, castIds: CAST, today: () => '2026-10-27' });
  const b = createSpan({ backend, debug: true, castIds: CAST, today: () => '2026-10-27' });
  b.dailyDone('2026-10-27', 40, []);
  assert.equal(b.view().turns, 1);
  assert.equal(a.view().turns, 0);
});

// ------------------------------------------------------------------------------------------- the phone and the server
import { createSpanServer } from '../server/src/span.js';
import { sastAt } from '../js/core/span.js';

/** The phone's client talking to the real server code in memory (its fetch goes straight to the handler). */
function online(clock, store, dayKey, name) {
  const srv = store.srv || (store.srv = createSpanServer({ get: async (k) => (store.data.has(k) ? structuredClone(store.data.get(k)) : undefined), put: async (k, v) => { store.data.set(k, structuredClone(v)); } }, { now: () => clock.t }));
  const fetchImpl = async (url, o = {}) => {
    const path = new URL(url).pathname;
    if (path === '/') return { status: 200, json: async () => ({ ok: true, span: 1 }) };
    const [status, out] = await srv.handle(o.method || 'GET', path, o.body ? JSON.parse(o.body) : null);
    return { status, json: async () => out };
  };
  const coins = { n: 0 };
  const s = createSpan({ backend: memoryBackend(), castIds: CAST, earn: (n) => { coins.n += n; return n; }, today: () => dayKey.v, api: () => 'http://srv', who: () => ({ name, skin: 'goud' }), fetchImpl });
  return { s, coins };
}

test('span client + server: two phones in one crew build one Weektoring; Saturday\'s prize lands in the wallet', async () => {
  const clock = { t: sastAt('2026-10-28', 9) };
  const store = { data: new Map() };
  const dayKey = { v: '2026-10-28' };
  const a = online(clock, store, dayKey, 'Anna');
  const b = online(clock, store, dayKey, 'Ben');
  assert.equal(await a.s.start(), true);
  assert.equal(await b.s.start(), true);
  assert.equal(a.s.view().online, true);
  const made = await a.s.make('Die Bouers');
  assert.equal(made.crew.name, 'Die Bouers');
  const joined = await b.s.join(made.crew.invite);
  assert.equal(joined.crew.members.length, 2);
  // the week's Dailies (Mon-Wed) on both phones: a turn each, both with a ticket
  for (const ph of [a, b]) {
    ph.s.debugSet({ days: { '2026-10-26': 50, '2026-10-27': 50 } });
    ph.s.dailyDone('2026-10-28', 50, ['boer']);
    await ph.s.sync();
  }
  assert.equal(a.s.view().turns, 2);
  assert.equal(a.s.view().ticket, true);
  // Anna has the crane: Ben is told who
  const ta = await a.s.turn();
  assert.ok(ta.lease);
  const tb = await b.s.turn();
  assert.equal(tb.error, 'busy');
  assert.equal(tb.by, 'Anna');
  const da = await a.s.turnDone([plank(0, 'P'), plank(1.6), plank(3.2)], { lease: ta.lease });
  assert.equal(da.added, 3);
  assert.equal(da.heightM, 4.8);
  const tb2 = await b.s.turn();
  const db = await b.s.turnDone([plank(4.8)], { lease: tb2.lease });
  assert.equal(db.heightM, 6.4);
  await a.s.sync();
  const va = a.s.view();
  assert.equal(va.floors.length, 4, 'both phones see one tower');
  assert.equal(va.crew.members.length, 2);
  assert.equal(va.floors[0].sk, 'goud');
  // the ride: rescued people go to the crew
  const r = a.s.ride('2026-10-28');
  assert.equal(r.who[0], 'boer');
  await a.s.rideDone('2026-10-28', ['boer', 'haai']);
  await b.s.sync();
  assert.equal(b.s.view().people >= 2, true);
  // Saturday: a river (with Rikus); after the whistle, the prize in both wallets, once
  clock.t = sastAt('2026-10-31', 9);
  dayKey.v = '2026-10-31';
  await a.s.sync();
  const v = a.s.view();
  assert.equal(v.phase, 'uitdaging');
  assert.equal(v.river.rows.length, 4);
  clock.t = sastAt('2026-10-31', 21, 5);
  await a.s.sync();
  await b.s.sync();
  assert.ok(a.coins.n > 0 && b.coins.n > 0, 'the prize');
  const before = a.coins.n;
  await a.s.sync();
  assert.equal(a.coins.n, before, 'once');
});

test('span client + server: a bombed crew repairs with its blocks; Saturday noon shuts the crane for turns', async () => {
  const clock = { t: sastAt('2026-10-28', 9) };
  const store = { data: new Map() };
  const dayKey = { v: '2026-10-28' };
  const a = online(clock, store, dayKey, 'Anna');
  const b = online(clock, store, dayKey, 'Ben');
  await a.s.start();
  await b.s.start();
  for (const ph of [a, b]) {
    ph.s.debugSet({ days: { '2026-10-26': 60, '2026-10-27': 60 } });
    ph.s.dailyDone('2026-10-28', 60, []);
    await ph.s.sync();
  }
  // Anna's crew builds tall; Ben's a little
  for (let k = 0; k < 2; k++) {
    const ta = await a.s.turn();
    await a.s.turnDone(Array.from({ length: 10 }, (_, i) => plank((k * 10 + i) * 1.6)), { lease: ta.lease });
  }
  const tb = await b.s.turn();
  await b.s.turnDone([plank(0)], { lease: tb.lease });
  // Saturday morning: Ben bombs the tallest (Anna's); her crew gets a repair block
  clock.t = sastAt('2026-10-31', 9);
  dayKey.v = '2026-10-31';
  await a.s.sync();
  await b.s.sync();
  const target = b.s.view().river.leader;
  assert.equal(target, a.s.view().crew.id);
  const hitR = await b.s.bomb(target, [{ x: 0, y: 0.8 }]);
  assert.ok(!hitR.error, hitR.error);
  assert.equal(hitR.hits[0].lost, 3.2, 'the blast took two planks');
  await a.s.sync();
  const va = a.s.view();
  assert.ok(va.repair >= 1, 'a repair block for each hit (Rikus may have thrown one too)');
  assert.ok(va.heightM <= 32 - 3.2);
  assert.equal(va.craneShut, false);
  // the repair turn: its blocks, then none left
  const tr = await a.s.turn(dayKey.v, { repair: true });
  assert.equal(tr.blocks, va.repair);
  assert.equal(tr.repair, true);
  const h0 = va.heightM;
  const dr = await a.s.turnDone(Array.from({ length: tr.blocks }, (_, i) => plank(h0 + i * 1.6)), { lease: tr.lease });
  assert.equal(dr.heightM, Math.round((h0 + tr.blocks * 1.6) * 10) / 10);
  assert.equal((await a.s.turn(dayKey.v, { repair: true })).error, 'norepair');
  // noon: no more build turns (the server says; the view hides them), repairs would still go
  clock.t = sastAt('2026-10-31', 12, 5);
  await a.s.sync();
  assert.equal(a.s.view().craneShut, true);
  assert.equal(a.s.view().turns, 0);
  assert.equal((await a.s.turn()).error, 'crane');
});

test('span client + server: a turn\'s floors wait on the phone without a connection and go up with the next sync', async () => {
  const clock = { t: sastAt('2026-10-28', 9) };
  const store = { data: new Map() };
  const dayKey = { v: '2026-10-28' };
  const a = online(clock, store, dayKey, 'Anna');
  await a.s.start();
  a.s.dailyDone('2026-10-28', 50, []);
  await a.s.sync();
  const tt = await a.s.turn();
  assert.ok(tt.lease);
  // the connection drops right at the end of the turn
  const srv = store.srv;
  const real = srv.handle;
  srv.handle = async () => { throw new Error('offline'); };
  const out = await a.s.turnDone([plank(0), plank(1.6)], { lease: tt.lease });
  assert.equal(out.queued, true);
  srv.handle = real;
  await a.s.sync();
  assert.equal(a.s.view().floors.length, 2, 'the floors went up with the sync');
  assert.equal(a.s.view().turns, 0, 'the turn is used once');
});
