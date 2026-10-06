// Anonymous audience counts and the daily percentile: the batch builder, the percentile line and the
// (injected) network side. Nothing here may throw or wait when the API is missing or down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTally, tallyShow, buildStatsBatch, percentileLine, MIN_PLAYERS, MAX_SHOWS_PER_SPONSOR, MAX_SPONSORS,
} from '../js/core/audience.js';
import { sendStats, dailyPercentile } from '../js/audience.js';
import { buildShareText } from '../js/core/share.js';
import { S } from '../js/core/strings.js';

const API = 'https://stapel-borge.example.workers.dev';

// ---------------------------------------------------------------------------
// batch
// ---------------------------------------------------------------------------

test('tally counts names per sponsor and ignores junk ids', () => {
  const t = createTally();
  tallyShow(t, 'a');
  tallyShow(t, 'a');
  tallyShow(t, 'b');
  for (const bad of [null, undefined, '', 5, {}, 'x'.repeat(65)]) tallyShow(t, bad);
  tallyShow(t, '__proto__');
  assert.deepEqual({ ...t }, { a: 2, b: 1, ['__proto__']: 1 });
  assert.equal(Object.getPrototypeOf(t), null, 'a plain dictionary: no prototype to pollute');
});

test('buildStatsBatch: the whole batch is dates, sponsor ids and small numbers', () => {
  const t = createTally();
  tallyShow(t, 's1');
  tallyShow(t, 's1');
  tallyShow(t, 's2');
  assert.deepEqual(buildStatsBatch({ dateKey: '2026-10-06', mode: 'daily', tally: t, billboardId: 'p1', menu: true }), {
    dateKey: '2026-10-06', mode: 'daily', blocks: { s1: 2, s2: 1 }, billboard: 'p1', menu: true,
  });
  assert.deepEqual(buildStatsBatch({ dateKey: '2026-10-06', mode: 'practice' }), {
    dateKey: '2026-10-06', mode: 'practice', blocks: {}, billboard: null, menu: false,
  });
  // exactly the fields the Worker reads, nothing else
  const keys = Object.keys(buildStatsBatch({ dateKey: '2026-10-06', mode: 'daily', tally: t }));
  assert.deepEqual(keys, ['dateKey', 'mode', 'blocks', 'billboard', 'menu']);
});

test('buildStatsBatch clamps and drops what the Worker would drop anyway', () => {
  assert.equal(buildStatsBatch({ dateKey: '2026-10-06', mode: 'weekly' }), null);
  assert.equal(buildStatsBatch({ dateKey: 'vandag', mode: 'daily' }), null);
  assert.equal(buildStatsBatch({ dateKey: '2026-02-30', mode: 'daily' }), null);
  assert.equal(buildStatsBatch(), null);
  const b = buildStatsBatch({
    dateKey: '2026-10-06', mode: 'daily',
    tally: { big: 9999, zero: 0, neg: -2, nan: NaN, text: 'x', frac: 2.9, '': 3 },
    billboardId: 42, menu: 'ja',
  });
  assert.deepEqual(b.blocks, { big: MAX_SHOWS_PER_SPONSOR, frac: 2 });
  assert.equal(b.billboard, null);
  assert.equal(b.menu, false);
  const many = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`s${i}`, 1]));
  assert.equal(Object.keys(buildStatsBatch({ dateKey: '2026-10-06', mode: 'daily', tally: many }).blocks).length, MAX_SPONSORS);
  assert.ok(JSON.stringify(b).length < 4096);
});

// ---------------------------------------------------------------------------
// percentile line
// ---------------------------------------------------------------------------

test('percentile line: exact Afrikaans text, only with enough players and something to say', () => {
  assert.equal(percentileLine({ percentile: 72, players: 40 }), 'Jy het beter gedoen as 72% van spelers vandag');
  assert.equal(S.percentileBetter('72'), 'Jy het beter gedoen as 72% van spelers vandag');
  assert.equal(MIN_PLAYERS, 10);
  assert.equal(percentileLine({ percentile: 72, players: 10 }), 'Jy het beter gedoen as 72% van spelers vandag');
  assert.equal(percentileLine({ percentile: 72, players: 9 }), '', 'fewer than 10 players: nothing');
  assert.equal(percentileLine({ percentile: 100, players: 10 }), 'Jy het beter gedoen as 100% van spelers vandag');
  assert.equal(percentileLine({ percentile: 71.6, players: 12 }), 'Jy het beter gedoen as 72% van spelers vandag');
  assert.equal(percentileLine({ percentile: 0, players: 50 }), '', 'a 0% line would only discourage');
  for (const bad of [null, undefined, {}, 'x', { percentile: null, players: 50 }, { percentile: 'hoog', players: 50 }, { percentile: NaN, players: 50 }, { percentile: 50 }, { percentile: 50, players: NaN }]) {
    assert.equal(percentileLine(bad), '');
  }
  assert.equal(percentileLine({ percentile: 250, players: 20 }), 'Jy het beter gedoen as 100% van spelers vandag', 'never above 100');
});

