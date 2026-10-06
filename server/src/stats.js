// Anonymous audience counts and the daily percentile. Nothing here identifies a player:
//   * POST /stats  one small batch per finished game, added to per-day counters (stats_daily)
//   * POST /score  one Daaglikse Toring result, added to a per-day histogram (daily_scores)
//   * GET  /score  the percentile of a result that was posted earlier (revisiting the results)
// The visitor's address is only used to rate-limit: it is hashed with a salt that changes every
// day, kept in this isolate's memory for at most an hour, and never written anywhere.

import * as db from './db.js';
import { addDays, dayNumber, isDateKey } from '../../js/core/daily.js';
import { hashIp } from './crypto.js';
import { HttpError, clientIp, json, readBody } from './http.js';
import { isOriginAllowed } from './config.js';

export const STATS_MAX_BYTES = 4096;
export const MAX_SHOWS_PER_SPONSOR = 60; // names on blocks of one sponsor in one game
export const MAX_SHOWS_PER_GAME = 120; // all sponsors together
export const MAX_BLOCK_KEYS = 50;
export const MAX_HEIGHT_M = 1000;
export const BUCKET_M = 0.5;
export const METRICS = ['games_daily', 'games_practice', 'block_shows', 'billboard_games', 'menu_views'];

const HOUR_MS = 60 * 60 * 1000;
const MAX_TRACKED = 5000;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 'YYYY-MM-DD' (UTC) of an epoch ms. */
export const utcDateKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// ---------------------------------------------------------------- rate limit (memory only)

/** Fixed-window counters keyed by an opaque string. Bounded; resets with the isolate. */
export function createRateLimiter() {
  const hits = new Map();
  return {
    /** Counts one hit; false when `key` is over `limit` for the current hour. */
    allow(key, limit, now) {
      let e = hits.get(key);
      if (!e || now - e.start >= HOUR_MS) {
        if (hits.size >= MAX_TRACKED) {
          for (const [k, v] of hits) if (now - v.start >= HOUR_MS) hits.delete(k);
          if (hits.size >= MAX_TRACKED) hits.clear(); // under attack: forget everyone rather than grow
        }
        e = { start: now, n: 0 };
        hits.set(key, e);
      }
      e.n++;
      return e.n <= limit;
    },
    size: () => hits.size,
  };
}

async function limit(ctx, request, kind, perHour) {
  // Salt = secret + the UTC date, so an address hashes differently every day and the hash can't be
  // linked from one day to the next (nor reversed without the secret).
  const ip = clientIp(request);
  const key = ip ? await hashIp(ip, `${ctx.cfg.ipSalt}:${utcDateKey(ctx.now)}`) : 'no-address';
  if (!ctx.rate.allow(`${kind}:${key}`, perHour, ctx.now)) throw new HttpError(429, 'rate_limited');
}

function checkOrigin(request, cfg) {
  const origin = request.headers.get('Origin');
  if (origin && !isOriginAllowed(origin, cfg.allowedOrigins)) throw new HttpError(403, 'forbidden_origin');
}

// ---------------------------------------------------------------- validation

/**
 * The game sends text/plain with sendBeacon (no CORS preflight needed), a fetch may send JSON.
 * Both are plain JSON in the body.
 */
async function readBatch(request) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('application/json') && !type.startsWith('text/plain')) throw new HttpError(415, 'unsupported_media_type');
  const bytes = await readBody(request, STATS_MAX_BYTES);
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, 'bad_request');
  }
  if (!isObj(body)) throw new HttpError(400, 'bad_request');
  return body;
}

/** A date key of today +/- 1 day (the player's local day can be a day ahead of or behind UTC). */
function checkDateKey(value, now) {
  if (!isDateKey(value)) throw new HttpError(400, 'invalid_field', { field: 'dateKey' });
  const today = utcDateKey(now);
  if (value < addDays(today, -1) || value > addDays(today, 1)) throw new HttpError(400, 'invalid_field', { field: 'dateKey' });
  return value;
}

