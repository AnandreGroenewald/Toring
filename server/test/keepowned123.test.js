// (1.23) The public launch on a signed-in account: the first store of a launch save (it carries LAUNCH.id) over the account's
// save from the testing weeks (without it) starts the account again, so keepOwned gives none of the testing weeks' skins,
// looks or tribes back, and nothing it wore goes back on. From then on (a marked save kept) keepOwned works as in 1.15, also
// for an older game that sends a copy without the mark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './support/harness.js';
import { fakeGoogle, CLIENT_ID, AUTH_SECRET } from './support/google.js';
import { keepOwned } from '../src/account.js';
import { launchSave } from '../../js/core/launch.js';
import { LAUNCH } from '../../js/config.js';

const tester = () => ({
  v: 1,
  main: { stats: { played: 40 } },
  econ: {
    coins: 98000,
    owned: { badge: ['geen', 'draak'] },
    look: { badge: 'draak' },
    skins: { owned: { blocks: ['kleur', 'heelal', 'goud'], scene: ['dag', 'nag'] }, wear: { blocks: 'heelal', scene: 'nag' } },
    tribes: { owned: ['vuur', 'water'], wear: 'water' },
  },
  board: { player: 'speler00000001', past: [] },
});

test('keepOwned: a launch save over a testing-weeks save comes in as it is', () => {
  const fresh = launchSave(tester());
  assert.equal(fresh.launch, LAUNCH.id);
  const out = keepOwned(structuredClone(fresh), tester());
  assert.deepEqual(out.econ, fresh.econ);
  assert.deepEqual(out.econ.skins.owned.blocks, ['kleur', LAUNCH.skin]);
  assert.equal(out.econ.skins.wear.blocks, LAUNCH.skin);
});

test('keepOwned: after the launch it keeps what the kept save owned (also against an older game without the mark)', () => {
  const bought = { ...launchSave(tester()) };
  bought.econ = { ...bought.econ, skins: { owned: { blocks: ['kleur', LAUNCH.skin, 'neon'] }, wear: { blocks: 'neon' } } };
  // the same game, a copy that dropped the purchase
  const same = keepOwned({ ...launchSave(tester()) }, bought);
  assert.ok(same.econ.skins.owned.blocks.includes('neon'));
  // an older game's copy (no mark): the launch save's purchase stays owned too
  const older = keepOwned({ v: 1, econ: { coins: 5, skins: { owned: { blocks: ['kleur'] }, wear: { blocks: 'kleur' } } } }, bought);
  assert.ok(older.econ.skins.owned.blocks.includes('neon'));
  assert.equal(older.econ.skins.wear.blocks, 'neon', 'an older game dropped it: still on');
});

test('the account path: a tester signs in on 1.23, the launch save is kept without the testing weeks’ skins', async () => {
  const h = createHarness({ GOOGLE_CLIENT_ID: CLIENT_ID, AUTH_SECRET });
  const google = await fakeGoogle();
  h.outside.google = google;
  const post = (path, body) => h.request('POST', path, { body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  const token = (await post('/account/google', { idToken: await google.token('109876543210987654321', h.clock.now) })).json.token;
  // the testing weeks: an older game kept this save
  assert.equal((await post('/account/store', { token, rev: 0, save: tester(), push: 'push122000000001' })).json.rev, 1);
  // 1.23 reads it, makes the launch save of it and stores that
  const fresh = launchSave(tester());
  assert.equal((await post('/account/store', { token, rev: 1, save: fresh, push: 'push123000000001' })).json.rev, 2);
  const kept = JSON.parse(h.db.q('SELECT save FROM accounts')[0].save);
  assert.equal(kept.launch, LAUNCH.id);
  assert.deepEqual(kept.econ.skins.owned.blocks, ['kleur', LAUNCH.skin]);
  assert.equal(kept.econ.skins.wear.blocks, LAUNCH.skin);
  assert.equal(kept.econ.skins.owned.scene, undefined, 'no testing-weeks scene back');
  assert.equal(kept.econ.owned, undefined, 'no testing-weeks looks back');
  assert.equal(kept.econ.tribes, undefined, 'no testing-weeks tribes back');
  assert.equal(kept.econ.coins ?? 0, 0);
});
