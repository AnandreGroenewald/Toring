# Stapel 1.15: the final polish — what Anandre asked for, and how each step goes

Prepared 12 Oct 2026 (evening) on branch `stapel-1.15` (VERSION 1.15.0, sw `stapel-v1.15.0`), in the worktree
`wt-115`. The owner tested every feature on his Mac as it was built (the test copy on port 8390) and gave his
feedback live, about 120 rounds of it.

## Anandre's ask (typed in the Stapel terminal, 12 Oct ~19:10)
> "So there are a lot of small nitty gritty stuff on the UX and UI that needs to be fixed, please check and aslos there
> needs to be a little more various options available for the bricks and the background, its too sipmple. With that said
> the celebration icons is very meh, can you please make it so that people want to buy it with the coins. Please I really
> need a final push by tomorrow morning ... I want to publish one more version and then not worry until we invent
> something new. Please double check Afrikaans and english. ... it must be somthing a 22 year old looks at and thinks I
> need this, the bricks the background everything please."

- **His bar for 1.15 (every release step):** "the critics needs to give 40/40 this time before releasing and the final
  boss 10/10". The panel script's own gate is 36 + 9, so each 1.15 step is checked by hand against 40/40 + 10.
- **At the freeze (12 Oct ~22:58):** "LETS GO! I think it looks a lot better, now it looks like a premium game that
  people will spend money on. THANK YOU!!!"
- **Kept for 1.16 (his choice, 22:56, "Keep it for 1.16"):** sea creatures you can buy with coins (shark, whale,
  dolphin, octopus, turtle) with Try it.
