// HTTP helpers: JSON responses with safe headers, CORS, bounded body reading.

import { isOriginAllowed } from './config.js';

/** An error that maps straight to a JSON error response with a stable code. */
export class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(err) {
  return json(err.status, { error: err.code, ...err.extra });
}

const ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const ALLOW_HEADERS = 'Content-Type, Authorization';

/**
 * CORS headers for a response. `mode` is 'public' (any origin, read-only feeds),
 * 'site' (only ALLOWED_ORIGINS) or 'none' (server-to-server, e.g. the webhook).
 */
export function corsHeaders(request, mode, cfg) {
  if (mode === 'public') return { 'Access-Control-Allow-Origin': '*' };
  if (mode !== 'site') return {};
  const origin = request.headers.get('Origin');
  const headers = { Vary: 'Origin' };
  if (isOriginAllowed(origin, cfg.allowedOrigins)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function preflight(request, mode, cfg) {
  const headers = {
    ...corsHeaders(request, mode, cfg),
    'Access-Control-Allow-Methods': mode === 'public' ? 'GET, OPTIONS' : ALLOW_METHODS,
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Max-Age': '86400',
  };
  return new Response(null, { status: 204, headers });
}

/** Copies extra headers onto a response (responses from fetch() have immutable headers). */
export function withHeaders(response, headers) {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

/** Reads the body as bytes, refusing anything larger than maxBytes. */
export async function readBody(request, maxBytes) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, 'payload_too_large');
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, 'payload_too_large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Parses a JSON object body from a browser form post. */
export async function readJsonObject(request, maxBytes = 8 * 1024) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type');
  const bytes = await readBody(request, maxBytes);
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, 'bad_request');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad_request');
  return body;
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || '';
}
