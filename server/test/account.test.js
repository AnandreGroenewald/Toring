// Sign in with Google and the saved progress (1.13, src/account.js + src/google.js): only Google's own tokens
// for Stapel get in; the Google number, name and email are never kept; a store must build on the version it
// read (two devices can't overwrite each other unseen); signing out ends one device's session; deleting the
// account takes its save, its sessions and its leaderboard rows; old sessions and accounts are tidied away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, DAY, T0 } from './support/harness.js';
import { fakeGoogle, CLIENT_ID, AUTH_SECRET } from './support/google.js';
import { SESSIONS_MAX, SESSION_DAYS, ACCOUNT_DAYS, SAVE_MAX_BYTES, PUSH_DAYS, pruneAccounts } from '../src/account.js';

const SUB = '109876543210987654321';
const env = { GOOGLE_CLIENT_ID: CLIENT_ID, AUTH_SECRET };
const save = (over = {}) => ({ v: 1, main: { stats: { played: 3 } }, econ: { coins: 120 }, board: { player: 'speler00000001', hidden: false }, ...over });

async function setup(over = {}) {
  const h = createHarness({ ...env, ...over });
  const google = await fakeGoogle();
  h.outside.google = google;
  const post = (path, body, opts = {}) => h.request('POST', path, { body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, ...opts });
  const signIn = async (sub = SUB, claims = {}) => post('/account/google', { idToken: await google.token(sub, h.clock.now, claims) });
  return { h, google, post, signIn };
}

test('not set up (no client ID or secret): every account route says so, nothing else changes', async () => {
  const h = createHarness();
  const r = await h.request('POST', '/account/google', { body: { idToken: 'x' } });
  assert.equal(r.status, 503);
  assert.equal(r.json.error, 'not_configured');
  const h2 = createHarness({ GOOGLE_CLIENT_ID: CLIENT_ID, AUTH_SECRET: 'too-short' });
  assert.equal((await h2.request('POST', '/account/load', { body: { token: 'a'.repeat(64) } })).status, 503);
});

test('a Google token for Stapel signs in: a session, a short account reference, no save yet; nothing personal is kept', async () => {
  const { h, signIn, google } = await setup();
  const r = await signIn();
  assert.equal(r.status, 200);
  assert.match(r.json.token, /^[a-f0-9]{64}$/);
  assert.match(r.json.account, /^[a-f0-9]{12}$/);
  assert.match(r.json.gen, /^[a-f0-9]{16}$/, 'made with the account (tells it from one deleted and made anew)');
  assert.equal((await signIn()).json.gen, r.json.gen, 'the same account, the same gen');
  assert.equal(r.json.rev, 0);
  assert.equal(r.json.save, null);
  // the same Google account is the same Stapel account; another one isn't
  assert.equal((await signIn()).json.account, r.json.account);
  assert.notEqual((await signIn('200000000000000000001')).json.account, r.json.account);
  // nothing that could name the player: not the Google number, not the email, not the name, not the token
  const everything = JSON.stringify([...h.db.q('SELECT * FROM accounts'), ...h.db.q('SELECT * FROM account_sessions')]);
  for (const s of [SUB, 'example.com', 'Anna', r.json.token]) assert.ok(!everything.includes(s), `kept ${s}`);
  assert.equal(google.calls.length, 1, "Google's keys were fetched once and kept");
});

test('only real, current Google tokens made for Stapel get in', async () => {
  const { h, google, post } = await setup();
  const now = h.clock.now;
  const t = Math.floor(now / 1000);
  const refused = [
    ['signed by someone else', await google.forged(SUB, now)],
    ['for another app', await google.token(SUB, now, { aud: '999999999999-other.apps.googleusercontent.com' })],
    ['expired', await google.token(SUB, now, { iat: t - 7200, exp: t - 3600 })],
    ['not from Google', await google.token(SUB, now, { iss: 'https://evil.example' })],
    ['made in the future', await google.token(SUB, now, { iat: t + 3600, exp: t + 7200 })],
    ['no account number', await google.token('', now)],
    ['alg none', (await google.token(SUB, now, {}, { header: { alg: 'none' } }))],
    ['an unknown key', await google.token(SUB, now, {}, { header: { kid: 'key-9' } })],
    ['not a token', 'abc.def'],
    ['too long', 'a'.repeat(5000)],
  ];
  for (const [why, idToken] of refused) {
    const r = await post('/account/google', { idToken });
    assert.equal(r.status, 401, why);
    assert.equal(r.json.error, 'bad_token', why);
  }
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM accounts')[0].n, 0, 'no account made');
  // an aud list holding Stapel is fine
  assert.equal((await post('/account/google', { idToken: await google.token(SUB, now, { aud: [CLIENT_ID, 'x'] }) })).status, 200);
});

