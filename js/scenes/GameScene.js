// The core loop: crane, drop, fixed-step Matter physics, landing ratings
// (Perfek snap + combo), lives, settle + cement freeze, rising flood, weather,
// camera follow, landing ghost, wobble, idle attract mode and the game-over reveal.
// Blok vir Blok (1.11, `this.turns`): one tower for two players, a block each in turn. The game whose
// turn it is plays the block; the other game drops the same block from the same spot and, when the
// turn's report comes, puts the tower exactly where the first one says it came to rest. Between drops
// the tower stands still, so both games start every drop from the same tower.
import {
  GAME_W, LAYOUT, PX_PER_M, PHYSICS, CRANE, SCORING, LIVES, FREEZE_DEPTH, WATER, DEPTH, FONT, COACH,
  VISITOR, VISITOR_TYPES, RATING, DUEL, WEATHER_TUNING, STAGES, TURNS,
} from '../config.js';
import { bus } from '../core/bus.js';
import { S, VISITOR_INFO, WEATHER_INFO } from '../core/strings.js';
import { fmtM, fmtMShort } from '../core/format.js';
import { createSequence } from '../core/sequence.js';
import { audio, haptics } from '../audio.js';
import { Block, ensureTexture, getGeometry, releaseNamedTextures } from '../game/blocks.js';
import { createBillboard, BILLBOARD_LEFT } from '../game/billboard.js';
import { createBlockNamer } from '../core/sponsors.js';
import { createTally, tallyShow } from '../core/audience.js';
import { createCoach } from '../core/coach.js';
import { milestoneSaying, MILESTONE_STEP_M } from '../core/sayings.js';
import { localSaying } from '../core/i18n.js';
import { SPONSOR } from '../sponsorConfig.js';
import { Weather } from '../game/weather.js';
import { Crane } from '../game/crane.js';
import { Water } from '../game/water.js';
import { Effects } from '../game/effects.js';
import { createIsland } from '../game/island.js';
import { Visitors } from '../game/visitors.js';
import { topMovable, thiefLoot, visitorFree, gridWithGifts } from '../core/visitorrules.js';
import { duelSeedKey } from '../core/duel.js';
import { FOUNDATION_FREE_M, SLOW_BLOCKS, SLOW_MUL } from '../core/economy.js';

const FIXED = PHYSICS.fixedDtMs;
const MAX_FRAME_MS = 100;
const SETTLE = PHYSICS.settle;
const TOP_HIT_TOL = 18;          // px: falling block bottom this far below a support's top still counts as "on top"
const PENDING = '·';             // grid placeholder until a dropped block's fate is known
const LOST_FALL_VY = 4;          // px/step: a block sinking through the flood (or past the cement) this fast is gone
const KILL_Y = 1500;
const WOBBLE_GRACE_MS = 900;     // after a landing the stack settles before motion counts as wobble
const CREAK_AT = 0.6;            // wobble levels for the creak warning and the small shake
const SHAKE_AT = 0.9;
const SPLASH_VY = 2;             // px/step
const BASE_CX = GAME_W / 2;
const BASE_CY = LAYOUT.baseTopY + LAYOUT.baseHeight / 2;
const BASE_HALF_W = LAYOUT.baseWidth / 2;
const GHOST_FROZEN_SCAN = 12;    // frozen blocks near the top that can still be a landing surface
const GHOST_WIND_STEPS = 240;    // wind forecast horizon for the landing ghost (4 s of fall)
const GHOST_MISS_DROP = 120;     // a ghost for a drop that misses the tower is shown this far below the top, in red
const PREWARM_AHEAD = 2;         // block textures drawn ahead while a block falls (see prewarmTextures)
const FLOOD_TAG_MS = 1000;       // the flood tag's text redraws at most this often (each redraw is a canvas + upload)
const COLLAPSE_MS = 1500;        // tower blocks lost this soon after another loss are the same collapse: one life
const TIP_LEAN = 1.02;           // a block whose load is this far past the middle of its support (1 = the edge) tips
const SET_AFTER_MS = 1500;       // a deep block still stirred by wind sets this long after landing...
const SET_MAX_SPEED = 0.3;       // ...if it moves slower than this (px/step)
const SET_MAX_SPIN = 0.01;       // ...and turns slower than this (rad/step)
const LOCK_MAX_SPEED = 0.35;     // a Perfek sets the blocks under it if they are at rest (px/step)...
const LOCK_MAX_SPIN = 0.006;     // ...(rad/step)
const CEMENT_MAX_SPEED = 3;      // Hanswors's cement: a block moving faster than this (px/step) is on its way down
const GRACE_MOVING_SPEED = 0.6;  // after a visitor's push, a tower block faster than this (px/step) is still settling...
const GRACE_TAIL_MS = 500;       // ...and keeps the grace open until this long after it slows down
const TIPPED = 0.35;             // rad: an odd shape tipped further than this has no top surface to sit flush on
const FOOT_MARGIN = 4;           // px: a snapped block must rest on its support on both sides of its centre
const SKID_SLOW = 0.9;           // rain skid: each step slides this fraction of the step before...
const SKID_EDGE = 8;             // ...and it stops this far before its middle passes the edge below it (px)
const CALM_SPEED = 1.2;          // px/step: the next block waits while a tower block moves faster than this
const PRUNE_KEEP = 12;           // the newest cement blocks always keep their bodies
const MAX_TAP_LAG_MS = 1000 / 24; // taps are released where the block was at that moment, up to this far from the frame
const GHOST_A = 0.5;
const GHOST_EDGE_A = 0.6;
const GHOST_PAD = 8;
const GHOST_MISS_TINT = 0xff6b6b;
const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

// Blok vir Blok
const BOT_AIM_ERROR = 0.32;      // Robot Rikus misses the middle this often (autoplay's aim error)
const BOT_THINK_MS = [900, 2200]; // ...after looking at the swing this long
const BOT_SABOTAGED_ERROR = { fog: 0.85, heat: 0.6, rain: 0.45 };   // ...and this often with a sabotage on his block
/** Wall-clock ms (a turn's aiming time runs on it, so a paused game has used it up when it comes back). */
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const TURN_BACK_MS = 3000;       // back from a pause or another app: at least this long to aim
const TURN_LIVE_MAX_MS = 38000;  // a live turn's aim time never runs past this (the server waits TURNS.serverTurnMs)

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
const OVER_EMIT_MS = 3000;

// Idle attract tower: keep it in the gap above the menu card (when there is room).
const IDLE_TOP_GAP = 70;
const IDLE_BASE_GAP = 10;
const IDLE_MIN_BASE = 600;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round1 = (v) => Math.round(v * 10) / 10;
/** Angle wrapped to (-period/2, period/2]. */
const wrapAngle = (a, period) => a - period * Math.round(a / period);

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
    heatLevel: 0,
    fogAlpha: 0,
    perfectMul: 1,
    blocksLeft: null,
    setBlockIndex() { return null; },
    rainSkid() { return null; },
    force() { return false; },
    beforeStep() {},
    update() {},
    isHail() { return false; },
    destroy() {},
  };
}

/** Stand-in for Visitors if they fail to start (or break): nobody comes, the tower carries on. */
function noVisitors(records = []) {
  return {
    active: null,
    log: () => records,
    setBlockIndex() {},
    force() {},
    spawn: () => false,
    reward: () => false,
    step() {},
    update() {},
    tap: () => false,
    attack: () => false,
    landed() {},
    freeLoss() {},
    end() {},
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
  c = { x: (x0 + x1) / 2 - geom.cx, y: minY - geom.cy, span: x1 - x0 };
  topCache.set(geom, c);
  return c;
}

/** x-ranges (relative to the centroid) of the parts a shape stands on: an arch stands on two legs, a T on its foot. */
const footCache = new WeakMap();
function footSpans(geom) {
  let f = footCache.get(geom);
  if (f) return f;
  f = [];
  if (geom.poly) {
    let maxY = -Infinity;
    for (const p of geom.poly) maxY = Math.max(maxY, p.y);
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const p of geom.poly) {
      if (maxY - p.y < 0.5) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
      }
    }
    f.push([x0 - geom.cx, x1 - geom.cx]);
  } else {
    const parts = geom.parts && geom.parts.length ? geom.parts : [{ x: 0, y: 0, w: geom.w, h: geom.h }];
    for (const r of parts) if (geom.h - (r.y + r.h) < 0.5) f.push([r.x - geom.cx, r.x + r.w - geom.cx]);
  }
  footCache.set(geom, f);
  return f;
}

/**
 * Would `geom`, centred (by its centroid) on a support face `face` px wide, actually
 * rest on it? Its feet must touch the face on both sides of its centre of mass.
 * (An arch dropped dead centre on the single top cell of an L would straddle it.)
 */
function restsOn(geom, face) {
  const h = face / 2;
  let lo = Infinity;
  let hi = -Infinity;
  for (const [a, b] of footSpans(geom)) {
    const l = Math.max(a, -h);
    const r = Math.min(b, h);
    if (r - l > 2) {
      lo = Math.min(lo, l);
      hi = Math.max(hi, r);
    }
  }
  return lo <= -FOOT_MARGIN && hi >= FOOT_MARGIN;
}

/** A single rectangle (plank, slab, brick, crate, cube, pillar): any side can be the top. */
const isRect = (geom) => !geom.poly && (!geom.parts || geom.parts.length === 1);

/**
 * Width that carries a load placed on the shape (sets how forgiving Perfek/Goed are):
 * the top face, except a T, which stands on its narrow foot.
 */
function loadWidth(geom) {
  if (geom.shape === 'T' && geom.parts) {
    let w = Infinity;
    for (const r of geom.parts) w = Math.min(w, r.w);
    return w;
  }
  return topCenterLocal(geom).span;
}

