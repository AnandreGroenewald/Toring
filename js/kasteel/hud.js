// (1.17 3D) Die Kasteelreeks: the screen over the world (dark glass, gold and the sides' colours, drawn icons): the
// scout screen before a siege, the siege itself (time, stars, their castle's damage, your army's cards), and the
// trebuchet's sight (range marks for the drop, dots for the wind, the winch's power).
const I = {
  swaard: '<svg viewBox="0 0 32 32"><path d="M23 4l5 0 0 5-13 13-5-5z" fill="#dfe5ec" stroke="#8a929c" stroke-width="1"/><path d="M8 17l7 7M6 22l4 4" stroke="#c9a227" stroke-width="3" stroke-linecap="round"/><path d="M5 25l2 2" stroke="#5a3a22" stroke-width="4" stroke-linecap="round"/></svg>',
  spies: '<svg viewBox="0 0 32 32"><path d="M6 26 24 8" stroke="#8b5a2b" stroke-width="2.6" stroke-linecap="round"/><path d="M22 4l6 0 0 6-5 2-3-3z" fill="#dfe5ec" stroke="#8a929c"/></svg>',
  boog: '<svg viewBox="0 0 32 32"><path d="M9 4c12 4 14 20 0 24" fill="none" stroke="#8b5a2b" stroke-width="2.6" stroke-linecap="round"/><path d="M9 4v24" stroke="#e8e0cc" stroke-width="1.2"/><path d="M6 16h20" stroke="#dfe5ec" stroke-width="1.6"/><path d="M26 16l-4-3v6z" fill="#dfe5ec"/></svg>',
  ridder: '<svg viewBox="0 0 32 32"><path d="M9 9c0-4 14-4 14 0v13c0 3-14 3-14 0z" fill="#c9d1dc" stroke="#6b737d"/><path d="M11 15h10" stroke="#111" stroke-width="2"/><path d="M16 4v-1" stroke="#c0392b" stroke-width="4" stroke-linecap="round"/><path d="M16 9v14" stroke="#9aa3ad" stroke-width="1"/></svg>',
  ram: '<svg viewBox="0 0 32 32"><path d="M5 14l11-7 11 7z" fill="#7a5636"/><path d="M3 18h22" stroke="#6b4a2b" stroke-width="4" stroke-linecap="round"/><path d="M25 18l5-2v4z" fill="#5c616b"/><circle cx="9" cy="25" r="3" fill="#6b4a2b"/><circle cx="21" cy="25" r="3" fill="#6b4a2b"/></svg>',
  treb: '<svg viewBox="0 0 32 32"><path d="M6 28l10-16 10 16" fill="none" stroke="#8b5a2b" stroke-width="2.4"/><path d="M4 28h24" stroke="#6b4a2b" stroke-width="2.4"/><path d="M9 6l17 12" stroke="#a0703f" stroke-width="2.6" stroke-linecap="round"/><rect x="5" y="4" width="6" height="6" rx="1" fill="#5c616b"/><circle cx="27" cy="21" r="2.2" fill="#9a9285"/></svg>',
  star: (on) => `<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z" fill="${on ? '#ffcf6b' : 'rgba(255,255,255,0.12)'}" stroke="${on ? '#b8862f' : 'rgba(255,255,255,0.4)'}" stroke-width="1.2"/></svg>`,
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#f5c542" stroke="#b8862f" stroke-width="1.6"/><path d="M12 7v10M9 9.5c0-1.4 6-1.4 6 0s-6 1.6-6 3 6 1.6 6 3" stroke="#8a5a12" stroke-width="1.4" fill="none"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M7 4h10v4a5 5 0 0 1-10 0z" fill="#ffcf6b" stroke="#b8862f"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" stroke="#b8862f" fill="none"/><path d="M10 13h4l1 5H9z" fill="#ffcf6b"/><rect x="7" y="18" width="10" height="2.4" rx="1" fill="#b8862f"/></svg>',
};

export function scoutHud(root, s) {
  root.innerHTML = `
    <div class="kh-title"><small>DIE KASTEELREEKS</small><b>${s.name} se kasteel</b>
      <div class="kh-facts"><span><b>${s.towers}</b> torings</span><span><b>${s.perfects}</b> Perfeks</span><span><b>${s.defenders}</b> verdedigers</span></div></div>
    <div class="kh-legend"><span class="kh-l kh-gran">Perfek = graniet</span><span class="kh-l kh-sand">Goed = sandsteen</span><span class="kh-l kh-wood">Skeef = hout</span></div>
    <div class="kh-goals">${s.goals.map((g) => `<div>${I.star(false)}<span>${g}</span></div>`).join('')}</div>
    <div class="kh-cta"><div class="kh-loot">${I.coin}<b>+${s.coins}</b>${I.trophy}<b>+${s.trophies}</b></div><button type="button" class="kh-go">VAL AAN</button></div>`;
}

export function siegeHud(root, s) {
  const card = (k, label, n, on) => `<button type="button" class="kh-card${on ? ' is-on' : ''}">${I[k]}<span>${label}</span><i>${n}</i></button>`;
  root.innerHTML = `
    <div class="kh-top">
      <div class="kh-clock"><b>${s.clock}</b></div>
      <div class="kh-stars">${[0, 1, 2].map((i) => I.star(i < s.stars)).join('')}</div>
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
