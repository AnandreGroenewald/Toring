// Deterministic block + weather sequence for a seed. The daily tower uses the
// date seed, so every player gets the exact same blocks and weather.
// Changing any table below changes every daily tower — treat it as level data.

import { createRng } from './rng.js';
import { SHAPE_IDS, PALETTE } from '../config.js';

// --- Blocks -----------------------------------------------------------------

// First block index at which each shape may appear.
const SHAPE_UNLOCK = {
  plank: 0, slab: 1, brick: 1, crate: 1,
  cube: 4, pillar: 4, wedge: 4, arch: 4,
  L: 12, J: 12, T: 12,
};

// [weight early, weight late]: easy shapes dominate early, awkward ones grow later.
const SHAPE_WEIGHTS = {
  plank: [6, 2.5],
  slab: [5, 2.5],
  brick: [4, 2.5],
  crate: [2.5, 2],
  cube: [1.5, 2],
  pillar: [1, 1.6],
  wedge: [1, 1.8],
  arch: [1.2, 2],
  L: [0.8, 1.6],
  J: [0.8, 1.6],
  T: [0.8, 1.6],
};
const WEIGHT_RAMP_FROM = 4;
const WEIGHT_RAMP_BLOCKS = 50;

// Width multiplier range: [0.95, 1.12] at the start, drifting to [0.8, 1.0] by block 40.
const SCALE_EARLY = [0.95, 1.12];
const SCALE_LATE = [0.8, 1.0];
const SCALE_RAMP_BLOCKS = 40;

// Colours not reused from the previous N blocks (spec minimum is 1).
const COLOR_MEMORY = 2;

// --- Weather ------------------------------------------------------------------

const WEATHER_HORIZON = 300;     // events are precomputed for block indices 0..299
const FIRST_EVENT_AT = 5;
const LATE_FROM = 15;            // events starting at/after this may be the harsh types
const EARLY_TYPES = ['wind', 'rain', 'heat', 'fog'];
const LATE_TYPES = ['wind', 'gust', 'rain', 'storm', 'hail', 'fog', 'heat'];
const TYPE_WEIGHTS = { wind: 3, gust: 2.5, rain: 3, storm: 2.5, hail: 2.5, fog: 2, heat: 2 };
const GAP = [2, 4];
const RAINBOW_GAP = [0, 1];
const RAINBOW_CHANCE = 0.5;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const round2 = (x) => Math.round(x * 100) / 100;

function durationFor(type, rng) {
  if (type === 'rainbow') return 3;
  if (type === 'fog' || type === 'heat') return rng.int(4, 6);
  return rng.int(3, 5);
}

function buildEvents(rng) {
  const events = [];
  let start = FIRST_EVENT_AT;
  let prev = null;
  let rainbowNext = false;
  while (start < WEATHER_HORIZON) {
    let type;
    if (rainbowNext) {
      type = 'rainbow';
    } else {
      const pool = start < LATE_FROM ? EARLY_TYPES : LATE_TYPES;
      const items = [];
      for (const t of pool) if (t !== prev) items.push({ w: TYPE_WEIGHTS[t], v: t });
      type = rng.weighted(items);
    }
    const end = start + durationFor(type, rng);
    const strength = round2(0.6 + Math.min(0.9, start * 0.02) + rng.float(-0.1, 0.1));
    const dir = rng.chance(0.5) ? -1 : 1;
    events.push({ type, start, end, dir, strength });

    rainbowNext = type === 'rain' && rng.chance(RAINBOW_CHANCE);
    const gap = rainbowNext ? rng.int(RAINBOW_GAP[0], RAINBOW_GAP[1]) : rng.int(GAP[0], GAP[1]);
    prev = type;
    start = end + gap;
  }
  return events;
}

/** Deterministic block + weather sequence for `seed`. */
export function createSequence(seed) {
  const seedKey = String(seed);
  const root = createRng(seedKey);
  const blockRng = root.fork('blocks');
  const events = buildEvents(root.fork('weather'));
  const cache = [];

  function generateNext() {
    const i = cache.length;
    if (i === 0) {
      const color = blockRng.int(0, PALETTE.length - 1);
      cache.push({ i, shape: 'plank', scale: 1, color });
      return;
    }

    const prev1 = cache[i - 1];
    const prev2 = i >= 2 ? cache[i - 2] : null;
    const banned = prev2 && prev2.shape === prev1.shape ? prev1.shape : null;
    const t = clamp01((i - WEIGHT_RAMP_FROM) / WEIGHT_RAMP_BLOCKS);
    const items = [];
    for (const id of SHAPE_IDS) {
      if (i < SHAPE_UNLOCK[id] || id === banned) continue;
      const [early, late] = SHAPE_WEIGHTS[id];
      items.push({ w: lerp(early, late, t), v: id });
    }
    const shape = blockRng.weighted(items);

    const s = clamp01(i / SCALE_RAMP_BLOCKS);
    const lo = lerp(SCALE_EARLY[0], SCALE_LATE[0], s);
    const hi = lerp(SCALE_EARLY[1], SCALE_LATE[1], s);
    const scale = round2(blockRng.float(lo, hi));

    const recent = [];
    for (let k = 1; k <= COLOR_MEMORY && i - k >= 0; k++) recent.push(cache[i - k].color);
    const colors = [];
    for (let c = 0; c < PALETTE.length; c++) if (!recent.includes(c)) colors.push(c);
    const color = blockRng.pick(colors);

    cache.push({ i, shape, scale, color });
  }

  function block(i) {
    const idx = Math.max(0, Math.floor(Number(i) || 0));
    while (cache.length <= idx) generateNext();
    return { ...cache[idx] }; // copy so callers can't corrupt the cache
  }

  function eventAt(i) {
    // Binary search for the last event with start <= i.
    let lo = 0;
    let hi = events.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].start <= i) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (found < 0) return null;
    const ev = events[found];
    return i < ev.end ? ev : null;
  }

  function forecast(n = 5) {
    return events.slice(0, Math.max(0, n)).map((e) => e.type);
  }

  return { seed: seedKey, block, events, eventAt, forecast };
}

// Exposed for tests / tooling.
export const SEQUENCE_RULES = Object.freeze({
  WEATHER_HORIZON, FIRST_EVENT_AT, LATE_FROM, EARLY_TYPES, LATE_TYPES, SHAPE_UNLOCK,
  SCALE_MIN: SCALE_LATE[0], SCALE_MAX: SCALE_EARLY[1],
});

