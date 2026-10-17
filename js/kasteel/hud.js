import { T } from './text.js';

// (1.17 3D) Die Kasteelreeks: the screen over the world (dark glass, gold and the sides' colours, drawn icons): the
// scout screen before a siege, the siege itself (time, stars, their castle's damage, your army's cards), and the
// trebuchet's sight (range marks for the drop, dots for the wind, the winch's power).
export const ICONS = {
  swaard: '<svg viewBox="0 0 32 32"><path d="M23 4l5 0 0 5-13 13-5-5z" fill="#dfe5ec" stroke="#8a929c" stroke-width="1"/><path d="M8 17l7 7M6 22l4 4" stroke="#c9a227" stroke-width="3" stroke-linecap="round"/><path d="M5 25l2 2" stroke="#5a3a22" stroke-width="4" stroke-linecap="round"/></svg>',
  spies: '<svg viewBox="0 0 32 32"><path d="M6 26 24 8" stroke="#8b5a2b" stroke-width="2.6" stroke-linecap="round"/><path d="M22 4l6 0 0 6-5 2-3-3z" fill="#dfe5ec" stroke="#8a929c"/></svg>',
  boog: '<svg viewBox="0 0 32 32"><path d="M9 4c12 4 14 20 0 24" fill="none" stroke="#8b5a2b" stroke-width="2.6" stroke-linecap="round"/><path d="M9 4v24" stroke="#e8e0cc" stroke-width="1.2"/><path d="M6 16h20" stroke="#dfe5ec" stroke-width="1.6"/><path d="M26 16l-4-3v6z" fill="#dfe5ec"/></svg>',
  ridder: '<svg viewBox="0 0 32 32"><path d="M9 9c0-4 14-4 14 0v13c0 3-14 3-14 0z" fill="#c9d1dc" stroke="#6b737d"/><path d="M11 15h10" stroke="#111" stroke-width="2"/><path d="M16 4v-1" stroke="#c0392b" stroke-width="4" stroke-linecap="round"/><path d="M16 9v14" stroke="#9aa3ad" stroke-width="1"/></svg>',
  ram: '<svg viewBox="0 0 32 32"><path d="M5 14l11-7 11 7z" fill="#7a5636"/><path d="M3 18h22" stroke="#6b4a2b" stroke-width="4" stroke-linecap="round"/><path d="M25 18l5-2v4z" fill="#5c616b"/><circle cx="9" cy="25" r="3" fill="#6b4a2b"/><circle cx="21" cy="25" r="3" fill="#6b4a2b"/></svg>',
  treb: '<svg viewBox="0 0 32 32"><path d="M6 28l10-16 10 16" fill="none" stroke="#8b5a2b" stroke-width="2.4"/><path d="M4 28h24" stroke="#6b4a2b" stroke-width="2.4"/><path d="M9 6l17 12" stroke="#a0703f" stroke-width="2.6" stroke-linecap="round"/><rect x="5" y="4" width="6" height="6" rx="1" fill="#5c616b"/><circle cx="27" cy="21" r="2.2" fill="#9a9285"/></svg>',
  olie: '<svg viewBox="0 0 32 32"><path d="M7 14h18l-2 9a4 4 0 0 1-4 3h-6a4 4 0 0 1-4-3z" fill="#4a4a52" stroke="#2a2a30"/><path d="M8 14c3-2 13-2 16 0" fill="#ffb547"/><path d="M11 10c0-2 2-2 2-4M16 10c0-2 2-2 2-4M21 10c0-2 2-2 2-4" stroke="#e9e4da" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/><path d="M12 28h8" stroke="#ff8a2a" stroke-width="2.4" stroke-linecap="round"/></svg>',
  ballista: '<svg viewBox="0 0 32 32"><path d="M16 26v-8" stroke="#6b4a2b" stroke-width="3"/><path d="M5 12c4 4 18 4 22 0" fill="none" stroke="#8b5a2b" stroke-width="2.6" stroke-linecap="round"/><path d="M5 12l11 6 11-6" fill="none" stroke="#e8e0cc" stroke-width="1"/><path d="M16 21V4" stroke="#a0703f" stroke-width="2.2"/><path d="M16 2l-2.4 4h4.8z" fill="#5c616b"/><path d="M10 28h12" stroke="#6b4a2b" stroke-width="2.6" stroke-linecap="round"/></svg>',
  pieke: '<svg viewBox="0 0 32 32"><path d="M4 26h24" stroke="#6b4a2b" stroke-width="2.6" stroke-linecap="round"/><g fill="#a0703f" stroke="#6b4a2b"><path d="M6 26l3-14 3 14z"/><path d="M13 26l3-17 3 17z"/><path d="M20 26l3-14 3 14z"/></g></svg>',
  star: (on) => `<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z" fill="${on ? '#ffcf6b' : 'rgba(255,255,255,0.12)'}" stroke="${on ? '#b8862f' : 'rgba(255,255,255,0.4)'}" stroke-width="1.2"/></svg>`,
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#f5c542" stroke="#b8862f" stroke-width="1.6"/><path d="M12 7v10M9 9.5c0-1.4 6-1.4 6 0s-6 1.6-6 3 6 1.6 6 3" stroke="#8a5a12" stroke-width="1.4" fill="none"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M7 4h10v4a5 5 0 0 1-10 0z" fill="#ffcf6b" stroke="#b8862f"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" stroke="#b8862f" fill="none"/><path d="M10 13h4l1 5H9z" fill="#ffcf6b"/><rect x="7" y="18" width="10" height="2.4" rx="1" fill="#b8862f"/></svg>',
};

