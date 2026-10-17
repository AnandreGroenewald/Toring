// (1.18 3D) Blokbotsing / Block Clash: every number of the battle in one place. Two towers on two sea stacks, the sea
// between them, each crown in a glass cabinet behind its tower. Each turn the crane offers three cards: a Stapel block
// with an element (🔥 Vuur, 🌿 Gras, 💧 Water, 💣 Plofstof). BUILD with it (the crane swings it over your tower, a tap
// drops it: Stapel's own stacking; its element defends) or THROW it: a power bar, then a direction pin (the owner,
// 17 Oct 2026: "a power bar then a direction pin ... It makes it more challenging"); its element strikes where it hits,
// and the thrown block breaks apart ("the block that is thrown disapears not part of their blocks").
// Physics units are Stapel's own: px (25 px a metre), y down, the sea's surface at y = 0.

export const PX = 25;   // px per metre (js/config.js PX_PER_M)
export const G_STEP = 1.1 * 0.001 * (1000 / 60) ** 2;   // Stapel's gravity, px per step² (Matter at 60 Hz)

/** The two sea stacks: side 0 at -x, side 1 at +x (64 m apart: both towers fit the battle view on a phone). */
export const STACK = { x: 800, topY: -300, w: 380, depth: 900 };
export const sideX = (side) => (side === 0 ? -STACK.x : STACK.x);
export const towardFoe = (side) => (side === 0 ? 1 : -1);

/**
 * Blocks, not turns (the owner, 17 Oct 2026): each side has `base` blocks, every build or throw spends one, a Perfek
 * build earns one back, each Perfek of today's Daily Tower adds one (at most `dailyMax` a game). Both out: sudden
 * death: both glass cabinets burst (the crowns light: "make it about the crown"), then a free throw each in turn (at
 * most `sudden` each); no crown in the sea after that: a draw.
 */
export const BUDGET = { base: 12, dailyMax: 4, rikusBonus: 2, perfectBack: 1, sudden: 4 };
export const TURNS_EACH = 12;   // (kept for older tests)

/** The blocks (Stapel's own shapes, each in its own Stapel colour) and the elements the crane offers. */
export const POOL = ['cube', 'plank', 'wedge', 'crate', 'pillar'];
export const SHAPE_COLOR = { cube: 2, plank: 6, wedge: 4, crate: 1, pillar: 5, slab: 3, brick: 0 };
export const ELEMENTS = ['vuur', 'gras', 'water', 'plof'];
/** A thrown block's weight and speed by shape (the heavy cube is a ram); a built cube is a heavy foundation. */
export const SHAPE_THROW = {
  cube: { density: 3, speed: 1 }, plank: { density: 1.5, speed: 1 }, wedge: { density: 1.8, speed: 1.03 },
  crate: { density: 1.3, speed: 1 }, pillar: { density: 1.6, speed: 1.06 },
};
export const BUILD_HEAVY = { cube: 2.2 };
/**
 * The elements (the owner, 17 Oct 2026: "the impackt needs to be Cooler ... grass fire etc", "the specials on the blocks
 * we throw or the blocks that we stack like a defence block"; his picks: all four).
 * vuur  THROW Veldbrand: what's within `ignite` px burns `secs` s, `dmg` at `first` s and then every `every` s (2 a burn),
 *       and catches what it touches; a Watervat's reach stays wet.
 *       BUILD Vuurmuur: the first shot that touches it burns to ash.
 * gras  THROW Rankgryp: vines grab up to `max` blocks within `r` px and drag them to the sea for `steps` steps.
 *       BUILD Rankanker: it and what it touches root together (heavier, grippier).
 * water THROW Vloedgolf: a wave shoves everything within `r` px along the throw, and puts out fire.
 *       BUILD Watervat: puts out fire within `r` px; the first shot that touches it splashes dead.
 * plof  THROW Plofstof: an explosion. BUILD Verrassing: the first shot that touches it flies back at them.
 */
export const ELEMENT = {
  vuur: { color: '#ff7a2a', ignite: 105, secs: 3.4, first: 0.6, every: 1.5, dmg: 1, spread: 0.45 },
  gras: { color: '#62d24a', r: 120, max: 2, pull: 0.32, down: 0.1, steps: 46, root: { density: 2.2, friction: 2.6, reach: 10 } },
  water: { color: '#3fb6ff', r: 175, dv: 7.5, barrel: { r: 140 } },
  plof: { color: '#ff4a3a', r: 200, dv: 11 },
};
/**
 * Each side starts with a small tower at the front of its stack: a plank, a slab, a cube. [shape, x offset, row]
 */
export const START = [['plank', 0, 0], ['slab', 0, 1], ['cube', 0, 2]];
/**
 * Where things stand on a stack, px towards the foe from its middle (the owner, 17 Oct 2026: "the crown needs to be
 * behind your tower not part of it"): the crown at the back, the tower in front of it as its shield.
 */
