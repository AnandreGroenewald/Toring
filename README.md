# Stapel

**Stapel hoog. Staan sterk.**

’n Gratis Afrikaanse blok-stapel-speletjie vir jou foon, reg in die blaaier.
Elke dag is daar een **Daaglikse Toring**: dieselfde blokke en dieselfde weer vir almal, en jy kry een poging.
Bou so hoog as wat jy kan, land blokke reg in die middel vir ’n **Perfek!**, oorleef die weer, en bly bo die stygende water.
Deel dan jou toring op WhatsApp.

A free Afrikaans block-stacking phone game that runs in the browser.

## How it plays

| Idea borrowed from | In Stapel |
| --- | --- |
| **Wordle** | One *Daaglikse Toring* per day, seeded from the date. Everyone gets the same blocks and weather and one scored try. There's a streak (*reeks*), a countdown to the next tower, and an emoji share line for WhatsApp. *Oefen* (practice) is unlimited and doesn't count. |
| **Stack** | One-finger play: tap anywhere to drop. A dead-centre landing flashes **Perfek!** and snaps the block. Perfeks in a row build a combo with rising chimes and bonus points, and every 5 in a row restores a heart. |
| **Tower Bloxx** | A yellow crane swings each block on a rope. The tower climbs past Table Mountain into the stratosphere, with height shown in metres. |
| **Tricky Towers** | Weather hits while you build: 💨 wind, 🌪️ whirlwind, 🌧️ rain, ⛈️ lightning, 🌨️ hail, 🌫️ fog, ☀️ heatwave and 🌈 rainbow. The flood line (*vloedlyn*) keeps rising, and if the water passes the top of your tower, the game is over. |
| **Jenga** | Real Matter.js physics. The top of the tower wobbles, creaks and can topple, while deeper blocks set like cement. |

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

## Tech

- **Phaser 3.90.0** with its built-in **Matter.js** physics, saved in `lib/phaser.min.js` (MIT, see `lib/LICENSE-phaser.md`).
- Plain ES modules with no bundler and no runtime dependencies.
- No image or sound assets. Blocks, crane, island, sea and sky are drawn in code, weather is shown with emoji, and every sound is a short WebAudio synth.
- Physics runs at a fixed 60 Hz step, so behaviour is the same on 60/90/120 Hz screens. The drop distance is the same on every screen size, which keeps the daily fair.
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
| `?debug=1` | Shows an FPS meter. Combined with `?date=YYYY-MM-DD`, it previews another day's tower without saving stats. |
| `?nosw=1` | Skips the service worker. |
| `?auto=0.2` | Autoplay with a 20% aim-error rate, for testing. |
| `?seed=abc` | Fixed seed for practice. |

When you release a change, bump `VERSION` in `js/config.js` and the cache name in `sw.js`.
