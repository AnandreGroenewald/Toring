// Visitors (besoekers): who comes to the tower at which block, and everything random a
// visitor does there. The schedule comes from its own fork of the day's seed (see
// createSequence), so the block and weather streams are untouched, and each visit draws
// from its own stream keyed by its type and block: the same Daaglikse Toring brings the
// same visitors, doing the same things, for everyone. Changing a table here changes
// every daily tower: treat it as level data. Pure: importable in node (unit tested).

import { createRng } from './rng.js';
import { VISITOR, VISITOR_TYPES, SHAPE_IDS, PALETTE } from '../config.js';

const HORIZON = 300;          // visitors are planned for block indices 0..299, like the weather
const FIRST_AT = 8;           // nobody visits before block 8...
const FIRST_SPREAD = 6;       // ...and the first visitor comes by block 14
const GAP = [10, 20];         // blocks from one visitor to the next (mean 15)
const THIEF_FROM = 14;        // the thief needs a tower worth robbing
const TYPE_WEIGHTS = { monkey: 4, clown: 3.5, thief: 2.5 };
const FORECAST_BLOCKS = 45;   // the menu and the teaser name the visitors of about one tower
const GIFT_SHAPES = ['crate', 'slab', 'brick'];   // steady shapes: a gift should wobble, not wreck

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * The day's visitors: [{ type, at, side, strength }] sorted by `at` (the block index that
 * is on the crane when the visitor arrives). `side` is the screen side it comes from.
 * Rules: none before block 8, never on a block where a weather event starts, at least
 * GAP[0] blocks apart (so only one is ever on screen), never the same type twice in a
 * row, and the thief at most once per tower.
 */
export function buildVisitors(rng, events = []) {
  const weatherStarts = new Set((events || []).map((e) => e.start));
  const list = [];
  let at = FIRST_AT + rng.int(0, FIRST_SPREAD);
  let prev = null;
  let thief = false;
  while (at < HORIZON) {
    while (weatherStarts.has(at)) at++;
    if (at >= HORIZON) break;
    const items = [];
    for (const t of VISITOR_TYPES) {
      if (t === prev || (t === 'thief' && (thief || at < THIEF_FROM))) continue;
      items.push({ w: TYPE_WEIGHTS[t], v: t });
    }
    const type = rng.weighted(items);
    const side = rng.chance(0.5) ? -1 : 1;
    const strength = round2(0.7 + Math.min(0.3, at * 0.01) + rng.float(-0.1, 0.1));
    list.push({ type, at, side, strength });
    if (type === 'thief') thief = true;
    prev = type;
    at += rng.int(GAP[0], GAP[1]);
  }
  return list;
}

/** The visitor that arrives with block `i`, or null. */
export function visitorAt(list, i) {
  for (const v of list) {
    if (v.at === i) return v;
    if (v.at > i) break;
  }
  return null;
}

/** Visitor types of the first `n` blocks, each once, in order of arrival (menu: "Besoekers vandag: 🐒 🤡"). */
export function visitorForecast(list, n = FORECAST_BLOCKS) {
  const out = [];
  for (const v of list) {
    if (v.at >= n) break;
    if (!out.includes(v.type)) out.push(v.type);
  }
  return out;
}

/** The stream for one visit (independent of everything else drawn that day). */
export function visitRng(seed, v) {
  return createRng(`${seed}/visitor-fx`).fork(`${v.type}@${v.at}`);
}

/** Blouaap: how many of the top blocks it shoves (1 or 2), how hard and with how much spin. */
export function monkeyPlan(r, v) {
  const s = Number.isFinite(v?.strength) ? v.strength : 1;
  const count = r.chance(0.3 + 0.4 * Math.min(1, Math.max(0, (s - 0.6) / 0.6))) ? 2 : 1;
  return {
    count,
    kick: round2(r.float(VISITOR.monkeyKick[0], VISITOR.monkeyKick[1]) * s),
    spin: round2(r.float(0.5, 1) * VISITOR.monkeySpin * 1000) / 1000,
  };
}

/** Hanswors: the gift block (a steady shape) and how crooked it is placed. */
export function clownPlan(r, v) {
  const side = v?.side === -1 ? -1 : 1;
  const shape = r.pick(GIFT_SHAPES);
  return {
    spec: { shape: SHAPE_IDS.includes(shape) ? shape : 'crate', scale: round2(r.float(0.85, 0.95)), color: r.int(0, PALETTE.length - 1) },
    dx: round2(-side * r.float(VISITOR.giftOffsetPx[0], VISITOR.giftOffsetPx[1])),
    tilt: round2((r.chance(0.5) ? -1 : 1) * r.float(VISITOR.giftTilt[0], VISITOR.giftTilt[1]) * 1000) / 1000,
  };
}

/** Skelm Sakkie: how long the climb (the tap window) takes; a little quicker on later visits. */
export function thiefPlan(r, v) {
  const s = Number.isFinite(v?.strength) ? v.strength : 1;
  const k = Math.min(1, Math.max(0, (s - 0.6) / 0.6));
  return { climbMs: Math.round(VISITOR.thiefClimbMs * (1.1 - 0.2 * k) + r.float(-60, 60)) };
}

// Exposed for tests / tooling.
export const VISITOR_RULES = Object.freeze({ HORIZON, FIRST_AT, FIRST_SPREAD, GAP, THIEF_FROM, FORECAST_BLOCKS, GIFT_SHAPES });
