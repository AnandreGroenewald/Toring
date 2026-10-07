// Come-back hooks: Stapelstad skyline, friend challenge, tomorrow teaser, install prompt, new gull.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSkyline, dayColor, skylineKey, SKYLINE_DAYS } from '../js/core/skyline.js';
import {
  parseChallenge, challengeQuery, shareUrlFor, loadChallenge, CHALLENGE_STORAGE_KEY,
} from '../js/core/challenge.js';
import { tomorrowTeaser } from '../js/core/teaser.js';
import { installMode, isIosSafari } from '../js/core/install.js';
import { buildShareText } from '../js/core/share.js';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { PALETTE } from '../js/config.js';
import { S, WEATHER_INFO, VISITOR_INFO } from '../js/core/strings.js';
import { addDays, seedFor } from '../js/core/daily.js';
import { createSequence } from '../js/core/sequence.js';
import { SOUND_NAMES } from '../js/audio.js';

const TODAY = '2026-10-07';
const NB = '\u00a0';

// ---------------------------------------------------------------------------------- skyline
test('skyline: last 30 days, oldest first, today last, colours from the day sequence', () => {
  const sky = buildSkyline(TODAY, { [TODAY]: 40, [addDays(TODAY, -1)]: 55.5, [addDays(TODAY, -3)]: 12 });
  assert.equal(sky.days.length, SKYLINE_DAYS);
  assert.equal(sky.days[0].dateKey, addDays(TODAY, -29));
  assert.equal(sky.days[29].dateKey, TODAY);
  assert.equal(sky.days[29].heightM, 40);
  assert.equal(sky.days[28].heightM, 55.5);
  assert.equal(sky.days[27].heightM, null);
  assert.equal(sky.count, 3);
  for (const d of sky.days) {
    const want = PALETTE[createSequence(seedFor(d.dateKey)).block(0).color].fill;
    assert.equal(d.color, want, d.dateKey);
    assert.equal(dayColor(d.dateKey), want);
  }
});

test('skyline: best day, streak and a stable signature', () => {
  const heights = { [TODAY]: 40, [addDays(TODAY, -1)]: 55.5, [addDays(TODAY, -2)]: 55.5, [addDays(TODAY, -4)]: 70 };
  const sky = buildSkyline(TODAY, heights);
  assert.deepEqual(sky.best, { dateKey: addDays(TODAY, -4), heightM: 70, index: 25 });
  assert.equal(sky.streak, 3);
  assert.equal(skylineKey(sky), skylineKey(buildSkyline(TODAY, heights)));
  assert.notEqual(skylineKey(sky), skylineKey(buildSkyline(TODAY, { ...heights, [TODAY]: 41 })));
  // a tie keeps the earlier day
  assert.equal(buildSkyline(TODAY, { [TODAY]: 9, [addDays(TODAY, -2)]: 9 }).best.dateKey, addDays(TODAY, -2));
});

test('skyline: today not played yet keeps yesterday\'s streak; gaps and junk are plots', () => {
  const sky = buildSkyline(TODAY, { [addDays(TODAY, -1)]: 20, [addDays(TODAY, -2)]: 30, [addDays(TODAY, -5)]: 'x', [addDays(TODAY, -6)]: -3, [addDays(TODAY, -7)]: NaN });
  assert.equal(sky.streak, 2);
  assert.equal(sky.count, 2);
  assert.equal(buildSkyline(TODAY, {}).best, null);
  assert.equal(buildSkyline(TODAY, {}).streak, 0);
  assert.equal(buildSkyline(TODAY, null).count, 0);
  assert.deepEqual(buildSkyline('nonsense', {}).days, []);
  assert.equal(buildSkyline(TODAY, new Map([[TODAY, 8]])).count, 1);
});

test('store.getDailyHeights lists only finished dailies inside the window', () => {
  let t = Date.parse('2026-10-07T10:00:00');
  const store = createStore(memoryBackend(), { now: () => t });
  const res = (dateKey, heightM) => ({ mode: 'daily', dateKey, heightM, score: 100, blocksDropped: 5, blocksPlaced: 5, perfects: 1, reason: 'lives' });
  for (const [d, h] of [[addDays(TODAY, -40), 90], [addDays(TODAY, -2), 31.5], [TODAY, 44]]) store.finishDaily(d, res(d, h));
  store.startDaily(addDays(TODAY, -1), res(addDays(TODAY, -1), 10));   // still playing: no building yet
  assert.deepEqual(store.getDailyHeights(TODAY, 30), { [TODAY]: 44, [addDays(TODAY, -2)]: 31.5 });
});

