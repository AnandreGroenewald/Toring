// Afrikaans or English. The tables in js/core/strings.js are the Afrikaans originals; setLanguage()
// lays the English ones (js/core/strings.en.js) over them in place, or puts the Afrikaans back, so
// every module keeps reading S.x, WEATHER_INFO[x].name and so on as it always did. Pick the language
// before anything reads a string (js/core/langboot.js does, as the first thing main.js imports):
// later switches need a reload, because drawn text and textures keep the old words.

import { S, WEATHER_INFO, VISITOR_INFO, PUNISH_INFO, POWERUP_INFO, COSMETIC_INFO, RANK_INFO, SHAPE_NAMES } from './strings.js';
import {
  S_EN, WEATHER_INFO_EN, VISITOR_INFO_EN, PUNISH_INFO_EN, POWERUP_INFO_EN, COSMETIC_INFO_EN, RANK_INFO_EN, SHAPE_NAMES_EN,
  SAYING_MEANINGS,
} from './strings.en.js';
import { setNumberStyle } from './format.js';

export const LANGS = Object.freeze(['af', 'en']);
export const isLang = (v) => LANGS.includes(v);

const TABLES = { S, WEATHER_INFO, VISITOR_INFO, PUNISH_INFO, POWERUP_INFO, COSMETIC_INFO, RANK_INFO, SHAPE_NAMES };
const ENGLISH = {
  S: S_EN, WEATHER_INFO: WEATHER_INFO_EN, VISITOR_INFO: VISITOR_INFO_EN, PUNISH_INFO: PUNISH_INFO_EN,
  POWERUP_INFO: POWERUP_INFO_EN, COSMETIC_INFO: COSMETIC_INFO_EN, RANK_INFO: RANK_INFO_EN, SHAPE_NAMES: SHAPE_NAMES_EN,
};

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** A copy of a table: objects and arrays copied, functions and text kept as they are. */
function copy(v) {
  if (Array.isArray(v)) return v.map(copy);
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)]));
  return v;
}

/** Lay `source` over `target`: nested objects key by key (emoji stay), everything else replaced. */
function overlay(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (isPlain(v) && isPlain(target[k])) overlay(target[k], v);
    else target[k] = copy(v);
  }
}

const AFRIKAANS = copy(TABLES);
let current = 'af';

/** Switch every table to `lang` ('af' or 'en'; anything else is Afrikaans). Returns the language set. */
export function setLanguage(lang) {
  const l = isLang(lang) ? lang : 'af';
  for (const [name, table] of Object.entries(TABLES)) overlay(table, l === 'en' ? ENGLISH[name] : AFRIKAANS[name]);
  setNumberStyle(l);
  current = l;
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = l;
  return l;
}

export const getLanguage = () => current;

/** What an Afrikaans saying means, in English ('' in Afrikaans, where it speaks for itself). */
export const sayingMeaning = (line) => (current === 'en' && line ? SAYING_MEANINGS[line] || '' : '');

/** An Afrikaans saying as shown: as it is in Afrikaans, with its meaning in English. */
export function glossSaying(line) {
  if (current !== 'en' || !line) return line;
  const meaning = SAYING_MEANINGS[line];
  return meaning ? `${line} (${meaning})` : line;
}
