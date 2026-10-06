import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore, memoryBackend, safeLocalStorage, streakAfter, displayStreak, normalizeResult,
} from '../js/core/storage.js';
import { STORAGE_KEY } from '../js/config.js';
import { addDays, dayNumber } from '../js/core/daily.js';

const D1 = '2026-10-06';

function throwingBackend() {
  const boom = () => {
    throw new Error('SecurityError: storage disabled');
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

function quotaBackend() {
  // Reads work (empty) but every write throws, like Safari private mode used to.
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
  };
}

function result(over = {}) {
  return {
    mode: 'daily',
    dateKey: D1,
    dayNumber: 1,
    seed: 'stapel-' + D1,
    reason: 'lives',
    score: 500,
    heightM: 20.4,
    blocksPlaced: 12,
    blocksDropped: 15,
    perfects: 4,
    maxCombo: 3,
    grid: 'PPGSPXGPPXSX'.slice(0, 15),
    weather: ['wind', 'rain'],
    durationMs: 61000,
    ...over,
  };
}

let clock = Date.UTC(2026, 9, 6, 10);
const now = () => clock;

/** Play and finish the daily of `dateKey` in one go. */
function playDay(store, dateKey, over = {}) {
  store.startDaily(dateKey, { dateKey, dayNumber: dayNumber(dateKey), seed: 'stapel-' + dateKey });
  return store.finishDaily(dateKey, result({ dateKey, dayNumber: dayNumber(dateKey), ...over }));
}

test('streakAfter', () => {
  assert.equal(streakAfter(null, 0, D1), 1);
  assert.equal(streakAfter(undefined, 5, D1), 1);
  assert.equal(streakAfter('2026-10-05', 3, D1), 4); // consecutive
  assert.equal(streakAfter(D1, 3, D1), 3); // same day: unchanged
  assert.equal(streakAfter('2026-10-04', 3, D1), 1); // gap
  assert.equal(streakAfter('2026-09-01', 30, D1), 1);
  assert.equal(streakAfter('2026-12-31', 9, '2027-01-01'), 10); // year boundary
  assert.equal(streakAfter('2028-02-28', 2, '2028-02-29'), 3); // leap day
  assert.equal(streakAfter('2026-10-07', 4, D1), 4); // out of order: unchanged
});

test('displayStreak is 0 once a day is missed', () => {
  assert.equal(displayStreak(D1, 5, D1), 5);
  assert.equal(displayStreak(D1, 5, '2026-10-07'), 5); // yesterday still alive
  assert.equal(displayStreak(D1, 5, '2026-10-08'), 0);
  assert.equal(displayStreak(null, 5, D1), 0);
});

test('settings defaults and updates persist', () => {
  const be = memoryBackend();
  const store = createStore(be, { now });
  assert.deepEqual(store.getSettings(), { sound: true, vibration: true, reducedMotion: false });
  assert.deepEqual(store.setSettings({ sound: false }), { sound: false, vibration: true, reducedMotion: false });
  store.setSettings({ vibration: 0, bogus: 1 });
  const again = createStore(be, { now });
  assert.deepEqual(again.getSettings(), { sound: false, vibration: false, reducedMotion: false });
  assert.ok(JSON.parse(be.getItem(STORAGE_KEY)).settings);
  // Methods work unbound too (e.g. passed around as callbacks).
  const { setSettings } = again;
  assert.equal(setSettings({ sound: true }).sound, true);
});

test('reducedMotion default follows prefers-reduced-motion when available', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  try {
    globalThis.matchMedia = (q) => ({ matches: q.includes('reduce') });
    assert.equal(createStore(memoryBackend()).getSettings().reducedMotion, true);
    globalThis.matchMedia = () => {
      throw new Error('nope');
    };
    assert.equal(createStore(memoryBackend()).getSettings().reducedMotion, false);
    const s = createStore(memoryBackend());
    s.setSettings({ reducedMotion: true });
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(s.getSettings().reducedMotion, true); // explicit choice wins
  } finally {
    if (had) Object.defineProperty(globalThis, 'matchMedia', had);
    else delete globalThis.matchMedia;
  }
});

test('tutorialSeen', () => {
  const be = memoryBackend();
  const s = createStore(be);
  assert.equal(s.tutorialSeen(), false);
  s.markTutorialSeen();
  assert.equal(s.tutorialSeen(), true);
  assert.equal(createStore(be).tutorialSeen(), true);
});

