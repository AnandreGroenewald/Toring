// Stapel — boot + wiring: Phaser game, storage, DOM UI, audio, bus events,
// pause/visibility, settings, service worker and debug hooks.
// First of all: the language, before any other module reads a string (js/core/langboot.js).
import { SAVED_LANG, PREVIEW_LANG } from './core/langboot.js';
import { GAME_W, computeGameHeight, SITE_URL_FALLBACK, STORAGE_KEY, DUEL } from './config.js';
import { bus } from './core/bus.js';
import { S, POWERUP_INFO, COSMETIC_INFO, RANK_INFO } from './core/strings.js';
import { fmtDateKey, fmtM } from './core/format.js';
import { createStore } from './core/storage.js';
import { dateKeyFor, dayNumber, seedFor, nextDayTimestamp, parseDebugDate, isDateKey, addDays } from './core/daily.js';
import { createSequence } from './core/sequence.js';
import { buildShareText, buildDuelShareText } from './core/share.js';
import { parseChallengeQuery, parseRoomQuery, defaultNicknameFor } from './core/duel.js';
import { coinsForGame, cosmetic, POWERUP_IDS } from './core/economy.js';
import { weekView, WEEK } from './core/week.js';

const WEEK_COINS = WEEK.coins;
import { createDuel } from './duel.js';
import { loadChallenge, shareUrlFor } from './core/challenge.js';
import { buildSkyline, SKYLINE_DAYS } from './core/skyline.js';
import { tomorrowTeaser } from './core/teaser.js';
import { initInstall, installMode, promptInstall, dismissInstall, onInstallChange } from './core/install.js';
import { normalizeFeed, pickPremium } from './core/sponsors.js';
import { buildStatsBatch, percentileLine } from './core/audience.js';
import { tutorialDone } from './core/coach.js';
import { loadSponsors } from './sponsorsFeed.js';
import { sendStats, dailyPercentile } from './audience.js';
import { postBoard, getBoard } from './board.js';
import { SPONSOR_API_URL, salesEnabled, matchApiUrl } from './sponsorConfig.js';
import { createUI } from './ui/dom.js';
import { getLanguage, isLang } from './core/i18n.js';
import { audio, haptics } from './audio.js';
import { BgScene } from './scenes/BgScene.js';
import { GameScene } from './scenes/GameScene.js';
import { HudScene } from './scenes/HudScene.js';

// ---------------------------------------------------------------------------
// Query params. The test helpers (?date, ?seed, ?auto) only work together with
// ?debug=1, and a debug session keeps its own storage: it can never touch the
// real daily, streak or stats, and nobody can autoplay a daily they share.
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
// the address as opened (challenge links are taken off it below): a new player who picks English
// starts again in English with the same link
const BOOT_URL = location.pathname + location.search + location.hash;
const DEBUG = params.get('debug') === '1';
// The Android app (Capacitor, app/): the game files ship inside it, so no service worker there.
const IN_APP = !!globalThis.Capacitor?.isNativePlatform?.();
const NO_SW = params.has('nosw') || DEBUG || IN_APP;
const DEBUG_DATE = DEBUG ? parseDebugDate(location.search) : null;
const SEED_OVERRIDE = DEBUG ? params.get('seed') : null;
const AUTO = DEBUG && params.has('auto') ? Math.min(1, Math.max(0.0001, Number(params.get('auto')) || 0)) : 0;
// ?debug=1&visitor=monkey|clown|thief: that visitor comes as soon as there is a little tower
const FORCE_VISITOR = DEBUG ? params.get('visitor') : null;

const HEARTBEAT_MS = 4000;     // a running daily says "still here" this often...
const STALE_MS = 15000;        // ...and another tab takes it over only after this long
const RESULTS_SLEEP_MS = 1500; // results/pause: stop rendering the (static) game behind the card
const MENU_SLEEP_MS = 45000;   // menu left alone: let the attract tower rest

const randomSeed = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const todayKey = () => DEBUG_DATE || dateKeyFor();

// Friend challenge from a shared link (?klop=<dm>&d=<date>): only valid for today's date; kept for this tab in sessionStorage.
let challengeRaw = loadChallenge(location.search, todayKey());
/** The friend's challenge while it is still today's date (it lapses at midnight), else null. */
const activeChallenge = () => (challengeRaw && challengeRaw.dateKey === todayKey() ? challengeRaw : null);

// "Sit Stapel op jou tuisskerm": keep the browser's install prompt for the results screen.
initInstall();

/** Per-tab id (survives a reload of this tab, not a new tab): tells "my game" from another tab's. */
const TAB_ID = (() => {
  const make = () => Math.random().toString(36).slice(2, 10);
  try {
    let id = sessionStorage.getItem('stapel.tab');
    if (!id) {
      id = make();
      sessionStorage.setItem('stapel.tab', id);
    }
    return id;
  } catch {
    return make();
  }
})();

function siteUrl() {
  // links shared from a file:// copy or the app (https://localhost) point at the website
  if (location.protocol === 'file:' || IN_APP) return SITE_URL_FALLBACK;
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

/** The local midnight that ends `dateKey` (the attempt's day, not "today": games can cross midnight). */
function nextDayFor(dateKey) {
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  if (!y || !m || !d) return nextDayTimestamp();
  return nextDayTimestamp(new Date(y, m - 1, d, 12));
}

// ---------------------------------------------------------------------------
// Store, settings, UI
// ---------------------------------------------------------------------------
const store = createStore(undefined, DEBUG ? { key: `${STORAGE_KEY}.debug` } : {});
let settings = store.getSettings();
// Afrikaans or English (1.9). Someone who played before there was a choice stays in Afrikaans; a new
// player is asked once (onReady), unless a ?lang= link already said which.
let askLanguage = false;
if (!SAVED_LANG) {
  if (store.hasPlayed()) store.setLang('af');
  else if (PREVIEW_LANG) store.setLang(PREVIEW_LANG);
  else askLanguage = true;
}
audio.setEnabled(settings.sound);
haptics.setEnabled(settings.vibration);

const ui = createUI(bus);
ui.setLoading(true);

const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
window.addEventListener('keydown', unlock, { capture: true, passive: true });

// ---------------------------------------------------------------------------
// Phaser
// ---------------------------------------------------------------------------
// A phone opened sideways still gets a portrait game (the rotate overlay shows meanwhile).
const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const gameHeight = coarse
  ? computeGameHeight(Math.min(innerWidth, innerHeight), Math.max(innerWidth, innerHeight))
  : computeGameHeight();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: gameHeight,
  backgroundColor: '#8fd3f4',
  banner: false,
  disableContextMenu: true,
  input: { activePointers: 2 },
  // No MSAA (sprites only need texture filtering) and no FX pipelines (unused):
  // that is ~200 MB of GPU memory a phone never has to find.
  render: { antialias: true, antialiasGL: false, powerPreference: 'default' },
  disablePreFX: true,
  disablePostFX: true,
  // Raw frame times: Phaser's smoothing would run the game in slow motion for
  // seconds after every app switch on a 30 Hz phone. GameScene clamps big steps itself.
  fps: { smoothStep: false },
  audio: { noAudio: true },   // all sound is js/audio.js; Phaser's own manager would open a 2nd AudioContext
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BgScene, GameScene, HudScene],
});

window.__stapel = Object.assign(window.__stapel || {}, { game, bus, store, ui, audio });

/** Jou Stapelstad: the last 30 days of finished dailies (the background draws it once into a texture). */
const skylineFor = (dateKey) => buildSkyline(dateKey, store.getDailyHeights(dateKey, SKYLINE_DAYS), SKYLINE_DAYS);
function pushSkyline(dateKey = todayKey()) {
  try {
    game.registry.set('skyline', skylineFor(dateKey));
  } catch {
    // the skyline is decoration only
  }
}
pushSkyline();

