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
  canvasTexture(scene, 'bgs_rays', 720, 700, drawLightRays);
  canvasTexture(scene, 'bgs_school', 36, 16, drawSchoolFish);
  canvasTexture(scene, 'bgs_beam', 420, 120, drawBeam);
  canvasTexture(scene, 'bgs_jelly', 60, 92, drawJelly);
  canvasTexture(scene, 'bgs_turtle', 120, 80, drawTurtle);
  canvasTexture(scene, 'bgs_whale', 300, 110, drawWhale);
  canvasTexture(scene, 'bgs_flare', 160, 160, drawFlare);
  canvasTexture(scene, 'bgs_bubble', 18, 18, drawBubble);
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
    // the aquarium: sunbeams from above, a school of fish, rising bubbles
    this.rays = scene.add.image(W / 2, 0, 'bgs_rays').setOrigin(0.5, 0).setScale(Math.max(1.1, k * 1.1)).setDepth(0.05).setBlendMode('ADD').setVisible(false);
    const rs = seeded(9);
    this.school = Array.from({ length: 9 }, (_, i) => ({ img: scene.add.image(0, 0, 'bgs_school').setDepth(0.3).setVisible(false), dx: (i % 3) * 30 + rs() * 12, dy: Math.floor(i / 3) * 18 + rs() * 8, ph: rs() * 6 }));
    this.schoolX = -200;
    // (1.15, the owner: "Its one too simple for the amount of coins") jellyfish drifting, a turtle and a far whale gliding by
    this.jellies = [[0.16, 0.3, 0.9], [0.84, 0.42, 0.75], [0.62, 0.22, 0.6]].map(([x, y, s], i) => ({ img: scene.add.image(W * x, H * y, 'bgs_jelly').setDepth(0.32).setVisible(false), x, y, s: s * Math.max(1, k), ph: i * 2.1 }));
    this.turtle = scene.add.image(-150, H * 0.46, 'bgs_turtle').setDepth(0.34).setScale(0.8 * Math.max(1, k)).setVisible(false);
    this.turtleX = -150;
    this.whale = scene.add.image(W + 400, H * 0.16, 'bgs_whale').setDepth(0.04).setScale(1.3 * Math.max(1, k)).setAlpha(0.35).setVisible(false);
    this.whaleX = W + 300;
    this.bubbles = Array.from({ length: 18 }, () => ({ img: scene.add.image(rs() * W, rs() * H, 'bgs_bubble').setDepth(3.15).setVisible(false), v: 30 + rs() * 50, ph: rs() * 6, s: 0.5 + rs() * 0.9 }));
    // the lighthouse (Sterrenag): its beam turns round, flaring when it swings past you
    this.beam = scene.add.image(0, 0, 'bgs_beam').setOrigin(0, 0.5).setDepth(0.52).setBlendMode('ADD').setVisible(false);
    this.flare = scene.add.image(0, 0, 'bgs_flare').setDepth(0.53).setBlendMode('ADD').setVisible(false);
    this.beamT = Math.PI;   // pointing left over the bay (and so it stays with "Minder beweging")
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
    on([this.rays, ...this.school.map((f) => f.img), ...this.bubbles.map((b) => b.img), ...this.jellies.map((j) => j.img), this.turtle, this.whale], id === 'akwarium');
    on([this.beam, this.flare], id === 'nag');
  }

  /** alt (m), horizon (screen y of the bay's horizon), wind (px/s²), dark (storm 0..1), reduced (no motion). */
  update(dt, { alt = 0, horizon = this.H * 0.6, wind = 0, dark = 0, reduced = false } = {}) {
    const id = this.id;
    if (!id || id === 'dag' || id === 'sonsondergang' || id === 'lekkergoed') return;
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
    } else if (id === 'nag') {
      // one turn every 7 s, seen from the side: the beam reaches left, shortens as it turns to you (the lamp flares),
      // reaches right, and shortens again as it turns away behind the tower
      if (!reduced) this.beamT += dt * (TAU / 7);
      const c = Math.cos(this.beamT);
      const toYou = Math.max(0, Math.sin(this.beamT));
      const [lx, ly] = LAMP_AT(this.landW || W, this.landH || 340);
      const y = horizon - (this.landH || 340) + ly;
      const k = Math.max(1, W / 720);
      this.beam.setPosition(lx, y).setScale(-c * 1.15 * k, (0.85 + 0.25 * Math.abs(c)) * k);
      this.beam.setAlpha(low * (0.25 + 0.75 * Math.abs(c)) * (1 - 0.35 * (1 - toYou) * (Math.sin(this.beamT) < 0 ? 1 : 0)));
      this.flare.setPosition(lx, y).setScale((0.45 + 1.1 * toYou ** 6) * k).setAlpha(low * (0.35 + 0.65 * toYou ** 4));
    } else if (id === 'akwarium') {
      this.rays.setAlpha((0.75 + 0.25 * Math.sin(t * 0.6)) * low);
      this.rays.x = W / 2 + Math.sin(t * 0.25) * 18;
      // the school glides across, slowly, and comes round again
      if (!reduced) this.schoolX += 34 * dt;
      if (this.schoolX > W + 340) this.schoolX = -220;   // (wide enough that the turtle behind them is off too)
      const sy = H * 0.34 + alt * 0.3;
      for (const f of this.school) {
        f.img.setPosition(this.schoolX + f.dx, sy + f.dy + Math.sin(t * 1.4 + f.ph) * 4).setAlpha(low).setFlipX(true);
      }
      for (const j of this.jellies) {   // a slow pulse, drifting up and down
        const p = Math.sin(t * 1.6 + j.ph);
        j.img.setPosition(W * j.x + Math.sin(t * 0.3 + j.ph) * 14, H * j.y + alt * 0.3 + Math.sin(t * 0.5 + j.ph) * 18);
        j.img.setScale(j.s * (1 + 0.06 * p), j.s * (1 - 0.08 * p)).setAlpha(0.85 * low);
      }
      // (1.15, the owner: "make the squerrel come a few seconds after the fish") the turtle follows the school, ~4 s behind
      this.turtleX = this.schoolX - 150;
      if (!reduced) {
        this.whaleX -= 12 * dt;
        if (this.whaleX < -500) this.whaleX = W + 900;
      }
      this.turtle.setPosition(this.turtleX, H * 0.47 + alt * 0.3 + Math.sin(t * 0.8) * 6).setAlpha(low).setAngle(Math.sin(t * 0.8) * 3);
      this.whale.setPosition(this.whaleX, H * 0.15 + alt * 0.2 + Math.sin(t * 0.25) * 6).setAlpha(0.32 * low);
      for (const b of this.bubbles) {
        if (!reduced) {
          b.img.y -= b.v * dt;
          b.img.x += Math.sin(t * 2 + b.ph) * 12 * dt;
          if (b.img.y < -20) {
            b.img.y = H + 20;
            b.img.x = Math.random() * W;
          }
        }
        b.img.setScale(b.s).setAlpha(0.8 * (1 - smooth(140, 260, alt)));
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
  // (1.15, the owner: "still looks off") a narrow summit with a little crater, concave slopes sweeping out to the foot
  const cx = 0.6;
  const top = 0.2;
  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const u = i / 80;                       // 0..1 across the cone
    const d = Math.abs(u - 0.5) * 2;        // 0 at the top, 1 at the foot
    const x = cx - 0.5 + u * 1.0;
    const y = d < 0.03 ? top + 0.008 * Math.sin((d / 0.03) * Math.PI) : top + (1 - top) * Math.pow((d - 0.03) / 0.97, 0.72);
    pts.push([x, Math.min(0.98, y)]);
  }
  ridge(ctx, w, h, pts, vgrad(ctx, h, '#8f84c4', '#6b5e9e', top * h));
  // the snowcap with a ragged lower edge, drawn inside the cone so it follows the slopes (1.15, the owner: "This looks
  // off": it stood out past them like a hat); tongues of snow run down the gullies
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * w, h);
  for (const [x, y] of pts) ctx.lineTo(x * w, y * h);
  ctx.lineTo(pts[pts.length - 1][0] * w, h);
  ctx.closePath();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo((cx - 0.32) * w, 0);
  ctx.lineTo((cx + 0.32) * w, 0);
  for (let i = 0; i <= 40; i++) {
    const dx = 0.2 - i * 0.01;
    const y = 0.34 + (i % 2 ? 0.045 : 0) + (i % 4 === 1 ? 0.035 : 0) + Math.abs(dx) * 0.08;
    ctx.lineTo((cx + dx) * w, y * h);
  }
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, h * 0.6, '#ffffff', '#e4def5', top * h);
  ctx.fill();
  ctx.restore();
  // the near hills
  ridge(ctx, w, h, [[0, 0.86], [0.12, 0.8], [0.26, 0.86], [0.42, 0.83], [0.6, 0.9], [0.8, 0.84], [1, 0.88]], '#a77fb8');
}

