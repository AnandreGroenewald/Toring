// (1.20) Die Rivier's courses (js/core/rivier.js): the same river for everyone on a day, always passable, people
// to rescue in the order given (yours first), Saturday's islands along the way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COINS, FALLS, RIVER, rescueCourse, raidCourse, passable, unreachableCoins, speedAt, laneX, inRapids, PACE } from '../js/core/rivier.js';
import { rideMaxMetres } from '../js/core/riverpace.js';

const WHO = ['boer', 'haai', 'bytjie', 'klippie', 'rissie', 'seekat', 'braai', 'duiker'];

test('rivier: the same seed gives the same river; another seed another', () => {
  const a = rescueCourse('2026-10-26', WHO);
  const b = rescueCourse('2026-10-26', WHO);
  assert.deepEqual(a, b);
  assert.notDeepEqual(rescueCourse('2026-10-27', WHO).rows, a.rows);
  assert.equal(a.len, RIVER.rescueLen);
});

test('rivier: every course of a year is passable, starts with people only, and keeps everyone in order', () => {
  for (let d = 0; d < 365; d++) {
    const seed = `day-${d}`;
    const c = rescueCourse(seed, WHO);
    assert.ok(passable(c), seed);
    const intro = c.rows.filter((r) => r.intro);
    assert.ok(intro.length >= 3);
    for (const r of intro) for (const it of r.items) assert.equal(it.kind, 'person');
    const got = c.rows.flatMap((r) => r.items.filter((it) => it.kind === 'person').map((it) => it.who));
    assert.deepEqual(got, WHO.slice(0, got.length), 'in the order given');
    assert.equal(got.length, WHO.length, `${seed}: everyone has a place`);
    assert.ok(c.rows.some((r) => r.items.some((it) => it.kind === 'block')), 'blocks to dodge');
    for (const r of c.rows) {
      assert.ok(r.z > 0 && r.z < c.len);
      for (const it of r.items) assert.ok(it.lane >= 0 && it.lane < RIVER.lanes);
    }
    const zs = c.rows.map((r) => r.z);
    assert.deepEqual(zs, [...zs].sort((x, y) => x - y), 'rows in order');
  }
});

test('rivier: Saturday\'s course passes four islands, both sides of the river, calmer beside them', () => {
  const c = raidCourse('2026-10-31/R1', ['A', 'B', 'C', 'D'], WHO);
  assert.equal(c.islands.length, 4);
  assert.deepEqual(c.islands.map((i) => i.crew), ['A', 'B', 'C', 'D']);
  assert.ok(new Set(c.islands.map((i) => i.side)).size === 2);
  assert.ok(passable(c));
  for (const i of c.islands) {
    const near = c.rows.filter((r) => Math.abs(r.z - i.z) < 40);
    for (const r of near) assert.ok(r.items.filter((it) => it.kind !== 'person').length <= 1, 'one block at most by an island');
  }
});

test('rivier: speed rises along the course; lanes sit either side of the middle', () => {
  assert.equal(speedAt(0, 640), RIVER.speed0);
  assert.equal(speedAt(640, 640), RIVER.speed1);
  assert.ok(speedAt(300, 640) > RIVER.speed0 && speedAt(300, 640) < RIVER.speed1);
  assert.equal(laneX(1), 0);
  assert.equal(laneX(0), -RIVER.laneW);
  assert.equal(passable({ rows: [{ z: 10, items: [0, 1, 2].map((lane) => ({ lane, kind: 'block' })) }] }), false);
});

test('rivier: crocodiles, Blouaap on his block and hippos come in, each met alone first; the rapids are calmer', () => {
  let seen = { croc: 0, monkey: 0, hippo: 0 };
  for (let d = 0; d < 120; d++) {
    const c = rescueCourse(`dag-${d}`, WHO);
    const order = [];
    for (const r of c.rows) {
      for (const it of r.items) {
        if (seen[it.kind] !== undefined) seen[it.kind]++;
        if (['croc', 'monkey', 'hippo'].includes(it.kind) && !order.includes(it.kind)) {
          order.push(it.kind);
          assert.equal(r.teach, it.kind, `${d}: the first ${it.kind} is a lesson row`);
          assert.equal(r.items.filter((x) => x.kind !== 'person').length, 1, 'alone');
        }
        if (it.kind === 'monkey') assert.ok(it.shape && Math.abs(it.drift) >= 1, 'Blouaap sits on a block and paddles it across');
      }
      if (r.rapids) assert.ok(r.items.filter((x) => x.kind !== 'person').length <= 1);
    }
    assert.deepEqual(order, ['croc', 'monkey', 'hippo'].filter((k) => order.includes(k)), 'in that order');
    assert.ok(c.rapids.to > c.rapids.from);
  }
  assert.ok(seen.croc > 120 && seen.monkey > 60 && seen.hippo > 60, JSON.stringify(seen));
});

