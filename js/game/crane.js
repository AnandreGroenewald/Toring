// Screen-space tower crane (hyskraan): a yellow lattice jib across the top, a
// trolley that slides along it, a steel rope with a red/yellow hook block, and
// the hanging block swinging as a driven, damped pendulum.
import { CRANE, DEPTH, GAME_W, LAYOUT, PHYSICS, COLORS } from '../config.js';
import { canvasTexture, cssColor, clamp } from './effects.js';

const G = 1000 * PHYSICS.gravityY;   // px/s^2
const MAX_SWING = 0.35;              // rad, hard limit from the spec
// A literal trolley-driven pendulum swings far too wildly near resonance, so the
// trolley acceleration is coupled in at a fraction: the block visibly lags and
// overshoots without becoming unplayable. Wind leans the rope (θ ≈ atan(a/g)).
const TROLLEY_COUPLING = 0.055;
const WIND_COUPLING = 0.6;
// Fixed integration step (s): the swing is the same function of time at any refresh rate.
const SUBSTEP = 1 / 240;
const REEL_MS = 340;                 // a fresh block is lowered on the rope with a little overshoot
const AMP_TAU = 0.3;                 // s: the swing widens smoothly when the amplitude changes
const easeBackOut = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const JIB_TOP = LAYOUT.jibY - 42;    // screen y of the top chord
const JIB_TEX_Y = JIB_TOP - 8;       // screen y of the jib texture's first row
const JIB_W = GAME_W + 64;
const ROPE_W = 4;
const HOOK_W = 46;
const HOOK_TEX_H = 26;

const YELLOW = cssColor(COLORS.crane);
const YELLOW_LIGHT = '#ffd84d';
const YELLOW_DARK = '#c48a00';
const STEEL_DARK = cssColor(COLORS.craneDark);

