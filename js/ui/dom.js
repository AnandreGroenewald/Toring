// Stapel — DOM overlay UI: menu, how-to, stats, pause, results, toasts and the
// in-game pause button. Phaser draws the game; everything that needs crisp text
// and real buttons lives here, positioned exactly over the canvas by layout().
// All sizes in css/style.css scale with --u (= canvas width / 720 px).

import { GAME_W, PALETTE, RATING_EMOJI, VERSION, computeGameHeight } from '../config.js';
import { WEEK } from '../core/week.js';

const WEEK_COINS = WEEK.coins;
const WEEK_SHIELD_MAX = WEEK.shieldMax;
const WEEK_SHIELD_PRICE = WEEK.shieldPrice;
import { S, WEATHER_INFO, VISITOR_INFO, PUNISH_INFO, RANK_INFO, POWERUP_INFO, COSMETIC_INFO } from '../core/strings.js';
import { COIN, RANKS, RANK_POINTS, rankFor, POWERUPS, POWERUP_IDS, COSMETICS, cosmetic } from '../core/economy.js';
import { fmtM, fmtInt, fmtClock, fmtDuration, dayName, monthName } from '../core/format.js';
import { shareResult } from '../core/share.js';
import { visitorResultLine } from '../core/visitorrules.js';
import { sayingOfTheDay, resultSaying, pauseSaying } from '../core/sayings.js';
import { getLanguage, localSaying } from '../core/i18n.js';
import { opaqueBox, headOf, accessoryPlace } from '../core/emojifit.js';
import { audio, haptics } from '../audio.js';

const GRID_COLS = 10;
const GRID_ROWS = 5;
const END_EMOJI = { flood: '🌊', lives: '💥' };
const REASONS = {
  lives: { emoji: '💥', title: S.overLives, sub: S.overLivesSub },
  flood: { emoji: '🌊', title: S.overFlood, sub: S.overFloodSub },
  quit: { emoji: '🏳️', title: S.overQuit, sub: S.overQuitSub },
};
// (?emojifont=noto: tests only, to see the shop the way Android draws emoji)
const EMOJI_NOTO_FIRST = typeof location !== 'undefined' && /[?&]emojifont=noto\b/.test(location.search);
const NICK_SAVE_MS = 900;   // a nickname is saved this long after typing stops
const CLICK_GUARD_MS = 350;   // swallow double taps on navigation buttons
// In-app grid cells: colour AND a symbol, so every kind of colour blindness can read them (🎁: the clown's gift,
// 🧱: a Fondamentblok).
const CELL_GLYPH = { P: '★', G: '•', S: '∼', X: '✕', B: '🎁', F: '🧱' };
const MAX_TOASTS = 3;
const SHORT_ASPECT = 1.72;    // canvases squatter than this (desktop, tablets) get the compact layout
const STEP_COLORS = ['protea', 'karoo', 'sonneblom', 'bosveld', 'oseaan', 'jakaranda', 'hemel'];

// Small inline icons (24×24, currentColor) — crisper and more consistent than emoji on buttons.
const STROKE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  play: '<path d="M7.5 5.2v13.6c0 .8.9 1.3 1.6.8l10.3-6.8c.6-.4.6-1.2 0-1.6L9.1 4.4c-.7-.5-1.6 0-1.6.8z"/>',
  pause: '<rect x="5.6" y="4.4" width="4.6" height="15.2" rx="1.6"/><rect x="13.8" y="4.4" width="4.6" height="15.2" rx="1.6"/>',
  home: '<path d="M12 3.1 2.9 10.8c-.7.6-.3 1.8.7 1.8h1.6v7.2c0 .7.5 1.2 1.2 1.2h3.6v-5.6h4v5.6h3.6c.7 0 1.2-.5 1.2-1.2v-7.2h1.6c1 0 1.4-1.2.7-1.8L12 3.1z"/>',
  again: `<path ${STROKE} stroke-width="2.7" d="M18.6 12a6.6 6.6 0 1 1-1.93-4.67"/><path d="M20.9 3.9v7.2h-7.2z"/>`,
  share: `<g ${STROKE} stroke-width="2.4"><path d="M12 14.6V3.9M7.9 7.9 12 3.8l4.1 4.1"/><path d="M8.6 10.6H6.6c-.9 0-1.6.7-1.6 1.6v7c0 .9.7 1.6 1.6 1.6h10.8c.9 0 1.6-.7 1.6-1.6v-7c0-.9-.7-1.6-1.6-1.6h-2"/></g>`,
  copy: `<g ${STROKE} stroke-width="2.4"><rect x="8.6" y="8.6" width="11.4" height="12" rx="2.2"/><path d="M15.4 8.6V5.7c0-1.2-1-2.2-2.2-2.2H6.2C5 3.5 4 4.5 4 5.7v8.1C4 15 5 16 6.2 16h2.4"/></g>`,
  chat: '<path d="M12 2.6a9.3 9.3 0 0 0-8 14l-1.3 4.8 4.9-1.3A9.3 9.3 0 1 0 12 2.6z"/><g style="fill:var(--wa-d)"><circle cx="7.9" cy="12" r="1.45"/><circle cx="12" cy="12" r="1.45"/><circle cx="16.1" cy="12" r="1.45"/></g>',
  close: `<path ${STROKE} stroke-width="3" d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  shop: `<path d="M5.4 8.4h13.2l-1.15 11.3a1.7 1.7 0 0 1-1.7 1.5H8.25a1.7 1.7 0 0 1-1.7-1.5z"/><path ${STROKE} stroke-width="2.3" d="M8.9 8.4V7.1a3.1 3.1 0 0 1 6.2 0v1.3"/>`,
  chart: '<rect x="3.4" y="11.5" width="4.6" height="9" rx="1.3"/><rect x="9.7" y="3.5" width="4.6" height="17" rx="1.3"/><rect x="16" y="8" width="4.6" height="12.5" rx="1.3"/>',
  help: `<circle ${STROKE} stroke-width="2.4" cx="12" cy="12" r="9.4"/><path ${STROKE} stroke-width="2.5" d="M9.3 9.4a2.8 2.8 0 1 1 4 2.5c-.8.4-1.3 1-1.3 1.8v.5"/><circle cx="12" cy="17.3" r="1.45"/>`,
  soundOn: `<path d="M3.5 9.3h3.3L11.6 5c.6-.5 1.4-.1 1.4.7v12.6c0 .8-.8 1.2-1.4.7l-4.8-4.3H3.5c-.6 0-1-.4-1-1V10.3c0-.6.4-1 1-1z"/><path ${STROKE} stroke-width="2.3" d="M16.2 9.2a4 4 0 0 1 0 5.6M18.9 6.5a7.8 7.8 0 0 1 0 11"/>`,
  soundOff: `<path d="M3.5 9.3h3.3L11.6 5c.6-.5 1.4-.1 1.4.7v12.6c0 .8-.8 1.2-1.4.7l-4.8-4.3H3.5c-.6 0-1-.4-1-1V10.3c0-.6.4-1 1-1z"/><path ${STROKE} stroke-width="2.5" d="M16.3 9.4l5 5.2M21.3 9.4l-5 5.2"/>`,
  vibOn: `<rect ${STROKE} stroke-width="2.3" x="7.6" y="3.4" width="8.8" height="17.2" rx="2.2"/><path ${STROKE} stroke-width="2.2" d="M4 8.5v7M1.6 10.2v3.6M20 8.5v7M22.4 10.2v3.6"/>`,
  vibOff: `<rect ${STROKE} stroke-width="2.3" x="7.6" y="3.4" width="8.8" height="17.2" rx="2.2"/><path ${STROKE} stroke-width="2.4" d="M3.5 3.5l17 17"/>`,
  contrastOn: `<circle ${STROKE} stroke-width="2.4" cx="12" cy="12" r="8.6"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2z"/>`,
  contrastOff: `<circle ${STROKE} stroke-width="2.4" cx="12" cy="12" r="8.6"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2z" opacity=".35"/>`,
  external: `<g ${STROKE} stroke-width="2.4"><path d="M13.5 4.5h6v6M19.3 4.7l-8.6 8.6"/><path d="M18 14.2v4.3c0 .8-.7 1.5-1.5 1.5H5.5c-.8 0-1.5-.7-1.5-1.5V7.5C4 6.7 4.7 6 5.5 6h4.3"/></g>`,
  eye: `<path ${STROKE} stroke-width="2.3" d="M2.5 12s3.6-6.4 9.5-6.4S21.5 12 21.5 12s-3.6 6.4-9.5 6.4S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.2"/>`,
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'vars') for (const [n, val] of Object.entries(v)) el.style.setProperty(n, String(val));
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

/** The ✕ in a card's top right corner (sheets, the Uitdagersreeks). */
function closeX(action) {
  return h('button', { type: 'button', class: 'icon-btn close', 'aria-label': S.close, title: S.close, onclick: () => { audio.play('click'); action(); } }, icon('close'));
}

/** el.append() without the empty ones: append() prints a null as the text "null" (it did, on the menu). */
function put(el, ...kids) {
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k);
}

function icon(name) {
  const span = document.createElement('span');
  span.innerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  return span.firstChild;
}

const PUNISH_GUARD_MS = 400;   // Uitdagersreeks: a tap this soon after the choice appears was meant for the tower
const emo = (ch, cls = '') => h('span', { class: `emoji ${cls}`.trim(), 'aria-hidden': 'true', text: ch });

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

/** "2026-10-06" -> "Di" (UTC maths, DST-proof). */
function dayAbbr(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dow = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
  return dayName(dow).slice(0, 2);
}