// What the player is doing right now.
const run = {
  mode: 'idle',       // 'idle' | 'daily' | 'practice'
  dateKey: null,
  dayNumber: null,
  over: false,
  paused: false,
  started: false,     // first block dropped
  final: null,        // { result, stats, isNewBest, aborted } once the game has ended
};
let screen = 'menu';   // 'menu' | 'game' | 'pause' | 'results'
const seqCache = new Map();

// ---------------------------------------------------------------------------
// Sponsors: the feed loads in the background and never holds up the game. Until
// it arrives (or offline without a cache) the game simply runs without names.
// ---------------------------------------------------------------------------
let sponsorFeed = normalizeFeed(null, null);

function billboardFor(dateKey) {
  let premium = null;
  try {
    premium = pickPremium(sponsorFeed.premium, dateKey || todayKey());
  } catch {
    premium = null;
  }
  return { premium, salesOn: salesEnabled() };
}

function onSponsorFeed(feed) {
  if (!feed || typeof feed !== 'object') return;
  sponsorFeed = feed;
  if (ui.setMenuAd) ui.setMenuAd(menuAd());
  if (screen === 'menu') requestAnimationFrame(updateMenuAnchor);   // the card may have moved
  const gs = gameScene();
  if (gs && gs.idle && gs.setSponsors) gs.setSponsors(feed, billboardFor(todayKey()));
}

// ---------------------------------------------------------------------------
// Anonymous audience counts and the daily percentile (js/audience.js). Only with a Worker
// (MATCH_API_URL, or SPONSOR_API_URL); a debug session stays out of the real numbers unless ?audience=1.
// ---------------------------------------------------------------------------
const AUDIENCE_ON = !!matchApiUrl() && (!DEBUG || params.get('audience') === '1');
let menuCounted = false;   // the menu card is reported with the first game of a visit only

bus.on('game:audience', (a) => {
  if (!AUDIENCE_ON || !a || !(a.blocksDropped > 0)) return;
  try {
    const batch = buildStatsBatch({
      dateKey: a.dateKey || todayKey(),
      mode: a.mode,
      tally: a.tally,
      billboardId: a.billboardId,
      menu: !menuCounted && !!sponsorFeed.house?.menu,
    });
    if (batch && sendStats(matchApiUrl(), batch) && batch.menu) menuCounted = true;
  } catch {
    /* counting never gets in the way of the game */
  }
});

// The daily leaderboard (js/board.js): with the match server. A debug session stays off the real board
// (its autoplay and ?date= would post); ?board=1 lets a test on this computer use a local server.
const LOCAL_PAGE = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const BOARD_ON = !!matchApiUrl() && (!DEBUG || (params.get('board') === '1' && LOCAL_PAGE));
ui.setBoardOn(BOARD_ON);
const BOARD_FRESH_MS = 60 * 1000;   // an answer this recent is shown again without asking the server
let boardLast = null;   // { dateKey, board, at }: the last answer, so the sheet opens on it at once
let boardDate = null;   // the day the Ranglys sheet shows
let boardBusy = Promise.resolve();   // board requests go one after the other, each with the latest choice
let boardChanges = 0;   // name or hiding changes this visit (one made while a post is out stays pending)
let boardSaving = 0;    // changes on their way to the server

/** A day's finished daily, as the board takes it (null when that day has none). */
function boardResult(dateKey) {
  const e = store.getDaily(dateKey);
  return e?.status === 'done' && e.result ? { ...e.result, mode: 'daily', dateKey } : null;
}

/**
 * One board request for a day, queued behind any other. The day's result is posted when it hasn't
 * reached the server yet, or a name or hiding change hasn't (the server keeps the first height and
 * takes the rest); otherwise the board is only read. Resolves with the answer, or null.
 */
function syncBoard(dateKey) {
  const task = async () => {
    const player = store.getBoardPlayer();
    const result = boardResult(dateKey);
    const posted = store.getBoardPosted() === dateKey;
    let board;
    if (result && (!posted || store.getBoardPending())) {
      const sent = boardChanges;
      board = await postBoard({ apiUrl: matchApiUrl(), result, player, name: duelNick(), hidden: store.getBoardHidden() });
      if (board?.you) {
        store.setBoardPosted(dateKey);
        if (boardChanges === sent) store.setBoardPending(false);
      }
    } else {
      board = await getBoard({ apiUrl: matchApiUrl(), dateKey, player });
    }
    if (board) boardLast = { dateKey, board, at: Date.now() };
    return board;
  };
  const run = boardBusy.then(task, task);
  boardBusy = run.catch(() => null);
  return run.catch(() => null);
}

/** Is the last answer for this day recent, with nothing left to send? */
function boardFresh(dateKey) {
  return boardLast?.dateKey === dateKey && Date.now() - boardLast.at < BOARD_FRESH_MS && !store.getBoardPending();
}

/**
 * A daily's results: its result goes on the leaderboard (the first time), and the card then shows
 * "Jy is #23 van 140 vandag".
 */
function showBoardPlace(result) {
  if (!BOARD_ON || !result || result.mode !== 'daily' || !result.dateKey) return;
  const dateKey = result.dateKey;
  const job = boardFresh(dateKey) ? Promise.resolve(boardLast.board) : syncBoard(dateKey);
  job.then((board) => {
    if (board && screen === 'results') ui.setResultsBoard(dateKey, board);
  });
}

/** The Ranglys sheet as it stands: the last answer for its day, the player's choice, and any change on its way. */
function renderBoard({ loading = false, refresh = true } = {}) {
  if (!boardDate) return;
  const last = boardLast?.dateKey === boardDate ? boardLast.board : null;
  const mine = store.getBoardPosted() === boardDate;
  ui.showBoard({
    board: last,
    loading: loading && !last,
    name: duelNick(),
    hidden: store.getBoardHidden(),
    state: boardSaving > 0 ? 'saving' : mine && store.getBoardPending() ? 'retry' : null,
    title: boardDate === todayKey() ? S.boardTitle : boardDate === addDays(todayKey(), -1) ? S.boardTitleYesterday : S.dailyN(dayNumber(boardDate)),
    refresh,
  });
}

/** The Ranglys sheet: a day's top 10 and your place (the results card's day, or today from the statistics). */
function openBoard(dateKey) {
  if (!BOARD_ON) return;
  boardDate = isDateKey(dateKey) ? dateKey : todayKey();
  renderBoard({ loading: true, refresh: false });
  if (boardFresh(boardDate)) return;
  const day = boardDate;
  syncBoard(day).then(() => {
    if (boardDate === day) renderBoard();
  });
}

/**
 * A new nickname or "show me" choice: the latest result on the board (today's or yesterday's) takes it
 * at once. Until the server has it, the change waits and goes with the next board request, also on a
 * later visit, and the sheet says so.
 */
function boardChanged() {
  const day = store.getBoardPosted();
  if (!BOARD_ON || !day || day < addDays(todayKey(), -1)) {
    renderBoard();
    return;
  }
  boardChanges++;
  store.setBoardPending(true);
  boardSaving++;
  renderBoard();
  syncBoard(day).then(() => {
    boardSaving--;
    renderBoard();
  });
}

bus.on('ui:board', openBoard);
bus.on('ui:board-hide', (hide) => {
  store.setBoardHidden(!!hide);
  boardChanged();
});

/** At start: a change that didn't reach the server last time goes now (one about an older day is let go). */
function retryBoard() {
  if (!BOARD_ON || !store.getBoardPending()) return;
  const day = store.getBoardPosted();
  if (day && day >= addDays(todayKey(), -1)) syncBoard(day);
  else store.setBoardPending(false);
}