/**
 * Lekkergoed: low hazy hills far off, small gumdrop hills nearer, and a frosting shore along the water where the lollipops
 * and candy canes stand (the owner: "the candy looks like its in the sky": everything now stands on the ground).
 */
function drawCandyLand(ctx, w, h) {
  const r = seeded(31);
  const G = 0.93;   // the frosting shore's top (of h); the candy stands on it
  // far hills: low, soft, hazy
  ridge(ctx, w, h, [[0, 0.74], [0.12, 0.62], [0.26, 0.7], [0.4, 0.6], [0.55, 0.68], [0.7, 0.58], [0.86, 0.66], [1, 0.6]], 'rgba(205,190,255,0.75)');
  ridge(ctx, w, h, [[0, 0.8], [0.18, 0.72], [0.34, 0.79], [0.5, 0.71], [0.66, 0.78], [0.82, 0.7], [1, 0.77]], 'rgba(255,200,228,0.85)');
  // gumdrop hills nearer, with sprinkles
  const drop = (cx, rx, top, c1, c2) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo((cx - rx) * w, G * h + 2);
    ctx.bezierCurveTo((cx - rx) * w, top * h, (cx + rx) * w, top * h, (cx + rx) * w, G * h + 2);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, G * h, c1, c2, top * h);
    ctx.fill();
    ctx.clip();
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = ['#ffffff', '#fff27a', '#ff6fae', '#6fd8ff'][k % 4];
      ctx.beginPath();
      ctx.ellipse((cx + (r() - 0.5) * rx * 1.6) * w, (top + 0.04 + r() * (G - top - 0.06)) * h, 3.6, 1.6, r() * Math.PI, 0, TAU);
      ctx.fill();
    }
    // a soft highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse((cx - rx * 0.35) * w, (top + 0.08) * h, rx * w * 0.22, 6, -0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  };
  drop(0.1, 0.14, 0.7, '#8ee6c9', '#4fc7a3');
  drop(0.36, 0.11, 0.76, '#ffb3d9', '#ee82b8');
  drop(0.62, 0.15, 0.68, '#c8b3ff', '#9a80ee');
  drop(0.9, 0.12, 0.74, '#ffd89a', '#f2b05a');
  // the frosting shore: a pastel band with a wavy white icing edge
  ctx.fillStyle = vgrad(ctx, h, '#ffc6e2', '#ff9ccb', G * h);
  ctx.fillRect(0, G * h, w, h - G * h + 2);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, G * h);
  for (let x = 0; x <= w + 20; x += 20) {
    ctx.quadraticCurveTo(x + 10, G * h + 9 + (x % 40 ? 3 : 0), x + 20, G * h);
  }
  ctx.lineTo(w + 20, G * h - 4);
  ctx.lineTo(0, G * h - 4);
  ctx.closePath();
  ctx.fill();
  // lollipops and candy canes planted in the frosting
  const lolly = (x, hgt, rad, colors) => {
    const base = G * h + 4;
    const top = base - hgt;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x * w - 2.5, top, 5, hgt);
    ctx.save();
    ctx.translate(x * w, top);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, rad, (i / 12) * TAU, ((i + 1) / 12) * TAU);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, TAU);
    ctx.stroke();
    ctx.restore();
  };
  const cane = (x, hgt) => {
    const base = G * h + 4;
    const top = base - hgt;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x * w, base);
    ctx.lineTo(x * w, top);
    ctx.arc(x * w + 11, top, 11, Math.PI, 0);
    ctx.stroke();
    ctx.setLineDash([6, 7]);
    ctx.strokeStyle = '#ff3b5c';
    ctx.stroke();
    ctx.restore();
  };
  lolly(0.22, 74, 18, ['#ff5fa2', '#ffffff']);
  cane(0.05, 56);
  lolly(0.5, 92, 22, ['#46c8ff', '#fff27a']);
  cane(0.72, 62);
  lolly(0.83, 64, 15, ['#8a5cff', '#ffffff']);
}

