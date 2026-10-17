// (1.17 3D) Die Kasteelreeks — a playable siege (the owner, 16 Oct 2026: "Make it a little better vissually, and you may
// proceed, more smoother"). Command + aim: tap a card and tap the field to send troops (they march, break at the gate,
// shoot the archers on the walls); take the trebuchet's sight yourself: drag to aim, hold GOOI to pull the arm, let go
// at the distance the rangefinder shows; the camera rides with the stone, slow at the end, and their castle's blocks
// fall for real. Three stars: break the gate, half the castle down, their flag falls. For now the castle is Robot
// Rikus's (towers like Daily Towers); `?seed=` picks a castle, `window.__siege` lets the tests play.
import * as THREE from '../../lib/three.module.min.js';
import { createStage } from './stage.js';
import { buildWorld, DIST, rng, groundHeight } from './world.js';
import { castleMaterials, buildCastle, sampleDaily } from './castle.js';
import { trebuchet, ram as makeRam, shot, cauldron, ballista as makeBallista, spikes as makeSpikes } from './army.js';
import { defaultPlan, loadPlan, spotIds, myDays, mySeed, helpSeen, markHelp } from './plan.js';
import { createCrowd } from './crowd.js';
import { setDetail } from './crew.js';
import { createPhysics } from './physics.js';
import { createFx } from './fx.js';
import { weldStill, towerWelds, weldInto } from './batch.js';
import { scoutScreen, createSiegeHud } from './hud.js';
import { T } from './text.js';
import { audio, haptics } from '../audio.js';

const q = new URLSearchParams(location.search);
// whose castle: Robot Rikus's (a castle by `?seed=`), or a copy of your own with your plan (`?teen=my`)
const MINE = q.get('teen') === 'my' ? (loadPlan() || { seed: mySeed(), plan: null }) : null;
const seed = MINE?.seed ?? (Number(q.get('seed')) || (Date.now() % 100000) + 1);
const rand = rng(seed);
const OPP = MINE ? T.mine : T.rikus;
const TITLE = MINE ? T.myTest : T.rikusCastle;
const NAME_IN = MINE ? T.myIn : T.rikusIn;
const HALF = 15;
const G_ACC = 16;   // the world's gravity (m/s²): everything falls with weight

// ------------------------------------------------------------------------------------------------------- the world
const st = createStage({ fov: 48 });
window.__quality = st.quality;
const { scene, camera, renderer } = st;
setDetail(st.quality.name === 'high' ? 1 : 0.5);   // (phones: simpler round shapes)
const world = buildWorld(scene, renderer, { seed: 11, grass: st.quality.grass, detail: st.quality.name === 'high' ? 1 : 0.6 });
st.onQuality((qq) => { world.setGrass(qq.grass); world.setShadow(qq.shadow); });
{
  const sun = world.sun;
  sun.target.position.set(0, 0, -80);
  sun.position.set(-100, 72, -8);
  const sc = sun.shadow.camera;
  sc.left = -95; sc.right = 95; sc.top = 100; sc.bottom = -100; sc.near = 10; sc.far = 320;
  sc.updateProjectionMatrix();
  world.setShadow(st.quality.shadow);   // (a phone a lighter shadow map; the Mac the sharp one)
}
const mats = castleMaterials(renderer);
const samples = [sampleDaily(rand, 16), sampleDaily(rand, 12), sampleDaily(rand, 11), sampleDaily(rand, 13), sampleDaily(rand, 10)];
// your own castle: your own Daily Towers (as in the planner), else the starter castle
const real = MINE ? myDays() : [];
const r0 = rng(seed);   // (the same foundations as the planner shows)
const days0 = real.length ? [...real, ...Array.from({ length: Math.max(0, 5 - real.length) }, () => sampleDaily(r0, 2))].slice(0, 5) : samples;
const keepDay = MINE?.plan?.keep ?? 0;
const days = [days0[keepDay], ...days0.filter((_, i) => i !== keepDay)];
const castle = buildCastle({ at: new THREE.Vector3(0, 0, -DIST), days, team: 'red', mats, rand, half: HALF });
scene.add(castle.group);
scene.updateMatrixWorld(true);
const GATE_Z = -DIST + HALF;   // the gate's line
const KEEP = castle.group.localToWorld(castle.keep.pos.clone());

