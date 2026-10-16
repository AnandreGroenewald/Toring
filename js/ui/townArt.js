// (1.16) Jou dorp's picture: a little skyline at dusk, painted once into an image (a sheet never holds a live canvas:
// the 1.15.2 rule). The town grows with its people: more and taller buildings, and a lit window for every person (as
// many as fit); its walls stand in front, one stone section each; the tribe colours the sky and flies on the tallest
// roof. The same town (id) always has the same buildings; only the light and the walls change.

import { createRng } from '../core/rng.js';

const SKY = {
  vuur: ['#1d0b2b', '#5b1f45', '#c8553d', '#f6a04d'],
  water: ['#050f26', '#0f2f5c', '#1f6a96', '#63c3d8'],
  gras: ['#07161d', '#163f3f', '#3f7f52', '#b7d96b'],
};
const WALLS = { vuur: '#8a5a44', water: '#5a6f8a', gras: '#6f7f52' };
const FLAG = { vuur: '#ff6b2c', water: '#3fb6ff', gras: '#6fd46a' };
const BODY = ['#2b2440', '#33294a', '#2a3352', '#3a2f4f', '#243049', '#2f3a55'];

const cache = new Map();

/** How many buildings and how tall the town stands for `people`. */
function shapeFor(people) {
  const p = Math.max(0, people | 0);
  const n = Math.max(3, Math.min(12, 3 + Math.floor(Math.log2(1 + p / 8))));
  const tall = Math.min(1, 0.42 + Math.sqrt(p) / 45);   // 0.42 (a few houses) .. 1 (a city)
  return { n, tall };
}

/**
 * A data URL of the town: { id, people, tribe, walls, w, h } (CSS pixels; drawn at 2x). '' without a canvas.
 */
