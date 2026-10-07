// "Môre: 💨 ⛈️ 🌈 — kom terug!": a peek at tomorrow's first weather events, from tomorrow's seed.

import { WEATHER_INFO, S } from './strings.js';
import { addDays, seedFor, isDateKey } from './daily.js';
import { createSequence } from './sequence.js';

/** { dateKey, types, emoji, text } for the day after `todayKey` (first `n` weather events), or null. */
export function tomorrowTeaser(todayKey, n = 3) {
  if (!isDateKey(todayKey)) return null;
  const dateKey = addDays(todayKey, 1);
  let types = [];
  try {
    types = createSequence(seedFor(dateKey)).forecast(n).filter((t) => WEATHER_INFO[t]);
  } catch {
    return null;
  }
  if (!types.length) return null;
  const emoji = types.map((t) => WEATHER_INFO[t].emoji);
  return { dateKey, types, emoji, text: S.tomorrowLine(emoji.join(' ')) };
}
