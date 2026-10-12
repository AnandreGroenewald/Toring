# Stapel 1.14: Sign in with Google — what Anandre approved, and how each step goes

Prepared 12 Oct 2026 on branch `stapel-1.14-signin` (VERSION 1.14.0). Google's side (the project, the sign-in screen,
the web key, both Android keys and "Publish app") is **done** (Anandre, 12 Oct ~04:30).

## Anandre's answers (12 Oct ~06:00, typed in the Stapel terminal)
- **The push plan:** "Website + server now, app after my phone test". So **a–e are approved** to go, each
  after its Critic Panel, in this order. **f waits for his phone test.**
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

### a. The server secret `AUTH_SECRET`: once, never changed (full panel: a live secret)
- **What it does:** turns a Google account's number into Stapel's own account number. Players see nothing yet.
- **Commands.** Make it on this Mac and keep it in the Keychain (nothing is printed):
  ```sh
  security add-generic-password -a stapel -s "Stapel AUTH_SECRET" -w "$(openssl rand -hex 32)"
  security find-generic-password -s "Stapel AUTH_SECRET" -w | awk '{print length($0)}'   # shows 64 (only the length)
  security find-generic-password -s "Stapel AUTH_SECRET" -w | ./wr.sh secret put AUTH_SECRET
  ./wr.sh secret list   # AUTH_SECRET is listed (names only)
  ```
  The value is only in that first command for a moment, on this Mac. It is never typed, shown or committed.
- **Way back:** an unused secret does nothing (`./wr.sh secret delete AUTH_SECRET` before c). After players sign in
  it must **never change**, because their account numbers come from it.

### b. The database change `0006_accounts.sql` (full panel: a live database)
- **What it does:** adds three empty tables (accounts, sessions, save history) and their indexes. Nothing else is
  touched, and it's safe to run twice. Use `--command`, because the `--file` route was refused on 10 Oct
  (Cloudflare error 10000).
- **Commands:**
  ```sh
./wr.sh d1 execute stapel-borge --remote --command "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, created INTEGER NOT NULL, seen INTEGER NOT NULL, rev INTEGER NOT NULL DEFAULT 0, save TEXT, saved INTEGER, last_push TEXT, gen TEXT);"
./wr.sh d1 execute stapel-borge --remote --command "CREATE INDEX IF NOT EXISTS idx_accounts_seen ON accounts (seen);"
./wr.sh d1 execute stapel-borge --remote --command "CREATE TABLE IF NOT EXISTS account_sessions (hash TEXT PRIMARY KEY, account TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL);"
./wr.sh d1 execute stapel-borge --remote --command "CREATE INDEX IF NOT EXISTS idx_account_sessions_account ON account_sessions (account, seen);"
./wr.sh d1 execute stapel-borge --remote --command "CREATE INDEX IF NOT EXISTS idx_account_sessions_seen ON account_sessions (seen);"
./wr.sh d1 execute stapel-borge --remote --command "CREATE TABLE IF NOT EXISTS account_pushes (account TEXT NOT NULL, push TEXT NOT NULL, rev INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (account, push));"
./wr.sh d1 execute stapel-borge --remote --command "CREATE INDEX IF NOT EXISTS idx_account_pushes_at ON account_pushes (at);"
  ./wr.sh d1 execute stapel-borge --remote --command "SELECT name FROM sqlite_master WHERE name LIKE 'account%';"   # 3 tables + 4 indexes
  ```
- **Way back:** the tables can stay unused, or be dropped (`DROP TABLE IF EXISTS account_pushes; … account_sessions;
  … accounts;`). Do that only before players have signed in.

### c. The Worker deploy: sign-in routes plus `signin: true` (quick security scan; best when nobody is in a live match)
- **Commands:**
  ```sh
  ./wr.sh deployments list   # note the newest id (on 12 Oct: 594c7235-b8d2-455a-8932-0489502d9736, from 1.13.1)
  ./wr.sh deploy
  curl -s -H "Origin: https://stapelspel.pages.dev" https://stapel-borge.bonkers-bunch-online.workers.dev/daily/config
  #   → {"free":3,"from":"2026-10-12","signin":true}
  curl -s -H "Origin: https://stapelspel.pages.dev" "https://stapel-borge.bonkers-bunch-online.workers.dev/board?dateKey=$(TZ=Africa/Johannesburg date +%F)" | head -c 300
  #   → today's board still answers
  ```
- **Who it reaches:** games on 1.14.0 (website or app) now show the ☁️ account section and the gentle offer. Games on
  1.13.x ignore it.
- **Way back:** `./wr.sh rollback <the id noted above> --yes --message "back to 1.13"`. Sign-in hides again
  (no `signin`), and saved progress stays in the database.

### d. The website 1.14.0: push plus Pages (quick security scan)
- **What it does:** the web game with ⚙️ Instellings, sign-in (hidden until c), the privacy pages with the account
  sections (version 2026-10-12, the release day), and everything in 1.13.4.
- **Way back:** a Pages rollback to the 1.13.4 deployment, plus a revert push.

### e. Play Console › App content › Data safety (full panel: a store listing change; needed before f)
- **What it does:**
  - "User IDs": collected, not shared, optional, used for App functionality and Account management.
  - "Account deletion": yes, link https://stapelspel.pages.dev/privaatheid#uitvee
- **Way back:** edit the form again.

### f. The app 1.14.0 (versionCode 11400) to internal testing: WAITS for Anandre's phone test (full panel)
- **The phone test (about 10 minutes):**
  - ⚙️ Instellings › ☁️ › pick his Google account › "Ingeteken met Google ✓".
  - His coins and skins are still there.
  - The website, signed in with the same account, shows the same progress.
  - Cancelling the picker shows nothing.
  - Signing out keeps everything on the phone.
  - Signing in again brings nothing twice.
- **Way back:** Internal testing › Pause track.

## Before production (not now)
REFILL and TESTER_GIFT off; the IARC gambling answers and Play's "could it appeal to children?" answered again;
the SA gambling-law opinion **before coins are ever sold for money** (Anandre: "we will sort out gambling laws if
it works").
