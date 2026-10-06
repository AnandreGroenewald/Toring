// Blocks: shape geometry, generated textures, Matter bodies and the Block
// game object. Shapes are defined in bbox-local px (top-left origin). Every
// body is built in those same local coordinates, so the image origin sits
// exactly on the body's centroid (centre of mass) and image + body coincide.

import { PHYSICS, PALETTE, DEPTH, FONT } from '../config.js';
import { SHAPE_NAMES } from '../core/strings.js';

const PAD = 3;             // transparent texture padding around the shape
const CORNER_R = 6;        // visual corner radius (physics corners stay sharp)
const CELL = 44;           // L / J / T cell size
const FROZEN_TINT = 0xd6d6d6;

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
  pillar: { w: 52, h: 128, parts: [R(0, 0, 52, 128)] },
  wedge: { w: 150, h: 60, poly: [P(30, 0), P(120, 0), P(150, 60), P(0, 60)] },
  arch: {
    w: 132, h: 88,
    parts: [R(0, 0, 132, 36), R(0, 36, 36, 52), R(96, 36, 36, 52)],
    outline: [P(0, 0), P(132, 0), P(132, 88), P(96, 88), P(96, 36), P(36, 36), P(36, 88), P(0, 88)],
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

/** PALETTE entry for a spec. */
export function shapeColor(spec) {
  const n = PALETTE.length;
  const i = Number.isFinite(spec.color) ? ((Math.floor(spec.color) % n) + n) % n : 0;
  return PALETTE[i];
}

// ---------------------------------------------------------------------------
// Physics body
// ---------------------------------------------------------------------------

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
    const beam = g.cells[0];
    // keystone in the middle of the beam
    const kw = Math.round(beam.h * 0.75);
    const cx = beam.x + beam.w / 2;
    const top = beam.y;
    const bot = beam.y + beam.h;
    ctx.beginPath();
    ctx.moveTo(cx - kw / 2, top);
    ctx.lineTo(cx + kw / 2, top);
    ctx.lineTo(cx + kw / 2 - 5, bot);
    ctx.lineTo(cx - kw / 2 + 5, bot);
    ctx.closePath();
    ctx.fillStyle = rgba(0xffffff, 0.16);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.dark, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();
    // shadow under the beam inside the opening
    const legL = g.cells[1];
    const legR = g.cells[2];
    ctx.fillStyle = rgba(0x000000, 0.12);
    ctx.fillRect(legL.x + legL.w, bot - 3, legR.x - legL.x - legL.w, 3);
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

function drawBlock(ctx, g, pal, key, name = null) {
  const rnd = seededRand(key);
  const outlineCol = mix(pal.dark, 0x000000, 0.38);
  ctx.save();
  ctx.translate(PAD, PAD);

  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = hex(pal.fill);
  ctx.fillRect(0, 0, g.w, g.h);
  if (g.cells.length) {
    for (const c of g.cells) drawCellBands(ctx, c, pal);
  } else {
    drawCellBands(ctx, { x: 0, y: 0, w: g.w, h: g.h }, pal);
  }
  const detail = DETAIL[g.shape];
  if (detail) detail(ctx, g, pal, rnd);
  if (g.cells.length > 1) drawSeams(ctx, g.cells, rgba(outlineCol, 0.8));
  if (name) drawName(ctx, g, pal, name);   // still clipped to the shape: the ghost silhouette is unchanged
  ctx.restore();

  roundedPolyPath(ctx, g.outline, CORNER_R);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = hex(outlineCol);
  ctx.stroke();
  ctx.restore();
}

export function textureKeyFor(spec, name = null) {
  const g = getGeometry(spec);
  const color = PALETTE.indexOf(shapeColor(spec));
  const key = `blk_${g.shape}_${Math.round(g.w)}x${Math.round(g.h)}_${color}`;
  return name ? `${key}_n${nameHash(name)}` : key;
}

/**
 * Draws the block texture once (cached by key) and returns the key. With a
 * sponsor `name` the name is printed on the block's main face (its own texture;
 * size and physics are those of the plain block).
 */
export function ensureTexture(scene, spec, name = null) {
  const label = typeof name === 'string' && name.trim() && canPrintName(spec) ? name.trim() : null;
  const key = textureKeyFor(spec, label);
  const textures = scene.textures;
  let info = texInfo.get(key);
  if (!textures.exists(key)) {
    const g = getGeometry(spec);
    const tex = textures.createCanvas(key, g.texW, g.texH);
    if (!tex) return key;
    // the plain key seeds the details, so a named block is the same block plus its name
    drawBlock(tex.getContext(), g, shapeColor(spec), textureKeyFor(spec), label);
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

  /** Copy the body pose onto the image. */
  sync() {
    if (this.destroyed) return;
    const b = this.body;
    this.image.setPosition(b.position.x, b.position.y);
    this.image.rotation = b.angle;
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
  }
}
