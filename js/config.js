// Stapel — gedeelde konstantes (shared constants).
// Every tunable number lives here so gameplay can be balanced in one place.
// World units are pixels. The world y-axis points down; the top of the base
// platform is world y = 0 and the tower grows into negative y.

export const VERSION = '1.7.8';

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
  jibY: 200,            // screen y of the crane jib (beam across the top); the HUD has the band above it
  trolleyH: 26,         // trolley box height under the jib
  ropeLen: 80,          // rope length from trolley to the hook
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
  velocityIterations: 50,        // high: off-centre landings otherwise pick up fake spin (see blocks.js)
  constraintIterations: 2,
  restingThresh: 30,             // Matter Resolver._restingThresh (px/step): impacts use the accumulated-impulse solver (set by blocks.js)
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
  amplitude: 230,        // trolley travel either side of centre (px), reached at block 4
  amplitudeStart: 110,   // block 0 swings gently (any first tap lands on the base)...
  amplitudePerBlock: 30, // ...and the swing widens by this much per block
  omega0: 1.55,          // rad/s of the trolley sine at block 0
  omegaPerBlock: 0.045,  // added per block index: the higher the tower, the faster the crane
  omegaMax: 3.6,         // reached at block 46
  omegaTop: 4.6,         // never faster than this, also with a heat wave on top
  carry: 0.3,            // fraction of the hanging block's velocity kept on release
  pendulumDamping: 1.6,  // visual rope swing damping (1/s)
  respawnDelayMs: 350,   // after a landing/loss, wait this long before the next block appears
  maxWaitMs: 2500,       // ...or at most this long after a drop
  calmWaitMaxMs: 2000,   // after a tower block falls, the next block waits (up to this long) for the tower to stop moving
};

// ---------------------------------------------------------------------------
// Scoring (punte), lives and the "cement sets" freeze rule
// ---------------------------------------------------------------------------
export const SCORING = {
  perfectTolPx: 8,       // |dx| <= this  => Perfek! (block snaps dead centre)...
  goodTolPx: 24,         // |dx| <= this  => Goed (eased towards the centre)
  perfectTolFrac: 0.15,  // ...but never more than this fraction of the support's load-bearing width
  goodTolFrac: 0.3,
  perfectMaxTilt: 0.05,  // rad: a support leaning more than this can't give a Perfek (no snap onto a tipped block)
  goodEase: 0.6,         // a Goed landing is slid this fraction of the way to the centre
  goodEaseMs: 120,
  base: 10,              // every landed block
  perfectBonus: 15,      // x combo (combo 1 => 15, 2 => 30, ...)
  goodBonus: 5,
  comboCap: 10,
  heartEvery: 3,         // every 3rd Perfek (not necessarily in a row) while a heart is missing brings it back
};
export const LIVES = 4;
export const FREEZE_DEPTH = 8;   // all but the newest 8 settled blocks set like cement (become static)

// Rating codes used in the result grid (GIFT: the clown's bonus block, not a drop of the player's)
export const RATING = { PERFECT: 'P', GOOD: 'G', SKEW: 'S', LOST: 'X', GIFT: 'B' };
export const RATING_EMOJI = { P: '🟩', G: '🟨', S: '🟧', X: '🟥', B: '🎁' };
// High-contrast set (settings.highContrast): distinct for every kind of colour blindness.
export const RATING_EMOJI_HC = { P: '🟦', G: '🟧', S: '⬜', X: '⬛', B: '🎁' };

// ---------------------------------------------------------------------------
// Rising flood line (vloedlyn)
// ---------------------------------------------------------------------------
export const WATER = {
  startOffsetPx: 40,     // water surface starts this far below the base top
  startAfterBlocks: 3,   // starts rising once this many blocks have landed
  v0: 5,                 // px/s when rising starts
  accel: 0.11,           // px/s^2 (catches a typical builder after about two minutes)
  vMax: 60,              // px/s
  warnPx: 140,           // HUD warning when tower top is this close to the water
  rainbowDropPx: 40,     // a rainbow event makes the water recede this much
};

