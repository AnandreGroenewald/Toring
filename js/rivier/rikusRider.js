// (28 Oct 2026, the owner chose the design fixes, among them "a ghost rider when nobody is online") Robot Rikus on the
// river: when nobody is looking for a Saam gly at the moment, he rides with you. A stand-in for the room's link
// (js/rivier/saamNet.js connectSaam: { on(fn), send(obj), close(), drop() }) that answers the way a friend's phone does
// (js/rivier/duel.js has the messages): 'hi', 'rdy' once "his" river is up, ten 'st' a second down the same river (round
// what's in the way, over a log, under a tree), three knocks and 'end' at metres picked near the player's own best, so a
// ride with him is close, and 'again' when asked. No server, no room: nothing leaves the phone.
import { DUEL_V, STATE_HZ, COUNT_S } from './duel.js';
import { rescueCourse, laneX, speedAt } from '../core/rivier.js';
import { createRng } from '../core/rng.js';

export const RIKUS_RIDE = Object.freeze({
  name: 'Robot Rikus', skin: 'kleur',
  loadMs: 1600,          // his river "loading" before his 'rdy'
  againMs: 1400,         // a moment before he says once more
  around: [0.6, 1.3],    // where he goes out: the player's best times this
  firstEnd: 450,         // (no best yet: about here)
  minEnd: 220,
  look: 26,              // m ahead he looks for what's in the way
  laneV: 7,              // m/s across
});
const PASS = new Set(['person', 'coins']);   // (what he rides through)

