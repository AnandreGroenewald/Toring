// Stapel — boot + wiring: Phaser game, storage, DOM UI, audio, bus events,
// pause/visibility, settings, service worker and debug hooks.
import { GAME_W, computeGameHeight, SITE_URL_FALLBACK } from './config.js';
import { bus } from './core/bus.js';
import { S } from './core/strings.js';
import { fmtDateKey } from './core/format.js';
import { createStore } from './core/storage.js';
import { dateKeyFor, dayNumber, seedFor, nextDayTimestamp, parseDebugDate } from './core/daily.js';
import { createSequence } from './core/sequence.js';
import { buildShareText } from './core/share.js';
import { createUI } from './ui/dom.js';
import { audio, haptics } from './audio.js';
import { BgScene } from './scenes/BgScene.js';
import { GameScene } from './scenes/GameScene.js';
import { HudScene } from './scenes/HudScene.js';

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const NO_SW = params.has('nosw') || DEBUG;
const DEBUG_DATE = DEBUG ? parseDebugDate(location.search) : null;
const SEED_OVERRIDE = params.get('seed');
const AUTO = params.has('auto') ? Math.min(1, Math.max(0.0001, Number(params.get('auto')) || 0)) : 0;

const randomSeed = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const todayKey = () => DEBUG_DATE || dateKeyFor();

function siteUrl() {
  if (location.protocol === 'file:') return SITE_URL_FALLBACK;
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

// ---------------------------------------------------------------------------
// Store, settings, UI
// ---------------------------------------------------------------------------
const store = createStore();
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
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: computeGameHeight(),
  backgroundColor: '#8fd3f4',
  banner: false,
  disableContextMenu: true,
  input: { activePointers: 2 },
  render: { antialias: true, powerPreference: 'high-performance' },
  audio: { noAudio: true },   // all sound is js/audio.js; Phaser's own manager would open a 2nd AudioContext
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BgScene, GameScene, HudScene],
});

window.__stapel = Object.assign(window.__stapel || {}, { game, bus, store, ui, audio });

// What the player is doing right now.
const run = {
  mode: 'idle',       // 'idle' | 'daily' | 'practice'
  dateKey: null,
  dayNumber: null,
  over: false,
  paused: false,
};
let screen = 'menu';   // 'menu' | 'game' | 'pause' | 'results'
const seqCache = new Map();

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
    forecast: sequenceFor(dateKey).forecast(5),
    today: store.getDaily(dateKey),
    stats: store.getStats(dateKey),
    settings,
    nextDayAt: nextDayTimestamp(),
  };
}

function gameScene() {
  return game.scene.getScene('Game');
}

// ---------------------------------------------------------------------------
// Scene control
// ---------------------------------------------------------------------------
function startGame(data) {
  if (run.paused) {
    audio.resume();
    run.paused = false;
  }
  game.scene.stop('Hud');
  game.scene.start('Game', { settings, autoplay: 0, ...data });
}

function startIdle() {
  run.mode = 'idle';
  run.dateKey = null;
  run.dayNumber = null;
  run.over = false;
  startGame({ mode: 'idle', seed: randomSeed('idle') });
}

function showMenu() {
  screen = 'menu';
  ui.showMenu(menuModel());
}

function playDaily() {
  const dateKey = todayKey();
  let entry = store.getDaily(dateKey);
  if (entry && entry.status === 'playing' && !(run.mode === 'daily' && run.dateKey === dateKey && !run.over)) {
    // Started in another tab or a crashed session: it counts (one try per day).
    store.recoverUnfinished(dateKey);
    entry = store.getDaily(dateKey);
  }
  if (entry && entry.status === 'done') {
    showDoneResults(dateKey, entry.result);
    return;
  }
  run.mode = 'daily';
  run.dateKey = dateKey;
  run.dayNumber = dayNumber(dateKey);
  run.over = false;
  startGame({ mode: 'daily', seed: seedFor(dateKey), dayNumber: run.dayNumber, dateKey, autoplay: AUTO });
  screen = 'game';
  ui.showInGame();
}

function playPractice() {
  run.mode = 'practice';
  run.dateKey = null;
  run.dayNumber = null;
  run.over = false;
  const seed = SEED_OVERRIDE || randomSeed('oefen');
  startGame({ mode: 'practice', seed, autoplay: AUTO });
  screen = 'game';
  ui.showInGame();
}

function showDoneResults(dateKey, result) {
  screen = 'results';
  ui.showResults({
    result,
    stats: store.getStats(dateKey),
    isNewBest: false,
    shareText: buildShareText(result, { url: siteUrl() }),
    nextDayAt: nextDayTimestamp(),
    mode: 'daily',
  });
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
  screen = 'pause';
  ui.showPause({ mode: run.mode });
}

