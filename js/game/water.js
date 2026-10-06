// The rising flood (vloed): translucent cartoon sea in world space, drawn above
// the tower so submerged blocks look underwater. Only objects move per frame.
import { DEPTH, GAME_W, WATER } from '../config.js';
import { canvasTexture, ensureFxTextures, clamp, lerpColor } from './effects.js';

const SPAN_SIDE = 4000;        // extend this far beyond the play width (camera zoom 0.25 at game over)
const DEPTH_PX = 6000;         // and this far down
const WAVE_H = 64;             // wave strip texture height (POT for TileSprite wrapping)
const WAVE_MEAN = 24;          // texture row of the mean water level in the wave strip
const STRIP_H = WAVE_H - 2;    // rows 1..62 shown: guard rows avoid GL_REPEAT bleeding
const BODY_H = 900;            // gradient part of the water body below the wave strip
const TS_W = 1024;             // TileSprites are kept small and scaled (their canvas is width × height)

// Water colours (r, g, b, a). The wave strip ends exactly in TOP so the seam is invisible.
const TOP = [52, 148, 222, 0.7];
const MID = [30, 110, 190, 0.8];
const DEEP = [14, 64, 124, 0.87];
const rgba = ([r, g, b, a], aMul = 1) => `rgba(${r},${g},${b},${a * aMul})`;
const DEEP_HEX = (DEEP[0] << 16) | (DEEP[1] << 8) | DEEP[2];

function waveY(x, w, phase, amp) {
  const t = (x / w) * Math.PI * 2;
  return amp * (0.72 * Math.sin(2 * t + phase) + 0.28 * Math.sin(5 * t + phase * 2.3));
}