function ensureCraneTextures(scene) {
  // Jib: lattice truss (top chord, bottom chord/rail, zig-zag diagonals) baked once.
  canvasTexture(scene, 'crane_jib', JIB_W, 64, (ctx, w) => {
    const top = JIB_TOP - JIB_TEX_Y;            // 8
    const bot = LAYOUT.jibY - JIB_TEX_Y - 6;     // bottom chord centre
    const seg = 56;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // soft shadow of the truss
    ctx.strokeStyle = 'rgba(20,30,50,0.18)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let x = 0; x <= w + seg; x += seg) {
      ctx.moveTo(x + 3, bot + 3);
      ctx.lineTo(x + seg / 2 + 3, top + 3);
      ctx.lineTo(x + seg + 3, bot + 3);
    }
    ctx.stroke();
    // diagonals: dark outline then yellow
    const lacing = (width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let x = 0; x <= w + seg; x += seg) {
        ctx.moveTo(x, bot);
        ctx.lineTo(x + seg / 2, top);
        ctx.lineTo(x + seg, bot);
        ctx.moveTo(x + seg / 2, top);
        ctx.lineTo(x + seg / 2, bot);
      }
      ctx.stroke();
    };
    lacing(7, '#5a4100');
    lacing(4, YELLOW);
    // chords
    const chord = (y, h) => {
      ctx.fillStyle = '#5a4100';
      ctx.fillRect(0, y - h / 2 - 1.5, w, h + 3);
      const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      g.addColorStop(0, YELLOW_LIGHT);
      g.addColorStop(0.5, YELLOW);
      g.addColorStop(1, YELLOW_DARK);
      ctx.fillStyle = g;
      ctx.fillRect(0, y - h / 2, w, h);
    };
    chord(top, 8);
    chord(bot, 10);
    // gusset bolts at the joints
    ctx.fillStyle = '#7a5800';
    for (let x = 0; x <= w; x += seg / 2) {
      ctx.beginPath();
      ctx.arc(x, (x / (seg / 2)) % 2 === 0 ? bot : top, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // trolley rail under the bottom chord
    ctx.fillStyle = '#3a3d42';
    ctx.fillRect(0, bot + 5, w, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, bot + 5, w, 1);
  });
  canvasTexture(scene, 'crane_trolley', 76, LAYOUT.trolleyH + 4, (ctx, w) => {
    const bodyH = LAYOUT.trolleyH;
    // body
    ctx.fillStyle = '#1b1c1f';
    roundRect(ctx, 4, 0, w - 8, bodyH, 6);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, bodyH);
    g.addColorStop(0, '#55595f');
    g.addColorStop(1, STEEL_DARK);
    ctx.fillStyle = g;
    roundRect(ctx, 6, 2, w - 12, bodyH - 4, 5);
    ctx.fill();
    // yellow accent stripe
    ctx.fillStyle = YELLOW;
    ctx.fillRect(8, 7, w - 16, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 12; x < w - 12; x += 10) ctx.fillRect(x, 7, 4, 5);
    // sheave (pulley) at the bottom centre
    ctx.fillStyle = '#16171a';
    ctx.beginPath();
    ctx.arc(w / 2, bodyH - 3, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d939b';
    ctx.beginPath();
    ctx.arc(w / 2, bodyH - 3, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, 'crane_wheel', 18, 18, (ctx) => {
    ctx.fillStyle = '#16171a';
    ctx.beginPath();
    ctx.arc(9, 9, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9aa0a8';
    ctx.beginPath();
    ctx.arc(9, 9, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a2c30';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 9);
    ctx.lineTo(14, 9);
    ctx.moveTo(9, 4);
    ctx.lineTo(9, 14);
    ctx.stroke();
  });
  canvasTexture(scene, 'crane_rope', ROPE_W, 8, (ctx) => {
    ctx.fillStyle = '#3b4048';
    ctx.fillRect(0, 0, 4, 8);
    ctx.fillStyle = '#a7b0ba';
    ctx.fillRect(1, 0, 1, 8);
    ctx.fillStyle = '#6c747e';
    ctx.fillRect(1, 2, 2, 2);
    ctx.fillRect(1, 6, 2, 2);
  });
  canvasTexture(scene, 'crane_hook', HOOK_W, HOOK_TEX_H, (ctx, w) => {
    const h = LAYOUT.hookH;
    // red hook block with a yellow/black band
    ctx.fillStyle = '#5c0f12';
    roundRect(ctx, 2, 0, w - 4, h, 5);
    ctx.fill();
    ctx.fillStyle = '#e53935';
    roundRect(ctx, 4, 1.5, w - 8, h - 3, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(7, 3, w - 14, 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(10, 5, w - 20, 5);
    ctx.clip();
    ctx.fillStyle = YELLOW;
    ctx.fillRect(10, 5, w - 20, 5);
    ctx.fillStyle = '#25272b';
    for (let x = 4; x < w; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.lineTo(x + 4, 10);
      ctx.lineTo(x + 9, 5);
      ctx.lineTo(x + 5, 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // small steel hook dipping into the block's lifting eye
    ctx.strokeStyle = '#2b2e33';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w / 2, h - 1);
    ctx.lineTo(w / 2, h + 4);
    ctx.arc(w / 2 - 4, h + 4, 4, 0, Math.PI * 0.95);
    ctx.stroke();
    ctx.strokeStyle = '#aab2bb';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.lineTo(w / 2, h + 4);
    ctx.stroke();
  });
  canvasTexture(scene, 'crane_light', 14, 14, (ctx) => {
    const g = ctx.createRadialGradient(7, 7, 0, 7, 7, 7);
    g.addColorStop(0, 'rgba(255,240,220,1)');
    g.addColorStop(0.35, 'rgba(255,70,60,1)');
    g.addColorStop(1, 'rgba(255,40,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 14, 14);
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

const HOT_TINT = 0xff6a2a;   // heat wave: the crane glows orange-red

/** a..b by t (0..1), per colour channel. */
function mixColor(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const ch = (s) => {
    const x = (a >> s) & 255;
    return Math.round(x + (((b >> s) & 255) - x) * k);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class Crane {
  /** `top`: screen offset (safe-area inset) applied to the whole crane, so the drop height never changes. */
  constructor(scene, { top = 0 } = {}) {
    this.scene = scene;
    this.top = Math.max(0, Number(top) || 0);
    ensureCraneTextures(scene);
    const d = DEPTH.crane;
    const add = (obj, dz) => obj.setScrollFactor(0).setDepth(d + dz);

    this.jib = add(scene.add.image(GAME_W / 2, JIB_TEX_Y + this.top, 'crane_jib').setOrigin(0.5, 0), 0.5);
    this.rope = add(scene.add.image(0, 0, 'crane_rope').setOrigin(0.5, 0), 0.1);
    this.trolley = add(scene.add.image(0, 0, 'crane_trolley').setOrigin(0.5, 0), 0.6);
    this.wheels = [add(scene.add.image(0, 0, 'crane_wheel'), 0.7), add(scene.add.image(0, 0, 'crane_wheel'), 0.7)];
    this.light = add(scene.add.image(0, 0, 'crane_light'), 0.75);
    this.block = add(scene.add.image(0, 0, '__WHITE').setVisible(false), 0.2);
    this.hook = add(scene.add.image(0, 0, 'crane_hook').setOrigin(0.5, 0), 0.3);
    this.parts = [this.jib, this.rope, this.trolley, ...this.wheels, this.light, this.block, this.hook];

    this.phase = 0;
    this.windAccel = 0;
    this.amplitude = CRANE.amplitudeStart ?? CRANE.amplitude;
    this.omega = CRANE.omega0;
    this.tx = GAME_W / 2;
    this.tv = 0;
    this.theta = 0;
    this.thetaV = 0;
    this.dTop = 20;            // block centroid distance below its top edge
    this.ropeLen = LAYOUT.ropeLen;
    this.reel = 1;             // 0..1 lowering progress of a freshly attached block
    this.reelT = REEL_MS;
    this.acc = 0;              // s of frame time not yet integrated (less than one substep)
    this.spring = 0;           // rope recoil offset (px), spring-damped
    this.springV = 0;
    this._hasBlock = false;
    this.visible = true;
    this.time = 0;
    this.tweens = [];
    this.destroyed = false;
    this._layout();
  }

  get trolleyX() {
    return this.tx;
  }

  hasBlock() {
    return this._hasBlock;
  }

  setBlock(spec, textureKey, geom) {
    if (this.destroyed) return;
    const frame = this.scene.textures.getFrame(textureKey);
    const texH = frame ? frame.height : geom?.h ?? 40;
    const pad = geom && Number.isFinite(geom.h) ? Math.max(0, (texH - geom.h) / 2) : 3;
    const oy = geom?.originY ?? 0.5;
    const ox = geom?.originX ?? 0.5;
    this.dTop = oy * texH - pad;
    this.spec = spec;
    this.block.setTexture(textureKey).setOrigin(ox, oy).setVisible(this.visible).setAlpha(0);
    this._hasBlock = true;
    // lower it from just under the trolley: rope reels out with a little bounce (integrated in update())
    this._stopTweens();
    this.reel = 0;
    this.reelT = 0;
    this.tweens.push(this.scene.tweens.add({ targets: this.block, alpha: 1, duration: 140, ease: 'Quad.easeOut' }));
    this.thetaV += ((spec?.i ?? 0) % 2 ? 0.035 : -0.035);   // small deterministic jiggle as it is lowered
    this._layout();
  }

  /** Effective pendulum length from the trolley sheave to the hanging centroid. */
  _pendLen() {
    const rope = this._ropeNow();
    return rope + LAYOUT.hookH + (this._hasBlock ? this.dTop : 0);
  }

  _ropeNow() {
    return Math.max(12, this.ropeLen - (1 - this.reel) * 70 + this.spring);
  }

  /**
   * Screen-space pose of the hanging block. `aheadMs` extrapolates from the
   * last update without changing state, so a tap between two frames releases
   * the block where it really was at that moment (no 30 Hz landing grid).
   */
  getBlockPose(aheadMs = 0) {
    const L = this._pendLen();
    let tx = this.tx;
    let tv = this.tv;
    let theta = this.theta;
    let thetaV = this.thetaV;
    // the integrated state is `acc` behind the last update; a tap is `aheadMs` after it
    const h = this.acc + clamp(Number(aheadMs) || 0, -50, 50) / 1000;
    if (h !== 0) {
      const phase = this.phase + this.omega * h;
      const A = this.amplitude;
      tx = GAME_W / 2 + A * Math.sin(phase);
      tv = A * this.omega * Math.cos(phase);
      const aT = -A * this.omega * this.omega * Math.sin(this.phase);
      const acc = -(G / L) * Math.sin(theta) - ((aT * TROLLEY_COUPLING) / L) * Math.cos(theta)
        + (this.windAccel * WIND_COUPLING) / L - CRANE.pendulumDamping * thetaV;
      theta = clamp(theta + thetaV * h + 0.5 * acc * h * h, -MAX_SWING, MAX_SWING);
      thetaV += acc * h;
    }
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const py = LAYOUT.jibY + this.top + LAYOUT.trolleyH + this.spring * 0.25;
    return {
      x: tx + L * s,
      y: py + L * c,
      angle: -theta,
      vx: tv + L * c * thetaV,
      vy: -L * s * thetaV,
    };
  }

  release(aheadMs = 0) {
    const pose = this.getBlockPose(aheadMs);
    if (!this._hasBlock) return pose;
    this._hasBlock = false;
    this.block.setVisible(false);
    this._stopTweens();
    this.reel = 1;
    this.reelT = REEL_MS;
    // freed of the load the rope springs up; the hook keeps the swing
    this.springV -= 260;
    return pose;
  }

  /** `amplitude` is a target: the swing eases towards it. */
  update(dtMs, { omega = this.omega, amplitude = CRANE.amplitude, windAccel = 0, heat = 0 } = {}) {
    if (this.destroyed) return;
    const dt = clamp(dtMs, 0, 100) / 1000;
    this.omega = omega;
    this.windAccel = windAccel;
    this.time += dt;
    this.acc += dt;
    const h = SUBSTEP;
    const ampK = 1 - Math.exp(-h / AMP_TAU);
    while (this.acc >= h - 1e-9) {
      this.acc -= h;
      this.amplitude += (amplitude - this.amplitude) * ampK;
      const A = this.amplitude;
      this.phase += omega * h;
      const sp = Math.sin(this.phase);
      this.tx = GAME_W / 2 + A * sp;
      this.tv = A * omega * Math.cos(this.phase);
      const aT = -A * omega * omega * sp;
      if (this.reelT < REEL_MS) {
        this.reelT = Math.min(REEL_MS, this.reelT + h * 1000);
        this.reel = easeBackOut(this.reelT / REEL_MS);
      }
      const L = this._pendLen();
      const th = this.theta;
      const acc = -(G / L) * Math.sin(th)
        - ((aT * TROLLEY_COUPLING) / L) * Math.cos(th)
        + (windAccel * WIND_COUPLING) / L
        - CRANE.pendulumDamping * this.thetaV;
      this.thetaV += acc * h;
      this.theta += this.thetaV * h;
      if (this.theta > MAX_SWING) { this.theta = MAX_SWING; this.thetaV = Math.min(0, this.thetaV); }
      if (this.theta < -MAX_SWING) { this.theta = -MAX_SWING; this.thetaV = Math.max(0, this.thetaV); }
      // rope recoil spring
      this.springV += (-260 * this.spring - 14 * this.springV) * h;
      this.spring += this.springV * h;
    }
    if (this.acc < 0) this.acc = 0;
    this._layout();
    this._glow(heat);
  }

  /** Heat wave (heat 0..1, eased in and out with the weather): the steel glows hot, pulsing. */
  _glow(heat) {
    const hot = heat > 0.01;
    if (!hot && !this._hot) return;
    this._hot = hot;
    const tint = hot ? mixColor(0xffffff, HOT_TINT, heat * (0.75 + 0.25 * Math.sin(this.time * 6))) : 0;
    for (const p of [this.jib, this.trolley, this.hook, ...this.wheels]) {
      if (hot) p.setTint(tint);
      else p.clearTint();
    }
  }

  _layout() {
    const tx = this.tx;
    const jy = LAYOUT.jibY + this.top;
    const bob = this.spring * 0.25;
    this.trolley.setPosition(tx, jy + bob);
    const roll = this.tx / 7;
    this.wheels[0].setPosition(tx - 22, jy - 6 + bob * 0.3).setRotation(roll);
    this.wheels[1].setPosition(tx + 22, jy - 6 + bob * 0.3).setRotation(roll);
    this.light.setPosition(tx + 30, jy + 5 + bob);
    this.light.alpha = (this.time % 1.2) < 0.25 ? 1 : 0.25;

    const s = Math.sin(this.theta);
    const c = Math.cos(this.theta);
    const px = tx;
    const py = jy + LAYOUT.trolleyH - 3 + bob;
    const rope = this._ropeNow() + 3;
    this.rope.setPosition(px, py).setRotation(-this.theta).setDisplaySize(ROPE_W, rope);
    const hx = px + rope * s;
    const hy = py + rope * c;
    this.hook.setPosition(hx, hy).setRotation(-this.theta);
    if (this._hasBlock) {
      const L = this._pendLen();
      const by = jy + LAYOUT.trolleyH + bob;
      this.block.setPosition(px + L * s, by + L * c).setRotation(-this.theta);
    }
  }

  _stopTweens() {
    for (const t of this.tweens) t.stop();
    this.tweens.length = 0;
  }

  setVisible(v) {
    this.visible = !!v;
    for (const p of this.parts) {
      if (p === this.block) p.setVisible(this.visible && this._hasBlock);
      else p.setVisible(this.visible);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._stopTweens();
    for (const p of this.parts) p.destroy();
  }
}
