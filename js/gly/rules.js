// (1.19 3D) Glybaan, Stapel's downhill runner: its rules, apart from any picture (tests/gly.test.js runs them). The owner
// (18 Oct 2026): "The gameplay will be a slide going downwards and also it needs to be four lanes"; his picks: four lanes,
// a 3D chute, a playable test of the core first.
//
// Your block slides down a chute of four lanes that keeps speeding up. The Square takes one lane; the Rectangle lies two
// lanes wide (and one high) or, turned, stands one lane wide and two high. Elements follow Stapel's own circle (water
// beats vuur, vuur beats gras, gras beats water): a hazard of the element that beats yours ends the run, one of the
// element you beat clouds the bottom of the screen for a while (steam, ash or vines), your own is safe (now and then with a
// bag of coins inside), and stone you dodge. A Shadow Gate is a wall with an outline cut out of it: fit through it,
// exactly for a Perfek.
import { rng } from '../kasteel/world.js';

export const LANES = 4;
export const LANE_W = 2.7;              // (m) a lane: Stapel's cube (2,4 m) with room on both sides
export const UNIT_H = 2.4;              // (m) a block's height lying down: a gate's hole is counted in these
export const ELEMENTS = Object.freeze(['vuur', 'water', 'gras']);
export const BEATS = Object.freeze({ vuur: 'gras', water: 'vuur', gras: 'water' });   // (as js/game/living.js)
export const SHAPES = Object.freeze(['square', 'rect']);
/** The Rectangle's reward for its risk (the brief: "+70% XP because its length makes it highly susceptible ..."). */
export const XP_K = Object.freeze({ square: 1, rect: 1.7 });

/** The element that beats `e` (its hazards end your run). */
export const killerOf = (e) => Object.keys(BEATS).find((k) => BEATS[k] === e);
/** The element `e` beats (its hazards cloud your view). */
export const victimOf = (e) => BEATS[e];
/** A lane's middle across the chute (m, 0 between lanes 1 and 2). */
export const laneX = (l) => (l - (LANES - 1) / 2) * LANE_W;

/** How wide (lanes) and high (units) the block is: the Square 1 x 1, the Rectangle lying 2 x 1, standing 1 x 2. */
export function sizeOf(shape, orient) {
  if (shape !== 'rect') return { w: 1, h: 1 };
  return orient === 'tall' ? { w: 1, h: 2 } : { w: 2, h: 1 };
}

/** The lanes the block takes, its leftmost at `lane`. */
export function lanesOf(shape, orient, lane) {
  const { w } = sizeOf(shape, orient);
  return Array.from({ length: w }, (_, i) => lane + i);
}

/** A lane the block can have its left side in (the whole block inside the chute). */
export const clampLane = (shape, orient, lane) => Math.max(0, Math.min(LANES - sizeOf(shape, orient).w, lane));

/** A swipe one lane left (-1) or right (+1): the new left lane (the same at the chute's side). */
export const moveLane = (shape, orient, lane, dir) => clampLane(shape, orient, lane + (dir < 0 ? -1 : 1));

/**
 * A turn (a tap): the Rectangle lying in lanes l and l+1 stands up in the one of them nearer the middle (the right one on
 * the left half, the left one on the right half; in the middle, on the side the last swipe went); standing in lane m it
 * lies down in m and m+1 (m-1 and m at the right side). The Square turns in its own lane. Returns { orient, lane }.
 */
export function turn(shape, orient, lane, lastDir = -1) {
  if (shape !== 'rect') return { orient, lane };
  if (orient === 'tall') return { orient: 'flat', lane: clampLane(shape, 'flat', lane) };
  const mid = lane + 0.5;
  const centre = (LANES - 1) / 2;
  const keep = mid < centre ? lane + 1 : mid > centre ? lane : lastDir > 0 ? lane + 1 : lane;
  return { orient: 'tall', lane: keep };
}

/** What a hazard of `h` ('stone' or an element) does to a block of element `me`: 'kill', 'blind' or 'safe'. */
export function effectOf(me, h) {
  if (h === 'stone' || h === killerOf(me)) return 'kill';
  if (h === victimOf(me)) return 'blind';
  return 'safe';
}

/**
 * Does the block go through a Shadow Gate's hole { lane, w, h } (its left lane, lanes wide, units high)? 'perfect' when
 * the block is exactly the hole, 'fit' when it is inside it, 'crash' when any of it meets the wall.
 */
export function gateFit(shape, orient, lane, hole) {
  const { w, h } = sizeOf(shape, orient);
  const inside = lane >= hole.lane && lane + w <= hole.lane + hole.w && h <= hole.h;
  if (!inside) return 'crash';
  return w === hole.w && h === hole.h ? 'perfect' : 'fit';
}

/** The run's speed (m/s) after `d` metres: 15 at the start, always faster, close to 40 by the end of a long run. */
export const speedAt = (d) => 15 + 25 * (1 - Math.exp(-Math.max(0, d) / 1800));

