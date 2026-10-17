// Blocks: shape geometry, generated textures, Matter bodies and the Block
// game object. Shapes are defined in bbox-local px (top-left origin). Every
// body is built in those same local coordinates, so the image origin sits
// exactly on the body's centroid (centre of mass) and image + body coincide.

import { PHYSICS, PALETTE, DEPTH, FONT } from '../config.js';
import { SHAPE_NAMES } from '../core/strings.js';
import { ensureWindows, whenPortraits } from './residents.js';

const PAD = 3;             // transparent texture padding around the shape
const CORNER_R = 6;        // visual corner radius (physics corners stay sharp)
const CELL = 44;           // L / J / T cell size
// Cement: a set block is drawn a little darker and cooler, so it is plain which part of the tower can
// still move (1.12; the owner: "something does not add up" about a leaning tower that never fell)
export const FROZEN_TINT = 0xb9c1cc;

// Texture cache housekeeping: textures not used by a live block and not
// requested recently are dropped once the cache grows past TEX_CACHE_MAX.
const TEX_CACHE_MAX = 96;
const TEX_CACHE_KEEP = 64;
const TEX_RECENT = 16;

const Mt = () => Phaser.Physics.Matter.Matter;

const R = (x, y, w, h) => ({ x, y, w, h });
const P = (x, y) => ({ x, y });
const rectOutline = (w, h) => [P(0, 0), P(w, 0), P(w, h), P(0, h)];

/**
 * Base shape table (before scale). `parts` are the physics rects, `cells`
 * the visual cells (default: parts), `poly` a convex polygon, `outline`
 * the silhouette used for the texture.
 */
export const SHAPES = {
  plank: { w: 200, h: 40, parts: [R(0, 0, 200, 40)] },
  slab: { w: 160, h: 48, parts: [R(0, 0, 160, 48)] },
  brick: { w: 128, h: 56, parts: [R(0, 0, 128, 56)] },
  crate: { w: 84, h: 84, parts: [R(0, 0, 84, 84)], uniform: true },
  cube: { w: 60, h: 60, parts: [R(0, 0, 60, 60)], uniform: true },
  // (1.16, Die Lewende Toring) a floor of the Living Tower: three rooms wide; never in a daily sequence (SHAPE_IDS)
  floor: { w: 300, h: 96, parts: [R(0, 0, 300, 96)], uniform: true },
  pillar: { w: 52, h: 128, parts: [R(0, 0, 52, 128)] },
  wedge: { w: 150, h: 60, poly: [P(30, 0), P(120, 0), P(150, 60), P(0, 60)] },
  // the U: it stands on its flat beam, with a shallow cup on top (testers found the old arch on two
  // legs too hard to land). Its body is one solid block, so whatever lands on it rests on the posts'
  // height and never drops into the cup (a T's narrow foot did); the cup is drawn, narrower than any block.
  arch: {
    w: 132, h: 88,
    parts: [R(0, 0, 132, 88)],
    cells: [R(0, 26, 132, 62), R(0, 0, 56, 26), R(76, 0, 56, 26)],
    outline: [P(0, 0), P(56, 0), P(56, 26), P(76, 26), P(76, 0), P(132, 0), P(132, 88), P(0, 88)],
  },
  L: {
    w: 132, h: 88,
    parts: [R(0, CELL, 132, CELL), R(0, 0, CELL, CELL)],
    cells: [R(0, 0, CELL, CELL), R(0, CELL, CELL, CELL), R(CELL, CELL, CELL, CELL), R(2 * CELL, CELL, CELL, CELL)],
    outline: [P(0, 0), P(44, 0), P(44, 44), P(132, 44), P(132, 88), P(0, 88)],
  },
  J: {
    w: 132, h: 88,
    parts: [R(0, CELL, 132, CELL), R(2 * CELL, 0, CELL, CELL)],
    cells: [R(2 * CELL, 0, CELL, CELL), R(0, CELL, CELL, CELL), R(CELL, CELL, CELL, CELL), R(2 * CELL, CELL, CELL, CELL)],
    outline: [P(88, 0), P(132, 0), P(132, 88), P(0, 88), P(0, 44), P(88, 44)],
  },
  // Hanswors's big log (never in the block sequence): a wide, steady new floor on top of the tower
  log: { w: 260, h: 50, parts: [R(0, 0, 260, 50)] },
  T: {
    w: 132, h: 88,
    parts: [R(0, 0, 132, CELL), R(CELL, CELL, CELL, CELL)],
    cells: [R(0, 0, CELL, CELL), R(CELL, 0, CELL, CELL), R(2 * CELL, 0, CELL, CELL), R(CELL, CELL, CELL, CELL)],
    outline: [P(0, 0), P(132, 0), P(132, 44), P(88, 44), P(88, 88), P(44, 88), P(44, 44), P(0, 44)],
  },
};
for (const id of Object.keys(SHAPES)) SHAPES[id].name = SHAPE_NAMES[id] || id;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const geomCache = new Map();

/** Area-weighted centroid of rects (matches Matter's compound centre for equal density). */
function rectsCentroid(rects) {
  let a = 0;
  let sx = 0;
  let sy = 0;
  for (const r of rects) {
    const ar = r.w * r.h;
    a += ar;
    sx += (r.x + r.w / 2) * ar;
    sy += (r.y + r.h / 2) * ar;
  }
  return { x: sx / a, y: sy / a };
}

