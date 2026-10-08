// The daily leaderboard (src/board.js): one result per player per day, the top 10 with nicknames, the
// player's own place (also when hidden), impossible towers refused, rude names replaced, 30 days kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, ADMIN, DAY } from './support/harness.js';
import { validateEntry, pruneBoard, BOARD_TOP } from '../src/board.js';

const TODAY = '2026-10-06'; // T0 is 6 Oct 2026 10:00 UTC = Daaglikse Toring #1
const DAY_NO = 1;
const P = (n) => `speler${String(n).padStart(8, '0')}`;
const entry = (over = {}) => ({ dateKey: TODAY, dayNumber: DAY_NO, player: P(1), name: 'Anna', heightM: 37.5, blocks: 20, durationMs: 90000, ...over });

test('a result goes on the board; the top shows names and heights; the poster sees their place', async () => {
  const h = createHarness();
  const r = await h.request('POST', '/board', { body: entry() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.top, [{ rank: 1, name: 'Anna', heightM: 37.5, you: true }]);
  assert.equal(r.json.players, 1);
  assert.deepEqual(r.json.you, { rank: 1, heightM: 37.5, hidden: false });
  const g = await h.request('GET', `/board?dateKey=${TODAY}`);
  assert.equal(g.status, 200);
  assert.equal(g.json.you, null, 'no player asked');
  assert.equal(g.json.top[0].you, false);
});

test('ranking: taller first, a tie goes to who was first; hidden players keep their place but leave the list', async () => {
  const h = createHarness();
  await h.request('POST', '/board', { body: entry({ player: P(1), name: 'Anna', heightM: 30 }), ip: '198.51.100.1' });
  h.clock.now += 1000;
  await h.request('POST', '/board', { body: entry({ player: P(2), name: 'Bennie', heightM: 45 }), ip: '198.51.100.2' });
  h.clock.now += 1000;
  await h.request('POST', '/board', { body: entry({ player: P(3), name: 'Carla', heightM: 45 }), ip: '198.51.100.3' });
  h.clock.now += 1000;
  const hid = await h.request('POST', '/board', { body: entry({ player: P(4), name: 'Dawie', heightM: 60, hidden: true }), ip: '198.51.100.4' });
  assert.deepEqual(hid.json.you, { rank: 1, heightM: 60, hidden: true }, 'hidden, but first');
  assert.deepEqual(hid.json.top.map((t) => [t.rank, t.name]), [[2, 'Bennie'], [3, 'Carla'], [4, 'Anna']], 'true places: #1 is hidden');
  assert.equal(hid.json.players, 4);
  const anna = await h.request('GET', `/board?dateKey=${TODAY}&player=${P(1)}`);
  assert.equal(anna.json.you.rank, 4, 'behind Dawie (hidden), Bennie and Carla');
});

test('one result a day: a second post can change the name or hide it, never the height', async () => {
  const h = createHarness();
  await h.request('POST', '/board', { body: entry({ heightM: 20 }) });
  const again = await h.request('POST', '/board', { body: entry({ heightM: 90, blocks: 40, durationMs: 300000, name: 'Anna B', hidden: true }) });
  assert.equal(again.status, 200);
  assert.deepEqual(again.json.you, { rank: 1, heightM: 20, hidden: true });
  assert.equal(again.json.top.length, 0, 'hidden now');
  const back = await h.request('POST', '/board', { body: entry({ heightM: 90, name: 'Anna B' }) });
  assert.deepEqual(back.json.top, [{ rank: 1, name: 'Anna B', heightM: 20, you: true }]);
});

test('impossible towers are refused; malformed posts too; rude names become Bouer', async () => {
  const h = createHarness();
  const post = (over, ip) => h.request('POST', '/board', { body: entry(over), ip });
  assert.equal((await post({ heightM: 200, blocks: 5, durationMs: 600000 }, '203.0.113.1')).status, 422, 'more than the blocks can make');
  assert.equal((await post({ heightM: 40, blocks: 100, durationMs: 10000 }, '203.0.113.2')).status, 422, 'blocks faster than the crane');
  assert.equal((await post({ heightM: 300, blocks: 80, durationMs: 60000 }, '203.0.113.3')).status, 422, 'climbing too fast');
  assert.equal((await post({ heightM: 2000, blocks: 900, durationMs: 3600000 }, '203.0.113.4')).status, 422, 'past 1 000 m');
  assert.equal((await post({ player: 'x' }, '203.0.113.5')).status, 400);
  assert.equal((await post({ dayNumber: 7 }, '203.0.113.6')).status, 400);
  assert.equal((await post({ dateKey: '2026-09-01' }, '203.0.113.7')).status, 400, 'only today (+/- a day)');
  assert.equal((await post({ heightM: -1 }, '203.0.113.8')).status, 400);
  const rude = await post({ player: P(9), name: 'kak' }, '203.0.113.9');
  assert.equal(rude.status, 200);
  assert.equal(rude.json.top[0].name, 'Bouer');
  assert.equal(validateEntry(entry({ name: '' }), Date.UTC(2026, 9, 6, 10)).name, 'Bouer');
  // a real game: 37,5 m from 20 blocks in a minute and a half is fine
  assert.equal(validateEntry(entry(), Date.UTC(2026, 9, 6, 10)).heightDm, 375);
});

test('the top holds BOARD_TOP players; only the site may post; rate limits apply', async () => {
  const h = createHarness();
  for (let k = 0; k < BOARD_TOP + 3; k++) {
    await h.request('POST', '/board', { body: entry({ player: P(100 + k), name: `Speler ${k}`, heightM: 10 + k }), ip: `198.51.100.${10 + k}` });
  }
  const g = await h.request('GET', `/board?dateKey=${TODAY}`);
  assert.equal(g.json.top.length, BOARD_TOP);
  assert.equal(g.json.players, BOARD_TOP + 3);
  assert.equal(g.json.top[0].heightM, 10 + BOARD_TOP + 2);
  assert.equal((await h.request('POST', '/board', { body: entry(), origin: null })).status, 403);
  let last = 0;
  for (let k = 0; k < 14; k++) last = (await h.request('POST', '/board', { body: entry({ player: P(500 + k) }), ip: '192.0.2.77' })).status;
  assert.equal(last, 429, 'a dozen posts an hour per address');
});

test('admin hides an entry; the cron forgets days older than 30', async () => {
  const h = createHarness();
  await h.request('POST', '/board', { body: entry({ name: 'Snaakse naam' }) });
  const r = await h.admin('POST', '/admin/board', { dateKey: TODAY, player: P(1) });
  assert.equal(r.status, 200);
  assert.equal(r.json.changed, 1);
  const g = await h.request('GET', `/board?dateKey=${TODAY}&player=${P(1)}`);
  assert.equal(g.json.top.length, 0);
  assert.equal(g.json.you.hidden, true);
  assert.equal((await h.admin('POST', '/admin/board', { dateKey: TODAY, player: P(1) }, 'wrong-token-that-is-long-enough-123456')).status, 401);
  // 31 days later the row is gone
  await pruneBoard(h.env.DB, h.clock.now + 31 * DAY);
  const left = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM daily_board').first();
  assert.equal(left.n, 0);
  assert.ok(ADMIN);
});
