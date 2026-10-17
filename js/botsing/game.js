// (1.18 3D) Blokbotsing: the battle vs Robot Rikus. Turn by turn: the crane offers three blocks; pick one, then BUILD
// (it swings over your tower, a tap drops it: Stapel's own stacking, Perfek cements it) or THROW (the dotted arc sweeps,
// a tap lets go; gold = right on their crown: a Perfek throw hits harder). Rikus answers. The camera follows every throw
// across the sea, hits slow down and shake, a crown in the sea ends it; after 12 turns each the higher crown wins.
import * as THREE from '../../lib/three.module.min.js';
import { createStage } from '../kasteel/stage.js';
import { buildWorld, STACK_TOP } from './world.js';
import { createPieces } from './pieces.js';
import { createSim } from './sim.js';
import { createBattleFx } from './fx.js';
import { createHud } from './hud.js';
import { rikusPlan } from './rikus.js';
import { PX, sideX, towardFoe, TURNS_EACH, BUILD, RIKUS, SETTLE, LAUNCH, CROWN, STACK, G_STEP, offer, aimAngle, rng } from './rules.js';
import { shapeInfo } from './sim.js';
import { PHYSICS } from '../config.js';
import { T, PREFS, goBack } from './text.js';
import { audio, haptics } from '../audio.js';

const q = new URLSearchParams(location.search);
const SEED = Number(q.get('seed')) || 1 + (Date.now() % 2147480000);
const rand = rng(SEED);
const KEY = 'stapel.v1.botsing';
audio.setEnabled(PREFS.sound);
haptics.setEnabled(PREFS.vibration);
const sfx = (n, o) => { try { audio.play(n, o); } catch { /* sound off */ } };
const buzz = (k) => { try { haptics[k]?.(); } catch { /* no haptics */ } };
const calm = PREFS.reducedMotion;

const stage = createStage({ fov: 46 });
const { scene, camera } = stage;
const stageEl = document.getElementById('k-stage');
const world = buildWorld(stage);
const pieces = createPieces(stage.renderer);
const sim = createSim();
const fx = createBattleFx(stage);
const cranes = [pieces.crane(0), pieces.crane(1)];
scene.add(cranes[0].group, cranes[1].group);
const hud = createHud({ onPause: () => openPause() });

