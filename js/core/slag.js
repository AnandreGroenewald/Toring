// (1.17) Vrugteslag: Ryk teen Ryk, the rules. The owner (16 Oct 2026, typed): "The more you play stapel (dayly challenge)
// the bigger your empire gets, Break your oponents empire before he breaks yours, with special abilities. So it needs to
// be a fruit battle, grapes, slingshot infront of the camera, it splashes over 4 blocks, Bananas, boomerangs with one
// whole block no matter if its 2 or 5 people in that row, fruit juice ... "the flood" ... it eliminates 2 rows,
// watermelon, damages 6 - 10 blocks, special abilaties, if you have defence, swords counter grapes, monkeys catches
// bananas, big joe drinks the juice, this depends on where you put the people ... A mini game before you begin decides
// if you get an extra turn". Then: "make it more difficult with the fruit, it musnt be easy ... you can miss". His
// picks: style B (Sononder-slag) and all four extras (Herbou with the crane, weather each turn, weak spots and combos,
// fruit from the Daily Tower).
// A castle is rows from the ground up (0 = the bottom), each with 2-5 people; four defenders stand in rows, hidden from
// the other side until one catches something. Pure: the scene (js/scenes/SlagScene.js) shows it, a server can run it.

import { createRng } from './rng.js';

export const SLAG = Object.freeze({
  rowsMin: 6,
  rowsMax: 14,
  rowMin: 2,             // people in a row at the start (the owner: "no matter if its 2 or 5 people in that row")
  rowMax: 5,
  maxTurns: 24,          // twelve shots each; then the castle with more people wins
  hitMul: Object.freeze({ P: 1.5, G: 1, S: 0.5 }),
  crackMul: 2,           // a cracked row (it lost people before) takes double: the weak spots
  comboFor: 3,           // hits in a row for a fire shot
  fireMul: 1.5,
  // the fruit basket (fruit from the Daily Tower): what a new player starts with, the most it holds, the most a battle takes
  start: Object.freeze({ piesang: 3, sap: 2, waatlemoen: 1 }),
  cap: Object.freeze({ piesang: 9, sap: 5, waatlemoen: 3 }),
  perBattle: Object.freeze({ piesang: 3, sap: 2, waatlemoen: 1 }),
  // Herbou with the crane: a block on top of your own castle (a Perfek brings people with it)
  rebuild: Object.freeze({ P: 4, G: 2, S: 0, X: 0 }),
  reward: Object.freeze({ winCoins: 40, loseCoins: 10, winTrophies: 25, loseTrophies: -10, share: 0.1 }),
});

export const FRUITS = Object.freeze(['druiwe', 'piesang', 'sap', 'waatlemoen']);
export const DEFENDER_IDS = Object.freeze(['ridder', 'aap', 'joe', 'sarel']);
/** Which defender stops which fruit (Sterk Sarel and the watermelon: the owner's three, plus one). */
export const COUNTER = Object.freeze({ druiwe: 'ridder', piesang: 'aap', sap: 'joe', waatlemoen: 'sarel' });

// ------------------------------------------------------------------------------------------------------- a castle
/** A castle of `rows` rows holding about `people` people (2-5 a row), the same for the same seed. */
export function makeCastle({ rows = 10, people = 36, seed = 'kasteel' } = {}) {
  const n = Math.max(SLAG.rowsMin, Math.min(SLAG.rowsMax, rows | 0));
  const rng = createRng(`slag/${seed}`);
  const want = Math.max(n * SLAG.rowMin, Math.min(n * SLAG.rowMax, people | 0));
  const out = Array.from({ length: n }, () => ({ people: SLAG.rowMin, cap: SLAG.rowMin, cracked: false }));
  let left = want - n * SLAG.rowMin;
  for (let guard = 0; left > 0 && guard < 500; guard++) {
    const r = rng.int(0, n - 1);
    if (out[r].people < SLAG.rowMax) {
      out[r].people += 1;
      out[r].cap += 1;
      left -= 1;
    }
  }
  return { rows: out, defenders: {}, revealed: [], joeBig: false };
}

