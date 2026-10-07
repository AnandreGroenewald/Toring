// "Jou Stapelstad": every finished Daaglikse Toring becomes one small building in the
// player's own skyline. Pure helpers (no DOM, no storage): the store hands over the
// finished heights and this builds the last 30 calendar days, each with a colour taken
// deterministically from that day's block sequence, so the city looks the same everywhere.

import { PALETTE } from '../config.js';
import { addDays, seedFor, isDateKey } from './daily.js';
import { createSequence } from './sequence.js';

export const SKYLINE_DAYS = 30;

const colorCache = new Map();

/** 0xRRGGBB of the first block of `dateKey`'s daily (a PALETTE fill); falls back to the first colour. */
export function dayColor(dateKey) {
  let c = colorCache.get(dateKey);
  if (c === undefined) {
    try {
      c = PALETTE[createSequence(seedFor(dateKey)).block(0).color]?.fill;
    } catch {
      c = undefined;
    }
    if (typeof c !== 'number') c = PALETTE[0].fill;
    if (colorCache.size > 200) colorCache.clear();
    colorCache.set(dateKey, c);
  }
  return c;
}

const heightOf = (heights, key) => {
  const v = heights instanceof Map ? heights.get(key) : heights && typeof heights === 'object' ? heights[key] : undefined;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * The last `days` calendar days ending at `todayKey` (oldest first, today last):
 * `days` = [{ dateKey, heightM | null, color }], `best` = the tallest day or null,
 * `count` = how many days have a tower, `streak` = consecutive built days ending today
 * (or yesterday, if today is still to be played).
 * `heights` maps dateKey -> metres (a plain object or a Map) for finished dailies only.
 */
export function buildSkyline(todayKey, heights, days = SKYLINE_DAYS) {
  const n = Math.max(1, Math.min(120, Math.trunc(Number(days)) || SKYLINE_DAYS));
  if (!isDateKey(todayKey)) return { days: [], best: null, count: 0, streak: 0 };
  const list = [];
  for (let k = n - 1; k >= 0; k--) {
    const dateKey = addDays(todayKey, -k);
    list.push({ dateKey, heightM: heightOf(heights, dateKey), color: dayColor(dateKey) });
  }
  let best = null;
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    const h = list[i].heightM;
    if (h == null) continue;
    count++;
    if (!best || h > best.heightM) best = { dateKey: list[i].dateKey, heightM: h, index: i };
  }
  let streak = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].heightM != null) streak++;
    else if (i === list.length - 1) continue;   // today not played yet: the run may end yesterday
    else break;
  }
  return { days: list, best, count, streak };
}

/** Compact signature of a skyline, so a texture is only redrawn when something changed. */
export function skylineKey(sky) {
  return sky && sky.days ? sky.days.map((d) => `${d.dateKey}:${d.heightM ?? '-'}`).join('|') : '';
}