/** Polygon area centroid (same formula as Matter's Vertices.centre). */
function polyCentroid(pts) {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cr = p.x * q.y - q.x * p.y;
    a2 += cr;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

/**
 * Scaled geometry for a BlockSpec. Coordinates are integers (edges rounded) so
 * the texture and the physics body share exactly the same outline.
 * originX/Y place the image origin on the centroid within the PADDED texture.
 */
export function getGeometry(spec) {
  const shape = SHAPES[spec.shape] ? spec.shape : 'plank';
  const scale = Number.isFinite(spec.scale) ? spec.scale : 1;
  const cacheKey = shape + '|' + scale;
  const hit = geomCache.get(cacheKey);
  if (hit) return hit;

  const def = SHAPES[shape];
  const sx = scale;
  const sy = def.uniform ? scale : 1;
  const X = (v) => Math.round(v * sx);
  const Y = (v) => Math.round(v * sy);
  const scaleRect = (r) => ({ x: X(r.x), y: Y(r.y), w: X(r.x + r.w) - X(r.x), h: Y(r.y + r.h) - Y(r.y) });
  const scalePt = (p) => ({ x: X(p.x), y: Y(p.y) });

  const w = X(def.w);
  const h = Y(def.h);
  const g = { shape, scale, name: def.name, w, h, pad: PAD, texW: w + 2 * PAD, texH: h + 2 * PAD };
  if (def.poly) {
    g.poly = def.poly.map(scalePt);
    g.outline = g.poly;
    g.cells = [];
    const c = polyCentroid(g.poly);
    g.cx = c.x;
    g.cy = c.y;
  } else {
    g.parts = def.parts.map(scaleRect);
    g.cells = (def.cells || def.parts).map(scaleRect);
    g.outline = (def.outline || rectOutline(def.w, def.h)).map(scalePt);
    const c = rectsCentroid(g.parts);
    g.cx = c.x;
    g.cy = c.y;
  }
  g.originX = (g.cx + PAD) / g.texW;
  g.originY = (g.cy + PAD) / g.texH;
  geomCache.set(cacheKey, g);
  return g;
}

// (1.13.4, the owner: "the different skins on the blocks", bought with coins) the blocks' skin, the player's own view: its own
// eight colours (one per PALETTE entry, so blocks still differ) and a pattern drawn over the block; looks only. 'kleur' is the
// game's own colours (and keeps the textures' keys as they were).
const BLOCK_SKINS = {
  kleur: null,
  lekkergoed: {
    pattern: 'stripes',
    pal: [[0xffb3d1, 0xffe0ec, 0xe0789f], [0xffcc99, 0xffe8cc, 0xe0995c], [0xfff2a1, 0xfffbd6, 0xd9c45c], [0xb5f2c2, 0xe2fbe8, 0x6fc584],
      [0xa6eef0, 0xdcfafb, 0x5ec1c4], [0xd6c2ff, 0xeee5ff, 0x9a80db], [0xb3d4ff, 0xe0edff, 0x6f9ee0], [0xff9fa3, 0xffd2d4, 0xe0636a]],
  },
  klip: {
    pattern: 'speckle',
    pal: [[0x9a9a9a, 0xc4c4c4, 0x6b6b6b], [0xa8957f, 0xcdbda9, 0x766553], [0x8f8a80, 0xb8b3a8, 0x625e56], [0x7f8c84, 0xa9b5ad, 0x56615a],
      [0x8a9399, 0xb2bac0, 0x5d656b], [0x9a8f9e, 0xc0b6c4, 0x6b616f], [0x8696a8, 0xafbccb, 0x5a6878], [0xa07f74, 0xc6a79c, 0x70544b]],
  },
  neon: {
    pattern: 'glow',
    pal: [[0x1d1b2e, 0xff3fa4, 0x0d0c16], [0x1d1b2e, 0xff9a1f, 0x0d0c16], [0x1d1b2e, 0xfff23f, 0x0d0c16], [0x1d1b2e, 0x39ff6a, 0x0d0c16],
      [0x1d1b2e, 0x29f0ff, 0x0d0c16], [0x1d1b2e, 0xb04dff, 0x0d0c16], [0x1d1b2e, 0x3f8bff, 0x0d0c16], [0x1d1b2e, 0xff3b3b, 0x0d0c16]],
  },
  goud: {
    pattern: 'shine',
    pal: [[0xf2c230, 0xffe78a, 0xb88a0c], [0xe8b52a, 0xffdf7a, 0xa87a08], [0xf5cc45, 0xfff0a6, 0xbf9516], [0xedb92e, 0xffe385, 0xb08410],
      [0xf2c230, 0xffe78a, 0xb88a0c], [0xe3ad22, 0xffd96b, 0xa06f05], [0xf7d050, 0xfff2b0, 0xc29a1c], [0xebb42a, 0xffe07c, 0xab7e0a]],
  },
  // (1.15, the owner: "it must be somthing a 22 year old looks at and thinks I need this, the bricks ...") eight premium skins
  // that paint the whole face themselves (SKIN_FACE below; the game's own grain, nails and bands stay on 'kleur'). Each entry
  // is [fill, light, dark, ...extra colours]; `seam` is how dark the lines between an L's cells are, `stroke: false` skips
  // the smooth outline (the pixel skin draws its own).
  // carbon fibre: a dark 2x2 twill, a clear coat, a sporty accent trim in the entry's colour
  koolstof: {
    pattern: 'carbon',
    seam: 0.9,
    pal: [0xff2d87, 0xff7a1a, 0xffd21f, 0x3dff6e, 0x16e0d0, 0xa04dff, 0x2f86ff, 0xff3030].map((a) => [mix(0x1a1d23, a, 0.08), a, 0x07080a]),
  },
  // ice: [mid, the lit top, the deep bottom]; a clear crystal, cut in planes, frost creeping in from the edges
  ys: {
    pattern: 'ice',
    seam: 0.35,
    pal: [[0xf4c4dd, 0xfff4fa, 0xc06a98], [0xdfeaf5, 0xffffff, 0x7f9bb8], [0xc4f2fb, 0xf4fdff, 0x4fb0c6], [0xb2f0d4, 0xf0fff8, 0x3fa47c],
      [0x8fe3ea, 0xeefffe, 0x23919f], [0xcbbcff, 0xf7f2ff, 0x6f56c9], [0x9ccbff, 0xeef7ff, 0x3a7ad0], [0x7aa2f2, 0xe2ebff, 0x2a46a6]],
  },
  // 8-bit: [base, highlight, shade, the pixel outline]
  piksel: {
    pattern: 'pixel',
    seam: 0,
    stroke: false,
    pal: [[0xff4fa0, 0xffa3d0, 0xc2246f, 0x3a0a24], [0xff8a1f, 0xffc477, 0xc4560a, 0x3d1804], [0xffd93b, 0xfff3a3, 0xcf960a, 0x3d2c02],
      [0x46d65a, 0xa3f78f, 0x1f8f3a, 0x0b2e12], [0x2ad6e0, 0x9af7f8, 0x138aa6, 0x062a33], [0x9a5cff, 0xcdaaff, 0x5f2fc7, 0x1e0a45],
      [0x3d7dff, 0x93b9ff, 0x2245c2, 0x0b1647], [0xff4848, 0xffa092, 0xbd1f2b, 0x40080c]],
  },
  // marble: [stone, cloud, outline, vein, gold vein (0: none)]; white, cream, black and green stones, gold on some
  marmer: {
    pattern: 'marble',
    seam: 0.45,
    pal: [[0xf3d3d8, 0xe6b3bd, 0xa66473, 0x9d4e63, 0], [0xefe1c6, 0xdcc49c, 0x9c8058, 0x8d6c45, 0xc99a3a],
      [0xf8f6f1, 0xe9e4da, 0xa89c88, 0xb2aaa0, 0xd8a633], [0x1d5a44, 0x2c7a5d, 0x0d2e22, 0xd9f1e3, 0],
      [0xf1f3f5, 0xdde2e7, 0x8a949e, 0x67727e, 0], [0x1b1a1f, 0x2e2c35, 0x050506, 0xdcd6ca, 0xe2b648],
      [0x2c4c84, 0x42659e, 0x16264a, 0xe7eefb, 0], [0x8c2929, 0xa63c38, 0x4a1111, 0xf4dccf, 0xe0b048]],
  },
  // lava: [basalt, glow, outline, the white-hot core]; cracks glowing in the entry's colour
  lawa: {
    pattern: 'lava',
    seam: 0.85,
    pal: [0xff3d82, 0xff7a1a, 0xffc21f, 0x7dff3a, 0x1fe5c8, 0xb45cff, 0x3d8bff, 0xff2a1a]
      .map((c) => [mix(0x2a2321, c, 0.07), c, 0x0d0a09, mix(c, 0xfff6d0, 0.72)]),
  },
  // chrome: [mid, sky, the dark band]; mirror metal in eight colours (silver on the sea-green entry)
  chroom: {
    pattern: 'chrome',
    seam: 0.7,
    pal: [[0xd98ca6, 0xffe6ee, 0x5a2236], [0xd98a52, 0xffe7d1, 0x5a2a10], [0xe0b23c, 0xfff6cf, 0x5e4108], [0x4fbf86, 0xe3ffef, 0x0e4a2c],
      [0xa9b6c4, 0xffffff, 0x2a323c], [0x9f7ae0, 0xf1e6ff, 0x2e1a5a], [0x5b95e6, 0xe6f2ff, 0x0f2c5c], [0xe0453f, 0xffe0e0, 0x5a0f0f]],
  },
  // holographic foil: [main tint, sheen, outline, ...the foil's colours, the entry's own first]
  holo: {
    pattern: 'holo',
    seam: 0.4,
    pal: [[0xff9fd6, 0xfff0fa, 0x9c4f86, 0xff9fd6, 0xb9a0ff, 0x8ff3ff, 0xfff0a0], [0xffbe8f, 0xfff4ea, 0xa0603a, 0xffbe8f, 0xff9fd6, 0xfff0a0, 0x8ff3ff],
      [0xfff09a, 0xfffdf0, 0x9a8a30, 0xfff09a, 0x9fffcf, 0xffbe8f, 0xff9fd6], [0x9fffcf, 0xf0fff8, 0x3f9a74, 0x9fffcf, 0x8ff3ff, 0xfff09a, 0xb9a0ff],
      [0x8ff3ff, 0xf0feff, 0x3a8c9c, 0x8ff3ff, 0x9fffcf, 0xb9a0ff, 0xff9fd6], [0xb9a0ff, 0xf6f0ff, 0x6650b0, 0xb9a0ff, 0xff9fd6, 0x8ff3ff, 0x9fffcf],
      [0x9fb8ff, 0xf0f4ff, 0x4a5fb0, 0x9fb8ff, 0x8ff3ff, 0xb9a0ff, 0xff9fd6], [0xff9f9f, 0xfff0f0, 0xa04848, 0xff9f9f, 0xffbe8f, 0xb9a0ff, 0x8ff3ff]],
  },
  // (1.16, Die Lewende Toring: the Gras tribe's blocks; not in the shop) moss and grass on built stone:
  // [stone, moss, outline, the moss's light tips, flowers]
  mos: {
    pattern: 'moss',
    seam: 0.5,
    pal: [[0x8a7f6e, 0x47a83a, 0x2a2418, 0xa8e86a, 0xffffff], [0x7d7468, 0x3c964a, 0x241f18, 0x93df7d, 0xffd23f],
      [0x8f8577, 0x56ad37, 0x2b261c, 0xc2f07a, 0xff8fc2], [0x7a7f73, 0x2e8c58, 0x1f241e, 0x7fe0a0, 0xffffff],
      [0x857a6a, 0x66a530, 0x28221a, 0xd2ee6a, 0xff6a5a], [0x8a8378, 0x45a248, 0x26221b, 0xa6ef8a, 0xb99cff],
      [0x7b7266, 0x3a923e, 0x221d17, 0x8fdc6a, 0xffd23f], [0x92887a, 0x54b447, 0x2c271e, 0xbaf58c, 0xffffff]],
  },
  // galaxy: [deep space, nebula, outline, second nebula]
  heelal: {
    pattern: 'galaxy',
    seam: 0.5,
    pal: [[0x1a0b2e, 0xff4fb8, 0x07030f, 0x7a3cff], [0x1f0d14, 0xff8a3d, 0x0a0406, 0xff3d6e], [0x1c1408, 0xffcf4d, 0x0a0703, 0xff6a3d],
      [0x061c18, 0x3dffb0, 0x020a08, 0x2a8cff], [0x041a24, 0x2de2e6, 0x01080c, 0x3d5bff], [0x140a2a, 0xa64dff, 0x06030f, 0xff5cc8],
      [0x070f2e, 0x3d8bff, 0x02050f, 0x9a5cff], [0x22080c, 0xff3d3d, 0x0c0204, 0xff9a3d]],
  },
};
let blockSkin = 'kleur';
/** (1.13.4) The blocks' skin from now on (new textures; a block already drawn keeps its own). */
/**
 * (1.15, the owner: "Robut rikus needs to have the standard blocks and the user needs to have the fancy ones") paints with
 * another skin for a moment (Blok vir Blok: Robot Rikus's plain blocks, a friend's own skin), then back to this player's.
 */
export function withBlockSkin(id, fn) {
  const own = blockSkin;
  blockSkin = Object.prototype.hasOwnProperty.call(BLOCK_SKINS, id) ? id : 'kleur';
  try {
    return fn();
  } finally {
    blockSkin = own;
  }
}

export function setBlockSkin(id) {
  blockSkin = Object.prototype.hasOwnProperty.call(BLOCK_SKINS, id) ? id : 'kleur';
}
export const getBlockSkin = () => blockSkin;
/** The skin's colours for a PALETTE entry (the entry itself for 'kleur'); `x` holds a premium skin's extra colours. */
function skinned(pal) {
  const sk = BLOCK_SKINS[blockSkin];
  if (!sk) return pal;
  const i = Math.max(0, PALETTE.indexOf(pal));
  const [fill, light, dark, ...x] = sk.pal[i % sk.pal.length];
  return { id: pal.id, fill, light, dark, x };
}

/** PALETTE entry for a spec. */
export function shapeColor(spec) {
  const n = PALETTE.length;
  const i = Number.isFinite(spec.color) ? ((Math.floor(spec.color) % n) + n) % n : 0;
  return PALETTE[i];
}

// ---------------------------------------------------------------------------
// Physics body
// ---------------------------------------------------------------------------

// (1.12.1, the owner: "The physics is not there yet", option A "weight and wobble") a landing's weight, drawn only
const KICK_S = 0.6;        // how long a landing's squash and rock last (s; see Block.kick)
const KICK_SQUASH = 0.12;  // the hardest landing squashes the block this much (it springs back once, then rests)
const KICK_ROCK = 0.035;   // rad: the rock of a landing right at the edge (less the nearer the middle)

let detectorPatched = false;

/**
 * Stacking fixes for Phaser's Matter (0.19), installed by the first createBody():
 * 1. Detector: Matter skips collision tests between two sleeping (or sleeping +
 *    static) bodies and wakes a sleeping body only AFTER detection. A block woken
 *    by a hard landing then has no contacts below it for one step and is shoved
 *    into the next sleeping block, which is shoved further: the push grows down
 *    the stack until the bottom block tunnels through the base. Keeping sleeping
 *    bodies in the contact list (only static-vs-static is skipped) fixes that;
 *    sleeping bodies still get no impulses, so it costs a few SAT tests a step.
 * 2. Sleeping: see patchSleeping().
 * 3. Resolver._restingThresh (PHYSICS.restingThresh): see applyResolverTuning().
 * Idempotent; safe to call from a scene's create().
 */
export function installPhysicsPatch() {
  const M = Mt();
  applyResolverTuning(M);
  if (detectorPatched) return;
  const D = M && M.Detector;
  const collides = M && M.Collision && M.Collision.collides;
  if (!D || typeof D.collisions !== 'function' || typeof collides !== 'function') return;
  detectorPatched = true;
  patchSleeping(M);
  patchResolver(M);
  D.collisions = function stapelCollisions(detector) {
    const pairs = detector.pairs;
    const bodies = detector.bodies;
    const n = bodies.length;
    const canCollide = D.canCollide;
    const collisions = detector.collisions;
    let count = 0;
    bodies.sort(D._compareBoundsX);
    for (let i = 0; i < n; i++) {
      const bodyA = bodies[i];
      const bA = bodyA.bounds;
      const maxX = bA.max.x;
      const maxY = bA.max.y;
      const minY = bA.min.y;
      const staticA = bodyA.isStatic;
      const partsA = bodyA.parts.length;
      for (let j = i + 1; j < n; j++) {
        const bodyB = bodies[j];
        const bB = bodyB.bounds;
        if (bB.min.x > maxX) break;
        if (maxY < bB.min.y || minY > bB.max.y) continue;
        if (staticA && bodyB.isStatic) continue;
        if (!canCollide(bodyA.collisionFilter, bodyB.collisionFilter)) continue;
        const partsB = bodyB.parts.length;
        if (partsA === 1 && partsB === 1) {
          const c = collides(bodyA, bodyB, pairs);
          if (c) collisions[count++] = c;
        } else {
          for (let k = partsA > 1 ? 1 : 0; k < partsA; k++) {
            const pA = bodyA.parts[k];
            const qa = pA.bounds;
            for (let z = partsB > 1 ? 1 : 0; z < partsB; z++) {
              const pB = bodyB.parts[z];
              const qb = pB.bounds;
              if (qa.min.x > qb.max.x || qa.max.x < qb.min.x || qa.max.y < qb.min.y || qa.min.y > qb.max.y) continue;
              const c = collides(pA, pB, pairs);
              if (c) collisions[count++] = c;
            }
          }
        }
      }
    }
    if (collisions.length !== count) collisions.length = count;
    return collisions;
  };
}

/**
 * (1.12.1) The solver only works on contacts that can move something. A pair whose two bodies are both static
 * (cement, the island) or asleep gets no impulse in any of Matter's apply steps, and its stored impulses don't
 * change (both bodies stand still), so leaving it out changes nothing, to the last bit, while it saves 10
 * position and 50 velocity passes over it every step: most of the tower's contacts, once it rests. The live
 * pairs are picked once a step in preSolvePosition (after the step's wake-ups; nothing sleeps or wakes again
 * before the velocity passes).
 */
function patchResolver(M) {
  const R = M && M.Resolver;
  if (!R || R.stapelLive) return;
  const pre = R.preSolvePosition;
  const pos = R.solvePosition;
  const preV = R.preSolveVelocity;
  const vel = R.solveVelocity;
  if ([pre, pos, preV, vel].some((f) => typeof f !== 'function')) return;
  const live = [];
  const inert = (b) => b.isStatic || b.isSleeping;
  R.stapelLive = live;
  R.preSolvePosition = function stapelPreSolvePosition(pairs) {
    live.length = 0;
    for (let i = 0; i < pairs.length; i++) {
      const c = pairs[i].collision;
      if (!inert(c.parentA) || !inert(c.parentB)) live.push(pairs[i]);
    }
    return pre.call(this, live);
  };
  R.solvePosition = function stapelSolvePosition(pairs, ...rest) {
    return pos.call(this, live, ...rest);
  };
  R.preSolveVelocity = function stapelPreSolveVelocity() {
    return preV.call(this, live);
  };
  R.solveVelocity = function stapelSolveVelocity(pairs, ...rest) {
    return vel.call(this, live, ...rest);
  };
}

/**
 * Impacts slower than PHYSICS.restingThresh (px/step) use Matter's accumulated,
 * clamped impulse solver instead of independent per-contact impulses, which
 * spin a block that lands off-centre. Phaser writes its default (4) when the
 * scene's physics plugin is constructed, so this is re-applied per body.
 */
function applyResolverTuning(M) {
  const res = M && M.Resolver;
  const t = PHYSICS.restingThresh;
  if (res && Number.isFinite(t) && res._restingThresh !== t) res._restingThresh = t;
}

function material() {
  const m = PHYSICS.block;
  return {
    label: 'block',
    friction: m.friction,
    frictionStatic: m.frictionStatic,
    frictionAir: m.frictionAir,
    restitution: m.restitution,
    slop: m.slop,
  };
}

/**
 * Matter body for `spec` with its centroid at (x, y). Not added to the world.
 * Multi-part shapes become one compound body (material on the parent,
 * density on every part).
 */
export function createBody(spec, x, y, angle = 0) {
  const M = Mt();
  installPhysicsPatch();
  const g = getGeometry(spec);
  const density = PHYSICS.block.density;
  let body;
  if (g.poly) {
    body = M.Body.create({
      ...material(),
      density,
      position: { x: 0, y: 0 },
      vertices: g.poly.map((p) => ({ x: p.x - g.cx, y: p.y - g.cy })),
    });
  } else if (g.parts.length === 1) {
    const r = g.parts[0];
    body = M.Bodies.rectangle(r.x + r.w / 2 - g.cx, r.y + r.h / 2 - g.cy, r.w, r.h, { ...material(), density });
  } else {
    const parts = g.parts.map((r) => M.Bodies.rectangle(
      r.x + r.w / 2 - g.cx, r.y + r.h / 2 - g.cy, r.w, r.h,
      { label: 'block-part', density, ...partMaterial() },
    ));
    body = M.Body.create({ ...material(), parts });
  }
  body.sleepRadius = Math.hypot(g.w, g.h) / 2;
  M.Body.setPosition(body, { x, y });
  if (angle) M.Body.setAngle(body, angle);
  return body;
}

/**
 * Matter's sleep test uses speed^2 + angularSpeed^2, mixing px and radians,
 * so a plank still rotating at 3 rad/s counts as "quiet" and can fall asleep
 * mid-topple (frozen balancing on a corner). Bodies that carry `sleepRadius`
 * (blocks) measure rotation as tip speed instead.
 * Other bodies keep Matter's original behaviour.
 */
function patchSleeping(M) {
  const Sl = M.Sleeping;
  const base = M.Common._baseDelta || 1000 / 60;
  if (!Sl || typeof Sl.update !== 'function') return;
  Sl.update = function stapelSleepUpdate(bodies, delta) {
    const timeScale = delta / base;
    const threshold = Sl._motionSleepThreshold;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body.force.x !== 0 || body.force.y !== 0) {
        Sl.set(body, false);
        continue;
      }
      const k = base / body.deltaTime;
      const vx = (body.position.x - body.positionPrev.x) * k;
      const vy = (body.position.y - body.positionPrev.y) * k;
      const w = Math.abs(body.angle - body.anglePrev) * k * (body.sleepRadius || 1);
      const motion = vx * vx + vy * vy + w * w;
      const minMotion = Math.min(body.motion, motion);
      const maxMotion = Math.max(body.motion, motion);
      body.motion = Sl._minBias * minMotion + (1 - Sl._minBias) * maxMotion;
      if (body.sleepThreshold > 0 && body.motion < threshold) {
        body.sleepCounter += 1;
        if (body.sleepCounter >= body.sleepThreshold / timeScale) Sl.set(body, true);
      } else if (body.sleepCounter > 0) {
        body.sleepCounter -= 1;
      }
    }
  };
}