test('the percentile never reaches the WhatsApp text', () => {
  const text = buildShareText({
    mode: 'daily', dateKey: '2026-10-06', dayNumber: 1, heightM: 42.3, score: 1000, blocksPlaced: 20, blocksDropped: 22,
    perfects: 3, maxCombo: 2, grid: 'PSPSS', reason: 'lives', weather: [],
  }, { url: 'https://example.com/' });
  assert.ok(text.length > 10);
  assert.doesNotMatch(text, /beter gedoen|spelers|%/);
  assert.doesNotMatch(readFileSync(new URL('../js/core/share.js', import.meta.url), 'utf8'), /percentile|audience/i);
});

// ---------------------------------------------------------------------------
// sendStats
// ---------------------------------------------------------------------------

const BATCH = { dateKey: '2026-10-06', mode: 'daily', blocks: { s1: 3 }, billboard: 'p1', menu: true };

test('sendStats uses sendBeacon with a text/plain body (no CORS preflight)', async () => {
  const calls = [];
  const navigatorImpl = { sendBeacon: (url, blob) => { calls.push({ url, blob }); return true; } };
  assert.equal(sendStats(`${API}/`, BATCH, { navigatorImpl, fetchImpl: () => assert.fail('no fetch needed') }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API}/stats`);
  assert.match(calls[0].blob.type, /^text\/plain/);
  assert.deepEqual(JSON.parse(await calls[0].blob.text()), BATCH);
});

test('sendStats falls back to a keepalive fetch, never waits for it and never throws', async () => {
  const seen = [];
  const fetchImpl = (url, init) => { seen.push({ url, init }); return Promise.reject(new Error('offline')); };
  // no beacon at all, a beacon that refuses, and a beacon that throws
  for (const navigatorImpl of [{}, null, { sendBeacon: () => false }]) {
    seen.length = 0;
    assert.equal(sendStats(API, BATCH, { navigatorImpl, fetchImpl }), true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, `${API}/stats`);
    assert.equal(seen[0].init.method, 'POST');
    assert.equal(seen[0].init.keepalive, true);
    assert.equal(seen[0].init.credentials, 'omit');
    assert.match(seen[0].init.headers['Content-Type'], /^text\/plain/);
    assert.deepEqual(JSON.parse(seen[0].init.body), BATCH);
  }
  assert.equal(sendStats(API, BATCH, { navigatorImpl: { sendBeacon() { throw new Error('boom'); } }, fetchImpl }), false);
  await new Promise((r) => setTimeout(r, 5)); // the rejected fetches must not surface as unhandled rejections
});

test('sendStats without an API address or a batch does nothing', () => {
  const navigatorImpl = { sendBeacon: () => assert.fail('must not send') };
  const fetchImpl = () => assert.fail('must not send');
  for (const apiUrl of ['', '   ', null, undefined, 'javascript:alert(1)', 'ftp://x', 'api.example.com']) {
    assert.equal(sendStats(apiUrl, BATCH, { navigatorImpl, fetchImpl }), false);
  }
  assert.equal(sendStats(API, null, { navigatorImpl, fetchImpl }), false);
});

// ---------------------------------------------------------------------------
// dailyPercentile
// ---------------------------------------------------------------------------

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}
const reply = (body, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, text: () => Promise.resolve(JSON.stringify(body)) });
const RESULT = { mode: 'daily', dateKey: '2026-10-06', dayNumber: 1, heightM: 37.4, blocksDropped: 25 };
const OPTS = (extra = {}) => ({ apiUrl: API, storageKey: 'stapel.v1', storage: memoryStorage(), ...extra });

test('dailyPercentile: the first time it POSTs once, afterwards it only asks (GET)', async () => {
  const calls = [];
  const fetchImpl = (url, init) => { calls.push({ url, init }); return reply({ percentile: 72, players: 31 }); };
  const o = OPTS({ fetchImpl });
  assert.deepEqual(await dailyPercentile(RESULT, o), { percentile: 72, players: 31 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API}/score`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.deepEqual(JSON.parse(calls[0].init.body), { dateKey: '2026-10-06', dayNumber: 1, heightM: 37.4 });
  assert.equal(o.storage.map.size, 1, 'one small flag, nothing else');
  assert.deepEqual(JSON.parse(o.storage.getItem('stapel.v1.score')), { dateKey: '2026-10-06', heightM: 37.4 });

  // revisiting the results later the same day (even after a reload: the flag is in storage)
  assert.deepEqual(await dailyPercentile(RESULT, o), { percentile: 72, players: 31 });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].url, `${API}/score?dateKey=2026-10-06&heightM=37.4`);
  assert.equal(calls[1].init.body, undefined);
  assert.equal(o.storage.map.size, 1);
});

