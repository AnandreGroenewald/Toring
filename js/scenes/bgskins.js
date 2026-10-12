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

export function ensureSkinTextures(scene) {
  canvasTexture(scene, 'bgs_synth_sun', 320, 320, drawSynthSun);
  canvasTexture(scene, 'bgs_grid', 720, 360, drawGridLines);
  canvasTexture(scene, 'bgs_grid_row', 256, 8, drawGridRow);
  canvasTexture(scene, 'bgs_aurora_0', 720, 380, (ctx, w, h) => drawAurora(ctx, w, h, 11));
  canvasTexture(scene, 'bgs_aurora_1', 720, 380, (ctx, w, h) => drawAurora(ctx, w, h, 29));
  canvasTexture(scene, 'bgs_nebula', 720, 720, drawNebula);
  canvasTexture(scene, 'bgs_planet', 300, 220, drawPlanet);
  canvasTexture(scene, 'bgs_petal', 24, 16, drawPetal);
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
    // cherry blossom
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
