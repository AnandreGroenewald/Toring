// (1.15) An older game (1.14) cleans a synced save against its own shop list: the 1.15 looks and skins it doesn't
// know are gone from its copy and it wears the standard ones. The 1.15 merge keeps them owned (both sides' owned)
// and keeps wearing them here when the account's copy went back to the standard one and no longer owns them
// (js/core/cloudsave.js `worn`); a deliberate change on another 1.15 device is still followed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSaves } from '../js/core/cloudsave.js';
import { cleanSave } from '../js/core/storage.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
function synced() {
  const s = cleanSave(null);
  s.econ.coins = 5000;
  return cleanSave(s);
}
/** The 1.15 website buys and wears the Heelal blocks (3 500) and the Draak badge (600). */
function webBuys(base) {
  const w = clone(base);
  w.econ.coins = 900;
  w.econ.skins.owned.blocks.push('heelal');
  w.econ.skins.wear.blocks = 'heelal';
  w.econ.owned.badge.push('draak');
  w.econ.look.badge = 'draak';
  return cleanSave(w);
}

test('after a 1.14 sync dropped them, the 1.15 website still owns and wears its new items; coins as merged', () => {
  const s1 = webBuys(synced());
  // what the 1.14 app uploads after a tower (+50): neither item, the standard ones worn
  const m = clone(s1);
  m.econ.coins = 950;
  m.econ.skins.owned.blocks = ['kleur'];
  m.econ.skins.wear.blocks = 'kleur';
  m.econ.owned.badge = ['geen'];
  m.econ.look.badge = 'geen';
  const out = mergeSaves(s1, cleanSave(m), s1);
  assert.ok(out.econ.skins.owned.blocks.includes('heelal'));
  assert.equal(out.econ.skins.wear.blocks, 'heelal');
  assert.ok(out.econ.owned.badge.includes('draak'));
  assert.equal(out.econ.look.badge, 'draak');
  assert.equal(out.econ.coins, 950);
});

test('another 1.15 device that changed what it wears is still followed', () => {
  const s1 = webBuys(synced());
  // the phone (1.15, owns everything) puts the standard blocks back on and buys and wears Klip
  const p = clone(s1);
  p.econ.skins.wear.blocks = 'kleur';
  p.econ.coins = 900 - 300;
  p.econ.skins.owned.blocks.push('klip');
  const phone = cleanSave(p);
  const out = mergeSaves(s1, phone, s1);
  assert.equal(out.econ.skins.wear.blocks, 'kleur', 'the phone owns heelal: its standard blocks are a choice');
  const p2 = clone(phone);
  p2.econ.skins.wear.blocks = 'klip';
  assert.equal(mergeSaves(s1, cleanSave(p2), s1).econ.skins.wear.blocks, 'klip');
});

test('the first merge still takes the account’s choice', () => {
  const s1 = webBuys(synced());
  const fresh = cleanSave(null);
  const out = mergeSaves(fresh, s1, null);
  assert.equal(out.econ.skins.wear.blocks, 'heelal');
  assert.equal(out.econ.look.badge, 'draak');
});
