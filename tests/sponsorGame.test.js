// In-game sponsorship: billboard wording, named block textures, and a share text
// that never mentions sponsors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { billboardContent } from '../js/game/billboard.js';
import { textureKeyFor } from '../js/game/blocks.js';
import { createSequence } from '../js/core/sequence.js';
import { createBlockNamer } from '../js/core/sponsors.js';
import { S } from '../js/core/strings.js';

test('billboard: premium sponsor shows name, tagline and the bare hostname', () => {
  const c = billboardContent({ id: 'p1', name: 'Vonk Elektries', tagline: 'Ligte aan', url: 'https://www.vonk.co.za/kontak' }, false);
  assert.deepEqual(c, { kind: 'sponsor', name: 'Vonk Elektries', tagline: 'Ligte aan', host: 'vonk.co.za' });
  const bare = billboardContent({ id: 'p2', name: 'Bakkery', tagline: '', url: '' }, true);
  assert.equal(bare.host, '');
  assert.equal(bare.tagline, '');
  assert.equal(billboardContent({ id: 'p3', name: 'X', url: 'http://insecure.example' }, true).host, '');
});

test('billboard: empty states depend on whether sales are on', () => {
  assert.deepEqual(billboardContent(null, true), { kind: 'free', name: S.boardFree, tagline: S.boardFreeSub, host: '' });
  assert.deepEqual(billboardContent(null, false), { kind: 'house', name: S.title, tagline: S.tagline, host: '' });
  assert.equal(S.boardFree, 'Jou advertensie hier!');
  assert.equal(S.boardFreeSub, 'Adverteer op Stapel');
});

test('named block textures get their own key; the plain key is unchanged', () => {
  const spec = { i: 3, shape: 'plank', scale: 1, color: 2 };
  const plain = textureKeyFor(spec);
  assert.equal(textureKeyFor(spec, null), plain);
  const a = textureKeyFor(spec, 'Karoo Koffie');
  assert.ok(a.startsWith(plain + '_n'));
  assert.equal(textureKeyFor(spec, 'Karoo Koffie'), a);
  assert.notEqual(textureKeyFor(spec, 'Bakkery Bester'), a);
});

test('block names follow the sequence: same seed, same names, never on cubes', () => {
  const block = [{ id: 'b1', name: 'Bakkery Bester' }, { id: 'b2', name: 'Karoo Koffie' }, { id: 'b3', name: 'Vonk' }];
  const run = () => {
    const seq = createSequence('oefen/demo7');
    const name = createBlockNamer(block, seq.seed, (i) => seq.block(i));
    return Array.from({ length: 60 }, (_, i) => ({ shape: seq.block(i).shape, name: name(seq.block(i)) }));
  };
  const a = run();
  assert.deepEqual(run(), a);
  for (const b of a) if (b.shape === 'cube') assert.equal(b.name, null);
  for (const b of a) if (b.shape === 'pillar' && b.name) assert.ok(b.name.length <= 8);
  assert.ok(a.filter((b) => b.name).length > 30);
});

test('the WhatsApp share text module knows nothing about sponsors', () => {
  const src = readFileSync(new URL('../js/core/share.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /sponsor|borg|advert/i);
});
