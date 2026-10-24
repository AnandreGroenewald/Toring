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
  // the endless ride (the owner, 24 Oct 2026: "it was too short, it was quite fun. Please make it that it doesnt end,
  // the more meters you get the better for the week"): it runs until your third knock
  hearts: 3,
  speedMax: 27,        // m/s, reached at...
  rampLen: 2400,       // ...this far down the river
  lakeFrom: 600,       // m: the river opens into a lake, your crew's island beside it...
  lakeTo: 880,         // ...and narrows into the canyon again
  islandAt: 740,
  rapidsEvery: 520,    // m between the stretches of white water
  reactS: 0.85,        // s between rows at the speed you're going, at least (two lane changes and a look)
});

/** The speed (m/s) `z` metres into a course `len` long (an endless course: `len` Infinity, faster and faster). */
export function speedAt(z, len) {
  if (len === Infinity) {
    const a = Math.min(1, Math.max(0, z / RIVER.rescueLen));
    const b = Math.min(1, Math.max(0, (z - RIVER.rescueLen) / (RIVER.rampLen - RIVER.rescueLen)));
    return RIVER.speed0 + (RIVER.speed1 - RIVER.speed0) * a + (RIVER.speedMax - RIVER.speed1) * b;
  }
  return RIVER.speed0 + (RIVER.speed1 - RIVER.speed0) * Math.min(1, Math.max(0, z / Math.max(1, len - RIVER.finishRun)));
}
/** A lane's middle across the river (m; lane 1 is the middle). */
export const laneX = (lane) => (lane - (RIVER.lanes - 1) / 2) * RIVER.laneW;

const ALL = [0, 1, 2];

/**
 * The course for a rescue ride: { len, rows: [{ z, items: [{ lane, kind: 'block'|'rock'|'person', ... }] }], people }.
 * `who`: the people to rescue, in order (yours first, then strays), at most RIVER-length allows. `seed`: the day's.
 * `endless`: the river never ends (len Infinity): your people come before the lake where your crew's island stands
 * (`island`), then the canyon again, faster and busier; `extend(z)` makes rows up to z (the ride asks as it goes).
 * `rapidsAt(z)`: in white water there?
 */
export function rescueCourse(seed, who = [], { endless = false } = {}) {
  return buildCourse(`rivier/${seed}`, endless ? Infinity : RIVER.rescueLen, who, null);
}

/**
 * Saturday's course past the islands: the rescue course's rows, and `islands` [{ z, side (-1 left, 1 right), crew }] for
 * the four crews' towers (the ones you can bomb are marked by the game, which knows the standings).
 */
export function raidCourse(seed, crews = [], who = []) {
  return buildCourse(`aanval/${seed}`, RIVER.raidLen, who, crews);
}

