// Anonymous audience counts and the daily percentile — the pure parts (no DOM, no network).
//
// What leaves the device, once per finished game and only when the sponsor API is configured:
//   { dateKey, mode, blocks: { <sponsorId>: n }, billboard: <sponsorId>|null, menu: bool }
// i.e. how many times each sponsor's name was on a block the player dropped, whose billboard stood
// on the island, and whether the menu card was on screen. No ids of people or devices, no timestamps,
// nothing that tells one player from another. The limits below are repeated (and enforced) by the
// Worker (server/src/stats.js).

import { isDateKey } from './daily.js';
import { fmtInt } from './format.js';
import { S } from './strings.js';

export const MAX_SHOWS_PER_SPONSOR = 60;
export const MAX_SPONSORS = 40;
export const MAX_ID_LEN = 64;
/** The percentile line only shows once this many results are in (a "percentile" of 3 players is silly). */
export const MIN_PLAYERS = 10;

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LEN;

/** An empty count of the names shown in one game: { <sponsorId>: n }. */
export function createTally() {
  return Object.create(null);
}

/** One more name of this sponsor on a dropped block. */
export function tallyShow(tally, sponsorId) {
  if (!isId(sponsorId)) return;
  tally[sponsorId] = (tally[sponsorId] | 0) + 1;
}

/**
 * The batch to POST /stats, or null when there is nothing worth sending.
 * @param {{ dateKey: string, mode: string, tally?: object, billboardId?: string|null, menu?: boolean }} g
 */
export function buildStatsBatch({ dateKey, mode, tally, billboardId = null, menu = false } = {}) {
  if (!isDateKey(dateKey) || (mode !== 'daily' && mode !== 'practice')) return null;
  const blocks = {};
  let kept = 0;
  for (const [id, raw] of Object.entries(tally || {})) {
    const n = Math.min(MAX_SHOWS_PER_SPONSOR, Math.floor(Number(raw)));
    if (!isId(id) || !(n > 0)) continue;
    if (++kept > MAX_SPONSORS) break;
    blocks[id] = n;
  }
  return { dateKey, mode, blocks, billboard: isId(billboardId) ? billboardId : null, menu: menu === true };
}

/**
 * "Jy het beter gedoen as 72% van spelers vandag", or '' when there is nothing honest to say:
 * too few players, no answer, or a result at the very bottom (0%).
 * @param {{ percentile?: number|null, players?: number }|null} answer  what POST/GET /score returned
 */
export function percentileLine(answer, minPlayers = MIN_PLAYERS) {
  if (!answer || typeof answer !== 'object') return '';
  const { percentile, players } = answer;
  if (!Number.isFinite(players) || players < minPlayers) return '';
  if (typeof percentile !== 'number' || !Number.isFinite(percentile)) return '';
  const p = Math.min(100, Math.max(0, Math.round(percentile)));
  return p >= 1 ? S.percentileBetter(fmtInt(p)) : '';
}