// ---------------------------------------------------------------------------
// First-game coach hints (js/core/coach.js, HudScene): text only, never any gameplay change
// ---------------------------------------------------------------------------
export const COACH = {
  minBlocks: 4,          // a first game with this many drops counts as learned (no hints from then on)
  holdMs: 3800,          // how long a hint stays before it fades on its own
  landingDelayMs: 450,   // after the first landing: let the rating pop finish first
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
  towerWindFactor: 0.25,  // fraction of wind applied to resting dynamic tower blocks
  gustFlipMs: 1200,
  gustMul: 1.6,
  rainFriction: 0.3,     // friction multiplier while it rains (slippery)
  rainSkidPx: 26,        // rain: a landing that isn't a Perfek skids this far with the rain (x strength)
  rainSkidMs: 450,
  rainWaterMul: 2,
  heatCraneMul: 1.5,     // heat wave: the crane races (eased in and out with the heat)
  rainbowScoreMul: 2,    // Perfek bonus multiplier during a rainbow
  stormWarnMs: 2000,
  hailCount: 10,         // hailstones per hail event at strength 1
  strikeKick: [1.5, 2.5], // lightning: sideways kick (px/step) x strength
};

// ---------------------------------------------------------------------------
// Visitors (besoekers): who comes when is level data in core/visitorplan.js; names in core/strings.js.
// Every time below runs on the simulated clock (fixed physics steps), like the weather.
// ---------------------------------------------------------------------------
export const VISITOR_TYPES = ['monkey', 'clown', 'thief'];

export const VISITOR = {
  size: 88,                // emoji sprite font size (px)
  hitR: 60,                // tap radius (px): a 120 px circle around the visitor
  sideX: 92,               // the monkey and the clown wait this far from the screen edge (clear of the aim)
  monkeyRunUpMs: 1500,     // tap window: the monkey swings on its rope before it jumps
  monkeyLeapMs: 380,
  monkeyBounceMs: 560,     // two bounces on the tower top, then he strikes:
  monkeyLeaveMs: 650,
  monkeyHurl: [7, 9],      // the top block is hurled into the sea, this fast sideways (px/step)...
  monkeyHurlUp: 5.5,       // ...and up (px/step), so it clears the block under it...
  monkeyHurlSpin: [0.07, 0.11], // ...tumbling (rad/step)
  monkeyKick: [3.2, 4.4],  // and the next 1-2 blocks are stamped sideways (px/step, x strength)
  monkeySpin: 0.05,        // rad/step
  clownArriveMs: 1200,     // floats in, honking (tapping him only makes him honk and juggle)
  clownTossMs: 420,        // each gift block flies onto the tower top and sets there as cement
  clownLeaveMs: 1100,
  giftMax: 4,              // he brings 1-4 blocks: a new foundation (the tower under them sets too)
  giftGapMs: 300,          // between two of his blocks
  giftPoints: 25,
  thiefClimbMs: 2000,      // tap window: he sneaks up the side of the tower
  thiefGrabMs: 450,
  thiefLeaveMs: 950,
  thiefMax: 4,             // blocks he can carry (never cement)
  graceMs: 2500,           // tower blocks lost this soon after a visitor's push cost no heart...
  knockMaxMs: 8000,        // ...and so does a block the monkey moved, until it comes to rest (at most this long)
};

// ---------------------------------------------------------------------------
// Uitdagersreeks (head-to-head; docs/CHALLENGE-SPEC.md). Rules in core/duel.js, live side in duel.js.
// ---------------------------------------------------------------------------
export const DUEL = {
  goalM: 50,               // the first to 50 m wins
  marks: [10, 20, 30, 40], // whoever reaches a mark first chooses a punishment for the other tower
  punishments: ['monkey', 'thief', 'fog', 'heat'], // Blouaap, Skelm Sakkie, Mis, Hittegolf
  attackFor: { 10: 'monkey', 20: 'thief', 30: 'monkey', 40: 'thief' }, // sent when nobody chooses in time
  chooseMs: 7000,          // time to choose, while the tower keeps going (the server waits a little longer, then sends the default)
  weatherAttackBlocks: 3,  // Mis / Hittegolf last this many blocks
  ghostPenaltyM: { monkey: 3, thief: 4, fog: 2, heat: 2 }, // what a punishment takes off a recording's tower
  sampleMs: 1000,          // a recording keeps the height once a second
  maxRunMs: 15 * 60 * 1000,
  maxHeightM: 2000,
  maxClimbMps: 2,          // faster than this is not a real tower (live reports are refused)
  searchMs: 20000,         // random opponent: search this long, then a recording or the computer
  roomWaitMs: 10 * 60 * 1000,
  countdownMs: 3000,
  stateEveryMs: 400,       // live: how often a tower sends its height
  nameMax: 16,
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
  visitor: 61,      // visitors stay visible in fog and rain (rating pops sit just above them)
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
