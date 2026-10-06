// Everything random that weather does to the tower, drawn from seeded streams.
// One stream per weather event (keyed by its type and start block) and one sub-
// stream per gust flip, lightning strike and hail shower, so the values never
// depend on frame timing or on how often anything else asked for a number:
// the same Daaglikse Toring plays out the same for everyone.
// Pure: importable in node (unit tested).

import { createRng } from './rng.js';

export const GUST_MUL = [0.75, 1.25];

/** The stream for one weather event of a sequence. */
export function eventRng(seed, ev) {
  return createRng(`${seed}/weather-fx`).fork(`${ev.type}@${ev.start}`);
}

/** Gust strength multiplier for flip n (1-based) of an event. */
export function gustMul(evRng, n) {
  return evRng.fork(`gust${n}`).float(GUST_MUL[0], GUST_MUL[1]);
}

/** Lightning strike n (1-based): sideways kick (px/step, before strength) and spin sign. */
export function strikePlan(evRng, n, kick = [1.5, 2.5]) {
  const r = evRng.fork(`strike${n}`);
  return { dirIfNone: r.chance(0.5) ? -1 : 1, kick: r.float(kick[0], kick[1]), spin: r.chance(0.5) ? -1 : 1 };
}

/**
 * The whole hail shower: when each stone falls (ms after the event starts), where
 * (near the top block or anywhere), how big and how fast. Sorted latest first (pop() = next).
 */
export function hailPlan(evRng, ev, { count = 10, from = 500, to = 5000, width = 720, radius = [8, 10] } = {}) {
  const n = Math.max(1, Math.round(count * ev.strength));
  const r = evRng.fork('hail');
  const plan = [];
  for (let k = 0; k < n; k++) {
    const u = (k + r.float(0, 0.8)) / n;
    plan.push({
      at: from + u * (to - from),
      near: r.chance(0.55),
      dx: r.float(-170, 170),
      x: r.float(30, width - 30),
      dy: r.float(30, 90),
      r: r.float(radius[0], radius[1]),
      vx: r.float(-0.6, 0.6),
      vy: r.float(5, 7),
      av: r.float(-0.2, 0.2),
    });
  }
  plan.sort((a, b) => b.at - a.at);
  return plan;
}