/** The results card learns how the player did against everyone else today, when (if) the server answers. */
function showPercentile(result) {
  showBoardPlace(result);
  if (!AUDIENCE_ON || !result || result.mode !== 'daily') return;
  dailyPercentile(result, { apiUrl: matchApiUrl(), storageKey: DEBUG ? `${STORAGE_KEY}.debug` : STORAGE_KEY })
    .then((answer) => {
      const line = percentileLine(answer);
      if (line && screen === 'results') ui.setResultsPercentile(result.dateKey, line);
    }, () => {});
}

function menuAd() {
  return { house: sponsorFeed.house?.menu || null, salesOn: salesEnabled() };
}

loadSponsors({ apiUrl: SPONSOR_API_URL, onUpdate: onSponsorFeed }).then(onSponsorFeed, () => {});

function sequenceFor(dateKey) {
  if (!seqCache.has(dateKey)) {
    seqCache.clear();
    seqCache.set(dateKey, createSequence(seedFor(dateKey)));
  }
  return seqCache.get(dateKey);
}

function menuModel() {
  const dateKey = todayKey();
  return {
    dateKey,
    dayNumber: dayNumber(dateKey),
    dateLabel: fmtDateKey(dateKey),
    forecast: sequenceFor(dateKey).forecast(4),   // about as many as a typical tower meets
    visitors: sequenceFor(dateKey).visitorForecast(),   // "Besoekers vandag: 🐒 🤡"
    today: store.getDaily(dateKey),
    stats: store.getStats(dateKey),
    settings,
    nextDayAt: nextDayTimestamp(),
    ad: menuAd(),
    newPlayer: !store.tutorialSeen(),   // first visit: a one-line nudge instead of the old how-to pop-up
    challenge: activeChallenge() ? { text: S.challengeMenu(fmtM(activeChallenge().heightM)) } : null,
    city: skylineFor(dateKey),
    coins: store.getEconomy().coins,
    week: weekView(store.getWeek(), dateKey),   // the weekkis strip (js/core/week.js)
  };
}

// ---------------------------------------------------------------------------
// Winkel (1.8): power-ups and looks, bought with coins earned by playing
// ---------------------------------------------------------------------------
function shopModel() {
  const e = store.getEconomy();
  return { coins: e.coins, stock: e.stock, owned: e.owned, look: e.look, card: store.getCard(), name: duelNick(), week: store.getWeek() };
}

bus.on('ui:shop', (tab) => ui.showShop(shopModel(), typeof tab === 'string' ? tab : undefined));
/** A new look from the shop shows at once on the Uitdagersreeks card underneath. */
function lookChanged() {
  if (screen !== 'duel') return;
  const card = store.getCard();
  ui.setDuelCard(card, card.rank);
}
bus.on('ui:shop-buy', ({ kind, id } = {}) => {
  if (kind === 'weekshield') {
    const w = store.buyWeekShield();
    if (w.ok) {
      audio.play('heart');
      ui.toast(S.bought(S.weekShield));
    }
    ui.showShop(shopModel());
    return;
  }
  const r = kind === 'powerup' ? store.buyPowerup(id) : store.buyCosmetic(kind, id);
  if (r.ok) {
    audio.play('heart');
    if (kind !== 'powerup') store.wearCosmetic(kind, id);   // a new look goes on at once
    const name = kind === 'powerup' ? POWERUP_INFO[id]?.name : COSMETIC_INFO[kind]?.[id]?.name;
    if (name) ui.toast(S.bought(name));
  }
  ui.showShop(shopModel());
  if (r.ok && kind !== 'powerup') lookChanged();
});
bus.on('ui:shop-wear', ({ kind, id } = {}) => {
  store.wearCosmetic(kind, id);
  ui.showShop(shopModel());
  lookChanged();
});

function gameScene() {
  return game.scene.getScene('Game');
}

// ---------------------------------------------------------------------------
// Render loop: nothing moves behind the pause card, the finished results or a
// menu left alone, so the loop sleeps there (battery, heat).
// ---------------------------------------------------------------------------
let loopAsleep = false;
let sleepTimer = 0;

function sleepLoop(afterMs = 0) {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    if (loopAsleep || !game.loop || !game.loop.running) return;
    loopAsleep = true;
    game.loop.sleep();
  }, afterMs);
}

function wakeLoop() {
  clearTimeout(sleepTimer);
  sleepTimer = 0;
  if (!loopAsleep) return;
  loopAsleep = false;
  game.loop.wake();
  game.loop.resetDelta();
  const gs = gameScene();
  if (gs && gs.resetClock) gs.resetClock();
}

function armMenuSleep() {
  if (screen === 'menu') sleepLoop(MENU_SLEEP_MS);
}

for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => {
    if (screen !== 'menu') return;
    wakeLoop();
    armMenuSleep();
  }, { capture: true, passive: true });
}

// ---------------------------------------------------------------------------
// Scene control
// ---------------------------------------------------------------------------
const LESSON_STEPS = 4;
const LESSON_SEED = 'stapel-les';   // the short lesson's Oefen tower (see startLesson)
let lesson = null;   // { step, landings, after } while it runs

function startGame(data) {
  wakeLoop();
  if (data.seed !== LESSON_SEED || data.mode !== 'practice') {
    lesson = null;
    ui.showTutor(null);
  }
  if (data.mode !== 'duel') duel.leave();   // a new game of another kind ends any match (and its live room)
  if (run.paused) {
    audio.resume();
    run.paused = false;
  }
  game.scene.stop('Hud');
  game.scene.start('Game', {
    settings,
    autoplay: 0,
    sponsors: sponsorFeed,
    billboard: billboardFor(data.dateKey),
    // a brand-new player gets short HUD hints during the first game (text only; js/core/coach.js)
    coach: data.mode !== 'idle' && !store.tutorialSeen(),
    debug: DEBUG,
    visitor: FORCE_VISITOR,
    ...data,
  });
}

function resetRun(mode, dateKey = null) {
  pw.effects = {};
  pw.free = false;
  run.mode = mode;
  run.dateKey = dateKey;
  run.dayNumber = dateKey ? dayNumber(dateKey) : null;
  run.over = false;
  run.started = false;
  run.final = null;
}

// ---------------------------------------------------------------------------
// Power-ups (1.8; js/core/economy.js): in Oefen from the player's stock; in the Daily Tower only the
// free Fondamentblok from 55 m (the same for everyone); never in a match.
// ---------------------------------------------------------------------------
const pw = { effects: {}, free: false };

function renderTray() {
  const mode = run.mode;
  if (screen !== 'game' || run.over || (mode !== 'practice' && mode !== 'daily')) {
    ui.setPowerups(null);
    return;
  }
  const e = pw.effects || {};
  const items = [];
  if (mode === 'daily') {
    if (pw.free || e.foundation) items.push({ id: 'foundation', count: pw.free ? 1 : 0, active: !!e.foundation, glow: pw.free && !e.foundation, enabled: pw.free && !e.foundation });
  } else {
    const stock = store.getEconomy().stock;
    for (const id of POWERUP_IDS) {
      const active = (id === 'slow' && e.slowLeft > 0) || (id === 'shield' && !!e.shield) || (id === 'foundation' && !!e.foundation);
      if (!(stock[id] > 0) && !active) continue;
      const enabled = !active && stock[id] > 0 && !(id === 'heart' && e.heartRoom === false);
      items.push({ id, count: stock[id], active, enabled });
    }
  }
  ui.setPowerups(items);
}