/** Sonsondergang ("Safari"): the bushveld at dusk, flat-topped acacias, an elephant and a giraffe against the sky. */
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
  // (1.15, the owner: "add one more animal and make it say Safari") an elephant walking between the first trees, trunk down
  ctx.save();
  ctx.translate(0.245 * w, 0.835 * h);
  ctx.fillStyle = '#3a1834';
  ctx.strokeStyle = '#3a1834';
  ctx.lineCap = 'round';
  for (const [x, lift] of [[-17, 0], [-8, 2], [8, 1], [16, 0]]) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - 3.6, -24, 7.2, 24 - lift, 2.5) : ctx.rect(x - 3.6, -24, 7.2, 24 - lift);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(-1, -31, 24, 15, -0.04, 0, TAU);   // the body, a little higher at the shoulders
  ctx.ellipse(-6, -38, 15, 9, -0.1, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(24, -35, 10.5, 0, TAU);                // the head
  ctx.fill();
  ctx.lineWidth = 6.5;                           // the trunk, swinging down and curling forward
  ctx.beginPath();
  ctx.moveTo(31, -31);
  ctx.quadraticCurveTo(37, -18, 33, -6);
  ctx.quadraticCurveTo(32, -2, 36, -2);
  ctx.stroke();
  ctx.fillStyle = '#5a2a52';                     // the big ear, a shade lighter
  ctx.beginPath();
  ctx.ellipse(17, -33, 7.5, 11, 0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#e9d3bd';                   // a tusk catching the last light
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(30, -27);
  ctx.quadraticCurveTo(35, -22, 39, -24);
  ctx.stroke();
  ctx.strokeStyle = '#3a1834';                   // the tail
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-24, -34);
  ctx.quadraticCurveTo(-29, -28, -27, -19);
  ctx.stroke();
  ctx.restore();
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
  // (1.15, the owner: "Please make the lighthouse have more movement ... The light specifiaclly") its beam turns: SkinLayers
}
/** Where the lighthouse's lamp is in its land texture (w x h): the turning beam starts there. */
export const LAMP_AT = (w, h) => [0.86 * w, 0.7 * h - 106];

