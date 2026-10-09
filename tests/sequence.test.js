import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSequence, SEQUENCE_RULES } from '../js/core/sequence.js';
import { SHAPE_IDS, PALETTE, WEATHER_TYPES, STAGES, stageAt } from '../js/config.js';
import { seedFor, addDays } from '../js/core/daily.js';

const SEEDS = Array.from({ length: 300 }, (_, k) => seedFor(addDays('2026-10-06', k)));
const EASY = ['plank', 'slab', 'brick', 'crate'];
const WIDE_MID = ['wedge', 'arch'];          // from block 4
const NARROW = ['cube', 'pillar'];           // from block 12
const LATE = ['L', 'J', 'T'];                // from block 20
const MID = [...WIDE_MID, ...NARROW];
const AWKWARD = [...MID, ...LATE];

const blocks = (seq, n) => Array.from({ length: n }, (_, i) => seq.block(i));

test('same seed => identical blocks regardless of call order', () => {
  const N = 150;
  const inOrder = blocks(createSequence('stapel-2026-10-06'), N);

  const rev = createSequence('stapel-2026-10-06');
  const reversed = [];
  for (let i = N - 1; i >= 0; i--) reversed[i] = rev.block(i);
  assert.deepEqual(reversed, inOrder);

  const rnd = createSequence('stapel-2026-10-06');
  const order = [77, 3, 149, 0, 12, 12, 140, 1, 99];
  for (const i of order) assert.deepEqual(rnd.block(i), inOrder[i]);

  // Repeated access returns equal values; mutating a returned spec can't corrupt the sequence.
  const s = createSequence('stapel-2026-10-06');
  const b5 = s.block(5);
  b5.shape = 'hacked';
  b5.color = -1;
  assert.deepEqual(s.block(5), inOrder[5]);
});

test('same seed => identical events; different seeds differ', () => {
  const a = createSequence('stapel-2026-10-06');
  const b = createSequence('stapel-2026-10-06');
  b.block(200); // touching blocks first must not affect weather
  assert.deepEqual(a.events, b.events);
  assert.equal(a.seed, 'stapel-2026-10-06');

  const c = createSequence('stapel-2026-10-07');
  assert.notDeepEqual(blocks(a, 30), blocks(c, 30));
  assert.notDeepEqual(a.events, c.events);

  // Across many days, nearly every day gets a distinct opening and forecast.
  const openings = new Set(SEEDS.map((s) => JSON.stringify(blocks(createSequence(s), 12))));
  const forecasts = new Set(SEEDS.map((s) => createSequence(s).forecast(5).join(',')));
  assert.equal(openings.size, SEEDS.length);
  assert.ok(forecasts.size > SEEDS.length * 0.6, `forecast variety ${forecasts.size}`);
});

test('golden daily #1 (changing this changes every player\'s tower!)', () => {
  const s = createSequence('stapel-2026-10-06');
  const golden = blocks(s, 12).map((b) => `${b.shape}:${b.scale}:${b.color}`).join(' ');
  assert.equal(golden, GOLDEN_BLOCKS);
  assert.deepEqual(s.events.slice(0, 4), GOLDEN_EVENTS);
});

test('block rules: shapes allowed by index, plank start, no triple shapes, no double colours', () => {
  for (const seed of SEEDS) {
    const seq = createSequence(seed);
    const bs = blocks(seq, 120);
    assert.deepEqual(bs[0], { i: 0, shape: 'plank', scale: 1, color: bs[0].color });
    bs.forEach((b, i) => {
      assert.equal(b.i, i);
      assert.ok(SHAPE_IDS.includes(b.shape), b.shape);
      assert.ok(Number.isInteger(b.color) && b.color >= 0 && b.color < PALETTE.length, `${b.color}`);
      if (i >= 1 && i <= 3) assert.ok(EASY.includes(b.shape), `${seed} i=${i} ${b.shape}`);
      if (i <= 11) assert.ok(!NARROW.includes(b.shape), `${seed} i=${i} ${b.shape}`);
      if (i <= 19) assert.ok(!LATE.includes(b.shape), `${seed} i=${i} ${b.shape}`);
      if (i >= 2) {
        assert.ok(!(bs[i - 1].shape === b.shape && bs[i - 2].shape === b.shape), `${seed} triple ${b.shape} at ${i}`);
      }
      if (i >= 1) assert.notEqual(bs[i - 1].color, b.color, `${seed} colour repeat at ${i}`);
    });
  }
});

