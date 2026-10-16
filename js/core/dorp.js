// (1.16) Jou dorp: Steel en Wraak. The owner (16 Oct 2026, typed, playing against his wife): "Its still not something
// that will bring me back, that is what needs to be kept in mind, everyone who plays this game wants their friends to
// play, that is the aim" (his pick of three hooks: "Steel en Wraak").
// The people of every tower you build move into your own town, which lives on between games on the match server, so
// your friends can see it. Three Perfeks in a row earn a strooptog (a raid): your tribe takes some of a neighbour's
// people, even while they are away, and those people move into your town. Your first tower each day builds a wall: a
// wall stops one raid, then it breaks. Whoever was robbed gets one free, stronger Wraak (revenge) on the raider, and the
// raider's WhatsApp taunt carries the link to it. Pure rules, shared by the game (js/dorp.js) and the server
// (server/src/dorp.js).

import { cleanNickname } from './duel.js';

export const DORP = Object.freeze({
  share: 0.12,          // a raid takes this share of the other town's people...
  min: 3,               // ...at least this many (when they have them)...
  max: 40,              // ...and at most this many
  beatsMul: 1.5,        // your tribe beats theirs (vuur > gras, water > vuur, gras > water)
  wraakMul: 1.5,        // a revenge raid is stronger still
  raidsMax: 5,          // strooptogte kept for later
  wallsMax: 3,
  startRaids: 1,        // a new town starts with one (a friend's link: steal from them at once)
  gainPeople: 500,      // the most people one report can send (one game's town)
  gainRaids: 20,
  gainsMax: 40,         // reports a phone may hold back while the server is away
  newsMax: 30,          // news kept per town
  bureMax: 60,          // neighbours per town
  raidStreak: 3,        // Perfeks in a row for a strooptog
  // (the owner: "Again premium with a few more features") a raid is aimed: a target sweeps over their town and the
  // tap strikes; on the glowing tower (the fullest) a Perfek takes half again as many, a miss fewer
  hitMul: Object.freeze({ P: 1.5, G: 1, S: 0.6 }),
  // golden people (the Living Tower's rare golden residents) live on in the town; a raid may catch some: coins
  gainGold: 5,
  goldCoins: 25,
});

// (the owner's picks after "Very nice, we are getting there...": "2 and 4") Robot Rikus's town is everyone's first
// neighbour (a player with no friends yet raids him at once, and he raids back now and then), and landmarks for coins:
// your neighbours see them, and every landmark brings tourists, people for your town, on your first visit each day.
export const RIKUS_ID = 'RIKUS';
export const RIKUS = Object.freeze({
  start: 40,             // his town at first
  min: 30,               // he never has fewer than this for long...
  share: 0.8,            // ...and grows towards this share of your town
  refillPerHour: 0.2,    // of that goal, an hour
  gold: 1,               // a golden person, back every day
  backChance: 0.5,       // after your raid, he raids you back (once, a while later) this often
  backAfterMs: 90 * 1000,
});
/** Landmarks: on land (beside the towers) or in the sea (around the island); price in coins, tourists a day. */
export const MARKS = Object.freeze([
  Object.freeze({ id: 'fontein', emoji: '⛲', where: 'land', price: 200, tourists: 2 }),
  Object.freeze({ id: 'seilboot', emoji: '⛵', where: 'sea', price: 250, tourists: 2 }),
  Object.freeze({ id: 'mallemeule', emoji: '🎠', where: 'land', price: 350, tourists: 3 }),
  Object.freeze({ id: 'dolfyn', emoji: '🐬', where: 'sea', price: 400, tourists: 3 }),
  Object.freeze({ id: 'wiel', emoji: '🎡', where: 'land', price: 600, tourists: 5 }),
  Object.freeze({ id: 'walvis', emoji: '🐋', where: 'sea', price: 800, tourists: 6 }),
  Object.freeze({ id: 'kasteel', emoji: '🏰', where: 'land', price: 900, tourists: 7 }),
  Object.freeze({ id: 'vuurpyl', emoji: '🚀', where: 'land', price: 1500, tourists: 12 }),
]);
export const markOf = (id) => MARKS.find((m) => m.id === id) || null;
/** A town's landmarks as stored: known ids, each once, in the order bought. */
export const cleanMarks = (list) => (Array.isArray(list) ? [...new Set(list.filter((id) => !!markOf(id)))] : []);
/** The tourists a day the landmarks bring. */
export const touristsOf = (marks) => cleanMarks(marks).reduce((s, id) => s + markOf(id).tourists, 0);
export const isDayKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);

export const DORP_TRIBES = Object.freeze(['vuur', 'water', 'gras']);
/** Whose tribe beats whose (the same as the battles in Blok vir Blok). */
export const DORP_BEATS = Object.freeze({ vuur: 'gras', water: 'vuur', gras: 'water' });
export const TRIBE_ICON = Object.freeze({ vuur: '🔥', water: '💧', gras: '🌿' });

