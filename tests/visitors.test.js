// Visitors (besoekers): the seeded schedule, each visit's seeded plan, and the rules for what a
// visitor may do to a tower (js/core/visitorplan.js, js/core/visitorrules.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSequence } from '../js/core/sequence.js';
import {
  buildVisitors, visitorAt, visitorForecast, visitRng, monkeyPlan, clownPlan, thiefPlan, VISITOR_RULES,
} from '../js/core/visitorplan.js';
import {
  movable, topMovable, thiefLoot, visitorFree, gridWithGifts, cleanVisits, visitorEmoji, visitorResultLine,
} from '../js/core/visitorrules.js';
import { createRng } from '../js/core/rng.js';
import { seedFor, addDays } from '../js/core/daily.js';
import { VISITOR, VISITOR_TYPES, SHAPE_IDS, PALETTE, RATING } from '../js/config.js';
import { S } from '../js/core/strings.js';
import { SOUND_NAMES } from '../js/audio.js';

const DAYS = Array.from({ length: 365 }, (_, k) => seedFor(addDays('2026-10-06', k)));
const PRACTICE = Array.from({ length: 60 }, (_, k) => `oefen/oefen-test-${k}`);

// ---------------------------------------------------------------------------------- schedule
test('same seed => same visitors, whatever else was asked first; different days differ', () => {
  const a = createSequence('stapel-2026-10-06');
  const b = createSequence('stapel-2026-10-06');
  b.block(250);            // touching the blocks...
  b.eventAt(40);           // ...and the weather first changes nothing
  assert.deepEqual(a.visitors, b.visitors);
  assert.deepEqual(a.visitors, createSequence('stapel-2026-10-06').visitors);
  assert.notDeepEqual(a.visitors, createSequence('stapel-2026-10-07').visitors);
  const openings = new Set(DAYS.map((s) => JSON.stringify(createSequence(s).visitors.slice(0, 3))));
  assert.ok(openings.size > DAYS.length * 0.9, `variety ${openings.size}`);
});

test('the visitors have their own fork: blocks and weather of every day are unchanged', () => {
  // buildVisitors draws from root.fork('visitors') only, so the block and weather streams are the
  // same as before visitors existed (tests/sequence.test.js keeps the golden daily #1).
  for (const seed of DAYS.slice(0, 40)) {
    const seq = createSequence(seed);
    const root = createRng(seed);
    assert.deepEqual(seq.visitors, buildVisitors(root.fork('visitors'), seq.events), seed);
  }
});

test('golden: the visitors of daily #1 (changing this changes every player\'s tower!)', () => {
  assert.deepEqual(createSequence('stapel-2026-10-06').visitors.slice(0, 4), GOLDEN_VISITORS);
});

test('schedule rules: from block 8, apart, never with a weather start, no repeats, one thief', () => {
  const { HORIZON, FIRST_AT, FIRST_SPREAD, GAP, THIEF_FROM } = VISITOR_RULES;
  const gaps = [];
  const types = Object.fromEntries(VISITOR_TYPES.map((t) => [t, 0]));
  for (const seed of [...DAYS, ...PRACTICE]) {
    const { visitors, events } = createSequence(seed);
    const starts = new Set(events.map((e) => e.start));
    assert.ok(visitors.length >= 10, `${seed}: only ${visitors.length}`);
    assert.ok(visitors[0].at >= FIRST_AT && visitors[0].at <= FIRST_AT + FIRST_SPREAD + 2, `${seed}: first at ${visitors[0].at}`);
    let thieves = 0;
    visitors.forEach((v, k) => {
      assert.deepEqual(Object.keys(v).sort(), ['at', 'side', 'strength', 'type']);
      assert.ok(VISITOR_TYPES.includes(v.type), v.type);
      assert.ok(Number.isInteger(v.at) && v.at >= FIRST_AT && v.at < HORIZON, `${seed}: at ${v.at}`);
      assert.ok(!starts.has(v.at), `${seed}: visitor on the block where weather starts (${v.at})`);
      assert.ok(v.side === -1 || v.side === 1);
      assert.ok(v.strength >= 0.6 && v.strength <= 1.1, `strength ${v.strength}`);
      types[v.type]++;
      if (v.type === 'thief') {
        thieves++;
        assert.ok(v.at >= THIEF_FROM, `${seed}: thief at ${v.at}`);
      }
      if (k > 0) {
        const p = visitors[k - 1];
        const gap = v.at - p.at;
        gaps.push(gap);
        // only one visitor at a time: they are blocks apart (a visit lasts a few seconds)
        assert.ok(gap >= GAP[0], `${seed}: gap ${gap}`);
        assert.notEqual(v.type, p.type, `${seed}: ${v.type} twice in a row`);
      }
    });
    assert.ok(thieves <= 1, `${seed}: ${thieves} thieves`);
  }
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  assert.ok(mean >= 12 && mean <= 18, `about one visitor every 12-18 blocks (mean gap ${mean})`);
  for (const t of VISITOR_TYPES) assert.ok(types[t] > 200, `${t} too rare (${types[t]})`);
});

