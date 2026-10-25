// (1.21) Saam gly: two friends ride the same river at the same time and see each other on it (the owner, 25 Oct 2026:
// "is it possible to play this game two player mode, where I and a friend skee on the same course?", then "the 2 player
// game needs to show the other player while playing, that will make it more fun"). Over a room on the match server
// (js/rivier/saamNet.js: two seats, each message passed to the other, back by itself after a phone's trip to WhatsApp):
//   {t:'hi', v, name, skin}          each, whenever both are in (again after every return)
//   {t:'go', n, seed}                the room's maker: round n on this river (again after every return)
//   {t:'rdy', n}                     this phone's river is on the screen (both ready: both count 3, 2, 1 together)
//   {t:'st', n, x, y, k, l, h, d}    ten times a second while riding: across, up (a jump), duck, lean, hearts, metres
//   {t:'ko', n}                      a knock
//   {t:'end', n, m}                  out at m metres (again after every return)
//   {t:'again', n}                   once more (when both have said it, the maker starts round n + 1)
//   {t:'bye'}                        Klaar: gone for good (a dropped game is only "away" till it's back, or AWAY_MS)
// Nothing here is trusted: the friend's game could send anything, so every field is checked and clamped.
import { cleanNickname } from '../core/duel.js';

export const DUEL_V = 2;
/** How often a rider's place goes to the other phone (a second): under the room's 20 messages a second. */
export const STATE_HZ = 10;
/** The count before the river runs (s). */
export const COUNT_S = 3;
/** The friend's game gone this long (not back in the room): gone for good. */
export const AWAY_MS = 75000;

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
    case 'bye': return { t: 'bye' };
    default: return null;
  }
}

/** Who rode further: 'me', 'them' or 'tie' (within half a metre), from the two end metres. */
export function duelWinner(mine, theirs) {
  if (Math.abs(mine - theirs) < 0.5) return 'tie';
  return mine > theirs ? 'me' : 'them';
}

/**
 * A duel over one room `link` (js/rivier/saamNet.js connectSaam, or a test's stand-in: { on(fn), send(obj), close() }):
 * `host` (who made the room, or the lobby's longest waiting) starts each round.
 * { host, friend (once 'hi' came), round, seed, gone, onMsg(fn), onEvent(fn), send(obj), start(), ready(), again(),
 *   close() }. The river listens with onMsg ('st', 'ko', 'end' of this round, 'start' (both ready), 'away' / 'here'
 * (the friend's game dropped / is back), 'meLost' / 'meBack' (ours), 'gone'); the menu with onEvent ('hi', 'go',
 * 'again', 'gone').
 */
