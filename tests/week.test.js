// Die weekkis (js/core/week.js) and its place in the store: a box for every day the Daily Tower is
// played, bigger through the week; a missed day starts over unless a Reeksskild covers it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEK, cleanWeek, openBox, weekView, addShield } from '../js/core/week.js';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { addDays } from '../js/core/daily.js';
import { cosmetic, buyCosmetic, cleanEconomy } from '../js/core/economy.js';

const D0 = '2026-10-12';
const day = (n) => addDays(D0, n);

test('seven days in a row: the boxes grow, day 7 is the big chest (a Reeksskild, the first time a look)', () => {
  let w = cleanWeek(null);
  const boxes = [];
  for (let n = 0; n < 7; n++) {
    const r = openBox(w, day(n));
    w = r.week;
    boxes.push(r.box);
  }
  assert.deepEqual(boxes.map((b) => b.day), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(boxes.map((b) => b.coins), [...WEEK.coins]);
  assert.ok(boxes.slice(0, 6).every((b) => !b.shield && !b.look));
  assert.equal(boxes[6].shield, 1);
  assert.deepEqual(boxes[6].look, WEEK.look);
  assert.equal(w.weeks, 1);
  assert.equal(w.shields, 1);
  // the next week starts again at day 1; its chest has no look (the title was the first week's)
  for (let n = 7; n < 14; n++) w = openBox(w, day(n)).week;
  assert.equal(w.day, 7);
  assert.equal(w.weeks, 2);
  assert.equal(openBox({ ...w, day: 6, weeks: 1 }, day(15)).box.look, null);
});

test('one box a day: the same day (or an older one) opens nothing', () => {
  const w = openBox(null, day(0)).week;
  assert.equal(openBox(w, day(0)), null);
  assert.equal(openBox(w, day(-1)), null);
  assert.equal(openBox(w, 'nope'), null);
});

test('a missed day starts the week over, unless Reeksskilde cover every missed day', () => {
  let w = cleanWeek({ day: 3, last: day(0), shields: 0, weeks: 0 });
  let r = openBox(w, day(2));   // missed one day, no shield
  assert.equal(r.box.day, 1);
  assert.equal(r.box.restarted, true);
  w = cleanWeek({ day: 3, last: day(0), shields: 1, weeks: 0 });
  r = openBox(w, day(2));   // one shield covers one missed day
  assert.equal(r.box.day, 4);
  assert.equal(r.box.saved, 1);
  assert.equal(r.week.shields, 0);
  r = openBox(cleanWeek({ day: 3, last: day(0), shields: 1, weeks: 0 }), day(3));   // two missed, one shield
  assert.equal(r.box.day, 1);
  assert.equal(r.week.shields, 1, 'a shield that could not save the week is kept');
  r = openBox(cleanWeek({ day: 6, last: day(0), shields: 2, weeks: 0 }), day(3));
  assert.equal(r.box.day, 7);
  assert.equal(r.box.saved, 2);
  assert.equal(r.week.shields, 1, 'both used, and the chest brings one back');
});

test('the menu view: today\'s box before playing, tomorrow\'s after', () => {
  assert.deepEqual(weekView(null, day(0)), { day: 1, coins: WEEK.coins[0], opened: false, done: 0, next: null, shields: 0 });
  const w = openBox(openBox(null, day(0)).week, day(1)).week;
  const v = weekView(w, day(1));
  assert.equal(v.opened, true);
  assert.equal(v.done, 2);
  assert.deepEqual(v.next, { day: 3, coins: WEEK.coins[2] });
  const tomorrow = weekView(w, day(2));
  assert.equal(tomorrow.opened, false);
  assert.equal(tomorrow.day, 3);
  assert.equal(tomorrow.done, 2);
  assert.equal(weekView(w, day(4)).day, 1, 'after a missed day (no shield): a new week');
});

test('Reeksskilde: at most WEEK.shieldMax; junk in storage is cleaned', () => {
  let w = cleanWeek(null);
  for (let k = 0; k < WEEK.shieldMax; k++) w = addShield(w).week;
  assert.equal(addShield(w).ok, false);
  assert.deepEqual(cleanWeek({ day: 9, last: 'x', shields: -3, weeks: 'many' }), { day: 0, last: null, shields: 0, weeks: 0 });
});

test('the store: the box pays outside the day\'s cap, the first full week gives its title; shields cost coins', () => {
  const backend = memoryBackend();
  const store = createStore(backend);
  const r = store.openWeekBox(day(0));
  assert.equal(r.day, 1);
  assert.equal(store.getEconomy().coins, WEEK.coins[0]);
  assert.equal(store.openWeekBox(day(0)), null, 'once a day');
  for (let n = 1; n < 7; n++) store.openWeekBox(day(n));
  assert.ok(store.getEconomy().owned.title.includes('getrou'), 'the full week brings "Getroue Bouer"');
  assert.equal(createStore(backend).getWeek().weeks, 1, 'its own key, kept over a restart');
  assert.ok(backend.getItem('stapel.v1.week'));
  // the title is never for sale
  assert.equal(cosmetic('title', 'getrou').week, true);
  assert.equal(buyCosmetic(cleanEconomy({ coins: 9999 }), 'title', 'getrou').ok, false);
  // a Reeksskild: WEEK.shieldPrice coins, at most WEEK.shieldMax held (the chest gave one already)
  const before = store.getEconomy().coins;
  const b = store.buyWeekShield();
  assert.equal(b.ok, true);
  assert.equal(store.getEconomy().coins, before - WEEK.shieldPrice);
  assert.equal(store.buyWeekShield().ok, false, 'two held');
  const poor = createStore(memoryBackend());
  assert.equal(poor.buyWeekShield().ok, false, 'no coins, no shield');
});
