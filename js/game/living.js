// (1.16) Die Lewende Toring in Stapel itself: js/core/living.js's rules on the real tower, with the moments that make it
// a joy (the owner, 16 Oct 2026: "it needs to be so joyfull that you cant put the game down"):
//  - a floor lands with its windows dark; once its landing is rated the lights come on one by one, each with a rising
//    note, and a face pops out of every new room, waves, and flies up to the people counter
//  - a run of Perfeks lights more rooms than the floor has windows: the extra lights run down the tower into the dark
//    windows below (a boarded-up Skeef floor gets fixed up)
//  - a floor that falls: everyone in it jumps out with a parachute
//  - the town's titles (Huisie ... Sterrestad) with fireworks and a wave of light up the tower, the record within reach
//  - on the menu's tower the people live there quietly (no sounds, no counter)
// The windows are one picture per block (js/game/residents.js paintWindows), painted again when a window changes.

import { DEPTH } from '../config.js';
import { bus } from '../core/bus.js';
import { S } from '../core/strings.js';
import { audio, haptics } from '../audio.js';
import { roomsFor, titleFor, titleProgress, createCasting, LIVING, CAST_TRIBE } from '../core/living.js';
import { windowSlots, windowWorld, parachute, badgeKey, paintWindows, whenPortraits, CAST, burnRoom, waterWheel, vinesTo, throwBall } from './residents.js';

const RES = 1.5;           // the windows are painted this much sharper than the blocks (crisp faces on a phone)
const PAD = 3;             // the block textures' padding (js/game/blocks.js)
const FIRST_MS = 160;      // the first light comes on this long after the rating
const STEP_MS = 130;       // ...and the next ones one after the other
const POP_MS = 230;        // a face pops out of its window
const HOLD_MS = 170;       // ...waves...
const FALL_VY = 7;         // px/step: a lived-in floor falling this fast: everyone jumps
const SWEEP_MS = 1500;     // the pictures of floors that are gone are freed this often
// (1.16 battles) each tribe beats one: Vuur > Gras, Water > Vuur, Gras > Water ("Ekstra sterk")
export const BEATS = Object.freeze({ vuur: 'gras', water: 'vuur', gras: 'water' });
const FIRE_RX = 100;        // Veldbrand: their windows in an oval this wide and high around the aim (Ekstra sterk: bigger)
const FIRE_RY = 62;
const FIRE_GROW = 1.35;
const VINE_HALF_W = 56;     // Rankgryp: the column's half width, and how far up it climbs
const VINE_UP = 330;
const FIREWORK_TINTS = [0xffc21a, 0xff3b3b, 0x2f9bff, 0x35c84a, 0xff4fd8, 0x9b5cff];

let uid = 0;
const nameOf = (id) => CAST[id]?.name || '';
const TAG_FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';