export const castlePeople = (c) => (c?.rows || []).reduce((s, r) => s + Math.max(0, r.people | 0), 0);
export const cleanRow = (c, r) => (Number.isInteger(r) && r >= 0 && r < (c?.rows?.length || 0) ? r : null);

/** Defenders on rows: { ridder: 2, aap: 5, ... } (one row each, any row; each only in a real row). */
export function placeDefenders(c, places = {}) {
  const d = {};
  for (const id of DEFENDER_IDS) {
    const r = cleanRow(c, places[id]);
    if (r != null) d[id] = r;
  }
  c.defenders = d;
  c.revealed = [];
  return c;
}

/** Where Robot Rikus puts his defenders: Joe up high (juice comes from above), Sarel low, the others in between. */
export function botDefenders(c, rand = Math.random) {
  const n = c.rows.length;
  const pick = (lo, hi) => Math.max(0, Math.min(n - 1, lo + Math.floor(rand() * Math.max(1, hi - lo + 1))));
  return {
    joe: pick(Math.floor(n * 0.6), n - 1),
    sarel: pick(0, Math.floor(n * 0.4)),
    aap: pick(Math.floor(n * 0.3), Math.floor(n * 0.7)),
    ridder: pick(0, n - 1),
  };
}

// --------------------------------------------------------------------------------------------------- the weather
/** Each turn's weather (the same for both games: the battle's seed): wind -3..3 (+ blows right), rain, fog, storm. */
export function weatherFor(seed, turn) {
  const rng = createRng(`slag/${seed}/weer/${turn}`);
  const wind = rng.int(-3, 3);
  const roll = rng.next();
  return {
    wind,
    rain: roll < 0.18,                 // fruit slips: a Skeef slides off (a miss)
    fog: roll >= 0.18 && roll < 0.3,   // their castle's top half is hard to see
    storm: roll >= 0.3 && roll < 0.38, // the wind turns while the fruit flies
  };
}

// ----------------------------------------------------------------------------------------------------- a shot lands
/**
 * Where a shot hit: its landing point against the castle, as the scene measured it (`dx`: across the castle, -1..1 its
 * edges; `dy`: within the row, 0 its middle, ±0.5 its edges) → 'P' Perfek, 'G' Goed, 'S' Skeef, 'X' Mis.
 */
export function rateImpact({ dx = 0, dy = 0, onCastle = true, rain = false } = {}) {
  if (!onCastle || Math.abs(dx) > 1) return 'X';
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const r = ax <= 0.3 && ay <= 0.22 ? 'P' : ax <= 0.7 && ay <= 0.42 ? 'G' : 'S';
  return rain && r === 'S' ? 'X' : r;   // (rain: a glancing hit slips off)
}

/** The rows a fruit reaches from `row` (the one it hit) and what each loses before multipliers. */
function reach(c, fruit, row, hit) {
  const n = c.rows.length;
  const at = (r, lose) => (r >= 0 && r < n ? [{ row: r, lose }] : []);
  if (fruit === 'druiwe') {
    // a bunch splashes over 4 blocks: the one it hit, then up, down, and one more up
    const centre = hit === 'P' ? 2 : 1;
    const out = [...at(row, centre), ...at(row + 1, 1), ...at(row - 1, 1)];
    if (hit !== 'S') out.push(...at(row + 2, 1));
    return out;
  }
  if (fruit === 'piesang') {
    // the boomerang takes the whole block, 2 people or 5 (a glancing one: half)
    const p = c.rows[row].people;
    return at(row, hit === 'S' ? Math.ceil(p / 2) : p);
  }
  if (fruit === 'sap') {
    // the flood: two rows, the one it hit and the one below (a glancing squirt: just the one)
    const out = at(row, c.rows[row].people);
    if (hit !== 'S' && row - 1 >= 0) out.push(...at(row - 1, c.rows[row - 1].people));
    return out;
  }
  // the watermelon: 6-10 blocks around where it hit (Perfek 10, Goed 8, Skeef 6), the middle three hardest
  const span = hit === 'P' ? 10 : hit === 'G' ? 8 : 6;
  const out = [];
  for (let k = 0; out.length < span && k < n * 2; k++) {
    const r = row + (k % 2 ? Math.ceil(k / 2) : -Math.ceil(k / 2));
    if (r >= 0 && r < n && !out.some((o) => o.row === r)) out.push({ row: r, lose: Math.abs(r - row) <= 1 ? 2 : 1 });
  }
  return out;
}

