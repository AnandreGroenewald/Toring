// Weather events (weer): block-indexed from the daily sequence. Applies wind
// forces before every physics step, spawns hail, throws lightning and draws
// cheap screen-space visuals (rain, wind streaks, fog, heat haze, storm cloud).
// Screen-space objects live in two containers that cancel the camera zoom, so
// overlays keep covering the screen during the game-over zoom-out.

import { WEATHER_TUNING as WT, DEPTH, GAME_W, LAYOUT, PHYSICS, accelToForce } from '../config.js';
import { WEATHER_INFO } from '../core/strings.js';
import { eventRng, gustMul, strikePlan, hailPlan } from '../core/weatherplan.js';

const Mt = () => Phaser.Physics.Matter.Matter;

const FADE_MS = 600;
const SKY_DARK = { wind: 0, gust: 0.15, rain: 0.25, storm: 0.55, hail: 0.35, fog: 0.2, heat: 0, rainbow: 0 };
const GLOOM = { rain: 0.35, storm: 1, hail: 0.6, gust: 0.2 };   // tint over the play field
const LVL_KEYS = Object.keys(SKY_DARK);
const GLOOM_KEYS = Object.keys(GLOOM);
const RAIN_DROPS = 80;
const STORM_DROPS = 40;
const STREAKS = { wind: 14, gust: 22 };
const FOG_PUFFS = 8;
const HAZE_STRIPS = 9;
const FOG_MAX = 0.8;
const TOWER_BUFFET_MS = 1400;     // period of the wind's rocking push on the resting tower

const STRIKE_FIRST_MS = 700;      // first warning starts this long after the banner
const STRIKE_SECOND_MS = 6000;    // ...the second one at the latest this long after the first
const BOLT_MS = 260;
const CLOUD_DY = 44;              // storm cloud centre below the jib (screen px)

const HAIL_SPAWN_FROM = 500;
const HAIL_SPAWN_TO = 5000;
const HAIL_LIFE = 6000;
const HAIL_FADE = 450;
const HAIL_AIR = 0.02;            // caps the fall speed (~15 px/step) so stones nudge rather than smash
const HAIL_GROUP = -7;
const HAIL_R = [8, 10];           // bigger stones read better; density keeps the old mass (r 6-8 at 0.004)
const HAIL_DENSITY = 0.0024;
const GUST_PRE = 64;              // gust strengths drawn ahead per event (one per flip)

// Everything that can change the tower (wind strength, gust flips, lightning,
// hail) runs on the fixed physics step and draws from per-event random streams
// derived from the daily seed, so the Daaglikse Toring plays out the same for
// everyone at any refresh rate. Math.random is only used for looks and sounds.
const STEP_MS = PHYSICS.fixedDtMs;

const TYPE_SOUND = {
  wind: (ev) => ['wind', { strength: ev.strength }],
  gust: (ev) => ['wind', { strength: ev.strength * WT.gustMul }],
  rain: () => ['rain', {}],
  storm: () => ['thunder', { intensity: 0.35 }],
  hail: () => ['hail', {}],
  fog: () => ['fog', {}],
  heat: () => ['heat', {}],
  rainbow: () => ['rainbow', {}],
};

const rand = (a, b) => a + Math.random() * (b - a);   // visuals and sounds only
const strikeable = (b) => !!b && !b.destroyed && !!b.body && !b.body.isStatic && b.state !== 'lost' && b.state !== 'falling';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------------------
// Generated textures (drawn once per game, shared by all scenes)
// ---------------------------------------------------------------------------

function canvasTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext(), w, h);
  tex.refresh();
}

