// The backgrounds' own worlds (1.15, the owner 12 Oct ~19:10: "there needs to be a little more various options available
// for the bricks and the background, its too sipmple ... it must be somthing a 22 year old looks at and thinks I need
// this"). Until 1.15 a background skin only re-tinted the sky and the scenery (BgScene's BG_SKINS); these four bring
// their own layers, so each one is a different place at the start of a tower:
//   sintgolf    retro neon (synthwave): a striped sun sinking behind the mountain, a neon grid rolling over the bay
//   noorderlig  the northern lights: green-to-violet curtains swaying over a dark night, stars from the ground up
//   ruimte      deep space: a nebula, the Milky Way and a ringed planet from the ground up
//   kersieblom  cherry blossom: pink petals drifting on the game's own wind
// Higher up the game's height zones take over (they fade out from about 120 m; space stays space). Screen space, like
// the rest of BgScene; every texture is drawn once and only moved or faded per frame.
import { canvasTexture, clamp } from '../game/effects.js';

const TAU = Math.PI * 2;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const seeded = (seed) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

const GRID_LINES = 9;
const PETALS = 26;

// ------------------------------------------------------------------------------------------------ art (drawn once)

/** The retro sun: a yellow-to-pink disc, cut by widening stripes in its lower half, in a soft glow. */
function drawSynthSun(ctx, w, h) {
  const c = w / 2;
  const R = w * 0.36;
  const glow = ctx.createRadialGradient(c, c, R * 0.6, c, c, c);
  glow.addColorStop(0, 'rgba(255,90,160,0.55)');
  glow.addColorStop(1, 'rgba(255,90,160,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, R, 0, TAU);
  ctx.clip();
  const g = ctx.createLinearGradient(0, c - R, 0, c + R);
  g.addColorStop(0, '#fff27a');
  g.addColorStop(0.45, '#ffa23d');
  g.addColorStop(0.75, '#ff4f8f');
  g.addColorStop(1, '#d4237f');
  ctx.fillStyle = g;
  ctx.fillRect(c - R, c - R, R * 2, R * 2);
  // the stripes: thin near the middle, wider towards the bottom
  ctx.globalCompositeOperation = 'destination-out';
  let y = c + R * 0.06;
  let gap = R * 0.035;
  while (y < c + R) {
    ctx.fillRect(c - R, y, R * 2, gap);
    y += gap + R * 0.13;
    gap *= 1.38;
  }
  ctx.restore();
}

/** The neon grid's converging lines (the horizontal ones are separate images that roll towards you). */
function drawGridLines(ctx, w, h) {
  const vx = w / 2;
  const vy = -h * 0.35;
  ctx.lineCap = 'round';
  for (let k = -14; k <= 14; k++) {
    const xb = vx + k * (w / 9);
    ctx.strokeStyle = 'rgba(41,240,255,0.32)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(vx + (xb - vx) * 0.26, 0);
    ctx.lineTo(xb, h);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,255,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  void vy;
  // the horizon line glows pink
  const hz = ctx.createLinearGradient(0, 0, 0, 18);
  hz.addColorStop(0, 'rgba(255,90,180,0.95)');
  hz.addColorStop(1, 'rgba(255,90,180,0)');
  ctx.fillStyle = hz;
  ctx.fillRect(0, 0, w, 18);
}

function drawGridRow(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(41,240,255,0)');
  g.addColorStop(0.5, 'rgba(200,255,255,0.95)');
  g.addColorStop(1, 'rgba(41,240,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** An aurora curtain: bright green at its lower edge, through teal to violet as it rises, in fine vertical rays. */
function drawAurora(ctx, w, h, seed) {
  const r = seeded(seed);
  const p1 = r() * TAU;
  const p2 = r() * TAU;
  ctx.globalCompositeOperation = 'lighter';
  for (let x = 0; x < w; x += 2) {
    const base = h * 0.62 + Math.sin(x / 95 + p1) * h * 0.13 + Math.sin(x / 33 + p2) * h * 0.05;
    const top = base - h * (0.35 + 0.25 * (0.5 + 0.5 * Math.sin(x / 61 + p2)));
    const edge = Math.min(1, x / 90, (w - x) / 90);
    const a = (0.25 + 0.35 * r()) * edge;
    const g = ctx.createLinearGradient(0, top, 0, base + 6);
    g.addColorStop(0, 'rgba(150,70,255,0)');
    g.addColorStop(0.35, `rgba(150,80,255,${a * 0.55})`);
    g.addColorStop(0.7, `rgba(40,220,210,${a * 0.85})`);
    g.addColorStop(0.95, `rgba(80,255,150,${Math.min(1, a * 1.6)})`);
    g.addColorStop(1, 'rgba(80,255,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, top, 2, base + 6 - top);
  }
}

/** Deep space: soft nebula clouds and star dust. */
function drawNebula(ctx, w, h) {
  const r = seeded(77);
  const blobs = [
    [0.3, 0.35, 0.42, 'rgba(170,70,255,0.42)'], [0.65, 0.3, 0.38, 'rgba(60,110,255,0.38)'], [0.5, 0.55, 0.34, 'rgba(255,80,190,0.28)'],
    [0.2, 0.6, 0.25, 'rgba(40,190,255,0.25)'], [0.8, 0.6, 0.3, 'rgba(140,60,255,0.3)'],
  ];
  ctx.globalCompositeOperation = 'lighter';
  for (const [bx, by, br, col] of blobs) {
    for (let k = 0; k < 5; k++) {
      const x = (bx + (r() - 0.5) * 0.12) * w;
      const y = (by + (r() - 0.5) * 0.12) * h;
      const rad = br * w * (0.5 + r() * 0.6);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 260; i++) {
    const a = 0.25 + r() * 0.7;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    const s = r() < 0.92 ? 1 : 2;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  // a few bright stars with a cross glint
  for (let i = 0; i < 7; i++) {
    const x = r() * w;
    const y = r() * h;
    const L = 6 + r() * 9;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x - L, y - 0.5, L * 2, 1);
    ctx.fillRect(x - 0.5, y - L, 1, L * 2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 5);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 5, y - 5, 10, 10);
  }
}

/** A ringed planet (the ring passes behind and in front of it). */
function drawPlanet(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const R = h * 0.3;
  const ring = (front) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.32);
    ctx.scale(1, 0.28);
    ctx.lineWidth = R * 0.42;
    ctx.strokeStyle = 'rgba(255,214,160,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.62, front ? 0 : Math.PI, front ? Math.PI : TAU);
    ctx.stroke();
    ctx.lineWidth = R * 0.08;
    ctx.strokeStyle = 'rgba(255,240,210,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.4, front ? 0 : Math.PI, front ? Math.PI : TAU);
    ctx.stroke();
    ctx.restore();
  };
  ring(false);
  const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  g.addColorStop(0, '#ffe2b0');
  g.addColorStop(0.5, '#e89a5a');
  g.addColorStop(1, '#8a3f6a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = -3; i <= 3; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(120,40,60,0.14)';
    ctx.fillRect(cx - R, cy + i * R * 0.24 - R * 0.06, R * 2, R * 0.12);
  }
  const sh = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.2, cx, cy, R * 1.1);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(20,0,40,0.55)');
  ctx.fillStyle = sh;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
  ring(true);
}

/** One cherry-blossom petal. */
function drawPetal(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#ffe3ee');
  g.addColorStop(0.6, '#ff9fc3');
  g.addColorStop(1, '#f16b9e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(1, h / 2);
  ctx.quadraticCurveTo(w * 0.35, 0, w * 0.82, h * 0.18);
  ctx.lineTo(w * 0.7, h / 2);
  ctx.lineTo(w * 0.82, h * 0.82);
  ctx.quadraticCurveTo(w * 0.35, h, 1, h / 2);
  ctx.fill();
}

/** (1.15, the owner: "Can you make this one more a Japan look") a vermilion torii gate (it stands in the bay, like Miyajima's). */
function drawTorii(ctx, w, h) {
  const red = ctx.createLinearGradient(0, 0, w, 0);
  red.addColorStop(0, '#b8121c');
  red.addColorStop(0.5, '#e8343c');
  red.addColorStop(1, '#a50f18');
  // the pillars, leaning in a little
  ctx.fillStyle = red;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, h * 0.24); ctx.lineTo(w * 0.29, h * 0.24); ctx.lineTo(w * 0.31, h); ctx.lineTo(w * 0.18, h); ctx.closePath();
  ctx.moveTo(w * 0.71, h * 0.24); ctx.lineTo(w * 0.8, h * 0.24); ctx.lineTo(w * 0.82, h); ctx.lineTo(w * 0.69, h); ctx.closePath();
  ctx.fill();
  // the black feet
  ctx.fillStyle = '#1b1218';
  ctx.fillRect(w * 0.165, h * 0.9, w * 0.16, h * 0.1);
  ctx.fillRect(w * 0.675, h * 0.9, w * 0.16, h * 0.1);
  // the lower beam (nuki)
  ctx.fillStyle = red;
  ctx.fillRect(w * 0.1, h * 0.34, w * 0.8, h * 0.065);
  // the top beam (kasagi), black over red, its ends swept up
  ctx.beginPath();
  ctx.moveTo(0, h * 0.06);
  ctx.quadraticCurveTo(w * 0.5, h * 0.17, w, h * 0.06);
  ctx.lineTo(w * 0.96, h * 0.2);
  ctx.quadraticCurveTo(w * 0.5, h * 0.27, w * 0.04, h * 0.2);
  ctx.closePath();
  ctx.fillStyle = red;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, h * 0.06);
  ctx.quadraticCurveTo(w * 0.5, h * 0.17, w, h * 0.06);
  ctx.lineTo(w * 0.985, h * 0.115);
  ctx.quadraticCurveTo(w * 0.5, h * 0.215, w * 0.015, h * 0.115);
  ctx.closePath();
  ctx.fillStyle = '#1b1218';
  ctx.fill();
  // the plaque in the middle
  ctx.fillStyle = '#1b1218';
  ctx.fillRect(w * 0.46, h * 0.2, w * 0.08, h * 0.15);
}

/** A five-tier pagoda, a soft silhouette across the bay. */
function drawPagoda(ctx, w, h) {
  ctx.fillStyle = '#6b3f6e';
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const y = h * (0.18 + i * 0.16);
    const half = w * (0.18 + i * 0.065);
    // the roof with upturned eaves
    ctx.beginPath();
    ctx.moveTo(w / 2 - half - w * 0.06, y + h * 0.045);
    ctx.quadraticCurveTo(w / 2 - half, y + h * 0.02, w / 2 - half * 0.55, y);
    ctx.lineTo(w / 2 + half * 0.55, y);
    ctx.quadraticCurveTo(w / 2 + half, y + h * 0.02, w / 2 + half + w * 0.06, y + h * 0.045);
    ctx.lineTo(w / 2 + half * 0.8, y + h * 0.06);
    ctx.lineTo(w / 2 - half * 0.8, y + h * 0.06);
    ctx.closePath();
    ctx.fill();
    // the storey under it
    ctx.fillRect(w / 2 - half * 0.6, y + h * 0.06, half * 1.2, h * 0.1);
  }
  // the spire
  ctx.fillRect(w / 2 - w * 0.012, h * 0.02, w * 0.024, h * 0.17);
  for (let k = 0; k < 4; k++) ctx.fillRect(w / 2 - w * 0.04, h * (0.05 + k * 0.03), w * 0.08, h * 0.008);
}

