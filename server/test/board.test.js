// The daily leaderboard (src/board.js): one result per player per day, the top 10 with nicknames, the
// player's own place (also when hidden), impossible towers refused, rude names replaced, 30 days kept,
// the owner's block that a post can't undo, and places that add up without reading the whole day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, ADMIN, DAY, T0 } from './support/harness.js';
import { validateEntry, pruneBoard, BOARD_TOP } from '../src/board.js';

const TODAY = '2026-10-06'; // T0 is 6 Oct 2026 10:00 UTC = Daaglikse Toring #1
const DAY_NO = 1;
const HOUR = 60 * 60 * 1000;
const P = (n) => `speler${String(n).padStart(8, '0')}`;
const entry = (over = {}) => ({ dateKey: TODAY, dayNumber: DAY_NO, player: P(1), name: 'Anna', heightM: 37.5, blocks: 20, durationMs: 90000, ...over });

test('a result goes on the board; the top shows names and heights; the poster sees their place', async () => {
  const h = createHarness();
  const r = await h.request('POST', '/board', { body: entry() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.top, [{ rank: 1, name: 'Anna', heightM: 37.5, you: true, retried: false }]);
  assert.equal(r.json.players, 1);
  assert.deepEqual(r.json.you, { rank: 1, heightM: 37.5, hidden: false, retried: false });
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
  assert.deepEqual(hid.json.you, { rank: 1, heightM: 60, hidden: true, retried: false }, 'hidden, but first');
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
  assert.deepEqual(again.json.you, { rank: 1, heightM: 20, hidden: true, retried: false });
  assert.equal(again.json.top.length, 0, 'hidden now');
  assert.equal(again.json.players, 1, 'still one player');
  const back = await h.request('POST', '/board', { body: entry({ heightM: 90, name: 'Anna B' }) });
  assert.deepEqual(back.json.top, [{ rank: 1, name: 'Anna B', heightM: 20, you: true, retried: false }]);
});

test('impossible towers are refused; real games pass; malformed posts too; rude names become Bouer', async () => {
  const h = createHarness();
  const post = (over, ip) => h.request('POST', '/board', { body: entry(over), ip });
  assert.equal((await post({ heightM: 200, blocks: 5, durationMs: 600000 }, '203.0.113.1')).status, 422, 'more than the blocks can make');
  assert.equal((await post({ heightM: 40, blocks: 100, durationMs: 10000 }, '203.0.113.2')).status, 422, 'blocks faster than the crane');
  assert.equal((await post({ heightM: 300, blocks: 80, durationMs: 60000 }, '203.0.113.3')).status, 422, 'climbing too fast');
  assert.equal((await post({ heightM: 2000, blocks: 900, durationMs: 3600000 }, '203.0.113.4')).status, 422, 'past 1 000 m');
  assert.equal((await post({ heightM: 999, blocks: 170, durationMs: 330000 }, '203.0.113.10')).status, 422, 'about 6 m a block: no real tower');
  assert.equal((await post({ player: 'x' }, '203.0.113.5')).status, 400);
  assert.equal((await post({ dayNumber: 7 }, '203.0.113.6')).status, 400);
  assert.equal((await post({ dateKey: '2026-09-01' }, '203.0.113.7')).status, 400, 'only today (+/- a day)');
  assert.equal((await post({ heightM: -1 }, '203.0.113.8')).status, 400);
  const rude = await post({ player: P(9), name: 'kak' }, '203.0.113.9');
  assert.equal(rude.status, 200);
  assert.equal(rude.json.top[0].name, 'Bouer');
  const at = Date.UTC(2026, 9, 6, 10);
  assert.equal(validateEntry(entry({ name: '' }), at).name, 'Bouer');
  // real games: 37,5 m from 20 blocks in a minute and a half; a long one (150 blocks, 255 m in 10
  // minutes); a quick one (a block a second, 100 m from 60)
  assert.equal(validateEntry(entry(), at).heightDm, 375);
  assert.equal(validateEntry(entry({ heightM: 255, blocks: 150, durationMs: 600000 }), at).heightDm, 2550);
  assert.equal(validateEntry(entry({ heightM: 100, blocks: 60, durationMs: 60000 }), at).heightDm, 1000);
});

test("a day's result comes only while it is that day somewhere on earth (or just after)", () => {
  const ten = Date.UTC(2026, 9, 6, 10);   // 6 Oct 10:00 UTC: 7 Oct has just begun at UTC+14
  assert.equal(validateEntry(entry({ dateKey: '2026-10-07', dayNumber: 2 }), ten).dateKey, '2026-10-07');
  assert.throws(() => validateEntry(entry({ dateKey: '2026-10-07', dayNumber: 2 }), ten - 60000), /invalid_field/, "tomorrow's tower, before it is tomorrow anywhere");
  // 5 Oct ends at 6 Oct 12:00 UTC (UTC-12); a game that ran past midnight still counts for 6 hours
  assert.equal(validateEntry(entry({ dateKey: '2026-10-05', dayNumber: 0 }), Date.UTC(2026, 9, 6, 17, 59)).dateKey, '2026-10-05');
  assert.throws(() => validateEntry(entry({ dateKey: '2026-10-05', dayNumber: 0 }), Date.UTC(2026, 9, 6, 18, 1)), /invalid_field/);
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
  // a school or a mobile network shares one address: 60 posts an hour pass, the next is refused
  const statuses = [];
  for (let k = 0; k < 61; k++) statuses.push((await h.request('POST', '/board', { body: entry({ player: P(500 + k) }), ip: '192.0.2.77' })).status);
  assert.equal(statuses[59], 200);
  assert.equal(statuses[60], 429);
});

test('places far below the top add up right: counts per metre and the rows of the own metre', async () => {
  const h = createHarness();
  // 150 players (more than the rows read for the top), heights with plenty of ties, some hidden
  let seed = 7;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const all = [];
  for (let k = 0; k < 150; k++) {
    const heightDm = 200 + Math.floor(rand() * 60) * 3;   // 20-38 m in 0,3 m steps: many share a metre or a height
    const hidden = rand() < 0.15;
    if (rand() < 0.7) h.clock.now += Math.floor(rand() * 3);   // the same millisecond now and then: the number decides
    const p = `p${String(Math.floor(rand() * 1e9)).padStart(9, '0')}${String(k).padStart(4, '0')}`;
    const r = await h.request('POST', '/board', { body: entry({ player: p, name: `S${k}`, heightM: heightDm / 10, hidden }), ip: `10.1.${k >> 8}.${k & 255}` });
    assert.equal(r.status, 200);
    all.push({ p, heightDm, at: h.clock.now, hidden });
  }
  const order = all.slice().sort((a, b) => b.heightDm - a.heightDm || a.at - b.at || (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
  const placeOf = new Map(order.map((e, k) => [e.p, k + 1]));
  for (const e of all.filter((_, k) => k % 7 === 0)) {
    const g = await h.request('GET', `/board?dateKey=${TODAY}&player=${e.p}`, { ip: `10.2.0.${all.indexOf(e) & 255}` });
    assert.equal(g.json.you.rank, placeOf.get(e.p), `place of ${e.p}`);
    assert.equal(g.json.you.hidden, e.hidden);
  }
  const g = await h.request('GET', `/board?dateKey=${TODAY}`);
  assert.equal(g.json.players, 150);
  const shown = order.filter((e) => !e.hidden).slice(0, BOARD_TOP);
  assert.deepEqual(g.json.top.map((t) => t.rank), shown.map((e) => placeOf.get(e.p)), 'the list skips hidden places');
});

test("the owner's block sticks: a later post can't show the entry again; unblock and remove", async () => {
  const h = createHarness();
  await h.request('POST', '/board', { body: entry({ player: P(1), name: 'Anna', heightM: 30 }), ip: '198.51.100.1' });
  await h.request('POST', '/board', { body: entry({ player: P(2), name: 'Snaakse naam', heightM: 50 }), ip: '198.51.100.2' });
  const list = await h.admin('GET', `/admin/board?dateKey=${TODAY}`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.entries.map((e) => [e.rank, e.player, e.name]), [[1, P(2), 'Snaakse naam'], [2, P(1), 'Anna']]);
  assert.equal(list.json.entries[0].blocks, 20);
  const r = await h.admin('POST', '/admin/board', { dateKey: TODAY, player: P(2) });
  assert.equal(r.json.changed, 1);
  // the player posts again, showing themselves, with a new name: still blocked, the name as it was
  const again = await h.request('POST', '/board', { body: entry({ player: P(2), name: 'Nuwe naam', heightM: 50, hidden: false }), ip: '198.51.100.2' });
  assert.deepEqual(again.json.you, { rank: 1, heightM: 50, hidden: true, retried: false });
  assert.deepEqual(again.json.top.map((t) => t.name), ['Anna']);
  assert.equal((await h.admin('GET', `/admin/board?dateKey=${TODAY}`)).json.entries[0].name, 'Snaakse naam');
  // unblocked, it shows again
  await h.admin('POST', '/admin/board', { dateKey: TODAY, player: P(2), unblock: true });
  assert.deepEqual((await h.request('GET', `/board?dateKey=${TODAY}`)).json.top.map((t) => t.name), ['Snaakse naam', 'Anna']);
  // removed (the player asked): gone, and the day's counts go down with it
  const gone = await h.admin('POST', '/admin/board', { dateKey: TODAY, player: P(2), remove: true });
  assert.equal(gone.json.changed, 1);
  const after = await h.request('GET', `/board?dateKey=${TODAY}&player=${P(1)}`);
  assert.equal(after.json.players, 1);
  assert.deepEqual(after.json.you, { rank: 1, heightM: 30, hidden: false, retried: false });
  assert.equal((await h.admin('POST', '/admin/board', { dateKey: TODAY, player: P(1) }, 'wrong-token-that-is-long-enough-123456')).status, 401);
  assert.ok(ADMIN);
});

test('the cron forgets days older than 30, counts and all', async () => {
  const h = createHarness();
  await h.request('POST', '/board', { body: entry() });
  await pruneBoard(h.env.DB, h.clock.now + 31 * DAY);
  for (const t of ['daily_board', 'daily_board_days', 'daily_board_hist']) {
    const left = await h.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first();
    assert.equal(left.n, 0, t);
  }
});

test("the leaderboard's cleanup can fail on its own: the nightly retention still runs and says so", async () => {
  const h = createHarness();
  h.env.DB.db.exec('DROP TABLE daily_board_hist');   // say, a Worker deployed before the migration
  h.clock.now = T0 + HOUR;
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  assert.ok(h.logs.some((l) => l.event === 'board_prune_failed'));
  assert.ok(h.logs.some((l) => l.event === 'retention'), 'the rest of the retention ran');
  assert.ok(!h.logs.some((l) => l.event === 'retention_failed'));
});

test('1.12 "Nog \'n kans": one retry post keeps the better height and marks the entry for good', async () => {
  const h = createHarness();
  await h.request('POST', '/board', { body: entry({ player: P(1), name: 'Anna', heightM: 30 }), ip: '198.51.100.1' });
  await h.request('POST', '/board', { body: entry({ player: P(2), name: 'Bennie', heightM: 40 }), ip: '198.51.100.2' });
  // a worse second try: the first height stays, but the entry is marked
  let r = await h.request('POST', '/board', { body: entry({ player: P(1), name: 'Anna', heightM: 25, retry: true }), ip: '198.51.100.1' });
  assert.deepEqual(r.json.you, { rank: 2, heightM: 30, hidden: false, retried: true });
  assert.deepEqual(r.json.top.map((t) => [t.name, t.retried]), [['Bennie', false], ['Anna', true]]);
  // a third post (a second retry) changes no height
  r = await h.request('POST', '/board', { body: entry({ player: P(1), name: 'Anna', heightM: 50, blocks: 30, durationMs: 200000, retry: true }), ip: '198.51.100.1' });
  assert.equal(r.json.you.heightM, 30, 'one retry a day');
  // a better second try for another player moves them up (and the day's counts stay right)
  r = await h.request('POST', '/board', { body: entry({ player: P(2), name: 'Bennie', heightM: 62.5, blocks: 30, durationMs: 200000, retry: true }), ip: '198.51.100.2' });
  assert.deepEqual(r.json.you, { rank: 1, heightM: 62.5, hidden: false, retried: true });
  assert.equal(r.json.players, 2);
  const list = await h.admin('GET', `/admin/board?dateKey=${TODAY}`);
  assert.deepEqual(list.json.entries.map((e) => [e.name, e.heightM, e.retried]), [['Bennie', 62.5, true], ['Anna', 30, true]]);
  // a retry that is the day's first post (the first try never got through) counts, marked
  r = await h.request('POST', '/board', { body: entry({ player: P(3), name: 'Carla', heightM: 10, retry: true }), ip: '198.51.100.3' });
  assert.deepEqual(r.json.you, { rank: 3, heightM: 10, hidden: false, retried: true });
  assert.equal(r.json.players, 3);
});
