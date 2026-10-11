// (1.13.4) The tower's skins: backgrounds, cranes and block skins bought with coins; each kind's default is free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { SKINS, SKIN_KINDS, DEFAULT_SKIN, defaultEconomy, cleanEconomy, buySkin, wearSkin, earnCoins } from '../js/core/economy.js';
import { S as AF } from '../js/core/strings.js';
import { S_EN as EN } from '../js/core/strings.en.js';

test('every player starts with each kind\'s free default, worn', () => {
  const e = defaultEconomy();
  for (const kind of SKIN_KINDS) {
    assert.deepEqual(e.skins.owned[kind], [DEFAULT_SKIN[kind]]);
    assert.equal(e.skins.wear[kind], DEFAULT_SKIN[kind]);
    assert.equal(SKINS[kind][0].id, DEFAULT_SKIN[kind], 'the default is listed first');
    assert.equal(SKINS[kind][0].price, 0, 'the default is free');
    assert.ok(SKINS[kind].slice(1).every((c) => c.price > 0), 'every other skin costs coins');
  }
});

test('a skin costs its price once, then it can be worn for free', () => {
  let e = { ...defaultEconomy(), coins: 1000 };
  let r = buySkin(e, 'crane', 'rooi');
  assert.equal(r.ok, true);
  assert.equal(r.economy.coins, 500);
  assert.ok(r.economy.skins.owned.crane.includes('rooi'));
  r = buySkin(r.economy, 'crane', 'rooi');
  assert.equal(r.ok, false, 'never bought twice');
  assert.equal(r.economy.coins, 500);
  r = wearSkin(r.economy, 'crane', 'rooi');
  assert.equal(r.ok, true);
  assert.equal(r.economy.skins.wear.crane, 'rooi');
  r = wearSkin(r.economy, 'crane', 'geel');
  assert.equal(r.ok, true, 'the default can always be worn again');
  assert.equal(r.economy.coins, 500, 'wearing costs nothing');
});

test('too few coins, a default, an unknown skin or one not owned: nothing changes', () => {
  const e = { ...defaultEconomy(), coins: 1999 };
  assert.equal(buySkin(e, 'blocks', 'goud').ok, false);
  assert.equal(buySkin(e, 'blocks', 'goud').economy.coins, 1999);
  assert.equal(buySkin(e, 'scene', 'dag').ok, false, 'a default is never bought');
  assert.equal(buySkin(e, 'scene', 'maan').ok, false);
  assert.equal(buySkin(e, 'hat', 'rooi').ok, false);
  assert.equal(wearSkin(e, 'scene', 'nag').ok, false, 'not owned yet');
  assert.equal(wearSkin(e, 'scene', 'nag').economy.skins.wear.scene, 'dag');
});

test('a tampered or old wallet keeps only real skins and wears only owned ones', () => {
  const e = cleanEconomy({ coins: 10, skins: { owned: { crane: ['goud', 'plastiek', 7], scene: 'nag' }, wear: { crane: 'goud', scene: 'nag', blocks: 'neon' } } });
  assert.deepEqual(e.skins.owned.crane, ['geel', 'goud']);
  assert.deepEqual(e.skins.owned.scene, ['dag']);
  assert.equal(e.skins.wear.crane, 'goud');
  assert.equal(e.skins.wear.scene, 'dag', 'not owned: back to the default');
  assert.equal(e.skins.wear.blocks, 'kleur');
  const old = cleanEconomy({ coins: 50 });   // a wallet from before 1.13.4
  for (const kind of SKIN_KINDS) assert.equal(old.skins.wear[kind], DEFAULT_SKIN[kind]);
});

test('skins are never handed out by playing: only the coins move', () => {
  const r = earnCoins({ ...defaultEconomy(), coins: 0 }, 5000, '2026-10-12');
  for (const kind of SKIN_KINDS) assert.deepEqual(r.economy.skins.owned[kind], [DEFAULT_SKIN[kind]]);
});

test('the store keeps bought skins across a reload, and the price leaves the wallet', () => {
  const backend = memoryBackend();
  const t = Date.UTC(2026, 9, 12, 9);
  const store = createStore(backend, { now: () => t });
  store.refillCoins(2000, { times: 3, per: 'day' });
  assert.equal(store.getEconomy().coins, 2000);
  assert.equal(store.buySkin('scene', 'sonsondergang').ok, true);
  assert.equal(store.getEconomy().coins, 1200);
  assert.equal(store.getSkins().wear.scene, 'dag', 'buying alone doesn\'t change what is worn');
  assert.equal(store.wearSkin('scene', 'sonsondergang').ok, true);
  const again = createStore(backend, { now: () => t + 3600e3 });
  assert.ok(again.getSkins().owned.scene.includes('sonsondergang'));
  assert.equal(again.getSkins().wear.scene, 'sonsondergang');
  assert.equal(again.getEconomy().coins, 1200);
  // getSkins hands out copies
  const s = store.getSkins();
  s.owned.crane.push('goud');
  assert.ok(!store.getSkins().owned.crane.includes('goud'));
});

test('every skin has a name in Afrikaans and English, and each kind a heading', () => {
  for (const S of [AF, EN]) {
    assert.ok(S.shopSkins && S.shopSkinsNote);
    for (const kind of SKIN_KINDS) {
      assert.ok(S.skinKinds[kind], `${kind} heading`);
      for (const { id } of SKINS[kind]) assert.ok(S.skinNames[kind]?.[id], `${kind}:${id} name`);
    }
  }
});
