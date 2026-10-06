// Stapel sponsorship API — Cloudflare Worker entry point (router, CORS, cron).

import * as admin from './admin.js';
import { loadConfig } from './config.js';
import { HttpError, corsHeaders, errorResponse, json, preflight, withHeaders } from './http.js';
import { createPaystack } from './paystack.js';
import { getAvailability, getSponsorsFeed, status, subscribe } from './public.js';
import { runRetention } from './retention.js';
import { handleWebhook } from './webhook.js';

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
  if (path === '/sponsors' || path === '/availability' || path === '/') return 'public';
  if (path === '/paystack/webhook') return 'none';
  return 'site';
}

function methodNotAllowed(allow) {
  return json(405, { error: 'method_not_allowed' }, { Allow: allow });
}

/**
 * @param {{ now?: () => number, fetch?: typeof fetch, log?: Function }} deps  injectable for tests
 */
export function createWorker({ now = () => Date.now(), fetch: fetchImpl = (...a) => fetch(...a), log = defaultLog } = {}) {
  // Per-isolate caches. The feed is read on every game start, so a short memory cache keeps
  // D1 reads low; writes in this isolate clear it, other isolates catch up within the TTL.
  const feedCache = new Map();
  const planCache = new Map();
  const invalidate = () => feedCache.clear();

  async function cachedFeed(path, ctx, build) {
    const hit = feedCache.get(path);
    if (hit && ctx.now - hit.at < FEED_TTL_MS[path]) return hit.body;
    const body = await build(ctx);
    feedCache.set(path, { at: ctx.now, body });
    return body;
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
    if (path === '/subscribe') return method === 'POST' ? subscribe(request, ctx) : methodNotAllowed('POST');
    if (path === '/status') return method === 'GET' ? status(url, ctx) : methodNotAllowed('GET');
    if (path === '/paystack/webhook') return method === 'POST' ? handleWebhook(request, ctx) : methodNotAllowed('POST');

    if (path === '/admin' || path.startsWith('/admin/')) return routeAdmin(request, url, path, ctx);
    throw new HttpError(404, 'not_found');
  }

  async function routeAdmin(request, url, path, ctx) {
    await admin.requireAdmin(request, ctx.cfg);
    const { method } = request;
    if (path === '/admin/sponsors') {
      if (method === 'GET') return admin.listSponsors(ctx);
      if (method === 'POST') return admin.createSponsor(request, ctx);
      return methodNotAllowed('GET, POST');
    }
    if (path === '/admin/payments') return method === 'GET' ? admin.listPayments(url, ctx) : methodNotAllowed('GET');
    if (path === '/admin/events') return method === 'GET' ? admin.listEvents(url, ctx) : methodNotAllowed('GET');
    const m = /^\/admin\/sponsors\/([^/]+)(?:\/(cancel|manage-link))?$/.exec(path);
    if (m) {
      const id = decodeURIComponent(m[1]);
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
    try {
      if (!env?.DB) throw new HttpError(503, 'not_configured');
      const ctx = {
        db: env.DB,
        cfg,
        now: now(),
        log,
        invalidate,
        planCache,
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
      const job = runRetention(env.DB, now())
        .then((counts) => log('info', 'retention', counts))
        .catch((err) => log('error', 'retention_failed', { message: String(err?.message || err) }));
      if (execCtx?.waitUntil) execCtx.waitUntil(job);
      return job;
    },
  };
}

export default createWorker();