/** Robot Rikus's side of a Saam gly room. `best`: the player's best ride (m), to make it close. */
export function createRikusLink({ best = 0, timers = globalThis, now = () => Date.now() } = {}) {
  const fns = new Set();
  let closed = false;
  let n = -1;
  let course = null;
  let tick = 0;
  let startAt = 0;
  let last = 0;
  let d = 0;
  let x = laneX(1);
  let lane = 1;
  let y = 0;
  let duck = 0;
  let airT = -1;
  let duckT = -1;
  let h = 3;
  let knocks = [];
  let ended = false;
  let gotRdy = false;
  let sentRdy = false;
  let saidHi = false;
  const emit = (m) => {
    if (closed) return;
    for (const f of [...fns]) {
      try { f(m); } catch (e) { console.error('[rikus]', e); }
    }
  };
  const later = (ms, fn) => timers.setTimeout(() => { if (!closed) fn(); }, ms);
  function stop() {
    if (tick) timers.clearInterval(tick);
    tick = 0;
  }
  function round(r, seed) {
    stop();
    n = r;
    course = rescueCourse(String(seed || 'rivier'), [], { endless: true });
    d = 0;
    x = laneX(1);
    lane = 1;
    y = 0;
    duck = 0;
    airT = -1;
    duckT = -1;
    h = 3;
    ended = false;
    gotRdy = false;
    sentRdy = false;
    // (where he goes out: near your own best, now a little short of it, now a little past; his knocks along the way)
    const rng = createRng(`rikus|${seed}|${r}`);
    const aim = Math.max(RIKUS_RIDE.minEnd, (best > 0 ? best : RIKUS_RIDE.firstEnd) * rng.float(RIKUS_RIDE.around[0], RIKUS_RIDE.around[1]));
    knocks = [aim * rng.float(0.3, 0.5), aim * rng.float(0.6, 0.85), aim];
    later(RIKUS_RIDE.loadMs, () => {
      sentRdy = true;
      emit({ t: 'rdy', n });
      go();
    });
  }
  /** Both rivers up: the count (as the room's two phones count), then he rides. */
  function go() {
    if (!sentRdy || !gotRdy || tick) return;
    startAt = now() + COUNT_S * 1000;
    last = now();
    tick = timers.setInterval(() => {
      const t = now();
      const dt = Math.min(0.25, (t - last) / 1000);
      last = t;
      if (t < startAt || ended) return;
      step(dt);
      emit({
        t: 'st', n, d: Math.round(d * 10) / 10, x: Math.round(x * 100) / 100, a: laneX(lane), y: Math.round(y * 100) / 100,
        k: Math.round(duck * 100) / 100, l: Math.max(-1, Math.min(1, (laneX(lane) - x) / 2)), h,
      });
    }, Math.round(1000 / STATE_HZ));
  }
  function step(dt) {
    const sp = speedAt(d, Infinity);
    d += sp * dt;
    if (course.extend && course.rows[course.rows.length - 1].z < d + 300) course.extend(d + 1500);
    // what's in the way just ahead: a lane that's free, the nearest one first (staying put if it is)
    const ahead = course.rows.filter((r) => r.z > d + 1 && r.z < d + RIKUS_RIDE.look);
    const shut = new Set();
    let log = null;
    let tree = null;
    for (const r of ahead) {
      for (const it of r.items) {
        if (PASS.has(it.kind)) continue;
        if (it.kind === 'log' && (it.span || 1) >= 3) { if (!log) log = r.z; continue; }
        if (it.kind === 'branch') { if (!tree) tree = r.z; continue; }
        shut.add(it.lane);
        if (typeof it.drift === 'number' && it.drift) shut.add(it.lane + Math.sign(it.drift));   // (what crosses: both its lanes)
        if ((it.span || 1) > 1) for (const l of [0, 1, 2]) shut.add(l);
      }
    }
    if (shut.has(lane)) {
      const free = [lane - 1, lane + 1, lane - 2, lane + 2].find((l) => l >= 0 && l <= 2 && !shut.has(l));
      if (free !== undefined) lane = free;
    }
    const want = laneX(lane);
    x += Math.max(-RIKUS_RIDE.laneV * dt, Math.min(RIKUS_RIDE.laneV * dt, want - x));
    // over a log, under a tree, just in time
    if (log !== null && airT < 0 && log - d < sp * 0.32) airT = 0;
    if (tree !== null && duckT < 0 && tree - d < sp * 0.3) duckT = 0;
    if (airT >= 0) {
      airT += dt;
      y = Math.max(0, 4.2 * airT - 7 * airT * airT);
      if (airT > 0.6) { airT = -1; y = 0; }
    }
    if (duckT >= 0) {
      duckT += dt;
      duck = duckT < 0.55 ? 1 : 0;
      if (duckT > 0.6) { duckT = -1; duck = 0; }
    }
    // his knocks, and out at the last
    while (knocks.length && d >= knocks[0]) {
      knocks.shift();
      h = Math.max(0, h - 1);
      emit({ t: 'ko', n });
      if (!h) {
        ended = true;
        emit({ t: 'end', n, m: Math.round(d * 10) / 10 });
        stop();
        break;
      }
    }
  }
  const link = {
    on(fn) {
      fns.add(fn);
      later(150, () => emit({ t: 'ready' }));   // (both "in the room": the duel says hello)
      return () => fns.delete(fn);
    },
    send(obj) {
      if (closed || !obj || typeof obj !== 'object') return true;
      // (answers a moment later, the way a phone's do: never inside the duel's own call)
      if (obj.t === 'hi' && !saidHi) {
        saidHi = true;
        later(250, () => emit({ t: 'hi', v: DUEL_V, name: RIKUS_RIDE.name, skin: RIKUS_RIDE.skin }));
      } else if (obj.t === 'go' && Number.isInteger(obj.n) && obj.n > n) {
        round(obj.n, obj.seed);
      } else if (obj.t === 'rdy' && obj.n === n) {
        gotRdy = true;
        go();
      } else if (obj.t === 'again' && obj.n === n) {
        later(RIKUS_RIDE.againMs, () => emit({ t: 'again', n }));
      } else if (obj.t === 'bye') {
        link.close();
      }
      return true;
    },
    close() {
      closed = true;
      stop();
      fns.clear();
    },
    drop() {},
  };
  return link;
}
