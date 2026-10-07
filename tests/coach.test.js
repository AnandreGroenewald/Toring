// First-game coaching: one hint per real moment, text only, never for a player who has learned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCoach, tutorialDone } from '../js/core/coach.js';
import { createStore } from '../js/core/storage.js';
import { COACH } from '../js/config.js';
import { S } from '../js/core/strings.js';

test('each moment gives its hint once, in the first game only', () => {
  const c = createCoach(true);
  assert.equal(c.tap(false), S.coachTap);
  const first = c.landing('G');
  assert.equal(first.text, S.coachMiddle);
  assert.equal(c.landing('P'), null, 'only the first landing is coached');
  assert.equal(c.water().text, S.coachWater);
  assert.equal(c.water(), null);
  assert.equal(c.lost().text, S.coachLost);
  assert.equal(c.lost(), null);
});

test('the first visitor of each kind gets its hint once (first game only)', () => {
  const c = createCoach(true);
  assert.equal(c.visitor('monkey').text, S.coachMonkey);
  assert.equal(c.visitor('monkey'), null, 'a second monkey needs no hint');
  assert.equal(c.visitor('thief').text, S.coachThief);
  assert.equal(c.visitor('clown').text, S.coachClown);
  assert.equal(c.visitor('clown'), null);
  assert.equal(c.visitor('dragon'), null);
  assert.equal(createCoach(false).visitor('thief'), null);
  // the other hints are unaffected
  assert.equal(c.water().text, S.coachWater);
});

test('a Perfek on the first block gets the "do it again" line', () => {
  assert.equal(createCoach(true).landing('P').text, S.coachPerfect);
  assert.equal(createCoach(true).landing('S').text, S.coachMiddle);
});

test('a player who has learned (or an idle scene) gets no hints and the plain tap text', () => {
  const c = createCoach(false);
  assert.equal(c.enabled, false);
  assert.equal(c.landing('P'), null);
  assert.equal(c.water(), null);
  assert.equal(c.lost(), null);
  assert.equal(c.tap(false), S.tapToDrop);
  assert.equal(createCoach(undefined).enabled, false);
});

test('a mouse player is told to click or press space', () => {
  assert.equal(createCoach(true).tap(true), S.clickToDrop);
  assert.equal(createCoach(false).tap(true), S.clickToDrop);
});

test('the first game counts as learned after a few blocks, not after a quick quit', () => {
  assert.equal(tutorialDone(0), false);
  assert.equal(tutorialDone(COACH.minBlocks - 1), false);
  assert.equal(tutorialDone(COACH.minBlocks), true);
  assert.equal(tutorialDone(undefined), false);
  assert.equal(tutorialDone('9'), true);
});

test('the flag survives a reload; a fresh profile is a new player', () => {
  const mem = new Map();
  const be = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const s = createStore(be);
  assert.equal(s.tutorialSeen(), false);
  if (tutorialDone(5)) s.markTutorialSeen();
  assert.equal(createStore(be).tutorialSeen(), true);
});

test('hint copy: short, Afrikaans, and the moments the brief named are covered', () => {
  for (const k of ['firstNudge', 'coachTap', 'coachMiddle', 'coachPerfect', 'coachWater', 'coachLost']) {
    assert.equal(typeof S[k], 'string', k);
    assert.ok(S[k].length > 8 && S[k].length <= 60, `${k} should be one short line`);
  }
  assert.match(S.coachWater, /vloedlyn/);
  assert.match(S.coachLost, /hartjie/);
});

test('the game never starts a how-to pop-up by itself any more', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.ok(!/showHowTo\(true\)/.test(main));
  assert.ok(!/howto-closed/.test(main));
  assert.match(main, /coach: data\.mode !== 'idle' && !store\.tutorialSeen\(\)/);
});
