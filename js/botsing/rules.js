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
export const STACK = { x: 1000, topY: -300, w: 330, depth: 900 };
export const sideX = (side) => (side === 0 ? -STACK.x : STACK.x);
export const towardFoe = (side) => (side === 0 ? 1 : -1);

/** One battle: 12 turns each, you first. Both crowns still up after the last turn: the higher crown wins. */
export const TURNS_EACH = 12;

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
export const START = [['plank', 0, 0], ['cube', -70, 1], ['crown', 0, 1], ['cube', 70, 1], ['plank', 0, 2]];
export const CROWN = { w: 76, h: 58, density: 2.6 };

/** The throw: the arc sweeps between these angles (above the horizontal), there and back in `period` seconds. */
export const AIM = { min: (11 * Math.PI) / 180, max: (84 * Math.PI) / 180, period: 5.6 };   // (84°: a very tall tower can still lob onto theirs)
/**
 * Launch: from the crane's jib tip, `out` px beyond the stack's edge towards the foe and `up` px above the tower's top.
 * Speed (px a step) = V0 x (1 + perM x tower metres above the stack) x (1 + lookouts) x the shape's own factor:
 * the taller the tower, the harder and further it throws.
 */
export const LAUNCH = { out: 46, up: 120, V0: 25.6, perM: 0.008, air: 0.0006, maxSteps: 420 };
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