function partMaterial() {
  const m = PHYSICS.block;
  return { friction: m.friction, frictionStatic: m.frictionStatic, restitution: m.restitution, slop: m.slop };
}

// ---------------------------------------------------------------------------
// Texture art
// ---------------------------------------------------------------------------

const texInfo = new Map(); // key -> { blocks: Set<Block>, lastUse }
let useClock = 0;

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
function mix(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const gg = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bb = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (gg << 8) | bb;
}
const rgba = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** Tiny deterministic PRNG so a texture key always draws the same details. */
function seededRand(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Polygon path with rounded convex corners (concave corners stay sharp). */
function roundedPolyPath(ctx, pts, radius) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    area += p.x * q.y - q.x * p.y;
  }
  const orient = Math.sign(area);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    const lenA = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lenB = Math.hypot(next.x - cur.x, next.y - cur.y);
    // acute corners get a tiny radius so the visual tip still reaches the body's corner
    const dot = (prev.x - cur.x) * (next.x - cur.x) + (prev.y - cur.y) * (next.y - cur.y);
    const acute = dot > 0.17 * lenA * lenB;
    const r = Math.sign(cross) === orient ? Math.min(acute ? 1.5 : radius, lenA / 2, lenB / 2) : 0;
    if (i === 0) {
      // start in the middle of the closing edge so every corner gets its arc
      ctx.moveTo((prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
    }
    if (r > 0) ctx.arcTo(cur.x, cur.y, next.x, next.y, r);
    else ctx.lineTo(cur.x, cur.y);
  }
  ctx.closePath();
}

function roundRectPath(ctx, x, y, w, h, r) {
  roundedPolyPath(ctx, [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], r);
}

function bandSizes(h) {
  return {
    top: Math.max(5, Math.min(10, Math.round(h * 0.2))),
    bottom: Math.max(4, Math.min(8, Math.round(h * 0.15))),
  };
}

/** Light top band + dark bottom band for one cell (inside the clip). */
function drawCellBands(ctx, c, pal) {
  const b = bandSizes(c.h);
  ctx.fillStyle = hex(pal.light);
  ctx.fillRect(c.x, c.y, c.w, b.top);
  ctx.fillStyle = rgba(0xffffff, 0.35);
  ctx.fillRect(c.x, c.y, c.w, 2);
  ctx.fillStyle = hex(pal.dark);
  ctx.fillRect(c.x, c.y + c.h - b.bottom, c.w, b.bottom);
}

/** Dark seam lines where two cells share an edge. */
function drawSeams(ctx, cells, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i];
      const b = cells[j];
      for (const [p, q] of [[a, b], [b, a]]) {
        if (p.x + p.w === q.x) {
          const y0 = Math.max(p.y, q.y);
          const y1 = Math.min(p.y + p.h, q.y + q.h);
          if (y1 > y0) { ctx.moveTo(q.x, y0); ctx.lineTo(q.x, y1); }
        }
        if (p.y + p.h === q.y) {
          const x0 = Math.max(p.x, q.x);
          const x1 = Math.min(p.x + p.w, q.x + q.w);
          if (x1 > x0) { ctx.moveTo(x0, q.y); ctx.lineTo(x1, q.y); }
        }
      }
    }
  }
  ctx.stroke();
}

