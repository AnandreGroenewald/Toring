// In-game HUD (screen space): height + points, next block, hearts, weather chip,
// combo badge, flood distance, wobble meter, event banners, toasts and the tap hint.
// Driven entirely by bus events from GameScene; texts re-render only on change.
import { LAYOUT, LIVES, FONT, COLORS, WATER, PX_PER_M } from '../config.js';
import { bus } from '../core/bus.js';
import { S, WEATHER_INFO } from '../core/strings.js';
import { fmtM, fmtInt } from '../core/format.js';
import { ensureTexture } from '../game/blocks.js';

// Text font first: emoji fonts also contain (blank-looking) digit glyphs.
const EMOJI_FONT = `${FONT}, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
const STROKE = '#' + COLORS.textStroke.toString(16).padStart(6, '0');
const NAVY = 0x1d2b45;
const PAUSE_BTN = 96;      // DOM pause button: top-right 96×96 logical px, 6 px from the edges
const EDGE = 6;
const NEXT_BOX_W = 104;
const NEXT_BOX_H = 92;
const NEXT_FIT_W = 84;
const NEXT_FIT_H = 44;
const HEART_GAP = 46;
const WATER_TEXT_MS = 120;
const WARN_M = WATER.warnPx / PX_PER_M;
const BANNER_HOLD_MS = 1600;
const TOAST_HOLD_MS = 1500;

const rgba = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Chunky rounded panel texture (soft drop shadow, fill, top sheen, light rim),
 * generated once per size/colour. Plain textures (no tint) so Canvas mode works too.
 */
function panelTexture(scene, w, h, fill, alpha, { radius = h / 2, rim = 0.22 } = {}) {
  const W = Math.max(8, Math.round(w));
  const H = Math.max(8, Math.round(h));
  const key = `hud_panel_${W}x${H}_${fill.toString(16)}_${Math.round(alpha * 100)}_${Math.round(radius)}_${Math.round(rim * 100)}`;
  if (scene.textures.exists(key)) return key;
  const pad = 6;
  const tex = scene.textures.createCanvas(key, W + pad * 2, H + pad * 2);
  const ctx = tex.getContext();
  roundRectPath(ctx, pad, pad + 4, W, H, radius);
  ctx.fillStyle = 'rgba(8,18,40,0.22)';
  ctx.fill();
  roundRectPath(ctx, pad, pad, W, H, radius);
  ctx.fillStyle = rgba(fill, alpha);
  ctx.fill();
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, pad, 0, pad + H);
  g.addColorStop(0, 'rgba(255,255,255,0.20)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = g;
  ctx.fillRect(pad, pad, W, H);
  ctx.restore();
  if (rim > 0) {
    roundRectPath(ctx, pad + 1, pad + 1, W - 2, H - 2, Math.max(0, radius - 1));
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255,255,255,${rim})`;
    ctx.stroke();
  }
  tex.refresh();
  return key;
}

function text(scene, x, y, str, px, opts = {}) {
  const t = scene.add.text(x, y, str, {
    fontFamily: opts.emoji ? EMOJI_FONT : FONT,
    fontSize: `${px}px`,
    fontStyle: opts.weight || 'bold',
    color: opts.color || '#ffffff',
    stroke: opts.stroke === false ? undefined : STROKE,
    strokeThickness: opts.stroke === false ? 0 : Math.max(3, Math.round(px * (opts.strokeMul || 0.16))),
    align: opts.align || 'left',
    resolution: 2,
  });
  if (opts.shadow !== false) t.setShadow(0, Math.max(2, Math.round(px * 0.06)), 'rgba(10,20,40,0.35)', 0, true, true);
  return t;
}