/** A cherry branch heavy with blossom (it frames a top corner). */
function drawBlossomBranch(ctx, w, h) {
  const r = seeded(13);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3a2430';
  const twig = (x0, y0, x1, y1, cx, cy, lw) => {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();
  };
  twig(-10, 10, w * 0.95, h * 0.55, w * 0.45, h * 0.05, 9);
  twig(w * 0.35, h * 0.2, w * 0.55, h * 0.9, w * 0.5, h * 0.4, 5);
  twig(w * 0.6, h * 0.36, w * 0.85, h * 0.15, w * 0.75, h * 0.32, 4);
  twig(w * 0.15, h * 0.12, w * 0.25, h * 0.6, w * 0.25, h * 0.3, 4);
  const blossom = (x, y, s) => {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + r() * 0.3;
      const g = ctx.createRadialGradient(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, 0, x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.6);
      g.addColorStop(0, '#fff1f6');
      g.addColorStop(1, '#ff9fc3');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.55, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#e8467c';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.22, 0, TAU);
    ctx.fill();
  };
  const spots = [[0.08, 0.12], [0.2, 0.08], [0.32, 0.14], [0.42, 0.12], [0.52, 0.2], [0.62, 0.3], [0.72, 0.38], [0.84, 0.46], [0.93, 0.55],
    [0.4, 0.32], [0.48, 0.5], [0.53, 0.7], [0.56, 0.86], [0.7, 0.24], [0.8, 0.18], [0.22, 0.35], [0.26, 0.52], [0.12, 0.26], [0.66, 0.44], [0.9, 0.38]];
  for (const [fx, fy] of spots) {
    for (let k = 0; k < 3; k++) blossom(fx * w + (r() - 0.5) * 18, fy * h + (r() - 0.5) * 14, 7 + r() * 5);
  }
}

