// Die daaglikse ranglys on the device (the server side is server/src/board.js). A finished Daaglikse
// Toring is posted once, with the player's random number (made on this phone, linked to nothing else)
// and their Uitdagersreeks nickname; the answer is the day's top 10 and the player's own place.
// Nothing here ever gets in the way of the game: offline or refused, the answer is simply null.

import { request, base } from './audience.js';
import { dayNumber, isDateKey } from './core/daily.js';

const TEXT = 'text/plain;charset=UTF-8';   // a "simple" request: no CORS preflight
const NAME_MAX = 24;

/**
 * The server's answer, checked: { players, top: [{ rank, name, heightM, you }], you: { rank, heightM,
 * hidden } | null }, or null when it isn't one.
 */
export function cleanBoard(json) {
  if (!json || typeof json !== 'object' || !Number.isFinite(json.players) || !Array.isArray(json.top)) return null;
  const top = json.top
    .filter((t) => t && Number.isFinite(t.rank) && typeof t.name === 'string')
    .slice(0, 20)
    .map((t) => ({ rank: t.rank | 0, name: t.name.slice(0, NAME_MAX), heightM: Math.max(0, Number(t.heightM) || 0), you: t.you === true, retried: t.retried === true }));
  const y = json.you;
  const you = y && Number.isFinite(y.rank) ? { rank: y.rank | 0, heightM: Math.max(0, Number(y.heightM) || 0), hidden: y.hidden === true, retried: y.retried === true } : null;
  return { players: Math.max(0, json.players | 0), top, you };
}

/**
 * Posts a finished daily. The server keeps the first post of a day; a later one only changes the
 * name or hides it (or shows it again), so this is also how the "show me" switch is applied.
 */
export async function postBoard({ apiUrl, result, player, name = '', hidden = false, fetchImpl } = {}) {
  const root = base(apiUrl);
  if (!root || !player || !result || result.mode !== 'daily' || !isDateKey(result.dateKey)) return null;
  if (!(result.blocksDropped > 0) || !Number.isFinite(result.heightM)) return null;
  const body = {
    dateKey: result.dateKey,
    dayNumber: result.dayNumber ?? dayNumber(result.dateKey),
    player,
    name: String(name || ''),
    heightM: Math.max(0, Math.round(result.heightM * 10) / 10),
    blocks: result.blocksDropped | 0,
    durationMs: Math.max(0, Math.round(Number(result.durationMs) || 0)),
    hidden: !!hidden,
    ...(result.retry === true ? { retry: true } : {}),   // (1.12) "Nog 'n kans": the better of two tries, marked 🔁
  };
  return cleanBoard(await request(`${root}/board`, {
    method: 'POST',
    headers: { 'Content-Type': TEXT, Accept: 'application/json' },
    body: JSON.stringify(body),
  }, fetchImpl));
}

/** The day's top (and, with `player`, their place). */
export async function getBoard({ apiUrl, dateKey, player = null, fetchImpl } = {}) {
  const root = base(apiUrl);
  if (!root || !isDateKey(dateKey)) return null;
  const q = `dateKey=${encodeURIComponent(dateKey)}${player ? `&player=${encodeURIComponent(player)}` : ''}`;
  return cleanBoard(await request(`${root}/board?${q}`, { method: 'GET', headers: { Accept: 'application/json' } }, fetchImpl));
}
