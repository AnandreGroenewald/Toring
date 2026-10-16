// (1.16) Die Lewende Toring, in Stapel itself (the owner, 16 Oct 2026: "it needs to be part of the Stapel scenario. So the
// more perfects you have the more rooms you have. ... it needs to be so joyfull that you cant put the game down").
// Every block that stands in the tower is a floor with windows; how it landed decides how many rooms open in it, and
// people move into every room at once:
//   Skeef  0 rooms (the windows are boarded up: nobody lives in a crooked floor)
//   Goed   1 room
//   Perfek 1 + the Perfeks in a row (2, 3, 4, ...): the more Perfeks, the more rooms. What doesn't fit in the new floor
//          lights the dark windows lower down (a boarded floor gets fixed up).
// A block that falls takes its people with it: they jump with parachutes. The people in the tower are the town, and the
// town grows through titles (Huisie, Plaashuis, ... Sterrestad). Pure rules and the player's own record; the pictures are
// js/game/living.js.

import { createRng } from './rng.js';

export const LIVING = Object.freeze({
  maxRoomsPerLanding: 6,   // a long run of Perfeks keeps lighting windows, six at most per landing
  goldChance: 0.02,        // a golden resident (rare: about one in two towers; the album keeps them)
  ownTribe: 0.6,           // most people are your own tribe's; the rest come from the other two
  nearRecord: 3,           // "nog 3 tot jou rekord": said once, this close
  recordFrom: 5,           // a record mid-game is cheered only once there is one worth beating
});

export const TRIBE_IDS = Object.freeze(['vuur', 'water', 'gras']);
/** The cast (id -> tribe), the same people as js/game/residents.js CAST. */
export const CAST_TRIBE = Object.freeze({
  braai: 'vuur', rissie: 'vuur', draakie: 'vuur', vuurhoutjie: 'vuur',
  haai: 'water', seekat: 'water', duiker: 'water', brandweer: 'water',
  boer: 'gras', bytjie: 'gras', klippie: 'gras', madelief: 'gras',
});
export const CAST_IDS = Object.freeze(Object.keys(CAST_TRIBE));

/** The town's titles by how many people live in the tower. */
export const TITLES = Object.freeze([
  Object.freeze({ at: 5, id: 'huisie', emoji: '🏠' }),
  Object.freeze({ at: 12, id: 'plaashuis', emoji: '🏡' }),
  Object.freeze({ at: 25, id: 'woonstel', emoji: '🏢' }),
  Object.freeze({ at: 40, id: 'hotel', emoji: '🏨' }),
  Object.freeze({ at: 60, id: 'wolkekrabber', emoji: '🏙️' }),
  Object.freeze({ at: 90, id: 'stad', emoji: '🌆' }),
  Object.freeze({ at: 130, id: 'metropool', emoji: '🌃' }),
  Object.freeze({ at: 180, id: 'ruimtestad', emoji: '🚀' }),
  Object.freeze({ at: 250, id: 'sterrestad', emoji: '✨' }),
]);

/** Rooms a landing opens: Skeef 0, Goed 1, Perfek 1 + Perfeks in a row (`combo`, this one included). */
export function roomsFor(rating, combo = 1) {
  if (rating === 'P') return Math.min(LIVING.maxRoomsPerLanding, 1 + Math.max(1, combo | 0));
  if (rating === 'G') return 1;
  return 0;
}

/** The title for `people` (null below the first), and the next one (null at the top). */
export function titleFor(people) {
  let now = null;
  let next = TITLES[0];
  for (let k = 0; k < TITLES.length; k++) {
    if (people >= TITLES[k].at) {
      now = TITLES[k];
      next = TITLES[k + 1] || null;
    }
  }
  return { now, next };
}

/** How far from the last title to the next (0-1; 1 at the top). */
export function titleProgress(people) {
  const { now, next } = titleFor(people);
  if (!next) return 1;
  const from = now ? now.at : 0;
  return Math.max(0, Math.min(1, (people - from) / Math.max(1, next.at - from)));
}

