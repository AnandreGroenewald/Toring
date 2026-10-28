// Sign in with Google on the device (1.13, js/account.js) against the real Worker (server/src/account.js on
// node:sqlite) and a fake Google: a phone and the website share one account; a lost answer, two devices
// saving at once, a sign-out elsewhere, signing out, deleting, and a sync that waits for a tower to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { createAccount } from '../js/account.js';
import { createHarness, ORIGIN } from '../server/test/support/harness.js';
import { fakeGoogle, CLIENT_ID, AUTH_SECRET } from '../server/test/support/google.js';
import { LAUNCH } from '../js/config.js';
import { launchReset } from '../js/core/launch.js';

const D1 = '2026-10-06';
const at = (key, h = 10) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10), h);
const result = (dateKey, heightM) => ({ mode: 'daily', dateKey, heightM, score: heightM * 10, perfects: 2, blocksDropped: 20, grid: 'PG' });

async function world(over = {}) {
  const h = createHarness({ GOOGLE_CLIENT_ID: CLIENT_ID, AUTH_SECRET, ...over });
  h.outside.google = await fakeGoogle();
  const net = { drop: null, down: false };
  // the browser's fetch, to the Worker in this process (`drop`: the request arrives, its answer is lost)
  const fetchImpl = async (url, init) => {
    if (net.down) throw new TypeError('offline');
    const req = new Request(url, { method: init.method, body: init.body, headers: { ...init.headers, Origin: ORIGIN, 'CF-Connecting-IP': '198.51.100.7' } });
    const res = await h.worker.fetch(req, h.env);
    const path = new URL(url).pathname;
    if (net.drop === path) {
      net.drop = null;
      throw new TypeError('connection lost');
    }
    return res;
  };
  const device = () => {
    const clock = { t: at(D1) };
    const backend = memoryBackend();
    const store = createStore(backend, { now: () => clock.t });
    const events = [];
    const gate = { open: true };
    const account = createAccount({
      store, bus: { emit: (e, p) => events.push([e, p?.why]) }, apiUrl: 'https://api.test', clientId: CLIENT_ID,
      storageKey: 'stapel.v1', today: () => D1, canApply: () => gate.open, backend, fetchImpl, now: () => clock.t, native: () => null,
    });
    return { store, account, events, gate, clock, backend, fetchImpl, play(key, heightM) { store.startDaily(key, result(key, 0)); store.finishDaily(key, result(key, heightM)); } };
  };
  const token = (sub = 'anna-google-1') => h.outside.google.token(sub, h.clock.now);
  return { h, net, device, token };
}

test('sign in on the phone, then on the website: the same progress; changes on either side reach the other', async () => {
  const { device, token } = await world();
  const phone = device();
  phone.play(D1, 30);
  phone.store.earnCoins(120, { capped: false });
  assert.equal(phone.account.on, true);
  assert.equal(await phone.account.signInWithToken(await token()), 'saved');
  assert.equal(phone.account.status().signedIn, true);
  const web = device();
  assert.equal(await web.account.signInWithToken(await token()), 'same', 'the website takes the account as it is');
  assert.equal(web.store.getEconomy().coins, phone.store.getEconomy().coins);
  assert.equal(web.store.getDailyBest(D1).heightM, 30);
  assert.ok(web.events.some(([e, why]) => e === 'account:changed' && why === 'merged'), 'the screens are told');
  web.store.earnCoins(40, { capped: false });
  assert.equal(await web.account.sync(), 'saved');
  assert.equal(await phone.account.sync(), 'same');
  assert.equal(phone.store.getEconomy().coins, web.store.getEconomy().coins);
  assert.equal(await phone.account.sync(), 'same', 'nothing new: nothing sent');
});

test('two devices saving at once: the second merges with the first and both end up equal', async () => {
  const { device, token } = await world();
  const phone = device();
  const web = device();
  await phone.account.signInWithToken(await token());
  await web.account.signInWithToken(await token());
  phone.store.earnCoins(50, { capped: false });
  web.store.earnCoins(70, { capped: false });
  await Promise.all([phone.account.sync(), web.account.sync()]);
  await phone.account.sync();
  assert.equal(phone.store.getEconomy().coins, 120);
  assert.equal(web.store.getEconomy().coins, 120);
});

