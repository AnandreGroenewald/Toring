// (1.20) Saturday, played many times through the real server code: four crews of three build all week and fight on
// Saturday (bomb runs at the tallest, repairs, Saturday's own turns) until the hidden whistle. Crew D plays the
// "sniper": it keeps its last turns for 20:00. The game is fair when the lead changes hands during the day, towers
// stay in a sane range, every Saturday settles with four places paid once, and waiting for the last minute is no sure win.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpanServer } from '../src/span.js';
import { SPAN, sastAt, newSpanId, newSpanKey } from '../../js/core/span.js';
import { heightOf, SHAPE_PX } from '../../js/core/weektower.js';
import { createRng } from '../../js/core/rng.js';

const DAYS = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
const SHAPES = ['plank', 'slab', 'brick', 'crate', 'cube'];

/** A turn's floors stacked on `top` (m): mostly Good, some Perfek, a few Skeef. */
function turnFloors(rng, top, n) {
  const out = [];
  let y = top;
  for (let i = 0; i < n; i++) {
    const s = rng.pick(SHAPES);
    const roll = rng.next();
    const q = roll < 0.3 ? 'P' : roll < 0.4 ? 'S' : 'G';
    out.push({ s, k: 1, c: rng.int(0, 5), x: Math.round(rng.float(-0.8, 0.8) * 100) / 100, y: Math.round(y * 100) / 100, r: q === 'S' ? 0.05 : 0, q, p: 1 });
    y += SHAPE_PX[s][1] / 25;
  }
  return out;
}

