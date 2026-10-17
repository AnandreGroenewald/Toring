// (1.17) Die Kasteelreeks: the rules both the phone and the server keep (no screen, no storage: importable in node).
// What may stand where and what it costs, the budget, a siege's loot, and the check a castle passes before a friend's
// phone builds it (server/src/kasteel.js keeps castles for friends to attack while their owner is away).

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
/** Robot Rikus's way, and every castle's plan until its owner saves one: archers on the walls and tops, a ballista, two knights, oil (15). */
export const STARTER_PLAN = Object.freeze({ keep: 0, place: Object.freeze({ w0: 'boog', w1: 'boog', w2: 'boog', w3: 'boog', t0: 'boog', t1: 'spies', t2: 'ballista', g0: 'ridder', g1: 'ridder', oil: 'olie' }) });
export const costOf = (plan) => Object.values(plan?.place || {}).reduce((s, k) => s + (PIECES[k]?.cost || 0), 0);

/**
 * What a siege wins (Robot Rikus's castle or a friend's): coins for Stapel's wallet like Oefen and the Uitdagersreeks
 * (they count towards the same day's cap) and the castle's own trophies. Testing your own castle wins nothing.
 */
export const LOOT = Object.freeze({ base: 5, perStar: 10, trophiesPerStar: 10, lossTrophies: -5 });
export const lootFor = (stars) => ({ coins: LOOT.base + LOOT.perStar * stars, trophies: stars ? LOOT.trophiesPerStar * stars : LOOT.lossTrophies });

// ------------------------------------------------------------------------------------------------ a castle's check
export const SHAPE_IDS = Object.freeze(['plank', 'slab', 'brick', 'crate', 'cube', 'floor', 'log', 'pillar', 'wedge', 'arch', 'L', 'J', 'T']);
const RATINGS = ['P', 'G', 'S', 'X', 'B', 'F'];
export const CASTLE = Object.freeze({ days: 5, blocks: 120, news: 20 });
const SPOT = /^(w\d{1,2}|t\d|g\d|oil|f\d)$/;
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 1000) / 1000 : null);
const isDateKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);

/** One kept Daily Tower ({ dateKey, h, b: [{ s, k, x, y, r, q }] }, as js/main.js keeps them), cleaned; null if nothing is left. */
export function cleanDay(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.b)) return null;
  const b = [];
  for (const x of d.b.slice(0, CASTLE.blocks)) {
    if (!x || !SHAPE_IDS.includes(x.s)) continue;
    const k = x.k == null ? 1 : num(x.k, 0.2, 4);
    const px = num(x.x, -60, 60);
    const py = num(x.y, -5, 400);
    const r = num(x.r, -7, 7);
    if (k == null || px == null || py == null || r == null) continue;
    b.push({ s: x.s, k, x: px, y: py, r, q: RATINGS.includes(x.q) ? x.q : 'S' });
  }
  if (!b.length) return null;
  return { dateKey: isDateKey(d.dateKey) ? d.dateKey : null, h: num(d.h, 0, 2000) ?? 0, b };
}

/**
 * A castle as it may travel to a friend's phone: { seed, keep, place, days }. The days: up to five of the owner's
 * kept Daily Towers (newest first); the plan: which tower is the keep and what stands on which spot, within the
 * budget those towers give. Anything that doesn't fit the rules is left out; null if it isn't a castle at all.
 */
export function cleanCastle(c) {
  if (!c || typeof c !== 'object') return null;
  const seed = Number.isInteger(c.seed) && c.seed > 0 && c.seed < 1e9 ? c.seed : null;
  if (seed == null) return null;
  const days = (Array.isArray(c.days) ? c.days : []).slice(0, CASTLE.days).map(cleanDay).filter(Boolean);
  const keep = Number.isInteger(c.keep) && c.keep >= 0 && c.keep < 5 ? c.keep : 0;
  const place = {};
  let cost = 0;
  const budget = budgetFor(days.length);
  for (const [id, kind] of Object.entries(c.place && typeof c.place === 'object' ? c.place : {}).slice(0, 40)) {
    if (!SPOT.test(id) || !PIECES[kind]) continue;
    if (cost + PIECES[kind].cost > budget) continue;
    cost += PIECES[kind].cost;
    place[id] = kind;
  }
  return { seed, keep, place, days };
}
