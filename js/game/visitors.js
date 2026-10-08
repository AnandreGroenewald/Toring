// Visitors (besoekers): Blouaap 🐒, Hanswors 🤡 and Skelm Sakkie 🦹 drop in between blocks.
// Who comes when is level data (core/visitorplan.js) and what they may do to the tower is
// core/visitorrules.js; this module runs one visit at a time and draws it. Everything that
// can change the tower happens in step(), on the simulated clock (one call per fixed physics
// step), with its randomness drawn from the visit's own seeded stream: a visit plays out the
// same at any refresh rate and for every player. The sprites are big emoji (cheap, friendly
// on every phone) moved in update(); the rope, balloons, swag bag and juggling balls are
// drawn in code. GameScene does the physics through `actions` (shove, gift, found, steal).

import { VISITOR, VISITOR_TYPES, DEPTH, GAME_W, LAYOUT, FONT, PHYSICS } from '../config.js';
import { S, VISITOR_INFO } from '../core/strings.js';
import { visitRng, monkeyPlan, clownPlan, thiefPlan } from '../core/visitorplan.js';
import { getGeometry, ensureTexture } from './blocks.js';
import { canvasTexture, clamp, lerp } from './effects.js';
import { cosmetic } from '../core/economy.js';
import { opaqueBox, headOf, accessoryPlace } from '../core/emojifit.js';

const STEP_MS = PHYSICS.fixedDtMs;
// (?emojifont=noto: tests only, to see the game the way Android draws emoji)
const NOTO_FIRST = typeof location !== 'undefined' && /[?&]emojifont=noto\b/.test(location.search);
const EMOJI_FONT = `${NOTO_FIRST ? '"Noto Color Emoji", ' : ''}"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", ${FONT}`;
const HALF = VISITOR.size / 2;
// A duel attack wears the sender's style (js/core/economy.js). Where it sits is measured on the glyph as
// this phone draws it (js/core/emojifit.js: the head is found in the pixels), once per visitor and style.
// These sizes from the sprite's centre (x towards the way he faces) are only the fallback when the
// glyph can't be read; they suit Apple's emoji.
const ACC_FIT = {
  monkey: { pet: [0.05, -0.4, 0.5], sonbril: [0.08, -0.16, 0.42], hoed: [0.05, -0.46, 0.52], kroon: [0.05, -0.44, 0.46] },
  thief: { pet: [0, -0.42, 0.5], sonbril: [0, -0.2, 0.4], hoed: [0, -0.48, 0.52], kroon: [0, -0.46, 0.46] },
};
const ACC_DRAW = 0.6;           // an accessory is drawn at this share of the visitor's size, then scaled to the head
const accCache = new Map();     // `${type}|${style}` -> { dx, dy, scale } in sprite pixels, as the glyph faces

/**
 * Where the accessory goes on this visitor: measured from both glyphs' pixels (so a hat sits on the
 * head whichever emoji font the phone has), else the fixed fallback. { dx, dy, scale } from the sprite's
 * centre, for the glyph as drawn (flip mirrors dx).
 */
function accessoryFit(type, style, sprite, acc) {
  const key = `${type}|${style}`;
  if (accCache.has(key)) return accCache.get(key);
  let fit = null;
  try {
    const read = (t) => t.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, t.canvas.width, t.canvas.height);
    const head = headOf(read(sprite));
    const box = opaqueBox(read(acc));
    const place = accessoryPlace(style, head, box);
    if (place && Number.isFinite(place.scale) && place.scale > 0) {
      fit = {
        dx: place.cx - sprite.canvas.width / 2 - (box.l + box.w / 2 - acc.canvas.width / 2) * place.scale,
        dy: place.cy - sprite.canvas.height / 2 - (box.t + box.h / 2 - acc.canvas.height / 2) * place.scale,
        scale: place.scale,
      };
    }
  } catch {
    fit = null;   // a canvas that can't be read: the fixed fallback below
  }
  if (!fit) {
    const f = ACC_FIT[type]?.[style];
    if (!f) return null;
    fit = { dx: -f[0] * VISITOR.size, dy: f[1] * VISITOR.size, scale: f[2] / ACC_DRAW };
  }
  accCache.set(key, fit);
  return fit;
}

const HANG_ABOVE_TOP = 70;      // the monkey hangs this far above the tower-top line (screen px)
const HOVER_ABOVE_TOP = 190;    // the clown floats this far above it
const CLIMB_FROM = 230;         // the thief starts this far below the tower top...
const CLIMB_TO = 64;            // ...and stops here: his tap circle never reaches the landing spot
const HUG = 40;                 // the thief climbs this far out from the side of the top block
const AIM_CLEAR = 40;           // a waiting visitor's tap circle stays this far from the tower top
const SWAY = 0.05;              // rad: the monkey's sway on its rope (it stays at the side)
const BANNER_TOP_FALLBACK = 256; // screen px above the bottom where the HUD banner starts (HudScene sets 'hudBannerTop')
const ENTER_MS = 560;           // the monkey swings in on its rope
const SHOO_MS = 460;
const CAUGHT_MS = 950;
const JUGGLE_MS = 950;
const FADE_MS = 260;
const ATTRACT_CHANCE = 0.35;    // menu: the clown floats past above some attract towers (looks only)
const ATTRACT_MS = 7000;
const FORCE_FROM = 3;           // a forced (debug) visitor waits until there is a little tower to visit
const CALL_MS = 240;            // the monkey's call comes just after the alarm
const SULK_MS = 1800;           // a Perfek scared him off: "Ek sal terug wees!" this long, then up his rope
const REACT_PERFECT_MS = 850;   // he answers a Perfek once its "Perfek!" pop has faded (they'd overlap)...
const REACT_STRIKE_MS = 250;    // ...and jumps a moment after any other landing
const BUBBLE_W = 380;           // his speech bubble (the tail sits BUBBLE_TAIL px from one end)
const BUBBLE_H = 120;
const BUBBLE_TAIL = 62;

