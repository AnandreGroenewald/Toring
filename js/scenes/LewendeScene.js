// (1.16 redesign, the owner 16 Oct 2026: "Nope I'm sorry this is not a premium design, If I choose the block the it
// automatically puts it in the first empty space instead of where I want it. It feels like its a 2 year olds game. Please
// redesign it.") Die Lewende Toring, redesigned: every block is a floor of three rooms (js/game/floors.js) and every choice
// is exact. You drag each of your people into the room you choose (or tap them, then the room) and move them the same way;
// you aim at one room, and a mission shows every room it will reach before you let it go. A miss tells you how many of
// theirs live next door. The camera comes close to the tower you work on and pulls back for the throw.
// Three ideas, played against Robot Rikus (or a sample player the robot plays for):
//   1 Wegkruipertjie          both towers stand ready; hide your 5 people; each turn throw at a room or send your mission,
//                             then move someone.
//   2 Bou en Beskerm          build with the real crane; a Perfek brings two new people for the rooms you choose; missions.
//   3 Een Toring, Twee Stamme one shared tower, a floor each; your people ride in the rooms you choose; missions hit any room.
// The missions: Veldbrand (Vuur) burns a cross of five rooms out for good; Waterwiel (Water) washes two whole floors;
// Rankgryp (Gras) climbs a column of four rooms and grabs one more person anywhere. Vuur beats Gras, Water beats Vuur, Gras
// beats Water: against the tribe you beat, your mission reaches further.

import { GAME_W, DEPTH, CRANE, FONT } from '../config.js';
import {
  FLOOR, ROOM, COLS, K, FRAME, VARIANTS, roomCenter, facadeKey, interiorKey, bustKey, frameKey, blindsKey, charKey, cracksKey,
  hintKey, ringKey, glowKey, sightKey, roofKey, flagKey, prepareRooms,
} from '../game/floors.js';
import {
  CAST, castOf, whenPortraits, parachute, swimAway, waterWheel, vinesTo, throwBall, prepareFx, burnRoom, badgeKey,
} from '../game/residents.js';
import { Crane } from '../game/crane.js';
import { Effects } from '../game/effects.js';
import { Water } from '../game/water.js';
import { audio, haptics } from '../audio.js';

