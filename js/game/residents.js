// (1.16, the owner 15 Oct: "it needs to be 'Premium' and more than one person should be in a block") Die Lewende Toring:
// people live in the tower's blocks. A block has 1-4 windows (by its size and shape); a window shows its resident in warm
// light (your own blocks), drawn curtains (the other player's: every curtained window looks the same, so nothing leaks),
// an empty room, or a face the other side has spotted. The windows are a second picture over the block's own one (the
// block skins stay exactly as they are) and follow the block like its image. Evicted residents jump with a parachute.

import { DEPTH } from '../config.js';

// ---------------------------------------------------------------------------------------------- the tribes and the cast
export const TRIBES = {
  vuur: { name: 'Vuur', cloth: '#c8321f', clothD: '#6e140b', clothL: '#ff7a52', chute: '#e8452c', chuteL: '#ffb27a' },
  water: { name: 'Water', cloth: '#1f6fb8', clothD: '#0c2f5c', clothL: '#6fc4ff', chute: '#1f8fd6', chuteL: '#9be8ff' },
  gras: { name: 'Gras', cloth: '#2f8f2c', clothD: '#14421a', clothL: '#8be86c', chute: '#3fae3a', chuteL: '#c8ffb0' },
};
export const CAST = {
  boer: { tribe: 'gras', name: 'Boer die Bouer' }, bytjie: { tribe: 'gras', name: 'Bytjie' }, klippie: { tribe: 'gras', name: 'Klippie' },
  madelief: { tribe: 'gras', name: 'Madelief' }, braai: { tribe: 'vuur', name: 'Braai-Boet' }, rissie: { tribe: 'vuur', name: 'Rissie' },
  draakie: { tribe: 'vuur', name: 'Draakie' }, vuurhoutjie: { tribe: 'vuur', name: 'Vuurhoutjie' }, haai: { tribe: 'water', name: 'Haai-Hennie' },
  seekat: { tribe: 'water', name: 'Seekat Sannie' }, duiker: { tribe: 'water', name: 'Duiker Dirk' }, brandweer: { tribe: 'water', name: 'Brandweer-Bettie' },
};
export const castOf = (tribe) => Object.keys(CAST).filter((id) => CAST[id].tribe === tribe);