test('block scale: 1 at i=0, 0.95-1.12 early, never outside 0.8-1.12, shrinking later', () => {
  let earlySum = 0;
  let earlyN = 0;
  let lateSum = 0;
  let lateN = 0;
  for (const seed of SEEDS) {
    const bs = blocks(createSequence(seed), 100);
    assert.equal(bs[0].scale, 1);
    for (const b of bs) {
      assert.ok(b.scale >= 0.8 && b.scale <= 1.12, `${seed} i=${b.i} scale ${b.scale}`);
      assert.equal(Math.round(b.scale * 100) / 100, b.scale); // 2 decimals
      if (b.i >= 1 && b.i <= 3) {
        assert.ok(b.scale >= 0.93 && b.scale <= 1.12, `early scale ${b.scale}`);
        earlySum += b.scale;
        earlyN++;
      }
      if (b.i >= 40) {
        assert.ok(b.scale <= 1.0, `late scale ${b.scale}`);
        lateSum += b.scale;
        lateN++;
      }
    }
  }
  assert.ok(earlySum / earlyN > 1.0, `early mean ${earlySum / earlyN}`);
  assert.ok(lateSum / lateN < 0.92, `late mean ${lateSum / lateN}`);
  assert.equal(SEQUENCE_RULES.SCALE_MIN, 0.8);
  assert.equal(SEQUENCE_RULES.SCALE_MAX, 1.12);
});

test('shape distribution: every shape shows up; awkward shapes grow more common later', () => {
  const freq = (from, to) => {
    const c = Object.fromEntries(SHAPE_IDS.map((id) => [id, 0]));
    let n = 0;
    for (const seed of SEEDS) {
      const seq = createSequence(seed);
      for (let i = from; i <= to; i++) {
        c[seq.block(i).shape]++;
        n++;
      }
    }
    return { c, n };
  };
  const early = freq(4, 11);
  const mid = freq(12, 19);
  const late = freq(50, 90);
  const share = ({ c, n }, ids) => ids.reduce((s, id) => s + c[id], 0) / n;
  for (const id of SHAPE_IDS) assert.ok(late.c[id] > 0, `${id} never appears late`);
  for (const id of [...EASY, ...WIDE_MID]) assert.ok(early.c[id] > 0, `${id} never appears early`);
  for (const id of NARROW) assert.ok(mid.c[id] > 0, `${id} never appears in blocks 12-19`);
  assert.ok(share(early, EASY) > 0.6, `early easy share ${share(early, EASY)}`);
  assert.ok(share(late, AWKWARD) > share(early, AWKWARD) + 0.2, 'awkward should ramp up');
  assert.ok(share(late, LATE) > 0.1, `L/J/T late share ${share(late, LATE)}`);
});

test('colours: all palette colours are used', () => {
  const seen = new Set();
  for (const seed of SEEDS.slice(0, 20)) for (const b of blocks(createSequence(seed), 40)) seen.add(b.color);
  assert.equal(seen.size, PALETTE.length);
});

