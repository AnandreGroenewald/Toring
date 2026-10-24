// (1.20) Die Rivier: the courses (the owner, 24 Oct 2026: "it needs to a river with the blocks and you need to slide left
// and right to dodge them (For the daily slide not the weekly) the weekly is also on a river but then you damage the
// openents towers while you go down with bombs", "The river can be part of a rescue mission for the men you lost on the
// towers"). A course is seeded: everyone gets the same river on the same day. Pure rules (the 3D river is js/rivier/).
//
// Three lanes. Things come in rows: blocks floating down (the day's own blocks), rocks, and people on rubber rings to
// scoop up. The first stretch teaches by doing (people only), then the blocks come, then pairs, drifting blocks and
// narrows. Every row leaves a lane free, and rows are far enough apart that two lane changes always fit between them.
import { createRng } from './rng.js';
import { createSequence } from './sequence.js';

export const RIVER = Object.freeze({
  lanes: 3,
  laneW: 3.4,          // m
  speed0: 13,          // m/s at the start...
  speed1: 21,          // ...and at the end of a course
  rescueLen: 640,      // m (about 38 s)
  raidLen: 1000,       // m: Saturday's course past the four islands
  introLen: 80,        // m of people only at the start
  gapMin: 17,          // m between rows (two lane changes and a moment to see it)
  gapMax: 27,
  finishRun: 60,       // m of calm water before the finish
  hitSlowS: 0.6,       // a knock slows you this long...
  hitSlowK: 0.55,      // ...to this share of the speed
  graceS: 1.2,         // ...and you can't be knocked again for this long
  laneS: 0.16,         // a lane change takes this long
  islandEvery: 220,    // m between Saturday's islands
});

/** The speed (m/s) `z` metres into a course `len` long. */
export const speedAt = (z, len) => RIVER.speed0 + (RIVER.speed1 - RIVER.speed0) * Math.min(1, Math.max(0, z / Math.max(1, len - RIVER.finishRun)));
/** A lane's middle across the river (m; lane 1 is the middle). */
export const laneX = (lane) => (lane - (RIVER.lanes - 1) / 2) * RIVER.laneW;

const ALL = [0, 1, 2];

/**
 * The course for a rescue ride: { len, rows: [{ z, items: [{ lane, kind: 'block'|'rock'|'person', ... }] }], people }.
 * `who`: the people to rescue, in order (yours first, then strays), at most RIVER-length allows. `seed`: the day's.
 */
export function rescueCourse(seed, who = []) {
  return buildCourse(`rivier/${seed}`, RIVER.rescueLen, who, null);
}

/**
 * Saturday's course past the islands: the rescue course's rows, and `islands` [{ z, side (-1 left, 1 right), crew }] for
 * the four crews' towers (the ones you can bomb are marked by the game, which knows the standings).
 */
export function raidCourse(seed, crews = [], who = []) {
  return buildCourse(`aanval/${seed}`, RIVER.raidLen, who, crews);
}

