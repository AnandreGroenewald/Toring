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
- **1.12.0 (9 Oct 2026; LIVE ~22:45 on the owner's "Great please proceed"): smooth watching, Blok vir Blok rondtes, the sea, height zones, ranks, emojis, Nog 'n kans.** The owner passed on: the guys at work love Blok vir Blok but it is "a little boring" without any features, and it must be "fair"; "my side is perfect, but as soon as they play it lags on my screen, not on their screen and visa versa"; "please check the physics and balancing because something does not add up… the water need to indicate clearly that block are beneath the sea"; "after 50 meter it needs to show a different picture then after 100 meter then 200 meter etc."; then ranks like CS:GO (one per challenge, "Gold Nova 2 — 70%", lose points on a loss, "a lot of ranks"; design proposed, waiting for three answers) and "I need emojis" (asked: emoji reactions in a match?).
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
    - **1.14 real money** (the owner: "the main focus is making a few bucks… like on 8 ball pool"): Google sign-in + a server wallet (bought coins safe, never faked or lost), coin packs through Google Play Billing (required for in-app digital goods; Google keeps 15%), PayFast on the website, odds on paid gifts (Google rule), no cash-out ever (keeps coin matches out of gambling law), the Play target audience 13+ (paid random gifts can't target children: the owner to confirm the Play Console setting), store listing / Data safety / privacy updates; the Play payments profile (bank, tax) is the owner's to set up.
  - **Live 9 Oct 2026 ~22:45:** D1 migration 0004 run (the `retried` column confirmed), Worker deployed (version 8abc1066), pushed (`174d58c`), Pages deployed (`stapel-v1.12.0` on both addresses). `check-all.sh full` ALL CLEAR before (30 browser tests; two players: identical towers over 31 turns, rounds the same; the watcher's jump 0-2 px, one 16 px in a wind round), `check-all.sh live` ALL CLEAR after (a live Blok vir Blok match identical, the lobby per mode, the board round trip: 10 players, the hidden test entry removed). The Play app is still 1.11.0: an app player and a web player play without rounds until 1.12.0 (11200) is uploaded (needs the owner's OK).
  - **To go live (with the owner's OK):** run the D1 migration 0004 once, then the Worker (rooms must know protocol 4 and relay `go`/`visit`/`k`/`emote`; the board takes `retry`), then push, then Pages. The Play app needs a new build (1.12.0, 11200) for app players to get rounds; until then a web player against an app player plays without rounds.
<!-- STATUS-END -->

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

**All of T1–T6 are done**, and so are the visitors (`docs/CHARACTERS-SPEC.md`, version `1.6.0`), the Uitdagersreeks (`docs/CHALLENGE-SPEC.md`) and coins, power-ups and ranks (`1.8.0`). English is done (`1.9.0`). Next with the owner: production on Google Play (an English store listing, and maybe an English privacy page, first). Google lets this account apply for production only after **12 testers have been opted in to the closed test for 14 days in a row**: their Gmail addresses go on the closed test's email list (Play Console → Test and release → Closed testing → Testers), then they join through `https://play.google.com/apps/testing/com.lekkerlocal.stapel`. Later: biomes (height bands and a daily world), sponsor sales through PayFast, and iOS. What is left beyond that is section 4 (owner-only steps). If the owner asks for more, start with the medium and low findings in `docs/review-findings.md` that were not re-checked one by one, or tune the visitors (`VISITOR` in `js/config.js`) after playtests on real phones.
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