function prefersReducedMotion() {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// UI factory
// ---------------------------------------------------------------------------
export function createUI(bus) {
  const doc = document;
  let root = doc.getElementById('ui');
  if (!root) {
    root = h('div', { id: 'ui' });
    doc.body.append(root);
  }
  root.textContent = '';

  const st = {
    screen: null,        // 'menu' | 'results' | 'pause' | 'game' | null
    modal: null,         // 'howto' | 'stats' | null
    model: null,
    settings: { sound: true, vibration: true, reducedMotion: prefersReducedMotion(), highContrast: false },
    nextDayAt: 0,
    ad: null,            // { house: {title,text,url,label}|null, salesOn }
    rolledFor: 0,
    resultsDaily: false,
    ticker: 0,
    lockUntil: 0,
    externalLayout: false,
    keyboard: false,
    splashTimer: 0,
    confettiTimer: 0,
    modalReturn: null,
    sayingRO: null,      // watches the menu gap that holds the saying of the day
    city: null,          // the Stapelstad skyline model (js/core/skyline.js) of the latest menu/results
    cityIO: null,        // starts the 'rise' animation when the strip scrolls into view
  };

  // --- Static structure ----------------------------------------------------
  const screens = {
    menu: h('section', { class: 'screen screen-menu', 'aria-label': S.title, tabindex: '-1' }),
    results: h('section', { class: 'screen screen-results', 'aria-label': S.results, tabindex: '-1' }),
    pause: h('section', { class: 'screen screen-pause', 'aria-label': S.paused, tabindex: '-1' }),
    duel: h('section', { class: 'screen screen-duel', 'aria-label': S.duel, tabindex: '-1' }),
    duelwait: h('section', { class: 'screen screen-duelwait', 'aria-label': S.duel, tabindex: '-1' }),
  };
  const modals = {
    howto: h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stapel-howto-title', tabindex: '-1' }),
    stats: h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stapel-stats-title', tabindex: '-1' }),
    shop: h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stapel-shop-title', tabindex: '-1' }),
    lang: h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stapel-lang-title', tabindex: '-1' }),
    board: h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stapel-board-title', tabindex: '-1' }),
    remind: h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stapel-remind-title', tabindex: '-1' }),
  };
  const pauseBtn = h('button', {
    class: 'pause-btn', type: 'button', 'aria-label': S.pause, title: S.pause, hidden: true,
    onclick: () => {
      pauseBtn.blur();
      if (st.screen !== 'game' || !guard()) return;
      audio.play('click');
      bus.emit('ui:pause');
    },
  }, h('span', null, icon('pause')));
  const toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  // Uitdagersreeks: choose a punishment for the other tower. It sits over the score strip at the top,
  // away from the taps that drop blocks, and only its buttons take taps: the game keeps running.
  const punishBar = h('div', { class: 'punish', role: 'group', 'aria-label': S.duelChooseLabel, hidden: true });
  const tutorBar = h('div', { class: 'tutor', role: 'status', 'aria-live': 'polite', hidden: true });
  let punishAt = 0;        // when the strip appeared (a tap right after it was meant for the tower)
  let punishPick = null;   // (n) => choose option n (keys 1-4) while the strip is up
  // 1.8 power-ups: round buttons on the right edge; only the buttons take taps (the rest drops a block)
  const powerTray = h('div', { class: 'power-tray', role: 'group', 'aria-label': S.powerups, hidden: true });

  root.append(screens.menu, screens.results, screens.pause, screens.duel, screens.duelwait, modals.howto, modals.stats, modals.shop, modals.lang, modals.board, modals.remind, pauseBtn, punishBar, tutorBar, powerTray, toastBox);
  for (const el of [...Object.values(screens), ...Object.values(modals)]) setOn(el, false);

  // Measures env(safe-area-inset-*) so layout() can work out how much of each
  // inset actually overlaps the canvas rect.
  const probe = h('div', {
    'aria-hidden': 'true',
    style: 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding:var(--safe-area-inset-top,env(safe-area-inset-top,0px)) var(--safe-area-inset-right,env(safe-area-inset-right,0px)) '
      + 'var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) var(--safe-area-inset-left,env(safe-area-inset-left,0px));',
  });
  doc.body.append(probe);

  // Static texts that live in index.html (splash, rotate overlay) come from strings.js too.
  const splashMsg = doc.querySelector('#splash .splash-msg');
  if (splashMsg) splashMsg.textContent = S.loading;
  const rotateMsg = doc.querySelector('#rotate p');
  if (rotateMsg) rotateMsg.textContent = S.rotate;

  // Palette from config.js wins over the CSS fallbacks.
  for (const p of PALETTE) {
    doc.documentElement.style.setProperty(`--${p.id}`, hex(p.fill));
    doc.documentElement.style.setProperty(`--${p.id}-l`, hex(p.light));
    doc.documentElement.style.setProperty(`--${p.id}-d`, hex(p.dark));
  }

  applyMotionClass();
  fallbackLayout();
  renderHowTo();

  // --- Global listeners ----------------------------------------------------
  root.addEventListener('pointerdown', () => {
    st.keyboard = false;
    audio.unlock();
  }, { passive: true });
  root.addEventListener('touchstart', () => {}, { passive: true });   // enables :active on iOS
  // leaving the game (another app, the home screen) saves a nickname still being typed
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) st.nickSave?.();
  });
  // Phaser listens for Space/Enter on window; a key that activates a DOM button must not also drop a block.
  const shieldKeys = (e) => {
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && e.target?.closest?.('button')) e.stopPropagation();
  };
  root.addEventListener('keydown', shieldKeys);
  root.addEventListener('keyup', shieldKeys);
  window.addEventListener('keydown', onKey);
  // the Android app's back button (app/shim.js): handled here unless we're on the start screen
  window.addEventListener('stapel:back', (e) => {
    if (goBack()) e.preventDefault();
  });
  window.addEventListener('resize', () => {
    if (!st.externalLayout) fallbackLayout();
  });
  doc.addEventListener('visibilitychange', () => {
    if (!doc.hidden) tick();
  });

  // ---------------------------------------------------------------------------
  // Visibility management
  // ---------------------------------------------------------------------------
  function setOn(el, on) {
    el.classList.toggle('on', on);
    el.inert = !on;
    if (on) el.removeAttribute('aria-hidden');
    else el.setAttribute('aria-hidden', 'true');
  }

  function showScreen(name) {
    st.screen = name;
    for (const [k, el] of Object.entries(screens)) {
      setOn(el, k === name);
      if (k === name && st.modal) el.inert = true;   // stays visible under an open sheet
    }
    pauseBtn.hidden = name !== 'game';
    if (name !== 'game') {
      hidePunish();
      setPowerups(null);
    }
    syncTutor();
    if (name && screens[name]) {
      screens[name].scrollTop = 0;
      if (st.keyboard && !st.modal) focusQuietly(screens[name]);
    }
    syncTicker();
  }

  /** The lesson's card shows over the game only (it stays in place while a sheet or the pause card is up). */
  function syncTutor() {
    tutorBar.classList.toggle('is-away', st.screen !== 'game' || !!st.modal);
  }

  function openModal(name) {
    if (st.modal && st.modal !== name) setOn(modals[st.modal], false);
    st.modal = name;
    syncTutor();
    st.modalReturn = doc.activeElement;
    setOn(modals[name], true);
    const scr = screens[st.screen];
    if (scr) scr.inert = true;
    const body = modals[name].querySelector('.sheet-body');
    if (body) {
      body.scrollTop = 0;
      body.onscroll = () => markScrollable(body);
      requestAnimationFrame(() => markScrollable(body));
    }
    if (st.keyboard) focusQuietly(modals[name]);
  }

  function closeModal() {
    const name = st.modal;
    if (!name) return;
    st.modal = null;
    syncTutor();
    setOn(modals[name], false);
    const scr = screens[st.screen];
    if (scr) setOn(scr, true);
    if (st.keyboard && st.modalReturn?.isConnected) focusQuietly(st.modalReturn);
    st.modalReturn = null;
  }

  function markScrollable(el) {
    el.classList.toggle('more', el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  function focusQuietly(el) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      // old browsers
    }
  }

  function guard() {
    const now = Date.now();
    if (now < st.lockUntil) return false;
    st.lockUntil = now + CLICK_GUARD_MS;
    return true;
  }

  /** A chunky button. `nav` buttons are double-tap guarded. */
  function button(cls, content, onPress, { nav = true, attrs = {} } = {}) {
    return h('button', {
      type: 'button',
      class: `btn ${cls}`.trim(),
      ...attrs,
      onclick: (e) => {
        if (nav && !guard()) return;
        audio.play('click');
        onPress(e);
      },
    }, content);
  }

  /**
   * Escape, and the Android app's back button: one step back. Returns false on the start
   * screen with nothing open (the app then closes).
   */
  function goBack() {
    if (st.modal === 'lang' && st.langFirst) {
      bus.emit('ui:lang', getLanguage());   // the first-start choice can't be skipped: back keeps the language shown
    } else if (st.modal) {
      closeModal();
    } else if (st.screen === 'pause') {
      if (guard()) bus.emit('ui:resume');
    } else if (st.screen === 'game') {
      if (guard()) bus.emit('ui:pause');
    } else if (st.screen === 'results' || st.screen === 'duel') {
      if (guard()) bus.emit('ui:home');
    } else if (st.screen === 'duelwait') {
      if (guard()) bus.emit('ui:duel-cancel');
    } else {
      return false;
    }
    return true;
  }

  function onKey(e) {
    st.keyboard = true;
    if (e.defaultPrevented) return;
    const key = e.key;
    if (key === 'Escape' || key === 'Esc') {
      goBack();
    } else if (punishPick && !e.repeat && key >= '1' && key <= '4') {
      punishPick(Number(key) - 1);
    } else if ((key === 'p' || key === 'P') && !e.repeat && !st.modal) {
      if (st.screen === 'game' && guard()) bus.emit('ui:pause');
      else if (st.screen === 'pause' && guard()) bus.emit('ui:resume');
    }
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  function applyRect(left, top, width, height) {
    const s = width / GAME_W;
    const style = root.style;
    style.left = `${left}px`;
    style.top = `${top}px`;
    style.width = `${width}px`;
    style.height = `${height}px`;
    style.setProperty('--s', s.toFixed(5));
    style.setProperty('--u', `${s.toFixed(5)}px`);
    root.classList.toggle('short', height / width < SHORT_ASPECT);
    root.classList.toggle('compact', height / width < 1.9);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fitSaying);

    const cs = getComputedStyle(probe);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const inset = (v, gap) => `${Math.max(0, (parseFloat(v) || 0) - Math.max(0, gap)).toFixed(1)}px`;
    style.setProperty('--sat', inset(cs.paddingTop, top));
    style.setProperty('--sab', inset(cs.paddingBottom, vh - (top + height)));
    style.setProperty('--sal', inset(cs.paddingLeft, left));
    style.setProperty('--sar', inset(cs.paddingRight, vw - (left + width)));
  }

  /** Where Phaser's Scale.FIT will put the canvas — used until main.js calls layout(). */
  function fallbackLayout() {
    const vw = window.innerWidth || GAME_W;
    const vh = window.innerHeight || 1280;
    const gh = computeGameHeight(vw, vh);
    const k = Math.min(vw / GAME_W, vh / gh);
    const w = GAME_W * k;
    const hgt = gh * k;
    applyRect((vw - w) / 2, (vh - hgt) / 2, w, hgt);
  }

  function layout(rect) {
    if (!rect) return;
    const width = rect.width;
    const height = rect.height;
    if (!(width > 0) || !(height > 0)) return;
    st.externalLayout = true;
    applyRect(rect.left ?? rect.x ?? 0, rect.top ?? rect.y ?? 0, width, height);
  }

  function applyMotionClass() {
    root.classList.toggle('rm', !!st.settings.reducedMotion || prefersReducedMotion());
  }

  const reducedMotion = () => root.classList.contains('rm');

  // ---------------------------------------------------------------------------
  // Countdown ticker (only runs while a countdown can be on screen)
  // ---------------------------------------------------------------------------
  function syncTicker() {
    const need = !!st.nextDayAt && (st.screen === 'menu' || (st.screen === 'results' && st.resultsDaily));
    if (need && !st.ticker) {
      st.ticker = setInterval(tick, 1000);
      tick();
    } else if (!need && st.ticker) {
      clearInterval(st.ticker);
      st.ticker = 0;
    }
  }

  function tick() {
    if (!st.ticker || !st.nextDayAt) return;
    const left = st.nextDayAt - Date.now();
    const txt = fmtClock(left);
    const scr = screens[st.screen];
    if (scr) {
      for (const el of scr.querySelectorAll('[data-countdown]')) {
        if (el.textContent !== txt) el.textContent = txt;
      }
    }
    if (left <= 0 && st.rolledFor !== st.nextDayAt) {
      st.rolledFor = st.nextDayAt;
      toast(S.newDay);
      if (st.screen === 'results') newTowerButtons();
      bus.emit('ui:day-rollover');
    }
  }

  /** On a daily result after midnight the countdown makes way for the new tower. */
  function newTowerButtons() {
    for (const el of screens.results.querySelectorAll('[data-countdown]')) {
      const cell = el.closest('.foot-cell');
      if (!cell) continue;
      cell.replaceChildren(button('btn-big btn-new', [icon('play'), h('span', { text: S.newTowerGo })], () => bus.emit('ui:home')));
    }
  }

  const countdownEl = (cls = '') => h('div', { class: `countdown ${cls}`.trim() },
    h('span', { text: S.nextTower }),
    h('b', { 'data-countdown': '', text: fmtClock(st.nextDayAt - Date.now()) }));

  // ---------------------------------------------------------------------------
  // Shared pieces
  // ---------------------------------------------------------------------------
  function logo() {
    const letters = [...S.title.toUpperCase()];
    return h('h1', { class: 'logo', 'aria-label': S.title },
      letters.map((ch, i) => h('span', {
        class: i === letters.length - 1 ? 'lb hang' : 'lb',
        'aria-hidden': 'true',
      }, h('span', { text: ch }))));
  }

  /** Round icon with a label underneath (menu dock, pause card). */
  function dockBtn(iconName, label, onPress, attrs = {}) {
    return h('button', {
      type: 'button',
      class: 'dock-btn',
      ...attrs,
      onclick: onPress,
    }, h('span', { class: 'dock-ic' }, icon(iconName)), h('span', { class: 'dock-label', text: label }));
  }

  /** The menu's Winkel button, with the player's coins on it. */
  function shopBtn(coins) {
    const b = dockBtn('shop', S.shop, () => { audio.play('click'); bus.emit('ui:shop'); }, { class: 'dock-btn dock-shop' });
    b.querySelector('.dock-ic').append(h('span', { class: 'dock-coins' }, emo(COIN), h('b', { text: fmtInt(coins || 0) })));
    return b;
  }

  /** New coin balance on the menu's Winkel button (after buying, or a game). */
  function setMenuCoins(n) {
    const el = screens.menu.querySelector('.dock-coins b');
    if (el) el.textContent = fmtInt(n || 0);
  }

  const LABELS = { sound: S.sound, vibration: S.vibration, highContrast: S.highContrast };

  function toggleBtns({ contrast = false } = {}) {
    const list = [toggleBtn('sound')];
    // only phones buzz (desktop Chrome has navigator.vibrate too, but nothing happens)
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (touch && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') list.push(toggleBtn('vibration'));
    if (contrast) list.push(toggleBtn('highContrast'));
    return list;
  }

  function toggleBtn(key) {
    const btn = dockBtn('soundOn', LABELS[key], null, { 'data-setting': key });
    btn.addEventListener('click', () => {
      const val = !st.settings[key];
      st.settings[key] = val;
      syncToggles();
      bus.emit('ui:settings', { [key]: val });
      if (key === 'sound' && val) {
        audio.unlock();
        audio.play('click');
      } else if (key === 'vibration' && val) {
        haptics.tap();
      } else if (key === 'highContrast') {
        root.classList.toggle('hc', val);
      }
    });
    paintToggle(btn);
    return btn;
  }

  function paintToggle(btn) {
    const key = btn.dataset.setting;
    const on = !!st.settings[key];
    const name = LABELS[key];
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', `${name}: ${on ? S.on : S.off}`);
    btn.title = `${name}: ${on ? S.on : S.off}`;
    const ic = { sound: ['soundOn', 'soundOff'], vibration: ['vibOn', 'vibOff'], highContrast: ['contrastOn', 'contrastOff'] }[key];
    btn.querySelector('.dock-ic').replaceChildren(icon(on ? ic[0] : ic[1]));
  }

  function syncToggles() {
    for (const btn of root.querySelectorAll('[data-setting]')) paintToggle(btn);
  }

  /**
   * Die weekkis on the daily card: seven boxes (opened ones ticked, today's lit) and what today's or
   * tomorrow's box holds. `w` is js/core/week.js weekView().
   */
  function weekStrip(w) {
    if (!w) return null;
    const cells = [];
    for (let d = 1; d <= 7; d++) {
      const opened = d <= w.done;
      const today = !w.opened && d === w.day;
      cells.push(h('span', { class: `wk-cell${opened ? ' is-done' : ''}${today ? ' is-today' : ''}${d === 7 ? ' is-big' : ''}`, 'aria-hidden': 'true' },
        opened ? '✓' : d === 7 ? emo('🎁') : emo('📦')));
    }
    const line = w.opened ? (w.next ? S.weekTomorrow(w.next.coins) : '') : S.weekToday(w.coins);
    return h('div', { class: 'week-strip', role: 'img', 'aria-label': `${S.weekTitle}: ${S.weekDay(w.opened ? w.day : w.day)}. ${line}` },
      h('span', { class: 'wk-title', text: S.weekTitle }),
      h('span', { class: 'wk-cells' }, cells),
      h('span', { class: 'wk-line', text: line }),
      w.shields ? h('span', { class: 'wk-shield', title: S.weekShield, text: `🛡️${w.shields > 1 ? `×${w.shields}` : ''}` }) : null);
  }

  function streakChip(n) {
    const v = Math.max(0, n | 0);
    return h('div', {
      class: `chip streak${v ? '' : ' is-zero'}`,
      role: 'img',
      'aria-label': `${S.currentStreak}: ${v}`,
      title: S.currentStreak,
    }, emo('🔥'), h('span', { text: fmtInt(v) }));
  }

  function tile(value, label, cls = '') {
    return h('div', { class: `tile ${cls}`.trim() }, h('b', { text: value }), h('span', { text: label }));
  }

  // ---------------------------------------------------------------------------
  // Menu
  // ---------------------------------------------------------------------------
  // --- Jou Stapelstad: the last 30 days as a strip of small stacked buildings -----------------
  function cityBlock(city, { animate = false, streak = 0, compact = false } = {}) {
    const days = city && Array.isArray(city.days) ? city.days : [];
    if (!days.length) return null;
    const bestIdx = city.best ? city.best.index : -1;
    const max = Math.max(1, city.best ? city.best.heightM : 1);
    const last = days.length - 1;
    const cols = days.map((d, i) => {
      const built = d.heightM != null;
      const pct = built ? Math.max(12, Math.round((d.heightM / max) * 100)) : 0;
      return h('span', {
        class: `city-col${built ? '' : ' plot'}${i === bestIdx ? ' best' : ''}${animate && built && i === last ? ' rise' : ''}`,
        vars: { '--h': `${pct}%`, '--c': hex(d.color) },
      }, i === bestIdx ? h('i', { class: 'city-flag', 'aria-hidden': 'true', text: '🚩' }) : null);
    });
    const strip = h('div', { class: 'city-strip', role: 'img', 'aria-label': S.cityAria(city.count | 0, days.length) }, cols);
    const sub = S.cityStreak(streak | 0);
    const line = (city.count | 0) > 0 ? S.cityLine(city.count | 0) : S.cityEmpty;
    const box = h('div', { class: `city${compact ? ' city-sm' : ''}` },
      h('div', { class: 'city-head' },
        h('h3', { class: 'label city-title' }, emo('🏙️'), h('span', { text: S.cityTitle })),
        sub ? h('span', { class: 'city-streak' }, emo('🔥'), h('span', { text: sub })) : null),
      strip,
      h('p', { class: 'city-line', role: 'status', text: line }));
    if (animate && strip.querySelector('.rise')) watchRise(strip);
    return box;
  }

  /** The new tower rises when the strip is actually on screen (the results can scroll); at once without IntersectionObserver. */
  function watchRise(strip) {
    st.cityIO?.disconnect();
    st.cityIO = null;
    if (typeof IntersectionObserver !== 'function' || reducedMotion()) {
      strip.classList.add('go');
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        strip.classList.add('go');
        io.disconnect();
      }
    }, { threshold: 0.6 });
    st.cityIO = io;
    io.observe(strip);
    setTimeout(() => strip.classList.add('go'), 6000);   // never leave the new tower hidden
  }

  /** The "Sit Stapel op jou tuisskerm" button (Android/Chrome) or the iOS Share-sheet tip; null when nothing to offer. */
  function installRow(mode) {
    if (mode !== 'prompt' && mode !== 'ios') return null;
    const x = h('button', {
      type: 'button', class: 'install-x', 'aria-label': S.installDismiss, title: S.installDismiss,
      onclick: () => { audio.play('click'); bus.emit('ui:install-dismiss'); },
    }, icon('close'));
    return h('div', { class: `install-row ${mode}` },
      mode === 'prompt'
        ? button('btn-blue install-btn', h('span', { text: S.installBtn }), () => bus.emit('ui:install'), { nav: false })
        : h('p', { class: 'install-tip', text: S.installTipIos }),
      x);
  }

  /** Called when the install offer changes (the browser's prompt arrived, was used or was dismissed). */
  function setInstall(mode) {
    if (st.screen !== 'results' || !st.resultsDaily) return;
    const wrap = screens.results.querySelector('.res-wrap');
    if (!wrap) return;
    wrap.querySelector('.install-row')?.remove();
    const row = installRow(mode);
    if (row) wrap.insertBefore(row, wrap.querySelector('.btn-row'));
  }

  function renderMenu(m) {
    const stats = m.stats || {};
    const entry = m.today || null;
    const done = !!entry && entry.status === 'done';
    st.city = m.city || st.city;

    const brand = h('header', { class: 'brand' }, logo(), h('p', { class: 'tagline' }, h('span', { text: S.tagline })));

    const head = h('div', { class: 'daily-head' },
      h('div', { class: 'daily-badge' }, emo('🏗️')),
      h('div', null,
        h('h2', { class: 'daily-title', text: S.dailyN(m.dayNumber ?? '?') }),
        h('p', { class: 'daily-date', text: m.dateLabel || '' })));

    // a brand-new player sees no grey "🔥 0" before they have played
    const card = h('div', { class: 'card daily-card' }, (stats.played | 0) > 0 ? streakChip(stats.currentStreak) : null, head, weekStrip(m.week));
    if (done) {
      const r = entry.result || {};
      card.append(
        h('div', { class: 'done-box' },
          h('div', { class: 'done-title' }, emo('✅'), h('span', { text: S.doneToday })),
          h('div', { class: 'done-stats' },
            emo('🏗️'), ' ', fmtM(r.heightM || 0),
            h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }),
            emo('⭐'), ' ', fmtInt(r.score || 0)),
          countdownEl()),
        button('btn-big btn-green', [icon('chart'), h('span', { text: S.seeResult })], () => bus.emit('ui:play-daily')));
    } else {
      const fc = (m.forecast || []).slice(0, 4).filter((t) => WEATHER_INFO[t]).map((t) => ({ key: t, ...WEATHER_INFO[t] }));
      // today's visitors, each once ("Besoekers vandag: 🐒 🤡"): same for everyone, like the weather
      const who = (m.visitors || []).filter((t) => VISITOR_INFO[t]).map((t) => VISITOR_INFO[t]);
      if (fc.length) {
        card.append(h('div', { class: who.length ? 'forecast has-visitors' : 'forecast' },
          h('h3', { class: 'label', text: S.forecast }),
          h('ol', { class: 'fc-strip' }, fc.map((w) => h('li', { class: 'fc-item' },
            h('span', { class: 'fc-emo', 'data-wx': w.key }, emo(w.emoji)),
            h('span', { class: 'fc-name', text: w.name })))),
          who.length
            ? h('p', { class: 'fc-visitors', 'aria-label': `${S.visitorsToday}: ${who.map((x) => x.name).join(', ')}` },
              h('span', { class: 'fc-vlabel', text: `${S.visitorsToday}:` }),
              who.map((x) => h('span', { class: 'fc-who', title: x.name }, emo(x.emoji))))
            : null));
      }
      // a friend's challenge (from a shared link, today's date only): text only, never markup
      if (m.challenge && m.challenge.text) card.append(h('p', { class: 'challenge-chip', role: 'status', text: m.challenge.text }));
      put(card,
        h('p', { class: 'note', text: S.sameForAll }),
        // first visit: no pop-up, just a friendly line (the game itself coaches the first tower)
        m.newPlayer ? h('p', { class: 'note nudge', text: S.firstNudge }) : null,
        button('btn-big', [icon('play'), h('span', { text: S.playToday })], () => bus.emit('ui:play-daily')));
    }

    const practice = button('btn-teal btn-practice',
      [icon('again'), h('span', { class: 'btn-txt' }, h('span', { text: S.practice }), h('span', { class: 'btn-sub', text: S.practiceSubShort }))],
      () => bus.emit('ui:play-practice'), { attrs: { 'aria-label': `${S.practice}: ${S.practiceSub}` } });
    // Uitdagersreeks (head-to-head) beside practice: two equal buttons in one row, no extra height
    const duelBtn = button('btn-purple btn-practice btn-duel',
      [emo('⚔️'), h('span', { class: 'btn-txt' }, h('span', { text: S.duel }), h('span', { class: 'btn-sub', text: S.duelSubShort }))],
      () => bus.emit('ui:duel'), { attrs: { 'aria-label': `${S.duel}: ${S.duelSub}` } });
    const playRow = h('div', { class: 'play-row' }, practice, duelBtn);

    const dock = h('div', { class: 'dock dock-menu' },
      dockBtn('help', S.howToShort, () => { audio.play('click'); showHowTo(); }, { 'aria-label': S.howTo, title: S.howTo }),
      dockBtn('chart', S.stats, () => { audio.play('click'); showStats(st.model?.stats); }),
      shopBtn(m.coins),
      toggleBtns());


    const adSlot = h('div', { class: 'menu-ad' });
    renderAd(adSlot, m.ad || st.ad);

    // "Spreekwoord van die dag" lives inside the spacer (absolutely placed): it never adds height, so
    // it can't push the play button down; fitSaying() hides it when the gap is too small for it.
    const saying = m.dateKey ? localSaying(sayingOfTheDay(m.dateKey)) : '';
    const gap = h('div', { class: saying ? 'spacer has-saying' : 'spacer' }, saying
      ? h('div', { class: 'saying-day' },
        h('div', { class: 'saying-inner' },
          h('span', { class: 'saying-label', text: S.sayingOfDay }),
          h('p', { class: 'saying-text', text: saying })))
      : null);
    // 🌐 Afrikaans or English (the same picker a new player sees once)
    const lang = getLanguage();
    const langChip = h('button', {
      type: 'button', class: 'lang-chip', 'aria-label': `${S.language}: ${S.langNames[lang]}`, title: S.language,
      onclick: () => {
        if (!guard()) return;
        audio.play('click');
        showLanguage({ current: lang });
      },
    }, emo('🌐'), h('span', { text: lang.toUpperCase() }));
    screens.menu.replaceChildren(brand, gap,
      h('div', { class: 'menu-stack' }, card, playRow, dock, adSlot), langChip);
    // the gap shrinks when the sponsor feed adds the ad card later, so re-check whenever it resizes
    if (saying && typeof ResizeObserver === 'function') {
      if (!st.sayingRO) st.sayingRO = new ResizeObserver(() => fitSaying());
      st.sayingRO.disconnect();
      st.sayingRO.observe(gap);
    }
  }

  /** Show the saying of the day only if it fits the gap above the daily card. */
  function fitSaying() {
    if (st.screen !== 'menu') return;
    const slot = screens.menu.querySelector('.saying-day');
    const inner = slot && slot.firstElementChild;
    if (!inner || !slot.parentElement) return;
    slot.classList.remove('is-off');
    slot.classList.toggle('is-off', inner.offsetHeight > slot.parentElement.clientHeight - 2);
  }

  /**
   * The pinned house ad (sponsors.json "house.menu", always labelled as an ad) and,
   * only while sponsorships are on sale, a small "Adverteer hier" link. Text goes in
   * with textContent only; the URL was checked (https) by js/core/sponsors.js.
   */
  function renderAd(slot, ad) {
    st.ad = ad || null;
    const house = ad && ad.house;
    const kids = [];
    if (house && house.title && /^https:\/\//i.test(house.url || '')) {
      // the label is the game's own word in English (the feed's label is Afrikaans); the ad itself is the advertiser's
      const label = getLanguage() === 'en' ? S.adLabel : house.label || S.adLabel;
      kids.push(h('a', {
        class: 'house-ad',
        href: house.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': `${label}: ${house.title}${house.text ? ` — ${house.text}` : ''} (${S.adOpens})`,
        onclick: () => audio.play('click'),
      },
      h('span', { class: 'ad-body' },
        h('span', { class: 'ad-label', text: label }),
        h('b', { class: 'ad-title', text: house.title }),
        house.text && house.text !== house.title ? h('span', { class: 'ad-text', text: house.text }) : null),
      h('span', { class: 'ad-go', 'aria-hidden': 'true' }, icon('external'))));
    }
    if (ad && ad.salesOn) kids.push(h('a', { class: 'advertise-link', href: 'adverteer.html', text: S.advertiseHere }));
    slot.replaceChildren(...kids);
    slot.hidden = !kids.length;
  }

  /** A newer sponsor feed: refresh only the ad slot (the menu itself stays put). */
  function setMenuAd(ad) {
    st.ad = ad || null;
    const slot = screens.menu && screens.menu.querySelector('.menu-ad');
    if (slot) renderAd(slot, st.ad);
  }

  function showMenu(model) {
    const m = model || {};
    st.model = m;
    if (m.settings) {
      st.settings = { ...st.settings, ...m.settings };
      applyMotionClass();
    }
    root.classList.toggle('hc', !!st.settings.highContrast);
    st.nextDayAt = Number(m.nextDayAt) || 0;
    st.resultsDaily = false;
    renderMenu(m);
    showScreen('menu');
    fitSaying();
    requestAnimationFrame(fitSaying);
  }

  // ---------------------------------------------------------------------------
  // How to play
  // ---------------------------------------------------------------------------
  function renderHowTo() {
    const steps = S.howToSteps.map((s, i) => {
      const c = STEP_COLORS[i % STEP_COLORS.length];
      return h('li', { class: 'step' },
        h('span', { class: 'step-ic', vars: { '--c': `var(--${c})`, '--cd': `var(--${c}-d)`, '--r': `${i % 2 ? 3 : -3}deg` } }, emo(s.icon)),
        h('p', { text: s.text }));
    });
    const sheet = h('div', { class: 'card sheet' },
      h('button', { type: 'button', class: 'icon-btn close', 'aria-label': S.close, title: S.close, onclick: () => { audio.play('click'); closeModal(); } }, icon('close')),
      h('div', { class: 'sheet-head' }, emo('🏗️'), h('h2', { id: 'stapel-howto-title', text: S.howToTitle })),
      h('div', { class: 'sheet-body' }, h('ol', { class: 'steps' }, steps)),
      h('div', { class: 'sheet-foot' },
        // a new player's "Kom ons bou!" starts the short lesson; anyone can take it from here
        button('btn-big btn-green', [icon('play'), h('span', { text: S.howToGo })], () => {
          closeModal();
          if (st.howtoLesson) bus.emit('ui:lesson');
        }, { nav: false }),
        st.howtoLesson ? null : h('button', { type: 'button', class: 'sheet-link lesson-link', text: `🎓 ${S.lessonTry}`, onclick: () => { audio.play('click'); closeModal(); bus.emit('ui:lesson'); } }),
        // the privacy policy, linked from inside the game too (Google Play asks for that)
        h('a', { class: 'sheet-link', href: 'privaatheid.html', target: '_blank', rel: 'noopener', text: S.privacyPolicy })));
    modals.howto.replaceChildren(sheet);
  }

  function showHowTo({ lesson = false } = {}) {
    st.howtoLesson = !!lesson;
    renderHowTo();
    openModal('howto');
  }

  /**
   * Afrikaans or English: once at the first start (`first`: no way round it), and from the menu's 🌐
   * button. A choice comes back as 'ui:lang'; main.js keeps it (a new language reloads the page).
   */
  function showLanguage({ current = getLanguage(), first = false } = {}) {
    const pick = (lang) => h('button', {
      type: 'button', class: `lang-btn${!first && lang === current ? ' on' : ''}`, lang,
      'aria-pressed': String(!first && lang === current),
      onclick: () => {
        audio.play('click');
        bus.emit('ui:lang', lang);
      },
    }, h('b', { text: S.langNames[lang] }));
    st.langFirst = first;
    modals.lang.replaceChildren(h('div', { class: 'card sheet lang-sheet' },
      first ? null : h('button', { type: 'button', class: 'icon-btn close', 'aria-label': S.close, title: S.close, onclick: () => { audio.play('click'); closeModal(); } }, icon('close')),
      h('div', { class: 'sheet-head' }, emo('🌍'), h('h2', { id: 'stapel-lang-title', text: S.langPick })),
      h('div', { class: 'lang-btns' }, pick('af'), pick('en'))));
    openModal('lang');
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------
  function showStats(stats) {
    const s = stats || st.model?.stats || {};
    const history = Array.isArray(s.history) ? s.history.slice(-7) : [];
    const played = s.played | 0;

    const tiles = h('div', { class: 'tiles' },
      tile(fmtInt(played), S.played),
      tile(fmtInt(s.currentStreak || 0), S.currentStreak, (s.currentStreak || 0) > 0 ? 'hot' : ''),
      tile(fmtInt(s.maxStreak || 0), S.maxStreak),
      tile(fmtM(s.bestHeightM || 0), S.bestHeight),
      tile(fmtInt(s.bestScore || 0), S.bestScore),
      tile(fmtInt(s.totalPerfects || 0), S.totalPerfects));

    const body = h('div', { class: 'sheet-body' }, tiles);
    if (played > 0 && history.length) {
      const max = Math.max(1, ...history.map((d) => (d && d.heightM != null ? d.heightM : 0)));
      const last = history.length - 1;
      const bars = history.map((d, i) => {
        const has = d && d.heightM != null;
        const pct = has ? Math.max(4, (d.heightM / max) * 100) : 0;
        return h('div', {
          class: `bar${i === last ? ' today' : ''}${has ? '' : ' empty'}`,
          role: 'img',
          'aria-label': `${dayAbbr(d?.dateKey)}: ${has ? fmtM(d.heightM) : S.notPlayed}`,
        },
        h('span', { class: 'bar-val', text: has ? fmtM(d.heightM) : '–' }),
        h('span', { class: 'bar-fill', vars: { '--h': `${pct.toFixed(1)}%`, '--i': i } }),
        h('span', { class: 'bar-day', text: dayAbbr(d?.dateKey) }));
      });
      body.append(h('h3', { class: 'label chart-title', text: S.lastWeek }), h('div', { class: 'bars' }, bars));
    } else {
      body.append(h('p', { class: 'empty-note', text: S.noGamesYet }));
    }

    put(body, cityBlock(st.city, { streak: s.currentStreak | 0, compact: true }));

    const sheet = h('div', { class: 'card sheet' },
      h('button', { type: 'button', class: 'icon-btn close', 'aria-label': S.close, title: S.close, onclick: () => { audio.play('click'); closeModal(); } }, icon('close')),
      h('div', { class: 'sheet-head' }, emo('📊'), h('h2', { id: 'stapel-stats-title', text: S.stats })),
      body,
      h('div', { class: 'sheet-foot stats-foot' },
        h('div', { class: 'dock' }, toggleBtns({ contrast: true })),
        button('btn-white', h('span', { text: S.close }), () => closeModal(), { nav: false }),
        h('p', { class: 'version-note', text: S.versionNote(VERSION) })));
    // the daily reminder (only in the Android app)
    if (st.remindOn) sheet.querySelector('.stats-foot').prepend(button('btn-white', [emo('🔔'), h('span', { text: S.remindButton(st.remindTime) })], () => bus.emit('ui:remind'), { nav: false }));
    // today's leaderboard (only when the game can reach the server)
    if (st.boardOn) sheet.querySelector('.stats-foot').prepend(button('btn-blue', [emo('🏆'), h('span', { text: S.board })], () => bus.emit('ui:board'), { nav: false }));
    modals.stats.replaceChildren(sheet);
    openModal('stats');
  }

  // ---------------------------------------------------------------------------
  // Winkel (1.8): power-ups for Oefen, and looks for the Uitdagersreeks, bought with earned coins
  // ---------------------------------------------------------------------------
  const LOOK_KINDS = ['frame', 'badge', 'title', 'celebration', 'style'];

  /** What an opponent sees of a player: frame, badge, nickname, title and rank. */
  function playerCard({ name = '', card = null, compact = false } = {}) {
    const c = card || {};
    const frame = cosmetic('frame', c.frame) ? c.frame : 'hout';
    const badge = cosmetic('badge', c.badge)?.emoji || '';
    const rank = RANKS.find((r) => r.id === c.rank) || RANKS[0];
    return h('div', { class: `pcard frame-${frame}${compact ? ' is-compact' : ''}` },
      badge ? h('span', { class: 'pc-badge' }, emo(badge)) : null,
      h('span', { class: 'pc-main' },
        h('b', { class: 'pc-name', text: name }),
        h('span', { class: 'pc-title', text: (COSMETIC_INFO.title[c.title] || COSMETIC_INFO.title.bouer).name })),
      h('span', { class: 'pc-rank' }, emo(rank.emoji), h('span', { text: RANK_INFO[rank.id].name })));
  }

  function lookPreview(kind, item) {
    if (kind === 'frame') return h('span', { class: `frame-swatch frame-${item.id}` });
    if (kind === 'title') return h('span', { class: 'title-prev', text: COSMETIC_INFO.title[item.id].name });
    if (kind === 'style') return stylePreview(item);
    return emo(item.emoji || '–');
  }

  /**
   * A style's preview: the monkey wearing it, drawn with this phone's own emoji, the hat put on the
   * head the way the game does it (js/core/emojifit.js finds the head in the glyph's pixels), so the
   * shop shows what opponents will see. Falls back to the two emoji when a canvas can't be read.
   */
  function stylePreview(item) {
    try {
      const font = `${EMOJI_NOTO_FIRST ? '"Noto Color Emoji", ' : ''}"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      const G = 160;
      const glyph = (txt) => {
        const k = doc.createElement('canvas');
        k.width = G;
        k.height = G;
        const x = k.getContext('2d', { willReadFrequently: true });
        x.font = `100px ${font}`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(txt, G / 2, G / 2 + 4);
        return { k, img: x.getImageData(0, 0, G, G) };
      };
      const S = 144;   // canvas pixels, shown at about 60 units: sharp on 2-3x screens
      const c = doc.createElement('canvas');
      c.width = S;
      c.height = S;
      const m = glyph('🐒');
      const mBox = opaqueBox(m.img);
      if (!mBox) throw new Error('no monkey');
      const k = (S * 0.72) / Math.max(mBox.w, mBox.h);
      const ox = S / 2 - (mBox.l + mBox.w / 2) * k;
      const oy = S - 4 - (mBox.b + 1) * k;
      const ctx = c.getContext('2d');
      ctx.drawImage(m.k, ox, oy, G * k, G * k);
      if (item.emoji) {
        const a = glyph(item.emoji);
        const aBox = opaqueBox(a.img);
        const place = accessoryPlace(item.id, headOf(m.img), aBox);
        if (!place) throw new Error('no place');
        const sc = place.scale * k;
        ctx.drawImage(a.k, ox + place.cx * k - (aBox.l + aBox.w / 2) * sc, oy + place.cy * k - (aBox.t + aBox.h / 2) * sc, G * sc, G * sc);
      }
      c.className = 'style-prev';
      c.setAttribute('aria-hidden', 'true');
      return c;
    } catch {
      return h('span', { class: 'style-prev-plain' }, emo('🐒'), item.emoji ? emo(item.emoji) : null);
    }
  }

  function buyBtn(price, coins, onBuy) {
    const can = (coins | 0) >= price;
    return h('button', {
      type: 'button',
      class: `shop-buy${can ? '' : ' is-poor'}`,
      'aria-label': `${S.buy}: ${fmtInt(price)}`,
      onclick: () => {
        audio.play('click');
        if (!can) {
          toast(S.notEnoughCoins);
          return;
        }
        onBuy();
      },
    }, emo(COIN), h('span', { text: fmtInt(price) }));
  }

  /**
   * The shop sheet. m: { coins, stock, owned, look, card, name }. Re-rendered after every buy or
   * wear (the tab and the scroll position stay).
   */
  function showShop(m = {}, tab = st.shopTab || 'powerups') {
    const prevBody = modals.shop.querySelector('.sheet-body');
    const keepScroll = st.modal === 'shop' && st.shopTab === tab && prevBody ? prevBody.scrollTop : 0;
    st.shopTab = tab;
    st.shopModel = m;
    const tabs = h('div', { class: 'shop-tabs', role: 'tablist' }, [['powerups', S.shopPowerups], ['looks', S.shopLooks]].map(([id, label]) => h('button', {
      type: 'button', role: 'tab', class: `shop-tab${tab === id ? ' on' : ''}`, 'aria-selected': String(tab === id), text: label,
      onclick: () => {
        audio.play('click');
        showShop(st.shopModel, id);
      },
    })));
    const body = h('div', { class: 'sheet-body shop-body' });
    if (tab === 'powerups') {
      const shields = m.week?.shields | 0;
      body.append(h('p', { class: 'shop-note', text: S.shopPowerupsNote }),
        h('div', { class: 'shop-list' }, POWERUP_IDS.map((id) => {
          const info = POWERUP_INFO[id];
          return h('div', { class: 'shop-row' },
            h('span', { class: 'shop-ic' }, emo(info.emoji)),
            h('span', { class: 'shop-txt' }, h('b', { text: info.name }), h('span', { text: info.what }), h('small', { text: S.inBag(m.stock?.[id] | 0) })),
            buyBtn(POWERUPS[id].price, m.coins, () => bus.emit('ui:shop-buy', { kind: 'powerup', id })));
        }),
        // the weekkis's Reeksskild: not for Oefen, for the week (js/core/week.js)
        h('div', { class: 'shop-row' },
          h('span', { class: 'shop-ic' }, emo('🗓️')),
          h('span', { class: 'shop-txt' }, h('b', { text: S.weekShield }), h('span', { text: S.weekShieldWhat }), h('small', { text: S.weekShieldHave(shields) })),
          shields >= WEEK_SHIELD_MAX ? h('span', { class: 'shop-on', text: '✓' }) : buyBtn(WEEK_SHIELD_PRICE, m.coins, () => bus.emit('ui:shop-buy', { kind: 'weekshield' })))));
    } else {
      body.append(playerCard({ name: m.name, card: m.card }), h('p', { class: 'shop-note', text: S.shopLooksNote }));
      for (const kind of LOOK_KINDS) {
        body.append(h('h3', { class: 'label shop-kind', text: S.lookKinds[kind] }),
          h('div', { class: 'shop-grid' }, COSMETICS[kind].map((c) => {
            const owned = !!m.owned?.[kind]?.includes(c.id);
            const on = m.look?.[kind] === c.id;
            let action;
            if (on) action = h('span', { class: 'shop-on', text: S.wearing });
            else if (owned) action = h('button', { type: 'button', class: 'shop-wear', text: S.wear, onclick: () => { audio.play('click'); bus.emit('ui:shop-wear', { kind, id: c.id }); } });
            else if (c.rank) action = h('span', { class: 'shop-lock', text: S.lockedRank(RANK_INFO[c.rank].name) });
            else if (c.week) action = h('span', { class: 'shop-lock', text: S.lockedWeek });
            else action = buyBtn(c.price, m.coins, () => bus.emit('ui:shop-buy', { kind, id: c.id }));
            return h('div', { class: `shop-item${on ? ' is-on' : ''}` },
              h('span', { class: 'shop-prev' }, lookPreview(kind, c)),
              h('b', { class: 'shop-name', text: COSMETIC_INFO[kind][c.id].name }),
              action,
              kind === 'celebration' ? h('button', { type: 'button', class: 'shop-try', text: S.preview, onclick: () => celebrate(c.id) }) : null);
          })));
      }
    }
    const sheet = h('div', { class: 'card sheet shop-sheet' },
      h('button', { type: 'button', class: 'icon-btn close', 'aria-label': S.close, title: S.close, onclick: () => { audio.play('click'); closeModal(); } }, icon('close')),
      h('div', { class: 'sheet-head' }, emo('🛒'), h('h2', { id: 'stapel-shop-title', text: S.shop }),
        h('span', { class: 'shop-coins', role: 'status' }, emo(COIN), h('b', { text: fmtInt(m.coins || 0) }))),
      tabs,
      body,
      h('div', { class: 'sheet-foot' }, button('btn-white', h('span', { text: S.close }), () => closeModal(), { nav: false })));
    modals.shop.replaceChildren(sheet);
    if (st.modal !== 'shop') openModal('shop');
    else if (keepScroll) body.scrollTop = keepScroll;
    setMenuCoins(m.coins);
  }

  /**
   * A win celebration (the shop's preview; the winner of a match): its emoji rain down, with a fanfare
   * (`sound`: false for the other player's), and an optional caption ("Bennie vier!").
   */
  function celebrate(id, { caption = '', sound = true } = {}) {
    const c = cosmetic('celebration', id) || cosmetic('celebration', 'konfetti');
    const box = h('div', { class: `celebrate cel-${c.id}`, 'aria-hidden': 'true' });
    const n = reducedMotion() ? 0 : 24;
    for (let i = 0; i < n; i++) {
      box.append(h('i', {
        text: c.emoji,
        vars: {
          '--x': `${(Math.random() * 100).toFixed(1)}%`,
          '--s': (40 + Math.random() * 40).toFixed(0),
          '--t': `${(1.8 + Math.random() * 1.4).toFixed(2)}s`,
          '--d': `${(Math.random() * 0.8).toFixed(2)}s`,
          '--dx': (Math.random() * 200 - 100).toFixed(0),
          '--rot': `${(Math.random() * 720 - 360).toFixed(0)}deg`,
        },
      }));
    }
    box.append(h('b', { class: 'cel-big' }, emo(c.emoji), caption ? h('span', { class: 'cel-cap', text: caption }) : null));
    root.append(box);
    if (sound) audio.play('record');
    setTimeout(() => box.remove(), 4300);
  }

  // ---------------------------------------------------------------------------
  // Pause
  // ---------------------------------------------------------------------------
  function showPause({ mode, started = true } = {}) {
    if (st.modal) closeModal();
    const card = h('div', { class: 'card pause-card' },
      h('div', { class: 'pause-ic', 'aria-hidden': 'true' }, icon('pause')),
      h('h2', { text: S.paused }),
      h('p', { class: 'saying-line', text: localSaying(pauseSaying()) }),
      // before the first drop nothing counts yet, so no warning
      mode === 'daily' && started ? h('p', { class: 'warn' }, emo('⚠️'), h('span', { text: S.quitWarnDaily })) : null,
      button('btn-big btn-green', [icon('play'), h('span', { text: S.resume })], () => bus.emit('ui:resume')),
      button('btn-white btn-quit', [icon('close'), h('span', { text: S.quit })], () => bus.emit('ui:quit')),
      h('div', { class: 'dock' }, toggleBtns({ contrast: true })));
    screens.pause.replaceChildren(card);
    showScreen('pause');
  }

  // ---------------------------------------------------------------------------
  // Uitdagersreeks (head-to-head): the mode's screen, searching / waiting / 3-2-1
  // ---------------------------------------------------------------------------
  function duelRecordText(d) {
    if (!d || !(d.played > 0)) return '';
    const parts = [S.duelRecord(d.wins | 0, d.losses | 0)];
    if ((d.streak | 0) >= 2) parts.push(S.duelStreak(d.streak | 0));
    return parts.join(' · ');
  }

  /** What the mode is, your nickname, the ways to play, your wins and losses. */
  function showDuel(m = {}) {
    if (st.modal) closeModal();
    const d = m.duel || {};
    const input = h('input', {
      class: 'nick-input', type: 'text', maxlength: '16', autocomplete: 'nickname', autocapitalize: 'words',
      spellcheck: 'false', enterkeyhint: 'done', 'aria-label': S.duelNick, placeholder: m.placeholder || '',
    });
    input.value = d.name || '';
    const msg = h('p', { class: 'nick-msg', role: 'status', 'aria-live': 'polite', text: S.duelNickHint });
    // saved when the box loses focus, and also a moment after typing stops or when the game is left:
    // a name typed just before switching apps (or tapping straight into a match) isn't lost
    let saved = input.value;
    let typing = 0;
    const save = () => {
      clearTimeout(typing);
      if (input.value === saved || !input.isConnected) return;
      saved = input.value;
      bus.emit('ui:duel-name', input.value);
    };
    input.addEventListener('change', save);
    input.addEventListener('input', () => {
      clearTimeout(typing);
      typing = setTimeout(save, NICK_SAVE_MS);
    });
    st.nickSave = save;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
    const record = duelRecordText(d);
    st.duelPlaceholder = m.placeholder || '';
    const card = h('div', { class: 'card duel-card' },
      closeX(() => bus.emit('ui:home')),
      h('div', { class: 'duel-head' }, emo('⚔️'), h('h2', { text: S.duel })),
      h('p', { class: 'duel-intro', text: S.duelIntro }),
      m.rank ? rankBox(m.rank, m.card, d.name || st.duelPlaceholder) : null,
      h('div', { class: 'nick' }, h('span', { class: 'label', text: S.duelNick }), input, msg),
      h('div', { class: 'duel-btns' },
        m.live ? button('btn-big btn-green', [emo('🎲'), h('span', { text: S.duelRandom })], () => bus.emit('ui:duel-random')) : null,
        button(m.live ? 'btn-purple' : 'btn-big btn-purple', [emo('📲'), h('span', { text: S.duelFriend })], () => bus.emit('ui:duel-friend')),
        button('btn-teal', [emo('🤖'), h('span', { text: S.duelBot })], () => bus.emit('ui:duel-bot'))),
      m.live ? null : h('p', { class: 'note duel-note', text: S.duelOffline }),
      record ? h('p', { class: 'duel-record', text: record }) : null,
      m.rank ? seasonNotes(m.rank) : null);
    screens.duel.replaceChildren(h('div', { class: 'duel-wrap' }, card,
      button('btn-white', [icon('home'), h('span', { text: S.back })], () => bus.emit('ui:home'))));
    st.duelMsg = msg;
    showScreen('duel');
  }

  /**
   * Your card and this season's rank (js/core/economy.js): the rank, the points, a bar to the next
   * rank. `r` is the store's getSeasonRank().
   */
  function rankBox(r, card, name) {
    const info = RANKS.find((x) => x.id === r.rank) || RANKS[0];
    const next = RANKS.find((x) => x.id === r.next) || null;
    const [year, month] = String(r.season || '').split('-').map(Number);
    const span = next ? Math.max(1, next.min - info.min) : 1;
    const pct = next ? Math.round((100 * Math.max(0, r.points - info.min)) / span) : 100;
    return h('div', { class: 'rank-box' },
      h('div', { 'data-my-card': '' }, playerCard({ name, card: { ...card, rank: r.rank } })),
      month ? h('p', { class: 'rank-season', text: S.season(monthName(month - 1), year) }) : null,
      h('div', { class: 'rank-now' }, emo(info.emoji), h('b', { text: RANK_INFO[info.id].name }), h('span', { text: S.rankPoints(r.points) })),
      h('div', {
        class: 'rank-bar', role: 'progressbar', 'aria-label': S.rankPoints(r.points),
        'aria-valuemin': String(info.min), 'aria-valuemax': String(next ? next.min : r.points), 'aria-valuenow': String(r.points),
      }, h('i', { vars: { '--p': `${pct}%` } })),
      h('p', { class: 'rank-next', text: next ? S.rankToNext(r.toNext, `${RANK_INFO[next.id].name} ${next.emoji}`) : S.rankTop }));
  }

  /** Under the buttons: how the points work, the season badges kept, and the way to the looks. */
  function seasonNotes(r) {
    const badges = (r.badges || []).map((b) => cosmetic('badge', b)).filter(Boolean);
    return h('div', { class: 'season-notes' },
      badges.length ? h('p', { class: 'rank-badges' }, h('span', { text: S.seasonBadges }), ...badges.map((b) => emo(b.emoji))) : null,
      h('p', { class: 'note rank-how', text: S.rankHow(RANK_POINTS) }),
      button('btn-white btn-mini', [emo('🛍️'), h('span', { text: S.changeLook })], () => bus.emit('ui:shop', 'looks'), { nav: false }));
  }

  /** The look changed in the shop while the Uitdagersreeks screen is open: its card follows. */
  function setDuelCard(card, rank) {
    const box = screens.duel.querySelector('[data-my-card]');
    if (!box) return;
    const name = box.querySelector('.pc-name')?.textContent || st.duelPlaceholder || '';
    box.replaceChildren(playerCard({ name, card: { ...card, rank } }));
  }

  /** The nickname was saved (or refused by the name rules). */
  function setDuelName({ ok, name } = {}) {
    const msg = st.duelMsg;
    if (!msg || !msg.isConnected) return;
    msg.textContent = ok ? (name ? `✓ ${S.duelNickSaved}` : S.duelNickHint) : S.duelNickBad;
    msg.classList.toggle('bad', !ok);
    const pcName = screens.duel.querySelector('[data-my-card] .pc-name');
    if (ok && pcName) pcName.textContent = name || st.duelPlaceholder || '';
  }

  /**
   * Searching ('search'), a friend's room ('room'), "Teen <naam>!" with the 3-2-1 ('versus'),
   * somebody's challenge link ('link') or a problem ('error').
   */
  function showDuelWait(o = {}) {
    if (st.modal) closeModal();
    const kids = [];
    if (o.state === 'search') {
      kids.push(h('div', { class: 'spinner', 'aria-hidden': 'true' }),
        h('h2', { text: S.duelSearching }),
        h('p', { class: 'duel-sub', text: S.duelSearchHint }),
        h('p', { class: 'duel-count', 'data-duel-count': '' }),
        button('btn-white', [icon('close'), h('span', { text: S.duelCancel })], () => bus.emit('ui:duel-cancel')));
    } else if (o.state === 'room') {
      const linkBox = h('input', { class: 'link-box', type: 'text', readonly: true, 'aria-label': S.duelFriend });
      linkBox.value = o.link || '';
      kids.push(h('div', { class: 'spinner', 'aria-hidden': 'true' }),
        h('h2', { text: S.duelWaitFriend }),
        h('p', { class: 'duel-sub', text: S.duelWaitHint }),
        linkBox,
        h('div', { class: 'share-row' },
          button('btn-wa', [icon('chat'), h('span', { text: S.shareWhatsApp })], () => doShare(o.shareText || o.link, 'whatsapp'), { nav: false }),
          button('btn-blue btn-mini', [icon('copy'), h('span', { text: S.copy })], () => doShare(o.link, 'copy'), { nav: false })),
        button('btn-teal', [emo('🤖'), h('span', { text: S.duelPlayLater })], () => bus.emit('ui:duel-later')),
        button('btn-white', [icon('close'), h('span', { text: S.duelCancel })], () => bus.emit('ui:duel-cancel')));
    } else if (o.state === 'versus') {
      // both player cards: theirs big, ours small underneath
      kids.push(h('p', { class: 'vs-badge' }, emo('⚔️')),
        h('h2', { class: 'vs-title', text: S.duelVs(o.oppName || S.duelSomeone) }),
        o.oppCard ? h('div', { class: 'vs-cards' },
          playerCard({ name: o.oppName || S.duelSomeone, card: o.oppCard }),
          o.youCard ? playerCard({ name: o.youName || S.duelYou, card: o.youCard, compact: true }) : null) : null,
        o.note ? h('p', { class: 'duel-sub', text: o.note }) : null,
        h('p', { class: 'vs-count', 'data-duel-count': '', 'aria-live': 'assertive' }));
    } else if (o.state === 'link') {
      kids.push(h('p', { class: 'vs-badge' }, emo('⚔️')),
        h('h2', { class: 'vs-title', text: S.duelLinkTitle(o.oppName || S.duelSomeone) }),
        h('p', { class: 'duel-sub', text: S.duelLinkSub(fmtM(o.height || 0)) }),
        button('btn-big btn-green', [icon('play'), h('span', { text: S.duelLinkPlay })], () => bus.emit('ui:duel-accept')),
        button('btn-white', [icon('home'), h('span', { text: S.home })], () => bus.emit('ui:home')));
    } else {
      kids.push(h('p', { class: 'vs-badge' }, emo('😕')),
        h('p', { class: 'duel-sub', text: o.text || S.duelNoServer }),
        button('btn-white', [icon('again'), h('span', { text: S.back })], () => bus.emit('ui:duel')));
    }
    // the website on an Android phone: a challenge link can go on in the app
    if (o.appLink && (o.state === 'link' || o.state === 'search')) {
      kids.push(h('a', { class: 'btn btn-white app-open', href: o.appLink, onclick: () => bus.emit('ui:app-open') }, emo('📲'), h('span', { text: S.openInApp })));
    }
    // the ✕ top right does what the screen's own way out does (not during the 3-2-1)
    const exit = { search: 'ui:duel-cancel', room: 'ui:duel-cancel', link: 'ui:home', error: 'ui:duel' }[o.state];
    screens.duelwait.replaceChildren(h('div', { class: 'card duel-wait' }, exit ? closeX(() => bus.emit(exit)) : null, kids));
    showScreen('duelwait');
  }

  /** The friend room's line under "Wag vir jou vriend…": `text` (reconnecting), or the usual hint. */
  function setDuelWaitNote(text) {
    const sub = screens.duelwait.querySelector('.duel-wait .duel-sub');
    if (sub && st.screen === 'duelwait') sub.textContent = text || S.duelWaitHint;
  }

  /** The count on the waiting / versus screen ("17", "3", "Bou!"). */
  function setDuelCount(text) {
    const el = screens.duelwait.querySelector('[data-duel-count]');
    if (el) el.textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------
  function gridEl(grid, reason) {
    const cells = [];
    const counts = { P: 0, G: 0, S: 0, X: 0, B: 0, F: 0 };
    for (const ch of String(grid || '')) {
      if (!RATING_EMOJI[ch]) continue;
      cells.push(ch);
      counts[ch]++;
    }
    const max = GRID_COLS * GRID_ROWS;
    const shown = cells.slice(0, max);
    const rows = [];
    let n = 0;
    for (let k = 0; k < shown.length; k += GRID_COLS) {
      rows.push(h('div', { class: 'grid-row' },
        shown.slice(k, k + GRID_COLS).map((c) => h('span', { class: `cell cell-${c}`, vars: { '--i': n++ }, text: CELL_GLYPH[c] }))));
    }
    const end = END_EMOJI[reason];
    const extra = cells.length - max;
    if (!rows.length && end) rows.push(h('div', { class: 'grid-row' }));
    // "+N" (more than 50 blocks) is too wide to hang beside a full row: it gets a row of its own.
    if (extra > 0) rows.push(h('div', { class: 'grid-row' }));
    const lastRow = rows[rows.length - 1];
    if (lastRow && (extra > 0 || end)) {
      lastRow.append(h('span', { class: shown.length && extra <= 0 ? 'grid-tail' : 'grid-tail inline' },
        extra > 0 ? h('span', { class: 'grid-more', text: `+${extra}` }) : null,
        end ? h('span', { class: 'emoji', vars: { '--i': n++ }, text: end }) : null));
    }
    if (!rows.length) return null;
    const label = `${S.perfects} ${counts.P}, ${S.good} ${counts.G}, ${S.skew} ${counts.S}, ${S.lostCount} ${counts.X}`
      + (counts.B ? `, ${S.gifts} ${counts.B}` : '')
      + (counts.F ? `, ${POWERUP_INFO.foundation.name} ${counts.F}` : '');
    return h('div', { class: 'grid', role: 'img', 'aria-label': label }, rows);
  }

  /** One chip per kind of weather (×n when it came back), so a long day still fits on one line. */
  function weatherEl(types) {
    const counts = new Map();
    for (const t of Array.isArray(types) ? types : []) if (WEATHER_INFO[t]) counts.set(t, (counts.get(t) || 0) + 1);
    if (!counts.size) return null;
    const named = counts.size <= 3;
    return h('div', { class: 'wx' },
      h('span', { class: 'label', text: S.weatherToday }),
      [...counts].map(([t, n]) => {
        const w = WEATHER_INFO[t];
        return h('span', { class: named ? 'wx-chip' : 'wx-chip solo', 'data-wx': t, title: w.name, 'aria-label': n > 1 ? `${w.name} ×${n}` : w.name },
          emo(w.emoji), named ? h('span', { text: w.name }) : null, n > 1 ? h('sup', { class: 'wx-n', text: `×${n}` }) : null);
      }));
  }

  /** One line about the day's most memorable visitor ("Jy het Skelm Sakkie gevang! 👮"), or nothing. */
  function visitorsEl(visits) {
    const line = visitorResultLine(visits);
    return line ? h('p', { class: 'res-visitors', text: line }) : null;
  }

  function countUp(el, to, fmt, delay = 260, ms = 900) {
    const target = Number(to) || 0;
    if (reducedMotion() || target <= 0) {
      el.textContent = fmt(target);
      return;
    }
    el.textContent = fmt(0);
    const t0 = performance.now() + delay;
    const step = (t) => {
      if (!el.isConnected) return;
      const k = Math.min(1, Math.max(0, (t - t0) / ms));
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(k >= 1 ? target : target * eased);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function confetti() {
    const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    const cols = PALETTE.map((p) => hex(p.fill));
    for (let i = 0; i < 28; i++) {
      box.append(h('i', {
        vars: {
          '--x': `${(Math.random() * 100).toFixed(1)}%`,
          '--w': (14 + Math.random() * 14).toFixed(0),
          '--h': (10 + Math.random() * 10).toFixed(0),
          '--c': cols[i % cols.length],
          '--t': `${(1.9 + Math.random() * 1.4).toFixed(2)}s`,
          '--d': `${(Math.random() * 0.7).toFixed(2)}s`,
          '--dx': (Math.random() * 240 - 120).toFixed(0),
          '--rot': `${(Math.random() * 1080 - 540).toFixed(0)}deg`,
        },
      }));
    }
    clearTimeout(st.confettiTimer);
    st.confettiTimer = setTimeout(() => box.remove(), 4400);
    return box;
  }

  async function doShare(text, channel) {
    const res = await shareResult(text, channel);
    if (res === 'copied') toast(S.copied);
    else if (res === 'shared') toast(S.shared);
    else if (res === 'failed') toast(S.copyFailed);
  }

  /** Uitdagersreeks results: who won and why. */
  function duelHead(d) {
    const won = d.outcome === 'won';
    const name = d.oppName || S.duelSomeone;
    let title = won ? S.duelWon : S.duelLost;
    let badge = won ? '🏆' : '😮';
    let why;
    if (d.outcome === 'none') {
      title = S.duelLost;
      badge = '📡';
      why = S.duelConnLost;
    } else if (won) {
      why = d.reason === 'goal' ? S.duelWhyGoal
        : d.reason === 'left' ? S.duelWhyTheyLeft(name)
          : d.reason === 'quit' ? S.duelWhyTheyQuit(name) : S.duelWhyTheyFell(name);
    } else {
      why = d.reason === 'goal' ? S.duelWhyTheyGoal(name) : d.reason === 'quit' ? S.duelWhyYouQuit : S.duelWhyYouFell;
    }
    return h('div', { class: 'res-head' },
      h('div', { class: 'chip' }, emo('⚔️'), h('span', { text: S.duel })),
      h('h2', { class: 'res-title' }, emo(badge), h('span', { text: d.outcome === 'none' ? S.duel : title })),
      h('p', { class: 'res-sub', text: why }));
  }

  function showResults({ result, stats = null, isNewBest = false, shareText = '', nextDayAt = 0, mode, city = null, teaser = null, install = null, duel = null, reward = null } = {}) {
    if (st.modal) closeModal();
    const r = result || {};
    const m = mode || r.mode || 'practice';
    const daily = m === 'daily';
    const why = REASONS[r.reason] || REASONS.quit;
    st.resultsDaily = daily;
    st.resultsDateKey = daily ? (r.dateKey || null) : null;
    st.nextDayAt = Number(nextDayAt) || st.nextDayAt;

    // a new record is the headline, whatever ended the run
    const head = duel ? duelHead(duel) : h('div', { class: 'res-head' },
      h('div', { class: 'chip' }, emo(daily ? '🏗️' : '🧱'), h('span', { text: daily ? S.dailyN(r.dayNumber ?? '?') : S.practiceLabel })),
      h('h2', { class: 'res-title' }, emo(isNewBest ? '🏆' : why.emoji), h('span', { text: isNewBest ? S.newRecord : why.title })),
      h('p', { class: 'res-sub', text: isNewBest ? `${why.emoji} ${why.title}` : why.sub }),
      // a saying for the outcome (same for everyone with the same daily seed and outcome); not part of the share text
      h('p', { class: 'saying-line res-saying', text: localSaying(resultSaying(r, isNewBest)) }));
    const empty = !(r.blocksDropped > 0);

    const bigM = h('div', { class: 'big-m', text: fmtM(r.heightM || 0) });
    const scoreB = h('b', { text: fmtInt(r.score || 0) });
    const card = h('div', { class: 'card res-card' },
      h('div', { class: 'res-height' },
        h('div', { class: 'label' }, emo('🏗️'), h('span', { text: S.height })),
        bigM,
        r.durationMs > 0 ? h('div', { class: 'res-time', text: `${S.duration}: ${fmtDuration(r.durationMs)}` }) : null),
      duel
        // the two towers side by side, then points and Perfeks
        ? h('div', { class: 'res-stats' },
          tile(fmtM(duel.youBest || 0), S.duelYou, 'tile-you'),
          tile(fmtM(duel.oppBest || 0), duel.oppName || S.duelSomeone, 'tile-them'),
          h('div', { class: 'tile' }, scoreB, h('span', { text: S.points })),
          tile(fmtInt(r.perfects || 0), S.perfects))
        : h('div', { class: 'res-stats' },
          h('div', { class: 'tile' }, scoreB, h('span', { text: S.points })),
          tile(fmtInt(r.blocksPlaced || 0), S.blocks),
          tile(fmtInt(r.perfects || 0), S.perfects),
          tile(fmtInt(r.maxCombo || 0), S.bestCombo)),
      rewardEl(reward),
      empty ? null : gridEl(r.grid, r.reason),
      empty ? null : weatherEl(r.weather),
      empty ? null : visitorsEl(r.visitors),
      empty
        ? h('p', { class: 'empty-note', text: S.nothingToShare })
        : h('div', { class: 'share-row' },
          // after a match the WhatsApp text carries your run: your friend plays the same tower against it
          button('btn-wa', [icon('chat'), h('span', { text: duel ? S.duelFriend : S.shareWhatsApp })], () => doShare(shareText, 'whatsapp'), { nav: false }),
          typeof navigator !== 'undefined' && typeof navigator.share === 'function'
            ? button('btn-purple btn-mini', [icon('share'), h('span', { text: S.share })], () => doShare(shareText, 'native'), { nav: false })
            : null,
          button('btn-blue btn-mini', [icon('copy'), h('span', { text: S.copy })], () => doShare(shareText, 'copy'), { nav: false })),
      // ✕ in the corner: back to the start screen (instead of a Tuis button under the card)
      h('button', {
        type: 'button', class: 'icon-btn close res-close', 'aria-label': S.close, title: S.close,
        onclick: () => {
          if (!guard()) return;
          audio.play('click');
          bus.emit('ui:home');
        },
      }, icon('close')));

    const wrap = h('div', { class: 'res-wrap' }, head, card);
    if (daily) {
      const streak = Math.max(0, (stats?.currentStreak ?? 0) | 0);
      st.city = city || st.city;
      // today's tower joins the player's own skyline and rises into place
      const cityEl = cityBlock(city, { animate: !empty, streak });
      if (cityEl) wrap.append(h('div', { class: 'card res-city' }, cityEl));
      put(wrap, h('div', { class: 'card res-foot' },
        h('div', { class: `foot-cell streak-cell${streak ? '' : ' is-zero'}` },
          h('b', null, emo('🔥'), fmtInt(streak)),
          h('span', { text: S.currentStreak })),
        st.nextDayAt ? h('div', { class: 'foot-cell' },
          h('b', { 'data-countdown': '', text: fmtClock(st.nextDayAt - Date.now()) }),
          h('span', { text: S.nextTowerCaption })) : null),
        teaser && teaser.text ? h('p', { class: 'res-teaser', text: teaser.text }) : null);
      const inst = empty ? null : installRow(install);
      if (inst) wrap.append(inst);
    }
    wrap.append(h('div', { class: 'btn-row' },
      duel
        ? button('btn-purple btn-duel-again', h('span', { text: S.duelAgain }), () => bus.emit('ui:duel-again'))
        : button('btn-teal', [icon('again'), h('span', { text: daily ? S.practice : S.practiceAgain })], () => bus.emit('ui:play-practice'))));

    // peek: hide the card to look at (and screenshot) the whole tower
    const peek = h('button', {
      type: 'button', class: 'peek-btn', 'aria-pressed': 'false', 'aria-label': S.peek, title: S.peek,
      onclick: () => {
        const on = !screens.results.classList.contains('peek');
        screens.results.classList.toggle('peek', on);
        peek.setAttribute('aria-pressed', String(on));
        peek.querySelector('.peek-lbl').textContent = on ? S.peekBack : S.peek;
        audio.play('click');
      },
    }, icon('eye'), h('span', { class: 'peek-lbl', text: S.peek }));

    screens.results.classList.remove('peek');
    screens.results.replaceChildren(peek, wrap);
    if (isNewBest && !reducedMotion()) screens.results.append(confetti());
    showScreen('results');
    // a daily finished after midnight: the next tower is already open
    if (daily && st.nextDayAt && st.nextDayAt <= Date.now()) {
      st.rolledFor = st.nextDayAt;
      newTowerButtons();
    }
    countUp(bigM, r.heightM || 0, fmtM);
    countUp(scoreB, r.score || 0, fmtInt);
  }

  /** "🪙 +18 · jy het 250", the weekkis box, and, after a match, the rank points ("🥈 Silwer +25"). */
  function rewardEl(reward) {
    const c = reward?.coins;
    const rk = reward?.rank;
    const wk = reward?.week;
    if (!c && !rk && !wk) return null;
    const kids = [];
    if (wk) {
      const notes = [];
      if (wk.saved) notes.push(S.weekSaved(wk.saved));
      else if (wk.restarted) notes.push(S.weekRestart);
      if (wk.day === 7) notes.push(S.weekFull);
      if (wk.shield) notes.push(S.weekShieldWon);
      if (wk.look) notes.push(S.weekLook(COSMETIC_INFO[wk.look.kind]?.[wk.look.id]?.name || ''));
      notes.push(wk.day < 7 ? S.weekTomorrow(WEEK_COINS[wk.day]) : S.weekTomorrow(WEEK_COINS[0]));
      kids.push(h('span', { class: `rw-week${wk.day === 7 ? ' is-full' : ''}` },
        h('b', { text: S.weekBox(wk.day, wk.coins) }),
        h('span', { class: 'rw-sub', text: notes.join(' · ') })));
    }
    if (c) {
      kids.push(h('span', { class: 'rw-coins' }, emo(COIN), h('b', { text: `+${fmtInt(c.added)}` }),
        h('span', { class: 'rw-sub', text: c.short ? S.coinsCapped : S.coinsTotal(fmtInt(c.total)) })));
    }
    if (rk && RANK_INFO[rk.rank]) {
      const r = RANKS.find((x) => x.id === rankFor(rk.points).id) || RANKS[0];
      kids.push(h('span', { class: `rw-rank${rk.up ? ' is-up' : ''}` }, emo(r.emoji),
        h('b', { text: rk.up ? S.rankUp(RANK_INFO[r.id].name) : RANK_INFO[r.id].name }),
        h('span', { class: 'rw-sub', text: S.rankPointsDelta(rk.delta) })));
    }
    return h('div', { class: 'res-reward', role: 'status' }, kids);
  }

  /** The daily reminder exists here (the Android app) and its time ('HH:MM' or null). */
  function setReminderInfo(on, time) {
    st.remindOn = !!on;
    st.remindTime = time || null;
  }

  /** "Moet ek jou elke dag herinner?": three times, and no (or off, once it is on). Emits 'ui:remind-pick'. */
  function showReminder({ time = null } = {}) {
    const pick = (v) => {
      audio.play('click');
      closeModal();
      bus.emit('ui:remind-pick', v);
    };
    const times = [['08:00', S.remindMorning], ['13:00', S.remindNoon], ['18:30', S.remindEvening]];
    modals.remind.replaceChildren(h('div', { class: 'card sheet remind-sheet' },
      closeX(() => closeModal()),
      h('div', { class: 'sheet-head' }, emo('🔔'), h('h2', { id: 'stapel-remind-title', text: S.remindTitle })),
      h('div', { class: 'sheet-body' },
        h('p', { class: 'remind-ask', text: S.remindAsk }),
        h('div', { class: 'remind-times' }, times.map(([v, label]) => button(`btn-blue${time === v ? ' is-on' : ''}`, h('span', { text: label }), () => pick(v), { nav: false })))),
      h('div', { class: 'sheet-foot' }, button('btn-white', h('span', { text: time ? S.remindOff : S.remindNo }), () => pick(null), { nav: false }))));
    openModal('remind');
  }

  /** The game can reach the leaderboard (main.js says so once at start). */
  function setBoardOn(on) {
    st.boardOn = !!on;
  }

  /**
   * "Jy is #23 van 140 vandag" with a Ranglys button, under the height on a daily's results card, once
   * the server has answered. Does nothing if another screen (or another day's result) shows by then.
   */
  function setResultsBoard(dateKey, board) {
    if (!board?.you || st.screen !== 'results' || !st.resultsDaily || st.resultsDateKey !== dateKey) return;
    const box = screens.results.querySelector('.res-height');
    if (!box) return;
    box.querySelector('.res-board')?.remove();
    box.append(h('div', { class: 'res-board', role: 'status' },
      emo('🏆'), h('span', { text: S.boardPlace(board.you.rank, board.players) }),
      h('button', { type: 'button', class: 'res-board-btn', text: S.board, onclick: () => { audio.play('click'); bus.emit('ui:board', dateKey); } })));
  }

  /**
   * A day's leaderboard: the top 10 (medals for the first three), your own row (also when you're not in
   * the top, or hidden), and the "show me" switch. `board` null with `loading` while it comes, null
   * without it when the server can't be reached. `state`: 'saving' while a change is on its way,
   * 'retry' when it didn't arrive (it goes again later). `title` names the day (today's by default).
   */
  function showBoard({ board = null, loading = false, name = '', hidden = false, state = null, title = '', refresh = false } = {}) {
    if (refresh && st.modal !== 'board') return;   // an answer that came after the sheet was closed
    const MEDAL = ['🥇', '🥈', '🥉'];
    const row = (t) => h('li', { class: `board-row${t.you ? ' is-you' : ''}` },
      h('span', { class: 'board-rank' }, t.rank <= 3 ? [emo(MEDAL[t.rank - 1]), h('span', { class: 'sr', text: `#${t.rank}` })] : h('b', { text: `#${t.rank}` })),
      h('span', { class: 'board-name', text: t.you ? `${t.name} (${S.boardYou})` : t.name }),
      h('b', { class: 'board-h', text: fmtM(t.heightM) }));
    let body;
    if (loading) body = h('p', { class: 'board-msg', text: S.boardLoading });
    else if (!board) body = h('p', { class: 'board-msg', text: S.boardOffline });
    else if (!board.top.length && !board.you) body = h('p', { class: 'board-msg', text: S.boardEmpty });
    else {
      // your own row (hidden, or below the top) goes in its place; "⋯" when it is far below the list
      const list = board.top.slice();
      if (board.you && !list.some((t) => t.you)) list.push({ rank: board.you.rank, name: name || S.boardYou, heightM: board.you.heightM, you: true });
      list.sort((a, b) => a.rank - b.rank);
      const rows = [];
      list.forEach((t, k) => {
        if (t.you && k > 0 && t.rank > list[k - 1].rank + 1 && k === list.length - 1) rows.push(h('li', { class: 'board-gap', 'aria-hidden': 'true', text: '⋯' }));
        rows.push(row(t));
      });
      body = h('ol', { class: 'board-list' }, rows);
    }
    // the note says what the server has: a change on its way, one that didn't arrive, or the board's own word
    const hiddenNow = board?.you ? board.you.hidden : hidden;
    const note = state === 'saving' ? S.boardSaving : state === 'retry' ? S.boardRetry : hiddenNow ? S.boardHiddenNote : S.boardAs(name);
    // a rebuilt sheet keeps the keyboard where it was
    const focused = modals.board.contains(document.activeElement) ? ['board-check', 'close'].find((c) => document.activeElement.classList.contains(c)) : null;
    const toggle = h('input', { type: 'checkbox', class: 'board-check' });
    toggle.checked = !hidden;
    toggle.addEventListener('change', () => {
      audio.play('click');
      bus.emit('ui:board-hide', !toggle.checked);
    });
    modals.board.replaceChildren(h('div', { class: 'card sheet board-sheet' },
      h('button', { type: 'button', class: 'icon-btn close', 'aria-label': S.close, title: S.close, onclick: () => { audio.play('click'); closeModal(); } }, icon('close')),
      h('div', { class: 'sheet-head' }, emo('🏆'), h('h2', { id: 'stapel-board-title', text: title || S.boardTitle })),
      h('div', { class: 'sheet-body' }, body),
      h('div', { class: 'sheet-foot board-foot' },
        h('label', { class: 'board-toggle' }, toggle, h('span', { text: S.boardShowMe })),
        h('p', { class: 'note', role: 'status', text: note }),
        button('btn-white', h('span', { text: S.close }), () => closeModal(), { nav: false }))));
    if (st.modal !== 'board') openModal('board');
    else if (focused) modals.board.querySelector(`.${focused}`)?.focus();
  }

  /**
   * "Jy het beter gedoen as 72% van spelers vandag" under the height, once the answer from the
   * server is in. Does nothing if another screen (or another day's result) is showing by then.
   */
  function setResultsPercentile(dateKey, text) {
    if (!text || st.screen !== 'results' || !st.resultsDaily || st.resultsDateKey !== dateKey) return;
    const box = screens.results.querySelector('.res-height');
    if (!box) return;
    box.querySelector('.res-pct')?.remove();
    box.append(h('div', { class: 'res-pct', role: 'status' }, emo('📊'), h('span', { text })));
  }

  // ---------------------------------------------------------------------------
  // In game / hide / toast / loading
  // ---------------------------------------------------------------------------
  function showInGame() {
    if (st.modal) closeModal();
    const active = doc.activeElement;
    if (active && active !== doc.body && root.contains(active)) active.blur();
    showScreen('game');
  }

  function hideAll() {
    if (st.modal) closeModal();
    showScreen(null);
  }

  /** "Eerste by 20 m! Kies ’n straf vir Anna:" and the four punishments; DUEL.chooseMs to pick one. */
  function showPunish({ m, opp, options = [], ms = 7000 } = {}) {
    if (st.screen !== 'game') return;
    const kinds = options.filter((k) => PUNISH_INFO[k]);
    const pick = (k) => {
      if (performance.now() - punishAt < PUNISH_GUARD_MS) return;
      audio.play('click');
      bus.emit('ui:duel-punish', { m, kind: k });
    };
    const btns = kinds.map((k) => {
      const info = PUNISH_INFO[k];
      return h('button', { type: 'button', class: 'punish-btn', 'aria-label': `${info.name}: ${info.what}`, onclick: () => pick(k) },
        emo(info.emoji), h('b', { text: info.name }), h('small', { text: info.what }));
    });
    punishBar.replaceChildren(
      h('p', { class: 'punish-title', text: S.duelChoose(m, opp || S.duelSomeone) }),
      h('div', { class: 'punish-btns' }, btns),
      h('div', { class: 'punish-time', vars: { '--ms': `${ms}ms` } }));
    punishAt = performance.now();
    punishPick = (n) => {
      if (kinds[n]) pick(kinds[n]);
    };
    punishBar.hidden = false;
  }

  /**
   * The power-up tray: [{ id, count, active, enabled, glow }] (null hides it). A count above 1 shows
   * as "×3"; an active power-up (the slow crane, the shield, a Fondamentblok on the hook) shows "AAN".
   */
  function setPowerups(items) {
    if (!items || !items.length || st.screen !== 'game') {
      powerTray.hidden = true;
      powerTray.replaceChildren();
      return;
    }
    powerTray.replaceChildren(...items.filter((it) => POWERUP_INFO[it.id]).map((it) => {
      const info = POWERUP_INFO[it.id];
      return h('button', {
        type: 'button',
        class: `power-btn${it.active ? ' is-active' : ''}${it.glow ? ' is-glow' : ''}`,
        disabled: it.enabled === false,
        'aria-label': `${info.name}: ${info.what}`,
        title: info.name,
        onclick: () => {
          audio.play('click');
          bus.emit('ui:powerup', it.id);
        },
      }, emo(info.emoji),
      it.active ? h('span', { class: 'power-tag', text: S.powerOn }) : it.count > 1 ? h('span', { class: 'power-tag', text: `×${it.count}` }) : null);
    }));
    powerTray.hidden = false;
  }

  /**
   * The short lesson's card at the top (the game goes on underneath: a tap anywhere else still drops
   * a block). { step, total, text } for a step, { done, daily } for the end; null hides it.
   */
  function showTutor(o) {
    if (!o) {
      tutorBar.hidden = true;
      tutorBar.replaceChildren();
      return;
    }
    if (o.done) {
      tutorBar.replaceChildren(
        h('p', { class: 'tutor-text', text: S.lessonDone }),
        h('div', { class: 'tutor-btns' },
          o.daily ? button('btn-green', [emo('🏗️'), h('span', { text: S.lessonDaily })], () => bus.emit('ui:lesson-daily'), { nav: false }) : null,
          button('btn-white', h('span', { text: S.lessonMore }), () => bus.emit('ui:lesson-close'), { nav: false })));
    } else {
      tutorBar.replaceChildren(
        h('span', { class: 'tutor-step', text: `${o.step}/${o.total}` }),
        h('p', { class: 'tutor-text', text: o.text }),
        h('button', { type: 'button', class: 'tutor-skip', text: S.lessonSkip, onclick: () => { audio.play('click'); bus.emit('ui:lesson-close'); } }));
    }
    tutorBar.classList.toggle('is-done', !!o.done);
    tutorBar.hidden = false;
  }

  function hidePunish() {
    punishBar.hidden = true;
    punishBar.replaceChildren();
    punishPick = null;
  }

  function toast(text, ms = 2200) {
    if (!text) return;
    const el = h('div', { class: 'toast', text });
    toastBox.append(el);
    while (toastBox.children.length > MAX_TOASTS) toastBox.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, Math.max(600, ms));
  }

  function setLoading(on) {
    const splash = doc.getElementById('splash');
    if (!splash) return;
    clearTimeout(st.splashTimer);
    if (on) {
      splash.hidden = false;
      splash.classList.remove('done');
      splash.setAttribute('aria-busy', 'true');
    } else {
      splash.classList.add('done');
      splash.removeAttribute('aria-busy');
      st.splashTimer = setTimeout(() => { splash.hidden = true; }, 400);
    }
  }

  /** Top of the daily card (CSS px) while the menu shows, for the attract tower above it. */
  function menuCardTop() {
    if (st.screen !== 'menu') return null;
    const card = screens.menu.querySelector('.daily-card');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return r.height > 0 ? r.top : null;
  }

  return {
    layout,
    menuCardTop,
    setMenuAd,
    showMenu,
    showHowTo,
    showLanguage,
    closeModal,
    showStats,
    showPause,
    showResults,
    showDuel,
    setDuelName,
    showDuelWait,
    setDuelCount,
    setInstall,
    setResultsPercentile,
    setResultsBoard,
    setDuelWaitNote,
    showTutor,
    setReminderInfo,
    showReminder,
    setBoardOn,
    showBoard,
    showInGame,
    hideAll,
    showPunish,
    hidePunish,
    setPowerups,
    showShop,
    setMenuCoins,
    celebrate,
    setDuelCard,
    playerCard,
    toast,
    setLoading,
  };
}
