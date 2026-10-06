// Stapel — gedeelde konstantes (shared constants).
// Every tunable number lives here so gameplay can be balanced in one place.
// World units are pixels. The world y-axis points down; the top of the base
// platform is world y = 0 and the tower grows into negative y.

export const VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Screen / layout
// ---------------------------------------------------------------------------
export const GAME_W = 720;

/** Portrait game height that matches the device aspect ratio (clamped). */
export function computeGameHeight(w = globalThis.innerWidth || 720, h = globalThis.innerHeight || 1280) {
  const ratio = Math.min(2.2, Math.max(1.6, h / Math.max(1, w)));
  return Math.round((GAME_W * ratio) / 2) * 2;
}

export const LAYOUT = {
  jibY: 150,            // screen y of the crane jib (beam across the top)
  trolleyH: 26,         // trolley box height under the jib
  ropeLen: 100,         // rope length from trolley to the hook
  hookH: 14,            // hook graphic height; the block's top hangs at hook bottom
  dropLineY: 760,       // screen y where the tower top is kept by the camera (same on every device => same fall distance)
  baseWidth: 300,       // width of the concrete base platform (fondament)
  baseHeight: 44,
  baseTopY: 0,          // world y of the base top surface
  hudTop: 24,
};

// Metres shown to the player = pixels / PX_PER_M
export const PX_PER_M = 25;

// ---------------------------------------------------------------------------
// Physics (Phaser 3 built-in Matter.js). The scene steps the engine manually
// at a fixed 60 Hz so behaviour is identical on 60/90/120 Hz screens.
// ---------------------------------------------------------------------------
export const PHYSICS = {
  gravityY: 1.1,                 // Matter gravity.y (scale 0.001) => 1.1 * 1000 px/s^2
  fixedDtMs: 1000 / 60,
  maxStepsPerFrame: 4,
  positionIterations: 10,
  velocityIterations: 8,
  constraintIterations: 2,
  enableSleeping: true,
  block: {
    friction: 0.9,
    frictionStatic: 1.2,
    frictionAir: 0.012,
    restitution: 0,
    density: 0.0015,
    slop: 0.04,
  },
  settle: {
    speed: 0.08,          // px/step
    angularSpeed: 0.004,  // rad/step
    steps: 20,            // consecutive quiet steps => settled
  },
};

/** Convert a horizontal acceleration in px/s^2 into a Matter force for a body of `mass`. */
export function accelToForce(mass, accelPxS2) {
  return mass * accelPxS2 * 1e-6;
}
/** px/s  ->  Matter velocity units (px per 60 Hz step). */
export const pxPerSecToStep = (v) => v / 60;
/** Matter velocity units (px per step) -> px/s. */
export const stepToPxPerSec = (v) => v * 60;

// ---------------------------------------------------------------------------
// Crane (hyskraan)
// ---------------------------------------------------------------------------
export const CRANE = {
  amplitude: 230,        // trolley travel either side of centre (px)
  omega0: 1.55,          // rad/s of the trolley sine at block 0
  omegaPerBlock: 0.03,   // added per block index
  omegaMax: 4.0,
  carry: 0.3,            // fraction of the hanging block's velocity kept on release
  pendulumDamping: 1.6,  // visual rope swing damping (1/s)
  respawnDelayMs: 350,   // after a landing/loss, wait this long before the next block appears
  maxWaitMs: 2500,       // ...or at most this long after a drop
};

// ---------------------------------------------------------------------------
// Scoring (punte), lives and the "cement sets" freeze rule
// ---------------------------------------------------------------------------
export const SCORING = {
  perfectTolPx: 8,       // |dx| <= this  => Perfek! (block snaps dead centre)
  goodTolPx: 24,         // |dx| <= this  => Goed
  base: 10,              // every landed block
  perfectBonus: 15,      // x combo (combo 1 => 15, 2 => 30, ...)
  goodBonus: 5,
  comboCap: 10,
  heartEvery: 5,         // every 5th consecutive Perfek restores a heart
};
export const LIVES = 3;
export const FREEZE_DEPTH = 8;   // all but the newest 8 settled blocks set like cement (become static)

