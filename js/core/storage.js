// Persistent player data (settings, daily results, streaks, practice best, coins and looks).
// Everything lives in one JSON blob under STORAGE_KEY. The in-memory copy is
// the source of truth, so a missing or throwing localStorage (private mode,
// quota, blocked cookies) never breaks the game — it just won't persist.

import { STORAGE_KEY } from '../config.js';
import { dateKeyFor, dayNumber, addDays, daysBetween, isDateKey } from './daily.js';
import { cleanVisits } from './visitorrules.js';
import { cleanNickname } from './duel.js';
import {
  defaultEconomy, cleanEconomy, earnCoins, buyPowerup, usePowerup, buyCosmetic, wearCosmetic, grantRankLooks,
  rankAfterMatch, rolloverSeason, rankFor, seasonOf, cardOf,
} from './economy.js';

const SCHEMA = 1;
const SETTING_KEYS = ['sound', 'vibration', 'reducedMotion', 'highContrast'];
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
    duel: { name: null, played: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0 },
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
  // The language ('af' / 'en') too: js/core/langboot.js reads it before anything else loads.
  const langKey = `${key}.lang`;
  let data = defaultData();
  let econ = defaultEconomy();
  let lastRaw = null;
  let lastEconRaw = null;

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
    if (er !== undefined && er !== lastEconRaw) {
      lastEconRaw = er;
      try {
        econ = cleanEconomy(er === null ? null : JSON.parse(er));
      } catch {
        econ = defaultEconomy();
      }
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
  }

  const today = () => dateKeyFor(new Date(now()));

  function statsFor(todayKey) {
    const s = data.stats;
    const history = [];
    for (let k = HISTORY_DAYS - 1; k >= 0; k--) {
      const key = addDays(todayKey, -k);
      const e = data.daily[key];
      const done = e && e.status === 'done';
      history.push({
        dateKey: key,
        dayNumber: dayNumber(key),
        heightM: done ? e.result.heightM : null,
        score: done ? e.result.score : null,
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

  /** The rank as this month sees it: a new month halves the points and leaves last season's badge (`reward`). */
  const seasonNow = () => rolloverSeason(econ.rank, seasonOf(today()));

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
        const e = data.daily[key];
        if (e && e.status === 'done' && e.result && e.result.heightM > 0) out[key] = e.result.heightM;
      }
      return out;
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
      if (out.length) {
        prune(laterKey(keys[keys.length - 1], isDateKey(todayKey) ? todayKey : today()));
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

    /** Has this player played before (a daily, Oefen, a match, or the first-game hints)? */
    hasPlayed() {
      sync();
      return data.tutorialSeen || data.stats.played > 0 || data.practice.played > 0 || data.duel.played > 0;
    },

    /** What duel opponents see of this player (cleanCard), with this month's rank. */
    getCard() {
      sync();
      return cardOf({ ...econ, rank: seasonNow().rank });
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
     * A finished duel moves the season's rank points. Returns { points, delta, rank, up, reward, halved }:
     * `reward` is last season's badge and `halved` the points before the halving, when this match began a new month.
     */
    recordDuelRank({ outcome, live = false } = {}) {
      sync();
      const before = econ.rank.points;
      const r = rankAfterMatch(econ.rank, { outcome, live, season: seasonOf(today()) });
      econ.rank = r.rank;
      econ = grantRankLooks(econ, r.rank.best, { badge: r.reward });
      persistEcon();
      return {
        points: r.rank.points, delta: r.delta, rank: rankFor(r.rank.points).id, up: r.up, reward: r.reward,
        halved: r.reward ? before : null,
      };
    },

    /**
     * This season's rank for the Uitdagersreeks screen. A new month starts the new season here too
     * (points halve, the old season's badge is handed out: `reward`), so the screen is never a month behind.
     */
    getSeasonRank() {
      sync();
      const rolled = seasonNow();
      if (rolled.rank.season !== econ.rank.season) {
        econ.rank = rolled.rank;
        econ = grantRankLooks(econ, rolled.rank.best, { badge: rolled.reward });
        persistEcon();
      }
      const r = econ.rank;
      const now = rankFor(r.points);
      return {
        season: r.season,
        points: r.points,
        rank: now.id,
        min: now.min,
        next: now.next ? now.next.id : null,
        nextMin: now.next ? now.next.min : null,
        toNext: now.toNext,
        best: r.best,
        badges: econ.owned.badge.filter((b) => b.startsWith('s-')),
        reward: rolled.reward,
      };
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
