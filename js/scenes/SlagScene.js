// (1.17) Vrugteslag: Ryk teen Ryk. The owner (16 Oct 2026, typed): "The more you play stapel (dayly challenge) the bigger
// your empire gets, Break your oponents empire before he breaks yours, with special abilities. So it needs to be a fruit
// battle, grapes, slingshot infront of the camera, it splashes over 4 blocks, Bananas, boomerangs with one whole block
// ... fruit juice ... "the flood" it gets pushed out of a straw with a fruit juice box, then it eliminates 2 rows,
// watermelon, damages 6 - 10 blocks, ... swords counter grapes, monkeys catches bananas, big joe drinks the juice, this
// depends on where you put the people ... A mini game before you begin decides if you get an extra turn ... dig deep
// create the plan confirm the style and then build it." Then: "make it more difficult with the fruit, it musnt be easy
// just drag and the banas goes where you want it, and the grapes, you can miss..."; his picks: style B (Sononder-slag),
// Herbou with the crane, weather each turn, weak spots and combos, fruit from the Daily Tower.
// The rules are js/core/slag.js. This scene stands on Jou dorp's (js/scenes/DorpScene.js: the island, the sea, Stapel
// blocks, faces, parachutes): each side defends a castle (one tall tower, a row per Stapel block, its empire's towers
// behind it on the rocks). On your turn the camera looks at THEIR castle across the sea, with your launcher in front of
// the camera: every fruit is a skill (a slingshot pulled back while your hand starts to shake, a boomerang swiped and
// caught on its way back, a juice box aimed then pumped, a catapult released on its swing) and the wind, the rain and
// the storm push it; you see only the start of the aim, never where it lands. On theirs, the camera turns to yours.
// The screen over it (the castles' people, the tray, the setup, the mini-game, the end) is js/ui/dom.js; main.js starts
// it with `d.ui` (the screen's side of each step).

import { DorpScene } from './DorpScene.js';
import { GAME_W, DEPTH, PALETTE } from '../config.js';
import { audio, haptics } from '../audio.js';
import { createIsland } from '../game/island.js';
import { getGeometry, ensureTexture } from '../game/blocks.js';
import { windowSlots, paintWindows, parachute, CAST, burnRoom } from '../game/residents.js';
import { createRng } from '../core/rng.js';
import { createCasting } from '../core/living.js';
import { emojiTexture } from '../game/emojitex.js';
import {
  DEFENDER_IDS, makeCastle, castlePeople, placeDefenders, botDefenders, weatherFor, rateImpact, applyShot, rebuild,
  nextCombo, winner, botShot,
} from '../core/slag.js';

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
const PAD = 3;
const CASTLE_SPOT = { dx: 0, y: 0, s: 0.74, depth: DEPTH.tower, main: true };
const CASTLE_SHAPES = ['plank', 'slab', 'plank', 'slab', 'brick'];
const EMPIRE_SPOTS = [
  { dx: -232, y: 18, s: 0.4, depth: DEPTH.island - 1 },
  { dx: 232, y: 18, s: 0.4, depth: DEPTH.island - 1 },
  { dx: -330, y: 30, s: 0.34, depth: DEPTH.island - 2, back: true },
  { dx: 330, y: 30, s: 0.34, depth: DEPTH.island - 2, back: true },
];
export const FRUIT = Object.freeze({ druiwe: '🍇', piesang: '🍌', sap: '🧃', waatlemoen: '🍉' });
export const DEFENDERS = Object.freeze({ ridder: '⚔️', aap: '🐒', joe: '🥤', sarel: '🏉' });
const COUNTER_WORD = { ridder: 'SNY!', aap: 'GEVANG!', joe: 'SLURP!', sarel: 'VANG!' };
const LAUNCH_ZONE = 300;        // the launcher's room at the bottom of the screen: the castle is framed above it
const MAX_PULL = 230;           // the slingshot's pull (screen px)
const SHAKE_AFTER = 1100;       // the hand starts to shake after this long (ms)
const BANANA_SPEED = 1.5;       // the swipe speed (px/ms) that sends a banana straight at the castle
const BANANA_SPREAD = 160;      // world px off the castle's middle per px/ms too fast or too slow
const CATCH_MS = 900;           // a returning banana can be caught this long
const WIND_PX = 28;             // world px a fruit drifts per point of wind (heavier fruit less)
const HEAVY = { druiwe: 1, piesang: 0.8, sap: 0.7, waatlemoen: 0.4 };

/** A battle castle's rows as Stapel blocks: windows as many as the row's people at the start (up to five). */
function castleSlots(g, n) {
  const h = Math.max(18, Math.min(30, Math.round(g.h * 0.6)));
  const w = Math.round(h * 0.78);
  const span = Math.min(g.w - 16, n * (w + 9));
  return Array.from({ length: n }, (_, i) => ({ x: g.w / 2 - span / 2 + (i + 0.5) * (span / n), y: g.h / 2 + 1, w, h }));
}

/**
 * The castle's plan from its battle state (js/core/slag.js makeCastle): a block per row with a window for each of its
 * people at the start, and the empire's towers behind (its level, up to four). Pure data.
 */
export function planCastle({ id = 'CASTLE', castle = null, tribe = 'vuur', empire = 4 } = {}) {
  const c = castle || makeCastle({ seed: id });
  const rng = createRng(`slag/${id}`);
  const casting = createCasting(`slag/${id}`, tribe);
  const hue = rng.int(0, PALETTE.length - 1);
  const hue2 = rng.int(0, PALETTE.length - 1);
  const floors = c.rows.map((r, i) => ({ shape: rng.pick(CASTLE_SHAPES), color: i % 3 === 2 ? hue2 : hue, dx: Math.round((rng.next() - 0.5) * 6), tilt: (rng.next() - 0.5) * 0.02, n: r.cap, people: r.people }));
  const who = new Map();
  floors.forEach((f, fi) => { for (let i = 0; i < f.people; i++) who.set(`${fi}.${i}`, casting.next().who); });
  const towers = [{ spotDef: CASTLE_SPOT, floors, who, gold: new Set(), castle: true }];
  for (let k = 0; k < Math.min(EMPIRE_SPOTS.length, empire); k++) {
    const fl = [];
    const n = 3 + rng.int(0, 3);
    const h1 = rng.int(0, PALETTE.length - 1);
    for (let j = 0; j < n; j++) fl.push({ shape: rng.pick(['slab', 'brick', 'crate']), color: h1, dx: 0, tilt: (rng.next() - 0.5) * 0.03, n: 0 });
    fl.push({ shape: rng.pick(['wedge', 'arch']), color: h1, dx: 0, tilt: 0, n: 0 });
    fl.forEach((f) => { f.n = windowSlots(getGeometry({ shape: f.shape, scale: 1 })).length; });
    const w2 = new Map();
    fl.forEach((f, fi) => { for (let i = 0; i < f.n; i++) if (rng.chance(0.6)) w2.set(`${fi}.${i}`, casting.next().who); });
    towers.push({ spotDef: EMPIRE_SPOTS[k], floors: fl, who: w2, gold: new Set() });
  }
  return { towers, cast: casting };
}

let winUid = 0;

export class SlagScene extends DorpScene {
  constructor() {
    super({ key: 'Slag' });
  }

  init(data) {
    super.init(data);
    this.splats = [];
    this.badges = { me: {}, them: {} };
    this.over = false;
    this.weatherFx = [];
  }

  create() {
    super.create();
    if (this.d.preview) {
      this.time.delayedCall(250, () => this.preview());
      return;
    }
    // the launcher stands in front of the camera at the bottom: castles are framed above it
    this.trayBar = this.d.trayBar || this.H * 0.17;
    this.d.bottomBar = this.trayBar + LAUNCH_ZONE;
    this.frame('me', 0);
    this.time.delayedCall(300, () => this.run().catch((e) => this.failed(e)));
  }

  teardown() {
    this.over = true;
    super.teardown();
  }

  /** The screen's bars (CSS measured): the tray at the bottom, the launcher's room above it. */
  setBars(top, bottom, ms = 0) {
    if (this.d.preview) {
      super.setBars(top, bottom, ms);
      return;
    }
    this.trayBar = bottom;
    super.setBars(top, bottom + LAUNCH_ZONE, ms);
  }

