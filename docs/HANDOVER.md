# Stapel — handover for the next agent

*Other games' names were removed from this repo on purpose (the owner's brief below describes them generically).*

**Read this first, then `docs/SPEC.md` (game architecture) and `docs/SPONSORS-SPEC.md` (sponsorship system).**
Branch: `claude/trusting-hopper-26qcax` (develop and push here; don't open a pull request unless the owner asks).
Repo: `AnandreGroenewald/Toring`. Owner: Anandré Groenewald.

## 1. What the owner asked for

> Build "Stapel", a free Afrikaans block-stacking phone game that runs in the browser. Tagline: "Stapel hoog. Staan sterk."
>
> THE FEEL (borrow from proven hits)
> - A famous daily word game: one Daaglikse Toring a day, the same blocks and weather for everyone, one scored try, a streak, a countdown to the next tower, and an emoji share line for WhatsApp.
> - A one-tap stacking game: instant one-finger play, a bright "Perfek!" flash and combo bonus when a block lands dead centre.
> - A crane-and-tower builder: a crane up top, the tower growing tall, height shown in metres.
> - A physics block puzzler with events: events hit your tower while you build, and a line you must stay above.
> - A wobbly tabletop block tower: the wobble and tension of a tall tower.
>
> TECH
> - Phaser 3 with its built-in Matter.js physics, saved into this repository.
> - index.html at the repository root, so GitHub Pages can serve it straight from the main branch.
> - Shapes and colours drawn in code, emoji for weather, short WebAudio sounds. Whole game under 3 MB, smooth at 60 fps on a mid-range Android phone, portrait layout.

Later the owner added (decisions are final unless they say otherwise):

| Topic | Decision |
| --- | --- |
| Quality | "Do not cut corners for usage limit." Thorough testing and reviews are expected. |
| Business model | Monthly **sponsorships**: businesses pay to get **their name on the blocks**. |
| Premium ad | A large ad for a sponsor paying **R1 499 per month**: an exclusive **billboard on the island** next to the tower base. |
| House ad | **sportscard.co.za** is the owner's own business: a permanent pinned card on the **menu** (label it "Advertensie"). We couldn't fetch the site (egress blocked), so the copy is neutral and lives in `sponsors.json`. |
| Name-on-blocks price | **Not shown** anywhere on the site; it only appears on Paystack's checkout (the owner sets the plan amount). |
| Sign-up and payment | **Fully automatic**, using **Paystack** (ZAR, monthly plans). The backend is a Cloudflare Worker + D1, because the site is static on GitHub Pages. |
| WhatsApp share text | Stays **clean**: no sponsor mentions. |
| Public contact email | The owner will create one and send it later. Until then `SPONSOR.contactEmail` stays `''` and the UI hides it. Do **not** publish the owner's personal Gmail. |
| Brand names | Other games' names must not appear anywhere in the repo (game, public pages, docs, agent prompts in `docs/workflows/`, the brief quoted above). Everything was reworded generically; keep it that way (only the Phaser licence files may mention third parties). |
| Legal | Third-party MIT notices are in `lib/THIRD-PARTY-NOTICES.md`. The owner was told to do a CIPC trademark search on "Stapel", fill in and lawyer-check the legal templates, register an Information Officer (POPIA), and ask an accountant about tax. |

## 2. Current state (at handover)

<!-- STATUS-START -->
### Base game: playable, polished and QA'd (T1 done, version `1.3.2`)
- Everything in the original brief is built: daily tower, practice, crane, physics, Perfek/combo, 8 weather types, rising flood line, cement freeze, wobble, results, streak, countdown, share text, PWA/offline, WebAudio, Afrikaans UI.
- History: 6 parallel module agents → integration agent (zero console errors) → **six-lens review (74 findings, see `docs/review-findings.md`)** → a fixer agent applied the fixes.
- The fixer's per-finding report was lost in a container restart; T1 re-checked every critical and high finding by hand (see the T1 bullet below). Its code changes are all committed. Notable ones:
  - seeded per-event weather (`js/core/weatherplan.js`), so every player gets identical gusts, lightning and hail
  - taps release the block at the exact tap moment
  - 4 hearts, and every 3rd Perfek restores one
  - a Perfek sets everything under it like cement
  - landing outline turns red when the block would fall
  - flood tuning
  - HUD re-layout, with weather chip and hearts at the top and a wobble meter
  - colour-blind-safe results grid (★ • ~ ✕), plus metre markers and a "Toring" view on results
  - a debug session uses separate storage (`stapel.v1.debug`)
  - modulepreload and a boot watchdog in `index.html`
  - SW precache test (`tests/precache.test.js`)
- Tests at handover: **`npm test` 89/89 pass.**
- Headless check at handover: a full daily at 412×915 with autoplay ran 1 min 50 s to 75,2 m and ended with zero console errors. Screenshots were taken of the how-to, Perfek ×4, rainbow, storm with lightning, the game-over reveal and results; all looked right.

### Come-back hooks (version `1.5.0`)
- *Jou Stapelstad* skyline (`js/core/skyline.js`, drawn once into a texture by `BgScene`, and a strip on results and Statistiek), friend challenge links `?klop=<dm>&d=<today>` (`js/core/challenge.js`, sessionStorage only, line drawn by `GameScene`), tomorrow's weather teaser (`js/core/teaser.js`), the install button / iOS tip (`js/core/install.js`) and a softer, quieter seagull (`gull` in `js/audio.js`, every 15-30 s). Tests: `tests/hooks.test.js`.

### Sponsorship system: built, needs its review pass (T4)
- **T2 done:** `js/core/sponsors.js` (pure logic), `js/sponsorsFeed.js` (feed loader with a 5-minute/7-day localStorage cache), `sponsors.json` (the sportscard.co.za house ad) and `tests/sponsors.test.js`. The name rules live in one shared file, `js/core/nameRules.js`, which the Worker (`server/src/moderation.js` re-exports it), the sign-up page and the game all use, so `wrangler deploy` must run from a full repo checkout. `adverteer.html` works now.
- **T3 done:** `terme.html` and `privaatheid.html` are Afrikaans templates with `[[placeholders]]`, the template banner and "Nota vir die eienaar" notes. Both are version `2026-10-06`, matching `js/sponsorConfig.js`. The owner must check the Information Regulator's address and email, and a lawyer must confirm the ECT Act s44 cooling-off wording.
- **T5 done:** in-game sponsorship. Sponsor names are drawn into the block textures; the cache is bounded and named textures are dropped at game end. The island billboard sits right of the base and floats up with the flood, so the reveal always shows it. The menu has the pinned sportscard.co.za card and, only when sales are on, an "Adverteer hier" link. The feed loads in the background and never delays startup. Everything new is precached. The README has a sponsorship section.
- Tests (before the audience stats below): **`npm test` 126/126** and **`cd server && npm test` 92/92** pass (run `npm install` in `server/` first for the miniflare smoke test). Headless checks at 412×915 had zero console errors, covering the menu, a practice game with a test feed (names and billboard), the reveal, no sponsors, and sales on with an empty billboard. The game payload is about 1.8 MB.
- **Audience stats and percentile (done, version `1.2.0`):**
  - Fewer sponsor names: `SPONSOR.blockShare` is now `0.4`; `createBlockNamer(..., share)` names every 2nd or 3rd name-capable block (even spread, seed-dependent start, sponsors still equal give or take one) and has `idAt(i)`.
  - `js/core/audience.js` (tally, batch builder, percentile line, needs 10+ players) and `js/audience.js` (sendBeacon with fetch keepalive fallback, one POST /score per day per device with a `<storage key>.score` flag, GET on revisits). Nothing happens without `SPONSOR_API_URL`; debug sessions only send with `?audience=1`.
  - GameScene counts names on dropped blocks and emits `game:audience` at game end; main.js sends one batch per finished game (the menu card is reported with the first game of a visit); the results card shows "Jy het beter gedoen as 72% van spelers vandag" (hidden for 0% and under 10 players, never in the WhatsApp text).
  - Worker (`server/src/stats.js`): `POST /stats`, `POST /score`, `GET /score`, `GET /admin/stats`; tables `stats_daily` and `daily_scores` (re-run `schema.sql`, see the migration note in `server/README.md`); the per-address rate limit is in memory only (hash with a daily-rotating salt, no IP stored); counts older than 400 days are deleted by the cron.
  - `admin.html` has a **Statistiek** tab (period presets or dates, totals, per day, per sponsor) and "Kopieer maandverslag" per sponsor (`js/pages/statsReport.js`).
  - `privaatheid.html` (new subsection "Anonieme tellings", retention 13 months) and `adverteer.html` (monthly report promise, names on about every 2nd-3rd block) updated. The privacy version date was deliberately **not** bumped because sales are still off, so no sponsor has accepted it yet; bump `privacyVersion` (config and page) together if any sponsor has signed up by the time you change the text again.
  - Tests: root **153/153**, server **115 pass + 1 skipped** (the workerd smoke test can't start in this container). Headless check with a mocked API: percentile line on results (412×915 and 360×640), revisit uses GET, one `/stats` beacon with the right tally, admin Statistiek with mock data, zero console errors.
- **First-play coaching (done, version `1.3.0`):** a new player learns by doing; nothing pops up on the first visit.
  - The automatic 7-step how-to is gone: the first visit goes straight to the menu, which carries one nudge line (`S.firstNudge`: "Nuut? Tik net en speel — ons wys jou hoe."). The "Hoe speel ek?" dock button and sheet work exactly as before.
  - `js/core/coach.js` (pure, tested in `tests/coach.test.js`) decides which hint belongs to which real moment; `COACH` in `js/config.js` holds the numbers (`minBlocks` 4, `holdMs` 3800, `landingDelayMs` 450).
  - GameScene says what happened (`coachSay` → `hud:coach`); HudScene `showCoach` draws a roomy pill over the sea, 250 game px below the tower-top line, so it never covers the landing outline, the drop column or the falling block. It fades by itself, the newest hint replaces an older one, it steps aside for a weather banner (and comes back after) and never pauses anything. Reduced motion: plain fade, no slide or scale.
  - Hints (once each, first game only, daily or practice): before the first drop "Tik om te laat val 👆" (plus the existing "Hier land jou blok" label); after the first landing "Mik vir die middel — die wit vorm wys waar dit land" or, after a Perfek, "Perfek! Doen dit weer 🎯"; when the water starts to rise "Die water styg — bou vinniger as die vloedlyn 🌊"; the first block that really costs a heart "’n Blok in die see kos ’n hartjie ❤️". The first weather event needs no hint: its banner explains it.
  - Text only: no gameplay, RNG or physics change, so the first daily is exactly as fair as any other. The flag `store.tutorialSeen()` is now set when a first game ends with at least 4 drops (a quick quit keeps the hints for next time); closing the how-to sheet no longer sets it. Existing players who already closed the old how-to stay "seen".
  - Other games' names were removed from the whole repo (`docs/workflows/*.js`, `docs/SPEC.md`, `docs/review-findings.md`, this file's quote of the brief, two code comments); keep it that way (a case-insensitive grep over the repo for those games' names must stay empty).
  - Tests: root **161/161**, server **115 pass + 1 skipped**. Headless check at 412×915 with a fresh profile (real first tap, then autoplay): hints at tap, landing and water; a second game shows none and the menu nudge is gone; quick-quit keeps the flag unset; 360×640 and a short 800×500 viewport checked numerically; zero console errors.
- **T4 security and billing review (done, version `1.3.1`):** attacked, then fixed, with a failing test first for each item (`server/test/security.test.js`, 20 tests); one line per change:
  - Refunds: `refund.processed` is handled; once refunds add up to a payment's amount it buys no time (partial refunds don't), in any order with the charge. New table `payment_reversals`.
  - Chargebacks: `charge.dispute.create/remind` stop the ad while open and flag it; `charge.dispute.resolve` restores it when the merchant wins (`declined`) and keeps it off when lost (`merchant-accepted`); a late remind never reopens a resolved dispute.
  - Premium/full-tier race: the slot is re-checked atomically (inside the UPDATE) when money lands via webhook or `/status`, also for checkouts already marked abandoned; a late payer is set `ended`, flagged `slot_taken`, their Paystack subscription is disabled as soon as `subscription.create` arrives, `/status` answers `taken` and `adverteer.html` explains the refund. A full refund clears the flag.
  - Owner alerts: new table `alerts` (slot_taken, charge_on_ended, dispute), listed at the top of `admin.html` with a "Klaar" button (`POST /admin/alerts/:id/resolve`); payments show refunds/disputes and income is net of them.
  - Test-mode keys: with an `sk_live_` key, test-mode charges are refused (`rejected:test_mode`), test payments are marked `…:test` and stop counting (the cron drops test sponsors after the switch); `admin.html` shows a "Toetsmodus" banner while a test key is set.
  - Month arithmetic: months are anchored to the chain's first charge (31 Jan → 28 Feb → 31 Mar, leap years), and a renewal inside the grace days belongs to the same cycle (it used to drift the anniversary to the 28th).
  - `subscription.disable` now keeps a paid sponsor live until `paid_until` (status `cancelling`), as terme.html §3/§5 promise; immediate removal stays the owner's hide/"immediate" cancel.
  - Moderation (`js/core/nameRules.js`): letters must read as plain a-z (accented, or a short fold list such as ø/æ/ß); small capitals, hooked/IPA letters and other scripts are refused (`ꜰᴜᴄᴋ`, `ƒuck` used to pass). New: spaced-out letters (`S H I T`, `P.O.E.S`), stretched letters (`Shiiit`), `ph`→`f`. Scunthorpe fix: short slurs only count at a word start, and words split over pieces only when the split looks like a trick, so "Scunthorpe Motors", "Mother Farm", "Top Ornaments", "Hot Notes", "Swanker" are allowed again.
  - Admin: 20 wrong tokens per hashed address per hour, then 429 even for the right token; malformed `%` escapes in admin paths answer 404 instead of 500; `mailto:` links are not made for addresses with `?&%#`.
  - `/stats` and `/score` need an allowed `Origin` (scripts without one get 403); `/stats` increments are summed in isolate memory and written at most once a minute (`STATS_FLUSH_SECONDS`), so a flood can't spend the D1 write budget that payments need.
  - The address-hash salt falls back to the Paystack secret before the public constant.
  - terme.html: manual-approval timing ("binne [[1 werksdag]]", full refund if refused), the full-slot refund promise, and automatic dispute handling now match the code; adverteer.html's success line says "binne ’n paar minute" (the feed cache can take just over 5). The terms version date was not bumped (sales are still off, nobody has accepted it).
  - Refuted (already safe): forged/re-serialised/unsigned webhooks, timing-safe compares, replayed and out-of-order events, events for unknown customers, wrong plan/amount/currency, `/status` activation with someone else's reference, double extension for one charge, XSS (all sponsor text goes through `textContent`, the checkout redirect only allows Paystack hosts), open redirects, oversized bodies, CORS on admin routes and preflights, secrets in the repo (a test now guards it).
  - Tests: root **161/161**, server **135 pass + 1 skipped** (workerd smoke test). Headless check with a mocked API: admin alerts, test banner, resolve, payments with refunds, an XSS name rendered as text, `adverteer.html` "taken" state, game start; zero console errors.
- The server does not auto-delete ended sponsors' contact data; the owner removes it on the admin page.
- **T1 base-game QA and T6 final pass (done, version `1.3.2`):**
  - Every critical and high finding in `docs/review-findings.md` (20: 1 critical and 19 high) was re-checked in the code and the browser: **all 20 were already fixed, none were open.** The only change was a small HUD polish found while playtesting: at 360 px the weather chip (e.g. "Mis / nog 3 blokke") tucked about 12 px under the hearts pill, so `CHIP_CX`/`CHIP_MAX_W` in `HudScene.js` were pulled in (chip right edge now at most x 424, pill starts at 432). Medium and low findings were not chased one by one.
  - Fixed before this pass (code evidence): `cement-prune-collapse` (prune limit uses the lowest dynamic block, `PRUNE_KEEP`), `daily-weather-random` and `weather-math-random` (seeded per-event plan; `Math.random` left only for looks), `collapse-dominated-short-daily` and `awkward-shape-perfek-tip` (a Perfek sets the cement under it, rating windows scaled to the support's width, Goed eases to the centre), `perfek-snap-rotated-support` (`SCORING.perfectMaxTilt`), `double-charge-collapse` (collapse forgiveness, `CRANE.calmWaitMaxMs`), `first-tap-loses-life` (`CRANE.amplitudeStart`), `flood-never-bites` (tuned: v0 5, accel 0.11, 4 lives; the flood is still a late-game pressure, not the main way games end), `debug-date-writes-real-stats` and `auto-and-seed-params-ungated` (all debug params need `?debug=1`, which uses separate storage), `refresh-rate-perfek-quantization` (`tapLag`), `calendar-emoji-english` (no 📅 left), `rotation-stale-fit` and `rotate-overlay-no-pause`, `gpu-memory-prefx-postfx-msaa` (FX pipelines off, no MSAA), `sw-timeout-mixes-versions` (`offlineClients` in `sw.js`), `hud-crane-collision` (HUD band above the jib), `ghost-invisible-misleading`, `idle-tower-hidden` (`menuTopGame` registry).
  - Headless Chromium playtests (412×915 and 360×640, DPR 2, touch), **zero console errors or warnings and no failed requests** in each: a daily with real taps (pause, resume, game over, results), the second daily attempt (blocked, shows the results), a fresh profile (hints "land", "water" and "lost" appeared in game 1, none in game 2), practice with pause, quit and home, and an autoplay (`auto=0.15`) practice to 50 m (412) and 69 m (360).
  - Leak check, restart idle → practice → home 6 times: bus handlers stayed at 17, display-list sizes (Bg 19, Game 52, Hud 0 while idle) and Matter bodies (1) did not change. The texture count rises by about 3 per game only because block textures are cached by shape and size in an LRU (`TEX_CACHE_MAX` 96, pruned to 64 in `js/game/blocks.js`); it is bounded, not a leak.
  - Daily determinism: two runs of the same daily (`date=2026-10-12`) with fixed 60 Hz stepping, the same scripted bot, but **different `Math.random` streams** gave identical samples (wind acceleration, hail body positions, tower top, lives, score, grid) over 488 samples spanning heat, wind, rain, rainbow and hail, ending at 84 m with 36 Perfek.
  - Rotation: a sideways phone pauses the game under the rotate overlay, and the canvas refits in both orientations.
  - Sub-path: serving `/home/user` and opening `/Toring/index.html` loads everything with no 404 (manifest, all icons, `sponsors.json`); without `?nosw=1` the service worker registers (scope `/Toring/`) and precaches 41 files.
  - Tests: root **161/161**, server **135 pass + 1 skipped**. Game payload (`index.html`, `lib/`, `js/` minus `js/pages/`, `css/style.css`, `icons/`, manifest, `sw.js`, `sponsors.json`) is about **1.85 MB**, under the 3 MB limit. The README's sponsorship section was re-read and is accurate.
  - Not checked here (needs the real services or a real phone): Paystack and Cloudflare end to end, GitHub Pages itself, real-device frame rate and sound. Headless fps is only 5-40 because rendering is in software.
- **Beach ambience (done, version `1.3.3`):** `audio.setAmbience(0..1)` in `js/audio.js` plays a quiet synthesised surf bed (slow LFO swell) and a distant 2-4 note seagull call every 8-20 s (`'gull'` also renders offline); `GameScene.syncAmbience` sets it from altitude (1 at sea level, 0 by about 60 m, 0.8 on the menu) and it follows the sound toggle and pause/hidden. Not checked on a real phone: how it sounds.
- **Afrikaans sayings (done, version `1.4.0`):** curated spreekwoorde/idiome "in between", from a fixed owner-approved list in `js/core/sayings.js` (pure; `pickSaying(category, key)` is deterministic via `createRng`; categories GENERAL, MILESTONE, RESULT_GREAT/LIVES/EARLY/FLOOD, PAUSE). Menu: "Spreekwoord van die dag" (key = dateKey, same for everyone) sits in the absolutely placed `.spacer` gap, so it never adds height; `fitSaying()` (plus a ResizeObserver) hides it when the gap is too small, which is the case at 360x640. In game: GameScene `checkMilestone()` emits `hud:saying` the first time the tower passes 25 m, 50 m, ...; HudScene `showSaying()` waits (retry every 0.5 s, gives up after 9 s) until no banner, coach hint or toast is up, then shows a gold toast like "50 m — Aanhouer wen!" (never after game over, never in idle). Results: one italic line by outcome (`resultCategory`: quit = GENERAL, new best or height 50 m or more = GREAT, under 10 m = EARLY, flood = FLOOD, else LIVES), keyed by seed + outcome; pause: one PAUSE saying. All via `textContent`; the share text is untouched (tested). Toasts now word-wrap and accept `size` and `ms`. Tests: root **172/172** (`tests/sayings.test.js`). Headless check (412x915 and 360x640, zero console errors): menu, a milestone toast at 25 m, results, pause.
- **Visitors / besoekers (done, version `1.6.0`)**, built to `docs/CHARACTERS-SPEC.md`: 🐒 *Blouaap* swings in on a rope from the crane, jumps on the tower top, bounces twice and shoves the top 1-2 movable blocks (tap him during the 1,5 s run-up: "Sjoe! Weg is hy!"); 🤡 *Hanswors* brings a striped circus gift block (+25 points, a few px off-centre and a little tilted); 🦹 *Skelm Sakkie* sneaks up the side of the tower for ~2 s and takes the top movable blocks, at most 4 (tap him while he climbs: "Gevang! Jy kry jou blokke terug.").
  - **Same for everyone:** the schedule is its own fork of the day's seed (`createSequence` → `root.fork('visitors')` → `buildVisitors` in `js/core/visitorplan.js`), so every block and weather event of every day is unchanged (the golden daily #1 test still passes; the visitors have their own golden test). Rules: the first visitor at block 8-14, then 10-20 blocks apart (mean 15), never on a block where weather starts, never the same type twice in a row, the thief at most once and not before block 14. A typical 45-block tower meets about 2,8 visitors; the thief comes within 45 blocks on about 6 days in 10. Each visit draws from its own stream (`visitRng(seed, visit)`: shove strength and count, the gift's shape/offset/tilt, the climb time), and everything that changes the tower happens on the fixed physics step (`Visitors.step()`), so it plays out the same at any refresh rate. Practice uses the same rules with its own seed.
  - **Code:** `js/core/visitorplan.js` (schedule + per-visit plans), `js/core/visitorrules.js` (pure: which blocks the thief/monkey may touch, who is to blame for a lost block, the grid with gifts, stored records, share emoji, results line), `js/game/visitors.js` (one visit at a time: phases on the sim clock, emoji sprites at 88 px, rope/balloons/swag bag/juggling balls drawn in code), GameScene `visitorShove` / `visitorGift` / `visitorSteal` / `visitorLoss` (physics and bookkeeping), six sounds in `js/audio.js` (`monkey`, `shoo`, `clown`, `thief`, `escape`, `caught`; all under 1 s, levels checked offline), numbers in `VISITOR` (`js/config.js`), text in `js/core/strings.js` (`VISITOR_INFO` and the `visitor…`/`res…`/`coach…` keys).
  - **No hearts lost to visitors:** a tower block lost within `VISITOR.graceMs` (2,5 s) of a shove or theft, a block that was in the air at that moment (`shielded`) and the clown's gift never cost a heart, keep the combo and keep their own grid cell (one toast per push: "Blouaap se skuld — jy hou jou hartjies ❤️"). A block dropped after the push follows the normal rules. The score keeps the best height, so nothing earned is lost; the real cost is a shorter tower (a big theft can bring the flood within reach, as the spec intends). Cement is never touched. A taken or knocked block whose rating was still open counts as Skeef (+10, quietly).
  - **Taps:** a tap within 60 px of a visitor (a 120 px circle) shoos the monkey or catches the thief while they can still be stopped; on the clown it only makes him honk and juggle. A tap on a visitor never drops the block; any other tap drops as normal. The monkey and the clown wait near the screen edge and switch sides if the tower top leans towards them, and the thief stops climbing 64 px below the tower top, so their tap circles never cover the landing outline or the drop column. Keyboard drops are unchanged.
  - **Grid, share, results:** the gift is a new grid code `B` (`RATING.GIFT`), shown as 🎁 in the share grid (also in high contrast) and as a cream cell with a red rim and 🎁 on the results. The share text gets the visitors next to the weather: `Weer: 💨🌧️ · Besoekers: 🐒🦹✋` (✋ after a caught thief); without visitors it is exactly as before. The results card gets one line about the most memorable visit (thief, then monkey, then clown). `result.visitors` = `[{ type, outcome, n }]` is saved with the daily (`normalizeResult` cleans it).
  - **Presentation:** arrival banner in the weather banner's style ("🐒 Blouaap!" + "Tik hom om hom weg te jaag!"); it fades in place instead of flying into the weather chip, and makes way at once for the visit's outcome toast. A first-time player's first visitor of each kind gets its coach text (`coach.visitor(type)`, once per type, first game only) as the banner's two-line subtitle. The coach pill would have covered the climbing thief, and on 360×640 it waits behind the banner until the visit is over. The menu says "Besoekers vandag: 🐒 🤡" under the forecast (a slimmer forecast box on compact screens keeps the menu no taller than before), the results' "Môre:" teaser adds tomorrow's visitors, and the how-to sheet has a visitors step. The menu's attract tower sometimes gets a clown floating past (looks only). Reduced motion: straight moves, no squash, no shake.
  - **Spec choices to know:** Hanswors floats in under three balloons while "walking" on air (there is no ground at the height of the tower top). The gift is tossed onto the tower once no player block is falling. A scheduled visitor that finds another one still on screen waits for the next free block. The thief's caught line follows the spec although nothing was taken yet.
  - **Debug:** `?debug=1&visitor=monkey|clown|thief` (that visitor comes with block 3), `window.__stapel.scene.spawnVisitor(type, side)` (only with `?debug=1`), `scene.getState().visitor` / `.visitors` / `.gifts`.
  - Tests: root **207/207** (new `tests/visitors.test.js`, plus share, coach, storage, hooks and imports updated deliberately), server **135 pass + 1 skipped**.
  - Headless checks (Chrome with SwiftShader via playwright-core on the owner's Mac, 412×915 and 360×640, touch), **zero console errors, warnings or failed requests** in each. The one exception is Chrome's own SwiftShader driver note "GPU stall due to ReadPixels", which was filtered out: Chrome prints it 4 times per browser session on the first page, for 1.5.0 exactly as for 1.6.0, and never with the real GPU. Each visitor was forced and screenshotted: the shoo tap and the catch tap work and don't drop the block, a tap on the clown doesn't drop, a normal tap elsewhere drops while a visitor is on screen, the gift joins the tower and the grid, the thief takes exactly the movable top blocks (at most 4) with cement, hearts and grid cells untouched, and a forced hard shove knocks 2 blocks into the sea with no heart lost, grid cells kept and the combo kept. Full dailies with the real schedule ran too (2026-10-21 at 412×915 to 110 m; 2026-11-07 at 360×640 to 70 m), with the thief caught by a real tap, and the results line and the share line checked. Reduced motion, the menu clown, `?visitor=` and the how-to sheet were also checked.
  - Determinism: two runs each of the dailies 2026-10-21 and 2026-11-07, stepped at exactly 60 Hz without rendering (`game.headlessStep`), with the same scripted bot (it drops, shoos, catches and taps the clown from game state only) and **different `Math.random` streams**, gave identical samples every 30 frames (442 and 446: tower top, every dynamic block's pose, hail, wind, water, lives, score, grid, visitor phase and position) and identical results. Between them the runs covered a monkey that knocked 3 blocks off, a theft of 2, four gifts, a caught thief and shooed monkeys.
  - Game payload now about **1,93 MB** (was 1,86 MB).
  - Not checked here: real phones (sound, feel and frame rate with visitors), how players react to the thief; the timings live in `VISITOR`.
- **Uitdagersreeks / head-to-head (done, version `1.7.0`)**, built to `docs/CHALLENGE-SPEC.md` at the owner's request ("a challenger series ... someone random ... same blocks ... if you reach a certain height first the other player can do some damage", and "challenge someone"):
  - **The match:** two towers on the same seed (`duel/<seed>`, its own namespace), the scheduled visitors off; at 10/20/30/40 m the first to get there sends Blouaap / Skelm Sakkie / Blouaap / Skelm Sakkie to the other tower (the visitor system's `attack()`; the defender can still tap it away; no hearts lost); the first to 50 m wins, a tower that falls (hearts, flood, quit) loses. A gold finish line at 50 m, and a race track on the right edge of the HUD (you gold, them blue, marks coloured by who took them, their name and height riding beside their marker).
  - **Opponents:** random and live through the Worker (Durable Objects: `server/src/match.js`, `MatchLobby` pairs, one `MatchRoom` per match runs the same referee as the game); after 20 s alone, a recording of a real match (the lobby keeps the newest 60 for 7 days) or Robot Rikus. Friends: a live room (`POST /match/room` → share `?kamer=CODE`, waits 10 min), or the results' challenge link `?teen=<run>` (seed, nickname and the height once a second in about 250 characters; works with no server at all; the friend plays your run as a recording). Robot Rikus is a seeded run (median about 0,34 m/s; about 1 game in 4 he falls).
  - **Recordings as opponents:** your attacks take 2 m (Blouaap) or 4 m (Skelm Sakkie) off their tower from then on; their attacks come to you as real visitors.
  - **Code:** `js/core/duel.js` (pure: referee with snapshots, recorder, playback, ghost, bot, links, room codes, nicknames, report cleaning; also imported by the Worker), `js/duel.js` (device side: lobby/room sockets, fallbacks, the local referee for recordings, recording your run), GameScene `duel` mode (`duel:self` every frame, `duel:over`, `duel:attack`, `duel:end`, end reasons `won` / `lost`), HudScene race track, dom.js screens (`showDuel`, `showDuelWait` for search / room / 3-2-1 / link / error, the results variant), main.js flow, `buildDuelShareText` in share.js, `getDuel` / `setDuelName` / `recordDuel` in storage.js, strings `duel*`, `DUEL` in config.js. The menu has `Oefen` and `Uitdagersreeks` side by side (no extra height).
  - **Server:** `wrangler.toml` declares `MATCH_LOBBY` / `MATCH_ROOM` with the `v1-uitdagersreeks` migration (`new_sqlite_classes`, free plan). Rooms keep the match in memory and save only at the start, at height marks, at the result and at most every 5 s (about 30 writes per match; the free plan allows 100 000 writes a day). The hello of a waiting player lives on its socket, so a room that slept still starts. Origin checked on every route, 10 messages/s per player, heights faster than 2 m/s cut back, 30 friend rooms per address per hour.
  - **Switching live play on:** set `SPONSOR_API_URL`, or `MATCH_API_URL` alone to have matches before sponsorship sales (`js/sponsorConfig.js`). Until then the mode works against the computer and with challenge links; the random button and live rooms are hidden.
  - **Privacy:** `privaatheid.html` §2 has an "Uitdagersreeks" paragraph (recordings: nickname and heights, at most 7 days; links you share carry your run) and the retention list a line. The privacy version date was not bumped (sales still off).
  - Tests: root **221/221** (new `tests/duel.test.js`), server **152 pass + 1 skipped** (new `server/test/match.test.js`, 17 tests, fake Durable Object state and sockets).
  - The Miniflare smoke test still skips on the owner's Mac: workerd won't start from its options. It skipped exactly the same way before 1.7.0. `npx wrangler dev` itself runs fine, and the live tests below used it.
  - Headless checks (Chrome + SwiftShader, playwright-core), **zero console errors** in each:
    - a full match against Robot Rikus at 412×915 (won 51,8 m to 16,3 m; the win stored);
    - a friend's challenge link whose fast run reached every mark first (four attacks arrived as visitors; no hearts lost; won 50,8 m to 45,0 m; the WhatsApp text carries the challenge-back link; `?teen` is removed from the address);
    - two browsers live against `wrangler dev`, as follows:
      - random pairing: "Teen Bennie!" / "Teen Anna!", attacks delivered, exactly one winner, both stats right;
      - a friend room: `?kamer` link, the host quit, and the friend saw "Jy het gewen! Anna het opgehou.";
      - a lonely third player got match 1's recording after 20 s.
    - Screenshots were taken of the menu, the mode screen, 3-2-1, mid-match, attacks, the room waiting screen and results.
  - Game payload now about **1,99 MB** (was 1,93 MB).
  - Not checked here: Cloudflare for real (the owner deploys), real phones and networks, many players at once.
- **Recording fix (version `1.7.1`).** 1.7.0 went live on 7 Oct 2026 (the push waited out a GitHub outage). A check on the live site found that recordings counted a block still in the air: a player who quit at 12,2 m left a recording of 14,7 m, and a challenge screen said 45,5 m where the sender's results said 43,8 m. Recorded opponents also had about a 1 s head start on every mark. Fixed:
  - the game and the Worker record the best height, the number the results show (`js/duel.js`, `MatchRoom.record`);
  - playback: each second's height counts from the middle of that second and the last one from the moment the run ended (`heightAt`), so a recording is never ahead on average and reaches 50 m on time;
  - heights round to 0,1 m but never up onto a mark or the goal (`heightDm`: 9,97 m stays 9,9).
  - Tests: root **223/223** (new: the rounding, and a recorded run played back directly and through a link: marks within half a second, the goal on time, no head start on average; this test fails on the old playback), server **152 pass + 1 skipped** (a room records the best height while a block is in the air).
  - Headless, **zero console errors**: a normal visit (1.7.1 precached, 49 files), a match against Robot Rikus at 360×640, its challenge link played at 412×915 (the link screen's 50,4 m equals the sender's results), and quitting with a block in the air (results 12,6 m, recording 12,6 m).
- **Results ✕, rain and heat (version `1.7.2`)**, at the owner's request after playing 1.7.1 ("way too busy, please make a cross that exit that menu"; "the rain and the sunny doesn't seem like it's doing anything"). The owner chose to keep all three share buttons, and "sunny" meant ☀️ Hittegolf.
  - **Results:** a ✕ in the card's top corner goes to the start screen (Escape too). The Tuis button under the card is gone, so one button stays there (Oefen weer / Oefen / Nog ’n wedstryd). The share row (WhatsApp, Deel, Kopieer) is unchanged.
  - **Reën:** before, rain only lowered friction, which a flat landing never feels. Now a landing that isn't a Perfek skids with the rain: up to 26 px × strength over 0,45 s, slowing down, with a spray of drops. It stops before its middle passes the edge of the block below, so rain makes a tower crooked but never throws a Goed landing off by itself. In the rain a Goed landing no longer eases to the middle; a Perfek still snaps. The banner says which way ("Glibberig! Blokke gly na regs →"). The flood still rises twice as fast.
  - **Hittegolf:** the crane races at 1,5× (was 1,3×), eased in and out over 0,6 s with the heat, and its steel glows orange-red, pulsing.
  - **Code:** `WEATHER_TUNING.rainSkidPx` / `rainSkidMs` / `heatCraneMul` (config.js); `Weather.rainSkid()`, `heatLevel`, `craneSpeedMul` (weather.js); `GameScene.skidBlock` (eases can now slow down: `mul`); `Crane._glow`; `Effects.spray`; the rain banner text (strings.js); the results ✕ (dom.js, `.res-close` in style.css). `docs/SPEC.md` updated.
  - Today's daily plays a little differently for anyone who played it before this update (only in rain and heat); everyone after the update gets the same tower.
  - Tests: root **223/223**, server **152 pass + 1 skipped**.
  - Headless, **zero console errors**:
    - forced rain at 412×915 and 360×640: Goed landings slid 22–33 px with the rain, Perfeks stayed put, and skews past the edge fell as before;
    - dry, for comparison: no skid, and the Goed ease as before;
    - forced heat: the crane went from 1× to 1,5× over 0,6 s while glowing, and back to normal speed and colour afterwards;
    - the results ✕ and Escape at both sizes;
    - a daily (74,3 m) and a match against Robot Rikus;
    - the daily determinism run: identical, including a rain skid;
    - a normal visit (1.7.2 precached, 49 files).
- **Android app for Google Play (version `1.7.3`)**, at the owner's request ("I have created the developer account for the apps!! can you please create me the app"). The owner chose Stapel first, Google Play (organisation account "Lekker Local"), and building on the Mac.
  - **`app/`**, Capacitor 8.5.3: app ID `com.lekkerlocal.stapel` (fixed once uploaded), target and compile SDK 36 (Google Play's rule for new apps from 31 Aug 2026), minSdk 24, portrait on phones. Permissions: internet and vibrate. The version follows `js/config.js` (1.7.3 is versionCode 10703).
  - **Built and signed:** `.aab` 3,7 MB, plus a test `.apk`. The upload key is `~/Documents/Stapel signing/stapel-upload.jks`, with its password in the Mac's Keychain ("Stapel upload key") and a README beside the key. Java 21 and the Android SDK are in the owner's user folders.
  - **The web game is app-aware**, harmlessly so on the website:
    - `IN_APP`: no service worker, and share links use the website address;
    - the app counts as installed;
    - Escape and Android's back button share `goBack()`, now also on the Uitdagersreeks screens;
    - the safe-area probes also read Capacitor's `--safe-area-inset-*`.
    - `app/shim.js` adds Android's share sheet behind Deel, the back button (closes the app on the start screen), and the sponsor page opening on the website.
  - **Store material** (`app/tools/*.mjs`, all drawn by headless Chrome): adaptive launcher icons split from `icons/icon.svg`, a sky-blue launch screen, the 512 px Play icon, the 1024 × 500 feature graphic, five 1080 × 1920 screenshots, and the store texts in Afrikaans and English (`app/store/listing-*.txt`).
  - **For the owner:** `~/Desktop/Stapel app (Google Play)/` holds the `.aab`, the test `.apk`, the store pictures and texts, and "Google Play steps.txt", with every Play Console answer.
    - Suggested answers: contains ads (the sportscard.co.za house advert), data safety "no data collected" (true while the Worker is off), target audience 13+ (the owner's call).
  - Tests: root **223/223**. The store screenshots played the app's own files with zero errors.
  - **Not checked here:** the app on a real phone or the Android emulator (none on the Mac). That covers WebView rendering, the share sheet, the back button and edge-to-edge insets. The owner's internal-testing install is the first real run.
- **Server extras switched on (version `1.7.4`)**, at the owner's request ("I want those extras"). The owner's conditions: everything stays **free**, the server goes in the **Lekker Local** Cloudflare account, and sponsor sales will use **PayFast**, which the owner already uses (the payment code is still Paystack; switching it is step 2).
  - **Deployed:**
    - the Worker `stapel-borge` at `https://stapel-borge.bonkers-bunch-online.workers.dev`, in the Lekker Local account (`account_id` b67acf87… pinned in `wrangler.toml`; free plan);
    - another of the owner's Workers lives in the same account, and they share the free daily limits;
    - the D1 database `stapel-borge` (WEUR), with `schema.sql` applied; its id stays out of the repo (`~/.config/stapel/cloudflare.env`), so deploy with `server/wr.sh deploy`;
    - the Durable Objects for matches, created on the first deploy;
    - secrets `ADMIN_TOKEN` (also in the Mac's Keychain as "Stapel admin token", for `admin.html`) and `IP_HASH_SALT`. There is no Paystack key, so sales stay inactive.
  - **Game:**
    - `MATCH_API_URL` is set: live random matches, friend rooms (`?kamer=`), and the anonymous counts with the daily "beter as X%" line;
    - `SPONSOR_API_URL` stays empty, so sales are off;
    - the counts and percentile now follow `matchApiUrl()` instead of the sales switch;
    - `ALLOWED_ORIGINS` adds `https://localhost` (the Android app).
  - **Privacy page:**
    - wording updated: counts are sent when "ons bediener" is on; the summary names the live-match nickname and heights (≤ 7 days) and the Android app;
    - **still a template** (legal name, CIPC number, address, public email, phone, information officer), which blocks the Google Play submission.
  - **Checked against the real Worker:**
    - `/sponsors` 200; `/match/ghost` 404 with the app's origin allowed and others refused (403); admin 200 with the token and 401 without;
    - `/stats` and `/score` reachable (empty payloads refused, nothing stored);
    - two headless players were paired by the live lobby in 2,2 s and played; a friend room link worked;
    - every test match was ended within 20 s, so no recording was kept (`/match/ghost` still 404);
    - the website's Uitdagersreeks screen shows "Soek ’n teenstander", "Daag ’n vriend uit" and the computer; zero console errors;
    - root tests **223/223**, server **152 pass + 1 skipped**.
  - **App 1.7.4** (versionCode 10704) rebuilt with the server address. The Desktop folder and "Google Play steps.txt" are updated: data safety now declares the optional nickname and the game results/anonymous counts; the content rating says users interact (nicknames only, no chat).
  - **Open:** the owner's privacy details; the owner's OK to push 1.7.4; PayFast for sponsor sales (step 2).
- **Privacy link and Google Play (version `1.7.5`, live 7 Oct 2026):** a "Privaatheidsbeleid" link in the "Hoe speel ek?" sheet; app ID `com.lekkerlocal.stapel`; the app is on Play **internal testing** (the owner's family list), and the store listing and app content forms are done except the content rating (it waits for the owner's OK to accept IARC's terms). Production waits for the privacy page's business details.
- **Choose the punishment, a meaner Blouaap, Hanswors's foundation, a faster crane (version `1.7.6`)**, at the owner's request before letting friends and family test ("in challenge mode the challenger should choose the punishment to make it more interactive, also it needs to be more quick when you build it higher"; "the monkey doesn't feel like it's doing damage ... people need to think OH NO"; "the clown can add 1-4 blocks but then it lands it on a new foundation"):
  - **Uitdagersreeks:**
    - the first to a height mark chooses Blouaap, Skelm Sakkie, Mis or Hittegolf, with 5 s to choose; otherwise the mark's default goes. The bar is `showPunish()` in `js/ui/dom.js`; the flow is `askChoice` and `choose` in `js/duel.js` (`duel:choose` → `ui:duel-punish` → `duel:chosen`);
    - Mis and Hittegolf as punishments force 3 blocks of that weather (`Weather.force`), and the banner names the sender;
    - recordings and Robot Rikus choose by the seed (`botPunishment`). Penalties on a recording: Blouaap 3 m, Skelm Sakkie 4 m, Mis or Hittegolf 2 m;
    - server protocol 2: `choose`, `punish`, `attack`, `sent`, and the default after 6,5 s. A game older than 1.7.6 is never asked and only receives the default, so old and new versions can still play each other (`docs/CHALLENGE-SPEC.md`).
  - **Crane:** it speeds up three times as fast with height: `CRANE.omegaPerBlock` 0,045, `omegaMax` 3,6 (block 46), `omegaTop` 4,6 (with a heat wave on top).
  - **Blouaap:**
    - an alarm on arrival, and he fidgets just before he jumps;
    - then he hurls the top block into the sea (`monkeyHurl`) and stamps on the next 1–2 (`monkeyKick` 3,2–4,4), with 💥 and a big shake;
    - a block he moved is his doing until it comes to rest (`knockedUntil`, at most `knockMaxMs` 8 s), so a late fall never costs a heart;
    - cement never moves. On bot-built towers he cost 0–3 blocks a visit, usually 1, and never a heart.
  - **Hanswors:**
    - 1–4 striped blocks (`clownPlan().specs`);
    - before each one, everything on the tower that isn't on its way down sets as cement where it stands (`cementTower`). His block then goes flush on top (`giftPose`, the way a Perfek lands) and sets too, so it can't slide off. Then the toast "Nuwe fondament!";
    - an earlier try that dropped them loose lost blocks off tilted tops; with cement, 3 sets of 8 visits lost none.
  - The daily visitor schedule is unchanged (golden test). What each monkey and clown does is new.
  - Help text, README, `docs/CHARACTERS-SPEC.md` and the store texts (`app/store/`) describe the new monkey and clown.
  - Tests: root **228/228** (new `tests/duelchoice.test.js`), server **158 pass + 1 skipped**. Headless at 412×915 and 360×640, zero console errors: the monkey, the clown, the choice bar (tapped and timed out) against Robot Rikus, incoming Mis and Hittegolf.
  - **Live (deployed Worker + the live site):**
    - a script player and a real browser in a friend room: each chose a punishment for the other (Hittegolf arrived with "Toets Robot stuur Hittegolf!" and forced heat; the browser's Mis reached the script player);
    - a 1.7.6 game against a 1.7.5-style game: the old game got only the defaults, and the chooser heard what really went.
  - **Owner tool:** `GET /admin/runs` lists the recordings that lonely players get as opponents, and `POST /admin/runs {names}` forgets them (`server/README.md`). It was used once to remove two test matches that ran over 20 s. Live test matches must end within 20 s, or they are kept.
  - Fix: the default nickname "Bouer 455" failed the name rules (455 reads as a rude word), so it was refused. `defaultNickname()` now skips any number the rules refuse, and a test checks all 900.
  - Real players were already in the recordings on 7 Oct 2026 (QueenB, Klippie, Bouer 621).
- **House ad off for testing (version `1.7.7`, 8 Oct 2026)**, at the owner's request ("Please remove the sportscard.co.za ad, I want people to test the app so it might interfere"):
  - `sponsors.json` keeps the card's text with `"hidden": true`, and `cleanHouseCard()` drops a hidden card; switch it back by setting `false`;
  - the menu checked at 412×915 and 360×640: no card, nothing else moved;
  - the app ships its own `sponsors.json`, so 1.7.7 is rebuilt for Play internal testing too;
  - Play Console still says the app "contains ads" (sponsors are planned), which is the owner's call.
- **The punishment choice out of the way (version `1.7.8`, 8 Oct 2026)**, after friends and family tested ("They like it so far ... the pop-ups for sabotaging, there needs to be a easier way to click it without interfering"; and "Please do not make it that it pause first"):
  - the choice is a strip over the score at the top, not a bar over the bottom of the screen, where thumbs tap;
  - only its four buttons take taps (`pointer-events`), so a tap anywhere else still drops a block;
  - taps in the first 0,4 s are ignored (`PUNISH_GUARD_MS`), and keys 1–4 choose;
  - the game never pauses, so the time to choose went up from 5 s to 7 s (`DUEL.chooseMs`), and the server waits 8,5 s (Worker redeployed);
  - headless at 412×915 and 360×640: the strip clears the pause button, a tap mid-screen drops a block while it is up, an early tap is ignored, and a later tap or key 3 picks; zero console errors.
- **Blouaap waits for a Perfek; messages stay longer (version `1.7.9`, 8 Oct 2026)**, at the owner's request ("The monkey, can you make it that it shows up then if you do not have a perfect then it pushes the blocks, if you do have a perfect it shows 'Ek sal terug wees'"; "some words is a little to fast, so cant read it"; "Double check the physics please"):
  - he waits on his rope and judges the first block dropped after he came (`Visitors.landed`, called from `applyRating` and `markLost`):
    - a Perfek: after 0,85 s (once the "Perfek!" pop has faded) he shakes his fist with a speech bubble, "Ek sal terug wees!" (`vis_bubble_l/_r`, 1,8 s), then climbs away;
    - anything else: he jumps 0,25 s later;
    - no drop within `monkeyWaitMs` (10 s): he strikes anyway;
  - tapping him no longer shoos him: a tap on him drops the block like any other (only the thief is caught with a tap);
  - he fidgets while the player's block is in the air;
  - after his strike, the grace window stays open while the tower is still moving (up to `knockMaxMs`, 8 s), so a block knocked over by a knocked block never costs a heart;
  - banners and toasts stay until they can be read (`readMs` in `HudScene.js`: about 20 letters a second, 2,2–4,2 s), sayings 3,8 s, first-game hints 4,5 s.
  - **Physics checked**, stepped at 60 Hz:
    - the monkey's four cases on two towers (Perfek: leaves, 0 lost; Goed: strikes, 1–2 lost, hearts kept; a miss: exactly the miss's own heart; no drop: strikes at 10 s). Every tower came to rest, with no bad poses;
    - Hanswors's cement blocks sit flush, with zero overlap, and nothing moved;
    - the crane, old ramp vs new, for the same human-like bot (0–50 ms late) on three daily towers: the same low down, fewer Perfeks and lower towers higher up;
    - the daily tower stays identical for everyone (two runs with different randomness, same tower).
- **Privacy policy completed and published (8 Oct 2026)**, with the owner's details ("The name is correct, Reg no: 2026/492510/07, 39 Delport Avenue Oatlands, Krugersdorp. email is correct. Anandre Groenewald, and same email. Phone number, 081 264 6506, OK"):
  - `privaatheid.html` names the responsible party: Sportscard Trading (Pty) Ltd ("Lekker Local" on Google Play), 2026/492510/07, 39 Delport Avenue, Oatlands, Krugersdorp, 1739 (the postal code is from Play Console), lekkerlocal.apps@gmail.com, 081 264 6506. The Information Officer is Anandre Groenewald;
  - the template banner and the owner notes are gone. The page now says Stapel is for players of 13 and older (Play's target audience), that sponsorships aren't open yet, and that live matches and counts run on Cloudflare (D1 in Western Europe). Google Play is listed;
  - the Regulator's POPIA complaints address is now POPIAComplaints@inforegulator.org.za (checked 8 Oct 2026); its address is unchanged and its phone is 010 023 5200;
  - `SPONSOR.privacyVersion` is `2026-10-08`. `SPONSOR.contactEmail` is set, so the pages show "Kontak ons";
  - **owner reminders** (from the removed notes):
    - register the Information Officer with the Information Regulator (inforegulator.org.za, eServices);
    - delete former sponsors' contact details by hand within 24 months (admin page "Skrap"); the server doesn't do it;
  - `terme.html` (sponsor terms) is still a template, until sponsor sales (PayFast) open.
- **Coins, power-ups, the Winkel, duel looks, ranks and seasons (version `1.8.0`, 8 Oct 2026)**, at the owner's request ("I need powerups that is part of a point system, for example, a foundation block that is implemented after lets say 55 Meters then you can press it then its a long black that drops, then people can buy coins to get powerups"; on matches: "What can we do for people to want to buy stuff in duals, that is the challnging part."). The owner chose earned coins first (no real money yet) and all four match extras (player card, win celebration, punishment looks, ranks and seasons). Production on Google Play waits for this release.
  - **The rules** are one pure module, `js/core/economy.js` (tested in `tests/economy.test.js`).
  - **The wallet** has its own localStorage key, `stapel.v1.econ` (`stapel.v1.debug.econ` with `debug=1`), sanitised on every read like the rest. An older version still open in a tab rebuilds `stapel.v1` from the keys it knows, so the wallet must never live in it. Every purchase reads the latest wallet first, so two tabs can't undo each other's coins.
  - **Coins 🪙** (earned only):
    - Oefen: 1 per 5 m and 1 per 5 Perfeks;
    - the daily: 1 per 4 m, +10 for playing and +2 per streak day (up to +14), never capped;
    - a match: 15 for a live win, 5 for a live loss; 8 and 2 against Robot Rikus or a recording;
    - Oefen and matches stop paying at 150 a day (`EARN.dayCap`);
    - the results card shows what a game paid and your total;
    - a daily cut short (the page closed, the app killed or crashed mid-game) counts as it stood and pays on the next start (`payRecovered` in `js/main.js`; the "onderbreek" toast shows the coins).
  - **Power-ups (Oefen only)**, bought in the Winkel and used from a tray in the game:
    - 🧱 Fondamentblok (40): the next block is a long dark slab that lands flush, sets everything under it like cement and counts as `F` in the grid;
    - 🐢 Stadige hyskraan (25): 5 blocks at 60 % speed (counted at each drop, so it's 5 whenever it's switched on);
    - 🛡️ Skild (30): the next Blouaap or Skelm Sakkie bounces off. It is used up at the bounce, so a thief caught by hand first leaves it on;
    - ❤️ Ekstra hartjie (35): a heart back (only below the maximum).
  - **The daily stays fair:** no bought power-ups, but everyone gets one free Fondamentblok at 55 m (a toast and the 🧱 button; once per daily). No power-ups in matches.
  - **The Winkel** (a dock button showing your coins): power-ups with what's in your bag, and looks with your player card as a preview. A new look is worn at once, and the celebration has a "Wys" preview.
  - **Match looks** (show-off only, never strength): a frame, a badge, a title, a win celebration and a visitor style.
    - Your card goes out with the hello. The server keeps known ids only (`cleanCard`) and passes it on at the start (`docs/CHALLENGE-SPEC.md`). Robot Rikus has his own card (`BOT_CARD`); recordings and links show the default.
    - The opponent sees your card on "Teen <naam>!", your badge on the race track, your style on the Blouaap or Skelm Sakkie you send (🧢 🕶️ 🎩 👑, `ACC_FIT` in `js/game/visitors.js`), and your celebration when you win ("<naam> vier!", without the fanfare).
    - Vuurwerk is 🧨: 🎆 falls as square picture tiles.
  - **Ranks and seasons:**
    - Brons 0, Silwer 100, Goud 250, Platinum 450, Diamant 700 points; a live win +25 / loss −10, otherwise +10 / −5;
    - a season is a calendar month. At the first match or the first visit to the Uitdagersreeks screen in a new month, the points halve and the old season's best rank leaves a badge (🥉🥈🥇💠💎, with a toast). Diamant also unlocks the Diamant frame. Only a later month counts: a phone clock set back changes nothing. The card sent to opponents already uses the new month's rank;
    - the Uitdagersreeks screen shows the card, the season, the rank, the points, a bar to the next rank, how points work, the badges and a button to the looks;
    - ranks live on the phone (no accounts), so a determined cheat could fake theirs. It's a show-off only.
  - The duel screens now centre their card only while it fits (`margin: auto`, not `justify-content: center`), so a long card on a small phone scrolls from the top.
  - **Checked** (8 Oct 2026):
    - `npm test` 240 pass; `cd server && npm test` 158 pass, 1 skipped;
    - headless at 360×640 and 412×915, with zero console errors:
      - power-ups: the Fondamentblok lands flush, frozen and level, with its 🧱 cell on the results; the slow crane runs at ×0,6 for exactly 5 blocks, switched on with or without a block on the hook; the shield bounces a monkey, and a thief caught by hand leaves it on; the heart works only below the maximum;
      - the daily's free Fondamentblok comes once at 55 m; no tray in matches;
      - the Winkel: buy, wear, too poor;
      - coins on the results (Oefen, daily, match); a daily cut short by a reload paid +15 🪙;
      - against Robot Rikus: player cards, the badge on the race track, every style on both visitors (close-ups), and both celebrations;
      - the rank screen: September's 300 points became October's 150 with the 🥇 badge, once;
    - the daily is still identical for everyone (two runs with different randomness);
    - the monkey's four cases, Hanswors's flush cement blocks, and the crane are unchanged from 1.7.9;
    - a review agent read the whole change. All six of its findings, and both small ones, are fixed (in the points above).
- **English (version `1.9.0`, 8 Oct 2026)**, at the owner's request ("And I think to make it english, what do you think?"). Most South African phones are set to English, even for Afrikaans speakers, so the owner chose a one-time picker over following the phone's language.
  - **The text:**
    - `js/core/strings.js` stays the Afrikaans source;
    - `js/core/strings.en.js` has the same keys and shapes in English;
    - `tests/i18n.test.js` checks the shapes, that every English text is filled in, and that none reads as Afrikaans;
    - `js/core/i18n.js` lays the English over the Afrikaans in place (`setLanguage`), so the code keeps reading `S.x` as before.
  - **Start-up:** `js/core/langboot.js` is the first thing `js/main.js` imports. It reads the saved language before any other module loads (some keep text from when they load) and sets it. Changing the language reloads the page, because drawn text and textures keep their words.
  - **Where it's kept:** the choice has its own key, `stapel.v1.lang`, like the wallet, so a tab on an older version can't drop it.
  - **First start:**
    - a new player sees "Kies jou taal · Choose your language" (Afrikaans / English) once; Back keeps the language shown;
    - players from before 1.9 (anything played, or the first-game hints seen) stay in Afrikaans and are never asked;
    - a challenge link waits for the choice, and survives the reload into English;
    - `?lang=en` (or `af`) previews a language for one visit; a new player who arrives with it keeps it.
  - **Switching later:** the menu's 🌐 button (top left) opens the same picker.
  - **What stays Afrikaans:**
    - the characters' names (Blouaap, Hanswors, Skelm Sakkie, Robot Rikus) and "Bouer" in default nicknames;
    - the sayings are picked from the Afrikaans lists as before (the same for everyone), and English shows the closest real English saying for each (`SAYINGS_EN`), e.g. "Hou die blink kant bo" → "Look on the bright side". (1.9.0 showed the Afrikaans with its meaning; the owner asked for English.)
  - **Numbers and dates:** English uses a decimal point (37.5 m) and English day and month names (`js/core/format.js`).
  - **Not translated yet:** the sponsor pages, `privaatheid.html` and `terme.html`. An English privacy page would suit the English store listing. The store texts in `app/store/` mention both languages.
  - **Switching:** the address carries the new language (`?lang=`, which comes off the address at start-up like the challenge links), so a switch works even where nothing can be saved. A double tap can't start a second reload. The page title follows the language.
  - **A review agent read the change.** Fixed from it:
    - no storage, a `?lang=` link with 🌐, a double tap on the first picker;
    - "50.0 m" on the duel flag and the ruler (`fmtMShort`);
    - the title, and the house ad's label;
    - the saying toasts stay longer when the meaning makes them long;
    - hearts everywhere (not lives); "vs <naam>!"; plainer English in places;
    - short meanings for the sayings ("Dit staan soos ’n paal bo water" means there's no doubt about it).
  - **Checked** (8 Oct 2026):
    - `npm test` 246 pass;
    - headless, at 360×640 and 412×915, with zero console errors:
      - the first-start picker; English everywhere (menu, game, HUD, results, shop, the Challenger Series, the link screen);
      - 🌐 back to Afrikaans; a player from before 1.9 not asked; Afrikaans chosen without a reload;
      - a challenge link kept through the reload, even with a double tap;
      - no storage; a `?lang=en` link followed by 🌐; "🏁 50 m";
    - all the 1.8 checks again in Afrikaans (24 runs, both sizes);
    - the daily is still identical for everyone.
  - **Seen, not changed:** if a player drops just as Blouaap's 10 s run out and the block misses, the strike's grace covers that miss too (no heart lost). This has been so since 1.7.9, and is rare.
- **Smoother, and fixes from testers (version `1.9.1`, 8 Oct 2026).** The owner and a tester reported:
  - "the shadow of the block sometimes lags";
  - the shop's ✕ did nothing;
  - the menu's bottom labels were "a little off balance";
  - "the monkey ... doesn't line up" (the hats on Android);
  - "it shows a notification let's say 30, but it's the amount of coins".

  What changed:
  - **No more stalls while aiming.** Measured frame by frame, the GameScene update took up to ~27 ms. It now peaks at ~5 ms in the headless check:
    - a block's texture used to be drawn in the frame it arrived on the crane. Textures are now drawn ahead (`prewarmTextures`): the first few at the start, then two at a time while each block falls;
    - the weather banner's emoji (and the weather chip's) cost 12.5 ms in that same frame. They are drawn once into textures, one per frame early in the game (`emojiTexture` in `HudScene.js`);
    - the flood tag's 🌊 is drawn once, apart from its number, and the number redraws once a second (it was 4 times).
  - **The ✕ on every sheet works.** The shop's head was positioned and painted over the ✕, so taps hit the head. `.sheet .close` now has `z-index: 2`. A new check taps every button on every screen and sheet, at both sizes and in both languages, and confirms none is covered. It found nothing else. The celebration "Wys / Try it" preview was a 32×15 px word; it is now a button 32 px high.
  - **The menu's bottom row:** five equal columns, one line each. The how-to button reads "Speelreëls" / "Rules"; its sheet keeps "Hoe speel ek?".
  - **Hats fit every phone.** `js/core/emojifit.js` finds the head in the glyph's own pixels: the biggest blob in the top 22 % (Noto's monkey has its tail curled up beside its head). Hats sit on the head and sunglasses on the eyes, sized to the head:
    - in the game (`accessoryFit` in `visitors.js`, cached per visitor and style; the old fixed offsets remain the fallback);
    - in the shop's Straf-styl previews (`stylePreview`, a canvas).

    Checked with Apple's emoji and with Google's Noto Color Emoji (`?emojifont=noto` makes Noto win, for tests).
  - **Coins on the Winkel button** show as a coin pill ("🪙 30"), not a notification-style count.
  - **English sayings:** an English saying for each Afrikaans one (see 1.9.0).
- **The daily leaderboard (version `1.9.2`, 8 Oct 2026)**, at the owner's request ("to confirm who has the highest tower?" — "Yes please").
  - **Server:** `server/src/board.js`, the tables `daily_board`, `daily_board_days` and `daily_board_hist` (`migrations/0003_board.sql`, also in `schema.sql`), routes `POST /board` and `GET /board`, and the admin route `/admin/board` (`GET` lists a day's top 50 with player numbers; `POST` blocks, unblocks or removes an entry).
    - One row per player per day: a random player number made on the phone, linked to nothing; the nickname, through the name rules; the height; and the blocks and seconds, which only feed the plausibility check.
    - The first post of a day is kept; later posts change only the name or the hiding. An entry the owner **blocked** stays hidden whatever the player posts later.
    - Impossible towers are refused with 422: more than 4 m a block (+8 blocks Hanswors brings), more than a block per 0,7 s, or a climb faster than 2 m/s after 10 m. Real games: about 1,7 m a block, under 1 m/s. A forger who stays inside these limits can still get on the list: block them with `/admin/board`.
    - A day's result is taken only while it is that day somewhere on earth (UTC+14 to UTC-12), or up to 6 hours after.
    - Places are true places: a hidden or blocked player keeps theirs.
    - **D1 rows read** (the free plan allows 5 million a day): no answer reads a whole day. The top is read in order and stops after 40 rows; the number of players is a counter; a place below that adds up a count per whole metre and reads only its own metre's rows. Measured in local D1: at most about 90 rows an answer with 100 players, 160 with 1 000, 260 with 3 000 (was about 7 per player).
    - Kept 30 days (cron; a failure there is logged as `board_prune_failed` and doesn't stop the rest of the nightly job). Rate limits per hashed address: 60 posts and 240 reads an hour.
  - **Game:** `js/board.js` (post and get, answers checked) and the store's own key `stapel.v1.board` (player number, hidden, last posted day, a change not yet confirmed).
    - After a daily, the results card shows "🏆 Jy is #23 van 140 vandag" with a Ranglys button; that button opens the board of the result's own day (a game that ran past midnight).
    - The sheet shows the top 10 (🥇🥈🥉, with the place for screen readers), your own row in its place, and a "Wys my op die ranglys" switch.
    - Statistiek has the button too (today's board).
    - Changing your nickname or hiding re-posts the latest result. The sheet says "Stoor…" while it goes, and "Nog nie gestoor nie: ons probeer weer…" when it didn't arrive; the change then goes with the next board request or the next start. Requests go one after the other, each with the latest choice.
    - A player without a nickname is "Bouer 123" with the same number every visit (from the board number), on the board and in the Uitdagersreeks.
    - An answer less than a minute old is shown again without asking the server.
    - Only with the match server. A debug session never posts on the live site; `?board=1` works only on localhost (tests).
  - **Privacy page:** a new section 2c (the leaderboard: what is sent, who sees it, hiding, removal on request, 30 days). Section 2 now says which player information is kept (nickname and random number) and asks players not to use their full name. Section 5 says who sees the board, section 6 names it under Cloudflare, and section 7 has the 30 days. Section 11 says what leaves the phone and lists `stapel.v1.econ`, `.lang` and `.board` (the keys from 1.8 and 1.9 had been missing).
  - **Review:** a review agent found 9 problems before anything went live, all fixed: the hide switch could fail silently; an admin hide came undone with the next post; forged towers up to about 1 000 m passed; every answer read the whole day; 12 posts an hour per address was too few; debug sessions could post; a cron failure skipped the rest; the default name changed every visit; and past midnight the button opened the wrong day.
  - **Checked:**
    - server tests: ranking, ties, hiding, re-posts, impossible towers and real ones, the day window, names, the top size, the origin, rate limits, places far below the top against a full sort (150 players), the owner's block after a re-post, unblock and remove, pruning all three tables, and the cron going on when the board's cleanup fails;
    - game tests;
    - end to end in the browser against `wrangler dev --local` (requests to the live Worker re-routed to it): a real daily posted, the place shown, the sheet, hiding and showing, both sizes, Afrikaans and English.
  - **To go live:** run the migration once on the live database, deploy the Worker, push, update Play's Data safety form (the nickname and the random player number now leave the phone), and upload the app (asked first). **Done 8-9 Oct 2026** (see "1.10.0 is live" below).
- **What the testers asked for, and reasons to come back (version `1.10.0`, 8 Oct 2026).** The owner passed on testers' notes ("the bar on the right seems to bother the people", "the bad stuff comes a little too quick", "the hans wors needs to be a good thing", "the counter balance is not that great", "the words at the bottom is hidden", the U block "please flip it", a ✕ on the Uitdagersreeks, a tutorial, and "I really need a hook for people to return"). Built on top of 1.9.2 (the leaderboard, still not live).
  - **Stages** (`config.js STAGES`, used by `core/sequence.js` and `core/visitorplan.js`): blocks 0-11 are calm (no weather, no visitors), then "Moeiliker!" (block 12: mild weather every 5-8 blocks, Blouaap and Hanswors), "Nog moeiliker!" (block 30: storms, hail, gusts, Skelm Sakkie) and "Op sy moeilikste!" (block 55: the old pace). Each is announced with a banner; no weather or visitor starts on that block. **Every day's weather and visitors changed** (golden tests updated): a daily played on 1.9.x and on 1.10 differs.
  - **Hanswors is a friend:** one big log (`log` shape, 260 px, drawn as a log) laid on top and set as cement, a wide new floor (was 1-4 narrow gift blocks). **5 Perfeks in a row bring him too**, in every mode (`Visitors.reward`, keyed by its number; `SCORING.rewardStreak`).
  - **The U block:** the arch is flipped: a flat beam with a shallow cup every block can bridge.
  - **Uitdagersreeks:** the race track on the right is gone; the other player's height is one line under the points (gold while you lead). Its screens have the ✕. **Friend rooms survive sharing the link from another app:** a dropped wait reconnects to the same room (1, 2, 4, 8 s, until the room's time is up), and while the game is hidden the room connection is closed so a match never starts unseen ("Koppel weer aan…"). Server unchanged.
  - **The balance meter** (was "Wankel", only motion): "Balans" now shows how near the loose top is to tipping (per level: the centre of mass of a block and everything above it against the part of the block under it it stands on), with an arrow to the heavy side. Checked headless: blocks stay while their middle is over the support and fall once it isn't; a counterweight works.
  - **Messages:** a toast showing when a banner comes slides above it (a visitor's instructions were hidden under "25 m — Klein maar dapper!"). **"null"** no longer shows on the daily card for a returning player (live since 1.7: `append(null)`), under the results or in an empty Statistiek (`put()` in dom.js).
  - **New players:** "Hoe speel ek?" opens by itself (once, `settings.howtoSeen`); its "Kom ons bou!" starts **the short lesson**: an Oefen game (seed `stapel-les`) with a card at the top (tap, aim for a Perfek, Perfeks in a row, water and hearts, "Jy is reg!" with "Speel vandag se toring"), skippable; the first-game hints stay quiet meanwhile. "Probeer die kort les" in the how-to for anyone.
  - **Die weekkis** (`core/week.js`, key `stapel.v1.week`): a box for each day the Daily Tower is played (10, 15, 20, 25, 30, 40, then a day-7 chest of 75 coins + a Reeksskild; the first full week also the title "Getroue Bouer", never sold). A missed day starts over unless Reeksskilde cover it (50 coins in the Winkel, at most 2). The strip on the daily card, the box on the results; recovered dailies open theirs too.
  - **The daily reminder** (the Android app only, `@capacitor/local-notifications` 8.3.1, key `stapel.v1.remind`): asked once after the first Daily Tower (08:00, 13:00, 18:30 or no); a week of messages planned ahead (re-planned at start, back in the app and after each daily), none on a day already built, the week chest's box every other day. Statistiek → "Herinnering". Never exact alarms: `isExactNotification: false`, and `SCHEDULE_EXACT_ALARM` removed in the manifest (Play allows it only for alarm/calendar apps). Notification icon `res/drawable/ic_stat_stapel.xml`.
  - **Challenge links in the app:** an App Links intent filter for `/Toring/` (not the privacy and sponsor pages); `app/shim.js` takes the launch link (reload with its query, once per visit) and links that come while it runs (`stapel:link`; mid-tower, it waits for the home button). Android verifies it through `https://anandregroenewald.github.io/.well-known/assetlinks.json`, which needs the owner's **user site repo `anandregroenewald.github.io`** (doesn't exist yet) with the Play app-signing and upload certificates' SHA-256. Until then links open in the browser, where an Android phone gets "Maak oop in die Stapel-app" (an `intent:` link).
  - **Also:** the nickname saves while typing and when the game is left; the version shows under Statistiek ("Weergawe 1.10.0"); the how-to explains the stages, the log and the balance meter.
  - **Checked:** unit tests (rooms reconnecting, the week, stages, the log), and headless runs of the lesson, the stages, the log and the reward, the duel line, the reminder and links (with a fake of the app), the balance meter, a null scan of every screen, the button audit.
  - **To go live:** the owner decides whether the 1.9.2 leaderboard goes live with it (else it stays switched off); the root site for App Links; Play's Data safety (unchanged by 1.10 itself); then push and upload 11000 (asked first). **Done 8-9 Oct 2026**: the leaderboard went live with it (see "1.10.0 is live" below).
- **1.10.0 continued (8-9 Oct 2026): the review's fixes, a new address, Back, and the search.**
  - **A second review** (all of 1.10) found 12 problems, all fixed in `a6d592c`:
    - a challenge link abandoned a paused tower;
    - a reconnect could start a match against the player's own dead connection: the room's hello now carries a `key`, and a reconnect replaces its old seat (`server/src/match.js`); the lobby pairs only the same `DUEL.rules`;
    - the app swallowed `?klop=` links;
    - new players who kept Afrikaans never got the how-to or the lesson;
    - a T's foot dropped into the U's cup: the U's body is now one solid block and the cup is only drawn;
    - "open in the app" left the page's own room join running;
    - reminders promised boxes a lapsed player wouldn't get;
    - a toast could stick; the lesson card stayed over the results;
    - a launch link could reopen from Recents;
    - a Reeksskild was spent after a full week;
    - and smaller ones.
  - **The new address: https://stapelspel.pages.dev/** (the owner didn't want their name in links).
    - It is a Cloudflare Pages project `stapelspel` in the Lekker Local account (free). It was created with `wrangler pages project create --force`: wrangler 4.148 otherwise makes a Workers site on the account's workers.dev name.
    - **Deploy:** `node tools/build-pages.mjs && (cd pages-dist && ../server/node_modules/.bin/wrangler pages deploy . --project-name stapelspel --branch main)`. The build adds `.well-known/assetlinks.json` and `_headers`.
    - **Push the repo too.** GitHub Pages still serves it, and `js/moved.js` (loaded first by every page) sends visitors of `anandregroenewald.github.io/Toring/...` to the same page at the new address.
    - **The hand-over:** it brings along the player's `localStorage` (`stapel.*`, in the link's `#move=`). The new address takes it only from the old one (referrer), and never over newer data.
    - **Other places the address lives:**
      - the Worker's `SITE_URL`, and `ALLOWED_ORIGINS` (both addresses);
      - `SITE_URL_FALLBACK`; `app/shim.js`;
      - the App Links filter (the new host only: old links open in the browser and forward; its assetlinks.json, built from `app/applinks/`, has the app signing key 07:59:B5:9A…15:EB and the upload key 77:FE:71:55…1C:F4).
    - Pages drops `.html`: `/privaatheid.html` answers 308 to `/privaatheid`.
  - **The website's Back button** goes one step back everywhere (a sheet closes, a tower pauses, a screen goes home). It leaves only from the bare menu (`ui:view` → `syncBackGuard`). The app already did this.
  - **Find an opponent without a time limit:**
    - The search runs until someone comes (no 20 s fallback). The waiting screen (`state: 'lobby'`) offers "Oefen terwyl jy wag" (an Oefen tower meanwhile, with a "Soek ’n teenstander…" chip and its ✕) and "Speel dadelik" (a recording or Robot Rikus).
    - When someone comes, the practice tower is paused (not restarted: that would close the match's socket) and "Teen <naam>!" starts the match.
    - The lobby reconnects, closes while hidden, and pings every 25 s.
- **1.10.0 is live (8-9 Oct 2026).** The site (both addresses), the Worker with the leaderboard (migration 0003 on the live database), and the app: 11000 is out on internal testing, and on the closed test (Alpha) once Google's review passes.
  - **Play Console (9 Oct, sent for review together with the closed test):**
    - Data safety adds "Device or other IDs" (the random player number: collected, not shared, required, app functionality), next to Name and App interactions. The Delete data URL is now `https://stapelspel.pages.dev/privaatheid#p9`.
    - Privacy policy: `https://stapelspel.pages.dev/privaatheid`. Store settings → Website: `https://stapelspel.pages.dev/` (published at once).
    - Play also listed "Testers: Remove feedback channel". Nobody changed it: the closed test's "Feedback URL or email" field is empty. Put an address there if testers should see one.
  - **Checked on the live site (9 Oct):**
    - The leaderboard round trip: a hidden test entry was posted from the new origin, read back, and removed with the admin token, so the count went back to 0.
    - Random pairing through the live lobby took 2.3 s.
    - Invites for brand-new players, in Afrikaans and in English: the language choice comes first, then the friend's room (both players in the match in about 4 s), "race my run" (the challenge screen) or "beat my tower" (the chip, plus the how-to).
    - A first visit without test switches works: the how-to, the menu with the week chest, the shop and the board closing on Back, and the service worker at `stapel-v1.10.0`.
    - The old address forwards a player's progress. `assetlinks.json` has both keys.
    - Tests: 271 and 171 (+1 skipped) pass.
  - **1.10.1 (`d302efe`; went live with 1.11.0 on 9 Oct, after the owner's "push once done"):** a copy of the old address that was added to a home screen showed the game with a browser bar ("Address bar + ✕"). The forward to the new address leaves the installed app's own address. The fix:
    - `js/moved.js` leaves an installed copy where it is (display-mode standalone, fullscreen or minimal-ui, or iPhone's `navigator.standalone`);
    - `siteUrl()` gives the new address there, so shared links never carry the old name.
    - Tested headless: an installed copy stays, with its coins, and its room link is `https://stapelspel.pages.dev/?kamer=…`; a normal tab still forwards; `move110` still passes.
    - To go live: push, then deploy Pages. The Play app is unaffected.
  - **Left to tidy:**
    - wrangler's leftovers in the repo root (the `package.json` change, `package-lock.json`, `wrangler.jsonc`, `node_modules/`), from the first `pages project create`: delete them, never commit them;
    - the worktree `~/Desktop/Toring-search` (branch `claude/search-practice`, merged). **Keep** `.claude/worktrees/agent-a1516b63df4322d9e`: it holds the parked PayFast branch (`dd2163d`, not merged).
- **1.11.0 (9 Oct 2026): Blok vir Blok, both players' hearts, real tipping, a quarter harder.** The owner passed on: players "do not even know that they are playing against someone"; then a "you drop one, I drop one" mode (named Blok vir Blok, after Kop-aan-kop and Stapelstryd); "the hearts needs to be visible for both sides" (you top left with your name, them top right); the joker = "the feature that sabotages the other player"; then testers: "the physics aren't working", "a little too forgiving now… up the ante by about 25%", and a lone "Oefen" button after a tower.
  - **Two modes** on the Uitdagersreeks screen, kept in `stapel.v1` `duel.mode`: **Wedloop** (`'race'`, the existing match) and **Blok vir Blok** (`'turns'`). See `docs/CHALLENGE-SPEC.md` "Two modes". The lobby pairs only the same mode; friend rooms carry it (POST `/match/room` `{mode}`); the game's protocol is 3 (older games are told a Blok vir Blok room is gone).
  - **Blok vir Blok** (`js/core/turns.js`, the referee; `server/src/match.js` `onTurnMessage`; `js/duel.js`; `GameScene` "Blok vir Blok" section):
    - one tower, a block each in turn, 10 s to aim, 3 hearts each (a turn that loses blocks costs one), no weather, visitors, flood or log;
    - 5 Perfeks in a row (your own) earn a joker: Mis, Hittegolf or Reën on the other player's next block;
    - the game whose turn it is plays it and reports the tower (`drop` with the exact start state and the crane's swing time, then `settled` with every loose block exactly); both games apply the report the same way and hold the tower still between drops. Checked live through the real server code: 34 turns, both towers identical after every turn (difference 0.0);
    - Robot Rikus plays it locally (think time, aim error, more errors under a sabotage).
  - **HUD:** in both modes each player's name and hearts at the top; Wedloop's race track on the right is back, a little bigger, with names and percentages and "X is voor!"; Blok vir Blok's "Jou beurt! 10" pill. Wedloop height reports carry hearts (`state.lives` -> `opp.lives`).
  - **Physics:** Matter let a slowly tipping stack fall asleep, so a tower leaning past its edge could hang there. Every 4 physics steps the blocks whose load is past the edge of their support (the balance meter's numbers, `towerLean`) are woken (`wakeTipping`), and neither a Perfek's cement nor the deep cement sets such a block.
  - **A quarter harder** (measured over a year of dailies, first 45 blocks: weather +23%, visitors +24%): stages from blocks 9 / 23 / 41 (were 12 / 30 / 55), weather gaps [4,6] / [3,5] / [2,3], visitors [12,18] / [11,17] / [9,17]; a heart back every 4th Perfek (was 3rd). `DUEL.rules` 111. Golden tests updated.
  - **Results:** after a tower, "Oefen" and "Uitdagersreeks — Speel nou teen iemand" side by side after the card (they no longer float over the city and the streak).
  - **Review** (agent, before release): 13 findings, the real ones fixed: a connection lost in the 3-2-1, the other player's Perfeks, the combo badge after a match, the aim time after a pause (moved on; live capped at 38 s), slides stopped by the report, hearts flicker, Robot Rikus and fog, a report that doesn't fit the turn (checked on both sides, `snapFits`), one storage write per turn.
  - **Deploy order:** the Worker first (an old lobby or room would ignore `mode` and play Wedloop), then the site.
  - **Live 9 Oct 2026 ~11:50:** Worker deployed, pushed (with 1.10.1), Pages deployed (`stapel-v1.11.0`). Checked live:
    - a Blok vir Blok friend match (6 turns, both towers identical, quitting);
    - random pairing per mode (Blok vir Blok players paired, never with Wedloop);
    - Wedloop hearts live ("Elsa 3/4");
    - new-player invites (af/en, in the match in ~4 s);
    - a first visit.
  - **The app:** 1.11.0 (11100) (`~/Desktop/Stapel app (Google Play)/Stapel-1.11.0.aab` and `-toets.apk`). On the owner's "Yes please" it is published on internal testing and sent for Google's review on the closed test (9 Oct ~12:20). Google had approved the 1.10.0 closed test overnight. The closed test's feedback box is empty: the owner's choice; a tester's Gmail had been typed there, and that tester is on the "Family" list.
  - **Testing note:** `wrangler dev` hangs at "Starting local server" in this environment (and the miniflare smoke test is skipped). Two-player tests ran the real `server/src/match.js` in node behind real WebSockets instead (a scratch `matchhost.mjs`: in-memory DO state, the alarm on a timer).
- **1.12.0 (9 Oct 2026; LIVE ~22:20 on the owner's "Great please proceed"): smooth watching, Blok vir Blok rondtes, the sea, height zones, ranks, emojis, Nog 'n kans.** The owner passed on: the guys at work love Blok vir Blok but it is "a little boring" without any features, and it must be "fair"; "my side is perfect, but as soon as they play it lags on my screen, not on their screen and visa versa"; "please check the physics and balancing because something does not add up… the water need to indicate clearly that block are beneath the sea"; "after 50 meter it needs to show a different picture then after 100 meter then 200 meter etc."; then ranks like CS:GO (one per challenge, "Gold Nova 2 — 70%", lose points on a loss, "a lot of ranks"; design proposed, waiting for three answers) and "I need emojis" (asked: emoji reactions in a match?).
  - **Smooth watching** (`GameScene` onTurn/beginTurn/onRemoteGo/beginPending/onRemoteDrop/releaseRemote/onRemoteSettled/watchStep/applyRemoteReport/endReplayNow; `js/duel.js` 'go', 'k'; `server/src/match.js` relays): the watching game's crane had swung on and the drop came a round trip later, so the block jumped back (measured 32-89 px at 0.1 s each way). Now the player's game says `go` when its turn begins, the other game shows the turn 0.25 s behind it (more after a late drop, at most +0.25 s per late drop, up to 0.7 s; it shrinks again with time to spare), the block leaves this crane exactly at the moment it was let go, and the report (`k` = physics steps from the drop) is applied at the same step of the replay. The watching player's own next turn starts when that replay ends (at most 4 s; at once when the game comes back on screen), and its time to aim counts from when the turn came (live cap 38 s, as before). After: jump 0-2 px, no late drops; with uneven delays up to 0.4 s, one early jump, then smooth. Protocol 4 (`go`, `k`, `visit`, rounds; `opp.v` in the start). A 1.11 game still plays (its turns show 0.35 s after they came; its report applies when the tower here is calm).
  - **Rondtes** (`js/core/turns.js` turnRounds/roundFor/referee; `TURNS.rounds`; `docs/CHALLENGE-SPEC.md` "Two modes"): from turn 8-9 the same weather (wind, rukwinde, reën, storm, hael, mis, hittegolf) or visitor (Blouaap, Skelm Sakkie) for both players on back-to-back turns, exactly the same (the round's seeded stream); rounds an odd number of turns apart, so who faces one first takes turns; never on a stage's first turn (its banner: 7 Moeiliker / 19 Nog moeiliker / 35 Op sy moeilikste); "Volgende rondte: … vir albei!" the turn before. A sabotage never lands on a round's turn. Blouaap: a Perfek scares him off, else he strikes (no heart, as in the daily); Skelm Sakkie: the block waits on the crane while he climbs (tap him: caught; else he steals the top loose blocks, no heart); **beating the visitor gives a heart back** (max 3; `TURNS.visitorHeart`). Weather in a turn (`Weather.turnStart/holdStep/turnDrop/turnBusy/clearHail`): shows from the turn's start, nothing pushes the held tower, everything physical counts from the drop from the same state in both games; hail 0.3-2.6 s after the drop, one lightning strike 2 s after it, hail cleared at every turn's end, a round's turn settles in up to 9 s. On the watching game Skelm Sakkie is a puppet that does what `visit` says at the same moment. Only when both games are 1.12 (else the match plays as 1.11 and the 1.12 player hears so). Robot Rikus plays rounds too.
  - **The sea** (`js/game/water.js`): clearer near the surface (alpha 0.42 / 0.6 / 0.86, was 0.7 / 0.8 / 0.87) and every block under the waterline tinted blue, darker with depth, per corner (`underwaterTint`, `GameScene.updateUnderwater`), so the drowned tower reads as the tower standing on the island; bubbles rise off it; now and then a fish swims past. **Cement** is drawn darker and cooler (`FROZEN_TINT` 0xb9c1cc), so it shows which part can still move.
  - **Physics check (findings, nothing changed in the feel):** the balance meter measures only the loose top (cement can lean and never falls); friction is high (static 1.2: blocks hold on slopes up to ~50°, real ones slide at ~25-30°); a Perfek snaps to the centre and a Goed slides 60% of the way by itself; the water made the base look missing. Lower friction would change every tower's feel and difficulty: asked the owner.
  - **Height zones** (`js/core/zones.js`, `BgScene._updateZones`, banners in `GameScene.checkMilestone`): 50 m "Bo die wolke!" (a sea of clouds over the bay with the mountain's top through it, hot-air balloons, paragliders), 100 m "Hoog in die lug!" (aeroplanes with trails, a helicopter), 200 m "Ruimte se rand!" (the Earth's curve, stars, a satellite; the bay and the mountain gone), 300 m "Die ruimte!" (a planet, a big moon, rockets), 500 m "Tussen die sterre!" (the Milky Way, shooting stars, a UFO). One banner per zone per tower (no saying toast on top of it).
  - **HUD:** a toast that comes while a banner shows sits just above it at once (it used to wait, and arrived a turn late over the next banner); the turn pill carries the round's emoji and says "their turn" while it waits to show.
  - **Review** (agent): 4 confirmed + 2 possible findings, all fixed: a visitor's grace carried into the next player's turn; a turn queued behind a replay could lose by the server's timeout; a toast on a banner in the same moment, and a round on a stage's first turn; hearts shown vs the referee's; a very late `go`; Skelm Sakkie's outcome before the watching game's drop.
  - **Tests:** game 295, server 186; browser: rounds against Robot Rikus (`bvb_rounds_bot`), two players through the real match code with a 0.1 s delay each way (seed `8sef0bptsz`: heat, rain, Blouaap, Skelm Sakkie caught then stealing, storm, Skelm Sakkie again, wind, fog — towers identical after all 38 turns, the same rounds on both), the watcher's jump (`bvb_lag`), zones (`zones112`), the sea (`sea112`). `matchhost.mjs` takes `LAG_MS`, `JITTER_MS` and `SEED`.
  - **Later the same evening (also in 1.12):**
    - **Three lives** (`LIVES` 3, was 4; the owner: "4 lifes is a little too much"); `DUEL.rules` 112, so the lobby pairs a 1.12 player only with 1.12 (fair hearts in Wedloop, rounds in Blok vir Blok); friend rooms still mix (no rounds then).
    - **A pause ends the search for an opponent** (the owner: "If i pause while looking for an oppenent make it stop looking"): `pauseGame` (the button, the game out of sight, a sideways phone) calls `stopDuelFlow` and says "Gestop met soek na ’n teenstander." (`S.searchStoppedPause`).
    - **Hanswors brings gifts** (the owner: "with the log which I love, make him bring anything from 0-5 blocks"): his log, then 0-5 gift blocks (`VISITOR.giftMax` 5; `clownPlan` from the visit's seeded stream: plank, slab or brick, wide and flat, set level in the middle, each cement). Every daily's clown visits changed (the schedule didn't); the results line says "Hanswors het vir jou N geskenke gebring 🎁".
    - **A quieter menu and lesson** (the owner's brother-in-law: the menu "too busy", something "off" on the tutorial, "looks too AI generated"; the owner: "fix this but not too much. I like the layout"). Researched: **Impeccable** (github.com/pbakaus/impeccable, Apache-2.0, ~79k stars) — its `quieter` / `distill` rules and its detector (`npx impeccable detect`, run on `css/` and `index.html`: a side-tab border, low-contrast logo letters (they have a dark outline, fine in practice), a glow, bouncy easing, stripes). Done, same layout: the daily card has no icon box, the date line says "een poging, dieselfde vir almal", the weather and visitors are one line of pictures ("Vandag: 🌧️ 💨 · 🐒"; names on touch and for screen readers); the logo letters sway half as much, slower; today's week box pulses gentler; the Uitdagersreeks button has a drawn crossed-swords icon (was ⚔️); the lesson's lines lost their trailing emoji and half their words; "Hoe speel ek?" is 8 short lines (was 9 paragraphs); the admin pages' side stripe and the desktop glow went.
    - **Ranks like CS:GO, one per mode** (the owner: "one rank for each challange", "Gold Nova 2 70% till next level, but if you loose to someone you loose points", "a lot of ranks"; choices: a new month drops one tier, Robot Rikus doesn't count, metal names, friction kept). `js/core/economy.js` LADDER of 23 (Brons I-III, Brons Meester … Diamant Meester, Meesterbouer, Grootmeester, Stapel-legende), 100 points a rank shown as a %; a live win +20, a loss -15 against your own rank, +3/-2 per rank the opponent is above you (clamped 8-40 / 5-30), a new player's first 10 wins x1.5; the shield catches the first loss that would drop a rank (back after a win); never below Brons I; only live matches count; a new month -400 points (one tier) and a season badge for the best tier; the Diamant frame follows the best tier in either mode. Stored per mode in `econ.ranks` (a 1.11 wallet keeps its tier as that tier's first rank in both modes). The card carries `rl` (the rank in the mode played); the Uitdagersreeks screen shows "Wedloop-rang · Seisoen …", "🥇 Goud II 70%", a bar and "Nog 30% tot Goud III"; the results show the change with a moving bar; the match pills show '🥇II Anna'.
    - **Emoji reactions in a match** (the owner: "Emoji reaction while in game but you can't spam it"): a 😀 button bottom-left in a live match or against Robot Rikus (not a recording); 😂 🔥 😱 👏 😎 🙈 and a mute; one every 5 s (a draining ring), 12 a match; the server passes on a known one only, at most one every 3 s and 20 a match (`EMOTE`, `MatchRoom.onEmote`, in memory); the emoji shows big under the sender's pill; Robot Rikus answers half the time.
    - **"Nog 'n kans"** (the owner: "What if you can use coins to buy another chance?"; choices: the best try counts on the ranglys marked 🔁, 50 coins, in 1.12): after the day's daily, "🔁 Nog ’n kans 🪙 50" on the "Klaar vir vandag" card buys one more try (once a day; `DAILY_RETRY.price`); it plays the same tower at once; the better of the two counts for the stats' bests, the skyline and the board; it earns no coins, streak or week box; its results say "· 🔁 2de poging"; the share line gets 🔁. Stored under `stapel.v1.retry` (an older page rebuilding the main blob can't drop it). Server: `retry: true` on POST /board keeps the better height and sets `retried` (D1 migration `0004_board_retry.sql`, run once before the Worker); the ranglys shows 🔁 by the name.
    - **🏆 on the daily card** (the owner: "The leaderboard needs to be a small trophy on the Daily tower"): top-left, the streak's mirror; it opens today's ranglys and shows your place once known ("🏆 #2"; asked once a session after the day's daily, `setBoardPlace`).
    - **Second review** (agent, over ranks, emojis and the rest): 6 confirmed + 4 possible, all fixed: a Blok vir Blok card carried the Wedloop rank (cards now carry both, `rk`, and the opponent's game picks the mode's: `cardForMode`); points piled up at Stapel-legende (capped at its top); migration lost the 1.11 season's best (kept); a 1.11 page could wipe the ranks (own key `stapel.v1.ranks`); the rank ate the name in the pills (the name shortens, the rank stays); Robot Rikus in Wedloop had no emojis or rank (by match kind now); a height banner could cover a visitor's (it waits); the open emoji tray covered the balance meter (closes after 4 s); farming ranks by closing a tab (a live match that ends by a quit in its first 25 s doesn't count); the emoji button lingered after the result (gone with the match).
  - **Next (the owner's plan, 9 Oct evening):**
    - **1.13 "play for coins" + gifts + skins** (earned coins only): coin matches in friend AND random matches, stakes none / 20 / 50 / 100 / 200 / 500 (random: the lobby pairs the same stake; nobody within ~30 s: offer a lower stake or none); both pay into the pot at the start, the winner takes it, leaving = losing, the server keeps the result a day for a phone that missed it; not against Robot Rikus. Random **gifts** (Gewoon, Skaars, Epies, Legendaries) with coins, power-ups and skins inside, the odds shown, earned by playing (bigger stakes, rank-ups, records, the full weekkis) and also sold for coins in the Winkel. **Skins to brag with** (looks only): block wrapping, backgrounds, cranes; in Blok vir Blok each player's blocks wear their own wrapping; the opponent sees yours on the versus card; the ranglys shows the wrapping's icon. The owner: "I think we can go big with this."
    - **1.14 real money** (the owner: "the main focus is making a few bucks… like on 8 ball pool"): Google sign-in + a server wallet (bought coins safe, never faked or lost), coin packs through Google Play Billing (required for in-app digital goods; Google keeps 15%), PayFast on the website, odds on paid gifts (Google rule), no cash-out ever, and **a South African gambling-law opinion first** (also ask the attorney, from the 1.13 Advocate: are the 1.13 coin matches — earned coins only, no cash-out, the winner the room names takes both, no cut, never against a bot, players 13+ — outside a 'gambling game' in the National Gambling Act s 5(1)(a), and so outside ss 11-12? The Advocate rates the risk low; a Worker rollback switches coin matches off at once. And no Pryspot or sponsor prize on the Daily Tower until the attorney has looked at coins and prizes together; if one comes, only the free first try counts for prizes) (the 1.13 Critic Panel's Advocate: bought coins staked in coin matches may count as a 'gambling game' or a bet under the National Gambling Act ss 4-6, and an unlicensed 'interactive game' under s 11; keep stakes to earned coins — a separate earned purse — unless a lawyer clears bought ones; re-answer Play's content-rating gambling questions with the 1.13 app build), the Play target audience 13+ (paid random gifts can't target children: the owner to confirm the Play Console setting), store listing / Data safety / privacy updates; the Play payments profile (bank, tax) is the owner's to set up.
  - **Live 9 Oct 2026 ~22:20:** D1 migration 0004 run (the `retried` column confirmed), Worker deployed (version 8abc1066), pushed (`174d58c`), Pages deployed (`stapel-v1.12.0` on both addresses). `check-all.sh full` ALL CLEAR before (30 browser tests; two players: identical towers over 31 turns, rounds the same; the watcher's jump 0-2 px, one 16 px in a wind round), `check-all.sh live` ALL CLEAR after (a live Blok vir Blok match identical, the lobby per mode, the board round trip: 10 players, the hidden test entry removed).
  - **The app:** 1.12.0 (11200) (`~/Desktop/Stapel app (Google Play)/Stapel-1.12.0.aab` and `-toets.apk`; the 1.11.0 pair moved to "Older builds"). On the owner's "Yes, upload 1.12.0" it is published on internal testing (9 Oct 22:29) and sent for Google's review on the closed test (~22:40; the Publishing overview held only that change; not production). Same notes in af and the five English languages; Data safety unchanged (the emojis are six fixed pictures, not kept; the 🔁 mark is a game result). Until the closed test is approved, a phone still on 1.11.0 plays a friend's 1.12.0 without rounds, and the random lobby pairs it only with other 1.11.0 players (`DUEL.rules` 111 vs 112).
  - **Order changed (the owner, 9 Oct ~22:30):** Google sign-in and a cloud save come first in 1.13 ("First thing in 1.13"), before the coin matches, gifts and skins; 1.14 builds the server wallet on that sign-in.
- **1.12.1 (10 Oct 2026; local, not released yet): the launch candidate — fixes, speed, and friend matches that hold.** The owner: "make this version the best trial version, basically make it ready for playstore's launch, no extra features for now just optimize what we have", then, testing with family: "Nog 'n kans" in steps; "challenge friends for coins" as a reminder; "my wife mentioned there is no place to change her name"; "If I insert the name in the challenger series then the whole screen shrinks or zoom out"; "is there any way that you can pause from both sides if you play against a friend?"; "if I say play again after I challenged a friend then it shows finding an opponent"; "it just switch from Wifi to data and it disconnected, cant you make it reconnecting"; "the emoji's is cut off … the sticking out the tongue, also a laughing face, basically a little taunt. Not to many"; "if you send it to a friend are there anyway to make them decline if they are busy … simple like Sorry, busy right now". The owner also asked about "different Meters challenges": not now (50 m is tuned and the random lobby would split); later, friend rooms only (Kort 25 / Gewoon 50 / Lank 100 m).
  - **Fixes (found in a review of the whole game, each shown failing on 1.12.0 and passing now, `qa/fixes1121.mjs`):** the app's Back while a fallen tower shows (it closed the app); Back during a match's 3-2-1 (left the screen but not the match); "Nog 'n kans" ended by any write from another tab; "Hou op" after a match ended while paused; a room asked for twice on a slow line, a recording arriving after Kanselleer, a lobby pairing whose other player never comes (back to the lobby after 20 s), a connection lost in the 3-2-1 (`tests/duelfix.test.js`).
  - **Speed:** Matter's resolver skips pairs that can't move (bit-identical physics, `qa/physequal.mjs`); the HUD redraws its texts only when they change; emoji drawn once into textures (`js/game/emojitex.js`); progress saved once a second; the game loop sleeps on the results and pause cards.
  - **Nog 'n kans in steps:** 50, 100, 200, 400 coins, then "Kom môre terug!" (`DAILY_RETRY.prices`); the try's number on the results ("poging 3") and 🔁n on the ranglys (server: `tries`, D1 migration `0005_board_tries.sql`).
  - **Reminders:** "Daag ’n vriend uit en wen muntstukke" joins the rotation.
  - **Your nickname** from 🏆 Ranglys and 📊 Statistiek ("✏️ Verander jou bynaam"; before, only in the Uitdagersreeks): a small sheet; empty = your Bouer name.
  - **The keyboard** (`main.js` holdForKeyboard, `dom.js` setKeyboard): in the app the keyboard makes the window shorter and the game re-fitted to it (measured on 1.12.0: 412 → 261 px wide). While a text box has the focus and only the height went down, the game and the screens keep their size, the open screen or sheet gets room above the keyboard and the box scrolls into sight; a short phone's window, wider than tall then, no longer shows "Draai jou foon regop" (`qa/keyboard1121.mjs`).
  - **Emoji:** Android's emoji (Noto) reach below the letters that size a text, so the reactions (and the banners' emoji) lost their bottom and shadow (measured with Google's Noto font: up to 63 px of the bottom row cut). Each emoji picture has room now (`qa/emoji1121.mjs`: no ink on any edge). The tray: 😂 😛 😎 🔥 😱 👏 (`EMOTE_PICKS`; 🙈 stays readable for older games).
  - **Friend matches (protocol 5, `docs/CHALLENGE-SPEC.md` "Protocol 5"):** a friend's link shows who invites with **Speel** / **Sorry, besig nou** (the inviter hears it and keeps waiting); a dropped connection keeps its seat 20 s and the phone comes back to the match by itself ("📶 Verbinding weg… koppel weer aan"; the other: "📶 Anna se verbinding is weg… wag ’n bietjie"), with what was missed sent again; "Speel weer" after a friend match plays the same friend in the same room (a friend on an older game: a new invite, never a random search); a pause in a friend match stops both games (3 each, 60 s at most, a 3-2-1 in both). Older games play as before.
  - **The Perfek's cement, explained** (the owner: "they dont understand if you get a perfect it starts building from there it doesnt matter if the blocks are scew or not"; right: `lockBelow` sets every block under a Perfek that is at rest as cement at once, except one already tipping; a Perfek needs a nearly level support, `perfectMaxTilt`): "Hoe speel ek?" now says so, a first-game hint says it at the first Perfek that sets cement (`coach.cement`, "Perfek! Alles onder hom is nou sement 🧱"), and the card's outdated "een poging" line is gone (Nog 'n kans; also the daily card's date line and the lesson's last line). Then the owner: "it needs to destinguise between blok vir blok and challenge, also the bloks that goes grey is pretty good but it needs to mention something about it": the card says cement turns grey and can't fall, and that in Blok vir Blok everything but the top 5 blocks sets after every turn (also on the Blok vir Blok explanation); and once ever, at the first grey blocks a player sees, a toast "🧱 Grys blokke is sement: hulle kan nie meer val nie" (setting `cementSeen`; `qa/cementtip1121.mjs`).
  - **The emoji menu doesn't drop blocks** (the owner: "when the emoji menu is open it should not take it as a drop"): while the tray is open an invisible layer over the game (`.emote-shield`) takes a tap anywhere else: it closes the tray and the block stays on the hook (`qa/emoteshield1121.mjs`: tap → closed, no drop; next tap drops; picking still works).
  - **Other:** the status bar on Android 7-14 (`EdgeToEdge.enable`); an English privacy page (`privacy.html`); a way to report a nickname from the ranglys; the store texts rewritten (`app/store/listing-*.txt`) and the screenshots remade (af and en).
  - **Review** (agent, over the whole 1.12.1 diff): 9 findings, all fixed, each with a test: a rematch on the connection a game came back on heard nothing (the reconnect's handlers were tied to the first match); a Blok vir Blok pause past the turn's deadline set the room's alarm to fire every millisecond (the alarm now waits for the pause's end); the results said "doesn't count" while the verdict was still on its way through a reconnect; a friend reading the invite held the room's seat (now `look`: no seat until "Speel"); a kept "Sorry, besig nou" could reach another friend (now the inviter's key only); spinners frozen on a waiting screen opened from the results (the page wakes); "no pauses left" shown for any refused pause; a pause that ended while the connection was gone; Back or Escape skipping the 3-2-1. A test found one more: a friend still reading the invite when someone else started was never told (now `gone`).
  - **Critic Panel, round 1** (5b4470a): the Guardian 6 HOLD, the Customer 7 HOLD, the Bottom Line 8 APPROVE, the Advocate 6 HOLD (27/40). Done for round 2: the live gate and the way back written into the release steps (`friends1121.mjs` LIVE mode: the page cuts its own connection, the network off 3 s); the "all 4 tries used" note clear of the button; the pause cards say "tot 1 minuut"; the name rules by both nickname boxes ("Kies ’n speelnaam, nie jou regte naam nie…", Google Play's user content policy); both privacy pages describe what 1.12.1 sends (the tries, the invite's name and mode, "Sorry, besig nou", the per-room code) and the 🔁 mark; the store pictures retaken with Google's Noto emoji (Apple's emoji art has no licence for marketing; `app/tools/screenshots.mjs` serves Noto under Apple's name and loads all of it first); English punishment labels that fit; "One more try" everywhere in English; short descriptions without "nuwe"/"new" (Play flags them as a store-status word); "for a moment" and "coins can't be bought" in the listing; a small name button in Statistiek; a cryptographic seat key; about one storage write a Blok vir Blok turn again (a passed-on turn message is saved only while the other game is away; test); the website leaves `adverteer.html` and `terme.html` (a template) out until sponsor sales open, and the privacy page leads back to the game. Play Console checked (read only): the English listing has the old text and old Afrikaans pictures; 17 on the "Family" list; the account shows as an Organization account and whether production still needs 12 testers for 14 days is unclear.
  - **Critic Panel, round 2** (6796466): the Guardian 9 APPROVE (it ran the LIVE gate itself: passed), the Customer 8 HOLD, the Bottom Line 8 APPROVE, the Advocate 8 APPROVE (33/40). Done for round 3: every emoji in the 12 store pictures is Google's Noto now (an emoji inside a sentence took the text font, which names no emoji font, so it came out as this Mac's Apple art: a silver coin beside a gold one, two looks of Skelm Sakkie; `app/tools/screenshots.mjs` gives the text font the Noto name too); a pause for both counts down on the pause card ("Gaan aan oor 0:42", from the room's own time, also after coming back from a dropped connection); the name sheet's Stoor and Maak toe side by side, so the name rule stays in sight above the keyboard on a 360×640 phone, and the hint clear of the box's focus ring; "Verander jou bynaam" a small button in Statistiek and the ranglys; the consent line "Deur ’n bynaam te gebruik, stem jy in." / "By using a nickname, you agree." (the Uitdagersreeks box saves by itself); privacy section 2 "Spelers: wat ons versamel en wat nie" names all player data kept and for how long (the leaderboard row 30 days, a match recording 7 days), and section 11 lists everything that leaves; the release steps write down the live Worker version first, roll back in one line, and read today's leaderboard straight after the deploy (it reads the new tries column, so a missed migration shows in seconds). Play Console, read only (10 Oct afternoon): production very likely open — the Organization account's Dashboard has "Create a new release" unlocked and no 12-testers card; opening a production draft was held by Claude's safety check (the ask came through Alfred), so a 100% check is the owner pressing it.
  - **Balloons and physics (the owner, 10 Oct 16:00 via Alfred: "The air balloons look cheap", "The physics is not there yet"):** the hot-air balloons redrawn (`ce33a4a`: a round envelope with panels that curve with it, a crown and a zigzag band, light and shade, a skirt, cables, a burner and a wicker basket; three looks; a gentle sway, the burner firing now and then; none of the sway with "Minder beweging") and Hanswors's party balloons (a knot, shine, wavy strings); before/after in the Desktop's "Stapel app (Google Play)/Previews". The physics measured first (~120 landings in 5 towers, frame by frame: `qa/physaudit1121.mjs`, `qa/physframes1121.mjs`, `qa/physdip1121.mjs`): no bugs — no sink-and-pop (under 1.5 px), a block past its edge tips in ~0.3 s (2 s at most), nothing hangs; the stiffness was the look: blocks stopped dead. Offered A "weight and wobble" (drawn only) now or B "a living tower" (sway, cracks; a new balance) for 1.13; the owner: "Please proceed with A for now, would like to push". A (`7b23835`): a landing squashes the block onto its support and springs back once (up to 12%), the block below gives a little (cement too), an off-centre landing rocks the block about its own foot (up to 2°); the physics bodies never change (scores, difficulty and both games of a match stay the same); none with "Minder beweging"; checked every frame by `qa/weight1121.mjs` (foot planted within 0.01 px, every picture back on its body, the kick never moves a body). B stays an idea for 1.13. The 12 store pictures retaken after round 2 (every emoji Noto; a new balloon shows in picture 6).
  - **Tests:** on the final code (6917ba1) `check-all.sh full`: 47 checks, 46 ok at once; the new `weight` check first failed on its own angle comparison (Phaser keeps a picture's angle within ±180°, Matter's body keeps counting: the same pose), fixed and re-run ok on a normal tower and one that ends in game over; game 330, server 211 (1 skipped: workerd can't start on this Mac); earlier: `check-all.sh full` ALL CLEAR (40 checks) on 6796466; browser: `qa/friends1121.mjs` (two players through the real room code: decline, a pause for both, a cut connection — also mid-turn in Blok vir Blok — quitting in a pause, "Speel weer"; both modes), `qa/keyboard1121.mjs`, `qa/emoji1121.mjs`, `qa/retry1121.mjs`, `qa/fixes1121.mjs`, `qa/textfit.mjs`, `bvb_live` (towers identical every turn).
  - **Critic Panel, round 3** (6473d57): the Guardian 9, the Customer 9, the Bottom Line 9, the Advocate 9 (all APPROVE, 36/40), security scan clear; the Final Boss 9 FINAL APPROVAL. **LIVE on the web 10 Oct 2026 ~19:55** (the owner: "Please proceed with A for now, would like to push"; "Nobody, go now"): D1 0005 (run with `--command`: the `--file` import route was refused with Cloudflare auth error 10000), Worker 9dd192a0 (old 8abc1066), the board read (10 players), `check-all.sh live` with the 1.12.0 site on the new Worker, the LIVE gate (after fixing the test's cut: the Worker doesn't answer a WebSocket goodbye, so a browser waits ~10 s for its own close — no effect on real drops; a 1.12.2 fix), the push, Pages from `pages-dist`, `check-all.sh live` ALL CLEAR. The app 1.12.1 (11201) and the store listing wait for the owner's yes.
  - **The Play upload (10 Oct ~23:00, the owner: "Please proceed with the upload"):** prepared in the Desktop's "Stapel app (Google Play)/Upload 1.12.1 internal" (the 11201 bundle + `release-notes.txt` + README); its quick-look panel had the Bottom Line 9 APPROVE when the owner asked (via Alfred, 23:05) to wrap up for the night, so nothing was uploaded. To resume: finish that panel (the Guardian, Customer, Advocate, then the Final Boss), upload to internal testing, the owner's phone check + Play's pre-launch report, then the closed test and the store listing (each with the owner's yes).
  - **To release (with the owner's OK):** D1 migration `0005_board_tries.sql`; the Worker at a quiet moment (a deploy ends live matches): write down the live 1.12.0 version (`./wr.sh deployments list`), `./wr.sh deploy`, then read today's `/board` with the site's Origin (must answer with "players"); then **the gate**: the 1.12.1 game on this Mac against the live Worker, two players in Blok vir Blok (no recordings kept): decline, a pause for both, a cut connection, "Speel weer" (`serve2.mjs` with `MATCH_API` = the live Worker, `LIVE=1 … qa/friends1121.mjs turns`; it cuts the connection in the page and turns the network off for 3 s) — on a failure `./wr.sh rollback <the 1.12.0 version> --yes --message "1.12.1 gate failed"`, leave the column, stop; then push, Pages, `check-all.sh live`, the app 1.12.1 (11201) to internal testing, the owner's phone check and Play's pre-launch report, then the closed test, and the new store texts and screenshots (af, en). **The way back:** `./wr.sh rollback <the 1.12.0 version> --yes`; a revert commit + Pages deploy (or Pages' Rollback); the app halted in Play Console and a fix as 1.12.2; the tries column stays.
- **1.12.2 (11 Oct 2026; LIVE on the website ~07:45 — Pages deployment 24f1de12, the way back: Pages rollback to 8c4e3edb (1.12.1); the Play app keeps 1.12.0 until the next upload): the Fondamentblok always lands level.** The owner (via Alfred, with a photo at 65.5 m: the black block lying tilted on a crooked red block): "This is not what the black block should do, it should start a new base no matter how bad the previous block was, it needs to start in a straight line." Cause: `landFoundation` laid it flush along the top of what it hit (that block's angle), then set it as cement. Now (`457e284`) it lands level where the player aimed it, on the highest point of anything under it (`highestUnder`, like Hanswors's log), then it and the tower under it set as cement; its ghost shows it level too. The Fondamentblok only appears in the Daaglikse Toring (the free one at 55 m) and in Oefen (the Winkel), never in a match: the Worker, the protocol and `DUEL.rules` are unchanged. The Critic Panel's first round (all four 9 APPROVE on 76295ea) added three things, done in the next commit: the slab rests on the real outline of what is under it (a crooked block counts only where it is under the slab, not its whole box: `highestUnder` + `outlineTop`), a slab whose tilted corner touched something past its level span sets on what it touched (never lower), and its ghost is never red once it will set on the tower. Checked (logs in `/tmp/stapel-checks/v1122/`): `qa/foundation1122.mjs` (live 1.12.1 28.6°, now 0°, gap 0), `qa/foundationaim1122.mjs` (five aims over a crooked block: all level, gap 0, grey ghost, cement, no lives lost), game tests 330, boot, shop18, fix18, smoke (both sizes), daily-short, determinism, physics111, weight, textfit, audit, nullscan, stages. (An earlier quick run of these browser checks had not run at all — a zsh loop started `node` without the script — and was corrected before release.) Website only (`VERSION` 1.12.2, `stapel-v1.12.2`); the Play app and the rest of the 1.12.2 list follow later; the Play upload stays held.
- **1.13.0 (11 Oct 2026; LIVE on the web ~12:25 — Worker 30d1d7bc, Pages 484d9638, push f4a1ffe..79aeb48; the way back: `./wr.sh rollback 9dd192a0-c6d5-4744-8769-a6b500ca5c6b --yes --message "…"` (1.12.x: no stakes at all), Pages rollback to 24f1de12, a revert push; the Play app keeps 1.12.0 until the 1.13.0 (11300) build): coin matches.** The owner (via Alfred, 07:49, urgent): build 1.13 — Google sign-in + cloud save, a friends list, and **COIN MATCHES: stakes with earned coins only** (real-money coin packs stay 1.14; nothing that charges anyone); "VS mode with coins live as soon as it can safely be"; every release through the Critic Panel + Final Boss. Sign-in waits for the owner's Google web client ID (the `stapel-1.13-signin` branch, off until then; its migration becomes 0006); the friends list needs sign-in. Coin matches are done: a live match against a real player (a friend's link or the lobby) can be played for 20, 50, 100, 200 or 500 coins each (`DUEL.stakes`); **the winner the room names gets both**; a loss, quitting, leaving, or a connection that doesn't come back within 20 s loses the stake (the room gives that match to the other player; a refund rule for a lost connection was dropped before building: a losing player could have pulled the network for one); never against Robot Rikus or a recording; coins still can't be bought. **Protocol 6** (`docs/CHALLENGE-SPEC.md` "Protocol 6"): the stake goes with `POST /match/room {stake}` and the lobby's hello; the room keeps it (only an allowed amount), says it in the invite and the start; **the match counts for coins only once both games tell the room they hold their stake** (`stake` ok → `stake` on; one can't → off, both give theirs back); only the room's `result` settles a coin match (no verdict on the phone: it waits up to 10 s, and a full wait again after coming back); a coin Wedloop at the room's time limit goes to the higher tower (level: both get theirs back); one coin match per browser (the Web Locks API; a stake whose lock nobody holds is a match that ended); a game older than 1.13 can't join a staked room (`gone`) and the one who invited reads why ("… se Stapel ken nog nie muntwedstryde nie. Daag weer uit sonder munte."); the lobby pairs only the same stake; "Speel weer" keeps it (and asks both again); a friend with too few coins answers **Laat weet: te min munte**. Rejoin, the pause for both and "Speel weer" still need protocol 5 only. On the phone: **Speel vir munte** on the Uitdagersreeks screen (Geen/20/50/100/200/500; more than the wallet can't be chosen; "Munte is net vir die spel: hulle kan nie gekoop of vir geld omgeruil word nie."; it follows a Winkel purchase); the stake on the waiting screens, the WhatsApp text, the invite and the versus screen; results "+100 · jou 50 terug plus Bennie se 50" / "−50 · Bennie kry jou munte" / "−50 · die verbinding het nie betyds teruggekom nie" / "+50 · jou munte is terug". Also: a live match that ends by a quit in its first 25 s says "Te kort: … tel nie vir jou rang nie" (it said "against Robot Rikus or a recording"). Privacy pages (af + en, version 2026-10-11; `SPONSOR.privacyVersion` with them): a live match also sends how many coins each puts in; the wallet line names a coin match's stake.
  - **Review** (agent, over the whole diff): 5 defects, all fixed with tests: (1) playing yourself in two tabs of one wallet made coins (one tab couldn't hold its stake but the other's win still paid double) — now the room's both-hold rule plus the browser lock (a second window answers "can't"); (2) a slow verdict or one right after coming back: the phone decided "lost" itself while the room named it the winner — now only the room's result settles a coin match; (3) a connection lost after the tower ended left the stake unsettled and the results without their coin line — now `duel:dropped` settles it and the line follows; (4) a coin Wedloop at the room's time limit closed with no result (both stakes lost) — now the higher tower wins, level gets both back; (5) the picker didn't follow a Winkel purchase. From its lower-confidence list, also done: the app settles an old stake at once (one window), a new invite after "Speel weer" plays for the stake just played, the host hears when a friend's game is too old.
  - **The owner's yes** (through Alfred, spoken at the Mac): 09:35 "YES, he accepts the coin-match rules exactly as in your corrected plan (stakes 20/50/100/200/500 earned coins; server-named winner takes both; losing, quitting or a connection that doesn't return loses the stake; refund only if the match never started; no stakes vs Robot Rikus; no real money)"; 09:36 "YES, he confirms both safety additions" (both phones must confirm the stake, else both get their coins back; at the 15-minute limit the higher tower wins, exactly level = both get coins back). The push waits for his own yes. Google sign-in: he asked (09:44, via Alfred) for Claude to do the Google Cloud steps in Chrome; Claude's safety check blocked opening Google Cloud on a relayed request, so steps A–E are his (or his own typed go-ahead in the Stapel terminal).
  - **Checks on `d9719e1`:** `check-all.sh full` ALL CLEAR (47 checks: unit tests, boot, the whole browser batch, the two-player set incl. `coins` 12/12); `qa/coins113.mjs` with `OLD=` (the 1.12.2 game served against the same test host) 13/13; `qa/coinslive113.mjs` tried locally (old game kept out + host told; 20-coin Blok vir Blok match +40/−20 in 6.7 s).
  - **Critic Panel, round 1** (5959118): the Guardian 9 APPROVE, the Customer 7 HOLD, the Bottom Line 9 APPROVE, the Advocate 6 HOLD (31/40). Done for round 2: a dropped coin match's headline says "Hierdie wedstryd tel nie vir jou rang nie" / "This match doesn't count for your rank" (it said "doesn't count" beside "−20"); the pause card in a coin match warns "As jy nou ophou, kry Anna jou 50 🪙." / "If you stop now, Anna gets your 50 🪙."; a friend with too few coins: the host reads "Probeer minder munte, of speel sonder munte." / "Try fewer coins, or play without coins.", and the friend "Oefen en die Daaglikse Toring verdien munte."; an older game: "… se Stapel ken nog nie muntwedstryde nie. Daag weer uit sonder munte." (the Play update isn't out); leaving a live match tells the room it quits (the other player wins at once: 2.3 s instead of 22.5 s; no 20 s window in which their tower could fall and leave nobody the winner); the leaving rule before any coins go in ("Los jy die wedstryd, of bly jou verbinding langer as 20 s weg, kry die ander speler jou munte." on the picker and the invite, with "Jy het 200 🪙."); the WhatsApp text says "speelmunte" / "game coins"; "Speel weer teen Bennie (50 🪙)"; the picker in one row of six (the coin on its label); privacy pages' "A friend's link" bullet names the coins answer and the older game's notice; the 1.14 plan above needs a gambling-law opinion first.
  - **Checks on round 2 (`54f6982`):** `check-all.sh full` ALL CLEAR (47; `coins` 12/12); `qa/coins113.mjs` with `OLD=` 13/13 (also: the pause card's warning, "You have 200 🪙. Leave the match, …" on the invite, "Speel weer teen Bennie (50 🪙)", leaving paid in 2.3 s, the dropped match's "doesn't count for your rank", the older game's new line); game tests 348, server 224 + 1 skipped; the tall English duel screen now shows "Find an opponent" and "Challenge a friend" without scrolling (`textfit-en-tall-duel.png`).
  - **Critic Panel, round 2** (79aeb48): the Guardian 9, the Customer 9, the Bottom Line 9, the Advocate 9 (all APPROVE, 36/40), security scan clear; the Final Boss 8 HOLD only for the owner's own typed yes (the rules' yes had come through Alfred), then — **the owner typed "YES" himself in the Stapel terminal at 12:11** to the exact question (the coin rules in one line, the lawyer's answer on game-coin stakes still to come with the Advocate's low rating, one Worker rollback switches coin matches off, release 79aeb48 with 5 commits, the Play app unchanged) and answered "Nobody, go now" (12:12, his own tap, through Alfred's Telegram) to "is anyone in a match right now?" — the Final Boss 9 FINAL APPROVAL. Released: the Worker (30d1d7bc; no migration), today's /board read (5 players), the gate `qa/coinslive113.mjs` against the live Worker (the live 1.12.2 site can't join a coin room and the host reads "Ouma se Stapel ken nog nie muntwedstryde nie…"; a Blok vir Blok 20-coin match: both held, the room's stake on, Bennie left with the home button, Anna +40 in 3.1 s, nothing held, 9.2 s), `LIVE=1 qa/friends1121.mjs turns` (all ok), the push, Pages (484d9638), both addresses serve stapel-v1.13.0, `check-all.sh live` ALL CLEAR. Saturday's baseline: /admin/runs kept 60 recordings (the cap), the newest from 10 Oct 19:48 UTC.
  - **Watch after release** (the Bottom Line): tonight the owner plays one 20-coin match with a family member on the website and checks both wallets add up; Sat 17 Oct: count the Wedloop recordings in `/admin/runs` against the week before and ask the family how many coin matches they played (the Worker counts no coin matches).
  - **Tests:** game 347 (`tests/stakes.test.js`, `tests/duel6.test.js`), server 224 + 1 skipped (`server/test/match6.test.js`: staked invite and start, older games kept out and the host told, only allowed stakes, rematch, lobby by stake, POST, the coins decline, both-hold, decided-first, rejoined, the time limit); browser `qa/coins113.mjs` (two players through the real room code: the picker on 360×640, the invite and too few coins, holds and payouts with every wallet adding up, "Speel weer", leaving, a reload, another tab, the lobby by stake, Robot Rikus without coins, a connection that doesn't come back, one wallet in two tabs, the Winkel, and with `OLD=` the 1.12.2 game opening a coin invite: 13/13); the test host `qa/matchhost.mjs` passes the stake on like the Worker. The release gate after the Worker deploy: `qa/coinslive113.mjs` (the live website's older game can't join a coin match and the host reads why; a Blok vir Blok coin match through the live Worker, over within 20 s; tried locally first: ok). Release order: Worker (no migration) → the gates → push → Pages → `check-all.sh live`; the app needs a new build (1.13.0 = 11300) for app players to play for coins (the Play upload stays held).
- **1.13.1 (11 Oct 2026; LIVE on the web ~18:00 — Worker 594c7235-b8d2-455a-8932-0489502d9736, Pages e13cc2a8, push 79aeb48..7c3cfc7; the way back: `./wr.sh rollback 30d1d7bc-ae88-4396-8eb4-0645fc7d8d4d --yes --message "…"` (1.13.0; games already on 1.13.1 keep 3 free tries from 12 Oct — to switch them off for everyone: `DAILY_FREE_TRIES = "1"` + `./wr.sh deploy`), Pages rollback to 484d9638, a revert push): three free daily tries, and shares counted.** The owner (via Alfred, Telegram 13:39): "let's do the 3 and see how it goes" — three free Daaglikse Toring tries a day from Monday 12 Oct, then measure for 7 days (Guru's plan: tries per day as a server setting, tie-break on fewest tries, "x/3" in the share line, a baseline, watch next-day return and coins on "Nog 'n kans"). His answers (his own taps, 13:5x): keep "Nog 'n kans" after the 3 free tries (the 4th-7th try at 50/100/200/400); ONE app upload tonight as 1.13.1 with coin matches AND 3 tries (the prepared 1.13.0 upload folder is set aside, NOT-FOR-UPLOAD); count shares anonymously. Built: `js/core/tries.js` (the setting, the day's ladder [0, 0, 50, 100, 200, 400], the "x/3" label); `DAILY_TRIES` {free 3, from 2026-10-12, maxFree 4} in js/config.js; the store's extra tries follow the day's ladder (free ones cost 0, never refunded, no coins/streak/week box like any extra try), `store.dailyTries/getDailyTries/setDailyTries` (the Worker's word kept under `stapel.v1.tries` for an offline start; a debug page takes `?tries=N[,YYYY-MM-DD]`); the daily card's big "Speel weer · poging 2/3" (no coins) with "3 gratis pogings per dag; jou beste een tel.", then "🔁 Nog ’n kans 🪙 50" with "Jou 3 gratis pogings is op…"; the results chip "poging 2/3"; the share line "Stapel #7 🏗️ 41,2 m · 2/3" ("3/3 +1🔁" past the free ones; a one-try day as before); the Worker: `GET /daily/config` ({free, from} from `DAILY_FREE_TRIES` / `DAILY_FREE_FROM`), equal heights rank by fewer tries then the earlier result, posts up to 8 tries (the board keeps up to 5: the D1 column's CHECK (migrations/0005); widening it needs a table rebuild, and D1 access from this Mac refused queries today with Cloudflare error 7403 — a later migration), `POST /stats/share` (anonymous `shares_daily|practice|duel` per day); both privacy pages (version 2026-10-12, `SPONSOR.privacyVersion` with them) name the share count. Baseline (from the board, which started 9 Oct): 9 Oct 12 players (1.0 plays each), 10 Oct 10 (1.2), 11 Oct by 13:50 5 (1.4); next-day return 33% (9→10) and 20% (10→11); 20 different players; about 4 bought tries (≈200 coins) on 10-11 Oct; shares weren't counted. Review (agent, over 080b4f2): 5 defects, all fixed with tests — a 6th or 7th try (200/400 coins) never reached the board (the game sent it as try 2: now as 5, the board's most); the new order made every board read sort the whole day (now `INDEXED BY idx_daily_board_rank`: only equal heights are sorted again; a query-plan test); the share counts had no way to be read (now in `/admin/stats` and admin.html: "Uitslae gedeel" and a "Gedeel" column); shares from a daily result opened again from the menu weren't counted (the results screen now says its day); an extra try a 1.12.0 page bought and never played refunded 0 on a free-tries day (now 50: 1.12.0 only sold tries). Also from it: the card says "Jou beste vandag tot dusver" while free tries are left (not "Klaar vir vandag!"), the note after them counts the bought tries left ("nog 3 keer met munte"), a free try taken but not started says "Speel weer · poging 2/3". Known, not fixed: a Pages rollback to 1.13.0 (or an old open tab) cleans a day's extra-try count above 4 back to 1 (a player could take those tries again that day); changing `DAILY_FREE_TRIES` mid-day isn't followed by a second open tab until it restarts; the tie-break's "earlier" is the day's first post. Measure 12-18 Oct; report Sun 18 Oct. Tests: game 353 (`tests/tries.test.js` 4, audience +1), server 227 + 1 skipped (board: up to 8 tries kept as 5, equal heights by fewer tries, `GET /daily/config`; stats: `POST /stats/share`); browser `qa/tries1131.mjs` (Monday's tower: 1/3, the free 2/3 and 3/3 with their toasts, then Nog 'n kans 50; coins unchanged by the free tries; af tall + en short: all ok); `qa/retry1121.mjs` pinned to 11 Oct (a one-free-try day).
  - **Release check (11 Oct, a new session from the stapel skill; the earlier one was cancelled):** `check-all.sh full` on `c1f9c05` (started 14:44:39, two seconds after the commit; no file in the repo or in the skill's test scripts changed during the run, checked by file times) — ALL CLEAR (50 checks: unit tests, boot, the browser batch incl. `free-tries` / `free-tries-en` / `nog-n-kans-4`, the two-player set on the real match code incl. `coins` 12/12, `snapDiff` 0; summary /tmp/stapel-checks/full-1131c.txt, every log has content). Game 356, server 228 + 1 skipped. The release is `c1f9c05` (= 425c044's review fixes + the "Hoe speel ek?" line), not 425c044 alone: without c1f9c05 the help sheet would still say one try on a three-try day.
  - **Release plan (the owner via Alfred, Telegram 15:44: "this counts as a push so now the critics should be involved"; critics only for deploys and uploads):** the Critic Panel on this commit → the owner's own typed yes in the Stapel terminal + whether anyone is mid-match (a Worker deploy ends live matches) → the Final Boss → Worker (`./wr.sh deploy`; live before it: 30d1d7bc-ae88-4396-8eb4-0645fc7d8d4d) → today's board + `GET /daily/config` = {"free":3,"from":"2026-10-12"} → push → Pages → `check-all.sh live`. Then the app 1.13.1 (11301) with its own panel round and the owner's typed word.
  - **Critic Panel, round 1** (e554204): the Guardian 9 APPROVE, the Customer 6 HOLD, the Bottom Line 9 APPROVE, the Advocate 6 HOLD (30/40); security scan clear. The Customer: "She builds one tower, and the results screen tells her "Môre … kom terug!" … and never finds out she had two more free tries" — Monday's results offered only Oefen / Uitdagersreeks, and the daily card before the first try said "dieselfde vir almal" as on any day. The Advocate: both privacy pages still described the board before this release (POPIA s18 openness). The Guardian's point that `INDEXED BY idx_daily_board_rank` makes that index required: checked live (read-only query; the D1 CLI answers again, no 7403): `daily_board` has `idx_daily_board_rank` (from 0003).
  - **Round 2 changes:** the daily card before the first try says "Maandag 12 Oktober 2026 · 3 gratis pogings" / "… · 3 free tries" on a free-tries day (`S.freeTriesDate`; a one-try day keeps "dieselfde vir almal"); the results while a free try is left today show a big green "▶ Speel weer · poging 2/3" right under the result card with "Nog 2 gratis pogings vandag; jou beste een tel." / "2 more free tries today; your best one counts." (`S.freeTriesLeft`, 1: "Nog 1 gratis poging …"), and "Môre … kom terug!" waits until the free tries are used (`dayTriesExtras` in js/main.js: today's tower only, the next try free, a taken-not-started one plays at once; `.res-free`); a later try that came in lower says "Jou beste vandag bly 7,7 m" / "Your best today stays 7.7 m" (`S.bestStays`, `.res-best`); English "Your 3 free tries are used. Up to 4 more with coins (One more try); your best try counts."; both privacy pages: the summary names the share count, the share line says only the tap is counted (2a), the game also fetches the day's free tries, the 2a intro names a share tap, 2c names the free tries and the new tie-break (fewer tries first, then the earlier result), §5 the 🔁 for anyone with more than one try, §11 adds `stapel.v1.tries`, `stapel.install.dismissed` and `stapel.klop` (`stapel.stake` is a Web Lock name, not stored); the home page's meta description drops "een poging"; `METRICS` in server/src/stats.js and the schema note name the share counters (the Bottom Line).
  - **Bug from the owner (via Alfred, Telegram 16:08 + 16:10, with a photo from the Play app 1.12.0):** "Let's build!" on "How do I play?" closed the sheet, back on the home screen, "and then nothing happens (the game does not start)". Reproduced on the live 1.13.0 site (read-only: the tap closes the sheet, the scene stays idle): from the menu's "Hoe speel ek?" the button only closed the sheet (it started something only on a new player's first visit: the lesson). Fixed in round 2: from the menu "Kom ons bou!" builds a tower — today's Daaglikse Toring while it isn't played, else an Oefen tower (never a try or coins); the first visit still starts the lesson (`'ui:howto-build'` in js/main.js). Test `qa/howto1131.mjs` (in `check-all.sh full`): af tall + en short all ok (daily starts; then Oefen; tries 1 played / 0 extra; 0 coins; first visit → the lesson). The Play app gets it with the next upload.
  - **Released (11 Oct ~17:56–18:10):** the owner paused all projects at 16:25 (via Alfred) and resumed at 16:34; the pause cut the 16:15 full run (17 checks done), so `check-all.sh full` ran again on 7c3cfc7 from 16:34:57: ALL CLEAR, 51 checks (round 1's 49 + `privacy` + `howto-build`), every log with content, no file changed during it. Critic Panel round 2 on 7c3cfc7: Guardian 9, Customer 9, Bottom Line 9, Advocate 9 = 36/40 APPROVE, scan clear; **the Final Boss 9 FINAL APPROVAL** (17:55). The owner in the Stapel terminal: "YES" (16:21), "YES, still stands" (~16:36, after the pause), "Two pushes (safest)" (1.13.1 as approved now, the testers' gift as 1.13.2 tonight), "Nobody, go now" (17:56, nobody mid-match). Then: `./wr.sh deploy` (594c7235, bindings DAILY_FREE_TRIES "3" / DAILY_FREE_FROM "2026-10-12") → today's board answered (8 players) and `GET /daily/config` 200 `{"free":3,"from":"2026-10-12"}` with `Access-Control-Allow-Origin: https://stapelspel.pages.dev` → push → Pages e13cc2a8 → both addresses serve stapel-v1.13.1 → `check-all.sh live`: ALL CLEAR (first-visit, invite-room, invite-links, blokvirblok-live, lobby-live, board-live; every log with content); `qa/howtolive1131.mjs https://stapelspel.pages.dev/` (read-only): stapel-v1.13.1, "Let’s build!" → the daily tower runs. **Monday ~07:00 (the Final Boss): a 2-minute look** — the card says "3 gratis pogings", `/daily/config`, today's board, the first share counts in /admin/stats.
  - **18 Oct report plan (the Bottom Line):** plays per player and next-day return for 12–18 Oct against the 9–11 Oct baseline (9 Oct 12 players 1.0 plays, 10 Oct 10 / 1.2, 11 Oct 5 by 13:50 / 1.4; next-day return 33% / 20%), like days side by side (Fri–Sun against Fri–Sun), web players apart from the 1.12.0 app's (the app keeps one free try until its upload; the Final Boss), share spikes beside daily games. The owner's default keep-or-stop rule: keep 3 if plays per player ≈1.8+ and next-day return ≥20%; 2 if plays rise but returns fall; 1 if neither moves (his to change).
  - **Also asked (the owner, via Alfred 15:44), built in 1.13.2 (below):** a testers-only gift of 100 000 coins (a testers-only code; those players out of the ranglys and the ranks; removable before production). Planned as its own small version after this release. The 4-player co-op idea ("the Unforgivable Tower" / "Quads") stays an idea only.
- **1.13.2 (11 Oct 2026, evening; website only, no Worker change): the testers' 100 000-coin gift + the Uitdagersreeks in "Hoe speel ek?".** The owner in the Stapel terminal (~17:50): "The coins should be quick please add it" (his 13:18 Telegram yes: "a testers-only gift of 100,000 coins for everyone currently in testing, so they can test everything"; safeguards: a testers-only code, off the leaderboard and the ranks, removable before production) and (~17:58) "Also add the challenger and brick by brick series to the tutorial"; "Two pushes (safest)": 1.13.1 first, this one after.
  - **The gift:** the link `https://stapelspel.pages.dev/geskenk?toetser=CODE` (the Android app claims only `/` and `/index.html`, so `/geskenk` opens in the browser on every phone; Pages serves the game there; the address goes back to `/` at once). The code lives in the Keychain ("Stapel tester gift code"); the game holds only its SHA-256 (`TESTER_GIFT` in js/config.js: `on`, `coins` 100000, `hash`). Once per device (`stapel.v1.board` gets `tester`: the day; no new storage key): 100 000 coins outside the day's cap (MAX_COINS 999 999 still holds) → toast "🎁 Toetser-geskenk: 100 000 muntstukke! …"; again → "Jy het die toetser-geskenk reeds gekry 🎁"; a wrong code → "Hierdie geskenk-skakel werk nie (meer) nie." A tester stays off the leaderboard for good (`getBoardHidden()` true, "show me" locked, the note "Toetsers wys nie op die ranglys nie, maar jy sien jou plek."; a result already on today's board goes off it at once via `boardChanged`) and their ranks don't move (`recordDuelRank` → counted false, `tester` true; results "Toetsers se range skuif nie (die toetser-geskenk)."). Coin matches: testers may play anyone (the 500-coin stake cap holds; the owner's "so they can test everything"; his to change). **Removable before production:** `TESTER_GIFT.on = false` turns the link off; devices that took it stay off the board; their coins stay on their devices (a later version can reset tester wallets if the owner wants). The Play app (1.12.0) doesn't have it, and neither does the Play app 1.13.2 (its shim doesn't pass `?toetser=`): app testers on 1.13.2 use `https://stapelspel.pages.dev/geskenk?toetser=<code>` in the browser (the coins land in the browser game). From the Play app 1.13.3 on, `/?toetser=` opens the app and gives the coins there.
  - **"Hoe speel ek?":** three steps after the visitors — ⚔️ the Uitdagersreeks (a friend, someone else or Robot Rikus; for coins against a real player, the winner gets both), 🏁 Wedloop (own tower, the 10 m marks' punishments, first to 50 m), 🤝 Blok vir Blok (one tower, a block each, 10 s to aim, a heart for a dropped or knocked block, 5 Perfeks = a sabotage); the lesson's last card names the Uitdagersreeks too. Both languages.
  - **Privacy:** both pages' `stapel.v1.board` line names the day this device took the tester gift (testers stay hidden); nothing new leaves the device (the board post already carries `hidden`).
  - **Checks:** unit tests game 361 (+5: `tests/tester.test.js`), server 228 + 1; `qa/gift1132.mjs` (gift, once only, address cleaned, menu coins, board locked + note, wrong code, the 12 how-to steps fit on a phone): af short + en tall all ok (100 000 added once, the toast after the menu is up, address cleaned, the Winkel shows 100 000, the board's "show me" off and locked with the testers' note, a wrong code gives nothing, 12 how-to steps, the last one readable at 360×640, no sideways scroll; the code never in a log; first try: en tall missed the toast — it came before a slow start was done, so the gift now waits for the menu); `check-all.sh full` (with `gift`): see the release entry.
  - **Released (11 Oct ~19:12, the owner: "Yes, push 1.13.2 when clear"):** `check-all.sh full` on c51b36d (from 18:10:25; nothing changed during it) ALL CLEAR, 52 checks incl. `gift`, snapDiff 0; security scan clear (quick lane); push 7c3cfc7..c51b36d; Pages 7e7ea829; both addresses serve stapel-v1.13.2 (19:14); `gift1132.mjs` on the live site through the real `/geskenk?toetser=` link: all ok (address back to `/`, the Winkel 100 000, the board's switch locked with the testers' note, a wrong code gives nothing); `check-all.sh live` ALL CLEAR. The way back: Pages rollback to e13cc2a8 (1.13.1) + a revert push. Links for testers: website `https://stapelspel.pages.dev/geskenk?toetser=<code>`; from the Play app 1.13.3 on (its shim passes `?toetser=`), `https://stapelspel.pages.dev/?toetser=<code>` opens the app (App Links claim `/`) and gives the coins there. While phones run the Play app 1.13.2 (its shim passes only `?kamer=` `?teen=` `?klop=`), that link opens the app and gives nothing: testers use the `/geskenk?toetser=` link in the browser (the coins land in the browser game).
- **1.13.3 (11 Oct 2026, evening; website only, no Worker change): blocks no longer hang frozen at a tilt.** The owner's photos via Alfred (Telegram 17:53-18:05, Desktop › Alfred Inbox, brief `~/Alfred/data/briefs/stapel-bugs-1011.txt`): three Blok vir Blok towers with a top block tilted on the corner of the one below, its low end in the air, that "never tip or slide" ("this physics does not add up"; 17:57:12 vs Ladybug, 17:57:43 and 17:58:17 vs Bouer 388), a green block left tilted after the hail (17:56:02), and the L block ("3+1", 17:54:30). The owner (Stapel terminal): "Tonight, as 1.13.3".
  - **Causes (from the code):** (1) Blok vir Blok holds the whole tower still between drops (`turnHold`: no physics step, so both games start the next drop from the same tower). The turn ended once every loose block was "quiet" for 20 steps — but quiet allowed 0.004 rad a step (a 200-px plank's end moving 0.4 px a step, ~14°/s), and a block asleep counted as calm. A block that had only just started to tip (slow at first), or that Matter let fall asleep on a corner, was frozen like that for the next player's whole aim. (2) `towerLean` measures support with boxes: a tilted block resting on the corner of the one below looks held (its box overlaps the box under it), so `wakeTipping` never woke it once asleep — in every mode. (3) A hailstone stuck under a block's end melts after 6 s (`_removeHail`) and nothing wakes the block resting on it, so it hangs tilted with its end in the air.
  - **Fix:** `wakeUnsupported()` (GameScene, every 4 physics steps with `wakeTipping`, on the physics clock): each loose block's real contacts — the points where its outline's bottom is within 2.5 px of the outline under it AND within 0.75 px of its closest point (corners of both, the base's edges, 8 even steps across; a looser test stretched one corner into a ~10 px "contact" on a 14° block) — and its weight with the loose blocks over it. Past those contacts by more than 1 px → a sleeping block is woken; contacts narrower than 4 px (a single corner) with the block lying still → woken and given a 0.003 rad/step turn towards its weight (centred: towards flat); asleep touching nothing (both stones it lay on melted) → woken. `UNSUP` holds the numbers. Blok vir Blok's `turnCalm` now needs `calmSteps` (speed AND the tip's speed under SETTLE.speed, 20 steps) and no unsupported block before the hold; the 6 s / 9 s limits stay. `DUEL.rules` stays 112 (config.js says why).
  - **The gift in the app (for the Play upload of 1.13.3):** `app/shim.js` passes `?toetser=` like the challenge links (a link that starts the app reloads the game with it, once); one that comes while the app runs reaches `main.js` as 'stapel:link' and the gift is given at once (`gift1132.mjs` step 4b). So after the app update to 1.13.3 testers can use `https://stapelspel.pages.dev/?toetser=<code>` (App Links open the app) — `/geskenk?toetser=` keeps opening the browser.
  - **The WhatsApp challenge shows the stake first** (the owner via Alfred, Telegram 21:19: "If I share the challenge via whatsapp then it doesnt show me how much coins I want to play for"; "Fold into 1.13.3"). Found with `qa/share1133.mjs` (two players on the real match code): the waiting screen ("Speel vir 100 🪙 elk"), the WhatsApp button's text ("… vir 100 🪙 speelmunte elk! …") and the friend's invite ("Vir 100 🪙 elk: die wenner kry 200 🪙") all had the stake, but "Kopieer" copied the bare link, WhatsApp shows its generic link card big and its chat list only the start of the message (the name), and the Play app 1.12.0 had no coin choice at all. Now `duelRoomText` starts with the stake when there is one ("🪙 100 speelmunte elk, die wenner kry 200! Anna daag jou uit …" / "🪙 100 game coins each, the winner gets 200! Anna challenges you …"; without coins the words are as before) and "Kopieer" copies the whole invite (the same words as WhatsApp). Not done (later, server work): a per-challenge link card with the stake (the card comes from the site's static og: tags). Tests: `tests/share1133.test.js`; `qa/share1133.mjs` (in check-all full).
  - **A way out of the 3-2-1 against Robot Rikus** (the owner via Alfred, 21:27, a photo of "vs Robot Rikus!" at "2": "I cant seem to exit once I have opened it, can you fix that as well, for the bot only"): the versus screen against Robot Rikus, a recording or a friend's recorded run (`m.kind !== 'live'`) gets the ✕ top right, a "Kanselleer" button and Back (`st.waitExit` = 'ui:duel-leave') → `duel.leave()` + the Uitdagersreeks; nothing counted (no rank or coins in those matches). A live match's 3-2-1 keeps no exit (a real player waits). During play the pause card's "Hou op" was already the way out. Test `qa/botexit1133.mjs` (both modes; the button and Back; no tower starts behind it; played/wins/losses and the rank unchanged).
  - **The app's "Stapel" title bar removed** (the owner on the Play app 1.13.2, via Alfred 21:29, a photo: "Also the Stapel on the top, please remove that. It needs to be the game only."): Android showed its own title bar ("Stapel", the launch picture cropped as its background) above the game. Cause: `MainActivity` called `EdgeToEdge.enable` before `super.onCreate`, where Capacitor's BridgeActivity switches from the launch theme (`AppTheme.NoActionBarLaunch`, `android:background` @drawable/splash) to `AppTheme.NoActionBar` — the window was built with the launch theme. The Play app 1.12.0 had no EdgeToEdge, so 1.13.2 is the first build that showed it (the phone check's "first run of the edge-to-edge start-up"). Fix: `setTheme(R.style.AppTheme_NoActionBar)` before `EdgeToEdge.enable` (Android 12+'s launch screen comes from the manifest theme, drawn before onCreate). App-only (the website never had it); checked only on a real phone: the 1.13.3 app upload's phone check.
  - **Not changed (the owner's choice next):** the L block. A Perfek on it cements what's under it, not the L itself, and its top is one 44-px cell at one end, so a block landed off that cell hangs over the low step and tips (a narrow support, true physics). Options: leave it (a tricky block), give L and J a flat top like the arch (a solid body to the top cell's height, the step drawn filled), or take them out of the mix. The purple "Looking for an opponent…" chip in the hail photo is "Oefen terwyl jy wag" (an Oefen tower while the search runs), not a bug.
  - **Checks:** `qa/physfreeze1133.mjs` (rebuilds the photos in an Oefen tower: a crate laid 14° on the top-left corner of a slab, asleep; a crate resting on a "stone" that is then removed, asleep) — 1.13.2: both stay frozen (14.3° and 17.8°, asleep, 3 s later); 1.13.3: the hail one drops flat (0.06°), the corner one is woken and moves (Matter lets it slide ~9 px along the corner while it turns, so it tips off: no longer hanging). Unit tests game 361, server 228 + 1; `check-all.sh full` (with `physfreeze`): see the release entry.
- **Play app 1.13.2 (11302) UPLOADED to internal testing, 11 Oct 2026 20:56** (the owner typed "Upload" in the Stapel terminal at ~20:53, after "Tonight: upload 1.13.2" over Alfred's card 443945 "morning, fix screen first"). The bundle: Stapel-1.13.2.aab, SHA-256 fbc59371ef2f43e0e9fdabae8f27f7685652ae921a4b828338dbdfad9cbb922b, built 20:21 from 2a4eab7 = c51b36d + the straight launch screen (the owner: "the stapel image if you load in looks a little wonky", "A: tower on blue"); 71 game files = the website's 1.13.2. Critic Panel on "Upload 1.13.2 internal": round 1 36/40 + the Final Boss (records fixed twice), after the rebuild Guardian 9, Customer 9, Bottom Line 9, Advocate 9 = 36/40 + the Final Boss 9 FINAL APPROVAL (20:49), Gate OPEN; the Developer Tester ran first (the owner: "Before they go please run /developer-tester"; report ~/Documents/Test Reports/stapelspel.pages.dev/2026-10-11-20-44/report.md: 0 critical, 1 high = the Uitdagersreeks screen taller than a phone, 2 medium, 3 low). Play Console: release name "11302 (1.13.2)", the six notes from release-notes.txt, one warning (no deobfuscation file, the usual), 12 345 supported devices and none dropped, "Save and publish" → "Available to internal testers · Released on Oct 11 8:56 PM". The upload went from a byte-identical copy in the session scratchpad (the browser tool uploads only from the session's folders).
  - **The store name "Stapel"** (the owner: "upload with the "Stapel" only"): Main store listing > App name "Stapel" in af, en-AU, en-CA, en-GB, en-US, en-ZA (short and full descriptions untouched, checked) > Save. Play's new "AI asset declaration" on the review step was already set (locked) to "Label assets as created or edited using AI" from before tonight; the owner first said "Don't label", then, told it was locked from an earlier label, chose "Keep it, send the name". Publishing overview listed exactly the 6 "Change app name to 'Stapel'" changes → "Submit 6 changes for review" → sent (~21:05; Play's quick checks up to 14 min, Google's review usually within 7 days; "Remove changes" undoes it before it's sent). The Advocate's advice to check the content-rating questionnaire's gambling questions first was put to the owner; he chose to send now. Play Console's header already shows "Stapel".
  - **Next:** the owner's 5-step phone check (it starts with the straight tower; the top bar clear of the clock; one tower; the nickname box above the keyboard; the clock readable at 300 m) — STOP rule: Internal testing > Pause track; Play's pre-launch report for 11302 about an hour after the upload; Monday 18:00 count the devices on 11302 (of 17); app testers on 1.13.2 get the gift through the `/geskenk?toetser=` browser link (the app gets `?toetser=` from 1.13.3). 1.13.3 (11303) is the next upload (its own panel + word), built WITH 2a4eab7 (cherry-picked onto this branch tonight).
  - **1.13.3's full check** on 261be2d (from 19:33:33): 52 checks, 51 ok + `emojis` (a 30 s page-load timeout at 19:56 while the 1.13.2 app was building) re-run on its own: ok → ALL CLEAR. Text-only edits (HANDOVER, app/store listing names) were made in the working tree during that run; no check reads them.
- **1.13.3 LIVE on the website, 11 Oct 2026 ~22:55** (no Worker change): the owner's Telegram card c41077 (approved 22:00, "Stapel 1.13.3: website + Play internal upload tonight, only if all checks pass"). Push c51b36d..c9601ff; Pages deployment 560334e2; both addresses serve `stapel-v1.13.3`. **The way back:** Pages rollback to 7e7ea829 (1.13.2) + a revert push. `check-all.sh full` on c9601ff: 53 ok, `fixes-1121` and `coins` failed only on the intended change (the 3-2-1 against a bot now has a way out; the tests were updated to it) and re-ran clean (fixes-rerun.log 22:46, coins-rerun.log 22:44) → ALL CLEAR; game 363, server 228 + 1. After the deploy: `check-all.sh live` ALL CLEAR (live-1133.txt) and `qa/botexit1133.mjs` against the live site: both modes pass. Critic Panel (the Play folder "Upload 1.13.3 internal", 11303, SHA-256 5f7bf1d9…): 36/40 + the Final Boss 9 (22:53). **The 1.13.3 app was NOT uploaded:** the owner went to sleep (~22:35) asking for 1.13.4 by the morning, so the next upload is 1.13.4 (11304) with everything in 1.13.3; its folder goes to "Older builds" as NOT UPLOADED.
- **1.13.4 (11 Oct 2026, late; website first, no Worker change): the Winkel's "Vul my munte aan" (for testers, for now).** The owner via Alfred (Telegram): 22:03 "Just create a button that shows refill my account for now in the shop. I will tell everyone to use it" (a stand-in for the gift link after his link opened without the code); offered A (recommended: top up to 2 000, players stay on the leaderboard and in the ranks) / B (100 000 with the gift's safeguards) / C → 22:07 "Please make it that it refills the account if you press it, with 2000 coins. Build it tonight and lets get it over with"; 22:08 "Make it work 3 times."; 22:09 "Make it 3 times a day for 5 days."
  - **What it does:** in the Winkel, under its head: "🪙 Vul my munte aan (tot 2 000) · nog 3" / "Refill my coins (up to 2 000) · 3 left". A press fills the wallet up to 2 000 (outside the day's earning cap; toast "+1 967 🪙 · jy het nou 2 000"; the Winkel's and the menu's numbers follow). A full wallet ("Jy het 2 000 of meer munte") doesn't use a press; three presses a day ("Jou 3 aanvullings vir vandag is op. Môre weer."; on the last day without "Môre weer"). Only on Mon 12 - Fri 16 Oct 2026 (SA dates; the Worker isn't involved): from Sat 17 Oct the button is gone by itself. One setting: `REFILL = { on: true, to: 2000, times: 3, per: 'day', from: '2026-10-12', days: 5 }` (js/config.js); `on: false` takes it away at once (a website update). Players stay on the leaderboard and their ranks move as before (unlike the gift link's testers). Coins already given stay on phones.
  - **What it touches:** coin matches (refilled coins can be staked; the 500 cap holds; still never bought or paid out), "Nog 'n kans" (more players can afford extra tries: the 12-18 Oct free-tries measurement reads the 🔁 / tries counts with that in mind), the store texts' "earned coins" (true again once the button is off, before production). The counter `stapel.v1.refill` ({ day, n, total }) stays on the phone; both privacy pages' storage list name it.
  - **Checks:** unit tests (tests/tester.test.js: the 2 000 top-up, full = not counted, three a day, the next day three again, 100 000 untouched, stays on the board); `qa/refill1134.mjs` (Mon 12 Oct: the button, a press → 2 000 + toast + the menu number, "full", three used; Sat 17 Oct: gone; on the board): af short and en tall pass (23:08); both in `check-all.sh full` (`refill`, `refill-en`).
- **1.13.4 (continued): the tower's skins, bought with coins ("Toring-styl" / "Tower style").** The owner via Alfred (Telegram, 11 Oct 22:26-22:34, then to sleep): "Please create the different backgrounds that you can purchase as well and the different cranes, then we can test that as well with the coins."; "Also the different skins on the blocks, but these features can only be bought."; "the background skins, the different cranes and the block skins can be purchased with coins. But you do get the default for free."; "I want all this to be pushed by tomorrow morning please. Double check with the developer tester skill that everything is fine before asking me to push". Alfred: pick bright, kid-friendly designs and keep alternatives for him to swap.
  - **What it does:** a third Winkel tab "Toring-styl" (note: "Net vir jou oë: jou agtergrond, hyskraan en blokke. Dit verander niks aan die spel nie. Koop dit met muntstukke; die eerste van elk is gratis."), three sections, a small picture per skin, the price button or "Aan" (worn) / "Dra" (owned). Buying takes the coins and wears it at once; wearing an owned one is free.
    - **Agtergrond:** Kaapse dag (free), Sonsondergang 800, Lekkergoed-lug 1 000, Sterrenag 1 200 (moon and stars).
    - **Hyskraan:** Klassieke geel (free), Brandweer-rooi 500, Oseaan-blou 500, Pienk pret 700, Goud 1 500 (sparkles).
    - **Blokke:** Kleurvol (free), Lekkergoed 800 (stripes), Klip 800 (speckles), Neon 1 200 (glow), Goudstawe 2 000 (shine).
  - **Rules:** looks only (bodies, sizes, weather, scores untouched; DUEL.rules unchanged); never sent to an opponent (kept apart from COSMETICS / the Uitdager-styl); never handed out as rewards; each kind's default always owned. Kept in the economy key (`econ.skins` { owned, wear }); `cleanEconomy` keeps only real skin ids and wears only owned ones (an old wallet → the defaults). Nothing new leaves the phone, so the privacy pages and Play's Data safety stay as they are.
  - **Code:** `js/core/economy.js` (SKINS, SKIN_KINDS, DEFAULT_SKIN, skin(), buySkin, wearSkin), `js/core/storage.js` (getSkins, buySkin, wearSkin), `js/game/blocks.js` (BLOCK_SKINS palettes + patterns; texture keys `_s<id>`), `js/game/crane.js` (CRANE_SKINS; `crane_jib_<id>` / `crane_trolley_<id>`), `js/scenes/BgScene.js` (BG_SKINS: sky stops, scenery and cloud tint, sun, night's moon and stars; registry `bgSkin`), `js/main.js` (worn skins applied before the game starts; 'ui:skin-buy' / 'ui:skin-wear'), `js/ui/dom.js` (the tab, skinPreview), strings af + en, css `.skin-prev`.
  - **Alternatives for the owner to swap** (each a small change in the three tables): other skies (Winter snow, Karoo dusk, Under the sea), other cranes (Camo green, Rainbow, Wooden), other blocks (Lego-style studs, Ice, Wood, Rainbow); prices up or down. Showcase: Desktop › "Stapel app (Google Play)" › Previews › `tower-styles-1.13.4.png`.
  - **Checks:** unit tests `tests/skins1134.test.js` (7: defaults free and worn, a skin bought once and worn free, too few coins / defaults / unknown ids refused, a tampered wallet cleaned, playing never hands skins out, the store across a reload, names in af + en) → game 371; `qa/skins1134.mjs tall check` (the tab's 14 items, 3 worn defaults, no sideways scroll; buy Brandweer-rooi 3 000 → 2 500 and the crane repainted; wear Klassieke geel again; Goudstawe 2 000 → 500, then Sterrenag 1 200 refused) passes, in `check-all.sh full` (`skins`); `qa/skins1134.mjs tall pictures` (6 combinations in an Oefen tower, no browser errors).
- **1.13.4 (continued): the owner's three screen fixes** (the owner, 11 Oct ~19:45, "Upload tonight, fixes next"; built overnight with the skins).
  - **The Uitdagersreeks fits a phone** ("just doesn't fit" on his phone): the three ways to play ("Soek ’n teenstander", "Daag ’n vriend uit", "Speel teen die rekenaar") now come straight under the mode and coin pickers; the rank card, the nickname box, the record and the season notes follow below them. In sight without scrolling in both modes at his size (412×892: the last button's bottom 589 / 642 px) and on a small phone (360×640: 548 / 597 px), with the coin picker. On a small phone the nickname box starts below the fold (scroll to it; `keyboard1121.mjs`'s `duelBack` now accepts the screen staying scrolled at the box after typing).
  - **The pause card outside a match: "Terug na die hoofkieslys" / "Back to the main menu"** (was "Hou op" / "Stop"): the tower ends and is saved as before (an Oefen tower recorded and paid; a daily try counts and the menu's card shows "Jou beste vandag tot dusver …"), then the menu instead of the results (coins earned → a short "+N 🪙" toast; reminders planned after a daily). The daily warning reads "As jy nou teruggaan, tel hierdie poging as jou Daaglikse Toring." A match keeps "Hou op" (on to the match's result, as before). New event 'ui:quit-home' (main.js, flag `quitHome`, cleared by `resetRun`); 'ui:quit' is unchanged (the tests that reach results through it still do).
  - **After an Oefen tower while a search runs: "Verander na Blok vir Blok" / "Verander na Wedloop" · "Soek steeds"** instead of "Uitdagersreeks": the search starts again in the other mode with the same coins ('ui:duel-switch'; if the search ended meanwhile, the Uitdagersreeks with the other mode chosen).
  - **Checks:** `qa/ui1134.mjs` (the fit at 412×892 and 360×640 in both modes; the pause label in Oefen and the daily, both straight to the menu, the daily `done`; a bot match keeps "Hou op"; Oefen while searching with 50 coins → "Verander na Blok vir Blok · Soek steeds" → the search in Blok vir Blok for 50) passes, in `check-all.sh full` (`ui-fixes`); `keyboard1121` short af + tall en and `textfit` pass; unit tests 371.
- **1.13.4 (continued): thumb-sized taps** (the Developer Tester on the local 1.13.4, 12 Oct ~00:45: report ~/Documents/Test Reports/stapel-1.13.4-local/2026-10-12-00-45/): the Winkel's tab bar was 26-29 px tall, "Wys" 32 px, the new "Dra" 38 px wide on a small phone, the start screen's 🏆 chip 38 px wide and 🌐 AF 36 px tall → `.shop-tab` and `.shop-try` min-height 40px, `.shop-buy`/`.shop-wear` min-width 44px, `.chip` min-width 44px, `.lang-chip` min-height 44px (css/style.css only). Every Winkel button now 40 px or more (both phone sizes); the sweep's tap-size finding is gone.
- **1.13.4 checked and the app prepared (12 Oct 2026, ~00:45-02:05; nothing released).** `check-all.sh full` on e01785b ALL CLEAR (59, 23:32-00:42); on ebfba7c (00:48-01:57) 58 ok + `nog-n-kans` (`qa/retry112.mjs`) failed only because the run crossed midnight into Mon 12 Oct, when the three free tries start (the card rightly offered "Play again · try 2/3"; the test expected the paid try): pinned to `date=2026-10-11` like `retry1121.mjs`, re-run ok → ALL CLEAR. Unit tests game 371, server 228 + 1. The Developer Tester on the local build (the owner: "Double check with the developer tester skill that everything is fine before asking me to push"): sweep + a walk as a new player at 390×844 and 360×640 (af) and 390×844 (en): 0 critical, 0 high, 1 medium (small buttons, fixed in ebfba7c), 4 low; report ~/Documents/Test Reports/stapel-1.13.4-local/2026-10-12-00-45/report.md.
  - **The app 1.13.4 (11304):** built 02:01 from ebfba7c; Desktop › "Stapel app (Google Play)" › "Upload 1.13.4 internal" (Stapel-1.13.4.aab SHA-256 31fb942afea63e8b6744621c7fa6ee9b5b73504a417f46742c1e8bd1cf3fe1bf, README.txt with the 7-step phone check, release-notes.txt af 445 / en 442); aapt2 11304 / 1.13.4; upload key 77fe7155…; 71 game files = ebfba7c, index.html + the app-shim line, app-shim.js = app/shim.js; MainActivity setTheme → EdgeToEdge.enable → BridgeActivity.onCreate. "Upload 1.13.3 internal" and its .aab/.apk moved to "Older builds" as NOT-FOR-UPLOAD. Next: the full Critic Panel + the Final Boss on that folder; the Play upload only on the owner's own typed "upload" (with his phone check); the website only on his Telegram card taps (63fa3f covers the refill; the skins and fixes need his tap).
  - **Critic Panel on "Upload 1.13.4 internal", round 1 (content 7310a12, ~02:10):** Guardian 9 APPROVE, Customer 8 HOLD, Bottom Line 9 APPROVE, Advocate 9 APPROVE = 35/40. The Customer's must-do: the notes' "(die eerste van elk is gratis)" could read as "your first buy is free" → "(die gewone een van elk is gratis)" / "(the standard one of each is free)" (notes af 445 / en 442; the double colon gone). Also done in the folder: the file count (71 game files + index.html with the shim line + app-shim.js), the live privacy page catches up only with the website release (card 63fa3f, best close to the upload), the phone check "about 10 minutes", the 11304 device count and asking the Family by Fri 16 Oct. The .aab unchanged (31fb942a…).
  - **1.13.5 list (the critics' lifts, not built):** the in-app note `shopSkinsNote` "die eerste van elk is gratis" → "jou gewone een van elk is gratis" (en "your standard one of each is free"; "Just for your eyes" → "Only you see these"); keep the refill count in sight on a full wallet ("Jy het 2 000 of meer munte · nog 2 vandag"); a "Wys" preview or a "Koop Goudstawe vir 2 000?" check for buys of 1 000+ (children's coins); one coin word ("munte" vs "muntstukke"); the search chip half-covers the "Oefenrondte" label on Oefen results; both privacy pages: "Toring-styl" on the `stapel.v1.econ` line; before production: REFILL.on and TESTER_GIFT.on false (or guard against a phone clock set back into 12-16 Oct), the coin-match-only Worker switch, IARC gambling answers and Play's "appeals to children" question again (candy and pink skins; the game says 13+); a sponsor block in each block skin pictured.
  - **Round 2 (content d645c0e, 02:12-02:13): Guardian 9, Customer 9, Bottom Line 9, Advocate 9 = 36/40, all APPROVE, scan clear; the Final Boss 9/10 FINAL APPROVAL (02:17) → Gate OPEN (until ~14:12 12 Oct).** NOT uploaded: the upload starts only on the owner's own typed "upload" in the Stapel terminal, timed for his phone check (README's 7 steps, ~10 min; STOP rule = Pause track). A byte-identical copy for the browser upload is in the session scratchpad (`upload1134/`, SHA-256 31fb942a…). After the upload: the pre-launch report for 11304 (~1 h), Monday 18:00 the device count on 11304 (of 17), Thu 15 Oct ask the Family who used the refill and who bought a look; the website's 1.13.4 (card 63fa3f) best close to the upload (the app's Privaatheid link opens the live page). Next notes: "tot en met Vrydag 16 Okt" / "through Friday 16 Oct"; a clearer WhatsApp line.
- **1.13.4 (continued): the refill up to 4 000** (12 Oct 04:05, the owner in the Stapel terminal: "I think if the skin is 2000 coins lets give them 4000 coins per reload"). `REFILL.to` 2000 → 4000; the same top-up (a press fills the wallet up to 4 000; a full wallet doesn't use a press; 3 a day, Mon 12 - Fri 16 Oct). Unit test and `qa/refill1134.mjs` (af + en: "Vul my munte aan (tot 4 000) · nog 3", "+3 967 🪙 · jy het nou 4 000") pass. The panel-approved folder (content d645c0e, 11304 from ebfba7c) is superseded: a new build + full check + panel round. Google sign-in (the owner asked if it could be in this version): not in 1.13.4 — the sign-in branch (stapel-1.13-signin, a42a7c3) is built on 1.12.0, 37 commits behind (coins, stakes, tries, skins, refill all need to join the cloud save), and needs a live secret (AUTH_SECRET), a D1 migration, the Worker, the owner's "Publish app" click (step D), the two Android clients (step F), Play's Data safety change ("User IDs", account deletion) and a real-phone sign-in test: its own release.
  - **The Winkel's skin note now matches the release notes** (the Customer, the Advocate and the Final Boss on the upload panel): "… Koop dit met muntstukke; die gewone een van elk is gratis." / "Only you see these: your background, crane and blocks. They change nothing in the game. Buy them with coins; the standard one of each is free." (was "die eerste van elk" / "Just for your eyes … the first of each").
- **1.13 started (9 Oct 2026, late; local, not pushed): Sign in with Google and a cloud save.** The owner: "Also can we make it sign into google? For them to save their progress.." and then "First thing in 1.13". Built and tested on this Mac; it stays switched off until the owner's Google setup gives the web client ID.
  - **For players:** optional, under 📊 Statistiek → ☁️ "Bêre jou vordering". Signed in, the towers, coins, looks, ranks, the weekkis and the second tries are the same on the phone and the website (a fresh device takes the account's; a device with its own progress adds it to the account). Signing out starts that device over (its settings, language and reminder stay); the progress stays in the account. "Vee my rekening uit" deletes the account, the save, every device's session and its leaderboard rows. `?rekening` on the website opens the sheet (the privacy page's deletion link, for people without the app).
  - **How:** the website uses Google's own "Sign in with Google" button (its script loads only when the sheet opens); the app uses the phone's own Google sign-in (`StapelGooglePlugin`, Android Credential Manager 1.6.0 + googleid 1.2.1, registered in `MainActivity`; bridged in `app/shim.js` as `window.stapelApp.google`), because Google refuses its web sign-in inside an app. Both give a Google ID token for the web client ID; the Worker checks it (`server/src/google.js`: Google's keys, `aud`, `iss`, expiry) and gives its own session (`server/src/account.js`: `/account/google`, `/load`, `/store`, `/signout`, `/delete`).
  - **Kept:** an account number = HMAC(`AUTH_SECRET`, Google number) (the Google number, name, email and photo never), the save (the game's own progress, `storage.js` `cleanSave`; a tower being played is never in it), and per device a session of which only the SHA-256 is kept (at most 10 devices). Sessions unused 400 days end; accounts unused 2 years go (cron).
  - **Merging** (`js/core/cloudsave.js`, pure): counters = the account's plus what this device added since it last synced (the first time: both piles, a day played on both counted once with the better tower); bests = the higher; collections = both; choices = the side that changed it (the first time: the account's); the streak follows the merged days; the weekkis and a new month's rank follow the later side. `js/account.js` keeps `stapel.v1.cloud` (`token`, `account`, `rev`, `base` = the account's save at `rev`, `pending`); a store must build on `rev` (else `409` with the newer save to merge), and a store whose answer was lost is sent again with the same `push` id (the server answers it once). Syncs: the menu, a results screen, purchases, a new name, the ranglys switch, the game going to the back or coming to the front; never while a tower is built.
  - **Review** (agent, over the whole diff): 5 confirmed + 7 possible, all fixed. (1) A store whose answer was lost could still count twice after 16 newer stores or a server sign-out: every store's id is now kept 90 days (`account_pushes`, written with the store in one batch), a stale store is checked against them again before the `409`, and a device signed out by the server keeps its `pending` store for when it signs in again. (2) A device that hadn't synced yet could build today's tower again (a free second try) or restart the weekkis: the first sync now runs at once at start (and on coming back after 20 s), the Daily Tower waits up to 3 s for it ("Haal jou vordering…"), and the merge counts the weekkis on through the merged days. (3) Second tries were never pruned and an oversized save jammed syncing: tries older than 90 days drop off, `fitSave` keeps a save under 240 KB, and a refused store (400/413) is no longer taken for "offline". (4) Deleting left a second device's earlier leaderboard rows: the save lists the numbers its devices used before (`board.past`, 8), and delete takes them all. (5) Signing out after the server had ended the session wiped unsynced progress: now refused ("Jy is uitgeteken…"). Also: no progress copied into a different Google account (that device starts over), `gen` tells an account deleted and made anew from the old one, sign-out and delete wait for another tab's sync, `?rekening` works through the app's links, an honest toast when the first save is still to go, a second try's Perfeks played on both devices count once. Accepted: delete trusts the save's leaderboard numbers (random, never shown publicly); a device that played today's daily before joining can leave a second row that day.
  - **Tests:** server 12 new (`server/test/account.test.js`: real and forged tokens, conflicts, a store sent twice even 40 stores later, sign-out, 10 devices, delete with the board and earlier numbers, clean-up); game `tests/cloudsave.test.js` (13: a phone and the website through every kind of progress, the weekkis put right, tries once, size) and `tests/account.test.js` (14: the device side against the real Worker on node:sqlite with a fake Google: lost answers, two at once, offline, a tower in progress, sign-out, deleted elsewhere, the review's cases). Browser (`qa/accounthost.mjs` = the real Worker with a fake Google): `account113.mjs` (two devices, af tall + en short: same progress, coins both ways, sign-out, delete, `?rekening`; screenshots), `account_native113.mjs` (the app's own button with a faked bridge; Google's web script never loads there) and `account_stale113.mjs` (an old copy taps the Daily Tower at once: it waits and shows the phone's tower as done). The Android debug build compiles with the plugin. Unit: game 331, server 200, all pass.
  - **Privacy page** (af): the new section 2d and `#uitvee` (deleting: in the game, `?rekening`, or by email), Google as an operator, retention, the `stapel.v1.cloud` key (and the 1.12 keys `ranks`/`retry`); Weergawe 2026-10-09 (`js/sponsorConfig.js` `privacyVersion` to match).
  - **To switch it on (owner first, then Claude with the owner's OK):** the owner's Google Cloud steps (`~/Desktop/Stapel app (Google Play)/Google sign-in steps.txt`: a project, the sign-in screen, "Publish app", a web client and two Android clients); then the web client ID into `js/config.js` `AUTH.googleClientId` and `server/wrangler.toml` `GOOGLE_CLIENT_ID`; `./wr.sh secret put AUTH_SECRET` (never change it later); migration `0005_accounts.sql`; Worker, push, Pages; the app 1.13.0 build; Play Data safety: "User IDs" (collected, not shared, optional, App functionality + Account management) and account deletion "yes" with https://stapelspel.pages.dev/privaatheid#uitvee. Then a real sign-in on the website and on a phone.
- **1.14.0 (12 Oct 2026, early morning; local branch `stapel-1.14-signin`, NOT released): Sign in with Google + the cloud save on top of 1.13.4.** The owner (Stapel terminal, ~04:30): "Is it possible to start now then I can approve when I wake up?"; Google's side (steps A-F incl. "Publish app") was completed by him at ~04:30 (`~/Desktop/Stapel app (Google Play)/Google sign-in steps.txt`). The sign-in branch above (built on 1.12.0, 37 commits behind) merged onto 1.13.4 (2a831b9).
  - **The owner's principle (12 Oct ~04:40): "its just people skipped the payment section due to login, people want it as simple as possilbe".** Sign-in is NEVER a gate: no login before playing, a match, the Winkel or any future payment; everything works as a guest exactly like 1.13.4. One tap: Google's own button on the website, the phone's own account picker in the app (Credential Manager "Sign in with Google"); no forms, passwords or typed emails. No nagging: no popup on start; the ☁️ button in 📊 Statistiek, plus ONE gentle dismissable offer at a good moment (a new best on the results, or just after a purchase in the Winkel: "Bêre jou vordering met Google · een tik" / "Save your progress with Google · one tap"), at most once every 60 days and once a visit (`stapel.v1.signoffer`, on both privacy pages). A cancel shows nothing; a failure one calm toast ("Inteken het nie nou gewerk nie. Jy speel gewoon verder."); the game carries on as a guest. Signing in mid-game keeps the phone's progress (merge, never wipe).
  - **Shown only when it can work:** the Worker's `GET /daily/config` now says `signin: true` when GOOGLE_CLIENT_ID and AUTH_SECRET are both set; the game shows the button and the offer only then (or for a device already signed in). So the website/app 1.14.0 can go out before the secret: no sign-in appears until the Worker is ready (the live 1.13 Worker doesn't send `signin`: closed). Test pages: `?debug=1&cloud=1` open, `&signin=0` closed.
  - **Merge (conflicts):** MainActivity keeps the 1.13.3 order and adds the plugin: `setTheme` → `EdgeToEdge.enable` → `registerPlugin(StapelGooglePlugin)` → `super.onCreate`; app/shim.js's link test also passes `?toetser=` and `?rekening`; storage.js's `cleanRetryMap` (module level, also for saves) carries 1.12.1's `n`, `paid`, `best`; main.js keeps the tester-gift link, the free-tries load and the account sync; dom.js keeps the nickname button and the account button in Statistiek, both modals; server config keeps the free tries and the sign-in settings; the privacy pages (af + en) merge the account sections (2d, #uitvee, Google as an operator, `stapel.v1.cloud`) with 1.13.4's lines; `privacyVersion` 2026-10-12 (use the release day when it goes out; edit both pages and js/sponsorConfig.js together).
  - **What syncs now (js/core/storage.js cleanSave, js/core/cloudsave.js mergeSaves):** besides 1.13's towers, stats, Oefen, duel record, wallet, ranks, weekkis and leaderboard number: the extra daily tries with how many were used (`n`; the side that used more wins, the best try of both) — a signed-in reinstall gets the day's used tries back, closing the owner's "reinstall gives a fresh try" gap for signed-in players; the tower's skins (owned: union; worn: a choice); the testers' gift day (the earlier; a tester stays off the leaderboard on every device, and signing out keeps it: no second gift); the refill count (a counter on the later day: the day's 3 presses hold across devices once synced); the coins last chosen to play for (a choice). **Never synced:** a coin match's held stake (`econ.stake`: one device, one match — importSave and resetProgress keep this device's, a save never carries one), a tower being played right now, the free-tries setting (the Worker's word), settings, language, reminder. The wallet syncs through `coinsChanged()` (refill, skins, gift, purchases, stakes) and wearing looks/skins; plus the existing syncs (results, matches, coming back to the game).
  - **Server:** migration renumbered `0006_accounts.sql` (0005 is the board's tries); `GOOGLE_CLIENT_ID` in wrangler.toml (public); `AUTH_SECRET` NOT in the repo (set once, never changed). D1 note: `wr.sh d1 execute --file` was refused on 10 Oct (error 10000): run the migration's statements with `--command`.
  - **Known edge:** a fresh device that takes the testers' gift before it first syncs with an account that already had it adds both gifts on the first join (testers only; the 999 999 cap holds).
  - **Tests:** game 405 (tests/cloudsave.test.js +7: the reinstall keeps the tries, tries on both devices, skins, the stake never synced, the tester lock, the refill count, the stake choice), server 241 + 1 skipped (account.test.js: the `signin` flag). Browser (after the 1.13.4 release frees the browser): `qa/signin114.mjs` (closed: a guest exactly as before; open: one offer after a purchase, ✕, not again; the app's cancel quiet; a failure calm; a sign-in from the offer keeps coins and skins) and the branch's account113 / account_native113 / account_stale113 (accounthost.mjs now takes `REPO=` for a worktree, `NO_SECRET=1` for a closed server). VERSION 1.14.0 (sw `stapel-v1.14.0`).
  - **The owner's approvals, in order:** `docs/APPROVALS-1.14.md`.
- **1.14.0 (continued, 12 Oct ~06:00-07:30): the owner's answers built in.** Typed in the Stapel terminal: the push plan "Website + server now, app after my phone test" (docs/APPROVALS-1.14.md: a AUTH_SECRET, b D1 0006, c the Worker, d the website, e Play Data safety — approved, each after its panel; f the app 11400 after his phone test; the exact commands and the ways back are in that file).
  - **Sign-out keeps everything** (the owner: "Yes it need to keep everything hense the Google sign in"): js/account.js `signOut` ends this device's session only — the store is never reset; the link keeps `base`/`rev`/`pending` with `token: null, left: true` (status `out` stays false: no "you were signed out" warning), so signing in to the same account again counts nothing twice; offline it still signs out (what wasn't saved goes with the next sign-in). Deleting the account deletes the account and its leaderboard rows; the phone keeps its own progress (`writeLink(null)`). A different Google account: nothing wiped; the phone's progress joins that account as new (as a guest's would). Known cost of never wiping: an account deleted and made anew on two devices brings both devices' copies in (tests/account.test.js says so; coins can't be bought). The strings (accountSignOutAsk, accountBye, accountDeleteAsk, accountDeleted) and both privacy pages say so; store.resetProgress stays but nothing calls it.
  - **⚙️ Instellings, like 8 Ball Pool** (the owner's choice): the menu row is ❓ Speelreëls · 📊 Statistiek · 🛍️ Winkel · ⚙️ Instellings (Klank and Vibrasie moved in; bigger round buttons, 100u). The sheet (js/ui/dom.js showSettings/renderSettings, `modals.settings` replacing the old account sheet): the account section at the top (hidden until the server says `signin: true`; not signed in: "☁️ Bêre jou vordering" + Google's button / the phone's picker + "Stapel hou net ’n nommer …"; signed in: "Ingeteken met Google ✓", the saved line, "Teken uit", "Vee my rekening uit" with their confirm steps in place; never a name, email or photo), then 🔊 Klank, 📳 Vibrasie (phones only), ◐ Kontras (switch rows, saved like the pause card's toggles — shared `setToggle`), 🌐 Taal (the same picker as the 🌐 chip, which stays), 🔔 Herinneringe (only where the app's reminders exist; moved from Statistiek), 🔒 Privaatheid › (the page). "Bêre jou vordering", the privacy page's ?rekening and the offer's sign-in all use Instellings; Statistiek keeps only the nickname button. Android Back closes it (the generic sheet rule). The pause card keeps its quick toggles.
  - **Privacy date** 2026-10-12 on both pages and js/sponsorConfig.js (the release day). **Gambling:** "Lets proceed, we will sort out gambling laws if it works" — the SA gambling-law opinion is due before coins are ever sold for money, not before sign-in.
  - **Fixes found on the way:** the gentle offer's ✕ covered the end of its line (padding 56px each side); the account section printed "null" for empty parts (`replaceChildren` with nulls; now filtered).
  - **Tests:** game 405 (tests/account.test.js: sign-out keeps everything and re-sign-in counts nothing twice, offline sign-out, sign-out after the server's, another Google account, deleted-and-made-anew), server 241 + 1 skipped. Browser (on this worktree, accounthost with REPO=wt-114): `qa/settings114.mjs` (new: the 4-button row ≥44 px, every row, switches kept after a reload, privacy link, Back, the account hidden without `signin` and on top with it, signed in without personal data, no "null", 360×640 af + 390×844 en) ok; `qa/signin114.mjs` ok; `qa/account113.mjs` tall af + short en ok (now through Instellings; sign-out and delete keep the device's progress); `account_native113` ok; `account_stale113` short en ok; `textfit` ok; `keyboard1121` short af ok; `remind110` (the reminder now in Instellings: "🔔 Herinneringe 18:30").
- **1.13.4 final (2a831b9: the 4 000 refill + the Winkel's note "die gewone een van elk is gratis") — checked and rebuilt (12 Oct 05:27).** `check-all.sh full` on 2a831b9 (04:12-05:22): 58 ok + `bot-exit` failed on a test timing slip (a full-page screenshot between "Kanselleer seen" and the tap outlasted the ~3.6 s 3-2-1: at 04:57 under heavy load, and always on the tall page): a probe showed "Kanselleer" stays for the whole 3-2-1 and a tap goes back; `qa/botexit1133.mjs` now taps first and takes its picture after → short + tall ok → ALL CLEAR. The app rebuilt 05:27 from 2a831b9: Stapel-1.13.4.aab SHA-256 21a7e8200b02f9eff1cef63986b8da97d98708f97b27bf2d35ff31951fac2363 (11304; key 77fe7155…; 71 game files + app-shim.js = 2a831b9, index.html + the shim line; refill `to: 4000`; MainActivity order ok); notes af 452 / en 446 ("tot 4 000", "tot en met Vrydag 16 Okt", "Die WhatsApp-uitdaging wys nou die munte bo-aan"). **The owner's typed approvals (~04:28, AskUserQuestion in the Stapel terminal):** "Yes, upload when all pass" (upload while he sleeps, the phone check when he wakes), "Yes, website too" (push + Pages, no Worker change), "Yes, pause it if it crashes" (pause the internal track if Play's pre-launch report shows a start-up crash). Next: panel round 3 + the Final Boss on the rebuilt folder → the website → the Play upload → the pre-launch report.
- **1.13.4 WEBSITE LIVE, 12 Oct ~05:34 (the owner's typed "Yes, website too", ~04:28):** push c9601ff..c3e5064 (the old address), Pages 68f7dd0a; both addresses serve stapel-v1.13.4 with `to: 4000`. **The way back:** Pages rollback to 560334e2 (1.13.3) + a revert push; no Worker change. `check-all.sh live` ALL CLEAR (9); `qa/refill1134.mjs` and `qa/skins1134.mjs` against the live site ok. Note for the record: the OLD bot-exit test also failed once more at 05:25 on the tall page (/tmp/stapel-checks/bot-exit-rerun-tall.log), the same timing cause (its screenshot outlasted the 3-2-1); the fixed test (tap first) passes short + tall. App upload panel round 3: Guardian 9, Customer 9, Advocate 9, Bottom Line 8 HOLD (the folder README and the playbook still described the 2 000 build and the old "phone check right after" rule) → both fixed → round 4.
- **Play app 1.13.4 (11304) UPLOADED to internal testing, 12 Oct 2026 05:51** ("Available to internal testers"; release 13 on track 4701560296024257185), on the owner's typed "Yes, upload when all pass" (~04:28). Panel round 4 on the folder (content 7f1ebe6): Guardian 9, Customer 9, Bottom Line 9, Advocate 9 = 36/40, scan clear + the Final Boss 9 FINAL APPROVAL; the bundle Stapel-1.13.4.aab SHA-256 21a7e820…2363 from 2a831b9 (uploaded from the byte-identical scratchpad copy); the notes pasted and checked by SHA-256 (af 452 / en 446, 6 of 6 languages); the review page showed only the expected warning (no deobfuscation file), no device changes, "Save and publish" (no review, no other changes, no declarations). Folder → Older builds "DONE Upload 1.13.4 internal (uploaded 12 Oct 05:51)". **Next:** Play's pre-launch report for 11304 (~06:50): on a start-up crash → Pause track at once (the owner's yes); the owner's 7-step phone check when he wakes; Monday 18:00 the device count on 11304 (of 17); Thu 15 Oct ask the Family who used the refill and who bought a look.
  - **Pre-launch report for 11304 (checked 12 Oct 06:53): none.** Play Console › Testing › Pre-launch report shows "Upload artifacts to generate pre-launch reports" with no report at all: Google generates them for closed/open testing uploads, not internal testing (11302 had none either). So the safety net "pause on a start-up crash" had nothing to read; the owner's phone check is the first real-device check (STOP rule: Pause track). For future internal uploads don't plan on a pre-launch report; a closed-test upload would get one.
- **1.14 server panel round 1 (on 84c6ba9) → fixes (12 Oct, morning).** Holds: the Advocate 6 (POPIA), the Bottom Line 8 (runbooks), the Customer 8 and the Guardian 8 (the quiet window; the D1 write budget). Done:
  - **POPIA (text):** a calm under-18 line beside every sign-in spot, no extra tap — Instellings' account section and the gentle offer: "Jonger as 18? Vra eers jou ouer of voog." / "Under 18? Ask your parent or guardian first." (fits 360×640 with the button in view); both privacy pages' 2d first bullet: "As jy jonger as 18 is, teken net in as jou ouer of voog sê dis reg (POPIA artikel 35)." / "If you are under 18, sign in only if your parent or guardian agrees (POPIA section 35)." Made true for signed-in players: 2c (the player number is also in the saved progress, so "Vee my rekening uit" deletes the leaderboard entries), 2d "what we keep" (+ the numbers other devices used before, at most 8 — cleanSave's `.slice(-8)`), 2d "Google itself" (the button script loads when Instellings opens or when the gentle offer appears on the results/Winkel, only while sign-in is open and you aren't signed in — js/account.js `loadGis` is only called by `renderButton`, from those two slots). #uitvee's email route reworded (we answer within 30 days and help you delete it yourself, in the game or at ?rekening; we can't find your account ourselves; an unused account goes by itself after 2 years — ACCOUNT_DAYS 730); deletions also leave Cloudflare's D1 restore copy within 7 days (#uitvee and section 8); section 4: "Jou vordering bêre … jou toestemming (POPIA artikel 11(1)(a)); trek dit terug met Vee my rekening uit"; `accountKeeps` "Stapel hou jou vordering en ’n nommer …".
  - **A busy server is calm:** a 429 on sign-in, a load or a save shows "Stapel is nou besig. Ons bêre later weer." / "Stapel is busy right now. We’ll save again soon." (js/account.js state.error `limited`; the held-back save stays `pending` and goes first next time); "Google het jou nie ingeteken nie. Probeer weer."; the website's account section adds "Binnekort ook in die Stapel-toep." (not in the app).
  - **Per-account save cap:** `/account/store` allows 120 saves an hour per ACCOUNT (any address; `RATE_LIMIT_ACCOUNT_STORES_PER_HOUR`), so one scripted account can't use up the free plan's 100 000 D1 rows a day (120 × ~5 rows × 24 h ≈ 14 400). Like all limits here it is in memory per isolate (README §11). Tests: the 61st sign-in → 429 (Retry-After 3600), the 901st account call → 429, the 121st save of one account from another address → 429 with nothing changed; the game's side: tests/account.test.js "a busy server is calm".
  - **Runbooks (docs/APPROVALS-1.14.md):** one quiet window first (no live match), then a, b, c back to back (`wrangler secret put` deploys a new Worker version too); (a) the secret made in Python and handed to `security -i` on its input (never on a command line), the 64-character check, the piped `secret put`, the new version id noted, a second copy in the owner's password manager; (b) the seven `--command` statements, the `sqlite_master` check (exactly 3 tables + 4 indexes) and the `sql` column, STOP before (c) otherwise; (c) deploy, `/daily/config` → `signin:true`, a live probe (`/account/load` with a dummy 64-character token → 401 signed_out: route, tables and secret live), the board; the way back with the secret check after a rollback. server/README (the 0006 note, §3.3 the secret, §10 sign-in's D1 footprint: ~5 rows a save, saves 5-35 KB (max 256 KB), roughly 1 500-2 000 signed-in players a day on the free 100 000 writes, 500 MB per database, Workers Paid US$5/month after that; §11 the limits), the migration's header and the stapel skill §4.1 step 6 now say `--command`, not `--file`.
  - **Tests:** game 406, server 243 + 1 skipped; browser on wt-114: settings114, signin114 (both now check the under-18 line), account113 tall af + short en, textfit, keyboard1121 short af, privacy1131 (both pages, 2026-10-12, no sideways scroll) — all ok.
- **1.14 SERVER LIVE, 12 Oct 2026 13:40-13:42** (the owner's typed approvals: ~06:00 "Website + server now, app after my phone test"; ~09:00 "\"Ask your parent\" line + lawyer later"; 13:39 "Nobody, go now"). Critic Panel on the repo at 980e549: round 1 30/40 (Guardian 8, Customer 8, Bottom Line 8, Advocate 6 → fixed in 980e549), round 2 36/40 (all four 9) + the Final Boss 9 FINAL APPROVAL; `check-all.sh full` on 980e549 ALL CLEAR (65). One quiet window: noted the live version 594c7235 and the D1 Time Travel bookmark 000001bf-00000000-00005102-b6eab624002815f8c9e2da7981e41a08; (a) AUTH_SECRET made by the stdin method (never on a command line), kept in the Keychain as "Stapel AUTH_SECRET" (64 characters), piped into `secret put` → version f632dfe5 (1.13.1 code + the secret; the FIRST way back); (b) the 7 `--command` statements, all ok; sqlite_master: 3 tables + 4 indexes with the right columns; (c) `./wr.sh deploy` → version b6601722-d420-4969-b60d-e71a96ff3c91; `/daily/config` → {"free":3,"from":"2026-10-12","signin":true}; POST /account/load with a dummy `token` → 401 signed_out (the session table read: route, tables and secret live); today's board answers (3 players). `check-all.sh live` with the 1.13.4 website on the new Worker: ALL CLEAR (9). **The way back:** `./wr.sh rollback f632dfe5-0148-4458-a94f-5d08f2d0b60d --yes` (sign-in off, the secret stays), else 594c7235 (then check `secret list`); the tables can stay; AUTH_SECRET must NEVER change once players sign in. **Next:** the owner keeps a second copy of AUTH_SECRET in his password manager (Bitwarden recommended) → (d) the website 1.14.0 (push + Pages) → (e) Play Data safety (its own panel) → (f) the app 11400 after his phone test. **Watch:** Tue 13 Oct morning no `account_prune_failed` in the Worker logs; Fri 16 Oct `SELECT COUNT(*) FROM accounts` and D1 rows written per day (well under 100 000). **Legal to-do (beside the gambling opinion):** the attorney on POPIA s35 for 13-17-year-olds signing in (the owner's choice: the "ask your parent" line now, the lawyer later), before coins are ever sold.
- **1.14 WEBSITE LIVE, 12 Oct ~14:00** (the owner's approvals; he first kept a second copy of AUTH_SECRET in Bitwarden — recommended; the clipboard cleared after): push f73926b..5b8e79a, Pages 9623ad11; both addresses serve stapel-v1.14.0; the live Instellings sheet (af + en) shows Google's own button ("Meld aan met Google"), the under-18 line and "nie jou naam, e-pos of foto nie", no errors (`qa/liveprobe114.mjs`, look-only); privacy pages dated 2026-10-12 with the POPIA s35 line and #uitvee; `check-all.sh live` ALL CLEAR (9). **The way back:** Pages rollback to 68f7dd0a (1.13.4) + a revert push; sign-in off for everyone: the Worker rollback to f632dfe5.
- **The app 1.14.0 (11400) prepared, 14:16** (the owner ~14:05: "Please push it to the playstore for testing"): built from 1e8b6e5 = 5b8e79a + the manifest dropping USE_BIOMETRIC / USE_FINGERPRINT (androidx.credentials adds them; Stapel only uses Google's account picker) → permissions identical to 1.13.4; Stapel-1.14.0.aab SHA-256 0226df5e88ac72ed94c0b1b68cff028d5ffe2478ec875179955d83d609eda7e6; 74 files = 1e8b6e5 (+ index.html's shim line); MainActivity setTheme → EdgeToEdge → registerPlugin(StapelGooglePlugin) → onCreate. Folder "Upload 1.14.0 internal": the .aab, release-notes.txt (af 445 / en 444), README.txt (the order: Data safety first, then the upload; the owner's 6-step phone test; STOP rule), data-safety.txt (User IDs + the game save, optional, not shared; account creation via Sign in with Google; deletion link). Next: the full panel + the Final Boss on that folder → Data safety → the upload → his phone test.
- **Play app 1.14.0 (11400) UPLOADED to internal testing, 12 Oct 2026 17:35** ("Available to internal testers"; release 14 on track 4701560296024257185), on the owner's "Please push it to the playstore for testing" (~14:05). Panel on "Upload 1.14.0 internal" (content e90451e): round 1 31/40 (the Guardian + the Advocate: Google's sign-in proof carries the email address, so Data safety must list it) → data-safety.txt item 2 + APPROVALS step e (14d7668) → round 2 Guardian 9, Customer 9, Bottom Line 9, Advocate 9 = 36/40, scan clear + the Final Boss 9 FINAL APPROVAL. **Data safety first (step e):** account creation = OAuth (Sign in with Google), delete-account URL /privaatheid#uitvee, partial deletion /privaatheid#p9; added Email address (collected, processed ephemerally, not shared, optional, Account management), User IDs and App activity › Other actions (the game save; collected, not shared, optional, App functionality + Account management); Name and Device or other IDs gained Account management; App interactions unchanged. The store preview: no data shared; Personal info "Name, User IDs" (the email is ephemeral, so not shown); Publishing overview listed exactly 1 change → sent for review. **Then the app (step f):** from the byte-identical scratchpad copy (SHA-256 0226df5e…); Play read 11400 (1.14.0), API 24+, target 36, no devices lost, +729 KB (the sign-in library); notes pasted and checked by SHA-256 (c7983181…, 6 of 6 languages); only the deobfuscation warning; "Save and publish" (no review). Folder → Older builds "DONE Upload 1.14.0 internal (uploaded 12 Oct 17:35)". **The owner's phone test, in this order:** sign in (Instellings › "Teken in met Google" › his account › "Ingeteken met Google ✓") → coins and skins still there → the same progress on the website → Teken uit keeps everything → tap sign-in again and cancel: nothing scary → sign in for real: nothing twice. STOP RULE: Pause track if the app won't start or sign-in breaks the game. **Testers:** Play's statistics (to 10 Oct) showed 1 device with the Play app; most of the Family play on the website or the WhatsApp APK, which Play can't update; they join through https://play.google.com/apps/internaltest/4701560296024257185 (uninstall the WhatsApp copy first; its coins don't carry over). **Watch:** Tue 13 Oct the Data safety review (Publishing overview); Tue 13 Oct 18:00 devices on 11400; Tue morning no `account_prune_failed`; Fri 16 Oct the account count + D1 rows written; Thu 15 Oct ask the Family who used the refill and who bought a look. **1.14.1 list:** the server checks the sign-in nonce; the session token kept out of Android backups; the offer card's "· een tik" → "· vinnig" + the keeps line; admin.js and adverteer.js out of the app build; an English link inside #uitvee; Google brand verification (the sheet says "stapelspel.pages.dev"); the POPIA s35 attorney before production.
- **1.14.0 (11400) on the CLOSED TEST + a new content rating, SENT FOR REVIEW 12 Oct 2026 19:07.** Why: the closed test "Alpha" still gave 11200 (1.12.0) to the Family (the same 17-person list as internal testing), so testers who joined only the closed test (the old link) got 1.12.0 without coin matches; a Family phone did at ~17:55 even after joining the internal test (Play hadn't seen the internal sign-up yet). The owner (typed): 18:06 "YES PLEASE"; 18:09 AskUserQuestion "Yes, simulated gambling (Recommended)"; 18:12 he ticked IARC's terms box himself; 18:18 "Go ahead, 18+ in Australia" (after seeing the summary); 18:39 no Family in Australia; 18:55 "I have asked my wife to open it and it worked!" (her app sign-in reached D1 at 18:41:44: a new account, its save stored twice). **The rating** (saved 18:38 by the owner's own click): gambling = only "other games that use and reward in-game currency" (the coin matches); report Yes, block No (emoji mute only), no chat; → Australia 18+ (Simulated Gambling), Taiwan PG15, Saudi 16 (not Stapel countries), 3+/Everyone/PEGI 3 elsewhere. Target audience 13+ (no under-13), so the Families ban on simulated gambling doesn't apply. **Panel** on "Upload 1.14.0 closed": round 1 33/40 (Guardian 7: the phone check first; Bottom Line 8: APPROVALS step g before the click) → round 2 36/40 + the Final Boss 9. **Release:** Internal testing › 11400 › Promote release › Closed testing - Alpha (the notes re-pasted, SHA-256 c7983181…; only the deobfuscation warning) › Save › Publishing overview: exactly the Alpha release + the Content Rating → sent. Data safety (1.14) was already approved. Folder → Older builds "DONE Upload 1.14.0 closed (sent for review 12 Oct 19:07)" (its old WhatsApp draft renamed OLD-DO-NOT-SEND); the corrected message: "WhatsApp vir die Family (1.14).txt" in the Play folder (send after approval). **Watch:** Publishing overview Tue 13 Oct morning/evening + Wed 14 Oct; after approval Alpha = 11400 and its pre-launch report. **Before production (legal, the Advocate):** Australia 18+ — the Online Safety Phase 2 codes (also the website, which offers coin matches in Australia with no age check) or coin matches off there / Australia dropped; SA Film and Publication Board; the gambling and POPIA s35 opinions; Play's "could it appeal to children?" again. 1.14.1/1.15 notes: name the coin matches.
- **1.15.0 "the final polish" (12 Oct 2026, 19:10-22:58; branch `stapel-1.15`, worktree `wt-115`; WEB LIVE 13 Oct 03:31-03:35, see "1.15.0 WEBSITE + WORKER LIVE" below; Play 11500 internal 06:49 + closed test in review 06:51).** The
  owner (Stapel terminal ~19:10): the UX/UI nitty-gritty, more bricks and backgrounds ("its too sipmple"), celebrations
  "people want to buy it with the coins", Afrikaans and English double-checked, "somthing a 22 year old looks at and
  thinks I need this"; his bar: **40/40 from the critics and the Final Boss 10/10 for every 1.15 release step**. He tested
  each change live on the test copy (port 8390, offline) and steered ~120 rounds; at the freeze (22:58): "LETS GO! ... now
  it looks like a premium game that people will spend money on." The steps and his words: `docs/APPROVALS-1.15.md`.
  - **The premium look:** every `.card` in dark glass (navy, a gold edge where it matters) with re-set colour variables;
    the Uitdagersreeks' three play cards (gold "Soek ’n teenstander"), the mode tiles, the day-done card in tiles (🔁 tries
    with a tap note, the 🏆 chip on its corner), the weekly chests on glass with the 🔥 on their corner, the round menu
    buttons (an even eight-tooth gear), modern buttons (no gloss stripe), the results' reward pills and a "Jou blokke" key
    under the grid, the punishment choice as a 2x2 on the left (a gold "🏁 10 m" badge, no name), the race track's
    pointers without names (gold yours left, blue theirs right), the versus cards that slide in with the medal popping out.
  - **The player card as a collectible:** each frame its own rich card and glow, a shine, the medal standing out; in the
    Winkel's Uitdager-styl tab it rides along over the frames, medals and titles (`.look-zone`), then scrolls away.
  - **More to buy:** rarity tiers (common/rare/epic/legendary) and "Nuut" tags; worlds Kersiebloeisels (Japan, Fuji),
    Noorderlig (real peaks, no forest), Diep ruimte (open space, no clouds), Akwarium (reef, rays, a school with the turtle
    ~7.5 s behind, jellyfish, a far whale, a sunken chest), Retro-neon (low neon ranges), Safari (an elephant, clouds
    lifted), Sterrenag's turning lighthouse beam; each world's own fish (none in space); world photos on the tiles
    (`img/worlds/*.jpg`, precached; build-pages and the app build copy `img/`); the Neon crane (legendary, 2 500) and a
    polished Gold one (no running glint, the owner removed it); 8 block skins; medals (SVG lion, rugby, season medals);
    celebrations incl. a proper SA drum braai (boerewors, tjops, sosaties, a mielie; tongs, klik-klik, a flip).
  - **"Probeer" (Try it)** on every tower style: the world wears it, a bar buys or wears it, ‹ 3/9 › steps through (arrow
    keys too), back to the Winkel where you were (`ui:skin-try`, main.js `settleTry`; the menu tower restyles safely:
    GameScene `idleRestyle`, the reset lets go of a held block, a guard for a missing shape).
  - **Play:** the balance meter as a spirit level hung under the jib (the bubble on the heavy side, green → red, one soft
    buzz `haptics.warn` entering the red), weather and visitor chips on the left (`hudState.visitor`), "Jou blok land hier
    ↓" with its arrow over the ghost's middle (one arrow at a time), the lesson's last card low and small, a match's
    "Hou op" → "🏳️ Gee die wedstryd op".
  - **Ranks in growing points** (RANK_SCALE Brons 100 ... elite 500; the ladder maths unchanged), the weekly chest you tap
    open, the streak explained, "Kleurblindmodus", "Nuwe weergawe!" (`APP_LATEST` in wrangler.toml, "1.14.0" until Play
    has 1.15 for everyone), ~80 Afrikaans/English fixes and the 1.15 proofread (last: "Jy het vandag die Daaglikse
    Toring n keer gebou", "Stuur vir ’n vriend ’n skakel" / "Send a friend a link", the unused boardPlace/boardShort
    duplicates removed).
  - **Privacy (2026-10-13, both pages + sponsorConfig.privacyVersion):** the player card also carries the block skin you
    wear (`bs`), so a friend sees your blocks in Blok vir Blok; the server keeps nothing new.
  - **QA scripts changed:** shop18 (Kragte is the third tab), ui1134 (the match's give-up label; "Wissel na Blok vir
    Blok"), coins113 (the stake warning's words), retry1121 (the tile shows all tries, 🔁5); after the first full check
    (12 Oct 22:58-00:29: 9 FAILs, all checks expecting the old words or the 🪙 emoji, none a game fault): lib.mjs
    `coinText` (a test browser reads the gold coin `.coin-ic` as 🪙; used by coins113 and share1133), balmeter110 (the
    spirit level's bubble instead of the old arrow), privacy1131 (any version from 2026-10-12), skins1134 (every tower
    style in SKINS, 28 now), friends1121 ("Resumes in"), signin114 ("Speel gewoon verder"). New scratch tools: main115/*.mjs (try, shop, worlds,
    punish, vs, cards, flows, celframes: a celebration on a controlled clock).
  - **Kept for 1.16 (the owner: "Keep it for 1.16"):** sea creatures to buy with coins (shark, whale, dolphin, octopus,
    turtle) with Try it.
  - **The heat wave is gentler:** the crane at 1.3x, was 1.5x (`WEATHER_TUNING.heatCraneMul`; the owner: "The heat wave
    needs to be difficult but not that difficult. Please take it down a notch"). `DUEL.rules` stays 112 on purpose, so
    website (1.15) and app (1.14) players still meet in matches: until a player's app is on 1.15 its crane races at 1.5x in a
    heat wave (the daily board is shared; heat waves fall on 13, 15-19 Oct) and a race's Hittegolf punishment hits a 1.14
    tower the old way. Claude's call overnight (13 Oct; the owner asked for the gentler heat wave, not for this side
    effect): accepted for the few days until Play has 1.15 for everyone, and named in his morning note.
  - **Download:** the offline cache is 74 files, ~3.08 MB raw, ~1.0 MB over the wire (1.14: 63 files, 2.57 MB; the 9 world
    photos 180 KB). 1.16's sea creatures should start with a trim (the photos as WebP, the biggest scripts).
  - **Panel round 1 (6a33cc9, 13 Oct ~00:55-01:10): 30/40, all HOLD** (Guardian 6, Customer 8, Bottom Line 8, Advocate 8).
    Fixed in round 2:
    - *A 1.14 app's sync dropped 1.15 purchases* (the Guardian ran it with the real code): a 1.14 app cleans a synced save
      against its own shop list, so the website then wore the standard look again and a new phone signed in without the
      1.15 items (coins stayed right). `js/core/cloudsave.js` `worn`: when this device wears an item it owns that the
      account's copy no longer owns and the account went back to the standard one, keep wearing it (not on the first
      merge); `tests/cloudsave115.test.js`. The server keeps every shop id the kept save owned (`server/src/account.js`
      `keepOwned`, one extra D1 read per store; `server/test/keepowned115.test.js`): this also guards 1.16's items
      against 1.15 apps (as long as the Worker goes out first with 1.16's economy.js: keepOwned only keeps ids it
      knows). Round 2 (the Guardian, 7 HOLD): on the real path the two cancelled out (keepOwned listed the item as owned
      again, so `worn` stepped aside and the website went back to the standard look); round 3: keepOwned also keeps the
      kept save's worn id when the new copy wears the standard one and didn't own it (a game that owns it and wears the
      standard one chose that); keepowned115 replays the whole path (the website, a 1.14 store, the website's merge, a
      new phone: owned and worn, coins 950; the 1.14 app sees no change, so no upload loop).
    - *Words:* the Winkel's tower-style note is true again ("Jou agtergrond en hyskraan sien net jy; in Blok vir Blok sien
      jou teenstander ook jou blokke ..." — round 3's word order, "Blok vir Blok" kept on one line); the stake note a whole sentence again ("Munte kan nie gekoop of vir geld
      omgeruil word nie." / "Coins can’t be bought or swapped for money."); "Hulle kos nooit ’n hartjie nie"; Blok vir
      Blok: "Val daar blokke af in jou beurt, kos dit jou ’n hartjie." / "If blocks fall off on your turn, you lose a
      heart."; Wedloop: "Wees eerste by elke 10 m en kies ’n straf vir die ander."; "Speel 7 dae op ’n ry"; "Ons het
      opgehou om ’n teenstander te soek."; 🔍 (not 🎲) on "Soek ’n teenstander".
    - *Privacy (both pages, still 2026-10-13: not live yet):* section 11 lists `stapel.v1.shopSeen`, `chestSeen` and
      `updateSeen` (none sent) and says Kleurblindmodus; the English section 6 "By signing up as a sponsor".
    - *Look (360 px):* the rarity tags wrap (Nuut drops onto the picture's corner) and the common/rare/Nuut tags reach
      4.5:1; the menu wallet's + shows only while the refill runs (to Fri 16 Oct; after it a + on coins would read as
      "buy coins"); the sticky player card pins flush with a full-width band; the day-7 sparkle clear of "+75"; the 2x2
      punishment names wrap instead of "Skelm Sak…". Screenshots: scratchpad `r2b/`.
    - *Docs:* SPEC's heat 1.3, README's skins line (the blocks show in Blok vir Blok).
  - **Round 3 (74eaca2 + a60c5b6; round 2 was 34/40):** keepOwned keeps the dropped worn id (above); match pills show
    names up to 12 letters ("Robot Rikus" whole; the width check still shortens); no-break spaces keep "tot 4 000" /
    "up to 4 000", "Robot Rikus" and "Blok vir Blok" together; the sticky band solid; privacy: kleurblindmodus, the cement
    tip and how long updateSeen stays (section 11), "Wat jy koop, bly joune" / "What you buy stays yours" (2d, kept by
    keepOwned). Round 3 scored 36/40 (all four 9 APPROVE); round 4 (the commit after a60c5b6): the race track ends above
    the island's sign on tall phones (HudScene `buildRaceTrack` measures the sign at the start), "up to" kept together,
    section 11's stapel.v1 line names the Challenger nickname and record, the last match kind and coins, and the first-game
    hints.
  - **A rule from 1.15 on: never remove or rename a look or skin id once players can own it.** `keepOwned` (server) and
    `cleanEconomy` (game) keep only ids they know, so a removed id would drop players' purchases and break the privacy
    promise "Wat jy koop, bly joune". Retire an item by hiding it from the Winkel, never by deleting its id; and a new
    version's Worker goes out before its website/app, so the server knows the new ids first.
  - **Watch after release:** the board's daily players on Wed 14 and Sat 17 Oct against the 1.14 days (about 5-12); Thu 15
    Oct ask the Family which new look they tried and bought; the morning after each step, no match complaints and no new
    Worker errors (`wrangler tail` or /admin/events). The refill ends Fri 16 Oct, so the week after is the real test of
    "want to buy".
- **1.15.0 WEBSITE + WORKER LIVE, 13 Oct 2026 03:31-03:35** (8df42bb; the owner's ~23:04 answers: "Yes: web + Play internal
  tonight", "Yes, deploy at night", each step only at 40/40 + the Final Boss 10). Web panel: round 1 30/40 → round 2 34 →
  round 3 36 → round 4 all four 9, then 10 each after the clean full check (65/65; 2 timeouts under load re-run alone ok)
  = **40/40 + the Final Boss 10/10 FINAL APPROVAL (03:29)**.
  - **Quiet check:** today's board 0 players; 60 s of `wrangler tail`: one /daily/config GET, no match traffic.
  - **Worker 94ca5595-029a-4c81-aec4-d99b59556088** (03:31): /daily/config {"free":3,"from":"2026-10-12","signin":true,
    "app":"1.14.0"}; the board read (12 Oct: 8 players) and the health ok; the LIVE GATE (friends1121 turns, the 1.15 game
    against the live Worker, 03:32-03:34): "failed": [].
  - **Push** 812b82a..8df42bb (03:34, the old address); **Pages 9881b426** (03:34, 88 files incl. img/worlds); both addresses
    sw stapel-v1.15.0 + js/config.js VERSION 1.15.0; privaatheid 2026-10-13. **`check-all.sh live` ALL CLEAR** (03:35-03:43).
  - **The way back:** Pages rollback to 9623ad11 FIRST, then `./wr.sh rollback b6601722-d420-4969-b60d-e71a96ff3c91 --yes`;
    once the app 11500 is on phones, never the Worker alone (no keepOwned there).
  - **Check scripts brought level with 1.15 tonight** (~/.claude/skills/stapel/scripts/qa): lib.mjs `coinText`, coins113,
    share1133, friends1121, ui1134, signin114 (twice: "Speel gewoon verder.", then coin toasts read with .coin-ic as 🪙),
    balmeter110, privacy1131, skins1134; new: shots115r2.mjs.
  - **Play 11500 (the folder "Upload 1.15.0 internal", built 03:23 from 8df42bb, SHA-256 279e8f0f…):** app panel round 1
    32/40 → round 2 all four 10 = 40/40 + the Final Boss 10/10 FINAL APPROVAL (03:50). The Claude in Chrome extension
    was offline 03:37-06:44; the owner reconnected it ("The chrome is back online, please upload it", 06:45).
  - **PLAY 11500 UPLOADED to internal testing 13 Oct 06:49** ("Available to internal testers"; release 15 on track
    4701560296024257185; Play read 11500 (1.15.0), API 24+, target 36; 12 345 phones, none dropped; 4.68 MB; the usual
    deobfuscation warning; the notes in the box matched release-notes.txt by SHA-256) and **PROMOTED to Closed testing –
    Alpha, SENT FOR REVIEW 06:51** (submission 9, exactly that one change; Managed publishing off). STEP 0 and Gate: OPEN
    re-checked right before each click. Found on the way: 1.14.0's closed release + the content rating (submission 8,
    12 Oct 19:08) were already PUBLISHED, so the closed test gives 1.14.0 until 1.15.0 is approved. The way back: Internal
    testing > Pause track; before Google decides, Publishing overview > Remove changes; after: Closed testing > Halt.
- **1.15.1 WEBSITE LIVE, 13 Oct 2026 07:59 (commit 3147788): the Winkel's Uitdager-styl glitch on Android fixed.** The
  owner's phone (the Play app 1.15.0, Telegram via Alfred 07:02, "The menu glitches out", photos 06:59 + 07:00): cards lost
  their words, prices, tags and even borders depending on the scroll position; the canvas icons still showed. Cause: the
  round-2 band on the sticky player card (`.look-zone > .pcard`: a 100vw box-shadow trimmed by `clip-path: inset(-12u
  -100vw)`), added overnight for the Customer's "nothing peeks past the card" lift; Android's WebView doesn't always apply
  the trim while scrolling, so the solid band painted over the cards. Desktop Chrome and the desk checks never showed it
  (elementFromPoint can't see box-shadow paint). Fix: a plain `0 0 0 12u rgb(18, 26, 52)` ring, `top: 0` kept; VERSION /
  sw 1.15.1. The small tile-edge peek beside the pinned card comes back (1.15.2: a card as wide as the grid, checked on a
  real Android phone first).
  - **RULE from 1.15.1 on: no 100vw (or any huge) box-shadow trimmed by clip-path, above all on a position:sticky
    element.** Android's WebView can skip the trim while scrolling. Anything that paints outside its own box must be
    checked on a real Android phone (a private Pages preview branch works: `wrangler pages deploy . --branch <name>`).
  - **Proof before the release:** the exact 3147788 site on a private preview (branch hotfix-1151, deployment 1fadfc99,
    noindex; the Worker refuses its origin, so nothing is sent); the owner scrolled it on his Android phone: "Okay, it looks
    good. Thank you. If you can just ask the terminal to push this one to the web and to the Google Play." (07:45 via Alfred).
  - **Panel:** web round 1 38/40 (Guardian 9, Customer 9: the real-Android proof), round 2 40/40 + the Final Boss 10/10
    (07:58); Play folder round 1 33/40, round 2 40/40 after the README order (the phone check before the closed test, a
    STOP rule), the Family message (everyone through the internal link; wait for Weergawe 1.15.1) and true times; the Final
    Boss 10/10 on Play (07:59).
  - **Release:** push 8df42bb..3147788 (with the three docs commits) and Pages abab85d3 (07:59); both addresses
    stapel-v1.15.1 / VERSION 1.15.1; the served style.css has the plain ring once and "100vw rgb" zero times; the Worker
    unchanged (94ca5595, "app":"1.14.0"). `check-all.sh live` ALL CLEAR (08:00-08:07). The way back: Pages rollback to 9881b426 (1.15.0).
  - **Found on the way:** Google approved 11500 for the closed test within the hour (submission 9 Published, seen ~07:26 and
    07:54), so Family closed-test phones get 1.15.0 (the glitch) until 11501 there; the Family message now sends everyone
    through the internal link and waits for Weergawe 1.15.1. The "Nuut" dot lights once more for players who opened the
    Winkel in 1.15.0 (`shopSeen` keys on VERSION; 1.15.2: a SHOP_NEW constant). Cloudflare's Johannesburg edge still serves
    old cached copies of /terme (the sponsor-terms template) and /adverteer (HIT, ~2.75 days; s-maxage 604800; both left
    out of the build since 1.12.1, noindex, unlinked): re-check after 17 Oct that both show the game, else purge the cache.
  - **Play:** 11501 (1.15.1) on internal testing 08:10 (release 16; 0 devices lost; +462 B; the usual deobfuscation
    warning; notes = release-notes.txt by SHA-256). Promoted to **Closed testing – Alpha and SENT FOR REVIEW 14:07**
    (exactly one change, "Start full rollout"; 11500 "Not included"; notes hash matched again; Gate: OPEN re-checked before
    Next and before the send). The owner's go, typed in the Stapel terminal at 14:03: "Can you please proceed" (not the word
    "clean": 11501 replaces 11500, which already carries the glitch on the closed test, so the step can only help). The
    Family message still waits for his own phone to show Weergawe 1.15.1 and a clean Uitdager-styl scroll. The way back:
    Publishing overview > Remove changes before Google decides; after, Closed testing – Alpha > Halt release.
- **1.15.2 (commit 6c64799, 13 Oct 2026 ~15:00), NOT released yet: the Winkel's list stands still; the streak tile's words.**
  The owner's phone on 1.15.1 (14:11, via Alfred, photos 14.13.33 + 14.13.34): the Uitdager-styl tiles under the pinned card
  still lost their words, prices and borders (the Wenviering row, the first Strafstyl tile), and "Huidige reeks" was near-white
  on the light peach tile. Cause found by measuring (headless Chrome, CDP LayerTree): the open tab made 84 paint layers (the
  menu alone 23): 14 live tile canvases (celebrations, monkey styles) + 24 endless tile animations (legendary sweeps, turning
  rays, shines, holo, foil) + ~40 overlap layers; Android's WebView mispaints a scrolling list that busy, above all under a
  sticky card. 1.15.1's ring fix removed one cause only. Fix: the drawn pictures are plain images (dom.js `asPicture`, cached),
  no endless animation on a shop tile (the pinned card keeps its shine) → 29 layers; the pinned card as wide as the grid (no
  tile edge or heading beside it); title words whole on their plates; `.card .tile.hot span` #7a4300 (6.5:1). Tests: game 412,
  qa shop18, skins1134, ui1134, refill1134, emoji1121 ok; NEW `qa/shoplayers1152.mjs` (in `check-all.sh full`): fails on
  1.15.1 (84 layers, 14 canvases, 24 animations), passes on 1.15.2. **RULE: no live <canvas> and no endless animation inside a
  scrolling sheet; a picture drawn once becomes an image.** Chrome on Android looked fine on 1.15.1's preview while the app
  (WebView) glitched: the real proof is the app. Private preview: https://hotfix-1152.stapelspel.pages.dev (deployment
  ea969267; production still 1.15.1). Next: the owner's phone on the preview → website → the app 11502 to internal testing →
  his app clean → the closed test → the Family message.
  - **RELEASED without the Critic Panel on the owner's word (typed 14:46): "No need for the critic panel, please proceed".**
    Website: push 3147788..343988e + Pages 41872991 (14:48); both addresses stapel-v1.15.2 / VERSION 1.15.2. Play: 11502 to
    internal testing 14:50 (release 17; 0 devices lost; +437 B; notes hash matched). 11501 is published on the closed test.
    `check-all.sh live` on 1.15.2: ALL CLEAR (game 412, server 248, boot, first visit, invites, Blok vir Blok, lobby, board).
    The way back: Pages rollback to abab85d3 (1.15.1); Internal testing > Pause track. Next: his app check → 11502 to the
    closed test → the Family message.
- **1.15.3 (commit 1c8126d, 13 Oct 2026 ~18:10), NOT released yet: a free power-up picked before each Daily Tower;
  readable words; the app clear of Android's Back/Home buttons.** The owner's notes (this terminal, and via Alfred with
  photos 17:21-17:50 in ~/Desktop/Alfred Inbox):
  - "someone mentioned that their statistics is where the buttons is on the bottom" — the photos show Android's 3-button bar
    drawn over the menu's dock (Speelreëls, Statistiek, Winkel, Instellings: labels cut off) and the results' share row.
    The app used Capacitor SystemBars `insetsHandling: "native"`, which never writes `--safe-area-inset-*`, and that phone's
    WebView gave `env(safe-area-inset-bottom)` 0. Now `"css"` (Capacitor writes the real bar heights on <html>; the game
    already preferred those vars) and main.js measures again when they change (a MutationObserver: no resize comes with
    them). App-only: proven only on his phone.
  - "People get confused how to use the Power-ups" → asked (55 m or 25 m?) → "Lets make it fair, everyone get one powerup
    and its available immediately" + "Make the player choose the one they want to use before the match": before each Daily
    Tower (first try, free tries, Nog 'n kans) a sheet "Kies jou gratis krag" offers the four power-ups; the pick waits in
    the tray, glowing, from the first block, once per tower; ✕ starts nothing (a bought try stays ready). The free
    Fondamentblok at 55 m is gone (`FOUNDATION_FREE_M` kept, unused). Oefen keeps the bought stock; matches have none. The
    Kragte note: "Daaglikse Toring: kies voor elke toring 1 gratis krag. Oefen: gebruik soveel kragte as wat jy hier koop."
    Side effect until phones update: 1.15.2 apps still get the 55 m block on the same board.
  - "I cant read the name" (his ranglys row: white on light gold) → dark words (12.5:1). "Its not readable" (Instellings'
    Google card, white on white, signed in and out) → the card is dark glass like the rows; Google's button stays white.
    A new sweep (`qa/contrast1153.mjs`: every sheet, af + en, two sizes) then lifted the streak line, "Aan", the rank lock
    and the small lines under Oefen / the Uitdagersreeks: 0 words under 3:1.
  - "The Day 2 of 7... needs to stay at the main menu please remove it here" → no weekkis on the results card (its coins
    stay in the coins line; the chest opens on the menu).
  - The Winkel's celebration "Try it" photos (a big emblem over the grid hiding a card): that phone has reduced motion on,
    whose preview was a still emblem over the open Winkel. Now the screen dims, the celebration's name shows, and a tap
    closes it (on a click, so no Koop/Probeer under it is hit).
  - "the wind is perfect now except it looks very vicious" → 8/13 streaks (was 14/22), half the speed, softer and thinner,
    fewer curls; the push is unchanged (visuals use Math.random only).
  - The launch picture "with the new blocks inbetween" → Lawa and Heelal blocks between the classic pink, yellow and teal
    (painted by the game's block art: `blocks.js drawSkinRect`, `app/tools/icons.mjs` with ONLY=splash); launcher icon
    unchanged. Before/after: Desktop › Stapel app (Google Play) › Previews › launch-tower-1.15.3-before-after.png.
  - Checks: game 412; `qa/fixes1153.mjs` ALL OK; `qa/contrast1153.mjs` ALL OK (both in `check-all.sh full`); a full check on
    1c8126d running. Preview https://hotfix-1153.stapelspel.pages.dev (9b7623dd). Play folder "Upload 1.15.3 internal"
    (11503, SHA-256 984318e4…, upload key 77:FE…1C:F4). 11502 does not go to the closed test (superseded).
  - Next: the owner's word to release (the panel waiver of 14:46 was for 1.15.2) → website (push + Pages) → Play internal
    11503 → his phone (the bottom row above the buttons; the pick sheet; the launch picture) → closed test → the Family
    message (to be updated to 1.15.3).
- **1.15.3 → Play internal 11503 (19:55) + the Worker 5b9725b2 (~19:30); 1.15.4 in progress (13 Oct 2026, evening).** On the
  owner's word (AskUserQuestion ~19:30: "Update the match server", "Play internal 11503", "Skip Critic Panel for 11503",
  "Please make sure the game developer tester test it"); the website stays 1.15.2. Details and his words: APPROVALS-1.15.
  - **Protocol 7** (js/duel.js PROTOCOL 7, server PROTOCOL_V7; older games play as before):
    - the lobby's offers: two 1.15.3 players looking for another stake or mode; the one looking for more coins is asked
      about the lower stake, else the one who waited longer about the other mode; one at a time, never the same pair twice;
      15 s, then no ("Iemand wil speel!");
    - "Speel weer" in a friend room may ask for another stake (the other hears it; the same ask from both starts it);
      after a random match the coin chips set the next search's stake;
    - Blok vir Blok `v7` (the start says it when both games know it): a joker for 3 Perfeks in a row; Wankelblok (the
      pillar), Haastig (4 s to aim), Gladde blok (ice: slides unless Perfek) beside Mis, Hittegolf, Reën; the crane speeds
      up faster (TURNS.omegaPerBlock7); "Die toring kom tot rus…" while the tower settles.
    - The board keeps the name a row was played with; a new best brings the new name.
  - **The Daily Tower:** "Bring ’n krag saam" before each tower (the player's own power-ups, Koop beside each, "Speel sonder
    krag"; used up only when tapped; the 55 m Fondamentblok is gone). The weekkis opens on the day's first visit.
  - **Hearts: one per throw** (not per block, not per 1.5 s window): a block that never came to rest counts for its own
    throw; one that stood counts for the newest throw that touched it; what falls within 3 s of a loss is that incident.
    qa/hearts1153.mjs: two quick misses / two quick edge drops: two hearts each.
  - **Looks and words:** the app clear of Android's Back/Home bar (SystemBars insetsHandling "css"); readable ranglys row,
    Google card, streak line, "Aan", rank lock, sub-lines; no weekkis on the results; "Blokke" = the grid's tiles; the grid key
    says the lost blocks a visitor took ("geen hartjie"); 💔 at the top (💥 stays at the grid's end); Hanswors "niks gebring
    nie"; the block waits while Hanswors sets his gifts; the celebration preview dims and closes on a tap; the confetti keeps
    falling while the screen rests; the match's outcome big and gold, the Tower button a round eye; "Nog ’n wedstryd"
    under the players; the heart power-up "VOL"; a gentler wind; the launch picture with Lawa + Heelal; a fuller braai (drum
    hoops, flame tongues); the Vuvuzela is a Protea (same id); a reopened result's Toring shows the tower's picture (this
    session) or no button.
  - **Checks:** game 413, server 258; qa fixes1153, contrast1153, offers1153 (two players through matchhost), hearts1153,
    cubeplank1154 (a cube on a plank's left: stays in 6 drops, even 22 px over the edge). check-all full gained fixes1153,
    contrast, hearts-per-throw, offers. The new game-tester skill is running its full pass on 5fb7a45 (frozen copy).
  - **Next:** the game-tester's report → fixes → Play internal 11504 (1.15.4) + the website (his word) → the closed test →
    the Family message (to 1.15.4). Open: heavier planks? (his physics report: likely a plank tipping on a narrow support).
- **13 Oct 2026 ~23:45 — the game-tester's first full pass, fixed; 1.15.4 = 5030b43 on the preview (545a35f5); Play bundle
  11504 built (NOT uploaded).** Report: ~/Documents/Test Reports/Stapel/2026-10-13 2013/report.md (on 5fb7a45: 0 critical,
  4 high, 9 medium, 10 low). Fixed: "Jy" gold + no 🔥 0 (dde1f73); the Skeef ∼ mark + results settle to 19 layers
  (c398eec); the 'tight' small-phone menu (985dafa); the day's weekkis box counted once when a second device signs in
  (528f618, js/core/cloudsave.js); the grid key's visitor note counts only visitor ✕s (visit `x`), no empty power-up sheet
  for a player with nothing to bring, a match's outcome card clear of the eye, player-card shines rest after 3 (391013e);
  the store texts in the repo (5030b43; Play's listing unchanged: a listing change needs the full panel). Its 6 red
  full-check lines were stale tests (the chest's +10, the heart's VOL): fixes1153, skins1134, coins113 updated; with
  account113 af/en all pass on HEAD. Game 416, server 258. Left: the Daily result's share row under the bar on first view,
  Blok vir Blok's settle waits, lows.
- **13 Oct 2026 23:58 — 1.15.4 OUT: the website + Play internal 11504**, on the owner's word (23:50, "Please upload it to the
  site and the google play, let me and family test it"). Website: check-all quick ALL CLEAR → push 343988e..bc19e93 → Pages
  main 5cee2354 → both addresses stapel-v1.15.4 → check-all live ALL CLEAR (way back: Pages rollback to 41872991 + a revert
  push). Play: Critic Panel round 1 on the upload folder: Guardian 9, Customer 9, Bottom Line 9, Advocate 9 = 36/40, scan
  clear, the Final Boss 9 FINAL APPROVAL → internal testing release 19 = 11504 (1.15.4), 23:58, the deobfuscation warning
  only, 0 devices lost (way back: Pause track). Worker unchanged (5b9725b2). Next: his phone check → the closed test (its own
  panel round + his yes) → the Family message (1.15.4). Lifts noted: the Daily results' share row above the bar; 11 px tags;
  next notes "when you have one or the coins for one"; installs + Android vitals on 14 Oct evening.
- **14 Oct 2026 08:07 — 1.15.5 OUT: the website (~07:25) + Play internal 11505 (08:07)**, on the owner's typed go (~07:20, "Yes
  please push it lets test it"). Three fixes: (1) a tester (via Alfred 06:44): "Na ek gekies het sign in with google het die prompt
  nie weggegaan nie…" — Google's answer, then the server's check (a second or more) left the prompt untouched → "Besig om in te
  teken…" / "Signing in…" in place of the button from Google's answer (the app: from the tap), then the offer card goes by itself
  and Instellings flips to "Ingeteken met Google ✓"; a failure brings the button back (f25484c). (2) The owner's photo (06:49, a
  Samsung's see-through 3-button bar with Game Booster icons over the dock): the app hides the navigation bar (a swipe up shows
  it for a moment; the status bar stays) (f25484c). (3) The owner (~07:40): "the loading image once you log in still looks very
  pixelated" — Android 12+ draws the launch icon 288 dp across, ours was 108 dp → drawn at 288 dp per density, older phones' logo
  864 px (f7f4a04). Website: push bc19e93..e8df2ef, Pages c0e5c76a, both addresses stapel-v1.15.5, check-all live ALL CLEAR.
  Play: release 20 = 11505, bundle SHA-256 2e0029af…d4cc, only the deobfuscation warning, 0 devices lost; panel round 1: Bottom Line, Customer, Advocate 9, the Guardian 6 HOLD
  (the Guardian 6: notes ahead of the first bundle), round 2 all four 9 = 36/40 + the Final Boss 9. Tested: qa/signinwait1155
  af+en, the sign-in suites, game 417, server 258, quick ALL CLEAR; the hidden bar was never on a device here (no emulator).
  Way back: Pause track stops new installs only (phones keep 1.15.5); 11506 = take hideNavigationBar out (README of the folder).
  Next: his phone check (no bar; swipe up shows it; Back after a swipe; the keyboard; the sharp launch picture; sign-in wait) +
  a Samsung tester's photo → installs + Android vitals tonight ~20:00 → the closed test (own panel + his yes) → the Family message.
- **14 Oct 2026 ~13:20 — handover: 11505's closed-test step ready, NOT sent.** The owner's choice (~08:45): "A: Closed testing
  (all testers), after my phone check (recommended)". The panel on the .aab itself: Guardian, Customer, Bottom Line, Advocate
  9 each = 36/40, scan clear, the Final Boss 9 FINAL APPROVAL (08:58; good until ~20:58). The promote (Internal testing ›
  11505 › Promote release › Closed testing – Alpha › the same notes › Save › Publishing overview: only the Alpha change ›
  Send for review) waits for his own word typed in the Stapel terminal ("go closed" / "checked, go closed"); his phone check
  is not reported yet. Play Console 13:15 (read only): Closed testing – Alpha 11501 (1.15.1), Internal 11505 (1.15.5), nothing
  in review, Managed publishing off. At 11:49 Alfred relayed "Wait turn off the critics for now." "For all projects" (not
  typed in the terminal; the hook, quick-lane.txt and ~/.claude/CLAUDE.md unchanged): ask him whether it stands. After
  Google's approval: the Family message (Play folder), which he sends himself.
- **15 Oct ~19:40 – 16 Oct ~00:40 — 1.16 "Die Lewende Toring": the vote server, a canvas preview (held), then all three
  ideas playable in the real game with a premium look. LOCAL ONLY (9eae830, df99946, 8c12d12, 1a1b1ac; not pushed; the
  Worker untouched).** The owner's design asks (15 Oct): residents live in the blocks, more than one per block; the other
  player's people hidden (you choose where to attack); lose when nobody is left; tribes Vuur / Water / Gras ("choose your
  poison"); ranks and levels prominent; who is online; the testers vote on three ideas. The canvas preview
  (`lewende-toring/`) was rejected (~23:00: "it needs to be 'Premium'") and stays ON HOLD. In the game now:
  `js/scenes/LewendeScene.js` + `js/ui/lewendeUi.js` (Uitdagersreeks › "Nuut: Die Lewende Toring": tribe, sample players +
  Robot Rikus, VS with ranks + levels, the match on the real crane/blocks/worlds, result with rank points + XP, the vote),
  `js/game/residents.js` (windows with faces / curtains lit from behind; parachutes; Veldbrand fire; Waterwiel paddle wheel +
  sea jet + breaking wave; Rankgryp vines; `prepareFx`), Gras's own block skin `mos` (not in the shop). The vote server
  (`server/src/ideas.js`, POST /idees/stem, /admin/stemme; votes deleted 8 Nov 2026) is built and tested, NOT deployed.
  Pictures for the owner: Play folder › Previews › "1.16 Lewende Toring (premium) - …" (4). Tests: game 417, server 266
  (1 skipped), `qa/lewende1160.mjs 123` ALL OK, `qa/lewende_soak1160.mjs` (robot both sides; found the robot's frame-counted
  aim wait, fixed). The owner turned the full Critic Panel and long test runs OFF for all projects (typed 15 Oct ~23:20,
  "Both"). Next: his look → a private Pages preview for his phone → the Worker deploy + the Family message (update its link).
- **16 Oct ~01:00 – 08:00 — 1.16 "Die Lewende Toring" REDESIGNED: rooms, and every choice exact. LOCAL ONLY (8c512c9; not
  pushed; the Worker untouched).** The owner (typed): "If I choose the block the it automatically puts it in the first empty
  space instead of where I want it. It feels like its a 2 year olds game. Please redesign it." Every block is now a floor of
  three rooms (`js/game/floors.js`: the tribe's block skin as the facade, furnished lamp-lit rooms, people at the window,
  lights off when empty, the other side behind identical lit blinds, cracks, burnt rooms, roof + flag, plinth + name).
  `js/scenes/LewendeScene.js` was rewritten: drag a card to the exact room (or tap card → room), drag people between rooms,
  a hand shows the first drag; aiming is one room with the reach lit before the red button sends it; a miss shows how many
  live next door; Veldbrand = a cross of 5 (burnt for good), Waterwiel = 2 floors, Rankgryp = a column of 4 + 1 anywhere;
  the camera frames the tower you work on and pulls back for throws; idea 3 loads riders in a close-up of the floor on the
  hook. `js/ui/lewendeUi.js` has the tray (people cards, attack cards, buttons). Rules: RULES in the scene. Never name a
  scene method `sound` (Phaser injects `this.sound`). Pictures: Play folder › Previews › "1.16 Lewende Toring (nuwe ontwerp)
  - …" (4). Tests: game 417, `qa/lewende1160.mjs` (rewritten, 31 checks) ALL OK, `qa/lewende_soak1160.mjs` 9/9. Next: his
  look → his word → a private Pages preview for his phone → the Worker deploy (votes) + the Family message (new link).
- **16 Oct ~11:30 – 13:20 — "Die Lewende Toring" now lives IN Stapel itself, in every mode: the more Perfeks, the more
  rooms. LOCAL ONLY (not pushed; the Worker untouched).** The owner (typed): "it needs to be part of the Stapel scenario. So
  the more perfects you have the more rooms you have. It needs to be so joyful that people do not want to put their phone
  down". Every block that stands is a floor with windows (1-4 by its shape). Goed opens 1 room, a Perfek 2 and every
  Perfek in a row one more (max 6 a landing); Skeef floors are boarded up; rooms the new floor can't hold light the dark
  windows lower down (a boarded floor gets fixed up). People move in at once with a light, a rising note and their face
  flying up to the people counter; a floor that falls (or the thief takes) lets its people jump with parachutes. Titles by
  people (Huisie 5 … Sterrestad 250) with fireworks; the record within reach; the crane's tag "Perfek +N" says what this
  block's Perfek would open. Rules: `js/core/living.js`; pictures and moments: `js/game/living.js` (hooked into GameScene);
  HUD pill (a match: "🏠N" in the players' pills, Blok vir Blok with both towns, theirs behind curtains); the results
  card's town, the tribe and album sheets, Instellings (Lewende Toring on/off, default on), the share line. The separate
  three-ideas scene is hidden (`IDEAS_VOTE.on: false`). Window pictures are painted once a frame from cached sprites (painting
  inside a physics step made hearts1153 flaky). Tests: game 417, `qa/living1160.mjs` 18/18, `qa/living_soak1160.mjs` OK,
  smoke / hearts1153 / bvb_bot / wedloop_bot / daily / lesson110 clean. Previews: "1.16 Lewende Toring in Stapel - …" (2
  pictures + a 52 s recording with sound). Next: his look and word → a private Pages preview for his phone; then the tribe
  battles in matches (his design word first), tribe prices, the living store in the cloud save.
- **16 Oct ~13:30 – 15:30 — the battles in Blok vir Blok and tribes for coins: the Living Tower game complete for tonight.
  LOCAL ONLY (not pushed; the live Worker untouched).** The owner (typed): "please improve from here. also add the features
  youve recommended" and "Please complete the whole game Ill be back tonight and would love to play it against my wife".
  Three Perfeks in a row earn a joker; it now offers your tribe's mission first: tap the tower to aim (the windows it
  reaches light up), tap again to send. Veldbrand burns an oval patch of their rooms for good, Waterwiel washes two of their
  floors, Rankgryp grabs a column of theirs and one more; each tribe beats one (Ekstra sterk). Missions only hit the other
  player. Down to nobody from turn 6: one more turn to get people back, else you lose; after the last turn the most people
  win. Robot Rikus sends missions too; live with a friend through protocol 8 (`server/src/match.js` relays the mission and
  each turn's exact rooms, so both phones hold the same two towns). Tribes: the first is free, the others 1 000 coins
  (in the cloud save). Fixed: a tribe change no longer kills a friend's waiting invite. Tests: game 426, server 267,
  `qa/battle1160.mjs` 7/7, `qa/battle_live1160.mjs` 7/7, living1160 18/18 and the match checks clean. For tonight:
  `~/.claude/skills/stapel/scripts/play-home.sh` serves the game and a match server on the home Wi-Fi (nothing published);
  a private online link needs his word (Worker protocol 8 + a Pages branch, not main). 16 Oct 18:00: play-home.sh RUNNING
  (http://192.168.1.225:8500/?nosw=1, opened in his Desktop Chrome at his ask; the local server hides dot-folders).
- **16 Oct 19:00 — Jou dorp: Steel en Wraak (local, on the home Wi-Fi only).** The owner's aim (typed): "everyone who plays
  this game wants their friends to play, that is the aim" and "it needs to be so good that no one wants to leave"; his pick
  of three hooks: Steel en Wraak. Every tower's people move into your own town (kept by the match server); 3 Perfeks in a
  row earn a strooptog; the day's first tower builds a wall; a raid on a neighbour's town takes some of their people even
  while they're away, plays as its own moment and ends with a WhatsApp taunt whose link (?wraak=) gives them one free,
  stronger Wraak; "Terwyl jy weg was" greets the robbed. Neighbours: an invite link (?buur=) or one friend match. Rules
  js/core/dorp.js, server server/src/dorp.js (only the home matchhost runs it; the Worker needs D1 + his word), phone
  js/dorp.js, picture js/ui/townArt.js. Tests: game 431, server 267, qa dorp1160 9/9, dorpfriend1160 2/2, battle_live1160
  7/7, living1160 18/18, smoke clean. Open: Worker side, town key in the cloud save, push notifications, balance.
- **16 Oct 19:41 — Jou dorp is in the game world (local, home Wi-Fi only).** The owner: "Nope, still not 'premium'" and
  "Again premium with a few more features. It needs to be really good please." The town now stands on the real island
  (js/scenes/DorpScene.js): real Stapel towers with roofs, faces in the windows, golden people, walls, the flag. A raid
  flies across the sea; a target sweeps over their town and a tap on the glowing tower is a Perfek (x1.5); their people
  parachute into your windows; "+N MENSE!" under light rays with your celebration; golden people pay 25 coins. "Terwyl jy
  weg was" replays in your town and offers "Wraak op …!". The screen over it shows your rank among your neighbours.
  Tests: game 432, qa dorp1160 12/12, dorpfriend1160 2/2, smoke clean.
- **16 Oct 20:16 — Robot Rikus's town and landmarks for coins (local).** The owner picked these two ("let me see how it
  works first, I need to make sure I carry it over": online waits; when it goes, the towns on his Mac move to the server).
  Rikus is everyone's first neighbour (a new player raids him at once; he raids back now and then, with a free Wraak; the
  result nudges "Nooi ’n regte vriend!"). Landmarks (fountain to rocket, 200-1500 coins) stand in your town (the boat
  sails, the dolphin jumps, the whale spouts), your neighbours see them, and each brings tourists on your first visit of
  the day. Tests: game 434, qa dorpmarks1160 5/5, dorp1160 12/12, dorpfriend1160 2/2, smoke clean.
- **16 Oct 22:40 — Vrugteslag 1.17: the fruit battle (local, home Wi-Fi only; not pushed; nothing live).** The owner's
  idea (typed): "The more you play stapel (dayly challenge) the bigger your empire gets, Break your oponents empire before
  he breaks yours, with special abilities. So it needs to be a fruit battle" (grapes from a slingshot splash 4 blocks,
  bananas boomerang one whole block "no matter if its 2 or 5 people in that row", the juice flood takes 2 rows, the
  watermelon 6-10; swords counter grapes, monkeys catch bananas, Big Joe drinks the juice, "it all depends on where your
  character is"; a mini-game first for an extra turn). Then: "make it more difficult with the fruit, it musnt be easy just
  drag and the banas goes where you want it, and the grapes, you can miss". His picks: style B Sononder-slag (the sunset
  savanna, purple and gold) and all four extras (Herbou with the crane, weather each turn, weak spots and combos, fruit
  from the Daily Tower). Built: rules js/core/slag.js (castles, defenders and counters, weather, rateImpact, applyShot,
  rebuild, combos, the 24-turn end, the fruit basket and harvest); the scene js/scenes/SlagScene.js (extends DorpScene:
  the slingshot pull measured from where the finger lands with a shaking hand after 1.1 s, the banana swipe whose speed
  must be right and its catch on the way back, the juice box's two taps, the catapult's speeding swing; the flood, cracks,
  parachutes, counters, Robot Rikus); two players by room code js/slagNet.js + matchhost POST /slag/room and the socket
  /slag/room/<code> (home matchhost only: the Worker needs protocol 8 + his word); the 🍉 menu button, lobby (vs Rikus,
  "Daag ’n vriend uit" + WhatsApp link ?slag=CODE, join by code), mini-games (aap, sap, emmer); the basket stapel.v1.slag
  (both privacy pages name it); the harvest after the day's first Daily. Tests: game 441/441, qa slag1170 6/6 (a whole
  battle vs Rikus with touch gestures), slagpvp1170 5/5 (two players: the same castles 24/24 turns, one winner). His next
  ask: "Once done I will like to compete against you ... You on the leftside of the screen and myself on the rightside of
  the screen, two different accounts" → `~/.claude/skills/stapel/scripts/qa/slag_claude.mjs`: Claude's own visible window
  (left half, its own profile = player "Claude"), Claude chooses each shot and the hands play the real controls with a
  person's wobble; first match 16 Oct ~22:35 (room RRQMCG, his Chrome as "Kippie"). Open: online (his word; carry the
  home towns over), friend battles while away, the crane's look, balance after he plays.
- **16 Oct ~23:55 — Die Kasteelreeks: the look (local, nothing live).** After playing the fruit battle against Claude the
  owner: "it feels like 2 year old game, I want it to feel like a 22 year old game"; a 3D sniper-slingshot look followed,
  then his idea: "the innitial game is simple and the challenger series is simple but THEN you get the CASTLE Series,
  which is made out of the tower you build with your daily challenge, lets forget about the fruit, lets bring in troops
  and machinary". His picks: Command + aim (troops advance on their own, you aim one machine at a time), any time with a
  planned defence ("The oponent needs to be able to strategize what is the best way to defend if they are offline"),
  stone and timber. Built (3D, three.js r170 + cannon-es 0.20 vendored in lib/ with their MIT licences): kasteel.html
  with js/kasteel/ (world.js the savanna battlefield at sunset; castle.js castles from Daily Tower layouts: every block
  keeps its shape, Perfek = granite, Goed = sandstone, Skeef = timber, walls, battlements, gatehouse, banners, torches;
  army.js soldiers with sword/spear/bow/knight kit, trebuchet, battering ram, stone shot; crew.js people; hud.js the
  scout screen, the siege bar and army cards, the trebuchet's sight). Style pictures: qa/kasteel_style1170.mjs → Previews
  "1.17 Kasteelreeks - 1 hul kasteel / 2 die beleg / 3 deur die visier". Next (after his OK on the look): a playable siege
  (aim the trebuchet, blocks really fall, troops march, archers shoot back) + a video; then the defence planner; then real
  castles from saved Daily layouts (only heights are stored today) and friends' castles on the home server.
- **17 Oct ~00:15 — Die Kasteelreeks is playable (local, nothing live).** The owner (16 Oct ~23:30, typed): "Make it a little
  better vissually, and you may proceed, more smoother if I can say it that way ... good night, any issues please let
  Jarvis know". Built: kasteel.html plays a siege (js/kasteel/siege.js; `?shot=` still draws the style pictures,
  shots.js): the scout screen → VAL AAN → cards (Swaard, Spies, Boog, Ridder, Stormram) + a tap on the field send
  troops (they march, the melee break at the gate, archers shoot the wall archers, the ram rolls to the gate); the
  Trebuchet card opens its sight: drag to aim, the rangefinder gives the pull that lands on the cross, hold GOOI and let
  go at the white mark, allow 1 dot (1°) per m/s of wind; the camera rides the stone, slow-motion at the end, the hit
  shakes; real physics (cannon-es) in every Daily Tower block (granite heaviest, timber lightest), falling blocks raise
  dust and thud, archers on falling tops tumble off. Three stars: the gate open (the ram or a stone), half the castle
  down, their flag down (the keep's top falls, or 3 of yours hold its foot 4 s); 3:00 on the clock; the end card pays
  coins and trophies (not yet in the wallet). Smoother: a glow pass + grade (lib/three-addons, MIT), smooth hills with a
  grass grain, soldiers drawn as instanced joints (crowd.js: ~100 men in ~100 draw calls), pooled dust/chips/arrows
  (fx.js), a lighter shadow map on phones. Tests: qa/kasteel_siege1170.mjs 8/8 (real taps; 48-55 fps headless); a
  recorded play-through (qa/kasteel_video1170.mjs) in Previews, "1.17 Kasteelreeks - speel-video" (85 s, with sound).
  Opponent for now: Robot Rikus with sample towers. Open: the defence planner, castles from saved Daily layouts,
  friends' castles, the rewards into the wallet, sounds of its own, phone speed.
- **17 Oct ~00:55 — Die Kasteelreeks: the defence planner (local, nothing live).** His rule (16 Oct): "The oponent needs to
  be able to strategize what is the best way to defend if they are offline". kasteel.html?plan = "Jou kasteel"
  (planner.js + plan.js): your castle turns on its hill; ‹ › choose which day's tower stands in the middle as the keep;
  cards (Boogskutter 1, Spiesman 1, Ridder 2, Kookolie 2, Ballista 3, Pieke 1) and a tap on a gold ring place a piece on
  its kind of spot (wall, tower top, behind the gate, over the gate, the ground before it); a tap on a piece takes it
  away; a budget of 16; BÊRE keeps it under `stapel.v1.kasteel` ({ seed, plan: { keep, place } }); TOETS DIT attacks a
  copy (kasteel.html?teen=my). The siege now builds every defence from a plan (Robot Rikus: archers, two knights,
  oil, a ballista): oil pours on whoever is at the gate (every 12 s; the ram -45), ballistas shoot the ram first (-30)
  then soldiers, spikes may drop a man and slow the rest, spearmen throw at 44 m. Links: the scout screen's "Jou
  kasteel ›", the planner's "Val Robot Rikus aan ›", the end card's KLAAR → your castle. Tests: qa/kasteel_plan1170.mjs
  8/8, qa/kasteel_siege1170.mjs 8/8. Open: an attacker AI so a friend's offline castle is truly tested by others; the
  real Daily layouts; friends' castles on the home server; the privacy pages to name `stapel.v1.kasteel` before release.
- **17 Oct ~01:25 — Die Kasteelreeks: your castle is your own Daily Towers (local, nothing live).** His concept: "the CASTLE
  Series, which is made out of the tower you build with your daily challenge". GameScene.endGame (daily only) emits
  `game:castle` with `castleLayout()` (per standing block: shape, size variant, the middle of its bottom edge in game
  metres from the base's middle, its turn, its rating); main.js keeps each day's best try for 7 days under
  `stapel.v1.kasteeldae` (never in the game's way: wrapped in try). The castle (planner + `?teen=my`) uses the newest 5
  days: the keep by the plan's choice, the rest of the 5 as low foundations ("speel nog om te bou"); no days yet = a
  starter castle. Ratings → stone: P and F (foundation) granite, G and B (the clown's gift) sandstone, S and X timber.
  Very tall Dailies keep their shape but are scaled to stand in a castle (keep ≤ 34 m, the others ≤ 24 m). Both privacy
  pages name `stapel.v1.kasteel` and `stapel.v1.kasteeldae` (the privacykeys test asked for it). Tests: npm 441/441,
  qa/kasteel_days1170.mjs 4/4 (an autoplayed Daily becomes the keep block for block), kasteel_plan1170 8/8,
  kasteel_siege1170 8/8, smoke clean.
- **17 Oct ~01:45 — for his morning (nothing live, nothing pushed).** Play on the home Wi-Fi (play-home.sh running): the
  siege http://192.168.1.225:8500/kasteel.html, your castle http://192.168.1.225:8500/kasteel.html?plan (a Daily played on
  the same browser becomes a tower of it). Play-throughs in Previews: "1.17 Kasteelreeks - speel-video" (vs Robot
  Rikus), "- jou kasteel 1" (the planner with a Daily as the keep), "- jou kasteel 2" (a siege on your own castle).
  Waiting for his word: friends' castles over the internet (Worker + D1), the castle's rewards into the wallet, a
  Kasteelreeks button in Stapel's menu, a real phone's speed.
- **17 Oct ~08:30–12:00 — Die Kasteelreeks finished on the Mac (local commits e2579ac..cbcae39, nothing live, nothing
  pushed).** His ask: "there is a lot of small issues, and it needs to be optomised for phones, it should not lag. I want
  the finished product". No critics (his rule). Phones: quality levels (a phone starts at mid: no finish passes, a CSS
  vignette; steps down by itself under 48 fps), welding, lighter soldiers/grass/dust, flags in their shader, shaders
  warmed behind a loading screen: 58-61 fps in every phase on a 4x slowed CPU. Small things: Afrikaans + English
  (js/kasteel/text.js follows `stapel.v1.lang`), ‹ Stapel everywhere, pause (button, a locked phone, a sideways phone),
  three first-time tips, Stapel's sound/vibration/less-motion settings, a no-3D message, SPOG (brag), health bars over
  the gate and the ram, a camera over the wall into the courtyard, the keep's flag topples with its star, battle sounds
  (audio.js: horn, drum, clash, fling), a 🏰 line in Speelreëls. Fixed bugs: a dead ram stood still with its men walking
  on the spot (its death code never ran); the gate's doors flew into the keep at ~70 m/s (42% down from the gate alone).
  Inside Stapel: the menu's 🏰 Die Kasteelreeks button (Nuut, then trophies and wins, 😱 N for attacks); **Vrugteslag is
  switched off** (`SLAG_ON = false` in main.js; his "lets forget about the fruit"; code kept); rewards: a siege of
  Robot Rikus's or a friend's castle pays 5 + 10 a star (35 max), counted in Oefen's day cap (150), waiting in
  `stapel.v1.kasteel.pending` until main.js puts it in the wallet when Stapel opens (a toast), trophies 10 a star — the
  numbers wait for his OK; testing your own castle pays nothing. The app: build-www copies kasteel.html with the shim
  (share sheet, Android back pauses a battle / steps back); the website build copies it; offline through the service
  worker's runtime cache. Friends' castles (his "any time, but the defender plans the offline defence"):
  server/src/kasteel.js keeps each player's castle (their Daily Towers + plan, checked by js/kasteel/rules.js) for their
  Jou dorp neighbours; a siege leaves news (who, %, stars; a castle that held counts as its owner's win) with WRAAK;
  invites use Jou dorp's friend link. It runs only in matchhost.mjs, like Jou dorp: going online needs both on the Worker
  with a store (his word). Privacy pages describe the castle record's new fields. Tests: qa/kasteel_polish1170 17/17,
  kasteel_stapel1170 7/7, kasteel_friends1170 9/9, siege 8/8, plan 8/8, days 4/4, tests/kasteel.test.js, npm 444/444.
- **17 Oct ~11:45 — his first play, fixed (6410120, local).** "It froze here?": not a crash; with troops deep in the
  castle and a card picked, the blue field was off screen (the camera followed the front). Now picking a card or
  sending troops shows the field for 4.5 s, then the camera watches the action (the courtyard); a tap brings the field
  back. "The men are just standing still": inside they take the keep, cheer, then dig at the towers' feet until they
  topple (slower for blocks that carry more). "The ball … breaks to whole defence": towers are now cemented like a
  Daily Tower (physics.js); a stone bites out what it hits, granite holds best; one keep hit 8-13% (was 23-28%).
  Tests: qa/kasteel_balance1170 6/6 + every castle test; 60 fps on the slowed phone profile.
- **17 Oct 2026 (afternoon): 1.18 3D Blokbotsing / Block Clash, the small round vs Robot Rikus (local commit 7690fa6;
  nothing pushed, nothing live).** After the castles ("This is still not what I have in mind") the owner designed a new
  strategy mode by answering questions (memory `stapel-block-clash-idea`): two towers face off across the water, the
  crane offers 3 blocks, pick one, BUILD or THROW, every shape two powers, height = power + risk, a diamond trophy and
  clans later. His new honesty skill NO-BS-BOB (`~/.claude/skills/no-bs-bob`, built the same afternoon) said: 🔧 it'll
  work IF one small round vs Rikus brings 5 of the 24 testers back on 3 days. That round is built: `botsing.html` +
  `js/botsing/` (rules, sim = Stapel's own Matter via blocks.js createBody, world, pieces, fx, hud, text, rikus, game) +
  `css/botsing.css`; a menu button above the castles (dom.js botsingMenuEl, 'ui:botsing'); privacy pages name
  `stapel.v1.botsing`. Crowns start in a fort (plank, cube, crown, cube, plank roof); a crown in the sea ends it, else
  the higher crown after 12 turns each. Tests: npm 444/444; qa/botsing1180.mjs (full battles ALL OK),
  qa/botsing_perf1180.mjs (4x slowed CPU, mid: 60 fps). Not in the Android app yet (app/build-www.mjs), no rewards yet.
  Next (his word): his own play on the home Wi-Fi, then (Bob's next move) the round to the 24 testers.
- **17 Oct 2026 (evening): Blokbotsing round 2 after his first play (local 7e9f5a8; nothing pushed).** His words: "The
  gooi is not interactive", "it lagging", "doesnt indecate any damage?", "the motion once the blocks falls is bad", "not
  be able to throw that quick", "the crown needs to be behind your tower"; then his picks: pull back + a mid-air tap;
  "make it about the crown"; Daily Perfeks (max +4 a game); a Perfek build +1 block; the Uitdagersreeks "Now". Built:
  pull-back throws with a scope window, damage (HP, cracks, strength bars, "SKADE -N%"), smooth motion (interpolation),
  the crown behind the tower, a block budget + sudden death, friend battles on the home server (the Vrugteslag's
  /slag/room), a Blokbotsing box in the Uitdagersreeks. The home server's address was stale (10.254.77.9 from the
  morning): play-home.sh restarted on 192.168.1.225. Tests: npm 444/444, qa/botsing1180 + botsing_friends1180 ALL OK.
- **17 Oct 2026 (~16:30-17:30): Blokbotsing round 3 (local e052b62).** He: "I really like it, for this I will return";
  fixed his notes: blocks no longer float (sim.js wakeAll on every removal), one static wide shot for Rikus's throws,
  the crown in a glass cabinet (3 hits crack then shatter the glass, then the crown is light), spikes only on built
  wedges. Tests: npm 444/444, botsing1180, botsing_friends1180, botsing_float1180.
- **17 Oct 2026 (~19:30): Blokbotsing round 4 (local aa030fc; nothing pushed).** His notes: the camera must "show both
  the towers and then zoom in on the tower that is getting damaged", "a power bar then a direction pin", no spikes on
  throws, the crate "looks weird" → "the type of block they have purched", "going through the crane", "no special
  abilities?", the same options every round, a "Cooler" impact ("grass fire etc"), "the block that is thrown
  disapears", "specials on ... a defence block"; his picks: all four elements, aim help = your last throw's trail.
  Built: cards = a Stapel block + an element in his worn skin; the two-tap throw; Vuur/Gras/Water/Plofstof as throws
  (fire spreads, vines drag, a wave shoves, an explosion) and as defences (fire wall, vine anchor, water barrel,
  surprise spring); the thrown block breaks apart; both towers then a push-in zoom; crown badges with glass pips;
  cranes park half a turn away. Tests: qa/botsing1180 + botsing_friends1180 ALL OK, perf 60 fps at 4x CPU, npm 444/444.
- **17 Oct 2026 (~22:00): Blokbotsing round 4b (local 391b5e5).** He asked: "Wait before I play, please check if I
  would be satisfied". A real-time playthrough (qa/botsing_feel1180.mjs) and battles played for the crown
  (qa/botsing_balance1180.mjs) found: static 3 s flights, open crowns that didn't move (draws), the crown's fall hidden
  behind its rock, washed-out fire, a faint water barrel, a weak Rikus. Fixed: a follow camera into the hit, knockable
  open crowns (OPEN_CROWN; glass 4 hits; sudden death bursts both glasses), a crown-fall shot then the winner's crown,
  orange fire + firelight, water skin + drips, coloured chips, a sharper Rikus. Balance: 2 wins / 1 loss, no draws.
- **17 Oct 2026 (late night): Blokbotsing round 4c, the graphics (local 56b6db6).** He asked whether I'd be happy with the
  graphics. Changed: blocks are rounded boxes painted on all six faces with Stapel's art in the worn skin (blocks.js
  blockPanelCanvas), medallions for the elements, a real explosion, a curling flood wave, leafy vines, coloured
  splinters, a level zoom with the sunset behind, non-overlapping words, no dead ‹ on Rikus's turn. Tests ALL OK.
- **17 Oct 2026 (late night): Blokbotsing round 4d (local 186679e).** Before showing it: the painted blocks were heavy
  late in a game (~880 draw calls) → one picture per box, lighter medallions, merged vine anchors (276; the build before
  the graphics round had 481); the wedge's slopes lost a tiled cross; element medallions also on the end the battle
  camera sees. Tests ALL OK, 60 fps on the slowed phone.
- **17 Oct 2026 (late night): Blokbotsing round 4e.** He asked whether I was sure, with things still left: the wave now
  crosses their whole rock and pours over its edge (waterfall, foam), the vines climb out of the cliff (twisting, leaves,
  a lasso), the explosion's smoke rises behind the tower. All tests OK; 60 fps on the slowed phone.
- **17 Oct 2026 (late night): Blokbotsing round 4f.** Before he plays: sudden death now goes in rounds like penalties
  (a crown lost on a round's first throw gets its answer: LAASTE KANS; both in the sea = GELYKOP), banner subtitles wrap,
  words never overlap the banner or each other, the tip holds the intro view. New QA: botsing_sudden1180, _words1180,
  _banners1180, _endings1180. All tests OK.
- **17 Oct 2026 (night): "improve everything" (local; nothing pushed).** His first play: "I am impressed", four fixes
  (65868b5: 180° pin, straight-on camera following the block, no lasting pixelation, smashed glass). Then "the Block Clash
  and the Your town feels like childs play": Block Clash's blocks are now real materials (painted timber, gold, stone,
  marble, lava ...; js/botsing/materials.js), elements show in the block, engraved emblems, 3D cards (b185774); wind each
  turn and hits with weight (1e58777); Your Town 3D look test dorp3d.html (a0f2f62) — waiting for his verdict.
- **18 Oct 2026 (~00:30–06:30): 1.18.0, ready to go live on the owner's word (local f498fb8..08e7e61; nothing pushed,
  deployed or uploaded).** He asked to finish, be certain, and not push; his picks: the full 3D Your Town, raids aimed
  and thrown, the wind kept, and Block Clash + Your Town 3D + the Castle Series + coins for wins to go live.
  - The 3D town is in the game (js/dorp3d/view.js behind DorpScene's contract; the 2D scene stays the fallback).
  - His /code-review of the unreleased branch confirmed ~40 bugs; all fixed and reviewed (release builds and offline
    pages, coins never lost, bought tribes kept, the game starting with blocked site data, the town client, leaving a
    raid, the castle's bell/stones/ram/farming/keep/quality, the Living Tower battles' order and missions, Block Clash
    friend battles that never hang or drift, escaped names, painting once per shape, cards at load, vines, pieces on
    the rock).
  - The Worker (server/src/towns.js TownHall, slagroom.js SlagRoom; GET / says dorp/kasteel/slag): built and tested,
    not deployed. Order to go live: server tests → `./wr.sh deploy` → (carry-over: only the real towns, and only useful
    with the phones' keys: see server/README §15) → `node tools/build-pages.mjs` + Pages → the app bundle 11800.
  - Version 1.18.0; privacy 2026-10-18.
  - Tests: game 465, server 288 (incl. workerd), ~30 browser checks of the new parts on a clean copy, WebKit (Safari's
    engine) for the three 3D pages, and check-all.sh full for the whole game (87 ok in the run, 11 of 14 ok re-run alone;
    the other 3 test the ideas vote, off since 16 Oct). The suite found three last things, fixed: Block Clash's English
    menu line too long for a small phone, its button's contrast, and no Blokbotsing line in "Hoe speel ek?".
- **18 Oct 2026 (~07:30–09:00): his first play of 1.18.0 on the home server, and what changed (local 7d401a6..a01b41a;
  nothing pushed).**
  - "the camera went to his side without showing the impact": after any touch the camera follows where the block really
    came down (js/botsing/game.js `cameDown`), and a Verrassing's catch is seen at the defender before the camera flies
    home (qa/botsing_impactcam1180).
  - "one block went from standing still to right side": Rikus's vines (Rankgryp) drag blocks to the cliff edge facing
    the thrower, by design. His pick: keep the pull, make it obvious: "RANKGRYP! ⟵/⟶" on the pulled block every time,
    a beat of slow motion, that edge kept in the picture, bolder vines, the card's own words.
  - "I really do not like the Castle series": `KASTEEL.on` false in js/config.js (no menu button, help line or news;
    kasteel.html and its code stay; `true` brings it back).
  - "for now all skins needs to be free ... For people to test it": `SKINS_FREE.on` (js/core/economy.js `priceOf`):
    the Winkel's skins and looks say Gratis and cost nothing; what testers take stays theirs. Rank and weekly-box looks
    stay earned; tribes keep their 1 000-coin price (they change who beats whom in raids).
  - "your town should only be build with the daily challenge ... it needs to take you to the daily challenge": only
    Daily Tower tries feed the town (people, strooptogte, the day's wall: main.js `dorpGainFor`); the town's
    "Bou jou Daaglikse Toring" opens today's Daily; only the Daily flashes "🔥 Strooptog!" and matches' jokers no longer
    promise raids (a01b41a). Tests: qa/owner18_1180.mjs, qa/dorp1160.mjs (an Oefen tower of Perfeks sends nothing).
- **18 Oct 2026 (~08:30–12:00): the Boss-mode test pass ("test it the way he will"), local a01b41a..3ae8715; nothing
  pushed or live.** Jarvis for him: everything tapped twice, rubbish typed, back halfway, the phone turned, the signal lost,
  closed and reopened; each fix proven by a test that fails on the old code. Found and fixed:
  - An Oefen tower flashed "🔥 Strooptog!" and Blok vir Blok jokers toasted raids that never reach the town (a01b41a).
  - A new town showed 18 walkers at "0 mense"; now half the people at home walk, up to 18 (ecd2222).
  - A raid's aim threw by itself after 14 s while the phone was sideways or the app away; now it waits (ecd2222).
  - Block Clash: a quick double tap on the power bar threw at once, flat into the sea; the pin's tap now waits 0.25 s
    (6926b2e).
  - Block Clash played on under "Draai jou foon regop" (a throw landed, Rikus played unseen); now it pauses (7e3b727).
  - Block Clash: a friend's link to a room that isn't open said "GELYKOP, Vriend het die geveg verlaat"; now "Hierdie
    uitnodiging is nie meer oop nie" with SPEEL TEEN RIKUS and ‹ Stapel (3ae8715).
  - Checked and fine: the signal lost at a raid's throw (the strooptog stays), a Daily finished offline (its people
    reach the town once), a friend battle with each phone 8 s offline, rubbish names and links, Stapel's own tower
    turned sideways, Jarvis's nonsense tester (game, Block Clash), WebKit, Block Clash balance (2 wins, 1 loss).
  - The disk hit 0 bytes at ~10:00 (the owner chose the clean-up: 12.5 GB junk, his screenshots to the Trash).
  - The Living Tower battles: after a Waterwiel or Rankgryp mission sent while the target's newest rooms were still on
    their way, the two phones showed different people for the rest of the match (the room's referee was right); now a
    mission names only windows the sender knows are lived in (0fd4492; the live two-phone check had failed 4 runs in 5).
  - In the end every check of check-all.sh full passed (re-runs after the disk, another terminal's emulator and the fixes);
    speed on a 4x slower phone: the 3D town and Block Clash at 60 fps; WebKit OK. Home play restarted for his phone.
- **18 Oct 2026 (~14:00–15:30): Block Clash off; Glybaan, the downhill four-lane runner (a playable test, local 346df23;
  not on the menu, not in the website or app builds).** The owner: Block Clash "Its not working ... The gameplay will be a
  slide going downwards and also it needs to be four lanes"; his picks: the runner replaces Block Clash, four lanes, a 3D
  chute with the camera behind, a playable test of the core first (no economy yet).
  - config `BOTSING.on` false (4e525fb): Block Clash's menu button, Uitdagersreeks cards and how-to line are gone;
    botsing.html stays for old links. The 1.18.0 Play notes no longer announce it.
  - glybaan.html (js/gly/): swipe for a lane, tap to turn, swipe up with a ✨; Stapel's circle of elements (what beats you
    ends the run, what you beat clouds the bottom 30%, your own is safe), stone, Shadow Gates; always faster. Rules in
    js/gly/rules.js with tests/gly.test.js; played by qa/gly1190's autopilot, 60 fps on a 4x slower phone, WebKit OK.
  - His phone on the home Wi-Fi: http://192.168.1.225:8500/glybaan.html?nosw=1.
- **18 Oct 2026 (~16:00–16:50): Glybaan, second round (local d345862; still not on the menu or in the builds).** The
  owner after his first look: "can't we make it that it slides from top to bottom and also maybe we should have the bags
  in the blocks, for example if its a fire block and it goes through the firebox then it might get coins, but its random
  ... can you make it the same look as the coins in the menu."
  - Top to bottom: the camera hangs high over the block looking down the chute (`camera.up` = uphill; lanes mirrored with
    `LX = -laneX`, so a swipe left still goes left on the screen). The block slides near the top; what comes rises from
    the bottom, so the bottom 30% that steam, ash or vines cloud is now where the danger comes from. What the block is
    past sinks back into the chute (`sunk()`), so it never covers the numbers at the top; what ended the run stays.
  - Bags: a block of your own element holds a bag of coins 55% of the time (rules.js `BAG`, 3 to 20, mostly few), set by
    the track's seed; a 💰 pops out with "+N". The start card's rules line says so.
  - Coins: Stapel's own gold coin (a canvas copy of `css/style.css` `.coin-ic`; the corner count uses `.coin-ic` itself).
  - GLY! tapped twice: its second tap never turns the block (`G.inputAt`, 350 ms).
  - Tests: npm test 475; qa/gly1190 (rect water, square vuur, rect gras: ALL OK; passed things sunk; a bag's coins counted
    on screen), gly_nonsense1190 20/20 (a swipe left moves the block left on the screen), gly_perf1190 60 fps on a 4x
    slower phone, gly_webkit1190 OK. Screens: Previews › "1.19 Glybaan - bo na onder (18 Oct)".
- **18 Oct 2026 (~16:55–17:20): Glybaan, third round (local 93e9efb).** The owner on the camera looking down the chute:
  "That will make me nausious, I meant at an angle towards me, basically at a 70 degree upwards."
  - The camera now stands down the chute and looks back up it at about 70° to its floor (game.js `VIEW`): the chute
    rises away to the top of the screen, the block rides high on it and slides down towards you, and what comes rises
    from the bottom. No roll or swing; a little further back as it speeds up.
  - The block's element medallion lies on its top (`pieces.medallion`, new in js/botsing/pieces.js) and stays on top
    through every turn; the gate's gold outline is on the face the camera sees; a soft light over the camera.
  - A bag of coins pops as one big "💰 +N" over the block for 1.6 s with a sound and a small shake; two bags in a row
    add up in the same pop (Jarvis for the owner).
  - The coins sit top left, the ✨ top right and km/h under the distance; the controls line is on the start card.
  - Tests: npm test 475; qa/gly1190 ×3 ALL OK; gly_nonsense1190 22/22; gly_perf1190 60 fps; gly_webkit1190 OK. Screens:
    Previews › "1.19 Glybaan - 70 grade na jou toe (18 Oct)".
- **18 Oct 2026 (~17:25–18:00): Glybaan, fourth round: nature, not blocks (local a756986).** The owner: "the blocks that
  pops up ... needs to be "Cooler" ... a whirlpool, Waterfalls, Fire and Lava ... not just block, bleh." js/gly/hazards.js
  makes each hazard a piece of nature in its own shader: water a whirlpool or a waterfall, fire a fire pit or a lava pool,
  grass thorny vines, stone a boulder; the rules are unchanged. The ring under each shows what it does to you in true
  red, yellow or green. Tests: npm test 475; qa/gly1190, gly_nonsense1190, gly_perf1190 (60 fps on a 4x slower phone).
- **18 Oct 2026 (~18:00–18:10): Glybaan, fifth round: the details (local a7415a2).** The owner: "make sure its 110%".
  Your block leaves a trail of its element; picked-up coins fly to the counter and a row of them climbs the scale; the
  Shadow Gate is a see-through field of light between rock pillars that flashes gold as you pass; speed lines; NUWE
  REKORD! the moment you pass your best; NET-NET! on a close call. Tests: npm test 475; qa/gly1190 ×3,
  gly_nonsense1190, gly_perf1190 (60 fps), gly_webkit1190. Before release (his word): coins into the wallet, the menu
  button, the version, the website and Play builds.
- **18 Oct 2026 (~18:15–18:45): 1.19.0 ready for the owner's go (4cb206d; nothing pushed, deployed or uploaded).** His
  "Yes please": the slide's coins go to the wallet like the castle's (pending in stapel.v1.gly under Oefen's day cap,
  landing when Stapel opens, with a toast; also when a run is left halfway). The menu shows 🌀 Glybaan where Block Clash
  was, with your best; Speelreëls has its line. VERSION 1.19.0; glybaan.html in both builds and the service worker.
  Tests: check-all quick ALL CLEAR, smoke, lang, howto, owner18, qa/gly_wallet1190 8/8, and the built site. The app bundle
  (1.19.0 / 11900) waits in the Play folder "Upload 1.19.0 internal" with its README (the order: Worker, website, app).
- **18 Oct 2026 (evening): Glybaan becomes a runner game (49f99e1; still 1.19.0, rebuilt; nothing live).** The owner: "make
  it small men that runs, fire man, Water man, and earth man ... adjust the theme ... make it so good that I will not
  change ONE THING!". Three little men (js/gly/runner.js: Vuurman, Waterman, Aardman, each with a portrait on the start
  card) run down the slide: swipe for a lane, tap or swipe up to jump, swipe down to slide. Whirlpools and lava can be
  jumped, waterfalls, fires, vines and boulders only dodged; barriers: a low beam (jump), a high beam (slide), a wall with
  a gap. Every 600 m another world (js/gly/worlds.js: sunset sea, jungle, volcano, ice, stars). Music (js/audio.js
  `audio.music`) builds with the run. Missions (three at a time) and levels pay coins; your best is a gold line on the
  slide; WEER goes straight back in. Tests: npm test 477, check-all quick, qa/gly1190 (three men), gly_nonsense1190,
  gly_wallet1190, gly_perf1190, gly_webkit1190, the built site. A 75 s play-through with sound in Previews.
- **18 Oct 2026 (night): Glybaan's hazards fill their lane (ef2a5aa + 687e28d; still 1.19.0, rebuilt; nothing live).** The
  owner after playing: "the rock does not fit, the round obstacles feels fake ... Then the walls is really good". Every
  hazard is now the lane's own shape inside a rounded-rectangle outline (red = out, yellow = you see badly, green = your
  own): a whirlpool filling its lane, a curtain of water between two stones, a trench of coals with flames, a lava bed, a
  hedge of thorny vines, and a dry-stone wall in the gates' own stone (too tall to jump). Speelreëls says "Rooi: uit".
  Tests: npm test 477, qa/gly1190 (three men), gly_nonsense1190, gly_wallet1190, gly_perf1190, gly_webkit1190, the built
  site; pictures in the real camera: qa/gly_hazards1190.mjs. The app bundle (1.19.0 / 11900) rebuilt in the Play folder.
<!-- STATUS-END -->

### 18 Oct 2026 ~23:30 · Glybaan switch test + the test fixes (f3fb495, local, nothing live)
The owner asked for the element-switch feel test and the three fixes from the Game Tester's report. `glybaan.html?switch=1`
turns the switch on (off by default); the badges, the ✨ button and the mission note apply to everyone. Details and tests:
the stapel skill's changelog. The Play bundle in the Play folder is still 687e28d.

### 18 Oct 2026 23:31 · Glybaan's elemental look; 1.19.0 (11900) on Play internal testing (e84cd4c)
The owner's pick of the Gemini pictures, built: js/gly/elemental.js (hazards), js/gly/scenery.js (islands), the rare diamond,
the remodelled men; uploaded to internal testing on his word. The Worker and website are untouched. Details: the stapel skill.

### 19 Oct 2026 ~08:30 · Glybaan looks like his picture; 1.19.1 (11901) built, not uploaded (4191bc3, 1b2ad77)
The owner, of 1.19.0 beside the Gemini picture he chose: "it doesnt look close to that image you've shown me. Please check";
then "be 110% sure that I will be satisfied ... especially the graphics". Remade after the picture: the low camera looking
back up the slide, which sweeps up to a gate on the horizon; a twilight sky, sea and mist (js/gly/sky.js); a glossy slide
with mirror images; the four obstacles and the three men as in the pictures; the scenery beside the slide (scenery.js);
call-outs kept on screen. Tests three times over (all Glybaan checks OK, npm 477, 60 fps on a 4x slower phone). Play folder
"Upload 1.19.1 internal" waits for his word; pictures in Previews › "1.19.1 Glybaan - soos die prent (19 Oct)".
Details: the stapel skill (§2, the changelog).

## 3. Remaining work, in order

<!-- TODO-START -->
Each step should end green (`npm test`, `cd server && npm test`, a headless playthrough with zero console errors) and be committed and pushed.

- ~~**T1. Base-game QA pass.**~~ **Done** (see section 2). Original brief: Treat `docs/review-findings.md` as a checklist: for every finding, check in the code and the browser whether it's fixed now, and fix anything still open (all critical/high first). The fixer's lost report means none are confirmed yet. Also:
  - Play full games at 412×915 and 360×640.
  - Verify the daily is deterministic: same scripted taps should give identical weather effects.
  - Restart scenes 6+ times and check for leaks.
  - Test under a sub-path: serve `/home/user` and open `/Toring/`.
  - The prompt for this pass is the `qa` agent in `docs/workflows/2-review-fix-qa.js`.
  - With a mocked API (`page.route` on `js/sponsorConfig.js` and the API host), also check the daily percentile line on the results card and that a revisit uses GET.
  - Play a first game on a fresh profile (cleared storage, no `debug=1`) and check the coach hints (see section 2); a second game must show none.
  - Include the T5 sponsor features in those games: names on blocks, the billboard (it floats with the flood) and the menu card. A test feed can be injected with Playwright's `page.route('**/sponsors.json', ...)`.
- ~~T2. Core sponsor logic~~ **Done** (see section 2).
- ~~T3. Legal templates~~ **Done** (see section 2). The owner fills in the placeholders.
- ~~T4. Sponsor reviews and fixes~~ **Done** (see section 2). Residual, low: two block names bought at the very same moment by one Paystack customer can get their two subscriptions swapped (both still renew; only a cancel would hit the twin); a script that fakes `Origin` can still inflate counts within the per-address caps (the in-memory limits are per Worker instance); someone can keep the billboard "Tans bespreek" by restarting unpaid checkouts (set `PENDING_HOLD_MINUTES=0` if that happens; double sales are impossible either way).
- ~~T5. In-game sponsor integration~~ **Done** (see section 2). It also reworded the code comments that named other games and added the README section.
- ~~**T6. Final pass.**~~ **Done** (see section 2); only the owner's checklist in section 4 remains. Original brief: Full playtest plus screenshots. Confirm the **game payload** (what a player downloads: `index.html`, `lib/`, `js/` without `js/pages/`, `css/style.css`, `icons/`, `manifest`, `sw.js`) stays under 3 MB. It was about 1.8 MB after T5 (that count includes `sponsors.json`); `docs/`, `server/` and `tests/` are never loaded by the game. Check the README's sponsorship section is still accurate, then hand the owner the checklist in section 4.

**All of T1–T6 are done**, and so are the visitors (`docs/CHARACTERS-SPEC.md`, version `1.6.0`), the Uitdagersreeks (`docs/CHALLENGE-SPEC.md`) and coins, power-ups and ranks (`1.8.0`). English is done (`1.9.0`). Next with the owner: production on Google Play. The English store listing texts and pictures are ready (`app/store/`) and the English privacy page ships (`privacy.html`, since 1.12.1). The account is a Lekker Local Organization account: Play's Dashboard (10 Oct 2026, read only) shows production's "Create a new release" unlocked and no "12 testers for 14 days" card, so production is very likely open (a 100% check: the owner presses Production → Create new release). New testers still go on the closed test's "Family" list (Play Console → Test and release → Closed testing → Testers) and join through `https://play.google.com/apps/testing/com.lekkerlocal.stapel`. Before the production application: 1.12.3 (SKILL §2 list), hide-a-name/report on match results, and the owner's company items (Information Officer, PAIA manual). Later: biomes (height bands and a daily world), sponsor sales through PayFast, and iOS. What is left beyond that is section 4 (owner-only steps). If the owner asks for more, start with the medium and low findings in `docs/review-findings.md` that were not re-checked one by one, or tune the visitors (`VISITOR` in `js/config.js`) after playtests on real phones.
<!-- TODO-END -->

## 4. Things only the owner can do

0. **Before deploying the Worker:** re-run `schema.sql` (adds `payment_reversals` and `alerts`), and set `IP_HASH_SALT` as a secret. Act on the "Aandag nodig" items on `admin.html` (refund slot-taken payers in the Paystack Dashboard). Ask the lawyer to check the new terme.html clauses (full-slot refund, manual approval within [[1 werksdag]], automatic dispute handling).
1. **Paystack:** create and verify a business account. Create two **monthly ZAR plans**: one for name-on-blocks (any amount the owner chooses) and one for the billboard at R1 499 = 149900 cents. Copy the secret key and both plan codes.
2. **Cloudflare:** create a free account, then follow `server/README.md` (`wrangler login`, `d1 create`, schema, secrets, deploy), and point Paystack's webhook at `https://<worker>/paystack/webhook`.
3. **Go live:** set `SPONSOR_API_URL` in `js/sponsorConfig.js`. That one value switches on the "Adverteer hier" link, the sign-up form and the "Jou advertensie hier" billboard, and also live Uitdagersreeks matches. Test first with Paystack test keys and test cards. (Live matches only, before sales: set `MATCH_API_URL` instead. Deploying the Worker sets up the match objects by itself.)
4. **Contact email:** send the public contact email, which goes in `SPONSOR.contactEmail`.
5. **Legal templates:** fill in the `[[placeholders]]` in `terme.html` and `privaatheid.html` (legal name, address, registration number, Information Officer), get them reviewed, then remove the template banner.
6. **GitHub Pages:** merge into `main`, then Settings → Pages → Deploy from branch → `main` / root.

## 5. How to work on this repo

- No build step. Serve the root statically: `npx http-server -p 8080 -c-1 .`, then open `index.html?nosw=1&debug=1`.
- Tests: `npm test` (game core, node --test). Sponsor backend: `cd server && npm test`.
- Debug params (only with `?debug=1`, which uses separate storage `stapel.v1.debug` so it never touches real stats): `date=YYYY-MM-DD`, `auto=<aimErrorRate>` (autoplay, also for Uitdagersreeks matches), `seed=<practice seed>`, `visitor=monkey|clown|thief` (that visitor comes with block 3). `?nosw=1` skips the service worker. Player-facing link params: `?klop=` (daily height to beat), `?teen=` (somebody's Uitdagersreeks run), `?kamer=` (a live friend room).
- Live matches locally: `cd server && npm ci && npx wrangler dev --ip 127.0.0.1 --port 8787` (the match routes need no D1 data and no secrets), then serve the game with `MATCH_API_URL` pointing at it (the QA harness did this by rewriting `js/sponsorConfig.js` on the fly in its static server; never commit a local URL). Two browser contexts can then pair through "Soek ’n teenstander".
- Test hooks: `window.__stapel = { game, bus, store, ui, audio, scene }`, plus `scene.getState()` and, with `?debug=1`, `scene.spawnVisitor(type, side)`.
- Headless browser on a Mac: `playwright-core` with `executablePath` set to the installed Google Chrome works with the same SwiftShader args (about 30 fps). For determinism runs, call `game.loop.sleep()` and drive frames yourself with `game.headlessStep(time, 1000 / 60)` (no rendering, fast), and replace `Math.random` with a seeded stream in an init script, different per run.
- Headless browser (cloud containers): Playwright with Chromium args `['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']`, mobile context `{ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }`. Headless fps is only 11–15 because rendering is in software; judge performance by CPU ms per frame, not fps.
- Every release: bump `VERSION` in `js/config.js` **and** the cache name in `sw.js` (a test checks they agree and that every module is precached). Changes to `js/core/sequence.js`, `js/core/weatherplan.js`, `js/core/visitorplan.js`, the `VISITOR` numbers or the physics change every daily tower, so ship them before local midnight; `tests/sequence.test.js` (blocks and weather) and `tests/visitors.test.js` (visitors) hold golden snapshots of daily #1 that must be updated deliberately.
- All player-facing text is Afrikaans and lives in `js/core/strings.js`. Numbers use `js/core/format.js` (decimal comma, non-breaking spaces).
- The `docs/workflows/*.js` files are the multi-agent workflow scripts used so far (Claude Code Workflow tool). They're useful as prompts even if you work solo. `<SCRATCH>` in them was a temporary directory.
- Egress in the cloud container used so far blocked paystack.com, developers.cloudflare.com, cdn.jsdelivr.net and sportscard.co.za; the npm registry and web search worked.

### 20 Oct 2026 18:33 — 1.19.1 (11901) on Play internal testing
The owner: "Please upload the latest stapel if its ready". Bundle SHA 9a60e4b7…a7f8 (from 1b2ad77), security scan clear, Play release 22 "Available to internal testers". Notes af 475 / en 497 (Play wants the tag <af>, not <af-ZA>). NOT pushed, Worker + website NOT deployed (as 1.19.0). Next: his 2-minute phone check (README in Older builds › "Upload 1.19.1 internal (DONE …)").

### 24 Oct 2026 — the new direction: Ons dorp, die Rivier, die Saterdag-uitdaging (branch rivier/1.20); 1.15.6 web + 1.19.2 Play hotfix
His words (24 Oct): "I like the dorp scenario but I do not like the steal and the look of the town", "lets leave the whole
earth, water and fire scenario", the river "a rescue mission for the men you lost on the towers", "use a crane to build
ontop of the weekly tower", "I want a Saterday Challenge", crocodiles and Blouaap on a block, "I want this to be the FINAL
version". The plan: docs/RIVIER-PLAN-2026-10-24.md (rules, numbers, checkpoints).
- **Live hotfix (his Telegram photos 08:41):** Blok vir Blok, a block the other player left loose that falls in your turn no
  longer costs your heart (GameScene.markLost, turns path: own block or touchedBy only; toast turnLooseFree). Website 1.15.6
  live (Pages bbe2bf8e from hotfix/1.15.6; rollback c0e5c76a). Play 1.19.2 (11902) built from hotfix/1.19.2 = 1.19.1 + the
  fix (Play folder "Upload 1.19.2 internal"), waiting for his typed "upload". qa/bvb_loose1200.mjs.
- **Checkpoint 1 built (rivier/1.20, local, not live):** js/core/span.js (week, phases, whistle, ticket, bombs), js/core/
  weektower.js (floors, hits, chains, cracks), js/core/rivier.js (courses: blocks, rocks, crocodiles, Blouaap paddling a
  block, hippos, rapids; each kind met alone first; passable), js/rivier/ (the 3D ride: world, rider, things, beasts, view:
  the dive off your Daily tower, the ride, the finish at your island; openTown = the Ons dorp screen with a Karoo dorp),
  js/span.js (the week on the phone), GameScene mode 'week' (the Weektoring restored as cement, 10 blocks, no hearts),
  main.js (Daily → results "🛟 Gly af" → ride → "Bou aan die Weektoring" → turn → sheet), the menu's Ons dorp button.
  Tribes, tribe missions, Glybaan's button and Steel en Wraak are switched off. Tests: npm 496; qa/dayloop1200.mjs,
  rivier_shots.mjs, rivier_perf1200.mjs (59 fps avg on a 4x slowed CPU), bvb_loose1200.mjs, smoke, daily, living1160.
- **Checkpoint 2 built (later, 24 Oct; rivier/1.20, local):** server/src/span.js in the TownHall DO (crews of 3 by
  invite, the crane lease, rides, Saturday's rivers of 4 with Rikus filling, bombs on the tallest only, repairs, the hidden
  whistle, prizes once, monuments; old rivers deleted after 6 weeks); js/span.js server mode; the town screen (crew, river
  standings, news, invite via WhatsApp `?span=CODE` → join sheet, leave); Saturday's bomb run (js/rivier/view.js openRaid:
  four crews' islands, the tallest last, hold → time ×0.25 → drag → let go, the server's answer corrects the count, the
  card with standings); fresh crew news on the menu's button. Balance from a 16-Saturday simulation
  (server/test/span.sim.test.js): a bomb's blast takes two floors (a whole Perfek cracks instead), the crane closes
  Saturday 12:00 (repairs go on), Rikus is weaker (one bomb every 2nd turn, builds only before noon). Privacy pages
  describe Ons dorp's server data. Home play: play-home.sh runs Ons dorp on a test clock (Mon 26 Oct 08:00 first; the
  town's 🕒 row jumps through the week with ?debug=1&meter=0). Tests: npm 498, server 298 (+2 sims), qa/rivier_raid.mjs
  14/14, span1200.mjs 18/18 (two browsers, Monday → Saturday's bomb run), span_clock1200.mjs 5/5.
- **The look pass (24 Oct, afternoon; his Telegram 12:34: "Make it a bazooka on his shoulder ... the graphics just needs
  a big upgrade, use whatever tool you need ... Very well done"):** Blyde-style canyon (sandstone texture with bumps,
  ledges, desert varnish, lichen), shrubs, acacias on the rim, rondavels, clouds, birds, waterfalls, the walls mirrored
  near the banks, a wake and foam under the board; the town shows each member's latest Daily tower and past weeks'
  monuments (name tags), frames the towers in the space the panel leaves, the panel folds; background skins dress the
  3D river and town (sunset, night with stars and floodlights, northern lights, space, candy, cherry blossom, aquarium,
  retro neon); Saturday's bazooka on the builder's shoulder fires rockets (flash, kick, back-blast, smoke trail,
  fireball). Also: offline crane turns queue, floating floors dropped, new-player limit per address, the prize said
  once, Saturday/Sunday/Monday reminders, the rules screen. Asked him (Telegram 12:47) to install Blender for proper
  models (builder, bazooka, crocodile, hippo, monkey); waiting.
- **Blender (24 Oct afternoon, his "Perfect please use blender"):** models made by script in art/blender/ (README: run
  `~/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P art/blender/<m>.py -- img/models/<m>.glb`;
  raise MODEL_V in js/rivier/models.js when a .glb changes). Every model has its code fallback. Plus the bazooka,
  fireworks for winners, background-skin skies, rushing water, speed feel. A 46 s video sent to his Telegram.
- **AAA graphics pass (24 Oct evening, his "i really need it to be a AAA game"):** real sun shadows (a shadow catcher
  over the custom water), planar water reflections on high quality, lacy foam, river mist / sun shafts / dust, splash
  droplets with mist puffs, rebuilt sandstone (strata broken into blocks, crags, wet foot, dusty ledges), waterfalls with
  foot mist, layered rondavels with bushy crowns, faceted boulders. npm 501/501, leak test flat, raid OK, mid 60 fps.
  Asked him on Telegram whether the main stacking screen gets the same 3D look.
- **His 4 notes (24 Oct late evening):** the canyon's start without gaps (wall pieces share their end profiles, the
  walls follow the bank vertex by vertex, a plateau behind every rim); a smooth spring glide between lanes; Saturday's
  bazooka became a high-pressure water cannon with a scope that locks onto the tallest tower by itself (drag up/down to
  aim while surfing, the SPUIT / BLAST button; words: shots / skote); premium Blender crocodile, hippo, Blouaap,
  swimmers in life vests with glossy face badges, the rider with a real face; stones in the canyon's sandstone.
- **Polish pass (24 Oct night, his "leave nothing behind"):** clean model bakes, acacias and leafy bushes, savanna
  plateau, fireworks when every person is saved, a clean Saturday scope on small phones, the aimed tower's tag hidden.
  Full regression green. His choice (Telegram 18:53): "Keep cartoon" — the main stacking screen stays 2D.
- **The endless river (24 Oct ~20:00, his "make it that it doesnt end, the more meters you get the better for the
  week"):** three hearts, a metre counter, your island in a lake at ~700 m, faster after; the card leads with the
  metres. The town's island now sits in an open lake (his photos: the camera had ended up inside the canyon's rim).
  His pick (A): every 100 m ridden Mon-Sat earns a Saturday shot (the week's 10 still the most); Ons dorp shows the
  crew's river metres and each builder's.
- **Afgly at all times (24 Oct ~21:30, his "The game mode needs to be available at all times"):** an Afgly button on the
  menu beside Ons dorp; ride whenever you like (the first ride after a Daily brings your people, the rest are free rides
  for metres and Saturday shots); "Gly weer" on the card; the menu fits a 360x640 phone in full.
- **Afgly's daily ranking (24 Oct ~22:15, his "There should be a daily rank for gly as well"):** your furthest ride of
  the day against everyone's: the card says your place (Ranglys › shows the top 10), the menu's Afgly button too. It
  lives in the Ons dorp server; a ride faster than the river doesn't count.
- **Error-free pass (24 Oct ~23:30):** an independent code review's findings all fixed — rides are timed by the
  server (a forged ride can't top the ranking), a resent ride counts once, last week's rides don't spill into the new
  week, the ranking's "hide me" works for Afgly too, and graphics memory stays level over many rides. Blouaap's bandana
  and the hippo refined. Full test suite green.
- **His verdict (25 Oct ~00:15):** "I think we have a winner ... I'm actually speechless". His one note — it began very
  slow and then stayed the same speed — is fixed: Afgly starts brisk and never stops getting faster (19 → 40 m/s),
  rows come closer in time further down, the music speeds up with it.
- **Further down the river (25 Oct ~01:30, his "keep it as is for the first 1000 meters, then ... a clown"):** from
  1 km Hanswors rides beside you on his inflatable duck lobbing cream pies (a shadow shows where; a hit only covers
  the screen in cream); from 2 km logs to jump (swipe up); from 3 km fallen trees to duck under (swipe down); the
  first log and tree slow the river nearly still and show how, once per phone. Code: js/core/rivier.js RIVER.unlock,
  js/rivier/hazards.js, art/blender/hazards.py → img/models/hazards.glb. Fixed: hints after the opening tip were
  wiped by a 7-second rule. Tests: npm 504, qa later1200 18/18 and the river suite.
- **Hanswors fixed frame by frame (25 Oct ~02:30, his "look at it frame by frame"):** the pie now shows in the air
  and flies into the screen on a hit (it was never drawn before: a NaN from a shared arm line); the cream is big,
  centred and gone in ~2 s; he rides closer and bigger, three-quarters on, on a real rubber duck with foam and spray.
- **Hanswors's duck clear of the rocks (25 Oct ~03:30):** the canyon's waterline bulges are eased (the cliffs above
  keep their shape), no boulders on the bank where he rides, and he keeps 1.7 m from the wall and out of the lanes.
- **"THIS IS FUN!!!" (25 Oct ~04:15):** his one note, everything moving left to right, is fixed: blocks, Blouaap and
  swimming crocs cross either way, and crocs swim snout first.
- **1.20.0 RELEASED (25 Oct ~02:00–02:30, his "please release this version to everyone"):** the River run only (Ons
  dorp off: config ONS_DORP), Hanswors every 1.6–2.4 km, Blouaap quieter, the dive only on the rescue ride, no Stapel
  flash. Worker fb1ce1e9 (rollback 5b9725b2…), live gate passed; GitHub 7daa31f; website stapel-v1.20.0; Play 12000 on
  internal testing. Live check ALL CLEAR.
- **Next:** his feedback; his play of checkpoints 1+2 at home:
  http://192.168.1.225:8500/?nosw=1&debug=1&meter=0&date=2026-10-26&town=1; the release on his word (plan §8).

### 25 Oct 2026 (day) — 1.21 work on rivier/1.20 (local; not released)
- c779571: the pie (Blender crust, piped cream, cherry + stem; hazards MODEL_V 5), the splat on the lens the same frame
  (no blank frame), soft landing shadow; night skies: a headlamp on his hard hat (SpotLight + world.setLamp in the water
  shader) and world.turnMoon (the moon's path turns with the camera: no more black water passing the island).
- 8608cc7: lane marks — white-water seams on the water (default) or floating pipes (`laneMarks: 'pipes'`); his pick pending.
- c85e7a3: Saam gly (js/rivier/duel.js over /slag/room, live already) — two friends on one river, each seeing the other
  (blue rider, name tag, metres pill), 3-2-1 together, watch the friend after you're out, who won, Weer saam; menu 👥
  beside the River run, ?gly=CODE links. A player's first name is asked first (required).
- Tests: npm 510; qa saam1210 23/23, name1210 10/10, afgly 14/14, edges 15/15, later 21/21, raid 15/15, leak OK.
- **Next:** his lanes pick (A/B), "release" (1.21 to Play internal + website; Worker unchanged), friends online (asked).

### 25 Oct 2026 ~11:30 — 1.21.0 Saam gly released (his "Please push what you have built")
- check-all quick ALL CLEAR; live gate (saam1210 against the live Worker) green, GLY! 22 ms apart; Worker unchanged.
- GitHub claude/trusting-hopper-26qcax → 5d6ec78; Play 12100 (1.21.0) on internal testing 11:28 (0 devices lost).
- Website: `bash ~/deploy-stapel-1.21.sh` (auto mode refuses Claude's Pages deploy); then check-all live.

### 25 Oct 2026 12:16 — 1.21.1 (his lanes note, then "push")
- The lanes' edges only, as floating pipes, only on open water (47c7942); 1.21.1 (18623d3) on GitHub and Play internal
  12101. Website: `bash ~/deploy-stapel-1.21.sh` (deploys 1.21.1) by him; then check-all live.

### 25 Oct 2026 13:55 — 1.21.2 released (Saam gly on phones, find an opponent)
- Server e13a23e (rooms take a phone back to its seat with its key; the lobby /slag/seek), client 28484d4, fe24dc8.
- Worker ae07639c (rollback fb1ce1e9-cbd3-4449-bba9-e60e13005d0b), live gate 35/35, site 1.21.2, GitHub fe24dc8,
  Play 12102 on internal testing. check-all live: all ok.

### 25 Oct 2026 ~15:40 — 1.21.3 (coins, whirlpool at 5 km, elephants at 10 km; his "once you are satisfied please release")
Commits 201eceb + 1a8ba2b. Coins in the River run (lines, air, stacks of 10, the diamond of 50 over a log) into the
wallet under the day's cap; coins fly to the counter. The flaw pass fixed: Klaar's double tap, sideways riding, the
silver coin emoji, the elephants' white tails, overlapping lessons, too-frequent whirlpools/elephants. Tests: npm 518,
server 311, nonsense 32/32, saam 29/29, seek 6/6, later 21/21, afgly 14/14, edges 15/15. Website: his
`bash ~/deploy-stapel-1.21.3.sh` (site only). Play: "Upload 1.21.3 internal" (12103).

### 25 Oct 2026 ~17:50 — 1.21.4 (Saam gly fixes) on Play internal + closed test (Alpha) sent for review
His Telegram 14:41: the friend seemed to ski into things (drawn ~0.4 s late: the room's relay ~176 ms one way + 160 ms
smoothing) and a rider was lost off the screen by the island (the camera's island turn in the wide duel view). Fix:
'st'.a (the lane, sent at once on a swipe), the friend on the same lane spring, friendWay() takes the way past a rock
still in their lane at the last moment; no island turn in duel. qa/saamway1213.mjs: ride-throughs 7 → 0. The closed
test (Alpha) was still 1.15.1: 12104 promoted and sent for review. Website: his `bash ~/deploy-stapel-1.21.4.sh`.

- 26 Oct 2026 (1.22 polish, local, nothing live): see docs/POLISH-1.22.md. Commits 2020c96, bbfee95, 2bf37b6 on rivier/1.20. check-all quick ALL CLEAR.

### 27 Oct 2026 ~20:00 — news notifications for the app (branch push-notifications, e043f32; local, not pushed)
- Owner: "Can you send updates on the app through pop-ups?" → Firebase project **Lekker Local Games**
  (`lekker-local-games`, account sportscardza, Spark plan, Analytics/Gemini off; Stapel + Handjie Tennis registered).
- App only (the website is untouched): `StapelPushPlugin.java` (Capacitor plugin "StapelPush", `join({topic})`, topic **stapel** since 27 Oct ~20:30: Firebase topics are project-wide and Handjie uses "news"), registered in
  MainActivity; `firebase-messaging:26.0.1` in app/build.gradle; manifest: Firebase auto-start OFF, reminder icon, channel
  "news" ("Nuus / News"). `app/shim.js`: a phone that allows notifications joins topic **news** (the daily reminder's Android
  question: wrapped `reminders.ask`); players who have played (`stapel.v1.econ` / `rvTaught`) are asked once at a later start
  (`stapel.v1.newsAsked`).
- `app/android/app/google-services.json` is local only (in .git/info/exclude here, and app/android/.gitignore on the branch).
- Tested: `npm run bundle` builds; the AAB holds the plugin, Firebase, POST_NOTIFICATIONS, auto-start off and the new shim.
  Not yet on a phone. Sending: Firebase console › Messaging › New campaign › Notifications › Target: topic `news`.
- Next (his word): merge into the next app release (VERSION bump, after Google decides on 1.22.0), Play data safety
  (Device or other IDs: notifications), privacy page.

### 27 Oct 2026 ~21:20 — 1.22.1 (12201) on Play internal testing: news notifications
- His "Lets do the same for stapel" (after Handjie's test worked) and "yes". c108d8d pushed to claude/trusting-hopper-26qcax;
  check-all quick ALL CLEAR (518 + 311 + boot); website NOT deployed (unchanged, still 1.22.0). AAB uploaded by Claude
  (file_upload), notes af + en-AU/CA/GB/US/ZA; internal "Available to internal testers". Play folder "Upload 1.22.1 internal (notifications)".
- Topic is **stapel** (Firebase topics are project-wide; Handjie Tennis uses news). Test note "Stapel / Toets: kennisgewings werk! 🧱"
  sent 21:16 from the Firebase console (Lekker Local Games > Messaging > New campaign > Notifications > Topic stapel).
- Play Data safety: Device or other IDs + "Developer communications" SAVED, not sent (1.22.0's closed/open review untouched);
  it goes with the next submission. Next: his phone check; closed/open/production after Google decides on 1.22.0.

### 27 Oct 2026 ~21:40 — 1.22.1 sent to PRODUCTION (first public release) + privacy pages live
- His "Lets push Stapel and SportCard live, what do you think?" → privacy.html + privaatheid.html got section 2e "News on
  your phone" (+ contents, operator Google/Firebase Cloud Messaging, retention), d90ea3c pushed; website deployed by him with
  `bash ~/deploy-stapel-1.22.1.sh` (site 1.22.1; /privacy and /privaatheid show #p2e; note: Pages 308-redirects
  privacy.html → /privacy, so checks need curl -L).
- Play: 1.22.0's closed/open review had finished (nothing in review). Production track (was inactive, 11 countries) new
  release 12201 (1.22.1) from the library, full rollout, notes af + en-AU/CA/GB/US/ZA ("Stapel is hier!…"), + Data safety
  (Developer communications): "Changes in review" ~21:40. Managed publishing off: live when Google approves.
- Next: after approval, the "Nuwe weergawe!" card for older apps (Worker APP_LATEST 1.22.1; a Worker deploy ends live matches).

### 27 Oct 2026 ~21:50 — production PULLED BACK (his "Please remove now")
- His reasons: "the free skins are still there, I do not think the payfast is ready, and I think we should run one more check
  on the app". Publishing overview › Remove changes: production 12201 + Data safety are back under "Changes not yet submitted"
  (saved, not in review). Nothing public. Internal testing keeps 1.22.1; website 1.22.1 + privacy §2e stay live (harmless).
- Next: his free skins / payments decisions, then a full app check, then resubmit (Publishing overview › Submit) on his word.


### 28 Oct 2026 ~06:30-08:30 — 1.23.0 (the public launch): the full check, the review's fixes (local, 8f641ac)
- His asks (27 Oct night): "skins done" (prices back), a never-sold skin for the testers (Stigter), "Everyone starts from
  scratch", a Saturday "under construction" strip, special coins, "dig deep", and "release it with confidence that you do
  not even need my aporval". Commits on rivier/1.20 since ad4158a: f30c251 launch prep, eedbce0 polish, b4ed66a the
  English menu fits 360, 26d9929 River models fetched whole (three's stream was cancelled by GC: simple shapes on slow
  lines), 5537fae a ?debug=1 page talks to the crews' server only when it is local (a test ride or autopilot could reach
  Afgly's live ranking) + two colours past 4.5:1, 25ec7b0 + 9aef2a3 the review's account fixes, 8f641ac each coin one
  draw call again.
- The full check (check-all.sh full) froze 01:30-06:50 on the parked Glybaan check (no time limit). check-all.sh now has
  a watchdog per check (TEST_MAX_S 900), OFF_CHECKS for switched-off features (battles, Glybaan, Jou dorp, Blokbotsing,
  owner18) and ONLY="a b" for re-runs. Every other red was an outdated test (tester gifts/refill off, Stigter hidden,
  1.22's cement tip, 1.21's first name step, the tribe row, refill-based sign-in, the town as a ready mark): updated;
  the re-run all OK. launch123 ALL OK; contrast 0 words under 4.5:1; River coins/coinfly/coinwallet/leak/perf OK (4x
  slower CPU, mid: 60 fps avg, 59 min); River/Saam 15/15; unit 528 + server 315; sign-in checks OK on 8f641ac.
- The Backup terminal's review (5 findings, all fixed and OK'd): the Worker's keepOwned gave a signed-in tester's testing
  skins back over the launch save; an older app on the same account counted the 1.23 phone's coins away; the server now
  refuses (400) a save without LAUNCH.id over one with it; launchReset resets a signed-in device's sync base (and its
  rev) so an older phone that updates later costs the account nothing; playedBefore counts Winkel items; coin draw calls.
- Needs a Worker deploy WITH the site (before any 1.23 client syncs an account): `bash ~/deploy-stapel-1.23.0.sh`
  (server tests → ./wr.sh deploy → Pages). The AAB goes to Play internal only after it.

### 29 Oct 2026 ~07:30 — the 1.24.0 work committed (7efc075) and pushed to GitHub as its own branch (his "please push")
- What: his 2 phone bugs (a hooked T hanging beside the tower, never cemented now: it slides off and costs its heart; the
  River's top row under the status bar in the app), the River's foam rings kept over the water (crates, rocks, swimmers),
  the dig's 13 fixes (River Back, Saam gly invite/cancel/60 s, the notification ask, Back twice to close, Statistiek's
  Afgly row, a fresh WebView when the renderer dies, minWebViewVersion 93 + webview-oud.html, …), the River's bends and
  waterfalls, Robot Rikus on the river, Saam gly protocol 3, and his 3 River notes of 29 Oct 04:46: coins never
  impossible (core/rivier.js COINS.windowS + `unreachableCoins`: 1.23.0's rivers 45% unreachable, now 0), the rocks'
  rings, the load time.
- Load time, measured (qa/loadtime1240.mjs, qa/bootprof1240.mjs; CPU x4): a cold start reaches the menu in ~1.25 s, the
  game engine's boot (Phaser textures) the biggest part; the River from the menu 1.2 s, 0.95 s with its code already in
  (the app now fetches it while the menu is up, and only then). Squeezing the app's code with esbuild was tried: 25 ms
  sooner to the menu, the River 0.5 s later, so app/build-www.mjs copies the files as written again.
- VERSION is still 1.23.0: the release ("make 1.24.0") bumps it in js/config.js + sw.js. Pushed to `origin/rivier/1.20`
  only: `claude/trusting-hopper-26qcax` is the old address's GitHub Pages source, so it stays at ad44151 (= live 1.23.0)
  until the release, when the site and the old address go to 1.24.0 together.
- Tested on this tree: check-all full ALL CLEAR (03:00, before the coins/load work), perf 60 fps at 169 m, the screen
  sweep (nothing new against 1.23.0); after it: unit 531/531, rvfix1240 foam (rocks' lowest ring 0.05 m), the River
  32/32 and Saam gly 29/29 on the app's files, hearts1153 3/3 (with its hanging check). Report:
  `~/Documents/Test Reports/Stapel/2026-10-28 2305 (1.24.0 local)/report.md`.
- His calls: a hung piece costs a heart (or free?); tower matches across 1.23/1.24 stay allowed (rules 112) or split;
  which of the sweep's polish items; "make 1.24.0" (internal testing first).

### 29 Oct 2026 ~07:52 — 1.24.0 RELEASED: the website, the old address and Play internal 12400 (his word, remote)
- His words: "push the 1.24 to my phone and to the website or the internal testing for this one". VERSION 1.24.0 (fe8da2a);
  check-all quick ALL CLEAR; security scans clear; `~/deploy-stapel-1.24.0.sh` (the site only: no server change, the Worker
  stays 8643046e, live matches untouched): stapelspel.pages.dev serves stapel-v1.24.0; GitHub origin/rivier/1.20 and
  claude/trusting-hopper-26qcax (the old address) = fe8da2a. check-all live ALL CLEAR (board-live's hidden row removed).
- Play: internal testing 12400 (1.24.0) since 07:51 (notes af + 5 English). Production stays 12300 (1.23.0).
- A 1.23 phone and a 1.24 phone in one Duo ride: the room ends at once with "update" (protocol 3); tower matches still mix
  (rules 112), his call whether to split them.

### 29 Oct 2026 ~12:30 — the River's turns rebuilt: a fixed winding canyon you steer through (local, not released)
- His words (remote, after playing 1.24.0): "The twist and turns should change, it looks like the background is merging
  with the frontend, it needs to be smooth as if you are in between mountains. Please play the game yourself and look for
  texture issues and 3D modeling, and movement."
- Played on this Mac (proto/rivier.html, autopilot, GPU, 60 fps recordings, `qa/rivier_ride1241.mjs`). Found:
  - The turns were a "curved world": each thing ahead pushed across by an amount growing with its distance and its own
    spot, not yours. Even on a straight stretch the far canyon sat up to ~100 m aside and folded into the near walls (a V
    of rock in the middle), and every wall slid sideways as you came near (walls stepped into the river, then out).
  - The far mountains stood still while the canyon bent, so a bend could carry the walls through them.
  - A waterfall across the river was frosted glass (at least 54 % white everywhere): everything behind it washed out,
    a ruled white line across the water, and riding through it put a repeating grid of white dots over the screen
    (the CSS spray: two tiled dot patterns).
  - Up close one wall picture spans most of the screen: smears.
  - The face badges over swimmers and the spray particles ignored the bend (far ahead they floated beside the canyon).
- Fixed (js/rivier/world.js, view.js, things.js):
  - world.js `PATH` / riverPathX / riverSlope: the river's own winding course, fixed in the world. bendX(d, z) now draws a
    thing across from the line you are heading along (straight under you: the lanes, hazards and collisions are untouched,
    still course space); the GLSL (BEND_GLSL, the water, the falls) is made from PATH, with uPath0 = where you are (set in
    update). A turn every ~280 m, up to ~30°, none tighter than 166 m across. The sky and the far mountains turn with
    riverHeading(dist) (and the day's sun glitter on the water with them). Saturday's run and the town stay straight.
  - farMaterial: the far mountains are a backdrop, their depth squeezed into the last sliver before the sky, so the river
    always draws in front of them. 14 rondavels (was 7) out to ±80°, and a range of jagged mountains in the haze behind
    them (unlit, the look's haze a little cooler: right at every hour).
  - The waterfall across the river: clear between its streaks, a ragged soft foot, thinning away from 22 m to 2 m from the
    camera; the lens spray: 16 clear drops with bright rims scattered by hand, running down, a wash from above (reduced
    motion: a fade only).
  - The walls: the sandstone's fine bedding and grain over the picture up close (fades out by 90 m).
  - bendSprite (the swimmers' faces) and the spray particles follow the bend; the camera's look at your island too; the
    camera's bank into a bend full from 12 m across 60 m ahead (was 8).
  - The sunlight turns with 0.6 of the heading (it moves on the walls as you wind through, never from straight ahead).
- Tested: River nonsense 32/32 and Saam gly 29/29 (serve2 :8318 + matchhost :8791), unit 531/531, the ride's speed at
  phone speed (CPU x4, mid) 59 fps on average; rides recorded and looked at frame by frame (bends, the lake, the falls,
  the pass through a fall, night and sunset, the animals close up). A before/after clip for him:
  `~/Desktop/Studies/Stapel/Stapel app (Google Play)/River bends 29 Oct/River bends before-after.mp4` (16 s, sent only on
  his "open it").
- Released the same hour as 1.24.1 on his "Yes please" / "Release" (next entry).

### 29 Oct 2026 ~12:35 — 1.24.1 RELEASED: the website, the old address and Play internal 12401 (his "Release")
- His words: "Yes please" (to "release it as 1.24.1 to the website and Play internal testing") and then "Release".
- VERSION 1.24.1 (js/config.js + sw.js); check-all quick ALL CLEAR (game 531, server 315, boot); security scans clear
  (pages-dist, js/rivier, the changed files, the Play folder); commit c47aa3c pushed to origin/rivier/1.20 and
  claude/trusting-hopper-26qcax (the old address serves stapel-v1.24.1).
- The site: `~/deploy-stapel-1.24.1.sh` (the site only: no server change, the Worker stays 8643046e, live matches
  untouched): stapelspel.pages.dev serves stapel-v1.24.1.
- Play: internal testing 12401 (1.24.1) since 12:35 (notes af + 5 English; the usual two warnings: no deobfuscation file,
  no native debug symbols; devices unchanged). Production stays 12300 (1.23.0). Files: `Stapel app (Google Play)/Upload
  1.24.1 internal/` (aab, notes, README), `Stapel-1.24.1-toets.apk` (1.24.0's in Older builds).
- check-all live ALL CLEAR (board-live's hidden row removed).
- A 1.24.0 phone and a 1.24.1 phone in one Duo ride: the room ends at once with "update" (protocol 3), as before.