export function townPicture({ id = 'TOWN', people = 0, tribe = 'vuur', walls = 0, w = 360, h = 170 } = {}) {
  const lit = Math.max(0, people | 0);
  const key = `${id}|${Math.min(lit, 999)}|${tribe}|${walls}|${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const doc = globalThis.document;
  if (!doc) return '';
  const S = 2;
  const cv = doc.createElement('canvas');
  cv.width = w * S;
  cv.height = h * S;
  const g = cv.getContext('2d');
  if (!g) return '';
  g.scale(S, S);
  const rng = createRng(`dorp/${id}`);
  const sky = SKY[tribe] || SKY.vuur;

  // the sky, a few stars and the moon
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, sky[0]);
  grad.addColorStop(0.45, sky[1]);
  grad.addColorStop(0.8, sky[2]);
  grad.addColorStop(1, sky[3]);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 26; k++) {
    g.globalAlpha = 0.35 + rng.next() * 0.6;
    g.fillStyle = '#fff6d8';
    const r = rng.next() < 0.15 ? 1.4 : 0.8;
    g.beginPath();
    g.arc(rng.next() * w, rng.next() * h * 0.45, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const mx = w * (0.12 + rng.next() * 0.2);
  const my = h * 0.2;
  const glow = g.createRadialGradient(mx, my, 2, mx, my, 34);
  glow.addColorStop(0, 'rgba(255,240,200,0.55)');
  glow.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = glow;
  g.fillRect(mx - 40, my - 40, 80, 80);
  g.fillStyle = '#fff3cf';
  g.beginPath();
  g.arc(mx, my, 11, 0, Math.PI * 2);
  g.fill();

  // far hills
  const ground = h - 22;
  g.fillStyle = 'rgba(10,12,30,0.35)';
  g.beginPath();
  g.moveTo(0, ground);
  for (let x = 0; x <= w; x += 24) g.lineTo(x, ground - 18 - Math.sin(x / 47 + rng.next()) * 10 - rng.next() * 6);
  g.lineTo(w, ground);
  g.closePath();
  g.fill();

  // a warm glow along the horizon, then the far side of town: dark shapes with a light here and there
  const { n, tall } = shapeFor(lit);
  const haze = g.createLinearGradient(0, ground - 70, 0, ground);
  haze.addColorStop(0, 'rgba(255,190,120,0)');
  haze.addColorStop(1, 'rgba(255,190,120,0.22)');
  g.fillStyle = haze;
  g.fillRect(0, ground - 70, w, 70);
  const farN = n + 4;
  for (let k = 0; k < farN; k++) {
    const fw = (w / farN) * (0.7 + rng.next() * 0.5);
    const fx = (k + rng.next() * 0.3) * (w / farN) - fw * 0.1;
    const fh = (ground - 30) * tall * (0.35 + rng.next() * 0.4);
    g.fillStyle = 'rgba(12,14,34,0.55)';
    g.fillRect(fx, ground - fh, fw, fh);
    for (let j = 0; j < 3; j++) {
      if (rng.next() < 0.5) continue;
      g.fillStyle = 'rgba(255,214,120,0.35)';
      g.fillRect(fx + 3 + rng.next() * (fw - 8), ground - fh + 4 + rng.next() * (fh - 10), 3, 3);
    }
  }

  // the buildings: the town's own, left to right
  const spanL = w * 0.06;
  const span = w * 0.88;
  const slot = span / n;
  const blds = [];
  for (let k = 0; k < n; k++) {
    const bw = slot * (0.62 + rng.next() * 0.3);
    const x = spanL + k * slot + (slot - bw) / 2;
    const hMax = (ground - 26) * tall;
    const bh = Math.max(26, hMax * (0.45 + rng.next() * 0.55));
    const roof = rng.next();
    blds.push({ x, bw, bh, roof, body: BODY[Math.floor(rng.next() * BODY.length)] });
  }
  // windows: lit ones first fill the lower floors of every building, as many as there are people
  const wins = [];
  for (const b of blds) {
    const cols = Math.max(1, Math.floor((b.bw - 6) / 9));
    const rows = Math.max(1, Math.floor((b.bh - 10) / 11));
    b.win = { cols, rows };
    for (let r = rows - 1; r >= 0; r--) for (let c = 0; c < cols; c++) wins.push({ b, r, c, o: rng.next() });
  }
  wins.sort((a, b2) => (b2.r - a.r) || (a.o - b2.o));
  const litSet = new Set(wins.slice(0, Math.min(wins.length, lit)));
  let tallest = blds[0];
  for (const b of blds) {
    if (b.bh > tallest.bh) tallest = b;
    const top = ground - b.bh;
    g.fillStyle = b.body;
    g.fillRect(b.x, top, b.bw, b.bh);
    // a roof: flat, a peak (a house) or a spire
    g.beginPath();
    if (b.roof < 0.35 && b.bh < 70) {
      g.moveTo(b.x - 3, top);
      g.lineTo(b.x + b.bw / 2, top - b.bw * 0.45);
      g.lineTo(b.x + b.bw + 3, top);
      g.fillStyle = '#5a2f3a';
      g.fill();
    } else if (b.roof > 0.82) {
      g.moveTo(b.x + b.bw / 2 - 3, top);
      g.lineTo(b.x + b.bw / 2, top - 18);
      g.lineTo(b.x + b.bw / 2 + 3, top);
      g.fillStyle = b.body;
      g.fill();
    }
    // a light edge on the moon's side
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(b.x, top, 2, b.bh);
  }
  for (const wv of wins) {
    const { b, r, c } = wv;
    const top = ground - b.bh;
    const gx = b.x + (b.bw - (b.win.cols * 9 - 3)) / 2 + c * 9;
    const gy = top + 7 + r * 11;
    if (gy + 6 > ground - 2) continue;
    if (litSet.has(wv)) {
      g.fillStyle = 'rgba(255,214,110,0.28)';
      g.fillRect(gx - 1.5, gy - 1.5, 9, 10);
      g.fillStyle = wv.o < 0.12 ? '#fff1b8' : '#ffd36b';
    } else {
      g.fillStyle = 'rgba(14,20,40,0.75)';
    }
    g.fillRect(gx, gy, 6, 7);
  }
  // the tribe's flag on the tallest roof
  {
    const fx = tallest.x + tallest.bw / 2;
    const fy = ground - tallest.bh - (tallest.roof > 0.82 ? 18 : 0);
    g.strokeStyle = '#d9d9e8';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(fx, fy);
    g.lineTo(fx, fy - 16);
    g.stroke();
    g.fillStyle = FLAG[tribe] || FLAG.vuur;
    g.beginPath();
    g.moveTo(fx, fy - 16);
    g.lineTo(fx + 11, fy - 12.5);
    g.lineTo(fx, fy - 9);
    g.closePath();
    g.fill();
  }

  // the ground and the road
  g.fillStyle = '#141526';
  g.fillRect(0, ground, w, h - ground);
  g.fillStyle = 'rgba(255,210,120,0.18)';
  for (let x = 8; x < w; x += 22) g.fillRect(x, ground + 11, 10, 2);

  // the walls: one stone section per wall, across the front
  const nW = Math.max(0, Math.min(3, walls | 0));
  if (nW) {
    const secW = (w - 16) / 3;
    for (let k = 0; k < nW; k++) {
      const x0 = 8 + k * secW + 3;
      const ww = secW - 6;
      const wy = ground - 7;
      g.fillStyle = WALLS[tribe] || WALLS.vuur;
      g.fillRect(x0, wy, ww, 13);
      for (let c = 0; c < ww; c += 10) g.fillRect(x0 + c, wy - 5, 6, 5);   // battlements
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let c = 0; c < ww; c += 12) g.fillRect(x0 + c + (k % 2) * 6, wy + 6, 1, 6);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x0, wy, ww, 1.5);
    }
  }
  let url = '';
  try { url = cv.toDataURL('image/png'); } catch { url = ''; }
  if (cache.size > 60) cache.clear();
  cache.set(key, url);
  return url;
}
