// (1.17) Die Kasteelreeks with friends (the owner, 16 Oct 2026: "The oponent needs to be able to strategize what is the
// best way to defend if they are offline, but I do agree any time"). The server keeps each player's castle (their kept
// Daily Towers, the keep and the defence plan: js/kasteel/rules.js cleanCastle) so a friend can attack it any time; the
// plan fights for its owner. A siege's result comes back as news on the castle ("Jan: 54% · ★★"), with a Wraak.
// Players are Jou dorp's towns (server/src/dorp.js): the same id and secret key, and the same neighbours (a friend's
// link makes two towns neighbours both ways); a castle can only be attacked by its neighbours.
//   GET  /kasteel/ping                               {ok, v}
//   POST /kasteel/save   {id, key, castle}           -> {ok, at}: your castle as your friends will find it
//   POST /kasteel/home   {id, key, seen?}            -> {news, newsN, seenN, friends: [{id, name, at, wins}]}:
//                                                       attacks on your castle, and your neighbours who have one
//   GET  /kasteel/c/<id>                             -> {id, name, castle, at}: a castle to attack
//   POST /kasteel/siege  {id, key, target, stars, destroyed} -> {ok}: a siege of a neighbour's castle, news for them
// The result is the attacker's own word (the battle runs on their phone); the server keeps it within the rules
// (0-3 stars, 0-100 %; half the castle down is a star, so a castle more than half down never "held") and at most one
// result a minute per target, so a castle's news stays readable.
// `store`: { get(key), put(key, value) }, the same store as the towns ('dorp:<id>'); castles are 'kasteel:<id>'.
// Requests run one after the other (a siege and its owner's "seen" both rewrite the castle's record), and a call
// that changes nothing writes nothing (the Workers Free plan's writes a day).

import { cleanCastle, CASTLE } from '../../js/kasteel/rules.js';
import { isTownId, isTownKey, cleanTownName } from '../../js/core/dorp.js';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(text) {
  return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
const SIEGE_GAP_MS = 60 * 1000;
const HALF = 50;   // (js/kasteel/siege.js: half the castle down is the 'half' star)

export function createKasteel(store, { now = () => Date.now() } = {}) {
  const townKey = (id) => `dorp:${id}`;
  const castleKey = (id) => `kasteel:${id}`;

  /** The town `id` when `key` opens it (Jou dorp's identity): null (no such town), false (the wrong key). */
  async function opened(id, key) {
    if (!isTownId(id) || !isTownKey(key)) return false;
    const t = await store.get(townKey(id));
    if (!t) return null;
    return t.keyHash === (await sha256(key)) ? t : false;
  }
  const blank = (id) => ({ id, castle: null, at: 0, news: [], newsN: 0, seenN: 0, wins: 0, last: {} });

  async function save(b) {
    const t = await opened(b.id, b.key);
    if (t === false) return [403, { error: 'key' }];
    if (!t) return [404, { error: 'town' }];
    const castle = cleanCastle(b.castle);
    if (!castle) return [400, { error: 'castle' }];
    const k = (await store.get(castleKey(t.id))) || blank(t.id);
    if (k.castle && JSON.stringify(k.castle) === JSON.stringify(castle)) return [200, { ok: true, at: k.at }];   // (the same castle again)
    k.castle = castle;
    k.at = now();
    await store.put(castleKey(t.id), k);
    return [200, { ok: true, at: k.at }];
  }

  async function home(b) {
    const t = await opened(b.id, b.key);
    if (t === false) return [403, { error: 'key' }];
    if (!t) return [404, { error: 'town' }];
    const k = (await store.get(castleKey(t.id))) || blank(t.id);
    if (Number.isInteger(b.seen)) {
      const seenN = Math.max(k.seenN, Math.min(b.seen, k.newsN));
      if (seenN !== k.seenN) {
        k.seenN = seenN;
        if (k.castle) await store.put(castleKey(t.id), k);
      }
    }
    const friends = [];
    for (const id of t.bure || []) {
      const c = await store.get(castleKey(id));
      if (!c?.castle) continue;
      const bt = await store.get(townKey(id));
      friends.push({ id, name: cleanTownName(bt?.name) || 'Bouer', at: c.at, wins: c.wins | 0 });
    }
    friends.sort((x, y) => y.at - x.at);   // (the freshest castles first)
    return [200, { news: k.news, newsN: k.newsN, seenN: k.seenN, friends, saved: !!k.castle }];
  }

  async function siege(b) {
    const t = await opened(b.id, b.key);
    if (t === false) return [403, { error: 'key' }];
    if (!t) return [404, { error: 'town' }];
    if (!isTownId(b.target) || b.target === t.id) return [400, { error: 'target' }];
    if (!(t.bure || []).includes(b.target)) return [403, { error: 'buur' }];   // (only a neighbour's castle)
    const k = await store.get(castleKey(b.target));
    if (!k?.castle) return [404, { error: 'castle' }];
    const destroyed = Math.max(0, Math.min(100, b.destroyed | 0));
    // (more than half down is the 'half' star: such a castle didn't hold, whatever the stars the phone counted)
    const stars = Math.max(destroyed >= HALF ? 1 : 0, Math.min(3, b.stars | 0));
    const at = now();
    const last = (k.last || {})[t.id] || 0;
    if (at - last < SIEGE_GAP_MS) return [429, { error: 'soon' }];
    // (who attacked when, for the gap: only the last minute's)
    k.last = Object.fromEntries(Object.entries(k.last || {}).filter(([, v]) => Number.isFinite(v) && at - v < SIEGE_GAP_MS));
    k.last[t.id] = at;
    k.newsN += 1;
    k.news.push({ n: k.newsN, from: t.id, name: cleanTownName(t.name) || 'Bouer', stars, destroyed, at });
    if (k.news.length > CASTLE.news) k.news.splice(0, k.news.length - CASTLE.news);
    if (!stars) k.wins = (k.wins | 0) + 1;   // (a castle that held: its owner's plan won)
    await store.put(castleKey(b.target), k);
    return [200, { ok: true }];
  }

  async function one(method, path, body) {
    try {
      if (method === 'GET' && path === '/kasteel/ping') return [200, { ok: true, v: 1 }];
      const b = body && typeof body === 'object' ? body : {};
      if (method === 'POST' && path === '/kasteel/save') return await save(b);
      if (method === 'POST' && path === '/kasteel/home') return await home(b);
      if (method === 'POST' && path === '/kasteel/siege') return await siege(b);
      const m = /^\/kasteel\/c\/([A-Z0-9]{8})$/.exec(path);
      if (method === 'GET' && m) {
        if (!isTownId(m[1])) return [404, { error: 'castle' }];
        const k = await store.get(castleKey(m[1]));
        if (!k?.castle) return [404, { error: 'castle' }];
        const t = await store.get(townKey(m[1]));
        return [200, { id: m[1], name: cleanTownName(t?.name) || 'Bouer', castle: k.castle, at: k.at }];
      }
      return [404, { error: 'not found' }];
    } catch {
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
