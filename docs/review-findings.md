# Base-game review findings (2026-10-06)

Six independent reviewers (feel/balance, bugs, daily fairness, mobile performance, Afrikaans copy, visual UX) playtested and read the code.
A fixer agent then verified and fixed them; see the "Fixer status" section in `docs/HANDOVER.md` for what was fixed, refuted or deferred.

## Lens: bugs

I read every file in the brief line by line and found 5 bugs I could reproduce, listed most severe first. I reproduced 4 in headless Chromium on port 8302 (since stopped); the countdown one is proven from code (dom.js:356-370, main.js:232-234). Scripts and logs are in <SCRATCH>/review-bugs/ (t1–t9 .mjs, nat*/fw*/wx* .txt, prune-collapse.png).

1. **High – the tower collapses through its own cement.** pruneFrozenBodies (GameScene.js:888-900) removes the physics body of any cement block more than 160 px under the water, even while the 8 dynamic blocks still rest on it. In an A/B test from the same state, with the water 285 px (11.4 m) below the tower top, the shipped code dropped 7 blocks and ended the game as 'flood' within 52 frames. With pruning disabled the game carried on normally. The dynamic blocks only stay up when they happen to be asleep; wind or gust wakes them on every step.
2. **High – the daily is not the same for everyone.** weather.js uses Math.random for gust strength, hail timing and positions, and the lightning kick. With the same daily seed, identical perfect inputs and a fixed 60 Hz step, a seeded Math.random gave byte-identical runs twice (103.4 m, 51 blocks). A different seed gave 45.1 m, and native Math.random gave 41.1 m and 35.6 m. The runs split during the hail and storm events. This answers your Math.random question: it does break daily fairness.
3. **Medium – a lost daily can be saved as 'quit'.** The final daily result is only written when 'game:over' fires, 2.2 s after the game ends. If the app is closed or reloaded in that window, the 'lives'/'flood' result is stored as 'quit' and the next launch shows the "previous attempt not finished" toast. While the tab is hidden the 2.2 s does not count down, so the risk lasts until the player comes back.
4. **Low – `?auto=` works without `?debug=1`.** It also applies to the scored daily, so anyone can autoplay a near-perfect daily and share it as genuine.
5. **Low – the countdown sticks at 00:00:00 after midnight on the daily results screen.** The rollover event only refreshes the menu.

**Checked and found sound:**
- **Rapid restarts and listener leaks:** three rapid daily/practice → pause → resume → quit → home rounds left bus handlers at 17 and scene listeners unchanged, with no leftover timers. 'game:over' and the results screen fire exactly once per game.
- **Input during the reveal:** taps, Space, Escape, 'p' and 'ui:pause' are all ignored, and the pause button stays hidden through the reveal and results.
- **Reset on restart:** registry values (skyDark/rainbow/wind), camera zoom, rotation, effects and scroll, and timeScale all go back to their defaults. The HUD relaunches after "Oefen weer". One early test suggested it didn't, but that came from the shared machine being overloaded.
- **Pause:** the accumulator resets on resume and on the 'visible' event.
- **Collision bookkeeping:** compound bodies, hail, lost supports and double rating or loss are all guarded correctly.
- **Low frame rate:** a block still falling when the next one drops did not happen even at 5 fps.

I did not re-report the known integration items.

### [high] `cement-prune-collapse` — pruneFrozenBodies deletes the bodies of cement blocks that still hold up the 8 dynamic blocks, so the tower falls through itself and the flood ends the game early
- **File:** `js/scenes/GameScene.js`
- **Evidence:** GameScene.js:888-900. limit = min(water.surfaceY + 160, towerTopY + 2600) (line 889), and every frozen block whose top is below that limit has its body removed (line 895). Nothing checks whether a dynamic block is resting on it. FREEZE_DEPTH (config.js:98) keeps the newest 8 blocks dynamic, a band of about 300-600 px. So once the water is more than 160 px above the top cement block, that block's body is gone while the tower top is still a few hundred px above the water.

Repro t2_prune_ab.mjs, seed prune-a, perfect autoplay. I set the flood 200 px above the top cement block, which left it 285 px (11.4 m) BELOW the tower top, then kept building.
- A (shipped code): cement #0-#2 bodies pruned on the next prune tick. Blocks 3..9 then fell through ('lost#3..#9', grid PPPXXXXXXXP). The game ended with reason 'flood' after 52 frames.
- B (only pruneFrozenBodies stubbed out): same state, still playing after 720 frames, 3 lives, tower top -855, water -384, grid PPPPPPPPPPPPPP.

Seed stapel-2026-10-10 (t2b.mjs) behaves the same: A collapses and ends by 'flood', B keeps going.

Natural runs with faster water (t3c/t3d, seeds fw-*/wx-*) show the prune firing with a dynamic block resting directly on the removed body every time (log entries such as dynOnIt:[3], asleep:[true]). The band only stays up because those blocks happen to be asleep. Anything that wakes them makes it fall: wind and gust push every dynamic body on every step (weather.js:391-396, and the patched Sleeping wakes any body with force), as do a lightning kick or hail. Screenshot: scratchpad/review-bugs/prune-collapse.png. This is probably also part of why 'the flood rarely ends a game' fairly: when it does catch up, the tower collapses 6-18 m early.
- **Proposed fix:** Only prune cement that nothing dynamic can touch. Options:
(a) Compute the lowest dynamic bottom (max of b.bottom over this.dyn, plus the falling block) and use limit = Math.min(water.surfaceY + 160, lowestDynBottom + 200, towerTopY + 2600).
(b) Simpler: never prune the newest K frozen blocks (e.g. K = 12, more than any shape can bridge), i.e. stop the while-loop at this.frozen.length - K.
Keep the bodyRemoved flag. Add a regression test in the style of t2: put the flood 200 px above the top cement block with wind active and assert that no tower block is lost for 2 s.

### [high] `daily-weather-random` — The Daily Toring is not the same for everyone: weather physics uses Math.random, so identical play gives very different results
- **File:** `js/game/weather.js`
- **Evidence:** These Math.random calls change physics, not just visuals:
- Gust strength per flip: g.mul = rand(0.75, 1.25) (weather.js:459). It feeds the windAccel force applied in beforeStep.
- Hail spawn times (line 1021).
- Hail x, y, radius, velocity and spin (lines 1069-1084). Hail bodies hit the tower.
- Lightning kick: rand(2,4) x strength sideways and a random spin sign (lines 937-943). This decides whether the struck block falls.

