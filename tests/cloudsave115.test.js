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

// (1.15.4) 1.15.3 opens the day's weekkis box on the day's first visit, so a second device opens it too before it
// signs in (or while offline): the merge counts that day's box once (the game-tester's sign-in check, 13 Oct 2026).
function opened(coins, day, last, base = null) {
  const s = base ? clone(base) : cleanSave(null);
  s.econ.coins = coins;
  s.week = { ...s.week, day, last };
  return cleanSave(s);
}

test('a second device that opened today’s box before signing in: that box counts once', () => {
  const account = opened(173, 3, '2026-10-13');
  const guest = opened(10, 1, '2026-10-13');   // a new device's first visit: box 1
  const out = mergeSaves(guest, account, null);
  assert.equal(out.econ.coins, 173, 'the account’s coins, not 183');
  assert.equal(out.week.day, 3);
  assert.equal(out.week.last, '2026-10-13');
});

test('both sides opened today’s box since they last synced: once; a box already in the base or on another day: as before', () => {
  const base = opened(100, 3, '2026-10-12');
  const phone = opened(125, 4, '2026-10-13', base);
  const web = opened(125, 4, '2026-10-13', base);
  assert.equal(mergeSaves(web, phone, base).econ.coins, 125, 'box 4 (25) once');
  const synced = opened(125, 4, '2026-10-13', base);
  assert.equal(mergeSaves(synced, synced, synced).econ.coins, 125, 'the base had it: nothing comes off');
  const later = opened(150, 4, '2026-10-13', base);
  assert.equal(mergeSaves(later, synced, synced).econ.coins, 150, 'coins earned since: kept');
  const yesterday = opened(110, 1, '2026-10-12');
  assert.equal(mergeSaves(yesterday, opened(125, 4, '2026-10-13'), null).econ.coins, 235, 'different days: both boxes');
});