// ---------------------------------------------------------------------------------- challenge
test('challenge: valid link for today parses to decimetres and metres', () => {
  assert.deepEqual(parseChallenge('?klop=375&d=2026-10-07', TODAY), { dm: 375, heightM: 37.5, dateKey: TODAY });
  assert.deepEqual(parseChallenge('klop=1&d=2026-10-07&x=1', TODAY)?.dm, 1);
  assert.equal(parseChallenge('?d=2026-10-07&klop=20000', TODAY)?.heightM, 2000);
});

test('challenge: strict validation (range, digits only, date must be today)', () => {
  const bad = [
    '', '?klop=375', '?d=2026-10-07', '?klop=0&d=2026-10-07', '?klop=20001&d=2026-10-07', '?klop=-5&d=2026-10-07',
    '?klop=37.5&d=2026-10-07', '?klop=1e3&d=2026-10-07', '?klop=0375&d=2026-10-07', '?klop=%2B5&d=2026-10-07',
    '?klop=abc&d=2026-10-07', '?klop=&d=2026-10-07', '?klop=375&d=2026-10-06', '?klop=375&d=2026-10-08',
    '?klop=375&d=2026-13-40', '?klop=375&d=<script>', '?klop=375&klop=400&d=2026-10-07', '?klop=375&d=2026-10-07&d=2026-10-07',
    '?klop=99999999999999999999&d=2026-10-07',
  ];
  for (const q of bad) assert.equal(parseChallenge(q, TODAY), null, q);
  assert.equal(parseChallenge(null, TODAY), null);
  assert.equal(parseChallenge('?klop=375&d=2026-10-07', 'junk'), null);
});

test('challenge: share link carries ?klop=<dm>&d=<date> for dailies only', () => {
  const base = 'https://anandregroenewald.github.io/Toring/';
  const daily = { mode: 'daily', dateKey: TODAY, heightM: 37.46 };
  assert.equal(challengeQuery(37.46, TODAY), '?klop=375&d=2026-10-07');
  assert.equal(shareUrlFor(base, daily), `${base}?klop=375&d=${TODAY}`);
  assert.equal(shareUrlFor(base + '?a=1', daily), `${base}?a=1&klop=375&d=${TODAY}`);
  assert.equal(shareUrlFor(base, { mode: 'practice', heightM: 20 }), base);
  assert.equal(shareUrlFor(base, { ...daily, heightM: 0 }), base);
  assert.equal(shareUrlFor(base, { ...daily, heightM: 5000 }), base);   // beyond the 20000 dm limit: no link
  assert.equal(shareUrlFor(base, { ...daily, dateKey: 'x' }), base);
  assert.equal(shareUrlFor('', daily), '');
  // and it round-trips through the parser
  assert.equal(parseChallenge(shareUrlFor(base, daily).split('?')[1], TODAY).heightM, 37.5);
});

test('challenge: the share text keeps its format and ends with the challenge link', () => {
  const r = {
    mode: 'daily', dateKey: TODAY, dayNumber: 2, reason: 'flood', score: 1240, heightM: 37.46, perfects: 7, maxCombo: 4,
    grid: 'PPGPPSPGPPPGSPX', weather: ['wind', 'rain'],
  };
  const url = shareUrlFor('https://anandregroenewald.github.io/Toring/', r);
  const lines = buildShareText(r, { url }).split('\n');
  assert.equal(lines[0], `Stapel #2 🏗️ 37,5${NB}m`);
  assert.equal(lines.at(-2), S.tagline);
  assert.equal(lines.at(-1), `https://anandregroenewald.github.io/Toring/?klop=375&d=${TODAY}`);
});

