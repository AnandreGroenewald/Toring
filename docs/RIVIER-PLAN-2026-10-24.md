# Stapel: Ons Dorp, die Rivier en die Saterdag-uitdaging — plan (24 Oct 2026)

The owner's new direction for Stapel, after his brother praised the game and the live board showed players drifting
off (31 Daily players since 9 Oct, 14 played once only, 3-5 a day by 20-24 Oct; memory `stapel-retention-baseline`).
This file is the plan Claude builds from. Each checkpoint ends with the owner playing it on his phone.

## 1. His words (24 Oct 2026, in order)

- "I like the dorp scenario but I do not like the steal and the look of the town."
- "the glybaan, it needs to integrate with the blocks ... lets leave the whole earth, water and fire scenario."
- Picked: **Afgly** (the slide grows out of the tower you just built) and **"Ons dorp, together"** (one crew town).
- "a clash every Saterday ... everybody plays together to win, grow your crew to build the bigger town ... destroy the
  other players buildings but not make it unfair, although more people needs to have the advantage".
- "I like the Afgly scenarion but not the Sloop idea" (no crane-dropped wrecking balls).
- "3 players on a team, one builder one repair and one destroyer ... whoever builds their tower the highest wins, but if
  your tower is the highest crews automatically can attack it or if you do not play the weekly tower challenge then you
  loose automatically."
- Picks: the ticket = **3 of the 5 weekday Dailies**; "I want a Saterday Challenge, not the 20 minute challenge" (all
  Saturday, play when you like); "Building material is not clays, wood etc. its what skin they have" (looks only);
  **4 crews per river**.
- The river: "a river with the blocks and you need to slide left and right to dodge them (For the daily slide not the
  weekly) the weekly is also on a river but then you damage the openents towers while you go down with bombs ... once
  you pass a tower on your left or your right ... as you press to confirm the power and direction then it slows down".
- "The river can be part of a rescue mission for the men you lost on the towers"; the weekly tower is built with the
  crane ("this will allow more bacground skins").
- "I want atleast 2 000 000 tokens used, this is a big build and I do not want any flaws. Again I really think we have
  a winner."

## 2. The game in one week (what a player sees)

| When | What you do | What you get |
|---|---|---|
| Every day | **Die Daaglikse Toring**, as now (same blocks for everyone; Perfeks open rooms, people move in) | Metres (= bombs for Saturday), a build turn, and people |
| Right after | **Afgly**: your builder dives off the top into the river and rides it ~40 s. Swipe ⟵ ⟶ past the blocks floating down; scoop up the people who fell off your tower (and a few strays) | The people you rescue move into your crew's **Weektoring** |
| Then | **Bou aan die Weektoring**: the crane, 10 blocks, on your crew's island. Every floor shows the skin of whoever stacked it | Height; Perfek floors are cemented (they take two bomb hits) |
| Saturday 06:00 – ~21:00 | **Die Saterdag-uitdaging**: 4 crews on one river. Only the **tallest** tower 👑 can be bombed. Behind? Ride the river past the islands and bomb the leader (hold → time slows → drag to aim → let go). In front? Build higher, and repair with the blocks every hit gives you | The tallest tower when the whistle blows wins; it stands on the island as a monument |
| Sunday | Die Kroning: the results, the monument, coins; a new Weektoring starts on Monday | |

Your town (**Ons dorp**) is your crew's island: the Weektoring in the middle, every member's Daily towers around it
(exactly as they were built), the monuments of past Saturdays. The people who live there make the town's title grow
(Huisie … Sterrestad): the long goal.

## 3. Rules and numbers (all in `js/core/span.js` SPAN; tuned by a simulation and by playing)

- **Crew** (span): 1-3 players. The first player makes it (a name, kid-clean), the others join by a WhatsApp link
  (`?span=CODE`). Leaving is always possible; the founder can remove a member. No changes Saturday 00:00 – Sunday 23:59.
  A player with no crew has a crew of one (their own island); Robot Rikus fills empty seats on Saturday (weaker).
- **Week**: Monday 00:00 to Sunday 23:59, South African time (UTC+2, no daylight saving).
- **Build turns**: every day you finish the Daily (Mon–Sat) gives one turn of 10 blocks on the Weektoring. Turns keep
  (up to 2 waiting) until Saturday's whistle. One builder at a time per tower (a 4-minute lease).
- **Bombs**: your best Daily height each day Mon–Sat, added up, 1 bomb per 25 m, at most 10 a week. They're yours (not
  the crew's). Coins never buy bombs or turns.
- **Ticket**: finish the Daily on 3 of the 5 weekdays (Mon–Fri) to play on Saturday (bomb runs and Saturday building).
  A crew with no ticket holder sits Saturday out. Your Weektoring floors stand either way.
- **Only the tallest tower can be bombed** (checked when the run starts; a bomb still lands if the lead changed during
  the run). Everyone else is safe to build.