test('rivier (endless): the river never ends — always passable at its speed, everyone placed before the lake, faster and busier further down', () => {
  for (let d = 0; d < 60; d++) {
    const c = rescueCourse(`end-${d}`, WHO, { endless: true });
    assert.equal(c.len, Infinity);
    c.extend(8000);
    assert.ok(c.rows.at(-1).z > 7900, 'rows as far as asked');
    assert.ok(passable(c), `end-${d}`);
    const got = c.rows.flatMap((r) => r.items.filter((it) => it.kind === 'person').map((it) => ({ who: it.who, z: r.z })));
    assert.deepEqual(got.map((g) => g.who), WHO, 'everyone, in order');
    assert.ok(got.every((g) => g.z < RIVER.lakeFrom), 'all before the lake');
    const zs = c.rows.map((r) => r.z);
    assert.deepEqual(zs, [...zs].sort((x, y) => x - y), 'rows in order');
    for (const r of c.rows) {
      if (r.z > c.lake.from - 20 && r.z < c.lake.to) assert.ok(r.items.filter((it) => it.kind !== 'person').length <= 1, 'calm by your island');
      if (inRapids(c, r.z)) assert.ok(r.items.filter((it) => it.kind !== 'person').length <= 1, 'one at a time in the rapids');
    }
    // (the same day: the same river, however far it's made)
    // (29 Oct 2026: but for the newest row, whose coins wait for the row after it)
    const c2 = rescueCourse(`end-${d}`, WHO, { endless: true });
    c2.extend(3000);
    assert.deepEqual(c2.rows.slice(0, -1), c.rows.filter((r) => r.z <= c2.rows.at(-2).z));
  }
  // (the owner: "it begins VERY slow and then the speed stays the same": a brisk start, and always getting faster)
  assert.equal(speedAt(0, Infinity), PACE.start);
  assert.ok(PACE.start >= 18, 'not a slow start');
  let prev = 0;
  for (let z = 0; z <= 7000; z += 250) {
    const v = speedAt(z, Infinity);
    assert.ok(v > prev, `faster at ${z} m (${v})`);
    prev = v;
  }
  assert.equal(speedAt(20000, Infinity), PACE.max);
  // the server's limit: an honest ride is always within it, a forged one isn't
  for (const secs of [20, 60, 180, 600]) {
    let d = 0;
    for (let s = 0; s < secs; s += 0.05) d += speedAt(d, Infinity) * 0.05;
    assert.ok(d <= rideMaxMetres(secs), `${secs} s: ${Math.round(d)} m fits`);
    assert.ok(rideMaxMetres(secs) < d * 1.6 + 60, 'and the limit stays close to it');
  }
  assert.ok(inRapids(rescueCourse('x', WHO, { endless: true }), 400) && inRapids(rescueCourse('x', WHO, { endless: true }), 400 + 2 * RIVER.rapidsEvery));
});