bus.on('game:powerups', (e) => {
  pw.effects = e || {};
  renderTray();
});
bus.on('game:free-foundation', () => {
  if (run.mode !== 'daily' || !run.dateKey || store.getEconomy().freeFoundation === run.dateKey) return;
  pw.free = true;
  bus.emit('hud:toast', { text: S.freeFoundation, color: '#ffe38c' });
  renderTray();
});
bus.on('ui:powerup', (id) => {
  const gs = gameScene();
  if (!gs || run.over || screen !== 'game') return;
  if (run.mode === 'daily') {
    if (id !== 'foundation' || !pw.free) return;
    if (gs.applyPowerup('foundation')) {
      store.takeFreeFoundation(run.dateKey);
      pw.free = false;
    }
  } else if (run.mode === 'practice') {
    if (!(store.getEconomy().stock[id] > 0)) return;
    if (gs.applyPowerup(id)) store.usePowerup(id);
  }
  renderTray();
});

function startIdle() {
  resetRun('idle');
  startGame({ mode: 'idle', seed: randomSeed('idle') });
}

function showMenu() {
  screen = 'menu';
  pushSkyline();
  ui.showMenu(menuModel());
  wakeLoop();
  armMenuSleep();
  requestAnimationFrame(updateMenuAnchor);
}

/** Tells the attract tower where the menu card starts (game px), so it stays in view above it. */
function updateMenuAnchor() {
  const canvas = game.canvas;
  const top = ui.menuCardTop ? ui.menuCardTop() : null;
  if (!canvas || top == null || screen !== 'menu') return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0)) return;
  game.registry.set('menuTopGame', ((top - rect.top) * GAME_W) / rect.width);
}

/** Today's daily is being played in another tab right now (fresh heartbeat). */
function liveElsewhere(dateKey) {
  const e = store.getDaily(dateKey);
  return !!e && e.status === 'playing' && e.owner !== TAB_ID && Number.isFinite(e.beatAt) && Date.now() - e.beatAt < STALE_MS;
}

function playDaily() {
  const dateKey = todayKey();
  let entry = store.getDaily(dateKey);
  if (entry && entry.status === 'playing' && !(run.mode === 'daily' && run.dateKey === dateKey && !run.over)) {
    if (liveElsewhere(dateKey)) {
      ui.toast(S.otherTab, 3000);
      return;
    }
    // Started in a tab that is gone, or a crashed session: it counts (one try per day), and pays.
    payRecovered(store.recoverUnfinished(dateKey));
    planReminders();
    entry = store.getDaily(dateKey);
  }
  if (entry && entry.status === 'done') {
    showDoneResults(dateKey, entry.result);
    return;
  }
  resetRun('daily', dateKey);
  startGame({
    mode: 'daily', seed: seedFor(dateKey), dayNumber: run.dayNumber, dateKey, autoplay: AUTO,
    challenge: activeChallenge() ? activeChallenge().heightM : 0,
  });
  screen = 'game';
  ui.showInGame();
  renderTray();
}

function playPractice() {
  resetRun('practice');
  const seed = SEED_OVERRIDE || randomSeed('oefen');
  startGame({ mode: 'practice', seed, autoplay: AUTO });
  screen = 'game';
  ui.showInGame();
  renderTray();
}

function showDoneResults(dateKey, result) {
  screen = 'results';
  // the attract tower keeps still (and its crane out of the title) behind a revisited result
  const gs = gameScene();
  if (gs && gs.idle) {
    gs.inputLocked = true;
    if (gs.crane) gs.crane.setVisible(false);
  }
  ui.showResults({
    result,
    stats: store.getStats(dateKey),
    isNewBest: false,
    shareText: shareTextFor(result),
    nextDayAt: nextDayFor(dateKey),
    mode: 'daily',
    ...resultsExtras(result),
  });
  showPercentile(result);
  sleepLoop(RESULTS_SLEEP_MS);
}

function shareTextFor(result) {
  return buildShareText(result, { url: shareUrlFor(siteUrl(), result), highContrast: !!settings.highContrast });
}

/** What the daily results add beyond the result itself: the skyline, tomorrow's teaser and the install offer. */
function resultsExtras(r) {
  if (!r || r.mode !== 'daily' || !r.dateKey) return {};
  return { city: skylineFor(r.dateKey), teaser: tomorrowTeaser(r.dateKey), install: installMode() };
}

function canPause() {
  const gs = gameScene();
  return run.mode !== 'idle' && !run.over && !run.paused && screen === 'game' && !!gs && !gs.over;
}

function pauseGame() {
  if (!canPause()) return;
  const gs = gameScene();
  if (!gs || !gs.sys.isActive()) return;
  run.paused = true;
  game.scene.pause('Game');
  if (game.scene.isActive('Hud')) game.scene.pause('Hud');
  audio.suspend();
  saveProgressNow();
  screen = 'pause';
  ui.showPause({ mode: run.mode, started: run.started });
  sleepLoop(120);
}

function resumeScenes() {
  if (!run.paused) return;
  wakeLoop();
  run.paused = false;
  if (game.scene.isPaused('Game')) game.scene.resume('Game');
  if (game.scene.isPaused('Hud')) game.scene.resume('Hud');
  audio.resume();
}

function resumeGame() {
  if (!run.paused) return;
  if (landscape()) return;   // still sideways: stay on the pause card
  resumeScenes();
  screen = 'game';
  ui.showInGame();
  renderTray();
}

