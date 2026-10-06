// admin.html — the monthly report the owner sends to a sponsor, and date-range helpers.
// Pure functions (no DOM, no network) so they can be tested in node. Numbers use js/core/format.js.

import { fmtInt, MONTHS_AF } from '../core/format.js';
import { addDays, isDateKey } from '../core/daily.js';

const pad2 = (n) => String(n).padStart(2, '0');
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12

/** [from, to] date keys of a whole calendar month (month 1-12). */
export function monthRange(year, month) {
  return { from: `${year}-${pad2(month)}-01`, to: `${year}-${pad2(month)}-${pad2(lastDayOf(year, month))}` };
}

/** The calendar month before the one `dateKey` is in. */
export function previousMonthRange(dateKey) {
  const [y, m] = dateKey.split('-').map(Number);
  return m === 1 ? monthRange(y - 1, 12) : monthRange(y, m - 1);
}

/** The calendar month `dateKey` is in, up to and including `dateKey`. */
export function thisMonthRange(dateKey) {
  return { from: `${dateKey.slice(0, 8)}01`, to: dateKey };
}

/** The last `days` days up to and including `dateKey`. */
export function lastDaysRange(dateKey, days = 30) {
  return { from: addDays(dateKey, -(days - 1)), to: dateKey };
}

const dayLabel = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_AF[m - 1]} ${y}`;
};

/** "Oktober 2026" for a whole month, otherwise "6 Oktober 2026 tot 15 Oktober 2026". */
export function periodLabel(from, to) {
  if (!isDateKey(from) || !isDateKey(to)) return '';
  const [y, m] = from.split('-').map(Number);
  const whole = monthRange(y, m);
  if (from === whole.from && to === whole.to) return `${MONTHS_AF[m - 1]} ${y}`;
  return from === to ? dayLabel(from) : `${dayLabel(from)} tot ${dayLabel(to)}`;
}

const plural = (n, one, many) => `${fmtInt(n)} ${n === 1 ? one : many}`;
const count = (v) => Math.max(0, Math.round(Number(v) || 0));

/**
 * A friendly Afrikaans report for one sponsor, ready to paste into an e-mail or WhatsApp.
 * @param {{ name: string, tier?: string, from: string, to: string,
 *           games: number, blockShows: number, billboardGames: number, billboardDays: number }} r
 */
export function buildMonthlyReport({ name, tier, from, to, games, blockShows, billboardGames, billboardDays }) {
  const g = count(games);
  const shows = count(blockShows);
  const boardGames = count(billboardGames);
  const boardDays = count(billboardDays);
  const lines = [`Hallo ${String(name || '').trim() || 'daar'},`, ''];
  lines.push(`Dankie dat jy Stapel ondersteun! Hier is jou verslag vir ${periodLabel(from, to)}:`, '');

  if (g === 0) {
    lines.push('• Daar is in hierdie tydperk nog geen speletjies getel nie.');
  } else {
    lines.push(`• Stapel is ${fmtInt(g)} keer gespeel.`);
    if (shows > 0 || tier !== 'premium') {
      lines.push(shows > 0
        ? `• Jou naam het ${fmtInt(shows)} keer op ’n blok gestaan wat ’n speler laat val het.`
        : '• Jou naam is in hierdie tydperk nie op ’n blok gewys nie.');
    }
    if (boardGames > 0) {
      lines.push(`• Jou advertensie het op ${plural(boardDays, 'dag', 'dae')} op die eiland langs die toring gestaan en was in ${plural(boardGames, 'speletjie', 'speletjies')} te sien.`);
    } else if (tier === 'premium') {
      lines.push('• Jou advertensiebord is in hierdie tydperk nie in speletjies gewys nie.');
    }
  }
  lines.push(
    '',
    'Die getalle is anoniem getel, sonder enige inligting oor individuele spelers. Net speletjies wat klaargespeel is, tel; dit is ’n goeie aanduiding en nie ’n presiese telling nie.',
    '',
    'Groete',
    'Stapel — Stapel hoog. Staan sterk.',
  );
  return lines.join('\n');
}