Repro t6_determinism.mjs: daily seed stapel-2026-10-08, perfect autoplay, fixed 60 Hz headlessStep, Date.now pinned to the step clock (Phaser 3.90's TweenManager.getDelta uses Date.now).
- Math.random seeded(7), two runs: byte-identical, 51 blocks, 103.4 m, 5545 points, same grid. So the simulation is otherwise deterministic.
- Math.random seeded(8): 24 blocks, 45.1 m, 2175 points.
- Native Math.random: 41.1 m ('lives') in one run and 35.6 m ('flood') in another.

The divergence starts in the hail [15-19) and storm [21-25) events. Same blocks, same events, same taps: the height, score and share grid are decided by luck. The forecastWind ghost also assumes gMul = 1 (line 510), which adds to the known ghost error.
- **Proposed fix:** Give Weather a deterministic stream: this.rng = createRng(sequence.seed).fork('weather'). Derive per-event sub-streams so the draws do not depend on frame timing, e.g. evRng = this.rng.fork(`${ev.type}-${ev.start}`) in _startEvent.
Use it for:
- gust mul, indexed by flip count (evRng.fork('flip'+n) or a precomputed array);
- _planHail and _spawnHail (x/y/r/vx/spin);
- the strike kick and spin sign (per strike index).
Keep Math.random only for purely visual pools (rain, streaks, fog puffs, bolt jag). With precomputed gust muls, forecastWind can also read the real future mul instead of 1.

### [medium] `daily-final-not-persisted-during-reveal` — A daily that ends by lives or flood is saved as 'quit' if the app is closed, reloaded or backgrounded during the 2.2 s reveal
- **File:** `js/scenes/GameScene.js`
- **Evidence:** Why it happens:
- endGame only schedules bus.emit('game:over') after OVER_EMIT_MS = 2200 on the scene clock (GameScene.js:1271-1272).
- emitProgress is suppressed once over (lines 1196-1198), and the flood path never emits progress.
- main.js:247-253 calls store.finishDaily only on game:over.
- While the tab is hidden the Phaser loop sleeps, so the 2.2 s does not elapse until the player comes back.
- If the page dies first, store.recoverUnfinished at the next boot finalises the 'playing' entry with reason 'quit'.

Repro t8_reload_reveal.mjs (?date=2026-10-08, daily, fast-forward to over, then reload):
- engine result at endGame: reason 'lives', grid SSSXXXX, 6.8 m
- stored at endGame: status 'playing', reason 'quit'
- after reload: status 'done', reason 'quit', and the toast 'Jou vorige poging is nie klaargemaak nie en het getel.'

The share line then loses the 💥/🌊 ending, the results title becomes 'Poging beëindig', and the player is told they did not finish. Closing or swiping away the app right after seeing the crash is a very natural action on a phone.
- **Proposed fix:** Persist the final result at endGame time and keep the 2.2 s delay only for showing results. For example, in endGame emit bus.emit('game:final', result) immediately (or emitProgress with the final reason, bypassing the over guard). main.js would call store.finishDaily (daily) or recordPractice there and keep the returned stats/isNewBest. On the delayed 'game:over' it only calls ui.showResults with the cached values. finishDaily is already idempotent.

### [low] `auto-param-not-debug-gated` — ?auto= autoplay is accepted without ?debug=1, including in the scored daily
- **File:** `js/main.js`
- **Evidence:** main.js:25: const AUTO = params.has('auto') ? ... : 0 is not gated by DEBUG, unlike ?date= (line 23). playDaily passes autoplay: AUTO (line 148). Opening https://…/Toring/?auto=0.0001 therefore makes the Daily Toring play itself near-perfectly. In t6 the autoplay reached 51 blocks / 103 m. The result goes through game:started, game:progress and finishDaily, and is shared as a genuine daily.
- **Proposed fix:** const AUTO = DEBUG && params.has('auto') ? ... : 0. Alternatively, ignore autoplay for mode 'daily' unless DEBUG.

### [low] `results-countdown-stuck-after-midnight` — After midnight, the daily results screen shows 'Volgende toring 00:00:00' indefinitely
- **File:** `js/main.js`
- **Evidence:** dom.js:356-370: when the countdown reaches 0, tick() sets rolledFor, shows the 'new day' toast and emits 'ui:day-rollover'. main.js:232-234 only reacts when screen === 'menu'. On the daily results screen, st.nextDayAt is never advanced, and fmtClock clamps negative values (format.js:27). The countdown cells therefore read 00:00:00 until the player leaves the screen, and nothing on that screen offers the new tower.
- **Proposed fix:** In main's 'ui:day-rollover' handler, also handle screen === 'results'. Either re-run showDoneResults/showResults with nextDayAt = nextDayTimestamp(), or have dom.js set st.nextDayAt to the next midnight after a rollover, so the countdown restarts and stays consistent.

## Lens: feel

I measured about 1,500 simulated games, half with fixes applied in the page only. Three kinds of player: the built-in autoplay at error rates 0.0001, 0.1, 0.25 and 0.5; a human-timing model where taps land at the ghost crossing plus Gaussian error σ = 20, 35 or 50 ms after a 0.6–1.2 s reaction wait (σ20 ≈ expert, σ35 ≈ good, σ50 ≈ casual); and real page.touchscreen taps going through the DOM and Phaser into tryDrop. Seeds were 8–16 practice seeds plus 7–14 daily dates. Games ran on a fixed 60 Hz headless clock with Math.random seeded per game.

Harness note for other reviewers: Phaser 3.90 tweens run on Date.now (wall clock). In a fast-forward run the crane drop-in tween and the effect pops therefore run at wall speed. I re-ran the key sweeps with Date.now tied to the simulated clock and the conclusions did not change.

**Main problem: the daily is about 1 minute long and almost always ends because the tower collapses on its own.** Baseline with the corrected clock, 24 games per player type:

| Player | Median game | p90 | Ending |
|---|---|---|---|
| Expert (σ20) | 60 s | 88 s | |
| Good (σ35) | 56 s | 74 s | |
| Casual (σ50) | 47 s | 69 s | |
| Perfect autoplay (0.0001) | 85 s | 120 s | |
| All 96 games | | | 95 end by lives, 1 by flood |

- About 3.3 of every 10 dropped blocks end up in the sea.
- 45–67% of lost lives come from collapses where the lowest block that fell had landed with its centre inside the inner half of its support.
- The flood ended 4 of 240 baseline games.
- A good player sees the 4th forecast weather event in 4% of games and never sees the 5th.

**Fixes tested (in-page patches only, no repo edits):**
- A Perfek freezes every block below it.
- A 'Goed' landing is eased onto the support centre.
- A block that is falling when a collapse happens does not cost an extra life.
- A heart for every 4th Perfek (counted in total, not in a row).
- No narrow shapes before block 25.
- `omegaPerBlock` 0.02 instead of 0.03.
- `WATER` v0 6 and accel 0.14.

With all of these:

| Player | Median game | p90 / max | Games ended by flood |
|---|---|---|---|
| Expert | 129 s | p90 174 s | 67% |
| Good | 100 s | p90 150 s | 25% |
| Casual | 96 s | | 21% |
| Perfect autoplay | 144 s | max 269 s | 17% |

Blocks lost drop to about 1.6 per 10. A Perfek on an L/J/T support is later lost 14% of the time instead of 58%. A good player now reaches the 4th weather event in 71% of games. The losses that remain are mostly the player's own 'Skeef' drops sliding off, which is fair.

**Autoplay sweep requested (older run, same pattern):**

| Error rate | Median game | Median height | Perfek rate | Endings |
|---|---|---|---|---|
| 0.0001 | 90 s | 64 m | 91% | all by lives |
| 0.1 | 75 s | 48 m | 82% | 1 of 30 by flood |
| 0.25 | 49 s | 27 m | 65% | 2 of 30 by flood |
| 0.5 | 33 s | 18 m | 48% | 1 of 30 by flood |

Even at 0.0001 the autoplay wasted 107–127 hearts that were earned while already on full lives.

**Smaller findings:**
- 59% of possible first-tap moments lose block 0.
- Perfek snaps blocks onto supports lying on their side or upside down.
- Hearts are almost never earned by human-like players.
- Storms, hail and gusts cost 3–4× more lives per drop than calm weather. Lightning is followed by a lost life within 3 s in 63% of strikes.
- The ghost cannot predict gust strength (a perfectly aimed bot gets Perfek 45–85% of the time in gusts).
- The creak plays about 30 times a minute, so it no longer reads as a warning.
- The tap hint and the weather banners cover the landing zone.
- Score and height rank players almost the same way (Spearman 0.91), which is acceptable.

Even with all fixes the good player's median is 100 s. Typical games will only reach the 2–5 minute target if `LIVES` goes from 3 to 4, which I did not test.

All scripts, raw JSON and screenshots are in <SCRATCH>/review-feel/. Baseline is ry_A.json, the fix package is ry_R1.json, and the causes analysis is an2.mjs / an3.mjs. My server on port 8301 is stopped, and I changed no repo files.

### [critical] `collapse-dominated-short-daily` — Well-placed towers collapse on their own, so games last about a minute and almost always end by lives, not the flood
- **File:** `js/scenes/GameScene.js`
- **Evidence:** Baseline, corrected clock, 24 games per player type (12 practice + 12 daily seeds), results in scratchpad/review-feel/ry_A.json:
- Median game: expert (σ20) 60 s (p90 88), good (σ35) 56 s (p90 74), casual (σ50) 47 s (p90 69), perfect autoplay 85 s (p90 120). 95 of 96 games end by lives.
- The older 240-game sweep (r_a.json, r_h2.json) matches: the flood ended only 4 of 240 games.
- Blocks lost per 10 dropped: 3.1–3.8 for humans.

Causes (an3.mjs, which classifies each life-costing collapse by the lowest block that fell):
- 67% / 45% / 47% of lives (σ20 / σ35 / σ50), and 62% for the perfect bot, came from a block whose centre was inside the inner half of its support.
- Only 4–19% were drops whose centre was past the support edge.

Mechanisms seen in tower traces (tr1.json, tr2.json):
1. Each 'Goed' leaves up to ±24 px of offset, and these add up into a staircase. In tr2 the column drifts x 360 → 339 → 331 → 312 → 291 → 283 over 9 'Goed' landings and then tips over a 60 px cube.
2. During wind, the lowest dynamic block creeps about 20 px and the 8-block dynamic column leans as one rigid piece (angle 0.013 → 0.05). Cement then sets it leaning (block 6 frozen at 0.021 rad), and the next landing (a 'Goed' T) brings down 9 blocks (tr1, t = 42–45 s).
3. A Perfek copies the support's tilt (GameScene.js:699), so a lean carries upward.

Even the 0.0001 autoplay (91% Perfek) loses 41% of its lives to collapses that start at a Perfek block.
- **Proposed fix:** Fix package, tested in-page (scratchpad harness.js `exp` hooks):
- (a) P-lock: on a 'P' in applyRating, freeze every non-frozen tower block below the new block (call freezeBlock). Perfek then means 'set solid' and the Jenga tension stays with 'Goed'/'Skeef' blocks.
- (b) Ease 'Goed' landings onto the support's top centre. Tested at 100%; apply it as a short corrective velocity over about 100 ms rather than a teleport. At 50% it already adds about 17 s to the good player's median.
- (c) The collapse forgiveness in finding 'double-charge'.
- (d) Heart every 4th Perfek (finding 'hearts').
- (e) Narrow shapes later (finding 'shape-unlock').

Results with a+b+c+d+e (ry_J.json):

| Player | Median game | Max |
|---|---|---|
| Expert | 122 s | |
| Good | 107 s | |
| Casual | 73 s | |
| Perfect bot | 173 s | 309 s |

Blocks lost fall to 1.5–2.1 per 10. Lives lost to well-placed collapses fall from 45% to 25% for the good player. The main cause becomes their own Skeef blocks sliding off (48%), which reads as fair.

Then apply the water and crane tuning from 'flood-never-bites'. FREEZE_DEPTH 8 → 4 on its own made no difference (experiment C: good player 59 s), so I don't recommend it as the lever.

### [high] `perfek-snap-rotated-support` — Perfek snaps blocks onto supports that are tilted, on their side or upside down, sometimes leaving the block floating
- **File:** `js/scenes/GameScene.js`
- **Evidence:** - supportTop() (GameScene.js:672-688) rotates the support's unrotated local top-centre by its current angle, and snapPerfect() (:691-704) copies that angle. A plank lying at 90° therefore has its 'top centre' on its side face.
- Repro (tilt_snap.mjs, shots/tilt-snap-1.png): plank on its end at x 300, angle 1.57. The target is x 320, y −100 (mid-height of its side). The next brick is rated 'Perfek ×2!' and placed at angle 1.57, standing on end beside the plank at mid-height, floating about 33 px above the base.
- In the sweeps, 29 of 1,089 autoplay Perfek landings and 6 of 286 human-model Perfek landings were on supports tilted more than 0.3 rad, up to 3.13 rad (a J on an upside-down T). 85 were on tilts above 0.05 rad.
- A real player aims at the visual top, so on these supports Perfek is unreachable and the 'target' looks wrong.
- **Proposed fix:** 1. Compute the support's top surface in world space: the topmost edge of the body's parts (or vertices) whose direction is within ±0.05 rad of horizontal. Use its midpoint as the target.
2. Allow 'P' and the snap only when |support angle mod the shape's symmetry| ≤ 0.05 rad (about 3°). Otherwise rate G/S by the AABB top-centre with no snap.
3. Snap the block's angle to 0, not to the support angle, so a lean does not carry upward.

### [high] `awkward-shape-perfek-tip` — Perfek on L/J/T, pillar or cube is later lost about half the time
- **File:** `js/scenes/GameScene.js`
- **Evidence:** Perfek landings later lost, by support shape (r_a + r_h2 + rx_A; 'lost within 4 s' / 'lost ever'):
- L: 10% / 58%; J: 17% / 57%; T: 11% / 49%; pillar: 4% / 33%; cube: 6% / 26%.
- Compare plank 4% / 11% and base 0%.
- By landing shape, a Perfek T is lost 53% of the time (20% within 4 s). It stands on its 44 px foot.

Causes:
- topCenterLocal (GameScene.js:76-111) correctly targets the L/J single 44 px top cell. But that makes every block above sit on a 44 px pedestal that is 44 px off the L's base axis.
- 'Goed' (up to 24 px) is wider than half of that pedestal (22 px).

With the P-lock rule (ry_R1.json), Perfek-then-lost drops from 58% to 14% on L/J/T and from 41% to 11% on pillar/cube.
- **Proposed fix:** Rule: 'Perfek sets the cement' (P-lock, finding 1a). The support chain under a Perfek becomes static immediately, so a Perfek can never be the root of a collapse. Only blocks placed on top of it can still tip.

Keep the snap over the L/J top cell. Also scale the rating windows to the support's narrowest load-bearing width W:
- perfect = min(8, 0.15·W)
- good = min(24, 0.3·W)

On an L top or a T foot (W = 44): P ≤ 6.6 px, G ≤ 13 px. A 22–24 px landing there shows 'Skeef', not 'Goed'.

I don't recommend 'rate after settling': it kills the instant Stack flash.

### [high] `double-charge-collapse` — A collapse charges two lives: one for the tower, one for the block already falling
- **File:** `js/scenes/GameScene.js`
- **Evidence:** - markLost (GameScene.js:773-777): 'a dropped block that misses the tower always costs its own' life.
- The next block spawns 350 ms after any loss (CRANE.respawnDelayMs) while the tower is still coming down. It is often dropped onto a top that is disappearing.
- 42 of 43 autoplay blocks that missed the tower entirely did so during or just after a tower collapse (dropped within 3 s of it or collapsing mid-fall). Each cost a separate life. Example from r_a.json, oefen-s2: block 21 dropped at 57.5 s, blocks 20 and 19 fell at 58.5–58.6 s, block 21 was lost at 59.3 s for another life.
- With collapse forgiveness alone (experiment B) the expert median rises from 69 s to 70 s and p90 from 80 s to 108 s; the perfect bot rises from 96 s to 105 s.
- **Proposed fix:** 1. In markLost, treat a falling block that is lost while now < collapseUntil, or that was dropped within COLLAPSE_MS before a tower loss, as part of the same collapse (no extra life).
2. After any tower loss, delay spawnBlock until no dynamic block moves faster than about 1 px/step, capped at about 2 s. This is Tower Bloxx style: the crane waits, and the player reads the collapse before aiming again.
3. Low priority: lost detection waits until a block is entirely below the base top (GameScene.js:802). A block falling off a 50 m tower takes about 1.5 s to get there, so 'Oeps!' and the heart loss arrive late and are clamped off-screen. Consider also marking a block lost when it is falling (vy > 4 px/step) more than about 150 px below its landing y.

### [high] `first-tap-loses-life` — The first natural tap usually costs a heart: 59% of possible first-tap moments lose block 0
- **File:** `js/config.js`
- **Evidence:** - first_tap.mjs: block 0 dropped at each moment from 0.35 s to 4.4 s after spawn, in 50 ms steps.
- 48 of 82 tap moments lost the plank. Every tap before 1.40 s lost it, because the ghost is at x 554–605 while the 300 px base spans 210–510.
- The safe window is roughly 1.45–2.2 s and 3.45–4.2 s.
- In the real-touch session (play_taps.mjs), the 'impatient' tap at 0.57 s gave 'Skeef', the block slid off ('Oeps!') and a heart was gone at 1.9 s into Daaglikse Toring #1.
- The cause is CRANE.amplitude 230 (config.js:75) from block 0 with 'tap anywhere' onboarding.
- **Proposed fix:** - Ramp the crane amplitude in: add CRANE.amplitudeStart: 110 and CRANE.amplitudePerBlock: 30, capped at amplitude 230. GameScene passes min(230, 110 + 30·i) to crane.update. With amplitude 110 the block-0 ghost stays over the base (about ±125 px with carry), so any tap lands.
- Also give 'first-block grace': losing block 0 costs no life.
- If you keep the full swing, start each spawn's trolley phase so the block is over the base.

### [high] `flood-never-bites` — The flood almost never matters; tuned water plus a slower crane ramp makes it end a share of games
- **File:** `js/config.js`
- **Evidence:** - Baseline: 4 of 240 games ended by flood.
- The closest the water ever gets is at its start: median gap 152–168 px, measured when it starts at block 3. After that it only falls further behind. Example (rx_H, perfect bot): at t = 278 s the water is still 965 px below.
- With the stability fixes the flood still ended only 2 of 96 games (ry_J).
- Water height ≈ 4t + 0.06t² px (WATER v0 4, accel 0.12). That only beats a 0.6–1.0 m/s builder after about 180–330 s.

Tested on top of the fixes:

| Variant | Expert | Good | Casual | Perfect bot |
|---|---|---|---|---|
| R0: omegaPerBlock 0.02 | 137 s (17% flood) | 115 s | 93 s | 182 s |
| R1: R0 + WATER v0 6, accel 0.14 (ry_R1) | 129 s, p90 174 (67% flood) | 100 s, p90 150 (25% flood) | 96 s (21% flood) | 144 s, p90 230, max 269 (17% flood) |
| R2: v0 8, accel 0.16 | 106 s (80–88% flood, too punishing) | 80 s | | |

With R1, the 'Bou vinniger' warning (water within 140 px) now fires in half of good-player games.
- **Proposed fix:** - WATER.v0 4 → 6, WATER.accel 0.12 → 0.14, keep vMax 60.
- CRANE.omegaPerBlock 0.03 → 0.02 and omegaMax 4.0 → 3.2. Ghost speed at the crossing was 410 px/s at block 0 and 640 px/s at blocks 30–39, so the Perfek window shrank from ±19.5 ms to ±12.5 ms. With 0.02 it is about ±15 ms at block 30.
- Ship these together with the stability fixes. Faster water alone only shortens games that are already too short.
- The water toast and warning blip at block 3 (about 8 s in, water about 6 m below) are a false alarm in the first minute. Toast when the gap first drops under about 2× warnPx instead.
- If the typical player's median should reach 2 minutes or more, the remaining lever is LIVES 3 → 4 (untested).

### [medium] `goed-misleading-narrow` — 'Goed' often lies: Goed landings on narrow supports are later lost 69–94% of the time
- **File:** `js/config.js`
- **Evidence:** Goed landings (8–24 px off) by support, human model, rx_A + r_h2 ('lost within 2.5 s' / 'lost ever'):
- cube 17% / 69%; pillar 17% / 69%; L 38% / 81%; J 31% / 94%; T 27% / 80%.
- Compare plank 4% / 19% and base 0%.

By landing offset across all supports:

| Offset | Lost within 2.5 s | Lost ever |
|---|---|---|
| 0–8 px | 2% | 15% |
| 8–16 px | 6% | 28% |
| 16–24 px | 12% | 34% |
| 24–32 px | 20% | 45% |

So the 'Goed' window (SCORING.goodTolPx 24, config.js:90) is not width-aware.
- **Proposed fix:** - Width-aware windows: perfectTol = min(SCORING.perfectTolPx, 0.15·W) and goodTol = min(SCORING.goodTolPx, 0.3·W), where W is the support's load-bearing width (L/J top cell, T foot, pillar 52, cube 60).
- Ease 'Goed' landings toward the centre (finding 1b), so a 'Goed' on a wide support is truly safe.
- Keep perfectTolPx 8 on wide supports. With the ghost accurate to a median 1.3 px (p90 2.7) in calm weather, the window is fair.

### [medium] `hearts-unreachable` — The heart economy doesn't work: humans almost never earn a heart, and the bot wastes most of its hearts
- **File:** `js/config.js`
- **Evidence:** - SCORING.heartEvery 5 consecutive Perfeks (config.js:95; GameScene.js:724).
- Baseline hearts earned: σ20 1 in 24 games, σ35 0, σ50 0. Median max combo is 2–4.
- The perfect bot earned 9 and hit the threshold 107 more times while already on full lives (ry_A.json).
- With a heart every 4th Perfek counted in total, not in a row (experiment heartTotal, ry_R1.json): σ20 29 hearts in 24 games (19 games with at least one), σ35 19 (15 games), σ50 17 (13 games). Few are wasted at full lives (13 / 5 / 3).
- **Proposed fix:** - Add SCORING.heartEveryPerfects: 4. It counts every Perfek since the last heart (not necessarily in a row) and resets when a heart is granted; Perfeks at full lives don't fill it.
- Show the progress as 4 small pips under the hearts.
- Keep the 5-in-a-row heart, or replace it with a score bonus, for the Stack-style chain fantasy.
- Consider making a combo of 3 or more pay a visible bonus (+50) so chains stay meaningful for humans.

### [medium] `weather-harsh-unseen` — Late weather is harsh (storm/hail/gust cost 3–4× calm) yet most players never reach it; the 5-event forecast over-promises
- **File:** `js/core/sequence.js`
- **Evidence:** Lives lost per 100 drops, human model, baseline (ry_A + r_h2):
- calm 11.3, rain 15.5, fog 19.8, heat 21.6, wind 27.5, rainbow 28.6, storm 40.0, hail 42.5, gust 43.2.
- Rainbow is meant as a reward but follows rain, so blocks made slippery in the rain fall during it.

Lightning:
- 17 of 27 strikes were followed by a lost life within 3 s (baseline). Impulse is rand(2,4) × strength at weather.js:940.
- The target always follows the current top block, so the player has nothing they can do about it.

What players reach:
- Good player: the 3rd forecast event in 38% of games, the 4th in 4%, the 5th never. 29% ever see storm, hail or gust (FIRST_EVENT_AT 5, LATE_FROM 15, sequence.js:45-46).
- With the fixes (ry_R1): 4th event 71%, 5th 42%. Storm 21, hail 19, gust 17 versus calm 7.1 lives per 100 drops. That is a healthy 2–3× gradient.
- **Proposed fix:** - Lightning impulse rand(2,4) → about 1.5–2.5 px/step, seeded.
- Make a Perfek top block 'grounded' (half impulse). This gives counterplay during the 2 s telegraph.
- Optionally strike only once per storm before block 20.
- Show `forecast(3)` instead of 5 on the menu card (main.js menuModel), or keep 5 only once the fixes land.
- Keep FIRST_EVENT_AT 5 and LATE_FROM 15 with the fixes; without them use 4 and 12.
- Note: sequence.js changes alter every daily including today's (#1 = 2026-10-06), so ship them at a day boundary.

### [medium] `gust-ghost-random` — Ghost can't predict gust strength; weather strengths come from Math.random, so the daily isn't the same for everyone
- **File:** `js/game/weather.js`
- **Evidence:** Landing error with perfect aim (autoplay 0.0001), median / p90 / Perfek rate:
- calm 1.3 / 2.7 px / 97%; wind 1.5 / 5.4 / 91%; gust 2.1 / 17.3 / 85%; hail 3.7 / 26.4 / 72%; storm 2.2 / 75.8 / 62% (the target is knocked away mid-fall).
- In the earlier r_a sweep, gust Perfek with perfect aim was 45%.

Cause:
- `g.mul = rand(0.75, 1.25)` (weather.js:459) is unknowable, and forecastWind assumes gMul = 1 (:510).
- Lightning velocity, spin sign (:940-943) and hail x/radius/velocity (:1069-1084) also use Math.random.

Fairness test (rfair.json), same daily and identical player inputs, only Math.random seed varied, 6 runs each:
- 2026-10-09 (no gust/storm/hail before block 33): max height 78.5–90.4 m. This spread is physics chaos alone.
- 2026-10-06 (gust at 17, storm at 24): 41.7–62.4 m.
- **Proposed fix:** - Give Weather a seeded rng per event: createRng(seed + ':' + ev.start), or sequence.rng.fork('wx' + ev.start).
- Pre-draw the gust multipliers per flip at event start, and use them in forecastWind. The ghost is then exact in gusts and the 'Perfek window' stays fair.
- Draw the lightning impulse and spin and the hail plan from the same rng.
- Keep Math.random for purely visual particles.

### [medium] `shape-unlock-early-narrow` — Narrow shapes (cube, pillar) arrive from block 4, and the collapses that start on them dominate
- **File:** `js/core/sequence.js`
- **Evidence:** - SHAPE_UNLOCK has cube and pillar at 4 and L/J/T at 12 (sequence.js:13-14).
- Support shapes under collapses with a 'Goed' or 'Perfek' root (human σ20, r_h2): pillar 16, cube 10, brick 9, crate 7, slab 7, L 5, J 4.
- Removing cube, pillar, L, J and T before block 25 (substituted by crate/brick/slab/arch) on top of the other fixes, experiment G vs F: σ35 median 74 s → 102 s, σ50 56 s → 71 s; σ20 111 s → 116 s.
- With heart-every-4: K (no unlock change) vs J — σ35 75 s → 107 s.
- **Proposed fix:** - SHAPE_UNLOCK: cube 4 → 12, pillar 4 → 12, wedge/arch stay at 4, L/J/T 12 → 20. I measured with all of them at 25, so 20–25 is the tested range.
- Lower the early weights: cube [1.5,2] → [0.6,2], pillar [1,1.6] → [0.5,1.6].
- Narrow blocks then become a mid-game spike instead of a first-minute hazard.
- Ship at a day boundary (it changes the daily).

### [low] `creak-noise` — Creak and shake fire almost all the time, so they no longer read as a tension spike
- **File:** `js/scenes/GameScene.js`
- **Evidence:** - Baseline: 27–34 creaks per minute (about one every 2 s).
- The wobble shake (threshold 0.6, GameScene.js:1160) is active 14–19% of play time.
- 37% of 2 s windows with no collapse in the following 2–4 s still contain a creak (threshold 0.35, :1156).
- The metric is speed·6 + angularSpeed·150, so 0.06 px/step (3.6 px/s) of post-landing settling already passes 0.35.
- With the stability fixes creaks fall to 15–21 per minute for humans and 7 per minute for the bot, still frequent.
- **Proposed fix:** - Creak threshold 0.35 → 0.6, shake threshold 0.6 → 0.9, WOBBLE_GRACE_MS 550 → 900.
- Better: drive creaks from the top section's tilt relative to the tower axis (CoM offset vs. the narrowest support's half-width) rather than speed. Creaks then predict real danger, which is the Jenga cue.
- The left-edge wobble meter could show that same balance value.