/** Snapshot of a running daily straight into storage (tab hidden, page closing). */
function saveProgressNow() {
  if (run.mode !== 'daily' || run.over || !run.started || !run.dateKey) return;
  const gs = gameScene();
  if (!gs || !gs.buildResult || gs.over) return;
  try {
    store.saveDailyProgress(run.dateKey, gs.buildResult('quit'));
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------
// One try per day: heartbeat, other tabs, the Back button
// ---------------------------------------------------------------------------
let beatTimer = 0;

function startHeartbeat() {
  clearInterval(beatTimer);
  beatTimer = setInterval(() => {
    if (run.mode === 'daily' && run.started && !run.over && run.dateKey) store.touchDaily(run.dateKey);
    else stopHeartbeat();
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  clearInterval(beatTimer);
  beatTimer = 0;
}

// The finished (or recovered) daily was written by another tab: end this one and show what counts.
window.addEventListener('storage', () => {
  if (run.mode !== 'daily' || run.over || !run.started || !run.dateKey) return;
  const e = store.getDaily(run.dateKey);
  if (e && e.status === 'done') {
    if (run.paused) resumeScenes();
    screen = 'game';
    bus.emit('game:quit');
  }
});

// Android Back during a daily pauses instead of leaving the app (which would end the try).
let backGuard = false;
let ignorePop = false;

function armBackGuard() {
  if (backGuard || !history.pushState) return;
  try {
    history.pushState({ stapel: 'play' }, '');
    backGuard = true;
  } catch {
    // sandboxed frames
  }
}

function releaseBackGuard() {
  if (!backGuard) return;
  backGuard = false;
  if (history.state && history.state.stapel === 'play') {
    ignorePop = true;
    history.back();
  }
}

// The website's Back button (the app's comes through app/shim.js) goes one step back in the game, like
// Esc: a sheet closes, a tower pauses, a screen goes home. Only on the bare menu does it leave the page:
// everywhere else one history entry of ours stands in front of it.
let guardTimer = 0;
function syncBackGuard() {
  if (IN_APP) return;
  clearTimeout(guardTimer);
  guardTimer = setTimeout(() => {
    const v = ui.view();
    if (v.screen !== 'menu' || v.modal) armBackGuard();
    else releaseBackGuard();
  }, 0);
}
bus.on('ui:view', syncBackGuard);

window.addEventListener('popstate', () => {
  if (ignorePop) {
    ignorePop = false;
    return;
  }
  backGuard = false;
  window.dispatchEvent(new CustomEvent('stapel:back', { cancelable: true }));
  syncBackGuard();
});

// ---------------------------------------------------------------------------
// Bus wiring
// ---------------------------------------------------------------------------
bus.on('ui:play-daily', playDaily);
bus.on('ui:install', async () => {
  await promptInstall();
  ui.setInstall(installMode());
});
bus.on('ui:install-dismiss', () => {
  dismissInstall();
  ui.setInstall(installMode());
});
onInstallChange(() => ui.setInstall(installMode()));
bus.on('ui:play-practice', playPractice);

// ---------------------------------------------------------------------------
// The short lesson (1.10): a new player's first Oefen game, four steps that follow what they do
// (tap, aim for a Perfek, Perfeks in a row, the water and the hearts), then "Jy is reg!". The usual
// first-game hints stay quiet meanwhile. Skippable; anyone can take it again from "Hoe speel ek?".
// ---------------------------------------------------------------------------
function lessonStep(step, text) {
  lesson.step = step;
  lesson.after = 0;
  ui.showTutor({ step, total: LESSON_STEPS, text });
}

function startLesson() {
  resetRun('practice');
  startGame({ mode: 'practice', seed: LESSON_SEED, autoplay: AUTO, coach: false });
  screen = 'game';
  ui.showInGame();
  renderTray();
  lesson = { step: 0, landings: 0, after: 0 };
  lessonStep(1, S.lesson1);
}

function endLesson({ done = false } = {}) {
  if (!lesson) return;
  lesson = null;
  store.markTutorialSeen();   // the basics are known: no first-game hints after this
  if (done) ui.showTutor({ done: true, daily: store.getDaily(todayKey())?.status !== 'done' });
  else ui.showTutor(null);
}

bus.on('ui:lesson', startLesson);
bus.on('game:dropped', () => {
  if (lesson?.step === 1) lessonStep(2, S.lesson2);
});
bus.on('game:rated', ({ rating } = {}) => {
  if (!lesson) return;
  lesson.landings++;
  lesson.after++;
  if (lesson.step === 2 && (rating === 'P' || lesson.after >= 5)) lessonStep(3, rating === 'P' ? S.lesson3 : S.lesson3b);
  else if (lesson.step === 3 && lesson.after >= 2) lessonStep(4, S.lesson4);
  else if (lesson.step === 4 && lesson.after >= 2) endLesson({ done: true });
});
bus.on('ui:lesson-close', () => {
  endLesson();
  ui.showTutor(null);
});
bus.on('ui:lesson-daily', () => {
  ui.showTutor(null);
  bus.emit('ui:play-daily');
});

// A challenge link opened while the app was already running (app/shim.js): straight to it, or, in the
// middle of a tower, once that tower is done (the home button).
let linkWaiting = false;
window.addEventListener('stapel:link', (e) => {
  let q = '';
  try {
    q = new URL(String(e.detail)).search;
  } catch {
    return;
  }
  const klop = /[?&]klop=/.test(q) ? loadChallenge(q, todayKey()) : null;
  if (klop) {
    challengeRaw = klop;   // "Kan jy my klop?": on the daily card (now, or when the menu comes back)
    if (screen === 'menu') showMenu();
  }
  const link = parseChallengeQuery(q);
  const room = parseRoomQuery(q);
  if (!link && !room) return;
  duelLink = link;
  duelRoom = room;
  // a tower in progress (paused too), its game-over reveal, or a match counting down finishes first
  const busy = (run.mode !== 'idle' && screen !== 'results' && screen !== 'menu') || (screen === 'duelwait' && !!duel.match);
  if (busy) {
    linkWaiting = true;
    ui.toast(S.linkLater, 3200);
    return;
  }
  ui.closeModal();
  openDuelLink();
});

// ---------------------------------------------------------------------------
// The daily reminder (1.10; only the Android app has it: app/shim.js window.stapelApp.reminders). One
// message a day at the time the player chose, planned a week ahead, never on a day whose tower is
// built. Asked once, after the first Daily Tower; Statistiek changes it.
// ---------------------------------------------------------------------------
const REMIND = window.stapelApp?.reminders || null;
const REMIND_DAYS = 7;
const REMIND_ID = 7000;
ui.setReminderInfo(!!REMIND, store.getReminder().time);

/** The reminders of the next REMIND_DAYS days (the week chest's box if every day before is played). */
function reminderList(time, now = new Date()) {
  const [hh, mm] = time.split(':').map(Number);
  const today = todayKey();
  const week = store.getWeek();
  // the week chest's box every other day (the strongest reason to come back), the others in turn
  const texts = (day, coins, n) => (n % 2 === 0 ? S.remind2(day, coins) : [S.remind1, S.remind3, S.remind4][Math.floor(n / 2) % 3]);
  const list = [];
  for (let k = 0; k < REMIND_DAYS; k++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, hh, mm, 0, 0);
    if (at.getTime() <= now.getTime() + 60000) continue;
    if (k === 0 && store.getDaily(today)?.status === 'done') continue;   // built already
    // it only fires if the game wasn't opened since (that plans again): the box waiting that day, as is
    const day = weekView(week, dateKeyFor(at)).day;
    const n = Math.floor(at.getTime() / 86400000);   // the day's number: the same text for the same day
    list.push({ id: REMIND_ID + k, at: at.getTime(), title: 'Stapel', body: texts(day, WEEK_COINS[day - 1], n) });
  }
  return list;
}

/** (Re)plan the reminders: after a daily, at start, back in the app, or a new time. */
function planReminders() {
  if (!REMIND) return;
  const { time } = store.getReminder();
  if (!time) {
    REMIND.set([]).catch(() => {});
    return;
  }
  REMIND.permission().then((p) => (p === 'granted' ? REMIND.set(reminderList(time)) : null)).catch(() => {});
}

function askReminder() {
  if (!REMIND || store.getReminder().asked || screen !== 'results') return;
  store.setReminder({ time: null, asked: true });   // asked once, whatever the answer (✕ and Back too)
  ui.showReminder({ time: null });
}

bus.on('ui:remind', () => ui.showReminder({ time: store.getReminder().time }));
bus.on('ui:remind-pick', (time) => {
  if (!REMIND) return;
  if (!time) {
    store.setReminder({ time: null, asked: true });
    ui.setReminderInfo(true, null);
    planReminders();
    return;
  }
  REMIND.ask().then((ok) => {
    store.setReminder({ time: ok ? time : null, asked: true });
    ui.setReminderInfo(true, ok ? time : null);
    ui.toast(ok ? S.remindSet(time) : S.remindDenied, 3200);
    planReminders();
  }, () => ui.toast(S.remindDenied, 3200));
});
bus.on('ui:pause', pauseGame);
bus.on('ui:resume', resumeGame);
bus.on('ui:quit', () => {
  if (run.mode === 'idle' || run.over) return;
  resumeScenes();
  screen = 'game';
  ui.showInGame();
  renderTray();
  bus.emit('game:quit');
});
bus.on('ui:home', () => {
  if (lesson) endLesson();
  if (linkWaiting) {
    linkWaiting = false;
    duel.leave();
    startIdle();
    if (openDuelLink()) return;
  }
  stopDuelFlow();
  duel.leave();
  if (run.mode !== 'idle' || run.paused) {
    startIdle();
  } else {
    const gs = gameScene();
    if (gs && gs.idle) {
      gs.inputLocked = false;
      if (gs.crane) gs.crane.setVisible(true);
    }
  }
  showMenu();
});
// Afrikaans or English. The same language: carry on. A new one: start again in it (drawn text and
// textures keep the words they were made with). The address says which (?lang=), so it works where
// nothing can be saved too; the first start goes back to the address it was opened with (its link).
let langSwitching = false;
bus.on('ui:lang', (lang) => {
  if (!isLang(lang) || langSwitching) return;
  store.setLang(lang);
  const first = askLanguage;
  askLanguage = false;
  if (lang !== getLanguage()) {
    langSwitching = true;   // a second tap must not start a second (link-less) reload
    const u = new URL(first ? BOOT_URL : location.href, location.href);
    u.searchParams.set('lang', lang);
    location.replace(u.pathname + u.search + u.hash);
    return;
  }
  ui.closeModal();
  if (first && !openDuelLink()) firstVisit();
});

/** A new player's first visit (no link): "Hoe speel ek?" opens by itself, once; its "Kom ons bou!" starts the lesson. */
function firstVisit() {
  if (store.hasPlayed() || settings.howtoSeen) return;
  ui.showHowTo({ lesson: true });
  settings = store.setSettings({ howtoSeen: true });
}
bus.on('ui:settings', (partial) => {
  settings = store.setSettings(partial || {});
  audio.setEnabled(settings.sound);
  haptics.setEnabled(settings.vibration);
});
bus.on('ui:day-rollover', () => {
  if (screen === 'menu') showMenu();
});

// ---------------------------------------------------------------------------
// Uitdagersreeks (head-to-head): js/duel.js runs the match; these are the screens around it.
// ---------------------------------------------------------------------------
// without a nickname of their own a player is "Bouer 123": the same number every visit (from the
// phone's random leaderboard number), so the board and the Uitdagersreeks show one name
const sessionNick = defaultNicknameFor(store.getBoardPlayer());
const duelNick = () => store.getDuel().name || sessionNick;
let duelReward = null;   // the decided match's coins and rank points, for its results card
const duel = createDuel({
  bus,
  apiUrl: matchApiUrl(),
  nickname: duelNick,
  card: () => store.getCard(),
  onDecided: (outcome) => {
    if (outcome !== 'won' && outcome !== 'lost') return;
    store.recordDuel(outcome);
    // a live opponent counts for more than a recording or Robot Rikus (js/core/economy.js)
    const live = duel.match?.kind === 'live';
    duelReward = { coins: awardCoins({ mode: 'duel', outcome, live }), rank: store.recordDuelRank({ outcome, live }) };
  },
});
// A friend's run (?teen=...) or live room (?kamer=CODE) from the link this page was opened with, and a
// language from the address (?lang=, already applied by js/core/langboot.js). They are taken off the
// address straight away, so a reload or a shared screenshot doesn't repeat them.
let duelLink = parseChallengeQuery(location.search);
let duelRoom = parseRoomQuery(location.search);
// The website on an Android phone: a challenge link can go on in the app (Chrome's intent: link; the
// app installed opens it, else the page stays). Built before the address is cleaned up below.
const APP_LINK = !IN_APP && /Android/i.test(navigator.userAgent || '') && (duelLink || duelRoom) && !params.has('noapp')
  ? (() => {
    const back = new URL(location.href);
    back.searchParams.set('noapp', '1');   // no app here: the page again, without the button
    return `intent://stapelspel.pages.dev/${location.search}#Intent;scheme=https;package=com.lekkerlocal.stapel;S.browser_fallback_url=${encodeURIComponent(back.href)};end`;
  })()
  : null;
// tapped: the app takes the room over, so this page lets go of it (else it would join it too)
bus.on('ui:app-open', () => {
  stopDuelFlow();
  duel.cancel();
});
if (params.has('teen') || params.has('kamer') || params.has('lang')) {
  try {
    const q = new URLSearchParams(location.search);
    q.delete('teen');
    q.delete('kamer');
    q.delete('lang');
    const rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
  } catch {
    // sandboxed frames: the parameters simply stay
  }
}
let duelFlow = 0;        // bumps on every new search or cancel, so a late answer can't start a stale match
let duelTimer = 0;
let lastDuelKind = null;

function stopDuelFlow() {
  duelFlow++;
  clearInterval(duelTimer);
  duelTimer = 0;
  duel.cancel();
}

function showDuelScreen() {
  stopDuelFlow();
  screen = 'duel';
  // the season first: a new month halves the points and hands out last month's badge
  const rank = store.getSeasonRank();
  ui.showDuel({ live: duel.live, duel: store.getDuel(), placeholder: sessionNick, rank, card: store.getCard() });
  seasonToast(rank.reward);
}

/** A new month began: "Nuwe seisoen! Jy hou ’n Goud-kenteken 🥇" (the badge of the season that ended). */
function seasonToast(reward) {
  const badge = reward ? cosmetic('badge', reward) : null;
  const r = badge ? RANK_INFO[reward.slice(2)] : null;
  if (r) ui.toast(S.seasonReward(r.name, badge.emoji), 4000);
}

/** "Teen <naam>!", 3-2-1, "Bou!", then the tower. */
function versus(m, note = '') {
  if (!m) return;
  clearInterval(duelTimer);
  const flow = ++duelFlow;
  lastDuelKind = m.kind;
  screen = 'duelwait';
  ui.showDuelWait({ state: 'versus', oppName: m.oppName, oppCard: m.oppCard, youName: duelNick(), youCard: store.getCard(), note });
  let n = Math.max(1, Math.round(DUEL.countdownMs / 1000));
  ui.setDuelCount(String(n));
  duelTimer = setInterval(() => {
    if (flow !== duelFlow) return;
    n -= 1;
    if (n > 0) {
      ui.setDuelCount(String(n));
      audio.play('click');
      return;
    }
    clearInterval(duelTimer);
    ui.setDuelCount(S.duelGo);
    audio.play('banner');
    setTimeout(() => {
      if (flow === duelFlow) startDuelGame(m);
    }, 450);
  }, 1000);
}

function startDuelGame(m) {
  duelReward = null;
  resetRun('duel');
  startGame({ mode: 'duel', seed: m.seed, duel: { name: m.oppName }, autoplay: AUTO });
  screen = 'game';
  ui.showInGame();
  renderTray();
}

function showDuelResults(r) {
  if (screen === 'results' || run.mode !== 'duel') return;
  const d = duel.summary() || {};
  if (!d.outcome) d.outcome = 'none';
  const link = d.challenge ? `${siteUrl()}?teen=${d.challenge}` : '';
  screen = 'results';
  ui.showResults({
    result: r,
    mode: 'duel',
    duel: d,
    reward: duelReward,
    shareText: buildDuelShareText({ outcome: d.outcome, youBest: d.youBest, oppName: d.oppName, oppBest: d.oppBest, link }),
    nextDayAt: 0,
  });
  // the winner's celebration (js/core/economy.js): ours with the fanfare, or theirs as they see it
  if (d.outcome === 'won') ui.celebrate(store.getCard().celebration);
  else if (d.outcome === 'lost' && d.reason !== 'quit') ui.celebrate(d.oppCard?.celebration, { caption: S.duelTheyCelebrate(d.oppName || S.duelSomeone), sound: false });
  seasonToast(duelReward?.rank?.reward);   // this match began a new month
  sleepLoop(RESULTS_SLEEP_MS);
}

/** A random opponent: the lobby pairs two players; after 20 s a recording or Robot Rikus. */
function searchOpponent() {
  stopDuelFlow();
  const flow = duelFlow;
  screen = 'duelwait';
  ui.showDuelWait({ state: 'search' });
  const until = Date.now() + DUEL.searchMs;
  const tick = () => ui.setDuelCount(`${Math.max(0, Math.ceil((until - Date.now()) / 1000))}`);
  tick();
  duelTimer = setInterval(tick, 500);
  duel.findOpponent({
    onFound: (m) => {
      if (flow === duelFlow) versus(m);
    },
    onFallback: (m, note) => {
      if (flow === duelFlow) versus(m, note);
    },
  });
}

bus.on('ui:duel', showDuelScreen);
// first to a height mark: choose the punishment (js/duel.js times it out with the default)
bus.on('duel:choose', (c) => ui.showPunish(c));
bus.on('duel:chosen', () => ui.hidePunish());
const NAME_BOARD_MS = 4000;
let nameBoardTimer = 0;
bus.on('ui:duel-name', (text) => {
  const saved = store.setDuelName(text);
  ui.setDuelName(saved);
  if (saved?.ok) {
    clearTimeout(nameBoardTimer);
    nameBoardTimer = setTimeout(boardChanged, NAME_BOARD_MS);   // the latest leaderboard row takes the new name
  }
});
bus.on('ui:duel-bot', () => versus(duel.startBot()));
bus.on('ui:duel-random', searchOpponent);
bus.on('ui:duel-friend', () => {
  if (!duel.live) {
    // no server yet: play a round first; its results carry the link for the friend
    versus(duel.startBot(), S.duelFriendLater);
    return;
  }
  stopDuelFlow();
  const flow = duelFlow;
  duel.createRoom({
    onCode: (code) => {
      if (flow !== duelFlow) return;
      const link = `${siteUrl()}?kamer=${code}`;
      screen = 'duelwait';
      ui.showDuelWait({ state: 'room', link, shareText: S.duelRoomText(duelNick(), link) });
    },
    onStart: (m) => {
      if (flow === duelFlow) versus(m);
    },
    onFail: (msg) => {
      if (flow !== duelFlow) return;
      screen = 'duelwait';
      ui.showDuelWait({ state: 'error', text: msg });
    },
    // the link was shared from another app: the room waits, and the game finds its way back to it
    onRetry: () => {
      if (flow === duelFlow) ui.setDuelWaitNote(S.duelReconnecting);
    },
    onWait: () => {
      if (flow === duelFlow) ui.setDuelWaitNote(null);
    },
  });
});
bus.on('ui:duel-later', () => {
  stopDuelFlow();
  versus(duel.startBot(), S.duelFriendLater);
});
bus.on('ui:duel-cancel', showDuelScreen);
bus.on('ui:duel-accept', () => {
  const m = duelLink ? duel.startLink(duelLink) : null;
  duelLink = null;
  if (m) versus(m);
  else showDuelScreen();
});
bus.on('ui:duel-again', () => {
  duel.leave();
  if (duel.live && lastDuelKind !== 'bot') searchOpponent();
  else versus(duel.startBot());
});

/** Opened from a friend's link: their run (play it now?) or their live room (join it). */
function openDuelLink() {
  if (duelLink) {
    const best = Math.max(0, ...duelLink.run.samples) / 10;
    screen = 'duelwait';
    ui.showDuelWait({ state: 'link', oppName: duelLink.name || S.duelSomeone, height: best, appLink: APP_LINK });
    return true;
  }
  if (duelRoom) {
    const code = duelRoom;
    duelRoom = null;
    stopDuelFlow();
    const flow = duelFlow;
    screen = 'duelwait';
    if (!duel.live) {
      ui.showDuelWait({ state: 'error', text: S.duelOffline });
      return true;
    }
    ui.showDuelWait({ state: 'search', appLink: APP_LINK });
    ui.setDuelCount(S.duelJoining);
    duel.joinRoom(code, {
      onStart: (m) => {
        if (flow === duelFlow) versus(m);
      },
      onFail: (msg) => {
        if (flow !== duelFlow) return;
        ui.showDuelWait({ state: 'error', text: msg });
      },
      onRetry: () => {
        if (flow === duelFlow) ui.setDuelCount(S.duelReconnecting);
      },
      onWait: () => {
        if (flow === duelFlow) ui.setDuelCount(S.duelJoining);
      },
    });
    return true;
  }
  return false;
}

// Game over: the pause button goes away during the reveal (results follow).
bus.on('hud:hide', () => {
  if (screen === 'game' && run.mode !== 'idle') ui.hideAll();
});

bus.on('game:started', (partial) => {
  if (run.mode === 'idle') return;
  run.started = true;
  if (run.mode === 'daily' && partial && partial.dateKey) {
    store.startDaily(partial.dateKey, partial, { owner: TAB_ID });
    startHeartbeat();
  }
});
bus.on('game:progress', (partial) => {
  if (run.mode === 'daily' && partial && partial.dateKey && !run.over) store.saveDailyProgress(partial.dateKey, partial);
});

/** Coins for a finished game (js/core/economy.js): { added, total, short } (short: the day's cap held some back). */
function awardCoins(game) {
  const earned = coinsForGame(game);
  if (!earned.coins) return { added: 0, total: store.getEconomy().coins, short: false };
  const r = store.earnCoins(earned.coins, { capped: earned.capped });
  return { added: r.added, total: r.coins, short: r.added < earned.coins };
}

/**
 * Dailies that ended without their results (the page was closed, the app killed or crashed mid-game)
 * count as they were when they stopped, and pay their coins like any finished daily. Returns the coins.
 */
function payRecovered(results) {
  if (!results?.length) return 0;
  const streak = store.getStats().currentStreak;
  return results.reduce((sum, r) => {
    const paid = awardCoins({ mode: 'daily', heightM: r.heightM, perfects: r.perfects, streak }).added;
    const box = store.openWeekBox(r.dateKey);   // its try is used: its box opens
    return sum + paid + (box ? box.coins : 0);
  }, 0);
}

/** The result is saved the moment the game ends (the results screen comes a few seconds later). */
function finalize(result) {
  if (run.final) return run.final;
  run.over = true;
  stopHeartbeat();
  if (result.mode === 'duel') {
    // a match keeps its own wins and losses (recorded by js/duel.js once it is decided)
    run.final = { result, stats: null, isNewBest: false, aborted: false };
    return run.final;
  }
  let shown = result;
  let stats = null;
  let isNewBest = false;
  let aborted = false;
  if (result.mode === 'daily' && result.dateKey) {
    if (result.blocksDropped === 0 && !store.getDaily(result.dateKey)) {
      aborted = true;   // left before the first drop: nothing was played, the try is still there
    } else {
      stats = store.finishDaily(result.dateKey, result);
      pushSkyline();   // today's tower joins the skyline behind the results
      isNewBest = !!(stats.applied && (stats.isNewBestHeight || stats.isNewBestScore));
      if (!stats.applied) {
        // finished (or taken over) elsewhere: show and share what actually counts
        const e = store.getDaily(result.dateKey);
        if (e && e.result) shown = e.result;
      }
    }
  } else {
    const rec = store.recordPractice(result);
    isNewBest = !!rec.isNewBest;
  }
  // coins: the daily tower pays in full (once); Oefen counts towards the day's cap
  let coins = null;
  let week = null;
  if (result.mode === 'daily' && stats?.applied) {
    coins = awardCoins({ mode: 'daily', heightM: shown.heightM, perfects: shown.perfects, streak: stats.currentStreak });
    week = store.openWeekBox(result.dateKey);   // the day's box of the weekkis
    if (week) coins = { ...coins, total: week.total };
  } else if (result.mode === 'practice') {
    coins = awardCoins({ mode: 'practice', heightM: result.heightM, perfects: result.perfects });
  }
  run.final = { result: shown, stats, isNewBest, aborted, coins, week };
  return run.final;
}

bus.on('game:final', (result) => {
  if (!result || run.mode === 'idle') return;
  finalize(result);
  // the first real game is the tutorial: once it got somewhere, the hints and the menu nudge are done
  if (tutorialDone(result.blocksDropped)) store.markTutorialSeen();
});

bus.on('game:over', (result) => {
  if (lesson) endLesson();
  if (!result || run.mode === 'idle' || screen === 'results' || screen === 'menu') return;
  const f = finalize(result);
  if (run.paused) resumeScenes();
  if (result.mode === 'duel') {
    duel.whenDecided(() => showDuelResults(f.result));
    return;
  }
  if (f.aborted) {
    startIdle();
    showMenu();
    return;
  }
  if (f.isNewBest) audio.play('record');
  screen = 'results';
  const r = f.result;
  ui.showResults({
    result: r,
    stats: f.stats,
    isNewBest: f.isNewBest,
    reward: f.coins || f.week ? { coins: f.coins, week: f.week } : null,
    shareText: shareTextFor(r),
    nextDayAt: r.mode === 'daily' ? nextDayFor(r.dateKey) : 0,
    mode: r.mode,
    ...resultsExtras(r),
  });
  showPercentile(r);
  sleepLoop(RESULTS_SLEEP_MS);
  if (r.mode === 'daily') {
    planReminders();   // today is built: no reminder today
    if (REMIND && !store.getReminder().asked) setTimeout(askReminder, 2600);
  }
});

// Tab hidden / app switched away mid-tower: pause like the button does, and save. A friend room
// still waiting lets go of its connection meanwhile (the match can't start without this player).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveProgressNow();
    duel.away();
    if (canPause()) pauseGame();
    else audio.suspend();
  } else {
    duel.back();
    planReminders();
    if (!run.paused) audio.resume();
  }
});
window.addEventListener('pagehide', saveProgressNow);

