// (1.18 3D) Blokbotsing: the battle's physics. Stapel's own blocks and Matter tuning (js/game/blocks.js createBody, with
// its stacking patches), so a tower stands, wobbles and tips exactly as in Stapel. Two static sea stacks; everything that
// falls off them drops into the sea. The powers (rules.js POWERS) act on first contact. `predict()` runs a throw ahead
// with the same steps Matter takes, so the dotted arc shows where the block really goes.
import { createBody, getGeometry } from '../game/blocks.js';
import { PHYSICS } from '../config.js';
import {
  STACK, sideX, towardFoe, POWERS, START, CROWN, LAUNCH, BUILD, PERFECT_BUILD, SETTLE, SEA, G_STEP, PERFECT_NEAR,
  PERFECT_THROW_DENSITY, PX, LAYOUT, FLIGHT_G, towerX,
} from './rules.js';

const Mt = () => Phaser.Physics.Matter.Matter;
/** Each block's strength (the owner: "it doesnt indecate any damage?"): a hit cracks it, at 0 it shatters. */
export const HP = { cube: 4, plank: 3, slab: 3, brick: 3, wedge: 3, crate: 2, pillar: 3, crown: 0 };
const BASE_DENSITY = PHYSICS.block.density;
const STACK_SLOPE = 0.12;   // px wider per px further down (world.js SLOPE: m per m)
const DT = 1000 / 60;

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