const flameD = (s) => `M0 0 C ${-s * .75} ${-s * .25} ${-s * .5} ${-s * 1.15} 0 ${-s * 1.75} C ${s * .15} ${-s * 1.15} ${s * .72} ${-s * .95} ${s * .58} ${-s * .3} C ${s * .5} ${-s * .06} ${s * .28} 0 0 0 Z`;
const petals = (c) => [0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-5" rx="3.6" ry="5.5" fill="${c}" transform="rotate(${a})"/>`).join('');
// eye shine: two small highlights on a pair of pupils
const shine = (...xy) => xy.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.25" fill="#fff"/>`).join('');
// head and shoulders on a 100 × 100 board (the window shows about x 10-90, y 14-104)
const ART = {
  rikus: `<rect x="47" y="14" width="6" height="12" fill="#5b6478"/><circle cx="50" cy="13" r="5" fill="#ff5a5a"/><rect x="22" y="26" width="56" height="48" rx="12" fill="#e9eef7" stroke="#5b6478" stroke-width="3"/>
    <rect x="30" y="36" width="40" height="22" rx="8" fill="#1d2b45"/><circle cx="41" cy="47" r="5" fill="#5ff0ff"/><circle cx="59" cy="47" r="5" fill="#5ff0ff"/><rect x="38" y="63" width="24" height="5" rx="2.5" fill="#5b6478"/><path d="M26 104 Q28 80 50 78 Q72 80 74 104 Z" fill="#c9d2e3"/>`,
  boer: `<path d="M14 104 Q18 76 50 73 Q82 76 86 104 Z" fill="#c9a86b" stroke="#8a6d38" stroke-width="2"/><path d="M42 74 L50 86 L58 74" fill="none" stroke="#8a6d38" stroke-width="2.5"/>
    <circle cx="30" cy="54" r="5.5" fill="#eab48d"/><circle cx="70" cy="54" r="5.5" fill="#eab48d"/><circle cx="50" cy="53" r="20" fill="#f3c29c"/>
    <circle cx="43" cy="50" r="2.8" fill="#2b1a10"/><circle cx="57" cy="50" r="2.8" fill="#2b1a10"/>${shine([44, 49], [58, 49])}<circle cx="38" cy="58" r="3.6" fill="#f59a8b" opacity=".7"/><circle cx="62" cy="58" r="3.6" fill="#f59a8b" opacity=".7"/>
    <path d="M38 61 Q44 55 50 60 Q56 55 62 61 Q56 65 50 62 Q44 65 38 61 Z" fill="#7a4a22"/><path d="M45 67 Q50 70 55 67" fill="none" stroke="#7a3b22" stroke-width="2" stroke-linecap="round"/>
    <path d="M27 44 Q29 22 50 21 Q71 22 73 44 Z" fill="#ffcc33" stroke="#c4920f" stroke-width="2"/><rect x="22" y="40" width="56" height="7" rx="3.5" fill="#ffd84d" stroke="#c4920f" stroke-width="2"/><rect x="46.5" y="21.5" width="7" height="19" rx="2" fill="#f0b81e"/>`,
  bytjie: `<ellipse cx="30" cy="44" rx="13" ry="18" fill="#fff" opacity=".9" stroke="#b9d3e6" stroke-width="2" transform="rotate(-25 30 44)"/><ellipse cx="70" cy="44" rx="13" ry="18" fill="#fff" opacity=".9" stroke="#b9d3e6" stroke-width="2" transform="rotate(25 70 44)"/>
    <path d="M42 36 Q36 24 30 20" fill="none" stroke="#2b2b2b" stroke-width="2.5"/><circle cx="30" cy="20" r="3.5" fill="#2b2b2b"/><path d="M58 36 Q64 24 70 20" fill="none" stroke="#2b2b2b" stroke-width="2.5"/><circle cx="70" cy="20" r="3.5" fill="#2b2b2b"/>
    <ellipse cx="50" cy="62" rx="24" ry="26" fill="#ffd23f" stroke="#2b2b2b" stroke-width="2.5"/><path d="M28 70 Q50 76 72 70 L72 77 Q50 84 28 77 Z" fill="#2b2b2b"/><path d="M33 83 Q50 89 67 83 L64 88 Q50 92 36 88 Z" fill="#2b2b2b"/>
    <circle cx="42" cy="54" r="6.5" fill="#fff"/><circle cx="58" cy="54" r="6.5" fill="#fff"/><circle cx="43" cy="55" r="3.4" fill="#2b2b2b"/><circle cx="59" cy="55" r="3.4" fill="#2b2b2b"/>${shine([44, 53.5], [60, 53.5])}
    <circle cx="36" cy="63" r="3.4" fill="#ff9a7a" opacity=".8"/><circle cx="64" cy="63" r="3.4" fill="#ff9a7a" opacity=".8"/><path d="M44 64 Q50 69 56 64" fill="none" stroke="#2b2b2b" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M38 41 Q50 30 62 41 Z" fill="#ff9f1c" stroke="#b86a00" stroke-width="1.8"/><rect x="35" y="39" width="30" height="5" rx="2.5" fill="#ffb347" stroke="#b86a00" stroke-width="1.5"/>`,
  klippie: `<path d="M18 76 Q12 46 36 34 Q56 24 74 36 Q90 50 84 74 Q78 90 50 90 Q24 90 18 76 Z" fill="#a3abb5" stroke="#5d6670" stroke-width="3"/><ellipse cx="68" cy="76" rx="7" ry="4" fill="#8a929c"/>
    <path d="M34 36 Q44 26 56 30 Q66 26 72 36 Q62 34 54 38 Q44 33 34 36 Z" fill="#5cc246"/>
    <circle cx="40" cy="58" r="10" fill="#fff" stroke="#5d6670" stroke-width="1.5"/><circle cx="62" cy="58" r="10" fill="#fff" stroke="#5d6670" stroke-width="1.5"/>
    <circle cx="42" cy="60" r="5" fill="#2b2b2b"/><circle cx="64" cy="60" r="5" fill="#2b2b2b"/><circle cx="43.5" cy="58" r="1.6" fill="#fff"/><circle cx="65.5" cy="58" r="1.6" fill="#fff"/>
    <path d="M45 75 Q51 79 57 75" fill="none" stroke="#3d444c" stroke-width="2.4" stroke-linecap="round"/>`,
  madelief: `<path d="M14 104 Q18 76 50 73 Q82 76 86 104 Z" fill="#ff8ab6" stroke="#c45585" stroke-width="2"/><circle cx="25" cy="60" r="8" fill="#7a4a22"/><circle cx="75" cy="60" r="8" fill="#7a4a22"/>
    <circle cx="50" cy="54" r="20" fill="#f6cfae"/><path d="M29 52 Q28 30 50 29 Q72 30 71 52 Q66 40 50 40 Q36 40 29 52 Z" fill="#7a4a22"/>
    <circle cx="43" cy="53" r="2.8" fill="#2b1a10"/><circle cx="57" cy="53" r="2.8" fill="#2b1a10"/>${shine([44, 52], [58, 52])}<circle cx="38" cy="61" r="3.6" fill="#f59a8b" opacity=".75"/><circle cx="62" cy="61" r="3.6" fill="#f59a8b" opacity=".75"/>
    <path d="M44 64 Q50 69 56 64" fill="none" stroke="#a0442a" stroke-width="2.2" stroke-linecap="round"/><g transform="translate(66 33)">${petals('#fff')}<circle r="3.4" fill="#ffd23f"/></g>`,
  braai: `<path d="M14 104 Q18 76 50 73 Q82 76 86 104 Z" fill="#2f6db5"/><path d="M34 76 L66 76 L70 104 L30 104 Z" fill="#f4f1ea" stroke="#c9c2b3" stroke-width="2"/>
    <circle cx="30" cy="55" r="5.5" fill="#d9a07a"/><circle cx="70" cy="55" r="5.5" fill="#d9a07a"/><circle cx="50" cy="54" r="20" fill="#e8b48c"/>
    <path d="M31 56 Q32 78 50 79 Q68 78 69 56 Q64 66 50 66 Q36 66 31 56 Z" fill="#5b3a1e"/><circle cx="43" cy="51" r="2.8" fill="#2b1a10"/><circle cx="57" cy="51" r="2.8" fill="#2b1a10"/>${shine([44, 50], [58, 50])}
    <path d="M44 70 Q50 74 56 70" fill="none" stroke="#f3d3b8" stroke-width="2.2" stroke-linecap="round"/><path d="M29 46 Q30 28 50 27 Q70 28 71 46 Z" fill="#e8312a"/><path d="M50 44 Q68 42 82 48 Q70 50 52 49 Z" fill="#b5221c"/>`,
  rissie: `<path d="M28 38 C 44 24, 80 30, 76 58 C 73 78, 60 88, 44 94 C 55 82, 56 68, 48 58 C 40 50, 28 48, 28 38 Z" fill="#e8312a" stroke="#8e1712" stroke-width="2.5"/>
    <path d="M28 38 Q 22 26 32 18 Q 34 28 42 30 Q 34 34 28 38 Z" fill="#3f9b35" stroke="#2a6a24" stroke-width="2"/><path d="M40 34 Q 58 30 70 44" fill="none" stroke="#fff" stroke-width="3" opacity=".45" stroke-linecap="round"/>
    <circle cx="50" cy="52" r="6" fill="#fff"/><circle cx="64" cy="52" r="6" fill="#fff"/><circle cx="51" cy="53" r="3" fill="#2b2b2b"/><circle cx="65" cy="53" r="3" fill="#2b2b2b"/>${shine([52, 52], [66, 52])}
    <path d="M44 44 L54 47 M70 44 L60 47" stroke="#5a0d08" stroke-width="2.6" stroke-linecap="round"/><path d="M51 61 Q58 67 66 61" fill="none" stroke="#5a0d08" stroke-width="2.4" stroke-linecap="round"/>`,
  draakie: `<path d="M30 40 L24 18 L40 34 Z" fill="#ffd23f" stroke="#b88400" stroke-width="2"/><path d="M70 40 L76 18 L60 34 Z" fill="#ffd23f" stroke="#b88400" stroke-width="2"/>
    <ellipse cx="50" cy="56" rx="28" ry="24" fill="#4fbf5a" stroke="#2a7a30" stroke-width="2.5"/><ellipse cx="50" cy="70" rx="17" ry="11" fill="#9fe8a6" stroke="#2a7a30" stroke-width="2"/>
    <circle cx="44" cy="69" r="2.2" fill="#1d4a22"/><circle cx="56" cy="69" r="2.2" fill="#1d4a22"/>
    <circle cx="39" cy="50" r="6.5" fill="#fff"/><circle cx="61" cy="50" r="6.5" fill="#fff"/><circle cx="40" cy="51" r="3.3" fill="#2b2b2b"/><circle cx="62" cy="51" r="3.3" fill="#2b2b2b"/>${shine([41, 49.5], [63, 49.5])}
    <path d="M32 42 L44 45 M68 42 L56 45" stroke="#1d4a22" stroke-width="2.4" stroke-linecap="round"/><path d="M43 79 L46 84 L49 79 Z" fill="#fff"/>
    <circle cx="78" cy="30" r="5" fill="#cfd6e0" opacity=".9"/><circle cx="86" cy="22" r="3.5" fill="#cfd6e0" opacity=".8"/>`,
  vuurhoutjie: `<rect x="41" y="52" width="18" height="56" rx="6" fill="#f2d29b" stroke="#b8915a" stroke-width="2"/><ellipse cx="50" cy="46" rx="18" ry="19" fill="#e8312a" stroke="#8e1712" stroke-width="2.5"/>
    <path transform="translate(50 29)" d="${flameD(13)}" fill="#ffb02e"/><path transform="translate(51 29)" d="${flameD(7)}" fill="#fff3a6"/>
    <circle cx="44" cy="45" r="4.5" fill="#fff"/><circle cx="56" cy="45" r="4.5" fill="#fff"/><circle cx="44.6" cy="46" r="2.3" fill="#2b2b2b"/><circle cx="56.6" cy="46" r="2.3" fill="#2b2b2b"/>${shine([45.4, 45], [57.4, 45])}
    <path d="M43 54 Q50 60 57 54" fill="none" stroke="#5a0d08" stroke-width="2.4" stroke-linecap="round"/>`,
  haai: `<path d="M46 36 L58 10 L68 38 Z" fill="#6f8499" stroke="#44576b" stroke-width="2"/><path d="M12 74 Q14 38 50 32 Q86 36 90 72 Q72 90 50 90 Q28 90 12 74 Z" fill="#8299ae" stroke="#44576b" stroke-width="2.5"/>
    <path d="M20 76 Q50 94 82 74 Q68 64 50 64 Q32 64 20 76 Z" fill="#eef3f7"/><circle cx="36" cy="52" r="7" fill="#fff"/><circle cx="64" cy="52" r="7" fill="#fff"/><circle cx="37" cy="53" r="3.6" fill="#1d2b45"/><circle cx="65" cy="53" r="3.6" fill="#1d2b45"/>${shine([38, 51.5], [66, 51.5])}
    <path d="M28 68 Q50 84 74 68 Q50 78 28 68 Z" fill="#7a2030"/><polyline points="30,69 34,74 38,71 42,76 46,72 50,77 54,72 58,76 62,71 66,74 70,69" fill="#fff" stroke="#fff" stroke-width="1"/>`,
  seekat: `${[18, 32, 46, 60, 74].map((x, i) => `<path d="M${x + 4} 60 Q ${x - 6 + i * 2} 80 ${x + 2} 92 Q ${x + 10} 96 ${x + 12} 88" fill="none" stroke="#a066d6" stroke-width="9" stroke-linecap="round"/>`).join('')}
    <ellipse cx="50" cy="46" rx="27" ry="25" fill="#b07ae0" stroke="#6b3fa0" stroke-width="2.5"/><circle cx="40" cy="46" r="7" fill="#fff"/><circle cx="60" cy="46" r="7" fill="#fff"/><circle cx="41" cy="47" r="3.6" fill="#2b2b2b"/><circle cx="61" cy="47" r="3.6" fill="#2b2b2b"/>${shine([42, 45.5], [62, 45.5])}
    <circle cx="33" cy="56" r="3.6" fill="#ff8ab6" opacity=".8"/><circle cx="67" cy="56" r="3.6" fill="#ff8ab6" opacity=".8"/><path d="M44 58 Q50 63 56 58" fill="none" stroke="#4a2275" stroke-width="2.2" stroke-linecap="round"/>
    <g transform="translate(66 24)">${petals('#ffd23f')}<circle r="3" fill="#ff7a3d"/></g>`,
  duiker: `<path d="M14 104 Q18 76 50 73 Q82 76 86 104 Z" fill="#1d2b45"/><path d="M46 76 L54 76 L54 104 L46 104 Z" fill="#ffcf2e"/><circle cx="50" cy="54" r="20" fill="#e8b48c"/>
    <path d="M31 46 Q34 30 50 30 Q66 30 69 46 Q60 38 50 38 Q40 38 31 46 Z" fill="#3a2a1a"/><rect x="29" y="43" width="42" height="20" rx="9" fill="#bfe8ff" stroke="#2a86d6" stroke-width="4"/>
    <circle cx="42" cy="53" r="3" fill="#1d2b45"/><circle cx="58" cy="53" r="3" fill="#1d2b45"/><path d="M36 47 L44 47" stroke="#fff" stroke-width="2.4" opacity=".8" stroke-linecap="round"/>
    <path d="M72 52 L78 24" stroke="#ffcf2e" stroke-width="5" stroke-linecap="round"/><path d="M60 68 Q68 70 72 60" fill="none" stroke="#ffcf2e" stroke-width="4" stroke-linecap="round"/><path d="M45 68 Q50 71 55 68" fill="none" stroke="#7a3b22" stroke-width="2" stroke-linecap="round"/>`,
  brandweer: `<path d="M14 104 Q18 76 50 73 Q82 76 86 104 Z" fill="#f2c12e" stroke="#b88400" stroke-width="2"/><rect x="16" y="88" width="68" height="5" fill="#d8dde6"/>
    <circle cx="27" cy="62" r="7" fill="#7a4a22"/><circle cx="73" cy="62" r="7" fill="#7a4a22"/><circle cx="50" cy="56" r="20" fill="#f3c29c"/>
    <circle cx="43" cy="55" r="2.8" fill="#2b1a10"/><circle cx="57" cy="55" r="2.8" fill="#2b1a10"/>${shine([44, 54], [58, 54])}<circle cx="38" cy="63" r="3.6" fill="#f59a8b" opacity=".75"/><circle cx="62" cy="63" r="3.6" fill="#f59a8b" opacity=".75"/>
    <path d="M44 66 Q50 71 56 66" fill="none" stroke="#a0442a" stroke-width="2.2" stroke-linecap="round"/><path d="M26 48 Q28 24 50 23 Q72 24 74 48 Z" fill="#e8312a" stroke="#8e1712" stroke-width="2"/>
    <path d="M20 46 Q50 40 80 46 L80 51 Q50 45 20 51 Z" fill="#c4221b"/><circle cx="50" cy="34" r="6.5" fill="#ffd23f" stroke="#b88400" stroke-width="1.5"/>`,
};

// ---------------------------------------------------------------------------------------------- portraits (loaded once)
const PORTRAIT = 192;         // px of the cached portrait canvas (drawn smaller everywhere; sharp in the close-up rooms)
const portraits = new Map();  // id -> canvas
let readyVersion = 0;
const waiters = new Set();
/** Resolves once every portrait is drawn (the windows redraw themselves then). Safe to call many times. */
export const portraitsReady = (() => {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return Promise.resolve();
  return Promise.all(Object.keys(ART).map((id) => new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => {
      try {
        const c = document.createElement('canvas');
        c.width = PORTRAIT;
        c.height = PORTRAIT;
        c.getContext('2d').drawImage(img, 0, 0, PORTRAIT, PORTRAIT);
        portraits.set(id, c);
      } catch (e) { /* a portrait that can't draw stays out: the window shows a lit room */ }
      resolve();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${PORTRAIT}" height="${PORTRAIT}">${ART[id]}</svg>`)}`;
  }))).then(() => { readyVersion = 1; for (const w of waiters) w(); waiters.clear(); });
})();
export const portraitOf = (id) => portraits.get(id) || null;

