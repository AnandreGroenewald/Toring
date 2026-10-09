// Coins, power-ups, Uitdagersreeks looks and ranks (1.8). Coins are earned by playing and live on
// the device; nothing here involves money yet. Pure: importable in node (unit tested). Names and
// descriptions live in js/core/strings.js (POWERUP_INFO, COSMETIC_INFO, RANK_INFO).
//
// Fairness: the Daily Tower is the same for everyone and compared ("beter as 72%"), and a duel is a
// race, so bought power-ups never count there. In the daily everyone gets the same free
// Fondamentblok from FOUNDATION_FREE_M; duels sell looks (a player card, a win celebration, the
// punishment's outfit) and ranks, never strength.

import { isDateKey } from './daily.js';

export const COIN = '🪙';

/** Power-ups (Oefen; the daily's free Fondamentblok). */
export const POWERUPS = Object.freeze({
  foundation: Object.freeze({ emoji: '🧱', price: 40 }),   // the next block is a long cement slab: a new foundation
  slow: Object.freeze({ emoji: '🐢', price: 25 }),         // the crane swings slower for SLOW_BLOCKS blocks
  shield: Object.freeze({ emoji: '🛡️', price: 30 }),       // the next monkey or thief bounces off
  heart: Object.freeze({ emoji: '❤️', price: 35 }),        // one heart back
});
export const POWERUP_IDS = Object.freeze(Object.keys(POWERUPS));
export const FOUNDATION_FREE_M = 55;
export const SLOW_BLOCKS = 5;
export const SLOW_MUL = 0.6;
export const MAX_STOCK = 99;
export const MAX_COINS = 999999;

/**
 * Uitdagersreeks looks. `price` 0 = everyone has it; `rank` = unlocked by reaching that rank in a
 * season (never sold). Badge and style emoji are shown to the opponent.
 */
export const COSMETICS = Object.freeze({
  frame: Object.freeze([
    { id: 'hout', price: 0 },
    { id: 'see', price: 120 },
    { id: 'goud', price: 250 },
    { id: 'springbok', price: 300 },
    { id: 'vuur', price: 350 },
    { id: 'diamant', price: 0, rank: 'diamant' },
  ]),
  badge: Object.freeze([
    { id: 'geen', price: 0, emoji: '' },
    { id: 'leeu', price: 80, emoji: '🦁' },
    { id: 'vuur', price: 80, emoji: '🔥' },
    { id: 'rugby', price: 100, emoji: '🏉' },
    { id: 'olifant', price: 100, emoji: '🐘' },
    { id: 'arend', price: 120, emoji: '🦅' },
    { id: 'kroon', price: 200, emoji: '👑' },
    { id: 's-brons', price: 0, emoji: '🥉', rank: 'brons' },
    { id: 's-silwer', price: 0, emoji: '🥈', rank: 'silwer' },
    { id: 's-goud', price: 0, emoji: '🥇', rank: 'goud' },
    { id: 's-platinum', price: 0, emoji: '💠', rank: 'platinum' },
    { id: 's-diamant', price: 0, emoji: '💎', rank: 'diamant' },
  ]),
  title: Object.freeze([
    { id: 'bouer', price: 0 },
    { id: 'hyskraanheld', price: 100 },
    { id: 'perfekmeester', price: 150 },
    { id: 'wolkekrabber', price: 200 },
    { id: 'toringkoning', price: 300 },
    { id: 'getrou', price: 0, week: true },   // the first full week of the weekkis (js/core/week.js), never sold
  ]),
  celebration: Object.freeze([
    { id: 'konfetti', price: 0, emoji: '🎊' },
    { id: 'vuurwerk', price: 150, emoji: '🧨' },
    { id: 'vuvuzela', price: 180, emoji: '📯' },
    { id: 'braai', price: 200, emoji: '🍖' },
    { id: 'skrum', price: 200, emoji: '🏉' },
  ]),
  style: Object.freeze([
    { id: 'gewoon', price: 0, emoji: '' },
    { id: 'pet', price: 100, emoji: '🧢' },
    { id: 'sonbril', price: 120, emoji: '🕶️' },
    { id: 'hoed', price: 150, emoji: '🎩' },
    { id: 'kroon', price: 250, emoji: '👑' },
  ]),
});
export const COSMETIC_KINDS = Object.freeze(Object.keys(COSMETICS));
export const DEFAULT_LOOK = Object.freeze({ frame: 'hout', badge: 'geen', title: 'bouer', celebration: 'konfetti', style: 'gewoon' });

