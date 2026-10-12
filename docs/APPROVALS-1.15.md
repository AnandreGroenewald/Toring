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

**b. The Worker** (`cd ~/Desktop/Toring/server && ./wr.sh deploy`), at a quiet moment (ask "anyone in a match?" first:
a deploy restarts the match rooms). Why: the server cleans each player card with the game's own `cleanCard`, so until
it is deployed an opponent sees the old default for any new medal, frame or title, and no block skin in Blok vir Blok.
`APP_LATEST` stays "1.14.0" (no update card yet). Before: note the live Worker id (`./wr.sh deployments list`).
- Live check: `curl -s -H "Origin: https://stapelspel.pages.dev" https://stapel-borge.bonkers-bunch-online.workers.dev/daily/config`
  answers `{"free":3,...,"signin":true,"app":"1.14.0"}`.
- The live gate (the card gained `bs`): the 1.15 game on this Mac against the live Worker
  (`MATCH_API=https://stapel-borge.bonkers-bunch-online.workers.dev node ~/.claude/skills/stapel/scripts/qa/serve2.mjs ~/Desktop/Toring 8323`,
  then `LIVE=1 GAME=http://127.0.0.1:8323/ node ~/.claude/skills/stapel/scripts/qa/friends1121.mjs turns`).
- The way back: `./wr.sh rollback <the noted id> --yes --message "…"` (on 12 Oct the 1.14 Worker is the one from 13:40).

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

**e. Later, each with its own yes:** promote to the closed test (Google review); raise `APP_LATEST` to "1.15.0" only once
Play has 1.15.0 for everyone (then `./wr.sh deploy`).
