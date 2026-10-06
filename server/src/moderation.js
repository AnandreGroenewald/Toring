// Moderation of everything a sponsor wants shown in the game.
// The server is authoritative; js/core/sponsors.js mirrors these rules for instant feedback.
// Hard rule -> rejected before payment (we never take money for a name we won't show).
// Soft rule (shouting caps, "!!!") -> auto-fixed.

export const NAME_MIN = 2;
export const NAME_MAX = 22;
export const TAGLINE_MAX = 40;
export const URL_MAX = 200;

// Latin letters only (incl. ê ë ô ï á ...) so look-alike Cyrillic/Greek letters can't
// smuggle words past the filter. Digits, space and & . - ' ’ !
const NAME_CHARS = /^(?:[0-9 &.\-'’!]|(?=\p{L})\p{Script=Latin})+$/u;
// Taglines are sentences, so a few more punctuation marks are allowed.
const TAGLINE_CHARS = /^(?:[0-9 &.\-'’!,:?%]|(?=\p{L})\p{Script=Latin})+$/u;
const ALNUM = /[0-9]|(?=\p{L})\p{Script=Latin}/gu;

const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿]/g;

/** NFKC (folds full-width and ligature tricks), unify quotes/dashes, drop invisibles, collapse spaces. */
export function normalizeText(input) {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/[‘ʼ`´′]/g, '’')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

const LEET_I = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };
const LEET_L = { ...LEET_I, 1: 'l', '!': ' ', '|': 'l' };

function deleet(s, map) {
  return [...s].map((ch) => map[ch] ?? ch).join('');
}

/** Lower-case, accent-free, de-leeted readings of the text (two readings: 1 -> i and 1 -> l). */
function readings(text) {
  const base = stripDiacritics(text.toLowerCase());
  return [deleet(base, LEET_I), deleet(base, LEET_L), base].map((r) => ({
    tokens: r.split(/[^a-z]+/).filter(Boolean),
    compact: r.replace(/[^a-z]/g, ''),
  }));
}

// Matched anywhere, even across spaces/dots and with letters stretched ("f.u.u.c.k").
// Only words long and distinctive enough not to hide inside innocent names.
const HARD = [
  'fuck', 'cunt', 'nigger', 'nigga', 'kaffir', 'kaffer', 'faggot', 'motherf', 'hotnot', 'moffie',
  'bullshit', 'porn', 'wanker', 'asshole', 'arsehole', 'dildo', 'blowjob', 'handjob', 'jizz', 'whore',
  'naaier', 'poephol', 'poesklap', 'fokken', 'fokker', 'fokkof',
];

// Matched as whole words only (so "Fokus", "Therapist", "Torpedo", "Hoërskool", "Naaimasjien",
// "Moer en Bout" and "Cum Laude" stay allowed).
const WORDS = new Set([
  // English
  'fuk', 'fuq', 'shit', 'shite', 'shits', 'shitty', 'bitch', 'bitches', 'bastard', 'dick', 'dicks',
  'dickhead', 'cock', 'cocks', 'pussy', 'porno', 'xxx', 'sex', 'nazi', 'nazis', 'hitler', 'rape', 'raped',
  'rapist', 'pedo', 'paedo', 'slut', 'sluts', 'twat', 'prick', 'piss', 'pissed', 'arse', 'ass', 'retard',
  'retards', 'tits', 'titty', 'boobs', 'nude', 'nudes', 'milf', 'spunk', 'bollocks', 'hooker', 'kkk',
  'cocaine', 'heroin', 'meth', 'nig', 'coon', 'spic', 'chink', 'gook', 'fag', 'fags', 'dyke', 'tranny',
  // Afrikaans
  'fok', 'fokof', 'fokol', 'fokit', 'poes', 'poese', 'naai', 'naaiery', 'kak', 'kakhuis', 'piel',
  'lul', 'tiete', 'tieties', 'hoer', 'hoere', 'slet', 'teef', 'meid', 'boesman', 'koelie', 'gam',
  'kont', 'drol', 'pedofiel',
]);

// Names that would impersonate the game, the platform or the empty-billboard text.
const RESERVED_EXACT = new Set([
  'test', 'toets', 'testing', 'admin', 'administrator', 'moderator', 'stapel', 'borg', 'borge',
  'advertensie', 'advertensies', 'adverteerhier', 'jouadvertensiehier', 'jounaamhier', 'adverteeropstapel',
  'null', 'undefined', 'anoniem', 'anonymous',
]);
const RESERVED_WORDS = new Set(['admin', 'administrator', 'moderator', 'stapel']);
const RESERVED_ANYWHERE = ['paystack', 'sportscard'];

const STRETCH = new Map();
function stretchRegex(word) {
  if (!STRETCH.has(word)) {
    const letters = word.replace(/[^a-z]/g, '');
    // "nigger" -> n+i+g{2,}e+r+ : tolerates "niiigggger" but keeps "Niger" allowed.
    let src = '';
    for (let i = 0; i < letters.length; ) {
      let j = i;
      while (letters[j] === letters[i]) j++;
      const n = j - i;
      src += n > 1 ? `${letters[i]}{${n},}` : `${letters[i]}+`;
      i = j;
    }
    STRETCH.set(word, new RegExp(src));
  }
  return STRETCH.get(word);
}

/** True if the text contains a blocked word in any reading. */
export function containsBlockedWord(text) {
  for (const { tokens, compact } of readings(text)) {
    if (tokens.some((t) => WORDS.has(t))) return true;
    if (HARD.some((w) => stretchRegex(w).test(compact))) return true;
  }
  return false;
}

export function isReserved(text) {
  for (const { tokens, compact } of readings(text)) {
    if (RESERVED_EXACT.has(compact)) return true;
    if (tokens.some((t) => RESERVED_WORDS.has(t))) return true;
    if (RESERVED_ANYWHERE.some((w) => compact.includes(w))) return true;
  }
  return false;
}

const TLDS = 'com|net|org|co|za|io|biz|info|me|app|online|site|shop|store|xyz|africa|joburg|capetown|durban|web|ly|gg|tv|link|click|club|live|top|ru|cn|uk|us|de|nl';
// No spaces around the dot: "Altyd vars. Net vir jou" is Afrikaans, not a domain.
const URL_LIKE = new RegExp(`(?:^|[^\\p{L}])(?:https?|www)(?:[^\\p{L}]|$)|[\\p{L}0-9-]\\.(?:${TLDS})(?:[^\\p{L}]|$)`, 'iu');

/** URLs, e-mail addresses and phone numbers don't belong in a name (use the url field). */
export function looksLikeContact(text) {
  if (text.includes('@')) return true;
  if (URL_LIKE.test(text)) return true;
  return (text.match(/[0-9]/g) || []).length >= 7;
}

const VOWELS = /[aeiouyáàâäéèêëíìîïóòôöúùûü]/i;

/** "DIE GROOT WINKEL" -> "Die Groot Winkel"; short or vowel-less words ("SA", "BMW") stay as acronyms. */
function softenCaps(text) {
  const letters = text.match(/\p{L}/gu) || [];
  const isShouting = letters.length >= 6 && text === text.toUpperCase() && text !== text.toLowerCase();
  if (!isShouting) return text;
  return text.replace(/\p{L}+/gu, (w) => {
    if (w.length <= 2 || !VOWELS.test(w)) return w;
    return w[0] + w.slice(1).toLowerCase();
  });
}

function softFix(text) {
  const out = softenCaps(text.replace(/([!.&'’,:?-])\1+/g, '$1'));
  return { value: out, fixed: out !== text };
}

function lengthOf(s) {
  return [...s].length;
}

/**
 * Validates a public display text.
 * @returns {{ ok: true, value: string, fixed: boolean } | { ok: false, code: string }}
 */
function checkDisplayText(raw, { min, max, chars, invalidCode, rejectedCode, admin }) {
  if (typeof raw !== 'string') return { ok: false, code: invalidCode };
  const text = normalizeText(raw);
  const len = lengthOf(text);
  if (len < min || len > max || !chars.test(text)) return { ok: false, code: invalidCode };
  if ((text.match(ALNUM) || []).length < Math.min(2, min)) return { ok: false, code: invalidCode };
  if (looksLikeContact(text)) return { ok: false, code: rejectedCode };
  if (!admin && (containsBlockedWord(text) || isReserved(text))) return { ok: false, code: rejectedCode };
  return admin ? { ok: true, value: text, fixed: false } : { ok: true, ...softFix(text) };
}

/** Business name shown on the blocks / billboard. `admin` skips the word lists (owner's own call). */
export function checkName(raw, { admin = false, max = NAME_MAX } = {}) {
  return checkDisplayText(raw, {
    min: NAME_MIN, max, chars: NAME_CHARS, invalidCode: 'invalid_name', rejectedCode: 'name_rejected', admin,
  });
}

/** Optional premium tagline; empty -> null. */
export function checkTagline(raw, { admin = false, max = TAGLINE_MAX } = {}) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && normalizeText(raw) === '')) {
    return { ok: true, value: null, fixed: false };
  }
  return checkDisplayText(raw, {
    min: 2, max, chars: TAGLINE_CHARS, invalidCode: 'invalid_tagline', rejectedCode: 'tagline_rejected', admin,
  });
}

const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Optional premium website. Only https; shown in-game as plain hostname text.
 * "example.co.za" and "http://..." are upgraded to https.
 */
export function checkUrl(raw, { admin = false } = {}) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string' || raw.length > URL_MAX + 20) return { ok: false, code: 'invalid_url' };
  let s = raw.trim();
  if (/^http:\/\//i.test(s)) s = `https://${s.slice(7)}`;
  else if (!/^https:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^:/]+:\d+/.test(s)) return { ok: false, code: 'invalid_url' };
    s = `https://${s}`;
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, code: 'invalid_url' };
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return { ok: false, code: 'invalid_url' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!HOSTNAME.test(host)) return { ok: false, code: 'invalid_url' };
  if (!admin && (containsBlockedWord(host.replace(/[.-]/g, ' ')) || containsBlockedWord(u.pathname))) {
    return { ok: false, code: 'invalid_url' };
  }
  const value = `https://${host}${u.pathname}${u.search}`;
  if (value.length > URL_MAX) return { ok: false, code: 'invalid_url' };
  return { ok: true, value };
}
