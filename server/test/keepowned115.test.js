// (1.15) A store never loses a bought look or skin: an older game (1.14) cleans its copy against its own shop list
// and drops the 1.15 items it doesn't know; the account keeps every shop id the kept save owned, and the one it wore
// when the new copy went back to the standard one without owning it (src/account.js keepOwned). A game that owns the
// item and wears the standard one chose it. Known ids only; a broken kept save changes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './support/harness.js';
import { fakeGoogle, CLIENT_ID, AUTH_SECRET } from './support/google.js';
import { keepOwned } from '../src/account.js';
import { mergeSaves } from '../../js/core/cloudsave.js';
import { cleanSave } from '../../js/core/storage.js';

const econ = (blocks, badge, wear = 'kleur', look = 'geen') => ({
  coins: 900,
  owned: { badge },
  look: { badge: look },
  skins: { owned: { blocks }, wear: { blocks: wear } },
});
const save = (e) => ({ v: 1, main: { stats: { played: 3 } }, econ: e, board: { player: 'speler00000001', hidden: false } });

test('keepOwned: the kept save’s known items stay owned, and stay on when an older game dropped them', () => {
  const kept = save(econ(['kleur', 'heelal', 'nope'], ['geen', 'draak', 'x<y>'], 'heelal', 'draak'));
  const now = save(econ(['kleur'], ['geen']));
  const out = keepOwned(now, kept);
  assert.deepEqual(out.econ.skins.owned.blocks, ['kleur', 'heelal']);
  assert.deepEqual(out.econ.owned.badge, ['geen', 'draak']);
  assert.equal(out.econ.skins.wear.blocks, 'heelal', 'the sender wore the standard one and lacked heelal: dropped');
  assert.equal(out.econ.look.badge, 'draak');
  // a 1.15 sender that owns them and went back to the standard ones chose that
  const chose = keepOwned(save(econ(['kleur', 'heelal'], ['geen', 'draak'])), kept);
  assert.equal(chose.econ.skins.wear.blocks, 'kleur');
  assert.equal(chose.econ.look.badge, 'geen');
  // a sender wearing something else it owns keeps it; an unknown kept choice is never put on
  assert.equal(keepOwned(save(econ(['kleur', 'klip'], ['geen'], 'klip')), kept).econ.skins.wear.blocks, 'klip');
  const unknown = keepOwned(save(econ(['kleur'], ['geen'])), save(econ(['kleur', 'nope'], ['geen'], 'nope')));
  assert.equal(unknown.econ.skins.wear.blocks, 'kleur');
  assert.deepEqual(unknown.econ.skins.owned.blocks, ['kleur']);
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
  assert.equal(kept.econ.skins.wear.blocks, 'heelal', 'still on');
  assert.equal(kept.econ.look.badge, 'draak');
  // a stale store still gets the newer save back to merge (409), unchanged
  const c = await post('/account/store', { token: web, rev: 1, save: old, push: 'push114000000002' });
  assert.equal(c.status, 409);
  // the same store sent again answers as the first time
  const again = await post('/account/store', { token: web, rev: 1, save: old, push: 'push114000000001' });
  assert.equal(again.json.rev, 2);
  assert.equal(again.json.again, true);
});

test('the whole path: website buys, a 1.14 app syncs through the server, the website merges: still owned and worn', () => {
  const s0 = cleanSave(null);
  s0.econ.coins = 5000;
  const base = cleanSave(s0);
  const w = structuredClone(base);
  w.econ.coins = 900;
  w.econ.skins.owned.blocks.push('heelal');
  w.econ.skins.wear.blocks = 'heelal';
  w.econ.owned.badge.push('draak');
  w.econ.look.badge = 'draak';
  const s1 = cleanSave(w);
  // what a 1.14 app sends after a tower (+50): neither item, the standard ones worn
  const m = structuredClone(s1);
  m.econ.coins = 950;
  m.econ.skins.owned.blocks = ['kleur'];
  m.econ.skins.wear.blocks = 'kleur';
  m.econ.owned.badge = ['geen'];
  m.econ.look.badge = 'geen';
  const stored = keepOwned(structuredClone(m), structuredClone(s1));
  const web = mergeSaves(s1, cleanSave(stored), s1);
  assert.equal(web.econ.skins.wear.blocks, 'heelal');
  assert.equal(web.econ.look.badge, 'draak');
  assert.ok(web.econ.skins.owned.blocks.includes('heelal') && web.econ.owned.badge.includes('draak'));
  assert.equal(web.econ.coins, 950);
  // a new 1.15 phone that signs in now gets them, on
  const phone = mergeSaves(cleanSave(null), cleanSave(stored), null);
  assert.equal(phone.econ.skins.wear.blocks, 'heelal');
  assert.equal(phone.econ.look.badge, 'draak');
});