### [low] `first-30s-overlays` — In the first 30 s the tap hint and the weather banners cover the landing zone while the player is aiming
- **File:** `js/scenes/HudScene.js`
- **Evidence:** - The tap hint sits at H·0.45 (HudScene.js:196), which is about screen y 713 against the drop line at 760. It sits right on the block-0 landing spot and the faint ghost (shots/ghost-02.png).
- Weather banners pop when the block is attached, so exactly while the player aims. They are opaque cards over about 32–48% of the height (integration wx-wind-b.png, wx-storm-b.png); the tower top and ghost are at about 47.5%.
- In the first 15 s the player gets the hint, then 'Die water styg!' plus a warning blip at block 3 (water about 6 m below), then the first banner at block 5.
- **Proposed fix:** - Move the hint to about H·0.30, between the hook and the landing zone, or under the base.
- Place banners at about 62–68% height (over the sea), or shrink them to the HUD chip after about 0.8 s. Alternatively hold the next block's spawn until the banner has popped (about 400 ms).
- Delay the water toast as in 'flood-never-bites'.

## Lens: daily

Review of daily integrity for Stapel. No repo files were modified; scratch scripts and results are in <SCRATCH>/review-daily/ (t1, t3, t5, t5b, t7, t8, t8b, t9, t10, t11, t12 .mjs, plus streak_sim.mjs). npm test passes (79 tests, including 5 time zones). The server on port 8303 was stopped.

**Two friends get different towers.** The block sequence and the event schedule (type, start, end, dir, strength) are deterministic and identical everywhere: pure integer/IEEE maths and a golden test. What diverges is everything inside an event. Gust strength per flip, lightning kick size and spin, and the whole hail plan come from Math.random. In an A/B test with the same perfect autoplayer and the same state at the event start, these alone changed lives (1 vs 2) and score on 2026-10-06. On 2026-10-08 one run died in the hail/storm and the other survived (the two runs were 0.1 m apart before that event). Seeding Math.random globally is not enough, because visual particles draw from the same stream every frame. The fix is per-event seeded streams, keyed by flip, strike and stone index.

**Integrity holes in the URL parameters.**
- ?auto= works without debug: a zero-tap autoplay stored a real 45.4 m, 17× Perfek daily and offered it for sharing. ?seed=stapel-<date> lets anyone rehearse today's exact tower in practice.
- ?debug=1&date= writes real data, despite the README. Previewing a future day locks that day and freezes the streak at 1 for every real day until then. The cause is the monotonic lastDateKey; the same thing happens with a phone clock set ahead or eastward travel.

**Refresh rate.** Fixed-step physics, the water and the crane are frame-rate independent: identical landing x to 0.02 px at 30/60/90/120/144 Hz in calm and wind. But the drop samples the crane at the last rendered frame. At 30 Hz, Perfek is impossible on 15–55% of crane passes from block 20 up (21/38 passes at the speed cap), while at 120 Hz every pass has one. Separately, Phaser's panicMax cooldown gives 30 Hz devices 4 s of half-speed play after any app switch.

**Device height.** World geometry is identical on 412x915, 360x640, 430x932, an iPad size and desktop: scrollY is -760 and the drop is about 500 px everywhere. Hail spawn, fog bands, the lightning cloud and the camera are the same in world terms. Only the visible flood distance below the tower top differs (392 px vs 824 px); the HUD water pill shows the distance on every device.

**One try, dates, stats.**
- A second tab silently ends a running daily. The first tab keeps playing and shares a result that was never saved (33.5 m shared vs 9.1 m stored).
- The final result is saved 2.2 s late, and saved progress is always one block behind. A reload or tab kill during the reveal records 'quit' with less height, and there is no Back-button guard.
- Quitting before the first drop costs the day, while reloading before the first drop is free.
- Midnight rollover on the menu works. A game played across midnight counts for its start date, which is correct, but its results screen shows a misleading ~24 h countdown.
- Streak display, the 7-day history, best values and the recoverUnfinished toast otherwise behave as specified.

**Share.** The text matches the spec byte for byte. NBSP (U+00A0) in '37,5 m' and '1 240' is fine for WhatsApp: it shows as a normal space, keeps the unit from wrapping onto its own line, and encodes as %C2%A0 in wa.me links. siteUrl() strips index.html and the query, so ?debug and ?auto never leak into shared links. The buttons are WhatsApp (window.open, then location.href), native share (called synchronously in the click; AbortError counts as cancelled, other errors fall back to copy) and copy (clipboard, then execCommand). One last risk: there is no rules version in the seed or share text, so a future release served from mixed SW caches could hand out different towers without anyone noticing.

### [high] `weather-math-random` — In-event weather effects use Math.random, so the same daily plays out differently for each player
- **File:** `js/game/weather.js`
- **Evidence:** Every player gets the same block sequence and event schedule (type/start/end/dir/strength). What happens inside an event comes from unseeded Math.random: weather.js:459 sets the gust strength with `g.mul = rand(0.75, 1.25)` at every 1.2 s flip, which is ±25% force on the falling block and the tower. :940/:943 set the lightning kick to `dir * rand(2,4) * strength` px/step with a random spin sign. :1021 jitters hail spawn times. :1069-1084 pick hail x (55% within ±170 px of the top block, otherwise anywhere), spawn y, radius 6-8, vx, vy and spin at random.
Repro: scratchpad/review-daily/t7_weather_rng.mjs. Same daily, same deterministic autoplayer (auto=0.0001), fixed 60 Hz steps, with only Math.random reseeded when the event starts.
- 2026-10-06 gust@17: both runs are identical at block 17 (35.1 m, 17×P). Gust muls were [1, 1.086, 0.863, 1.066, …] in one run and [1, 0.788, 1.12, 0.973, …] in the other. After the event: lives 1 vs 2, score 2790 vs 2935.
- 2026-10-08 hail@15 + storm@21: hail x [32, 311, 280, …] vs [244, 480, 123, …]. Strike kicks were dvx 3.37/3.35 vs 2.43/2.94, with spin signs reversed. Run 1 ended with 0 lives at block 24; run 2 was alive at block 27. (The two runs were 0.1 m apart before the event.)
Seeding Math.random globally would not fix this. In t8_framerate.mjs, with a seeded global Math.random, the gust muls still differed by refresh rate (1.019 at 30 Hz, 0.923 at 60, 1.045 at 120, 0.988 at 144) because rain, streak and fog particles draw from the same stream every frame. The same release pose then landed at x 347.3-349.6 ('G') but was snapped 'P' at 144 Hz. With a constant mul (t8b_const.mjs) the spread was 0.6 px or less, so the RNG causes this, not the physics step.
- **Proposed fix:** Give gameplay randomness its own seeded streams, keyed by event and by index, never by frame. Leave purely visual effects (rain, streaks, fog puffs, bolt shape, ambient sound timing) on Math.random.
```js
import { createRng } from '../core/rng.js';
// _startEvent(ev):
this._evRng = createRng(`${this.sequence.seed}/wx/${ev.type}@${ev.start}`);
// gust flip k: mul = this._evRng.fork('gust' + k).float(0.75, 1.25)  (k = flip counter)
// strike n:   const r = this._evRng.fork('strike' + n); kick = r.float(2, 4); spin = r.chance(0.5) ? -1 : 1;
// _planHail: build the full stone list up front from this._evRng.fork('hail'):
//   { atMs, nearTop: r.chance(0.55), dx: r.float(-170,170), x: r.float(30,690), dy: r.float(30,90), r: r.float(6,8), vx: r.float(-0.6,0.6), vy: r.float(5,7), av: r.float(-0.2,0.2) }
```
Also drive the gust flip timer, the hail schedule and the storm warn/strike timers from simulated physics time (add FIXED in beforeStep) instead of frame dt, so they fall on the same physics step at every refresh rate. With the future muls known, forecastWind can use them instead of assuming 1, which also shrinks the known gust ghost error. Put the plan in a pure core helper (e.g. `weatherPlan(seed, ev)`) and add a golden node test, like the one for blocks.

### [high] `debug-date-writes-real-stats` — ?debug=1&date= writes real daily entries and stats: it locks that future day and freezes the streak (README says it doesn't save)
- **File:** `js/main.js`
- **Evidence:** The README says ?debug=1 with ?date= 'previews another day's tower without saving stats'. The code does save: main.js:23 lets DEBUG_DATE drive todayKey(), and main.js:38 uses the real `createStore()` (key 'stapel.v1').
Repro: t1_debug_writes.mjs. Playing `?debug=1&date=2026-10-20` and quitting stores `daily['2026-10-20'] = {status:'done', heightM:0, grid:'X'}` and stats `{played:1, streak:1, lastDateKey:'2026-10-20'}`. Back on the normal URL, the menu already shows streak 1 before today's game; displayStreak (storage.js:70) treats a future lastDateKey as current. After playing today, played is 2 but streak stays 1 and lastDateKey stays 2026-10-20, because storage.js:256 only updates the streak when `daysBetween(lastDateKey, dateKey) >= 0`.
streak_sim.mjs (14 consecutive real days afterwards): streak=1 every day from 10-06 to 10-19. On 10-20 the daily is LOCKED: the menu shows 'Klaar vir vandag' with the 1 m debug result. On 10-21 the streak becomes 2.
The same monotonic lastDateKey logic freezes a streak after any future-dated finish, such as a phone clock set ahead or a trip to an eastern time zone.
- **Proposed fix:** 1) Debug sessions never touch real data: `const store = createStore(DEBUG ? memoryBackend() : undefined)`, or a separate key such as 'stapel.v1.debug' via a store option, so flows still survive a reload.
2) Make storage robust: startDaily/finishEntry must not create an entry or change stats for `dateKey` later than the real `today()`. Derive the streak from the done entries, walking back day by day from the latest done date that is today or earlier, instead of keeping a monotonic `lastDateKey`. Keep the aggregated count in stats only as a cache.
3) Fix the README line.

### [high] `auto-and-seed-params-ungated` — ?auto= (and ?seed=) work without ?debug=1: anyone can autoplay the real daily and share it, or rehearse today's exact tower in practice
- **File:** `js/main.js`
- **Evidence:** main.js:25 `const AUTO = params.has('auto') ? … : 0` and main.js:148 passes `autoplay: AUTO` into the daily. Neither checks DEBUG, and the README documents `?auto=0.2`.
Repro: t1_debug_writes.mjs, run 2. Opening `?nosw=1&auto=0.0001` with zero taps stored a real daily: `{dateKey:'2026-10-06', heightM:45.4, perfects:17, maxCombo:20, score:3105}`. The results screen offered sharing. buildShareText gives 'Stapel #1 🏗️ 45,4 m / ⭐ 3 105 · 🎯 17× Perfek · 🔥 20' with nothing marking it as autoplayed.
main.js:24/158 accept any `?seed=` for practice, also without debug, and the daily seed is just 'stapel-' + date. So `?seed=stapel-2026-10-06` gives an unlimited practice copy of today's exact blocks AND weather schedule before the one scored try. The README also documents `?seed=abc`.
- **Proposed fix:** Honour `auto`, `seed` and `date` only when DEBUG is on, and combine that with the in-memory debug store from the previous finding: `const AUTO = DEBUG && params.has('auto') ? … : 0; const SEED_OVERRIDE = DEBUG ? params.get('seed') : null;`. Also namespace practice seeds in GameScene so a daily seed can never be typed into practice: `createSequence(this.mode === 'practice' ? 'oefen/' + seed : seed)`. If you want autoplay in non-debug builds for demos, force practice mode and never call finishDaily for it.