async function saturday(seed) {
  const rng = createRng(`sim/${seed}`);
  const data = new Map();
  const store = { get: async (k) => (data.has(k) ? structuredClone(data.get(k)) : undefined), put: async (k, v) => { data.set(k, structuredClone(v)); } };
  const clock = { t: sastAt(DAYS[0], 8) };
  const s = createSpanServer(store, { now: () => clock.t });
  // (every answer's prize is counted: the server hands each player theirs once)
  const got = new Map();
  const call = async (path, body) => {
    const res = await s.handle('POST', path, body);
    const pr = res[1]?.me?.prize?.coins;
    if (pr) got.set(body.id, (got.get(body.id) || 0) + pr);
    return res;
  };
  // four crews of three; how often each plays the Daily (D: the sniper)
  const crews = [];
  for (const [k, active] of [['A', 0.95], ['B', 0.8], ['C', 0.65], ['D', 0.9]]) {
    const ps = [0, 1, 2].map((i) => ({ id: newSpanId(), key: newSpanKey(), name: `${k}${i}` }));
    await call('/span/sync', { ...ps[0], days: {} });
    const [, made] = await call('/span/make', { ...ps[0], name: `Span ${k}` });
    for (const p of ps.slice(1)) {
      await call('/span/sync', { ...p, days: {} });
      await call('/span/join', { ...p, invite: made.crew.invite });
    }
    crews.push({ k, active, ps, id: made.crew.id, sniper: k === 'D' });
  }
  const days = new Map();   // player id -> { day: metres }
  async function build(p, { repair = false } = {}) {
    const [st, L] = await call('/span/lease', { ...p, repair });
    if (st !== 200) return false;
    const [bs] = await call('/span/build', { ...p, lease: L.lease, floors: turnFloors(rng, heightOf(L.floors), L.blocks) });
    return bs === 200;
  }
  const turnsOf = async (p) => (await call('/span/sync', { ...p, days: days.get(p.id) || {} }))[1].me.turns;
  // Monday to Saturday morning: the Dailies, the turns (the sniper keeps what it gets from Friday on)
  for (const [i, day] of DAYS.entries()) {
    clock.t = sastAt(day, i === 5 ? 7 : 18);
    for (const c of crews) {
      for (const p of c.ps) {
        if (rng.next() > c.active) continue;
        const d = days.get(p.id) || {};
        d[day] = Math.round(rng.float(20, 80) * 10) / 10;
        days.set(p.id, d);
        let turns = await turnsOf(p);
        const hold = c.sniper && i >= 4 ? turns : 0;
        while (turns > hold && await build(p)) turns--;
      }
    }
  }
  // Saturday: each player comes by a few times (the busier crews more often; the sniper surely at 20:00); the whistle
  // blows when it blows. A visit: the leader's crew repairs and builds; the others throw a run or two at the leader
  // (two bombs in three land on the tower), then build.
  const visits = new Map();
  for (const c of crews) {
    for (const p of c.ps) {
      const n = Math.round(2 + c.active * 4);
      const slots = new Set();
      while (slots.size < n) slots.add(rng.int(15, 43));
      if (c.sniper) slots.add(SPAN.craneClose * 2 - 1);
      visits.set(p.id, slots);
    }
  }
  const tally = { runs: 0, hits: 0, cracked: 0, lost: 0, repairs: 0 };
  const leaders = [];
  let settled = null;
  for (let half = 15; half <= 43; half++) {
    clock.t = sastAt(DAYS[5], Math.floor(half / 2), (half % 2) * 30);
    const [, look] = await call('/span/sync', { ...crews[0].ps[0], days: days.get(crews[0].ps[0].id) || {} });
    const r = look.river;
    if (!r) return { error: 'no river' };
    if (r.over) { settled = r; break; }
    leaders.push(r.leader);
    for (const c of crews) {
      for (const p of c.ps) {
        if (!visits.get(p.id).has(half)) continue;
        let [, me] = await call('/span/sync', { ...p, days: days.get(p.id) || {} });
        if (!me.river) continue;   // (a crew without a ticket sits Saturday out)
        if (me.river.leader === c.id) {
          if (me.crew.repair > 0 && await build(p, { repair: true })) tally.repairs++;
        } else {
          for (let run = 0; run < 2 && me.me.bombs > 0 && me.river.leader !== c.id; run++) {
            const lead = me.river.leader;
            const h = me.river.rows.find((x) => x.id === lead)?.h || 0;
            const n = Math.min(SPAN.bombsPerRun, me.me.bombs);
            const hits = Array.from({ length: n }, () => (rng.next() < 0.66 ? { x: rng.float(-1, 1), y: rng.float(0.5, Math.max(1, h - 0.5)) } : { x: 30, y: 2 }));
            const [st, res] = await call('/span/bomb', { ...p, target: lead, hits });
            tally[st === 200 ? 'runs' : `e${st}${res?.error || ''}`] = (tally[st === 200 ? 'runs' : `e${st}${res?.error || ''}`] || 0) + 1;
            if (st !== 200) break;
            for (const x of res.hits) { if (x.cracked) tally.cracked++; else if (!x.miss) { tally.hits++; tally.lost += x.lost; } }
            me = { ...me, me: res.me, river: res.river };
          }
        }
        if (!c.sniper || half >= SPAN.craneClose * 2 - 1) while (await build(p));
      }
    }
  }
  if (!settled) {
    clock.t = sastAt(DAYS[5], 21, 5);
    settled = (await call('/span/sync', { ...crews[0].ps[0], days: days.get(crews[0].ps[0].id) || {} }))[1].river;
  }
  // everyone's prize, once (two more looks each: nothing more comes)
  const paid = [];
  for (const c of crews) {
    for (const p of c.ps) {
      await call('/span/sync', { ...p, days: days.get(p.id) || {} });
      await call('/span/sync', { ...p, days: days.get(p.id) || {} });
      paid.push({ k: c.k, coins: got.get(p.id) || 0, ticket: (await call('/span/sync', { ...p, days: days.get(p.id) || {} }))[1].me.ticket });
    }
  }
  const name = (id) => crews.find((c) => c.id === id)?.k || '?';
  const changes = leaders.reduce((n, x, i) => n + (i > 0 && x !== leaders[i - 1] ? 1 : 0), 0);
  tally.lost = Math.round(tally.lost);
  return { tally, winner: name(settled.final?.order?.[0]), order: (settled.final?.order || []).map(name), heights: settled.rows.map((x) => [name(x.id), Math.round(x.h)]), changes, paid };
}