/**
 * A shot on castle `c` (changed in place): `fruit` at `row`, rated `hit`; `fire` (a combo's fire shot). Returns
 * { hits: [{ row, lost }], lost, countered: defender id | null, back: a banana thrown back, cracked: rows hit on a
 * crack }. A defender in the row it hit stops its own fruit (Ridder: and half the splash).
 */
export function applyShot(c, { fruit, row, hit = 'G', fire = false } = {}) {
  const res = { hits: [], lost: 0, countered: null, back: false, cracked: [] };
  const r0 = cleanRow(c, row);
  if (hit === 'X' || r0 == null || !FRUITS.includes(fruit)) return res;
  const who = COUNTER[fruit];
  const caught = c.defenders?.[who] === r0 || (fruit === 'sap' && who === 'joe' && c.joeBig && Math.abs((c.defenders?.joe ?? -9) - r0) <= 1);
  let parts = reach(c, fruit, r0, hit);
  if (caught) {
    res.countered = who;
    if (!c.revealed.includes(who)) c.revealed.push(who);
    if (who === 'aap') res.back = true;    // Blouaap catches it ... and throws it back
    if (who === 'joe') c.joeBig = true;    // Groot Joe drinks it, and grows (the next juice beside him too)
    if (who !== 'ridder') return res;
    // Ridder slices the bunch: nothing in his row, half the splash beside it
    parts = parts.filter((p) => p.row !== r0).map((p) => ({ ...p, lose: Math.floor(p.lose / 2) }));
  }
  const mul = (SLAG.hitMul[hit] || 1) * (fire ? SLAG.fireMul : 1);
  for (const p of parts) {
    const rowObj = c.rows[p.row];
    if (!rowObj || rowObj.people <= 0 || p.lose <= 0) continue;
    let lose = fruit === 'piesang' || fruit === 'sap' ? p.lose : Math.max(1, Math.round(p.lose * mul));
    if (rowObj.cracked) {
      lose *= SLAG.crackMul;
      res.cracked.push(p.row);
    }
    lose = Math.min(rowObj.people, lose);
    rowObj.people -= lose;
    rowObj.cracked = true;
    res.hits.push({ row: p.row, lost: lose });
    res.lost += lose;
  }
  return res;
}

// --------------------------------------------------------------------------------------------- herbou, combos, turns
/** Herbou: a block dropped on top of your own castle with the crane, rated like a landing: the people it brings. */
export function rebuild(c, rating) {
  const add = SLAG.rebuild[rating] || 0;
  if (!add || c.rows.length >= SLAG.rowsMax) return 0;
  c.rows.push({ people: add, cap: add, cracked: false });
  return add;
}

/** A side's run of hits: 3 in a row and the next shot is a fire shot (a miss or a caught shot ends the run). */
export function nextCombo(combo, { landed = false } = {}) {
  const n = landed ? combo.n + 1 : 0;
  return { n: n >= SLAG.comboFor ? 0 : n, fire: n >= SLAG.comboFor };
}

/** Who won (null: not yet): `a` and `b` castles, `turn` the turns played. */
export function winner(a, b, turn) {
  const pa = castlePeople(a);
  const pb = castlePeople(b);
  if (pa <= 0 && pb <= 0) return 'b';
  if (pb <= 0) return 'a';
  if (pa <= 0) return 'b';
  if (turn >= SLAG.maxTurns) return pa >= pb ? 'a' : 'b';
  return null;
}

