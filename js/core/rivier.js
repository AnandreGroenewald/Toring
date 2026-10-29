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
import { paceAt, reactAt, PACE } from './riverpace.js';

export { PACE, paceAt, reactAt };

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
  hitSlowS: 0.9,       // a knock slows you this long (29 Oct 2026: 0.6 at once; now a quick dip that eases back over it)...
  hitSlowK: 0.55,      // ...to this share of the speed
  graceS: 1.2,         // ...and you can't be knocked again for this long
  laneS: 0.16,         // a lane change takes this long
  islandEvery: 220,    // m between Saturday's islands
  // the endless ride (the owner, 24 Oct 2026: "it was too short, it was quite fun. Please make it that it doesnt end,
  // the more meters you get the better for the week"): it runs until your third knock
  hearts: 3,            // (the pace: js/core/riverpace.js)
  // (the owner, 25 Oct 2026: "keep it as is for the first 1000 meters, then after that it adds a clown that tries to
  // distract you, after 2000 meters there is a small object that you need to jump over, the first one shows you to
  // jump etc"): what the endless river adds as you get further
  // (the owner, 25 Oct 2026: "And then please add objects at 5000 and 10000 meters"): a whirlpool (it pulls you in) and
  // an elephant cow with her calf wading across
  unlock: Object.freeze({ clown: 1000, log: 2000, branch: 3000, whirl: 5000, ele: 10000 }),
  clownEvery: [1600, 2400],
  whirlEvery: [450, 750],     // m between whirlpools (an event each, not a slalom: 25 Oct 2026)
  eleEvery: [650, 1000],      // m between the elephants' crossings   // m between Hanswors's visits, once he's come (an event, about once a minute: the owner, 25 Oct 2026, "it appears way too many times")
  lakeFrom: 600,       // m: the river opens into a lake, your crew's island beside it...
  lakeTo: 880,         // ...and narrows into the canyon again
  islandAt: 740,
  rapidsEvery: 520,    // m between the stretches of white water
});

