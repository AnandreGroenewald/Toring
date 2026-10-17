// (1.18 3D) Blokbotsing: the screen over the battle — both sides' bars at the top (crown, height, power), the turn, big
// banners and the little call-outs over the action, the three block cards with BUILD / THROW and each power in words,
// the tap hint, the first-time tip, the pause card and the result card.
import { T, LANG } from './text.js';
import { shapeInfo } from './sim.js';

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const COL = {
  cube: ['#d5d0c6', '#8f897f', '#4a4a50'], plank: ['#b07a46', '#74482a', '#3a2414'], wedge: ['#a9afba', '#646a75', '#2e2f36'],
  crate: ['#b27b46', '#76492a', '#3a2414'], pillar: ['#e0c393', '#a98758', '#5b4630'],
};
/** A block card's picture: the shape's own outline, shaded like its material, with its power's mark. */
export function shapeSvg(shape) {
  const s = shapeInfo(shape);
  const k = Math.min(56 / s.w, 40 / s.h);
  const w = s.w * k;
  const h = s.h * k;
  const ox = (64 - w) / 2;
  const oy = (48 - h) / 2 + 2;
  const d = s.outline.map((p, i) => `${i ? 'L' : 'M'}${(ox + p.x * k).toFixed(1)} ${(oy + p.y * k).toFixed(1)}`).join(' ') + 'Z';
  const [a, b, line] = COL[shape] || COL.cube;
  let extra = '';
  if (shape === 'wedge') {
    const tw = 90 * k;
    for (let i = 0; i < 4; i++) {
      const x = 32 - tw / 2 + (i + 0.5) * (tw / 4);
      extra += `<path d="M${x - 2.6} ${oy} L${x} ${oy - 6} L${x + 2.6} ${oy}Z" fill="#3a3c44" stroke="#1d1e22" stroke-width=".6"/>`;
    }
  } else if (shape === 'crate') {
    extra = `<rect x="${32 - 7}" y="${oy + h / 2 - 6}" width="14" height="12" rx="2" fill="#f2c230" stroke="#1d1a16" stroke-width="1"/><text x="32" y="${oy + h / 2 + 4.2}" text-anchor="middle" font-size="10" font-weight="900" fill="#c62828" font-family="Arial Black,Arial">!</text>`;
  } else if (shape === 'cube') {
    extra = `<rect x="${ox + w * 0.2}" y="${oy}" width="3" height="${h}" fill="#3b3b42"/><rect x="${ox + w * 0.8 - 3}" y="${oy}" width="3" height="${h}" fill="#3b3b42"/>`;
  } else if (shape === 'pillar') {
    extra = `<rect x="${ox - 2}" y="${oy}" width="${w + 4}" height="3.4" fill="${b}" stroke="${line}" stroke-width=".7"/><rect x="${ox - 2}" y="${oy + h - 3.4}" width="${w + 4}" height="3.4" fill="${b}" stroke="${line}" stroke-width=".7"/>`;
  }
  return `<svg viewBox="0 0 64 52" aria-hidden="true"><defs><linearGradient id="g-${shape}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><path d="${d}" fill="url(#g-${shape})" stroke="${line}" stroke-width="1.2" stroke-linejoin="round"/>${extra}</svg>`;
}
const CROWN = '<svg viewBox="0 0 24 20" aria-hidden="true"><path d="M2 16 L3.5 5 L8.5 10 L12 3 L15.5 10 L20.5 5 L22 16 Z" fill="currentColor" stroke="rgba(0,0,0,.35)" stroke-width="1" stroke-linejoin="round"/><rect x="2" y="16" width="20" height="3" rx="1" fill="currentColor"/></svg>';
const ICON = {
  build: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="14" width="16" height="6" rx="1.5" fill="currentColor"/><rect x="7" y="7" width="10" height="6" rx="1.5" fill="currentColor" opacity=".75"/><path d="M12 1v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  throw: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19 C8 4, 16 4, 21 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="2.4 2.6" stroke-linecap="round"/><rect x="17" y="11" width="6" height="6" rx="1.2" fill="currentColor" transform="rotate(20 20 14)"/></svg>',
};