test('rivier (endless): the river grows harder further down — Hanswors from 1 km, logs from 2 km, fallen trees from 3 km, each first one a lesson', () => {
  // (the owner, 25 Oct 2026: "keep it as is for the first 1000 meters, then after that it adds a clown ... after 2000
  // meters there is a small object that you need to jump over, the first one shows you to jump")
  const LATER = ['clown', 'log', 'branch'];
  for (let d = 0; d < 40; d++) {
    const c = rescueCourse(`later-${d}`, WHO, { endless: true });
    c.extend(6000);
    const at = (kind) => c.rows.filter((r) => r.items.some((it) => it.kind === kind));
    for (const kind of LATER) {
      const rows = at(kind);
      assert.ok(rows.length >= 2, `${kind}: more than one by 6 km (${d})`);
      assert.ok(rows[0].z >= RIVER.unlock[kind], `${kind} not before ${RIVER.unlock[kind]} m (${rows[0].z})`);
      assert.ok(rows[0].z < RIVER.unlock[kind] + 900, `${kind} soon after its mark (${rows[0].z})`);
      assert.equal(rows[0].teach, kind, `the first ${kind} is a lesson`);
      assert.ok(rows.slice(1).every((r) => r.teach !== kind), `only the first ${kind} teaches`);
    }
    // (Hanswors is an event, not a fixture: at least 1.6 km between his visits)
    const cz = at('clown').map((r) => r.z);
    for (let i = 1; i < cz.length; i++) assert.ok(cz[i] - cz[i - 1] >= RIVER.clownEvery[0] - 1, `Hanswors ${Math.round(cz[i] - cz[i - 1])} m after the last`);
    // (the first km as it was; none by your island or in the rapids)
    for (const r of c.rows) {
      const late = r.items.some((it) => LATER.includes(it.kind));
      if (r.z < RIVER.unlock.clown) assert.ok(!late, `nothing new in the first km (${r.z})`);
      if (late) assert.ok(!(r.z > c.lake.from - 20 && r.z < c.lake.to) && !inRapids(c, r.z), `not by the island or in the rapids (${r.z})`);
      // (a log in one lane leaves the other two lanes to jump or go round: never a person beside a log or a tree)
      if (r.items.some((it) => it.kind === 'log' || it.kind === 'branch')) assert.ok(!r.items.some((it) => it.kind === 'person'), 'no one to scoop under a log');
    }
    assert.ok(passable(c), `later-${d}`);
  }
  // (the day's river with an end, and Saturday's, have none of them)
  for (let d = 0; d < 20; d++) {
    const c = rescueCourse(`fin-${d}`, WHO);
    assert.ok(c.rows.every((r) => r.items.every((it) => !LATER.includes(it.kind))));
  }
});

test('rivier (endless): a whirlpool from 5 km and an elephant cow with her calf from 10 km, each first one a lesson; still passable', () => {
  // (the owner, 25 Oct 2026: "And then please add objects at 5000 and 10000 meters")
  for (let d = 0; d < 12; d++) {
    const c = rescueCourse(`deep-${d}`, WHO, { endless: true });
    c.extend(13500);
    const at = (kind) => c.rows.filter((r) => r.items.some((it) => it.kind === kind));
    for (const kind of ['whirl', 'ele']) {
      const rows = at(kind);
      assert.ok(rows.length >= 2, `${kind}: more than one by 13.5 km (${d})`);
      assert.ok(rows[0].z >= RIVER.unlock[kind], `${kind} not before ${RIVER.unlock[kind]} m (${rows[0].z})`);
      assert.ok(rows[0].z < RIVER.unlock[kind] + 900, `${kind} soon after its mark (${rows[0].z})`);
      assert.equal(rows[0].teach, kind, `the first ${kind} is a lesson`);
      assert.ok(rows.slice(1).every((r) => r.teach !== kind), `only the first ${kind} teaches`);
      // (alone in their row: nothing else to dodge at the same time)
      for (const r of rows) assert.ok(r.items.every((it) => it.kind === kind), `${kind} alone`);
    }
    // (events, not a slalom: whirlpools 450+ m apart, the elephants 650+ m apart)
    const wz = at('whirl').map((r) => r.z);
    for (let i = 1; i < wz.length; i++) assert.ok(wz[i] - wz[i - 1] >= RIVER.whirlEvery[0] - 1, `whirlpools ${Math.round(wz[i] - wz[i - 1])} m apart`);
    const ez = at('ele').map((r) => r.z);
    for (let i = 1; i < ez.length; i++) assert.ok(ez[i] - ez[i - 1] >= RIVER.eleEvery[0] - 1, `elephants ${Math.round(ez[i] - ez[i - 1])} m apart`);
    // a whirlpool sits in a side lane (its pull takes the middle too: the far lane is the way past)
    for (const r of at('whirl')) assert.ok([0, 2].includes(r.items[0].lane));
    // the cow and her calf come from one side and leave that side's lane open where you meet them
    for (const r of at('ele')) {
      const [cow, calf] = r.items;
      assert.equal(cow.from, calf.from);
      assert.ok(calf.calf && !cow.calf);
      const open = [0, 1, 2].find((l) => l !== cow.lane && l !== calf.lane);
      assert.equal(open, cow.from > 0 ? 2 : 0, 'the side they came from is open');
    }
    assert.ok(passable(c), `deep-${d}`);
  }
});

