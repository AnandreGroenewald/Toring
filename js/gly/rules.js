// (1.19 3D) Glybaan, Stapel's downhill runner: its rules, apart from any picture (tests/gly.test.js runs them). The owner
// (18 Oct 2026): "The gameplay will be a slide going downwards and also it needs to be four lanes"; later: "maybe we
// should forget about the blocks here and make it small men that runs, fire man, Water man, and earth man".
//
// Your little elemental man runs down a slide of four lanes that keeps speeding up: swipe for a lane, jump (a tap or a
// swipe up) or slide (a swipe down). Elements follow Stapel's own circle (water beats vuur, vuur beats gras, gras beats
// water): what beats you ends the run, what you beat clouds the bottom of the screen a while (steam, ash or vines), your
// own is safe (now and then with a bag of coins inside), stone you dodge. Low hazards (a whirlpool, a pool of lava) can be
// jumped; tall ones (a waterfall, a fire, vines, a boulder) only dodged. Barriers: a low beam to jump, a high one to slide
// under, a wall with a gap to run through.
import { rng } from '../kasteel/world.js';

export const LANES = 4;
export const LANE_W = 2.5;              // (m) a lane: a little man with room on both sides
export const ELEMENTS = Object.freeze(['vuur', 'water', 'gras']);
export const BEATS = Object.freeze({ vuur: 'gras', water: 'vuur', gras: 'water' });   // (as js/game/living.js)
/** What your man can be doing as he meets a row. */
export const ACTS = Object.freeze(['run', 'jump', 'slide']);
/** A jump's time in the air and its height; a slide's time down (s, m). */
export const JUMP = Object.freeze({ time: 0.62, height: 2.4 });
export const SLIDE = Object.freeze({ time: 0.72 });

/** The element that beats `e` (its hazards end your run). */
export const killerOf = (e) => Object.keys(BEATS).find((k) => BEATS[k] === e);
/** The element `e` beats (its hazards cloud your view). */
export const victimOf = (e) => BEATS[e];
/** A lane's middle across the slide (m, 0 between lanes 1 and 2). */
export const laneX = (l) => (l - (LANES - 1) / 2) * LANE_W;
/** A swipe one lane left (-1) or right (+1): the new lane (the same at the slide's side). */
export const moveLane = (lane, dir) => Math.max(0, Math.min(LANES - 1, lane + (dir < 0 ? -1 : 1)));

/** What a hazard of `h` ('stone' or an element) does to a man of element `me`: 'kill', 'blind' or 'safe'. */
export function effectOf(me, h) {
  if (h === 'stone' || h === killerOf(me)) return 'kill';
  if (h === victimOf(me)) return 'blind';
  return 'safe';
}
/** Which elements' hazards can lie low (a whirlpool, lava): the others stand tall (a waterfall, a fire, vines, a boulder). */
export const CAN_BE_LOW = Object.freeze({ water: true, vuur: true, gras: false, stone: false });

/** The run's speed (m/s) after `d` metres: 15 at the start, always faster, close to 40 by the end of a long run. */
export const speedAt = (d) => 15 + 25 * (1 - Math.exp(-Math.max(0, d) / 1800));
/** Metres between rows at speed `v`: about one second of warning at the start, a little less when it is fast. */
export const gapAt = (v) => v * (1.05 - 0.22 * Math.min(1, Math.max(0, (v - 15) / 25)));

/**
 * Does a man in `lane`, doing `act`, get through `row` alive? A low beam wants a jump, a high one a slide, a wall its gap;
 * a hazard that would end the run is passed only by jumping it, and only when it lies low.
 */
export function passes(row, lane, act, element, sw = false) {
  if (row.kind === 'bar') return row.bar === 'low' ? act === 'jump' : act === 'slide';
  if (row.kind === 'wall') return lane === row.gap;
  const cell = row.cells.find((c) => c.lane === lane);
  // (the switch test: an element's hazard is met by switching to the right man; only stone must be dodged)
  if (!cell || (sw ? cell.type !== 'stone' : effectOf(element, cell.type) !== 'kill')) return true;
  return cell.low && act === 'jump';
}
/** The ways through a row, as { lane, act } (none: the row can't be passed, a test's check). */
export function waysThrough(row, element, sw = false) {
  const out = [];
  for (let lane = 0; lane < LANES; lane++) for (const act of ACTS) if (passes(row, lane, act, element, sw)) out.push({ lane, act });
  return out;
}

/**
 * The track ahead, row after row, from a seed (the same seed, the same track: a Daily slide could share one). Each row:
 * { at (m), kind: 'hazards'|'bar'|'wall'|'coins', cells: [{ lane, type, low, bag }], coins: [{ lane, at, high }], bar
 * ('low'|'high'), gap (a wall's open lane), item, n }. Always passable: a "path" lane moves at most one lane a row (two
 * once it is fast) and never holds what would end the run, unless it lies low enough to jump (then coins hang over it).
 */
