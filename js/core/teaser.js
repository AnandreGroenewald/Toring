// "Môre: 💨 ⛈️ 🌈 · 🐒 🤡 — kom terug!": a peek at tomorrow's first weather events (and its
// visitors), from tomorrow's seed.

import { WEATHER_INFO, VISITOR_INFO, S } from './strings.js';
import { addDays, seedFor, isDateKey } from './daily.js';
import { createSequence } from './sequence.js';

/** { dateKey, types, emoji, visitors, text } for the day after `todayKey` (first `n` weather events), or null. */
export function tomorrowTeaser(todayKey, n = 3) {
  if (!isDateKey(todayKey)) return null;
  const dateKey = addDays(todayKey, 1);
  let types = [];
  let visitors = [];
  try {
    const seq = createSequence(seedFor(dateKey));
    types = seq.forecast(n).filter((t) => WEATHER_INFO[t]);
    visitors = seq.visitorForecast().filter((t) => VISITOR_INFO[t]);
  } catch {
    return null;
  }
  if (!types.length) return null;
  const emoji = types.map((t) => WEATHER_INFO[t].emoji);
  const who = visitors.map((t) => VISITOR_INFO[t].emoji);
  const all = who.length ? `${emoji.join(' ')} · ${who.join(' ')}` : emoji.join(' ');
  return { dateKey, types, emoji, visitors, text: S.tomorrowLine(all) };
}
