export const meta = {
  name: 'stapel-build',
  description: 'Build the Stapel Phaser game: parallel module implementation, then end-to-end integration + playtest',
  phases: [
    { title: 'Implement', detail: '6 agents write disjoint modules against SPEC.md' },
    { title: 'Integrate', detail: 'one agent wires everything, runs the game in headless Chromium, fixes bugs' },
  ],
}

const SP = '<SCRATCH>'
const COMMON = `You are one of six engineers building "Stapel", a free Afrikaans block-stacking phone game (Phaser 3.90 + built-in Matter.js, plain ES modules, served statically from the repo root /home/user/Toring for GitHub Pages).

FIRST read the authoritative spec: ${SP}/SPEC.md (all of it — it defines every module API, the file ownership map and testing tools). Then read the already-written shared files: js/config.js, js/core/strings.js, js/core/format.js, js/core/bus.js. Phaser source (for checking APIs) is unpacked at ${SP}/phaserpkg/package/src (e.g. src/physics/matter-js/, src/gameobjects/). Matter lives at src/physics/matter-js/lib.

Rules:
- Only create/edit the files you own (listed below). Other agents are writing the other files at the same time — code strictly against the APIs in SPEC.md. If you truly need a new constant or string, you MAY append (never rename/remove) to js/config.js or js/core/strings.js — keep such edits minimal and mention them in your report.
- Quality bar: this ships to real players on mid-range Android phones. Make it feel polished, juicy and bright, with zero console errors, 60 fps friendly (cached textures, no per-frame big Graphics redraws, few allocations per frame).
- All player-facing text is Afrikaans from strings.js. Numbers via format.js (decimal comma).
- Self-test your work (see SPEC "Testing tools"). Use your own port and your own scratch dir ${SP}/<your-name>/ for harness pages, scripts and screenshots — never put throwaway files in the repo. Look at your screenshots with the Read tool and iterate on visuals until they look good.
- No git commands that change state.
Return a concise report: files written, any API deviations from SPEC.md (ideally none), constants/strings you appended, how you tested, known issues / notes for the integrator.`

const REPORT = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    deviations: { type: 'array', items: { type: 'string' }, description: 'Any API differences from SPEC.md (empty if none)' },
    appended: { type: 'array', items: { type: 'string' }, description: 'Constants/strings appended to config.js/strings.js' },
    testing: { type: 'string' },
    notes: { type: 'string', description: 'Known issues, integration notes' },
  },
  required: ['files', 'deviations', 'appended', 'testing', 'notes'],
}