/** One item of a kind, or null. */
export const cosmetic = (kind, id) => (COSMETICS[kind] || []).find((c) => c.id === id) || null;

// ------------------------------------------------------------------------------- ranks and seasons
// 1.12 (the owner: "In CSGO you had a rank… one rank for each challenge", "Gold Nova 2 70% till next
// level, but if you loose to someone you loose points", "there should be a lot of ranks"): each
// Uitdagersreeks mode (Wedloop, Blok vir Blok) has its own rank on a ladder of 23. A rank is 100 points,
// shown as a percentage. Only live matches against a person count (the owner: Robot Rikus "Not at
// all"). A season is a calendar month (South African dates); a new one drops every rank one tier.

/** The five tiers (for looks and season badges) and their emoji. */
export const RANKS = Object.freeze([
  { id: 'brons', emoji: '🥉' },
  { id: 'silwer', emoji: '🥈' },
  { id: 'goud', emoji: '🥇' },
  { id: 'platinum', emoji: '💠' },
  { id: 'diamant', emoji: '💎' },
]);
export const RANK_IDS = Object.freeze(RANKS.map((r) => r.id));
export const rankIndex = (id) => Math.max(0, RANK_IDS.indexOf(id));
export const RANK_STEP = 100;   // points per rank on the ladder (its percentage)

const ELITE = [
  { id: 'meesterbouer', emoji: '🏗️' },
  { id: 'grootmeester', emoji: '🏰' },
  { id: 'legende', emoji: '👑' },
];
/**
 * The ladder: Brons I, II, III, Brons Meester, Silwer I … Diamant Meester (div 1-4), then Meesterbouer,
 * Grootmeester and Stapel-legende (elite: their tier is Diamant for looks). `min` = index x RANK_STEP.
 */
export const LADDER = Object.freeze([
  ...RANKS.flatMap((t, ti) => [1, 2, 3, 4].map((div) => Object.freeze({
    id: `${t.id}-${div < 4 ? div : 'm'}`, tier: t.id, div, emoji: t.emoji, index: ti * 4 + div - 1, min: (ti * 4 + div - 1) * RANK_STEP,
  }))),
  ...ELITE.map((e, k) => Object.freeze({ id: e.id, tier: 'diamant', div: 0, elite: true, emoji: e.emoji, index: 20 + k, min: (20 + k) * RANK_STEP })),
]);
export const LADDER_IDS = Object.freeze(LADDER.map((r) => r.id));
const TOP = LADDER.length - 1;
export const ladderIndex = (id) => Math.max(0, LADDER_IDS.indexOf(id));

/** How rank points move (live matches only). */
export const RANK_RULES = Object.freeze({
  win: 20, winPerRank: 3, winMin: 8, winMax: 40,       // a win: 20, +3 for every rank the opponent is above you
  loss: 15, lossPerRank: 2, lossMin: 5, lossMax: 30,   // a loss: 15, -2 for every rank they are above you
  placement: 10, placementMul: 1.5,                    // a new player's first 10 matches: wins count 1.5x
  seasonDrop: 4 * RANK_STEP,                           // a new month: one tier down (Goud II -> Silwer II)
  maxPoints: (LADDER.length - 1) * RANK_STEP + RANK_STEP - 1,   // the top of Stapel-legende: points never pile up out of sight
});