// Sideways phone: the rotate overlay covers the game, so pause it.
const landscapeMq = window.matchMedia ? matchMedia('(orientation: landscape) and (max-height: 540px) and (pointer: coarse)') : null;
const landscape = () => !!(landscapeMq && landscapeMq.matches);
function onOrientation() {
  if (landscape() && canPause()) pauseGame();
  scheduleLayout();
}
if (landscapeMq) {
  if (landscapeMq.addEventListener) landscapeMq.addEventListener('change', onOrientation);
  else if (landscapeMq.addListener) landscapeMq.addListener(onOrientation);
}

// ---------------------------------------------------------------------------
// Layout: keep the DOM overlay exactly over the canvas; expose safe-area insets
// (in game px) so the HUD can avoid notches.
// ---------------------------------------------------------------------------
const insetProbe = document.createElement('div');
insetProbe.setAttribute('aria-hidden', 'true');
insetProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
  // (the app's SystemBars plugin sets --safe-area-inset-*: older Android WebViews get env() wrong)
  + 'padding-top:var(--safe-area-inset-top,env(safe-area-inset-top,0px));'
  + 'padding-bottom:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px));';
document.body.appendChild(insetProbe);

let refitGuard = 0;
function relayout() {
  const canvas = game.canvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return;
  // A fitted canvas fills its parent in one direction. If it doesn't, Phaser re-fitted
  // with a stale size (its orientation handler can run after the resize): fit again.
  const parent = document.getElementById('game');
  const pr = parent ? parent.getBoundingClientRect() : null;
  if (pr && Math.abs(rect.width - pr.width) > 2 && Math.abs(rect.height - pr.height) > 2 && refitGuard < 3) {
    refitGuard++;
    refit();
    return;
  }
  refitGuard = 0;
  ui.layout(rect);
  const cs = getComputedStyle(insetProbe);
  const k = GAME_W / rect.width;
  const top = Math.max(0, (parseFloat(cs.paddingTop) || 0) - Math.max(0, rect.top)) * k;
  const bottom = Math.max(0, (parseFloat(cs.paddingBottom) || 0) - Math.max(0, window.innerHeight - rect.bottom)) * k;
  game.registry.set('safeTop', Math.round(top));
  game.registry.set('safeBottom', Math.round(bottom));
  updateMenuAnchor();
}