const outCubic = (t) => 1 - (1 - t) ** 3;
const inCubic = (t) => t * t * t;
const outBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const hump = (t) => 4 * t * (1 - t);                  // 0 -> 1 -> 0
const rand = (a, b) => a + Math.random() * (b - a);   // looks only

// ---------------------------------------------------------------------------
// Props, drawn once per game
// ---------------------------------------------------------------------------
function makeTextures(scene) {
  canvasTexture(scene, 'vis_balloons', 112, 132, (ctx) => {
    const balloons = [[30, 40, '#ff5a5f', '#ffb3b5'], [82, 36, '#3d8beb', '#a9cdfa'], [56, 26, '#ffd23f', '#fff0a8']];
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(40,40,60,0.7)';
    for (const [x, y] of balloons) {
      ctx.beginPath();
      ctx.moveTo(x, y + 30);
      ctx.quadraticCurveTo((x + 56) / 2 + 4, 100, 56, 130);
      ctx.stroke();
    }
    for (const [x, y, fill, shine] of balloons) {
      ctx.beginPath();
      ctx.ellipse(x, y, 22, 27, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(29,43,69,0.55)';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 27);
      ctx.lineTo(x + 4, y + 27);
      ctx.lineTo(x, y + 33);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - 8, y - 10, 5, 8, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = shine;
      ctx.fill();
    }
  });
  // swag bag: a sack tied at the neck with a big "R" on it
  canvasTexture(scene, 'vis_bag', 76, 80, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(26, 22);
    ctx.bezierCurveTo(4, 34, 2, 76, 38, 76);
    ctx.bezierCurveTo(74, 76, 72, 34, 50, 22);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 20, 0, 78);
    g.addColorStop(0, '#c08a4a');
    g.addColorStop(1, '#8a5a2b');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#4e3115';
    ctx.stroke();
    ctx.beginPath();   // the gathered neck
    ctx.moveTo(24, 8);
    ctx.lineTo(52, 8);
    ctx.lineTo(46, 24);
    ctx.lineTo(30, 24);
    ctx.closePath();
    ctx.fillStyle = '#a8743c';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8c35a';   // rope tie
    ctx.fillRect(27, 20, 22, 5);
    ctx.font = 'bold 30px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#4e3115';
    ctx.strokeText('R', 38, 52);
    ctx.fillStyle = '#fff7e0';
    ctx.fillText('R', 38, 52);
  });
  // the monkey's speech bubble, with its tail at the left end (he hangs on the left) or the right end
  for (const [key, tail] of [['vis_bubble_l', BUBBLE_TAIL], ['vis_bubble_r', BUBBLE_W - BUBBLE_TAIL]]) {
    canvasTexture(scene, key, BUBBLE_W, BUBBLE_H, (ctx) => drawBubble(ctx, tail, S.monkeyBack));
  }
  canvasTexture(scene, 'vis_ball', 24, 24, (ctx) => {
    ctx.beginPath();
    ctx.arc(12, 12, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(29,43,69,0.6)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8.5, 8, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  });
}

/** A white speech bubble (rounded box, a tail down at tailX) with the text in navy. */
function drawBubble(ctx, tailX, text) {
  const w = BUBBLE_W;
  const bh = BUBBLE_H - 26;   // the box; the tail hangs below it
  const r = 28;
  const x0 = 4;
  const y0 = 4;
  const x1 = w - 4;
  const y1 = bh;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x1 - r, y0);
  ctx.arcTo(x1, y0, x1, y0 + r, r);
  ctx.lineTo(x1, y1 - r);
  ctx.arcTo(x1, y1, x1 - r, y1, r);
  ctx.lineTo(tailX + 18, y1);
  ctx.lineTo(tailX, BUBBLE_H - 3);
  ctx.lineTo(tailX - 18, y1);
  ctx.lineTo(x0 + r, y1);
  ctx.arcTo(x0, y1, x0, y1 - r, r);
  ctx.lineTo(x0, y0 + r);
  ctx.arcTo(x0, y0, x0 + r, y0, r);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#1d2b45';
  ctx.stroke();
  let size = 38;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  do {
    ctx.font = `bold ${size}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`;
    size -= 2;
  } while (ctx.measureText(text).width > w - 40 && size > 18);
  ctx.fillStyle = '#1d2b45';
  ctx.fillText(text, w / 2, (y0 + y1) / 2 + 2);
}

function emojiText(scene, str, size = VISITOR.size) {
  return scene.add.text(0, 0, str, {
    fontFamily: EMOJI_FONT, fontSize: `${size}px`, padding: { x: 8, y: 12 }, resolution: 1,
  }).setOrigin(0.5).setDepth(DEPTH.visitor).setVisible(false);
}

const alive = (o) => !!o && !!o.scene;
function kill(o) {
  if (alive(o)) o.destroy();
}

