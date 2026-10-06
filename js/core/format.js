// Afrikaans number/date formatting: decimal comma, space as thousands separator.

const NBSP = ' ';

/** 1234567 -> "1 234 567" (non-breaking spaces). */
export function fmtInt(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 37.46 -> "37,5" */
export function fmtDec(x, digits = 1) {
  const v = Number(x) || 0;
  const [whole, frac] = Math.abs(v).toFixed(digits).split('.');
  const sign = v < 0 && Number(Math.abs(v).toFixed(digits)) !== 0 ? '-' : '';
  return sign + fmtInt(Number(whole)) + (frac ? ',' + frac : '');
}

/** metres -> "37,5 m" */
export function fmtM(m) {
  return fmtDec(m, 1) + NBSP + 'm';
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

/** "2026-10-06" -> "Dinsdag 6 Oktober 2026" (calendar maths in UTC, so it never shifts with DST). */
export function fmtDateKey(dateKey) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return `${DAYS_AF[dt.getUTCDay()]} ${d} ${MONTHS_AF[mo - 1]} ${y}`;
}
