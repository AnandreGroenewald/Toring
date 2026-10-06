// The rocky Cape island under the tower, plus the concrete base platform look.
// Drawn once into canvas textures; world space. The base image covers the static
// base body exactly: width LAYOUT.baseWidth, height LAYOUT.baseHeight, top at y = 0.
import { DEPTH, GAME_W, LAYOUT, WATER } from '../config.js';
import { canvasTexture } from './effects.js';

const TEX_W = 900;
const TEX_H = 720;
const ORIGIN_X = GAME_W / 2 - TEX_W / 2;   // world x of texture column 0
const ORIGIN_Y = -80;                       // world y of texture row 0
const WATERLINE = WATER.startOffsetPx - ORIGIN_Y;   // texture row of the resting sea level
const BASE_L = GAME_W / 2 - LAYOUT.baseWidth / 2 - ORIGIN_X;
const BASE_R = BASE_L + LAYOUT.baseWidth;
const BASE_TOP = LAYOUT.baseTopY - ORIGIN_Y;

// Table Mountain sandstone and granite boulders, Cape-coast style.
const ROCK = [
  { base: '#9b8f80', light: '#c9bda8', dark: '#6c6358', line: '#4b443d' },
  { base: '#a7a39c', light: '#d3cfc6', dark: '#78746e', line: '#504d49' },
  { base: '#8c8073', light: '#b8aa96', dark: '#625a50', line: '#463f38' },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boulderPoints(cx, cy, rx, ry, rand) {
  const n = 9;
  const pts = [[cx - rx * 0.95, cy + ry * 0.55]];
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;   // upper half: left → top → right
    const j = 0.82 + rand() * 0.26;
    pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
  }
  pts.push([cx + rx * 0.95, cy + ry * 0.55]);
  return pts;
}

function tracePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function drawBoulder(ctx, cx, cy, rx, ry, pal, rand) {
  const pts = boulderPoints(cx, cy, rx, ry, rand);
  ctx.save();
  tracePath(ctx, pts);
  ctx.fillStyle = pal.base;
  ctx.fill();
  ctx.clip();
  // lit crown (sun from the upper left) and shaded flank: flat low-poly facets
  ctx.fillStyle = pal.light;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 1.1, cy - ry * 0.05);
  ctx.lineTo(cx - rx * 0.55, cy - ry * 1.2);
  ctx.lineTo(cx + rx * 0.35, cy - ry * 1.2);
  ctx.lineTo(cx + rx * 0.05, cy - ry * 0.35);
  ctx.lineTo(cx - rx * 0.6, cy + ry * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.dark;
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.25, cy + ry);
  ctx.lineTo(cx + rx * 0.45, cy - ry * 0.25);
  ctx.lineTo(cx + rx * 1.2, cy - ry * 0.7);
  ctx.lineTo(cx + rx * 1.2, cy + ry);
  ctx.closePath();
  ctx.fill();
  // a crack
  ctx.strokeStyle = pal.line;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.15, cy - ry * 0.6);
  ctx.lineTo(cx + rx * 0.05, cy - ry * 0.15);
  ctx.lineTo(cx - rx * 0.05, cy + ry * 0.3);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  tracePath(ctx, pts);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function restio(ctx, x, y, h, rand) {
  // fynbos restio clump: fan of thin reeds
  const cols = ['#6f8c34', '#86a43f', '#5b7429', '#9fb84c'];
  ctx.lineCap = 'round';
  const n = 9 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (rand() - 0.5) * 1.3;
    const len = h * (0.6 + rand() * 0.45);
    ctx.strokeStyle = cols[i % cols.length];
    ctx.lineWidth = 2 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x + (rand() - 0.5) * 8, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.6, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
    if (rand() < 0.35) {
      ctx.fillStyle = '#8a5a2b';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * len, y + Math.sin(a) * len, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function erica(ctx, x, y, r, rand, flower = '#f06aa0') {
  // rounded heath bush with tiny bell flowers
  const greens = ['#4f7a35', '#5e8c3d', '#6f9e46'];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = greens[i % 3];
    ctx.beginPath();
    ctx.arc(x + (rand() - 0.5) * r * 1.2, y - r * 0.6 - rand() * r * 0.5, r * (0.55 + rand() * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = flower;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.arc(x + (rand() - 0.5) * r * 1.6, y - r * 0.4 - rand() * r * 1.1, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function protea(ctx, x, y, s, pink = true) {
  // king protea (pink cup) or pincushion (orange pom) on a short stem with leaves
  ctx.strokeStyle = '#4c6b2c';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - s * 1.1);
  ctx.stroke();
  ctx.fillStyle = '#5f8a3a';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + d * s * 0.35, y - s * 0.45, s * 0.38, s * 0.15, d * -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const fy = y - s * 1.35;
  if (pink) {
    ctx.fillStyle = '#e8577f';
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x + i * s * 0.11, fy - Math.abs(i) * 0.6, s * 0.12, s * 0.42, i * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd1dc';
    ctx.beginPath();
    ctx.ellipse(x, fy - s * 0.12, s * 0.22, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#ff8a1f';
    ctx.beginPath();
    ctx.arc(x, fy, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd04a';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 12; i++) {
      const a = Math.PI + (i / 11) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * s * 0.3, fy + Math.sin(a) * s * 0.3);
      ctx.lineTo(x + Math.cos(a) * s * 0.62, fy + Math.sin(a) * s * 0.62);
      ctx.stroke();
    }
  }
}

function drawUnderwater(ctx, rand) {
  const wl = WATERLINE;
  // the island's submerged mass widens with depth
  ctx.beginPath();
  ctx.moveTo(150, wl - 8);
  const left = [[120, wl + 40], [96, wl + 120], [60, wl + 210], [52, wl + 300], [20, wl + 420], [0, TEX_H]];
  const right = [[TEX_W, TEX_H], [880, wl + 430], [846, wl + 310], [836, wl + 220], [800, wl + 120], [770, wl + 40], [748, wl - 8]];
  for (const [x, y] of left) ctx.lineTo(x + (rand() - 0.5) * 14, y);
  for (const [x, y] of right) ctx.lineTo(x + (rand() - 0.5) * 14, y);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, wl - 10, 0, TEX_H);
  g.addColorStop(0, '#567a90');
  g.addColorStop(0.25, '#3f78a8');
  g.addColorStop(1, '#3482c4');
  ctx.fillStyle = g;
  ctx.fill();
  // submerged boulders and ledges, tinted blue
  const blues = [{ base: '#4d7c9e', light: '#6c9cbc', dark: '#3d6a8c', line: '#335d7e' }];
  for (let i = 0; i < 14; i++) {
    const y = wl + 40 + rand() * 360;
    const spread = 300 + (y - wl) * 0.45;
    const x = TEX_W / 2 + (rand() - 0.5) * spread * 2;
    drawBoulder(ctx, x, y, 36 + rand() * 46, 22 + rand() * 22, blues[0], rand);
  }
  // Cape kelp: olive strands with floats, rising from the rocks
  ctx.lineCap = 'round';
  const kelpX = [118, 170, 230, 640, 700, 772, 820];
  for (const kx of kelpX) {
    const by = wl + 200 + rand() * 180;
    const top = wl + 30 + rand() * 60;
    ctx.strokeStyle = 'rgba(112,118,64,0.75)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(kx, by);
    const sway = (rand() - 0.5) * 50;
    ctx.bezierCurveTo(kx + sway, by - (by - top) * 0.3, kx - sway, by - (by - top) * 0.7, kx + sway * 0.5, top);
    ctx.stroke();
    ctx.fillStyle = 'rgba(150,132,58,0.95)';
    ctx.beginPath();
    ctx.ellipse(kx + sway * 0.5, top, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(132,120,52,0.85)';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(kx + sway * 0.5 + 6 + k * 2, top + 6 + k * 7, 9, 3, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // fade with depth so it melts into the sea (also when there is no water overlay)
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, wl, 0, TEX_H);
  fade.addColorStop(0, 'rgba(0,0,0,0.95)');
  fade.addColorStop(0.08, 'rgba(0,0,0,0.7)');
  fade.addColorStop(0.5, 'rgba(0,0,0,0.26)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.restore();
}

function drawAboveWater(ctx, rand) {
  const wl = WATERLINE;
  // low rock shelf the platform sits on
  ctx.fillStyle = '#7c7266';
  ctx.beginPath();
  ctx.moveTo(150, wl + 6);
  ctx.lineTo(196, wl - 26);
  ctx.lineTo(BASE_L - 10, BASE_TOP + 16);
  ctx.lineTo(BASE_R + 10, BASE_TOP + 16);
  ctx.lineTo(708, wl - 30);
  ctx.lineTo(752, wl + 6);
  ctx.closePath();
  ctx.fill();

  // boulders: [cx, cy(bottom-ish), rx, ry, palette]; keep the ones next to the platform low
  const boulders = [
    [214, wl - 6, 72, 48, 0], [150, wl + 2, 44, 24, 2], [262, wl - 2, 46, 30, 1],
    [BASE_L - 2, wl - 4, 36, 24, 2],
    [690, wl - 8, 78, 54, 1], [756, wl + 2, 46, 26, 0], [626, wl - 2, 48, 28, 2],
    [BASE_R + 4, wl - 4, 36, 22, 0],
  ];
  for (const [cx, cy, rx, ry, p] of boulders) drawBoulder(ctx, cx, cy, rx, ry, ROCK[p], rand);

  // sandy pocket beach on the right, white Cape sand
  ctx.fillStyle = '#f2e2b6';
  ctx.beginPath();
  ctx.moveTo(718, wl + 4);
  ctx.quadraticCurveTo(752, wl - 12, 800, wl + 4);
  ctx.closePath();
  ctx.fill();

  // wet dark band at the waterline
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const wet = ctx.createLinearGradient(0, wl - 12, 0, wl + 6);
  wet.addColorStop(0, 'rgba(40,52,60,0)');
  wet.addColorStop(1, 'rgba(40,52,60,0.55)');
  ctx.fillStyle = wet;
  ctx.fillRect(0, wl - 12, TEX_W, 18);
  ctx.restore();

  // fynbos on the crowns
  restio(ctx, 196, wl - 48, 30, rand);
  erica(ctx, 236, wl - 40, 13, rand);
  protea(ctx, 172, wl - 26, 16, true);
  restio(ctx, 254, wl - 28, 22, rand);
  erica(ctx, 136, wl - 16, 10, rand, '#ffffff');
  restio(ctx, 678, wl - 58, 34, rand);
  erica(ctx, 716, wl - 46, 14, rand);
  protea(ctx, 650, wl - 40, 17, false);
  restio(ctx, 740, wl - 22, 20, rand);
  erica(ctx, 612, wl - 28, 11, rand, '#ffffff');
  protea(ctx, 704, wl - 54, 14, true);

  // foam lapping at the rocks (visible even when the flood overlay is absent)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [x0, x1] of [[96, 300], [600, 812]]) {
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 6) ctx.lineTo(x, wl + 3 + Math.sin(x * 0.11) * 2);
    ctx.stroke();
  }
}

function drawBase(ctx, w, h) {
  const cap = 8;
  const stripeW = 42;
  // body
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#d2d7dd');
  g.addColorStop(1, '#a3aab4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // concrete speckle (deterministic)
  const rand = rng(7);
  ctx.fillStyle = 'rgba(90,98,110,0.18)';
  for (let i = 0; i < 160; i++) ctx.fillRect(rand() * w, cap + rand() * (h - cap), 1.5, 1.5);
  // panel seams + bolts
  for (const x of [w / 3, (2 * w) / 3]) {
    ctx.fillStyle = 'rgba(80,88,100,0.45)';
    ctx.fillRect(Math.round(x) - 1, cap, 2, h - cap - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(Math.round(x) + 1, cap, 1, h - cap - 6);
  }
  ctx.fillStyle = '#7d858f';
  for (const x of [stripeW + 12, w / 3 + 12, (2 * w) / 3 + 12, w / 3 - 12, (2 * w) / 3 - 12, w - stripeW - 12]) {
    for (const y of [cap + 8, h - 13]) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // hazard stripes on both ends
  for (const x0 of [0, w - stripeW]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, stripeW, h);
    ctx.clip();
    ctx.fillStyle = '#ffc61a';
    ctx.fillRect(x0, 0, stripeW, h);
    ctx.fillStyle = '#25272b';
    for (let s = -h; s < stripeW + h; s += 20) {
      ctx.beginPath();
      ctx.moveTo(x0 + s, h);
      ctx.lineTo(x0 + s + 10, h);
      ctx.lineTo(x0 + s + 10 + h, 0);
      ctx.lineTo(x0 + s + h, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  // top cap: the landing surface, light and crisp
  const cg = ctx.createLinearGradient(0, 0, 0, cap);
  cg.addColorStop(0, '#f1f3f5');
  cg.addColorStop(1, '#d8dce1');
  ctx.fillStyle = cg;
  ctx.fillRect(stripeW, 0, w - stripeW * 2, cap);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(0, 0, w, 2);
  ctx.fillStyle = 'rgba(60,66,76,0.55)';
  ctx.fillRect(0, cap, w, 2);
  // bottom lip / shadow
  const bg = ctx.createLinearGradient(0, h - 8, 0, h);
  bg.addColorStop(0, 'rgba(40,46,56,0)');
  bg.addColorStop(1, 'rgba(40,46,56,0.45)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, h - 8, w, 8);
  // crisp outline inside the texture so the visual edge equals the body edge
  ctx.strokeStyle = '#3f4652';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
}

/**
 * World-space island + base platform visuals. Returns the created objects and a destroy().
 */
export function createIsland(scene) {
  canvasTexture(scene, 'isl_rock', TEX_W, TEX_H, (ctx) => {
    const rand = rng(20261006);
    drawUnderwater(ctx, rand);
    drawAboveWater(ctx, rand);
  });
  canvasTexture(scene, 'isl_base', LAYOUT.baseWidth, LAYOUT.baseHeight, drawBase);

  const rock = scene.add.image(ORIGIN_X, ORIGIN_Y, 'isl_rock').setOrigin(0, 0).setDepth(DEPTH.island);
  const base = scene.add.image(GAME_W / 2, LAYOUT.baseTopY, 'isl_base')
    .setOrigin(0.5, 0).setDepth(DEPTH.base);
  base.setDisplaySize(LAYOUT.baseWidth, LAYOUT.baseHeight);
  return {
    rock,
    base,
    destroy() {
      rock.destroy();
      base.destroy();
    },
  };
}