// ---------------------------------------------------------------------------
// Visitors
// ---------------------------------------------------------------------------
export class Visitors {
  /**
   * @param {Phaser.Scene} scene  GameScene
   * @param {object} sequence     createSequence(): visitorAt(i), seed
   * @param {object} opts         { audio, bus, attract, scheduled, reducedMotion, actions }
   *   scheduled: false in a head-to-head match (visitors then only come as attacks, see attack())
   *   actions: { top() -> {x,y,left,right}, busy() -> bool, shove(plan, dir) -> n, giftAt(spec) -> {x,y,angle},
   *              gift(spec) -> Block|null, found(blocks) -> n, steal(max) -> Image[], shield() -> bool,
   *              coach(type), toast(text, color) }
   */
  constructor(scene, sequence, { audio = null, bus = null, attract = false, scheduled = true, reducedMotion = false, actions = {} } = {}) {
    this.scene = scene;
    this.sequence = sequence;
    this.audio = audio;
    this.bus = bus;
    this.attract = !!attract;
    this.reduced = !!reducedMotion;
    this.actions = actions;
    this.seed = sequence && sequence.seed != null ? String(sequence.seed) : 'visitors';
    this.records = [];     // one { type, outcome, n } per visit, for the result
    this.cur = null;       // the visit on screen
    this.pending = null;   // a scheduled visitor that found another one still on screen
    this.forced = null;    // debug: { type, side } for the next block from FORCE_FROM on
    this.scheduled = !!scheduled;
    this.queue = [];       // attacks waiting for the stage (Uitdagersreeks)
    this.attacks = 0;
    this.ended = false;
    this.dead = false;
    this.i = -1;
    makeTextures(scene);
  }

  /** The visit on screen (null when there is none). */
  get active() {
    return this.cur;
  }

  /** The visits of this tower, oldest first: [{ type, outcome, n }]. */
  log() {
    return this.records.map((r) => ({ type: r.type, outcome: r.outcome, n: r.n }));
  }

  // --- schedule -------------------------------------------------------------

  /** Block i was attached to the crane: the visitor that comes with it (if any) arrives now. */
  setBlockIndex(i) {
    if (this.dead || this.ended) return;
    this.i = i;
    if (this.attract) {
      if (i === 3 && !this.cur && Math.random() < ATTRACT_CHANCE) this._start({ type: 'clown', at: i, side: Math.random() < 0.5 ? -1 : 1, strength: 1 }, true);
      return;
    }
    let v = this.scheduled && this.sequence && this.sequence.visitorAt ? this.sequence.visitorAt(i) : null;
    if (this.forced && i >= FORCE_FROM) {
      v = { type: this.forced.type, at: i, side: this.forced.side, strength: 1 };
      this.forced = null;
    }
    if (v && this.cur) {
      this.pending = v;   // never two visitors at once: this one waits for the next free block
      return;
    }
    if (!v && this.pending && !this.cur && !this._weatherStarts(i)) {
      v = { ...this.pending, at: i };
      this.pending = null;
    }
    if (v) this._start(v, false);
  }

  _weatherStarts(i) {
    const ev = this.sequence && this.sequence.eventAt ? this.sequence.eventAt(i) : null;
    return !!ev && ev.start === i;
  }

  /** Debug (?visitor=thief): the next block (from block FORCE_FROM on) brings this visitor. */
  force(type, side = 1) {
    if (VISITOR_TYPES.includes(type)) this.forced = { type, side: side < 0 ? -1 : 1 };
  }

  /**
   * Uitdagersreeks: the other player reached a height mark first and sends this visitor. It comes
   * now, or right after the one on screen. Its plan comes from the match seed and the attack's
   * number, so it is the same visit whichever device plays it.
   */
  attack(type, from, style = null) {
    if (this.dead || this.ended || this.attract || !VISITOR_TYPES.includes(type)) return false;
    this.attacks += 1;
    const v = { type, at: 1000 + this.attacks, side: this.attacks % 2 ? -1 : 1, strength: 1, from: from || null, style };
    if (this.cur) this.queue.push(v);
    else this._start(v, false);
    return true;
  }

  /** Debug / tests: a visitor right now, if the stage is free. Returns true if it came. */
  spawn(type, side = 1) {
    if (this.dead || this.ended || this.attract || this.cur || !VISITOR_TYPES.includes(type)) return false;
    this._start({ type, at: Math.max(0, this.i), side: side < 0 ? -1 : 1, strength: 1 }, false);
    return true;
  }

