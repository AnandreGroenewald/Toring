// (1.20) Ons dorp's server (server/src/span.js): players and crews (invites, three at most, the founder, locked at the
// weekend), the week's turns and the crane (one builder at a time), the rescue ride, Saturday's rivers (four crews, Rikus
// filling, only the tallest bombed, the whistle, the prizes) and the new week's monument. A memory store and a clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpanServer } from '../src/span.js';
import { SPAN, sastAt, newSpanId, newSpanKey, whistleAt } from '../../js/core/span.js';
import { heightOf } from '../../js/core/weektower.js';

const MON = '2026-10-26';
const day = (k) => ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'][k];
function harness(t0 = sastAt(MON, 9)) {
  const data = new Map();
  const store = { get: async (k) => (data.has(k) ? structuredClone(data.get(k)) : undefined), put: async (k, v) => { data.set(k, structuredClone(v)); } };
  const clock = { t: t0 };
  const s = createSpanServer(store, { now: () => clock.t });
  const call = (m, path, body) => s.handle(m, path, body);
  return { s, data, clock, call };
}
function player(name) {
  return { id: newSpanId(), key: newSpanKey(), name };
}
const sync = (h, p, extra = {}) => h.call('POST', '/span/sync', { ...p, ...extra });
const plank = (y, q = 'G') => ({ s: 'plank', k: 1, c: 1, x: 0, y, r: 0, q, p: 1 });
const planks = (from, n) => Array.from({ length: n }, (_, i) => plank(from + i * 1.6));

test('span server: a new player gets a crew of one; the wrong key is refused; Dailies give turns', async () => {
  const h = harness();
  const a = player('Anna');
  const [st, r] = await sync(h, a, { days: { [day(0)]: 40 } });
  assert.equal(st, 200);
  assert.equal(r.crew.members.length, 1);
  assert.equal(r.crew.founder, a.id);
  assert.match(r.crew.name, /Anna/);
  assert.equal(r.me.turns, 1);
  assert.equal(r.phase, 'bou');
  assert.equal((await sync(h, { ...a, key: newSpanKey() }))[0], 403);
  assert.equal((await sync(h, { ...a, id: 'nope' }))[0], 400);
  // the same day again: no second turn; two more days: two waiting at most
  h.clock.t = sastAt(day(2), 9);
  const [, r2] = await sync(h, a, { days: { [day(0)]: 55, [day(1)]: 30, [day(2)]: 20 } });
  assert.equal(r2.me.turns, SPAN.turnsMax);
  assert.equal(r2.me.metres, 105);
  // a day in the future or another week doesn't count
  const [, r3] = await sync(h, a, { days: { [day(5)]: 90, '2026-10-19': 90 } });
  assert.equal(r3.me.metres, 105);
});

test('span server: crews by invite (three at most), the founder removes and renames, the weekend locks them', async () => {
  const h = harness();
  const [a, b, c, d] = ['Anna', 'Ben', 'Carla', 'Dirk'].map(player);
  for (const p of [a, b, c, d]) await sync(h, p, {});
  const [, ma] = await h.call('POST', '/span/make', { ...a, name: 'Die Bouers' });
  assert.equal(ma.crew.name, 'Die Bouers');
  const inv = ma.crew.invite;
  const [, look] = await h.call('GET', `/span/invite/${inv}`);
  assert.deepEqual([look.name, look.n, look.full], ['Die Bouers', 1, false]);
  assert.equal((await h.call('POST', '/span/join', { ...b, invite: inv }))[0], 200);
  assert.equal((await h.call('POST', '/span/join', { ...c, invite: inv }))[0], 200);
  const [st4, full] = await h.call('POST', '/span/join', { ...d, invite: inv });
  assert.equal(st4, 409);
  assert.equal(full.error, 'full');
  const [, sb] = await sync(h, b);
  assert.equal(sb.crew.members.length, 3);
  assert.ok(sb.crew.news.some((n) => n.kind === 'joined'));
  // only the founder renames and removes
  assert.equal((await h.call('POST', '/span/rename', { ...b, name: 'Ons' }))[0], 403);
  assert.equal((await h.call('POST', '/span/remove', { ...a, who: c.id }))[0], 200);
  const [, sc] = await sync(h, c);
  assert.equal(sc.crew.members.length, 1, 'Carla has her own crew again');
  // Saturday: no joining, leaving or removing
  h.clock.t = sastAt(day(5), 10);
  assert.equal((await h.call('POST', '/span/join', { ...d, invite: inv }))[0], 403);
  assert.equal((await h.call('POST', '/span/leave', { ...b }))[0], 403);
});

