# Stapel 1.14: Sign in with Google — what Anandre approves, in order

Prepared 12 Oct 2026 (early morning) on branch `stapel-1.14-signin`. Nothing here is live yet. Google's side (the
project, the sign-in screen, the web key, both Android keys and "Publish app") is **done** (Anandre, 12 Oct ~04:30).

## The rule for this version (Anandre, 12 Oct ~04:40)
> "its just people skipped the payment section due to login, people want it as simple as possilbe"

- **Never a gate.** No sign-in before playing, a match, the Winkel or any future payment. A guest plays exactly as
  in 1.13.4.
- **One tap.** Google's own button on the website; the phone's own account picker in the app. No forms, no
  passwords, no typing an email, no extra screens.
- **No nagging.** No popup on start. The ☁️ button sits in 📊 Statistiek, and one gentle offer comes at a good moment
  (a new best, or just after a purchase): "Bêre jou vordering met Google · een tik". It shows at most once every
  60 days, and ✕ closes it.
- **Nothing breaks.** If you cancel, nothing is shown. If it fails, one calm toast ("Inteken het nie nou gewerk nie.
  Jy speel gewoon verder.") and the game goes on.
- **Nobody loses anything.** Signing in keeps the phone's progress and adds it to the account (merge, never wipe).
- **Hidden until it works.** The game shows sign-in only once the server says it's open, so the website or app can
  go out first without a sign-in button that can't work yet.

## The approvals, in order
Each goes out only after its Critic Panel (the full panel for a, b and e; the quick security scan for c and d's
push; the full panel for f) and your yes.

### a. The server secret `AUTH_SECRET` (once, never changed)
- **What it does:** turns a Google account's number into Stapel's own account number (so we never keep the Google
  number, name or email). A long random value, made on this Mac and stored as a Cloudflare secret and in the
  Keychain.
- **Who it reaches:** nobody yet. It's a server setting; nothing changes for players until c.
- **Way back:** none needed (an unused secret does nothing). It must **never change** once players sign in, because
  their account numbers come from it.
- **Panel:** full (a live secret).

### b. The database change `0006_accounts.sql`
- **What it does:** adds three empty tables (accounts, their devices' sessions, the save history). Existing tables
  are untouched. It's safe to run twice.
- **Who it reaches:** nobody yet.
- **Way back:** the tables can stay unused, or be dropped.
- **Panel:** full (a live database).

### c. The Worker deploy (the sign-in routes + `signin: true`)
- **What it does:** the server can now check Google sign-ins and keep saves. `GET /daily/config` starts saying
  `signin: true`.
- **Who it reaches:** players on 1.14.0 (website or app) see the ☁️ button and the gentle offer. Older games
  (1.13.x) ignore it.
- **Way back:** `./wr.sh rollback <the previous Worker id> --yes`. The previous Worker hides sign-in again (no
  `signin`), and saved progress stays in the database.
- **Best time:** when nobody is in a live match (a deploy can drop a live match).
- **Panel:** quick security scan (Worker deploy); the panel's rule for live secrets and databases covers a and b.

### d. The website 1.14.0 (push + Pages)
- **What it does:** the web game with sign-in (hidden until c), the privacy pages with the account sections, and
  everything in 1.13.4.
- **Who it reaches:** everyone on stapelspel.pages.dev.
- **Way back:** a Pages rollback to the 1.13.4 deployment, plus a revert push.
- **Panel:** quick security scan (website).

### e. Play Console › App content › Data safety
- **What it does:** tells Google Play what the app now collects. Under "User IDs": collected, not shared,
  optional, used for "App functionality" and "Account management". Under "Account deletion": yes, with the link
  https://stapelspel.pages.dev/privaatheid#uitvee
- **Who it reaches:** the Play listing (Google reviews it).
- **Way back:** edit the form again.
- **Panel:** full (a store listing change). **Needed before f.**

### f. The app 1.14.0 (versionCode 11400) to internal testing, plus your phone test
- **What it does:** the 17 testers get the app with sign-in (the phone's own Google account picker).
- **Your phone test (about 10 minutes):**
  - Statistiek › ☁️ › pick your Google account.
  - "Ingeteken!" appears, and your coins and skins are still there.
  - The website, signed in with the same account, shows the same progress.
  - Cancelling the picker shows nothing.
  - Signing out and back in brings it all back.
- **Way back:** Internal testing › Pause track.
- **Panel:** full (a Play upload).

## Before production (not now)
REFILL and TESTER_GIFT off; the IARC gambling answers and Play's "could it appeal to children?" answered again;
the SA gambling-law opinion before coins are ever sold.