  _start(v, attract) {
    const scene = this.scene;
    const r = visitRng(this.seed, v);
    const c = {
      v,
      type: v.type,
      side: v.side < 0 ? -1 : 1,
      attract,
      t: 0,
      phase: v.type === 'monkey' ? 'swing' : v.type === 'clown' ? 'arrive' : 'climb',
      at: 0,          // t when the phase began
      gone: false,    // its part in the game is over (only the exit animation is left)
      rec: null,
      x: GAME_W / 2,
      y: 0,
      from: null,     // world point where the current move started
      sprite: emojiText(scene, VISITOR_INFO[v.type].emoji),
      objs: [],
      juggle: -1e9,
    };
    c.plan = v.type === 'monkey' ? monkeyPlan(r, v) : v.type === 'clown' ? clownPlan(r, v) : thiefPlan(r, v);
    c.objs.push(c.sprite);
    const accEmoji = ACC_FIT[v.type]?.[v.style] ? cosmetic('style', v.style)?.emoji : null;
    if (accEmoji) {
      c.acc = emojiText(scene, accEmoji, Math.round(VISITOR.size * ACC_DRAW)).setDepth(DEPTH.visitor + 0.05);
      c.accFit = accessoryFit(v.type, v.style, c.sprite, c.acc);
      if (c.accFit) c.objs.push(c.acc);
      else c.acc = (c.acc.destroy(), null);
    }
    if (!attract) {
      c.rec = { type: v.type, outcome: 'came', n: 0 };
      this.records.push(c.rec);
    }
    this.cur = c;
    if (c.type === 'monkey') {
      c.side = this._clearSide(c.side, VISITOR.sideX);
      c.rope = scene.add.graphics().setDepth(DEPTH.visitor - 0.2);
      c.objs.push(c.rope);
      c.watch = Math.max(0, this.i);   // he judges the first block dropped from now on (it is on the crane)
      c.verdict = null;                 // 'perfect' or 'strike', once that block is rated
      c.itch = 0;
      const left = c.side < 0;
      c.bubble = scene.add.image(0, 0, left ? 'vis_bubble_l' : 'vis_bubble_r')
        .setOrigin(left ? BUBBLE_TAIL / BUBBLE_W : 1 - BUBBLE_TAIL / BUBBLE_W, 1).setDepth(DEPTH.visitor + 0.2).setVisible(false);
      c.objs.push(c.bubble);
    } else if (c.type === 'clown') {
      if (!attract) c.side = this._clearSide(c.side, VISITOR.sideX + 10);
      c.k = 0;          // the next gift block to toss
      c.placed = [];    // the gift blocks on the tower
      c.balloons = scene.add.image(0, 0, 'vis_balloons').setOrigin(0.5, 1).setDepth(DEPTH.visitor - 0.1).setVisible(false);
      c.objs.push(c.balloons);
      c.puffs = [emojiText(scene, '💨', 34), emojiText(scene, '💨', 30)];
      // juggling balls in other colours than the balloons (they must not read as more balloons)
      c.balls = [0x5bbf5a, 0xf39a2b, 0x8e6ce0].map((tint) => scene.add.image(0, 0, 'vis_ball').setTint(tint).setDepth(DEPTH.visitor + 0.1).setVisible(false));
      c.objs.push(...c.puffs, ...c.balls);
      if (attract) c.sprite.setAlpha(0.9);
    } else {
      c.bag = scene.add.image(0, 0, 'vis_bag').setDepth(DEPTH.visitor - 0.1).setScale(0.62).setVisible(false);
      c.objs.push(c.bag);
      c.loot = [];
    }
    this._place(0);
    if (attract) return;

    // The arrival banner; a first-time player's first visitor of each kind gets the coach hint as its
    // subtitle (a separate hint pill would sit right where the thief climbs, or wait behind the banner).
    const info = VISITOR_INFO[c.type];
    const coach = !v.from && this.actions.coach ? this.actions.coach(c.type) : null;
    if (this.bus) {
      this.bus.emit('hud:banner', {
        emoji: info.emoji,
        title: v.from ? S.duelAttackIn(v.from, info.name) : `${info.name}!`,
        subtitle: coach || info.hint,
        type: c.type,
        kind: 'visitor',
        ms: coach ? 2600 : 0,
      });
    }
    // the player's Skild (a power-up): this monkey or thief arrives, then bounces off (step())
    if ((c.type === 'monkey' || c.type === 'thief') && this.actions.shield?.(false)) c.blocked = true;
    // the monkey comes with an alarm (his call follows in step()): he is trouble
    this._play(c.type === 'monkey' ? 'warning' : c.type === 'clown' ? 'clown' : 'thief');
    if (c.type === 'clown') this._honk(c);
  }

  /** The side a waiting visitor uses: the scheduled one, unless the tower top leans so far over that the tap circle would touch it. */
  _clearSide(side, edgeX) {
    const top = this.actions.top?.();
    if (!top) return side;
    const x = side < 0 ? edgeX : GAME_W - edgeX;
    const reach = VISITOR.hitR + AIM_CLEAR + 30;   // + the sway on the rope / the bob under the balloons
    const near = side < 0 ? x + reach > top.left : x - reach < top.right;
    return near ? -side : side;
  }

  // --- simulated clock (one call per fixed physics step) --------------------

