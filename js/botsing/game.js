// (1.18 3D) Blokbotsing: the battle. Turn by turn the crane offers three cards, each a Stapel block with an element
// (🔥 Vuur, 🌿 Gras, 💧 Water, 💣 Plofstof). BUILD: it swings over your tower and a tap drops it (Stapel's own stacking,
// a gold guide shows a Perfek); its element defends. THROW (the owner, 17 Oct 2026: "a power bar then a direction pin
// instead ... It makes it more challenging"): tap to hold the running power bar, tap to stop the swinging pin; your last
// throw's path stays faint to learn from. The camera shows both towers, then zooms in on the one that's hit ("show both
// the towers and then zoom in on the tower that is getting damaged"); the element strikes there (fire spreads, vines
// drag, a wave shoves, an explosion), and the thrown block breaks apart. Your crown stands in a glass cabinet behind your
// tower: break their glass, throw their crown into the sea. Blocks, not turns (BUDGET); both out: sudden death.
// `?vriend=1` makes a room and invites a friend, `?kamer=CODE` joins one: the one whose turn it is plays, the other
// phone replays it and takes its snapshot at the end of the turn.
import * as THREE from '../../lib/three.module.min.js';
import { createStage, pickQuality } from '../kasteel/stage.js';
import { buildWorld, STACK_TOP } from './world.js';
import { createPieces } from './pieces.js';
import { createSim, shapeInfo } from './sim.js';
import { createBattleFx } from './fx.js';
import { createHud } from './hud.js';
import { createRikusPlanner } from './rikus.js';
import { PX, sideX, towardFoe, towerX, BUILD, RIKUS, SETTLE, LAUNCH, STACK, G_STEP, BUDGET, ELEMENT, PIN, WIND, LOOT, offer, rng, pinAngle, powerAt, windFor } from './rules.js';
import { EARN, cleanEconomy, skin as skinItem } from '../core/economy.js';
import { dateKeyFor } from '../core/daily.js';
import { checkName } from '../core/nameRules.js';
import { matchApiUrl } from '../sponsorConfig.js';
import { createSlagNet } from '../slagNet.js';
import { PHYSICS, DUEL } from '../config.js';
import { T, PREFS, goBack } from './text.js';
import { audio, haptics } from '../audio.js';

const q = new URLSearchParams(location.search);
let SEED = Number(q.get('seed')) || 1 + (Date.now() % 2147480000);
let rand = rng(SEED);
const KEY = 'stapel.v1.botsing';
// you and the other side: Robot Rikus, or a friend (the one who made the room plays the left stack and goes first)
const FRIEND_HOST = q.has('vriend');
const FRIEND_CODE = (q.get('kamer') || '').toUpperCase();
const FRIEND = FRIEND_HOST || /^[A-Z0-9]{6}$/.test(FRIEND_CODE);
const ME = FRIEND && !FRIEND_HOST ? 1 : 0;
const FOE = 1 - ME;
let conn = null;
let foeName = '';
const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
/** The battle's record (stapel.v1.botsing: the tip seen, wins, played, coins still to reach the wallet), merged in. */
function saveRecord(patch) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...readJson(KEY), ...patch })); } catch { /* this phone keeps nothing */ }
}
/**
 * A finished battle's coins: they wait in the record until Stapel adds them to the wallet (one place keeps the wallet),
 * no more than today's cap leaves (the wallet's own count, less what already waits). Returns { coins, capped }.
 */
function recordBattle(result) {
  const want = result === 'win' ? (FRIEND ? LOOT.friendWin : LOOT.win) : result === 'draw' ? LOOT.draw : LOOT.loss;
  const v = readJson(KEY);
  const pending = Math.max(0, v.pending | 0);
  let earned = 0;
  try {
    const e = JSON.parse(localStorage.getItem('stapel.v1.econ') || 'null');
    if (e?.earned?.day === dateKeyFor()) earned = Math.max(0, e.earned.n | 0);
  } catch { /* a new wallet */ }
  const coins = Math.max(0, Math.min(want, EARN.dayCap - earned - pending));
  saveRecord({ pending: Math.min(5000, pending + coins), played: (v.played | 0) + 1, wins: (v.wins | 0) + (result === 'win' ? 1 : 0) });
  return { coins, capped: coins < want };
}
/** A name as Stapel's own nickname rules allow it (kid-clean; letters, digits and a little punctuation), else ''. */
const cleanName = (raw) => { const c = checkName(String(raw ?? '').slice(0, 40), { max: DUEL.nameMax }); return c.ok ? c.value : ''; };
/** Text for the cards' HTML (the result card shows the friend's name). */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const myName = cleanName(readJson('stapel.v1')?.duel?.name);
/** Today's Daily Tower Perfeks, at most BUDGET.dailyMax: extra blocks for every battle today. */
const myBonus = Math.max(0, Math.min(BUDGET.dailyMax, Math.floor(Number(readJson('stapel.v1.kasteeldae')?.[dateKeyFor()]?.p) || 0)));
/**
 * (the owner: "the type of block they have purched") the block skin you wear in Stapel, one you own (the wallet's own
 * check); Rikus wears the standard one. `?skin=` shows another you own (a test link).
 */
const myEcon = cleanEconomy(readJson('stapel.v1.econ'));
const mySkin = myEcon.skins.owned.blocks.includes(q.get('skin')) ? q.get('skin') : myEcon.skins.wear.blocks;
const skins = [];
skins[ME] = mySkin;
skins[FOE] = 'kleur';
audio.setEnabled(PREFS.sound);
haptics.setEnabled(PREFS.vibration);
const sfx = (n, o) => { try { audio.play(n, o); } catch { /* sound off */ } };
const buzz = (k) => { try { haptics[k]?.(); } catch { /* no haptics */ } };
const calm = PREFS.reducedMotion;

// (phones: a lighter start than the castles — the owner saw it lag; the stage still steps down by itself)
const quality = pickQuality();
if (quality.name === 'mid' && !quality.forced) Object.assign(quality, { dpr: 1.3, shadow: 1024 });
const stage = createStage({ fov: 46, quality });
const { scene, camera, renderer } = stage;
const stageEl = document.getElementById('k-stage');
const world = buildWorld(stage);
const pieces = createPieces(renderer);
const sim = createSim({ seed: 7 });
const fx = createBattleFx(stage);
const cranes = [pieces.crane(0), pieces.crane(1)];
scene.add(cranes[0].group, cranes[1].group);
const pinMesh = pieces.pin();
scene.add(pinMesh);
const marks = [pieces.crownMark(0), pieces.crownMark(1)];
scene.add(...marks);
const hud = createHud({ onPause: () => openPause() });

const G = {
  phase: 'intro', phaseT: 0, side: 0, turns: [0, 0], cards: [], card: null, cardIdx: 0, action: null, plan: null, planner: null,
  buildT: 0, aimT: 0, aimStep: 'power', theta: 0.7, power: 0, hang: null, hangSide: 0, hangKey: '', shot: null, shotHit: false,
  slowT: 0, slowRate: 1, freeze: 0, paused: false, over: false, crownT: 0, builds: [0, 0], danger: [false, false],
  prevRel: null, topT: 0, sparkT: 0, strMax: [1, 1], strStart: [0, 0], sunkStart: 0,
  blocks: [BUDGET.base, BUDGET.base], sudden: false, suddenLeft: [0, 0], remoteDone: null, remoteThrow: null,
  zoom: null, trailRec: null, lastTrail: null, said: {},
  stats: { pb: [0, 0], pt: [0, 0], hits: [0, 0], sunk: [0, 0] },
  // (a turn's count, the same on both phones of a friend battle: each message says which turn it belongs to; the
  // friend's messages wait in `inbox` until this phone gets there; `heard` s since the friend was last heard;
  // `resolving`: a move is playing out, the only time a friend battle's world moves; `steps` it has taken)
  turnNo: 0, inbox: [], heard: 0, resolving: false, steps: 0,
  // (the side whose turn ended last; a crown that reaches the sea after its turn ended; where the throw left from;
  // each crown's glass and place when the turn began; which card is open)
  lastSide: null, lateSink: false, lateTurn: false, shotX0: null, crownStart: [0, 0], crownAt: [0, 0], modal: null,
};
const mOf = (px) => px / PX;
const topM = (side) => -mOf(sim.towerTopY(side));
foeName = FRIEND ? T.friend : T.rikus;
G.blocks[ME] = BUDGET.base + myBonus;
G.blocks[FOE] = BUDGET.base + (FRIEND ? 0 : BUDGET.rikusBonus);
function nameBars() {
  const n = [];
  n[ME] = T.you;
  n[FOE] = foeName;
  hud.setNames(n);
  hud.setMe(ME);
}
nameBars();
const turnLabel = (side) => (side === ME ? T.yourTurn : FRIEND ? T.theirTurn(foeName) : T.rikusTurn);
function slow(t, rate) {
  if (calm) return;
  if (t > G.slowT) G.slowT = t;
  G.slowRate = Math.min(G.slowT > 0 ? G.slowRate : 1, rate);
}

// ------------------------------------------------------------------------------------------------ the blocks
const meshes = new Map();
function meshFor(e) {
  let g = meshes.get(e.id);
  if (!g) {
    g = pieces.block(e.shape, e.side, e.element, skins[e.side]);
    scene.add(g);
    meshes.set(e.id, g);
  }
  return g;
}
/**
 * Every block where the physics has it — drawn between the last two physics steps (`alpha`), so the motion is smooth
 * whatever the phone's frame rate; a Perfek's slide into the middle glides instead of jumping.
 */
function syncMeshes(alpha, dt) {
  for (const e of sim.entries) {
    const g = e.alive ? meshFor(e) : meshes.get(e.id);
    if (!g) continue;
    if (!e.alive) { g.visible = false; continue; }
    const b = e.body;
    const has = e.ix !== undefined;
    const x = has ? e.ix + (b.position.x - e.ix) * alpha : b.position.x;
    const y = has ? e.iy + (b.position.y - e.iy) * alpha : b.position.y;
    const a = has ? e.ia + (b.angle - e.ia) * alpha : b.angle;
    const gl = g.userData.glide || 0;
    g.position.set(x / PX + gl, -y / PX, 0);
    g.rotation.z = -a;
    if (gl) g.userData.glide = Math.abs(gl) < 0.002 ? 0 : gl * Math.exp(-dt * 14);
    if (g.userData.boing > 0) {
      g.userData.boing -= dt;
      const k = Math.max(0, g.userData.boing / 0.45);
      g.scale.set(1 - 0.12 * Math.sin(k * 12) * k, 1 + 0.22 * Math.sin(k * 12) * k, 1);
    }
  }
}
const scr = new THREE.Vector3();
// (the stage's size, measured when it changes, not every frame: reading it there forces the page's layout)
let stageRect = stageEl.getBoundingClientRect();
const stageBox = () => stageRect;
const remeasure = () => { stageRect = stageEl.getBoundingClientRect(); };
if (typeof ResizeObserver === 'function') new ResizeObserver(remeasure).observe(stageEl);
addEventListener('resize', remeasure);
const toScreen = (x, y, z = 0, r = stageBox()) => {
  scr.set(x, y, z).project(camera);
  return { x: ((scr.x + 1) / 2) * r.width, y: ((1 - scr.y) / 2) * r.height };
};
/**
 * A word over a point of the world: it stays on that point while the camera moves (the zoom). Words never print over
 * each other or over the big banner. A word floats up as it fades (bt-rise), so a new word never goes above an older
 * one (into its path): it lines up below it; by the banner, the words line up below the banner, far enough down that
 * their float never reaches it.
 */
