// Afrikaans and English (js/core/i18n.js): the English tables match the Afrikaans ones key for key,
// switching lays them over in place and back again, numbers and dates follow, the sayings keep their
// Afrikaans with an English meaning, and the store keeps the choice in a key of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as AF from '../js/core/strings.js';
import * as EN from '../js/core/strings.en.js';
import { setLanguage, getLanguage, glossSaying, sayingMeaning, LANGS } from '../js/core/i18n.js';
import { fmtM, fmtMShort, fmtDateKey } from '../js/core/format.js';
import { SAYINGS } from '../js/core/sayings.js';
import { buildShareText } from '../js/core/share.js';
import { createStore, memoryBackend } from '../js/core/storage.js';

const PAIRS = [
  ['S', 'S_EN'], ['WEATHER_INFO', 'WEATHER_INFO_EN'], ['VISITOR_INFO', 'VISITOR_INFO_EN'], ['PUNISH_INFO', 'PUNISH_INFO_EN'],
  ['POWERUP_INFO', 'POWERUP_INFO_EN'], ['COSMETIC_INFO', 'COSMETIC_INFO_EN'], ['RANK_INFO', 'RANK_INFO_EN'], ['SHAPE_NAMES', 'SHAPE_NAMES_EN'],
];
const SHARED = new Set(['emoji', 'icon']);   // the same in both languages (kept from the Afrikaans table)

/** Every text in `af` (a string or a function) has an English twin of the same kind at the same place. */
function sameShape(af, en, path, problems) {
  if (Array.isArray(af)) {
    if (!Array.isArray(en) || en.length !== af.length) problems.push(`${path}: an array of ${af.length}`);
    else af.forEach((x, i) => sameShape(x, en[i], `${path}[${i}]`, problems));
    return;
  }
  if (af && typeof af === 'object') {
    if (!en || typeof en !== 'object') {
      problems.push(`${path}: missing`);
      return;
    }
    for (const [k, v] of Object.entries(af)) {
      if (SHARED.has(k)) continue;
      sameShape(v, en[k], `${path}.${k}`, problems);
    }
    for (const k of Object.keys(en)) if (!(k in af)) problems.push(`${path}.${k}: not in Afrikaans`);
    return;
  }
  if (typeof af === 'function') {
    if (typeof en !== 'function') problems.push(`${path}: should be a function`);
    else if (en.length !== af.length) problems.push(`${path}: takes ${af.length} argument(s)`);
    return;
  }
  if (typeof af === 'string' && typeof en !== 'string') problems.push(`${path}: should be text`);
}

test('the English tables match the Afrikaans ones, key for key', () => {
  setLanguage('af');
  const problems = [];
  for (const [a, e] of PAIRS) sameShape(AF[a], EN[e], a, problems);
  assert.deepEqual(problems, []);
});