export function createSim() {
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
      perfect: false, flying: false, born: stepN, power: {}, hp, hpMax: hp, ...extra,
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
  /** The tower's top (smallest y) over everything resting on that stack (shots that stayed there count too). */
  function towerTopY(side) {
    let top = STACK.topY;
    for (const e of entries) {
      if (!e.alive || e.flying || (e.role === 'built' && !e.landed)) continue;
      if (onStack(e, side)) top = Math.min(top, e.body.bounds.min.y);
    }
    return top;
  }
  const heightM = (side) => (STACK.topY - towerTopY(side)) / PX;
  function lookouts(side) {
    let n = 0;
    for (const e of entries) {
      if (e.alive && e.side === side && e.role === 'built' && e.shape === 'pillar' && e.landed && onStack(e, side)) {
        const a = Math.abs(((e.body.angle % Math.PI) + Math.PI) % Math.PI);
        if (Math.min(a, Math.PI - a) < 0.35) n++;
      }
    }
    return n;
  }
  function launchParams(side, shape) {
    const dir = towardFoe(side);
    const x0 = sideX(side) + dir * (STACK.w / 2 + LAUNCH.out);
    const y0 = towerTopY(side) - LAUNCH.up;
    const lk = lookouts(side);
    const v = LAUNCH.V0 * (1 + LAUNCH.perM * heightM(side)) * (1 + POWERS.pillar.build.lookout * lk) * (POWERS[shape]?.throw.speed || 1);
    return { x0, y0, v, dir, lookouts: lk };
  }
  function remove(e, why) {
    if (!e.alive) return;
    e.alive = false;
    e.flying = false;
    M.Composite.remove(world, e.body);
    events.push({ type: why, entry: e, x: e.body.position.x, y: e.body.position.y });
  }
  const wake = (b) => { if (b.isSleeping) M.Sleeping.set(b, false); };
  /** `n` damage to a block (never the crown, the rock or a shot in flight): cracks, then it shatters. */
  function damage(e, n, by) {
    if (!e || !e.alive || e.kind === 'stack' || e.role === 'crown' || n <= 0 || e.flying) return;
    e.hp = Math.max(0, e.hp - n);
    events.push({ type: 'damage', entry: e, n, hp: e.hp, by, x: e.body.position.x, y: e.body.bounds.min.y });
    if (e.hp <= 0) remove(e, 'break');
  }
  /** How much a shot's first touch hurts: its speed (full power ≈ 1), its weight, a Perfek, a slam. 1 to 4. */
  function hitDamage(me, speed) {
    const dens = Math.sqrt(me.power.density || 1);
    const k = (speed / LAUNCH.V0) * dens * 1.6 * (me.perfect ? 1.25 : 1) + (me.slam ? 1 : 0);
    return Math.max(1, Math.min(4, Math.round(k)));
  }
  /** A side's strength: every block of its own still standing on its rock, counted by what's left of it. */
  function strength(side) {
    let n = 0;
    for (const e of entries) if (e.alive && !e.wet && e.side === side && (e.role === 'built' || e.role === 'start') && e.landed && onStack(e, side)) n += e.hp;
    return n;
  }

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
   * Steps exactly as Matter does (gravity, air), until it touches something or the sea (a plank skips once).
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
    let skips = POWERS[shape]?.throw.skip || 0;
    const foeCrown = crowns[1 - side];
    const fc = foeCrown.alive ? foeCrown.body.position : null;
    let near = Infinity;
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
      if (fc) near = Math.min(near, Math.hypot(x - fc.x, y - fc.y));
      if (y + hy > 0) {
        if (skips > 0 && vy > 0 && Math.abs(vx) > 4) { skips--; vy = -vy * 0.55; vx *= 0.85; path.push({ x, y, skip: true }); continue; }
        hit = { kind: 'sea', x, y: 0 };
        break;
      }
      if (i < 4 || y + hy < topAll) continue;   // (clear of the jib; above everything)
      const c = hitAt(x, y, hx, hy, cands, pts);
      if (c) {
        hit = { kind: c.kind === 'stack' ? 'stack' : c.role === 'crown' ? 'crown' : 'block', entry: c.kind === 'stack' ? null : c, side: c.side, x, y };
        break;
      }
    }
    path.push({ x, y });
    if (!hit) hit = { kind: 'none', x, y };
    const perfect = !!fc && ((hit.kind === 'crown' && hit.side !== side) || near < Math.max(CROWN.w, CROWN.h) / 2 + Math.min(hx, hy) + PERFECT_NEAR * 0.5);
    return { path, hit, perfect, v: p.v, x0: p.x0, y0: p.y0 };
  }

  // -------------------------------------------------------------------------------------------- the actions
  /** A throw: the block leaves the jib tip at angle `theta`. */
  function launch(side, shape, theta, perfect = false, power = 1) {
    const p = launchParams(side, shape);
    p.v *= power;
    const pw = POWERS[shape].throw;
    const e = add(shape, side, 'proj', p.x0, p.y0, { flying: true, perfect, power: { ...pw }, pierce: pw.pierce || 0, skips: pw.skip || 0 });
    const b = e.body;
    M.Body.setDensity(b, b.density * (pw.density || 1) * (perfect ? PERFECT_THROW_DENSITY : 1));
    b.frictionAir = LAUNCH.air;
    M.Body.setVelocity(b, { x: p.dir * p.v * Math.cos(theta), y: -p.v * Math.sin(theta) });
    quiet = 0;
    events.push({ type: 'launch', entry: e, x: p.x0, y: p.y0, perfect });
    return e;
  }
  /** A build: the block is let go from the hook at (x, y), keeping a little of the trolley's speed. */
  function release(side, shape, x, y, vx = 0) {
    const pw = POWERS[shape].build;
    const e = add(shape, side, 'built', x, y, { landed: false, power: { ...pw }, springReady: !!pw.spring });
    if (pw.density) M.Body.setDensity(e.body, e.body.density * pw.density);
    M.Body.setVelocity(e.body, { x: vx * BUILD.carry, y: 0 });
    quiet = 0;
    events.push({ type: 'drop', entry: e, x, y });
    return e;
  }

  /**
   * The mid-air tap (once a throw, while it still flies): the crate blows up right there, the wedge's spear shoots
   * forward, the cube slams straight down, the plank hops, the pillar drills on (faster, through one block).
   * Returns the kind, or null when it can't fire.
   */
  function burst(e) {
    if (!e || !e.alive || !e.flying || e.role !== 'proj' || e.burstUsed) return null;
    e.burstUsed = true;
    const b = e.body;
    const v = b.velocity;
    const at = { x: b.position.x, y: b.position.y };
    let kind = null;
    if (e.shape === 'crate') { kind = 'blast'; events.push({ type: 'burst', kind, entry: e, ...at }); blast(e); return kind; }
    if (e.shape === 'wedge') { kind = 'dash'; M.Body.setVelocity(b, { x: v.x * 1.6, y: v.y * 1.6 }); }
    else if (e.shape === 'pillar') { kind = 'drill'; M.Body.setVelocity(b, { x: v.x * 1.45, y: v.y * 1.45 }); e.pierce = Math.max(e.pierce, 1); }
    else if (e.shape === 'cube') { kind = 'slam'; e.slam = true; M.Body.setVelocity(b, { x: v.x * 0.22, y: Math.max(v.y, 0) + 24 }); }
    else if (e.shape === 'plank') { kind = 'hop'; M.Body.setVelocity(b, { x: v.x * 1.06, y: Math.min(v.y, 0) - 10 }); }
    events.push({ type: 'burst', kind, entry: e, ...at });
    quiet = 0;
    return kind;
  }

  // ---------------------------------------------------------------------------------------- contacts and powers
  function rate(e, other) {
    e.landed = true;
    const b = e.body;
    let support = other;
    let rating = 'S';
    if (other.kind === 'stack') {
      rating = Math.abs(b.position.x - towerX(e.side)) < 40 ? 'G' : 'S';
    } else {
      const sw = support.w;
      const dx = b.position.x - support.body.position.x;
      const tilt = Math.abs(Math.atan2(Math.sin(support.body.angle), Math.cos(support.body.angle)));
      const tolP = Math.min(BUILD.perfectTol, BUILD.perfectFrac * sw);
      const tolG = Math.max(BUILD.goodTol, sw * 0.25);
      if (Math.abs(dx) <= tolP && tilt < 0.06 && support.side === e.side) rating = 'P';
      else if (Math.abs(dx) <= tolG) rating = 'G';
      if (rating === 'P') {
        e.snapDx = support.body.position.x - b.position.x;
        M.Body.setPosition(b, { x: support.body.position.x, y: b.position.y });
        M.Body.setAngle(b, support.body.angle);
        M.Body.setVelocity(b, { x: 0, y: Math.min(b.velocity.y, 1) });
        M.Body.setAngularVelocity(b, 0);
        M.Body.setDensity(b, b.density * PERFECT_BUILD.density);
        b.frictionStatic = PERFECT_BUILD.frictionStatic;
        e.perfect = true;
      } else if (rating === 'G' && support.side === e.side) {
        e.snapDx = -dx * BUILD.goodEase;
        M.Body.setPosition(b, { x: b.position.x - dx * BUILD.goodEase, y: b.position.y });
      }
    }
    events.push({ type: 'land', entry: e, rating, x: b.position.x, y: b.bounds.max.y, snapDx: e.snapDx || 0 });
    e.snapDx = 0;
  }
  function blast(e) {
    const c = e.body.position;
    const { r, dv } = e.power.blast;
    remove(e, 'blast');
    for (const o of entries) {
      if (!o.alive) continue;
      const b = o.body;
      const dx = b.position.x - c.x;
      const dy = b.position.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const k = 1 - d / r;
      if (o.side !== e.side || o.role !== 'proj') queue.push(() => damage(o, d < r * 0.45 ? 3 : d < r * 0.75 ? 2 : 1, 'blast'));
      let ux = d > 1 ? dx / d : 0;
      let uy = (d > 1 ? dy / d : -1) - 0.45;
      const n = Math.hypot(ux, uy) || 1;
      ux /= n;
      uy /= n;
      const heavy = Math.sqrt(b.density / BASE_DENSITY);
      const kick = (dv * k) / Math.max(1, heavy * 0.8);
      wake(b);
      M.Body.setVelocity(b, { x: b.velocity.x + ux * kick, y: b.velocity.y + uy * kick });
      M.Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.12 * k);
    }
    quiet = 0;
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
        // a built block's first touch: its rating
        if (me.role === 'built' && !me.landed) queue.push(() => me.alive && !me.landed && rate(me, other));
        // a shot's first touch: its power, then it's just a block
        if (me.role === 'proj' && me.flying) {
          const own = other.kind !== 'stack' && other.side === me.side;
          if (own && stepN - me.born < 12) continue;   // (leaving its own crane)
          me.flying = false;
          const hitV = Math.hypot(me.pv?.x || 0, me.pv?.y || 0);
          queue.push(() => {
            me.body.frictionAir = PHYSICS.block.frictionAir;
            events.push({ type: 'hit', entry: me, other, x: me.body.position.x, y: me.body.position.y, speed: hitV, onto: other.kind === 'stack' ? 'stack' : other.role });
          });
          const foe = other.kind !== 'stack' && other.side !== me.side;
          if (me.power.blast) { queue.push(() => me.alive && blast(me)); continue; }
          if (foe && other.role !== 'crown' && !(me.pierce > 0) && !(other.role === 'built' && (other.power.spikes || other.springReady))) {
            const dmg = hitDamage(me, hitV);
            queue.push(() => damage(other, dmg, 'hit'));
          }
          if (foe && other.role === 'built' && (other.power.spikes || other.springReady)) queue.push(() => damage(other, 1, 'hit'));
          if (foe && other.role === 'built' && other.power.spikes && other.alive) {
            queue.push(() => { if (me.alive) { remove(me, 'spiked'); events.push({ type: 'spikes', entry: other, x: other.body.position.x, y: other.body.bounds.min.y }); } });
            continue;
          }
          if (foe && other.role === 'built' && other.springReady) {
            const pv = me.pv || { x: 0, y: 0 };
            queue.push(() => {
              if (!me.alive || !other.springReady) return;
              other.springReady = false;
              me.flying = true;
              me.body.frictionAir = LAUNCH.air;
              M.Body.setVelocity(me.body, { x: -pv.x * 0.85, y: -Math.abs(pv.y) * 0.4 - 7 });
              M.Body.setAngularVelocity(me.body, (Math.random() - 0.5) * 0.2);
              events.push({ type: 'spring', entry: other, x: other.body.position.x, y: other.body.bounds.min.y });
            });
            continue;
          }
          if (foe && me.pierce > 0 && other.role !== 'crown' && other.alive) {
            me.pierce--;
            const pv = me.pv || { x: 0, y: 0 };
            me.flying = true;
            queue.push(() => {
              if (!other.alive || !me.alive) return;
              remove(other, 'break');
              M.Body.setVelocity(me.body, { x: pv.x * 0.72, y: pv.y * 0.72 });
            });
          }
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
        if (e.role === 'proj' && e.flying && e.skips > 0 && b.velocity.y > 0 && Math.abs(b.velocity.x) > 4) {
          e.skips--;
          M.Body.setVelocity(b, { x: b.velocity.x * 0.85, y: -b.velocity.y * 0.55 });
          events.push({ type: 'skip', entry: e, x: b.position.x, y: 0 });
          continue;
        }
        if (e.role === 'proj' && e.flying && e.power.blast) { events.push({ type: 'splash', entry: e, x: b.position.x, mass: b.mass, vy: b.velocity.y }); blast(e); continue; }
        e.wet = true;
        e.flying = false;
        events.push({ type: 'splash', entry: e, x: b.position.x, mass: b.mass, vy: b.velocity.y });
        if (e.role === 'crown') events.push({ type: 'crown', side: e.side, x: b.position.x });
      }
      if (b.position.y > SEA.gone) remove(e, 'sunk');
    }
  }
  function settleCheck() {
    let moving = false;
    for (const e of entries) {
      if (!e.alive) continue;
      const b = e.body;
      if (b.isSleeping) continue;
      if (e.flying || (e.role === 'built' && !e.landed) || b.speed > SETTLE.speed || Math.abs(b.angularVelocity) > SETTLE.ang) { moving = true; break; }
    }
    quiet = moving ? 0 : quiet + 1;
  }

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
      seaCheck();
      settleCheck();
    },
    drain() { return events.splice(0, events.length); },
    settled: () => quiet >= SETTLE.steps,
    resetQuiet() { quiet = 0; },
    live, towerTopY, heightM, lookouts, launchParams, predict, launch, release, burst, strength,
    /** (friend battles) everything still in play, to make the other phone match at the end of a turn */
    snap() {
      return entries.filter((e) => e.alive).map((e) => [e.id, +e.body.position.x.toFixed(2), +e.body.position.y.toFixed(2), +e.body.angle.toFixed(4), e.hp, e.wet ? 1 : 0, e.landed ? 1 : 0, e.perfect ? 1 : 0]);
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
        e.flying = false;
      }
      quiet = SETTLE.steps;
    },
    crownLost: (side) => !crowns[side].alive || crowns[side].wet,
    crownY: (side) => crowns[side].body.position.y,
    /** How many of a side's blocks are still standing on its stack (for the result card). */
    standing: (side) => entries.filter((e) => e.alive && !e.wet && e.side === side && e.role !== 'proj' && onStack(e, side)).length,
  };
}