test('span server: the crane is one builder\'s at a time; a turn\'s floors join the tower in its builder\'s skin', async () => {
  const h = harness();
  const [a, b] = [player('Anna'), player('Ben')];
  await sync(h, a, { days: { [day(0)]: 40 }, skin: 'goud' });
  const [, ma] = await h.call('POST', '/span/make', { ...a, name: 'Die Bouers' });
  await sync(h, b, { days: { [day(0)]: 30 } });
  await h.call('POST', '/span/join', { ...b, invite: ma.crew.invite });
  const [s1, l1] = await h.call('POST', '/span/lease', a);
  assert.equal(s1, 200);
  assert.equal(l1.blocks, SPAN.turnBlocks);
  const [s2, busy] = await h.call('POST', '/span/lease', b);
  assert.equal(s2, 409);
  assert.equal(busy.by, 'Anna');
  const [s3, built] = await h.call('POST', '/span/build', { ...a, lease: l1.lease, floors: planks(0, 4) });
  assert.equal(s3, 200);
  assert.equal(built.added, 4);
  assert.equal(built.crew.floors[0].sk, 'goud');
  assert.equal(built.crew.floors[0].by, a.id);
  assert.equal(built.me.turns, 0);
  assert.equal((await h.call('POST', '/span/build', { ...a, lease: l1.lease, floors: planks(6.4, 2) }))[0], 409, 'a lease is used once');
  // Ben builds on top; then his turn is used too
  const [, l2] = await h.call('POST', '/span/lease', b);
  const [, b2] = await h.call('POST', '/span/build', { ...b, lease: l2.lease, floors: planks(6.4, 2) });
  assert.equal(b2.crew.floors.length, 6);
  assert.equal(heightOf(b2.crew.floors), 9.6);
  assert.equal((await h.call('POST', '/span/lease', b))[0], 403);
  // a lease left open runs out: the next builder can take the crane
  await sync(h, a, { days: { [day(1)]: 20 } });
  h.clock.t = sastAt(day(1), 9);
  await sync(h, a, { days: { [day(1)]: 20 } });
  await sync(h, b, { days: { [day(1)]: 20 } });
  const [, l3] = await h.call('POST', '/span/lease', a);
  assert.ok(l3.lease);
  assert.equal((await h.call('POST', '/span/lease', b))[0], 409);
  h.clock.t += SPAN.leaseMs + 1000;
  assert.equal((await h.call('POST', '/span/lease', b))[0], 200);
  assert.equal((await h.call('POST', '/span/build', { ...a, lease: l3.lease, floors: planks(9.6, 2) }))[0], 409, 'the old lease is gone');
});

test('span server: today\'s ride, once: people move in; a ride for another day is refused', async () => {
  const h = harness();
  const a = player('Anna');
  await sync(h, a, { days: { [day(0)]: 40 } });
  const [, l] = await h.call('POST', '/span/lease', a);
  await h.call('POST', '/span/build', { ...a, lease: l.lease, floors: planks(0, 3).map((f) => ({ ...f, p: 0 })) });
  const [s, r] = await h.call('POST', '/span/ride', { ...a, day: day(0), rescued: 5 });
  assert.equal(s, 200);
  assert.equal(r.crew.people, 5);
  assert.equal(r.crew.floors.reduce((n, f) => n + f.p, 0), 5, 'into the free rooms');
  assert.equal((await h.call('POST', '/span/ride', { ...a, day: day(0), rescued: 5 }))[0], 409);
  assert.equal((await h.call('POST', '/span/ride', { ...a, day: '2026-10-01', rescued: 5 }))[0], 400);
});

