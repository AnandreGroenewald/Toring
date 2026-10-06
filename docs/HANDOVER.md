# Stapel — handover for the next agent

**Read this first, then `docs/SPEC.md` (game architecture) and `docs/SPONSORS-SPEC.md` (sponsorship system).**
Branch: `claude/trusting-hopper-26qcax` (develop and push here; don't open a pull request unless the owner asks).
Repo: `AnandreGroenewald/Toring`. Owner: Anandré Groenewald.

## 1. What the owner asked for

> Build "Stapel", a free Afrikaans block-stacking phone game that runs in the browser. Tagline: "Stapel hoog. Staan sterk."
>
> THE FEEL (borrow from proven hits)
> - Wordle: one Daaglikse Toring a day, the same blocks and weather for everyone, one scored try, a streak, a countdown to the next tower, and an emoji share line for WhatsApp.
> - Stack (Ketchapp): instant one-finger play, a bright "Perfek!" flash and combo bonus when a block lands dead centre.
> - Tower Bloxx: a crane up top, the tower growing tall, height shown in metres.
> - Tricky Towers: events hit your tower while you build, and a line you must stay above.
> - Jenga: the wobble and tension of a tall tower.
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
| Brand names | Other games' names must not appear in the game or public docs. The README and all game code are clean now (T5 reworded the last comments). Only the internal agent prompts in `docs/workflows/` and the owner's brief quoted above still name them. |
| Legal | Third-party MIT notices are in `lib/THIRD-PARTY-NOTICES.md`. The owner was told to do a CIPC trademark search on "Stapel", fill in and lawyer-check the legal templates, register an Information Officer (POPIA), and ask an accountant about tax. |

## 2. Current state (at handover)

<!-- STATUS-START -->
### Base game: playable and polished, needs its final QA pass
- Everything in the original brief is built: daily tower, practice, crane, physics, Perfek/combo, 8 weather types, rising flood line, cement freeze, wobble, results, streak, countdown, share text, PWA/offline, WebAudio, Afrikaans UI.
- History: 6 parallel module agents → integration agent (zero console errors) → **six-lens review (74 findings, see `docs/review-findings.md`)** → a fixer agent applied the fixes.
- **The fixer was in its final end-to-end check when the container restarted, so its per-finding report was lost.** Its code changes are all committed. Notable ones:
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
- **T5 done:** in-game sponsorship. Sponsor names are drawn into the block textures; the cache is bounded and named textures are dropped at game end. The island billboard sits right of the base and floats up with the flood, so the reveal always shows it. The menu has the pinned sportscard.co.za card and, only when sales are on, an "Adverteer hier" link. The feed loads in the background and never delays startup. Everything new is precached, and the version is now `1.1.0`. The README has a sponsorship section.
- Tests: **`npm test` 126/126** and **`cd server && npm test` 92/92** pass (run `npm install` in `server/` first for the miniflare smoke test). Headless checks at 412×915 had zero console errors, covering the menu, a practice game with a test feed (names and billboard), the reveal, no sponsors, and sales on with an empty billboard. The game payload is about 1.8 MB.
- Not yet reviewed: the server (security, payment edge cases), `admin.html`, and the UX and legal wording (T4). The server does not auto-delete ended sponsors' contact data; the owner removes it on the admin page.
<!-- STATUS-END -->

## 3. Remaining work, in order

<!-- TODO-START -->
Each step should end green (`npm test`, `cd server && npm test`, a headless playthrough with zero console errors) and be committed and pushed.

- **T1. Base-game QA pass.** Treat `docs/review-findings.md` as a checklist: for every finding, check in the code and the browser whether it's fixed now, and fix anything still open (all critical/high first). The fixer's lost report means none are confirmed yet. Also:
  - Play full games at 412×915 and 360×640.
  - Verify the daily is deterministic: same scripted taps should give identical weather effects.
  - Restart scenes 6+ times and check for leaks.
  - Test under a sub-path: serve `/home/user` and open `/Toring/`.
  - The prompt for this pass is the `qa` agent in `docs/workflows/2-review-fix-qa.js`.
  - Include the T5 sponsor features in those games: names on blocks, the billboard (it floats with the flood) and the menu card. A test feed can be injected with Playwright's `page.route('**/sponsors.json', ...)`.
- ~~T2. Core sponsor logic~~ **Done** (see section 2).
- ~~T3. Legal templates~~ **Done** (see section 2). The owner fills in the placeholders.
- **T4. Sponsor reviews and fixes:**
  - security (forged or replayed webhooks, activating without paying, moderation bypass with unicode, admin token, XSS, CORS)
  - payment state machine (renewals when one email has several sponsorships, missed webhooks, refunds and chargebacks, premium-slot races, month arithmetic)
  - UX, Afrikaans and legal completeness
  - The prompts are in `docs/workflows/3-sponsors-backend.js` (Review and Fix phases).
- ~~T5. In-game sponsor integration~~ **Done** (see section 2). It also reworded the code comments that named other games and added the README section.
- **T6. Final pass.** Full playtest plus screenshots. Confirm the **game payload** (what a player downloads: `index.html`, `lib/`, `js/` without `js/pages/`, `css/style.css`, `icons/`, `manifest`, `sw.js`) stays under 3 MB. It was about 1.8 MB after T5 (that count includes `sponsors.json`); `docs/`, `server/` and `tests/` are never loaded by the game. Check the README's sponsorship section is still accurate, then hand the owner the checklist in section 4.

**Prompt to give the next agent:** "Continue the Stapel project in this repo on branch `claude/trusting-hopper-26qcax`. Read `docs/HANDOVER.md` first and work through its remaining-work list T1–T6 in order, committing and pushing after each step."
<!-- TODO-END -->

## 4. Things only the owner can do

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
