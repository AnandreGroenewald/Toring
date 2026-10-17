// (1.17 3D) Die Kasteelreeks: a castle's defence plan (the owner, 16 Oct 2026: "The oponent needs to be able to strategize
// what is the best way to defend if they are offline"). The plan says which of the owner's Daily towers stands in the
// middle as the keep (the flag flies there), and what stands on which spot: archers, spearmen and knights on the walls,
// the tower tops and behind the gate; boiling oil over the gate; a ballista on a tower top; spikes before the gate. While
// the owner is away the plan fights for them. Kept on the phone under `stapel.v1.kasteel` (with the castle's seed).
import { EARN } from '../core/economy.js';
import { dateKeyFor } from '../core/daily.js';

export const STORE_KEY = 'stapel.v1.kasteel';

/** What may stand where, and what each costs from the budget (the names: text.js `pieces`). */
export const PIECES = Object.freeze({
  boog: { cost: 1, on: ['wall', 'top'] },
  spies: { cost: 1, on: ['wall', 'top', 'gate'] },
  ridder: { cost: 2, on: ['gate'] },
  olie: { cost: 2, on: ['oil'] },
  ballista: { cost: 3, on: ['top'] },
  pieke: { cost: 1, on: ['field'] },
});
export const BUDGET = 16;
/** The budget grows with the Daily Towers you've played (2 more for each, up to 5): playing the Daily makes your castle stronger. */
export const budgetFor = (realTowers) => BUDGET + 2 * Math.max(0, Math.min(5, realTowers | 0));

/** The spots of a castle (ids and kinds): front-wall spots, tower tops (0 = the keep), behind the gate, the oil over the gate, the field. */
export function spotIds(castle) {
  const out = [];
  castle.spots.wall.forEach((p, i) => out.push({ id: `w${i}`, kind: 'wall', p }));
  castle.spots.towers.forEach((p, i) => out.push({ id: `t${i}`, kind: 'top', p, tower: i }));
  (castle.spots.gate || []).forEach((p, i) => out.push({ id: `g${i}`, kind: 'gate', p }));
  if (castle.spots.oil) out.push({ id: 'oil', kind: 'oil', p: castle.spots.oil });
  (castle.spots.field || []).forEach((p, i) => out.push({ id: `f${i}`, kind: 'field', p }));
  return out;
}

/** Robot Rikus's way (and a new player's first plan): archers on the walls and tops, two knights behind the gate, oil. */
export function defaultPlan(castle) {
  const place = {};
  castle.spots.wall.forEach((_, i) => { place[`w${i}`] = 'boog'; });
  castle.spots.towers.forEach((_, i) => { if (i < 3) place[`t${i}`] = i % 2 ? 'spies' : 'boog'; });
  place.g0 = 'ridder';
  place.g1 = 'ridder';
  place.oil = 'olie';
  place.t2 = 'ballista';
  return { keep: 0, place };
}

export const costOf = (plan) => Object.values(plan.place || {}).reduce((s, k) => s + (PIECES[k]?.cost || 0), 0);

export function loadPlan() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (v && typeof v === 'object' && v.plan && typeof v.plan.place === 'object') return v;
  } catch { /* none yet */ }
  return null;
}
export function savePlan(data) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), ...data, saved: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}
/** The whole record as kept (the plan may not be there yet). */
export function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
}
/** First-time help: has tip `k` been seen; mark it seen. */
export const helpSeen = (k) => !!readStore().help?.[k];
export function markHelp(k) {
  try {
    const v = readStore();
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...v, help: { ...(v.help || {}), [k]: 1 } }));
  } catch { /* the tip shows again: no harm */ }
}
/** The owner's castle seed (their towers stay the same between visits, until the real Daily layouts are kept). */
export function mySeed() {
  const v = loadPlan();
  if (v && Number.isFinite(v.seed)) return v.seed;
  return 1000 + Math.floor(Math.random() * 90000);
}

/** The owner's own Daily Towers as the castle keeps them (main.js saves each day's best try): newest first, up to `n`. */
export const DAYS_KEY = 'stapel.v1.kasteeldae';
// a block's rating in the game → its stone in the castle (the clown's gift: sandstone; a cemented foundation: granite)
const STONE = { P: 'P', G: 'G', S: 'S', X: 'S', B: 'G', F: 'P' };
export function myDays(n = 5) {
  return myDayInfo(n).map((d) => d.layout);
}
/** The same, with each day's date and height: [{ dateKey, h, layout }]. */
export function myDayInfo(n = 5) {
  try {
    const all = JSON.parse(localStorage.getItem(DAYS_KEY) || '{}') || {};
    return Object.keys(all).sort().reverse().slice(0, n)
      .map((k) => ({ dateKey: k, h: all[k].h, layout: (all[k].b || []).map((b) => ({ shape: b.s, scale: b.k, x: b.x, y: b.y, rot: b.r, rating: STONE[b.q] || 'S' })) }))
      .filter((d) => d.layout.length);
  } catch {
    return [];
  }
}

/**
 * (1.17) What a siege of Robot Rikus's castle wins: coins for Stapel's wallet like Oefen and the Uitdagersreeks (they
 * count towards the same day's cap, EARN.dayCap) and the castle's own trophies. Testing your own castle wins nothing.
 */
export const LOOT = Object.freeze({ base: 5, perStar: 10, trophiesPerStar: 10, lossTrophies: -5 });
export const lootFor = (stars) => ({ coins: LOOT.base + LOOT.perStar * stars, trophies: stars ? LOOT.trophiesPerStar * stars : LOOT.lossTrophies });
/** The castle's tally: { trophies, wins, played, pending (coins still to reach the wallet) }. */
export function castleStats() {
  const v = readStore();
  return { trophies: Math.max(0, v.trophies | 0), wins: Math.max(0, v.wins | 0), played: Math.max(0, v.played | 0), pending: Math.max(0, v.pending | 0) };
}
/** Coins still allowed today under the day's cap (the wallet as Stapel keeps it, less what already waits to reach it). */
function capLeft(pending) {
  let n = 0;
  try {
    const e = JSON.parse(localStorage.getItem('stapel.v1.econ') || 'null');
    if (e?.earned?.day === dateKeyFor()) n = Math.max(0, e.earned.n | 0);
  } catch { /* a new wallet */ }
  return Math.max(0, EARN.dayCap - n - pending);
}
/**
 * A finished siege of Robot Rikus's castle: the trophies count here at once; the coins wait in `pending` until Stapel
 * itself adds them to the wallet (js/main.js, the next time Stapel opens: one place keeps the wallet). Returns
 * { coins (what will land), trophies, capped (the day's cap took some) }.
 */
export function recordSiege(stars) {
  const r = lootFor(stars);
  try {
    const v = readStore();
    const pending = Math.max(0, v.pending | 0);
    const coins = Math.min(r.coins, capLeft(pending));
    v.trophies = Math.max(0, (v.trophies | 0) + r.trophies);
    v.played = (v.played | 0) + 1;
    if (stars) v.wins = (v.wins | 0) + 1;
    v.pending = Math.min(5000, pending + coins);
    localStorage.setItem(STORE_KEY, JSON.stringify(v));
    return { coins, trophies: r.trophies, capped: coins < r.coins };
  } catch {
    return { coins: 0, trophies: 0, capped: false };   // (this phone keeps nothing: nothing to win)
  }
}
