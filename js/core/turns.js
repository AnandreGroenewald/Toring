// Blok vir Blok (1.11): two players build one tower, a block each in turn. This is the referee (whose
// turn it is, the hearts, the Perfek streaks that earn a joker, the sabotage waiting for a player's next
// block, and the result), and the checks for what one game tells the other about a turn: where its
// block was let go, and where the tower's loose blocks came to rest. Pure: the game runs it against
// Robot Rikus, the server (server/src/match.js) for a live match.
// 1.12 rondtes: the referee also says which weather or visitor comes with a turn. A round is two
// back-to-back turns (one each) with exactly the same event; the plan comes from the match seed, so the
// server and both games agree, and the turn messages carry it (a game never plans its own).

import { TURNS } from '../config.js';
import { createRng } from './rng.js';

export const SABOTAGES = Object.freeze([...TURNS.sabotages]);
export const isSabotage = (k) => SABOTAGES.includes(k);

// ------------------------------------------------------------------------------- rondtes (1.12)
// What a round can bring per stage, and how often (Hanswors stays out: his log isn't a block the turn
// reports carry; the rainbow too: there is no flood to lower and no points).
const ROUND_POOLS = Object.freeze({
  mild: Object.freeze({ wind: 3, rain: 3, fog: 2, heat: 2, monkey: 3 }),
  all: Object.freeze({ wind: 3, gust: 2.5, rain: 3, storm: 2.5, hail: 2.5, fog: 2, heat: 2, monkey: 3.5, thief: 2.5 }),
});
export const ROUND_KINDS = Object.freeze(Object.keys(ROUND_POOLS.all));
export const ROUND_VISITORS = Object.freeze(['monkey', 'thief']);
export const isRoundKind = (k) => ROUND_KINDS.includes(k);
export const isRoundVisitor = (k) => ROUND_VISITORS.includes(k);
const THIEF_MAX = 3;          // Skelm Sakkie comes in at most this many rounds of a match

/** The stage (0 = the calm start, 1-3 as TURNS.rounds) turn n belongs to. */
export function roundStage(n) {
  let k = 0;
  while (k < TURNS.rounds.length && n >= TURNS.rounds[k].from) k++;
  return k;
}

const round2 = (x) => Math.round(x * 100) / 100;
const oddIn = (rng, [lo, hi]) => {
  const odds = [];
  for (let g = lo; g <= hi; g++) if (g % 2) odds.push(g);
  return odds.length ? rng.pick(odds) : 1;
};

/**
 * A match's rounds: [{ n, kind, dir, strength, side, key }] sorted by n (the round's first turn; the
 * second is n + 1). Rules: none before TURNS.rounds[0].from; an odd number of turns between two rounds
 * (whoever faced one first faces the next second); never the same kind twice in a row; Skelm Sakkie at
 * most THIEF_MAX times. Pure: the same seed gives the same plan everywhere.
 */
export function turnRounds(seed, maxTurns = TURNS.maxTurns) {
  const rng = createRng(`${seed}/rondtes`);
  const out = [];
  // the first round comes a turn or two after the first stage's banner (both players' turns in it)
  let n = TURNS.rounds[0].from + 1 + rng.int(0, 1);
  while (TURNS.rounds.some((st) => st.from === n || st.from === n + 1)) n += 2;
  let prev = null;
  let thieves = 0;
  while (n + 1 <= maxTurns) {
    const stage = TURNS.rounds[Math.max(0, roundStage(n) - 1)];
    const items = [];
    for (const [kind, w] of Object.entries(ROUND_POOLS[stage.pool])) {
      if (kind === prev || (kind === 'thief' && thieves >= THIEF_MAX)) continue;
      items.push({ w, v: kind });
    }
    const kind = rng.weighted(items);
    if (kind === 'thief') thieves++;
    out.push({
      n, kind,
      dir: rng.chance(0.5) ? -1 : 1,
      strength: round2(0.6 + Math.min(0.9, n * 0.02) + rng.float(-0.1, 0.1)),
      side: rng.chance(0.5) ? -1 : 1,
      key: `r${out.length + 1}`,
    });
    prev = kind;
    n += 2 + oddIn(rng, stage.gap);
    // a stage's first turn has its own banner: no round covers it (as in the daily: no weather starts
    // on a stage's block); moved on by two, so the odd gap and the alternating first player stay
    while (TURNS.rounds.some((st) => st.from === n || st.from === n + 1)) n += 2;
  }
  return out;
}