export function scoutHud(root, s) {
  root.innerHTML = `
    <div class="kh-title"><small><a class="k-back" href="index.html">${T.back}</a>${T.series}</small><b>${s.title || T.castleOf(s.name)}</b>
      <div class="kh-facts"><span><b>${s.towers}</b> ${T.towers}</span><span><b>${s.perfects}</b> ${T.perfects}</span><span><b>${s.defenders}</b> ${T.defenders}</span></div></div>
    <div class="kh-legend"><span class="kh-l kh-gran">${T.legend[0]}</span><span class="kh-l kh-sand">${T.legend[1]}</span><span class="kh-l kh-wood">${T.legend[2]}</span></div>
    ${s.mineLink ? `<a class="kh-mine" href="?plan">${T.yourCastleLink}</a>` : ''}
    <div class="kh-goals">${(s.goals || T.goals).map((g) => `<div>${ICONS.star(false)}<span>${g}</span></div>`).join('')}</div>
    <div class="kh-cta"><div class="kh-loot">${ICONS.coin}<b>+${s.coins}</b>${ICONS.trophy}<b>+${s.trophies}</b></div><button type="button" class="kh-go">${T.attack}</button></div>`;
}

export function siegeHud(root, s) {
  const card = (k, label, n, on) => `<button type="button" class="kh-card${on ? ' is-on' : ''}">${ICONS[k]}<span>${label}</span><i>${n}</i></button>`;
  root.innerHTML = `
    <div class="kh-top">
      <div class="kh-clock"><b>${s.clock}</b></div>
      <div class="kh-stars">${[0, 1, 2].map((i) => ICONS.star(i < s.stars)).join('')}</div>
      <div class="kh-dmg"><span>${s.name}</span><i class="kh-bar"><i style="width:${s.damage}%"></i></i><b>${s.damage}%</b></div>
    </div>
    ${s.scope ? `<div class="kh-scope" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs><mask id="kh-hole"><rect x="-200" y="-300" width="500" height="700" fill="#fff"/><circle cx="50" cy="50" r="45" fill="#000"/></mask></defs>
        <rect x="-200" y="-300" width="500" height="700" fill="#07050d" mask="url(#kh-hole)"/>
        <circle cx="50" cy="50" r="45" fill="none" stroke="#000" stroke-width="1.4"/>
        <g stroke="#120d08" stroke-width=".34"><line x1="5" y1="50" x2="44" y2="50"/><line x1="56" y1="50" x2="95" y2="50"/><line x1="50" y1="5" x2="50" y2="44"/><line x1="50" y1="56" x2="50" y2="95"/></g>
        <g stroke="#120d08" stroke-width=".36">${[1, 2, 3, 4].map((k) => `<line x1="${47 - k * 0.6}" y1="${50 + k * 6.5}" x2="${53 + k * 0.6}" y2="${50 + k * 6.5}"/>`).join('')}</g>
        <g fill="#120d08" font-size="2.3" font-weight="700" font-family="Trebuchet MS, system-ui, sans-serif">${[1, 2, 3, 4].map((k) => `<text x="${54 + k * 0.6}" y="${50 + k * 6.5 + 0.8}">${120 + k * 20} m</text>`).join('')}</g>
        <g fill="#120d08">${[-4, -3, -2, -1, 1, 2, 3, 4].map((k) => `<circle cx="${50 + k * 5.2}" cy="50" r=".55"/>`).join('')}</g>
        <circle cx="50" cy="50" r="1.6" fill="none" stroke="#e63946" stroke-width=".35"/>
      </svg>
      <div class="kh-zoom">×3</div>
      <div class="kh-wind"><svg viewBox="0 0 24 24"><path d="M21 12H6m5-6-6 6 6 6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><b>${s.wind}</b><small>m/s</small></div>
      <div class="kh-power"><span>TREK DIE ARM</span><i><i style="width:64%"></i></i><small>hou vas · los om te gooi</small></div>
    </div>` : ''}
    <div class="kh-army">
      ${card('swaard', 'Swaard', s.army.swaard)}${card('spies', 'Spies', s.army.spies)}${card('boog', 'Boog', s.army.boog)}${card('ridder', 'Ridder', s.army.ridder)}${card('ram', 'Stormram', s.army.ram)}${card('treb', 'Trebuchet', 'MIK', true)}
    </div>`;
}