### [high] `refresh-rate-perfek-quantization` — The drop uses the crane pose from the last rendered frame, so on 30 Hz devices Perfek is impossible on many crane passes
- **File:** `js/scenes/GameScene.js`
- **Evidence:** Phaser dispatches touch input inside the DOM event (phaser.min.js onTouchStart → updateInputPlugins). tryDrop (GameScene.js:435) releases at `crane.getBlockPose()`, which crane.update() only advances once per frame. So the possible landing points form a grid spaced about A·ω/fps apart, and the Perfek window is only ±8 px (16 px wide).
Measured with t12_quant.mjs: predicted landing x checked every frame for 30 s, counting crane passes over the target where at least one frame falls within ±8 px.
- block 0, ω 1.55: 15/15 at 30 Hz, 14/14 at 60 Hz, 15/15 at 120 Hz
- block 20, ω 2.15: 18/21 at 30 Hz, 20/20 at 60 Hz, 21/21 at 120 Hz
- block 40, ω 2.75: 17/26 at 30 Hz, 26/26 at 60 Hz, 27/27 at 120 Hz
- block 60, ω 3.35: 18/32 at 30 Hz, 32/32 at 60 Hz, 32/32 at 120 Hz
- block 82, ω 4.0 (cap): 17/38 at 30 Hz (worst nearest frame 18.6 px), 32/38 at 60 Hz, 38/38 at 120 Hz
Perfek drives combo points, the rainbow ×2 bonus and extra hearts, so iPhones in Low Power Mode, battery-saver or struggling Androids (30 Hz) are capped well below 120 Hz phones on the same daily.
The physics itself is refresh-rate independent: for a fixed release pose, t8_framerate.mjs gives landing x identical to within 0.02 px in calm and wind at 30/60/90/120/144 Hz, and the water level matches to within 0.1 px after 60 s.
- **Proposed fix:** Release at the tap's real time, not at the last frame. In onPointerDown(pointer) or onKeyDrop(e), compute `lagMs = clamp((pointer.event?.timeStamp ?? performance.now()) - this.game.loop.now, 0, 1000/30)` and pass it to tryDrop. Add a non-mutating `crane.getBlockPose(lagMs)` that extrapolates: phase' = phase + ω·lag, tx' = W/2 + A·sin(phase'), tv' = A·ω·cos(phase'), θ' = θ + θ̇·lag (one or two pendulum substeps on copies of the state). release() should use the same lag. On screen the difference is under one frame of motion, and the landing grid becomes continuous on every display.

### [medium] `second-tab-kills-running-daily` — Opening Stapel in a second tab ends the daily running in the first; the first tab keeps playing and shows and shares a result that was never saved
- **File:** `js/main.js`
- **Evidence:** main.js:325 runs `store.recoverUnfinished()` at every boot, which turns any 'playing' entry into 'done/quit', including one that another tab is actively playing. Tapping a friend's WhatsApp link mid-game is enough to trigger it.
Repro: t3_tabs.mjs. Tab A (daily) reached 6 blocks / 9.1 m. Tab B opened and showed the toast 'Jou vorige poging … het getel'; storage held done/quit at 9.1 m. Tab A carried on to 16×P / 33.5 m / 2335 points; its saveDailyProgress calls were ignored and its finishDaily was not applied. Tab A's results screen and share text still show 33.5 m (from the in-memory result, main.js:262-266), while the stored result and stats say 9.1 m / 375 points.
If two tabs both start before either drops a block, both write progress into the same entry, the first to finish wins, and either tab can share its own unsaved result. That is two scored tries.
- **Proposed fix:** (a) Store a heartbeat on the playing entry (`lastSeenAt`, updated on progress and every ~2 s while unpaused). At boot, recover only entries whose heartbeat is older than ~15 s. Otherwise show 'speel reeds in ’n ander oortjie' and leave the entry alone, or use `navigator.locks.request('stapel-daily-'+dateKey, {ifAvailable:true})` to hold the attempt per tab.
(b) In the running tab, listen for `window` 'storage' events. When today's entry becomes 'done' from elsewhere, end the game and show the stored result.
(c) Have finishDaily return `applied`. When it is false, main.js should render results and share text from `store.getDaily(dateKey).result`, not from the in-memory result.

### [medium] `result-persistence-gaps` — Daily result saved late and one block behind: a reload or tab kill records 'quit' with a lower height; the Android back button burns the try
- **File:** `js/scenes/GameScene.js`
- **Evidence:** (1) The final result is only saved when `game:over` fires, which GameScene.js:1272 delays by 2.2 s (OVER_EMIT_MS). t5_progress.mjs: a flood game-over at 9.1 m, then a reload 1 s into the reveal (which is what an OS tab kill while switching to WhatsApp does), was stored as `{reason:'quit', heightM:6.7}`. The 🌊 and 2.4 m were lost.
(2) emitProgress fires only in land()/markLost() (lines 668/783), but maxHeightM is only raised when a block settles (line 920). So every saved snapshot is missing the last block. t5b.mjs: the last saved progress was 13.1 m while maxHeightM was 15.3 m. A recovered game (reload, back button, OS discard) loses a block.
(3) Nothing handles popstate or pagehide (grep finds none). On Android, Back mid-daily leaves or closes the PWA, and the next boot records the attempt as quit using the stale snapshot.
- **Proposed fix:** Emit the final result immediately in endGame (e.g. `bus.emit('game:ended', result)` → main.js calls finishDaily right away), and keep the delayed `game:over` for the UI reveal only. Call emitProgress whenever maxHeightM increases (in updateTowerHeight), and also on visibilitychange→hidden and pagehide. Guard Back during a daily: `history.pushState({stapel:'play'}, '')` when it starts, and on `popstate` while playing call pauseGame() and push the state again; pop it when the game ends.

### [medium] `phaser-cooldown-slowmo` — Fairness side of the known panicMax issue: on 30 Hz devices every app switch gives up to 4 s of half-speed play
- **File:** `js/main.js`
- **Evidence:** In Phaser's TimeStep.smoothDelta, resetDelta() (called on resume, focus and start) sets `_coolDown = panicMax` (120 frames), and while it is above 0, or while the window is unfocused, it uses `dt = min(dt, 16.67)`. GameScene.update consumes this smoothed delta.
t11_cooldown.mjs, after loop.resetDelta(), elapsed game time vs wall time:
- 30 Hz: 0.50 / 1.00 / 1.50 / 2.00 s of game time after 1 / 2 / 3 / 4 s of wall time
- 60 Hz: 1.00 / 2.00 / 3.00 / 4.00 s (unaffected)
The crane, the water and the physics all run at half speed, which makes aiming easier. A 30 Hz player can trigger it on demand: switch apps, come back, tap resume. 60 and 120 Hz players never get it.
- **Proposed fix:** Turn smoothing off in the game config, `fps: { smoothStep: false }` (this removes both the cooldown clamp and the unfocused clamp). Alternatively, use `this.game.loop.rawDelta` in GameScene.update. The existing MAX_FRAME_MS=100 clamp and resetClock()/skipFrame on resume already handle large jumps.

### [low] `quit-before-first-drop-counts` — Quitting the daily before the first drop counts as a 0 m attempt, while reloading before the first drop is free
- **File:** `js/main.js`
- **Evidence:** startDaily only runs on the first drop (GameScene.js:464), so a reload before that leaves no entry. But Pause → 'Hou op' before any drop emits game:over, and main.js:253 calls finishDaily.
t1_debug_writes.mjs, run 3: stored `{status:'done', heightM:0, grid:'', blocksDropped:0}`, stats `{played:1, streak:1}`. The share text then reads 'Stapel #1 🏗️ 0,0 m'. This is a dead end for anyone who opened the daily by mistake. It also lets a player keep a streak without stacking anything.
- **Proposed fix:** In main.js 'game:over', when `result.mode==='daily' && result.blocksDropped===0 && !store.getDaily(result.dateKey)`, treat it as aborted: no finishDaily, go back to the menu. Show S.quitWarnDaily only after the first drop (pass `started` into showPause).

### [low] `results-countdown-after-midnight` — A daily finished after midnight shows 'Volgende toring oor 23:59:xx' even though the next tower is already open
- **File:** `js/main.js`
- **Evidence:** t10_midnight.mjs (TZ Africa/Johannesburg):
- Rollover from the menu works: at 00:00:01 the menu changes from #1 to #2 and shows the '’n Nuwe toring wag!' toast.
- A daily #2 started at 23:59:50 and quit at 00:00:30 is correctly stored under 2026-10-07 and labelled #2, and the streak counts.
- But the results countdown shows '23:59:30', because main.js:267 uses `nextDayAt: nextDayTimestamp()` (the midnight after now). Tapping Tuis immediately offers #3. A player who trusts the countdown skips #3 and loses their streak.
- dom.js tick() emits 'ui:day-rollover' on the results screen, but main.js:232 ignores it unless the menu is showing.
- **Proposed fix:** For daily results, pass the midnight that ends the attempt's day: `nextDayAt: nextDayTimestamp(new Date(y, m-1, d))` built from result.dateKey (same in showDoneResults). When it is already in the past, render a 'Bou #N+1' button instead of the countdown. Handle 'ui:day-rollover' on the results screen by re-rendering the footer.

### [low] `rules-version-mixed-cache` — After a release, players on stale or mixed cached modules can silently get a different daily, and nothing in the share line reveals it
- **File:** `sw.js`
- **Evidence:** sw.js:85-115 races each request separately: network first, falling back to cache after 4 s. On slow mobile data, one page load can mix a cached old sequence.js/config.js with new files. The daily depends on more than sequence.js's tables: SHAPE_IDS order and PALETTE.length (config.js), block dimensions (blocks.js), and WEATHER_TUNING/PHYSICS. The golden test (tests/sequence.test.js:54) pins only daily #1's first 12 blocks and 4 events. Neither the seed (`'stapel-' + date`) nor the share text carries a rules version, so a WhatsApp group can't tell when two players had different towers. A mid-day deploy also changes conditions between morning and evening players.
- **Proposed fix:** Add `RULES_VERSION` to config.js. When a change affects dailies, bump it, include it in seedFor from a cutover date onward, and put it in the share URL (e.g. `…/Toring/?r=2`). In the SW, decide per client rather than per request: if the navigation is served from cache, serve that client's module requests from the same cache version. Deploy changes that affect dailies just before local midnight.

## Lens: afrikaans

I reviewed every player-facing string as a first-language Afrikaans editor. Sources: strings.js (S, WEATHER_INFO, SHAPE_NAMES), dom.js (inline text, aria-labels and titles), index.html (title, meta and OG tags, splash, rotate message, noscript), manifest.webmanifest, the HUD, Game and effects text, the weather banners, share.js and format.js. I also played through with Playwright on port 8305 (server stopped, repo untouched) and captured these screens: first-visit how-to, menu, empty stats, daily HUD (hint, water pill, weather chip, combo, Perfek, Goed, Skeef, Oeps), all 8 weather banners, toasts, daily pause, the lives game-over results, the copied toast, the done-for-today menu, stats with data, the practice flood results, practice pause and quit at 0 blocks, the landscape rotate overlay, and a 360 px results screen with the native share button. Screenshots and scripts are in <SCRATCH>/review-afrikaans/.

Leftover English: the only English a player can see is the 📅 icon in how-to step 7, which the Android emoji font draws as 'July 17' (Apple shows 'JUL 17'). There's none in the aria-labels, titles, toasts, HUD, banners, share text, manifest, noscript or rotate overlay; the only other English is the ?debug=1 fps overlay, which players never see. Swapping to 🗓️ fixes it.

What's already right:
- Diacritics: Reën, Reënboog, beëindig.
- The typographic ’n (U+2019) everywhere, with the next word capitalised when ’n starts a sentence ('’n Nuwe toring wag!', '’n Gratis…').
- Days and months capitalised, as Afrikaans does ('Dinsdag 6 Oktober 2026'), and the standard day abbreviations (Ma Di Wo Do Vr Sa So).
- Decimal comma ('33,5 m'), non-breaking spaces as thousands separators and before 'm', 'Tyd: 1 min 2 s'.
- Singular and plural ('nog 1 blok' / 'nog 4 blokke').
- lang="af" and og:locale af_ZA.
- The tagline is exactly 'Stapel hoog. Staan sterk.' everywhere.
- Most copy is warm and natural: 'Kom ons bou!', 'Oorstroom!', 'Die water het jou toring ingehaal.', 'Pasop vir die weerlig!', 'Die hyskraan jaag!', 'Klaar vir vandag!', 'Oeps!'.

Issues, worst first:
1. The 📅 English text above (high).
2. 'Dubbel bonus' should be 'Dubbele'; the rainbow banner also repeats the 'Die water sak!' toast shown at the same moment.
3. How-to step 2 uses the English-style plural 'Perfeks', the digit 'elke 5', and promises an 'ekstra' life that is really a lost one coming back (nothing happens at full lives).
4. 'Die toring het geval!' shows even when the tower is still standing and the run ended on missed drops (screenshot evidence).
5. 'Soveel as wat jy wil — tel nie' can be read as the order 'don't count'.
6. The recovered-daily toast is clunky.
7. Low priority:
   - The fog and rain banner subtitles leave one word alone on the second line.
   - How-to step 5 describes losing lives wrongly.
   - 'Volgende toring oor' sits under the clock on the results screen and ends on 'oor'.
   - Terms are inconsistent: punte vs telling, oefen vs oefenrondte, vloed vs vloedlyn.
   - The quit title 'Poging beëindig' is stiff and says 'Poging' in practice too.
   - Screen-reader labels read 'Oeps! 7' and a bare '–'.
   - A few small idiom fixes.

Each finding gives the exact replacement string and the reason.

### [high] `calendar-emoji-english` — How-to step 7 icon 📅 shows English text ('July 17') to every new player
- **File:** `js/core/strings.js`
- **Evidence:** strings.js:103 uses icon '📅'. Noto Color Emoji, the Android system font and the font in this container, draws it as a calendar page printed with 'July 17'. Apple's version shows 'JUL 17'. You can see it in a01-howto-first.png, which is the first screen a new player gets, and emo.png compares the alternatives. This was the only English I found anywhere players can see it: I checked the DOM text, every aria-label and title, the Phaser HUD and Game text, toasts, banners, the share text, index.html and the manifest.
- **Proposed fix:** howToSteps[6].icon: '📅' -> '🗓️'. The spiral calendar has no printed month name in either Noto or Apple (checked in emo.png).

### [medium] `dubbel-bonus-grammar` — Rainbow banner has a grammar error ('Dubbel bonus') and repeats the toast shown at the same moment
- **File:** `js/core/strings.js`
- **Evidence:** strings.js:121: desc 'Dubbel bonus vir Perfek — en die water sak!'. An adjective used before a noun must take -e in Afrikaans: 'dubbele bonus', like 'dubbele bed'. GameScene.js:404 also raises the toast S.waterRecede 'Die water sak!' at the same time as the banner, so the player reads 'die water sak' twice (b-05 in b-montage.png).
- **Proposed fix:** WEATHER_INFO.rainbow.desc: 'Dubbel bonus vir Perfek — en die water sak!' -> 'Dubbele punte vir elke Perfek!'. This fixes the inflection, drops the duplicate (the toast already covers the water), and at 30 characters it fits on one line.

