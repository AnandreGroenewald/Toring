import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKeyFor, dayNumber, seedFor, addDays, daysBetween, msUntilNextDay, nextDayTimestamp, parseDebugDate, isDateKey,
} from '../js/core/daily.js';
import { EPOCH_DATE_KEY } from '../js/config.js';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const HOUR = 3600000;

test(`[${TZ}] dayNumber: epoch is #1 and counts calendar days`, () => {
  assert.equal(EPOCH_DATE_KEY, '2026-10-06');
  assert.equal(dayNumber('2026-10-06'), 1);
  assert.equal(dayNumber('2026-10-07'), 2);
  assert.equal(dayNumber('2026-10-05'), 0);
  assert.equal(dayNumber('2026-10-31'), 26);
  assert.equal(dayNumber('2026-11-01'), 27);
  assert.equal(dayNumber('2026-12-31'), 87);
  assert.equal(dayNumber('2027-01-01'), 88);
  assert.equal(dayNumber('2027-10-06'), 366);
  assert.equal(dayNumber('2028-10-06'), 732); // includes 29 Feb 2028
  // Across every DST change of the northern & southern hemispheres: always +1 per day.
  let key = '2026-09-01';
  let n = dayNumber(key);
  for (let k = 0; k < 800; k++) {
    const next = addDays(key, 1);
    assert.equal(dayNumber(next), n + 1, `${key} -> ${next}`);
    key = next;
    n += 1;
  }
});

test(`[${TZ}] dayNumber of the local date is stable through the day (DST days included)`, () => {
  // Every hour of days that contain a DST switch somewhere in the world.
  const days = [
    [2026, 9, 6], [2026, 9, 25], [2026, 10, 1], [2027, 2, 14], [2027, 2, 28], [2027, 3, 4], [2026, 8, 27],
  ];
  for (const [y, m, d] of days) {
    const expected = dayNumber(dateKeyFor(new Date(y, m, d, 12)));
    for (let h = 0; h < 24; h++) {
      for (const min of [0, 30, 59]) {
        const dt = new Date(y, m, d, h, min);
        if (dt.getDate() !== d) continue; // non-existent local time rolled over
        assert.equal(dayNumber(dateKeyFor(dt)), expected, dt.toString());
      }
    }
  }
});

test('seedFor', () => {
  assert.equal(seedFor('2026-10-06'), 'stapel-2026-10-06');
});

test(`[${TZ}] dateKeyFor uses the LOCAL date`, () => {
  assert.equal(dateKeyFor(new Date(2026, 9, 6, 0, 0, 0)), '2026-10-06');
  assert.equal(dateKeyFor(new Date(2026, 9, 6, 23, 59, 59, 999)), '2026-10-06');
  assert.equal(dateKeyFor(new Date(2026, 9, 7, 0, 0, 0)), '2026-10-07');
  assert.equal(dateKeyFor(new Date(2027, 0, 1, 0, 0, 1)), '2027-01-01');
  assert.equal(dateKeyFor(new Date(2026, 11, 31, 23, 0)), '2026-12-31');
  assert.equal(dateKeyFor(new Date(2026, 9, 6, 12).getTime()), '2026-10-06'); // epoch ms accepted
  assert.match(dateKeyFor(), /^\d{4}-\d{2}-\d{2}$/);

  // A fixed instant lands on different local dates per zone.
  const instant = new Date(Date.UTC(2026, 9, 6, 22, 30)); // 22:30 UTC
  const expected = {
    'Africa/Johannesburg': '2026-10-07', // UTC+2
    'Europe/Amsterdam': '2026-10-07', // CEST, UTC+2
    'America/New_York': '2026-10-06', // EDT, UTC-4
    'Pacific/Auckland': '2026-10-07', // NZDT, UTC+13
    UTC: '2026-10-06',
    'Etc/UTC': '2026-10-06',
  };
  if (expected[TZ]) assert.equal(dateKeyFor(instant), expected[TZ]);
  const early = new Date(Date.UTC(2026, 9, 6, 3, 0)); // 03:00 UTC
  const expectedEarly = {
    'Africa/Johannesburg': '2026-10-06',
    'Europe/Amsterdam': '2026-10-06',
    'America/New_York': '2026-10-05',
    'Pacific/Auckland': '2026-10-06',
    UTC: '2026-10-06',
    'Etc/UTC': '2026-10-06',
  };
  if (expectedEarly[TZ]) assert.equal(dateKeyFor(early), expectedEarly[TZ]);
});