export const BEATS = { vuur: 'gras', water: 'vuur', gras: 'water' };
export const MISSION = {
  vuur: { name: 'Veldbrand', icon: '🔥', what: '’n Kruis van 5 kamers brand uit', shape: 'cross' },
  water: { name: 'Waterwiel', icon: '🌊', what: '2 hele vloere spoel uit', shape: 'rows' },
  gras: { name: 'Rankgryp', icon: '🌿', what: '4 kamers in ’n kolom, plus 1 lukraak', shape: 'col' },
};
export const RULES = {
  1: { floors: 5, people: 5, rounds: 20, cost: { vuur: 2, water: 3, gras: 3 } },
  2: { start: 3, people: 9, placed: 3, drops: 7, cost: { vuur: 3, water: 4, gras: 4 } },
  3: { people: 8, drops: 8, mustBy: 6, cost: { vuur: 3, water: 4, gras: 4 } },
};
const TOWER_X = 178;
const PLINTH = 30;
const PERFECT_PX = 9;
const CRANE_TOP = 84;
const GOLD = 0xffd23f;
const DARK = 0.74;   // an empty room's lights off
// the facade a little darker than the block skin, so the windows' light carries the building at night
const FACADE_TINT = { vuur: 0x958887, water: 0xcfd9e4, gras: 0xb4bcaa };
const RED = 0xff4d3a;
const other = (w) => (w === 'me' ? 'ai' : 'me');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One room of a floor: who lives there, what the other side knows of it, and its pictures (in the floor's container). */
class Room {
  constructor(floor, col, v) {
    this.floor = floor;
    this.col = col;
    this.v = v;
    this.res = null;          // the person living here (or null)
    this.know = 'unknown';    // what the other side knows: 'unknown' | 'empty' | 'lit' (sees who is in it)
    this.litT = 0;
    this.burnt = false;       // a fire burnt it out: nobody can live here again
    this.broken = false;      // a throw broke the glass
    this.hint = null;         // a miss here heard this many of theirs next door
    this.stale = false;       // ...but someone has moved since
    this.lifting = false;     // its person is being dragged out
    const s = floor.scene;
    const p = roomCenter(col);
    this.lx = p.x;
    this.ly = p.y;
    const t = floor.tribe;
    this.inside = s.add.image(p.x, p.y, interiorKey(s, t, v)).setScale(1 / K);
    this.dark = s.add.rectangle(p.x, p.y, ROOM.w, ROOM.h, 0x06102c, DARK);
    this.char = s.add.image(p.x, p.y, charKey(s)).setScale(1 / K).setVisible(false);
    this.bust = s.add.image(p.x, p.y + ROOM.h / 2, 'lt_none').setOrigin(0.5, 1).setScale(1 / K).setVisible(false);
    this.blinds = s.add.image(p.x, p.y - ROOM.h / 2, blindsKey(s, t)).setOrigin(0.5, 0).setScale(1 / K).setVisible(false);
    this.cracks = s.add.image(p.x, p.y, cracksKey(s)).setScale(1 / K).setVisible(false);
    this.frame = s.add.image(p.x, p.y, frameKey(s, t)).setOrigin(FRAME.ox, FRAME.oy).setScale(1 / K);
    this.hintImg = s.add.image(p.x + ROOM.w / 2 - 9, p.y - ROOM.h / 2 + 9, hintKey(s, 0)).setScale(0.42).setVisible(false);
    floor.c.add([this.inside, this.dark, this.char, this.bust, this.blinds, this.cracks, this.frame, this.hintImg]);
  }
  get usable() { return !this.burnt && !this.floor.destroyed; }
  /** The room's middle in the world (the floor may lean). */
  get world() { return this.floor.world(this.lx, this.ly); }
  /** Can the player (viewer 'me') see who lives here? */
  get seen() { return this.floor.owner === 'me' || this.know === 'lit'; }
  paint() {
    const fl = this.floor;
    if (fl.destroyed) return;
    const s = fl.scene;
    const mine = fl.owner === 'me';
    const open = mine || this.know !== 'unknown';
    const lit = !this.burnt && !!this.res && this.seen;
    this.inside.setVisible(!this.burnt);
    this.char.setVisible(this.burnt);
    if (!this.fading) this.dark.setVisible(!this.burnt && !lit && open).setAlpha(DARK);
    this.blinds.setVisible(!open && !this.burnt && !this.rolling);
    this.cracks.setVisible(this.broken && !this.burnt);
    const key = lit && !this.lifting ? bustKey(s, this.res.who, this.v) : null;
    if (key) {
      this.bust.setTexture(key).setVisible(true);
      if (!this.breath) {
        this.bust.setScale(1 / K);
        this.breath = s.tweens.add({ targets: this.bust, scaleY: (1 / K) * 1.022, duration: 1500 + Math.floor(Math.random() * 900), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    } else {
      this.bust.setVisible(false);
      if (this.breath) { this.breath.stop(); this.breath = null; this.bust.setScale(1 / K); }
    }
    // the other side's room you saw into: a gold frame; your room they saw into: a red one (move them!)
    if (this.know === 'lit' && !this.burnt) this.frame.setTint(mine ? 0xff8a7a : 0xffe27a);
    else this.frame.clearTint();
    const hint = !mine && this.know === 'empty' && this.hint != null && !this.burnt;
    this.hintImg.setVisible(hint);
    if (hint) this.hintImg.setTexture(hintKey(s, Math.min(4, this.hint))).setAlpha(this.stale ? 0.45 : 1);
  }
}

/** One floor of a living tower: the facade in its tribe's material and three rooms, in one container that moves as one. */
class LFloor {
  constructor(scene, { tribe, owner, idx, x, y }) {
    this.scene = scene;
    this.tribe = tribe;
    this.owner = owner;       // 'me' | 'ai'
    this.idx = idx;
    this.ox = 0;              // x offset from the tower's middle
    this.dy = 0;              // a fall still being animated
    this.angle = 0;
    this.destroyed = false;
    this.c = scene.add.container(x, y).setDepth(DEPTH.tower);
    const f = facadeKey(scene, tribe, idx);
    this.facade = scene.add.image(0, 0, f.key).setScale(f.scale).setTint(FACADE_TINT[tribe] || 0xffffff);
    this.c.add(this.facade);
    const base = idx * 2 + (owner === 'ai' ? 1 : 0);
    this.rooms = [0, 1, 2].map((col) => new Room(this, col, (base + col * 2) % VARIANTS));
  }
  get x() { return this.c.x; }
  get y() { return this.c.y; }
  get top() { return this.c.y - FLOOR.h / 2; }
  get bottom() { return this.c.y + FLOOR.h / 2; }
  get left() { return this.c.x - FLOOR.w / 2; }
  get right() { return this.c.x + FLOOR.w / 2; }
  setPose(x, y, a = 0) {
    this.c.setPosition(x, y).setRotation(a);
    this.angle = a;
  }
  world(lx, ly) {
    const a = this.c.rotation;
    return { x: this.c.x + lx * Math.cos(a) - ly * Math.sin(a), y: this.c.y + lx * Math.sin(a) + ly * Math.cos(a) };
  }
  local(wx, wy) {
    const a = -this.c.rotation;
    const dx = wx - this.c.x;
    const dy = wy - this.c.y;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }
  people() { return this.rooms.map((r) => r.res).filter(Boolean); }
  paint() { for (const r of this.rooms) r.paint(); }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const r of this.rooms) if (r.breath) r.breath.stop();
    this.c.destroy();
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
    this.step = 'start';
    this.mode = null;
    this.ps = null;
    this.as = null;
    this.press = null;
    this.hanging = null;
    this.falling = null;
    this.holdCrane = false;
    this.cancelTap = null;
    this.dropTap = null;
  }

  create() {
    this.H = this.scale.height;
    this.effects = new Effects(this, { reducedMotion: !!this.d.reducedMotion });
    prepareFx(this);
    this.cam = this.cameras.main;
    this.cam.setBackgroundColor('rgba(0,0,0,0)');
    this.baseTop = 0;
    // the game's own sea (waves, shimmer, bubbles, fish); it never rises here
    this.water = new Water(this, { width: GAME_W });
    this.seaY = this.water.surfaceY;
    const R = RULES[this.idea];
    const mine = this.d.tribe || 'vuur';
    const theirs = this.d.foe?.tribe || BEATS[BEATS[mine]] || 'water';
    this.sides = {
      me: { who: 'me', tribe: mine, name: this.d.me?.name || 'Jy', charge: 0, drops: 0, people: [] },
      ai: { who: 'ai', tribe: theirs, name: this.d.foe?.name || 'Robot Rikus', charge: 0, drops: 0, people: [] },
    };
    for (const who of ['me', 'ai']) {
      const cast = castOf(this.sides[who].tribe);
      for (let i = 0; i < R.people; i++) {
        const id = cast[(i + (who === 'ai' ? 1 : 0)) % cast.length];
        const nm = CAST[id]?.name || id;
        this.sides[who].people.push({ id: `${who}${i}`, owner: who, who: id, name: i < cast.length ? nm : `Klein ${nm.split(/[ -]/)[0]}`, state: 'reserve', room: null });
      }
    }
    if (!this.textures.exists('lt_none')) this.textures.createCanvas('lt_none', 4, 4)?.refresh();
    prepareRooms(this, [...new Set([mine, theirs])]);
    this.towers = this.idea === 3
      ? { shared: { key: 'shared', x: GAME_W / 2, owner: null, floors: [] } }
      : { me: { key: 'me', x: TOWER_X, owner: 'me', floors: [] }, ai: { key: 'ai', x: GAME_W - TOWER_X, owner: 'ai', floors: [] } };
    for (const tw of Object.values(this.towers)) {
      this.drawBase(tw);
      this.makeRoof(tw);
    }
    if (this.idea === 1) this.buildStanding();
    if (this.idea === 2) this.buildStart();
    this.crane = null;
    if (this.idea !== 1) {
      // the crane hangs below the two player cards (the HUD is taller than the game's own)
      this.crane = new Crane(this, { top: CRANE_TOP });
      this.crane.setVisible(false);
    }
    this.rings = [];
    this.camMode = 'frame';
    this.frame('all', { ms: 0 });
    this.input.on('pointerdown', (p) => this.onDown(p));
    this.input.on('pointermove', (p) => this.onMove(p));
    this.input.on('pointerup', (p) => this.onUp(p));
    this.input.on('pointerupoutside', (p) => this.onUp(p, true));
    this.input.on('wheel', (p, o, dx, dy) => this.onWheel(dy));
    this.events.once('shutdown', () => this.teardown());
    this.events.once('destroy', () => this.teardown());
    whenPortraits(() => this.repaintAll());
    this.hud();
    this.time.delayedCall(300, () => this.run().catch((e) => { console.error(e); this.ui?.toast?.(`Fout: ${e.message}`); }));
  }

  teardown() {
    this.alive = false;
    this.ui?.tray?.(null);
    if (this.crane) this.crane.destroy();
    this.crane = null;
    if (this.water) this.water.destroy();
    this.water = null;
  }

  sfx(name, opts) {
    try { audio.play(name, opts); } catch { /* sound is optional */ }
  }

  // ------------------------------------------------------------------------------------------- scenery
  drawBase(tw) {
    const g = this.add.graphics().setDepth(DEPTH.tower - 2);
    const w = FLOOR.w + 36;
    const x0 = tw.x - w / 2;
    const y = this.baseTop;
    // the rock under the plinth, down into the sea
    g.fillGradientStyle(0x7d838f, 0x7d838f, 0x343944, 0x343944, 1);
    g.beginPath();
    g.moveTo(x0 - 30, this.seaY + 150);
    g.lineTo(x0 - 8, y + PLINTH + 6);
    g.lineTo(x0 + w * 0.3, y + PLINTH);
    g.lineTo(x0 + w * 0.7, y + PLINTH + 3);
    g.lineTo(x0 + w + 8, y + PLINTH + 6);
    g.lineTo(x0 + w + 34, this.seaY + 150);
    g.closePath();
    g.fillPath();
    // the plinth: dark dressed stone, a light edge on top, a step at its foot
    g.fillStyle(0x3a404d, 1);
    g.fillRect(x0 - 10, y + PLINTH - 4, w + 20, 10);
    g.fillGradientStyle(0x3b4252, 0x3b4252, 0x1f232c, 0x1f232c, 1);
    g.fillRect(x0, y, w, PLINTH);
    g.fillStyle(0x6a7386, 1);
    g.fillRect(x0, y, w, 3);
    g.lineStyle(1, 0x151820, 0.7);
    for (let x = x0 + 48; x < x0 + w - 10; x += 48) g.lineBetween(x, y + 4, x, y + PLINTH);
    // a brass name plate
    const name = tw.owner ? this.sides[tw.owner].name : 'Een toring · twee stamme';
    const label = this.add.text(tw.x, y + PLINTH / 2 + 1, name.toUpperCase(), { fontFamily: FONT, fontSize: '26px', fontStyle: '900', color: '#3a2600' })
      .setOrigin(0.5).setScale(0.5).setDepth(DEPTH.tower - 1);
    const pw = Math.min(w - 40, label.displayWidth + 26);
    g.fillStyle(0x8a6516, 1);
    g.fillRoundedRect(tw.x - pw / 2 - 1, y + 5, pw + 2, PLINTH - 10, 5);
    g.fillGradientStyle(0xffe08a, 0xffe08a, 0xc9952a, 0xc9952a, 1);
    g.fillRoundedRect(tw.x - pw / 2, y + 6, pw, PLINTH - 12, 4);
  }
  makeRoof(tw) {
    const tribe = tw.owner ? this.sides[tw.owner].tribe : this.sides.me.tribe;
    const c = this.add.container(tw.x, this.baseTop).setDepth(DEPTH.tower + 0.3).setVisible(false);
    const roof = this.add.image(0, 0, roofKey(this, tribe)).setOrigin(0.5, 1).setScale(1 / K);
    const px = FLOOR.w / 2 - 26;
    const pole = this.add.rectangle(px, -14, 3, 62, 0xdfe6ee).setOrigin(0.5, 1);
    const knob = this.add.circle(px, -77, 3.5, GOLD);
    const flag = this.add.image(px + 1, -74, flagKey(this, tribe)).setOrigin(0, 0).setScale(0.5);
    c.add([pole, knob, flag, roof]);
    this.tweens.add({ targets: flag, scaleX: 0.44, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: flag, angle: 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    tw.roof = { c, roof, flag, tribe };
  }
  placeRoof(tw) {
    const top = tw.floors[tw.floors.length - 1];
    const r = tw.roof;
    if (!r) return;
    if (!top) { r.c.setVisible(false); return; }
    const p = top.world(0, -FLOOR.h / 2);
    r.c.setVisible(true).setPosition(p.x, p.y).setRotation(top.angle);
    // one tower, two tribes: the flag of whoever built the top floor
    if (r.tribe !== top.tribe) {
      r.tribe = top.tribe;
      r.roof.setTexture(roofKey(this, top.tribe));
      r.flag.setTexture(flagKey(this, top.tribe));
    }
  }

  // ------------------------------------------------------------------------------------------- towers
  towerOf(who) { return this.idea === 3 ? this.towers.shared : this.towers[who]; }
  targetTower(who) { return this.idea === 3 ? this.towers.shared : this.towers[other(who)]; }
  towerOfFloor(fl) { return Object.values(this.towers).find((tw) => tw.floors.includes(fl)) || null; }
  topY(tw) { return this.baseTop - tw.floors.length * FLOOR.h; }
  floorY(i) { return this.baseTop - (i + 0.5) * FLOOR.h; }
  layoutTower(tw) {
    tw.floors.forEach((f, i) => f.setPose(tw.x + f.ox, this.floorY(i) + f.dy, f.angle));
    this.placeRoof(tw);
  }
  addFloor(tw, owner, ox = 0) {
    const idx = tw.floors.filter((f) => f.owner === owner).length;
    const f = new LFloor(this, { tribe: this.sides[owner].tribe, owner, idx, x: tw.x + ox, y: this.topY(tw) - FLOOR.h / 2 });
    f.ox = ox;
    tw.floors.push(f);
    this.layoutTower(tw);
    f.paint();
    return f;
  }
  buildStanding() {
    for (const who of ['me', 'ai']) {
      const tw = this.towers[who];
      let x = 0;
      for (let i = 0; i < RULES[1].floors; i++) {
        x = clamp(x + (this.rnd() - 0.5) * 8, -7, 7);
        this.addFloor(tw, who, i ? Math.round(x) : 0);
      }
    }
    this.hideRandom('ai', RULES[1].people);
  }
  buildStart() {
    for (const who of ['me', 'ai']) {
      const tw = this.towers[who];
      for (let i = 0; i < RULES[2].start; i++) this.addFloor(tw, who, i ? Math.round((this.rnd() - 0.5) * 10) : 0);
    }
    this.hideRandom('ai', RULES[2].placed);
  }
  roomsOf(who, { free = false, tw = null } = {}) {
    const out = [];
    for (const t of tw ? [tw] : Object.values(this.towers)) {
      for (const f of t.floors) {
        if (f.owner !== who || f.destroyed) continue;
        for (const r of f.rooms) if (r.usable && (!free || !r.res)) out.push(r);
      }
    }
    return out;
  }
  /** The robot puts `n` of its reserve in its rooms: spread over floors and columns, now and then two on one floor. */
  hideRandom(who, n = 99) {
    for (const p of this.sides[who].people) {
      if (n <= 0) break;
      if (p.state !== 'reserve') continue;
      const open = this.roomsOf(who, { free: true });
      if (!open.length) break;
      const lonely = open.filter((r) => !r.floor.people().length);
      const from = lonely.length && this.rnd() < 0.75 ? lonely : open;
      this.moveIn(p, from[Math.floor(this.rnd() * from.length)]);
      n -= 1;
    }
  }
  repaintAll() {
    for (const tw of Object.values(this.towers)) for (const f of tw.floors) f.paint();
    if (this.hanging) this.hanging.floor.paint();
  }

  // ------------------------------------------------------------------------------------------- people
  moveIn(p, room, { anim = false } = {}) {
    if (!p || !room || room.res || !room.usable) return false;
    room.res = p;
    p.room = room;
    p.state = 'home';
    if (anim && room.seen) this.lightsOn(room);
    room.paint();
    return true;
  }
  moveOut(p) {
    const r = p.room;
    if (r) {
      r.res = null;
      r.paint();
    }
    p.room = null;
  }
  /** Someone moves in: the lamp comes on and they step up to the window. */
  lightsOn(room) {
    room.fading = true;
    room.dark.setVisible(true).setAlpha(DARK);
    this.tweens.add({ targets: room.dark, alpha: 0, duration: 260, onComplete: () => { room.fading = false; room.paint(); } });
    room.bust.setAlpha(0);
    this.tweens.add({ targets: room.bust, alpha: 1, duration: 220 });
    const w = room.world;
    this.effects.sparkle(w.x, w.y, 6);
  }
  home(who) { return this.sides[who].people.filter((p) => p.state === 'home').length; }
  reserve(who) { return this.sides[who].people.filter((p) => p.state === 'reserve').length; }
  cost(who) { return RULES[this.idea].cost[this.sides[who].tribe]; }
  person(id) { return this.sides.me.people.find((p) => p.id === id) || this.sides.ai.people.find((p) => p.id === id) || null; }
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
    if (this.camMode === 'crane') {
      // the tower's top stays a drop below the crane; at the start the sea sits low on the screen
      this.cam.scrollY += (this.craneScrollY() - this.cam.scrollY) * Math.min(1, dtMs / 250);
      this.cam.scrollX += (this.craneScrollX() - this.cam.scrollX) * Math.min(1, dtMs / 250);
    }
    if (this.crane) {
      const hold = this.holdCrane;
      this.crane.update(dtMs * this.speed, {
        omega: hold ? 0 : CRANE.omega0 * (1 + (this.sides[this.active || 'me']?.drops || 0) * 0.03),
        amplitude: hold ? 0 : this.idea === 3 ? 150 : 110,
      });
      if (this.hanging && this.crane.hasBlock() && !this.loading) {
        const p = this.crane.getBlockPose();
        this.hanging.floor.setPose(p.x + this.cam.scrollX, p.y + this.cam.scrollY, p.angle);
      }
    }
    if (this.falling) this.stepFalling(Math.min(0.05, dtMs / 1000) * this.speed);
    if (this.rings.length) for (const g of this.rings) this.placeRing(g);
    if (this.sight?.visible && this.as?.room) {
      const w = this.as.room.world;
      this.sight.setPosition(w.x, w.y);
    }
  }

  // ------------------------------------------------------------------------------------------- the camera
  /** The part of the screen (game pixels) the world shows in: between the player cards and the tray. */
  viewRect() {
    const W = this.scale.width;
    const H = this.scale.height;
    let top = 250;
    let bottom = H - 250;
    const r = this.ui?.playRect?.();
    const cv = this.game.canvas?.getBoundingClientRect?.();
    if (r && cv && cv.height > 0) {
      const k = H / cv.height;
      top = (r.top - cv.top) * k;
      bottom = (r.bottom - cv.top) * k;
    }
    top = clamp(top, 0, H * 0.45);
    bottom = clamp(bottom, H * 0.5, H);
    return { x0: 12, x1: W - 12, y0: top + 10, y1: bottom - 10 };
  }
  boundsOf(target) {
    if (target && Number.isFinite(target.x0)) return target;
    const list = target === 'all' ? Object.values(this.towers) : [target];
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    for (const tw of list) {
      const xs = [tw.x, ...tw.floors.map((f) => f.x)];
      x0 = Math.min(x0, Math.min(...xs) - FLOOR.w / 2 - 20);
      x1 = Math.max(x1, Math.max(...xs) + FLOOR.w / 2 + 20);
      y0 = Math.min(y0, this.topY(tw) - (tw.floors.length ? 86 : 30));
    }
    return { x0, x1, y0, y1: this.baseTop + PLINTH + 14 };
  }
  /**
   * Move the camera so `target` ('all' or a tower) fills the view between the cards and the tray, as close as it fits (at
   * most `max`, at least `min`: a tall tower then shows its top part, and a drag or the mouse wheel moves up and down).
   */
  frame(target, { ms = 600, max = 2, min = 0.9, ease = 'Sine.easeInOut', focus = 'top' } = {}) {
    if (!this.cam) return Promise.resolve();
    const b = this.boundsOf(target);
    const v = this.viewRect();
    const W = this.scale.width;
    const H = this.scale.height;
    const zw = (v.x1 - v.x0) / (b.x1 - b.x0);
    const zh = (v.y1 - v.y0) / (b.y1 - b.y0);
    const z = clamp(Math.min(zw, zh), Math.min(min, zw), max);
    const cx = (b.x0 + b.x1) / 2;
    const viewH = (v.y1 - v.y0) / z;
    // too tall to fit: show the top (or the bottom), the rest a drag away
    let cy = (b.y0 + b.y1) / 2;
    this.panBounds = null;
    if (viewH < b.y1 - b.y0) {
      cy = focus === 'bottom' ? b.y1 - viewH / 2 : b.y0 + viewH / 2;
      this.panBounds = { lo: b.y0 + viewH / 2, hi: b.y1 - viewH / 2, v };
    }
    const scx = (v.x0 + v.x1) / 2;
    const scy = (v.y0 + v.y1) / 2;
    const sx = cx - W / 2 - (scx - W / 2) / z;
    const sy = cy - H / 2 - (scy - H / 2) / z;
    this.camMode = 'frame';
    this.crane?.setVisible(false);
    if (this.camTween) this.camTween.stop();
    this.camTween = null;
    if (ms > 0) this.hushWords();
    if (ms <= 0 || !this.alive) {
      this.cam.setZoom(z).setScroll(sx, sy);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.camTween = this.tweens.add({ targets: this.cam, zoom: z, scrollX: sx, scrollY: sy, duration: ms / this.speed, ease, onComplete: () => { this.camTween = null; resolve(); } });
    });
  }
  /** Start a session (its tray drawn first, so the camera knows the room it has), frame `target`, then wait for the session. */
  async framed(target, opts, session) {
    await this.frame(target, opts);
    if (opts.coach) this.coachSoon();
    return session;
  }
  /** The first time: if nobody is placed after a moment, a hand shows the drag from a card to a room. */
  coachSoon() {
    const ps = this.ps;
    if (!ps || this.bot || this.coached) return;
    this.time.delayedCall(1300, () => {
      if (this.ps !== ps || ps.drag || ps.sel || this.coached) return;
      const p = ps.pool().find((q) => q.state !== 'home');
      const rooms = p ? this.validRooms(p).filter((r) => !r.res) : [];
      if (!rooms.length) return;
      this.coached = true;
      const w = rooms[Math.floor(rooms.length / 2)].world;
      this.ui?.coach?.(this.worldToClient(w.x, w.y));
    });
  }
  craneScrollY() {
    const tw = this.hanging ? this.towerOf(this.hanging.who) : null;
    const top = tw ? this.topY(tw) : Math.min(...Object.values(this.towers).map((t) => this.topY(t)));
    return Math.min(-(this.H - 360), top - 690);
  }
  /** In the crane's view the tower being built stands in the middle of the screen (its top floor's middle). */
  craneScrollX(who = this.hanging?.who) {
    const tw = who ? this.towerOf(who) : null;
    if (!tw) return 0;
    const top = tw.floors[tw.floors.length - 1];
    return tw.x + (top ? top.ox : 0) - this.scale.width / 2;
  }
  /** Back to the crane's view: no zoom, the crane over the tower. */
  craneView(ms = 500) {
    if (this.camTween) this.camTween.stop();
    this.panBounds = null;
    this.camMode = 'crane-in';
    return new Promise((resolve) => {
      this.camTween = this.tweens.add({
        targets: this.cam, zoom: 1, scrollX: this.craneScrollX(), scrollY: this.craneScrollY(), duration: ms / this.speed, ease: 'Sine.easeInOut',
        onComplete: () => { this.camTween = null; this.camMode = 'crane'; this.crane?.setVisible(true); resolve(); },
      });
    });
  }
  canPan() { return !!this.panBounds && this.camMode === 'frame' && !this.camTween; }
  panTo(sy) {
    const pb = this.panBounds;
    if (!pb) return;
    const H = this.scale.height;
    const z = this.cam.zoom;
    const scy = (pb.v.y0 + pb.v.y1) / 2;
    // the world y at the view's middle stays between the bounds
    const mid = sy + H / 2 + (scy - H / 2) / z;
    const c = clamp(mid, pb.lo, pb.hi);
    this.cam.setScroll(this.cam.scrollX, c - H / 2 - (scy - H / 2) / z);
  }
  onWheel(dy) {
    if (this.canPan()) this.panTo(this.cam.scrollY + (dy * 0.6) / this.cam.zoom);
  }
  /** Client (page) coordinates to the world, or null off the canvas. */
  clientToWorld(cx, cy) {
    const cv = this.game.canvas.getBoundingClientRect();
    const gx = ((cx - cv.left) * this.scale.width) / cv.width;
    const gy = ((cy - cv.top) * this.scale.height) / cv.height;
    if (gx < 0 || gy < 0 || gx > this.scale.width || gy > this.scale.height) return null;
    const p = this.cam.getWorldPoint(gx, gy);
    return { x: p.x, y: p.y, gy };
  }
  worldToClient(wx, wy) {
    const cv = this.game.canvas.getBoundingClientRect();
    const W = this.scale.width;
    const H = this.scale.height;
    const z = this.cam.zoom;
    const gx = W / 2 + z * (wx - this.cam.scrollX - W / 2);
    const gy = H / 2 + z * (wy - this.cam.scrollY - H / 2);
    return { x: cv.left + (gx * cv.width) / W, y: cv.top + (gy * cv.height) / H };
  }

  // ------------------------------------------------------------------------------------------- rooms under a finger
  allRooms() {
    const out = [];
    for (const tw of Object.values(this.towers)) for (const f of tw.floors) if (!f.destroyed) out.push(...f.rooms);
    if (this.hanging) out.push(...this.hanging.floor.rooms);
    return out;
  }
  /** The room nearest world (x, y) that `ok` takes, within `max` (screen units: it reaches further as the camera pulls back). */
  nearestRoom(x, y, ok = () => true, max = 64) {
    let best = null;
    let bd = max / Math.max(0.5, this.cam.zoom);
    for (const r of this.allRooms()) {
      if (!ok(r)) continue;
      const l = r.floor.local(x, y);
      const dx = Math.max(0, Math.abs(l.x - r.lx) - ROOM.w / 2);
      const dy = Math.max(0, Math.abs(l.y - r.ly) - ROOM.h / 2);
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }
  roomAt(x, y) {
    for (const r of this.allRooms()) {
      const l = r.floor.local(x, y);
      if (Math.abs(l.x - r.lx) <= ROOM.w / 2 + 6 && Math.abs(l.y - r.ly) <= ROOM.h / 2 + 8) return r;
    }
    return null;
  }

  // ------------------------------------------------------------------------------------------- glows over rooms
  ring(room, color, { fill = 0, alpha = 0.9, pulse = false } = {}) {
    const g = { room };
    g.ring = this.add.image(0, 0, ringKey(this)).setScale(1 / K).setTint(color).setAlpha(alpha).setDepth(DEPTH.tower + 0.7);
    if (fill) g.fill = this.add.image(0, 0, glowKey(this)).setScale(1 / K).setTint(color).setAlpha(fill).setDepth(DEPTH.tower + 0.65);
    if (pulse) g.tw = this.tweens.add({ targets: [g.ring, g.fill].filter(Boolean), alpha: alpha * 0.35, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.placeRing(g);
    this.rings.push(g);
    return g;
  }
  placeRing(g) {
    const w = g.room.world;
    const a = g.room.floor.c.rotation;
    g.ring.setPosition(w.x, w.y).setRotation(a);
    if (g.fill) g.fill.setPosition(w.x, w.y).setRotation(a);
  }
  clearRings() {
    for (const g of this.rings) {
      if (g.tw) g.tw.stop();
      g.ring.destroy();
      if (g.fill) g.fill.destroy();
    }
    this.rings = [];
  }
  /** Gold rings on every room the person being placed may go to; the one under the finger lit. */
  showTargets(rooms, hot = null) {
    this.clearRings();
    for (const r of rooms) this.ring(r, GOLD, r === hot ? { fill: 0.45, alpha: 1 } : { alpha: 0.75, pulse: true });
  }

  // ------------------------------------------------------------------------------------------- input
  onDown(p) {
    if (this.over || !this.alive) return;
    if (this.mode === 'drop') { this.dropTap?.(); return; }
    this.press = { x: p.x, y: p.y, w: { x: p.worldX, y: p.worldY }, moved: false };
    if (this.mode === 'people' && this.ps) {
      const r = this.roomAt(p.worldX, p.worldY);
      this.press.room = r;
      if (r && r.res && r.res.owner === 'me' && this.ps.canLift(r.res)) this.press.p = r.res;
    } else if (this.mode === 'aim') this.aimAt(p.worldX, p.worldY);
  }
  onMove(p) {
    const pr = this.press;
    if (!pr || !p.isDown) {
      if (this.mode === 'aim' && !p.wasTouch) this.aimAt(p.worldX, p.worldY, { hover: true });
      return;
    }
    if (!pr.moved && Math.hypot(p.x - pr.x, p.y - pr.y) > 9) {
      pr.moved = true;
      if (this.mode === 'people' && pr.p) this.liftStart(pr.p, pr.room, p.worldX, p.worldY);
      else if (this.canPan() && this.mode !== 'aim') pr.pan = { sy: this.cam.scrollY };
    }
    if (!pr.moved) return;
    if (this.ps?.drag && !this.ps.drag.dom) this.liftMove(p.worldX, p.worldY);
    else if (pr.pan) this.panTo(pr.pan.sy - (p.y - pr.y) / this.cam.zoom);
    else if (this.mode === 'aim') this.aimAt(p.worldX, p.worldY);
  }
  onUp(p, outside = false) {
    const pr = this.press;
    this.press = null;
    if (!pr) return;
    if (this.ps?.drag && !this.ps.drag.dom) {
      this.liftDrop(p.worldX, p.worldY, outside || p.y > this.viewRect().y1 + 10);
      return;
    }
    if (pr.moved) return;
    if (this.mode === 'people' && this.ps) this.peopleTap(pr);
  }

  // ------------------------------------------------------------------------------------------- putting people in rooms
  /**
   * The player puts people in rooms. `o`: title, sub, pool() (the people on the cards), canPlace(p, room), canLift(p) (a
   * person at home that may be dragged to another room), swap (dropping on one of yours swaps the two), returnable
   * (dragging back to the cards takes them out), buttons(), after(change). Resolves when endPeople() is called.
   */
  peopleSession(o) {
    if (!this.alive) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.ps = { ...o, sel: null, drag: null, hot: null, resolve };
      this.mode = 'people';
      this.cancelTap = () => this.endPeople(null);
      this.refreshPeople();
    });
  }
  endPeople(v) {
    const ps = this.ps;
    if (!ps) return;
    if (ps.drag) this.dragCancel();
    this.ps = null;
    this.mode = null;
    this.cancelTap = null;
    this.clearRings();
    ps.resolve(v);
  }
  validRooms(p) {
    if (!this.ps) return [];
    return this.allRooms().filter((r) => this.ps.canPlace(p, r) && r.res !== p);
  }
  refreshPeople() {
    const ps = this.ps;
    if (!ps) return;
    const sel = ps.sel;
    const drag = ps.drag;
    if (drag) this.showTargets(this.validRooms(drag.p), ps.hot);
    else if (sel) this.showTargets(this.validRooms(sel));
    else this.clearRings();
    this.ui?.tray?.({
      title: ps.title,
      sub: typeof ps.sub === 'function' ? ps.sub() : ps.sub,
      people: ps.pool().map((p) => ({ id: p.id, who: p.who, name: p.name, placed: p.state === 'home', lost: p.state === 'lost', sel: sel === p || drag?.p === p })),
      buttons: ps.buttons ? ps.buttons() : [],
      onTap: (id) => this.cardTap(id),
      drag: {
        start: (id) => this.cardDragStart(id),
        move: (id, x, y) => this.cardDragMove(id, x, y),
        drop: (id, x, y) => this.cardDragDrop(id, x, y),
        cancel: () => this.dragCancel(),
      },
    });
  }
  /** Put person `p` in `room` (from the cards or another room); swaps when allowed. */
  place(p, room) {
    const ps = this.ps;
    if (!ps || !room || !ps.canPlace(p, room)) return false;
    const from = p.room;
    if (room.res && room.res !== p) {
      if (!ps.swap || !from) return false;
      const q = room.res;
      this.moveOut(q);
      this.moveOut(p);
      this.moveIn(p, room, { anim: true });
      this.moveIn(q, from, { anim: true });
    } else {
      if (from) this.moveOut(p);
      this.moveIn(p, room, { anim: true });
    }
    ps.sel = null;
    this.sfx('click');
    haptics.tap();
    this.hud();
    ps.after?.({ p, from, to: room });
    if (this.ps === ps) this.refreshPeople();
    return true;
  }
  cardTap(id) {
    const ps = this.ps;
    const p = this.person(id);
    if (!ps || !p || p.state === 'lost') return;
    // a card of someone already home: tapping it again takes them back out of the room (when that is allowed)
    if (ps.sel === p && p.state === 'home' && ps.returnable) {
      this.moveOut(p);
      p.state = 'reserve';
      ps.sel = null;
      this.hud();
      this.refreshPeople();
      return;
    }
    if (p.state === 'home' && !ps.canLift(p)) return;
    ps.sel = ps.sel === p ? null : p;
    this.sfx('click');
    this.refreshPeople();
  }
  peopleTap(pr) {
    const ps = this.ps;
    if (pr.p) {
      ps.sel = ps.sel === pr.p ? null : pr.p;
      this.sfx('click');
      this.refreshPeople();
      return;
    }
    const r = pr.room || (ps.sel ? this.nearestRoom(pr.w.x, pr.w.y, (x) => ps.canPlace(ps.sel, x), 30) : null);
    if (r && ps.sel && this.place(ps.sel, r)) return;
    if (r && !ps.sel) this.ui?.nudge?.();   // the cards wiggle: choose someone first
  }
  // dragging one of your people out of a room (on the canvas)
  liftStart(p, room, x, y) {
    const ps = this.ps;
    ps.drag = { p, from: room, dom: false };
    ps.sel = null;
    room.lifting = true;
    room.paint();
    const key = badgeKey(this, p.who);
    const z = this.cam.zoom;
    ps.drag.img = key ? this.add.image(x, y - 34 / z, key).setDepth(DEPTH.fxWorld + 5).setScale(1.15 / z) : null;
    this.sfx('click');
    haptics.tap();
    this.refreshPeople();
  }
  liftMove(x, y) {
    const ps = this.ps;
    const d = ps?.drag;
    if (!d) return;
    const z = this.cam.zoom;
    d.img?.setPosition(x, y - 34 / z);
    const hot = this.nearestRoom(x, y - 20 / z, (r) => ps.canPlace(d.p, r) && r !== d.from, 46);
    if (hot !== ps.hot) {
      ps.hot = hot;
      this.showTargets(this.validRooms(d.p), hot);
    }
  }
  liftDrop(x, y, toCards) {
    const ps = this.ps;
    const d = ps?.drag;
    if (!d) return;
    ps.drag = null;
    ps.hot = null;
    d.from.lifting = false;
    const z = this.cam.zoom;
    const r = this.nearestRoom(x, y - 20 / z, (room) => ps.canPlace(d.p, room) && room !== d.from, 46);
    const img = d.img;
    if (r) {
      const w = r.world;
      if (img) this.tweens.add({ targets: img, x: w.x, y: w.y, scale: 0.5 / z, alpha: 0, duration: 160, onComplete: () => img.destroy() });
      if (!this.place(d.p, r)) { d.from.paint(); this.refreshPeople(); }
      return;
    }
    if (toCards && ps.returnable) {
      this.moveOut(d.p);
      d.p.state = 'reserve';
      if (img) this.tweens.add({ targets: img, alpha: 0, scale: 0.4 / z, duration: 180, onComplete: () => img.destroy() });
      this.hud();
      this.refreshPeople();
      return;
    }
    // nowhere to go: back to the room they came from
    const w = d.from.world;
    if (img) this.tweens.add({ targets: img, x: w.x, y: w.y, scale: 0.6 / z, alpha: 0, duration: 200, onComplete: () => img.destroy() });
    d.from.paint();
    this.refreshPeople();
  }
  // dragging a card from the tray (the tray draws the card under the finger; the world lights the rooms)
  cardDragStart(id) {
    const ps = this.ps;
    const p = this.person(id);
    if (!ps || !p || p.state === 'lost' || (p.state === 'home' && !ps.canLift(p))) return false;
    ps.drag = { p, from: p.room, dom: true };
    ps.sel = null;
    if (p.room) { p.room.lifting = true; p.room.paint(); }
    this.refreshPeople();
    return true;
  }
  cardDragMove(id, cx, cy) {
    const ps = this.ps;
    const d = ps?.drag;
    if (!d) return false;
    const w = this.clientToWorld(cx, cy);
    const hot = w && w.gy < this.viewRect().y1 + 6 ? this.nearestRoom(w.x, w.y, (r) => ps.canPlace(d.p, r) && r !== d.from, 46) : null;
    if (hot !== ps.hot) {
      ps.hot = hot;
      this.showTargets(this.validRooms(d.p), hot);
    }
    return !!hot;
  }
  cardDragDrop(id, cx, cy) {
    const ps = this.ps;
    const d = ps?.drag;
    if (!d) return { ok: false };
    ps.drag = null;
    ps.hot = null;
    if (d.from) d.from.lifting = false;
    const w = this.clientToWorld(cx, cy);
    const r = w && w.gy < this.viewRect().y1 + 6 ? this.nearestRoom(w.x, w.y, (room) => ps.canPlace(d.p, room) && room !== d.from, 46) : null;
    if (r && this.place(d.p, r)) {
      const c = r.world;
      return { ok: true, ...this.worldToClient(c.x, c.y) };
    }
    if (d.from) d.from.paint();
    this.refreshPeople();
    return { ok: false };
  }
  dragCancel() {
    const ps = this.ps;
    const d = ps?.drag;
    if (!d) return;
    ps.drag = null;
    ps.hot = null;
    if (d.from) { d.from.lifting = false; d.from.paint(); }
    d.img?.destroy();
    this.refreshPeople();
  }

  // ------------------------------------------------------------------------------------------- aiming
  /**
   * The player aims: `o.kinds` the attacks on offer ('throw' and/or 'mission'), `o.tower` the tower aimed at, `o.skip` a
   * "not now" button. A tap (or the mouse) on a room puts the sight on it and lights every room the attack reaches; the
   * tray's button lets it go. Resolves { kind, room }, or null.
   */
  aimSession(o) {
    if (!this.alive) return Promise.resolve(null);
    return new Promise((resolve) => {
      const ready = this.sides.me.charge >= this.cost('me') && this.home('me') > 0;
      this.as = { ...o, kind: o.kinds.includes('throw') ? 'throw' : 'mission', room: null, resolve, ready };
      this.mode = 'aim';
      this.step = 'aim';
      this.cancelTap = () => this.endAim(null);
      if (!this.sight) {
        this.sight = this.add.image(0, 0, sightKey(this)).setDepth(DEPTH.fxWorld + 2).setVisible(false);
        this.tweens.add({ targets: this.sight, angle: 360, duration: 4000, repeat: -1 });
      }
      this.refreshAim();
    });
  }
  endAim(v) {
    const as = this.as;
    if (!as) return;
    this.as = null;
    this.mode = null;
    this.cancelTap = null;
    this.clearRings();
    this.sight?.setVisible(false);
    as.resolve(v);
  }
  aimable(room) {
    const as = this.as;
    if (!as || !room.floor || room.floor.destroyed || this.hanging?.floor === room.floor) return false;
    if (this.towerOfFloor(room.floor) !== as.tower) return false;
    if (this.idea !== 3 && room.floor.owner === 'me') return false;
    return as.kind === 'mission' || !room.burnt;
  }
  aimAt(x, y, { hover = false } = {}) {
    const as = this.as;
    if (!as) return;
    const r = this.nearestRoom(x, y, (room) => this.aimable(room), hover ? 8 : 40);
    if (!r || r === as.room) return;
    as.room = r;
    if (!hover) haptics.tap();
    this.refreshAim();
  }
  refreshAim() {
    const as = this.as;
    if (!as) return;
    const s = this.sides.me;
    const M = MISSION[s.tribe];
    this.clearRings();
    if (as.room) {
      const strong = BEATS[s.tribe] === this.sides.ai.tribe;
      const reach = as.kind === 'throw' ? [as.room] : this.patternOf(s.tribe, as.room, strong);
      // your own rooms in its reach (one tower, two tribes) pulse orange: a warning
      for (const r of reach) {
        const own = r.floor.owner === 'me';
        this.ring(r, own ? 0xffa21a : RED, { fill: r === as.room ? 0.42 : own ? 0.4 : 0.3, alpha: 1, pulse: own });
      }
      const w = as.room.world;
      this.sight.setPosition(w.x, w.y).setScale(0.75 / Math.max(0.7, this.cam.zoom)).setVisible(true);
    } else this.sight?.setVisible(false);
    const foe = this.sides.ai.name;
    const weapons = [];
    if (as.kinds.includes('throw')) weapons.push({ id: 'throw', icon: '🏉', name: 'Gooi', sub: '1 kamer', ready: true, sel: as.kind === 'throw', shape: 'one' });
    if (as.kinds.includes('mission')) {
      weapons.push({ id: 'mission', icon: M.icon, name: M.name, sub: M.what, ready: as.ready, sel: as.kind === 'mission', charge: Math.min(s.charge, this.cost('me')), cost: this.cost('me'), shape: M.shape });
    }
    const label = as.kind === 'throw' ? 'Gooi' : M.name;
    const buttons = [];
    if (as.skip) buttons.push({ label: 'Nie nou nie', cls: 'alt', fn: () => this.endAim(null) });
    buttons.push({ label: `${label} ›`, cls: 'red', disabled: !as.room || (as.kind === 'mission' && !as.ready), fn: () => this.endAim({ kind: as.kind, room: as.room }) });
    this.ui?.tray?.({
      title: as.room ? (as.kind === 'throw' ? 'Gooi hierheen?' : `${M.name} hier?`) : as.kind === 'throw' ? `Kies ’n kamer by ${foe}` : `Mik jou ${M.name}`,
      sub: as.kind === 'throw' ? 'Raak: wie daar woon, spring uit · Mis: jy hoor hoeveel langsaan woon' : `${M.what}${this.idea === 3 ? ' · pasop, dit tref joune ook' : ''}`,
      weapons,
      onWeapon: (id) => {
        if (id === 'mission' && !as.ready) { this.ui?.toast?.(`${M.name} laai nog: ${Math.min(s.charge, this.cost('me'))}/${this.cost('me')}`, { ms: 1100 }); return; }
        as.kind = id;
        if (as.room && !this.aimable(as.room)) as.room = null;
        this.sfx('click');
        this.refreshAim();
      },
      buttons,
    });
  }
  /** The rooms an attack of `kind` ('throw' or a tribe's mission) aimed at `room` reaches. */
  patternOf(kind, room, strong = false) {
    const tw = this.towerOfFloor(room.floor);
    if (!tw) return [room];
    const F = tw.floors;
    const f = F.indexOf(room.floor);
    const c = room.col;
    const at = (ff, cc) => (ff >= 0 && ff < F.length && cc >= 0 && cc < COLS ? F[ff].rooms[cc] : null);
    let out = [];
    if (kind === 'throw') out = [room];
    else if (kind === 'vuur') {
      out = [at(f, c), at(f, c - 1), at(f, c + 1), at(f + 1, c), at(f - 1, c)];
      if (strong) out.push(at(f + 1, c - 1), at(f + 1, c + 1));
    } else if (kind === 'water') {
      const rows = [f, f > 0 ? f - 1 : f + 1];
      for (const ff of rows) for (let cc = 0; cc < COLS; cc++) out.push(at(ff, cc));
      // against Vuur the wave splashes one room up and one down as well
      if (strong) out.push(at(Math.max(...rows) + 1, c), at(Math.min(...rows) - 1, c));
    } else {
      // a column of four (against Water the vines grab two more anywhere: see grassMission)
      const n = 4;
      let lo = f - (n - 1);
      let hi = f;
      if (lo < 0) { hi = Math.min(F.length - 1, hi - lo); lo = 0; }
      for (let ff = lo; ff <= hi; ff++) out.push(at(ff, c));
    }
    return [...new Set(out.filter(Boolean))];
  }

  // ------------------------------------------------------------------------------------------- the match
  async run() {
    this.round = 1;
    if (this.idea === 1) await this.hidePhase(RULES[1].people);
    if (this.idea === 2) await this.hidePhase(RULES[2].placed);
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
  left(who) { return this.home(who) + (this.idea === 3 ? this.reserve(who) : 0); }
  checkOver() {
    if (this.over) return true;
    for (const who of ['me', 'ai']) {
      // nobody left in your rooms (in idea 3 the ones still to place count too): you lose
      if (this.left(who) === 0) {
        this.finish(other(who), 'almal');
        return true;
      }
    }
    return false;
  }
  finishByCount() {
    const a = this.left('me');
    const b = this.left('ai');
    this.finish(a > b ? 'me' : b > a ? 'ai' : null, 'tel');
  }
  finish(winner, why) {
    if (this.over) return;
    this.over = true;
    this.step = 'over';
    this.endPeople(null);
    this.endAim(null);
    this.mode = null;
    this.hud();
    if (this.crane && this.crane.hasBlock()) this.crane.release();
    if (this.hanging) { this.hanging.floor.destroy(); this.hanging = null; }
    this.ui?.tray?.(null);
    this.sfx(winner === 'me' ? 'record' : winner ? 'gameover' : 'good');
    this.frame('all', { ms: 700 });
    if (winner === 'me' && !this.d.reducedMotion) {
      const tw = this.towers.me || this.towers.shared;
      this.effects.sparkle(tw.x, this.topY(tw) - 40, 40);
    }
    const result = { winner, why, me: this.left('me'), ai: this.left('ai'), idea: this.idea };
    this.time.delayedCall(1500 / this.speed, () => this.d.onEnd?.(result));
  }

  /**
   * A turn that can't freeze the match: an error ends that turn (logged) and the game goes on; a robot's turn that runs
   * past 30 s (game time) is ended too. The crane lets go of a floor it still holds, nothing waits for a tap.
   */
  async safeTurn(who) {
    const robot = who === 'ai' || this.bot;
    let timer = null;
    try {
      const guard = robot ? new Promise((_, reject) => { timer = this.time.delayedCall(30000 / this.speed, () => reject(new Error(`turn ${who} ran too long at ${this.step}`))); }) : null;
      await (guard ? Promise.race([this.turn(who), guard]) : this.turn(who));
    } catch (e) {
      console.error('[lewende]', e);
      this.endPeople(null);
      this.endAim(null);
      this.mode = null;
      this.dropTap = null;
      this.holdCrane = false;
      if (this.crane && this.crane.hasBlock()) this.crane.release();
      if (this.hanging) {
        for (const p of this.hanging.floor.people()) { this.moveOut(p); p.state = 'reserve'; }
        this.hanging.floor.destroy();
        this.hanging = null;
      }
      if (this.falling) { this.falling.f.destroy(); this.falling = null; }
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
    else if (!isBot && this.round > 1) this.ui?.toast?.('Jou beurt', { ms: 900 });
    if (isBot) {
      this.ui?.tray?.({ title: `${this.sides[who].name} ${this.idea === 1 ? 'mik' : 'bou'}…`, busy: true });
      if (this.idea === 1) await this.frame('all', { ms: 500 });
    }
    if (this.idea === 1) {
      if (isBot) await this.botAct1(who);
      else await this.meAct1();
      if (!this.alive || this.checkOver()) return;
      if (isBot) await this.botMove(who, this.moves(who));
      else await this.meMove(this.moves(who));
    } else {
      const d = isBot ? await this.botDrop(who) : await this.meDrop();
      if (!this.alive || this.checkOver()) return;
      if (this.idea === 2 && d && d.perfect && this.reserve(who) > 0) {
        if (isBot) this.botPlace(who, 2);
        else await this.mePlace(2);
      }
      if (this.sides[who].charge >= this.cost(who) && this.home(who) > 0 && this.left(other(who)) > 0) {
        if (isBot) {
          const a = this.botAim(who, 'mission');
          if (a.b && (this.sides[who].tribe === 'gras' || a.score > (this.idea === 3 ? 0.5 : 0.25))) {
            if (this.idea !== 3) await this.frame('all', { ms: 450 });
            await this.mission(who, a.b);
          }
        } else await this.meMission();
      }
      if (!this.alive || this.checkOver()) return;
      if (this.moves(who)) {
        if (isBot) await this.botMove(who, this.moves(who));
        else await this.meMove(this.moves(who));
      }
    }
    // what the vines showed fades after two turns
    for (const r of this.allRooms()) {
      if (r.floor.owner === other(who) && r.know === 'lit' && --r.litT <= 0) { r.know = r.res ? 'unknown' : 'empty'; r.paint(); }
    }
    this.hud();
    this.checkOver();
  }
  /** How many of your people you may move after your turn: idea 1 one (Water two); in the others Water one. */
  moves(who) {
    const water = this.sides[who].tribe === 'water';
    return this.idea === 1 ? (water ? 2 : 1) : water ? 1 : 0;
  }

  // ------------------------------------------------------------------------------------------- the player's turns
  async hidePhase(n) {
    this.active = 'me';
    this.step = 'hide';
    this.hud();
    if (this.bot) { this.hideRandom('me', n); return; }
    const tw = this.towerOf('me');
    const people = this.sides.me.people.slice(0, n);
    const foe = this.sides.ai.name;
    await this.framed(tw, { ms: 700, coach: true }, this.peopleSession({
      title: 'Versteek jou mense',
      sub: () => {
        const left = people.filter((p) => p.state !== 'home').length;
        return left ? `Sleep elkeen na die kamer wat jy kies (nog ${left}). ${foe} sien net toe blindings.` : 'Almal is binne. Sleep gerus om te skuif, of begin.';
      },
      pool: () => people,
      canPlace: (p, r) => r.floor.owner === 'me' && r.usable && this.towerOfFloor(r.floor) === tw && (!r.res || r.res.owner === 'me'),
      canLift: (p) => people.includes(p),
      swap: true,
      returnable: true,
      buttons: () => [
        { label: '🎲 Skommel', cls: 'alt', fn: () => this.shuffle(people) },
        { label: 'Begin ›', cls: 'grn', disabled: people.some((p) => p.state !== 'home'), fn: () => this.endPeople(true) },
      ],
    }));
    // nobody stays out of the tower
    for (const p of people) if (p.state === 'reserve') this.hideRandom('me', 1);
    this.hud();
    if (this.alive) this.ui?.toast?.('Begin!', { big: true, ms: 900 });
  }
  shuffle(people) {
    const tw = this.towerOf('me');
    for (const p of people) if (p.state === 'home') { this.moveOut(p); p.state = 'reserve'; }
    for (const p of people) {
      const open = this.roomsOf('me', { free: true, tw });
      const lonely = open.filter((r) => !r.floor.people().length);
      const pool = lonely.length ? lonely : open;
      if (!pool.length) break;
      this.moveIn(p, pool[Math.floor(this.rnd() * pool.length)], { anim: true });
    }
    this.sfx('click');
    this.hud();
    this.refreshPeople();
  }
  async meAct1() {
    const tw = this.towers.ai;
    const c = await this.framed(tw, { ms: 650 }, this.aimSession({ kinds: ['throw', 'mission'], tower: tw }));
    if (!c || !this.alive) return;
    if (c.kind === 'throw') {
      await this.throwAt('me', c.room);
      this.sides.me.charge = Math.min(this.cost('me'), this.sides.me.charge + 1);
      this.hud();
    } else await this.mission('me', c.room);
  }
  async meMove(n) {
    if (!n || !this.alive) return;
    const tw = this.towerOf('me');
    const mine = this.sides.me.people.filter((p) => p.state === 'home' && p.room && this.towerOfFloor(p.room.floor) === tw);
    if (!mine.length || !this.roomsOf('me', { free: true, tw }).length) return;
    let left = n;
    this.step = 'move';
    const foe = this.sides.ai.name;
    const seen = mine.filter((p) => p.room?.know === 'lit').length;
    await this.framed(tw, { ms: 600 }, this.peopleSession({
      title: n > 1 ? `Skuif tot ${n} mense` : 'Skuif iemand?',
      sub: () => (seen ? `${foe} het ${seen > 1 ? 'van jou mense' : 'een van jou mense'} gesien (rooi raam): skuif hulle weg!` : `Sleep een van jou mense na ’n leë kamer. ${foe} sien net dat iemand geskuif het.`),
      pool: () => this.sides.me.people.filter((p) => p.state === 'home' && p.room && this.towerOfFloor(p.room.floor) === tw),
      canPlace: (p, r) => r.floor.owner === 'me' && r.usable && !r.res && this.towerOfFloor(r.floor) === tw,
      canLift: () => left > 0,
      swap: false,
      returnable: false,
      after: ({ to }) => {
        this.decoy('me', to);
        left -= 1;
        if (left <= 0) this.time.delayedCall(250, () => this.endPeople(true));
      },
      buttons: () => [{ label: 'Klaar ›', cls: 'grn', fn: () => this.endPeople(true) }],
    }));
  }
  /** The other side sees that someone moved, not where: the room moved into and up to two rooms they knew were empty close again. */
  decoy(who, into) {
    const tw = this.towerOfFloor(into.floor);
    if (!tw) return;
    into.know = 'unknown';
    into.hint = null;
    const known = tw.floors.flatMap((f) => f.rooms).filter((r) => r.floor.owner === who && r.usable && r.know === 'empty' && r !== into);
    for (const r of known.sort(() => this.rnd() - 0.5).slice(0, 2)) { r.know = 'unknown'; r.hint = null; this.rollDown(r); }
    // what a miss heard may be wrong now
    for (const f of tw.floors) for (const r of f.rooms) if (r.floor.owner === who && r.hint != null) { r.stale = true; r.paint(); }
    into.paint();
  }
  /** The blinds come down again (the other side's room they knew was empty: someone may live there now). */
  rollDown(r) {
    r.paint();
    if (r.floor.owner === 'me' || r.burnt) return;
    r.blinds.setVisible(true).setScale(1 / K, 0.02);
    this.tweens.add({ targets: r.blinds, scaleY: 1 / K, duration: 380, ease: 'Bounce.easeOut' });
  }
  async meDrop() {
    const s = this.sides.me;
    this.hangFloor('me');
    const load = this.idea === 3 && this.reserve('me') > 0;
    // (idea 3) the crane holds the new floor still while you load it
    if (load) this.holdCrane = true;
    this.ui?.tray?.({ title: 'Die hyskraan', busy: true });
    await this.craneView();
    if (load) await this.loadRiders();
    if (!this.alive || !this.hanging) return null;
    this.step = 'drop';
    const riders = this.hanging.floor.people().length;
    this.ui?.tray?.({
      title: 'Tik om te laat val',
      sub: this.idea === 3 ? (riders ? `${riders} van jou mense ry saam. Mis jy die toring, spring hulle in die see.` : 'Niemand ry hierdie keer saam nie') : '<b>Perfek</b> = twee nuwe inwoners + missie-krag',
      tap: true,
    });
    await new Promise((resolve) => {
      this.mode = 'drop';
      this.dropTap = () => { this.dropTap = null; this.cancelTap = null; this.mode = null; resolve(); };
      this.cancelTap = this.dropTap;
    });
    s.drops += 1;
    this.ui?.tray?.({ title: '…', busy: true });
    return this.dropHanging();
  }
  /** One tower, two tribes: who rides in your new floor, room by room, while the crane holds it still. */
  async loadRiders() {
    const s = this.sides.me;
    const fl = this.hanging.floor;
    this.holdCrane = true;
    this.step = 'load';
    const must = this.mustCarry('me');
    const riders = () => fl.people().length;
    // close up on the floor on the hook (the crane steps out of the picture; a rope stays)
    this.loading = true;
    const hook = fl.world(0, -FLOOR.h / 2);
    const rope = this.add.graphics().setDepth(DEPTH.tower + 0.45);
    rope.lineStyle(5, 0x2b2f38, 1).lineBetween(hook.x, hook.y - 8, hook.x, hook.y - 1200);
    rope.lineStyle(1.5, 0x9aa3b3, 1).lineBetween(hook.x - 1.2, hook.y - 8, hook.x - 1.2, hook.y - 1200);
    rope.fillStyle(0xd8322a, 1).fillRoundedRect(hook.x - 20, hook.y - 14, 40, 12, 3);
    rope.fillStyle(0xffd23f, 1).fillRect(hook.x - 12, hook.y - 11, 6, 6).fillRect(hook.x + 2, hook.y - 11, 6, 6);
    const session = this.peopleSession({
      title: 'Wie ry saam?',
      sub: () => `Sleep jou mense in die kamers van jou nuwe vloer${must ? ` (minstens ${must})` : ''} · nog ${this.reserve('me')} wag`,
      pool: () => s.people.filter((p) => p.state === 'reserve' || p.room?.floor === fl),
      canPlace: (p, r) => r.floor === fl && (!r.res || r.res.owner === 'me'),
      canLift: (p) => p.room?.floor === fl,
      swap: true,
      returnable: true,
      buttons: () => [{ label: riders() < must ? `Nog ${must - riders()} moet saam` : 'Laat swaai ›', cls: 'grn', disabled: riders() < must, fn: () => this.endPeople(true) }],
    });
    await this.frame({ x0: fl.left - 26, x1: fl.right + 26, y0: fl.top - 70, y1: fl.bottom + 50 }, { ms: 500, max: 2.2 });
    await session;
    rope.destroy();
    this.loading = false;
    if (this.alive) await this.craneView(420);
    // a robot (or a test) that ends the wait: the ones who must ride get in
    for (let k = riders(); k < must; k++) {
      const p = s.people.find((q) => q.state === 'reserve');
      const r = fl.rooms.find((x) => !x.res);
      if (!p || !r) break;
      this.moveIn(p, r);
    }
    this.holdCrane = false;
    this.hud();
  }
  /** How many must ride in this floor so everyone is in by floor `mustBy` (three rooms a floor). */
  mustCarry(who) {
    const left = this.reserve(who);
    const floorsLeft = Math.max(1, RULES[3].mustBy - this.sides[who].drops);
    return clamp(left - (floorsLeft - 1) * COLS, 0, COLS);
  }
  async mePlace(n) {
    const s = this.sides.me;
    const tw = this.towerOf('me');
    const fresh = s.people.filter((p) => p.state === 'reserve').slice(0, n);
    if (!fresh.length || !this.roomsOf('me', { free: true, tw }).length) return;
    this.step = 'place';
    this.ui?.toast?.(`Perfek! ${fresh.length} nuwe inwoner${fresh.length > 1 ? 's' : ''}`, { ms: 1200 });
    const foe = this.sides.ai.name;
    await this.framed(tw, { ms: 650 }, this.peopleSession({
      title: fresh.length > 1 ? `${fresh.length} nuwe inwoners` : '’n Nuwe inwoner',
      sub: () => `Sleep ${fresh.length > 1 ? 'hulle' : 'hom'} na die kamers wat jy kies. Waar sal ${foe} nie soek nie?`,
      pool: () => fresh,
      canPlace: (p, r) => r.floor.owner === 'me' && r.usable && !r.res && this.towerOfFloor(r.floor) === tw,
      canLift: (p) => fresh.includes(p),
      swap: false,
      returnable: true,
      buttons: () => [{ label: 'Klaar ›', cls: 'grn', disabled: fresh.some((p) => p.state !== 'home') && this.roomsOf('me', { free: true, tw }).length > 0, fn: () => this.endPeople(true) }],
    }));
    for (const p of fresh) {
      if (p.state !== 'reserve') continue;
      const r = this.roomsOf('me', { free: true, tw })[0];
      if (r) this.moveIn(p, r);
    }
    this.hud();
  }
  async meMission() {
    const tw = this.targetTower('me');
    const c = await this.framed(tw, { ms: 650 }, this.aimSession({ kinds: ['mission'], tower: tw, skip: true }));
    if (c && this.alive) await this.mission('me', c.room);
  }

  // ------------------------------------------------------------------------------------------- what happens
  launchFrom(who) {
    if (this.idea === 3) return { x: who === 'me' ? -40 : GAME_W + 40, y: this.topY(this.towers.shared) - 120 };
    const tw = this.towers[who];
    return { x: tw.x, y: this.topY(tw) - 70 };
  }
  /** A word over the towers (Raak!, Perfek!, …): the same size on the screen however close the camera is. */
  say(x, y, text, { color = '#ffd23f', size = 40, sub = '' } = {}) {
    const now = this.time.now;
    const z = this.cam.zoom || 1;
    this.said = (this.said || []).filter((w) => now - w.t < 900);
    let yy = y;
    for (let k = 0; k < 5 && this.said.some((w) => Math.abs(w.x - x) < 170 / z && Math.abs(w.y - yy) < 50 / z); k++) yy -= 52 / z;
    this.said.push({ x, y: yy, t: now });
    this.words = this.words || new Set();
    const t = this.add.text(x, yy, sub ? `${text}\n${sub}` : text, {
      fontFamily: FONT, fontSize: `${size}px`, fontStyle: '900', color, align: 'center', stroke: '#141b33', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(DEPTH.fxWorld + 10).setScale(0.4 / z);
    t.setShadow(0, 4, 'rgba(0,0,0,0.5)', 6, true, true);
    if (sub) t.setLineSpacing(-6);
    this.tweens.add({ targets: t, scale: 1 / z, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: yy - 64 / z, duration: 1200, delay: 160, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, duration: 380, delay: 1050, onComplete: () => { this.words.delete(t); t.destroy(); } });
    this.words.add(t);
  }
  /** The words still showing fade at once (the camera is about to move: they would grow with it). */
  hushWords() {
    for (const t of this.words || []) {
      if (!t.active) continue;
      this.tweens.killTweensOf(t);
      this.tweens.add({ targets: t, alpha: 0, duration: 140, onComplete: () => t.destroy() });
    }
    this.words?.clear();
  }
  kick(fl) {
    this.tweens.add({ targets: fl.c, scaleX: 1.025, scaleY: 0.95, duration: 80 / this.speed, yoyo: true });
  }
  /** The people in rooms `rooms` leave: by parachute ('chute'), swimming ('swim') or pulled out by vines ('grab'). */
  evict(rooms, how) {
    let n = 0;
    for (const r of rooms) {
      const p = r.res;
      if (!p) continue;
      const at = r.world;
      this.moveOut(p);
      p.state = 'lost';
      if (r.floor.owner !== 'me' || this.idea === 3) { r.know = 'empty'; r.hint = null; }
      const d = (n * 160) / this.speed;
      if (how === 'swim') swimAway(this, at.x, at.y, p.who, { dir: at.x < GAME_W / 2 ? -1 : 1, seaY: this.seaY, delay: d });
      else parachute(this, at.x + (how === 'grab' ? (r.col === 0 ? -26 : 26) : 0), at.y, p.who, { dir: n % 2 ? 1 : -1, seaY: this.seaY, delay: 140 + d });
      r.paint();
      n += 1;
    }
    if (n) { this.sfx('lost'); haptics.lost(); }
    this.hud();
    return n;
  }
  /** How many of `room`'s owner's people live in the rooms beside, above and below it. */
  neighbours(room) {
    const tw = this.towerOfFloor(room.floor);
    const F = tw.floors;
    const f = F.indexOf(room.floor);
    let n = 0;
    for (const [ff, cc] of [[f, room.col - 1], [f, room.col + 1], [f + 1, room.col], [f - 1, room.col]]) {
      const r = ff >= 0 && ff < F.length && cc >= 0 && cc < COLS ? F[ff].rooms[cc] : null;
      if (r?.res && r.res.owner === room.floor.owner) n += 1;
    }
    return n;
  }
  async throwAt(who, room) {
    this.step = 'throw';
    if (who === 'me' && !this.bot) {
      this.ui?.tray?.({ title: 'Gooi!', busy: true });
      await this.frame('all', { ms: 420 });
    }
    const from = this.launchFrom(who);
    const at = room.world;
    this.sfx('drop');
    await throwBall(this, from.x, from.y, at.x, at.y, { kind: 'rugby', ms: 640 / this.speed, arc: 130 });
    if (!this.alive || room.floor.destroyed) return;
    room.broken = true;
    this.kick(room.floor);
    this.effects.dust(at.x, at.y + ROOM.h / 2, ROOM.w);
    this.effects.shake(0.004, 160);
    this.sfx('land', { intensity: 0.8, size: 0.3 });
    if (room.res) {
      this.evict([room], 'chute');
      this.say(at.x, at.y - 46, 'Raak!', { color: '#ffd23f', size: 46 });
    } else {
      if (room.floor.owner !== who) room.know = 'empty';
      room.hint = this.neighbours(room);
      room.stale = false;
      room.paint();
      const h = room.hint;
      this.say(at.x, at.y - 46, 'Leeg', { color: '#cfe0ff', size: 38, sub: h ? `${h} langsaan` : 'niemand langsaan' });
      if (h) this.sfx('good');
    }
    await this.wait(900);
  }
  async mission(who, aim) {
    const s = this.sides[who];
    const foe = other(who);
    const strong = BEATS[s.tribe] === this.sides[foe].tribe;
    const M = MISSION[s.tribe];
    const rooms = this.patternOf(s.tribe, aim, strong);
    s.charge = 0;
    this.hud();
    this.ui?.tray?.({ title: `${M.icon} ${M.name}!`, busy: true });
    this.ui?.toast?.(`${M.name}!`, { big: true, ms: 1100, sub: strong ? 'Ekstra sterk' : '' });
    if (s.tribe === 'vuur') await this.fireMission(who, aim, rooms);
    else if (s.tribe === 'water') await this.waterMission(who, aim, rooms);
    else await this.grassMission(who, aim, rooms, strong);
    this.hud();
  }
  /** One word over the rooms a mission reached: how many people it sent out. */
  missionWord(rooms, hit) {
    const live = rooms.filter((r) => !r.floor.destroyed);
    if (!live.length) return;
    const ws = live.map((r) => r.world);
    const x = ws.reduce((n, w) => n + w.x, 0) / ws.length;
    const y = Math.min(...ws.map((w) => w.y)) - ROOM.h;
    this.say(x, y, hit > 1 ? `Raak! ${hit} uit` : hit ? 'Raak!' : 'Leeg!', { color: hit ? '#ffd23f' : '#cfe0ff', size: hit ? 48 : 38 });
  }
  /** After a mission: the rooms it reached that are empty now, the attacker knows are empty. */
  learn(who, rooms) {
    for (const r of rooms) if (r.floor.owner !== who && !r.res && !r.burnt) { r.know = 'empty'; r.hint = null; r.paint(); }
  }
  async fireMission(who, aim, rooms) {
    this.step = 'fire-ball';
    const tw = this.towerOfFloor(aim.floor);
    const viewer = who === 'me' && !this.bot;
    if (viewer && this.idea !== 3) await this.frame('all', { ms: 380 });
    const from = this.launchFrom(who);
    const at = aim.world;
    this.sfx('heat');
    await throwBall(this, from.x, from.y, at.x, at.y, { kind: 'fire', ms: 600 / this.speed, arc: 110 });
    if (!this.alive) return;
    if (viewer) this.frame(tw, { ms: 420 });
    this.effects.shake(0.008, 320);
    this.step = 'fire';
    rooms.forEach((r, i) => {
      const w = r.world;
      burnRoom(this, w.x, w.y, { w: ROOM.w, h: ROOM.h, ms: 1500 / this.speed, delay: (i * 90) / this.speed });
    });
    await this.wait(260);
    const hit = this.evict(rooms, 'chute');
    for (const r of rooms) { r.burnt = true; r.broken = true; r.know = 'empty'; r.hint = null; }
    this.time.delayedCall(700 / this.speed, () => { for (const r of rooms) r.paint(); });
    this.missionWord(rooms, hit);
    await this.wait(1700);
    this.step = 'fire-end';
  }
  /** Gras's roots: the lowest two floors of a Gras tower (idea 3: Gras floors among the lowest three) hold their people. */
  rooted(fl) {
    if (fl.tribe !== 'gras') return false;
    const tw = this.towerOfFloor(fl);
    const i = tw ? tw.floors.indexOf(fl) : -1;
    return i >= 0 && i < (this.idea === 3 ? 3 : 2);
  }
  async waterMission(who, aim, rooms) {
    const tw = this.towerOfFloor(aim.floor);
    const viewer = who === 'me' && !this.bot;
    if (viewer) this.frame(this.idea === 3 ? tw : 'all', { ms: 420, min: 0.6 });
    const floors = [...new Set(rooms.map((r) => r.floor))];
    const y0 = Math.min(...floors.map((f) => f.top));
    const y1 = Math.max(...floors.map((f) => f.bottom));
    const x = floors.reduce((n, f) => n + f.x, 0) / floors.length;
    const side = this.idea === 3 ? (who === 'me' ? -1 : 1) : tw.x < GAME_W / 2 ? 1 : -1;
    this.step = 'water-wheel';
    this.sfx('splash');
    let hitNow;
    const hitP = new Promise((r) => { hitNow = r; });
    const done = waterWheel(this, x, y0 - 4, y1 + 4, { side, width: FLOOR.w, ms: 1400 / this.speed, seaY: this.seaY, onHit: () => hitNow() });
    await Promise.race([hitP, this.wait(2600)]);
    const out = [];
    for (const r of rooms) {
      if (!r.res) continue;
      if (this.rooted(r.floor)) { const w = r.world; this.say(w.x, w.y - 30, 'Wortels hou!', { color: '#a8f08e', size: 30 }); continue; }
      out.push(r);
    }
    for (const f of floors) {
      f.facade.setTint(0xa9dcff);
      this.time.delayedCall(500 / this.speed, () => { if (!f.destroyed) f.facade.setTint(FACADE_TINT[f.tribe] || 0xffffff); });
    }
    const hit = this.evict(out, 'swim');
    this.learn(who, rooms);
    this.missionWord(rooms, hit);
    this.step = 'water-done';
    await done;
    await this.wait(300);
    this.step = 'water-end';
  }
  async grassMission(who, aim, rooms, strong) {
    const tw = this.towerOfFloor(aim.floor);
    const foe = other(who);
    const viewer = who === 'me' && !this.bot;
    if (viewer) this.frame(tw, { ms: 420, min: 0.6 });
    this.step = 'vines';
    this.sfx('creak');
    // up the column, past every room it reaches
    const top = rooms.reduce((a, r) => (r.world.y < a.world.y ? r : a), rooms[0]);
    const tw0 = top.world;
    const tx = tw0.x + (top.col === 0 ? -ROOM.w / 2 - 6 : ROOM.w / 2 + 6);
    await vinesTo(this, tx, this.baseTop + 6, tw0.y - ROOM.h / 2, { ms: 760 / this.speed, hold: 520 / this.speed });
    let hit = this.evict(rooms.filter((r) => r.res && (r.res.owner !== who || this.idea === 3)), 'grab');
    // and one more (two against Water), anywhere: the vines always find someone
    const extra = this.sides[foe].people.filter((p) => p.state === 'home' && p.room && !rooms.includes(p.room) && p.room.floor !== this.hanging?.floor);
    for (const p of extra.sort(() => this.rnd() - 0.5).slice(0, strong ? 2 : 1)) {
      const r = p.room;
      if (!r || r.floor.destroyed || p.state !== 'home') continue;
      const w = r.world;
      await vinesTo(this, w.x + (r.col === 0 ? -ROOM.w / 2 - 6 : ROOM.w / 2 + 6), this.baseTop + 6, w.y - ROOM.h / 2, { ms: 620 / this.speed, hold: 380 / this.speed });
      hit += this.evict([r], 'grab');
    }
    this.learn(who, rooms);
    this.missionWord(rooms, hit);
    await this.wait(900);
    this.step = 'vines-end';
  }

  // ------------------------------------------------------------------------------------------- ideas 2 and 3: the crane
  hangFloor(who) {
    const tw = this.towerOf(who);
    const top = tw.floors[tw.floors.length - 1];
    const idx = tw.floors.filter((f) => f.owner === who).length;
    const fl = new LFloor(this, { tribe: this.sides[who].tribe, owner: who, idx, x: tw.x, y: this.topY(tw) - 400 });
    fl.c.setDepth(DEPTH.tower + 0.5);
    // the crane works in screen space: over the tower's top, with the camera that will centre on it
    this.crane.setCenter(tw.x + (top ? top.ox : 0) - this.craneScrollX(who));
    this.crane.setBlock({ i: idx + (who === 'ai' ? 1 : 0) }, 'lt_none', { h: FLOOR.h, originX: 0.5, originY: 0.5 });
    this.crane.dTop = FLOOR.h / 2;
    this.hanging = { floor: fl, who };
    const p = this.crane.getBlockPose();
    fl.setPose(p.x + this.cam.scrollX, p.y + this.cam.scrollY, p.angle);
    fl.paint();
  }
  /** The floor the crane let go of falls until it lands on the tower or drops in the sea. */
  dropHanging() {
    const pose = this.crane.release();
    const h = this.hanging;
    this.hanging = null;
    this.sfx('drop');
    const f = h.floor;
    f.setPose(pose.x + this.cam.scrollX, pose.y + this.cam.scrollY, 0);
    const tw = this.towerOf(h.who);
    return new Promise((resolve) => {
      this.falling = { f, tw, vy: 120, resolve };
    });
  }
  stepFalling(dt) {
    const fa = this.falling;
    const f = fa.f;
    fa.vy += 1800 * dt;
    const y = f.y + fa.vy * dt;
    const top = fa.tw.floors[fa.tw.floors.length - 1];
    const landY = this.topY(fa.tw) - FLOOR.h / 2;
    const supportX = fa.tw.x + (top ? top.ox : 0);
    const off = f.x - supportX;
    if (y >= landY && !fa.missed) {
      if (Math.abs(off) > FLOOR.w / 2 + 6) {
        fa.missed = true;   // past the edge: it tips off and falls into the sea, its riders jump
        fa.vr = Math.sign(off || 1) * 3;
        const riders = f.rooms.filter((r) => r.res);
        if (riders.length) this.evict(riders, 'chute');
      } else {
        this.falling = null;
        this.land(fa, off);
        return;
      }
    }
    if (fa.missed) {
      f.setPose(f.x + Math.sign(off || 1) * 120 * dt, y, f.angle + fa.vr * dt);
      if (y > this.seaY + 60) {
        this.falling = null;
        this.water.splash(f.x);
        this.sfx('splash');
        f.destroy();
        this.say(f.x, this.seaY - 80, 'Mis!', { color: '#cfe0ff', size: 40 });
        fa.resolve({ landed: false });
      }
      return;
    }
    f.setPose(f.x, y, 0);
  }
  land(fa, off) {
    const { f, tw } = fa;
    const top = tw.floors[tw.floors.length - 1];
    let perfect = false;
    let ox = (top ? top.ox : 0) + off;
    if (Math.abs(off) <= PERFECT_PX) { perfect = true; ox = top ? top.ox : 0; }
    f.ox = ox;
    f.c.setDepth(DEPTH.tower);
    tw.floors.push(f);
    this.layoutTower(tw);
    this.kick(f);
    this.effects.dust(f.x, f.bottom, FLOOR.w);
    this.sfx('land', { intensity: perfect ? 0.6 : 0.9, size: 0.8 });
    haptics.tap();
    const s = this.sides[f.owner];
    s.charge = Math.min(this.cost(f.owner), s.charge + (perfect ? 2 : 1));
    if (perfect) {
      this.sfx('perfect');
      haptics.perfect();
      this.say(f.x, f.top - 40, 'Perfek!', { color: '#ffffff', size: 50 });
      this.effects.sparkle(f.x, f.top, 18);
    }
    f.paint();
    this.hud();
    fa.resolve({ landed: true, perfect, f });
  }

  // ------------------------------------------------------------------------------------------- the robot
  /**
   * How likely each of `who`'s foe's rooms in `tw` is to hide someone, from what `who` knows: the rooms it saw into, the
   * rooms it knows are empty, and what its misses heard next door.
   */
  odds(who, tw) {
    const foe = other(who);
    const rooms = tw.floors.flatMap((f) => (f.owner === foe ? f.rooms : [])).filter((r) => r.usable);
    const unknown = rooms.filter((r) => r.know === 'unknown');
    const seen = rooms.filter((r) => r.know === 'lit' && r.res).length;
    const base = Math.max(0, this.home(foe) - seen) / Math.max(1, unknown.length);
    const P = new Map();
    for (const r of rooms) P.set(r, r.know === 'lit' ? (r.res ? 1 : 0) : r.know === 'empty' ? 0 : Math.min(0.95, base));
    const F = tw.floors;
    for (const r of rooms) {
      if (r.know !== 'empty' || r.hint == null) continue;
      const f = F.indexOf(r.floor);
      const near = [[f, r.col - 1], [f, r.col + 1], [f + 1, r.col], [f - 1, r.col]]
        .map(([ff, cc]) => (ff >= 0 && ff < F.length && cc >= 0 && cc < COLS ? F[ff].rooms[cc] : null))
        .filter((x) => x && P.has(x) && x.know === 'unknown');
      for (const x of near) {
        if (r.hint === 0) P.set(x, P.get(x) * (r.stale ? 0.7 : 0.15));
        else P.set(x, Math.min(0.95, P.get(x) + (r.hint / near.length) * (r.stale ? 0.3 : 0.8)));
      }
    }
    return (r) => P.get(r) || 0;
  }
  botAim(who, kind) {
    const tw = this.targetTower(who);
    const P = this.odds(who, tw);
    const s = this.sides[who];
    const strong = BEATS[s.tribe] === this.sides[other(who)].tribe;
    let best = null;
    let score = -1e9;
    for (const f of tw.floors) {
      for (const r of f.rooms) {
        if (this.idea !== 3 && f.owner === who) continue;
        if (kind === 'throw' && (r.burnt || r.floor.owner === who || r.know === 'empty')) continue;
        let sc = 0;
        const reach = kind === 'throw' ? [r] : this.patternOf(s.tribe, r, strong);
        for (const x of reach) sc += P(x) - (this.idea === 3 && x.floor.owner === who && x.res ? 1.4 : 0);
        sc += this.rnd() * 0.06;
        if (sc > score) { score = sc; best = r; }
      }
    }
    return { b: best, score };
  }
  async botAct1(who) {
    await this.wait(650);
    const s = this.sides[who];
    if (s.charge >= this.cost(who) && this.home(who) > 0) {
      const a = this.botAim(who, 'mission');
      if (a.b && (s.tribe === 'gras' || a.score > 0.45)) { await this.mission(who, a.b); return; }
    }
    const a = this.botAim(who, 'throw');
    if (a.b) await this.throwAt(who, a.b);
    s.charge = Math.min(this.cost(who), s.charge + 1);
  }
  async botMove(who, n) {
    for (let k = 0; k < n; k++) {
      const tw = this.towerOf(who);
      const mine = this.sides[who].people.filter((p) => p.state === 'home' && p.room && this.towerOfFloor(p.room.floor) === tw);
      const free = this.roomsOf(who, { free: true, tw });
      if (!mine.length || !free.length) return;
      const seen = mine.find((p) => p.room.know === 'lit');
      const p = seen || (this.rnd() < 0.4 ? mine[Math.floor(this.rnd() * mine.length)] : null);
      if (!p) return;
      await this.wait(300);
      const dest = free[Math.floor(this.rnd() * free.length)];
      this.moveOut(p);
      this.moveIn(p, dest);
      this.decoy(who, dest);
      if (who === 'ai') this.ui?.toast?.(`${this.sides.ai.name} het iemand geskuif…`, { ms: 1000 });
    }
  }
  async botDrop(who) {
    this.hangFloor(who);
    await this.craneView();
    const s = this.sides[who];
    const tw = this.towerOf(who);
    const top = tw.floors[tw.floors.length - 1];
    if (this.idea === 3 && this.reserve(who) > 0 && this.hanging) {
      // riders: as many as must, sometimes one or two more
      const must = this.mustCarry(who);
      const want = clamp(Math.max(must, this.rnd() < 0.6 ? 1 + Math.floor(this.rnd() * 2) : 0), 0, Math.min(COLS, this.reserve(who)));
      const free = [...this.hanging.floor.rooms].sort(() => this.rnd() - 0.5);
      for (let k = 0; k < want; k++) this.moveIn(s.people.find((p) => p.state === 'reserve'), free[k]);
      this.hud();
    }
    this.step = 'bot-aim';
    await this.wait(600);
    // aim: often near the middle of the top, sometimes off, rarely a miss
    const cx = tw.x + (top ? top.ox : 0);
    let off = this.rnd() < 0.45 ? (this.rnd() - 0.5) * 8 : (this.rnd() - 0.5) * FLOOR.w * 0.28;
    if (top && this.rnd() < 0.04) off = (this.rnd() < 0.5 ? -1 : 1) * (FLOOR.w / 2 + 16);
    // wait for the swing to bring the floor there (or close), then let go: at most 2 s, however slow the phone draws
    const target = cx + off;
    const until = this.time.now + 2000 / this.speed;
    while (this.time.now < until && this.alive && this.crane) {
      const p = this.crane.getBlockPose();
      if (Math.abs(p.x - target) < 6) break;
      await this.wait(16);
    }
    s.drops += 1;
    this.step = 'bot-drop';
    return this.dropHanging();
  }
  botPlace(who, n) {
    const tw = this.towerOf(who);
    for (let k = 0; k < n && this.reserve(who) > 0; k++) {
      const free = this.roomsOf(who, { free: true, tw });
      if (!free.length) return;
      const lonely = free.filter((r) => !r.floor.people().length);
      const pool = lonely.length ? lonely : free;
      const dest = pool[Math.floor(this.rnd() * pool.length)];
      this.moveIn(this.sides[who].people.find((p) => p.state === 'reserve'), dest);
      this.decoy(who, dest);
    }
    if (who === 'ai') this.ui?.toast?.(`${this.sides.ai.name} kry nuwe inwoners`, { ms: 900 });
    this.hud();
  }
}
