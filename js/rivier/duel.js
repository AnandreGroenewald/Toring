// (1.21) Saam gly: two friends ride the same river at the same time and see each other on it (the owner, 25 Oct 2026:
// "is it possible to play this game two player mode, where I and a friend skee on the same course?", then "the 2 player
// game needs to show the other player while playing, that will make it more fun"). A room on the match server
// (js/slagNet.js: two seats, each message passed to the other as it came) carries:
//   {t:'hi', v, name, skin}          each, once both are in
//   {t:'go', n, seed}                the room's maker: round n on this river
//   {t:'rdy', n}                     this phone's river is on the screen (both ready: both count 3, 2, 1 together)
//   {t:'st', n, d, x, y, k, l, h}    a few times a second while riding: metres, across, up (a jump), duck, lean, hearts
//   {t:'ko', n}                      a knock
//   {t:'end', n, m}                  out at m metres
//   {t:'again', n}                   once more (when both have said it, the maker starts round n + 1)
// Nothing here is trusted: the friend's game could send anything, so every field is checked and clamped.
import { cleanNickname } from '../core/duel.js';

export const DUEL_V = 1;
/** How often a rider's place goes to the other phone (a second): under the room's 20 messages a second. */
export const STATE_HZ = 8;
/** The count before the river runs (s). */
export const COUNT_S = 3;

const num = (v, lo, hi, dflt = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const round = (v) => (Number.isInteger(v) && v >= 0 && v < 1000 ? v : -1);

/** A seed both phones ride: letters and digits only (it names the river). */
export function duelSeed(rand = Math.random) {
  let s = 'gly-';
  for (let i = 0; i < 8; i++) s += 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(rand() * 31)];
  return s;
}
const SEED_RE = /^gly-[a-z0-9]{8}$/;

/** What came from the friend, made safe: the message, or null when it isn't one of ours. */
export function cleanDuelMsg(m) {
  if (!m || typeof m !== 'object') return null;
  switch (m.t) {
    case 'hi': return { t: 'hi', v: num(m.v, 0, 99) | 0, name: cleanNickname(m.name) || '', skin: typeof m.skin === 'string' && /^[a-z-]{1,24}$/.test(m.skin) ? m.skin : 'kleur' };
    case 'go': return round(m.n) >= 0 && typeof m.seed === 'string' && SEED_RE.test(m.seed) ? { t: 'go', n: m.n, seed: m.seed } : null;
    case 'st': return round(m.n) >= 0 ? { t: 'st', n: m.n, d: num(m.d, 0, 1e6), x: num(m.x, -8, 8), y: num(m.y, 0, 6), k: num(m.k, 0, 1), l: num(m.l, -1, 1), h: num(m.h, 0, 9) | 0 } : null;
    case 'ko': return round(m.n) >= 0 ? { t: 'ko', n: m.n } : null;
    case 'rdy': return round(m.n) >= 0 ? { t: 'rdy', n: m.n } : null;
    case 'end': return round(m.n) >= 0 ? { t: 'end', n: m.n, m: num(m.m, 0, 1e6) } : null;
    case 'again': return round(m.n) >= 0 ? { t: 'again', n: m.n } : null;
    default: return null;
  }
}

/**
 * Who rode further: 'me', 'them' or 'tie' (within half a metre), from the two end metres.
 */
export function duelWinner(mine, theirs) {
  if (Math.abs(mine - theirs) < 0.5) return 'tie';
  return mine > theirs ? 'me' : 'them';
}

/**
 * A duel over one room connection (`conn` from slagNet.connect, its seat known): `host` (seat 0) starts each round.
 * { friend (once 'hi' came), round, seed, onMsg(fn), send(obj), start(), again(), ended(m), gone, close() }.
 * `onEvent(fn)`: fn({t:'hi'|'go'|'again'|'gone', ...}) for the menu's side (the river listens with onMsg).
 */