function buildCourse(key, len, who, crews) {
  const endless = len === Infinity;
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
  const addPerson = (items, lane, p = 1) => {
    if (!rng.chance(p)) return;
    const it = person(lane);
    if (it) items.push(it);
  };
  const rows = [];
  const islands = [];
  // the islands first: their stretch of river is kept calmer (you look at the tower, not at your feet)
  if (crews) {
    crews.slice(0, 4).forEach((crew, k) => {
      islands.push({ z: 160 + k * RIVER.islandEvery, side: k % 2 ? 1 : -1, crew });
    });
  }
  // (the endless ride: the lake with your crew's island; calm water there too)
  const lake = endless ? { from: RIVER.lakeFrom, to: RIVER.lakeTo } : null;
  const island = endless ? { z: RIVER.islandAt, side: -1 } : null;
  const nearIsland = (z) => islands.some((i) => Math.abs(i.z - z) < 40) || (lake && z > lake.from - 20 && z < lake.to);
  // the rapids: white water a little past halfway, faster (only single obstacles in it); on the endless river, again and
  // again
  const rapids = endless ? { from: 370, to: 460 } : { from: Math.round(len * 0.58), to: Math.round(len * 0.58) + 90 };
  const rapidsAt = (z) => inRapids({ rapids, endless, lake }, z);
  // each new kind is met alone first (introduce, then develop, then mix): where each first comes (m)
  const FIRST = { croc: 0.27 * RIVER.rescueLen, monkey: 0.44 * RIVER.rescueLen, hippo: 0.7 * RIVER.rescueLen };
  const met = { croc: false, monkey: false, hippo: false };
  let z = 30;
  // the intro: people only, from the middle out (swipe to scoop them up)
  for (const lane of [1, 0, 2, 1]) {
    z += 18;
    const p = person(lane);
    rows.push({ z, items: p ? [p] : [], intro: true });
  }
  z = Math.max(z, RIVER.introLen);
  // (the fixed course stops for the calm finish stretch; the endless one makes rows as far as it's asked)
  const stopAt = endless ? Infinity : len - RIVER.finishRun;
  // your people (the endless ride): all of them before the lake; the leftovers in the last calm stretch before it
  const peopleBy = endless ? RIVER.lakeFrom - 70 : Infinity;
  function fill(untilZ) {
    while (z < Math.min(untilZ, stopAt)) {
      // (further down the endless river: a little closer together, but never closer than you can react at your speed)
      const deep = endless ? Math.min(1, Math.max(0, (z - RIVER.lakeTo) / 1800)) : 0;
      const minGap = Math.max(RIVER.gapMin, endless ? speedAt(z, len) * RIVER.reactS : 0);
      z += Math.max(minGap, rng.int(RIVER.gapMin, RIVER.gapMax) - Math.round(deep * 5));
      if (z >= stopAt) break;
      if (endless && pi < people.length && z >= peopleBy) {
        // the people still waiting, one row each, lane by lane, before the lake
        while (pi < people.length && z < RIVER.lakeFrom - 20) {
          rows.push({ z, items: [person([1, 0, 2][pi % 3])], finish: true });
          z += 11;
        }
        continue;
      }
      const t = Math.min(1, z / RIVER.rescueLen);   // how far along: harder further on
      const items = [];
      const open = rng.pick(ALL);
      const shut = ALL.filter((l) => l !== open);
      // a new kind, alone, the first time (a person in another lane: the way past it is plain)
      const fresh = Object.keys(FIRST).find((k) => !met[k] && z >= FIRST[k]);
      if (fresh && !nearIsland(z) && !rapidsAt(z)) {
        met[fresh] = true;
        const lane = 1;
        if (fresh === 'monkey') items.push({ lane, ...block(), kind: 'monkey', drift: rng.chance(0.5) ? 1 : -1 });
        else items.push({ lane, kind: fresh });
        addPerson(items, rng.pick([0, 2]), 0.9);
        rows.push({ z, items, teach: fresh });
        continue;
      }
      if (nearIsland(z) || rapidsAt(z)) {
        // by an island or in the rapids: one obstacle at most, often a person
        if (rng.chance(rapidsAt(z) ? 0.8 : 0.5)) items.push({ lane: shut[0], ...(rng.chance(0.75) ? block() : { kind: 'rock' }) });
        addPerson(items, open, 0.6);
        rows.push({ z, items, rapids: rapidsAt(z) });
        continue;
      }
      const roll = rng.next() * (1 - deep * 0.25);   // (further down: more of the harder rows)
      if (t < 0.27) {
        // single blocks; a person in another lane now and then
        items.push({ lane: rng.pick(shut), ...block() });
        addPerson(items, open, 0.45);
      } else if (met.hippo && roll < 0.14) {
        // a hippo in one lane, something in another
        items.push({ lane: shut[0], kind: 'hippo' }, { lane: shut[1], ...(rng.chance(0.5) ? block() : { kind: 'croc' }) });
        addPerson(items, open, 0.5);
      } else if (met.monkey && roll < 0.3) {
        // Blouaap paddles a block across, from a shut lane into the other one (the open lane stays open)
        items.push({ lane: shut[1], ...block(), kind: 'monkey', drift: shut[0] - shut[1] });
        addPerson(items, open, 0.6);
      } else if (met.croc && roll < 0.5) {
        // crocodiles: one, or one swimming across when you're further along
        const swim = t > 0.5 && rng.chance(0.4);
        items.push(swim ? { lane: shut[1], kind: 'croc', drift: shut[0] - shut[1] } : { lane: rng.pick(shut), kind: 'croc' });
        if (!swim && rng.chance(0.4)) items.push({ lane: shut.find((l) => !items.some((it) => it.lane === l)), ...block() });
        addPerson(items, open, 0.5);
      } else if (roll < 0.66) {
        // two blocks: one lane free (a person waits in it, half the time)
        for (const l of shut) items.push({ lane: l, ...block() });
        addPerson(items, open, 0.5);
      } else if (roll < 0.8) {
        // a narrow: rocks on both sides, the middle open
        items.push({ lane: 0, kind: 'rock' }, { lane: 2, kind: 'rock' });
        addPerson(items, 1, 0.55);
      } else if (roll < 0.9 && t > 0.45) {
        // a drifting block: it floats across into the open lane's neighbour as you come (watch which way)
        items.push({ lane: shut[1], ...block(), drift: shut[0] - shut[1] });
        addPerson(items, open, 0.7);
      } else {
        // a block in your way, a person behind it in the next row (a choice: safe or brave)
        items.push({ lane: shut[0], ...block() });
        const p = rng.chance(0.6) ? person(shut[0]) : null;
        if (p) {
          rows.push({ z, items });
          z += minGap;
          rows.push({ z, items: [p] });
          continue;
        }
      }
      rows.push({ z, items });
    }
  }
  if (endless) {
    fill(1600);
    return { len, endless: true, rows, islands, rapids, lake, island, people: people.slice(0, pi), extend: fill };
  }
  fill(stopAt);
  // people left over (a long list): along the calm finish stretch, lane by lane
  let fz = len - RIVER.finishRun + 8;
  while (pi < people.length && fz < len - 8) {
    const p = person([1, 0, 2][pi % 3]);
    rows.push({ z: fz, items: [p], finish: true });
    fz += 9;
  }
  return { len, rows, islands, rapids, people: people.slice(0, pi) };
}