test('addDays / daysBetween across month, year and leap boundaries', () => {
  assert.equal(addDays('2026-10-06', 0), '2026-10-06');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
  assert.equal(addDays('2026-10-06', 365), '2027-10-06');
  assert.equal(addDays('2026-10-06', -6), '2026-09-30');
  assert.equal(addDays('2027-03-27', 2), '2027-03-29'); // EU spring-forward weekend
  assert.equal(addDays('2026-10-24', 2), '2026-10-26'); // EU fall-back weekend
  assert.equal(addDays('2026-11-01', 1), '2026-11-02'); // US fall-back
  assert.equal(addDays('2027-04-04', 1), '2027-04-05'); // NZ fall-back

  assert.equal(daysBetween('2026-10-06', '2026-10-06'), 0);
  assert.equal(daysBetween('2026-10-06', '2026-10-07'), 1);
  assert.equal(daysBetween('2026-10-07', '2026-10-06'), -1);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2026-10-06', '2027-10-06'), 365);
  assert.equal(daysBetween('2027-10-06', '2028-10-06'), 366);
  assert.equal(daysBetween('2027-03-27', '2027-03-29'), 2);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);

  // Round trip property.
  for (let n = -800; n <= 800; n += 7) {
    const k = addDays('2026-10-06', n);
    assert.ok(isDateKey(k), k);
    assert.equal(daysBetween('2026-10-06', k), n);
    assert.equal(addDays(k, -n), '2026-10-06');
  }
});

test(`[${TZ}] msUntilNextDay / nextDayTimestamp hit the next local midnight`, () => {
  // Sample every 3h17m over ~14 months, which crosses all the DST switches.
  const start = new Date(2026, 8, 1, 0, 7).getTime();
  const end = start + 430 * 24 * HOUR;
  for (let t = start; t < end; t += 3 * HOUR + 17 * 60000) {
    const now = new Date(t);
    const ms = msUntilNextDay(now);
    assert.ok(ms > 0, `${now} -> ${ms}`);
    assert.ok(ms <= 25 * HOUR, `${now} -> ${ms}`);
    const next = new Date(t + ms);
    assert.equal(next.getTime(), nextDayTimestamp(now));
    assert.equal(next.getHours(), 0, next.toString());
    assert.equal(next.getMinutes(), 0);
    assert.equal(next.getSeconds(), 0);
    assert.equal(dateKeyFor(next), addDays(dateKeyFor(now), 1), `${now} -> ${next}`);
    // One ms before midnight is still today.
    assert.equal(dateKeyFor(new Date(t + ms - 1)), dateKeyFor(now));
  }
});

test(`[${TZ}] msUntilNextDay edge cases`, () => {
  const midnight = new Date(2026, 9, 7, 0, 0, 0, 0);
  assert.equal(msUntilNextDay(new Date(midnight.getTime() - 1)), 1);
  const atMidnight = msUntilNextDay(midnight);
  assert.ok(atMidnight >= 23 * HOUR && atMidnight <= 25 * HOUR);
  assert.ok(msUntilNextDay() > 0);
  assert.ok(msUntilNextDay(Date.now()) > 0); // epoch ms accepted
  assert.ok(nextDayTimestamp() > Date.now());
});

test('parseDebugDate', () => {
  assert.equal(parseDebugDate('?date=2026-10-10'), '2026-10-10');
  assert.equal(parseDebugDate('?debug=1&date=2027-01-31'), '2027-01-31');
  assert.equal(parseDebugDate('date=2026-10-10'), '2026-10-10');
  assert.equal(parseDebugDate('?date=2028-02-29'), '2028-02-29');
  assert.equal(parseDebugDate('?date=2027-02-29'), null);
  assert.equal(parseDebugDate('?date=2026-13-01'), null);
  assert.equal(parseDebugDate('?date=2026-1-1'), null);
  assert.equal(parseDebugDate('?date=gister'), null);
  assert.equal(parseDebugDate('?date='), null);
  assert.equal(parseDebugDate('?debug=1'), null);
  assert.equal(parseDebugDate(''), null);
  assert.equal(parseDebugDate(undefined), null);
  assert.equal(parseDebugDate(null), null);
});

test('isDateKey', () => {
  assert.equal(isDateKey('2026-10-06'), true);
  assert.equal(isDateKey('2026-02-29'), false);
  assert.equal(isDateKey('2026-10-6'), false);
  assert.equal(isDateKey(20261006), false);
  assert.equal(isDateKey(null), false);
});
