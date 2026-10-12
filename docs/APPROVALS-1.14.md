# Stapel 1.14: Sign in with Google — what Anandre approved, and how each step goes

Prepared 12 Oct 2026 on branch `stapel-1.14-signin` (VERSION 1.14.0). Google's side (the project, the sign-in screen,
the web key, both Android keys and "Publish app") is **done** (Anandre, 12 Oct ~04:30).

## Anandre's answers (12 Oct ~06:00, typed in the Stapel terminal)
- **The push plan:** "Website + server now, app after my phone test". So **a–e are approved** to go, each
  after its Critic Panel, in this order. ~~f waits for his phone test~~ → **12 Oct ~14:05 the owner: "Please push it to
  the playstore for testing"**: f goes to internal testing (after its full panel) so his phone test runs on that build;
  the STOP rule (Pause track) stays. Done so far: a-c live 13:40-13:42, d (the website) live ~14:00.
- **Sign-out keeps everything:** "Yes it need to keep everything hense the Google sign in." Signing out only ends
  that device's session. The phone keeps its coins, skins, ranks, tries, nickname and everything else, and the account
  keeps its copy. Deleting the account deletes the account and its leaderboard rows; the phone's own progress
  stays. Nothing is wiped anywhere.
- **⚙️ Instellings (Settings), like 8 Ball Pool:**
  - The menu row is ❓ Speelreëls · 📊 Statistiek · 🛍️ Winkel · ⚙️ Instellings.
  - The account sits at the top of Instellings, then Klank, Vibrasie, Kontras, Taal, Herinneringe and Privaatheid.
  - The sign-in button left Statistiek.
- **The gentle offer's wording:** "Please proceed with what you think is best" → "Bêre jou vordering met Google ·
  een tik".
- **Gambling:** "Lets proceed, we will sort out gambling laws if it works." The South African gambling-law opinion
  is due **before coins are ever sold for money**, not before sign-in.

## The rule for this version (Anandre, 12 Oct ~04:40)
> "its just people skipped the payment section due to login, people want it as simple as possilbe"

- **Never a gate.** No sign-in before playing, a match, the Winkel or any future payment. A guest plays exactly as
  in 1.13.4.
- **One tap.** Google's own button on the website; the phone's own account picker in the app. No forms, passwords
  or typed emails.
- **No nagging.** No popup on start. The account lives in ⚙️ Instellings, plus one gentle offer at a good moment
  (a new best, or just after a purchase), at most once every 60 days, closed with ✕.
