// Die daaglikse ranglys: the day's tallest Daaglikse Toring results, with nicknames.
//   * POST /board  a player's result for a day (once: later posts may only change the name or hide it)
//   * GET  /board  the top of a day, how many played, and the asking player's own place
// Unlike /score (anonymous counts), this keeps one row per player per day: a random player number made
// on the phone (linked to nothing else), the nickname (the Uitdagersreeks name; the name rules apply),
// the height, and the blocks dropped and seconds played (to turn away impossible results). A player can
// hide from the list and still sees their own place; the owner can block an entry for good (`blocked`:
// later posts can't show it again). Rows are removed after BOARD_DAYS days.
//
// D1's free plan counts rows read, so no answer reads a whole day: the top is read in place order and
// stops early (idx_daily_board_rank), the number of players is a counter (daily_board_days), and a place
// below the top adds up a count per whole metre (daily_board_hist) plus the rows of the player's own metre.

import { HttpError, json } from './http.js';
import { checkOrigin, readBatch, checkDateKey, limit } from './stats.js';
import { cleanNickname } from '../../js/core/duel.js';
import { dayNumber, addDays } from '../../js/core/daily.js';

export const BOARD_DAYS = 30;
export const BOARD_TOP = 10;
export const DEFAULT_NAME = 'Bouer';
const TOP_SCAN = BOARD_TOP + 30;   // rows read for the top: hidden ones keep their place, so read a few more
const PLAYER_RE = /^[a-z0-9]{12,32}$/;
const MAX_HEIGHT_DM = 10000;   // 1 000 m
// What a real tower can be. Generous on purpose (a result past these is refused, not trimmed), yet far
// below a forged one: real games build about 1,7 m a block and climb under 1 m a second.
const MAX_M_PER_BLOCK = 4;     // blocks stand 1,6-3,8 m (a pillar 5,12 m, but rarely); perfect stacking averages under 3 m
const EXTRA_BLOCKS = 8;        // blocks a visitor (Hanswors) adds without a drop
const MIN_MS_PER_BLOCK = 700;  // a block falls for at least 0,55 s and the next one comes 0,35 s after it lands
const MAX_CLIMB_MPS = 2;       // nor climbs faster than this...
const CLIMB_SLACK_M = 10;      // ...after a head start
// The day of a result is the player's own date: somewhere on earth (UTC-12 to UTC+14) it must be that
// day now, or have been a little while ago (a game that ran past midnight).
const EAST_MS = 14 * 60 * 60 * 1000;
const WEST_MS = 12 * 60 * 60 * 1000;
const LATE_MS = 6 * 60 * 60 * 1000;

/** Whole number in [0, max], or throws invalid_field. */
function count(value, field, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, 'invalid_field', { field });
  return Math.floor(n);
}

/** Is it `dateKey` somewhere on earth at `now` (or was it, within LATE_MS)? */
function dayRunning(dateKey, now) {
  const start = Date.parse(`${dateKey}T00:00:00Z`) - EAST_MS;            // the day begins first at UTC+14
  const end = Date.parse(`${addDays(dateKey, 1)}T00:00:00Z`) + WEST_MS;   // and ends last at UTC-12
  return now >= start && now < end + LATE_MS;
}

/**
 * A posted result, checked: { dateKey, player, name, heightDm, blocks, durationS, hidden }.
 * Throws HttpError 400 for anything malformed, 422 for a tower no game can build.
 */