/** The lighthouse's beam: a cone of light from the lamp (left middle) to the right, fading out. */
function drawBeam(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,244,190,0.75)');
  g.addColorStop(0.35, 'rgba(255,236,160,0.32)');
  g.addColorStop(1, 'rgba(255,236,160,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, h / 2 - 3);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h / 2 + 3);
  ctx.closePath();
  ctx.fill();
}
/** The lamp's flare (when the beam swings round towards you). */
function drawFlare(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(0.18, 'rgba(255,240,170,0.75)');
  g.addColorStop(0.5, 'rgba(255,220,120,0.18)');
  g.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,250,220,0.55)';   // a thin horizontal streak
  ctx.fillRect(0, h / 2 - 1.5, w, 3);
}

/** Noorderlig: snowy peaks and a dark pine forest with snow on its tips. */
function drawNordic(ctx, w, h) {
  // (1.15, the owner: "The mountains looks off", then "Still doesnt feel right, the mountains...") real peaks: each mountain
  // a triangle with a lit left face and a shaded right face, its snow following both slopes down to a ragged edge; a hazy
  // far range behind, the main range in front
  const mountain = (cx, peak, half, lit, dark, snow, depth) => {
    const X = cx * w;
    const Y = peak * h;
    const L = (cx - half) * w;
    const R = (cx + half) * w;
    const B = h + 2;
    const ridgeX = X + half * w * 0.12;   // where the two faces meet at the foot
    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.moveTo(L, B);
    ctx.lineTo(X, Y);
    ctx.lineTo(ridgeX, B);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(R, B);
    ctx.lineTo(ridgeX, B);
    ctx.closePath();
    ctx.fill();
    // the snow: down each slope to `depth` of the height, a ragged lower edge (lit and shaded like the rock)
    const at = (f, side) => [X + (side < 0 ? L - X : R - X) * f, Y + (B - Y) * f];
    const [lx, ly] = at(depth, -1);
    const [rx, ry] = at(depth * 0.92, 1);
    const mx = X + (ridgeX - X) * depth;
    const my = Y + (B - Y) * depth;
    const jag = (x0, y0, x1, y1, n, amp) => {
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        ctx.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f + (k % 2 ? amp : -amp * 0.4));
      }
    };
    ctx.fillStyle = snow[0];
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(lx, ly);
    jag(lx, ly, mx, my, 4, (B - Y) * depth * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = snow[1];
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(mx, my);
    jag(mx, my, rx, ry, 4, (B - Y) * depth * 0.16);
    ctx.closePath();
    ctx.fill();
  };
  // the far range: hazy blue
  for (const [cx, pk, hf] of [[0.04, 0.5, 0.16], [0.24, 0.42, 0.18], [0.46, 0.48, 0.17], [0.66, 0.4, 0.19], [0.9, 0.46, 0.18]]) {
    mountain(cx, pk, hf, '#5d7894', '#425a75', ['rgba(226,238,250,0.85)', 'rgba(186,204,224,0.85)'], 0.26);
  }
  // the main range
  for (const [cx, pk, hf] of [[0.13, 0.36, 0.2], [0.36, 0.5, 0.17], [0.55, 0.3, 0.22], [0.8, 0.42, 0.2], [1.02, 0.52, 0.16]]) {
    mountain(cx, pk, hf, '#53708e', '#2c405a', ['#f4f9ff', '#c4d4e6'], 0.3);
  }
  // a dark shoreline at the foot
  ridge(ctx, w, h, [[0, 0.95], [0.2, 0.93], [0.45, 0.955], [0.7, 0.935], [1, 0.95]], '#1b2a3d');
}

