// Die weekkis (1.10): a box for every day the Daily Tower is played, growing through the week, so there
// is always a reason to come back tomorrow. Day 7 is a big chest: more coins, a Reeksskild and (the
// first full week) a look you can only get this way. A missed day starts the week over, unless a
// Reeksskild covers it (from the shop, or a day-7 chest). Pure: the store keeps the state in its own
// key (stapel.v1.week) and pays what openBox says.
import { isDateKey } from './daily.js';

export const WEEK = Object.freeze({
  coins: Object.freeze([10, 15, 20, 25, 30, 40, 75]),   // day 1..7
  shieldMax: 2,             // Reeksskilde held at most (each covers one missed day)
  shieldPrice: 50,
  look: Object.freeze({ kind: 'title', id: 'getrou' }),   // the first full week: "Getroue Bouer"
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** A stored week, checked: { day 0-7 (the last box opened), last (its date) | null, shields, weeks (full ones) }. */
export function cleanWeek(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : lo);
  const last = isDateKey(r.last) ? r.last : null;
  return {
    day: last ? int(r.day, 0, 7) : 0,
    last,
    shields: int(r.shields, 0, WEEK.shieldMax),
    weeks: int(r.weeks, 0, 100000),
  };
}

/** Whole days from date key `a` to `b` (b - a). */
function daysFrom(a, b) {
  const t = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((t(b) - t(a)) / DAY_MS);
}

/** Which box `dateKey` opens, and whether the week goes on (shields used for missed days) or starts over. */
function nextBox(w, dateKey) {
  if (!w.last) return { day: 1, used: 0, restarted: false };
  const gap = daysFrom(w.last, dateKey);
  if (gap <= 0) return null;
  const missed = gap - 1;
  if (missed === 0) return { day: (w.day % 7) + 1, used: 0, restarted: false };
  if (missed <= w.shields) return { day: (w.day % 7) + 1, used: missed, restarted: false };
  return { day: 1, used: 0, restarted: true };
}

/**
 * The Daily Tower of `dateKey` was played: its box opens. Returns { week, box } with box =
 * { day, coins, shield (a Reeksskild added), look ({kind,id} the first full week), saved (missed days a
 * Reeksskild covered), restarted (a missed day began the week anew) }, or null when that day's box (or
 * a later one) is already open.
 */
export function openBox(state, dateKey) {
  const w = cleanWeek(state);
  if (!isDateKey(dateKey)) return null;
  const n = nextBox(w, dateKey);
  if (!n) return null;
  const full = n.day === 7;
  const box = {
    day: n.day,
    coins: WEEK.coins[n.day - 1],
    shield: full && w.shields - n.used < WEEK.shieldMax ? 1 : 0,
    look: full && w.weeks === 0 ? { ...WEEK.look } : null,
    saved: n.used,
    restarted: n.restarted,
  };
  const week = {
    day: n.day,
    last: dateKey,
    shields: Math.min(WEEK.shieldMax, w.shields - n.used + box.shield),
    weeks: w.weeks + (full ? 1 : 0),
  };
  return { week, box };
}

/**
 * The week as the menu shows it on `today`: { day (today's box, or the one opened today), coins,
 * opened, done (boxes of this week already opened, 0-7), next ({ day, coins } tomorrow's), shields }.
 */
export function weekView(state, today) {
  const w = cleanWeek(state);
  if (w.last && isDateKey(today) && daysFrom(w.last, today) === 0) {
    const day = (w.day % 7) + 1;
    return { day: w.day, coins: WEEK.coins[w.day - 1], opened: true, done: w.day, next: { day, coins: WEEK.coins[day - 1] }, shields: w.shields };
  }
  const n = (isDateKey(today) && nextBox(w, today)) || { day: 1 };
  return { day: n.day, coins: WEEK.coins[n.day - 1], opened: false, done: n.day - 1, next: null, shields: w.shields };
}

/** Buy a Reeksskild: { week, ok } (ok false when the most are held already). Coins are the store's business. */
export function addShield(state) {
  const w = cleanWeek(state);
  if (w.shields >= WEEK.shieldMax) return { week: w, ok: false };
  return { week: { ...w, shields: w.shields + 1 }, ok: true };
}