/** The rank at some points: { ...ladder rank, pct (0-99, 100 at the top), next (ladder rank or null), toNext }. */
export function ladderAt(points) {
  const p = Math.max(0, Math.min(RANK_RULES.maxPoints, Math.floor(Number(points) || 0)));
  const k = Math.min(TOP, Math.floor(p / RANK_STEP));
  const r = LADDER[k];
  const next = LADDER[k + 1] || null;
  return { ...r, points: p, pct: next ? p - r.min : 100, next, toNext: next ? next.min - p : 0 };
}

/** A mode's rank as stored: { season, points, best (ladder id this season), played (rated matches), shield }. */
export function cleanModeRank(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const points = Math.max(0, Math.min(RANK_RULES.maxPoints, Math.floor(Number(r.points) || 0)));
  const now = ladderAt(points).id;
  const best = LADDER_IDS.includes(r.best) && ladderIndex(r.best) >= ladderIndex(now) ? r.best : now;
  return {
    season: typeof r.season === 'string' && /^\d{4}-\d{2}$/.test(r.season) ? r.season : null,
    points,
    best,
    played: Math.max(0, Math.min(1e6, Math.floor(Number(r.played) || 0))),
    shield: r.shield !== false,
  };
}

/** 'YYYY-MM' for a date key ('2026-10-08' -> '2026-10'), or null. */
export const seasonOf = (dateKey) => (isDateKey(dateKey) ? dateKey.slice(0, 7) : null);

/**
 * A new season began: every rank drops one tier (a fresh climb that keeps most of the progress), and the
 * season that ended leaves a badge for the best tier reached in it. Returns { rank, reward } (reward: a
 * badge id or null). Only a later month starts a season: a phone clock set back changes nothing.
 */
export function rolloverSeason(rank, season) {
  const r = cleanModeRank(rank);
  if (!season || r.season === season || (r.season && season < r.season)) return { rank: r, reward: null };
  if (!r.season) return { rank: { ...r, season }, reward: null };
  const reward = `s-${LADDER[ladderIndex(r.best)].tier}`;
  const points = Math.max(0, r.points - RANK_RULES.seasonDrop);
  return { rank: { ...r, season, points, best: ladderAt(points).id, shield: true }, reward };
}

/**
 * The points a live match moves: `won`, this player's ladder rank id `me`, the opponent's `opp` (from
 * their card; unknown: the same as yours), `played` (rated matches before this one).
 */
export function rankDelta({ won, me, opp = null, played = 0 }) {
  const R = RANK_RULES;
  const d = (LADDER_IDS.includes(opp) ? ladderIndex(opp) : ladderIndex(me)) - ladderIndex(me);
  if (won) {
    const base = Math.max(R.winMin, Math.min(R.winMax, R.win + R.winPerRank * d));
    return Math.round(base * (played < R.placement ? R.placementMul : 1));
  }
  return -Math.max(R.lossMin, Math.min(R.lossMax, R.loss - R.lossPerRank * d));
}

/**
 * A finished live match in one mode: 'won' or 'lost' against an opponent of ladder rank `opp`. A loss
 * that would drop a rank is caught by the shield once (the rank stays, at 0%); a win brings the shield
 * back. Never below Brons I. Returns { rank, delta, before, after, up, down, shielded, reward }.
 */
export function rankAfterMatch(rank, { outcome, opp = null, season }) {
  const rolled = rolloverSeason(rank, season);
  const r = rolled.rank;
  const before = ladderAt(r.points);
  if (outcome !== 'won' && outcome !== 'lost') return { rank: r, delta: 0, before, after: before, up: false, down: false, shielded: false, reward: rolled.reward };
  const won = outcome === 'won';
  const delta = rankDelta({ won, me: before.id, opp, played: r.played });
  let points = Math.max(0, Math.min(RANK_RULES.maxPoints, r.points + delta));
  let shield = won ? true : r.shield;
  let shielded = false;
  if (!won && points < before.min && before.index > 0 && r.shield) {
    points = before.min;   // the shield: you stay, at 0%
    shield = false;
    shielded = true;
  }
  const after = ladderAt(points);
  const best = after.index > ladderIndex(r.best) ? after.id : r.best;
  return {
    rank: { season: r.season, points, best, played: r.played + 1, shield },
    delta: points - r.points,
    before,
    after,
    up: after.index > before.index,
    down: after.index < before.index,
    shielded,
    reward: rolled.reward,
  };
}

