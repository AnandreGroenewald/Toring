# Stapel: Uitdagersreeks (head-to-head) design spec

The owner asked for a "challenger series": you are put against someone random, you both stack the same blocks at the same time, and reaching a height first lets you do damage to the other player. You can also challenge a friend. This spec turns that into a mode that is fair, fun and cheap to run, and that works from day one with very few players online. Read `docs/HANDOVER.md` and `docs/CHARACTERS-SPEC.md` first: the attacks reuse the visitors.

## The match

| | Rule |
| --- | --- |
| **Same tower** | Both players get the same blocks and weather: a fresh seed per match in its own namespace (`duel/<seed>`). The scheduled visitors are off in a match: a visitor only ever comes as a punishment, so you always know who sent it. |
| **Height marks** | 10, 20, 30 and 40 m. Whoever reaches a mark first **chooses a punishment** for the other tower: Blouaap 🐒 (throws the top block into the sea and stamps on the next ones), Skelm Sakkie 🦹 (steals up to 4 top blocks), Mis 🌫️ (3 blocks of fog) or Hittegolf ☀️ (3 blocks of a racing crane). They have 7 s, while their tower keeps going; otherwise the mark's default goes: 10 m Blouaap, 20 m Skelm Sakkie, 30 m Blouaap, 40 m Skelm Sakkie. The defender stops Blouaap by landing a Perfek and Skelm Sakkie with a tap, as usual. A punishment never costs a heart (visitor rules). Height means the best settled height so far, the same number as the results. |
| **Winning** | The first to **50 m** wins. If your tower falls first (hearts gone or the flood), the other player wins. Quitting counts as a loss. The referee takes reports in the order they arrive, so there are no draws. |
| **Pausing** | Your own tower pauses as usual, but the other player keeps building. |

## Two modes (1.11): Wedloop and Blok vir Blok

Testers said they didn't notice they were playing someone. 1.11 shows both players at the top in either mode (name and hearts: you left, them right) and adds a second mode; the screen above the buttons chooses one, and the choice is kept (`stapel.v1` `duel.mode`).