test('rivier (endless): coins only where they cost something; a stack every 700–900 m; one diamond after 2 km; the river the same', () => {
  // (the owner, 25 Oct 2026: "should we add tokens, starts or coins, just to make it more intreguing, but afcourse not easy")
  for (let d = 0; d < 12; d++) {
    const c = rescueCourse(`coin-${d}`, [], { endless: true });
    c.extend(6000);
    const lines = c.rows.flatMap((r) => r.items.filter((it) => it.kind === 'coins').map((it) => ({ r, it })));
    assert.ok(lines.length > 20, `coins on the river (${lines.length})`);
    for (const { r, it } of lines) {
      assert.ok(r.z >= COINS.from && !r.teach, 'not in the first metres, not on a lesson');
      if (it.y === 1) assert.ok(r.items.some((x) => x.kind === 'log'), 'in the air only over a log');
      if (it.y === 2) assert.ok(r.items.some((x) => x.kind === 'branch'), 'low only under a tree');
      // (28 Oct 2026: a waterfall's own line through its spray is the one line on open water, `spray`)
      if (it.y === 0 && !r.spray) assert.ok(r.items.some((x) => x.kind === 'block' && x.lane === it.lane), 'on the water only behind a block in that lane');
      // (a waterfall's line runs through its fall and the stretch it cleared)
      const next = c.rows.find((q) => q.z > r.z && q.items.some((x) => x.kind !== 'coins'));
      assert.ok(!next || r.z + it.dz + it.sp * (it.n - 1) < next.z, 'all of a line before the next row');
    }
    const gems = lines.filter(({ it }) => it.gem);
    assert.equal(gems.length, 1, 'one diamond a ride');
    assert.ok(gems[0].r.z >= COINS.gemFrom && gems[0].it.val === COINS.gemVal);
    const stacks = lines.filter(({ it }) => it.stack).map(({ r }) => r.z);
    for (let i = 1; i < stacks.length; i++) assert.ok(stacks[i] - stacks[i - 1] >= COINS.stackEvery[0] - 1, 'stacks apart');
    assert.ok(passable(c), `coin-${d}`);
    // (the river itself is the same as without coins: the same things in the same rows)
    const bare = c.rows.map((r) => r.items.filter((it) => it.kind !== 'coins').map((it) => `${it.kind}${it.lane}`).join(',')).join('|');
    const again = rescueCourse(`coin-${d}`, [], { endless: true });
    again.extend(6000);
    assert.equal(again.rows.map((r) => r.items.filter((it) => it.kind !== 'coins').map((it) => `${it.kind}${it.lane}`).join(',')).join('|'), bare, 'the same river every time');
  }
});

test('rivier (endless): every coin can be taken — hard sometimes, never impossible — and each line is laid once', () => {
  // (29 Oct 2026, the owner: "Sometimes the coins are impossible to get which feels like a trap, the coins should be hard
  // to get sometimes not impossible"; 1.23.0's lines began 4 m behind their block: at 20-40 m/s there was no time to
  // move in, two lane changes none at all)
  let lines = 0;
  for (let d = 0; d < 24; d++) {
    const c = rescueCourse(`reach-${d}`, [], { endless: true });
    for (let z = 2000; z <= 12000; z += 1500) c.extend(z);   // (grown bit by bit, as the ride does)
    assert.deepEqual(unreachableCoins(c), [], `reach-${d}`);
    for (const r of c.rows) {
      const keys = r.items.filter((it) => it.kind === 'coins').map((it) => `${it.lane}/${it.dz}/${it.y}`);
      lines += keys.length;
      assert.equal(new Set(keys).size, keys.length, `each line once (${r.z} m: the waterfalls' rows spliced in)`);
    }
    assert.ok(passable(c), `reach-${d}`);
  }
  assert.ok(lines > 24 * 40, `coins all the way down (${lines} lines)`);
  // (the check sees the trap: a line 4 m behind a block at 3 km, the lane beside it shut too)
  const trap = { endless: true, rows: [{ z: 3000, items: [{ kind: 'block', lane: 0 }, { kind: 'block', lane: 1 }, { kind: 'coins', lane: 0, n: 5, dz: 4, sp: 2.1, y: 0 }] }, { z: 3030, items: [] }] };
  assert.ok(unreachableCoins(trap).length >= 3);
  assert.ok(unreachableCoins(trap).every((b) => b.why === 'no time to move in'));
});

