export const meta = {
  name: 'stapel-review',
  description: 'Six-lens review of Stapel (feel, bugs, daily fairness, mobile perf, Afrikaans, visual UX), then verify+fix, then regression QA',
  phases: [
    { title: 'Review', detail: '6 independent reviewers, each with a distinct lens, playtesting in headless Chromium' },
    { title: 'Fix', detail: 'one fixer verifies every finding and applies the confirmed ones' },
    { title: 'QA', detail: 'adversarial regression playtest after the fixes' },
  ],
}

const SP = '<SCRATCH>'
const CONTEXT = `Project: "Stapel" — a free Afrikaans block-stacking phone game (tagline "Stapel hoog. Staan sterk."), Phaser 3.90 with built-in Matter.js, plain ES modules, static site at the repo root /home/user/Toring (index.html at root, GitHub Pages from main under /Toring/). Design goals: Wordle (one Daaglikse Toring a day — same blocks AND weather for everyone, one scored try, streak, countdown, emoji share line for WhatsApp), Stack (instant one-finger play, bright "Perfek!" flash + combo bonus for dead-centre landings), Tower Bloxx (crane on top, tall tower, height in metres), Tricky Towers (weather events hit the tower, a rising flood line you must stay above), Jenga (wobble and tension of a tall tower). Constraints: shapes/colours drawn in code, emoji for weather, short WebAudio sounds, whole game < 3 MB, smooth 60 fps on a mid-range Android phone, portrait.
The original build spec is ${SP}/SPEC.md (read it). The game is fully implemented and integrated; integration notes are in ${SP}/integration/ (screenshots) — known open items from integration: real-device fps unverified; Phaser restart smoothing (fps.panicMax) could run the game at half speed for ~4 s after refocus on a 30 fps phone; awkward shapes (L/J single top cell, arch over J) can be rated Perfek and then tip; the idle attract tower is hidden behind the menu card; gust ghost error up to ~35 px; the flood rarely ends a game; SW cache name must be bumped per release; quitting practice with 0 blocks still offers sharing. The orchestrator also noticed weather.js uses Math.random for gust variation, hail positions etc. (daily fairness question).
Testing tools: node 22 (npm test). Playwright: import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'; launch args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']; mobile context { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }. Serve with: npx --no-install http-server -p <YOUR PORT> -s -c-1 /home/user/Toring & (kill it when done). Use ?nosw=1&debug=1; ?auto=<errorRate> autoplays; window.__stapel = { game, bus, store, ui, audio, scene } and scene.getState(). Headless rendering is software (~12–15 fps) so judge perf by CPU time per frame/overdraw analysis, not raw fps.
Put scratch scripts/screenshots ONLY in ${SP}/<your-name>/. Do NOT modify any repo file in this phase. No state-changing git commands.`

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'short slug' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          title: { type: 'string' },
          evidence: { type: 'string', description: 'How you know: repro steps, measurements, code refs (file:line), screenshot paths' },
          proposedFix: { type: 'string', description: 'Concrete change (values, code approach)' },
        },
        required: ['id', 'severity', 'file', 'title', 'evidence', 'proposedFix'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['findings', 'summary'],
}

