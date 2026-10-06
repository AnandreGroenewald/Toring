import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, ADMIN, ORIGIN, T0, DAY } from './support/harness.js';
import { bucketOf, percentileOf, createRateLimiter, MAX_SHOWS_PER_SPONSOR, MAX_SHOWS_PER_GAME } from '../src/stats.js';

const TODAY = '2026-10-06'; // T0 is 6 Oct 2026 10:00 UTC = Daaglikse Toring #1
const DAY_NO = 1;

async function liveSponsor(h, tier, name) {
  const res = await h.admin('POST', '/admin/sponsors', { tier, name, paid_until: h.clock.now + 40 * DAY });
  assert.equal(res.status, 201, res.text);
  return res.json.sponsor.id;
}

const stats = (h, body, opts = {}) => h.request('POST', '/stats', { body, ...opts });
const counts = (h) => Object.fromEntries(
  h.db.q('SELECT date_key, metric, sponsor_id, count FROM stats_daily ORDER BY 1,2,3').map((r) => [`${r.date_key}|${r.metric}|${r.sponsor_id}`, r.count]));

// ------------------------------------------------------------------ pure helpers

test('bucketOf: 0.5 m buckets, clamped to 0..1000 m', () => {
  assert.equal(bucketOf(0), 0);
  assert.equal(bucketOf(0.49), 0);
  assert.equal(bucketOf(0.5), 1);
  assert.equal(bucketOf(12.49), 24);
  assert.equal(bucketOf(12.5), 25);
  assert.equal(bucketOf(37.4), 74);
  assert.equal(bucketOf(-5), 0);
  assert.equal(bucketOf(1000), 2000);
  assert.equal(bucketOf(99999), 2000);
});

test('percentileOf: share of the other players below you, ties count half, you are left out', () => {
  // 100 players including you, 72 of the 99 others below -> 73 (72 / 99 = 72.7)
  assert.equal(percentileOf({ players: 100, below: 72, same: 1 }), 73);
  assert.equal(percentileOf({ players: 101, below: 72, same: 1 }), 72); // 72 of 100 others
  assert.equal(percentileOf({ players: 101, below: 0, same: 1 }), 0);
  assert.equal(percentileOf({ players: 101, below: 100, same: 1 }), 100);
  // ties: 4 others in your bucket, 6 below, 10 above (you + 20 others): (6 + 2) / 20 = 40 %
  assert.equal(percentileOf({ players: 21, below: 6, same: 5 }), 40);
  // nobody else: no percentile
  assert.equal(percentileOf({ players: 1, below: 0, same: 1 }), null);
  assert.equal(percentileOf({ players: 0, below: 0, same: 0 }), null);
  // a result that is not in the histogram (empty bucket) is compared with everybody
  assert.equal(percentileOf({ players: 10, below: 3, same: 0 }), 30);
});

test('rate limiter: counts per key and hour, stays bounded', () => {
  const rl = createRateLimiter();
  assert.deepEqual([1, 2, 3, 4].map(() => rl.allow('a', 3, 0)), [true, true, true, false]);
  assert.equal(rl.allow('b', 3, 0), true);
  assert.equal(rl.allow('a', 3, 3_600_000 - 1), false);
  assert.equal(rl.allow('a', 3, 3_600_000), true, 'a new hour starts a new window');
  for (let i = 0; i < 6000; i++) rl.allow(`k${i}`, 1, 10);
  assert.ok(rl.size() <= 5000);
});

// ------------------------------------------------------------------ POST /stats

test('POST /stats counts a game, the names shown, the billboard and the menu', async () => {
  const h = createHarness();
  const a = await liveSponsor(h, 'block', 'Bakkery Bos');
  const b = await liveSponsor(h, 'block', 'Kafee Kom');
  const p = await liveSponsor(h, 'premium', 'Kaap Motors');
  let res = await stats(h, { dateKey: TODAY, mode: 'daily', blocks: { [a]: 7, [b]: 5 }, billboard: p, menu: true });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.json, { ok: true });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true', 'sendBeacon sends with credentials mode include');
  res = await stats(h, { dateKey: TODAY, mode: 'practice', blocks: { [a]: 3 }, billboard: null, menu: false });
  assert.equal(res.status, 200);
  assert.deepEqual(counts(h), {
    [`${TODAY}|block_shows|${a}`]: 10,
    [`${TODAY}|block_shows|${b}`]: 5,
    [`${TODAY}|billboard_games|${p}`]: 1,
    [`${TODAY}|games_daily|`]: 1,
    [`${TODAY}|games_practice|`]: 1,
    [`${TODAY}|menu_views|`]: 1,
  });
});