test('an answer lost on the way back: the store goes again and still counts once', async () => {
  const { device, token, net } = await world();
  const phone = device();
  await phone.account.signInWithToken(await token());
  phone.store.earnCoins(100, { capped: false });
  net.drop = '/account/store';
  assert.equal(await phone.account.sync(), 'offline');
  assert.equal(phone.account.status().error, 'offline');
  const web = device();
  await web.account.signInWithToken(await token());
  assert.equal(web.store.getEconomy().coins, 100, 'it did reach the account');
  web.store.earnCoins(10, { capped: false });
  await web.account.sync();
  assert.equal(await phone.account.sync(), 'same');
  assert.equal(phone.store.getEconomy().coins, 110, 'not 210');
  assert.equal(phone.account.status().error, null);
});

test('offline: the game carries on, and the next sync catches up', async () => {
  const { device, token, net } = await world();
  const phone = device();
  await phone.account.signInWithToken(await token());
  net.down = true;
  phone.store.earnCoins(30, { capped: false });
  assert.equal(await phone.account.sync(), 'offline');
  net.down = false;
  assert.equal(await phone.account.sync(), 'saved');
  const web = device();
  await web.account.signInWithToken(await token());
  assert.equal(web.store.getEconomy().coins, 30);
});

test('a sync waits while a tower is being built, and runs when it ends', async () => {
  const { device, token } = await world();
  const phone = device();
  await phone.account.signInWithToken(await token());
  phone.gate.open = false;
  phone.store.earnCoins(25, { capped: false });
  assert.equal(await phone.account.sync(), 'later');
  phone.gate.open = true;
  phone.account.wake();
  await new Promise((r) => setTimeout(r, 50));
  const web = device();
  await web.account.signInWithToken(await token());
  assert.equal(web.store.getEconomy().coins, 25);
});

test('1.14 signing out keeps everything on this device (the owner: "it need to keep everything"); signing in again counts nothing twice', async () => {
  const { device, token, net } = await world();
  const phone = device();
  phone.play(D1, 22);
  phone.store.buySkin?.('crane', 'rooi');
  await phone.account.signInWithToken(await token());
  phone.store.earnCoins(60, { capped: false });
  await phone.account.signOut();
  const s = phone.account.status();
  assert.deepEqual([s.signedIn, s.out], [false, false], 'signed out by the player: no "you were signed out" warning');
  assert.equal(phone.store.getEconomy().coins, 60, 'the coins stay');
  assert.equal(phone.store.getDailyBest(D1).heightM, 22, 'the towers stay');
  assert.equal(phone.store.getStats(D1).played, 1);
  // a guest again: plays on, signs out offline too
  phone.store.earnCoins(15, { capped: false });
  await phone.account.signInWithToken(await token());
  assert.equal(phone.store.getEconomy().coins, 75, 'signing in again: the account\'s 60 are not added a second time');
  net.down = true;
  phone.store.earnCoins(5, { capped: false });
  await phone.account.signOut();   // offline: it still signs out, and keeps everything
  assert.equal(phone.account.status().signedIn, false);
  assert.equal(phone.store.getEconomy().coins, 80);
  net.down = false;
  await phone.account.signInWithToken(await token());
  assert.equal(phone.store.getEconomy().coins, 80, 'the 5 earned offline went with this sign-in, once');
  const check = device();
  await check.account.signInWithToken(await token());
  assert.equal(check.store.getEconomy().coins, 80, 'the account has it all');
});

test('signed out elsewhere (the account deleted on the website): this device keeps its progress and says so', async () => {
  const { device, token } = await world();
  const phone = device();
  const web = device();
  phone.store.earnCoins(45, { capped: false });
  await phone.account.signInWithToken(await token());
  await web.account.signInWithToken(await token());
  await web.account.deleteAccount();
  assert.equal(web.account.status().signedIn, false);
  assert.equal(web.store.getEconomy().coins, 45, '(1.14) the website keeps what it has: deleting deletes the account, not this device');
  assert.equal(await phone.account.sync(), 'out');
  const s = phone.account.status();
  assert.deepEqual([s.signedIn, s.out], [false, true]);
  assert.equal(phone.store.getEconomy().coins, 45, 'the phone keeps what it has');
  // signing in again makes a new account with what the phone has
  await phone.account.signInWithToken(await token());
  const fresh = device();
  await fresh.account.signInWithToken(await token());
  assert.equal(fresh.store.getEconomy().coins, 45);
});