/**
 * Ranks before 1.12 were one ladder of five (Brons 0, Silwer 100, Goud 250, Platinum 450, Diamant 700
 * points). A player keeps their tier: it becomes that tier's first rank in both modes.
 */
export function migrateOldRank(old) {
  const o = old && typeof old === 'object' ? old : {};
  const p = Math.max(0, Math.floor(Number(o.points) || 0));
  const tier = p >= 700 ? 4 : p >= 450 ? 3 : p >= 250 ? 2 : p >= 100 ? 1 : 0;
  const best = RANK_IDS.includes(o.best) ? `${o.best}-1` : null;   // (the season's best tier still earns its badge)
  const one = cleanModeRank({ season: o.season, points: tier * 4 * RANK_STEP, best, played: p > 0 ? RANK_RULES.placement : 0, shield: true });
  return { race: { ...one }, turns: { ...one } };
}

/** A rank's short label for the match pills: '🥇II', '💎M', '👑'. */
export function rankShortOf(id) {
  if (!LADDER_IDS.includes(id)) return '';
  const r = LADDER[ladderIndex(id)];
  return r.elite ? r.emoji : `${r.emoji}${['I', 'II', 'III', 'M'][r.div - 1]}`;
}

export const RANK_MODES = Object.freeze(['race', 'turns']);
const modeOf = (m) => (m === 'turns' ? 'turns' : 'race');

// ------------------------------------------------------------------------------- earning coins
export const EARN = Object.freeze({
  practicePerM: 1 / 5,       // Oefen: a coin for every 5 m
  dailyPerM: 1 / 4,          // Daaglikse Toring: a coin for every 4 m...
  dailyBonus: 10,            // ...and 10 for building it at all
  streakPerDay: 2,           // ...and 2 a day of streak, at most streakMax
  streakMax: 14,
  perPerfect: 1 / 5,         // a coin for every 5 Perfeks
  duel: Object.freeze({ liveWin: 15, liveLoss: 5, otherWin: 8, otherLoss: 2 }),
  dayCap: 150,               // coins a day from Oefen and duels (the daily tower always pays in full)
});

/**
 * The coins a finished game earns, before the day's cap: { coins, capped, parts: [{ id, coins }] }.
 * `capped` true: these count towards EARN.dayCap (Oefen and duels; the daily tower does not).
 * game: { mode: 'daily'|'practice'|'duel', heightM, perfects, streak, outcome, live }
 */
export function coinsForGame(game) {
  const g = game && typeof game === 'object' ? game : {};
  const h = Math.max(0, Number(g.heightM) || 0);
  const perfects = Math.max(0, Math.floor(Number(g.perfects) || 0));
  const parts = [];
  const add = (id, n) => {
    const c = Math.max(0, Math.floor(n));
    if (c > 0) parts.push({ id, coins: c });
  };
  if (g.mode === 'duel') {
    const d = EARN.duel;
    add(g.outcome === 'won' ? 'win' : 'played', g.outcome === 'won' ? (g.live ? d.liveWin : d.otherWin) : (g.live ? d.liveLoss : d.otherLoss));
  } else if (g.mode === 'daily') {
    add('height', h * EARN.dailyPerM);
    add('daily', EARN.dailyBonus);
    add('streak', Math.min(EARN.streakMax, Math.max(0, Math.floor(Number(g.streak) || 0)) * EARN.streakPerDay));
  } else {
    add('height', h * EARN.practicePerM);
  }
  if (g.mode !== 'duel') add('perfects', perfects * EARN.perPerfect);
  const coins = parts.reduce((s, p) => s + p.coins, 0);
  return { coins, capped: g.mode !== 'daily', parts };
}