// ---------------------------------------------------------------------------------------------- where the windows go
const MAX_WIN = 4;
/**
 * The windows of a block (texture coordinates, without the padding): 1-4 by the block's shape. Wide blocks get a row,
 * a pillar a column, the crate a 2 × 2, the L / J / T one per cell. Each: { x, y, w, h } (x, y = the window's centre).
 */
export function windowSlots(g) {
  const out = [];
  // arched windows, a little taller than wide; big enough that the faces read on a phone
  const win = (ch) => { const h = Math.max(18, Math.min(34, Math.round(ch * 0.64))); return { w: Math.round(h * 0.78), h }; };
  if (g.shape === 'L' || g.shape === 'J' || g.shape === 'T') {
    for (const c of g.cells) { const sz = win(c.h); out.push({ x: c.x + c.w / 2, y: c.y + c.h / 2 + 1, ...sz }); }
    return out.slice(0, MAX_WIN);
  }
  if (g.shape === 'arch') {
    const c = g.cells[0];
    const sz = win(c.h * 0.78);
    for (let i = 0; i < 3; i++) out.push({ x: c.x + c.w * (i + 1) / 4, y: c.y + c.h * 0.54, ...sz });
    return out;
  }
  if (g.shape === 'crate') {
    const sz = win(g.h * 0.42);
    for (const [fx, fy] of [[0.3, 0.29], [0.7, 0.29], [0.3, 0.72], [0.7, 0.72]]) out.push({ x: g.w * fx, y: g.h * fy, ...sz });
    return out;
  }
  if (g.shape === 'cube') {
    const sz = win(g.h * 0.7);
    for (const fx of [0.29, 0.71]) out.push({ x: g.w * fx, y: g.h * 0.52, ...sz });
    return out;
  }
  if (g.shape === 'pillar') {
    const sz = win(g.w * 0.9);
    for (let i = 0; i < 3; i++) out.push({ x: g.w / 2, y: g.h * (i + 0.5) / 3, ...sz });
    return out;
  }
  if (g.shape === 'wedge') {
    const sz = win(g.h * 0.9);
    for (const fx of [0.33, 0.5, 0.67]) out.push({ x: g.w * fx, y: g.h * 0.56, ...sz });
    return out;
  }
  // a plain block: a row along the middle, as many as fit (2-4)
  const sz = win(g.h);
  const n = Math.max(2, Math.min(MAX_WIN, Math.floor((g.w - 10) / (sz.w + 12))));
  for (let i = 0; i < n; i++) out.push({ x: g.w * (i + 0.5) / n, y: g.h / 2 + 1, ...sz });
  return out;
}

// ---------------------------------------------------------------------------------------------- drawing a window
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** The arched window's outline (a round top on a straight frame), grown by `d`. */
function archPath(ctx, s, d = 0) {
  const x = s.x - s.w / 2 - d, y = s.y - s.h / 2 - d, w = s.w + 2 * d, h = s.h + 2 * d, r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}