const G = {
  phase: 'intro', phaseT: 0, side: 0, turns: [0, 0], cards: [], shape: null, action: null, plan: null,
  buildT: 0, aimT: 0, theta: 0, pred: null, hang: null, hangSide: 0, shot: null, shotHit: false,
  slowT: 0, freeze: 0, paused: false, over: false, crownT: 0, builds: [0, 0], danger: [false, false],
  prevRel: null, topT: 0, sparkT: 0,
  stats: { pb: [0, 0], pt: [0, 0], hits: [0, 0], sunk: [0, 0] },
};
const mOf = (px) => px / PX;
const topM = (side) => -mOf(sim.towerTopY(side));

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
function syncMeshes() {
  for (const e of sim.entries) {
    const g = e.alive ? meshFor(e) : meshes.get(e.id);
    if (!g) continue;
    if (!e.alive) { g.visible = false; continue; }
    g.position.set(e.body.position.x / PX, -e.body.position.y / PX, 0);
    g.rotation.z = -e.body.angle;
    if (g.userData.boing > 0) {
      g.userData.boing -= 1 / 60;
      const k = g.userData.boing / 0.45;
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
  hud.banner(side === 0 ? T.yourTurn : T.rikusTurn, { sub: T.turn(G.turns[side] + 1, TURNS_EACH), kind: side === 0 ? 'is-me' : 'is-foe', ms: 1250 });
  sfx('banner');
  if (side === 0) {
    setPhase('pick');
    hud.hideTap();
    hud.showCards(G.cards, onChoose);
  } else {
    setPhase('rikus');
    hud.hideCards();
    hud.showTap(T.rikusThinks, '', null);
  }
}
function onChoose(shape, action) {
  if (G.phase !== 'pick') return;
  G.shape = shape;
  showHanging(0, shape);
  sfx('click');
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
}
function beginAction(action) {
  G.action = action;
  hud.hideCards();
  const mine = G.side === 0;
  if (action === 'build') {
    setPhase('build');
    G.buildT = 0;
    hud.showTap(mine ? T.tapDrop : T.rikusTurn, `${T.names[G.shape]} · ${T.powers[G.shape].build}`, mine ? backToCards : null);
  } else {
    setPhase('aim');
    G.aimT = 0;
    hud.showTap(mine ? T.tapThrow : T.rikusTurn, mine ? T.goldArc : `${T.names[G.shape]} · ${T.powers[G.shape].throw}`, mine ? backToCards : null);
  }
}
function backToCards() {
  if (G.side !== 0 || (G.phase !== 'build' && G.phase !== 'aim')) return;
  fx.hideArc();
  setPhase('pick');
  hud.hideTap();
  hud.showCards(G.cards, onChoose, { selected: G.shape });
}
/** The trolley over `side`'s stack (px, px/s): wider and quicker with every block that side has built. */
function trolley(side) {
  const n = G.builds[side];
  const A = Math.min(BUILD.ampMax, BUILD.amp0 + BUILD.ampPer * n);
  const w = Math.min(BUILD.wMax, BUILD.w0 + BUILD.wPer * n);
  const t = G.buildT;
  return { x: sideX(side) + A * Math.sin(w * t), vx: A * w * Math.cos(w * t), ax: -A * w * w * Math.sin(w * t) };
}
function dropBlock() {
  const g = G.hang;
  if (!g) return;
  const side = G.side;
  const wp = new THREE.Vector3();
  g.getWorldPosition(wp);
  const tr = trolley(side);
  const e = sim.release(side, G.shape, wp.x * PX, -wp.y * PX, tr.vx / 60);
  scene.attach(g);
  g.rotation.set(0, 0, 0);
  meshes.set(e.id, g);
  G.hang = null;
  G.builds[side]++;
  G.shot = e;
  sfx('drop');
  if (side === 0) buzz('tap');
  hud.hideTap();
  setPhase('settle');
}
function throwBlock() {
  const g = G.hang;
  if (!g) return;
  const side = G.side;
  const p = sim.predict(side, G.shape, G.theta);
  const e = sim.launch(side, G.shape, G.theta, p.perfect);
  scene.attach(g);
  g.rotation.set(0, 0, 0);
  meshes.set(e.id, g);
  G.hang = null;
  G.shot = e;
  G.shotHit = false;
  cranes[side].whip(1);
  fx.sparkle(new THREE.Vector3(mOf(p.x0), -mOf(p.y0) + 0.6, 0), 14, '#ffffff', 5);
  fx.hideArc();
  fx.trail(g, p.perfect);
  sfx('fling');
  if (side === 0) buzz('tap');
  if (p.perfect) {
    G.stats.pt[side]++;
    fx.sparkle(new THREE.Vector3(mOf(p.x0), -mOf(p.y0), 0), 36);
    callout(T.perfectThrow, p.x0, p.y0 - 40, 'is-gold');
    sfx('perfect');
    if (side === 0) buzz('perfect');
  }
  hud.hideTap();
  setPhase('flight');
}
function endTurn() {
  if (G.over) return;
  fx.hideArc();
  fx.stopTrail();
  G.turns[G.side]++;
  const lost0 = sim.crownLost(0);
  const lost1 = sim.crownLost(1);
  if (lost0 || lost1) { gameOver(lost0 && lost1 ? 'draw' : lost1 ? 'win' : 'lose', 'sea'); return; }
  if (G.turns[0] >= TURNS_EACH && G.turns[1] >= TURNS_EACH) {
    const d = sim.crownY(1) - sim.crownY(0);   // (y down: a positive d means your crown stands higher)
    gameOver(Math.abs(d) < 8 ? 'draw' : d > 0 ? 'win' : 'lose', 'high');
    return;
  }
  setPhase('between');
}

// ----------------------------------------------------------------------------------------- what happens
function handle(events) {
  for (const ev of events) {
    const e = ev.entry;
    const mine = e && e.side === 0;
    switch (ev.type) {
      case 'land': {
        const g = meshes.get(e.id);
        const p = { x: mOf(ev.x), y: -mOf(ev.y) };
        fx.land(p, ev.rating, e.w / PX);
        if (ev.rating === 'P') {
          if (g) pieces.seam(g);
          G.stats.pb[e.side]++;
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
        stage.shake(0.35 + 0.55 * k);
        if (!calm && ev.onto !== 'stack') { G.freeze = 0.06; G.slowT = 0.55; }
        sfx('clash');
        sfx('land');
        if (e.side === 0) buzz('heavy');
        const foeHit = ev.other && ev.other.kind !== 'stack' && ev.other.side !== e.side;
        if (foeHit) G.stats.hits[e.side]++;
        if (foeHit && ev.onto === 'crown') { hud.banner(T.crownHit, { kind: e.side === 0 ? 'is-me' : 'is-foe', ms: 1100 }); sfx('warning'); }
        if (G.phase === 'flight') setPhase('settle');
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
          if (G.phase === 'flight') setPhase('settle');
        } else if (e && e.role !== 'proj' && e.side !== G.side) G.stats.sunk[G.side]++;
        break;
      }
      case 'crown': {
        if (G.crownT > 0) break;
        G.crownT = 2.6;
        const minelost = ev.side === 0;
        hud.banner(T.crownSea, { kind: minelost ? 'is-foe' : 'is-me', ms: 2200 });
        if (!calm) G.slowT = 1.3;
        stage.shake(1.2);
        sfx(minelost ? 'lost' : 'milestone');
        buzz(minelost ? 'lost' : 'heavy');
        break;
      }
      case 'blast': {
        const p = new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0);
        fx.boom(p, 9);
        fx.stopTrail();
        stage.shake(1.7);
        if (!calm) { G.freeze = 0.08; G.slowT = 0.7; }
        callout(T.boom, ev.x, ev.y - 60, 'is-boom');
        sfx('thunder');
        sfx('clash');
        buzz('heavy');
        if (G.phase === 'flight') setPhase('settle');
        break;
      }
      case 'break': {
        const g = meshes.get(e.id);
        fx.shatter(new THREE.Vector3(mOf(ev.x), -mOf(ev.y), 0), g?.children[0]?.material || pieces.M.sandstone, { n: 14, size: Math.max(0.8, e.w / PX / 3.5) });
        callout(T.pierced, ev.x, ev.y - 50, 'is-gold');
        sfx('clash');
        stage.shake(0.6);
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
        if (G.phase === 'flight') setPhase('settle');
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
      default:
        break;
    }
  }
}

// --------------------------------------------------------------------------------------------- the physics
let acc = 0;
function physics(dt) {
  if (G.freeze > 0) { G.freeze -= dt; return; }
  const ts = G.slowT > 0 ? 0.3 : 1;
  if (G.slowT > 0) G.slowT -= dt;
  acc += dt * ts * 60;
  let n = 0;
  while (acc >= 1 && n < 4) {
    sim.step();
    handle(sim.drain());
    acc -= 1;
    n++;
  }
  if (n === 4) acc = 0;
}

// ------------------------------------------------------------------------------------------- the landing guide
// (Stapel's own ghost) where the hanging block will land if dropped now: it falls with a little of the trolley's speed;
// gold when it lands within a Perfek of the block under it.
const ghost = { mesh: null, shape: null };
const AIR = 1 - PHYSICS.block.frictionAir;
function surfaceUnder(x, hw, side) {
  let top = Math.abs(x - sideX(side)) < STACK.w / 2 ? STACK.topY : 60;
  let sup = null;
  for (const e of sim.entries) {
    if (!e.alive || e.flying || (e.role === 'built' && !e.landed)) continue;
    const b = e.body.bounds;
    if (b.max.x < x - hw + 4 || b.min.x > x + hw - 4) continue;
    if (b.min.y < top) { top = b.min.y; sup = e; }
  }
  return { top, sup };
}
function updateGhost() {
  const on = G.phase === 'build' && G.side === 0 && G.hang;
  ghost.gold = false;
  if (!on) { if (ghost.mesh) ghost.mesh.visible = false; return; }
  if (ghost.shape !== G.shape) {
    if (ghost.mesh) scene.remove(ghost.mesh);
    ghost.mesh = pieces.ghost(G.shape);
    ghost.shape = G.shape;
    scene.add(ghost.mesh);
  }
  const s = shapeInfo(G.shape);
  const wp = new THREE.Vector3();
  G.hang.getWorldPosition(wp);
  let x = wp.x * PX;
  let y = -wp.y * PX;
  let vx = (trolley(0).vx / 60) * BUILD.carry;
  let vy = 0;
  const bottom = s.h - s.cy;
  let land = null;
  for (let i = 0; i < 240; i++) {
    vx *= AIR;
    vy = vy * AIR + G_STEP;
    x += vx;
    y += vy;
    const u = surfaceUnder(x, s.w / 2, 0);
    if (y + bottom >= u.top) { land = { x, y: u.top - bottom, sup: u.sup }; break; }
  }
  if (!land) { ghost.mesh.visible = false; return; }
  ghost.mesh.visible = true;
  ghost.mesh.position.set(land.x / PX, -land.y / PX, 0);
  const sup = land.sup;
  const tol = sup ? Math.min(BUILD.perfectTol, BUILD.perfectFrac * sup.w) : 0;
  ghost.gold = !!sup && sup.side === 0 && Math.abs(land.x - sup.body.position.x) <= tol;
  ghost.mesh.userData.gold(ghost.gold);
}

// ------------------------------------------------------------------------------------------------ the cranes
const craneTx = [sideX(0) / PX, sideX(1) / PX];
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
    let tx = sideX(side) / PX;
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
  }
}