/** Is course z in white water? (the endless river has a stretch every RIVER.rapidsEvery, none by the lake) */
export function inRapids(course, z) {
  const r = course.rapids;
  if (!r) return false;
  if (!course.endless) return z >= r.from && z <= r.to;
  const w = rapidsWindow(course, z);
  return !!w && z >= w.from && z <= w.to;
}
/** The endless river's stretch of white water at or after course z: { from, to } (none in or by the lake). */
export function rapidsWindow(course, z) {
  const r = course.rapids;
  if (!r) return null;
  if (!course.endless) return z <= r.to ? r : null;
  const len = r.to - r.from;
  for (let k = Math.max(0, Math.floor((z - r.from - len) / RIVER.rapidsEvery) + 1); k < 1e4; k++) {
    const from = r.from + k * RIVER.rapidsEvery;
    const to = from + len;
    if (to < z) continue;
    if (course.lake && to > course.lake.from - 40 && from < course.lake.to + 40) continue;
    return { from, to };
  }
  return null;
}

/**
 * Is the course always passable? Every row leaves a lane with nothing hard in it, and from the lane open in the row before,
 * that lane can be reached in time (the gap at full speed holds two lane changes and a moment to react).
 */
export function passable(course) {
  const hard = (it) => it.kind !== 'person';
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
    // (the endless river at speed: the gap still holds the time to react)
    if (shut.size && course.endless && dz < speedAt(row.z, Infinity) * RIVER.reactS - 0.51) return false;
    if (shut.size) prevZ = row.z;
  }
  return true;
}
