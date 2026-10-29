// (1.20) Ons dorp on the phone: your crew's week — the Weektoring, your build turns, the Dailies that count (ticket and
// bombs), today's rescue ride, the town's people, Saturday's river. The rules are js/core/span.js and js/core/weektower.js;
// the screens js/ui/dom.js and js/rivier/view.js; js/main.js runs the day (Daily → the river → the Weektoring).
//
// With the server (server/src/span.js; its front door says `span`) the crew, its tower and Saturday live there: this phone
// keeps a copy (the last answer) and its own id + key. Without it (an older Worker, or no internet at the start) it plays
// as a crew of one on this phone alone, as checkpoint 1 did. The ride's gate (once a day) and who fell off your Daily are
// always this phone's.
import { SPAN, weekOf, dowOf, weekStats, isSpanId, isSpanKey, newSpanId, newSpanKey } from './core/span.js';
import { addFloors, heightOf, moveIn, peopleIn, cleanFloor } from './core/weektower.js';
import { createRng } from './core/rng.js';
import { safeLocalStorage } from './core/storage.js';

const KEY = 'stapel.v1.span';
const MONUMENTS = 8;       // past weeks' towers kept here (height and the tower itself, newest first)
const RIDE_MIN = 6;        // people on a ride at least (strays make up the rest)...
const RIDE_MAX = 12;       // ...and at most
const TIMEOUT_MS = 9000;

const blank = (week) => ({ v: 1, week, floors: [], people: 0, days: {}, granted: {}, used: 0, rides: {}, rideM: {}, runs: {}, rideBest: 0, rideTop: 0, rideCount: 0, monuments: [], name: '', id: '', key: '', srv: null, queue: [] });

function clean(raw, week) {
  const d = blank(week);
  if (!raw || typeof raw !== 'object') return d;
  if (typeof raw.week === 'string') d.week = raw.week;
  if (Array.isArray(raw.floors)) d.floors = raw.floors.map(cleanFloor).filter(Boolean).slice(0, 600);
  d.people = Math.max(0, Math.min(1e6, raw.people | 0));
  for (const k of ['days', 'granted', 'rides', 'rideM', 'runs']) {
    if (raw[k] && typeof raw[k] === 'object') for (const [dk, v] of Object.entries(raw[k])) if (/^\d{4}-\d{2}-\d{2}$/.test(dk)) d[k][dk] = Number(v) || 0;
  }
  d.used = Math.max(0, Math.min(99, raw.used | 0));
  d.rideBest = Math.max(0, Math.min(1e6, raw.rideBest | 0));
  // (28 Oct 2026) the furthest ride ever and how many rides, for Statistiek: kept across the weeks
  d.rideTop = Math.max(d.rideBest, Math.min(1e6, raw.rideTop | 0));
  d.rideCount = Math.max(0, Math.min(1e7, raw.rideCount | 0));
  if (raw.rideRank && typeof raw.rideRank === 'object' && typeof raw.rideRank.day === 'string') d.rideRank = { day: raw.rideRank.day, rank: raw.rideRank.rank | 0, players: raw.rideRank.players | 0, m: raw.rideRank.m | 0 };
  if (Array.isArray(raw.monuments)) d.monuments = raw.monuments.filter((m) => m && typeof m.week === 'string').slice(0, MONUMENTS);
  d.name = typeof raw.name === 'string' ? raw.name.slice(0, 18) : '';
  if (isSpanId(raw.id) && isSpanKey(raw.key)) {
    d.id = raw.id;
    d.key = raw.key;
  }
  if (raw.srv && typeof raw.srv === 'object' && raw.srv.crew && Array.isArray(raw.srv.crew.floors)) d.srv = raw.srv;
  if (Array.isArray(raw.queue)) d.queue = raw.queue.filter((q) => q && typeof q.path === 'string').slice(-20);
  if (raw.fell && typeof raw.fell === 'object') d.fell = raw.fell;
  // (the crew's news seen so far, and the last Saturday prize and whether it was said: kept across restarts)
  d.seenN = Math.max(0, raw.seenN | 0);
  d.townSeen = !!raw.townSeen;
  if (raw.prizeSeen && typeof raw.prizeSeen === 'object') d.prizeSeen = { place: raw.prizeSeen.place | 0, coins: raw.prizeSeen.coins | 0, week: String(raw.prizeSeen.week || ''), shown: !!raw.prizeSeen.shown };
  return d;
}