  // -------------------------------------------------------------------------------------------------------- castles
  /** A side's island with its castle (rows from its battle state) and its empire behind it. */
  buildIsle(side, ox, town) {
    let art;
    if (ox === 0) {
      art = createIsland(this);
    } else {
      const rock = this.add.image(ox + GAME_W / 2 - 450, -80, 'isl_rock').setOrigin(0, 0).setDepth(DEPTH.island);
      const base = this.add.image(ox + GAME_W / 2, 0, 'isl_base').setOrigin(0.5, 0).setDisplaySize(300, 44).setDepth(DEPTH.base);
      art = { rock, base };
    }
    const tribe = town.tribe || 'vuur';
    const castle = town.castle || makeCastle({ rows: town.rows || 10, people: town.people || 40, seed: town.id || side });
    const plan = planCastle({ id: town.id || side, castle, tribe, empire: town.empire ?? 4 });
    const isle = { side, ox, town: { ...town, tribe }, plan, art, towers: [], walls: [], top: 0, marks: [], castle: null, state: castle, cast: plan.cast };
    plan.towers.forEach((tw) => isle.towers.push(this.buildTower(isle, tw)));
    isle.castle = isle.towers[0];
    isle.castle.blocks.forEach((b) => { b.castle = true; });
    isle.top = Math.min(...isle.towers.map((t) => t.top));
    this.buildWalls(isle, town.walls | 0);
    this.buildFlag(isle);
    this.repaintCastle(isle);
    return isle;
  }

  /** A castle row's windows: its own (up to five), a face where someone still lives. */
  paintBlock(b, tribe) {
    if (!b.castle) {
      super.paintBlock(b, tribe);
      return;
    }
    if (!b.slots) {
      b.slots = castleSlots(b.g, b.f.n);
      b.winKey = `slag_win_${++winUid}`;
    }
    const wins = b.slots.map((_, i) => (b.who[i] ? { look: 'face', who: b.who[i], tribe: CAST[b.who[i]]?.tribe || tribe } : { look: 'room', tribe }));
    const key = paintWindows(this, b.winKey, b.g, wins, PAD, 1, b.slots);
    if (key && this.textures.exists(key)) b.win.setTexture(key);
  }

  repaintAll() {
    super.repaintAll();
    for (const isle of Object.values(this.isles)) if (isle.castle) this.repaintCastle(isle);
  }

  repaintCastle(isle) {
    for (const b of isle.castle.blocks) this.paintBlock(b, isle.town.tribe);
  }

