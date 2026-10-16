// (1.16) Jou dorp: Steel en Wraak (js/core/dorp.js has the rules and the owner's words). The server keeps every town:
// its people, strooptogte (raids) and walls, its neighbours and its news, and settles each raid in one place, so a
// raid lands even while the robbed player is away and both phones see the same towns. A town is opened by its own
// phone's secret key (the server keeps only the key's SHA-256); its id is public (friends' links carry it).
//   GET  /dorp/ping                  {ok, v}: this server knows the towns (the game asks the front door, GET /, for
//                                    `dorp`: an older Worker's says nothing, and the game shows no town button)
//   POST /dorp/sync   {id, key, name, tribe, gains: [{seq, people, raids, walls}], seen}
//                                    -> {town, news, bure}: what the phone's games brought, once each (seq)
//   POST /dorp/raid   {id, key, target, wraak?, hit?}  -> {raidId, took, goldTook, blocked, wraak, town, them}
//                                    (hit: the tap's aim, 'P' | 'G' | 'S', js/core/dorp.js DORP.hitMul)
//   POST /dorp/buur   {id, key, buur}            -> {them}: neighbours both ways (a friend's link)
//   POST /dorp/mark   {id, key, mark}            -> {town}: a landmark bought (the coins are the phone's own wallet)
// Robot Rikus (target 'RIKUS') is every town's first neighbour, kept inside the town's own record: he refills over
// time and, now and then, raids back a while after being raided (applied at the next sync). `collect: <dayKey>` in a
// sync brings the landmarks' tourists once a day.
//   GET  /dorp/raid/<raidId>                     -> the raid as its link shows it (who robbed whom, how many)
//   GET  /dorp/town/<id>                         -> a town as its neighbours see it
// `store`: { get(key), put(key, value) } (async; the host keeps it: matchhost.mjs a file, the Worker later its own).

