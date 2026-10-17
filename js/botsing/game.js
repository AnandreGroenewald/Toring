// (1.18 3D) Blokbotsing: the battle vs Robot Rikus. Turn by turn: the crane offers three blocks; pick one, then BUILD
// (it swings over your tower, a tap drops it: Stapel's own stacking, a gold guide shows a Perfek) or THROW: pull back
// and let go (the owner, 17 Oct 2026: "The gooi is not interactive"): the pull sets the angle and the power, the arc
// and a scope on their tower show where it lands; one tap in mid-air fires the block's power. Hits crack blocks (their
// strength shows). Your crown stands behind your tower ("the crown needs to be behind your tower"); throws fly a
// heavier, slower arc. Blocks, not turns: each side has a budget (BUDGET: + Perfeks of today's Daily Tower, at most 4;
// a Perfek build earns one back); the only win is their crown in the sea; both out of blocks: sudden death.
// `?vriend=1` makes a room and invites a friend, `?kamer=CODE` joins one (the match server's two-seat rooms, like the
// Vrugteslag's): the one whose turn it is plays, the other phone replays it and takes its snapshot at the end.
import * as THREE from '../../lib/three.module.min.js';
import { createStage, pickQuality } from '../kasteel/stage.js';
import { buildWorld, STACK_TOP } from './world.js';
import { createPieces } from './pieces.js';
import { createSim, shapeInfo } from './sim.js';
import { createBattleFx } from './fx.js';
import { createHud } from './hud.js';
import { rikusPlan } from './rikus.js';
import { PX, sideX, towardFoe, towerX, BUILD, RIKUS, SETTLE, LAUNCH, STACK, G_STEP, PULL, BUDGET, offer, rng } from './rules.js';
import { dateKeyFor } from '../core/daily.js';
import { matchApiUrl } from '../sponsorConfig.js';
import { createSlagNet } from '../slagNet.js';
import { PHYSICS } from '../config.js';
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
let foeName = FRIEND ? '' : '';
function readName() {
  try { return String(JSON.parse(localStorage.getItem('stapel.v1') || '{}')?.duel?.name || '').slice(0, 16); } catch { return ''; }
}
/** Today's Daily Tower Perfeks, at most BUDGET.dailyMax: extra blocks for every battle today. */
function dailyBonus() {
  try {
    const d = JSON.parse(localStorage.getItem('stapel.v1.kasteeldae') || '{}')?.[dateKeyFor()];
    return Math.max(0, Math.min(BUDGET.dailyMax, Math.floor(Number(d?.p) || 0)));
  } catch { return 0; }
}
const myName = readName();
const myBonus = dailyBonus();
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
const canvasEl = document.getElementById('k-canvas');
const world = buildWorld(stage);
const pieces = createPieces(renderer);
const sim = createSim();
const fx = createBattleFx(stage);
const cranes = [pieces.crane(0), pieces.crane(1)];
scene.add(cranes[0].group, cranes[1].group);
const hud = createHud({ onPause: () => openPause() });