test('span server: the metres down the endless river count for the player and the crew this week (capped, a new week clears them)', async () => {
  const h = harness();
  const a = player('Anna');
  const b = player('Bennie');
  await sync(h, a, { days: { [day(0)]: 40 } });
  const [, ca] = await h.call('POST', '/span/sync', { ...a, name: 'Anna', days: { [day(0)]: 40 } });
  await sync(h, b, { days: { [day(0)]: 30 } });
  await h.call('POST', '/span/join', { ...b, invite: ca.crew.invite });
  const [s1, r1] = await h.call('POST', '/span/ride', { ...a, day: day(0), rescued: 4, metres: 1234.7, durationMs: 62000 });
  assert.equal(s1, 200);
  assert.equal(r1.me.rideM[day(0)], 1234);
  assert.equal(r1.me.bombs, SPAN.bombsMax, '1 shot per 25 m of Dailies + 1 per 100 m ridden, the week\'s 10 at most');
  assert.equal(r1.me.river, 1234);
  const [, r2] = await h.call('POST', '/span/ride', { ...b, day: day(0), rescued: 2, metres: 9e9, durationMs: 2e6 });
  assert.equal(r2.crew.rideBy[a.id], 1234);
  assert.equal(r2.crew.rideBy[b.id], 40000, 'one ride counts at most 40 km');
  assert.equal(r2.crew.rideM, 41234);
  // free rides, any time and as often as you like: their metres add up, nobody moves in, the day's ride stays done
  const [sx, rx] = await h.call('POST', '/span/ride', { ...a, day: day(0), rescued: 7, metres: 500, extra: true, durationMs: 25000 });
  assert.equal(sx, 200);
  assert.equal(rx.me.rideM[day(0)], 1734);
  assert.equal(rx.crew.people, r2.crew.people, 'a free ride brings nobody in');
  assert.equal((await h.call('POST', '/span/ride', { ...a, day: day(0), rescued: 0, metres: 300, extra: true, durationMs: 15000 }))[1].crew.rideBy[a.id], 2034);
  assert.equal((await h.call('POST', '/span/ride', { ...a, day: day(0), rescued: 5 }))[0], 409, 'the rescue ride is still once a day');
  const c = player('Carla');
  await sync(h, c, { days: { [day(0)]: 20 } });
  await h.call('POST', '/span/join', { ...c, invite: ca.crew.invite });
  const [s3, r3] = await h.call('POST', '/span/ride', { ...c, day: day(0), rescued: 0, metres: 'x', durationMs: 9000 });
  assert.equal(s3, 200);
  assert.equal(r3.crew.rideBy[c.id], 0, 'nonsense metres count as none');
  h.clock.t = sastAt('2026-11-02', 9);
  const [, nx] = await h.call('POST', '/span/sync', { ...a, name: 'Anna', days: {} });
  assert.equal(nx.crew.rideM, 0, 'a new week starts at nothing');
});

test('span server: Afgly\'s daily ranking — your furthest ride of the day, the top 10, your own place; a ride faster than the river counts for nothing', async () => {
  const h = harness();
  const ps = Array.from({ length: 13 }, (_, k) => player(`Bouer${k}`));
  for (const [k, p] of ps.entries()) {
    await sync(h, p, { name: `Speler${k}`, days: { [day(0)]: 20 } });
    await h.call('POST', '/span/ride', { ...p, day: day(0), rescued: 1, metres: 100 + k * 50, durationMs: 60000 });
  }
  const me = ps[2];   // 200 m: 11th
  let [s, bd] = await h.call('POST', '/span/board', { ...me, day: day(0) });
  assert.equal(s, 200);
  assert.equal(bd.players, 13);
  assert.equal(bd.top.length, 10);
  assert.equal(bd.top[0].m, 700);
  assert.equal(bd.top[0].name, 'Speler12');
  assert.deepEqual(bd.you, { rank: 11, m: 200, hidden: false });
  // a further free ride lifts you; a shorter one leaves your best
  const [, r1] = await h.call('POST', '/span/ride', { ...me, day: day(0), metres: 900, extra: true, durationMs: 40000 });
  assert.equal(r1.board.you.rank, 1);
  assert.ok(r1.board.top[0].you);
  const [, r2] = await h.call('POST', '/span/ride', { ...me, day: day(0), metres: 120, extra: true, durationMs: 9000 });
  assert.equal(r2.board.you.m, 900);
  // too fast for the river: no place, no metres
  const cheat = ps[0];
  const [, r3] = await h.call('POST', '/span/ride', { ...cheat, day: day(0), metres: 5000, extra: true, durationMs: 10000 });
  assert.equal(r3.board.you.m, 100, 'the impossible ride left nothing');
  assert.equal(r3.me.rideM[day(0)], 100);
  // hiding: your place stays, the list skips you
  const [, r4] = await h.call('POST', '/span/ride', { ...me, day: day(0), metres: 50, extra: true, durationMs: 9000, hidden: true });
  assert.equal(r4.board.you.rank, 1);
  assert.ok(r4.board.top.every((x) => !x.you));
  assert.equal(r4.board.top[0].rank, 2);
  // another day: its own ranking
  h.clock.t = sastAt(day(1), 9);
  [, bd] = await h.call('POST', '/span/board', { ...me, day: day(1) });
  assert.equal(bd.players, 0);
  assert.equal(bd.you, null);
});