export class HudScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Hud', active: false });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.W = W;
    this.H = H;
    const st = Math.max(0, Number(this.registry.get('safeTop')) || 0);
    const sb = Math.max(0, Number(this.registry.get('safeBottom')) || 0);
    this.st = st;
    this.sb = sb;
    const top = LAYOUT.hudTop + st;

    this.state = null;
    this.hidden = false;
    this.beat = null;   // scene objects are reused across restarts: never inherit a dead tween
    this.offs = [];
    this.root = this.add.container(0, 0);
    const add = (...objs) => {
      this.root.add(objs);
      return objs[0];
    };

    // --- Height + points (top-left) -----------------------------------------
    this.hStr = fmtM(0);
    this.lastHeight = 0;
    this.heightTxt = add(text(this, 22, top - 8, this.hStr, 56, { strokeMul: 0.15 }));
    this.dispScore = 0;
    this.scoreStr = `⭐ ${fmtInt(0)}`;
    this.scoreTxt = add(text(this, 26, top + 62, this.scoreStr, 30, { emoji: true }));

    // --- Combo badge (under the points) --------------------------------------
    this.combo = 0;
    this.comboBg = add(this.add.image(22, top + 130, panelTexture(this, 132, 48, 0xff7a2f, 0.95)).setOrigin(0, 0.5));
    this.comboTxt = add(text(this, 22 + 6 + 66, top + 128, '🔥 ×2', 28, { emoji: true }).setOrigin(0.5));
    this.comboBg.setVisible(false);
    this.comboTxt.setVisible(false);

    // --- Mode label (top centre) ------------------------------------------------
    const label = this.modeLabel();
    this.modeTxt = text(this, 0, 0, label, 20, { strokeMul: 0.2, shadow: false });
    const mw = Math.ceil(this.modeTxt.width + 30);
    this.modeBg = add(this.add.image(W / 2 + 4, top + 12, panelTexture(this, mw, 36, NAVY, 0.42, { rim: 0.18 })));
    this.modeTxt.setOrigin(0.5).setPosition(W / 2 + 4, top + 10);
    add(this.modeTxt);

    // --- Next block preview (left of the pause button) ------------------------
    const nextRight = W - EDGE - PAUSE_BTN - 8;
    const ncx = nextRight - NEXT_BOX_W / 2;
    const ncy = st + EDGE + PAUSE_BTN / 2;
    this.nextBg = add(this.add.image(ncx, ncy, panelTexture(this, NEXT_BOX_W, NEXT_BOX_H, NAVY, 0.4, { radius: 20 })));
    this.nextLbl = add(text(this, ncx, ncy - 30, S.next, 16, { strokeMul: 0.22, shadow: false }).setOrigin(0.5));
    this.nextImg = add(this.add.image(ncx, ncy + 12, '__WHITE').setVisible(false));
    this.nextI = -1;

    // --- Hearts (below the pause button) --------------------------------------
    const hy = st + EDGE + PAUSE_BTN + 30;
    const hcx = W - EDGE - 78;
    this.heartBg = add(this.add.image(hcx, hy, panelTexture(this, 156, 50, NAVY, 0.4)));
    this.hearts = [];
    for (let k = 0; k < LIVES; k++) {
      const hx = hcx + (k - (LIVES - 1) / 2) * HEART_GAP;
      this.hearts.push(add(text(this, hx, hy, '❤️', 34, { emoji: true, stroke: false, shadow: false }).setOrigin(0.5)));
    }
    this.lives = LIVES;

    // --- Weather chip (under the hearts) ---------------------------------------
    this.wxY = hy + 62;
    this.wxBg = add(this.add.image(W - EDGE, this.wxY, '__WHITE').setOrigin(1, 0.5));
    this.wxEmoji = add(text(this, 0, this.wxY, '', 34, { emoji: true, stroke: false }).setOrigin(0.5));
    this.wxName = add(text(this, 0, this.wxY - 11, '', 22, { strokeMul: 0.2 }).setOrigin(0, 0.5));
    this.wxLeft = add(text(this, 0, this.wxY + 14, '', 17, { color: '#d9ecff', strokeMul: 0.22, shadow: false }).setOrigin(0, 0.5));
    this.wxType = null;
    this.wxLeftN = null;
    this.setWeatherVisible(false);

    // --- Flood distance pill (bottom centre) -----------------------------------
    this.waterY = H - sb - 64;
    this.waterBg = add(this.add.image(W / 2, this.waterY, '__WHITE'));
    this.waterTxt = add(text(this, W / 2, this.waterY - 1, '', 26, { emoji: true, strokeMul: 0.18 }).setOrigin(0.5));
    this.waterLevel = -1;
    this.waterStr = '';
    this.waterAt = -1e9;
    this.waterPulse = null;
    this.waterBg.setVisible(false);
    this.waterTxt.setVisible(false);

    // --- Wobble meter (left edge) ----------------------------------------------
    const wmTop = Math.round(H * 0.36);
    const wmH = Math.round(H * 0.2);
    this.wm = { x: 14, top: wmTop, h: wmH, w: 12 };
    this.wmBg = add(this.add.image(this.wm.x + this.wm.w / 2, wmTop + wmH / 2,
      panelTexture(this, 18, wmH + 6, NAVY, 0.34, { radius: 9, rim: 0.35 })));
    this.wmFill = add(this.add.graphics());
    this.wmIcon = add(text(this, this.wm.x + this.wm.w / 2, wmTop + wmH + 26, '〰️', 22, { emoji: true, stroke: false }).setOrigin(0.5));
    this.wmVal = -1;
    this.wmAlpha = 0.4;
    this.wmParts = [this.wmBg, this.wmFill, this.wmIcon];
    for (const o of this.wmParts) o.setAlpha(this.wmAlpha);
    this.drawWobble(0);

    // --- Hint ----------------------------------------------------------------
    this.hint = add(text(this, W / 2, Math.round(H * 0.45), '', 44, { strokeMul: 0.14 }).setOrigin(0.5).setVisible(false));
    this.hintTween = null;

    // --- Banner (weather events) -------------------------------------------------
    this.banner = this.add.container(W / 2, Math.round(H * 0.6)).setVisible(false);
    this.bannerBg = this.add.image(0, 0, panelTexture(this, 600, 252, NAVY, 0.78, { radius: 40, rim: 0.3 }));
    this.bannerEmoji = text(this, 0, -62, '', 92, { emoji: true, stroke: false }).setOrigin(0.5);
    this.bannerTitle = text(this, 0, 22, '', 52, { strokeMul: 0.14 }).setOrigin(0.5);
    this.bannerSub = text(this, 0, 80, '', 25, { color: '#d9ecff', strokeMul: 0.2, shadow: false, align: 'center' }).setOrigin(0.5);
    this.bannerSub.setWordWrapWidth(540, true);
    this.banner.add([this.bannerBg, this.bannerEmoji, this.bannerTitle, this.bannerSub]);
    this.root.add(this.banner);
    this.bannerTimer = null;
    this.bannerTween = null;

    // --- Toast -----------------------------------------------------------------
    this.toast = this.add.container(W / 2, H - sb - 150).setVisible(false);
    this.toastBg = this.add.image(0, 0, '__WHITE');
    this.toastTxt = text(this, 0, -1, '', 30, { strokeMul: 0.18, emoji: true }).setOrigin(0.5);
    this.toast.add([this.toastBg, this.toastTxt]);
    this.root.add(this.toast);
    this.toastTween = null;
    this.toastTimer = null;
    this.pendingToast = null;

    // --- Bus ---------------------------------------------------------------------
    this.offs.push(
      bus.on('hud:state', (s) => { this.state = s; }),
      bus.on('hud:banner', (b) => this.showBanner(b)),
      bus.on('hud:toast', (t) => this.showToast(t)),
      bus.on('hud:hint', (h) => this.showHint(h)),
      bus.on('hud:hide', () => this.hideAll()),
    );
    this.events.once('shutdown', this.cleanup, this);

    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 280, ease: 'Quad.easeOut' });
    bus.emit('hud:ready');
  }

  modeLabel() {
    const game = this.scene.get('Game');
    const mode = game && game.mode;
    if (mode === 'daily') return S.dailyN(game.dayNumber ?? '?');
    return S.practiceLabel;
  }

  cleanup() {
    for (const off of this.offs) off();
    this.offs.length = 0;
    if (this.bannerTimer) this.bannerTimer.remove(false);
    if (this.toastTimer) this.toastTimer.remove(false);
    this.bannerTimer = null;
    this.toastTimer = null;
    this.pendingToast = null;
    this.state = null;
  }

  /**
   * Banner centre: just below the drop line, so it never hides the landing zone
   * (tower top + ghost) while the player aims; kept clear of the flood pill.
   */
  bannerY(bh) {
    const below = LAYOUT.dropLineY + 56 + bh / 2;
    const maxBottom = this.waterY - 26 - 14;
    return Math.round(Math.min(below, maxBottom - bh / 2));
  }

  // -------------------------------------------------------------------------
  // Per-frame: apply the latest state (texts only when their string changes)
  // -------------------------------------------------------------------------
  update(time, delta) {
    const s = this.state;
    if (!s || this.hidden) return;
    const dt = Math.min(delta, 100);

    // height
    const hs = fmtM(s.heightM);
    if (hs !== this.hStr) {
      const up = s.heightM > this.lastHeight;
      this.hStr = hs;
      this.heightTxt.setText(hs);
      if (up) this.pulse(this.heightTxt, 1.08);
    }
    this.lastHeight = s.heightM;

    // points (count up)
    if (this.dispScore !== s.score) {
      const diff = s.score - this.dispScore;
      const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt / 90)));
      this.dispScore = Math.abs(step) >= Math.abs(diff) ? s.score : this.dispScore + step;
      const str = `⭐ ${fmtInt(this.dispScore)}`;
      if (str !== this.scoreStr) {
        this.scoreStr = str;
        this.scoreTxt.setText(str);
      }
      if (this.dispScore === s.score) this.pulse(this.scoreTxt, 1.12);
    }

    if (s.lives !== this.lives) this.setLives(s.lives, s.maxLives || LIVES);
    if (s.combo !== this.combo) this.setCombo(s.combo);
    this.setNext(s.next);
    this.setWeather(s.weather);
    this.setWater(s.waterDistM, time);
    this.drawWobble(s.wobble || 0);
    // the meter steps forward when the tower actually moves (with hysteresis)
    const wob = s.wobble || 0;
    const wa = wob > 0.15 ? 1 : wob < 0.08 ? 0.4 : this.wmAlpha;
    if (wa !== this.wmAlpha) {
      this.wmAlpha = wa;
      this.tweens.killTweensOf(this.wmParts);
      this.tweens.add({ targets: this.wmParts, alpha: wa, duration: wa > 0.5 ? 150 : 600 });
    }
  }

  /** Quick scale pop (no text re-render). */
  pulse(obj, to) {
    if (obj.__pulse) obj.__pulse.stop();
    obj.setScale(1);
    obj.__pulse = this.tweens.add({
      targets: obj,
      scaleX: to,
      scaleY: to,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => { obj.__pulse = null; obj.setScale(1); },
    });
    return obj;
  }

  setLives(lives, max) {
    const prev = this.lives;
    this.lives = lives;
    for (let k = 0; k < this.hearts.length; k++) {
      const h = this.hearts[k];
      const full = k < lives;
      const glyph = full ? '❤️' : '🤍';
      if (h.text !== glyph) h.setText(glyph);
      h.setAlpha(k < max ? (full ? 1 : 0.6) : 0);
    }
    if (lives < prev) {
      const h = this.hearts[Math.min(lives, this.hearts.length - 1)];
      if (h) {
        h.setScale(1.7);
        this.tweens.add({ targets: h, scale: 1, duration: 380, ease: 'Back.easeOut' });
        this.tweens.add({ targets: h, angle: { from: -18, to: 0 }, duration: 380, ease: 'Elastic.easeOut' });
      }
      this.pulse(this.heartBg, 1.06);
    } else if (lives > prev) {
      const h = this.hearts[Math.max(0, lives - 1)];
      if (h) {
        h.setScale(0.3);
        this.tweens.add({ targets: h, scale: 1, duration: 520, ease: 'Back.easeOut', easeParams: [3] });
      }
    }
    // last heart beats
    const last = this.hearts[0];
    if (lives === 1 && !this.beat) {
      this.beat = this.tweens.add({ targets: last, scale: 1.18, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (lives !== 1 && this.beat) {
      this.beat.stop();
      this.beat = null;
      last.setScale(1);
    }
  }

  setCombo(n) {
    const prev = this.combo;
    this.combo = n;
    const show = n >= 2;
    this.comboBg.setVisible(show);
    this.comboTxt.setVisible(show);
    if (!show) return;
    this.comboTxt.setText(`🔥 ×${n}`);
    if (n > prev) {
      for (const o of [this.comboBg, this.comboTxt]) {
        if (o.__pop) o.__pop.stop();
        o.setScale(1.35);
        o.__pop = this.tweens.add({ targets: o, scale: 1, duration: 320, ease: 'Back.easeOut' });
      }
    }
  }

  setNext(spec) {
    const idx = spec ? spec.i : -1;
    if (idx === this.nextI) return;
    this.nextI = idx;
    if (!spec) {
      this.nextImg.setVisible(false);
      return;
    }
    const key = ensureTexture(this, spec);
    const img = this.nextImg.setTexture(key).setVisible(true);
    const sc = Math.min(NEXT_FIT_W / img.width, NEXT_FIT_H / img.height, 0.85);
    img.setScale(sc * 0.4);
    this.tweens.add({ targets: img, scale: sc, duration: 260, ease: 'Back.easeOut' });
  }

  setWeatherVisible(on) {
    for (const o of [this.wxBg, this.wxEmoji, this.wxName, this.wxLeft]) o.setVisible(on);
  }

  setWeather(w) {
    const type = w ? w.type : null;
    const left = w && Number.isFinite(w.blocksLeft) ? w.blocksLeft : null;
    if (type === this.wxType && left === this.wxLeftN) return;
    const changedType = type !== this.wxType;
    this.wxType = type;
    this.wxLeftN = left;
    const info = type ? WEATHER_INFO[type] : null;
    if (!info) {
      this.setWeatherVisible(false);
      return;
    }
    if (changedType) {
      this.wxEmoji.setText(info.emoji);
      this.wxName.setText(info.name);
    }
    this.wxLeft.setText(left !== null && left > 0 ? S.blocksLeft(left) : '');
    const textW = Math.max(this.wxName.width, this.wxLeft.width);
    const w2 = Math.ceil((20 + 40 + 10 + textW + 22) / 8) * 8;
    const right = this.W - EDGE;
    this.wxBg.setTexture(panelTexture(this, w2, 64, NAVY, 0.45, { radius: 24 }));
    this.wxBg.setOrigin((w2 + 6) / (w2 + 12), 0.5).setPosition(right, this.wxY);
    const x0 = right - w2;
    this.wxEmoji.setPosition(x0 + 20 + 20, this.wxY);
    const hasLeft = this.wxLeft.text !== '';
    this.wxName.setPosition(x0 + 20 + 40 + 10, hasLeft ? this.wxY - 11 : this.wxY);
    this.wxLeft.setPosition(x0 + 20 + 40 + 10, this.wxY + 15);
    this.setWeatherVisible(true);
    this.wxLeft.setVisible(hasLeft);
    if (changedType) {
      for (const o of [this.wxBg, this.wxEmoji, this.wxName, this.wxLeft]) {
        o.setAlpha(0);
        this.tweens.add({ targets: o, alpha: 1, duration: 260 });
      }
      this.pulse(this.wxEmoji, 1.3);
    }
  }

  setWater(distM, time) {
    const show = distM !== null && distM !== undefined && Number.isFinite(distM);
    if (!show) {
      if (this.waterBg.visible) {
        this.waterBg.setVisible(false);
        this.waterTxt.setVisible(false);
      }
      return;
    }
    const d = Math.max(0, distM);
    const level = d < WARN_M ? 2 : d < WARN_M * 1.5 ? 1 : 0;
    let str = this.waterStr;
    if (time - this.waterAt >= WATER_TEXT_MS || level !== this.waterLevel || !this.waterBg.visible) {
      str = S.waterBelow(fmtM(d));
      this.waterAt = time;
    }
    const wasHidden = !this.waterBg.visible;
    if (str !== this.waterStr || level !== this.waterLevel) {
      this.waterStr = str;
      this.waterTxt.setText(str);
      const fill = level === 2 ? 0xe5483b : level === 1 ? 0xf39a2b : 0x1f6fb2;
      const pw = Math.ceil((this.waterTxt.width + 40) / 16) * 16;
      this.waterBg.setTexture(panelTexture(this, pw, 52, fill, 0.9));
      if (level !== this.waterLevel) {
        if (this.waterPulse) {
          this.waterPulse.stop();
          this.waterPulse = null;
          this.waterBg.setScale(1);
          this.waterTxt.setScale(1);
        }
        if (level === 2) {
          this.waterPulse = this.tweens.add({
            targets: [this.waterBg, this.waterTxt], scale: 1.08, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
        }
        this.waterLevel = level;
      }
    }
    if (wasHidden) {
      this.waterBg.setVisible(true);
      this.waterTxt.setVisible(true);
      this.waterBg.y = this.waterY + 40;
      this.waterTxt.y = this.waterY + 39;
      this.tweens.add({ targets: this.waterBg, y: this.waterY, duration: 320, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.waterTxt, y: this.waterY - 1, duration: 320, ease: 'Back.easeOut' });
    }
  }

  drawWobble(v) {
    const q = Math.round(Math.min(1, Math.max(0, v)) * 60) / 60;
    if (q === this.wmVal) return;
    this.wmVal = q;
    const { x, top, h, w } = this.wm;
    const g = this.wmFill;
    g.clear();
    const fh = Math.round(h * q);
    if (fh <= 0) return;
    // green -> yellow -> red
    const t = q;
    const r = t < 0.5 ? Math.round(91 + (247 - 91) * (t / 0.5)) : Math.round(247 + (229 - 247) * ((t - 0.5) / 0.5));
    const gg = t < 0.5 ? Math.round(191 + (201 - 191) * (t / 0.5)) : Math.round(201 + (72 - 201) * ((t - 0.5) / 0.5));
    const b = t < 0.5 ? Math.round(90 + (72 - 90) * (t / 0.5)) : Math.round(72 + (59 - 72) * ((t - 0.5) / 0.5));
    g.fillStyle((r << 16) | (gg << 8) | b, 1);
    g.fillRoundedRect(x, top + h - fh, w, fh, Math.min(6, fh / 2));
  }

  // -------------------------------------------------------------------------
  // Banner / toast / hint / hide
  // -------------------------------------------------------------------------
  showBanner(b) {
    if (!b || this.hidden) return;
    this.bannerEmoji.setText(b.emoji || '');
    this.bannerTitle.setText(b.title || '');
    this.bannerSub.setText(b.subtitle || '');
    const hasSub = !!b.subtitle;
    const subH = hasSub ? this.bannerSub.height : 0;
    // layout from the panel top: emoji, title, optional subtitle
    const emojiC = 72;
    const titleC = 164;
    const subTop = 198;
    const bh = Math.round(hasSub ? subTop + subH + 30 : titleC + 34 + 28);
    this.bannerBg.setTexture(panelTexture(this, 600, bh, NAVY, 0.78, { radius: 40, rim: 0.3 }));
    this.bannerEmoji.y = -bh / 2 + emojiC;
    this.bannerTitle.y = -bh / 2 + titleC;
    this.bannerSub.y = -bh / 2 + subTop + subH / 2;
    if (this.bannerTween) this.bannerTween.stop();
    if (this.bannerTimer) this.bannerTimer.remove(false);
    const c = this.banner;
    c.setVisible(true).setAlpha(0).setScale(0.6);
    c.y = this.bannerY(bh);
    this.bannerH = bh;
    this.bannerEmoji.setScale(0.4).setAngle(-14);
    this.tweens.add({ targets: this.bannerEmoji, scale: 1, angle: 0, duration: 520, ease: 'Back.easeOut', easeParams: [2.6] });
    this.bannerTween = this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.bannerTimer = this.time.delayedCall(BANNER_HOLD_MS + 300, () => {
      this.bannerTimer = null;
      this.bannerTween = this.tweens.add({
        targets: c, alpha: 0, y: c.y - 40, scale: 0.92, duration: 360, ease: 'Quad.easeIn',
        onComplete: () => {
          c.setVisible(false);
          this.bannerTween = null;
          const t = this.pendingToast;
          this.pendingToast = null;
          if (t) this.showToast(t);
        },
      });
    });
  }

  showToast(t) {
    if (!t || !t.text || this.hidden) return;
    // Never stack a toast on the event banner: show it once the banner has gone.
    const y0 = this.H - this.sb - 150;
    if (this.banner.visible && Math.abs(y0 - this.banner.y) < (this.bannerH || 260) / 2 + 40) {
      this.pendingToast = t;
      return;
    }
    this.toastTxt.setText(t.text);
    this.toastTxt.setColor(t.color || '#ffffff');
    const pw = Math.ceil((this.toastTxt.width + 56) / 16) * 16;
    this.toastBg.setTexture(panelTexture(this, pw, 62, NAVY, 0.85, { rim: 0.25 }));
    if (this.toastTween) this.toastTween.stop();
    if (this.toastTimer) this.toastTimer.remove(false);
    const c = this.toast;
    c.setVisible(true).setAlpha(0).setScale(0.8);
    c.y = y0 + 30;
    this.toastTween = this.tweens.add({ targets: c, alpha: 1, scale: 1, y: y0, duration: 260, ease: 'Back.easeOut' });
    this.toastTimer = this.time.delayedCall(TOAST_HOLD_MS, () => {
      this.toastTimer = null;
      this.toastTween = this.tweens.add({
        targets: c, alpha: 0, y: y0 - 30, duration: 300, ease: 'Quad.easeIn',
        onComplete: () => { c.setVisible(false); this.toastTween = null; },
      });
    });
  }

  showHint(h) {
    const str = h && h.text ? h.text : null;
    if (this.hintTween) {
      this.hintTween.stop();
      this.hintTween = null;
    }
    if (!str || this.hidden) {
      if (this.hint.visible) {
        this.tweens.add({
          targets: this.hint, alpha: 0, scale: 0.8, duration: 180,
          onComplete: () => this.hint.setVisible(false),
        });
      }
      return;
    }
    if (this.hint.text !== str) this.hint.setText(str);
    this.hint.setVisible(true).setAlpha(1).setScale(1);
    this.hintTween = this.tweens.add({
      targets: this.hint, scale: 1.07, alpha: 0.72, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  hideAll() {
    if (this.hidden) return;
    this.hidden = true;
    if (this.hintTween) this.hintTween.stop();
    if (this.waterPulse) this.waterPulse.stop();
    if (this.beat) this.beat.stop();
    this.tweens.add({ targets: this.root, alpha: 0, duration: 420, ease: 'Quad.easeOut' });
  }
}

export default HudScene;
