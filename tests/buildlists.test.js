// (1.18) Every page of its own the game opens (the castle, the battle) is in both release builds (the website's
// pages-dist and the app's www, with the app's shim) and in the service worker's lists: a page left out reloads the
// menu on the website and shows a blank page in the app (the code review, 18 Oct 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** All .js under js/ (the pages' code). */
function jsFiles(dir = 'js') {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = `${dir}/${name}`;
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** The pages the game sends players to: location.href = 'x.html…'. */
const opened = [...new Set(jsFiles().flatMap((f) => [...read(f).matchAll(/location\.href\s*=\s*['`]([a-z0-9-]+\.html)/g)].map((m) => m[1])))].sort();

const listOf = (src, name) => {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(src);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
};

test('the game opens its own pages (castle and battle)', () => {
  assert.ok(opened.includes('kasteel.html') && opened.includes('botsing.html'), `found: ${opened.join(', ')}`);
});

test('the website build copies every page the game opens', () => {
  const files = listOf(read('tools/build-pages.mjs'), 'FILES');
  for (const p of opened) assert.ok(files.includes(p), `${p} missing from tools/build-pages.mjs FILES`);
});

test('the app build copies every page the game opens, each with the shim (Back, sharing)', () => {
  const src = read('app/build-www.mjs');
  const files = listOf(src, 'FILES');
  const shim = /for \(const page of \[([^\]]*)\]\)/.exec(src);
  const shimmed = shim ? [...shim[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  for (const p of opened) {
    assert.ok(files.includes(p), `${p} missing from app/build-www.mjs FILES`);
    assert.ok(shimmed.includes(p), `${p} gets no app shim in app/build-www.mjs`);
  }
});

test('the service worker keeps every page of its own, and never answers one with the game', () => {
  const sw = read('sw.js');
  const pages = listOf(sw, 'PAGES');
  for (const p of opened.filter((x) => x !== 'index.html')) {
    assert.ok(pages.includes(p.replace(/\.html$/, '')), `${p} missing from sw.js PAGES`);
    assert.ok(new RegExp(`^\\s+'${p.replace('.', '\\.')}',`, 'm').test(sw), `${p} missing from sw.js PRECACHE`);
  }
});