const G = {
  phase: 'intro', phaseT: 0, side: 0, turns: [0, 0], cards: [], shape: null, action: null, plan: null,
  buildT: 0, aimT: 0, theta: 0.7, power: 0, pred: null, hang: null, hangSide: 0, shot: null, shotHit: false,
  slowT: 0, slowRate: 1, freeze: 0, paused: false, over: false, crownT: 0, builds: [0, 0], danger: [false, false],
  prevRel: null, topT: 0, sparkT: 0, strMax: [1, 1], strStart: [0, 0], sunkStart: 0, pullOff: { x: 0, y: 0 },
  blocks: [BUDGET.base, BUDGET.base], sudden: false, suddenLeft: [0, 0], launchStep: 0, pendingBurst: null,
  remoteDone: null, remoteThrow: null,
  stats: { pb: [0, 0], pt: [0, 0], hits: [0, 0], sunk: [0, 0] },
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
    g = pieces.block(e.shape, e.side);
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
const toScreen = (x, y, z = 0) => {
  const v = new THREE.Vector3(x, y, z).project(camera);
  const r = stageEl.getBoundingClientRect();
  return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
};
function callout(text, px, py, kind) {
  const s = toScreen(px / PX, -py / PX + 2.2);
  hud.callout(text, s.x, s.y, kind);
}

// --------------------------------------------------------------------------------------------- the turns
function setPhase(p) { G.phase = p; G.phaseT = 0; }
function startTurn(side) {
  G.side = side;
  G.cards = offer(rand);
  G.shape = null;
  G.action = null;
  G.plan = null;
  G.shot = null;
  G.shotHit = false;
  G.prevRel = null;
  G.strStart = [sim.strength(0), sim.strength(1)];
  G.sunkStart = G.stats.sunk[side];
  G.remoteDone = null;
  G.remoteThrow = null;
  G.pendingBurst = null;
  G.pendingBurstN = null;
  const left = G.sudden ? T.suddenSub : T.blocksLeft(G.blocks[side]);
  hud.banner(turnLabel(side), { sub: left, kind: side === ME ? 'is-me' : 'is-foe', ms: 1250 });
  sfx('banner');
  updateTop();
  if (side === ME) {
    setPhase('pick');
    hud.hideTap();
    hud.showCards(G.cards, onChoose, { throwOnly: G.sudden });
  } else {
    setPhase('other');
    hud.hideCards();
    hud.showTap(FRIEND ? T.friendThinks(foeName) : T.rikusThinks, '', null);
  }
}
function onChoose(shape, action) {
  if (G.phase !== 'pick') return;
  if (G.sudden && action === 'build') return;
  G.shape = shape;
  showHanging(ME, shape);
  sfx('click');
  if (FRIEND && conn) conn.send({ t: 'pick', shape });
  if (action) { buzz('tap'); beginAction(action); }
}
function showHanging(side, shape) {
  if (G.hang && G.hang.userData.shape === shape && G.hangSide === side) return;
  clearHanging();
  const g = pieces.block(shape, side);
  g.position.y = -g.userData.top;
  cranes[side].hold.add(g);
  G.hang = g;
  G.hangSide = side;
}
function clearHanging() {
  if (G.hang) G.hang.parent?.remove(G.hang);
  G.hang = null;
  bands.visible = false;
}
function beginAction(action) {
  G.action = action;
  hud.hideCards();
  const mine = G.side === ME;
  if (action === 'build') {
    setPhase('build');
    G.buildT = 0;
    hud.showTap(mine ? T.tapDrop : turnLabel(G.side), `${T.names[G.shape]} · ${T.powers[G.shape].build}`, mine ? backToCards : null);
  } else {
    setPhase('aim');
    G.aimT = 0;
    G.power = 0;
    G.pullOff = { x: 0, y: 0 };
    hud.showTap(mine ? T.pullHint : turnLabel(G.side), mine ? T.goldArc : `${T.names[G.shape]} · ${T.powers[G.shape].throw}`, mine ? backToCards : null);
  }
}
function backToCards() {
  if (G.side !== ME || (G.phase !== 'build' && G.phase !== 'aim')) return;
  pull.on = false;
  fx.hideArc();
  hud.scope(false);
  G.pullOff = { x: 0, y: 0 };
  setPhase('pick');
  hud.hideTap();
  hud.showCards(G.cards, onChoose, { selected: G.shape, throwOnly: G.sudden });
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
  const e = sim.release(side, G.shape, at.x, at.y, at.vx);
  if (FRIEND && conn && side === ME) conn.send({ t: 'build', shape: G.shape, x: at.x, y: at.y, vx: at.vx });
  if (!G.sudden) G.blocks[side] = Math.max(0, G.blocks[side] - 1);
  scene.attach(g);
  g.rotation.set(0, 0, 0);
  meshes.set(e.id, g);
  G.hang = null;
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
  const p = sim.predict(side, G.shape, theta, power);
  const e = sim.launch(side, G.shape, theta, p.perfect, power);
  G.launchStep = sim.stepN;
  if (G.pendingBurstN != null) { G.pendingBurst = G.launchStep + G.pendingBurstN; G.pendingBurstN = null; }
  if (FRIEND && conn && side === ME) conn.send({ t: 'throw', shape: G.shape, theta, power });
  if (!G.sudden) G.blocks[side] = Math.max(0, G.blocks[side] - 1);
  updateTop();
  scene.attach(g);
  g.rotation.set(0, 0, 0);
  meshes.set(e.id, g);
  G.hang = null;
  G.shot = e;
  G.shotHit = false;
  G.pullOff = { x: 0, y: 0 };
  bands.visible = false;
  cranes[side].whip(power);
  fx.sparkle(new THREE.Vector3(mOf(p.x0), -mOf(p.y0) + 0.6, 0), 14, '#ffffff', 5);
  fx.hideArc();
  hud.scope(false);
  fx.trail(g, p.perfect);
  sfx('fling');
  if (side === ME) buzz('tap');
  if (p.perfect) {
    G.stats.pt[side]++;
    fx.sparkle(new THREE.Vector3(mOf(p.x0), -mOf(p.y0), 0), 36);
    callout(T.perfectThrow, p.x0, p.y0 - 40, 'is-gold');
    sfx('perfect');
    if (side === ME) buzz('perfect');
  }
  if (side === ME) hud.showTap(T.tapNow, T.burstHint[G.shape], null);
  else hud.hideTap();
  setPhase('flight');
}
/** The mid-air tap: the block's power, right now. */
function fireBurst() {
  const e = G.shot;
  if (!e || !e.flying || e.burstUsed) return false;
  if (FRIEND && conn && e.side === ME) conn.send({ t: 'burst', n: sim.stepN - G.launchStep });
  return !!sim.burst(e);
}
/** Robot Rikus fires his blocks' powers too, when it's worth it. */
function rikusBurst() {
  const e = G.shot;
  if (!e || !e.flying || e.burstUsed) return;
  const b = e.body;
  const c = sim.crowns[ME].body.position;
  const nearX = Math.abs(b.position.x - towerX(ME));
  if (e.shape === 'cube' && nearX < 70 && b.velocity.y > 0) fireBurst();
  else if (e.shape === 'crate' && Math.hypot(b.position.x - c.x, b.position.y - c.y) < 130) fireBurst();
  else if ((e.shape === 'wedge' || e.shape === 'pillar') && Math.abs(b.position.x - sideX(ME)) < 650 && b.velocity.y > 0) fireBurst();
  else if (e.shape === 'plank' && b.position.y > STACK.topY - 40 && b.velocity.y > 0 && Math.abs(b.position.x - sideX(ME)) > STACK.w / 2 + 60) fireBurst();
}
function endTurn() {
  if (G.over) return;
  fx.hideArc();
  fx.stopTrail();
  hud.scope(false);
  G.turns[G.side]++;
  const lostMe = sim.crownLost(ME);
  const lostFoe = sim.crownLost(FOE);
  if (lostMe || lostFoe) { gameOver(lostMe && lostFoe ? 'draw' : lostFoe ? 'win' : 'lose', 'sea'); return; }
  // what this turn did to the other side (the owner: "it doesnt indecate any damage?")
  if (G.action === 'throw') {
    const foe = 1 - G.side;
    const drop = Math.max(0, G.strStart[foe] - sim.strength(foe));
    const pct = Math.round((drop / Math.max(1, G.strMax[foe])) * 100);
    const sunk = G.stats.sunk[G.side] - G.sunkStart;
    if (pct > 0) hud.banner(T.damage(pct), { sub: sunk ? T.lostBlocks(sunk) : '', kind: G.side === ME ? 'is-me is-dmg' : 'is-foe is-dmg', ms: 1500 });
    else hud.banner(T.noDamage, { kind: 'is-small', ms: 1100 });
  }
  if (G.sudden) {
    G.suddenLeft[G.side] = Math.max(0, G.suddenLeft[G.side] - 1);
    if (G.suddenLeft[0] <= 0 && G.suddenLeft[1] <= 0) { gameOver('draw', 'sudden'); return; }
  }
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
  hud.banner(T.sudden, { sub: T.suddenSub, kind: 'is-dmg', ms: 1800 });
  sfx('horn');
  setTimeout(() => { if (!G.over) startTurn(1 - G.side); }, 1600);
  setPhase('wait');
}

// ----------------------------------------------------------------------------------------- what happens
function handle(events) {
  for (const ev of events) {
    const e = ev.entry;
    const mine = e && e.side === ME;
    switch (ev.type) {
      case 'land': {
        const g = meshes.get(e.id);
        if (ev.snapDx) {   // (the slide into the middle glides over a moment instead of jumping)
          if (e.ix !== undefined) e.ix += ev.snapDx;
          if (g) g.userData.glide = (g.userData.glide || 0) - ev.snapDx / PX;
        }
        const p = { x: mOf(ev.x), y: -mOf(ev.y) };
        fx.land(p, ev.rating, e.w / PX);
        if (ev.rating === 'P') {
          if (g) pieces.seam(g);
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
        const k = Math.min(1.6, (ev.speed / LAUNCH.V0) * Math.sqrt(e.body.mass / 2.4));
        const dir = new THREE.Vector3(Math.sign(e.body.velocity.x) || towardFoe(e.side), 0.2, 0);
        fx.hit(new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0), dir, k);
        fx.stopTrail();
        stage.shake(0.3 + 0.45 * k);
        const foeHit = ev.other && ev.other.kind !== 'stack' && ev.other.side !== e.side;
        if (foeHit && ev.onto === 'crown') { G.freeze = calm ? 0 : 0.05; slow(0.5, 0.35); } else if (foeHit) slow(0.3, 0.55);
        sfx('clash');
        sfx('land');
        if (e.side === ME) buzz('heavy');
        if (foeHit) G.stats.hits[e.side]++;
        if (foeHit && ev.onto === 'crown') { hud.banner(T.crownHit, { kind: e.side === ME ? 'is-me' : 'is-foe', ms: 1100 }); sfx('warning'); }
        if (G.phase === 'flight') { setPhase('settle'); hud.hideTap(); }
        break;
      }
      case 'damage': {
        const g = meshes.get(e.id);
        if (g && e.hp > 0) pieces.crack(g, e.hpMax - e.hp);
        callout(`−${ev.n}`, ev.x, ev.y, 'is-dmg');
        if (e.hp > 0) fx.hit(new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0), new THREE.Vector3(0, 1, 0), 0.4);
        break;
      }
      case 'splash': {
        const size = Math.min(2, 0.45 + Math.sqrt(ev.mass) * 0.35 + Math.abs(ev.vy) * 0.02);
        fx.splash(mOf(ev.x), { size });
        sfx('splash');
        if (e && e === G.shot) {
          fx.stopTrail();
          if (e.role === 'built' && !e.landed) callout(T.missBuild, ev.x, -40, 'is-dim');
          else if (e.role === 'proj' && G.phase === 'flight') callout(T.splash, ev.x, -40, 'is-dim');
          if (G.phase === 'flight') { setPhase('settle'); hud.hideTap(); }
        } else if (e && e.role !== 'proj' && e.role !== 'crown' && e.side !== G.side) G.stats.sunk[G.side]++;
        break;
      }
      case 'crown': {
        if (G.crownT > 0) break;
        G.crownT = 2.6;
        const minelost = ev.side === ME;
        hud.banner(T.crownSea, { kind: minelost ? 'is-foe' : 'is-me', ms: 2200 });
        slow(1.0, 0.4);
        stage.shake(1.1);
        sfx(minelost ? 'lost' : 'milestone');
        buzz(minelost ? 'lost' : 'heavy');
        break;
      }
      case 'blast': {
        const p = new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0);
        fx.boom(p, 9);
        fx.stopTrail();
        stage.shake(1.5);
        if (!calm) G.freeze = 0.05;
        slow(0.5, 0.35);
        callout(T.boom, ev.x, ev.y - 60, 'is-boom');
        sfx('thunder');
        sfx('clash');
        buzz('heavy');
        if (G.phase === 'flight') { setPhase('settle'); hud.hideTap(); }
        break;
      }
      case 'break': {
        const g = meshes.get(e.id);
        fx.shatter(new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0), g?.children[0]?.material || pieces.M.sandstone, { n: 14, size: Math.max(0.8, e.w / PX / 3.5) });
        callout(T.smashed, ev.x, ev.y - 50, 'is-gold');
        sfx('clash');
        stage.shake(0.5);
        break;
      }
      case 'spiked': {
        const g = meshes.get(e.id);
        fx.shatter(new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0), g?.children[0]?.material || pieces.M.sandstone, { n: 12, size: 0.8 });
        fx.stopTrail();
        callout(T.spiked, ev.x, ev.y - 60, 'is-gold');
        sfx('zap');
        sfx('clash');
        stage.shake(0.5);
        if (G.phase === 'flight') { setPhase('settle'); hud.hideTap(); }
        break;
      }
      case 'spring': {
        const g = meshes.get(e.id);
        if (g) g.userData.boing = 0.45;
        callout(T.sprung, ev.x, ev.y - 60, 'is-gold');
        sfx('pop');
        sfx('clown');
        break;
      }
      case 'skip': {
        fx.splash(mOf(ev.x), { size: 0.6 });
        callout(T.skip, ev.x, -60, '');
        sfx('splash');
        break;
      }
      case 'burst': {
        const p = new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0);
        if (ev.kind !== 'blast') {
          fx.sparkle(p, 40, ev.kind === 'slam' ? '#ffffff' : '#ffd46a', 9);
          sfx(ev.kind === 'hop' ? 'pop' : 'zap');
          sfx('fling');
          stage.shake(0.25);
          slow(0.18, 0.5);
        }
        callout(T.bursts[ev.kind], ev.x, ev.y - 50, 'is-gold');
        if (e.side === ME) buzz('heavy');
        hud.hideTap();
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
    handle(sim.drain());
    if (G.pendingBurst != null && sim.stepN >= G.pendingBurst) { G.pendingBurst = null; if (G.shot?.flying) sim.burst(G.shot); handle(sim.drain()); }
    acc -= 1;
    n++;
  }
  if (n === 4) acc = 0;
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
  if (ghost.shape !== G.shape) {
    if (ghost.mesh) scene.remove(ghost.mesh);
    ghost.mesh = pieces.ghost(G.shape);
    ghost.shape = G.shape;
    scene.add(ghost.mesh);
  }
  const s = shapeInfo(G.shape);
  const list = sim.entries.filter((e) => e.alive && !e.flying && !(e.role === 'built' && !e.landed));
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

