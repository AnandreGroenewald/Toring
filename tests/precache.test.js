// The service worker must precache every file the game loads, and index.html must
// preload every module (a missing one breaks offline play or slows the first load).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Every module the game loads: the static import graph from js/main.js. */
function moduleGraph(entry) {
  const seen = new Set();
  const todo = [entry];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/^\s*(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) {
      todo.push(normalize(join(dirname(f), m[1])));
    }
  }
  return [...seen];
}

const jsFiles = moduleGraph('js/main.js').sort();

test('sw.js precaches every module, the page, styles, Phaser and the small icons', () => {
  const sw = read('sw.js');
  const list = [...sw.matchAll(/^\s+'([^']+)',/gm)].map((m) => m[1]);
  for (const f of [...jsFiles, 'index.html', 'css/style.css', 'lib/phaser.min.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png']) {
    assert.ok(list.includes(f), `${f} missing from PRECACHE`);
  }
  for (const f of list) if (f !== './') assert.ok(statSync(join(ROOT, f)).isFile(), `${f} in PRECACHE does not exist`);
});

test('index.html preloads exactly the game modules', () => {
  const html = read('index.html');
  const pre = [...html.matchAll(/rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(pre, jsFiles);
});

test('release versions agree (config.js VERSION and the sw.js cache name)', () => {
  const v = /VERSION = '([\d.]+)'/.exec(read('js/config.js'))[1];
  assert.match(read('sw.js'), new RegExp(`'stapel-v${v.replace(/\./g, '\\.')}'`));
});
