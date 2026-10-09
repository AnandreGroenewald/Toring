// Stapel sponsorship API — Cloudflare Worker entry point (router, CORS, cron).

import * as admin from './admin.js';
import { loadConfig, isOriginAllowed } from './config.js';
import { HttpError, corsHeaders, errorResponse, json, preflight, withHeaders } from './http.js';
import { createPaystack } from './paystack.js';
import { getAvailability, getSponsorsFeed, status, subscribe } from './public.js';
import { runRetention } from './retention.js';
import { refresh } from './billing.js';
import * as db from './db.js';
import * as stats from './stats.js';
import * as board from './board.js';
import { readJsonObject } from './http.js';
import { handleWebhook } from './webhook.js';
import { rand32 } from './match.js';
import { isRoomCode, newRoomCode } from '../../js/core/duel.js';

// Uitdagersreeks: the live-match Durable Objects must be exported by the Worker's main module.
export { MatchLobby, MatchRoom } from './match.js';

const ROOMS_PER_HOUR = 30;   // friend rooms one address may open
const FEED_TTL_MS = { '/sponsors': 30_000, '/availability': 15_000 };
const BROWSER_CACHE = { '/sponsors': 'public, max-age=300', '/availability': 'public, max-age=60' };

function defaultLog(level, event, fields = {}) {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** CORS class of a path: feeds are public, the webhook is server-to-server, the rest is site-only. */
function corsMode(path) {
  if (path.startsWith('/match/')) return 'site';
  if (path === '/sponsors' || path === '/availability' || path === '/') return 'public';
  if (path === '/paystack/webhook') return 'none';
  return 'site';
}

/** decodeURIComponent that answers 404 instead of throwing on a malformed %-escape. */
function pathParam(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new HttpError(404, 'not_found');
  }
}

function methodNotAllowed(allow) {
  return json(405, { error: 'method_not_allowed' }, { Allow: allow });
}

/**
 * @param {{ now?: () => number, fetch?: typeof fetch, log?: Function }} deps  injectable for tests
 */
