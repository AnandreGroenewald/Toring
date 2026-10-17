// (1.16) Jou dorp in the game world. The owner (16 Oct 2026), shown the town on cards: "Nope, still not 'premium'", then
// "Again premium with a few more features. It needs to be really good please."; earlier the same day: "it needs to be part
// of the Stapel scenario". So the town stands on the island, over the game's own sea: real Stapel towers, built like
// buildings from your block skin with a roof on top, every person in a lit window with their face, golden people
// sparkling, your walls as cement along the shore and your tribe's flag on the tallest. A strooptog is a flight: the
// camera crosses the sea to the neighbour's island, a target sweeps over their town like the crane, the tap strikes
// (a Perfek on the glowing, fullest tower takes half again as many), your tribe hits (the battles' own Veldbrand,
// Waterwiel and Rankgryp), their people jump with parachutes and drift over the water into your dark windows, which
// light up one by one; then "+18 MENSE!" under turning light. "Terwyl jy weg was" plays the other way round.
// The rules are js/core/dorp.js; the screen over it (counts, neighbours, buttons) js/ui/dom.js; main.js starts it and
// asks the server at the tap (d.onStrike).

import { GAME_W, DEPTH, PALETTE } from '../config.js';
import { S } from '../core/strings.js';
import { audio, haptics } from '../audio.js';
import { Water } from '../game/water.js';
import { createIsland } from '../game/island.js';
import { getGeometry, ensureTexture } from '../game/blocks.js';
import { windowSlots, ensureWindows, dropWindows, burnRoom, waterWheel, vinesTo, prepareFx, whenPortraits, castOf, CAST, badgeKey, chuteTexture, portraitsReady } from '../game/residents.js';
import { createRng } from '../core/rng.js';
import { createCasting } from '../core/living.js';
import { markOf, cleanMarks } from '../core/dorp.js';

const PAD = 3;               // the block textures' padding (js/game/blocks.js)
const GAP = 1150;            // the neighbour's island, this far across the sea
const MAX_LIT = 150;         // lit windows drawn at most (a bigger town: each window holds more people)
const MAX_FLY = 14;          // people drawn flying over at most (the counts move by the true number)
const AIM_MS = 8000;         // no tap by then: the strike goes where the target is
const AIM_PERIOD = 1700;     // the target's sweep, there and back
const HIT_P = 16;            // the tap's distance from the glowing tower's middle: a Perfek within this...
const HIT_G = 52;            // ...a Goed within this; beyond, Skeef
// each tower is built like a building: blocks of one width class from the ground up, a roof block on top
const CLASSES = {
  wide: ['plank', 'slab', 'plank', 'slab', 'brick'],
  mid: ['slab', 'brick', 'brick', 'crate'],
  slim: ['brick', 'crate', 'cube', 'crate'],
};
const ROOFS = ['wedge', 'arch', 'wedge'];
// where the towers stand: the main one on the island's base, the others on the rocks behind it (depth below the rock)
export const SPOTS = [
  { dx: 0, y: 0, s: 0.5, depth: DEPTH.tower, main: true },
  { dx: -205, y: 18, s: 0.4, depth: DEPTH.island - 1 },
  { dx: 205, y: 18, s: 0.4, depth: DEPTH.island - 1 },
  { dx: -110, y: 8, s: 0.34, depth: DEPTH.island - 2, back: true },
  { dx: 110, y: 8, s: 0.34, depth: DEPTH.island - 2, back: true },
  { dx: -300, y: 30, s: 0.34, depth: DEPTH.island - 2, back: true },
  { dx: 300, y: 30, s: 0.34, depth: DEPTH.island - 2, back: true },
];
const FLAG = { vuur: 0xff6b2c, water: 0x2f9bff, gras: 0x35c84a };
// landmarks on land, in the order bought: on the base beside the main tower, then in front of the rocks
const LAND_SLOTS = [{ dx: -122, y: 0, s: 0.8 }, { dx: 122, y: 0, s: 0.8 }, { dx: -268, y: 26, s: 0.82 }, { dx: 268, y: 26, s: 0.82 }, { dx: -352, y: 34, s: 0.76 }];
const MARK_SIZE = 128;   // the landmarks' pictures (emoji drawn once, shadowed)
const TRIBE_EMOJI = { vuur: '🔥', water: '💧', gras: '🌿' };
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/**
 * The town's towers from its id, people and golden people: how many towers, which blocks, who lives in which window and
 * which of them are golden. The same town always has the same towers; more people, more and taller towers. Pure data.
 */
export function planTown({ id = 'TOWN', people = 0, tribe = 'vuur', gold = 0 } = {}) {
  const rng = createRng(`dorp/${id}`);
  const lit = Math.min(MAX_LIT, Math.max(0, people | 0));
  const nTowers = Math.max(3, Math.min(SPOTS.length, 3 + Math.floor(Math.log2(1 + people / 25))));
  // each tower's share of the lit windows (the main one the most), plus dark windows to spare
  const weights = SPOTS.slice(0, nTowers).map((sp) => (sp.main ? 2.2 : sp.back ? 0.8 : 1.2));
  const sum = weights.reduce((a, b) => a + b, 0);
  const casting = createCasting(`dorp/${id}`, tribe);
  const towers = [];
  let left = lit;
  for (let k = 0; k < nTowers; k++) {
    const want = k === nTowers - 1 ? left : Math.round((lit * weights[k]) / sum);
    left -= want;
    const need = Math.max(4, Math.ceil(want * 1.25) + 2);   // windows: the lit ones and some dark
    const floors = [];
    let wins = 0;
    const cls = CLASSES[k === 0 ? 'wide' : rng.pick(['wide', 'mid', 'mid', 'slim'])];
    // one or two colours per building (it reads as a building, not a heap)
    const hue = rng.int(0, PALETTE.length - 1);
    const hue2 = rng.chance(0.5) ? hue : rng.int(0, PALETTE.length - 1);
    const add = (shape, color) => {
      const n = windowSlots(getGeometry({ shape, scale: 1 })).length;
      floors.push({ shape, color, dx: Math.round((rng.next() - 0.5) * 8), tilt: (rng.next() - 0.5) * 0.025, n });
      wins += n;
    };
    while (wins < need || floors.length < 2) {
      add(rng.pick(cls), floors.length % 3 === 2 ? hue2 : hue);
      if (floors.length > 40) break;
    }
    add(rng.pick(ROOFS), hue2);   // the roof
    // who lives where: the lit windows from the bottom up, with a dark one here and there
    const slots = [];
    floors.forEach((f, fi) => { for (let i = 0; i < f.n; i++) slots.push({ fi, i, o: rng.next() }); });
    const order = slots.map((s, i) => ({ ...s, rank: i + s.o * 6 })).sort((a, b) => a.rank - b.rank);
    const who = new Map();
    for (const s of order.slice(0, Math.max(0, want))) who.set(`${s.fi}.${s.i}`, casting.next().who);
    towers.push({ spot: k, floors, who, gold: new Set() });
  }
  // the golden people: spread over the lit windows (the same ones every time)
  const litKeys = [];
  towers.forEach((t, ti) => { for (const key of t.who.keys()) litKeys.push([ti, key]); });
  const golden = Math.min(gold | 0, litKeys.length);   // (counted once: the list shrinks as they're placed)
  for (let g = 0; g < golden; g++) {
    const pick = litKeys.splice(rng.int(0, litKeys.length - 1), 1)[0];
    towers[pick[0]].gold.add(pick[1]);
  }
  return { towers, lit };
}

