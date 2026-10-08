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
/** A season is a calendar month (South African dates); rank points come from duels. */
export const RANKS = Object.freeze([
  { id: 'brons', min: 0, emoji: '🥉' },
  { id: 'silwer', min: 100, emoji: '🥈' },
  { id: 'goud', min: 250, emoji: '🥇' },
  { id: 'platinum', min: 450, emoji: '💠' },
  { id: 'diamant', min: 700, emoji: '💎' },
]);
export const RANK_IDS = Object.freeze(RANKS.map((r) => r.id));
export const RANK_POINTS = Object.freeze({ liveWin: 25, liveLoss: -10, otherWin: 10, otherLoss: -5 });

/** The rank for some points, and how far to the next one ({ ...rank, next|null, toNext }). */
export function rankFor(points) {
  const p = Math.max(0, Math.floor(Number(points) || 0));
  let k = 0;
  while (k + 1 < RANKS.length && p >= RANKS[k + 1].min) k++;
  const next = RANKS[k + 1] || null;
  return { ...RANKS[k], next, toNext: next ? next.min - p : 0 };
}

export const rankIndex = (id) => Math.max(0, RANK_IDS.indexOf(id));

/** 'YYYY-MM' for a date key ('2026-10-08' -> '2026-10'), or null. */
export const seasonOf = (dateKey) => (isDateKey(dateKey) ? dateKey.slice(0, 7) : null);

/**
 * A new season began: points halve (a head start, not a fresh climb), and the season that ended
 * leaves a badge for the best rank reached in it. Returns { rank, reward } (reward: a badge id or null).
 */
export function rolloverSeason(rank, season) {
  const r = cleanRank(rank);
  if (!season || r.season === season) return { rank: r, reward: null };
  if (!r.season) return { rank: { ...r, season, best: rankFor(r.points).id }, reward: null };
  const reward = `s-${r.best}`;
  const points = Math.floor(r.points / 2);
  return { rank: { season, points, best: rankFor(points).id }, reward };
}

/** A finished duel: 'won'/'lost', against a live player ('live') or a recording / Robot Rikus. */
export function rankAfterMatch(rank, { outcome, live, season }) {
  const rolled = rolloverSeason(rank, season);
  const r = rolled.rank;
  const delta = outcome === 'won'
    ? (live ? RANK_POINTS.liveWin : RANK_POINTS.otherWin)
    : (live ? RANK_POINTS.liveLoss : RANK_POINTS.otherLoss);
  const points = Math.max(0, r.points + delta);
  const now = rankFor(points);
  const best = rankIndex(now.id) > rankIndex(r.best) ? now.id : r.best;
  return { rank: { season: r.season, points, best }, delta: points - r.points, reward: rolled.reward, up: now.id !== rankFor(r.points).id && rankIndex(now.id) > rankIndex(rankFor(r.points).id) };
}

function cleanRank(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const points = Math.max(0, Math.min(99999, Math.floor(Number(r.points) || 0)));
  const best = RANK_IDS.includes(r.best) ? r.best : rankFor(points).id;
  return { season: typeof r.season === 'string' && /^\d{4}-\d{2}$/.test(r.season) ? r.season : null, points, best };
}

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
    rank: { season: null, points: 0, best: 'brons' },
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
  e.rank = cleanRank(r.rank);
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
  if (!c || c.rank || e.owned[kind].includes(id) || e.coins < c.price) return { economy: e, ok: false };
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

/** Unlock looks earned with a rank (a season badge; the Diamant frame). Returns a new economy. */
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
  return out;
}

/** Robot Rikus's card. */
export const BOT_CARD = Object.freeze(cleanCard({ frame: 'see', badge: 'arend', title: 'hyskraanheld', celebration: 'vuurwerk', style: 'pet', rank: 'silwer' }));

/** The card for an economy (what this player shows). */
export function cardOf(eco) {
  const e = cleanEconomy(eco);
  return cleanCard({ ...e.look, rank: rankFor(e.rank.points).id });
}
