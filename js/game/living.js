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
import { windowSlots, windowWorld, parachute, badgeKey, paintWindows, whenPortraits, CAST } from './residents.js';

const RES = 1.5;           // the windows are painted this much sharper than the blocks (crisp faces on a phone)
const PAD = 3;             // the block textures' padding (js/game/blocks.js)
const FIRST_MS = 160;      // the first light comes on this long after the rating
const STEP_MS = 130;       // ...and the next ones one after the other
const POP_MS = 230;        // a face pops out of its window
const HOLD_MS = 170;       // ...waves...
const FALL_VY = 7;         // px/step: a lived-in floor falling this fast: everyone jumps
const SWEEP_MS = 1500;     // the pictures of floors that are gone are freed this often
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
  constructor(scene, { tribe = 'vuur', theirTribe = null, seed = 'x', quiet = false, best = 0, known = null, firstTown = false, reducedMotion = false, ownerOf = null } = {}) {
    this.scene = scene;
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
    this.casting = createCasting(this.seed, this.tribe);
    this.theirCasting = createCasting(`${this.seed}/hulle`, this.theirTribe);
    this.floors = new Map();       // block index -> { block, mine, wins: [{ s, who, gold }], key, rated, gone }
    this.people = 0;               // living in the tower now (yours)
    this.theirs = 0;               // ...and the other player's (Blok vir Blok)
    this.movedIn = 0;              // moved in this game (the ones who jumped too)
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
  /** A block joined the tower: a floor, its windows dark until its landing is rated. (Again for a block brought back.) */
  landed(b) {
    if (this.dead || !b || b.destroyed || !this.fits(b)) return null;
    let f = this.floors.get(b.index);
    if (f && f.block === b) return f;
    if (!f) {
      const n = windowSlots(b.geom).length;
      if (!n) return null;
      f = { block: b, mine: this.ownerOf(b) !== false, wins: Array.from({ length: n }, () => ({ s: 'dark', who: null, gold: false })), key: `lvw_${++uid}`, rated: false, gone: false };
      this.floors.set(b.index, f);
    } else {
      f.block = b;
      f.gone = false;
    }
    this.dirty.add(f);
    return f;
  }

  paint(f) {
    const b = f.block;
    if (!b || b.destroyed) return;
    // the other player's floor: every window that isn't boarded up shows drawn curtains with the lamp on (all alike:
    // nothing tells who is home)
    const wins = f.wins.map((w) => (f.mine ? {
      look: w.s === 'home' ? (w.gold ? 'lit' : 'face') : w.s === 'boarded' ? 'boarded' : 'room',
      who: w.who,
      tribe: w.who ? CAST_TRIBE[w.who] : this.tribe,
    } : { look: w.s === 'boarded' ? 'boarded' : 'curtain', who: null, tribe: this.theirTribe }));
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
    // a boarded-up floor that gets someone is fixed up: all its boards come off (its other windows wait, dark)
    if (wasBoarded) for (const x of f.wins) if (x.s === 'boarded') x.s = 'dark';
    if (!f.mine) {
      // the other player's people move in behind their curtains: only the light comes on
      this.theirs++;
      this.dirty.add(f);
      if (!this.quiet) {
        const p = windowWorld(b, slot);
        this.flash(p.x, p.y, windowSlots(b.geom)[slot], b.body.angle);
        this.emit(0);
      }
      return;
    }
    this.people++;
    this.movedIn++;
    const fresh = !this.met.has(who) && !this.known(who, false);
    this.met.add(who);
    if (gold) this.goldMet.push(who);
    if (fresh && !this.newMet.includes(who)) this.newMet.push(who);
    this.dirty.add(f);
    if (this.quiet) return;
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
    const sea = this.scene.water ? this.scene.water.surfaceY : (b?.bottom || 0) + 400;
    f.wins.forEach((w, i) => {
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

  // ------------------------------------------------------------------------------------------- the town
  /** After a landing's people are in: the HUD's count, a new title, the record. */
  checkTown() {
    if (this.dead || this.quiet) return;
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
          // (a Blok vir Blok block brought back gets its floor again from landed(): keep its people's record)
          if (f.gone || f.wins.every((w) => w.s !== 'home')) this.floors.delete(i);
        }
      }
    }
  }

  /** The crane's tag: how many rooms a Perfek with this block opens (shown on your own drops while you aim). */
  updateTag() {
    const sc = this.scene;
    const cr = sc.crane;
    const mineNow = !sc.turns || !!sc.turns.cur?.mine;
    const on = !!(cr && cr.hasBlock() && cr.visible && !sc.falling && !sc.over && mineNow && !sc.inputLocked);
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

  /** The game is over: the town in numbers (the results card), and the lights twinkle through the reveal. */
  summary() {
    const { now } = titleFor(this.people);
    let rooms = 0;
    for (const f of this.floors.values()) if (!f.gone && f.mine) rooms += f.wins.filter((w) => w.s === 'home').length;
    return {
      people: this.people, theirs: this.theirs, rooms, movedIn: this.movedIn, jumped: this.jumped,
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