  step() {
    if (!this.cur && this.queue.length && !this.ended && !this.dead) this._start(this.queue.shift(), false);
    const c = this.cur;
    if (this.dead || !c) return;
    c.t += STEP_MS;
    if (this.ended && c.phase !== 'caught') {
      if (c.t - c.endAt >= FADE_MS) this._finish();
      return;
    }
    if (c.gone) {
      if (c.phase === 'sulk' && !c.fled && c.t - c.at >= SULK_MS) {
        c.fled = true;   // he has had his say: off up the rope
        this._play('shoo');
      }
      if (c.t - c.at >= this._exitMs(c)) this._finish();
      return;
    }
    if (c.attract) {
      if (c.t >= ATTRACT_MS) this._finish();
      return;
    }
    const since = c.t - c.at;
    if (c.blocked && since >= (c.type === 'monkey' ? ENTER_MS : 600)) {
      this._bounceOff(c);
      return;
    }
    if (c.type === 'monkey') {
      if (c.phase === 'swing' && !c.called && since >= CALL_MS) {
        c.called = true;
        this._play('monkey');
      }
      // He waits on his rope for the player's next landing: a Perfek scares him off ("Ek sal terug
      // wees!"), anything else (or no landing within monkeyWaitMs) and he jumps onto the tower.
      if (c.phase === 'swing') {
        const reacted = c.verdict && c.t - c.verdictAt >= (c.verdict === 'perfect' ? REACT_PERFECT_MS : REACT_STRIKE_MS);
        if (since >= ENTER_MS && (reacted || (!c.verdict && since >= VISITOR.monkeyWaitMs))) {
          if (c.verdict === 'perfect') {
            c.rec.outcome = 'shooed';
            this._leave(c, 'sulk');
            this._play('monkey');
          } else {
            this._phase(c, 'leap');
          }
        }
      } else if (c.phase === 'leap' && since >= VISITOR.monkeyLeapMs) this._phase(c, 'bounce');
      else if (c.phase === 'bounce' && since >= VISITOR.monkeyBounceMs) {
        const pushed = this.actions.shove ? this.actions.shove(c.plan, -c.side) : 0;
        c.rec.outcome = 'shoved';
        c.pushed = pushed;
        this._play('monkey');
        this._leave(c, 'leave');
      }
    } else if (c.type === 'clown') {
      // He stacks his blocks one at a time, each set in cement where it lands (with the tower under
      // it): a new foundation. Each waits until no block of the player's is in the air or still
      // sliding into place (it must not land on one, nor appear where one is passing).
      if (c.phase === 'arrive' && since >= VISITOR.clownArriveMs) this._phase(c, 'wait');
      if (c.phase === 'wait') {
        if (!this._busy()) this._toss(c);
      } else if (c.phase === 'toss' && since >= VISITOR.clownTossMs && !this._busy()) {
        if (c.gift) kill(c.gift);
        c.gift = null;
        const block = this.actions.gift ? this.actions.gift(c.plan.specs[c.k]) : null;
        c.k = block ? c.k + 1 : c.plan.specs.length;   // no block: the tower is over, he stops
        if (block) {
          c.placed.push(block);
          c.rec.outcome = 'gift';
          c.rec.n = c.placed.length;
        }
        if (c.k < c.plan.specs.length) {
          this._phase(c, 'gap');
        } else {
          if (c.placed.length && this.actions.found) this.actions.found(c.placed);
          this._leave(c, 'leave');
        }
      } else if (c.phase === 'gap' && since >= VISITOR.giftGapMs) {
        this._phase(c, 'wait');
      }
    } else if (c.phase === 'climb' && since >= c.plan.climbMs) {
      const loot = this.actions.steal ? this.actions.steal(VISITOR.thiefMax) : [];
      c.rec.outcome = 'stole';
      c.rec.n = loot.length;
      this._grab(c, loot);
      this._phase(c, 'grab');
    } else if (c.phase === 'grab' && since >= VISITOR.thiefGrabMs) {
      this._play('escape');
      this.actions.toast?.(c.rec.n > 0 ? S.thiefStole(c.rec.n) : S.thiefEmpty, '#ffd0a8');
      this._leave(c, 'leave');
    }
  }

  /** The player's shield: the visitor bounces off and leaves (it costs nothing). */
  _bounceOff(c) {
    c.blocked = false;
    this.actions.shield?.(true);
    c.rec.outcome = 'blocked';
    this._leave(c, c.type === 'monkey' ? 'shooed' : 'caught');
    this._play(c.type === 'monkey' ? 'shoo' : 'caught');
    this.scene.effects?.floatText(c.x, c.y - 70, '🛡️', { size: 72 });
    this.actions.toast?.(S.shieldBlocked(VISITOR_INFO[c.type].name), '#c9ffb8');
  }

  _phase(c, phase) {
    c.phase = phase;
    c.at = c.t;
    c.from = { x: c.x, y: c.y };
  }

  /** The visitor's part is done: only its exit animation is left (then the stage is free). */
  _leave(c, phase) {
    this._phase(c, phase);
    c.gone = true;
  }

  _exitMs(c) {
    switch (c.phase) {
      case 'shooed': return SHOO_MS;
      case 'sulk': return SULK_MS + SHOO_MS;
      case 'caught': return CAUGHT_MS;
      case 'leave': return c.type === 'monkey' ? VISITOR.monkeyLeaveMs : c.type === 'clown' ? VISITOR.clownLeaveMs : VISITOR.thiefLeaveMs;
      default: return FADE_MS;
    }
  }

  _finish() {
    const c = this.cur;
    if (!c) return;
    for (const o of c.objs) kill(o);
    if (c.gift) kill(c.gift);
    for (const img of c.loot || []) kill(img);
    this.cur = null;
  }

  _busy() {
    return !!(this.actions.busy && this.actions.busy());
  }

  _toss(c) {
    this._phase(c, 'toss');
    const spec = { ...c.plan.specs[c.k], i: -1, gift: true };
    const g = getGeometry(spec);
    c.giftGeom = g;
    c.gift = this.scene.add.image(c.x, c.y + 30, ensureTexture(this.scene, spec)).setOrigin(g.originX, g.originY)
      .setDepth(DEPTH.visitor - 0.3).setScale(0.6);
    this._play('clown', { short: true });
  }

