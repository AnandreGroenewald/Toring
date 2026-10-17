// (1.16) A store never loses a bought tribe either: a 1.15 game (the Play builds still on the test tracks) leaves the
// Living Tower's `tribes` out of its copy altogether, so the account keeps every tribe the kept save owned, and the
// one it wore unless the new copy wears one it owns (src/account.js keepOwned). Review finding V20: 1000 coins lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './support/harness.js';
import { fakeGoogle, CLIENT_ID, AUTH_SECRET } from './support/google.js';
import { keepOwned } from '../src/account.js';

const econ = (tribes) => ({
  coins: 900,
  owned: { badge: ['geen'] },
  look: { badge: 'geen' },
  skins: { owned: { blocks: ['kleur'] }, wear: { blocks: 'kleur' } },
  ...(tribes === undefined ? {} : { tribes }),
});
const save = (e) => ({ v: 1, main: { stats: { played: 3 } }, econ: e, board: { player: 'speler00000001', hidden: false } });

test('keepOwned: bought tribes stay owned, and the worn one stays on when an older game left them out', () => {
  const kept = save(econ({ owned: ['water', 'gras', 'nope'], wear: 'gras' }));
  // a 1.15 copy: no tribes at all
  const old = keepOwned(save(econ(undefined)), kept);
  assert.deepEqual(old.econ.tribes, { owned: ['water', 'gras'], wear: 'gras' });
  // a 1.16 copy that owns them and wears another of its own: its choice stays
  const chose = keepOwned(save(econ({ owned: ['water', 'gras'], wear: 'water' })), kept);
  assert.deepEqual(chose.econ.tribes, { owned: ['water', 'gras'], wear: 'water' });
  // a copy that lost one (an older merge): owned again, and it keeps wearing what it owns
  const lost = keepOwned(save(econ({ owned: ['water'], wear: 'water' })), kept);
  assert.deepEqual(lost.econ.tribes, { owned: ['water', 'gras'], wear: 'water' });
  // a copy wearing nothing it owns (an empty fresh device): the kept choice
  const empty = keepOwned(save(econ({ owned: [], wear: null })), kept);
  assert.deepEqual(empty.econ.tribes, { owned: ['water', 'gras'], wear: 'gras' });
  // a kept choice it no longer owned: the first kept one
  const odd = keepOwned(save(econ(undefined)), save(econ({ owned: ['vuur'], wear: 'water' })));
  assert.deepEqual(odd.econ.tribes, { owned: ['vuur'], wear: 'vuur' });
  // nothing kept, or odd shapes: unchanged, no throw
  assert.equal(keepOwned(save(econ(undefined)), save(econ(undefined))).econ.tribes, undefined);
  assert.equal(keepOwned(save(econ(undefined)), save(econ({ owned: 'x' }))).econ.tribes, undefined);
  assert.equal(keepOwned(save(econ('x')), kept).econ.tribes, 'x');
});

test('a 1.15 store after a 1.16 tribe purchase: the account still owns and wears the tribes, coins as sent', async () => {
  const h = createHarness({ GOOGLE_CLIENT_ID: CLIENT_ID, AUTH_SECRET });
  const google = await fakeGoogle();
  h.outside.google = google;
  const post = (path, body) => h.request('POST', path, { body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  const web = (await post('/account/google', { idToken: await google.token('109876543210987654322', h.clock.now) })).json.token;
  // the 1.16 website picks Water (free) and buys Gras (1000 coins), and wears Gras
  const a = await post('/account/store', { token: web, rev: 0, save: save(econ({ owned: ['water', 'gras'], wear: 'gras' })), push: 'push116000000001' });
  assert.equal(a.json.rev, 1);
  // the 1.15 app syncs a tower: its copy has no tribes (coins +50)
  const b = await post('/account/store', { token: web, rev: 1, save: save({ ...econ(undefined), coins: 950 }), push: 'push115000000009' });
  assert.equal(b.json.rev, 2);
  const kept = JSON.parse(h.db.q('SELECT save FROM accounts')[0].save);
  assert.deepEqual(kept.econ.tribes, { owned: ['water', 'gras'], wear: 'gras' });
  assert.equal(kept.econ.coins, 950);
});