const LENSES = [
  { key: 'feel', port: 8301, prompt: `LENS: gameplay feel & balance (you are a seasoned mobile game designer who loves Stack, Tower Bloxx, Tricky Towers and Jenga). Actually PLAY it: drive real taps at varied timings via Playwright (not only autoplay), and run many autoplay games at error rates 0.0001, 0.1, 0.25, 0.5 across several seeds and the daily seed; log game length (time, blocks), end reason (lives vs flood), heights, perfect rates, combos, hearts gained, per-weather outcomes. Judge: is the first 30 seconds instantly fun and readable? is the difficulty curve right (a typical daily should last ~2–5 min; skilled players shouldn't go forever; the flood line must create real pressure and end some games)? is the Perfek window fair given the ghost? does the crane speed ramp feel good? are weather events impactful but fair and distinguishable? does the Jenga wobble/tension come through (creaks, sway, near-collapses) without feeling random/unfair? Perfek-then-tip on awkward shapes — propose a fair rule (e.g. Perfek requires the block's support to be wide enough / snap only if stable, or rate after settling). Is the combo/heart economy meaningful? Is the score meaningful vs height? Give specific numeric tuning proposals (config.js keys, sequence.js weights) with your measured rationale.` },
  { key: 'bugs', port: 8302, prompt: `LENS: correctness & robustness code review (you are a meticulous senior engineer). Read GameScene.js, HudScene.js, main.js, weather.js, blocks.js, crane.js, water.js, effects.js, BgScene.js, ui/dom.js line by line and hunt for real bugs: state-machine holes (tap during respawn delay/game-over/reveal/pause, double endGame, quit during reveal, pause button during reveal, home during game, visibilitychange during the menu or results, day rollover mid-game, rapid scene restarts idle->daily->home->practice), timers or bus listeners or tweens surviving scene shutdown, collision bookkeeping errors (compound parent handling, rating twice, losing twice, hail interactions, block landing on a lost block or on the falling previous block), NaN/undefined paths, float accumulation, accumulator after pause, timeScale slow-mo leaks into the next game, camera rotation/zoom not reset on restart, registry values stale after restart (e.g. skyDark/rainbow stuck), DOM pause button visibility, results shown twice, store writes ordering. For each suspected bug, try to REPRODUCE it in the browser with a script (or prove it from code with exact line refs). Only report what you can substantiate.` },
  { key: 'daily', port: 8303, prompt: `LENS: Wordle-style daily integrity & data (you are the person who will be blamed if two friends in a WhatsApp group got different towers). Verify: the daily sequence (blocks, colours, scales, weather events with their dir/strength) is identical for everyone and every device: check every source of randomness/variation that affects gameplay of a daily — weather.js Math.random (gust strength variation, hail positions/velocities, lightning timing/target/impulse, gust flip timing), GameScene, crane phase/start position, anything depending on device height (computeGameHeight varies 1.6–2.2 aspect: does drop distance, spawn position, visible area, hail spawn x/y, fog band, camera behave identically in WORLD terms across 412x915, 360x640, 430x932, iPad-ish, desktop?), refresh rate (simulate 30/60/120 Hz rAF by overriding the time source or using page.clock if feasible, or reason from code: fixed-step physics, crane phase advance, timers using scene.time vs physics steps, water rise tied to wall clock). Propose making all gameplay-affecting variation deterministic from the daily seed (e.g. an rng fork per event) and frame-rate independent. Also audit: date/epoch numbering, local-midnight rollover (menu countdown hitting 0, playing across midnight — which date does the attempt count for?), one-try enforcement (reload mid-game, two tabs, quit, ?debug=1&date= abuse — debug must not write real stats), streak logic and its display, recoverUnfinished toast, stats correctness, share text exact format (decimal comma, NBSP rendering in WhatsApp — consider whether NBSP inside the share text is a problem), the share URL under /Toring/, navigator.share fallback order. Reproduce with node tests or browser scripts.` },
  { key: 'perf', port: 8304, prompt: `LENS: mobile performance & platform robustness (you are a mobile web perf engineer targeting a 2021 mid-range Android, e.g. Mali-G57 / Adreno 618, Chrome). Analyse: canvas backing size vs DPR (is 720xH upscaled and blurry or fine?), overdraw per frame (count full-screen or large layers: sky gradient, mountains, sea band, clouds, water body, fog/heat overlays, rain particles — estimate fill-rate cost and propose merging/culling/caching), number of draw calls / batch breaks (Graphics objects break batches; Text objects; tint fills), texture count and memory (blocks textures per shape/size/colour — is there unbounded growth over a long game?), per-frame JS (profile with performance.now around scene update via page.evaluate instrumentation, look for allocations, Array.from, closures in hot loops, registry.set every frame triggering events), Matter body count & sleeping, particle counts. Phaser config: fps/panicMax/smoothStep behaviour after tab switch on low-fps devices (read Phaser TimeStep source in ${SP}/phaserpkg/package/src/core/TimeStep.js), powerPreference, antialias, roundPixels, mipmaps, pixel art. Platform: WebGL context loss/restore handling, iOS Safari (audio unlock inside gesture, 100vh/dvh, safe areas, double-tap zoom, rubber-band overscroll/pull-to-refresh on Android Chrome, long-press context menu/selection, touch-action), orientation change mid-game, resize -> ui.layout, visibility pause stops the render loop (battery), service worker update flow (network-first works; cache version bump strategy; does a stale SW ever serve old JS with new HTML?), GitHub Pages subpath correctness (all URLs relative, manifest start_url/scope, SW scope). Measure what you can; give concrete fixes ranked by impact.` },
  { key: 'afrikaans', port: 8305, prompt: `LENS: Afrikaans language & copy (you are a first-language Afrikaans editor and game UX writer). Review EVERY player-facing string: js/core/strings.js, js/ui/dom.js (any inline text, aria-labels, titles), index.html (title, meta description, OG tags, noscript, splash, rotate message), manifest.webmanifest, HudScene/GameScene/weather/effects inline text, share text (js/core/share.js). Check spelling (incl. diacritics: beëindig, reën, Reënboog, ê, ô, ë), grammar, natural idiom (does it sound like a real Afrikaans game, warm and playful, not translated English?), consistency of terms (Perfek/Perfekte, kombo, reeks, punte/telling, toring/blok/blokke, hyskraan, vloed/vloedlyn/water), capitalisation, use of ’n, number/date formatting (decimal comma, NBSP), plural forms, and tone of game-over/flood messages. Also check there is NO leftover English visible to players anywhere (screenshot each screen to confirm, including toasts, aria labels and the how-to). Propose exact replacement strings (key: old -> new) with a one-line reason each. Keep the tagline exactly "Stapel hoog. Staan sterk."` },
  { key: 'visual', port: 8306, prompt: `LENS: visual & UX polish (you are a senior mobile game UI/UX designer). Screenshot every screen and many game states at 412x915 (DPR 2.625), 360x640 (DPR 3, short phone), 430x932, and desktop 1280x800: first visit how-to, menu (fresh, done-for-today, with streak), stats, pause, results (lives, flood, quit; short and long grids; new record), early game, hint, each weather type (banner + effect), Perfek combo flash, extra-life, flood danger, tall tower (40+ blocks), game-over reveal. View every screenshot. Judge legibility at phone size, hierarchy, clutter (e.g. HUD texts/hearts sitting on top of the yellow crane jib, the 'Volgende' preview, top-centre label), contrast, alignment, safe areas, overlapping elements, whether the falling block/ghost/tower top are ever obscured by HUD/banners/toasts, whether the idle attract tower behind the menu is visible at all (propose how to make the menu backdrop alive, e.g. idle camera framing so the island+tower show above/below the card), consistency between DOM UI style and in-game HUD style, juice (does Perfek feel bright and rewarding? is game over dramatic?), first-time user comprehension (does a new player understand ghost, hearts, flood line, weather chip?), accessibility (contrast ratios, focus states, reduced motion, colour-blind-safety of the 🟩🟨🟧🟥 grid). Give concrete, implementable fixes (positions in logical px, sizes, colours).` },
]

