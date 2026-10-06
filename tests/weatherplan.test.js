// The random parts of the weather (gust strength, lightning, hail) come from seeded
// per-event streams: the same daily plays out the same for every player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventRng, gustMul, strikePlan, hailPlan, GUST_MUL } from '../js/core/weatherplan.js';
import { createSequence } from '../js/core/sequence.js';
import { seedFor, addDays } from '../js/core/daily.js';

const DAILY1 = createSequence(seedFor('2026-10-06'));
const GUST = DAILY1.events.find((e) => e.type === 'gust');
const STORM = DAILY1.events.find((e) => e.type === 'storm');

test('golden: daily #1 gust strengths and first lightning strike (changing this changes every tower)', () => {
  assert.deepEqual({ type: GUST.type, start: GUST.start }, { type: 'gust', start: 17 });
  const r = eventRng(DAILY1.seed, GUST);
  assert.deepEqual([1, 2, 3, 4].map((n) => Number(gustMul(r, n).toFixed(6))), [0.856259, 0.908142, 0.903805, 1.038077]);
  const s = strikePlan(eventRng(DAILY1.seed, STORM), 1);
  assert.equal(Number(s.kick.toFixed(6)), 1.999841);
  assert.equal(s.spin, -1);
});

test('values do not depend on call order or on other draws', () => {
  const a = eventRng(DAILY1.seed, GUST);
  const b = eventRng(DAILY1.seed, GUST);
  const late = gustMul(a, 9);
  for (let n = 1; n <= 8; n++) gustMul(b, n);
  hailPlan(b, GUST);
  strikePlan(b, 1);
  assert.equal(gustMul(b, 9), late);
  assert.deepEqual(hailPlan(eventRng(DAILY1.seed, GUST), GUST), hailPlan(eventRng(DAILY1.seed, GUST), GUST));
});

test('ranges, and every day/event gets its own values', () => {
  const seen = new Set();
  for (let d = 0; d < 60; d++) {
    const seq = createSequence(seedFor(addDays('2026-10-06', d)));
    for (const ev of seq.events.slice(0, 8)) {
      const r = eventRng(seq.seed, ev);
      for (let n = 1; n <= 12; n++) {
        const m = gustMul(r, n);
        assert.ok(m >= GUST_MUL[0] && m < GUST_MUL[1], `mul ${m}`);
      }
      const k = strikePlan(r, 1, [1.5, 2.5]);
      assert.ok(k.kick >= 1.5 && k.kick < 2.5);
      assert.ok(k.spin === 1 || k.spin === -1);
      seen.add(gustMul(r, 1));
    }
  }
  assert.ok(seen.size > 400, `variety ${seen.size}`);
});

test('hail plan: count follows strength, latest first, stones in bounds', () => {
  const ev = { type: 'hail', start: 20, end: 24, dir: 1, strength: 1.3 };
  const plan = hailPlan(eventRng('x', ev), ev, { count: 10, from: 500, to: 5000, width: 720, radius: [8, 10] });
  assert.equal(plan.length, 13);
  for (let k = 1; k < plan.length; k++) assert.ok(plan[k - 1].at >= plan[k].at);
  for (const s of plan) {
    assert.ok(s.at >= 500 && s.at <= 5000);
    assert.ok(s.x >= 30 && s.x <= 690);
    assert.ok(s.r >= 8 && s.r < 10);
    assert.ok(s.vy >= 5 && s.vy < 7);
  }
});