const calls = [];
const chipOf = (g) => g?.children[0]?.material?.chip || pieces.M.sandstone;
const LINE = 32;          // px between words in a column
const RISE = 44;          // how far a word floats up over its life (px, at most)
const UNDER_BANNER = 70;  // a word's foot this far below the banner (its height + its float)
const inBand = (y, b) => !!b && y > b.top - 30 && y < b.bottom + UNDER_BANNER;
/** On an earlier word `q` now, or in its path up: a word at (x, y) would print over it. */
const onWord = (q, x, y) => Math.abs(q.x - x) < 150 && y > q.y - RISE - LINE + 2 && y < q.y + LINE - 2;
/** Where a word that wants (x, y) goes: below the banner if it's there, below any word it would print over. */
function freeSpot(x, y, placed, b, under) {
  let yy = y;
  if (b && (under || inBand(yy, b))) yy = Math.max(yy, b.bottom + UNDER_BANNER);
  for (let k = 0; k < 10; k++) {
    const hit = placed.filter((q) => onWord(q, x, yy));
    if (!hit.length) break;
    yy = Math.max(...hit.map((q) => q.y)) + LINE;
  }
  return yy;
}
function callout(text, px, py, kind) {
  const p = new THREE.Vector3(px / PX, -py / PX + 2.2, 0);
  const now = performance.now();
  const r = stageBox();
  const clampX = (x) => Math.max(70, Math.min(r.width - 70, x));
  const s = toScreen(p.x, p.y, 0, r);
  const b = hud.bannerBox();
  const placed = calls.filter((c) => c.el.isConnected).map((c) => ({ x: clampX(c.x), y: c.y }));
  const under = inBand(s.y, b);
  const y = freeSpot(clampX(s.x), s.y, placed, b, under);
  calls.push({ el: hud.callout(text, s.x, y, kind), p, dy: y - s.y, t0: now, x: s.x, y, under });
}
function trackCallouts() {
  if (!calls.length) return;
  const r = stageBox();
  const clampX = (x) => Math.max(70, Math.min(r.width - 70, x));
  const now = performance.now();
  const b = hud.bannerBox();
  // every frame, oldest first, the same rules; a word that had to move keeps its new place (nothing jumps back)
  const placed = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (now - c.t0 > 1600 || !c.el.isConnected) { calls.splice(i, 1); i--; continue; }
    const s = toScreen(c.p.x, c.p.y, 0, r);
    if (b && !c.under && inBand(s.y + c.dy, b)) c.under = true;
    const x = clampX(s.x);
    const y = freeSpot(x, s.y + c.dy, placed, b, c.under);
    c.dy = y - s.y;
    c.x = s.x;
    c.y = y;
    placed.push({ x, y });
    hud.place(c.el, s.x, y);
  }
}
/** Once per turn, a word for what an element did (it can fire on several blocks at once). */
function sayOnce(key, text, px, py, kind = 'is-gold') {
  if (G.said[key]) return;
  G.said[key] = true;
  callout(text, px, py, kind);
}

// --------------------------------------------------------------------------------------------- the turns
function setPhase(p) { G.phase = p; G.phaseT = 0; }
function startTurn(side) {
  G.side = side;
  G.turnNo++;
  G.heard = 0;
  G.crownT = 0;
  G.lateSink = false;
  G.cards = offer(rand);
  G.card = null;
  G.action = null;
  G.plan = null;
  G.planner = null;
  G.shot = null;
  G.shotHit = false;
  G.flight = null;
  G.prevRel = null;
  G.zoom = null;
  G.crownFall = null;
  G.said = {};
  G.strStart = [sim.strength(0), sim.strength(1)];
  G.crownStart = [sim.crowns[0].hp, sim.crowns[1].hp];
  G.crownAt = [sim.crowns[0].body.position.x, sim.crowns[1].body.position.x];
  G.shotX0 = null;
  G.wind = windFor(rand);   // (after the cards: the same order on both phones of a friend battle)
  sim.setWind(G.wind);
  if (FRIEND) sim.reseed((Math.imul(SEED | 0, 2654435761 | 0) + G.turnNo) >>> 0);   // (the fire's luck, the same on both)
  for (const c of cranes) c.setWind(G.wind);
  G.sunkStart = G.stats.sunk[side];
  G.remoteDone = null;
  G.remoteThrow = null;
  cranes[side].park(false);
  cranes[1 - side].park(true);
  const left = G.sudden ? T.suddenLeft(G.suddenLeft[side]) : T.blocksLeft(G.blocks[side]);
  const lastChance = G.sudden && sim.crownLost(side) && !sim.crownLost(1 - side);   // (the answer throw)
  if (lastChance) {
    hud.banner(side === ME ? T.lastChanceMe : T.lastChanceFoe(foeName), { sub: side === ME ? T.lastChanceSub : T.lastChanceFoeSub, kind: side === ME ? 'is-me' : 'is-foe', ms: 2200 });
    sfx('horn');
  } else {
    hud.banner(turnLabel(side), { sub: left, kind: side === ME ? 'is-me' : 'is-foe', ms: 1250 });
    sfx('banner');
  }
  updateTop();
  if (side === ME) {
    setPhase('pick');
    hud.hideTap();
    showMyCards(0);
  } else {
    setPhase('other');
    hud.hideCards();
    hud.showTap(FRIEND ? T.friendThinks(foeName) : T.rikusThinks, '', null);
  }
}
function showMyCards(selected) {
  hud.showCards(G.cards, onChoose, { selected, throwOnly: G.sudden, img: (c) => pieces.cardImage(c.shape, c.element, skins[ME]) });
}
function onChoose(i, action) {
  if (G.phase !== 'pick') return;
  if (G.sudden && action === 'build') return;
  G.cardIdx = i;
  G.card = G.cards[i];
  showHanging(ME, G.card);
  sfx('click');
  if (FRIEND && conn) conn.send({ t: 'pick', i, n: G.turnNo });
  if (action) { buzz('tap'); beginAction(action); }
}
function showHanging(side, card) {
  const key = `${side}|${card.shape}|${card.element}`;
  if (G.hang && G.hangKey === key) return;
  clearHanging();
  const g = pieces.block(card.shape, side, card.element, skins[side]);
  g.position.y = -g.userData.top;
  cranes[side].hold.add(g);
  G.hang = g;
  G.hangSide = side;
  G.hangKey = key;
}
function clearHanging() {
  if (G.hang) G.hang.parent?.remove(G.hang);
  G.hang = null;
  G.hangKey = '';
}
function beginAction(action) {
  G.action = action;
  hud.hideCards();
  const mine = G.side === ME;
  const el = T.el[G.card.element];
  if (action === 'build') {
    setPhase('build');
    G.buildT = 0;
    hud.showTap(mine ? T.tapDrop : turnLabel(G.side), `${T.names[G.card.shape]} · ${el.build}`, mine ? backToCards : null);
  } else {
    setPhase('aim');
    G.aimT = 0;
    G.aimStep = 'power';
    G.power = 0;
    fx.lastTrail(mine ? G.lastTrail : null);   // (the owner's pick: "Your last throw's trail" as the only help)
    hud.showTap(mine ? T.tapPower : turnLabel(G.side), mine ? (G.lastTrail ? T.lastTrail : `${T.names[G.card.shape]} · ${el.throw}`) : `${T.names[G.card.shape]} · ${el.throw}`, mine ? backToCards : null);
  }
}
function backToCards() {
  if (G.side !== ME || (G.phase !== 'build' && G.phase !== 'aim')) return;
  hud.power(false);
  pinMesh.visible = false;
  fx.lastTrail(null);
  setPhase('pick');
  hud.hideTap();
  showMyCards(G.cardIdx);
}
/** The trolley over `side`'s tower (px, px/s): wider and quicker with every block that side has built. */
function trolley(side) {
  const n = G.builds[side];
  const A = Math.min(BUILD.ampMax, BUILD.amp0 + BUILD.ampPer * n);
  const w = Math.min(BUILD.wMax, BUILD.w0 + BUILD.wPer * n);
  const t = G.buildT;
  return { x: towerX(side) + A * Math.sin(w * t), vx: A * w * Math.cos(w * t), ax: -A * w * w * Math.sin(w * t) };
}
function dropBlock(remote = null) {
  const g = G.hang;
  if (!g) return;
  const side = G.side;
  const wp = new THREE.Vector3();
  g.getWorldPosition(wp);
  const tr = trolley(side);
  const at = remote || { x: wp.x * PX, y: -wp.y * PX, vx: tr.vx / 60 };
  const e = sim.release(side, G.card.shape, G.card.element, at.x, at.y, at.vx);
  G.resolving = true;
  G.steps = 0;
  if (FRIEND && conn && side === ME) conn.send({ t: 'build', i: G.cardIdx, x: at.x, y: at.y, vx: at.vx, n: G.turnNo });
  if (!G.sudden) G.blocks[side] = Math.max(0, G.blocks[side] - 1);
  scene.attach(g);
  g.rotation.set(0, 0, 0);
  meshes.set(e.id, g);
  G.hang = null;
  G.hangKey = '';
  G.builds[side]++;
  G.shot = e;
  sfx('drop');
  if (side === ME) buzz('tap');
  hud.hideTap();
  updateTop();
  setPhase('settle');
}
function throwBlock(theta, power) {
  const g = G.hang;
  if (!g) return;
  const side = G.side;
  const p = sim.predict(side, G.card.shape, theta, power);
  const e = sim.launch(side, G.card.shape, G.card.element, theta, p.perfect, power);
  G.resolving = true;
  G.steps = 0;
  G.shotX0 = p.x0;
  // (the camera glides in with it: the steps to its first touch, the side where it comes down)
  G.flight = { step0: sim.stepN, steps: Math.max(30, (p.path.length - 1) * 2), side: p.hit.side ?? nearestSide(p.hit.x), tx: mOf(p.hit.x), ty: Math.max(0, -mOf(p.hit.y)) };
  if (FRIEND && conn && side === ME) conn.send({ t: 'throw', i: G.cardIdx, theta, power, n: G.turnNo });
  if (!G.sudden) G.blocks[side] = Math.max(0, G.blocks[side] - 1);
  updateTop();
  scene.attach(g);
  g.rotation.set(0, 0, 0);
  meshes.set(e.id, g);
  G.hang = null;
  G.hangKey = '';
  G.shot = e;
  G.shotHit = false;
  G.trailRec = side === ME ? [] : null;
  cranes[side].whip(power);
  cranes[side].park(true, true);   // (the jib swings away as the block flies: nothing to fly through)
  pinMesh.visible = false;
  hud.power(false);
  fx.lastTrail(null);
  fx.sparkle(new THREE.Vector3(mOf(p.x0), -mOf(p.y0) + 0.6, 0), 14, '#ffffff', 5);
  fx.trail(g, p.perfect, G.card.element);
  sfx('fling');
  if (side === ME) buzz('tap');
  if (p.perfect) {
    G.stats.pt[side]++;
    fx.sparkle(new THREE.Vector3(mOf(p.x0), -mOf(p.y0), 0), 36);
    callout(T.perfectThrow, p.x0, p.y0 - 40, 'is-gold');
    sfx('perfect');
    if (side === ME) buzz('perfect');
  }
  hud.hideTap();
  setPhase('flight');
}
/**
 * After `thrower`'s turn, a crown in the sea: 'win', 'lose' or 'draw' (this phone's side of it), or 'answer' — sudden
 * death goes in rounds, like penalties: when the first throw of a round puts the other side's crown in the sea, that
 * side still answers; knock theirs off too and it's a draw (the owner must never lose without a throw). null: both
 * crowns stand.
 */