export function validateEntry(body, now) {
  const dateKey = checkDateKey(body.dateKey, now);
  if (!dayRunning(dateKey, now)) throw new HttpError(400, 'invalid_field', { field: 'dateKey' });
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

/** The whole metre a height counts in (daily_board_hist). */
const metre = (heightDm) => Math.floor(heightDm / 10);

/** The day's top, the number of players, and `player`'s own place (null when they have no result). */
export async function boardOf(db, dateKey, player = null) {
  // places are true places: a hidden or blocked player keeps theirs (the list skips it), so numbers never clash
  const scan = await db.prepare(
    `SELECT player, name, height_dm, hidden, blocked FROM daily_board WHERE date_key = ?1
     ORDER BY height_dm DESC, created_at ASC, player ASC LIMIT ?2`,
  ).bind(dateKey, TOP_SCAN).all();
  const rows = scan.results || [];
  const top = [];
  rows.forEach((r, k) => {
    if (top.length < BOARD_TOP && !r.hidden && !r.blocked) {
      top.push({ rank: k + 1, name: r.name, heightM: r.height_dm / 10, you: r.player === player });
    }
  });
  const day = await db.prepare('SELECT players FROM daily_board_days WHERE date_key = ?1').bind(dateKey).first();
  let you = null;
  if (player) {
    const me = await db.prepare('SELECT height_dm, created_at, hidden, blocked FROM daily_board WHERE date_key = ?1 AND player = ?2')
      .bind(dateKey, player).first();
    if (me) {
      const k = rows.findIndex((r) => r.player === player);
      let rank = k + 1;
      if (k < 0) {
        // below the rows read: everyone in a higher metre, then those ahead in the same metre
        const m = metre(me.height_dm);
        const higher = await db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM daily_board_hist WHERE date_key = ?1 AND metre > ?2')
          .bind(dateKey, m).first();
        const same = await db.prepare(
          `SELECT COUNT(*) AS n FROM daily_board WHERE date_key = ?1 AND height_dm BETWEEN ?2 AND ?3
           AND (height_dm > ?4 OR (height_dm = ?4 AND (created_at < ?5 OR (created_at = ?5 AND player < ?6))))`,
        ).bind(dateKey, m * 10, m * 10 + 9, me.height_dm, me.created_at, player).first();
        rank = (higher?.n || 0) + (same?.n || 0) + 1;
      }
      you = { rank, heightM: me.height_dm / 10, hidden: me.hidden === 1 || me.blocked === 1 };
    }
  }
  return {
    dateKey,
    players: day?.players || 0,
    top,
    you,
  };
}

/** POST /board — the first post of a day stores the result; later ones may only change the name or hiding. */
export async function postBoard(request, ctx) {
  checkOrigin(request, ctx.cfg);
  await limit(ctx, request, 'board-post', ctx.cfg.rate.boardPostPerHour);
  const e = validateEntry(await readBatch(request), ctx.now);
  const added = await ctx.db.prepare(
    `INSERT INTO daily_board (date_key, player, name, height_dm, blocks, duration_s, hidden, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT (date_key, player) DO NOTHING`,
  ).bind(e.dateKey, e.player, e.name, e.heightDm, e.blocks, e.durationS, e.hidden ? 1 : 0, ctx.now).run();
  if ((added.meta?.changes ?? 0) > 0) {
    await ctx.db.batch([
      ctx.db.prepare('INSERT INTO daily_board_days (date_key, players) VALUES (?1, 1) ON CONFLICT (date_key) DO UPDATE SET players = players + 1')
        .bind(e.dateKey),
      ctx.db.prepare('INSERT INTO daily_board_hist (date_key, metre, n) VALUES (?1, ?2, 1) ON CONFLICT (date_key, metre) DO UPDATE SET n = n + 1')
        .bind(e.dateKey, metre(e.heightDm)),
    ]);
  } else {
    // the height stands; an entry the owner blocked stays as it is
    await ctx.db.prepare('UPDATE daily_board SET name = ?3, hidden = ?4 WHERE date_key = ?1 AND player = ?2 AND blocked = 0')
      .bind(e.dateKey, e.player, e.name, e.hidden ? 1 : 0).run();
  }
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
export async function pruneBoard(db, now) {
  const before = new Date(now - BOARD_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const r = await db.batch([
    db.prepare('DELETE FROM daily_board WHERE date_key < ?1').bind(before),
    db.prepare('DELETE FROM daily_board_days WHERE date_key < ?1').bind(before),
    db.prepare('DELETE FROM daily_board_hist WHERE date_key < ?1').bind(before),
  ]);
  return { boardRowsDropped: r[0]?.meta?.changes ?? 0 };
}

const ADMIN_LIST = 50;

/** Admin: a day's top ADMIN_LIST rows with their player numbers (to find an entry to block). */
export async function adminListBoard(url, ctx) {
  const dateKey = url.searchParams.get('dateKey') || new Date(ctx.now).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new HttpError(400, 'invalid_field', { field: 'dateKey' });
  const r = await ctx.db.prepare(
    `SELECT player, name, height_dm, blocks, duration_s, hidden, blocked, created_at FROM daily_board WHERE date_key = ?1
     ORDER BY height_dm DESC, created_at ASC, player ASC LIMIT ?2`,
  ).bind(dateKey, ADMIN_LIST).all();
  const day = await ctx.db.prepare('SELECT players FROM daily_board_days WHERE date_key = ?1').bind(dateKey).first();
  return json(200, {
    dateKey,
    players: day?.players || 0,
    entries: (r.results || []).map((e, k) => ({
      rank: k + 1,
      player: e.player,
      name: e.name,
      heightM: e.height_dm / 10,
      blocks: e.blocks,
      seconds: e.duration_s,
      mPerBlock: e.blocks ? Math.round((e.height_dm / e.blocks)) / 10 : null,
      hidden: e.hidden === 1,
      blocked: e.blocked === 1,
      at: e.created_at,
    })),
  });
}

/**
 * Admin: block one entry for good (a rude name that slipped through, a forged result), `unblock` it,
 * or `remove` it altogether (a player who asked for that; the day's counts go down with it).
 */
export async function adminBlockEntry(ctx, { dateKey, player, unblock = false, remove = false }) {
  if (typeof player !== 'string' || !PLAYER_RE.test(player)) throw new HttpError(400, 'invalid_field', { field: 'player' });
  const day = String(dateKey || '');
  if (remove === true) {
    const row = await ctx.db.prepare('SELECT height_dm FROM daily_board WHERE date_key = ?1 AND player = ?2').bind(day, player).first();
    if (!row) return json(200, { ok: true, changed: 0 });
    await ctx.db.batch([
      ctx.db.prepare('DELETE FROM daily_board WHERE date_key = ?1 AND player = ?2').bind(day, player),
      ctx.db.prepare('UPDATE daily_board_days SET players = MAX(players - 1, 0) WHERE date_key = ?1').bind(day),
      ctx.db.prepare('UPDATE daily_board_hist SET n = MAX(n - 1, 0) WHERE date_key = ?1 AND metre = ?2').bind(day, metre(row.height_dm)),
    ]);
    return json(200, { ok: true, changed: 1 });
  }
  const r = await ctx.db.prepare('UPDATE daily_board SET blocked = ?3 WHERE date_key = ?1 AND player = ?2')
    .bind(day, player, unblock === true ? 0 : 1).run();
  return json(200, { ok: true, changed: r.meta?.changes ?? 0 });
}
