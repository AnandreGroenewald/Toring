// (1.20) Ons dorp: the crew, the week and the Saterdag-uitdaging (the owner, 24 Oct 2026: "I like the dorp scenario but I
// do not like the steal", "a clash every Saterday ... everybody plays together to win, grow your crew to build the bigger
// town", "3 players on a team ... whoever builds their tower the highest wins, but if your tower is the highest crews
// automatically can attack it", the ticket "3 of 5 Dailies", "I want a Saterday Challenge, not the 20 minute challenge",
// "4 crews per river"). The plan: docs/RIVIER-PLAN-2026-10-24.md. Pure rules, shared by the game, the server and the tests.
//
// A crew (span) is 1-3 players with one island and one Weektoring. Every Daily you finish (Mon-Sat) gives you a build turn
// (10 blocks with the crane on the Weektoring) and its height counts towards your bombs; 3 weekday Dailies are your ticket
// for Saturday. On Saturday (06:00 until the whistle, which blows at a time nobody knows between 20:00 and 21:00) four
// crews share a river and only the tallest tower can be bombed. Sunday is the crowning; a new Weektoring starts on Monday.
// Days and weeks are South African time (UTC+2, no daylight saving): the whole game shares one Saturday.
import { createRng } from './rng.js';
import { checkName } from './nameRules.js';

export const SPAN = Object.freeze({
  crewMax: 3,                 // players in a crew
  nameMin: 2,
  nameMax: 18,
  turnBlocks: 10,             // blocks in a build turn
  turnsMax: 2,                // build turns that can wait (a third Daily while two wait gives none)
  leaseMs: 4 * 60 * 1000,     // one builder at a time on a tower: a turn holds the crane this long at most
  bombPerM: 25,               // 1 bomb per this many metres of your Dailies (Mon-Sat, each day's best)
  bombsMax: 10,               // ...at most this many a week
  bombsPerRun: 3,             // a bomb run carries at most this many
  ticketDays: 3,              // finished weekday Dailies (Mon-Fri) for a Saturday ticket
  repairPerHit: 1,            // repair blocks a crew gets for each hit its tower takes
  repairMax: 12,              // ...kept at most
  riverCrews: 4,              // crews on one river on Saturday
  startHour: 6,               // Saturday's challenge opens (SAST)
  whistleFrom: 20,            // ...and the whistle blows between 20:00 and 21:00 (SAST)
  leaderGraceMs: 90 * 1000,   // a bomb run aimed at the leader still lands if the lead changed this recently
  rescuePerRun: 12,           // people on one river run at most
  riverPeopleMax: 60,         // a crew's people still in the river (from bombs) at most
  coinsPerRescue: 1,
  prize: Object.freeze([150, 80, 40, 20]),   // coins each for 1st..4th on Saturday
  keepWeeks: 6,        // a week's rivers (standings, the bomb log) are deleted this many weeks later
});

const SAST_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 86400000;
const pad2 = (n) => String(n).padStart(2, '0');