// ------------------------------------------------------------------------------- the wallet
/** The player's coins, power-ups and looks, as stored (always valid). */
export function defaultEconomy() {
  return {
    coins: 0,
    earned: { day: null, n: 0 },
    stock: Object.fromEntries(POWERUP_IDS.map((id) => [id, 0])),
    owned: Object.fromEntries(COSMETIC_KINDS.map((k) => [k, [DEFAULT_LOOK[k]]])),
    look: { ...DEFAULT_LOOK },
    ranks: { race: cleanModeRank(null), turns: cleanModeRank(null) },   // (1.12) one rank per mode
    freeFoundation: null,   // the daily (date key) whose free Fondamentblok was used
  };
}

/** Rebuild a trustworthy economy object from whatever was stored. */
export function cleanEconomy(raw) {
  const e = defaultEconomy();
  const r = raw && typeof raw === 'object' ? raw : {};
  e.coins = Math.max(0, Math.min(MAX_COINS, Math.floor(Number(r.coins) || 0)));
  if (r.earned && isDateKey(r.earned.day)) e.earned = { day: r.earned.day, n: Math.max(0, Math.floor(Number(r.earned.n) || 0)) };
  for (const id of POWERUP_IDS) e.stock[id] = Math.max(0, Math.min(MAX_STOCK, Math.floor(Number(r.stock?.[id]) || 0)));
  for (const kind of COSMETIC_KINDS) {
    const list = Array.isArray(r.owned?.[kind]) ? r.owned[kind] : [];
    const owned = new Set([DEFAULT_LOOK[kind]]);
    for (const id of list) if (cosmetic(kind, id)) owned.add(id);
    e.owned[kind] = [...owned];
    const pick = r.look?.[kind];
    e.look[kind] = owned.has(pick) ? pick : DEFAULT_LOOK[kind];
  }
  // (1.12) a rank per mode; a wallet from before keeps its tier (migrateOldRank)
  if (r.ranks && typeof r.ranks === 'object') {
    for (const m of RANK_MODES) e.ranks[m] = cleanModeRank(r.ranks[m]);
  } else if (r.rank && typeof r.rank === 'object') {
    e.ranks = migrateOldRank(r.rank);
  }
  e.freeFoundation = isDateKey(r.freeFoundation) ? r.freeFoundation : null;
  return e;
}

/** Coins added on `dayKey` (the cap only applies to `capped` coins). Returns { economy, added }. */
export function earnCoins(eco, n, { capped = true, dayKey = null } = {}) {
  const e = cleanEconomy(eco);
  let want = Math.max(0, Math.floor(Number(n) || 0));
  if (capped && dayKey) {
    if (e.earned.day !== dayKey) e.earned = { day: dayKey, n: 0 };
    want = Math.min(want, Math.max(0, EARN.dayCap - e.earned.n));
    e.earned.n += want;
  }
  const added = Math.min(want, MAX_COINS - e.coins);
  e.coins += added;
  return { economy: e, added };
}

/** (1.12) Spend `n` coins on something that isn't a power-up or a look ("Nog 'n kans"): { economy, ok }. */
export function spendCoins(eco, n) {
  const e = cleanEconomy(eco);
  const cost = Math.max(0, Math.floor(Number(n) || 0));
  if (e.coins < cost) return { economy: e, ok: false };
  e.coins -= cost;
  return { economy: e, ok: true };
}

/** Buy one power-up: { economy, ok }. */
export function buyPowerup(eco, id) {
  const e = cleanEconomy(eco);
  const p = POWERUPS[id];
  if (!p || e.coins < p.price || e.stock[id] >= MAX_STOCK) return { economy: e, ok: false };
  e.coins -= p.price;
  e.stock[id] += 1;
  return { economy: e, ok: true };
}

/** Use one power-up from stock: { economy, ok }. */
export function usePowerup(eco, id) {
  const e = cleanEconomy(eco);
  if (!POWERUPS[id] || e.stock[id] <= 0) return { economy: e, ok: false };
  e.stock[id] -= 1;
  return { economy: e, ok: true };
}

