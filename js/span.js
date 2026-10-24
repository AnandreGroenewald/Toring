// (1.20) Ons dorp on the phone: your crew's week as this phone keeps it — the Weektoring's floors, your build turns, the
// Dailies that count (ticket and bombs), today's rescue ride and the town's people. The rules are js/core/span.js and
// js/core/weektower.js; the screens are js/ui/dom.js; js/main.js runs the day (Daily → the river → the Weektoring).
// Checkpoint 1 (24 Oct 2026) keeps it all on the phone: a crew of one. Checkpoint 2 moves the crew and its tower to the
// server (server/src/span.js) behind the same calls.
import { SPAN, weekOf, dowOf, weekStats, plusDays } from './core/span.js';
import { addFloors, heightOf, moveIn, peopleIn, cleanFloor } from './core/weektower.js';
import { createRng } from './core/rng.js';
import { safeLocalStorage } from './core/storage.js';

const KEY = 'stapel.v1.span';
const MONUMENTS = 8;       // past weeks' towers kept (height and the tower itself, newest first)
const RIDE_MIN = 6;        // people on a ride at least (strays make up the rest)...
const RIDE_MAX = 12;       // ...and at most

const blank = (week) => ({ v: 1, week, floors: [], people: 0, days: {}, granted: {}, used: 0, rides: {}, monuments: [], name: '' });

function clean(raw, week) {
  const d = blank(week);
  if (!raw || typeof raw !== 'object') return d;
  if (typeof raw.week === 'string') d.week = raw.week;
  if (Array.isArray(raw.floors)) d.floors = raw.floors.map(cleanFloor).filter(Boolean).slice(0, 600);
  d.people = Math.max(0, Math.min(1e6, raw.people | 0));
  for (const k of ['days', 'granted', 'rides']) {
    if (raw[k] && typeof raw[k] === 'object') for (const [dk, v] of Object.entries(raw[k])) if (/^\d{4}-\d{2}-\d{2}$/.test(dk)) d[k][dk] = Number(v) || 0;
  }
  d.used = Math.max(0, Math.min(99, raw.used | 0));
  if (Array.isArray(raw.monuments)) d.monuments = raw.monuments.filter((m) => m && typeof m.week === 'string').slice(0, MONUMENTS);
  d.name = typeof raw.name === 'string' ? raw.name.slice(0, 18) : '';
  return d;
}

