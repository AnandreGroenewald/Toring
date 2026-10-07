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

**All of T1–T6 are done.** What is left is section 4 (owner-only steps). If the owner asks for more, start with the medium and low findings in `docs/review-findings.md` that were not re-checked one by one.
<!-- TODO-END -->

## 4. Things only the owner can do

0. **Before deploying the Worker:** re-run `schema.sql` (adds `payment_reversals` and `alerts`), and set `IP_HASH_SALT` as a secret. Act on the "Aandag nodig" items on `admin.html` (refund slot-taken payers in the Paystack Dashboard). Ask the lawyer to check the new terme.html clauses (full-slot refund, manual approval within [[1 werksdag]], automatic dispute handling).
1. **Paystack:** create and verify a business account. Create two **monthly ZAR plans**: one for name-on-blocks (any amount the owner chooses) and one for the billboard at R1 499 = 149900 cents. Copy the secret key and both plan codes.
2. **Cloudflare:** create a free account, then follow `server/README.md` (`wrangler login`, `d1 create`, schema, secrets, deploy), and point Paystack's webhook at `https://<worker>/paystack/webhook`.
3. **Go live:** set `SPONSOR_API_URL` in `js/sponsorConfig.js`. That one value switches on the "Adverteer hier" link, the sign-up form and the "Jou advertensie hier" billboard. Test first with Paystack test keys and test cards.
4. **Contact email:** send the public contact email, which goes in `SPONSOR.contactEmail`.
5. **Legal templates:** fill in the `[[placeholders]]` in `terme.html` and `privaatheid.html` (legal name, address, registration number, Information Officer), get them reviewed, then remove the template banner.
6. **GitHub Pages:** merge into `main`, then Settings → Pages → Deploy from branch → `main` / root.

## 5. How to work on this repo

- No build step. Serve the root statically: `npx http-server -p 8080 -c-1 .`, then open `index.html?nosw=1&debug=1`.
- Tests: `npm test` (game core, node --test). Sponsor backend: `cd server && npm test`.
- Debug params (only with `?debug=1`, which uses separate storage `stapel.v1.debug` so it never touches real stats): `date=YYYY-MM-DD`, `auto=<aimErrorRate>` (autoplay), `seed=<practice seed>`. `?nosw=1` skips the service worker.
- Test hooks: `window.__stapel = { game, bus, store, ui, audio, scene }`, plus `scene.getState()`.
- Headless browser (cloud containers): Playwright with Chromium args `['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']`, mobile context `{ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }`. Headless fps is only 11–15 because rendering is in software; judge performance by CPU ms per frame, not fps.
- Every release: bump `VERSION` in `js/config.js` **and** the cache name in `sw.js` (a test checks they agree and that every module is precached). Changes to `js/core/sequence.js`, `js/core/weatherplan.js` or the physics change every daily tower, so ship them before local midnight; `tests/sequence.test.js` has a golden snapshot of daily #1 that must be updated deliberately.
- All player-facing text is Afrikaans and lives in `js/core/strings.js`. Numbers use `js/core/format.js` (decimal comma, non-breaking spaces).
- The `docs/workflows/*.js` files are the multi-agent workflow scripts used so far (Claude Code Workflow tool). They're useful as prompts even if you work solo. `<SCRATCH>` in them was a temporary directory.
- Egress in the cloud container used so far blocked paystack.com, developers.cloudflare.com, cdn.jsdelivr.net and sportscard.co.za; the npm registry and web search worked.