/** One window: `v` = { look: 'face'|'room'|'curtain'|'open'|'lit', who, tribe }. */
function drawWindow(ctx, s, v) {
  const x = s.x - s.w / 2, y = s.y - s.h / 2;
  const t = TRIBES[v.tribe] || TRIBES.vuur;
  const warm = v.look === 'face' || v.look === 'lit' || v.look === 'curtain';
  // lamplight spilling onto the block around a lived-in window
  if (warm) {
    const g = ctx.createRadialGradient(s.x, s.y, s.h * 0.2, s.x, s.y, s.h * 1.05);
    g.addColorStop(0, 'rgba(255,196,96,0.42)');
    g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(s.x - s.h * 1.1, s.y - s.h * 1.1, s.h * 2.2, s.h * 2.2);
  }
  // (1.16) a Veldbrand's window: soot licks up the wall above it
  const burnt = v.look === 'burnt';
  if (burnt) {
    const so = ctx.createRadialGradient(s.x, y - s.h * 0.1, 1, s.x, y - s.h * 0.2, s.h * 1.15);
    so.addColorStop(0, 'rgba(20,14,12,0.75)');
    so.addColorStop(1, 'rgba(20,14,12,0)');
    ctx.fillStyle = so;
    ctx.fillRect(s.x - s.h * 1.2, y - s.h * 1.3, s.h * 2.4, s.h * 1.9);
  }
  // the frame: cream wood with a soft shadow, sunk a little into the block
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1.2;
  archPath(ctx, s, 2.6);
  const fr = ctx.createLinearGradient(0, y - 3, 0, y + s.h + 3);
  fr.addColorStop(0, burnt ? '#5a4a42' : '#fffaf0');
  fr.addColorStop(1, burnt ? '#2a201c' : '#d9c39a');
  ctx.fillStyle = fr;
  ctx.fill();
  ctx.restore();
  archPath(ctx, s, 2.6);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = 'rgba(70,45,20,0.55)';
  ctx.stroke();

  // inside
  ctx.save();
  archPath(ctx, s, 0);
  ctx.clip();
  const room = ctx.createRadialGradient(s.x, y + s.h * 0.3, 1, s.x, y + s.h * 0.6, s.h);
  if (warm) {
    room.addColorStop(0, '#fff3cf');
    room.addColorStop(0.5, '#ffc766');
    room.addColorStop(1, '#a8520f');
  } else {
    room.addColorStop(0, '#3b4a78');
    room.addColorStop(1, '#10162c');
  }
  ctx.fillStyle = room;
  ctx.fillRect(x - 1, y - 1, s.w + 2, s.h + 2);
  if ((v.look === 'face' || v.look === 'lit') && portraits.get(v.who)) {
    const p = portraits.get(v.who);
    const size = s.h * 1.28;
    ctx.drawImage(p, s.x - size / 2, y + s.h - size * 0.97, size, size);
    const sh = ctx.createLinearGradient(0, y + s.h * 0.66, 0, y + s.h);
    sh.addColorStop(0, 'rgba(70,25,0,0)');
    sh.addColorStop(1, 'rgba(70,25,0,0.4)');
    ctx.fillStyle = sh;
    ctx.fillRect(x, y, s.w, s.h);
  }
  if (v.look === 'curtain') {
    // drawn curtains with the lamp on behind them: two drapes of the tribe's cloth meeting in the middle and glowing
    // through (no bright gap between them: that read as a little flame); every curtained window looks the same
    for (const side of [-1, 1]) {
      const ox = side < 0 ? x - 1 : x + s.w + 1;
      const inner = s.x - side * 0.5;
      ctx.beginPath();
      ctx.moveTo(ox, y - 1);
      ctx.lineTo(inner, y - 1);
      ctx.bezierCurveTo(inner + side * 1.1, y + s.h * 0.4, inner - side * 1.1, y + s.h * 0.72, inner, y + s.h + 1);
      ctx.lineTo(ox, y + s.h + 1);
      ctx.closePath();
      const c0 = Math.min(ox, inner), c1 = Math.max(ox, inner);
      const cloth = ctx.createLinearGradient(c0, 0, c1, 0);
      [t.clothD, t.cloth, t.clothD, t.cloth, t.clothD].forEach((c, k) => cloth.addColorStop(k / 4, c));
      ctx.fillStyle = cloth;
      ctx.fill();
    }
    // the lamp behind: the cloth lit through in its own colour, warmest in the middle
    const lamp = ctx.createRadialGradient(s.x, y + s.h * 0.58, 0.5, s.x, y + s.h * 0.58, s.h * 0.62);
    lamp.addColorStop(0, `${t.clothL}d9`);
    lamp.addColorStop(0.55, `${t.clothL}55`);
    lamp.addColorStop(1, `${t.clothL}00`);
    ctx.fillStyle = lamp;
    ctx.fillRect(x - 1, y - 1, s.w + 2, s.h + 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(s.x - 0.45, y, 0.9, s.h + 1);
    const shade = ctx.createLinearGradient(0, y, 0, y + s.h);
    shade.addColorStop(0, 'rgba(255,255,255,0.1)');
    shade.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = shade;
    ctx.fillRect(x - 1, y - 1, s.w + 2, s.h + 2);
  }
  if (v.look === 'open') {
    // the curtains pulled right aside: the room is known to be empty
    const tie = 0.08;
    for (const side of [-1, 1]) {
      const ox = side < 0 ? x : x + s.w;
      const inner = s.x - side * 0.4;
      ctx.beginPath();
      ctx.moveTo(ox, y - 1);
      ctx.lineTo(ox - side * s.w * 0.22, y - 1);
      ctx.quadraticCurveTo(ox - side * s.w * (tie + 0.2), y + s.h * 0.5, ox - side * s.w * tie, y + s.h * 0.66);
      ctx.quadraticCurveTo(ox - side * s.w * (tie * 0.7), y + s.h * 0.84, ox - side * s.w * (tie + 0.06), y + s.h + 1);
      ctx.lineTo(ox, y + s.h + 1);
      ctx.closePath();
      const c0 = Math.min(ox, inner), c1 = Math.max(ox, inner);
      const cloth = ctx.createLinearGradient(c0, 0, c1, 0);
      for (let k = 0; k <= 6; k++) cloth.addColorStop(k / 6, k % 2 ? t.clothD : t.cloth);
      ctx.fillStyle = cloth;
      ctx.fill();
      const shade = ctx.createLinearGradient(0, y, 0, y + s.h);
      shade.addColorStop(0, 'rgba(255,255,255,0.18)');
      shade.addColorStop(1, 'rgba(0,0,0,0.32)');
      ctx.fillStyle = shade;
      ctx.fill();
      // the gold tieback
      ctx.beginPath();
      ctx.arc(ox - side * s.w * tie, y + s.h * 0.66, Math.max(1.2, s.w * 0.06), 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
    }
  }
  if (v.look === 'curtain' || v.look === 'open') {
    // the scalloped valance with a gold trim
    const vh = s.h * 0.2;
    const sc = 3;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 1);
    ctx.lineTo(x + s.w + 1, y - 1);
    ctx.lineTo(x + s.w + 1, y + vh);
    for (let k = sc; k > 0; k--) ctx.quadraticCurveTo(x + s.w * (k - 0.5) / sc, y + vh * 1.7, x + s.w * (k - 1) / sc, y + vh);
    ctx.closePath();
    ctx.fillStyle = t.clothD;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + s.w + 1, y + vh);
    for (let k = sc; k > 0; k--) ctx.quadraticCurveTo(x + s.w * (k - 0.5) / sc, y + vh * 1.7, x + s.w * (k - 1) / sc, y + vh);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = '#ffd23f';
    ctx.stroke();
  }
  // the glass: a soft reflection across the top-left
  const glass = ctx.createLinearGradient(x, y, x + s.w, y + s.h);
  glass.addColorStop(0, 'rgba(255,255,255,0.38)');
  glass.addColorStop(0.3, 'rgba(255,255,255,0.05)');
  glass.addColorStop(0.31, 'rgba(255,255,255,0)');
  ctx.fillStyle = glass;
  ctx.fillRect(x, y, s.w, s.h);
  ctx.restore();
  // the sill
  ctx.fillStyle = '#efe0bd';
  ctx.fillRect(x - 3.5, y + s.h + 1.6, s.w + 7, 2.4);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x - 3.5, y + s.h + 4, s.w + 7, 1);
  if (v.look === 'lit') {
    archPath(ctx, s, 4.5);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffd23f';
    ctx.stroke();
  }
  if (burnt) {
    // charred inside, a few embers still glowing
    ctx.save();
    archPath(ctx, s, 0);
    ctx.clip();
    ctx.fillStyle = '#140d0b';
    ctx.fillRect(x - 1, y - 1, s.w + 2, s.h + 2);
    for (const [fx, fy, r] of [[0.3, 0.78, 0.07], [0.62, 0.86, 0.05], [0.5, 0.7, 0.04], [0.76, 0.74, 0.035]]) {
      const e = ctx.createRadialGradient(x + s.w * fx, y + s.h * fy, 0, x + s.w * fx, y + s.h * fy, s.w * r * 2.2);
      e.addColorStop(0, 'rgba(255,170,60,0.95)');
      e.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = e;
      ctx.fillRect(x, y, s.w, s.h);
    }
    ctx.restore();
  }
  if (v.look === 'boarded') {
    // (1.16, a Skeef floor) nailed shut: two weathered planks across the dark window, a nail at each end
    const plank = (x0, y0, x1, y1, w) => {
      const a = Math.atan2(y1 - y0, x1 - x0);
      const len = Math.hypot(x1 - x0, y1 - y0);
      ctx.save();
      ctx.translate((x0 + x1) / 2, (y0 + y1) / 2);
      ctx.rotate(a);
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetY = 1;
      const wood = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
      wood.addColorStop(0, '#c99a62');
      wood.addColorStop(0.5, '#a8743f');
      wood.addColorStop(1, '#7a4f26');
      ctx.fillStyle = wood;
      ctx.fillRect(-len / 2, -w / 2, len, w);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(60,35,15,0.5)';
      ctx.fillRect(-len / 2, -0.4, len, 0.8);
      ctx.fillStyle = '#3b3b44';
      for (const nx of [-len / 2 + w * 0.55, len / 2 - w * 0.55]) { ctx.beginPath(); ctx.arc(nx, 0, Math.max(0.8, w * 0.13), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    };
    const pw = Math.max(3.2, s.w * 0.26);
    plank(x - 2, y + s.h * 0.2, x + s.w + 2, y + s.h * 0.62, pw);
    plank(x - 2, y + s.h * 0.78, x + s.w + 2, y + s.h * 0.4, pw);
  }
}

// One window's picture, drawn once per look and size and kept (a canvas; the glow around a lit window and the sill below
// are inside it): a floor's picture is then a few drawImage calls instead of gradients and blurred shadows every time.
const spriteCache = new Map();
const SPRITE_MAX = 120;      // (each ~50-130 KB: a game uses far fewer)
function windowSprite(s, v, res) {
  const key = `${v.look}|${v.who || ''}|${v.tribe || ''}|${s.w}x${s.h}|${res}|${readyVersion}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const m = Math.ceil(s.h * 1.15) + 6;          // room for the glow, the frame's shadow and the sill
  const w = s.w + 2 * m;
  const h = s.h + 2 * m;
  c = document.createElement('canvas');
  c.width = Math.ceil(w * res);
  c.height = Math.ceil(h * res);
  const ctx = c.getContext('2d');
  ctx.setTransform(res, 0, 0, res, 0, 0);
  drawWindow(ctx, { x: w / 2, y: h / 2, w: s.w, h: s.h }, v);
  c.ox = w / 2;
  c.oy = h / 2;
  if (spriteCache.size >= SPRITE_MAX) spriteCache.delete(spriteCache.keys().next().value);
  spriteCache.set(key, c);
  return c;
}

/**
 * (1.16, Die Lewende Toring in the game) a block's windows drawn into its own canvas texture `key`, `res` times sharper
 * than the block (the faces stay crisp): made once, then painted over in place whenever a window changes (one texture
 * per block, freed with the block). `wins` = [{ look, who, tribe }] in slot order. Each window comes from its sprite.
 */
export function paintWindows(scene, key, g, wins, pad, res = 1) {
  const slots = windowSlots(g);
  let tex = scene.textures.exists(key) ? scene.textures.get(key) : null;
  if (!tex) tex = scene.textures.createCanvas(key, Math.ceil(g.texW * res), Math.ceil(g.texH * res));
  if (!tex) return null;
  const ctx = tex.getContext();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, tex.width, tex.height);
  slots.forEach((s, i) => {
    const v = wins[i];
    if (!v) return;
    const sp = windowSprite(s, v, res);
    ctx.drawImage(sp, Math.round((pad + s.x - sp.ox) * res), Math.round((pad + s.y - sp.oy) * res));
  });
  tex.refresh();
  return key;
}

// ---------------------------------------------------------------------------------------------- a block's windows
const overlayKeys = new Set();
/**
 * The windows' picture for block geometry `g` and windows `wins` ([{ look, who, tribe }] in slot order; missing = an empty
 * room for the owner, curtains for the other side). Cached by what it shows; returns the texture key.
 */
export function ensureWindows(scene, g, wins, pad) {
  const slots = windowSlots(g);
  const key = `win_${g.shape}_${g.scale}_${slots.length}_${wins.map((v) => `${v.look[0]}${v.who || ''}${v.tribe?.[0] || ''}`).join('.')}_${readyVersion}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, g.texW, g.texH);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(pad, pad);
  slots.forEach((s, i) => drawWindow(ctx, s, wins[i] || { look: 'room', tribe: 'vuur' }));
  ctx.restore();
  tex.refresh();
  overlayKeys.add(key);
  return key;
}
/** Redraw callbacks for windows drawn before the portraits were ready. */
export function whenPortraits(fn) {
  if (readyVersion) return;
  waiters.add(fn);
}