// ------------------------------------------------------------------------------------------- the pull (throw)
// Drag back from anywhere (the side view: screen right/up = the battle's x/y): the throw goes the other way, the
// pull's length is its power. Let go to fling; let go short of `PULL.min` to put it back.
const pull = { on: false, id: null, sx: 0, sy: 0, k: 0, step: 0 };
const pullPx = () => Math.min(210, stageEl.clientWidth * 0.48);
function updatePull(x, y) {
  const dx = x - pull.sx;
  const dy = y - pull.sy;
  pull.k = Math.min(1, Math.hypot(dx, dy) / pullPx());
  const dir = towardFoe(ME);
  let theta = Math.atan2(dy, -dx * dir);
  if (theta > PULL.angleMax || theta < -Math.PI / 2) theta = PULL.angleMax;
  else if (theta < PULL.angleMin) theta = PULL.angleMin;
  G.theta = theta;
  G.power = PULL.powerMin + (1 - PULL.powerMin) * pull.k;
  const reach = pull.k * 2.6;
  G.pullOff = { x: -Math.cos(theta) * dir * reach, y: -Math.sin(theta) * reach };
  const step = Math.floor(pull.k * 5);
  if (step > pull.step) { sfx('creak'); buzz('tap'); }
  pull.step = step;
}
function releasePull() {
  if (!pull.on) return;
  pull.on = false;
  if (G.phase !== 'aim' || G.side !== ME) return;
  if (pull.k * PULL.max < PULL.min) {   // (too short: put it back)
    G.pullOff = { x: 0, y: 0 };
    fx.hideArc();
    hud.scope(false);
    hud.tapSub(T.goldArc);
    return;
  }
  throwBlock(G.theta, G.power);
}
// the sling: two cables from the hook to the pulled block's top corners
const bandMat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.7 });
const bandGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
bandGeo.translate(0, 0.5, 0);
const bands = new THREE.Group();
const bandA = new THREE.Mesh(bandGeo, bandMat);
const bandB = new THREE.Mesh(bandGeo, bandMat);
bands.add(bandA, bandB);
bands.visible = false;
scene.add(bands);
const up = new THREE.Vector3(0, 1, 0);
function placeBand(m, a, b) {
  const d = b.clone().sub(a);
  m.position.copy(a);
  m.scale.set(1, d.length(), 1);
  m.quaternion.setFromUnitVectors(up, d.normalize());
}

