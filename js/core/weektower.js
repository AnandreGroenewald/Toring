// (1.20) Die Weektoring as data: the tower a crew builds together all week with the crane (the owner, 24 Oct 2026: "use a
// crane to build ontop of the weekly tower"), floor by floor, each in the skin of whoever stacked it ("its what skin they
// have"), and what a Saturday bomb does to it. Pure rules, shared by the game, the server and the tests.
//
// A floor is one block as it came to rest: { id, s shape, k scale, c colour (PALETTE index), x, y (m: the middle of its
// bottom edge before it turned, from the tower's foot), r (rad, anticlockwise), q rating ('P' | 'G' | 'S'), sk skin,
// by builder, d day, a (m: how much it raised the tower when it was built), cr (a Perfek hit once: cracked), p people }.
// The list is in building order. A bomb hit:
//   - a Perfek floor (cemented) cracks first and goes on the second hit;
//   - any other floor is knocked out, and the tower above it drops into its place: the tower loses what that floor
//     added (`a`); a crooked (Skeef) floor takes the crooked floor straight above it with it;
//   - the people who lived in a knocked-out floor fall into the river.

export const PX = 25;   // the game's pixels per metre (js/config.js PX_PER_M)

/** Each shape's size in the game's pixels (js/game/blocks.js SHAPES), before its scale. */
export const SHAPE_PX = Object.freeze({
  plank: [200, 40], slab: [160, 48], brick: [128, 56], crate: [84, 84], cube: [60, 60], pillar: [52, 128],
  wedge: [150, 60], arch: [132, 88], L: [132, 88], J: [132, 88], T: [132, 88], log: [260, 50],
});
export const SHAPES = Object.freeze(Object.keys(SHAPE_PX));
/** Windows (rooms) a floor of each shape has (js/game/residents.js windowSlots, a block of scale 1). */
export const ROOMS = Object.freeze({ plank: 4, slab: 4, brick: 3, crate: 4, cube: 2, pillar: 3, wedge: 3, arch: 3, L: 4, J: 4, T: 4, log: 4 });

export const TOWER = Object.freeze({
  maxFloors: 600,       // a week's tower at most (3 builders x 6 days x 10 blocks + repairs is ~200)
  halfWidth: 14.5,      // m: a floor's middle is never further from the tower's line than the screen is wide
  climbMax: 75,         // m: a build turn's floors end at most this far above the tower's top
  stackTol: 0.35,       // m: a floor whose bottom is this close under another's top rests on it
  blast: 2,             // floors a bomb knocks out: the one it hits and the one on top of it (a Perfek cracks instead)
  restTol: 1.0,         // m: a new floor's foot may be at most this far above what's under it (else it floats: dropped)
});

const round = (v, d = 100) => Math.round(v * d) / d;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** A floor's width and height in metres. */
export function dimsOf(f) {
  const [w, h] = SHAPE_PX[f.s] || SHAPE_PX.cube;
  const k = finite(f.k) ? f.k : 1;
  return { W: Math.round(w * k) / PX, H: Math.round(h * k) / PX };
}

/** A floor's four corners (m), from its bottom edge's middle, turned by r. */
export function cornersOf(f) {
  const { W, H } = dimsOf(f);
  const c = Math.cos(f.r || 0);
  const s = Math.sin(f.r || 0);
  return [[-W / 2, 0], [W / 2, 0], [W / 2, H], [-W / 2, H]].map(([u, v]) => [f.x + u * c - v * s, f.y + u * s + v * c]);
}

export const topOf = (f) => Math.max(...cornersOf(f).map((p) => p[1]));
export const bottomOf = (f) => Math.min(...cornersOf(f).map((p) => p[1]));
const spanOf = (f) => {
  const xs = cornersOf(f).map((p) => p[0]);
  return [Math.min(...xs), Math.max(...xs)];
};

/** The tower's height (m): its highest floor's top (0 for an empty tower). */
export function heightOf(floors) {
  let h = 0;
  for (const f of floors || []) h = Math.max(h, topOf(f));
  return round(h);
}