- **Nothing breaks.** A cancel shows nothing. A failure shows one calm toast ("Inteken het nie nou gewerk nie. Jy
  speel gewoon verder."), and the game goes on.
- **Nobody loses anything.** Signing in merges the phone's progress into the account. Signing out keeps everything
  on the phone.
- **Hidden until it works.** Sign-in shows only once the server says `signin: true`, so the website can go out
  before the secret, the database change or the Worker.
- **Privacy:** Stapel keeps only a number made from the Google account, never its name, email or photo (also not
  on screen).

## The steps, in order (all run from `~/Desktop/Toring/server` on the 1.14 commit)

**One quiet window for a, b and c.** `wrangler secret put` (step a) deploys a new Worker version at once, and so does
step c. Both restart the match rooms, so a live match drops. So:
- **First:** check that nobody is in a live match (the Uitdagersreeks lobby is empty, and Anandre or Alfred knows of
  no match going on).
- **Then:** run a, b and c back to back in that one window.
- **If the window breaks:** stop after a whole step, never in the middle of one.

### a. The server secret `AUTH_SECRET`: once, never changed (full panel: a live secret)
- **What it does:** turns a Google account's number into Stapel's own account number. Players see nothing yet.
- **Before:** the quiet window (above). Also note the Worker version that is live now:
  ```sh
  ./wr.sh deployments list   # write down the newest id (on 12 Oct: 594c7235-b8d2-455a-8932-0489502d9736, from 1.13.1)
  ```
- **Commands.** The value is made in Python and handed to the Keychain through `security -i`'s input, so it never
  appears on a command line or in the process list:
  ```sh
  python3 -I - <<'PY'
  import secrets, subprocess
  v = secrets.token_hex(32)
  subprocess.run(['security', '-i'], input=f'add-generic-password -a stapel -s "Stapel AUTH_SECRET" -w {v}\n', text=True, capture_output=True, check=True)
  PY
  security find-generic-password -s "Stapel AUTH_SECRET" -w | tr -d '\n' | wc -c   # must say 64 (only the length is shown)
  security find-generic-password -s "Stapel AUTH_SECRET" -w | ./wr.sh secret put AUTH_SECRET
  ./wr.sh secret list          # AUTH_SECRET is listed (names only)
  ./wr.sh deployments list     # write down the NEW id this made (the secret's own Worker version)
  ```
- **Anandre's step:** keep a second safe copy in his password manager. Keychain Access › "Stapel AUTH_SECRET" ›
  show password, then paste it into the password manager. It must never be lost or changed.
- **Way back:** before c, an unused secret does nothing (`./wr.sh secret delete AUTH_SECRET`). After players sign
  in it must **never change**, because their account numbers come from it.

### b. The database change `0006_accounts.sql` (full panel: a live database)
- **What it does:** adds three empty tables (accounts, sessions, save history) and their 4 indexes. Nothing else is
  touched, and it's safe to run twice. Run the statements **one by one with `--command`**, because the `--file`
  route was refused on 10 Oct (Cloudflare error 10000).
- **Commands:**
  ```sh
  ./wr.sh d1 execute stapel-borge --remote --command "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, created INTEGER NOT NULL, seen INTEGER NOT NULL, rev INTEGER NOT NULL DEFAULT 0, save TEXT, saved INTEGER, last_push TEXT, gen TEXT);"
  ./wr.sh d1 execute stapel-borge --remote --command "CREATE INDEX IF NOT EXISTS idx_accounts_seen ON accounts (seen);"
  ./wr.sh d1 execute stapel-borge --remote --command "CREATE TABLE IF NOT EXISTS account_sessions (hash TEXT PRIMARY KEY, account TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL);"
  ./wr.sh d1 execute stapel-borge --remote --command "CREATE INDEX IF NOT EXISTS idx_account_sessions_account ON account_sessions (account, seen);"
  ./wr.sh d1 execute stapel-borge --remote --command "CREATE INDEX IF NOT EXISTS idx_account_sessions_seen ON account_sessions (seen);"
  ./wr.sh d1 execute stapel-borge --remote --command "CREATE TABLE IF NOT EXISTS account_pushes (account TEXT NOT NULL, push TEXT NOT NULL, rev INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (account, push));"
  ./wr.sh d1 execute stapel-borge --remote --command "CREATE INDEX IF NOT EXISTS idx_account_pushes_at ON account_pushes (at);"
  ./wr.sh d1 execute stapel-borge --remote --command "SELECT type, name FROM sqlite_master WHERE tbl_name LIKE 'account%' AND name NOT LIKE 'sqlite_%' ORDER BY type, name;"
  #   → exactly 7 rows: index idx_account_pushes_at, idx_account_sessions_account, idx_account_sessions_seen,
  #     idx_accounts_seen; table account_pushes, account_sessions, accounts
  ./wr.sh d1 execute stapel-borge --remote --command "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name LIKE 'account%';"
  #   → the real columns: accounts has gen and last_push; account_pushes has account, push, rev, at
  ```
  **STOP before c** unless all 7 show and the columns match. A Worker with sign-in on but no tables would answer
  500 to every sign-in.
- **Way back:** the tables can stay unused, or be dropped (`DROP TABLE IF EXISTS account_pushes;`, then
  `account_sessions`, then `accounts`, each with `--command`). Do that only before players have signed in.

### c. The Worker deploy: sign-in routes plus `signin: true` (quick security scan; the same quiet window)
- **Commands:**
  ```sh
  ./wr.sh deploy
  curl -s -H "Origin: https://stapelspel.pages.dev" https://stapel-borge.bonkers-bunch-online.workers.dev/daily/config
  #   → {"free":3,"from":"2026-10-12","signin":true}
  curl -s -X POST -H "Origin: https://stapelspel.pages.dev" -H "content-type: text/plain;charset=UTF-8" \
    -d '{"token":"0000000000000000000000000000000000000000000000000000000000000000"}' \
    https://stapel-borge.bonkers-bunch-online.workers.dev/account/load
  #   → 401 {"error":"signed_out"...}: the route, the tables and the secret are live
  #     (503 not_configured = no secret; 500 = no tables: roll back, see below)
  curl -s -H "Origin: https://stapelspel.pages.dev" "https://stapel-borge.bonkers-bunch-online.workers.dev/board?dateKey=$(TZ=Africa/Johannesburg date +%F)" | head -c 300
  #   → today's board still answers ("players")
  ```
- **Who it reaches:** games on 1.14.0 (website or app) now show the ☁️ account section and the gentle offer. Games on
  1.13.x ignore it.
- **Way back:** `./wr.sh rollback <the id noted in a, BEFORE the secret> --yes --message "back to 1.13"`. Sign-in
  hides again (no `signin`), and saved progress stays in the database. A rollback may report AUTH_SECRET as
  changed: afterwards run `./wr.sh secret list`, and if AUTH_SECRET is missing, put it back from the Keychain (the
  same pipe as in a). It must keep the same value.

### d. The website 1.14.0: push plus Pages (quick security scan)
- **What it does:** the web game with ⚙️ Instellings, sign-in (hidden until c), the privacy pages with the account
  sections (version 2026-10-12, the release day), and everything in 1.13.4.
- **Way back:** a Pages rollback to the 1.13.4 deployment, plus a revert push.

### e. Play Console › App content › Data safety (full panel: a store listing change; needed before f)
- **What it does** (exactly as `~/Desktop/Stapel app (Google Play)/Upload 1.14.0 internal/data-safety.txt`):
  - Personal info › "User IDs": Stapel's own account number (never Google's number, name, email or photo): collected,
    not shared, optional, for App functionality and Account management.
  - App activity › the game save (coins, looks, ranks, the day's tries, the nickname choice, the refill count) for
    signed-in players: collected, not shared, optional, for App functionality and Account management.
  - Personal info › Email address (round 1, the Guardian + the Advocate): Google's sign-in proof carries it to the
    server, which only checks it: collected, processed ephemerally, not shared, optional, Account management. Name and
    Device or other IDs also get the purpose Account management. No Photos entry (the token holds only a link).
  - Account creation: yes, with Sign in with Google (OAuth); no username/password.
  - Data deletion: yes; account deletion URL https://stapelspel.pages.dev/privaatheid#uitvee (in the game, on the web
    at ?rekening, or by email).
  - Everything already declared for 1.13.x stays (the nickname, the random leaderboard number, game results).