/**
 * `castIds`: everyone who can be in the river; `earn(n, {prize})`: coins into the wallet (returns what was added);
 * `api()`: the server's address ('' without one); `who()`: { name, skin } now. `fetchImpl` for tests.
 */
export function createSpan({ backend = safeLocalStorage(), debug = false, castIds = [], earn = () => 0, today = () => new Date().toISOString().slice(0, 10), api = () => '', who = () => ({ name: '', skin: 'kleur' }), fetchImpl = (...a) => fetch(...a) } = {}) {
  const key = debug ? `${KEY}.debug` : KEY;
  let d = null;
  let online = false;      // the server answered with `span` and a sync went through
  let busy = null;          // (one sync at a time)
  const save = () => { try { backend?.setItem(key, JSON.stringify(d)); } catch { /* private window: this visit only */ } };
  function load() {
    const wk = weekOf(today());
    try {
      const s = backend?.getItem(key);
      d = clean(s ? JSON.parse(s) : null, wk);
    } catch {
      d = blank(wk);
    }
    if (!d.id) {
      d.id = newSpanId();
      d.key = newSpanKey();
    }
    roll(wk);
  }
  /** A new week (this phone's own copy): last week's tower becomes a monument, a new Weektoring starts. */
  function roll(wk) {
    if (d.week === wk) return;
    if (d.floors.length) d.monuments = [{ week: d.week, h: heightOf(d.floors), n: d.floors.length, floors: d.floors }, ...d.monuments].slice(0, MONUMENTS);
    Object.assign(d, { week: wk, floors: [], days: {}, granted: {}, used: 0, rides: {}, rideM: {}, runs: {}, rideBest: 0 });
    if (d.srv && d.srv.crew?.week !== wk) d.srv = null;   // (the server's last answer was last week's)
    save();
  }
  load();

  // ---------------------------------------------------------------------------------------------------- the server
  async function call(method, path, body = null) {
    const base = api();
    if (!base) throw new Error('offline');
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : 0;
    try {
      const res = await fetchImpl(`${base.replace(/\/$/, '')}${path}`, {
        method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify({ id: d.id, key: d.key, ...(body || {}) }) : undefined, signal: ctl?.signal,
      });
      const out = await res.json().catch(() => ({}));
      return { ...out, status: res.status };
    } finally {
      clearTimeout(timer);
    }
  }
  /** Is the server's Ons dorp there? (its front door says `span`) Then a first sync. */
  async function start() {
    try {
      const base = api();
      if (!base) return false;
      // (a server that doesn't answer in time: this visit plays on this phone alone)
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : 0;
      const res = await fetchImpl(`${base.replace(/\/$/, '')}/`, { method: 'GET', signal: ctl?.signal }).finally(() => clearTimeout(timer));
      const j = await res.json().catch(() => ({}));
      if (!j || !j.span) return false;
      return !!(await sync());
    } catch {
      return false;
    }
  }
  /** Everything this phone knows that the server should, and the server's answer kept (the crew, Saturday, a prize). */
  async function sync() {
    if (busy) return busy;
    busy = (async () => {
      try {
        const w = who();
        const r = await call('POST', '/span/sync', { name: w.name || '', skin: w.skin || 'kleur', days: d.days, tower: w.tower || undefined });
        if (r.status !== 200 || !r.crew) return null;
        online = true;
        d.srv = { me: r.me, crew: r.crew, river: r.river || null, phase: r.phase, crane: r.crane, today: r.today, at: Date.now() };
        if (r.me?.prize && r.me.prize.coins > 0) {
          try { earn(r.me.prize.coins, { prize: true }); } catch { /* the wallet's own business */ }
          d.prizeSeen = { ...r.me.prize, shown: false };
        }
        // rides and turns' floors made while the server couldn't be reached
        const q = d.queue;
        d.queue = [];
        for (const item of q) {
          const a = await call('POST', item.path, item.body).catch(() => null);
          if (a?.status === 200 && a.crew) {
            d.srv.crew = a.crew;
            if (a.me) d.srv.me = { ...d.srv.me, ...a.me };
          } else if (!a || a.status >= 500) d.queue.push(item);
        }
        save();
        return d.srv;
      } catch {
        return null;
      } finally {
        busy = null;
      }
    })();
    return busy;
  }

  /** Build turns this phone counts itself (no server): one per finished Daily (Mon-Sat), at most SPAN.turnsMax. */
  const turnsLeft = () => Math.max(0, Object.values(d.granted).reduce((s, n) => s + n, 0) - d.used);
  const S = () => (online && d.srv?.crew ? d.srv : null);

  return {
    start,
    sync,
    get online() { return online; },
    get id() { return d.id; },
    /** What the screens show. */
    view() {
      roll(weekOf(today()));
      const day = today();
      const ws = weekStats(d.days, d.week, d.rideM);
      const sv = S();
      // (the endless river: this week's metres down it, all rides together, and your best single ride)
      const rm = Object.entries(d.rideM || {}).filter(([k]) => weekOf(k) === d.week).map(([, v]) => v | 0);
      const base = { rideToday: d.rides[day] === 0, rodeToday: day in d.rides && d.rides[day] !== 0, dow: dowOf(day), online: !!sv, rideBest: d.rideBest | 0, rideTop: d.rideTop | 0, rideCount: d.rideCount | 0, rideMetres: rm.reduce((a, b) => a + b, 0), rideRank: d.rideRank?.day === day ? d.rideRank : null };
      if (sv) {
        const c = sv.crew;
        // (Saturday from noon the crane builds no new floors: turns wait for nothing; repairs go on. The server says.)
        const craneShut = sv.crane === false;
        return {
          ...base, week: c.week, floors: c.floors, heightM: heightOf(c.floors), people: c.people | 0, name: c.name, craneShut,
          turns: craneShut ? 0 : sv.me.turns | 0, ticket: !!sv.me.ticket, weekdays: sv.me.weekdays | 0, bombs: sv.me.bombs | 0, metres: sv.me.metres || 0,
          bombsWeek: sv.me.bombsWeek ?? (sv.me.bombs | 0),
          monuments: c.monuments || [], crew: c, river: sv.river, phase: sv.phase, me: sv.me, inRiver: c.inRiver | 0, repair: c.repair | 0,
          // (news since this phone last opened the town, what you did yourself left out)
          news: (c.news || []).filter((n) => n.n > (d.seenN | 0) && !(n.who && n.who === sv.me?.name && n.kind !== 'bombed')),
        };
      }
      return {
        ...base, week: d.week, floors: d.floors, heightM: heightOf(d.floors), people: d.people, name: d.name,
        turns: turnsLeft(), ticket: ws.ticket, weekdays: ws.weekdays, bombs: ws.bombs, metres: ws.metres, bombsWeek: ws.bombs,
        monuments: d.monuments, crew: null, river: null, phase: null, me: null, inRiver: 0, repair: 0, news: [],
      };
    },
    /** Saturday's prize, once, for the screen to celebrate ({ place, coins, week }); null when there's none new. */
    prizeNew() {
      const pz = d.prizeSeen;
      if (!pz || pz.shown) return null;
      pz.shown = true;
      save();
      return { place: pz.place | 0, coins: pz.coins | 0, week: pz.week };
    },
    /** Is this the phone's first visit to the town? (true once; after that false) */
    firstTown() {
      if (d.townSeen) return false;
      d.townSeen = true;
      save();
      return true;
    },
    /** The town was opened: its news so far is seen. */
    newsSeen() {
      const c = S()?.crew;
      const top = Math.max(0, ...(c?.news || []).map((n) => n.n | 0));
      if (top > (d.seenN | 0)) {
        d.seenN = top;
        save();
      }
    },
    /**
     * A Daily was finished (`fell`: who jumped out of its floors). It counts for the week (its best height), gives a build
     * turn (Mon-Sat, once a day, while fewer than SPAN.turnsMax wait) and opens today's ride (once a day). The server hears it.
     */
    dailyDone(dateKey, heightM, fell = []) {
      roll(weekOf(today()));
      if (weekOf(dateKey) !== d.week) return null;
      d.days[dateKey] = Math.max(d.days[dateKey] || 0, Math.round((Number(heightM) || 0) * 10) / 10);
      if (dowOf(dateKey) <= 6 && !d.granted[dateKey] && turnsLeft() < SPAN.turnsMax) d.granted[dateKey] = 1;
      if (!(dateKey in d.rides)) d.rides[dateKey] = 0;   // (0: today's ride waits; else: ridden)
      d.fell = { day: dateKey, who: [...new Set(fell)].filter((id) => castIds.includes(id)).slice(0, RIDE_MAX) };
      save();
      if (online) sync();
      return this.view();
    },
    /**
     * Today's ride: who's in the river (yours first, then strays — a crew's people that bombs knocked in come along as
     * `fromRiver`) and how many are yours; null when it's done.
     */
    ride(dateKey = today()) {
      if (d.rides[dateKey] !== 0) return null;
      const mine = d.fell?.day === dateKey ? d.fell.who : [];
      const rng = createRng(`ry/${dateKey}`);
      const others = castIds.filter((id) => !mine.includes(id));
      const fromRiver = Math.min(Math.max(0, RIDE_MAX - mine.length), S()?.crew?.inRiver | 0);
      const want = Math.max(RIDE_MIN, Math.min(RIDE_MAX, mine.length + Math.max(3, fromRiver))) - mine.length;
      const strays = [];
      while (strays.length < want && others.length) strays.push(others.splice(Math.floor(rng.next() * others.length), 1)[0]);
      return { who: [...mine, ...strays], mine: mine.length, fromRiver };
    },
    /** A ride is starting: the server's ticket (it times the ride), or '' (offline). */
    async rideStart() {
      if (!online) return '';
      const r = await call('POST', '/span/ride-start', {}).catch(() => null);
      return r?.status === 200 && typeof r.ticket === 'string' ? r.ticket : '';
    },
    /** Afgly's daily ranking from the server ({ day, players, top, you }), or null (offline, no server). `hidden`: the
     * Daily ranking's "show me" switch, passed on to today's and yesterday's rows. */
    async rideBoard(dateKey = today(), hidden = undefined) {
      if (!online) return null;
      const r = await call('POST', '/span/board', { day: dateKey, ...(typeof hidden === 'boolean' ? { hidden } : {}) }).catch(() => null);
      if (r?.status !== 200 || !Array.isArray(r.top)) return null;
      if (r.you) {
        d.rideRank = { day: dateKey, rank: r.you.rank | 0, players: r.players | 0, m: r.you.m | 0 };
        save();
      }
      return r;
    },
    /**
     * A free ride down the river (any time, as often as you like: the owner, 24 Oct 2026, "The game mode needs to be
     * available at all times"): nobody of yours in it, just the metres. Its own river each time.
     */
    freeRide(dateKey = today()) {
      return { who: [], mine: 0, fromRiver: 0, extra: true, seed: `${dateKey}/${(d.runs[dateKey] | 0) + 1}` };
    },
    /**
     * The ride is over: whoever was saved moves into the Weektoring (its free rooms first) and the town; coins for each.
     * The metres count for the week (Saturday's shots, the crew's river metres). `extra`: a free ride (metres only).
     */
    async rideDone(dateKey, rescued = [], fromRiver = 0, metres = 0, extra = false, { durationMs = 0, hidden = false, ticket = '', rid = '' } = {}) {
      const m = Math.max(0, Math.min(40000, metres | 0));
      // (the server's answer: the crew, and your own week as it counts it now: the shots, the metres)
      const keepMe = (r) => { if (r?.me && d.srv) d.srv.me = { ...d.srv.me, ...r.me }; };
      // (Afgly's daily ranking: the server's answer, kept for the menu)
      const keepRank = (r) => {
        if (r?.board?.you) d.rideRank = { day: dateKey, rank: r.board.you.rank | 0, players: r.board.players | 0, m: r.board.you.m | 0 };
        return r?.board || null;
      };
      if (extra) {
        d.rideM[dateKey] = (d.rideM[dateKey] | 0) + m;
        d.runs[dateKey] = (d.runs[dateKey] | 0) + 1;
        d.rideBest = Math.max(d.rideBest | 0, m);
        d.rideTop = Math.max(d.rideTop | 0, m);
        d.rideCount = (d.rideCount | 0) + 1;
        save();
        if (online && m > 0) {
          const body = { day: dateKey, rescued: 0, metres: m, extra: true, durationMs: Math.round(durationMs), hidden: !!hidden, ticket: String(ticket || ''), rid: String(rid || '') };
          const r = await call('POST', '/span/ride', body).catch(() => null);
          if (r?.status === 200 && r.crew && d.srv) { d.srv.crew = r.crew; keepMe(r); }
          else if (!r || r.status >= 500) d.queue.push({ path: '/span/ride', body });
          const board = keepRank(r);
          save();
          return { placed: 0, coins: 0, board };
        }
        return { placed: 0, coins: 0, board: null };
      }
      if (d.rides[dateKey] !== 0) return { placed: 0, coins: 0 };
      const n = Math.max(0, rescued.length | 0);
      d.rides[dateKey] = n || -1;
      d.rideM[dateKey] = (d.rideM[dateKey] | 0) + m;
      d.rideBest = Math.max(d.rideBest | 0, m);
      d.rideTop = Math.max(d.rideTop | 0, m);
      d.rideCount = (d.rideCount | 0) + 1;
      const coins = n ? earn(n * SPAN.coinsPerRescue) : 0;
      if (online) {
        const body = { day: dateKey, rescued: n, fromRiver: Math.min(fromRiver | 0, n), metres: m, durationMs: Math.round(durationMs), hidden: !!hidden, ticket: String(ticket || ''), rid: String(rid || 'r') };
        const r = await call('POST', '/span/ride', body).catch(() => null);
        if (r?.status === 200 && r.crew && d.srv) { d.srv.crew = r.crew; keepMe(r); }
        else if (!r || r.status >= 500) d.queue.push({ path: '/span/ride', body });
        const board = keepRank(r);
        save();
        return { placed: n, coins, board };
      }
      const mv = moveIn(d.floors, n);
      d.floors = mv.floors;
      d.people += n;
      save();
      return { placed: mv.placed, coins };
    },
    /**
     * A build turn on the Weektoring: { floors, seed, blocks, lease } or { error } ('busy' with who's building, 'noturn',
     * 'ticket', 'kroning', 'offline'). With the server: the crane is leased (one builder at a time). `repair`: Saturday's
     * repair blocks instead of a turn.
     */
    async turn(dateKey = today(), { repair = false } = {}) {
      if (online) {
        const r = await call('POST', '/span/lease', { repair }).catch(() => null);
        if (!r) return { error: 'offline' };
        if (r.status !== 200) {
          if (r.error === 'crane' && d.srv) d.srv.crane = false;
          return { error: r.error || 'server', by: r.by || '' };
        }
        return { floors: r.floors, seed: r.seed, blocks: r.blocks, lease: r.lease, repair: !!r.repair };
      }
      if (turnsLeft() <= 0) return { error: 'noturn' };
      return { floors: d.floors, seed: `${dateKey}/${d.used + 1}`, blocks: SPAN.turnBlocks };
    },
    /** A build turn ended: its new floors join the tower (cleaned), the turn is used. { added, heightM, gain } or { error }. */
    async turnDone(newFloors, { skin = 'kleur', day = today(), lease = null } = {}) {
      const list = (newFloors || []).slice(0, SPAN.turnBlocks);
      if (online && lease) {
        const r = await call('POST', '/span/build', { lease, floors: list }).catch(() => null);
        if (r?.status === 200 && r.crew) {
          d.srv.crew = r.crew;
          if (r.me) d.srv.me = r.me;
          save();
          return { added: r.added | 0, heightM: Math.round(heightOf(r.crew.floors) * 10) / 10, gain: r.gain || 0 };
        }
        // (no connection at the end of a turn: the floors wait on this phone and go with the next sync, on the same lease)
        if (!r || r.status >= 500) {
          d.queue.push({ path: '/span/build', body: { lease, floors: list } });
          save();
          return { queued: true, added: list.length };
        }
        return { error: r?.error || 'offline' };
      }
      if (turnsLeft() <= 0) return null;
      const before = heightOf(d.floors);
      const next = addFloors(d.floors, list, { max: SPAN.turnBlocks, by: 'me', day, skin });
      d.used += 1;
      if (next) {
        const peopleBefore = peopleIn(d.floors);
        d.floors = next;
        d.people += Math.max(0, peopleIn(next) - peopleBefore);
      }
      save();
      // (both to a tenth first: the sheet shows "20,6 m" and "+20,6 m", never "+20,7 m" beside "20,6 m")
      const h = Math.round(heightOf(d.floors) * 10) / 10;
      return { added: next ? list.length : 0, heightM: h, gain: Math.round((h - Math.round(before * 10) / 10) * 10) / 10 };
    },
    // -------------------------------------------------------------------------------------------- the crew (server only)
    async crewCall(path, body = {}) {
      if (!online) return { error: 'offline' };
      const r = await call('POST', path, body).catch(() => null);
      if (!r) return { error: 'offline' };
      if (r.status !== 200) return { ...r, error: r.error || 'server' };
      await sync();
      return r;
    },
    make(name, force = false) { return this.crewCall('/span/make', { name, force }); },
    join(invite) { return this.crewCall('/span/join', { invite }); },
    leave() { return this.crewCall('/span/leave'); },
    remove(whoId) { return this.crewCall('/span/remove', { who: whoId }); },
    rename(name) { return this.crewCall('/span/rename', { name }); },
    /** The crew an invite code is for (its name, how many): { name, n, full, names } or { error }. */
    async invite(code) {
      const r = await call('GET', `/span/invite/${encodeURIComponent(code)}`).catch(() => null);
      return r && r.status === 200 ? r : { error: r?.error || 'offline' };
    },
    /** Saturday: bombs on the tallest tower of your river: { hits, river, me } or { error, leader }. */
    async bomb(target, hits) {
      const r = await call('POST', '/span/bomb', { target, hits }).catch(() => null);
      if (!r) return { error: 'offline' };
      if (r.status !== 200) return { error: r.error || 'server', leader: r.leader || null };
      if (d.srv) {
        if (r.river) d.srv.river = r.river;
        if (r.me) d.srv.me = r.me;
        save();
      }
      return r;
    },
    /** Tests (?debug=1): a week's worth of floors, turns and days at once. */
    debugSet(patch) {
      Object.assign(d, patch);
      save();
    },
  };
}
