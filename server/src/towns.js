// (1.16-1.18) Jou dorp's towns and Die Kasteelreeks's castles on the Worker. One Durable Object (TownHall, SQLite-backed:
// on the Workers Free plan) keeps them all, so a raid settles in one place even while the robbed player is away, the
// same as the home match server does with its file (matchhost.mjs). The rules and the routes are server/src/dorp.js
// and server/src/kasteel.js; the Worker (worker.js) checks the site, the address's limits and the body's size, and
// passes each call here as { method, path, body }:
//   POST /handle  {method, path, body}  -> the route's [status, json] (X-Stapel-Addr: the caller's address, hashed)
//   POST /import  {data, overwrite?}    -> {added, skipped, bad}: towns, raids and castles from the home server's file
//                                          (the owner's carry-over; at most IMPORT_MAX at a time; kept ones stay
//                                          unless `overwrite`)
//   POST /count                         -> {towns, castles, raids}
// The calls run one after the other (dorp.js and kasteel.js queue their own too). A small cache keeps the busiest
// records in memory, so the 15-second polls mostly read nothing from storage; storage itself is written only when a
// record changed.

import { createDorp } from './dorp.js';
import { createKasteel } from './kasteel.js';
import { createSpanServer } from './span.js';
import { createRateLimiter } from './stats.js';

export const NEW_TOWNS_PER_HOUR = 20;   // towns one address may make an hour (every new town starts with a strooptog)
export const IMPORT_MAX = 200;
const CACHE_MAX = 400;
const KEY_RE = /^(dorp:[A-HJ-NP-Z2-9]{8}|kasteel:[A-HJ-NP-Z2-9]{8}|raid:[A-HJ-NP-Z2-9]{10})$/;

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/**
 * A Durable Object's storage as the towns' store ({ get, put }), with the last CACHE_MAX records in memory (and the
 * keys that have none: a town without a castle is asked for one every poll). Every write comes through here, so the
 * memory stays true. What goes in and out are copies (the routes change the records they read and write only some).
 */
const NONE = Symbol('none');
export function storeOn(storage, max = CACHE_MAX) {
  const cache = new Map();
  const remember = (k, v) => {
    cache.delete(k);
    cache.set(k, v);
    if (cache.size > max) cache.delete(cache.keys().next().value);
  };
  return {
    async get(k) {
      if (cache.has(k)) {
        const v = cache.get(k);
        remember(k, v);
        return v === NONE ? undefined : structuredClone(v);
      }
      const v = await storage.get(k);
      remember(k, v === undefined ? NONE : structuredClone(v));
      return v;
    },
    async put(k, v) {
      const copy = structuredClone(v);
      await storage.put(k, copy);
      remember(k, structuredClone(copy));
    },
    forget: () => cache.clear(),
  };
}

/** One record from the home server's file, checked enough that the routes can open it; null if it isn't one. */
function importable(key, v) {
  if (!KEY_RE.test(key) || !v || typeof v !== 'object' || Array.isArray(v)) return null;
  const [kind, id] = key.split(':');
  if (kind === 'dorp') {
    if (v.id !== id || typeof v.keyHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.keyHash)) return null;
    if (!Array.isArray(v.bure) || !Array.isArray(v.news) || !Number.isInteger(v.seq)) return null;
    return v;
  }
  if (kind === 'kasteel') return Array.isArray(v.news) && (v.castle === null || typeof v.castle === 'object') ? { ...v, id } : null;
  return v.raidId === id ? v : null;
}

export class TownHall {
  constructor(state, env, { now = () => Date.now(), rand = Math.random } = {}) {
    this.state = state;
    this.env = env;
    this.now = now;
    this.store = storeOn(state.storage);
    const rate = createRateLimiter();
    this.dorp = createDorp(this.store, { now, rand, newTown: (who) => !who || rate.allow(`new:${who}`, NEW_TOWNS_PER_HOUR, now()) });
    this.kasteel = createKasteel(this.store, { now });
    this.span = createSpanServer(this.store, { now });   // (1.20) Ons dorp: crews, the Weektoring, Saturday
    this.queue = Promise.resolve();
  }

  /** `fn` after every call before it. */
  run(fn) {
    const p = this.queue.then(fn);
    this.queue = p.catch(() => {});
    return p;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    let b;
    try {
      b = await request.json();
    } catch {
      return json(400, { error: 'bad_request' });
    }
    if (!b || typeof b !== 'object') return json(400, { error: 'bad_request' });
    if (url.pathname === '/handle') {
      const method = b.method === 'GET' ? 'GET' : 'POST';
      const path = typeof b.path === 'string' ? b.path : '';
      const who = request.headers.get('X-Stapel-Addr') || '';
      const mod = path.startsWith('/kasteel/') ? this.kasteel : path.startsWith('/dorp/') ? this.dorp : path.startsWith('/span/') ? this.span : null;
      if (!mod) return json(404, { error: 'not found' });
      const [status, out] = await this.run(() => mod.handle(method, path, b.body ?? null, who));
      return json(status, out);
    }
    if (url.pathname === '/import') return this.run(() => this.importTowns(b));
    if (url.pathname === '/count') return this.run(() => this.count());
    return json(404, { error: 'not_found' });
  }

  async importTowns({ data, overwrite = false }) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json(400, { error: 'data' });
    const entries = Object.entries(data);
    if (entries.length > IMPORT_MAX) return json(413, { error: 'too_many', max: IMPORT_MAX });
    let added = 0;
    let skipped = 0;
    const bad = [];
    for (const [key, v] of entries) {
      const rec = importable(key, v);
      if (!rec) {
        bad.push(key.slice(0, 24));
        continue;
      }
      if (!overwrite && (await this.store.get(key)) !== undefined) {
        skipped += 1;
        continue;
      }
      await this.store.put(key, rec);
      added += 1;
    }
    return json(200, { ok: true, added, skipped, bad });
  }

  async count() {
    const n = async (prefix) => (await this.state.storage.list({ prefix })).size;
    return json(200, { ok: true, towns: await n('dorp:'), castles: await n('kasteel:'), raids: await n('raid:') });
  }
}
