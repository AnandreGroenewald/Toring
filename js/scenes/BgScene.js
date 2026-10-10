// Background (agtergrond): altitude-driven sky, Table Mountain across the bay,
// parallax clouds that drift with the wind, stars up high, rainbow and storm
// darkening. Screen space only; reads the registry each frame and stays cheap.
// 1.12 height zones (js/core/zones.js; the owner: "after 50 meter it needs to show a different picture
// than after 100 meter then 200 meter"): a sea of clouds from 50 m with hot-air balloons and
// paragliders, aeroplanes with trails and a helicopter from 100 m, the Earth's curve and a satellite
// from 200 m, rockets, a planet and a big moon from 300 m, the Milky Way, shooting stars and a UFO
// from 500 m. Flyers are a handful of images at a time, each drawn once.
import { GAME_W, LAYOUT, PX_PER_M, WATER } from '../config.js';
import { canvasTexture, clamp, lerpColor } from '../game/effects.js';
import { emojiTexture } from '../game/emojitex.js';

const HORIZON0 = LAYOUT.dropLineY + WATER.startOffsetPx - 8;   // screen y of the bay horizon at 0 m
const SCENERY_PARALLAX = 0.12;
const RAINBOW_DROP = 170;    // rainbow image bottom below the horizon: its legs vanish behind the land
const MTN_W = GAME_W;
const MTN_H = 340;           // mountain texture height; its bottom row sits on the horizon

const SKY_STOPS = [
  { m: 0, top: 0x5ec1f5, bot: 0xc8ecfb },
  { m: 60, top: 0x2f86d8, bot: 0x95cff4 },
  { m: 160, top: 0x1b3f8f, bot: 0x5a86c9 },
  { m: 320, top: 0x0b1030, bot: 0x2a2f6b },
  { m: 520, top: 0x04040f, bot: 0x0e1030 },   // (1.12) among the stars
];
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
// Flyers by height (m): what, from-to, seconds between two, how fast (px/s), size
const FLYERS = [
  { kind: 'balloon', from: 42, to: 190, every: [5, 10], speed: [10, 18], size: [0.55, 0.95] },
  { kind: 'para', from: 45, to: 130, every: [9, 16], speed: [26, 38], size: [40, 52], emoji: '🪂' },
  { kind: 'plane', from: 92, to: 270, every: [6, 11], speed: [130, 190], size: [0.6, 0.9] },
  { kind: 'heli', from: 88, to: 190, every: [14, 24], speed: [55, 75], size: [44, 54], emoji: '🚁' },
  { kind: 'sat', from: 185, to: 700, every: [8, 15], speed: [22, 34], size: [40, 50], emoji: '🛰️' },
  { kind: 'rocket', from: 280, to: 900, every: [11, 19], speed: [90, 130], size: [46, 58], emoji: '🚀' },
  { kind: 'ufo', from: 470, to: 9999, every: [18, 30], speed: [45, 70], size: [50, 60], emoji: '🛸' },
  { kind: 'comet', from: 380, to: 9999, every: [3, 7], speed: [520, 760], size: [0.8, 1.3] },
];
const FLYER_PARALLAX = 0.25;   // a flyer slides down this share of the climb (it stays at its height)
const STORM_TOP = 0x3a4250;
const STORM_BOT = 0x6b7685;

const CLOUD_LAYERS = [
  { p: 0.08, scale: 0.55, alpha: 0.72, drift: 5, wind: 0.05 },
  { p: 0.2, scale: 0.8, alpha: 0.88, drift: 9, wind: 0.09 },
  { p: 0.36, scale: 1.05, alpha: 0.96, drift: 14, wind: 0.14 },
];
// [layer, texture variant, x, screen y at 0 m]
const CLOUD_START = [
  [0, 1, 120, 470], [0, 2, 560, 560], [1, 0, 470, 300], [1, 2, -40, 640], [2, 1, 640, 420], [2, 0, 140, 230],
];

const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

function skyColors(alt) {
  let top = SKY_STOPS[SKY_STOPS.length - 1].top;
  let bot = SKY_STOPS[SKY_STOPS.length - 1].bot;
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const a = SKY_STOPS[i];
    const b = SKY_STOPS[i + 1];
    if (alt <= b.m) {
      const t = clamp((alt - a.m) / (b.m - a.m), 0, 1);
      top = lerpColor(a.top, b.top, t);
      bot = lerpColor(a.bot, b.bot, t);
      break;
    }
  }
  return [top, bot];
}

function hex(c) {
  return '#' + c.toString(16).padStart(6, '0');
}

// --------------------------------------------------------------------------- art
// Cape Town seen from across Table Bay: Devil's Peak (left), the flat top of
// Table Mountain (kept left of the tower so it stays visible), the Twelve
// Apostles fading behind, Lion's Head and Signal Hill on the right.
const PLATEAU = [104, 300];   // texture x range of the flat top
const PLATEAU_H = 258;        // its height above the horizon

function tracePoly(ctx, pts, bottom) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], bottom);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], bottom);
  ctx.closePath();
}

