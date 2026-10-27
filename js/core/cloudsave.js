// Merging two saves (1.13: Sign in with Google). Pure: js/account.js calls it with this device's save
// (`local`), the account's (`cloud`) and the account's save as this device last saw it (`base`; null the
// first time this device joins the account). The rule of thumb: nothing a player earned on either side is
// lost, and nothing is counted twice.
//   * Counters (towers played, Perfeks, coins, power-ups, matches, rank points): the account's, plus what
//     this device added since `base`. The first time, the two simply add up (they were earned apart),
//     less any day both sides played (that day counts once).
//   * Bests (heights, scores, win streaks): the higher.
//   * Collections (finished towers, second tries, looks owned): both, and for a day both played, the better
//     tower.
//   * Choices (nickname, the look worn, hidden from the ranglys): the side that changed it since `base`;
//     the first time, the account's when it has one.
//   * The streak follows the merged days; the weekkis and a new month's rank follow the later side.
//   * (1.14) The extra daily tries: the side that used more of the day's tries (a signed-in reinstall never gets
//     fresh ones), the best finished try of both. The tower's skins: both sides' owned, the one worn a choice.
//     The testers' gift day: the earlier (a tester stays off the leaderboard everywhere). The refill count: as a
//     counter, for the later day. A coin match's held stake is never in a save (js/core/storage.js cleanSave).
import { cleanSave } from './storage.js';
import { addDays, daysBetween, isDateKey } from './daily.js';
import { MAX_COINS, MAX_STOCK, POWERUP_IDS, COSMETIC_KINDS, DEFAULT_LOOK, RANK_MODES, RANK_RULES, EARN, LADDER, ladderAt, ladderIndex, cleanModeRank, rolloverSeason, SKIN_KINDS, DEFAULT_SKIN, TRIBE_IDS } from './economy.js';
import { WEEK } from './week.js';
import { LAUNCH } from '../config.js';

const KEEP_DAILY_DAYS = 90;   // as js/core/storage.js keeps them
const EMPTY = cleanSave(null);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
const later = (a, b) => (!a ? b : !b ? a : daysBetween(a, b) > 0 ? b : a);
const json = (x) => JSON.stringify(x);

/** The better of two finished towers: taller, then more points. */
const better = (a, b) => (b.result.heightM > a.result.heightM || (b.result.heightM === a.result.heightM && b.result.score > a.result.score) ? b : a);
/** (1.14) The better of two results (either may be missing). */
const betterResult = (a, b) => (!a ? b || null : !b ? a : b.heightM > a.heightM || (b.heightM === a.heightM && b.score > a.score) ? b : a);

/** Consecutive finished days in `daily` ending at `key`. */
function runEndingAt(daily, key) {
  let n = 0;
  for (let k = key; k && daily[k]; k = addDays(k, -1)) n++;
  return n;
}

function mergeRank(l, c, b, first) {
  if (l.season !== c.season) {
    // a new month began on one side (its device handed out last month's badge): that side's rank is this month's
    if (!l.season) return c;
    if (!c.season) return l;
    return l.season > c.season ? l : c;
  }
  if (first) return c.points >= l.points ? c : l;
  const bb = b.season === l.season ? b : rolloverSeason(b, l.season).rank;
  const points = clamp(c.points + (l.points - bb.points), 0, RANK_RULES.maxPoints);
  const bestIdx = Math.max(ladderIndex(l.best), ladderIndex(c.best), ladderIndex(ladderAt(points).id));
  return cleanModeRank({
    season: l.season,
    points,
    best: LADDER[bestIdx].id,
    played: c.played + Math.max(0, l.played - bb.played),
    shield: l.shield !== bb.shield ? l.shield : c.shield,
  });
}

/**
 * The merged save. `today` (a date key) drops finished towers older than the store keeps.
 * Every input is checked first (cleanSave), so a broken or older save can't break the merge.
 */
