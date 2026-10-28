// (1.23, the owner 27 Oct 2026: "Everyone starts from scratch", and "a really nice looking skin for everyone that tested the
// app that will not be released") The public launch. The first time a device opens a version from the launch on, its progress
// from the testing weeks goes: coins, power-ups, looks, skins, ranks, records, finished towers, second tries, the weekkis,
// the Living Tower and the modes that are off. Whoever had played gets the testers' block skin (LAUNCH.skin), worn at once.
// Kept: the name, the settings, the language, the reminder, the leaderboard number, a signed-in account's link and the
// "seen it" marks (lessons, tips, the Winkel's new tags). A signed-in account's save from before the launch goes the same way
// when it next comes in (launchSave, from js/account.js), so the testers' coins never come back through the merge.
import { STORAGE_KEY, LAUNCH } from '../config.js';
import { DEFAULT_SKIN, DEFAULT_LOOK } from './economy.js';

/** The store's own keys that are progress (`${key}.<name>`): wiped. The main blob and `.board` are rewritten. */
const PROGRESS = ['econ', 'ranks', 'retry', 'week', 'tries', 'refill'];
/** Other modes' progress (fixed keys): wiped. */
export const MODE_KEYS = Object.freeze(['stapel.v1.kasteeldae', 'stapel.v1.kasteel', 'stapel.v1.gly', 'stapel.v1.slag',
  'stapel.v1.dorp', 'stapel.v1.span', 'stapel.v1.lewende', 'stapel.v1.botsing']);

function read(be, k) {
  try {
    return JSON.parse(be.getItem(k) || 'null');
  } catch {
    return null;
  }
}
function write(be, k, v) {
  try {
    be.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  } catch {
    // private mode: this visit only
  }
}
function drop(be, k) {
  try {
    be.removeItem(k);
  } catch {
    // fine
  }
}

const count = (x) => (Number.isFinite(x) ? x : 0);

/** Does the wallet hold anything a new one doesn't? A skin or look (taken while they were free), a tribe, a power-up. */
function ownsExtras(econ) {
  const more = (lists, unset) => !!lists && typeof lists === 'object'
    && Object.entries(lists).some(([k, ids]) => Array.isArray(ids) && ids.some((id) => id !== unset[k]));
  if (more(econ?.skins?.owned, DEFAULT_SKIN) || more(econ?.owned, DEFAULT_LOOK)) return true;
  if (Array.isArray(econ?.tribes?.owned) && econ.tribes.owned.length > 0) return true;
  return !!econ?.stock && typeof econ.stock === 'object' && Object.values(econ.stock).some((n) => count(n) > 0);
}

/**
 * Did this device play before the launch? A finished tower, practice or match, coins, anything from the Winkel, or another
 * mode's progress.
 */
export function playedBefore(main, econ, hasModeProgress = false) {
  const st = main?.stats || {};
  if (count(st.played) > 0 || count(main?.practice?.played) > 0 || count(main?.duel?.played) > 0) return true;
  if (main?.daily && typeof main.daily === 'object' && Object.keys(main.daily).length > 0) return true;
  if (count(econ?.coins) > 0 || ownsExtras(econ)) return true;
  return hasModeProgress;
}

/** The wallet a tester starts with: the default one, plus the testers' skin, worn. */
export const founderEconomy = () => ({ skins: { owned: { blocks: ['kleur', LAUNCH.skin] }, wear: { blocks: LAUNCH.skin } } });

/**
 * Once per device (backend: localStorage-like; key: the store's key). Returns { done, founder }: done when this run did the
 * launch step, founder when the device had played before (and now owns the testers' skin).
 */
export function launchReset(be, key = STORAGE_KEY, { modeKeys = MODE_KEYS } = {}) {
  const mark = `${key}.launch`;
  let seen = null;
  try {
    seen = be.getItem(mark);
  } catch {
    return { done: false, founder: false };
  }
  if (seen === LAUNCH.id) return { done: false, founder: false };
  const main = read(be, key);
  const econ = read(be, `${key}.econ`);
  let modes = false;
  for (const k of modeKeys) {
    try {
      if (be.getItem(k) != null) modes = true;
    } catch {
      // fine
    }
  }
  const founder = playedBefore(main, econ, modes);
  if (founder) {
    write(be, key, {
      v: main?.v,
      settings: main?.settings && typeof main.settings === 'object' ? main.settings : {},
      tutorialSeen: main?.tutorialSeen === true,
      duel: { name: typeof main?.duel?.name === 'string' ? main.duel.name : null },
    });
    for (const p of PROGRESS) drop(be, `${key}.${p}`);
    for (const k of modeKeys) drop(be, k);
    const b = read(be, `${key}.board`) || {};
    // the testers' gift kept its taker off the leaderboard for good: from the launch everyone is on it again (unless they
    // chose to hide their name themselves)
    write(be, `${key}.board`, {
      player: typeof b.player === 'string' ? b.player : null,
      hidden: b.tester ? false : b.hidden === true,
      posted: typeof b.posted === 'string' ? b.posted : null,
      pending: b.pending === true,
      tester: null,
    });
    write(be, `${key}.econ`, founderEconomy());
    // a signed-in device's last sync: its base becomes this fresh start, so the next merge doesn't read the start from
    // scratch as coins spent (a launch save another device stored keeps its progress); without its rev the next sync
    // fetches the account's whole save; a store from before the launch still on its way is dropped
    const link = read(be, `${key}.cloud`);
    if (link && typeof link === 'object' && link.base && typeof link.base === 'object') {
      write(be, `${key}.cloud`, {
        ...link,
        base: launchSave({ ...link.base, launch: null }),
        rev: null,
        pending: link.pending?.save?.launch === LAUNCH.id ? link.pending : null,
      });
    }
  }
  write(be, mark, LAUNCH.id);
  return { done: true, founder };
}

/**
 * A signed-in account's save as it comes from the server: one from before the launch (no LAUNCH mark) becomes a fresh one
 * with the testers' skin, keeping only its name, leaderboard numbers and the lessons-seen mark. Anything else as it is.
 */
export function launchSave(save) {
  if (!save || typeof save !== 'object' || save.launch === LAUNCH.id) return save;
  const name = save.main?.duel?.name;
  return {
    launch: LAUNCH.id,
    v: 1,
    main: { tutorialSeen: save.main?.tutorialSeen === true, duel: { name: typeof name === 'string' ? name : null } },
    econ: founderEconomy(),
    board: { player: save.board?.player ?? null, past: Array.isArray(save.board?.past) ? save.board.past : [] },
  };
}

/** Does a save (or its owner) hold the testers' skin? */
export const isFounderSave = (save) => !!save?.econ?.skins?.owned?.blocks?.includes?.(LAUNCH.skin);