const DETAIL = {
  plank(ctx, g, pal, rnd) {
    const { w, h } = g;
    const grain = rgba(pal.dark, 0.32);
    ctx.strokeStyle = grain;
    ctx.lineWidth = 1.5;
    const rows = [0.4, 0.56, 0.72];
    for (const fy of rows) {
      const y = h * fy;
      const x0 = 14 + rnd() * w * 0.25;
      const x1 = w - 14 - rnd() * w * 0.25;
      const amp = 0.8 + rnd() * 1.2;
      const ph = rnd() * 6;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 6) {
        const yy = y + Math.sin(x * 0.05 + ph) * amp;
        if (x === x0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // a knot
    const kx = w * (0.25 + rnd() * 0.5);
    const ky = h * 0.6;
    ctx.beginPath();
    ctx.ellipse(kx, ky, 6, 2.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    // nails at both ends
    ctx.fillStyle = rgba(pal.dark, 0.85);
    for (const nx of [9, w - 9]) {
      for (const ny of [h * 0.42, h * 0.72]) {
        ctx.beginPath();
        ctx.arc(nx, ny, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  slab(ctx, g, pal, rnd) {
    const { w, h } = g;
    // speckled stone + a soft groove
    for (let k = 0; k < Math.round(w / 9); k++) {
      ctx.fillStyle = rnd() < 0.5 ? rgba(pal.dark, 0.28) : rgba(0xffffff, 0.28);
      const x = 6 + rnd() * (w - 12);
      const y = h * 0.3 + rnd() * h * 0.5;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = rgba(pal.dark, 0.35);
    ctx.fillRect(10, Math.round(h * 0.56), w - 20, 2);
    ctx.fillStyle = rgba(0xffffff, 0.3);
    ctx.fillRect(10, Math.round(h * 0.56) + 2, w - 20, 1.5);
  },
  brick(ctx, g, pal) {
    const { w, h } = g;
    const b = bandSizes(h);
    const yMid = Math.round(h / 2);
    const groove = rgba(pal.dark, 0.6);
    const hi = rgba(0xffffff, 0.35);
    ctx.fillStyle = groove;
    ctx.fillRect(0, yMid - 1.5, w, 3);
    ctx.fillStyle = hi;
    ctx.fillRect(0, yMid + 1.5, w, 1.5);
    const joint = (x, y0, y1) => {
      ctx.fillStyle = groove;
      ctx.fillRect(Math.round(x) - 1.5, y0, 3, y1 - y0);
      ctx.fillStyle = hi;
      ctx.fillRect(Math.round(x) + 1.5, y0, 1.5, y1 - y0);
    };
    joint(w * 0.5, b.top, yMid - 1.5);
    joint(w * 0.25, yMid + 1.5, h - b.bottom);
    joint(w * 0.75, yMid + 1.5, h - b.bottom);
  },
  crate(ctx, g, pal) {
    const { w, h } = g;
    const inset = Math.round(w * 0.12);
    const dark = rgba(pal.dark, 0.75);
    // inner panel slightly darker so the frame reads
    ctx.fillStyle = rgba(pal.dark, 0.22);
    ctx.fillRect(inset, inset, w - 2 * inset, h - 2 * inset);
    // diagonal brace
    ctx.save();
    ctx.beginPath();
    ctx.rect(inset, inset, w - 2 * inset, h - 2 * inset);
    ctx.clip();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.round(w * 0.16);
    ctx.beginPath();
    ctx.moveTo(inset - 4, h - inset + 4);
    ctx.lineTo(w - inset + 4, inset - 4);
    ctx.stroke();
    ctx.strokeStyle = hex(pal.light);
    ctx.lineWidth = Math.round(w * 0.16) - 5;
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset);
    // corner nails
    ctx.fillStyle = rgba(pal.dark, 0.9);
    const n = inset / 2;
    for (const [x, y] of [[n, n + 2], [w - n, n + 2], [n, h - n], [w - n, h - n]]) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  cube(ctx, g, pal) {
    const { w, h } = g;
    const s = Math.round(Math.min(w, h) * 0.38);
    const x = Math.round((w - s) / 2);
    const y = Math.round((h - s) / 2) + 1;
    roundRectPath(ctx, x, y, s, s, 4);
    ctx.fillStyle = hex(pal.light);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(pal.dark, 0.8);
    ctx.stroke();
    ctx.fillStyle = rgba(0xffffff, 0.55);
    ctx.fillRect(x + 4, y + 3, s - 8, 2);
  },
  pillar(ctx, g, pal) {
    const { w, h } = g;
    const b = bandSizes(h);
    const capT = b.top + 6;
    const capB = h - b.bottom - 6;
    ctx.fillStyle = rgba(pal.dark, 0.5);
    ctx.fillRect(0, capT - 2, w, 2.5);
    ctx.fillRect(0, capB, w, 2.5);
    ctx.fillStyle = rgba(0xffffff, 0.3);
    ctx.fillRect(0, capT + 0.5, w, 1.5);
    const flutes = 3;
    for (let k = 1; k <= flutes; k++) {
      const x = Math.round((w * k) / (flutes + 1));
      ctx.fillStyle = rgba(pal.dark, 0.42);
      ctx.fillRect(x - 1.5, capT + 5, 3, capB - capT - 9);
      ctx.fillStyle = rgba(0xffffff, 0.3);
      ctx.fillRect(x + 1.5, capT + 5, 1.5, capB - capT - 9);
    }
  },
  wedge(ctx, g, pal) {
    const { w, h } = g;
    const b = bandSizes(h);
    // sandstone strata following the slope
    ctx.fillStyle = rgba(pal.dark, 0.32);
    ctx.fillRect(0, Math.round(b.top + (h - b.top - b.bottom) * 0.38), w, 2);
    ctx.fillRect(0, Math.round(b.top + (h - b.top - b.bottom) * 0.72), w, 2);
    ctx.fillStyle = rgba(0xffffff, 0.25);
    ctx.fillRect(0, Math.round(b.top + (h - b.top - b.bottom) * 0.38) + 2, w, 1.5);
    ctx.fillRect(0, Math.round(b.top + (h - b.top - b.bottom) * 0.72) + 2, w, 1.5);
  },
  arch(ctx, g, pal) {
    // the U: a beam below, two posts up; a seam where each post meets the beam, and the cup's floor in shade
    const beam = g.cells[0];
    const postL = g.cells[1];
    const postR = g.cells[2];
    ctx.strokeStyle = rgba(pal.dark, 0.55);
    ctx.lineWidth = 2;
    for (const post of [postL, postR]) {
      ctx.beginPath();
      ctx.moveTo(post.x + 3, beam.y);
      ctx.lineTo(post.x + post.w - 3, beam.y);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(0x000000, 0.14);
    ctx.fillRect(postL.x + postL.w, beam.y, postR.x - postL.x - postL.w, 4);
    ctx.fillStyle = rgba(0xffffff, 0.18);
    ctx.fillRect(beam.x + 6, beam.y + Math.round(beam.h * 0.62), beam.w - 12, 2);
  },
  tetro(ctx, g, pal) {
    // faint inner square per cell — reads as a toy brick
    for (const c of g.cells) {
      const s = Math.round(Math.min(c.w, c.h) * 0.36);
      const x = Math.round(c.x + (c.w - s) / 2);
      const y = Math.round(c.y + (c.h - s) / 2) + 1;
      roundRectPath(ctx, x, y, s, s, 3);
      ctx.fillStyle = rgba(0xffffff, 0.18);
      ctx.fill();
      ctx.strokeStyle = rgba(pal.dark, 0.35);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  },
};
DETAIL.L = DETAIL.tetro;
DETAIL.J = DETAIL.tetro;
DETAIL.T = DETAIL.tetro;

// ---------------------------------------------------------------------------
// Sponsor names on blocks
// ---------------------------------------------------------------------------

const NAME_PAD_X = 7;
const NAME_PAD_Y = 5;
const NAME_MAX_PX = 24;
const NAME_MIN_PX = 12;      // one line (also the pillar's vertical line)
const NAME_MIN_PX_2 = 10;    // two lines
const NAME_LINE_H = 1.08;
const NAME_TEXT_H = 1.15;    // ascender to descender, in font sizes

/** Short stable hash for texture keys (FNV-1a, base 36). */
function nameHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Cubes are too small for a name. */
function canPrintName(spec) {
  return getGeometry(spec).shape !== 'cube';
}

/** The block's main face for a name, in local px: the widest row of cells, the wedge's middle, the pillar's length. */
function nameFace(g) {
  if (g.shape === 'pillar') return { x: 0, y: 0, w: g.w, h: g.h, vertical: true };
  if (g.poly) {
    const inset = Math.round(g.w * 0.14);   // the slanted sides
    return { x: inset, y: 0, w: g.w - 2 * inset, h: g.h };
  }
  let best = null;
  const rows = new Map();
  for (const c of g.cells) {
    const k = `${c.y}|${c.h}`;
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(c);
  }
  for (const cells of rows.values()) {
    cells.sort((a, b) => a.x - b.x);
    let run = null;
    for (const c of cells) {
      if (run && c.x <= run.x + run.w + 1) run.w = c.x + c.w - run.x;
      else run = { x: c.x, y: c.y, w: c.w, h: c.h };
      if (!best || run.w > best.w || (run.w === best.w && run.h > best.h)) best = { ...run };
    }
  }
  return best || { x: 0, y: 0, w: g.w, h: g.h };
}

function splitInTwo(text) {
  const mid = text.length / 2;
  let at = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (at < 0 || Math.abs(i - mid) < Math.abs(at - mid))) at = i;
  }
  return at > 0 ? [text.slice(0, at), text.slice(at + 1)] : null;
}

/** Largest font size (whole px) from `max` down to `min` at which every line fits `width`; 0 if none. */
function fitSize(ctx, lines, width, max, min) {
  for (let px = Math.floor(max); px >= min; px--) {
    ctx.font = `bold ${px}px ${FONT}`;
    if (lines.every((l) => ctx.measureText(l).width <= width)) return px;
  }
  return 0;
}

/** Prints `name` centred on the main face: white bold, dark outline and a soft shadow, auto-fit. */
function drawName(ctx, g, pal, name) {
  const face = nameFace(g);
  const along = face.vertical ? face.h : face.w;
  const across = face.vertical ? face.w : face.h;
  const width = along - 2 * NAME_PAD_X;
  const room = across - 2 * NAME_PAD_Y;
  if (width < 20 || room < NAME_MIN_PX_2) return false;

  let lines = [name];
  let px = fitSize(ctx, lines, width, Math.min(NAME_MAX_PX, room / NAME_TEXT_H), NAME_MIN_PX);
  let squeeze = 1;
  if (!face.vertical) {
    const two = splitInTwo(name);
    const px2 = two ? fitSize(ctx, two, width, Math.min(NAME_MAX_PX, room / (NAME_LINE_H + NAME_TEXT_H)), NAME_MIN_PX_2) : 0;
    if (px2 && (!px || px2 >= px * 1.25)) {
      lines = two;
      px = px2;
    }
    if (!px) {
      // a very long single word on a short face: squeeze it a little rather than lose the turn
      px = NAME_MIN_PX;
      ctx.font = `bold ${px}px ${FONT}`;
      squeeze = Math.max(0.5, width / Math.max(1, ctx.measureText(name).width));
    }
  }
  if (!px) return false;   // a pillar shows the name only if it fits

  ctx.save();
  ctx.translate(face.x + face.w / 2, face.y + face.h / 2);
  if (face.vertical) ctx.rotate(-Math.PI / 2);   // reads bottom to top
  ctx.scale(squeeze, 1);
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const lh = px * NAME_LINE_H;
  const y0 = -((lines.length - 1) * lh) / 2 + px * 0.04;
  const shadow = Math.max(1, Math.round(px * 0.09));
  const outline = rgba(mix(pal.dark, 0x000000, 0.45), 0.9);
  lines.forEach((line, i) => {
    const y = y0 + i * lh;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillText(line, 0, y + shadow);
    ctx.lineWidth = Math.max(2.5, px * 0.2);
    ctx.strokeStyle = outline;
    ctx.strokeText(line, 0, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, 0, y);
  });
  ctx.restore();
  return true;
}

// The clown's gift: a striped circus block (red and cream, a gold star) whatever its colour.
const GIFT_RED = 0xe23b3b;
const GIFT_CREAM = 0xfff4dc;
const GIFT_GOLD = 0xffcf3a;

function drawStar(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawGift(ctx, g) {
  const outlineCol = mix(GIFT_RED, 0x000000, 0.45);
  ctx.save();
  ctx.translate(PAD, PAD);
  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = hex(GIFT_CREAM);
  ctx.fillRect(0, 0, g.w, g.h);
  // diagonal circus stripes
  const band = 14;
  ctx.fillStyle = hex(GIFT_RED);
  for (let x = -g.h; x < g.w + g.h; x += band * 2) {
    ctx.beginPath();
    ctx.moveTo(x, g.h);
    ctx.lineTo(x + band, g.h);
    ctx.lineTo(x + band + g.h, 0);
    ctx.lineTo(x + g.h, 0);
    ctx.closePath();
    ctx.fill();
  }
  // light top, dark bottom (like every block), then a gold star in the middle
  const b = bandSizes(g.h);
  ctx.fillStyle = rgba(0xffffff, 0.35);
  ctx.fillRect(0, 0, g.w, b.top * 0.6);
  ctx.fillStyle = rgba(0x000000, 0.18);
  ctx.fillRect(0, g.h - b.bottom, g.w, b.bottom);
  const r = Math.max(8, Math.min(16, Math.min(g.w, g.h) * 0.32));
  drawStar(ctx, g.w / 2, g.h / 2 + 1, r, hex(GIFT_GOLD), hex(mix(GIFT_GOLD, 0x000000, 0.45)));
  ctx.restore();
  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = hex(outlineCol);
  ctx.stroke();
  ctx.restore();
}

// Hanswors's log: bark along the length, the sawn ends showing their rings.
const LOG_BARK = 0x7a4a26;
const LOG_BARK_D = 0x5a3519;
const LOG_WOOD = 0xe8bf86;
const LOG_RING = 0xb57c45;

function drawLog(ctx, g) {
  ctx.save();
  ctx.translate(PAD, PAD);
  roundedPolyPath(ctx, g.outline, CORNER_R + 4);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = hex(LOG_BARK);
  ctx.fillRect(0, 0, g.w, g.h);
  // bark grooves: long uneven strokes along the log
  ctx.strokeStyle = hex(LOG_BARK_D);
  ctx.lineCap = 'round';
  const rows = 4;
  for (let k = 0; k < rows; k++) {
    const y = Math.round(((k + 0.6) / rows) * g.h);
    ctx.lineWidth = k % 2 ? 2 : 3;
    for (let x = 14 + (k % 2) * 22; x < g.w - 30; x += 58) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 34 - (k % 3) * 6, y + (k % 2 ? 1 : -1));
      ctx.stroke();
    }
  }
  // the sawn ends: pale wood with rings
  const ew = Math.min(30, g.w * 0.12);
  for (const left of [true, false]) {
    const cx = left ? ew * 0.5 : g.w - ew * 0.5;
    ctx.fillStyle = hex(LOG_WOOD);
    ctx.beginPath();
    ctx.ellipse(cx, g.h / 2, ew * 0.55, g.h * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hex(LOG_RING);
    ctx.lineWidth = 1.6;
    for (const f of [0.72, 0.45, 0.2]) {
      ctx.beginPath();
      ctx.ellipse(cx, g.h / 2, ew * 0.55 * f, g.h * 0.44 * f, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // light top, dark bottom (like every block)
  const b = bandSizes(g.h);
  ctx.fillStyle = rgba(0xffffff, 0.2);
  ctx.fillRect(0, 0, g.w, b.top * 0.6);
  ctx.fillStyle = rgba(0x000000, 0.22);
  ctx.fillRect(0, g.h - b.bottom, g.w, b.bottom);
  ctx.restore();
  roundedPolyPath(ctx, g.outline, CORNER_R + 4);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = hex(0x3b2210);
  ctx.stroke();
  ctx.restore();
}

// The Fondamentblok power-up: a long dark slab with hazard stripes at both ends, like the base.
const FOUND_DARK = 0x2b3038;
const FOUND_STRIPE = 0xf7c948;

function drawFoundation(ctx, g) {
  ctx.save();
  ctx.translate(PAD, PAD);
  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = hex(FOUND_DARK);
  ctx.fillRect(0, 0, g.w, g.h);
  const end = Math.min(46, g.w * 0.16);
  const band = 9;
  for (const x0 of [0, g.w - end]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, end, g.h);
    ctx.clip();
    ctx.fillStyle = hex(FOUND_STRIPE);
    ctx.fillRect(x0, 0, end, g.h);
    ctx.fillStyle = hex(0x1d2b45);
    for (let x = x0 - g.h; x < x0 + end + g.h; x += band * 2) {
      ctx.beginPath();
      ctx.moveTo(x, g.h);
      ctx.lineTo(x + band, g.h);
      ctx.lineTo(x + band + g.h, 0);
      ctx.lineTo(x + g.h, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  // a row of rivets, a light top and a dark bottom (like every block)
  ctx.fillStyle = rgba(0xffffff, 0.24);
  for (let x = end + 20; x < g.w - end - 12; x += 34) {
    ctx.beginPath();
    ctx.arc(x, g.h / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const b = bandSizes(g.h);
  ctx.fillStyle = rgba(0xffffff, 0.16);
  ctx.fillRect(0, 0, g.w, b.top * 0.6);
  ctx.fillStyle = rgba(0x000000, 0.28);
  ctx.fillRect(0, g.h - b.bottom, g.w, b.bottom);
  ctx.restore();
  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = hex(0x11151b);
  ctx.stroke();
  ctx.restore();
}

/** (1.13.4) The blocks' skin pattern over the face (already clipped to the shape). */
function drawSkinPattern(ctx, g, pal, rnd) {
  const sk = BLOCK_SKINS[blockSkin];
  if (!sk) return;
  if (sk.pattern === 'stripes') {
    // candy stripes, diagonal
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 7;
    for (let x = -g.h; x < g.w + g.h; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, g.h);
      ctx.lineTo(x + g.h, 0);
      ctx.stroke();
    }
    ctx.restore();
  } else if (sk.pattern === 'speckle') {
    // stone: dark and light grains
    const n = Math.round((g.w * g.h) / 70);
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)';
      const r = 0.8 + rnd() * 1.8;
      ctx.beginPath();
      ctx.arc(rnd() * g.w, rnd() * g.h, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (sk.pattern === 'glow') {
    // neon: a bright tube just inside the edge
    ctx.save();
    roundedPolyPath(ctx, g.outline, CORNER_R);
    ctx.shadowColor = hex(pal.light);
    ctx.shadowBlur = 8;
    ctx.strokeStyle = hex(pal.light);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  } else if (sk.pattern === 'shine') {
    // gold: a soft diagonal shine
    ctx.save();
    const gr = ctx.createLinearGradient(0, 0, g.w, g.h);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.42, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.58, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, g.w, g.h);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// (1.15) Premium skins: each paints the whole face (already clipped to the shape), once per texture
// ---------------------------------------------------------------------------

const between = (rnd, a, b) => a + rnd() * (b - a);
/** The block's visual cells (the whole box for the wedge, which the clip cuts). */
const faceCells = (g) => (g.cells.length ? g.cells : [{ x: 0, y: 0, w: g.w, h: g.h }]);

/** A canvas for a skin's tile or the shop's sample (only ever drawn in the browser). */
function scratchCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : null;
}

/** How many device px one texture px is on this context (the shop's sample draws scaled up). */
const drawScale = (ctx) => {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  return m ? Math.max(1, Math.min(4, Math.hypot(m.a, m.b))) : 1;
};

/** A soft bevel per cell, so a painted face still reads as a solid block: a lit top edge, a shaded bottom. */
function drawBevel(ctx, g, hi, lo, inset = 3) {
  for (const c of faceCells(g)) {
    const gr = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
    gr.addColorStop(0, rgba(0xffffff, hi));
    gr.addColorStop(Math.min(0.45, inset / c.h), rgba(0xffffff, 0));
    gr.addColorStop(Math.max(0.55, 1 - (inset * 2) / c.h), rgba(0x000000, 0));
    gr.addColorStop(1, rgba(0x000000, lo));
    ctx.fillStyle = gr;
    ctx.fillRect(c.x, c.y, c.w, c.h);
  }
}

/** A four-point glint (a sparkle): a soft halo and two thin rays that fade out. */
function drawGlint(ctx, x, y, r, col = 0xffffff, a = 1) {
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 0.55);
  halo.addColorStop(0, rgba(col, 0.75 * a));
  halo.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const gr = ctx.createLinearGradient(x - dx * r, y - dy * r, x + dx * r, y + dy * r);
    gr.addColorStop(0, rgba(col, 0));
    gr.addColorStop(0.5, rgba(col, a));
    gr.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = gr;
    const t = Math.max(0.8, r * 0.09);
    if (dx) ctx.fillRect(x - r, y - t / 2, 2 * r, t);
    else ctx.fillRect(x - t / 2, y - r, t, 2 * r);
  }
  ctx.fillStyle = rgba(0xffffff, a);
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.7, r * 0.1), 0, Math.PI * 2);
  ctx.fill();
}

/** Point-in-polygon (even-odd), for the pixel skin's grid. */
function insidePoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * A wandering line (a marble vein, a lava crack): `turn` how much it bends each step, `jag` how sharply; it may branch.
 * Returns polylines [{ pts, w }] (w: its width factor), all inside a generous box around the face.
 */
function wander(rnd, x, y, ang, len, { step = 4, turn = 0.12, jag = 0, branch = 0.03, depth = 0, w = 1 } = {}, out = []) {
  const pts = [P(x, y)];
  let a = ang;
  let da = 0;
  for (let s = 0; s < len; s += step) {
    da = da * 0.88 + (rnd() - 0.5) * turn;
    a += da + (jag ? (rnd() - 0.5) * jag : 0);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push(P(x, y));
    if (depth < 2 && rnd() < branch) {
      const side = rnd() < 0.5 ? -1 : 1;
      wander(rnd, x, y, a + side * between(rnd, 0.45, 1.1), (len - s) * between(rnd, 0.3, 0.6),
        { step, turn, jag, branch: branch * 0.7, depth: depth + 1, w: w * 0.55 }, out);
    }
  }
  out.push({ pts, w });
  return out;
}

function strokePolyline(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/** A start on the left or top edge (a little outside) and a heading across the face, for veins and cracks. */
function edgeStart(rnd, w, h) {
  if (rnd() < w / (w + h)) return { x: rnd() * w, y: -4, ang: between(rnd, 0.6, 2.5) };
  return { x: -4, y: rnd() * h, ang: between(rnd, -0.7, 0.7) };
}

// Smooth value noise (one fixed 64x64 lattice; each block reads it at its own offset), for the natural materials.
const NOISE_N = 64;
let noiseLattice = null;
function vnoise(x, y) {
  if (!noiseLattice) {
    const r = seededRand('stapel-noise');
    noiseLattice = new Float32Array(NOISE_N * NOISE_N);
    for (let i = 0; i < noiseLattice.length; i++) noiseLattice[i] = r();
  }
  const L = noiseLattice;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = xi & 63;
  const y0 = yi & 63;
  const x1 = (x0 + 1) & 63;
  const y1 = (y0 + 1) & 63;
  const a = L[y0 * NOISE_N + x0];
  const b = L[y0 * NOISE_N + x1];
  const c = L[y1 * NOISE_N + x0];
  const d = L[y1 * NOISE_N + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Fractal noise, about 0..1. */
function fbm(x, y, oct) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(x * f + o * 17.3, y * f + o * 9.1);
    norm += amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s / norm;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rgbOf = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

let fieldCanvas = null;
/**
 * Paints a soft field over the face: `fn(x, y, out)` sets out[0..2] (0..255) for texture point (x, y); sampled every
 * `step` px and smoothed up. Drawn once per texture (a few thousand samples), never per frame.
 */
function paintField(ctx, w, h, step, fn) {
  const nx = Math.ceil(w / step) + 1;
  const ny = Math.ceil(h / step) + 1;
  if (!fieldCanvas || fieldCanvas.width < nx || fieldCanvas.height < ny) {
    fieldCanvas = scratchCanvas(Math.max(nx, fieldCanvas ? fieldCanvas.width : 0), Math.max(ny, fieldCanvas ? fieldCanvas.height : 0));
    if (!fieldCanvas) return;
  }
  const c = fieldCanvas.getContext('2d');
  const img = c.createImageData(nx, ny);
  const d = img.data;
  const out = [0, 0, 0];
  let n = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      fn((i + 0.5) * step, (j + 0.5) * step, out);
      d[n] = out[0];
      d[n + 1] = out[1];
      d[n + 2] = out[2];
      d[n + 3] = 255;
      n += 4;
    }
  }
  c.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fieldCanvas, 0, 0, nx, ny, 0, 0, nx * step, ny * step);
  ctx.restore();
}

// --- koolstof: carbon fibre ------------------------------------------------

const CARBON_T = 4;              // one tow crossing, in texture px (a 2x2 twill repeats every 4 of them)
const carbonTiles = new Map();

/** The twill's 4x4 tile for one base colour, drawn `k` times finer for a scaled-up sample. */
function carbonTile(base, k) {
  const key = `${base}|${k}`;
  if (carbonTiles.has(key)) return carbonTiles.get(key);
  const T = CARBON_T * k;
  const tile = scratchCanvas(4 * T, 4 * T);
  if (tile) {
    const c = tile.getContext('2d');
    const low = hex(mix(base, 0x000000, 0.6));
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        // 2x2 twill: a tow runs over two crossings, then under two, one crossing later on the next row; the tows across
        // catch the light (silver), the ones running down stay dark: that contrast is what reads as carbon
        const ph = (i - j + 8) & 3;
        const down = ph < 2;
        const x = i * T;
        const y = j * T;
        const gr = down ? c.createLinearGradient(x, 0, x + T, 0) : c.createLinearGradient(0, y, 0, y + T);
        gr.addColorStop(0, low);
        gr.addColorStop(0.35, hex(mix(base, 0xffffff, down ? 0.1 : 0.42)));
        gr.addColorStop(0.6, hex(mix(base, 0xffffff, down ? 0.04 : 0.2)));
        gr.addColorStop(1, low);
        c.fillStyle = gr;
        c.fillRect(x, y, T, T);
        // where the tow dives under, its end is in shade
        const end = down ? (ph === 1 ? 'top' : 'bottom') : (ph === 2 ? 'left' : 'right');
        const sh = end === 'top' ? c.createLinearGradient(0, y, 0, y + T) : end === 'bottom' ? c.createLinearGradient(0, y + T, 0, y)
          : end === 'left' ? c.createLinearGradient(x, 0, x + T, 0) : c.createLinearGradient(x + T, 0, x, 0);
        sh.addColorStop(0, 'rgba(0,0,0,0.55)');
        sh.addColorStop(0.45, 'rgba(0,0,0,0)');
        c.fillStyle = sh;
        c.fillRect(x, y, T, T);
      }
    }
  }
  carbonTiles.set(key, tile);
  return tile;
}

function paintCarbon(ctx, g, pal) {
  const { w, h } = g;
  const accent = pal.light;
  ctx.fillStyle = hex(pal.fill);
  ctx.fillRect(0, 0, w, h);
  const k = Math.round(drawScale(ctx));
  const tile = carbonTile(pal.fill, k);
  if (tile) {
    const pat = ctx.createPattern(tile, 'repeat');
    if (pat) {
      if (k > 1 && typeof pat.setTransform === 'function' && typeof DOMMatrix === 'function') pat.setTransform(new DOMMatrix().scale(1 / k));
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
    }
  }
  // the clear coat: the top catches the sky, the bottom falls into shade
  const coat = ctx.createLinearGradient(0, 0, 0, h);
  coat.addColorStop(0, 'rgba(255,255,255,0.26)');
  coat.addColorStop(0.42, 'rgba(255,255,255,0.07)');
  coat.addColorStop(0.5, 'rgba(255,255,255,0)');
  coat.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = coat;
  ctx.fillRect(0, 0, w, h);
  // a glossy diagonal highlight across the face
  const x0 = w * 0.18;
  const span = Math.max(18, w * 0.16);
  const gl = ctx.createLinearGradient(x0, 0, x0 + span + h * 0.6, 0);
  gl.addColorStop(0, 'rgba(255,255,255,0)');
  gl.addColorStop(0.35, 'rgba(255,255,255,0.22)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  gl.addColorStop(0.62, 'rgba(255,255,255,0.18)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.moveTo(x0 + h * 0.6, 0);
  ctx.lineTo(x0 + h * 0.6 + span, 0);
  ctx.lineTo(x0 + span, h);
  ctx.lineTo(x0, h);
  ctx.closePath();
  ctx.fill();
  // sporty: twin racing stripes in the accent near the right end of the main face
  const f = nameFace(g);
  if (f.w >= 70 && !f.vertical) {
    const sx = f.x + f.w * 0.78;
    const slant = f.h * 0.45;
    ctx.fillStyle = hex(accent);
    for (const [dx, sw] of [[0, Math.max(4, f.w * 0.045)], [Math.max(7, f.w * 0.07), Math.max(2, f.w * 0.02)]]) {
      ctx.beginPath();
      ctx.moveTo(sx + dx + slant, f.y);
      ctx.lineTo(sx + dx + slant + sw, f.y);
      ctx.lineTo(sx + dx + sw, f.y + f.h);
      ctx.lineTo(sx + dx, f.y + f.h);
      ctx.closePath();
      ctx.fill();
    }
  } else if (f.vertical) {
    // a pillar: the stripes run up its length
    ctx.fillStyle = hex(accent);
    ctx.fillRect(f.w * 0.62, 0, Math.max(3, f.w * 0.09), h);
    ctx.fillRect(f.w * 0.78, 0, Math.max(1.5, f.w * 0.04), h);
  }
  // the accent trim just inside the edge, with a little glow
  ctx.save();
  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.strokeStyle = rgba(accent, 0.28);
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = hex(accent);
  ctx.lineWidth = 4.4;
  ctx.stroke();
  ctx.strokeStyle = rgba(0xffffff, 0.45);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

// --- ys: ice ----------------------------------------------------------------

const ICE_LIGHT = (() => {
  const l = [-0.45, -0.65, 0.62];
  const n = Math.hypot(...l);
  return l.map((v) => v / n);
})();

function paintIce(ctx, g, pal, rnd) {
  const { w, h } = g;
  const deep = mix(pal.fill, pal.dark, 0.7);
  // clear ice: a little of the sky shows through (the facets keep this alpha: they are drawn 'source-atop')
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = hex(pal.fill);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  // a cut crystal: a jittered grid of points at random heights, two facets per square, each lit from the top left
  const cols = Math.max(2, Math.round(w / 24));
  const rows = Math.max(2, Math.round(h / 24));
  const pts = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const jx = c === 0 || c === cols ? 0 : (rnd() - 0.5) * (w / cols) * 0.75;
      const jy = r === 0 || r === rows ? 0 : (rnd() - 0.5) * (h / rows) * 0.75;
      pts.push({ x: (c / cols) * w + jx, y: (r / rows) * h + jy, z: rnd() * 15 });
    }
  }
  const at = (r, c) => pts[r * (cols + 1) + c];
  const tris = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = at(r, c);
      const b = at(r, c + 1);
      const d = at(r + 1, c);
      const e = at(r + 1, c + 1);
      if ((r + c) % 2) tris.push([a, b, e], [a, e, d]);
      else tris.push([a, b, d], [b, e, d]);
    }
  }
  const tone = (t) => (t < 0.45 ? mix(pal.light, pal.fill, t / 0.45) : mix(pal.fill, deep, (t - 0.45) / 0.55));
  for (const [a, b, c] of tris) {
    const ux = b.x - a.x; const uy = b.y - a.y; const uz = b.z - a.z;
    const vx = c.x - a.x; const vy = c.y - a.y; const vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const len = Math.hypot(nx, ny, nz) || 1;
    const lam = (nx * ICE_LIGHT[0] + ny * ICE_LIGHT[1] + nz * ICE_LIGHT[2]) / len;
    const shade = (lam - ICE_LIGHT[2]) * 2.4;
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    let col = tone(clamp01((cy / h) * 0.75 + (cx / w) * 0.25));
    col = shade > 0 ? mix(col, 0xffffff, Math.min(0.85, shade)) : mix(col, pal.dark, Math.min(0.5, -shade * 0.7));
    ctx.fillStyle = hex(col);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
  }
  // the facets' edges catch the light
  ctx.lineWidth = 0.9;
  ctx.lineJoin = 'round';
  for (const [a, b, c] of tris) {
    ctx.strokeStyle = rgba(0xffffff, between(rnd, 0.15, 0.6));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
  // light inside the crystal, from the top left
  const glow = ctx.createRadialGradient(w * 0.15, 0, 0, w * 0.15, 0, Math.max(w, h) * 0.8);
  glow.addColorStop(0, 'rgba(255,255,255,0.45)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  // frost creeping in from the edges: a misty band and fine white speckles
  ctx.save();
  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
  const specks = Math.round((w + h) * 1.4);
  for (let k = 0; k < specks; k++) {
    const side = rnd();
    const d = rnd() * rnd() * 12;
    let x;
    let y;
    if (side < 0.3) { x = rnd() * w; y = h - d; }
    else if (side < 0.5) { x = rnd() * w; y = d; }
    else if (side < 0.75) { x = d; y = rnd() * h; }
    else { x = w - d; y = rnd() * h; }
    ctx.fillStyle = rgba(0xffffff, between(rnd, 0.5, 1));
    const s = between(rnd, 0.6, 1.5);
    ctx.fillRect(x, y, s, s);
  }
  // a few trapped air bubbles
  const bubbles = Math.round((w * h) / 4000);
  ctx.lineWidth = 0.8;
  for (let k = 0; k < bubbles; k++) {
    const r = between(rnd, 1, 2.2);
    const bx = between(rnd, 8, w - 8);
    const by = between(rnd, 8, h - 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  // a sparkle where the light hits
  drawGlint(ctx, w * between(rnd, 0.12, 0.3), h * between(rnd, 0.15, 0.3), Math.min(10, Math.max(5, h * 0.17)), 0xffffff, 1);
  // the bright rim light: brightest at the top left
  ctx.save();
  roundedPolyPath(ctx, g.outline, CORNER_R);
  const rim = ctx.createLinearGradient(0, 0, w * 0.6, h);
  rim.addColorStop(0, 'rgba(255,255,255,1)');
  rim.addColorStop(0.6, 'rgba(255,255,255,0.75)');
  rim.addColorStop(1, 'rgba(255,255,255,0.45)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

// --- piksel: 8-bit pixels ----------------------------------------------------

const PIX = 6;   // one big pixel, in texture px
// a 4x4 ordered (Bayer) dither: the old consoles' way to shade with few colours
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function paintPixel(ctx, g, pal) {
  const { w, h } = g;
  const nx = Math.max(5, Math.round(w / PIX));
  const ny = Math.max(4, Math.round(h / PIX));
  const X = (i) => Math.round((i * w) / nx);
  const Y = (j) => Math.round((j * h) / ny);
  const cells = faceCells(g);
  // which cell every pixel's centre lies in (-1: outside the shape)
  const grid = new Int8Array(nx * ny).fill(-1);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = (X(i) + X(i + 1)) / 2;
      const cy = (Y(j) + Y(j + 1)) / 2;
      if (g.poly ? !insidePoly(g.poly, cx, cy) : !insidePoly(g.outline, cx, cy)) continue;
      let k = 0;
      if (!g.poly) {
        k = cells.findIndex((c) => cx >= c.x && cx < c.x + c.w && cy >= c.y && cy < c.y + c.h);
        if (k < 0) k = 0;
      }
      grid[j * nx + i] = k;
    }
  }
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? -1 : grid[j * nx + i]);
  // round the corners the 8-bit way: a corner pixel (outside both across and up/down) goes
  const notch = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (at(i, j) < 0) continue;
      const l = at(i - 1, j) < 0;
      const r = at(i + 1, j) < 0;
      const u = at(i, j - 1) < 0;
      const d = at(i, j + 1) < 0;
      if ((l || r) && (u || d)) notch.push(j * nx + i);
    }
  }
  for (const n of notch) grid[n] = -1;
  // 0 inside, 1 outline (next to the outside), 2 seam (the cell to the right or below is another one)
  const kind = new Int8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = at(i, j);
      if (k < 0) continue;
      if (at(i - 1, j) < 0 || at(i + 1, j) < 0 || at(i, j - 1) < 0 || at(i, j + 1) < 0) kind[j * nx + i] = 1;
      else if ((at(i + 1, j) !== k) || (at(i, j + 1) !== k)) kind[j * nx + i] = 2;
    }
  }
  const inner = (i, j, k) => at(i, j) === k && kind[j * nx + i] === 0;
  const C = { base: hex(pal.fill), light: hex(pal.light), shade: hex(pal.dark), line: hex(pal.x[0]), white: '#ffffff' };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = at(i, j);
      if (k < 0) continue;
      const kd = kind[j * nx + i];
      let col;
      if (kd) col = C.line;
      else {
        const top = !inner(i, j - 1, k);
        const left = !inner(i - 1, j, k);
        const right = !inner(i + 1, j, k);
        const bottom = !inner(i, j + 1, k);
        if (top) col = right ? C.base : C.light;
        else if (bottom || right) col = C.shade;
        else if (left) col = C.light;
        else {
          // a dithered shade: lit towards the top, darker towards the bottom of the cell
          const c = cells[g.poly ? 0 : k];
          const t = ((Y(j) + Y(j + 1)) / 2 - c.y) / c.h;
          const b = (BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16;
          if (t < 0.38) col = (t - 0.1) / 0.28 > b ? C.base : C.light;
          else if (t > 0.58) col = (t - 0.58) / 0.36 > b ? C.shade : C.base;
          else col = C.base;
        }
      }
      ctx.fillStyle = col;
      ctx.fillRect(X(i), Y(j), X(i + 1) - X(i), Y(j + 1) - Y(j));
    }
  }
  // the pixel shine in each cell's top-left corner
  ctx.fillStyle = C.white;
  for (let k = 0; k < cells.length; k++) {
    let first = -1;
    for (let n = 0; n < grid.length && first < 0; n++) if (grid[n] === k && kind[n] === 0) first = n;
    if (first < 0) continue;
    const fi = first % nx;
    const fj = Math.floor(first / nx);
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1]]) {
      if (inner(fi + di, fj + dj, k) || (di + dj === 0)) ctx.fillRect(X(fi + di), Y(fj + dj), X(fi + di + 1) - X(fi + di), Y(fj + dj + 1) - Y(fj + dj));
    }
  }
}

// --- marmer: marble -----------------------------------------------------------

function paintMarble(ctx, g, pal, rnd) {
  const { w, h } = g;
  const [vein, gold] = pal.x;
  const dark = (pal.fill & 0xff) + ((pal.fill >> 8) & 0xff) + ((pal.fill >> 16) & 0xff) < 300;
  ctx.fillStyle = hex(pal.fill);
  ctx.fillRect(0, 0, w, h);
  // depth: soft clouds of a second tone in the stone
  const clouds = 3 + Math.round((w * h) / 2200);
  for (let k = 0; k < clouds; k++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = between(rnd, 0.25, 0.6) * Math.max(w, h);
    const cl = ctx.createRadialGradient(x, y, 0, x, y, r);
    cl.addColorStop(0, rgba(rnd() < 0.7 ? pal.light : mix(pal.fill, 0xffffff, 0.5), between(rnd, 0.35, 0.7)));
    cl.addColorStop(1, rgba(pal.light, 0));
    ctx.fillStyle = cl;
    ctx.fillRect(0, 0, w, h);
  }
  // veins: curvy, branching, swelling and thinning, a soft bleed around each
  const veins = [];
  const count = 1 + Math.round((w + h) / 85);
  for (let k = 0; k < count; k++) {
    const s = edgeStart(rnd, w, h);
    wander(rnd, s.x, s.y, s.ang, (w + h) * between(rnd, 0.7, 1.3), { step: 3, turn: 0.16, branch: 0.035, w: between(rnd, 0.7, 1.4) }, veins);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const thick = Math.max(1.6, Math.min(w, h) * 0.05);
  for (const v of veins) {
    ctx.strokeStyle = rgba(vein, dark ? 0.16 : 0.12);
    ctx.lineWidth = thick * v.w * 3.2;
    strokePolyline(ctx, v.pts);
  }
  for (const v of veins) {
    const ph = rnd() * 6;
    const f = between(rnd, 0.05, 0.12);
    for (let i = 1; i < v.pts.length; i++) {
      const swell = 0.5 + 0.5 * Math.sin(i * f + ph);
      ctx.strokeStyle = rgba(vein, (dark ? 0.55 : 0.45) + swell * 0.4);
      ctx.lineWidth = Math.max(0.6, thick * v.w * (0.18 + 0.82 * swell * swell));
      ctx.beginPath();
      ctx.moveTo(v.pts[i - 1].x, v.pts[i - 1].y);
      ctx.lineTo(v.pts[i].x, v.pts[i].y);
      ctx.stroke();
    }
  }
  // thin gold veins on the stones that have them
  if (gold) {
    const golds = [];
    for (let k = 0; k < 1 + Math.round(w / 140); k++) {
      const s = edgeStart(rnd, w, h);
      wander(rnd, s.x, s.y, s.ang, (w + h) * between(rnd, 0.6, 1), { step: 3, turn: 0.2, branch: 0.03 }, golds);
    }
    for (const v of golds) {
      ctx.strokeStyle = hex(mix(gold, 0x000000, 0.25));
      ctx.lineWidth = Math.max(1.2, 1.9 * v.w);
      strokePolyline(ctx, v.pts);
      ctx.strokeStyle = hex(mix(gold, 0xffffff, 0.45));
      ctx.lineWidth = Math.max(0.6, 0.8 * v.w);
      strokePolyline(ctx, v.pts);
    }
  }
  // the polish: a broad diagonal sheen, a crisp reflection and a lit top edge
  const sh = ctx.createLinearGradient(0, 0, w, h * 1.5);
  sh.addColorStop(0, 'rgba(255,255,255,0.32)');
  sh.addColorStop(0.28, 'rgba(255,255,255,0.08)');
  sh.addColorStop(0.36, 'rgba(255,255,255,0.22)');
  sh.addColorStop(0.42, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, w, h);
  drawBevel(ctx, g, 0.75, dark ? 0.35 : 0.22, 2.5);
}

// --- lawa: lava -------------------------------------------------------------

function paintLava(ctx, g, pal, rnd) {
  const { w, h } = g;
  const glow = pal.light;
  const hot = pal.x[0];
  // basalt, a little lighter on top
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, hex(mix(pal.fill, 0xffffff, 0.1)));
  body.addColorStop(1, hex(mix(pal.fill, 0x000000, 0.35)));
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, w, h);
  // the heat inside: a glow rising from the bottom
  const heat = ctx.createRadialGradient(w / 2, h * 1.15, 0, w / 2, h * 1.15, Math.max(w * 0.6, h * 1.1));
  heat.addColorStop(0, rgba(glow, 0.5));
  heat.addColorStop(0.6, rgba(glow, 0.12));
  heat.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = heat;
  ctx.fillRect(0, 0, w, h);
  // rough rock grains
  const grains = Math.round((w * h) / 26);
  for (let k = 0; k < grains; k++) {
    ctx.fillStyle = rnd() < 0.55 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.09)';
    const s = between(rnd, 0.8, 2.2);
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
  // the cracks: jagged and branching, glowing from wide and soft to a white-hot core
  const cracks = [];
  const count = 1 + Math.round((w + h) / 75);
  for (let k = 0; k < count; k++) {
    const s = edgeStart(rnd, w, h);
    wander(rnd, s.x, s.y, s.ang, (w + h) * between(rnd, 0.5, 1), { step: 5, turn: 0.1, jag: 0.9, branch: 0.09 }, cracks);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes = [[11, rgba(glow, 0.12)], [6, rgba(glow, 0.3)], [3, hex(glow)], [1.2, hex(hot)]];
  for (const [lw, col] of passes) {
    ctx.strokeStyle = col;
    for (const c of cracks) {
      ctx.lineWidth = Math.max(lw * 0.5, lw * (0.45 + 0.55 * c.w));
      strokePolyline(ctx, c.pts);
    }
  }
  // embers: a few bright sparks close to the cracks
  const embers = 2 + Math.round((w * h) / 3000);
  for (let k = 0; k < embers; k++) {
    const c = cracks[Math.floor(rnd() * cracks.length)];
    const p = c.pts[Math.floor(rnd() * c.pts.length)];
    const x = p.x + between(rnd, -8, 8);
    const y = p.y + between(rnd, -8, 8);
    const r = between(rnd, 2.5, 4.5);
    const em = ctx.createRadialGradient(x, y, 0, x, y, r);
    em.addColorStop(0, rgba(hot, 1));
    em.addColorStop(0.3, rgba(glow, 0.8));
    em.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = em;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  drawBevel(ctx, g, 0.22, 0.3, 3);
  // a warm rim, so the block shows on a night sky
  ctx.save();
  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.strokeStyle = rgba(glow, 0.55);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

// --- mos: moss and grass (1.16) ------------------------------------------------------

function paintMoss(ctx, g, pal, rnd) {
  const { w, h } = g;
  const moss = pal.light;
  const tip = pal.x[0];
  const bloom = pal.x[1];
  const stoneHi = mix(pal.fill, 0xffffff, 0.12);
  const stoneLo = mix(pal.fill, 0x000000, 0.34);
  const mossLo = mix(moss, 0x000000, 0.42);
  const ox = rnd() * 50;
  const oy = rnd() * 50;
  // built stone, and moss over it: a thick cap on top, patches lower down (one smooth field)
  paintField(ctx, w, h, 2, (x, y, out) => {
    const n = fbm((x + ox) / 13, (y + oy) / 13, 3);
    const top = 1 - y / h;
    const m = clamp01((n * 0.95 + top * 1.05 - 0.92) * 5.5);
    const stone = mix(mix(stoneLo, stoneHi, clamp01(top * 0.8 + (n - 0.5) * 0.5)), 0x000000, vnoise((x + ox) / 3, (y + oy) / 3) * 0.14);
    const green = mix(mix(mossLo, moss, clamp01(m * 1.6)), tip, clamp01((fbm((x + oy) / 5, (y + ox) / 5, 2) - 0.55) * 2.2));
    const [r, gg, b] = rgbOf(mix(stone, green, m));
    out[0] = r;
    out[1] = gg;
    out[2] = b;
  });
  // the stone's joints, faint, where the moss is thin
  ctx.strokeStyle = rgba(0x000000, 0.18);
  ctx.lineWidth = 1;
  const row = Math.max(14, Math.round(h / 2));
  for (let y = row; y < h - 4; y += row) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let y = 0, k = 0; y < h; y += row, k++) {
    for (let x = (k % 2 ? 0.5 : 1) * between(rnd, 20, 30); x < w - 6; x += between(rnd, 26, 40)) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, Math.min(h, y + row));
      ctx.stroke();
    }
  }
  // grass blades along the top
  ctx.lineCap = 'round';
  for (let x = 1; x < w; x += between(rnd, 2.2, 3.6)) {
    const base = between(rnd, 6, 12);
    const lean = between(rnd, -2.5, 2.5);
    ctx.strokeStyle = rnd() < 0.5 ? hex(tip) : hex(mix(moss, tip, 0.4));
    ctx.lineWidth = between(rnd, 1, 1.7);
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + lean * 0.3, base * 0.45, x + lean, -1);
    ctx.stroke();
  }
  // tendrils hanging from the moss, with small leaves
  const tendrils = 1 + Math.round(w / 90);
  for (let k = 0; k < tendrils; k++) {
    let x = between(rnd, w * 0.08, w * 0.92);
    let y = between(rnd, 8, 13);
    const len = between(rnd, h * 0.35, h * 0.8);
    ctx.strokeStyle = hex(mix(moss, 0x000000, 0.2));
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const leaves = [];
    for (let d = 0; d < len; d += 3) {
      x += Math.sin((y + ox) * 0.25) * 0.8;
      y += 3;
      ctx.lineTo(x, y);
      if (d % 9 < 3) leaves.push([x, y, leaves.length % 2 ? 1 : -1]);
    }
    ctx.stroke();
    for (const [lx, ly, sd] of leaves) {
      ctx.fillStyle = hex(sd > 0 ? tip : moss);
      ctx.beginPath();
      ctx.ellipse(lx + sd * 2.4, ly, 2.6, 1.3, sd * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // a few flowers in the moss
  const flowers = 1 + Math.round(w / 60);
  for (let k = 0; k < flowers; k++) {
    const fx = between(rnd, 6, w - 6);
    const fy = between(rnd, 3, Math.min(14, h * 0.32));
    const r = between(rnd, 1.5, 2.3);
    ctx.fillStyle = hex(bloom);
    for (let q = 0; q < 5; q++) {
      const a = (q * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffc21f';
    ctx.beginPath();
    ctx.arc(fx, fy, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  drawBevel(ctx, g, 0.2, 0.32, 3);
  // a fresh green rim, so the block shows on a night sky
  ctx.save();
  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.strokeStyle = rgba(tip, 0.5);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

// --- chroom: chrome -----------------------------------------------------------

function paintChrome(ctx, g, pal, rnd) {
  const { w, h } = g;
  const sky = pal.light;
  const mid = pal.fill;
  const deep = pal.dark;
  // the mirror, per cell: sky above, a bright line, a dark band (the horizon), the ground below, a lit bottom rim
  for (const c of faceCells(g)) {
    const gr = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
    gr.addColorStop(0, hex(mix(sky, 0xffffff, 0.6)));
    gr.addColorStop(0.28, hex(sky));
    gr.addColorStop(0.44, hex(mix(mid, sky, 0.35)));
    gr.addColorStop(0.5, '#ffffff');
    gr.addColorStop(0.53, hex(deep));
    gr.addColorStop(0.66, hex(mix(deep, mid, 0.45)));
    gr.addColorStop(0.86, hex(mid));
    gr.addColorStop(1, hex(mix(mid, sky, 0.7)));
    ctx.fillStyle = gr;
    ctx.fillRect(c.x, c.y, c.w, c.h);
  }
  // reflections of a window: slanted bright streaks across the mirror
  const streaks = 1 + Math.round(w / 90);
  for (let k = 0; k < streaks; k++) {
    const x = w * between(rnd, 0.1, 0.9);
    const sw = between(rnd, 3, 9);
    const sl = h * 0.5;
    ctx.fillStyle = rgba(0xffffff, between(rnd, 0.18, 0.4));
    ctx.beginPath();
    ctx.moveTo(x + sl, 0);
    ctx.lineTo(x + sl + sw, 0);
    ctx.lineTo(x + sw, h);
    ctx.lineTo(x, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(0xffffff, 0.5);
    ctx.beginPath();
    ctx.moveTo(x + sl + sw + 3, 0);
    ctx.lineTo(x + sl + sw + 4.2, 0);
    ctx.lineTo(x + sw + 4.2, h);
    ctx.lineTo(x + sw + 3, h);
    ctx.closePath();
    ctx.fill();
  }
  // polished bevels per cell: a white top edge, a dark bottom one
  for (const c of faceCells(g)) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(c.x, c.y, c.w, 1.6);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(c.x, c.y + 1.6, c.w, 1.4);
    ctx.fillRect(c.x, c.y, 1.4, c.h);
    ctx.fillStyle = rgba(deep, 0.5);
    ctx.fillRect(c.x, c.y + c.h - 2, c.w, 2);
    ctx.fillStyle = rgba(deep, 0.3);
    ctx.fillRect(c.x + c.w - 1.4, c.y, 1.4, c.h);
  }
  // a star glint where the sun catches it
  const f = nameFace(g);
  drawGlint(ctx, f.x + f.w * between(rnd, 0.1, 0.25), f.y + f.h * 0.3, Math.min(11, Math.max(6, Math.min(f.w, f.h) * 0.22)));
}

// --- holo: holographic foil -----------------------------------------------------

function paintHolo(ctx, g, pal, rnd) {
  const { w, h } = g;
  const foil = pal.x;
  // the foil: rainbow bands on a diagonal, the entry's own colour coming back most often
  const len = Math.hypot(w, h);
  const ang = between(rnd, 0.35, 0.7);
  const dx = Math.cos(ang) * len;
  const dy = Math.sin(ang) * len;
  const gr = ctx.createLinearGradient(0, 0, dx, dy);
  const n = Math.max(4, Math.round(len / 34));
  for (let k = 0; k <= n; k++) gr.addColorStop(k / n, hex(k % 2 === 0 ? foil[0] : foil[1 + ((k >> 1) % (foil.length - 1))]));
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, w, h);
  // a second rainbow across the first, as the foil shifts with the light
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const g2 = ctx.createLinearGradient(w, 0, 0, h);
  const m = Math.max(3, Math.round(len / 26));
  for (let k = 0; k <= m; k++) g2.addColorStop(k / m, k % 2 ? 'rgba(255,255,255,0.9)' : hex(foil[(k >> 1) % foil.length]));
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  // the foil's fine grating
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let x = -h; x < w + h; x += 3) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h * 0.55, h);
  }
  ctx.stroke();
  // the pearly sheen
  const pearl = ctx.createRadialGradient(w * 0.28, h * 0.1, 0, w * 0.28, h * 0.1, Math.max(w, h) * 0.7);
  pearl.addColorStop(0, 'rgba(255,255,255,0.6)');
  pearl.addColorStop(0.45, 'rgba(255,255,255,0.15)');
  pearl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = pearl;
  ctx.fillRect(0, 0, w, h);
  // sparkles: fine glints and a few four-point stars
  const dots = Math.round((w * h) / 140);
  for (let k = 0; k < dots; k++) {
    ctx.fillStyle = rgba(0xffffff, between(rnd, 0.5, 1));
    const s = between(rnd, 0.6, 1.5);
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
  const stars = 1 + Math.round((w * h) / 2600);
  for (let k = 0; k < stars; k++) drawGlint(ctx, between(rnd, 5, w - 5), between(rnd, 4, h - 4), between(rnd, 4, 8));
  drawBevel(ctx, g, 0.8, 0.22, 2.5);
}

// --- heelal: galaxy -------------------------------------------------------------

function paintGalaxy(ctx, g, pal, rnd) {
  const { w, h } = g;
  const neb = [pal.light, pal.x[0]];
  const deep = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  deep.addColorStop(0, hex(mix(pal.fill, neb[1], 0.25)));
  deep.addColorStop(1, hex(mix(pal.fill, 0x000000, 0.4)));
  ctx.fillStyle = deep;
  ctx.fillRect(0, 0, w, h);
  // the nebula: soft clouds of two colours, added like light, with a long bright band through the middle
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const clouds = 4 + Math.round((w * h) / 1600);
  const band = between(rnd, -0.5, 0.5);
  for (let k = 0; k < clouds; k++) {
    const t = rnd();
    const x = t * w;
    const y = h / 2 + (t - 0.5) * band * h + between(rnd, -0.35, 0.35) * h;
    const r = between(rnd, 0.3, 0.75) * Math.min(Math.max(w, h) * 0.5, Math.min(w, h) * 1.2);
    const c = neb[k % 2];
    const cl = ctx.createRadialGradient(x, y, 0, x, y, r);
    cl.addColorStop(0, rgba(c, between(rnd, 0.25, 0.5)));
    cl.addColorStop(0.5, rgba(c, 0.1));
    cl.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = cl;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  // dark dust lanes give the clouds their shape
  for (let k = 0; k < 2 + Math.round(w / 120); k++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = between(rnd, 0.15, 0.35) * Math.max(w, h);
    const d = ctx.createRadialGradient(x, y, 0, x, y, r);
    d.addColorStop(0, rgba(pal.fill, 0.55));
    d.addColorStop(1, rgba(pal.fill, 0));
    ctx.fillStyle = d;
    ctx.fillRect(0, 0, w, h);
  }
  // many tiny stars
  const stars = Math.round((w * h) / 40);
  for (let k = 0; k < stars; k++) {
    const v = rnd();
    ctx.fillStyle = v < 0.15 ? rgba(0xbfe0ff, 0.9) : v < 0.25 ? rgba(0xfff0c0, 0.9) : rgba(0xffffff, between(rnd, 0.35, 1));
    const s = v < 0.08 ? 1.6 : between(rnd, 0.5, 1.1);
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
  // a couple of bright stars with a cross glint
  const big = 1 + Math.round((w * h) / 5000);
  for (let k = 0; k < big; k++) {
    drawGlint(ctx, between(rnd, 6, w - 6), between(rnd, 5, h - 5), between(rnd, 6, 11), k % 2 ? mix(neb[0], 0xffffff, 0.6) : 0xffffff);
  }
  drawBevel(ctx, g, 0.3, 0.35, 3);
  // a soft rim in the nebula's colour, so the block shows on a night sky
  ctx.save();
  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.strokeStyle = rgba(neb[0], 0.6);
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.restore();
}

/** (1.15) The premium skins that paint the whole face (instead of the game's colours plus a pattern). */
const SKIN_FACE = {
  carbon: paintCarbon,
  ice: paintIce,
  pixel: paintPixel,
  marble: paintMarble,
  lava: paintLava,
  moss: paintMoss,
  chrome: paintChrome,
  holo: paintHolo,
  galaxy: paintGalaxy,
};

function drawBlock(ctx, g, pal, key, name = null) {
  const rnd = seededRand(key);
  const outlineCol = mix(pal.dark, 0x000000, 0.38);
  ctx.save();
  ctx.translate(PAD, PAD);

  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.save();
  ctx.clip();
  const sk = BLOCK_SKINS[blockSkin];
  const face = sk && SKIN_FACE[sk.pattern];
  if (face) {
    // (1.15) a premium skin paints the whole face itself
    ctx.save();
    face(ctx, g, pal, rnd);
    ctx.restore();
    if (g.cells.length > 1 && sk.seam) drawSeams(ctx, g.cells, rgba(outlineCol, sk.seam));
  } else {
    ctx.fillStyle = hex(pal.fill);
    ctx.fillRect(0, 0, g.w, g.h);
    if (g.cells.length) {
      for (const c of g.cells) drawCellBands(ctx, c, pal);
    } else {
      drawCellBands(ctx, { x: 0, y: 0, w: g.w, h: g.h }, pal);
    }
    const detail = DETAIL[g.shape];
    if (detail) detail(ctx, g, pal, rnd);
    drawSkinPattern(ctx, g, pal, rnd);
    if (g.cells.length > 1) drawSeams(ctx, g.cells, rgba(outlineCol, 0.8));
  }
  if (name) drawName(ctx, g, pal, name);   // still clipped to the shape: the ghost silhouette is unchanged
  ctx.restore();

  if (!face || sk.stroke !== false) {
    roundedPolyPath(ctx, g.outline, CORNER_R);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = hex(outlineCol);
    ctx.stroke();
  }
  ctx.restore();
}

// (1.15, the owner: "make it so that people want to buy it with the coins") the shop's sample of a block skin: three
// blocks of different shapes and colours, drawn by the game's own block art, centred on the canvas (transparent around).
const SWATCH = [
  { shape: 'plank', color: 6, x: 0, y: 92 },
  { shape: 'cube', color: 2, x: 0, y: 32 },
  { shape: 'J', color: 0, x: 68, y: 4 },
];
const SWATCH_W = 200;
const SWATCH_H = 132;
const swatchCache = new Map();

/**
 * Draws the shop's sample of block skin `skinId` on `canvas` (any size, in its own pixels: size it at devicePixelRatio).
 * The game's worn skin is left as it was. Cached per skin and size, so reopening the shop is cheap.
 */
export function drawSkinSwatch(canvas, skinId) {
  const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (W < 4 || H < 4) return;
  const id = Object.prototype.hasOwnProperty.call(BLOCK_SKINS, skinId) ? skinId : 'kleur';
  const cacheKey = `${id}|${W}x${H}`;
  let art = swatchCache.get(cacheKey);
  if (!art) {
    art = scratchCanvas(W, H);
    if (!art) return;
    const off = art.getContext('2d');
    const m = Math.min(W, H) * 0.07;
    const s = Math.min((W - 2 * m) / SWATCH_W, (H - 2 * m - Math.min(W, H) * 0.04) / SWATCH_H);
    const ox = (W - SWATCH_W * s) / 2;
    const oy = (H - SWATCH_H * s) / 2 - Math.min(W, H) * 0.02;
    const worn = blockSkin;
    blockSkin = id;
    try {
      for (const b of SWATCH) {
        const spec = { shape: b.shape, scale: 1, color: b.color };
        const g = getGeometry(spec);
        off.save();
        off.translate(ox + (b.x - PAD) * s, oy + (b.y - PAD) * s);
        off.scale(s, s);
        drawBlock(off, g, skinned(shapeColor(spec)), textureKeyFor(spec));
        off.restore();
      }
    } finally {
      blockSkin = worn;
    }
    if (swatchCache.size > 40) swatchCache.clear();
    swatchCache.set(cacheKey, art);
  }
  // a soft shadow under the blocks, so they sit on whatever card the shop puts them on
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.max(2, Math.min(W, H) * 0.05);
  ctx.shadowOffsetY = Math.max(1, Math.min(W, H) * 0.025);
  ctx.drawImage(art, 0, 0);
  ctx.restore();
}

/**
 * (1.15.3, the owner: the app's launch picture "with the new blocks inbetween") one plain w x h block (game units) in
 * block skin `skinId` and palette colour `color` (0-7), drawn by the game's own block art at `ctx`'s origin (with the
 * 3-unit transparent edge, like a texture). Used by app/tools/icons.mjs; the worn skin is left as it was.
 */
export function drawSkinRect(ctx, skinId, color, w, h) {
  if (!ctx) return;
  const id = Object.prototype.hasOwnProperty.call(BLOCK_SKINS, skinId) ? skinId : 'kleur';
  const g = {
    shape: 'block', scale: 1, w, h, pad: PAD, texW: w + 2 * PAD, texH: h + 2 * PAD,
    parts: [R(0, 0, w, h)], cells: [R(0, 0, w, h)], outline: rectOutline(w, h), cx: w / 2, cy: h / 2,
  };
  const worn = blockSkin;
  blockSkin = id;
  try {
    drawBlock(ctx, g, skinned(PALETTE[color] || PALETTE[0]), `rect_${id}_${w}x${h}_${color}`);
  } finally {
    blockSkin = worn;
  }
}

/**
 * (1.18 Blokbotsing, the owner: "can we implement the type of block they have purched") one block of `spec` drawn by the
 * game's own block art in skin `skinId` on a fresh canvas `scale` times its size (with the 3-unit transparent edge, like
 * its texture), for the 3D battle's block faces and cards. The worn skin is left as it was. Null without a canvas.
 */
export function blockFaceCanvas(spec, skinId, scale = 2) {
  const g = getGeometry(spec);
  const c = scratchCanvas(Math.ceil(g.texW * scale), Math.ceil(g.texH * scale));
  if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  const worn = blockSkin;
  blockSkin = Object.prototype.hasOwnProperty.call(BLOCK_SKINS, skinId) ? skinId : 'kleur';
  try {
    drawBlock(ctx, g, skinned(shapeColor(spec)), textureKeyFor(spec));
  } finally {
    blockSkin = worn;
  }
  return { canvas: c, pad: PAD, texW: g.texW, texH: g.texH, w: g.w, h: g.h, pal: (() => { const w0 = blockSkin; blockSkin = Object.prototype.hasOwnProperty.call(BLOCK_SKINS, skinId) ? skinId : 'kleur'; try { return skinned(shapeColor(spec)); } finally { blockSkin = w0; } })() };
}

export function textureKeyFor(spec, name = null) {
  const g = getGeometry(spec);
  if (spec.log) return `log_${Math.round(g.w)}x${Math.round(g.h)}`;
  if (spec.gift) return `gift_${g.shape}_${Math.round(g.w)}x${Math.round(g.h)}`;
  if (spec.foundation) return `found_${g.shape}_${Math.round(g.w)}x${Math.round(g.h)}`;
  const color = PALETTE.indexOf(shapeColor(spec));
  const key = `blk_${g.shape}_${Math.round(g.w)}x${Math.round(g.h)}_${color}${blockSkin === 'kleur' ? '' : `_s${blockSkin}`}`;
  return name ? `${key}_n${nameHash(name)}` : key;
}

/**
 * Draws the block texture once (cached by key) and returns the key. With a
 * sponsor `name` the name is printed on the block's main face (its own texture;
 * size and physics are those of the plain block).
 */
export function ensureTexture(scene, spec, name = null) {
  const label = typeof name === 'string' && name.trim() && canPrintName(spec) && !spec.gift && !spec.foundation ? name.trim() : null;
  const key = textureKeyFor(spec, label);
  const textures = scene.textures;
  let info = texInfo.get(key);
  if (!textures.exists(key)) {
    const g = getGeometry(spec);
    const tex = textures.createCanvas(key, g.texW, g.texH);
    if (!tex) return key;
    // the plain key seeds the details, so a named block is the same block plus its name
    if (spec.log) drawLog(tex.getContext(), g);
    else if (spec.gift) drawGift(tex.getContext(), g);
    else if (spec.foundation) drawFoundation(tex.getContext(), g);
    else drawBlock(tex.getContext(), g, skinned(shapeColor(spec)), textureKeyFor(spec), label);
    tex.refresh();
    if (!info) {
      info = { blocks: new Set(), lastUse: 0, named: !!label };
      texInfo.set(key, info);
    }
  } else if (!info) {
    info = { blocks: new Set(), lastUse: 0, named: !!label };
    texInfo.set(key, info);
  }
  info.lastUse = ++useClock;
  if (texInfo.size > TEX_CACHE_MAX) pruneTextures(textures);
  return key;
}

/**
 * (1.16, Die Lewende Toring) A floor of the Living Tower painted in block skin `skinId` (colour `color`, at `scale`: 2 for
 * the close-up camera), under its own key `key` and outside the block texture cache: its floors stand the whole match, so
 * the cache must never drop them. Returns the key.
 */
export function floorTexture(scene, key, skinId, color, scale = 1) {
  if (scene.textures.exists(key)) return key;
  const spec = { shape: 'floor', color, scale };
  const g = getGeometry(spec);
  const tex = scene.textures.createCanvas(key, g.texW, g.texH);
  if (!tex) return key;
  withBlockSkin(skinId, () => drawBlock(tex.getContext(), g, skinned(shapeColor(spec)), key));
  tex.refresh();
  return key;
}

/**
 * Drops the sponsor-name textures that no live block uses (call at game end or
 * restart, so long sessions with many sponsors don't pile up textures).
 * `keep` lists keys still shown elsewhere (e.g. the block on the crane).
 */
export function releaseNamedTextures(textures, keep = []) {
  const spare = new Set(keep);
  for (const [key, info] of texInfo) {
    if (!info.named || spare.has(key) || textureInUse(info)) continue;
    texInfo.delete(key);
    if (textures && textures.exists(key)) textures.remove(key);
  }
}

/** Number of cached sponsor-name textures (tests / debugging). */
export function namedTextureCount() {
  let n = 0;
  for (const info of texInfo.values()) if (info.named) n++;
  return n;
}

function textureInUse(info) {
  for (const b of info.blocks) {
    if (b.image && b.image.scene) return true;
    info.blocks.delete(b);
  }
  return false;
}

function pruneTextures(textures) {
  const victims = [];
  for (const [key, info] of texInfo) {
    if (info.lastUse > useClock - TEX_RECENT) continue;
    if (textureInUse(info)) continue;
    victims.push([key, info.lastUse]);
  }
  victims.sort((a, b) => a[1] - b[1]);
  let excess = texInfo.size - TEX_CACHE_KEEP;
  for (const [key] of victims) {
    if (excess <= 0) break;
    texInfo.delete(key);
    if (textures.exists(key)) textures.remove(key);
    excess--;
  }
}

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

export class Block {
  constructor(scene, spec, x, y, angle = 0, name = null) {
    this.scene = scene;
    this.spec = spec;
    this.index = spec.i;
    this.geom = getGeometry(spec);
    this.state = 'falling';
    this.rating = null;
    this.quietSteps = 0;
    this.destroyed = false;
    this._b = { minX: 0, minY: 0, maxX: 0, maxY: 0, px: NaN, py: NaN, a: NaN };

    this.body = createBody(spec, x, y, angle);
    this.body.gameBlock = this;
    scene.matter.world.add(this.body);

    this.sponsorName = name || null;
    this.textureKey = ensureTexture(scene, spec, name);
    const info = texInfo.get(this.textureKey);
    if (info) info.blocks.add(this);
    this.image = scene.add.image(x, y, this.textureKey)
      .setOrigin(this.geom.originX, this.geom.originY)
      .setRotation(angle)
      .setDepth(DEPTH.tower);
  }

  /**
   * A landing's weight, drawn only (the physics body never changes): the block squashes onto what it landed on
   * and springs back, and an off-centre landing rocks it a little before it settles. `squash` 0..1 (how hard),
   * `rock` -1..1 (which way, and how far off centre). The scene keeps syncing it until it is over (GameScene.kick).
   */
  kick(squash, rock = 0) {
    if (this.destroyed) return;
    this.kickAt = this.scene.time.now;
    this.kickSquash = squash;
    this.kickRock = rock;
  }

  /** Copy the body pose onto the image (and a landing's squash and rock while it lasts). */
  sync() {
    if (this.destroyed) return;
    const b = this.body;
    let x = b.position.x;
    let y = b.position.y;
    let a = b.angle;
    let sx = 1;
    let sy = 1;
    if (this.kickAt !== undefined) {
      const t = (this.scene.time.now - this.kickAt) / 1000;
      if (t >= KICK_S) {
        this.kickAt = undefined;
      } else {
        const q = this.kickSquash * Math.exp(-t / 0.075) * Math.cos((t * 2 * Math.PI) / 0.2);
        sy = 1 - KICK_SQUASH * q;
        sx = 1 + KICK_SQUASH * 0.5 * q;
        const r = this.kickRock * KICK_ROCK * Math.exp(-t / 0.18) * Math.sin((t * 2 * Math.PI) / 0.3);
        // the bottom stays where it is: the squash shrinks the image towards its centroid (move it down by what
        // the bottom rose), and the rock turns it about the middle of its bottom (the centroid moves sideways)
        const hb = this.geom.h - this.geom.cy;
        const down = (1 - sy) * hb;
        const side = hb * Math.sin(r);
        const sin = Math.sin(a);
        const cos = Math.cos(a);
        x += cos * side - sin * down;
        y += sin * side + cos * down;
        a += r;
      }
    }
    this.image.setPosition(x, y);
    this.image.rotation = a;
    if (this.image.scaleX !== sx || this.image.scaleY !== sy) this.image.setScale(sx, sy);
    if (this.winImage) {
      this.winImage.setPosition(x, y);
      this.winImage.rotation = a;
      const r = this.winRes || 1;
      if (this.winImage.scaleX !== sx / r || this.winImage.scaleY !== sy / r) this.winImage.setScale(sx / r, sy / r);
    }
  }

  /**
   * (1.16, Die Lewende Toring) the block's windows, a picture over its own: [{ look, who, tribe }] in window order
   * (js/game/residents.js windowSlots); an empty list or null takes them away. Redrawn once the portraits are in.
   */
  setWindows(wins) {
    if (this.destroyed) return;
    this.winRes = 1;
    this.wins = wins && wins.length ? wins : null;
    if (!this.wins) {
      if (this.winImage) this.winImage.destroy();
      this.winImage = null;
      return;
    }
    const key = ensureWindows(this.scene, this.geom, this.wins, PAD);
    if (!this.winImage) {
      this.winImage = this.scene.add.image(this.image.x, this.image.y, key)
        .setOrigin(this.geom.originX, this.geom.originY)
        .setDepth(DEPTH.tower + 0.5);
    } else {
      this.winImage.setTexture(key);
    }
    this.winImage.rotation = this.image.rotation;
    this.winImage.setScale(this.image.scaleX, this.image.scaleY);
    const wins2 = this.wins;
    whenPortraits(() => { if (!this.destroyed && this.wins === wins2) this.setWindows(wins2); });
  }

  /**
   * (1.16, Die Lewende Toring in the game) the block's own windows picture (js/game/living.js paints it, `res` times
   * sharper than the block): shown over the block and moving with it; null takes it away.
   */
  setWindowTexture(key, res = 1) {
    if (this.destroyed) return;
    this.wins = null;
    this.winRes = res;
    if (!key) {
      if (this.winImage) this.winImage.destroy();
      this.winImage = null;
      return;
    }
    if (!this.winImage) {
      this.winImage = this.scene.add.image(this.image.x, this.image.y, key)
        .setOrigin(this.geom.originX, this.geom.originY)
        .setDepth(DEPTH.tower + 0.5);
    } else if (this.winImage.texture.key !== key) {
      this.winImage.setTexture(key);
    }
    this.winImage.rotation = this.image.rotation;
    this.winImage.setScale(this.image.scaleX / res, this.image.scaleY / res);
    this.winImage.setVisible(this.image.visible);
  }

  /** Tight axis-aligned bounds from the hull vertices (Matter's own bounds include a velocity sweep). */
  _bounds() {
    const b = this.body;
    const c = this._b;
    if (c.px === b.position.x && c.py === b.position.y && c.a === b.angle) return c;
    const v = b.vertices;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < v.length; i++) {
      const p = v[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    c.minX = minX; c.minY = minY; c.maxX = maxX; c.maxY = maxY;
    c.px = b.position.x; c.py = b.position.y; c.a = b.angle;
    return c;
  }

  get top() { return this._bounds().minY; }
  get bottom() { return this._bounds().maxY; }
  get left() { return this._bounds().minX; }
  get right() { return this._bounds().maxX; }
  /** Centroid x (the point Perfek snapping and the ghost use; equals the bbox centre for symmetric shapes). */
  get centerX() { return this.body.position.x; }
  get centerY() { return this.body.position.y; }
  get isStatic() { return !!this.body.isStatic; }

  /** Velocity in px/s (converted to Matter's px-per-step units). */
  setVelocityPxS(vx, vy) {
    Mt().Body.setVelocity(this.body, { x: vx / 60, y: vy / 60 });
  }

  setFriction(mul = 1) {
    if (this.body.isStatic) return;
    this.body.friction = PHYSICS.block.friction * mul;
  }

  freeze() {
    if (this.destroyed || this.state === 'frozen') return;
    const M = Mt();
    M.Sleeping.set(this.body, false);
    M.Body.setStatic(this.body, true);
    this.image.setTint(FROZEN_TINT);
    this.state = 'frozen';
  }

  wake() {
    if (this.destroyed || this.body.isStatic) return;
    Mt().Sleeping.set(this.body, false);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const info = texInfo.get(this.textureKey);
    if (info) info.blocks.delete(this);
    if (this.scene && this.scene.matter && this.scene.matter.world) this.scene.matter.world.remove(this.body);
    this.body.gameBlock = null;
    // keep the (destroyed) image reference so late readers don't crash
    if (this.image) this.image.destroy();
    if (this.winImage) this.winImage.destroy();
  }
}
