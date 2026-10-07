import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAYINGS, pickSaying, sayingOfTheDay, milestoneSaying, resultCategory, resultSaying, pauseSaying,
  GREAT_HEIGHT_M, EARLY_HEIGHT_M, MILESTONE_STEP_M,
} from '../js/core/sayings.js';
import { buildShareText } from '../js/core/share.js';

const CATEGORIES = ['GENERAL', 'MILESTONE', 'RESULT_GREAT', 'RESULT_LIVES', 'RESULT_EARLY', 'RESULT_FLOOD', 'PAUSE'];

test('every category exists, is non-empty and has no duplicates', () => {
  assert.deepEqual(Object.keys(SAYINGS).sort(), [...CATEGORIES].sort());
  for (const c of CATEGORIES) {
    const list = SAYINGS[c];
    assert.ok(Array.isArray(list) && list.length >= 4, `${c} needs at least 4 sayings`);
    assert.equal(new Set(list).size, list.length, `${c} has a duplicate`);
    for (const s of list) assert.ok(typeof s === 'string' && s.trim() === s && s.length > 3, `${c}: bad entry ${JSON.stringify(s)}`);
  }
  assert.equal(SAYINGS.GENERAL.length, 24);
  assert.equal(SAYINGS.MILESTONE.length, 8);
});

test('typography: the indefinite article uses the curly apostrophe, never a straight one', () => {
  for (const c of CATEGORIES) {
    for (const s of SAYINGS[c]) {
      assert.ok(!s.includes("'"), `${c}: straight apostrophe in "${s}"`);
      assert.ok(!/(^|\s)n\s/.test(s), `${c}: bare "n" article in "${s}"`);
      assert.ok(!/[‘`´]/.test(s), `${c}: wrong quote mark in "${s}"`);
    }
  }
  assert.ok(SAYINGS.GENERAL.includes('’n Boer maak ’n plan.'));
  assert.ok(SAYINGS.RESULT_EARLY.includes('’n Halwe eier is beter as ’n leë dop.'));
});

test('pickSaying is deterministic and always returns a member of its category', () => {
  for (const c of CATEGORIES) {
    for (const key of ['2026-10-06', 'stapel-2026-10-06|flood', '', 'x'.repeat(200), '12']) {
      const a = pickSaying(c, key);
      assert.equal(a, pickSaying(c, key));
      assert.ok(SAYINGS[c].includes(a));
    }
  }
  assert.equal(pickSaying('NOPE', 'k'), '');
});

test('keys spread over the list (not stuck on one saying)', () => {
  for (const c of ['GENERAL', 'MILESTONE']) {
    const seen = new Set();
    for (let d = 1; d <= 120; d++) seen.add(pickSaying(c, `2026-10-${String(d).padStart(3, '0')}`));
    assert.ok(seen.size >= Math.floor(SAYINGS[c].length * 0.7), `${c}: only ${seen.size} distinct picks`);
  }
});

test('saying of the day is the same for everyone and changes with the date', () => {
  assert.equal(sayingOfTheDay('2026-10-07'), sayingOfTheDay('2026-10-07'));
  const days = new Set();
  for (let d = 1; d <= 28; d++) days.add(sayingOfTheDay(`2026-11-${String(d).padStart(2, '0')}`));
  assert.ok(days.size > 8);
});

test('milestone and result sayings depend only on seed and outcome', () => {
  assert.equal(milestoneSaying('stapel-2026-10-07', 50), milestoneSaying('stapel-2026-10-07', 50));
  assert.ok(SAYINGS.MILESTONE.includes(milestoneSaying('stapel-2026-10-07', 25)));
  const r = { seed: 'stapel-2026-10-07', reason: 'lives', heightM: 22.4, dateKey: '2026-10-07' };
  assert.equal(resultSaying(r, false), resultSaying({ ...r, durationMs: 1, score: 9 }, false));
  assert.ok(SAYINGS.RESULT_LIVES.includes(resultSaying(r, false)));
});

test('result category: new best or tall = great, early, flood, lives, quit = general', () => {
  assert.equal(MILESTONE_STEP_M, 25);
  assert.equal(resultCategory({ reason: 'lives', heightM: 20, isNewBest: true }), 'RESULT_GREAT');
  assert.equal(resultCategory({ reason: 'flood', heightM: GREAT_HEIGHT_M }), 'RESULT_GREAT');
  assert.equal(resultCategory({ reason: 'lives', heightM: EARLY_HEIGHT_M - 0.1 }), 'RESULT_EARLY');
  assert.equal(resultCategory({ reason: 'flood', heightM: 3 }), 'RESULT_EARLY');
  assert.equal(resultCategory({ reason: 'flood', heightM: EARLY_HEIGHT_M }), 'RESULT_FLOOD');
  assert.equal(resultCategory({ reason: 'lives', heightM: 30 }), 'RESULT_LIVES');
  assert.equal(resultCategory({ reason: 'quit', heightM: 80, isNewBest: true }), 'GENERAL');
  assert.equal(resultCategory({ reason: 'quit', heightM: 2 }), 'GENERAL');
  assert.ok(SAYINGS.GENERAL.includes(resultSaying({ reason: 'quit', seed: 's', heightM: 5 })));
  assert.equal(resultSaying(null), resultSaying({}));
});

test('pause saying is one of the PAUSE sayings', () => {
  for (const t of [0, 1500, 99999999]) assert.ok(SAYINGS.PAUSE.includes(pauseSaying(t)));
});

test('the WhatsApp share text carries no saying', () => {
  const result = {
    mode: 'daily', dateKey: '2026-10-06', dayNumber: 1, seed: 'stapel-2026-10-06', reason: 'flood', score: 1240,
    heightM: 37.46, blocksPlaced: 13, blocksDropped: 15, perfects: 7, maxCombo: 4,
    grid: 'PPGPPSPGPPPGSPX', weather: ['wind', 'rain'], durationMs: 90000,
  };
  const text = buildShareText(result, { url: 'https://example.test/' });
  for (const c of CATEGORIES) for (const s of SAYINGS[c]) assert.ok(!text.includes(s), `share text contains "${s}"`);
  assert.equal(text.split('\n')[0], 'Stapel #1 🏗️ 37,5\u00a0m');
  assert.ok(text.endsWith('Stapel hoog. Staan sterk.\nhttps://example.test/'));
});