test("Google's keys can't be reached: 503 (try again), not a refusal", async () => {
  const { google, signIn } = await setup();
  google.setDown(true);
  const r = await signIn();
  assert.equal(r.status, 503);
  assert.equal(r.json.error, 'google_unreachable');
  google.setDown(false);
  assert.equal((await signIn()).status, 200);
});

test('store and load: a store builds on the version read; a stale one gets the newer save back to merge', async () => {
  const { post, signIn } = await setup();
  const phone = (await signIn()).json.token;
  const web = (await signIn()).json.token;
  const a = await post('/account/store', { token: phone, rev: 0, save: save(), push: 'push000000000002' });
  assert.deepEqual(a.json, { ok: true, rev: 1 });
  const l = await post('/account/load', { token: web });
  assert.equal(l.json.rev, 1);
  assert.deepEqual(l.json.save, save());
  assert.deepEqual((await post('/account/load', { token: web, rev: 1 })).json, { ok: true, rev: 1, same: true });
  // the website still thinks it's at version 0: refused, with the phone's save to merge
  const stale = await post('/account/store', { token: web, rev: 0, save: save({ econ: { coins: 5 } }), push: 'push000000000003' });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'conflict');
  assert.equal(stale.json.rev, 1);
  assert.equal(stale.json.save.econ.coins, 120);
  const b = await post('/account/store', { token: web, rev: 1, save: save({ econ: { coins: 125 } }), push: 'push000000000004' });
  assert.deepEqual(b.json, { ok: true, rev: 2 });
  const back = await post('/account/load', { token: phone, rev: 1 });
  assert.equal(back.json.rev, 2);
  assert.equal(back.json.save.econ.coins, 125);
  // a new sign-in hands the latest save straight away
  const again = await signIn();
  assert.equal(again.json.rev, 2);
  assert.equal(again.json.save.econ.coins, 125);
});

test('a save is checked: the right version, not too big, a real object', async () => {
  const { post, signIn } = await setup();
  const token = (await signIn()).json.token;
  assert.equal((await post('/account/store', { token, rev: 0, save: { v: 2 }, push: 'push000000000010' })).status, 400);
  assert.equal((await post('/account/store', { token, rev: 0, save: [1, 2], push: 'push000000000011' })).status, 400);
  assert.equal((await post('/account/store', { token, rev: 0, save: save() })).status, 400, 'no push id');
  assert.equal((await post('/account/store', { token, rev: 0, save: save(), push: 'BAD ID' })).status, 400);
  assert.equal((await post('/account/store', { token, rev: -1, save: save(), push: 'push000000000005' })).status, 400);
  assert.equal((await post('/account/store', { token, rev: 0, save: save({ pad: 'x'.repeat(SAVE_MAX_BYTES) }), push: 'push000000000006' })).status, 413);
  assert.equal((await post('/account/store', { token, rev: 0, save: save(), push: 'push000000000007' })).status, 200);
});

test('a session that is unknown, signed out or malformed is refused; signing out ends only that device', async () => {
  const { post, signIn } = await setup();
  const phone = (await signIn()).json.token;
  const web = (await signIn()).json.token;
  for (const token of [undefined, 'nope', 'f'.repeat(64)]) {
    const r = await post('/account/load', { token });
    assert.equal(r.status, 401);
    assert.equal(r.json.error, 'signed_out');
  }
  assert.deepEqual((await post('/account/signout', { token: phone })).json, { ok: true });
  assert.equal((await post('/account/load', { token: phone })).status, 401, 'the phone is signed out');
  assert.equal((await post('/account/load', { token: web })).status, 200, 'the website is not');
  assert.equal((await post('/account/signout', { token: 'nonsense' })).status, 200, 'signing out twice is fine');
});

test(`at most ${SESSIONS_MAX} devices at once: the one unused longest is signed out`, async () => {
  const { h, post, signIn } = await setup();
  const first = (await signIn()).json.token;
  for (let k = 1; k < SESSIONS_MAX; k++) {
    h.clock.now += 1000;
    await signIn();
  }
  assert.equal((await post('/account/load', { token: first })).status, 200, `${SESSIONS_MAX} fit`);
  h.clock.now += 1000;
  await signIn();
  assert.equal((await post('/account/load', { token: first })).status, 401, 'the oldest went');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM account_sessions')[0].n, SESSIONS_MAX);
});