// ------------------------------------------------------------------------------------------------ the cranes
const craneTx = [towerX(0) / PX, towerX(1) / PX];
const craneJib = [STACK_TOP + 18, STACK_TOP + 18];
const hookW = new THREE.Vector3();
const cornerA = new THREE.Vector3();
const cornerB = new THREE.Vector3();
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
      const p = sim.launchParams(side, G.shape);
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
    // the pulled-back block on its sling (aiming)
    if (holding) {
      const pulled = G.phase === 'aim' ? G.pullOff : { x: 0, y: 0 };
      G.hang.position.set(pulled.x, -G.hang.userData.top + pulled.y, 0);
      if (G.phase === 'aim' && (Math.abs(pulled.x) + Math.abs(pulled.y)) > 0.05) {
        c.hold.getWorldPosition(hookW);
        const u = G.hang.userData;
        G.hang.localToWorld(cornerA.set(-u.w / 2 + 0.2, u.top, 0));
        G.hang.localToWorld(cornerB.set(u.w / 2 - 0.2, u.top, 0));
        placeBand(bandA, hookW, cornerA);
        placeBand(bandB, hookW, cornerB);
        bands.visible = true;
      } else if (G.hangSide === side) bands.visible = false;
    }
  }
}

// ------------------------------------------------------------------------------------------------ the camera
const cam = { pos: new THREE.Vector3(0, 80, 240), look: new THREE.Vector3(0, 12, 0), tPos: new THREE.Vector3(0, 80, 240), tLook: new THREE.Vector3(0, 12, 0), k: 1.4 };
camera.position.copy(cam.pos);
camera.lookAt(cam.look);
function camTargets() {
  const s = G.side;
  const xs = towerX(s) / PX;
  const xf = sideX(1 - s) / PX;
  const dir = towardFoe(s);
  const ts = topM(s);
  const tf = topM(1 - s);
  const you = topM(ME);
  const rik = topM(FOE);
  const xMe = sideX(ME) / PX;
  const xFoe = sideX(FOE) / PX;
  const dMe = towardFoe(ME);
  let k = 2.2;
  const set = (p, l) => { cam.tPos.set(...p); cam.tLook.set(...l); };
  switch (G.phase) {
    case 'intro':
      if (G.phaseT < 0.4) set([0, 80, 240], [0, 12, 0]);
      else set([xMe + dMe * 4, you + 9, 52], [xMe + dMe * 2, you + 3, 0]);
      k = 0.9;
      break;
    case 'pick':
      // (the cards cover the lower 40%: the tower and the hanging block sit in the band above them)
      set([sideX(s) / PX + dir * 1.5, ts + 2.5, 38], [sideX(s) / PX + dir * 0.5, ts - 0.5, 0]);
      k = 2.2;
      break;
    case 'build': {
      // (wide enough for the whole swing and the block at both ends)
      const A = Math.min(BUILD.ampMax, BUILD.amp0 + BUILD.ampPer * G.builds[s]) / PX;
      const d = Math.max(40, (A * 2 + 9) / 0.36);
      set([xs, ts + 6, d], [xs, ts + 3.2, 0]);
      k = 2.2;
      break;
    }
    case 'aim': {
      if (s === ME) {
        // side on, at the jib's tip: room behind the block to pull, the arc rising towards them (the scope shows them)
        const p = sim.launchParams(ME, G.shape || 'cube');
        const bx = mOf(p.x0);
        const by = -mOf(p.y0);
        set([bx + dir * 1.4, by + 2.4, 38], [bx + dir * 1.4, by - 0.6, 0]);
        k = 2.6;
      } else {
        set([xMe - dMe * 24, you + 12, 4.5], [xFoe - dMe * 8, rik + 4, 0]);
        k = 1.6;
      }
      break;
    }
    case 'other':
    case 'wait':
      set([xMe - dMe * 24, you + 12, 4.5], [xFoe - dMe * 8, rik + 4, 0]);
      k = 1.5;
      break;
    case 'flight': {
      const b = G.shot?.alive ? G.shot.body.position : null;
      if (b) {
        const px = mOf(b.x);
        const py = -mOf(b.y);
        const d = Math.sign(G.shot.body.velocity.x) || dir;
        const near = Math.abs(px - xf) < 26 && d === dir;
        // (the chase leads the block by its speed: the camera's lag no longer leaves it behind)
        const lx = px + mOf(G.shot.body.velocity.x) * 60 * 0.3;
        const ly = py - mOf(G.shot.body.velocity.y) * 60 * 0.3;
        if (near) { set([xf - d * 13, tf + 3, 31], [xf, tf - 1.5, 0]); k = 2.2; }
        else { set([lx - d * 14, ly + 5.5, 13], [lx + d * 12, ly - 1, 0]); k = 3.4; }
      }
      break;
    }
    case 'settle':
      if (G.action === 'throw') {
        const tgt = G.shot?.alive && Math.abs(G.shot.body.position.x - sideX(s)) < STACK.w ? s : 1 - s;
        const xt = sideX(tgt) / PX;
        set([xt - dir * 13, topM(tgt) + 3, 32], [xt, topM(tgt) - 1.5, 0]);
        k = 1.8;
      } else {
        set([xs, ts + 6, 44], [xs, ts + 3.2, 0]);
        k = 1.8;
      }
      break;
    case 'between':
      set([xMe - dMe * 30, Math.max(you, rik) + 15, 12], [xFoe - dMe * 14, (you + rik) / 2 + 3, 0]);
      k = 1.5;
      break;
    case 'over': {
      const w = G.result === 'lose' ? FOE : ME;
      const c = sim.crowns[w];
      const cx = c.alive ? mOf(c.body.position.x) : sideX(w) / PX;
      const cy = c.alive ? -mOf(c.body.position.y) : topM(w);
      set([cx + 7 * towardFoe(w), cy + 3.2, 16], [cx, cy + 0.8, 0]);
      k = 2;
      break;
    }
    default:
      break;
  }
  cam.k = calm ? Math.max(k, 4) : k;
}
function updateCamera(dt) {
  const a = 1 - Math.exp(-cam.k * dt);
  cam.pos.lerp(cam.tPos, a);
  cam.look.lerp(cam.tLook, a);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
}
// the scope: their tower in a little window while you pull, with the ring where your block will land
const scopeCam = new THREE.PerspectiveCamera(30, 1, 0.5, 4000);
function renderScope() {
  const el = hud.scopeEl;
  if (!el || !hud.scopeOn) return;
  const cr = canvasEl.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const x = r.left - cr.left;
  const y = cr.bottom - r.bottom;
  const xf = sideX(FOE) / PX;
  const tf = topM(FOE);
  const hit = G.pred?.hit;
  const hx = hit ? hit.x / PX : xf;
  const hy = hit ? Math.max(-hit.y / PX, 1) : tf;
  const lookX = Math.max(xf - 9, Math.min(xf + 9, hx));
  const lookY = Math.max(STACK_TOP - 2, Math.min(tf + 6, hy));
  scopeCam.position.set(lookX - towardFoe(ME) * 10, lookY + 4, 30);
  scopeCam.lookAt(lookX, lookY, 0);
  scopeCam.aspect = r.width / r.height;
  scopeCam.updateProjectionMatrix();
  const auto = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  renderer.setScissorTest(true);
  renderer.setScissor(x, y, r.width, r.height);
  renderer.setViewport(x, y, r.width, r.height);
  renderer.render(scene, scopeCam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, cr.width, cr.height);
  renderer.shadowMap.autoUpdate = auto;
}