// ------------------------------------------------------------------------------------------------ the camera
const cam = { pos: new THREE.Vector3(0, 80, 240), look: new THREE.Vector3(0, 12, 0), tPos: new THREE.Vector3(0, 80, 240), tLook: new THREE.Vector3(0, 12, 0), k: 1.4 };
camera.position.copy(cam.pos);
camera.lookAt(cam.look);
function camTargets() {
  const s = G.side;
  const xs = sideX(s) / PX;
  const xf = sideX(1 - s) / PX;
  const dir = towardFoe(s);
  const ts = topM(s);
  const tf = topM(1 - s);
  const you = topM(0);
  const rik = topM(1);
  let k = 2.2;
  const set = (p, l) => { cam.tPos.set(...p); cam.tLook.set(...l); };
  switch (G.phase) {
    case 'intro':
      if (G.phaseT < 0.4) set([0, 80, 240], [0, 12, 0]);
      else set([sideX(0) / PX + 4, you + 9, 52], [sideX(0) / PX + 2, you + 3, 0]);
      k = 0.9;
      break;
    case 'pick':
      // (the cards cover the lower 40%: the tower and the hanging block sit in the band above them)
      set([xs + dir * 2.5, ts + 2.5, 37], [xs + dir * 1.0, ts - 0.5, 0]);
      k = 2.4;
      break;
    case 'build': {
      // (wide enough for the whole swing and the block at both ends)
      const A = Math.min(BUILD.ampMax, BUILD.amp0 + BUILD.ampPer * G.builds[s]) / PX;
      const d = Math.max(40, (A * 2 + 9) / 0.36);
      set([xs, ts + 6, d], [xs, ts + 3.2, 0]);
      k = 2.4;
      break;
    }
    case 'aim': {
      if (s === 0) {
        const apex = G.pred ? Math.max(...G.pred.path.map((p) => -p.y)) / PX : ts;
        const lift = Math.max(0, apex - ts - 8) * 0.32;
        set([xs - dir * 34, ts + 10, 7], [xf - dir * 20, (ts + tf) / 2 + 3 + lift, 0]);
        k = 2.8;
      } else {
        set([sideX(0) / PX - 24, you + 12, 4.5], [sideX(1) / PX - 8, rik + 4, 0]);
        k = 1.8;
      }
      break;
    }
    case 'rikus':
      set([sideX(0) / PX - 24, you + 12, 4.5], [sideX(1) / PX - 8, rik + 4, 0]);
      k = 1.6;
      break;
    case 'flight': {
      const b = G.shot?.alive ? G.shot.body.position : null;
      if (b) {
        const px = mOf(b.x);
        const py = -mOf(b.y);
        const d = Math.sign(G.shot.body.velocity.x) || dir;
        const near = Math.abs(px - xf) < 24 && d === dir;
        if (near) { set([xf - d * 12, tf + 3, 30], [xf, tf - 1.5, 0]); k = 3; }
        else { set([px - d * 13, py + 5.5, 11], [px + d * 12, py - 1, 0]); k = 4.2; }
      }
      break;
    }
    case 'settle':
      if (G.action === 'throw') {
        const tgt = G.shot?.alive && Math.abs(G.shot.body.position.x - sideX(s)) < STACK.w ? s : 1 - s;
        const xt = sideX(tgt) / PX;
        set([xt - dir * 12, topM(tgt) + 3, 31], [xt, topM(tgt) - 1.5, 0]);
        k = 2.4;
      } else {
        set([xs + dir * 2.5, ts + 7.5, 46], [xs + dir * 1.2, ts + 4, 0]);
      }
      break;
    case 'between':
      set([sideX(0) / PX - 30, Math.max(you, rik) + 15, 12], [sideX(1) / PX - 14, (you + rik) / 2 + 3, 0]);
      k = 1.7;
      break;
    case 'over': {
      const w = G.result === 'lose' ? 1 : 0;
      const c = sim.crowns[w];
      const cx = c.alive ? mOf(c.body.position.x) : sideX(w) / PX;
      const cy = c.alive ? -mOf(c.body.position.y) : topM(w);
      set([cx + 7 * (w === 0 ? 1 : -1), cy + 3.2, 16], [cx, cy + 0.8, 0]);
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

// ------------------------------------------------------------------------------------------------ the bars
function crownState(side) {
  if (sim.crownLost(side)) return 'lost';
  const c = sim.crowns[side].body;
  const off = Math.abs(c.position.x - sideX(side));
  const tilt = Math.abs(Math.atan2(Math.sin(c.angle), Math.cos(c.angle)));
  return off > STACK.w / 2 - 50 || tilt > 0.5 ? 'danger' : 'ok';
}
function updateTop() {
  const sides = [0, 1].map((s) => ({
    h: sim.heightM(s),
    crown: crownState(s),
    power: Math.round((sim.launchParams(s, 'cube').v / LAUNCH.V0 - 1) * 100),
  }));
  const turnNo = Math.min(TURNS_EACH, G.turns[G.side] + 1);
  hud.setTop({ turn: turnNo, of: TURNS_EACH, active: G.side, sides });
  for (const s of [0, 1]) {
    const d = sides[s].crown === 'danger';
    if (d && !G.danger[s] && s === 0 && !G.over) {
      const c = sim.crowns[0].body;
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
  clearHanging();
  if (result === 'win') { sfx('record'); buzz('perfect'); } else if (result === 'lose') sfx('gameover');
  const winner = result === 'lose' ? 1 : 0;
  const c = sim.crowns[winner];
  if (c.alive && result !== 'draw') {
    const p = new THREE.Vector3(mOf(c.body.position.x), -mOf(c.body.position.y) + 1.5, 0);
    let n = 0;
    const burst = () => { fx.sparkle(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, 0)), 50, n % 2 ? '#ffd46a' : '#ffffff', 11); if (++n < 6) setTimeout(burst, 260); };
    burst();
  }
  const title = result === 'win' ? T.win : result === 'lose' ? T.lose : T.draw;
  const sub = why === 'sea' ? (result === 'win' ? T.winSea : T.loseSea) : result === 'win' ? T.winHigh : result === 'lose' ? T.loseHigh : T.drawHigh;
  const st = G.stats;
  setTimeout(() => {
    hud.modal(`<div class="bt-res is-${result}"><small>${T.title}</small><h2>${title}</h2><p>${sub}</p>
      <dl><div><dt>${T.stats.pb}</dt><dd>${st.pb[0]}</dd></div><div><dt>${T.stats.pt}</dt><dd>${st.pt[0]}</dd></div>
      <div><dt>${T.stats.hits}</dt><dd>${st.hits[0]}</dd></div><div><dt>${T.stats.sunk}</dt><dd>${st.sunk[0]}</dd></div></dl>
      <button class="bt-again" type="button">${T.again}</button><button class="bt-home" type="button">${T.toStapel}</button></div>`, {
      '.bt-again': () => { location.href = again(); },
      '.bt-home': () => goBack(),
    });
  }, why === 'sea' ? 2200 : 1400);
}
function again() {
  const u = new URL(location.href);
  if (u.searchParams.has('seed')) u.searchParams.set('seed', String(SEED + 1));
  return u.toString();
}
function openPause() {
  if (G.over || hud.modalOpen) return;
  G.paused = true;
  try { audio.suspend(); } catch { /* */ }
  hud.modal(`<div class="bt-pausecard"><small>${T.title}</small><h2>${T.paused}</h2>
    <button class="bt-resume" type="button">${T.resume}</button><button class="bt-restart" type="button">${T.restart}</button><button class="bt-quit" type="button">${T.quit}</button></div>`, {
    '.bt-resume': () => { hud.closeModal(); G.paused = false; try { audio.resume(); } catch { /* */ } },
    '.bt-restart': () => { location.href = again(); },
    '.bt-quit': () => goBack(),
  });
}
document.addEventListener('visibilitychange', () => { if (document.hidden && !G.over) openPause(); });

// ------------------------------------------------------------------------------------------------ the input
function onTap() {
  if (G.side !== 0 || G.paused) return;
  if (G.phase === 'build' && G.phaseT > 0.25) dropBlock();
  else if (G.phase === 'aim' && G.phaseT > 0.25) throwBlock();
}
let ambOn = false;
stageEl.addEventListener('pointerdown', (e) => {
  try { audio.unlock(); if (!ambOn) { ambOn = true; audio.setAmbience(0.55); } } catch { /* */ }
  if (e.target.closest('button') || hud.modalOpen) return;
  onTap();
});
addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onTap(); }
  if (e.code === 'Escape') openPause();
});