/** The South African date and time of `ms`: { key 'YYYY-MM-DD', dow 1 (Mon) .. 7 (Sun), h, m }. */
export function sastOf(ms = Date.now()) {
  const d = new Date(ms + SAST_MS);
  const dow = d.getUTCDay() || 7;
  return { key: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`, dow, h: d.getUTCHours(), m: d.getUTCMinutes() };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isDayKey = (k) => typeof k === 'string' && DATE_RE.test(k) && !Number.isNaN(Date.parse(`${k}T00:00:00Z`));
const utcOf = (key) => Date.parse(`${key}T00:00:00Z`);
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The day of the week of a date key: 1 (Monday) .. 7 (Sunday). */
export function dowOf(dateKey) {
  return new Date(utcOf(dateKey)).getUTCDay() || 7;
}

/** The week a date belongs to: its Monday's date key. */
export function weekOf(dateKey) {
  return keyOf(utcOf(dateKey) - (dowOf(dateKey) - 1) * DAY_MS);
}

/** Date key `n` days after `dateKey`. */
export const plusDays = (dateKey, n) => keyOf(utcOf(dateKey) + n * DAY_MS);

/** The Saturday (and Sunday) of a week. */
export const saturdayOf = (weekKey) => plusDays(weekKey, 5);
export const sundayOf = (weekKey) => plusDays(weekKey, 6);

/** ms of `dateKey` at h:m South African time. */
export const sastAt = (dateKey, h = 0, m = 0) => utcOf(dateKey) + (h * 60 + m) * 60000 - SAST_MS;

/**
 * When Saturday's whistle blows for river `riverId` in week `weekKey` (ms): a time between 20:00 and 21:00 that is the
 * same for everyone on that river and that nobody can work out beforehand without the river's secret `salt` (the server
 * keeps it; the game only ever says "between 8 and 9").
 */
export function whistleAt(weekKey, riverId, salt = '') {
  const rng = createRng(`fluitjie/${weekKey}/${riverId}/${salt}`);
  return sastAt(saturdayOf(weekKey), SPAN.whistleFrom, rng.int(0, 59));
}

/**
 * Where the week stands at `ms`: 'bou' (Mon 00:00 - Sat 06:00: build), 'uitdaging' (Sat 06:00 - the whistle), 'kroning'
 * (after the whistle, until Sunday ends). `whistle`: this river's whistle (ms); without it Saturday counts until 21:00.
 */
export function phaseAt(ms, whistle = null) {
  const s = sastOf(ms);
  const wk = weekOf(s.key);
  const open = sastAt(saturdayOf(wk), SPAN.startHour);
  const end = Number.isFinite(whistle) ? whistle : sastAt(saturdayOf(wk), SPAN.whistleFrom + 1);
  if (ms < open) return { phase: 'bou', week: wk };
  if (ms < end) return { phase: 'uitdaging', week: wk };
  return { phase: 'kroning', week: wk };
}

/** Changes to a crew (joining, leaving, removing) are closed from Saturday 00:00 to Sunday 23:59. */
export const crewLocked = (ms) => sastOf(ms).dow >= 6;

// --------------------------------------------------------------------------------------------- a player's week
/**
 * A player's week from their finished Dailies `days` ({ dateKey: best height in m } of that week): the Saturday ticket
 * (3 of the 5 weekdays), the bombs (1 per 25 m of Mon-Sat, at most 10) and how many weekdays count.
 */
export function weekStats(days, weekKey) {
  let weekdays = 0;
  let metres = 0;
  for (let k = 0; k < 6; k++) {
    const h = Number(days?.[plusDays(weekKey, k)]);
    if (!(h > 0)) continue;
    if (k < 5) weekdays++;
    metres += Math.min(h, 2000);
  }
  return {
    weekdays,
    ticket: weekdays >= SPAN.ticketDays,
    metres: Math.round(metres * 10) / 10,
    bombs: Math.min(SPAN.bombsMax, Math.floor(metres / SPAN.bombPerM)),
  };
}

// --------------------------------------------------------------------------------------------- ids, keys, names
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // (no I, O, 0, 1: read aloud or typed, never confused)
export const isSpanId = (id) => typeof id === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(id);
export const isPlayerId = isSpanId;
export const isSpanKey = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(k);
/** A crew's invite code (the WhatsApp link's ?span=): 6 letters. */
export const isInvite = (c) => typeof c === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(c);

function randomBytes(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}
const pick = (n) => [...randomBytes(n)].map((x) => ALPHA[x % ALPHA.length]).join('');
export const newSpanId = () => pick(8);
export const newInvite = () => pick(6);
export function newSpanKey() {
  const b = randomBytes(24);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A crew's name (kid-clean, 2-18 characters) or null. */
export function cleanCrewName(raw) {
  const r = checkName(String(raw ?? ''), { max: SPAN.nameMax });
  return r.ok ? r.value : null;
}

/** The skins a floor can be drawn in (looks only: the owner, 24 Oct 2026, "Building material ... its what skin they have"). */
export const BLOCK_SKIN_IDS = Object.freeze(['kleur', 'lekkergoed', 'klip', 'piksel', 'neon', 'koolstof', 'ys', 'marmer', 'goud', 'lawa', 'chroom', 'holo', 'heelal']);
export const cleanSkin = (s) => (BLOCK_SKIN_IDS.includes(s) ? s : 'kleur');