test('no client ID or no server: sign-in is off and nothing is sent', async () => {
  const store = createStore(memoryBackend());
  let calls = 0;
  const off = createAccount({ store, bus: { emit() {} }, apiUrl: 'https://api.test', clientId: '', storageKey: 'k', today: () => D1, fetchImpl: () => { calls++; }, native: () => null });
  assert.equal(off.on, false);
  assert.equal(await off.sync(), 'off');
  await assert.rejects(off.signInWithToken('x'), /not_configured/);
  assert.equal(calls, 0);
});

// --- the review's cases (9 Oct 2026) ----------------------------------------------------------------------

test('a lost answer, then 20 stores from another device: the phone\'s store still counts once', async () => {
  const { device, token, net } = await world();
  const phone = device();
  const web = device();
  await phone.account.signInWithToken(await token());
  await web.account.signInWithToken(await token());
  phone.store.earnCoins(100, { capped: false });
  net.drop = '/account/store';
  assert.equal(await phone.account.sync(), 'offline');
  for (let k = 0; k < 20; k++) {
    web.store.earnCoins(1, { capped: false });
    await web.account.sync();
  }
  await phone.account.sync();
  await web.account.sync();
  assert.equal(phone.store.getEconomy().coins, 120, 'not 220');
  assert.equal(web.store.getEconomy().coins, 120);
});

test('a lost answer, then the server signs the phone out: signing in again sends it first, and it counts once', async () => {
  const { device, token, net } = await world();
  const phone = device();
  await phone.account.signInWithToken(await token());
  phone.store.earnCoins(100, { capped: false });
  net.drop = '/account/store';
  assert.equal(await phone.account.sync(), 'offline');
  // ten other sign-ins push the phone's session out
  for (let k = 0; k < 10; k++) await device().account.signInWithToken(await token());
  assert.equal(await phone.account.sync(), 'out');
  assert.equal(phone.account.status().out, true);
  assert.equal(phone.store.getEconomy().coins, 100, 'the progress stays');
  await phone.account.signInWithToken(await token());
  assert.equal(phone.store.getEconomy().coins, 100, 'not 200');
  const fresh = device();
  await fresh.account.signInWithToken(await token());
  assert.equal(fresh.store.getEconomy().coins, 100);
});

test('1.14 signing out after the server already signed this device out: it signs out, and the progress stays', async () => {
  const { device, token } = await world();
  const phone = device();
  await phone.account.signInWithToken(await token());
  phone.store.earnCoins(80, { capped: false });
  for (let k = 0; k < 10; k++) await device().account.signInWithToken(await token());
  await phone.account.signOut();
  assert.equal(phone.account.status().signedIn, false);
  assert.equal(phone.store.getEconomy().coins, 80);
});

test('1.14 signed out, then signed in with another Google account: nothing is wiped; the phone\'s progress joins that account', async () => {
  const { device, token } = await world();
  const phone = device();
  phone.store.earnCoins(300, { capped: false });
  await phone.account.signInWithToken(await token('anna'));
  for (let k = 0; k < 10; k++) await device().account.signInWithToken(await token('anna'));
  assert.equal(await phone.account.sync(), 'out');
  await phone.account.signInWithToken(await token('bennie'));
  assert.equal(phone.store.getEconomy().coins, 300, 'the phone keeps what it has');
  const b = device();
  await b.account.signInWithToken(await token('bennie'));
  assert.equal(b.store.getEconomy().coins, 300, 'and it joined the account it signed in to, as a guest\'s would');
  const a = device();
  await a.account.signInWithToken(await token('anna'));
  assert.equal(a.store.getEconomy().coins, 300, 'Anna\'s account keeps its own copy');
});