// ------------------------------------------------------------------------------------------------ the loop
function tick(dt, time) {
  G.phaseT += dt;
  physics(dt);
  syncMeshes();
  if (G.crownT > 0) { G.crownT -= dt; if (G.crownT <= 0 && !G.over) endTurn(); }
  switch (G.phase) {
    case 'intro':
      if (!G.titled && G.phaseT > 0.35) { G.titled = true; hud.banner(T.title, { sub: `${T.you} · ${T.rikus}`, kind: '', ms: 1900 }); sfx('horn'); }
      if (G.phaseT > 2.4) {
        setPhase('wait');
        let seen = false;
        try { seen = !!JSON.parse(localStorage.getItem(KEY) || '{}').tip; } catch { /* */ }
        if (seen || q.has('notip')) startTurn(0);
        else {
          hud.modal(`<div class="bt-tip"><small>${T.title}</small><p>${T.tip}</p><p class="bt-tip2">${T.higher}</p><button class="bt-ok" type="button">${T.tipOk}</button></div>`, {
            '.bt-ok': () => { hud.closeModal(); try { localStorage.setItem(KEY, JSON.stringify({ tip: 1 })); } catch { /* */ } startTurn(0); },
          });
        }
      }
      break;
    case 'rikus':
      if (!G.plan && G.phaseT > RIKUS.thinkMs / 1000) {
        G.plan = rikusPlan(sim, G.cards, G.turns[1], rand);
        G.shape = G.plan.shape;
        showHanging(1, G.shape);
        beginAction(G.plan.action);
      }
      break;
    case 'build': {
      G.buildT += dt;
      if (G.side === 1 && G.plan) {
        const rel = trolley(1).x - (sideX(1) + G.plan.offset);
        if (G.prevRel != null && G.buildT > 0.7 && Math.sign(rel) !== Math.sign(G.prevRel)) dropBlock();
        G.prevRel = rel;
        if (G.buildT > 9) dropBlock();
      }
      break;
    }
    case 'aim': {
      G.aimT += dt;
      G.theta = aimAngle(G.aimT);
      if (G.side === 0) {
        G.pred = sim.predict(0, G.shape, G.theta);
        const path = G.pred.path.map((p) => ({ x: p.x / PX, y: -p.y / PX }));
        fx.showArc(path, { x: G.pred.hit.x / PX, y: -G.pred.hit.y / PX, sea: G.pred.hit.kind === 'sea' }, G.pred.perfect);
      } else if (G.plan) {
        const rel = G.theta - G.plan.theta;
        if (G.prevRel != null && G.aimT > 0.6 && Math.sign(rel) !== Math.sign(G.prevRel)) throwBlock();
        G.prevRel = rel;
        if (G.aimT > 12) throwBlock();
      }
      break;
    }
    case 'flight':
      if (G.phaseT > 6) setPhase('settle');
      break;
    case 'settle':
      if (G.crownT > 0) break;
      if ((sim.settled() && G.phaseT > SETTLE.minMs / 1000) || G.phaseT > SETTLE.maxMs / 1000) endTurn();
      break;
    case 'between':
      if (G.phaseT > 1.1) startTurn(1 - G.side);
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

// warm the shaders behind the loading screen (every block, the arc, a splash), then go
const extras = ['cube', 'plank', 'wedge', 'crate', 'pillar'].map((s, i) => { const g = pieces.block(s, i % 2); g.position.set(0, -50, 0); return g; });
let last = performance.now();
let time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G.paused) {
    time += dt;
    tick(dt, time);
  }
  world.update(time);
  fx.update(G.paused ? 0 : dt * (G.slowT > 0 ? 0.45 : 1), camera);
  updateCamera(dt);
  stage.render(dt);
}
stage.warm(extras).then(() => {
  updateTop();
  requestAnimationFrame((t) => { last = t; frame(t); });
  setTimeout(() => { window.__btReady = true; }, 300);
});

// test hooks (qa/botsing1180.mjs)
window.__bt = {
  G, sim, T, SEED,
  pick: (shape, action) => { onChoose(shape, null); if (action) onChoose(shape, action); },
  tap: onTap,
  /** The first moment of the sweep (s) whose arc hits `kind` ('crown', 'block', 'sea') of the foe, or null. */
  findAim(kind = 'crown') {
    for (let t = 0.3; t < 6; t += 0.01) {
      const p = sim.predict(0, G.shape, aimAngle(t));
      if (p.hit.kind === kind && (kind === 'sea' || p.hit.side === 1)) return t;
    }
    return null;
  },
  setAimT(t) { G.aimT = t - 1 / 60; },
  /** Aims at sweep time t and throws at once (tests: no frame between the aim and the tap). */
  throwAt(t) { G.aimT = t; G.theta = aimAngle(t); if (G.phase === 'aim' && G.side === 0) throwBlock(); },
  setBuildT(t) { G.buildT = t; },
  trolley: () => trolley(0),
  ghost,
  crown: CROWN,
};