test('startDaily / saveDailyProgress / finishDaily lifecycle and idempotency', () => {
  const be = memoryBackend();
  const s = createStore(be, { now });
  assert.equal(s.getDaily(D1), null);

  s.startDaily(D1, { dateKey: D1, dayNumber: 1, seed: 'stapel-' + D1, score: 0 });
  let e = s.getDaily(D1);
  assert.equal(e.status, 'playing');
  assert.equal(e.startedAt, clock);
  assert.equal(e.finishedAt, null);
  assert.equal(e.result.dayNumber, 1);

  // Second start is a no-op (doesn't reset progress or startedAt).
  s.saveDailyProgress(D1, { score: 120, heightM: 5.26, grid: 'PPG', blocksDropped: 3 });
  clock += 5000;
  s.startDaily(D1, { score: 0 });
  e = s.getDaily(D1);
  assert.equal(e.result.score, 120);
  assert.equal(e.result.heightM, 5.3);
  assert.equal(e.result.grid, 'PPG');
  assert.equal(e.startedAt, clock - 5000);

  // Progress survives a "reload".
  assert.equal(createStore(be, { now }).getDaily(D1).result.score, 120);

  clock += 60000;
  const stats = s.finishDaily(D1, result({ score: 900, heightM: 31.2, perfects: 6 }));
  assert.equal(stats.played, 1);
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.maxStreak, 1);
  assert.equal(stats.bestScore, 900);
  assert.equal(stats.bestHeightM, 31.2);
  assert.equal(stats.totalPerfects, 6);
  assert.equal(stats.lastDateKey, D1);
  assert.equal(stats.isNewBestHeight, false); // first ever game: nothing to beat
  assert.equal(stats.isNewBestScore, false);
  e = s.getDaily(D1);
  assert.equal(e.status, 'done');
  assert.equal(e.finishedAt, clock);
  assert.equal(e.result.reason, 'lives');
  assert.equal(e.result.grid, result().grid); // final result wins over progress

  // Idempotent: second finish, progress after done and a new start change nothing.
  const again = s.finishDaily(D1, result({ score: 99999, heightM: 999, perfects: 50 }));
  assert.deepEqual(again, stats);
  s.saveDailyProgress(D1, { score: 1 });
  s.startDaily(D1, { score: 2 });
  assert.equal(s.getDaily(D1).result.score, 900);
  assert.equal(s.getStats(D1).played, 1);
  assert.equal(createStore(be, { now }).getStats(D1).totalPerfects, 6);
});

test('getDaily returns a copy', () => {
  const s = createStore(memoryBackend(), { now });
  playDay(s, D1);
  const e = s.getDaily(D1);
  e.result.score = -5;
  e.status = 'playing';
  assert.equal(s.getDaily(D1).result.score, 500);
  assert.equal(s.getDaily(D1).status, 'done');
});

test('finishDaily without startDaily still records the game', () => {
  const s = createStore(memoryBackend(), { now });
  const st = s.finishDaily(D1, result());
  assert.equal(st.played, 1);
  assert.equal(s.getDaily(D1).status, 'done');
  assert.equal(s.getDaily(D1).startedAt, clock);
});

test('saveDailyProgress without an entry starts one', () => {
  const s = createStore(memoryBackend(), { now });
  s.saveDailyProgress(D1, { score: 10 });
  assert.equal(s.getDaily(D1).status, 'playing');
  assert.equal(s.getDaily(D1).result.score, 10);
});

