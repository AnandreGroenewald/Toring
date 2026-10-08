# App Links for Stapel (challenge links that open in the Android app)

Android only opens `https://anandregroenewald.github.io/Toring/?kamer=…` links in the Stapel app when the
**root** of that address says the app may: `https://anandregroenewald.github.io/.well-known/assetlinks.json`.
The root is served by a separate GitHub repository, which must be named exactly
**`anandregroenewald.github.io`** (a "user site"). It holds only these files; nothing else changes.

1. On GitHub, create a new **public** repository named `anandregroenewald.github.io` (no template needed).
2. Add the two files from this folder: `_config.yml` and `.well-known/assetlinks.json`.
3. In `assetlinks.json`, replace `PLAY_APP_SIGNING_SHA256` with the SHA-256 of the **app signing key
   certificate** from Play Console → Stapel → Test and release → App integrity → App signing
   (format `AB:CD:…`). The other fingerprint is the upload key (for the test APKs), already filled in.
4. Wait a minute, then open `https://anandregroenewald.github.io/.well-known/assetlinks.json`: it must show
   the file (not a 404).
5. Install the app version that has the intent filter (1.10.0 or later) **after** that: Android checks the
   file when the app is installed or updated.

Check on a phone: Settings → Apps → Stapel → Open by default → `anandregroenewald.github.io` should be
listed as verified. Until all this is in place, links open in the browser, which offers
"Maak oop in die Stapel-app".
