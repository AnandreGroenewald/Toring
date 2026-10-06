# Stapel

**Stapel hoog. Staan sterk.**

’n Gratis Afrikaanse blok-stapel-speletjie vir jou foon, reg in die blaaier.
Elke dag is daar een **Daaglikse Toring**: dieselfde blokke en dieselfde weer vir almal, en jy kry een poging.
Bou so hoog as wat jy kan, land blokke reg in die middel vir ’n **Perfek!**, oorleef die weer, en bly bo die stygende water.
Deel dan jou toring op WhatsApp.

A free Afrikaans block-stacking phone game that runs in the browser.

## How it plays

| | In Stapel |
| --- | --- |
| **Daily tower** | One *Daaglikse Toring* per day, seeded from the date. Everyone gets the same blocks and weather and one scored try. There's a streak (*reeks*), a countdown to the next tower, and an emoji share line for WhatsApp. *Oefen* (practice) is unlimited and doesn't count. |
| **One-tap stacking** | Tap anywhere to drop; a white outline shows where the block will land (red when it would fall). A dead-centre landing flashes **Perfek!**, snaps the block and sets everything under it like cement. Perfeks in a row build a combo with rising chimes and bonus points. You have four hearts, and every third Perfek wins a lost one back. |
| **The crane** | A yellow crane swings each block on a rope. The tower climbs past Table Mountain into the stratosphere, with height shown in metres. |
| **Weather and the flood** | Weather hits while you build: 💨 wind, 🌪️ whirlwind, 🌧️ rain, ⛈️ lightning, 🌨️ hail, 🌫️ fog, ☀️ heatwave and 🌈 rainbow. The flood line (*vloedlyn*) keeps rising, and if the water passes the top of your tower, the game is over. |
| **Wobble** | Real Matter.js physics. The top of the tower wobbles, creaks and can topple, while deeper blocks set like cement. A collapse costs one heart, and the crane waits for the tower to settle before the next block. |

Share line example:

```
Stapel #1 🏗️ 37,5 m
⭐ 1 240 · 🎯 7× Perfek · 🔥 4
🟩🟩🟨🟩🟩🟥🟩🟨🟩🟩
🟩🟨🟧🟩🟥🌊
Weer: 💨🌧️🌈⛈️
Stapel hoog. Staan sterk.
https://anandregroenewald.github.io/Toring/
```

## Publish on GitHub Pages

The game is a static site with `index.html` at the repository root. There's no build step.

1. Merge into `main`.
2. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then **`main`** and **`/ (root)`**.
3. The game appears at `https://<user>.github.io/Toring/`.

All URLs are relative, so it also works from any other static host or sub-path. It installs as an app (PWA) and plays offline after the first visit.

## Borge / Sponsorship

Stapel stays free and is funded by monthly sponsorships, sold on `adverteer.html`:

- **Jou naam op die blokke** (name on the blocks): the business name is printed on blocks in every tower, daily and practice. About every 2nd or 3rd name-capable block carries a name (`SPONSOR.blockShare`, 0.4); sponsors take turns in a fixed order per tower, so each gets a fair share. Cubes never carry a name, and pillars only carry short ones.
- **Die groot advertensiebord** (the billboard, R1 499 per month): one sponsor's name, tagline and web address on a sign on the island beside the tower. It is seen at the start of every game and in the zoomed-out tower view at the end.

The menu also has a pinned card for the owner's own business, sportscard.co.za, labelled "Advertensie". Its text lives in `sponsors.json`, which can also hold sponsors arranged by hand. The WhatsApp share text never mentions sponsors.

With the backend on, the game also sends **anonymous counts** when a game ends (how often each sponsor's name was on a block, whose billboard stood on the island, daily or practice; never anything about the player) so sponsors can get a monthly report from `admin.html` (Statistiek tab), and the daily results card says how the player did against everyone else that day. See `server/README.md` and `privaatheid.html`. Nothing is sent while `SPONSOR_API_URL` is empty.

Sales are off until the backend is running. To switch them on, follow `server/README.md` (Paystack plans, then the Cloudflare Worker and D1 setup), then set `SPONSOR_API_URL` in `js/sponsorConfig.js`. That one value turns on the "Adverteer hier" link on the menu, the sign-up form and the "Jou advertensie hier!" text on an empty billboard. Until then the billboard shows the Stapel logo.

## Tech

- **Phaser 3.90.0** with its built-in **Matter.js** physics, saved in `lib/phaser.min.js` (MIT; see `lib/LICENSE-phaser.md` and `lib/THIRD-PARTY-NOTICES.md`).
- Plain ES modules with no bundler and no runtime dependencies.
- No image or sound assets. Blocks, crane, island, sea and sky are drawn in code, weather is shown with emoji, and every sound is a short WebAudio synth.
- Physics runs at a fixed 60 Hz step, so behaviour is the same on 30/60/90/120 Hz screens. Everything random that weather does to the tower (gust strength, lightning, hail) comes from seeded per-event streams (`js/core/weatherplan.js`) and runs on that step, and a tap releases the block where it was at the moment of the tap, not at the last frame. The drop distance is the same on every screen size. Together that keeps the daily fair.
- Portrait layout, 720 logical px wide, scaled to fit any phone. Under 2 MB in total, about 1.2 MB of which is Phaser.

```
index.html            entry point (GitHub Pages serves it from the repo root)
css/style.css         DOM menus, results and share screens
js/main.js            boots Phaser and wires the UI, storage and scenes together
js/config.js          every tunable number (physics, crane, scoring, water, weather)
js/audio.js           WebAudio sound synths + vibration
js/core/              pure logic: seeded RNG, daily date/seed, block & weather sequence,
                      storage/streaks, share text, Afrikaans strings, formatting, event bus
js/game/              blocks, crane, water, island, weather, effects
js/scenes/            BgScene (sky, Tafelberg, clouds), GameScene (core loop), HudScene
js/audience.js        anonymous counts + daily percentile (network side; only with SPONSOR_API_URL)
js/ui/dom.js          menu, how-to, stats, pause and results overlays
sw.js, manifest.webmanifest, icons/   offline support and home-screen install
tests/                node unit tests for the core logic
```

## Develop

```sh
npx http-server -c-1 .     # or any static server; open http://localhost:8080
npm test                   # node --test, no dependencies
```

Useful query parameters:

| Parameter | Effect |
| --- | --- |
| `?debug=1` | Shows an FPS meter and turns on the test parameters below. A debug session keeps its own storage (`stapel.v1.debug`), so it never touches the real daily, streak or stats. |
| `?date=YYYY-MM-DD` | With `?debug=1`: play another day's tower. |
| `?auto=0.2` | With `?debug=1`: autoplay with a 20% aim-error rate. |
| `?seed=abc` | With `?debug=1`: fixed seed for practice (practice seeds live in their own namespace, so they never replay a daily). |
| `?nosw=1` | Skips the service worker. |

When you release a change, bump `VERSION` in `js/config.js` and the cache name in `sw.js` (a unit test checks they agree, and that every module is precached and preloaded). Changes to `js/core/sequence.js`, `js/core/weatherplan.js` or the physics change every daily tower: ship them before local midnight so a day never has two versions.
