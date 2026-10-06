// Background (agtergrond): altitude-driven sky, Table Mountain across the bay,
// parallax clouds that drift with the wind, stars up high, rainbow and storm
// darkening. Screen space only; reads the registry each frame and stays cheap.
import { GAME_W, LAYOUT, PX_PER_M, WATER } from '../config.js';
import { canvasTexture, clamp, lerpColor } from '../game/effects.js';

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
];
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

    this.t = 0;
    this.dark = 0;
    this.rain = 0;
    this.wind = 0;
    this.lastTint = -1;
    this.update(0, 0);
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
    const sceneryOn = horizon - MTN_H < H;
    this.mountains.setVisible(sceneryOn).y = horizon;
    this.tablecloth.setVisible(sceneryOn).y = horizon - PLATEAU_H - 28 + Math.sin(this.t * 0.4) * 1.5;
    this.tablecloth.alpha = 0.9 - dark * 0.3;
    const seaH = H - horizon + 4;
    this.sea.setVisible(seaH > 0);
    this.glint.setVisible(seaH > 0);
    // the sea covers the sky below the horizon: don't fill those pixels twice
    const skyRows = Math.max(8, Math.min(250, Math.ceil((250 * (horizon + 8)) / H)));
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
      this.tablecloth.setTint(scen);
      this.sea.setTint(scen);
      const cloud = lerpColor(lerpColor(0xffffff, 0xa6acd8, night), 0x8c95a3, dark);
      for (const c of this.clouds) c.img.setTint(cloud);
    }

    // clouds: parallax wrap in both directions (altitude can drop back on restart)
    const thin = 1 - smooth(250, 380, alt) * 0.85;
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