test('a typical tower (45 blocks) meets 2-3 visitors; most days bring the thief', () => {
  let n = 0;
  let thief = 0;
  for (const seed of DAYS) {
    const early = createSequence(seed).visitors.filter((v) => v.at < 45);
    n += early.length;
    if (early.some((v) => v.type === 'thief')) thief++;
  }
  assert.ok(n / DAYS.length > 2 && n / DAYS.length < 3.5, `per tower ${n / DAYS.length}`);
  assert.ok(thief / DAYS.length > 0.4, `thief days ${thief / DAYS.length}`);
});

test('visitorAt and visitorForecast', () => {
  for (const seed of DAYS.slice(0, 30)) {
    const seq = createSequence(seed);
    for (let i = -1; i < 320; i++) {
      assert.equal(seq.visitorAt(i), seq.visitors.find((v) => v.at === i) || null, `${seed} i=${i}`);
    }
    const f = seq.visitorForecast();
    const want = [];
    for (const v of seq.visitors) if (v.at < VISITOR_RULES.FORECAST_BLOCKS && !want.includes(v.type)) want.push(v.type);
    assert.deepEqual(f, want);
    assert.deepEqual(visitorForecast(seq.visitors, 0), []);
    assert.ok(f.length >= 1, `${seed}: a forecast without visitors`);
  }
  assert.equal(visitorAt([], 5), null);
});

// ---------------------------------------------------------------------------------- per-visit plans
test('each visit draws from its own stream: same values for everyone, independent of order', () => {
  const v = { type: 'monkey', at: 21, side: -1, strength: 0.9 };
  const a = monkeyPlan(visitRng('stapel-2026-10-12', v), v);
  createRng('stapel-2026-10-12').fork('visitor-fx').next();   // other draws change nothing
  assert.deepEqual(monkeyPlan(visitRng('stapel-2026-10-12', v), v), a);
  assert.notDeepEqual(monkeyPlan(visitRng('stapel-2026-10-13', v), v), a);
  const c = { type: 'clown', at: 21, side: 1, strength: 0.9 };
  assert.deepEqual(clownPlan(visitRng('x', c), c), clownPlan(visitRng('x', c), c));
});

test('plan ranges: a 1-2 block shove, a crooked steady gift, a ~2 s climb', () => {
  let twos = 0;
  for (const seed of DAYS.slice(0, 120)) {
    for (const v of createSequence(seed).visitors.slice(0, 6)) {
      const r = visitRng(seed, v);
      if (v.type === 'monkey') {
        const p = monkeyPlan(r, v);
        assert.ok(p.count === 1 || p.count === 2);
        if (p.count === 2) twos++;
        assert.ok(p.kick >= VISITOR.monkeyKick[0] * 0.6 - 1e-9 && p.kick <= VISITOR.monkeyKick[1] * 1.1 + 1e-9, `kick ${p.kick}`);
        assert.ok(p.spin > 0 && p.spin <= VISITOR.monkeySpin);
      } else if (v.type === 'clown') {
        const p = clownPlan(r, v);
        assert.ok(VISITOR_RULES.GIFT_SHAPES.includes(p.spec.shape) && SHAPE_IDS.includes(p.spec.shape));
        assert.ok(p.spec.scale >= 0.85 && p.spec.scale <= 0.95);
        assert.ok(Number.isInteger(p.spec.color) && p.spec.color >= 0 && p.spec.color < PALETTE.length);
        const off = Math.abs(p.dx);
        assert.ok(off >= VISITOR.giftOffsetPx[0] - 0.01 && off <= VISITOR.giftOffsetPx[1] + 0.01, `dx ${p.dx}`);
        assert.equal(Math.sign(p.dx), -v.side, 'the gift lands a little past the middle, away from the clown');
        const tilt = Math.abs(p.tilt);
        assert.ok(tilt >= VISITOR.giftTilt[0] - 0.001 && tilt <= VISITOR.giftTilt[1] + 0.001, `tilt ${p.tilt}`);
      } else {
        const p = thiefPlan(r, v);
        assert.ok(p.climbMs >= 1700 && p.climbMs <= 2300, `climb ${p.climbMs}`);
      }
    }
  }
  assert.ok(twos > 10, 'the monkey sometimes shoves two blocks');
});

