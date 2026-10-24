// (1.20) Ons dorp on the server: crews, their Weektoring, the week's turns and bombs, and the Saterdag-uitdaging. The
// owner (24 Oct 2026): "a clash every Saterday ... everybody plays together to win, grow your crew to build the bigger
// town", "3 players on a team", "if your tower is the highest crews automatically can attack it", the ticket "3 of 5
// Dailies", "I want a Saterday Challenge" (all Saturday), "4 crews per river". The rules are js/core/span.js and
// js/core/weektower.js; the plan docs/RIVIER-PLAN-2026-10-24.md.
//
//   POST /span/sync    {id, key, name, skin, days: {dateKey: m}}  -> {me, crew, river, phase}   (a new id makes a player
//                      with a crew of one; the week's Dailies count: turns, ticket, bombs)
//   POST /span/make    {id, key, name}          -> a new crew with you as its founder (you leave the old one)
//   POST /span/join    {id, key, invite}        -> you join that crew (3 at most; not Saturday or Sunday)
//   POST /span/leave   {id, key}                -> you leave (a crew of one of your own again)
//   POST /span/remove  {id, key, who}           -> the founder takes a member out
//   POST /span/rename  {id, key, name}          -> the founder names the crew
//   POST /span/lease   {id, key, repair?}       -> {lease, floors, seed, blocks}: the crane, one builder at a time
//   POST /span/build   {id, key, lease, floors} -> the turn's floors join the tower
//   POST /span/ride    {id, key, day, rescued, fromRiver}  -> today's ride (once a day): people home
//   POST /span/bomb    {id, key, target, hits: [{x, y}]}    -> Saturday: bombs on the tallest tower of your river
//   GET  /span/river/<id>                       -> the Saturday standings
//   GET  /span/invite/<code>                    -> the crew an invite link is for (its name, how many)
// A player is opened by their phone's secret key (the server keeps its SHA-256). Requests run one after the other (the
// host keeps one queue: a bomb and a build on the same tower never cross). Robot Rikus's crews fill a river and act by
// catch-up: every call works out what they did since the last one. Writes only when a record changed.
import {
  SPAN, sastOf, weekOf, dowOf, plusDays, saturdayOf, sastAt, whistleAt, phaseAt, crewLocked, weekStats, craneOpen,
  isSpanId, isSpanKey, isInvite, newSpanId, newInvite, cleanCrewName, cleanSkin,
} from '../../js/core/span.js';
import { addFloors, heightOf, hit, floorAt, moveIn, peopleIn, cleanFloor, withAdds, SHAPE_PX } from '../../js/core/weektower.js';
import { createRng } from '../../js/core/rng.js';
import { checkName } from '../../js/core/nameRules.js';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(text) {
  return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
const NEWS_MAX = 30;
const MONUMENTS = 8;
const BOT_NAMES = ['Robot Rikus se Span', 'Rikus se Rowers', 'Die Blik-Bouers', 'Rikus en Kie'];
const BOT_ACTS = 6;              // a Rikus crew acts this many times through Saturday...
/** A player's name as other crews see it on Saturday: kid-clean (js/core/nameRules.js), else none. */
const cleanName = (s) => { const r = checkName(String(s ?? '').slice(0, 40), { max: 22 }); return r.ok ? r.value : ''; };
const sig = (r) => JSON.stringify(r, (k, v) => (k === 'at' ? undefined : v));

export function createSpanServer(store, { now = () => Date.now() } = {}) {
  const pKey = (id) => `spanp:${id}`;
  const cKey = (id) => `spanc:${id}`;
  const iKey = (code) => `spani:${code}`;
  const wKey = (wk) => `spanw:${wk}`;
  const rKey = (id) => `spanr:${id}`;
  // A request's records: read once (`loaded`, the working copy the routes change in place), the stored state kept apart
  // (`orig`) to compare with, and written once at the request's end, only those that `put` marked and that changed.
  const dirty = new Map();
  const loaded = new Map();
  const orig = new Map();
  async function get(k) {
    if (dirty.has(k)) return dirty.get(k);
    if (loaded.has(k)) return loaded.get(k);
    const v = await store.get(k);
    orig.set(k, v === undefined ? undefined : sig(v));
    loaded.set(k, v === undefined ? undefined : structuredClone(v));
    return loaded.get(k);
  }
  const put = (k, v) => { dirty.set(k, v); };
  const del = (k) => { dirty.set(k, undefined); };
  async function flush() {
    for (const [k, v] of dirty) {
      if (v === undefined) {
        if (orig.get(k) !== undefined || !orig.has(k)) await (store.del ? store.del(k) : store.put(k, null));
      } else if (orig.get(k) !== sig(v)) await store.put(k, v);
    }
    dirty.clear();
    loaded.clear();
    orig.clear();
  }

  // ------------------------------------------------------------------------------------------- players and crews
  async function opened(id, key) {
    if (!isSpanId(id) || !isSpanKey(key)) return false;
    const p = await get(pKey(id));
    if (!p) return null;
    return p.keyHash === (await sha256(key)) ? p : false;
  }
  /** The player's week from their Dailies (a new week starts them over). */
  function rollPlayer(p, t) {
    const wk = weekOf(sastOf(t).key);
    if (p.week === wk) return p;
    Object.assign(p, { week: wk, days: {}, granted: {}, used: 0, rides: {}, bombsUsed: 0 });
    return p;
  }
  const turnsLeft = (p) => Math.max(0, Object.values(p.granted || {}).reduce((s, n) => s + n, 0) - (p.used | 0));
  function addNews(c, item) {
    c.newsN = (c.newsN | 0) + 1;
    c.news = [...(c.news || []), { n: c.newsN, at: now(), ...item }].slice(-NEWS_MAX);
  }
  async function newCrew(p, name = '') {
    let id = newSpanId();
    while (await get(cKey(id))) id = newSpanId();
    let invite = newInvite();
    while (await get(iKey(invite))) invite = newInvite();
    const c = {
      id, invite, name: cleanCrewName(name) || cleanCrewName(`${p.name || 'Bouer'} se span`) || 'Ons span', founder: p.id,
      members: [{ id: p.id, name: p.name || '', skin: p.skin || 'kleur' }], week: weekOf(sastOf(now()).key), floors: [], people: 0,
      inRiver: 0, repair: 0, lease: null, monuments: [], news: [], newsN: 0, river: null,
    };
    put(cKey(id), c);
    put(iKey(invite), { crew: id });
    p.crew = id;
    return c;
  }
  /** A crew's new week: last week's tower is a monument (and its Saturday place), a new Weektoring starts. */
  async function rollCrew(c, t) {
    const wk = weekOf(sastOf(t).key);
    if (c.week === wk) return c;
    if (c.floors.length) {
      let place = null;
      if (c.river) {
        const r = await get(rKey(c.river));
        place = r?.final ? r.final.order.indexOf(c.id) + 1 || null : null;
      }
      c.monuments = [{ week: c.week, h: heightOf(c.floors), n: c.floors.length, place }, ...(c.monuments || [])].slice(0, MONUMENTS);
    }
    Object.assign(c, { week: wk, floors: [], repair: 0, lease: null, river: null });
    return c;
  }
  async function crewOf(p) {
    let c = p.crew ? await get(cKey(p.crew)) : null;
    if (!c || !c.members.some((m) => m.id === p.id)) c = await newCrew(p);
    await rollCrew(c, now());
    put(cKey(c.id), c);
    return c;
  }
  async function leaveCrew(p, c, why = 'left') {
    c.members = c.members.filter((m) => m.id !== p.id);
    if (c.lease?.by === p.id) c.lease = null;
    if (!c.members.length) {
      put(iKey(c.invite), { crew: null });
    } else {
      if (c.founder === p.id) c.founder = c.members[0].id;
      addNews(c, { kind: why, who: p.name || '' });
    }
    put(cKey(c.id), c);
    p.crew = null;
  }

  // ------------------------------------------------------------------------------------------- views
  function meView(p) {
    const ws = weekStats(p.days || {}, p.week);
    return {
      id: p.id, name: p.name, week: p.week, turns: turnsLeft(p), ticket: ws.ticket, weekdays: ws.weekdays, metres: ws.metres,
      bombs: Math.max(0, ws.bombs - (p.bombsUsed | 0)), rides: p.rides || {}, prize: p.prize || null,
    };
  }
  function crewView(c) {
    return {
      id: c.id, name: c.name, invite: c.invite, founder: c.founder, members: c.members, week: c.week, floors: c.floors,
      heightM: heightOf(c.floors), people: c.people | 0, inRiver: c.inRiver | 0, repair: c.repair | 0,
      lease: c.lease && c.lease.until > now() ? { by: c.lease.by, name: c.members.find((m) => m.id === c.lease.by)?.name || '' } : null,
      monuments: c.monuments || [], news: (c.news || []).slice(-12), newsN: c.newsN | 0, river: c.river || null,
    };
  }

  // ------------------------------------------------------------------------------------------- Saturday: the rivers
  /** A Rikus crew's tower near `h` metres: Stapel's blocks stacked by a robot (mostly Goed, now and then Perfek or Skeef). */
  function botTower(seed, h) {
    const rng = createRng(`rikus-toring/${seed}`);
    const shapes = Object.keys(SHAPE_PX).filter((s) => s !== 'log');
    const floors = [];
    let y = 0;
    let id = 0;
    while (y < h && floors.length < 400) {
      const s = rng.pick(shapes);
      const k = Math.round(rng.float(0.85, 1.1) * 100) / 100;
      const q = rng.chance(0.25) ? 'P' : rng.chance(0.2) ? 'S' : 'G';
      const f = { id: ++id, s, k, c: rng.int(0, 5), x: Math.round(rng.float(-0.6, 0.6) * 100) / 100, y: Math.round(y * 100) / 100, r: q === 'S' ? Math.round(rng.float(-0.06, 0.06) * 1000) / 1000 : 0, q, sk: 'kleur', by: 'RIKUS', d: '', cr: 0, p: rng.int(0, 2) };
      floors.push(f);
      y += (SHAPE_PX[s][1] * k) / 25;
    }
    return withAdds(floors);
  }
  /** Saturday's rivers for week `wk`: crews with a ticket holder, tallest together, four to a river, Rikus crews filling. */
  async function groupRivers(wk) {
    const idx = (await get(wKey(wk))) || { crews: [], rivers: [], grouped: false };
    if (idx.grouped) return idx;
    const live = [];
    for (const id of idx.crews) {
      const c = await get(cKey(id));
      if (!c || !c.members.length || c.week !== wk) continue;
      let ticket = false;
      for (const m of c.members) {
        const p = await get(pKey(m.id));
        if (p && p.week === wk && weekStats(p.days || {}, wk).ticket) ticket = true;
      }
      if (ticket) live.push({ c, h: heightOf(c.floors) });
    }
    live.sort((a, b) => b.h - a.h || (a.c.id < b.c.id ? -1 : 1));
    for (let i = 0; i < live.length; i += SPAN.riverCrews) {
      const group = live.slice(i, i + SPAN.riverCrews);
      let rid = newSpanId();
      while (await get(rKey(rid))) rid = newSpanId();
      const salt = newSpanId();
      const mid = group.length ? group[Math.floor(group.length / 2)].h : 30;
      const bots = {};
      const crews = group.map((g) => g.c.id);
      for (let b = 0; crews.length < SPAN.riverCrews; b++) {
        const bid = `RIKUS${b}`;
        const h = Math.max(12, mid * (0.8 + 0.3 * createRng(`${rid}/${bid}`).next()));
        bots[bid] = { id: bid, name: BOT_NAMES[b % BOT_NAMES.length], floors: botTower(`${rid}/${bid}`, h), people: 20 + b * 7, repair: 0, acts: 0, inRiver: 0 };
        crews.push(bid);
      }
      const r = { id: rid, week: wk, crews, bots, salt, whistle: whistleAt(wk, rid, salt), leader: null, prevLeader: null, prevUntil: 0, log: [], final: null };
      for (const g of group) {
        g.c.river = rid;
        put(cKey(g.c.id), g.c);
      }
      put(rKey(rid), r);
      idx.rivers.push(rid);
    }
    idx.grouped = true;
    put(wKey(wk), idx);
    // (privacy) old weeks' rivers go: standings, bombs and news of six weeks back and before (a few weeks, in case none looked)
    for (let k = SPAN.keepWeeks; k < SPAN.keepWeeks + 5; k++) {
      const old = plusDays(wk, -7 * k);
      const oi = await get(wKey(old));
      if (!oi) continue;
      for (const rid of oi.rivers || []) del(rKey(rid));
      del(wKey(old));
    }
    return idx;
  }
  async function towerOf(r, id) {
    if (r.bots[id]) return { floors: r.bots[id].floors, name: r.bots[id].name, bot: true };
    const c = await get(cKey(id));
    return c ? { floors: c.floors, name: c.name, bot: false, c } : { floors: [], name: '', bot: false };
  }
  /** Heights now, the tallest (a tie keeps the one who got there first), and a change of leader remembered (its grace). */
  async function standings(r, t) {
    const rows = [];
    for (const id of r.crews) {
      const tw = await towerOf(r, id);
      rows.push({ id, name: tw.name, h: heightOf(tw.floors), bot: tw.bot, n: tw.floors.length });
    }
    let lead = rows.reduce((b, x) => (x.h > (b?.h ?? -1) ? x : b), null);
    const cur = rows.find((x) => x.id === r.leader);
    if (cur && lead && cur.h >= lead.h) lead = cur;
    if (lead && lead.id !== r.leader && lead.h > 0) {
      r.prevLeader = r.leader;
      r.prevUntil = t + SPAN.leaderGraceMs;
      r.leader = lead.id;
    }
    return rows.map((x) => ({ ...x, leader: x.id === r.leader }));
  }
  /** Rikus's crews: what they did since the last call (catch-up), at fixed moments through Saturday. */
  async function botsAct(r, t) {
    const open = sastAt(saturdayOf(r.week), SPAN.startHour);
    const end = Math.min(t, r.whistle);
    if (end <= open) return;
    const span = r.whistle - open;
    for (const id of Object.keys(r.bots)) {
      const b = r.bots[id];
      while (b.acts < BOT_ACTS) {
        const at = open + ((b.acts + 0.5 + (id.charCodeAt(5) % 3) * 0.1) / BOT_ACTS) * span;
        if (at > end) break;
        b.acts++;
        const rng = createRng(`${r.id}/${id}/act${b.acts}`);
        await standings(r, at);
        if (r.leader && r.leader !== id) {
          // two bombs at the tallest tower (a robot's aim: anywhere on it)
          const tw = await towerOf(r, r.leader);
          let floors = tw.floors;
          let lost = 0;
          for (let k = 0; k < 2 && floors.length; k++) {
            const f = floors[rng.int(0, floors.length - 1)];
            const res = hit(floors, floors.indexOf(f));
            floors = res.floors;
            lost += res.lost;
            if (!res.cracked && res.removed.length) await landed(r, r.leader, res, b.name, at);
          }
          await setFloors(r, r.leader, floors);
          if (lost > 0) r.log.push({ at, kind: 'bomb', by: id, on: r.leader, lost: Math.round(lost * 10) / 10 });
        }
        // and a few floors of its own
        const add = botTower(`${r.id}/${id}/bou${b.acts}`, rng.float(5, 12)).map((f) => ({ ...f }));
        const top = heightOf(b.floors);
        const maxId = b.floors.reduce((m, f) => Math.max(m, f.id | 0), 0);
        b.floors = withAdds([...b.floors, ...add.map((f, i) => ({ ...f, id: maxId + i + 1, y: Math.round((f.y + top) * 100) / 100 }))]);
      }
    }
  }
  async function setFloors(r, id, floors) {
    if (r.bots[id]) {
      r.bots[id].floors = floors;
      return;
    }
    const c = await get(cKey(id));
    if (c) {
      c.floors = floors;
      put(cKey(id), c);
    }
  }
  /** A hit landed on crew `id`'s tower: its people into the river, a repair block for the crew, the news. */
  async function landed(r, id, res, byName, at) {
    if (r.bots[id]) {
      r.bots[id].inRiver += res.people;
      return;
    }
    const c = await get(cKey(id));
    if (!c) return;
    c.inRiver = Math.min(SPAN.riverPeopleMax, (c.inRiver | 0) + res.people);
    c.people = Math.max(0, (c.people | 0) - res.people);
    c.repair = Math.min(SPAN.repairMax, (c.repair | 0) + SPAN.repairPerHit);
    addNews(c, { kind: 'bombed', who: byName, lost: Math.round(res.lost * 10) / 10, people: res.people, at });
    put(cKey(c.id), c);
  }
  /** After the whistle: the order (tallest first), the coins for each crew's members, once. */
  async function settle(r, t) {
    if (r.final || t < r.whistle) return;
    const rows = await standings(r, r.whistle);
    const order = [...rows].sort((a, b) => b.h - a.h).map((x) => x.id);
    r.final = { order, at: r.whistle, heights: Object.fromEntries(rows.map((x) => [x.id, x.h])) };
    for (const [i, id] of order.entries()) {
      if (r.bots[id]) continue;
      const c = await get(cKey(id));
      if (!c) continue;
      addNews(c, { kind: 'saturday', place: i + 1, of: order.length, at: r.whistle });
      put(cKey(id), c);
      for (const m of c.members) {
        const p = await get(pKey(m.id));
        if (!p) continue;
        p.prize = { week: r.week, place: i + 1, coins: SPAN.prize[i] || 0, paid: false };
        put(pKey(m.id), p);
      }
    }
  }
  async function riverView(rid, t) {
    if (!rid) return null;
    const r = await get(rKey(rid));
    if (!r) return null;
    await botsAct(r, t);
    await settle(r, t);
    const rows = await standings(r, Math.min(t, r.whistle));
    put(rKey(rid), r);
    const towers = {};
    for (const id of r.crews) towers[id] = (await towerOf(r, id)).floors;
    return {
      id: r.id, week: r.week, rows, towers, leader: r.leader, final: r.final,
      // (nobody may know the whistle's time beforehand: only that it has blown)
      over: t >= r.whistle, log: r.log.slice(-20),
    };
  }

  // ------------------------------------------------------------------------------------------- the routes
  async function open(b) {
    const p = await opened(b.id, b.key);
    if (!p) return [p === null ? 404 : 403, { error: p === null ? 'player' : 'key' }];
    rollPlayer(p, now());
    return p;
  }
  async function sync(b) {
    if (!isSpanId(b.id) || !isSpanKey(b.key)) return [400, { error: 'id' }];
    const t = now();
    let p = await opened(b.id, b.key);
    if (p === false) return [403, { error: 'key' }];
    if (!p) p = { id: b.id, keyHash: await sha256(b.key), name: '', skin: 'kleur', crew: null, week: '', days: {}, granted: {}, used: 0, rides: {}, bombsUsed: 0, prize: null };
    rollPlayer(p, t);
    if (typeof b.name === 'string') p.name = cleanName(b.name);
    if (typeof b.skin === 'string') p.skin = cleanSkin(b.skin);
    const today = sastOf(t).key;
    const ph = phaseAt(t);
    // the week's Dailies: each day's best height (this week, not after today; Sunday's counts for nothing)
    if (b.days && typeof b.days === 'object') {
      for (const [dk, v] of Object.entries(b.days).slice(0, 14)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dk) || weekOf(dk) !== p.week || dk > plusDays(today, 1)) continue;
        const h = Math.min(2000, Math.max(0, Math.round((Number(v) || 0) * 10) / 10));
        if (!(h > 0)) continue;
        p.days[dk] = Math.max(p.days[dk] || 0, h);
        // a build turn for the day (Mon-Sat; while fewer than turnsMax wait; not after Saturday's whistle)
        if (dowOf(dk) <= 6 && !p.granted[dk] && turnsLeft(p) < SPAN.turnsMax && ph.phase !== 'kroning') p.granted[dk] = 1;
      }
    }
    const c = await crewOf(p);
    const me = c.members.find((m) => m.id === p.id);
    if (me && (me.name !== p.name || me.skin !== p.skin)) {
      me.name = p.name;
      me.skin = p.skin;
      put(cKey(c.id), c);
    }
    // the week's crews (Saturday's grouping looks here)
    const idx = (await get(wKey(c.week))) || { crews: [], rivers: [], grouped: false };
    if (!idx.crews.includes(c.id) && !idx.grouped) {
      idx.crews.push(c.id);
      put(wKey(c.week), idx);
    }
    if (ph.phase !== 'bou' && ph.week === c.week) await groupRivers(c.week);
    const fresh = await get(cKey(c.id));
    const river = await riverView(fresh.river, t);
    // the Saturday prize, once: the phone adds it to the wallet
    let prize = null;
    if (p.prize && !p.prize.paid) {
      prize = { ...p.prize };
      p.prize.paid = true;
    }
    put(pKey(p.id), p);
    return [200, { me: { ...meView(p), prize }, crew: crewView(fresh), river, phase: ph.phase, today }];
  }
  async function make(b) {
    const p = await open(b);
    if (Array.isArray(p)) return p;
    if (crewLocked(now())) return [403, { error: 'locked' }];
    const old = await crewOf(p);
    if (old.members.length > 1) await leaveCrew(p, old);
    else if (old.floors.length && !b.force) return [409, { error: 'tower', heightM: heightOf(old.floors) }];
    else await leaveCrew(p, old);
    const c = await newCrew(p, b.name);
    put(pKey(p.id), p);
    return [200, { crew: crewView(c) }];
  }
  async function join(b) {
    const p = await open(b);
    if (Array.isArray(p)) return p;
    if (!isInvite(b.invite)) return [400, { error: 'invite' }];
    if (crewLocked(now())) return [403, { error: 'locked' }];
    const ref = await get(iKey(b.invite));
    const c = ref?.crew ? await get(cKey(ref.crew)) : null;
    if (!c || !c.members.length) return [404, { error: 'crew' }];
    await rollCrew(c, now());
    if (c.members.some((m) => m.id === p.id)) return [200, { crew: crewView(c), same: true }];
    if (c.members.length >= SPAN.crewMax) return [409, { error: 'full' }];
    const old = await crewOf(p);
    // (your own tower stays where it was: a crew of one leaves it as a monument)
    if (old.id !== c.id) await leaveCrew(p, old, 'left');
    c.members.push({ id: p.id, name: p.name || '', skin: p.skin || 'kleur' });
    p.crew = c.id;
    addNews(c, { kind: 'joined', who: p.name || '' });
    put(cKey(c.id), c);
    put(pKey(p.id), p);
    const idx = (await get(wKey(c.week))) || { crews: [], rivers: [], grouped: false };
    if (!idx.crews.includes(c.id) && !idx.grouped) {
      idx.crews.push(c.id);
      put(wKey(c.week), idx);
    }
    return [200, { crew: crewView(c) }];
  }
  async function leave(b) {
    const p = await open(b);
    if (Array.isArray(p)) return p;
    if (crewLocked(now())) return [403, { error: 'locked' }];
    const c = await crewOf(p);
    if (c.members.length === 1) return [200, { crew: crewView(c) }];
    await leaveCrew(p, c);
    const solo = await newCrew(p);
    put(pKey(p.id), p);
    return [200, { crew: crewView(solo) }];
  }
  async function remove(b) {
    const p = await open(b);
    if (Array.isArray(p)) return p;
    if (crewLocked(now())) return [403, { error: 'locked' }];
    const c = await crewOf(p);
    if (c.founder !== p.id) return [403, { error: 'founder' }];
    if (!isSpanId(b.who) || b.who === p.id || !c.members.some((m) => m.id === b.who)) return [400, { error: 'who' }];
    const q = await get(pKey(b.who));
    if (q) {
      await leaveCrew(q, c, 'removed');
      await newCrew(q);
      put(pKey(q.id), q);
    } else {
      c.members = c.members.filter((m) => m.id !== b.who);
      put(cKey(c.id), c);
    }
    return [200, { crew: crewView(await get(cKey(c.id))) }];
  }
  async function rename(b) {
    const p = await open(b);
    if (Array.isArray(p)) return p;
    const c = await crewOf(p);
    if (c.founder !== p.id) return [403, { error: 'founder' }];
    const name = cleanCrewName(b.name);
    if (!name) return [400, { error: 'name' }];
    c.name = name;
    put(cKey(c.id), c);
    return [200, { crew: crewView(c) }];
  }
  async function lease(b) {
    const p = await open(b);
    if (Array.isArray(p)) return p;
    const t = now();
    const c = await crewOf(p);
    const ph = phaseAt(t, c.river ? (await get(rKey(c.river)))?.whistle : null);
    if (ph.phase === 'kroning') return [403, { error: 'kroning' }];
    if (ph.phase === 'uitdaging' && !weekStats(p.days, p.week).ticket) return [403, { error: 'ticket' }];
    if (c.lease && c.lease.until > t && c.lease.by !== p.id) return [409, { error: 'busy', by: c.members.find((m) => m.id === c.lease.by)?.name || '' }];
    const repair = !!b.repair;
    if (!repair && !craneOpen(t, c.river ? (await get(rKey(c.river)))?.whistle : null)) return [403, { error: 'crane' }];
    if (repair ? !(c.repair > 0) : turnsLeft(p) <= 0) return [403, { error: repair ? 'norepair' : 'noturn' }];
    const blocks = repair ? Math.min(SPAN.turnBlocks, c.repair) : SPAN.turnBlocks;
    const id = newSpanId();
    c.lease = { id, by: p.id, until: t + SPAN.leaseMs, repair, blocks, top: heightOf(c.floors) };
    put(cKey(c.id), c);
    const today = sastOf(t).key;
    return [200, { lease: id, floors: c.floors, blocks, repair, seed: repair ? `herbou/${c.week}/${c.repair}` : `${today}/${(p.used | 0) + 1}` }];
  }
  async function build(b) {
    const p = await open(b);
    if (Array.isArray(p)) return p;
    const t = now();
    const c = await crewOf(p);
    const L = c.lease;
    if (!L || L.id !== b.lease || L.by !== p.id) return [409, { error: 'lease' }];
    const before = heightOf(c.floors);
    // (a bomb that landed while you built: your floors were stacked on the taller tower; they come down with it)
    const drop = Number.isFinite(L.top) ? Math.round((before - L.top) * 100) / 100 : 0;
    const list = (Array.isArray(b.floors) ? b.floors.slice(0, L.blocks) : []).map((f) => (f && drop && Number.isFinite(f.y) ? { ...f, y: Math.max(0, f.y + drop) } : f));
    const next = addFloors(c.floors, list, { max: L.blocks, by: p.id, day: sastOf(t).key, skin: p.skin || 'kleur' });
    c.lease = null;
    if (L.repair) c.repair = Math.max(0, (c.repair | 0) - L.blocks);
    else p.used = (p.used | 0) + 1;
    if (next) {
      const was = peopleIn(c.floors);
      c.floors = next;
      c.people = (c.people | 0) + Math.max(0, peopleIn(next) - was);
      addNews(c, { kind: L.repair ? 'repaired' : 'built', who: p.name || '', gain: Math.round((heightOf(next) - before) * 10) / 10 });
    }
    put(cKey(c.id), c);
    put(pKey(p.id), p);
    return [200, { crew: crewView(c), me: meView(p), added: next ? list.length : 0, gain: Math.round((heightOf(c.floors) - before) * 10) / 10 }];
  }
  async function ride(b) {
    const p = await open(b);
    if (Array.isArray(p)) return p;
    const day = sastOf(now()).key;
    if (b.day !== day && b.day !== plusDays(day, -1)) return [400, { error: 'day' }];
    if (p.rides?.[b.day]) return [409, { error: 'done' }];
    const n = Math.max(0, Math.min(SPAN.rescuePerRun, b.rescued | 0));
    const c = await crewOf(p);
    const fromRiver = Math.max(0, Math.min(c.inRiver | 0, b.fromRiver | 0, n));
    p.rides = { ...(p.rides || {}), [b.day]: n || -1 };
    const r = moveIn(c.floors, n);
    c.floors = r.floors;
    c.people = (c.people | 0) + n;
    c.inRiver = Math.max(0, (c.inRiver | 0) - fromRiver);
    if (n) addNews(c, { kind: 'rescued', who: p.name || '', n });
    put(cKey(c.id), c);
    put(pKey(p.id), p);
    return [200, { crew: crewView(c), me: meView(p) }];
  }
  async function bomb(b) {
    const p = await open(b);
    if (Array.isArray(p)) return p;
    const t = now();
    const c = await crewOf(p);
    if (!c.river) return [403, { error: 'river' }];
    const r = await get(rKey(c.river));
    if (!r) return [403, { error: 'river' }];
    if (phaseAt(t, r.whistle).phase !== 'uitdaging') return [403, { error: 'phase' }];
    const ws = weekStats(p.days || {}, p.week);
    if (!ws.ticket) return [403, { error: 'ticket' }];
    const hits = Array.isArray(b.hits) ? b.hits.slice(0, SPAN.bombsPerRun) : [];
    if (!hits.length || hits.length > ws.bombs - (p.bombsUsed | 0)) return [403, { error: 'bombs' }];
    await botsAct(r, t);
    await standings(r, t);
    const target = b.target;
    const ok = target !== c.id && r.crews.includes(target) && (target === r.leader || (target === r.prevLeader && t < r.prevUntil));
    if (!ok) return [409, { error: 'leader', leader: r.leader }];
    let floors = (await towerOf(r, target)).floors;
    const out = [];
    let lost = 0;
    for (const hh of hits) {
      const x = Number(hh?.x);
      const y = Number(hh?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { out.push({ miss: true }); continue; }
      const i = floorAt(floors, x, y);
      if (i < 0) { out.push({ miss: true }); continue; }
      const res = hit(floors, i);
      floors = res.floors;
      lost += res.lost;
      out.push({ floor: res.removed[0] ?? null, cracked: res.cracked, removed: res.removed, lost: res.lost });
      if (!res.cracked && res.removed.length) await landed(r, target, res, c.name, t);
    }
    await setFloors(r, target, floors);
    // (your own crew's news: what your bombs did)
    if (out.some((o) => !o.miss)) {
      addNews(c, { kind: 'hit', who: p.name || '', on: (await towerOf(r, target)).name, lost: Math.round(lost * 10) / 10 });
      put(cKey(c.id), c);
    }
    p.bombsUsed = (p.bombsUsed | 0) + hits.length;
    if (lost > 0) r.log.push({ at: t, kind: 'bomb', by: c.id, on: target, lost: Math.round(lost * 10) / 10 });
    r.log = r.log.slice(-60);
    await standings(r, t);
    put(rKey(r.id), r);
    put(pKey(p.id), p);
    return [200, { hits: out, me: meView(p), river: await riverView(r.id, t) }];
  }

  async function one(method, path, body) {
    try {
      const b = body && typeof body === 'object' ? body : {};
      let res;
      if (method === 'GET' && path === '/span/ping') res = [200, { ok: true, v: 1 }];
      else if (method === 'POST' && path === '/span/sync') res = await sync(b);
      else if (method === 'POST' && path === '/span/make') res = await make(b);
      else if (method === 'POST' && path === '/span/join') res = await join(b);
      else if (method === 'POST' && path === '/span/leave') res = await leave(b);
      else if (method === 'POST' && path === '/span/remove') res = await remove(b);
      else if (method === 'POST' && path === '/span/rename') res = await rename(b);
      else if (method === 'POST' && path === '/span/lease') res = await lease(b);
      else if (method === 'POST' && path === '/span/build') res = await build(b);
      else if (method === 'POST' && path === '/span/ride') res = await ride(b);
      else if (method === 'POST' && path === '/span/bomb') res = await bomb(b);
      else {
        let m = /^\/span\/river\/([A-Z0-9]{8})$/.exec(path);
        if (method === 'GET' && m) {
          const v = isSpanId(m[1]) ? await riverView(m[1], now()) : null;
          res = v ? [200, v] : [404, { error: 'river' }];
        } else if (method === 'GET' && (m = /^\/span\/invite\/([A-Z0-9]{6})$/.exec(path))) {
          const ref = isInvite(m[1]) ? await get(iKey(m[1])) : null;
          const c = ref?.crew ? await get(cKey(ref.crew)) : null;
          res = c && c.members.length ? [200, { name: c.name, n: c.members.length, full: c.members.length >= SPAN.crewMax, names: c.members.map((x) => x.name) }] : [404, { error: 'crew' }];
        } else res = [404, { error: 'not found' }];
      }
      await flush();
      return res;
    } catch (e) {
      dirty.clear();
      loaded.clear();
      orig.clear();
      return [500, { error: 'server' }];
    }
  }

  let queue = Promise.resolve();
  return {
    /** One request: [status, json], after the ones before it. */
    handle(method, path, body) {
      const run = queue.then(() => one(method, path, body));
      queue = run.catch(() => {});
      return run;
    },
  };
}
