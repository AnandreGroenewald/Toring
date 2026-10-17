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
  const scope = el(`<div class="bt-scope" aria-hidden="true"><small>${T.scope}</small></div>`);
  root.append(top, corner, scope, banner, callouts, tray, tap, modal);
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
    /** A short call-out over a point on the screen (x, y in px of the stage). */
    callout(text, x, y, kind = '') {
      const c = el(`<div class="bt-co ${kind}">${text}</div>`);
      const w = root.clientWidth || 390;
      c.style.left = `${Math.max(70, Math.min(w - 70, x))}px`;
      c.style.top = `${Math.max(150, y)}px`;
      callouts.append(c);
      setTimeout(() => c.remove(), 1500);
    },
    /** The three cards; a tap picks one (it lifts and its powers show), then BUILD or THROW: onChoose(shape, action). */
    showCards(cards, onChoose, { hint = '', selected = null, throwOnly = false } = {}) {
      tray.querySelector('.bt-pickt').textContent = hint || T.pick;
      const wrap = tray.querySelector('.bt-cards');
      const acts = tray.querySelector('.bt-acts');
      wrap.innerHTML = '';
      acts.innerHTML = '';
      let picked = null;
      const choose = (shape) => {
        picked = shape;
        for (const c of wrap.children) c.classList.toggle('is-on', c.dataset.shape === shape);
        const p = T.powers[shape];
        const w = T.why[shape];
        acts.innerHTML = `${throwOnly ? '' : `
          <button class="bt-act bt-build" type="button" data-act="build">${ICON.build}<b>${T.build}</b><span>${p.build}</span><small>${w.build}</small></button>`}
          <button class="bt-act bt-throw" type="button" data-act="throw">${ICON.throw}<b>${T.throw}</b><span>${p.throw}</span><small>${w.throw}</small></button>`;
        acts.classList.toggle('is-one', throwOnly);
        for (const b of acts.querySelectorAll('button')) b.addEventListener('click', () => { if (picked) onChoose(picked, b.dataset.act); });
        onChoose(shape, null);
      };
      for (const shape of cards) {
        const c = el(`<button class="bt-card" type="button" data-shape="${shape}">${shapeSvg(shape)}<b>${T.names[shape]}</b></button>`);
        c.addEventListener('click', () => choose(shape));
        wrap.append(c);
      }
      tray.classList.add('is-on');
      choose(selected && cards.includes(selected) ? selected : cards[0]);
    },
    hideCards() { tray.classList.remove('is-on'); },
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
    /** The scope window over their tower (while pulling); gold when the arc is on their crown. */
    scope(on, gold = false) { scope.classList.toggle('is-on', !!on); scope.classList.toggle('is-gold', !!gold); },
    get scopeEl() { return scope; },
    get scopeOn() { return scope.classList.contains('is-on'); },
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
