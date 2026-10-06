// Stapel — DOM overlay UI: menu, how-to, stats, pause, results, toasts and the
// in-game pause button. Phaser draws the game; everything that needs crisp text
// and real buttons lives here, positioned exactly over the canvas by layout().
// All sizes in css/style.css scale with --u (= canvas width / 720 px).

import { GAME_W, PALETTE, RATING_EMOJI, computeGameHeight } from '../config.js';
import { S, WEATHER_INFO } from '../core/strings.js';
import { fmtM, fmtInt, fmtClock, fmtDuration, DAYS_AF } from '../core/format.js';
import { shareResult } from '../core/share.js';
import { audio, haptics } from '../audio.js';

const GRID_COLS = 10;
const GRID_ROWS = 5;
const END_EMOJI = { flood: '🌊', lives: '💥' };
const REASONS = {
  lives: { emoji: '💥', title: S.overLives, sub: S.overLivesSub },
  flood: { emoji: '🌊', title: S.overFlood, sub: S.overFloodSub },
  quit: { emoji: '🏳️', title: S.overQuit, sub: S.overQuitSub },
};
const CLICK_GUARD_MS = 350;   // swallow double taps on navigation buttons
// In-app grid cells: colour AND a symbol, so every kind of colour blindness can read them.
const CELL_GLYPH = { P: '★', G: '•', S: '∼', X: '✕' };
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
  chart: '<rect x="3.4" y="11.5" width="4.6" height="9" rx="1.3"/><rect x="9.7" y="3.5" width="4.6" height="17" rx="1.3"/><rect x="16" y="8" width="4.6" height="12.5" rx="1.3"/>',
  help: `<circle ${STROKE} stroke-width="2.4" cx="12" cy="12" r="9.4"/><path ${STROKE} stroke-width="2.5" d="M9.3 9.4a2.8 2.8 0 1 1 4 2.5c-.8.4-1.3 1-1.3 1.8v.5"/><circle cx="12" cy="17.3" r="1.45"/>`,
  soundOn: `<path d="M3.5 9.3h3.3L11.6 5c.6-.5 1.4-.1 1.4.7v12.6c0 .8-.8 1.2-1.4.7l-4.8-4.3H3.5c-.6 0-1-.4-1-1V10.3c0-.6.4-1 1-1z"/><path ${STROKE} stroke-width="2.3" d="M16.2 9.2a4 4 0 0 1 0 5.6M18.9 6.5a7.8 7.8 0 0 1 0 11"/>`,
  soundOff: `<path d="M3.5 9.3h3.3L11.6 5c.6-.5 1.4-.1 1.4.7v12.6c0 .8-.8 1.2-1.4.7l-4.8-4.3H3.5c-.6 0-1-.4-1-1V10.3c0-.6.4-1 1-1z"/><path ${STROKE} stroke-width="2.5" d="M16.3 9.4l5 5.2M21.3 9.4l-5 5.2"/>`,
  vibOn: `<rect ${STROKE} stroke-width="2.3" x="7.6" y="3.4" width="8.8" height="17.2" rx="2.2"/><path ${STROKE} stroke-width="2.2" d="M4 8.5v7M1.6 10.2v3.6M20 8.5v7M22.4 10.2v3.6"/>`,
  vibOff: `<rect ${STROKE} stroke-width="2.3" x="7.6" y="3.4" width="8.8" height="17.2" rx="2.2"/><path ${STROKE} stroke-width="2.4" d="M3.5 3.5l17 17"/>`,
  contrastOn: `<circle ${STROKE} stroke-width="2.4" cx="12" cy="12" r="8.6"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2z"/>`,
  contrastOff: `<circle ${STROKE} stroke-width="2.4" cx="12" cy="12" r="8.6"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2z" opacity=".35"/>`,
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

function icon(name) {
  const span = document.createElement('span');
  span.innerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  return span.firstChild;
}