  windowAt(b, i) {
    if (!b.castle || !b.slots) return super.windowAt(b, i);
    const s = b.slots[i];
    if (!s) return { x: b.x, y: b.bottom };
    const dx = (s.x - b.g.w / 2) * b.s;
    const dy = (s.y - b.g.h) * b.s;
    const a = b.img.rotation;
    return { x: b.x + dx * Math.cos(a) - dy * Math.sin(a), y: b.bottom + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  /** Row `r`'s place in the world: its middle, half its width and height. */
  rowBox(isle, r) {
    const b = isle.castle.blocks[r];
    if (!b) return null;
    const h = b.g.h * b.s;
    return { x: b.x, y: b.bottom - h / 2, hw: (b.g.w * b.s) / 2, hh: h / 2, b };
  }

  /** The castle's top (its highest row's top; negative is up). */
  castleTop(isle) {
    const last = isle.castle.blocks[isle.castle.blocks.length - 1];
    return last ? last.bottom - last.g.h * last.s : -200;
  }

  // ------------------------------------------------------------------------------------------------------ pictures
  makeTextures() {
    super.makeTextures();
    if (!this.textures.exists('slag_sling')) {
      const W = 240, H = 330;
      const t = this.textures.createCanvas('slag_sling', W, H);
      const c = t.getContext();
      const wood = (x0, y0, x1, y1, w) => {
        const g = c.createLinearGradient(x0 - w, 0, x0 + w, 0);
        g.addColorStop(0, '#5a3214');
        g.addColorStop(0.45, '#a8672e');
        g.addColorStop(1, '#4a2810');
        c.strokeStyle = g;
        c.lineWidth = w;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
        c.stroke();
      };
      c.shadowColor = 'rgba(0,0,0,0.35)';
      c.shadowBlur = 14;
      c.shadowOffsetY = 6;
      wood(120, 320, 120, 190, 34);
      wood(120, 200, 42, 34, 28);
      wood(120, 200, 198, 34, 28);
      c.shadowColor = 'transparent';
      c.fillStyle = '#3a1d08';
      for (const [x, y] of [[48, 48], [192, 48]]) {
        c.save();
        c.translate(x, y);
        c.rotate(x < 120 ? -0.45 : 0.45);
        for (let k = 0; k < 3; k++) c.fillRect(-17, -6 + k * 7, 34, 4);
        c.restore();
      }
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(112, 220, 6, 90);
      c.fillStyle = '#2b1606';
      for (let k = 0; k < 4; k++) c.fillRect(100, 240 + k * 14, 40, 5);
      t.refresh();
    }
    if (!this.textures.exists('slag_target')) {
      const t = this.textures.createCanvas('slag_target', 140, 140);
      const c = t.getContext();
      for (const [r, col] of [[62, '#ffffff'], [50, '#ff3b3b'], [36, '#ffffff'], [22, '#ff3b3b']]) {
        c.fillStyle = col;
        c.globalAlpha = 0.9;
        c.beginPath();
        c.arc(70, 70, r, 0, Math.PI * 2);
        c.fill();
      }
      t.refresh();
    }
    for (const [key, col] of [['slag_splat_druiwe', '#7b2fbf'], ['slag_splat_sap', '#ff9f1c'], ['slag_splat_waatlemoen', '#e8455a'], ['slag_splat_piesang', '#ffd84a']]) {
      if (this.textures.exists(key)) continue;
      const t = this.textures.createCanvas(key, 120, 90);
      const c = t.getContext();
      const rng = createRng(key);
      c.fillStyle = col;
      c.globalAlpha = 0.86;
      c.beginPath();
      c.ellipse(60, 40, 34, 24, 0, 0, Math.PI * 2);
      c.fill();
      for (let k = 0; k < 9; k++) {
        const a = rng.next() * Math.PI * 2;
        const r = 26 + rng.next() * 22;
        c.beginPath();
        c.arc(60 + Math.cos(a) * r, 40 + Math.sin(a) * r * 0.7, 4 + rng.next() * 8, 0, Math.PI * 2);
        c.fill();
      }
      for (let k = 0; k < 3; k++) c.fillRect(44 + k * 14, 50, 6, 18 + rng.next() * 18);
      c.globalAlpha = 0.35;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.ellipse(50, 32, 12, 6, -0.4, 0, Math.PI * 2);
      c.fill();
      t.refresh();
    }
    if (!this.textures.exists('slag_crack')) {
      const t = this.textures.createCanvas('slag_crack', 160, 50);
      const c = t.getContext();
      c.strokeStyle = 'rgba(30,20,20,0.75)';
      c.lineWidth = 3;
      c.lineJoin = 'round';
      const rng = createRng('crack');
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        let x = 20 + k * 55;
        let y = 2;
        c.moveTo(x, y);
        while (y < 48) {
          x += (rng.next() - 0.5) * 18;
          y += 6 + rng.next() * 8;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      t.refresh();
    }
    if (!this.textures.exists('slag_drop')) {
      const t = this.textures.createCanvas('slag_drop', 24, 24);
      const c = t.getContext();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(12, 12, 10, 0, Math.PI * 2);
      c.fill();
      t.refresh();
    }
  }

  emo(ch, px = 72) {
    return emojiTexture(this, ch, px, { font: EMOJI_FONT });
  }

  /** A splat that stays on a block (grape, juice, watermelon, banana). */
  splat(kind, x, y, scale = 0.6) {
    const s = this.add.image(x, y, `slag_splat_${kind}`).setDepth(DEPTH.tower + 0.4).setScale(scale).setAngle(((x * 37) % 30) - 15).setAlpha(0);
    this.tweens.add({ targets: s, alpha: 1, duration: 120 });
    this.splats.push(s);
    return s;
  }

  // ----------------------------------------------------------------------------------------------------- the look
  /** One moment of a battle (the style pictures): your turn, their castle, stains, a catch, your loaded slingshot. */
  preview() {
    const them = this.isles.me;
    const castle = them.castle;
    this.trayBar = this.d.bottomBar || this.H * 0.18;
    this.d.bottomBar = this.trayBar + LAUNCH_ZONE;
    this.frame('me', 0);
    const rowAt = (r) => castle.blocks[Math.min(castle.blocks.length - 1, r)];
    const b3 = rowAt(3);
    const b7 = rowAt(7);
    this.splat('druiwe', b3.x - 30, b3.bottom - 14, 0.62).setAlpha(1);
    this.splat('sap', b7.x + 26, b7.bottom - 16, 0.55).setAlpha(1);
    const b5 = rowAt(5);
    const ax = b5.x + (b5.g.w * b5.s) / 2 + 30;
    const ay = b5.bottom - (b5.g.h * b5.s) / 2;
    this.add.image(ax, ay, this.emo('🐒')).setDepth(DEPTH.fxWorld).setScale(0.9);
    this.add.image(ax + 26, ay - 30, this.emo('🍌', 56)).setDepth(DEPTH.fxWorld).setScale(0.8).setAngle(-30);
    this.add.text(ax - 10, ay - 82, 'GEVANG!', { fontFamily: FONT, fontSize: '40px', fontStyle: '900', color: '#ffe38c', stroke: '#1d2b45', strokeThickness: 7 })
      .setOrigin(0.5).setDepth(DEPTH.fxScreen).setShadow(0, 5, 'rgba(0,0,0,0.4)', 6, true, true);
    const tb = rowAt(8);
    const target = { x: tb.x - 10, y: tb.bottom - (tb.g.h * tb.s) / 2 };
    const ring = this.add.image(target.x, target.y, 'slag_target').setDepth(DEPTH.fxWorld + 1).setScale(0.42).setAlpha(0.95);
    this.tweens.add({ targets: ring, scale: 0.5, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const sl = this.slingRig();
    sl.pull({ x: sl.rest.x - 8, y: sl.rest.y + 60 });
    const W = this.scale.width;
    const cam = this.cam;
    const z = cam.zoom || 1;
    const tsc = this.onScreen((target.x - cam.scrollX - W / 2) * z + W / 2, (target.y - cam.scrollY - this.H / 2) * z + this.H / 2);
    const k = sl.k;
    const from = sl.rest;
    const apex = { x: (from.x + tsc.x) / 2, y: Math.min(from.y, tsc.y) - 200 * k };
    for (let i = 1; i < 16; i++) {
      const p = i / 16;
      const q = 1 - p;
      this.add.circle(q * q * from.x + 2 * q * p * apex.x + p * p * tsc.x, q * q * from.y + 2 * q * p * apex.y + p * p * tsc.y, (7 - p * 3) * k, 0xffffff, 0.9 - p * 0.3).setScrollFactor(0).setDepth(DEPTH.fxScreen - 0.5);
    }
  }

  // --------------------------------------------------------------------------------------------------- the battle
  /** The whole battle: the setup, then turns until a castle has nobody left (or the turns run out), then the end. */
  async run() {
    const d = this.d;
    this.rand = createRng(`slag/${d.seed || 'x'}/play`).next;
    this.sides = {
      me: { fruit: { ...d.fruit }, combo: { n: 0, fire: false }, name: d.me.name },
      them: { fruit: { ...(d.botFruit || { druiwe: Infinity, piesang: 3, sap: 2, waatlemoen: 1 }) }, combo: { n: 0, fire: false }, name: d.them.name },
    };
    this.turn = 0;
    this.live = !!d.net;
    this.startPeople = { me: castlePeople(this.isles.me.state), them: castlePeople(this.isles.them.state) };
    // 1. the defenders: yours where you put them; Robot Rikus's his own way, a friend's from their game (hidden)
    if (!this.live) placeDefenders(this.isles.them.state, botDefenders(this.isles.them.state, this.rand));
    const places = await this.setup();
    if (this.live) {
      d.net.send({ t: 'setup', defenders: places });
      this.d.ui?.mode?.('wait', {});
      const m = await d.net.next(['setup']);
      if (m.t === 'gone') return this.finish(true, true);
      placeDefenders(this.isles.them.state, m.defenders || {});
    }
    this.counts();
    // 2. turns: against Rikus you first; between two players the one who made the room
    let side = !this.live || d.seat === 0 ? 'me' : 'them';
    while (!this.over) {
      this.turn += 1;
      this.weather = weatherFor(d.seed || 'x', this.turn);
      if (side === 'me') await this.myTurn();
      else if (this.live) await this.liveTurn();
      else await this.botTurn();
      const w = winner(this.isles.me.state, this.isles.them.state, this.turn);
      if (w || this.over) {
        if (!this.over) await this.finish(w === 'a');
        return;
      }
      side = side === 'me' ? 'them' : 'me';
    }
  }

  counts() {
    this.d.ui?.counts?.({ me: castlePeople(this.isles.me.state), them: castlePeople(this.isles.them.state), meMax: this.startPeople.me, themMax: this.startPeople.them });
  }

  // ---------------------------------------------------------------------------------------------------- the setup
  /** Your defenders: start in good places; pick one on the screen, then tap a row of your castle; "Gereed" starts. */
  setup() {
    const me = this.isles.me;
    const st = me.state;
    const n = st.rows.length;
    const places = { joe: n - 2, sarel: 1, aap: Math.floor(n / 2), ridder: Math.floor(n * 0.75) };
    this.frame('me', 0);
    let pick = 'joe';
    const show = () => {
      placeDefenders(st, places);
      this.showDefenders(me, DEFENDER_IDS);
    };
    show();
    return new Promise((resolve) => {
      const tap = (p) => {
        const r = this.rowAtPoint(me, p.worldX, p.worldY);
        if (r == null || !pick) return;
        // one defender a row: whoever stood there swaps
        const other = Object.keys(places).find((k) => places[k] === r && k !== pick);
        if (other) places[other] = places[pick];
        places[pick] = r;
        audio.play('pop');
        haptics.tap();
        show();
        this.d.ui?.setup?.({ places: { ...places }, pick, rows: n });
      };
      this.input.on('pointerdown', tap);
      this.d.ui?.setup?.({
        places: { ...places }, pick, rows: n,
        onPick: (id) => {
          pick = id;
          this.d.ui?.setup?.({ places: { ...places }, pick, rows: n });
        },
        onShuffle: () => {
          Object.assign(places, botDefenders(st, Math.random));
          show();
          this.d.ui?.setup?.({ places: { ...places }, pick, rows: n });
        },
        onReady: () => {
          this.input.off('pointerdown', tap);
          placeDefenders(st, places);
          resolve(places);
        },
      });
    });
  }

  /** The row of `isle`'s castle at world point (x, y) (a little either side counts), or null. */
  rowAtPoint(isle, x, y) {
    for (const b of isle.castle.blocks) {
      if (b.row >= isle.state.rows.length) continue;
      const h = b.g.h * b.s;
      const hw = (b.g.w * b.s) / 2 + 40;
      if (y <= b.bottom + 2 && y >= b.bottom - h - 2 && Math.abs(x - b.x) <= hw) return b.row;
    }
    return null;
  }

  /** Defender badges beside their rows (yours: all; theirs: the ones they've shown). */
  showDefenders(isle, ids) {
    const side = isle === this.isles.me ? 'me' : 'them';
    for (const id of DEFENDER_IDS) {
      const r = isle.state.defenders[id];
      let bd = this.badges[side][id];
      if (!ids.includes(id) || r == null) {
        bd?.setVisible(false);
        continue;
      }
      const box = this.rowBox(isle, r);
      if (!box) continue;
      const x = box.x + box.hw + 26;
      if (!bd) {
        bd = this.add.image(x, box.y, this.emo(DEFENDERS[id], 64)).setDepth(DEPTH.fxWorld - 1).setScale(0.62);
        this.badges[side][id] = bd;
      }
      bd.setVisible(true);
      this.tweens.add({ targets: bd, x, y: box.y, duration: 180, ease: 'Quad.easeOut' });
    }
  }

  // ----------------------------------------------------------------------------------------------------- my turn
  async myTurn() {
    const me = this.sides.me;
    const them = this.isles.them;
    this.d.ui?.mode?.('watch', { who: 'me', weather: this.weather });
    this.frame('them', 1100);
    await this.wait(1150);
    this.weatherShow(them);
    // the mini-game: win it, and this turn has a bonus shot
    const bonus = this.d.ui?.mini ? await this.d.ui.mini() : false;
    let shots = bonus ? 2 : 1;
    while (shots > 0 && !this.over) {
      shots -= 1;
      const choice = await this.d.ui.pick({ fruit: me.fruit, bonus: shots > 0, weather: this.weather, fire: me.combo.fire });
      if (this.over || !choice) return;
      if (choice === 'herbou') {
        const hb = await this.herbou();
        if (this.live) this.d.net.send({ t: 'herbou', rating: hb.rating, x: hb.dx });
        if (shots > 0) {
          this.frame('them', 900);
          await this.wait(950);
        }
        continue;
      }
      const res = await this.shoot(choice);
      if (this.over) return;
      if (!res) {
        shots += 1;   // (cancelled: choose again)
        continue;
      }
      if (this.live) this.d.net.send({ t: 'shot', fruit: choice, row: res.row, hit: res.hit, ix: res.ix - them.ox, iy: res.iy, short: !!res.short, over: !!res.over, wide: !!res.wide });
      await this.resolve('me', choice, res);
      if (winner(this.isles.me.state, them.state, this.turn)) break;
    }
    if (this.live) this.d.net.send({ t: 'end', turn: this.turn });
    this.weatherClear();
  }

  /** A friend's turn: their shots come in as their game saw them land, on your castle; their Herbou on theirs. */
  async liveTurn() {
    const mine = this.isles.me;
    this.d.ui?.mode?.('watch', { who: 'them', weather: this.weather });
    this.frame('me', 1100);
    await this.wait(1150);
    for (;;) {
      const m = await this.d.net.next(['shot', 'herbou', 'end']);
      if (this.over) return;
      if (m.t === 'gone') {
        await this.finish(true, true);
        return;
      }
      if (m.t === 'end') return;
      if (m.t === 'herbou') {
        await this.theirHerbou(m.rating, m.x | 0);
        continue;
      }
      const aim = { ix: mine.ox + (Number(m.ix) || 0), iy: Number(m.iy) || 0, hit: ['P', 'G', 'S', 'X'].includes(m.hit) ? m.hit : 'X', row: Number.isInteger(m.row) ? m.row : null, short: !!m.short, over: !!m.over, wide: !!m.wide };
      if (aim.hit !== 'X' && aim.row == null) aim.hit = 'X';
      const fruit = ['druiwe', 'piesang', 'sap', 'waatlemoen'].includes(m.fruit) ? m.fruit : 'druiwe';
      await this.launch(fruit, { x: this.scale.width * 0.85, y: this.H * 0.9 }, aim);
      await this.resolve('them', fruit, aim);
      if (winner(mine.state, this.isles.them.state, this.turn)) return;
    }
  }

  /** Their Herbou (seen from your side): the camera on their castle, the block lands (or falls), back to yours. */
  async theirHerbou(rating, dx) {
    const them = this.isles.them;
    this.frame('them', 800);
    await this.wait(850);
    const added = rebuild(them.state, rating);
    const top = this.castleTop(them);
    const x = them.ox + GAME_W / 2 + Math.max(-60, Math.min(60, dx));
    if (added > 0) this.addRow(them, x, top, added, rating);
    else {
      this.water?.splash?.(x);
      this.pop(x, top - 80, 'MIS!', '#ffb36b', 48);
    }
    this.counts();
    await this.wait(1200);
    this.frame('me', 800);
    await this.wait(850);
  }

  /** A new row on top of a castle (Herbou): its block, its people moving in, the flag up a floor. */
  addRow(isle, x, top, added, rating) {
    const s = CASTLE_SPOT.s;
    const spec = { shape: 'plank', color: (this.turn * 3 + (isle === this.isles.me ? 0 : 1)) % PALETTE.length, scale: 1 };
    const key = ensureTexture(this, spec);
    const g = getGeometry(spec);
    const f = { shape: 'plank', color: spec.color, dx: 0, tilt: 0, n: added };
    const bottom = top + 1;
    const img = this.add.image(x, bottom + PAD * s, key).setOrigin(0.5, 1).setScale(s).setDepth(CASTLE_SPOT.depth);
    const win = this.add.image(img.x, img.y, '__DEFAULT').setOrigin(0.5, 1).setScale(s).setDepth(CASTLE_SPOT.depth + 0.01);
    const b = { img, win, g, fi: isle.castle.blocks.length, f, x: img.x, bottom, s, depth: CASTLE_SPOT.depth, who: [], gold: [], stars: [], row: isle.state.rows.length - 1, castle: true };
    for (let i = 0; i < added; i++) b.who[i] = isle.cast.next().who;
    isle.castle.blocks.push(b);
    this.paintBlock(b, isle.town.tribe);
    audio.play('perfect', { combo: 3 });
    this.pop(img.x, bottom - 90, `${rating === 'P' ? 'PERFEK!' : 'GOED!'} +${added}`, '#ffd23f', 56);
    if (isle.flag) this.tweens.add({ targets: isle.flag, y: isle.flag.y - g.h * s, duration: 300 });
  }

  /** The fruit's own skill; resolves where it landed: { ix, iy, hit, row } (hit 'X': a miss), or null (cancelled). */
  async shoot(kind) {
    this.d.ui?.mode?.('aim', { fruit: kind, weather: this.weather });
    const aim = kind === 'druiwe' ? await this.aimSling()
      : kind === 'piesang' ? await this.aimBanana()
        : kind === 'sap' ? await this.aimJuice()
          : await this.aimMelon();
    if (!aim) return null;
    const f = this.sides.me.fruit;
    if (f[kind] !== Infinity) f[kind] = Math.max(0, (f[kind] | 0) - 1 + (aim.caught ? 1 : 0));
    this.d.ui?.used?.(kind, aim.caught);
    return aim;
  }

  /** Where a shot ends up on their castle from the aim (`hf`: the height as a share of the castle; `ix` across). */
  land(isle, kind, hf, ix) {
    const top = this.castleTop(isle);
    let x = ix + this.weather.wind * WIND_PX * HEAVY[kind];
    if (this.weather.storm) x += (this.rand() - 0.5) * 70;   // (the wind turns while it flies)
    const y = top * hf;   // (0 the base, `top` the castle's top: negative upwards)
    const row = this.rowAtPoint(isle, isle.ox + GAME_W / 2, y);
    if (hf < 0 || hf > 1 || row == null) return { ix: x, iy: y, hit: 'X', row: null, short: hf < 0, over: hf > 1 };
    const box = this.rowBox(isle, row);
    const hit = rateImpact({ dx: (x - box.x) / box.hw, dy: (y - box.y) / (box.hh * 2), rain: this.weather.rain });
    return { ix: x, iy: y, hit, row: hit === 'X' ? null : row, wide: hit === 'X' };
  }

  /** The slingshot right in front of the camera (screen-fixed): its tips, the pouch's rest, and pulling it. */
  slingRig() {
    const W = this.scale.width;
    const at = this.onScreen(W / 2, this.H - (this.trayBar || this.H * 0.17) - 140);
    const k = at.k;
    const sling = this.add.image(at.x, at.y, 'slag_sling').setScrollFactor(0).setDepth(DEPTH.fxScreen).setScale(0.82 * k);
    const tipL = { x: at.x + (42 - 120) * 0.82 * k, y: at.y + (34 - 165) * 0.82 * k };
    const tipR = { x: at.x + (198 - 120) * 0.82 * k, y: at.y + (34 - 165) * 0.82 * k };
    const rest = { x: at.x, y: tipL.y + 30 * k };
    const bands = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.5);
    const ammo = this.add.image(rest.x, rest.y, this.emo('🍇', 84)).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.6).setScale(0.9 * k);
    const pull = (p) => {
      bands.clear();
      bands.lineStyle(9 * k, 0x7a1f12, 1);
      bands.lineBetween(tipL.x, tipL.y, p.x - 18 * k, p.y);
      bands.lineBetween(tipR.x, tipR.y, p.x + 18 * k, p.y);
      bands.fillStyle(0x3a1d08, 1).fillEllipse(p.x, p.y + 6 * k, 60 * k, 30 * k);
      ammo.setPosition(p.x, p.y - 8 * k);
    };
    pull(rest);
    return { sling, bands, ammo, rest, pull, k, destroy: () => { sling.destroy(); bands.destroy(); ammo.destroy(); } };
  }

  /** Listens to the canvas while aiming; `off()` ends it (and the screen's ✕ cancels: `cancel`). */
  listen(handlers, cancel) {
    for (const [ev, fn] of Object.entries(handlers)) this.input.on(ev, fn);
    let done = false;
    const off = () => {
      if (done) return;
      done = true;
      for (const [ev, fn] of Object.entries(handlers)) this.input.off(ev, fn);
    };
    this.d.ui?.aimHook?.((h) => { if (h === 'cancel' && !done) { off(); cancel(); } });
    return off;
  }

  /** 🍇 Pull back and let go: the pull's length is the height, its side the other side; hold too long and the hand shakes. */
  aimSling() {
    return new Promise((resolve) => {
      const isle = this.isles.them;
      const rig = this.slingRig();
      const dots = [];
      for (let i = 0; i < 3; i++) dots.push(this.add.circle(0, 0, (6 - i) * rig.k, 0xffffff, 0.85 - i * 0.2).setScrollFactor(0).setDepth(DEPTH.fxScreen - 0.4).setVisible(false));
      let down = null;
      let at0 = 0;
      let cur = null;
      const clean = () => { rig.destroy(); dots.forEach((dt) => dt.destroy()); };
      // (the pull is measured from wherever the finger came down: touch anywhere, pull back towards you, let go)
      const move = (p) => {
        if (!down) return;
        const s = this.onScreen(p.x, p.y);
        let v = { x: s.x - down.x, y: s.y - down.y };
        const len = Math.hypot(v.x, v.y);
        const max = MAX_PULL * rig.k;
        if (len > max) v = { x: (v.x / len) * max, y: (v.y / len) * max };
        // the longer you hold, the more the hand shakes
        const held = this.time.now - at0;
        const shake = held > SHAKE_AFTER ? Math.min(18, (held - SHAKE_AFTER) / 80) * rig.k : 0;
        cur = { x: rig.rest.x + v.x + (this.rand() - 0.5) * shake, y: rig.rest.y + v.y + (this.rand() - 0.5) * shake };
        rig.pull(cur);
        // only the start of the aim: three dots the other way
        const dir = { x: rig.rest.x - cur.x, y: rig.rest.y - cur.y };
        dots.forEach((dt, i) => dt.setPosition(rig.rest.x + dir.x * (0.5 + i * 0.32), rig.rest.y + dir.y * (0.5 + i * 0.32)).setVisible(Math.hypot(dir.x, dir.y) > 20));
      };
      const tick = () => { if (down && cur) move({ x: this.input.activePointer.x, y: this.input.activePointer.y }); };
      this.events.on('update', tick);
      const off = this.listen({
        pointerdown: (p) => {
          down = this.onScreen(p.x, p.y);
          at0 = this.time.now;
          cur = { ...rig.rest };
          audio.play('creak');
        },
        pointermove: move,
        pointerup: () => {
          if (!down) return;
          down = null;
          const v = cur ? { x: cur.x - rig.rest.x, y: cur.y - rig.rest.y } : { x: 0, y: 0 };
          const len = Math.hypot(v.x, v.y) / rig.k;
          if (len < 30) {
            rig.pull(rig.rest);
            return;   // (a small pull is no shot)
          }
          off();
          this.events.off('update', tick);
          const power = Math.max(0, Math.min(1, (len - 30) / (MAX_PULL - 30)));
          const hf = Math.pow(power, 1.5) * 1.32 - 0.1;   // (not a straight line: it takes feel)
          const ix = isle.ox + GAME_W / 2 + (-v.x / rig.k) * 0.95;
          audio.play('drop');
          haptics.tap();
          const res = this.land(isle, 'druiwe', hf, ix);
          rig.pull(rig.rest);
          rig.ammo.setVisible(false);
          dots.forEach((dt) => dt.setVisible(false));
          this.launch('druiwe', rig.rest, res, { fire: this.sides.me.combo.fire }).then(() => {
            clean();
            resolve(res);
          });
        },
      }, () => {
        this.events.off('update', tick);
        clean();
        resolve(null);
      });
    });
  }

  /** 🍌 Swipe up to throw: the swipe's angle is the height, its speed must be just right (too slow or fast: past the castle). */
  aimBanana() {
    return new Promise((resolve) => {
      const isle = this.isles.them;
      const W = this.scale.width;
      const hold = this.onScreen(W / 2, this.H - (this.trayBar || this.H * 0.17) - 110);
      const ban = this.add.image(hold.x, hold.y, this.emo('🍌', 96)).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.6).setScale(1.1 * hold.k);
      const wob = this.tweens.add({ targets: ban, angle: 12, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      let start = null;
      const off = this.listen({
        pointerdown: (p) => { start = { x: p.x, y: p.y, t: this.time.now }; },
        pointerup: (p) => {
          if (!start) return;
          const s = { x: p.x - start.x, y: p.y - start.y };
          const dt = Math.max(30, this.time.now - start.t);
          start = null;
          const len = Math.hypot(s.x, s.y);
          if (len < 60 || s.y > -10) return;   // (a swipe upwards throws)
          off();
          const speed = len / dt;
          const angle = Math.atan2(-s.y, Math.abs(s.x)) / (Math.PI / 2);   // 0 flat .. 1 straight up
          const hf = angle * 1.25 - 0.12;
          const ix = isle.ox + GAME_W / 2 + (speed - BANANA_SPEED) * BANANA_SPREAD + Math.sign(s.x || 1) * 16;
          audio.play('drop');
          const res = this.land(isle, 'piesang', hf, ix);
          wob.stop();
          ban.destroy();
          this.launch('piesang', hold, res, { side: Math.sign(s.x || 1), fire: this.sides.me.combo.fire }).then(async () => {
            // on its way back: tap it to catch it (you keep the banana)
            res.caught = await this.boomerangBack(hold);
            resolve(res);
          });
        },
      }, () => {
        wob.stop();
        ban.destroy();
        resolve(null);
      });
    });
  }

  /** The banana comes back: a ring near your thumb for a moment; a tap inside catches it. */
  boomerangBack(hold) {
    return new Promise((resolve) => {
      const k = hold.k;
      const b = this.add.image(hold.x + 260 * k, hold.y - 420 * k, this.emo('🍌', 96)).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.6).setScale(0.6 * k);
      const ring = this.add.circle(hold.x, hold.y, 70 * k, 0xffd23f, 0.18).setStrokeStyle(5 * k, 0xffd23f).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.5).setAlpha(0);
      let done = false;
      let catchable = false;
      const end = (ok) => {
        if (done) return;
        done = true;
        this.input.off('pointerdown', tap);
        if (ok) {
          audio.play('caught');
          haptics.perfect();
          this.pop(this.cam.midPoint.x, this.cam.midPoint.y + 160, 'GEVANG! +🍌', '#ffe38c', 48);
        }
        this.tweens.add({ targets: [b, ring], alpha: 0, duration: 200, onComplete: () => { b.destroy(); ring.destroy(); } });
        resolve(ok);
      };
      const tap = (p) => {
        const s = this.onScreen(p.x, p.y);
        if (catchable && Math.hypot(s.x - b.x, s.y - b.y) < 120 * k) end(true);
      };
      this.tweens.add({ targets: b, x: hold.x, y: hold.y, angle: 720, scale: 1.1 * k, duration: 700, ease: 'Sine.easeIn' });
      this.tweens.add({ targets: ring, alpha: 1, duration: 200, delay: 450, onStart: () => { catchable = true; } });
      this.input.on('pointerdown', tap);
      this.time.delayedCall(700 + CATCH_MS, () => end(false));
    });
  }

  /** 🧃 Two taps: the straw swings (tap: the direction), then the pressure pumps (tap: how far it squirts). */
  aimJuice() {
    return new Promise((resolve) => {
      const isle = this.isles.them;
      const W = this.scale.width;
      const at = this.onScreen(W / 2, this.H - (this.trayBar || this.H * 0.17) - 120);
      const k = at.k;
      const box = this.add.image(at.x, at.y, this.emo('🧃', 110)).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.6).setScale(1.15 * k);
      const arrow = this.add.rectangle(at.x, at.y - 70 * k, 10 * k, 120 * k, 0xffffff, 0.9).setOrigin(0.5, 1).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.5);
      const barBg = this.add.rectangle(at.x + 110 * k, at.y, 26 * k, 200 * k, 0x000000, 0.45).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.5).setVisible(false);
      const bar = this.add.rectangle(at.x + 110 * k, at.y + 100 * k, 20 * k, 2, 0xff9f1c, 1).setOrigin(0.5, 1).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.6).setVisible(false);
      let step = 1;
      let phi = 0;
      let pressure = 0;
      let p0 = 0;
      const t0 = this.time.now;
      const tick = () => {
        const t = (this.time.now - t0) / 1000;
        if (step === 1) {
          phi = Math.sin(t * 2.6) * 0.62;   // (radians from straight up)
          arrow.setRotation(phi);
        } else if (step === 2) {
          pressure = (1 - Math.cos((t - p0) * 3.6)) / 2;
          bar.setSize(20 * k, Math.max(2, pressure * 200 * k));
        }
      };
      this.events.on('update', tick);
      const parts = [arrow, barBg, bar];
      let off = null;
      const go = () => {
        off = this.listen({
          pointerdown: () => {
            if (step === 1) {
              step = 2;
              p0 = (this.time.now - t0) / 1000;
              barBg.setVisible(true);
              bar.setVisible(true);
              audio.play('click');
              return;
            }
            if (step !== 2) return;
            step = 3;
            off();
            this.events.off('update', tick);
            const hf = pressure * 1.3 - 0.14;
            const ix = isle.ox + GAME_W / 2 + Math.sin(phi) * 300;
            audio.play('splash');
            const res = this.land(isle, 'sap', hf, ix);
            parts.forEach((o) => o.destroy());
            this.tweens.add({ targets: box, scaleX: 1.35 * k, scaleY: 0.85 * k, duration: 120, yoyo: true });
            this.launch('sap', at, res).then(() => {
              box.destroy();
              resolve(res);
            });
          },
        }, () => {
          this.events.off('update', tick);
          parts.forEach((o) => o.destroy());
          box.destroy();
          resolve(null);
        });
      };
      this.time.delayedCall(250, go);
    });
  }

  /** 🍉 The catapult's arm swings, faster and faster: tap at the right moment (the arm's angle is the height). */
  aimMelon() {
    return new Promise((resolve) => {
      const isle = this.isles.them;
      const W = this.scale.width;
      const at = this.onScreen(W / 2, this.H - (this.trayBar || this.H * 0.17) - 60);
      const k = at.k;
      const arm = this.add.rectangle(at.x, at.y, 22 * k, 210 * k, 0x8a5428, 1).setOrigin(0.5, 1).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.5).setStrokeStyle(3 * k, 0x3a1d08);
      const base = this.add.rectangle(at.x, at.y + 6 * k, 170 * k, 28 * k, 0x5a3214, 1).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.6).setStrokeStyle(3 * k, 0x2b1606);
      const melon = this.add.image(at.x, at.y - 210 * k, this.emo('🍉', 96)).setScrollFactor(0).setDepth(DEPTH.fxScreen + 0.7).setScale(0.95 * k);
      const t0 = this.time.now;
      let a = 0;
      const tick = () => {
        const t = (this.time.now - t0) / 1000;
        const w = 2.2 + Math.min(2.2, t * 0.45);   // (faster and faster)
        a = Math.sin(t * w);
        arm.setRotation(a * 0.95);
        melon.setPosition(at.x + Math.sin(a * 0.95) * 210 * k, at.y - Math.cos(a * 0.95) * 210 * k);
      };
      this.events.on('update', tick);
      this.time.delayedCall(300, () => {
        const off = this.listen({
          pointerdown: () => {
            off();
            this.events.off('update', tick);
            const hf = ((a + 1) / 2) * 1.3 - 0.14;
            const ix = isle.ox + GAME_W / 2 + (this.rand() - 0.5) * 20;
            audio.play('creak');
            haptics.heavy();
            const res = this.land(isle, 'waatlemoen', hf, ix);
            const from = { x: melon.x, y: melon.y };
            melon.destroy();
            this.tweens.add({ targets: arm, rotation: 0, duration: 160, ease: 'Back.easeOut' });
            this.launch('waatlemoen', from, res, { fire: this.sides.me.combo.fire }).then(() => {
              arm.destroy();
              base.destroy();
              resolve(res);
            });
          },
        }, () => {
          this.events.off('update', tick);
          for (const o of [arm, base, melon]) o.destroy();
          resolve(null);
        });
      });
    });
  }

  /** The fruit flies from the launcher (screen) to where it lands (world), smaller as it goes; a miss falls in the sea. */
  launch(kind, fromScreen, res, { side = 1, fire = false } = {}) {
    return new Promise((resolve) => {
      const from = this.cam.getWorldPoint(fromScreen.x, fromScreen.y);
      const end = { x: res.ix, y: res.short ? this.seaY + 10 : res.over ? res.iy - 160 : res.iy };
      const img = this.add.image(from.x, from.y, this.emo(FRUIT[kind], 96)).setDepth(DEPTH.fxWorld + 2).setScale(1.3);
      const apex = { x: (from.x + end.x) / 2 + (kind === 'piesang' ? side * 170 : 0), y: Math.min(from.y, end.y) - (kind === 'waatlemoen' ? 380 : 260) };
      const t = { p: 0 };
      const trail = kind === 'sap' || fire;
      this.tweens.add({
        targets: t, p: 1, duration: this.reduced ? 120 : kind === 'waatlemoen' ? 1150 : 900, ease: 'Sine.easeIn',
        onUpdate: () => {
          const p = t.p;
          const q = 1 - p;
          img.x = q * q * from.x + 2 * q * p * apex.x + p * p * end.x;
          img.y = q * q * from.y + 2 * q * p * apex.y + p * p * end.y;
          img.setScale(1.3 - 0.75 * p);
          img.rotation += kind === 'piesang' ? 0.5 : 0.08;
          if (trail && this.rand() < 0.7) {
            const dot = this.add.image(img.x, img.y, kind === 'sap' ? 'slag_drop' : this.emo('🔥', 40)).setDepth(DEPTH.fxWorld + 1).setScale(0.5).setTint(kind === 'sap' ? 0xff9f1c : 0xffffff);
            this.tweens.add({ targets: dot, alpha: 0, scale: 0.1, duration: 420, onComplete: () => dot.destroy() });
          }
        },
        onComplete: () => {
          if (res.hit === 'X') {
            if (res.short || res.wide || !res.over) {
              this.water?.splash?.(img.x);
              audio.play('splash');
            }
            this.tweens.add({ targets: img, y: this.seaY + 30, alpha: 0, duration: 420, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
          } else {
            img.destroy();
          }
          resolve();
        },
      });
    });
  }

  /** A shot that landed (or missed): the rules, then what everyone sees and hears; Blouaap's catch flies back. */
  async resolve(by, kind, aim) {
    const att = this.sides[by];
    const def = by === 'me' ? this.isles.them : this.isles.me;
    if (aim.hit === 'X') {
      att.combo = nextCombo(att.combo, { landed: false });
      this.pop(aim.ix, Math.min(aim.iy, -40), 'MIS!', '#ffffff', 56);
      audio.play('lost');
      this.d.ui?.shot?.({ by, kind, hit: 'X' });
      await this.wait(900);
      return;
    }
    const fire = att.combo.fire;
    const res = applyShot(def.state, { fruit: kind, row: aim.row, hit: aim.hit, fire });
    att.combo = nextCombo({ n: fire ? 0 : att.combo.n }, { landed: !res.countered && res.lost > 0 });
    const label = { P: ['PERFEK!', '#ffd23f'], G: ['GOED!', '#ffffff'], S: ['SKEEF!', '#ffb36b'] }[aim.hit];
    this.pop(aim.ix, aim.iy - 60, fire ? `🔥 ${label[0]}` : label[0], label[1], aim.hit === 'P' ? 64 : 52);
    if (res.countered) {
      await this.counterShow(def, res.countered, aim.row, kind);
      if (res.back) await this.bananaBack(by === 'me' ? 'me' : 'them');
    }
    this.impact(def, kind, aim, res, fire);
    if (res.cracked.length) this.time.delayedCall(250, () => this.pop(aim.ix + 40, aim.iy - 120, 'SWAKPLEK ×2!', '#ff8a5c', 40));
    if (att.combo.fire) this.time.delayedCall(500, () => this.pop(this.cam.midPoint.x, this.cam.midPoint.y - 120, '🔥 VUURSKOOT!', '#ff9f1c', 54));
    this.counts();
    this.d.ui?.shot?.({ by, kind, hit: aim.hit, lost: res.lost, countered: res.countered, fire: att.combo.fire });
    await this.wait(kind === 'waatlemoen' ? 1700 : 1300);
  }

  /** What a hit does to the castle: splats, cracks, a whole row cleared, people jumping into the sea. */
  impact(isle, kind, aim, res, fire = false) {
    if (!res.hits.length) return;
    const big = kind === 'waatlemoen';
    audio.play(kind === 'sap' ? 'splash' : big ? 'thunder' : 'land');
    haptics.heavy();
    this.cam.shake(big ? 520 : 260, big ? 0.012 : 0.005);
    if (big && !this.reduced) {
      this.time.timeScale = 0.45;
      this.tweens.timeScale = 0.45;
      this.time.delayedCall(260, () => { this.time.timeScale = 1; this.tweens.timeScale = 1; });
    }
    this.splat(kind, aim.ix, aim.iy, big ? 1.1 : 0.62);
    if (kind === 'sap') res.hits.forEach((h) => { const bx = this.rowBox(isle, h.row); if (bx) this.flood(bx); });
    if (kind === 'piesang') {
      const bx = this.rowBox(isle, aim.row);
      if (bx) this.slash(bx);
    }
    if (kind === 'druiwe') this.grapeBurst(aim.ix, aim.iy);
    if (big) this.seedBurst(aim.ix, aim.iy);
    if (fire) burnRoom(this, aim.ix, aim.iy, { w: 60, h: 44, ms: 1400 });
    for (const h of res.hits) this.peopleOut(isle, h.row, h.lost);
  }

  /** `n` people leave row `r` (their windows go dark, they jump with parachutes); a crack; an empty row turns grey. */
  peopleOut(isle, r, n) {
    const box = this.rowBox(isle, r);
    if (!box) return;
    const b = box.b;
    let left = n;
    let k = 0;
    for (let i = b.who.length - 1; i >= 0 && left > 0; i--) {
      if (!b.who[i]) continue;
      const who = b.who[i];
      b.who[i] = null;
      left -= 1;
      const w = this.windowAt(b, i);
      this.time.delayedCall(80 * k++, () => parachute(this, w.x, w.y, who, { dir: w.x < box.x ? -1 : 1, seaY: this.seaY }));
    }
    this.paintBlock(b, isle.town.tribe);
    if (!b.crack) b.crack = this.add.image(b.x, box.y, 'slag_crack').setDepth(b.depth + 0.02).setDisplaySize(box.hw * 1.7, box.hh * 1.6).setAlpha(0.85);
    if ((isle.state.rows[r]?.people | 0) <= 0) b.img.setTint(0x8f8f9a);
  }

  flood(box) {
    const f = this.add.rectangle(box.x, box.y + box.hh, box.hw * 2.1, 2, 0xff9f1c, 0.75).setOrigin(0.5, 1).setDepth(DEPTH.tower + 0.5);
    this.tweens.add({ targets: f, height: box.hh * 2.1, duration: 420, ease: 'Quad.easeOut', yoyo: true, hold: 500, onComplete: () => f.destroy() });
    for (let k = 0; k < 8; k++) {
      const d = this.add.image(box.x + (this.rand() - 0.5) * box.hw * 2, box.y, 'slag_drop').setDepth(DEPTH.fxWorld).setTint(0xff9f1c).setScale(0.4);
      this.tweens.add({ targets: d, y: d.y + 80 + this.rand() * 60, alpha: 0, duration: 700, delay: 300, onComplete: () => d.destroy() });
    }
  }

  slash(box) {
    const g = this.add.rectangle(box.x - box.hw - 30, box.y, 8, box.hh * 1.6, 0xffe38c, 0.95).setDepth(DEPTH.fxWorld).setOrigin(0.5);
    this.tweens.add({ targets: g, x: box.x + box.hw + 30, width: 40, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
    audio.play('shoo');
  }

  grapeBurst(x, y) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const gr = this.add.circle(x, y, 6 + this.rand() * 4, 0x7b2fbf, 1).setDepth(DEPTH.fxWorld);
      this.tweens.add({ targets: gr, x: x + Math.cos(a) * (60 + this.rand() * 50), y: y + Math.sin(a) * 50 + 70, alpha: 0, duration: 650, ease: 'Quad.easeOut', onComplete: () => gr.destroy() });
    }
  }

  seedBurst(x, y) {
    for (let k = 0; k < 18; k++) {
      const a = this.rand() * Math.PI * 2;
      const sd = this.add.ellipse(x, y, 6, 9, 0x1d1d1d, 1).setDepth(DEPTH.fxWorld);
      this.tweens.add({ targets: sd, x: x + Math.cos(a) * (90 + this.rand() * 90), y: y + Math.sin(a) * 90 + 60, angle: 360, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => sd.destroy() });
    }
  }

  /** A defender catches it: their badge jumps, the word, the sound (theirs stay shown from now on). */
  async counterShow(isle, id, row, kind) {
    const side = isle === this.isles.me ? 'me' : 'them';
    this.showDefenders(isle, side === 'me' ? DEFENDER_IDS : isle.state.revealed);
    const bd = this.badges[side][id];
    const box = this.rowBox(isle, row);
    if (bd && box) {
      bd.setDepth(DEPTH.fxScreen);
      this.tweens.add({ targets: bd, x: box.x, scale: 1.4, duration: 260, ease: 'Back.easeOut', yoyo: true, hold: 520 });
      const fr = this.add.image(box.x, box.y, this.emo(FRUIT[kind], 64)).setDepth(DEPTH.fxScreen + 0.1).setScale(0.7);
      this.tweens.add({ targets: fr, scale: id === 'joe' ? 0.1 : 0.8, alpha: id === 'joe' ? 0 : 1, y: box.y - 20, duration: 500, onComplete: () => fr.destroy() });
      if (id === 'joe') this.time.delayedCall(700, () => this.tweens.add({ targets: bd, scale: 0.85, duration: 300 }));
    }
    audio.play(id === 'joe' ? 'heat' : id === 'aap' ? 'monkey' : 'caught');
    this.pop(box ? box.x : this.cam.midPoint.x, (box ? box.y : 0) - 90, COUNTER_WORD[id], '#9fffb0', 56);
    if (id === 'joe' && box) this.time.delayedCall(900, () => this.pop(box.x + 50, box.y - 130, 'BURP!', '#ffe38c', 40));
    await this.wait(1100);
  }

  /** Blouaap throws the banana back at the thrower's castle (a row at random, a Goed hit). */
  async bananaBack(toSide) {
    const isle = this.isles[toSide];
    const back = toSide === 'me' ? 'them' : 'me';
    this.frame(toSide, 800);
    await this.wait(850);
    // (at their fullest row: both games pick the same one)
    let row = 0;
    isle.state.rows.forEach((r, i) => { if (r.people > isle.state.rows[row].people) row = i; });
    const box = this.rowBox(isle, row);
    const aim = { ix: box.x, iy: box.y, hit: 'G', row };
    await this.launch('piesang', { x: this.scale.width * 0.9, y: this.H * 0.2 }, aim, { side: -1 });
    const res = applyShot(isle.state, { fruit: 'piesang', row, hit: 'G' });
    this.pop(box.x, box.y - 60, 'TERUG!', '#ffe38c', 56);
    this.impact(isle, 'piesang', aim, res);
    this.counts();
    await this.wait(1100);
    this.frame(back, 800);
    await this.wait(850);
  }

  // ------------------------------------------------------------------------------------------------------- herbou
  /** 🏗️ A block swings over your own castle: tap to drop it; a Perfek brings 4 people, a Goed 2, the rest falls off. */
  async herbou() {
    const me = this.isles.me;
    this.d.ui?.mode?.('herbou', {});
    this.frame('me', 900);
    await this.wait(950);
    const top = this.castleTop(me);
    const cx = me.ox + GAME_W / 2;
    const spec = { shape: 'plank', color: (this.turn * 3) % PALETTE.length, scale: 1 };
    const key = ensureTexture(this, spec);
    const g = getGeometry(spec);
    const s = CASTLE_SPOT.s;
    const y0 = top - 200;
    const rope = this.add.rectangle(cx, y0 - 320, 4, 300, 0x2b2b2b, 1).setOrigin(0.5, 0).setDepth(DEPTH.fxWorld);
    const blk = this.add.image(cx, y0, key).setOrigin(0.5, 1).setScale(s).setDepth(DEPTH.fxWorld + 0.1);
    const t0 = this.time.now;
    let x = cx;
    const tick = () => {
      const t = (this.time.now - t0) / 1000;
      x = cx + Math.sin(t * (2.4 + t * 0.15)) * 120;
      blk.x = x;
      rope.x = x;
    };
    this.events.on('update', tick);
    const rating = await new Promise((resolve) => {
      this.time.delayedCall(300, () => {
        const off = this.listen({
          pointerdown: () => {
            off();
            this.events.off('update', tick);
            const offc = Math.abs(x - cx);
            resolve(offc <= 7 ? 'P' : offc <= 20 ? 'G' : offc <= 44 ? 'S' : 'X');
          },
        }, () => {
          this.events.off('update', tick);
          resolve('X');
        });
      });
    });
    rope.destroy();
    const lands = rating === 'P' || rating === 'G';
    await new Promise((res) => this.tweens.add({ targets: blk, y: lands ? top + 2 : this.seaY + 40, angle: lands ? 0 : (x > cx ? 40 : -40), duration: 420, ease: 'Quad.easeIn', onComplete: res }));
    const added = rebuild(me.state, rating);
    blk.destroy();
    if (added > 0) {
      haptics.perfect();
      this.addRow(me, x, top, added, rating);
      this.counts();
    } else {
      this.water?.splash?.(x);
      this.pop(x, top - 80, rating === 'S' ? 'SKEEF: DIT VAL!' : 'MIS!', '#ffb36b', 48);
      audio.play('lost');
    }
    await this.wait(1100);
    return { rating, dx: Math.round(x - cx) };
  }

  // ----------------------------------------------------------------------------------------------------- the weather
  /** This turn's weather over their castle: the wind's leaves, rain, fog over its top half. */
  weatherShow(isle) {
    this.weatherClear();
    const w = this.weather;
    if (!w) return;
    const W = this.scale.width;
    if (w.wind && !this.reduced) {
      for (let k = 0; k < 10; k++) {
        const leaf = this.add.image(0, 0, this.emo(k % 2 ? '🍃' : '🍂', 40)).setScrollFactor(0).setDepth(DEPTH.weather).setScale(0.5).setAlpha(0.85);
        const y = this.H * (0.25 + 0.5 * this.rand());
        const dir = Math.sign(w.wind);
        const go = () => {
          if (!leaf.active) return;
          leaf.setPosition(dir > 0 ? -40 : W + 40, y + (this.rand() - 0.5) * 200);
          this.tweens.add({ targets: leaf, x: dir > 0 ? W + 40 : -40, angle: 360 * dir, duration: 4200 / Math.abs(w.wind) + this.rand() * 1500, onComplete: go });
        };
        this.time.delayedCall(k * 380, go);
        this.weatherFx.push(leaf);
      }
    }
    if (w.rain && !this.reduced) {
      for (let k = 0; k < 40; k++) {
        const drop = this.add.rectangle(this.rand() * W, -20, 2, 18, 0xcfe8ff, 0.7).setScrollFactor(0).setDepth(DEPTH.weather).setAngle(w.wind * 4);
        const go = () => {
          if (!drop.active) return;
          drop.setPosition(this.rand() * W, -20);
          this.tweens.add({ targets: drop, y: this.H + 20, x: drop.x + w.wind * 40, duration: 700 + this.rand() * 300, onComplete: go });
        };
        this.time.delayedCall(this.rand() * 700, go);
        this.weatherFx.push(drop);
      }
    }
    if (w.fog) {
      if (!this.textures.exists('slag_fog')) {
        const t = this.textures.createCanvas('slag_fog', 256, 256);
        const c = t.getContext();
        const g = c.createRadialGradient(128, 128, 10, 128, 128, 126);
        g.addColorStop(0, 'rgba(245,240,255,0.9)');
        g.addColorStop(0.6, 'rgba(245,240,255,0.55)');
        g.addColorStop(1, 'rgba(245,240,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 256, 256);
        t.refresh();
      }
      // puffs of mist over the castle's top half, drifting with the wind
      const top = this.castleTop(isle);
      const cx = isle.ox + GAME_W / 2;
      for (let k = 0; k < 9; k++) {
        const puff = this.add.image(cx + (k - 4) * 70 + (this.rand() - 0.5) * 40, top * (0.45 + this.rand() * 0.55), 'slag_fog')
          .setDepth(DEPTH.fxWorld + 3).setScale(1.3 + this.rand() * 0.8, 0.9 + this.rand() * 0.5).setAlpha(0);
        this.tweens.add({ targets: puff, alpha: 0.85, duration: 600, delay: k * 60 });
        if (!this.reduced) this.tweens.add({ targets: puff, x: puff.x + (w.wind || 1) * 24, duration: 3000 + k * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.weatherFx.push(puff);
      }
    }
  }

  weatherClear() {
    for (const o of this.weatherFx || []) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.weatherFx = [];
  }

  // ------------------------------------------------------------------------------------------------------ Rikus
  /** Robot Rikus's turn: the camera on your castle; maybe a bonus shot (his mini-game); his fruit flies in. */
  async botTurn() {
    const bot = this.sides.them;
    const mine = this.isles.me;
    this.d.ui?.mode?.('watch', { who: 'them', weather: this.weather });
    this.frame('me', 1100);
    await this.wait(1300);
    let shots = this.rand() < 0.3 ? 2 : 1;
    if (shots === 2) {
      this.pop(this.cam.midPoint.x, this.cam.midPoint.y - 220, `${bot.name}: +1 SKOOT`, '#c4b5fd', 44);
      await this.wait(900);
    }
    while (shots > 0 && !this.over) {
      shots -= 1;
      const s = botShot(mine.state, bot.fruit, { rand: this.rand, wind: this.weather.wind, turn: this.turn });
      if (s.fruit !== 'druiwe') bot.fruit[s.fruit] = Math.max(0, (bot.fruit[s.fruit] | 0) - 1);
      const box = this.rowBox(mine, s.row);
      const off = s.hit === 'X' ? (this.rand() < 0.5 ? -1 : 1) * (box.hw + 60) : s.hit === 'S' ? (this.rand() < 0.5 ? -1 : 1) * box.hw * 0.8 : s.hit === 'G' ? (this.rand() - 0.5) * box.hw : 0;
      const aim = { ix: box.x + off, iy: box.y, hit: s.hit, row: s.hit === 'X' ? null : s.row, wide: s.hit === 'X' };
      await this.launch(s.fruit, { x: this.scale.width * 0.85, y: this.H * 0.9 }, aim);
      await this.resolve('them', s.fruit, aim);
      if (winner(mine.state, this.isles.them.state, this.turn)) return;
    }
  }

  // --------------------------------------------------------------------------------------------------------- the end
  async finish(won, left = false) {
    if (this.over && !left) return;
    this.over = true;
    this.weatherClear();
    this.frame(won ? 'them' : 'me', 900);
    await this.wait(900);
    audio.play(won ? 'record' : 'gameover');
    this.d.ui?.end?.({ won, left, me: castlePeople(this.isles.me.state), them: castlePeople(this.isles.them.state), startThem: this.startPeople.them, turns: this.turn });
  }
}

export default SlagScene;