function resumeScenes() {
  if (!run.paused) return;
  run.paused = false;
  if (game.scene.isPaused('Game')) game.scene.resume('Game');
  if (game.scene.isPaused('Hud')) game.scene.resume('Hud');
  audio.resume();
}

function resumeGame() {
  if (!run.paused) return;
  resumeScenes();
  screen = 'game';
  ui.showInGame();
}

// ---------------------------------------------------------------------------
// Bus wiring
// ---------------------------------------------------------------------------
bus.on('ui:play-daily', playDaily);
bus.on('ui:play-practice', playPractice);
bus.on('ui:pause', pauseGame);
bus.on('ui:resume', resumeGame);
bus.on('ui:quit', () => {
  if (run.mode === 'idle' || run.over) return;
  resumeScenes();
  screen = 'game';
  ui.showInGame();
  bus.emit('game:quit');
});
bus.on('ui:home', () => {
  if (run.mode !== 'idle' || run.paused) startIdle();
  showMenu();
});
bus.on('ui:settings', (partial) => {
  settings = store.setSettings(partial || {});
  audio.setEnabled(settings.sound);
  haptics.setEnabled(settings.vibration);
});
bus.on('ui:howto-closed', () => store.markTutorialSeen());
bus.on('ui:day-rollover', () => {
  if (screen === 'menu') showMenu();
});

// Game over: the pause button goes away during the reveal (results follow).
bus.on('hud:hide', () => {
  if (screen === 'game' && run.mode !== 'idle') ui.hideAll();
});

bus.on('game:started', (partial) => {
  if (run.mode === 'daily' && partial && partial.dateKey) store.startDaily(partial.dateKey, partial);
});
bus.on('game:progress', (partial) => {
  if (run.mode === 'daily' && partial && partial.dateKey && !run.over) store.saveDailyProgress(partial.dateKey, partial);
});
bus.on('game:over', (result) => {
  if (!result || run.mode === 'idle' || run.over) return;
  run.over = true;
  let stats = null;
  let isNewBest = false;
  if (result.mode === 'daily' && result.dateKey) {
    stats = store.finishDaily(result.dateKey, result);
    isNewBest = !!(stats.isNewBestHeight || stats.isNewBestScore);
  } else {
    const rec = store.recordPractice(result);
    isNewBest = !!rec.isNewBest;
  }
  if (run.paused) resumeScenes();
  if (isNewBest) audio.play('record');
  screen = 'results';
  ui.showResults({
    result,
    stats,
    isNewBest,
    shareText: buildShareText(result, { url: siteUrl() }),
    nextDayAt: nextDayTimestamp(),
    mode: result.mode,
  });
});

// Tab hidden / app switched away mid-tower: pause like the button does.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (canPause()) pauseGame();
    else audio.suspend();
  } else if (!run.paused) {
    audio.resume();
  }
});

// ---------------------------------------------------------------------------
// Layout: keep the DOM overlay exactly over the canvas; expose safe-area insets
// (in game px) so the HUD can avoid notches.
// ---------------------------------------------------------------------------
const insetProbe = document.createElement('div');
insetProbe.setAttribute('aria-hidden', 'true');
insetProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
  + 'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);';
document.body.appendChild(insetProbe);

function relayout() {
  const canvas = game.canvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return;
  ui.layout(rect);
  const cs = getComputedStyle(insetProbe);
  const k = GAME_W / rect.width;
  const top = Math.max(0, (parseFloat(cs.paddingTop) || 0) - Math.max(0, rect.top)) * k;
  const bottom = Math.max(0, (parseFloat(cs.paddingBottom) || 0) - Math.max(0, window.innerHeight - rect.bottom)) * k;
  game.registry.set('safeTop', Math.round(top));
  game.registry.set('safeBottom', Math.round(bottom));
}

let layoutRaf = 0;
function scheduleLayout() {
  cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(() => {
    relayout();
    setTimeout(relayout, 120);   // the browser settles bars/rotation a beat later
  });
}
window.addEventListener('resize', scheduleLayout);
window.addEventListener('orientationchange', scheduleLayout);
if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleLayout);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function onReady() {
  game.scale.on('resize', scheduleLayout);
  relayout();

  const recovered = store.recoverUnfinished(todayKey());
  startIdle();
  showMenu();
  ui.setLoading(false);
  if (recovered.length) ui.toast(S.unfinished, 3200);
  if (!store.tutorialSeen()) ui.showHowTo(true);
  if (DEBUG) startFpsMeter();
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