const clampInt = (v, max) => Math.min(max, Math.max(0, Math.floor(Number(v))));

/**
 * Turns a posted batch into the counter increments, ignoring everything that isn't certain.
 * @param {object} body
 * @param {Set<string>} liveIds  ids of the sponsors that are live right now
 * @returns {{ dateKey: string, items: {dateKey: string, metric: string, sponsorId: string, n: number}[] }}
 */
export function validateStats(body, liveIds, now) {
  const dateKey = checkDateKey(body.dateKey, now);
  if (body.mode !== 'daily' && body.mode !== 'practice') throw new HttpError(400, 'invalid_field', { field: 'mode' });
  if (body.blocks != null && !isObj(body.blocks)) throw new HttpError(400, 'invalid_field', { field: 'blocks' });
  if (body.billboard != null && typeof body.billboard !== 'string') throw new HttpError(400, 'invalid_field', { field: 'billboard' });
  if (body.menu != null && typeof body.menu !== 'boolean') throw new HttpError(400, 'invalid_field', { field: 'menu' });

  const items = [{ dateKey, metric: body.mode === 'daily' ? 'games_daily' : 'games_practice', sponsorId: '', n: 1 }];
  let budget = MAX_SHOWS_PER_GAME;
  for (const [id, raw] of Object.entries(body.blocks || {}).slice(0, MAX_BLOCK_KEYS)) {
    if (!liveIds.has(id) || budget <= 0 || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const n = Math.min(clampInt(raw, MAX_SHOWS_PER_SPONSOR), budget);
    if (n <= 0) continue;
    budget -= n;
    items.push({ dateKey, metric: 'block_shows', sponsorId: id, n });
  }
  if (typeof body.billboard === 'string' && liveIds.has(body.billboard)) {
    items.push({ dateKey, metric: 'billboard_games', sponsorId: body.billboard, n: 1 });
  }
  if (body.menu === true) items.push({ dateKey, metric: 'menu_views', sponsorId: '', n: 1 });
  return { dateKey, items };
}

/** 37.46 m -> bucket 74 (0.5 m wide, 0 to 1000 m). */
export function bucketOf(heightM) {
  const h = Math.min(MAX_HEIGHT_M, Math.max(0, Number(heightM)));
  return Math.floor(h / BUCKET_M + 1e-9);
}

function readHeight(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new HttpError(400, 'invalid_field', { field: 'heightM' });
  return n;
}

/**
 * Share of the OTHER players whose result is below yours; players in your own bucket count half.
 * `players` includes you. `same` is the number of results in your bucket: when it is at least 1 your
 * own result is in there (you posted it), so you are left out of the comparison. null: nobody else yet.
 */
export function percentileOf({ players, below, same }) {
  const self = same >= 1 ? 1 : 0;
  const others = players - self;
  if (others <= 0) return null;
  const ties = Math.max(0, same - self);
  return Math.round((100 * (below + ties / 2)) / others);
}

// ---------------------------------------------------------------- handlers

/** POST /stats */
export async function postStats(request, ctx, liveIds) {
  checkOrigin(request, ctx.cfg);
  await limit(ctx, request, 'stats', ctx.cfg.rate.statsPerHour);
  const { items } = validateStats(await readBatch(request), liveIds, ctx.now);
  await db.addStats(ctx.db, items);
  // sendBeacon always asks for credentials; the page never sends any, but the browser wants this header
  // on the answer or it logs a CORS error in the console.
  return json(200, { ok: true }, { 'Access-Control-Allow-Credentials': 'true' });
}

function scoreAnswer(summary) {
  return { percentile: percentileOf(summary), players: summary.players };
}

/** POST /score — a Daaglikse Toring result. */
export async function postScore(request, ctx) {
  checkOrigin(request, ctx.cfg);
  await limit(ctx, request, 'score', ctx.cfg.rate.scorePerHour);
  const body = await readBatch(request);
  const dateKey = checkDateKey(body.dateKey, ctx.now);
  if (body.dayNumber !== dayNumber(dateKey)) throw new HttpError(400, 'invalid_field', { field: 'dayNumber' });
  const bucket = bucketOf(readHeight(body.heightM));
  return json(200, scoreAnswer(await db.addScore(ctx.db, dateKey, bucket)));
}

/** GET /score?dateKey=&heightM= — same answer without adding anything. */
export async function getScore(request, url, ctx) {
  checkOrigin(request, ctx.cfg);
  await limit(ctx, request, 'score', ctx.cfg.rate.scorePerHour);
  const dateKey = checkDateKey(url.searchParams.get('dateKey'), ctx.now);
  const bucket = bucketOf(readHeight(url.searchParams.get('heightM')));
  return json(200, scoreAnswer(await db.scoreSummary(ctx.db, dateKey, bucket)));
}

// ---------------------------------------------------------------- admin report

const REPORT_MAX_DAYS = 400;

function reportRange(url, now) {
  const to = url.searchParams.get('to') || utcDateKey(now);
  const from = url.searchParams.get('from') || addDays(to, -29);
  if (!isDateKey(from) || !isDateKey(to) || from > to) throw new HttpError(400, 'invalid_range');
  if (addDays(from, REPORT_MAX_DAYS) < to) throw new HttpError(400, 'invalid_range');
  return { from, to };
}

/** GET /admin/stats?from=&to= — totals per day and per sponsor (default: the last 30 days). */
export async function adminStats(url, ctx) {
  const { from, to } = reportRange(url, ctx.now);
  const data = await db.statsBetween(ctx.db, from, to);

  const emptyDay = (dateKey) => ({ dateKey, gamesDaily: 0, gamesPractice: 0, games: 0, blockShows: 0, billboardGames: 0, menuViews: 0 });
  const days = new Map();
  const sponsors = new Map();
  const totals = emptyDay(null);
  delete totals.dateKey;
  const sponsorRow = (id) => {
    if (!sponsors.has(id)) sponsors.set(id, { id, name: null, tier: null, blockShows: 0, billboardGames: 0, blockDays: 0, billboardDays: 0 });
    return sponsors.get(id);
  };

  for (const r of data) {
    const n = Number(r.count) || 0;
    const day = days.get(r.date_key) || days.set(r.date_key, emptyDay(r.date_key)).get(r.date_key);
    const add = (key) => { day[key] += n; totals[key] += n; };
    if (r.metric === 'games_daily') add('gamesDaily');
    else if (r.metric === 'games_practice') add('gamesPractice');
    else if (r.metric === 'menu_views') add('menuViews');
    else if (r.metric === 'block_shows') {
      add('blockShows');
      const s = sponsorRow(r.sponsor_id);
      s.blockShows += n;
      if (n > 0) s.blockDays++;
    } else if (r.metric === 'billboard_games') {
      add('billboardGames');
      const s = sponsorRow(r.sponsor_id);
      s.billboardGames += n;
      if (n > 0) s.billboardDays++;
    }
  }
  for (const d of [...days.values(), totals]) d.games = d.gamesDaily + d.gamesPractice;

  const names = new Map((await db.sponsorNames(ctx.db, [...sponsors.keys()])).map((s) => [s.id, s]));
  for (const s of sponsors.values()) {
    s.name = names.get(s.id)?.name ?? null;
    s.tier = names.get(s.id)?.tier ?? null;
  }
  return json(200, {
    from,
    to,
    now: ctx.now,
    totals,
    days: [...days.values()].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1)),
    sponsors: [...sponsors.values()].sort((a, b) => (b.blockShows + b.billboardGames) - (a.blockShows + a.billboardGames) || (a.id < b.id ? -1 : 1)),
  });
}