// ---------------------------------------------------------------------------------- tower rules
const blk = (top, state = 'settled', extra = {}) => ({ top, state, destroyed: false, ...extra });

test('the thief takes at most 4 of the top blocks that can move, never cement', () => {
  const tower = [
    blk(-40, 'frozen'), blk(-80, 'frozen'), blk(-120, 'frozen'),
    blk(-160), blk(-200, 'landed'), blk(-240), blk(-280), blk(-320, 'landed'), blk(-360),
  ];
  const loot = thiefLoot(tower);
  assert.equal(loot.length, 4);
  assert.deepEqual(loot.map((b) => b.top), [-360, -320, -280, -240], 'the topmost four, highest first');
  assert.ok(loot.every((b) => b.state !== 'frozen'));
  // never more than 4, even if asked
  assert.equal(thiefLoot(tower, 9).length, VISITOR.thiefMax);
  assert.equal(VISITOR.thiefMax, 4);
  // a tower that is mostly cement: only what can move
  const cement = [blk(-40, 'frozen'), blk(-80, 'frozen'), blk(-120), blk(-160, 'frozen')];
  assert.deepEqual(thiefLoot(cement).map((b) => b.top), [-120]);
  // all cement, or nothing: he leaves empty-handed
  assert.deepEqual(thiefLoot([blk(-40, 'frozen')]), []);
  assert.deepEqual(thiefLoot([]), []);
  // a block in the air, one already lost or gone is never taken
  const odd = [blk(-400, 'falling'), blk(-380, 'lost'), blk(-360, 'settled', { destroyed: true }), blk(-100)];
  assert.deepEqual(thiefLoot(odd).map((b) => b.top), [-100]);
  // the clown's gift is a tower block like any other
  assert.equal(thiefLoot([blk(-50), blk(-90, 'landed', { gift: true })])[0].gift, true);
});

test('the monkey shoves only the top 1-2 blocks that can move', () => {
  const tower = [blk(-40, 'frozen'), blk(-80), blk(-120, 'landed'), blk(-160)];
  assert.deepEqual(topMovable(tower, 1).map((b) => b.top), [-160]);
  assert.deepEqual(topMovable(tower, 2).map((b) => b.top), [-160, -120]);
  assert.deepEqual(topMovable([blk(-40, 'frozen')], 2), []);
  assert.equal(movable(blk(0, 'frozen')), false);
  assert.equal(movable(null), false);
});

test('no hearts lost to visitors: who gets the blame for a block in the sea', () => {
  const now = 10000;
  const grace = { now, graceUntil: now + 500 };
  // a tower block knocked off while the push is still settling: the visitor's
  assert.equal(visitorFree(blk(-100), { ...grace, wasFalling: false }), true);
  // ...and right at the end of the grace window it is the player's again
  assert.equal(visitorFree(blk(-100), { now: now + 500, graceUntil: now + 500, wasFalling: false }), false);
  assert.equal(visitorFree(blk(-100), { now, wasFalling: false }), false, 'no visitor, no excuse');
  // the clown's gift never costs a heart, whenever it falls
  assert.equal(visitorFree(blk(-100, 'landed', { gift: true }), { now, wasFalling: false }), true);
  // a block that was in the air when the visitor changed the tower under it
  assert.equal(visitorFree(blk(-100, 'falling', { shielded: true }), { ...grace, wasFalling: true }), true);
  // a block dropped after the push is aimed at the tower as it is now: the player's
  assert.equal(visitorFree(blk(-100, 'falling'), { ...grace, wasFalling: true }), false);
  assert.equal(visitorFree(null, grace), false);
});

