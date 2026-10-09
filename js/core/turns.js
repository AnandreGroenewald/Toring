// Blok vir Blok (1.11): two players build one tower, a block each in turn. This is the referee (whose
// turn it is, the hearts, the Perfek streaks that earn a joker, the sabotage waiting for a player's next
// block, and the result), and the checks for what one game tells the other about a turn: where its
// block was let go, and where the tower's loose blocks came to rest. Pure: the game runs it against
// Robot Rikus, the server (server/src/match.js) for a live match.

import { TURNS } from '../config.js';
import { createRng } from './rng.js';

export const SABOTAGES = Object.freeze([...TURNS.sabotages]);
export const isSabotage = (k) => SABOTAGES.includes(k);
const RATINGS = new Set(['P', 'G', 'S', 'X']);
const SNAP_MAX = 32;          // tower blocks one turn can report (the loose top is TURNS.liveBlocks + 1)
const COORD_MAX = 1e7;        // px: further than this is not a tower
const BLOCK_MAX = 5000;

const seatOk = (s) => s === 0 || s === 1;

/**
 * The referee. `first` is the seat that drops the first block. Events:
 *  { type: 'turn', n, seat, hearts, streaks, sab }  turn n is seat's (sab: a sabotage on this block, or null)
 *  { type: 'joker', seat }                           seat earned a joker: they choose a sabotage
 *  { type: 'sent', seat, kind }                      seat's sabotage waits for the other player's next block
 *  { type: 'result', winner, reason, hearts }        'hearts' | 'quit' | 'timeout' | 'turns'
 */
export function createTurnReferee({ first = 0, init = null } = {}) {
  const s = init ? clone(init) : {
    first: seatOk(first) ? first : 0,
    n: 0,
    seat: seatOk(first) ? first : 0,
    hearts: [TURNS.hearts, TURNS.hearts],
    streak: [0, 0],
    perfects: [0, 0],
    jokers: [0, 0],
    sab: [null, null],    // a sabotage waiting for this seat's next block
    result: null,
  };

  const turnEvent = () => ({ type: 'turn', n: s.n, seat: s.seat, hearts: [...s.hearts], streaks: [...s.streak], sab: s.sabNow || null });

  function next() {
    s.n += 1;
    if (s.n > 1) s.seat = 1 - s.seat;
    s.sabNow = s.sab[s.seat];
    s.sab[s.seat] = null;
    return turnEvent();
  }

  function decide(winner, reason) {
    s.result = { winner, reason };
    return { type: 'result', winner, reason, hearts: [...s.hearts] };
  }

  return {
    /** The first turn (once). */
    start() {
      if (s.n !== 0 || s.result) return [];
      return [next()];
    },

    /**
     * Seat's turn n ended: `lost` (the turn cost a heart) and `r`, how the dropped block was rated
     * ('P' Perfek, 'G', 'S', 'X' lost). A report out of turn is ignored.
     */
    settled(seat, { n, lost = false, r = 'S' } = {}) {
      if (s.result || seat !== s.seat || n !== s.n || s.n < 1) return [];
      const events = [];
      if (lost) s.hearts[seat] = Math.max(0, s.hearts[seat] - 1);
      if (r === 'P') {
        s.perfects[seat] += 1;
        s.streak[seat] += 1;
        if (s.streak[seat] % TURNS.jokerStreak === 0) {
          s.jokers[seat] += 1;
          events.push({ type: 'joker', seat });
        }
      } else {
        s.streak[seat] = 0;
      }
      if (s.hearts[seat] <= 0) {
        events.push(decide(1 - seat, 'hearts'));
        return events;
      }
      if (s.n >= TURNS.maxTurns) {
        events.push(decide(tieWinner(s), 'turns'));
        return events;
      }
      events.push(next());
      return events;
    },

    /** Seat spends a joker: the sabotage waits for the other player's next block. */
    joker(seat, kind) {
      if (s.result || !seatOk(seat) || s.jokers[seat] < 1 || !isSabotage(kind)) return [];
      s.jokers[seat] -= 1;
      s.sab[1 - seat] = kind;
      return [{ type: 'sent', seat, kind }];
    },

    /** A player left (or quit): the other one wins. */
    leave(seat) {
      if (s.result || !seatOk(seat)) return [];
      return [decide(1 - seat, 'quit')];
    },

    /** The player whose turn it is took far too long (gone, or the game asleep): the other one wins. */
    timeout() {
      if (s.result || s.n < 1) return [];
      return [decide(1 - s.seat, 'timeout')];
    },

    get n() { return s.n; },
    get seat() { return s.seat; },
    get hearts() { return [...s.hearts]; },
    get perfects() { return [...s.perfects]; },
    get streaks() { return [...s.streak]; },
    get result() { return s.result ? { ...s.result } : null; },
    snapshot() { return clone(s); },
  };
}