export function createWorker({ now = () => Date.now(), fetch: fetchImpl = (...a) => fetch(...a), log = defaultLog } = {}) {
  // Per-isolate caches. The feed is read on every game start, so a short memory cache keeps
  // D1 reads low; writes in this isolate mark it stale, other isolates catch up within the TTL.
  const feedCache = new Map();
  const planCache = new Map();
  // Rate limits for the anonymous counts live in memory only (see stats.js).
  const rate = stats.createRateLimiter();
  const statsBuffer = stats.createStatsBuffer();
  // Mark stale rather than delete, so a stale copy is still there if D1 fails right after.
  const invalidate = () => {
    for (const entry of feedCache.values()) entry.at = -Infinity;
  };

  async function cachedFeed(path, ctx, build) {
    const hit = feedCache.get(path);
    if (hit && ctx.now - hit.at < FEED_TTL_MS[path]) return hit.body;
    try {
      const body = await build(ctx);
      feedCache.set(path, { at: ctx.now, body });
      return body;
    } catch (err) {
      // D1 hiccup or free-tier limit reached: a slightly stale list beats an error for players.
      if (hit) {
        log('warn', 'feed_stale', { path, message: String(err?.message || err).slice(0, 200) });
        return hit.body;
      }
      throw err;
    }
  }

  async function route(request, url, ctx) {
    const { method } = request;
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/') return method === 'GET' ? json(200, { ok: true, service: 'stapel-borge' }) : methodNotAllowed('GET');
    if (path === '/sponsors' || path === '/availability') {
      if (method !== 'GET') return methodNotAllowed('GET');
      const body = await cachedFeed(path, ctx, path === '/sponsors' ? getSponsorsFeed : getAvailability);
      return json(200, body, { 'Cache-Control': BROWSER_CACHE[path] });
    }
    if (path === '/stats') {
      if (method !== 'POST') return methodNotAllowed('POST');
      const feed = await cachedFeed('/sponsors', ctx, getSponsorsFeed);
      return stats.postStats(request, ctx, new Set([...feed.block, ...feed.premium].map((s) => s.id)));
    }
    if (path === '/score') {
      if (method === 'POST') return stats.postScore(request, ctx);
      return method === 'GET' ? stats.getScore(request, url, ctx) : methodNotAllowed('GET, POST');
    }
    if (path === '/board') {
      if (method === 'POST') return board.postBoard(request, ctx);
      return method === 'GET' ? board.getBoard(request, url, ctx) : methodNotAllowed('GET, POST');
    }
    if (path === '/subscribe') return method === 'POST' ? subscribe(request, ctx) : methodNotAllowed('POST');
    if (path === '/status') return method === 'GET' ? status(url, ctx) : methodNotAllowed('GET');
    if (path === '/paystack/webhook') return method === 'POST' ? handleWebhook(request, ctx) : methodNotAllowed('POST');

    if (path === '/admin' || path.startsWith('/admin/')) return routeAdmin(request, url, path, ctx);
    throw new HttpError(404, 'not_found');
  }

  /**
   * Uitdagersreeks (no D1 needed): the lobby pairs players (WebSocket), POST /match/room opens a friend
   * room, /match/room/<CODE> joins one (WebSocket), /match/ghost gives a recent recording. Only the
   * game's own pages may use them (Origin), and an address can open ROOMS_PER_HOUR rooms an hour.
   */
  async function routeMatch(request, env, path, cfg) {
    if (!env?.MATCH_LOBBY || !env?.MATCH_ROOM) throw new HttpError(503, 'not_configured');
    if (!isOriginAllowed(request.headers.get('Origin'), cfg.allowedOrigins)) throw new HttpError(403, 'forbidden_origin');
    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket';
    const lobby = () => env.MATCH_LOBBY.get(env.MATCH_LOBBY.idFromName('lobby'));
    if (path === '/match/lobby') {
      if (request.method !== 'GET' || !upgrade) throw new HttpError(426, 'websocket_expected');
      return lobby().fetch(request);
    }
    if (path === '/match/ghost') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      return lobby().fetch(request);
    }
    if (path === '/match/room') {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const t = now();
      const key = `room:${await stats.addressKey({ cfg, now: t }, request)}`;
      if (!rate.allow(key, ROOMS_PER_HOUR, t)) throw new HttpError(429, 'rate_limited');
      // the mode: Wedloop, or Blok vir Blok ({ "mode": "turns" }; older games send {})
      let mode = 'race';
      try {
        const body = await readJsonObject(request, 256);
        if (body && body.mode === 'turns') mode = 'turns';
      } catch {
        mode = 'race';
      }
      for (let tries = 0; tries < 4; tries++) {
        const code = newRoomCode(rand32);
        const res = await env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName(code))
          .fetch('https://room/init', { method: 'POST', body: JSON.stringify({ kind: 'friend', mode }) });
        if (res.status === 200) return json(200, { code });
      }
      throw new HttpError(503, 'busy');
    }
    const m = /^\/match\/room\/([A-Za-z0-9]+)$/.exec(path);
    if (m && isRoomCode(m[1])) {
      if (request.method !== 'GET' || !upgrade) throw new HttpError(426, 'websocket_expected');
      return env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName(m[1])).fetch(request);
    }
    throw new HttpError(404, 'not_found');
  }

  async function routeAdmin(request, url, path, ctx) {
    // Brute force: after too many wrong tokens from one address, refuse even the right one for a while.
    const failKey = `admin-fail:${await stats.addressKey(ctx, request)}`;
    if (ctx.rate.count(failKey, ctx.now) >= ctx.cfg.rate.adminFailsPerHour) throw new HttpError(429, 'rate_limited');
    try {
      await admin.requireAdmin(request, ctx.cfg);
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
        ctx.rate.allow(failKey, ctx.cfg.rate.adminFailsPerHour, ctx.now);
        ctx.log('warn', 'admin_bad_token', {});
      }
      throw err;
    }
    const { method } = request;
    if (path === '/admin/sponsors') {
      if (method === 'GET') return admin.listSponsors(ctx);
      if (method === 'POST') return admin.createSponsor(request, ctx);
      return methodNotAllowed('GET, POST');
    }
    if (path === '/admin/payments') return method === 'GET' ? admin.listPayments(url, ctx) : methodNotAllowed('GET');
    if (path === '/admin/stats') return method === 'GET' ? stats.adminStats(url, ctx) : methodNotAllowed('GET');
    if (path === '/admin/events') return method === 'GET' ? admin.listEvents(url, ctx) : methodNotAllowed('GET');
    if (path === '/admin/board') {
      // a day's top with player numbers; block, unblock or remove one entry: { dateKey, player, unblock?, remove? }
      if (method === 'GET') return board.adminListBoard(url, ctx);
      if (method === 'POST') return board.adminBlockEntry(ctx, await readJsonObject(request, 1024));
      return methodNotAllowed('GET, POST');
    }
    if (path === '/admin/runs') {
      if (method === 'GET') return admin.listRuns(ctx);
      if (method === 'POST') return admin.forgetRuns(request, ctx);
      return methodNotAllowed('GET, POST');
    }
    const a = /^\/admin\/alerts\/([^/]+)\/resolve$/.exec(path);
    if (a) return method === 'POST' ? admin.resolveAlert(ctx, pathParam(a[1])) : methodNotAllowed('POST');
    const m = /^\/admin\/sponsors\/([^/]+)(?:\/(cancel|manage-link))?$/.exec(path);
    if (m) {
      const id = pathParam(m[1]);
      if (m[2] === 'cancel') return method === 'POST' ? admin.cancelSponsor(request, ctx, id) : methodNotAllowed('POST');
      if (m[2] === 'manage-link') return method === 'POST' ? admin.manageLink(ctx, id) : methodNotAllowed('POST');
      if (method === 'PATCH') return admin.updateSponsor(request, ctx, id);
      if (method === 'DELETE') return admin.deleteSponsor(url, ctx, id);
      return methodNotAllowed('PATCH, DELETE');
    }
    throw new HttpError(404, 'not_found');
  }

  async function handle(request, env) {
    const cfg = loadConfig(env);
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return json(400, { error: 'bad_request' });
    }
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const mode = corsMode(path);
    if (request.method === 'OPTIONS') return mode === 'none' ? methodNotAllowed('POST') : preflight(request, mode, cfg);

    let response;
    if (path.startsWith('/match/')) {
      try {
        response = await routeMatch(request, env, path, cfg);
      } catch (err) {
        response = err instanceof HttpError ? errorResponse(err) : json(500, { error: 'server_error' });
        if (!(err instanceof HttpError)) log('error', 'match_unhandled', { path, message: String(err?.message || err).slice(0, 300) });
      }
      // a WebSocket upgrade (101) goes back exactly as the Durable Object made it
      if (response.status === 101 || response.webSocket) return response;
      return withHeaders(response, corsHeaders(request, mode, cfg));
    }
    try {
      if (!env?.DB) throw new HttpError(503, 'not_configured');
      const ctx = {
        db: env.DB,
        cfg,
        now: now(),
        lobby: env.MATCH_LOBBY ? () => env.MATCH_LOBBY.get(env.MATCH_LOBBY.idFromName('lobby')) : null,
        log,
        invalidate,
        planCache,
        rate,
        statsBuffer,
        paystack: createPaystack({
          secretKey: cfg.paystackSecret,
          fetch: fetchImpl,
          baseUrl: cfg.paystackBaseUrl,
          timeoutMs: cfg.paystackTimeoutMs,
        }),
      };
      response = await route(request, url, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        response = errorResponse(err);
        if (err.status === 429) response.headers.set('Retry-After', '3600');
      } else {
        log('error', 'unhandled', { path, message: String(err?.message || err).slice(0, 300) });
        response = json(500, { error: 'server_error' });
      }
    }
    return withHeaders(response, corsHeaders(request, mode, cfg));
  }

  return {
    fetch: (request, env) => handle(request, env),

    async scheduled(controller, env, execCtx) {
      const cfg = loadConfig(env);
      const at = now();
      const job = runRetention(env.DB, at)
        .then(async (counts) => {
          // the leaderboard keeps BOARD_DAYS days; its trouble (say the table isn't there yet) stays its own
          try {
            Object.assign(counts, await board.pruneBoard(env.DB, at));
          } catch (err) {
            log('error', 'board_prune_failed', { message: String(err?.message || err) });
          }
          // Once the owner switched to a live key, sponsors "paid" with test cards lose that time.
          if (cfg.paystackMode === 'live') {
            const ctx = { db: env.DB, cfg, now: at };
            const ids = await db.sponsorsWithTestPayments(env.DB);
            for (const id of ids) await refresh(ctx, id);
            counts.testPaymentsDropped = ids.length;
            invalidate();
          }
          return counts;
        })
        .then((counts) => log('info', 'retention', counts))
        .catch((err) => log('error', 'retention_failed', { message: String(err?.message || err) }));
      if (execCtx?.waitUntil) execCtx.waitUntil(job);
      return job;
    },
  };
}

export default createWorker();