test('an account deleted and made anew (the same Google account): the old copy is not used as a base', async () => {
  const { device, token } = await world();
  const phone = device();
  const web = device();
  phone.store.earnCoins(50, { capped: false });
  await phone.account.signInWithToken(await token());
  await web.account.signInWithToken(await token());
  await web.account.deleteAccount();
  // the website signs in again: a new, empty account; it saves several times
  await web.account.signInWithToken(await token());
  for (let k = 0; k < 3; k++) {
    web.store.earnCoins(5, { capped: false });
    await web.account.sync();
  }
  assert.equal(await phone.account.sync(), 'out');
  await phone.account.signInWithToken(await token());
  // the phone's 50 join the new account as new progress (it never held them). (1.14) The website kept its 50 when it
  // deleted (no wipe), and they joined the new account too: deleting and making the account anew on two devices
  // brings both devices' copies in (the known cost of never wiping; coins can't be bought)
  assert.equal(phone.store.getEconomy().coins, 115);
});

test('the first sync after start: stale() until it is done; settle() waits for it', async () => {
  const { device, token } = await world();
  const phone = device();
  await phone.account.signInWithToken(await token());
  // a "new page" on the same storage: not synced yet
  const again = createAccount({
    store: phone.store, bus: { emit() {} }, apiUrl: 'https://api.test', clientId: CLIENT_ID, storageKey: 'stapel.v1',
    today: () => D1, backend: phone.backend, fetchImpl: phone.fetchImpl, native: () => null,
  });
  assert.equal(again.stale(), true);
  await again.settle(3000);
  assert.equal(again.stale(), false);
});

test('1.14 a busy server (429: the per-account save limit) is calm: "Stapel is busy", nothing lost, it saves again later', async () => {
  const { device, token, h } = await world({ RATE_LIMIT_ACCOUNT_STORES_PER_HOUR: '1' });
  const phone = device();
  phone.store.earnCoins(30, { capped: false });
  assert.equal(await phone.account.signInWithToken(await token()), 'saved', 'the first save');
  phone.store.earnCoins(20, { capped: false });
  assert.equal(await phone.account.sync(), 'limited', 'the second save this hour: held back');
  assert.equal(phone.account.status().error, 'limited');
  assert.equal(phone.account.status().signedIn, true, 'still signed in');
  assert.equal(phone.store.getEconomy().coins, 50, 'nothing lost here');
  h.clock.now += 61 * 60 * 1000;   // an hour later
  phone.clock.t = h.clock.now;
  assert.ok(['saved', 'same'].includes(await phone.account.sync()), 'the held-back save goes first (then nothing is new)');
  assert.equal(phone.account.status().error, null);
  const web = device();
  await web.account.signInWithToken(await token());
  assert.equal(web.store.getEconomy().coins, 50, 'it reached the account');
});

test('1.15.5 a tester: "the prompt didn\'t go away" — from Google\'s answer until the server has checked it, the screens are told it is signing in', async () => {
  const { device, token } = await world();
  const phone = device();
  const tok = await token();
  const seen = [];
  phone.account.signInWithToken(tok).then((out) => seen.push(['done', out]));
  assert.equal(phone.account.status().signingIn, true, 'at once, before the server answers');
  assert.deepEqual(phone.events.at(-1), ['account:changed', 'signing-in']);
  while (!seen.length) await new Promise((r) => setTimeout(r, 5));
  assert.equal(phone.account.status().signingIn, false);
  assert.equal(phone.account.status().signedIn, true);
  const whys = phone.events.map(([, why]) => why);
  assert.ok(whys.indexOf('signing-in') < whys.indexOf('signed-in'), 'signing in, then signed in');
  // the server says no: the wait ends with the error
  const web = device();
  await assert.rejects(web.account.signInWithToken('not-a-token'));
  assert.equal(web.account.status().signingIn, false);
  assert.deepEqual(web.events.map(([, why]) => why), ['signing-in', 'error']);
});

// (1.23) The public launch with a signed-in account on two phones, one still on a testing-weeks app (it knows no launch mark)
const testingSave = () => ({ v: 1, main: { stats: { played: 40 } }, econ: { coins: 5000, skins: { owned: { blocks: ['kleur', 'heelal'] }, wear: { blocks: 'heelal' } } } });
const keptSave = (h) => JSON.parse(h.db.q('SELECT save FROM accounts')[0].save);

