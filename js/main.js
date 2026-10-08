// Stapel — boot + wiring: Phaser game, storage, DOM UI, audio, bus events,
// pause/visibility, settings, service worker and debug hooks.
import { GAME_W, computeGameHeight, SITE_URL_FALLBACK, STORAGE_KEY, DUEL } from './config.js';
import { bus } from './core/bus.js';
import { S, POWERUP_INFO, COSMETIC_INFO } from './core/strings.js';
import { fmtDateKey, fmtM } from './core/format.js';
import { createStore } from './core/storage.js';
import { dateKeyFor, dayNumber, seedFor, nextDayTimestamp, parseDebugDate } from './core/daily.js';
import { createSequence } from './core/sequence.js';
import { buildShareText, buildDuelShareText } from './core/share.js';
import { parseChallengeQuery, parseRoomQuery, defaultNickname } from './core/duel.js';
import { coinsForGame, POWERUP_IDS } from './core/economy.js';
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
import { SPONSOR_API_URL, salesEnabled, matchApiUrl } from './sponsorConfig.js';
import { createUI } from './ui/dom.js';
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
const challengeRaw = loadChallenge(location.search, todayKey());
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

/** The results card learns how the player did against everyone else today, when (if) the server answers. */
function showPercentile(result) {
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
  };
}

// ---------------------------------------------------------------------------
// Winkel (1.8): power-ups and looks, bought with coins earned by playing
// ---------------------------------------------------------------------------
function shopModel() {
  const e = store.getEconomy();
  return { coins: e.coins, stock: e.stock, owned: e.owned, look: e.look, card: store.getCard(), name: duelNick() };
}

bus.on('ui:shop', () => ui.showShop(shopModel()));
bus.on('ui:shop-buy', ({ kind, id } = {}) => {
  const r = kind === 'powerup' ? store.buyPowerup(id) : store.buyCosmetic(kind, id);
  if (r.ok) {
    audio.play('heart');
    if (kind !== 'powerup') store.wearCosmetic(kind, id);   // a new look goes on at once
    const name = kind === 'powerup' ? POWERUP_INFO[id]?.name : COSMETIC_INFO[kind]?.[id]?.name;
    if (name) ui.toast(S.bought(name));
  }
  ui.showShop(shopModel());
});
bus.on('ui:shop-wear', ({ kind, id } = {}) => {
  store.wearCosmetic(kind, id);
  ui.showShop(shopModel());
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
function startGame(data) {
  wakeLoop();
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
    // Started in a tab that is gone, or a crashed session: it counts (one try per day).
    store.recoverUnfinished(dateKey);
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

window.addEventListener('popstate', () => {
  if (ignorePop) {
    ignorePop = false;
    return;
  }
  backGuard = false;
  if (run.mode === 'daily' && run.started && !run.over) {
    pauseGame();
    armBackGuard();
  }
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
const sessionNick = defaultNickname();
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
// A friend's run (?teen=...) or live room (?kamer=CODE) from the link this page was opened with. They
// are taken off the address straight away, so a reload or a shared screenshot doesn't repeat them.
let duelLink = parseChallengeQuery(location.search);
let duelRoom = parseRoomQuery(location.search);
if (params.has('teen') || params.has('kamer')) {
  try {
    const q = new URLSearchParams(location.search);
    q.delete('teen');
    q.delete('kamer');
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
  ui.showDuel({ live: duel.live, duel: store.getDuel(), placeholder: sessionNick });
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
bus.on('ui:duel-name', (text) => ui.setDuelName(store.setDuelName(text)));
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
    ui.showDuelWait({ state: 'link', oppName: duelLink.name || S.duelSomeone, height: best });
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
    ui.showDuelWait({ state: 'search' });
    ui.setDuelCount(S.duelJoining);
    duel.joinRoom(code, {
      onStart: (m) => {
        if (flow === duelFlow) versus(m);
      },
      onFail: (msg) => {
        if (flow !== duelFlow) return;
        ui.showDuelWait({ state: 'error', text: msg });
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
    armBackGuard();
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

/** The result is saved the moment the game ends (the results screen comes a few seconds later). */
function finalize(result) {
  if (run.final) return run.final;
  run.over = true;
  stopHeartbeat();
  releaseBackGuard();
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
  if (result.mode === 'daily' && stats?.applied) {
    coins = awardCoins({ mode: 'daily', heightM: shown.heightM, perfects: shown.perfects, streak: stats.currentStreak });
  } else if (result.mode === 'practice') {
    coins = awardCoins({ mode: 'practice', heightM: result.heightM, perfects: result.perfects });
  }
  run.final = { result: shown, stats, isNewBest, aborted, coins };
  return run.final;
}

bus.on('game:final', (result) => {
  if (!result || run.mode === 'idle') return;
  finalize(result);
  // the first real game is the tutorial: once it got somewhere, the hints and the menu nudge are done
  if (tutorialDone(result.blocksDropped)) store.markTutorialSeen();
});

bus.on('game:over', (result) => {
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
    reward: f.coins ? { coins: f.coins } : null,
    shareText: shareTextFor(r),
    nextDayAt: r.mode === 'daily' ? nextDayFor(r.dateKey) : 0,
    mode: r.mode,
    ...resultsExtras(r),
  });
  showPercentile(r);
  sleepLoop(RESULTS_SLEEP_MS);
});

// Tab hidden / app switched away mid-tower: pause like the button does, and save.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveProgressNow();
    if (canPause()) pauseGame();
    else audio.suspend();
  } else if (!run.paused) {
    audio.resume();
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
  startIdle();
  showMenu();
  openDuelLink();
  ui.setLoading(false);
  if (recovered.length) ui.toast(S.unfinished, 3200);
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
