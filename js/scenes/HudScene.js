// In-game HUD (screen space): height + points, next block, hearts, weather chip,
// combo badge, flood distance, wobble meter, event banners, toasts and the tap hint.
// Driven entirely by bus events from GameScene; texts re-render only on change.
import { LAYOUT, LIVES, FONT, COLORS, WATER, PX_PER_M, SCORING, COACH, STAGES, DUEL, TURNS } from '../config.js';
import { bus } from '../core/bus.js';
import { S, WEATHER_INFO, VISITOR_INFO } from '../core/strings.js';
import { fmtM, fmtInt } from '../core/format.js';
import { ensureTexture } from '../game/blocks.js';

// Text font first: emoji fonts also contain (blank-looking) digit glyphs.
const EMOJI_FONT = `${FONT}, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
const STROKE = '#' + COLORS.textStroke.toString(16).padStart(6, '0');
const NAVY = 0x1d2b45;
const PAUSE_BTN = 96;      // DOM pause button: top-right 96×96 logical px, 6 px from the edges
const EDGE = 6;
// The HUD lives in its own band above the crane jib (two rows), so it never hides the trolley or hook.
const ROW1 = 37;           // centre of row 1 (height, weather chip, hearts)
const ROW2 = 107;          // centre of row 2 (points, combo, next block)
const ROW3 = 160;          // centre of row 3 (Uitdagersreeks: the weather chip, or whose turn it is), above the jib
const NEXT_BOX_W = 96;
const NEXT_BOX_H = 66;
const NEXT_FIT_W = 80;
const NEXT_FIT_H = 34;
const HEART_GAP = 38;
const CHIP_CX = 318;       // weather chip centre (between the height and the hearts pill, which starts at x 432)
const CHIP_MAX_W = 212;   // keeps the chip clear of the hearts pill (right edge <= 424)
const WATER_TEXT_MS = 500;
const WARN_M = WATER.warnPx / PX_PER_M;
const BANNER_W = 640;
const BANNER_H = 150;
const BANNER_HOLD_MS = 2200;   // at least; a longer banner or toast stays until it can be read (readMs)
const TOAST_HOLD_MS = 2200;
const READ_MAX_MS = 4200;
const SAYING_HOLD_MS = 3800;   // a saying toast stays a little longer: it is meant to be read
const SAYING_MAX_MS = 5200;    // ...and longer still with its English meaning
const SAYING_RETRY_MS = 500;   // how often a waiting saying checks whether banner, hint and toast are clear
const SAYING_MAX_WAIT_MS = 9000; // then it is skipped: the tower has moved on
/** How long a message stays: long enough to read (about 20 characters a second), at least `min`. */
const readMs = (text, min) => Math.min(READ_MAX_MS, Math.max(min, 900 + String(text || '').length * 55));
const WOBBLE_W = 18;
const COACH_W = 620;        // widest first-game hint pill
// Uitdagersreeks (1.11): each player's name and hearts at the top (you left, them right), Wedloop's race
// track on the right edge (a little bigger than 1.9's, with both names and how far to 50 m), and Blok vir
// Blok's "whose turn" pill.
const PILL_H = 46;
const PILL_NAME_PX = 22;
const PILL_NAME_MAX = 10;   // characters of a name in a pill (then "…")
const PILL_HEART = 0.56;    // heart scale in a pill
const PILL_GAP = 25;        // between hearts
const TRACK_W = 26;         // Wedloop: the race track on the right edge (1.9 had 18)
const TRACK_DOT = 40;       // a player's marker on it
const YOU_TINT = 0xffc23d;
const THEM_TINT = 0x4fb3ff;
const LEAD_M = 1;           // Wedloop: who leads changes by this much before it's said
const LEAD_EVERY_MS = 5000; // ...and at most this often
const COACH_BELOW_TOP = 250; // hint centre: this far below the tower-top line (clear of the landing spot)

const rgba = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** Flood distance: whole metres when it isn't close (fewer text re-renders, easier to read). */
const fmtWater = (d) => (d >= 5 ? `${fmtInt(Math.round(d))}\u00a0m` : fmtM(d));

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

/** Hearts drawn in code: a full red one and an empty outline (an emoji 🤍 vanished on the pill). */
function heartTextures(scene) {
  const draw = (key, full) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, 44, 40);
    const ctx = tex.getContext();
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(22, 36);
      ctx.bezierCurveTo(4, 24, 2, 14, 6, 8);
      ctx.bezierCurveTo(10, 2, 19, 3, 22, 10);
      ctx.bezierCurveTo(25, 3, 34, 2, 38, 8);
      ctx.bezierCurveTo(42, 14, 40, 24, 22, 36);
      ctx.closePath();
    };
    path();
    if (full) {
      const g = ctx.createLinearGradient(0, 4, 0, 36);
      g.addColorStop(0, '#ff6b7f');
      g.addColorStop(1, '#d81b3c');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#8c1029';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(13, 12, 4, 2.6, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(29,43,69,0.55)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.setLineDash([5, 4]);
      ctx.stroke();
    }
    tex.refresh();
  };
  draw('hud_heart', true);
  draw('hud_heart_empty', false);
}

/** Wobble meter fill: green at the bottom to red at the top, cropped to the level each frame. */
function wobbleTexture(scene, h) {
  const key = `hud_wobble_${h}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, WOBBLE_W - 6, h);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, '#5bbf5a');
  g.addColorStop(0.5, '#f7c948');
  g.addColorStop(1, '#e5483b');
  ctx.fillStyle = g;
  roundRectPath(ctx, 0, 0, WOBBLE_W - 6, h, (WOBBLE_W - 6) / 2);
  ctx.fill();
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
    resolution: 1,
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
    const y1 = st + ROW1;
    const y2 = st + ROW2;
    heartTextures(this);

    this.state = null;
    this.hidden = false;
    this.beat = null;   // scene objects are reused across restarts: never inherit a dead tween
    this.offs = [];
    this.root = this.add.container(0, 0);
    const add = (...objs) => {
      this.root.add(objs);
      return objs[0];
    };

    // --- Row 1: height (left) ----------------------------------------------------
    this.hStr = fmtM(0);
    this.lastHeight = 0;
    this.heightTxt = text(this, 20, y1, this.hStr, 52, { strokeMul: 0.15 }).setOrigin(0, 0.5);
    this.heightHome = { x: 20, y: y1 };

    // --- Row 2: points + combo (left) ---------------------------------------------
    this.comboAnchor = null;   // (a match puts the combo beside the height: the scene is reused)
    this.dispScore = 0;
    this.scoreStr = `⭐ ${fmtInt(0)}`;
    this.scoreTxt = add(text(this, 24, y2, this.scoreStr, 30, { emoji: true }).setOrigin(0, 0.5));
    this.combo = 0;
    this.comboBg = add(this.add.image(0, y2, panelTexture(this, 120, 44, 0xff7a2f, 0.95)).setOrigin(0, 0.5));
    this.comboTxt = add(text(this, 0, y2 - 1, '🔥 ×2', 26, { emoji: true }).setOrigin(0.5));
    this.comboBg.setVisible(false);
    this.comboTxt.setVisible(false);

    // --- Row 2: next block (right, under the hearts) --------------------------------
    const nextRight = W - EDGE - PAUSE_BTN - 8;
    const ncx = nextRight - NEXT_BOX_W / 2;
    this.nextBg = add(this.add.image(ncx, y2 + 4, panelTexture(this, NEXT_BOX_W, NEXT_BOX_H, NAVY, 0.55, { radius: 18 })));
    this.nextLbl = add(text(this, ncx, y2 - 18, S.next, 20, { strokeMul: 0.22, shadow: false }).setOrigin(0.5));
    this.nextImg = add(this.add.image(ncx, y2 + 14, '__WHITE').setVisible(false));
    this.nextI = -1;

    // --- Row 1: hearts (left of the pause button) + progress pips to the next one ---
    const pillW = 26 + LIVES * HEART_GAP;
    const hcx = nextRight - pillW / 2;
    this.heartBg = add(this.add.image(hcx, y1, panelTexture(this, pillW, 48, NAVY, 0.7)));
    this.hearts = [];
    for (let k = 0; k < LIVES; k++) {
      const hx = hcx + (k - (LIVES - 1) / 2) * HEART_GAP;
      this.hearts.push(add(this.add.image(hx, y1, 'hud_heart').setScale(0.78)));
    }
    this.lives = LIVES;
    this.pips = [];
    const every = SCORING.heartEvery;
    for (let k = 0; k < every; k++) {
      const px = hcx + (k - (every - 1) / 2) * 14;
      this.pips.push(add(this.add.image(px, y1 + 30, 'fx_px').setDisplaySize(9, 9).setVisible(false)));
    }
    this.pipN = -1;

    // --- Row 1: weather chip (centre) ------------------------------------------------
    this.wxY = y1;
    this.wxBg = add(this.add.image(CHIP_CX, this.wxY, '__WHITE'));
    // Emoji are drawn once into textures (emojiTexture): drawing a big emoji glyph is slow, and done in the
    // frame a weather banner appeared it stalled that frame, just as the new block arrives and the player
    // starts to aim. The weather and visitor emoji are drawn ahead, one per frame (update).
    this.emojiQueue = [...Object.values(WEATHER_INFO), ...Object.values(VISITOR_INFO)].flatMap((i) => [[i.emoji, 72], [i.emoji, 32]])
      .concat(STAGES.slice(1).map((st) => [st.emoji, 72]));   // the stage banners' too
    this.wxEmoji = add(this.add.image(0, this.wxY, '__WHITE').setOrigin(0.5));
    this.wxName = add(text(this, 0, this.wxY - 11, '', 22, { strokeMul: 0.2 }).setOrigin(0, 0.5));
    this.wxLeft = add(text(this, 0, this.wxY + 14, '', 20, { color: '#d9ecff', strokeMul: 0.22, shadow: false }).setOrigin(0, 0.5));
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
    this.wm = { x: 10, top: wmTop, h: wmH, w: WOBBLE_W };
    this.wmBg = add(this.add.image(10 + WOBBLE_W / 2, wmTop + wmH / 2,
      panelTexture(this, WOBBLE_W, wmH + 6, NAVY, 0.5, { radius: 9, rim: 0.35 })));
    this.wmFill = add(this.add.image(10 + 3, wmTop + wmH, wobbleTexture(this, wmH)).setOrigin(0, 1));
    // the creak threshold: above this line the tower is in real trouble
    this.wmTick = add(this.add.image(10 + WOBBLE_W / 2, wmTop + wmH * (1 - 0.6), 'fx_px').setDisplaySize(WOBBLE_W + 6, 3));
    this.wmLbl = add(text(this, 10 + WOBBLE_W / 2, wmTop - 12, S.wobbleTitle, 20, { strokeMul: 0.22, shadow: false })
      .setOrigin(0, 0.5).setAngle(-90));
    // the heavy side, under the meter: place the next block on the other side to balance it
    this.wmSide = add(text(this, 10 + WOBBLE_W / 2, wmTop + wmH + 22, '', 26, { strokeMul: 0.2 }).setOrigin(0.5).setVisible(false));
    this.wmSideNow = 0;
    this.wmVal = -1;
    this.buildDuelHud(add);
    this.wmAlpha = 0.7;
    this.wmParts = [this.wmBg, this.wmFill, this.wmTick, this.wmLbl, this.wmSide];
    for (const o of this.wmParts) o.setAlpha(this.wmAlpha);
    this.drawWobble(0);

    // --- Hint (over the sea below the base, clear of the landing spot) ---------
    this.hint = add(text(this, W / 2, LAYOUT.dropLineY + st + 160, '', 40, { strokeMul: 0.14, emoji: true }).setOrigin(0.5).setVisible(false));
    this.hintTween = null;

    // --- Coach (first game only): a roomy pill over the sea, well below the landing spot ---------
    const game = this.scene.get('Game');
    this.reduced = !!(game && game.reducedMotion);
    this.coach = this.add.container(W / 2, LAYOUT.dropLineY + st + COACH_BELOW_TOP).setVisible(false);
    this.coachBg = this.add.image(0, 0, '__WHITE');
    this.coachTxt = text(this, 0, -1, '', 34, { strokeMul: 0.14, emoji: true, align: 'center' }).setOrigin(0.5);
    this.coachTxt.setWordWrapWidth(COACH_W - 72, true);
    this.coach.add([this.coachBg, this.coachTxt]);
    this.root.add(this.coach);
    this.coachTween = null;
    this.coachTimer = null;
    this.coachDelay = null;
    this.coachCur = null;       // the hint on show (or waiting), so a banner can pause and resume it
    this.pendingCoach = null;

    // --- Banner (weather events, visitors): compact, above the flood pill; a weather banner then flies into the chip
    this.banner = this.add.container(W / 2, this.bannerY()).setVisible(false);
    // where the banner starts (screen px): a climbing visitor keeps above it (js/game/visitors.js)
    this.registry.set('hudBannerTop', this.bannerY() - BANNER_H / 2);
    this.bannerBg = this.add.image(0, 0, panelTexture(this, BANNER_W, BANNER_H, NAVY, 0.82, { radius: 34, rim: 0.3 }));
    this.bannerEmoji = this.add.image(-BANNER_W / 2 + 70, 0, '__WHITE').setOrigin(0.5);
    this.bannerTitle = text(this, -BANNER_W / 2 + 130, -24, '', 44, { strokeMul: 0.14 }).setOrigin(0, 0.5);
    this.bannerSub = text(this, -BANNER_W / 2 + 130, 26, '', 24, { color: '#d9ecff', strokeMul: 0.2, shadow: false }).setOrigin(0, 0.5);
    this.bannerSub.setWordWrapWidth(BANNER_W - 130 - 22, true);
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
    this.pendingSaying = null;   // a milestone saying waiting for a clear screen
    this.sayingTimer = null;

    // --- Bus ---------------------------------------------------------------------
    this.offs.push(
      bus.on('hud:state', (s) => { this.state = s; }),
      bus.on('hud:banner', (b) => this.showBanner(b)),
      bus.on('hud:toast', (t) => this.showToast(t)),
      bus.on('hud:saying', (t) => this.showSaying(t)),
      bus.on('hud:hint', (h) => this.showHint(h)),
      bus.on('hud:coach', (c) => this.showCoach(c)),
      bus.on('hud:hide', (o) => this.hideAll(o)),
      bus.on('hud:duel', (d) => { this.duelState = d; }),
      // the results card takes over from the big height
      bus.on('game:over', () => this.tweens.add({ targets: this.heightTxt, alpha: 0, duration: 250 })),
    );
    this.events.once('shutdown', this.cleanup, this);

    this.root.setAlpha(0);
    this.heightTxt.setAlpha(0);
    this.tweens.add({ targets: [this.root, this.heightTxt], alpha: 1, duration: 280, ease: 'Quad.easeOut' });
    // which tower this is (the label used to sit in the HUD)
    this.showToast({ text: this.modeLabel(), color: '#ffe38c' });
    bus.emit('hud:ready');
  }

  modeLabel() {
    const game = this.scene.get('Game');
    const mode = game && game.mode;
    if (mode === 'daily') return `🏗️ ${S.dailyN(game.dayNumber ?? '?')}`;
    if (mode === 'duel') return `${game.turns ? '🧱' : '🏁'} ${S.duelVs(game.duel?.name || S.duelSomeone)}`;
    return `🧱 ${S.practiceLabel}`;
  }

  cleanup() {
    for (const off of this.offs) off();
    this.offs.length = 0;
    if (this.bannerTimer) this.bannerTimer.remove(false);
    if (this.toastTimer) this.toastTimer.remove(false);
    if (this.sayingTimer) this.sayingTimer.remove(false);
    this.sayingTimer = null;
    this.pendingSaying = null;
    if (this.coachTimer) this.coachTimer.remove(false);
    if (this.coachDelay) this.coachDelay.remove(false);
    this.bannerTimer = null;
    this.toastTimer = null;
    this.coachTimer = null;
    this.coachDelay = null;
    this.pendingToast = null;
    this.pendingCoach = null;
    this.state = null;
  }

  /** Banner centre: above the flood pill, well below the tower top (the event's effect stays visible). */
  bannerY() {
    return Math.round(this.waterY - 26 - BANNER_H / 2 - 16);
  }

  // -------------------------------------------------------------------------
  // Per-frame: apply the latest state (texts only when their string changes)
  // -------------------------------------------------------------------------
  update(time, delta) {
    if (this.emojiQueue?.length) this.emojiTexture(...this.emojiQueue.shift());   // one a frame, ahead of need
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
        this.placeCombo();
      }
      if (this.dispScore === s.score) this.pulse(this.scoreTxt, 1.12);
    }

    if (!this.duelHud) {
      if (s.lives !== this.lives) this.setLives(s.lives, s.maxLives || LIVES);
      this.setPips(s.lives < (s.maxLives || LIVES) ? s.heartProgress || 0 : -1);
    }
    // (Blok vir Blok: each player's run shows in their own pill)
    const combo = this.duelHud?.turns ? 0 : s.combo;
    if (combo !== this.combo) this.setCombo(combo);
    this.setNext(s.next);
    this.setWeather(this.duelHud?.turns ? null : s.weather);   // (Blok vir Blok: whose turn has row 3)
    this.setWater(s.waterDistM, time);
    if (this.duelHud) this.updateDuelHud(s, time);
    // the balance meter: how near the loose top is to tipping (its lean), or moving (its wobble)
    const lean = s.lean || 0;
    const wob = Math.max(s.wobble || 0, Math.min(1, Math.abs(lean)));
    this.drawWobble(wob);
    this.drawSide(lean);
    // the meter steps forward when the tower is in some trouble (with hysteresis)
    const wa = wob > 0.15 ? 1 : wob < 0.08 ? 0.7 : this.wmAlpha;
    if (wa !== this.wmAlpha) {
      this.wmAlpha = wa;
      this.tweens.killTweensOf(this.wmParts);
      this.tweens.add({ targets: this.wmParts, alpha: wa, duration: wa > 0.8 ? 150 : 600 });
    }
  }

  // -------------------------------------------------------------------------
  // Uitdagersreeks (1.11): both players at the top (name and hearts: you left, them right), so it is
  // plain there is someone on the other side. Wedloop: the race track on the right edge, a little
  // bigger than before, both markers named with how far each is to 50 m, and "X is voor!" when the lead
  // changes. Blok vir Blok: whose turn it is (and your time to aim) under the top rows.
  // -------------------------------------------------------------------------
  buildDuelHud(add) {
    this.duelHud = null;
    this.duelState = null;   // the scene is reused: never show the last match's heights
    const game = this.scene.get('Game');
    if (!game || !game.duel) return;
    const turns = !!game.turns;
    const y1 = this.st + ROW1;
    const y2 = this.st + ROW2;
    // the height moves down to row 2 (the points don't decide a match); the solo hearts pill goes
    this.heightTxt.setPosition(20, y2);
    this.heightHome = { x: 20, y: y2 };
    this.scoreTxt.setVisible(false);
    this.comboAnchor = this.heightTxt;
    for (const o of [this.heartBg, ...this.hearts, ...this.pips]) o.setVisible(false);
    // the weather chip goes to row 3 (Blok vir Blok shows whose turn there instead: its only weather is
    // a sabotage, which has its banner)
    this.wxY = this.st + ROW3;
    const max = turns ? TURNS.hearts : LIVES;
    const right = this.W - EDGE - PAUSE_BTN - 8;
    const pill = (side) => {
      const bg = add(this.add.image(0, y1, '__WHITE').setOrigin(side === 'left' ? 0 : 1, 0.5));
      const name = add(text(this, 0, y1 - 1, '', PILL_NAME_PX, { strokeMul: 0.2, emoji: true }).setOrigin(0, 0.5));
      const hearts = [];
      for (let k = 0; k < max; k++) hearts.push(add(this.add.image(0, y1, 'hud_heart').setScale(PILL_HEART)));
      const extra = add(text(this, 0, y1 - 1, '', 20, { strokeMul: 0.2, emoji: true }).setOrigin(0, 0.5).setVisible(false));
      return { side, bg, name, hearts, extra, key: '' };
    };
    const hud = {
      turns, max, right,
      you: pill('left'),
      them: pill('right'),
      track: null,
      turn: null,
      lead: null,
      leadAt: -1e9,
    };
    if (turns) {
      const y = this.st + ROW3;
      const bg = add(this.add.image(this.W / 2, y, '__WHITE').setVisible(false));
      const label = add(text(this, this.W / 2, y - 1, '', 28, { strokeMul: 0.18, emoji: true }).setOrigin(0.5).setVisible(false));
      hud.turn = { bg, label, key: '' };
    } else {
      hud.track = this.buildRaceTrack(add);
    }
    this.duelHud = hud;
  }

  /** Wedloop: 0-50 m on the right edge, the height marks (gold once you got there first, blue them), both markers. */
  buildRaceTrack(add) {
    const H = this.H;
    const top = Math.round(H * 0.25);
    const bottom = Math.round(H * 0.52);   // (clear of the island's sign at the start)
    const x = this.W - 10 - TRACK_W / 2;
    const dot = (key, fill, label) => {
      if (this.textures.exists(key)) return key;
      const tex = this.textures.createCanvas(key, TRACK_DOT + 4, TRACK_DOT + 4);
      const ctx = tex.getContext();
      const c = (TRACK_DOT + 4) / 2;
      ctx.beginPath();
      ctx.arc(c, c, TRACK_DOT / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(fill, 1);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1d2b45';
      ctx.stroke();
      ctx.fillStyle = '#1d2b45';
      ctx.font = `900 ${Math.round(TRACK_DOT * 0.42)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, c, c + 1);
      tex.refresh();
      return key;
    };
    const bg = add(this.add.image(x, (top + bottom) / 2, panelTexture(this, TRACK_W, bottom - top + 18, NAVY, 0.55, { radius: 12, rim: 0.4 })));
    const ticks = DUEL.marks.map((m) => add(this.add.image(x, this.trackY(m, top, bottom), 'fx_px').setDisplaySize(TRACK_W + 10, 5).setAlpha(0.8)));
    const flag = add(text(this, x - 2, top - 24, '🏁', 34, { emoji: true, stroke: false }).setOrigin(0.5));
    const them = add(this.add.image(x, bottom, dot('hud_dot_them2', THEM_TINT, '')));
    const you = add(this.add.image(x, bottom, dot('hud_dot_you2', YOU_TINT, '')));
    // each marker's name and how far to the finish ride along beside it
    const themLabel = add(text(this, x - TRACK_DOT / 2 - 6, bottom, '', 24, { strokeMul: 0.22, emoji: true }).setOrigin(1, 0.5));
    const youLabel = add(text(this, x - TRACK_DOT / 2 - 6, bottom, '', 24, { strokeMul: 0.22 }).setOrigin(1, 0.5));
    const t = { x, top, bottom, bg, ticks, flag, them, you, themLabel, youLabel, youY: bottom, themY: bottom, youStr: '', themStr: '', claimed: '' };
    for (const o of [bg, ...ticks, flag, them, you, themLabel, youLabel]) o.setAlpha(0.95);
    return t;
  }

  trackY(m, top, bottom) {
    const k = Math.max(0, Math.min(1, m / DUEL.goalM));
    return Math.round(bottom - k * (bottom - top));
  }

  /** One player's pill: "Anna ♥♥♡" (their turn in Blok vir Blok: gold). Redrawn only when it changes. */
  setPill(p, { name, lives, max, active = false, extra = '' }) {
    const shown = Number.isInteger(lives);
    const key = `${name}|${shown ? lives : '-'}|${max}|${active}|${extra}`;
    if (key === p.key) return;
    const lost = shown && p.lives != null && lives < p.lives;
    p.key = key;
    p.lives = shown ? lives : null;
    p.extra.setText(extra).setVisible(!!extra);
    const heartsW = shown ? max * PILL_GAP : 0;
    const extraW = extra ? p.extra.width + 8 : 0;
    // each pill has half the row (a long, wide name gets shorter until it fits)
    const maxW = Math.floor((this.duelHud.right - 16) / 2) - 8;
    let len = Math.min(name.length, PILL_NAME_MAX);
    const fit = (n) => (n < name.length ? `${name.slice(0, Math.max(1, n - 1))}…` : name);
    p.name.setText(fit(len));
    while (len > 3 && 16 + p.name.width + (shown ? 10 + heartsW : 0) + extraW + 12 > maxW) p.name.setText(fit(--len));
    const w = Math.ceil((16 + p.name.width + (shown ? 10 + heartsW : 0) + extraW + 12) / 8) * 8;
    const x0 = p.side === 'left' ? 16 : this.duelHud.right - w;
    const y = p.bg.y;
    p.bg.setTexture(panelTexture(this, w, PILL_H, active ? 0x9a6a00 : NAVY, active ? 0.92 : 0.72, { rim: active ? 0.55 : 0.3 }))
      .setPosition(p.side === 'left' ? x0 : x0 + w, y);
    p.name.setPosition(x0 + 16, y - 1).setColor(p.side === 'left' ? '#ffe38c' : '#cfe9ff');
    let hx = x0 + 16 + p.name.width + 10 + PILL_GAP / 2;
    for (let k = 0; k < p.hearts.length; k++) {
      const h = p.hearts[k];
      h.setVisible(shown && k < max).setPosition(hx + k * PILL_GAP, y);
      h.setTexture(shown && k < lives ? 'hud_heart' : 'hud_heart_empty');
    }
    p.extra.setPosition(x0 + 16 + p.name.width + (shown ? 10 + heartsW : 0) + 4, y - 1);
    if (lost) {
      const h = p.hearts[Math.min(lives, p.hearts.length - 1)];
      if (h) {
        h.setScale(PILL_HEART * 1.6);
        this.tweens.add({ targets: h, scale: PILL_HEART, duration: 420, ease: 'Back.easeOut' });
      }
      this.pulse(p.bg, 1.06);
    }
  }

  updateDuelHud(s, time) {
    const hud = this.duelHud;
    const game = this.scene.get('Game');
    const youName = game?.duel?.youName || S.hudYou;
    if (hud.turns) {
      const t = s.turns;
      if (!t) return;
      const them = 1 - t.you;
      const oppName = t.names?.[them] || game?.duel?.name || S.duelSomeone;
      // a run of Perfeks shows (5 in a row earn a joker)
      const streak = (k) => (t.streaks?.[k] >= 2 ? `🔥${t.streaks[k]}` : '');
      const active = (k) => t.n > 0 && t.seat === k;
      this.setPill(hud.you, { name: t.names?.[t.you] || youName, lives: t.hearts[t.you], max: hud.max, active: active(t.you), extra: streak(t.you) });
      this.setPill(hud.them, { name: oppName, lives: t.hearts[them], max: hud.max, active: active(them), extra: streak(them) });
      this.setTurnPill(t, oppName);
      return;
    }
    // Wedloop: your hearts from the game, theirs from the match (a recording or Robot Rikus: full until it fell)
    const d = this.duelState;
    this.setPill(hud.you, { name: youName, lives: s.lives, max: hud.max });
    this.setPill(hud.them, { name: d?.name || game?.duel?.name || S.duelSomeone, lives: d && Number.isInteger(d.lives) ? Math.min(d.lives, hud.max) : null, max: hud.max });
    if (d) this.updateRaceTrack(d, time);
  }

  /** Blok vir Blok: "🎯 Jou beurt! 7" (gold) or "⏳ Anna se beurt…". */
  setTurnPill(t, oppName) {
    const tp = this.duelHud.turn;
    if (!t || t.n < 1) return;
    const mine = t.seat === t.you;
    const str = mine ? `🎯 ${S.turnsYourTurn}${t.left != null ? `  ${t.left}` : ''}` : `⏳ ${S.turnsTheirTurn(oppName)}`;
    const key = `${t.n}|${str}`;
    if (key === tp.key) return;
    const newTurn = tp.key.split('|')[0] !== String(t.n);
    tp.key = key;
    tp.label.setText(str).setVisible(true);
    const w = Math.ceil((tp.label.width + 44) / 8) * 8;
    tp.bg.setTexture(panelTexture(this, w, 52, mine ? 0xc98a00 : NAVY, mine ? 0.95 : 0.75, { rim: mine ? 0.6 : 0.3 })).setVisible(true);
    if (newTurn) {
      for (const o of [tp.bg, tp.label]) {
        if (o.__pop) o.__pop.stop();
        o.setScale(mine ? 1.3 : 1.1);
        o.__pop = this.tweens.add({ targets: o, scale: 1, duration: 360, ease: 'Back.easeOut' });
      }
    } else if (mine && t.left != null && t.left <= 3) {
      this.pulse(tp.label, 1.12);
    }
  }

  updateRaceTrack(d, time) {
    const t = this.duelHud.track;
    if (!t) return;
    const ease = 1 - Math.exp(-16 / 140);
    t.youY += (this.trackY(d.you, t.top, t.bottom) - t.youY) * ease;
    t.themY += (this.trackY(d.them, t.top, t.bottom) - t.themY) * ease;
    t.you.y = t.youY;
    t.them.y = t.themY;
    // the labels keep apart when the markers are close (yours above, theirs below)
    const gap = 30;
    let ly = t.youY;
    let lt = t.themY;
    if (Math.abs(ly - lt) < gap) {
      const mid = (ly + lt) / 2;
      const youAbove = d.you >= d.them;
      ly = mid + (youAbove ? -gap / 2 : gap / 2);
      lt = mid + (youAbove ? gap / 2 : -gap / 2);
    }
    t.youLabel.y = ly;
    t.themLabel.y = lt;
    const pct = (h) => `${Math.max(0, Math.min(100, Math.floor((100 * h) / DUEL.goalM)))}%`;
    const youStr = `${S.hudYou} ${pct(d.you)}`;
    const themName = d.name.length > PILL_NAME_MAX ? `${d.name.slice(0, PILL_NAME_MAX - 1)}…` : d.name;
    const themStr = `${d.badge ? `${d.badge} ` : ''}${themName} ${pct(d.them)}`;
    if (youStr !== t.youStr) {
      t.youStr = youStr;
      t.youLabel.setText(youStr).setColor('#ffe38c');
    }
    if (themStr !== t.themStr) {
      t.themStr = themStr;
      t.themLabel.setText(themStr).setColor('#cfe9ff');
    }
    const claimed = DUEL.marks.map((m) => d.claimed?.[m] || '-').join('');
    if (claimed !== t.claimed) {
      t.claimed = claimed;
      DUEL.marks.forEach((m, k) => {
        const who = d.claimed?.[m];
        t.ticks[k].setTint(who === 'you' ? YOU_TINT : who === 'them' ? THEM_TINT : 0xffffff);
      });
    }
    // who leads: said when it changes (by LEAD_M at least, not too often, once both are going)
    const hud = this.duelHud;
    const lead = d.you > d.them + LEAD_M ? 'you' : d.them > d.you + LEAD_M ? 'them' : hud.lead;
    if (lead && lead !== hud.lead) {
      const first = hud.lead === null;
      hud.lead = lead;
      if (!first && Math.max(d.you, d.them) >= 3 && time - hud.leadAt >= LEAD_EVERY_MS) {
        hud.leadAt = time;
        this.showToast({ text: lead === 'you' ? S.raceLeadYou : S.raceLeadThem(d.name), color: lead === 'you' ? '#ffe38c' : '#cfe9ff' });
      }
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
      h.setTexture(full ? 'hud_heart' : 'hud_heart_empty');
      h.setAlpha(k < max ? 1 : 0);
    }
    if (lives < prev) {
      const h = this.hearts[Math.min(lives, this.hearts.length - 1)];
      if (h) {
        h.setScale(1.4);
        this.tweens.add({ targets: h, scale: 0.78, duration: 380, ease: 'Back.easeOut' });
        this.tweens.add({ targets: h, angle: { from: -18, to: 0 }, duration: 380, ease: 'Elastic.easeOut' });
      }
      this.pulse(this.heartBg, 1.06);
    } else if (lives > prev) {
      const h = this.hearts[Math.max(0, lives - 1)];
      if (h) {
        h.setScale(0.25);
        this.tweens.add({ targets: h, scale: 0.78, duration: 520, ease: 'Back.easeOut', easeParams: [3] });
      }
    }
    // last heart beats
    const last = this.hearts[0];
    if (lives === 1 && !this.beat) {
      this.beat = this.tweens.add({ targets: last, scale: 0.92, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (lives !== 1 && this.beat) {
      this.beat.stop();
      this.beat = null;
      last.setScale(0.78);
    }
  }

  /** Small dots under the hearts: Perfeks collected towards the next heart (-1 hides them). */
  setPips(n) {
    if (n === this.pipN) return;
    this.pipN = n;
    for (let k = 0; k < this.pips.length; k++) {
      const p = this.pips[k];
      p.setVisible(n >= 0);
      p.setTint(k < n ? 0xffe38c : 0x9fb3d1).setAlpha(k < n ? 1 : 0.55);
    }
  }

  placeCombo() {
    const a = this.comboAnchor || this.scoreTxt;
    const x = a.x + a.width + 14;
    this.comboBg.x = x;
    this.comboTxt.x = x + 60 + 3;
  }

  setCombo(n) {
    const prev = this.combo;
    this.combo = n;
    const show = n >= 2;
    this.comboBg.setVisible(show);
    this.comboTxt.setVisible(show);
    if (!show) return;
    this.comboTxt.setText(`🔥 ×${n}`);
    this.placeCombo();
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
      this.wxEmoji.setTexture(this.emojiTexture(info.emoji, 32));
      this.wxName.setText(info.name);
    }
    this.wxLeft.setText(left !== null && left > 0 ? S.blocksLeft(left) : '');
    const textW = Math.max(this.wxName.width, this.wxLeft.width);
    const w2 = Math.min(CHIP_MAX_W, Math.ceil((16 + 40 + 8 + textW + 18) / 8) * 8);
    this.wxBg.setTexture(panelTexture(this, w2, 56, NAVY, 0.6, { radius: 22 }));
    const cx = this.duelHud ? this.W / 2 : CHIP_CX;   // (in a match the chip has row 3 to itself)
    this.wxBg.setPosition(cx, this.wxY);
    const x0 = cx - w2 / 2;
    this.wxEmoji.setPosition(x0 + 16 + 20, this.wxY);
    const hasLeft = this.wxLeft.text !== '';
    this.wxName.setPosition(x0 + 16 + 40 + 8, hasLeft ? this.wxY - 11 : this.wxY);
    this.wxLeft.setPosition(x0 + 16 + 40 + 8, this.wxY + 14);
    this.setWeatherVisible(true);
    this.wxLeft.setVisible(hasLeft);
    if (changedType) {
      for (const o of [this.wxBg, this.wxEmoji, this.wxName, this.wxLeft]) {
        o.setAlpha(0);
        this.tweens.add({ targets: o, alpha: 1, duration: 260, delay: this.banner.visible ? 1500 : 0 });
      }
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
      str = S.waterBelow(fmtWater(d));
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

  /** Crops a pre-drawn gradient bar (no Graphics re-tessellation per frame). */
  /** The arrow under the balance meter: the side the loose top leans to (none while it's about centred). */
  drawSide(lean) {
    const side = lean > 0.3 ? 1 : lean < -0.3 ? -1 : Math.abs(lean) > 0.2 ? this.wmSideNow : 0;
    const hot = Math.abs(lean) > 0.7;   // red near the tipping point, amber before
    if (side === this.wmSideNow && hot === this.wmSideHot) return;
    this.wmSideNow = side;
    this.wmSideHot = hot;
    this.wmSide.setVisible(side !== 0);
    if (side) this.wmSide.setText(side < 0 ? '◀' : '▶').setColor(hot ? '#ff6b5e' : '#ffc56e');
  }

  drawWobble(v) {
    const q = Math.round(Math.min(1, Math.max(0, v)) * 60) / 60;
    if (q === this.wmVal) return;
    this.wmVal = q;
    const { h } = this.wm;
    const fh = Math.round(h * q);
    this.wmFill.setVisible(fh > 0);
    if (fh > 0) this.wmFill.setCrop(0, h - fh, WOBBLE_W - 6, fh);
  }

  // -------------------------------------------------------------------------
  // Banner / toast / hint / hide
  // -------------------------------------------------------------------------
  /** An emoji at `px`, drawn once (same look as the HUD's emoji text) into a texture; returns its key. */
  emojiTexture(emoji, px) {
    const key = `hud_emo_${px}_${[...String(emoji)].map((ch) => ch.codePointAt(0).toString(16)).join('_')}`;
    if (this.textures.exists(key)) return key;
    const t = text(this, 0, 0, emoji, px, { emoji: true, stroke: false });
    const tex = this.textures.createCanvas(key, Math.max(1, t.canvas.width), Math.max(1, t.canvas.height));
    if (tex) {
      tex.context.drawImage(t.canvas, 0, 0);
      tex.refresh();
    }
    t.destroy();
    return key;
  }

  showBanner(b) {
    if (!b || this.hidden) return;
    if (b.emoji) this.bannerEmoji.setTexture(this.emojiTexture(b.emoji, 72));
    this.bannerEmoji.setVisible(!!b.emoji);
    this.bannerTitle.setText(b.title || '').setScale(1);
    // a long title ("Sannie stuur Skelm Sakkie!") shrinks to fit the banner instead of running off it
    const titleMax = BANNER_W - 130 - 26;
    if (this.bannerTitle.width > titleMax) this.bannerTitle.setScale(titleMax / this.bannerTitle.width);
    this.bannerSub.setText(b.subtitle || '');
    const hasSub = !!b.subtitle;
    const twoLines = hasSub && this.bannerSub.height > 40;   // a visitor's first-game hint
    this.bannerTitle.y = hasSub ? (twoLines ? -36 : -22) : 0;
    this.bannerSub.y = twoLines ? 20 : 26;
    this.bannerSub.setVisible(hasSub);
    if (this.bannerTween) this.bannerTween.stop();
    if (this.bannerTimer) this.bannerTimer.remove(false);
    const c = this.banner;
    const y0 = this.bannerY();
    // A weather banner explains itself: a coach hint never sits on it (it comes back afterwards).
    if (this.coachCur && this.coachNear(y0)) {
      this.pendingCoach = this.coachCur;
      this.hideCoach(true);
    }
    // a toast (a milestone saying) already showing moves up out of the banner's way: a visitor's
    // instructions were hidden under "25 m — Klein maar dapper!" (testers: "the words at the bottom")
    this.toastAboveBanner(y0);
    c.setVisible(true).setAlpha(0).setScale(0.6);
    c.setPosition(this.W / 2, y0);
    this.bannerEmoji.setScale(0.4).setAngle(-14);
    this.tweens.add({ targets: this.bannerEmoji, scale: 1, angle: 0, duration: 520, ease: 'Back.easeOut', easeParams: [2.6] });
    this.bannerTween = this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut' });
    // a visitor's (or a stage's) banner fades where it is; weather flies into its chip
    const visitor = b.kind === 'visitor' || b.kind === 'stage';
    this.bannerKind = b.kind === 'visitor' ? 'visitor' : b.kind === 'stage' ? 'stage' : 'weather';
    this.bannerTimer = this.time.delayedCall(Math.max(readMs(`${b.title || ''} ${b.subtitle || ''}`, BANNER_HOLD_MS), b.ms || 0) + 300, () => {
      this.bannerTimer = null;
      // weather flies into the weather chip (that's where the event lives while it lasts); a visitor's
      // banner just fades where it is: the visitor itself is on screen
      const out = visitor
        ? { y: y0 + 24, scale: 0.92, alpha: 0, duration: 280, ease: 'Quad.easeIn' }
        : { x: this.duelHud ? this.W / 2 : CHIP_CX, y: this.wxY, scale: 0.3, alpha: 0, duration: 320, ease: 'Cubic.easeIn' };
      this.bannerTween = this.tweens.add({
        targets: c, ...out,
        onComplete: () => {
          c.setVisible(false);
          this.bannerTween = null;
          if (!visitor && this.wxBg.visible) this.pulse(this.wxEmoji, 1.25);
          const t = this.pendingToast;
          this.pendingToast = null;
          if (t) this.showToast(t);
          const k = this.pendingCoach;
          this.pendingCoach = null;
          if (k) this.showCoach({ ...k, delay: 0 });
        },
      });
    });
  }

  showToast(t) {
    if (!t || !t.text || this.hidden) return;
    // Never stack a toast on the event banner: show it once the banner has gone. A visitor's banner
    // makes way at once instead (the toast says how the visit went: "Gevang!", "Sjoe! Weg is hy!").
    const y0 = this.H - this.sb - 150;
    if (t.visitor && this.banner.visible && this.bannerKind === 'visitor' && this.bannerTimer) this.dismissBanner();
    if (this.banner.visible && Math.abs(y0 - this.banner.y) < BANNER_H / 2 + 40) {
      this.pendingToast = t;
      return;
    }
    this.toastTxt.setFontSize(t.size || 30);
    this.toastTxt.setWordWrapWidth(this.W - 130, true);   // a long saying wraps instead of leaving the screen
    this.toastTxt.setAlign('center');
    this.toastTxt.setText(t.text);
    this.toastTxt.setColor(t.color || '#ffffff');
    const pw = Math.min(this.W - 48, Math.ceil((this.toastTxt.width + 56) / 16) * 16);
    const ph = Math.max(62, Math.ceil((this.toastTxt.height + 24) / 8) * 8);
    this.toastBg.setTexture(panelTexture(this, pw, ph, NAVY, 0.85, { rim: 0.25 }));
    if (this.toastTween) this.toastTween.stop();
    if (this.toastTimer) this.toastTimer.remove(false);
    const c = this.toast;
    c.setVisible(true).setAlpha(0).setScale(0.8);
    c.y = y0 + 30;
    this.toastTween = this.tweens.add({ targets: c, alpha: 1, scale: 1, y: y0, duration: 260, ease: 'Back.easeOut' });
    this.toastTimer = this.time.delayedCall(t.ms || readMs(t.text, TOAST_HOLD_MS), () => {
      this.toastTimer = null;
      this.toastTween = this.tweens.add({
        targets: c, alpha: 0, y: y0 - 30, duration: 300, ease: 'Quad.easeIn',
        onComplete: () => { c.setVisible(false); this.toastTween = null; },
      });
    });
  }

  /** A showing toast that would sit on a banner at `bannerY` slides up to just above it. */
  toastAboveBanner(bannerY) {
    const c = this.toast;
    if (!c.visible || c.alpha < 0.05) return;
    const half = this.toastBg.displayHeight / 2;
    if (Math.abs(c.y - bannerY) >= BANNER_H / 2 + half) return;
    const y = Math.round(bannerY - BANNER_H / 2 - half - 14);
    if (this.toastTween) this.toastTween.stop();
    if (!this.toastTimer) {
      // it was already on its way out: it goes, from up here
      this.toastTween = this.tweens.add({
        targets: c, y: y - 30, alpha: 0, duration: 220, ease: 'Quad.easeIn',
        onComplete: () => { c.setVisible(false); this.toastTween = null; },
      });
      return;
    }
    this.toastTween = this.tweens.add({ targets: c, y, alpha: 1, scale: 1, duration: 220, ease: 'Quad.easeOut' });
    // its fade-out starts from where it is now
    if (this.toastTimer) {
      const left = this.toastTimer.getRemaining();
      this.toastTimer.remove(false);
      this.toastTimer = this.time.delayedCall(left, () => {
        this.toastTimer = null;
        this.toastTween = this.tweens.add({
          targets: c, alpha: 0, y: y - 30, duration: 300, ease: 'Quad.easeIn',
          onComplete: () => { c.setVisible(false); this.toastTween = null; },
        });
      });
    }
  }

  /** Take the banner away right now (its pending toast/coach hint follow it as usual). */
  dismissBanner() {
    if (this.bannerTimer) this.bannerTimer.remove(false);
    this.bannerTimer = null;
    if (this.bannerTween) this.bannerTween.stop();
    this.bannerTween = null;
    this.banner.setVisible(false).setAlpha(0);
    const k = this.pendingCoach;
    this.pendingCoach = null;
    if (k) this.showCoach({ ...k, delay: 0 });
  }

  /**
   * A milestone saying (25 m, 50 m, ...). It is only ever shown on a clear screen: never over an event
   * banner, a first-game coach hint or another toast. It waits a little for the screen to clear and
   * is skipped after SAYING_MAX_WAIT_MS. A newer milestone replaces a waiting older one.
   */
  showSaying(t) {
    if (!t || !t.text || this.hidden) return;
    this.pendingSaying = { text: t.text, until: this.time.now + SAYING_MAX_WAIT_MS };
    this.pumpSaying();
  }

  pumpSaying() {
    if (this.sayingTimer) {
      this.sayingTimer.remove(false);
      this.sayingTimer = null;
    }
    const t = this.pendingSaying;
    if (!t || this.hidden) {
      this.pendingSaying = null;
      return;
    }
    const busy = this.banner.visible || this.pendingToast || this.toast.visible
      || this.coachCur || this.coachDelay || this.pendingCoach;
    if (busy) {
      if (this.time.now >= t.until) {
        this.pendingSaying = null;
        return;
      }
      this.sayingTimer = this.time.delayedCall(SAYING_RETRY_MS, () => {
        this.sayingTimer = null;
        this.pumpSaying();
      });
      return;
    }
    this.pendingSaying = null;
    // a saying with its English meaning runs longer: up to SAYING_MAX_MS to read it
    this.showToast({ text: t.text, color: '#ffe38c', size: 26, ms: Math.max(SAYING_HOLD_MS, Math.min(SAYING_MAX_MS, 900 + String(t.text || '').length * 55)) });
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

  /** Is the coach pill (on show, or about to be) within reach of something centred at y? */
  coachNear(y, half = BANNER_H / 2) {
    return Math.abs(this.coachY(this.coachH || 120) - y) < half + (this.coachH || 120) / 2 + 12;
  }

  /** Hint centre: below the landing spot, and above the bottom toast on short screens. */
  coachY(h) {
    const toastTop = this.H - this.sb - 150 - 31;
    return Math.round(Math.min(LAYOUT.dropLineY + this.st + COACH_BELOW_TOP, toastTop - 18 - h / 2));
  }

  /**
   * A first-game hint (text only; the game keeps running). It fades on its own, the newest hint
   * replaces an older one, and it steps aside for a weather banner. Reduced motion: a plain fade.
   */
  showCoach(c) {
    if (!c || !c.text || this.hidden) return;
    if (c.delay > 0) {
      if (this.coachDelay) this.coachDelay.remove(false);
      this.coachDelay = this.time.delayedCall(c.delay, () => {
        this.coachDelay = null;
        this.showCoach({ ...c, delay: 0 });
      });
      return;
    }
    if (this.coachDelay) {
      this.coachDelay.remove(false);
      this.coachDelay = null;
    }
    this.coachTxt.setText(c.text);
    const pw = Math.min(COACH_W, Math.ceil((this.coachTxt.width + 64) / 16) * 16);
    const ph = Math.ceil((this.coachTxt.height + 40) / 8) * 8;
    this.coachBg.setTexture(panelTexture(this, pw, ph, NAVY, 0.9, { radius: Math.min(36, ph / 2), rim: 0.3 }));
    this.coachH = ph;
    this.coachCur = c;
    if (this.banner.visible && this.coachNear(this.banner.y)) {
      this.pendingCoach = c;
      return;
    }
    if (this.coachTween) this.coachTween.stop();
    if (this.coachTimer) this.coachTimer.remove(false);
    const box = this.coach;
    const y0 = this.coachY(ph);
    box.setVisible(true).setAlpha(0).setPosition(this.W / 2, y0);
    if (this.reduced) {
      box.setScale(1);
      this.coachTween = this.tweens.add({ targets: box, alpha: 1, duration: 200 });
    } else {
      box.setScale(0.9).y = y0 + 18;
      this.coachTween = this.tweens.add({ targets: box, alpha: 1, scale: 1, y: y0, duration: 280, ease: 'Back.easeOut' });
    }
    this.coachTimer = this.time.delayedCall(Math.max(1500, c.ms || COACH.holdMs), () => {
      this.coachTimer = null;
      this.hideCoach(false);
    });
  }

  hideCoach(fast) {
    if (this.coachTimer) {
      this.coachTimer.remove(false);
      this.coachTimer = null;
    }
    if (this.coachTween) this.coachTween.stop();
    const box = this.coach;
    if (!fast) this.coachCur = null;
    if (!box.visible) return;
    this.coachTween = this.tweens.add({
      targets: box, alpha: 0, duration: fast ? 120 : 420, ease: 'Quad.easeOut',
      onComplete: () => { box.setVisible(false); this.coachTween = null; },
    });
  }

  /** Game over: everything fades except the height, which moves to centre stage. */
  hideAll(o) {
    if (this.hidden) return;
    this.hidden = true;
    this.pendingSaying = null;
    if (this.sayingTimer) this.sayingTimer.remove(false);
    this.sayingTimer = null;
    if (this.coachDelay) this.coachDelay.remove(false);
    this.coachDelay = null;
    this.pendingCoach = null;
    if (this.hintTween) this.hintTween.stop();
    if (this.waterPulse) this.waterPulse.stop();
    if (this.beat) this.beat.stop();
    this.tweens.add({ targets: this.root, alpha: 0, duration: 420, ease: 'Quad.easeOut' });
    const t = this.heightTxt;
    if (o && Number.isFinite(o.heightM) && o.reason !== 'quit') {
      t.setText(fmtM(o.heightM));
      if (t.__pulse) t.__pulse.stop();
      t.setOrigin(0.5);
      t.setPosition(this.heightHome.x + t.width / 2, this.heightHome.y);
      this.tweens.add({ targets: t, x: this.W / 2, y: this.st + 190, scale: 1.7, duration: 500, ease: 'Back.easeOut' });
    } else {
      this.tweens.add({ targets: t, alpha: 0, duration: 420, ease: 'Quad.easeOut' });
    }
  }
}

export default HudScene;
