// Persistent player data (settings, daily results, streaks, practice best, coins and looks).
// Everything lives in one JSON blob under STORAGE_KEY. The in-memory copy is
// the source of truth, so a missing or throwing localStorage (private mode,
// quota, blocked cookies) never breaks the game — it just won't persist.

import { STORAGE_KEY } from '../config.js';
import { dateKeyFor, dayNumber, addDays, daysBetween, isDateKey } from './daily.js';
import { cleanVisits } from './visitorrules.js';
import { cleanNickname } from './duel.js';
import { WEEK, cleanWeek, openBox, addShield } from './week.js';
import { DAILY_RETRY } from '../config.js';
import {
  defaultEconomy, cleanEconomy, earnCoins, buyPowerup, usePowerup, buyCosmetic, wearCosmetic, grantRankLooks, spendCoins,
  rankAfterMatch, rolloverSeason, seasonOf, cardOf, ladderAt, bestTier, RANK_MODES, RANK_RULES, cleanModeRank,
  rankIndex,
} from './economy.js';

const SCHEMA = 1;
const SETTING_KEYS = ['sound', 'vibration', 'reducedMotion', 'highContrast', 'howtoSeen'];
const HISTORY_DAYS = 7;
const KEEP_DAILY_DAYS = 90; // older finished entries are pruned (stats are aggregated separately) to keep writes cheap

// --- Backends -------------------------------------------------------------------

/** Simple Storage-like object kept in memory. */
export function memoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

/** window.localStorage if it exists and accepts writes, else an in-memory backend. */
export function safeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = '__stapel_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    // Access denied / quota exceeded — fall through.
  }
  return memoryBackend();
}

// --- Pure helpers ------------------------------------------------------------------

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const int = (v, d = 0) => Math.max(0, Math.round(num(v, d)));
const round1 = (x) => Math.round(x * 10) / 10;

function prefersReducedMotion() {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}

/** Streak after finishing `dateKey`: consecutive day => +1, same day => unchanged, gap => 1. */
export function streakAfter(prevLastDateKey, prevStreak, dateKey) {
  const prev = int(prevStreak);
  if (!prevLastDateKey || !isDateKey(prevLastDateKey)) return 1;
  const d = daysBetween(prevLastDateKey, dateKey);
  if (d === 0) return prev;
  if (d === 1) return prev + 1;
  if (d < 0) return prev; // finishing an older day (out of order) never breaks the streak
  return 1;
}

/** Streak as shown to the player on `todayKey`: 0 once a whole day was missed. */
export function displayStreak(lastDateKey, streak, todayKey) {
  if (!lastDateKey || !isDateKey(lastDateKey) || !isDateKey(todayKey)) return 0;
  return daysBetween(lastDateKey, todayKey) <= 1 ? int(streak) : 0;
}

/** Fill in a (partial) Result so storage and share code can rely on its shape. */
export function normalizeResult(r, dateKey = null) {
  const src = r && typeof r === 'object' ? r : {};
  const key = isDateKey(src.dateKey) ? src.dateKey : dateKey;
  return {
    mode: src.mode === 'practice' ? 'practice' : 'daily',
    dateKey: key ?? null,
    dayNumber: Number.isInteger(src.dayNumber) ? src.dayNumber : key ? dayNumber(key) : null,
    seed: typeof src.seed === 'string' ? src.seed : '',
    reason: ['lives', 'flood', 'quit'].includes(src.reason) ? src.reason : 'quit',
    score: int(src.score),
    heightM: round1(Math.max(0, num(src.heightM))),
    blocksPlaced: int(src.blocksPlaced),
    blocksDropped: int(src.blocksDropped),
    perfects: int(src.perfects),
    maxCombo: int(src.maxCombo),
    grid: typeof src.grid === 'string' ? src.grid : '',
    weather: Array.isArray(src.weather) ? src.weather.filter((w) => typeof w === 'string') : [],
    visitors: cleanVisits(src.visitors),
    durationMs: int(src.durationMs),
  };
}

function defaultData() {
  return {
    v: SCHEMA,
    settings: {},
    tutorialSeen: false,
    daily: {},
    stats: {
      played: 0, streak: 0, maxStreak: 0, bestScore: 0, bestHeightM: 0, totalPerfects: 0, lastDateKey: null,
    },
    practice: { played: 0, heightM: 0, score: 0 },
    duel: { name: null, played: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, mode: 'race' },
  };
}