/** Metres between rows at speed `v`: about one second of warning at the start, a little less when it is fast. */
export const gapAt = (v) => v * (1.05 - 0.22 * Math.min(1, Math.max(0, (v - 15) / 25)));

/**
 * The track ahead, row after row, from a seed (the same seed, the same track: a Daily slide could share one). Each row:
 * { at (m), kind: 'hazards'|'gate'|'coins'|'item'|'calm', cells: [{ lane, type }], coins: [{ lane, at }], hole, item }.
 * Always passable: a "path" lane is kept free of anything that ends the run and moves at most one lane a row (two once it
 * is fast), and a gate's hole always lies on it (in the shape that block can take).
 */
export function createTrack(seed, { shape = 'square', element = 'water' } = {}) {
  const r = rng(typeof seed === 'number' ? seed : hashSeed(String(seed)));
  const pick = (list) => list[Math.floor(r() * list.length)];
  const kill = killerOf(element);
  const blind = victimOf(element);
  let at = 34;               // (the first row: a moment to find the controls)
  let path = 1 + Math.floor(r() * 2);
  let n = 0;
  let sinceGate = 0;
  let item = 0;
  const hazardType = (d) => {
    const x = r();
    if (d < 120) return x < 0.7 ? 'stone' : element;   // (the start: stone to dodge, your own to try)
    if (x < 0.34) return 'stone';
    if (x < 0.64) return kill;
    if (x < 0.88) return blind;
    return element;
  };
  return {
    /** The next row (and how far on the one after it comes). */
    next() {
      const d = at;
      const v = speedAt(d);
      const row = { at: d, kind: 'hazards', cells: [], coins: [], hole: null, item: null, n: n++ };
      const step = d > 1500 && r() < 0.35 ? 2 : 1;
      const from = path;
      path = Math.max(0, Math.min(LANES - 1, path + (r() < 0.5 ? -step : step) * (r() < 0.6 ? 1 : 0)));
      if (Math.abs(path - from) > step) path = from;
      sinceGate++;
      if (d > 140 && sinceGate >= 6 && r() < 0.45) {
        // a Shadow Gate: a hole the block's shape can take, on the path (the Rectangle's lying hole on the path and the
        // lane beside it; its standing hole on the path)
        sinceGate = 0;
        row.kind = 'gate';
        if (shape === 'rect' && r() < 0.5) row.hole = { lane: Math.min(path, LANES - 2), w: 2, h: 1 };
        else if (shape === 'rect') row.hole = { lane: path, w: 1, h: 2 };
        else row.hole = { lane: path, w: 1, h: 1 };
      } else if (d < 60 || r() < 0.16) {
        row.kind = 'coins';
        for (let k = 0; k < 5; k++) row.coins.push({ lane: path, at: d + k * 2.6 });
      } else {
        // hazards: one lane early on, up to three later; never the path lane (unless your own element, which is safe)
        const most = d < 200 ? 1 : d < 700 ? 2 : 3;
        const count = 1 + Math.floor(r() * most);
        const lanes = [0, 1, 2, 3].filter((l) => l !== path);
        for (let k = 0; k < count && lanes.length; k++) {
          const l = lanes.splice(Math.floor(r() * lanes.length), 1)[0];
          row.cells.push({ lane: l, type: hazardType(d) });
        }
        if (r() < 0.12) row.cells.push({ lane: path, type: element });   // (your own, right in your way: safe)
        // (the owner, 18 Oct: "maybe we should have the bags in the blocks, for example if its a fire block and it goes
        // through the firebox then it might get coins, but its random": a block of your own element may hold a bag of
        // coins, decided by the track's seed so a shared track shares its luck)
        for (const c of row.cells) if (c.type === element) c.bag = r() < BAG.chance ? bagCoins(r) : 0;
        if (r() < 0.45) for (let k = 0; k < 3; k++) row.coins.push({ lane: path, at: d + 3 + k * 2.6 });
        if (d > 220 && item <= 0 && r() < 0.05) { row.item = { lane: path, at: d + 6 }; item = 8; }
      }
      item--;
      at = d + gapAt(v) * (0.88 + r() * 0.24);
      if (row.kind === 'gate') at += 4;   // (a breath after a gate)
      return row;
    },
  };
}

/** A bag in a block of your own element: how often, and how many coins (mostly a few, now and then a lot). */
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

/** The ways through a row for the block, as { orient, lane } (none: the row can't be passed, a test's check). */
export function waysThrough(row, shape, element) {
  const out = [];
  const orients = shape === 'rect' ? ['flat', 'tall'] : ['flat'];
  for (const orient of orients) {
    for (let lane = 0; lane <= LANES - sizeOf(shape, orient).w; lane++) {
      if (row.kind === 'gate') {
        if (gateFit(shape, orient, lane, row.hole) !== 'crash') out.push({ orient, lane });
        continue;
      }
      const taken = lanesOf(shape, orient, lane);
      const deadly = row.cells.some((c) => taken.includes(c.lane) && effectOf(element, c.type) === 'kill');
      if (!deadly) out.push({ orient, lane });
    }
  }
  return out;
}
