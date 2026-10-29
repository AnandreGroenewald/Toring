// Copies the web game (the repo root) into www/ for the Android app: only what the game needs,
// with shim.js (native share sheet, back button, sponsor page on the website) loaded first.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');
const www = join(here, 'www');
// no sw.js (the files are in the app), no admin or sponsor-sales pages (those stay on the website)
// (1.12.1) the sponsorship terms stay out until sponsor sales open (the page is still a template)
const FILES = ['index.html', 'kasteel.html', 'botsing.html', 'glybaan.html', 'manifest.webmanifest', 'sponsors.json', 'privaatheid.html', 'privacy.html'];
const DIRS = ['css', 'js', 'lib', 'icons', 'img'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of FILES) cpSync(join(site, f), join(www, f));
for (const d of DIRS) cpSync(join(site, d), join(www, d), { recursive: true });
cpSync(join(here, 'shim.js'), join(www, 'app-shim.js'));
// (28 Oct 2026) the page an Android WebView older than capacitor.config.json's minWebViewVersion shows instead of the game
cpSync(join(here, 'webview-oud.html'), join(www, 'webview-oud.html'));

// (1.17) Die Kasteelreeks (kasteel.html) and (1.18) Blokbotsing (botsing.html) are pages of their own: they get the shim
// too (the share sheet, the back button)
for (const page of ['index.html', 'kasteel.html', 'botsing.html', 'glybaan.html']) {
  const path = join(www, page);
  const html = readFileSync(path, 'utf8');
  const out = html.replace('<script', '<script src="app-shim.js"></script>\n  <script');
  if (out === html) throw new Error(`${page} has no <script> to put the shim before`);
  writeFileSync(path, out);
}
// (29 Oct 2026) The game's code goes in as written. Squeezed (esbuild minify, a megabyte less) it reached the menu only
// ~25 ms sooner (CPU x4) and the River started ~0.5 s later (qa/loadtime1240.mjs), so it was taken out again.
console.log('www/ ready');