- **Wedloop** (`'race'`): the match above. The race track on the right edge is back, a little bigger than in 1.9, with both names and how far each is to 50 m (a percentage), and "Jy is voor!" / "Anna is voor jou!" when the lead changes. A height report carries the player's hearts (`state.lives`, relayed as `opp.lives`; older games send none and their pill shows only the name).
- **Blok vir Blok** (`'turns'`, the owner's "you drop one, I drop one"): **one tower, a block each in turn**.

| | Rule |
| --- | --- |
| **Turns** | The room draws who starts. Each turn has 10 s to aim (then the block drops where it is). The crane starts each turn's swing from the same state in both games. |
| **Hearts** | 3 each. A turn that loses blocks (the dropped one missed, or it knocked the top off) costs that player one heart, at most one per turn. No hearts come back. The first out of hearts loses; quitting, or a turn that never ends (45 s on the server), loses too. After 160 turns: the most hearts, then the most Perfeks, then whoever went second. |
| **Joker** | 5 Perfeks in a row of your own blocks (the other player's in between don't count) earn a joker: choose a sabotage for the other player's next block: Mis 🌫️, Hittegolf ☀️ or Reën 🌧️ (7 s, then Mis). It comes with their first block put on the crane after the choice, but never on a round's turn (it waits for that player's next turn without one). No flood and no Hanswors log. |
| **Rondtes (1.12)** | Testers found the mode "a little boring" without anything happening, and it had to stay fair. From turn 7 a **round** brings the same weather (wind, rukwinde, reën, storm, hael, mis, hittegolf) or visitor (Blouaap, Skelm Sakkie) to **both** players on back-to-back turns: exactly the same strength, direction, gusts, lightning and hail (the round's seeded stream, keyed by the round). Rounds are an odd number of turns apart, so whoever faced the last one first faces the next one second. Stages by turn number (`TURNS.rounds`): 7 "Moeiliker!" (wind, reën, mis, hittegolf, Blouaap; 3 or 5 turns between rounds), 19 "Nog moeiliker!" (everything, Skelm Sakkie at most 3 times; 1 or 3 between), 35 "Op sy moeilikste!" (1 between). The referee plans them from the match seed (`turnRounds`) and every `turn` message carries this turn's round (`ev`) and the round the next turn begins (`nx`: "Volgende rondte: … vir albei!"). Both players' banners say who gets it ("Anna kry Hael", "Hael: nou jy!"). **Blouaap** waits on his rope for the turn's block (no time limit): a Perfek scares him off, anything else and he strikes (his damage costs no heart, as in the daily). **Skelm Sakkie** climbs while the block waits on the crane (it can't drop until he's caught or gone; the aim time starts after him): tap him and he's caught, else he takes the top loose blocks (no heart). **Beating the round's visitor gives a heart back** (up to 3; `TURNS.visitorHeart`). The weather shows from the turn's start while the player aims (the held tower is never pushed), and everything that moves the tower counts from the drop from the same state in both games (`Weather.turnDrop`); hail falls 0.3-2.6 s after the drop, a storm strikes once, 2 s after it; hail goes at every turn's end; a round's turn may settle for up to 9 s. Rounds run only when both games know them (protocol 4); a match with a 1.11 game plays as before, and the 1.12 player is told so. Robot Rikus plays rounds too (he catches Skelm Sakkie 6 times in 10, by the seed). |
| **Sync** | The game whose turn it is plays the block (authority). It sends where the block was let go (`drop`: exact numbers, plus the crane's swing time) so the other game shows the same fall, and when the tower is at rest a report (`settled`) of every block that wasn't cement: exact position and angle, which of them set as cement now (all but the newest 5), ratings, and the blocks lost. Both games apply that report the same way (`GameScene.applySnapshot`) and hold the tower still until the next drop, so every drop starts from the same tower in both. A block one game lost but the report has comes back; the other way round, it goes. |
| **Watching (1.12)** | Testers: "my side is perfect, but as soon as they play it lags on my screen". The watching game's crane swung on by itself and the drop came a round trip later, so the block jumped back (30-90 px at 0.1 s each way). Now the game whose turn it is says when its turn began (`go`), and the other game shows the turn 0.25 s after that (more after a drop that still came late, up to 0.7 s; never less in a match): the drop is there before its crane gets to the moment it was let go, so the block leaves the hook exactly there, and the turn's report carries `k`, the physics steps from the drop, so it is applied at the same step of the replay. Skelm Sakkie on the watching game waits for `visit` (`{ what: 'caught' | 'stole', at, idx }`: what happened at which moment of his visit, and the blocks he took) and does the same at the same moment. The watching player's own next turn starts when the replay has ended (at most 4 s later). A 1.11 game sends no `go` or `k`: its turns show 0.35 s after they came, and its report is applied when the tower here is calm. Measured with 0.1 s each way: jump 0-2 px (was 32-89), no late drops; with uneven delays up to 0.4 s one early jump, then the buffer grew and the rest were smooth. |
| **Referee** | `js/core/turns.js`: on the server for a live match, in the game against Robot Rikus (who plays by autoplay, with a think time, and picks his sabotage at once). Games older than protocol 3 are told a Blok vir Blok room is gone; protocol 4 (1.12) adds `go`, `k`, `visit`, the rounds and `opp.v` in the start (each game hears the other's protocol). |

## Opponents

1. **Random, live** (`🎲 Soek ’n teenstander`): the server pairs two players who are looking. It searches for up to 20 s. If nobody is there, the player gets a **recording** of a real player's recent match (the same seed they played), or the computer when there is no recording.
2. **A friend, live** (`📲 Daag ’n vriend uit`): the server makes a room code, and the game shares a link `…/?kamer=CODE` on WhatsApp. The room waits up to 10 minutes. Whoever opens the link plays live.
3. **A friend, later** (works without a server): after every match the results offer a challenge link `…/?teen=<run>` that carries your whole run (seed, nickname, height over time). Your friend plays the same tower against your recording, and can send one back.
4. **The computer** (`🤖 Robot Rikus`): a seeded made-up run. It is beatable, sometimes falls, and is always there, also offline.

Live play needs the Worker (`SPONSOR_API_URL`, see `server/README.md`). Without it the mode still works: the computer and friend challenge links.

### Recordings and the computer

A recording is the best height over time (the number the results show, so a block still in the air never counts), sampled every second, plus how it ended (`goal`, `lives`, `flood` or `quit`). The opponent's height is read from it at the match clock, with no head start: each second's height counts from the middle of that second, and the last one from the moment the run ended. Attacks still work both ways:

- When the recording reached a mark first, it "chooses" by the match seed (`botPunishment`: the same for everyone on that tower), and the punishment comes to your tower (a real visitor, which you can stop, or the weather).
- When you reach a mark first, you choose, and the recording's tower gets shorter from then on: Blouaap −3 m, Skelm Sakkie −4 m, Mis or Hittegolf −2 m. That is about what each does to a real tower.
- Robot Rikus works the same way.
- If the recording fell, its tower stops at that moment.

The computer's run comes from the match seed: it climbs at about 0,30–0,42 m/s with pauses and small falls, and about one game in four it falls before 50 m.

## Fair play and safety

- Each phone reports its own height. That's fine for fun but not for prizes (none are planned). The server still refuses impossible numbers (faster than 2 m/s, above 2 000 m) and decides which height mark was reached first and who won.
- Nicknames are optional (max 16 characters) and go through the same name rules as sponsor names (`js/core/nameRules.js`). They are always shown with `textContent`. The default name is "Bouer" plus three digits.
- Links are validated strictly (lengths, characters, ranges). A broken link is ignored.
- The server keeps recordings (seed, nickname, heights) for up to 7 days, to give lonely players an opponent. It stores no IP addresses or device data. `privaatheid.html` gets a paragraph about this.
- Origins are checked on every WebSocket, with a limit of 10 messages a second per player.

## Ranks, seasons and looks (1.12: one rank per mode)

The rules and numbers are in `js/core/economy.js` (tested in `tests/economy.test.js`). The owner asked for ranks like CS:GO ("Gold Nova 2 — 70% till next level", "if you loose to someone you loose points", "a lot of ranks"), one for each challenge.

- **The ladder (23):** 🥉 Brons I, II, III, Brons Meester · 🥈 Silwer … · 🥇 Goud … · 💠 Platinum … · 💎 Diamant I, II, III, Diamant Meester · 🏗️ Meesterbouer · 🏰 Grootmeester · 👑 Stapel-legende. Each rank is 100 points, shown as a percentage ("🥇 Goud II · 70%", "Nog 30% tot Goud III").
- **One per mode:** Wedloop and Blok vir Blok each have their own (`econ.ranks.race`, `econ.ranks.turns`). A 1.11 player keeps their tier as that tier's first rank in both.
- **Points (live matches only):** a win +20, a loss −15 against your own rank; +3 (win) or −2 (loss) for every rank the opponent is above you (a win 8-40, a loss 5-30). A new player's first 10 matches count wins 1.5×. Robot Rikus and recordings don't count (the owner's choice).
- **The shield:** the first loss that would drop a rank is caught (you stay, at 0%); a win brings the shield back. Never below Brons I.
- **Seasons:** a calendar month. A new one drops every rank one tier (400 points: Goud II → Silwer II) and leaves a season badge for the best tier reached. Rank looks follow the best tier in either mode (the Diamant frame); they are never sold.
- **Shown:** the Uitdagersreeks screen (the chosen mode's rank, its bar, placement or shield notes), the results (the change, a moving bar, "Nuwe rang", "Af na", "Skild!"), the match pills ("🥇II Anna"), the player card (the rank in the mode played: `card.rl`).
- **Coins for a match**: 15 for a live win, 5 for a live loss; 8 and 2 otherwise. They count towards the day cap (150) with Oefen.
- **Looks** (bought with coins in the Winkel; they never make anyone stronger): a frame, a badge, a title, a win celebration and a visitor style. No power-ups in a match.
- **Emoji reactions (1.12):** 😂 🔥 😱 👏 😎 🙈 from a button in a live match or against Robot Rikus; one every 5 s, 12 a match; the server passes on at most one every 3 s; a mute for theirs.

## Server (Cloudflare Worker + Durable Objects, free plan)

- `MatchLobby` (one instance) pairs players who are looking and keeps the pool of recent recordings.
- `MatchRoom` (one per match) relays heights, decides height marks and the result, and hands both runs to the lobby when the match ends.
- Routes: `GET /match/lobby` (WebSocket), `POST /match/room` (new friend room, returns the code), `GET /match/room/<CODE>` (WebSocket), `GET /match/ghost` (a recent recording).
- The punishment choice (protocol 2, from 1.7.6): the room asks the first player to a mark (`{t:'choose', m, def}`), the game answers `{t:'punish', m, kind}`, and the room sends `{t:'attack', m, kind}` to the other player and `{t:'sent', m, kind}` back. Without an answer within 8,5 s (the game's own timer is 7 s) the default goes. The game says its protocol in its hello (`v`). A game older than 1.7.6 (protocol 1) is never asked, and only ever receives the mark's default, so old and new versions can still play each other.
- Player cards (from 1.8.0, still protocol 2): the hello carries the player's card, `{t:'hello', v:2, name, card:{frame, badge, title, celebration, style, rank}}`. The room keeps known ids only (`cleanCard` in `js/core/economy.js`; anything else becomes the default) and passes it on in the start, `{t:'start', seed, you, opp:{name, card}}`. A game before 1.8.0 sends no card (the other player sees the default) and ignores the one it gets. Ranks live on the phone, so a card's rank is the player's own claim; looks are show-off only and never change the match.
- Both classes are SQLite-backed (`new_sqlite_classes`), which the Workers Free plan allows, and use WebSocket hibernation, so an idle match costs nothing. The free tier is 100 000 requests a day, and incoming WebSocket messages count 20:1, so a 2-minute match costs about 20.

## Screens and text

- **Menu**: an `⚔️ Uitdagersreeks` button beside `Oefen`.
- **Uitdagersreeks screen**: a one-line explanation; your player card with this season (the month), your rank and points and a bar to the next rank; the nickname; the three ways to play; wins and losses; how points work, your season badges and a button to the shop's looks.
- **Searching screen**: "Soek ’n teenstander…" with a countdown and a cancel button. On a match: "Teen <naam>!" with both player cards (theirs big, yours small), then a 3-2-1 count and play.
- **In the game**: a race track on the right edge (0–50 m, with the marks), you and your opponent as two markers, and their badge, name and height. When you reach a mark first, a strip slides down over the score at the top ("Eerste by 10 m! Kies ’n straf vir Rikus:") with the four punishments and a 7-second timer. The game never pauses, and only the four buttons take taps: a tap anywhere else still drops a block. Taps in the first 0,4 s are ignored, since a drop tap may already be on its way. Keys 1–4 choose on a computer. (1.7.6 had a bar at the bottom of the screen, right where thumbs tap; testers said it got in the way.) Punishments come with the visitor or weather banner ("Rikus stuur Mis!"). One you send shows a toast ("Jy stuur Skelm Sakkie na Rikus! 🦹"). A Blouaap or Skelm Sakkie wears the sender's visitor style (🧢 🕶️ 🎩 👑) on the other tower.
- **Results**: "Jy het gewen! 🏆" or "Jy het verloor", and why. The winner's celebration rains down: yours with a fanfare, or theirs with "<naam> vier!". Coins and rank points for the match. Both heights, then the buttons `Nog ’n wedstryd`, `Daag ’n vriend uit` (your run as a link) and `Tuis`. The WhatsApp text says who won and includes the challenge link.
- All Afrikaans text goes in `js/core/strings.js`, with its English twin in `js/core/strings.en.js` (same key; `tests/i18n.test.js` checks).

## Testing and definition of done

- `npm test` green with new tests for: the match rules, recording playback, penalties, the computer's run (deterministic and beatable), challenge links (round trip, every malformed case), and stats storage.
- `cd server && npm test` green with new tests: pairing, relaying, the server deciding height marks and results, disconnects, origin checks, rate limits and bad messages.
- Headless at 412×915 and 360×640 with zero console errors:
  - a full match against the computer;
  - a friend link from player A played by player B;
  - two browsers playing each other live against `wrangler dev` (random pairing and a friend room).
- Screenshots of each screen.
- Version bumped, new modules precached and preloaded, README and HANDOVER updated.