function seaOutcome(thrower) {
  const lostMe = sim.crownLost(ME);
  const lostFoe = sim.crownLost(FOE);
  if (!lostMe && !lostFoe) return null;
  const answerer = 1 - thrower;
  if (G.sudden && G.suddenLeft[answerer] > G.suddenLeft[thrower] && sim.crownLost(answerer) && !sim.crownLost(thrower)) return 'answer';
  return lostMe && lostFoe ? 'draw' : lostFoe ? 'win' : 'lose';
}
function endTurn() {
  if (G.over) return;
  fx.stopTrail();
  hud.power(false);
  pinMesh.visible = false;
  cranes[G.side].park(true);
  G.turns[G.side]++;
  G.lastSide = G.side;
  if (G.sudden) G.suddenLeft[G.side] = Math.max(0, G.suddenLeft[G.side] - 1);
  const sea = seaOutcome(G.side);
  if (sea === 'answer') { setPhase('between'); return; }   // (startTurn says it: LAASTE KANS)
  if (sea) { gameOver(sea, 'sea'); return; }
  // what this turn did to the other side (the owner: "it doesnt indecate any damage?")
  if (G.action === 'throw') {
    const foe = 1 - G.side;
    const drop = Math.max(0, G.strStart[foe] - sim.strength(foe));
    const pct = Math.round((drop / Math.max(1, G.strMax[foe])) * 100);
    const sunk = G.stats.sunk[G.side] - G.sunkStart;
    const kind = G.side === ME ? 'is-me is-dmg' : 'is-foe is-dmg';
    const crown = sim.crowns[foe];
    // (their crown counts too: cracks in its glass, or an open crown knocked along)
    const glass = Math.max(0, G.crownStart[foe] - crown.hp);
    const shoved = crown.alive && Math.abs(crown.body.position.x - G.crownAt[foe]) > 18;
    if (sunk >= 2) {   // (a tower coming down: the big moment of a turn)
      hud.banner(T.towerDown, { sub: `${T.damage(pct)} · ${T.lostBlocks(sunk)}`, kind, ms: 1900 });
      sfx('thunder');
      stage.shake(0.8);
    } else if (pct > 0) hud.banner(T.damage(pct), { sub: sunk ? T.lostBlocks(sunk) : '', kind, ms: 1500 });
    else if (glass && crown.hp > 0) hud.banner(foe === ME ? T.glassCrackMine : T.glassCrackTheirs, { sub: T.glassLeft(crown.hp), kind, ms: 1500 });
    else if (glass) hud.banner(foe === ME ? T.glassMine : T.glassTheirs, { sub: T.glassSub, kind, ms: 1500 });
    else if (shoved) hud.banner(T.crownShove, { kind, ms: 1300 });
    else hud.banner(T.noDamage, { kind: 'is-small', ms: 1100 });
  }
  if (G.sudden && G.suddenLeft[0] <= 0 && G.suddenLeft[1] <= 0) { gameOver('draw', 'sudden'); return; }
  setPhase('between');
}
/** Who plays next: the other side while it has blocks, else this one; both out: null (sudden death). */
function nextSide(prev) {
  const other = 1 - prev;
  if (G.sudden) return G.suddenLeft[other] > 0 ? other : prev;
  if (G.blocks[other] > 0) return other;
  if (G.blocks[prev] > 0) return prev;
  return null;
}
function nextTurn() {
  const n = nextSide(G.side);
  if (n != null) { startTurn(n); return; }
  G.sudden = true;
  G.suddenLeft = [BUDGET.sudden, BUDGET.sudden];
  sim.openCrowns();   // (both glasses burst: whoever knocks a crown off first wins)
  hud.banner(T.sudden, { sub: T.suddenSub, kind: 'is-dmg', ms: 2200 });
  sfx('horn');
  const turn = G.turnNo;
  setTimeout(() => { if (!G.over && G.turnNo === turn && G.phase === 'wait' && !G.lateSink) startTurn(1 - G.side); }, 2200);
  setPhase('wait');
}
/**
 * (against Rikus) A crown that reached the sea after its turn had ended (it slid off slowly, past the turn's time):
 * that turn's result after all — the battle ends, or in sudden death the other side gets its answer throw.
 */
function lateSink() {
  const cut = G.lateTurn;   // (a turn that had begun waits: it starts again, or the battle ends)
  G.lateSink = false;
  G.lateTurn = false;
  if (G.over) return;
  const sea = seaOutcome(G.lastSide ?? G.side);
  if (sea === 'answer') startTurn(1 - (G.lastSide ?? G.side));
  else if (sea) gameOver(sea, 'sea');
  else if (cut) startTurn(G.side);
  else if (G.phase === 'wait') startTurn(1 - G.side);
}
/** The camera's close look at the tower where something just happened (the owner: "zoom in on the tower"). */
function zoomAt(side, secs = 2.8) {
  if (G.zoom && (calm || G.zoom.side === side)) { G.zoom.t = Math.max(G.zoom.t, secs); return; }
  G.zoom = { side, t: secs };
}
const nearestSide = (x) => (Math.abs(x - sideX(0)) < Math.abs(x - sideX(1)) ? 0 : 1);
/**
 * The shot came down here (px): after the close look, the camera stays on that tower, not on the one the throw was
 * predicted to reach (the owner, 18 Oct: Rikus's block came over, then "the camera went to his side without showing
 * the impact").
 */
function cameDown(x, y = 0, side = nearestSide(x)) {
  if (G.flight) Object.assign(G.flight, { side, tx: mOf(x), ty: Math.max(0, -mOf(y)) });
}