/** The speed (m/s) `z` metres into a course `len` long (an endless course: `len` Infinity, faster and faster). */
export function speedAt(z, len) {
  if (len === Infinity) return paceAt(z);
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
  // (the endless river's later things: Hanswors's visits, logs to jump, fallen trees to duck under)
  const later = { clownNext: RIVER.unlock.clown, whirlNext: RIVER.unlock.whirl, eleNext: RIVER.unlock.ele, taught: { clown: false, log: false, branch: false, whirl: false, ele: false } };
  /** A row of the later things at z, if one is due (pushed; z moved on as it needs); true when it made one. */
  function laterRow(zz, minGap, deep) {
    // Hanswors: he comes (alone the first time), rides alongside a while lobbing pies, and goes; then again later
    if (zz >= later.clownNext) {
      const first = !later.taught.clown;
      later.taught.clown = true;
      const k = Math.min(1, (zz - RIVER.unlock.clown) / 4000);
      later.clownNext = zz + rng.int(RIVER.clownEvery[0], RIVER.clownEvery[1]);
      rows.push({ z: zz, items: [{ lane: 1, kind: 'clown', side: rng.chance(0.5) ? -1 : 1, pies: first ? 3 : 3 + Math.round(k * 3) }], teach: first ? 'clown' : undefined });
      z = zz + minGap * (first ? 2.2 : 1);
      return true;
    }
    // a log to jump: the first one alone, across the whole river (it shows you how); then sometimes across all of it,
    // sometimes in one lane with blocks beside it (jump it, or go round)
    if (zz >= RIVER.unlock.log && (!later.taught.log || rng.chance(0.13 + deep * 0.08))) {
      const first = !later.taught.log;
      later.taught.log = true;
      if (first || rng.chance(0.5)) rows.push({ z: zz, items: [{ lane: 1, kind: 'log', span: 3 }], teach: first ? 'log' : undefined });
      else {
        const lane = rng.pick(ALL);
        rows.push({ z: zz, items: [{ lane, kind: 'log', span: 1 }, ...ALL.filter((l) => l !== lane).map((l) => ({ lane: l, ...block() }))] });
      }
      z = zz + minGap * (first ? 2.4 : 1.15);
      return true;
    }
    // (5 km) a whirlpool in a side lane: it pulls you in from the middle lane too, so the far lane is the way past, and
    // across the pull you move slowly (go early); alone each time
    if (zz >= later.whirlNext) {
      const first = !later.taught.whirl;
      later.taught.whirl = true;
      later.whirlNext = zz + rng.int(RIVER.whirlEvery[0], RIVER.whirlEvery[1]);
      rows.push({ z: zz, items: [{ lane: rng.pick([0, 2]), kind: 'whirl' }], teach: first ? 'whirl' : undefined });
      z = zz + minGap * (first ? 2.4 : 1.3);
      return true;
    }
    // (10 km) an elephant cow and her calf wading across from one side: as you come they walk over; where you meet them
    // they stand in two lanes and the side they came from is open again (read where they're going)
    if (zz >= later.eleNext) {
      const first = !later.taught.ele;
      later.taught.ele = true;
      later.eleNext = zz + rng.int(RIVER.eleEvery[0], RIVER.eleEvery[1]);
      const from = rng.chance(0.5) ? 1 : -1;
      // (the cow leads: she ends furthest across; the calf one lane behind her)
      const cow = from > 0 ? 0 : 2;
      rows.push({ z: zz, items: [{ lane: cow, kind: 'ele', from }, { lane: 1, kind: 'ele', from, calf: true }], teach: first ? 'ele' : undefined });
      z = zz + minGap * (first ? 2.6 : 1.4);
      return true;
    }
    // a fallen tree across the river at head height: duck under it (the first one shows you how)
    if (zz >= RIVER.unlock.branch && (!later.taught.branch || rng.chance(0.1 + deep * 0.07))) {
      const first = !later.taught.branch;
      later.taught.branch = true;
      rows.push({ z: zz, items: [{ lane: 1, kind: 'branch', span: 3, flip: rng.chance(0.5) }], teach: first ? 'branch' : undefined });
      z = zz + minGap * (first ? 2.4 : 1.15);
      return true;
    }
    return false;
  }
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
      const minGap = Math.max(RIVER.gapMin, endless ? speedAt(z, len) * reactAt(z) : 0);
      // the people still waiting, one row each, lane by lane, before the lake: started early enough that all of them
      // fit (11 m apart, closer if they must) before it, however many there are
      const due = endless && pi < people.length && z + RIVER.gapMax >= Math.min(peopleBy, RIVER.lakeFrom - 20 - 11 * (people.length - pi));
      if (due) {
        z += minGap;
        while (pi < people.length) {
          rows.push({ z, items: [person([1, 0, 2][pi % 3])], finish: true });
          z += Math.max(6, Math.min(11, (RIVER.lakeFrom - 12 - z) / Math.max(1, people.length - pi)));
        }
        continue;
      }
      z += Math.max(minGap, rng.int(RIVER.gapMin, RIVER.gapMax) - Math.round(deep * 5));
      if (z >= stopAt) break;
      const t = Math.min(1, z / RIVER.rescueLen);   // how far along: harder further on
      // (the endless river, further down: the new things, each met alone the first time (it shows you what to do), then
      // in the mix; the first kilometre stays exactly as it was)
      if (endless && z >= RIVER.unlock.clown && !nearIsland(z) && !rapidsAt(z)) {
        const extra = laterRow(z, minGap, deep);
        if (extra) continue;
      }
      const items = [];
      const open = rng.pick(ALL);
      const shut = ALL.filter((l) => l !== open);
      // (which way something crosses between the two shut lanes: either way, a coin toss; [from, to])
      const across = () => (rng.chance(0.5) ? [shut[0], shut[1]] : [shut[1], shut[0]]);
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
        const [from, to] = across();
        items.push({ lane: to, ...block(), kind: 'monkey', drift: from - to });
        addPerson(items, open, 0.6);
      } else if (met.croc && roll < 0.5) {
        // crocodiles: one, or one swimming across when you're further along
        const swim = t > 0.5 && rng.chance(0.4);
        const [from, to] = swim ? across() : [];
        items.push(swim ? { lane: to, kind: 'croc', drift: from - to } : { lane: rng.pick(shut), kind: 'croc' });
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
        const [from, to] = across();
        items.push({ lane: to, ...block(), drift: from - to });
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
    // (1.21.3) the river's coins: laid on the rows as they're made, from their own seed (the river itself is the same
    // with or without them)
    const coinsOn = addCoins(key, rows, { nearIsland, rapidsAt });
    const fallsOn = addFalls(rows, { nearIsland, rapidsAt });
    const grow = (untilZ) => { fill(untilZ); coinsOn(); fallsOn(untilZ); };
    grow(1600);
    return { len, endless: true, rows, islands, rapids, lake, island, falls: fallsOn.falls, people: people.slice(0, pi), extend: grow };
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

/**
 * (28 Oct 2026, the owner: "maybe even a waterfall or two"; his pick: ride through one) The endless river's waterfalls:
 * water pours across the river from the cliff tops and you ride through it. At FALLS.first, then every FALLS.every
 * metres, moved on (40 m at a time) out of white water and away from the lake; the stretch round each keeps only its
 * people (no blocks, beasts or logs: the moment is the fall), with a line of coins through the spray and a row of its own
 * (`fall: true`) for the ride to draw it. Laid on the rows after they and their coins are made, from fixed metres, so
 * the river itself is the same (the same course on both phones in Saam gly). Rows a lesson needs (`teach`) are left be.
 */
export const FALLS = Object.freeze({ first: 760, every: 1400, before: 30, after: 24, coins: 4, coinSp: 3 });
function addFalls(rows, { nearIsland, rapidsAt }) {
  const falls = [];
  let k = 0;
  // (29 Oct 2026: nor where a lesson or the ride's diamond lies in its stretch: kept there, they put a log under its line)
  const clear = (z) => ![z - FALLS.before, z, z + FALLS.after].some((q) => nearIsland(q) || rapidsAt(q))
    && !rows.some((r) => r.z >= z - FALLS.before && r.z <= z + FALLS.after && (r.teach || r.items.some((it) => it.gem)));
  const at = (z) => {
    const i = rows.findIndex((r) => r.z > z);
    return i < 0 ? rows.length : i;
  };
  const on = (untilZ) => {
    // (only where the rows after it are made already: else next time)
    const upTo = Math.min(untilZ, (rows.length ? rows[rows.length - 1].z : 0) - FALLS.after - 5);
    for (;;) {
      let f = FALLS.first + k * FALLS.every;
      for (let i = 0; i < 12 && !clear(f); i++) f += 40;
      if (f > upTo) return;
      k++;
      if (!clear(f)) continue;
      for (const r of rows) {
        // (a lesson's row, and the ride's one diamond over its log, stay as they are)
        if (!r.teach && !r.items.some((it) => it.gem) && r.z >= f - FALLS.before && r.z <= f + FALLS.after) r.items = r.items.filter((it) => it.kind === 'person');
      }
      // (the line, 9 m: through the fall, in a lane none of its people are in, done before the next row)
      const c0 = f - Math.round(((FALLS.coins - 1) * FALLS.coinSp) / 2);
      const busy = new Set(rows.filter((r) => r.z >= c0 - 3 && r.z <= c0 + FALLS.coins * FALLS.coinSp + 3).flatMap((r) => r.items.map((it) => it.lane)));
      const lane = [1, 0, 2].find((l) => !busy.has(l)) ?? 1;
      rows.splice(at(c0), 0, { z: c0, items: [{ kind: 'coins', lane, n: FALLS.coins, dz: 0, sp: FALLS.coinSp, y: 0, val: 1 }], spray: true });
      rows.splice(at(f), 0, { z: f, items: [], fall: true });
      falls.push(f);
    }
  };
  on.falls = falls;
  return on;
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
 * (1.21.3) Coins on the endless river (the owner, 25 Oct 2026: "the objective of the game mode, should we add tokens,
 * starts or coins, just to make it more intreguing, but afcourse not easy"): only where taking them costs something —
 * up to five in the lane behind a block (back in once past it, out again before what's next: COINS.windowS), three over a log (jump in
 * that lane), three under a fallen tree (duck in that lane); a stack of ten behind a block every 700–900 m; once a ride,
 * a diamond worth fifty over the first long log after 2 km. Each row decides from its own seed (key + its metres), so
 * the river's things are the same as without coins. Items: { kind 'coins', lane, n, dz (m after the row), sp (m apart),
 * y (0 on the water, 1 in the air: a jump, 2 low: under a tree), val (each), stack?, gem? }.
 */
export const COINS = Object.freeze({
  from: 120, behindP: 0.3, logP: 0.45, treeP: 0.4, stackEvery: [700, 900], gemFrom: 2000, stackVal: 10, gemVal: 50,
  // (29 Oct 2026, the owner: "Sometimes the coins are impossible to get which feels like a trap, the coins should be hard
  // to get sometimes not impossible") every coin leaves at least windowS for the move it asks: into its lane once past what
  // knocks you there (one lane change, or two with the lanes beside it shut as well) and out again before the next such
  // thing. The ride's own measures (js/rivier/view.js): a knock reaches `zone` m along the river from a thing's middle (the
  // longest block, 3.6 m, + 0.5), a coin is taken within `take` m of it; a lane change (RIVER.laneS) is clear of a block's
  // side after `clearS` and at a coin after `takeS`; on the way out a coin is still taken until `leaveS` before it's clear
  windowS: 0.25, zone: 2.3, take: 0.95, clearS: 0.07, takeS: 0.1, leaveS: 0.025,
});
/** What knocks you in a row's lanes: each one's lane, a crossing one's both, a whirlpool's pull the middle too (a log is
 * jumped, a fallen tree ducked under, Hanswors's pies dodged, people taken: none of them shuts a lane). */
function shutLanes(row) {
  const shut = new Set();
  for (const it of row.items) {
    if (['person', 'clown', 'log', 'branch', 'coins'].includes(it.kind)) continue;
    shut.add(it.lane);
    if (it.drift) shut.add(it.lane + it.drift);
    if (it.kind === 'whirl') shut.add(1);   // (its pull reaches the middle lane)
  }
  return shut;
}
/** Lane changes between `lane` and the nearest lane `shut` leaves open: 1, or 2 when the lanes beside it are shut too. */
const laneMoves = (lane, shut) => ([lane - 1, lane + 1].some((l) => l >= 0 && l < RIVER.lanes && !shut.has(l)) ? 1 : 2);
/** The least metres from a thing that knocks you to the first coin behind it in its lane, at `v` m/s, `n` lane changes in. */
const coinIn = (v, n) => COINS.zone - COINS.take + v * ((n - 1) * RIVER.laneS + COINS.takeS - COINS.clearS + COINS.windowS);
/** The least metres from the last coin to the next thing that knocks you in its lane, at `v` m/s, `n` lane changes out. */
const coinOut = (v, n) => COINS.zone - COINS.take + v * ((n - 1) * RIVER.laneS + COINS.leaveS + COINS.windowS);
function addCoins(key, rows, { nearIsland, rapidsAt }) {
  let stackNext = COINS.from + COINS.stackEvery[0];
  let gem = false;
  const laid = new WeakSet();
  return function coinsOn() {
    // (each row once the row after it is made too: a line has to end in time for what comes next. Kept by row, not
    // counted: the waterfalls splice rows of their own in afterwards, and a count went over the last two again, 29 Oct)
    for (let i = 0; i < rows.length - 1; i++) {
      const row = rows[i];
      if (laid.has(row)) continue;
      laid.add(row);
      if (row.z < COINS.from || row.teach || row.finish || row.spray || row.fall || nearIsland(row.z) || rapidsAt(row.z)) continue;
      const items = row.items;
      if (items.some((it) => it.kind === 'clown' || it.kind === 'whirl' || it.kind === 'ele' || it.kind === 'person')) continue;
      const r = createRng(`${key}/coins/${Math.round(row.z * 10)}`);
      const log = items.find((it) => it.kind === 'log');
      const tree = items.find((it) => it.kind === 'branch');
      const blocks = items.filter((it) => it.kind === 'block' && !it.drift);
      const shut = shutLanes(row);
      const open = [0, 1, 2].filter((l) => !shut.has(l));   // (a log's or a tree's coins: only in a lane nothing shuts)
      // (the diamond: once, over the first long log after 2 km, in the air: a jump at the right moment in its lane)
      if (!gem && log && log.span === 3 && row.z >= COINS.gemFrom && open.length) {
        gem = true;
        items.push({ kind: 'coins', lane: r.pick(open), n: 1, dz: 0, sp: 0, y: 1, val: COINS.gemVal, gem: true });
        continue;
      }
      if (log && r.chance(COINS.logP)) {
        const lane = log.span === 3 ? r.pick(open) : log.lane;
        if (open.includes(lane)) items.push({ kind: 'coins', lane, n: 3, dz: -2.2, sp: 2.2, y: 1, val: 1 });
        continue;
      }
      if (tree && r.chance(COINS.treeP)) {
        if (open.length) items.push({ kind: 'coins', lane: r.pick(open), n: 3, dz: -2.2, sp: 2.2, y: 2, val: 1 });
        continue;
      }
      if (!blocks.length || log || tree) continue;
      const b = r.pick(blocks);
      // (29 Oct 2026) far enough behind the block for the move into its lane at this speed, and done in time to get out
      // again before what comes next in it (or, with nothing there, before the next row)
      const next = rows[i + 1];
      const shutN = shutLanes(next);
      const from = Math.max(4, Math.ceil(coinIn(paceAt(row.z), laneMoves(b.lane, shut)) * 10) / 10);
      const vn = paceAt(next.z) * (rapidsAt(next.z) ? PACE.rapidsK : 1);
      const until = next.z - row.z - (shutN.has(b.lane) ? coinOut(vn, laneMoves(b.lane, shutN)) : COINS.zone + COINS.take);
      if (row.z >= stackNext) {
        const dz = Math.max(6, from);
        if (dz <= until) {
          stackNext = row.z + r.int(COINS.stackEvery[0], COINS.stackEvery[1]);
          items.push({ kind: 'coins', lane: b.lane, n: 1, dz, sp: 0, y: 0, val: COINS.stackVal, stack: true });
        }
      } else if (r.chance(COINS.behindP)) {
        const n = Math.min(5, Math.floor((until - from) / 2.1) + 1);
        if (n >= 2) items.push({ kind: 'coins', lane: b.lane, n, dz: from, sp: 2.1, y: 0, val: 1 });
      }
    }
  };
}

/**
 * (29 Oct 2026, the owner: "the coins should be hard to get sometimes not impossible") The coins that can't be taken
 * without a knock: [] when every one can. A coin needs, at the river's speed there, COINS.windowS at least to move into
 * its lane after the last thing that knocks you in it and to get out again before the next (one or two lane changes, as
 * the lanes beside it allow). Each: { z, lane, why }.
 */
export function unreachableCoins(course) {
  const speed = (z) => (course.endless ? paceAt(z) : speedAt(z, course.len)) * (inRapids(course, z) ? PACE.rapidsK : 1);
  const byLane = Array.from({ length: RIVER.lanes }, () => []);
  for (const row of course.rows) for (const l of shutLanes(row)) byLane[l]?.push(row);
  const bad = [];
  for (const row of course.rows) {
    for (const it of row.items) {
      if (it.kind !== 'coins') continue;
      for (let k = 0; k < (it.n || 1); k++) {
        const z = row.z + (it.dz || 0) + k * (it.sp || 0);
        let before = null;
        let after = null;
        for (const h of byLane[it.lane]) {
          if (h.z <= z) before = h;
          else {
            after = h;
            break;
          }
        }
        let why = null;
        if ((before && z - before.z < COINS.zone) || (after && after.z - z < COINS.zone)) why = 'inside what knocks you';
        else if (before && z - before.z < coinIn(speed(before.z), laneMoves(it.lane, shutLanes(before))) - 0.01) why = 'no time to move in';
        else if (after && after.z - z < coinOut(speed(after.z), laneMoves(it.lane, shutLanes(after))) - 0.01) why = 'no time to get out';
        if (why) bad.push({ z: Math.round(z * 10) / 10, lane: it.lane, why });
      }
    }
  }
  return bad;
}

/**
 * Is the course always passable? Every row leaves a lane with nothing hard in it, and from the lane open in the row before,
 * that lane can be reached in time (the gap at full speed holds two lane changes and a moment to react).
 */
export function passable(course) {
  let prevZ = -Infinity;
  for (const row of course.rows) {
    const shut = shutLanes(row);
    if (shut.size >= RIVER.lanes) return false;
    // (a jump or a duck needs its time too, before and after)
    const act = row.items.some((it) => it.kind === 'log' || it.kind === 'branch');
    const dz = row.z - prevZ;
    if ((shut.size || act) && dz < RIVER.gapMin - 0.01) return false;
    // (the endless river at speed: the gap still holds the time to react)
    if ((shut.size || act) && course.endless && dz < speedAt(row.z, Infinity) * reactAt(row.z) - 0.51) return false;
    if (shut.size || act) prevZ = row.z;
  }
  return true;
}
