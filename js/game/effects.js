// Juicy feedback: rating pops ("Perfek!"), outline flash, sparkles,
// dust, splashes, screen flash and camera shake. Everything is pooled and the
// textures are generated once per game (they survive scene restarts).
import { DEPTH, FONT, COLORS, GAME_W } from '../config.js';
import { S } from '../core/strings.js';

const BLOCK_PAD = 3;                       // blocks.js pads its textures by 3 px
const BIG_FONT_PX = 72;                    // rating pops render once at this size, then scale
const SMALL_FONT_PX = 44;                  // float texts
const BIG_POOL = 7;
const SMALL_POOL = 8;
const OUTLINE_POOL = 4;
// Perfek text colour climbs with the combo (white → yellow → orange → pink → violet → cyan → mint).
const COMBO_TINTS = [0xffffff, 0xfff27a, 0xffd23f, 0xffa53d, 0xff7aa8, 0xc792ff, 0x6fe3ff, 0x7dffb0];
const PINNED = new Set([S.perfect, S.good, S.skew, S.lost]);   // keep these rendered
const SPARK_TINTS = [0xffffff, 0xfff27a, 0xffc94d, 0x7de3ff, 0xff9ac1, 0xb9ff8a];

// ---------------------------------------------------------------------------
// Small shared helpers (also used by water.js / crane.js / island.js / BgScene)
// ---------------------------------------------------------------------------
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function lerpColor(a, b, t) {
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
}

export function cssColor(c, alpha = 1) {
  if (typeof c !== 'number') return c;
  if (alpha >= 1) return '#' + c.toString(16).padStart(6, '0');
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;
}

/** '#fff' | '#ffcc00' | 0xffcc00 -> int, or null when it is not a hex colour. */
export function parseColor(c) {
  if (typeof c === 'number') return c;
  if (typeof c !== 'string' || c[0] !== '#') return null;
  let h = c.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const v = parseInt(h, 16);
  return h.length === 6 && !Number.isNaN(v) ? v : null;
}

/** Draws into a new canvas texture once; returns the key. Safe across scene restarts. */
export function canvasTexture(scene, key, w, h, draw) {
  const textures = scene.textures;
  if (textures.exists(key)) return key;
  const tex = textures.createCanvas(key, w, h);
  draw(tex.getContext(), w, h);
  tex.refresh();
  return key;
}