test('POST /stats ignores unknown, expired and hidden sponsors and clamps hard', async () => {
  const h = createHarness();
  const a = await liveSponsor(h, 'block', 'Bakkery Bos');
  const hidden = await liveSponsor(h, 'block', 'Versteek My');
  await h.admin('PATCH', `/admin/sponsors/${hidden}`, { hidden: true });
  h.clock.now += 60_000; // past the feed's short memory cache
  const res = await stats(h, {
    dateKey: TODAY,
    mode: 'daily',
    blocks: {
      [a]: 9999,
      [hidden]: 5,
      'not-a-sponsor': 5,
      '00000000-0000-4000-8000-000000000000': 5,
      constructor: 4,
      __proto__: 4,
    },
    billboard: 'also-unknown',
  });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(counts(h), { [`${TODAY}|block_shows|${a}`]: MAX_SHOWS_PER_SPONSOR, [`${TODAY}|games_daily|`]: 1 });
});

test('POST /stats ignores junk amounts, keeps the rest', async () => {
  const h = createHarness();
  const [a, b, c, d, e] = await Promise.all(['Een Naam', 'Twee Naam', 'Drie Naam', 'Vier Naam', 'Vyf Naam'].map((n) => liveSponsor(h, 'block', n)));
  h.clock.now += 60_000;
  const res = await stats(h, { dateKey: TODAY, mode: 'practice', blocks: { [a]: -3, [b]: 'veel', [c]: NaN, [d]: 2.9, [e]: null } });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(counts(h), { [`${TODAY}|block_shows|${d}`]: 2, [`${TODAY}|games_practice|`]: 1 });
});

test('POST /stats caps all names of one game together', async () => {
  const h = createHarness();
  const ids = [];
  for (const n of ['Een Naam', 'Twee Naam', 'Drie Naam']) ids.push(await liveSponsor(h, 'block', n));
  h.clock.now += 60_000;
  await stats(h, { dateKey: TODAY, mode: 'daily', blocks: Object.fromEntries(ids.map((id) => [id, 60])) });
  const total = h.db.q("SELECT SUM(count) AS n FROM stats_daily WHERE metric = 'block_shows'")[0].n;
  assert.equal(total, MAX_SHOWS_PER_GAME);
});