const TASKS = [
  {
    key: 'core',
    prompt: `${COMMON}

YOUR NAME: core. YOU OWN: js/core/rng.js, js/core/daily.js, js/core/sequence.js, js/core/storage.js, js/core/share.js, tests/*.test.js, package.json.

Implement the pure logic modules exactly per SPEC.md, then a thorough node test suite (node:test + node:assert/strict), runnable with \`npm test\` (package.json: {"name":"stapel","private":true,"type":"module","scripts":{"test":"node --test tests/"}} — keep it dependency-free). Tests must cover: rng determinism & distribution sanity & fork independence; dayNumber (epoch = #1, across DST changes — run the suite under TZ=Africa/Johannesburg, TZ=Europe/Amsterdam, TZ=America/New_York, TZ=Pacific/Auckland, TZ=UTC and make sure it passes in all), dateKeyFor local date, msUntilNextDay > 0 and <= 24h(+1h DST), addDays/daysBetween over month/year boundaries; sequence determinism (same seed => identical blocks/events regardless of call order; different seeds differ), block rules (i=0 plank scale 1, allowed shapes by index, no shape 3x in a row, no colour twice in a row, scale range), weather rules (first at 5, non-overlapping, gaps, durations, early types, rainbow only right after rain, no same type twice in a row, strength/dir ranges, eventAt correctness, forecast); storage with an in-memory backend AND a backend whose methods throw (must not crash), startDaily/saveDailyProgress/finishDaily idempotency, streak logic (consecutive, same day, gap, currentStreak display = 0 when broken), recoverUnfinished, history of 7 days, practice best; share text exact format for daily & practice (rows of 10, +N overflow, 🌊/💥 suffix, omitted 🔥 when maxCombo<2, omitted weather line when empty, decimal comma), whatsappUrl encoding. Run the suite and make it all pass. For shareResult (browser-only) guard every browser API access so importing in node works.`,
  },
  {
    key: 'audio',
    prompt: `${COMMON}

YOUR NAME: audio. YOU OWN: js/audio.js only.

Implement the WebAudio sound + haptics module per SPEC.md: every named sound procedurally synthesised (oscillators, filtered noise buffers created once and reused, ADSR envelopes, a master gain -> gentle DynamicsCompressor -> destination). Make them sound GOOD and characterful, game-feel quality: e.g. 'perfect' = bright bell/marimba chime (two detuned sines + quick harmonic) rising on a major pentatonic scale with the combo (wrap/octave sensibly at high combos), extra shimmer for combo>=3; 'land' = woody thud (pitched-down sine knock + short lowpassed noise), intensity/size change pitch & level; 'creak' = slow pitch-wobbling sawtooth through a resonant bandpass (wooden creak); 'thunder' = long-ish (≤1.2 s) lowpassed brown-noise rumble with crack at the start; 'splash' = noise burst bandpassed sweeping down; 'wind' = noise through a sweeping bandpass, gain swell; 'hail' = tiny high click; 'rainbow'/'record'/'heart' = cheerful arpeggios; 'gameover' = descending minor arpeggio; 'drop' = short whoosh/release click; 'click' = soft UI tick; 'warning' = two-tone alarm blip; 'zap' = crackly electric buzz; 'freeze' = soft low "set" tick; 'banner' = short sting; 'fog' = soft pad swell; 'heat' = shimmering high tremolo; 'good'/'skew'/'lost' as described. Keep each under ~1.2 s, voice-limit per name, throttle creak/hail/warning, and keep total active voices bounded. Use AudioParam scheduling (setValueAtTime/linearRamp/exponentialRamp to small >0 values) — no per-frame JS. Disconnect/stop nodes after they finish (onended) to avoid leaks. Honour enabled flag; suspend()/resume() for pause/tab-hidden; unlock() idempotent and safe on iOS (resume inside gesture, play a silent buffer once).
Haptics: navigator.vibrate patterns (tap ~10 ms, perfect [12, 40, 18], lost [60], heavy [30, 30, 80]); honour enabled flag; feature-detect.
Also export (for testing) a function \`renderSound(ctx, name, opts)\` that schedules a sound on any BaseAudioContext (the module's play() uses it internally) so it can be rendered with OfflineAudioContext.
TEST: in headless Chromium (Playwright, your own port), load a scratch page that imports js/audio.js, render EVERY sound (and perfect for combos 1..12) into an OfflineAudioContext, and verify: no exceptions, non-silent, peak < 1.0 (no clipping after the master chain), sensible duration, and print RMS/peak table so levels are balanced (perfect the most prominent, hail/click quiet). Also call play() for every name on a live context to ensure no errors. Iterate on levels until balanced.`,
  },
  {
    key: 'ui',
    prompt: `${COMMON}

YOUR NAME: ui. YOU OWN: index.html, css/style.css, js/ui/dom.js, manifest.webmanifest, sw.js, icons/* (svg + png), .nojekyll.

Build the DOM overlay UI per SPEC.md (menu, how-to, stats, pause, results with share buttons, toasts, pause button, rotate-phone overlay, loading splash) and the PWA files. It must look like a polished, joyful mobile game: chunky rounded buttons with a pressed state, bright palette matching config.js PALETTE (protea pink, karoo orange, sonneblom yellow, bosveld green, oseaan teal, jakaranda purple, hemel blue, klei red), soft card shadows over the sky, the "STAPEL" logo as letters on coloured blocks stacked slightly askew with a subtle wobble animation (disabled under prefers-reduced-motion), tagline "Stapel hoog. Staan sterk." All sizes scale with --s (rect.width/720) so it looks identical on any phone; respect safe-area insets; big touch targets. Use import { shareResult } from '../core/share.js' and import { audio } from '../audio.js' and strings/format from core (those modules are being written in parallel; code to the SPEC API). Countdown timers via setInterval only while visible; clear them when hidden. Accessible: real <button>s, aria-labels, focus styles, lang="af".
The results grid is the emoji grid (same mapping as share: RATING_EMOJI from config) and you should render it in rows of 10 like the share text.
index.html must work served from a sub-path (/Toring/): relative URLs only. The loading splash should be removed by main.js calling ui.setLoading(false) — also make it auto-hide via CSS if JS fails after a while is NOT needed; keep the <noscript> message.
sw.js: versioned (import nothing; hardcode 'stapel-v1.0.0' and the precache list of every app file per the ownership map in SPEC.md — js/main.js, js/config.js, js/audio.js, js/core/*.js (bus, format, strings, rng, daily, sequence, storage, share), js/ui/dom.js, js/game/*.js (blocks, weather, crane, water, effects, island), js/scenes/*.js (BgScene, GameScene, HudScene), lib/phaser.min.js, css/style.css, index.html, manifest.webmanifest, icons). Network-first for same-origin GET with cache fallback; use cache.addAll tolerant of a single missing file (add individually and ignore failures) so one 404 can't break install.
Icons: write icons/icon.svg (a cute stack of 4–5 slightly offset coloured blocks on a sky-blue rounded square, maybe a tiny crane hook) and render PNGs (192, 512, maskable 512 with safe padding, apple-touch-icon 180) with Playwright screenshots of the SVG in headless Chromium. Keep each PNG small (< 60 KB).
TEST: make a scratch harness page in your scratch dir that is served from the repo root server (copy it into the repo temporarily under a name like __ui_harness.html ONLY while testing and delete it afterwards) which imports js/ui/dom.js with stub data and calls each show* method; screenshot each screen at a 412x915 mobile viewport (deviceScaleFactor 2.625, isMobile, hasTouch) and at 360x740 and a desktop 1280x800 (letterboxed column), view them, and iterate until they look great. If the core/audio modules don't exist yet when you test, put minimal stub copies in your harness via an import map in the harness page (do NOT create those repo files yourself).`,
  },
  {
    key: 'visuals',
    prompt: `${COMMON}

YOUR NAME: visuals. YOU OWN: js/game/crane.js, js/game/water.js, js/game/effects.js, js/game/island.js, js/scenes/BgScene.js.

Implement these per SPEC.md with real art direction: everything drawn in code (Graphics -> generateTexture once, then Images/TileSprites), bright and clean like Stack/Tower Bloxx, readable on a small phone. Crane: classic yellow tower-crane jib (lattice triangles) across the top at LAYOUT.jibY with dark trolley and wheels, steel rope, a red/yellow hook; the hanging block swings convincingly (pendulum physics described in SPEC). Water: inviting cartoon sea with animated wave strip, foam line and translucency; a dashed "vloedlyn" marker. Island: rocky Cape coastline island with fynbos tufts, concrete base platform with hazard stripes, exactly matching the base body rect (top at world y=0, width LAYOUT.baseWidth, height LAYOUT.baseHeight, centred at GAME_W/2). BgScene: altitude-driven sky gradient, Table Mountain (Tafelberg) + Lion's Head + Devil's Peak silhouette with a distant sea band, parallax clouds drifting with registry 'wind', stars at altitude, rainbow arc on registry 'rainbow', storm darkening by 'skyDark'. Effects: juicy "Perfek!" pop (scale bounce, colour by combo), Stack-style white outline flash expanding from the block bounds, sparkle particles (Phaser 3.60+ particle API: this.add.particles(x, y, key, config) returns an emitter; use explode()), dust puffs, splash, screen flash, camera shake honouring reducedMotion, pooled float texts. Effects.rating takes a Block (see blocks.js API in SPEC: block.left()/right()/top()/bottom()/centerX(), block.image).
Generated texture keys must be namespaced (e.g. 'fx_spark', 'bg_cloud_0', 'crane_jib') and created only if !scene.textures.exists(key) (scenes restart often).
TEST: build a scratch harness (a page under the repo root temporarily, e.g. __vis_harness.html, deleted afterwards — or serve your scratch dir with Phaser copied) that runs a Phaser game with BgScene + a test scene that uses Crane (with a placeholder rectangle texture for the block), Water (rising), createIsland, and fires every Effects method; set registry altitude 0/80/200/400 and skyDark/rainbow/wind values; take screenshots at 720 x 1560 logical (mobile viewport 412x915) and also with camera zoom 0.25 to check the island/water extents. View the screenshots, iterate until it looks really good. Measure frame time in the harness (should be trivial).`,
  },
  {
    key: 'blocksweather',
    prompt: `${COMMON}

YOUR NAME: blocksweather. YOU OWN: js/game/blocks.js, js/game/weather.js.

Implement per SPEC.md. blocks.js: shape geometry (all 11 shapes), texture art (bright Stack-like colours from PALETTE with light top band, dark bottom band, outline, seams between cells, subtle per-shape detail), exact centroid origin, compound Matter bodies via Phaser.Physics.Matter.Matter (Body.create({ parts })), wedge via Bodies.fromVertices or Bodies.trapezoid (convex), Block class with the full API. Verify image/body alignment precisely: in a harness, enable Matter debug rendering (or draw body vertices yourself) over the textures for every shape at several angles and confirm they coincide pixel-accurately. Verify stacking stability: stack 12–15 mixed blocks (centred, slightly offset) with the PHYSICS config (fixed 60 Hz manual steps, sleeping on, iterations from config) and confirm a perfectly centred stack stays stable for 30 s of simulation without drifting/jittering, while a badly offset block topples convincingly. If you find better material values for stability/feel, change them in js/config.js PHYSICS (note it in your report).
weather.js: all 8 event types with the effects in SPEC.md, visuals in screen space (scrollFactor 0) — rain streak particles slanted by wind, wind streaks, fog bands/puffs, heat shimmer overlay, lightning warning cloud + jagged bolt + flash, hail bodies (physical, small, bouncy; don't collide with each other), registry writes ('skyDark', 'wind', 'rainbow'), banner/sound triggers via the injected bus/audio/haptics/effects (these come from other agents — stub them in your harness). Particle budgets small. Clean destroy().
TEST: a scratch Phaser harness page (temporarily under the repo root, deleted afterwards) with a matter scene that builds a small tower and cycles through every weather type (call setBlockIndex with a fake sequence whose eventAt returns each type), steps physics manually like the real GameScene (beforeStep then world.step(fixedDt)), screenshot each event at a 412x915 mobile viewport, view the screenshots and iterate until they look great. Confirm wind pushes falling blocks by roughly the expected amount, rain friction applies, hail collides with the tower and gets cleaned up, lightning knocks the top dynamic block, destroy() leaves no objects behind.`,
  },
  {
    key: 'game',
    prompt: `${COMMON}

YOUR NAME: game. YOU OWN: js/scenes/GameScene.js, js/scenes/HudScene.js, js/main.js.

You build the heart of the game: the core loop exactly as specified in SPEC.md (fixed-step manual Matter stepping, crane, drop, landing detection via collision queue processed after the step, Perfek snap + combo + hearts, ratings, lost detection, settle + cement freeze, tower height, rising water + flood game over, weather integration, camera follow with constant drop line, landing ghost prediction, wobble/creak + subtle camera sway, idle attract mode, autoplay for testing, slow-mo + zoom-out reveal at game over, progress/result events), the HUD scene, and main.js wiring (Phaser config, store, UI, bus events, pause/visibility, settings, service worker registration, debug hooks, resize -> ui.layout).
The other modules (blocks, weather, crane, water, effects, island, BgScene, audio, ui/dom, core/*) are being written right now by other agents against the same SPEC — import and call them exactly as the SPEC says. While they don't exist yet, you can test your logic with temporary stub modules in your scratch dir served via an import map in a scratch harness page (never create the other agents' repo files yourself). Near the end, check whether the real files exist (ls js/game js/core js/ui js/scenes js/audio.js index.html); if they do, run the real game in headless Chromium (mobile viewport 412x915, deviceScaleFactor 2.625, isMobile, hasTouch) via http-server on your port: open index.html?auto=0.15&debug=1&nosw=1, click through the menu (or emit bus events via window.__stapel.bus), play a daily and a practice with autoplay, capture console errors and screenshots, and fix problems in YOUR files. Report problems you see in other agents' files precisely (file, symptom, suspected cause) instead of editing them.
Details to get right: process collisions only after world.step; for compound bodies use pair.bodyA.parent / pair.bodyB.parent; ignore 'hail' bodies for landing; never rate a block twice; never lose the same block twice; schedule exactly one next block per drop; handle a lost block that never touched the tower; endGame exactly once; remove every bus listener and timer on scene shutdown (scenes restart often: idle -> daily -> idle -> practice ...); reset the physics accumulator after pause/resume and when the tab was hidden; clamp delta. Keep per-frame allocations low (reuse arrays). The HUD must never overlap the DOM pause button (top-right 96x96 logical px).`,
  },
]