function drawMountains(ctx, w, h) {
  const H = h;   // horizon row
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Twelve Apostles: a hazier jagged ridge behind
  const apostles = [[290, H - 200], [330, H - 214], [350, H - 196], [372, H - 208], [396, H - 186], [420, H - 196],
    [446, H - 172], [470, H - 182], [500, H - 158], [530, H - 166], [560, H - 140], [600, H - 146], [650, H - 120],
    [700, H - 124], [740, H - 100]];
  ctx.fillStyle = '#a9c0dc';
  tracePoly(ctx, apostles, H + 2);
  ctx.fill();

  const ridge = [
    [-14, H - 150], [8, H - 204], [24, H - 230], [34, H - 238], [46, H - 228], [64, H - 204], [80, H - 200],
    [92, H - 230], [100, H - 252], [PLATEAU[0], H - PLATEAU_H], [160, H - PLATEAU_H - 3], [220, H - PLATEAU_H - 1],
    [270, H - PLATEAU_H - 3], [PLATEAU[1], H - PLATEAU_H + 1], [308, H - 246], [316, H - 214], [326, H - 182],
    [342, H - 152], [362, H - 130], [392, H - 114], [430, H - 104], [462, H - 116], [490, H - 138], [514, H - 158],
    [534, H - 174], [548, H - 181], [558, H - 182], [568, H - 177], [582, H - 160], [600, H - 134], [622, H - 112],
    [652, H - 98], [700, H - 92], [740, H - 84],
  ];
  const g = ctx.createLinearGradient(0, H - 270, 0, H);
  g.addColorStop(0, '#87a3c7');
  g.addColorStop(0.6, '#7391ba');
  g.addColorStop(1, '#9cb9d6');
  ctx.fillStyle = g;
  tracePoly(ctx, ridge, H + 2);
  ctx.fill();

  ctx.save();
  tracePoly(ctx, ridge, H + 2);
  ctx.clip();
  // sunlit planes (sun from the right)
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  for (const poly of [
    [[34, H - 238], [80, H - 200], [70, H - 120], [40, H - 170]],
    [[PLATEAU[1], H - PLATEAU_H], [326, H - 182], [362, H - 130], [330, H - 100], [300, H - 170]],
    [[558, H - 182], [622, H - 112], [600, H - 80], [566, H - 120]],
  ]) {
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
  // buttresses and gullies of the cliff face under the plateau
  for (let x = PLATEAU[0] + 6; x < PLATEAU[1] - 4; x += 12 + r() * 14) {
    const len = 24 + r() * 30;
    ctx.strokeStyle = r() < 0.55 ? 'rgba(60,82,122,0.14)' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2 + r() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x, H - PLATEAU_H + 6);
    ctx.lineTo(x + (r() - 0.5) * 5, H - PLATEAU_H + 6 + len);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(PLATEAU[0], H - PLATEAU_H - 2, PLATEAU[1] - PLATEAU[0], 4);
  ctx.restore();

  // foothills (closer: a little greener)
  const fg = ctx.createLinearGradient(0, H - 100, 0, H);
  fg.addColorStop(0, '#6f97a8');
  fg.addColorStop(1, '#88afc0');
  ctx.fillStyle = fg;
  tracePoly(ctx, [[-12, H - 46], [40, H - 66], [110, H - 80], [170, H - 70], [240, H - 84], [300, H - 74],
    [360, H - 66], [430, H - 58], [500, H - 54], [560, H - 46], [620, H - 52], [680, H - 42], [740, H - 38]], H + 2);
  ctx.fill();
  // the city at the water's edge: tiny pale blocks, taller in the centre
  for (let x = -4; x < w + 4;) {
    const bw = 5 + r() * 9;
    const bh = 4 + r() * (x > 120 && x < 300 ? 22 : 11);
    ctx.fillStyle = r() < 0.5 ? '#e6eef5' : '#c9d7e4';
    ctx.fillRect(x, H - bh, bw, bh);
    if (bh > 14) {
      ctx.fillStyle = 'rgba(90,120,150,0.35)';
      ctx.fillRect(x + bw - 2, H - bh, 2, bh);
    }
    x += bw + 1 + r() * 3;
  }
  // haze at the base
  const hz = ctx.createLinearGradient(0, H - 46, 0, H);
  hz.addColorStop(0, 'rgba(220,238,250,0)');
  hz.addColorStop(1, 'rgba(220,238,250,0.5)');
  ctx.fillStyle = hz;
  ctx.fillRect(0, H - 46, w, 46);
}

function drawTablecloth(ctx, w) {
  // the "tafeldoek": a flat cloud bank on the plateau, softly spilling over the edge
  const top = 24;
  // spill first: soft tongues fading down the cliff
  const tongues = [[30, 34], [62, 52], [96, 40], [130, 58], [162, 44], [188, 30]];
  for (const [x, len] of tongues) {
    const g = ctx.createLinearGradient(0, top, 0, top + len);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, top, 24, len, 0, 0, Math.PI);
    ctx.fill();
  }
  // the bank: overlapping flat puffs with a flat base
  const puffs = [[16, 8, 18, 10], [44, 4, 24, 14], [78, 7, 22, 12], [110, 2, 28, 15], [146, 6, 24, 13],
    [178, 4, 22, 13], [198, 9, 15, 9]];
  ctx.fillStyle = '#ffffff';
  for (const [x, dy, rx, ry] of puffs) {
    ctx.beginPath();
    ctx.ellipse(x, top + dy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(14, top + 2, w - 30, 12);
  // grey-blue belly like the other clouds
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const b = ctx.createLinearGradient(0, top - 8, 0, top + 18);
  b.addColorStop(0, 'rgba(206,224,242,0)');
  b.addColorStop(1, 'rgba(186,206,230,0.8)');
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, w, top + 18);
  ctx.restore();
}

function drawCloud(ctx, w, h, blobs) {
  // white puffs, then a soft blue-grey belly via source-atop
  for (const [x, y, r] of blobs) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // flat cloud base covering the gaps between the lower puffs
  const x0 = blobs[0][0];
  const x1 = blobs[blobs.length - 1][0];
  const yb = Math.max(...blobs.map(([, y, r]) => y + r)) - 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x0, yb - 26);
  ctx.lineTo(x1, yb - 26);
  ctx.arc(x1, yb - 12, 12, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x0, yb);
  ctx.arc(x0, yb - 12, 12, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, h * 0.35, 0, h);
  g.addColorStop(0, 'rgba(206,224,242,0)');
  g.addColorStop(1, 'rgba(176,200,226,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// "Jou Stapelstad": the player's last 30 Daaglikse Torings as small stacked-block buildings on the
// shore, left (oldest) to right (today). Drawn once into a texture whenever the data changes: no
// per-frame drawing. Heights are to scale (capped), the best tower carries a tiny flag and
// missed days are low empty plots. Hazy on purpose, so it never competes with the game.
const SKY_H = 110;           // skyline texture height; its bottom row sits on the horizon
const SKY_SLOT = 21;         // px per day (30 days across)
const SKY_BLDG_W = 14;
const SKY_ROW = 6;           // one stacked block
const SKY_CAP_PX = 90;       // tallest building
const SKY_HAZE = 0xcfe0f0;

const hex6 = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;
const mixHaze = (c, t) => hex6(lerpColor(c, SKY_HAZE, t));

function drawSkyline(ctx, w, h, sky) {
  ctx.clearRect(0, 0, w, h);
  const days = sky && Array.isArray(sky.days) ? sky.days : [];
  if (!days.length) return;
  const x0 = Math.round((w - days.length * SKY_SLOT) / 2 + (SKY_SLOT - SKY_BLDG_W) / 2);
  const bestIdx = sky.best ? sky.best.index : -1;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const x = x0 + i * SKY_SLOT;
    if (d.heightM == null) {   // a plot nobody built on: a faint kerb and two corner posts
      ctx.fillStyle = mixHaze(0x6c86a8, 0.35);
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x, h - 2, SKY_BLDG_W, 2);
      ctx.fillRect(x, h - 5, 2, 3);
      ctx.fillRect(x + SKY_BLDG_W - 2, h - 5, 2, 3);
      ctx.globalAlpha = 1;
      continue;
    }
    const px = Math.min(SKY_CAP_PX, Math.round(SKY_ROW + d.heightM * 1.1));
    const rows = Math.max(1, Math.floor(px / SKY_ROW));
    const body = mixHaze(d.color, 0.36);
    const edge = mixHaze(d.color, 0.16);
    ctx.globalAlpha = 0.92;
    for (let r = 0; r < rows; r++) {
      const wob = ((i * 7 + r * 13) % 3) - 1;                 // tiny deterministic sideways offset: stacked, not extruded
      const rw = r > 1 && r % 3 === 2 ? SKY_BLDG_W - 2 : SKY_BLDG_W;
      const rx = x + (SKY_BLDG_W - rw) / 2 + (r === 0 ? 0 : wob);
      const ry = h - (r + 1) * SKY_ROW;
      ctx.fillStyle = edge;
      ctx.fillRect(rx, ry, rw, SKY_ROW);
      ctx.fillStyle = body;
      ctx.fillRect(rx, ry + 1, rw, SKY_ROW - 1);
    }
    ctx.globalAlpha = 1;
    if (i === bestIdx) {   // the best tower flies a tiny flag
      const top = h - rows * SKY_ROW;
      const cx = x + SKY_BLDG_W / 2;
      ctx.fillStyle = '#6b7a90';
      ctx.fillRect(cx, top - 10, 1, 10);
      ctx.fillStyle = '#ff5a5f';
      ctx.beginPath();
      ctx.moveTo(cx + 1, top - 10);
      ctx.lineTo(cx + 7, top - 7.5);
      ctx.lineTo(cx + 1, top - 5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function ensureBgTextures(scene) {
  canvasTexture(scene, 'bg_mountains', MTN_W, MTN_H, drawMountains);
  canvasTexture(scene, 'bg_tablecloth', 216, 100, drawTablecloth);
  canvasTexture(scene, 'bg_sea', 3, 126, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9ad4f2');
    g.addColorStop(0.08, '#5fb3e6');
    g.addColorStop(0.4, '#3f9ad8');
    g.addColorStop(1, '#2a7cc0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  canvasTexture(scene, 'bg_glint', 256, 64, (ctx) => {
    ctx.lineCap = 'round';
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const y = 4 + Math.pow(r(), 1.6) * 56;
      const x = r() * 256;
      const len = 4 + (y / 64) * 16 + r() * 6;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.45})`;
      ctx.lineWidth = 1 + (y / 64) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
  });
  canvasTexture(scene, 'bg_cloud_0', 260, 110, (ctx, w, h) =>
    drawCloud(ctx, w, h, [[40, 78, 28], [82, 58, 38], [132, 46, 44], [182, 62, 34], [220, 78, 26]]));
  canvasTexture(scene, 'bg_cloud_1', 200, 96, (ctx, w, h) =>
    drawCloud(ctx, w, h, [[36, 66, 24], [74, 48, 32], [118, 44, 34], [160, 64, 26]]));
  canvasTexture(scene, 'bg_cloud_2', 320, 120, (ctx, w, h) =>
    drawCloud(ctx, w, h, [[42, 86, 30], [86, 64, 40], [140, 50, 46], [196, 56, 42], [246, 72, 34], [284, 88, 24]]));
  canvasTexture(scene, 'bg_sun', 220, 220, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,253,230,1)');
    g.addColorStop(0.2, 'rgba(255,246,200,1)');
    g.addColorStop(0.24, 'rgba(255,240,180,0.55)');
    g.addColorStop(0.5, 'rgba(255,236,170,0.18)');
    g.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  canvasTexture(scene, 'bg_moon', 80, 80, (ctx) => {
    const g = ctx.createRadialGradient(40, 40, 0, 40, 40, 40);
    g.addColorStop(0.35, 'rgba(230,236,255,0.35)');
    g.addColorStop(1, 'rgba(230,236,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 80, 80);
    ctx.fillStyle = '#f4f2e6';
    ctx.beginPath();
    ctx.arc(40, 40, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(48, 34, 14, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, 'bg_stars', 256, 256, (ctx) => {
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const x = r() * 256;
      const y = r() * 256;
      const big = r() < 0.15;
      ctx.fillStyle = `rgba(255,255,${220 + Math.floor(r() * 35)},${0.5 + r() * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, big ? 1.8 : 0.6 + r() * 0.8, 0, Math.PI * 2);
      ctx.fill();
      if (big) {
        ctx.fillRect(x - 4, y - 0.5, 8, 1);
        ctx.fillRect(x - 0.5, y - 4, 1, 8);
      }
    }
  });
  canvasTexture(scene, 'bg_gull', 30, 14, (ctx) => {
    ctx.strokeStyle = '#33404f';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(2, 5);
    ctx.quadraticCurveTo(9, 0, 15, 9);
    ctx.quadraticCurveTo(21, 0, 28, 5);
    ctx.stroke();
  });
  canvasTexture(scene, 'bg_rainbow', 600, 304, (ctx, w) => {
    const cx = w / 2;
    const cy = 300;
    const outer = 296;
    const band = 60;
    const g = ctx.createRadialGradient(cx, cy, outer - band, cx, cy, outer);
    const cols = ['rgba(150,90,220,0)', 'rgba(150,90,220,0.8)', 'rgba(70,120,240,0.85)', 'rgba(60,190,230,0.85)',
      'rgba(90,210,110,0.85)', 'rgba(250,230,80,0.9)', 'rgba(255,160,60,0.9)', 'rgba(240,70,70,0.85)', 'rgba(240,70,70,0)'];
    cols.forEach((c, i) => g.addColorStop(i / (cols.length - 1), c));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, Math.PI, 0);
    ctx.arc(cx, cy, outer - band, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();
  });
  drawZoneTextures(scene);
}

/** The height zones' pictures (1.12), each drawn once. */
function drawZoneTextures(scene) {
  // a sea of clouds: the city is gone below it (seen from above: sunlit tops, blue-grey shade)
  canvasTexture(scene, 'bg_cloudsea', 720, 300, (ctx, w, h) => {
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const base = ctx.createLinearGradient(0, 90, 0, h);
    base.addColorStop(0, '#ffffff');
    base.addColorStop(0.45, '#e6f1fb');
    base.addColorStop(1, '#a9c3df');
    ctx.fillStyle = base;
    ctx.fillRect(0, 130, w, h - 130);
    for (let row = 0; row < 3; row++) {
      for (let x = -40; x < w + 60; x += 46 + r() * 30) {
        const y = 120 + row * 34 + r() * 18;
        const rad = 38 + r() * 46 - row * 6;
        const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.45, rad * 0.1, x, y, rad);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.7, row ? '#eef5fc' : '#f7fbff');
        g.addColorStop(1, row ? '#c9daec' : '#dde9f6');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // a soft fade at the top edge so it sits in the sky
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createLinearGradient(0, 40, 0, 120);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  });
  // under the sea of clouds' tops: more cloud, a little shaded, down to the bottom of the screen
  canvasTexture(scene, 'bg_cloudfill', 3, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#a9c3df');
    g.addColorStop(0.25, '#c4d7ec');
    g.addColorStop(1, '#dfeaf6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  // a striped hot-air balloon with its basket
  canvasTexture(scene, 'bg_balloon', 96, 140, (ctx) => {
    const cx = 48;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, 98);
    ctx.bezierCurveTo(6, 74, 2, 40, cx - 2, 6);
    ctx.bezierCurveTo(cx + 26, 2, 94, 40, cx, 98);
    ctx.closePath();
    ctx.clip();
    const cols = ['#ff5a5f', '#ffd23f', '#3d8beb', '#ff5a5f', '#ffd23f', '#3d8beb'];
    for (let k = 0; k < cols.length; k++) {
      ctx.fillStyle = cols[k];
      ctx.fillRect(4 + k * 15, 0, 15, 100);
    }
    const shade = ctx.createLinearGradient(0, 0, 96, 0);
    shade.addColorStop(0, 'rgba(255,255,255,0.35)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(0,0,40,0.3)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 96, 100);
    ctx.restore();
    ctx.strokeStyle = 'rgba(29,43,69,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 9, 98);
    ctx.lineTo(cx - 8, 116);
    ctx.moveTo(cx + 9, 98);
    ctx.lineTo(cx + 8, 116);
    ctx.stroke();
    ctx.fillStyle = '#9a6b3c';
    ctx.fillRect(cx - 11, 114, 22, 16);
    ctx.fillStyle = '#7a5129';
    ctx.fillRect(cx - 11, 114, 22, 4);
  });
  // a side-on aeroplane, nose to the right
  canvasTexture(scene, 'bg_plane', 120, 44, (ctx) => {
    ctx.fillStyle = '#f4f7fb';
    ctx.strokeStyle = '#7f93ad';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 22);
    ctx.quadraticCurveTo(20, 14, 96, 15);
    ctx.quadraticCurveTo(116, 16, 114, 23);
    ctx.quadraticCurveTo(110, 29, 96, 29);
    ctx.lineTo(18, 29);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();   // tail fin
    ctx.moveTo(12, 21);
    ctx.lineTo(4, 3);
    ctx.lineTo(18, 3);
    ctx.lineTo(30, 18);
    ctx.closePath();
    ctx.fillStyle = '#ff5a5f';
    ctx.fill();
    ctx.beginPath();   // wing
    ctx.moveTo(48, 24);
    ctx.lineTo(70, 24);
    ctx.lineTo(52, 42);
    ctx.lineTo(40, 42);
    ctx.closePath();
    ctx.fillStyle = '#c9d6e6';
    ctx.fill();
    ctx.fillStyle = '#3d8beb';   // windows
    for (let x = 36; x < 96; x += 8) ctx.fillRect(x, 18, 4, 4);
  });
  // a vapour trail (fades to nothing behind the plane)
  canvasTexture(scene, 'bg_trail', 256, 8, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.8)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 2, w, h - 4);
  });
  // the curve of the Earth from the edge of space: ocean, land, clouds and the thin blue air
  canvasTexture(scene, 'bg_earth', 720, 260, (ctx, w, h) => {
    const R = 1500;
    const cx = w / 2;
    const cy = 60 + R;
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const glow = ctx.createRadialGradient(cx, cy, R - 4, cx, cy, R + 46);
    glow.addColorStop(0, 'rgba(140,210,255,0.95)');
    glow.addColorStop(0.35, 'rgba(90,170,255,0.45)');
    glow.addColorStop(1, 'rgba(60,120,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const sea = ctx.createLinearGradient(0, 60, 0, h);
    sea.addColorStop(0, '#3a8fe0');
    sea.addColorStop(1, '#0d3f8f');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 7; k++) {   // land
      const x = r() * w;
      const y = 90 + r() * 150;
      ctx.fillStyle = r() < 0.5 ? '#5aa45a' : '#b9965f';
      ctx.beginPath();
      ctx.ellipse(x, y, 40 + r() * 70, 14 + r() * 26, r() * 0.6 - 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';   // cloud swirls
    for (let k = 0; k < 14; k++) {
      ctx.beginPath();
      ctx.ellipse(r() * w, 70 + r() * 180, 24 + r() * 60, 5 + r() * 9, r() * 0.4 - 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  // the Milky Way: a soft band thick with stars
  canvasTexture(scene, 'bg_galaxy', 512, 192, (ctx, w, h) => {
    let s = 21;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(235,225,255,0.5)');
    g.addColorStop(0.45, 'rgba(160,140,230,0.22)');
    g.addColorStop(1, 'rgba(90,80,180,0)');
    ctx.save();
    ctx.scale(1, h / w);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
    ctx.restore();
    for (let k = 0; k < 420; k++) {
      const x = r() * w;
      const y = h / 2 + (r() + r() + r() - 1.5) * h * 0.45;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.65})`;
      ctx.fillRect(x, y, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1);
    }
  });
  // a shooting star
  canvasTexture(scene, 'bg_comet', 180, 8, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.85, 'rgba(220,235,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w - 4, 1);
    ctx.arc(w - 4, h / 2, h / 2 - 1, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  });
}

export class BgScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Bg', active: true });
  }

  create() {
    ensureBgTextures(this);
    const W = this.scale.width;
    const H = this.scale.height;
    this.W = W;
    this.H = H;

    // sky gradient: a tiny canvas stretched to the screen, redrawn only when its colours change
    // (NPOT so Phaser clamps it instead of wrapping the bottom colour into the top edge)
    this.skyTex = this.textures.exists('bg_sky') ? this.textures.get('bg_sky') : this.textures.createCanvas('bg_sky', 3, 250);
    this.sky = this.add.image(0, 0, 'bg_sky').setOrigin(0, 0).setDisplaySize(W, H);
    this.skyKey = -1;

    const starTile = (alpha) => {
      const ts = this.add.tileSprite(0, 0, Math.ceil(W / 4), Math.ceil(H / 4), 'bg_stars').setOrigin(0, 0);
      ts.setScale(4).setTileScale(0.25, 0.25).setAlpha(alpha).setVisible(false);
      return ts;
    };
    this.stars = starTile(0);
    this.stars2 = starTile(0);
    this.stars2.tilePositionX = 97;
    this.stars2.tilePositionY = 41;

    this.sun = this.add.image(W * 0.8, 380, 'bg_sun');
    this.moon = this.add.image(W * 0.78, 420, 'bg_moon').setAlpha(0);
    this.rainbow = this.add.image(W / 2, HORIZON0 + RAINBOW_DROP, 'bg_rainbow').setOrigin(0.5, 1).setScale(2.1).setAlpha(0).setVisible(false);

    this.clouds = CLOUD_START.map(([layer, variant, x, y0]) => {
      const L = CLOUD_LAYERS[layer];
      const img = this.add.image(x, y0, `bg_cloud_${variant}`).setScale(L.scale).setAlpha(L.alpha);
      return { img, L, x, y0 };
    });
    // far clouds sit behind the mountains, nearer ones in front of them
    this.mountains = this.add.image(0, HORIZON0, 'bg_mountains').setOrigin(0, 1);
    this.tablecloth = this.add.image(PLATEAU[0] - 8, HORIZON0 - PLATEAU_H - 28, 'bg_tablecloth').setOrigin(0, 0);
    for (const c of this.clouds) {
      if (c.L !== CLOUD_LAYERS[0]) c.img.setDepth(1);
    }
    this.mountains.setDepth(0.5);
    // Jou Stapelstad on the shore in front of the mountains (a texture painted when the data changes)
    this.skylineTex = this.textures.exists('bg_skyline') ? this.textures.get('bg_skyline') : this.textures.createCanvas('bg_skyline', GAME_W, SKY_H);
    this.skyline = this.add.image(0, HORIZON0, 'bg_skyline').setOrigin(0, 1).setDepth(0.55).setVisible(false);
    this.skylineKey = null;
    this.paintSkyline(this.registry.get('skyline'));
    const onSky = (_parent, value) => this.paintSkyline(value);
    this.registry.events.on('changedata-skyline', onSky);
    this.events.once('shutdown', () => this.registry.events.off('changedata-skyline', onSky));
    this.tablecloth.setDepth(0.6);
    this.sea = this.add.image(0, HORIZON0, 'bg_sea').setOrigin(0, 0).setDepth(2);
    this.glint = this.add.tileSprite(0, HORIZON0, W, 64, 'bg_glint').setOrigin(0, 0).setDepth(2.1).setAlpha(0.6);
    this.gulls = [0, 1, 2].map((i) => ({
      img: this.add.image(80 + i * 230, 560 + i * 46, 'bg_gull').setDepth(3).setScale(0.9 - i * 0.15),
      speed: 26 + i * 9,
      y0: 560 + i * 46 - (i === 1 ? 120 : 0),
      phase: i * 1.7,
    }));

    // A new run must not inherit the last run's storm/rainbow/wind if it never writes them.
    const game = this.scene.get('Game');
    if (game && !game.__bgResetHooked) {
      game.__bgResetHooked = true;
      game.events.on('shutdown', () => {
        for (const k of ['skyDark', 'wind', 'rainbow']) this.registry.set(k, 0);
      });
    }

    // height zones (1.12): the Milky Way and the Earth behind everything, the sea of clouds over the
    // city, a planet, and the flyers (a few at a time)
    this.galaxy = this.add.image(W / 2, H * 0.38, 'bg_galaxy').setScale(Math.max(2, W / 300)).setAngle(-24).setAlpha(0).setVisible(false).setDepth(0.001);
    this.earth = this.add.image(W / 2, H + 260, 'bg_earth').setOrigin(0.5, 0).setDisplaySize(W * 1.04, 260 * (W * 1.04) / 720).setVisible(false).setDepth(2.4);
    this.cloudSea = this.add.image(W / 2, H + 60, 'bg_cloudsea').setOrigin(0.5, 0).setDisplaySize(W * 1.1, 300 * (W * 1.1) / 720).setAlpha(0).setVisible(false).setDepth(2.6);
    this.cloudFill = this.add.image(0, H, 'bg_cloudfill').setOrigin(0, 0).setDisplaySize(W, 10).setAlpha(0).setVisible(false).setDepth(2.59);
    this.planet = this.add.text(W * 0.22, H * 0.3, '🪐', { fontSize: '96px', fontFamily: EMOJI_FONT }).setOrigin(0.5).setAlpha(0).setVisible(false).setDepth(0.002);
    this.flyers = [];
    this.flyerNext = FLYERS.map((f) => f.every[0] * Math.random());

    this.t = 0;
    this.dark = 0;
    this.rain = 0;
    this.wind = 0;
    this.lastTint = -1;
    this.update(0, 0);
  }

  /**
   * The height zones' scenery (1.12): what shows, where, and the flyers coming and going. `horizon` is
   * the bay's horizon on screen (it slides down as the tower climbs).
   */
  _updateZones(alt, dt, dark, horizon) {
    const W = this.W;
    const H = this.H;
    // the sea of clouds: from about 40 m it gathers over the bay and the city (the mountain's top peeks
    // out), it slides down with the bay as we climb, and the Earth takes over from about 200 m
    const sea = smooth(36, 58, alt) * (1 - smooth(175, 225, alt)) * (1 - dark * 0.35);
    const showSea = sea > 0.01;
    this.cloudSea.setVisible(showSea).setAlpha(sea);
    this.cloudFill.setVisible(showSea).setAlpha(sea);
    if (showSea) {
      const k = this.cloudSea.displayHeight / 300;   // texture px -> screen px
      // its tops (texture row ~110) gather from just under the horizon up to cover the shore
      const tops = horizon + 40 - smooth(36, 70, alt) * 110;
      this.cloudSea.y = tops - 110 * k;
      this.cloudSea.x = W / 2 + Math.sin(this.t * 0.05) * 14;
      const fillTop = this.cloudSea.y + this.cloudSea.displayHeight - 2;
      this.cloudFill.setVisible(fillTop < H).setPosition(0, fillTop).setDisplaySize(W, Math.max(4, H - fillTop + 4));
    }
    // the curve of the Earth from 200 m (further away the higher we go)
    const earth = smooth(170, 235, alt);
    this.earth.setVisible(earth > 0.01).setAlpha(earth);
    if (earth > 0.01) this.earth.y = H + 20 - earth * this.earth.displayHeight * 0.72 + smooth(320, 700, alt) * 70;
    const gal = smooth(420, 540, alt) * (1 - dark * 0.8);
    this.galaxy.setVisible(gal > 0.01).setAlpha(gal);
    const planet = smooth(300, 380, alt) * (1 - dark * 0.8);
    this.planet.setVisible(planet > 0.01).setAlpha(planet);
    if (planet > 0.01) this.planet.y = H * 0.3 + Math.sin(this.t * 0.2) * 6;
    // the moon grows from 300 m
    this.moon.setScale(1 + smooth(280, 480, alt) * 1.6);
    // flyers: each kind comes now and then in its own heights
    for (let k = 0; k < FLYERS.length; k++) {
      const f = FLYERS[k];
      if (alt < f.from || alt > f.to || this.flyers.length >= 5) continue;
      this.flyerNext[k] -= dt;
      if (this.flyerNext[k] > 0) continue;
      this.flyerNext[k] = f.every[0] + Math.random() * (f.every[1] - f.every[0]);
      this._spawnFlyer(f, alt);
    }
    for (let k = this.flyers.length - 1; k >= 0; k--) {
      const o = this.flyers[k];
      o.x += o.vx * dt;
      o.y0 += o.vy * dt;
      const y = o.y0 + (alt - o.alt0) * PX_PER_M * FLYER_PARALLAX + (o.bob ? Math.sin(this.t * 0.9 + o.phase) * o.bob : 0);
      o.img.setPosition(o.x, y);
      if (o.trail) o.trail.setPosition(o.x - o.dir * o.img.displayWidth * 0.45, y + 2);
      if (o.x < -260 || o.x > W + 260 || y > H + 160 || y < -200) {
        o.img.destroy();
        if (o.trail) o.trail.destroy();
        this.flyers.splice(k, 1);
      }
    }
  }

  _spawnFlyer(f, alt) {
    const W = this.W;
    const H = this.H;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = f.speed[0] + Math.random() * (f.speed[1] - f.speed[0]);
    const size = f.size[0] + Math.random() * (f.size[1] - f.size[0]);
    const x = dir > 0 ? -60 : W + 60;
    let y0 = H * (0.12 + Math.random() * 0.45);
    let img;
    let trail = null;
    let vy = 0;
    let bob = 0;
    if (f.emoji) {
      // (1.12.1) one image per emoji (drawn once at its biggest size), scaled: not a new text for every flyer
      img = this.add.image(x, y0, emojiTexture(this, f.emoji, f.size[1], { font: EMOJI_FONT })).setOrigin(0.5).setScale(size / f.size[1]);
      // (the emoji face left, or up-right: turned to fly the way they go)
      if (f.kind === 'heli' || f.kind === 'para' || f.kind === 'sat' || f.kind === 'ufo') img.setFlipX(dir > 0 && f.kind === 'heli');
      if (f.kind === 'rocket') {
        img.setAngle(dir > 0 ? 0 : -90);
        vy = -speed * 0.6;
      }
      if (f.kind === 'para') {
        vy = 12;
        bob = 5;
      }
      if (f.kind === 'ufo') bob = 14;
      if (f.kind === 'sat') vy = (Math.random() - 0.5) * 12;
    } else if (f.kind === 'balloon') {
      img = this.add.image(x, y0, 'bg_balloon').setScale(size);
      bob = 7;
    } else if (f.kind === 'plane') {
      img = this.add.image(x, y0, 'bg_plane').setScale(size).setFlipX(dir < 0);
      trail = this.add.image(x, y0, 'bg_trail').setOrigin(1, 0.5).setScale(1.4 * size * 2, 1).setFlipX(dir < 0).setAlpha(0.75);
      if (dir < 0) trail.setOrigin(0, 0.5);
      y0 = H * (0.1 + Math.random() * 0.3);
    } else {   // comet: a streak across the top half
      img = this.add.image(x, H * Math.random() * 0.4, 'bg_comet').setScale(size).setAngle(dir > 0 ? 18 : 162);
      y0 = img.y;
      vy = speed * 0.32;
    }
    // (space flyers just over the sky and stars, behind everything else; the others among the clouds)
    img.setDepth(f.kind === 'comet' || f.kind === 'sat' || f.kind === 'ufo' || f.kind === 'rocket' ? 0.003 : 1.5);
    if (trail) trail.setDepth(1.45);
    this.flyers.push({ img, trail, x, y0, vx: dir * speed, vy, alt0: alt, dir, bob, phase: Math.random() * 6 });
  }

  update(time, delta) {
    const dt = Math.min(delta, 100) / 1000;
    this.t += dt;
    const reg = this.registry;
    const alt = Math.max(0, Number(reg.get('altitudeM')) || 0);
    const k = 1 - Math.exp(-dt * 3);
    this.dark += ((clamp(Number(reg.get('skyDark')) || 0, 0, 1)) - this.dark) * (dt ? k : 1);
    this.rain += ((clamp(Number(reg.get('rainbow')) || 0, 0, 1)) - this.rain) * (dt ? k : 1);
    this.wind += ((Number(reg.get('wind')) || 0) - this.wind) * (1 - Math.exp(-dt * 1.5));
    const W = this.W;
    const H = this.H;
    const altPx = alt * PX_PER_M;
    const dark = this.dark;

    this._updateSky(alt, dark);

    // stars above ~200 m
    const starA = smooth(180, 300, alt) * (1 - dark * 0.85);
    const twinkle = 0.5 + 0.5 * Math.sin(this.t * 2.3);
    this.stars.setVisible(starA > 0.01).setAlpha(starA);
    this.stars2.setVisible(starA > 0.01).setAlpha(starA * twinkle);
    if (starA > 0.01) {
      this.stars.tilePositionY = -altPx * 0.004;
      this.stars2.tilePositionY = 41 - altPx * 0.006;
    }

    // sun by day, moon up high
    const sunA = (1 - smooth(140, 300, alt)) * (1 - dark * 0.9);
    this.sun.setAlpha(sunA).setVisible(sunA > 0.01);
    this.sun.y = 380 + altPx * 0.02;
    this.sun.setScale(1 + Math.sin(this.t * 1.2) * 0.02);
    const moonA = smooth(220, 320, alt) * (1 - dark * 0.8);
    this.moon.setAlpha(moonA).setVisible(moonA > 0.01);

    // far scenery slides down as we climb (and sits as much lower as the game's drop line on notched phones)
    const horizon = HORIZON0 + (Number(this.registry.get('dropOffset')) || 0) + altPx * SCENERY_PARALLAX;

    // rainbow (its legs go down behind the mountains and the bay)
    const rb = this.rain * 0.72 * (1 - dark * 0.5);
    this.rainbow.setVisible(rb > 0.01).setAlpha(rb);
    if (rb > 0.01) this.rainbow.y = horizon + RAINBOW_DROP;
    // (1.12: the bay, the city and the mountain are gone under the sea of clouds by about 170 m)
    const ground = 1 - smooth(90, 170, alt);
    const sceneryOn = horizon - MTN_H < H && ground > 0.01;
    this.mountains.setVisible(sceneryOn).y = horizon;
    this.mountains.alpha = ground;
    this.tablecloth.setVisible(sceneryOn).y = horizon - PLATEAU_H - 28 + Math.sin(this.t * 0.4) * 1.5;
    this.skyline.setVisible(sceneryOn && this.skylineOn).y = horizon;
    this.skyline.alpha = 0.9 * (1 - smooth(60, 200, alt)) * (1 - dark * 0.3) * ground;
    this.tablecloth.alpha = (0.9 - dark * 0.3) * ground;
    const seaH = H - horizon + 4;
    this.sea.setVisible(seaH > 0 && ground > 0.01);
    this.glint.setVisible(seaH > 0 && ground > 0.01);
    this.sea.alpha = ground;
    // the sea covers the sky below the horizon: don't fill those pixels twice
    // (once the bay fades under the clouds, the sky shows all the way down)
    const skyRows = ground < 0.99 ? 250 : Math.max(8, Math.min(250, Math.ceil((250 * (horizon + 8)) / H)));
    if (skyRows !== this.skyRows) {
      this.skyRows = skyRows;
      this.sky.setCrop(0, 0, 3, skyRows);
    }
    if (seaH > 0) {
      this.sea.y = horizon;
      this.sea.setDisplaySize(W, Math.max(seaH, 64));
      this.glint.y = horizon + 2;
      this.glint.tilePositionX = this.t * 6;
      this.glint.alpha = (0.45 + Math.sin(this.t * 1.7) * 0.15) * (1 - dark * 0.7) * (1 - smooth(120, 260, alt));
    }

    // tints: storms grey everything; at altitude the world below cools to dusk blue
    const night = smooth(120, 320, alt);
    const tintKey = Math.round(dark * 60) * 100 + Math.round(night * 60);
    if (tintKey !== this.lastTint) {
      this.lastTint = tintKey;
      const scen = lerpColor(lerpColor(0xffffff, 0x8f97c8, night), 0x7a8290, dark);
      this.mountains.setTint(scen);
      this.skyline.setTint(scen);
      this.tablecloth.setTint(scen);
      this.sea.setTint(scen);
      const cloud = lerpColor(lerpColor(0xffffff, 0xa6acd8, night), 0x8c95a3, dark);
      for (const c of this.clouds) c.img.setTint(cloud);
    }

    // clouds: parallax wrap in both directions (altitude can drop back on restart)
    const thin = 1 - smooth(150, 270, alt) * 0.92;   // (1.12: gone before the stars)
    const span = H + 360;
    for (const c of this.clouds) {
      const L = c.L;
      c.x += (L.drift + this.wind * L.wind) * dt;
      const half = c.img.displayWidth / 2;
      if (c.x > W + half + 20) c.x = -half - 10;
      else if (c.x < -half - 20) c.x = W + half + 10;
      const y = ((((c.y0 + altPx * L.p + 180) % span) + span) % span) - 180;
      c.img.setPosition(c.x, y);
      c.img.alpha = L.alpha * thin;
    }

    this._updateZones(alt, dt, dark, horizon);

    // seagulls at low altitude
    const gullA = 1 - smooth(15, 50, alt);
    for (const g of this.gulls) {
      const vis = gullA > 0.01;
      g.img.setVisible(vis);
      if (!vis) continue;
      g.img.x += g.speed * dt;
      if (g.img.x > W + 30) g.img.x = -30;
      g.img.y = g.y0 + altPx * 0.5 + Math.sin(this.t * 1.1 + g.phase) * 8;
      g.img.scaleY = g.img.scaleX * (0.45 + 0.55 * Math.abs(Math.sin(this.t * 5 + g.phase)));
      g.img.alpha = gullA;
    }
  }

  /** Redraws the skyline texture, only when the days or heights actually changed. */
  paintSkyline(sky) {
    const key = sky && Array.isArray(sky.days) ? sky.days.map((d) => `${d.dateKey}:${d.heightM ?? '-'}`).join('|') : '';
    if (key === this.skylineKey) return;
    this.skylineKey = key;
    try {
      drawSkyline(this.skylineTex.getContext(), GAME_W, SKY_H, sky);
      this.skylineTex.refresh();
    } catch {
      // decoration only
    }
    this.skylineOn = !!key;
  }

  _updateSky(alt, dark) {
    let [top, bot] = skyColors(alt);
    if (dark > 0) {
      top = lerpColor(top, STORM_TOP, dark);
      bot = lerpColor(bot, STORM_BOT, dark);
    }
    const key = top * 16777216 + bot;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const ctx = this.skyTex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, 250);
    g.addColorStop(0, hex(top));
    g.addColorStop(1, hex(bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 3, 250);
    this.skyTex.refresh();
  }
}

export default BgScene;