- **A hit**: the floor at the bomb's height is knocked out and the tower above drops into its place (height lost = what
  that floor added). A Perfek floor cracks first (two hits). A crooked (Skeef) floor takes the crooked floor above it
  with it. People in a knocked-out floor fall into the river (your crew can rescue them).
- **Repair**: every hit your tower takes gives your crew 1 repair block (a Herbou turn: the crane with those blocks).
- **The whistle** (anti-sniping, the old "candle auction"): Saturday ends at a random time between 20:00 and 21:00 that
  nobody knows, so waiting to strike in the last second is a gamble.
- **4 crews per river**, grouped at the start of Saturday from crews with a ticket holder, by tower height; Rikus crews
  fill a river (their towers near the group's middle height; they build and bomb a little through the day).
- **People**: rescued people and the rooms of your Weektoring floors are your town's people (kept across weeks). Coins:
  1 per person rescued (inside the day's coin cap), winners 150 each, 2nd 80, 3rd 40, 4th 20.
- **Skins**: each floor is drawn in its builder's block skin (looks only). The island's sky follows the viewer's
  background skin; new river/island backgrounds come later as Winkel skins.

## 4. What goes out

- Jou dorp's stealing (Steel en Wraak), its raids, walls, Rikus's raids, the landmarks shop (1.16-1.18, never live).
- Fire / water / grass everywhere: tribes in the Living Tower (casting picks from the whole cast), the tribe sheet and
  its Winkel price, Blok vir Blok's tribe missions (Veldbrand, Waterwiel, Rankgryp), Glybaan (menu off; its page kept).
- The cast keeps its people (Boer die Bouer, Haai-Hennie, …) as plain residents.

## 5. How it's built

**Pure rules (shared by the game, the server and the tests)**
- `js/core/span.js`: SPAN numbers, week keys and phases (SAST), crew ids, invite codes, names, ticket, bombs, turns.
- `js/core/weektower.js`: the Weektoring as data (floors with shape, scale, x, y, angle, rating, skin, builder, the
  height each added), cleaning a builder's new floors, a hit (crack / knock out / chain), repairs, height, people.
- `js/core/rivier.js`: the river courses (seeded): the Daily rescue course and Saturday's course past four islands.

**The game**
- `js/rivier/`: the 3D river (three.js r170, the stage from js/kasteel/stage.js, Stapel's blocks from
  js/botsing/pieces.js), opened over Stapel's page like the 3D town was (Stapel's own drawing sleeps meanwhile).
- `GameScene` mode `week`: the crane on the Weektoring (the stored floors as cement, 10 or the repair blocks).
- `js/span.js`: the phone's side (its id + key, the crew, sync, leases, results), `stapel.v1.span`.
- `js/ui/dom.js` + both strings files: the Ons dorp screen, the results card's buttons, the Saturday screen.

**The server** (`server/src/span.js`, kept in the TownHall Durable Object next to dorp/kasteel; matchhost.mjs on the Mac)
- `POST /span/sync` (the phone's id, key, name, skin, the day's reports) → crew, tower, week, river, news.
- `POST /span/make`, `/span/join`, `/span/leave`, `/span/remove`; `POST /span/lease`, `/span/build` (new floors),
  `/span/bomb` (hits), `/span/rescue` (people back); `GET /span/river/<id>` (Saturday standings).
- Rikus crews and seats act by catch-up on each call (no alarms needed); the whistle time is seeded per river.

## 6. Checkpoints (he plays each one on his phone over home Wi-Fi before the next)

1. **The day's loop, one player**: Daily → Afgly rescue → Weektoring with the crane → Ons dorp shows it. (Local store.)
2. **Crews and Saturday**: the server side, invite links, 4-crew rivers with Rikus crews, the bomb run, repairs, the
   whistle, the Kroning. Home server with his own crew.
3. **The look and the finish**: Gemini pictures of the river, the island and the Saturday run for his pick first, then
   the island town of real towers, the river's look, new backgrounds, both languages, a 360-wide phone, a slow phone,
   privacy pages, release notes. Then his go for the Worker, the website and Play.

## 7. Tests

- Unit: span (weeks, phases, tickets, bombs), weektower (hits, chains, cracks, repairs, cleaning), rivier (courses are
  the same for everyone, always passable), the server (crews, leases, builds, bombs on the leader only, grouping,
  Rikus, the whistle, limits), a Saturday simulation (no crew wins by waiting; towers end in a sensible range).
- Browser (headless, phone size): the day's loop end to end, the river at 60 fps on a 4x slowed phone, a Saturday run
  with real taps, two phones in one crew, English and Afrikaans, a 360x640 screen.

## 8. Status

- 24 Oct: plan written; checkpoint 1 built (the day's loop on one phone) and ready for his play over home Wi-Fi.
