// Die daaglikse ranglys: the day's tallest Daaglikse Toring results, with nicknames.
//   * POST /board  a player's result for a day (once: later posts may only change the name or hide it)
//   * GET  /board  the top of a day, how many played, and the asking player's own place
// Unlike /score (anonymous counts), this keeps one row per player per day: a random player number made
// on the phone (linked to nothing else), the nickname (the Uitdagersreeks name; the name rules apply),
// the height, and the blocks dropped and seconds played (to turn away impossible results). A player can
// hide from the list and still sees their own place. Rows are removed after BOARD_DAYS days.

import { HttpError, json } from './http.js';
import { checkOrigin, readBatch, checkDateKey, limit } from './stats.js';
import { cleanNickname } from '../../js/core/duel.js';
import { dayNumber } from '../../js/core/daily.js';

export const BOARD_DAYS = 30;
export const BOARD_TOP = 10;
export const DEFAULT_NAME = 'Bouer';
const PLAYER_RE = /^[a-z0-9]{12,32}$/;
const MAX_HEIGHT_DM = 10000;   // 1 000 m
// What a real tower can be (generous on purpose; a result past these is refused, not trimmed):
const MAX_M_PER_BLOCK = 6;     // the tallest block is 5,12 m (128 px at 25 px a metre)
const EXTRA_BLOCKS = 8;        // blocks a visitor (Hanswors) adds without a drop
const MIN_MS_PER_BLOCK = 500;  // nobody drops faster than this, block after block
const MAX_CLIMB_MPS = 3;       // nor climbs faster than this...
const CLIMB_SLACK_M = 10;      // ...after a head start

/** Whole number in [0, max], or throws invalid_field. */
function count(value, field, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, 'invalid_field', { field });
  return Math.floor(n);
}

/**
 * A posted result, checked: { dateKey, player, name, heightDm, blocks, durationS, hidden }.
 * Throws HttpError 400 for anything malformed, 422 for a tower no game can build.
 */
export function validateEntry(body, now) {
  const dateKey = checkDateKey(body.dateKey, now);
  if (body.dayNumber !== dayNumber(dateKey)) throw new HttpError(400, 'invalid_field', { field: 'dayNumber' });
  if (typeof body.player !== 'string' || !PLAYER_RE.test(body.player)) throw new HttpError(400, 'invalid_field', { field: 'player' });
  const heightM = typeof body.heightM === 'number' ? body.heightM : Number(body.heightM);
  if (!Number.isFinite(heightM) || heightM < 0) throw new HttpError(400, 'invalid_field', { field: 'heightM' });
  const heightDm = Math.round(heightM * 10);
  if (heightDm > MAX_HEIGHT_DM) throw new HttpError(422, 'implausible');
  const blocks = count(body.blocks, 'blocks', 5000);
  const durationS = count(body.durationMs, 'durationMs', 6 * 60 * 60 * 1000) / 1000;
  const m = heightDm / 10;
  if (m > (blocks + EXTRA_BLOCKS) * MAX_M_PER_BLOCK) throw new HttpError(422, 'implausible');
  if (blocks > 2 + (durationS * 1000) / MIN_MS_PER_BLOCK) throw new HttpError(422, 'implausible');
  if (m > CLIMB_SLACK_M + durationS * MAX_CLIMB_MPS) throw new HttpError(422, 'implausible');
  return {
    dateKey,
    player: body.player,
    name: cleanNickname(body.name) || DEFAULT_NAME,
    heightDm,
    blocks,
    durationS: Math.round(durationS),
    hidden: body.hidden === true,
  };
}

/** The day's top, the number of players, and `player`'s own place (null when they have no result). */
export async function boardOf(db, dateKey, player = null) {
  // places are true places: a hidden player keeps theirs (the list skips it), so the numbers never clash
  const top = await db.prepare(
    `SELECT player, name, height_dm, place FROM (
       SELECT player, name, height_dm, hidden,
              ROW_NUMBER() OVER (ORDER BY height_dm DESC, created_at ASC, player ASC) AS place
       FROM daily_board WHERE date_key = ?1)
     WHERE hidden = 0 ORDER BY place LIMIT ?2`,
  ).bind(dateKey, BOARD_TOP).all();
  const total = await db.prepare('SELECT COUNT(*) AS n FROM daily_board WHERE date_key = ?1').bind(dateKey).first();
  let you = null;
  if (player) {
    const me = await db.prepare('SELECT height_dm, created_at, hidden FROM daily_board WHERE date_key = ?1 AND player = ?2')
      .bind(dateKey, player).first();
    if (me) {
      // everyone ahead, hidden or not: a hidden player still takes their place
      const ahead = await db.prepare(
        `SELECT COUNT(*) AS n FROM daily_board WHERE date_key = ?1
         AND (height_dm > ?2 OR (height_dm = ?2 AND (created_at < ?3 OR (created_at = ?3 AND player < ?4))))`,
      ).bind(dateKey, me.height_dm, me.created_at, player).first();
      you = { rank: (ahead?.n || 0) + 1, heightM: me.height_dm / 10, hidden: me.hidden === 1 };
    }
  }
  return {
    dateKey,
    players: total?.n || 0,
    top: (top.results || []).map((r) => ({ rank: r.place, name: r.name, heightM: r.height_dm / 10, you: r.player === player })),
    you,
  };
}

/** POST /board — the first post of a day stores the result; later ones may only change the name or hiding. */
export async function postBoard(request, ctx) {
  checkOrigin(request, ctx.cfg);
  await limit(ctx, request, 'board-post', ctx.cfg.rate.boardPostPerHour);
  const e = validateEntry(await readBatch(request), ctx.now);
  await ctx.db.prepare(
    `INSERT INTO daily_board (date_key, player, name, height_dm, blocks, duration_s, hidden, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT (date_key, player) DO UPDATE SET name = excluded.name, hidden = excluded.hidden`,
  ).bind(e.dateKey, e.player, e.name, e.heightDm, e.blocks, e.durationS, e.hidden ? 1 : 0, ctx.now).run();
  return json(200, await boardOf(ctx.db, e.dateKey, e.player));
}

/** GET /board?dateKey=&player= — the day's top (and the player's place, if they posted). */
export async function getBoard(request, url, ctx) {
  checkOrigin(request, ctx.cfg);
  await limit(ctx, request, 'board-get', ctx.cfg.rate.boardGetPerHour);
  const dateKey = checkDateKey(url.searchParams.get('dateKey'), ctx.now);
  const p = url.searchParams.get('player');
  const player = typeof p === 'string' && PLAYER_RE.test(p) ? p : null;
  return json(200, await boardOf(ctx.db, dateKey, player));
}

/** Retention: the rows of days older than BOARD_DAYS go (cron). */
export function pruneBoard(db, now) {
  const before = new Date(now - BOARD_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return db.prepare('DELETE FROM daily_board WHERE date_key < ?1').bind(before).run();
}

/** Admin: hide one entry (a rude name that slipped through, an impossible result). */
export async function adminHideEntry(ctx, { dateKey, player }) {
  if (typeof player !== 'string' || !PLAYER_RE.test(player)) throw new HttpError(400, 'invalid_field', { field: 'player' });
  const r = await ctx.db.prepare('UPDATE daily_board SET hidden = 1, name = ?3 WHERE date_key = ?1 AND player = ?2')
    .bind(String(dateKey || ''), player, DEFAULT_NAME).run();
  return json(200, { ok: true, changed: r.meta?.changes ?? 0 });
}
