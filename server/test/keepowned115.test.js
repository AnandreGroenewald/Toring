// (1.15) A store never loses a bought look or skin: an older game (1.14) cleans its copy against its own shop list
// and drops the 1.15 items it doesn't know; the account keeps every shop id the kept save owned (src/account.js
// keepOwned). Known ids only; what is worn stays the game's choice; a broken kept save changes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './support/harness.js';
import { fakeGoogle, CLIENT_ID, AUTH_SECRET } from './support/google.js';
import { keepOwned } from '../src/account.js';

const econ = (blocks, badge, wear = 'kleur', look = 'geen') => ({
  coins: 900,
  owned: { badge },
  look: { badge: look },
  skins: { owned: { blocks }, wear: { blocks: wear } },
});
const save = (e) => ({ v: 1, main: { stats: { played: 3 } }, econ: e, board: { player: 'speler00000001', hidden: false } });

test('keepOwned: the kept save’s known items stay owned; unknown ids and the worn choice are left alone', () => {
  const kept = save(econ(['kleur', 'heelal', 'nope'], ['geen', 'draak', 'x<y>'], 'heelal', 'draak'));
  const now = save(econ(['kleur'], ['geen']));
  const out = keepOwned(now, kept);
  assert.deepEqual(out.econ.skins.owned.blocks, ['kleur', 'heelal']);
  assert.deepEqual(out.econ.owned.badge, ['geen', 'draak']);
  assert.equal(out.econ.skins.wear.blocks, 'kleur', 'worn: the game decides');
  assert.equal(out.econ.look.badge, 'geen');
  // nothing to keep, odd shapes: unchanged, no throw
  assert.deepEqual(keepOwned(save(econ(['kleur'], ['geen'])), null).econ.skins.owned.blocks, ['kleur']);
  assert.deepEqual(keepOwned(save(econ(['kleur'], ['geen'])), { econ: 'x' }).econ.owned.badge, ['geen']);
  const odd = { v: 1, econ: { owned: [1, 2], skins: 'x' } };
  assert.deepEqual(keepOwned(odd, kept), { v: 1, econ: { owned: [1, 2], skins: 'x' } });
  // a save without the lists gets them back
  const bare = keepOwned({ v: 1, econ: { coins: 5 } }, kept);
  assert.deepEqual(bare.econ.owned.badge, ['geen', 'draak']);
  assert.deepEqual(bare.econ.skins.owned.blocks, ['kleur', 'heelal']);
});

test('a 1.14 store after a 1.15 purchase: the account still owns the 1.15 items, coins as sent', async () => {
  const h = createHarness({ GOOGLE_CLIENT_ID: CLIENT_ID, AUTH_SECRET });
  const google = await fakeGoogle();
  h.outside.google = google;
  const post = (path, body) => h.request('POST', path, { body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  const web = (await post('/account/google', { idToken: await google.token('109876543210987654321', h.clock.now) })).json.token;
  // the 1.15 website buys and wears the Heelal blocks and the Draak badge
  const a = await post('/account/store', { token: web, rev: 0, save: save(econ(['kleur', 'heelal'], ['geen', 'draak'], 'heelal', 'draak')), push: 'push115000000001' });
  assert.equal(a.json.rev, 1);
  // the 1.14 app syncs a tower: its copy knows neither item (coins +50)
  const old = save({ ...econ(['kleur'], ['geen']), coins: 950 });
  const b = await post('/account/store', { token: web, rev: 1, save: old, push: 'push114000000001' });
  assert.equal(b.json.rev, 2);
  const kept = JSON.parse(h.db.q('SELECT save FROM accounts')[0].save);
  assert.deepEqual(kept.econ.skins.owned.blocks, ['kleur', 'heelal']);
  assert.deepEqual(kept.econ.owned.badge, ['geen', 'draak']);
  assert.equal(kept.econ.coins, 950);
  assert.equal(kept.econ.skins.wear.blocks, 'kleur', 'what the sender wears');
  // a stale store still gets the newer save back to merge (409), unchanged
  const c = await post('/account/store', { token: web, rev: 1, save: old, push: 'push114000000002' });
  assert.equal(c.status, 409);
  // the same store sent again answers as the first time
  const again = await post('/account/store', { token: web, rev: 1, save: old, push: 'push114000000001' });
  assert.equal(again.json.rev, 2);
  assert.equal(again.json.again, true);
});