- **The release plan (typed 12 Oct ~23:02: "Please ask me any permissions if required to push it both on the web and the
  playstore, if I wake up tomorrow I would like to play it from the playstore, also push for the Family as well"), his
  answers (AskUserQuestion, ~23:04):**
  - "Yes: web + Play internal tonight" — the Worker, the website and the app 11500 to internal testing go out tonight,
    each step only after its 40/40 + the Final Boss 10, without waking him.
  - "Yes, deploy at night" — the Worker without asking "anyone in a match?" first (Claude checks the lobby and today's
    board activity and waits if anyone plays).
  - "Also send 1.15 to the closed test" — 1.15.0 also goes to Closed testing – Alpha (the Family), replacing 1.14.0 in
    Google's review queue (sent 19:07; a new submission can restart the review).
  - "Keep fixing; hold until 40/40 + 10" — his bar stands overnight: nothing goes out below it.
- **Money:** coins are still earned only ("Munte kan nie gekoop word nie"); nothing in 1.15 sells coins or takes money.

## What 1.15 holds (see docs/HANDOVER.md for the full list)
- The premium look: every card and sheet in dark glass with gold; the Uitdagersreeks' play cards; the day-done card in
  tiles; the round menu buttons; the player card as a collectible (each frame its own glowing card).
- More to buy: 4 new worlds + Akwarium (and Safari, Fuji, the Nordic peaks, the reef...), the Neon crane and a polished
  Gold one, 8 new block skins, 5 new medals, 2 frames, a title, 4 new celebrations and a proper SA drum braai; rarity
  tiers; "Probeer" (Try it) on every tower style with ‹ › to step through.
- Play: the spirit level under the jib, weather and visitor chips on the left, the punishment choice as a 2x2 on the
  left, the race track's pointers (no names), the wind-bent aim guide, "Jou blok land hier ↓" over the ghost.
- Ranks in growing points (100 Brons ... 500 elite; the ladder maths unchanged), the weekly chest you tap open, the
  streak and tries explained on a tap, "Nuwe weergawe!" for the app (APP_LATEST), ~80 Afrikaans/English fixes.
- Privacy: the player card now also carries the block skin you wear (`bs`): both privacy pages say so (2026-10-13).

## The steps, in order (each its own Critic Panel at 40/40 + the Final Boss 10, and the owner's word)

**a. Merge** `stapel-1.15` into `claude/trusting-hopper-26qcax` (local only; fast-forward if possible).

**b. The Worker** (`cd ~/Desktop/Toring/server && ./wr.sh deploy`), at a quiet moment (his night answer: no "anyone in a
match?"; Claude checks the board's activity first and waits if anyone plays: a deploy restarts the match rooms). Why: the
server cleans each player card with the game's own `cleanCard`, so until it is deployed an opponent sees the old default
for any new medal, frame or title, and no block skin in Blok vir Blok. (Round 2) A save store also keeps every shop id the
account's kept save owned (`keepOwned`), so a 1.14 app's sync can't drop a 1.15 purchase.
`APP_LATEST` stays "1.14.0" (no update card yet). Before: note the live Worker id (`./wr.sh deployments list`).
- Live check: `curl -s -H "Origin: https://stapelspel.pages.dev" https://stapel-borge.bonkers-bunch-online.workers.dev/daily/config`
  answers `{"free":3,...,"signin":true,"app":"1.14.0"}`.
- The live gate (the card gained `bs`): the 1.15 game on this Mac against the live Worker
  (`MATCH_API=https://stapel-borge.bonkers-bunch-online.workers.dev node ~/.claude/skills/stapel/scripts/qa/serve2.mjs ~/Desktop/Toring 8323`,
  then `LIVE=1 GAME=http://127.0.0.1:8323/ node ~/.claude/skills/stapel/scripts/qa/friends1121.mjs turns`).
- The way back: `./wr.sh rollback b6601722-d420-4969-b60d-e71a96ff3c91 --yes --message "…"` (the live 1.14 Worker,
  deployed 12 Oct 13:41; checked with `./wr.sh deployments list` on 13 Oct 01:00). If both steps go back, roll the website
  back FIRST (Pages 9623ad11), then the Worker: a 1.15 website on the 1.14 Worker loses keepOwned (step b also keeps the
  worn item an older app dropped), so a new phone could miss a 1.15 purchase until the website syncs again; or put the
  1.15 Worker back soon after.

**c. The website:** `git push origin claude/trusting-hopper-26qcax`, then `cd ~/Desktop/Toring && node tools/build-pages.mjs
&& cd pages-dist && ../server/node_modules/.bin/wrangler pages deploy . --project-name stapelspel --branch main` (the build
now copies `img/` too: the Winkel's world photos).
- Live check: both addresses serve `stapel-v1.15.0`; `check-all.sh live` ALL CLEAR.
- The way back: Pages rollback to the 1.14 deployment (9623ad11), a revert push for the old address.

**d. The app 1.15.0 (versionCode 11500) to Play internal testing** (folder "Upload 1.15.0 internal" with the `.aab`,
release-notes.txt, README; full panel; the owner's typed word; only "Save and publish" for internal testing).
- Data safety: no change expected (the card's block skin is a game setting sent to the opponent, like the looks already
  declared); the Advocate confirms.
- The way back: Internal testing > Manage track > Pause track.

**e. The closed test, tonight too (his ~23:04 answer "Also send 1.15 to the closed test"):** promote 11500 to Closed
testing – Alpha and send exactly that release for Google's review (it replaces 1.14.0's submission of 12 Oct 19:07; the
review counts from the last change sent). The folder's README holds both clicks, STEP 0 (the web first) and the stop rules.

**f. Later, with its own yes:** raise `APP_LATEST` to "1.15.0" only once Play has 1.15.0 for everyone (then `./wr.sh deploy`).

## The Critic Panel (his bar: all four 10 + the Final Boss 10)
- **Round 1 on 6a33cc9 (13 Oct ~00:55-01:10): 30/40, all HOLD:** Guardian 6 (a 1.14 app's sync dropped 1.15 purchases),
  Customer 8 (an Afrikaans tag cut off at 360 px, two rule lines, the wallet's + after the refill), Bottom Line 8 (the
  Winkel's "only you see these" note untrue in 1.15, the records), Advocate 8 (three phone-only keys missing from privacy
  section 11). Their must-dos and lifts were done in 5780ece (HANDOVER §2 1.15.0 "Panel round 1").
- **Round 2 on 5780ece (13 Oct ~01:25): 34/40** — Customer 9, Bottom Line 9, Advocate 9 (all APPROVE), Guardian 7 HOLD
  (keepOwned and the game's `worn` cancelled out on the real path: the item stayed owned but went back to the standard
  look). Round 3: keepOwned keeps the dropped worn id too; the Customer's polish (Robot Rikus whole in the match pills,
  no split "tot 4 000" / "Robot Rikus", the Afrikaans note's word order, a solid band); the Advocate's lines (the cement
  tip and how long updateSeen stays in §11, "Wat jy koop, bly joune" in §2d); these records.
- **Round 3 on a60c5b6: 36/40** (all four 9 APPROVE); lifts done in 8df42bb (the race track above the island sign on tall
  phones, "(up to 4 000)", §11's stapel.v1 line, the keep-ids rule). **Round 4 on 8df42bb: all four 9, then 10 each after
  the clean full check** (63 ok + 2 timeouts under load re-run alone ok = 65/65; the sign-in check's coin-toast filter
  fixed to read the gold coin) = **40/40, and the Final Boss 10/10 FINAL APPROVAL (03:29).**
- **The web went out 03:31-03:35** (b + c below the line in HANDOVER "1.15.0 WEBSITE + WORKER LIVE"): Worker
  94ca5595-029a-4c81-aec4-d99b59556088, push 812b82a..8df42bb, Pages 9881b426; the live gate and `check-all.sh live`
  ALL CLEAR (03:43).
- **The Play upload panel (folder "Upload 1.15.0 internal", aab built 03:23 from 8df42bb):** round 1 32/40 (all 8: STEP 0
  web-first, the way back, the after-click records, "Try it" promised only for worlds, cranes and blocks); round 2: the
  Guardian, the Customer and the Advocate 10; the Bottom Line 9 (the Family message for closed-test-only phones, a WATCH
  target, these records current).

## Watch after release
- **Wed 14 Oct 18:00 — the app:** how many of the 17 testers' phones are on 11500 (Play Console > Statistics). Target 5 of
  17 (on 10 Oct only 1 tester used the Play app). Fewer than 3: the owner sends the internal link again to the testers who
  aren't on it (the Family message: "Sien jy nog nie Update nie, of is jy nog nie ’n toetser nie? ..."). Also the closed
  test's review result and Play's pre-launch report for it.
- The board's daily players on Wed 14 and Sat 17 Oct against the 1.14 days (about 5-12); Thu 15 Oct ask the Family which
  new look they tried and bought; the morning after each step, no match complaints and no new Worker errors. The refill
  ends Fri 16 Oct, so the week after is the real test of "want to buy".