/** Five crews over a week: four with a ticket (towers 16, 11.2, 8, 4.8 m), one without. */
async function week5(h) {
  h.clock.t = sastAt(day(2), 8);   // (Wednesday: Monday's to Wednesday's Dailies are in)
  const crews = [];
  for (const [k, n] of [['A', 10], ['B', 7], ['C', 5], ['D', 3], ['E', 2]].entries()) {
    const p = player(`Speler ${n[0]}`);
    const days = k < 4 ? { [day(0)]: 60, [day(1)]: 60, [day(2)]: 60 } : { [day(0)]: 60 };
    await sync(h, p, { days });
    const [, l] = await h.call('POST', '/span/lease', p);
    const [, b] = await h.call('POST', '/span/build', { ...p, lease: l.lease, floors: planks(0, 10).slice(0, Math.min(10, n[1])) });
    crews.push({ p, crew: b.crew.id, h: heightOf(b.crew.floors) });
  }
  return crews;
}

test('span server: Saturday groups crews with a ticket into rivers of four (Rikus fills); only the tallest can be bombed', async () => {
  const h = harness(sastAt(day(0), 8));
  const crews = await week5(h);
  // Saturday 05:00: still building, no rivers
  h.clock.t = sastAt(day(5), 5);
  const [, early] = await sync(h, crews[0].p);
  assert.equal(early.river, null);
  assert.equal(early.phase, 'bou');
  // 07:00: the rivers
  h.clock.t = sastAt(day(5), 7);
  const [, sat] = await sync(h, crews[0].p);
  assert.equal(sat.phase, 'uitdaging');
  const r = sat.river;
  assert.ok(r, 'a river');
  assert.equal(r.rows.length, SPAN.riverCrews);
  assert.equal(r.rows.filter((x) => x.bot).length, 0, 'four crews with tickets: no Rikus');
  assert.equal(r.rows.find((x) => x.leader).id, crews[0].crew, 'the tallest leads');
  const [, e] = await sync(h, crews[4].p);
  assert.equal(e.river, null, 'no ticket, no river');
  // bombing a crew that isn't the tallest: refused; the tallest: its floors go
  const [s1, no] = await h.call('POST', '/span/bomb', { ...crews[2].p, target: crews[1].crew, hits: [{ x: 0, y: 1 }] });
  assert.equal(s1, 409);
  assert.equal(no.leader, crews[0].crew);
  assert.equal((await h.call('POST', '/span/bomb', { ...crews[0].p, target: crews[0].crew, hits: [{ x: 0, y: 1 }] }))[0], 409, 'not your own');
  const [s2, hit] = await h.call('POST', '/span/bomb', { ...crews[2].p, target: crews[0].crew, hits: [{ x: 0, y: 0.8 }, { x: 0, y: 3 }, { x: 40, y: 3 }] });
  assert.equal(s2, 200);
  assert.equal(hit.hits.filter((x) => x.removed?.length).length, 2);
  assert.equal(hit.hits[2].miss, true);
  assert.equal(hit.me.bombs, 7 - 3, '180 m of Dailies: 7 bombs, 3 used');
  const [, a2] = await sync(h, crews[0].p);
  assert.ok(a2.crew.heightM < crews[0].h);
  assert.equal(a2.crew.repair, 2, 'a repair block for each hit');
  assert.ok(a2.crew.inRiver > 0, 'their people fell into the river');
  assert.ok(a2.crew.news.some((n) => n.kind === 'bombed'));
  // more bombs than you have: refused
  await h.call('POST', '/span/bomb', { ...crews[2].p, target: a2.river.leader, hits: [{ x: 0, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 1 }] });
  const [s3] = await h.call('POST', '/span/bomb', { ...crews[2].p, target: a2.river.leader, hits: [{ x: 0, y: 1 }, { x: 0, y: 1 }] });
  assert.equal(s3, 403);
});

