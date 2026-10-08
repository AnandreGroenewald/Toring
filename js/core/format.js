// Number/date formatting: a space between thousands; a decimal comma in Afrikaans and a point in
// English (setNumberStyle, called by js/core/i18n.js), with each language's day and month names.

const NBSP = ' ';
let decimal = ',';

/** 1234567 -> "1 234 567" (non-breaking spaces). */
export function fmtInt(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 37.46 -> "37,5" (English: "37.5") */
export function fmtDec(x, digits = 1) {
  const v = Number(x) || 0;
  const [whole, frac] = Math.abs(v).toFixed(digits).split('.');
  const sign = v < 0 && Number(Math.abs(v).toFixed(digits)) !== 0 ? '-' : '';
  return sign + fmtInt(Number(whole)) + (frac ? decimal + frac : '');
}

/** metres -> "37,5 m" */
export function fmtM(m) {
  return fmtDec(m, 1) + NBSP + 'm';
}

/** metres without a trailing zero: 50 -> "50 m", 37.46 -> "37,5 m" ("37.5 m" in English) */
export function fmtMShort(m) {
  return fmtM(m).replace(/[,.]0(?=\u00a0m$)/, '');
}

/** ms -> "HH:MM:SS" (for the countdown to the next tower). */
export function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/** ms -> "3 min 12 s" */
export function fmtDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}${NBSP}min ${s}${NBSP}s` : `${s}${NBSP}s`;
}

export const DAYS_AF = ['Sondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrydag', 'Saterdag'];
export const MONTHS_AF = [
  'Januarie', 'Februarie', 'Maart', 'April', 'Mei', 'Junie',
  'Julie', 'Augustus', 'September', 'Oktober', 'November', 'Desember',
];

export const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
let days = DAYS_AF;
let months = MONTHS_AF;

/** 'af' (decimal comma) or 'en' (decimal point), with the day and month names to match. */
export function setNumberStyle(lang) {
  const en = lang === 'en';
  decimal = en ? '.' : ',';
  days = en ? DAYS_EN : DAYS_AF;
  months = en ? MONTHS_EN : MONTHS_AF;
}

/** 0 (Sunday) .. 6 -> the day's name in the current language. */
export const dayName = (i) => days[i] || '';
/** 0 (January) .. 11 -> the month's name in the current language. */
export const monthName = (i) => months[i] || '';

/** "2026-10-06" -> "Dinsdag 6 Oktober 2026" (calendar maths in UTC, so it never shifts with DST). */
export function fmtDateKey(dateKey) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return `${dayName(dt.getUTCDay())} ${d} ${monthName(mo - 1)} ${y}`;
}
