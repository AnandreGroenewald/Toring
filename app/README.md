# Stapel: Android app (Google Play)

The web game (the repo root) packed as an Android app with Capacitor 8. The game files ship inside the app, so it plays offline, and the website keeps working as before.

| | |
| --- | --- |
| App ID | `za.co.lekkerlocal.stapel` (permanent once uploaded to Google Play) |
| Version | from `js/config.js` `VERSION`: 1.7.2 is versionName `1.7.2`, versionCode `10702` (`android/app/build.gradle`). Every Play upload needs a higher one, so bump `VERSION` (and `sw.js`) as for every release. |
| Android | minSdk 24 (Android 7), target and compile SDK 36 (Android 16, Google Play's requirement from 31 Aug 2026). Portrait on phones. Permissions: internet, vibrate. |
| Developer account | Google Play organisation account "Lekker Local" (Sportscard Trading PTY LTD). |

## Building

Needs JDK 21 (`~/Library/Java/JavaVirtualMachines/jdk-21*`), the Android SDK (`~/Library/Android/sdk`), Node, and Google Chrome for the tools.

```sh
cd app
npm install
export JAVA_HOME=$(ls -d ~/Library/Java/JavaVirtualMachines/jdk-21*/Contents/Home | head -1) ANDROID_HOME=~/Library/Android/sdk
npm run bundle
```

`npm run bundle` copies the game into `www/` (`build-www.mjs`), syncs Capacitor and builds:

- `android/app/build/outputs/bundle/release/app-release.aab`: the file for Google Play;
- `android/app/build/outputs/apk/release/app-release.apk`: for installing straight onto a phone to test.

## Signing

The Google Play **upload key** is `~/Documents/Stapel signing/stapel-upload.jks` (alias `stapel-upload`). Its password is in the macOS Keychain as "Stapel upload key", and `build.gradle` reads it from there. Neither is ever committed. Google signs the app for phones with its own key (Play App Signing). If the upload key is lost, the owner can ask for an upload key reset in Play Console. Without the key, release builds come out unsigned.

## What is different in the app

The app runs the same files as the website, so the game itself has only small app-aware lines. Each is harmless on the web:

- `shim.js` (copied to `www/app-shim.js` and loaded before the game) talks to Capacitor's bridge directly:
  - the Deel button gets Android's share sheet (`@capacitor/share`);
  - the back button takes one step back (`stapel:back` event, `goBack()` in `js/ui/dom.js`, the same as Escape) and closes the app on the start screen (`@capacitor/app`);
  - the sponsor page (`adverteer.html`, not shipped) opens on the website.
- `js/main.js` `IN_APP`: no service worker, and share links point at the website rather than `https://localhost`.
- `js/core/install.js`: the app counts as installed (no install tip).
- The safe-area probes in `main.js` and `dom.js` also read Capacitor's `--safe-area-inset-*` variables. SystemBars `insetsHandling` is `native`, so on old WebViews Capacitor pads the view itself.
- WhatsApp links (`wa.me`) open in WhatsApp: Capacitor hands outside links to Android.

## Store assets

- `tools/icons.mjs`: launcher icons (adaptive icon split from `icons/icon.svg`), the launch-screen logo and `store/play-icon-512.png`.
- `tools/feature-graphic.mjs`: `store/feature-graphic.png` (1024 × 500).
- `tools/screenshots.mjs`: `store/screenshots/*.png` (1080 × 1920; run after `build-www.mjs`).
- `store/listing-af.txt` and `store/listing-en.txt`: the store texts (name, short and full description).

## Releasing an update

1. Bump `VERSION` in `js/config.js` and `sw.js` as usual, and test the web game.
2. Run `npm run bundle`.
3. In Play Console, create a new release (internal testing first, then production) and upload `app-release.aab`.