### [medium] `howto-perfek-step` — How-to step 2: anglicised plural 'Perfeks', a digit in prose, and an inaccurate life rule
- **File:** `js/core/strings.js`
- **Evidence:** strings.js:98: 'Land dit reg in die middel vir ’n Perfek! Perfeks na mekaar bou ’n kombo vir ekstra punte — elke 5 gee jou ’n ekstra lewe.' (1) 'Perfeks' is an English -s plural. The game also uses 'Perfek' (results tile) and 'Perfekte blokke' (stats), so it shows three different forms. (2) 'elke 5' puts a digit in running text and doesn't say five of what. (3) GameScene.js:723 only gives a heart back when lives < LIVES, so at full lives five in a row gives nothing; it's not an 'ekstra' life. (4) Transitive 'Land dit' reads like a translation; Afrikaans would say 'laat ... land'.
- **Proposed fix:** howToSteps[1].text -> 'Laat die blok reg in die middel land vir ’n Perfek! Perfekte landings op ’n ry bou ’n kombo vir ekstra punte — en elke vyfde een gee ’n verlore lewe terug.'

### [medium] `overlives-title-false` — Game-over title 'Die toring het geval!' is wrong when the run ends because of missed drops
- **File:** `js/core/strings.js`
- **Evidence:** strings.js:63-64. Reason 'lives' fires when lives reach 0 (GameScene.js:784), and lives drop for any block that falls off, including a drop that misses the tower completely. In d-results-360-native.png the tower is still standing at 24,4 m and the grid shows scattered single 🟥 misses, yet the title says the tower fell.
- **Proposed fix:** overLives: 'Die toring het geval!' -> 'Jou lewens is op!' and overLivesSub: 'Geen lewens oor nie.' -> 'Te veel blokke het in die see geplons.' The new text is true in every case, and 'geplons' matches the splash the player has just seen.

### [medium] `practice-sub-ambiguous` — Practice button subtitle 'tel nie' can be read as an order ('don't count')
- **File:** `js/core/strings.js`
- **Evidence:** strings.js:18: practiceSub 'Soveel as wat jy wil — tel nie' appears under 'Oefen' on every menu (a03-menu.png). With no subject, 'tel nie' reads first as the imperative 'don't count!'. 'soveel as wat' is also wordier than it needs to be.
- **Proposed fix:** practiceSub: 'Soveel as wat jy wil — tel nie' -> 'Speel soveel jy wil — dit tel nie'

### [medium] `unfinished-toast` — Toast for a recovered unfinished daily is awkward and unclear
- **File:** `js/core/strings.js`
- **Evidence:** strings.js:30: 'Jou vorige poging is nie klaargemaak nie en het getel.' It wraps onto two lines over the Oefen button (integration/21-reload-recovered.png). 'klaargemaak' means finished off or prepared, not finished playing, and 'het getel' is unclear (counted what?). It's the first message a player sees after reopening the app mid-game.
- **Proposed fix:** unfinished -> 'Jou vorige poging is onderbreek, maar dit tel soos dit was.'

### [low] `banner-orphans` — Rain and fog banner subtitles wrap and leave one orphan word on line 2
- **File:** `js/core/strings.js`
- **Evidence:** In d-montage.png the fog subtitle wraps to '…waar dit gaan land / nie…', leaving the second 'nie' alone on its line. Rain wraps to '…die water styg / vinniger.' The banner has room for about 43 characters (the rainbow subtitle just fits on one line).
- **Proposed fix:** WEATHER_INFO.fog.desc: 'Jy kan nie mooi sien waar dit gaan land nie…' -> 'Jy sien skaars waar die blok gaan land…' (39 chars, no double negative to split). WEATHER_INFO.rain.desc: 'Glibberige blokke — en die water styg vinniger.' -> 'Glibberig! En die water styg vinniger.' (38 chars).

### [low] `howto-lives-inaccurate` — How-to step 5 doesn't describe how lives are actually lost
- **File:** `js/core/strings.js`
- **Evidence:** strings.js:101: 'Elke keer as blokke van die toring afval, kos dit een.' The game takes one life per lost block (GameScene markLost), not one per collapse, and a drop that misses the tower entirely also costs a life. 'kos dit een' is loose phrasing.
- **Proposed fix:** howToSteps[4].text -> 'Jy het drie lewens. Elke blok wat in die see beland, kos jou een.'

### [low] `countdown-caption-dangling` — 'Volgende toring oor' under the clock on the results screen ends on a dangling preposition
- **File:** `js/ui/dom.js`
- **Evidence:** dom.js:740-742 places S.nextTower as a caption under the time, so the result reads '03:37:47 / Volgende toring oor' (b-results.png, d-results-360-native.png). Before the time it works fine ('Volgende toring oor 03:37:39' on the menu, dom.js:373-375). Underneath, 'oor' has nothing to attach to.
- **Proposed fix:** Add key nextTowerCaption: 'tot die volgende toring' to strings.js and use it in dom.js:742 instead of S.nextTower. Keep nextTower for the inline menu countdown.

### [low] `term-consistency` — The same things are named inconsistently (punte vs telling, oefen vs oefenrondte, vloed vs vloedlyn)
- **File:** `js/core/strings.js`
- **Evidence:** (1) Score: 'Punte' on the results tile (strings.js:42) but 'Beste telling' in stats (:89). (2) Practice: HUD and results chip say 'Oefenrondte' (:51), but the share header is 'Stapel (oefen)' (:109). 'oefen' is the verb stem, not a noun. (3) Water: the how-to says 'vloedlyn' (:100), toasts say 'water', and the HUD pill says '🌊 Vloed 6,9 m onder' (:47), which is clipped and names a third concept.
- **Proposed fix:** bestScore: 'Beste telling' -> 'Meeste punte'. sharePracticeHead: 'Stapel (oefen)' -> 'Stapel (oefenrondte)'. waterBelow: (m) => `🌊 Vloed ${m} onder` -> (m) => `🌊 Vloedlyn ${m} onder` (3 extra characters; the pill already sizes itself to the text).

### [low] `quit-title-tone` — Quit result title is stiff and says 'Poging' in practice too
- **File:** `js/core/strings.js`
- **Evidence:** strings.js:67-68: 'Poging beëindig' / 'Jy het opgehou bou.' The spelling is correct (beëindig). But 'beëindig' sounds bureaucratic next to 'Oorstroom!', and 'Poging' belongs to the daily's 'een poging', yet it also shows when you quit a practice round (c04-results-quit-practice.png). The quit button 'Hou op' is fine because it matches 'ophou' in quitWarnDaily, so leave it.
- **Proposed fix:** overQuit: 'Poging beëindig' -> 'Bouwerk gestaak' and overQuitSub: 'Jy het opgehou bou.' -> 'Jy het die hyskraan afgeskakel.' This is a building-site joke that works for both daily and practice.

### [low] `a11y-labels` — Screen-reader labels read 'Oeps! 7' and a bare dash
- **File:** `js/ui/dom.js`
- **Evidence:** dom.js:636 builds the grid label from display strings: 'Perfek 6, Goed 6, Skeef 0, Oeps! 7' (RESULTS ARIA in the walk2 output). The exclamation 'Oeps!' isn't a count label. dom.js:569 bar labels read 'Wo: –' (STATS ARIA), and a screen reader says 'en-dash' or nothing.
- **Proposed fix:** Add keys lostCount: 'Verlore' and notPlayed: 'nie gespeel nie' to strings.js. In dom.js:636 use S.lostCount instead of S.lost, and in dom.js:569 use S.notPlayed instead of '–' in the aria-label only (keep the visible dash).

### [low] `small-idiom` — Small idiom fixes: 'Sien jou uitslag', 'Ekstra lewe!', 'stol ... dit'
- **File:** `js/core/strings.js`
- **Evidence:** strings.js:15 seeResult 'Sien jou uitslag' is a word-for-word copy of 'See your result'. strings.js:40 extraLife 'Ekstra lewe!' only shows when a lost heart comes back (GameScene.js:723, lives < LIVES), so it isn't extra. strings.js:102 'stol die blokke soos sement — bo bly dit wankelrig': 'stol' is used for liquids setting, and 'dit' has no clear antecedent after plural 'blokke'.
- **Proposed fix:** seeResult: 'Sien jou uitslag' -> 'Kyk na jou uitslag'. extraLife: 'Ekstra lewe!' -> '’n Lewe terug!'. howToSteps[5].text -> 'Onder in die toring word die blokke hard soos sement — bo bly die toring wankelrig.'

## Lens: perf

Per-frame cost is healthy; the serious problems are in platform handling and Phaser config. I measured with Playwright on a 412×915 viewport at DPR 2.625, using a fixed-60 Hz manual driver with gl.finish between frames and CDP profilers. JS time per frame on desktop is 0.2–0.5 ms for update and 0.9–1.5 ms for render recording, so roughly 4–7 ms on a 2021 mid-range phone. That is an estimate scaled from desktop; on-device fps is still unmeasured. A 4× CPU-throttle run gave median ≈3 ms but its p95/p99 were inflated by headless SwiftShader, so it is indicative only. Matter.js stays small: at most about 20 bodies, 6 awake and 15 pairs, costing 0.06–0.1 ms per step even with velocityIterations 50. Particle counts are modest. Writing the registry every frame is negligible (all emit() calls together ≈0.02 ms per frame). The block-texture cache is capped at 96, and I found no leaks over 12 game restarts or 30 simulated minutes of the idle attract mode. Overdraw at the 720×1584 backing size is 3.1× screen in clear weather and up to 5.0× in fog, which is acceptable at that resolution. On Android the user agent selects Phaser's MobilePipeline, which takes one draw call per texture switch: 40 draws per frame at baseline, rising with tower size. These checks passed: GitHub Pages subpath, manifest start_url/scope and service worker scope; the audio unlock (it also listens on pointerup, touchend and click, and handles iOS 'interrupted'); overscroll, pull-to-refresh, long-press and double-tap; and WebGL context restore, which Phaser handles. The problems found are below, most severe first. Scratch scripts and screenshots are in <SCRATCH>/review-perf/ (t1–t31). No repo files were changed.

### [high] `rotation-stale-fit` — After a phone rotation the canvas stays sized for the previous orientation (a Phaser 3.90 bug), so the game is tiny or overflows until the next resize
- **File:** `js/main.js`
- **Evidence:** Script t10_rot.mjs: portrait → landscape → portrait. In landscape the canvas is still 412×906.4 (portrait fit, overflowing a 412-px-tall viewport). Back in portrait it stays at 187.3×412 CSS px, centred, for at least 5 s with the 500 ms poll running (parentSize is already 412×915). Calling game.scale.refresh() by hand fixes it at once. Script t11_rot2.mjs shows the cause: Phaser's own orientationChange listener (src/scale/ScaleManager.js:1531-1538) calls refresh() while parentSize is still the old value, and updateScale() then refreshes parentSize at its end (getParentBounds). The step() that follows the window resize therefore sees no change and never re-fits. In Chromium the orientation 'change' event is dispatched after the frame has already been resized, which is the case that triggers this. The DOM UI follows the wrong rect because ui.layout copies the canvas rect (screenshot t9-boot-landscape-then-portrait.png: the how-to sheet is 257×412 in the middle of a portrait screen). Only one resize event fires, and main.js scheduleLayout (line 307) never touches Phaser. Reproduced in Chromium mobile emulation; still to be confirmed on a real phone.
- **Proposed fix:** In main.js scheduleLayout(), re-fit Phaser before laying out the DOM, in both the rAF and the 120 ms follow-up: `const refit = () => { game.scale.getParentBounds(); game.scale.refresh(); relayout(); }; layoutRaf = requestAnimationFrame(() => { refit(); setTimeout(refit, 120); });`. Also add `if (screen.orientation) screen.orientation.addEventListener('change', scheduleLayout);`. refresh() costs well under 1 ms and does not touch the backing store (it only changes CSS size and margins).

### [high] `rotate-overlay-no-pause` — The game keeps running under the 'rotate your phone' overlay: the water rises and the player cannot tap, which can cost the daily attempt
- **File:** `js/main.js`
- **Evidence:** Script t12_rot3.mjs: daily run at i=6, rotated to landscape for 8 s. The #rotate overlay is shown (display:flex, z-index 200, it captures every touch). isPaused('Game') is false and no pause screen appears. The water rose from y=-39.7 to y=-82.9, so the distance to the tower top fell from 9.11 m to 7.39 m in 3.8 s of game time. At up to 60 px/s, a short tower floods after a few seconds of accidental landscape, and wind and storm events keep acting on the tower. main.js only pauses on visibilitychange (line 273), and the overlay is pure CSS (style.css:1096/1130).
- **Proposed fix:** Pause on the same media query the CSS uses: `const landscapeMq = matchMedia('(orientation: landscape) and (max-height: 540px) and (pointer: coarse)'); const onOrient = () => { if (landscapeMq.matches && canPause()) pauseGame(); }; landscapeMq.addEventListener('change', onOrient); onOrient();`. The player then comes back to the pause card in portrait and resumes deliberately.

### [high] `gpu-memory-prefx-postfx-msaa` — About 220 MB of GPU memory is allocated at boot for Phaser FX render targets and MSAA that the game never uses
- **File:** `js/main.js`
- **Evidence:** Scripts t5_mem.mjs and t7_rb.mjs wrap texImage2D, renderbufferStorage and deleteTexture. Default config: 160 live GL textures totalling 102 MB, plus 83 depth/stencil renderbuffer allocations totalling 118 MB. Of these, 11 are full-screen 720×1584 targets and 66 are square PreFX targets from 32² to 704² (3 per size; PipelineManager.boot, src/renderer/webgl/PipelineManager.js:403-433, runs unless disablePreFX is set). With `disablePreFX: true, disablePostFX: true, render.antialiasGL: false` this drops to 90 textures and 40 MB, with 13 renderbuffers and 57 MB. The game uses no preFX, postFX, masks or RenderTextures (grep), and t31-tuned.png renders identically with no errors. getContextAttributes() shows antialias:true: render.antialias also enables 4× MSAA on the 720×1584 backbuffer (an estimated ~35 MB more). Sprites only need texture filtering, and every block texture has 3 px of transparent padding. On 3–4 GB Android phones and older iPhones this much GPU memory makes a context loss or tab kill when backgrounded much more likely, and it adds about 70 FBO allocations at boot. powerPreference 'high-performance' does nothing on phones but forces the discrete GPU on dual-GPU laptops.
- **Proposed fix:** In the main.js Phaser config: `disablePreFX: true, disablePostFX: true, render: { antialias: true, antialiasGL: false, powerPreference: 'default' }`. antialias:true keeps LINEAR texture filtering; antialiasGL:false only removes MSAA.