// ------------------------------------------------------------------------------------------------------ Robot Rikus
/**
 * Robot Rikus's turn on castle `c`: which fruit (from `fruit` left), which row, and how well he hits (a fair player:
 * mostly Goed, sometimes a Perfek, sometimes a miss; worse in strong wind).
 */
export function botShot(c, fruit = {}, { rand = Math.random, wind = 0, level = 1, turn = 99 } = {}) {
  const n = c.rows.length;
  const full = (r) => (r >= 0 && r < n ? c.rows[r].people : 0);
  const best = (score) => {
    let b = 0;
    let bs = -1;
    for (let r = 0; r < n; r++) {
      const s = score(r) + rand() * 0.5;
      if (s > bs) { bs = s; b = r; }
    }
    return b;
  };
  const total = castlePeople(c);
  // (a fair opponent: his juice from his second turn, his watermelon from his third, bananas now and then)
  let kind = 'druiwe';
  if ((fruit.waatlemoen | 0) > 0 && turn >= 6 && total >= 14 && rand() < 0.45) kind = 'waatlemoen';
  else if ((fruit.sap | 0) > 0 && turn >= 4 && rand() < 0.3) kind = 'sap';
  else if ((fruit.piesang | 0) > 0 && rand() < 0.35) kind = 'piesang';
  const row = kind === 'sap' ? best((r) => full(r) + full(r - 1)) : kind === 'druiwe' ? best((r) => full(r) + full(r + 1) + full(r - 1)) : best((r) => full(r) + (kind === 'waatlemoen' ? full(r + 1) + full(r - 1) : 0));
  // his aim: level 1 (where every player starts) hits about two shots in three, a Perfek now and then
  const windPenalty = Math.abs(wind) * 0.04;
  const roll = rand();
  const p = 0.06 + 0.04 * level;
  const x = 0.24 + windPenalty;
  const hit = roll < p ? 'P' : roll < p + 0.5 - windPenalty ? 'G' : roll < 1 - x ? 'S' : 'X';
  return { fruit: kind, row, hit };
}

// -------------------------------------------------------------------------------------------- the fruit basket
/** A new basket (fruit from the Daily Tower; grapes never run out). */
export const newBasket = () => ({ ...SLAG.start });
export function cleanBasket(b) {
  const out = newBasket();
  if (!b || typeof b !== 'object') return out;
  for (const k of Object.keys(SLAG.cap)) if (Number.isInteger(b[k]) && b[k] >= 0) out[k] = Math.min(SLAG.cap[k], b[k]);
  return out;
}
/** What a Daily Tower brings: a banana for every 5 Perfeks, a juice box for every 10, a watermelon every third day of a streak. */
export function harvest({ perfects = 0, streak = 0 } = {}) {
  const p = Math.max(0, perfects | 0);
  return { piesang: Math.floor(p / 5), sap: Math.floor(p / 10), waatlemoen: streak > 0 && streak % 3 === 0 ? 1 : 0 };
}
export function addFruit(basket, gain) {
  const b = cleanBasket(basket);
  for (const k of Object.keys(SLAG.cap)) b[k] = Math.min(SLAG.cap[k], b[k] + Math.max(0, gain?.[k] | 0));
  return b;
}
/** The fruit a battle may use from the basket (at most SLAG.perBattle of each; grapes: no end). */
export function battleFruit(basket) {
  const b = cleanBasket(basket);
  return { druiwe: Infinity, piesang: Math.min(b.piesang, SLAG.perBattle.piesang), sap: Math.min(b.sap, SLAG.perBattle.sap), waatlemoen: Math.min(b.waatlemoen, SLAG.perBattle.waatlemoen) };
}

/** What a battle pays: coins, trophies, and (a win) people for your town from theirs. */
export function battleReward({ won = false, theirStart = 0 } = {}) {
  const r = SLAG.reward;
  return won
    ? { coins: r.winCoins, trophies: r.winTrophies, people: Math.max(1, Math.round(theirStart * r.share)) }
    : { coins: r.loseCoins, trophies: r.loseTrophies, people: 0 };
}