test('the clown\'s gift joins the grid where it joined the tower; blocks keep their own cells', () => {
  // gifts = how many blocks had been dropped when each gift arrived
  assert.equal(gridWithGifts(['P', 'G', 'S'], [2]), 'PGBS');
  assert.equal(gridWithGifts(['P', 'G', 'S'], [0]), 'BPGS');
  assert.equal(gridWithGifts(['P', 'G', 'S'], [3]), 'PGSB', 'a gift after the last drop goes at the end');
  assert.equal(gridWithGifts(['P', 'G', 'S'], [7]), 'PGSB');
  assert.equal(gridWithGifts(['P', null, 'S'], [1, 2]), 'PBBS', 'a block still in the air is left out, gifts stay');
  assert.equal(gridWithGifts(['P', 'G'], [2, 1]), 'PBGB', 'in order of arrival');
  assert.equal(gridWithGifts([], [0]), 'B');
  assert.equal(gridWithGifts(['P', 'X'], []), 'PX');
  assert.equal(RATING.GIFT, 'B');
});

// ---------------------------------------------------------------------------------- records, share, results
test('visit records are cleaned; the share emoji follow the order of arrival', () => {
  assert.deepEqual(cleanVisits([{ type: 'monkey', outcome: 'shoved', n: -3 }, { type: 'x' }]), [{ type: 'monkey', outcome: 'shoved', n: 0 }]);
  assert.equal(cleanVisits(Array.from({ length: 99 }, () => ({ type: 'clown', outcome: 'gift' }))).length, 40);
  assert.equal(visitorEmoji([{ type: 'clown', outcome: 'gift' }, { type: 'thief', outcome: 'caught' }, { type: 'monkey', outcome: 'came' }]), '🤡🦹✋🐒');
  assert.equal(visitorEmoji([{ type: 'thief', outcome: 'stole', n: 3 }]), '🦹');
  assert.equal(visitorEmoji(undefined), '');
});

test('results line: the most memorable visit (thief, then monkey, then clown)', () => {
  const line = (...v) => visitorResultLine(v);
  assert.equal(line({ type: 'clown', outcome: 'gift' }, { type: 'thief', outcome: 'caught' }), 'Jy het Skelm Sakkie gevang! 👮');
  assert.equal(line({ type: 'thief', outcome: 'stole', n: 4 }), 'Skelm Sakkie het 4 blokke gesteel 🦹');
  assert.equal(line({ type: 'thief', outcome: 'stole', n: 1 }), 'Skelm Sakkie het 1 blok gesteel 🦹');
  assert.equal(line({ type: 'thief', outcome: 'stole', n: 0 }), S.resThiefEmpty);
  assert.equal(line({ type: 'monkey', outcome: 'shoved', n: 1 }, { type: 'monkey', outcome: 'shoved', n: 1 }), S.resMonkeyKnocked(2));
  assert.equal(line({ type: 'monkey', outcome: 'shoved', n: 0 }), S.resMonkeyStood);
  assert.equal(line({ type: 'monkey', outcome: 'shooed' }, { type: 'clown', outcome: 'gift' }), S.resMonkeyShooed);
  assert.equal(line({ type: 'clown', outcome: 'gift' }), S.resClownGift);
  assert.equal(line({ type: 'thief', outcome: 'came' }, { type: 'clown', outcome: 'came' }), '', 'nothing happened yet');
  assert.equal(visitorResultLine([]), '');
});

test('every visitor has its sounds', () => {
  for (const n of ['monkey', 'shoo', 'clown', 'thief', 'escape', 'caught']) assert.ok(SOUND_NAMES.includes(n), n);
});

// Golden snapshot of Daaglikse Toring #1's first visitors (seed 'stapel-2026-10-06'), added in 1.6.0.
const GOLDEN_VISITORS = [
  { type: 'clown', at: 13, side: -1, strength: 0.92 },
  { type: 'monkey', at: 29, side: 1, strength: 1.05 },
  { type: 'clown', at: 49, side: -1, strength: 0.93 },
  { type: 'monkey', at: 63, side: 1, strength: 0.98 },
];