/** `castIds`: everyone who can be in the river; `earn(n)`: coins into the wallet (returns what was added). */
export function createSpan({ backend = safeLocalStorage(), debug = false, castIds = [], earn = () => 0, today = () => new Date().toISOString().slice(0, 10) } = {}) {
  const key = debug ? `${KEY}.debug` : KEY;
  let d = null;
  const save = () => { try { backend?.setItem(key, JSON.stringify(d)); } catch { /* private window: this visit only */ } };
  function load() {
    const wk = weekOf(today());
    try {
      const s = backend?.getItem(key);
      d = clean(s ? JSON.parse(s) : null, wk);
    } catch {
      d = blank(wk);
    }
    roll(wk);
  }
  /** A new week: last week's tower becomes a monument, a new Weektoring starts (the town's people stay). */
  function roll(wk) {
    if (d.week === wk) return;
    if (d.floors.length) d.monuments = [{ week: d.week, h: heightOf(d.floors), n: d.floors.length, floors: d.floors }, ...d.monuments].slice(0, MONUMENTS);
    Object.assign(d, { week: wk, floors: [], days: {}, granted: {}, used: 0, rides: {} });
    save();
  }
  load();

  /** Build turns waiting: one per finished Daily (Mon-Sat), at most SPAN.turnsMax at a time. */
  const turnsLeft = () => Math.max(0, Object.values(d.granted).reduce((s, n) => s + n, 0) - d.used);

  return {
    /** What the screens show. */
    view() {
      roll(weekOf(today()));
      const day = today();
      const ws = weekStats(d.days, d.week);
      return {
        week: d.week, floors: d.floors, heightM: heightOf(d.floors), people: d.people, name: d.name,
        turns: turnsLeft(), ticket: ws.ticket, weekdays: ws.weekdays, bombs: ws.bombs, metres: ws.metres,
        rideToday: d.rides[day] === 0, rodeToday: day in d.rides && d.rides[day] !== 0, monuments: d.monuments,
        dow: dowOf(day),
      };
    },
    /**
     * A Daily was finished (`fell`: who jumped out of its floors). It counts for the week (its best height), gives a build
     * turn (Mon-Sat, once a day, while fewer than SPAN.turnsMax wait) and opens today's ride (once a day).
     */
    dailyDone(dateKey, heightM, fell = []) {
      roll(weekOf(today()));
      if (weekOf(dateKey) !== d.week) return null;
      d.days[dateKey] = Math.max(d.days[dateKey] || 0, Math.round((Number(heightM) || 0) * 10) / 10);
      if (dowOf(dateKey) <= 6 && !d.granted[dateKey] && turnsLeft() < SPAN.turnsMax) d.granted[dateKey] = 1;
      if (!(dateKey in d.rides)) d.rides[dateKey] = 0;   // (0: today's ride waits; >0: ridden)
      d.fell = { day: dateKey, who: [...new Set(fell)].filter((id) => castIds.includes(id)).slice(0, RIDE_MAX) };
      save();
      return this.view();
    },
    /** Today's ride: who's in the river (yours first, then strays to make up a ride) and how many are yours; null if done. */
    ride(dateKey = today()) {
      if (d.rides[dateKey] !== 0) return null;
      const mine = d.fell?.day === dateKey ? d.fell.who : [];
      const rng = createRng(`ry/${dateKey}`);
      const others = castIds.filter((id) => !mine.includes(id));
      const want = Math.max(RIDE_MIN, Math.min(RIDE_MAX, mine.length + 3)) - mine.length;
      const strays = [];
      while (strays.length < want && others.length) strays.push(others.splice(Math.floor(rng.next() * others.length), 1)[0]);
      return { who: [...mine, ...strays], mine: mine.length };
    },
    /** The ride is over: whoever was saved moves into the Weektoring (its free rooms first) and the town; coins for each. */
    rideDone(dateKey, rescued = []) {
      if (d.rides[dateKey] !== 0) return { placed: 0, coins: 0 };
      const n = Math.max(0, rescued.length | 0);
      d.rides[dateKey] = n || -1;
      const r = moveIn(d.floors, n);
      d.floors = r.floors;
      d.people += n;
      const coins = n ? earn(n * SPAN.coinsPerRescue) : 0;
      save();
      return { placed: r.placed, coins };
    },
    /** A build turn on the Weektoring: the floors to build on, the turn's seed (everyone's the same that day) and blocks. */
    turn(dateKey = today()) {
      if (turnsLeft() <= 0) return null;
      return { floors: d.floors, seed: `${dateKey}/${d.used + 1}`, blocks: SPAN.turnBlocks };
    },
    /** A build turn ended: its new floors join the tower (cleaned), the turn is used. Returns { added, heightM, gain }. */
    turnDone(newFloors, { by = 'me', skin = 'kleur', day = today() } = {}) {
      if (turnsLeft() <= 0) return null;
      const before = heightOf(d.floors);
      const next = addFloors(d.floors, (newFloors || []).slice(0, SPAN.turnBlocks), { max: SPAN.turnBlocks, by, day, skin });
      d.used += 1;
      if (next) {
        const peopleBefore = peopleIn(d.floors);
        d.floors = next;
        d.people += Math.max(0, peopleIn(next) - peopleBefore);
      }
      save();
      // (both to a tenth first: the sheet shows "20,6 m" and "+20,6 m", never "+20,7 m" beside "20,6 m")
      const h = Math.round(heightOf(d.floors) * 10) / 10;
      return { added: next ? newFloors.length : 0, heightM: h, gain: Math.round((h - Math.round(before * 10) / 10) * 10) / 10 };
    },
    /** Tests (?debug=1): a week's worth of floors, turns and days at once. */
    debugSet(patch) {
      Object.assign(d, patch);
      save();
    },
    weekOf: () => d.week,
    plusDays,
  };
}