test('span server: Rikus crews fill a small river and act through Saturday; the whistle settles it and pays once', async () => {
  const h = harness(sastAt(day(2), 8));
  const p = player('Solo');
  await sync(h, p, { days: { [day(0)]: 60, [day(1)]: 60, [day(2)]: 60 } });
  const [, l] = await h.call('POST', '/span/lease', p);
  await h.call('POST', '/span/build', { ...p, lease: l.lease, floors: planks(0, 10) });
  h.clock.t = sastAt(day(5), 6, 30);
  const [, s1] = await sync(h, p);
  const r = s1.river;
  assert.equal(r.rows.filter((x) => x.bot).length, 3, 'three Rikus crews');
  const bots1 = r.rows.filter((x) => x.bot).map((x) => x.h);
  for (const bh of bots1) assert.ok(bh > 5 && bh < 40, `a Rikus tower near the river's middle: ${bh}`);
  // late afternoon: they built (and bombed the leader)
  h.clock.t = sastAt(day(5), 18);
  const [, s2] = await sync(h, p);
  const bots2 = s2.river.rows.filter((x) => x.bot).map((x) => x.h);
  assert.ok(bots2.some((bh, i) => bh > bots1[i]), 'Rikus built');
  assert.equal(s2.river.over, false);
  assert.equal(s2.river.final, null);
  // after the whistle (between 20:00 and 21:00): the order, a prize once
  h.clock.t = sastAt(day(5), 21, 1);
  const [, s3] = await sync(h, p);
  assert.ok(s3.river.over);
  assert.equal(s3.river.final.order.length, 4);
  const place = s3.river.final.order.indexOf(s1.crew.id) + 1;
  assert.ok(place >= 1);
  assert.equal(s3.me.prize?.coins, SPAN.prize[place - 1]);
  const [, s4] = await sync(h, p);
  assert.equal(s4.me.prize, null, 'paid once');
  assert.equal((await h.call('POST', '/span/lease', p))[0], 403, 'no building after the whistle');
  // nobody can learn the whistle's time from the river before it blows
  assert.equal(JSON.stringify(s2.river).includes(String(whistleAt('2026-10-26', s1.river.id, ''))), false);
  // the new week: the tower is a monument with its place; a new Weektoring
  h.clock.t = sastAt('2026-11-02', 8);
  const [, s5] = await sync(h, p);
  assert.equal(s5.crew.floors.length, 0);
  assert.equal(s5.crew.monuments[0].week, '2026-10-26');
  assert.equal(s5.crew.monuments[0].place, place);
  assert.equal(s5.me.turns, 0);
});

test('span server: floors built while a bomb landed come down with the tower; nonsense never breaks a tower', async () => {
  const h = harness(sastAt(day(0), 8));
  const crews = await week5(h);
  h.clock.t = sastAt(day(5), 9);
  await sync(h, crews[0].p, { days: { [day(5)]: 30 } });
  for (const c of crews.slice(1, 4)) await sync(h, c.p);
  const [, l] = await h.call('POST', '/span/lease', crews[0].p);
  const top = heightOf(l.floors);
  const [, bombed] = await h.call('POST', '/span/bomb', { ...crews[1].p, target: crews[0].crew, hits: [{ x: 0, y: 0.8 }] });
  assert.equal(bombed.hits[0].lost, 3.2, 'the blast: two planks');
  const [, b] = await h.call('POST', '/span/build', { ...crews[0].p, lease: l.lease, floors: [plank(top)] });
  const fl = b.crew.floors;
  const newest = fl[fl.length - 1];
  assert.equal(newest.y, Math.round((top - 3.2) * 100) / 100, 'it sits on the lowered tower');
  // rubbish in every route: an answer, never a crash
  for (const [path, body] of [['/span/bomb', { ...crews[1].p, target: 'x', hits: 'y' }], ['/span/build', { ...crews[0].p, lease: 5 }], ['/span/join', { ...crews[1].p, invite: '<b>' }], ['/span/ride', { ...crews[1].p, day: 7 }], ['/span/rename', { ...crews[0].p, name: '' }]]) {
    const [st] = await h.call('POST', path, body);
    assert.ok(st >= 400 && st < 500, `${path}: ${st}`);
  }
  assert.equal((await h.call('GET', '/span/river/NOPE1234'))[0], 404);
  assert.equal((await h.call('GET', '/span/nothing'))[0], 404);
});

