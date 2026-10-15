// (1.16, the owner 15-16 Oct 2026: "Please create the premium look for all three ideas") Die Lewende Toring as a screen of the
// real game: the game's own block art in each tribe's material (Vuur lava, Water ice, Gras stone), 2-4 arched windows per
// block with people living in them, the real crane, the world behind (BgScene), fire, water wheel, vines and parachutes.
// Three ideas, played against Robot Rikus (or a sample player run by the robot):
//   1 Wegkruipertjie       both towers stand ready; hide your people; throw at their blocks or send a mission; move one.
//   2 Bou en Beskerm       build your tower with the crane; a Perfek brings two new people; missions; 10 blocks each.
//   3 Een Toring, Twee Stamme  one shared tower, a block each; your people ride in your blocks; missions hit everyone.
// You see your own people; theirs stay behind curtains until a hit or the grass tribe's vines show them.
// The rules are the 15 Oct canvas preview's (robot-tested), placed on the real game's art.

import { GAME_W, DEPTH, CRANE } from '../config.js';
import { ensureTexture, getGeometry, withBlockSkin } from '../game/blocks.js';
import {
  ensureWindows, whenPortraits, windowSlots, windowWorld, castOf, parachute, burnBlock, swimAway, waterWheel, vinesTo, throwBall,
} from '../game/residents.js';
import { Crane } from '../game/crane.js';
import { Effects } from '../game/effects.js';
import { Water } from '../game/water.js';

export const TRIBE_SKIN = { vuur: 'lawa', water: 'ys', gras: 'klip' };
export const BEATS = { vuur: 'gras', water: 'vuur', gras: 'water' };
const SHAPES = ['slab', 'brick', 'slab', 'brick', 'plank', 'crate', 'cube', 'brick'];
const PAD = 3;
const PERFECT_PX = 9;
const CRANE_TOP = 84;
const RULES = {
  1: { blocks: 10, people: 8, cost: { vuur: 2, water: 3, gras: 3 }, rounds: 20 },
  2: { start: 4, people: 10, placed: 4, drops: 10, cost: { vuur: 4, water: 5, gras: 5 } },
  3: { people: 8, drops: 10, mustBy: 7, cost: { vuur: 4, water: 5, gras: 5 } },
};
const other = (w) => (w === 'me' ? 'ai' : 'me');

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One block of a living tower: the game's block picture (in its tribe's material) and its windows. */
class LBlock {
  constructor(scene, spec, tribe, owner, x, y) {
    this.scene = scene;
    this.spec = spec;
    this.tribe = tribe;
    this.owner = owner;       // 'me' | 'ai'
    this.geom = getGeometry(spec);
    this.key = withBlockSkin(TRIBE_SKIN[tribe] || 'kleur', () => ensureTexture(scene, spec));
    this.image = scene.add.image(x, y, this.key).setOrigin(this.geom.originX, this.geom.originY).setDepth(DEPTH.tower);
    this.body = { position: { x, y }, angle: 0 };
    this.slots = windowSlots(this.geom);
    this.res = new Array(this.slots.length).fill(null);   // a resident per window (or null)
    this.know = 'unknown';    // what the other side knows: 'unknown' | 'empty' | 'lit'
    this.litT = 0;
    this.ox = 0;              // x offset from the tower's middle
    this.dy = 0;              // a drop still being animated
    this.destroyed = false;
    this.winImage = null;
  }
  get w() { return this.geom.w; }
  get h() { return this.geom.h; }
  get centerX() { return this.body.position.x; }
  get centerY() { return this.body.position.y; }
  get left() { return this.body.position.x - this.geom.cx; }
  get right() { return this.body.position.x - this.geom.cx + this.geom.w; }
  get top() { return this.body.position.y - this.geom.cy; }
  get bottom() { return this.body.position.y - this.geom.cy + this.geom.h; }
  free() { return this.res.filter((r) => !r).length; }
  people() { return this.res.filter(Boolean); }
  setPose(x, y, a = 0) {
    this.body.position.x = x;
    this.body.position.y = y;
    this.body.angle = a;
    this.image.setPosition(x, y).setRotation(a);
    if (this.winImage) this.winImage.setPosition(x, y).setRotation(a);
  }
  setScale(sx, sy) {
    this.image.setScale(sx, sy);
    if (this.winImage) this.winImage.setScale(sx, sy);
  }
  /** Redraw the windows as the player (viewer 'me') sees them. */
  refresh() {
    if (this.destroyed) return;
    const mine = this.owner === 'me';
    const wins = this.res.map((r) => {
      if (mine) return r ? { look: 'face', who: r.who, tribe: this.tribe } : { look: 'room', tribe: this.tribe };
      if (this.know === 'lit') return r ? { look: 'lit', who: r.who, tribe: this.tribe } : { look: 'open', tribe: this.tribe };
      if (this.know === 'empty') return { look: 'open', tribe: this.tribe };
      return { look: 'curtain', tribe: this.tribe };
    });
    const key = ensureWindows(this.scene, this.geom, wins, PAD);
    if (!this.winImage) {
      this.winImage = this.scene.add.image(this.image.x, this.image.y, key).setOrigin(this.geom.originX, this.geom.originY).setDepth(DEPTH.tower + 0.5);
    } else this.winImage.setTexture(key);
    this.winImage.setPosition(this.image.x, this.image.y).setRotation(this.image.rotation).setScale(this.image.scaleX, this.image.scaleY);
    whenPortraits(() => this.refresh());
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.image.destroy();
    if (this.winImage) this.winImage.destroy();
  }
}

