// Height zones and the underwater look (1.12): which zone a height is in (js/core/zones.js), and how a
// block under the waterline is tinted (js/game/water.js underwaterTint: per corner, deeper = darker,
// multiplied with the cement grey; untouched above the water).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZONES, zoneAt } from '../js/core/zones.js';
import { underwaterTint } from '../js/game/water.js';
import { S } from '../js/core/strings.js';
import { S_EN as EN } from '../js/core/strings.en.js';

test('zones: 0 / 50 / 100 / 200 / 300 / 500 m, each with a name in both languages', () => {
  assert.deepEqual(ZONES.map((z) => z.from), [0, 50, 100, 200, 300, 500]);
  assert.equal(zoneAt(0), 0);
  assert.equal(zoneAt(49.9), 0);
  assert.equal(zoneAt(50), 1);
  assert.equal(zoneAt(199), 2);
  assert.equal(zoneAt(200), 3);
  assert.equal(zoneAt(5000), 5);
  assert.equal(zoneAt('x'), 0);
  for (let k = 1; k < ZONES.length; k++) {
    assert.ok(S.zoneTitle(k) && S.zoneSub(k), `af zone ${k}`);
    assert.ok(EN.zoneTitle(k) && EN.zoneSub(k), `en zone ${k}`);
  }
});

const img = (y, rotation = 0) => ({ displayWidth: 100, displayHeight: 40, originX: 0.5, originY: 0.5, rotation, y, tints: null, setTint(...t) { this.tints = t; } });
const lum = (c) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);

test('underwater: above the sea untouched; across the waterline only the lower corners; deeper is darker', () => {
  const dry = img(400);
  assert.equal(underwaterTint(dry, 600), false);
  assert.deepEqual(dry.tints, [0xffffff, 0xffffff, 0xffffff, 0xffffff]);
  const half = img(600);   // the waterline through the middle
  assert.equal(underwaterTint(half, 600), true);
  assert.equal(half.tints[0], 0xffffff);
  assert.equal(half.tints[1], 0xffffff);
  assert.notEqual(half.tints[2], 0xffffff);
  const shallow = img(640);
  const deep = img(900);
  underwaterTint(shallow, 600);
  underwaterTint(deep, 600);
  assert.ok(lum(deep.tints[0]) < lum(shallow.tints[0]), 'deeper blocks are darker');
  assert.ok((deep.tints[0] & 255) > ((deep.tints[0] >> 16) & 255), 'and blue');
  // cement stays greyer than a loose block at the same depth
  const loose = img(700);
  const set = img(700);
  underwaterTint(loose, 600, 0xffffff);
  underwaterTint(set, 600, 0xb9c1cc);
  assert.ok(lum(set.tints[0]) < lum(loose.tints[0]));
  // a tipped block: its low corner is deeper than its high one
  const tipped = img(600, 0.5);
  underwaterTint(tipped, 600);
  assert.notDeepEqual(tipped.tints[0], tipped.tints[3]);
});