// ----------------------------------------------------------------------------------------- what happens
const seen = {};   // (tests: how often each event came)
function handle(events) {
  for (const ev of events) {
    seen[ev.type] = (seen[ev.type] || 0) + 1;
    const e = ev.entry;
    const mine = e && e.side === ME;
    const at = ev.x != null ? new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0) : null;
    switch (ev.type) {
      case 'land': {
        const g = meshes.get(e.id);
        if (ev.snapDx) {   // (the slide into the middle glides over a moment instead of jumping)
          if (e.ix !== undefined) e.ix += ev.snapDx;
          if (g) g.userData.glide = (g.userData.glide || 0) - ev.snapDx / PX;
        }
        fx.land({ x: mOf(ev.x), y: -mOf(ev.y) }, ev.rating, e.w / PX);
        if (g && e.role === 'built' && e.element === 'plof') pieces.springCoil(g);
        if (g && e.role === 'built' && e.element === 'water') pieces.waterSkin(g);
        if (ev.rating === 'P') {
          if (g && !g.userData.seamMesh) g.userData.seamMesh = pieces.seam(g);
          G.stats.pb[e.side]++;
          if (!G.sudden && e.role === 'built') { G.blocks[e.side] += BUDGET.perfectBack; setTimeout(() => callout(T.perfectBack, ev.x, ev.y - e.h - 40, 'is-gold'), 380); }
          callout(T.perfect, ev.x, ev.y - e.h, 'is-gold');
          sfx('perfect');
          if (mine) buzz('perfect');
        } else {
          callout(ev.rating === 'G' ? T.good : T.skew, ev.x, ev.y - e.h, ev.rating === 'G' ? '' : 'is-dim');
          sfx(ev.rating === 'G' ? 'land' : 'skew');
        }
        break;
      }
      case 'hit': {
        if (e !== G.shot || G.shotHit) break;
        G.shotHit = true;
        if (G.trailRec) { G.lastTrail = G.trailRec; G.trailRec = null; }
        const k = Math.min(1.6, (ev.speed / LAUNCH.V0) * Math.sqrt(e.body.mass / 2.4));
        const dir = new THREE.Vector3(Math.sign(e.body.velocity.x) || towardFoe(e.side), 0.2, 0);
        const struck = ev.other && ev.other.kind !== 'stack' ? meshes.get(ev.other.id) : null;
        fx.hit(at, dir, k, struck ? chipOf(struck) : null);
        fx.stopTrail();
        stage.shake(0.3 + 0.45 * k);
        const foeHit = ev.other && ev.other.kind !== 'stack' && ev.other.side !== e.side;
        zoomAt(nearestSide(ev.x));
        cameDown(ev.x, ev.y);
        // (weight: a heavy hit holds the moment, the camera punches in, a deep drum under the crash)
        if (foeHit && ev.onto === 'crown') { G.freeze = calm ? 0 : 0.07; slow(0.7, 0.32); } else if (foeHit && k > 0.75) { G.freeze = calm ? 0 : 0.05; slow(0.65, 0.34); } else slow(0.6, 0.38);
        cam.punch = calm ? 0 : Math.min(1, 0.35 + k * 0.5);
        sfx('clash');
        sfx('land');
        sfx('drum', { v: Math.min(1, 0.4 + k * 0.5) });
        if (e.side === ME) buzz('heavy');
        if (foeHit) G.stats.hits[e.side]++;
        if (foeHit && ev.onto === 'crown' && ev.other.hp > 0) { hud.banner(T.crownHit, { kind: e.side === ME ? 'is-me' : 'is-foe', ms: 1100 }); sfx('warning'); }
        if (G.phase === 'flight') setPhase('settle');
        break;
      }
      case 'damage': {
        const g = meshes.get(e.id);
        if (e.role === 'crown') {
          if (g && e.hp > 0) { pieces.glassCrack(g, e.hpMax - e.hp); sfx('zap'); callout(T.glassCracked, ev.x, ev.y - 30, 'is-dmg'); }
          break;
        }
        if (g && e.hp > 0) pieces.crack(g, e.hpMax - e.hp);
        if (ev.by !== 'blast') callout(`−${ev.n}`, ev.x, ev.y, 'is-dmg');   // (an explosion says BOEM once: its cracks show the rest)
        if (e.hp > 0 && ev.by !== 'fire') fx.hit(at, new THREE.Vector3(0, 1, 0), 0.4, g ? chipOf(g) : null);
        break;
      }
      case 'glass': {
        const g = meshes.get(e.id);
        if (g) pieces.glassBreak(g);
        fx.shatter(at, pieces.M.glassShard, { n: 20, size: 0.55 });
        fx.sparkle(at, 50, '#e8f4ff', 10);
        if (ev.why === 'sudden') { sfx('zap'); break; }
        if (!calm) { hud.flash('#eaf6ff', 150); cam.punch = 0.8; }
        hud.banner(e.side === ME ? T.glassMine : T.glassTheirs, { sub: T.glassSub, kind: e.side === ME ? 'is-foe' : 'is-me', ms: 1600 });
        sfx('clash');
        sfx('zap');
        stage.shake(0.6);
        slow(0.4, 0.4);
        zoomAt(e.side, 2.2);
        if (e.side === ME) buzz('heavy');
        break;
      }
      case 'splash': {
        const size = Math.min(2, 0.45 + Math.sqrt(ev.mass) * 0.35 + Math.abs(ev.vy) * 0.02);
        fx.splash(mOf(ev.x), { size });
        sfx('splash');
        if (e && e === G.shot) {
          fx.stopTrail();
          cameDown(ev.x);
          if (G.trailRec) { G.lastTrail = G.trailRec; G.trailRec = null; }
          if (e.role === 'built' && !e.landed) callout(T.missBuild, ev.x, -40, 'is-dim');
          else if (e.role === 'proj' && G.phase === 'flight') {
            // (backwards: it came down behind where it left from; a weak throw that falls short is only a splash)
            const back = G.shotX0 != null && (ev.x - G.shotX0) * towardFoe(e.side) < 0;
            callout(back ? T.backwards : T.splash, ev.x, -40, back ? 'is-dmg' : 'is-dim');
          }
          if (G.phase === 'flight') setPhase('settle');
        } else if (e && e.role !== 'proj' && e.role !== 'crown' && e.side !== G.side) G.stats.sunk[G.side]++;
        break;
      }
      case 'crown': {
        if (G.crownT > 0 || G.over) break;
        G.crownT = 1.9;   // (then the winner's crown)
        // (after its turn had ended: that turn's result, once the moment has played; a turn already begun waits. A
        // friend battle's world stands still between turns: there it can't happen)
        if (!FRIEND && !['flight', 'settle'].includes(G.phase)) {
          G.lateSink = true;
          if (['pick', 'other', 'build', 'aim'].includes(G.phase)) {
            G.lateTurn = true;
            hud.hideCards();
            hud.hideTap();
            hud.power(false);
            pinMesh.visible = false;
            clearHanging();
            setPhase('wait');
          }
        }
        const minelost = ev.side === ME;
        hud.banner(T.crownSea, { kind: minelost ? 'is-foe' : 'is-me', ms: 2200 });
        slow(1.0, 0.4);
        stage.shake(1.1);
        zoomAt(ev.side, 3);
        sfx(minelost ? 'lost' : 'milestone');
        buzz(minelost ? 'lost' : 'heavy');
        break;
      }
      case 'blast': {
        fx.boom(at, 9);
        fx.stopTrail();
        stage.shake(1.5);
        if (!calm) { hud.flash('#ffd2a0', 200); cam.punch = 1; }
        sfx('drum', { v: 1 });
        if (!calm) G.freeze = 0.05;
        slow(0.5, 0.35);
        zoomAt(nearestSide(ev.x));
        cameDown(ev.x, ev.y);
        callout(T.boom, ev.x, ev.y - 60, 'is-boom');
        sfx('thunder');
        sfx('clash');
        buzz('heavy');
        if (G.trailRec) { G.lastTrail = G.trailRec; G.trailRec = null; }
        if (G.phase === 'flight') setPhase('settle');
        break;
      }
      case 'break': {
        const g = meshes.get(e.id);
        fx.shatter(at, chipOf(g), { n: 14, size: Math.max(0.8, e.w / PX / 3.5) });
        sayOnce('smashed', T.smashed, ev.x, ev.y - 50);
        sfx('clash');
        stage.shake(0.5);
        break;
      }
      case 'dissolve': {   // (the thrown block breaks apart: "the block that is thrown disapears")
        const g = meshes.get(e.id);
        fx.shatter(at, chipOf(g), { n: 10, size: Math.max(0.6, e.w / PX / 4) });
        if (e.element) fx.sparkle(at, 24, ELEMENT[e.element].color, 7);
        break;
      }
      case 'ignite': {
        sayOnce('fire', T.fireStart, ev.x, ev.y - 50);
        fx.sparkle(at, 16, '#ffb24a', 5);
        if (!G.said.fireSnd) { G.said.fireSnd = true; sfx('heat'); sfx('thunder', { v: 0.4 }); }
        break;
      }
      case 'grab': {
        // (the vines climb over the rock's edge each block is dragged to, and loop round it)
        const items = ev.list.map((o) => ({ target: meshes.get(o.id), side: o.vineDir || 1, edgeX: (sideX(ev.side) + (o.vineDir || 1) * (STACK.w / 2 - 4)) / PX, rimY: STACK_TOP })).filter((it) => it.target);
        const from = new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0);
        fx.vines(items, (m) => ev.list.some((o) => meshes.get(o.id) === m && o.alive && o.vineT > 0));
        fx.sparkle(from, 30, '#8bea5c', 6);
        // (every time, with the way they pull: to the cliff edge facing the thrower. The owner, 18 Oct, chose to keep the
        // pull and make it obvious: a block sliding towards the thrower looked like "the physics just jamed out")
        const pull = ev.list[0]?.vineDir || 1;
        const held = ev.list[0]?.body?.position || { x: ev.x, y: ev.y };
        callout(`${T.vinesGrab} ${pull < 0 ? '⟵' : '⟶'}`, held.x, held.y - 60, 'is-dmg');   // (on the block they pull)
        slow(0.7, 0.5);
        sfx('creak');
        sfx('wind', { v: 0.5 });
        zoomAt(ev.side, 3);
        if (G.zoom) G.zoom.edge = (sideX(ev.side) + pull * (STACK.w / 2)) / PX;   // (the edge they pull to, in the picture)
        break;
      }
      case 'wave': {
        fx.wave(new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0), ev.dir, Math.min(2.2, Math.max(1, (-mOf(ev.y) - STACK_TOP) / 2.6)), STACK_TOP + 0.05, (sideX(ev.side) + ev.dir * STACK.w / 2) / PX);
        sayOnce('wave', T.waveHit, ev.x, ev.y - 50);
        stage.shake(0.7);
        sfx('splash');
        sfx('rain', { v: 0.6 });
        zoomAt(ev.side);
        break;
      }
      case 'wallburn': {
        fx.boom(at, 5);
        for (let i = 0; i < 6; i++) fx.flame(at, e.w / PX, 2);
        callout(T.wallBurn, ev.x, ev.y - 60, 'is-gold');
        sfx('heat');
        zoomAt(e.side, 2);
        cameDown(ev.x, ev.y, e.side);
        break;
      }
      case 'crownshove': {   // (an open crown knocked along)
        callout(T.crownShove, ev.x, ev.y - 40, 'is-dmg');
        sfx('clash');
        zoomAt(e.side, 2.6);
        break;
      }
      case 'dud': {   // (a backward throw onto its own side: it breaks apart, nothing of its own burns or blows up)
        fx.hit(at, new THREE.Vector3(0, 1, 0), 0.4, null);
        callout(T.backwards, ev.x, ev.y - 50, 'is-dmg');
        sfx('skew');
        break;
      }
      case 'douse': {   // (a Watervat nearby: the fire doesn't take)
        fx.steam(at, e.w / PX);
        callout(T.doused, ev.x, ev.y - 50, 'is-gold');
        sfx('splash', { v: 0.5 });
        break;
      }
      case 'burnout':
        if (ev.why === 'water') fx.steam(new THREE.Vector3(mOf(ev.x), -mOf(e.body.bounds.min.y), 0), e.w / PX);
        break;
      case 'burnup': {
        fx.shatter(at, pieces.M.timber, { n: 12, size: 0.7 });
        fx.stopTrail();
        if (G.phase === 'flight') setPhase('settle');
        break;
      }
      case 'soak': {
        if (meshes.get(e.id)) pieces.drySkin(meshes.get(e.id));
        fx.wave(at, towardFoe(e.side), 0.6);
        fx.splash(mOf(ev.x), { size: 0.8 });
        callout(T.soaked, ev.x, ev.y - 60, 'is-gold');
        sfx('splash');
        zoomAt(e.side, 2);
        cameDown(ev.x, ev.y, e.side);
        if (G.phase === 'flight') setPhase('settle');
        break;
      }
      case 'root': {
        for (const o of ev.list) { const g = meshes.get(o.id); if (g) pieces.vineWrap(g); }
        callout(T.rooted, e.body.position.x, e.body.bounds.min.y - 40, 'is-gold');
        sfx('creak');
        break;
      }
      case 'spring': {
        const g = meshes.get(e.id);
        if (g) { g.userData.boing = 0.45; pieces.dropCoil(g); }
        callout(T.sprung, ev.x, ev.y - 60, 'is-gold');
        sfx('pop');
        sfx('clown');
        // the shot flies back home: its next touch counts as a hit of its own. The moment the spring catches it is seen
        // at that tower first (a beat of slow motion), then the camera flies home with it (it used to turn away at once:
        // the impact was never seen)
        G.shotHit = false;
        G.shotX0 = null;
        G.zoom = { side: e.side, t: calm ? 0.8 : 1.1 };
        slow(0.5, 0.4);
        stage.shake(0.35);
        if (G.shot) fx.trail(meshes.get(G.shot.id), false, G.shot.element);
        if (G.flight) Object.assign(G.flight, { side: G.side, tx: towerX(G.side) / PX, ty: topM(G.side) });   // (then it goes back with it)
        break;
      }
      default:
        break;
    }
  }
}

// --------------------------------------------------------------------------------------------- the physics
let acc = 0;
function physics(dt) {
  // (a friend battle: the world moves only from a move until its turn's snapshot, so both phones step the same world
  // the same number of steps: what the other phone replays is what happened)
  if (FRIEND && !G.resolving) { acc = 0; return; }
  if (G.freeze > 0) { G.freeze -= dt; return; }
  const ts = G.slowT > 0 ? G.slowRate : 1;
  if (G.slowT > 0) { G.slowT -= dt; if (G.slowT <= 0) G.slowRate = 1; }
  acc += dt * ts * 60;
  let n = 0;
  while (acc >= 1 && n < 4) {
    for (const e of sim.entries) {
      if (!e.alive) continue;
      e.ix = e.body.position.x;
      e.iy = e.body.position.y;
      e.ia = e.body.angle;
    }
    sim.step();
    G.steps++;
    handle(sim.drain());
    // your throw's path, kept to show while you aim again ("your last throw's trail")
    if (G.trailRec && G.shot?.alive && G.shot.flying && sim.stepN % 2 === 0) G.trailRec.push({ x: mOf(G.shot.body.position.x), y: -mOf(G.shot.body.position.y) });
    acc -= 1;
    n++;
  }
  if (n === 4) acc = 0;
}
/** Fire on the blocks (and a Vuurmuur's small flame), soot as they burn, the firelight over them. */
const flameAt = new THREE.Vector3();
const fireSum = new THREE.Vector3();
const FIRE_LIGHT = new THREE.Vector3(0, 1.6, 2.4);   // (a little above and in front: it lights the faces you see)
function burning(dt) {
  let n = 0;
  fireSum.set(0, 0, 0);
  for (const e of sim.entries) {
    if (!e.alive) continue;
    const g = meshes.get(e.id);
    if (!g) continue;
    if (e.burnT > 0) {
      flameAt.set(mOf(e.body.position.x), -mOf(e.body.bounds.min.y) - 0.1, 0);
      fx.flame(flameAt, e.w / PX, 1);
      fireSum.add(flameAt);
      n++;
      g.userData.sootK = Math.min(1, (g.userData.sootK || 0) + dt / ELEMENT.vuur.secs);
      pieces.soot(g, g.userData.sootK);
    } else if (e.barrel && e.landed && Math.random() < 0.3) {
      flameAt.set(mOf(e.body.position.x), -mOf(e.body.bounds.min.y) - 0.05, 0);
      fx.drip(flameAt, e.w / PX);
    } else if (e.fireWall && e.landed && Math.random() < 0.35) {
      flameAt.set(mOf(e.body.position.x), -mOf(e.body.bounds.min.y) - 0.05, 0);
      fx.flame(flameAt, e.w / PX * 0.6, 0.35);
    }
  }
  fx.fireGlow(n ? fireSum.multiplyScalar(1 / n).add(FIRE_LIGHT) : null);
}