/** Buy a look (never one that comes with a rank): { economy, ok }. */
export function buyCosmetic(eco, kind, id) {
  const e = cleanEconomy(eco);
  const c = cosmetic(kind, id);
  if (!c || c.rank || c.week || e.owned[kind].includes(id) || e.coins < c.price) return { economy: e, ok: false };
  e.coins -= c.price;
  e.owned[kind].push(id);
  return { economy: e, ok: true };
}

/** Wear a look the player owns: { economy, ok }. */
export function wearCosmetic(eco, kind, id) {
  const e = cleanEconomy(eco);
  if (!e.owned[kind]?.includes(id)) return { economy: e, ok: false };
  e.look[kind] = id;
  return { economy: e, ok: true };
}

/** The best tier this season in either mode (what the rank looks follow). */
export function bestTier(eco) {
  const e = cleanEconomy(eco);
  let k = 0;
  for (const m of RANK_MODES) k = Math.max(k, rankIndex(LADDER[ladderIndex(e.ranks[m].best)].tier));
  return RANK_IDS[k];
}

/** Unlock looks earned with a rank tier (a season badge; the Diamant frame). Returns a new economy. */
export function grantRankLooks(eco, rankId, { badge = null } = {}) {
  const e = cleanEconomy(eco);
  if (badge && cosmetic('badge', badge) && !e.owned.badge.includes(badge)) e.owned.badge.push(badge);
  for (const kind of COSMETIC_KINDS) {
    for (const c of COSMETICS[kind]) {
      if (c.rank && kind !== 'badge' && rankIndex(rankId) >= rankIndex(c.rank) && !e.owned[kind].includes(c.id)) e.owned[kind].push(c.id);
    }
  }
  return e;
}

// ------------------------------------------------------------------------------- the player card
/**
 * What a duel opponent sees of you: { frame, badge, title, celebration, style, rank }, every field
 * a known id (anything else becomes the default). Also used by the server before relaying a card.
 */
export function cleanCard(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const kind of COSMETIC_KINDS) out[kind] = cosmetic(kind, r[kind]) ? r[kind] : DEFAULT_LOOK[kind];
  out.rank = RANK_IDS.includes(r.rank) ? r.rank : 'brons';
  // (1.12) the rank in the mode being played, on the ladder of 23 (a 1.11 card has only the tier), and
  // both modes' ranks: a friend's link doesn't say the mode until the match starts
  out.rl = LADDER_IDS.includes(r.rl) ? r.rl : `${out.rank}-1`;
  const rk = r.rk && typeof r.rk === 'object' ? r.rk : {};
  out.rk = { race: LADDER_IDS.includes(rk.race) ? rk.race : out.rl, turns: LADDER_IDS.includes(rk.turns) ? rk.turns : out.rl };
  return out;
}

/** An opponent's card for a match in `mode`: its rank (`rl`, `rank`) is the one in that mode. */
export function cardForMode(card, mode) {
  const c = cleanCard(card);
  const rl = c.rk[modeOf(mode)];
  return { ...c, rl, rank: LADDER[ladderIndex(rl)].tier };
}

/** Robot Rikus's card. */
export const BOT_CARD = Object.freeze(cleanCard({ frame: 'see', badge: 'arend', title: 'hyskraanheld', celebration: 'vuurwerk', style: 'pet', rank: 'silwer', rl: 'silwer-2', rk: { race: 'silwer-2', turns: 'silwer-2' } }));

/** The card for an economy (what this player shows), with the rank in `mode` ('race' | 'turns'). */
export function cardOf(eco, mode = 'race') {
  const e = cleanEconomy(eco);
  const now = ladderAt(e.ranks[modeOf(mode)].points);
  const rk = { race: ladderAt(e.ranks.race.points).id, turns: ladderAt(e.ranks.turns.points).id };
  return cleanCard({ ...e.look, rank: now.tier, rl: now.id, rk });
}