- **Send for review:** only this change, if Play asks. STOP on any other listed change, a new declaration or terms page.
- **Way back:** edit the form again.
- **DONE 12 Oct, just before f:** filled exactly as above, the preview checked, saved; Publishing overview listed exactly
  1 change ("App content › Data safety") → sent for review (Google: hours to a few days).

### f. The app 1.14.0 (versionCode 11400) to internal testing (full panel; the owner ~14:05: "Please push it to the playstore for testing")
- **Folder:** `~/Desktop/Stapel app (Google Play)/Upload 1.14.0 internal` (Stapel-1.14.0.aab SHA-256 0226df5e…eda7e6,
  release-notes.txt af 445 / en 444, README.txt with the steps, data-safety.txt). Order: e first, then f, same session.
- **The phone test (about 10 minutes), on the internal-testing build, in this order** (signing out comes before the
  cancel test: "Teken in met Google" only shows when signed out):
  1. ⚙️ Instellings › under "Bêre jou vordering" tap "Teken in met Google" › pick his Google account › "Ingeteken met
     Google ✓".
  2. His coins and skins are still there.
  3. The website, signed in with the same account, shows the same progress.
  4. Teken uit keeps everything on the phone.
  5. Tap "Teken in met Google" again and cancel the picker: nothing scary, the game carries on.
  6. Sign in for real: nothing is counted twice.