/** What each floor added to the tower when it was built, in building order (the tower's top before and after it). */
export function withAdds(floors) {
  let top = 0;
  return floors.map((f) => {
    const t = topOf(f);
    const a = Math.max(0, t - top);
    top = Math.max(top, t);
    return { ...f, a: round(a) };
  });
}

/** Is (x, y) inside floor f (m)? */
export function contains(f, x, y) {
  const { W, H } = dimsOf(f);
  const c = Math.cos(-(f.r || 0));
  const s = Math.sin(-(f.r || 0));
  const dx = x - f.x;
  const dy = y - f.y;
  const u = dx * c - dy * s;
  const v = dx * s + dy * c;
  return Math.abs(u) <= W / 2 && v >= 0 && v <= H;
}

/** The floor a bomb landing at (x, y) hits (its index), or -1 (a miss). The newest wins where two overlap. */
export function floorAt(floors, x, y) {
  for (let i = floors.length - 1; i >= 0; i--) if (contains(floors[i], x, y)) return i;
  return -1;
}

/** The floor resting straight on top of floor i (lowest bottom over its top, overlapping it across), or -1. */
function floorOn(floors, i) {
  const f = floors[i];
  const top = topOf(f);
  const [l, r] = spanOf(f);
  let best = -1;
  let bestB = Infinity;
  floors.forEach((g, j) => {
    if (j === i) return;
    const b = bottomOf(g);
    const [gl, gr] = spanOf(g);
    if (b < top - TOWER.stackTol || b > top + TOWER.stackTol || gr <= l + 0.1 || gl >= r - 0.1) return;
    if (b < bestB) {
      bestB = b;
      best = j;
    }
  });
  return best;
}

/** Floor i knocked out: the floors above its top drop by what it added. Returns { floors, lost (m), people }. */
function knockOut(floors, i) {
  const f = floors[i];
  const drop = f.a || 0;
  const top = topOf(f);
  const out = [];
  floors.forEach((g, j) => {
    if (j === i) return;
    if (drop > 0 && bottomOf(g) >= top - TOWER.stackTol) out.push({ ...g, y: round(g.y - drop, 1000) });
    else out.push(g);
  });
  return { floors: withAdds(out), lost: drop, people: Math.max(0, f.p | 0), id: f.id };
}

/**
 * A bomb hit floor `i`: { floors, cracked (a Perfek took the bomb), removed: [ids], lost (m), people (into the river) }.
 * A Perfek that's whole cracks and takes the whole bomb. Anything else is knocked out, and the blast takes the floor on
 * top of it too (TOWER.blast floors; a whole Perfek in the blast cracks and stops it). Past the blast, a crooked (Skeef)
 * floor that went takes the crooked floor on top of it along. The tower above drops into the gap. A miss (i < 0)
 * changes nothing.
 */
export function hit(floors, i) {
  const none = { floors, cracked: false, removed: [], lost: 0, people: 0 };
  if (!Array.isArray(floors) || !(i >= 0) || i >= floors.length) return none;
  const f = floors[i];
  if (f.q === 'P' && !f.cr) {
    const next = floors.slice();
    next[i] = { ...f, cr: 1 };
    return { ...none, floors: next, cracked: true };
  }
  let cur = floors;
  const removed = [];
  let lost = 0;
  let people = 0;
  /** Knocks out the floor with this id; what it was and the id of the floor on top of it (before the drop). */
  const out = (id) => {
    const j = cur.findIndex((g) => g.id === id);
    const was = cur[j];
    const on = floorOn(cur, j);
    const topId = on >= 0 ? cur[on].id : null;
    const r = knockOut(cur, j);
    cur = r.floors;
    removed.push(r.id);
    lost += r.lost;
    people += r.people;
    return { was, topId };
  };
  let k = out(f.id);
  let blast = TOWER.blast - 1;
  while (k.topId !== null) {
    const j = cur.findIndex((g) => g.id === k.topId);
    if (j < 0) break;
    const g = cur[j];
    if (blast > 0) {
      blast--;
      if (g.q === 'P' && !g.cr) {
        cur = cur.slice();
        cur[j] = { ...g, cr: 1 };
        break;
      }
    } else if (!(k.was.q === 'S' && g.q === 'S')) break;
    k = out(g.id);
  }
  return { floors: cur, cracked: false, removed, lost: round(lost), people };
}

