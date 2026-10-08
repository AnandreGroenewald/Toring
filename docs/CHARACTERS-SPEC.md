# Stapel: visitors ("Besoekers") design spec

The owner wants random character events between blocks: a **monkey that jumps on and knocks 1–2 blocks off**, a **clown that puts a block on**, and a **thief who steals 4 blocks**. This spec turns that into a fair, fun feature that fits the existing game. Read `docs/HANDOVER.md` first.

## Characters

| id | Afrikaans name | Emoji sprite | What happens | Can the player stop it? |
| --- | --- | --- | --- | --- |
| `monkey` | **Blouaap** (vervet monkey) | 🐒 | Leaps in from a palm on the island, or swings in on a rope from the crane. Lands on the tower top, bounces twice, and shoves the **top 1–2 dynamic blocks** sideways with a physics impulse. They may or may not fall, which is real wobble tension. **From 1.7.6** (the owner: "people need to think OH NO"): he comes with an alarm, fidgets before he jumps, then hurls the top block into the sea and stamps on the next 1–2. **From 1.7.9** (the owner's idea): he waits on his rope for the player's next block. A Perfek scares him off, and he says "Ek sal terug wees!" in a speech bubble. Anything else, or no drop within 10 s, and he strikes. | **Yes:** tap the monkey during its ~1.5 s run-up to shoo it ("Sjoe! Weg is hy!"). |
| `clown` | **Hanswors** (clown) | 🤡 | Walks in honking and drops a **bonus block** onto the tower top. It's a gift that adds height and points, but it's placed **slightly crooked** (a few px off-centre and a small tilt), so it can wobble. The gift block is drawn as a striped "circus" block. **From 1.7.6** (the owner's idea): he brings **1–4** blocks and stacks them flush on top, and the tower under them and the blocks themselves set as cement: a new foundation. | No (it's a gift). Tapping it makes it honk and juggle. |
| `thief` | **Skelm Sakkie** (thief) | 🦹 (eye mask, swag bag) | Sneaks up the tower, then climbs down carrying the **top up to 4 non-frozen blocks** away in his bag. The tower gets shorter, so the flood gets closer. | **Yes:** tap him while he climbs (~2 s) to catch him: "Gevang! Jy kry jou blokke terug." If he gets away: "Skelm Sakkie het 4 blokke gesteel!" |

Use **emoji as the character sprites**: big Phaser Text objects (around 72–96 px) animated with tweens for hop, walk, bounce and squash. This matches "emoji for weather", is cheap, and looks cute on every phone. Props (rope, swag bag, honk "💨" puffs, striped gift block) are drawn in code. Keep the characters friendly, not scary: the thief is cartoonish and comic.

## Rules (fairness first)

- **Same for everyone in the daily.** Visitor events come from the seeded sequence: add a new rng fork, e.g. `fork('visitors')` in `js/core/sequence.js` (or a sibling module like `js/core/weatherplan.js`). That way the **existing block and weather streams don't change**, and the golden test still passes. The new schedule gets its own test.
  - `{ type, at: blockIndex, side: -1|1, strength }`
  - None before block 8.
  - On average one every ~12–18 blocks.
  - Never on the same block a weather event starts.
  - At most one visitor on screen.
  - Thief at most once per game.
- **Driven by the fixed physics steps**, not wall-clock frames, like the weather (see `weatherplan.js`). That keeps it identical on 30/60/120 Hz screens. Any randomness inside an event comes from that event's seeded fork.
- **Tap targeting.** While a stoppable visitor is on screen, a tap that hits it (generous hit area, ≥ 72 px) shoos or catches it and does **not** drop the block. Any other tap drops as normal. The landing preview and the drop column must never be covered by the visitor's tap area while you need to aim. Pick spawn sides and positions accordingly.
- **No lives lost to visitors.** Blocks the monkey knocks into the sea, or the thief takes, cost **no hearts**; it wasn't the player's fault.
  - The score keeps max height reached, so nothing earned is lost.
  - The real cost is a shorter tower (flood pressure) and lost combo momentum. The combo is kept.
- **Grid and share:** the blocks keep their original 🟩/🟨 ratings in the grid. The share text gets a visitors line next to the weather, e.g. `Weer: 💨🌧️ · Besoekers: 🐒🦹✋`, with ✋ added when you caught the thief.
  - Update `js/core/share.js` and its tests deliberately; the rest of the format is unchanged.
  - The results screen gets one line, e.g. "Skelm Sakkie het 4 blokke gesteel" or "Jy het Skelm Sakkie gevang! 👮".
- **Frozen (cement) blocks are never touched**, only the dynamic top part.
- **Practice** uses the same rules with its own seed.
- **Idle/menu attract mode** can show the clown occasionally just for fun. No gameplay effect.

## Presentation

- **Arrival banner** in the existing HUD banner style, short: "🐒 Blouaap!" / "🤡 Hanswors!" / "🦹 Skelm Sakkie!", with a one-line hint: "Tik hom om hom weg te jaag!" / "’n Geskenkie!" / "Vang hom!".
  - The banner must not cover the drop column (follow the HUD rules in `HudScene.js`).
  - For a first-time player, the first visitor of each type gets a coach hint: reuse the first-game hint system.
- **Sounds** (procedural, in `js/audio.js`, under 1 s, voice-limited, honouring the sound toggle and pause):
  - monkey "oe-oe-aa-aa" chatter
  - clown honk-honk plus a kazoo slide
  - thief sneaky pizzicato plus a whistle when he escapes
  - "gevang" fanfare when caught
- **Forecast teaser:** the menu's daily forecast and the results' "Môre:" teaser may show visitor emoji too ("Besoekers vandag: 🐒🤡"). This is a strong come-back hook.
- **Reduced motion:** simpler moves, no screen shake.
- **Skild (1.8.0, a power-up in Oefen):** with the shield on, the next Blouaap or Skelm Sakkie arrives, bounces off with a 🛡️ and leaves (outcome `blocked`); the shield is used up.
- **Visitor styles (1.8.0, Uitdagersreeks):** a Blouaap or Skelm Sakkie sent by the other player wears that player's style on top of the emoji: 🧢 pet, 🕶️ sonbril, 🎩 hoed or 👑 kroon (`ACC_FIT` in `js/game/visitors.js` places each one per visitor). It turns, squashes and flips with him.
- **Text:** all new Afrikaans strings go in `js/core/strings.js`, with natural, playful copy, and their English twins in `js/core/strings.en.js` (same keys).

## Testing and definition of done

- `npm test` green, with new tests for:
  - schedule determinism and the rules above
  - the share visitors line
  - "no hearts lost to visitors"
  - the thief taking at most 4 non-frozen blocks
  - the clown block being added to the tower and the grid
- `cd server && npm test` green.
- **Headless playthroughs** at 412×915 and 360×640 (Playwright with SwiftShader; see `docs/HANDOVER.md`) with **zero console errors**:
  - force each visitor type via a debug-only hook, e.g. `?debug=1&visitor=thief` or `window.__stapel.scene.spawnVisitor('thief')`
  - check shoo and catch taps work, and that a normal tap elsewhere still drops
  - screenshot each visitor
- **Determinism check:** two runs of the same daily with the same scripted bot give identical visitor schedules and outcomes.
- Add new modules to the `sw.js` precache and `index.html` modulepreload, and bump `VERSION` and the SW cache name together (`tests/precache.test.js`).
- **Ship before local midnight** (it changes every daily tower). Update `README.md` (one line) and `docs/HANDOVER.md`.
- Commit and push to `claude/trusting-hopper-26qcax`. No pull request unless the owner asks.
