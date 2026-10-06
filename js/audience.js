// Anonymous audience counts and the daily percentile — the network side.
//
// Rules of the house (same as js/sponsorsFeed.js):
//   * nothing happens without SPONSOR_API_URL, and nothing here ever throws or waits for the network
//     in a way the game could notice: stats go out with sendBeacon (fire and forget), the percentile
//     is fetched in the background and the results card simply gets one more line when it arrives;
//   * nothing that identifies a player is sent or kept: see js/core/audience.js for the payload.
//     The only thing remembered on the device is "this day's result was already counted".

import { dayNumber, isDateKey } from './core/daily.js';

const TIMEOUT_MS = 6000;
// text/plain keeps these POSTs "simple" for CORS (no preflight round trip); the Worker reads JSON from it.
const TEXT = 'text/plain;charset=UTF-8';

function base(apiUrl) {
  const u = typeof apiUrl === 'string' ? apiUrl.trim().replace(/\/+$/, '') : '';
  return /^https?:\/\//i.test(u) ? u : '';
}

function fetcher(fetchImpl) {
  if (typeof fetchImpl === 'function') return fetchImpl;
  return typeof fetch === 'function' ? fetch.bind(globalThis) : null;
}

/** Sends one finished game's batch. Fire and forget; returns whether it was handed to the browser. */
export function sendStats(apiUrl, batch, { fetchImpl, navigatorImpl } = {}) {
  try {
    const root = base(apiUrl);
    if (!root || !batch) return false;
    const url = `${root}/stats`;
    const body = JSON.stringify(batch);
    const nav = navigatorImpl === undefined ? globalThis.navigator : navigatorImpl;
    if (nav && typeof nav.sendBeacon === 'function' && typeof Blob === 'function') {
      if (nav.sendBeacon(url, new Blob([body], { type: TEXT }))) return true;
    }
    const f = fetcher(fetchImpl);
    if (!f) return false;
    Promise.resolve(f(url, { method: 'POST', body, headers: { 'Content-Type': TEXT }, keepalive: true, credentials: 'omit' }))
      .catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** A JSON answer, or null on any failure (network, status, timeout, shape). */
async function request(url, init, fetchImpl) {
  const f = fetcher(fetchImpl);
  if (!f) return null;
  let timer;
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    timer = setTimeout(() => ctl?.abort(), TIMEOUT_MS);
    if (typeof timer === 'object') timer?.unref?.();
    const res = await f(url, { ...init, signal: ctl?.signal, cache: 'no-store', credentials: 'omit' });
    if (!res || !res.ok) return null;
    const json = JSON.parse(await res.text());
    return json && typeof json === 'object' && !Array.isArray(json) ? json : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// The daily percentile
// ---------------------------------------------------------------------------

/** Where "already counted" is remembered: one small record, replaced every day (never grows). */
const FLAG_SUFFIX = '.score';

function storageOf(storage) {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

function readFlag(storage, key) {
  try {
    const f = JSON.parse(storageOf(storage)?.getItem(key) || 'null');
    return f && isDateKey(f.dateKey) && Number.isFinite(f.heightM) ? f : null;
  } catch {
    return null;
  }
}

function writeFlag(storage, key, flag) {
  try {
    storageOf(storage)?.setItem(key, JSON.stringify(flag));
  } catch {
    /* blocked or full: the worst case is one more POST on a revisit */
  }
}

const inflight = new Map();

/**
 * How today's result compares with the other players: { percentile, players }, or null when there
 * is nothing to show (no API, offline, a practice game, an empty game).
 *
 * The first time a result of a day is seen it is POSTed and remembered; every later call (revisiting
 * the results) only asks (GET), so a result is counted once per day per device.
 * @param {{ mode: string, dateKey: string, heightM: number, blocksDropped?: number }} result
 * @param {{ apiUrl: string, storageKey: string, fetchImpl?: Function, storage?: Storage|null }} opts
 */
export function dailyPercentile(result, { apiUrl, storageKey, fetchImpl, storage } = {}) {
  try {
    const root = base(apiUrl);
    if (!root || !result || result.mode !== 'daily' || !isDateKey(result.dateKey)) return Promise.resolve(null);
    if (!(result.blocksDropped > 0) || !Number.isFinite(result.heightM)) return Promise.resolve(null);
    const id = result.dateKey;
    if (!inflight.has(id)) {
      const job = lookup(root, result, `${storageKey}${FLAG_SUFFIX}`, fetchImpl, storage).catch(() => null);
      inflight.set(id, job);
      job.finally(() => inflight.delete(id));
    }
    return inflight.get(id);
  } catch {
    return Promise.resolve(null);
  }
}

async function lookup(root, result, key, fetchImpl, storage) {
  const flag = readFlag(storage, key);
  if (flag && flag.dateKey === result.dateKey) {
    const q = `dateKey=${encodeURIComponent(flag.dateKey)}&heightM=${encodeURIComponent(flag.heightM)}`;
    return answer(await request(`${root}/score?${q}`, { method: 'GET', headers: { Accept: 'application/json' } }, fetchImpl));
  }
  const heightM = Math.max(0, Math.min(1000, result.heightM));
  const res = await request(`${root}/score`, {
    method: 'POST',
    headers: { 'Content-Type': TEXT, Accept: 'application/json' },
    body: JSON.stringify({ dateKey: result.dateKey, dayNumber: result.dayNumber ?? dayNumber(result.dateKey), heightM }),
  }, fetchImpl);
  const out = answer(res);
  if (out) writeFlag(storage, key, { dateKey: result.dateKey, heightM });
  return out;
}

function answer(json) {
  if (!json || !Number.isFinite(json.players)) return null;
  return { percentile: Number.isFinite(json.percentile) ? json.percentile : null, players: json.players };
}