/** Diep ruimte: no land at all (1.15). */
function drawMoonscape() {
  // (1.15, the owner: "The stuff that looks like mountains in the deep space, please remove it") open space down to the
  // water: the nebula, the planet and the stars have the sky to themselves
}

/** Retro-neon: wireframe mountains, dark inside, glowing pink and cyan edges. */
function drawWireMountains(ctx, w, h) {
  // (1.15, the owner: "The lights on the mountains looks off", then "The mountens looks off") low, uneven ranges under the
  // sun: dark silhouettes, a thin neon rim on each (cyan far, pink near), no lines inside
  const r = seeded(77);
  const range = (keys, jag) => {
    const pts = [];
    for (let k = 0; k < keys.length - 1; k++) {
      const [x0, y0] = keys[k];
      const [x1, y1] = keys[k + 1];
      for (let s = 0; s < 4; s++) {
        const f = s / 4;
        pts.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f + (s ? (r() - 0.5) * jag : 0)]);
      }
    }
    pts.push(keys[keys.length - 1]);
    return pts;
  };
  const rim = (pts, col, lw, blur) => {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.shadowColor = col;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.stroke();
    ctx.restore();
  };
  const far = range([[0, 0.62], [0.1, 0.52], [0.2, 0.44], [0.3, 0.56], [0.42, 0.6], [0.56, 0.58], [0.68, 0.5], [0.8, 0.42], [0.9, 0.53], [1, 0.58]], 0.035);
  ridge(ctx, w, h, far, vgrad(ctx, h, '#4a1670', '#22093f', 0.42 * h));
  rim(far, 'rgba(80,235,255,0.85)', 1.6, 6);
  const near = range([[0, 0.76], [0.12, 0.68], [0.26, 0.74], [0.36, 0.64], [0.48, 0.73], [0.6, 0.7], [0.72, 0.62], [0.84, 0.72], [1, 0.68]], 0.03);
  ridge(ctx, w, h, near, vgrad(ctx, h, '#2a0b4a', '#0e0320', 0.62 * h));
  rim(near, 'rgba(255,79,180,0.95)', 2, 9);
}