export function createRiverDuel(conn, { host, name = '', skin = 'kleur', rand = Math.random } = {}) {
  let friend = null;
  let n = -1;          // the round on now (-1: none yet)
  let seed = '';
  let isGone = false;
  let wantAgain = { me: -1, them: -1 };
  const rdy = { me: -1, them: -1, go: -1 };
  const msgFns = new Set();
  const eventFns = new Set();
  const emit = (set, m) => { for (const f of [...set]) { try { f(m); } catch (e) { console.error('[saam]', e); } } };
  function send(obj) {
    if (isGone) return;
    conn.send(obj);
  }
  function go(round) {
    n = round;
    seed = duelSeed(rand);
    wantAgain = { me: -1, them: -1 };
    send({ t: 'go', n, seed });
    emit(eventFns, { t: 'go', n, seed });
  }
  // what comes in, one at a time, for as long as the room is there
  (async () => {
    for (;;) {
      const raw = await conn.next(['hi', 'go', 'rdy', 'st', 'ko', 'end', 'again']);
      if (raw?.t === 'gone') {
        isGone = true;
        emit(msgFns, { t: 'gone' });
        emit(eventFns, { t: 'gone' });
        return;
      }
      const m = cleanDuelMsg(raw);
      if (!m) continue;
      if (m.t === 'hi') {
        const first = !friend;
        friend = { name: m.name, skin: m.skin };
        if (first) emit(eventFns, { t: 'hi', friend });
        continue;
      }
      if (m.t === 'go') {
        // (only the maker starts a round; the friend's game follows it)
        if (host || m.n <= n) continue;
        n = m.n;
        seed = m.seed;
        wantAgain = { me: -1, them: -1 };
        emit(eventFns, { t: 'go', n, seed });
        continue;
      }
      if (m.t === 'rdy') {
        rdy.them = m.n;
        bothReady();
        continue;
      }
      if (m.t === 'again') {
        wantAgain.them = m.n;
        emit(eventFns, { t: 'again', n: m.n, who: 'them' });
        if (host && wantAgain.me === n && wantAgain.them === n) go(n + 1);
        continue;
      }
      if (m.n === n) emit(msgFns, m);
    }
  })();
  /** Both rivers on the screen for this round: the river's side hears {t:'start'} and counts. */
  function bothReady() {
    if (n >= 0 && rdy.me === n && rdy.them === n && rdy.go !== n) {
      rdy.go = n;
      emit(msgFns, { t: 'start', n });
    }
  }
  // (the hello goes once the friend is in: the room passes nothing on to an empty seat that it then has to keep)
  conn.ready.then(() => send({ t: 'hi', v: DUEL_V, name, skin }));
  return {
    host: !!host,
    get friend() { return friend; },
    get round() { return n; },
    get seed() { return seed; },
    get gone() { return isGone; },
    /** The river's side: fn(msg) for the friend's 'st', 'ko', 'end' of this round, and 'gone'. */
    onMsg(fn) { msgFns.add(fn); return () => msgFns.delete(fn); },
    /** The menu's side: fn({t:'hi'|'go'|'again'|'gone'}). */
    onEvent(fn) { eventFns.add(fn); return () => eventFns.delete(fn); },
    /** The river's side: this rider's own news ('st', 'ko', 'end'), for this round. */
    send(obj) { if (n >= 0) send({ ...obj, n }); },
    /** This phone's river is up for this round (the count starts when the friend's is too). */
    ready() {
      if (n < 0) return;
      rdy.me = n;
      send({ t: 'rdy', n });
      bothReady();
    },
    /** The maker: the first round. */
    start() { if (host && n < 0) go(0); },
    /** Once more: when both have said it, the maker starts the next round. */
    again() {
      if (isGone) return;
      wantAgain.me = n;
      send({ t: 'again', n });
      if (host && wantAgain.them === n) go(n + 1);
    },
    close() {
      isGone = true;
      msgFns.clear();
      eventFns.clear();
      conn.close();
    },
  };
}