export function createTrack(seed, { element = 'water', sw = false } = {}) {
  const r = rng(typeof seed === 'number' ? seed : hashSeed(String(seed)));
  const kill = killerOf(element);
  const blind = victimOf(element);
  let at = 34;               // (the first row: a moment to find the controls)
  let path = 1 + Math.floor(r() * 2);
  let n = 0;
  let sinceBar = 0;
  let item = 0;
  let gates = 0;
  let sinceGate = 0;
  const anyEl = () => ELEMENTS[Math.floor(r() * ELEMENTS.length)];
  const hazardType = (d) => {
    const x = r();
    // (the switch test: any element may come, and the man switches to meet it; stone is still dodged)
    if (sw) return x < (d < 120 ? 0.5 : 0.3) ? 'stone' : anyEl();
    if (d < 120) return x < 0.7 ? 'stone' : element;   // (the start: stone to dodge, your own to try)
    if (x < 0.34) return 'stone';
    if (x < 0.64) return kill;
    if (x < 0.88) return blind;
    return element;
  };
  const cellOf = (lane, type) => ({ lane, type, low: CAN_BE_LOW[type] ? r() < 0.5 : false });
  return {
    /** The next row (and how far on the one after it comes). */
    next() {
      const d = at;
      const v = speedAt(d);
      const row = { at: d, kind: 'hazards', cells: [], coins: [], bar: null, gap: null, item: null, n: n++ };
      const step = d > 1500 && r() < 0.35 ? 2 : 1;
      const from = path;
      path = Math.max(0, Math.min(LANES - 1, path + (r() < 0.5 ? -step : step) * (r() < 0.6 ? 1 : 0)));
      if (Math.abs(path - from) > step) path = from;
      sinceBar++;
      sinceGate++;
      if (d > 140 && sinceBar >= 5 && r() < 0.45) {
        // a barrier: a low beam to jump, a high one to slide under, or a wall with its gap on the path
        sinceBar = 0;
        const k = r();
        if (k < 0.36) { row.kind = 'bar'; row.bar = 'low'; } else if (k < 0.72) { row.kind = 'bar'; row.bar = 'high'; } else { row.kind = 'wall'; row.gap = path; }
        if (r() < 0.5) for (let c = 0; c < 3; c++) row.coins.push({ lane: path, at: d + 3 + c * 2.6, high: false });
      } else if (d < 60 || r() < 0.16) {
        row.kind = 'coins';
        for (let k = 0; k < 5; k++) row.coins.push({ lane: path, at: d + k * 2.6, high: false });
      } else if (sw && (gates === 0 || (sinceGate >= 3 && r() < 0.4))) {
        // a gate (concept A, the element gates): one element across all four lanes, so no lane dodges it, only the right man
        gates++;
        sinceGate = 0;
        const t = anyEl();
        for (let l = 0; l < LANES; l++) row.cells.push({ lane: l, type: t, low: false });
        if (r() < 0.5) row.cells[path].bag = bagCoins(r);
      } else {
        // hazards: one lane early on, up to three later; the path kept clear of what ends the run
        const most = d < 200 ? 1 : d < 700 ? 2 : 3;
        const count = 1 + Math.floor(r() * most);
        const lanes = [0, 1, 2, 3].filter((l) => l !== path);
        for (let k = 0; k < count && lanes.length; k++) row.cells.push(cellOf(lanes.splice(Math.floor(r() * lanes.length), 1)[0], hazardType(d)));
        const onPath = r();
        if (d > 250 && onPath < 0.18) {
          // something low right on the path: jump it (or find another way) - coins hang in the air over it
          const t = r() < 0.5 ? 'water' : 'vuur';
          row.cells.push({ lane: path, type: sw || t !== element ? t : (element === 'water' ? 'vuur' : 'water'), low: true });
          for (let k = 0; k < 3; k++) row.coins.push({ lane: path, at: d - 2.6 + k * 2.6, high: true });
        } else if (onPath < (sw ? 0.55 : 0.3)) {
          row.cells.push(cellOf(path, sw ? anyEl() : element));   // (your own, right in your way: safe; the switch test: any element)
        }
        // (the owner, 18 Oct: "maybe we should have the bags in the blocks ... it might get coins, but its random": your
        // own element's hazard may hold a bag of coins, decided by the track's seed so a shared track shares its luck)
        for (const c of row.cells) if (sw ? c.type !== 'stone' : c.type === element) c.bag = r() < BAG.chance * (sw ? 0.4 : 1) ? bagCoins(r) : 0;
        if (!row.coins.length && r() < 0.45) for (let k = 0; k < 3; k++) row.coins.push({ lane: path, at: d + 3 + k * 2.6, high: false });
        if (d > 220 && item <= 0 && r() < 0.05) { row.item = { lane: path, at: d + 6 }; item = 8; }
      }
      item--;
      at = d + gapAt(v) * (0.88 + r() * 0.24);
      if (row.kind === 'bar' || row.kind === 'wall') at += 4;   // (a breath after a barrier)
      return row;
    },
  };
}