function buildCourse(key, len, who, crews) {
  const rng = createRng(key);
  const seq = createSequence(`${key}/blokke`);
  let bi = 0;
  const block = () => {
    const b = seq.block(bi++);
    return { kind: 'block', shape: b.shape, scale: Math.min(1.15, Math.max(0.8, b.scale)), color: b.color, spin: rng.float(-0.6, 0.6) };
  };
  const people = who.slice(0, 24);
  let pi = 0;
  const person = (lane) => (pi < people.length ? { lane, kind: 'person', who: people[pi++] } : null);
  const rows = [];
  const islands = [];
  // the islands first: their stretch of river is kept calmer (you look at the tower, not at your feet)
  if (crews) {
    crews.slice(0, 4).forEach((crew, k) => {
      islands.push({ z: 160 + k * RIVER.islandEvery, side: k % 2 ? 1 : -1, crew });
    });
  }
  const nearIsland = (z) => islands.some((i) => Math.abs(i.z - z) < 40);
  let z = 30;
  let free = 1;   // the lane the row before left open
  // the intro: people only, from the middle out (swipe to scoop them up)
  for (const lane of [1, 0, 2, 1]) {
    z += 18;
    const p = person(lane);
    rows.push({ z, items: p ? [p] : [], intro: true });
  }
  z = Math.max(z, RIVER.introLen);
  let n = 0;
  while (z < len - RIVER.finishRun) {
    z += rng.int(RIVER.gapMin, RIVER.gapMax);
    if (z >= len - RIVER.finishRun) break;
    n++;
    const t = z / len;   // how far along: harder further on
    const calm = nearIsland(z);
    const items = [];
    // the lane left open this row: next to the last open one at most... (two lane changes always fit: gapMin)
    const open = rng.pick(ALL);
    if (calm) {
      // by an island: one block at most, and often a person
      if (rng.chance(0.5)) items.push({ lane: (open + 1) % 3, ...block() });
      const p = rng.chance(0.6) ? person(open) : null;
      if (p) items.push(p);
    } else if (t < 0.3) {
      // single blocks; a person in another lane now and then
      const bl = ALL.filter((l) => l !== open);
      items.push({ lane: rng.pick(bl), ...block() });
      if (rng.chance(0.45)) {
        const p = person(open);
        if (p) items.push(p);
      }
    } else {
      const roll = rng.next();
      const shut = ALL.filter((l) => l !== open);
      if (roll < 0.34) {
        // two blocks: one lane free (a person waits in it, half the time)
        for (const l of shut) items.push({ lane: l, ...block() });
        if (rng.chance(0.5)) {
          const p = person(open);
          if (p) items.push(p);
        }
      } else if (roll < 0.52) {
        // a narrow: rocks on both sides, the middle open
        items.push({ lane: 0, kind: 'rock' }, { lane: 2, kind: 'rock' });
        const p = rng.chance(0.55) ? person(1) : null;
        if (p) items.push(p);
        rows.push({ z, items, narrow: true });
        free = 1;
        continue;
      } else if (roll < 0.72 && t > 0.45) {
        // a drifting block: it floats across into the open lane's neighbour as you come (watch which way)
        const from = shut[0];
        const to = shut[1];
        items.push({ lane: to, ...block(), drift: from - to });
        const p = person(open);
        if (p) items.push(p);
      } else {
        // a block in the lane you're likely in, a person behind it in the next row (a choice: safe or brave)
        items.push({ lane: shut[0], ...block() });
        const p = rng.chance(0.6) ? person(shut[0]) : null;
        if (p) {
          rows.push({ z, items });
          z += RIVER.gapMin;
          rows.push({ z, items: [p] });
          free = open;
          continue;
        }
      }
    }
    rows.push({ z, items });
    free = open;
  }
  // people left over (a long list): along the calm finish stretch, lane by lane
  let fz = len - RIVER.finishRun + 8;
  while (pi < people.length && fz < len - 8) {
    const p = person([1, 0, 2][pi % 3]);
    rows.push({ z: fz, items: [p], finish: true });
    fz += 9;
  }
  void free;
  void n;
  return { len, rows, islands, people: people.slice(0, pi) };
}

/**
 * Is the course always passable? Every row leaves a lane with nothing hard in it, and from the lane open in the row before,
 * that lane can be reached in time (the gap at full speed holds two lane changes and a moment to react).
 */
export function passable(course) {
  const hard = (it) => it.kind === 'block' || it.kind === 'rock';
  let prevZ = -Infinity;
  for (const row of course.rows) {
    const shut = new Set();
    for (const it of row.items) {
      if (!hard(it)) continue;
      shut.add(it.lane);
      if (it.drift) shut.add(it.lane + it.drift);
    }
    if (shut.size >= RIVER.lanes) return false;
    const dz = row.z - prevZ;
    if (shut.size && dz < RIVER.gapMin - 0.01) return false;
    if (shut.size) prevZ = row.z;
  }
  return true;
}