export class DorpScene extends Phaser.Scene {
  constructor(config = { key: 'Dorp' }) {
    super(config);   // (js/scenes/SlagScene.js, the fruit battle, builds on this one with its own key)
  }

  init(data) {
    this.d = data || {};
    this.reduced = !!this.d.reducedMotion;
    this.alive = true;
    this.isles = {};
    this.rays = null;
    this.side = 'me';
    this.markParts = [];
    this.busy = false;   // (a raid left half-way on the last visit doesn't hold the framing)
  }

  create() {
    this.H = this.scale.height;
    this.cam = this.cameras.main;
    this.cam.setBackgroundColor('rgba(0,0,0,0)');
    prepareFx(this);
    this.makeTextures();
    this.water = new Water(this, { width: GAP + GAME_W });
    this.seaY = this.water.surfaceY;
    this.isles.me = this.buildIsle('me', 0, this.d.me || {});
    if (this.d.them) this.isles.them = this.buildIsle('them', GAP, this.d.them);
    this.frame('me', 0);
    this.events.once('shutdown', () => this.teardown());
    this.events.once('destroy', () => this.teardown());
    // the faces come in once the portraits are drawn (the first visit)
    whenPortraits(() => { if (this.alive) this.repaintAll(); });
    portraitsReady.then?.(() => { if (this.alive) this.repaintAll(); });
    if (this.d.view === 'raid') this.time.delayedCall(450, () => this.playRaid().catch((e) => this.failed(e)));
    else if (this.d.view === 'news') this.time.delayedCall(500, () => this.playNews().catch((e) => this.failed(e)));
    else if (this.d.tourists > 0) this.time.delayedCall(500, () => this.playTourists(this.d.tourists));
    else this.time.delayedCall(400, () => this.greet());
    this.time.delayedCall(1300, () => this.snapshot());
  }

  failed(e) {
    console.error(e);
    this.d.onFail?.(e);
  }

  teardown() {
    if (!this.alive) return;
    this.alive = false;
    try { this.water?.destroy(); } catch { /* the scene is going */ }
    this.water = null;
    try { dropWindows(this); } catch { /* the scene is going */ }
  }

  update(time, dtMs) {
    if (this.water) {
      this.water.update(dtMs);
      this.seaY = this.water.surfaceY;
    }
    if (this.rays) this.rays.rotation += dtMs * 0.00025;
  }

  /** The screen's bars changed (CSS measured): the town is framed between them again. */
  setBars(top, bottom, ms = 0) {
    this.d.topBar = top;
    this.d.bottomBar = bottom;
    if (!this.busy) this.frame(this.side, ms);
  }

  /** A picture of the town as it stands, for the menu's town button (d.onPicture(dataUrl)). */
  snapshot() {
    if (!this.alive || !this.d.onPicture || this.d.view !== 'town') return;
    const r = this.game.renderer;
    if (!r?.snapshotArea) return;
    const W = this.scale.width;
    const top = Math.max(0, (this.d.topBar || 0));
    const h = Math.max(120, Math.min(this.H - top - (this.d.bottomBar || 0), W * 0.56));
    const y = Math.max(0, this.H - (this.d.bottomBar || 0) - h);
    try {
      r.snapshotArea(0, Math.round(y), W, Math.round(h), (img) => {
        if (!img?.src || !this.alive) return;
        // a small JPEG: the menu shows it 150 × 84
        const c = document.createElement('canvas');
        c.width = 300;
        c.height = 168;
        const x = c.getContext('2d');
        const sh = Math.min(img.height, img.width * 0.56);
        x.drawImage(img, 0, img.height - sh, img.width, sh, 0, 0, 300, 168);
        try { this.d.onPicture(c.toDataURL('image/jpeg', 0.82)); } catch { /* a tainted canvas: no picture */ }
      }, 'image/png');
    } catch { /* no snapshot on this renderer */ }
  }