// ------------------------------------------------------------------------------------------------ the bars
function crownState(side) {
  if (sim.crownLost(side)) return 'lost';
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
  hud.hideTap();
  hud.hideCards();
  hud.scope(false);
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
  const title = result === 'win' ? T.win : result === 'lose' ? T.lose : T.draw;
  const sub = why === 'gone' ? T.gone(foeName) : why === 'sea' ? (result === 'win' ? T.winSeaOf(foeName) : result === 'lose' ? T.loseSea : T.drawSudden) : T.drawSudden;
  const st = G.stats;
  setTimeout(() => {
    hud.modal(`<div class="bt-res is-${result}"><small>${T.title}</small><h2>${title}</h2><p>${sub}</p>
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
  pull.on = false;
  try { audio.suspend(); } catch { /* */ }
  hud.modal(`<div class="bt-pausecard"><small>${T.title}</small><h2>${T.paused}</h2>
    <button class="bt-resume" type="button">${T.resume}</button><button class="bt-restart" type="button">${T.restart}</button><button class="bt-quit" type="button">${T.quit}</button></div>`, {
    '.bt-resume': () => { hud.closeModal(); G.paused = false; try { audio.resume(); } catch { /* */ } },
    '.bt-restart': () => { location.href = again(); },
    '.bt-quit': () => goBack(),
  });
}
document.addEventListener('visibilitychange', () => { if (document.hidden && !G.over && !FRIEND) openPause(); });

// ------------------------------------------------------------------------------------------------ the input
function onTap() {
  if (G.side !== ME || G.paused) return;
  if (G.phase === 'build' && G.phaseT > 0.25) dropBlock();
  else if (G.phase === 'flight') fireBurst();
}
let ambOn = false;
stageEl.addEventListener('pointerdown', (e) => {
  try { audio.unlock(); if (!ambOn) { ambOn = true; audio.setAmbience(0.55); } } catch { /* */ }
  if (e.target.closest('button') || hud.modalOpen) return;
  if (G.phase === 'aim' && G.side === ME && G.phaseT > 0.2 && !G.paused) {
    pull.on = true;
    pull.id = e.pointerId;
    pull.sx = e.clientX;
    pull.sy = e.clientY;
    pull.k = 0;
    pull.step = 0;
    try { stageEl.setPointerCapture(e.pointerId); } catch { /* */ }
    return;
  }
  onTap();
});
stageEl.addEventListener('pointermove', (e) => { if (pull.on && e.pointerId === pull.id) updatePull(e.clientX, e.clientY); });
stageEl.addEventListener('pointerup', (e) => { if (pull.on && e.pointerId === pull.id) releasePull(); });
stageEl.addEventListener('pointercancel', (e) => { if (pull.on && e.pointerId === pull.id) { pull.on = false; G.pullOff = { x: 0, y: 0 }; } });
addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onTap(); }
  if (e.code === 'Escape') openPause();
});

// ------------------------------------------------------------------------------------------------ the loop
function tick(dt, time) {
  G.phaseT += dt;
  physics(dt);
  syncMeshes(Math.min(1, acc), dt);
  if (G.crownT > 0 && !FRIEND) { G.crownT -= dt; if (G.crownT <= 0 && !G.over) endTurn(); }
  switch (G.phase) {
    case 'intro':
      if (!G.titled && G.phaseT > 0.35) { G.titled = true; hud.banner(T.title, { sub: `${T.you} · ${T.rikus}`, kind: '', ms: 1900 }); sfx('horn'); }
      if (G.phaseT > 2.4) {
        setPhase('wait');
        let seen = false;
        try { seen = !!JSON.parse(localStorage.getItem(KEY) || '{}').tip2; } catch { /* */ }
        const go = () => {
          if (myBonus) hud.banner(T.dailyBonus(myBonus), { kind: 'is-me is-small', ms: 1600 });
          if (FRIEND) friendSetup();
          else setTimeout(() => startTurn(0), myBonus ? 1200 : 0);
        };
        if (seen || q.has('notip')) go();
        else {
          hud.modal(`<div class="bt-tip"><small>${T.title}</small><p>${T.tip}</p><p>${T.tip3}</p><p class="bt-tip2">${T.higher}</p><button class="bt-ok" type="button">${T.tipOk}</button></div>`, {
            '.bt-ok': () => { hud.closeModal(); try { localStorage.setItem(KEY, JSON.stringify({ tip2: 1 })); } catch { /* */ } go(); },
          });
        }
      }
      break;
    case 'other':
      // Robot Rikus thinks; a friend's moves come over the room (onRemote)
      if (!FRIEND && !G.plan && G.phaseT > RIKUS.thinkMs / 1000) {
        G.plan = rikusPlan(sim, G.cards, G.turns[FOE], rand);
        if (G.sudden && G.plan.action === 'build') G.plan = { shape: G.cards.find((c) => c === 'cube' || c === 'crate') || G.cards[0], action: 'throw', theta: 0.75 };
        G.shape = G.plan.shape;
        showHanging(FOE, G.shape);
        beginAction(G.plan.action);
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
        if (pull.on && pull.k > 0.04) {
          G.pred = sim.predict(ME, G.shape, G.theta, G.power);
          const path = G.pred.path.map((p) => ({ x: p.x / PX, y: -p.y / PX }));
          fx.showArc(path, { x: G.pred.hit.x / PX, y: -G.pred.hit.y / PX, sea: G.pred.hit.kind === 'sea' }, G.pred.perfect);
          hud.scope(true, G.pred.perfect);
          hud.tapSub(`${T.powerPct(Math.round(G.power * 100))} · ${Math.round((G.theta * 180) / Math.PI)}°`);
        }
      } else if (G.plan || G.remoteThrow) {
        // Rikus (or the friend's throw, replayed) winds up on the sling, then lets go
        const aim = G.remoteThrow || { theta: G.plan.theta, power: 1 };
        const span = G.remoteThrow ? 0.55 : 1.1;
        const k = Math.min(1, G.aimT / span);
        const e = k * k * (3 - 2 * k) * 2.4 * aim.power;
        const dir = towardFoe(FOE);
        G.pullOff = { x: -Math.cos(aim.theta) * dir * e, y: -Math.sin(aim.theta) * e };
        if (G.aimT > span + 0.2) throwBlock(aim.theta, aim.power);
      }
      break;
    }
    case 'flight':
      if (!FRIEND && G.side === FOE) rikusBurst();
      if (G.phaseT > 8) { setPhase('settle'); hud.hideTap(); }
      break;
    case 'settle': {
      if (G.crownT > 0 && !FRIEND) break;
      const quiet = (sim.settled() && G.phaseT > SETTLE.minMs / 1000) || G.phaseT > SETTLE.maxMs / 1000;
      if (!FRIEND) { if (quiet) endTurn(); break; }
      // a friend battle: the one whose turn it is sends where everything ended up; the other phone takes it
      if (G.side === ME) {
        if (quiet && !G.sentDone) {
          G.sentDone = true;
          conn?.send({ t: 'done', snap: sim.snap(), blocks: G.blocks });
          G.crownT = 0;
          endTurn();
        }
      } else if (G.remoteDone && (quiet || G.phaseT > 3)) {
        const d = G.remoteDone;
        G.remoteDone = null;
        sim.applySnap(d.snap);
        if (Array.isArray(d.blocks)) G.blocks = [d.blocks[0] | 0, d.blocks[1] | 0];
        for (const e of sim.entries) {
          const g = meshes.get(e.id);
          if (!g || !e.alive) continue;
          if (e.hp < e.hpMax) pieces.crack(g, e.hpMax - e.hp);
          e.ix = undefined;
        }
        G.crownT = 0;
        endTurn();
      } else if (G.phaseT > 25) friendGone();
      break;
    }
    case 'between':
      if (G.phaseT > 1.5) { G.sentDone = false; nextTurn(); }
      break;
    default:
      break;
  }
  updateCranes(dt, time);
  updateGhost();
  camTargets();
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
function friendGone() {
  if (G.over) return;
  hud.banner(T.gone(foeName), { kind: 'is-small', ms: 2200 });
  gameOver('draw', 'gone');
}
function showInvite(code) {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('kamer', code);
  const link = u.toString();
  hud.modal(`<div class="bt-invite"><small>${T.title}</small><h2>${T.inviteTitle}</h2><p>${T.inviteText}</p>
    <div class="bt-code">${code}</div><div class="bt-link">${link}</div>
    <button class="bt-wa" type="button">${T.inviteWa}</button><button class="bt-copy" type="button">${T.inviteCopy}</button>
    <p class="bt-waiting">${T.inviteWait}</p><button class="bt-home" type="button">${T.toStapel}</button></div>`, {
    '.bt-wa': () => { window.open(`https://wa.me/?text=${encodeURIComponent(T.waText(link))}`, '_blank'); },
    '.bt-copy': (e) => { try { navigator.clipboard.writeText(link); e.target.textContent = T.inviteCopied; } catch { /* */ } },
    '.bt-home': () => goBack(),
  });
}
async function friendSetup() {
  const net = createSlagNet({ api: matchApiUrl() });
  let code = FRIEND_CODE;
  if (FRIEND_HOST) {
    code = await net.create();
    if (!code) { hud.modal(`<div class="bt-tip"><small>${T.title}</small><p>${T.noServer}</p><button class="bt-home" type="button">${T.toStapel}</button></div>`, { '.bt-home': () => goBack() }); return; }
    showInvite(code);
  } else {
    hud.modal(`<div class="bt-invite"><small>${T.title}</small><p class="bt-waiting">${T.joining}</p><button class="bt-home" type="button">${T.toStapel}</button></div>`, { '.bt-home': () => goBack() });
  }
  conn = net.connect(code);
  const ready = await Promise.race([conn.ready, conn.next(['gone'])]);
  if (ready && ready.t === 'gone') { hud.closeModal(); friendGone(); return; }
  conn.send({ t: 'hello', name: myName || '', bonus: myBonus, seed: SEED });
  const hi = await conn.next(['hello']);
  if (hi.t === 'gone') { hud.closeModal(); friendGone(); return; }
  hud.closeModal();
  foeName = String(hi.name || '').slice(0, 16) || T.friend;
  G.blocks[FOE] = BUDGET.base + Math.max(0, Math.min(BUDGET.dailyMax, hi.bonus | 0));
  if (ME === 1) { SEED = Number(hi.seed) || SEED; rand = rng(SEED); }   // (the host's seed: the same blocks offered on both phones)
  nameBars();
  listen();
  startTurn(0);
}
async function listen() {
  for (;;) {
    const m = await conn.next(['pick', 'build', 'throw', 'burst', 'done', 'bye']);
    if (m.t === 'gone' || m.t === 'bye') { friendGone(); return; }
    onRemote(m);
  }
}
function onRemote(m) {
  const theirs = G.side === FOE;
  if (m.t === 'pick' && theirs && G.phase === 'other') { G.shape = m.shape; showHanging(FOE, m.shape); return; }
  if (m.t === 'build' && theirs && (G.phase === 'other' || G.phase === 'build')) {
    G.shape = m.shape;
    G.action = 'build';
    showHanging(FOE, m.shape);
    hud.hideTap();
    dropBlock({ x: m.x, y: m.y, vx: m.vx });
    return;
  }
  if (m.t === 'throw' && theirs && (G.phase === 'other' || G.phase === 'aim')) {
    G.shape = m.shape;
    showHanging(FOE, m.shape);
    G.remoteThrow = { theta: m.theta, power: m.power };
    beginAction('throw');
    return;
  }
  if (m.t === 'burst') {   // (their mid-air tap, at the same step of the flight; it may come before the replay's launch)
    if (G.shot && G.shot.side === FOE && G.shot.role === 'proj') G.pendingBurst = G.launchStep + (m.n | 0);
    else G.pendingBurstN = m.n | 0;
    return;
  }
  if (m.t === 'done') G.remoteDone = m;
}

// warm the shaders behind the loading screen (every block, the arc, a splash), then go
const extras = ['cube', 'plank', 'wedge', 'crate', 'pillar'].map((s, i) => { const g = pieces.block(s, i % 2); g.position.set(0, -50, 0); return g; });
let last = performance.now();
let time = 0;
// (?prof: ms per part of a frame, averaged, in window.__btProf)
const PROF = q.has('prof') ? { tick: 0, fx: 0, render: 0, scope: 0, draws: 0, n: 0 } : null;
const avg = (k, v) => { PROF[k] += (v - PROF[k]) * 0.05; };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  if (!G.paused) {
    time += dt;
    tick(dt, time);
  }
  const t1 = performance.now();
  world.update(time);
  fx.update(G.paused ? 0 : dt * (G.slowT > 0 ? Math.max(0.4, G.slowRate) : 1), camera);
  updateCamera(dt);
  const t2 = performance.now();
  stage.render(dt);
  const t3 = performance.now();
  if (G.phase === 'aim' && G.side === ME) renderScope();
  if (PROF) { avg('tick', t1 - t0); avg('fx', t2 - t1); avg('render', t3 - t2); avg('scope', performance.now() - t3); PROF.draws = renderer.info.render.calls; window.__btProf = PROF; }
}
stage.warm(extras).then(() => {
  updateTop();
  requestAnimationFrame((t) => { last = t; frame(t); });
  setTimeout(() => { window.__btReady = true; }, 300);
});

// test hooks (qa/botsing1180.mjs)
window.__bt = {
  G, sim, T, SEED, pull,
  pick: (shape, action) => { onChoose(shape, null); if (action) onChoose(shape, action); },
  tap: onTap,
  /** An aim (angle, power) whose arc reaches their `kind` ('crown', 'block'), or null. */
  ME, FOE,
  findAim(kind = 'crown') {
    for (let p = 1; p >= 0.5; p -= 0.05) {
      for (let a = PULL.angleMin; a <= PULL.angleMax; a += Math.PI / 180) {
        const r = sim.predict(ME, G.shape, a, p);
        if (r.hit.kind === kind && r.hit.side === FOE) return { theta: a, power: p };
      }
    }
    return null;
  },
  /** Throws at once with this aim (tests: no frame between the aim and the throw). */
  throwAim(aim) { if (G.phase === 'aim' && G.side === ME) throwBlock(aim.theta, aim.power); },
  burst: fireBurst,
  trolley: () => trolley(ME),
  ghost,
};