import {
  DORP, DORP_TRIBES, DORP_BEATS, RIKUS, RIKUS_ID, raidTake, goldTake, cleanHit, isTownId, isTownKey, isRaidId, newRaidId,
  cleanTownName, cleanGain, markOf, cleanMarks, touristsOf, isDayKey,
} from '../../js/core/dorp.js';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(text) {
  return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export function createDorp(store, { now = () => Date.now(), rand = Math.random } = {}) {
  const townKey = (id) => `dorp:${id}`;
  const raidKey = (id) => `raid:${id}`;

  /** The town `id` when `key` opens it: null (no such town), false (the wrong key). */
  async function opened(id, key) {
    if (!isTownId(id) || !isTownKey(key)) return false;
    const t = await store.get(townKey(id));
    if (!t) return null;
    return t.keyHash === (await sha256(key)) ? t : false;
  }

  /** A town as its owner sees it. */
  const mine = (t) => ({ id: t.id, name: t.name, tribe: t.tribe, people: t.people, raids: t.raids, walls: t.walls, gold: t.gold | 0, marks: cleanMarks(t.marks), seq: t.seq, newsN: t.newsN, seenN: t.seenN });

  /** A town as a neighbour sees it; `me` (the one looking): the raid they may still avenge on it. */
  function pub(t, me = null) {
    const owed = me ? [...me.news].reverse().find((n) => n.from === t.id && n.took > 0 && !n.wraaked) : null;
    return { id: t.id, name: t.name, tribe: t.tribe, people: t.people, walls: t.walls, gold: t.gold | 0, marks: cleanMarks(t.marks), at: t.at, wraak: owed ? owed.raidId : null };
  }

  // ------------------------------------------------------------------------------------------------- Robot Rikus
  const rikusTribe = (t) => DORP_BEATS[t.tribe] || 'gras';   // (the one yours beats: your raids on him are extra strong)
  /** Rikus's town inside `t` (made on first use), refilled towards his goal and his golden person back each day. */
  function rikusOf(t, dayKey = null) {
    const at = now();
    if (!t.rikus || typeof t.rikus !== 'object') t.rikus = { people: RIKUS.start, at, gold: RIKUS.gold, goldDay: dayKey, back: null };
    const rk = t.rikus;
    const goal = Math.max(RIKUS.min, Math.round((t.people | 0) * RIKUS.share));
    if (rk.people < goal) {
      const hours = Math.max(0, (at - (rk.at || at)) / 3600000);
      rk.people = Math.min(goal, rk.people + Math.ceil(goal * RIKUS.refillPerHour * hours));
    }
    rk.at = at;
    if (isDayKey(dayKey) && rk.goldDay !== dayKey) {
      rk.goldDay = dayKey;
      rk.gold = Math.max(rk.gold | 0, RIKUS.gold);
    }
    return rk;
  }
  function rikusPub(t) {
    const rk = rikusOf(t);
    const owed = [...t.news].reverse().find((n) => n.from === RIKUS_ID && n.took > 0 && !n.wraaked);
    return { id: RIKUS_ID, name: 'Robot Rikus', tribe: rikusTribe(t), people: rk.people, walls: 0, gold: rk.gold | 0, marks: ['fontein', 'seilboot'], bot: true, wraak: owed ? owed.raidId : null };
  }
  /** His raid back, once its time has come: like anyone's (a wall stops it), with news and a free Wraak. */
  function rikusBack(t) {
    const rk = rikusOf(t);
    if (!rk.back || now() < rk.back.at) return;
    rk.back = null;
    let took = 0;
    let blocked = false;
    if (t.walls > 0) {
      t.walls -= 1;
      blocked = true;
    } else {
      took = raidTake({ people: t.people, mine: rikusTribe(t), theirs: t.tribe });
      t.people -= took;
      rk.people += took;
    }
    t.newsN += 1;
    t.news.push({ n: t.newsN, raidId: newRaidId(), from: RIKUS_ID, name: 'Robot Rikus', tribe: rikusTribe(t), took, goldTook: 0, blocked, wraak: false, hit: 'G', at: now() });
    if (t.news.length > DORP.newsMax) t.news.splice(0, t.news.length - DORP.newsMax);
  }
  async function raidRikus(t, b) {
    const rk = rikusOf(t);
    const owed = isRaidId(b.wraak) ? t.news.find((n) => n.raidId === b.wraak && n.from === RIKUS_ID && n.took > 0 && !n.wraaked) : null;
    if (!owed) {
      if (t.raids < 1) return [409, { error: 'raids', town: mine(t) }];
      t.raids -= 1;
    } else {
      owed.wraaked = true;
    }
    const hit = cleanHit(b.hit);
    const took = raidTake({ people: rk.people, mine: t.tribe, theirs: rikusTribe(t), wraak: !!owed, hit });
    const goldTook = goldTake({ gold: rk.gold | 0, people: rk.people, took, rand });
    rk.people -= took;
    t.people += took;
    rk.gold = Math.max(0, (rk.gold | 0) - goldTook);
    t.gold = (t.gold | 0) + goldTook;
    if (!rk.back && !owed && rand() < RIKUS.backChance) rk.back = { at: now() + RIKUS.backAfterMs };
    await store.put(townKey(t.id), t);
    return [200, { raidId: null, took, goldTook, blocked: false, wraak: !!owed, hit, bot: true, town: mine(t), them: rikusPub(t) }];
  }

  function addBuur(t, id) {
    if (t.id === id || t.bure.includes(id)) return;
    t.bure.push(id);
    if (t.bure.length > DORP.bureMax) t.bure.splice(0, t.bure.length - DORP.bureMax);
  }

  async function bureOf(t) {
    const out = [];
    for (const id of t.bure) {
      const b = await store.get(townKey(id));
      if (b) out.push(pub(b, t));
    }
    // the most people first (who is worth a raid)
    return out.sort((a, b) => b.people - a.people);
  }

  async function sync(b) {
    let t = await opened(b.id, b.key);
    if (t === false) return [403, { error: 'key' }];
    if (!t) {
      t = {
        id: b.id, keyHash: await sha256(b.key), name: 'Bouer', tribe: 'vuur',
        people: 0, raids: DORP.startRaids, walls: 0, gold: 0, marks: [], tourDay: null, seq: 0, bure: [], news: [], newsN: 0, seenN: 0, made: now(), at: now(),
      };
    }
    const name = cleanTownName(b.name);
    if (name) t.name = name;
    if (DORP_TRIBES.includes(b.tribe)) t.tribe = b.tribe;
    const gains = (Array.isArray(b.gains) ? b.gains : []).slice(0, DORP.gainsMax).map(cleanGain).filter(Boolean).sort((x, y) => x.seq - y.seq);
    for (const g of gains) {
      if (g.seq <= t.seq) continue;   // (already counted: a report sent again after a lost answer)
      t.people += g.people;
      t.raids = Math.min(DORP.raidsMax, t.raids + g.raids);
      t.walls = Math.min(DORP.wallsMax, t.walls + g.walls);
      t.gold = Math.min(t.people, (t.gold | 0) + g.gold);
      t.seq = g.seq;
    }
    // the landmarks' tourists: once a day, on the first visit
    let tourists = 0;
    if (isDayKey(b.collect) && t.tourDay !== b.collect && touristsOf(t.marks) > 0) {
      // (a day without landmarks isn't used up: the first landmark's tourists come on the next visit, that same day)
      tourists = touristsOf(t.marks);
      t.tourDay = b.collect;
      t.people += tourists;
    }
    rikusOf(t, isDayKey(b.collect) ? b.collect : null);
    rikusBack(t);
    if (Number.isInteger(b.seen)) t.seenN = Math.max(t.seenN, Math.min(b.seen, t.newsN));
    t.at = now();
    await store.put(townKey(t.id), t);
    return [200, { town: mine(t), news: t.news, bure: [rikusPub(t), ...(await bureOf(t))], ...(tourists ? { tourists } : {}) }];
  }

  async function raid(b) {
    const t = await opened(b.id, b.key);
    if (!t) return [403, { error: 'key' }];
    if (b.target === RIKUS_ID) return raidRikus(t, b);
    if (!isTownId(b.target) || b.target === t.id) return [400, { error: 'target' }];
    const them = await store.get(townKey(b.target));
    if (!them) return [404, { error: 'target' }];
    // a Wraak: their raid on this town, not yet avenged, costs nothing and hits harder
    const owed = isRaidId(b.wraak) ? t.news.find((n) => n.raidId === b.wraak && n.from === them.id && n.took > 0 && !n.wraaked) : null;
    if (!owed) {
      if (!t.bure.includes(them.id)) return [403, { error: 'buur' }];
      if (t.raids < 1) return [409, { error: 'raids', town: mine(t) }];
      t.raids -= 1;
    } else {
      owed.wraaked = true;
    }
    const raidId = newRaidId();
    let took = 0;
    let goldTook = 0;
    let blocked = false;
    const hit = cleanHit(b.hit);
    if (them.walls > 0) {
      them.walls -= 1;   // the wall holds, and breaks
      blocked = true;
    } else {
      took = raidTake({ people: them.people, mine: t.tribe, theirs: them.tribe, wraak: !!owed, hit });
      goldTook = goldTake({ gold: them.gold | 0, people: them.people, took, rand });
      them.people -= took;
      t.people += took;
      them.gold = Math.max(0, (them.gold | 0) - goldTook);
      t.gold = (t.gold | 0) + goldTook;
    }
    addBuur(t, them.id);
    addBuur(them, t.id);
    const at = now();
    them.newsN += 1;
    them.news.push({ n: them.newsN, raidId, from: t.id, name: t.name, tribe: t.tribe, took, goldTook, blocked, wraak: !!owed, hit, at });
    if (them.news.length > DORP.newsMax) them.news.splice(0, them.news.length - DORP.newsMax);
    await store.put(townKey(t.id), t);
    await store.put(townKey(them.id), them);
    await store.put(raidKey(raidId), { raidId, from: t.id, name: t.name, tribe: t.tribe, to: them.id, toName: them.name, took, blocked, wraak: !!owed, at });
    return [200, { raidId, took, goldTook, blocked, wraak: !!owed, hit, town: mine(t), them: pub(them, t) }];
  }

  async function mark(b) {
    const t = await opened(b.id, b.key);
    if (!t) return [403, { error: 'key' }];
    if (!markOf(b.mark)) return [400, { error: 'mark' }];
    t.marks = cleanMarks([...(t.marks || []), b.mark]);
    await store.put(townKey(t.id), t);
    return [200, { town: mine(t) }];
  }

  async function buur(b) {
    const t = await opened(b.id, b.key);
    if (!t) return [403, { error: 'key' }];
    if (!isTownId(b.buur) || b.buur === t.id) return [400, { error: 'buur' }];
    const them = await store.get(townKey(b.buur));
    if (!them) return [404, { error: 'buur' }];
    addBuur(t, them.id);
    addBuur(them, t.id);
    await store.put(townKey(t.id), t);
    await store.put(townKey(them.id), them);
    return [200, { them: pub(them, t) }];
  }

  return {
    /** One request: [status, json]. */
    async handle(method, path, body) {
      try {
        if (method === 'GET' && path === '/dorp/ping') return [200, { ok: true, v: 1 }];
        const b = body && typeof body === 'object' ? body : {};
        if (method === 'POST' && path === '/dorp/sync') return await sync(b);
        if (method === 'POST' && path === '/dorp/raid') return await raid(b);
        if (method === 'POST' && path === '/dorp/buur') return await buur(b);
        if (method === 'POST' && path === '/dorp/mark') return await mark(b);
        let m = /^\/dorp\/raid\/([A-Z0-9]{10})$/.exec(path);
        if (method === 'GET' && m) {
          const r = isRaidId(m[1]) ? await store.get(raidKey(m[1])) : null;
          return r ? [200, r] : [404, { error: 'raid' }];
        }
        m = /^\/dorp\/town\/([A-Z0-9]{8})$/.exec(path);
        if (method === 'GET' && m) {
          const t = isTownId(m[1]) ? await store.get(townKey(m[1])) : null;
          return t ? [200, pub(t)] : [404, { error: 'town' }];
        }
        return [404, { error: 'not found' }];
      } catch {
        return [500, { error: 'server' }];
      }
    },
  };
}