test('weather rules', () => {
  const { WEATHER_HORIZON, EARLY_TYPES, LATE_TYPES } = SEQUENCE_RULES;
  let rains = 0;
  let rainbowsAfterRain = 0;
  const typeCount = Object.fromEntries(WEATHER_TYPES.map((t) => [t, 0]));
  for (const seed of SEEDS) {
    const { events } = createSequence(seed);
    assert.ok(events.length >= 25, `${seed} only ${events.length} events`);
    assert.equal(events[0].start, SEQUENCE_RULES.FIRST_EVENT_AT, 'the warm-up stage is calm');
    assert.ok(events[0].start > STAGES[1].from, 'the stage is announced before its first weather');
    assert.ok(events[events.length - 1].start < WEATHER_HORIZON);
    // Events cover the whole horizon: the last ends within a gap of 300.
    assert.ok(events[events.length - 1].end >= WEATHER_HORIZON - 5);

    events.forEach((e, k) => {
      typeCount[e.type]++;
      assert.deepEqual(Object.keys(e).sort(), ['dir', 'end', 'start', 'strength', 'type']);
      assert.ok(WEATHER_TYPES.includes(e.type), e.type);
      assert.ok(Number.isInteger(e.start) && Number.isInteger(e.end));
      assert.ok(e.dir === -1 || e.dir === 1, `dir ${e.dir}`);

      const dur = e.end - e.start;
      if (e.type === 'rainbow') assert.equal(dur, 3);
      else if (e.type === 'fog' || e.type === 'heat') assert.ok(dur >= 4 && dur <= 6, `${e.type} dur ${dur}`);
      else assert.ok(dur >= 3 && dur <= 5, `${e.type} dur ${dur}`);

      const base = 0.6 + Math.min(0.9, e.start * 0.02);
      assert.ok(Math.abs(e.strength - base) <= 0.1 + 0.005 + 1e-9, `strength ${e.strength} at ${e.start}`);
      assert.ok(e.strength >= 0.55 && e.strength <= 1.65);

      assert.ok(!STAGES.some((st) => st.from === e.start), `${seed}: weather on the block that announces a stage (${e.start})`);
      if (e.type !== 'rainbow') {
        if (STAGES[stageAt(e.start)].weather === 'mild') assert.ok(EARLY_TYPES.includes(e.type), `${seed}: ${e.type} too early (${e.start})`);
        else assert.ok(LATE_TYPES.includes(e.type));
      }

      if (k > 0) {
        const p = events[k - 1];
        assert.ok(e.start >= p.end, 'non-overlapping, sorted');
        assert.notEqual(e.type, p.type, `${seed}: ${e.type} twice in a row`);
        const gap = e.start - p.end;
        if (e.type === 'rainbow') {
          assert.equal(p.type, 'rain', 'rainbow only right after rain');
          // 0-1 blocks after the rain; one more when that block announces a stage
          const bumped = STAGES.some((st) => st.from === e.start - 1);
          assert.ok(gap === 0 || gap === 1 || (gap === 2 && bumped), `rainbow gap ${gap}`);
        } else {
          // the stage of the event before sets the gap (+1 when the next start would announce a stage)
          const [lo, hi] = STAGES[stageAt(p.start)].gap;
          assert.ok(gap >= lo && gap <= hi + 1, `${seed}: gap ${gap} before ${e.type} (stage of ${p.start}: ${lo}-${hi})`);
        }
      } else {
        assert.notEqual(e.type, 'rainbow');
      }

      if (e.type === 'rain' && e.end < WEATHER_HORIZON - 2) {
        rains++;
        if (events[k + 1]?.type === 'rainbow') rainbowsAfterRain++;
      }
    });
  }
  const ratio = rainbowsAfterRain / rains;
  assert.ok(ratio > 0.42 && ratio < 0.58, `rainbow after rain ratio ${ratio}`);
  for (const t of WEATHER_TYPES) assert.ok(typeCount[t] > 0, `${t} never generated`);
});

test('strength grows with start index', () => {
  let early = 0;
  let earlyN = 0;
  let late = 0;
  let lateN = 0;
  for (const seed of SEEDS.slice(0, 50)) {
    for (const e of createSequence(seed).events) {
      if (e.start < STAGES[2].from) {
        early += e.strength;
        earlyN++;
      } else if (e.start >= 50) {
        late += e.strength;
        lateN++;
      }
    }
  }
  assert.ok(earlyN > 0 && early / earlyN < 1.15 && late / lateN > 1.4, `${early / earlyN} ${late / lateN}`);
});

