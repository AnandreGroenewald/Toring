// (1.16, Die Lewende Toring) the screens around a Living Tower match, in the game's own dark-glass look: choose your
// tribe ("kies jou gif") and who to play, the VS screen (both players' rank and level, big), the match's HUD and action
// bar, the result (rank points and XP) and the testers' vote (name, choice, reason; POST /idees/stem).
// The match itself is js/scenes/LewendeScene.js. Lives inside #ui (its --u units).

import { castOf, portraitDataUrl, portraitsReady } from '../game/residents.js';

export const IDEAS = {
  1: { name: 'Wegkruipertjie', sub: 'Versteek jou mense, raai waar syne is', desc: 'Albei torings staan klaar: 5 vloere met 3 kamers elk. Sleep jou 5 mense na die kamers wat jy kies. Gooi dan na een kamer op sy toring, of stuur jou stam se missie. ’n Mis vertel jou hoeveel van syne langsaan woon. Ná elke beurt mag jy iemand skuif.' },
  2: { name: 'Bou en Beskerm', sub: 'Bou, kry mense, val aan', desc: 'Jy bou jou toring met die hyskraan terwyl jy veg. Elke Perfek bring twee nuwe inwoners: jy kies presies in watter kamers hulle intrek. Ná 7 vloere elk wen wie die meeste mense oor het.' },
  3: { name: 'Een Toring, Twee Stamme', sub: 'Een toring saam: gevaarlik', desc: 'Julle bou saam een toring, ’n vloer elk. Jy kies wie in watter kamer van jou nuwe vloer saam ry. Jou missies tref enige kamer, ook joune: pasop!' },
};
export const TRIBE_INFO = {
  vuur: { name: 'Vuur', emoji: '🔥', special: 'Veldbrand', what: '’n kruis van 5 kamers brand uit, vir altyd', strong: 'Warmkop: jou missie laai vinniger', weak: 'Water tref jou harder', hero: 'braai', col: '#e8452c' },
  water: { name: 'Water', emoji: '🌊', special: 'Waterwiel', what: 'spoel 2 hele vloere uit', strong: 'Vloei: jy mag ná jou beurt iemand ekstra skuif', weak: 'Gras tref jou harder', hero: 'haai', col: '#1f8fd6' },
  gras: { name: 'Gras', emoji: '🌱', special: 'Rankgryp', what: 'gryp 4 kamers in ’n kolom, plus 1 lukraak', strong: 'Wortels: jou onderste 2 vloere hou teen water', weak: 'Vuur tref jou harder', hero: 'boer', col: '#3fae3a' },
};
// sample players "online now" for the preview (made up: no real people); the robot plays for them
export const ONLINE = [
  { name: 'Ruan', av: 'haai', tribe: 'water', pts: 980, xp: 5200, st: 'in die lobby' },
  { name: 'Lize', av: 'bytjie', tribe: 'gras', pts: 760, xp: 3900, st: 'in die lobby' },
  { name: 'Jannie', av: 'braai', tribe: 'vuur', pts: 640, xp: 2500, st: 'speel teen Mia', busy: true },
  { name: 'Oom Piet', av: 'boer', tribe: 'gras', pts: 150, xp: 520, st: 'in die lobby' },
];
const TIERS = [['Brons', '#f2b27a', '#a0582a'], ['Silwer', '#ffffff', '#8f9db0'], ['Goud', '#fff0a0', '#d0950e'], ['Platinum', '#d6fbff', '#38b6c9'], ['Diamant', '#e6d8ff', '#7c5cf0']];
const ROMAN = ['I', 'II', 'III'];
export function rankOf(pts) {
  const d = Math.floor(Math.max(0, pts) / 100);
  if (d >= 15) return { name: 'Stapel-legende', tier: 4, div: '★', into: 100 };
  return { name: `${TIERS[Math.floor(d / 3)][0]} ${ROMAN[d % 3]}`, tier: Math.floor(d / 3), div: ROMAN[d % 3], into: pts % 100 };
}
export function levelOf(xp) {
  let lv = 1;
  let need = 120;
  let left = Math.max(0, xp);
  while (left >= need) { left -= need; lv += 1; need = 100 + lv * 20; }
  return { lv, into: left, need };
}
let gradN = 0;
function shield(tier, div, px) {
  const [, c1, c2] = TIERS[tier];
  const id = `ltsg${gradN++}`;
  return `<svg class="lt-shield" width="${px}" height="${Math.round(px * 1.15)}" viewBox="0 0 100 115" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <path d="M50 4 L92 18 L88 64 Q82 96 50 111 Q18 96 12 64 L8 18 Z" fill="url(#${id})" stroke="#1b2550" stroke-width="6"/>
    <path d="M50 30 L56 44 L71 45 L59 55 L63 70 L50 61 L37 70 L41 55 L29 45 L44 44 Z" fill="#fff" stroke="#1b2550" stroke-width="3"/>
    <text x="50" y="96" text-anchor="middle" font-family="Trebuchet MS" font-weight="900" font-size="24" fill="#1b2550">${div}</text></svg>`;
}
// the rooms an attack reaches, as a small 3 x 4 grid of windows (lit: reached)
const SHAPES = {
  one: [[1, 1]],
  cross: [[1, 1], [0, 1], [2, 1], [1, 0], [1, 2]],
  rows: [[0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
  col: [[1, 0], [1, 1], [1, 2], [1, 3], [2, 0]],
};
function shapeSvg(shape) {
  const on = SHAPES[shape];
  if (!on) return '';
  const rows = shape === 'col' ? 4 : 3;
  const cells = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < 3; x++) {
    const lit = on.some(([a, b]) => a === x && b === y);
    cells.push(`<rect x="${2 + x * 13}" y="${2 + y * 11}" width="10" height="8" rx="1.5" fill="${lit ? (shape === 'col' && x === 2 ? '#ffd23f' : '#ff5a3c') : 'rgba(255,255,255,0.18)'}"/>`);
  }
  return `<svg class="lt-wc-shape" viewBox="0 0 41 ${4 + rows * 11}" aria-hidden="true">${cells.join('')}</svg>`;
}
const shortName = (n) => (/^Klein /.test(n) ? n : String(n).split(/[ -]/)[0]);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const PROFILE_KEY = 'stapel.v1.lewende';
function readJson(key, d) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : d; } catch { return d; } }
function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } }

/**
 * The Living Tower's screens. `host`: { root (the #ui element), name() (the player's nickname), apiUrl() (the Worker),
 * start({ idea, tribe, foe, me, ui, onEnd }) (starts the scene), stop() (ends it), back() (to the Uitdagersreeks) }.
 */
export function createLewendeUi(host) {
  const el = document.createElement('div');
  el.className = 'lt-root';
  el.hidden = true;
  host.root.appendChild(el);
  let st = readJson(PROFILE_KEY, { pts: 640, xp: 1650, tribe: 'vuur', played: [], vote: null, voter: null });
  const save = () => writeJson(PROFILE_KEY, st);
  const me = () => ({ name: host.name() || 'Jy', av: TRIBE_INFO[st.tribe]?.hero || 'braai', pts: st.pts, xp: st.xp, tribe: st.tribe });
  const face = (id, cls = '') => `<img class="lt-face ${cls}" alt="" src="${portraitDataUrl(id, 112) || ''}">`;
  const rankChip = (pts, xp, big = false) => {
    const r = rankOf(pts);
    const l = levelOf(xp);
    return `<span class="lt-rank${big ? ' big' : ''}">${shield(r.tier, r.div, big ? 44 : 20)}<b>${r.name}</b><span class="lt-lv"><small>VLAK</small>${l.lv}</span></span>`;
  };
  function show(html) {
    el.innerHTML = html;
    el.hidden = false;
  }
  function hide() {
    el.hidden = true;
    el.innerHTML = '';
  }

  // ---------------------------------------------------------------------------------------------- choose
  function pick(idea) {
    return new Promise((resolve) => {
      const draw = () => {
        const m = me();
        const T = TRIBE_INFO;
        show(`<div class="lt-sheet">
          <button class="lt-x" data-a="back" aria-label="Terug">✕</button>
          <div class="lt-tag">Nuut · Die Lewende Toring · Idee ${idea}</div>
          <h2 class="lt-h">${IDEAS[idea].name}</h2>
          <p class="lt-p">${IDEAS[idea].desc}</p>
          <div class="lt-me">${face(m.av, 'lt-face-l')}<div><b>${esc(m.name)}</b><br>${rankChip(m.pts, m.xp)}</div></div>
          <div class="lt-sec">Jou stam · kies jou gif</div>
          <div class="lt-tribes">${Object.entries(T).map(([k, t]) => `<button class="lt-tribe${st.tribe === k ? ' on' : ''}" data-t="${k}" style="--tc:${t.col}">
            <span class="lt-tribe-top">${face(t.hero)}<b>${t.emoji} ${t.name}</b></span>
            <span class="lt-line"><b>Missie:</b> ${t.special}, ${t.what}</span>
            <span class="lt-line ok">Sterk: ${t.strong}</span><span class="lt-line no">Swak: ${t.weak}</span>
            <span class="lt-cast">${castOf(k).map((c) => face(c, 'lt-face-s')).join('')}</span></button>`).join('')}</div>
          <div class="lt-sec"><span class="lt-dot"></span> Wie is aanlyn? <span class="lt-dim">· voorbeeld</span></div>
          ${ONLINE.map((p, i) => `<div class="lt-pl">${face(p.av)}<div class="lt-who"><b>${esc(p.name)}</b> ${TRIBE_INFO[p.tribe].emoji}<br>${rankChip(p.pts, p.xp)}<div class="lt-st"><span class="lt-dot${p.busy ? ' busy' : ''}"></span>${p.st}</div></div>
            <button class="lt-btn${p.busy ? ' alt' : ''}" data-p="${i}" ${p.busy ? 'disabled' : ''}>${p.busy ? 'Besig' : 'Daag uit'}</button></div>`).join('')}
          <div class="lt-pl">${face('rikus')}<div class="lt-who"><b>Robot Rikus</b> 🤖<br><span class="lt-dim">Oefen teen die robot, enige tyd</span></div><button class="lt-btn grn" data-p="rikus">Speel</button></div>
          <p class="lt-foot">Proef: die spelers hier is voorbeelde, en die robot speel vir hulle.</p></div>`);
        el.querySelector('[data-a="back"]').onclick = () => { hide(); resolve(null); };
        el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { st.tribe = b.dataset.t; save(); draw(); }; });
        el.querySelectorAll('[data-p]').forEach((b) => {
          b.onclick = (e) => {
            e.stopPropagation();   // (the same tap must not also skip the VS screen)
            const k = b.dataset.p;
            const others = Object.keys(TRIBE_INFO).filter((t) => t !== st.tribe);
            const foe = k === 'rikus' ? { name: 'Robot Rikus', av: 'rikus', tribe: others[Math.floor(Math.random() * others.length)], pts: 350, xp: 900 } : ONLINE[Number(k)];
            resolve({ tribe: st.tribe, foe });
          };
        });
      };
      portraitsReady.then(draw);
    });
  }

  // ---------------------------------------------------------------------------------------------- VS
  function versus(idea, foe) {
    return new Promise((resolve) => {
      const m = me();
      const side = (p) => `<div class="lt-vsp">${face(p.av, 'lt-face-xl')}<div class="lt-vsn">${esc(p.name)}</div>${rankChip(p.pts, p.xp, true)}<div class="lt-vst">${TRIBE_INFO[p.tribe].emoji} ${TRIBE_INFO[p.tribe].name}</div></div>`;
      const beat = { vuur: 'gras', water: 'vuur', gras: 'water' };
      const note = beat[m.tribe] === foe.tribe ? `${TRIBE_INFO[m.tribe].emoji} klop ${TRIBE_INFO[foe.tribe].emoji}: jou missies is sterker`
        : beat[foe.tribe] === m.tribe ? `Pasop: ${TRIBE_INFO[foe.tribe].emoji} klop ${TRIBE_INFO[m.tribe].emoji}` : '';
      show(`<div class="lt-vs"><div class="lt-tag">Idee ${idea} · ${IDEAS[idea].name}</div>
        <div class="lt-vsrow">${side(m)}<div class="lt-vsx">VS</div>${side(foe)}</div>
        ${note ? `<div class="lt-chip">${note}</div>` : ''}<div class="lt-dim">tik om te begin</div></div>`);
      const go = () => { clearTimeout(timer); el.onclick = null; resolve(); };
      const timer = setTimeout(go, 3600);
      // a tap skips it, but not the tap that opened it
      setTimeout(() => { if (!el.hidden) el.onclick = go; }, 400);
    });
  }

  // ---------------------------------------------------------------------------------------------- the match's HUD
  let foeNow = null;
  let trayNow = null;
  let dragNow = null;
  let coachEl = null;
  const stopCoach = () => { coachEl?.remove(); coachEl = null; };
  // a person's card dragged out of the tray: the card's face follows the finger; the world lights the room under it. The
  // drag listens on the window, so the tray may redraw its cards meanwhile (the world tells it who is where).
  const cardOf = (id) => el.querySelector(`.lt-pc[data-id="${CSS.escape(id)}"]`);
  function endDrag(ev) {
    const d = dragNow;
    if (!d) return;
    dragNow = null;
    cardOf(d.id)?.classList.remove('lift');
    const ghost = d.ghost;
    const res = ev ? d.t.drag?.drop?.(d.id, ev.clientX, ev.clientY) : (d.t.drag?.cancel?.(), { ok: false });
    if (ghost) {
      let to = res && res.ok ? { x: res.x, y: res.y, s: 0.45 } : null;
      if (!to) {
        const r = cardOf(d.id)?.getBoundingClientRect();
        to = r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, s: 0.7 } : { x: ev?.clientX || 0, y: ev?.clientY || 0, s: 0.3 };
      }
      ghost.style.transition = 'transform 0.18s ease-in, opacity 0.18s ease-in';
      ghost.style.transform = `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(${to.s})`;
      ghost.style.opacity = '0';
      setTimeout(() => ghost.remove(), 220);
    }
  }
  function cardEvents(card, t) {
    const id = card.dataset.id;
    card.onpointerdown = (e) => {
      stopCoach();
      if (card.disabled || dragNow) return;
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY };
      let moved = false;
      const move = (m) => {
        if (m.pointerId !== e.pointerId) return;
        if (!moved && Math.hypot(m.clientX - start.x, m.clientY - start.y) > 8) {
          moved = true;
          if (!t.drag?.start?.(id)) return;
          const ghost = document.createElement('img');
          ghost.className = 'lt-ghost';
          ghost.src = card.querySelector('img')?.src || '';
          ghost.alt = '';
          el.appendChild(ghost);
          dragNow = { id, ghost, t };
          cardOf(id)?.classList.add('lift');
        }
        if (dragNow && dragNow.id === id) {
          dragNow.ghost.style.transform = `translate(${m.clientX}px, ${m.clientY - 46}px) translate(-50%, -50%)`;
          const hot = t.drag?.move?.(id, m.clientX, m.clientY - 46);
          dragNow.ghost.classList.toggle('hot', !!hot);
        }
      };
      const done = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
      };
      const up = (u) => {
        if (u.pointerId !== e.pointerId) return;
        done();
        if (dragNow && dragNow.id === id) endDrag({ clientX: u.clientX, clientY: u.clientY - 46 });
        else if (!moved) t.onTap?.(id);
      };
      const cancel = (c) => {
        if (c.pointerId !== e.pointerId) return;
        done();
        if (dragNow && dragNow.id === id) endDrag(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    };
  }
  const hudApi = {
    hud(m) {
      const card = (s, p) => {
        const pips = Array.from({ length: s.cost }, (_, i) => `<i class="${i < s.charge ? 'f' : ''}"></i>`).join('');
        return `<div class="lt-card${m.active === s.who && !m.over ? ' on' : ''}${s.who === 'ai' ? ' r' : ''}">
          <div class="lt-card-top">${face(p.av, 'lt-face-m')}<div><div class="lt-nm">${esc(s.name)}</div><div class="lt-tr">${TRIBE_INFO[s.tribe].emoji} ${TRIBE_INFO[s.tribe].name}</div></div></div>
          ${rankChip(p.pts, p.xp)}
          <div class="lt-st2"><span>🏠 <b>${s.home}</b></span>${s.reserve ? `<span class="lt-dim">+${s.reserve}</span>` : ''}<span class="lt-pips">${pips}</span></div></div>`;
      };
      const m0 = me();
      const mid = m.idea === 1 ? `Rondte ${m.round}` : `Blok ${Math.min(m.drops + (m.active === 'me' ? 1 : 0), m.maxDrops)}/${m.maxDrops}`;
      el.querySelector('.lt-hud').innerHTML = `${card(m.sides[0], m0)}<div class="lt-mid"><div class="lt-tag">Idee ${m.idea}</div>${m.over || m.active === 'me' ? `<b>${m.over ? 'Klaar' : 'Jou beurt'}</b>` : `<b class="sm">${esc(m.sides[1].name)} se beurt</b>`}<small>${mid}</small>
        <button class="lt-q" data-a="quit" aria-label="Hou op">✕</button></div>${card(m.sides[1], foeNow)}`;
      el.querySelector('[data-a="quit"]').onclick = () => host.quit();
    },
    /**
     * The tray under the world (null hides it): a title and a line, then either the people's cards (drag one to a room, or
     * tap it and then the room), the attack cards, or nothing; buttons on the right. `busy` shows the title only (the robot
     * plays, the camera moves); `tap` says the world waits for a tap.
     */
    tray(t) {
      if (trayNow && t && trayNow.people && t.people && trayNow.people.filter((p) => p.placed).length !== t.people.filter((p) => p.placed).length) stopCoach();
      if (!t) stopCoach();
      trayNow = t;
      const box = el.querySelector('.lt-tray');
      if (!box) return;
      if (dragNow && (!t || !t.people)) endDrag(null);
      box.hidden = !t;
      if (!t) return;
      box.className = `lt-tray${t.busy ? ' busy' : ''}${t.tap ? ' tap' : ''}`;
      const people = t.people || [];
      const weapons = t.weapons || [];
      box.innerHTML = `<div class="lt-tray-head"><div class="lt-tray-txt"><b class="lt-tray-t lt-hint">${esc(t.title || '')}${t.busy ? '<i class="lt-dots"><i></i><i></i><i></i></i>' : ''}</b>${t.sub ? `<span class="lt-tray-s">${t.sub}</span>` : ''}</div><div class="lt-btns"></div></div>
        ${people.length ? `<div class="lt-cards">${people.map((p) => `<button type="button" class="lt-pc${p.placed ? ' placed' : ''}${p.sel ? ' sel' : ''}${p.lost ? ' lost' : ''}" data-id="${esc(p.id)}" ${p.lost ? 'disabled' : ''}><img alt="" draggable="false" src="${portraitDataUrl(p.who, 112) || ''}"><span>${esc(shortName(p.name))}</span>${p.placed ? '<i>✓</i>' : ''}</button>`).join('')}</div>` : ''}
        ${weapons.length ? `<div class="lt-weapons">${weapons.map((w) => `<button type="button" class="lt-wc${w.sel ? ' sel' : ''}${w.ready ? '' : ' off'}" data-w="${w.id}"><span class="lt-wc-ico">${w.icon}</span><span class="lt-wc-txt"><b>${esc(w.name)}</b><small>${esc(w.sub)}</small>${w.cost ? `<span class="lt-pips">${Array.from({ length: w.cost }, (_, i) => `<i class="${i < w.charge ? 'f' : ''}"></i>`).join('')}</span>` : ''}</span>${shapeSvg(w.shape)}</button>`).join('')}</div>` : ''}`;
      const btnBox = box.querySelector('.lt-btns');
      for (const b of t.buttons || []) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = `lt-btn ${b.cls || ''}`;
        x.innerHTML = b.label;
        if (b.disabled) x.disabled = true;
        x.onclick = (e) => { e.stopPropagation(); b.fn(); };
        btnBox.appendChild(x);
      }
      box.querySelectorAll('.lt-wc').forEach((b) => { b.onclick = () => t.onWeapon?.(b.dataset.w); });
      box.querySelectorAll('.lt-pc').forEach((card) => cardEvents(card, t));
      if (dragNow) cardOf(dragNow.id)?.classList.add('lift');
    },
    /** Where the world shows (client px): under the player cards, above the tray. */
    playRect() {
      const hud = el.querySelector('.lt-hud');
      const box = el.querySelector('.lt-tray');
      const root = el.getBoundingClientRect();
      const top = hud ? hud.getBoundingClientRect().bottom : root.top;
      const bottom = box && !box.hidden ? box.getBoundingClientRect().top : root.bottom;
      return { top, bottom };
    },
    /** A hand shows the first drag: from the first card still out to the room at client point `to` (twice, then gone). */
    coach(to) {
      const card = el.querySelector('.lt-pc:not(.placed)');
      if (!card || !to || typeof Element === 'undefined' || !Element.prototype.animate) return;
      stopCoach();
      const r = card.getBoundingClientRect();
      const from = { x: r.left + r.width / 2, y: r.top + r.height * 0.42 };
      const hand = document.createElement('div');
      hand.className = 'lt-coach';
      hand.innerHTML = '<span>👆</span>';
      el.appendChild(hand);
      const at = (p, s) => `translate(${p.x}px, ${p.y}px) translate(-30%, -10%) scale(${s})`;
      const run = hand.animate([
        { transform: at(from, 1.1), opacity: 0 },
        { transform: at(from, 0.92), opacity: 1, offset: 0.16 },
        { transform: at(to, 0.92), opacity: 1, offset: 0.72 },
        { transform: at(to, 1.1), opacity: 0 },
      ], { duration: 1700, iterations: 2, easing: 'ease-in-out' });
      run.onfinish = () => stopCoach();
      coachEl = hand;
    },
    /** The cards wiggle: choose someone first. */
    nudge() {
      const c = el.querySelector('.lt-cards');
      if (!c) return;
      c.classList.remove('nudge');
      void c.offsetWidth;
      c.classList.add('nudge');
    },
    bar(hint, btns = []) { hudApi.tray(hint || btns.length ? { title: hint, buttons: btns } : null); },
    toast(text, { big = false, ms = 1300, sub = '' } = {}) {
      const t = el.querySelector('.lt-toast');
      if (!t) return;
      t.innerHTML = `<div class="${big ? 'big' : ''}">${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
      clearTimeout(hudApi.tt);
      hudApi.tt = setTimeout(() => { t.innerHTML = ''; }, ms);
    },
  };
  function playing(foe) {
    foeNow = foe;
    show('<div class="lt-hud"></div><div class="lt-toast"></div><div class="lt-tray" hidden></div>');
    el.classList.add('lt-play');
    hudApi.tray(trayNow);
  }

  // ---------------------------------------------------------------------------------------------- result
  function result(r, foe) {
    endDrag(null);
    trayNow = null;
    el.classList.remove('lt-play');
    const won = r.winner === 'me';
    const draw = r.winner == null;
    const before = { rk: rankOf(st.pts), lv: levelOf(st.xp) };
    const rp = draw ? 0 : won ? (foe.pts > st.pts ? 30 : 22) : -15;
    const xp = 40 + r.me * 10 + (won ? 30 : 0);
    st.pts = Math.max(0, st.pts + rp);
    st.xp += xp;
    if (!st.played.includes(r.idea)) st.played.push(r.idea);
    save();
    const after = { rk: rankOf(st.pts), lv: levelOf(st.xp) };
    const why = r.why === 'almal' ? (won ? `${esc(foe.name)} het nie meer mense in die toring nie.` : 'Jy het nie meer mense in die toring nie.') : 'Die blokke is op: die meeste mense oor wen.';
    return new Promise((resolve) => {
      show(`<div class="lt-sheet lt-res"><div class="lt-tag">Idee ${r.idea} · ${IDEAS[r.idea].name}</div>
        <h2 class="lt-h big">${draw ? 'Gelykop!' : won ? 'Jy wen! 🎉' : `${esc(foe.name)} wen`}</h2><p class="lt-p">${why}</p>
        <div class="lt-score">${face(me().av, 'lt-face-l')}<b>${r.me} 🏠</b><span class="lt-vsx small">VS</span><b>${r.ai} 🏠</b>${face(foe.av, 'lt-face-l')}</div>
        <div class="lt-gain"><div class="lt-gr">${shield(after.rk.tier, after.rk.div, 22)} <b>${after.rk.name}</b><span class="${rp >= 0 ? 'ok' : 'no'}">${rp >= 0 ? '+' : ''}${rp} rangpunte</span></div>
          <div class="lt-barline"><i style="width:${after.rk.into}%"></i></div>${after.rk.name !== before.rk.name ? `<div class="lt-up">${rp > 0 ? 'Op na' : 'Af na'} ${after.rk.name}!</div>` : ''}
          <div class="lt-gr"><span class="lt-lv"><small>VLAK</small>${after.lv.lv}</span><span class="xp">+${xp} XP</span></div>
          <div class="lt-barline xp"><i style="width:${Math.round((after.lv.into / after.lv.need) * 100)}%"></i></div>${after.lv.lv > before.lv.lv ? `<div class="lt-up">Vlak ${after.lv.lv}!</div>` : ''}</div>
        <div class="lt-vote-card"><b>🗳️ Watter idee hou jy die meeste van?</b><span>${st.played.length < 3 ? `Jy het ${st.played.length} van die 3 gespeel. Probeer al drie, dan stem.` : 'Jy het al drie gespeel: stem vir jou gunsteling!'}</span>
          <button class="lt-btn grn" data-a="vote">Stem nou</button></div>
        <div class="lt-row"><button class="lt-btn" data-a="again">Speel weer</button><button class="lt-btn alt" data-a="other">Ander idee</button></div></div>`);
      el.querySelector('[data-a="vote"]').onclick = () => vote(r.idea);
      el.querySelector('[data-a="again"]').onclick = () => resolve('again');
      el.querySelector('[data-a="other"]').onclick = () => resolve('other');
    });
  }

  // ---------------------------------------------------------------------------------------------- the vote
  function voterId() {
    if (!st.voter || !/^[a-z0-9]{12,32}$/.test(st.voter)) {
      st.voter = Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
      save();
    }
    return st.voter;
  }
  function vote(pref = 0) {
    return new Promise((resolve) => {
      let choice = pref || st.vote?.choice || 0;
      let name = st.vote?.name || host.name() || '';
      let reason = st.vote?.reason || '';
      const modal = document.createElement('div');
      modal.className = 'lt-modal';
      el.appendChild(modal);
      const draw = (msg = '', ok = false) => {
        modal.innerHTML = `<div class="lt-sheet lt-vote"><button class="lt-x" data-a="close" aria-label="Later">✕</button>
          <h2 class="lt-h">🗳️ Watter idee hou jy die meeste van?</h2><p class="lt-p">Jou stem besluit wat ons bou. ${st.played.length < 3 ? `Jy het al ${st.played.length} van die 3 gespeel.` : 'Jy het al drie gespeel. 👏'}</p>
          ${[1, 2, 3].map((k) => `<button class="lt-vopt${choice === k ? ' on' : ''}" data-v="${k}"><span class="n">${k}</span><span><b>${IDEAS[k].name}</b><small>${IDEAS[k].sub}${st.played.includes(k) ? ' · gespeel ✓' : ''}</small></span></button>`).join('')}
          <label class="lt-fld">Jou naam of bynaam<input data-f="name" maxlength="16" value="${esc(name)}" placeholder="bv. Oom Piet"></label>
          <label class="lt-fld">Hoekom? <span class="lt-dim">(nie nodig nie, maar ons lees elke een)</span><textarea data-f="why" maxlength="200" placeholder="Wat het jy lekker gekry? Wat moet beter?">${esc(reason)}</textarea></label>
          <div class="lt-msg${ok ? ' ok' : ''}">${msg}</div>
          <div class="lt-row"><button class="lt-btn grn" data-a="send">${st.vote ? 'Verander my stem' : 'Stem'}</button><button class="lt-btn alt" data-a="close2">Later</button></div>
          <p class="lt-foot">Ons bêre net jou naam, jou keuse, jou rede en watter idees jy gespeel het, vir hierdie stemming, en vee dit uit ná 8 November 2026. Jonger as 18? Vra eers jou ouer of voog.</p></div>`;
        modal.querySelector('[data-f="name"]').oninput = (e) => { name = e.target.value; };
        modal.querySelector('[data-f="why"]').oninput = (e) => { reason = e.target.value; };
        modal.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { choice = Number(b.dataset.v); draw(); }; });
        const close = () => { modal.remove(); resolve(); };
        modal.querySelector('[data-a="close"]').onclick = close;
        modal.querySelector('[data-a="close2"]').onclick = close;
        modal.querySelector('[data-a="send"]').onclick = async () => {
          name = name.trim();
          reason = reason.trim();
          if (!choice) { draw('Kies eers een van die drie idees.'); return; }
          if (name.length < 2) { draw('Skryf jou naam of bynaam, dan weet ons wie gestem het.'); return; }
          const api = (host.apiUrl() || '').replace(/\/+$/, '');
          if (!api) { draw('Die stemming is nie hier oop nie.'); return; }
          try {
            const res = await fetch(`${api}/idees/stem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voter: voterId(), choice, name, reason, played: st.played }) });
            if (res.ok) {
              const j = await res.json().catch(() => ({}));
              st.vote = { choice, name, reason, at: Date.now() };
              save();
              draw(`Dankie! Jou stem vir “${IDEAS[choice].name}” tel. 🗳️${j.reasonDropped ? ' (Jou rede het ’n nommer of adres in gehad, so ons het dit weggelaat.)' : ''}`, true);
              return;
            }
            const code = (await res.json().catch(() => ({}))).error || '';
            draw({ name_rejected: 'Die naam werk nie: probeer ’n ander een (geen vloekwoorde nie).', reason_rejected: 'Jou rede het woorde wat nie mag nie: sê dit anders.',
              rate_limited: 'Te veel probeer: wag ’n bietjie.', vote_closed: 'Die stemming is klaar. Dankie!' }[code] || `Dit het nie gewerk nie (${res.status}).`);
          } catch {
            draw('Geen verbinding nie: probeer weer as jy aanlyn is.');
          }
        };
      };
      draw();
    });
  }

  // ---------------------------------------------------------------------------------------------- the flow
  async function open(idea) {
    let n = [1, 2, 3].includes(idea) ? idea : 0;
    if (!n) n = [1, 2, 3].find((k) => !st.played.includes(k)) || 1;
    for (;;) {
      const choice = await pick(n);
      if (!choice) { hide(); host.back(); return; }
      await versus(n, choice.foe);
      playing(choice.foe);
      const r = await new Promise((resolve) => host.start({ idea: n, tribe: choice.tribe, foe: choice.foe, me: me(), ui: hudApi, onEnd: resolve }));
      host.stop();
      if (!r) { hide(); host.back(); return; }
      const next = await result(r, choice.foe);
      if (next === 'again') continue;
      n = [1, 2, 3].find((k) => !st.played.includes(k)) || (n % 3) + 1;
    }
  }
  return { open, vote, hide, hudApi, profile: () => ({ ...st }) };
}