const emo = (ch, cls = '') => h('span', { class: `emoji ${cls}`.trim(), 'aria-hidden': 'true', text: ch });

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

/** "2026-10-06" -> "Di" (UTC maths, DST-proof). */
function dayAbbr(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dow = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
  return (DAYS_AF[dow] || '').slice(0, 2);
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
    rolledFor: 0,
    resultsDaily: false,
    ticker: 0,
    lockUntil: 0,
    externalLayout: false,
    keyboard: false,
    splashTimer: 0,
    confettiTimer: 0,
    modalReturn: null,
  };

  // --- Static structure ----------------------------------------------------
  const screens = {
    menu: h('section', { class: 'screen screen-menu', 'aria-label': S.title, tabindex: '-1' }),
    results: h('section', { class: 'screen screen-results', 'aria-label': S.results, tabindex: '-1' }),
    pause: h('section', { class: 'screen screen-pause', 'aria-label': S.paused, tabindex: '-1' }),
  };
  const modals = {
    howto: h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stapel-howto-title', tabindex: '-1' }),
    stats: h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stapel-stats-title', tabindex: '-1' }),
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

  root.append(screens.menu, screens.results, screens.pause, modals.howto, modals.stats, pauseBtn, toastBox);
  for (const el of [...Object.values(screens), ...Object.values(modals)]) setOn(el, false);

  // Measures env(safe-area-inset-*) so layout() can work out how much of each
  // inset actually overlaps the canvas rect.
  const probe = h('div', {
    'aria-hidden': 'true',
    style: 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);',
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
  renderHowTo(false);

  // --- Global listeners ----------------------------------------------------
  root.addEventListener('pointerdown', () => {
    st.keyboard = false;
    audio.unlock();
  }, { passive: true });
  root.addEventListener('touchstart', () => {}, { passive: true });   // enables :active on iOS
  // Phaser listens for Space/Enter on window; a key that activates a DOM button must not also drop a block.
  const shieldKeys = (e) => {
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && e.target?.closest?.('button')) e.stopPropagation();
  };
  root.addEventListener('keydown', shieldKeys);
  root.addEventListener('keyup', shieldKeys);
  window.addEventListener('keydown', onKey);
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
    if (name && screens[name]) {
      screens[name].scrollTop = 0;
      if (st.keyboard && !st.modal) focusQuietly(screens[name]);
    }
    syncTicker();
  }

  function openModal(name) {
    if (st.modal && st.modal !== name) setOn(modals[st.modal], false);
    st.modal = name;
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
    setOn(modals[name], false);
    const scr = screens[st.screen];
    if (scr) setOn(scr, true);
    if (st.keyboard && st.modalReturn?.isConnected) focusQuietly(st.modalReturn);
    st.modalReturn = null;
    if (name === 'howto') bus.emit('ui:howto-closed');
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

  function onKey(e) {
    st.keyboard = true;
    if (e.defaultPrevented) return;
    const key = e.key;
    if (key === 'Escape' || key === 'Esc') {
      if (st.modal) closeModal();
      else if (st.screen === 'pause') {
        if (guard()) bus.emit('ui:resume');
      } else if (st.screen === 'game') {
        if (guard()) bus.emit('ui:pause');
      }
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
  function renderMenu(m) {
    const stats = m.stats || {};
    const entry = m.today || null;
    const done = !!entry && entry.status === 'done';

    const brand = h('header', { class: 'brand' }, logo(), h('p', { class: 'tagline' }, h('span', { text: S.tagline })));

    const head = h('div', { class: 'daily-head' },
      h('div', { class: 'daily-badge' }, emo('🏗️')),
      h('div', null,
        h('h2', { class: 'daily-title', text: S.dailyN(m.dayNumber ?? '?') }),
        h('p', { class: 'daily-date', text: m.dateLabel || '' })));

    // a brand-new player sees no grey "🔥 0" before they have played
    const card = h('div', { class: 'card daily-card' }, (stats.played | 0) > 0 ? streakChip(stats.currentStreak) : null, head);
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
      if (fc.length) {
        card.append(h('div', { class: 'forecast' },
          h('h3', { class: 'label', text: S.forecast }),
          h('ol', { class: 'fc-strip' }, fc.map((w) => h('li', { class: 'fc-item' },
            h('span', { class: 'fc-emo', 'data-wx': w.key }, emo(w.emoji)),
            h('span', { class: 'fc-name', text: w.name }))))));
      }
      card.append(
        h('p', { class: 'note', text: S.sameForAll }),
        button('btn-big', [icon('play'), h('span', { text: S.playToday })], () => bus.emit('ui:play-daily')));
    }

    const practice = button('btn-teal btn-practice',
      [icon('again'), h('span', { class: 'btn-txt' }, h('span', { text: S.practice }), h('span', { class: 'btn-sub', text: S.practiceSub }))],
      () => bus.emit('ui:play-practice'));

    const dock = h('div', { class: 'dock' },
      dockBtn('help', S.howTo, () => { audio.play('click'); showHowTo(false); }),
      dockBtn('chart', S.stats, () => { audio.play('click'); showStats(st.model?.stats); }),
      toggleBtns());


    screens.menu.replaceChildren(brand, h('div', { class: 'spacer' }),
      h('div', { class: 'menu-stack' }, card, practice, dock));
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
  }

  // ---------------------------------------------------------------------------
  // How to play
  // ---------------------------------------------------------------------------
  function renderHowTo(firstTime) {
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
        button(firstTime ? 'btn-big' : 'btn-big btn-green', [icon('play'), h('span', { text: S.howToGo })], () => closeModal(), { nav: false })));
    modals.howto.replaceChildren(sheet);
  }

  function showHowTo(firstTime = false) {
    renderHowTo(!!firstTime);
    openModal('howto');
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

    const sheet = h('div', { class: 'card sheet' },
      h('button', { type: 'button', class: 'icon-btn close', 'aria-label': S.close, title: S.close, onclick: () => { audio.play('click'); closeModal(); } }, icon('close')),
      h('div', { class: 'sheet-head' }, emo('📊'), h('h2', { id: 'stapel-stats-title', text: S.stats })),
      body,
      h('div', { class: 'sheet-foot stats-foot' },
        h('div', { class: 'dock' }, toggleBtns({ contrast: true })),
        button('btn-white', h('span', { text: S.close }), () => closeModal(), { nav: false })));
    modals.stats.replaceChildren(sheet);
    openModal('stats');
  }

  // ---------------------------------------------------------------------------
  // Pause
  // ---------------------------------------------------------------------------
  function showPause({ mode, started = true } = {}) {
    if (st.modal) closeModal();
    const card = h('div', { class: 'card pause-card' },
      h('div', { class: 'pause-ic', 'aria-hidden': 'true' }, icon('pause')),
      h('h2', { text: S.paused }),
      // before the first drop nothing counts yet, so no warning
      mode === 'daily' && started ? h('p', { class: 'warn' }, emo('⚠️'), h('span', { text: S.quitWarnDaily })) : null,
      button('btn-big btn-green', [icon('play'), h('span', { text: S.resume })], () => bus.emit('ui:resume')),
      button('btn-white btn-quit', [icon('close'), h('span', { text: S.quit })], () => bus.emit('ui:quit')),
      h('div', { class: 'dock' }, toggleBtns({ contrast: true })));
    screens.pause.replaceChildren(card);
    showScreen('pause');
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------
  function gridEl(grid, reason) {
    const cells = [];
    const counts = { P: 0, G: 0, S: 0, X: 0 };
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
    const label = `${S.perfects} ${counts.P}, ${S.good} ${counts.G}, ${S.skew} ${counts.S}, ${S.lostCount} ${counts.X}`;
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

  function showResults({ result, stats = null, isNewBest = false, shareText = '', nextDayAt = 0, mode } = {}) {
    if (st.modal) closeModal();
    const r = result || {};
    const m = mode || r.mode || 'practice';
    const daily = m === 'daily';
    const why = REASONS[r.reason] || REASONS.quit;
    st.resultsDaily = daily;
    st.nextDayAt = Number(nextDayAt) || st.nextDayAt;

    // a new record is the headline, whatever ended the run
    const head = h('div', { class: 'res-head' },
      h('div', { class: 'chip' }, emo(daily ? '🏗️' : '🧱'), h('span', { text: daily ? S.dailyN(r.dayNumber ?? '?') : S.practiceLabel })),
      h('h2', { class: 'res-title' }, emo(isNewBest ? '🏆' : why.emoji), h('span', { text: isNewBest ? S.newRecord : why.title })),
      h('p', { class: 'res-sub', text: isNewBest ? `${why.emoji} ${why.title}` : why.sub }));
    const empty = !(r.blocksDropped > 0);

    const bigM = h('div', { class: 'big-m', text: fmtM(r.heightM || 0) });
    const scoreB = h('b', { text: fmtInt(r.score || 0) });
    const card = h('div', { class: 'card res-card' },
      h('div', { class: 'res-height' },
        h('div', { class: 'label' }, emo('🏗️'), h('span', { text: S.height })),
        bigM,
        r.durationMs > 0 ? h('div', { class: 'res-time', text: `${S.duration}: ${fmtDuration(r.durationMs)}` }) : null),
      h('div', { class: 'res-stats' },
        h('div', { class: 'tile' }, scoreB, h('span', { text: S.points })),
        tile(fmtInt(r.blocksPlaced || 0), S.blocks),
        tile(fmtInt(r.perfects || 0), S.perfects),
        tile(fmtInt(r.maxCombo || 0), S.bestCombo)),
      empty ? null : gridEl(r.grid, r.reason),
      empty ? null : weatherEl(r.weather),
      empty
        ? h('p', { class: 'empty-note', text: S.nothingToShare })
        : h('div', { class: 'share-row' },
          button('btn-wa', [icon('chat'), h('span', { text: S.shareWhatsApp })], () => doShare(shareText, 'whatsapp'), { nav: false }),
          typeof navigator !== 'undefined' && typeof navigator.share === 'function'
            ? button('btn-purple btn-mini', [icon('share'), h('span', { text: S.share })], () => doShare(shareText, 'native'), { nav: false })
            : null,
          button('btn-blue btn-mini', [icon('copy'), h('span', { text: S.copy })], () => doShare(shareText, 'copy'), { nav: false })));

    const wrap = h('div', { class: 'res-wrap' }, head, card);
    if (daily) {
      const streak = Math.max(0, (stats?.currentStreak ?? 0) | 0);
      wrap.append(h('div', { class: 'card res-foot' },
        h('div', { class: `foot-cell streak-cell${streak ? '' : ' is-zero'}` },
          h('b', null, emo('🔥'), fmtInt(streak)),
          h('span', { text: S.currentStreak })),
        st.nextDayAt ? h('div', { class: 'foot-cell' },
          h('b', { 'data-countdown': '', text: fmtClock(st.nextDayAt - Date.now()) }),
          h('span', { text: S.nextTowerCaption })) : null));
    }
    wrap.append(h('div', { class: 'btn-row' },
      button('btn-teal', [icon('again'), h('span', { text: daily ? S.practice : S.practiceAgain })], () => bus.emit('ui:play-practice')),
      button('btn-white', [icon('home'), h('span', { text: S.home })], () => bus.emit('ui:home'))));

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
    showMenu,
    showHowTo,
    showStats,
    showPause,
    showResults,
    showInGame,
    hideAll,
    toast,
    setLoading,
  };
}
