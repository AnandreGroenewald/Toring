// The Daaglikse Toring calendar. As in other daily puzzles, a day is the player's LOCAL
// calendar day. Day arithmetic is done on the Y-M-D parts in UTC so daylight
// saving changes can never make a day 23 or 25 "days" long.

import { EPOCH_DATE_KEY } from '../config.js';

const DAY_MS = 86400000;
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n) => String(n).padStart(2, '0');

function toDate(now) {
  return now instanceof Date ? now : new Date(now == null ? Date.now() : now);
}

/** True for a well-formed, real calendar date key like '2026-10-06'. */
export function isDateKey(key) {
  if (typeof key !== 'string') return false;
  const m = DATE_KEY_RE.exec(key);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 'YYYY-MM-DD' -> ms of that date at 00:00 UTC. */
function utcMs(dateKey) {
  const [y, mo, d] = String(dateKey).split('-').map(Number);
  return Date.UTC(y, mo - 1, d);
}

function keyFromUtcMs(ms) {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Local calendar date of `date` as 'YYYY-MM-DD'. */
export function dateKeyFor(date = new Date()) {
  const dt = toDate(date);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** EPOCH_DATE_KEY => 1, the next day => 2, the day before => 0. */
export function dayNumber(dateKey) {
  return daysBetween(EPOCH_DATE_KEY, dateKey) + 1;
}

export function seedFor(dateKey) {
  return 'stapel-' + dateKey;
}

export function addDays(dateKey, n) {
  const [y, mo, d] = String(dateKey).split('-').map(Number);
  return keyFromUtcMs(Date.UTC(y, mo - 1, d + Math.trunc(n)));
}

/** Whole days from a to b (b - a). */
export function daysBetween(aKey, bKey) {
  return Math.round((utcMs(bKey) - utcMs(aKey)) / DAY_MS);
}

/** Epoch ms of the next local midnight after `now`. */
export function nextDayTimestamp(now = new Date()) {
  const dt = toDate(now);
  // The Date constructor normalises day overflow and resolves DST in local time.
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1, 0, 0, 0, 0).getTime();
}

/** ms until the next local midnight (always > 0). */
export function msUntilNextDay(now = new Date()) {
  const dt = toDate(now);
  return Math.max(1, nextDayTimestamp(dt) - dt.getTime());
}

/** '?date=YYYY-MM-DD&…' -> dateKey, or null if absent/invalid. */
export function parseDebugDate(search) {
  if (typeof search !== 'string' || !search) return null;
  let value = null;
  try {
    value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('date');
  } catch {
    return null;
  }
  return value && isDateKey(value.trim()) ? value.trim() : null;
}