/** A bag in a hazard of your own element: how often, and how many coins (mostly a few, now and then a lot). */
export const BAG = Object.freeze({ chance: 0.55, min: 3, max: 20 });
export function bagCoins(r) {
  const x = r();
  return Math.round(BAG.min + (BAG.max - BAG.min) * x * x * x);
}

/** A string seed as a number (FNV-1a). */
export function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** XP for a run: its metres, every barrier passed, every perfect timing, every hazard jumped. */
export const runXp = ({ d = 0, bars = 0, perfects = 0, jumps = 0 }) => Math.round(Math.floor(Math.max(0, d)) + bars * 20 + perfects * 30 + jumps * 5);

// ------------------------------------------------------------------------------------------------- missions and levels
/**
 * Opdragte (missions), three at a time (the owner, 18 Oct 2026: "I want you to be adicted to the game that is how good it
 * must be"): something to aim for in every run. A kind counts in one run ('run') or over all of them ('all'); its target
 * grows every third mission done (the tier), and so does its reward (coins, to Stapel's wallet).
 */
export const MISSIONS = Object.freeze({
  coins: Object.freeze({ per: 'run', targets: Object.freeze([15, 25, 40, 55, 75, 100]) }),
  dist: Object.freeze({ per: 'run', targets: Object.freeze([250, 400, 600, 850, 1150, 1500]) }),
  bars: Object.freeze({ per: 'run', targets: Object.freeze([1, 2, 3, 5, 7, 9]) }),
  perfects: Object.freeze({ per: 'run', targets: Object.freeze([1, 2, 3, 4, 6, 8]) }),
  jumps: Object.freeze({ per: 'run', targets: Object.freeze([1, 2, 3, 5, 7, 10]) }),
  bags: Object.freeze({ per: 'run', targets: Object.freeze([1, 1, 2, 2, 3, 4]) }),
  close: Object.freeze({ per: 'run', targets: Object.freeze([1, 2, 3, 4, 6, 8]) }),
  total: Object.freeze({ per: 'all', targets: Object.freeze([1000, 2500, 5000, 8000, 12000, 18000]) }),
  runs: Object.freeze({ per: 'all', targets: Object.freeze([3, 5, 8, 10, 12, 15]) }),
});
/** Missions done so far → how hard the next ones are (0-5). */
export const missionTier = (done) => Math.min(5, Math.floor(Math.max(0, done) / 3));
export const missionReward = (tier) => 15 + 5 * Math.min(5, Math.max(0, tier));
/** A new mission (`r` a random 0-1), of a kind none of `taken` has: { kind, n (target), p (progress, 'all' kinds), r }. */
export function newMission(r, taken, done) {
  const kinds = Object.keys(MISSIONS).filter((k) => !taken.includes(k));
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(r() * kinds.length))];
  const tier = missionTier(done);
  return { kind, n: MISSIONS[kind].targets[tier], p: 0, r: missionReward(tier) };
}
/** Missions as kept on the phone, made right (three, of different known kinds, sane numbers; done ones make way). */
export function cleanMissions(list, r, done) {
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (out.length >= 3 || !m || typeof m !== 'object' || m.done || !MISSIONS[m.kind] || out.some((x) => x.kind === m.kind)) continue;
    const top = MISSIONS[m.kind].targets[MISSIONS[m.kind].targets.length - 1];
    const n = Math.max(1, Math.min(top, Math.floor(Number(m.n) || 0)));
    out.push({ kind: m.kind, n, p: Math.max(0, Math.min(n - 1, Math.floor(Number(m.p) || 0))), r: Math.max(15, Math.min(40, Math.floor(Number(m.r) || 15))) });
  }
  while (out.length < 3) out.push(newMission(r, out.map((x) => x.kind), done));
  return out;
}
/** The level `xp` in all reaches: level L goes on to L+1 after 400 x L more (400, 800, 1 200 ...). { level, into, need }. */
export function levelOf(xp) {
  let level = 1;
  let need = 400;
  let rest = Math.max(0, Math.floor(Number(xp) || 0));
  while (rest >= need && level < 999) { rest -= need; level++; need = 400 * level; }
  return { level, into: rest, need };
}
/** Coins for reaching `level`. */
export const levelReward = (level) => 20 + 5 * Math.min(10, Math.max(0, level));