// ------------------------------------------------------------------------------------------- the playable siege
/** The scout screen with a working "VAL AAN" (attack). */
export function scoutScreen(root, s, onGo) {
  scoutHud(root, s);
  root.querySelector('.kh-go').addEventListener('click', onGo, { once: true });
}

const CARDS = ['swaard', 'spies', 'boog', 'ridder', 'ram', 'treb'].map((k) => [k, T.cards[k]]);

/**
 * The siege's screen. `on`: { card(k), goDown(), goUp(), back(), again(), done() }. Returns setters for the clock, stars,
 * damage, cards, a toast, the deploy hint, the trebuchet's sight (wind, the rangefinder, the power) and the end card.
 */
export function createSiegeHud(root, { name, wind }, on) {
  root.innerHTML = `
    <div class="kh-top">
      <button type="button" class="kh-pause" aria-label="Pause"><i></i><i></i></button>
      <div class="kh-clock"><b>3:00</b></div>
      <div class="kh-stars">${[0, 1, 2].map(() => ICONS.star(false)).join('')}</div>
      <div class="kh-dmg"><span>${name}</span><i class="kh-bar"><i style="width:0%"></i></i><b>0%</b></div>
    </div>
    <div class="kh-toast"></div>
    <div class="kh-hint"></div>
    <div class="kh-scope kh-aim" hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs><mask id="kh-hole2"><rect x="-200" y="-300" width="500" height="700" fill="#fff"/><circle cx="50" cy="50" r="45" fill="#000"/></mask></defs>
        <rect x="-200" y="-300" width="500" height="700" fill="#07050d" mask="url(#kh-hole2)"/>
        <circle cx="50" cy="50" r="45" fill="none" stroke="#000" stroke-width="1.4"/>
        <g stroke="#120d08" stroke-width=".34"><line x1="5" y1="50" x2="46" y2="50"/><line x1="54" y1="50" x2="95" y2="50"/><line x1="50" y1="5" x2="50" y2="46"/><line x1="50" y1="54" x2="50" y2="95"/></g>
        <g fill="#120d08">${[-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].map((k) => `<circle cx="${50 + k * 4}" cy="50" r=".5"/>`).join('')}</g>
        <circle cx="50" cy="50" r="1.6" fill="none" stroke="#e63946" stroke-width=".35"/>
      </svg>
      <button type="button" class="kh-back" aria-label="Terug">✕</button>
      <div class="kh-wind"><svg viewBox="0 0 24 24" style="transform:rotate(${wind < 0 ? 0 : 180}deg)"><path d="M21 12H6m5-6-6 6 6 6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><b>${Math.abs(wind).toFixed(1)}</b><small>m/s · ${T.wind}</small></div>
      <div class="kh-range"><small>${T.range}</small><b>—</b></div>
      <div class="kh-power"><span>${T.power}</span><div class="kh-meter"><i class="kh-fill"></i><i class="kh-mark"></i><i class="kh-needle"></i></div><div class="kh-scale"><small>90 m</small><b class="kh-now">—</b><small>210 m</small></div></div>
      <button type="button" class="kh-gooi">${T.throw}</button>
      <p class="kh-aimhint">${T.aimHint}</p>
    </div>
    <div class="kh-army">${CARDS.map(([k, label]) => `<button type="button" class="kh-card" data-k="${k}">${ICONS[k]}<span>${label}</span><i></i></button>`).join('')}</div>
    <div class="kh-end" hidden></div>
    <div class="kh-pausecard" hidden><div><b>II</b><button type="button" class="kh-resume">${T.resume}</button><button type="button" class="kh-quit">${T.quit}</button></div></div>
    <div class="kh-help" hidden></div>`;
  const $ = (s) => root.querySelector(s);
  const cards = [...root.querySelectorAll('.kh-card')];
  for (const c of cards) c.addEventListener('click', () => on.card(c.dataset.k));
  $('.kh-back').addEventListener('click', () => on.back());
  $('.kh-pause').addEventListener('click', () => on.pause?.());
  $('.kh-resume').addEventListener('click', () => on.resume?.());
  $('.kh-quit').addEventListener('click', () => on.quit?.());
  const gooi = $('.kh-gooi');
  gooi.addEventListener('pointerdown', (e) => { e.preventDefault(); gooi.setPointerCapture?.(e.pointerId); on.goDown(); });
  gooi.addEventListener('pointerup', (e) => { e.preventDefault(); on.goUp(); });
  gooi.addEventListener('pointercancel', () => on.goUp());
  let toastT = 0;
  const lo = 90;
  const hi = 210;
  const pct = (m) => `${Math.max(0, Math.min(100, ((m - lo) / (hi - lo)) * 100))}%`;
  return {
    clock(sec) { const s = Math.max(0, Math.ceil(sec)); $('.kh-clock b').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; $('.kh-clock').classList.toggle('is-low', s <= 30); },
    stars(n) { $('.kh-stars').innerHTML = [0, 1, 2].map((i) => ICONS.star(i < n)).join(''); },
    damage(p) { $('.kh-dmg .kh-bar > i').style.width = `${p}%`; $('.kh-dmg b').textContent = `${Math.round(p)}%`; },
    cards(counts, sel, ready) {
      for (const c of cards) {
        const k = c.dataset.k;
        const n = counts[k];
        c.querySelector('i').textContent = k === 'treb' ? (ready ? T.aimN(n) : T.reload) : `${n}`;
        c.classList.toggle('is-on', sel === k);
        c.classList.toggle('is-out', !n || (k === 'treb' && !ready));
      }
    },
    toast(text) {
      const t = $('.kh-toast');
      t.innerHTML = `<span>${text}</span>`;
      t.classList.remove('on');
      void t.offsetWidth;
      t.classList.add('on');
      clearTimeout(toastT);
      toastT = setTimeout(() => t.classList.remove('on'), 2300);
    },
    hint(text) { const h = $('.kh-hint'); h.textContent = text || ''; h.classList.toggle('on', !!text); },
    aim(on) { $('.kh-aim').hidden = !on; root.classList.toggle('is-aim', !!on); },
    range(m) { $('.kh-range b').textContent = m ? `${Math.round(m)} m` : '—'; $('.kh-mark').style.left = m ? pct(m) : '-10%'; },
    power(m, live) {
      $('.kh-needle').style.left = m ? pct(m) : '0%';
      $('.kh-fill').style.width = m ? pct(m) : '0%';
      $('.kh-now').textContent = m ? `${Math.round(m)} m` : '—';
      gooi.classList.toggle('is-down', !!live);
    },
    paused(on) { $('.kh-pausecard').hidden = !on; },
    /** A short first-time tip with a "Got it" (resolves when tapped). */
    help(text) {
      const h = $('.kh-help');
      h.innerHTML = `<div><p>${text}</p><button type="button">${T.gotIt}</button></div>`;
      h.hidden = false;
      return new Promise((res) => h.querySelector('button').addEventListener('click', () => { h.hidden = true; res(); }, { once: true }));
    },
    end(r) {
      const e = $('.kh-end');
      e.innerHTML = `<div class="kh-endcard${r.stars ? ' is-won' : ''}">
        <small>${T.series}</small><b>${r.stars ? T.won : T.lost}</b>
        <div class="kh-endstars">${[0, 1, 2].map((i) => ICONS.star(i < r.stars)).join('')}</div>
        <p>${T.endLine(r.destroyed, r.nameIn, r.lost)}</p>
        <div class="kh-loot">${ICONS.coin}<b>+${r.coins}</b>${ICONS.trophy}<b>${r.trophies >= 0 ? '+' : ''}${r.trophies}</b></div>
        ${r.stars && on.share ? `<button type="button" class="kh-share">${T.share}</button>` : ''}
        <div class="kh-endbtns"><button type="button" class="kh-again">${T.again}</button><button type="button" class="kh-done">${T.done}</button></div></div>`;
      e.hidden = false;
      e.querySelector('.kh-again').addEventListener('click', () => on.again());
      e.querySelector('.kh-done').addEventListener('click', () => on.done());
      e.querySelector('.kh-share')?.addEventListener('click', () => on.share(r));
    },
  };
}