  _grab(c, loot) {
    c.loot = loot;
    const bagX = c.x - c.side * 30;
    const bagY = c.y + 12;
    loot.forEach((img, k) => {
      this.scene.tweens.add({
        targets: img, x: bagX, y: bagY, scale: 0.12, alpha: 0.6, angle: img.angle + c.side * 90,
        duration: Math.max(120, VISITOR.thiefGrabMs - 60 * k), delay: 40 * k, ease: 'Cubic.easeIn',
        onComplete: () => {
          kill(img);
          if (alive(c.bag) && !this.reduced) c.bag.setScale(Math.min(1.05, c.bag.scaleX + 0.1));
        },
      });
    });
  }

  // --- taps -------------------------------------------------------------------

  /**
   * A tap at world point (wx, wy). Returns true when it hit a visitor: then it catches the thief
   * (while he can still be stopped) or makes the clown honk and juggle, and the block is NOT
   * dropped. Any other tap drops as normal, also one on the monkey: only a Perfek stops him.
   */
  tap(wx, wy) {
    const c = this.cur;
    if (this.dead || this.ended || !c || c.attract || c.gone || c.type === 'monkey') return false;
    if (!alive(c.sprite) || !c.sprite.visible) return false;
    if ((wx - c.x) ** 2 + (wy - c.y) ** 2 > VISITOR.hitR * VISITOR.hitR) return false;
    if (c.type === 'thief') {
      if (c.phase !== 'climb') return false;
      c.rec.outcome = 'caught';
      this._leave(c, 'caught');
      this._play('caught');
      this.actions.toast?.(S.thiefCaught, '#c9ffb8');
      c.hand = emojiText(this.scene, '✋', 56);
      c.objs.push(c.hand);
      return true;
    }
    // the clown is a gift: tapping him only makes him honk and juggle
    this._honk(c);
    c.juggle = c.t;
    this._play('clown', { short: true });
    return true;
  }

  /**
   * The player's block `index` was rated: 'P', 'G' or 'S', or 'X' when it was lost. A monkey
   * waiting on his rope judges the first block dropped since he came: a Perfek scares him off.
   */
  landed(index, rating) {
    const c = this.cur;
    if (this.dead || this.ended || !c || c.type !== 'monkey' || c.phase !== 'swing' || c.gone || c.verdict) return;
    if (!(index >= c.watch)) return;
    c.verdict = rating === 'P' ? 'perfect' : 'strike';
    c.verdictAt = c.t;
  }

  /** A block a visitor is to blame for went into the sea (the monkey's count for the results). */
  freeLoss(type) {
    for (let k = this.records.length - 1; k >= 0; k--) {
      const r = this.records[k];
      if (r.type !== type) continue;
      if (type === 'monkey') r.n++;
      return;
    }
  }

  /** Game over: whoever is on screen slips away; nothing more happens to the tower. */
  end() {
    if (this.ended) return;
    this.ended = true;
    this.pending = null;
    this.forced = null;
    this.queue.length = 0;
    const c = this.cur;
    if (c) {
      c.gone = true;
      c.endAt = c.t;
    }
  }

  // --- visuals (per frame) ----------------------------------------------------

  update() {
    const c = this.cur;
    if (this.dead || !c) return;
    // smooth between physics steps on fast screens (positions only; never the outcome)
    const lag = clamp(Number(this.scene.acc) || 0, 0, STEP_MS);
    this._place(lag);
  }

