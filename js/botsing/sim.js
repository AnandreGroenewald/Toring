// (1.18 3D) Blokbotsing: the battle's physics. Stapel's own blocks and Matter tuning (js/game/blocks.js createBody, with
// its stacking patches), so a tower stands, wobbles and tips exactly as in Stapel. Two static sea stacks; everything that
// falls off them drops into the sea. Every block carries an element (rules.js ELEMENT): built, it defends; thrown, it
// strikes where it lands, then breaks apart. Blocks have strength (HP): hits and fire crack them, at 0 they shatter; the
// crown's glass cabinet cracks and breaks. `predict()` runs a throw ahead with the same steps Matter takes.
import { createBody, getGeometry } from '../game/blocks.js';
import { PHYSICS } from '../config.js';
import {
  STACK, sideX, towardFoe, START, CROWN, LAUNCH, BUILD, PERFECT_BUILD, SETTLE, SEA, G_STEP, PERFECT_NEAR,
  PERFECT_THROW_DENSITY, PX, LAYOUT, FLIGHT_G, towerX, SHAPE_THROW, BUILD_HEAVY, ELEMENT, DISSOLVE_STEPS, rng,
} from './rules.js';

const Mt = () => Phaser.Physics.Matter.Matter;
/** Each block's strength (the owner: "it doesnt indecate any damage?"): a hit cracks it, at 0 it shatters. */
export const HP = { cube: 4, plank: 3, slab: 3, brick: 3, wedge: 3, crate: 2, pillar: 3, crown: 3 };
/** The crown stands in a glass cabinet (the owner: "Put it in a glass cabinet"): hits crack the glass (the crown's hp),
 * the third shatters it; then the crown is this much lighter, easy to throw off. */
export const GLASS = { brokenDensity: 1.1 };
const BASE_DENSITY = PHYSICS.block.density;
const STACK_SLOPE = 0.12;   // px wider per px further down (world.js SLOPE: m per m)
const DT = 1000 / 60;
const STEP_S = 1 / 60;

/** Size and centroid of a shape (px, Stapel's own outline with a top-left origin). */
export function shapeInfo(shape) {
  if (shape === 'crown') {
    const w = CROWN.w;
    const h = CROWN.h;
    return { shape, w, h, cx: w / 2, cy: h / 2, outline: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] };
  }
  const g = getGeometry({ shape });
  return { shape, w: g.w, h: g.h, cx: g.cx, cy: g.cy, outline: g.outline };
}

