// The website for Cloudflare Pages (https://stapelspel.pages.dev/, the Lekker Local account): the game's
// files into pages-dist/, with the Android App Links file and a few headers. Deploy with:
//   node tools/build-pages.mjs && (cd server && npx wrangler pages deploy ../pages-dist --project-name stapelspel --branch main)
// The old address (GitHub Pages, anandregroenewald.github.io/Toring/) still serves the repo; js/moved.js
// sends its visitors here.
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'pages-dist');
const FILES = ['index.html', 'admin.html', 'adverteer.html', 'privaatheid.html', 'privacy.html', 'terme.html', 'manifest.webmanifest', 'sponsors.json', 'sw.js'];
const DIRS = ['css', 'js', 'lib', 'icons'];

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, '.well-known'), { recursive: true });
for (const f of FILES) cpSync(join(root, f), join(out, f));
for (const d of DIRS) cpSync(join(root, d), join(out, d), { recursive: true });

// Android App Links: only real fingerprints (the Play key's is added once known)
const links = JSON.parse(readFileSync(join(root, 'app/applinks/.well-known/assetlinks.json'), 'utf8'));
for (const st of links) st.target.sha256_cert_fingerprints = st.target.sha256_cert_fingerprints.filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
writeFileSync(join(out, '.well-known/assetlinks.json'), `${JSON.stringify(links, null, 2)}\n`);

// the service worker is always checked for a new version; the rest as Pages does by default
writeFileSync(join(out, '_headers'), [
  '/sw.js',
  '  Cache-Control: no-cache',
  '/*',
  '  X-Content-Type-Options: nosniff',
  '',
].join('\n'));
console.log(`pages-dist: ${FILES.length} files, ${DIRS.join(', ')}, .well-known/assetlinks.json, _headers`);