/** The rising sun: a crisp vermilion disc with a soft glow. */
function drawRisingSun(ctx, w, h) {
  const c = w / 2;
  const glow = ctx.createRadialGradient(c, c, w * 0.28, c, c, c);
  glow.addColorStop(0, 'rgba(255,90,90,0.45)');
  glow.addColorStop(1, 'rgba(255,90,90,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(c * 0.85, c * 0.8, 0, c, c, w * 0.3);
  g.addColorStop(0, '#ff5a52');
  g.addColorStop(1, '#d81e2c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, w * 0.3, 0, TAU);
  ctx.fill();
}

export function ensureSkinTextures(scene) {
  canvasTexture(scene, 'bgs_synth_sun', 320, 320, drawSynthSun);
  canvasTexture(scene, 'bgs_grid', 720, 360, drawGridLines);
  canvasTexture(scene, 'bgs_grid_row', 256, 8, drawGridRow);
  canvasTexture(scene, 'bgs_aurora_0', 720, 380, (ctx, w, h) => drawAurora(ctx, w, h, 11));
  canvasTexture(scene, 'bgs_aurora_1', 720, 380, (ctx, w, h) => drawAurora(ctx, w, h, 29));
  canvasTexture(scene, 'bgs_nebula', 720, 720, drawNebula);
  canvasTexture(scene, 'bgs_planet', 300, 220, drawPlanet);
  canvasTexture(scene, 'bgs_petal', 24, 16, drawPetal);
  canvasTexture(scene, 'bgs_torii', 180, 170, drawTorii);
  canvasTexture(scene, 'bgs_pagoda', 110, 210, drawPagoda);
  canvasTexture(scene, 'bgs_branch', 280, 190, drawBlossomBranch);
  canvasTexture(scene, 'bgs_jpsun', 260, 260, drawRisingSun);
}

// ------------------------------------------------------------------------------------------------ the layers

/**
 * A skin's own layers in BgScene. setSkin(id) shows what that skin has; update() places and fades them each frame
 * (reduced motion: they stand still).
 */
export class SkinLayers {
  constructor(scene, W, H) {
    ensureSkinTextures(scene);
    this.scene = scene;
    this.W = W;
    this.H = H;
    this.id = null;
    this.t = 0;
    const k = W / 720;
    // deep space (behind everything but the sky)
    this.nebula = scene.add.image(W / 2, H * 0.32, 'bgs_nebula').setScale(Math.max(1.2, (H * 0.9) / 720)).setDepth(0.0005).setVisible(false);
    this.milky = scene.add.image(W / 2, H * 0.3, 'bg_galaxy').setScale(Math.max(2, W / 300)).setAngle(-24).setDepth(0.0008).setAlpha(0.75).setVisible(false);
    this.planet = scene.add.image(W * 0.26, H * 0.2, 'bgs_planet').setScale(0.9 * Math.max(1, k)).setDepth(0.003).setVisible(false);
    // northern lights (behind the mountain)
    this.aurora = [0, 1].map((i) => scene.add.image(W * (i ? 0.62 : 0.4), H * (i ? 0.2 : 0.27), `bgs_aurora_${i}`)
      .setScale(1.25 * Math.max(1, k), 1.3 * Math.max(1, k)).setDepth(0.2).setBlendMode('ADD').setVisible(false));
    // retro neon: the sun behind the mountain, the grid over the bay
    this.synthSun = scene.add.image(W / 2, 0, 'bgs_synth_sun').setScale(1.15 * Math.max(1, k)).setDepth(0.4).setVisible(false);
    this.grid = scene.add.image(W / 2, 0, 'bgs_grid').setOrigin(0.5, 0).setDepth(2.05).setVisible(false);
    this.gridRows = Array.from({ length: GRID_LINES }, () => scene.add.image(W / 2, 0, 'bgs_grid_row').setOrigin(0.5, 0.5).setDepth(2.06).setVisible(false));
    // cherry blossom, in Japan: the rising sun, a pagoda across the bay, a torii in the water, branches in the corners
    this.jpSun = scene.add.image(W * 0.72, 0, 'bgs_jpsun').setScale(1.1 * Math.max(1, k)).setDepth(0.4).setVisible(false);
    this.pagoda = scene.add.image(W * 0.8, 0, 'bgs_pagoda').setOrigin(0.5, 1).setScale(0.8 * Math.max(1, k)).setDepth(0.56).setVisible(false);
    this.torii = scene.add.image(W * 0.13, 0, 'bgs_torii').setOrigin(0.5, 1).setScale(0.62 * Math.max(1, k)).setDepth(2.08).setVisible(false);
    this.toriiMirror = scene.add.image(W * 0.13, 0, 'bgs_torii').setOrigin(0.5, 1).setScale(0.62 * Math.max(1, k), -0.62 * Math.max(1, k)).setDepth(2.07).setAlpha(0.28).setVisible(false);
    this.branchL = scene.add.image(0, 0, 'bgs_branch').setOrigin(0, 0).setScale(0.95 * Math.max(1, k)).setDepth(3.25).setVisible(false);
    this.branchR = scene.add.image(W, 0, 'bgs_branch').setOrigin(0, 0).setScale(-0.8 * Math.max(1, k), 0.8 * Math.max(1, k)).setDepth(3.25).setVisible(false);
    const r = seeded(5);
    this.petals = Array.from({ length: PETALS }, () => ({
      img: scene.add.image(r() * W, r() * H, 'bgs_petal').setDepth(3.2).setVisible(false),
      vy: 26 + r() * 34,
      sway: 14 + r() * 22,
      phase: r() * TAU,
      spin: (r() - 0.5) * 3,
      size: 0.8 + r() * 0.9,
      depth: 0.6 + r() * 0.4,
    }));
  }

  setSkin(id) {
    this.id = id;
    const on = (list, v) => (Array.isArray(list) ? list : [list]).forEach((o) => o.setVisible(v));
    on([this.nebula, this.milky, this.planet], id === 'ruimte');
    on(this.aurora, id === 'noorderlig');
    on([this.synthSun, this.grid, ...this.gridRows], id === 'sintgolf');
    for (const p of this.petals) p.img.setVisible(id === 'kersieblom');
    on([this.jpSun, this.pagoda, this.torii, this.toriiMirror, this.branchL, this.branchR], id === 'kersieblom');
  }

  /** alt (m), horizon (screen y of the bay's horizon), wind (px/s²), dark (storm 0..1), reduced (no motion). */
  update(dt, { alt = 0, horizon = this.H * 0.6, wind = 0, dark = 0, reduced = false } = {}) {
    const id = this.id;
    if (!id || id === 'dag' || id === 'sonsondergang' || id === 'lekkergoed' || id === 'nag') return;
    if (!reduced) this.t += dt;
    const t = this.t;
    const W = this.W;
    const H = this.H;
    const low = (1 - smooth(110, 240, alt)) * (1 - dark * 0.6);   // the start-of-tower world, fading as the zones take over
    if (id === 'ruimte') {
      const a = 1 - dark * 0.5;
      this.nebula.setAlpha(0.95 * a);
      this.nebula.y = H * 0.32 + Math.min(alt, 400) * 0.08;
      this.milky.setAlpha(0.7 * a * (1 - smooth(450, 560, alt) * 0.6));   // the game's own Milky Way comes in at 500 m
      this.planet.setAlpha(a * (1 - smooth(260, 340, alt)));               // ...and its own planet at 300 m
      this.planet.y = H * 0.2 + Math.min(alt, 300) * 0.25;
      this.planet.angle = Math.sin(t * 0.05) * 2;
    } else if (id === 'noorderlig') {
      this.aurora.forEach((img, i) => {
        const pulse = 0.72 + 0.28 * Math.sin(t * (0.45 + i * 0.17) + i * 1.7);
        img.setAlpha(pulse * low);
        img.x = W * (i ? 0.62 : 0.4) + Math.sin(t * (0.11 + i * 0.05) + i) * 34;
        img.scaleY = (1.3 + 0.08 * Math.sin(t * 0.3 + i * 2)) * Math.max(1, W / 720);
        img.y = H * (i ? 0.2 : 0.27) + alt * 0.4;
      });
    } else if (id === 'sintgolf') {
      this.synthSun.setAlpha(low);
      this.synthSun.y = horizon - 118 + Math.sin(t * 0.4) * 2;
      const seaH = Math.max(0, H - horizon);
      const show = seaH > 4 && low > 0.01;
      this.grid.setVisible(show).setAlpha(0.95 * low);
      if (show) {
        this.grid.y = horizon;
        this.grid.setDisplaySize(W * 1.35, seaH);
      }
      // the rows roll towards you, closer together near the horizon (a perspective of t^2)
      const speed = 0.16;
      for (let i = 0; i < GRID_LINES; i++) {
        const row = this.gridRows[i];
        row.setVisible(show);
        if (!show) continue;
        const f = (((i / GRID_LINES) + t * speed) % 1);
        const yy = horizon + seaH * f * f;
        row.setPosition(W / 2, yy);
        row.setDisplaySize(W * 1.35, 2 + 5 * f);
        row.setAlpha((0.25 + 0.75 * f) * low);
      }
    } else if (id === 'kersieblom') {
      const fade = 1 - smooth(140, 260, alt);
      const k = Math.max(1, W / 720);
      this.jpSun.setAlpha(low);
      this.jpSun.y = horizon - 210 + alt * 0.6;
      this.pagoda.setAlpha(0.9 * low);
      this.pagoda.y = horizon + 2;
      const seaH = H - horizon;
      const inBay = seaH > 20;
      this.torii.setVisible(inBay && low > 0.01).setAlpha(low);
      this.torii.y = horizon + Math.min(46 * k, seaH * 0.5);
      this.toriiMirror.setVisible(inBay && low > 0.01).setAlpha(0.28 * low);
      this.toriiMirror.y = this.torii.y + 2;
      // the branches hang in the top corners and sway a touch in the wind
      const sway = reduced ? 0 : Math.sin(t * 0.8) * 0.012 + clamp(wind, -260, 260) * 0.00006;
      this.branchL.setAlpha(fade).rotation = sway;
      this.branchR.setAlpha(fade).rotation = -sway;
      this.branchL.y = -18 * k;
      this.branchR.y = -26 * k;
      const drift = clamp(wind, -260, 260) * 0.35;
      for (const p of this.petals) {
        const img = p.img;
        if (fade < 0.01) {
          img.setVisible(false);
          continue;
        }
        if (!img.visible) img.setVisible(true);
        if (!reduced) {
          img.y += p.vy * p.depth * dt;
          img.x += (drift * p.depth + Math.cos(t * 1.3 + p.phase) * p.sway) * dt;
          img.rotation += p.spin * dt;
          if (img.y > H + 20) {
            img.y = -20;
            img.x = Math.random() * W;
          }
          if (img.x > W + 24) img.x = -24;
          else if (img.x < -24) img.x = W + 24;
        }
        img.setScale(p.size * p.depth, p.size * p.depth * (0.55 + 0.45 * Math.abs(Math.sin(t * 2 + p.phase))));
        img.setAlpha(0.9 * fade * (0.6 + 0.4 * p.depth));
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------ each world's own land
// (1.15, the owner: "also most of them has the mountain please change that") every background but the Cape day has its own
// skyline across the bay instead of Table Mountain: a texture as wide as the game (GAME_W) and MTN_H high, its bottom row on
// the horizon, drawn once. BgScene shows it in place of the mountain (and leaves the tablecloth away).

/** A ridge line through `pts` ([x, y] pairs, x in 0..1 of w, y in 0..1 of h from the top), filled down to the horizon. */
function ridge(ctx, w, h, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(-2, h + 2);
  for (const [x, y] of pts) ctx.lineTo(x * w, y * h);
  ctx.lineTo(w + 2, h + 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
const vgrad = (ctx, h, a, b, y0 = 0) => {
  const g = ctx.createLinearGradient(0, y0, 0, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
};

/** Kersiebloeisels: Mount Fuji, its snowcap, soft hills in front. */
function drawFuji(ctx, w, h) {
  ridge(ctx, w, h, [[0, 0.8], [0.15, 0.74], [0.3, 0.8], [0.45, 0.76], [1, 0.82]], 'rgba(180,140,200,0.55)');
  const cx = 0.6;
  const top = 0.16;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;                       // 0..1 across the cone
    const d = Math.abs(u - 0.5) * 2;        // 0 at the top, 1 at the foot
    const x = cx - 0.5 + u * 1.0;
    const y = top + (1 - top) * Math.pow(d, 0.62) * (d < 0.08 ? 0.6 + d * 5 : 1);
    pts.push([x, Math.min(0.98, d < 0.06 ? top : y)]);
  }
  ridge(ctx, w, h, pts, vgrad(ctx, h, '#8f84c4', '#6b5e9e', top * h));
  // the snowcap with a ragged lower edge
  ctx.save();
  ctx.beginPath();
  ctx.moveTo((cx - 0.06) * w, top * h);
  ctx.lineTo((cx + 0.06) * w, top * h);
  const snowEdge = [[0.21, 0.36], [0.17, 0.42], [0.13, 0.37], [0.09, 0.44], [0.05, 0.39], [0, 0.46], [-0.05, 0.39], [-0.09, 0.45], [-0.13, 0.38], [-0.17, 0.43], [-0.21, 0.36]];
  for (const [dx, y] of snowEdge) ctx.lineTo((cx + dx) * w, y * h);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, h * 0.45, '#ffffff', '#e8e3f7', top * h);
  ctx.fill();
  ctx.restore();
  // the near hills
  ridge(ctx, w, h, [[0, 0.86], [0.12, 0.8], [0.26, 0.86], [0.42, 0.83], [0.6, 0.9], [0.8, 0.84], [1, 0.88]], '#a77fb8');
}

/** Lekkergoed: gumdrop hills with sprinkles, lollipops and candy canes. */
function drawCandyLand(ctx, w, h) {
  const r = seeded(31);
  const hill = (cx, cy, rx, ry, c1, c2) => {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx * w, cy * h, rx * w, ry * h, 0, Math.PI, TAU);
    ctx.lineTo((cx + rx) * w, h + 2);
    ctx.lineTo((cx - rx) * w, h + 2);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, h, c1, c2, (cy - ry) * h);
    ctx.fill();
    ctx.clip();
    for (let k = 0; k < 26; k++) {
      ctx.fillStyle = ['#ffffff', '#fff27a', '#ff6fae', '#6fd8ff'][k % 4];
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse((cx + (r() - 0.5) * rx * 2) * w, (cy - ry + r() * ry * 1.6) * h, 4, 1.8, r() * Math.PI, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };
  hill(0.12, 0.66, 0.2, 0.3, '#b9a6ff', '#9a84f0');
  hill(0.72, 0.6, 0.26, 0.36, '#ffb3d9', '#f28cc0');
  hill(0.42, 0.74, 0.22, 0.22, '#8ee6c9', '#5ccfac');
  hill(0.95, 0.76, 0.16, 0.2, '#ffd89a', '#f5b75e');
  const lolly = (x, base, top, rad, colors) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x * w - 2.5, top * h, 5, (base - top) * h);
    ctx.save();
    ctx.translate(x * w, top * h);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, rad, (i / 12) * TAU, ((i + 1) / 12) * TAU);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let a = 0; a < TAU * 2.2; a += 0.15) ctx.lineTo(Math.cos(a) * a * rad * 0.07, Math.sin(a) * a * rad * 0.07);
    ctx.stroke();
    ctx.restore();
  };
  lolly(0.3, 0.88, 0.56, 22, ['#ff5fa2', '#ffffff']);
  lolly(0.55, 0.9, 0.5, 28, ['#46c8ff', '#fff27a']);
  lolly(0.86, 0.92, 0.62, 18, ['#8a5cff', '#ffffff']);
  const cane = (x, base, top) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x * w, base * h);
    ctx.lineTo(x * w, top * h);
    ctx.arc(x * w + 12, top * h, 12, Math.PI, 0);
    ctx.stroke();
    ctx.setLineDash([6, 7]);
    ctx.strokeStyle = '#ff3b5c';
    ctx.stroke();
    ctx.restore();
  };
  cane(0.06, 0.92, 0.66);
  cane(0.66, 0.94, 0.7);
}

/** Sonsondergang: the bushveld at dusk, flat-topped acacias and a giraffe against the sky. */
function drawSavanna(ctx, w, h) {
  ridge(ctx, w, h, [[0, 0.7], [0.1, 0.66], [0.2, 0.68], [0.28, 0.6], [0.4, 0.6], [0.46, 0.68], [0.7, 0.66], [0.78, 0.58], [0.9, 0.58], [1, 0.66]], 'rgba(120,50,90,0.55)');
  ridge(ctx, w, h, [[0, 0.84], [0.3, 0.8], [0.6, 0.84], [1, 0.8]], '#4a2140');
  ctx.fillStyle = '#3a1834';
  const acacia = (x, base, hgt, span) => {
    ctx.save();
    ctx.translate(x * w, base * h);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#3a1834';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-4, -hgt * 0.5, -10, -hgt * 0.9);
    ctx.moveTo(-2, -hgt * 0.45);
    ctx.quadraticCurveTo(8, -hgt * 0.7, 14, -hgt * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -hgt, span, hgt * 0.16, 0, 0, TAU);
    ctx.ellipse(-span * 0.35, -hgt * 1.04, span * 0.6, hgt * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  };
  acacia(0.12, 0.83, 64, 46);
  acacia(0.36, 0.81, 48, 34);
  acacia(0.83, 0.82, 70, 52);
  // a giraffe browsing by the last tree: long legs, a sloping back, the long neck up into the branches
  ctx.save();
  ctx.translate(0.7 * w, 0.825 * h);
  ctx.fillStyle = '#3a1834';
  ctx.strokeStyle = '#3a1834';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.5;
  for (const [x0, x1] of [[-16, -18], [-9, -8], [9, 11], [15, 17]]) {
    ctx.beginPath();
    ctx.moveTo(x0, -40);
    ctx.lineTo(x1, 0);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-20, -40);
  ctx.quadraticCurveTo(-4, -52, 20, -56);
  ctx.lineTo(22, -44);
  ctx.quadraticCurveTo(0, -36, -20, -36);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(16, -52);
  ctx.quadraticCurveTo(26, -84, 34, -112);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(39, -114, 10, 5, -0.25, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(33, -117);
  ctx.lineTo(31, -125);
  ctx.moveTo(37, -118);
  ctx.lineTo(36, -126);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-20, -40);
  ctx.quadraticCurveTo(-27, -34, -25, -24);
  ctx.stroke();
  ctx.restore();
}

/** Sterrenag: dark hills by the sea with a lighthouse, its lamp lit. */
function drawLighthouseCoast(ctx, w, h) {
  ridge(ctx, w, h, [[0, 0.72], [0.12, 0.66], [0.25, 0.7], [0.4, 0.62], [0.55, 0.68], [0.68, 0.6], [0.8, 0.52], [0.88, 0.55], [1, 0.62]], '#1c2a52');
  ridge(ctx, w, h, [[0, 0.86], [0.2, 0.82], [0.4, 0.86], [0.6, 0.8], [0.75, 0.72], [0.86, 0.7], [1, 0.76]], '#121d3d');
  // the lighthouse on the headland
  const x = 0.86 * w;
  const base = 0.7 * h;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - 14, base);
  ctx.lineTo(x - 9, base - 92);
  ctx.lineTo(x + 9, base - 92);
  ctx.lineTo(x + 14, base);
  ctx.closePath();
  ctx.clip();
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#d8263a' : '#f2f2f7';
    ctx.fillRect(x - 16, base - 92 + i * 16, 32, 16);
  }
  ctx.restore();
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x - 12, base - 98, 24, 6);
  const lamp = ctx.createRadialGradient(x, base - 106, 0, x, base - 106, 26);
  lamp.addColorStop(0, 'rgba(255,248,200,1)');
  lamp.addColorStop(0.3, 'rgba(255,230,140,0.8)');
  lamp.addColorStop(1, 'rgba(255,230,140,0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(x - 26, base - 132, 52, 52);
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(x - 6, base - 112, 12, 12);
  ctx.fillStyle = '#2a2a3a';
  ctx.beginPath();
  ctx.moveTo(x - 9, base - 112);
  ctx.lineTo(x, base - 122);
  ctx.lineTo(x + 9, base - 112);
  ctx.fill();
  // a soft beam out over the sea
  const beam = ctx.createLinearGradient(x, 0, x - w * 0.5, 0);
  beam.addColorStop(0, 'rgba(255,240,170,0.38)');
  beam.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(x - 4, base - 106);
  ctx.lineTo(x - w * 0.55, base - 150);
  ctx.lineTo(x - w * 0.55, base - 70);
  ctx.closePath();
  ctx.fill();
}