function ensureWaterTextures(scene) {
  ensureFxTextures(scene);
  // Front wave: light crest + foam line, fading into the body colour.
  canvasTexture(scene, 'water_wave', 256, WAVE_H, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, WAVE_MEAN - 8, 0, h - 1);
    grad.addColorStop(0, 'rgba(150,215,250,0.86)');
    grad.addColorStop(0.35, 'rgba(96,184,240,0.78)');
    grad.addColorStop(1, rgba(TOP));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, h - 1);
    for (let x = 0; x <= w; x += 2) ctx.lineTo(x, WAVE_MEAN + waveY(x, w, 0, 7));
    ctx.lineTo(w, h - 1);
    ctx.closePath();
    ctx.fill();
    // last rows exactly the body colour (clear first: painting alpha over alpha would darken them)
    ctx.clearRect(0, h - 3, w, 3);
    ctx.fillStyle = rgba(TOP);
    ctx.fillRect(0, h - 3, w, 3);
    ctx.clearRect(0, 0, w, 1);
    // soft lighter band under the foam
    ctx.strokeStyle = 'rgba(210,240,255,0.45)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = -2; x <= w + 2; x += 2) ctx.lineTo(x, WAVE_MEAN + 5 + waveY(x, w, 0, 7));
    ctx.stroke();
    // foam line
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = -2; x <= w + 2; x += 2) ctx.lineTo(x, WAVE_MEAN + 0.5 + waveY(x, w, 0, 7));
    ctx.stroke();
    // foam bubbles near the crests (deterministic positions so it tiles)
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 18; i++) {
      const x = (i * 53.7) % w;
      const y = WAVE_MEAN + 5 + waveY(x, w, 0, 7) + ((i * 7) % 9);
      const r = 0.9 + ((i * 13) % 5) * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  // Back wave: a second, offset swell scrolling the other way for depth.
  canvasTexture(scene, 'water_wave_b', 256, WAVE_H, (ctx, w, h) => {
    const top = WAVE_MEAN - 7;
    const grad = ctx.createLinearGradient(0, top - 7, 0, top + 26);
    grad.addColorStop(0, 'rgba(120,200,248,0.75)');
    grad.addColorStop(1, 'rgba(70,160,230,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, top + 28);
    for (let x = 0; x <= w; x += 2) ctx.lineTo(x, top + 0.8 * waveY(x, w, 2.1, 7));
    ctx.lineTo(w, top + 28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(235,250,255,0.7)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let x = -2; x <= w + 2; x += 2) ctx.lineTo(x, top + 0.8 * waveY(x, w, 2.1, 7));
    ctx.stroke();
    ctx.clearRect(0, 0, w, 1);
    ctx.clearRect(0, h - 1, w, 1);
  });
  // Body: vertical gradient, stretched; its last colour equals the deep fill. NPOT on
  // purpose: Phaser gives POT canvas textures GL_REPEAT, which bleeds the top row into the bottom edge.
  canvasTexture(scene, 'water_body', 3, 250, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, rgba(TOP));
    grad.addColorStop(0.3, rgba(MID));
    grad.addColorStop(1, rgba(DEEP));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  // Shimmer: soft light streaks just below the surface (additive).
  canvasTexture(scene, 'water_shimmer', 256, 64, (ctx, w) => {
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const x = (i * 71.3) % w;
      const y = 8 + ((i * 23) % 48);
      const len = 14 + ((i * 17) % 30);
      ctx.strokeStyle = `rgba(200,235,255,${0.25 + ((i * 7) % 5) * 0.08})`;
      ctx.lineWidth = 2 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
      if (x + len > w) {
        ctx.beginPath();
        ctx.moveTo(x - w, y);
        ctx.lineTo(x + len - w, y);
        ctx.stroke();
      }
    }
  });
  // Flood line marker: red/white dashes.
  canvasTexture(scene, 'water_flood', 64, 16, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, 4, 3, 36, 10, 5);
    ctx.fill();
    ctx.fillStyle = '#ff4f5e';
    roundRect(ctx, 6, 5, 32, 6, 3);
    ctx.fill();
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Water {
  constructor(scene, { width = GAME_W } = {}) {
    this.scene = scene;
    ensureWaterTextures(scene);
    this.startY = WATER.startOffsetPx;
    this._surfaceY = this.startY;
    this.displayY = this.startY;
    this._rising = false;
    this.tRising = 0;
    this.t = 0;
    this.destroyed = false;

    const cx = width / 2;
    const span = width + SPAN_SIDE * 2;
    const sx = span / TS_W;
    const tile = (key, h, depth) => {
      const ts = scene.add.tileSprite(cx, 0, TS_W, h, key).setOrigin(0.5, 0).setDepth(depth);
      ts.setScale(sx, 1);
      ts.setTileScale(1 / sx, 1);
      return ts;
    };
    this.back = tile('water_wave_b', WAVE_H, DEPTH.water);
    this.body = scene.add.image(cx, 0, 'water_body').setOrigin(0.5, 0)
      .setDisplaySize(span, BODY_H).setDepth(DEPTH.water + 0.1);
    this.deep = scene.add.image(cx, 0, 'fx_px').setOrigin(0.5, 0)
      .setDisplaySize(span, DEPTH_PX).setTint(DEEP_HEX)
      .setAlpha(DEEP[3]).setDepth(DEPTH.water + 0.1);
    this.shimmer = tile('water_shimmer', 64, DEPTH.water + 0.2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35);
    this.front = tile('water_wave', STRIP_H, DEPTH.water + 0.3);
    this.front.tilePositionY = 1;
    this.flood = tile('water_flood', 16, DEPTH.water + 0.4).setAlpha(0);
    this.floodAlpha = 0;   // the vloedlyn marker fades in once the water starts rising

    this.drops = scene.add.particles(0, 0, 'fx_drop', {
      emitting: false,
      lifespan: { min: 500, max: 850 },
      speedX: { min: -150, max: 150 },
      speedY: { min: -480, max: -200 },
      gravityY: 1400,
      scale: { start: 0.95, end: 0.35 },
      alpha: { start: 1, end: 0.6 },
      maxAliveParticles: 24,
    }).setDepth(DEPTH.water + 0.5);
    this.ring = scene.add.image(0, 0, 'fx_ring').setDepth(DEPTH.water + 0.45).setVisible(false);
    this.ringTween = null;
    this.tintKey = 0;

    this._layout(0);
  }

  get surfaceY() {
    return this._surfaceY;
  }

  get rising() {
    return this._rising;
  }

  start() {
    this._rising = true;
  }

  /** Advance the flood level (called on the fixed physics step, so it is the same at any refresh rate). */
  advance(dtMs, speedMul = 1) {
    if (this.destroyed || !this._rising) return;
    const dt = clamp(dtMs, 0, 100) / 1000;
    this.tRising += dt;
    const v = Math.min(WATER.vMax, WATER.v0 + WATER.accel * this.tRising) * speedMul;
    this._surfaceY -= v * dt;
  }

  /** Per frame: animate the water. With `speedMul` it also advances the level (one call does both). */
  update(dtMs, speedMul = null) {
    if (this.destroyed) return;
    const dt = clamp(dtMs, 0, 100) / 1000;
    if (speedMul !== null) this.advance(dtMs, speedMul);
    // The visual level eases down when the water recedes; it never lags behind a rise.
    if (this.displayY < this._surfaceY - 0.25) {
      this.displayY += (this._surfaceY - this.displayY) * (1 - Math.exp(-dt * 2.2));
    } else {
      this.displayY = this._surfaceY;
    }
    this.t += dt;
    this._layout(dt);
    this._stormTint();
  }

  // Storms grey the sea a little, in step with the sky (BgScene reads the same key).
  _stormTint() {
    const dark = Number(this.scene.registry.get('skyDark')) || 0;
    const key = Math.round(dark * 40);
    if (key === this.tintKey) return;
    this.tintKey = key;
    const tint = lerpColor(0xffffff, 0x8e98aa, key / 40);
    for (const o of [this.back, this.body, this.shimmer, this.front]) o.setTint(tint);
    // the deep fill is a tinted white texture: multiply by hand so it still matches the body's last row
    const ch = (c, sh) => (c >> sh) & 255;
    this.deep.setTint(((ch(DEEP_HEX, 16) * ch(tint, 16) / 255) << 16)
      | ((ch(DEEP_HEX, 8) * ch(tint, 8) / 255) << 8) | (ch(DEEP_HEX, 0) * ch(tint, 0) / 255));
  }

  _layout(dt = 0) {
    const t = this.t;
    const y = this.displayY + Math.sin(t * 1.7) * 1.2;
    this.front.y = y - WAVE_MEAN + 1;
    this.back.y = y - WAVE_MEAN - 3 + Math.sin(t * 1.3 + 1) * 1.5;
    this.body.y = this.front.y + STRIP_H;
    this.deep.y = this.body.y + BODY_H;
    this.shimmer.y = this.body.y - 4;
    this.flood.y = y - 26;
    this.front.tilePositionX = t * 24;
    this.back.tilePositionX = -t * 15 + 40;
    this.shimmer.tilePositionX = -t * 10;
    this.shimmer.alpha = 0.28 + Math.sin(t * 2.1) * 0.08;
    this.flood.tilePositionX = t * 10;
    if (this._rising && this.floodAlpha < 0.6) {
      this.floodAlpha = Math.min(0.6, this.floodAlpha + dt * 0.6);
      this.flood.alpha = this.floodAlpha;
    }
  }

  lower(px) {
    this._surfaceY = Math.min(this.startY, this._surfaceY + Math.max(0, px));
  }

  splash(x) {
    if (this.destroyed) return;
    const y = this.displayY;
    this.drops.explode(12, x, y - 2);
    const r = this.ring;
    if (this.ringTween) this.ringTween.stop();
    r.setPosition(x, y + 2).setScale(0.2, 0.06).setAlpha(0.9).setVisible(true);
    this.ringTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 650,
      onUpdate: (tw) => {
        const p = tw.getValue();
        const e = 1 - (1 - p) ** 3;
        r.setScale(0.2 + 1.4 * e, (0.2 + 1.4 * e) * 0.3);
        r.alpha = 0.9 * (1 - p);
      },
      onComplete: () => {
        this.ringTween = null;
        r.setVisible(false);
      },
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.ringTween) this.ringTween.stop();
    for (const o of [this.back, this.body, this.deep, this.shimmer, this.front, this.flood, this.drops, this.ring]) o.destroy();
  }
}