function fakeSession(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('challenge: kept in sessionStorage for the tab, re-validated, and survives missing storage', () => {
  const ss = fakeSession();
  assert.equal(loadChallenge('?klop=375&d=2026-10-07', TODAY, ss).heightM, 37.5);
  assert.deepEqual(JSON.parse(ss.map.get(CHALLENGE_STORAGE_KEY)), { dm: 375, d: TODAY });
  // a reload without the params keeps it; the next day it is gone
  assert.equal(loadChallenge('', TODAY, ss).heightM, 37.5);
  assert.equal(loadChallenge('', addDays(TODAY, 1), ss), null);
  // a link for another day never replaces or creates one
  assert.equal(loadChallenge('?klop=375&d=2026-10-06', TODAY, fakeSession()), null);
  // tampered storage is rejected
  for (const bad of ['{"dm":0,"d":"2026-10-07"}', '{"dm":"<b>","d":"2026-10-07"}', '{"dm":20001,"d":"2026-10-07"}', 'nope', 'null', '[]']) {
    assert.equal(loadChallenge('', TODAY, fakeSession({ [CHALLENGE_STORAGE_KEY]: bad })), null, bad);
  }
  // storage that throws, or none at all
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(loadChallenge('?klop=100&d=2026-10-07', TODAY, boom).heightM, 10);
  assert.equal(loadChallenge('', TODAY, boom), null);
  assert.equal(loadChallenge('?klop=100&d=2026-10-07', TODAY, null).heightM, 10);
});

test('challenge strings are Afrikaans and carry the flag', () => {
  assert.equal(S.challengeMenu(`37,5${NB}m`), `’n Vriend daag jou uit: klop 37,5${NB}m! 🚩`);
  assert.equal(S.challengeLine(`37,5${NB}m`), `Klop dié: 37,5${NB}m`);
  assert.equal(S.challengeWon, 'Jy het jou vriend geklop! 🎉');
});

// ---------------------------------------------------------------------------------- teaser
test('teaser: the first three weather events of tomorrow, as emoji (and its visitors)', () => {
  const t = tomorrowTeaser(TODAY);
  const seq = createSequence(seedFor(addDays(TODAY, 1)));
  const want = seq.forecast(3);
  assert.equal(t.dateKey, addDays(TODAY, 1));
  assert.deepEqual(t.types, want);
  assert.deepEqual(t.emoji, want.map((x) => WEATHER_INFO[x].emoji));
  assert.deepEqual(t.visitors, seq.visitorForecast());
  const who = t.visitors.map((x) => VISITOR_INFO[x].emoji);
  assert.equal(t.text, `Môre: ${t.emoji.join(' ')}${who.length ? ` · ${who.join(' ')}` : ''} — kom terug!`);
  // across a month of days the visitors part is there when tomorrow has visitors in its first 45 blocks
  for (let k = 0; k < 30; k++) {
    const day = addDays(TODAY, k);
    const tt = tomorrowTeaser(day);
    const v = createSequence(seedFor(addDays(day, 1))).visitorForecast();
    assert.equal(tt.text.includes(' · '), v.length > 0, day);
  }
  assert.deepEqual(tomorrowTeaser(TODAY).types, t.types);   // same for everyone, every time
  assert.equal(tomorrowTeaser('junk'), null);
  // it follows the calendar across a month end
  assert.equal(tomorrowTeaser('2026-10-31').dateKey, '2026-11-01');
});

// ---------------------------------------------------------------------------------- install
test('install: prompt, iOS tip, or nothing', () => {
  const base = { hasPrompt: false, standalone: false, ios: false, dismissed: false, wasInstalled: false };
  assert.equal(installMode({ ...base, hasPrompt: true }), 'prompt');
  assert.equal(installMode({ ...base, ios: true }), 'ios');
  assert.equal(installMode(base), null);
  assert.equal(installMode({ ...base, hasPrompt: true, ios: true }), 'prompt');
  assert.equal(installMode({ ...base, hasPrompt: true, standalone: true }), null);
  assert.equal(installMode({ ...base, ios: true, dismissed: true }), null);
  assert.equal(installMode({ ...base, hasPrompt: true, wasInstalled: true }), null);
  assert.doesNotThrow(() => installMode());   // node: no window, no storage
});

test('install: only real iOS Safari gets the tip', () => {
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const chromeIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36';
  const ipadOs = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  assert.equal(isIosSafari(safari, 5), true);
  assert.equal(isIosSafari(chromeIos, 5), false);
  assert.equal(isIosSafari(android, 5), false);
  assert.equal(isIosSafari(ipadOs, 5), true);    // iPadOS pretends to be a Mac but has a touch screen
  assert.equal(isIosSafari(ipadOs, 0), false);   // a real Mac
});

// ---------------------------------------------------------------------------------- gull
test('the new gull is still a named sound', () => {
  assert.ok(SOUND_NAMES.includes('gull'));
});

test('storage that throws on access (blocked site data) never breaks the challenge or the install offer', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const hadLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const boom = () => { throw new DOMException('denied', 'SecurityError'); };
  Object.defineProperty(globalThis, 'sessionStorage', { get: boom, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { get: boom, configurable: true });
  try {
    assert.equal(loadChallenge('?klop=100&d=2026-10-07', TODAY).heightM, 10);
    assert.equal(loadChallenge('', TODAY), null);
    assert.equal(installMode({ hasPrompt: true, standalone: false, ios: false, wasInstalled: false }), 'prompt');
    assert.doesNotThrow(() => installMode());
  } finally {
    if (had) Object.defineProperty(globalThis, 'sessionStorage', had); else delete globalThis.sessionStorage;
    if (hadLocal) Object.defineProperty(globalThis, 'localStorage', hadLocal); else delete globalThis.localStorage;
  }
});