/** Rebuild a trustworthy data object from whatever was stored. */
function sanitize(raw) {
  const d = defaultData();
  if (!raw || typeof raw !== 'object') return d;

  if (raw.settings && typeof raw.settings === 'object') {
    for (const k of SETTING_KEYS) if (typeof raw.settings[k] === 'boolean') d.settings[k] = raw.settings[k];
  }
  d.tutorialSeen = raw.tutorialSeen === true;

  if (raw.daily && typeof raw.daily === 'object') {
    for (const [key, e] of Object.entries(raw.daily)) {
      if (!isDateKey(key) || !e || (e.status !== 'playing' && e.status !== 'done')) continue;
      d.daily[key] = {
        status: e.status,
        result: normalizeResult(e.result, key),
        startedAt: num(e.startedAt, null),
        finishedAt: num(e.finishedAt, null),
        ...(e.status === 'playing' ? { owner: typeof e.owner === 'string' ? e.owner : null, beatAt: num(e.beatAt, null) } : {}),
        ...(e.newBest && typeof e.newBest === 'object'
          ? { newBest: { height: e.newBest.height === true, score: e.newBest.score === true } }
          : {}),
      };
    }
  }

  const s = raw.stats;
  if (s && typeof s === 'object') {
    d.stats = {
      played: int(s.played),
      streak: int(s.streak),
      maxStreak: int(s.maxStreak),
      bestScore: int(s.bestScore),
      bestHeightM: round1(Math.max(0, num(s.bestHeightM))),
      totalPerfects: int(s.totalPerfects),
      lastDateKey: isDateKey(s.lastDateKey) ? s.lastDateKey : null,
    };
    d.stats.maxStreak = Math.max(d.stats.maxStreak, d.stats.streak);
  }

  const p = raw.practice;
  if (p && typeof p === 'object') {
    d.practice = { played: int(p.played), heightM: round1(Math.max(0, num(p.heightM))), score: int(p.score) };
  }

  const u = raw.duel;
  if (u && typeof u === 'object') {
    d.duel = {
      name: cleanNickname(u.name),
      played: int(u.played),
      wins: int(u.wins),
      losses: int(u.losses),
      streak: int(u.streak),
      bestStreak: int(u.bestStreak),
      mode: u.mode === 'turns' ? 'turns' : 'race',   // the last way chosen: Wedloop or Blok vir Blok (1.11)
    };
    d.duel.played = Math.max(d.duel.played, d.duel.wins + d.duel.losses);
    d.duel.bestStreak = Math.max(d.duel.bestStreak, d.duel.streak);
  }
  return d;
}

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const laterKey = (a, b) => (!a ? b : !b ? a : daysBetween(a, b) > 0 ? b : a);

// --- Store -----------------------------------------------------------------------

/**
 * @param backend Storage-like { getItem, setItem, removeItem } (may throw — that's fine).
 * @param opts.now () => epoch ms (injectable for tests).
 * @param opts.key storage key (debug sessions use their own, so they never touch real stats).
 */
