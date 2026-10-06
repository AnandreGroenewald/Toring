// Loads the sponsors for the game: sponsors.json (the house ad and any manual entries) and,
// once the sales backend is set up (SPONSOR_API_URL), the live list from the Worker.
//
// Rules of the house:
//   * loadSponsors NEVER throws and never waits longer than `timeoutMs`: a slow or dead network
//     must not delay the first tower.
//   * the last good answers are cached in localStorage ('stapel.sponsors.v1'), so an offline or
//     slow start still shows the sponsors. A cache younger than 5 minutes is used straight away
//     (the server's own answer is cached that long, so nothing newer exists); an older one is only
//     the fallback if the network is slow or down. Either way the network refreshes the cache.
//   * no Phaser, no DOM at import time (the options below let node tests inject fetch/storage).

import { normalizeFeed } from './core/sponsors.js';
import { dateKeyFor } from './core/daily.js';

export const FEED_CACHE_KEY = 'stapel.sponsors.v1';
/** A cached API answer older than this is not used any more (a sponsor's paid month is longer). */
export const FEED_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Younger than this, the cache is used without waiting for the network (GET /sponsors is cached 5 minutes). */
export const FEED_FRESH_MS = 5 * 60 * 1000;

const HARD_TIMEOUT_MS = 10_000; // a request still running after this is abandoned
const MAX_BODY_CHARS = 256 * 1024;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function getStorage(storage) {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null; // private mode / blocked site data can make even the accessor throw
  }
}

function readCache(storage, now) {
  try {
    const raw = getStorage(storage)?.getItem(FEED_CACHE_KEY);
    const c = raw ? JSON.parse(raw) : null;
    if (!isObj(c)) return null;
    const age = now - Number(c.savedAt);
    const usable = isObj(c.api) && age >= 0 && age <= FEED_CACHE_MAX_AGE_MS;
    return { static: isObj(c.static) ? c.static : null, api: usable ? c.api : null, fresh: usable && age <= FEED_FRESH_MS };
  } catch {
    return null;
  }
}

function writeCache(storage, now, staticJson, apiJson) {
  try {
    getStorage(storage)?.setItem(FEED_CACHE_KEY, JSON.stringify({ v: 1, savedAt: now, static: staticJson, api: apiJson }));
  } catch {
    /* quota or blocked: the cache is only a convenience */
  }
}

/** GET a JSON object. Resolves null on any failure (network, status, size, parse, timeout). */
async function fetchJson(url, fetchFn, hardMs) {
  let timer;
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    timer = setTimeout(() => ctl?.abort(), hardMs);
    if (typeof timer === 'object') timer?.unref?.(); // node: don't keep the process alive for it
    const res = await fetchFn(url, { signal: ctl?.signal, cache: 'no-cache', credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!res || !res.ok) return null;
    const text = await res.text();
    if (typeof text !== 'string' || text.length > MAX_BODY_CHARS) return null;
    const json = JSON.parse(text);
    return isObj(json) ? json : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The answer, or null once `ms` have passed (the request itself keeps running). */
function within(promise, ms) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

function apiEndpoint(apiUrl) {
  return `${String(apiUrl).trim().replace(/\/+$/, '')}/sponsors`;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.apiUrl]      the Worker's base URL (SPONSOR_API_URL); '' = no sales backend
 * @param {string} [opts.staticUrl]   sponsors.json, relative to the page
 * @param {number} [opts.timeoutMs]   how long the caller waits for the network (default 2500)
 * @param {(feed: object) => void} [opts.onUpdate]  called with the fresh feed when a request that
 *                                    outlasted `timeoutMs` (or a background refresh) completes
 * @param {Function} [opts.fetchImpl] default: window.fetch
 * @param {Storage|null} [opts.storage] default: window.localStorage
 * @param {() => number} [opts.now]   default: Date.now
 * @returns {Promise<{ house: {menu: object|null}, block: object[], premium: object[] }>}
 *          the feed from normalizeFeed (see js/core/sponsors.js)
 */
export async function loadSponsors({
  apiUrl = '', staticUrl = 'sponsors.json', timeoutMs = 2500, onUpdate, fetchImpl, storage, now = Date.now,
} = {}) {
  try {
    const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const t = now();
    const today = dateKeyFor(new Date(t));
    const wait = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 2500;
    const cached = readCache(storage, t);
    if (!fetchFn) return normalizeFeed(cached?.static, cached?.api, today);

    const staticP = fetchJson(staticUrl, fetchFn, HARD_TIMEOUT_MS);
    const apiP = apiUrl ? fetchJson(apiEndpoint(apiUrl), fetchFn, HARD_TIMEOUT_MS) : Promise.resolve(null);

    // Whatever finishes later refreshes the cache (and tells the caller), so the NEXT start is current.
    Promise.all([staticP, apiP]).then(([s, a]) => {
      try {
        const staticJson = s ?? cached?.static ?? null;
        const apiJson = apiUrl ? (a ?? cached?.api ?? null) : null;
        if (s || a) writeCache(storage, now(), staticJson, apiJson);
        if (typeof onUpdate === 'function' && (s || a)) onUpdate(normalizeFeed(staticJson, apiJson, dateKeyFor(new Date(now()))));
      } catch {
        /* never let a callback break the game */
      }
    });

    // A cache from the last few minutes means no waiting for the API; otherwise wait (briefly) for it.
    const staticNow = (await within(staticP, wait)) ?? cached?.static ?? null;
    const apiNow = apiUrl ? (cached?.fresh ? cached.api : (await within(apiP, wait)) ?? cached?.api ?? null) : null;
    return normalizeFeed(staticNow, apiNow, today);
  } catch {
    return normalizeFeed(null, null, dateKeyFor(new Date()));
  }
}
