// In-game HUD (screen space): height + points, next block, hearts, weather chip,
// combo badge, flood distance, wobble meter, event banners, toasts and the tap hint.
// Driven entirely by bus events from GameScene; texts re-render only on change.
import { LAYOUT, LIVES, FONT, COLORS, WATER, PX_PER_M, SCORING, COACH, STAGES, DUEL, TURNS, EMOTES } from '../config.js';
import { bus } from '../core/bus.js';
import { S, WEATHER_INFO, VISITOR_INFO } from '../core/strings.js';
import { fmtM, fmtInt } from '../core/format.js';
import { ensureTexture } from '../game/blocks.js';
import { haptics } from '../audio.js';

// Text font first: emoji fonts also contain (blank-looking) digit glyphs.
const EMOJI_FONT = `${FONT}, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
const STROKE = '#' + COLORS.textStroke.toString(16).padStart(6, '0');
const NAVY = 0x1d2b45;
const PAUSE_BTN = 96;      // DOM pause button: top-right 96×96 logical px, 6 px from the edges
const EDGE = 6;
// The HUD lives in its own band above the crane jib (two rows), so it never hides the trolley or hook.
const ROW1 = 37;           // centre of row 1 (height, weather chip, hearts)
const ROW2 = 107;
const LV_W = 186;          // (1.16) the Living Tower's people counter
const LV_H = 54;          // centre of row 2 (points, combo, next block)
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
const COACH_W = 620;        // widest first-game hint pill
// Uitdagersreeks (1.11): each player's name and hearts at the top (you left, them right), Wedloop's race
// track on the right edge (a little bigger than 1.9's, with both names and how far to 50 m), and Blok vir
// Blok's "whose turn" pill.
const PILL_H = 46;
const PILL_NAME_PX = 22;
const PILL_NAME_MAX = 12;   // characters of a name in a pill (then "…"; 1.15: 12, so "Robot Rikus" shows whole; the width check still shortens)
const PILL_HEART = 0.56;    // heart scale in a pill
const PILL_GAP = 25;        // between hearts
const TRACK_W = 26;         // Wedloop: the race track on the right edge (1.9 had 18)
const TRACK_DOT = 22;       // a player's marker: (1.15, the owner: "make the sircles smaller or replace it") a small pointer
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

/**
 * (1.15, the owner: "this balance bar feels out of place ... Maybe on the crane itself?") the balance meter as a builder's
 * level hung under the crane's jib: its plate and brackets, the glass vial, the liquid (tinted by how near the top is to
 * tipping), the bubble (slides to the heavy side), the vial's marks and shine. Drawn once.
 */
const LV = { w: 236, h: 56, vx: 96, vy: 22, vw: 126, vh: 24 };
function levelTextures(scene) {
  if (scene.textures.exists('hud_level')) return;
  let tex = scene.textures.createCanvas('hud_level', LV.w, LV.h);
  let ctx = tex.getContext();
  ctx.fillStyle = '#2a2d33';                                  // the brackets up to the jib
  for (const x of [34, LV.w - 34]) {
    ctx.fillRect(x - 3, 0, 6, 14);
    ctx.fillRect(x - 7, 0, 14, 4);
  }
  roundRectPath(ctx, 2, 12, LV.w - 4, LV.h - 14, 14);
  ctx.fillStyle = 'rgba(16,26,44,0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';                   // two screws
  for (const x of [14, LV.w - 14]) {
    ctx.beginPath();
    ctx.arc(x, 33, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  roundRectPath(ctx, LV.vx, LV.vy, LV.vw, LV.vh, LV.vh / 2); // the vial's dark glass
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  tex.refresh();
  tex = scene.textures.createCanvas('hud_level_liq', LV.vw - 6, LV.vh - 6);
  ctx = tex.getContext();
  roundRectPath(ctx, 0, 0, LV.vw - 6, LV.vh - 6, (LV.vh - 6) / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  tex.refresh();
  tex = scene.textures.createCanvas('hud_level_bub', 34, 16);
  ctx = tex.getContext();
  ctx.beginPath();
  ctx.ellipse(17, 8, 15, 6.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,40,60,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(13, 6, 6, 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  tex.refresh();
  tex = scene.textures.createCanvas('hud_level_glass', LV.vw, LV.vh);
  ctx = tex.getContext();
  ctx.strokeStyle = 'rgba(10,20,35,0.7)';                     // the two marks: the bubble between them is level
  ctx.lineWidth = 2.5;
  for (const x of [LV.vw / 2 - 19, LV.vw / 2 + 19]) {
    ctx.beginPath();
    ctx.moveTo(x, 2);
    ctx.lineTo(x, LV.vh - 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LV.vh / 2, 4);
  ctx.lineTo(LV.vw - LV.vh / 2, 4);
  ctx.stroke();
  roundRectPath(ctx, 1, 1, LV.vw - 2, LV.vh - 2, LV.vh / 2 - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  tex.refresh();
}
const LV_GREEN = [0x5b, 0xbf, 0x5a];
const LV_AMBER = [0xf7, 0xc9, 0x48];
const LV_RED = [0xe5, 0x48, 0x3b];
/** The liquid's colour for how near the top is to tipping (0 green, 0.5 amber, 1 red). */
function levelColor(v) {
  const [a, b, f] = v < 0.5 ? [LV_GREEN, LV_AMBER, v / 0.5] : [LV_AMBER, LV_RED, (v - 0.5) / 0.5];
  const c = (i) => Math.round(a[i] + (b[i] - a[i]) * f);
  return (c(0) << 16) | (c(1) << 8) | c(2);
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

const SCORE_DRAW_MS = 70;   // (1.12.1) the score's count-up redraws its text at most this often

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
    // (1.20) a restarted HUD (the scene object is re-used) shows the new tower's height at once: a Weektoring turn starts
    // at the height the last one ended on, so a remembered height kept it at "0,0 m" until the tower grew
    this.hShownM = undefined;
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
    // (1.20) the Weektoring: the blocks left on this turn take the hearts' place
    this.blocksTxt = add(text(this, hcx, y1 - 1, '', 28, { emoji: true, strokeMul: 0.18 }).setOrigin(0.5).setVisible(false));
    this.blocksN = -1;
    this.pips = [];
    const every = SCORING.heartEvery;
    for (let k = 0; k < every; k++) {
      const px = hcx + (k - (every - 1) / 2) * 14;
      this.pips.push(add(this.add.image(px, y1 + 30, 'fx_px').setDisplaySize(9, 9).setVisible(false)));
    }
    this.pipN = -1;

    // --- The weather chip: (1.15, the owner: "Now that the balance beam is at the top, can we make the "special
    // abilities", the monkey the fog etc appear at the left side?") on the left, under the balance level; the visitor's
    // chip under it. (A match moves the weather to row 3, centred: buildDuelHud.)
    this.wxY = LAYOUT.jibY + st + 92;
    this.wxBg = add(this.add.image(CHIP_CX, this.wxY, '__WHITE'));
    // Emoji are drawn once into textures (emojiTexture): drawing a big emoji glyph is slow, and done in the
    // frame a weather banner appeared it stalled that frame, just as the new block arrives and the player
    // starts to aim. The weather and visitor emoji are drawn ahead, one per frame (update).
    this.emojiQueue = [...Object.values(WEATHER_INFO), ...Object.values(VISITOR_INFO)].flatMap((i) => [[i.emoji, 72], [i.emoji, 32]])
      .concat(STAGES.slice(1).map((st) => [st.emoji, 72]))   // the stage banners' too
      .concat(Object.values(EMOTES).map((e) => [e, 92]));    // (1.12.1) and the emoji reactions'
    this.wxEmoji = add(this.add.image(0, this.wxY, '__WHITE').setOrigin(0.5));
    // the visitor's chip (setVisitor), made here so a restarted scene never keeps a destroyed one
    this.vsType = null;
    this.vsW = 0;
    this.vsBg = add(this.add.image(0, 0, '__WHITE').setVisible(false));
    this.vsEmoji = add(this.add.image(0, 0, '__WHITE').setOrigin(0.5).setVisible(false));
    this.vsName = add(text(this, 0, 0, '', 22, { strokeMul: 0.2 }).setOrigin(0, 0.5).setVisible(false));
    this.wxName = add(text(this, 0, this.wxY - 11, '', 22, { strokeMul: 0.2 }).setOrigin(0, 0.5));
    this.wxLeft = add(text(this, 0, this.wxY + 14, '', 20, { color: '#d9ecff', strokeMul: 0.22, shadow: false }).setOrigin(0, 0.5));
    this.wxType = null;
    this.wxLeftN = null;
    this.setWeatherVisible(false);

    // --- Flood distance pill (bottom centre) -----------------------------------
    this.waterY = H - sb - 64;
    this.waterBg = add(this.add.image(W / 2, this.waterY, '__WHITE'));
    this.waterTxt = add(text(this, W / 2, this.waterY - 1, '', 26, { emoji: true, strokeMul: 0.18 }).setOrigin(0.5));
    // (1.12.1) the 🌊 is an image of its own (drawn once): inside the text it was drawn again with every update
    this.waterIcon = add(this.add.image(W / 2, this.waterY - 1, this.emojiTexture('🌊', 26)).setOrigin(0.5));
    this.waterIcon.setVisible(false);
    this.waterLevel = -1;
    this.waterStr = '';
    this.waterAt = -1e9;
    this.waterPulse = null;
    this.waterBg.setVisible(false);
    this.waterTxt.setVisible(false);

    // --- The balance level, hung under the crane's jib (left of where the trolley runs) -------------------
    levelTextures(this);
    const lx = 12;
    const ly = LAYOUT.jibY + st - 4;
    this.wm = { x: lx, y: ly, cx: lx + LV.vx + LV.vw / 2, cy: ly + LV.vy + LV.vh / 2, travel: LV.vw / 2 - 21 };
    this.wmBg = add(this.add.image(lx, ly, 'hud_level').setOrigin(0, 0));
    this.wmFill = add(this.add.image(this.wm.cx, this.wm.cy, 'hud_level_liq').setTint(levelColor(0)));
    this.wmTick = add(this.add.image(this.wm.cx, this.wm.cy, 'hud_level_bub'));
    this.wmGlass = add(this.add.image(this.wm.cx, this.wm.cy, 'hud_level_glass'));
    this.wmLbl = add(text(this, lx + 14 + (LV.vx - 18) / 2, ly + 34, S.wobbleTitle, 19, { strokeMul: 0.2, shadow: false }).setOrigin(0.5));
    this.wmVal = -1;
    this.wmLean = 0;
    this.wmHotNow = false;
    this.wmShakeUntil = 0;
    this.buildDuelHud(add);
    this.buildLiving(add);
    this.wmAlpha = 0.7;
    this.wmParts = [this.wmBg, this.wmFill, this.wmTick, this.wmGlass, this.wmLbl];
    for (const o of this.wmParts) o.setAlpha(this.wmAlpha);
    this.drawWobble(0);

    // --- Hint (over the sea below the base, clear of the landing spot) ---------
    this.hint = add(text(this, W / 2, LAYOUT.dropLineY + st + 160, '', 40, { strokeMul: 0.14, emoji: true, align: 'center' }).setOrigin(0.5).setVisible(false));
    this.hint.setWordWrapWidth(W - 80, true);   // (a long hint, like a mission's aim, wraps; its pulse still fits the screen)
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
    // (1.12.1) set once: each of these redraws the whole text in Phaser, so per toast only the words change
    this.toastTxt.setWordWrapWidth(W - 130, true);   // a long saying wraps instead of leaving the screen
    this.toastTxt.setAlign('center');
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
      bus.on('hud:emote', (e) => this.showEmote(e)),
      bus.on('hud:living', (l) => this.setLiving(l)),
      bus.on('hud:living-fly', (f) => this.flyLiving(f)),
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
    if (mode === 'week') return `🏗️ ${game.week?.title || S.weekTowerName}`;
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
    // (1.12.1) the top block rocks in wind: the number follows only a move of 0.15 m or more (it flickered between
    // two values, a whole text redraw each time)
    if (this.hShownM === undefined || Math.abs(s.heightM - this.hShownM) >= 0.15) {
      const hs = fmtM(s.heightM);
      if (hs !== this.hStr) {
        const up = this.hShownM !== undefined && s.heightM > this.hShownM;
        this.hStr = hs;
        this.heightTxt.setText(hs);
        if (up) this.pulse(this.heightTxt, 1.08);
      }
      this.hShownM = s.heightM;
    }
    this.lastHeight = s.heightM;

    // points (count up). The text is redrawn at most every SCORE_DRAW_MS while counting (each redraw is a whole
    // canvas text with its shadow, uploaded again: every frame of the count-up, right after a landing, was a lot)
    this.scoreDrawIn = (this.scoreDrawIn || 0) - dt;
    if (this.dispScore !== s.score && (this.scoreDrawIn <= 0 || Math.abs(s.score - this.dispScore) <= 1)) {
      this.scoreDrawIn = SCORE_DRAW_MS;
      const diff = s.score - this.dispScore;
      const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, Math.max(dt, SCORE_DRAW_MS) / 90)));
      this.dispScore = Math.abs(step) >= Math.abs(diff) ? s.score : this.dispScore + step;
      const str = `⭐ ${fmtInt(this.dispScore)}`;
      if (str !== this.scoreStr) {
        this.scoreStr = str;
        this.scoreTxt.setText(str);
        this.placeCombo();
      }
      if (this.dispScore === s.score) this.pulse(this.scoreTxt, 1.12);
    }

    if (Number.isInteger(s.blocksLeft)) {
      if (s.blocksLeft !== this.blocksN) {
        const first = this.blocksN < 0;
        this.blocksN = s.blocksLeft;
        if (first) for (const o of [...this.hearts, ...this.pips]) o.setVisible(false);
        this.blocksTxt.setVisible(true).setText(`🧱 ${s.blocksLeft}`);
        if (!first) this.pulse(this.blocksTxt, 1.12);
      }
    } else if (!this.duelHud) {
      if (s.lives !== this.lives) this.setLives(s.lives, s.maxLives || LIVES);
      this.setPips(s.lives < (s.maxLives || LIVES) ? s.heartProgress || 0 : -1);
    }
    // (Blok vir Blok: each player's run shows in their own pill)
    const combo = this.duelHud?.turns ? 0 : s.combo;
    if (combo !== this.combo) this.setCombo(combo);
    this.setNext(s.next);
    this.setWeather(this.duelHud?.turns ? null : s.weather);   // (Blok vir Blok: whose turn has row 3)
    this.setVisitor(s.visitor || null);
    this.setWater(s.waterDistM, time);
    if (this.lv) this.catchUpLiving(time);
    if (this.duelHud) this.updateDuelHud(s, time);
    // the balance meter: how near the loose top is to tipping (its lean), or moving (its wobble)
    const lean = s.lean || 0;
    const wob = Math.max(s.wobble || 0, Math.min(1, Math.abs(lean)));
    this.wmLean = lean;
    this.drawWobble(wob, time);
    // the meter steps forward when the tower is in some trouble (with hysteresis)
    const wa = wob > 0.15 ? 1 : wob < 0.08 ? 0.7 : this.wmAlpha;
    if (wa !== this.wmAlpha) {
      this.wmAlpha = wa;
      this.tweens.killTweensOf(this.wmParts);
      this.tweens.add({ targets: this.wmParts, alpha: wa, duration: wa > 0.8 ? 150 : 600 });
    }
  }

  // -------------------------------------------------------------------------
  // (1.16) Die Lewende Toring: how many people live in your tower, in the middle of the top row (a match: row 2), the
  // face of whoever moved in last beside the number, the town's title under it with how far to the next one. Each new
  // resident's face flies up into it from their window (js/game/living.js), and only then the number counts.
  // -------------------------------------------------------------------------
  buildLiving(add) {
    this.lv = null;
    const game = this.scene.get('Game');
    if (!game || !game.living || game.idle) return;
    // a match: the count rides in the players' pills ("🏠 14"; Blok vir Blok both towns), the top rows are full
    if (this.duelHud) {
      this.lv = { duel: true, shown: 0, truth: 0, theirs: 0, changedAt: 0, prog: 0, title: '' };
      return;
    }
    const x = this.W / 2;
    const y = this.st + ROW1;
    const bg = add(this.add.image(x, y, panelTexture(this, LV_W, LV_H, NAVY, 0.72, { rim: 0.3 })));
    const face = add(this.add.image(x - LV_W / 2 + 30, y, this.emojiTexture('🏠', 30)));
    const num = add(text(this, x - LV_W / 2 + 56, y - 2, '0', 34, { strokeMul: 0.16 }).setOrigin(0, 0.5));
    const lbl = add(text(this, x - LV_W / 2 + 56, y - 2, S.lvPeople, 18, { color: '#cfe0ff', strokeMul: 0.22, shadow: false }).setOrigin(0, 0.5));
    const barW = LV_W - 36;
    add(this.add.image(x - barW / 2, y + LV_H / 2 - 7, 'fx_px').setOrigin(0, 0.5).setDisplaySize(barW, 5).setTint(0x0b1428).setAlpha(0.8));
    const bar = add(this.add.image(x - barW / 2, y + LV_H / 2 - 7, 'fx_px').setOrigin(0, 0.5).setDisplaySize(1, 5).setTint(0xffd23f));
    const cap = add(text(this, x, y + LV_H / 2 + 14, '', 19, { color: '#ffe38c', strokeMul: 0.24, shadow: false, emoji: true }).setOrigin(0.5));
    this.lv = { x, y, bg, face, num, lbl, bar, barW, cap, shown: 0, truth: 0, theirs: 0, changedAt: 0, title: '', prog: 0, faceId: null };
    // (where the shake starts from and comes back to: shakes that overlap never leave the counter off its place)
    this.lv.home = [bg.x, face.x, num.x];
    this.placeLiving();
  }

  /** People jumped: the counter shakes (from its own place, however often it comes). */
  shakeLiving() {
    const lv = this.lv;
    lv.shake?.stop();
    const [bx, fx, nx] = lv.home;
    const put = (d) => {
      lv.bg.x = bx + d;
      lv.face.x = fx + d;
      lv.num.x = nx + d;
      this.placeLiving();
    };
    lv.shake = this.tweens.addCounter({
      from: 0, to: 7, duration: 45, yoyo: true, repeat: 3,
      onUpdate: (tw) => put(tw.getValue()),
      onComplete: () => put(0),
      onStop: () => put(0),
    });
  }

  placeLiving() {
    const lv = this.lv;
    if (!lv.duel) lv.lbl.setX(lv.num.x + lv.num.width + 6);
  }

  /** Where a new resident's face flies to: the counter's face, or (a match) your pill's "🏠". */
  livingTarget() {
    const lv = this.lv;
    if (!lv.duel) return { x: lv.face.x, y: lv.y };
    const e = this.duelHud?.you?.extra;
    return e && e.visible ? { x: e.x + 14, y: e.y } : { x: 60, y: this.st + ROW1 };
  }

  setLiving(l) {
    const lv = this.lv;
    if (!lv || !l) return;
    lv.truth = Math.max(0, l.people | 0);
    lv.theirs = Math.max(0, l.theirs | 0);
    lv.changedAt = this.time.now;
    if (lv.shown > lv.truth) {
      // people jumped: down at once, the counter shakes and goes red for a moment
      lv.shown = lv.truth;
      this.drawLiving();
      if (l.delta < 0 && !lv.duel) {
        lv.num.setColor('#ff8a8a');
        this.time.delayedCall(650, () => { if (lv.num.scene) lv.num.setColor('#ffffff'); });
        this.shakeLiving();
      } else if (l.delta < 0 && this.duelHud?.you) {
        this.pulse(this.duelHud.you.bg, 1.08);
      }
    }
    lv.prog = Math.max(0, Math.min(1, Number(l.progress) || 0));
    if (lv.duel) return;
    const cap = l.title ? `${l.title.emoji} ${l.title.name}` : '';
    if (cap !== lv.title) {
      lv.title = cap;
      lv.cap.setText(cap);
      if (cap) this.pulse(lv.cap, 1.25);
    }
    if (lv.shown === lv.truth) lv.bar.setDisplaySize(Math.max(1, lv.barW * lv.prog), 5);
  }

  drawLiving() {
    const lv = this.lv;
    if (lv.duel) return;   // (the pills redraw from updateDuelHud)
    lv.num.setText(fmtInt(lv.shown));
    this.placeLiving();
    lv.bar.setDisplaySize(Math.max(1, lv.barW * lv.prog), 5);
  }

  /** "🏠 14" for a player's pill in a match ('' without the Living Tower). */
  livingExtra(mine) {
    const lv = this.lv;
    if (!lv) return '';
    return `🏠${fmtInt(mine ? lv.shown : lv.theirs)}`;
  }

  /** A new resident's face flies from their window (screen x, y) into the counter, which counts them on arrival. */
  flyLiving({ x, y, who, gold, scale } = {}) {
    const lv = this.lv;
    if (!lv) return;
    const key = who ? `res_${who}` : null;
    if (x == null || y == null || !key || !this.textures.exists(key) || this.reduced) {
      this.arriveLiving(who, gold);
      return;
    }
    const s0 = Math.max(0.3, Math.min(1.2, Number(scale) || 0.85));
    const img = this.add.image(x, y, key).setScale(s0).setDepth(20);
    const ring = gold ? this.add.circle(x, y, 34 * s0, 0xffd23f, 0).setStrokeStyle(4, 0xffd23f).setDepth(19) : null;
    const to = this.livingTarget();
    const cx = (x + to.x) / 2 + (x < to.x ? -70 : 70);
    const cy = Math.min(y, to.y) - 30;
    const t = { p: 0 };
    this.tweens.add({
      targets: t, p: 1, duration: 420, ease: 'Sine.easeIn',
      onUpdate: () => {
        const p = t.p;
        const q = 1 - p;
        img.x = q * q * x + 2 * q * p * cx + p * p * to.x;
        img.y = q * q * y + 2 * q * p * cy + p * p * to.y;
        img.setScale(s0 * (1 - (lv.duel ? 0.65 : 0.45) * p));
        if (ring) ring.setPosition(img.x, img.y).setRadius(34 * img.scale);
      },
      onComplete: () => {
        img.destroy();
        if (ring) ring.destroy();
        this.arriveLiving(who, gold);
      },
    });
  }

  arriveLiving(who, gold) {
    const lv = this.lv;
    if (!lv) return;
    if (lv.shown < lv.truth) lv.shown++;
    lv.changedAt = this.time.now;
    this.drawLiving();
    if (lv.duel) {
      if (this.duelHud?.you) this.pulse(this.duelHud.you.bg, gold ? 1.1 : 1.04);
      return;
    }
    const key = who ? `res_${who}` : null;
    if (key && this.textures.exists(key) && lv.faceId !== who) {
      lv.faceId = who;
      lv.face.setTexture(key);
    }
    lv.num.setScale(1.3);
    this.tweens.add({ targets: lv.num, scale: 1, duration: 260, ease: 'Back.easeOut' });
    const fs = 40 / (lv.face.width || 40);
    lv.face.setScale(fs * 1.3);
    this.tweens.add({ targets: lv.face, scale: fs, duration: 260, ease: 'Back.easeOut' });
    this.pulse(lv.bg, gold ? 1.12 : 1.05);
  }

  /** The count never lags the town for long (a face that never flew, reduced motion). */
  catchUpLiving(time) {
    const lv = this.lv;
    if (lv.shown !== lv.truth && time - lv.changedAt > 1300) {
      lv.shown = lv.truth;
      lv.changedAt = time;
      this.drawLiving();
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
    let top = Math.round(H * 0.25);
    let bottom = Math.round(H * 0.52);   // (clear of the island's sign at the start)
    // (1.15 round 3) on a tall phone the sign stands higher on the screen: end the track just above it at the start,
    // and lift the track's top (still under the pause button) so it keeps its length
    try {
      const g = this.scene.get('Game');
      const b = g?.billboard?.bounds?.();
      const cam = g?.cameras?.main;
      if (b && cam && Number.isFinite(b.top)) {
        const signTop = (b.top - cam.scrollY) * (cam.zoom || 1);
        if (signTop - 16 < bottom) bottom = Math.max(Math.round(H * 0.3), Math.round(signTop - 16));
        if (bottom - top < H * 0.2) top = Math.max(Math.round(H * 0.15), Math.round(bottom - H * 0.2));
      }
    } catch {
      // (no sign yet: the old place)
    }
    // (1.15, the owner: "Make the challengers arrow show on the right side of the bar") room right of the track for theirs
    const x = this.W - 14 - TRACK_DOT - TRACK_W / 2;
    // a marker: a small pointer in the player's colour, beside the track, pointing at how high their tower is
    const dot = (key, fill) => {
      if (this.textures.exists(key)) return key;
      const S2 = TRACK_DOT + 6;
      const tex = this.textures.createCanvas(key, S2, S2);
      const ctx = tex.getContext();
      ctx.beginPath();
      ctx.moveTo(3, 4);
      ctx.lineTo(S2 - 3, S2 / 2);
      ctx.lineTo(3, S2 - 4);
      ctx.quadraticCurveTo(7, S2 / 2, 3, 4);
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.fillStyle = rgba(fill, 1);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1d2b45';
      ctx.stroke();
      tex.refresh();
      return key;
    };
    const bg = add(this.add.image(x, (top + bottom) / 2, panelTexture(this, TRACK_W, bottom - top + 18, NAVY, 0.55, { radius: 12, rim: 0.4 })));
    // (1.15, the owner: "cant we make it that it fills up as you go without percentages") the track fills from the bottom
    // in each player's colour, side by side (yours left, theirs right), up to where each tower stands
    const fillW = Math.max(4, Math.floor((TRACK_W - 10) / 2));
    const youFill = add(this.add.image(x - fillW / 2 - 1, bottom, 'fx_px').setOrigin(0.5, 1).setDisplaySize(fillW, 1).setTint(YOU_TINT));
    const themFill = add(this.add.image(x + fillW / 2 + 1, bottom, 'fx_px').setOrigin(0.5, 1).setDisplaySize(fillW, 1).setTint(THEM_TINT));
    const ticks = DUEL.marks.map((m) => add(this.add.image(x, this.trackY(m, top, bottom), 'fx_px').setDisplaySize(TRACK_W + 10, 5).setAlpha(0.8)));
    const flag = add(text(this, x - 2, top - 24, '🏁', 34, { emoji: true, stroke: false }).setOrigin(0.5));
    const px = x - TRACK_W / 2 - TRACK_DOT / 2 - 2;
    const them = add(this.add.image(x + TRACK_W / 2 + TRACK_DOT / 2 + 2, bottom, dot('hud_ptr_them', THEM_TINT)).setFlipX(true));
    const you = add(this.add.image(px, bottom, dot('hud_ptr_you', YOU_TINT)));
    // each marker's name and how far to the finish ride along beside it
    const themLabel = add(text(this, px - TRACK_DOT / 2 - 4, bottom, '', 22, { strokeMul: 0.22, emoji: true }).setOrigin(1, 0.5));
    const youLabel = add(text(this, px - TRACK_DOT / 2 - 4, bottom, '', 22, { strokeMul: 0.22 }).setOrigin(1, 0.5));
    const t = { x, top, bottom, bg, ticks, flag, them, you, themLabel, youLabel, youFill, themFill, fillW, youY: bottom, themY: bottom, youStr: '', themStr: '', claimed: '' };
    for (const o of [bg, ...ticks, flag, them, you, themLabel, youLabel]) o.setAlpha(0.95);
    // (1.15, the owner: "then robot rikus name needs to be removed here ... I don't even know if its necessary?") no names
    // on the track: the colours say who is who (yours gold on the left, theirs blue on the right, like the names up top)
    themLabel.setVisible(false);
    youLabel.setVisible(false);
    for (const o of [youFill, themFill]) o.setAlpha(0.9);
    return t;
  }

  trackY(m, top, bottom) {
    const k = Math.max(0, Math.min(1, m / DUEL.goalM));
    return Math.round(bottom - k * (bottom - top));
  }

  /** One player's pill: "Anna ♥♥♡" (their turn in Blok vir Blok: gold). Redrawn only when it changes. */
  setPill(p, { name, rank = '', lives, max, active = false, extra = '' }) {
    const shown = Number.isInteger(lives);
    const key = `${rank}|${name}|${shown ? lives : '-'}|${max}|${active}|${extra}`;
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
    // (1.12: the rank in front, '🥇II Anna'; only the name gets shorter)
    const fit = (n) => `${rank ? `${rank} ` : ''}${n < name.length ? `${name.slice(0, Math.max(1, n - 1))}…` : name}`;
    p.name.setText(fit(len));
    while (len > 3 && 16 + p.name.width + (shown ? 10 + heartsW : 0) + extraW + 12 > maxW) p.name.setText(fit(--len));
    const w = Math.ceil((16 + p.name.width + (shown ? 10 + heartsW : 0) + extraW + 12) / 8) * 8;
    const x0 = p.side === 'left' ? 16 : this.duelHud.right - w;
    const y = p.bg.y;
    p.bg.setTexture(panelTexture(this, w, PILL_H, active ? 0x9a6a00 : NAVY, active ? 0.92 : 0.72, { rim: active ? 0.55 : 0.3 }))
      .setPosition(p.side === 'left' ? x0 : x0 + w, y);
    p.name.setPosition(x0 + 16, y - 1);
    const nameColor = p.side === 'left' ? '#ffe38c' : '#cfe9ff';
    if (p.name.style.color !== nameColor) p.name.setColor(nameColor);   // (once: each setColor redraws the text)
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
    // (1.12) each player's rank in this mode in front of their name ('🥇II Anna')
    const youRank = game?.duel?.youRank || '';
    const oppRank = game?.duel?.oppRank || '';
    const youName = game?.duel?.youName || S.hudYou;
    if (hud.turns) {
      const t = s.turns;
      if (!t) return;
      const them = 1 - t.you;
      const oppName = t.names?.[them] || game?.duel?.name || S.duelSomeone;
      // a run of Perfeks shows (5 in a row earn a joker)
      const streak = (k) => (t.streaks?.[k] >= 2 ? `🔥${t.streaks[k]}` : '');
      const active = (k) => t.n > 0 && t.seat === k;
      // (1.16) each player's town rides along: "🔥3 🏠14"
      const both = (k, mine) => [streak(k), this.livingExtra(mine)].filter(Boolean).join(' ');
      this.setPill(hud.you, { name: t.names?.[t.you] || youName, rank: youRank, lives: t.hearts[t.you], max: hud.max, active: active(t.you), extra: both(t.you, true) });
      this.setPill(hud.them, { name: oppName, rank: oppRank, lives: t.hearts[them], max: hud.max, active: active(them), extra: both(them, false) });
      this.setTurnPill(t, oppName);
      return;
    }
    // Wedloop: your hearts from the game, theirs from the match (a recording or Robot Rikus: full until it fell)
    const d = this.duelState;
    this.setPill(hud.you, { name: youName, rank: youRank, lives: s.lives, max: hud.max, extra: this.livingExtra(true) });
    this.setPill(hud.them, { name: d?.name || game?.duel?.name || S.duelSomeone, rank: oppRank, lives: d && Number.isInteger(d.lives) ? Math.min(d.lives, hud.max) : null, max: hud.max });
    if (d) this.updateRaceTrack(d, time);
  }

  /** (1.12) An emoji reaction: big, under the sender's pill (you left, them right), for a moment. */
  showEmote({ side, emoji } = {}) {
    const hud = this.duelHud;
    if (!hud || this.hidden || typeof emoji !== 'string') return;
    const p = side === 'you' ? hud.you : hud.them;
    const x = side === 'you' ? 96 : this.W - EDGE - PAUSE_BTN - 96;
    const y = this.st + ROW3 + 110;   // (under the crane's jib: never over the height or the hearts)
    // (1.12.1) the emoji as an image drawn once (emojiTexture), not a new 92 px text per reaction
    const t = this.add.image(x, y, this.emojiTexture(emoji, 92)).setOrigin(0.5).setDepth(60).setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: t, y: y + 36, alpha: 0, delay: 1500, duration: 450, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }

  /** Blok vir Blok: "🎯 Jou beurt! 7" (gold) or "⏳ Anna se beurt…". */
  setTurnPill(t, oppName) {
    const tp = this.duelHud.turn;
    if (!t || t.n < 1) return;
    const mine = t.seat === t.you;
    // (1.12) a round on this turn: its weather or visitor rides along in the pill
    const ev = t.ev ? (WEATHER_INFO[t.ev] || VISITOR_INFO[t.ev])?.emoji || '' : '';
    const str = t.phase === 'settle' ? `⏳ ${S.turnsSettling}`
      : `${mine ? `🎯 ${S.turnsYourTurn}${t.left != null ? `  ${t.left}` : ''}` : `⏳ ${S.turnsTheirTurn(oppName)}`}${ev ? `  ${ev}` : ''}`;
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
    if (t.youFill) {
      t.youFill.setDisplaySize(t.fillW, Math.max(1, t.bottom + 6 - t.youY));
      t.themFill.setDisplaySize(t.fillW, Math.max(1, t.bottom + 6 - t.themY));
    }
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
    // (1.15: names only; the filling track shows how far)
    const youStr = S.hudYou;
    const themName = d.name.length > PILL_NAME_MAX ? `${d.name.slice(0, PILL_NAME_MAX - 1)}…` : d.name;
    const themStr = `${d.badge ? `${d.badge} ` : ''}${themName}`;
    if (youStr !== t.youStr) {
      t.youStr = youStr;
      t.youLabel.setText(youStr);
      if (t.youLabel.style.color !== '#ffe38c') t.youLabel.setColor('#ffe38c');
    }
    if (themStr !== t.themStr) {
      t.themStr = themStr;
      t.themLabel.setText(themStr);
      if (t.themLabel.style.color !== '#cfe9ff') t.themLabel.setColor('#cfe9ff');
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
    this.placeVisitor();
  }

  /** The weather chip's centre: centred on row 3 in a match, else on the left side. */
  wxCx(w2) {
    return this.duelHud ? this.W / 2 : 12 + w2 / 2;
  }

  /** (1.15) The visitor on screen (type) as a chip on the left, under the weather's; null hides it. */
  setVisitor(type) {
    const info = type && !this.duelHud ? VISITOR_INFO[type] : null;
    if ((info ? type : null) === this.vsType) return;
    this.vsType = info ? type : null;
    for (const o of [this.vsBg, this.vsEmoji, this.vsName]) o.setVisible(!!info);
    if (!info) return;
    this.vsEmoji.setTexture(this.emojiTexture(info.emoji, 32));
    this.vsName.setText(info.name);
    this.vsW = Math.min(CHIP_MAX_W, Math.ceil((16 + 40 + 8 + this.vsName.width + 18) / 8) * 8);
    this.vsBg.setTexture(panelTexture(this, this.vsW, 50, NAVY, 0.6, { radius: 20 }));
    this.placeVisitor();
    for (const o of [this.vsBg, this.vsEmoji, this.vsName]) {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 260 });
    }
  }

  placeVisitor() {
    if (!this.vsBg || !this.vsType) return;
    const y = this.wxBg.visible ? this.wxY + 62 : this.wxY;
    const cx = 12 + this.vsW / 2;
    this.vsBg.setPosition(cx, y);
    this.vsEmoji.setPosition(12 + 16 + 20, y);
    this.vsName.setPosition(12 + 16 + 40 + 8, y);
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
    const cx = this.wxCx(w2);   // (in a match the chip has row 3 to itself)
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
        this.waterIcon.setVisible(false);
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
      this.waterTxt.setText(str.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, ''));
      const fill = level === 2 ? 0xe5483b : level === 1 ? 0xf39a2b : 0x1f6fb2;
      // the icon, a gap and the words, centred together in the pill
      const iw = this.waterIcon.width;
      const inner = iw + 8 + this.waterTxt.width;
      const pw = Math.ceil((inner + 40) / 16) * 16;
      this.waterBg.setTexture(panelTexture(this, pw, 52, fill, 0.9));
      this.waterIcon.x = this.W / 2 - inner / 2 + iw / 2;
      this.waterTxt.x = this.W / 2 - inner / 2 + iw + 8 + this.waterTxt.width / 2;
      if (level !== this.waterLevel) {
        if (this.waterPulse) {
          this.waterPulse.stop();
          this.waterPulse = null;
          this.waterBg.setScale(1);
          this.waterTxt.setScale(1);
          this.waterIcon.setScale(1);
        }
        if (level === 2) {
          this.waterPulse = this.tweens.add({
            targets: [this.waterBg, this.waterTxt, this.waterIcon], scale: 1.08, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
        }
        this.waterLevel = level;
      }
    }
    if (wasHidden) {
      this.waterBg.setVisible(true);
      this.waterTxt.setVisible(true);
      this.waterIcon.setVisible(true);
      this.waterBg.y = this.waterY + 40;
      this.waterTxt.y = this.waterY + 39;
      this.waterIcon.y = this.waterY + 39;
      this.tweens.add({ targets: this.waterBg, y: this.waterY, duration: 320, ease: 'Back.easeOut' });
      this.tweens.add({ targets: [this.waterTxt, this.waterIcon], y: this.waterY - 1, duration: 320, ease: 'Back.easeOut' });
    }
  }

  /** Crops a pre-drawn gradient bar (no Graphics re-tessellation per frame). */
  /** The level: the liquid's colour for how near tipping, the bubble on the heavy side; entering the red, one buzz. */
  drawWobble(v, time = 0) {
    const q = Math.round(Math.min(1, Math.max(0, v)) * 60) / 60;
    const { cx, cy, travel } = this.wm;
    const lean = Math.max(-1, Math.min(1, this.wmLean || 0));
    // trembling while the top moves (and for a moment after the warning), none with "Minder beweging"
    let jx = 0;
    if (!this.reduced && (q > 0.35 || time < this.wmShakeUntil)) jx = Math.sin(time * 0.06) * (time < this.wmShakeUntil ? 3 : 1.2 * q);
    this.wmTick.setPosition(cx + lean * travel + jx * 0.5, cy);
    const hot = q > 0.7 || (this.wmHotNow && q > 0.55);
    if (hot && !this.wmHotNow) {
      haptics.warn();
      this.wmShakeUntil = time + 420;
    }
    this.wmHotNow = hot;
    if (q === this.wmVal) return;
    this.wmVal = q;
    this.wmFill.setTint(levelColor(q));
  }

  // -------------------------------------------------------------------------
  // Banner / toast / hint / hide
  // -------------------------------------------------------------------------
  /** An emoji at `px`, drawn once (same look as the HUD's emoji text) into a texture; returns its key. */
  emojiTexture(emoji, px) {
    const key = `hud_emo_${px}_${[...String(emoji)].map((ch) => ch.codePointAt(0).toString(16)).join('_')}`;
    if (this.textures.exists(key)) return key;
    const t = text(this, 0, 0, emoji, px, { emoji: true, stroke: false });
    // (1.12.1) Android's emoji (Noto) reach up to 8% of their size below the letters' line that sizes the text,
    // and the shadow 6% lower; Apple's are a little wider than their advance: all were cut off (a tester: "the
    // emoji's is cut off")
    t.setPadding(Math.ceil(px * 0.05), Math.ceil(px * 0.16));
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
    // (1.12) a height zone's banner waits for a visitor's or the weather's on screen (it says how to play it)
    if (b.wait && this.banner.visible && this.bannerTimer) {
      this.pendingBanner = b;
      return;
    }
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
    // ((1.16) the Living Tower's titles too: they fade where they are)
    const visitor = b.kind === 'visitor' || b.kind === 'stage' || b.kind === 'living';
    this.bannerKind = b.kind === 'visitor' ? 'visitor' : b.kind === 'stage' ? 'stage' : 'weather';
    this.bannerTimer = this.time.delayedCall(Math.max(readMs(`${b.title || ''} ${b.subtitle || ''}`, BANNER_HOLD_MS), b.ms || 0) + 300, () => {
      this.bannerTimer = null;
      // weather flies into the weather chip (that's where the event lives while it lasts); a visitor's
      // banner just fades where it is: the visitor itself is on screen
      const out = visitor
        ? { y: y0 + 24, scale: 0.92, alpha: 0, duration: 280, ease: 'Quad.easeIn' }
        : { x: this.wxBg.x, y: this.wxY, scale: 0.3, alpha: 0, duration: 320, ease: 'Cubic.easeIn' };
      this.bannerTween = this.tweens.add({
        targets: c, ...out,
        onComplete: () => {
          c.setVisible(false);
          this.bannerTween = null;
          if (!visitor && this.wxBg.visible) this.pulse(this.wxEmoji, 1.25);
          const nb = this.pendingBanner;
          this.pendingBanner = null;
          if (nb) this.time.delayedCall(250, () => this.showBanner({ ...nb, wait: false }));
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
    let y0 = this.H - this.sb - 150;
    if (t.visitor && this.banner.visible && this.bannerKind === 'visitor' && this.bannerTimer) this.dismissBanner();
    // (1.12) a banner on screen: the toast shows just above it at once (Blok vir Blok says a lot at a
    // turn's start; a toast that waited for the banner arrived a turn late, over the next banner)
    // (a banner that appeared this very moment counts: it is still fading in)
    const onBanner = this.banner.visible && Math.abs(y0 - this.banner.y) < BANNER_H / 2 + 40;
    this.toastTxt.setFontSize(t.size || 30);
    // one redraw: the colour goes into the style and setText draws it (the same words again: only the colour)
    const color = t.color || '#ffffff';
    if (this.toastTxt.text === t.text) {
      if (this.toastTxt.style.color !== color) this.toastTxt.setColor(color);
    } else {
      this.toastTxt.style.color = color;
      this.toastTxt.setText(t.text);
    }
    const pw = Math.min(this.W - 48, Math.ceil((this.toastTxt.width + 56) / 16) * 16);
    const ph = Math.max(62, Math.ceil((this.toastTxt.height + 24) / 8) * 8);
    this.toastBg.setTexture(panelTexture(this, pw, ph, NAVY, 0.85, { rim: 0.25 }));
    if (onBanner) y0 = Math.round(this.banner.y - BANNER_H / 2 - ph / 2 - 14);
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