/** Turn n's round event ({ kind, dir, strength, side, key, first }: first = its first turn), or null. */
export function roundFor(plan, n) {
  for (const r of plan || []) {
    if (r.n === n || r.n + 1 === n) return { kind: r.kind, dir: r.dir, strength: r.strength, side: r.side, key: r.key, first: r.n === n };
    if (r.n > n) break;
  }
  return null;
}

/** A round event from a message, cleaned up (or null): { kind, dir, strength, side, key, first }. */
export function cleanRound(o) {
  if (!o || typeof o !== 'object' || !isRoundKind(o.kind)) return null;
  const strength = typeof o.strength === 'number' && Number.isFinite(o.strength) ? Math.min(2, Math.max(0.3, o.strength)) : 1;
  const key = typeof o.key === 'string' && /^r\d{1,3}$/.test(o.key) ? o.key : null;
  if (!key) return null;
  return { kind: o.kind, dir: o.dir === -1 ? -1 : 1, strength, side: o.side === -1 ? -1 : 1, key, first: o.first === true };
}

/** Did the player beat the round's visitor? Blouaap: a Perfek scares him off; Skelm Sakkie: caught. */
export const beatVisitor = (kind, r, vis) => (kind === 'monkey' ? r === 'P' : kind === 'thief' ? vis === 'caught' : false);

/** A turn report's visitor outcome ('caught' | 'stole'), or null. */
export const cleanVis = (v) => (v === 'caught' || v === 'stole' ? v : null);

/** Robot Rikus against Skelm Sakkie (seeded): does he catch him, and when (share of the climb). */
export function botCatch(seed, n) {
  const r = createRng(`${seed}/rikus-vang/${n}`);
  return { catches: r.chance(0.6), at: r.float(0.35, 0.85) };
}
const RATINGS = new Set(['P', 'G', 'S', 'X']);
const SNAP_MAX = 32;          // tower blocks one turn can report (the loose top is TURNS.liveBlocks + 1)
const COORD_MAX = 1e7;        // px: further than this is not a tower
const BLOCK_MAX = 5000;

const seatOk = (s) => s === 0 || s === 1;

/**
 * The referee. `first` is the seat that drops the first block; with `rounds` (1.12, both games know
 * them) and the match `seed`, turns bring the rounds' weather and visitors. Events:
 *  { type: 'turn', n, seat, hearts, streaks, sab, ev, nx }  turn n is seat's (sab: a sabotage on this block,
 *      ev: this turn's round event, nx: the round that begins with the next turn (to show it coming))
 *  { type: 'joker', seat }                           seat earned a joker: they choose a sabotage
 *  { type: 'sent', seat, kind }                      seat's sabotage waits for the other player's next block
 *  { type: 'result', winner, reason, hearts }        'hearts' | 'quit' | 'timeout' | 'turns'
 */
export function createTurnReferee({ first = 0, init = null, seed = null, rounds = false } = {}) {
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
    rounds: !!rounds && typeof seed === 'string' && seed.length > 0,
    seed: typeof seed === 'string' ? seed : null,
  };
  let plan = null;
  const planOf = () => plan || (plan = s.rounds ? turnRounds(s.seed) : []);
  const evAt = (n) => (s.rounds ? roundFor(planOf(), n) : null);

  const turnEvent = () => {
    const nx = evAt(s.n + 1);
    return {
      type: 'turn', n: s.n, seat: s.seat, hearts: [...s.hearts], streaks: [...s.streak], sab: s.sabNow || null,
      ev: evAt(s.n), nx: nx && nx.first ? nx : null,
    };
  };

  function next() {
    s.n += 1;
    if (s.n > 1) s.seat = 1 - s.seat;
    // a sabotage never rides on a round's turn: it waits for that player's next turn without one
    if (evAt(s.n)) {
      s.sabNow = null;
    } else {
      s.sabNow = s.sab[s.seat];
      s.sab[s.seat] = null;
    }
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
    settled(seat, { n, lost = false, r = 'S', vis = null } = {}) {
      if (s.result || seat !== s.seat || n !== s.n || s.n < 1) return [];
      const events = [];
      // a turn costs at most one heart; beating the round's visitor gives one back (never above the start)
      const ev = evAt(s.n);
      const beat = TURNS.visitorHeart && !!ev && beatVisitor(ev.kind, r, cleanVis(vis));
      s.hearts[seat] = Math.max(0, Math.min(TURNS.hearts, s.hearts[seat] - (lost ? 1 : 0) + (beat ? 1 : 0)));
      if (beat) s.beats = [...(s.beats || [0, 0])].map((b, k) => (k === seat ? b + 1 : b));
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
    get beats() { return [...(s.beats || [0, 0])]; },
    get rounds() { return s.rounds; },
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