// ------------------------------------------------------------------------------------------- the landing guide
// (Stapel's own ghost) where the hanging block will land if dropped now: it falls with a little of the trolley's speed;
// gold when it lands within a Perfek of the block under it.
const ghost = { mesh: null, shape: null, gold: false };
const AIR = 1 - PHYSICS.block.frictionAir;
const under = { top: 0, sup: null };
function surfaceUnder(x, hw, side, list) {
  under.top = Math.abs(x - sideX(side)) < STACK.w / 2 ? STACK.topY : 60;
  under.sup = null;
  for (const e of list) {
    const b = e.body.bounds;
    if (b.max.x < x - hw + 4 || b.min.x > x + hw - 4) continue;
    if (b.min.y < under.top) { under.top = b.min.y; under.sup = e; }
  }
  return under;
}
const gpos = new THREE.Vector3();
function updateGhost() {
  const on = G.phase === 'build' && G.side === ME && G.hang;
  ghost.gold = false;
  if (!on) { if (ghost.mesh) ghost.mesh.visible = false; return; }
  if (ghost.shape !== G.card.shape) {
    if (ghost.mesh) scene.remove(ghost.mesh);
    ghost.mesh = pieces.ghost(G.card.shape);
    ghost.shape = G.card.shape;
    scene.add(ghost.mesh);
  }
  const s = shapeInfo(G.card.shape);
  const list = sim.entries.filter((e) => e.alive && !e.flying && e.role !== 'proj' && !(e.role === 'built' && !e.landed));
  G.hang.getWorldPosition(gpos);
  let x = gpos.x * PX;
  let y = -gpos.y * PX;
  let vx = (trolley(ME).vx / 60) * BUILD.carry;
  let vy = 0;
  const bottom = s.h - s.cy;
  let lx = null;
  let ly = 0;
  let sup = null;
  for (let i = 0; i < 240; i++) {
    vx *= AIR;
    vy = vy * AIR + G_STEP;
    x += vx;
    y += vy;
    const u = surfaceUnder(x, s.w / 2, ME, list);
    if (y + bottom >= u.top) { lx = x; ly = u.top - bottom; sup = u.sup; break; }
  }
  if (lx == null) { ghost.mesh.visible = false; return; }
  ghost.mesh.visible = true;
  ghost.mesh.position.set(lx / PX, -ly / PX, 0);
  const tol = sup ? Math.min(BUILD.perfectTol, BUILD.perfectFrac * sup.w) : 0;
  const tilt = sup ? Math.abs(Math.atan2(Math.sin(sup.body.angle), Math.cos(sup.body.angle))) : 1;
  ghost.gold = !!sup && sup.side === ME && tilt < 0.06 && Math.abs(lx - sup.body.position.x) <= tol;
  ghost.mesh.userData.gold(ghost.gold);
}

// ------------------------------------------------------------------------------------------- the throw's aim
/** The power bar (tap: hold it), then the direction pin (tap: let go). */
function aimTap() {
  if (G.aimStep === 'power') {
    G.power = powerAt(G.aimT);
    G.aimStep = 'angle';
    G.aimT = 0;
    hud.power(true, G.power, true);
    hud.showTap(T.tapAim, G.lastTrail ? T.lastTrail : '', backToCards);
    sfx('click');
    buzz('tap');
    return;
  }
  throwBlock(pinAngle(G.aimT), G.power);
}
function placePin(side, theta) {
  const p = sim.launchParams(side, G.card.shape);
  pinMesh.position.set(mOf(p.x0), -mOf(p.y0), 0);
  pinMesh.scale.setScalar(1);   // (the camera is close: PIN_REACH long)
  pinMesh.userData.aim(theta, towardFoe(side));
  pinMesh.visible = true;
}

// ------------------------------------------------------------------------------------------------ the cranes
const craneTx = [towerX(0) / PX, towerX(1) / PX];
const craneJib = [STACK_TOP + 18, STACK_TOP + 18];
function updateCranes(dt, time) {
  for (const side of [0, 1]) {
    const c = cranes[side];
    const topPx = sim.towerTopY(side);
    const holding = G.hang && G.hangSide === side;
    const blockTop = holding ? G.hang.userData.top : 0;
    const hangY = -mOf(topPx - BUILD.hang);
    const jibWant = Math.max(STACK_TOP + 16, hangY + blockTop + 0.85 + 3.4);
    craneJib[side] += (jibWant - craneJib[side]) * (1 - Math.exp(-dt * 2.5));
    let tx = towerX(side) / PX;
    let hookY = craneJib[side] - 3.2;
    let swing = 0;
    let exact = false;
    if (holding && G.phase === 'aim') {
      const p = sim.launchParams(side, G.card.shape);
      tx = mOf(p.x0);
      hookY = -mOf(p.y0) + blockTop + 0.85;
      exact = true;
    } else if (holding && G.phase === 'build') {
      const tr = trolley(side);
      tx = mOf(tr.x);
      hookY = hangY + blockTop + 0.85;
      swing = Math.max(-0.05, Math.min(0.05, -mOf(tr.ax) * 0.004));
      exact = true;
    } else if (holding) {
      hookY = hangY + blockTop + 0.85;
    }
    craneTx[side] = exact ? tx : craneTx[side] + (tx - craneTx[side]) * (1 - Math.exp(-dt * 5));
    c.set({ jibY: craneJib[side], tx: craneTx[side], hookY, swing });
    c.update(dt, time);
  }
}

// ------------------------------------------------------------------------------------------------ the camera
const FOV = 46;
const cam = { pos: new THREE.Vector3(0, 80, 240), look: new THREE.Vector3(0, 12, 0), tPos: new THREE.Vector3(0, 80, 240), tLook: new THREE.Vector3(0, 12, 0), k: 1.4, fov: FOV, tFov: FOV };
camera.position.copy(cam.pos);
camera.lookAt(cam.look);
const ELEV = (7 * Math.PI) / 180;   // (straight in front of the battle: looking down this little)
const YAW = (5 * Math.PI) / 180;    // (...and turned this little round, for depth)
const PIN_REACH = 6.8;              // the direction pin's length (m)
/**
 * The camera straight in front of the battle (the owner, 17 Oct 2026: picking a block "its fine but once you throw or
 * if Rikus throws then its at an akward angle"). It frames `points` (metres, [x, y]) with `pad` round them, from as
 * close as `minD` to as far as `maxD`. Points that don't fit by then are let go from the end of the list, and the frame
 * leans towards them as far as it can while the kept ones stay in the picture (a wide screen shows both towers, a
 * phone the one in play, turned towards the other). `yaw` (+1/-1) turns it a little towards that side.
 */
function sideOn(points, { pad = 2, minD = 22, maxD = 64, yaw = 0, lean = true, keep = 1, lift = 0 } = {}) {
  const vf = (FOV * Math.PI) / 360;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const box = (pts) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, x1, y0, y1, d: Math.max(((x1 - x0) / 2 + pad) / Math.tan(hf), ((y1 - y0) / 2 + pad) / Math.tan(vf), minD) };
  };
  let kept = points;
  let b = box(kept);
  while (b.d > maxD && kept.length > 1) { kept = kept.slice(0, -1); b = box(kept); }
  // (points let go: as wide as it may, to show as much as it can of the way to them)
  const d = kept.length < points.length ? Math.max(maxD, minD) : Math.min(b.d, Math.max(maxD, minD));
  let cx = (b.x0 + b.x1) / 2;
  let cy = (b.y0 + b.y1) / 2;
  if (lean && kept.length < points.length) {   // (lean towards the rest; the kept ones within `keep` of the middle)
    const all = box(points);
    const W = (Math.tan(hf) * d - pad) * keep;
    const H = (Math.tan(vf) * d - pad) * keep;
    cx = Math.min(Math.max((all.x0 + all.x1) / 2, b.x1 - W), b.x0 + W);
    cy = Math.min(Math.max((all.y0 + all.y1) / 2, b.y1 - H), b.y0 + H);
  }
  cy += lift * Math.tan(vf) * d;   // (`lift`: the picture's content a little lower, clear of the bars at the top)
  cam.tLook.set(cx, cy, 0);
  cam.tPos.set(cx + yaw * Math.sin(YAW) * d, cy + Math.sin(ELEV) * d, Math.cos(ELEV) * d);
  cam.tFov = FOV;
}
/** Side `z`'s tower, its foot and its crown, close (the zoom on a hit; the tower that's settling). */
function towerShot(z, { minD = 17, maxD = 40, up = 0, wide = 0, edge = null } = {}) {
  const c = sim.crowns[z];
  const xt = towerX(z) / PX;
  const cx = c.alive && !c.wet ? mOf(c.body.position.x) : sideX(z) / PX - towardFoe(z) * 4;
  const tz = Math.max(topM(z), STACK_TOP + 3);
  // (`edge`: a rock edge (m) that must be in the picture too: where vines drag the blocks over)
  const at = edge == null ? [] : [[edge, STACK_TOP + 1.5], [edge, STACK_TOP - 2]];
  sideOn([[xt - 3.6 - wide, tz + 2 + up], [xt + 3.6 + wide, tz + 2 + up], ...at, [xt, STACK_TOP - 1.5], [cx - 2.2, STACK_TOP + 3.2], [cx + 2.2, STACK_TOP + 3.2]], { pad: 1.5, minD, maxD: edge == null ? maxD : maxD + 8, yaw: -towardFoe(z) });
}
/** Aiming on side `s`: its launch point and the pin's whole half circle, its tower; the other tower if it fits too. */
function aimShot(s) {
  const p = sim.launchParams(s, G.card?.shape || 'cube');
  const lx = mOf(p.x0);
  const ly = -mOf(p.y0);
  const o = 1 - s;
  sideOn([[lx - PIN_REACH, ly + 0.6], [lx + PIN_REACH, ly + 0.6], [lx, ly + PIN_REACH + 0.6], [towerX(s) / PX, STACK_TOP - 1], [towerX(o) / PX, topM(o) + 1.5], [towerX(o) / PX, STACK_TOP - 1]], { pad: 1.8, maxD: 58, yaw: -towardFoe(s), lean: false });
}
/** A throw in the air: the camera goes with it (the block kept in the picture), and arrives where it will come down. */
function flightShot() {
  const f = G.flight;
  const b = G.shot;
  if (!f || !b || !b.alive) return false;
  // (the block, and a little ahead of it along its path: both kept in the picture, so the camera never trails it out)
  const bx = mOf(b.body.position.x);
  const by = -mOf(b.body.position.y);
  const ax = mOf(b.body.position.x + b.body.velocity.x * 7);
  const ay = -mOf(b.body.position.y + b.body.velocity.y * 7);
  sideOn([[bx, by], [ax, ay], [f.tx, f.ty + 1.5], [f.tx, Math.max(0, STACK_TOP - 1.5)]], { pad: 3, minD: 20, maxD: 56, yaw: -towardFoe(f.side), keep: 0.5, lift: 0.1 });
  return true;
}
function camTargets(dt) {
  const s = G.side;
  const xs = towerX(s) / PX;
  const dir = towardFoe(s);
  const ts = topM(s);
  const you = topM(ME);
  const xMe = sideX(ME) / PX;
  const dMe = towardFoe(ME);
  let k = 2.2;
  const set = (p, l) => { cam.tPos.set(...p); cam.tLook.set(...l); };
  cam.tFov = FOV;
  // a crown going over the edge: the shot that follows it down into the sea (the battle's big moment)
  if (G.crownFall && !G.over) {
    const z = G.crownFall.side;
    const c = sim.crowns[z];
    const out = G.crownFall.out;
    const cx = mOf(c.body.position.x);
    const cy = Math.max(1.2, -mOf(c.body.position.y));
    set([cx + out * 11, cy + 2.6, 19], [cx - out * 1.4, cy - 1.1, 0]);
    cam.k = 6;
    return;
  }
  // the zoom on the tower where something happened, for a moment (the owner: "zoom in on the tower that is getting
  // damaged"), straight in front of it
  if (G.zoom && !G.over) {
    G.zoom.t -= dt;
    if (G.zoom.t <= 0) G.zoom = null;
    else {
      towerShot(G.zoom.side, { edge: G.zoom.edge ?? null });
      cam.k = calm ? 4 : 3;
      return;
    }
  }
  // (a side's tower as it is picked from: the view he likes)
  const pickView = (z) => set([sideX(z) / PX + towardFoe(z) * 1.5, topM(z) + 2.5, 38], [sideX(z) / PX + towardFoe(z) * 0.5, topM(z) - 0.5, 0]);
  switch (G.phase) {
    case 'intro':
      if (G.phaseT < 0.4) set([0, 80, 240], [0, 12, 0]);
      else set([xMe + dMe * 4, you + 9, 52], [xMe + dMe * 2, you + 3, 0]);
      k = 0.9;
      break;
    case 'wait':
      if (!G.turns[0] && !G.turns[1] && !G.sudden) {   // (the first-time tip: the intro's view holds, then the cards)
        set([xMe + dMe * 4, you + 9, 52], [xMe + dMe * 2, you + 3, 0]);
        k = 0.9;
        break;
      }
      pickView(s);
      k = 1.7;
      break;
    case 'pick':
    case 'other':   // (their pick: the same view of their tower)
      // (the cards cover the lower 40%: the tower and the hanging block sit in the band above them)
      pickView(s);
      k = 2.2;
      break;
    case 'build':
    case 'settle': {
      if (G.phase === 'settle' && G.action === 'throw') {   // (where it came down, while it settles)
        towerShot(G.flight?.side ?? 1 - s, { maxD: 46 });
        k = 1.8;
        break;
      }
      // (wide enough for the whole swing and the block at both ends)
      const A = Math.min(BUILD.ampMax, BUILD.amp0 + BUILD.ampPer * G.builds[s]) / PX;
      const d = G.phase === 'build' ? Math.max(40, (A * 2 + 9) / 0.36) : 44;
      set([xs, ts + 6, d], [xs, ts + 3.2, 0]);
      k = G.phase === 'build' ? 2.2 : 1.8;
      break;
    }
    case 'aim':
      aimShot(s);
      k = 2.4;
      break;
    case 'flight':
      if (!flightShot()) towerShot(G.flight?.side ?? 1 - s);
      k = 8;
      break;
    case 'between': {   // (across the sea to the side that plays next)
      const n = nextSide(s);
      pickView(n == null ? 1 - s : n);
      k = 1.6;
      break;
    }
    case 'over': {
      // the winner's crown, from the open side of its rock (its tower behind it, nothing in between)
      const w = G.result === 'lose' ? FOE : ME;
      const c = sim.crowns[w];
      const cx = c.alive ? mOf(c.body.position.x) : sideX(w) / PX;
      const cy = c.alive ? -mOf(c.body.position.y) : topM(w);
      // (the crown is the hero: close, from the open side of its rock and a little in front, easing in)
      const back = -towardFoe(w);
      const ease = Math.min(2, G.phaseT * 0.4);
      set([cx + back * 5.5, cy + 2.8, 13 - ease], [cx - back * 0.3, cy + 0.9, 0]);
      k = 2;
      break;
    }
    default:
      pickView(s);
      k = 1.7;
      break;
  }
  cam.k = calm ? Math.max(k, 4) : k;
}
/**
 * The crown badges: while the camera looks at both towers (or zooms on one), each crown's place, seen through the
 * tower in front of it, the same size on the screen wherever it is; its pips are the hits its glass can still take.
 */