/** Dotted guide line texture (drawn once; cropped to length per frame). */
function ensureAimTexture(scene) {
  if (scene.textures.exists('aim_dots')) return;
  const h = 1600;
  const tex = scene.textures.createCanvas('aim_dots', 6, h);
  if (!tex) return;
  const ctx = tex.getContext();
  for (let y = 0; y < h; y += 18) {
    ctx.fillStyle = 'rgba(29,43,69,0.55)';
    ctx.beginPath();
    ctx.arc(3, y + 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(3, y + 4, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.refresh();
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
    this.mode = d.mode === 'daily' || d.mode === 'practice' || d.mode === 'duel' ? d.mode : 'idle';
    this.idle = this.mode === 'idle';
    this.ambQ = -1;
    this.seed = String(d.seed ?? `idle-${Math.floor(Math.random() * 1e9)}`);
    this.dayNumber = Number.isFinite(d.dayNumber) ? d.dayNumber : null;
    this.dateKey = typeof d.dateKey === 'string' ? d.dateKey : null;
    this.settings = { sound: true, vibration: true, reducedMotion: false, ...(d.settings || {}) };
    this.reducedMotion = !!this.settings.reducedMotion;
    this.autoplay = this.idle ? 0 : clamp(Number(d.autoplay) || 0, 0, 1);
    this.autoOn = this.idle || this.autoplay > 0;
    // First-ever game: short HUD hints at the real moments (text only; see js/core/coach.js).
    this.coach = createCoach(!this.idle && d.coach === true);
    // Sponsors (js/sponsorsFeed.js): names for the blocks, the day's premium sponsor for the billboard.
    this.sponsorBlock = Array.isArray(d.sponsors?.block) ? d.sponsors.block : [];
    this.billboardData = { premium: d.billboard?.premium || null, salesOn: !!d.billboard?.salesOn };
    // A friend's challenge (daily only, already validated in js/core/challenge.js): the height to beat, in metres.
    this.challengeM = this.mode === 'daily' && Number.isFinite(d.challenge) && d.challenge > 0 && d.challenge <= 2000 ? d.challenge : 0;
    this.challengeWon = false;
    // Uitdagersreeks (js/duel.js runs the match; the scene reports its height and takes attacks)
    this.duel = this.mode === 'duel' ? {
      name: typeof d.duel?.name === 'string' ? d.duel.name : '',
      youName: typeof d.duel?.youName === 'string' ? d.duel.youName : '',
      mode: d.duel?.mode === 'turns' ? 'turns' : 'race',
    } : null;
    // Blok vir Blok: whose turn is told by js/duel.js ('turns:turn'); `you` is this player's seat, `bot`
    // that the other seat is Robot Rikus (this game plays his blocks)
    this.turns = this.duel?.mode === 'turns'
      ? {
        you: d.duel.you === 1 ? 1 : 0, bot: d.duel.bot === true, names: ['', ''], hearts: [TURNS.hearts, TURNS.hearts], streaks: [0, 0], cur: null,
        myAuto: this.autoplay,   // (tests: ?auto= plays this player's turns too)
        hud: { n: 0, seat: 0, you: 0, mine: false, names: ['', ''], hearts: [0, 0], streaks: [0, 0], left: null, phase: 'wait' },
      }
      : null;
    // Debug only (?debug=1&visitor=thief, see main.js): this visitor comes as soon as there is a tower.
    this.debug = d.debug === true;
    this.forceVisitor = this.debug && !this.idle && VISITOR_TYPES.includes(d.visitor) ? d.visitor : null;
    this.resetRunState();
  }

  /** Everything that belongs to one tower (also used by the idle loop's soft reset). */
  resetRunState() {
    this.i = 0;
    this.curSpec = null;
    this.curGeom = null;
    this.curName = null;
    this.curNameId = null;
    this.tally = createTally();   // names shown on dropped blocks, per sponsor (sent once at game end)
    this.curKey = null;
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
    this.nextMilestoneM = MILESTONE_STEP_M;   // the next height (m) that earns a saying toast
    this.score = 0;
    this.lives = LIVES;
    this.slowLeft = 0;              // power-up: drops the crane still swings slower for (counted at each drop)
    this.shieldOn = false;          // power-up: the next monkey or thief bounces off
    this.freeFoundationOffered = false;   // the daily's free Fondamentblok (from FOUNDATION_FREE_M)
    this.combo = 0;
    this.maxCombo = 0;
    this.perfects = 0;
    this.blocksDropped = 0;
    this.landedCount = 0;
    this.heartPerfects = 0;    // Perfeks towards the next heart (only counted while a heart is missing)
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
    this.lean = 0;
    this.lastCreak = -1e9;
    this.lastLandAt = -1e9;
    this.lastWobbleShake = -1e9;
    this.lastWarn = -1e9;
    this.collapseUntil = -1e9;
    this.lastTowerLossAt = -1e9;
    this.spawnDue = null;      // sim time the next block may appear (waits for a calm tower after a collapse)
    this.calmCap = 0;
    this.stepTimers = [];
    this.eases = [];
    this.risingShown = false;
    this.dangerShown = false;
    this.lastFrictionMul = 1;
    this.autoOffset = 0;
    this.autoPrevD = NaN;
    this.autoReadyAt = 0;
    this.idleResetting = false;
    this.hintPending = !this.idle;
    this.hideIdx = 0;
    this.progressHeight = 0;
    this.gifts = [];                 // per clown gift: how many blocks had been dropped when it joined the tower
    this.visitorGraceUntil = -1e9;   // sim ms: tower blocks lost before this are a visitor's doing (no heart)
    this.visitorGraceStart = -1e9;   // sim ms: when that visitor's push came
    this.visitorBlame = null;        // ...which visitor
    this.graceToast = false;         // the "not your fault" toast was shown for this push
    this.turnHold = false;           // Blok vir Blok: the tower stands still between drops
    this.tipTick = 0;                // physics steps, for wakeTipping (every 4th)
    this.leanNow = 0;                // the tower's lean as wakeTipping last measured it
    if (this.tipping) this.tipping.clear();
    this.turnCraneMs = 0;            // ...and how far this turn's crane has swung
  }

  create() {
    const M = Phaser.Physics.Matter.Matter;
    this.M = M;
    this.W = this.scale.width;
    this.H = this.scale.height;
    // Notches push the HUD down; the crane and the drop line move with it so every
    // device keeps exactly the same drop height (fair daily).
    this.st = this.idle ? 0 : Math.max(0, Math.round(Number(this.registry.get('safeTop')) || 0));
    this.dropLineY = LAYOUT.dropLineY + this.st;
    this.now = 0;              // simulated ms (advances with the fixed physics step)
    this.acc = 0;
    this.skipFrame = true;
    this.frameTime = 0;        // rAF time of the last frame (taps between frames are extrapolated from it)
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

    // Practice seeds live in their own namespace: no practice run can replay a daily.
    // Practice and match seeds live in their own namespaces: no practice run or match can replay a daily.
    const seqSeed = this.mode === 'practice' ? `oefen/${this.seed}` : this.mode === 'duel' ? duelSeedKey(this.seed) : this.seed;
    this.sequence = createSequence(seqSeed);
    this.namer = this.makeNamer();

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
    this.billboard = null;
    safely(() => { this.billboard = createBillboard(this, this.billboardData); });
    this.water = new Water(this, { width: GAME_W });
    this.crane = new Crane(this, { top: this.st });
    this.effects = new Effects(this, { reducedMotion: this.reducedMotion });
    this.weather = this.idle ? calmWeather() : this.buildWeather();
    this.visitors = this.buildVisitors();
    if (this.forceVisitor) this.visitors.force(this.forceVisitor);

    // Landing ghost: white silhouette with a navy rim so it reads against a pale sky,
    // a dotted line from the hanging block to it, and (until the first drop) a label.
    this.ghostEdge = this.add.image(0, 0, '__WHITE').setDepth(DEPTH.ghost - 0.1).setAlpha(GHOST_EDGE_A).setVisible(false);
    this.ghost = this.add.image(0, 0, '__WHITE').setDepth(DEPTH.ghost).setAlpha(GHOST_A).setVisible(false);
    this.ghostMiss = false;
    ensureAimTexture(this);
    this.aimLine = this.add.image(0, 0, 'aim_dots').setOrigin(0.5, 0).setDepth(DEPTH.ghost - 0.2)
      .setAlpha(0.32).setVisible(false);
    this.ghostLabel = null;
    if (!this.idle) {
      this.ghostLabel = this.add.text(0, 0, `↓ ${S.ghostHint}`, {
        fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#1d2b45', strokeThickness: 6, resolution: 1,
      }).setOrigin(0.5, 1).setDepth(DEPTH.ghost + 0.5).setVisible(false);
    }

    // Distance tag on the flood line itself, so the line and the HUD pill read as one thing.
    this.floodTag = null;
    this.floodTagStr = '';
    this.floodTagAt = -1e9;
    this.floodIcon = null;
    if (!this.idle) {
      const style = { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffffff', stroke: '#0f3f73', strokeThickness: 6, resolution: 1 };
      this.floodTag = this.add.text(GAME_W - 18, 0, '', style).setOrigin(1, 1).setDepth(DEPTH.water + 1).setVisible(false);
      // the 🌊 is drawn once, apart from the number: redrawing an emoji with every new number was slow
      this.floodIcon = this.add.text(0, 0, '🌊', style).setOrigin(1, 1).setDepth(DEPTH.water + 1).setVisible(false);
    }

    // Friend challenge: one thin line across the world at the height to beat, with a flag label (cheap, world space).
    this.challengeLine = null;
    this.challengeTag = null;
    if (this.duel && !this.turns) this.buildGoalLine();
    if (this.challengeM > 0) {
      const cy = LAYOUT.baseTopY - this.challengeM * PX_PER_M;
      this.challengeLine = this.add.image(GAME_W / 2, cy, '__WHITE').setDisplaySize(GAME_W, 5)
        .setTintFill(0xff5a5f).setAlpha(0.85).setDepth(DEPTH.fxWorld + 1);
      this.challengeTag = this.add.text(GAME_W - 14, cy - 5, `🚩 ${S.challengeLine(fmtM(this.challengeM))}`, {
        fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#a3262c', strokeThickness: 6, resolution: 1,
      }).setOrigin(1, 1).setDepth(DEPTH.fxWorld + 2);
    }

    const cam = this.cameras.main;
    cam.setZoom(1).setRotation(0).setScroll(0, LAYOUT.baseTopY - this.dropLineY);

    // Reused per-step / per-frame context objects (no allocations in the hot loop).
    this.stepCtx = { dynamicBlocks: this.dyn, falling: null, towerTopY: LAYOUT.baseTopY };
    this.wctx = { topBlock: null, towerTopY: 0, camera: cam, W: this.W, H: this.H, craneTop: this.st };
    this.craneOpts = { omega: CRANE.omega0, amplitude: CRANE.amplitudeStart, windAccel: 0 };
    this.hudWeather = { type: null, blocksLeft: null };
    this.hudState = {
      heightM: 0, score: 0, lives: LIVES, maxLives: LIVES, combo: 0, next: null, weather: null,
      waterDistM: null, wobble: 0, mode: this.mode, dayNumber: this.dayNumber, heartProgress: 0,
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
      // Uitdagersreeks: the other player sent a visitor / the match was decided
      bus.on('duel:attack', (a) => {
        if (!this.duel || this.over) return;
        const from = a?.from || this.duel.name;
        // Mis and Hittegolf come as weather for a few blocks; Blouaap and Skelm Sakkie as visitors
        if (a?.kind === 'fog' || a?.kind === 'heat') {
          try {
            this.weather.force(a.kind, DUEL.weatherAttackBlocks, S.duelAttackIn(from, WEATHER_INFO[a.kind].name));
          } catch (err) {
            this.weatherFailed(err);
          }
          return;
        }
        try {
          this.visitors.attack(a?.kind, from, a?.style);
        } catch (err) {
          this.visitorsFailed(err);
        }
      }),
      bus.on('duel:end', (e) => {
        if (this.duel) this.endGame(e?.outcome === 'won' ? 'won' : 'lost');
      }),
      // Blok vir Blok (js/duel.js): a new turn, the other player's drop and their turn's report
      bus.on('turns:turn', (t) => this.onTurn(t)),
      bus.on('turns:drop', (d) => this.onRemoteDrop(d)),
      bus.on('turns:settled', (d) => this.onRemoteSettled(d)),
      bus.on('weather:rainbow', () => this.onRainbow()),
      bus.on('hud:ready', () => this.onHudReady()),
    );
    this.game.events.on('visible', this.resetClock, this);
    this.events.on('resume', this.resetClock, this);
    // Blok vir Blok: the time to aim waits while the game is paused or out of sight
    this.game.events.on('hidden', this.markAway, this);
    this.events.on('pause', this.markAway, this);
    this.events.once('shutdown', this.cleanup, this);

    const reg = this.registry;
    reg.set('dropOffset', this.st);
    if (this.idle) {
      reg.set('skyDark', 0);
      reg.set('wind', 0);
      reg.set('rainbow', 0);
    }
    this.writeRegistry();

    if (!this.idle) this.scene.launch('Hud');

    this.prewarmTextures(0, PREWARM_AHEAD + 2);   // the first blocks, while the screen changes anyway
    if (this.turns) {
      this.hintPending = false;
      this.turnHold = true;
    } else {
      this.spawnBlock(0);
    }
    if (this.hintPending) bus.emit('hud:hint', { text: this.hintText() });

    if (typeof window !== 'undefined') {
      window.__stapel = window.__stapel || {};
      window.__stapel.scene = this;
    }
    // Blok vir Blok: ready for the first turn (js/duel.js sends it now, and whatever came meanwhile)
    if (this.turns) bus.emit('turns:ready');
  }

  buildWeather() {
    try {
      // Blok vir Blok has no weather of its own: only a sabotage (weather.force) on one player's block
      const seq = this.turns ? { seed: this.sequence.seed ?? this.seed, eventAt: () => null } : this.sequence;
      return new Weather(this, seq, {
        effects: this.effects, audio, haptics, bus, reducedMotion: this.reducedMotion,
      });
    } catch (err) {
      console.error('[Game] weather failed to start', err);
      return calmWeather();
    }
  }

  buildVisitors() {
    try {
      return new Visitors(this, this.sequence, {
        audio, bus, attract: this.idle, scheduled: !this.duel, reducedMotion: this.reducedMotion, actions: this.visitorActions(),
      });
    } catch (err) {
      console.error('[Game] visitors failed to start', err);
      return noVisitors();
    }
  }

  /** What a visitor can do to the game (js/game/visitors.js decides when, on the physics clock). */
  visitorActions() {
    return {
      top: () => this.visitorTop(),
      busy: () => !!this.falling || this.eases.length > 0,
      shove: (plan, dir) => this.visitorShove(plan, dir),
      giftAt: (spec) => this.giftPose(spec, this.topBlock),
      gift: (spec) => this.visitorGift(spec),
      found: (gifts) => this.visitorFoundation(gifts),
      steal: (max) => this.visitorSteal(max),
      // power-up: the next monkey or thief bounces off. shield(false) only asks; the shield is used up
      // when he really bounces (caught or scared off before that, and it waits for the next one)
      shield: (use = true) => {
        if (!this.shieldOn || this.over) return false;
        if (use) {
          this.shieldOn = false;
          this.emitPowerups();
        }
        return true;
      },
      // first game: the first visitor of each kind explains itself (shown in its arrival banner)
      coach: (type) => {
        const h = this.over ? null : this.coach.visitor(type);
        return h ? h.text : null;
      },
      toast: (text, color) => {
        if (!this.over) bus.emit('hud:toast', { text, color, visitor: true });
      },
    };
  }

  /** A broken visitor must never stop the tower either: log once and carry on without them. */
  visitorsFailed(err) {
    console.error('[Game] visitor error', err);
    let records = [];
    safely(() => { records = this.visitors.log(); });
    safely(() => this.visitors.destroy());
    this.visitors = noVisitors(records);
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
    this.stepTimers.length = 0;
    this.eases.length = 0;
    this.spawnDue = null;
    this.game.events.off('visible', this.resetClock, this);
    this.events.off('resume', this.resetClock, this);
    this.game.events.off('hidden', this.markAway, this);
    this.events.off('pause', this.markAway, this);
    this.input.off('pointerdown', this.onPointerDown, this);
    if (this.input.keyboard) {
      this.input.keyboard.off('keydown-SPACE', this.onKeyDrop, this);
      this.input.keyboard.off('keydown-ENTER', this.onKeyDrop, this);
    }
    // The Matter world and the display list are already torn down by their plugins
    // (they listen for 'shutdown' first); module destroy() calls only drop references.
    safely(() => this.weather.destroy());
    safely(() => this.visitors.destroy());
    safely(() => this.crane.destroy());
    safely(() => this.water.destroy());
    safely(() => this.effects.destroy());
    safely(() => this.island.destroy());
    if (this.billboard) safely(() => this.billboard.destroy());
    for (const b of this.active) safely(() => b.destroy());
    for (const b of this.tower) safely(() => b.destroy());
    for (const b of this.frozen) safely(() => b.destroy());
    // sponsor-name textures of this tower are no longer needed (keeps the cache bounded)
    safely(() => releaseNamedTextures(this.textures));
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
    this.frameTime = 0;
    // Blok vir Blok: this player's time to aim moves on by the time away (against Robot Rikus all of
    // it; live at most until TURN_LIVE_MAX_MS after the turn began, well within the server's patience),
    // and is never less than TURN_BACK_MS on coming back
    const c = this.turns?.cur;
    if (c && this.awayAt && c.mine && !c.dropped) {
      const now = nowMs();
      let deadline = c.deadline + (now - this.awayAt);
      if (!this.turns.bot) deadline = Math.min(deadline, c.startedWall + TURN_LIVE_MAX_MS);
      c.deadline = Math.max(deadline, Math.min(now + TURN_BACK_MS, this.turns.bot ? Infinity : c.startedWall + TURN_LIVE_MAX_MS));
    }
    this.awayAt = 0;
  }

  /** The game was paused or hidden (resetClock moves the aim time on when it comes back). */
  markAway() {
    if (!this.awayAt) this.awayAt = nowMs();
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
  onPointerDown(pointer) {
    if (pointer && this.tapVisitor(pointer)) return;
    this.tryDrop(false, this.tapLag(pointer && pointer.event));
  }

  /** A tap on a visitor shoos or catches it (or makes the clown honk) and does not drop the block. */
  tapVisitor(pointer) {
    if (this.over || this.inputLocked || !this.visitors.active) return false;
    const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    let hit = false;
    try {
      hit = this.visitors.tap(p.x, p.y);
    } catch (err) {
      this.visitorsFailed(err);
    }
    if (hit) haptics.tap();
    return hit;
  }

  onKeyDrop(e) {
    if (e && e.repeat) return;
    this.tryDrop(false, this.tapLag(e));
  }

  /** ms between the last rendered frame and the input event (DOM events run between frames). */
  tapLag(ev) {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    let t = ev && Number.isFinite(ev.timeStamp) ? ev.timeStamp : now;
    if (Math.abs(t - now) > 1000) t = now;   // an engine with epoch-based event timestamps
    if (!this.frameTime) return 0;
    return clamp(t - this.frameTime, -MAX_TAP_LAG_MS, MAX_TAP_LAG_MS);
  }

  onHudReady() {
    if (this.hintPending && !this.over) bus.emit('hud:hint', { text: this.hintText() });
  }

  hintText() {
    const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
    return this.coach.tap(fine);
  }

  /** A first-game coach hint for the HUD (null = nothing to say). Never pauses or changes the game. */
  coachSay(h, delayMs = 0) {
    if (!h || this.over || this.idle) return;
    bus.emit('hud:coach', { id: h.id, text: h.text, ms: COACH.holdMs, delay: delayMs });
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
    if (!this.idle) this.emitPowerups();
    // a new stage begins with this block: say so (no weather or visitor starts on this block; Blok vir
    // Blok has neither)
    if (!this.idle && !this.turns) {
      const k = STAGES.findIndex((st) => st.from === i);
      if (k > 0) {
        bus.emit('hud:banner', { emoji: STAGES[k].emoji, title: S.stageTitle(k), subtitle: S.stageSub(k), kind: 'stage' });
        audio.play('banner');
      }
    }
    safely(() => this.weather.setBlockIndex(i));
    try {
      this.visitors.setBlockIndex(i);
    } catch (err) {
      this.visitorsFailed(err);
    }
    // a sponsor's name is printed on the block (same texture on the crane, falling and in the
    // tower); the ghost below tints it into a plain silhouette
    this.curName = this.nameFor(spec);
    this.curNameId = this.curName ? (this.namer?.idAt?.(spec.i) ?? null) : null;
    const key = ensureTexture(this, spec, this.curName);
    this.curKey = key;
    this.crane.setBlock(spec, key, this.curGeom);
    this.nextSpec = this.sequence.block(i + 1);
    ensureTexture(this, this.nextSpec, this.nameFor(this.nextSpec));
    const geo = this.curGeom;
    this.ghostMiss = false;
    this.ghost.setTexture(key).setOrigin(geo.originX, geo.originY).setTintFill(0xffffff).setAlpha(GHOST_A);
    this.ghostEdge.setTexture(key).setOrigin(geo.originX, geo.originY).setTintFill(0x1d2b45)
      .setScale((geo.w + GHOST_PAD) / geo.w, (geo.h + GHOST_PAD) / geo.h);
    this.planAutoplay();
  }

  /** Deterministic sponsor names for this tower's blocks (same seed and order as the block sequence). */
  makeNamer() {
    if (!this.sponsorBlock.length) return null;
    const seq = this.sequence;
    try {
      return createBlockNamer(this.sponsorBlock, seq.seed ?? this.seed, (i) => seq.block(i), SPONSOR.blockShare);
    } catch {
      return null;
    }
  }

  /** The sponsor name for a block spec, or null (cubes, long names on pillars, no sponsors). */
  /**
   * Draws the textures of the coming blocks ahead of time. A new shape or colour (or sponsor name)
   * costs a canvas drawing and an upload; done in the frame where the block arrives on the crane,
   * that hitch showed as the landing ghost stuttering just as the player starts to aim. So it is
   * done while a block falls instead (nobody aims then). Textures only: nothing in the game changes.
   */
  prewarmTextures(from, count = PREWARM_AHEAD) {
    if (!this.sequence || this.over) return;
    for (let k = Math.max(0, from); k < from + count; k++) {
      try {
        const spec = this.sequence.block(k);
        ensureTexture(this, spec, this.nameFor(spec));
      } catch {
        // drawing ahead is only an optimisation
      }
    }
  }

  nameFor(spec) {
    if (!this.namer || !spec) return null;
    try {
      return this.namer(spec) || null;
    } catch {
      return null;
    }
  }

  /**
   * A newer sponsor feed arrived. Only the menu's attract tower picks it up live:
   * a real game keeps the names and board it started with.
   */
  setSponsors(feed, billboard) {
    if (!this.idle || !this.sys.isActive()) return;
    this.sponsorBlock = Array.isArray(feed?.block) ? feed.block : [];
    this.namer = this.makeNamer();
    this.billboardData = { premium: billboard?.premium || null, salesOn: !!billboard?.salesOn };
    if (this.billboard) safely(() => this.billboard.destroy());
    this.billboard = null;
    safely(() => { this.billboard = createBillboard(this, this.billboardData); });
  }

  /** Trolley swing for block i: a gentle first swing that widens to the full amplitude. */
  amplitudeFor(i) {
    return Math.min(CRANE.amplitude, CRANE.amplitudeStart + CRANE.amplitudePerBlock * i);
  }

  tryDrop(fromAuto = false, lagMs = 0) {
    if (this.over || this.inputLocked || this.idleResetting) return false;
    if (this.idle && !fromAuto) return false;
    if (!this.crane.hasBlock() || !this.curSpec) return false;
    if (!this.sys.isActive()) return false;
    // Blok vir Blok: only on this player's turn (and Robot Rikus's, by autoplay), once
    const turn = this.turns?.cur;
    if (this.turns && (!turn || turn.dropped || (!turn.mine && !(turn.botTurn && fromAuto)))) return false;

    const pose = this.crane.release(lagMs);
    const cam = this.cameras.main;
    // The block was released at the tap; the physics clock (which runs `acc` behind the
    // last frame) next steps from an earlier instant. Start it from the ballistic state at
    // that instant, so its fall (and the wind on it) is the same at every refresh rate.
    const d = clamp((this.acc + lagMs) / 1000, -0.1, 0.1);
    const g = 1000 * PHYSICS.gravityY;
    const vx = pose.vx * CRANE.carry;
    const vy = pose.vy * CRANE.carry;
    const p = [pose.x - vx * d, pose.y + cam.scrollY - vy * d + 0.5 * g * d * d, pose.angle, vx, vy - g * d];
    if (turn) {
      turn.dropped = true;
      turn.dropAt = this.now;
      this.turnHold = false;
      // the other game drops the same block from the same spot (its crane shows the swing up to here)
      if (turn.mine) bus.emit('turns:mydrop', { n: turn.n, p, ct: this.turnCraneMs + Math.max(0, lagMs) });
    }
    this.launchBlock(p);
    return true;
  }

  /**
   * The hanging block is let go: [x, y, angle, vx, vy] (world px, px/s) is its state at the first physics
   * step. A tap (tryDrop), or in Blok vir Blok the other player's tap, passed on exactly (onRemoteDrop).
   */
  launchBlock([x, y, angle, vx, vy]) {
    const block = new Block(this, this.curSpec, x, y, angle, this.curName);
    block.special = this.curSpec.foundation ? 'foundation' : null;
    block.setVelocityPxS(vx, vy);
    block.setFriction(this.weather.frictionMul);
    block.state = 'falling';
    block.droppedAt = this.now;
    block.landedAt = 0;
    block.advanced = false;
    block.lostMarked = false;
    block.splashed = false;
    block.pendingRate = false;
    block.waitTimer = this.stepDelay(CRANE.maxWaitMs, () => this.advance(block));

    this.falling = block;
    this.stepCtx.falling = block;
    this.active.push(block);
    this.blocksDropped++;
    if (!this.idle) bus.emit('game:dropped', { n: this.blocksDropped });   // (the lesson, main.js)
    // the Stadige hyskraan counts drops, so it is always SLOW_BLOCKS slow blocks, whenever it was switched on
    if (this.slowLeft > 0) this.slowLeft--;
    // while this block falls, draw the textures of the blocks after the next one (the next one's exists)
    const dropped = this.i;
    this.time.delayedCall(80, () => this.prewarmTextures(dropped + 2));
    // audience count: a name that was really on a block the player let go of (js/core/audience.js)
    if (!this.idle && this.curNameId) tallyShow(this.tally, this.curNameId);
    this.setGhostVisible(false);

    if (!this.idle) {
      this.grid[block.index] = PENDING;
      this.gridBlocks[block.index] = block;
      audio.play('drop');
      haptics.tap();
      if (!this.started) {
        this.started = true;
        this.hintPending = false;
        if (this.ghostLabel) this.ghostLabel.setVisible(false);
        bus.emit('hud:hint', { text: null });
        bus.emit('game:started', this.buildResult('quit'));
      }
    }
    return block;
  }

  /** Schedules the next block exactly once per dropped block. */
  advance(block) {
    if (block.advanced) return;
    block.advanced = true;
    this.cancelStep(block.waitTimer);
    block.waitTimer = null;
    if (this.over) return;
    if (this.idle && this.blocksDropped >= IDLE_BLOCKS) {
      this.stepDelay(IDLE_RESET_DELAY_MS, () => this.idleReset());
      return;
    }
    this.spawnDue = this.now + CRANE.respawnDelayMs;
    this.calmCap = this.spawnDue + CRANE.calmWaitMaxMs;
  }

  /** After a collapse the crane waits until the tower has stopped moving (the player reads it first). */
  towerCalm() {
    const dyn = this.dyn;
    for (let k = 0; k < dyn.length; k++) {
      const b = dyn[k];
      if (b.body.speed > CALM_SPEED && this.now - b.landedAt > 250) return false;
    }
    return true;
  }

  /** Timers on the simulated clock (fixed physics steps): same timing at every refresh rate. */
  stepDelay(ms, fn) {
    const t = { at: this.now + ms, fn };
    this.stepTimers.push(t);
    return t;
  }

  cancelStep(t) {
    if (!t) return;
    const k = this.stepTimers.indexOf(t);
    if (k >= 0) this.stepTimers.splice(k, 1);
  }

  runStepTimers() {
    const list = this.stepTimers;
    for (let k = 0; k < list.length; k++) {
      const t = list[k];
      if (this.now >= t.at) {
        list.splice(k, 1);
        k--;
        t.fn();
      }
    }
    if (this.spawnDue !== null && this.now >= this.spawnDue && !this.over) {
      if (this.turns) {
        // Blok vir Blok: the turn ends once the tower is at rest (the next block comes with the next turn)
        this.spawnDue = null;
        this.turnSettled();
      } else if (this.now >= this.calmCap || this.towerCalm()) {
        this.spawnDue = null;
        this.spawnBlock(this.i + 1);
      }
    }
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
    this.frameTime = time;
    if (this.over) this.updateSlowMo(dt);

    // 1. Crane (the swing widens over the first blocks; the crane eases it so the trolley never jumps)
    const w = this.weather;
    const opts = this.craneOpts;
    opts.omega = Math.min(CRANE.omegaTop, Math.min(CRANE.omegaMax, CRANE.omega0 + CRANE.omegaPerBlock * this.i) * w.craneSpeedMul)
      * (this.slowLeft > 0 ? SLOW_MUL : 1);
    opts.amplitude = this.amplitudeFor(this.i);
    opts.windAccel = w.windAccel;
    opts.heat = w.heatLevel;
    this.crane.update(dt, opts);
    if (this.turns) this.turnClock(dt);

    // 2. Fixed-step physics; everything that can change the outcome runs per step
    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED && steps < PHYSICS.maxStepsPerFrame) {
      this.acc -= FIXED;
      steps++;
      this.physicsStep();
    }
    if (steps >= PHYSICS.maxStepsPerFrame && this.acc > FIXED) this.acc = FIXED;

    // 3. Visuals that read the new physics state
    this.syncBlocks();
    this.water.update(dt);
    if (this.billboard) this.billboard.float(this.water.displayY, this.now);
    const wc = this.wctx;
    wc.topBlock = this.topBlock;
    wc.towerTopY = this.towerTopY;
    try {
      this.weather.update(dt, wc);
    } catch (err) {
      this.weatherFailed(err);
    }
    this.updateCamera(dtS);
    try {
      this.visitors.update();
    } catch (err) {
      this.visitorsFailed(err);
    }
    this.updateFloodTag(time);
    this.updateGhostAndAutoplay();
    this.updateWobble(dtS);
    this.emitHud();
    if (this.duel && !this.turns && !this.over) this.emitDuel();
    this.writeRegistry();
  }

  /** Uitdagersreeks: the finish line at 50 m (world space, like the friend's challenge line). */
  buildGoalLine() {
    const y = LAYOUT.baseTopY - DUEL.goalM * PX_PER_M;
    this.goalLine = this.add.image(GAME_W / 2, y, '__WHITE').setDisplaySize(GAME_W, 6)
      .setTintFill(0xffd23f).setAlpha(0.9).setDepth(DEPTH.fxWorld + 1);
    // tag left of the HUD's race track (and clear of the pause button when the line is near the top)
    this.goalTag = this.add.text(GAME_W - 46, y - 6, `🏁 ${fmtMShort(DUEL.goalM)}`, {
      fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#8a5a00', strokeThickness: 6, resolution: 1,
    }).setOrigin(1, 1).setDepth(DEPTH.fxWorld + 2);
  }

  /** Uitdagersreeks: this tower's height for js/duel.js, every frame (sim ms, tower top and best height in m). */
  emitDuel() {
    const s = this.duelSelf || (this.duelSelf = { t: 0, h: 0, best: 0 });
    s.t = this.now;
    s.h = Math.max(0, LAYOUT.baseTopY - this.towerTopY) / PX_PER_M;
    s.best = this.maxHeightM;
    s.lives = this.lives;   // (the other player sees your hearts, 1.11)
    bus.emit('duel:self', s);
  }

  // -------------------------------------------------------------------------
  // Blok vir Blok (1.11): one tower, a block each in turn
  // -------------------------------------------------------------------------
  /** A turn begins (js/duel.js): its block on the crane with a fresh swing, whose it is, a sabotage on it. */
  onTurn(t) {
    const T = this.turns;
    if (!T || this.over || !t || !Number.isInteger(t.n) || t.n < 1) return;
    if (T.cur && t.n <= T.cur.n) return;
    // the last turn ended without its report reaching this game: the tower stays as it is here
    if (T.cur && !T.cur.ended) this.closeTurn();
    if (Array.isArray(t.names)) T.names = t.names;
    T.hearts = [...t.hearts];
    T.streaks = [...(t.streaks || [0, 0])];
    const seat = t.seat;
    const mine = seat === T.you;
    const botTurn = T.bot && !mine;
    T.cur = {
      n: t.n, seat, mine, botTurn, dropped: false, ended: false, dropAt: 0,
      startedWall: nowMs(), deadline: nowMs() + TURNS.turnMs, livesAt: t.hearts[seat], lost: [],
    };
    this.awayAt = 0;
    // a new turn is its own collapse (the last one's can't cost this player)
    this.collapseUntil = -1e9;
    this.lastTowerLossAt = -1e9;
    // the game's own heart rules count for this turn's player
    this.lives = t.hearts[seat];
    this.combo = T.streaks[seat];
    this.turnHold = true;
    this.spawnDue = null;
    this.turnCraneMs = 0;
    // who aims: this player, Robot Rikus (autoplay, after a look at the swing; a sabotage on his block
    // throws him off, as it would a player), or the other game
    this.autoplay = botTurn ? (t.sab ? BOT_SABOTAGED_ERROR[t.sab] ?? BOT_AIM_ERROR : BOT_AIM_ERROR) : T.myAuto;
    this.autoOn = botTurn || (mine && T.myAuto > 0);
    if (this.crane.hasBlock()) this.crane.release(0);
    this.spawnBlock(t.n - 1);
    this.crane.resetSwing(this.amplitudeFor(t.n - 1));
    if (botTurn) this.autoReadyAt = this.now + BOT_THINK_MS[0] + Math.random() * (BOT_THINK_MS[1] - BOT_THINK_MS[0]);
    // a sabotage rides on this block (both games show it)
    const sab = t.sab && WEATHER_INFO[t.sab] ? t.sab : null;
    if (sab) {
      const info = WEATHER_INFO[sab];
      const title = mine ? S.duelAttackIn(T.names[1 - seat] || this.duel.name, info.name) : S.duelAttackOut(info.name, T.names[seat] || this.duel.name, info.emoji);
      safely(() => this.weather.force(sab, 1, title));
    }
    if (mine) {
      audio.play('banner');
      haptics.tap();
    }
  }

  /** Per frame: the turn's crane time (the other game replays the swing to it) and this player's time to aim. */
  turnClock(dt) {
    const c = this.turns.cur;
    if (!c || c.dropped || this.over) return;
    this.turnCraneMs += dt;
    // time's up: the block drops where it is
    if (c.mine && nowMs() >= c.deadline && this.crane.hasBlock()) this.tryDrop(true);
  }

  /** The other player let their block go: the same block falls from the same spot here. */
  onRemoteDrop(d) {
    const c = this.turns?.cur;
    if (!c || c.mine || c.botTurn || c.dropped || c.ended || this.over || !d || d.n !== c.n || !Array.isArray(d.p)) return;
    if (!this.crane.hasBlock() || !this.curSpec) return;
    c.dropped = true;
    c.dropAt = this.now;
    // the crane shows the swing up to the moment it was let go
    if (Number.isFinite(d.ct)) this.crane.replaySwing(d.ct, this.craneOpts);
    this.crane.release(0);
    this.turnHold = false;
    this.launchBlock(d.p);
  }

  /** The other player's turn is over: the tower as their game says it came to rest. */
  onRemoteSettled(d) {
    const c = this.turns?.cur;
    if (!c || c.mine || c.botTurn || c.ended || this.over || !d || d.n !== c.n || !d.snap) return;
    if (!c.dropped) {   // the report came before the drop: the block leaves the crane here and now
      c.dropped = true;
      if (this.crane.hasBlock()) this.crane.release(0);
    }
    c.ended = true;
    this.applySnapshot(d.snap, c.n - 1, d.r);
    this.turnHold = true;
    this.spawnDue = null;
    if (d.lost) this.lives = Math.min(this.lives, c.livesAt - 1);   // (the next turn brings the referee's count)
  }

  /** Every loose tower block at rest for a while (and nothing still falling past the tower). */
  turnCalm() {
    if (this.falling || this.eases.length) return false;
    if (this.dynDirty) this.rebuildDyn();
    for (let k = 0; k < this.dyn.length; k++) {
      const b = this.dyn[k];
      if (b.quietSteps < SETTLE.steps && !b.body.isSleeping) return false;
    }
    const surf = this.water.surfaceY;
    for (let k = 0; k < this.active.length; k++) {
      const b = this.active[k];
      if (b.state === 'lost' && !b.destroyed && b.top < surf) return false;
    }
    return true;
  }

  /**
   * The turn's block has done what it does (the step timers ask once it landed or fell): this game's
   * turn (or Robot Rikus's) ends when the tower is calm, at the latest TURNS.settleMaxMs after the drop.
   */
  turnSettled() {
    const c = this.turns?.cur;
    if (!c || c.ended || this.over) return;
    if (!c.mine && !c.botTurn) {   // the other game's turn: its report decides; nothing moves meanwhile
      if (this.turnCalm() || this.now >= c.dropAt + TURNS.settleMaxMs) this.turnHold = true;
      else this.spawnDue = this.now + FIXED;
      return;
    }
    if (!this.turnCalm() && this.now < c.dropAt + TURNS.settleMaxMs) {
      this.spawnDue = this.now + FIXED;   // ask again next step
      return;
    }
    c.ended = true;
    const blk = this.gridBlocks[c.n - 1];
    const snap = this.turnSnapshot();
    const r = !blk || snap.lost.includes(c.n - 1) || !snap.blocks.some((e) => e[0] === c.n - 1) ? 'X' : blk.rating || 'S';
    if (r === 'X' && !snap.lost.includes(c.n - 1)) snap.lost.push(c.n - 1);
    this.applySnapshot(snap, c.n - 1, r);   // exactly what the other game does with it
    this.turnHold = true;
    bus.emit('turns:mysettled', { n: c.n, lost: this.lives < c.livesAt, r, snap });
  }

  /** A turn that ended without its report (it came out of order): drop what's on the crane and hold still. */
  closeTurn() {
    const c = this.turns.cur;
    c.ended = true;
    c.dropped = true;
    if (this.crane.hasBlock()) this.crane.release(0);
    if (this.falling) this.removeQuietly(this.falling);
    this.turnHold = true;
    this.spawnDue = null;
  }

  /**
   * Where this turn left the tower: every block that wasn't cement (only those can have moved), the
   * newest TURNS.liveBlocks staying loose and the rest set as cement now, and the blocks it lost.
   */
  turnSnapshot() {
    const ok = (b) => Number.isFinite(b.body.position.x) && Number.isFinite(b.body.position.y) && Number.isFinite(b.body.angle);
    const loose = this.tower.filter((b) => b.state !== 'frozen' && !b.destroyed && ok(b)).sort((a, b) => a.index - b.index);
    const cement = Math.max(0, loose.length - TURNS.liveBlocks);
    const blocks = loose.map((b, k) => {
      const p = b.body.position;
      return [b.index, p.x, p.y, b.body.angle, k < cement ? 1 : 0, b.rating || null];
    });
    const standing = new Set(loose.map((b) => b.index));
    // lost: what fell this turn, a block still in the air when it ended, and one whose numbers broke
    const gone = [...this.turns.cur.lost];
    if (this.falling && !this.falling.destroyed) gone.push(this.falling.index);
    for (const b of this.tower) if (b.state !== 'frozen' && !b.destroyed && !ok(b)) gone.push(b.index);
    const lost = [...new Set(gone)].filter((i) => !standing.has(i));
    return { blocks, lost };
  }

  /**
   * The tower as a turn's report says it came to rest (both games do exactly this with it): each block
   * in it there, at rest, loose or set as cement; the blocks it lost gone. A block this game lost but
   * the report has comes back; one it kept that the report doesn't have goes.
   */
  applySnapshot(snap, turnIndex, r) {
    const M = this.M;
    this.eases.length = 0;   // a Goed or rain slide still going here stops where the report has the block
    const listed = new Set(snap.blocks.map((e) => e[0]));
    for (const b of [...this.tower]) if (b.state !== 'frozen' && !listed.has(b.index)) this.removeQuietly(b);
    if (this.falling && !listed.has(this.falling.index)) this.removeQuietly(this.falling);
    // blocks already lost but still on their way down: they were counted, they go now
    for (const b of this.active) if (b.state === 'lost' && !b.destroyed) b.destroy();
    for (const [i, x, y, a, f, rating] of snap.blocks) {
      let b = this.gridBlocks[i];
      if (!b || b.destroyed || b.state === 'lost') b = this.restoreBlock(i, x, y, a);
      else if (b.state === 'falling') this.landQuietly(b);
      if (b.state !== 'frozen') {
        M.Sleeping.set(b.body, false);
        M.Body.setPosition(b.body, { x, y });
        M.Body.setAngle(b.body, a);
        M.Body.setVelocity(b.body, { x: 0, y: 0 });
        M.Body.setAngularVelocity(b.body, 0);
        b.quietSteps = SETTLE.steps;
        if (b.state === 'landed') b.state = 'settled';
        b.sync();
      }
      const rr = rating || (i === turnIndex ? r : null);
      if (rr && !b.rating) {
        b.rating = rr;
        b.pendingRate = false;
      }
      if (b.rating && (this.grid[i] === PENDING || this.grid[i] === undefined)) this.grid[i] = b.rating;
      if (f === 1 && b.state !== 'frozen') this.freezeBlock(b, true);
    }
    for (const i of snap.lost) {
      const b = this.gridBlocks[i];
      if (b && !b.destroyed && b.state !== 'lost') this.removeQuietly(b);
      if (this.grid[i] === undefined || this.grid[i] === PENDING || i === turnIndex) this.grid[i] = 'X';
    }
    // the contacts' remembered pushes go too, and the tipping check counts again from here: the next drop
    // starts from the same physics state in both games
    safely(() => M.Pairs.clear(this.matter.world.engine.pairs));
    this.tipTick = 0;
    this.dynDirty = true;
    this.rebuildDyn();
    this.updateTowerHeight();
  }

  /** A block the turn's report says was lost: gone, without a heart or a splash (both were counted there). */
  removeQuietly(b) {
    if (b === this.falling) {
      this.falling = null;
      this.stepCtx.falling = null;
    }
    const k = this.tower.indexOf(b);
    if (k >= 0) {
      this.tower.splice(k, 1);
      this.dynDirty = true;
    }
    this.cancelStep(b.waitTimer);
    b.waitTimer = null;
    b.advanced = true;
    b.lostMarked = true;
    b.state = 'lost';
    if (!b.rating) b.rating = 'X';
    b.destroy();
  }

  /** A block still falling here that the report has at rest: it joins the tower (placed by applySnapshot). */
  landQuietly(b) {
    if (b === this.falling) {
      this.falling = null;
      this.stepCtx.falling = null;
    }
    this.cancelStep(b.waitTimer);
    b.waitTimer = null;
    b.advanced = true;
    b.state = 'settled';
    b.landedAt = this.now;
    b.shielded = false;
    if (!this.tower.includes(b)) {
      this.tower.push(b);
      this.landedCount++;
    }
    this.dynDirty = true;
  }

  /** A block this game lost that the report has standing: it comes back, where the report says. */
  restoreBlock(i, x, y, a) {
    const old = this.gridBlocks[i];
    if (old && !old.destroyed) old.destroy();
    const spec = this.sequence.block(i);
    const b = new Block(this, spec, x, y, a, this.nameFor(spec));
    b.special = null;
    b.state = 'settled';
    b.droppedAt = this.now;
    b.landedAt = this.now;
    b.advanced = true;
    b.lostMarked = false;
    b.splashed = false;
    b.pendingRate = false;
    b.waitTimer = null;
    b.quietSteps = SETTLE.steps;
    b.setFriction(this.weather.frictionMul);
    this.tower.push(b);
    this.active.push(b);
    this.gridBlocks[i] = b;
    this.dynDirty = true;
    return b;
  }

  /** The HUD's view of the match: whose turn, both players' hearts (this turn's loss at once), the time left. */
  turnsHud() {
    const T = this.turns;
    const o = T.hud;
    const c = T.cur;
    o.n = c ? c.n : 0;
    o.seat = c ? c.seat : 0;
    o.you = T.you;
    o.mine = !!c && c.mine;
    o.names = T.names;
    o.hearts[0] = T.hearts[0];
    o.hearts[1] = T.hearts[1];
    if (c) o.hearts[c.seat] = Math.min(T.hearts[c.seat], this.lives);   // (a loss shows at once, until the next turn's count)
    o.streaks = T.streaks;
    o.left = c && c.mine && !c.dropped ? Math.max(0, Math.ceil((c.deadline - nowMs()) / 1000)) : null;
    o.phase = !c ? 'wait' : !c.dropped ? 'aim' : c.ended ? 'wait' : 'drop';
    return o;
  }

  updateFloodTag(time) {
    const tag = this.floodTag;
    if (!tag) return;
    const water = this.water;
    const cam = this.cameras.main;
    const y = water.surfaceY - 22;
    const show = water.rising && !this.over && y > cam.worldView.y + 80 && y < cam.worldView.bottom - 120;
    const icon = this.floodIcon;
    if (show !== tag.visible) {
      tag.setVisible(show);
      icon?.setVisible(show);
    }
    if (!show) return;
    tag.y = y;
    if (icon) icon.y = y;
    if (time - this.floodTagAt < FLOOD_TAG_MS) return;
    this.floodTagAt = time;
    const str = fmtM(Math.max(0, (water.surfaceY - this.towerTopY) / PX_PER_M));
    if (str !== this.floodTagStr) {
      this.floodTagStr = str;
      tag.setText(str);
      if (icon) icon.x = tag.x - tag.width - 6;
    }
  }

  physicsStep() {
    if (this.dynDirty) this.rebuildDyn();
    const ctx = this.stepCtx;
    ctx.falling = this.falling;
    ctx.towerTopY = this.towerTopY;
    if (this.eases.length) this.stepEases();
    try {
      this.weather.beforeStep(ctx);
    } catch (err) {
      this.weatherFailed(err);
    }
    try {
      this.visitors.step();
    } catch (err) {
      this.visitorsFailed(err);
    }
    // Blok vir Blok: between drops nothing moves, so both games start the next drop from the same tower
    if (!this.turnHold) this.matter.world.step(FIXED * this.timeScale);
    const dyn = this.dyn;
    for (let k = 0; k < dyn.length; k++) {
      const b = dyn[k];
      const body = b.body;
      if (body.isSleeping || (body.speed < SETTLE.speed && body.angularSpeed < SETTLE.angularSpeed)) b.quietSteps++;
      else b.quietSteps = 0;
    }
    this.processCollisions();
    // (counted on steps that move the world: Blok vir Blok's two games count from the same report)
    if (!this.idle && !this.turnHold && (++this.tipTick & 3) === 0) this.wakeTipping();
    this.now += FIXED;
    if (this.started && !this.over) this.playMs += FIXED;
    this.checkBlocks();
    this.updateSettleAndFreeze();
    this.updateTowerHeight();
    this.updateFriction();
    this.updateWater(FIXED * (this.over ? this.timeScale : 1));
    this.runStepTimers();
  }

  /** Goed landings slide part of the way to the centre (a few px per step, no velocity added). */
  stepEases() {
    const M = this.M;
    const list = this.eases;
    for (let k = list.length - 1; k >= 0; k--) {
      const e = list[k];
      const b = e.block;
      if (b.destroyed || (b.state !== 'landed' && b.state !== 'settled') || e.left <= 0) {
        list.splice(k, 1);
        continue;
      }
      const body = b.body;
      M.Sleeping.set(body, false);
      M.Body.setPosition(body, { x: body.position.x + e.dx, y: body.position.y });
      if (e.mul) e.dx *= e.mul;
      e.left--;
    }
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
    f.shielded = false;   // it made it: from here on the tower's own rules apply
    f.state = 'landed';
    f.landedAt = this.now;
    this.lastLandAt = this.now;
    f.quietSteps = 0;
    this.tower.push(f);
    this.dynDirty = true;
    this.landedCount++;
    this.advance(f);
    if (f.special === 'foundation' && !this.over) {
      this.landFoundation(f, supportBody === this.baseBody ? null : supportBody.gameBlock);
      return;
    }

    const topHit = f.bottom <= supTop + TOP_HIT_TOL || (Math.abs(q.ny) > 0.75 && q.cy > f.centerY);
    const sup = supportBody === this.baseBody ? null : supportBody.gameBlock;
    let rating = null;
    if (topHit && !this.over) {
      const t = this.supportTop(sup);
      const dx = t.x - f.centerX;
      const adx = Math.abs(dx);
      // Narrow supports (a pillar, the single top cell of an L, a T on its foot) get narrower windows.
      const pTol = Math.min(SCORING.perfectTolPx, SCORING.perfectTolFrac * t.w);
      const gTol = Math.min(SCORING.goodTolPx, SCORING.goodTolFrac * t.w);
      // A block that can't stand centred on this support (an arch over a single cell) is never "good".
      const fits = restsOn(f.geom, t.face);
      // in the rain anything but a Perfek skids with the rain instead of easing to the middle
      const skid = this.weather.rainSkid();
      if (adx <= pTol && t.flat && fits) {
        this.snapPerfect(f, t);
        rating = 'P';
      } else if (adx <= gTol && fits) {
        rating = 'G';
        if (skid) {
          this.skidBlock(f, skid, t.x, t.w);
        } else if (SCORING.goodEase > 0) {
          const n = Math.max(1, Math.round(SCORING.goodEaseMs / FIXED));
          this.eases.push({ block: f, dx: (dx * SCORING.goodEase) / n, left: n });
        }
      } else {
        rating = 'S';
        if (skid) this.skidBlock(f, skid, t.x, t.w);
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
      // the flood starts quietly; the toast comes once it is actually getting close (updateWater)
      if (this.landedCount >= WATER.startAfterBlocks && !this.water.rising && !this.over && !this.turns) {
        this.water.start();
        this.coachSay(this.coach.water(), COACH.landingDelayMs);
      }
    }
    if (rating) this.applyRating(f, rating);
    this.emitProgress();
  }

  /**
   * Centre of a support's top surface in world space (null support = the base),
   * its load-bearing width, and whether it is level enough for a Perfek snap.
   * A rectangle may lie on any side; other shapes must be upright.
   */
  supportTop(sup) {
    const out = this.topPt || (this.topPt = { x: BASE_CX, y: LAYOUT.baseTopY, angle: 0, w: LAYOUT.baseWidth, face: LAYOUT.baseWidth, flat: true });
    if (!sup) {
      out.x = BASE_CX;
      out.y = LAYOUT.baseTopY;
      out.angle = 0;
      out.w = LAYOUT.baseWidth;
      out.face = LAYOUT.baseWidth;
      out.flat = true;
      return out;
    }
    const g = sup.geom;
    const b = sup.body;
    const a = b.angle;
    if (isRect(g)) {
      const k = Math.round(a / HALF_PI);
      const r = a - k * HALF_PI;
      const upright = (k & 1) === 0;
      const d = upright ? g.h / 2 : g.w / 2;
      out.x = b.position.x + d * Math.sin(r);
      out.y = b.position.y - d * Math.cos(r);
      out.angle = r;
      out.w = upright ? g.w : g.h;
      out.face = out.w;
      out.flat = Math.abs(r) <= SCORING.perfectMaxTilt;
      return out;
    }
    const r = wrapAngle(a, TWO_PI);
    if (Math.abs(r) <= 0.35) {
      const c = topCenterLocal(g);
      const sin = Math.sin(r);
      const cos = Math.cos(r);
      out.x = b.position.x + c.x * cos - c.y * sin;
      out.y = b.position.y + c.x * sin + c.y * cos;
      out.w = loadWidth(g);
      out.face = c.span;
    } else {
      // tipped over: aim at the middle of whatever is on top now, no snap
      out.x = (sup.left + sup.right) / 2;
      out.y = sup.top;
      out.w = (sup.right - sup.left) / 2;
      out.face = out.w;
    }
    out.angle = r;
    out.flat = Math.abs(r) <= SCORING.perfectMaxTilt;
    return out;
  }

  /** Perfek: put the block dead centre on its support, flush on its top surface, at rest. */
  snapPerfect(f, t) {
    const M = this.M;
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

  /**
   * Rain: the block slides up to `px` with the rain (dir), quick at first, then slower, spraying water.
   * It stops before its middle passes the edge of what it landed on (support middle supX, width supW):
   * the rain makes a tower crooked, it never throws a good landing off by itself.
   */
  skidBlock(f, { dir, px }, supX, supW) {
    const lim = Math.max(0, supW / 2 - SKID_EDGE);
    const off = f.centerX - supX;
    const to = Math.max(-lim, Math.min(lim, off + dir * px));
    const d = (to - off) * dir;   // how far it can still go with the rain
    if (d < 1) return;
    const n = Math.max(1, Math.round(WEATHER_TUNING.rainSkidMs / FIXED));
    const r = SKID_SLOW;
    this.eases.push({ block: f, dx: (dir * d * (1 - r)) / (1 - r ** n), left: n, mul: r });
    this.effects.spray(f.centerX + (dir * (f.right - f.left)) / 2, f.bottom);
  }

  applyRating(block, r) {
    if (block.rating) return;   // never rate a block twice
    block.rating = r;
    block.pendingRate = false;
    if (this.over) return;   // blocks still tumbling during the reveal don't score
    // (Blok vir Blok sets its cement at the end of each turn, the same in both games)
    if (r === 'P' && !this.turns) this.lockBelow(block);
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
      // every few Perfeks (in a row or not) win back a lost heart (not in Blok vir Blok: hearts are the score)
      if (!this.turns && this.lives < LIVES && ++this.heartPerfects >= SCORING.heartEvery) {
        this.heartPerfects = 0;
        this.lives = Math.min(LIVES, this.lives + 1);
        heart = true;
      }
    } else {
      if (r === 'G') pts += SCORING.goodBonus;
      this.combo = 0;
    }
    this.score += pts;
    this.visitorRated(block, r);
    bus.emit('game:rated', { rating: r, combo: this.combo });   // (the lesson, main.js)

    this.coachSay(this.coach.landing(r), COACH.landingDelayMs);
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
    // a run of Perfeks brings Hanswors with his log (every SCORING.rewardStreak in a row; Blok vir Blok's
    // run earns a joker instead, js/core/turns.js)
    if (r === 'P' && !this.turns && this.combo % SCORING.rewardStreak === 0) {
      try {
        this.visitors.reward?.(this.combo);
      } catch (err) {
        this.visitorsFailed(err);
      }
    }
  }

  /**
   * "Perfek sets the cement": the blocks under a Perfek landing turn to cement at
   * once (if they are at rest), so a Perfek can never be the root of a later collapse.
   */
  lockBelow(block) {
    let n = 0;
    const tower = this.tower;
    for (let k = 0; k < tower.length; k++) {
      const o = tower[k];
      if (o === block || o.state === 'frozen' || o.state === 'lost' || o.destroyed) continue;
      if (o.index > block.index || o.centerY <= block.centerY) continue;
      const body = o.body;
      if (body.speed > LOCK_MAX_SPEED || body.angularSpeed > LOCK_MAX_SPIN) continue;
      if (this.tipping?.has(o)) continue;   // a stack past its edge is never set in cement (it must tip)
      if (o.pendingRate && !o.rating) this.applyRating(o, 'S');
      if (o.state === 'landed') o.state = 'settled';
      this.freezeBlock(o, n > 0);
      n++;
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
    // A visitor's doing (the clown's gift, a block that was in the air when a visitor changed the
    // tower, or the tower still settling after a visitor's push): no heart, the combo stays and
    // the block keeps its own grid cell.
    const byVisitor = !this.idle && !this.over && visitorFree(block, { now: this.now, graceUntil: this.visitorGraceUntil, wasFalling });
    if (byVisitor && !wasFalling && block.pendingRate && !block.rating) this.rateQuietly(block, 'S');
    block.pendingRate = false;
    if (!block.rating) block.rating = 'X';
    this.advance(block);            // a block that never touched the tower still brings the next one
    if (this.idle || this.over) return;
    if (block.rating === 'X') this.visitorRated(block, 'X');   // a drop that never stood: no Perfek
    if (byVisitor) {
      this.visitorLoss(block, wasFalling);
      return;
    }

    // A collapse (tower blocks falling together) costs one life, not one per block.
    // A dropped block that misses costs its own, unless the tower was coming down
    // around it (it was aimed at a top that fell away).
    let free;
    if (wasFalling) {
      free = this.now - this.lastTowerLossAt < COLLAPSE_MS || this.towerFalling();
      if (!free) this.collapseUntil = this.now + COLLAPSE_MS;
    } else {
      free = this.now < this.collapseUntil;
      this.collapseUntil = this.now + COLLAPSE_MS;
      this.lastTowerLossAt = this.now;
    }
    // Blok vir Blok: a turn costs its player one heart at most (the referee's rule, js/core/turns.js)
    const turn = this.turns?.cur;
    if (turn) turn.lost.push(block.index);
    if (!free && !(turn && this.lives < turn.livesAt)) this.lives = Math.max(0, this.lives - 1);
    if (this.lives >= LIVES) this.heartPerfects = 0;
    if (!free && this.lives > 0) this.coachSay(this.coach.lost());
    this.grid[block.index] = 'X';
    this.combo = 0;
    this.effects.rating(block, 'X', 0);
    audio.play('lost');
    haptics.lost();
    this.emitProgress();
    if (this.lives <= 0 && !this.turns) this.endGame('lives');
  }

  /** A lost block a visitor is to blame for: it costs height, nothing else. */
  visitorLoss(block, wasFalling) {
    if (wasFalling) {
      this.grid[block.index] = 'X';   // it never reached the tower
    } else {
      // the rest of this collapse is the visitor's too (and so is a drop aimed at a top that fell away)
      this.lastTowerLossAt = this.now;
      this.collapseUntil = Math.max(this.collapseUntil, this.now + COLLAPSE_MS);
    }
    const blame = block.gift ? 'clown' : this.visitorBlame;
    if (blame === 'monkey') this.visitors.freeLoss('monkey');
    if (!block.gift && VISITOR_INFO[blame] && !this.graceToast) {
      this.graceToast = true;
      bus.emit('hud:toast', { text: S.visitorFree(VISITOR_INFO[blame].name), color: '#c9ffb8', visitor: true });
    }
    this.emitProgress();
  }

  /** A tower block is dropping off right now (a collapse that hasn't reached the sea yet). */
  towerFalling() {
    const dyn = this.dyn;
    for (let k = 0; k < dyn.length; k++) {
      if (dyn[k].body.velocity.y > LOST_FALL_VY && this.now - dyn[k].landedAt > 250) return true;
    }
    return false;
  }

  /** Is there still part of the tower (a lower ledge) under this falling block that it could land on? */
  ledgeBelow(b) {
    const x0 = b.left;
    const x1 = b.right;
    const y = b.bottom - 2;
    const dyn = this.dyn;
    for (let k = 0; k < dyn.length; k++) {
      const o = dyn[k];
      if (o !== b && o.left < x1 && o.right > x0 && o.top >= y) return true;
    }
    const fz = this.frozen;
    for (let k = fz.length - 1, m = 0; k >= 0 && m < GHOST_FROZEN_SCAN; k--, m++) {
      const o = fz[k];
      if (o.left < x1 && o.right > x0 && o.top >= y) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Visitors: js/game/visitors.js decides when (on the physics clock); the physics happens here.
  // -------------------------------------------------------------------------
  /** The tower top a visitor goes to: its centre and edges (world px). */
  visitorTop() {
    const tb = this.topBlock && !this.topBlock.destroyed ? this.topBlock : null;
    const t = this.supportTop(tb);
    const out = this.visitorTopOut || (this.visitorTopOut = { x: 0, y: 0, left: 0, right: 0 });
    out.x = t.x;
    out.y = this.towerTopY;
    out.left = tb ? tb.left : BASE_CX - BASE_HALF_W;
    out.right = tb ? tb.right : BASE_CX + BASE_HALF_W;
    return out;
  }

  /** The player's block got its rating (or was lost): a monkey waiting on his rope judges it. */
  visitorRated(block, r) {
    if (this.idle || this.over || block.gift || !(block.index >= 0)) return;
    try {
      this.visitors.landed(block.index, r);
    } catch (err) {
      this.visitorsFailed(err);
    }
  }

  // -------------------------------------------------------------------------
  // Power-ups (1.8; js/core/economy.js): main.js checks the player may use one (Oefen stock, or
  // the daily's free Fondamentblok) and calls applyPowerup; never in a match.
  // -------------------------------------------------------------------------
  /** Returns true when the power-up took effect (then main.js takes it from the stock). */
  applyPowerup(id) {
    if (this.idle || this.over || this.duel) return false;
    let ok = false;
    if (id === 'foundation') ok = this.armFoundation();
    else if (id === 'slow' && this.slowLeft === 0) {
      this.slowLeft = SLOW_BLOCKS;
      bus.emit('hud:toast', { text: S.powerupSlow, color: '#c9ffb8' });
      ok = true;
    } else if (id === 'shield' && !this.shieldOn) {
      this.shieldOn = true;
      bus.emit('hud:toast', { text: S.powerupShield, color: '#c9ffb8' });
      ok = true;
    } else if (id === 'heart' && this.lives < LIVES) {
      this.lives += 1;
      this.effects.floatText(GAME_W / 2, this.towerTopY - 170, S.extraLife, { color: '#ff8fb0', size: 42 });
      audio.play('heart');
      ok = true;
    }
    if (ok) {
      haptics.tap();
      this.emitPowerups();
      this.emitProgress();
    }
    return ok;
  }

  /** What the power-up tray needs to know (active effects; whether a heart can still be added). */
  emitPowerups() {
    bus.emit('game:powerups', {
      slowLeft: this.slowLeft, shield: this.shieldOn, foundation: this.crane.hasBlock() && !!this.curSpec?.foundation, heartRoom: this.lives < LIVES,
    });
  }

  /** The Fondamentblok replaces the block on the hook (that block's turn is skipped). */
  armFoundation() {
    if (!this.crane.hasBlock() || !this.curSpec || this.curSpec.foundation) return false;
    const spec = { shape: 'slab', scale: 2, color: 0, i: this.i, foundation: true };
    const geo = getGeometry(spec);
    const key = ensureTexture(this, spec);
    this.curSpec = spec;
    this.curGeom = geo;
    this.curName = null;
    this.curNameId = null;
    this.curKey = key;
    this.crane.setBlock(spec, key, geo);
    this.ghostMiss = false;
    this.ghost.setTexture(key).setOrigin(geo.originX, geo.originY).setTintFill(0xffffff).setAlpha(GHOST_A);
    this.ghostEdge.setTexture(key).setOrigin(geo.originX, geo.originY).setTintFill(0x1d2b45)
      .setScale((geo.w + GHOST_PAD) / geo.w, (geo.h + GHOST_PAD) / geo.h);
    this.planAutoplay();
    audio.play('banner');
    return true;
  }

  /**
   * The Fondamentblok lands: flush on what it hit (where the player aimed it), at rest; then it
   * and the tower under it set as cement, a new foundation (like Hanswors's blocks).
   */
  landFoundation(f, sup) {
    const M = this.M;
    const t = this.supportTop(sup);
    const ang = sup && !isRect(sup.geom) && Math.abs(t.angle) > TIPPED ? 0 : t.angle;
    const d = f.geom.h - f.geom.cy;
    const x = f.centerX;
    const along = Math.cos(ang) ? (x - t.x) / Math.cos(ang) : 0;
    const sy = t.y + along * Math.sin(ang);
    M.Sleeping.set(f.body, false);
    M.Body.setAngle(f.body, ang);
    M.Body.setPosition(f.body, { x: x + d * Math.sin(ang), y: sy - d * Math.cos(ang) });
    M.Body.setVelocity(f.body, { x: 0, y: 0 });
    M.Body.setAngularVelocity(f.body, 0);
    f.sync();
    f.rating = RATING.FOUNDATION;
    f.pendingRate = false;
    f.state = 'settled';
    if (!this.idle) this.grid[f.index] = RATING.FOUNDATION;
    this.score += SCORING.base;
    this.cementTower();
    if (f.state !== 'frozen') this.freezeBlock(f);
    this.updateTowerHeight();
    this.effects.dust(f.centerX, f.bottom, f.right - f.left);
    this.effects.sparkle(f.centerX, f.top, 26);
    this.effects.shake(0.004, 160);
    audio.play('land', { intensity: 1, size: 1 });
    audio.play('freeze');
    haptics.heavy();
    bus.emit('hud:toast', { text: S.foundationSet, color: '#ffe38c' });
    this.emitPowerups();
    this.emitProgress();
  }

  /** A visitor changed the tower: what comes down in the next moments is not the player's fault. */
  openVisitorGrace(type) {
    this.visitorGraceStart = this.now;
    this.visitorGraceUntil = this.now + VISITOR.graceMs;
    this.visitorBlame = type;
    this.graceToast = false;
    if (this.falling) this.falling.shielded = true;   // it was aimed at the tower as it stood
  }

  /**
   * Blouaap's strike: he hurls the top movable block into the sea and stamps on the next 1-2
   * (a Perfek block is "grounded": half the stamp). Cement never moves.
   */
  visitorShove(plan, dir) {
    if (this.over) return 0;
    const M = this.M;
    const targets = topMovable(this.tower, 1 + plan.count);
    targets.forEach((b, k) => {
      const body = b.body;
      M.Sleeping.set(body, false);
      b.knockedUntil = this.now + VISITOR.knockMaxMs;   // whenever it falls, it's his doing (until it rests)
      if (k === 0) {
        M.Body.setVelocity(body, { x: dir * plan.hurl, y: -VISITOR.monkeyHurlUp });
        M.Body.setAngularVelocity(body, dir * plan.hurlSpin);
        return;
      }
      const grounded = b.rating === RATING.PERFECT ? 0.5 : 1;
      M.Body.setVelocity(body, { x: body.velocity.x + dir * plan.kick * grounded, y: body.velocity.y - 1.2 * grounded });
      M.Body.setAngularVelocity(body, body.angularVelocity + dir * plan.spin * grounded);
    });
    if (targets.length) {
      const b = targets[0];
      this.effects.dust(b.centerX, b.bottom, b.right - b.left);
      this.effects.floatText(b.centerX, b.top - 30, '💥', { size: 72 });
      this.effects.shake(0.01, 300);
      audio.play('land', { intensity: 1, size: 1 });
      haptics.heavy();
    }
    this.openVisitorGrace('monkey');
    return targets.length;
  }

  /**
   * Where one of Hanswors's blocks sits: in the middle of the support's top surface, flush on it
   * (the way a Perfek lands). On a tipped-over odd shape: level, on its highest point.
   */
  giftPose(gspec, support) {
    const out = this.giftPoseOut || (this.giftPoseOut = { x: 0, y: 0, angle: 0 });
    const g = getGeometry(gspec);
    const sup = support && !support.destroyed ? support : null;
    const t = this.supportTop(sup);
    // Hanswors's log is a new floor: always level, on the highest point under it
    const level = gspec.log || (!!sup && !isRect(sup.geom) && Math.abs(t.angle) > TIPPED);
    const ang = level ? 0 : t.angle;
    const d = g.h - g.cy;
    out.x = t.x + d * Math.sin(ang);
    out.y = (level ? (sup ? sup.top : t.y) : t.y) - d * Math.cos(ang);
    out.angle = ang;
    return out;
  }

  /**
   * One of Hanswors's gift blocks. Everything on the tower that isn't on its way down sets as
   * cement first, where it stands; then his striped block goes flush on top and sets too, so it
   * can never slide off: the tower's new foundation.
   */
  visitorGift(gspec) {
    if (this.over || !gspec) return null;
    this.cementTower();
    this.updateTowerHeight();
    const sup = this.frozenTopBlock && !this.frozenTopBlock.destroyed ? this.frozenTopBlock : null;
    const spec = { ...gspec, i: -1, gift: true };
    const at = this.giftPose(spec, sup);
    const b = new Block(this, spec, at.x, at.y, at.angle, null);
    b.gift = true;
    b.rating = RATING.GIFT;
    b.state = 'settled';
    b.droppedAt = this.now;
    b.landedAt = this.now;
    b.advanced = true;        // it brings no crane block of its own
    b.lostMarked = false;
    b.splashed = false;
    b.pendingRate = false;
    b.shielded = false;
    this.tower.push(b);
    this.freezeBlock(b);
    this.updateTowerHeight();
    this.lastLandAt = this.now;
    this.gifts.push(this.blocksDropped);
    this.score += VISITOR.giftPoints;
    this.effects.floatText(b.right + 64, b.bottom + 24, `+${VISITOR.giftPoints} 🎁`, { color: '#fff27a', size: 36 });
    this.effects.dust(b.centerX, b.bottom, b.right - b.left);
    audio.play('land', { intensity: 0.5, size: 0.7 });
    this.emitProgress();
    return b;
  }

  /** Hanswors's cement: every tower block that isn't on its way down sets at once, where it is. */
  cementTower() {
    let n = 0;
    for (const o of this.tower) {
      if (o.state === 'frozen' || o.state === 'lost' || o.destroyed) continue;
      if (o.body.speed > CEMENT_MAX_SPEED) continue;
      if (o.pendingRate && !o.rating) this.applyRating(o, 'S');
      if (o.state === 'landed') o.state = 'settled';
      this.freezeBlock(o, true);
      n++;
    }
    return n;
  }

  /** Hanswors is done: his blocks (cement already) are the tower's new foundation. */
  visitorFoundation(gifts) {
    const set = (gifts || []).filter((g) => g && !g.destroyed && g.state === 'frozen');
    if (this.over || !set.length) return 0;
    const top = set.reduce((a, b) => (b.top < a.top ? b : a));
    this.effects.sparkle(top.centerX, top.top, 24);
    audio.play('freeze');
    bus.emit('hud:toast', { text: S.clownFoundation, color: '#fff27a', visitor: true });
    return set.length;
  }

  /** Skelm Sakkie's theft: the top movable blocks (never cement) leave the tower; their pictures go into his bag. */
  visitorSteal(max) {
    if (this.over) return [];
    const loot = thiefLoot(this.tower, max);
    const pics = [];
    for (const b of loot) {
      if (b.pendingRate && !b.rating) this.rateQuietly(b, 'S');   // it stood on the tower: it counts as it stood
      const img = b.image;
      pics.push(this.add.image(img.x, img.y, b.textureKey).setOrigin(img.originX, img.originY)
        .setRotation(img.rotation).setDepth(DEPTH.visitor - 0.5));
      const k = this.tower.indexOf(b);
      if (k >= 0) this.tower.splice(k, 1);
      const a = this.active.indexOf(b);
      if (a >= 0) this.active.splice(a, 1);
      b.state = 'stolen';
      b.destroy();
    }
    this.openVisitorGrace('thief');   // whatever leaned on them may come down
    if (loot.length) {
      this.dynDirty = true;
      this.rebuildDyn();
      this.updateTowerHeight();
      this.emitProgress();
    }
    return pics;
  }

  /** A block a visitor took (or knocked off) before its landing was rated counts as it stood, quietly. */
  rateQuietly(b, r) {
    b.rating = r;
    b.pendingRate = false;
    if (this.idle || this.over || b.gift) return;
    this.grid[b.index] = r;
    this.score += SCORING.base;
  }

  /** Debug / tests only (?debug=1): a visitor right now, e.g. window.__stapel.scene.spawnVisitor('thief'). */
  spawnVisitor(type, side = 1) {
    if (!this.debug || this.idle || this.over) return false;
    try {
      return this.visitors.spawn(type, side);
    } catch (err) {
      this.visitorsFailed(err);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Per-step bookkeeping
  // -------------------------------------------------------------------------
  syncBlocks() {
    const act = this.active;
    for (let k = 0; k < act.length; k++) {
      const b = act[k];
      if (!b.destroyed && b.state !== 'frozen') b.sync();
    }
  }

  checkBlocks() {
    const surf = this.water.surfaceY;
    // Nothing that is still moving can rest below the top of the cement: a block
    // dropping fast past it has missed (no need to wait until it reaches the sea).
    const floor = Math.min(this.frozenTopY, LAYOUT.baseTopY) + 40;
    const act = this.active;
    let n = 0;
    for (let k = 0; k < act.length; k++) {
      const b = act[k];
      if (b.destroyed) continue;
      if (b.state === 'frozen') continue;   // moved to the frozen list
      const vy = b.body.velocity.y;
      if (b.state !== 'lost') {
        const top = b.top;
        if (top > LAYOUT.baseTopY + 4 || Math.abs(b.centerX - BASE_CX) > GAME_W
          || (top > surf + 20 && vy > LOST_FALL_VY)
          || (top > floor && vy > LOST_FALL_VY && !this.ledgeBelow(b))) {
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
      if (quiet && b.knockedUntil) b.knockedUntil = 0;   // knocked loose, but it came to rest: the player's again
      if (b.state === 'landed') {
        if (quiet) {
          b.state = 'settled';
          if (b.pendingRate && !b.rating) this.applyRating(b, 'S');
        }
      } else if (b.state === 'settled' && b.quietSteps === 0 && !b.body.isSleeping && b.body.speed > 0.6) {
        b.state = 'landed';   // knocked loose again
      }
    }

    // A visitor's push is still settling for as long as the tower keeps moving (at most knockMaxMs):
    // a block that a knocked block sends over the edge is the visitor's doing too.
    const graceCap = (this.visitorGraceStart ?? -Infinity) + VISITOR.knockMaxMs;
    if (this.now < this.visitorGraceUntil && this.visitorGraceUntil < graceCap) {
      for (let k = 0; k < dyn.length; k++) {
        if (dyn[k].body.speed > GRACE_MOVING_SPEED) {
          this.visitorGraceUntil = Math.min(graceCap, Math.max(this.visitorGraceUntil, this.now + GRACE_TAIL_MS));
          break;
        }
      }
    }

    // Cement: a block with >= FREEZE_DEPTH newer tower blocks above it sets (one per frame). Blok vir
    // Blok sets its cement at the end of each turn instead (turnSettled), the same in both games.
    if (!this.turns) this.setCement();

    // Deep, drowned cement no longer needs a physics body.
    if (this.frozen.length && (++this.pruneTick & 7) === 0) this.pruneFrozenBodies();
  }

  /**
   * Cement: a block with >= FREEZE_DEPTH newer tower blocks above it sets (one per frame).
   * Wind keeps a stack gently rocking, so "quiet" can't be required there: a deep block
   * that has stood for a while and isn't really moving sets anyway, or the wobbly top
   * part would grow without limit during a wind event.
   */
  setCement() {
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
  }

  canSet(b) {
    if (this.tipping?.has(b)) return false;   // past its edge: it tips, it doesn't set
    const body = b.body;
    if (b.state === 'settled' && (b.quietSteps >= SETTLE.steps || body.isSleeping)) return true;
    return this.now - b.landedAt >= SET_AFTER_MS && body.speed < SET_MAX_SPEED && body.angularSpeed < SET_MAX_SPIN;
  }

  freezeBlock(b, quiet = false) {
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
    if (!quiet && !this.idle && !this.over) audio.play('freeze');
  }

  /**
   * Deep, drowned cement no longer needs a physics body, and cement far below
   * anything the camera can show again needn't be drawn (one draw call per block
   * on phones). Never touches a body that something still moving could rest on.
   */
  pruneFrozenBodies() {
    const fz = this.frozen;
    let lowest = -Infinity;
    for (let k = 0; k < this.dyn.length; k++) lowest = Math.max(lowest, this.dyn[k].bottom);
    if (this.falling) lowest = Math.max(lowest, this.falling.bottom);
    let limit = Math.min(this.water.surfaceY + 160, this.towerTopY + 2600);
    if (lowest > -Infinity) limit = Math.min(limit, lowest + 200);
    const world = this.matter.world;
    const keepFrom = fz.length - PRUNE_KEEP;
    while (this.pruneIdx < keepFrom) {
      const b = fz[this.pruneIdx];
      if (b.top <= limit) break;
      if (!b.bodyRemoved) {
        world.remove(b.body);
        b.bodyRemoved = true;
      }
      this.pruneIdx++;
    }
    // The camera never goes lower than the cement top at the drop line, so this is final.
    if (this.revealing || this.idle) return;
    const viewBottom = Math.min(this.frozenTopY, LAYOUT.baseTopY) - this.dropLineY + this.H + 80;
    while (this.hideIdx < this.pruneIdx) {
      const b = fz[this.hideIdx];
      if (b.top <= viewBottom) break;
      if (b.image && b.image.visible) b.image.setVisible(false);
      this.hideIdx++;
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
      if (h > this.maxHeightM && !this.over) {
        this.maxHeightM = h;
        this.checkMilestone();
        if (this.mode === 'daily' && !this.freeFoundationOffered && h >= FOUNDATION_FREE_M) {
          this.freeFoundationOffered = true;
          bus.emit('game:free-foundation');
        }
        this.checkChallenge();
        // keep the saved daily up to date with every new best height (a reload must not lose a block)
        if (h - this.progressHeight >= 0.5) {
          this.progressHeight = h;
          this.emitProgress();
        }
      }
    }
  }

  /** Passing the friend's height: one toast, the Perfek jingle and a sparkle; the line turns green. */
  checkChallenge() {
    if (!this.challengeM || this.challengeWon || this.idle || this.over) return;
    if (this.maxHeightM < this.challengeM) return;
    this.challengeWon = true;
    bus.emit('hud:toast', { text: S.challengeWon, color: '#ffe27a' });
    audio.play('perfect', { combo: 5 });
    this.effects.sparkle(this.topBlock?.centerX ?? GAME_W / 2, this.towerTopY, 26);
    if (this.challengeLine) this.challengeLine.setTintFill(0x4fd66a);
    if (this.challengeTag) this.challengeTag.setText(`✅ ${S.challengeLine(fmtM(this.challengeM))}`).setStyle({ stroke: '#1f7a35' });
  }

  /** The first time the tower passes 25 m, 50 m, 75 m, ...: one saying toast (the HUD queues or skips it). */
  checkMilestone() {
    if (this.idle || this.over) return;
    let hit = 0;
    while (this.maxHeightM >= this.nextMilestoneM) {
      hit = this.nextMilestoneM;
      this.nextMilestoneM += MILESTONE_STEP_M;
    }
    if (hit) bus.emit('hud:saying', { text: `${hit}\u00a0m — ${localSaying(milestoneSaying(this.seed, hit))}` });
  }

  updateFriction() {
    const fm = this.weather.frictionMul;
    if (fm === this.lastFrictionMul) return;
    this.lastFrictionMul = fm;
    for (let k = 0; k < this.dyn.length; k++) this.dyn[k].setFriction(fm);
    if (this.falling) this.falling.setFriction(fm);
  }

  /** Flood level and the flood check run on the physics step; the water is drawn per frame. */
  updateWater(dt) {
    const water = this.water;
    const frozenLevel = this.over && this.slowT > OVER_EMIT_MS;
    water.advance(dt, frozenLevel ? 0 : this.weather.waterSpeedMul);
    if (this.idle || this.over || !water.rising) return;
    const dist = water.surfaceY - this.towerTopY;
    if (dist < 0) {
      this.effects.splash(BASE_CX, water.surfaceY);
      audio.play('splash');
      this.endGame('flood');
      return;
    }
    // The flood starts quietly; say so once it is getting close, nag only when it is close.
    // No nagging while the water is still below the base platform (a short tower is always "close").
    const near = water.surfaceY < LAYOUT.baseTopY;
    if (!this.risingShown && near && dist < WATER.warnPx * 2) {
      this.risingShown = true;
      audio.play('warning');
      bus.emit('hud:toast', { text: S.waterRising, color: '#bfe6ff' });
    }
    this.effects.danger(dist < WATER.warnPx && near);
    if (dist < WATER.warnPx && near) {
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
    let target = Math.min(this.towerTopY - this.dropLineY, LAYOUT.baseTopY - this.dropLineY);
    if (this.idle) {
      // Attract mode: keep the little tower in the gap above the menu card when there is room.
      const mt = Number(this.registry.get('menuTopGame'));
      if (Number.isFinite(mt) && mt - IDLE_BASE_GAP >= IDLE_MIN_BASE) {
        target = Math.min(this.towerTopY - (mt - IDLE_TOP_GAP), LAYOUT.baseTopY - (mt - IDLE_BASE_GAP));
      }
    }
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
      // A drop that would miss the tower shows a red ghost dropping past it.
      if (p.miss !== this.ghostMiss) {
        this.ghostMiss = p.miss;
        if (p.miss) this.ghost.setTintFill(GHOST_MISS_TINT).setAlpha(0.45);
        else this.ghost.setTintFill(0xffffff).setAlpha(GHOST_A);
      }
      this.ghost.setPosition(p.x, p.y);
      this.ghostEdge.setPosition(p.x, p.y);
      // dotted guide from the hanging block to its landing spot
      const pose = this.crane.getBlockPose();
      const cam = this.cameras.main;
      const x0 = pose.x;
      const y0 = pose.y + cam.scrollY;
      const len = Math.max(0, Math.hypot(p.x - x0, p.y - y0) - 24);
      const line = this.aimLine;
      line.setPosition(x0, y0).setRotation(Math.atan2(x0 - p.x, p.y - y0));
      line.setCrop(0, 0, 6, Math.min(len, line.height));
      if (this.ghostLabel && this.hintPending) {
        // (kept left of the island billboard, which stands right of the base)
        const maxX = Math.max(140, Math.min(GAME_W - 140, BILLBOARD_LEFT - 6 - this.ghostLabel.width / 2));
        this.ghostLabel.setPosition(clamp(p.x, 140, maxX), p.y - (this.curGeom.h - this.curGeom.cy) - 14);
        if (!this.ghostLabel.visible) this.ghostLabel.setVisible(true);
      }
    }
    this.setGhostVisible(showGhost);
    if (this.autoOn) this.autoCheck(p.x, p.targetX);
  }

  setGhostVisible(on) {
    if (!on && this.ghostLabel && this.ghostLabel.visible) this.ghostLabel.setVisible(false);
    if (this.ghost.visible === on) return;
    this.ghost.setVisible(on);
    this.ghostEdge.setVisible(on);
    this.aimLine.setVisible(on);
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
    // Red when it will fall: nothing under it, only something far down the tower (or the base
    // under a tall tower), or its centre of mass is past the edge of what it lands on.
    const deep = s.found && s.top > this.towerTopY + 2 * GHOST_MISS_DROP;
    const over = s.block ? x < s.block.left || x > s.block.right : Math.abs(x - BASE_CX) > BASE_HALF_W;
    const hit = s.found && !deep;
    out.miss = !hit || over;
    const landTop = hit ? s.top : this.towerTopY + GHOST_MISS_DROP;
    out.x = x;
    out.y = landTop - (g.h - g.cy);
    out.targetX = this.supportTop(hit ? s.block : this.topBlock).x;
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
  /**
   * How near the loose top of the tower (the blocks that aren't cement yet) is to tipping, and to which
   * side: for each loose block, the centre of mass of it and everything above it against the part of
   * the block under it (or the cement, or the base) it stands on. 0 is centred, ±1 the edge (it tips
   * there); the worst level counts, its sign is the heavy side. A player counters it with the next block.
   */
  towerLean() {
    const loose = this.leanBlocks || (this.leanBlocks = []);
    // blocks past their edge, with everything standing on them: they must tip (wakeTipping)
    const tipping = this.tipping || (this.tipping = new Set());
    tipping.clear();
    loose.length = 0;
    for (const b of this.tower) {
      if (b.state === 'frozen' || b.state === 'lost' || b.state === 'falling' || b.destroyed || !b.body) continue;
      loose.push(b);
    }
    if (!loose.length) return 0;
    loose.sort((a, b) => b.bottom - a.bottom);   // lowest first
    const sup = this.frozenTopBlock && !this.frozenTopBlock.destroyed ? this.frozenTopBlock : null;
    let worst = 0;
    for (let i = 0; i < loose.length; i++) {
      const b = loose[i];
      // what it stands on: the nearest block below that it overlaps (loose, then the cement, then the base)
      let l = BASE_CX - BASE_HALF_W;
      let r = BASE_CX + BASE_HALF_W;
      let found = false;
      for (let j = i - 1; j >= 0 && !found; j--) {
        const u = loose[j];
        if (u.left < b.right && u.right > b.left) {
          l = u.left;
          r = u.right;
          found = true;
        }
      }
      if (!found && sup && sup.left < b.right && sup.right > b.left) {
        l = sup.left;
        r = sup.right;
      }
      l = Math.max(l, b.left);
      r = Math.min(r, b.right);
      // it and what stands over it: the loose blocks above it that overlap it (side by side doesn't count)
      let m = b.body.mass;
      let mx = b.body.mass * b.body.position.x;
      let over0 = b.left;
      let over1 = b.right;
      const group = this.leanGroup || (this.leanGroup = []);
      group.length = 0;
      group.push(b);
      for (let k = i + 1; k < loose.length; k++) {
        const o = loose[k];
        if (o.right <= over0 || o.left >= over1) continue;
        m += o.body.mass;
        mx += o.body.mass * o.body.position.x;
        over0 = Math.min(over0, o.left);
        over1 = Math.max(over1, o.right);
        group.push(o);
      }
      const lean = r - l < 2 ? (mx / m < (l + r) / 2 ? -1.5 : 1.5) : clamp((mx / m - (l + r) / 2) / ((r - l) / 2), -1.5, 1.5);
      if (Math.abs(lean) > Math.abs(worst)) worst = lean;
      if (Math.abs(lean) > TIP_LEAN) for (let k = 0; k < group.length; k++) tipping.add(group[k]);
    }
    return worst;
  }

  /**
   * Real physics for a leaning tower (1.11, testers: "the physics aren't working"): a block whose weight,
   * with everything on it, is past the edge of what holds it up must tip. Matter lets a body that hardly
   * moves fall asleep, so a stack that starts to tip slowly could hang there, leaning, for good. Every
   * few physics steps (on the physics clock: the same in every game) such blocks are woken, so gravity
   * finishes the job. The balance meter reads the same numbers.
   */
  wakeTipping() {
    this.leanNow = this.towerLean();
    if (!this.tipping.size) return;
    const Sl = this.M.Sleeping;
    for (const b of this.tipping) if (b.body.isSleeping) Sl.set(b.body, false);
  }

  updateWobble(dtS) {
    // the balance meter (HUD): the lean (measured on the physics clock, wakeTipping), eased, so a
    // landing's jolt doesn't flick it
    const lean = this.idle ? this.towerLean() : this.leanNow;
    this.lean += (lean - this.lean) * (1 - Math.exp(-dtS * 6));
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
    if (this.wobble > CREAK_AT && this.now - this.lastCreak > 450) {
      this.lastCreak = this.now;
      audio.play('creak', { intensity: Math.min(1, this.wobble) });
    }
    if (this.wobble > SHAKE_AT && this.now - this.lastWobbleShake > 380) {
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
    s.heartProgress = this.lives < LIVES ? this.heartPerfects : 0;
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
    s.lean = this.lean;
    s.turns = this.turns ? this.turnsHud() : null;
    bus.emit('hud:state', s);
  }

  writeRegistry() {
    const cam = this.cameras.main;
    const reg = this.registry;
    reg.set('camY', cam.scrollY);
    // scrollY + H/2 is the view centre at any zoom, so this also works during the reveal
    const alt = Math.max(0, -(cam.scrollY + LAYOUT.dropLineY - LAYOUT.baseTopY)) / PX_PER_M;
    reg.set('altitudeM', alt);
    this.syncAmbience(alt);
  }

  /** Beach ambience: full at sea level, gone by ~60 m (the visual gulls fade out over 15-50 m); calm on the menu. */
  syncAmbience(alt) {
    if (this.over) return;   // the game-over reveal keeps whatever level it had
    const t = clamp((alt - 15) / 45, 0, 1);
    const q = this.idle ? 0.8 : Math.round((1 - t * t * (3 - 2 * t)) * 20) / 20;
    if (q === this.ambQ) return;
    this.ambQ = q;
    audio.setAmbience(q);
  }

  emitProgress() {
    if (this.mode !== 'daily' || this.over) return;
    bus.emit('game:progress', this.buildResult('quit'));
  }

  buildResult(reason) {
    let dropped = this.blocksDropped;
    const cells = new Array(this.grid.length).fill(null);
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
      cells[k] = c;
    }
    // the clown's gifts (🎁) sit in the grid where they joined the tower
    const grid = gridWithGifts(cells, this.gifts);
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
      visitors: this.visitors ? this.visitors.log() : [],
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
    try {
      this.visitors.end();   // whoever is visiting slips away; nothing more happens to the tower
    } catch (err) {
      this.visitorsFailed(err);
    }
    for (const b of this.active) b.waitTimer = null;
    this.stepTimers.length = 0;   // pending next-block spawns
    this.spawnDue = null;
    for (const t of this.timers) t.remove(false);
    this.timers.length = 0;
    this.crane.setVisible(false);
    this.setGhostVisible(false);
    this.effects.danger(false);
    bus.emit('hud:hint', { text: null });
    const result = this.buildResult(reason);
    this.result = result;
    // the tower ended by itself (hearts, flood, quit): the match hears it before the result is built
    if (this.duel && reason !== 'won' && reason !== 'lost') bus.emit('duel:over', { reason, t: this.now });
    bus.emit('game:audience', {
      mode: this.mode === 'duel' ? 'practice' : this.mode,   // a match counts like a practice game for sponsors
      dateKey: this.dateKey,
      tally: this.tally,
      billboardId: this.billboardData?.premium?.id ?? null,
      blocksDropped: result.blocksDropped,
    });
    // Saved right away; the delayed 'game:over' only brings up the results screen.
    bus.emit('game:final', result);
    bus.emit('hud:hide', { heightM: result.heightM, reason });

    if (reason === 'quit') {
      bus.emit('game:over', result);
      return;
    }
    this.timeScale = SLOWMO_SCALE;
    this.slowT = 0;
    if (reason === 'won') {
      // first to 50 m (or the other tower fell): a celebration, not a game-over
      audio.play('record');
      haptics.perfect();
      this.effects.flash(0xfff3b0, 0.35, 420);
      this.effects.sparkle(this.topBlock?.centerX ?? GAME_W / 2, this.towerTopY, 30);
      this.delay(REVEAL_DELAY_MS, () => this.reveal());
      this.delay(OVER_EMIT_MS, () => bus.emit('game:over', result));
      return;
    }
    audio.play('gameover');
    haptics.heavy();
    if (reason === 'lives') {
      this.effects.flash(0xff3b3b, 0.35, 450);
      this.effects.shake(0.012, 350);
      this.effects.vignette(0xd8231b, 0.55, 900);
    } else {
      this.effects.flash(0x7cc4f2, 0.3, 360);
      this.effects.vignette(0x1f6fb2, 0.6, 1100);
    }
    this.delay(REVEAL_DELAY_MS, () => this.reveal());
    this.delay(OVER_EMIT_MS, () => bus.emit('game:over', result));
  }

  updateSlowMo(dt) {
    this.slowT += dt;
    if (this.overReason === 'quit') return;
    if (this.slowT <= SLOWMO_MS) this.timeScale = SLOWMO_SCALE;
    else this.timeScale = Math.min(1, SLOWMO_SCALE + ((this.slowT - SLOWMO_MS) / SLOWMO_RAMP_MS) * (1 - SLOWMO_SCALE));
  }

  /** Zoom out to show the whole tower from just above its top down to the island, with a height ruler. */
  reveal() {
    const cam = this.cameras.main;
    this.revealing = true;
    cam.setRotation(0);
    for (const b of this.frozen) if (b.image && !b.destroyed) b.image.setVisible(true);
    const bestY = LAYOUT.baseTopY - this.maxHeightM * PX_PER_M;
    const top = Math.min(this.towerTopY, bestY) - 160;
    const bottom = LAYOUT.baseTopY + 200;
    const span = Math.max(1, bottom - top);
    const z = clamp(Math.min(1, this.H / span), 0.15, 1);
    cam.zoomTo(z, REVEAL_MS, 'Sine.easeInOut');
    cam.pan(GAME_W / 2, (top + bottom) / 2, REVEAL_MS, 'Sine.easeInOut');
    if (this.billboard) safely(() => this.billboard.reveal(z, REVEAL_MS));
    safely(() => this.buildRuler(z, bestY));
  }

  /** World-space height marks (every 10 or 20 m) and a flag at the best height, sized for the zoom. */
  buildRuler(z, bestY) {
    if (this.maxHeightM < 2) return;
    const step = this.maxHeightM > 100 ? 20 : this.maxHeightM > 12 ? 10 : 5;
    const px = Math.round(24 / z);
    const x0 = GAME_W / 2 - 340 / z;
    const g = this.add.graphics().setDepth(DEPTH.fxWorld + 3);
    g.lineStyle(3 / z, 0xffffff, 0.85);
    const style = {
      fontFamily: FONT, fontSize: `${px}px`, fontStyle: 'bold', color: '#ffffff',
      stroke: '#1d2b45', strokeThickness: Math.max(3, Math.round(px * 0.18)), resolution: 1,
    };
    for (let m = step; m <= this.maxHeightM; m += step) {
      const y = LAYOUT.baseTopY - m * PX_PER_M;
      g.lineBetween(x0, y, x0 + 26 / z, y);
      this.add.text(x0 + 32 / z, y, fmtMShort(m), style).setOrigin(0, 0.5).setDepth(DEPTH.fxWorld + 3);
    }
    // dashed line at the best height, flag on the right
    g.lineStyle(4 / z, 0xffe38c, 0.95);
    const dash = 22 / z;
    for (let x = x0; x < GAME_W / 2 + 300 / z; x += dash * 2) g.lineBetween(x, bestY, x + dash, bestY);
    this.add.text(GAME_W / 2 + 300 / z, bestY, '🏁', { fontSize: `${Math.round(40 / z)}px`, resolution: 1 })
      .setOrigin(0.5, 1).setDepth(DEPTH.fxWorld + 3);
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
      const craneKey = this.crane && this.crane.block && this.crane.block.texture ? this.crane.block.texture.key : null;
      for (const b of this.active) b.destroy();
      for (const b of this.frozen) b.destroy();
      this.resetRunState();
      this.seed = `idle-${Math.floor(Math.random() * 1e9)}`;
      this.sequence = createSequence(this.seed);
      this.namer = this.makeNamer();
      releaseNamedTextures(this.textures, [craneKey]);   // the crane may still show its block
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
      visitor: this.visitorState(),
      visitors: this.visitors ? this.visitors.log() : [],
      gifts: this.gifts.length,
      turns: this.turns ? {
        n: this.turns.cur?.n ?? 0, seat: this.turns.cur?.seat ?? null, mine: !!this.turns.cur?.mine,
        dropped: !!this.turns.cur?.dropped, ended: !!this.turns.cur?.ended, hearts: [...this.turnsHud().hearts], hold: this.turnHold,
      } : null,
    };
  }

  /** Debug / tests: the visitor on screen (type, phase, sim ms since it came, where it is). */
  visitorState() {
    const c = this.visitors && this.visitors.active;
    if (!c) return null;
    return { type: c.type, phase: c.phase, t: Math.round(c.t), x: round1(c.x), y: round1(c.y), side: c.side, gone: !!c.gone };
  }
}

export default GameScene;