// ---------------------------------------------------------------------------------------------- parachutes
function chuteTexture(scene, tribe) {
  const key = `chute_${tribe}`;
  if (scene.textures.exists(key)) return key;
  const t = TRIBES[tribe] || TRIBES.vuur;
  const w = 64, h = 46;
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  // the canopy: four panels, alternating the tribe's colour and white, with a shine
  const cx = w / 2, cy = 30, rx = 29, ry = 26;
  for (let k = 0; k < 4; k++) {
    const a0 = Math.PI + (k * Math.PI) / 4, a1 = Math.PI + ((k + 1) * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, a0, a1);
    ctx.closePath();
    ctx.fillStyle = k % 2 ? '#ffffff' : t.chute;
    ctx.fill();
  }
  const sh = ctx.createLinearGradient(0, cy - ry, 0, cy);
  sh.addColorStop(0, 'rgba(255,255,255,0.35)');
  sh.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = sh;
  ctx.fill();
  // the scalloped hem and the lines
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(cx - rx + rx / 4 + (k * rx) / 2, cy, rx / 4, 3, 0, 0, Math.PI); ctx.fill(); }
  ctx.strokeStyle = 'rgba(30,30,50,0.7)';
  ctx.lineWidth = 1;
  for (const fx of [-0.95, -0.4, 0.4, 0.95]) { ctx.beginPath(); ctx.moveTo(cx + fx * rx, cy); ctx.lineTo(cx + fx * 6, h - 1); ctx.stroke(); }
  tex.refresh();
  return key;
}
/** (1.16) The round portrait badge of person `id` (a texture key; null until the portraits load). */
export const badgeKey = (scene, id) => portraitTexture(scene, id);
function portraitTexture(scene, id) {
  const key = `res_${id}`;
  if (scene.textures.exists(key)) return key;
  const p = portraits.get(id);
  if (!p) return null;
  // a round badge: the portrait in a white ring (readable while it floats down)
  const S = 64;
  const tex = scene.textures.createCanvas(key, S, S);
  const ctx = tex.getContext();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(S / 2, S * 0.35, 2, S / 2, S / 2, S / 2);
  const tr = TRIBES[CAST[id]?.tribe] || TRIBES.vuur;
  bg.addColorStop(0, tr.chuteL);
  bg.addColorStop(1, tr.chute);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.drawImage(p, 0, 2, S, S);
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  tex.refresh();
  return key;
}
/**
 * A resident jumps out of a window at world (x, y) and floats down to the water on a parachute (dir -1/1: which way the
 * wind takes them); `seaY` = the water line. Returns the container (destroyed when it lands).
 */
export function parachute(scene, x, y, who, { dir = 1, seaY = y + 400, delay = 0 } = {}) {
  const tribe = CAST[who]?.tribe || 'vuur';
  const chute = scene.add.image(0, -34, chuteTexture(scene, tribe)).setScale(0.05, 0.05);
  const pk = portraitTexture(scene, who);
  const face = pk ? scene.add.image(0, 0, pk).setScale(0.56) : scene.add.circle(0, 0, 15, 0xffd23f);
  const c = scene.add.container(x, y, [chute, face]).setDepth(DEPTH.fxWorld).setAlpha(0);
  const fall = Math.max(120, seaY - y);
  scene.tweens.add({ targets: c, alpha: 1, duration: 80, delay });
  // out of the window: a hop up and sideways
  scene.tweens.add({ targets: c, y: y - 36, x: x + dir * 22, duration: 280, delay, ease: 'Quad.easeOut' });
  // the canopy opens
  scene.tweens.add({ targets: chute, scaleX: 1.2, scaleY: 1.2, duration: 260, delay: delay + 220, ease: 'Back.easeOut' });
  // and floats down, swaying, to the water
  const t0 = { p: 0 };
  scene.tweens.add({
    targets: t0, p: 1, duration: 2600 + fall * 3, delay: delay + 300, ease: 'Sine.easeIn',
    onUpdate: () => {
      c.y = y - 36 + fall * t0.p + 36 * t0.p;
      c.x = x + dir * (22 + 60 * t0.p) + Math.sin(t0.p * 9) * 9;
      c.rotation = Math.sin(t0.p * 9 + 1) * 0.12;
    },
    onComplete: () => {
      scene.tweens.add({ targets: c, alpha: 0, scaleX: 0.6, scaleY: 0.6, duration: 260, onComplete: () => c.destroy() });
    },
  });
  return c;
}