test("deleting the account takes its save, every device's session and its leaderboard rows (the day's counts follow)", async () => {
  const { h, post, signIn } = await setup();
  const player = 'speler00000001';
  const day = new Date(h.clock.now).toISOString().slice(0, 10);
  const entry = { dateKey: day, dayNumber: 1, player, name: 'Anna', heightM: 37.5, blocks: 20, durationMs: 90000 };
  await h.request('POST', '/board', { body: entry });
  await h.request('POST', '/board', { body: { ...entry, player: 'speler00000002', name: 'Bennie' }, ip: '198.51.100.9' });
  // the website's own number from before it joined the account (the save lists it under board.past)
  await h.request('POST', '/board', { body: { ...entry, player: 'speler00000003', name: 'Anna' }, ip: '198.51.100.10' });
  const phone = (await signIn()).json.token;
  const web = (await signIn()).json.token;
  await post('/account/store', { token: phone, rev: 0, save: save({ board: { player, hidden: false, past: ['speler00000003', 'NOT-A-NUMBER'] } }), push: 'push000000000008' });
  const other = (await signIn('200000000000000000001')).json.token;
  const r = await post('/account/delete', { token: web });
  assert.deepEqual(r.json, { ok: true, boardRows: 2 }, 'its number and the earlier one');
  assert.equal((await post('/account/load', { token: phone })).status, 401, 'every device is signed out');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM accounts')[0].n, 1, 'only the other account is left');
  assert.equal((await post('/account/load', { token: other })).status, 200);
  const board = await h.request('GET', `/board?dateKey=${day}`);
  assert.deepEqual(board.json.top.map((t) => t.name), ['Bennie']);
  assert.equal(board.json.players, 1);
  // signing in again starts a new, empty account
  const fresh = await signIn();
  assert.equal(fresh.json.rev, 0);
  assert.equal(fresh.json.save, null);
});

test('only the game may call, by POST', async () => {
  const { h, google } = await setup();
  const idToken = await google.token(SUB, h.clock.now);
  assert.equal((await h.request('POST', '/account/google', { body: { idToken }, origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.request('POST', '/account/google', { body: { idToken }, origin: null })).status, 403);
  assert.equal((await h.request('GET', '/account/load')).status, 405);
  assert.equal((await h.request('POST', '/account/nope', { body: {} })).status, 404);
});

test('tidying: sessions unused for a long time end, accounts unused for longer go with their save', async () => {
  const { h, post, signIn } = await setup();
  const old = (await signIn()).json.token;
  await post('/account/store', { token: old, rev: 0, save: save(), push: 'push000000000009' });
  h.clock.now += (SESSION_DAYS + 1) * DAY;
  const keep = (await signIn('200000000000000000001')).json.token;
  const r = await pruneAccounts(h.db, h.clock.now);
  assert.equal(r.sessionsEnded, 1);
  assert.equal(r.accountsDropped, 0, 'the account itself waits longer');
  assert.equal((await post('/account/load', { token: old })).status, 401);
  assert.equal((await post('/account/load', { token: keep })).status, 200);
  h.clock.now = T0 + (ACCOUNT_DAYS + 1) * DAY;
  const r2 = await pruneAccounts(h.db, h.clock.now);
  assert.equal(r2.accountsDropped, 1, 'unused for two years');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM accounts')[0].n, 1);
});

test('a store sent again (its answer was lost) counts once, even after another device saved on top', async () => {
  const { h, post, signIn } = await setup();
  const phone = (await signIn()).json.token;
  const web = (await signIn()).json.token;
  const first = { token: phone, rev: 0, save: save({ econ: { coins: 150 } }), push: 'phonepush0000001' };
  assert.deepEqual((await post('/account/store', first)).json, { ok: true, rev: 1 });
  assert.deepEqual((await post('/account/store', first)).json, { ok: true, rev: 1, again: true }, 'the same answer again');
  await post('/account/store', { token: web, rev: 1, save: save({ econ: { coins: 160 } }), push: 'webpush000000001' });
  assert.deepEqual((await post('/account/store', first)).json, { ok: true, rev: 1, again: true }, 'still known after a newer store');
  const now = await post('/account/load', { token: phone });
  assert.equal(now.json.rev, 2);
  assert.equal(now.json.save.econ.coins, 160, 'the newer save stands');
  // a store the server never got, sent on top of an old version: refused with the newer save
  const lost = await post('/account/store', { token: phone, rev: 1, save: save(), push: 'phonepush0000002' });
  assert.equal(lost.status, 409);
  // many stores later it is still known (the reviewer's case: 16 stores pushed it out of a short list)
  let rev = 2;
  for (let k = 0; k < 40; k++) {
    const r = await post('/account/store', { token: web, rev, save: save(), push: `webpush${String(k).padStart(9, '0')}x` });
    rev = r.json.rev;
  }
  assert.deepEqual((await post('/account/store', first)).json, { ok: true, rev: 1, again: true }, 'still known 40 stores later');
  // and after PUSH_DAYS the clean-up lets it go
  h.clock.now += (PUSH_DAYS + 1) * DAY;
  await pruneAccounts(h.db, h.clock.now);
  assert.equal((await post('/account/store', first)).status, 409, 'forgotten after PUSH_DAYS: an ordinary stale store (merged as usual)');
});
