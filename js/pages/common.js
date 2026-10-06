// Shared helpers for the static sponsor pages (adverteer.html, admin.html).
// No DOM access at import time. User-supplied data is only ever written with
// textContent / attributes, never innerHTML.

import { SPONSOR_API_URL, SPONSOR } from '../sponsorConfig.js';
import { MONTHS_AF, fmtInt } from '../core/format.js';

export const NBSP = ' ';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

/**
 * Tiny element builder. attrs: class, text, on<event> (functions), any other
 * attribute (true => empty attribute, null/false => skipped). Children may be
 * nodes, strings or nested arrays; strings become text nodes.
 */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Re-announces a message in a live region even when the text is unchanged. */
export function announce(region, message) {
  if (!region) return;
  region.textContent = '';
  // a fresh text node in the next frame makes screen readers read it again
  requestAnimationFrame(() => { region.textContent = message || ''; });
}

/** Moves focus to an element that is not normally focusable (headings, alerts). */
export function focusEl(el, { scroll = true } = {}) {
  if (!el) return;
  if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) {
    el.setAttribute('tabindex', '-1');
  }
  el.focus({ preventScroll: true });
  if (scroll) el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

export function prefersReducedMotion() {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Puts a button in a busy state (disabled + label swap) and back. */
export function setBusy(button, busy, busyLabel) {
  if (!button) return;
  const label = button.querySelector('.btn-label') || button;
  if (busy) {
    if (button.dataset.idleLabel == null) button.dataset.idleLabel = label.textContent;
    if (busyLabel) label.textContent = busyLabel;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    if (button.dataset.idleLabel != null) label.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

// ---------------------------------------------------------------------------
// Storage (private windows and locked-down browsers may throw)
// ---------------------------------------------------------------------------

export function safeStore(kind = 'session') {
  let backend = null;
  try {
    backend = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    backend = null;
  }
  return {
    get(key) {
      try {
        const raw = backend?.getItem(key);
        return raw == null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        backend?.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        backend?.removeItem(key);
      } catch {
        /* nothing to clean up */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(code, status = 0, data = null) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

const ERROR_CODE_RE = /^[a-z][a-z0-9_]{0,47}$/;

/** Normalised API base ('' when not configured or not a usable URL). */
export function apiBase() {
  const raw = String(SPONSOR_API_URL || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return '';
    if (u.username || u.password) return '';
    u.search = '';
    u.hash = '';
    return u.href.endsWith('/') ? u.href : u.href + '/';
  } catch {
    return '';
  }
}

export function apiUrl(path, query) {
  const base = apiBase();
  if (!base) throw new ApiError('not_configured');
  const url = new URL(String(path).replace(/^\/+/, ''), base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.href;
}

/**
 * JSON request to the sponsor API. Resolves with the parsed body; rejects with
 * an ApiError whose `code` is the server's stable error code when it sent one,
 * else one of: network, timeout, aborted, unauthorized, not_found,
 * rate_limited, server_error, bad_response, http_<status>, not_configured.
 */
export async function apiRequest(path, { method = 'GET', body, query, token, timeoutMs = 15000, signal } = {}) {
  const url = apiUrl(path, query);
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(timedOut ? 'timeout' : ctrl.signal.aborted ? 'aborted' : 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  let data = null;
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const serverCode = data && typeof data.error === 'string' && ERROR_CODE_RE.test(data.error) ? data.error : null;
    let code = serverCode;
    if (!code) {
      if (res.status === 401 || res.status === 403) code = 'unauthorized';
      else if (res.status === 404) code = 'not_found';
      else if (res.status === 429) code = 'rate_limited';
      else if (res.status >= 500) code = 'server_error';
      else code = `http_${res.status}`;
    }
    throw new ApiError(code, res.status, data);
  }
  if (data === null && res.status !== 204) throw new ApiError('bad_response', res.status);
  return data;
}

// ---------------------------------------------------------------------------
// Validation & formatting
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

export function isEmail(s) {
  const v = String(s || '').trim();
  return v.length >= 6 && v.length <= 254 && EMAIL_RE.test(v);
}

/** Owner's public contact address, or '' while it is not configured (or invalid). */
export function contactEmail() {
  const v = String(SPONSOR.contactEmail || '').trim();
  return isEmail(v) ? v : '';
}

/**
 * Accepts "jouwebwerf.co.za" or a full URL; returns a normalised https URL
 * string, '' for empty input, or null when it is not a usable public website.
 */
export function normaliseUrl(input) {
  let v = String(input || '').trim();
  if (!v) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
  let u;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) || host.length > 253) return null;
  if (u.href.length > 200) return null;
  return u.href;
}

/** 'https://www.bakkery.co.za/x' -> 'bakkery.co.za' (what the billboard shows). */
export function displayHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

const MONTHS_SHORT = MONTHS_AF.map((m) => m.slice(0, 3));
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Timestamp from the API (epoch ms, epoch seconds or ISO string) -> epoch ms,
 * or null. Seconds are recognised by size: 1e11 ms is 1973, 1e11 s is year 5138.
 */
export function toMs(ts) {
  if (ts == null || ts === '') return null;
  if (typeof ts === 'number' || /^\d+(\.\d+)?$/.test(String(ts))) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e11 ? Math.round(n * 1000) : Math.round(n);
  }
  const p = Date.parse(String(ts));
  return Number.isFinite(p) ? p : null;
}

/** "6 Okt 2026" (local time). */
export function fmtDate(ts) {
  const ms = toMs(ts);
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${d.getDate()}${NBSP}${MONTHS_SHORT[d.getMonth()]}${NBSP}${d.getFullYear()}`;
}

/** "6 Okt 2026, 14:05" (local time). */
export function fmtDateTime(ts) {
  const ms = toMs(ts);
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${fmtDate(ms)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** epoch ms -> 'YYYY-MM-DD' (local) for <input type="date">. */
export function toDateInput(ts) {
  const ms = toMs(ts);
  if (ms == null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' -> epoch ms of 23:59:59.999 that local day ("paid until and including"). */
export function endOfLocalDay(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

/** 149900 (cents) -> "R1 499,00". */
export function fmtRand(cents) {
  const v = Math.round(Number(cents) || 0);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return `${sign}R${fmtInt(Math.floor(abs / 100))},${pad2(abs % 100)}`;
}

/** Keeps "R1 499" together on one line. */
export const noBreakDigits = (s) => String(s).replace(/(\d) (?=\d{3}\b)/g, `$1${NBSP}`);

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

/**
 * Fills every [data-contact-link] with a mailto link to the owner's public
 * address and reveals every [data-contact] wrapper. While the address is not
 * configured they all stay hidden and the [data-no-contact] fallbacks show.
 */
export function wireContact(root = document) {
  const email = contactEmail();
  for (const wrap of $$('[data-contact]', root)) wrap.hidden = !email;
  for (const wrap of $$('[data-no-contact]', root)) wrap.hidden = !!email;
  for (const a of $$('[data-contact-link]', root)) {
    if (!email) {
      a.removeAttribute('href');
      continue;
    }
    a.href = `mailto:${email}`;
    if (a.hasAttribute('data-contact-text')) a.textContent = email;
  }
  return email;
}

// ---------------------------------------------------------------------------
// Canvas text (sponsor names on blocks / billboard)
// ---------------------------------------------------------------------------

/**
 * Largest font size (<= maxSize) at which `text` fits in maxW on one line.
 * Below minSize the text is squeezed horizontally (to at most 72 %) rather
 * than clipped. Returns { size, squeeze }.
 */
export function fitText(ctx, text, maxW, { font, maxSize, minSize = 6 }) {
  ctx.font = font(maxSize);
  const w = ctx.measureText(text).width;
  if (w <= maxW || w === 0) return { size: maxSize, squeeze: 1 };
  const size = Math.max(minSize, Math.floor(maxSize * (maxW / w) * 10) / 10);
  ctx.font = font(size);
  const w2 = ctx.measureText(text).width;
  return { size, squeeze: w2 > maxW ? Math.max(0.72, maxW / w2) : 1 };
}

/**
 * Draws `text` centred at (cx, cy), auto-fitted to maxW x maxH, as white bold
 * letters with a dark outline and a soft drop — the look of names on blocks.
 */
export function drawOutlinedText(ctx, text, cx, cy, maxW, maxH, { font, outline = '#1d2b45', fill = '#ffffff', minSize = 6 } = {}) {
  if (!text) return 0;
  const { size, squeeze } = fitText(ctx, text, maxW, { font, maxSize: maxH, minSize });
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(squeeze, 1);
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const lw = Math.max(1.5, size * 0.2);
  // drop shadow first, then the outline, then the letters
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = lw;
  ctx.strokeText(text, 0, size * 0.09);
  ctx.fillText(text, 0, size * 0.09);
  ctx.strokeStyle = outline;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return size;
}