test('span server: old weeks\' rivers are deleted six weeks on; last week\'s stay', async () => {
  const h = harness();
  const a = player('Anna');
  await sync(h, a, { days: { [day(0)]: 40, [day(1)]: 30, [day(2)]: 30 } });
  h.data.set('spanw:2026-09-14', { crews: [], rivers: ['ROLD'], grouped: true });
  h.data.set('spanr:ROLD', { id: 'ROLD', week: '2026-09-14', crews: [], bots: {}, log: [] });
  h.data.set('spanw:2026-10-19', { crews: [], rivers: ['RNEW'], grouped: true });
  h.data.set('spanr:RNEW', { id: 'RNEW', week: '2026-10-19', crews: [], bots: {}, log: [] });
  h.clock.t = sastAt(day(5), 9);   // Saturday: this week's rivers are grouped
  const [st, r] = await sync(h, a, { days: { [day(0)]: 40, [day(1)]: 30, [day(2)]: 30 } });
  assert.equal(st, 200);
  assert.ok(r.crew.river, 'a river this Saturday');
  assert.ok(!h.data.get('spanr:ROLD'), 'the six-week-old river is gone');
  assert.ok(!h.data.get('spanw:2026-09-14'));
  assert.ok(h.data.get('spanr:RNEW'), 'last week\'s river stays');
});

test('span server: Saturday noon closes the crane for new floors; repairs go on until the whistle', async () => {
  const h = harness(sastAt(day(0), 8));
  const crews = await week5(h);
  h.clock.t = sastAt(day(5), 9);
  await sync(h, crews[0].p, { days: { [day(5)]: 30 } });
  for (const c of crews.slice(1, 4)) await sync(h, c.p);
  await h.call('POST', '/span/bomb', { ...crews[1].p, target: crews[0].crew, hits: [{ x: 0, y: 0.8 }] });
  h.clock.t = sastAt(day(5), SPAN.craneClose, 1);
  const [st, no] = await h.call('POST', '/span/lease', crews[0].p);
  assert.equal(st, 403);
  assert.equal(no.error, 'crane');
  const [st2, rep] = await h.call('POST', '/span/lease', { ...crews[0].p, repair: true });
  assert.equal(st2, 200, 'a repair still goes');
  assert.equal(rep.blocks, 1);
  h.clock.t = sastAt(day(5), SPAN.craneClose - 1, 59);
  assert.equal((await h.call('POST', '/span/lease', crews[1].p))[0] === 403 && (await h.call('POST', '/span/lease', crews[1].p))[1].error === 'crane', false, 'before noon the crane is open');
});

test('span server: a member\'s latest Daily tower stands on the island; nonsense towers are refused; monuments keep floors', async () => {
  const h = harness();
  const a = player('Anna');
  const tower = { day: day(0), h: 4.8, b: [{ s: 'plank', k: 1, c: 2, x: 0, y: 0, r: 0, q: 'P' }, { s: 'brick', k: 1, c: 1, x: 0.2, y: 1.6, r: 0.01, q: 'G' }] };
  const [, r1] = await sync(h, a, { days: { [day(0)]: 40 }, tower });
  assert.equal(r1.crew.members[0].tower.b.length, 2);
  assert.equal(r1.crew.members[0].tower.h, 4.8);
  for (const bad of [{ ...tower, b: [{ s: 'rocket', x: 0, y: 0 }] }, { ...tower, day: 'x' }, { ...tower, b: Array(91).fill(tower.b[0]) }, { ...tower, b: [{ ...tower.b[0], x: 1e9 }] }]) {
    const [, r] = await sync(h, a, { tower: bad });
    assert.equal(r.crew.members[0].tower.b.length, 2, 'the old tower stays');
  }
  // the week's Weektoring becomes a monument with its floors
  const [, l] = await h.call('POST', '/span/lease', a);
  await h.call('POST', '/span/build', { ...a, lease: l.lease, floors: planks(0, 3) });
  h.clock.t = sastAt('2026-11-02', 9);
  const [, r2] = await sync(h, a);
  assert.equal(r2.crew.monuments[0].floors.length, 3);
  assert.equal(r2.crew.monuments[0].floors[0].s, 'plank');
});