export function ensureFxTextures(scene) {
  canvasTexture(scene, 'fx_px', 4, 4, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 4, 4);
  });
  canvasTexture(scene, 'fx_spark', 40, 40, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    glow.addColorStop(0, 'rgba(255,255,255,0.75)');
    glow.addColorStop(0.35, 'rgba(255,255,255,0.18)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // 4-point star
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const R = 18;
    const r = 4;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const rad = i % 2 === 0 ? R : r;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  });
  canvasTexture(scene, 'fx_dot', 16, 16, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  canvasTexture(scene, 'fx_puff', 64, 64, (ctx) => {
    // lumpy cartoon dust puff: a few overlapping soft circles
    const blobs = [[32, 36, 20], [20, 34, 13], [44, 33, 14], [31, 24, 14]];
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  canvasTexture(scene, 'fx_drop', 20, 20, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(10, 10, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,215,250,0.9)';
    ctx.beginPath();
    ctx.arc(11.5, 11.5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(8, 8, 2, 0, Math.PI * 2);
    ctx.fill();
  });
  // Rounded outline for the Perfek burst, stretched as a nine-slice (no per-frame tessellation).
  canvasTexture(scene, 'fx_ring9', 64, 64, (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    const r = 16;
    const x = 3;
    const y = 3;
    const w = 58;
    const h = 58;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.stroke();
  });
  // Screen-edge vignette (game over, flood danger); tinted per use.
  canvasTexture(scene, 'fx_vignette', 128, 256, (ctx, w, h) => {
    ctx.save();
    ctx.scale(1, h / w);
    const g = ctx.createRadialGradient(w / 2, w / 2, w * 0.22, w / 2, w / 2, w * 0.72);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
    ctx.restore();
  });
  canvasTexture(scene, 'fx_ring', 128, 128, (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(64, 64, 49, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// Reads block bounds whether blocks.js exposes them as methods or getters.
function readNum(block, key) {
  const v = block[key];
  return typeof v === 'function' ? v.call(block) : v;
}

function blockBounds(block) {
  if (!block) return null;
  let left = readNum(block, 'left');
  let right = readNum(block, 'right');
  let top = readNum(block, 'top');
  let bottom = readNum(block, 'bottom');
  if (!Number.isFinite(left) && block.body) {
    const b = block.body.bounds;
    left = b.min.x; right = b.max.x; top = b.min.y; bottom = b.max.y;
  }
  if (!Number.isFinite(left) && block.image) {
    const img = block.image;
    left = img.x - img.displayOriginX; right = left + img.displayWidth;
    top = img.y - img.displayOriginY; bottom = top + img.displayHeight;
  }
  let cx = readNum(block, 'centerX');
  if (!Number.isFinite(cx)) cx = (left + right) / 2;
  return { left, right, top, bottom, cx };
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeOutBack = (t) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

export class Effects {
  constructor(scene, { reducedMotion = false } = {}) {
    this.scene = scene;
    this.reducedMotion = !!reducedMotion;
    this.destroyed = false;
    ensureFxTextures(scene);

    const textStyle = (px, stroke) => ({
      fontFamily: FONT,
      fontSize: `${px}px`,
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: cssColor(COLORS.textStroke),
      strokeThickness: stroke,
      resolution: 1.25,
      align: 'center',
    });
    const makeText = (px, stroke, shadowY) => {
      const t = scene.add.text(0, 0, '', textStyle(px, stroke)).setOrigin(0.5).setVisible(false);
      t.setShadow(0, shadowY, 'rgba(10,20,40,0.35)', 0, true, true);
      t.setDepth(DEPTH.weather + 2);   // above water and weather overlays, below the crane
      return { obj: t, tween: null, used: 0 };
    };
    this.big = Array.from({ length: BIG_POOL }, () => makeText(BIG_FONT_PX, 11, 6));
    this.small = Array.from({ length: SMALL_POOL }, () => makeText(SMALL_FONT_PX, 8, 4));

    // WebGL draws the burst as a nine-slice; the Canvas renderer can't, so it redraws a Graphics.
    this.nine = !!(scene.add.nineslice && scene.sys.game.renderer && scene.sys.game.renderer.type === Phaser.WEBGL);
    this.outlines = Array.from({ length: OUTLINE_POOL }, () => ({
      g: this.nine
        ? scene.add.nineslice(0, 0, 'fx_ring9', undefined, 64, 64, 22, 22, 22, 22).setDepth(DEPTH.fxWorld + 1).setVisible(false)
        : scene.add.graphics().setDepth(DEPTH.fxWorld + 1).setVisible(false),
      tween: null,
      used: 0,
    }));
    this.blockFlashes = Array.from({ length: 2 }, () => ({
      obj: scene.add.image(0, 0, 'fx_px').setDepth(DEPTH.tower + 1).setVisible(false),
      tween: null,
      used: 0,
    }));
    this.rings = Array.from({ length: 3 }, () => ({
      obj: scene.add.image(0, 0, 'fx_ring').setDepth(DEPTH.water + 1).setVisible(false),
      tween: null,
      used: 0,
    }));

    this.sparks = scene.add.particles(0, 0, 'fx_spark', {
      emitting: false,
      lifespan: { min: 520, max: 950 },
      speed: { min: 160, max: 470 },
      angle: { min: 195, max: 345 },
      gravityY: 950,
      scale: { start: 1.25, end: 0 },
      rotate: { start: 0, end: 300 },
      tint: SPARK_TINTS,
      maxAliveParticles: 60,
    }).setDepth(DEPTH.fxWorld + 2);

    const dustCfg = (dir) => ({
      emitting: false,
      lifespan: { min: 380, max: 680 },
      speedX: dir < 0 ? { min: -190, max: -50 } : { min: 50, max: 190 },
      speedY: { min: -80, max: -10 },
      gravityY: -30,
      scale: { start: 0.32, end: 0.95 },
      alpha: { start: 0.8, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [0xfff8ec, 0xf1e6d2, 0xe2d6c2],
      maxAliveParticles: 16,
    });
    this.dustL = scene.add.particles(0, 0, 'fx_puff', dustCfg(-1)).setDepth(DEPTH.fxWorld);
    this.dustR = scene.add.particles(0, 0, 'fx_puff', dustCfg(1)).setDepth(DEPTH.fxWorld);

    this.drops = scene.add.particles(0, 0, 'fx_drop', {
      emitting: false,
      lifespan: { min: 520, max: 900 },
      speedX: { min: -170, max: 170 },
      speedY: { min: -560, max: -220 },
      gravityY: 1400,
      scale: { start: 1, end: 0.35 },
      alpha: { start: 1, end: 0.6 },
      maxAliveParticles: 30,
    }).setDepth(DEPTH.water + 2);

    this.flashImg = scene.add.image(0, 0, 'fx_px')
      .setScrollFactor(0).setDepth(DEPTH.fxScreen).setVisible(false);
    this.flashTween = null;
    this.vigImg = scene.add.image(0, 0, 'fx_vignette')
      .setScrollFactor(0).setDepth(DEPTH.fxScreen - 1).setVisible(false);
    this.vigTween = null;
    this.dangerOn = false;
    this.zoomTween = null;
    this.shakeUntil = 0;
    this.shakeIntensity = 0;
    this.prewarmQueue = [];
    this.lastPrewarm = -1e9;
    this._prewarm([S.perfect, S.good, S.skew, S.lost, S.perfectCombo(2)]);
    scene.events.on('postupdate', this._tick, this);
    // scene events outlive a restart, so never leave a listener pointing at dead objects
    scene.events.once('shutdown', this.destroy, this);
  }

  // ------------------------------------------------------------------ helpers
  /** Free pool item (preferring one whose text already reads `str`: no re-render), else the oldest. */
  _take(pool, str) {
    let idle = null;
    let oldest = null;
    for (const item of pool) {
      const busy = item.obj ? item.obj.visible : item.g.visible;
      if (!busy) {
        if (str !== undefined && item.obj.text === str) return this._reset(item);
        if (!idle || item.used < idle.used) idle = item;
      }
      if (!oldest || item.used < oldest.used) oldest = item;
    }
    return this._reset(idle || oldest);
  }

  // Rendering a big stroked text costs a few ms, so the likely next strings are
  // rendered ahead of time on quiet frames (at most one every 120 ms) into idle pool texts.
  _prewarm(strings) {
    for (const str of strings) {
      if (!this.prewarmQueue.includes(str)) this.prewarmQueue.push(str);
    }
  }

  _tick(time) {
    if (this.destroyed) return;
    if (this.dangerOn && !this.vigTween) {
      // flood close: a slow red pulse at the screen edges
      const peak = this.reducedMotion ? 0.15 : 0.3;
      this._placeVignette();
      this.vigImg.setAlpha(peak * (0.5 - 0.5 * Math.cos((time / 1000) * Math.PI * 2 * 0.8)));
    }
    if (!this.prewarmQueue.length || time - this.lastPrewarm < 120) return;
    this.lastPrewarm = time;
    const str = this.prewarmQueue.shift();
    if (this.big.some((it) => it.obj.text === str)) return;
    let target = null;
    for (const it of this.big) {
      if (it.obj.visible || PINNED.has(it.obj.text)) continue;
      if (!target || it.used < target.used) target = it;
    }
    if (target) target.obj.setText(str);
    else if (this.prewarmQueue.length < 4) this.prewarmQueue.unshift(str);   // all busy: retry soon
  }

  _reset(item) {
    if (item.tween) {
      item.tween.stop();
      item.tween = null;
    }
    item.used = this.scene.time.now + Math.random();
    return item;
  }

  _animate(item, duration, step, onDone) {
    item.tween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      onUpdate: (tw) => step(tw.getValue()),
      onComplete: () => {
        item.tween = null;
        step(1);
        if (onDone) onDone();
      },
    });
  }

  _visibleY(y, marginTop = 230, marginBottom = 140) {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    if (!view || view.height <= 0) return y;
    return clamp(y, view.y + marginTop / cam.zoom, view.bottom - marginBottom / cam.zoom);
  }

  _setText(item, str, tint, scaleMul) {
    const t = item.obj;
    if (t.text !== str) t.setText(str);
    t.setTint(tint);
    t.setAlpha(1).setVisible(true).setAngle(0);
    item.scaleMul = scaleMul;
    return t;
  }

  /**
   * Big rating pop: overshoot scale-in, hold, then drift up and fade. `rise` > 0
   * makes it climb out of the landing zone quickly (Perfek: the next ghost appears there).
   */
  _pop(x, y, str, tint, scaleMul, { wiggle = false, tilt = 0, rise = 0 } = {}) {
    const item = this._take(this.big, str);
    const t = this._setText(item, str, tint, scaleMul);
    const halfW = (t.width * scaleMul) / 2;
    const px = clamp(x, 14 + halfW, GAME_W - 14 - halfW);
    const py = this._visibleY(y);
    t.setPosition(px, py).setScale(0.2 * scaleMul);
    const dur = 1150;
    const fadeFrom = rise ? 0.45 : 0.6;
    this._animate(item, dur, (p) => {
      let s;
      let a = 1;
      let dy = 0;
      if (p < 0.16) s = lerp(0.2, 1.0, easeOutBack(p / 0.16));
      else s = 1;
      if (p > 0.16) dy = rise ? -rise * easeOutCubic((p - 0.16) / 0.84) : -10 * ((p - 0.16) / 0.84);
      if (p > fadeFrom) {
        const q = (p - fadeFrom) / (1 - fadeFrom);
        if (!rise) dy -= 46 * easeOutCubic(q);
        a = 1 - q * q;
        s *= 1 - 0.08 * q;
      }
      t.setScale(s * scaleMul);
      t.y = py + dy;
      t.alpha = a;
      if (wiggle && p < 0.35) t.x = px + Math.sin(p * 70) * 9 * (1 - p / 0.35);
      else t.x = px;
      if (tilt) t.setAngle(tilt * Math.sin(Math.min(1, p * 3) * Math.PI));
    }, () => t.setVisible(false));
  }

  _blockFlash(block) {
    const img = block?.image;
    if (!img || !img.texture) return;
    const item = this._take(this.blockFlashes);
    const o = item.obj;
    o.setTexture(img.texture.key, img.frame?.name)
      .setOrigin(img.originX, img.originY)
      .setPosition(img.x, img.y)
      .setRotation(img.rotation)
      .setScale(img.scaleX, img.scaleY)
      .setTintFill(0xffffff)
      .setAlpha(0.9)
      .setVisible(true);
    this._animate(item, 260, (p) => {
      o.alpha = 0.9 * (1 - p);
    }, () => o.setVisible(false));
  }

  /** White rectangle that grows out of the block and fades. */
  _outline(block, delay = 0, strength = 1) {
    const img = block?.image;
    let x0;
    let y0;
    let w;
    let h;
    let px;
    let py;
    let rot = 0;
    if (img && img.frame) {
      const sx = Math.abs(img.scaleX) || 1;
      const sy = Math.abs(img.scaleY) || 1;
      x0 = (-img.displayOriginX + BLOCK_PAD) * sx;
      y0 = (-img.displayOriginY + BLOCK_PAD) * sy;
      w = (img.width - BLOCK_PAD * 2) * sx;
      h = (img.height - BLOCK_PAD * 2) * sy;
      px = img.x;
      py = img.y;
      rot = img.rotation;
    } else {
      const b = blockBounds(block);
      if (!b) return;
      w = b.right - b.left;
      h = b.bottom - b.top;
      x0 = -w / 2;
      y0 = -h / 2;
      px = (b.left + b.right) / 2;
      py = (b.top + b.bottom) / 2;
    }
    const run = () => {
      if (this.destroyed) return;
      const item = this._take(this.outlines);
      const g = item.g;
      const grow = 34 * strength;
      if (this.nine) {
        // centre of the block's box in world space (the image origin is its centroid)
        const cx = x0 + w / 2;
        const cy = y0 + h / 2;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        g.setPosition(px + cx * c - cy * s, py + cx * s + cy * c).setRotation(rot).setVisible(true);
        this._animate(item, 420, (p) => {
          const gr = 2 + grow * easeOutCubic(p);
          g.setSize(Math.max(48, w + gr * 2), Math.max(48, h + gr * 2));
          g.setAlpha(1 - p);
        }, () => g.setVisible(false));
        return;
      }
      g.setPosition(px, py).setRotation(rot).setVisible(true);
      this._animate(item, 420, (p) => {
        const e = easeOutCubic(p);
        const gr = 2 + grow * e;
        g.clear();
        g.lineStyle(6 * (1 - 0.6 * p), 0xffffff, 1 - p);
        g.strokeRoundedRect(x0 - gr, y0 - gr, w + gr * 2, h + gr * 2, Math.min(6 + gr * 0.25, (h + gr * 2) / 2));
      }, () => {
        g.clear();
        g.setVisible(false);
      });
    };
    if (delay > 0) this.scene.time.delayedCall(delay, run);
    else run();
  }

  // ------------------------------------------------------------------ public API
  rating(block, rating, combo = 0) {
    if (this.destroyed) return;
    const b = blockBounds(block);
    if (!b) return;
    const x = b.cx;
    const yTop = b.top;
    // attract mode behind the menu: bursts and sparkles, but no words over the menu
    const quiet = !!this.scene.idle;
    switch (rating) {
      case 'P': {
        const n = Math.max(1, combo | 0);
        const str = n >= 2 ? S.perfectCombo(n) : S.perfect;
        const tint = COMBO_TINTS[Math.min(n - 1, COMBO_TINTS.length - 1)];
        if (!quiet) this._pop(x, yTop - 72, str, tint, 0.92 + Math.min(n, 6) * 0.045, { rise: 110 });
        this._blockFlash(block);
        this._outline(block, 0, 1);
        if (n >= 2) this._outline(block, 120, 1.5);
        if (n >= 4) this._outline(block, 240, 2);
        this.sparkle(x, yTop, 10 + Math.min(n, 8) * 2);
        if (quiet) break;
        if (n >= 3) this.flash(lerpColor(0xffffff, tint, 0.5), 0.26, 170);
        this.zoomPunch();
        this._prewarm([S.perfectCombo(n + 1)]);
        break;
      }
      case 'G':
        if (!quiet) this._pop(x, yTop - 54, S.good, COLORS.good, 0.62);
        this.sparkle(x, yTop, 5);
        break;
      case 'S':
        if (!quiet) this._pop(x, yTop - 54, S.skew, COLORS.skew, 0.6, { tilt: -8 });
        break;
      case 'X':
        if (!quiet) this._pop(x, yTop - 40, S.lost, COLORS.lost, 0.78, { wiggle: true });
        break;
      default:
        break;
    }
  }

  floatText(x, y, text, { color = '#fff', size = 34 } = {}) {
    if (this.destroyed) return;
    const item = this._take(this.small, String(text));
    const tint = parseColor(color);
    const scaleMul = size / SMALL_FONT_PX;
    const t = this._setText(item, String(text), tint ?? 0xffffff, scaleMul);
    if (tint === null) t.setColor(color);
    else if (t.style.color !== '#ffffff') t.setColor('#ffffff');
    const halfW = (t.width * scaleMul) / 2;
    const px = clamp(x, 10 + halfW, GAME_W - 10 - halfW);
    const py = this._visibleY(y, 200, 100);
    t.setPosition(px, py).setScale(0.5 * scaleMul);
    this._animate(item, 950, (p) => {
      const s = p < 0.15 ? lerp(0.5, 1, easeOutBack(p / 0.15)) : 1;
      t.setScale(s * scaleMul);
      t.y = py - 78 * easeOutCubic(p);
      t.alpha = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
    }, () => t.setVisible(false));
  }

  dust(x, y, width = 100) {
    if (this.destroyed) return;
    const n = clamp(Math.round(width / 45), 2, 5);
    const half = width / 2;
    for (let i = 0; i < n; i++) {
      this.dustL.emitParticleAt(x - half + Math.random() * 16, y - 4 + Math.random() * 6, 1);
      this.dustR.emitParticleAt(x + half - Math.random() * 16, y - 4 + Math.random() * 6, 1);
    }
  }

  splash(x, y) {
    if (this.destroyed) return;
    this.drops.explode(14, x, y);
    const item = this._take(this.rings);
    const r = item.obj;
    r.setPosition(x, y).setScale(0.2, 0.07).setAlpha(0.9).setVisible(true);
    this._animate(item, 600, (p) => {
      const e = easeOutCubic(p);
      r.setScale(0.2 + 1.3 * e, (0.2 + 1.3 * e) * 0.32);
      r.alpha = 0.9 * (1 - p);
    }, () => r.setVisible(false));
  }

  flash(color = 0xffffff, alpha = 0.35, ms = 160) {
    if (this.destroyed) return;
    const cam = this.scene.cameras.main;
    const z = cam.zoom || 1;
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const a = this.reducedMotion ? alpha * 0.5 : alpha;
    if (this.flashTween) this.flashTween.stop();
    const img = this.flashImg;
    img.setPosition(W / 2, H / 2)
      .setDisplaySize((W / z) * 1.3, (H / z) * 1.3)
      .setTint(typeof color === 'number' ? color : parseColor(color) ?? 0xffffff)
      .setAlpha(a)
      .setVisible(true);
    this.flashTween = this.scene.tweens.add({
      targets: img,
      alpha: 0,
      duration: ms,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.flashTween = null;
        img.setVisible(false);
      },
    });
  }

  _placeVignette() {
    const cam = this.scene.cameras.main;
    const z = cam.zoom || 1;
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    this.vigImg.setPosition(W / 2, H / 2).setDisplaySize((W / z) * 1.04, (H / z) * 1.04).setVisible(true);
  }

  /** Screen edges glow in `color` and fade (game over). */
  vignette(color = 0xd8231b, alpha = 0.5, ms = 900) {
    if (this.destroyed) return;
    if (this.vigTween) this.vigTween.stop();
    const img = this.vigImg;
    this._placeVignette();
    img.setTint(color).setAlpha(0);
    const peak = this.reducedMotion ? alpha * 0.6 : alpha;
    this.vigTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      onUpdate: (tw) => {
        const p = tw.getValue();
        img.setAlpha(peak * (p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7));
      },
      onComplete: () => {
        this.vigTween = null;
        img.setVisible(false);
      },
    });
  }

  /** Flood close: keep a slow red pulse at the screen edges on/off. */
  danger(on) {
    if (this.destroyed || this.dangerOn === !!on) return;
    this.dangerOn = !!on;
    if (this.dangerOn) {
      if (!this.vigTween) this.vigImg.setTint(0xe5483b);
    } else if (!this.vigTween) {
      this.vigImg.setVisible(false);
    }
  }

  /** Tiny zoom pulse on a Perfek (skipped with reduced motion). */
  zoomPunch() {
    if (this.destroyed || this.reducedMotion) return;
    const cam = this.scene.cameras.main;
    if (this.zoomTween || cam.zoom !== 1) return;
    this.zoomTween = this.scene.tweens.add({
      targets: cam,
      zoom: 1.015,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.zoomTween = null;
        if (!this.scene.revealing) cam.setZoom(1);
      },
    });
  }

  shake(intensity = 0.006, ms = 200) {
    if (this.destroyed || this.reducedMotion) return;
    const now = this.scene.time.now;
    const busy = now < this.shakeUntil;
    if (busy && intensity <= this.shakeIntensity) return;
    this.shakeUntil = now + ms;
    this.shakeIntensity = intensity;
    this.scene.cameras.main.shake(ms, intensity, true);
  }

  sparkle(x, y, n = 12) {
    if (this.destroyed) return;
    this.sparks.explode(Math.max(1, Math.round(n)), x, y);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const all = [...this.big, ...this.small, ...this.blockFlashes, ...this.rings, ...this.outlines];
    for (const item of all) {
      if (item.tween) item.tween.stop();
      (item.obj || item.g).destroy();
    }
    if (this.flashTween) this.flashTween.stop();
    if (this.vigTween) this.vigTween.stop();
    if (this.zoomTween) this.zoomTween.stop();
    this.scene.events.off('postupdate', this._tick, this);
    this.scene.events.off('shutdown', this.destroy, this);
    for (const o of [this.sparks, this.dustL, this.dustR, this.drops, this.flashImg, this.vigImg]) o.destroy();
  }
}