export function mergeSaves(localRaw, cloudRaw, baseRaw = null, { today = null } = {}) {
  const L = cleanSave(localRaw);
  const C = cleanSave(cloudRaw);
  const first = !baseRaw;
  const B = first ? EMPTY : cleanSave(baseRaw);
  const add = (l, c, b, hi = Number.MAX_SAFE_INTEGER) => clamp(c + (l - b), 0, hi);
  // a choice: the side that changed it since `base` (the first time: the account's, when it has made one)
  const pick = (l, c, b, unset) => (first ? (json(c) !== json(unset) ? c : l) : json(l) !== json(b) ? l : c);

  // --- finished towers and the stats over them --------------------------------------------------------
  const daily = {};
  let twicePlayed = 0;
  let twicePerfects = 0;
  for (const k of new Set([...Object.keys(L.main.daily), ...Object.keys(C.main.daily)])) {
    const l = L.main.daily[k];
    const c = C.main.daily[k];
    if (l && c) {
      daily[k] = better(c, l);
      // the same day played on both sides since `base`: both counted it, it counts once
      if (!B.main.daily[k]) {
        twicePlayed++;
        twicePerfects += (daily[k] === l ? c : l).result.perfects;
      }
    } else {
      daily[k] = l || c;
    }
  }
  if (isDateKey(today)) for (const k of Object.keys(daily)) if (daysBetween(k, today) > KEEP_DAILY_DAYS) delete daily[k];

  // --- second tries ("Nog 'n kans"): bought on one side, played on the other is fine -------------------
  const ORDER = { ready: 0, done: 1 };
  const retry = {};
  for (const k of new Set([...Object.keys(L.retry), ...Object.keys(C.retry)])) {
    const l = L.retry[k];
    const c = C.retry[k];
    if (!l || !c) retry[k] = l || c;
    // (1.14) the side that used more of the day's tries (1.12.1+: `n`); its status, price and result
    else if (l.n !== c.n) retry[k] = { ...(l.n > c.n ? l : c), best: betterResult(c.best, l.best) };
    else if (ORDER[l.status] !== ORDER[c.status]) retry[k] = { ...(ORDER[l.status] > ORDER[c.status] ? l : c), best: betterResult(c.best, l.best) };
    else if (l.status === 'done') {
      retry[k] = { ...better(c, l), best: betterResult(c.best, l.best) };
      // a second try played on both sides since `base`: both added its Perfeks
      if (B.retry[k]?.status !== 'done') twicePerfects += (better(c, l) === l ? c : l).result.perfects;
    } else retry[k] = c;
  }
  if (isDateKey(today)) for (const k of Object.keys(retry)) if (daysBetween(k, today) > KEEP_DAILY_DAYS) delete retry[k];

  const ls = L.main.stats;
  const cs = C.main.stats;
  const bs = B.main.stats;
  const lastDateKey = later(ls.lastDateKey, cs.lastDateKey);
  const run = lastDateKey ? runEndingAt(daily, lastDateKey) : 0;
  let streak = run;
  for (const s of [ls, cs]) {
    if (!s.lastDateKey || !lastDateKey) continue;
    const gap = daysBetween(s.lastDateKey, lastDateKey);
    // a side's own streak (it may reach back past the days kept), carried on by the merged days after it
    if (gap === 0 || (gap > 0 && run > gap)) streak = Math.max(streak, s.streak + gap);
  }
  const stats = {
    played: Math.max(0, add(ls.played, cs.played, bs.played) - twicePlayed),
    streak,
    maxStreak: Math.max(ls.maxStreak, cs.maxStreak, streak),
    bestScore: Math.max(ls.bestScore, cs.bestScore),
    bestHeightM: Math.max(ls.bestHeightM, cs.bestHeightM),
    totalPerfects: Math.max(0, add(ls.totalPerfects, cs.totalPerfects, bs.totalPerfects) - twicePerfects),
    lastDateKey,
  };

  const lp = L.main.practice;
  const cp = C.main.practice;
  const practice = { played: add(lp.played, cp.played, B.main.practice.played), heightM: Math.max(lp.heightM, cp.heightM), score: Math.max(lp.score, cp.score) };

  const ld = L.main.duel;
  const cd = C.main.duel;
  const bd = B.main.duel;
  const wins = add(ld.wins, cd.wins, bd.wins);
  const losses = add(ld.losses, cd.losses, bd.losses);
  const duel = {
    name: pick(ld.name, cd.name, bd.name, null),
    played: Math.max(add(ld.played, cd.played, bd.played), wins + losses),
    wins,
    losses,
    streak: pick(ld.streak, cd.streak, bd.streak, 0),
    bestStreak: Math.max(ld.bestStreak, cd.bestStreak),
    mode: pick(ld.mode, cd.mode, bd.mode, 'race'),
    stake: pick(ld.stake, cd.stake, bd.stake, 0),   // (1.13) the coins last chosen to play for (a choice)
  };
  duel.bestStreak = Math.max(duel.bestStreak, duel.streak);

  // --- the wallet -------------------------------------------------------------------------------------
  const le = L.econ;
  const ce = C.econ;
  const be = B.econ;
  const earnDay = later(le.earned.day, ce.earned.day);
  const nOn = (e) => (e.earned.day === earnDay ? e.earned.n : 0);
  const stock = {};
  for (const id of POWERUP_IDS) stock[id] = add(le.stock[id], ce.stock[id], be.stock[id], MAX_STOCK);
  // (1.15) An older game cleans a save against its own shop list, so a look or skin it doesn't know yet is gone from
  // its copy and it wears the standard one instead. When this device wears one it owns, and the account's copy went
  // back to the standard one and no longer lists it as owned, an older game dropped it: keep wearing it here (the
  // merged copy owns it again for everyone). Not on the first merge, where the account's choice comes first.
  const worn = (picked, mine, mineOwned, theirsOwned, unset) =>
    !first && picked === unset && mine !== unset && mineOwned.includes(mine) && !theirsOwned.includes(mine) ? mine : picked;
  const owned = {};
  const look = {};
  for (const kind of COSMETIC_KINDS) {
    owned[kind] = [...new Set([...ce.owned[kind], ...le.owned[kind]])];
    look[kind] = worn(pick(le.look[kind], ce.look[kind], be.look[kind], DEFAULT_LOOK[kind]), le.look[kind], le.owned[kind], ce.owned[kind], DEFAULT_LOOK[kind]);
  }
  const ranks = {};
  for (const m of RANK_MODES) ranks[m] = mergeRank(le.ranks[m], ce.ranks[m], be.ranks[m], first);
  // (1.14) the tower's skins (1.13.4): bought on either side stays bought; the one worn is a choice
  const skins = { owned: {}, wear: {} };
  for (const kind of SKIN_KINDS) {
    skins.owned[kind] = [...new Set([...ce.skins.owned[kind], ...le.skins.owned[kind]])];
    skins.wear[kind] = worn(pick(le.skins.wear[kind], ce.skins.wear[kind], be.skins.wear[kind], DEFAULT_SKIN[kind]), le.skins.wear[kind], le.skins.owned[kind], ce.skins.owned[kind], DEFAULT_SKIN[kind]);
  }
  // (1.16) the Living Tower's tribes: bought on either side stays bought; the one worn is a choice (an older game,
  // which drops the tribes it doesn't know, doesn't take this device's worn tribe away: as with the looks above)
  const trOwned = TRIBE_IDS.filter((id) => ce.tribes.owned.includes(id) || le.tribes.owned.includes(id));
  const trWear = worn(pick(le.tribes.wear, ce.tribes.wear, be.tribes.wear, null), le.tribes.wear, le.tribes.owned, ce.tribes.owned, null);
  const tribes = { owned: trOwned, wear: trOwned.includes(trWear) ? trWear : (trOwned[0] || null) };
  const econ = {
    coins: add(le.coins, ce.coins, be.coins, MAX_COINS),
    earned: { day: earnDay, n: earnDay ? clamp(nOn(ce) + Math.max(0, nOn(le) - nOn(be)), 0, EARN.dayCap) : 0 },
    stock,
    owned,
    look,
    ranks,
    freeFoundation: later(le.freeFoundation, ce.freeFoundation),
    skins,
    tribes,
    stake: null,
  };

  // --- the weekkis: the side that opened the later box; Reeksskilde bought or used on either side -------
  const lw = L.week;
  const cw = C.week;
  let wk = lw.last === cw.last ? (lw.day >= cw.day ? lw : cw) : later(lw.last, cw.last) === lw.last ? lw : cw;
  // A device that played on an old copy (before its sync came) may have started the week over by mistake: when
  // the merged days run on without a gap from the other side's box, the week counts on from there.
  const early = wk === lw ? cw : lw;
  if (early.last && wk.last && daysBetween(early.last, wk.last) > 0) {
    let day = early.day;
    let k = early.last;
    while (k !== wk.last && daily[addDays(k, 1)]) {
      k = addDays(k, 1);
      day = day === 7 ? 1 : day + 1;
    }
    if (k === wk.last && day !== wk.day) wk = { ...wk, day };
  }
  const week = {
    day: wk.day,
    last: wk.last,
    shields: first ? clamp(lw.shields + cw.shields, 0, WEEK.shieldMax) : add(lw.shields, cw.shields, B.week.shields, WEEK.shieldMax),
    weeks: Math.max(lw.weeks, cw.weeks),
  };
  // (1.15.4) the day's box opened on both sides since `base` (1.15.3 opens it on the day's first visit: a second
  // device before it signed in, or offline before the account's save came): its coins went in on both sides, the box
  // kept counts and the other one comes off
  if (lw.last && lw.last === cw.last && B.week.last !== lw.last) {
    econ.coins = clamp(econ.coins - (WEEK.coins[early.day - 1] || 0), 0, MAX_COINS);
  }

  const player = C.board.player || L.board.player;
  // (1.14) the testers' gift (1.13.2): taken on either side, the account is a tester's (the earlier day)
  const tester = [L.board.tester, C.board.tester].filter(Boolean).sort()[0] || null;
  const board = {
    player,
    hidden: !!tester || (first ? L.board.hidden || C.board.hidden : pick(L.board.hidden, C.board.hidden, B.board.hidden, false)),
    // the numbers this account's devices used before they joined it (their rows go when the account is deleted)
    past: [...new Set([...C.board.past, ...L.board.past, L.board.player, C.board.player])].filter((p) => p && p !== player),
    tester,
  };

  // (1.14) the Winkel refill (1.13.4): presses on the later day add up like a counter (the day's limit holds
  // across devices once they sync), and all presses ever
  const lf = L.refill;
  const cf = C.refill;
  const bf = B.refill;
  const fDay = later(lf.day, cf.day);
  const fOn = (f) => (f.day === fDay ? f.n : 0);
  const refill = {
    day: fDay,
    n: fDay ? (first ? fOn(lf) + fOn(cf) : fOn(cf) + Math.max(0, fOn(lf) - fOn(bf))) : 0,
    total: first ? lf.total + cf.total : add(lf.total, cf.total, bf.total),
  };

  return cleanSave({
    launch: LAUNCH.id,   // (1.23) a merge is made from the launch on (an older account save came through launchSave first)
    main: { tutorialSeen: L.main.tutorialSeen || C.main.tutorialSeen, daily, stats, practice, duel },
    econ,
    retry,
    week,
    board,
    refill,
  });
}

/**
 * A save that fits in `maxChars` of JSON (the server takes 256 KB): the oldest finished towers and second
 * tries go first (their stats are already counted). Real saves are far smaller (90 days: about 35 KB).
 */
export function fitSave(raw, maxChars = 240 * 1024) {
  const s = cleanSave(raw);
  let text = json(s);
  while (text.length > maxChars) {
    const oldest = [...Object.keys(s.main.daily), ...Object.keys(s.retry)].sort()[0];
    if (!oldest) break;
    delete s.main.daily[oldest];
    delete s.retry[oldest];
    text = json(s);
  }
  return s;
}

/** Do two saves hold the same progress? */
export function sameSave(a, b) {
  return json(cleanSave(a)) === json(cleanSave(b));
}