/** The town's titles by how many people live in it (bigger than one tower's: Huisie ... Sterrestad). */
export const DORP_TITLES = Object.freeze([
  Object.freeze({ at: 0, id: 'plasie', emoji: '🛖' }),
  Object.freeze({ at: 30, id: 'gehuggie', emoji: '🏘️' }),
  Object.freeze({ at: 100, id: 'dorpie', emoji: '⛪' }),
  Object.freeze({ at: 250, id: 'dorp', emoji: '🏫' }),
  Object.freeze({ at: 500, id: 'stad', emoji: '🏙️' }),
  Object.freeze({ at: 1000, id: 'grootstad', emoji: '🌆' }),
  Object.freeze({ at: 2000, id: 'metropool', emoji: '🌃' }),
  Object.freeze({ at: 4000, id: 'sterrestad', emoji: '✨' }),
]);

/** The town's title now and the next one (null at the top). */
export function dorpTitle(people) {
  const p = Math.max(0, Math.floor(Number(people) || 0));
  let k = 0;
  while (k + 1 < DORP_TITLES.length && p >= DORP_TITLES[k + 1].at) k++;
  return { now: DORP_TITLES[k], next: DORP_TITLES[k + 1] || null };
}

/** How many people a raid takes (0 when their town is empty): a share of theirs, stronger for a beating tribe or Wraak. */
export function raidTake({ people = 0, mine = 'vuur', theirs = 'vuur', wraak = false, hit = 'G' } = {}) {
  const p = Math.max(0, Math.floor(Number(people) || 0));
  if (!p) return 0;
  let n = p * DORP.share;
  if (DORP_BEATS[mine] === theirs) n *= DORP.beatsMul;
  if (wraak) n *= DORP.wraakMul;
  n *= DORP.hitMul[hit] || 1;
  return Math.min(p, Math.round(Math.max(DORP.min, Math.min(DORP.max, n))));
}

/** A raid's aim, as the game rated the tap ('P' Perfek on the glowing tower, 'G', 'S'); anything else: 'G'. */
export const cleanHit = (h) => (h === 'P' || h === 'S' ? h : 'G');

/** Golden people a raid catches: each of theirs with the chance took / their people (`rand`: 0-1). */
export function goldTake({ gold = 0, people = 0, took = 0, rand = Math.random } = {}) {
  const g = Math.max(0, Math.floor(gold) || 0);
  if (!g || !(took > 0) || !(people > 0)) return 0;
  const p = Math.min(1, took / people);
  let n = 0;
  for (let k = 0; k < g; k++) if (rand() < p) n += 1;
  return n;
}

// ------------------------------------------------------------------------------------------------- ids, keys and names
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // (no I, O, 0, 1: read aloud or typed, they're never confused)
export const isTownId = (id) => typeof id === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(id);
export const isRaidId = (id) => typeof id === 'string' && /^[A-HJ-NP-Z2-9]{10}$/.test(id);
export const isTownKey = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(k);

function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}
const pickIds = (n) => [...randomBytes(n)].map((x) => ALPHA[x % ALPHA.length]).join('');
/** A town's public id (in links): 8 letters and digits. */
export const newTownId = () => pickIds(8);
export const newRaidId = () => pickIds(10);
/** A town's secret key (only its own phone knows it; the server keeps its SHA-256). */
export function newTownKey() {
  return [...randomBytes(32)].map((x) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[x & 63]).join('');
}

/** A town's name as the name rules allow it (Uitdagersreeks nicknames), else null. */
export function cleanTownName(raw) {
  return typeof raw === 'string' && raw.trim() ? cleanNickname(raw) : null;
}

/** One phone's report of what its games brought ({ seq, people, raids, walls }), cleaned, or null. */
export function cleanGain(g) {
  if (!g || typeof g !== 'object' || !Number.isInteger(g.seq) || g.seq < 1) return null;
  const n = (v, max) => (Number.isInteger(v) && v > 0 ? Math.min(v, max) : 0);
  return { seq: g.seq, people: n(g.people, DORP.gainPeople), raids: n(g.raids, DORP.gainRaids), walls: n(g.walls, 1), gold: n(g.gold, DORP.gainGold) };
}

/** Strooptogte a game's ratings earned: every DORP.raidStreak Perfeks in a row (['P', 'G', ...] in order). */
export function raidsFromRatings(ratings) {
  let run = 0;
  let n = 0;
  for (const r of ratings || []) {
    if (r === 'P') {
      run += 1;
      if (run % DORP.raidStreak === 0) n += 1;
    } else {
      run = 0;
    }
  }
  return n;
}
