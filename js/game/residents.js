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
const PORTRAIT = 96;          // px of the cached portrait canvas (drawn smaller into windows; sharp at 2-3x)
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
  // the frame: cream wood with a soft shadow, sunk a little into the block
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1.2;
  archPath(ctx, s, 2.6);
  const fr = ctx.createLinearGradient(0, y - 3, 0, y + s.h + 3);
  fr.addColorStop(0, '#fffaf0');
  fr.addColorStop(1, '#d9c39a');
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
  if (v.look === 'curtain' || v.look === 'open') {
    // two curtains of the tribe's cloth, tied back (or pulled right aside when the room is known to be empty),
    // under a scalloped valance; every curtained window looks the same
    const tie = v.look === 'open' ? 0.08 : 0.3;
    for (const side of [-1, 1]) {
      const ox = side < 0 ? x : x + s.w;
      const inner = s.x - side * 0.4;
      ctx.beginPath();
      ctx.moveTo(ox, y - 1);
      ctx.lineTo(v.look === 'open' ? ox - side * s.w * 0.22 : inner, y - 1);
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
    // the valance
    const vh = s.h * 0.2;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 1);
    ctx.lineTo(x + s.w + 1, y - 1);
    ctx.lineTo(x + s.w + 1, y + vh);
    const sc = 3;
    for (let k = sc; k > 0; k--) ctx.quadraticCurveTo(x + s.w * (k - 0.5) / sc, y + vh * 1.7, x + s.w * (k - 1) / sc, y + vh);
    ctx.closePath();
    ctx.fillStyle = t.clothD;
    ctx.fill();
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
function wheelTexture(scene) {
  const key = 'lt_wheel';
  if (scene.textures.exists(key)) return key;
  const S = 120;
  const tex = scene.textures.createCanvas(key, S, S);
  const ctx = tex.getContext();
  const c = S / 2;
  ctx.lineCap = 'round';
  // paddles
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI * 2) / 10;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(-5, -c + 2, 10, 26);
    ctx.fillStyle = '#5ab8ff';
    ctx.fillRect(-5, -c + 2, 10, 7);
    ctx.restore();
  }
  // rim and spokes
  ctx.strokeStyle = '#6b4220';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(c, c, c - 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  for (let k = 0; k < 5; k++) {
    const a = (k * Math.PI) / 5;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (c - 24), c + Math.sin(a) * (c - 24));
    ctx.lineTo(c - Math.cos(a) * (c - 24), c - Math.sin(a) * (c - 24));
    ctx.stroke();
  }
  ctx.fillStyle = '#3d2410';
  ctx.beginPath();
  ctx.arc(c, c, 10, 0, Math.PI * 2);
  ctx.fill();
  tex.refresh();
  return key;
}
/**
 * The water wheel: it rises beside the target tower at the floors it washes (world y0..y1), turns, and a sheet of water
 * pours across those floors. `side` -1 = the wheel stands left of the tower, 1 = right. Resolves when the water has gone.
 */
export function waterWheel(scene, towerX, y0, y1, { side = -1, width = 220, ms = 1500 } = {}) {
  const key = wheelTexture(scene);
  const cy = (y0 + y1) / 2;
  const wx = towerX + side * (width / 2 + 70);
  const wheel = scene.add.image(wx, cy, key).setDepth(DEPTH.tower + 1).setScale(0.1).setAlpha(0);
  scene.tweens.add({ targets: wheel, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: wheel, angle: side * -720, duration: ms + 300, ease: 'Sine.easeInOut' });
  const sheet = scene.add.graphics().setDepth(DEPTH.tower + 0.9);
  const t = { p: 0 };
  const draw = () => {
    sheet.clear();
    if (t.p <= 0) return;
    const reach = Math.min(1, t.p * 1.6);
    const fade = t.p > 0.8 ? (1 - t.p) / 0.2 : 1;
    const xa = side < 0 ? wx : towerX - width / 2 - 20;
    const xb = side < 0 ? towerX + width / 2 + 20 : wx;
    const x0 = side < 0 ? xa : xb - (xb - xa) * reach;
    const x1 = side < 0 ? xa + (xb - xa) * reach : xb;
    sheet.fillStyle(0x6fd0ff, 0.55 * fade);
    sheet.fillRect(x0, y0, x1 - x0, y1 - y0);
    sheet.lineStyle(2.5, 0xffffff, 0.8 * fade);
    for (let yy = y0 + 8; yy < y1 - 4; yy += 14) {
      sheet.beginPath();
      for (let xx = x0; xx <= x1; xx += 12) {
        const yv = yy + Math.sin(xx * 0.08 + t.p * 30) * 3;
        if (xx === x0) sheet.moveTo(xx, yv);
        else sheet.lineTo(xx, yv);
      }
      sheet.strokePath();
    }
  };
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: t, p: 1, duration: ms, delay: 320, onUpdate: draw,
      onComplete: () => {
        sheet.destroy();
        scene.tweens.add({ targets: wheel, alpha: 0, scale: 0.6, duration: 260, onComplete: () => { wheel.destroy(); resolve(); } });
      },
    });
  });
}
/** Vines grow up from the base to world point (x, y) (the grass tribe's grab). Resolves when they arrive. */
export function vinesTo(scene, x, baseY, y, { ms = 700 } = {}) {
  const g = scene.add.graphics().setDepth(DEPTH.tower + 1);
  const t = { p: 0 };
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: t, p: 1, duration: ms, ease: 'Sine.easeOut',
      onUpdate: () => {
        g.clear();
        const top = baseY + (y - baseY) * t.p;
        g.lineStyle(5, 0x2f8f2c, 1);
        g.beginPath();
        g.moveTo(x, baseY);
        for (let yy = baseY; yy >= top; yy -= 6) g.lineTo(x + Math.sin(yy * 0.09) * 9, yy);
        g.strokePath();
        g.fillStyle(0x4fcf45, 1);
        for (let yy = baseY - 12; yy >= top; yy -= 20) g.fillEllipse(x + Math.sin(yy * 0.09) * 9 + (yy % 40 ? 9 : -9), yy, 14, 7);
      },
      onComplete: () => {
        scene.tweens.add({ targets: g, alpha: 0, duration: 600, delay: 500, onComplete: () => g.destroy() });
        resolve();
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