// Rating codes used in the result grid
export const RATING = { PERFECT: 'P', GOOD: 'G', SKEW: 'S', LOST: 'X' };
export const RATING_EMOJI = { P: '🟩', G: '🟨', S: '🟧', X: '🟥' };

// ---------------------------------------------------------------------------
// Rising flood line (vloedlyn)
// ---------------------------------------------------------------------------
export const WATER = {
  startOffsetPx: 40,     // water surface starts this far below the base top
  startAfterBlocks: 3,   // starts rising once this many blocks have landed
  v0: 4,                 // px/s when rising starts
  accel: 0.12,           // px/s^2
  vMax: 60,              // px/s
  warnPx: 140,           // HUD warning when tower top is this close to the water
  rainbowDropPx: 40,     // a rainbow event makes the water recede this much
};

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
export const SHAPE_IDS = ['plank', 'slab', 'brick', 'crate', 'cube', 'pillar', 'wedge', 'arch', 'L', 'J', 'T'];

// Bright palette with a South African accent. fill/light/dark are 0xRRGGBB.
export const PALETTE = [
  { id: 'protea',     fill: 0xf25c84, light: 0xff9ab5, dark: 0xb83a5e },
  { id: 'karoo',      fill: 0xf39a2b, light: 0xffc56e, dark: 0xb86d12 },
  { id: 'sonneblom',  fill: 0xf7c948, light: 0xffe38c, dark: 0xc39a1c },
  { id: 'bosveld',    fill: 0x5bbf5a, light: 0x92e08d, dark: 0x3b8b3c },
  { id: 'oseaan',     fill: 0x2fb5b0, light: 0x74ddd8, dark: 0x1d817d },
  { id: 'jakaranda',  fill: 0x8e6ce0, light: 0xbba4f5, dark: 0x6447ad },
  { id: 'hemel',      fill: 0x3d8beb, light: 0x86b9f7, dark: 0x2563b0 },
  { id: 'klei',       fill: 0xd9483b, light: 0xf28a7f, dark: 0x9e2c22 },
];

// ---------------------------------------------------------------------------
// Weather (weer) — event type ids. Display names/emoji live in core/strings.js.
// ---------------------------------------------------------------------------
export const WEATHER_TYPES = ['wind', 'gust', 'rain', 'storm', 'hail', 'fog', 'heat', 'rainbow'];

export const WEATHER_TUNING = {
  windAccel: 120,        // px/s^2 at strength 1 (applied to falling blocks + crane swing)
  towerWindFactor: 0.5,  // fraction of wind applied to resting dynamic tower blocks
  gustFlipMs: 1200,
  gustMul: 1.6,
  rainFriction: 0.3,     // friction multiplier while it rains (slippery)
  rainWaterMul: 2,
  heatCraneMul: 1.3,
  rainbowScoreMul: 2,    // Perfek bonus multiplier during a rainbow
  stormWarnMs: 2000,
  hailCount: 10,         // hailstones per hail event at strength 1
};

// ---------------------------------------------------------------------------
// Daily tower
// ---------------------------------------------------------------------------
export const EPOCH_DATE_KEY = '2026-10-06';   // Daaglikse Toring #1
export const STORAGE_KEY = 'stapel.v1';
export const SITE_URL_FALLBACK = 'https://anandregroenewald.github.io/Toring/';

// ---------------------------------------------------------------------------
// Render depths (within GameScene)
// ---------------------------------------------------------------------------
export const DEPTH = {
  island: 10,
  base: 12,
  ghost: 18,
  tower: 20,
  hail: 24,
  fxWorld: 40,
  water: 50,
  weather: 60,      // rain/fog/heat overlays (screen-space)
  crane: 70,        // crane + hanging block (screen-space)
  fxScreen: 80,     // flashes, bolts (screen-space)
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

export const COLORS = {
  text: 0xffffff,
  textStroke: 0x1d2b45,
  perfect: 0xffffff,
  good: 0xffe38c,
  skew: 0xffb36b,
  lost: 0xff6b6b,
  water: 0x1f6fb2,
  waterLight: 0x7cc4f2,
  crane: 0xf5b800,
  craneDark: 0x2b2b2b,
};