const RATINGS = new Set(['P', 'G', 'S']);
/**
 * A build turn's new floors from a phone, cleaned for the tower `floors` (null when they can't be right): at most `max`,
 * known shapes, real numbers, within the tower's width, not higher than its top + TOWER.climbMax. Each gets its id
 * (after the tower's highest), its builder, day and skin; the whole tower comes back with every floor's `a`.
 */
export function addFloors(floors, list, { max, by, day, skin, ids = null } = {}) {
  if (!Array.isArray(list) || list.length > (max ?? 10) || floors.length + list.length > TOWER.maxFloors) return null;
  const top = heightOf(floors);
  let next = floors.reduce((m, f) => Math.max(m, f.id | 0), 0);
  const add = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || !SHAPE_PX[raw.s]) return null;
    const f = {
      id: ids ? ids.shift() : ++next,
      s: raw.s,
      k: finite(raw.k) ? Math.max(0.4, Math.min(2, round(raw.k))) : 1,
      c: Number.isInteger(raw.c) && raw.c >= 0 && raw.c < 16 ? raw.c : 0,
      x: finite(raw.x) ? round(raw.x) : NaN,
      y: finite(raw.y) ? round(raw.y) : NaN,
      r: finite(raw.r) ? Math.round(raw.r * 1000) / 1000 : NaN,
      q: RATINGS.has(raw.q) ? raw.q : 'S',
      sk: skin || 'kleur',
      by: by || '',
      d: day || '',
      cr: 0,
      p: Math.max(0, Math.min(ROOMS[raw.s] || 2, raw.p | 0)),
    };
    if (![f.x, f.y, f.r].every(Number.isFinite) || Math.abs(f.x) > TOWER.halfWidth || f.y < -0.5) return null;
    if (topOf(f) > top + TOWER.climbMax) return null;
    add.push(f);
  }
  // (a turn's floors rest on the tower and on each other: one floating in the air, as no real turn leaves it, is dropped)
  let reach = top;
  const resting = [];
  for (const f of [...add].sort((a, b) => bottomOf(a) - bottomOf(b))) {
    if (bottomOf(f) > reach + TOWER.restTol) continue;
    reach = Math.max(reach, topOf(f));
    resting.push(f);
  }
  return withAdds([...floors, ...add.filter((f) => resting.includes(f))]);
}

/** The tower's people (the floors' rooms). */
export const peopleIn = (floors) => (floors || []).reduce((n, f) => n + (f.p | 0), 0);

/** Up to `n` people moved into the tower's free rooms, lowest floors first (rescued people coming home). Returns { floors, placed }. */
export function moveIn(floors, n) {
  let left = Math.max(0, n | 0);
  const out = floors.map((f) => {
    if (!left) return f;
    const room = (ROOMS[f.s] || 2) - (f.p | 0);
    if (room <= 0) return f;
    const k = Math.min(room, left);
    left -= k;
    return { ...f, p: (f.p | 0) + k };
  });
  return { floors: out, placed: Math.max(0, n | 0) - left };
}

/** A floor as stored or sent (the few numbers, nothing else). */
export function cleanFloor(f) {
  if (!f || typeof f !== 'object' || !SHAPE_PX[f.s]) return null;
  const n = ['k', 'x', 'y', 'r', 'a'].every((k) => finite(f[k]));
  if (!n || !Number.isInteger(f.id)) return null;
  return {
    id: f.id, s: f.s, k: f.k, c: f.c | 0, x: f.x, y: f.y, r: f.r, q: RATINGS.has(f.q) ? f.q : 'S',
    sk: typeof f.sk === 'string' ? f.sk.slice(0, 16) : 'kleur', by: typeof f.by === 'string' ? f.by.slice(0, 12) : '',
    d: typeof f.d === 'string' ? f.d.slice(0, 10) : '', a: f.a, cr: f.cr ? 1 : 0, p: Math.max(0, Math.min(4, f.p | 0)),
  };
}