export function createStore(backend = safeLocalStorage(), { now = () => Date.now(), key = STORAGE_KEY } = {}) {
  const be = backend || memoryBackend();
  const storeKey = key;
  // The wallet (coins, power-ups, looks, rank: js/core/economy.js) has a key of its own. A page still
  // running an older version rebuilds the main blob from the keys it knows, which would drop it.
  const econKey = `${key}.econ`;
  // (1.12) The ranks per mode have a key of their own too: a page still on 1.11 rebuilds the wallet from
  // what it knows and would write the old single rank back over them.
  const ranksKey = `${key}.ranks`;
  // (1.12) "Nog 'n kans": the second daily tries, a key of their own too (an older version rebuilding the
  // main blob would drop them): { [dateKey]: { status: 'ready'|'playing'|'done', result, ... } }
  const retryKey = `${key}.retry`;
  // The language ('af' / 'en') too: js/core/langboot.js reads it before anything else loads.
  const langKey = `${key}.lang`;
  // The daily leaderboard (js/board.js): this phone's random player number, whether to show it, the
  // last day whose result was posted, and whether a name or hiding change hasn't reached the server
  // yet. Its own key too (an older version would drop it).
  const boardKey = `${key}.board`;
  const PLAYER_RE = /^[a-z0-9]{12,32}$/;
  function readBoard() {
    try {
      const v = JSON.parse(readRaw(boardKey) || 'null');
      return {
        player: typeof v?.player === 'string' && PLAYER_RE.test(v.player) ? v.player : null,
        hidden: v?.hidden === true,
        posted: isDateKey(v?.posted) ? v.posted : null,
        pending: v?.pending === true,
      };
    } catch {
      return { player: null, hidden: false, posted: null, pending: false };
    }
  }
  function writeBoard(b) {
    try {
      be.setItem(boardKey, JSON.stringify(b));
    } catch {
      // private mode: the board still works for this visit
    }
  }
  // The daily reminder (the Android app): the time the player chose ('HH:MM', or null: off) and
  // whether they were asked. Its own key.
  const remindKey = `${key}.remind`;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  function readRemind() {
    try {
      const v = JSON.parse(readRaw(remindKey) || 'null');
      return { time: typeof v?.time === 'string' && TIME_RE.test(v.time) ? v.time : null, asked: v?.asked === true };
    } catch {
      return { time: null, asked: false };
    }
  }

  // Die weekkis (js/core/week.js): this week's boxes, Reeksskilde, full weeks. Its own key too.
  const weekKey = `${key}.week`;
  function readWeek() {
    try {
      return cleanWeek(JSON.parse(readRaw(weekKey) || 'null'));
    } catch {
      return cleanWeek(null);
    }
  }
  function writeWeek(w) {
    try {
      be.setItem(weekKey, JSON.stringify(cleanWeek(w)));
    } catch {
      // private mode: the box still opens for this visit
    }
  }
  let data = defaultData();
  let econ = defaultEconomy();
  let lastRaw = null;
  let lastEconRaw = null;
  let lastRanksRaw = null;
  let retries = {};
  let lastRetryRaw = null;

  function readRaw(k = storeKey) {
    try {
      const raw = be.getItem(k);
      return typeof raw === 'string' ? raw : null;
    } catch {
      return undefined; // unreadable: keep what we have in memory
    }
  }

  // Pick up changes made by another tab; keep memory if storage is unreadable.
  function sync() {
    const raw = readRaw();
    if (raw !== undefined && raw !== lastRaw) {
      lastRaw = raw;
      try {
        data = raw === null ? defaultData() : sanitize(JSON.parse(raw));
      } catch {
        data = defaultData();
      }
    }
    const er = readRaw(econKey);
    let reloaded = false;
    if (er !== undefined && er !== lastEconRaw) {
      lastEconRaw = er;
      reloaded = true;
      try {
        econ = cleanEconomy(er === null ? null : JSON.parse(er));
      } catch {
        econ = defaultEconomy();
      }
    }
    const tr = readRaw(retryKey);
    if (tr !== undefined && tr !== lastRetryRaw) {
      lastRetryRaw = tr;
      retries = cleanRetries(tr);
    }
    // the ranks' own key wins over whatever the wallet blob says (a missing key: the wallet's, kept from now on)
    const rr = readRaw(ranksKey);
    if (rr === undefined || (!reloaded && rr === lastRanksRaw)) return;
    lastRanksRaw = rr;
    if (rr === null) {
      persistRanks();
      return;
    }
    try {
      const o = JSON.parse(rr);
      econ.ranks = { race: cleanModeRank(o?.race), turns: cleanModeRank(o?.turns) };
    } catch {
      persistRanks();
    }
  }

  function cleanRetries(raw) {
    const out = {};
    let o = null;
    try {
      o = raw ? JSON.parse(raw) : null;
    } catch {
      o = null;
    }
    if (!o || typeof o !== 'object') return out;
    for (const [k, r] of Object.entries(o)) {
      if (!isDateKey(k) || !r || !['ready', 'playing', 'done'].includes(r.status)) continue;
      out[k] = {
        status: r.status,
        result: r.status === 'ready' ? null : normalizeResult(r.result, k),
        startedAt: num(r.startedAt, null),
        finishedAt: num(r.finishedAt, null),
        beatAt: num(r.beatAt, null),
        owner: typeof r.owner === 'string' ? r.owner : null,
      };
    }
    return out;
  }

  function persistRetry() {
    const raw = JSON.stringify(retries);
    try {
      be.setItem(retryKey, raw);
      lastRetryRaw = raw;
    } catch {
      // Quota / private mode: keep playing from memory.
    }
  }

  /** The better of two results (height first, then points). */
  const better = (a, b) => (!b ? a : !a ? b : (b.heightM > a.heightM || (b.heightM === a.heightM && b.score > a.score)) ? b : a);

  /** A day's result that counts: the better of the first try and a finished second one ({ ...result, retried }). */
  function bestOf(dateKey) {
    const e = data.daily[dateKey];
    if (!e || e.status !== 'done' || !e.result) return null;
    const r = retries[dateKey];
    const second = r && r.status === 'done' ? r.result : null;
    return { ...better(e.result, second), retried: !!second };
  }

  /** The second try ends: it joins the day (the better one counts), its records count; no streak, no coins. */
  function finishRetryEntry(dateKey, result) {
    const r = retries[dateKey];
    if (!r || r.status === 'done') return { applied: false, flags: { height: false, score: false } };
    const merged = normalizeResult({ ...(r.result || {}), ...(result || {}) }, dateKey);
    merged.mode = 'daily';
    const s = data.stats;
    const flags = { height: merged.heightM > s.bestHeightM, score: merged.score > s.bestScore };
    s.totalPerfects += merged.perfects;
    s.bestHeightM = Math.max(s.bestHeightM, merged.heightM);
    s.bestScore = Math.max(s.bestScore, merged.score);
    retries[dateKey] = { ...r, status: 'done', result: merged, finishedAt: now(), owner: null };
    return { applied: true, flags };
  }

  function persistRanks() {
    const raw = JSON.stringify(econ.ranks);
    try {
      be.setItem(ranksKey, raw);
      lastRanksRaw = raw;
    } catch {
      // Quota / private mode: keep playing from memory.
    }
  }

  function persist() {
    const raw = JSON.stringify(data);
    try {
      be.setItem(storeKey, raw);
      lastRaw = raw;
    } catch {
      // Quota / private mode: keep playing from memory.
    }
  }

  function persistEcon() {
    const raw = JSON.stringify(econ);
    try {
      be.setItem(econKey, raw);
      lastEconRaw = raw;
    } catch {
      // Quota / private mode: keep playing from memory.
    }
    persistRanks();
  }

  const today = () => dateKeyFor(new Date(now()));

  function statsFor(todayKey) {
    const s = data.stats;
    const history = [];
    for (let k = HISTORY_DAYS - 1; k >= 0; k--) {
      const key = addDays(todayKey, -k);
      const best = bestOf(key);   // (1.12: the better of two tries)
      history.push({
        dateKey: key,
        dayNumber: dayNumber(key),
        heightM: best ? best.heightM : null,
        score: best ? best.score : null,
      });
    }
    return {
      played: s.played,
      currentStreak: displayStreak(s.lastDateKey, s.streak, todayKey),
      maxStreak: s.maxStreak,
      bestScore: s.bestScore,
      bestHeightM: s.bestHeightM,
      totalPerfects: s.totalPerfects,
      lastDateKey: s.lastDateKey,
      history,
    };
  }

  function prune(refKey) {
    for (const [key, e] of Object.entries(data.daily)) {
      if (e.status === 'done' && daysBetween(key, refKey) > KEEP_DAILY_DAYS) delete data.daily[key];
    }
    let gone = false;
    for (const key of Object.keys(retries)) {
      if (daysBetween(key, refKey) > KEEP_DAILY_DAYS) {
        delete retries[key];
        gone = true;
      }
    }
    if (gone) persistRetry();
  }

  /** Consecutive finished days ending at `key` (bounded by the kept history). */
  function streakEndingAt(key) {
    let n = 0;
    let k = key;
    while (data.daily[k] && data.daily[k].status === 'done' && n <= KEEP_DAILY_DAYS) {
      n++;
      k = addDays(k, -1);
    }
    return n;
  }

  // Finalise one daily entry (no sync/persist; callers do that).
  function finishEntry(dateKey, result) {
    const existing = data.daily[dateKey];
    if (existing && existing.status === 'done') {
      return { applied: false, flags: existing.newBest || { height: false, score: false } };
    }
    const merged = normalizeResult({ ...(existing ? existing.result : {}), ...(result || {}) }, dateKey);
    merged.mode = 'daily';

    const s = data.stats;
    const hadPlayed = s.played > 0;
    const flags = {
      height: hadPlayed && merged.heightM > s.bestHeightM,
      score: hadPlayed && merged.score > s.bestScore,
    };
    s.played += 1;
    s.totalPerfects += merged.perfects;
    s.bestHeightM = Math.max(s.bestHeightM, merged.heightM);
    s.bestScore = Math.max(s.bestScore, merged.score);
    // A last day in the future (phone clock was ahead, or a trip east) must not
    // freeze the streak once today's real date is played.
    const realToday = today();
    const bogusLast = !!s.lastDateKey && daysBetween(realToday, s.lastDateKey) > 1
      && Math.abs(daysBetween(realToday, dateKey)) <= 1;
    if (!bogusLast && (!s.lastDateKey || daysBetween(s.lastDateKey, dateKey) >= 0)) {
      s.streak = streakAfter(s.lastDateKey, s.streak, dateKey);
      s.lastDateKey = dateKey;
    }

    data.daily[dateKey] = {
      status: 'done',
      result: merged,
      startedAt: existing ? existing.startedAt : now(),
      finishedAt: now(),
      newBest: flags,
    };
    if (bogusLast) {
      s.lastDateKey = dateKey;
      s.streak = streakEndingAt(dateKey);
    }
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    return { applied: true, flags };
  }

  /** Run an economy step on the latest wallet (another tab may have changed it) and keep it. Returns { ok, economy }. */
  function apply(step) {
    sync();
    const r = step(econ);
    if (r.ok) {
      econ = r.economy;
      persistEcon();
    }
    return { ok: r.ok, economy: clone(econ) };
  }

  /** (1.12) A mode's rank as this month sees it: a new month drops it a tier and leaves last season's badge (`reward`). */
  const modeOf = (m) => (m === 'turns' ? 'turns' : 'race');
  const seasonNow = (mode) => rolloverSeason(econ.ranks[modeOf(mode)], seasonOf(today()));
  /** A new month for both modes, kept (the badges and looks handed out); returns the first badge earned, or null. */
  const rollSeasons = () => {
    let reward = null;
    let changed = false;
    for (const m of RANK_MODES) {
      const rolled = seasonNow(m);
      if (rolled.rank.season !== econ.ranks[m].season || rolled.rank.points !== econ.ranks[m].points) {
        econ.ranks[m] = rolled.rank;
        changed = true;
      }
      if (rolled.reward) {
        econ = grantRankLooks(econ, null, { badge: rolled.reward });
        // (the toast names the best badge of the two modes)
        if (!reward || rankIndex(rolled.reward.slice(2)) > rankIndex(reward.slice(2))) reward = rolled.reward;
      }
    }
    if (changed) {
      econ = grantRankLooks(econ, bestTier(econ));
      persistEcon();
    }
    return reward;
  };
  /** What the screens show of a mode's rank. */
  const rankView = (mode, extra = {}) => {
    const r = econ.ranks[modeOf(mode)];
    const now = ladderAt(r.points);
    return {
      mode: modeOf(mode), season: r.season, points: r.points, id: now.id, tier: now.tier, div: now.div, elite: !!now.elite,
      emoji: now.emoji, pct: now.pct, next: now.next ? now.next.id : null, toNext: now.toNext, best: r.best,
      played: r.played, placementLeft: Math.max(0, RANK_RULES.placement - r.played), shield: r.shield,
      badges: econ.owned.badge.filter((b) => b.startsWith('s-')), ...extra,
    };
  };

  sync();

  const api = {
    getSettings() {
      sync();
      return { sound: true, vibration: true, reducedMotion: prefersReducedMotion(), highContrast: false, ...data.settings };
    },

    setSettings(partial) {
      sync();
      if (partial && typeof partial === 'object') {
        for (const k of SETTING_KEYS) if (k in partial) data.settings[k] = !!partial[k];
        persist();
      }
      return api.getSettings();
    },

    tutorialSeen() {
      sync();
      return data.tutorialSeen;
    },

    markTutorialSeen() {
      sync();
      if (!data.tutorialSeen) {
        data.tutorialSeen = true;
        persist();
      }
    },

    getDaily(dateKey) {
      sync();
      return clone(data.daily[dateKey] || null);
    },

    /** dateKey -> height (m) of every finished daily in the last `days` days up to `todayKey` (for the Stapelstad skyline). */
    getDailyHeights(todayKey = today(), days = 30) {
      sync();
      const out = {};
      const ref = isDateKey(todayKey) ? todayKey : today();
      for (let k = 0; k < days; k++) {
        const key = addDays(ref, -k);
        const best = bestOf(key);
        if (best && best.heightM > 0) out[key] = best.heightM;
      }
      return out;
    },

    // --- "Nog 'n kans" (1.12): one more try at a day's tower, bought with coins ----------------------
    /** A day's second try: { status: 'ready' | 'playing' | 'done', result } or null. */
    getDailyRetry(dateKey) {
      sync();
      return retries[dateKey] ? clone(retries[dateKey]) : null;
    },

    /** The day's result that counts (the better try), with `retried`; null before the first try is done. */
    getDailyBest(dateKey) {
      sync();
      const b = bestOf(dateKey);
      return b ? clone(b) : null;
    },

    /** Buy the day's second try: { ok, coins, reason } ('done' first, 'once' a day, 'coins'). */
    buyDailyRetry(dateKey) {
      sync();
      const e = data.daily[dateKey];
      if (!isDateKey(dateKey) || !e || e.status !== 'done') return { ok: false, reason: 'done', coins: econ.coins };
      if (retries[dateKey]) return { ok: false, reason: 'once', coins: econ.coins };
      const r = spendCoins(econ, DAILY_RETRY.price);
      if (!r.ok) return { ok: false, reason: 'coins', coins: econ.coins };
      econ = r.economy;
      persistEcon();
      retries[dateKey] = { status: 'ready', result: null, startedAt: null, finishedAt: null, beatAt: null, owner: null };
      persistRetry();
      return { ok: true, coins: econ.coins };
    },

    /** The second try's first drop. */
    startDailyRetry(dateKey, partialResult, { owner = null } = {}) {
      sync();
      const r = retries[dateKey];
      if (!r || r.status !== 'ready') return r ? clone(r) : null;
      retries[dateKey] = {
        status: 'playing',
        result: normalizeResult({ ...(partialResult || {}), mode: 'daily' }, dateKey),
        startedAt: now(),
        finishedAt: null,
        beatAt: now(),
        owner: typeof owner === 'string' ? owner : null,
      };
      persistRetry();
      return clone(retries[dateKey]);
    },

    saveDailyRetryProgress(dateKey, partialResult) {
      sync();
      const r = retries[dateKey];
      if (!r || r.status !== 'playing') return;
      r.result = normalizeResult({ ...r.result, ...(partialResult || {}), mode: 'daily' }, dateKey);
      r.beatAt = now();
      persistRetry();
    },

    /** The second try ended: the better try counts (`applied` false if it already had). */
    finishDailyRetry(dateKey, result) {
      sync();
      const { applied, flags } = finishRetryEntry(dateKey, result);
      if (applied) {
        persist();
        persistRetry();
      }
      return { ...statsFor(laterKey(dateKey, today())), isNewBestHeight: applied && flags.height, isNewBestScore: applied && flags.score, applied };
    },

    /**
     * Called on the FIRST drop of a daily. No-op if an entry already exists.
     * `owner` (a per-tab id) and the heartbeat let another tab tell a live game from an abandoned one.
     */
    startDaily(dateKey, partialResult, { owner = null } = {}) {
      if (!isDateKey(dateKey)) return null;
      sync();
      if (!data.daily[dateKey]) {
        data.daily[dateKey] = {
          status: 'playing',
          result: normalizeResult({ ...(partialResult || {}), mode: 'daily' }, dateKey),
          startedAt: now(),
          finishedAt: null,
          owner: typeof owner === 'string' ? owner : null,
          beatAt: now(),
        };
        persist();
      }
      return clone(data.daily[dateKey]);
    },

    saveDailyProgress(dateKey, partialResult) {
      if (!isDateKey(dateKey)) return;
      sync();
      const e = data.daily[dateKey];
      if (!e) {
        api.startDaily(dateKey, partialResult);
        return;
      }
      if (e.status !== 'playing') return;
      e.result = normalizeResult({ ...e.result, ...(partialResult || {}), mode: 'daily' }, dateKey);
      e.beatAt = now();
      persist();
    },

    /** "Still playing": refreshes the heartbeat of a playing daily. */
    touchDaily(dateKey) {
      if (!isDateKey(dateKey)) return;
      sync();
      const r = retries[dateKey];
      if (r && r.status === 'playing') {   // (1.12) the second try's heartbeat
        r.beatAt = now();
        persistRetry();
        return;
      }
      const e = data.daily[dateKey];
      if (!e || e.status !== 'playing') return;
      e.beatAt = now();
      persist();
    },

    /** Marks the daily done and applies it to the stats exactly once (`applied` false if it already was). */
    finishDaily(dateKey, result) {
      sync();
      if (!isDateKey(dateKey)) {
        return { ...statsFor(today()), isNewBestHeight: false, isNewBestScore: false, applied: false };
      }
      const { applied, flags } = finishEntry(dateKey, result);
      if (applied) {
        prune(laterKey(dateKey, today()));
        persist();
      }
      return {
        ...statsFor(laterKey(dateKey, today())),
        isNewBestHeight: flags.height,
        isNewBestScore: flags.score,
        applied,
      };
    },

    /**
     * Any daily still 'playing' (page closed mid-game) counts as finished with reason 'quit'.
     * With `staleMs`, an entry whose heartbeat is newer than that is left alone (it is being
     * played in another tab) unless it belongs to `owner` (this tab, reloaded).
     */
    recoverUnfinished(todayKey = today(), { staleMs = 0, owner = null } = {}) {
      sync();
      const t = now();
      const keys = Object.keys(data.daily)
        .filter((k) => {
          const e = data.daily[k];
          if (e.status !== 'playing') return false;
          if (!(staleMs > 0) || !Number.isFinite(e.beatAt)) return true;
          if (owner && e.owner === owner) return true;
          return t - e.beatAt >= staleMs;
        })
        .sort();
      const out = [];
      for (const key of keys) {
        finishEntry(key, { ...data.daily[key].result, reason: 'quit' });
        out.push(clone(data.daily[key].result));
      }
      // (1.12) a second try cut short counts as it stood too (it pays nothing, so it isn't in `out`)
      let retried = false;
      for (const [key, r] of Object.entries(retries)) {
        if (r.status !== 'playing') continue;
        if (staleMs > 0 && Number.isFinite(r.beatAt) && !(owner && r.owner === owner) && t - r.beatAt < staleMs) continue;
        finishRetryEntry(key, { ...(r.result || {}), reason: 'quit' });
        retried = true;
      }
      if (retried) persistRetry();
      if (out.length || retried) {
        if (out.length) prune(laterKey(keys[keys.length - 1], isDateKey(todayKey) ? todayKey : today()));
        persist();
      }
      return out;
    },

    getStats(todayKey = today()) {
      sync();
      return statsFor(isDateKey(todayKey) ? todayKey : today());
    },

    getPracticeBest() {
      sync();
      return { heightM: data.practice.heightM, score: data.practice.score };
    },

    /** Uitdagersreeks: nickname and wins/losses ({ name|null, played, wins, losses, streak, bestStreak }). */
    getDuel() {
      sync();
      return clone(data.duel);
    },

    /** Sets the nickname (empty clears it). Returns { ok, name }: ok false when the name rules refuse it. */
    setDuelName(raw) {
      sync();
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text) {
        data.duel.name = null;
        persist();
        return { ok: true, name: null };
      }
      const name = cleanNickname(text);
      if (!name) return { ok: false, name: data.duel.name };
      data.duel.name = name;
      persist();
      return { ok: true, name };
    },

    /** The way to play the Uitdagersreeks last chosen: 'race' (Wedloop) or 'turns' (Blok vir Blok). */
    setDuelMode(mode) {
      sync();
      data.duel.mode = mode === 'turns' ? 'turns' : 'race';
      persist();
      return data.duel.mode;
    },

    /** A finished match: 'won' or 'lost' (a winning streak counts wins in a row). */
    recordDuel(outcome) {
      sync();
      const u = data.duel;
      u.played += 1;
      if (outcome === 'won') {
        u.wins += 1;
        u.streak += 1;
        u.bestStreak = Math.max(u.bestStreak, u.streak);
      } else {
        u.losses += 1;
        u.streak = 0;
      }
      persist();
      return clone(u);
    },

    // --- Coins, power-ups, looks and the duel rank (js/core/economy.js) ---------------------

    getEconomy() {
      sync();
      return clone(econ);
    },

    /** The player's language ('af' or 'en'), or null before they have chosen. */
    getLang() {
      const v = readRaw(langKey);
      return v === 'af' || v === 'en' ? v : null;
    },

    /** Keep the player's language; false for anything but 'af' / 'en' (or when storage refuses). */
    setLang(lang) {
      if (lang !== 'af' && lang !== 'en') return false;
      try {
        be.setItem(langKey, lang);
        return true;
      } catch {
        return false;
      }
    },

    /** This phone's leaderboard number (made once, at random: 16 letters and digits, linked to nothing). */
    getBoardPlayer() {
      const b = readBoard();
      if (b.player) return b.player;
      const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
      const bytes = new Uint8Array(16);
      if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
      else for (let k = 0; k < bytes.length; k++) bytes[k] = Math.floor(Math.random() * 256);
      b.player = Array.from(bytes, (x) => abc[x % abc.length]).join('');
      writeBoard(b);
      return b.player;
    },

    /** Whether the player chose to stay off the leaderboard (they still see their own place). */
    getBoardHidden() {
      return readBoard().hidden;
    },

    setBoardHidden(hidden) {
      const b = readBoard();
      b.hidden = !!hidden;
      writeBoard(b);
    },

    /** The last day whose result reached the leaderboard (later visits only read it). */
    getBoardPosted() {
      return readBoard().posted;
    },

    setBoardPosted(dateKey) {
      if (!isDateKey(dateKey)) return;
      const b = readBoard();
      b.posted = dateKey;
      writeBoard(b);
    },

    /** A name or hiding change the server hasn't confirmed yet (it goes with the next board request). */
    getBoardPending() {
      return readBoard().pending;
    },

    setBoardPending(pending) {
      const b = readBoard();
      b.pending = !!pending;
      writeBoard(b);
    },

    /** The daily reminder: { time: 'HH:MM' | null, asked }. */
    getReminder() {
      return readRemind();
    },

    setReminder({ time = null, asked = true } = {}) {
      const r = { time: typeof time === 'string' && TIME_RE.test(time) ? time : null, asked: !!asked };
      try {
        be.setItem(remindKey, JSON.stringify(r));
      } catch {
        // private mode: off
      }
      return r;
    },

    /** This week's boxes as stored: { day, last, shields, weeks } (js/core/week.js). */
    getWeek() {
      return readWeek();
    },

    /**
     * The Daily Tower of `dateKey` was played: its box opens and pays (coins outside the day's cap,
     * a Reeksskild, the first full week's look). Returns the box (js/core/week.js openBox) or null when
     * that day's box is open already.
     */
    openWeekBox(dateKey) {
      sync();
      const r = openBox(readWeek(), dateKey);
      if (!r) return null;
      writeWeek(r.week);
      const earned = earnCoins(econ, r.box.coins, { capped: false, dayKey: today() });
      econ = earned.economy;
      // the full week's look; given again by a later day-7 chest if an older version dropped it
      const owned = econ.owned[WEEK.look.kind];
      if (r.box.day === 7 && owned && !owned.includes(WEEK.look.id)) {
        owned.push(WEEK.look.id);
        r.box.look = { ...WEEK.look };
      }
      persistEcon();
      return { ...r.box, total: econ.coins, shields: r.week.shields };
    },

    /** Buy a Reeksskild (WEEK.shieldPrice coins): { ok, coins, shields }. */
    buyWeekShield() {
      sync();
      const w = readWeek();
      if (econ.coins < WEEK.shieldPrice) return { ok: false, coins: econ.coins, shields: w.shields };
      const r = addShield(w);
      if (!r.ok) return { ok: false, coins: econ.coins, shields: w.shields };
      writeWeek(r.week);
      econ = { ...econ, coins: econ.coins - WEEK.shieldPrice };
      persistEcon();
      return { ok: true, coins: econ.coins, shields: r.week.shields };
    },

    /** Has this player played before (a daily, Oefen, a match, or the first-game hints)? */
    hasPlayed() {
      sync();
      return data.tutorialSeen || data.stats.played > 0 || data.practice.played > 0 || data.duel.played > 0;
    },

    /** What duel opponents see of this player (cleanCard), with this month's rank in `mode`. */
    getCard(mode = 'race') {
      sync();
      return cardOf({ ...econ, ranks: { ...econ.ranks, [modeOf(mode)]: seasonNow(mode).rank } }, mode);
    },

    /** Coins for a finished game; Oefen and duels count towards the day's cap. Returns { added, coins }. */
    earnCoins(n, { capped = true } = {}) {
      sync();
      const r = earnCoins(econ, n, { capped, dayKey: today() });
      econ = r.economy;
      if (r.added) persistEcon();
      return { added: r.added, coins: econ.coins };
    },

    buyPowerup(id) {
      return apply((e) => buyPowerup(e, id));
    },

    usePowerup(id) {
      return apply((e) => usePowerup(e, id));
    },

    buyCosmetic(kind, id) {
      return apply((e) => buyCosmetic(e, kind, id));
    },

    wearCosmetic(kind, id) {
      return apply((e) => wearCosmetic(e, kind, id));
    },

    /** The Daily Tower's free Fondamentblok: true the first time for `dateKey`, then false. */
    takeFreeFoundation(dateKey) {
      sync();
      if (!dateKey || econ.freeFoundation === dateKey) return false;
      econ.freeFoundation = dateKey;
      persistEcon();
      return true;
    },

    /**
     * (1.12) A finished duel in `mode`: only a live match against a person moves the rank (by the opponent's
     * rank `opp`, from their card). Returns the screen's view with { counted, delta, before, up, down,
     * shielded, reward } (`reward`: last season's badge, when this match began a new month).
     */
    recordDuelRank({ outcome, live = false, mode = 'race', opp = null } = {}) {
      sync();
      const reward = rollSeasons();
      const m = modeOf(mode);
      if (!live || (outcome !== 'won' && outcome !== 'lost')) return rankView(m, { counted: false, delta: 0, reward });
      const r = rankAfterMatch(econ.ranks[m], { outcome, opp, season: seasonOf(today()) });
      econ.ranks[m] = r.rank;
      econ = grantRankLooks(econ, bestTier(econ));
      persistEcon();
      return rankView(m, {
        counted: true, delta: r.delta, before: { id: r.before.id, pct: r.before.pct }, up: r.up, down: r.down, shielded: r.shielded, reward,
      });
    },

    /**
     * This season's rank in `mode` for the Uitdagersreeks screen. A new month starts the new season here too
     * (a tier down, the old season's badge handed out: `reward`), so the screen is never a month behind.
     */
    getSeasonRank(mode = 'race') {
      sync();
      const reward = rollSeasons();
      return rankView(mode, { reward });
    },

    recordPractice(result) {
      sync();
      const r = normalizeResult(result);
      const p = data.practice;
      const hadPlayed = p.played > 0;
      const isNewBestHeight = hadPlayed && r.heightM > p.heightM;
      const isNewBestScore = hadPlayed && r.score > p.score;
      p.played += 1;
      p.heightM = Math.max(p.heightM, r.heightM);
      p.score = Math.max(p.score, r.score);
      persist();
      return {
        isNewBest: isNewBestHeight || isNewBestScore,
        isNewBestHeight,
        isNewBestScore,
        best: { heightM: p.heightM, score: p.score },
      };
    },
  };
  return api;
}