test('POST /stats validates the shape', async () => {
  const h = createHarness();
  const bad = async (body, field, opts) => {
    const res = await stats(h, body, opts);
    assert.equal(res.status, 400, `${JSON.stringify(body)} -> ${res.text}`);
    if (field) assert.equal(res.json.field, field);
  };
  await bad({ mode: 'daily' }, 'dateKey');
  await bad({ dateKey: '2026-13-40', mode: 'daily' }, 'dateKey');
  await bad({ dateKey: 20261006, mode: 'daily' }, 'dateKey');
  await bad({ dateKey: TODAY, mode: 'weekly' }, 'mode');
  await bad({ dateKey: TODAY }, 'mode');
  await bad({ dateKey: TODAY, mode: 'daily', blocks: [1, 2] }, 'blocks');
  await bad({ dateKey: TODAY, mode: 'daily', blocks: 'x' }, 'blocks');
  await bad({ dateKey: TODAY, mode: 'daily', billboard: 5 }, 'billboard');
  await bad({ dateKey: TODAY, mode: 'daily', menu: 'yes' }, 'menu');
  await bad(null);
  await bad([1]);
  assert.equal((await stats(h, undefined, { rawBody: '{nope', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await stats(h, undefined, { rawBody: '', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM stats_daily')[0].n, 0, 'nothing was counted');
});

test('POST /stats: the date must be within a day of the server date', async () => {
  const h = createHarness();
  for (const ok of ['2026-10-05', '2026-10-06', '2026-10-07']) {
    assert.equal((await stats(h, { dateKey: ok, mode: 'daily' })).status, 200, ok);
  }
  for (const no of ['2026-10-04', '2026-10-08', '2025-10-06', '2099-01-01']) {
    const res = await stats(h, { dateKey: no, mode: 'daily' });
    assert.equal(res.status, 400, no);
    assert.equal(res.json.field, 'dateKey');
  }
  assert.equal(h.db.q('SELECT COUNT(DISTINCT date_key) AS n FROM stats_daily')[0].n, 3);
});

test('POST /stats: body limit 4 KB, JSON or text/plain only', async () => {
  const h = createHarness();
  const big = JSON.stringify({ dateKey: TODAY, mode: 'daily', pad: 'x'.repeat(5000) });
  let res = await stats(h, undefined, { rawBody: big, headers: { 'Content-Type': 'application/json' } });
  assert.equal(res.status, 413);
  res = await stats(h, undefined, { rawBody: JSON.stringify({ dateKey: TODAY, mode: 'daily' }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(res.status, 415);
  // sendBeacon sends text/plain, which needs no CORS preflight
  res = await stats(h, undefined, { rawBody: JSON.stringify({ dateKey: TODAY, mode: 'daily' }), headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  assert.equal(res.status, 200);
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM stats_daily')[0].n, 1);
});

test('POST /stats: only the game page may post (CORS), GET is not allowed', async () => {
  const h = createHarness();
  const body = { dateKey: TODAY, mode: 'daily' };
  let res = await stats(h, body, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  res = await stats(h, body, { origin: 'http://localhost:8601' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8601');
  res = await h.request('OPTIONS', '/stats');
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  res = await h.request('GET', '/stats');
  assert.equal(res.status, 405);
  assert.equal(h.db.q("SELECT SUM(count) AS n FROM stats_daily WHERE metric = 'games_daily'")[0].n, 1, 'only the allowed post counted');
});

test('POST /stats is rate-limited per hashed address and never slows other visitors', async () => {
  const h = createHarness({ RATE_LIMIT_STATS_PER_HOUR: '3' });
  const body = { dateKey: TODAY, mode: 'practice' };
  for (let i = 0; i < 3; i++) assert.equal((await stats(h, body, { ip: '203.0.113.9' })).status, 200);
  const limited = await stats(h, body, { ip: '203.0.113.9' });
  assert.equal(limited.status, 429);
  assert.equal(limited.json.error, 'rate_limited');
  assert.ok(limited.headers.get('Retry-After'));
  assert.equal((await stats(h, body, { ip: '203.0.113.10' })).status, 200, 'another address is unaffected');
  assert.equal(h.db.q("SELECT count FROM stats_daily WHERE metric = 'games_practice'")[0].count, 4, 'the limited request counted nothing');
  h.clock.now += 3_600_001;
  assert.equal((await stats(h, body, { ip: '203.0.113.9' })).status, 200, 'an hour later it works again');
  // /score has its own bucket for the same address
  assert.notEqual((await h.request('POST', '/score', { body: { dateKey: TODAY, dayNumber: DAY_NO, heightM: 5 }, ip: '203.0.113.9' })).status, 429);
});

test('the daily salt: the same address hashes differently on another day (no cross-day tracking)', async () => {
  const h = createHarness({ RATE_LIMIT_STATS_PER_HOUR: '1' });
  const body = { dateKey: TODAY, mode: 'practice' };
  assert.equal((await stats(h, body, { ip: '203.0.113.9' })).status, 200);
  assert.equal((await stats(h, body, { ip: '203.0.113.9' })).status, 429);
  h.clock.now += DAY; // a new UTC day: new salt, new window
  assert.equal((await stats(h, body, { ip: '203.0.113.9' })).status, 200);
});

test('privacy: no IP address (or anything like one) ends up in the database or the logs', async () => {
  const h = createHarness({ RATE_LIMIT_STATS_PER_HOUR: '1', RATE_LIMIT_SCORE_PER_HOUR: '1' });
  const a = await liveSponsor(h, 'block', 'Bakkery Bos');
  h.clock.now += 60_000;
  const ips = ['203.0.113.77', '198.51.100.23', '2001:db8:85a3::8a2e:370:7334', '192.0.2.200'];
  for (const ip of ips) {
    await stats(h, { dateKey: TODAY, mode: 'daily', blocks: { [a]: 4 }, billboard: a, menu: true }, { ip });
    await stats(h, { dateKey: TODAY, mode: 'daily', blocks: { [a]: 4 } }, { ip }); // rate limited
    await h.request('POST', '/score', { body: { dateKey: TODAY, dayNumber: DAY_NO, heightM: 12.5 }, ip });
    await h.request('GET', `/score?dateKey=${TODAY}&heightM=12.5`, { ip }); // rate limited
  }
  const tables = h.db.q("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name);
  assert.ok(tables.includes('stats_daily') && tables.includes('daily_scores'));
  let dump = '';
  for (const t of tables) dump += JSON.stringify(h.db.q(`SELECT * FROM ${t}`));
  dump += JSON.stringify(h.logs);
  for (const ip of ips) assert.ok(!dump.includes(ip), `${ip} must not be stored`);
  assert.doesNotMatch(dump, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, 'no IPv4-like string');
  assert.doesNotMatch(dump, /[0-9a-f]{1,4}(:[0-9a-f]{0,4}){3,}/i, 'no IPv6-like string');
  // the stats tables only hold dates, metric names, sponsor ids and numbers
  for (const r of h.db.q('SELECT * FROM stats_daily')) assert.deepEqual(Object.keys(r), ['date_key', 'metric', 'sponsor_id', 'count']);
  for (const r of h.db.q('SELECT * FROM daily_scores')) assert.deepEqual(Object.keys(r), ['date_key', 'bucket', 'count']);
});

test('without a database the counts fail quietly with 503 (the game ignores it)', async () => {
  const h = createHarness();
  h.env.DB = undefined;
  assert.equal((await stats(h, { dateKey: TODAY, mode: 'daily' })).status, 503);
});

// ------------------------------------------------------------------ POST/GET /score

const post = (h, heightM, o = {}) => h.request('POST', '/score', { body: { dateKey: TODAY, dayNumber: DAY_NO, heightM }, ...o });
const get = (h, heightM, o = {}) => h.request('GET', `/score?dateKey=${o.dateKey ?? TODAY}&heightM=${heightM}`, o);

test('POST /score: the first player has no percentile yet', async () => {
  const h = createHarness();
  const res = await post(h, 20);
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.json, { percentile: null, players: 1 });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(h.db.q('SELECT * FROM daily_scores'), [{ date_key: TODAY, bucket: 40, count: 1 }]);
});

test('POST /score: percentile of the other players below you, ties count half', async () => {
  const h = createHarness({ RATE_LIMIT_SCORE_PER_HOUR: '1000' });
  // ten earlier players: 5, 10, 15 ... 50 m
  for (let k = 1; k <= 10; k++) await post(h, k * 5);
  assert.equal(h.db.q('SELECT SUM(count) AS n FROM daily_scores')[0].n, 10);
  // 32 m: 6 of the 10 others are below (5..30) -> 60 %
  assert.deepEqual((await post(h, 32)).json, { percentile: 60, players: 11 });
  // 100 m beats all 11 others, 0 m none of the 12
  assert.deepEqual((await post(h, 100)).json, { percentile: 100, players: 12 });
  assert.deepEqual((await post(h, 0)).json, { percentile: 0, players: 13 });
  // a tie: 25 m is also what one earlier player made (the bucket 50). Others: 13 (5..50, 32, 100, 0)
  // below 25 m: 5, 10, 15, 20, 0 = 5; tied: 1 -> (5 + 0.5) / 13 = 42.3 -> 42
  assert.deepEqual((await post(h, 25)).json, { percentile: 42, players: 14 });
  // within the same 0.5 m bucket counts as a tie: 25.4 m shares the bucket with two 25 m results,
  // 5 results are below, (5 + 2 / 2) / 14 others = 43 %
  assert.deepEqual((await post(h, 25.4)).json, { percentile: 43, players: 15 });
  // the next bucket (26 m) is not a tie: 8 of the 15 others are below
  assert.deepEqual((await post(h, 26)).json, { percentile: 53, players: 16 });
});

test('GET /score returns the same without adding anything', async () => {
  const h = createHarness({ RATE_LIMIT_SCORE_PER_HOUR: '1000' });
  for (const m of [5, 10, 15, 20, 25, 30, 35, 40, 45]) await post(h, m);
  const posted = await post(h, 33);
  assert.deepEqual(posted.json, { percentile: 67, players: 10 }); // 6 of 9 others below
  const before = h.db.q('SELECT * FROM daily_scores ORDER BY bucket');
  for (let i = 0; i < 3; i++) assert.deepEqual((await get(h, 33)).json, posted.json);
  assert.deepEqual(h.db.q('SELECT * FROM daily_scores ORDER BY bucket'), before, 'GET writes nothing');
  // a result nobody posted (empty bucket) is compared with everybody
  assert.deepEqual((await get(h, 50)).json, { percentile: 100, players: 10 });
  assert.deepEqual((await get(h, 1)).json, { percentile: 0, players: 10 });
  // another day has no players
  assert.deepEqual((await get(h, 33, { dateKey: '2026-10-07' })).json, { percentile: null, players: 0 });
});

test('/score validates and clamps', async () => {
  const h = createHarness({ RATE_LIMIT_SCORE_PER_HOUR: '1000' });
  const bad = async (body, field) => {
    const res = await h.request('POST', '/score', { body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.json.field, field);
  };
  await bad({ dayNumber: DAY_NO, heightM: 5 }, 'dateKey');
  await bad({ dateKey: '2026-10-09', dayNumber: 4, heightM: 5 }, 'dateKey');
  await bad({ dateKey: TODAY, heightM: 5 }, 'dayNumber');
  await bad({ dateKey: TODAY, dayNumber: 2, heightM: 5 }, 'dayNumber');
  await bad({ dateKey: TODAY, dayNumber: '1', heightM: 5 }, 'dayNumber');
  await bad({ dateKey: TODAY, dayNumber: DAY_NO }, 'heightM');
  await bad({ dateKey: TODAY, dayNumber: DAY_NO, heightM: 'hoog' }, 'heightM');
  await bad({ dateKey: TODAY, dayNumber: DAY_NO, heightM: null }, 'heightM');
  await bad({ dateKey: TODAY, dayNumber: DAY_NO, heightM: Infinity }, 'heightM');
  assert.equal(h.db.q('SELECT COUNT(*) AS n FROM daily_scores')[0].n, 0);
  // out-of-range heights are clamped into 0..1000 m instead of creating odd buckets
  assert.equal((await post(h, 123456)).status, 200);
  assert.equal((await post(h, -40)).status, 200);
  assert.deepEqual(h.db.q('SELECT bucket FROM daily_scores ORDER BY bucket').map((r) => r.bucket), [0, 2000]);
  // body limits and content types like /stats
  let res = await h.request('POST', '/score', { rawBody: 'x'.repeat(5000), headers: { 'Content-Type': 'application/json' } });
  assert.equal(res.status, 413);
  res = await h.request('POST', '/score', { rawBody: '{}', headers: { 'Content-Type': 'application/xml' } });
  assert.equal(res.status, 415);
  res = await h.request('GET', `/score?dateKey=${TODAY}`);
  assert.equal(res.status, 400);
  res = await h.request('GET', `/score?dateKey=nope&heightM=3`);
  assert.equal(res.status, 400);
  res = await h.request('PUT', '/score');
  assert.equal(res.status, 405);
});

test('/score: CORS and rate limit', async () => {
  const h = createHarness({ RATE_LIMIT_SCORE_PER_HOUR: '2' });
  let res = await post(h, 5, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  res = await get(h, 5, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal((await post(h, 5)).status, 200);
  assert.equal((await get(h, 5)).status, 200);
  res = await post(h, 5);
  assert.equal(res.status, 429);
  assert.equal(h.db.q('SELECT SUM(count) AS n FROM daily_scores')[0].n, 1, 'only the first post counted');
  assert.equal((await post(h, 5, { ip: '203.0.113.50' })).status, 200);
});

// ------------------------------------------------------------------ GET /admin/stats

test('GET /admin/stats needs the admin token', async () => {
  const h = createHarness();
  assert.equal((await h.admin('GET', '/admin/stats', undefined, null)).status, 401);
  assert.equal((await h.admin('GET', '/admin/stats', undefined, `${ADMIN}x`)).status, 401);
  assert.equal((await h.request('GET', '/admin/stats', { headers: { Authorization: `Basic ${ADMIN}` } })).status, 401);
  const ok = await h.admin('GET', '/admin/stats');
  assert.equal(ok.status, 200);
  assert.equal((await h.admin('POST', '/admin/stats', {})).status, 405);
  const off = createHarness({ ADMIN_TOKEN: '' });
  assert.equal((await off.admin('GET', '/admin/stats', undefined, 'x')).status, 503);
});

test('GET /admin/stats: totals per day and per sponsor, with names', async () => {
  const h = createHarness();
  const a = await liveSponsor(h, 'block', 'Bakkery Bos');
  const b = await liveSponsor(h, 'block', 'Kafee Kom');
  const p = await liveSponsor(h, 'premium', 'Kaap Motors');
  h.clock.now += 60_000;
  await stats(h, { dateKey: TODAY, mode: 'daily', blocks: { [a]: 10, [b]: 4 }, billboard: p, menu: true });
  await stats(h, { dateKey: TODAY, mode: 'practice', blocks: { [a]: 6 }, billboard: p });
  await stats(h, { dateKey: '2026-10-07', mode: 'daily', blocks: { [a]: 5 }, billboard: p, menu: true }, { ip: '203.0.113.2' });

  const res = await h.admin('GET', `/admin/stats?from=${TODAY}&to=2026-10-07`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.json.from, TODAY);
  assert.equal(res.json.to, '2026-10-07');
  assert.deepEqual(res.json.totals, { gamesDaily: 2, gamesPractice: 1, games: 3, blockShows: 25, billboardGames: 3, menuViews: 2 });
  assert.deepEqual(res.json.days, [
    { dateKey: TODAY, gamesDaily: 1, gamesPractice: 1, games: 2, blockShows: 20, billboardGames: 2, menuViews: 1 },
    { dateKey: '2026-10-07', gamesDaily: 1, gamesPractice: 0, games: 1, blockShows: 5, billboardGames: 1, menuViews: 1 },
  ]);
  assert.deepEqual(res.json.sponsors, [
    { id: a, name: 'Bakkery Bos', tier: 'block', blockShows: 21, billboardGames: 0, blockDays: 2, billboardDays: 0 },
    { id: b, name: 'Kafee Kom', tier: 'block', blockShows: 4, billboardGames: 0, blockDays: 1, billboardDays: 0 },
    { id: p, name: 'Kaap Motors', tier: 'premium', blockShows: 0, billboardGames: 3, blockDays: 0, billboardDays: 2 },
  ]);

  // a narrower range only adds up its own days
  const one = await h.admin('GET', '/admin/stats?from=2026-10-07&to=2026-10-07');
  assert.equal(one.json.totals.games, 1);
  assert.equal(one.json.sponsors.length, 2);
  assert.equal(one.json.days.length, 1);
});

test('GET /admin/stats: defaults to the last 30 days, validates the range, keeps removed sponsors by id', async () => {
  const h = createHarness();
  const a = await liveSponsor(h, 'block', 'Bakkery Bos');
  h.clock.now += 60_000;
  await stats(h, { dateKey: TODAY, mode: 'daily', blocks: { [a]: 3 } });
  let res = await h.admin('GET', '/admin/stats');
  assert.equal(res.json.to, TODAY);
  assert.equal(res.json.from, '2026-09-07');
  assert.equal(res.json.totals.games, 1);
  for (const q of ['from=nope', 'to=2026-02-30', 'from=2026-10-07&to=2026-10-06', 'from=2024-01-01&to=2026-10-06']) {
    res = await h.admin('GET', `/admin/stats?${q}`);
    assert.equal(res.status, 400, q);
    assert.equal(res.json.error, 'invalid_range');
  }
  // a sponsor deleted afterwards: the counts stay under the id, the name is gone
  h.db.db.prepare('DELETE FROM sponsors WHERE id = ?').run(a);
  res = await h.admin('GET', '/admin/stats');
  assert.equal(res.json.sponsors[0].id, a);
  assert.equal(res.json.sponsors[0].name, null);
  assert.equal(res.json.sponsors[0].blockShows, 3);
  // an empty range is fine
  res = await h.admin('GET', '/admin/stats?from=2025-01-01&to=2025-01-31');
  assert.deepEqual(res.json.days, []);
  assert.equal(res.json.totals.games, 0);
});

test('the daily housekeeping deletes counts older than about 13 months and keeps the rest', async () => {
  const h = createHarness();
  const insert = (d) => {
    h.db.db.prepare("INSERT INTO stats_daily VALUES (?, 'games_daily', '', 5)").run(d);
    h.db.db.prepare('INSERT INTO daily_scores VALUES (?, 10, 5)').run(d);
  };
  h.clock.now = Date.UTC(2027, 11, 1);
  insert('2026-10-06'); // 421 days old
  insert('2026-10-25'); // 402 days old
  insert('2026-11-05'); // 391 days old
  insert('2027-11-30');
  await h.worker.scheduled({}, h.env, { waitUntil() {} });
  assert.deepEqual(h.db.q('SELECT date_key FROM stats_daily ORDER BY 1').map((r) => r.date_key), ['2026-11-05', '2027-11-30']);
  assert.deepEqual(h.db.q('SELECT date_key FROM daily_scores ORDER BY 1').map((r) => r.date_key), ['2026-11-05', '2027-11-30']);
  assert.ok(h.logs.some((l) => l.event === 'retention' && l.statsDeleted === 4));
});