test('eventAt matches a linear scan; null in gaps and in the calm warm-up', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    const seq = createSequence(seed);
    for (let i = -2; i < 330; i++) {
      const linear = seq.events.find((e) => e.start <= i && i < e.end) || null;
      assert.equal(seq.eventAt(i), linear, `${seed} i=${i}`);
    }
    for (let i = 0; i < SEQUENCE_RULES.FIRST_EVENT_AT; i++) assert.equal(seq.eventAt(i), null);
    const first = seq.events[0];
    assert.equal(seq.eventAt(first.start), first);
    assert.equal(seq.eventAt(first.end - 1), first);
    assert.notEqual(seq.eventAt(first.end), first);
    assert.equal(seq.eventAt(10000), null);
  }
});

test('forecast', () => {
  const seq = createSequence('stapel-2026-10-06');
  assert.deepEqual(seq.forecast(), seq.events.slice(0, 5).map((e) => e.type));
  assert.equal(seq.forecast().length, 5);
  assert.deepEqual(seq.forecast(3), seq.forecast(5).slice(0, 3));
  assert.deepEqual(seq.forecast(0), []);
  for (const seed of SEEDS) {
    const f = createSequence(seed).forecast(5);
    assert.equal(f.length, 5);
    for (const t of f) assert.ok(WEATHER_TYPES.includes(t));
  }
});

test('block() tolerates odd indices', () => {
  const seq = createSequence('x');
  assert.deepEqual(seq.block(-3), seq.block(0));
  assert.deepEqual(seq.block(2.7), seq.block(2));
  assert.equal(seq.block(1000).i, 1000);
  assert.deepEqual(createSequence(12345).block(4), createSequence('12345').block(4));
});

// Golden snapshot of Daaglikse Toring #1 (seed 'stapel-2026-10-06').
// Updated deliberately in 1.0.1 (cube/pillar from block 12, L/J/T from 20): block 6 became an arch.
const GOLDEN_BLOCKS = 'plank:1:0 slab:1.01:1 plank:1.1:6 plank:1.04:0 wedge:1.08:1 plank:0.94:7 '
  + 'arch:1:3 brick:1.06:1 arch:1:6 slab:0.93:5 slab:1.07:7 plank:0.96:6';
// 1.10: the stages (calm warm-up, then "Moeiliker!") moved every day's weather later and further apart
// 1.11: the stages start a quarter sooner, weather comes about a fifth more often (STAGES in config.js)
const GOLDEN_EVENTS = [
  { type: 'rain', start: 11, end: 15, dir: 1, strength: 0.72 },
  { type: 'rainbow', start: 16, end: 19, dir: 1, strength: 0.91 },
  { type: 'gust', start: 25, end: 29, dir: -1, strength: 1.01 },
  { type: 'storm', start: 33, end: 36, dir: 1, strength: 1.26 },
];

test('stages: calm first, then each stage harder; every block belongs to one', () => {
  assert.equal(stageAt(0), 0);
  assert.equal(stageAt(STAGES[1].from - 1), 0);
  assert.equal(stageAt(STAGES[1].from), 1);
  assert.equal(stageAt(10000), STAGES.length - 1);
  for (let k = 1; k < STAGES.length; k++) {
    assert.ok(STAGES[k].from > STAGES[k - 1].from);
    if (k > 1) assert.ok(STAGES[k].gap[1] <= STAGES[k - 1].gap[1], 'weather comes as often or more often');
  }
  assert.equal(STAGES[0].weather, null, 'the warm-up has no weather');
  // over 300 days: the warm-up never has weather, and the last stage is as busy as before 1.10
  let busy = 0;
  for (const seed of SEEDS.slice(0, 100)) {
    const { events } = createSequence(seed);
    assert.ok(events.every((e) => e.start >= STAGES[1].from));
    busy += events.filter((e) => e.start >= STAGES[3].from && e.start < 100).length;
  }
  assert.ok(busy / 100 > 6, `${busy / 100} events in blocks 55-99`);
});