  // ------------------------------------------------------------------------------------------------- the pictures
  makeTextures() {
    if (!this.textures.exists('dorp_star')) {
      const t = this.textures.createCanvas('dorp_star', 64, 64);
      const c = t.getContext();
      const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,248,200,1)');
      g.addColorStop(0.35, 'rgba(255,214,90,0.7)');
      g.addColorStop(1, 'rgba(255,200,60,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#fffbe0';
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r = k % 2 ? 6 : 26;
        c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      t.refresh();
    }
    if (!this.textures.exists('dorp_reticle')) {
      const t = this.textures.createCanvas('dorp_reticle', 128, 128);
      const c = t.getContext();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 6;
      c.shadowColor = 'rgba(0,0,0,0.5)';
      c.shadowBlur = 6;
      c.beginPath(); c.arc(64, 64, 44, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 4;
      for (const [x0, y0, x1, y1] of [[64, 6, 64, 34], [64, 94, 64, 122], [6, 64, 34, 64], [94, 64, 122, 64]]) {
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      }
      c.fillStyle = '#ff4646';
      c.beginPath(); c.arc(64, 64, 7, 0, Math.PI * 2); c.fill();
      t.refresh();
    }
    if (!this.textures.exists('dorp_arrow')) {
      const t = this.textures.createCanvas('dorp_arrow', 64, 64);
      const c = t.getContext();
      c.fillStyle = '#ffd23f';
      c.strokeStyle = '#7a4300';
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(14, 10); c.lineTo(50, 10); c.lineTo(32, 52); c.closePath(); c.fill(); c.stroke();
      t.refresh();
    }
    if (!this.textures.exists('dorp_rays')) {
      const t = this.textures.createCanvas('dorp_rays', 512, 512);
      const c = t.getContext();
      const grad = c.createRadialGradient(256, 256, 10, 256, 256, 256);
      grad.addColorStop(0, 'rgba(255,236,160,0.95)');
      grad.addColorStop(1, 'rgba(255,236,160,0)');
      c.fillStyle = grad;
      for (let k = 0; k < 16; k++) {
        const a0 = (k / 16) * Math.PI * 2;
        c.beginPath(); c.moveTo(256, 256); c.arc(256, 256, 256, a0, a0 + Math.PI / 20); c.closePath(); c.fill();
      }
      t.refresh();
    }
  }

  // ------------------------------------------------------------------------------------------------- building a town
  /** An island with its town at world x `ox` (0: yours; GAP: theirs). */
  buildIsle(side, ox, town) {
    let art;
    if (ox === 0) {
      art = createIsland(this);
    } else {
      // the same island again across the sea (createIsland drew its pictures already)
      const rock = this.add.image(ox + GAME_W / 2 - 450, -80, 'isl_rock').setOrigin(0, 0).setDepth(DEPTH.island);
      const base = this.add.image(ox + GAME_W / 2, 0, 'isl_base').setOrigin(0.5, 0).setDisplaySize(300, 44).setDepth(DEPTH.base);
      art = { rock, base };
    }
    const tribe = town.tribe || 'vuur';
    const plan = planTown({ id: town.id || side, people: town.people | 0, tribe, gold: town.gold | 0 });
    const isle = { side, ox, town: { ...town, tribe }, plan, art, towers: [], walls: [], top: 0 };
    plan.towers.forEach((tw) => isle.towers.push(this.buildTower(isle, tw)));
    isle.top = Math.min(...isle.towers.map((t) => t.top));
    this.buildWalls(isle, town.walls | 0);
    this.buildFlag(isle);
    isle.marks = [];
    for (const id of cleanMarks(town.marks)) this.addMark(isle, id);
    return isle;
  }

  /** One tower: its blocks from the ground up, each with its windows over it (and a star on a golden person). */
  buildTower(isle, tw) {
    const sp = tw.spotDef || SPOTS[tw.spot];   // (a battle's castle brings its own: js/scenes/SlagScene.js)
    const x0 = isle.ox + GAME_W / 2 + sp.dx;
    let y = sp.y;
    const blocks = [];
    tw.floors.forEach((f, fi) => {
      const spec = { shape: f.shape, color: f.color, scale: 1 };
      const g = getGeometry(spec);
      const key = ensureTexture(this, spec);
      const x = x0 + f.dx * sp.s;
      const img = this.add.image(x, y + PAD * sp.s, key).setOrigin(0.5, 1).setScale(sp.s).setRotation(f.tilt).setDepth(sp.depth);
      if (sp.back) img.setTint(0xc4cbe0);
      const win = this.add.image(x, y + PAD * sp.s, '__DEFAULT').setOrigin(0.5, 1).setScale(sp.s).setRotation(f.tilt).setDepth(sp.depth + 0.01);
      const b = { img, win, g, fi, f, x, bottom: y, s: sp.s, depth: sp.depth, who: [], gold: [], stars: [], row: fi };
      for (let i = 0; i < f.n; i++) {
        b.who[i] = tw.who.get(`${fi}.${i}`) || null;
        b.gold[i] = tw.gold.has(`${fi}.${i}`);
      }
      blocks.push(b);
      this.paintBlock(b, isle.town.tribe);
      y -= g.h * sp.s - 1;
    });
    return { spot: sp, x: x0, blocks, top: y, isle };
  }

  /** A block's windows as they are now: a face where someone lives, a dark room where nobody does; stars on the golden. */
  paintBlock(b, tribe) {
    const wins = b.who.map((who) => (who ? { look: 'face', who, tribe: CAST[who]?.tribe || tribe } : { look: 'room', tribe }));
    const key = ensureWindows(this, b.g, wins, PAD);
    if (this.textures.exists(key)) b.win.setTexture(key);
    b.who.forEach((who, i) => {
      const want = !!(who && b.gold[i]);
      if (want && !b.stars[i]) {
        const p = this.windowAt(b, i);
        const st = this.add.image(p.x + 9 * b.s * 2, p.y - 10 * b.s * 2, 'dorp_star').setDepth(b.depth + 0.02).setScale(0.32).setBlendMode(Phaser.BlendModes.ADD);
        if (!this.reduced) this.tweens.add({ targets: st, scale: 0.46, alpha: 0.6, angle: 45, duration: 900 + i * 80, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        b.stars[i] = st;
      } else if (!want && b.stars[i]) {
        b.stars[i].destroy();
        b.stars[i] = null;
      }
    });
  }

  repaintAll() {
    for (const isle of Object.values(this.isles)) for (const t of isle.towers) for (const b of t.blocks) this.paintBlock(b, isle.town.tribe);
  }

  /** The walls: cement along the shore, one section per wall (js/core/dorp.js: a wall stops one raid). */
  buildWalls(isle, n) {
    const xs = [-150, 150, 0];
    for (let k = 0; k < Math.min(3, n); k++) {
      const key = ensureTexture(this, { shape: 'slab', foundation: true, scale: 1 });
      const w = this.add.image(isle.ox + GAME_W / 2 + xs[k], k === 2 ? 34 : 26, key).setOrigin(0.5, 1).setScale(0.62, 0.55).setDepth(DEPTH.base + 1);
      isle.walls.push(w);
    }
  }

  /** The tribe's flag on the main tower, waving. */
  buildFlag(isle) {
    const tribe = isle.town.tribe;
    const bot = !!isle.town.bot;
    const key = `dorp_flag_${tribe}${bot ? '_bot' : ''}`;
    if (!this.textures.exists(key)) {
      const t = this.textures.createCanvas(key, 96, 104);
      const c = t.getContext();
      c.fillStyle = '#e9e4d6';
      c.fillRect(6, 4, 5, 100);
      c.fillStyle = '#' + FLAG[tribe].toString(16).padStart(6, '0');
      c.beginPath();
      c.moveTo(11, 8); c.quadraticCurveTo(50, 0, 90, 12); c.lineTo(90, 52); c.quadraticCurveTo(50, 40, 11, 52); c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(11, 10, 79, 6);
      c.font = `30px ${EMOJI_FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(bot ? '🤖' : TRIBE_EMOJI[tribe], 50, 30);
      t.refresh();
    }
    const main = isle.towers[0];
    const flag = this.add.image(main.x - 4, main.top + 2, key).setOrigin(0.07, 1).setScale(0.62).setDepth(DEPTH.tower + 0.5);
    if (!this.reduced) this.tweens.add({ targets: flag, scaleX: 0.56, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    isle.flag = flag;
  }

  // ------------------------------------------------------------------------------------------------------- landmarks
  /** An emoji as a picture (drawn once, with a soft shadow under it). */
  emojiTex(ch) {
    const key = `dorp_e_${[...ch].map((c) => c.codePointAt(0).toString(16)).join('_')}`;
    if (this.textures.exists(key)) return key;
    const t = this.textures.createCanvas(key, MARK_SIZE, MARK_SIZE);
    const c = t.getContext();
    c.fillStyle = 'rgba(10,20,40,0.28)';
    c.beginPath();
    c.ellipse(MARK_SIZE / 2, MARK_SIZE - 10, MARK_SIZE * 0.34, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.font = `${Math.round(MARK_SIZE * 0.78)}px ${EMOJI_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(ch, MARK_SIZE / 2, MARK_SIZE - 18);
    t.refresh();
    return key;
  }

  /**
   * Landmark `id` in town `isle`: on land at the next free spot, or in the sea, alive (the boat sails past, the dolphin
   * jumps, the whale spouts). `drop`: just bought, it lands from the sky like a block.
   */
  addMark(isle, id, { drop = false } = {}) {
    const m = markOf(id);
    if (!m || isle.marks.some((x) => x.id === id)) return null;
    const cx = isle.ox + GAME_W / 2;
    const key = this.emojiTex(m.emoji);
    let img;
    if (m.where === 'land') {
      const n = isle.marks.filter((x) => x.where === 'land').length;
      const sl = LAND_SLOTS[Math.min(n, LAND_SLOTS.length - 1)];
      img = this.add.image(cx + sl.dx, sl.y + 6, key).setOrigin(0.5, 1).setScale(sl.s).setDepth(DEPTH.tower + 0.3);
      if (!this.reduced) this.tweens.add({ targets: img, scaleY: sl.s * 1.03, duration: 1300 + n * 170, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      if (id === 'fontein' && !this.reduced) this.fountainDrops(img);
    } else {
      img = this.seaMark(isle, id, key);
    }
    isle.marks.push({ id, where: m.where, img });
    if (drop && img) {
      const y = img.y;
      img.y = y - 520;
      this.tweens.add({
        targets: img, y, duration: this.reduced ? 1 : 650, ease: 'Bounce.easeOut',
        onComplete: () => {
          audio.play('land');
          haptics.heavy();
          this.cam.shake(220, 0.004);
          for (let k = 0; k < 10; k++) this.time.delayedCall(k * 30, () => this.sparkle(img.x + (Math.random() - 0.5) * 90, y - Math.random() * 40, 0xfff1a8, 0.8));
        },
      });
    }
    return img;
  }

  /** The sea's landmarks: the boat sails along the shore, the dolphin jumps now and then, the whale surfaces and spouts. */
  seaMark(isle, id, key) {
    const cx = isle.ox + GAME_W / 2;
    const sea = this.seaY;
    if (id === 'seilboot') {
      const b = this.add.image(cx - 330, sea + 6, key).setOrigin(0.5, 1).setScale(0.62).setDepth(DEPTH.water + 0.25);
      if (!this.reduced) {
        this.tweens.add({ targets: b, x: cx + 330, duration: 16000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', onYoyo: () => b.setFlipX(true), onRepeat: () => b.setFlipX(false) });
        this.tweens.add({ targets: b, angle: 4, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      return b;
    }
    if (id === 'dolfyn') {
      const d = this.add.image(cx + 220, sea + 40, key).setScale(0.55).setDepth(DEPTH.water + 0.25).setAlpha(0);
      const jump = () => {
        if (!this.alive || !d.active) return;
        const x0 = cx + (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 160);
        const dir = x0 < cx ? 1 : -1;
        d.setPosition(x0, sea + 30).setAlpha(1).setFlipX(dir < 0).setAngle(dir * -35);
        this.water?.splash?.(x0);
        const t = { p: 0 };
        this.tweens.add({
          targets: t, p: 1, duration: 1100, ease: 'Linear',
          onUpdate: () => {
            d.x = x0 + dir * 150 * t.p;
            d.y = sea + 30 - Math.sin(t.p * Math.PI) * 150;
            d.setAngle(dir * (-35 + 70 * t.p));
          },
          onComplete: () => {
            this.water?.splash?.(d.x);
            d.setAlpha(0);
            this.time.delayedCall(3500 + Math.random() * 3000, jump);
          },
        });
      };
      if (!this.reduced) this.time.delayedCall(1500 + Math.random() * 1500, jump);
      else d.setPosition(cx + 220, sea + 6).setAlpha(1).setAngle(-8);   // (less motion: it rests in the sea, still seen)
      return d;
    }
    if (id === 'walvis') {
      const w = this.add.image(cx - 250, sea + 40, key).setOrigin(0.5, 0.6).setScale(0.8).setDepth(DEPTH.water + 0.25).setAlpha(0.95);
      const spout = () => {
        if (!this.alive || !w.active) return;
        this.tweens.add({ targets: w, y: sea + 8, duration: 900, ease: 'Sine.easeOut' });
        this.time.delayedCall(900, () => {
          for (let k = 0; k < 9; k++) {
            const p = this.add.circle(w.x + 6, w.y - 30, 3 + Math.random() * 3, 0xdff4ff, 0.95).setDepth(DEPTH.water + 0.26);
            this.tweens.add({ targets: p, y: p.y - 70 - Math.random() * 50, x: p.x + (Math.random() - 0.5) * 50, alpha: 0, duration: 800 + Math.random() * 400, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
          }
          this.tweens.add({ targets: w, y: sea + 40, duration: 1200, delay: 1400, ease: 'Sine.easeIn' });
        });
        this.time.delayedCall(6500 + Math.random() * 3000, spout);
      };
      if (!this.reduced) this.time.delayedCall(800, spout);
      else w.y = sea + 8;
      return w;
    }
    return null;
  }

  /** The fountain's water: a few drops up and back, again and again. */
  fountainDrops(img) {
    const drop = () => {
      if (!this.alive || !img.active) return;
      for (let k = 0; k < 3; k++) {
        const p = this.add.circle(img.x + (Math.random() - 0.5) * 18, img.y - 60, 2.5, 0xbfe9ff, 0.95).setDepth(img.depth + 0.01);
        this.tweens.add({ targets: p, y: p.y - 26 - Math.random() * 14, x: p.x + (Math.random() - 0.5) * 30, duration: 380, yoyo: true, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
      }
      this.time.delayedCall(420, drop);
    };
    drop();
  }

  /** A landmark just bought in your town: it lands from the sky, and its name pops. */
  buyMark(id) {
    const isle = this.isles.me;
    if (!isle) return;
    const img = this.addMark(isle, id, { drop: true });
    if (img) this.time.delayedCall(700, () => this.pop(img.x, img.y - 120, S.dorpBought(S.dorpMarkNames[id] || id), '#ffe38c', 40));
  }

  /** The day's tourists arrive by sea and move into windows (up to 8 shown), then "+12 TOERISTE!". */
  playTourists(n) {
    const me = this.isles.me;
    const homes = this.litWindows(me).sort((a, b) => (a.t - b.t) || (b.y - a.y)).slice(0, Math.min(8, n));
    for (const w of homes) {
      w.who0 = w.b.who[w.i];
      w.b.who[w.i] = null;
      this.paintBlock(w.b, me.town.tribe);
    }
    let landed = 0;
    const cast = castOf(me.town.tribe);
    homes.forEach((w, k) => {
      this.time.delayedCall(300 + k * 160, () => {
        const who = w.who0 || cast[k % cast.length];
        const from = { x: me.ox + GAME_W + 120 + (k % 3) * 30, y: this.seaY - 20 };
        this.fly(who, from.x, from.y, w, k, false, () => {
          w.b.who[w.i] = who;
          this.paintBlock(w.b, me.town.tribe);
          this.sparkle(w.x, w.y, 0xffe38c, 0.9);
          audio.play('room', { n: ++landed });
          if (landed === homes.length) {
            const W = this.scale.width;
            const at = this.onScreen(W / 2, (this.d.topBar || this.H * 0.2) + 110);
            const t = this.add.text(at.x, at.y, S.dorpTouristsPop(n), { fontFamily: FONT, fontSize: '64px', fontStyle: '900', color: '#ffd23f', stroke: '#5a2d00', strokeThickness: 10 })
              .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.fxScreen + 1).setScale(0.2 * at.k);
            this.tweens.add({ targets: t, scale: at.k, duration: 480, ease: 'Back.easeOut' });
            this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 500, onComplete: () => t.destroy() });
            audio.play('milestone');
            this.d.onTourists?.(n);
          }
        });
      });
    });
    if (!homes.length) this.d.onTourists?.(n);
  }

  // ------------------------------------------------------------------------------------------------------ the camera
  /** Frame island `side`: the whole town between the screen's bars (the counts at the top, the buttons at the bottom). */
  frame(side, ms = 900) {
    const isle = this.isles[side];
    if (!isle) return;
    this.side = side;
    const topBar = this.d.topBar || this.H * 0.2;
    const bottomBar = this.d.bottomBar || this.H * 0.3;
    const townH = Math.max(200, -isle.top + 70) + 110;   // the flag and some sky over it, the shore under it
    // the whole town across (and the target's sweep), and up to its flag
    const half = Math.max(...isle.towers.map((t) => Math.abs(t.x - isle.ox - GAME_W / 2))) + 110;
    const z = Math.max(0.5, Math.min(1.35, (this.H - topBar - bottomBar - 40) / townH, GAME_W / (2 * half)));
    const groundScreen = this.H - bottomBar - 80 * z;     // where the base's top sits on screen
    const cx = isle.ox + GAME_W / 2;
    const cy = (this.H / 2 - groundScreen) / z;
    if (!ms || this.reduced) {
      this.cam.setZoom(z);
      this.cam.centerOn(cx, cy);
      return;
    }
    this.cam.zoomTo(z, ms, 'Sine.easeInOut');
    this.cam.pan(cx, cy, ms, 'Sine.easeInOut');
  }

  // ---------------------------------------------------------------------------------------------- the town at rest
  /** The town says hello: a sparkle runs over its lit windows, the golden ones last. */
  greet() {
    if (this.reduced) return;
    const lit = this.litWindows(this.isles.me).slice(0, 10);
    lit.forEach((w, k) => this.time.delayedCall(200 + k * 120, () => this.sparkle(w.x, w.y, 0xffe38c, 0.6)));
  }

  /** Every lit window of a town: { b, i, x, y, who, gold, t } in world space. */
  litWindows(isle) {
    const out = [];
    isle.towers.forEach((t, ti) => { for (const b of t.blocks) b.who.forEach((who, i) => { if (who) out.push({ b, i, who, gold: !!b.gold[i], t: ti, ...this.windowAt(b, i) }); }); });
    return out;
  }

  darkWindows(isle) {
    const out = [];
    isle.towers.forEach((t, ti) => { for (const b of t.blocks) b.who.forEach((who, i) => { if (!who) out.push({ b, i, t: ti, ...this.windowAt(b, i) }); }); });
    return out;
  }

  /** Window `i` of block `b`, in the world (the block's picture hangs from its bottom centre). */
  windowAt(b, i) {
    const s = windowSlots(b.g)[i];
    if (!s) return { x: b.x, y: b.bottom };
    const dx = (s.x - b.g.w / 2) * b.s;
    const dy = (s.y - b.g.h) * b.s;
    const a = b.img.rotation;
    return { x: b.x + dx * Math.cos(a) - dy * Math.sin(a), y: b.bottom + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  sparkle(x, y, tint = 0xffe38c, scale = 1) {
    const c = this.add.circle(x, y, 10 * scale, tint, 0.85).setDepth(DEPTH.fxWorld).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: c, scale: 2.4, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
  }

  /** Text that pops up in the world and floats away ("PERFEK!"). */
  pop(x, y, text, color, size = 64) {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#1d2b45', strokeThickness: Math.round(size / 6) })
      .setOrigin(0.5).setDepth(DEPTH.fxScreen).setScale(0.3).setShadow(0, 6, 'rgba(0,0,0,0.4)', 8, true, true);
    this.tweens.add({ targets: t, scale: 1, duration: 340, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - 90, alpha: 0, delay: 950, duration: 600, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
    return t;
  }

  wait(ms) {
    return new Promise((res) => this.time.delayedCall(this.reduced ? Math.min(ms, 60) : ms, res));
  }

  // ----------------------------------------------------------------------------------------------------- a strooptog
  /**
   * The raid: over the sea to their town; the target sweeps, the tap strikes (d.onStrike(hit) asks the server: the true
   * numbers); their people drift over into your windows; the reward. d.onAim() when the target is out; d.onCount({ me,
   * them }) as each one lands; d.onDone(result) at the end.
   */
  async playRaid() {
    const me = this.isles.me;
    const them = this.isles.them;
    if (!them) return this.d.onDone?.(null);
    this.busy = true;
    const nMe = this.d.me.people | 0;
    const nThem = this.d.them.people | 0;
    this.d.onCount?.({ me: nMe, them: nThem });
    await this.wait(450);
    // 1. over the sea
    audio.play('wind');
    this.frame('them', 1500);
    await this.wait(1650);
    // 2. the aim: the fullest tower glows; the target sweeps; the tap strikes
    const goal = this.fullest(them);
    const glow = this.glowTower(goal);
    this.d.onAim?.();
    const aim = await this.aim(them, goal);
    glow.destroy();
    const label = { P: [S.perfect.toUpperCase(), '#ffd23f'], G: [S.good.toUpperCase(), '#ffffff'], S: [S.skew.toUpperCase(), '#ffb36b'] }[aim.hit];
    this.pop(aim.x, aim.y - 70, label[0], label[1], aim.hit === 'P' ? 72 : 58);
    audio.play(aim.hit === 'P' ? 'perfect' : aim.hit === 'G' ? 'good' : 'skew', { combo: 3 });
    // 3. the strike, while the server settles the raid
    const answer = this.d.onStrike ? this.d.onStrike(aim.hit) : Promise.resolve({ ok: true, took: 0 });
    const near = this.litWindows(them).sort((a, b) => Math.hypot(a.x - aim.x, a.y - aim.y) - Math.hypot(b.x - aim.x, b.y - aim.y));
    const [res] = await Promise.all([answer, this.strike(me.town.tribe, them, near.slice(0, 6), aim)]);
    if (!res || !res.ok) {
      this.busy = false;
      this.frame('me', 1200);
      this.d.onFail?.(res);
      return;
    }
    if (res.blocked) {
      this.wallHolds(them);
      await this.wait(1400);
      this.frame('me', 1400);
      await this.wait(1500);
      this.busy = false;
      this.d.onDone?.(res);
      return;
    }
    // 4. their people drift over into your dark windows (the camera comes home with them)
    const took = Math.max(0, res.took | 0);
    const goldTook = Math.max(0, res.goldTook | 0);
    const flyers = near.slice(0, Math.min(MAX_FLY, took));
    // the golden ones caught fly first (a golden window near the aim, else a lit one turns golden)
    const goldIn = [...near.filter((w) => w.gold)].slice(0, goldTook);
    const set = [...goldIn, ...flyers.filter((w) => !goldIn.includes(w))].slice(0, Math.max(flyers.length, goldIn.length));
    set.forEach((w, k) => { w.fliesGold = k < goldTook; });
    const homes = this.darkWindows(me).sort((a, b) => (a.t - b.t) || (b.y - a.y)).slice(0, set.length);
    let landed = 0;
    if (!set.length) {
      this.reward(took, goldTook, res);
      return;
    }
    set.forEach((w, k) => {
      this.time.delayedCall(k * 110, () => {
        const who = w.b.who[w.i];
        w.b.who[w.i] = null;
        w.b.gold[w.i] = false;
        this.paintBlock(w.b, them.town.tribe);
        const home = homes[k] || homes[homes.length - 1] || { x: me.ox + GAME_W / 2, y: -80 };
        this.fly(who, w.x, w.y, home, k, w.fliesGold, () => {
          landed += 1;
          if (home.b) {
            home.b.who[home.i] = who;
            home.b.gold[home.i] = !!w.fliesGold;
            this.paintBlock(home.b, me.town.tribe);
          }
          this.sparkle(home.x, home.y, w.fliesGold ? 0xfff1a0 : 0xffe38c, w.fliesGold ? 1.6 : 0.9);
          audio.play(w.fliesGold ? 'gold' : 'room', { n: landed });
          const upTo = Math.round((landed / set.length) * took);
          this.d.onCount?.({ me: nMe + upTo, them: Math.max(0, nThem - upTo) });
          if (landed === set.length) this.reward(took, goldTook, res);
        });
      });
    });
    this.time.delayedCall(900, () => this.frame('me', 2300));
  }

  /** The tower with the most people (the target's goal). */
  fullest(isle) {
    let best = isle.towers[0];
    let n = -1;
    for (const t of isle.towers) {
      const c = t.blocks.reduce((s, b) => s + b.who.filter(Boolean).length, 0);
      if (c > n) { n = c; best = t; }
    }
    return best;
  }

  /** The goal glows, and an arrow bounces over it. Returns something to destroy. */
  glowTower(t) {
    const h = Math.max(60, -t.top + t.spot.y);
    const g = this.add.image(t.x, t.top + h / 2, 'dorp_star').setDepth(t.spot.depth - 0.5).setDisplaySize(170 * t.spot.s * 2, h + 90).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: g, alpha: 0.85, duration: 300 });
    const pulse = this.tweens.add({ targets: g, alpha: 0.5, duration: 520, yoyo: true, repeat: -1, delay: 320 });
    const arrow = this.add.image(t.x, t.top - 70, 'dorp_arrow').setDepth(DEPTH.fxScreen).setScale(0.9);
    const bob = this.tweens.add({ targets: arrow, y: t.top - 48, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return { destroy: () => { pulse.stop(); bob.stop(); g.destroy(); arrow.destroy(); } };
  }

  /** The target sweeps over their town like the crane; a tap (anywhere) strikes. Resolves { hit, x, y }. */
  aim(isle, goal) {
    return new Promise((resolve) => {
      const xs = isle.towers.map((t) => t.x);
      const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
      const amp = (Math.max(...xs) - Math.min(...xs)) / 2 + 50;
      const y = goal.top + (goal.spot.y - goal.top) * 0.45;
      const ret = this.add.image(mid, y, 'dorp_reticle').setDepth(DEPTH.fxScreen).setScale(0.2).setAlpha(0);
      this.tweens.add({ targets: ret, scale: 0.85, alpha: 1, duration: 260, ease: 'Back.easeOut' });
      const t0 = this.time.now + (this.d.aimPhase || 0);
      const step = () => {
        const p = (this.time.now - t0) / AIM_PERIOD;
        ret.x = mid + amp * Math.sin(p * Math.PI * 2);
      };
      this.events.on('update', step);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.events.off('update', step);
        timer.remove(false);
        this.input.off('pointerdown', finish);
        const dx = Math.abs(ret.x - goal.x);
        const hit = dx <= HIT_P ? 'P' : dx <= HIT_G ? 'G' : 'S';
        haptics.tap();
        this.tweens.add({ targets: ret, scale: 1.4, alpha: 0, duration: 240, onComplete: () => ret.destroy() });
        resolve({ hit, x: ret.x, y });
      };
      const timer = this.time.delayedCall(this.d.autoAim != null ? this.d.autoAim : AIM_MS, finish);
      this.time.delayedCall(250, () => { if (!done) this.input.on('pointerdown', finish); });
      this.d.aimHook?.((h) => { this.d.aimHit = h; finish(); });
    });
  }

  /** Your tribe's mission on their town (the battles' own pictures), at the aim. */
  async strike(tribe, isle, targets, at = null) {
    haptics.heavy();
    const hx = at ? at.x : isle.towers[0].x;
    if (tribe === 'vuur') {
      audio.play('heat');
      targets.slice(0, 6).forEach((t, k) => burnRoom(this, t.x, t.y, { w: 44, h: 36, ms: 1500, delay: k * 120 }));
      this.cam.shake(500, 0.006);
      await this.wait(1100);
    } else if (tribe === 'water') {
      audio.play('splash');
      const ys = targets.map((t) => t.y);
      waterWheel(this, hx, Math.min(...ys, -120) - 20, Math.max(...ys, -20) + 20, { side: -1, width: 110, ms: 1500, seaY: this.seaY });
      this.time.delayedCall(700, () => this.cam.shake(450, 0.006));
      await this.wait(1500);
    } else {
      audio.play('creak');
      const xs = [...new Set(targets.map((t) => Math.round(t.x / 30) * 30))].slice(0, 3);
      if (!xs.length) xs.push(hx);
      xs.forEach((x) => vinesTo(this, x, 6, Math.min(...targets.map((t) => t.y), -100) - 10, { ms: 700, hold: 600 }));
      this.time.delayedCall(500, () => this.cam.shake(400, 0.005));
      await this.wait(1200);
    }
    audio.play('thunder');
  }

  /** One person: out of the window, the canopy opens, and the wind takes them over the sea to `home` (gold: glowing). */
  fly(who, x, y, home, k, gold, onLand) {
    const tribe = CAST[who]?.tribe || 'vuur';
    const chute = this.add.image(0, -34, chuteTexture(this, tribe)).setScale(0.05);
    const pk = badgeKey(this, who);
    const face = pk ? this.add.image(0, 0, pk).setScale(0.62) : this.add.circle(0, 0, 15, 0xffd23f);
    const parts = [chute, face];
    if (gold) {
      const halo = this.add.image(0, 0, 'dorp_star').setScale(1.1).setBlendMode(Phaser.BlendModes.ADD);
      parts.unshift(halo);
      if (!this.reduced) this.tweens.add({ targets: halo, angle: 180, scale: 1.4, duration: 700, yoyo: true, repeat: -1 });
    }
    const c = this.add.container(x, y, parts).setDepth(DEPTH.fxWorld);
    if (k % 3 === 0) audio.play('chute');
    const t = { p: 0 };
    const midY = Math.min(y, home.y) - 220 - (k % 4) * 40;
    this.tweens.add({ targets: chute, scaleX: 1.25, scaleY: 1.25, duration: 260, delay: 160, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t, p: 1, duration: this.reduced ? 200 : 2600 + (k % 5) * 120, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const p = t.p;
        const q = 1 - p;
        // a curve up and over the sea, swaying under the canopy
        c.x = q * q * x + 2 * q * p * ((x + home.x) / 2) + p * p * home.x + Math.sin(p * 10 + k) * 10 * (1 - p);
        c.y = q * q * y + 2 * q * p * midY + p * p * home.y;
        c.rotation = Math.sin(p * 10 + k) * 0.14 * (1 - p);
      },
      onComplete: () => {
        this.tweens.add({ targets: c, scale: 0.4, alpha: 0, duration: 200, onComplete: () => c.destroy() });
        onLand();
      },
    });
  }

  /** A wall holds: it flashes white, shakes, and crumbles (one wall is gone). */
  wallHolds(isle) {
    const w = isle.walls[isle.walls.length - 1];
    audio.play('board');
    this.cam.shake(350, 0.008);
    this.pop(isle.ox + GAME_W / 2, -60, `🛡️ ${S.dorpWallHeld}`, '#bfe3ff', 52);
    if (!w) return;
    w.setTintFill(0xffffff);
    this.time.delayedCall(140, () => w.clearTint());
    this.tweens.add({ targets: w, x: w.x + 6, duration: 50, yoyo: true, repeat: 5 });
    this.time.delayedCall(700, () => {
      for (let k = 0; k < 8; k++) {
        const bit = this.add.rectangle(w.x + (Math.random() - 0.5) * 90, w.y - 12, 8 + Math.random() * 10, 6 + Math.random() * 8, 0xb9c1cc).setDepth(DEPTH.fxWorld);
        this.tweens.add({ targets: bit, y: this.seaY + 10, x: bit.x + (Math.random() - 0.5) * 60, angle: Math.random() * 360, alpha: 0, duration: 700 + Math.random() * 400, ease: 'Quad.easeIn', onComplete: () => bit.destroy() });
      }
      this.tweens.add({ targets: w, alpha: 0, scaleY: 0.1, duration: 500, onComplete: () => w.destroy() });
      isle.walls.pop();
    });
  }

  /**
   * A screen point (x, y) for something fixed to the screen (scroll factor 0): the camera's zoom still scales those around
   * the middle, so they go where the zoom takes them back to, at 1 / zoom their size.
   */
  onScreen(x, y) {
    const z = this.cam.zoom || 1;
    const W = this.scale.width;
    return { x: W / 2 + (x - W / 2) / z, y: this.H / 2 + (y - this.H / 2) / z, k: 1 / z };
  }

  /** The reward: turning light behind "+18 MENSE!" (and the golden ones), the town's lights twinkle, a fanfare. */
  reward(took, goldTook, res) {
    const W = this.scale.width;
    const at = this.onScreen(W / 2, (this.d.topBar || this.H * 0.2) + 130);
    const y = at.y;
    this.rays = this.add.image(at.x, y, 'dorp_rays').setScrollFactor(0).setDepth(DEPTH.fxScreen).setAlpha(0).setScale(0.3 * at.k).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: this.rays, alpha: 0.75, scale: 1.25 * at.k, duration: 500, ease: 'Back.easeOut' });
    const txt = this.add.text(W / 2, y, (took ? S.dorpTook(took) : S.dorpEmpty(this.d.them?.name || '')).toUpperCase(), {
      fontFamily: FONT, fontSize: took ? '84px' : '48px', fontStyle: '900', color: '#ffd23f', stroke: '#5a2d00', strokeThickness: 12,
      align: 'center', wordWrap: { width: W - 60 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.fxScreen + 1).setScale(0.2 * at.k).setShadow(0, 8, 'rgba(0,0,0,0.45)', 10, true, true);
    txt.setX(at.x);
    this.tweens.add({ targets: txt, scale: at.k, duration: 520, ease: 'Back.easeOut' });
    if (goldTook) {
      const g = this.add.text(at.x, y + 86 * at.k, S.dorpGoldPop(goldTook), {
        fontFamily: FONT, fontSize: '46px', fontStyle: '900', color: '#fff3b0', stroke: '#6b4a00', strokeThickness: 9,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.fxScreen + 1).setScale(0.2 * at.k);
      this.tweens.add({ targets: g, scale: at.k, duration: 520, delay: 380, ease: 'Back.easeOut' });
      this.time.delayedCall(420, () => audio.play('gold'));
    }
    audio.play('record');
    haptics.perfect();
    for (const w of this.litWindows(this.isles.me).slice(0, 30)) this.time.delayedCall(Math.random() * 600, () => this.sparkle(w.x, w.y, 0xffe38c, 0.7));
    this.busy = false;
    this.time.delayedCall(900, () => this.d.onDone?.(res));
  }

  // ------------------------------------------------------------------------------------------- terwyl jy weg was
  /** Their tribe strikes your town, and your people drift away over the sea: d.news { took, tribe, blocked, goldTook }. */
  async playNews() {
    const n = this.d.news || {};
    const me = this.isles.me;
    this.busy = true;
    const took = Math.max(0, n.took | 0);
    const nMe = (this.d.me.people | 0) + took;   // the town as it was before
    // the windows they emptied are lit again for the replay
    const extra = this.darkWindows(me).sort((a, b) => (a.t - b.t) || (b.y - a.y)).slice(0, Math.min(MAX_FLY, took));
    extra.forEach((w, k) => {
      w.b.who[w.i] = castOf(me.town.tribe)[k % 4];
      w.b.gold[w.i] = k < (n.goldTook | 0);
      this.paintBlock(w.b, me.town.tribe);
    });
    this.d.onCount?.({ me: nMe });
    await this.wait(700);
    if (n.blocked) {
      await this.strike(n.tribe || 'vuur', me, this.litWindows(me).slice(0, 3));
      this.wallHolds(me);
      await this.wait(1200);
      this.busy = false;
      this.d.onDone?.(null);
      return;
    }
    await this.strike(n.tribe || 'vuur', me, extra);
    if (!extra.length) {
      this.busy = false;
      this.d.onDone?.(null);
      return;
    }
    let gone = 0;
    extra.forEach((t, k) => {
      this.time.delayedCall(k * 120, () => {
        const who = t.b.who[t.i];
        const gold = t.b.gold[t.i];
        t.b.who[t.i] = null;
        t.b.gold[t.i] = false;
        this.paintBlock(t.b, me.town.tribe);
        const away = { x: me.ox + GAME_W + 260 + (k % 3) * 40, y: -300 - (k % 4) * 60 };
        this.fly(who, t.x, t.y, away, k, gold, () => {
          gone += 1;
          this.d.onCount?.({ me: nMe - Math.round((gone / extra.length) * took) });
          if (gone === extra.length) {
            audio.play('lost');
            this.busy = false;
            this.time.delayedCall(500, () => this.d.onDone?.(null));
          }
        });
      });
    });
  }
}

export default DorpScene;
