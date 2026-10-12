// (1.15) Both privacy pages name every key the game keeps on the device (section 11 promises "exactly what we store").
// Found: every 'stapel.…' key written out in js/ (keys built from STORAGE_KEY, like stapel.v1.econ, are listed by hand
// below). Not storage: the Web Lock 'stapel.stake'; the admin page's own token is not part of the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NOT_STORAGE = new Set(['stapel.stake', 'stapel.admin.token']);
const BUILT = ['stapel.v1.econ', 'stapel.v1.lang', 'stapel.v1.board', 'stapel.v1.refill', 'stapel.v1.ranks', 'stapel.v1.retry', 'stapel.v1.tries', 'stapel.v1.signoffer', 'stapel.v1.cloud', 'stapel.v1.week', 'stapel.v1.remind', 'stapel.v1.score'];

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('every stapel.* key the game keeps is named on both privacy pages', () => {
  const keys = new Set(BUILT);
  for (const f of files('js')) for (const m of readFileSync(f, 'utf8').matchAll(/['"`](stapel\.[A-Za-z0-9_.]+)['"`]/g)) keys.add(m[1]);
  for (const k of NOT_STORAGE) keys.delete(k);
  assert.ok(keys.size >= 15, `found ${keys.size}`);
  for (const page of ['privaatheid.html', 'privacy.html']) {
    const html = readFileSync(page, 'utf8');
    const missing = [...keys].filter((k) => !html.includes(`<code>${k}</code>`));
    assert.deepEqual(missing, [], `${page} doesn't name ${missing.join(', ')}`);
  }
});