// ------------------------------------------------------------------------------------------------------ physics
const phys = createPhysics({ gravity: -G_ACC });
const blocks = [];
const rayTargets = [];
const towerParts = [];
let totalVol = 0;
castle.towers.forEach((t, ti) => {
  const meshes = t.group.children.filter((o) => o.userData.block);
  const merlons = t.group.children.filter((o) => o.userData.merlon);
  const part = { meshes: [...meshes, ...merlons], links: [] };
  towerParts.push(part);
  let top = null;
  for (const m of meshes) {
    scene.attach(m);
    const link = phys.addBlock(m, m.userData.block, m.userData.S, m.userData.D);
    link.tower = ti;
    blocks.push(link);
    part.links.push(link);
    rayTargets.push(m);
    totalVol += link.vol;
    if (!top || link.home.y > top.home.y) top = link;
  }
  for (const m of merlons) { scene.attach(m); part.links.push(phys.addPiece(m, ...m.userData.merlon)); }
  if (t.flag && top) top.mesh.attach(t.flag);
  t.topLink = top;
});
const keepTop = castle.towers[0].topLink;
let thudAt = 0;
function onBlockHit(e) {
  const v = Math.abs(e.contact?.getImpactVelocityAlongNormal?.() || 0);
  if (v < 5.5) return;
  const b = e.target;
  const p = new THREE.Vector3(b.position.x, Math.max(0.3, b.position.y - 0.8), b.position.z);
  fx.dust(p, { n: v > 10 ? 6 : 3, size: v > 10 ? 3 : 2, up: 1.2, spread: 2.5, life: 2.2 });
  if (v > 9 && G.t - thudAt > 0.18) { thudAt = G.t; sfx('land'); if (G.mode !== 'aim') st.shake(Math.min(0.35, v * 0.02)); }
}
for (const l of phys.links) l.body.addEventListener('collide', onBlockHit);
const doors = [];
const doorStatics = [];
castle.group.traverse((o) => {
  if (o.userData.wall) {
    const [w, H, T] = o.userData.wall;
    const p = new THREE.Vector3();
    o.getWorldPosition(p);
    const e = new THREE.Euler().setFromQuaternion(o.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
    phys.addStatic(p.x, p.y + H / 2, p.z, w / 2, H / 2, T / 2, e.y);
    rayTargets.push(o);
  }
  if (o.userData.door) doors.push(o);
});
for (const d of doors) {
  const p = d.getWorldPosition(new THREE.Vector3());
  doorStatics.push(phys.addStatic(p.x, p.y + 3.7, p.z, 1.25, 3.7, 0.16, 0));
  rayTargets.push(d);
}
// (phones: what stands still is drawn as a few welded pieces — the walls and gatehouse always, each tower until it's hit)
const within = (o, test) => { for (let a = o; a; a = a.parent) if (test(a)) return true; return false; };
const portcullis = castle.gate.userData.portcullis;
weldStill(castle.group, scene, (m) => !within(m, (a) => a.userData.door || a.userData.wave || a.userData.flame || a === portcullis));
const welds = towerWelds(scene, towerParts);

// ------------------------------------------------------------------------------------------------- soldiers, fx
const crowd = createCrowd(scene, groundHeight, { capacity: 36, looks: st.quality.looks });
const fx = createFx(scene);
// their defence, as planned (Robot Rikus's own way, or your saved plan)
const plan = MINE?.plan || defaultPlan(castle);
const defenders = [];
const guards = [];
const ballistas = [];
const spikeRows = [];
let oil = null;
const relTo = (link, w) => new THREE.Vector3(w.x - link.body.position.x, w.y - link.body.position.y, w.z - link.body.position.z);
for (const s of spotIds(castle)) {
  const kind = plan.place[s.id];
  if (!kind) continue;
  const w = castle.group.localToWorld(s.p.clone());
  if (kind === 'boog' || kind === 'spies' || kind === 'ridder') {
    if (s.kind === 'gate') { guards.push(crowd.add(kind, 'red', w.x, w.z, { heading: 0, role: 'guard' })); continue; }
    const link = s.kind === 'top' ? castle.towers[s.tower]?.topLink : null;
    const m = crowd.add(kind, 'red', w.x, w.z, { y: w.y, heading: 0, role: link ? 'tower' : 'wall', link, cool: 1 + rand() * 2 });
    if (!m) continue;
    if (link) m.rel = relTo(link, w);
    defenders.push(m);
  } else if (kind === 'olie') {
    const c = cauldron(mats);
    c.position.copy(w);
    scene.add(c);
    oil = { obj: c, cool: 3, pours: 0 };
  } else if (kind === 'ballista') {
    const link = castle.towers[s.tower]?.topLink;
    const b = makeBallista(mats, 'red');
    b.position.copy(w);
    scene.add(b);
    ballistas.push({ obj: b, link, rel: link ? relTo(link, w) : null, cool: 3 + rand() * 2, alive: true });
  } else if (kind === 'pieke') {
    const sp = makeSpikes(mats);
    sp.position.set(w.x, groundHeight(w.x, w.z), w.z);
    scene.add(sp);
    spikeRows.push({ obj: sp, x: w.x, z: w.z, hit: new Set() });
  }
}
const blue = [];

// the trebuchet, cocked
const TREB = new THREE.Vector3(8, groundHeight(8, -4), -4);
const treb = trebuchet(mats, 'blue', { arm: 0.85 });
treb.position.copy(TREB);
scene.add(treb);
const TU = treb.userData;
// (its beams welded: the frame as a few pieces; the arm and the counterweight each as a few, still turning)
{
  const under = (o, g) => { for (let a = o; a; a = a.parent) if (a === g) return true; return false; };
  weldInto(TU.cw, () => true);
  weldInto(TU.pivot, (m) => !under(m, TU.cw));
  weldInto(treb, (m) => !under(m, TU.pivot) && !TU.ropes.includes(m) && m !== TU.stone);
}
const X_AXIS = new THREE.Vector3(1, 0, 0);
const tipAt = (arm) => treb.localToWorld(new THREE.Vector3(0, 0, TU.long).applyAxisAngle(X_AXIS, arm).add(new THREE.Vector3(0, TU.axleY, 0)));
function setArm(a) {
  TU.pivot.rotation.x = a;
  TU.cw.rotation.x = -a;
}

// the deploy zone: where your troops may be sent (shown while a troop card is chosen)
const ZONE = { z0: -98, z1: 8, x: 40 };
const zone = new THREE.Mesh(new THREE.PlaneGeometry(ZONE.x * 2, ZONE.z1 - ZONE.z0), new THREE.MeshBasicMaterial({ color: '#4aa3ff', transparent: true, opacity: 0.1, depthWrite: false }));
zone.rotation.x = -Math.PI / 2;
zone.position.set(0, 0.25, (ZONE.z0 + ZONE.z1) / 2);
zone.visible = false;
const edge = new THREE.Mesh(new THREE.PlaneGeometry(ZONE.x * 2, 0.6), new THREE.MeshBasicMaterial({ color: '#8fc5ff', transparent: true, opacity: 0.55, depthWrite: false }));
edge.rotation.x = -Math.PI / 2;
edge.position.set(0, 0.3, ZONE.z0);
edge.visible = false;
scene.add(zone, edge);

// ---------------------------------------------------------------------------------------------------- the state
const G = {
  mode: 'scout', t: 0, clock: 180, timeScale: 1, slowTo: 1, hitStop: 0,
  cards: { swaard: 12, spies: 8, boog: 10, ridder: 4, ram: 1, treb: 5 }, sel: null,
  wind: Math.round((rand() * 2 - 1) * 26) / 10,
  gateHP: 100, gateBroken: false, stars: { gate: false, half: false, flag: false }, destroyed: 0, lost: 0,
  arm: 0.85, trebState: 'ready', trebT: 0,
  yaw: 0, pitch: 0.05, power: 0, winding: false, windPh: 0,
  stone: null, flightT: 0, impact: null, impactT: 0, ram: null, flagT: 0, ended: false,
};
const YAW0 = Math.atan2(KEEP.x - TREB.x, -(KEEP.z - TREB.z));
const sfx = (n, o) => { try { audio.play(n, o); } catch { /* sound off */ } };
const buzz = (k) => { try { haptics[k]?.(); } catch { /* no haptics */ } };
const starCount = () => Object.values(G.stars).filter(Boolean).length;

// ------------------------------------------------------------------------------------------------------ the screen
const hudEl = document.getElementById('k-hud');
let hud = null;
scoutScreen(hudEl, { name: OPP, title: TITLE, mineLink: true, towers: castle.towers.length, perfects: days.flat().filter((b) => b.rating === 'P').length, defenders: Object.keys(plan.place).length, goals: T.goals, coins: MINE ? null : 130, trophies: 30 }, () => startSiege());

function startSiege() {
  try { audio.unlock(); } catch { /* */ }
  sfx('click');
  G.mode = 'intro';
  G.introT = 0;
  hud = createSiegeHud(hudEl, { name: OPP, wind: G.wind }, {
    card: (k) => pickCard(k),
    goDown: () => { if (G.mode === 'aim' && G.trebState === 'ready' && !G.ended) { G.winding = true; G.windPh = 0; sfx('creak'); } },
    goUp: () => { if (G.winding) { G.winding = false; fire(G.power); } },
    back: () => leaveAim(),
    again: () => location.reload(),
    done: () => { location.href = `${location.pathname}?plan`; },
    pause: () => pause(),
    resume: () => { G.pauseCard = false; hud.paused(false); G.paused = G.helpOpen; },
    quit: () => { G.pauseCard = false; hud.paused(false); G.paused = false; if (!G.ended) endSiege(); },
    share: (r) => brag(r),
  });
  hud.cards(G.cards, G.sel, true);
  hud.hint(T.pickHint);
}

function pause() {
  if (G.ended || G.pauseCard || !['battle', 'aim', 'flight'].includes(G.mode)) return;
  G.pauseCard = true;
  G.paused = true;
  G.winding = false;
  hud.paused(true);
}
// (the phone locked, a call, another app: the battle waits on the pause card)
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
/** A first-time tip (once per player, when `when()` still holds after `ms`): the battle waits while it is read. */
function tip(k, text, ms = 0, when = () => true) {
  if (helpSeen(k)) return;
  setTimeout(() => {
    if (G.ended || G.helpOpen || helpSeen(k) || !when()) return;
    markHelp(k);
    G.helpOpen = true;
    G.paused = true;
    G.winding = false;
    hud.help(text).then(() => { G.helpOpen = false; G.paused = G.pauseCard; });
  }, ms);
}
/** "SPOG": a win to WhatsApp (the phone's own share sheet when it has one). */
function brag(r) {
  const site = `${location.origin}${location.pathname.replace(/kasteel\.html$/, '')}`;
  const text = `${T.brag(r.destroyed, r.stars, NAME_IN)} ${site}`;
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
function pickCard(k) {
  if (G.mode !== 'battle' || G.ended) return;
  sfx('click');
  if (k === 'treb') {
    if (G.trebState !== 'ready' || G.cards.treb <= 0) return;
    G.sel = null;
    enterAim();
  } else if (G.cards[k] > 0) {
    G.sel = G.sel === k ? null : k;
  }
  zone.visible = edge.visible = !!G.sel;
  hud.cards(G.cards, G.sel, G.trebState === 'ready');
  hud.hint(G.sel ? T.fieldHint : '');
}

// ------------------------------------------------------------------------------------------------------ deploying
const SQUAD = { swaard: 4, spies: 4, boog: 5, ridder: 2 };
const SPEED = { swaard: 4.8, spies: 4.4, boog: 4.0, ridder: 6.6 };
function deploy(kind, x, z) {
  if (G.cards[kind] <= 0) return false;
  x = Math.max(-ZONE.x, Math.min(ZONE.x, x));
  z = Math.max(ZONE.z0, Math.min(ZONE.z1, z));
  if (kind === 'ram') {
    if (G.ram) return false;
    const r = makeRam(mats, 'blue');
    r.position.set(Math.max(-6, Math.min(6, x)), groundHeight(x, z), z);
    scene.add(r);
    const pushers = [[-1.7, 1.2], [1.7, 1.2], [-1.7, 3.2], [1.7, 3.2]].map(([dx, dz]) => {
      const m = crowd.add('swaard', 'blue', r.position.x + dx, z + dz, { pusher: true, dx, dz });
      if (m) { m.state = 'walk'; blue.push(m); }
      return m;
    }).filter(Boolean);
    weldInto(r, (m) => { for (let a = m; a; a = a.parent) if (a === r.userData.log) return false; return true; });
    G.ram = { obj: r, hp: 150, pushers, hitT: 0, log: r.userData.log };
    G.cards.ram -= 1;
  } else {
    const n = Math.min(SQUAD[kind], G.cards[kind]);
    for (let i = 0; i < n; i++) {
      const m = crowd.add(kind, 'blue', x + ((i % 2) - 0.5) * 1.5 + (rand() - 0.5) * 0.4, z + Math.floor(i / 2) * 1.5 + (rand() - 0.5) * 0.4, { cool: rand() * 1.5, slot: (rand() - 0.5) * 5, hp: HP[kind] });
      if (m) { m.state = 'walk'; blue.push(m); }
    }
    G.cards[kind] -= n;
  }
  fx.dust(new THREE.Vector3(x, 0.4, z), { n: 6, size: 2.2, up: 1, spread: 3, life: 1.6, color: '#c9ad82' });
  sfx('drop');
  buzz('tap');
  if (G.cards[kind] <= 0) { G.sel = null; zone.visible = edge.visible = false; hud.hint(''); }
  tip('treb', T.help2, 2500, () => G.mode === 'battle' && G.trebState === 'ready' && G.cards.treb > 0);
  hud.cards(G.cards, G.sel, G.trebState === 'ready');
  return true;
}

// ---------------------------------------------------------------------------------------------- the trebuchet
const AIM_EYE = new THREE.Vector3(TREB.x, TREB.y + 9.8, TREB.z + 3.6);   // (right over the throwing line: the cross shows where it flies)
function enterAim() {
  G.mode = 'aim';
  G.yaw = YAW0 + (rand() - 0.5) * 0.1;
  G.pitch = 0.05;
  G.power = 0;
  hud.aim(true);
  hud.power(0, false);
  hud.hint('');
  tip('aim', T.help3, 700, () => G.mode === 'aim');
  zone.visible = edge.visible = false;
}
function leaveAim() {
  if (G.mode !== 'aim') return;
  G.winding = false;
  G.mode = 'battle';
  hud.aim(false);
}
/** The launch speed that carries a stone `R` metres (to ground level) from height `h` at elevation `e`. */
function speedFor(R, h, e = 0.7) {
  let lo = 5;
  let hi = 160;
  for (let i = 0; i < 40; i++) {
    const v = (lo + hi) / 2;
    const vy = v * Math.sin(e);
    const T = (vy + Math.sqrt(vy * vy + 2 * G_ACC * h)) / G_ACC;
    if (v * Math.cos(e) * T < R) lo = v; else hi = v;
  }
  return (lo + hi) / 2;
}
function fire(range) {
  if (G.mode !== 'aim' || G.trebState !== 'ready' || !range) return;
  G.trebState = 'firing';
  G.trebT = 0;
  G.fireRange = range;
  G.fireYaw = G.yaw;
  G.cards.treb -= 1;
  TU.ropes.forEach((r) => { r.visible = false; });
  hud.aim(false);
  hud.cards(G.cards, null, false);
  sfx('drop');
  buzz('heavy');
}
function release() {
  const arm = TU.pivot.rotation.x;
  const p = tipAt(arm);
  const dir = new THREE.Vector3(Math.sin(G.fireYaw), 0, -Math.cos(G.fireYaw));
  const R = G.fireRange - new THREE.Vector3(p.x - TREB.x, 0, p.z - TREB.z).dot(dir);   // (the range counts from the trebuchet's foot)
  const e = ELEV;
  const v = speedFor(R, p.y, e);
  const vel = dir.multiplyScalar(v * Math.cos(e)).add(new THREE.Vector3(0, v * Math.sin(e), 0));
  TU.stone.visible = false;
  const mesh = shot(0.62);
  scene.add(mesh);
  G.stone = phys.addStone(mesh, 0.62, p, vel);
  G.stone.body.addEventListener('collide', onStoneHit);
  G.flightT = 0;
  G.impact = null;
  G.mode = 'flight';
}
function onStoneHit(e) {
  if (G.impact) return;
  const b = G.stone.body;
  const at = new THREE.Vector3(b.position.x, b.position.y, b.position.z);
  const hitCastle = !!e.body.link || e.body.mass === 0 && at.y > 0.8;
  G.impact = { at, hitCastle, t: 0 };
  window.__siege && (window.__siege.lastHit = { at: [at.x, at.y, at.z].map((v) => Math.round(v * 10) / 10), what: e.body.link?.block?.shape || (e.body.mass === 0 ? (at.y > 0.8 ? 'wall' : 'ground') : 'piece') });
  G.hitStop = hitCastle ? 0.08 : 0;
  const dir = new THREE.Vector3(b.velocity.x, 0, b.velocity.z).normalize();
  if (hitCastle) {
    fx.dust(at, { n: 18, size: 3.6, up: 3, spread: 5, life: 2.8 });
    fx.chips(at, dir, 26, 10);
    st.shake(0.9);
    sfx('thunder');
    buzz('heavy');
    // the gate takes a stone badly
    if (!G.gateBroken && Math.abs(at.x) < 5 && Math.abs(at.z - GATE_Z) < 4 && at.y < 9) damageGate(45);
    // archers near the hit are thrown off
    for (const d of defenders) {
      if (d.alive && Math.hypot(d.x - at.x, d.y - at.y, d.z - at.z) < 3.4) kill(d, true);
    }
  } else {
    fx.dust(at, { n: 8, size: 2.6, up: 1.5, spread: 3, life: 2, color: '#c4a57a' });
    sfx('land');
  }
}

// ------------------------------------------------------------------------------------------------- the fighting
function kill(m, fall = false) {
  if (!m.alive) return;
  m.alive = false;
  if (m.team === 'blue') G.lost += 1;
  if (fall && m.y != null && m.y > 1) {
    m.state = 'fall';
    m.vy = 3 + rand() * 2;
    m.vx = (rand() - 0.5) * 4;
    m.vz = 2 + rand() * 3;
    m.spin = (rand() < 0.5 ? -1 : 1) * (4 + rand() * 4);
  } else {
    m.state = 'dead';
    m.diedAt = G.t;
  }
}
function damageGate(n) {
  if (G.gateBroken) return;
  G.gateHP -= n;
  fx.dust(new THREE.Vector3(0, 2.5, GATE_Z + 2.2), { n: 5, size: 2, up: 1, spread: 3, life: 1.4 });
  if (G.gateHP > 0) return;
  G.gateBroken = true;
  for (const s of doorStatics) phys.world.removeBody(s);
  doors.forEach((d, i) => {
    scene.attach(d);
    const link = phys.addPiece(d, ...d.userData.door, 0.8);
    link.body.wakeUp();
    link.body.applyImpulse(new phys.CANNON.Vec3((i ? 1 : -1) * 900, 600, -5200), new phys.CANNON.Vec3(0, 2, 0));
  });
  castle.gate.userData.portcullis.visible = false;
  fx.dust(new THREE.Vector3(0, 3, GATE_Z + 1), { n: 16, size: 3.2, up: 2.5, spread: 5, life: 2.6 });
  st.shake(0.6);
  star('gate', T.gate);
}
function star(k, text) {
  if (G.stars[k]) return;
  G.stars[k] = true;
  hud?.stars(starCount());
  hud?.toast(`★ ${text}`);
  sfx('banner');
  buzz('perfect');
}
const chest = (m) => new THREE.Vector3(m.x, (m.y ?? groundHeight(m.x, m.z)) + 1.3, m.z);
function nearest(list, from, max) {
  let best = null;
  let bd = max;
  for (const m of list) {
    if (!m.alive) continue;
    const d = Math.hypot(m.x - from.x, m.z - from.z);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
function face(m, x, z) { m.heading = Math.atan2(x - m.x, z - m.z); }
function moveTo(m, x, z, speed, dt) {
  const dx = x - m.x;
  const dz = z - m.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return d;
  const step = Math.min(d, speed * dt);
  m.x += (dx / d) * step;
  m.z += (dz / d) * step;
  m.heading = Math.atan2(dx, dz);
  return d;
}
const HIT = { swaard: 0.24, spies: 0.26, boog: 0.34, ridder: 0.16 };
const HP = { swaard: 2, spies: 2, boog: 1, ridder: 3 };
function think(dt) {
  const standZ = GATE_Z + 44;
  for (const m of blue) {
    if (!m.alive || m.pusher) continue;
    if (m.kind === 'boog') {
      if (m.z > standZ + 0.4) { moveTo(m, m.x * 0.996, standZ, SPEED.boog, dt); m.state = 'walk'; continue; }
      const t = nearest(defenders, m, 95);
      if (!t) { m.state = 'idle'; continue; }
      m.state = 'shoot';
      face(m, t.x, t.z);
      m.cool -= dt;
      if (m.cool <= 0) {
        m.cool = 1.8 + rand() * 0.7;
        m.shotAt = G.t;
        const hit = rand() < 0.42;
        fx.arrow(chest(m), chest(t), () => { if (hit) kill(t, t.role === 'tower'); });
      }
      continue;
    }
    // swords, spears and knights: to the gate, then in to the keep
    let tx;
    let tz;
    if (!G.gateBroken) {
      tx = Math.max(-3.4, Math.min(3.4, m.slot));
      tz = GATE_Z + 3.2 + Math.abs(m.slot) * 0.25;
    } else if (m.z > GATE_Z - 1.5) {
      tx = Math.max(-1.8, Math.min(1.8, m.slot * 0.4));
      tz = GATE_Z - 4;
    } else {
      tx = KEEP.x + m.slot * 0.6;
      tz = KEEP.z + 4.5;
    }
    const foe = G.gateBroken ? nearest(guards, m, 2.4) : null;
    if (foe) {
      m.state = 'attack';
      face(m, foe.x, foe.z);
      m.duel = (m.duel || 0) + dt;
      if (m.duel > 1.2) { m.duel = 0; if (rand() < (m.kind === 'ridder' ? 0.62 : 0.5)) kill(foe); else kill(m); }
      continue;
    }
    const slow = spikeRows.some((row) => Math.abs(m.x - row.x) < 4.5 && Math.abs(m.z - row.z) < 3) ? 0.55 : 1;
    const d = moveTo(m, tx, tz, SPEED[m.kind] * slow, dt);
    if (d < 0.9) {
      m.state = G.gateBroken ? 'idle' : 'attack';
      if (!G.gateBroken) { face(m, m.x, GATE_Z); damageGate(dt * (m.kind === 'ridder' ? 0.9 : 0.6)); }
    } else m.state = m.kind === 'ridder' ? 'run' : 'walk';
  }
  // keep them from standing in each other
  for (let i = 0; i < blue.length; i++) {
    const a = blue[i];
    if (!a.alive || a.pusher) continue;
    for (let j = i + 1; j < blue.length; j++) {
      const b = blue[j];
      if (!b.alive || b.pusher) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.0001 && d2 < 0.81) {
        const d = Math.sqrt(d2);
        const push = (0.9 - d) * 0.5;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push;
        b.x += (dx / d) * push; b.z += (dz / d) * push;
      }
    }
  }
  // the guards come out when the gate falls
  if (G.gateBroken) for (const g of guards) if (g.alive && g.z < GATE_Z + 1) { moveTo(g, g.x, GATE_Z + 1.2, 3, dt); g.state = 'walk'; } else if (g.alive) g.state = 'idle';
  // their archers
  const targets = blue.filter((m) => m.alive);
  for (const d of defenders) {
    if (!d.alive) continue;
    if (d.role === 'tower' && d.link) {
      const b = d.link.body;
      const off = phys.displaced(d.link);
      if (off.d > 0.7 || off.ang > 22) { kill(d, true); continue; }
      d.x = b.position.x + d.rel.x;
      d.y = b.position.y + d.rel.y;
      d.z = b.position.z + d.rel.z;
    }
    const reach = d.kind === 'spies' ? 44 : 66;
    let t = G.ram && G.ram.hp > 0 && Math.hypot(G.ram.obj.position.x - d.x, G.ram.obj.position.z - d.z) < Math.min(40, reach) ? G.ram : null;
    if (!t) t = nearest(targets, d, reach);
    d.cool -= dt;
    if (!t) { d.state = 'idle'; continue; }
    const tx = t.obj ? t.obj.position.x : t.x;
    const tz = t.obj ? t.obj.position.z : t.z;
    face(d, tx, tz);
    d.state = 'shoot';
    if (d.cool <= 0) {
      d.cool = 3.2 + rand() * 1.2;
      d.shotAt = G.t;
      if (t.obj) {
        fx.arrow(chest(d), new THREE.Vector3(tx, 2.6, tz), () => { if (G.ram === t) t.hp -= 3; });
      } else {
        const hit = rand() < HIT[t.kind] + (d.kind === 'spies' ? 0.1 : 0);
        fx.arrow(chest(d), chest(t), () => { if (hit && t.alive && --t.hp <= 0) kill(t); });
      }
    }
  }
  // boiling oil over the gate: on whoever is at the gate (the ram too), now and then
  if (oil) {
    oil.cool -= dt;
    const atGate = blue.filter((m) => m.alive && !G.gateBroken && Math.abs(m.x) < 5 && Math.abs(m.z - (GATE_Z + 3)) < 3.5);
    const ramAt = G.ram && G.ram.hp > 0 && G.ram.obj.position.z < GATE_Z + 8;
    if (oil.cool <= 0 && (atGate.length || ramAt)) {
      oil.cool = 12;
      oil.pours += 1;
      const pot = oil.obj.userData.pot;
      pot.rotation.x = 0.9;
      setTimeout(() => { pot.rotation.x = 0; }, 900);
      fx.dust(new THREE.Vector3(0, 5, GATE_Z + 2.6), { n: 14, size: 2.6, up: -1.5, spread: 4, life: 1.8, color: '#e0a04a' });
      fx.dust(new THREE.Vector3(0, 1, GATE_Z + 3.2), { n: 10, size: 3, up: 2.2, spread: 5, life: 2.4, color: '#d8d0c4' });
      sfx('splash');
      for (const m of atGate) if (rand() < 0.55) kill(m);
      if (ramAt) G.ram.hp -= 45;
    }
  }
  // ballistas on the tower tops: the ram first, else the nearest soldier
  for (const b of ballistas) {
    if (!b.alive) continue;
    if (b.link) {
      const off = phys.displaced(b.link);
      if (off.d > 0.7 || off.ang > 22) { b.alive = false; fx.dust(b.obj.position.clone(), { n: 8, size: 2.4, up: 1, spread: 3, life: 2 }); b.obj.visible = false; continue; }
      b.obj.position.set(b.link.body.position.x + b.rel.x, b.link.body.position.y + b.rel.y, b.link.body.position.z + b.rel.z);
    }
    b.cool -= dt;
    const p = b.obj.position;
    let t = G.ram && G.ram.hp > 0 && Math.hypot(G.ram.obj.position.x - p.x, G.ram.obj.position.z - p.z) < 100 ? G.ram : null;
    if (!t) t = nearest(blue, p, 90);
    if (!t) continue;
    const tx = t.obj ? t.obj.position.x : t.x;
    const tz = t.obj ? t.obj.position.z : t.z;
    b.obj.userData.head.rotation.y = Math.atan2(tx - p.x, tz - p.z);
    if (b.cool <= 0) {
      b.cool = 5.5 + rand();
      const from = p.clone().add(new THREE.Vector3(0, 1.3, 0));
      sfx('creak');
      if (t.obj) fx.arrow(from, new THREE.Vector3(tx, 2.2, tz), () => { if (G.ram === t) { t.hp -= 30; fx.chips(new THREE.Vector3(tx, 2, tz), new THREE.Vector3(0, 0, 1), 6, 5); } });
      else fx.arrow(from, chest(t), () => { if (t.alive && rand() < 0.85) kill(t); });
    }
  }
  // spikes before the gate: a man who runs into them may fall, and all are slowed near them
  for (const row of spikeRows) {
    for (const m of blue) {
      if (!m.alive || m.pusher || row.hit.has(m)) continue;
      if (Math.abs(m.x - row.x) < 3.3 && Math.abs(m.z - row.z) < 1.4) {
        row.hit.add(m);
        if (rand() < 0.45) kill(m);
      }
    }
  }
  // the ram
  const r = G.ram;
  if (r && r.hp > 0) {
    const o = r.obj;
    const stopZ = GATE_Z + 6.2;
    if (o.position.z > stopZ + 0.05) {
      o.position.z = Math.max(stopZ, o.position.z - 2.4 * dt);
      o.position.x += (0 - o.position.x) * Math.min(1, dt * 0.6);
      o.position.y = groundHeight(o.position.x, o.position.z);
      r.pushers.forEach((m) => { if (m.alive) { m.x = o.position.x + m.dx; m.z = o.position.z + m.dz; m.heading = Math.PI; m.state = 'walk'; } });
    } else if (!G.gateBroken) {
      r.hitT += dt;
      const k = (r.hitT % 2.2) / 2.2;
      if (r.log) r.log.position.z = -0.6 - Math.sin(Math.min(1, k * 1.4) * Math.PI) * 1.4;
      if (r.hitT >= 2.2) { r.hitT = 0; damageGate(16); sfx('land'); st.shake(0.25); }
      r.pushers.forEach((m) => { if (m.alive) m.state = 'attack'; });
    } else r.pushers.forEach((m) => { if (m.alive) m.state = 'idle'; });
    if (r.hp <= 0) {
      fx.dust(o.position.clone().add(new THREE.Vector3(0, 1.5, 0)), { n: 12, size: 3, up: 2, spread: 4, life: 2.4, color: '#6b5a48' });
      o.rotation.z = 0.25;
      r.pushers.forEach((m) => kill(m));
    }
  }
  // the flag: down when the keep's top falls, or when your men hold the keep's foot
  if (!G.stars.flag && keepTop) {
    const off = phys.displaced(keepTop);
    if (off.d > 2 || off.ang > 35) star('flag', T.flag);
    const atKeep = blue.filter((m) => m.alive && !m.pusher && m.kind !== 'boog' && Math.hypot(m.x - KEEP.x, m.z - KEEP.z - 4.5) < 4).length;
    G.flagT = atKeep >= 3 ? G.flagT + dt : Math.max(0, G.flagT - dt);
    if (G.flagT > 4) star('flag', T.flag);
  }
}

// --------------------------------------------------------------------------------------------- how much is down
let measureT = 0;
function measure(dt) {
  measureT += dt;
  if (measureT < 0.25) return;
  measureT = 0;
  let down = 0;
  for (const l of blocks) {
    const o = phys.displaced(l);
    if (o.d > 1.0 || o.ang > 25) down += l.vol;
  }
  G.destroyed = Math.min(100, Math.round((100 * down) / totalVol));
  hud?.damage(G.destroyed);
  if (G.destroyed >= 50) star('half', T.half);
}

// ----------------------------------------------------------------------------------------------------- the camera
const camPos = new THREE.Vector3(-58, 36, -84);
const camLook = new THREE.Vector3(0, 8, -DIST);
const wantPos = new THREE.Vector3();
const wantLook = new THREE.Vector3();
let fov = 48;
function battleView() {
  let lead = Infinity;
  for (const m of blue) if (m.alive) lead = Math.min(lead, m.z);
  if (G.ram && G.ram.hp > 0) lead = Math.min(lead, G.ram.obj.position.z);
  const front = Math.max(-118, Math.min(-40, lead === Infinity ? -48 : lead + 20));
  wantPos.set(14, 27, front + 60);
  wantLook.set(-1, 2, front - 40);
  return 48;
}
function cameraTick(rdt) {
  let want = 48;
  let k = 3;
  if (G.mode === 'scout' || G.mode === 'end') {
    const a = -0.65 + Math.sin(G.t * 0.05) * 0.25 + (G.mode === 'end' ? G.t * 0.03 : 0);
    wantPos.set(Math.sin(a) * 74, 34, -DIST + Math.cos(a) * 74);
    wantLook.set(0, 8, -DIST - 2);
    want = 50;
    k = 1.2;
  } else if (G.mode === 'intro') {
    want = battleView();
    k = 1.6;
  } else if (G.mode === 'battle') {
    want = battleView();
    k = 2.2;
  } else if (G.mode === 'aim' || (G.mode === 'flight' && G.flightT < 0.25)) {
    const dir = new THREE.Vector3(Math.sin(G.yaw) * Math.cos(G.pitch), Math.sin(G.pitch), -Math.cos(G.yaw) * Math.cos(G.pitch));
    wantPos.copy(AIM_EYE);
    wantLook.copy(AIM_EYE).addScaledVector(dir, 100);
    want = 11;
    k = 6;
  } else if (G.mode === 'flight' && G.stone) {
    const b = G.stone.body;
    const p = new THREE.Vector3(b.position.x, b.position.y, b.position.z);
    const v = new THREE.Vector3(b.velocity.x, b.velocity.y, b.velocity.z);
    const flat = new THREE.Vector3(v.x, 0, v.z).normalize();
    if (G.impact) {
      // (watch the hit from out in front of the walls, never from inside a tower)
      const at = G.impact.at;
      wantPos.set(at.x + 14, Math.max(at.y + 12, 19), Math.max(at.z + 42, GATE_Z + 34));
      wantLook.set(at.x, Math.max(2, at.y - 2), at.z);
      want = 44;
      k = 2.5;
    } else {
      wantPos.copy(p).addScaledVector(flat, -11).add(new THREE.Vector3(2.5, 3.2, 0));
      wantLook.copy(p).addScaledVector(flat, 18).add(new THREE.Vector3(0, -2, 0));
      want = 52;
      k = 9;
    }
  }
  const f = 1 - Math.exp(-rdt * k);
  camPos.lerp(wantPos, f);
  camLook.lerp(wantLook, f);
  fov += (want - fov) * (1 - Math.exp(-rdt * (G.mode === 'aim' ? 8 : 3)));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ------------------------------------------------------------------------------------------------------- touch
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let drag = null;
canvasEvents(document.getElementById('k-canvas'));
function canvasEvents(cv) {
  const toNdc = (e) => {
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  cv.addEventListener('pointerdown', (e) => {
    try { audio.unlock(); } catch { /* */ }
    if (G.mode === 'aim') { drag = { x: e.clientX, y: e.clientY }; return; }
    if (G.mode !== 'battle' || !G.sel) return;
    toNdc(e);
    ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, p)) return;
    if (p.z < ZONE.z0 - 6 || p.z > ZONE.z1 + 6 || Math.abs(p.x) > ZONE.x + 6) { hud.toast(T.fromField); return; }
    deploy(G.sel, p.x, p.z);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || G.mode !== 'aim') return;
    const r = cv.getBoundingClientRect();
    const k = (fov / 48) * 1.6;
    G.yaw += ((e.clientX - drag.x) / r.width) * k;
    G.pitch -= ((e.clientY - drag.y) / r.height) * k;
    G.yaw = Math.max(YAW0 - 0.28, Math.min(YAW0 + 0.28, G.yaw));
    G.pitch = Math.max(-0.08, Math.min(0.3, G.pitch));
    drag = { x: e.clientX, y: e.clientY };
  });
  const up = () => { drag = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
}
/**
 * The rangefinder: what the cross rests on, and the pull (the ground range) whose arc comes down exactly there — put
 * the cross on a tower's top, pull to the mark, and the stone lands on the top.
 */
const ELEV = 0.72;
function rangefind() {
  ray.setFromCamera(ndc.set(0, 0), camera);
  const hit = ray.intersectObjects(rayTargets, false)[0];
  G.cross = hit ? hit.point.clone() : null;
  // (the last reading stays a moment: read the range on the target, then hold off for the wind)
  if (!hit) return G.lastRange && performance.now() - G.lastRange.at < 2000 ? G.lastRange.R : null;
  const tip = tipAt(-1.45);
  const dir = new THREE.Vector3(Math.sin(G.yaw), 0, -Math.cos(G.yaw));
  const d = new THREE.Vector3(hit.point.x - tip.x, 0, hit.point.z - tip.z).dot(dir);
  const dh = tip.y - hit.point.y;
  const c = Math.cos(ELEV);
  const den = 2 * c * c * (dh + d * Math.tan(ELEV));
  if (d <= 0 || den <= 0) return null;
  const v2 = (G_ACC * d * d) / den;
  const vy = Math.sqrt(v2) * Math.sin(ELEV);
  const T = (vy + Math.sqrt(vy * vy + 2 * G_ACC * tip.y)) / G_ACC;
  const R = Math.sqrt(v2) * c * T + new THREE.Vector3(tip.x - TREB.x, 0, tip.z - TREB.z).dot(dir);
  G.lastRange = { R, at: performance.now() };
  return R;
}

// ----------------------------------------------------------------------------------------------------- the loop
const wavers = [];
scene.traverse((o) => { if (o.userData.wave) wavers.push(o); });
let last = performance.now();
let hudT = 0;
function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.hitStop > 0) G.hitStop -= rdt;
  G.timeScale += ((G.hitStop > 0 ? 0 : G.slowTo) - G.timeScale) * (G.hitStop > 0 ? 1 : 1 - Math.exp(-rdt * 10));
  const dt = G.paused ? 0 : rdt * G.timeScale;
  G.t += dt;
  if (G.mode === 'intro') {
    G.introT += rdt;
    if (G.introT > 2.2) { G.mode = 'battle'; tip('deploy', T.help1); }
  }
  if (['battle', 'aim', 'flight'].includes(G.mode)) {
    G.clock -= dt;
    if (G.clock <= 30 && !G.warned) { G.warned = true; sfx('warning'); hud.toast(T.thirty); }
  }
  // the trebuchet: winding, the throw, the reload
  if (G.winding && !G.paused) {
    G.windPh += rdt * (Math.PI / 1.25);
    G.power = 90 + 120 * (0.5 - 0.5 * Math.cos(G.windPh));
    G.arm = 0.85 + 0.25 * (0.5 - 0.5 * Math.cos(G.windPh));
    setArm(G.arm);
  }
  if (G.trebState === 'firing') {
    G.trebT += dt;
    const k = Math.min(1, G.trebT / 0.55);
    const a = 0.85 - (0.85 + 2.0) * k * k;
    setArm(a);
    if (!G.stone && a < -1.45) release();
    if (k >= 1) { G.trebState = 'reload'; G.trebT = 0; }
  } else if (G.trebState === 'reload') {
    G.trebT += dt;
    const k = Math.min(1, G.trebT / 4.5);
    setArm(-2.0 + (0.85 + 2.0) * (k * k * (3 - 2 * k)));
    if (k >= 1) {
      G.trebState = G.cards.treb > 0 ? 'ready' : 'empty';
      TU.ropes.forEach((r) => { r.visible = true; });
      TU.stone.visible = G.cards.treb > 0;
      if (G.mode === 'battle') hud.cards(G.cards, G.sel, G.trebState === 'ready');
    }
  }
  // the stone in flight: the wind pushes it; slow at the end; back to the field after the hit
  if (G.mode === 'flight' && G.stone) {
    G.flightT += dt;
    const b = G.stone.body;
    G.trailT = (G.trailT || 0) + dt;
    if (!G.impact && G.trailT > 0.05) { G.trailT = 0; fx.dust(new THREE.Vector3(b.position.x, b.position.y, b.position.z), { n: 1, size: 0.9, up: 0, spread: 0.2, life: 0.9, color: '#d9c7ad' }); }
    b.applyForce(new phys.CANNON.Vec3(G.wind * 0.3 * b.mass, 0, 0));   // (about one dot, 1°, per m/s at 150 m)
    const near = Math.hypot(b.position.x - KEEP.x, b.position.z - (KEEP.z + 6)) < 34 && b.velocity.y < 0;
    G.slowTo = G.impact ? (G.impact.t < 1.0 ? 0.35 : 1) : near ? 0.32 : 1;
    if (G.impact) {
      G.impact.t += rdt;
      if (G.impact.t > 2.6 || (!G.impact.hitCastle && G.impact.t > 1.4)) {
        G.slowTo = 1;
        G.mode = 'battle';
        hud.cards(G.cards, G.sel, G.trebState === 'ready');
        const s = G.stone;
        setTimeout(() => { phys.remove(s); scene.remove(s.mesh); }, 6000);
        G.stone = null;
      }
    } else if (G.flightT > 9 || b.position.y < -5) { G.impact = { at: new THREE.Vector3(b.position.x, 0, b.position.z), hitCastle: false, t: 0 }; }
  }
  let _t = performance.now();
  const P = window.__prof || (window.__prof = {});
  const lap = (k) => { const n = performance.now(); P[k] = (P[k] || 0) + n - _t; _t = n; };
  phys.step(dt);
  phys.sync();
  welds.update();
  lap('physics');
  if (G.mode !== 'scout') think(dt);
  lap('think');
  for (const m of crowd.all) {
    if (m.state !== 'fall') continue;
    m.vy -= G_ACC * dt;
    m.x += m.vx * dt;
    m.z += m.vz * dt;
    m.y += m.vy * dt;
    const gy = groundHeight(m.x, m.z);
    if (m.y <= gy) { m.y = null; m.state = 'dead'; m.diedAt = G.t; fx.dust(new THREE.Vector3(m.x, gy + 0.3, m.z), { n: 3, size: 1.4, up: 0.6, spread: 1, life: 1.2 }); }
  }
  measure(dt);
  lap('measure');
  crowd.update(G.t);
  lap('crowd');
  fx.update(dt, G_ACC);
  lap('fx');
  for (const w of wavers) w.userData.wave(G.t);
  lap('flags');
  for (const tch of castle.torches) { const f = 0.85 + Math.sin(G.t * 17 + tch.position.x) * 0.08; tch.userData.flame.scale.set(f, f * 1.1, f); }
  cameraTick(rdt);
  // the screen
  hudT += rdt;
  if (hud && hudT > 0.1) {
    hudT = 0;
    hud.clock(G.clock);
    if (G.mode === 'aim') { hud.range(rangefind()); hud.power(G.winding ? G.power : 0, G.winding); }
  }
  // the end
  if (!G.ended && ['battle', 'aim', 'flight'].includes(G.mode)) {
    const out = G.clock <= 0 || starCount() === 3 || (G.mode === 'battle' && !G.stone && G.cards.treb <= 0 && G.trebState !== 'firing' && ['swaard', 'spies', 'boog', 'ridder'].every((k) => G.cards[k] <= 0) && !G.cards.ram && !blue.some((m) => m.alive));
    if (out) endSiege();
  }
  lap('rest');
  st.render(rdt);
  lap('render');
  P.frames = (P.frames || 0) + 1;
  requestAnimationFrame(frame);
}
function endSiege() {
  G.ended = true;
  G.winding = false;
  hud.aim(false);
  const stars = starCount();
  setTimeout(() => {
    G.mode = 'end';
    sfx(stars ? 'record' : 'lost');
    hudEl.classList.add('is-end');
    hud.end({ stars, destroyed: G.destroyed, nameIn: NAME_IN, lost: G.lost, test: !!MINE, coins: MINE ? null : 10 + stars * 40, trophies: stars ? stars * 10 : -5 });
  }, 1600);
}
await st.warm([shot(0.62), makeRam(mats, 'blue')]);   // (the stone and the ram come later: their shaders now)
requestAnimationFrame(frame);

// for the tests: play it without fingers
window.__siege = {
  G, KEEP, TREB, YAW0, castle, blue, defenders, phys, renderer, crowd,
  start: () => { if (G.mode === 'scout') startSiege(); },
  pick: (k) => pickCard(k),
  deploy: (k, x, z) => deploy(k, x, z),
  aim: (yaw, pitch = 0.05) => { G.yaw = yaw; G.pitch = pitch; },
  range: () => rangefind(),
  fire: (range) => { if (G.mode === 'aim') fire(range); },
  ready: () => G.mode === 'battle' && G.trebState === 'ready',
};
window.__siegeProject = (x, z) => { const v = new THREE.Vector3(x, groundHeight(x, z), z).project(camera); return { x: v.x, y: v.y }; };
window.__kasteelReady = true;