  _place(lag) {
    const c = this.cur;
    const scene = this.scene;
    const cam = scene.cameras.main;
    const tv = c.t + lag;
    const since = tv - c.at;
    const top = this.actions.top?.() || { x: GAME_W / 2, y: LAYOUT.baseTopY, left: GAME_W / 2 - 150, right: GAME_W / 2 + 150 };
    const sy = (y) => cam.scrollY + y;   // screen y -> world y (zoom is 1 during play)
    const drop = scene.dropLineY || LAYOUT.dropLineY;
    let x = c.x;
    let y = c.y;
    let rot = 0;
    let sx = 1;
    let syl = 1;
    let alpha = 1;
    const s = c.side;

    if (c.type === 'monkey') {
      const ax = s < 0 ? VISITOR.sideX : GAME_W - VISITOR.sideX;
      const ay = LAYOUT.jibY + (scene.st || 0);
      const len = drop - HANG_ABOVE_TOP - ay;
      let ropeTo = null;
      if (c.phase === 'swing') {
        // swings in from off-screen and settles at the side (no overshoot towards the tower)
        const u = clamp(tv / ENTER_MS, 0, 1);
        const swing = this.reduced ? 0 : SWAY * Math.sin((tv / 1100) * Math.PI * 2) * u;
        const th = s * 1.3 * (1 - (this.reduced ? u : outCubic(u))) + swing;
        x = ax + len * Math.sin(th);
        y = sy(ay + len * Math.cos(th));
        rot = -th * 0.7;
        ropeTo = { x, y: y - HALF + 6 };
        // while the player's block is in the air he crouches and fidgets: is it a Perfek?
        c.itch += ((this._busy() && tv > ENTER_MS ? 1 : 0) - c.itch) * 0.15;
        if (c.itch > 0.02 && !this.reduced) {
          const k = 0.09 * c.itch * Math.sin(tv / 35);
          sx = 1 + k;
          syl = 1 - k;
          rot += 0.08 * c.itch * Math.sin(tv / 23);
        }
      } else if (c.phase === 'leap') {
        const p = clamp(since / VISITOR.monkeyLeapMs, 0, 1);
        const tx = top.x;
        const ty = top.y - HALF + 4;
        x = lerp(c.from.x, tx, p);
        y = lerp(c.from.y, ty, p) - (this.reduced ? 0 : 110 * hump(p));
        rot = this.reduced ? 0 : -s * 0.6 * hump(p);
        const k = 1 - p;   // the empty rope swings back up
        ropeTo = { x: ax + (c.from.x - ax) * k, y: sy(ay) + (c.from.y - HALF + 6 - sy(ay)) * k };
      } else if (c.phase === 'bounce') {
        const p = clamp(since / VISITOR.monkeyBounceMs, 0, 1);
        const hop = this.reduced ? 0 : Math.abs(Math.sin(p * Math.PI * 2));
        x = top.x;
        y = top.y - HALF + 4 - 30 * hop;
        if (!this.reduced) {
          syl = 1 - 0.16 * (1 - hop) ** 4;
          sx = 2 - syl;
        }
      } else if (c.phase === 'sulk' && since < SULK_MS) {
        // a Perfek: he stays on his rope, shakes his fist and says he'll be back
        x = c.from.x;
        y = c.from.y;
        ropeTo = { x, y: y - HALF + 6 };
        rot = this.reduced ? 0 : 0.12 * Math.sin(tv / 70) - s * 0.1;
        if (alive(c.bubble)) {
          const u = clamp(since / 220, 0, 1);
          const fade = since > SULK_MS - 250 ? (SULK_MS - since) / 250 : 1;
          c.bubble.setVisible(true).setPosition(x - s * 6, y - HALF - 6).setScale(this.reduced ? 1 : outBack(u)).setAlpha(fade);
        }
      } else if (c.phase === 'leave' || c.phase === 'shooed' || c.phase === 'sulk') {
        if (alive(c.bubble)) c.bubble.setVisible(false);
        const ms = c.phase === 'sulk' ? SHOO_MS : this._exitMs(c);
        const p = clamp((c.phase === 'sulk' ? since - SULK_MS : since) / ms, 0, 1);
        if (c.phase === 'shooed' || c.phase === 'sulk') {
          // scurries back up its rope and away
          x = c.from.x;
          y = c.from.y - 700 * inCubic(p);
          ropeTo = { x, y: y - HALF + 6 };
          rot = this.reduced ? 0 : s * 0.3 * Math.sin(p * 12);
        } else {
          const ex = s < 0 ? -110 : GAME_W + 110;
          x = lerp(c.from.x, ex, p);
          y = c.from.y - (this.reduced ? 0 : 150 * hump(Math.min(1, p * 1.2))) + 260 * p * p;
          rot = this.reduced ? 0 : s * 2.2 * p;
        }
        alpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      }
      const rope = c.rope;
      if (alive(rope)) {
        rope.clear();
        if (ropeTo) {
          rope.lineStyle(7, 0x4e3115, 0.9).lineBetween(ax, sy(ay), ropeTo.x, ropeTo.y);
          rope.lineStyle(4, 0xb07a3c, 1).lineBetween(ax, sy(ay), ropeTo.x, ropeTo.y);
        }
      }
      if (alive(c.sprite)) c.sprite.setFlipX(c.phase === 'leave' ? s > 0 : s < 0);
    } else if (c.type === 'clown') {
      const hx = s < 0 ? VISITOR.sideX + 10 : GAME_W - VISITOR.sideX - 10;
      if (c.attract && c.skyY === undefined) c.skyY = top.y - 170;   // just above the little menu tower (it resets under him: keep his height)
      const hy = c.attract ? c.skyY : sy(drop - HOVER_ABOVE_TOP);
      const bob = this.reduced ? 0 : 7 * Math.sin((tv / 1300) * Math.PI * 2);
      const walk = this.reduced ? 0 : 0.12 * Math.sin((tv / 440) * Math.PI * 2);
      if (c.attract) {
        // drifts right across the sky above the attract tower
        const p = clamp(tv / ATTRACT_MS, 0, 1);
        x = s < 0 ? lerp(-90, GAME_W + 90, p) : lerp(GAME_W + 90, -90, p);
        y = hy + bob - 40 * hump(p);
        rot = walk;
        alpha = 0.95;
      } else if (c.phase === 'arrive') {
        const p = clamp(since / VISITOR.clownArriveMs, 0, 1);
        const e = this.reduced ? p : outCubic(p);
        x = lerp(s < 0 ? -90 : GAME_W + 90, hx, e);
        y = hy + 60 * (1 - e) + bob;
        rot = walk;
      } else if (c.phase === 'wait' || c.phase === 'toss' || c.phase === 'gap') {
        x = hx;
        y = hy + bob;
        rot = walk * 0.5;
      } else {
        const p = clamp(since / this._exitMs(c), 0, 1);
        x = c.from.x + (s < 0 ? -1 : 1) * 160 * p;
        y = c.from.y - 520 * p * p - 40 * p;
        rot = walk;
        alpha = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
      }
      if (c.phase === 'toss' && alive(c.gift)) {
        const g = c.giftGeom;
        const p = clamp(since / VISITOR.clownTossMs, 0, 1);
        // it flies to the very spot where it will set (flush on the tower top)
        const at = this.actions.giftAt ? this.actions.giftAt(c.plan.specs[c.k]) : null;
        const tx = at ? at.x : top.x;
        const ty = at ? at.y : top.y - (g.h - g.cy);
        c.gift.setPosition(lerp(x, tx, p), lerp(y + 34, ty, p) - (this.reduced ? 0 : 120 * hump(p)))
          .setRotation(lerp(0, at ? at.angle : 0, p) + (this.reduced ? 0 : s * 0.5 * hump(p))).setScale(lerp(0.6, 1, p));
      }
      if (alive(c.balloons)) c.balloons.setVisible(true).setPosition(x + 2, y - HALF + 10).setRotation(rot * 0.4).setAlpha(alpha);
      if (alive(c.sprite)) c.sprite.setFlipX(s > 0);
      this._placeJuggle(c, tv, x, y, alpha);
    } else {
      const sideX = s < 0 ? top.left - HUG : top.right + HUG;
      const bannerTop = Number(scene.registry.get('hudBannerTop'));
      const limit = sy((Number.isFinite(bannerTop) ? bannerTop : scene.H - BANNER_TOP_FALLBACK) - HALF - 10);
      const yEnd = top.y + CLIMB_TO;
      const yStart = Math.max(yEnd + 40, Math.min(top.y + CLIMB_FROM, limit));
      if (c.phase === 'climb') {
        const p = clamp(tv / c.plan.climbMs, 0, 1);
        // tiptoe: little steps up the side, a lean into each one
        const tip = this.reduced ? p : clamp(p + 0.025 * Math.sin(p * Math.PI * 12), 0, 1);
        x = sideX;
        y = lerp(yStart, yEnd, tip);
        rot = this.reduced ? 0 : s * 0.1 * Math.sin(p * Math.PI * 12);
        if (tv < 200) alpha = tv / 200;
      } else if (c.phase === 'grab') {
        x = sideX;
        y = yEnd;
        rot = this.reduced ? 0 : -s * 0.15;
      } else if (c.phase === 'caught') {
        const p = clamp(since / CAUGHT_MS, 0, 1);
        x = c.from.x - s * 60 * p;
        y = c.from.y - (this.reduced ? 0 : 70 * hump(Math.min(1, p * 1.6))) + 900 * p * p;
        rot = this.reduced ? 0 : s * 7 * p * p;
        alpha = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
        if (alive(c.hand)) {
          c.hand.setVisible(true).setPosition(c.from.x, c.from.y - HALF - 34 - 30 * outCubic(Math.min(1, p * 3)))
            .setScale(this.reduced ? 1 : outBack(clamp(p * 4, 0, 1))).setAlpha(p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1);
        }
      } else {
        // slides back down the side with his loot, faster and faster
        const p = clamp(since / this._exitMs(c), 0, 1);
        x = c.from.x + s * 30 * p;
        y = c.from.y + 900 * inCubic(p) + 40 * p;
        rot = this.reduced ? 0 : -s * 0.2;
        alpha = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      }
      if (alive(c.bag)) c.bag.setVisible(true).setPosition(x - s * 34, y + 14).setRotation(rot).setAlpha(alpha);
      if (alive(c.sprite)) c.sprite.setFlipX(s > 0);
    }

    if (this.ended && c.phase !== 'caught') alpha *= clamp(1 - (tv - c.endAt) / FADE_MS, 0, 1);
    c.x = x;
    c.y = y;
    if (alive(c.sprite)) c.sprite.setVisible(true).setPosition(x, y).setRotation(rot).setScale(sx, syl).setAlpha(alpha);
    if (alive(c.acc) && alive(c.sprite)) {
      // the hat (or the sunglasses) turns, squashes and flips with him
      const f = c.accFit;
      const flip = c.sprite.flipX;
      const ox = (flip ? -f.dx : f.dx) * sx;
      const oy = f.dy * syl;
      c.acc.setVisible(true).setFlipX(flip).setRotation(rot).setScale(f.scale * sx, f.scale * syl).setAlpha(alpha)
        .setPosition(x + ox * Math.cos(rot) - oy * Math.sin(rot), y + ox * Math.sin(rot) + oy * Math.cos(rot));
    }
    if (c.type === 'clown') this._placePuffs(c, tv, x, y);
  }