phase('Review')
const reviews = await parallel(LENSES.map(l => () =>
  agent(`${CONTEXT}\n\nYOUR NAME: review-${l.key}. YOUR PORT: ${l.port}.\n${l.prompt}\n\nReturn findings ranked most-severe first. Be specific and evidence-based; no generic advice. Quality over quantity, but don't omit real problems.`,
    { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS })
    .then(r => r ? { lens: l.key, ...r } : { lens: l.key, findings: [], summary: 'reviewer failed' })
))

const all = reviews.flatMap(r => (r.findings || []).map(f => ({ lens: r.lens, ...f })))
const order = { critical: 0, high: 1, medium: 2, low: 3 }
all.sort((a, b) => order[a.severity] - order[b.severity])
log(`Review produced ${all.length} findings: ` + ['critical','high','medium','low'].map(s => `${s} ${all.filter(f => f.severity === s).length}`).join(', '))

phase('Fix')
const fix = await agent(`${CONTEXT.replace('Do NOT modify any repo file in this phase. ', '')}

YOUR NAME: fixer. YOUR PORT: 8320. You now MAY edit any repo file.
Six independent reviewers produced these findings (most severe first). Reviewer summaries:
${reviews.map(r => `- ${r.lens}: ${r.summary}`).join('\n')}

Findings JSON:
${JSON.stringify(all, null, 1)}

Your job:
1. Deduplicate overlapping findings. For EACH finding decide: CONFIRMED (verify it yourself — reproduce or read the code), REFUTED (explain), or DEFERRED (only if it is genuinely out of scope, e.g. needs a physical device — explain). Default to fixing anything real; critical/high must all be resolved unless refuted.
2. Implement fixes with care for the whole design (keep the Wordle/Stack/Tower Bloxx/Tricky Towers/Jenga feel). Specific expectations unless you find a better approach:
   - Daily fairness: every gameplay-affecting random value in a daily (gust variation, hail spawn positions/velocities, lightning timing/impulses, anything else) must come from a deterministic rng derived from the sequence seed (e.g. createRng(seed).fork('weather-fx-' + event.start)), and be frame-rate independent (driven by physics steps or accumulated sim time, not wall-clock frame jitter). Cosmetic-only randomness (particles, sounds, idle mode, autoplay) can stay Math.random. Keep sequence.js outputs unchanged for existing seeds (golden test) unless a balance change is clearly needed — if you change the daily generation, update the golden test deliberately and say so.
   - Balance: apply the feel reviewer's measured tuning where it holds up in your own measurements; the flood must create genuine pressure and end some games; a typical daily ~2–5 min; Perfek-then-tip on awkward shapes made fair.
   - Make the menu backdrop alive if the visual reviewer proposes a sound approach.
   - Afrikaans copy fixes: apply them (keep the tagline exactly "Stapel hoog. Staan sterk.").
   - Bump the SW cache version (e.g. 'stapel-v1.0.1') and keep its precache list complete; keep VERSION in config.js in sync.
3. After fixing: npm test must pass (update/add tests for logic you change, e.g. a determinism test for weather fx rng if feasible in node); run the game in headless Chromium through: menu -> daily (real taps + autoplay) -> results -> home -> practice -> pause/resume -> quit, at 412x915 and 360x640, with zero console errors; re-measure the things you tuned; view screenshots of anything visual you changed (save to ${SP}/fixer/).
4. Repo hygiene: no scratch files in the repo; total size < 3 MB; no state-changing git commands.
Return a report: for each finding id -> status (fixed / refuted / deferred) + one line; list of files changed; test results; measurements before/after for tuned values; screenshots paths; anything you are unsure about.`, { label: 'fix', phase: 'Fix' })

