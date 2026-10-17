// (1.18 3D) Blokbotsing / Block Clash: every number of the battle in one place. Two towers on two sea stacks, the sea
// between them. Each turn the crane offers 3 blocks; you pick one and either BUILD with it (the crane swings it over your
// tower, a tap drops it: Stapel's own stacking) or THROW it (the crane slings it across the water along a dotted arc, a
// tap lets go). Every shape has a build power and a throw power. Your crown falls into the sea: you lose.
// The owner's design, 17 Oct 2026 (memory stapel-block-clash-idea); this is the small round vs Robot Rikus that Bob asked
// for first (no clans, no diamond, no online play yet).
// Physics units are Stapel's own: px (25 px a metre), y down, the sea's surface at y = 0.

export const PX = 25;   // px per metre (js/config.js PX_PER_M)
export const G_STEP = 1.1 * 0.001 * (1000 / 60) ** 2;   // Stapel's gravity, px per step² (Matter at 60 Hz)

/** The two sea stacks: side 0 (you) at -x, side 1 (Robot Rikus) at +x. Their flat tops are where the towers stand. */
export const STACK = { x: 1000, topY: -300, w: 380, depth: 900 };
export const sideX = (side) => (side === 0 ? -STACK.x : STACK.x);
export const towardFoe = (side) => (side === 0 ? 1 : -1);

/**
 * Blocks, not turns (the owner, 17 Oct 2026: "rather than making it 12 rounds lets make it just a certain amount of
 * blocks"; "Lets make it about the crown, you need to throw it off"): each side has `base` blocks, every build or throw
 * spends one, a Perfek build earns one back, each Perfek of today's Daily Tower adds one (at most `dailyMax` a game).
 * When both are out: sudden death, a free throw each in turn (at most `sudden` each); no crown in the sea: a draw.
 */
export const BUDGET = { base: 12, dailyMax: 4, rikusBonus: 2, perfectBack: 1, sudden: 3 };
export const TURNS_EACH = 12;   // (kept for older tests)

/** The blocks the crane offers (three different ones a turn), Stapel's own shapes. */
export const POOL = ['cube', 'plank', 'wedge', 'crate', 'pillar'];

/**
 * Each shape's two powers (the owner's table, 17 Oct 2026).
 * build: density = heavier once built (harder to push); spikes = a thrown block that touches it shatters;
 *        spring = a thrown block that touches it is flung back (once); lookout = every standing pillar adds this much
 *        throwing power.
 * throw: density = mass of the shot; speed = launch speed factor; skip = bounces off the water once;
 *        pierce = breaks this many enemy blocks it touches and flies on; blast = explodes on its first touch.
 */
export const POWERS = {
  cube: { build: { density: 3 }, throw: { density: 3, speed: 1 } },
  plank: { build: { density: 1.2 }, throw: { density: 1.6, speed: 1, skip: 1 } },
  wedge: { build: { spikes: true }, throw: { density: 1.8, speed: 1.04, pierce: 1 } },
  crate: { build: { spring: true }, throw: { density: 1, speed: 1, blast: { r: 230, dv: 14 } } },
  pillar: { build: { lookout: 0.07 }, throw: { density: 1.5, speed: 1.2 } },
};
/**
 * Each side starts with a small fort round its crown: a plank on the rock, the crown in the middle with a cube either side,
 * and a plank roof over them. A crown in the open falls to one good throw; this one has to be broken into first.
 * [shape, x offset from the stack's middle, which row]
 */
export const START = [['plank', 0, 0], ['slab', 0, 1], ['cube', 0, 2]];
/**
 * Where things stand on a stack, px towards the foe from its middle (the owner, 17 Oct 2026: "the crown needs to be
 * behind your tower not part of it"): the crown at the back, the tower in front of it as its shield.
 */
export const LAYOUT = { crown: -100, tower: 55 };
export const towerX = (side) => sideX(side) + towardFoe(side) * LAYOUT.tower;
export const CROWN = { w: 76, h: 58, density: 2.6 };

/** The throw: the arc sweeps between these angles (above the horizontal), there and back in `period` seconds. */
export const AIM = { min: (11 * Math.PI) / 180, max: (84 * Math.PI) / 180, period: 5.6 };   // (84°: a very tall tower can still lob onto theirs)
/**
 * Launch: from the crane's jib tip, `out` px beyond the stack's edge towards the foe and `up` px above the tower's top.
 * Speed (px a step) = V0 x (1 + perM x tower metres above the stack) x (1 + lookouts) x the shape's own factor:
 * the taller the tower, the harder and further it throws.
 */
export const LAUNCH = { out: 46, up: 120, V0: 18.4, perM: 0.008, air: 0.0006, maxSteps: 620 };
/** A throw flies under this share of Stapel's gravity until it touches something: a slower, heavier arc (the owner:
 * "you should not be able to throw that quick"); what it knocks over falls as fast as ever. */
export const FLIGHT_G = 0.5;
/**
 * The pull (the owner, 17 Oct 2026: "The gooi is not interactive it feels so boring" → pull back and let go): drag
 * back from anywhere; the pull (metres in the battle's plane) sets the angle (opposite the pull) and the power
 * (its length / max). Shorter than `min`: no throw (let go to put it back).
 */
export const PULL = { max: 5.5, min: 0.7, powerMin: 0.22, angleMin: (3 * Math.PI) / 180, angleMax: (86 * Math.PI) / 180, show: 0.6 };
/** A throw is Perfek when its arc (as drawn at the tap) runs into the foe's crown, or passes this close to it. */
export const PERFECT_NEAR = 46;
export const PERFECT_THROW_DENSITY = 1.4;

/** The build: the block hangs `hang` px above the top and the trolley swings; wider and faster with every block built. */
export const BUILD = { hang: 190, amp0: 110, ampPer: 24, ampMax: 215, w0: 1.6, wPer: 0.085, wMax: 3.4, carry: 0.3,
  perfectTol: 10, perfectFrac: 0.15, goodTol: 26, goodEase: 0.6 };
export const PERFECT_BUILD = { density: 1.5, frictionStatic: 2.4 };   // a Perfek block sits cemented: heavier, grippier

/** A turn ends when everything has been quiet this long (or after maxMs). */
export const SETTLE = { speed: 0.14, ang: 0.005, steps: 36, maxMs: 7500, minMs: 900 };
/** Below the sea: a splash at the surface, gone from the physics at `gone` px down. */
export const SEA = { gone: 140 };

/** Robot Rikus: how far off his aim (degrees, early turns and later), how far off his drop (px), how often he throws. */
export const RIKUS = { aimSd: [4.2, 3.2], buildSd: 24, throwChance: 0.66, thinkMs: 1100 };

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
/** Three different blocks for a turn. */
export function offer(rand) {
  const p = POOL.slice();
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p.slice(0, 3);
}
/** The arc's angle at time t (s) of a sweep: eased at both ends, like a swing. */
export function aimAngle(t) {
  const k = 0.5 - 0.5 * Math.cos((t / AIM.period) * Math.PI * 2);
  return AIM.min + (AIM.max - AIM.min) * k;
}