phase('Implement')
const reports = await parallel(TASKS.map(t => () =>
  agent(t.prompt, { label: `implement:${t.key}`, phase: 'Implement', schema: REPORT })
    .then(r => r ? { key: t.key, ...r } : { key: t.key, failed: true })
))

log('Implementation done: ' + reports.map(r => `${r.key}${r.failed ? ' (FAILED)' : ''}`).join(', '))

phase('Integrate')
const integration = await agent(`You are the integration lead for "Stapel", a free Afrikaans block-stacking phone game (Phaser 3.90 + built-in Matter.js, plain ES modules, static site at the repo root /home/user/Toring for GitHub Pages; index.html at the root).

Read the authoritative spec ${SP}/SPEC.md first. Six engineers just implemented the modules in parallel against it. Their reports:
${JSON.stringify(reports, null, 2)}

Your job: make the WHOLE game work end-to-end, polished, with zero console errors. You may edit ANY repo file now. Steps:
1. Read every file in js/, index.html, css/style.css, sw.js, manifest.webmanifest. Cross-check every import/export name and every call site against the actual implementations (not just the spec) — fix mismatches (wrong method names, argument shapes, missing exports, wrong relative paths, case-sensitive file names, missing files in the sw.js precache list).
2. Run the unit tests (npm test) and fix failures.
3. Serve the repo (npx --no-install http-server -p 8220 -s -c-1 /home/user/Toring &) and drive it with Playwright (import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'; launch args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']; mobile context viewport 412x915, deviceScaleFactor 2.625, isMobile, hasTouch). Use ?nosw=1&debug=1. Collect ALL console errors/warnings and page errors. Exercise: first visit (how-to shows), close it, menu renders over the idle attract scene, start the daily, real taps on the canvas (page.touchscreen.tap / mouse click) drop blocks, then autoplay (?auto=0.2 or window.__stapel) through several weather events until game over by lives and (separately) by flood (you can let water win by not dropping), results screen with grid + share text (check the text via the share module or the copy fallback), countdown ticks, home, practice, pause/resume, quit in daily (counts), reload mid-daily (recoverUnfinished -> counted + toast), second daily attempt blocked (shows results). Check localStorage contents make sense.
4. Take screenshots at key moments (menu, early game, Perfek flash, each weather type, tall tower ~30+ blocks, game-over reveal, results, stats, how-to) into ${SP}/integration/ and LOOK at them with the Read tool. Fix anything that looks broken, ugly, overlapping, cut off, unreadable, or not Afrikaans. Also check the 360x740 and desktop 1280x800 layouts.
5. Gameplay sanity: Perfek snapping works and combos/hearts count; blocks don't jitter or sink in a centred stack; frozen blocks stay put; ghost prediction matches where blocks actually land in calm air (measure the error over many drops; should be ~0–2 px); the camera keeps the tower top at the drop line; height in metres is right; the share text matches the spec format exactly; the game ends.
6. Performance: measure average frame time / fps in headless (with a 30+ block tower and rain) via requestAnimationFrame sampling; make sure per-frame work is light (no per-frame texture generation, no unbounded arrays, listeners cleaned up across scene restarts — restart idle/daily/practice several times and check counts of bus handlers / game objects / matter bodies don't grow).
7. Check total repo size < 3 MB (du -sh excluding .git).
Never put scratch files in the repo (delete any __harness files left by others). Do not run state-changing git commands.
Return a detailed report: what you fixed (file: change), test results, measured numbers (ghost error, fps/frame time, sizes), screenshots paths with one-line descriptions, and remaining issues/ideas ranked by importance.`, { label: 'integrate', phase: 'Integrate' })

return { reports, integration }