function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function makeTextures(scene) {
  canvasTexture(scene, 'wx_px', 4, 4, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 4, 4);
  });
  canvasTexture(scene, 'wx_drop', 8, 60, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(210,232,255,0)');
    g.addColorStop(0.6, 'rgba(225,240,255,0.7)');
    g.addColorStop(1, 'rgba(250,253,255,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 0.9, 0);
    ctx.lineTo(w / 2 + 0.9, 0);
    ctx.lineTo(w / 2 + 1.7, h - 2);
    ctx.arc(w / 2, h - 2, 1.7, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
  });
  const swoosh = (curl) => (ctx, w, h) => {
    const y = h * 0.62;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(6, y);
      if (curl) {
        ctx.bezierCurveTo(w * 0.35, y - 2, w * 0.62, y + 3, w * 0.76, y - 1);
        ctx.bezierCurveTo(w * 0.9, y - 6, w * 0.9, y - h * 0.5, w * 0.8, y - h * 0.48);
        ctx.bezierCurveTo(w * 0.72, y - h * 0.46, w * 0.72, y - h * 0.2, w * 0.82, y - h * 0.2);
      } else {
        ctx.bezierCurveTo(w * 0.35, y - 3, w * 0.65, y + 3, w - 6, y - 1);
      }
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    const e = ctx.createLinearGradient(0, 0, w, 0);
    e.addColorStop(0, 'rgba(40,80,130,0)');
    e.addColorStop(0.5, 'rgba(40,80,130,0.16)');
    e.addColorStop(1, 'rgba(40,80,130,0.2)');
    ctx.strokeStyle = e;
    ctx.lineWidth = 7;
    path();
    ctx.stroke();
    ctx.strokeStyle = g;
    ctx.lineWidth = 4;
    path();
    ctx.stroke();
  };
  canvasTexture(scene, 'wx_streak', 200, 18, swoosh(false));
  canvasTexture(scene, 'wx_curl', 200, 40, swoosh(true));
  canvasTexture(scene, 'wx_puff', 128, 128, (ctx, w) => {
    ctx.fillStyle = radial(ctx, w / 2, w / 2, w / 2, [
      [0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, w, w);
  });
  canvasTexture(scene, 'wx_band', 16, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  canvasTexture(scene, 'wx_heat', 16, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,200,130,0.58)');
    g.addColorStop(0.3, 'rgba(255,215,160,0.22)');
    g.addColorStop(0.6, 'rgba(255,236,200,0.08)');
    g.addColorStop(1, 'rgba(255,190,130,0.24)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  canvasTexture(scene, 'wx_haze', 256, 40, (ctx, w, h) => {
    ctx.lineCap = 'round';
    for (const [lw, a] of [[16, 0.06], [8, 0.1], [3, 0.22]]) {
      ctx.strokeStyle = `rgba(255,244,225,${a})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let x = 10; x <= w - 10; x += 4) {
        const y = h / 2 + Math.sin((x / w) * Math.PI * 4) * 6;
        if (x === 10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.3, 'rgba(0,0,0,1)');
    g.addColorStop(0.7, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  });
  canvasTexture(scene, 'wx_cloud', 300, 140, (ctx, w, h) => {
    const blobs = [
      [70, 88, 46], [118, 66, 56], [176, 60, 60], [228, 82, 48], [150, 96, 52], [92, 100, 40], [210, 102, 40],
    ];
    ctx.save();
    ctx.shadowColor = 'rgba(10,14,30,0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    const g = ctx.createLinearGradient(0, 10, 0, h - 10);
    g.addColorStop(0, '#6d778d');
    g.addColorStop(0.55, '#454d63');
    g.addColorStop(1, '#2c3245');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (const [x, y, r] of blobs) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
    // soft light rim on top
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = radial(ctx, 150, 10, 140, [[0, 'rgba(190,200,225,0.55)'], [1, 'rgba(190,200,225,0)']]);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  });
  canvasTexture(scene, 'wx_glow', 128, 128, (ctx, w) => {
    ctx.fillStyle = radial(ctx, w / 2, w / 2, w / 2, [
      [0, 'rgba(255,255,255,1)'], [0.25, 'rgba(210,235,255,0.85)'], [1, 'rgba(150,200,255,0)'],
    ]);
    ctx.fillRect(0, 0, w, w);
  });
  canvasTexture(scene, 'wx_beam', 32, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,240,170,0)');
    g.addColorStop(0.5, 'rgba(255,240,170,1)');
    g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    const v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(0,0,0,0.2)');
    v.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  });
  canvasTexture(scene, 'wx_hail', 24, 24, (ctx) => {
    ctx.fillStyle = radial(ctx, 9, 9, 13, [[0, '#ffffff'], [0.55, '#eef7ff'], [1, '#b9d6f2']]);
    ctx.beginPath();
    ctx.arc(12, 12, 9.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(29,43,69,0.7)';   // dark rim: reads against a pale sky
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(8.6, 7.9, 3.1, 2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

export class Weather {
  constructor(scene, sequence, { effects = null, audio = null, haptics = null, bus = null, reducedMotion = false } = {}) {
    this.scene = scene;
    this.sequence = sequence;
    this.effects = effects;
    this.audio = audio;
    this.haptics = haptics;
    this.bus = bus;
    this.reducedMotion = !!reducedMotion;
    this.seen = [];
    this.destroyed = false;

    this._seed = sequence && sequence.seed != null ? String(sequence.seed) : 'wx';
    this._evRng = null;
    this._active = null;
    this._i = 0;
    this._t = 0;                 // simulated ms since the active event started (physics steps)
    this._simTime = 0;           // simulated ms since construction (wind breathing phase)
    this._time = 0;              // frame ms since construction (visual phases only)
    this._lvl = { wind: 0, gust: 0, rain: 0, storm: 0, hail: 0, fog: 0, heat: 0, rainbow: 0 };
    this._wind = 0;              // current accel px/s^2 (smoothed, includes fade)
    this._windMean = 0;
    this._windBase = 0;
    this._rainDir = 1;
    this._buffet = 0;
    this._gust = { dir: 1, timer: 0, flips: 0, mul: 1, muls: [] };
    this._sfxTimer = 0;
    this._dyn = [];
    this._force = { x: 0, y: 0 };
    this._reg = { skyDark: -1, wind: NaN, rainbow: -1 };
    this._W = GAME_W;
    this._H = scene.scale ? scene.scale.height : 1280;
    this._zoom = 1;
    this._top = 0;               // screen y offset of the crane (safe-area inset)

    this._storm = {
      phase: 'idle', simT: 0, t: 0, strikes: 0, nextAt: null, x: GAME_W / 2, topY: 0, flicker: 0, zapped: false,
      ev: null, bolt: null, boltT: -1, target: null,
    };
    this._hail = [];
    this._hailPlan = [];
    this._lastHailSfx = 0;

    // visual pools (created lazily)
    this._rain = null;
    this._streaks = null;
    this._fog = null;
    this._heat = null;
    this._gloom = null;
    this._cloud = null;
    this._bolt = null;

    makeTextures(scene);
    this.layer = scene.add.container(0, 0).setDepth(DEPTH.weather).setScrollFactor(0);
    this.fxLayer = scene.add.container(0, 0).setDepth(DEPTH.fxScreen).setScrollFactor(0);

    this._onCollide = (event) => this._collisionStart(event);
    this._world = scene.matter && scene.matter.world;
    if (this._world) this._world.on('collisionstart', this._onCollide);
  }

  // --- public getters -------------------------------------------------------

  get active() { return this._active; }
  get windAccel() { return this._wind; }
  get meanWindAccel() { return this._windMean; }
  get frictionMul() { return this._is('rain') ? WT.rainFriction : 1; }
  get waterSpeedMul() { return this._is('rain') ? WT.rainWaterMul : 1; }
  get craneSpeedMul() { return 1 + (WT.heatCraneMul - 1) * this._lvl.heat; }
  get heatLevel() { return this._lvl.heat; }
  get fogAlpha() { return FOG_MAX * this._lvl.fog; }
  get perfectMul() { return this._is('rainbow') ? WT.rainbowScoreMul : 1; }
  get blocksLeft() { return this._active ? Math.max(0, this._active.end - this._i) : null; }

  /** Rain: which way a landing block skids (with the rain) and how far, or null when it isn't raining. */
  rainSkid() {
    if (!this._is('rain')) return null;
    return { dir: this._active.dir || 1, px: WT.rainSkidPx * (this._active.strength || 1) };
  }

  isHail(body) {
    if (!body) return false;
    return body.label === 'hail' || (!!body.parent && body.parent.label === 'hail');
  }

  _is(type) {
    return !!this._active && this._active.type === type;
  }

  /** Gust strength multiplier for flip `n` of the active event (seeded: same for every player). */
  _gustMul(n) {
    const g = this._gust;
    if (n <= 0) return 1;
    if (n <= g.muls.length) return g.muls[n - 1];
    return this._evRng ? gustMul(this._evRng, n) : 1;
  }

  // --- event lifecycle ------------------------------------------------------

  /** Called when block i is attached to the crane. */
  setBlockIndex(i) {
    if (this.destroyed) return null;
    this._i = i;
    if (this._active && i >= this._active.end) this._endEvent();
    const ev = this.sequence && this.sequence.eventAt ? this.sequence.eventAt(i) : null;
    // (a punishment from the other player in the Uitdagersreeks runs its course first)
    if (ev && ev.start === i && !(this._active && this._active.forced) && (!this._active || this._active.start !== ev.start)) this._startEvent(ev);
    // storm: second strike once the event is half-way through (by blocks)
    const s = this._storm;
    if (this._is('storm') && s.strikes === 1 && s.phase === 'idle' && s.nextAt !== null) {
      const mid = this._active.start + Math.ceil((this._active.end - this._active.start) / 2);
      if (i >= mid) s.nextAt = Math.min(s.nextAt, this._t);
    }
    return this._active;
  }

  /**
   * Uitdagersreeks: the other player sent this weather (Mis or Hittegolf) for the next `blocks` blocks.
   * `title` names who sent it ("Anna stuur Mis!"). False if this weather can't be sent.
   */
  force(type, blocks, title) {
    if (this.destroyed || !WEATHER_INFO[type]) return false;
    this._startEvent({ type, start: this._i, end: this._i + Math.max(1, blocks | 0), dir: 1, strength: 1, forced: true }, title);
    return true;
  }

  _startEvent(ev, title = null) {
    if (this._active) this._endEvent();
    this._active = ev;
    this._t = 0;
    this._sfxTimer = 0;
    this._evRng = eventRng(this._seed, ev);
    this.seen.push(ev.type);

    const info = WEATHER_INFO[ev.type];
    if (info && this.bus) {
      this.bus.emit('hud:banner', { emoji: info.emoji, title: title || info.name, subtitle: info.desc(ev.dir), type: ev.type });
    }
    this._play('banner');
    const snd = TYPE_SOUND[ev.type];
    if (snd) {
      const [name, opts] = snd(ev);
      this._play(name, opts);
    }

    if (ev.type === 'gust') {
      const g = this._gust;
      g.dir = ev.dir || 1;
      g.timer = 0;
      g.flips = 0;
      g.mul = 1;
      g.muls = [];
      for (let n = 1; n <= GUST_PRE; n++) g.muls.push(gustMul(this._evRng, n));
    }
    if (ev.type === 'storm') {
      const s = this._storm;
      s.strikes = 0;
      s.nextAt = STRIKE_FIRST_MS;
    }
    if (ev.type === 'hail') this._planHail(ev);
    if (ev.type === 'rain' || ev.type === 'storm') this._rainDir = ev.dir || 1;
    if (ev.type === 'rainbow' && this.bus) this.bus.emit('weather:rainbow');
  }

  _endEvent() {
    this._active = null;
    this._storm.nextAt = null;  // a warning already showing still finishes
    this._hailPlan.length = 0;
  }

  _play(name, opts) {
    if (this.audio && this.audio.play) this.audio.play(name, opts || {});
  }

  // --- physics (fixed step) -------------------------------------------------

  /**
   * Before every fixed physics step: wind on the falling block, the tower and
   * hail, then advance the weather clock by one step (gusts, lightning, hail).
   * ctx = { dynamicBlocks, falling, towerTopY }.
   */
  beforeStep(ctx = {}) {
    if (this.destroyed) return;
    const dyn = ctx.dynamicBlocks || this._dyn;
    this._dyn = dyn;
    const a = this._wind;
    const falling = ctx.falling;
    if (Math.abs(a) >= 0.5) {
      if (falling && !falling.destroyed && falling.body && !falling.body.isStatic) this._push(falling.body, a);
      // Resting blocks get the wind as buffeting (zero mean): Matter integrates a
      // steady force before it solves friction, so a constant sideways push makes
      // a resting stack creep ~a*dt^2 every step (~30 px per wind event). An
      // oscillating push rocks the tower, can still blow an overhanging block off,
      // but nothing walks.
      this._buffet = (this._buffet + (Math.PI * 2 * STEP_MS) / TOWER_BUFFET_MS) % (Math.PI * 2);
      const tower = Math.abs(a) * WT.towerWindFactor * Math.sin(this._buffet);
      for (let k = 0; k < dyn.length; k++) {
        const b = dyn[k];
        if (!b || b === falling || b.destroyed || !b.body || b.body.isStatic) continue;
        // forces wake sleeping bodies by themselves (Matter's Sleeping.update)
        this._push(b.body, b.state === 'lost' || b.state === 'falling' ? a : tower);
      }
      for (let k = 0; k < this._hail.length; k++) this._push(this._hail[k].body, a);
    }
    this._stepClock(ctx);
  }

  _push(body, accel) {
    const f = this._force;
    f.x = accelToForce(body.mass, accel);
    f.y = 0;
    Mt().Body.applyForce(body, body.position, f);
  }

  /** One fixed step of everything that affects the tower. */
  _stepClock(ctx) {
    this._simTime += STEP_MS;
    if (this._active) this._t += STEP_MS;
    this._updateLevels(STEP_MS);
    this._updateWind(STEP_MS);
    this._stepStorm(ctx);
    this._stepHail(ctx);
  }

  // --- per frame (visuals) --------------------------------------------------

  update(dtMs, ctx = {}) {
    if (this.destroyed) return;
    const dt = Math.min(100, Math.max(0, dtMs || 0));
    const cam = ctx.camera || this.scene.cameras.main;
    this._W = ctx.W || GAME_W;
    this._H = ctx.H || (this.scene.scale ? this.scene.scale.height : 1280);
    if (Number.isFinite(ctx.craneTop)) this._top = ctx.craneTop;
    this._time += dt;

    this._updateAmbient(dt);
    this._syncLayers(cam);
    this._updateRain(dt);
    this._updateStreaks(dt);
    this._updateFog(dt);
    this._updateHeat(dt);
    this._updateGloom();
    this._updateStorm(dt, ctx, cam);
    this._updateHail(dt);
    this._writeRegistry();
  }

  _updateLevels(dt) {
    const step = dt / FADE_MS;
    const type = this._active ? this._active.type : null;
    for (const k of LVL_KEYS) {
      const target = k === type ? 1 : 0;
      const v = this._lvl[k];
      this._lvl[k] = v < target ? Math.min(target, v + step) : Math.max(target, v - step);
    }
  }

  _updateWind(dt) {
    const ev = this._active;
    const t = this._simTime / 1000;
    let target = 0;
    let mean = 0;
    if (ev && ev.type === 'wind') {
      const base = (ev.dir || 1) * WT.windAccel * ev.strength;
      this._windBase = base;
      mean = base * this._lvl.wind;
      // small breathing only, so the ghost (mean wind) stays a fair prediction
      target = base * (1 + 0.05 * Math.sin(t * 1.3) + 0.03 * Math.sin(t * 3.7)) * this._lvl.wind;
    } else if (ev && ev.type === 'gust') {
      const g = this._gust;
      g.timer += dt;
      if (g.timer >= WT.gustFlipMs) {
        g.timer -= WT.gustFlipMs;
        g.dir = -g.dir;
        g.flips++;
        g.mul = this._gustMul(g.flips);
        this._play('wind', { strength: ev.strength * WT.gustMul * g.mul });
      }
      const base = g.dir * WT.windAccel * ev.strength * WT.gustMul;
      this._windBase = base * g.mul;
      mean = base * this._lvl.gust;
      target = base * g.mul * (0.85 + 0.15 * Math.sin(t * 7)) * this._lvl.gust;
    } else {
      // event over: the last wind dies out with its fade level
      target = this._windBase * Math.max(this._lvl.wind, this._lvl.gust);
    }
    // smooth (gust flips swing over ~150 ms instead of snapping)
    const k = 1 - Math.exp(-dt / 150);
    this._wind += (target - this._wind) * k;
    if (Math.abs(this._wind) < 0.05 && target === 0) this._wind = 0;
    this._windMean = mean;
  }

  /**
   * Wind (px/s^2) on each of the next `n` physics steps, replaying the step
   * clock without touching state. Gust flips and their (seeded) strengths are
   * known in advance, so the landing ghost foresees them exactly.
   */
  forecastWind(n, out) {
    const ev = this._active;
    const type = ev ? ev.type : null;
    const fade = STEP_MS / FADE_MS;
    const k = 1 - Math.exp(-STEP_MS / 150);
    let w = this._wind;
    let time = this._simTime;
    let lw = this._lvl.wind;
    let lg = this._lvl.gust;
    let gTimer = this._gust.timer;
    let gDir = this._gust.dir;
    let gFlips = this._gust.flips;
    let gMul = this._gust.mul;
    for (let s = 0; s < n; s++) {
      out[s] = Math.abs(w) < 0.5 ? 0 : w;   // beforeStep() skips tiny winds
      time += STEP_MS;
      lw = type === 'wind' ? Math.min(1, lw + fade) : Math.max(0, lw - fade);
      lg = type === 'gust' ? Math.min(1, lg + fade) : Math.max(0, lg - fade);
      const t = time / 1000;
      let target;
      if (type === 'wind') {
        const base = (ev.dir || 1) * WT.windAccel * ev.strength;
        target = base * (1 + 0.05 * Math.sin(t * 1.3) + 0.03 * Math.sin(t * 3.7)) * lw;
      } else if (type === 'gust') {
        gTimer += STEP_MS;
        if (gTimer >= WT.gustFlipMs) {
          gTimer -= WT.gustFlipMs;
          gDir = -gDir;
          gFlips++;
          gMul = this._gustMul(gFlips);
        }
        target = gDir * WT.windAccel * ev.strength * WT.gustMul * gMul * (0.85 + 0.15 * Math.sin(t * 7)) * lg;
      } else {
        target = this._windBase * Math.max(lw, lg);
      }
      w += (target - w) * k;
      if (Math.abs(w) < 0.05 && target === 0) w = 0;
    }
    return out;
  }

  _updateAmbient(dt) {
    const ev = this._active;
    if (!ev) return;
    this._sfxTimer += dt;
    if (ev.type === 'wind' && this._sfxTimer > 2000) {
      this._sfxTimer = rand(-300, 300);
      this._play('wind', { strength: ev.strength * rand(0.7, 1.1) });
    } else if (ev.type === 'rain' && this._sfxTimer > 3600) {
      this._sfxTimer = 0;
      this._play('rain');
    } else if (ev.type === 'storm' && this._sfxTimer > 5200 && this._storm.phase === 'idle') {
      this._sfxTimer = rand(-1200, 0);
      this._play('thunder', { intensity: 0.25 });
      if (this.effects && this.effects.flash && !this.reducedMotion) this.effects.flash(0xdfe8ff, 0.1, 140);
    }
  }

  _syncLayers(cam) {
    const zoom = cam ? cam.zoom || 1 : 1;
    if (zoom === this._zoom) return;
    this._zoom = zoom;
    const k = 1 / zoom;
    const cx = (cam.width || this._W) * 0.5;
    const cy = (cam.height || this._H) * 0.5;
    for (const layer of [this.layer, this.fxLayer]) {
      layer.setScale(k);
      layer.setPosition(cx - cx * k, cy - cy * k);
    }
  }

  // --- rain -----------------------------------------------------------------

  _rainTarget() {
    const n = RAIN_DROPS * this._lvl.rain + STORM_DROPS * this._lvl.storm;
    return Math.round(this.reducedMotion ? n * 0.5 : n);
  }

  _updateRain(dt) {
    const want = this._rainTarget();
    if (!this._rain && want === 0) return;
    if (!this._rain) {
      this._rain = [];
      for (let k = 0; k < RAIN_DROPS; k++) {
        const img = this.scene.add.image(0, 0, 'wx_drop').setScrollFactor(0).setVisible(false);
        this.layer.add(img);
        this._rain.push({ img, x: 0, y: 0, vy: 0, on: false });
      }
    }
    const W = this._W;
    const H = this._H;
    const s = dt / 1000;
    const slant = this._rainDir * 150 * Math.max(this._lvl.rain, this._lvl.storm);
    const vx = clamp(this._wind * 2.2 + slant, -900, 900);
    let on = 0;
    for (let k = 0; k < this._rain.length; k++) {
      const p = this._rain[k];
      if (!p.on) {
        if (k < want) {
          this._spawnDrop(p, vx, true);
          p.on = true;
        } else {
          continue;
        }
      }
      p.x += vx * s;
      p.y += p.vy * s;
      if (p.y > H + 50 || p.x < -120 || p.x > W + 120) {
        if (k < want) this._spawnDrop(p, vx, false);
        else {
          p.on = false;
          p.img.setVisible(false);
          continue;
        }
      }
      p.img.setPosition(p.x, p.y);
      p.img.rotation = -Math.atan2(vx, p.vy);
      on++;
    }
    this._rainOn = on;
  }

  _spawnDrop(p, vx, anywhere) {
    const W = this._W;
    const H = this._H;
    p.vy = rand(1500, 1900);
    p.y = anywhere ? rand(-60, H) : rand(-90, -40);
    // start upwind so slanted rain still covers the whole width
    const drift = (vx * (H / p.vy)) * 0.6;
    p.x = rand(-40, W + 40) - drift;
    const sc = rand(0.65, 1.15);
    p.img.setScale(1, sc).setAlpha(rand(0.35, 0.7)).setVisible(true);
  }

  // --- wind streaks ---------------------------------------------------------

  _updateStreaks(dt) {
    const lv = Math.max(this._lvl.wind, this._lvl.gust);
    let want = Math.round((this._lvl.gust > this._lvl.wind ? STREAKS.gust : STREAKS.wind) * lv);
    if (this.reducedMotion) want = Math.round(want * 0.5);
    if (!this._streaks && want === 0) return;
    if (!this._streaks) {
      this._streaks = [];
      for (let k = 0; k < STREAKS.gust; k++) {
        const img = this.scene.add.image(0, 0, k % 4 === 1 ? 'wx_curl' : 'wx_streak').setScrollFactor(0).setVisible(false);
        img.setOrigin(1, 0.62);   // the head leads
        this.layer.add(img);
        this._streaks.push({ img, x: 0, y: 0, dir: 1, life: 0, max: 1, wob: 0, len: 1, speedMul: 1, on: false });
      }
    }
    const s = dt / 1000;
    const w = this._wind;
    const mag = Math.min(2.5, Math.abs(w) / WT.windAccel);
    const dir = w >= 0 ? 1 : -1;
    for (let k = 0; k < this._streaks.length; k++) {
      const p = this._streaks[k];
      if (!p.on) {
        if (k >= want || mag < 0.15) continue;
        this._spawnStreak(p, dir, k < 3);
      }
      // a gust flip: streaks keep their heading and fade out fast
      p.life += p.dir === dir ? dt : dt * 4;
      const speed = (600 + 520 * mag) * p.speedMul;
      p.x += p.dir * speed * s;
      p.y += Math.sin(this._time * 0.004 + p.wob) * 18 * s;
      const u = p.life / p.max;
      if (u >= 1 || p.x < -200 || p.x > this._W + 200) {
        p.on = false;
        p.img.setVisible(false);
        continue;
      }
      p.img.setPosition(p.x, p.y);
      p.img.scaleX = p.dir * p.len * (0.75 + 0.25 * Math.min(1.5, mag));
      p.img.alpha = Math.sin(u * Math.PI) * 0.8 * lv;
    }
  }

  _spawnStreak(p, dir, anywhere) {
    const W = this._W;
    const H = this._H;
    p.on = true;
    p.dir = dir;
    p.life = 0;
    p.max = rand(700, 1300);
    p.speedMul = rand(0.8, 1.2);
    p.len = rand(0.55, 1.05);
    p.wob = rand(0, 6.28);
    p.x = anywhere ? rand(0, W) : dir > 0 ? rand(-160, W * 0.4) : rand(W * 0.6, W + 160);
    p.y = rand(LAYOUT.jibY + 40, H - 140);
    p.img.setVisible(true).setAlpha(0).setScale(p.len, rand(0.8, 1.1));
  }

  // --- fog ------------------------------------------------------------------

  _updateFog(dt) {
    const lv = this._lvl.fog;
    if (!this._fog && lv <= 0) return;
    const W = this._W;
    if (!this._fog) {
      const band = (y, h, a) => {
        const img = this.scene.add.image(W / 2, y, 'wx_band').setScrollFactor(0);
        img.setDisplaySize(W * 1.1, h);
        this.layer.add(img);
        return { img, a };
      };
      const drop = LAYOUT.dropLineY + this._top;
      const bands = [band(drop - 30, 620, 0.86), band(drop - 330, 420, 0.42), band(drop + 260, 460, 0.5)];
      const puffs = [];
      for (let k = 0; k < FOG_PUFFS; k++) {
        const img = this.scene.add.image(0, 0, 'wx_puff').setScrollFactor(0);
        this.layer.add(img);
        puffs.push({
          img,
          x: rand(-80, W + 80),
          y: drop - 250 + (k / FOG_PUFFS) * 420 + rand(-40, 40),
          vx: rand(14, 34) * (Math.random() < 0.5 ? -1 : 1),
          sc: rand(2.8, 4.2),
          a: rand(0.5, 0.75),
          ph: rand(0, 6.28),
        });
      }
      this._fog = { bands, puffs };
    }
    const vis = lv > 0.001;
    const s = dt / 1000;
    const t = this._time / 1000;
    for (const b of this._fog.bands) {
      b.img.setVisible(vis);
      b.img.alpha = b.a * lv;
    }
    for (const p of this._fog.puffs) {
      p.img.setVisible(vis);
      if (!vis) continue;
      p.x += (p.vx + this._wind * 0.15) * s;
      if (p.x < -260) p.x = W + 240;
      else if (p.x > W + 260) p.x = -240;
      p.img.setPosition(p.x, p.y + Math.sin(t * 0.5 + p.ph) * 14);
      p.img.setScale(p.sc * (1 + 0.06 * Math.sin(t * 0.7 + p.ph)), p.sc * 0.62);
      p.img.alpha = p.a * lv;
    }
  }

  // --- heat -----------------------------------------------------------------

  _updateHeat(dt) {
    const lv = this._lvl.heat;
    if (!this._heat && lv <= 0) return;
    const W = this._W;
    const H = this._H;
    if (!this._heat) {
      const overlay = this.scene.add.image(W / 2, H / 2, 'wx_heat').setScrollFactor(0);
      overlay.setDisplaySize(W * 1.08, H * 1.04);
      const sun = this.scene.add.image(W * 0.78, -10, 'wx_glow').setScrollFactor(0).setTint(0xff7418)
        .setScale(12, 8).setBlendMode(Phaser.BlendModes.ADD);
      this.layer.add([overlay, sun]);
      const strips = [];
      for (let k = 0; k < HAZE_STRIPS; k++) {
        const img = this.scene.add.image(0, 0, 'wx_haze').setScrollFactor(0);
        this.layer.add(img);
        strips.push({ img, x: rand(60, W - 60), y: H - (k / HAZE_STRIPS) * (H - 300), v: rand(30, 55), sc: rand(1.1, 1.9), ph: rand(0, 6.28) });
      }
      this._heat = { overlay, sun, strips };
    }
    const vis = lv > 0.001;
    const t = this._time / 1000;
    const h = this._heat;
    h.overlay.setVisible(vis);
    h.sun.setVisible(vis);
    if (!vis) {
      for (const p of h.strips) p.img.setVisible(false);
      return;
    }
    h.overlay.alpha = lv * (0.88 + 0.12 * Math.sin(t * 2.2));
    h.sun.alpha = lv * (0.62 + 0.1 * Math.sin(t * 1.3));
    const s = dt / 1000;
    for (const p of h.strips) {
      p.y -= p.v * s;
      if (p.y < 260) {
        p.y = H + 20;
        p.x = rand(60, W - 60);
        p.v = rand(30, 55);
      }
      const u = clamp((H + 20 - p.y) / (H - 240), 0, 1);
      p.img.setVisible(true);
      p.img.setPosition(p.x + Math.sin(t * 1.7 + p.ph) * 22, p.y);
      p.img.setScale(p.sc * (1 + 0.08 * Math.sin(t * 2.3 + p.ph)), 1 + 0.45 * Math.sin(t * 3 + p.ph));
      p.img.alpha = Math.sin(u * Math.PI) * 0.85 * lv;
    }
  }

  // --- gloom (storm / hail darkening over the play field) -------------------

  _updateGloom() {
    let g = 0;
    for (const k of GLOOM_KEYS) g = Math.max(g, GLOOM[k] * this._lvl[k]);
    if (!this._gloom && g <= 0) return;
    if (!this._gloom) {
      this._gloom = this.scene.add.image(this._W / 2, this._H / 2, 'wx_px').setScrollFactor(0).setTint(0x14203d);
      this._gloom.setDisplaySize(this._W * 1.1, this._H * 1.1);
      this.layer.addAt(this._gloom, 0);
    }
    this._gloom.setVisible(g > 0.001);
    this._gloom.alpha = g * 0.2;
  }

  // --- storm / lightning ----------------------------------------------------

  _cloudY() {
    return LAYOUT.jibY + this._top + CLOUD_DY;
  }

  _ensureStormVisuals() {
    if (this._cloud) return;
    const sc = this.scene;
    const cy = this._cloudY();
    const cloud = sc.add.image(GAME_W / 2, cy, 'wx_cloud').setScrollFactor(0).setAlpha(0).setVisible(false);
    const glow = sc.add.image(GAME_W / 2, cy + 10, 'wx_glow').setScrollFactor(0).setAlpha(0).setScale(1.6, 1.1);
    const beam = sc.add.image(GAME_W / 2, cy + 40, 'wx_beam').setScrollFactor(0).setOrigin(0.5, 0).setAlpha(0);
    const icon = sc.add.text(GAME_W / 2, cy + 8, '⚡', {
      fontFamily: 'sans-serif', fontSize: '52px', resolution: 1,
      shadow: { offsetX: 0, offsetY: 3, color: 'rgba(20,30,60,0.5)', blur: 6, fill: true },
    }).setOrigin(0.5).setScrollFactor(0).setAlpha(0);
    this.layer.add([beam, cloud, glow, icon]);
    this._cloud = { cloud, glow, beam, icon, parts: [cloud, glow, beam, icon], alpha: 0, shown: false };
    const bolt = sc.add.graphics().setScrollFactor(0);
    const flashGlow = sc.add.image(0, 0, 'wx_glow').setScrollFactor(0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.fxLayer.add([bolt, flashGlow]);
    this._bolt = { g: bolt, glow: flashGlow, pts: [], branches: [], x0: 0, y0: 0, x1: 0, y1: 0, redrawn: false };
  }

  /** Lightning timing and the kick itself run on the physics step (same for every player). */
  _stepStorm(ctx) {
    const s = this._storm;
    if (s.phase === 'idle') {
      if (s.nextAt !== null && this._is('storm') && this._t >= s.nextAt) this._beginWarning(ctx);
      return;
    }
    s.simT += STEP_MS;
    const target = this._pickTarget();
    s.target = target;
    if (s.simT >= WT.stormWarnMs) this._strike(ctx, target);
  }

  _updateStorm(dt, ctx, cam) {
    const s = this._storm;
    if (!this._cloud) return;
    const c = this._cloud;
    if (s.bolt) {
      // a strike happened on the last physics step: draw it
      const b = s.bolt;
      s.bolt = null;
      const bx = this._screenX(b.x, cam);
      this._buildBolt(bx, this._cloudY() + 30, bx, this._screenY(b.y, cam));
      s.boltT = 0;
      this._animateBolt(0);
      const fx = this.effects;
      if (fx) {
        if (fx.flash) fx.flash(0xffffff, this.reducedMotion ? 0.3 : 0.6, 200);
        if (fx.shake) fx.shake(0.009, 260);
        if (fx.sparkle) fx.sparkle(b.x, b.y, 18);
      }
      this._play('thunder', { intensity: 0.9 });
      if (this.haptics && this.haptics.heavy) this.haptics.heavy();
    } else if (s.boltT >= 0) {
      s.boltT += dt;
      this._animateBolt(s.boltT);
      if (s.boltT >= BOLT_MS) {
        s.boltT = -1;
        this._bolt.g.clear();
        this._bolt.glow.alpha = 0;
      }
    }
    if (s.phase === 'warn') {
      s.t += dt;
      const target = s.target;
      const tx = target && !target.destroyed ? target.centerX : GAME_W / 2;
      s.x += (tx - s.x) * (1 - Math.exp(-dt / 220));
      s.topY = target && !target.destroyed ? target.top : ctx.towerTopY !== undefined ? ctx.towerTopY : 0;
      // crackle again half-way through the warning
      if (!s.zapped && s.simT > WT.stormWarnMs * 0.55) {
        s.zapped = true;
        this._play('zap');
      }
      s.flicker -= dt;
      if (s.flicker <= 0) {
        s.flicker = rand(110, 300) * (1 - 0.5 * Math.min(1, s.simT / WT.stormWarnMs));
        c.glow.alpha = rand(0.45, 0.95);
      } else {
        c.glow.alpha *= Math.exp(-dt / 70);
      }
    }
    const want = s.phase === 'warn' || s.boltT >= 0 ? 1 : 0;
    c.alpha += (want - c.alpha) * (1 - Math.exp(-dt / (want ? 140 : 380)));
    const vis = c.alpha > 0.01;
    if (vis !== c.shown) {
      c.shown = vis;
      for (const o of c.parts) o.setVisible(vis);
    }
    if (!vis) return;
    const t = this._time / 1000;
    const wob = Math.sin(t * 9) * 3;
    const cy = this._cloudY();
    const cx = this._screenX(s.x, cam) + wob;
    c.cloud.setPosition(cx, cy + Math.sin(t * 2) * 2).setAlpha(c.alpha);
    c.cloud.setScale(1.08 + 0.03 * Math.sin(t * 5));
    c.glow.setPosition(cx, cy + 12);
    if (s.phase !== 'warn') c.glow.alpha *= Math.exp(-dt / 90);
    const warnPulse = s.phase === 'warn' ? 0.55 + 0.45 * Math.abs(Math.sin(t * 7)) : 0;
    // telegraph: a column from the cloud down to the target and a blinking bolt icon above it
    const yTop = cy + 50;
    const yEnd = this._screenY(s.topY, cam);
    const sx = this._screenX(s.x, cam);
    c.icon.setPosition(sx, yEnd - 58).setAlpha(c.alpha * warnPulse).setScale(0.9 + 0.2 * warnPulse);
    c.beam.setPosition(sx, yTop).setDisplaySize(80, Math.max(0, yEnd - yTop)).setAlpha(c.alpha * warnPulse * 0.26);
  }

  _beginWarning(ctx) {
    this._ensureStormVisuals();
    const s = this._storm;
    s.phase = 'warn';
    s.simT = 0;
    s.t = 0;
    s.flicker = 0;
    s.zapped = false;
    s.nextAt = null;
    s.ev = this._active;
    const target = this._pickTarget();
    s.target = target;
    s.x = target ? target.centerX : GAME_W / 2;
    s.topY = target ? target.top : ctx.towerTopY !== undefined ? ctx.towerTopY : 0;
    this._play('zap');
  }

  /** The block lightning hits: the highest block that can still move (the top block, unless it has set). */
  _pickTarget() {
    let best = null;
    for (let k = 0; k < this._dyn.length; k++) {
      const b = this._dyn[k];
      if (strikeable(b) && (!best || b.top < best.top)) best = b;
    }
    return best;
  }

  _screenY(worldY, cam) {
    if (!cam) return worldY;
    const z = cam.zoom || 1;
    const cy = (cam.height || this._H) * 0.5;
    return cy + (worldY - cam.scrollY - cy) * z;
  }

  _screenX(worldX, cam) {
    if (!cam) return worldX;
    const z = cam.zoom || 1;
    const cx = (cam.width || this._W) * 0.5;
    return cx + (worldX - cam.scrollX - cx) * z;
  }

  /** Physics side of a strike (fixed step); the bolt is drawn on the next frame. */
  _strike(ctx, target) {
    const s = this._storm;
    const ev = s.ev || this._active;
    s.phase = 'idle';
    s.simT = 0;
    s.target = null;
    s.strikes++;
    if (this._is('storm') && s.strikes < 2) s.nextAt = this._t + STRIKE_SECOND_MS;

    const hit = target || null;
    const wx = hit ? hit.centerX : GAME_W / 2;
    const wy = hit ? hit.top : Number.isFinite(ctx.towerTopY) ? ctx.towerTopY : 0;
    s.x = wx;
    s.topY = wy;
    s.bolt = { x: wx, y: wy };

    if (target) {
      const M = Mt();
      const body = target.body;
      const p = strikePlan(this._evRng || eventRng(this._seed, { type: 'storm', start: -1 }), s.strikes, WT.strikeKick);
      const strength = ev ? ev.strength : 1;
      const dir = ev && ev.dir ? ev.dir : p.dirIfNone;
      // a Perfek block is "grounded": it takes half the jolt
      const grounded = target.rating === 'P' ? 0.5 : 1;
      M.Sleeping.set(body, false);
      M.Body.setVelocity(body, {
        x: body.velocity.x + dir * p.kick * strength * grounded,
        y: body.velocity.y - 1.5 * grounded,
      });
      M.Body.setAngularVelocity(body, body.angularVelocity + p.spin * 0.04 * grounded);
    }
  }

  _buildBolt(x0, y0, x1, y1) {
    const b = this._bolt;
    b.x0 = x0; b.y0 = y0; b.x1 = x1; b.y1 = y1;
    b.pts = this._jag(x0, y0, x1, y1, 34, 26);
    b.branches = [];
    const n = b.pts.length;
    for (let k = 0; k < 3 && n > 4; k++) {
      const p = b.pts[Math.floor(rand(0.2, 0.75) * n)];
      const len = rand(60, 150);
      const ang = (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.9);
      b.branches.push(this._jag(p.x, p.y, p.x + Math.sin(ang) * len, p.y + Math.cos(ang) * len, 22, 14));
    }
  }

  _jag(x0, y0, x1, y1, seg, amp) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(dist / seg));
    const pts = [{ x: x0, y: y0 }];
    for (let k = 1; k < n; k++) {
      const u = k / n;
      const taper = Math.sin(u * Math.PI) * 0.6 + 0.4;
      pts.push({ x: x0 + (x1 - x0) * u + rand(-amp, amp) * taper, y: y0 + (y1 - y0) * u + rand(-seg * 0.2, seg * 0.2) });
    }
    pts.push({ x: x1, y: y1 });
    return pts;
  }

  _animateBolt(t) {
    const b = this._bolt;
    if (!b) return;
    // re-jag once for a flicker, otherwise only alpha changes
    if (t > 80 && !b.redrawn) {
      b.redrawn = true;
      this._buildBolt(b.x0, b.y0, b.x1, b.y1);
      this._drawBolt();
    } else if (t === 0) {
      b.redrawn = false;
      this._drawBolt();
    }
    const u = clamp(t / BOLT_MS, 0, 1);
    b.g.alpha = u < 0.15 ? 1 : 1 - (u - 0.15) / 0.85;
    b.glow.setPosition(b.x1, b.y1).setScale(1.8 + u * 1.4).setAlpha((1 - u) * 0.9);
  }

  _drawBolt() {
    const b = this._bolt;
    const g = b.g;
    g.clear();
    const path = (pts) => {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x, pts[k].y);
      g.strokePath();
    };
    g.lineStyle(18, 0x8fc8ff, 0.22);
    path(b.pts);
    for (const br of b.branches) {
      g.lineStyle(4, 0xcfe8ff, 0.7);
      path(br);
      g.lineStyle(1.5, 0xffffff, 1);
      path(br);
    }
    g.lineStyle(7, 0xd8f0ff, 0.85);
    path(b.pts);
    g.lineStyle(3, 0xffffff, 1);
    path(b.pts);
  }

  // --- hail -----------------------------------------------------------------

  /** The whole hail shower is drawn from the event's seeded stream when it starts. */
  _planHail(ev) {
    this._hailPlan = hailPlan(this._evRng || eventRng(this._seed, ev), ev, {
      count: WT.hailCount, from: HAIL_SPAWN_FROM, to: HAIL_SPAWN_TO, width: GAME_W, radius: HAIL_R,
    });
  }

  _stepHail(ctx) {
    if (this._is('hail')) {
      const plan = this._hailPlan;
      while (plan.length && plan[plan.length - 1].at <= this._t) this._spawnHail(plan.pop(), ctx);
    }
    const hail = this._hail;
    for (let k = hail.length - 1; k >= 0; k--) {
      const h = hail[k];
      h.age += STEP_MS;
      const p = h.body.position;
      if (h.age > HAIL_LIFE || p.y > 200 || Math.abs(p.x - GAME_W / 2) > 1500) this._removeHail(k);
    }
  }

  _updateHail() {
    const hail = this._hail;
    for (let k = 0; k < hail.length; k++) {
      const h = hail[k];
      const p = h.body.position;
      h.img.setPosition(p.x, p.y);
      h.img.rotation = h.body.angle;
      const left = HAIL_LIFE - h.age;
      const a = left < HAIL_FADE ? Math.max(0, left / HAIL_FADE) : 1;
      h.img.alpha = a;
      // motion streak behind fast stones
      const v = h.body.velocity;
      const sp = Math.hypot(v.x, v.y);
      const k2 = clamp((sp - 3) / 9, 0, 1);
      h.tail.setVisible(k2 > 0.02);
      if (k2 > 0.02) {
        h.tail.setPosition(p.x, p.y);
        h.tail.rotation = -Math.atan2(v.x, v.y);
        h.tail.setScale(h.r / 4, k2 * 1.1);
        h.tail.alpha = 0.55 * k2 * a;
      }
    }
  }

  _spawnHail(st, ctx) {
    const M = Mt();
    const world = this.scene.matter && this.scene.matter.world;
    if (!world) return;
    // aim near the highest block that can still move (or the tower top), in world terms only
    const top = this._pickTarget();
    const towerTopY = Number.isFinite(ctx.towerTopY) ? ctx.towerTopY : LAYOUT.baseTopY;
    const cx = top ? top.centerX : GAME_W / 2;
    const x = st.near ? clamp(cx + st.dx, 20, GAME_W - 20) : st.x;
    const y = Math.min(towerTopY, LAYOUT.baseTopY) - LAYOUT.dropLineY - st.dy;
    const r = st.r;
    const body = M.Bodies.circle(x, y, r, {
      label: 'hail',
      density: HAIL_DENSITY,
      restitution: 0.45,
      friction: 0.1,
      frictionAir: HAIL_AIR,
      slop: 0.02,
      collisionFilter: { group: HAIL_GROUP, category: 0x0001, mask: 0xffffffff },
    });
    body.sleepThreshold = 0;   // never sleeps: keeps bouncing and gets cleaned up
    M.Body.setVelocity(body, { x: (this._wind / WT.windAccel) * 1.5 + st.vx, y: st.vy });
    M.Body.setAngularVelocity(body, st.av);
    world.add(body);
    const tail = this.scene.add.image(x, y, 'wx_drop').setDepth(DEPTH.hail - 0.5).setOrigin(0.5, 1);
    const img = this.scene.add.image(x, y, 'wx_hail').setDepth(DEPTH.hail).setScale(r / 10.6);
    this._hail.push({ body, img, tail, r, age: 0, hit: false });
  }

  _removeHail(k) {
    const h = this._hail[k];
    const world = this.scene.matter && this.scene.matter.world;
    if (world) world.remove(h.body);
    h.img.destroy();
    h.tail.destroy();
    this._hail.splice(k, 1);
  }

  _collisionStart(event) {
    if (this.destroyed || !this._hail.length) return;
    const pairs = event.pairs;
    for (let k = 0; k < pairs.length; k++) {
      const a = pairs[k].bodyA;
      const b = pairs[k].bodyB;
      const ha = a.label === 'hail';
      const hb = b.label === 'hail';
      if (ha === hb) continue;
      const now = this._time;
      if (now - this._lastHailSfx > 70) {
        this._lastHailSfx = now;
        this._play('hail');
      }
      // first impact of a stone: a few icy sparkles (visual only, no body changes here)
      const stone = ha ? a : b;
      const h = this._hail.find((o) => o.body === stone);
      if (h && !h.hit) {
        h.hit = true;
        if (this.effects && this.effects.sparkle) this.effects.sparkle(stone.position.x, stone.position.y, 3);
      }
    }
  }

  // --- registry -------------------------------------------------------------

  _writeRegistry() {
    const reg = this.scene.registry;
    if (!reg) return;
    let dark = 0;
    for (const k of LVL_KEYS) dark = Math.max(dark, SKY_DARK[k] * this._lvl[k]);
    const r = this._reg;
    if (Math.abs(dark - r.skyDark) > 0.002) {
      r.skyDark = dark;
      reg.set('skyDark', dark);
    }
    const w = this._wind;
    if (!(Math.abs(w - r.wind) < 0.25)) {
      r.wind = w;
      reg.set('wind', w);
    }
    const rb = this._lvl.rainbow;
    if (Math.abs(rb - r.rainbow) > 0.002) {
      r.rainbow = rb;
      reg.set('rainbow', rb);
    }
  }

  // --- teardown -------------------------------------------------------------

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this._world) this._world.off('collisionstart', this._onCollide);
    for (let k = this._hail.length - 1; k >= 0; k--) this._removeHail(k);
    if (this.layer) this.layer.destroy();
    if (this.fxLayer) this.fxLayer.destroy();
    const reg = this.scene.registry;
    if (reg) {
      reg.set('skyDark', 0);
      reg.set('wind', 0);
      reg.set('rainbow', 0);
    }
    this._active = null;
    this._wind = 0;
    this._windMean = 0;
    this._dyn = [];
    this._rain = this._streaks = this._fog = this._heat = this._gloom = this._cloud = this._bolt = null;
  }
}