test('streak logic: consecutive, same day, gap, display 0 when broken', () => {
  const s = createStore(memoryBackend(), { now });
  let st = playDay(s, '2026-10-06');
  assert.equal(st.currentStreak, 1);
  st = playDay(s, '2026-10-07');
  assert.equal(st.currentStreak, 2);
  st = playDay(s, '2026-10-08');
  assert.equal(st.currentStreak, 3);
  assert.equal(st.maxStreak, 3);
  // Same day again (already done) => unchanged.
  st = playDay(s, '2026-10-08');
  assert.equal(st.currentStreak, 3);
  assert.equal(st.played, 3);

  // Display: still alive the next day, 0 after a missed day.
  assert.equal(s.getStats('2026-10-09').currentStreak, 3);
  assert.equal(s.getStats('2026-10-10').currentStreak, 0);
  assert.equal(s.getStats('2026-10-10').maxStreak, 3);

  // Gap => restarts at 1, max kept.
  st = playDay(s, '2026-10-11');
  assert.equal(st.currentStreak, 1);
  assert.equal(st.maxStreak, 3);
  st = playDay(s, '2026-10-12');
  assert.equal(st.currentStreak, 2);
  assert.equal(st.played, 5);

  // Across month & year boundaries.
  const y = createStore(memoryBackend(), { now });
  for (const k of ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']) st = playDay(y, k);
  assert.equal(st.currentStreak, 4);
});

test('out-of-order finish (debug dates) never breaks the streak', () => {
  const s = createStore(memoryBackend(), { now });
  playDay(s, '2026-10-10');
  playDay(s, '2026-10-11');
  const st = playDay(s, '2026-10-01');
  assert.equal(st.played, 3);
  assert.equal(s.getStats('2026-10-11').currentStreak, 2);
  assert.equal(s.getStats('2026-10-11').lastDateKey, '2026-10-11');
});

test('new-best flags', () => {
  const s = createStore(memoryBackend(), { now });
  let st = playDay(s, '2026-10-06', { heightM: 20, score: 500 });
  assert.equal(st.isNewBestHeight, false);
  st = playDay(s, '2026-10-07', { heightM: 25.5, score: 400 });
  assert.equal(st.isNewBestHeight, true);
  assert.equal(st.isNewBestScore, false);
  assert.equal(st.bestHeightM, 25.5);
  assert.equal(st.bestScore, 500);
  st = playDay(s, '2026-10-08', { heightM: 25.5, score: 501 });
  assert.equal(st.isNewBestHeight, false); // equal is not a record
  assert.equal(st.isNewBestScore, true);
  // Idempotent repeat returns the same flags.
  const again = s.finishDaily('2026-10-08', result({ heightM: 1, score: 1 }));
  assert.equal(again.isNewBestScore, true);
  assert.equal(again.bestScore, 501);
});

test('recoverUnfinished finalises every playing entry as quit, once', () => {
  const be = memoryBackend();
  const s = createStore(be, { now });
  playDay(s, '2026-10-06');
  s.startDaily('2026-10-07', { dateKey: '2026-10-07', score: 0 });
  s.saveDailyProgress('2026-10-07', { score: 300, heightM: 12.3, perfects: 2, grid: 'PPG', reason: 'lives' });
  s.startDaily('2026-10-09', { dateKey: '2026-10-09', score: 40, perfects: 1, grid: 'P' });

  // Simulate a reload on 2026-10-09.
  const s2 = createStore(be, { now });
  const rec = s2.recoverUnfinished('2026-10-09');
  assert.equal(rec.length, 2);
  assert.deepEqual(rec.map((r) => r.dateKey), ['2026-10-07', '2026-10-09']);
  assert.ok(rec.every((r) => r.reason === 'quit'));
  assert.equal(rec[0].score, 300);
  assert.equal(rec[0].heightM, 12.3);
  assert.equal(rec[0].dayNumber, 2);
  assert.equal(rec[0].grid, 'PPG');
  assert.equal(s2.getDaily('2026-10-07').status, 'done');
  assert.equal(s2.getDaily('2026-10-09').status, 'done');

  const st = s2.getStats('2026-10-09');
  assert.equal(st.played, 3);
  assert.equal(st.totalPerfects, 4 + 2 + 1);
  assert.equal(st.currentStreak, 1); // 06,07 consecutive, then a gap to 09
  assert.equal(st.maxStreak, 2);

  assert.deepEqual(s2.recoverUnfinished('2026-10-09'), []);
  assert.equal(s2.getStats('2026-10-09').played, 3);
  assert.deepEqual(createStore(memoryBackend()).recoverUnfinished(D1), []);
});

test('history: last 7 calendar days ending today, null for missed days', () => {
  const s = createStore(memoryBackend(), { now });
  playDay(s, '2026-10-01', { heightM: 11.1, score: 111 }); // before epoch: still a calendar day
  playDay(s, '2026-10-06', { heightM: 20.4, score: 500 });
  playDay(s, '2026-10-08', { heightM: 33.3, score: 800 });
  s.startDaily('2026-10-09', {}); // playing: not shown
  const h = s.getStats('2026-10-09').history;
  assert.equal(h.length, 7);
  assert.deepEqual(h.map((d) => d.dateKey), [
    '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09',
  ]);
  assert.deepEqual(h.map((d) => d.dayNumber), [-2, -1, 0, 1, 2, 3, 4]);
  assert.deepEqual(h.map((d) => d.heightM), [null, null, null, 20.4, null, 33.3, null]);
  assert.deepEqual(h.map((d) => d.score), [null, null, null, 500, null, 800, null]);

  // Across a year boundary.
  const y = createStore(memoryBackend(), { now });
  playDay(y, '2026-12-31', { heightM: 5 });
  const hy = y.getStats('2027-01-02').history;
  assert.equal(hy[0].dateKey, '2026-12-27');
  assert.equal(hy[4].heightM, 5);
  assert.equal(hy[6].dateKey, '2027-01-02');
});

test('getStats on an empty store', () => {
  const st = createStore(memoryBackend()).getStats(D1);
  assert.equal(st.played, 0);
  assert.equal(st.currentStreak, 0);
  assert.equal(st.maxStreak, 0);
  assert.equal(st.bestScore, 0);
  assert.equal(st.bestHeightM, 0);
  assert.equal(st.totalPerfects, 0);
  assert.equal(st.lastDateKey, null);
  assert.equal(st.history.length, 7);
  assert.ok(st.history.every((d) => d.heightM === null));
  assert.equal(createStore(memoryBackend()).getStats().history.length, 7); // defaults to today
});

test('practice best', () => {
  const be = memoryBackend();
  const s = createStore(be);
  assert.deepEqual(s.getPracticeBest(), { heightM: 0, score: 0 });
  assert.equal(s.recordPractice(result({ mode: 'practice', heightM: 10.2, score: 300 })).isNewBest, false);
  assert.deepEqual(s.getPracticeBest(), { heightM: 10.2, score: 300 });
  assert.equal(s.recordPractice(result({ mode: 'practice', heightM: 9, score: 200 })).isNewBest, false);
  const r = s.recordPractice(result({ mode: 'practice', heightM: 12, score: 250 }));
  assert.equal(r.isNewBest, true);
  assert.equal(r.isNewBestHeight, true);
  assert.equal(r.isNewBestScore, false);
  assert.equal(s.recordPractice(result({ mode: 'practice', heightM: 1, score: 301 })).isNewBest, true);
  assert.deepEqual(createStore(be).getPracticeBest(), { heightM: 12, score: 301 });
  // Practice never touches daily stats.
  assert.equal(s.getStats(D1).played, 0);
});

test('a throwing backend never crashes and keeps working in memory', () => {
  const s = createStore(throwingBackend(), { now });
  assert.doesNotThrow(() => {
    assert.equal(s.getSettings().sound, true);
    s.setSettings({ sound: false });
    assert.equal(s.getSettings().sound, false);
    s.markTutorialSeen();
    assert.equal(s.tutorialSeen(), true);
    s.startDaily(D1, { score: 1 });
    s.saveDailyProgress(D1, { score: 2 });
    assert.equal(s.getDaily(D1).result.score, 2);
    const st = s.finishDaily(D1, result());
    assert.equal(st.played, 1);
    assert.equal(st.currentStreak, 1);
    s.startDaily('2026-10-07', {});
    assert.equal(s.recoverUnfinished('2026-10-07').length, 1);
    assert.equal(s.getStats('2026-10-07').currentStreak, 2);
    s.recordPractice(result({ mode: 'practice' }));
    assert.equal(s.getPracticeBest().score, 500);
  });
});

test('a backend whose writes throw (quota) keeps memory state', () => {
  const s = createStore(quotaBackend(), { now });
  playDay(s, D1);
  assert.equal(s.getStats(D1).played, 1);
  assert.equal(s.getDaily(D1).status, 'done');
});

test('a backend with missing methods or null is tolerated', () => {
  assert.doesNotThrow(() => {
    const s = createStore({}, { now });
    playDay(s, D1);
    assert.equal(s.getStats(D1).played, 1);
    const n = createStore(null, { now });
    n.setSettings({ sound: false });
    assert.equal(n.getSettings().sound, false);
  });
});

test('corrupt or hostile stored data falls back safely', () => {
  for (const raw of ['{not json', '42', 'null', '[]', '"str"', JSON.stringify({ stats: 'x', daily: 5, settings: null })]) {
    const be = memoryBackend();
    be.setItem(STORAGE_KEY, raw);
    const s = createStore(be, { now });
    assert.equal(s.getStats(D1).played, 0, raw);
    assert.equal(s.getSettings().sound, true);
    playDay(s, D1);
    assert.equal(s.getStats(D1).played, 1);
  }
  const be = memoryBackend();
  be.setItem(STORAGE_KEY, JSON.stringify({
    settings: { sound: 'yes', vibration: false },
    daily: {
      'not-a-date': { status: 'done', result: {} },
      '2026-10-06': { status: 'weird', result: {} },
      '2026-10-05': { status: 'done', result: { heightM: 'NaN', score: -5, grid: 7, weather: 'rain' } },
    },
    stats: { played: 2, streak: 4, maxStreak: 1, bestScore: 'x', lastDateKey: '2026-10-05' },
  }));
  const s = createStore(be, { now });
  assert.deepEqual(s.getSettings(), { sound: true, vibration: false, reducedMotion: false });
  assert.equal(s.getDaily('not-a-date'), null);
  assert.equal(s.getDaily('2026-10-06'), null);
  const r = s.getDaily('2026-10-05').result;
  assert.equal(r.heightM, 0);
  assert.equal(r.score, 0);
  assert.equal(r.grid, '');
  assert.deepEqual(r.weather, []);
  const st = s.getStats('2026-10-06');
  assert.equal(st.played, 2);
  assert.equal(st.currentStreak, 4);
  assert.equal(st.maxStreak, 4);
  assert.equal(st.bestScore, 0);
});

test('two tabs sharing storage see each other\'s writes', () => {
  const be = memoryBackend();
  const a = createStore(be, { now });
  const b = createStore(be, { now });
  a.startDaily(D1, { score: 5 });
  assert.equal(b.getDaily(D1).status, 'playing');
  b.finishDaily(D1, result());
  // Tab A must not resurrect the finished day or double-count it.
  a.saveDailyProgress(D1, { score: 7 });
  a.finishDaily(D1, result({ score: 1 }));
  assert.equal(a.getStats(D1).played, 1);
  assert.equal(a.getDaily(D1).result.score, 500);
  // Clearing site data in another tab resets this one too.
  be.removeItem(STORAGE_KEY);
  assert.equal(a.getStats(D1).played, 0);
});

test('old finished entries are pruned but stats are kept', () => {
  const be = memoryBackend();
  const s = createStore(be, { now });
  playDay(s, '2026-10-06');
  playDay(s, addDays('2026-10-06', 500));
  assert.equal(s.getDaily('2026-10-06'), null);
  assert.equal(s.getStats(addDays('2026-10-06', 500)).played, 2);
});

test('stored blob stays small', () => {
  const be = memoryBackend();
  const s = createStore(be, { now });
  for (let k = 0; k < 365; k++) playDay(s, addDays(D1, k), { grid: 'P'.repeat(120), weather: Array(20).fill('wind') });
  // Progress is saved after every landing, so the blob must stay cheap to stringify & write.
  assert.ok(be.getItem(STORAGE_KEY).length < 80 * 1024, `${be.getItem(STORAGE_KEY).length} bytes`);
  assert.equal(s.getStats(addDays(D1, 364)).played, 365);
  assert.equal(s.getStats(addDays(D1, 364)).currentStreak, 365);
  assert.notEqual(s.getDaily(addDays(D1, 300)), null);
});

test('normalizeResult fills defaults', () => {
  const r = normalizeResult({ heightM: 12.345, score: 10.6, weather: ['wind', 3] }, D1);
  assert.deepEqual(r, {
    mode: 'daily', dateKey: D1, dayNumber: 1, seed: '', reason: 'quit', score: 11, heightM: 12.3,
    blocksPlaced: 0, blocksDropped: 0, perfects: 0, maxCombo: 0, grid: '', weather: ['wind'], durationMs: 0,
  });
  assert.equal(normalizeResult(null).dateKey, null);
  assert.equal(normalizeResult({ mode: 'practice' }).mode, 'practice');
});

test('safeLocalStorage works without window.localStorage and with a throwing one', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    delete globalThis.localStorage;
    const mem = safeLocalStorage();
    mem.setItem('k', 'v');
    assert.equal(mem.getItem('k'), 'v');

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    const s = createStore(undefined, { now });
    playDay(s, D1);
    assert.equal(s.getStats(D1).played, 1);

    const real = memoryBackend();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: real });
    assert.equal(safeLocalStorage(), real);
    createStore(undefined, { now }).setSettings({ sound: false });
    assert.equal(JSON.parse(real.getItem(STORAGE_KEY)).settings.sound, false);
  } finally {
    delete globalThis.localStorage;
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
  }
});