test('every English text is filled in, and reads as English', () => {
  // sample arguments for the functions: numbers, names, a points table
  const p = { liveWin: 25, liveLoss: -10, otherWin: 10, otherLoss: -5 };
  const call = (f) => f(...Array.from({ length: f.length }, (_, i) => (i === 0 && f.toString().includes('p.liveWin') ? p : i % 2 ? 'Bennie' : 3)));
  const afrikaans = /(^|[\s(])(’n|die|jou|nie|vir|met|van|het|is nie|blokke|toring)(?=[\s.,!?:;)]|$)/i;
  const bad = [];
  const walk = (v, path) => {
    if (typeof v === 'function') v = call(v);
    if (typeof v === 'string') {
      if (!v.trim() && !path.endsWith('cityStreak')) bad.push(`${path}: empty`);
      if (path !== 'S.langPick' && afrikaans.test(v)) bad.push(`${path}: ${v}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  for (const [, e] of PAIRS) walk(EN[e], e.replace('_EN', ''));
  assert.deepEqual(bad, []);
});

test('switching: English laid over in place, Afrikaans back exactly; numbers and dates follow', () => {
  assert.deepEqual(LANGS, ['af', 'en']);
  const before = JSON.stringify(AF.S) + JSON.stringify(AF.WEATHER_INFO) + JSON.stringify(AF.COSMETIC_INFO);
  const howTo = AF.S.howToSteps.map((x) => x.text).join('|');
  assert.equal(setLanguage('en'), 'en');
  assert.equal(getLanguage(), 'en');
  assert.equal(AF.S.practice, 'Practice');
  assert.equal(AF.S.duelVs('Bennie'), 'vs Bennie!');
  assert.equal(AF.WEATHER_INFO.wind.emoji, '💨', 'emoji stay');
  assert.equal(AF.WEATHER_INFO.heat.name, 'Heat wave');
  assert.equal(AF.COSMETIC_INFO.title.toringkoning.name, 'Tower king');
  assert.equal(AF.VISITOR_INFO.monkey.name, 'Blouaap', 'the characters keep their names');
  assert.equal(AF.S.howToSteps[0].icon, '👆');
  assert.equal(fmtM(37.46), '37.5 m');
  assert.equal(fmtDateKey('2026-10-06'), 'Tuesday 6 October 2026');
  assert.equal(fmtMShort(50), '50\u00a0m', 'no ".0" in English either');
  assert.equal(fmtMShort(37.46), '37.5\u00a0m');
  assert.equal(setLanguage('fr'), 'af', 'anything else is Afrikaans');
  assert.equal(fmtMShort(50), '50\u00a0m');
  assert.equal(fmtMShort(37.46), '37,5\u00a0m');
  assert.equal(AF.S.practice, 'Oefen');
  assert.equal(fmtM(37.46), '37,5 m');
  assert.equal(fmtDateKey('2026-10-06'), 'Dinsdag 6 Oktober 2026');
  assert.equal(JSON.stringify(AF.S) + JSON.stringify(AF.WEATHER_INFO) + JSON.stringify(AF.COSMETIC_INFO), before);
  assert.equal(AF.S.howToSteps.map((x) => x.text).join('|'), howTo);
  // twice over and back changes nothing either
  setLanguage('en');
  setLanguage('en');
  setLanguage('af');
  assert.equal(JSON.stringify(AF.S) + JSON.stringify(AF.WEATHER_INFO) + JSON.stringify(AF.COSMETIC_INFO), before);
});

test('sayings stay Afrikaans; English adds what each one means', () => {
  const all = new Set(Object.values(SAYINGS).flat());
  const missing = [...all].filter((line) => !EN.SAYING_MEANINGS[line]);
  assert.deepEqual(missing, [], 'every saying has an English meaning');
  assert.deepEqual(Object.keys(EN.SAYING_MEANINGS).filter((k) => !all.has(k)), [], 'no meanings for sayings that are gone');
  setLanguage('af');
  assert.equal(glossSaying('Aanhouer wen.'), 'Aanhouer wen.');
  assert.equal(sayingMeaning('Aanhouer wen.'), '');
  setLanguage('en');
  assert.equal(glossSaying('Aanhouer wen.'), 'Aanhouer wen. (Perseverance wins.)');
  assert.equal(sayingMeaning('Oefening baar kuns.'), 'Practice makes perfect.');
  assert.equal(glossSaying(''), '');
  setLanguage('af');
});

test('the WhatsApp text in English', () => {
  setLanguage('en');
  const text = buildShareText({ mode: 'daily', dayNumber: 3, heightM: 37.46, score: 1240, perfects: 7, grid: 'PPGX', reason: 'lives', weather: ['wind'] }, { url: 'https://example.com/' });
  setLanguage('af');
  assert.match(text, /^Stapel #3 🏗️ 37\.5 m/);
  assert.match(text, /Stack high\. Stand strong\./);
  assert.doesNotMatch(text, /Stapel hoog/);
});

test('the store keeps the language in a key of its own, and knows a player who played before', () => {
  const backend = memoryBackend();
  const store = createStore(backend, { now: () => Date.UTC(2026, 9, 8, 10) });
  assert.equal(store.getLang(), null, 'nobody chose yet');
  assert.equal(store.hasPlayed(), false);
  assert.equal(store.setLang('fr'), false);
  assert.equal(store.setLang('en'), true);
  assert.equal(store.getLang(), 'en');
  assert.equal(backend.getItem('stapel.v1.lang'), 'en');
  // a page on an older version rewrites the main blob: the language is untouched
  backend.setItem('stapel.v1', JSON.stringify({ v: 1, settings: { sound: true } }));
  assert.equal(createStore(backend).getLang(), 'en');
  store.recordPractice({ mode: 'practice', heightM: 5, score: 10, perfects: 0 });
  assert.equal(store.hasPlayed(), true);
});
