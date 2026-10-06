// admin.html: date ranges and the Afrikaans monthly report for sponsors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildMonthlyReport, lastDaysRange, monthRange, periodLabel, previousMonthRange, thisMonthRange,
} from '../js/pages/statsReport.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('month ranges, including leap years and the turn of the year', () => {
  assert.deepEqual(monthRange(2026, 10), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(monthRange(2028, 2), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(monthRange(2027, 2), { from: '2027-02-01', to: '2027-02-28' });
  assert.deepEqual(previousMonthRange('2027-01-15'), { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(previousMonthRange('2026-03-31'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(thisMonthRange('2026-10-17'), { from: '2026-10-01', to: '2026-10-17' });
  assert.deepEqual(lastDaysRange('2026-10-06', 30), { from: '2026-09-07', to: '2026-10-06' });
  assert.deepEqual(lastDaysRange('2026-10-06', 1), { from: '2026-10-06', to: '2026-10-06' });
});

test('period label: a whole month by name, anything else as dates', () => {
  assert.equal(periodLabel('2026-10-01', '2026-10-31'), 'Oktober 2026');
  assert.equal(periodLabel('2028-02-01', '2028-02-29'), 'Februarie 2028');
  assert.equal(periodLabel('2026-10-01', '2026-10-30'), '1 Oktober 2026 tot 30 Oktober 2026');
  assert.equal(periodLabel('2026-10-06', '2026-10-06'), '6 Oktober 2026');
  assert.equal(periodLabel('nope', '2026-10-06'), '');
});

const BLOCK = { name: 'Bakkery Bos', tier: 'block', from: '2026-10-01', to: '2026-10-31', games: 1234, blockShows: 4567, billboardGames: 0, billboardDays: 0 };

test('report for a block sponsor: greeting, games, name shown, honest footnote', () => {
  const text = buildMonthlyReport(BLOCK);
  assert.match(text, /^Hallo Bakkery Bos,\n\nDankie dat jy Stapel ondersteun! Hier is jou verslag vir Oktober 2026:\n\n/);
  assert.match(text, /• Stapel is 1 234 keer gespeel\./, 'numbers use the non-breaking space from format.js');
  assert.match(text, /• Jou naam het 4 567 keer op ’n blok gestaan wat ’n speler laat val het\./);
  assert.doesNotMatch(text, /advertensie/i, 'no billboard line for a block sponsor');
  assert.match(text, /anoniem getel/);
  assert.match(text, /klaargespeel is, tel/);
  assert.match(text, /\nGroete\nStapel — Stapel hoog\. Staan sterk\.$/);
});

test('report for a billboard sponsor: days and games on the island, singular forms', () => {
  const premium = { name: ' Kaap Motors ', tier: 'premium', from: '2026-10-01', to: '2026-10-31', games: 900, blockShows: 0, billboardGames: 850, billboardDays: 29 };
  const text = buildMonthlyReport(premium);
  assert.match(text, /^Hallo Kaap Motors,/);
  assert.match(text, /• Jou advertensie het op 29 dae op die eiland langs die toring gestaan en was in 850 speletjies te sien\./);
  assert.doesNotMatch(text, /Jou naam/, 'a billboard sponsor has no names on blocks to report');
  const one = buildMonthlyReport({ ...premium, billboardGames: 1, billboardDays: 1 });
  assert.match(one, /op 1 dag op die eiland .* in 1 speletjie te sien/);
});

test('report for quiet months and empty names never says anything wrong', () => {
  assert.match(buildMonthlyReport({ ...BLOCK, games: 0, blockShows: 0 }), /nog geen speletjies getel nie/);
  assert.match(buildMonthlyReport({ ...BLOCK, blockShows: 0 }), /Jou naam is in hierdie tydperk nie op ’n blok gewys nie\./);
  assert.match(buildMonthlyReport({ ...BLOCK, tier: 'premium', blockShows: 0, billboardGames: 0 }), /advertensiebord is in hierdie tydperk nie in speletjies gewys nie/);
  assert.match(buildMonthlyReport({ ...BLOCK, name: '' }), /^Hallo daar,/);
  const junk = buildMonthlyReport({ name: 'X', tier: 'block', from: '2026-10-01', to: '2026-10-31', games: -5, blockShows: Number.NaN, billboardGames: undefined, billboardDays: 'x' });
  assert.doesNotMatch(junk, /NaN|undefined|-5/);
  assert.match(buildMonthlyReport({ ...BLOCK, games: 1, blockShows: 1 }), /Stapel is 1 keer gespeel\.\n• Jou naam het 1 keer op/);
});

test('admin.html has the Statistiek tab and the page wires the report button', () => {
  const html = read('admin.html');
  assert.match(html, /id="t-stats"[^>]*>Statistiek</);
  assert.match(html, /id="p-stats"/);
  assert.match(html, /id="s-from"[\s\S]*id="s-to"/);
  const js = read('js/pages/admin.js');
  assert.match(js, /Kopieer maandverslag/);
  assert.match(js, /admin\/stats/);
  const tabs = [...html.matchAll(/id="t-(\w+)" aria-controls/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ['sponsors', 'add', 'payments', 'stats', 'events']);
  assert.match(js, /const TABS = \['sponsors', 'add', 'payments', 'stats', 'events'\]/);
});

test('the legal and sales pages describe the anonymous counts honestly', () => {
  const privacy = read('privaatheid.html');
  assert.match(privacy, /Anonieme tellings/);
  assert.match(privacy, /13 maande/);
  assert.match(privacy, /IP-adres/);
  assert.match(privacy, /minstens 10 mense/);
  assert.doesNotMatch(privacy, /Ons gebruik geen ontleding- of opsporingsdienste, geen/, 'the old blanket claim is gone');
  const sales = read('adverteer.html');
  assert.match(sales, /Elke maand ’n verslag van hoe dikwels jou naam gewys is/);
  assert.match(sales, /Hoe weet ek hoeveel mense my naam gesien het\?/);
  assert.match(sales, /ongeveer elke tweede of derde blok/);
});
