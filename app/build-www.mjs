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
const FILES = ['index.html', 'manifest.webmanifest', 'sponsors.json', 'privaatheid.html', 'privacy.html'];
const DIRS = ['css', 'js', 'lib', 'icons'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of FILES) cpSync(join(site, f), join(www, f));
for (const d of DIRS) cpSync(join(site, d), join(www, d), { recursive: true });
cpSync(join(here, 'shim.js'), join(www, 'app-shim.js'));

const indexPath = join(www, 'index.html');
const html = readFileSync(indexPath, 'utf8');
const out = html.replace('<script', '<script src="app-shim.js"></script>\n  <script');
if (out === html) throw new Error('index.html has no <script> to put the shim before');
writeFileSync(indexPath, out);
console.log('www/ ready');
