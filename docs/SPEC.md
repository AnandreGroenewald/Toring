# STAPEL — build spec (authoritative contract for every module)

"Stapel" is a free Afrikaans block-stacking phone game that runs in the browser.
Tagline: **"Stapel hoog. Staan sterk."**  Repo root: `/home/user/Toring`.

It blends:
- **Wordle**: one *Daaglikse Toring* per day (same blocks and weather for everyone, from a date seed), one scored try, a streak, a countdown to the next tower, an emoji share line for WhatsApp.
- **Stack (Ketchapp)**: instant one-finger play (tap anywhere = drop), a bright "Perfek!" flash plus a combo bonus when a block lands dead centre; rising chime pitch per combo.
- **Tower Bloxx**: a yellow crane jib across the top of the screen; the block swings on a rope; the tower grows tall, height shown in metres; the camera climbs.
- **Tricky Towers**: weather events hit the tower while you build, and a rising flood line (water) you must stay above.
- **Jenga**: wobble and tension — real Matter.js physics; top blocks wobble and can topple; creaks; gentle camera sway on tall towers.

## Hard technical rules
- **Phaser 3.90.0** is vendored at `lib/phaser.min.js` and loaded with a classic `<script>` tag, so `Phaser` is a **global**. Use only Phaser's built-in Matter: `const M = Phaser.Physics.Matter.Matter;` (Body, Bodies, Composite, Sleeping, Vertices, ...). Matter is version 0.19/0.20 (Verlet; `Body.setVelocity` units are px per 16.67 ms step).
- Game code is **native ES modules** (`<script type="module" src="js/main.js">`), no bundler, no npm runtime deps, no build step. Must run when the repo root is served statically (GitHub Pages from `main`, `index.html` at the root). All paths **relative** (no leading `/`) because Pages serves under `/Toring/`.
- **No image/audio asset files** for gameplay: all shapes and colours are drawn in code (Phaser Graphics → `generateTexture`, or canvas), weather is shown with **emoji**, all sounds are short **WebAudio** synths. (App icons for the PWA manifest are the only images, generated from code.)
- Whole repo payload < 3 MB (Phaser is 1.2 MB). Target 60 fps on a mid-range Android phone: no per-frame Graphics redraws of big shapes, generated textures cached, particle counts modest (< ~150 alive), text objects updated only when their string changes.
- Portrait layout. Logical width `GAME_W = 720`; height from `computeGameHeight()` in `js/config.js` (720 × aspect clamped to [1.6, 2.2]). Phaser `Scale.FIT` + `CENTER_BOTH`.
- All player-facing text is **Afrikaans** and comes from `js/core/strings.js` (`S`, `WEATHER_INFO`, `SHAPE_NAMES`). If you need a new string, add it to strings.js (append; don't rename existing keys). Decimal comma: use `js/core/format.js` (`fmtM(37.46) -> "37,5 m"`, `fmtInt(1240) -> "1 240"`, `fmtClock(ms) -> "HH:MM:SS"`, `fmtDateKey('2026-10-06') -> "Dinsdag 6 Oktober 2026"`).
- All tunables come from `js/config.js` (already written — read it first). Don't hardcode duplicates; if you need a new constant add it to config.js (append only).
- Core modules (`js/core/*`) must be pure and importable in **node** (no Phaser, no DOM at import time) — they're unit tested with `node --test`.
- Code style: modern JS (ES2020), 2-space indent, single quotes, semicolons, small focused functions, short comments only where they explain *why*. No TypeScript.

## Files already written (read them; do not rewrite unless told)
- `lib/phaser.min.js` (+ `lib/LICENSE-phaser.md`)
- `js/config.js` — constants (layout, physics, crane, scoring, water, palette, weather tuning, depths, fonts, colours).
- `js/core/bus.js` — `export const bus` with `on(evt, fn) -> unsubscribe`, `once`, `off`, `emit`.
- `js/core/format.js` — Afrikaans number/date formatting.
- `js/core/strings.js` — all Afrikaans strings + `WEATHER_INFO` + `SHAPE_NAMES`.

## File ownership map (who writes what)
```
index.html                 UI agent
css/style.css              UI agent
manifest.webmanifest       UI agent
sw.js                      UI agent
icons/*                    UI agent (generated from code; svg + 192/512/180 png)
.nojekyll                  UI agent (empty file)
js/ui/dom.js               UI agent
js/core/rng.js             core agent
js/core/daily.js           core agent
js/core/storage.js         core agent
js/core/share.js           core agent
js/core/sequence.js        core agent
tests/*.test.js            core agent  (node --test)
package.json               core agent  ({"type":"module", scripts.test})
js/audio.js                audio agent
js/game/blocks.js          blocks+weather agent
js/game/weather.js         blocks+weather agent
js/game/crane.js           visuals agent
js/game/water.js           visuals agent
js/game/effects.js         visuals agent
js/game/island.js          visuals agent
js/scenes/BgScene.js       visuals agent
js/scenes/GameScene.js     game agent
js/scenes/HudScene.js      game agent
js/main.js                 game agent
```
Never edit a file owned by another agent during the implementation phase. If you depend on another module, code against the API below exactly.

---------------------------------------------------------------------------
## World model & coordinates
- World units = px. World y points down. **Base platform top surface is world y = 0** (`LAYOUT.baseTopY`). Tower grows into negative y. Height in px = `-towerTopY`; metres = px / `PX_PER_M` (25).
- Base: static Matter rectangle, width `LAYOUT.baseWidth` (300), height `LAYOUT.baseHeight`, centred at world x = `GAME_W/2`, top at y = 0, label `'base'`. Below it a rocky island (visual only) in the sea.
- Camera: no zoom during play. `cam.scrollY = towerTopY - LAYOUT.dropLineY` (lerped), but never larger (lower) than the start value `0 - LAYOUT.dropLineY` (i.e. tower top at screen y 760 on every device ⇒ same fall distance everywhere — fair daily). `scrollX = 0`.
- The crane lives in **screen space** (`setScrollFactor(0)`) at the top. The hanging block is a screen-space image. On release, convert to world: `worldY = screenY + cam.scrollY`.

## Scenes (Phaser)
Game config (main.js): `type: Phaser.AUTO`, `parent: 'game'`, `width: GAME_W`, `height: computeGameHeight()`, `backgroundColor: '#8fd3f4'`, `banner: false`, `disableContextMenu: true`, `input: { activePointers: 2 }`, `render: { antialias: true, powerPreference: 'high-performance' }`, `scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }`, `scene: [BgScene, GameScene, HudScene]` (only BgScene auto-starts; `GameScene`/`HudScene` constructed with `active: false`).
Scene keys: `'Bg'`, `'Game'`, `'Hud'`. Render order: Bg (bottom) → Game → Hud (top).
GameScene's own physics config: `super({ key: 'Game', active: false, physics: { default: 'matter', matter: { gravity: { y: PHYSICS.gravityY }, enableSleeping: true, autoUpdate: false, positionIterations, velocityIterations, constraintIterations, debug: false } } })`.

### Registry keys (GameScene writes every frame, BgScene reads)
- `'camY'` number — camera scrollY (world).
- `'altitudeM'` number — camera altitude in metres = max(0, -(cam.scrollY + LAYOUT.dropLineY)) / PX_PER_M (≈ tower height being viewed).
- `'skyDark'` 0..1 — storm/fog darkening (set by weather via GameScene).
- `'wind'` number — current wind accel px/s² (signed), for cloud drift and BgScene effects.
- `'rainbow'` 0..1 — rainbow visibility.

---------------------------------------------------------------------------
## Module APIs

### js/core/rng.js (core agent)
```js
export function hashString(str) -> uint32            // e.g. cyrb53/xmur3 folded to 32-bit
export function mulberry32(seedUint32) -> () => number in [0,1)
export function createRng(seed /* string|number */) -> Rng
// Rng: { next(), float(min, max), int(min, maxInclusive), pick(array), weighted([{ w, v }]) -> v, chance(p) -> bool, fork(label) -> Rng (independent stream derived from seed+label) }
```

### js/core/daily.js (core agent)
Local calendar day (like Wordle: resets at the player's local midnight).
```js
export function dateKeyFor(date = new Date()) -> 'YYYY-MM-DD' (local date)
export function dayNumber(dateKey) -> int  // EPOCH_DATE_KEY ('2026-10-06') => 1, next day => 2. Use Date.UTC on the Y-M-D parts (DST-proof).
export function seedFor(dateKey) -> 'stapel-' + dateKey
export function addDays(dateKey, n) -> dateKey
export function daysBetween(aKey, bKey) -> int (b - a)
export function msUntilNextDay(now = new Date()) -> ms until next local midnight (>0)
export function nextDayTimestamp(now = new Date()) -> epoch ms of next local midnight
export function parseDebugDate(search) -> dateKey|null   // from '?date=YYYY-MM-DD' (only honoured by main.js when '?debug=1')
```

### js/core/sequence.js (core agent)
Pure, deterministic per seed. Use separate rng forks for blocks and weather so they don't affect each other.
```js
export function createSequence(seed /* string */) -> {
  seed,
  block(i) -> BlockSpec        // deterministic; generated sequentially & cached; any call order gives the same result
  events -> WeatherEvent[]     // precomputed for block indices 0..299, sorted by start, non-overlapping
  eventAt(i) -> WeatherEvent|null   // event with start <= i < end
  forecast(n = 5) -> string[]  // first n event types, e.g. ['wind','rain','rainbow','storm','fog']
}
BlockSpec   = { i, shape /* one of SHAPE_IDS */, scale /* 0.8..1.12 width multiplier */, color /* PALETTE index */ }
WeatherEvent= { type /* WEATHER_TYPES */, start, end /* exclusive block indices */, dir /* -1|1 */, strength /* ~0.6..1.6 */ }
```
Block rules: i=0 always `plank` with scale 1. i 1..3 from {plank, slab, brick, crate}. i 4..11 also {cube, pillar, wedge, arch}. i ≥ 12 also {L, J, T}. Weighted (easy shapes more common early; awkward ones more common later). Never the same shape 3× in a row; never the same colour twice in a row. Scale: early 0.95–1.12; drifts smaller with i (min ~0.8 by i≈40).
Weather rules: first event starts at block 5. After each event, a calm gap of 2–4 blocks. Duration: 3–5 blocks (fog/heat 4–6, rainbow 3). Types: early (start < 15) from {wind, rain, heat, fog}; later add {storm, hail, gust}. `rainbow` is never random — after a `rain` event, 50% chance the very next event is a `rainbow` (gap 0–1). Never the same type twice in a row. strength = 0.6 + min(0.9, start*0.02) + rng.float(-0.1, 0.1). dir random ±1.

### js/core/storage.js (core agent)
Persist under `STORAGE_KEY` in localStorage; must survive a throwing/missing localStorage (fall back to in-memory). Expose pure helpers for tests.
```js
export function createStore(backend = safeLocalStorage()) -> Store
Store:
  getSettings() -> { sound: true, vibration: true, reducedMotion: <from prefers-reduced-motion if available else false> }
  setSettings(partial) -> settings
  tutorialSeen() -> bool ; markTutorialSeen()
  getDaily(dateKey) -> DailyEntry|null       // { status: 'playing'|'done', result: Result, startedAt, finishedAt }
  startDaily(dateKey, partialResult)          // status 'playing' (call on FIRST drop of a daily). No-op if already exists.
  saveDailyProgress(dateKey, partialResult)   // updates the 'playing' entry's result
  finishDaily(dateKey, result) -> Stats       // status 'done'; applies to stats ONCE (idempotent if already done)
  recoverUnfinished(todayKey) -> Result[]     // any 'playing' entry (any date) is finalised as done with reason 'quit'; returns the finalised results
  getStats(todayKey) -> Stats
  getPracticeBest() -> { heightM, score } ; recordPractice(result) -> { isNewBest }
Stats = { played, currentStreak /* 0 if last done date < yesterday */, maxStreak, bestScore, bestHeightM, totalPerfects, lastDateKey, history: [{ dateKey, dayNumber, heightM, score } ...last 7 calendar days ending today, null-height for missed days] }
export function streakAfter(prevLastDateKey, prevStreak, dateKey) -> newStreak  // consecutive day => +1, same day => unchanged, gap => 1
```
`finishDaily` returns `{ ...stats, isNewBestHeight, isNewBestScore }`.

### js/core/share.js (core agent)
```js
export function buildShareText(result, { url }) -> string
export async function shareResult(text, channel /* 'native'|'whatsapp'|'copy' */) -> 'shared'|'copied'|'opened'|'failed'|'cancelled'
export function whatsappUrl(text) -> 'https://wa.me/?text=' + encodeURIComponent(text)
```
Format (daily):
```
Stapel #1 🏗️ 37,5 m
⭐ 1 240 · 🎯 7× Perfek · 🔥 4
🟩🟩🟨🟩🟩🟥🟩🟨🟩🟩
🟩🟨🟧🟩🟥🌊
Weer: 💨🌧️🌈⛈️
Stapel hoog. Staan sterk.
https://…/Toring/
```
Line 1: `Stapel #N 🏗️ <fmtM(heightM)>` (practice: `Stapel (oefen) 🏗️ …`). Line 2: points `⭐ fmtInt(score)`, `🎯 P× Perfek`, `🔥 maxCombo` (omit the 🔥 part if maxCombo < 2). Grid: `result.grid` chars mapped with `RATING_EMOJI`, rows of 10, max 5 rows; if more blocks, the last row ends with `+N`. Final emoji appended to the grid's last row: `🌊` if reason 'flood', `💥` if reason 'lives', nothing for 'quit'. Weather line: `Weer: ` + emoji of `result.weather` in order (omit line if empty). Then tagline, then url. `native` uses `navigator.share({ text })` (fallback to copy when unavailable; AbortError → 'cancelled'); `whatsapp` opens `whatsappUrl` via `window.open(url, '_blank')` (fallback `location.href`); `copy` uses `navigator.clipboard.writeText` with a hidden-textarea `execCommand('copy')` fallback.

### Result object (produced by GameScene, consumed by storage/share/UI)
```js
Result = {
  mode: 'daily'|'practice', dateKey: string|null, dayNumber: number|null, seed: string,
  reason: 'lives'|'flood'|'quit',
  score: int,              // punte
  heightM: number,         // best settled tower height reached, metres (1-decimal precision)
  blocksPlaced: int,       // blocks that landed on the tower
  blocksDropped: int,
  perfects: int,
  maxCombo: int,
  grid: string,            // one char per dropped block in drop order: 'P' perfek, 'G' goed, 'S' skeef, 'X' lost (final fate; a block that landed and later fell becomes 'X')
  weather: string[],       // event types started, in order
  durationMs: int,
}
```

### js/audio.js (audio agent)
Plain WebAudio, lazily create one `AudioContext` on `unlock()` (call from first user gesture). No files. All sounds short (< 1.2 s), procedurally synthesised (oscillators + noise buffers + envelopes + filters), mixed through a master gain + gentle compressor. Must never throw if WebAudio is missing.
```js
export const audio = {
  unlock(),                   // create/resume context (idempotent; safe to call on every pointerdown)
  setEnabled(bool), get enabled(),
  suspend(), resume(),        // for pause / tab hidden
  play(name, opts = {}),
}
// names & opts:
// 'click' (UI), 'drop' (release whoosh), 'land' {intensity 0..1, size 0..1} (woody thud), 'perfect' {combo n} (bright chime; pitch climbs a major-pentatonic scale per combo step, extra sparkle for combo>=3),
// 'good', 'skew', 'lost' (descending boop), 'splash' (water), 'creak' {intensity} (tower wobble), 'heart' (extra life jingle),
// 'wind' {strength} (short whoosh gust), 'rain' (short pitter burst for event start), 'thunder' {intensity}, 'zap' (lightning crackle warning), 'hail' (tiny tick, many calls/sec must be cheap; voice-limit it), 'heat' (shimmer), 'rainbow' (sparkly arpeggio), 'fog' (soft low pad swell),
// 'warning' (water alarm blip), 'gameover' (descending arpeggio), 'record' (fanfare), 'banner' (event sting), 'freeze' (soft "set" tick)
export const haptics = { setEnabled(bool), tap(), perfect(), lost(), heavy() }   // navigator.vibrate patterns; no-op if unsupported
```
Voice limiting: cap simultaneous voices per name (e.g. hail 4, land 3, creak 1) and throttle (e.g. creak ≥ 400 ms apart). Volume levels balanced (perfect chime the most prominent).

### js/game/blocks.js (blocks+weather agent)
Shapes are defined in bbox-local px (top-left origin) as a list of rects (compound for L/J/T/arch) or a convex polygon (wedge). Base dimensions (before `scale`, which multiplies **width** except cube/crate which scale uniformly):
- plank 200×40, slab 160×48, brick 128×56, crate 84×84, cube 60×60, pillar 52×128,
- wedge: trapezoid bottom 150, top 90, height 60 (wide base, flat top),
- arch (Π): 132×88 — top beam 132×36 + two legs 36×52 at the ends,
- L: cells of 44: bottom row 3 cells + 1 cell on top at the left (132×88); J: mirror (cell on top at the right); T: top row 3 cells + 1 cell below in the middle (132×88).
```js
export const SHAPES = { [id]: { parts?: [{x,y,w,h}], poly?: [{x,y}], w, h, name } }
export function getGeometry(spec) -> { w, h, parts?, poly?, originX, originY }   // scaled; originX/Y = centroid position as a fraction of the PADDED texture (see below)
export function ensureTexture(scene, spec) -> textureKey   // draws once, cached by key `blk_${shape}_${w}x${h}_${color}` (w,h rounded)
export function createBody(spec, x, y, angle = 0) -> MatterBody (NOT added to world). Material from PHYSICS.block. label 'block'. Compound for multi-part shapes (Body.create({ parts })) — set friction/frictionStatic/frictionAir/restitution/slop on the parent and density on each part.
export class Block {
  constructor(scene, spec, x, y, angle = 0)  // creates body + image (origin at centroid), adds body to scene.matter.world, depth DEPTH.tower; sets body.gameBlock = this
  spec, index (= spec.i), body, image,
  state: 'falling'|'landed'|'settled'|'frozen'|'lost',
  rating: null|'P'|'G'|'S'|'X',
  quietSteps: 0,
  sync()                     // image.x/y/rotation from body
  get top()/bottom()/left()/right()/centerX()   // from body.bounds
  get isStatic()
  setVelocityPxS(vx, vy)     // px/s -> Matter units
  setFriction(mul)           // body.friction = PHYSICS.block.friction * mul
  freeze()                   // Body.setStatic(body, true); image tint slightly darker; state 'frozen'
  wake()                     // Sleeping.set(body, false)
  destroy()                  // remove body from world, destroy image
}
export function shapeColor(spec) -> PALETTE entry
```
Texture art: Stack-like flat bright colours. Per part: rounded rect (r≈6) fill, lighter top band, darker bottom band, thin darker outline; seams between cells of compound shapes; subtle shape-specific detail (plank wood-grain lines, brick mortar, crate diagonal brace, pillar flutes, cube small inner square). Pad the texture by 3 px. Centroid: create the body at (0,0) unrotated, then `originX = (-body.bounds.min.x + pad) / texW`, `originY = (-body.bounds.min.y + pad) / texH` — exact for any shape. Image depth `DEPTH.tower`.

### js/game/weather.js (blocks+weather agent)
Drives weather events (block-indexed from the sequence) and their effects. Visuals in screen space (scrollFactor 0) at `DEPTH.weather`/`DEPTH.fxScreen`; hail bodies in world.
```js
export class Weather {
  constructor(scene, sequence, { effects, audio, haptics, bus, reducedMotion })
  setBlockIndex(i) -> WeatherEvent|null   // called when block i is attached to the crane. Ends the current event if i >= end; starts sequence.eventAt(i) if it starts at i. On start: bus.emit('hud:banner', { emoji, title, subtitle }), audio 'banner' + type sound, push type to this.seen.
  beforeStep(ctx)                // called before EVERY fixed physics step. ctx = { dynamicBlocks: Block[], falling: Block|null }. Applies wind/gust forces (falling block full, resting dynamic blocks × towerWindFactor) via Body.applyForce with accelToForce(); wakes sleeping bodies it pushes.
  update(dtMs, ctx)              // per frame. ctx = { topBlock: Block|null, towerTopY, camera, W, H }. Timers, visuals, lightning strikes, hail spawning, cleanup, and writes registry 'skyDark','wind','rainbow'.
  get active() -> WeatherEvent|null
  get windAccel() -> number      // signed px/s^2 currently acting (includes gust variation) — used by crane swing and ghost prediction (mean wind only: see meanWindAccel)
  get meanWindAccel() -> number  // the steady part (for the landing ghost prediction)
  get frictionMul() -> number    // rain => WEATHER_TUNING.rainFriction else 1
  get waterSpeedMul() -> number  // rain => rainWaterMul else 1
  get craneSpeedMul() -> number  // heat => heatCraneMul else 1
  get fogAlpha() -> 0..1         // > 0.5 means hide the landing ghost
  get perfectMul() -> number     // rainbow => rainbowScoreMul else 1
  get blocksLeft() -> int|null   // remaining blocks in active event (for HUD chip)
  seen: string[]
  isHail(body) -> bool
  destroy()
}
```
Effects per type:
- **wind**: steady accel = dir × windAccel × strength; wind streak particles (screen space, short white lines) drifting with the wind; occasional `audio.play('wind')` gusts every ~2 s.
- **gust** (Warrelwind): like wind but the direction flips every `gustFlipMs` with strength × `gustMul` and random variation; more streaks; also adds sway to crane via windAccel.
- **rain**: rain particles (screen space, ~80 alive, slanted by wind), `frictionMul` 0.3 → GameScene applies to the falling block on drop and to dynamic blocks while raining; `waterSpeedMul` 2; skyDark 0.25.
- **storm** (Donderstorm): skyDark 0.55, a little rain; lightning strike at event start + one more ~half-way (by blocks or ~6 s later). Each strike: dark cloud marker + `zap` crackle for `stormWarnMs` above the target column, then a jagged bolt (screen-space Graphics, redrawn only during the strike ~250 ms) from the top of screen to `topBlock`, white screen flash (effects.flash), `thunder`, haptics.heavy(), and an impulse on topBlock (if dynamic): sideways velocity ≈ dir × (2..4) px/step × strength, upward −1.5, angular ±0.04. If the top block is frozen, strike the highest dynamic block instead; if none, strike harmlessly (still show bolt).
- **hail**: spawn `hailCount × strength` small circle bodies (r 6–8, density 0.004, restitution 0.45, friction 0.1, label 'hail', collisionFilter group −7 so they don't collide with each other) at random x above the screen top over the event's first ~5 s; white-ish texture; `audio.play('hail')` on their collisions (throttled). Remove when below world y 200 or after 6 s.
- **fog**: screen-space fog overlay (soft white bands + slowly drifting puffs) with fogAlpha ramping to ~0.8 around the drop zone; the ghost is hidden.
- **heat**: craneSpeedMul 1.3, warm translucent orange overlay with gentle alpha pulse (heat shimmer).
- **rainbow**: perfectMul 2, registry 'rainbow' → 1 (BgScene draws an arc), bus.emit('weather:rainbow') at start (GameScene lowers the water by WATER.rainbowDropPx and shows S.waterRecede).
Fade overlays in/out over ~600 ms. `destroy()` removes everything (called on scene shutdown).

### js/game/crane.js (visuals agent)
Screen-space yellow lattice jib across the full width at `LAYOUT.jibY` (ends run off-screen), a trolley that slides along it, a rope (cheap: a thin stretched image or a tiny Graphics line redraw), a hook, and the hanging block image. Block centroid hangs so the block's **top** touches the hook bottom.
```js
export class Crane {
  constructor(scene)                 // builds visuals at DEPTH.crane, scrollFactor 0
  setBlock(spec, textureKey, geom)   // geom from blocks.getGeometry(spec); shows hanging block (quick drop-in tween from above / scale-in)
  hasBlock() -> bool
  getBlockPose() -> { x, y, angle, vx, vy }   // screen-space centroid position (px), angle (rad), velocity (px/s)
  release() -> pose                  // same as getBlockPose(), then hides the hanging block; plays a small trolley "bounce"
  update(dtMs, { omega, amplitude = CRANE.amplitude, windAccel = 0 })
     // trolley x = GAME_W/2 + amplitude * sin(phase); phase += omega*dt. Rope pendulum angle θ driven by trolley acceleration & wind:
     // θ'' = -(g/L) sinθ - (a_trolley/L) cosθ + windAccel/L - damping θ'   (g ≈ 1000*PHYSICS.gravityY px/s², L = rope+half block)
     // clamp |θ| <= 0.35 rad. Block hangs at trolley + rope along θ, rotated by θ.
  get trolleyX()
  setVisible(bool)
  destroy()
}
```

### js/game/water.js (visuals agent)
Rising flood in world space at `DEPTH.water` (above the tower so submerged blocks look underwater).
```js
export class Water {
  constructor(scene, { width = GAME_W })   // surface starts at world y = WATER.startOffsetPx (below the base top)
  get surfaceY() -> number                  // world y of the surface
  get rising() -> bool
  start()                                   // begin rising (GameScene calls when WATER.startAfterBlocks blocks have landed)
  update(dtMs, speedMul = 1)                // if rising: v = min(vMax, v0 + accel * tRising) * speedMul px/s; surfaceY -= v*dt
  lower(px)                                 // recede (rainbow); never below the start level
  splash(x)                                 // small splash at the surface (particles)
  destroy()
}
```
Visual: translucent deep-blue body (alpha ~0.78) from the surface down far enough to cover the view even at camera zoom 0.25 (extend ±4000 px horizontally, 6000 down), a lighter animated wave strip on top (TileSprite of a generated wave texture, tilePositionX scrolls), a thin foam/highlight line, and a subtle dashed "flood line" marker just above the surface. Cheap per frame (only move objects).

### js/game/island.js (visuals agent)
```js
export function createIsland(scene)  // world-space visuals under the base: rocky island (layered rock polygons in greys/browns, some green fynbos tufts) centred at x = GAME_W/2 under world y 0, plus the concrete base platform look (grey slab with yellow/black hazard stripes on the edges) exactly covering the base body rect (width LAYOUT.baseWidth, height LAYOUT.baseHeight, top at y=0). Depths DEPTH.island / DEPTH.base. Draw once into generated textures/images. Must look fine when the camera zooms out to 0.25 (make rock extend wide/deep enough or fade into the sea).
```

### js/game/effects.js (visuals agent)
```js
export class Effects {
  constructor(scene, { reducedMotion })
  rating(block, rating, combo)  // world-space feedback at the block: 'P' => big "Perfek!"/"Perfek ×n!" text pop (S.perfect / S.perfectCombo), white outline flash expanding from the block's bounds (Stack style), sparkle burst; combo >= 3 adds a light screen flash. 'G' => smaller "Goed"; 'S' => "Skeef"; 'X' => red "Oeps!"
  floatText(x, y, text, { color = '#fff', size = 34 } = {})   // rises & fades (world space)
  dust(x, y, width)             // landing puffs
  splash(x, y)                  // water droplets
  flash(color = 0xffffff, alpha = 0.35, ms = 160)   // screen-space full-screen flash
  shake(intensity = 0.006, ms = 200)   // camera shake (skip/shrink when reducedMotion)
  sparkle(x, y, n = 12)
  destroy()
}
```
Text: Phaser Text with `FONT`, bold, white with dark stroke (COLORS.textStroke, thickness ~8), `resolution: 2`. Reuse a small pool of text objects for floatText to avoid churn.

### js/scenes/BgScene.js (visuals agent)
Key `'Bg'`, auto-starts. Screen-space only:
- Sky: vertical gradient whose colours depend on `registry 'altitudeM'`: 0 m `#5ec1f5→#c8ecfb`, 60 m `#2f86d8→#95cff4`, 160 m `#1b3f8f→#5a86c9`, 320 m+ `#0b1030→#2a2f6b`; blend toward storm grey `#3a4250→#6b7685` by `'skyDark'`. Redraw the gradient only when the colours change noticeably (or use a 1×N canvas texture stretched).
- Stars fade in above ~200 m (static dots, cheap, slight twinkle).
- Far scenery: stylised **Table Mountain (Tafelberg)** silhouette with Lion's Head + Devil's Peak, and a calm distant sea band, anchored near the bottom of the screen and sliding down (parallax 0.12) as altitude grows, so at height it's gone.
- 5–7 clouds (generated puff textures) at 2–3 parallax depths, drifting with `'wind'`, recycled when off-screen; thinning out above ~250 m.
- A few seagulls (tiny "v" sprites) at low altitude only, optional.
- Rainbow arc when `'rainbow'` > 0 (soft, alpha by value).
Reads registry each frame; must be cheap.

### js/scenes/GameScene.js (game agent) — the core loop
`init(data)`: `data = { mode: 'daily'|'practice'|'idle', seed, dayNumber, dateKey, settings: { sound, vibration, reducedMotion }, autoplay: 0|number }`.
- **idle** mode = attract mode behind the menu: island, base, crane swinging, autoplay drops a block every ~2.5 s with good aim, no HUD, no water, no weather, no scoring/bus result; after 10 blocks fade out and restart idle with a new random seed. Input ignored.
- **daily/practice**: launch `'Hud'` (`this.scene.launch('Hud')`), stop it on shutdown.

`create()`:
- `sequence = createSequence(seed)`; set engine iterations/gravity from PHYSICS; static base body (label 'base'); `createIsland(this)`; `new Water(this)`; `new Crane(this)`; `new Effects(this, …)`; `new Weather(this, sequence, { effects, audio, haptics, bus, reducedMotion })` (not in idle).
- Listen `this.matter.world.on('collisionstart', e => …)` — queue relevant pairs; process **after** the step (never mutate bodies inside the callback). For compound bodies use `pair.bodyA.parent`.
- Input: `this.input.on('pointerdown', () => this.tryDrop())` (also Space/Enter key for desktop).
- Spawn block 0 on the crane, show S.tapToDrop hint (HUD) until the first drop.
- `bus` listeners (remove on shutdown): `'game:quit'` → `endGame('quit')`; `'weather:rainbow'` → water.lower(...).
- `this.events.once('shutdown', cleanup)`.

`update(time, delta)` (clamp delta ≤ 100 ms):
1. Crane: `omega = min(CRANE.omegaMax, CRANE.omega0 + CRANE.omegaPerBlock * i) * weather.craneSpeedMul`; `crane.update(delta, { omega, windAccel: weather.windAccel })`.
2. Fixed-step physics with accumulator: while acc ≥ FIXED and steps < maxStepsPerFrame: `weather.beforeStep({ dynamicBlocks, falling })`; `this.matter.world.step(PHYSICS.fixedDtMs * timeScale)`; per-step bookkeeping (quietSteps for settle detection); process queued collisions.
3. Sync block images; lost detection; settle → maybe freeze; tower height; water; flood check; weather.update; camera; ghost; wobble/creak; HUD emit; registry writes.

**Drop** (`tryDrop`): ignore if no block on crane, game over, paused, or input locked. `pose = crane.release()`; world pos = (pose.x, pose.y + cam.scrollY); `new Block(this, spec, x, y, pose.angle)`; velocity = pose.v × CRANE.carry (px/s → `setVelocityPxS`); friction × weather.frictionMul; state 'falling'; `grid` push placeholder; blocksDropped++; `audio.play('drop')`, `haptics.tap()`. Daily: on the first drop `bus.emit('game:started', partialResult)` (main.js → store.startDaily).
**Landing**: first collisionstart between the falling block and the base or a non-lost tower block (ignore hail): support = that body (if several, the highest). If the falling block's bottom is within ~18 px below the support's top (i.e. it hit the top surface): dx = block.centerX − support.centerX (base centre = GAME_W/2).
- |dx| ≤ perfectTolPx → 'P': **snap** x to support centre (`Body.setPosition`), angle to support angle (0 for base), zero horizontal & angular velocity. combo++ (cap comboCap for scoring), perfects++. Points: base + perfectBonus × min(combo, comboCap) × weather.perfectMul. Every `heartEvery` consecutive perfects: lives = min(LIVES, lives+1), `S.extraLife` float + `audio heart`.
- |dx| ≤ goodTolPx → 'G' (base + goodBonus), combo = 0. Else 'S' (base), combo = 0.
- If it hit a side (not the top) → don't rate yet; keep waiting (rate 'S' when it settles on something, or it becomes lost).
- effects.rating, effects.dust, audio land {intensity from impact speed} + rating sound, haptics.perfect() on P. state 'landed'. Schedule the next block after `CRANE.respawnDelayMs`. Also schedule next if `CRANE.maxWaitMs` passes since the drop.
- Start the water when `blocksPlaced >= WATER.startAfterBlocks` (bus 'hud:toast' S.waterRising).
**Lost**: any non-frozen block with `top() > LAYOUT.baseTopY + 4` (fully below the base top — nothing can support it there) or |centerX − GAME_W/2| > GAME_W: mark lost once → lives−−, grid[idx]='X', combo=0, effects.rating(block,'X'), audio 'lost', haptics.lost(). Keep it falling; when it crosses the water surface → splash + audio 'splash' + destroy; also destroy when y > 1500. If it was the falling block, schedule the next block.
**Settle**: block (landed) with speed < PHYSICS.settle.speed and angularSpeed < settle.angularSpeed for settle.steps consecutive steps (or `body.isSleeping`) → 'settled'. Rate unrated landed blocks 'S' here.
**Freeze**: when a block has ≥ FREEZE_DEPTH newer blocks that are settled/frozen, and it is settled → `freeze()` (audio 'freeze' quietly, no more than one per frame).
**Height**: towerTopY = min `top()` over blocks in state landed/settled/frozen (or 0). heightPx = −towerTopY. `maxHeightM` = max over time of the height computed from **settled/frozen** blocks only.
**Wobble**: `wobble` 0..1 = smoothed max over dynamic tower blocks of (speed×6 + angularSpeed×150), ignoring the falling block. If > 0.35 → `audio.play('creak', { intensity })` (throttled), and when > 0.6 a tiny shake. Camera sway (visual only, skip if reducedMotion): `cam.setRotation(sin(t·1.6) × min(0.01, heightM × 0.00006))` when heightM > 15.
**Ghost**: an Image of the hanging block's texture, `setTintFill(0xffffff)`, alpha 0.28, depth DEPTH.ghost, at the predicted landing pose: simulate fall per step (vx, vy = pose.v·carry/60; each step: v *= (1 − frictionAir), vy += 0.001·gravityY·dt², vx += meanWindAccel/3600, x += vx, y += vy) until the block bottom reaches towerTopY (the top of the highest landed block); place it there (unrotated). Hidden when fogAlpha > 0.5, when no block on the crane, or in idle mode.
**Water/flood**: `water.update(delta, weather.waterSpeedMul)`. If `water.surfaceY < towerTopY` (water above the highest block) → `endGame('flood')`. HUD gets `waterDistM = (water.surfaceY − towerTopY)/PX_PER_M`; play `audio 'warning'` every ~1 s when distance < WATER.warnPx.
**Camera**: target scrollY as in "World model"; lerp factor `1 − exp(−dt·3.5)`.
**Next block**: i++, `weather.setBlockIndex(i)`, `crane.setBlock(spec, ensureTexture(this, spec), getGeometry(spec))`, pre-generate texture of block i+1, HUD next preview.
**Points float**: `effects.floatText` "+25" near the landed block.
**Game over** `endGame(reason)` once: lock input; `crane.setVisible(false)` (hide hanging block), ghost hidden; slow-mo (timeScale 0.35 for ~1 s); `audio.play('gameover')`; then a reveal: camera `zoomTo(z, 1400)` + `pan` to fit from tower top − 120 to base + 200 (z = min(1, H / span), ≥ 0.15), keep rotation 0; after ~2200 ms `bus.emit('game:over', result)`. For reason 'quit' skip the reveal and emit immediately. HUD hides.
**Pause**: `bus 'game:pause'` → `this.scene.pause()` + Hud pause; `'game:resume'` → resume (main.js handles via scene manager; GameScene just needs to tolerate it — reset the accumulator on resume to avoid a big catch-up step).
**Progress**: daily: after each landing/loss `bus.emit('game:progress', partialResult)`.
**Debug hooks**: `window.__stapel.scene = this` and `getState()` → `{ mode, i, score, heightM, maxHeightM, lives, combo, perfects, waterSurfaceY, towerTopY, active: weather.active?.type, over }`. **Autoplay** (`data.autoplay` > 0, or idle): when the ghost x is within 2 px of the support centre (or randomly with probability = autoplay error rate), call `tryDrop()`; `autoplay` value is an error rate 0..1 (0.0001 ≈ always perfect).

Results: `{ mode, dateKey, dayNumber, seed, reason, score, heightM: round1(maxHeightM), blocksPlaced, blocksDropped, perfects, maxCombo, grid: grid.join(''), weather: weather.seen, durationMs }`.

### js/scenes/HudScene.js (game agent)
Screen-space Phaser HUD, key `'Hud'`. Listens on `bus` (unsubscribe on shutdown):
- `'hud:state'` `{ heightM, score, lives, maxLives, combo, next: BlockSpec|null, weather: { type, blocksLeft }|null, waterDistM|null, wobble, mode, dayNumber }` — top-left: big height `fmtM` (≈56 px) + `⭐ score` below; next-block preview (texture scaled to fit 70×50) with `S.next`; top-right: hearts ❤️/🤍 (leave the top-right 96×96 corner free for the DOM pause button: hearts go below it); weather chip (emoji + name + blocksLeft) under the hearts; combo badge "🔥 ×n" when combo ≥ 2; bottom-centre water pill `S.waterBelow(fmtM(d))` turning orange/red when close; a slim wobble meter (green→red) on the left edge. Small top-centre label: `S.dailyN(n)` or `S.practiceLabel`.
- `'hud:banner'` `{ emoji, title, subtitle }` — big centred banner (emoji ~96 px, title ~52 px, subtitle ~26 px) that pops in, holds ~1.6 s, fades.
- `'hud:toast'` `{ text, color }` — short centred message.
- `'hud:hint'` `{ text|null }` — pulsing hint (S.tapToDrop) at ~45% height; null hides.
- `'hud:hide'` — fade everything out (game over).
Update texts only when values change.

### js/main.js (game agent)
- Build the Phaser game (config above). Create `store = createStore()`, `ui = createUI(bus)` (from js/ui/dom.js), apply settings to `audio`/`haptics`.
- On first `pointerdown`/`keydown` anywhere: `audio.unlock()`.
- `recoverUnfinished(today)` at boot → if any, `ui.toast(S.unfinished)`.
- Show the menu over the idle scene: `game.scene.start('Game', { mode: 'idle', seed: random })` then `ui.showMenu(menuModel())`.
- `menuModel()` = `{ dateKey, dayNumber, dateLabel: fmtDateKey(dateKey), forecast: sequence.forecast(5), today: store.getDaily(dateKey), stats: store.getStats(dateKey), settings, nextDayAt: nextDayTimestamp() }`.
- First visit (`!store.tutorialSeen()`): `ui.showHowTo(true)`; on `'ui:howto-closed'` mark seen.
- Bus wiring:
  - `'ui:play-daily'` → if today's entry exists & done → show results; else start Game `{ mode: 'daily', seed: seedFor(today), dayNumber, dateKey: today, settings }`, `ui.showInGame()`.
  - `'ui:play-practice'` → start Game `{ mode: 'practice', seed: 'oefen-' + random, … }`, `ui.showInGame()`.
  - `'game:started'` (daily) → `store.startDaily(dateKey, partial)`. `'game:progress'` → `store.saveDailyProgress`.
  - `'ui:pause'` → pause Game+Hud, `audio.suspend()`, `ui.showPause({ mode })`. `'ui:resume'` → resume, `audio.resume()`, `ui.showInGame()`. `'ui:quit'` → resume scenes then `bus.emit('game:quit')`.
  - `'game:over'` (result) → daily: `stats = store.finishDaily(dateKey, result)`; practice: `store.recordPractice(result)`. `audio.play('record')` on a new best. `ui.showResults({ result, stats|null, isNewBest, shareText: buildShareText(result, { url: siteUrl() }), nextDayAt, mode })`.
  - `'ui:home'` → stop Hud, restart Game in idle mode, `ui.showMenu(menuModel())`.
  - `'ui:settings'` (partial) → `store.setSettings`, apply to audio/haptics.
  - `'ui:day-rollover'` → refresh the menu model.
- `document.visibilitychange` hidden during play → same as `'ui:pause'`.
- `siteUrl()` = `location.origin + location.pathname` with `index.html` stripped (fallback `SITE_URL_FALLBACK` for `file:`).
- Resize: on `game.scale` `'resize'` and window resize, call `ui.layout(canvas.getBoundingClientRect())`.
- Register `sw.js` (only on https or localhost; skip when `?debug=1` or `?nosw=1`).
- Query params: `?debug=1` (fps meter; allows `?date=`), `?seed=…` (practice seed override), `?auto=<errorRate>` (autoplay for testing).
- Expose `window.__stapel = { game, bus, store, ui, audio }` (scene adds `.scene`).

### js/ui/dom.js + index.html + css/style.css (UI agent)
DOM overlay for menus/results (crisp text, real share buttons). `index.html` contains: `<div id="game"></div>` (Phaser parent), `<div id="ui">…screens…</div>` absolutely positioned **over the canvas rect** (main.js calls `ui.layout(rect)`), `<script src="lib/phaser.min.js"></script>` then `<script type="module" src="js/main.js"></script>`, meta viewport (`width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`), theme-color, manifest link, apple-touch-icon, `lang="af"`, description/OG meta in Afrikaans, a tiny inline loading splash, a `<noscript>` message, and a landscape "rotate your phone" overlay (CSS only, for small landscape screens).
```js
export function createUI(bus) -> {
  layout(rect),                 // position #ui exactly over the canvas; set CSS var --s = rect.width / 720 (all UI sizes scale with it)
  showMenu(model),              // model from main.js (see above)
  showHowTo(firstTime),         // emits 'ui:howto-closed' when closed
  showStats(stats),
  showPause({ mode }),          // daily: show S.quitWarnDaily
  showResults({ result, stats, isNewBest, shareText, nextDayAt, mode }),
  showInGame(),                 // hides screens; shows the round pause button (top-right, 64 px × --s, ⏸)
  hideAll(),
  toast(text, ms = 2200),
  setLoading(bool),
}
// emits: 'ui:play-daily', 'ui:play-practice', 'ui:pause', 'ui:resume', 'ui:quit', 'ui:home', 'ui:settings' ({sound}|{vibration}), 'ui:howto-closed', 'ui:day-rollover'
```
- **Menu**: logo "STAPEL" as letters on coloured blocks stacked slightly askew (CSS), tagline, the daily card (`S.dailyN(n)`, date label, forecast emoji strip with `S.forecast`, `S.sameForAll`), primary button `S.playToday` — or if today is done: ✅ `S.doneToday` with height/points, live countdown `S.nextTower` HH:MM:SS, `S.seeResult` button; secondary `S.practice` (+ `S.practiceSub`), `S.howTo`, `S.stats`; small sound 🔊/🔇 and vibration 📳 toggles; streak chip 🔥 n.
- **Results**: title by reason (`S.overLives`/`S.overFlood`/`S.overQuit` + sub), huge height `fmtM`, stats row (punte, blokke, perfek, beste kombo), `S.newRecord` badge if isNewBest, the emoji grid, weather emoji row, share buttons: `S.shareWhatsApp` (green), `S.share` (native, only shown when `navigator.share` exists), `S.copy`; (use `shareResult` from core/share.js; toast `S.copied`/`S.shared`); daily: streak + `S.nextTower` live countdown; buttons `S.practice`/`S.practiceAgain` and `S.home`. When the countdown hits 0 emit 'ui:day-rollover'.
- **Stats** overlay: played, current/max streak, best height, best score, total perfects, and a mini bar chart of the last 7 days' heights (pure CSS).
- **How-to**: `S.howToSteps` list with icons, button `S.howToGo`.
- **Pause**: `S.paused`, `S.resume`, `S.quit` (+ warning in daily).
- Toasts; `audio.play('click')` on buttons; call `audio.unlock()` on first pointerdown.
- Style: bright, rounded, chunky, playful (Stack/Wordle clean). Cards with soft shadows over the sky; big touch targets (≥ 48 CSS px); safe-area insets; `touch-action: manipulation`; no text selection; `prefers-reduced-motion` respected. Everything sized via `--s`. System font stack (`FONT` in config). When a screen is shown the overlay captures pointer events; during play `#ui` has `pointer-events: none` except the pause button so taps reach the canvas.
- `manifest.webmanifest`: name "Stapel", short_name "Stapel", lang "af", description = tagline, start_url "./", scope "./", display "standalone", orientation "portrait", theme/background colours, icons (192, 512, maskable 512, svg).
- `sw.js`: versioned cache (`stapel-v1.0.0`), precache all app files (index.html, css, every js file, lib/phaser.min.js, manifest, icons); **network-first** for same-origin GET with cache fallback (so updates arrive immediately, offline still works); skipWaiting + clients.claim; delete old caches.
- Icons: generate `icons/icon.svg` (stacked coloured blocks on a sky-blue rounded square), and PNGs `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `icons/apple-touch-icon.png` (180) by rendering the SVG in headless Chromium via Playwright (see "Testing").

---------------------------------------------------------------------------
## Testing tools available in this container
- Node 22 (`node --test`). Global Playwright: `import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';` launch with `{ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }` (WebGL works). Mobile viewport e.g. `{ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }`.
- Static server: `npx --no-install http-server -p <PORT> -s -c-1 /home/user/Toring &` — **pick a unique port per agent** (core 8201, audio 8202, ui 8203, visuals 8204, blocks 8205, game 8206, others 8210+) and kill it when done.
- Put any throwaway scripts/screenshots in your own scratch dir under `<SCRATCH>/<your-agent-name>/` — never in the repo.
- Do **not** run git commands that change state (no commit/checkout/reset/stash). The orchestrator commits.