/**
 * Re-fit the canvas, then the DOM. Phaser re-fits on its own orientation event
 * while the old parent size is still cached (and then never again), so after a
 * rotation the canvas could stay sized for the other orientation.
 */
function refit() {
  try {
    game.scale.getParentBounds();
    game.scale.refresh();   // emits 'resize' -> scheduleRelayout
  } catch {
    // not booted yet
  }
}

let layoutRaf = 0;
let layoutTimer = 0;
/** Window resized or rotated: re-fit Phaser (which fires its own 'resize'), then the DOM. */
function scheduleLayout() {
  cancelAnimationFrame(layoutRaf);
  clearTimeout(layoutTimer);
  layoutRaf = requestAnimationFrame(() => {
    refit();
    relayout();
    layoutTimer = setTimeout(() => { refit(); relayout(); }, 120);   // the browser settles bars/rotation a beat later
  });
}
/** Phaser re-fitted the canvas: only the DOM follows (re-fitting again here would loop). */
function scheduleRelayout() {
  cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(relayout);
}
window.addEventListener('resize', scheduleLayout);
window.addEventListener('orientationchange', scheduleLayout);
if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
  window.screen.orientation.addEventListener('change', scheduleLayout);
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleLayout);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function onReady() {
  game.scale.on('resize', scheduleRelayout);
  relayout();
  watchContextLoss();

  const recovered = store.recoverUnfinished(todayKey(), { staleMs: STALE_MS, owner: TAB_ID });
  const recoveredCoins = payRecovered(recovered);
  startIdle();
  showMenu();
  retryBoard();
  planReminders();
  // a new player chooses a language first; a challenge link waits for that choice
  if (askLanguage) ui.showLanguage({ first: true });
  else if (!openDuelLink()) firstVisit();
  ui.setLoading(false);
  if (recovered.length) ui.toast(recoveredCoins ? `${S.unfinished} +${recoveredCoins} 🪙` : S.unfinished, 3600);
  else if (liveElsewhere(todayKey())) ui.toast(S.otherTab, 3000);
  if (DEBUG) startFpsMeter();
  window.__stapel.booted = true;
}