### [high] `sw-timeout-mixes-versions` — After a deploy, the service worker's 4 s timeout fallback can serve an old module next to new ones, and the game then never boots, even after reloading
- **File:** `sw.js`
- **Evidence:** Scripts t19_sw.mjs and t20_sw2.mjs use a scratch copy of the site behind a GitHub-Pages-like server (/Toring/, Cache-Control max-age=600). Steps: v1 installed; deploy v2, where main.js imports a new export from config.js; HTTP cache expired; config.js answers in 5 s (one slow request on 3G). networkFirst() races the network against fromCache() after NETWORK_TIMEOUT_MS (sw.js:43,103,107), so the page gets new main.js with old config.js. Result: `SyntaxError: The requested module './config.js' does not provide an export named 'NEW_IN_V2'`. The splash stays on 'Laai…' forever with no message. The next two reloads on a normal network still fail, because the old module is reused from the renderer's memory/HTTP cache while max-age lasts, even though the SW cache already holds v2. The same thing happens whenever a returning player's SW cache is from an older release. If sequence.js were the mixed module, two players could get different daily towers without any error.
- **Proposed fix:** (1) Keep the source consistent per page load. Use the timeout race only for `req.mode === 'navigate'`. Remember the outcome per client: `const offline = new Set(); /* on navigate cache-fallback: offline.add(event.resultingClientId) */`. For subresources, serve from cache if `offline.has(event.clientId)`; otherwise use the network with cache fallback only on a network error, never on a timer. (2) Fetch with `fetch(req, { cache: 'no-cache' })` so a deploy is picked up despite GitHub Pages' max-age=600 (ETag revalidations are cheap 304s). (3) Add an inline boot watchdog in index.html before the module script: `addEventListener('error', showReload, true); setTimeout(() => { if (!window.__stapel) showReload(); }, 15000);`, where showReload shows a 'Herlaai' button that runs `caches.keys().then(k => Promise.all(k.map(c => caches.delete(c))))`, unregisters the service worker and calls location.reload().

### [medium] `timestep-cooldown-slowmo` — Phaser's restart smoothing makes the game run in slow motion after any focus or visibility event on devices below 60 fps, and permanently while the window is unfocused
- **File:** `js/main.js`
- **Evidence:** Script t13_cooldown.mjs, with real Phaser behaviour (the integration harness sets panicMax=0, which hides this). Steady play runs at 1.04× real time. After firing window.onfocus (what Phaser does on a real window focus, e.g. after closing the notification shade or the share sheet) it runs at 0.20× real time for the next 120 frames. game.loop.resume() (every return from a hidden tab) does the same. The cause is TimeStep.smoothDelta (src/core/TimeStep.js:569-573): while _coolDown (=panicMax=120) > 0 or !inFocus, delta is clamped to 16.67 ms. GameScene feeds that delta to the physics accumulator, crane, water and timers (GameScene.js:487-512). On a 30 fps phone the whole game, flood included, runs at 0.5× for 4 s; at 40 fps, 0.67× for 3 s. While the window is unfocused but visible (Android split screen, desktop with devtools focused) it stays slow indefinitely. It also undermines any game.loop.sleep()/wake() battery fix, because wake() calls resetDelta() and so restarts the cooldown.
- **Proposed fix:** Add `fps: { smoothStep: false }` to the game config. GameScene already clamps dt to 100 ms and skips the first frame after resume (resetClock), BgScene clamps too, and tweens use Date.now. If smoothing is wanted for visuals, use `fps: { panicMax: 0 }` instead, and have GameScene compute `dt = clamp(time - this.lastTime, 0, 100)` from the raw rAF time it already receives, so `inFocus` cannot slow it.

### [medium] `draws-scale-with-tower` — Every frozen block image is drawn every frame, off-screen or not: on phones that is one draw call per block in the tower
- **File:** `js/scenes/GameScene.js`
- **Evidence:** Phaser does no culling: WebGLRenderer.render submits every visible child, and there is no bounds check in MultiPipeline or WebGLPipeline (grep 'cull'). An Android user agent selects MobilePipeline (autoMobilePipeline, PipelineManager.js:495), which uses a single texture per batch, and each block has its own texture (shape×size×colour). Script t29_cull.mjs, Android UA: baseline 42 draws per frame; 40 block images placed off-screen below the view give 82 draws; 80 give 122; with setVisible(false) it is back to 42. Frozen images are never hidden or destroyed (freezeBlock and pruneFrozenBodies at GameScene.js:873/888 remove only the body). A 100–150-block daily tower (the goal) therefore costs about 140–190 draw calls per frame on Android, each with a texture bind and GPU-process/driver overhead. Measured live: 40 draws at i=0, 56 at i=10, 79 at i=20 (t28_tall.mjs).
- **Proposed fix:** In pruneFrozenBodies(), or in a cheap per-frame scan of the frozen list from a monotonic index, call `b.image.setVisible(false)` for frozen blocks whose top is more than the camera view height below cam.worldView.bottom, or more than about 300 px below the water surface. In reveal(), call `for (const b of this.frozen) b.image.setVisible(true)` before the zoom-out. Optional: pack block textures into one or two dynamic atlas canvases (e.g. 2048×1024 with shelf packing) so on-screen blocks batch as well.

### [medium] `context-loss-keeps-simulating` — During a WebGL context loss the game keeps simulating behind a frozen or black canvas, and there is no fallback if the context never comes back
- **File:** `js/main.js`
- **Evidence:** Script t8_ctxloss.mjs: WEBGL_lose_context.loseContext() mid-practice, restoreContext() 1.5 s later. Phaser logs 'Context lost. Renderer disabled' and later restores correctly (screenshot t8-after.png is fine). During the 1.5 s, the run advanced from block i=1 to i=3 and the water moved, all with no rendering. Nothing in main.js listens for losewebgl. On a real phone a GPU reset mid-daily means the water keeps rising unseen, and if Chrome declines to restore (it does after repeated GPU crashes) the daily silently floods. The ~220 MB allocated at boot (see the GPU memory finding) makes losses more likely.
- **Proposed fix:** `game.renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, () => { if (canPause()) pauseGame(); lostTimer = setTimeout(() => ui.toast(S.reloadNeeded /* new string */, 6000), 3000); });` and `game.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => clearTimeout(lostTimer));`. The player resumes from the pause card. Add the string to strings.js.

### [medium] `landscape-boot-height` — Opening the link while holding the phone sideways locks the game to a 1.6 aspect ratio for the whole session
- **File:** `js/config.js`
- **Evidence:** Script t9_orient.mjs, case B: boot at a 915×412 viewport, then rotate to 412×915. game.scale stays 720×1152, because computeGameHeight() runs once at Phaser construction (main.js:57) with innerWidth > innerHeight, which clamps to the 1.6 minimum. In portrait the game then fits 412×659 inside 915 px of height: about 256 px of empty bands for the rest of the session. This happens with the rotation re-fit fixed; without that fix it is smaller still. WhatsApp links are often opened in landscape or with a half-rotated phone.
- **Proposed fix:** On coarse-pointer devices compute from the portrait dimensions: `const coarse = matchMedia('(pointer: coarse)').matches; const w = innerWidth, h = innerHeight; height: coarse ? computeGameHeight(Math.min(w, h), Math.max(w, h)) : computeGameHeight()`. Alternatively, delay `new Phaser.Game` until the landscape media query is false, since the rotate overlay is showing anyway.

### [medium] `render-loop-behind-overlays` — Full 60 fps rendering and simulation continue behind the pause, results and menu screens (battery and heat)
- **File:** `js/main.js`
- **Evidence:** Script t9_orient.mjs: 40 frames rendered in 3 s on the pause screen, which is the full headless rate (13.7 fps). Nothing throttles the loop. On the results screen the scene keeps re-rendering the zoomed tower under a dark scrim. The menu runs the full idle game (physics, crane, about 3× screen overdraw) behind a card that hides most of it (integration/03-menu-idle.png). Wordle-style players often leave the menu or results open with the countdown running. The AudioContext also stays 'running' on menu and results; it is only suspended on pause or hidden.
- **Proposed fix:** Pause screen: in pauseGame(), after one frame `requestAnimationFrame(() => game.loop.sleep())`; in resumeScenes(), call `game.loop.wake()` (needs the smoothStep/panicMax fix, or wake() triggers slow motion). Results: sleep the loop once the reveal has finished (on 'game:over') and wake it on 'ui:home' or practice. Menu: let the attract tower run for about 20 s after the last interaction, then sleep the loop (wake it on pointerdown), and sleep while the how-to or stats modal covers it. Audio: call ctx.suspend() after about 10 s with no sound and let play() resume it.

### [medium] `weather-random-frame-coupling` — Gameplay-affecting weather uses Math.random, so dailies are not identical; seed it per event, not per frame
- **File:** `js/game/weather.js`
- **Evidence:** These values change physics outcomes and differ per player: the gust strength multiplier `g.mul = rand(0.75, 1.25)` (line 459); hail spawn times, x, radius (mass) and initial velocity (_planHail line 1017, _spawnHail line 1069); and the lightning impulse `rand(2, 4)` plus its spin sign (line 940). forecastWind() assumes `gMul = 1` for future gust segments, so the landing ghost is wrong by up to 25% of gust strength. That is one source of the known ~35 px gust ghost error. Visual randomness (rain, streaks, fog, flicker) is fine. Weather.update runs once per rendered frame, so if Math.random is swapped for a seeded rng called inside per-frame code, the number of draws would depend on frame rate and the daily would diverge between 30, 60 and 120 Hz phones.
- **Proposed fix:** Create `this.rng = createRng(sequence.seed).fork('wx')` and per event `ev.rng = this.rng.fork(String(ev.start))`. At event start, draw every gameplay value: a precomputed `gustMuls[]` for each 1200 ms segment, the full hail plan (time, x offset, r, vx, vy), and the strike strengths and spin signs. Consume them only at their scheduled points. forecastWind() can then read gustMuls[segment + k] exactly. Keep Math.random for visuals only.

### [low] `hud-text-raster` — HUD and effects text is re-rasterised about 4 times a second at resolution 2 (4× the pixels the 720-wide canvas can show)
- **File:** `js/scenes/HudScene.js`
- **Evidence:** Script t25_text.mjs: 4.1 Text.updateText calls per game-second at 1.14 ms each on desktop (an estimated 4–5 ms spike on a mid-range phone), with about 700 KB/s of texture uploads. The flood pill causes roughly half of them ('🌊 Vloed ##,# m onder', 576×76 canvas, re-rendered every 120 ms whenever the 0.1 m value changes; WATER_TEXT_MS line 21). 'Perfek ×n!' canvases are 760×196, i.e. 595 KB per upload. `resolution: 2` (HudScene.js:85, effects.js:181) quadruples raster and upload cost, but the backing store is only 720 px wide, so the extra detail is downsampled away except during brief scale-ups. HudScene.create costs about 57 ms on desktop (t23: 42 ms of it in text()), which shows as a hitch on 'Speel'.
- **Proposed fix:** Use `resolution: 1` everywhere (1.25 for the scaled 'Perfek' pops at most). Show the flood distance in whole metres above 5 m and limit it to 2 updates per second (WATER_TEXT_MS = 500). Optionally render the digits with a BitmapText built at boot from a canvas glyph sheet (no per-change raster), and launch Hud asleep during the menu so its texts exist before the tap.

### [low] `sw-double-download` — First visit downloads the whole app twice because the service worker precaches with cache:'reload'
- **File:** `sw.js`
- **Evidence:** Script t19_sw.mjs server log: 56 requests on the first visit. phaser.min.js and main.js are each fetched twice; the second phaser fetch has `Cache-Control: no-cache` from `new Request(path, { cache: 'reload' })` (sw.js:51). That is 1.66 MB raw, about 0.5 MB gzipped (phaser 317 KB, app 110 KB, icons 72 KB), re-downloaded right after the page has loaded. Prepaid mobile data is expensive in South Africa.
- **Proposed fix:** Precache with `{ cache: 'no-cache' }`: GitHub Pages sends ETags, so files the page just loaded come back as 304. Or omit the cache mode so they come straight from the fresh HTTP cache. Leave the 512 px PNG icons out of the precache (only the manifest uses them, and the browser fetches them itself).

### [low] `graphics-retessellation-gc` — Graphics objects are re-tessellated every frame (Perfek ring, wobble meter), producing several MB/s of garbage
- **File:** `js/game/effects.js`
- **Evidence:** Script t15_alloc2.mjs (heap sampling, unminified Phaser, virtual clock, perfect-streak practice): 127 KB allocated per frame, 7.5 MB/s. About 80 MB of the 150 MB sampled comes from batchLine, batchStrokePath, GraphicsWebGLRenderer, batchFillPath and earcut. Sources: effects.js:426-427 (strokeRoundedRect redrawn each frame for 420 ms per Perfek) and HudScene.js:500 (fillRoundedRect wobble fill, 52 commands, redrawn whenever wobble changes). Phaser re-triangulates Graphics on every render. Not a frame-time problem on desktop, but on phones it means more frequent minor GCs during streaks.
- **Proposed fix:** Perfek ring: generate one rounded-rect outline texture per block size (or one 9-slice 'ring' texture and use add.nineslice), then scale and fade the image. Wobble meter: an Image of a pre-drawn vertical gradient bar, set with setCrop(0, h - fh, w, fh) and tinted, instead of a Graphics fill.

### [low] `backing-store-blur-overdraw` — The 720×1584 backing store is upscaled 1.5× on 1080p phones (soft HUD text); overdraw of 3–5× means native resolution would be risky
- **File:** `js/scenes/BgScene.js`
- **Evidence:** Script t1_basics.mjs: canvas 720×1584, CSS 412×906.4, DPR 2.625, so 1081×2379 device px (1.502× bilinear upscale). Script t18_overdraw.mjs measured on-screen coverage per weather state: clear 3.08× (sky 1.00, sea 0.50, water body 0.47, island 0.45, mountains 0.21), heat 4.62× (full-screen wx_heat plus a 0.32 ADD glow), storm 4.21× (full-screen gloom), fog 5.03× (bands 0.95 plus puffs 0.71). At 720 wide that is 3.5–5.7 Mpx per frame, fine for a Mali-G57 or Adreno 618. At native 1080 it would be 2.25× more (up to about 13 Mpx per frame, roughly 770 Mpx/s), so keeping 720 is correct. Cheap savings: the opaque sky image is drawn full-screen although the sea covers it below the horizon (BgScene.js:345, 375).
- **Proposed fix:** Keep GAME_W at 720. Crop the sky to the horizon each frame (`this.sky.setDisplaySize(W, Math.min(H, horizon + 4))`, saving 0.5 screen at ground level). Hide `sea`, `glint` and the mountains once the world water body fully covers them (they already hide at altitude). If crispness matters more than fill rate, move only the big height and score numbers into the DOM overlay, which renders at device resolution.

### [low] `module-waterfall` — First load on 3G waits on a 4-level ES module import waterfall
- **File:** `index.html`
- **Evidence:** Script t30_boot.mjs (300 ms RTT, 1.6 Mbps, 4× CPU, no gzip from the local server): the last module finished loading at 3751 ms. With `<link rel="modulepreload">` for the 20 modules it finished at 2435 ms (splash cleared at 11.8 s vs 8.9 s; the gap is partly noise because uncompressed Phaser dominates here). On GitHub Pages, phaser.min.js is 317 KB gzipped, so the waterfall's RTTs are a larger share of the boot time.
- **Proposed fix:** Add `<link rel="modulepreload" href="js/...">` for every module (all relative paths) after the stylesheet link in index.html, and keep the list next to the PRECACHE list in sw.js.