- **Way back:** Internal testing › Pause track.
- **DONE 12 Oct 17:35:** 11400 (1.14.0) "Available to internal testers" (release 14), uploaded from the byte-identical
  scratchpad copy (SHA-256 0226df5e…); same devices as 11304; the notes checked by SHA-256 (6 of 6 languages); only the
  deobfuscation warning; "Save and publish". Panel on the folder (content e90451e): round 1 31/40, round 2 36/40 (all four
  9) + the Final Boss 9.

### g. 1.14.0 to the CLOSED TEST + a new content rating (full panel; the owner 18:06 "YES PLEASE")
- **Why:** both test tracks use the Family list (17), but the closed test "Alpha" still has 11200 (1.12.0, 9 Oct). A
  tester who joined only the closed test gets 1.12.0; tonight a Family phone (on the list, just joined the internal test)
  installed 1.12.0 from Play: no coin matches. With 11400 on both tracks every tester gets 1.14.0 by itself.
- **The owner's own words (typed in the Stapel terminal, 12 Oct):** 18:01 "she still doesnt even have the challenge
  oponents for coins?"; 18:06 "YES PLEASE" (to "Shall I go ahead and put 1.14.0 on the closed test?", which named the
  panel and Google's review); 18:09 AskUserQuestion "Yes, simulated gambling (Recommended)"; 18:12 "done" (he ticked
  IARC's terms box himself); 18:18 AskUserQuestion, after seeing "18+ in Australia (3+ everywhere else it's offered)":
  "Go ahead, 18+ in Australia".
- **The phone-check gate** (stapel skill §4.1 step 6: internal first, then the owner opens the build on his phone, and
  only then the closed test; internal builds get no pre-launch report): done on a Family phone: the owner typed 18:55 "I have asked my wife to open it and it worked! Thank you." (her
  phone had installed 1.12.0 from Play at ~17:55; it now runs the Play-installed 1.14.0 from the internal test). The live
  server (read only, 18:55) shows a NEW account created 18:41:44 SAST with its game save stored twice (rev 2, 2 050
  bytes, last 18:42:06) and 1 session: Google's account picker → Stapel's server → the save, end to end. (Before it
  only the 14:05 website sign-in existed.) The owner's own phone: "I have the newer version" (18:01). No Family
  tester lives in Australia (the owner, 18:39).
- **What goes out** (folder `~/Desktop/Stapel app (Google Play)/Upload 1.14.0 closed`, README.txt + content-rating.txt):
  1. the content rating: the draft questionnaire (every answer and its reason in content-rating.txt; simulated gambling =
     "other games that use and reward in-game currency through gameplay") → Australia 18+, Taiwan 15, Saudi 16 (not
     Stapel countries), the other ten Stapel countries 3+ / Everyone / PEGI 3 → Save;
  2. Closed testing - Alpha: Promote 11400 from internal (the same bundle, SHA-256 0226df5e…; the same notes, c7983181…);
  3. Publishing overview: send exactly these two (Data safety is already in review). STOP on any other listed change, a
     Managed publishing change, a new declaration or a terms page.
- **Way back:** before Google decides, move the two changes back to "not sent" in Publishing overview; after approval,
  Closed testing › Halt release (new testers get 1.12.0 again; phones that updated keep 1.14.0); the rating: a new
  questionnaire; sign-in off for everyone: `./wr.sh rollback f632dfe5-0148-4458-a94f-5d08f2d0b60d --yes`.
- **Records to fix right after the send:** Google Play steps.txt section 2 "Content rating ... no gambling ... Expect
  'Everyone' / 3+" (lines 27-30) → the new answers and ratings; this file's "Before production" IARC line → done
  (12 Oct), keep "could it appeal to children?"; HANDOVER's 1.13.5-list IARC item.

## Before production (not now)
REFILL and TESTER_GIFT off; the IARC gambling answers and Play's "could it appeal to children?" answered again;
the SA gambling-law opinion **before coins are ever sold for money** (Anandre: "we will sort out gambling laws if
it works").
