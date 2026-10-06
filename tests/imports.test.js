// Every core module must import in node (no DOM, no Phaser at import time).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const MODULES = {
  '../js/config.js': ['GAME_W', 'EPOCH_DATE_KEY', 'STORAGE_KEY', 'RATING_EMOJI'],
  '../js/core/bus.js': ['bus', 'Bus'],
  '../js/core/format.js': ['fmtM', 'fmtInt', 'fmtClock', 'fmtDateKey'],
  '../js/core/strings.js': ['S', 'WEATHER_INFO', 'SHAPE_NAMES'],
  '../js/core/rng.js': ['hashString', 'mulberry32', 'createRng'],
  '../js/core/daily.js': [
    'dateKeyFor', 'dayNumber', 'seedFor', 'addDays', 'daysBetween', 'msUntilNextDay', 'nextDayTimestamp', 'parseDebugDate',
  ],
  '../js/core/sequence.js': ['createSequence'],
  '../js/core/weatherplan.js': ['eventRng', 'gustMul', 'strikePlan', 'hailPlan'],
  '../js/core/storage.js': ['createStore', 'streakAfter'],
  '../js/core/share.js': ['buildShareText', 'shareResult', 'whatsappUrl'],
};

test('core modules import cleanly in node and export the spec API', async () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof globalThis.document, 'undefined');
  for (const [path, names] of Object.entries(MODULES)) {
    const mod = await import(path);
    for (const n of names) assert.ok(n in mod, `${path} is missing export ${n}`);
  }
});

test('share strings exist for every weather type and rating', async () => {
  const { WEATHER_TYPES, RATING_EMOJI, RATING } = await import('../js/config.js');
  const { WEATHER_INFO, S } = await import('../js/core/strings.js');
  for (const t of WEATHER_TYPES) assert.ok(WEATHER_INFO[t]?.emoji, t);
  for (const r of Object.values(RATING)) assert.ok(RATING_EMOJI[r], r);
  assert.equal(S.tagline, 'Stapel hoog. Staan sterk.');
  assert.equal(S.shareDailyHead(3), 'Stapel #3');
  assert.equal(S.sharePracticeHead, 'Stapel (oefenrondte)');
});
