// (1.17 3D) Die Kasteelreeks: a castle's defence plan (the owner, 16 Oct 2026: "The oponent needs to be able to strategize
// what is the best way to defend if they are offline"). The plan says which of the owner's Daily towers stands in the
// middle as the keep (the flag flies there), and what stands on which spot: archers, spearmen and knights on the walls,
// the tower tops and behind the gate; boiling oil over the gate; a ballista on a tower top; spikes before the gate. While
// the owner is away the plan fights for them. Kept on the phone under `stapel.v1.kasteel` (with the castle's seed).
export const STORE_KEY = 'stapel.v1.kasteel';

/** What may stand where, and what each costs from the budget. */
export const PIECES = Object.freeze({
  boog: { name: 'Boogskutter', cost: 1, on: ['wall', 'top'] },
  spies: { name: 'Spiesman', cost: 1, on: ['wall', 'top', 'gate'] },
  ridder: { name: 'Ridder', cost: 2, on: ['gate'] },
  olie: { name: 'Kookolie', cost: 2, on: ['oil'] },
  ballista: { name: 'Ballista', cost: 3, on: ['top'] },
  pieke: { name: 'Pieke', cost: 1, on: ['field'] },
});
export const BUDGET = 16;

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
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...data, saved: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}
/** The owner's castle seed (their towers stay the same between visits, until the real Daily layouts are kept). */
export function mySeed() {
  const v = loadPlan();
  if (v && Number.isFinite(v.seed)) return v.seed;
  return 1000 + Math.floor(Math.random() * 90000);
}