export function createSim({ seed = 1 } = {}) {
  const M = Mt();
  const engine = M.Engine.create({
    enableSleeping: PHYSICS.enableSleeping,
    positionIterations: PHYSICS.positionIterations,
    velocityIterations: PHYSICS.velocityIterations,
    constraintIterations: PHYSICS.constraintIterations,
  });
  engine.gravity.x = 0;
  engine.gravity.y = PHYSICS.gravityY;
  engine.gravity.scale = 0.001;
  const world = engine.world;
  const entries = [];
  const events = [];
  const queue = [];
  const srand = rng((seed | 0) ^ 0x5bd1e995);   // (fire's spread: the same on both phones of a friend battle)
  let nextId = 1;
  let stepN = 0;
  let quiet = 0;

  const mat = PHYSICS.block;
  // the stacks: flat on top, widening as the rock does (world.js SLOPE), so what falls off slides down the rock
  const a = STACK.w;
  const bw = STACK.w + 2 * STACK.depth * STACK_SLOPE;
  const H = STACK.depth;
  const dTop = (H * (a + 2 * bw)) / (3 * (a + bw));   // (the trapezoid's centroid below its top)
  const stacks = [0, 1].map((side) => {
    const b = M.Body.create({
      isStatic: true, label: 'stack', friction: mat.friction, frictionStatic: mat.frictionStatic, restitution: 0, slop: mat.slop,
      vertices: [{ x: -a / 2, y: 0 }, { x: a / 2, y: 0 }, { x: bw / 2, y: H }, { x: -bw / 2, y: H }],
      position: { x: sideX(side), y: STACK.topY + dTop },
    });
    b.plugin = { bt: { kind: 'stack', side, body: b } };
    M.Composite.add(world, b);
    return b;
  });

  function makeBody(shape, x, y, angle = 0) {
    if (shape === 'crown') {
      const b = M.Bodies.rectangle(x, y, CROWN.w, CROWN.h, {
        label: 'block', friction: mat.friction, frictionStatic: mat.frictionStatic, frictionAir: mat.frictionAir,
        restitution: 0, slop: mat.slop, density: BASE_DENSITY * CROWN.density,
      });
      b.sleepRadius = Math.hypot(CROWN.w, CROWN.h) / 2;
      if (angle) M.Body.setAngle(b, angle);
      return b;
    }
    return createBody({ shape }, x, y, angle);
  }
  function add(shape, side, role, x, y, extra = {}) {
    const info = shapeInfo(shape);
    const body = makeBody(shape, x, y, extra.angle || 0);
    const hp = HP[shape] || 3;
    const e = {
      id: nextId++, shape, side, role, body, w: info.w, h: info.h, alive: true, wet: false, landed: role !== 'built',
      perfect: false, flying: false, born: stepN, element: null, hp, hpMax: hp, burnT: 0, burnTick: 0, vineT: 0, vineDir: 0,
      ...extra,
    };
    body.plugin = { bt: e };
    entries.push(e);
    M.Composite.add(world, body);
    return e;
  }
  /** Centroid y for a block of `shape` whose bottom rests at `bottomY`. */
  const yOn = (shape, bottomY) => { const s = shapeInfo(shape); return bottomY - (s.h - s.cy); };

  // the two starting towers (rules.js START, row by row) at the front of each stack, the crown behind them (LAYOUT)
  const crowns = [];
  for (const side of [0, 1]) {
    const dir = towardFoe(side);
    let rowBottom = STACK.topY;
    let row = 0;
    let rowTop = rowBottom;
    for (const [shape, ox, r] of START) {
      if (r !== row) { row = r; rowBottom = rowTop; }
      const s = shapeInfo(shape);
      add(shape, side, 'start', sideX(side) + dir * (LAYOUT.tower + ox) + (s.cx - s.w / 2), yOn(shape, rowBottom));
      rowTop = Math.min(rowTop, rowBottom - s.h);
    }
    crowns[side] = add('crown', side, 'crown', sideX(side) + dir * LAYOUT.crown, yOn('crown', STACK.topY));
  }

  // ------------------------------------------------------------------------------------------------ helpers
  const live = () => entries.filter((e) => e.alive);
  const onStack = (e, side) => Math.abs(e.body.position.x - sideX(side)) < STACK.w / 2 + 80 && e.body.bounds.max.y <= STACK.topY + 6;
  /** Which stack a point belongs to (the nearer one). */
  const stackAt = (x) => (Math.abs(x - sideX(0)) < Math.abs(x - sideX(1)) ? 0 : 1);
  /** The tower's top (smallest y) over everything resting on that stack. */
  function towerTopY(side) {
    let top = STACK.topY;
    for (const e of entries) {
      if (!e.alive || e.flying || e.role === 'proj' || (e.role === 'built' && !e.landed)) continue;
      if (onStack(e, side)) top = Math.min(top, e.body.bounds.min.y);
    }
    return top;
  }
  const heightM = (side) => (STACK.topY - towerTopY(side)) / PX;
  function launchParams(side, shape) {
    const dir = towardFoe(side);
    const x0 = sideX(side) + dir * (STACK.w / 2 + LAUNCH.out);
    const y0 = towerTopY(side) - LAUNCH.up;
    const v = LAUNCH.V0 * (1 + LAUNCH.perM * heightM(side)) * (SHAPE_THROW[shape]?.speed || 1);
    return { x0, y0, v, dir };
  }
  function remove(e, why) {
    if (!e.alive) return;
    e.alive = false;
    e.flying = false;
    e.burnT = 0;
    e.vineT = 0;
    M.Composite.remove(world, e.body);
    events.push({ type: why, entry: e, x: e.body.position.x, y: e.body.position.y });
    wakeAll();
  }
  /** (the owner: "the block is floating") Matter never wakes a sleeping block when what held it is removed: wake all. */
  function wakeAll() {
    for (const o of entries) if (o.alive && o.body.isSleeping) M.Sleeping.set(o.body, false);
    quiet = 0;
  }
  const wake = (b) => { if (b.isSleeping) M.Sleeping.set(b, false); };
  /** `n` damage to a block (never the rock or a shot in flight): cracks, then it shatters; the crown's glass breaks. */
  function damage(e, n, by) {
    if (!e || !e.alive || e.kind === 'stack' || n <= 0 || e.flying || e.role === 'proj') return;
    if (e.role === 'crown') {
      if (e.hp <= 0) return;
      e.hp = Math.max(0, e.hp - 1);   // (one crack a hit, however hard: the third shatters it)
      events.push({ type: 'damage', entry: e, n: 1, hp: e.hp, by, x: e.body.position.x, y: e.body.bounds.min.y });
      if (e.hp <= 0) {
        M.Body.setDensity(e.body, BASE_DENSITY * GLASS.brokenDensity);
        events.push({ type: 'glass', entry: e, x: e.body.position.x, y: e.body.position.y });
        wakeAll();
      }
      return;
    }
    e.hp = Math.max(0, e.hp - n);
    events.push({ type: 'damage', entry: e, n, hp: e.hp, by, x: e.body.position.x, y: e.body.bounds.min.y });
    if (e.hp <= 0) remove(e, 'break');
  }
  /** How much a shot's first touch hurts: its speed (full power ≈ 1), its weight, a Perfek. 1 to 4. */
  function hitDamage(me, speed) {
    const k = (speed / LAUNCH.V0) * Math.sqrt(me.dens || 1) * 1.6 * (me.perfect ? 1.25 : 1);
    return Math.max(1, Math.min(4, Math.round(k)));
  }
  /** A side's strength: every block of its own still standing on its rock, counted by what's left of it. */
  function strength(side) {
    let n = 0;
    for (const e of entries) if (e.alive && !e.wet && e.side === side && (e.role === 'built' || e.role === 'start') && e.landed && onStack(e, side)) n += e.hp;
    return n;
  }
  /** Blocks that could be hit by an element on `side`'s stack (not shots), nearest first, within `r` of (x, y). */
  function near(side, x, y, r) {
    const out = [];
    for (const e of entries) {
      if (!e.alive || e.role === 'proj' || e.wet || !onStack(e, side)) continue;
      const d = Math.hypot(e.body.position.x - x, e.body.position.y - y);
      if (d <= r + Math.max(e.w, e.h) * 0.35) out.push([d, e]);
    }
    return out.sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  }
  const touching = (p, q, pad = 8) => {
    const A = p.body.bounds;
    const B = q.body.bounds;
    return A.min.x - pad < B.max.x && A.max.x + pad > B.min.x && A.min.y - pad < B.max.y && A.max.y + pad > B.min.y;
  };
  /** Within reach of a side's ready water barrel: no fire takes. */
  const doused = (e) => entries.some((w) => w.alive && w.barrel && w.side === e.side && w.landed && Math.hypot(w.body.position.x - e.body.position.x, w.body.position.y - e.body.position.y) < ELEMENT.water.barrel.r);

  // ------------------------------------------------------------------------------------------ the prediction
  const testPts = (hx, hy) => [[0, 0], [hx, 0], [-hx, 0], [0, hy], [0, -hy], [hx, hy], [-hx, hy], [hx, -hy], [-hx, -hy]];
  function candidates() {
    const out = stacks.map((b) => b.plugin.bt);
    for (const e of entries) if (e.alive && !e.flying && !(e.role === 'built' && !e.landed)) out.push(e);
    return out;
  }
  function hitAt(x, y, hx, hy, cands, pts) {
    for (const c of cands) {
      const b = c.body;
      const bb = b.bounds;
      if (x + hx < bb.min.x || x - hx > bb.max.x || y + hy < bb.min.y || y - hy > bb.max.y) continue;
      const parts = b.parts.length > 1 ? b.parts.slice(1) : [b];
      for (const p of parts) for (const [ox, oy] of pts) if (M.Vertices.contains(p.vertices, { x: x + ox, y: y + oy })) return c;
    }
    return null;
  }
  /**
   * Where a throw goes: { path: [{x, y}], hit: { kind: 'sea'|'stack'|'block'|'crown', entry, x, y, side }, perfect }.
   * Steps exactly as Matter does (gravity in flight, air), until it touches something or the sea.
   */
  function predict(side, shape, theta, power = 1) {
    const s = shapeInfo(shape);
    const p = launchParams(side, shape);
    p.v *= power;
    const hx = s.w / 2;
    const hy = s.h / 2;
    let x = p.x0;
    let y = p.y0;
    let vx = p.dir * p.v * Math.cos(theta);
    let vy = -p.v * Math.sin(theta);
    const air = 1 - LAUNCH.air;
    const foeCrown = crowns[1 - side];
    const fc = foeCrown.alive ? foeCrown.body.position : null;
    let nearC = Infinity;
    const path = [{ x, y }];
    let hit = null;
    const cands = candidates();
    const pts = testPts(hx * 0.9, hy * 0.9);
    let topAll = 0;   // (nothing to touch above the highest thing there is)
    for (const c of cands) topAll = Math.min(topAll, c.body.bounds.min.y);
    for (let i = 0; i < LAUNCH.maxSteps; i++) {
      vx *= air;
      vy = vy * air + G_STEP * FLIGHT_G;
      x += vx;
      y += vy;
      if (i % 2 === 0) path.push({ x, y });
      if (fc) nearC = Math.min(nearC, Math.hypot(x - fc.x, y - fc.y));
      if (y + hy > 0) { hit = { kind: 'sea', x, y: 0 }; break; }
      if (i < 4 || y + hy < topAll) continue;   // (clear of the jib; above everything)
      const c = hitAt(x, y, hx, hy, cands, pts);
      if (c) {
        hit = { kind: c.kind === 'stack' ? 'stack' : c.role === 'crown' ? 'crown' : 'block', entry: c.kind === 'stack' ? null : c, side: c.side, x, y };
        break;
      }
    }
    path.push({ x, y });
    if (!hit) hit = { kind: 'none', x, y };
    const perfect = !!fc && ((hit.kind === 'crown' && hit.side !== side) || nearC < Math.max(CROWN.w, CROWN.h) / 2 + Math.min(hx, hy) + PERFECT_NEAR * 0.5);
    return { path, hit, perfect, v: p.v, x0: p.x0, y0: p.y0 };
  }

  // -------------------------------------------------------------------------------------------- the actions
  /** A throw: the block leaves the launch point at angle `theta` with `power` (0-1) of its full speed. */
  function launch(side, shape, element, theta, perfect = false, power = 1) {
    const p = launchParams(side, shape);
    p.v *= power;
    const st = SHAPE_THROW[shape] || { density: 1 };
    const e = add(shape, side, 'proj', p.x0, p.y0, { flying: true, perfect, element, dens: st.density });
    const b = e.body;
    M.Body.setDensity(b, b.density * st.density * (perfect ? PERFECT_THROW_DENSITY : 1));
    b.frictionAir = LAUNCH.air;
    M.Body.setVelocity(b, { x: p.dir * p.v * Math.cos(theta), y: -p.v * Math.sin(theta) });
    quiet = 0;
    events.push({ type: 'launch', entry: e, x: p.x0, y: p.y0, perfect });
    return e;
  }
  /** A build: the block is let go from the hook at (x, y), keeping a little of the trolley's speed. */
  function release(side, shape, element, x, y, vx = 0) {
    const e = add(shape, side, 'built', x, y, {
      landed: false, element, fireWall: element === 'vuur', barrel: element === 'water', springReady: element === 'plof',
    });
    if (BUILD_HEAVY[shape]) M.Body.setDensity(e.body, e.body.density * BUILD_HEAVY[shape]);
    M.Body.setVelocity(e.body, { x: vx * BUILD.carry, y: 0 });
    quiet = 0;
    events.push({ type: 'drop', entry: e, x, y });
    return e;
  }

  // -------------------------------------------------------------------------------------------- the elements
  /** 🔥 Veldbrand: what's within reach on that stack catches fire (a water barrel's reach stays wet). */
  function ignite(side, x, y) {
    const v = ELEMENT.vuur;
    let saved = null;
    for (const e of near(side, x, y, v.ignite)) {
      if (!e.wet && e.burnT <= 0 && doused(e)) { saved = saved || e; continue; }
      setAlight(e);
    }
    if (saved) events.push({ type: 'douse', entry: saved, x: saved.body.position.x, y: saved.body.bounds.min.y });
  }
  function setAlight(e) {
    if (!e.alive || e.wet || e.burnT > 0 || doused(e)) return;
    e.burnT = ELEMENT.vuur.secs;
    e.burnTick = ELEMENT.vuur.first;
    e.crownBurnt = false;
    events.push({ type: 'ignite', entry: e, x: e.body.position.x, y: e.body.position.y });
  }
  function putOut(e, why = 'out') {
    if (e.burnT <= 0) return;
    e.burnT = 0;
    events.push({ type: 'burnout', entry: e, why, x: e.body.position.x, y: e.body.position.y });
  }
  /** 🌿 Rankgryp: vines grab the nearest blocks (the crown too) and drag them to the sea, outwards from the rock. */
  function grab(side, x, y) {
    const v = ELEMENT.gras;
    const got = near(side, x, y, v.r).slice(0, v.max);
    for (const e of got) {
      e.vineT = v.steps;
      e.vineDir = Math.sign(e.body.position.x - sideX(side)) || -towardFoe(side);
      wake(e.body);
    }
    events.push({ type: 'grab', list: got, x, y, side });
    quiet = 0;
  }
  /** 💧 Vloedgolf: everything within reach is shoved along the throw; fire there goes out. */
  function wave(side, x, y, dir) {
    const v = ELEMENT.water;
    for (const e of near(side, x, y, v.r)) {
      const d = Math.hypot(e.body.position.x - x, e.body.position.y - y);
      const k = Math.max(0.2, 1 - d / v.r);
      const heavy = Math.sqrt(e.body.density / BASE_DENSITY);
      const dv = (v.dv * k) / Math.max(1, heavy * 0.75);
      wake(e.body);
      M.Body.setVelocity(e.body, { x: e.body.velocity.x + dir * dv, y: e.body.velocity.y - dv * 0.22 });
      putOut(e, 'water');
    }
    events.push({ type: 'wave', x, y, dir, side });
    quiet = 0;
  }
  /** 💣 Plofstof: an explosion where the shot is (damage by distance, a push outwards). */
  function blast(e) {
    const c = { x: e.body.position.x, y: e.body.position.y };
    const { r, dv } = ELEMENT.plof;
    remove(e, 'blast');
    for (const o of entries) {
      if (!o.alive || o.role === 'proj') continue;
      const b = o.body;
      const dx = b.position.x - c.x;
      const dy = b.position.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const k = 1 - d / r;
      queue.push(() => damage(o, d < r * 0.45 ? 3 : d < r * 0.75 ? 2 : 1, 'blast'));
      let ux = d > 1 ? dx / d : 0;
      let uy = (d > 1 ? dy / d : -1) - 0.45;
      const n = Math.hypot(ux, uy) || 1;
      ux /= n;
      uy /= n;
      const heavy = Math.sqrt(b.density / BASE_DENSITY);
      const kick = (dv * k) / Math.max(1, heavy * 0.8);
      wake(b);
      M.Body.setVelocity(b, { x: b.velocity.x + ux * kick, y: b.velocity.y + uy * kick });
      M.Body.setAngularVelocity(b, b.angularVelocity + (srand() - 0.5) * 0.12 * k);
    }
    quiet = 0;
  }
  /** 🌿 Rankanker (built): it and what it touches root together, heavier and grippier. */
  function root(e) {
    const v = ELEMENT.gras.root;
    const list = [e, ...entries.filter((o) => o !== e && o.alive && o.role !== 'proj' && o.side === e.side && touching(o, e, v.reach))];
    for (const o of list) {
      if (o.rooted) continue;
      o.rooted = true;
      M.Body.setDensity(o.body, o.body.density * v.density);
      o.body.frictionStatic = Math.max(o.body.frictionStatic, v.friction);
      o.body.friction = Math.max(o.body.friction, 1.2);
    }
    events.push({ type: 'root', entry: e, list });
  }
  /** Where a thrown block strikes: its element on the stack it landed on. */
  function strike(me, at, dirX) {
    const side = stackAt(at.x);
    switch (me.element) {
      case 'vuur': ignite(side, at.x, at.y); break;
      case 'gras': grab(side, at.x, at.y); break;
      case 'water': wave(side, at.x, at.y, dirX); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------------------------------- contacts and powers
  function rate(e, other) {
    e.landed = true;
    const b = e.body;
    let rating = 'S';
    if (other.kind === 'stack') {
      rating = Math.abs(b.position.x - towerX(e.side)) < 40 ? 'G' : 'S';
    } else {
      const sw = other.w;
      const dx = b.position.x - other.body.position.x;
      const tilt = Math.abs(Math.atan2(Math.sin(other.body.angle), Math.cos(other.body.angle)));
      const tolP = Math.min(BUILD.perfectTol, BUILD.perfectFrac * sw);
      const tolG = Math.max(BUILD.goodTol, sw * 0.25);
      if (Math.abs(dx) <= tolP && tilt < 0.06 && other.side === e.side && other.role !== 'proj') rating = 'P';
      else if (Math.abs(dx) <= tolG) rating = 'G';
      if (rating === 'P') {
        e.snapDx = other.body.position.x - b.position.x;
        M.Body.setPosition(b, { x: other.body.position.x, y: b.position.y });
        M.Body.setAngle(b, other.body.angle);
        M.Body.setVelocity(b, { x: 0, y: Math.min(b.velocity.y, 1) });
        M.Body.setAngularVelocity(b, 0);
        M.Body.setDensity(b, b.density * PERFECT_BUILD.density);
        b.frictionStatic = PERFECT_BUILD.frictionStatic;
        e.perfect = true;
      } else if (rating === 'G' && other.side === e.side) {
        e.snapDx = -dx * BUILD.goodEase;
        M.Body.setPosition(b, { x: b.position.x - dx * BUILD.goodEase, y: b.position.y });
      }
    }
    events.push({ type: 'land', entry: e, rating, x: b.position.x, y: b.bounds.max.y, snapDx: e.snapDx || 0 });
    e.snapDx = 0;
    if (e.element === 'gras') root(e);
  }
  function onCollide(ev) {
    for (const pair of ev.pairs) {
      const A = pair.bodyA.parent;
      const B = pair.bodyB.parent;
      const a = A.plugin?.bt;
      const b = B.plugin?.bt;
      if (!a || !b) continue;
      for (const [me, other] of [[a, b], [b, a]]) {
        if (me.kind === 'stack' || !me.alive) continue;
        // a built block's first touch: its rating (a Rankanker roots then)
        if (me.role === 'built' && !me.landed) queue.push(() => me.alive && !me.landed && rate(me, other));
        // a burning block sets what it touches alight (a chance each touch)
        if (me.burnT > 0 && other.kind !== 'stack' && other.alive && other.role !== 'proj' && other.burnT <= 0 && srand() < ELEMENT.vuur.spread) {
          queue.push(() => setAlight(other));
        }
        // a shot's first touch: the defences, its damage and its element; it breaks apart a moment later
        if (me.role === 'proj' && me.flying) {
          const own = other.kind !== 'stack' && other.side === me.side;
          if (own && stepN - me.born < 12) continue;   // (leaving its own launch)
          me.flying = false;
          const pv = me.pv || { x: me.body.velocity.x, y: me.body.velocity.y };
          const hitV = Math.hypot(pv.x, pv.y);
          const dirX = Math.sign(pv.x) || towardFoe(me.side);
          queue.push(() => {
            me.body.frictionAir = PHYSICS.block.frictionAir;
            events.push({ type: 'hit', entry: me, other, x: me.body.position.x, y: me.body.position.y, speed: hitV, onto: other.kind === 'stack' ? 'stack' : other.role });
          });
          const foe = other.kind !== 'stack' && other.side !== me.side;
          // 🔥 a Vuurmuur burns the shot to ash
          if (foe && other.role === 'built' && other.fireWall && other.alive) {
            queue.push(() => {
              if (!me.alive || !other.fireWall) return;
              other.fireWall = false;
              remove(me, 'burnup');
              events.push({ type: 'wallburn', entry: other, x: other.body.position.x, y: other.body.bounds.min.y });
            });
            continue;
          }
          // 💧 a Watervat soaks it: dead in the water
          if (foe && other.role === 'built' && other.barrel && other.alive) {
            queue.push(() => {
              if (!me.alive || !other.barrel) return;
              other.barrel = false;
              M.Body.setVelocity(me.body, { x: pv.x * 0.1, y: Math.max(1, pv.y * 0.1) });
              events.push({ type: 'soak', entry: other, x: other.body.position.x, y: other.body.bounds.min.y });
              damage(other, 1, 'hit');
              for (const o of near(other.side, other.body.position.x, other.body.position.y, ELEMENT.water.barrel.r)) putOut(o, 'water');
              me.dissolveAt = stepN + DISSOLVE_STEPS;
            });
            continue;
          }
          // 💣 a Verrassing flings it back at them
          if (foe && other.role === 'built' && other.springReady && other.alive) {
            queue.push(() => {
              if (!me.alive || !other.springReady) return;
              other.springReady = false;
              me.flying = true;
              me.born = stepN;
              me.side = other.side;   // (now it's theirs, flying home)
              me.body.frictionAir = LAUNCH.air;
              M.Body.setVelocity(me.body, { x: -pv.x * 0.85, y: -Math.abs(pv.y) * 0.4 - 7 });
              M.Body.setAngularVelocity(me.body, (srand() - 0.5) * 0.2);
              events.push({ type: 'spring', entry: other, x: other.body.position.x, y: other.body.bounds.min.y });
            });
            continue;
          }
          if (me.element === 'plof') { queue.push(() => me.alive && blast(me)); continue; }
          if (other.kind !== 'stack' && other.side !== me.side) {
            const dmg = hitDamage(me, hitV);
            queue.push(() => damage(other, dmg, 'hit'));
          }
          queue.push(() => {
            if (!me.alive) return;
            strike(me, { x: me.body.position.x, y: me.body.position.y }, dirX);
            me.dissolveAt = stepN + DISSOLVE_STEPS;
          });
        }
      }
    }
  }
  M.Events.on(engine, 'collisionStart', onCollide);

  function seaCheck() {
    for (const e of entries) {
      if (!e.alive) continue;
      const b = e.body;
      if (!e.wet && b.bounds.max.y > 0) {
        if (e.role === 'proj' && e.flying && e.element === 'plof') { events.push({ type: 'splash', entry: e, x: b.position.x, mass: b.mass, vy: b.velocity.y }); blast(e); continue; }
        e.wet = true;
        e.flying = false;
        if (e.burnT > 0) putOut(e, 'sea');
        events.push({ type: 'splash', entry: e, x: b.position.x, mass: b.mass, vy: b.velocity.y });
        if (e.role === 'crown') events.push({ type: 'crown', side: e.side, x: b.position.x });
      }
      if (b.position.y > SEA.gone) remove(e, 'sunk');
    }
  }
  /** Fire burns (damage now and then), vines drag, thrown blocks break apart after their strike. */
  function elementsStep() {
    const v = ELEMENT.vuur;
    const g = ELEMENT.gras;
    for (const e of entries) {
      if (!e.alive) continue;
      if (e.burnT > 0) {
        if (doused(e)) { putOut(e, 'water'); continue; }
        e.burnT -= STEP_S;
        e.burnTick -= STEP_S;
        if (e.burnTick <= 0) {
          e.burnTick = v.every;
          if (e.role === 'crown') { if (!e.crownBurnt) { e.crownBurnt = true; damage(e, 1, 'fire'); } } else damage(e, v.dmg, 'fire');
        }
        if (e.alive && e.burnT <= 0) { e.burnT = 0; events.push({ type: 'burnout', entry: e, why: 'out', x: e.body.position.x, y: e.body.position.y }); }
        // (a veld fire: every half second it may catch what it rests against)
        e.spreadT = (e.spreadT || 0) + STEP_S;
        if (e.alive && e.burnT > 0 && e.spreadT >= 0.5) {
          e.spreadT = 0;
          for (const o of entries) {
            if (o === e || !o.alive || o.role === 'proj' || o.burnT > 0 || o.wet || !touching(o, e)) continue;
            if (srand() < v.spread * 0.5) setAlight(o);
          }
        }
      }
      if (e.vineT > 0 && e.alive) {
        e.vineT--;
        const heavy = Math.sqrt(e.body.density / BASE_DENSITY);
        const pull = (g.pull * (e.role === 'crown' ? (e.hp > 0 ? 0.55 : 1) : 1)) / Math.max(1, heavy * 0.7);
        wake(e.body);
        M.Body.setVelocity(e.body, { x: e.body.velocity.x + e.vineDir * pull, y: e.body.velocity.y + g.down });
        if (e.vineT === 0) events.push({ type: 'unvine', entry: e });
      }
      if (e.dissolveAt && stepN >= e.dissolveAt && e.role === 'proj') { e.dissolveAt = 0; remove(e, 'dissolve'); }
    }
  }
  function settleCheck() {
    let moving = false;
    for (const e of entries) {
      if (!e.alive) continue;
      if (e.burnT > 0 || e.vineT > 0 || e.dissolveAt) { moving = true; break; }
      const b = e.body;
      if (b.isSleeping) continue;
      if (e.flying || (e.role === 'built' && !e.landed) || b.speed > SETTLE.speed || Math.abs(b.angularVelocity) > SETTLE.ang) { moving = true; break; }
    }
    quiet = moving ? 0 : quiet + 1;
  }

  const FLAGS = ['fireWall', 'barrel', 'springReady', 'rooted'];
  return {
    M, engine, entries, crowns, stacks,
    get stepN() { return stepN; },
    step() {
      for (const e of entries) {
        if (!e.alive || !e.flying) continue;
        e.pv = { x: e.body.velocity.x, y: e.body.velocity.y };
        e.body.force.y -= e.body.mass * engine.gravity.y * engine.gravity.scale * (1 - FLIGHT_G);
      }
      M.Engine.update(engine, DT);
      stepN++;
      while (queue.length) queue.shift()();
      elementsStep();
      seaCheck();
      settleCheck();
    },
    drain() { return events.splice(0, events.length); },
    settled: () => quiet >= SETTLE.steps,
    resetQuiet() { quiet = 0; },
    live, towerTopY, heightM, launchParams, predict, launch, release, strength,
    /** (friend battles) everything still in play, to make the other phone match at the end of a turn */
    snap() {
      return entries.filter((e) => e.alive).map((e) => [e.id, +e.body.position.x.toFixed(2), +e.body.position.y.toFixed(2), +e.body.angle.toFixed(4), e.hp,
        e.wet ? 1 : 0, e.landed ? 1 : 0, e.perfect ? 1 : 0, FLAGS.reduce((m, f, i) => m | (e[f] ? 1 << i : 0), 0)]);
    },
    /** Puts every block where the other phone has it (what it no longer has is removed). */
    applySnap(list) {
      const by = new Map(list.map((r) => [r[0], r]));
      for (const e of entries) {
        if (!e.alive) continue;
        const r = by.get(e.id);
        if (!r) { remove(e, 'sunk'); continue; }
        M.Body.setPosition(e.body, { x: r[1], y: r[2] });
        M.Body.setAngle(e.body, r[3]);
        M.Body.setVelocity(e.body, { x: 0, y: 0 });
        M.Body.setAngularVelocity(e.body, 0);
        e.hp = r[4];
        e.wet = !!r[5];
        e.landed = !!r[6];
        e.perfect = !!r[7];
        FLAGS.forEach((f, i) => { e[f] = !!((r[8] | 0) & (1 << i)); });
        e.flying = false;
        e.burnT = 0;
        e.vineT = 0;
        e.dissolveAt = 0;
      }
      for (const e of entries) {   // (the glass as the other phone has it)
        if (e.alive && e.role === 'crown' && e.hp <= 0 && e.body.density > BASE_DENSITY * (GLASS.brokenDensity + 0.1)) M.Body.setDensity(e.body, BASE_DENSITY * GLASS.brokenDensity);
      }
      quiet = SETTLE.steps;
    },
    crownLost: (side) => !crowns[side].alive || crowns[side].wet,
    crownY: (side) => crowns[side].body.position.y,
    /** How many of a side's blocks are still standing on its stack (for the result card). */
    standing: (side) => entries.filter((e) => e.alive && !e.wet && e.side === side && e.role !== 'proj' && onStack(e, side)).length,
  };
}