test('span server: the automatic crew name follows the founder\'s new nickname; a chosen name stays', async () => {
  const h = harness();
  const a = player('Bouer 622');
  const [, r1] = await sync(h, a);
  assert.equal(r1.crew.name, 'Bouer 622 se span');
  const [, r2] = await sync(h, { ...a, name: 'Anna' });
  assert.equal(r2.crew.name, 'Anna se span');
  await h.call('POST', '/span/rename', { ...a, name: 'Die Bouers' });
  const [, r3] = await sync(h, { ...a, name: 'Annie' });
  assert.equal(r3.crew.name, 'Die Bouers');
});

test('span server: new players from one address are limited (an existing player always gets in)', async () => {
  const data = new Map();
  const store = { get: async (k) => (data.has(k) ? structuredClone(data.get(k)) : undefined), put: async (k, v) => { data.set(k, structuredClone(v)); } };
  let left = 2;
  const s = createSpanServer(store, { now: () => sastAt(MON, 9), newPlayer: () => left-- > 0 });
  const ps = [player('A'), player('B'), player('C')];
  assert.equal((await s.handle('POST', '/span/sync', ps[0], '1.2.3.4'))[0], 200);
  assert.equal((await s.handle('POST', '/span/sync', ps[1], '1.2.3.4'))[0], 200);
  assert.equal((await s.handle('POST', '/span/sync', ps[2], '1.2.3.4'))[0], 429);
  assert.equal((await s.handle('POST', '/span/sync', ps[0], '1.2.3.4'))[0], 200, 'Anna again: fine');
});

test('span server: a crew that never looked after the whistle still gets its place and prize on Monday', async () => {
  const h = harness(sastAt(day(2), 8));
  const p = player('Stil');
  await sync(h, p, { days: { [day(0)]: 60, [day(1)]: 60, [day(2)]: 60 } });
  const [, l] = await h.call('POST', '/span/lease', p);
  await h.call('POST', '/span/build', { ...p, lease: l.lease, floors: planks(0, 10) });
  h.clock.t = sastAt(day(5), 9);
  const [, sat] = await sync(h, p);
  assert.ok(sat.river, 'a river on Saturday');
  // (nobody opens the game again until next Monday)
  h.clock.t = sastAt('2026-11-02', 8);
  const [, mon] = await sync(h, p);
  const place = mon.crew.monuments[0].place;
  assert.ok(place >= 1 && place <= 4, `a place on the monument: ${place}`);
  assert.equal(mon.me.prize?.coins, SPAN.prize[place - 1], 'the prize, paid now');
});

test('span server: a ticket that reaches the server after Saturday\'s grouping still gets a river (in a Rikus crew\'s place)', async () => {
  const h = harness(sastAt(day(2), 8));
  const a = player('Vroeg');
  await sync(h, a, { days: { [day(0)]: 60, [day(1)]: 60, [day(2)]: 60 } });
  const [, la] = await h.call('POST', '/span/lease', a);
  await h.call('POST', '/span/build', { ...a, lease: la.lease, floors: planks(0, 10) });
  const b = player('Laat');
  await sync(h, b, { days: { [day(0)]: 40 } });   // (only one Daily reached the server before Saturday)
  h.clock.t = sastAt(day(5), 8);
  const [, sa] = await sync(h, a);
  assert.ok(sa.river);
  assert.equal(sa.river.rows.filter((x) => x.bot).length, 3);
  // B's other two Dailies arrive now (played offline on Tuesday and Wednesday)
  h.clock.t = sastAt(day(5), 10);
  const [, sb] = await sync(h, b, { days: { [day(0)]: 40, [day(1)]: 40, [day(2)]: 40 } });
  assert.equal(sb.me.ticket, true);
  assert.ok(sb.river, 'a river for the late crew');
  assert.equal(sb.river.id, sa.river.id, 'the same river, in a Rikus crew\'s place');
  assert.equal(sb.river.rows.filter((x) => x.bot).length, 2);
  // the builder's answer counts only the floors that went up (one floating in the air is dropped)
  h.clock.t = sastAt(day(5), 11);
  await sync(h, a, { days: { [day(5)]: 30 } });
  const [, l2] = await h.call('POST', '/span/lease', a);
  const top = 16;
  const [, bl] = await h.call('POST', '/span/build', { ...a, lease: l2.lease, floors: [plank(top), plank(top + 40)] });
  assert.equal(bl.added, 1);
});
