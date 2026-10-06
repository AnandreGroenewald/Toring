// The core loop: crane, drop, fixed-step Matter physics, landing ratings
// (Perfek snap + combo), lives, settle + cement freeze, rising flood, weather,
// camera follow, landing ghost, wobble, idle attract mode and the game-over reveal.
import {
  GAME_W, LAYOUT, PX_PER_M, PHYSICS, CRANE, SCORING, LIVES, FREEZE_DEPTH, WATER, DEPTH,
} from '../config.js';
import { bus } from '../core/bus.js';
import { S } from '../core/strings.js';
import { createSequence } from '../core/sequence.js';
import { audio, haptics } from '../audio.js';
import { Block, ensureTexture, getGeometry } from '../game/blocks.js';
import { Weather } from '../game/weather.js';
import { Crane } from '../game/crane.js';
import { Water } from '../game/water.js';
import { Effects } from '../game/effects.js';
import { createIsland } from '../game/island.js';

const FIXED = PHYSICS.fixedDtMs;
const MAX_FRAME_MS = 100;
const SETTLE = PHYSICS.settle;
const TOP_HIT_TOL = 18;          // px: falling block bottom this far below a support's top still counts as "on top"
const PENDING = '·';             // grid placeholder until a dropped block's fate is known
const LOST_FALL_VY = 4;          // px/step: a block sinking through the flood this fast is gone
const KILL_Y = 1500;
const WOBBLE_GRACE_MS = 550;     // after a landing the stack settles before motion counts as wobble
const SPLASH_VY = 2;             // px/step
const BASE_CX = GAME_W / 2;
const BASE_CY = LAYOUT.baseTopY + LAYOUT.baseHeight / 2;
const BASE_HALF_W = LAYOUT.baseWidth / 2;
const GHOST_FROZEN_SCAN = 12;    // frozen blocks near the top that can still be a landing surface
const GHOST_WIND_STEPS = 240;    // wind forecast horizon for the landing ghost (4 s of fall)
const COLLAPSE_MS = 1500;        // tower blocks lost this soon after another loss are the same collapse: one life
const SET_AFTER_MS = 1500;       // a deep block still stirred by wind sets this long after landing...
const SET_MAX_SPEED = 0.3;       // ...if it moves slower than this (px/step)
const SET_MAX_SPIN = 0.01;       // ...and turns slower than this (rad/step)

// Autoplay / idle attract mode
const AUTO_WAIT_MS = 420;
const IDLE_WAIT_MS = 1900;
const IDLE_BLOCKS = 10;
const IDLE_RESET_DELAY_MS = 1500;
const AUTO_GIVE_UP_MS = 6000;

// Game over
const SLOWMO_SCALE = 0.35;
const SLOWMO_MS = 1000;
const SLOWMO_RAMP_MS = 350;
const REVEAL_DELAY_MS = 380;
const REVEAL_MS = 1400;
const OVER_EMIT_MS = 2200;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round1 = (v) => Math.round(v * 10) / 10;

/** Stand-in for Weather in idle mode (and if the real one fails to build). */
function calmWeather() {
  return {
    seen: [],
    active: null,
    windAccel: 0,
    meanWindAccel: 0,
    frictionMul: 1,
    waterSpeedMul: 1,
    craneSpeedMul: 1,
    fogAlpha: 0,
    perfectMul: 1,
    blocksLeft: null,
    setBlockIndex() { return null; },
    beforeStep() {},
    update() {},
    isHail() { return false; },
    destroy() {},
  };
}

// Centre of a shape's top surface relative to its centroid (local, unrotated). For L/J
// the top is a single cell, so "dead centre" on them means over that cell, not the centroid.
const topCache = new WeakMap();
function topCenterLocal(geom) {
  let c = topCache.get(geom);
  if (c) return c;
  let minY = Infinity;
  let x0 = Infinity;
  let x1 = -Infinity;
  if (geom.poly) {
    for (const p of geom.poly) minY = Math.min(minY, p.y);
    for (const p of geom.poly) {
      if (p.y - minY < 0.5) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
      }
    }
  } else {
    const parts = geom.parts && geom.parts.length ? geom.parts : [{ x: 0, y: 0, w: geom.w, h: geom.h }];
    for (const r of parts) minY = Math.min(minY, r.y);
    for (const r of parts) {
      if (r.y - minY < 0.5) {
        x0 = Math.min(x0, r.x);
        x1 = Math.max(x1, r.x + r.w);
      }
    }
  }
  if (!(x1 > x0)) {
    x0 = 0;
    x1 = geom.w;
    minY = 0;
  }
  c = { x: (x0 + x1) / 2 - geom.cx, y: minY - geom.cy };
  topCache.set(geom, c);
  return c;
}