test('span sim: Saturday is contested, settles, pays once, and waiting for the last minute is no sure win', async () => {
  const runs = [];
  for (let i = 0; i < 16; i++) runs.push(await saturday(i));
  for (const r of runs) {
    assert.ok(!r.error, r.error);
    assert.equal(r.order.length, 4, 'four places');
    for (const [, h] of r.heights) assert.ok(h >= 0 && h < 1500, `a sane height: ${h}`);
    for (const p of r.paid) {
      const place = r.order.indexOf(p.k);
      assert.equal(p.coins, place < 0 ? 0 : SPAN.prize[place], `${p.k} paid once for its place (${place + 1})`);
    }
  }
  const contested = runs.filter((r) => r.changes >= 2).length;
  const sniper = runs.filter((r) => r.winner === 'D').length;
  const wins = Object.fromEntries(['A', 'B', 'C', 'D'].map((k) => [k, runs.filter((r) => r.winner === k).length]));
  const tall = runs.map((r) => Math.max(...r.heights.map((x) => x[1])));
  console.log(`[sim] wins ${JSON.stringify(wins)}; lead changed 2+ times in ${contested}/${runs.length}; tallest ${Math.min(...tall)}-${Math.max(...tall)} m; e.g. ${JSON.stringify(runs[0].heights)} (${runs[0].changes} changes) ${JSON.stringify(runs[0].tally)}`);
  assert.ok(contested >= runs.length * 0.75, `the lead changes hands on most Saturdays (${contested}/${runs.length})`);
  assert.ok(sniper <= runs.length / 2, `the last-minute crew wins at most half (${sniper}/${runs.length})`);
});

/** One player alone on Saturday's river with three Rikus crews: plays most Dailies, builds, bombs, repairs. */
async function solo(seed) {
  const rng = createRng(`solo/${seed}`);
  const data = new Map();
  const store = { get: async (k) => (data.has(k) ? structuredClone(data.get(k)) : undefined), put: async (k, v) => { data.set(k, structuredClone(v)); } };
  const clock = { t: sastAt(DAYS[0], 8) };
  const s = createSpanServer(store, { now: () => clock.t });
  const p = { id: newSpanId(), key: newSpanKey(), name: 'Solo' };
  const days = {};
  const call = async (path, body) => s.handle('POST', path, { ...p, days, ...body });
  const build = async (repair = false) => {
    const [st, L] = await call('/span/lease', { repair });
    if (st !== 200) return false;
    return (await call('/span/build', { lease: L.lease, floors: turnFloors(rng, heightOf(L.floors), L.blocks) }))[0] === 200;
  };
  for (const [i, day] of DAYS.entries()) {
    clock.t = sastAt(day, i === 5 ? 8 : 18);
    if (rng.next() < 0.8) days[day] = Math.round(rng.float(20, 70) * 10) / 10;
    await call('/span/sync');
    while (await build());
  }
  let lead = 0;
  for (const hr of [10, 14, 17, 19]) {
    clock.t = sastAt(DAYS[5], hr, rng.int(0, 59));
    const [, me] = await call('/span/sync');
    if (!me.river || me.river.over) break;
    if (me.river.leader === me.crew.id) {
      lead++;
      while (me.crew.repair > 0 && await build(true)) me.crew.repair = 0;
    } else if (me.me.bombs > 0) {
      const h = me.river.rows.find((x) => x.leader)?.h || 0;
      const hits = Array.from({ length: Math.min(3, me.me.bombs) }, () => (rng.next() < 0.66 ? { x: 0, y: rng.float(0.5, Math.max(1, h - 0.5)) } : { x: 30, y: 2 }));
      await call('/span/bomb', { target: me.river.leader, hits });
    }
  }
  clock.t = sastAt(DAYS[5], 21, 5);
  const [, end] = await call('/span/sync');
  if (!end.river) return { place: 0 };
  return { place: end.river.final.order.indexOf(end.crew.id) + 1, rows: end.river.rows.map((x) => [x.bot ? 'R' : 'me', Math.round(x.h)]) };
}

test('span sim: one player against three Rikus crews places well when they play, and can still lose', async () => {
  const runs = [];
  for (let i = 0; i < 16; i++) runs.push(await solo(i));
  const inRiver = runs.filter((r) => r.place > 0);
  const firsts = inRiver.filter((r) => r.place === 1).length;
  console.log(`[sim solo] in a river ${inRiver.length}/16; places ${JSON.stringify(inRiver.map((r) => r.place))}; e.g. ${JSON.stringify(inRiver[0]?.rows)}`);
  assert.ok(inRiver.length >= 10, 'a player with a ticket gets a river');
  assert.ok(firsts >= inRiver.length * 0.3, `Rikus is beatable (${firsts}/${inRiver.length} firsts)`);
  assert.ok(firsts < inRiver.length, 'and not a walkover every time');
});