## Lens: visual

I reviewed Stapel at 412×915 (DPR 2.625), 360×640 (DPR 3), 430×932 (DPR 3) and 1280×800, plus a simulated 47 px notch inset. About 150 screenshots are in <SCRATCH>/review-visual/shots/ and the scripts that made them are in the folder above it (s1–s11). The DOM screens are clean and on-brand, and Perfek feedback works (outline burst, sparkles, combo colours climbing, "+N" floats).

There are three high-severity problems:
1. The in-game HUD shares the y 100–232 band with the yellow crane jib, so the hearts, score, combo badge and weather chip sit on the lattice and hide the trolley, rope and hook for part of every swing. With any top safe-area inset, the weather chip covers the hanging block itself.
2. The landing ghost is almost invisible: white at alpha 0.28 on a pale sky. It floats in mid-air when a drop will miss, the first-game hint text covers it on 412, and nothing explains it.
3. The idle attract tower behind the menu is never visible. The base sits 30 CSS px below the card's top edge on 412 and 300 px below it on desktop. A runtime-only camera patch shows a fix that works.

Medium-severity problems:
- Weather banners cover the moving top of the tower for about 2.3 s, exactly when the event hits.
- The 🟩🟨🟧🟥 grid fails for colour-blind players. Under deuteranopia, 🟩 vs 🟥 has a colour difference (ΔE) of 9.
- Much secondary text is 8–11 CSS px, and the grey text (#6f7f9c on #eef5fc) is 3.68:1.
- White labels on the orange, green, teal and WhatsApp buttons are 1.98–2.32:1, and the teal Oefen buttons are 2.51:1.
- Game over is undramatic. The HUD, including the height, disappears instantly, and the results arrive 420 ms after the zoom-out ends, covering it.
- On 360×640 a long daily overflows by 73 px, which pushes Oefen and Tuis below the fold.
- The idle crane runs behind the results title and the menu tagline.
- After a Perfek, the "Perfek!" text sits over the next block's ghost.

Minor items: empty hearts and the ⭐ are unreadable on the jib, the wobble meter has no label, the keyboard focus ring is invisible on the pause card's toggles, flood danger has no screen-level cue, a new-record result keeps a "you quit" title, the fog emoji shows as a blank square on Android, hail is too small to see, and the vibration toggle appears on desktop. Each finding has positions in game px (720 wide) or CSS units (u = canvas width / 720), plus colours.

### [high] `hud-crane-collision` — The HUD sits on the yellow crane jib and hides the trolley, rope and hook (and the hanging block when there is a top safe-area inset)
- **File:** `js/scenes/HudScene.js`
- **Evidence:** HUD bounds measured in game px at 412×915 (script s4 'hudgeo'), compared with the jib, which is drawn y 100–164 (top chord y 108, bottom chord ~144, JIB_TOP = LAYOUT.jibY − 42 in crane.js:16):
- score text [26,86,131,128] (HudScene.js:123): the ⭐ sits on the yellow top chord.
- combo pill [22,115,209,193] (line 127): sits on the jib.
- hearts pill [552,101,720,163] (lines 150–158): navy at alpha 0.4, so the lattice shows through.
- weather chip [500,156,720,232] (line 161): directly under the jib.

The trolley covers x 92–628 (360 ± 230 ± 38). The chip therefore hides the trolley, rope and hook whenever sin(phase) > 0.61, which is ~29% of each swing, and the combo pill hides the left extreme ~33% of the time.

Screenshots:
- shots/crop-hud-lost.png: star and empty heart on the lattice.
- shots/sheet-effect-a.png, panel 3: the trolley vanishes under the 'Reën' chip and hearts.
- shots/p360-g-01-early-hint.png: the trolley sits behind the hearts.

With a top inset (shots/notch-game.png, 47 CSS px simulated through the safeTop registry key), the HUD moves down by 79 game px but the crane (crane.js) does not. The height, mode label and 'Volgende' box then sit on the jib, and the 'Wind' chip covers the hook and the right half of the hanging block.
- **Proposed fix:** Give the HUD its own band above the jib.

In config.js:
- LAYOUT.jibY 150 → 200 (the jib band becomes y 158–212).
- LAYOUT.ropeLen 100 → 80. The block top then hangs at 200+26+80+14 = 320 (290 today). The fall to dropLineY 760 is identical on every device, so the daily stays fair.

Lay out the HUD (game px, top = st):
- Row 1, y st+8…st+66:
  - height text 52 px at x 20.
  - weather chip centred, x 228–448, 56 tall. It replaces the 'Daaglikse Toring #1' label. Show that label for 2 s as a toast at start, and on the pause and results screens.
  - hearts pill 150×48 at x 456–606, alpha 0.7.
  - DOM pause button stays at x 618–714.
- Row 2, y st+74…st+140:
  - ⭐ score 28 px at x 24.
  - combo pill 120×44 directly right of the score (x = scoreTxt.right + 12).
  - next-block box 96×66 at x 510–606, label 22 px.

Also make the Crane honour safeTop (add st to every part's y) and add st to the camera drop line, so the fall distance stays constant on notched devices.

### [high] `ghost-invisible-misleading` — The landing ghost is almost invisible, floats in mid-air on a miss, is covered by the first hint, and is never explained
- **File:** `js/scenes/GameScene.js`
- **Evidence:** Visibility:
- GameScene.js:252–253 draws the ghost as a white silhouette at alpha 0.28, with a navy rim at alpha 0.2 and only +6 px of padding. On the pale horizon sky this is effectively about 1.05:1.
- shots/crop-ghost-0.png: the ghost is a barely visible rounded rectangle over the rocks.
- shots/p412-j-09-ghost-aim.png: the ghost is not visible at all at the tower top.

Mid-air on a miss:
- When the predicted bbox overlaps no support, landTop falls back to towerTopY (line 1062).
- The ghost then sits beside the tower in mid-air (x 600, y −20 in the s6 probe; crop-ghost-0.png), telling a new player the block will land there when it will actually fall into the sea.

Covered by the hint:
- The first-game hint 'Tik om te laat val' sits at y 0.45·H (HudScene.js:196), bounds [213,689,507,737] on 412.
- The ghost on the base sits at y 720–760, so its top edge is under the hint text (shots/p412-g-01-early-hint.png).

Not explained:
- The how-to (strings.js howToSteps) never mentions the ghost, the wobble meter or the weather chip.
- **Proposed fix:** Make the ghost readable:
- ghost alpha 0.28 → 0.5.
- ghostEdge alpha 0.2 → 0.6, scale padding +6 → +8 px, for a 4 px navy rim.
- Optionally use a 2 px dashed white outline texture generated once per shape.

Show misses honestly:
- In predictLanding, when !s.found, set a flag.
- Tint the ghost red (setTintFill 0xff6b6b, alpha 0.45) and drop it to y = towerTopY + 120, so it visibly falls past the tower.

Add an aiming guide:
- A 2 px dotted vertical line (one stretched image, alpha 0.25) from the hanging block's centroid to the ghost centre.
- Only reposition it each frame; never redraw.

Move the hint:
- Put it at y = LAYOUT.dropLineY + 150 (over the water, below the base), with a second 26 px line above the ghost the first time only: '↓ Hier land jou blok'. This is a new string in strings.js.

Add a how-to step:
- '👻 Die wit skaduwee wys waar jou blok gaan land.'
- Trim the 7 steps to 5 by merging the 'cement' and 'daily' steps into the others.

### [high] `idle-tower-hidden` — The menu backdrop is dead: the idle attract tower is always behind the daily card, and the swinging crane block clutters the tagline
- **File:** `js/scenes/GameScene.js`
- **Evidence:** Measured in s1:
- 412: the base top is at CSS y 462 but the daily card starts at 432. The camera keeps the idle tower top at dropLineY 760 game px = CSS 439, so the island and the whole tower are hidden (shots/p412-04-menu-fresh-later.png shows only sky, mountains and the swinging block).
- 360: base 424 vs card 221.
- Desktop: base 583 vs card 281.

Tagline clutter:
- The idle trolley's rope and hanging block swing through 'Stapel hoog. Staan sterk.' (shots/p412-03-menu-fresh.png).
- The tagline is white on #5ec1f5 (2.0:1) and partly over a white cloud (~1.05:1).

Prototype:
- A runtime-only monkeypatch of scene.updateCamera in idle (script s9_idle.mjs) with target = min(towerTopY − (cardTopGame − 70), 0 − (cardTopGame − 10)) puts the tower and falling blocks in the gap above the card (shots/p412-idle-proto-b.png).
- On 360 the idle 'Perfek!' pops then land on the tagline (shots/p360-idle-proto-b.png).
- **Proposed fix:** Feed the card position to the game:
- In main.js showMenu, after ui.showMenu, set registry 'menuTopGame' = (card.getBoundingClientRect().top − canvasRect.top) · 720 / canvasRect.width.
- Recompute it on relayout and day-rollover.

Idle camera:
- In GameScene.updateCamera when this.idle: idleTop = menuTopGame − 70 and idleBase = menuTopGame − 10.
- target = min(towerTopY − idleTop, LAYOUT.baseTopY − idleBase).
- A short tower then shows the island and base right above the card, and taller ones keep their top 3–4 blocks and each falling block in view.

Idle effects:
- Skip the text pops: effects.rating should only do the outline and sparkle when scene.idle.
- Keep IDLE_BLOCKS at about 8.

Tagline CSS:
- `.tagline { display: inline-block; padding: calc(6*var(--u)) calc(22*var(--u)); border-radius: 999px; background: rgba(29,43,69,.38); }`
- Centre it inside .brand.
- This gives white text ≥ 6:1 regardless of clouds.

Optional: lower the idle crane's alpha to 0.85 so it reads as background.

### [medium] `banner-covers-tower` — The weather banner covers the moving top of the tower for ~2.3 s, right when the event hits
- **File:** `js/scenes/HudScene.js`
- **Evidence:** Geometry:
- bannerY() (HudScene.js:258) centres a 600×(~250) panel, navy at 0.78, at dropLineY + 56 + bh/2. The panel spans y 816–1068 on 412 and 360.
- The tower top is pinned at 760, so the banner hides blocks 2–6 from the top. These are the not-yet-frozen blocks that wind, lightning and hail act on.
- It holds 300 + 1600 + 360 ms.

Screenshots:
- shots/sheet-banner-a.png and shots/sheet-banner-b.png: all 8 types.
- shots/p412-t-50-tall.png: the 'Reën' banner over a leaning 74 m tower.
- shots/p360-j-30-wx-rain-banner.png.

The player cannot see the tower react to the event the banner announces.
- **Proposed fix:** Use a compact banner, 560×150 at navy 0.82:
- emoji 72 px at local x −205.
- title 44 px and subtitle 24 px, left-aligned from x −140, wrap width 380.

Place it above the flood pill:
- centre y = waterY − 26 − 75 − 16, i.e. y ≈ 1403 on 412 and 1099 on 360.
- On 360 this leaves y 760–1024 (≈5 blocks) clear.

Animate it:
- Hold 1.4 s.
- Then tween to the weather chip's position over 320 ms (Cubic.In) with scale 0.3 and alpha → 0.
- On arrival, pulse the chip (scale 1.25 → 1). This also teaches first-time players what the chip means.

Side effect: pendingToast logic must use the new y.

### [medium] `grid-colourblind` — The 🟩🟨🟧🟥 results and share grid is not colour-blind safe (deuteranopia: Perfek vs Lost ΔE 9)
- **File:** `js/ui/dom.js`
- **Evidence:** Method:
- Sampled the rendered Noto squares from shots/crop-grid-800.png: P #7cb342, G #ffcc32, S #ff9800, X #f44336.
- Simulated full-severity colour blindness (Machado 2009) and measured CIELAB ΔE.

Results:
- Deuteranopia: P–X 9, G–S 11.
- Protanopia: P–S 11.
- Values under ~15 are hard to tell apart, and deuteranopia affects ~5% of men. The headline 'how did I do' read is ambiguous for them, in the app (gridEl, dom.js:608) and in the WhatsApp text.

The set 🟦🟧⬜⬛ keeps a minimum ΔE ≥ 46 for deuteranopia, protanopia and tritanopia.

In-game ratings are fine because they also use words (Perfek/Goed/Skeef/Oeps).
- **Proposed fix:** In-app grid:
- Render cells as styled spans instead of emoji: `.cell{width:46u;height:46u;border-radius:9u;display:grid;place-items:center;font:900 24u/1 var(--font)}`.
- P: #3f9a3e with a white ★.
- G: #f7c948 with an ink •.
- S: #f39a2b with an ink ∼.
- X: #31373d with a white ✕.
- Keep the aria-label as is.

Share text:
- Add a 'Hoë kontras' toggle (settings.highContrast) in the menu dock and pause card.
- When on, share.js uses RATING_EMOJI_HC = { P:'🟦', G:'🟧', S:'⬜', X:'⬛' } (append to config.js) and the DOM cells use the matching colours.

### [medium] `tiny-low-contrast-text` — Much secondary text renders at 8–11 CSS px, often in #6f7f9c on #eef5fc (3.68:1)
- **File:** `css/style.css`
- **Evidence:** Sizes at 412 / 360 CSS px wide (u = 0.572 / 0.5):

DOM:
- .fc-name 19u (style.css:572): 10.9 / 9.5 px. The forecast labels 'Warrelwind Donderstorm Warrelwind' nearly touch (shots/p412-03-menu-fresh.png).
- .res-stats .tile span 18u (line 871): 10.3 / 9.0.
- .tile span 20u (712): 11.4 / 10.
- .bar-val 19u, .bar-day 20u, .foot-cell span 20u (959): 10–11.

HUD (game px × 0.572 / 0.5):
- 'Volgende' 16 px (HudScene.js:145): 9.2 / 8.
- 'nog N blokke' 17 px (line 166): 9.7 / 8.5.
- mode label 20 px: 11.4 / 10.

Contrast:
- --muted #6f7f9c is 4.04:1 on white and 3.68:1 on --panel #eef5fc. Both are under 4.5:1 for small text, and most of the labels above sit on --panel.
- **Proposed fix:** CSS floors:
- `.fc-name,.res-stats .tile span,.tile span,.bar-val,.bar-day,.foot-cell span,.label,.wx-chip,.dock-btn,.note { font-size: max(12px, calc(N * var(--u))) }`, keeping each current N.

--muted:
- #6f7f9c → #56668a (5.21:1 on #eef5fc, 5.73:1 on white).

HUD:
- 'Volgende' 16 → 24 px.
- wxLeft 17 → 22 px, colour #d9ecff (it has a stroke).
- mode label 20 → 24 px, or remove it per the HUD finding.
- Keep all HUD text ≥ 24 game px, which is ≥ 12 CSS px on a 360 px phone.

### [medium] `button-label-contrast` — White labels on the main buttons are 1.6–2.5:1 (the 'Bou vandag se toring' CTA is 2.22:1)
- **File:** `css/style.css`
- **Evidence:** WCAG contrast of white on each button fill (computed):
- --karoo #f39a2b: 2.22:1. The top 42% of the button blends from --karoo-l #ffc56e, where it is 1.56:1 (`.btn` background, style.css:234). This is the main CTA in shots/p412-03-menu-fresh.png and 'Kom ons bou!'.
- bosveld #5bbf5a ('Speel verder', 'Sien jou uitslag'): 2.32:1.
- oseaan #2fb5b0 ('Oefen'): 2.51:1.
- --wa #25d366 ('Deel op WhatsApp'): 1.98:1.

The labels are bold 21–24 CSS px, so the bar is 3:1. The text-shadow is rgba(0,0,0,.18), which adds little.
- **Proposed fix:** Darken the button fills only, keeping the palette for blocks:
- `.btn{--bg:#d9700a;--bg-l:#f39a2b;--bg-d:#a65400}` gives 3.35:1.
- `.btn-green{--bg:#3f9a3e;--bg-l:#5bbf5a;--bg-d:#2b6e2b}` gives 3.56:1.
- `.btn-teal{--bg:#1d8f8a;--bg-l:#2fb5b0}` gives 3.93:1.
- `.btn-wa{--bg:#128c4a;--bg-l:#25d366;--bg-d:#0c6434}` gives 4.31:1.

Shorten the light gradient band:
- `linear-gradient(180deg,var(--bg-l) 0%,var(--bg) 22%,var(--bg) 100%)`.

Outline the text:
- `text-shadow: 0 calc(3*var(--u)) 0 var(--bg-d), 0 0 calc(2*var(--u)) var(--bg-d)` so it outlines against any fill.

### [medium] `gameover-drama-reveal` — Game over is flat: the height disappears instantly, nothing on the canvas says what happened, and the results cover the reveal
- **File:** `js/scenes/GameScene.js`
- **Evidence:** Sequence:
- endGame emits 'hud:hide', which fades the whole HUD root including the height, so the number that matters most vanishes at the climax.
- The only other feedback is a 0.22-alpha red flash for 320 ms (GameScene.js:1269), 1 s of slow motion and the 'Oeps!' pop.
- The reveal zoom runs from 380 to 1780 ms. The results overlay appears at OVER_EMIT_MS 2200 (line 50), so the full-tower shot is visible for ~420 ms before a card covers it (shots/p412-t-5x-over-2200.png).

On the results screen:
- The 0.46 scrim leaves the revealed tower and the red flood-line dashes running through the white title 'Die toring het geval!' and 'Oorstroom!' (shots/p412-t-56-results.png, shots/p412-j-43-results-flood.png).
- That screenshot also shows the HUD height reading 74.1 while the results say 77.0, because the HUD shows the current height and the results show the best.
- **Proposed fix:** Keep the height and send it to centre stage:
- On 'hud:hide', fade everything except heightTxt.
- Tween heightTxt to (W/2, st+170), scale 1.7, over 500 ms (Back.Out), and set it to fmtM(maxHeightM).

Make the fall feel heavier:
- Lives: flash 0xff3b3b at 0.35 for 450 ms, plus shake(0.012, 350) (skipped when reduced motion is on), plus a pre-baked red radial vignette image fading 0 → 0.5 → 0 over 900 ms.
- Flood: the same vignette tinted 0x1f6fb2.

Add a ruler during the reveal:
- Create world-space tick marks every 10 m at x 40 with 22 px labels ('10 m', '20 m', …), plus a dashed '🏁' line at maxHeightM.
- Create these only in reveal(); there is no per-frame cost.

Give the reveal time and space:
- OVER_EMIT_MS 2200 → 3000.
- CSS: `.screen-results.on .res-wrap{animation: res-up .45s cubic-bezier(.2,1.2,.4,1) both}` from translateY(40%).
- `.res-head` gets a backing: `background:rgba(12,32,66,.55);border-radius:36u;padding:14u 24u`.
- Add a small '👁 Toring' icon button at the top-left of the results that toggles `.peek` (hides .res-wrap, scrim 0), so players can admire and screenshot the tower.

### [medium] `results-overflow-360` — On 360×640 a long daily overflows and pushes Oefen/Tuis below the fold with no scroll cue
- **File:** `css/style.css`
- **Evidence:** Measured in s7 after a 52-block daily:
- .screen-results scrollHeight 713 vs clientHeight 640 (shots/p360-t-56-results.png). The Oefen and Tuis buttons are off-screen and nothing hints that the page scrolls.

What drives the height:
- 5 grid rows.
- '+3 💥' on its own row.
- 8 weather chips wrapping to 2 rows, including duplicates: Reën ×3, Warrelwind ×2.
- The separate streak/countdown card.

Real 360-wide phones lose a further ~56–80 px to browser bars. A 3-row grid fits exactly (sh 640 = ch 640, shots/p360-results-3share-record.png).
- **Proposed fix:** Shorten the weather row:
- Deduplicate the types in weatherEl() and show a ×n badge, e.g. `<sup class="wx-n">×3</sup>` at 16u.
- This caps the row at the 8 distinct types, on one line.

Compact layout when height/width < 1.9:
- `#ui.compact .big-m{font-size:96u}`
- `.grid-row .emoji{width:40u}`
- `.res-stats .tile{min-height:92u}`
- `.res-wrap{gap:14u}`

Always reachable buttons:
- `.screen-results .btn-row{position:sticky;bottom:0;padding-top:16u;background:linear-gradient(180deg,transparent,rgba(12,32,66,.85) 40%)}`.
- Merge the streak and countdown into one 72u row inside the card's foot.

### [medium] `idle-crane-behind-results` — Revisiting today's result from the menu shows the idle crane jib, trolley and block running behind the results title
- **File:** `js/main.js`
- **Evidence:** In showDoneResults (main.js) the idle scene keeps running behind the 0.46 scrim:
- Desktop: the yellow jib runs straight through 'Die toring het geval!' (shots/desk-08-results-done-revisit.png).
- 360: through 'Oorstroom!' (shots/p360-08-results-done-revisit.png, shots/p360-results-3share-record.png).
- 412: the hanging block swings across the title (shots/p412-08-results-done-revisit.png).
- **Proposed fix:** Quiet the idle scene while the revisit results are open:
- In showDoneResults, call `gameScene()?.crane?.setVisible(false)` and set `gs.inputLocked = true` (or pause idle autoplay).
- Restore both in 'ui:home'.

Also apply the .res-head backing pill from the game-over finding, so the title never sits directly on a busy scene.

### [medium] `perfek-pop-over-ghost` — The Perfek pop sits over the next block's ghost for tall shapes; the combo flash is weak
- **File:** `js/game/effects.js`
- **Evidence:** Overlap:
- rating('P') pops the text at yTop − 64 (effects.js:449). The text is ~70–86 px tall (72 px font × scale 0.97–1.19), so it spans roughly yTop−107…yTop−21.
- It drifts only −10 px until p = 0.6, i.e. 690 ms of the 1150 ms lifetime (line 345).
- The next block appears after CRANE.respawnDelayMs 350. Its ghost sits at yTop−h…yTop, and the text is drawn above it (depth weather+2 vs ghost 18).
- For the crate (84), arch, L, J, T (88) and pillar (128) the ghost is half-covered while the player aims, and the crane gets faster with every block.
- Seen in shots/p412-j-13-perfek-x5.png and shots/p412-j-20-extra-life.png.

Flash:
- The screen flash for combo ≥ 3 is 0.16 alpha for 150 ms (line 455), which is barely perceptible.
- **Proposed fix:** Move the pop out of the aiming zone faster:
- In _pop, after the pop-in, rise dy = −110·easeOutCubic((p−0.16)/0.84).
- Start fading at p 0.45 (currently 0.6). It then clears the landing zone by ~350 ms.
- Also start it at yTop − 80 when the next block is taller than 60 px.

Juice:
- combo ≥ 3 flash: 0.16 → 0.26, tinted COMBO_TINTS[n] at 50% mix with white.
- Add a 120 ms camera zoom punch 1 → 1.015 → 1 on every Perfek (skip it when reduced motion is on).
- Pulse the HUD combo pill (already done) and briefly brighten the block's light band (0.35 alpha white overlay, 180 ms) for a 'set' feeling.

### [low] `hearts-readability` — Lost hearts (🤍 at alpha 0.6) and the ⭐ are almost invisible over the yellow jib
- **File:** `js/scenes/HudScene.js`
- **Evidence:** - setLives uses '🤍' with setAlpha(0.6) (HudScene.js:333–335) on a navy pill at alpha 0.4 over the yellow lattice. The empty heart reads as a faint white smudge (shots/crop-hud-lost.png, shots/p412-j-22-lost-oeps.png).
- At one life, the pulsing last heart is the only clear signal.
- The score's ⭐ emoji sits on the jib's yellow top chord.
- **Proposed fix:** Hearts:
- Draw the empty heart in code: a navy #1d2b45 fill at 0.55 with a 3 px white outline, at alpha 1.
- Or use '🖤' at alpha 0.85.
- Raise the hearts pill alpha to 0.7.

Score:
- Give the score its own navy 0.45 pill: panelTexture of width text.width + 28 and height 44.
- This becomes moot if the jib is moved per the HUD finding, but the empty-heart glyph change still applies.

### [low] `wobble-meter-unexplained` — The wobble meter looks like a scrollbar: 12 px wide, alpha 0.4, no label
- **File:** `js/scenes/HudScene.js`
- **Evidence:** - The meter is a 12×(0.2·H) bar at x 14 (HudScene.js:184), 7 CSS px wide on 412, at alpha 0.4 until wobble passes 0.15.
- Its only label is a 22 px '〰️' below it.
- No how-to step mentions it.
- In shots/p412-g-01-early-hint.png it is an unlabeled grey sliver on the left edge. In shots/p412-j-22-lost-oeps.png it suddenly becomes a full red bar with no explanation.
- **Proposed fix:** Option A: drop the permanent meter.
- Show a 'Wankel!' chip (S.wobble already exists) under the hearts when wobble > 0.35.
- Make it amber, turning red above 0.6, with an 8° wiggle tween.
- Hide it below 0.2.

Option B: keep the meter but make it readable.
- 18 px wide at x 10, alpha ≥ 0.7.
- A 20 px 'Wankel' label rotated −90° at its top.
- A 2 px white threshold tick at 0.6.

### [low] `focus-ring-in-card` — The keyboard focus ring is invisible on the pause card's Klank/Vibrasie toggles
- **File:** `css/style.css`
- **Evidence:** - `#ui .dock-btn:focus-visible .dock-ic` uses a white outline (style.css:486).
- Inside the white pause card that outline is white on white.
- With 'Vibrasie: Aan' focused (document.activeElement), nothing is visible (shots/crop-focus-pause.png).
- On the menu (sky background) the same ring is visible (shots/crop-focus-menu.png).
- White .btn-white buttons inside cards ('Hou op', 'Maak toe') rely only on the 0.45 navy halo.
- **Proposed fix:** Darker rings inside cards:
- `.card .dock-btn:focus-visible .dock-ic{outline-color:var(--hemel-d)}`
- `.card .btn:focus-visible{outline-color:var(--hemel-d)}`
- This gives #2563b0 on white, about 5.6:1.

### [low] `flood-danger-cue` — Flood danger has no screen-level cue, and the flood line is not tied to the distance pill
- **File:** `js/scenes/HudScene.js`
- **Evidence:** - Danger is shown only by the bottom pill turning red and pulsing, plus a one-off toast (shots/p412-j-40-flood-danger.png, shots/p360-j-40-flood-danger.png).
- The thin red dashed vloedlyn has no number on it.
- A new player has to connect '🌊 Vloed 2,6 m onder' at the screen bottom with a line drawn mid-screen.
- The integration notes say the flood rarely ends a game, so when it does it should feel coming.
- **Proposed fix:** Red vignette:
- Add a pre-baked red radial vignette image (generated once, scrollFactor 0, depth fxScreen − 1).
- When waterDistM < WARN_M, pulse its alpha 0 ↔ 0.3 at 1.6 Hz.
- Use 0.15 when reduced motion is on.

Label the line:
- Add a small world-space label on the flood line's right end, e.g. x 640, y = water.surfaceY − 30: '🌊 2,6 m'.
- Update it with the same 120 ms throttle as the pill.
- Show it only once the line is inside the view.

### [low] `record-title-and-empty-share` — A new record keeps a failure or quit title; quitting with 0 blocks still offers sharing
- **File:** `js/ui/dom.js`
- **Evidence:** - A practice quit with a new best shows '🏳️ Poging beëindig / Jy het opgehou bou.' as the headline, with the '🏆 Nuwe rekord!' tag tucked on the card corner (shots/p412-g-72-results-practice-record-700ms.png).
- A quit with 0 blocks shows 0,0 m, all-zero tiles and the full WhatsApp/Kopieer share row (shots/p412-g-71-results-quit-0blocks.png). This is a known open item.
- **Proposed fix:** New record:
- In showResults when isNewBest, make the title emo('🏆') + S.newRecord.
- Move why.title into the subtitle.
- Make the record tag a 52u gold banner across the card top.

Empty result:
- When result.blocksDropped === 0, omit .share-row and the grid.
- Show one line of muted text, e.g. a new 'Niks om te deel nie — probeer weer!' string in strings.js.

### [low] `weather-visual-gaps` — Fog 🌫️ shows as a blank white square on Android, and hailstones are too small to read
- **File:** `js/game/weather.js`
- **Evidence:** Fog emoji:
- Noto renders 🌫️ (strings.js:119) as a pale square tile.
- It looks like a missing image in the HUD chip and banner (shots/p412-j-11-perfek-x3-flash.png 'Mis') and in the results weather row (shots/p360-results-3share-record.png, last chip).

Hail:
- Stones are r 6–8 world px (weather.js:1072), i.e. 3.5–4.6 CSS px white dots on a pale sky.
- Only 2–3 are on screen at once (shots/sheet-effect-b.png panel 1), so the 'Hael' event barely reads.
- **Proposed fix:** Fog:
- Give fog chips a darker backing: in the DOM, `.fc-emo[data-wx=fog], .wx-chip[data-wx=fog]{background:#c9d7ea}`.
- In the HUD, draw a small code-generated fog icon: 3 white rounded bars on navy.
- Or switch to '☁️' with the name 'Mis' carrying the meaning.

Hail:
- r 6–8 → 9–12, with a 2 px navy (#1d2b45 at 0.6) rim in the hail texture.
- Add ~20 cosmetic screen-space hail streak particles during the first 5 s (no physics; stays within the < 150 particle budget).

### [low] `platform-polish` — Desktop shows a non-functional Vibrasie toggle and touch wording; first visit shows a grey '🔥 0' streak
- **File:** `js/ui/dom.js`
- **Evidence:** Vibration toggle:
- toggleBtns() adds Vibrasie whenever navigator.vibrate exists (dom.js:401). Desktop Chrome has it, so the menu dock and pause card show a toggle that does nothing (shots/desk-04-menu-fresh-later.png).

Wording:
- The hint says 'Tik om te laat val' to mouse users.

Streak chip:
- streakChip(0) renders a grey 🔥 0 on a brand-new player's first card (shots/p412-03-menu-fresh.png), which reads as a failure state before they have played.
- **Proposed fix:** Vibration toggle:
- Require `matchMedia('(pointer: coarse)').matches` as well as navigator.vibrate.

Wording:
- On `(pointer: fine)` show a hint variant 'Klik of druk spasie' (new string).

Streak chip:
- In renderMenu, render streakChip only when stats.played > 0.