/**
 * Who moves in, one after the other: mostly your own tribe, now and then someone from another, rarely a golden one.
 * The same seed gives the same people (a Daily Tower's town looks the same on a second look).
 */
export function createCasting(seed, tribe) {
  const rng = createRng(`${seed}/lewende`);
  const own = CAST_IDS.filter((id) => CAST_TRIBE[id] === tribe);
  const other = CAST_IDS.filter((id) => CAST_TRIBE[id] !== tribe);
  let last = null;
  return {
    next() {
      let who = null;
      for (let tries = 0; tries < 4 && (!who || who === last); tries++) {
        who = rng.chance(LIVING.ownTribe) || !other.length ? rng.pick(own.length ? own : CAST_IDS) : rng.pick(other);
      }
      last = who;
      return { who, gold: rng.chance(LIVING.goldChance) };
    },
  };
}

// --------------------------------------------------------------------------------------------- the player's own record
const KEY = 'stapel.v1.lewende';
const blank = () => ({ v: 1, tribe: 'vuur', best: 0, bestTitle: null, met: {}, gold: {}, intro: false });

function clean(raw) {
  const d = blank();
  if (!raw || typeof raw !== 'object') return d;
  if (TRIBE_IDS.includes(raw.tribe)) d.tribe = raw.tribe;
  if (Number.isFinite(raw.best) && raw.best > 0) d.best = Math.min(100000, Math.floor(raw.best));
  if (TITLES.some((t) => t.id === raw.bestTitle)) d.bestTitle = raw.bestTitle;
  for (const k of ['met', 'gold']) {
    if (raw[k] && typeof raw[k] === 'object') {
      for (const id of CAST_IDS) if (Number.isFinite(raw[k][id]) && raw[k][id] > 0) d[k][id] = Math.min(1e6, Math.floor(raw[k][id]));
    }
  }
  d.intro = raw.intro === true;
  return d;
}

/** The Living Tower's own little store (its own key: the main save and the cloud save stay as they are). */
export function createLivingStore(backend = typeof localStorage !== 'undefined' ? localStorage : null) {
  let data = blank();
  const load = () => {
    try {
      const s = backend?.getItem(KEY);
      data = clean(s ? JSON.parse(s) : null);
    } catch {
      data = blank();
    }
  };
  const save = () => {
    try { backend?.setItem(KEY, JSON.stringify(data)); } catch { /* private mode: it lasts this visit */ }
  };
  load();
  return {
    get() { load(); return JSON.parse(JSON.stringify(data)); },
    tribe() { load(); return data.tribe; },
    setTribe(t) { load(); if (TRIBE_IDS.includes(t)) { data.tribe = t; save(); } return data.tribe; },
    best() { load(); return data.best; },
    introSeen() { load(); return data.intro; },
    markIntro() { load(); if (!data.intro) { data.intro = true; save(); } },
    /** Has this person ever lived in one of your towers (and in gold)? */
    known(id, gold = false) { load(); return !!(gold ? data.gold[id] : data.met[id]); },
    /** A game's town: the people who moved in (ids, gold ones) and how many lived there at the end. */
    record({ people = 0, met = [], gold = [] } = {}) {
      load();
      const first = !Object.keys(data.met).length;   // the player's first town: everyone is new, nobody is marked so
      for (const id of met) if (CAST_TRIBE[id]) data.met[id] = (data.met[id] || 0) + 1;
      for (const id of gold) if (CAST_TRIBE[id]) data.gold[id] = (data.gold[id] || 0) + 1;
      const was = data.best;
      const n = Math.max(0, Math.floor(people) || 0);
      if (n > data.best) {
        data.best = n;
        data.bestTitle = titleFor(n).now?.id || null;
      }
      save();
      return { best: data.best, newBest: n > was && n > 0, was, first };
    },
  };
}