  _honk(c) {
    c.honkAt = c.t;
  }

  _placePuffs(c, tv, x, y) {
    const since = tv - (c.honkAt ?? -1e9);
    const s = c.side;
    c.puffs.forEach((p, k) => {
      if (!alive(p)) return;
      const u = (since - k * 160) / 520;
      if (u < 0 || u > 1 || this.ended) {
        p.setVisible(false);
        return;
      }
      p.setVisible(true).setPosition(x - s * (44 + 50 * u), y - 6 - 14 * k).setFlipX(s > 0)
        .setScale(0.6 + 0.6 * u).setAlpha(1 - u);
    });
  }

  _placeJuggle(c, tv, x, y, alpha) {
    const since = tv - c.juggle;
    const on = since >= 0 && since < JUGGLE_MS && !this.ended && !c.attract;
    c.balls.forEach((b, k) => {
      if (!alive(b)) return;
      if (!on) {
        b.setVisible(false);
        return;
      }
      // a juggling cascade in front of him, from hand to hand (below the balloons)
      const ph = (since / 520 + k / 3) % 1;
      b.setVisible(true).setPosition(x + 44 * Math.cos(ph * Math.PI * 2), y + 34 - 64 * Math.abs(Math.sin(ph * Math.PI)))
        .setAlpha(alpha * Math.min(1, (JUGGLE_MS - since) / 200));
    });
  }

  _play(name, opts) {
    if (this.attract || !this.audio || !this.audio.play) return;
    this.audio.play(name, opts || {});
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    if (this.cur) this._finish();
    this.cur = null;
    this.pending = null;
  }
}
