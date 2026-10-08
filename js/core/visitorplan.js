// Visitors (besoekers): who comes to the tower at which block, and everything random a
// visitor does there. The schedule comes from its own fork of the day's seed (see
// createSequence), so the block and weather streams are untouched, and each visit draws
// from its own stream keyed by its type and block: the same Daaglikse Toring brings the
// same visitors, doing the same things, for everyone. Changing a table here changes
// every daily tower: treat it as level data. Pure: importable in node (unit tested).

import { createRng } from './rng.js';
import { VISITOR, VISITOR_TYPES, STAGES, stageAt } from '../config.js';

const HORIZON = 300;          // visitors are planned for block indices 0..299, like the weather
// The stages (config.js STAGES) set the pace: nobody in the warm-up, then a visitor every STAGES[k].visitors
// blocks, the thief only from the stage that brings him (he needs a tower worth robbing anyway).
const FIRST_AT = STAGES[1].from + 4;   // nobody visits before block 16...
const FIRST_SPREAD = 4;               // ...and the first visitor comes by block 20
const GAP = STAGES[1].visitors;       // (the first stage's gap; later stages are quicker)
const THIEF_FROM = STAGES.find((st) => st.thief).from;
const TYPE_WEIGHTS = { monkey: 4, clown: 3.5, thief: 2.5 };
const FORECAST_BLOCKS = 45;   // the menu and the teaser name the visitors of about one tower
const GIFT_SHAPES = ['crate', 'slab', 'brick'];   // (1.9 and before: his 1-4 gift blocks)
// Hanswors brings one big log: a wide, steady new floor (testers found his narrow gift blocks a nuisance)
const LOG_SPEC = Object.freeze({ shape: 'log', scale: 1, color: 0, log: true });

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * The day's visitors: [{ type, at, side, strength }] sorted by `at` (the block index that
 * is on the crane when the visitor arrives). `side` is the screen side it comes from.
 * Rules: none in the warm-up stage, never on a block where a weather event starts or a stage
 * begins, at least the stage's gap apart (so only one is ever on screen), never the same type
 * twice in a row, and the thief at most once per tower, from his stage on.
 */
export function buildVisitors(rng, events = []) {
  const weatherStarts = new Set((events || []).map((e) => e.start));
  const list = [];
  let at = FIRST_AT + rng.int(0, FIRST_SPREAD);
  let prev = null;
  let thief = false;
  while (at < HORIZON) {
    while (weatherStarts.has(at) || STAGES.some((st) => st.from === at)) at++;
    if (at >= HORIZON) break;
    const stage = STAGES[stageAt(at)];
    const items = [];
    for (const t of VISITOR_TYPES) {
      if (t === prev || (t === 'thief' && (thief || !stage.thief))) continue;
      items.push({ w: TYPE_WEIGHTS[t], v: t });
    }
    const type = rng.weighted(items);
    const side = rng.chance(0.5) ? -1 : 1;
    const strength = round2(0.7 + Math.min(0.3, at * 0.01) + rng.float(-0.1, 0.1));
    list.push({ type, at, side, strength });
    if (type === 'thief') thief = true;
    prev = type;
    at += rng.int(stage.visitors[0], stage.visitors[1]);
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

/**
 * Blouaap: he hurls the top block into the sea (how fast it goes, how it tumbles) and stamps
 * on the next 1 or 2 (how many, how hard and with how much spin).
 */
export function monkeyPlan(r, v) {
  const s = Number.isFinite(v?.strength) ? v.strength : 1;
  const count = r.chance(0.3 + 0.4 * Math.min(1, Math.max(0, (s - 0.6) / 0.6))) ? 2 : 1;
  return {
    count,
    kick: round2(r.float(VISITOR.monkeyKick[0], VISITOR.monkeyKick[1]) * s),
    spin: round2(r.float(0.5, 1) * VISITOR.monkeySpin * 1000) / 1000,
    hurl: round2(r.float(VISITOR.monkeyHurl[0], VISITOR.monkeyHurl[1])),
    hurlSpin: round2(r.float(VISITOR.monkeyHurlSpin[0], VISITOR.monkeyHurlSpin[1]) * 1000) / 1000,
  };
}

/** Hanswors: 1-4 gift blocks (steady shapes) that he stacks on the tower, where they set as a new foundation. */
export function clownPlan() {
  return { specs: [{ ...LOG_SPEC }] };
}

/** Skelm Sakkie: how long the climb (the tap window) takes; a little quicker on later visits. */
export function thiefPlan(r, v) {
  const s = Number.isFinite(v?.strength) ? v.strength : 1;
  const k = Math.min(1, Math.max(0, (s - 0.6) / 0.6));
  return { climbMs: Math.round(VISITOR.thiefClimbMs * (1.1 - 0.2 * k) + r.float(-60, 60)) };
}

// Exposed for tests / tooling.
export const VISITOR_RULES = Object.freeze({ HORIZON, FIRST_AT, FIRST_SPREAD, GAP, THIEF_FROM, FORECAST_BLOCKS, GIFT_SHAPES });