/** After TURNS.maxTurns: the most hearts, then the most Perfeks, then whoever went second. */
function tieWinner(s) {
  if (s.hearts[0] !== s.hearts[1]) return s.hearts[0] > s.hearts[1] ? 0 : 1;
  if (s.perfects[0] !== s.perfects[1]) return s.perfects[0] > s.perfects[1] ? 0 : 1;
  return 1 - s.first;
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

/** Robot Rikus's sabotage when he earns a joker (seeded, so a match replays the same). */
export const botSabotage = (seed, n) => createRng(`${seed}/sabotage/${n}`).pick(SABOTAGES);

/** Who drops the first block of a match (seeded by the server: either player, fairly). */
export const firstSeat = (rand = Math.random) => (rand() < 0.5 ? 0 : 1);

const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : null);

/**
 * The block as it was let go: [x, y, angle, vx, vy] in world px (and px/s), or null. Exact numbers:
 * the other game starts the same fall from the same state.
 */
export function cleanPose(p) {
  if (!Array.isArray(p) || p.length !== 5) return null;
  const out = p.map((v, k) => num(v, k === 2 ? 10 : COORD_MAX));
  return out.every((v) => v !== null) ? out : null;
}

/**
 * Where a turn left the tower's loose blocks: { blocks: [[i, x, y, angle, frozen 0|1, rating], ...],
 * lost: [i, ...] }, or null. Everything that could have moved in the turn is in it (the blocks that
 * weren't cement when it began, and the new one).
 */
export function cleanSnap(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.blocks) || !Array.isArray(o.lost)) return null;
  if (o.blocks.length > SNAP_MAX || o.lost.length > SNAP_MAX) return null;
  const blocks = [];
  const seen = new Set();
  for (const e of o.blocks) {
    if (!Array.isArray(e) || e.length !== 6) return null;
    const [i, x, y, a, f, r] = e;
    if (!Number.isInteger(i) || i < 0 || i > BLOCK_MAX || seen.has(i)) return null;
    if (num(x, COORD_MAX) === null || num(y, COORD_MAX) === null || num(a, 1000) === null) return null;
    if (f !== 0 && f !== 1) return null;
    if (r !== null && !RATINGS.has(r)) return null;
    seen.add(i);
    blocks.push([i, x, y, a, f, r]);
  }
  const lost = [];
  for (const i of o.lost) {
    if (!Number.isInteger(i) || i < 0 || i > BLOCK_MAX || seen.has(i)) return null;
    lost.push(i);
  }
  return { blocks, lost };
}

/** How a turn's report is rated (anything else counts as a plain landing). */
export const cleanRating = (r) => (RATINGS.has(r) ? r : 'S');

/**
 * Does turn n's report hold together? Only blocks dropped so far (block n-1 is the turn's own), and the
 * turn's block is lost exactly when it is rated 'X'. (A cheap check against a made-up report.)
 */
export function snapFits(snap, n, r) {
  if (!snap || !Number.isInteger(n) || n < 1) return false;
  const last = n - 1;
  if (snap.blocks.some((e) => e[0] > last) || snap.lost.some((i) => i > last)) return false;
  return (r === 'X') === snap.lost.includes(last);
}