// ---------------------------------------------------------------------------------------------- where a window is now
/** Window `i` of game block `b`, in world coordinates (the block may lean). */
export function windowWorld(b, i) {
  const s = windowSlots(b.geom)[i];
  const pos = b.body.position;
  if (!s) return { x: pos.x, y: pos.y };
  const dx = s.x - b.geom.cx;
  const dy = s.y - b.geom.cy;
  const a = b.body.angle;
  return { x: pos.x + dx * Math.cos(a) - dy * Math.sin(a), y: pos.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

// ---------------------------------------------------------------------------------------------- fire on a block
function flameTexture(scene) {
  const key = 'lt_flame';
  if (scene.textures.exists(key)) return key;
  const W = 56, H = 84;
  const tex = scene.textures.createCanvas(key, W, H);
  const ctx = tex.getContext();
  const tongue = (s, dx, col0, col1, col2) => {
    ctx.save();
    ctx.translate(W / 2 + dx, H - 4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-s * 0.75, -s * 0.25, -s * 0.5, -s * 1.15, 0, -s * 1.75);
    ctx.bezierCurveTo(s * 0.15, -s * 1.15, s * 0.72, -s * 0.95, s * 0.58, -s * 0.3);
    ctx.bezierCurveTo(s * 0.5, -s * 0.06, s * 0.28, 0, 0, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, -s * 1.75);
    g.addColorStop(0, col0);
    g.addColorStop(0.55, col1);
    g.addColorStop(1, col2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  };
  ctx.shadowColor = 'rgba(255,120,0,0.9)';
  ctx.shadowBlur = 10;
  tongue(42, 0, '#d8320f', '#ff7a1a', 'rgba(255,200,60,0.85)');
  ctx.shadowBlur = 0;
  tongue(28, 2, '#ff9a1f', '#ffc94a', 'rgba(255,240,170,0.9)');
  tongue(15, 3, '#fff1a8', '#fffbe0', 'rgba(255,255,255,0.8)');
  tex.refresh();
  return key;
}
/** A soft round puff (smoke, glow), white: tinted where it is used. */
function puffTexture(scene) {
  const key = 'lt_puff';
  if (scene.textures.exists(key)) return key;
  const S = 64;
  const tex = scene.textures.createCanvas(key, S, S);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  tex.refresh();
  return key;
}
/**
 * A fire mission on block `b`: tongues of flame along its top that flicker for `ms`, a hot glow, smoke rising and embers
 * flying, then the block stays scorched. Everything follows the block while it moves.
 */
export function burnBlock(scene, b, { ms = 1700 } = {}) {
  const key = flameTexture(scene);
  const puff = puffTexture(scene);
  const add = typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : null;
  const w = Math.max(40, b.right - b.left);
  const n = Math.max(3, Math.round(w / 26));
  const parts = [];
  const loops = [];   // the endless flickers, stopped when the fire goes out
  const glow = scene.add.image(0, 0, puff).setDepth(DEPTH.tower + 0.6).setTint(0xff7a1a).setAlpha(0).setScale((w * 2.2) / 64, 2.6);
  if (add) glow.setBlendMode(add);
  glow.lx = 0;
  glow.ly = -0.1;
  parts.push(glow);
  scene.tweens.add({ targets: glow, alpha: 0.75, duration: 220 });
  loops.push(scene.tweens.add({ targets: glow, alpha: 0.45, duration: 160, yoyo: true, repeat: -1, delay: 240 }));
  for (let k = 0; k < n; k++) {
    const f = scene.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(DEPTH.tower + 0.85).setScale(0.1);
    f.lx = -w / 2 + (k + 0.5) * (w / n);
    f.ly = k % 2 ? -0.5 : -0.42;
    parts.push(f);
    const big = 0.62 + ((k * 37) % 10) / 28;
    scene.tweens.add({ targets: f, scaleX: big, scaleY: big, duration: 260, delay: k * 45, ease: 'Back.easeOut' });
    loops.push(scene.tweens.add({ targets: f, scaleY: big * 1.3, scaleX: big * 0.92, duration: 110 + (k % 3) * 25, yoyo: true, repeat: -1, delay: 300 + k * 35, ease: 'Sine.easeInOut' }));
  }
  const follow = () => {
    if (b.destroyed) return;
    const a = b.body.angle;
    const c = b.body.position;
    const hh = (b.bottom - b.top) / 2;
    for (const f of parts) {
      f.x = c.x + f.lx * Math.cos(a) - f.ly * hh * 2 * Math.sin(a);
      f.y = c.y + f.lx * Math.sin(a) + f.ly * hh * 2 * Math.cos(a);
      if (f !== glow) f.rotation = a;
    }
  };
  follow();
  scene.events.on('update', follow);
  // smoke: grey puffs rising and spreading
  for (let k = 0; k < 7; k++) {
    scene.time.delayedCall(200 + k * 170, () => {
      if (b.destroyed) return;
      const sm = scene.add.image(b.centerX + (k % 2 ? 1 : -1) * (6 + k * 5), b.top, puff).setDepth(DEPTH.tower + 0.9).setTint(0x4a4a52).setAlpha(0.55).setScale(0.35);
      scene.tweens.add({ targets: sm, y: b.top - 90 - k * 12, x: sm.x + (k % 2 ? 18 : -18), scaleX: 1.4, scaleY: 1.4, alpha: 0, duration: 1500, ease: 'Sine.easeOut', onComplete: () => sm.destroy() });
    });
  }
  // embers
  for (let k = 0; k < 16; k++) {
    const e = scene.add.circle(b.centerX + (Math.random() - 0.5) * w, b.top + 4, 1.6 + Math.random() * 1.6, k % 3 ? 0xffb02e : 0xfff1a8).setDepth(DEPTH.tower + 0.95);
    if (add) e.setBlendMode(add);
    scene.tweens.add({ targets: e, y: e.y - 60 - Math.random() * 90, x: e.x + (Math.random() - 0.5) * 70, alpha: 0, duration: 900 + Math.random() * 900, delay: 150 + Math.random() * 900, ease: 'Quad.easeOut', onComplete: () => e.destroy() });
  }
  // the block chars as it burns
  scene.time.delayedCall(ms * 0.35, () => { if (!b.destroyed) b.image.setTint(0xb08060); });
  scene.time.delayedCall(ms * 0.7, () => { if (!b.destroyed) b.image.setTint(0x6e4a3e); });
  scene.time.delayedCall(ms, () => {
    for (const t of loops) t.stop();
    scene.tweens.add({
      targets: parts, alpha: 0, duration: 450,
      onComplete: () => { scene.events.off('update', follow); for (const f of parts) f.destroy(); },
    });
  });
  return parts;
}

/**
 * (1.16 redesign) A fire in one room at world (x, y), the room's opening `w` × `h`: flames fill the window and lick up the
 * wall above, a hot glow, smoke and embers; the fire burns for `ms`, then dies down. Nothing follows: the tower stands still.
 */
export function burnRoom(scene, x, y, { w = 74, h = 58, ms = 1500, delay = 0 } = {}) {
  const key = flameTexture(scene);
  const puff = puffTexture(scene);
  const add = typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : null;
  const parts = [];
  const loops = [];
  scene.time.delayedCall(delay, () => {
    const glow = scene.add.image(x, y, puff).setDepth(DEPTH.tower + 0.6).setTint(0xff7a1a).setAlpha(0).setScale((w * 2.4) / 64, (h * 2.6) / 64);
    if (add) glow.setBlendMode(add);
    parts.push(glow);
    scene.tweens.add({ targets: glow, alpha: 0.8, duration: 200 });
    loops.push(scene.tweens.add({ targets: glow, alpha: 0.5, duration: 150, yoyo: true, repeat: -1, delay: 220 }));
    const n = 3;
    for (let k = 0; k < n; k++) {
      const f = scene.add.image(x - w / 2 + (k + 0.5) * (w / n), y + h / 2 - 2, key).setOrigin(0.5, 1).setDepth(DEPTH.tower + 0.85).setScale(0.1);
      parts.push(f);
      const big = 0.7 + ((k * 37) % 10) / 30;
      scene.tweens.add({ targets: f, scaleX: big, scaleY: big * 1.1, duration: 240, delay: k * 50, ease: 'Back.easeOut' });
      loops.push(scene.tweens.add({ targets: f, scaleY: big * 1.45, scaleX: big * 0.9, duration: 110 + k * 30, yoyo: true, repeat: -1, delay: 280 + k * 30, ease: 'Sine.easeInOut' }));
    }
    for (let k = 0; k < 5; k++) {
      scene.time.delayedCall(160 + k * 190, () => {
        const sm = scene.add.image(x + (k % 2 ? 1 : -1) * (4 + k * 4), y - h / 2, puff).setDepth(DEPTH.tower + 0.9).setTint(0x3e3c44).setAlpha(0.55).setScale(0.35);
        scene.tweens.add({ targets: sm, y: sm.y - 80 - k * 10, x: sm.x + (k % 2 ? 16 : -16), scaleX: 1.3, scaleY: 1.3, alpha: 0, duration: 1400, ease: 'Sine.easeOut', onComplete: () => sm.destroy() });
      });
    }
    for (let k = 0; k < 10; k++) {
      const e = scene.add.circle(x + (Math.random() - 0.5) * w, y - h / 2 + 4, 1.4 + Math.random() * 1.6, k % 3 ? 0xffb02e : 0xfff1a8).setDepth(DEPTH.tower + 0.95);
      if (add) e.setBlendMode(add);
      scene.tweens.add({ targets: e, y: e.y - 50 - Math.random() * 70, x: e.x + (Math.random() - 0.5) * 50, alpha: 0, duration: 800 + Math.random() * 800, delay: 100 + Math.random() * 700, ease: 'Quad.easeOut', onComplete: () => e.destroy() });
    }
    scene.time.delayedCall(ms, () => {
      for (const t of loops) t.stop();
      scene.tweens.add({ targets: parts, alpha: 0, duration: 420, onComplete: () => { for (const f of parts) f.destroy(); } });
    });
  });
}

/** Draw the missions' pictures up front, so the first fire, wave or parachute doesn't stall a slow phone mid-mission. */
export function prepareFx(scene) {
  const keys = [flameTexture(scene), puffTexture(scene), millWheelTexture(scene), waveTexture(scene), jetTexture(scene), rugbyTexture(scene)];
  for (const t of Object.keys(TRIBES)) keys.push(chuteTexture(scene, t));
  // draw each once, too small and faint to see, with a circle and an ellipse: the phone readies them now
  const warm = keys.map((k) => scene.add.image(2, 2, k).setScale(0.02).setAlpha(0.01).setScrollFactor(0));
  warm.push(scene.add.circle(2, 2, 1, 0xffffff, 0.01).setScrollFactor(0), scene.add.ellipse(2, 2, 2, 1, 0xffffff, 0.01).setScrollFactor(0));
  const g = scene.add.graphics().setScrollFactor(0).setAlpha(0.01);
  g.fillStyle(0xffffff, 1).fillPoints([{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 3 }], true).lineStyle(1, 0xffffff, 1).lineBetween(1, 1, 3, 3);
  warm.push(g);
  scene.time.delayedCall(120, () => { for (const o of warm) o.destroy(); });
}

// ---------------------------------------------------------------------------------------------- for the screens (DOM)
const dataUrls = new Map();
/** A round portrait (the tribe's colour behind, a white ring) as a data URL for the menus; '' until the portraits load. */
export function portraitDataUrl(id, size = 96) {
  const key = `${id}@${size}`;
  if (dataUrls.has(key)) return dataUrls.get(key);
  const p = portraits.get(id);
  if (!p || typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const tr = TRIBES[CAST[id]?.tribe] || { chute: '#6b7896', chuteL: '#d7def0' };
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(size / 2, size * 0.35, 2, size / 2, size / 2, size / 2);
  bg.addColorStop(0, tr.chuteL);
  bg.addColorStop(1, tr.chute);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.drawImage(p, 0, size * 0.04, size, size);
  ctx.restore();
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  const url = c.toDataURL('image/png');
  dataUrls.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------------------------- more missions' effects
/** A resident falls from a window into the sea and swims off-screen (the water wheel's wash). */
export function swimAway(scene, x, y, who, { dir = 1, seaY = y + 300, delay = 0 } = {}) {
  const pk = portraitTexture(scene, who);
  const face = pk ? scene.add.image(x, y, pk).setScale(0.5) : scene.add.circle(x, y, 14, 0x5ab8ff);
  face.setDepth(DEPTH.fxWorld).setAlpha(0);
  scene.tweens.add({ targets: face, alpha: 1, duration: 60, delay });
  scene.tweens.add({ targets: face, y: seaY + 6, x: x + dir * 30, duration: 520, delay, ease: 'Quad.easeIn' });
  const t = { p: 0 };
  scene.tweens.add({
    targets: t, p: 1, duration: 2200, delay: delay + 520, ease: 'Sine.easeIn',
    onUpdate: () => { face.x = x + dir * (30 + 420 * t.p); face.y = seaY + 6 + Math.sin(t.p * 22) * 4; face.rotation = Math.sin(t.p * 22) * 0.15; },
    onComplete: () => face.destroy(),
  });
  return face;
}
/**
 * A wooden mill wheel seen from the side: a band of twenty paddle boards held between two rims (the boards stand a
 * little proud of the outer rim), eight spokes and an iron hub, water clinging to the boards.
 */
function millWheelTexture(scene) {
  const key = 'lt_millwheel';
  if (scene.textures.exists(key)) return key;
  const S = 192;
  const c = S / 2;
  const tex = scene.textures.createCanvas(key, S, S);
  const ctx = tex.getContext();
  const RO = 74;   // the outer rim
  const RI = 54;   // the inner rim
  // the spokes
  for (let k = 0; k < 8; k++) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((k * Math.PI) / 4);
    rr(ctx, -3.5, -RI, 7, RI - 10, 2);
    ctx.fillStyle = '#7c4a1f';
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = '#3a200b';
    ctx.stroke();
    ctx.restore();
  }
  // sixteen paddles: a slat between the rims and a wide board standing out past the outer rim
  for (let k = 0; k < 16; k++) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((k * Math.PI * 2) / 16);
    rr(ctx, -2.6, -RO, 5.2, RO - RI + 2, 1.2);
    ctx.fillStyle = '#80501f';
    ctx.fill();
    rr(ctx, -9, -(RO + 15), 18, 17, 2.5);
    const board = ctx.createLinearGradient(-9, 0, 9, 0);
    board.addColorStop(0, '#d29457');
    board.addColorStop(1, '#7f4e1f');
    ctx.fillStyle = board;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#3a200b';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(58,32,11,0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-9, -(RO + 7));
    ctx.lineTo(9, -(RO + 7));
    ctx.stroke();
    // water held on the board
    ctx.fillStyle = 'rgba(190,238,255,0.9)';
    rr(ctx, -9, -(RO + 15), 18, 5, 2.5);
    ctx.fill();
    ctx.restore();
  }
  // the two rims over the boards
  for (const [r, w] of [[RO, 8], [RI, 7]]) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.lineWidth = w;
    ctx.strokeStyle = '#8a5527';
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#3a200b';
    for (const e of [w / 2, -w / 2]) { ctx.beginPath(); ctx.arc(c, c, r + e, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath();
    ctx.arc(c, c, r, Math.PI * 1.08, Math.PI * 1.6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,224,176,0.6)';
    ctx.stroke();
  }
  // the iron hub with its bolts
  const hub = ctx.createRadialGradient(c - 4, c - 5, 2, c, c, 15);
  hub.addColorStop(0, '#aab3c4');
  hub.addColorStop(1, '#262a33');
  ctx.beginPath();
  ctx.arc(c, c, 14, 0, Math.PI * 2);
  ctx.fillStyle = hub;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#15181e';
  ctx.stroke();
  ctx.fillStyle = '#e3e8f2';
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * 8, c + Math.sin(a) * 8, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.refresh();
  return key;
}
/** A breaking wave rolling to the right: a long swell, a curling crest with foam on its lip, fading out behind. */
function waveTexture(scene) {
  const key = 'lt_wave';
  if (scene.textures.exists(key)) return key;
  const W = 360;
  const H = 200;
  const tex = scene.textures.createCanvas(key, W, H);
  const ctx = tex.getContext();
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H * 0.64);
    ctx.bezierCurveTo(W * 0.25, H * 0.58, W * 0.45, H * 0.52, W * 0.62, H * 0.33);
    ctx.bezierCurveTo(W * 0.7, H * 0.18, W * 0.78, H * 0.06, W * 0.88, H * 0.07);
    ctx.bezierCurveTo(W * 0.97, H * 0.08, W * 1.0, H * 0.21, W * 0.95, H * 0.34);
    ctx.bezierCurveTo(W * 0.92, H * 0.41, W * 0.86, H * 0.37, W * 0.875, H * 0.29);
    ctx.bezierCurveTo(W * 0.82, H * 0.37, W * 0.84, H * 0.62, W * 0.93, H * 0.8);
    ctx.lineTo(W * 0.985, H);
    ctx.closePath();
  };
  shape();
  const body = ctx.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, '#d2f6ff');
  body.addColorStop(0.22, '#63cdff');
  body.addColorStop(0.62, '#1f86df');
  body.addColorStop(1, '#0b4f98');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  shape();
  ctx.clip();
  // the barrel under the curl, and light streaks along the swell
  const barrel = ctx.createRadialGradient(W * 0.9, H * 0.46, 2, W * 0.9, H * 0.46, H * 0.3);
  barrel.addColorStop(0, 'rgba(3,30,80,0.55)');
  barrel.addColorStop(1, 'rgba(3,30,80,0)');
  ctx.fillStyle = barrel;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineCap = 'round';
  for (const [dy, lw] of [[14, 2.5], [34, 1.6], [58, 1.2]]) {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(W * 0.05, H * 0.64 + dy);
    ctx.bezierCurveTo(W * 0.3, H * 0.58 + dy, W * 0.5, H * 0.5 + dy, W * 0.7, H * 0.3 + dy * 1.2);
    ctx.stroke();
  }
  ctx.restore();
  // foam on the lip
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(255,255,255,0.95)';
  ctx.shadowBlur = 9;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(W * 0.64, H * 0.29);
  ctx.bezierCurveTo(W * 0.71, H * 0.15, W * 0.79, H * 0.065, W * 0.88, H * 0.075);
  ctx.bezierCurveTo(W * 0.96, H * 0.09, W * 0.99, H * 0.2, W * 0.948, H * 0.33);
  ctx.stroke();
  ctx.restore();
  let seed = 11;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 46; k++) {
    // bubbles along the lip and in a band at the foot of the wave
    const u = rnd();
    const lip = k < 30;
    const bx = lip ? W * (0.66 + 0.31 * u) : W * (0.5 + 0.48 * u);
    const by = lip ? H * (0.09 + 0.24 * Math.abs(u - 0.75) * 2.2) + (rnd() - 0.5) * 12 : H * (0.66 + rnd() * 0.12);
    ctx.globalAlpha = 0.55 + rnd() * 0.45;
    ctx.beginPath();
    ctx.arc(bx, by, 1.4 + rnd() * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // fade the long tail away
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, 0, W, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.42, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  const under = ctx.createLinearGradient(0, 0, 0, H);
  under.addColorStop(0, 'rgba(0,0,0,1)');
  under.addColorStop(0.68, 'rgba(0,0,0,1)');
  under.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = under;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  tex.refresh();
  return key;
}
/** A jet of sea water (tiles upward): light in the middle, darker at the sides, streaks of foam. */
function jetTexture(scene) {
  const key = 'lt_jet';
  if (scene.textures.exists(key)) return key;
  const W = 48;
  const H = 128;
  const tex = scene.textures.createCanvas(key, W, H);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(20,110,200,0)');
  g.addColorStop(0.18, 'rgba(40,140,225,0.9)');
  g.addColorStop(0.5, 'rgba(170,232,255,0.95)');
  g.addColorStop(0.82, 'rgba(40,140,225,0.9)');
  g.addColorStop(1, 'rgba(20,110,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const [x, y, h] of [[14, 10, 34], [30, 52, 28], [22, 92, 30], [36, 4, 18], [11, 70, 22]]) {
    ctx.beginPath();
    ctx.ellipse(x, y + h / 2, 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.refresh();
  return key;
}
/** A drop of water from (x, y) with speed (vx, vy) px/s, falling for `life` ms. */
function drop(scene, x, y, vx, vy, life, r, color) {
  const d = scene.add.circle(x, y, r, color).setDepth(DEPTH.fxWorld);
  const o = { t: 0 };
  scene.tweens.add({
    targets: o, t: 1, duration: life,
    onUpdate: () => { const s = (o.t * life) / 1000; d.x = x + vx * s; d.y = y + vy * s + 900 * s * s; d.alpha = 1 - o.t * o.t; },
    onComplete: () => d.destroy(),
  });
}
/**
 * The water wheel: a wooden mill wheel rises beside the target tower at the floors it washes (world y0..y1) and turns,
 * water streaming off its paddles; a breaking wave rolls from it across those floors and on past the tower, spray off its
 * crest and a burst of mist where it hits; then the water runs off down to the sea. `side` -1 = the wheel stands left
 * of the tower, 1 = right; `onHit` is called once as the wave reaches the tower. Resolves when the water has gone.
 */
export function waterWheel(scene, towerX, y0, y1, { side = -1, width = 220, ms = 1500, seaY = null, onHit = null } = {}) {
  const wheelKey = millWheelTexture(scene);
  const waveKey = waveTexture(scene);
  const puff = puffTexture(scene);
  const h = Math.max(60, y1 - y0);
  const cy = (y0 + y1) / 2;
  const ws = Math.max(0.55, Math.min(1.05, (h + 50) / 192));
  const wx = towerX + side * (width / 2 + 30 + 80 * ws);
  const dir = -side;   // the way the wave rolls
  const wheel = scene.add.image(wx, cy + 60, wheelKey).setDepth(DEPTH.tower + 1).setScale(ws * 0.3).setAlpha(0);
  // a jet of sea water climbs to the wheel and keeps it turning
  let jet = null;
  if (seaY != null && seaY - cy > 100 * ws) {
    const jh = seaY - (cy + 62 * ws);
    jet = scene.add.tileSprite(wx, seaY + 4, 34 * ws + 10, jh, jetTexture(scene)).setOrigin(0.5, 1).setDepth(DEPTH.tower + 0.95).setScale(1, 0.01);
    scene.tweens.add({ targets: jet, scaleY: 1, duration: 300, ease: 'Quad.easeOut' });
    const flow = () => { if (jet.active) jet.tilePositionY += 9; };
    scene.events.on('update', flow);
    jet.once('destroy', () => scene.events.off('update', flow));
    for (let k = 0; k < 8; k++) drop(scene, wx + (Math.random() - 0.5) * 30, seaY, (Math.random() - 0.5) * 120, -(140 + Math.random() * 120), 600, 2 + Math.random() * 2, 0xdff6ff);
  }
  scene.tweens.add({ targets: wheel, y: cy, scale: ws, alpha: 1, duration: 340, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: wheel, angle: dir * 560, duration: ms + 700, ease: 'Sine.easeInOut' });
  const stream = scene.time.addEvent({
    delay: 55, repeat: Math.round((ms + 500) / 55),
    callback: () => {
      const a = Math.random() * Math.PI * 2;
      const r = 90 * ws;
      drop(scene, wx + Math.cos(a) * r, wheel.y + Math.abs(Math.sin(a)) * r * 0.9, dir * (20 + Math.random() * 50), -40 + Math.random() * 60, 650, 1.6 + Math.random() * 1.6, Math.random() < 0.5 ? 0xdff6ff : 0x7fd4ff);
    },
  });
  const waveW = Math.max(240, width * 1.35);
  const sy = (h * 1.4) / 200;
  const wave = scene.add.image(wx, cy, waveKey).setDepth(DEPTH.tower + 0.9).setOrigin(0.9, 0.56).setAlpha(0).setScale((dir * waveW) / 360, sy * 0.6);
  const xa = wx + dir * 24;
  const xb = towerX + dir * (width / 2 + 120);
  const t = { p: 0 };
  let misted = false;
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: t, p: 1, duration: ms, delay: 260, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const p = t.p;
        wave.x = xa + (xb - xa) * p;
        wave.y = cy + Math.sin(p * Math.PI * 3) * 4;
        wave.setScale((dir * waveW) / 360, sy * (0.6 + 0.4 * Math.min(1, p * 3)) * (1 + 0.08 * Math.sin(p * Math.PI)));
        wave.alpha = p < 0.12 ? p / 0.12 : p > 0.78 ? Math.max(0, (1 - p) / 0.22) : 1;
        // spray off the crest
        if (p < 0.85 && Math.random() < 0.7) {
          drop(scene, wave.x + dir * (Math.random() * 10), cy - h * 0.62 + Math.random() * h * 0.3, dir * (60 + Math.random() * 120), -(120 + Math.random() * 160), 700, 1.5 + Math.random() * 2.2, Math.random() < 0.6 ? 0xffffff : 0xa8e6ff);
        }
        // a burst of mist where it hits the tower
        if (!misted && dir * (wave.x - (towerX - dir * width / 2)) > -30) {
          misted = true;
          onHit?.();
          for (let k = 0; k < 5; k++) {
            const m = scene.add.image(towerX - dir * width * 0.4, y0 + (h * (k + 0.5)) / 5, puff).setDepth(DEPTH.fxWorld).setTint(0xe8f8ff).setAlpha(0.7).setScale(0.6);
            scene.tweens.add({ targets: m, x: m.x + dir * (30 + k * 8), y: m.y - 20 - k * 6, scale: 1.8, alpha: 0, duration: 700, ease: 'Sine.easeOut', onComplete: () => m.destroy() });
          }
        }
      },
      onComplete: () => {
        wave.destroy();
        if (!misted) { misted = true; onHit?.(); }
        // the water runs off the washed floors down to the sea
        if (seaY != null) {
          for (let k = 0; k < 14; k++) {
            drop(scene, towerX + (Math.random() - 0.5) * width, y1 + Math.random() * 6, (Math.random() - 0.5) * 30, 40 + Math.random() * 60, Math.min(1400, 300 + Math.sqrt(Math.max(0, seaY - y1)) * 30), 1.8 + Math.random() * 2, 0x9fdcff);
          }
        }
        if (jet) scene.tweens.add({ targets: jet, scaleY: 0, alpha: 0, duration: 380, delay: 80, ease: 'Sine.easeIn', onComplete: () => jet.destroy() });
        scene.tweens.add({
          targets: wheel, alpha: 0, y: wheel.y + 50, scale: ws * 0.6, duration: 320, delay: 120, ease: 'Sine.easeIn',
          onComplete: () => { stream.remove(); wheel.destroy(); resolve(); },
        });
      },
    });
  });
}
// the vines: a leaf, a small flower, the tip's curl (drawn into a Graphics each frame while they grow)
function leaf(g, x, y, ang, L, W) {
  if (L < 1.5) return;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const P = (u, w) => ({ x: x + ca * u * L - sa * w, y: y + sa * u * L + ca * w });
  const edge = [];
  for (let k = 0; k <= 10; k++) { const u = k / 10; edge.push([u, Math.sin(Math.PI * u) * W * (1 - u * 0.35)]); }
  const top = edge.map(([u, w]) => P(u, w));
  const bottom = edge.slice().reverse().map(([u, w]) => P(u, -w));
  g.fillStyle(0x2f8a2a, 1);
  g.fillPoints([...top, ...bottom], true);
  g.fillStyle(0x6fd35a, 1);
  g.fillPoints([...top, ...edge.slice().reverse().map(([u]) => P(u, 0))], true);
  g.lineStyle(1, 0x184a16, 0.9);
  g.strokePoints([...top, ...bottom], true);
  const tip = P(0.88, 0);
  g.lineStyle(0.9, 0x1d5a1c, 0.8);
  g.lineBetween(x, y, tip.x, tip.y);
}
function flower(g, x, y, r, petal) {
  if (r < 0.6) return;
  g.fillStyle(petal, 1);
  for (let k = 0; k < 5; k++) {
    const a = (k * Math.PI * 2) / 5 - Math.PI / 2;
    g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.78);
  }
  g.fillStyle(0xffc21f, 1);
  g.fillCircle(x, y, r * 0.58);
}
function curl(g, x, y, r, w = 2.4) {
  g.lineStyle(w, 0x3f9a35, 1);
  g.beginPath();
  for (let k = 0; k <= 26; k++) {
    const a = k * 0.34;
    const q = r * (1 - k / 32);
    const px = x + Math.cos(a) * q;
    const py = y + Math.sin(a) * q;
    if (!k) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.strokePath();
}
/**
 * Vines grow from the base up to world point (x, y) (the grass tribe's grab): a tapered stem swaying as it climbs,
 * leaves that unfold behind the tip, small curls and a flower or two; the tip curls round the window. Resolves when it
 * arrives; then it pulls back down and fades.
 */
export function vinesTo(scene, x, baseY, y, { ms = 700, hold = 420 } = {}) {
  const g = scene.add.graphics().setDepth(DEPTH.tower + 1);
  const len = Math.max(24, baseY - y);
  const sway = Math.min(13, 5 + len * 0.025);
  const path = [];
  for (let d = 0; d <= len; d += 4) path.push({ x: x + Math.sin(d * 0.045 + 0.6) * sway * Math.min(1, d / 40), y: baseY - d });
  const leaves = [];
  for (let d = 16, k = 0; d < len - 8; d += 18, k++) leaves.push({ i: Math.round(d / 4), side: k % 2 ? 1 : -1, size: 8.5 + (k % 3) * 1.8 });
  const curls = [];
  for (let d = 44; d < len - 20; d += 58) curls.push(Math.round(d / 4));
  const flowers = (len > 130 ? [0.42, 0.78] : [0.6]).map((f, k) => ({ i: Math.round((len * f) / 4), petal: k % 2 ? 0xffb6d5 : 0xffffff }));
  const t = { p: 0, back: 0 };
  const draw = () => {
    g.clear();
    const n = Math.max(2, Math.round(path.length * t.p * (1 - t.back)));
    const pts = path.slice(0, n);
    // the stem: a dark edge, the green body and a light side; thick at the root, thin at the tip
    const segs = 6;
    for (const [col, k0, dx] of [[0x184a16, 3, 0], [0x3f9a35, 0, 0], [0x9be37c, -1, -1.4]]) {
      for (let k = 0; k < segs; k++) {
        const a = Math.floor((k * (pts.length - 1)) / segs);
        const b = Math.floor(((k + 1) * (pts.length - 1)) / segs);
        if (b <= a) continue;
        const base = 11 - (7.5 * k) / segs;
        g.lineStyle(k0 < 0 ? base * 0.28 : base + k0, col, 1);
        g.beginPath();
        g.moveTo(pts[a].x + dx, pts[a].y);
        for (let i = a + 1; i <= b; i++) g.lineTo(pts[i].x + dx, pts[i].y);
        g.strokePath();
      }
    }
    for (const c of curls) {
      if (c >= n - 3) continue;
      const p = pts[c];
      const s = c % 2 ? 1 : -1;
      curl(g, p.x + s * 7, p.y - 3, Math.min(5.5, (n - c) * 0.7), 1.6);
    }
    for (const L of leaves) {
      if (L.i >= n) continue;
      const grow = Math.min(1, (n - L.i) / 7);
      const p = pts[L.i];
      const q = pts[Math.min(pts.length - 1, L.i + 1)];
      leaf(g, p.x, p.y, Math.atan2(q.y - p.y, q.x - p.x) + L.side * 1.05, L.size * 1.7 * grow, L.size * 0.72 * grow);
    }
    for (const f of flowers) {
      if (f.i >= n) continue;
      const p = pts[f.i];
      flower(g, p.x + (f.i % 2 ? 8 : -8), p.y, 5.6 * Math.min(1, (n - f.i) / 9), f.petal);
    }
    if (t.p >= 1 && !t.back) curl(g, pts[pts.length - 1].x, pts[pts.length - 1].y, 11, 3);
  };
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: t, p: 1, duration: ms, ease: 'Sine.easeOut', onUpdate: draw,
      onComplete: () => {
        draw();
        // the grab: a few leaf bits burst off the tip
        const tip = path[path.length - 1];
        for (let k = 0; k < 7; k++) {
          const bit = scene.add.ellipse(tip.x, tip.y, 7, 3.5, k % 2 ? 0x6fd35a : 0x3f9a35).setDepth(DEPTH.fxWorld).setRotation(Math.random() * 3);
          const a = (k / 7) * Math.PI * 2;
          scene.tweens.add({ targets: bit, x: tip.x + Math.cos(a) * 34, y: tip.y + Math.sin(a) * 26 + 14, rotation: bit.rotation + 3, alpha: 0, duration: 620, ease: 'Quad.easeOut', onComplete: () => bit.destroy() });
        }
        resolve();
        scene.tweens.add({
          targets: t, back: 1, duration: 420, delay: hold, ease: 'Sine.easeIn', onUpdate: () => { g.alpha = 1 - t.back * 0.7; draw(); },
          onComplete: () => g.destroy(),
        });
      },
    });
  });
}
function rugbyTexture(scene) {
  const key = 'lt_rugby';
  if (scene.textures.exists(key)) return key;
  const W = 46, H = 30;
  const tex = scene.textures.createCanvas(key, W, H);
  const ctx = tex.getContext();
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, W / 2 - 2, H / 2 - 2, 0, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#c8743c');
  g.addColorStop(1, '#7a3b16');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#4a2008';
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(W * 0.32, H / 2);
  ctx.lineTo(W * 0.68, H / 2);
  for (const k of [0.38, 0.46, 0.54, 0.62]) { ctx.moveTo(W * k, H / 2 - 4); ctx.lineTo(W * k, H / 2 + 4); }
  ctx.stroke();
  tex.refresh();
  return key;
}
/** A thrown ball from world (x0, y0) to (x1, y1) in an arc: 'rugby' or 'fire'. Resolves when it hits. */
export function throwBall(scene, x0, y0, x1, y1, { kind = 'rugby', ms = 620, arc = 110 } = {}) {
  const ball = kind === 'fire'
    ? scene.add.image(x0, y0, flameTexture(scene)).setScale(0.55).setDepth(DEPTH.fxWorld)
    : scene.add.image(x0, y0, rugbyTexture(scene)).setDepth(DEPTH.fxWorld);
  const t = { p: 0 };
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: t, p: 1, duration: ms, ease: 'Sine.easeIn',
      onUpdate: () => {
        ball.x = x0 + (x1 - x0) * t.p;
        ball.y = y0 + (y1 - y0) * t.p - Math.sin(Math.PI * t.p) * arc;
        ball.rotation = kind === 'fire' ? Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2 : t.p * 12;
      },
      onComplete: () => { ball.destroy(); resolve(); },
    });
  });
}