export class LewendeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Lewende', active: false });
  }

  init(data) {
    this.d = data || {};
    this.idea = [1, 2, 3].includes(this.d.idea) ? this.d.idea : 1;
    this.ui = this.d.ui;
    this.rnd = rng(this.d.seed || Date.now());
    this.bot = !!this.d.bot;          // the robot plays "me" too (tests)
    this.speed = this.d.speed || 1;
    this.alive = true;
    this.over = false;
  }

  create() {
    const H = this.scale.height;
    this.H = H;
    this.effects = new Effects(this, { reducedMotion: !!this.d.reducedMotion });
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.baseTop = 0;
    // the game's own sea (waves, shimmer, bubbles, fish); it never rises here
    this.water = new Water(this, { width: GAME_W });
    this.seaY = this.water.surfaceY;
    this.camY = -(H - 380);
    this.cameras.main.setScroll(0, this.camY);
    const R = RULES[this.idea];
    const mine = this.d.tribe || 'vuur';
    const theirs = this.d.foe?.tribe || BEATS[BEATS[mine]] || 'water';
    this.sides = {
      me: { who: 'me', tribe: mine, name: this.d.me?.name || 'Jy', charge: 0, drops: 0, people: [] },
      ai: { who: 'ai', tribe: theirs, name: this.d.foe?.name || 'Robot Rikus', charge: 0, drops: 0, people: [] },
    };
    for (const who of ['me', 'ai']) {
      const cast = castOf(this.sides[who].tribe);
      for (let i = 0; i < R.people; i++) this.sides[who].people.push({ id: `${who}${i}`, owner: who, who: cast[(i + (who === 'ai' ? 1 : 0)) % cast.length], state: 'reserve', block: null, slot: -1 });
    }
    // the towers: two islands side by side (ideas 1 and 2) or one wide base (idea 3)
    this.towers = this.idea === 3
      ? { shared: { x: GAME_W / 2, baseW: 320, blocks: [] } }
      : { me: { x: 190, baseW: 250, blocks: [] }, ai: { x: GAME_W - 190, baseW: 250, blocks: [] } };
    for (const tw of Object.values(this.towers)) this.drawBase(tw);
    if (this.idea === 1) this.buildStanding();
    if (this.idea === 2) this.buildStart();
    this.crane = null;
    if (this.idea !== 1) {
      // the crane hangs below the two player cards (the HUD is taller than the game's own)
      this.crane = new Crane(this, { top: CRANE_TOP });
    }
    this.input.on('pointerdown', (p) => this.onTap(p));
    this.events.once('shutdown', () => this.teardown());
    this.events.once('destroy', () => this.teardown());
    this.hud();
    this.time.delayedCall(300, () => this.run().catch((e) => { console.error(e); this.ui?.toast?.(`Fout: ${e.message}`); }));
  }

  teardown() {
    this.alive = false;
    if (this.crane) this.crane.destroy();
    this.crane = null;
    if (this.water) this.water.destroy();
    this.water = null;
  }

  // ------------------------------------------------------------------------------------------- scenery
  drawBase(tw) {
    const g = this.add.graphics().setDepth(DEPTH.tower - 2);
    const w = tw.baseW;
    const x0 = tw.x - w / 2;
    // the rock under the slab
    g.fillGradientStyle(0x9aa0ab, 0x9aa0ab, 0x4e5361, 0x4e5361, 1);
    g.beginPath();
    g.moveTo(x0 - 26, this.seaY + 120);
    g.lineTo(x0 - 6, this.baseTop + 28);
    g.lineTo(x0 + w * 0.3, this.baseTop + 18);
    g.lineTo(x0 + w * 0.7, this.baseTop + 22);
    g.lineTo(x0 + w + 8, this.baseTop + 28);
    g.lineTo(x0 + w + 30, this.seaY + 120);
    g.closePath();
    g.fillPath();
    // the concrete slab with hazard stripes at both ends (the game's fondament)
    g.fillStyle(0xaab3bd, 1);
    g.fillRect(x0, this.baseTop, w, 30);
    g.fillStyle(0xd7dde4, 1);
    g.fillRect(x0, this.baseTop, w, 5);
    g.fillStyle(0x5d656f, 1);
    g.fillRect(x0, this.baseTop + 26, w, 4);
    for (const sx of [x0, x0 + w - 44]) {
      g.fillStyle(0x2b3038, 1);
      g.fillRect(sx, this.baseTop + 5, 44, 21);
      g.fillStyle(0xf7c948, 1);
      for (let k = -1; k < 5; k++) {
        g.beginPath();
        g.moveTo(sx + k * 12, this.baseTop + 26);
        g.lineTo(sx + k * 12 + 6, this.baseTop + 26);
        g.lineTo(sx + k * 12 + 18, this.baseTop + 5);
        g.lineTo(sx + k * 12 + 12, this.baseTop + 5);
        g.closePath();
        g.fillPath();
      }
    }
    g.lineStyle(2, 0x3b3f4a, 0.8);
    g.strokeRect(x0, this.baseTop, w, 30);
  }

  // ------------------------------------------------------------------------------------------- towers
  newSpec(i) {
    const shape = SHAPES[Math.floor(this.rnd() * SHAPES.length)];
    return { i, shape, color: Math.floor(this.rnd() * 8), scale: 1 };
  }
  towerOf(who) { return this.idea === 3 ? this.towers.shared : this.towers[who]; }
  targetTower(who) { return this.idea === 3 ? this.towers.shared : this.towers[other(who)]; }
  /** The world y of a tower's top (the base's top when it has no blocks). */
  topY(tw) {
    let y = this.baseTop;
    for (const b of tw.blocks) y -= b.h;
    return y;
  }
  /** Where block `b` sits: its centroid in the world. */
  slotPos(tw, b) {
    let y = this.baseTop;
    for (const x of tw.blocks) {
      if (x === b) break;
      y -= x.h;
    }
    return { x: tw.x + b.ox, y: y - b.h + b.geom.cy + b.dy };
  }
  layoutTower(tw) {
    for (const b of tw.blocks) {
      const p = this.slotPos(tw, b);
      b.setPose(p.x, p.y, b.body.angle);
    }
  }
  addBlock(tw, owner, ox = 0) {
    const tribe = this.sides[owner].tribe;
    const b = new LBlock(this, this.newSpec(tw.blocks.length), tribe, owner, tw.x + ox, this.topY(tw));
    b.ox = ox;
    tw.blocks.push(b);
    this.layoutTower(tw);
    b.refresh();
    return b;
  }
  buildStanding() {
    for (const who of ['me', 'ai']) {
      const tw = this.towers[who];
      let x = 0;
      for (let i = 0; i < RULES[1].blocks; i++) {
        x = Math.max(-12, Math.min(12, x + (this.rnd() - 0.5) * 12));
        this.addBlock(tw, who, i ? x : 0);
      }
    }
    // the robot hides its people (spread over its blocks, sometimes two together)
    this.hideRandom('ai');
  }
  buildStart() {
    for (const who of ['me', 'ai']) {
      const tw = this.towers[who];
      for (let i = 0; i < RULES[2].start; i++) this.addBlock(tw, who, i ? (this.rnd() - 0.5) * 10 : 0);
      const blocks = tw.blocks;
      // (the owner: "more than one person should be in a block") two blocks with two people each
      for (let k = 0; k < RULES[2].placed; k++) this.moveIn(this.sides[who].people.find((p) => p.state === 'reserve'), blocks[k % 2 ? 3 : 1]);
    }
  }
  hideRandom(who) {
    const tw = this.towerOf(who);
    const mineBlocks = tw.blocks.filter((b) => b.owner === who);
    for (const p of this.sides[who].people) {
      if (p.state !== 'reserve') continue;
      const open = mineBlocks.filter((b) => b.free() > 0);
      if (!open.length) break;
      // fewer people per block on average: prefer a block with nobody yet
      const empty = open.filter((b) => b.people().length === 0);
      const from = empty.length && this.rnd() < 0.7 ? empty : open;
      this.moveIn(p, from[Math.floor(this.rnd() * from.length)]);
    }
  }
  moveIn(p, b) {
    if (!p || !b || b.free() <= 0) return false;
    const slot = b.res.findIndex((r) => !r);
    b.res[slot] = p;
    p.state = 'home';
    p.block = b;
    p.slot = slot;
    b.refresh();
    return true;
  }
  moveOut(p) {
    const b = p.block;
    if (b) {
      b.res[p.slot] = null;
      b.refresh();
    }
    p.block = null;
    p.slot = -1;
  }

  // ------------------------------------------------------------------------------------------- counts
  home(who) { return this.sides[who].people.filter((p) => p.state === 'home').length; }
  reserve(who) { return this.sides[who].people.filter((p) => p.state === 'reserve').length; }
  cost(who) { return RULES[this.idea].cost[this.sides[who].tribe]; }
  hud() {
    if (!this.ui) return;
    this.ui.hud({
      idea: this.idea,
      active: this.active,
      over: this.over,
      round: this.round || 1,
      drops: this.sides.me.drops,
      maxDrops: RULES[this.idea].drops || 0,
      sides: ['me', 'ai'].map((w) => ({
        who: w, name: this.sides[w].name, tribe: this.sides[w].tribe, home: this.home(w), reserve: this.idea === 1 ? 0 : this.reserve(w),
        charge: this.sides[w].charge, cost: this.cost(w),
      })),
    });
  }

  // ------------------------------------------------------------------------------------------- time
  wait(ms) {
    return new Promise((r) => this.time.delayedCall(ms / this.speed, r));
  }
  tween(cfg) {
    return new Promise((r) => this.tweens.add({ ...cfg, duration: (cfg.duration || 300) / this.speed, onComplete: () => r() }));
  }

  update(time, dtMs) {
    if (this.water) {
      this.water.update(dtMs);
      this.seaY = this.water.surfaceY;
    }
    // the camera keeps the highest tower's top below the crane, the sea low on the screen at the start
    let top = 0;
    for (const tw of Object.values(this.towers)) top = Math.min(top, this.topY(tw));
    const want = Math.min(-(this.H - 380), top - (this.crane ? 470 + CRANE_TOP : 360));
    this.camY += (want - this.camY) * Math.min(1, dtMs / 250);
    this.cameras.main.setScroll(0, this.camY);
    if (this.crane) {
      this.crane.update(dtMs * this.speed, { omega: CRANE.omega0 * (1 + (this.sides[this.active || 'me']?.drops || 0) * 0.025), amplitude: this.idea === 3 ? 150 : 110 });
    }
    if (this.falling) this.stepFalling(dtMs / 1000 * this.speed);
  }

  // ------------------------------------------------------------------------------------------- the match
  async run() {
    this.round = 1;
    if (this.idea === 1) await this.hidePhase();
    if (!this.alive) return;
    while (this.alive && !this.over) {
      await this.safeTurn('me');
      if (!this.alive || this.over) break;
      await this.safeTurn('ai');
      if (!this.alive || this.over) break;
      this.round += 1;
      if (this.idea === 1 && this.round > RULES[1].rounds) { this.finishByCount(); break; }
      if (this.idea !== 1 && this.sides.me.drops >= RULES[this.idea].drops && this.sides.ai.drops >= RULES[this.idea].drops) { this.finishByCount(); break; }
    }
  }

  checkOver() {
    if (this.over) return true;
    for (const who of ['me', 'ai']) {
      // nobody left in your blocks (in idea 3 the ones still to place count too): you lose
      const left = this.home(who) + (this.idea === 3 ? this.reserve(who) : 0);
      if (left === 0) {
        this.finish(other(who), 'almal');
        return true;
      }
    }
    return false;
  }
  finishByCount() {
    const a = this.home('me') + (this.idea === 3 ? this.reserve('me') : 0);
    const b = this.home('ai') + (this.idea === 3 ? this.reserve('ai') : 0);
    this.finish(a > b ? 'me' : b > a ? 'ai' : null, 'tel');
  }
  finish(winner, why) {
    if (this.over) return;
    this.over = true;
    this.hud();
    if (this.crane && this.crane.hasBlock()) this.crane.release();
    this.ui?.bar?.('', []);
    if (winner === 'me' && !this.d.reducedMotion) this.effects.sparkle(GAME_W / 2, this.camY + 500, 40);
    const result = { winner, why, me: this.home('me') + (this.idea === 3 ? this.reserve('me') : 0), ai: this.home('ai') + (this.idea === 3 ? this.reserve('ai') : 0), idea: this.idea };
    this.time.delayedCall(1400 / this.speed, () => this.d.onEnd?.(result));
  }

  /**
   * A turn that can't freeze the match: an error ends that turn (logged) and the game goes on; a robot's turn that runs
   * past 30 s (game time) is ended too. The crane lets go of a block it still holds, nothing waits for a tap.
   */
  async safeTurn(who) {
    const robot = who === 'ai' || this.bot;
    let timer = null;
    try {
      const guard = robot ? new Promise((_, reject) => { timer = this.time.delayedCall(30000 / this.speed, () => reject(new Error(`turn ${who} ran too long at ${this.step}`))); }) : null;
      await (guard ? Promise.race([this.turn(who), guard]) : this.turn(who));
    } catch (e) {
      console.error('[lewende]', e);
      if (this.crane && this.crane.hasBlock()) this.crane.release();
      this.hanging = null;
      if (this.falling) { this.falling.b.destroy(); this.falling = null; }
      this.waitTap = null;
      this.hud();
    } finally {
      if (timer) timer.remove(false);
    }
  }

  async turn(who) {
    this.step = `turn-${who}`;
    this.active = who;
    this.hud();
    if (this.checkOver()) return;
    const isBot = who === 'ai' || this.bot;
    if (who === 'ai') this.ui?.toast?.(`${this.sides.ai.name} se beurt`, { ms: 900 });
    if (isBot) this.bar(`${this.sides[who].name} ${this.idea === 1 ? 'mik' : 'bou'}…`);
    if (this.idea === 1) {
      if (isBot) await this.botAct1(who);
      else await this.meAct1();
      if (!this.alive || this.checkOver()) return;
      if (isBot) await this.botMove(who);
      else await this.meMove();
    } else {
      const d = isBot ? await this.botDrop(who) : await this.meDrop();
      if (!this.alive || this.checkOver()) return;
      if (this.idea === 2 && d && d.perfect && this.reserve(who) > 0) {
        if (isBot) this.botPlace(who, 2);
        else await this.mePlace(2);
      }
      if (this.sides[who].charge >= this.cost(who) && this.home(who) > 0) {
        if (isBot) {
          const a = this.botAim(who);
          if (this.sides[who].tribe === 'gras' || a.score > (this.idea === 3 ? 0.4 : 0.2)) await this.special(who, a.b);
        } else await this.meMission();
      }
    }
    for (const tw of Object.values(this.towers)) for (const b of tw.blocks) {
      if (b.owner === other(who) && b.know === 'lit' && --b.litT <= 0) { b.know = 'unknown'; b.refresh(); }
    }
    this.hud();
    this.checkOver();
  }

  // ------------------------------------------------------------------------------------------- the player's taps
  onTap(p) {
    if (!this.waitTap || this.over) return;
    const x = p.worldX;
    const y = p.worldY;
    for (const tw of Object.values(this.towers)) {
      for (let i = tw.blocks.length - 1; i >= 0; i -= 1) {
        const b = tw.blocks[i];
        if (x >= b.left - 6 && x <= b.right + 6 && y >= b.top - 4 && y <= b.bottom + 4) {
          this.waitTap({ block: b, tower: tw, x, y });
          return;
        }
      }
    }
    this.waitTap({ block: null, x, y });
  }
  /** Waits for a tap the `accept` function takes (returns its value); `cancel()` ends the wait with null. */
  tapFor(accept) {
    return new Promise((resolve) => {
      this.waitTap = (t) => {
        const v = accept(t);
        if (v !== undefined && v !== null && v !== false) { this.waitTap = null; resolve(v); }
      };
      this.cancelTap = () => { this.waitTap = null; resolve(null); };
    });
  }
  bar(hint, buttons = []) { this.ui?.bar?.(hint, buttons); }

  // ------------------------------------------------------------------------------------------- idea 1: hide, throw, move
  async hidePhase() {
    this.active = 'me';
    this.hud();
    if (this.bot) { this.hideRandom('me'); return; }
    const tw = this.towers.me;
    const upd = () => {
      const left = this.reserve('me');
      this.bar(left ? `Versteek jou ${RULES[1].people} mense: tik jou blokke (<b>${left}</b> oor). Meer as een in ’n blok mag, maar ’n raak gooi wys almal uit.` : 'Almal is versteek. Reg?', [
        { label: 'Willekeurig', cls: 'alt', fn: () => { for (const b of tw.blocks) for (const r of b.people()) { this.moveOut(r); r.state = 'reserve'; } this.hideRandom('me'); upd(); this.hud(); } },
        { label: 'Begin ›', cls: 'grn', disabled: left > 0, fn: () => this.cancelTap?.() },
      ]);
    };
    upd();
    await this.tapFor((t) => {
      if (!t.block || t.block.owner !== 'me') return null;
      const p = this.sides.me.people.find((q) => q.state === 'reserve');
      if (p && t.block.free() > 0) this.moveIn(p, t.block);
      else if (t.block.people().length) { const r = t.block.people().at(-1); this.moveOut(r); r.state = 'reserve'; }
      upd();
      this.hud();
      return null;
    });
    if (this.reserve('me') > 0) this.hideRandom('me');   // nobody stays out of the tower
    this.hud();
    this.ui?.toast?.('Begin!', { big: true, ms: 900 });
  }
  async meAct1() {
    const s = this.sides.me;
    const special = { vuur: 'Veldbrand', water: 'Waterwiel', gras: 'Rankgryp' }[s.tribe];
    let mode = 'throw';
    const show = () => {
      const ready = s.charge >= this.cost('me');
      this.bar(mode === 'throw' ? `Tik ’n blok op <b>${this.sides.ai.name}</b> se toring om te gooi: almal in die blok spring uit` :
        `Mik jou <b>${special}</b>: tik ’n blok`, [
        { label: '🏉 Gooi', cls: mode === 'throw' ? 'sel alt' : 'alt', fn: () => { mode = 'throw'; show(); } },
        { label: `⚡ ${special} ${Math.min(s.charge, this.cost('me'))}/${this.cost('me')}`, cls: mode === 'special' ? 'sel' : '', disabled: !ready,
          fn: () => { if (s.tribe === 'gras') { this.cancelTap?.(); this._grass = true; } else { mode = 'special'; show(); } } },
      ]);
    };
    show();
    this._grass = false;
    const t = await this.tapFor((tap) => (tap.block && tap.block.owner === 'ai' ? tap.block : null));
    this.bar('…');
    if (this._grass) { await this.special('me', null); return; }
    if (!t) return;
    if (mode === 'throw') {
      await this.doThrow('me', t);
      s.charge = Math.min(this.cost('me'), s.charge + 1);
    } else await this.special('me', t);
  }
  async meMove() {
    const tw = this.towers.me;
    if (!tw.blocks.some((b) => b.people().length) || !tw.blocks.some((b) => b.free())) return;
    let sel = null;
    this.bar(`Skuif een van jou mense? Tik ’n blok met mense, dan een met plek. <span class="lt-dim">${this.sides.ai.name} sien net dat jy geskuif het.</span>`, [
      { label: 'Klaar ›', cls: 'grn', fn: () => this.cancelTap?.() },
    ]);
    await this.tapFor((t) => {
      if (!t.block || t.block.owner !== 'me') return null;
      if (!sel && t.block.people().length) { sel = t.block; this.effects.sparkle(sel.centerX, sel.centerY, 8); return null; }
      if (sel && t.block !== sel && t.block.free()) {
        const p = sel.people().at(-1);
        this.moveOut(p);
        this.moveIn(p, t.block);
        this.decoy('me', t.block);
        this.ui?.toast?.('Geskuif 🤫', { ms: 900 });
        return true;
      }
      return null;
    });
  }
  /** The other side sees that someone moved, not where: the block moved into and up to two blocks it knew were empty close again. */
  decoy(who, into) {
    const tw = this.towerOf(who);
    into.know = 'unknown';
    const known = tw.blocks.filter((b) => b.owner === who && b.know !== 'unknown' && b !== into);
    for (const b of known.sort(() => this.rnd() - 0.5).slice(0, 2)) { b.know = 'unknown'; b.refresh(); }
    into.refresh();
  }
  launchFrom(who) {
    if (this.idea === 3) return { x: who === 'me' ? -30 : GAME_W + 30, y: this.topY(this.towers.shared) - 80 };
    const tw = this.towers[who];
    return { x: tw.x, y: this.topY(tw) - 40 };
  }
  async doThrow(who, b) {
    const from = this.launchFrom(who);
    await throwBall(this, from.x, from.y, b.centerX, b.centerY, { kind: 'rugby', ms: 620 / this.speed });
    this.effects.dust(b.centerX, b.bottom, b.w);
    this.kick(b);
    const out = b.people();
    if (out.length) this.evict(b, out, 'chute');
    else {
      b.know = 'empty';
      b.refresh();
      this.effects.floatText(b.centerX, b.top - 20, 'Leeg!', { color: '#cfe0ff', size: 36 });
    }
    await this.wait(500);
  }
  kick(b) {
    this.tweens.add({ targets: [b.image, b.winImage].filter(Boolean), scaleX: 1.06, scaleY: 0.9, duration: 90 / this.speed, yoyo: true });
  }
  /** People leave block `b`: by parachute ('chute'), swimming ('swim') or pulled by vines ('grab'). */
  evict(b, people, how) {
    people.forEach((p, i) => {
      const at = windowWorld(b, p.slot);
      this.moveOut(p);
      p.state = 'lost';
      if (how === 'swim') swimAway(this, at.x, at.y, p.who, { dir: at.x < GAME_W / 2 ? -1 : 1, seaY: this.seaY, delay: i * 120 / this.speed });
      else parachute(this, at.x + (how === 'grab' ? (at.x < b.centerX ? -30 : 30) : 0), at.y, p.who, { dir: i % 2 ? 1 : -1, seaY: this.seaY, delay: (160 + i * 200) / this.speed });
    });
    if (!b.people().length) b.know = 'empty';   // the side that hit it knows it is empty now
    b.refresh();
    this.effects.floatText(b.centerX, b.top - 24, people.length > 1 ? `Raak! ${people.length} uit` : 'Raak!', { color: '#ffd23f', size: 40 });
    this.hud();
  }

  // ------------------------------------------------------------------------------------------- ideas 2 and 3: the crane
  hangBlock(who) {
    const tw = this.towerOf(who);
    const top = tw.blocks[tw.blocks.length - 1];
    const spec = this.newSpec(tw.blocks.length);
    const tribe = this.sides[who].tribe;
    const key = withBlockSkin(TRIBE_SKIN[tribe], () => ensureTexture(this, spec));
    this.crane.setCenter(tw.x + (top ? top.ox : 0));
    this.crane.setBlock(spec, key, getGeometry(spec));
    this.hanging = { spec, key, who, tribe };
  }
  /** The block the crane let go of falls (world coordinates) until it lands on the tower or drops in the sea. */
  dropHanging(carry = 0) {
    const pose = this.crane.release();
    const h = this.hanging;
    this.hanging = null;
    const tw = this.towerOf(h.who);
    const b = new LBlock(this, h.spec, h.tribe, h.who, pose.x, pose.y + this.camY);
    b.carry = carry;
    return new Promise((resolve) => {
      this.falling = { b, tw, vy: 120, resolve };
    });
  }
  stepFalling(dt) {
    const f = this.falling;
    const b = f.b;
    f.vy += 1800 * dt;
    const y = b.body.position.y + f.vy * dt;
    const top = f.tw.blocks[f.tw.blocks.length - 1];
    const landY = this.topY(f.tw) - b.h + b.geom.cy;
    const supportX = f.tw.x + (top ? top.ox : 0);
    const supportW = top ? top.w : f.tw.baseW;
    const off = b.body.position.x - supportX;
    if (y >= landY && !f.missed) {
      if (Math.abs(off) > supportW / 2 + 6) {
        f.missed = true;   // past the edge: it tips off and falls into the sea
        f.vr = Math.sign(off || 1) * 3;
      } else {
        this.falling = null;
        this.land(f, off);
        return;
      }
    }
    if (f.missed) {
      b.setPose(b.body.position.x + Math.sign(off || 1) * 120 * dt, y, b.body.angle + f.vr * dt);
      if (y > this.seaY + 40) {
        this.falling = null;
        this.water.splash(b.centerX);
        b.destroy();
        f.resolve({ landed: false });
      }
      return;
    }
    b.setPose(b.body.position.x, y, 0);
  }
  land(f, off) {
    const { b, tw } = f;
    const top = tw.blocks[tw.blocks.length - 1];
    let perfect = false;
    let ox = (top ? top.ox : 0) + off;
    if (Math.abs(off) <= PERFECT_PX) { perfect = true; ox = top ? top.ox : 0; }
    b.ox = ox;
    tw.blocks.push(b);
    this.layoutTower(tw);
    this.kick(b);
    this.effects.dust(b.centerX, b.bottom, b.w);
    const s = this.sides[b.owner];
    s.charge = Math.min(this.cost(b.owner), s.charge + (perfect ? 2 : 1));
    if (perfect) {
      this.effects.floatText(b.centerX, b.top - 30, 'Perfek!', { color: '#ffffff', size: 46 });
      this.effects.sparkle(b.centerX, b.top, 18);
    }
    // the people riding in it (idea 3)
    for (let k = 0; k < (f.b.carry || 0); k++) this.moveIn(s.people.find((p) => p.state === 'reserve'), b);
    b.refresh();
    this.hud();
    f.resolve({ landed: true, perfect, b });
  }
  async meDrop() {
    const s = this.sides.me;
    this.hangBlock('me');
    let carry = 0;
    const show = () => {
      const btns = [];
      if (this.idea === 3) {
        const left = this.reserve('me');
        const cap = Math.min(left, windowSlots(getGeometry(this.hanging.spec)).length);
        const ownLeft = Math.max(1, RULES[3].mustBy - s.drops);
        const must = left > 0 && left > (ownLeft - 1) * 2 ? Math.min(cap, left - (ownLeft - 1) * 2) : 0;
        if (carry < must) carry = must;
        for (let n = 0; n <= cap; n++) btns.push({ label: `🏠 ${n}`, cls: n === carry ? 'sel grn' : 'alt', disabled: n < must, fn: () => { carry = n; show(); } });
      }
      this.bar(this.idea === 3 ? `Hoeveel van jou mense ry saam in hierdie blok? Tik dan die skerm om te laat val. <span class="lt-dim">(${this.reserve('me')} oor)</span>`
        : 'Tik om te laat val · <b>Perfek</b> = twee nuwe inwoners + missie-krag', btns);
    };
    show();
    await this.tapFor((t) => (t ? true : null));
    this.bar('…');
    s.drops += 1;
    return this.dropHanging(carry);
  }
  async mePlace(n) {
    for (let k = 0; k < n && this.reserve('me') > 0; k++) {
      const tw = this.towerOf('me');
      if (!tw.blocks.some((b) => b.owner === 'me' && b.free())) return;
      this.bar(`Perfek! Nuwe inwoner ${k + 1}/${n}: tik ’n blok met plek. <span class="lt-dim">Waar sal ${this.sides.ai.name} nie soek nie?</span>`);
      const b = await this.tapFor((t) => (t.block && t.block.owner === 'me' && t.block.free() ? t.block : null));
      if (!b) return;
      this.moveIn(this.sides.me.people.find((p) => p.state === 'reserve'), b);
      this.hud();
    }
  }
  async meMission() {
    const s = this.sides.me;
    const special = { vuur: 'Veldbrand', water: 'Waterwiel', gras: 'Rankgryp' }[s.tribe];
    let go = false;
    this.bar(`Jou missie is gelaai! <b>${special}</b>${this.idea === 3 ? ' · pasop: dit tref ook joune' : ''}`, [
      { label: `⚡ ${special}`, fn: () => { go = true; this.cancelTap?.(); } },
      { label: 'Nie nou nie', cls: 'alt', fn: () => this.cancelTap?.() },
    ]);
    await this.tapFor(() => null);
    if (!go) return;
    if (s.tribe === 'gras') { await this.special('me', null); return; }
    this.bar(`Mik jou <b>${special}</b>: tik ’n blok${this.idea === 3 ? ' (enige een)' : ` op ${this.sides.ai.name} se toring`}`);
    const b = await this.tapFor((t) => (t.block && (this.idea === 3 || t.block.owner === 'ai') ? t.block : null));
    if (b) await this.special('me', b);
  }

  // ------------------------------------------------------------------------------------------- missions
  /** The blocks a fire or water mission aimed at `b` reaches: 3 (4 against the tribe it beats), never more than half the tower (at least 3). */
  specialRange(who, tw, b) {
    const i = tw.blocks.indexOf(b);
    const dbl = BEATS[this.sides[who].tribe] === this.sides[other(who)].tribe;
    const n = Math.min(dbl ? 4 : 3, Math.max(3, Math.ceil(tw.blocks.length / 2)));
    const from = Math.max(0, Math.min(i - 1, tw.blocks.length - n));
    return tw.blocks.slice(from, from + n);
  }
  async special(who, aimB) {
    const s = this.sides[who];
    const foe = other(who);
    const tw = this.targetTower(who);
    const dbl = BEATS[s.tribe] === this.sides[foe].tribe;
    if (!aimB && s.tribe !== 'gras') return;
    s.charge = 0;
    const special = { vuur: 'Veldbrand', water: 'Waterwiel', gras: 'Rankgryp' }[s.tribe];
    this.ui?.toast?.(`${special}!${dbl ? ' Ekstra sterk' : ''}`, { big: true, ms: 1100 });
    this.hud();
    if (s.tribe === 'vuur') {
      const list = this.specialRange(who, tw, aimB);
      const from = this.launchFrom(who);
      this.step = 'fire-ball';
      await throwBall(this, from.x, from.y, aimB.centerX, aimB.centerY, { kind: 'fire', ms: 560 / this.speed, arc: 90 });
      this.effects.shake(0.007, 300);
      for (const b of list) {
        burnBlock(this, b, { ms: 1500 / this.speed });
        const out = b.people();
        if (out.length) this.evict(b, out, 'chute');
        else if (b.owner !== who) { b.know = 'empty'; b.refresh(); }
      }
      await this.wait(1650);
      // the burnt blocks crumble; the ones above come down (and may tip off)
      this.step = 'fire-crumble';
      await this.crumble(tw, list);
      this.step = 'fire-end';
    } else if (s.tribe === 'water') {
      const list = this.specialRange(who, tw, aimB);
      const ys = list.map((b) => [b.top, b.bottom]).flat();
      const side = this.idea === 3 ? (who === 'me' ? -1 : 1) : (tw.x < GAME_W / 2 ? 1 : -1);
      const w = Math.max(...list.map((b) => b.w));
      this.step = 'water-wheel';
      const done = waterWheel(this, tw.x, Math.min(...ys) - 6, Math.max(...ys) + 6, { side, width: w, ms: 1400 / this.speed });
      await this.wait(700);
      for (const b of list) {
        const out = b.people().filter(() => !this.rooted(tw, b));
        if (this.rooted(tw, b) && b.people().length) this.effects.floatText(b.centerX, b.top - 10, 'Wortels hou!', { color: '#a8f08e', size: 30 });
        if (out.length) this.evict(b, out, 'swim');
        else if (b.owner !== who && !b.people().length) { b.know = 'empty'; b.refresh(); }
      }
      this.step = 'water-done';
      await done;
      this.step = 'water-end';
    } else {
      // vines always find someone (not in a rooted block) and show two more blocks' people
      const theirs = tw.blocks.filter((b) => b.owner === foe && b.people().length && !this.rooted(tw, b));
      const people = [];
      for (const b of theirs) for (const p of b.people()) people.push(p);
      const grabbed = people.sort(() => this.rnd() - 0.5).slice(0, dbl ? 3 : 2);
      if (!grabbed.length) this.ui?.toast?.('Die wortels beskerm almal', { ms: 1200 });
      for (const p of grabbed) {
        const b = p.block;
        const at = windowWorld(b, p.slot);
        await vinesTo(this, at.x + (at.x < tw.x ? -14 : 14), this.baseTop, at.y, { ms: 650 / this.speed });
        this.evict(b, [p], 'grab');
      }
      const show = tw.blocks.filter((b) => b.owner === foe && b.people().length).sort(() => this.rnd() - 0.5).slice(0, 2);
      for (const b of show) {
        b.know = 'lit';
        b.litT = 2;
        b.refresh();
        this.effects.sparkle(b.centerX, b.centerY, 12);
      }
      if (show.length) this.effects.floatText(tw.x, this.topY(tw) - 60, `${show.length} blokke lig op!`, { color: '#ffe680', size: 34 });
      await this.wait(900);
    }
    this.hud();
  }
  rooted(tw, b) {
    if (this.sides[b.owner]?.tribe !== 'gras') return false;
    const i = tw.blocks.indexOf(b);
    return i >= 0 && i < (this.idea === 3 ? 4 : 3);
  }
  async crumble(tw, list) {
    for (const b of list) {
      this.effects.dust(b.centerX, b.centerY, b.w);
      await this.tween({ targets: [b.image, b.winImage].filter(Boolean), alpha: 0, scaleY: 0.4, duration: 260 });
      for (const p of b.people()) { p.state = 'lost'; }
      b.destroy();
    }
    const before = new Map(tw.blocks.map((b) => [b, b.body.position.y]));
    tw.blocks = tw.blocks.filter((b) => !list.includes(b));
    for (const b of tw.blocks) {
      b.dy = 0;
      b.dy = before.get(b) - this.slotPos(tw, b).y;
    }
    // fall into place
    const t = { p: 0 };
    const start = new Map(tw.blocks.map((b) => [b, b.dy]));
    await this.tween({ targets: t, p: 1, duration: 360, ease: 'Bounce.easeOut', onUpdate: () => { for (const b of tw.blocks) { b.dy = start.get(b) * (1 - t.p); } this.layoutTower(tw); } });
    for (const b of tw.blocks) b.dy = 0;
    this.layoutTower(tw);
    await this.collapse(tw);
  }
  /** A block whose middle is past the edge of the one under it tips off, with everything on top of it. */
  async collapse(tw) {
    for (let i = 1; i < tw.blocks.length; i += 1) {
      const a = tw.blocks[i - 1];
      const b = tw.blocks[i];
      if (Math.abs(b.ox - a.ox) > a.w / 2) {
        const falling = tw.blocks.slice(i);
        tw.blocks = tw.blocks.slice(0, i);
        this.ui?.toast?.('Die toring kantel!', { ms: 1400 });
        this.effects.shake(0.01, 400);
        const dir = b.ox > a.ox ? 1 : -1;
        for (const f of falling) {
          if (f.people().length) this.evict(f, f.people(), 'chute');
          const x0 = f.centerX;
          const y0 = f.centerY;
          const t = { p: 0 };
          this.tweens.add({
            targets: t, p: 1, duration: 1100 / this.speed, ease: 'Quad.easeIn',
            onUpdate: () => f.setPose(x0 + dir * 140 * t.p, y0 + (this.seaY + 60 - y0) * t.p * t.p, dir * 2.4 * t.p),
            onComplete: () => { this.water?.splash(f.centerX); f.destroy(); },
          });
        }
        await this.wait(900);
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------------------------------- the robot
  /** How likely each of `foe`'s blocks hides someone, from what `who` knows. */
  odds(who, tw) {
    const foe = other(who);
    const blocks = tw.blocks.filter((b) => b.owner === foe);
    const unknown = blocks.filter((b) => b.know === 'unknown');
    const lit = blocks.filter((b) => b.know === 'lit').reduce((n, b) => n + b.people().length, 0);
    const per = Math.max(0, this.home(foe) - lit) / Math.max(1, unknown.length);
    return (b) => (b.owner !== foe ? 0 : b.know === 'lit' ? b.people().length : b.know === 'empty' ? 0.05 : Math.min(1.5, per));
  }
  botAim(who) {
    const tw = this.targetTower(who);
    const P = this.odds(who, tw);
    let best = null;
    let score = -1e9;
    for (const b of tw.blocks) {
      if (this.idea !== 3 && b.owner === who) continue;
      let sc = 0;
      if (this.sides[who].tribe !== 'gras') {
        for (const x of this.specialRange(who, tw, b)) sc += P(x) - (this.idea === 3 && x.owner === who ? x.people().length * 1.3 : 0);
      }
      sc += this.rnd() * 0.05;
      if (sc > score) { score = sc; best = b; }
    }
    return { b: best, score };
  }
  async botAct1(who) {
    await this.wait(600);
    const s = this.sides[who];
    if (s.charge >= this.cost(who) && this.home(who) > 1) {
      const a = this.botAim(who);
      await this.special(who, a.b);
      return;
    }
    const tw = this.targetTower(who);
    const P = this.odds(who, tw);
    let best = null;
    let bs = -1;
    for (const b of tw.blocks) {
      const sc = P(b) + this.rnd() * 0.08;
      if (sc > bs) { bs = sc; best = b; }
    }
    if (best) await this.doThrow(who, best);
    s.charge = Math.min(this.cost(who), s.charge + 1);
  }
  async botMove(who) {
    const tw = this.towerOf(who);
    const occ = tw.blocks.filter((b) => b.owner === who && b.people().length);
    const free = tw.blocks.filter((b) => b.owner === who && b.free());
    if (!occ.length || !free.length) return;
    let from = occ.find((b) => b.know === 'lit') || (this.rnd() < 0.4 ? occ[Math.floor(this.rnd() * occ.length)] : null);
    if (!from) return;
    const to = free.filter((b) => b !== from);
    if (!to.length) return;
    await this.wait(300);
    const p = from.people().at(-1);
    const dest = to[Math.floor(this.rnd() * to.length)];
    this.moveOut(p);
    this.moveIn(p, dest);
    this.decoy(who, dest);
    if (who === 'ai') this.ui?.toast?.(`${this.sides.ai.name} het iemand geskuif…`, { ms: 1000 });
  }
  async botDrop(who) {
    this.hangBlock(who);
    const s = this.sides[who];
    const tw = this.towerOf(who);
    const top = tw.blocks[tw.blocks.length - 1];
    let carry = 0;
    if (this.idea === 3 && this.reserve(who) > 0) {
      const cap = Math.min(this.reserve(who), windowSlots(getGeometry(this.hanging.spec)).length);
      const ownLeft = Math.max(1, RULES[3].mustBy - s.drops);
      const must = Math.max(0, this.reserve(who) - (ownLeft - 1) * 2);
      carry = Math.min(cap, Math.max(must, this.rnd() < 0.6 ? 1 + Math.floor(this.rnd() * 2) : 0));
    }
    await this.wait(700);
    // aim: often near the middle of the top, sometimes off, rarely a miss
    const cx = tw.x + (top ? top.ox : 0);
    let off = this.rnd() < 0.45 ? (this.rnd() - 0.5) * 8 : (this.rnd() - 0.5) * (top ? top.w * 0.8 : 40);
    if (top && this.rnd() < 0.05) off = (this.rnd() < 0.5 ? -1 : 1) * (top.w / 2 + 14);
    // wait for the swing to bring the block there (or close), then let go
    const target = cx + off;
    for (let k = 0; k < 120; k++) {
      const p = this.crane.getBlockPose();
      if (Math.abs(p.x - target) < 6) break;
      await this.wait(16);
    }
    s.drops += 1;
    this.step = 'bot-drop';
    return this.dropHanging(carry);
  }
  botPlace(who, n) {
    const tw = this.towerOf(who);
    for (let k = 0; k < n && this.reserve(who) > 0; k++) {
      const free = tw.blocks.filter((b) => b.owner === who && b.free());
      if (!free.length) return;
      this.moveIn(this.sides[who].people.find((p) => p.state === 'reserve'), free[Math.floor(this.rnd() * free.length)]);
      this.decoy(who, free[0]);
    }
    if (who === 'ai') this.ui?.toast?.(`${this.sides.ai.name} kry nuwe inwoners`, { ms: 900 });
    this.hud();
  }
}