const wideView = () => !!G.zoom || ['aim', 'flight', 'other', 'between', 'wait'].includes(G.phase) || (G.phase === 'settle' && G.action === 'throw');
function updateMarks() {
  const on = !G.over && wideView();
  const h = stageEl.clientHeight || 800;
  for (const s of [0, 1]) {
    const m = marks[s];
    const c = sim.crowns[s];
    m.visible = on && c.alive && !c.wet;
    if (!m.visible) continue;
    m.userData.set(c.hp, c.hpMax);
    m.position.set(mOf(c.body.position.x), -mOf(c.body.bounds.min.y) + 1.2, 0);
    const k = (2 * camera.position.distanceTo(m.position) * Math.tan((camera.fov * Math.PI) / 360)) / h;   // (m a pixel there)
    const pulse = c.hp <= 0 && !calm ? 1 + 0.12 * Math.sin(performance.now() / 140) : 1;
    const px = (32 + Math.max(0, FOV - camera.fov) * 0.7) * pulse;   // (bigger in the zoom)
    m.scale.set(px * k, px * 1.3125 * k, 1);
  }
}
/** A crown leaving its rock: cut to it and follow it down, slowly (`G.crownFall`). */
function watchCrowns() {
  if (G.crownFall || G.over) return;
  for (const s of [0, 1]) {
    const c = sim.crowns[s];
    if (!c.alive || c.wet) continue;
    const dx = c.body.position.x - sideX(s);
    if (Math.abs(dx) > STACK.w / 2 + 6 && c.body.bounds.max.y > STACK.topY + 30) {
      G.crownFall = { side: s, out: Math.sign(dx) };
      G.zoom = null;
      cam.cut = true;
      hud.hideCards();   // (nothing in front of the big moment)
      hud.hideTap();
      hud.power(false);
      pinMesh.visible = false;
      slow(1.5, 0.33);
      sfx('wind', { v: 0.7 });
      hud.banner(s === ME ? T.crownFalling : T.crownFallingTheirs, { kind: s === ME ? 'is-foe' : 'is-me', ms: 1400 });
      return;
    }
  }
}
/** The wind: its gauge while a battle runs, and a breeze you can see drifting through the picture. */
let windShown = null;
function updateWind() {
  const on = !G.over && !G.paused && ['pick', 'build', 'aim', 'flight', 'other', 'settle', 'between'].includes(G.phase);
  const w = G.wind || 0;
  const key = on ? w : null;
  if (key !== windShown) {
    hud.wind(on, w / WIND.max, Math.round((Math.abs(w) / WIND.max) * 40));
    windShown = key;
  }
  if (on && w && !calm) fx.breeze(cam.look, w / WIND.max);
}
/** (aiming, mine) their tower off the screen (a phone): the marker at that edge, with the distance. */
let tgtOn = false;
function updateTarget() {
  let on = !G.over && !G.paused && G.phase === 'aim' && G.side === ME && !!G.card;
  let right = true;
  let text = '';
  if (on) {
    const r = stageBox();
    const sp = toScreen(towerX(FOE) / PX, topM(FOE) + 1, 0, r);
    on = sp.x > r.width - 12 || sp.x < 12;
    right = sp.x > r.width / 2;
    const p = sim.launchParams(ME, G.card.shape);
    text = T.target(foeName, Math.round(Math.abs(towerX(FOE) - p.x0) / PX));
  }
  if (on || tgtOn) hud.target(on, right, text);
  tgtOn = on;
}
function updateCamera(dt) {
  if (cam.cut) {   // (a cut: straight to the new shot)
    cam.cut = false;
    cam.pos.copy(cam.tPos);
    cam.look.copy(cam.tLook);
    cam.fov = cam.tFov;
  }
  const a = 1 - Math.exp(-cam.k * dt);
  cam.pos.lerp(cam.tPos, a);
  cam.look.lerp(cam.tLook, 1 - Math.exp(-cam.k * 1.7 * dt));   // (the eye finds its target before the camera arrives)
  cam.fov += (cam.tFov - cam.fov) * a;
  cam.punch = (cam.punch || 0) * Math.exp(-dt * 6);   // (a hit's punch-in: the lens narrows a moment, then eases back)
  const fov = cam.fov - cam.punch * 4;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
}

// ------------------------------------------------------------------------------------------------ the bars
function crownState(side) {
  if (sim.crownLost(side)) return 'lost';
  if (sim.crowns[side].hp <= 0) return 'open';
  const c = sim.crowns[side].body;
  const off = Math.abs(c.position.x - sideX(side));
  const tilt = Math.abs(Math.atan2(Math.sin(c.angle), Math.cos(c.angle)));
  return off > STACK.w / 2 - 50 || tilt > 0.5 ? 'danger' : 'ok';
}
function updateTop() {
  const sides = [0, 1].map((s) => {
    const now = sim.strength(s);
    G.strMax[s] = Math.max(G.strMax[s], now);
    return {
      h: sim.heightM(s),
      crown: crownState(s),
      power: Math.round((sim.launchParams(s, 'cube').v / LAUNCH.V0 - 1) * 100),
      str: Math.round((now / Math.max(1, G.strMax[s])) * 100),
    };
  });
  const blocks = G.sudden ? G.suddenLeft[G.side] : G.blocks[G.side];
  hud.setTop({ blocks, label: turnLabel(G.side), active: G.side, me: ME, sudden: G.sudden, sides });
  for (const s of [0, 1]) {
    const d = sides[s].crown === 'danger';
    if (d && !G.danger[s] && s === ME && !G.over) {
      const c = sim.crowns[ME].body;
      callout(T.danger, c.position.x, c.position.y - 60, 'is-dim');
      sfx('warning');
    }
    G.danger[s] = d;
  }
}

// ------------------------------------------------------------------------------------------------ the end
function gameOver(result, why) {
  G.over = true;
  G.result = result;
  setPhase('over');
  cam.cut = !calm;   // (cut to the winner's crown, rather than a flight across the scene)
  hud.hideTap();
  hud.hideCards();
  hud.power(false);
  pinMesh.visible = false;
  clearHanging();
  if (result === 'win') { sfx('record'); buzz('perfect'); } else if (result === 'lose') sfx('gameover');
  const winner = result === 'lose' ? FOE : ME;
  if (FRIEND && conn) setTimeout(() => conn?.close(), 4000);
  const c = sim.crowns[winner];
  if (c.alive && result !== 'draw') {
    const p = new THREE.Vector3(mOf(c.body.position.x), -mOf(c.body.position.y) + 1.5, 0);
    let n = 0;
    const burst = () => { fx.sparkle(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, 0)), 50, n % 2 ? '#ffd46a' : '#ffffff', 11); if (++n < 6) setTimeout(burst, 260); };
    burst();
  }
  const title = result === 'win' ? T.win : result === 'lose' ? (FRIEND ? `${foeName.toUpperCase()} ${T.lose.split(' ').slice(1).join(' ')}` : T.lose) : T.draw;
  const sub = why === 'gone' ? T.gone(foeName) : why === 'sea' ? (result === 'win' ? T.winSeaOf(foeName) : result === 'lose' ? T.loseSea : T.drawSea) : T.drawSudden;
  const st = G.stats;
  // (a friend who left before the battle really began: no coins, and it isn't counted as played)
  const loot = why === 'gone' && G.turns[0] + G.turns[1] < 4 ? { coins: 0, capped: false } : recordBattle(result);
  const lootLine = loot.coins ? `<p class="bt-loot">${T.loot(loot.coins)}</p>` : loot.capped ? `<p class="bt-loot is-full">${T.lootFull}</p>` : '';
  setTimeout(() => {
    G.modal = 'result';
    hud.modal(`<div class="bt-res is-${result}"><small>${T.title}</small><h2>${esc(title)}</h2><p>${esc(sub)}</p>${lootLine}
      <dl><div><dt>${T.stats.pb}</dt><dd>${st.pb[ME]}</dd></div><div><dt>${T.stats.pt}</dt><dd>${st.pt[ME]}</dd></div>
      <div><dt>${T.stats.hits}</dt><dd>${st.hits[ME]}</dd></div><div><dt>${T.stats.sunk}</dt><dd>${st.sunk[ME]}</dd></div></dl>
      <button class="bt-again" type="button">${T.again}</button><button class="bt-home" type="button">${T.toStapel}</button></div>`, {
      '.bt-again': () => { location.href = again(); },
      '.bt-home': () => goBack(),
    });
  }, why === 'sea' ? 2200 : 1400);
}
function again() {
  const u = new URL(location.href);
  if (FRIEND) { u.search = ''; u.searchParams.set('vriend', '1'); return u.toString(); }   // (a new room: you invite)
  if (u.searchParams.has('seed')) u.searchParams.set('seed', String(SEED + 1));
  return u.toString();
}
function openPause() {
  if (G.over || hud.modalOpen) return;
  G.paused = !FRIEND;   // (a friend battle keeps going: the other phone is playing too)
  try { audio.suspend(); } catch { /* */ }
  G.modal = 'pause';
  hud.modal(`<div class="bt-pausecard"><small>${T.title}</small><h2>${T.paused}</h2>
    <button class="bt-resume" type="button">${T.resume}</button><button class="bt-restart" type="button">${T.restart}</button><button class="bt-quit" type="button">${T.quit}</button></div>`, {
    '.bt-resume': () => { G.modal = null; hud.closeModal(); G.paused = false; try { audio.resume(); } catch { /* */ } },
    '.bt-restart': () => { location.href = again(); },
    '.bt-quit': () => goBack(),
  });
}
document.addEventListener('visibilitychange', () => { if (document.hidden && !G.over && !FRIEND) openPause(); });
// (18 Oct, "the phone rotated mid-throw": sideways, "Draai jou foon regop" covers the battle, so it waits on its pause card
// as it does when the app goes away, and as the castle and Stapel's own game do; a friend battle goes on, the other phone
// is playing. Checked every frame: a battle opened on a sideways phone waits too)
const sidewaysMq = typeof matchMedia === 'function' ? matchMedia('(orientation: landscape) and (max-height: 540px) and (pointer: coarse)') : null;

