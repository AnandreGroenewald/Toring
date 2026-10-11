// Free daily tries (1.13.1, the owner: "let's do the 3 and see how it goes"). From a day on (`from`), the Daaglikse
// Toring gives `free` tries; the extra ones after the first are free, then "Nog 'n kans" sells more (DAILY_RETRY.prices).
// The best try counts on the leaderboard; equal heights rank the fewer tries first. The setting is the game's own
// (DAILY_TRIES) or the Worker's (GET /daily/config), so it can change without a new app.

import { DAILY_RETRY, DAILY_TRIES } from '../config.js';
import { isDateKey } from './daily.js';

/** A tries setting as the game uses it: { free: 1..maxFree, from: a date key }; anything else: the game's own. */
export function cleanTries(c) {
  const free = Math.floor(Number(c?.free));
  return {
    free: free >= 1 && free <= DAILY_TRIES.maxFree ? free : DAILY_TRIES.free,
    from: isDateKey(c?.from) ? c.from : DAILY_TRIES.from,
  };
}

/** The free tries on `dateKey` (1 before the setting's first day). */
export function freeTriesFor(dateKey, cfg = DAILY_TRIES) {
  const c = cleanTries(cfg);
  return isDateKey(dateKey) && dateKey >= c.from ? c.free : 1;
}

/** The prices of a day's extra tries, in order: 0 for each free one after the first, then "Nog 'n kans". */
export function triesLadder(dateKey, cfg = DAILY_TRIES) {
  return [...Array(freeTriesFor(dateKey, cfg) - 1).fill(0), ...DAILY_RETRY.prices];
}

/** The most extra tries any day can have (every free one and every "Nog 'n kans"). */
export const MAX_EXTRA = DAILY_TRIES.maxFree - 1 + DAILY_RETRY.prices.length;

/**
 * "2/3" for the share line and the results: the tries played of the day's free ones; past them "3/3 +2🔁" (the free
 * ones used, then the ones bought). '' on a day with one free try (the 🔁 mark says it there).
 */
export function triesLabel(tries, free) {
  const n = Math.max(1, Math.floor(Number(tries) || 1));
  if (!(free > 1)) return '';
  return n <= free ? `${n}/${free}` : `${free}/${free} +${n - free}🔁`;
}