test('dailyPercentile: a new day posts again and replaces the flag (it never grows)', async () => {
  const methods = [];
  const fetchImpl = (url, init) => { methods.push(init.method); return reply({ percentile: 50, players: 20 }); };
  const o = OPTS({ fetchImpl });
  await dailyPercentile(RESULT, o);
  await dailyPercentile({ ...RESULT, dateKey: '2026-10-07', dayNumber: 2, heightM: 10 }, o);
  assert.deepEqual(methods, ['POST', 'POST']);
  assert.equal(o.storage.map.size, 1);
  assert.equal(JSON.parse(o.storage.getItem('stapel.v1.score')).dateKey, '2026-10-07');
});

test('dailyPercentile: failures give null, leave no flag (so a later visit may still count) and never throw', async () => {
  const failing = [
    () => Promise.reject(new Error('offline')),
    () => reply({ error: 'rate_limited' }, false),
    () => Promise.resolve({ ok: true, text: () => Promise.resolve('<html>captive portal</html>') }),
    () => reply({ nothing: true }),
    () => reply([1, 2]),
    () => { throw new Error('sync boom'); },
  ];
  for (const fetchImpl of failing) {
    const o = OPTS({ fetchImpl });
    assert.equal(await dailyPercentile(RESULT, o), null);
    assert.equal(o.storage.map.size, 0, 'a failed POST leaves no flag');
  }
});

test('dailyPercentile does nothing without an API, for practice games or for empty games', async () => {
  const fetchImpl = () => assert.fail('must not call the network');
  assert.equal(await dailyPercentile(RESULT, OPTS({ apiUrl: '', fetchImpl })), null);
  assert.equal(await dailyPercentile(RESULT, OPTS({ apiUrl: undefined, fetchImpl })), null);
  assert.equal(await dailyPercentile({ ...RESULT, mode: 'practice' }, OPTS({ fetchImpl })), null);
  assert.equal(await dailyPercentile({ ...RESULT, blocksDropped: 0 }, OPTS({ fetchImpl })), null);
  assert.equal(await dailyPercentile({ ...RESULT, dateKey: 'nope' }, OPTS({ fetchImpl })), null);
  assert.equal(await dailyPercentile({ ...RESULT, heightM: NaN }, OPTS({ fetchImpl })), null);
  assert.equal(await dailyPercentile(null, OPTS({ fetchImpl })), null);
});

test('dailyPercentile works with blocked storage and asks only once for two quick calls', async () => {
  let n = 0;
  const fetchImpl = () => { n++; return reply({ percentile: 10, players: 99 }); };
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const [a, b] = await Promise.all([
    dailyPercentile(RESULT, OPTS({ fetchImpl, storage: blocked })),
    dailyPercentile(RESULT, OPTS({ fetchImpl, storage: blocked })),
  ]);
  assert.deepEqual(a, { percentile: 10, players: 99 });
  assert.equal(a, b);
  assert.equal(n, 1);
});

test('dailyPercentile clamps the height it sends and passes "nobody else yet" through', async () => {
  const bodies = [];
  const fetchImpl = (url, init) => { bodies.push(JSON.parse(init.body)); return reply({ percentile: null, players: 1 }); };
  assert.deepEqual(await dailyPercentile({ ...RESULT, heightM: 5000 }, OPTS({ fetchImpl })), { percentile: null, players: 1 });
  assert.equal(bodies[0].heightM, 1000);
});

// ---------------------------------------------------------------------------
// wiring
// ---------------------------------------------------------------------------

test('the game only talks to the API when SPONSOR_API_URL is set and keeps debug runs out', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /const AUDIENCE_ON = !!SPONSOR_API_URL && \(!DEBUG \|\| params\.get\('audience'\) === '1'\)/);
  assert.match(main, /if \(!AUDIENCE_ON/);
  const scene = readFileSync(new URL('../js/scenes/GameScene.js', import.meta.url), 'utf8');
  assert.match(scene, /bus\.emit\('game:audience'/);
  assert.match(scene, /tallyShow\(this\.tally, this\.curNameId\)/);
  assert.equal(readFileSync(new URL('../js/sponsorConfig.js', import.meta.url), 'utf8').match(/SPONSOR_API_URL = '(.*)'/)[1], '', 'shipped switched off');
});
