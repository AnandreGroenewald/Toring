// (1.20) Afgly's pace: how fast the endless river runs, and how close its rows come, at each metre down it. Shared by the
// game (js/core/rivier.js) and the server (server/src/span.js: no ride can be further than this pace allows in its
// time). The owner, 25 Oct 2026, after playing it: "it begins VERY slow and then the speed stays the same which makes it
// a little too easy": a brisk start, and it never stops getting faster.

export const PACE = Object.freeze({
  start: 19,        // m/s as you land
  early: 24,        // m/s at...
  earlyAt: 600,     // ...this far down (the lake with your island)
  perKm: 2.5,       // then this much faster every kilometre...
  // (30 Oct 2026, the owner: "it doesnt get much faster at 10 000": it stopped at 40 m/s from 7 km; now it keeps
  // getting faster to 55 m/s, about 13 km down: 47.5 m/s at 10 km)
  max: 55,          // ...up to this (about 13 km down)
  reactFrom: 0.85,  // s between rows at your speed, at least: at the start...
  reactTo: 0.68,    // ...and from...
  reactAt: 3500,    // ...this far down (rows come closer in time as you go: two lane changes still fit)
  rapidsK: 1.25,    // white water runs this much faster at most
});

/** The endless river's speed (m/s) `z` metres down it. */
export function paceAt(z) {
  const d = Math.max(0, Number(z) || 0);
  if (d <= PACE.earlyAt) return PACE.start + (PACE.early - PACE.start) * (d / PACE.earlyAt);
  return Math.min(PACE.max, PACE.early + ((d - PACE.earlyAt) / 1000) * PACE.perKm);
}

/** The least time (s) between two rows of obstacles `z` metres down the endless river. */
export function reactAt(z) {
  const k = Math.min(1, Math.max(0, (Number(z) || 0) / PACE.reactAt));
  return PACE.reactFrom + (PACE.reactTo - PACE.reactFrom) * k;
}

/** The furthest anyone can ride in `secs` seconds (the river at its fastest everywhere, the rapids all the way). */
export function rideMaxMetres(secs) {
  const s = Math.max(0, Math.min(4 * 3600, Number(secs) || 0));
  let d = 0;
  const dt = 0.05;
  for (let t = 0; t < s; t += dt) d += paceAt(d) * PACE.rapidsK * Math.min(dt, s - t);
  return d;
}