function safely(fn) {
  try {
    fn();
  } catch (err) {
    console.warn('[Game] cleanup step failed', err);
  }
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super({
      key: 'Game',
      active: false,
      physics: {
        default: 'matter',
        matter: {
          gravity: { y: PHYSICS.gravityY },
          enableSleeping: PHYSICS.enableSleeping,
          autoUpdate: false,
          positionIterations: PHYSICS.positionIterations,
          velocityIterations: PHYSICS.velocityIterations,
          constraintIterations: PHYSICS.constraintIterations,
          debug: false,
        },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  init(data) {
    const d = data || {};
    this.mode = d.mode === 'daily' || d.mode === 'practice' ? d.mode : 'idle';
    this.idle = this.mode === 'idle';
    this.seed = String(d.seed ?? `idle-${Math.floor(Math.random() * 1e9)}`);
    this.dayNumber = Number.isFinite(d.dayNumber) ? d.dayNumber : null;
    this.dateKey = typeof d.dateKey === 'string' ? d.dateKey : null;
    this.settings = { sound: true, vibration: true, reducedMotion: false, ...(d.settings || {}) };
    this.reducedMotion = !!this.settings.reducedMotion;
    this.autoplay = this.idle ? 0 : clamp(Number(d.autoplay) || 0, 0, 1);
    this.autoOn = this.idle || this.autoplay > 0;
    this.resetRunState();
  }

  /** Everything that belongs to one tower (also used by the idle loop's soft reset). */
  resetRunState() {
    this.i = 0;
    this.curSpec = null;
    this.curGeom = null;
    this.nextSpec = null;
    this.falling = null;
    this.active = [];          // non-frozen live blocks: falling, landed, settled, lost (need sync)
    this.tower = [];           // landed/settled/frozen blocks in drop order
    this.dyn = [];             // landed/settled (dynamic tower blocks)
    this.frozen = [];          // frozen blocks in freeze order
    this.dynDirty = true;
    this.frozenTopY = Infinity;
    this.frozenTopBlock = null;
    this.pruneIdx = 0;
    this.pruneTick = 0;
    this.towerTopY = LAYOUT.baseTopY;
    this.topBlock = null;
    this.maxHeightM = 0;
    this.score = 0;
    this.lives = LIVES;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfects = 0;
    this.blocksDropped = 0;
    this.landedCount = 0;
    this.grid = [];
    this.gridBlocks = [];
    this.started = false;
    this.over = false;
    this.overReason = null;
    this.revealing = false;
    this.inputLocked = false;
    this.timeScale = 1;
    this.slowT = 0;
    this.playMs = 0;
    this.wobble = 0;
    this.lastCreak = -1e9;
    this.lastLandAt = -1e9;
    this.lastWobbleShake = -1e9;
    this.lastWarn = -1e9;
    this.collapseUntil = -1e9;
    this.dangerShown = false;
    this.lastFrictionMul = 1;
    this.autoOffset = 0;
    this.autoPrevD = NaN;
    this.autoReadyAt = 0;
    this.idleResetting = false;
    this.hintPending = !this.idle;
  }

  create() {
    const M = Phaser.Physics.Matter.Matter;
    this.M = M;
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.now = 0;
    this.acc = 0;
    this.skipFrame = true;
    this.timers = [];
    this.offs = [];
    this.colQueue = [];
    this.colN = 0;

    const world = this.matter.world;
    world.autoUpdate = false;
    const eng = world.engine;
    eng.positionIterations = PHYSICS.positionIterations;
    eng.velocityIterations = PHYSICS.velocityIterations;
    eng.constraintIterations = PHYSICS.constraintIterations;
    eng.enableSleeping = PHYSICS.enableSleeping;
    eng.gravity.x = 0;
    eng.gravity.y = PHYSICS.gravityY;

    this.sequence = createSequence(this.seed);

    const mat = PHYSICS.block;
    this.baseBody = M.Bodies.rectangle(BASE_CX, BASE_CY, LAYOUT.baseWidth, LAYOUT.baseHeight, {
      isStatic: true,
      label: 'base',
      friction: mat.friction,
      frictionStatic: mat.frictionStatic,
      restitution: 0,
      slop: mat.slop,
    });
    world.add(this.baseBody);

    this.island = createIsland(this);
    this.water = new Water(this, { width: GAME_W });
    this.crane = new Crane(this);
    this.effects = new Effects(this, { reducedMotion: this.reducedMotion });
    this.weather = this.idle ? calmWeather() : this.buildWeather();

    // Landing ghost: white silhouette plus a faint dark rim so it reads against a pale sky.
    this.ghostEdge = this.add.image(0, 0, '__WHITE').setDepth(DEPTH.ghost - 0.1).setAlpha(0.2).setVisible(false);
    this.ghost = this.add.image(0, 0, '__WHITE').setDepth(DEPTH.ghost).setAlpha(0.28).setVisible(false);

    const cam = this.cameras.main;
    cam.setZoom(1).setRotation(0).setScroll(0, LAYOUT.baseTopY - LAYOUT.dropLineY);

    // Reused per-step / per-frame context objects (no allocations in the hot loop).
    this.stepCtx = { dynamicBlocks: this.dyn, falling: null };
    this.wctx = { topBlock: null, towerTopY: 0, camera: cam, W: this.W, H: this.H };
    this.craneOpts = { omega: CRANE.omega0, amplitude: CRANE.amplitude, windAccel: 0 };
    this.hudWeather = { type: null, blocksLeft: null };
    this.hudState = {
      heightM: 0, score: 0, lives: LIVES, maxLives: LIVES, combo: 0, next: null, weather: null,
      waterDistM: null, wobble: 0, mode: this.mode, dayNumber: this.dayNumber,
    };
    this.surf = { top: 0, block: null, found: false };

    world.on('collisionstart', this.onCollisionStart, this);

    if (!this.idle) {
      this.input.on('pointerdown', this.onPointerDown, this);
      const kb = this.input.keyboard;
      if (kb) {
        kb.on('keydown-SPACE', this.onKeyDrop, this);
        kb.on('keydown-ENTER', this.onKeyDrop, this);
      }
    }

    this.offs.push(
      bus.on('game:quit', () => this.endGame('quit')),
      bus.on('weather:rainbow', () => this.onRainbow()),
      bus.on('hud:ready', () => this.onHudReady()),
    );
    this.game.events.on('visible', this.resetClock, this);
    this.events.on('resume', this.resetClock, this);
    this.events.once('shutdown', this.cleanup, this);

    const reg = this.registry;
    if (this.idle) {
      reg.set('skyDark', 0);
      reg.set('wind', 0);
      reg.set('rainbow', 0);
    }
    this.writeRegistry();

    if (!this.idle) this.scene.launch('Hud');

    this.spawnBlock(0);
    if (this.hintPending) bus.emit('hud:hint', { text: S.tapToDrop });

    if (typeof window !== 'undefined') {
      window.__stapel = window.__stapel || {};
      window.__stapel.scene = this;
    }
  }

  buildWeather() {
    try {
      return new Weather(this, this.sequence, {
        effects: this.effects, audio, haptics, bus, reducedMotion: this.reducedMotion,
      });
    } catch (err) {
      console.error('[Game] weather failed to start', err);
      return calmWeather();
    }
  }

  /** A broken weather effect must never stop the tower: log once and carry on calm. */
  weatherFailed(err) {
    console.error('[Game] weather error', err);
    const seen = this.weather.seen || [];
    safely(() => this.weather.destroy());
    this.weather = calmWeather();
    this.weather.seen = seen;
  }

  cleanup() {
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (const t of this.timers) t.remove(false);
    this.timers.length = 0;
    this.game.events.off('visible', this.resetClock, this);
    this.events.off('resume', this.resetClock, this);
    this.input.off('pointerdown', this.onPointerDown, this);
    if (this.input.keyboard) {
      this.input.keyboard.off('keydown-SPACE', this.onKeyDrop, this);
      this.input.keyboard.off('keydown-ENTER', this.onKeyDrop, this);
    }
    // The Matter world and the display list are already torn down by their plugins
    // (they listen for 'shutdown' first); module destroy() calls only drop references.
    safely(() => this.weather.destroy());
    safely(() => this.crane.destroy());
    safely(() => this.water.destroy());
    safely(() => this.effects.destroy());
    safely(() => this.island.destroy());
    for (const b of this.active) safely(() => b.destroy());
    for (const b of this.tower) safely(() => b.destroy());
    this.active = [];
    this.tower = [];
    this.dyn.length = 0;
    this.frozen = [];
    this.falling = null;
    this.colN = 0;
    this.colQueue.length = 0;
    if (!this.idle) this.scene.stop('Hud');
    if (typeof window !== 'undefined' && window.__stapel && window.__stapel.scene === this) {
      window.__stapel.scene = null;
    }
  }

  /** After pause/resume or a hidden tab: never try to catch up on lost time. */
  resetClock() {
    this.acc = 0;
    this.skipFrame = true;
  }

  delay(ms, fn) {
    const ev = this.time.delayedCall(ms, () => {
      const k = this.timers.indexOf(ev);
      if (k >= 0) this.timers.splice(k, 1);
      fn();
    });
    this.timers.push(ev);
    return ev;
  }

  cancel(ev) {
    if (!ev) return;
    ev.remove(false);
    const k = this.timers.indexOf(ev);
    if (k >= 0) this.timers.splice(k, 1);
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------
  onPointerDown() {
    this.tryDrop(false);
  }

  onKeyDrop(e) {
    if (e && e.repeat) return;
    this.tryDrop(false);
  }

  onHudReady() {
    if (this.hintPending && !this.over) bus.emit('hud:hint', { text: S.tapToDrop });
  }

  onRainbow() {
    if (this.over || this.idle) return;
    this.water.lower(WATER.rainbowDropPx);
    bus.emit('hud:toast', { text: S.waterRecede, color: '#c9f3ff' });
  }

  // -------------------------------------------------------------------------
  // Blocks on the crane / dropping
  // -------------------------------------------------------------------------
  spawnBlock(i) {
    if (this.over) return;
    if (this.crane.hasBlock()) return;   // never two blocks on the hook
    this.i = i;
    const spec = this.sequence.block(i);
    this.curSpec = spec;
    this.curGeom = getGeometry(spec);
    safely(() => this.weather.setBlockIndex(i));
    const key = ensureTexture(this, spec);
    this.crane.setBlock(spec, key, this.curGeom);
    this.nextSpec = this.sequence.block(i + 1);
    ensureTexture(this, this.nextSpec);
    const geo = this.curGeom;
    this.ghost.setTexture(key).setOrigin(geo.originX, geo.originY).setTintFill(0xffffff);
    this.ghostEdge.setTexture(key).setOrigin(geo.originX, geo.originY).setTintFill(0x1d2b45)
      .setScale((geo.w + 6) / geo.w, (geo.h + 6) / geo.h);
    this.planAutoplay();
  }

  tryDrop(fromAuto = false) {
    if (this.over || this.inputLocked || this.idleResetting) return false;
    if (this.idle && !fromAuto) return false;
    if (!this.crane.hasBlock() || !this.curSpec) return false;
    if (!this.sys.isActive()) return false;

    const pose = this.crane.release();
    const cam = this.cameras.main;
    const block = new Block(this, this.curSpec, pose.x, pose.y + cam.scrollY, pose.angle);
    block.setVelocityPxS(pose.vx * CRANE.carry, pose.vy * CRANE.carry);
    block.setFriction(this.weather.frictionMul);
    block.state = 'falling';
    block.droppedAt = this.now;
    block.landedAt = 0;
    block.advanced = false;
    block.lostMarked = false;
    block.splashed = false;
    block.pendingRate = false;
    block.waitTimer = this.delay(CRANE.maxWaitMs, () => this.advance(block));

    this.falling = block;
    this.stepCtx.falling = block;
    this.active.push(block);
    this.blocksDropped++;
    this.setGhostVisible(false);

    if (!this.idle) {
      this.grid[block.index] = PENDING;
      this.gridBlocks[block.index] = block;
      audio.play('drop');
      haptics.tap();
      if (!this.started) {
        this.started = true;
        this.hintPending = false;
        bus.emit('hud:hint', { text: null });
        if (this.mode === 'daily') bus.emit('game:started', this.buildResult('quit'));
      }
    }
    return true;
  }

  /** Schedules the next block exactly once per dropped block. */
  advance(block) {
    if (block.advanced) return;
    block.advanced = true;
    this.cancel(block.waitTimer);
    block.waitTimer = null;
    if (this.over) return;
    if (this.idle && this.blocksDropped >= IDLE_BLOCKS) {
      this.delay(IDLE_RESET_DELAY_MS, () => this.idleReset());
      return;
    }
    this.delay(CRANE.respawnDelayMs, () => this.spawnBlock(this.i + 1));
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------
  update(time, delta) {
    let dt = this.skipFrame ? FIXED : delta;
    this.skipFrame = false;
    if (!(dt > 0)) dt = FIXED;
    dt = Math.min(dt, MAX_FRAME_MS);
    const dtS = dt / 1000;
    this.now += dt;
    if (this.started && !this.over) this.playMs += dt;
    if (this.over) this.updateSlowMo(dt);

    // 1. Crane
    const w = this.weather;
    const opts = this.craneOpts;
    opts.omega = Math.min(CRANE.omegaMax, CRANE.omega0 + CRANE.omegaPerBlock * this.i) * w.craneSpeedMul;
    opts.windAccel = w.windAccel;
    this.crane.update(dt, opts);

    // 2. Fixed-step physics; collisions are handled after each step
    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED && steps < PHYSICS.maxStepsPerFrame) {
      this.acc -= FIXED;
      steps++;
      this.physicsStep();
    }
    if (steps >= PHYSICS.maxStepsPerFrame && this.acc > FIXED) this.acc = FIXED;

    // 3. Everything that reads the new physics state
    this.updateBlocks();
    this.updateSettleAndFreeze();
    this.updateTowerHeight();
    this.updateFriction();
    this.updateWater(dt);
    const wc = this.wctx;
    wc.topBlock = this.topBlock;
    wc.towerTopY = this.towerTopY;
    try {
      w.update(dt, wc);
    } catch (err) {
      this.weatherFailed(err);
    }
    this.updateCamera(dtS);
    this.updateGhostAndAutoplay();
    this.updateWobble(dtS);
    this.emitHud();
    this.writeRegistry();
  }

  physicsStep() {
    if (this.dynDirty) this.rebuildDyn();
    this.stepCtx.falling = this.falling;
    try {
      this.weather.beforeStep(this.stepCtx);
    } catch (err) {
      this.weatherFailed(err);
    }
    this.matter.world.step(FIXED * this.timeScale);
    const dyn = this.dyn;
    for (let k = 0; k < dyn.length; k++) {
      const b = dyn[k];
      const body = b.body;
      if (body.isSleeping || (body.speed < SETTLE.speed && body.angularSpeed < SETTLE.angularSpeed)) b.quietSteps++;
      else b.quietSteps = 0;
    }
    this.processCollisions();
  }

  rebuildDyn() {
    this.dynDirty = false;
    const dyn = this.dyn;
    dyn.length = 0;
    for (let k = 0; k < this.tower.length; k++) {
      const b = this.tower[k];
      if (b.state === 'landed' || b.state === 'settled') dyn.push(b);
    }
  }

  // -------------------------------------------------------------------------
  // Collisions: the callback only records; processing happens after the step.
  // -------------------------------------------------------------------------
  onCollisionStart(event) {
    const f = this.falling;
    if (!f || f.state !== 'falling') return;
    const fb = f.body;
    const pairs = event.pairs;
    for (let k = 0; k < pairs.length; k++) {
      const p = pairs[k];
      const a = p.bodyA.parent;
      const b = p.bodyB.parent;
      let other;
      if (a === fb) other = b;
      else if (b === fb) other = a;
      else continue;
      if (this.colN >= this.colQueue.length) this.colQueue.push({ body: null, ny: 0, cy: 0, speed: 0 });
      const q = this.colQueue[this.colN++];
      q.body = other;
      q.speed = fb.speed;
      const c = p.collision;
      q.ny = c ? c.normal.y : 0;
      let cy = fb.position.y;
      if (c && c.supportCount > 0) {
        cy = 0;
        for (let s = 0; s < c.supportCount; s++) cy += c.supports[s].y;
        cy /= c.supportCount;
      }
      q.cy = cy;
    }
  }

  processCollisions() {
    const n = this.colN;
    if (!n) return;
    this.colN = 0;
    const f = this.falling;
    let best = null;
    let bestTop = Infinity;
    let bestQ = null;
    if (f && f.state === 'falling') {
      for (let k = 0; k < n; k++) {
        const q = this.colQueue[k];
        const o = q.body;
        if (!o || o.label === 'hail' || this.weather.isHail(o)) continue;
        let top;
        if (o === this.baseBody) {
          top = LAYOUT.baseTopY;
        } else {
          const g = o.gameBlock;
          if (!g || g === f || g.destroyed || g.state === 'lost' || g.state === 'falling') continue;
          top = g.top;
        }
        if (top < bestTop) {
          bestTop = top;
          best = o;
          bestQ = q;
        }
      }
    }
    if (best) this.land(f, best, bestTop, bestQ);
    for (let k = 0; k < n; k++) this.colQueue[k].body = null;
  }

  land(f, supportBody, supTop, q) {
    this.falling = null;
    this.stepCtx.falling = null;
    f.state = 'landed';
    f.landedAt = this.now;
    this.lastLandAt = this.now;
    f.quietSteps = 0;
    this.tower.push(f);
    this.dynDirty = true;
    this.landedCount++;
    this.advance(f);

    const topHit = f.bottom <= supTop + TOP_HIT_TOL || (Math.abs(q.ny) > 0.75 && q.cy > f.centerY);
    const sup = supportBody === this.baseBody ? null : supportBody.gameBlock;
    let rating = null;
    if (topHit && !this.over) {
      const adx = Math.abs(f.centerX - this.supportTop(sup).x);
      if (adx <= SCORING.perfectTolPx) {
        this.snapPerfect(f, sup);
        rating = 'P';
      } else {
        rating = adx <= SCORING.goodTolPx ? 'G' : 'S';
      }
    } else if (!topHit) {
      f.pendingRate = true;   // hit a side: rated 'S' once it settles somewhere (or 'X' if it falls)
    }

    const width = f.right - f.left;
    this.effects.dust(f.centerX, f.bottom, width);
    if (!this.idle && !this.over) {
      const intensity = clamp(q.speed / 16, 0.15, 1);
      const size = clamp((width * (f.bottom - f.top)) / (200 * 48), 0.25, 1);
      audio.play('land', { intensity, size });
      if (this.landedCount >= WATER.startAfterBlocks && !this.water.rising && !this.over) {
        this.water.start();
        audio.play('warning');
        bus.emit('hud:toast', { text: S.waterRising, color: '#bfe6ff' });
      }
    }
    if (rating) this.applyRating(f, rating);
    this.emitProgress();
  }

  /** World position of the centre of a support's top surface (null support = the base). */
  supportTop(sup) {
    const out = this.topPt || (this.topPt = { x: BASE_CX, y: LAYOUT.baseTopY, angle: 0 });
    if (!sup) {
      out.x = BASE_CX;
      out.y = LAYOUT.baseTopY;
      out.angle = 0;
      return out;
    }
    const c = topCenterLocal(sup.geom);
    const b = sup.body;
    const sin = Math.sin(b.angle);
    const cos = Math.cos(b.angle);
    out.x = b.position.x + c.x * cos - c.y * sin;
    out.y = b.position.y + c.x * sin + c.y * cos;
    out.angle = b.angle;
    return out;
  }

  /** Perfek: put the block dead centre on its support, flat on its top surface, at rest. */
  snapPerfect(f, sup) {
    const M = this.M;
    const t = this.supportTop(sup);
    const ang = t.angle;
    const d = f.geom.h - f.geom.cy;
    const sin = Math.sin(ang);
    const cos = Math.cos(ang);
    M.Sleeping.set(f.body, false);
    M.Body.setAngle(f.body, ang);
    M.Body.setPosition(f.body, { x: t.x + d * sin, y: t.y - d * cos });
    M.Body.setVelocity(f.body, { x: 0, y: 0 });
    M.Body.setAngularVelocity(f.body, 0);
    f.sync();
  }

  applyRating(block, r) {
    if (block.rating) return;   // never rate a block twice
    block.rating = r;
    block.pendingRate = false;
    if (this.over) return;   // blocks still tumbling during the reveal don't score
    if (this.idle) {
      this.combo = r === 'P' ? this.combo + 1 : 0;
      this.effects.rating(block, r, this.combo);
      return;
    }
    this.grid[block.index] = r;
    let pts = SCORING.base;
    let heart = false;
    if (r === 'P') {
      this.combo++;
      this.perfects++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      pts += Math.round(SCORING.perfectBonus * Math.min(this.combo, SCORING.comboCap) * this.weather.perfectMul);
      if (this.combo % SCORING.heartEvery === 0 && this.lives < LIVES) {
        this.lives = Math.min(LIVES, this.lives + 1);
        heart = true;
      }
    } else {
      if (r === 'G') pts += SCORING.goodBonus;
      this.combo = 0;
    }
    this.score += pts;

    this.effects.rating(block, r, this.combo);
    // beside the block, rising from below its bottom so it never runs into the rating pop above it
    const x = block.right + 64;
    const y = block.bottom + 24;
    this.effects.floatText(x, y, `+${pts}`, {
      color: r === 'P' ? '#fff27a' : '#ffffff',
      size: r === 'P' ? 40 : 32,
    });
    if (r === 'P') {
      audio.play('perfect', { combo: this.combo });
      haptics.perfect();
    } else {
      audio.play(r === 'G' ? 'good' : 'skew');
    }
    if (heart) {
      this.effects.floatText(block.centerX, block.top - 170, S.extraLife, { color: '#ff8fb0', size: 42 });
      audio.play('heart');
    }
  }

  markLost(block) {
    if (block.lostMarked) return;   // never lose the same block twice
    block.lostMarked = true;
    const wasFalling = block.state === 'falling';
    if (this.falling === block) {
      this.falling = null;
      this.stepCtx.falling = null;
    }
    const k = this.tower.indexOf(block);
    if (k >= 0) {
      this.tower.splice(k, 1);
      this.dynDirty = true;
    }
    block.state = 'lost';
    block.pendingRate = false;
    if (!block.rating) block.rating = 'X';
    this.advance(block);            // a block that never touched the tower still brings the next one
    if (this.idle || this.over) return;

    // A collapse (tower blocks falling together) costs one life, not one per block;
    // a dropped block that misses the tower always costs its own.
    const sameCollapse = !wasFalling && this.now < this.collapseUntil;
    this.collapseUntil = this.now + COLLAPSE_MS;
    if (!sameCollapse) this.lives = Math.max(0, this.lives - 1);
    this.grid[block.index] = 'X';
    this.combo = 0;
    this.effects.rating(block, 'X', 0);
    audio.play('lost');
    haptics.lost();
    this.emitProgress();
    if (this.lives <= 0) this.endGame('lives');
  }

  // -------------------------------------------------------------------------
  // Per-frame bookkeeping
  // -------------------------------------------------------------------------
  updateBlocks() {
    const surf = this.water.surfaceY;
    const act = this.active;
    let n = 0;
    for (let k = 0; k < act.length; k++) {
      const b = act[k];
      if (b.destroyed) continue;
      if (b.state === 'frozen') continue;   // moved to the frozen list
      b.sync();
      const vy = b.body.velocity.y;
      if (b.state !== 'lost') {
        const top = b.top;
        if (top > LAYOUT.baseTopY + 4 || Math.abs(b.centerX - BASE_CX) > GAME_W
          || (top > surf + 20 && vy > LOST_FALL_VY)) {
          this.markLost(b);
        }
      }
      if (!b.splashed && vy > SPLASH_VY && b.bottom > surf + 4 && b.top < surf + 60) {
        b.splashed = true;
        const x = clamp(b.centerX, -200, GAME_W + 200);
        this.water.splash(x);
        this.effects.splash(x, surf);
        if (!this.idle) audio.play('splash');
      }
      if (b.state === 'lost' && (b.top > surf + 140 || b.centerY > KILL_Y)) {
        b.destroy();
        continue;
      }
      act[n++] = b;
    }
    act.length = n;
  }

  updateSettleAndFreeze() {
    if (this.dynDirty) this.rebuildDyn();
    const dyn = this.dyn;
    for (let k = 0; k < dyn.length; k++) {
      const b = dyn[k];
      const quiet = b.quietSteps >= SETTLE.steps || b.body.isSleeping;
      if (b.state === 'landed') {
        if (quiet) {
          b.state = 'settled';
          if (b.pendingRate && !b.rating) this.applyRating(b, 'S');
        }
      } else if (b.state === 'settled' && b.quietSteps === 0 && !b.body.isSleeping && b.body.speed > 0.6) {
        b.state = 'landed';   // knocked loose again
      }
    }

    // Cement: a block with >= FREEZE_DEPTH newer tower blocks above it sets (one per frame).
    // Wind keeps a stack gently rocking, so "quiet" can't be required there: a deep block
    // that has stood for a while and isn't really moving sets anyway, or the wobbly top
    // part would grow without limit during a wind event.
    const tower = this.tower;
    let count = 0;
    let frozenRun = 0;
    for (let k = tower.length - 1; k >= 0; k--) {
      const b = tower[k];
      if (b.state === 'frozen') {
        count++;
        if (++frozenRun > 24) break;
        continue;
      }
      frozenRun = 0;
      if (count >= FREEZE_DEPTH && this.canSet(b)) {
        if (b.pendingRate && !b.rating) this.applyRating(b, 'S');
        if (b.state === 'landed') b.state = 'settled';
        this.freezeBlock(b);
        break;
      }
      count++;
    }

    // Deep, drowned cement no longer needs a physics body.
    if (this.frozen.length && (++this.pruneTick & 7) === 0) this.pruneFrozenBodies();
  }

  canSet(b) {
    const body = b.body;
    if (b.state === 'settled' && (b.quietSteps >= SETTLE.steps || body.isSleeping)) return true;
    return this.now - b.landedAt >= SET_AFTER_MS && body.speed < SET_MAX_SPEED && body.angularSpeed < SET_MAX_SPIN;
  }

  freezeBlock(b) {
    b.freeze();
    b.sync();
    this.dynDirty = true;
    this.frozen.push(b);
    const k = this.active.indexOf(b);
    if (k >= 0) this.active.splice(k, 1);
    const top = b.top;
    if (top < this.frozenTopY) {
      this.frozenTopY = top;
      this.frozenTopBlock = b;
    }
    if (!this.idle && !this.over) audio.play('freeze');
  }

  pruneFrozenBodies() {
    const limit = Math.min(this.water.surfaceY + 160, this.towerTopY + 2600);
    const world = this.matter.world;
    while (this.pruneIdx < this.frozen.length) {
      const b = this.frozen[this.pruneIdx];
      if (b.top <= limit) break;
      if (!b.bodyRemoved) {
        world.remove(b.body);
        b.bodyRemoved = true;
      }
      this.pruneIdx++;
    }
  }

  updateTowerHeight() {
    let top = this.frozenTopY;
    let topBlock = this.frozenTopBlock;
    let settledTop = this.frozenTopY;
    const dyn = this.dyn;
    for (let k = 0; k < dyn.length; k++) {
      const b = dyn[k];
      const t = b.top;
      if (t < top) {
        top = t;
        topBlock = b;
      }
      if (b.state === 'settled' && t < settledTop) settledTop = t;
    }
    this.towerTopY = top === Infinity ? LAYOUT.baseTopY : Math.min(top, LAYOUT.baseTopY);
    this.topBlock = topBlock;
    if (settledTop !== Infinity) {
      const h = Math.max(0, LAYOUT.baseTopY - settledTop) / PX_PER_M;
      if (h > this.maxHeightM && !this.over) this.maxHeightM = h;
    }
  }

  updateFriction() {
    const fm = this.weather.frictionMul;
    if (fm === this.lastFrictionMul) return;
    this.lastFrictionMul = fm;
    for (let k = 0; k < this.dyn.length; k++) this.dyn[k].setFriction(fm);
    if (this.falling) this.falling.setFriction(fm);
  }

  updateWater(dt) {
    const water = this.water;
    const frozenLevel = this.over && this.slowT > OVER_EMIT_MS;
    water.update(dt, frozenLevel ? 0 : this.weather.waterSpeedMul);
    if (this.idle || this.over || !water.rising) return;
    const dist = water.surfaceY - this.towerTopY;
    if (dist < 0) {
      this.effects.splash(BASE_CX, water.surfaceY);
      audio.play('splash');
      this.endGame('flood');
      return;
    }
    // No nagging while the water is still below the base platform (a short tower is always "close").
    if (dist < WATER.warnPx && water.surfaceY < LAYOUT.baseTopY) {
      if (this.now - this.lastWarn > 1000) {
        this.lastWarn = this.now;
        audio.play('warning');
      }
      if (!this.dangerShown) {
        this.dangerShown = true;
        bus.emit('hud:toast', { text: S.waterDanger, color: '#ffb36b' });
      }
    } else if (dist > WATER.warnPx * 1.8) {
      this.dangerShown = false;
    }
  }

  updateCamera(dtS) {
    if (this.revealing) return;
    const cam = this.cameras.main;
    const target = Math.min(this.towerTopY - LAYOUT.dropLineY, LAYOUT.baseTopY - LAYOUT.dropLineY);
    cam.scrollY += (target - cam.scrollY) * (1 - Math.exp(-dtS * 3.5));
    cam.scrollX = 0;
    const hM = (LAYOUT.baseTopY - this.towerTopY) / PX_PER_M;
    let rot = 0;
    if (!this.reducedMotion && !this.over && hM > 15) {
      rot = Math.sin((this.now / 1000) * 1.6) * Math.min(0.01, hM * 0.00006);
    }
    if (rot !== cam.rotation) cam.setRotation(rot);
  }

  // -------------------------------------------------------------------------
  // Landing ghost + autoplay
  // -------------------------------------------------------------------------
  updateGhostAndAutoplay() {
    const hanging = this.crane.hasBlock() && !this.over && !this.idleResetting;
    if (!hanging) {
      this.setGhostVisible(false);
      return;
    }
    const p = this.predictLanding();
    const showGhost = !this.idle && this.weather.fogAlpha <= 0.5;
    if (showGhost) {
      this.ghost.setPosition(p.x, p.y);
      this.ghostEdge.setPosition(p.x, p.y);
    }
    this.setGhostVisible(showGhost);
    if (this.autoOn) this.autoCheck(p.x, p.targetX);
  }

  setGhostVisible(on) {
    if (this.ghost.visible === on) return;
    this.ghost.setVisible(on);
    this.ghostEdge.setVisible(on);
  }

  /**
   * Replays Matter's Verlet integration for the hanging block (no rotation, mean
   * wind) until it reaches the tower, so the ghost matches the real fall.
   */
  predictLanding() {
    const out = this.ghostOut || (this.ghostOut = { x: 0, y: 0, targetX: BASE_CX });
    const g = this.curGeom;
    const pose = this.crane.getBlockPose();
    const cam = this.cameras.main;
    let x = pose.x;
    let y = pose.y + cam.scrollY;
    let vx = (pose.vx * CRANE.carry) / 60;
    let vy = (pose.vy * CRANE.carry) / 60;
    const keep = 1 - PHYSICS.block.frictionAir;
    const grav = 0.001 * PHYSICS.gravityY * FIXED * FIXED;
    // Per-step wind: the weather's own forecast (foresees gust flips), else the mean wind.
    const wf = this.windSteps || (this.windSteps = new Float64Array(GHOST_WIND_STEPS));
    const w = this.weather;
    if (typeof w.forecastWind === 'function') w.forecastWind(GHOST_WIND_STEPS, wf);
    else wf.fill(w.meanWindAccel);
    const lastW = GHOST_WIND_STEPS - 1;

    // rotated extents of the bbox relative to the centroid
    const a = pose.angle;
    const sn = Math.sin(a);
    const cs = Math.cos(a);
    const x0 = -g.cx;
    const x1 = g.w - g.cx;
    const y0 = -g.cy;
    const y1 = g.h - g.cy;
    let minX = Infinity;
    let maxX = -Infinity;
    let bot = -Infinity;
    for (let c = 0; c < 4; c++) {
      const px = c === 0 || c === 3 ? x0 : x1;
      const py = c < 2 ? y0 : y1;
      const rx = px * cs - py * sn;
      const ry = px * sn + py * cs;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry > bot) bot = ry;
    }

    let surface = this.towerTopY;
    let n = 0;
    while (y + bot < surface && n < 600) {
      vx = vx * keep + wf[n < lastW ? n : lastW] / 3600;
      vy = vy * keep + grav;
      x += vx;
      y += vy;
      n++;
    }
    let s = this.surfaceAt(x + minX, x + maxX);
    if (s.found && s.top > surface + 0.5) {
      surface = s.top;
      while (y + bot < surface && n < 900) {
        vx = vx * keep + wf[n < lastW ? n : lastW] / 3600;
        vy = vy * keep + grav;
        x += vx;
        y += vy;
        n++;
      }
      s = this.surfaceAt(x + minX, x + maxX);
    }
    const landTop = s.found ? s.top : this.towerTopY;
    out.x = x;
    out.y = landTop - (g.h - g.cy);
    out.targetX = this.supportTop(s.found ? s.block : this.topBlock).x;
    return out;
  }

  /** Highest support surface overlapping [x0, x1]: dynamic tower blocks, the top of the cement, the base. */
  surfaceAt(x0, x1) {
    const s = this.surf;
    s.found = false;
    s.top = Infinity;
    s.block = null;
    const dyn = this.dyn;
    for (let k = 0; k < dyn.length; k++) {
      const b = dyn[k];
      if (b.left < x1 && b.right > x0 && b.top < s.top) {
        s.top = b.top;
        s.block = b;
        s.found = true;
      }
    }
    const fz = this.frozen;
    for (let k = fz.length - 1, m = 0; k >= 0 && m < GHOST_FROZEN_SCAN; k--, m++) {
      const b = fz[k];
      if (b.left < x1 && b.right > x0 && b.top < s.top) {
        s.top = b.top;
        s.block = b;
        s.found = true;
      }
    }
    if (BASE_CX - BASE_HALF_W < x1 && BASE_CX + BASE_HALF_W > x0 && LAYOUT.baseTopY < s.top) {
      s.top = LAYOUT.baseTopY;
      s.block = null;
      s.found = true;
    }
    return s;
  }

  planAutoplay() {
    if (!this.autoOn) return;
    this.autoOffset = 0;
    const side = Math.random() < 0.5 ? -1 : 1;
    if (this.idle) {
      if (Math.random() < 0.3) this.autoOffset = side * (4 + Math.random() * 12);
    } else if (Math.random() < this.autoplay) {
      this.autoOffset = side * (12 + Math.random() * 72);
    }
    this.autoPrevD = NaN;
    this.autoReadyAt = this.now + (this.idle ? IDLE_WAIT_MS : AUTO_WAIT_MS);
  }

  autoCheck(ghostX, targetX) {
    if (this.over || this.idleResetting) return;
    if (this.now < this.autoReadyAt) {
      this.autoPrevD = NaN;
      return;
    }
    const d = ghostX - (targetX + this.autoOffset);
    const prev = this.autoPrevD;
    this.autoPrevD = d;
    // Pick the frame closest to the crossing: now, if the next frame would be further off.
    let near = Math.abs(d) <= 2;
    if (!near && Number.isFinite(prev)) {
      const v = d - prev;
      const next = d + v;
      const ahead = v !== 0 && Math.sign(next) !== Math.sign(d) && Math.abs(d) <= Math.abs(next);
      const behind = Math.sign(prev) !== Math.sign(d) && Math.abs(d) <= Math.abs(prev);
      near = (ahead || behind) && Math.abs(v) < 60;
    }
    if (near || this.now > this.autoReadyAt + AUTO_GIVE_UP_MS) {
      this.tryDrop(true);
    }
  }

  // -------------------------------------------------------------------------
  // Wobble, HUD, registry
  // -------------------------------------------------------------------------
  updateWobble(dtS) {
    let w = 0;
    const dyn = this.dyn;
    // A landing jolts the whole stack for a moment; only sustained motion is wobble.
    if (this.now - this.lastLandAt >= WOBBLE_GRACE_MS) {
      for (let k = 0; k < dyn.length; k++) {
        const body = dyn[k].body;
        if (body.isSleeping) continue;
        const v = Math.max(0, body.speed - 0.05) * 6 + Math.max(0, body.angularSpeed - 0.0006) * 150;
        if (v > w) w = v;
      }
    }
    w = Math.min(1, w);
    const rate = w > this.wobble ? 10 : 2.5;
    this.wobble += (w - this.wobble) * (1 - Math.exp(-dtS * rate));
    if (this.idle || this.over) return;
    if (this.wobble > 0.35 && this.now - this.lastCreak > 450) {
      this.lastCreak = this.now;
      audio.play('creak', { intensity: Math.min(1, this.wobble) });
    }
    if (this.wobble > 0.6 && this.now - this.lastWobbleShake > 380) {
      this.lastWobbleShake = this.now;
      this.effects.shake(0.0022, 140);
    }
  }

  emitHud() {
    if (this.idle || this.over) return;
    const s = this.hudState;
    s.heightM = round1(Math.max(0, LAYOUT.baseTopY - this.towerTopY) / PX_PER_M);
    s.score = this.score;
    s.lives = this.lives;
    s.combo = this.combo;
    s.next = this.nextSpec;
    const act = this.weather.active;
    if (act) {
      this.hudWeather.type = act.type;
      this.hudWeather.blocksLeft = this.weather.blocksLeft;
      s.weather = this.hudWeather;
    } else {
      s.weather = null;
    }
    s.waterDistM = this.water.rising ? (this.water.surfaceY - this.towerTopY) / PX_PER_M : null;
    s.wobble = this.wobble;
    bus.emit('hud:state', s);
  }

  writeRegistry() {
    const cam = this.cameras.main;
    const reg = this.registry;
    reg.set('camY', cam.scrollY);
    // scrollY + H/2 is the view centre at any zoom, so this also works during the reveal
    const alt = Math.max(0, -(cam.scrollY + LAYOUT.dropLineY - LAYOUT.baseTopY)) / PX_PER_M;
    reg.set('altitudeM', alt);
  }

  emitProgress() {
    if (this.mode !== 'daily' || this.over) return;
    bus.emit('game:progress', this.buildResult('quit'));
  }

  buildResult(reason) {
    let dropped = this.blocksDropped;
    let grid = '';
    for (let k = 0; k < this.grid.length; k++) {
      let c = this.grid[k];
      if (c === undefined) continue;
      if (c === PENDING) {
        const b = this.gridBlocks[k];
        if (b && (b.state === 'landed' || b.state === 'settled' || b.state === 'frozen')) {
          c = 'S';
        } else {
          dropped--;   // still in the air: not part of the result
          continue;
        }
      }
      grid += c;
    }
    // 🎯 in the share line must match the 🟩 in the grid: a Perfek block that later fell is an X.
    let perfects = 0;
    for (let k = 0; k < grid.length; k++) if (grid[k] === 'P') perfects++;
    return {
      mode: this.mode,
      dateKey: this.dateKey,
      dayNumber: this.dayNumber,
      seed: this.seed,
      reason,
      score: this.score,
      heightM: round1(this.maxHeightM),
      blocksPlaced: this.tower.length,
      blocksDropped: Math.max(0, dropped),
      perfects,
      maxCombo: this.maxCombo,
      grid,
      weather: [...(this.weather.seen || [])],
      durationMs: Math.round(this.playMs),
    };
  }

  // -------------------------------------------------------------------------
  // Game over
  // -------------------------------------------------------------------------
  endGame(reason) {
    if (this.over || this.idle) return;
    this.over = true;
    this.overReason = reason;
    this.inputLocked = true;
    this.hintPending = false;
    for (const b of this.active) {
      this.cancel(b.waitTimer);
      b.waitTimer = null;
    }
    for (const t of this.timers) t.remove(false);   // pending next-block spawns
    this.timers.length = 0;
    this.crane.setVisible(false);
    this.setGhostVisible(false);
    bus.emit('hud:hint', { text: null });
    bus.emit('hud:hide');
    const result = this.buildResult(reason);
    this.result = result;

    if (reason === 'quit') {
      bus.emit('game:over', result);
      return;
    }
    this.timeScale = SLOWMO_SCALE;
    this.slowT = 0;
    audio.play('gameover');
    haptics.heavy();
    if (reason === 'lives') this.effects.flash(0xff6b6b, 0.22, 320);
    else this.effects.flash(0x7cc4f2, 0.3, 360);
    this.delay(REVEAL_DELAY_MS, () => this.reveal());
    this.delay(OVER_EMIT_MS, () => bus.emit('game:over', result));
  }

  updateSlowMo(dt) {
    this.slowT += dt;
    if (this.overReason === 'quit') return;
    if (this.slowT <= SLOWMO_MS) this.timeScale = SLOWMO_SCALE;
    else this.timeScale = Math.min(1, SLOWMO_SCALE + ((this.slowT - SLOWMO_MS) / SLOWMO_RAMP_MS) * (1 - SLOWMO_SCALE));
  }

  /** Zoom out to show the whole tower from just above its top down to the island. */
  reveal() {
    const cam = this.cameras.main;
    this.revealing = true;
    cam.setRotation(0);
    const top = this.towerTopY - 120;
    const bottom = LAYOUT.baseTopY + 200;
    const span = Math.max(1, bottom - top);
    const z = clamp(Math.min(1, this.H / span), 0.15, 1);
    cam.zoomTo(z, REVEAL_MS, 'Sine.easeInOut');
    cam.pan(GAME_W / 2, (top + bottom) / 2, REVEAL_MS, 'Sine.easeInOut');
  }

  // -------------------------------------------------------------------------
  // Idle attract mode: after a few blocks the tower dissolves and starts over.
  // -------------------------------------------------------------------------
  idleReset() {
    if (!this.idle || this.idleResetting) return;
    this.idleResetting = true;
    const imgs = [];
    for (const b of this.active) if (b.image && b.image.scene) imgs.push(b.image);
    for (const b of this.frozen) if (b.image && b.image.scene) imgs.push(b.image);
    const finish = () => {
      for (const b of this.active) b.destroy();
      for (const b of this.frozen) b.destroy();
      this.resetRunState();
      this.seed = `idle-${Math.floor(Math.random() * 1e9)}`;
      this.sequence = createSequence(this.seed);
      this.stepCtx.dynamicBlocks = this.dyn;
      this.stepCtx.falling = null;
      this.spawnBlock(0);
    };
    if (!imgs.length) {
      finish();
      return;
    }
    this.tweens.add({
      targets: imgs,
      alpha: 0,
      scaleX: 0.85,
      scaleY: 0.85,
      duration: 520,
      ease: 'Quad.easeIn',
      onComplete: finish,
    });
  }

  // -------------------------------------------------------------------------
  // Debug
  // -------------------------------------------------------------------------
  getState() {
    return {
      mode: this.mode,
      i: this.i,
      score: this.score,
      heightM: round1(Math.max(0, LAYOUT.baseTopY - this.towerTopY) / PX_PER_M),
      maxHeightM: round1(this.maxHeightM),
      lives: this.lives,
      combo: this.combo,
      perfects: this.perfects,
      waterSurfaceY: this.water ? this.water.surfaceY : null,
      towerTopY: this.towerTopY,
      active: this.weather?.active?.type ?? null,
      over: this.over,
      blocksDropped: this.blocksDropped,
      blocksPlaced: this.tower.length,
      frozen: this.frozen.length,
      grid: this.buildResult('quit').grid,
    };
  }
}

export default GameScene;