test('1.23 an older game on the same account: its copy is refused, the 1.23 phone keeps its own', async () => {
  const { device, token, h } = await world();
  const post = (path, body) => h.request('POST', path, { body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  const phone = device();
  phone.store.earnCoins(120, { capped: false });
  assert.equal(await phone.account.signInWithToken(await token()), 'saved');
  const old = (await post('/account/google', { idToken: await token() })).json;
  assert.equal((await post('/account/store', { token: old.token, rev: old.rev, save: testingSave(), push: 'push122000000009' })).status, 400);
  phone.store.earnCoins(5, { capped: false });
  assert.equal(await phone.account.sync(), 'saved');
  assert.equal(phone.store.getEconomy().coins, 125);
  assert.equal(keptSave(h).econ.coins, 125);
  assert.ok(!keptSave(h).econ.skins.owned.blocks.includes('heelal'));
});

test('1.23 the backstop: an account save without the mark after this phone\'s launch sync (an older server took it) leaves ours as it is', async () => {
  const { device, token, h } = await world();
  const phone = device();
  phone.store.earnCoins(120, { capped: false });
  assert.equal(await phone.account.signInWithToken(await token()), 'saved');
  // what an older Worker let an older game store on top
  h.db.db.prepare('UPDATE accounts SET save = ?1, rev = rev + 1').run(JSON.stringify(testingSave()));
  phone.store.earnCoins(5, { capped: false });
  assert.equal(await phone.account.sync(), 'saved', 'ours goes back up');
  assert.equal(phone.store.getEconomy().coins, 125, 'nothing counted away, nothing of the testing weeks added');
  assert.ok(!phone.store.getSkins().owned.blocks.includes('heelal'));
  assert.equal(keptSave(h).launch, LAUNCH.id);
  assert.equal(keptSave(h).econ.coins, 125);
  assert.ok(!keptSave(h).econ.skins.owned.blocks.includes('heelal'), 'the server gave none back');
});

test('1.23 the older phone updates later: its start from scratch costs the account nothing', async () => {
  const { device, token, h } = await world();
  const post = (path, body) => h.request('POST', path, { body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  const phone = device();
  phone.store.earnCoins(120, { capped: false });
  assert.equal(await phone.account.signInWithToken(await token()), 'saved');
  // the testing-weeks app reads the launch save (its sync base, as it came), merges it into its own and is refused
  const old = (await post('/account/google', { idToken: await token() })).json;
  const read = (await post('/account/load', { token: old.token })).json;
  assert.equal((await post('/account/store', { token: old.token, rev: read.rev, save: testingSave(), push: 'push122000000021' })).status, 400);
  // that phone updates to 1.23: the launch step runs on what the old app left, before anything reads it
  const be = memoryBackend();
  be.setItem('stapel.v1', JSON.stringify({ v: 1, settings: {}, stats: { played: 40 }, duel: { name: 'Ou' } }));
  be.setItem('stapel.v1.econ', JSON.stringify({ coins: 5120, skins: { owned: { blocks: ['kleur', 'heelal'] }, wear: { blocks: 'heelal' } } }));
  be.setItem('stapel.v1.cloud', JSON.stringify({ token: old.token, base: read.save, rev: read.rev, pending: null }));
  assert.equal(launchReset(be).founder, true);
  const clock = { t: at(D1) };
  const store = createStore(be, { now: () => clock.t });
  const updated = createAccount({
    store, bus: { emit() {} }, apiUrl: 'https://api.test', clientId: CLIENT_ID, storageKey: 'stapel.v1', today: () => D1, canApply: () => true,
    backend: be, fetchImpl: phone.fetchImpl, now: () => clock.t, native: () => null,
  });
  assert.ok(['saved', 'same'].includes(await updated.sync()));
  assert.equal(store.getEconomy().coins, 120, 'it has the account\'s coins');
  assert.equal(keptSave(h).econ.coins, 120, 'the account kept them');
  assert.ok(!keptSave(h).econ.skins.owned.blocks.includes('heelal'));
  assert.ok(['saved', 'same'].includes(await phone.account.sync()));
  assert.equal(phone.store.getEconomy().coins, 120, 'the 1.23 phone keeps its coins');
});