// ------------------------------------------------------------------------------------------------ the input
function onTap() {
  if (G.side !== ME || G.paused || hud.modalOpen) return;
  if (G.phase === 'build' && G.phaseT > 0.25) dropBlock();
  // (the pin's tap waits a moment after the power's, as each phase's first tap does: a quick double tap on the power bar
  // never throws the block flat from the pin's first position into the sea. 18 Oct, "tap everything twice")
  else if (G.phase === 'aim' && G.phaseT > 0.25 && !(G.aimStep === 'angle' && G.aimT < 0.25)) aimTap();
}
let ambOn = false;
stageEl.addEventListener('pointerdown', (e) => {
  try { audio.unlock(); if (!ambOn) { ambOn = true; audio.setAmbience(0.55); } } catch { /* */ }
  if (e.target.closest('button') || hud.modalOpen) return;
  onTap();
});
addEventListener('keydown', (e) => {
  // (a card is open: its buttons take Space and Enter)
  if ((e.code === 'Space' || e.code === 'Enter') && !hud.modalOpen) { e.preventDefault(); onTap(); }
  if (e.code === 'Escape') openPause();
});
// (the Android app's back button, through the app's shim: one step back, never out of a battle by accident)
window.__botsingBack = true;   // (main.js's stand-in steps aside)
addEventListener('stapel:back', (e) => {
  e.preventDefault();
  if (G.modal === 'pause') { document.querySelector('.bt-resume')?.click(); return; }
  if (G.modal === 'tip') { document.querySelector('.bt-ok')?.click(); return; }
  if (G.modal || G.over || G.phase === 'intro') { goBack(); return; }   // (the result, the invite, the loading: to Stapel)
  if (G.side === ME && (G.phase === 'build' || G.phase === 'aim')) { backToCards(); return; }
  openPause();
});

// ------------------------------------------------------------------------------------------------ the loop
function tick(dt, time) {
  G.phaseT += dt;
  G.heard += dt;
  if (FRIEND && !G.over) pumpRemote();
  physics(dt);
  watchCrowns();
  syncMeshes(Math.min(1, acc), dt);
  burning(dt);
  // (a crown in the sea: its moment plays, then the turn ends — or, after its turn, that turn's result)
  if (G.crownT > 0) {
    G.crownT -= dt;
    if (G.crownT <= 0 && !G.over && !FRIEND) { if (G.lateSink) lateSink(); else if (G.phase === 'flight' || G.phase === 'settle') endTurn(); }
  }
  switch (G.phase) {
    case 'intro':
      if (!G.titled && G.phaseT > 0.35) { G.titled = true; hud.banner(T.title, { sub: `${T.you} · ${FRIEND ? T.friend : T.rikus}`, kind: '', ms: 1900 }); sfx('horn'); }
      if (G.phaseT > 2.4) {
        setPhase('wait');
        let seen = false;
        try { seen = !!JSON.parse(localStorage.getItem(KEY) || '{}').tip5; } catch { /* */ }
        const go = () => {
          if (myBonus) hud.banner(T.dailyBonus(myBonus), { kind: 'is-me is-small', ms: 1600 });
          if (FRIEND) friendSetup();
          else setTimeout(() => startTurn(0), myBonus ? 1200 : 0);
        };
        if (seen || q.has('notip')) go();
        else {
          G.modal = 'tip';
          hud.modal(`<div class="bt-tip"><small>${T.title}</small><p>${T.tip}</p><p>${T.tip3}</p><p class="bt-tip2">${T.higher}</p><button class="bt-ok" type="button">${T.tipOk}</button></div>`, {
            '.bt-ok': () => { G.modal = null; hud.closeModal(); saveRecord({ tip5: 1 }); go(); },
          });
        }
      }
      break;
    case 'other':
      // Robot Rikus thinks (a few throws ahead each frame); a friend's moves come over the room (pumpRemote): not a
      // word from them in FRIEND_WAIT.move s, they've gone
      if (FRIEND && G.heard > FRIEND_WAIT.move) friendGone();
      if (!FRIEND && !G.plan) {
        if (!G.planner) G.planner = createRikusPlanner(sim, FOE, G.cards, G.turns[FOE], rand, { sudden: G.sudden });
        const done = G.planner.step(40);
        if (done && G.phaseT > RIKUS.thinkMs / 1000) {
          G.plan = G.planner.plan();
          G.card = G.cards.find((c) => c.shape === G.plan.shape && c.element === G.plan.element) || G.cards[0];
          G.cardIdx = G.cards.indexOf(G.card);
          showHanging(FOE, G.card);
          beginAction(G.plan.action);
        }
      }
      break;
    case 'build': {
      G.buildT += dt;
      if (!FRIEND && G.side === FOE && G.plan) {
        const rel = trolley(FOE).x - (towerX(FOE) + G.plan.offset);
        if (G.prevRel != null && G.buildT > 0.7 && Math.sign(rel) !== Math.sign(G.prevRel)) dropBlock();
        G.prevRel = rel;
        if (G.buildT > 9) dropBlock();
      }
      break;
    }
    case 'aim': {
      G.aimT += dt;
      if (G.side === ME) {
        if (G.aimStep === 'power') {
          hud.power(true, powerAt(G.aimT), false);
          pinMesh.visible = false;
        } else {
          const th = pinAngle(G.aimT);
          placePin(ME, th);
          hud.tapSub(`${T.powerWord} ${Math.round(G.power * 100)}% · ${Math.round((th * 180) / Math.PI)}°`);
        }
      } else if (G.plan || G.remoteThrow) {
        // Rikus (or the friend's throw, replayed): his pin swings to his angle, then he lets go
        const aim = G.remoteThrow || { theta: G.plan.theta, power: G.plan.power };
        const span = G.remoteThrow ? 0.6 : 1.1;
        const k = Math.min(1, G.aimT / span);
        placePin(FOE, PIN.min + (aim.theta - PIN.min) * (k * k * (3 - 2 * k)));
        if (G.aimT > span + 0.25) throwBlock(aim.theta, aim.power);
      }
      break;
    }
    case 'flight':
      if (G.phaseT > 8) setPhase('settle');
      break;
    case 'settle': {
      if (G.crownT > 0 && !FRIEND) break;
      const longest = SETTLE.maxMs / 1000 + 6;
      // (a crown going over the edge: the turn waits for it to reach the sea, a while longer than any other)
      if (G.crownFall && !sim.crownLost(G.crownFall.side) && G.phaseT < longest && !G.remoteDone) break;
      const quiet = (sim.settled() && G.phaseT > SETTLE.minMs / 1000) || G.phaseT > SETTLE.maxMs / 1000;
      if (!FRIEND) { if (quiet && !G.zoom) endTurn(); break; }
      // a friend battle: the one whose turn it is sends where everything ended up and takes it itself; the other phone
      // takes it when its replay has played as many steps (the same world by then: nothing jumps), or at once when it
      // is behind (the friend has played on)
      if (G.side === ME) {
        if (quiet && !G.sentDone) {
          G.sentDone = true;
          const snap = sim.snap();
          conn?.send({ t: 'done', snap, blocks: G.blocks, steps: G.steps, n: G.turnNo });
          takeSnap(snap);
          endTurn();
        }
      } else if (G.remoteDone && (!G.resolving || G.steps >= (G.remoteDone.steps | 0) || G.phaseT > longest || G.inbox.some((m) => m.n > G.turnNo))) {
        const d = G.remoteDone;
        G.remoteDone = null;
        takeSnap(d.snap, d.blocks);
        endTurn();
      } else if (!G.remoteDone && G.heard > FRIEND_WAIT.done) friendGone();
      break;
    }
    case 'between':
      if (G.phaseT > 1.5 && !(G.crownT > 0 && G.lateSink)) { G.sentDone = false; nextTurn(); }
      break;
    default:
      break;
  }
  updateCranes(dt, time);
  updateGhost();
  camTargets(dt);
  G.topT -= dt;
  if (G.topT <= 0) { G.topT = 0.2; updateTop(); }
  G.sparkT -= dt;
  if (G.sparkT <= 0) {
    G.sparkT = 0.9;
    for (const s of [0, 1]) {
      const c = sim.crowns[s];
      if (c.alive && !c.wet) fx.sparkle(new THREE.Vector3(mOf(c.body.position.x) + (Math.random() - 0.5) * 1.6, -mOf(c.body.position.y) + 1.4 + Math.random(), (Math.random() - 0.5) * 1.6), 2, '#ffe9a0', 1.2);
    }
  }
}