export function createRiverDuel(link, { host, name = '', skin = 'kleur', rand = Math.random, timers = globalThis, awayMs = AWAY_MS } = {}) {
  let friend = null;
  let n = -1;          // the round on now (-1: none yet)
  let seed = '';
  let isGone = false;
  let away = 0;        // (the friend's game dropped: the timer that ends it)
  let wantAgain = { me: -1, them: -1 };
  const rdy = { me: -1, them: -1, go: -1 };
  const myEnd = { n: -1, m: 0 };
  const msgFns = new Set();
  const eventFns = new Set();
  const emit = (set, m) => {
    for (const f of [...set]) {
      try { f(m); } catch (e) { console.error('[saam]', e); }
    }
  };
  const send = (obj) => { if (!isGone) link.send(obj); };
  function go(r) {
    n = r;
    seed = duelSeed(rand);
    wantAgain = { me: -1, them: -1 };
    send({ t: 'go', n, seed });
    emit(eventFns, { t: 'go', n, seed });
  }
  /** Both rivers on the screen for this round: the river's side hears {t:'start'} and counts. */
  function bothReady() {
    if (n >= 0 && rdy.me === n && rdy.them === n && rdy.go !== n) {
      rdy.go = n;
      emit(msgFns, { t: 'start', n });
    }
  }
  function goneForGood() {
    if (isGone) return;
    isGone = true;
    timers.clearTimeout(away);
    emit(msgFns, { t: 'gone' });
    emit(eventFns, { t: 'gone' });
    link.close();
  }
  link.on((raw) => {
    if (isGone) return;
    switch (raw?.t) {
      case 'ready':
        // (both in: again after every return; each says who it is and where it stands, so a dropped message is said again)
        send({ t: 'hi', v: DUEL_V, name, skin });
        if (n >= 0) {
          if (host) send({ t: 'go', n, seed });
          if (rdy.me === n) send({ t: 'rdy', n });
          if (myEnd.n === n) send({ t: 'end', n, m: myEnd.m });
          if (wantAgain.me === n) send({ t: 'again', n });
        }
        if (away) {
          timers.clearTimeout(away);
          away = 0;
          emit(msgFns, { t: 'here' });
        }
        return;
      case 'away':
        if (!away) away = timers.setTimeout(goneForGood, awayMs);
        emit(msgFns, { t: 'away' });
        return;
      case 'meLost':
      case 'meBack':
        emit(msgFns, { t: raw.t });
        return;
      case 'fail':
        goneForGood();
        return;
      default:
    }
    const m = cleanDuelMsg(raw);
    if (!m) return;
    if (m.t === 'bye') { goneForGood(); return; }
    if (m.t === 'hi') {
      const first = !friend;
      friend = { name: m.name, skin: m.skin };
      if (first) emit(eventFns, { t: 'hi', friend });
      return;
    }
    if (m.t === 'go') {
      // (only the maker starts a round; the friend's game follows it, once per round)
      if (host || m.n <= n) return;
      n = m.n;
      seed = m.seed;
      wantAgain = { me: -1, them: -1 };
      emit(eventFns, { t: 'go', n, seed });
      return;
    }
    if (m.t === 'rdy') {
      if (m.n === n) {
        rdy.them = m.n;
        bothReady();
      }
      return;
    }
    if (m.t === 'again') {
      if (m.n !== n) return;
      wantAgain.them = m.n;
      emit(eventFns, { t: 'again', n: m.n, who: 'them' });
      if (host && wantAgain.me === n && wantAgain.them === n) go(n + 1);
      return;
    }
    if (m.n === n) emit(msgFns, m);
  });
  return {
    host: !!host,
    get friend() { return friend; },
    get round() { return n; },
    get seed() { return seed; },
    get gone() { return isGone; },
    /** The river's side: fn(msg) for the friend's 'st', 'ko', 'end' of this round, 'start', 'away', 'here', 'gone'. */
    onMsg(fn) { msgFns.add(fn); return () => msgFns.delete(fn); },
    /** The menu's side: fn({t:'hi'|'go'|'again'|'gone'}). */
    onEvent(fn) { eventFns.add(fn); return () => eventFns.delete(fn); },
    /** The river's side: this rider's own news ('st', 'ko', 'end'), for this round. */
    send(obj) {
      if (n < 0) return;
      if (obj?.t === 'end') {
        myEnd.n = n;
        myEnd.m = obj.m;
      }
      send({ ...obj, n });
    },
    /** The maker: the first round (once the friend has said hello). */
    start() { if (host && n < 0) go(0); },
    /** This phone's river is up for this round (the count starts when the friend's is too). */
    ready() {
      if (n < 0) return;
      rdy.me = n;
      send({ t: 'rdy', n });
      bothReady();
    },
    /** Once more: when both have said it, the maker starts the next round. */
    again() {
      if (isGone || n < 0) return;
      wantAgain.me = n;
      send({ t: 'again', n });
      if (host && wantAgain.them === n) go(n + 1);
    },
    /** Klaar: the friend hears it's for good, then the room goes. */
    close() {
      if (!isGone) link.send({ t: 'bye' });
      isGone = true;
      timers.clearTimeout(away);
      msgFns.clear();
      eventFns.clear();
      link.close();
    },
  };
}