export const LAYOUT = { crown: -100, tower: 55 };
export const towerX = (side) => sideX(side) + towardFoe(side) * LAYOUT.tower;
export const CROWN = { w: 76, h: 58, density: 2.6 };
/**
 * A crown whose glass is gone is light and loose (the owner: "make it about the crown, you need to throw it off"; a
 * first measure had direct hits move an open crown 0-10 px, so games ended in draws): a direct hit knocks it along the
 * shot (`kick` + `perV` x the shot's speed, px a step, popped up by `lift`); vines pull it `vines` x, a wave shoves it
 * `wave` x, an explosion `blast` x as hard as a block. About two good hits put it off the rock.
 */
export const OPEN_CROWN = { kick: 3.6, perV: 0.1, lift: 2.6, vines: 1.6, wave: 1.5, blast: 1 };

/**
 * The throw: first the power bar runs up and down (`POWERBAR.period` s there and back, from `min`); a tap holds it.
 * Then the direction pin swings between `PIN.min` and `PIN.max` (eased at the ends); a tap lets go. The owner, 17 Oct
 * 2026: "I think it should go 180 degrees": a full half circle, flat forward to flat backward; a tap at the wrong moment
 * throws backwards (a dud: your own throw never burns or blows up your own tower). `period` s there and back.
 */
export const POWERBAR = { period: 1.7, min: 0.3 };
export const PIN = { min: 0, max: Math.PI, period: 4.4 };
/**
 * Launch: `out` px beyond the stack's edge towards the foe and `up` px above the tower's top. Speed (px a step) at full
 * power = V0 x (1 + perM x tower metres above the stack) x the shape's own factor: the taller the tower, the harder it
 * throws. At full power and 45° a throw carries about 1.3 times the distance to their tower.
 */
export const LAUNCH = { out: 46, up: 120, V0: 16.1, perM: 0.008, air: 0.0006, maxSteps: 620 };
/** A throw flies under this share of Stapel's gravity until it touches something: a slower, heavier arc. */
export const FLIGHT_G = 0.5;
/**
 * Wind (the owner, 17 Oct 2026, of Block Clash: "too simple"): each turn its own, pushing a throw sideways while it
 * flies (px a step², at most `max`; a turn in `calm` is still). Read it on the flags and the gauge, or miss. The
 * prediction (Rikus, the tests) flies through the same wind. `steps` gauge levels.
 */
export const WIND = { max: 0.024, calm: 0.22, steps: 5 };
/** The wind for a turn from the battle's random: 0 (calm) or ±(a third to all of max), as a px/step² push. */
export function windFor(rand) {
  if (rand() < WIND.calm) return 0;
  const k = 0.33 + 0.67 * rand();
  return (rand() < 0.5 ? -1 : 1) * Math.round(k * WIND.max * 10000) / 10000;
}
/** A thrown block breaks apart this many steps after its first touch (it pushes first). */
export const DISSOLVE_STEPS = 9;
/** A throw is Perfek when it runs into the foe's crown, or passes this close to it. */
export const PERFECT_NEAR = 46;
export const PERFECT_THROW_DENSITY = 1.4;

/** The build: the block hangs `hang` px above the top and the trolley swings; wider and faster with every block built. */
export const BUILD = { hang: 190, amp0: 110, ampPer: 24, ampMax: 215, w0: 1.6, wPer: 0.085, wMax: 3.4, carry: 0.3,
  perfectTol: 10, perfectFrac: 0.15, goodTol: 26, goodEase: 0.6 };
export const PERFECT_BUILD = { density: 1.5, frictionStatic: 2.4 };   // a Perfek block sits cemented: heavier, grippier

/** A turn ends when everything has been quiet this long (or after maxMs); fire and vines finish first. */
export const SETTLE = { speed: 0.14, ang: 0.005, steps: 36, maxMs: 9000, minMs: 900 };
/** Below the sea: a splash at the surface, gone from the physics at `gone` px down. */
export const SEA = { gone: 140 };

/** Robot Rikus: how far off his angle (degrees, early turns and later) and his power, how far off his drop (px). */
export const RIKUS = { aimSd: [2.6, 2.0], powerSd: 0.035, buildSd: 24, throwChance: 0.66, thinkMs: 1300 };

/** A seeded random (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = (list, rand) => {
  const p = list.slice();
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
};
/** Three cards for a turn: three different blocks, three different elements. */
export function offer(rand) {
  const s = shuffled(POOL, rand);
  const e = shuffled(ELEMENTS, rand);
  return [0, 1, 2].map((i) => ({ shape: s[i], element: e[i] }));
}
/** The direction pin's angle at time t (s): eased at both ends, like a swing. */
export function pinAngle(t) {
  const k = 0.5 - 0.5 * Math.cos((t / PIN.period) * Math.PI * 2);
  return PIN.min + (PIN.max - PIN.min) * k;
}
/** The power bar at time t (s): up and down at a steady pace, from POWERBAR.min to 1. */
export function powerAt(t) {
  const u = (t / (POWERBAR.period / 2)) % 2;
  const k = u < 1 ? u : 2 - u;
  return POWERBAR.min + (1 - POWERBAR.min) * k;
}