// ------------------------------------------------------------------------------------------- a friend battle
/** How long a friend battle waits (s): for the friend's move on their turn, for their turn's end after their move. */
const FRIEND_WAIT = { move: 120, done: 60 };
const HERE_MS = 15000;   // (a friend's game says it's still there this often while it's on screen)
function friendGone() {
  if (G.over) return;
  G.inbox.length = 0;
  hud.banner(T.gone(foeName), { kind: 'is-small', ms: 2200 });
  gameOver('draw', 'gone');
}
/** Puts `text` on the clipboard: true when it's there (the phone's clipboard, or the older way on a plain-http page). */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* no clipboard here (a plain-http page on the home Wi-Fi) */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
function showInvite(code) {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('kamer', code);
  const link = u.toString();
  G.modal = 'invite';
  hud.modal(`<div class="bt-invite"><small>${T.title}</small><h2>${T.inviteTitle}</h2><p>${T.inviteText}</p>
    <div class="bt-code">${code}</div><div class="bt-link">${esc(link)}</div>
    <button class="bt-wa" type="button">${T.inviteWa}</button><button class="bt-copy" type="button">${T.inviteCopy}</button>
    <p class="bt-waiting">${T.inviteWait}</p><button class="bt-home" type="button">${T.toStapel}</button></div>`, {
    '.bt-wa': () => { window.open(`https://wa.me/?text=${encodeURIComponent(T.waText(link))}`, '_blank'); },
    '.bt-copy': async (e) => {
      const b = e.currentTarget;
      if (await copyText(link)) { b.textContent = T.inviteCopied; return; }
      // (it couldn't: the link is chosen on the screen, to copy by hand)
      b.textContent = T.inviteCopyOwn;
      const el = document.querySelector('.bt-link');
      if (el) try { getSelection().selectAllChildren(el); } catch { /* */ }
    },
    '.bt-home': () => goBack(),
  });
}
async function friendSetup() {
  const net = createSlagNet({ api: matchApiUrl() });
  let code = FRIEND_CODE;
  if (FRIEND_HOST) {
    code = await net.create();
    if (!code) { G.modal = 'noserver'; hud.modal(`<div class="bt-tip"><small>${T.title}</small><p>${T.noServer}</p><button class="bt-home" type="button">${T.toStapel}</button></div>`, { '.bt-home': () => goBack() }); return; }
    showInvite(code);
  } else {
    G.modal = 'joining';
    hud.modal(`<div class="bt-invite"><small>${T.title}</small><p class="bt-waiting">${T.joining}</p><button class="bt-home" type="button">${T.toStapel}</button></div>`, { '.bt-home': () => goBack() });
  }
  conn = net.connect(code);
  const ready = await Promise.race([conn.ready, conn.gone]);
  const closeCard = () => { G.modal = null; hud.closeModal(); };
  if (ready && ready.t === 'gone') { closeCard(); friendGone(); return; }
  conn.send({ t: 'hello', name: myName, bonus: myBonus, seed: SEED, skin: mySkin });
  const hi = await conn.next(['hello']);
  if (hi.t === 'gone') { closeCard(); friendGone(); return; }
  closeCard();
  foeName = cleanName(hi.name) || T.friend;
  skins[FOE] = typeof hi.skin === 'string' && skinItem('blocks', hi.skin) ? hi.skin : 'kleur';
  G.blocks[FOE] = BUDGET.base + Math.max(0, Math.min(BUDGET.dailyMax, hi.bonus | 0));
  if (ME === 1) { SEED = Number(hi.seed) || SEED; rand = rng(SEED); }   // (the host's seed: the same cards offered on both phones)
  // the blocks already standing (the starting towers) in each side's own skin
  for (const e of sim.entries) { const g = meshes.get(e.id); if (g && e.side === FOE && e.role !== 'crown') { scene.remove(g); meshes.delete(e.id); } }
  nameBars();
  listen();
  // (still here: a friend who thinks long over a card, or has the game paused, isn't gone; a phone put away stops saying it)
  setInterval(() => { if (!G.over && !document.hidden) conn.send({ t: 'here' }); }, HERE_MS);
  startTurn(0);
}
/** Everything the friend sends, in the order sent, into the inbox (the game takes each in its turn: pumpRemote). */
async function listen() {
  for (;;) {
    const m = await conn.next(['pick', 'build', 'throw', 'done', 'bye', 'here']);
    if (m.t === 'here') { G.heard = 0; continue; }
    G.inbox.push(m);
    if (m.t === 'gone' || m.t === 'bye') return;
  }
}
/**
 * The friend's messages, one after another: each when this phone has reached its turn and its moment (it may still be
 * replaying the turn before, or the screen was off for a while: the friend's phone doesn't wait for this one).
 */
function pumpRemote() {
  while (G.inbox.length && !G.over) {
    const m = G.inbox[0];
    if (m.t === 'gone' || m.t === 'bye') { friendGone(); return; }
    if (!Number.isInteger(m.n) || m.n < G.turnNo) { G.inbox.shift(); continue; }   // (not one of this battle's turns)
    if (m.n > G.turnNo || G.side !== FOE || !onRemote(m)) return;   // (not there yet)
    G.inbox.shift();
    G.heard = 0;
  }
}
/** One of the friend's messages for this turn: true when it was taken (false: this phone isn't at its moment yet). */
function onRemote(m) {
  const i = m.i | 0;
  const card = G.cards[i];
  switch (m.t) {
    case 'pick':
      if (G.phase === 'other' && card) { G.card = card; G.cardIdx = i; showHanging(FOE, card); }
      return true;
    case 'build':
      if (G.phase !== 'other') return true;   // (a move this turn already has: never twice)
      if (!card || ![m.x, m.y, m.vx].every(Number.isFinite)) return true;   // (a broken one: the turn's end puts it right)
      G.card = card;
      G.cardIdx = i;
      G.action = 'build';
      showHanging(FOE, card);
      hud.hideTap();
      dropBlock({ x: m.x, y: m.y, vx: m.vx });
      return true;
    case 'throw':
      if (G.phase !== 'other') return true;
      if (!card || !Number.isFinite(m.theta) || !Number.isFinite(m.power)) return true;
      G.card = card;
      G.cardIdx = i;
      showHanging(FOE, card);
      G.remoteThrow = { theta: Math.min(PIN.max, Math.max(PIN.min, m.theta)), power: Math.min(1, Math.max(0, m.power)) };
      beginAction('throw');
      return true;
    case 'done':
      if (G.phase === 'aim' || G.phase === 'flight') return false;   // (its throw is still being replayed here)
      if (G.phase === 'other') { setPhase('settle'); G.action = G.action || 'build'; }   // (its move never came: the end puts it right)
      if (G.phase !== 'settle') return true;
      G.remoteDone = m;
      return true;
    default:
      return true;
  }
}
/**
 * A turn's end in a friend battle: the world as the phone that played it has it (both phones take the same one), and
 * each block shows what it now is.
 */
function takeSnap(snap, blocks) {
  sim.applySnap(snap);
  handle(sim.drain());
  if (Array.isArray(blocks)) G.blocks = [Math.max(0, blocks[0] | 0), Math.max(0, blocks[1] | 0)];
  G.resolving = false;
  G.crownT = 0;
  dressAll();
}
/** After a snapshot: every block in its place, cracked, glazed, wrapped and skinned as it now is. */
function dressAll() {
  for (const e of sim.entries) {
    let g = meshes.get(e.id);
    if (!e.alive) { if (g) g.visible = false; continue; }
    // (what a block can't lose again — broken glass, vines — comes back with a fresh block)
    if (g && ((e.role === 'crown' && e.hp > 0 && g.userData.broken) || (!e.rooted && g.userData.vines))) { scene.remove(g); meshes.delete(e.id); g = null; }
    g = g || meshFor(e);
    g.visible = true;
    if (e.role === 'crown') { if (e.hp <= 0) pieces.glassBreak(g); else pieces.glassCrack(g, e.hpMax - e.hp); }
    else pieces.crack(g, e.hpMax - e.hp);
    if (e.perfect && !g.userData.seamMesh) g.userData.seamMesh = pieces.seam(g);
    if (g.userData.seamMesh) g.userData.seamMesh.visible = e.perfect;
    if (e.rooted) pieces.vineWrap(g);
    if (e.barrel) pieces.waterSkin(g); else pieces.drySkin(g);
    if (e.springReady) pieces.springCoil(g); else pieces.dropCoil(g);
    e.ix = undefined;
  }
}

// warm the shaders behind the loading screen (every block, every emblem), then go
// every shape's material in the skins in play, painted behind the loading screen (painting is per pixel: on a phone a
// shape takes a tenth of a second or more; mid-game, when the cards first show, it would stall)
for (const sk of new Set([skins[ME], skins[FOE]])) for (const sh of ['plank', 'slab', 'cube', 'wedge', 'crate', 'pillar']) pieces.prepare(sh, sk);
// (one small block of each element: every kind of material compiled)
const extras = ['vuur', 'gras', 'water', 'plof'].map((el, i) => { const g = pieces.block('cube', i % 2, el, skins[i % 2] || 'kleur'); g.position.set(0, -50, 0); return g; });
let last = performance.now();
let time = 0;
// (?prof: ms per part of a frame, averaged, in window.__btProf)
const PROF = q.has('prof') ? { tick: 0, fx: 0, render: 0, draws: 0 } : null;
const avg = (k, v) => { PROF[k] += (v - PROF[k]) * 0.05; };
let dozeUntil = 0;   // (tests: a phone with its screen off — no frames, while the friend's messages still arrive)
function frame(now) {
  requestAnimationFrame(frame);
  if (now < dozeUntil) { last = now; return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  if (sidewaysMq?.matches && !G.paused && !G.over && !FRIEND && G.phase !== 'intro') openPause();
  if (!G.paused) {
    time += dt;
    tick(dt, time);
  }
  const t1 = performance.now();
  world.update(time);
  pieces.tick(time);
  fx.update(G.paused ? 0 : dt * (G.slowT > 0 ? Math.max(0.4, G.slowRate) : 1), camera);
  updateCamera(dt);
  updateMarks();
  updateTarget();
  updateWind();
  trackCallouts();
  const t2 = performance.now();
  stage.render(dt);
  if (PROF) { avg('tick', t1 - t0); avg('fx', t2 - t1); avg('render', performance.now() - t2); PROF.draws = renderer.info.render.calls; window.__btProf = PROF; }
}
// (the cards' pictures too, behind the loading screen: the first turn's cards never freeze the battle)
Promise.all([stage.warm(extras), pieces.prepareCards(skins[ME]).catch(() => {})]).then(() => {
  updateTop();
  requestAnimationFrame((t) => { last = t; frame(t); });
  setTimeout(() => { window.__btReady = true; }, 300);
});

// test hooks (qa/botsing1180.mjs)
window.__bt = {
  G, sim, T, SEED, ME, FOE,
  /** Picks a card (its index, or the first of that shape) and, with `action`, builds or throws with it. */
  pick: (which, action) => {
    const i = typeof which === 'number' ? which : Math.max(0, G.cards.findIndex((c) => c.shape === which));
    onChoose(i, null);
    if (action) onChoose(i, action);
  },
  tap: onTap,
  /** (tests) the screen off for `ms`: no frames, as on a locked phone (a friend's messages still come in). */
  doze(ms) { dozeUntil = performance.now() + ms; },
  /** An aim (angle, power) whose throw reaches their `kind` ('crown', 'block'), or null. */
  findAim(kind = 'crown') {
    for (let p = 1; p >= 0.5; p -= 0.05) {
      for (let a = PIN.min; a <= PIN.max; a += Math.PI / 180) {
        const r = sim.predict(ME, G.card.shape, a, p);
        if (r.hit.kind === kind && r.hit.side === FOE) return { theta: a, power: p };
      }
    }
    return null;
  },
  /** (tests) one hit on a side's crown, through the game's own path (its glass cracks, then breaks) */
  hitCrown(side) { sim.hurt(sim.crowns[side]); handle(sim.drain()); },
  /** (tests) the pin held at `deg` degrees (time stops: a still picture) */
  setPin(deg) {
    const th = (deg * Math.PI) / 180;
    placePin(G.side, th);
    G.paused = true;
  },
  /** Throws at once with this aim (tests: no frame between the aim and the throw). */
  throwAim(aim) { if (G.phase === 'aim' && G.side === ME) throwBlock(aim.theta, aim.power); },
  trolley: () => trolley(ME),
  ghost, pin: pinMesh, cranes, skins, seen, calls,
  /** The aim right now: which step, the running power, the pin's angle, and where a throw now would land. */
  aimNow() {
    const power = G.aimStep === 'power' ? powerAt(G.aimT) : G.power;
    const theta = pinAngle(G.aimT);
    const hit = G.card && G.aimStep === 'angle' ? sim.predict(ME, G.card.shape, theta, power).hit : null;
    return { step: G.aimStep, power, theta, hit: hit && { kind: hit.kind, side: hit.side } };
  },
  /** Where the block in the air is on the screen (0-1 across and down), or null. */
  shotOnScreen() {
    if (!G.shot?.alive) return null;
    const r = stageEl.getBoundingClientRect();
    const p = toScreen(mOf(G.shot.body.position.x), -mOf(G.shot.body.position.y), 0, r);
    return { x: +(p.x / r.width).toFixed(3), y: +(p.y / r.height).toFixed(3) };
  },
  /** Where each tower's top and crown are on the screen (0-1 across and down). */
  view() {
    const r = stageEl.getBoundingClientRect();
    const f = (p) => ({ x: +(p.x / r.width).toFixed(3), y: +(p.y / r.height).toFixed(3) });
    return [0, 1].map((s) => {
      const c = sim.crowns[s].body.position;
      return { top: f(toScreen(towerX(s) / PX, topM(s))), crown: f(toScreen(c.x / PX, -c.y / PX)) };
    });
  },
};