/** (1.15, the owner: "also make a accerium background") the aquarium's floor: rocks, corals and swaying weed (drawn still). */
function drawReef(ctx, w, h) {
  const r = seeded(53);
  ridge(ctx, w, h, [[0, 0.82], [0.15, 0.76], [0.3, 0.8], [0.5, 0.74], [0.7, 0.79], [0.85, 0.73], [1, 0.78]], 'rgba(10,80,100,0.6)');
  // sea grass
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    const x = r() * w;
    const hh = 30 + r() * 70;
    ctx.strokeStyle = r() < 0.5 ? '#2fae7a' : '#1f8f63';
    ctx.lineWidth = 3 + r() * 3;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.bezierCurveTo(x + 10, h - hh * 0.3, x - 10, h - hh * 0.6, x + 4, h - hh);
    ctx.stroke();
  }
  // corals: branching pink and orange, round purple brain corals, tube corals
  const branch = (x, y, len, a, wd, col, depth) => {
    if (depth <= 0 || len < 4) return;
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    ctx.strokeStyle = col;
    ctx.lineWidth = wd;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    branch(x2, y2, len * 0.72, a - 0.45 - r() * 0.2, wd * 0.75, col, depth - 1);
    branch(x2, y2, len * 0.72, a + 0.45 + r() * 0.2, wd * 0.75, col, depth - 1);
  };
  branch(w * 0.12, h, 34, -Math.PI / 2, 9, '#ff6f91', 5);
  branch(w * 0.63, h, 38, -Math.PI / 2, 10, '#ff9a3c', 5);
  branch(w * 0.9, h, 28, -Math.PI / 2, 8, '#ff6f91', 4);
  const brain = (x, rad, c1, c2) => {
    const g = ctx.createRadialGradient(x - rad * 0.3, h - rad * 0.9, 2, x, h - rad * 0.5, rad);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, h, rad, rad * 0.9, 0, Math.PI, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let k = 1; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(x, h, rad * (k / 4), rad * 0.9 * (k / 4), 0, Math.PI, TAU);
      ctx.stroke();
    }
  };
  brain(w * 0.32, 30, '#c18bff', '#6a3fb8');
  brain(w * 0.8, 24, '#7fe0ff', '#2a8fb8');
  for (const [x, n, col] of [[0.44, 4, '#ffd23f'], [0.5, 3, '#ff8fb8']]) {
    for (let k = 0; k < n; k++) {
      const tx = x * w + k * 9;
      const th = 26 + r() * 30;
      ctx.fillStyle = col;
      ctx.fillRect(tx - 3, h - th, 7, th);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(tx + 0.5, h - th, 3.5, 1.6, 0, 0, TAU);
      ctx.fill();
    }
  }
  // (1.15, the owner: "Its one too simple for the amount of coins") a sunken treasure chest, lid ajar and gold glowing
  // inside, a few coins spilled; an old anchor half in the sand. Up on the reef's slope, clear of the foundation and the rocks
  ctx.save();
  ctx.translate(0, -h * 0.215);   // standing on the back ridge of the reef
  const cx = w * 0.37;
  const glow = ctx.createRadialGradient(cx, h - 26, 2, cx, h - 26, 40);
  glow.addColorStop(0, 'rgba(255,224,110,0.75)');
  glow.addColorStop(1, 'rgba(255,224,110,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 40, h - 66, 80, 66);
  ctx.fillStyle = '#5a3416';
  ctx.fillRect(cx - 22, h - 22, 44, 22);                       // the box
  ctx.fillStyle = '#7a4a22';
  ctx.fillRect(cx - 20, h - 20, 40, 18);
  ctx.save();                                                // the lid, tipped open
  ctx.translate(cx - 22, h - 22);
  ctx.rotate(-0.38);
  ctx.fillStyle = '#6b3f1c';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(44, 0);
  ctx.quadraticCurveTo(44, -14, 22, -16);
  ctx.quadraticCurveTo(0, -14, 0, 0);
  ctx.fill();
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(6, -13, 4, 13);
  ctx.fillRect(34, -13, 4, 13);
  ctx.restore();
  ctx.fillStyle = '#ffd84d';                                 // the gold heaped inside
  ctx.beginPath();
  ctx.ellipse(cx, h - 22, 18, 6, 0, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = '#f2c230';                                 // the bands and the lock
  ctx.fillRect(cx - 16, h - 22, 4, 22);
  ctx.fillRect(cx + 12, h - 22, 4, 22);
  ctx.fillRect(cx - 3, h - 16, 6, 7);
  for (const [dx, dy] of [[28, -3], [34, -2], [31, -6], [-30, -2]]) {   // spilled coins
    ctx.fillStyle = '#ffd84d';
    ctx.beginPath();
    ctx.ellipse(cx + dx, h + dy, 4, 2.4, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.save();                                                // the anchor
  ctx.translate(w * 0.56, h - 4);
  ctx.rotate(0.35);
  ctx.strokeStyle = '#3b4a55';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -46);
  ctx.moveTo(-12, -38);
  ctx.lineTo(12, -38);
  ctx.moveTo(-16, -8);
  ctx.quadraticCurveTo(0, 8, 16, -8);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -51, 5, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawLightRays(ctx, w, h) {
  ctx.globalCompositeOperation = 'lighter';
  // (1.15, the owner: "Make the lights signing downwards a little lighter") the surface glows, and the rays shine brighter
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.35);
  top.addColorStop(0, 'rgba(200,255,250,0.22)');
  top.addColorStop(1, 'rgba(200,255,250,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.35);
  const r = seeded(61);
  for (let k = 0; k < 7; k++) {
    const x = (0.05 + k * 0.15 + (r() - 0.5) * 0.05) * w;
    const wd = 26 + r() * 40;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(230,255,252,0.5)');
    g.addColorStop(0.6, 'rgba(220,255,250,0.16)');
    g.addColorStop(1, 'rgba(220,255,250,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + wd, 0);
    ctx.lineTo(x + wd * 2.4 - 60, h);
    ctx.lineTo(x - 60, h);
    ctx.closePath();
    ctx.fill();
  }
}

/** (1.15) a jellyfish: a glowing translucent bell, a scalloped rim, wavy tentacles. */
function drawJelly(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, 22, 2, w / 2, 26, 26);
  g.addColorStop(0, 'rgba(255,220,245,0.95)');
  g.addColorStop(0.6, 'rgba(255,140,215,0.7)');
  g.addColorStop(1, 'rgba(170,90,255,0.45)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(w / 2, 30, 24, 22, 0, Math.PI, TAU);
  for (let k = 0; k <= 6; k++) ctx.quadraticCurveTo(w / 2 + 24 - k * 8 + 4, 36, w / 2 + 24 - k * 8, 30);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,185,235,0.6)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const x = w / 2 - 16 + k * 8;
    ctx.lineWidth = k % 2 ? 1.6 : 2.4;
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.bezierCurveTo(x - 6, 48, x + 6, 62, x - 2, h - 4 - (k % 2) * 10);
    ctx.stroke();
  }
}
/** (1.15) a sea turtle seen from the side, facing right. */
function drawTurtle(ctx, w, h) {
  ctx.fillStyle = '#6fb36a';
  for (const [x, y, rx, ry, a] of [[78, 60, 16, 6, 0.6], [30, 60, 12, 5, -0.5], [76, 22, 18, 6, -0.6]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, a, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(100, 40, 10, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1d2b20';
  ctx.beginPath();
  ctx.arc(104, 37, 2, 0, TAU);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 18, 0, 62);
  g.addColorStop(0, '#5a8f3c');
  g.addColorStop(1, '#2f5a2a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(55, 42, 36, 22, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,230,150,0.55)';
  ctx.lineWidth = 2;
  for (const [x, y] of [[40, 34], [56, 30], [72, 34], [48, 48], [64, 48]]) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      ctx.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 6);
    }
    ctx.closePath();
    ctx.stroke();
  }
}
/** (1.15) a whale far off: a dark silhouette facing left, its tail up. */
function drawWhale(ctx, w, h) {
  ctx.fillStyle = 'rgba(4,46,66,0.95)';
  ctx.beginPath();
  ctx.moveTo(10, 58);
  ctx.bezierCurveTo(10, 24, 90, 18, 160, 34);
  ctx.bezierCurveTo(210, 44, 240, 52, 262, 46);
  ctx.lineTo(296, 22);
  ctx.lineTo(288, 52);
  ctx.lineTo(298, 82);
  ctx.lineTo(262, 62);
  ctx.bezierCurveTo(220, 76, 150, 92, 80, 86);
  ctx.bezierCurveTo(30, 82, 10, 74, 10, 58);
  ctx.fill();
  ctx.beginPath();                                            // the flipper
  ctx.moveTo(90, 80);
  ctx.quadraticCurveTo(110, 104, 130, 102);
  ctx.quadraticCurveTo(116, 90, 112, 82);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,200,220,0.25)';                 // the throat grooves
  ctx.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(24, 66 + k * 4);
    ctx.quadraticCurveTo(70, 80 + k * 3, 120, 80 + k * 3);
    ctx.stroke();
  }
}

function drawSchoolFish(ctx, w, h) {
  ctx.fillStyle = 'rgba(8,60,80,0.55)';
  ctx.beginPath();
  ctx.ellipse(w * 0.42, h / 2, w * 0.36, h * 0.32, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.74, h / 2);
  ctx.lineTo(w * 0.98, h * 0.12);
  ctx.lineTo(w * 0.98, h * 0.88);
  ctx.closePath();
  ctx.fill();
}

function drawBubble(ctx, w, h) {
  ctx.strokeStyle = 'rgba(230,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 1.5, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(w * 0.38, h * 0.36, w * 0.12, 0, TAU);
  ctx.fill();
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
  bgs_land_reef: drawReef,
});

export function ensureScenery(scene, key, w, h) {
  if (SCENERY[key]) canvasTexture(scene, key, w, h, SCENERY[key]);
  return SCENERY[key] ? key : null;
}
