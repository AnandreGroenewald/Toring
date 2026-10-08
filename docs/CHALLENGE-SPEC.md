# Stapel: Uitdagersreeks (head-to-head) design spec

The owner asked for a "challenger series": you are put against someone random, you both stack the same blocks at the same time, and reaching a height first lets you do damage to the other player. You can also challenge a friend. This spec turns that into a mode that is fair, fun and cheap to run, and that works from day one with very few players online. Read `docs/HANDOVER.md` and `docs/CHARACTERS-SPEC.md` first: the attacks reuse the visitors.

## The match

| | Rule |
| --- | --- |
| **Same tower** | Both players get the same blocks and weather: a fresh seed per match in its own namespace (`duel/<seed>`). The scheduled visitors are off in a match: a visitor only ever comes as a punishment, so you always know who sent it. |
| **Height marks** | 10, 20, 30 and 40 m. Whoever reaches a mark first **chooses a punishment** for the other tower: Blouaap 🐒 (throws the top block into the sea and stamps on the next ones), Skelm Sakkie 🦹 (steals up to 4 top blocks), Mis 🌫️ (3 blocks of fog) or Hittegolf ☀️ (3 blocks of a racing crane). They have 7 s, while their tower keeps going; otherwise the mark's default goes: 10 m Blouaap, 20 m Skelm Sakkie, 30 m Blouaap, 40 m Skelm Sakkie. The defender stops Blouaap by landing a Perfek and Skelm Sakkie with a tap, as usual. A punishment never costs a heart (visitor rules). Height means the best settled height so far, the same number as the results. |
| **Winning** | The first to **50 m** wins. If your tower falls first (hearts gone or the flood), the other player wins. Quitting counts as a loss. The referee takes reports in the order they arrive, so there are no draws. |
| **Pausing** | Your own tower pauses as usual, but the other player keeps building. |

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

## Server (Cloudflare Worker + Durable Objects, free plan)

- `MatchLobby` (one instance) pairs players who are looking and keeps the pool of recent recordings.
- `MatchRoom` (one per match) relays heights, decides height marks and the result, and hands both runs to the lobby when the match ends.
- Routes: `GET /match/lobby` (WebSocket), `POST /match/room` (new friend room, returns the code), `GET /match/room/<CODE>` (WebSocket), `GET /match/ghost` (a recent recording).
- The punishment choice (protocol 2, from 1.7.6): the room asks the first player to a mark (`{t:'choose', m, def}`), the game answers `{t:'punish', m, kind}`, and the room sends `{t:'attack', m, kind}` to the other player and `{t:'sent', m, kind}` back. Without an answer within 8,5 s (the game's own timer is 7 s) the default goes. The game says its protocol in its hello (`v`). A game older than 1.7.6 (protocol 1) is never asked, and only ever receives the mark's default, so old and new versions can still play each other.
- Both classes are SQLite-backed (`new_sqlite_classes`), which the Workers Free plan allows, and use WebSocket hibernation, so an idle match costs nothing. The free tier is 100 000 requests a day, and incoming WebSocket messages count 20:1, so a 2-minute match costs about 20.

## Screens and text

- **Menu**: an `⚔️ Uitdagersreeks` button beside `Oefen`.
- **Uitdagersreeks screen**: a one-line explanation, the nickname, the three ways to play, and wins and losses.
- **Searching screen**: "Soek ’n teenstander…" with a countdown and a cancel button. On a match: "Teen <naam>!", then a 3-2-1 count and play.
- **In the game**: a race track on the right edge (0–50 m, with the marks), you and your opponent as two markers, and their name and height. When you reach a mark first, a strip slides down over the score at the top ("Eerste by 10 m! Kies ’n straf vir Rikus:") with the four punishments and a 7-second timer. The game never pauses, and only the four buttons take taps: a tap anywhere else still drops a block. Taps in the first 0,4 s are ignored, since a drop tap may already be on its way. Keys 1–4 choose on a computer. (1.7.6 had a bar at the bottom of the screen, right where thumbs tap; testers said it got in the way.) Punishments come with the visitor or weather banner ("Rikus stuur Mis!"). One you send shows a toast ("Jy stuur Skelm Sakkie na Rikus! 🦹").
- **Results**: "Jy het gewen! 🏆" or "Jy het verloor", and why. Both heights, then the buttons `Nog ’n wedstryd`, `Daag ’n vriend uit` (your run as a link) and `Tuis`. The WhatsApp text says who won and includes the challenge link.
- All Afrikaans text goes in `js/core/strings.js`.

## Testing and definition of done

- `npm test` green with new tests for: the match rules, recording playback, penalties, the computer's run (deterministic and beatable), challenge links (round trip, every malformed case), and stats storage.
- `cd server && npm test` green with new tests: pairing, relaying, the server deciding height marks and results, disconnects, origin checks, rate limits and bad messages.
- Headless at 412×915 and 360×640 with zero console errors:
  - a full match against the computer;
  - a friend link from player A played by player B;
  - two browsers playing each other live against `wrangler dev` (random pairing and a friend room).
- Screenshots of each screen.
- Version bumped, new modules precached and preloaded, README and HANDOVER updated.