phase('QA')
const qa = await agent(`${CONTEXT.replace('Do NOT modify any repo file in this phase. ', '')}

YOUR NAME: qa. YOUR PORT: 8330. You MAY edit repo files, but only to fix regressions or clear bugs you find (keep fixes minimal, and list them).
A fixer just applied many changes after a review. Fixer report:
${typeof fix === 'string' ? fix : JSON.stringify(fix)}

Be adversarial: try to break the game after these changes. Run npm test. Play full games in headless Chromium at 412x915 and 360x640 (real taps with varied timing, autoplay at error rates 0.0001/0.2/0.5, daily + practice), check zero console errors/warnings, check every screen visually (save screenshots to ${SP}/qa/ and view them), verify the daily is deterministic (run the same daily twice with the same scripted drop times and confirm identical weather fx: same hail positions, same gust pattern — compare logged values), verify one-try enforcement and streak after a simulated next day (?debug=1&date=... must not pollute real stats — check how that's handled), verify pause/resume/quit/home/visibility flows, restart scenes 6+ times and check for leaks (bus handlers, display list sizes, matter bodies, textures), check repo size < 3 MB, check index.html works under a sub-path (serve the PARENT directory /home/user so the game is at http://localhost:8330/Toring/ and confirm everything loads including the service worker and manifest icons).
Return: pass/fail per check, regressions found and what you fixed (file: change), and any remaining issues ranked.`, { label: 'qa', phase: 'QA' })

return { reviews, findingsCount: all.length, fix, qa }