test('rivier (endless): what crosses the river crosses both ways — blocks, Blouaap and the crocodiles', () => {
  // (the owner, 25 Oct 2026: "every object goes from left to right")
  const ways = { block: new Set(), monkey: new Set(), croc: new Set() };
  const count = { block: [0, 0], monkey: [0, 0], croc: [0, 0] };
  for (let d = 0; d < 30; d++) {
    const c = rescueCourse(`ways-${d}`, WHO, { endless: true });
    c.extend(5000);
    for (const r of c.rows) {
      for (const it of r.items) {
        if (!it.drift) continue;
        const k = it.kind === 'monkey' || it.kind === 'croc' ? it.kind : 'block';
        ways[k].add(Math.sign(it.drift));
        count[k][it.drift > 0 ? 0 : 1]++;
      }
    }
  }
  for (const k of Object.keys(ways)) {
    assert.deepEqual([...ways[k]].sort(), [-1, 1], `${k}: both ways`);
    const [a, b] = count[k];
    assert.ok(Math.min(a, b) / (a + b) > 0.35, `${k}: about as often each way (${a} / ${b})`);
  }
});

test('rivier (endless): however many people (up to 24), all of them fit before the lake and the river runs on busy after it', () => {
  const MANY = ['boer', 'haai', 'bytjie', 'klippie', 'rissie', 'seekat', 'braai', 'duiker', 'madelief', 'draakie', 'brandweer', 'vuurhoutjie'];
  const who24 = [...MANY, ...MANY.map((x) => `${x}2`)];
  for (let d = 0; d < 400; d++) {
    for (const who of [who24, MANY, MANY.slice(0, 6), []]) {
      const c = rescueCourse(`many-${d}`, who, { endless: true });
      c.extend(3000);
      const ppl = c.rows.flatMap((r) => r.items.filter((it) => it.kind === 'person').map(() => r.z));
      assert.equal(ppl.length, who.length, `many-${d}/${who.length}: everyone`);
      assert.ok(ppl.every((z) => z < RIVER.lakeFrom), 'before the lake');
      const after = c.rows.filter((r) => r.z > RIVER.lakeTo + 100 && r.items.some((it) => it.kind !== 'person'));
      assert.ok(after.length > 40, `many-${d}/${who.length}: obstacles after the lake (${after.length})`);
      assert.ok(passable(c));
    }
  }
});

test('rivier (endless): waterfalls to ride through — never in white water or by the lake, a clear stretch, coins in the spray, the same on every phone', () => {
  // (28 Oct 2026, the owner: "maybe even a waterfall or two"; his pick: ride through one)
  for (let d = 0; d < 12; d++) {
    const c = rescueCourse(`fall-${d}`, [], { endless: true });
    c.extend(6000);
    assert.ok(c.falls.length >= 3, `falls on 6 km (${c.falls.length})`);
    assert.ok(c.falls[0] >= FALLS.first, 'not before the first');
    for (let i = 1; i < c.falls.length; i++) assert.ok(c.falls[i] - c.falls[i - 1] >= FALLS.every - 200, 'apart');
    for (const f of c.falls) {
      for (const z of [f - FALLS.before, f, f + FALLS.after]) {
        assert.ok(!inRapids(c, z), `${f}: no white water`);
        assert.ok(!(z > c.lake.from - 20 && z < c.lake.to), `${f}: not by the lake`);
      }
      const near = c.rows.filter((r) => r.z >= f - FALLS.before && r.z <= f + FALLS.after && !r.teach && !r.items.some((it) => it.gem));
      for (const r of near) for (const it of r.items) assert.ok(it.kind === 'person' || (it.kind === 'coins' && r.spray), `${f}: only people and its own coins (${it.kind})`);
      assert.equal(near.filter((r) => r.fall).length, 1, `${f}: its row`);
      assert.equal(near.filter((r) => r.spray).length, 1, `${f}: its coins`);
    }
    let sorted = true;
    for (let i = 1; i < c.rows.length; i++) if (c.rows[i].z < c.rows[i - 1].z) sorted = false;
    assert.ok(sorted, 'the rows stay in order');
    assert.ok(passable(c), `fall-${d}`);
    const again = rescueCourse(`fall-${d}`, [], { endless: true });
    again.extend(6000);
    assert.deepEqual(again.falls, c.falls, 'the same falls every time');
  }
  // (the fixed rescue course has none)
  assert.equal(rescueCourse('fall-x', []).falls, undefined);
});