export function createHud({ onPause } = {}) {
  const root = document.getElementById('k-hud');
  root.classList.add('bt');
  root.innerHTML = '';
  const top = el(`<div class="bt-top">
    <div class="bt-side bt-me"><b class="bt-name">${T.you}</b><span class="bt-crown">${CROWN}</span><span class="bt-h">0 m</span><span class="bt-str" title="${T.strength}"><i></i></span><i class="bt-pow"></i></div>
    <div class="bt-turn"><b>12</b><small>${T.blocks}</small><span>${T.yourTurn}</span></div>
    <div class="bt-side bt-foe"><b class="bt-name">${T.rikus}</b><span class="bt-crown">${CROWN}</span><span class="bt-h">0 m</span><span class="bt-str" title="${T.strength}"><i></i></span><i class="bt-pow"></i></div>
  </div>`);
  const corner = el(`<div class="bt-corner"><button class="bt-back" type="button" aria-label="Stapel">‹</button><button class="bt-pause" type="button" aria-label="${T.paused}"><i></i><i></i></button></div>`);
  const banner = el('<div class="bt-banner" aria-live="polite"><b></b><span></span></div>');
  const callouts = el('<div class="bt-callouts"></div>');
  const tray = el('<div class="bt-tray"><div class="bt-pickt"></div><div class="bt-cards"></div><div class="bt-acts"></div></div>');
  const tap = el(`<div class="bt-tap"><button class="bt-cancel" type="button" aria-label="${T.back}">‹</button><div class="bt-tapt"><b></b><span></span></div></div>`);
  const modal = el('<div class="bt-modal" hidden></div>');
  // the throw's power bar (the owner: "a power bar then a direction pin"): it runs up and down until a tap holds it
  const power = el(`<div class="bt-power" aria-hidden="true"><small>${T.powerWord}</small><div class="bt-pbar"><i class="bt-pfill"></i><i class="bt-pmark"></i></div><b>0%</b></div>`);
  // (aiming on a phone: where their tower is, at the screen's edge, when it's off the screen)
  const tgt = el('<div class="bt-target" aria-hidden="true"><b></b><i></i></div>');
  // (the turn's wind: which way, how strong)
  const wind = el(`<div class="bt-wind" aria-hidden="true"><small>${T.wind}</small><b></b><span class="bt-wbars"><i></i><i></i><i></i><i></i><i></i></span><em></em></div>`);
  const flashEl = el('<div class="bt-flash" aria-hidden="true"></div>');
  root.append(flashEl, top, corner, power, tgt, wind, banner, callouts, tray, tap, modal);
  corner.querySelector('.bt-pause').addEventListener('click', () => onPause?.());
  corner.querySelector('.bt-back').addEventListener('click', () => onPause?.(true));

  const sideEl = [top.querySelector('.bt-me'), top.querySelector('.bt-foe')];
  let bannerT = null;
  let onCancel = null;
  tap.querySelector('.bt-cancel').addEventListener('click', () => onCancel?.());

  return {
    root,
    /** Both sides' bars: { turn, of, active, sides: [{ h, crown: 'ok'|'danger'|'lost', power }] } */
    setTop({ blocks, label, active, me = 0, sudden = false, sides }) {
      top.querySelector('.bt-turn b').textContent = String(blocks);
      top.querySelector('.bt-turn small').textContent = sudden ? T.sudden : T.blocks;
      top.querySelector('.bt-turn span').textContent = label;
      top.dataset.active = active === me ? 'me' : 'foe';
      top.dataset.sudden = sudden ? '1' : '';
      sides.forEach((s, i) => {
        const e = sideEl[i];
        e.querySelector('.bt-h').textContent = `${s.h.toFixed(1).replace('.', LANG === 'en' ? '.' : ',')} m`;
        e.dataset.crown = s.crown;
        if (s.str != null) {
          const bar = e.querySelector('.bt-str');
          const prev = Number(bar.dataset.v ?? 100);
          bar.firstElementChild.style.width = `${s.str}%`;
          bar.dataset.v = s.str;
          bar.dataset.low = s.str < 35 ? '1' : '';
          if (s.str < prev - 0.5) { bar.classList.remove('is-hit'); void bar.offsetWidth; bar.classList.add('is-hit'); }
        }
        e.querySelector('.bt-pow').textContent = s.power > 0 ? T.power(s.power) : '';
      });
    },
    /** The two sides' names (left and right). */
    setNames(names) { sideEl.forEach((e, i) => { e.querySelector('.bt-name').textContent = names[i]; }); },
    /** Which pill is you (its colour). */
    setMe(me) { sideEl.forEach((e, i) => e.classList.toggle('is-me', i === me)); },
    /** The big banner in the middle (`sub` under it), gone after `ms`. */
    banner(text, { sub = '', kind = '', ms = 1500 } = {}) {
      banner.querySelector('b').textContent = text;
      banner.querySelector('span').textContent = sub;
      banner.className = `bt-banner is-on ${kind}`;
      clearTimeout(bannerT);
      bannerT = setTimeout(() => banner.classList.remove('is-on'), ms);
    },
    /** Where the big banner is on the stage while it shows (px), else null. */
    bannerBox() {
      if (!banner.classList.contains('is-on')) return null;
      const r = banner.getBoundingClientRect();
      const o = root.getBoundingClientRect();
      return { top: r.top - o.top, bottom: r.bottom - o.top };
    },
    /** A short call-out over a point on the screen (x, y in px of the stage). */
    callout(text, x, y, kind = '') {
      const c = el(`<div class="bt-co ${kind}">${text}</div>`);
      this.place(c, x, y);
      callouts.append(c);
      setTimeout(() => c.remove(), 1500);
      return c;
    },
    /** Moves a call-out (it follows its point while the camera moves). */
    place(c, x, y) {
      const w = root.clientWidth || 390;
      c.style.visibility = x < 24 || x > w - 24 ? 'hidden' : '';   // (its point left the screen: it goes with it)
      c.style.left = `${Math.round(Math.max(70, Math.min(w - 70, x)))}px`;
      c.style.top = `${Math.round(Math.max(150, y))}px`;
    },
    /**
     * The three cards (a block with an element: { shape, element }); a tap picks one (it lifts, its element's powers
     * show), then BUILD or THROW: onChoose(index, action). `img(card)` is the card's picture (the player's own skin).
     */
    showCards(cards, onChoose, { hint = '', selected = 0, throwOnly = false, img = null } = {}) {
      tray.querySelector('.bt-pickt').textContent = hint || T.pick;
      const wrap = tray.querySelector('.bt-cards');
      const acts = tray.querySelector('.bt-acts');
      wrap.innerHTML = '';
      acts.innerHTML = '';
      let picked = -1;
      const choose = (i) => {
        picked = i;
        [...wrap.children].forEach((c, j) => c.classList.toggle('is-on', j === i));
        const card = cards[i];
        const e = T.el[card.element];
        const heavy = card.shape === 'cube' ? ` · ${T.heavy}` : '';
        acts.innerHTML = `${throwOnly ? '' : `
          <button class="bt-act bt-build" type="button" data-act="build">${ICON.build}<b>${T.build}</b><span>${e.build}${heavy}</span><small>${e.buildWhy}</small></button>`}
          <button class="bt-act bt-throw" type="button" data-act="throw">${ICON.throw}<b>${T.throw}</b><span>${e.throw}</span><small>${e.throwWhy}</small></button>`;
        acts.classList.toggle('is-one', throwOnly);
        for (const b of acts.querySelectorAll('button')) b.addEventListener('click', () => { if (picked >= 0) onChoose(picked, b.dataset.act); });
        onChoose(i, null);
      };
      cards.forEach((card, i) => {
        const pic = img ? `<img class="bt-cimg" alt="" src="${img(card)}">` : shapeSvg(card.shape);
        const c = el(`<button class="bt-card el-${card.element}" type="button" data-shape="${card.shape}" data-el="${card.element}">${pic}<b>${T.names[card.shape]}</b><small>${T.el[card.element].name}</small></button>`);
        c.addEventListener('click', () => choose(i));
        wrap.append(c);
      });
      tray.classList.add('is-on');
      choose(Math.max(0, Math.min(cards.length - 1, selected | 0)));
    },
    /** The power bar: shown or not, its level (0-1), held (a tap) or still running. */
    power(on, v = 0, held = false) {
      power.classList.toggle('is-on', !!on);
      if (!on) return;
      power.querySelector('.bt-pfill').style.height = `${Math.round(v * 100)}%`;
      power.querySelector('.bt-pmark').style.bottom = `${Math.round(v * 100)}%`;
      power.querySelector('b').textContent = `${Math.round(v * 100)}%`;
      power.classList.toggle('is-held', !!held);
    },
    hideCards() { tray.classList.remove('is-on'); },
    /** The marker towards their tower (`right`: at the right edge), with its words; off with `on` false. */
    /** A flash over the whole picture (an explosion, the glass breaking): `color`, gone in `ms`. */
    flash(color = '#ffffff', ms = 160) {
      flashEl.style.background = color;
      flashEl.classList.remove('is-on');
      void flashEl.offsetWidth;   // (restart its fade)
      flashEl.style.animationDuration = `${ms}ms`;
      flashEl.classList.add('is-on');
    },
    /** The wind gauge: `w` from -1 (to the left) to 1 (to the right), 0 calm; `kmh` its words. */
    wind(on, w = 0, kmh = 0) {
      wind.classList.toggle('is-on', !!on);
      if (!on) return;
      const n = Math.round(Math.abs(w) * 5);
      wind.querySelector('b').textContent = w < 0 ? '◀' : w > 0 ? '▶' : '';
      wind.classList.toggle('is-calm', n === 0);
      wind.classList.toggle('is-left', w < 0);
      [...wind.querySelectorAll('.bt-wbars i')].forEach((b, i) => b.classList.toggle('is-on', i < n));
      wind.querySelector('em').textContent = n === 0 ? T.calm : `${kmh} km/h`;
    },
    target(on, right = true, text = '') {
      tgt.classList.toggle('is-on', !!on);
      if (!on) return;
      tgt.classList.toggle('is-left', !right);
      if (tgt.querySelector('b').textContent !== text) tgt.querySelector('b').textContent = text;
    },
    /** The tap hint while aiming or dropping (`cancel` goes back to the cards). */
    showTap(title, sub, cancel) {
      tap.querySelector('b').textContent = title;
      tap.querySelector('span').textContent = sub || '';
      onCancel = cancel;
      tap.querySelector('.bt-cancel').hidden = !cancel;
      tap.classList.add('is-on');
    },
    tapSub(sub) { tap.querySelector('span').textContent = sub || ''; },
    hideTap() { tap.classList.remove('is-on'); onCancel = null; },
    /** A card over everything: the tip, the pause, the result. */
    modal(html, handlers = {}) {
      modal.innerHTML = html;
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add('is-on'));
      for (const [sel, fn] of Object.entries(handlers)) modal.querySelector(sel)?.addEventListener('click', fn);
    },
    closeModal() { modal.classList.remove('is-on'); modal.hidden = true; modal.innerHTML = ''; },
    get modalOpen() { return !modal.hidden; },
  };
}