/** A little house (the crane's tag) and a fright bubble ("!"), drawn once. */
function livingTextures(scene) {
  if (!scene.textures.exists('lv_house')) {
    const t = scene.textures.createCanvas('lv_house', 40, 40);
    const c = t.getContext();
    c.fillStyle = '#c8321f';
    c.beginPath(); c.moveTo(3, 19); c.lineTo(20, 4); c.lineTo(37, 19); c.closePath(); c.fill();
    c.fillStyle = '#fff6e0';
    c.fillRect(8, 18, 24, 18);
    c.fillStyle = '#ffd23f';
    c.fillRect(12, 22, 7, 7);
    c.fillRect(22, 22, 7, 7);
    c.fillStyle = '#7a4f26';
    c.fillRect(17, 28, 6, 8);
    c.strokeStyle = '#1d2b45'; c.lineWidth = 2;
    c.strokeRect(8, 18, 24, 18);
    c.beginPath(); c.moveTo(3, 19); c.lineTo(20, 4); c.lineTo(37, 19); c.stroke();
    t.refresh();
  }
  if (!scene.textures.exists('lv_fright')) {
    const t = scene.textures.createCanvas('lv_fright', 44, 48);
    const c = t.getContext();
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#1d2b45';
    c.lineWidth = 3;
    c.beginPath(); c.arc(22, 20, 17, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(16, 34); c.lineTo(12, 46); c.lineTo(25, 36); c.closePath(); c.fill();
    c.fillStyle = '#e8452c';
    c.font = 'bold 26px ' + TAG_FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('!', 22, 21);
    t.refresh();
  }
}

export class Living {
  /**
   * `quiet`: the menu's tower (people, nothing else). `best`: the player's record (people). `known(id, gold)`: has this
   * person lived in one of the player's towers before. `owner(block)`: 'me' (default) or 'them' (Blok vir Blok).
   */
  constructor(scene, { tribe = 'vuur', theirTribe = null, seed = 'x', quiet = false, best = 0, known = null, firstTown = false, reducedMotion = false, ownerOf = null, seat = null } = {}) {
    this.scene = scene;
    this.seat = seat === 0 || seat === 1 ? seat : null;
    this.firstTown = !!firstTown;   // the player's very first town: everyone is new, so nobody is called new
    this.quiet = !!quiet;
    this.tribe = tribe;
    // (Blok vir Blok: one tower, two towns) whose a new floor is, and the other player's tribe
    this.ownerOf = typeof ownerOf === 'function' ? ownerOf : () => true;
    this.theirTribe = theirTribe || { vuur: 'water', water: 'gras', gras: 'vuur' }[tribe] || 'water';
    this.seed = String(seed);
    this.reduced = !!reducedMotion;
    this.best = Math.max(0, best | 0);
    this.known = typeof known === 'function' ? known : () => true;
    this.dead = false;
    this.reset(this.seed);
    whenPortraits(() => { if (!this.dead) for (const f of this.floors.values()) this.dirty.add(f); });
    livingTextures(scene);
    if (!this.quiet) {
      // (the owner: "the more perfects you have the more rooms you have") what a Perfek with the block on the crane would
      // open, beside it while you aim: Perfek +2, +3, ... it grows with every Perfek in a row
      const style = { fontFamily: TAG_FONT, fontSize: '26px', fontStyle: 'bold', color: '#3b2a00', resolution: 1.5 };
      this.tagBg = scene.add.graphics();
      this.tagHouse = scene.add.image(0, 0, 'lv_house').setScale(0.62);
      this.tagTxt = scene.add.text(0, 0, '', style).setOrigin(0, 0.5);
      this.tag = scene.add.container(0, 0, [this.tagBg, this.tagHouse, this.tagTxt]).setScrollFactor(0).setDepth(DEPTH.crane + 0.4).setVisible(false);
      this.tagN = -1;
      this.frightAt = 0;
    }
    if (!this.quiet) {
      // fireworks: a ring of sparks (one speed: they spread as a ring) round a bright core
      // (in their own colours: added light washes out to white against a day sky)
      const fw = (speed, life, scale, n, tint) => scene.add.particles(0, 0, 'fx_spark', {
        emitting: false, lifespan: life, speed, angle: { min: 0, max: 360 }, gravityY: 140,
        scale: { start: scale, end: 0.1 }, alpha: { start: 1, end: 0.2 }, tint, maxAliveParticles: n,
      }).setDepth(DEPTH.fxWorld + 3);
      this.fwRing = fw({ min: 240, max: 280 }, { min: 900, max: 1150 }, 1.3, 180, FIREWORK_TINTS);
      this.fwCore = fw({ min: 20, max: 160 }, { min: 500, max: 800 }, 1.6, 80, [0xffd23f, 0xffffff, 0xff8fe0]);
    }
  }

  /** A new tower (the menu's tower starts over with a new seed). */
  reset(seed = this.seed) {
    if (this.floors) for (const f of this.floors.values()) this.free(f);
    this.seed = String(seed);
    this.dirty = new Set();        // floors whose windows changed: painted once, at the next frame
    this.opened = [];              // (Blok vir Blok, live) the windows of yours that got people since the last report
    // (Blok vir Blok: by seat, so both phones cast each player's people in the same order)
    const mine = this.seat === null ? this.seed : `${this.seed}/s${this.seat}`;
    const theirs = this.seat === null ? `${this.seed}/hulle` : `${this.seed}/s${1 - this.seat}`;
    this.casting = createCasting(mine, this.tribe);
    this.theirCasting = createCasting(theirs, this.theirTribe);
    this.floors = new Map();       // block index -> { block, mine, wins: [{ s, who, gold }], key, rated, gone }
    // (Blok vir Blok) floors that left this tower here, with who lived in them: the other game's report can bring the block
    // back (it never fell there), and its people come back with it (block index -> { mine, was, wasN, rated })
    this.left = new Map();
    this.comingSeq = 0;            // the order people were sent to their rooms (the game's end moves the last ones in in it)
    this.people = 0;               // living in the tower now (yours)
    this.theirs = 0;               // ...and the other player's (Blok vir Blok)
    this.movedIn = 0;              // moved in this game (the ones who jumped too)
    this.peak = 0;                 // the most of yours at once (the record: the toast says it the moment it is passed)
    this.jumped = 0;
    this.met = new Set();
    this.goldMet = [];
    this.newMet = [];              // people who had never lived in one of this player's towers before
    this.titleId = null;
    this.saidNear = false;
    this.saidRecord = false;
    this.newSaid = 0;
    this.sweepAt = 0;
    this.introSaid = false;
  }

  /** Blocks that never get rooms: Hanswors's gifts and log, the Fondamentblok. */
  fits(b) {
    const sp = b.spec || {};
    return !(sp.gift || sp.log || sp.foundation || b.special || b.gift);
  }

  // ------------------------------------------------------------------------------------------- the floors
  /**
   * A block joined the tower: a floor, its windows dark until its landing is rated. (Again for a block brought back: in
   * Blok vir Blok the other game's report can bring back a floor that fell only here; it keeps its owner, and whoever
   * lived in it comes back with it, as they never left on the other phone.)
   */
  landed(b) {
    if (this.dead || !b || b.destroyed || !this.fits(b)) return null;
    let f = this.floors.get(b.index);
    if (f && f.block === b) return f;
    if (!f) {
      const n = windowSlots(b.geom).length;
      if (!n) return null;
      const left = this.left.get(b.index);
      this.left.delete(b.index);
      f = { block: b, mine: left ? left.mine : this.ownerOf(b) !== false, wins: Array.from({ length: n }, () => ({ s: 'dark', who: null, gold: false })), key: `lvw_${++uid}`, rated: !!left?.rated, gone: false };
      this.floors.set(b.index, f);
      if (left?.was && this.jumpedNow(left.wasN)) this.comeBack(f, left.was);
    } else {
      f.block = b;
      if (f.gone && f.was && this.jumpedNow(f.wasN)) this.comeBack(f, f.was);
      f.gone = false;
    }
    f.was = null;
    this.dirty.add(f);
    return f;
  }

  /**
   * (Blok vir Blok) Did people jump out in this turn (`n`: the turn they jumped in)? The report that brings their floor
   * back is this turn's: a floor that fell in an earlier turn stayed down in that turn's report.
   */
  jumpedNow(n) {
    const cur = this.scene.turns?.cur?.n;
    return Number.isInteger(cur) && n === cur;
  }

  /** A floor brought back: the people who jumped out of it here are home again (its windows as they were). */
  comeBack(f, was) {
    let back = 0;
    was.forEach((v, i) => {
      const w = f.wins[i];
      if (!w || w.s === 'home' || w.s === 'burnt') return;
      if (v.s === 'home') {
        Object.assign(w, { s: 'home', who: v.who, gold: !!v.gold, known: false });
        if (f.mine) {
          this.people++;
          this.jumped = Math.max(0, this.jumped - 1);
        } else {
          this.theirs++;
        }
        back++;
      } else if (v.s === 'boarded' && w.s === 'dark') {
        w.s = 'boarded';
      }
    });
    if (!back) return;
    this.peak = Math.max(this.peak, this.people);
    this.emit(0);
  }

  paint(f) {
    const b = f.block;
    if (!b || b.destroyed) return;
    // the other player's floor: every window that isn't boarded up shows drawn curtains with the lamp on (all alike:
    // nothing tells who is home)
    // (1.16 battles) a burnt window shows its soot on both sides; a window of theirs a mission found empty shows its curtains
    // pulled open (known: nobody there now)
    const wins = f.wins.map((w) => (f.mine ? {
      look: w.s === 'home' ? (w.gold ? 'lit' : 'face') : w.s === 'boarded' ? 'boarded' : w.s === 'burnt' ? 'burnt' : 'room',
      who: w.who,
      tribe: w.who ? CAST_TRIBE[w.who] : this.tribe,
    } : {
      look: w.s === 'burnt' ? 'burnt' : w.s === 'boarded' ? 'boarded' : w.known && w.s !== 'home' ? 'open' : 'curtain',
      who: null, tribe: this.theirTribe,
    }));
    const key = paintWindows(this.scene, f.key, b.geom, wins, PAD, RES);
    if (key) b.setWindowTexture(key, RES);
  }

  free(f) {
    if (f.block && !f.block.destroyed) f.block.setWindowTexture(null);
    if (this.scene.textures.exists(f.key)) this.scene.textures.remove(f.key);
  }

  /**
   * A landing was rated: its rooms open (Skeef boards the floor up). A Perfek run's extra rooms light dark windows
   * lower down. `combo` = Perfeks in a row, this one included.
   */
  rated(b, r, combo = 1) {
    if (this.dead || !b) return;
    const f = this.floors.get(b.index) || this.landed(b);
    if (!f || f.rated || f.gone) return;
    f.rated = true;
    if (!this.quiet && !this.introSaid && this.intro) {
      this.introSaid = true;
      this.intro();
    }
    if (r === 'S' || r === 'X') {
      let any = false;
      for (const w of f.wins) if (w.s === 'dark') { w.s = 'boarded'; any = true; }
      if (any) {
        this.dirty.add(f);
        if (!this.quiet && f.mine) audio.play('board');
      }
      return;
    }
    const n = roomsFor(r, combo);
    const spots = this.spotsFor(f, n);
    if (!spots.length) return;
    const per = (r === 'P' ? Math.max(0, combo - 1) : 0);
    spots.forEach((p, k) => {
      p.f.wins[p.slot].s = 'coming';
      p.f.wins[p.slot].q = ++this.comingSeq;
      if (p.f.mine) this.opened.push([p.f.block.index, p.slot]);
      this.later(FIRST_MS + k * STEP_MS, () => this.moveIn(p.f, p.slot, k + per, k, p.f !== f));
    });
    this.later(FIRST_MS + spots.length * STEP_MS + POP_MS + HOLD_MS + 420, () => this.checkTown());
  }

  /**
   * Where `n` new rooms go: the floor's own dark windows first (from the middle out), then the nearest dark or
   * boarded-up windows of the standing floors around it, lowest distance first.
   */
  spotsFor(f, n) {
    const out = [];
    const mid = (f.wins.length - 1) / 2;
    const own = f.wins.map((w, i) => i).filter((i) => f.wins[i].s === 'dark').sort((a, c) => Math.abs(a - mid) - Math.abs(c - mid) || a - c);
    for (const i of own) {
      if (out.length >= n) return out;
      out.push({ f, slot: i });
    }
    if (out.length >= n) return out;
    const y0 = f.block.centerY;
    const others = [];
    for (const g of this.floors.values()) {
      if (g === f || g.mine !== f.mine || g.gone || !g.rated || !g.block || g.block.destroyed || g.block.state === 'lost' || g.block.state === 'falling') continue;
      const free = g.wins.map((w, i) => i).filter((i) => g.wins[i].s === 'dark' || g.wins[i].s === 'boarded');
      if (free.length) others.push({ g, free, d: Math.abs(g.block.centerY - y0) + (g.block.centerY < y0 ? 400 : 0) });
    }
    others.sort((a, c) => a.d - c.d);
    for (const o of others) {
      for (const i of o.free) {
        if (out.length >= n) return out;
        out.push({ f: o.g, slot: i });
      }
    }
    return out;
  }

  /** Someone moves into window `slot` of floor `f` (`note`: the rising pitch; `far`: a light that ran down the tower). */
  moveIn(f, slot, note, k, far) {
    const w = f.wins[slot];
    if (this.dead || !w || w.s !== 'coming') return;
    const b = f.block;
    if (!b || b.destroyed || f.gone || b.state === 'lost') {
      w.s = 'dark';
      return;
    }
    const wasBoarded = f.wins.some((x, i) => i !== slot && x.s === 'boarded');
    const { who, gold } = (f.mine ? this.casting : this.theirCasting).next();
    w.s = 'home';
    w.who = who;
    w.gold = f.mine && gold;
    w.known = false;
    // a boarded-up floor that gets someone is fixed up: all its boards come off (its other windows wait, dark)
    if (wasBoarded) for (const x of f.wins) if (x.s === 'boarded') x.s = 'dark';
    if (!f.mine) {
      // the other player's people move in behind their curtains: only the light comes on
      this.theirs++;
      this.dirty.add(f);
      if (!this.quiet && !this.hushed) {
        const p = windowWorld(b, slot);
        this.flash(p.x, p.y, windowSlots(b.geom)[slot], b.body.angle);
        this.emit(0);
      }
      return;
    }
    this.people++;
    this.movedIn++;
    this.peak = Math.max(this.peak, this.people);
    const fresh = !this.met.has(who) && !this.known(who, false);
    this.met.add(who);
    if (gold) this.goldMet.push(who);
    if (fresh && !this.newMet.includes(who)) this.newMet.push(who);
    this.dirty.add(f);
    if (this.quiet || this.hushed) return;
    this.emit(1);
    const p = windowWorld(b, slot);
    const s = windowSlots(b.geom)[slot];
    if (far) this.runLight(f, p);
    this.flash(p.x, p.y, s, b.body.angle);
    audio.play('room', { n: note });
    if (k === 0) haptics.tap();
    if (gold) {
      audio.play('gold');
      this.scene.effects?.floatText(p.x, p.y - 40, S.lvGold(nameOf(who)), { color: '#ffd23f', size: 34 });
    } else if (fresh && !this.firstTown && this.newSaid < 3) {
      this.newSaid++;
      this.scene.effects?.floatText(p.x, p.y - 40, S.lvNew(nameOf(who)), { color: '#bff3ff', size: 30 });
    }
    this.pop(p.x, p.y, who, gold);
  }

  /** The light comes on: a warm flash over the window and a few sparks. */
  flash(x, y, s, angle) {
    const sc = this.scene;
    const w = (s?.w || 18) + 8;
    const h = (s?.h || 24) + 8;
    const img = sc.add.image(x, y, 'fx_px').setDisplaySize(w, h).setRotation(angle || 0).setTint(0xfff2b0)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.tower + 0.8).setAlpha(0.95);
    sc.tweens.add({ targets: img, alpha: 0, scaleX: img.scaleX * 1.5, scaleY: img.scaleY * 1.5, duration: 320, ease: 'Quad.easeOut', onComplete: () => img.destroy() });
    sc.effects?.sparkle(x, y - 6, 4);
  }

  /** An extra Perfek room far down the tower: a little light runs from the top floor down to it. */
  runLight(f, to) {
    const top = this.scene.topBlock;
    if (!top || top.destroyed || this.reduced) return;
    const from = { x: top.centerX, y: top.centerY };
    const dot = this.scene.add.image(from.x, from.y, 'fx_spark').setTint(0xffe38c).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fxWorld + 2).setScale(0.9);
    this.scene.tweens.add({
      targets: dot, x: to.x, y: to.y, duration: 260, ease: 'Sine.easeIn',
      onComplete: () => dot.destroy(),
    });
  }

  /** The new resident's face pops out of the window, waves, and flies to the people counter (the HUD takes it over). */
  pop(x, y, who, gold) {
    const sc = this.scene;
    const key = badgeKey(sc, who);
    if (!key || this.reduced) {
      this.later(POP_MS + HOLD_MS, () => bus.emit('hud:living-fly', { x: null, y: null, who, gold }));
      return;
    }
    const parts = [];
    if (gold) parts.push(sc.add.image(0, 0, 'fx_spark').setTint(0xffd23f).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4).setAlpha(0.9));
    const face = sc.add.image(0, 0, key);
    parts.push(face);
    if (gold) {
      const ring = sc.add.graphics();
      ring.lineStyle(5, 0xffd23f, 1).strokeCircle(0, 0, 33);
      parts.push(ring);
    }
    const c = sc.add.container(x, y, parts).setDepth(DEPTH.fxWorld + 4).setScale(0.18);
    sc.tweens.add({ targets: c, y: y - 58, scale: gold ? 1.05 : 0.86, duration: POP_MS, ease: 'Back.easeOut' });
    // a wave: two quick tilts
    sc.tweens.add({ targets: c, angle: { from: -12, to: 12 }, duration: 85, yoyo: true, repeat: 1, delay: POP_MS - 40, ease: 'Sine.easeInOut' });
    this.later(POP_MS + HOLD_MS, () => {
      const cam = sc.cameras.main;
      const zoom = cam.zoom || 1;
      // world to screen (the camera zooms about its middle)
      const sx = (c.x - cam.scrollX - cam.width / 2) * zoom + cam.width / 2;
      const sy = (c.y - cam.scrollY - cam.height / 2) * zoom + cam.height / 2;
      bus.emit('hud:living-fly', { x: sx, y: sy, who, gold, scale: c.scale * zoom });
      c.destroy();
    });
  }

  // ------------------------------------------------------------------------------------------- losing people
  /** A floor left the tower (fell, was stolen, sank): everyone in it jumps out with a parachute. */
  lost(b, { quiet = false } = {}) {
    if (this.dead || !b) return;
    const f = this.floors.get(b.index);
    if (!f || f.block !== b || f.gone) return;
    this.eject(f, quiet || this.quiet);
    f.gone = true;
  }

  eject(f, quiet) {
    const b = f.block;
    let n = 0;
    // (who lived there, and in which turn they jumped: a floor this turn's report brings back gets them again)
    if (f.wins.some((w) => w.s === 'home')) {
      f.was = f.wins.map((w) => ({ s: w.s, who: w.who, gold: w.gold }));
      f.wasN = this.scene.turns?.cur?.n ?? null;
    }
    const sea = this.scene.water ? this.scene.water.surfaceY : (b?.bottom || 0) + 400;
    f.wins.forEach((w, i) => {
      if (f.mine && b && (w.s === 'coming' || w.s === 'home')) this.unopen(b.index, i);
      if (w.s === 'coming') w.s = 'dark';
      if (w.s !== 'home') return;
      if (!quiet && b && !b.destroyed) {
        const p = windowWorld(b, i);
        parachute(this.scene, p.x, p.y, w.who, { dir: (i + n) % 2 ? 1 : -1, seaY: sea, delay: 60 + n * 140 });
      }
      w.s = 'dark';
      w.who = null;
      w.gold = false;
      n++;
    });
    if (!n) return;
    if (f.mine) {
      this.people = Math.max(0, this.people - n);
      this.jumped += n;
    } else {
      this.theirs = Math.max(0, this.theirs - n);
    }
    this.dirty.add(f);
    if (quiet) return;
    audio.play('chute');
    this.emit(f.mine ? -n : 0);
  }

  // ------------------------------------------------------------------------------------------- live: one town on two phones
  /** Is block `b`'s floor this player's (true), the other player's (false), or no floor (null)? */
  floorMine(b) {
    const f = b ? this.floors.get(b.index) : null;
    return f ? f.mine : null;
  }

  /** The windows of yours that got people since the last call (the turn's report carries them to the other phone). */
  takeOpened() {
    const out = this.opened.slice(0, 24);
    this.opened = [];
    return out;
  }

  /** A window of yours emptied again before the report went (a mission, a fall): the other phone never moves anyone in. */
  unopen(i, slot) {
    this.opened = this.opened.filter(([a, b]) => a !== i || b !== slot);
  }

  /** The other player's landing, as their game chose its rooms: the same people move into the same windows here. */
  openRooms(list) {
    const touched = new Set();
    let k = 0;
    for (const [i, slot] of list || []) {
      const f = this.floors.get(i);
      if (!f || f.mine || f.gone || !f.wins[slot]) continue;
      const w = f.wins[slot];
      if (w.s !== 'dark' && w.s !== 'boarded') continue;
      w.s = 'coming';
      w.q = ++this.comingSeq;
      touched.add(f);
      const n = k++;
      this.later(FIRST_MS + n * STEP_MS, () => this.moveIn(f, slot, n, n, false));
    }
    for (const f of touched) f.rated = true;
  }

  // ------------------------------------------------------------------------------------------- battles (Blok vir Blok)
  /** [seat 0, seat 1]: your people at your seat `you`, the other player's at theirs. */
  peopleBySeat(you, { coming = false } = {}) {
    // (`coming`: people on their way into a room count already: a turn's report never misses a landing's rooms)
    let cm = 0;
    let ct = 0;
    if (coming) for (const f of this.floors.values()) if (!f.gone) for (const w of f.wins) if (w.s === 'coming') { if (f.mine) cm++; else ct++; }
    const p = [0, 0];
    p[you === 1 ? 1 : 0] = this.people + cm;
    p[you === 1 ? 0 : 1] = this.theirs + ct;
    return p;
  }

  /** The standing floors (not gone, not falling off). */
  standing() {
    return [...this.floors.values()].filter((f) => !f.gone && f.block && !f.block.destroyed && f.block.state !== 'lost' && f.block.state !== 'falling');
  }

  /**
   * The windows a mission of `kind` aimed at world point `at` reaches: [{ f, slot }]. `mine`: the mission is this player's
   * (it goes at the other side's floors). Veldbrand burns their rooms in an oval round the aim, for good; Waterwiel washes
   * the 2 floors of theirs nearest the aim (3 Ekstra sterk); Rankgryp climbs a column of theirs from the aim up (its
   * extra grab elsewhere is added when it is sent: `extras`).
   */
  reach(kind, at, { mine = true, strong = false } = {}) {
    const target = !mine;   // the floors under attack: f.mine === target
    const out = [];
    const floors = this.standing();
    if (kind === 'vuur') {
      const k = strong ? FIRE_GROW : 1;
      for (const f of floors) {
        if (f.mine !== target) continue;
        f.wins.forEach((w, i) => {
          if (w.s === 'burnt') return;
          const p = windowWorld(f.block, i);
          if (((p.x - at.x) / (FIRE_RX * k)) ** 2 + ((p.y - at.y) / (FIRE_RY * k)) ** 2 <= 1) out.push({ f, slot: i });
        });
      }
    } else if (kind === 'water') {
      const n = strong ? 3 : 2;
      const near = floors.filter((f) => f.mine === target)
        .map((f) => ({ f, d: Math.hypot(f.block.centerX - at.x, (f.block.centerY - at.y) * 1.4) }))
        .sort((a, c) => a.d - c.d).slice(0, n);
      for (const { f } of near) f.wins.forEach((w, i) => { if (w.s !== 'burnt') out.push({ f, slot: i }); });
    } else {
      for (const f of floors) {
        if (f.mine !== target) continue;
        f.wins.forEach((w, i) => {
          if (w.s === 'burnt') return;
          const p = windowWorld(f.block, i);
          if (Math.abs(p.x - at.x) <= VINE_HALF_W && p.y <= at.y + 40 && p.y >= at.y - VINE_UP) out.push({ f, slot: i });
        });
      }
    }
    return out.slice(0, 40);
  }

  /** Rankgryp's extra grab: `n` people of theirs anywhere else, at random. */
  extras(spots, n, { mine = true } = {}) {
    const target = !mine;
    const homes = [];
    for (const f of this.standing()) {
      if (f.mine !== target) continue;
      f.wins.forEach((w, i) => { if (w.s === 'home' && !spots.some((o) => o.f === f && o.slot === i)) homes.push({ f, slot: i }); });
    }
    const out = [];
    for (let k = 0; k < n && homes.length; k++) out.push(homes.splice(Math.floor(Math.random() * homes.length), 1)[0]);
    return out;
  }

  /** As the other game hears it: [[block index, window], ...]; and back. */
  hitsOf(spots) {
    return spots.map((p) => [p.f.block.index, p.slot]);
  }

  spotsOf(hits) {
    const out = [];
    for (const [i, slot] of hits || []) {
      const f = this.floors.get(i);
      if (f && !f.gone && f.block && !f.block.destroyed && f.wins[slot]) out.push({ f, slot });
    }
    return out;
  }

  /**
   * Robot Rikus aims (he can't see who is home either): at the floor of yours that landed best (a Perfek floor holds
   * the most), on screen, a little at random; Veldbrand a little off its middle when his own floors are close.
   */
  botAim(kind, { mine = false } = {}) {
    // (`mine`: aimed for this player, at the other side's floors; else Robot Rikus's at this player's)
    const target = !mine;
    const sc = this.scene;
    const cam = sc.cameras.main;
    const top = cam.scrollY + 60;
    const bottom = cam.scrollY + cam.height - 140;
    const seen = this.standing().filter((f) => f.mine === target && f.block.centerY > top && f.block.centerY < bottom);
    const pool = seen.length ? seen : this.standing().filter((f) => f.mine === target);
    if (!pool.length) {
      const t = sc.topBlock;
      return { x: t ? t.centerX : 360, y: t ? t.centerY : sc.towerTopY };
    }
    let best = null;
    for (const f of pool) {
      const r = sc.grid?.[f.block.index];
      const guess = r === 'P' ? 3 : r === 'G' ? 1.3 : 0.4;
      const known = f.wins.filter((w) => w.s === 'burnt' || w.known).length;
      const score = (guess + f.wins.length * 0.2 - known * 0.5) * (0.65 + Math.random() * 0.7);
      if (!best || score > best.score) best = { f, score };
    }
    const f = best.f;
    const mid = Math.floor((f.wins.length - 1) / 2);
    const p = windowWorld(f.block, mid);
    return { x: p.x + (Math.random() - 0.5) * 20, y: p.y };
  }

  /**
   * A mission lands at once in the counts (whoever was home at a reached window jumps; Veldbrand burns the window for
   * good; theirs show their curtains open where nobody is now) and plays out on screen: the fire, the wheel or the vines,
   * then the parachutes. `mine`: it is this player's mission. Returns { hit, own, pp? } (their people out, your own out).
   */
  strike(kind, at, spots, { mine = true, strong = false, quiet = false } = {}) {
    const jumps = [];
    let hit = 0;
    let own = 0;
    for (const p of spots) {
      const w = p.f.wins[p.slot];
      if (!w) continue;
      // (a window of yours that got people this turn and lost them again: the report never moves anyone in there)
      if (p.f.mine && (w.s === 'coming' || w.s === 'home') && p.f.block) this.unopen(p.f.block.index, p.slot);
      if (w.s === 'coming') w.s = 'dark';
      if (w.s === 'home') {
        jumps.push({ f: p.f, slot: p.slot, who: w.who, mineFloor: p.f.mine });
        if (p.f.mine === !mine) hit++;
        else own++;
        if (p.f.mine) this.people = Math.max(0, this.people - 1);
        else this.theirs = Math.max(0, this.theirs - 1);
        if (p.f.mine) this.jumped++;
        w.who = null;
        w.gold = false;
      }
      if (kind === 'vuur') w.s = 'burnt';
      else if (w.s === 'home' || w.s === 'dark' || w.s === 'boarded') w.s = w.s === 'boarded' ? 'boarded' : 'dark';
      if (!p.f.mine) w.known = true;
    }
    const floors = new Set(spots.map((p) => p.f));
    const land = () => {
      if (this.dead) return;
      for (const f of floors) this.dirty.add(f);
      const sea = this.scene.water ? this.scene.water.surfaceY : at.y + 500;
      jumps.forEach((j, k) => {
        const b = j.f.block;
        if (!b || b.destroyed) return;
        const q = windowWorld(b, j.slot);
        parachute(this.scene, q.x, q.y, j.who, { dir: q.x < at.x ? -1 : 1, seaY: sea, delay: 60 + k * 110 });
      });
      if (jumps.length) audio.play('chute');
      this.emit(jumps.some((j) => j.mineFloor) ? -1 : 0);
    };
    if (quiet || this.quiet || this.reduced) {
      land();
      return { hit, own };
    }
    this.playMission(kind, at, spots, { mine, strong }, land);
    return { hit, own };
  }

  /** The mission on screen; `land` when it reaches the tower. */
  playMission(kind, at, spots, { mine, strong }, land) {
    const sc = this.scene;
    const cam = sc.cameras.main;
    audio.play(kind === 'water' ? 'splash' : kind === 'gras' ? 'shoo' : 'zap');
    if (kind === 'vuur') {
      const x0 = mine ? (at.x < 360 ? cam.scrollX + 40 : cam.scrollX + cam.width - 40) : (at.x < 360 ? cam.scrollX + cam.width - 40 : cam.scrollX + 40);
      const y0 = cam.scrollY + 260;
      throwBall(sc, x0, y0, at.x, at.y, { kind: 'fire', ms: 560, arc: 70 }).then(() => {
        if (this.dead) return;
        sc.effects?.flash?.(0xff8a2a, 0.22, 200);
        sc.effects?.shake?.(0.006, 240);
        land();
        spots.forEach((p, k) => {
          const b = p.f.block;
          if (!b || b.destroyed) return;
          const q = windowWorld(b, p.slot);
          const s = windowSlots(b.geom)[p.slot] || { w: 24, h: 30 };
          burnRoom(sc, q.x, q.y, { w: s.w + 8, h: s.h + 6, ms: 1200, delay: k * 40 });
        });
      });
    } else if (kind === 'water') {
      const ys = spots.map((p) => windowWorld(p.f.block, p.slot).y);
      const xs = spots.map((p) => p.f.block.centerX);
      const y0 = (ys.length ? Math.min(...ys) : at.y) - 34;
      const y1 = (ys.length ? Math.max(...ys) : at.y) + 34;
      const cx = xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : at.x;
      const width = Math.max(140, ...spots.map((p) => (p.f.block.right - p.f.block.left)));
      waterWheel(sc, cx, y0, y1, { side: mine ? -1 : 1, width, ms: 1300, seaY: sc.water ? sc.water.surfaceY : null, onHit: land });
    } else {
      const top = spots.length ? Math.min(...spots.map((p) => windowWorld(p.f.block, p.slot).y)) - 26 : at.y - 120;
      vinesTo(sc, at.x, at.y + 50, Math.min(top, at.y - 40), { ms: 680, hold: 520 }).then(() => land());
      // the extra grab elsewhere: a thin vine of its own
      for (const p of spots) {
        const q = windowWorld(p.f.block, p.slot);
        if (Math.abs(q.x - at.x) > VINE_HALF_W + 4 || q.y > at.y + 44 || q.y < at.y - VINE_UP - 4) vinesTo(sc, q.x + 18, q.y + 46, q.y - 6, { ms: 600, hold: 380 });
      }
    }
    if (strong) sc.effects?.floatText(at.x, at.y - 70, S.lvStrong, { color: '#ffd23f', size: 34 });
  }

  // ------------------------------------------------------------------------------------------- the town
  /** After a landing's people are in: the HUD's count, a new title, the record. */
  checkTown() {
    if (this.dead || this.quiet || this.scene.over) return;   // (the game is over: the results card says it)
    const { now } = titleFor(this.people);
    if (now && now.id !== this.titleId) {
      const up = !this.titleId || this.rankOf(now.id) > this.rankOf(this.titleId);
      this.titleId = now.id;
      if (up) this.celebrate(now);
    }
    const best = this.best;
    if (best >= LIVING.recordFrom) {
      if (!this.saidRecord && this.people > best) {
        this.saidRecord = true;
        this.saidNear = true;
        bus.emit('hud:toast', { text: S.lvRecord(this.people), color: '#ffe38c' });
        audio.play('record');
      } else if (!this.saidNear && this.people < best && best - this.people <= LIVING.nearRecord) {
        this.saidNear = true;
        bus.emit('hud:toast', { text: S.lvNear(best - this.people), color: '#bff3ff' });
      }
    }
  }

  rankOf(id) {
    return id ? 1 + ['huisie', 'plaashuis', 'woonstel', 'hotel', 'wolkekrabber', 'stad', 'metropool', 'ruimtestad', 'sterrestad'].indexOf(id) : 0;
  }

  /** A new title: its banner, a fanfare, fireworks over the top and a wave of light up the tower. */
  celebrate(t) {
    // (it waits for a weather or visitor banner on screen: that one says how to play it)
    bus.emit('hud:banner', { emoji: t.emoji, title: S.lvTitles[t.id], subtitle: S.lvTitleSub(this.people), kind: 'living', wait: true });
    audio.play('milestone');
    haptics.perfect();
    const sc = this.scene;
    const top = sc.topBlock && !sc.topBlock.destroyed ? sc.topBlock : null;
    const x0 = top ? top.centerX : 360;
    const y0 = (top ? top.top : sc.towerTopY || 0) - 120;
    if (this.fwRing && !this.reduced) {
      for (let k = 0; k < 5; k++) {
        this.later(k * 230, () => {
          const x = x0 + (k % 2 ? 1 : -1) * (40 + 45 * k);
          const y = y0 - 70 * (k % 3) - 40;
          this.fwRing?.explode(30, x, y);
          this.fwCore?.explode(14, x, y);
          if (k) audio.play('pop', { k });
        });
      }
    }
    // the wave of light, bottom to top over the floors on screen
    const lit = [...this.floors.values()].filter((f) => f.mine && !f.gone && f.block && !f.block.destroyed && f.block.winImage?.visible && f.wins.some((w) => w.s === 'home'));
    lit.sort((a, c) => c.block.centerY - a.block.centerY);
    lit.slice(-14).forEach((f, k) => this.later(k * 55, () => {
      const im = f.block?.winImage;
      if (!im || !im.scene) return;
      im.setTintFill(0xfff6c8);
      this.later(90, () => { if (im.scene) im.clearTint(); });
    }));
  }

  /** The HUD's people counter (`delta`: what just changed, for its bounce). */
  emit(delta = 0) {
    if (this.quiet) return;
    const { now, next } = titleFor(this.people);
    bus.emit('hud:living', {
      people: this.people, theirs: this.theirs, delta, best: this.best,
      title: now ? { id: now.id, emoji: now.emoji, name: S.lvTitles[now.id] } : null,
      next: next ? next.at : null, progress: titleProgress(this.people),
    });
  }

  // ------------------------------------------------------------------------------------------- every frame
  /** Lived-in floors that start to fall: everyone jumps at once (not when the floor is already in the sea). */
  update(now) {
    if (this.dead) return;
    if (this.dirty.size) {
      for (const f of this.dirty) this.paint(f);
      this.dirty.clear();
    }
    if (this.tag) this.updateTag();
    if (this.tag && !this.reduced) this.fright(now);
    for (const f of this.floors.values()) {
      if (f.gone) continue;
      const b = f.block;
      if (!b || b.destroyed) continue;
      if (b.state === 'frozen' || b.state === 'falling') continue;
      if (b.body.velocity.y > FALL_VY && now - (b.landedAt || 0) > 300 && f.wins.some((w) => w.s === 'home')) this.eject(f, this.quiet);
    }
    if (now - this.sweepAt > SWEEP_MS) {
      this.sweepAt = now;
      for (const [i, f] of this.floors) {
        if (f.block && f.block.destroyed) {
          this.free(f);
          // (a Blok vir Blok block brought back gets its floor again from landed(): keep its owner and who lived there)
          if (f.gone || f.wins.every((w) => w.s !== 'home')) {
            this.floors.delete(i);
            if (f.gone) this.left.set(i, { mine: f.mine, was: f.was || null, wasN: f.wasN ?? null, rated: f.rated });
          }
        }
      }
    }
  }

  /** The crane's tag: how many rooms a Perfek with this block opens (shown on your own drops while you aim). */
  updateTag() {
    const sc = this.scene;
    const cr = sc.crane;
    const mineNow = !sc.turns || !!sc.turns.cur?.mine;
    const sp = sc.curSpec || {};
    const rooms = !(sp.foundation || sp.gift || sp.log);   // (the Fondamentblok never gets rooms: no Perfek +N on it)
    const on = !!(cr && cr.hasBlock() && cr.visible && !sc.falling && !sc.over && mineNow && !sc.inputLocked && rooms);
    if (!on) {
      if (this.tag.visible) this.tag.setVisible(false);
      return;
    }
    const n = roomsFor('P', (sc.combo | 0) + 1);
    if (n !== this.tagN) {
      const grew = this.tagN > 0 && n > this.tagN;
      this.tagN = n;
      this.tagTxt.setText(S.lvTag(n));
      const w = 30 + this.tagTxt.width + 16;
      this.tagBg.clear().fillStyle(0x1d2b45, 0.35).fillRoundedRect(-w / 2, -16, w, 36, 18)
        .fillStyle(n >= 4 ? 0xffb02e : 0xffd23f, 1).fillRoundedRect(-w / 2, -18, w, 34, 17)
        .lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(-w / 2, -18, w, 34, 17);
      this.tagHouse.setPosition(-w / 2 + 18, -1);
      this.tagTxt.setPosition(-w / 2 + 32, -1);
      this.tagW = w;
      if (grew && !this.reduced) {
        this.tag.setScale(1.45);
        sc.tweens.add({ targets: this.tag, scale: 1, duration: 320, ease: 'Back.easeOut' });
      }
    }
    const b = cr.block;
    const half = (b.displayWidth || 120) / 2;
    // on the side of the block towards the middle of the screen (clear of the edges and a match's race track)
    const side = b.x > sc.W / 2 ? -1 : 1;
    const x = Math.max(this.tagW / 2 + 8, Math.min(sc.W - this.tagW / 2 - 8, b.x + side * (half + this.tagW / 2 + 10)));
    const y = b.y - (b.displayHeight || 40) * (b.originY ?? 0.5) - 6;
    this.tag.setPosition(x, y);
    if (!this.tag.visible) this.tag.setVisible(true).setAlpha(1);
  }

  /** The tower wobbles hard: people in the top floors get a fright ("!" over a window or two). */
  fright(now) {
    const sc = this.scene;
    const level = Math.max(sc.wobble || 0, Math.min(1, Math.abs(sc.lean || 0)));
    if (level < 0.6 || now - this.frightAt < 900 || sc.over) return;
    this.frightAt = now;
    const top = [...this.floors.values()].filter((f) => f.mine && !f.gone && f.block && !f.block.destroyed && f.block.state !== 'frozen' && f.wins.some((w) => w.s === 'home'));
    top.sort((a, c) => a.block.centerY - c.block.centerY);
    const picks = [];
    for (const f of top.slice(0, 3)) {
      f.wins.forEach((w, i) => { if (w.s === 'home') picks.push({ f, i }); });
    }
    for (let k = 0; k < Math.min(2, picks.length); k++) {
      const p = picks.splice(Math.floor(Math.random() * picks.length), 1)[0];
      const at = windowWorld(p.f.block, p.i);
      const img = sc.add.image(at.x + 10, at.y - 18, 'lv_fright').setOrigin(0.3, 1).setScale(0.2).setDepth(DEPTH.fxWorld + 1);
      sc.tweens.add({ targets: img, scale: 0.62, duration: 160, ease: 'Back.easeOut' });
      sc.tweens.add({ targets: img, alpha: 0, y: at.y - 30, duration: 300, delay: 520, onComplete: () => img.destroy() });
    }
  }

  /** Hidden far below the camera (the game stops drawing deep cement): its windows too. */
  hide(b, on) {
    if (b?.winImage) b.winImage.setVisible(!on);
  }

  /**
   * The game is over: everyone still on their way into a room moves in now, quietly and in the order they were sent (the
   * results card, the record and Jou dorp count them, as a Blok vir Blok referee already did).
   */
  settleComing() {
    const due = [];
    for (const f of this.floors.values()) f.wins.forEach((w, i) => { if (w.s === 'coming') due.push({ f, i, q: w.q || 0 }); });
    if (!due.length) return;
    due.sort((a, c) => a.q - c.q);
    this.hushed = true;
    try {
      for (const d of due) this.moveIn(d.f, d.i, 0, 1, false);
    } finally {
      this.hushed = false;
    }
  }

  /** The game is over: the town in numbers (the results card), and the lights twinkle through the reveal. */
  summary() {
    this.settleComing();
    const { now } = titleFor(this.people);
    let rooms = 0;
    for (const f of this.floors.values()) if (!f.gone && f.mine) rooms += f.wins.filter((w) => w.s === 'home').length;
    return {
      people: this.people, peak: this.peak, theirs: this.theirs, rooms, movedIn: this.movedIn, jumped: this.jumped,
      title: now ? now.id : null, met: [...this.met], gold: [...this.goldMet], fresh: [...this.newMet],
      best: this.best,
    };
  }

  twinkle() {
    if (this.quiet || this.reduced) return;
    const lit = [...this.floors.values()].filter((f) => !f.gone && f.block?.winImage && f.wins.some((w) => w.s === 'home'));
    lit.forEach((f, k) => {
      const im = f.block.winImage;
      this.scene.tweens.add({ targets: im, alpha: 0.55, duration: 380 + (k % 5) * 70, yoyo: true, repeat: 4, delay: 600 + (k % 7) * 120, ease: 'Sine.easeInOut' });
    });
  }

  later(ms, fn) {
    this.scene.time.delayedCall(ms, () => { if (!this.dead) fn(); });
  }

  /** For tests (?debug=1): the town right now. */
  state() {
    const floors = [];
    for (const [i, f] of this.floors) floors.push({ i, mine: f.mine, gone: f.gone, rated: f.rated, wins: f.wins.map((w) => (w.s === 'home' ? (w.gold ? 'G' : 'H') : w.s[0])).join('') });
    return { people: this.people, theirs: this.theirs, movedIn: this.movedIn, jumped: this.jumped, title: this.titleId, floors };
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    for (const f of this.floors.values()) {
      try { this.free(f); } catch { /* the scene is going */ }
    }
    this.floors.clear();
    try { this.fwRing?.destroy(); this.fwCore?.destroy(); this.tag?.destroy(); } catch { /* */ }
    this.tag = null;
    this.fwRing = null;
    this.fwCore = null;
  }
}
