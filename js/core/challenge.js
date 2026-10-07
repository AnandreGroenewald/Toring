// Friend challenge: the share link carries "?klop=<height in decimetres>&d=<dateKey>". Whoever opens
// it on the SAME day gets "klop 37,5 m!" on the menu and a line in the Daaglikse Toring. Everything
// from the URL (or from storage) is validated strictly and only ever used as a number.

import { isDateKey } from './daily.js';

export const CHALLENGE_STORAGE_KEY = 'stapel.klop';

/** window.sessionStorage, or null where even touching it throws (blocked site data). */
function sessionStore() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}
export const CHALLENGE_MIN_DM = 1;
export const CHALLENGE_MAX_DM = 20000;

/** An integer 1..20000 written with digits only ('375'), else null. */
function parseDm(raw) {
  if (typeof raw !== 'string' || !/^[1-9]\d{0,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= CHALLENGE_MIN_DM && n <= CHALLENGE_MAX_DM ? n : null;
}

function wrap(dm, dateKey) {
  return { dm, heightM: dm / 10, dateKey };
}

/**
 * '?klop=375&d=2026-10-07' -> { dm: 375, heightM: 37.5, dateKey } when both are valid AND the date is
 * `todayKey`; otherwise null. Repeated parameters are rejected.
 */
export function parseChallenge(search, todayKey) {
  if (typeof search !== 'string' || !search || !isDateKey(todayKey)) return null;
  let q;
  try {
    q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return null;
  }
  const k = q.getAll('klop');
  const d = q.getAll('d');
  if (k.length !== 1 || d.length !== 1) return null;
  const dm = parseDm(k[0]);
  if (dm == null || d[0] !== todayKey) return null;
  return wrap(dm, d[0]);
}

/** '?klop=375&d=2026-10-07' for a finished daily, or '' when there is nothing sensible to challenge. */
export function challengeQuery(heightM, dateKey) {
  const dm = Math.round(Number(heightM) * 10);
  if (!Number.isFinite(dm) || dm < CHALLENGE_MIN_DM || dm > CHALLENGE_MAX_DM || !isDateKey(dateKey)) return '';
  return `?klop=${dm}&d=${dateKey}`;
}

/** The link to put in the share text: the site URL, plus the challenge for a daily result. */
export function shareUrlFor(baseUrl, result) {
  if (!baseUrl) return baseUrl;
  const base = String(baseUrl);
  if (!result || result.mode !== 'daily') return base;
  const q = challengeQuery(result.heightM, result.dateKey);
  if (!q) return base;
  return base.includes('?') ? `${base}&${q.slice(1)}` : base + q;
}

/**
 * The challenge for today: the URL's (saved for this tab in sessionStorage, so a reload keeps it) or
 * the one saved earlier, re-validated against `todayKey`. Never throws; works without storage.
 */
export function loadChallenge(search, todayKey, storage = sessionStore()) {
  const fresh = parseChallenge(search, todayKey);
  if (fresh) {
    try {
      storage?.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify({ dm: fresh.dm, d: fresh.dateKey }));
    } catch {
      // sessionStorage unavailable: the challenge simply lasts until the page closes
    }
    return fresh;
  }
  try {
    const raw = storage?.getItem(CHALLENGE_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || o.d !== todayKey || !isDateKey(o.d)) return null;
    const dm = parseDm(String(o.dm));
    return dm == null ? null : wrap(dm, o.d);
  } catch {
    return null;
  }
}