/** A GPU reset mid-tower: pause (the water must not rise unseen) and say so if it doesn't come back. */
function watchContextLoss() {
  const r = game.renderer;
  const ev = Phaser.Renderer && Phaser.Renderer.Events;
  if (!r || !r.on || !ev || !ev.LOSE_WEBGL) return;
  let lostTimer = 0;
  r.on(ev.LOSE_WEBGL, () => {
    if (canPause()) pauseGame();
    clearTimeout(lostTimer);
    lostTimer = setTimeout(() => ui.toast(S.reloadNeeded, 6000), 3000);
  });
  r.on(ev.RESTORE_WEBGL, () => clearTimeout(lostTimer));
}

if (game.isBooted) onReady();
else game.events.once('ready', onReady);

// ---------------------------------------------------------------------------
// Service worker (offline play). Not for debug sessions.
// ---------------------------------------------------------------------------
const swAllowed = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if ('serviceWorker' in navigator && swAllowed && !NO_SW) {
  const registerSw = () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  if (document.readyState === 'complete') registerSw();
  else window.addEventListener('load', registerSw, { once: true });
}

// ---------------------------------------------------------------------------
// Debug: tiny fps meter
// ---------------------------------------------------------------------------
function startFpsMeter() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:99;padding:2px 6px;border-radius:6px;'
    + 'font:12px/1.3 monospace;color:#fff;background:rgba(0,0,0,.55);pointer-events:none;';
  document.body.appendChild(el);
  setInterval(() => {
    const gs = gameScene();
    const st = gs && gs.sys.isActive() && gs.getState ? gs.getState() : null;
    el.textContent = `${Math.round(game.loop.actualFps)} fps`
      + (st ? ` · ${st.mode} #${st.i} · ${st.heightM} m · ⭐${st.score} · ❤${st.lives}${st.active ? ' · ' + st.active : ''}` : '');
  }, 500);
}