/** Noorderlig: snowy peaks and a dark pine forest with snow on its tips. */
function drawNordic(ctx, w, h) {
  const peaks = [[0, 0.62], [0.1, 0.4], [0.18, 0.55], [0.3, 0.3], [0.42, 0.52], [0.52, 0.42], [0.64, 0.58], [0.76, 0.34], [0.88, 0.5], [1, 0.44]];
  ridge(ctx, w, h, peaks, vgrad(ctx, h, '#3c5770', '#1d2f42', 0.3 * h));
  // snow on the peaks
  ctx.fillStyle = 'rgba(235,245,255,0.92)';
  for (let i = 1; i < peaks.length - 1; i++) {
    const [px, py] = peaks[i];
    if (py > 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(px * w, py * h);
    ctx.lineTo((px - 0.045) * w, (py + 0.12) * h);
    ctx.lineTo((px - 0.015) * w, (py + 0.09) * h);
    ctx.lineTo(px * w, (py + 0.13) * h);
    ctx.lineTo((px + 0.02) * w, (py + 0.09) * h);
    ctx.lineTo((px + 0.05) * w, (py + 0.12) * h);
    ctx.closePath();
    ctx.fill();
  }
  // the forest
  const r = seeded(17);
  for (let x = -10; x < w + 10; x += 13 + r() * 9) {
    const th = 40 + r() * 46;
    const base = h * (0.94 + r() * 0.06);
    ctx.fillStyle = '#0d1a24';
    ctx.beginPath();
    ctx.moveTo(x, base - th);
    ctx.lineTo(x - th * 0.26, base);
    ctx.lineTo(x + th * 0.26, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(230,242,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(x, base - th);
    ctx.lineTo(x - th * 0.07, base - th * 0.78);
    ctx.lineTo(x + th * 0.07, base - th * 0.78);
    ctx.closePath();
    ctx.fill();
  }
}

/** Diep ruimte: an alien moonscape with craters and sharp rocks. */
function drawMoonscape(ctx, w, h) {
  ridge(ctx, w, h, [[0, 0.7], [0.08, 0.6], [0.14, 0.62], [0.2, 0.5], [0.24, 0.52], [0.3, 0.66], [0.5, 0.64], [0.58, 0.56], [0.62, 0.57], [0.7, 0.68], [0.85, 0.6], [0.9, 0.48], [0.94, 0.5], [1, 0.62]], vgrad(ctx, h, '#4b3a73', '#241a3d', 0.48 * h));
  ridge(ctx, w, h, [[0, 0.84], [0.25, 0.8], [0.5, 0.86], [0.75, 0.8], [1, 0.84]], '#1a1230');
  const r = seeded(41);
  for (let k = 0; k < 9; k++) {
    const cx = r() * w;
    const cy = h * (0.88 + r() * 0.1);
    const rx = 10 + r() * 22;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, rx * 0.28, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,140,220,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 1, rx, rx * 0.28, 0, Math.PI * 1.05, TAU * 0.98);
    ctx.stroke();
  }
  // a rim light along the far ridge
  ctx.strokeStyle = 'rgba(190,150,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [x, y] of [[0, 0.7], [0.08, 0.6], [0.14, 0.62], [0.2, 0.5], [0.24, 0.52], [0.3, 0.66]]) ctx.lineTo(x * w, y * h);
  ctx.stroke();
}

/** Retro-neon: wireframe mountains, dark inside, glowing pink and cyan edges. */
function drawWireMountains(ctx, w, h) {
  const peaks = [[0, 0.7], [0.1, 0.5], [0.2, 0.66], [0.32, 0.36], [0.46, 0.64], [0.6, 0.42], [0.74, 0.62], [0.86, 0.4], [1, 0.6]];
  ridge(ctx, w, h, peaks, vgrad(ctx, h, '#2a0b4a', '#120326', 0.36 * h));
  ctx.lineJoin = 'round';
  const edge = (col, lw, blur) => {
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (const [x, y] of peaks) ctx.lineTo(x * w, y * h);
    ctx.stroke();
    ctx.restore();
  };
  edge('#ff3fa4', 3, 10);
  // the wireframe: lines from each peak down its flanks
  ctx.strokeStyle = 'rgba(41,240,255,0.55)';
  ctx.lineWidth = 1.2;
  for (let i = 1; i < peaks.length - 1; i++) {
    const [px, py] = peaks[i];
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(px * w, py * h);
      ctx.lineTo((px + k * 0.03) * w, h);
      ctx.stroke();
    }
  }
  for (let y = 0.5; y < 1; y += 0.1) {
    ctx.strokeStyle = `rgba(41,240,255,${0.15 + (y - 0.5) * 0.6})`;
    ctx.beginPath();
    ctx.moveTo(0, y * h);
    ctx.lineTo(w, y * h);
    ctx.stroke();
  }
  // keep the lines inside the mountains
  ctx.globalCompositeOperation = 'destination-in';
  ridge(ctx, w, h, peaks.map(([x, y]) => [x, y - 0.01]), '#000');
  ctx.globalCompositeOperation = 'source-over';
  edge('#ff7ccf', 2, 0);
}

/** Each world's own land (texture key -> drawer); BG_SKINS names it as `scenery`. */
export const SCENERY = Object.freeze({
  bgs_land_fuji: drawFuji,
  bgs_land_candy: drawCandyLand,
  bgs_land_savanna: drawSavanna,
  bgs_land_lighthouse: drawLighthouseCoast,
  bgs_land_nordic: drawNordic,
  bgs_land_moon: drawMoonscape,
  bgs_land_wire: drawWireMountains,
});

export function ensureScenery(scene, key, w, h) {
  if (SCENERY[key]) canvasTexture(scene, key, w, h, SCENERY[key]);
  return SCENERY[key] ? key : null;
}
