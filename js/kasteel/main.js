// (1.17 3D) Die Kasteelreeks — the third tier after the Daily and the Uitdagersreeks (the owner, 16 Oct 2026: "THEN you
// get the CASTLE Series, which is made out of the tower you build with your daily challenge ... lets bring in troops
// and machinary"). His picks: Command + aim, any time with a planned defence, stone and timber. This first step is the
// look: `?shot=kasteel` (scouting their castle), `?shot=beleg` (the siege behind your trebuchet), `?shot=visier` (the
// trebuchet's sight).
import * as THREE from '../../lib/three.module.min.js';
import { buildWorld, DIST, rng, groundHeight } from './world.js';
import { castleMaterials, buildCastle, sampleDaily } from './castle.js';
import { soldier, formation, trebuchet, ram, shot } from './army.js';
import { idle } from './crew.js';
import { scoutHud, siegeHud } from './hud.js';

const q = new URLSearchParams(location.search);
const SHOT = q.get('shot') || 'beleg';
const canvas = document.getElementById('k-canvas');
const stage = document.getElementById('k-stage');
const size = () => [stage.clientWidth || window.innerWidth, stage.clientHeight || window.innerHeight];
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(...size(), false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, size()[0] / size()[1], 0.1, 4000);
scene.add(camera);
const world = buildWorld(scene, renderer, { seed: 11 });
const rand = rng(21);
const mats = castleMaterials(renderer);
const crew = [];
const onGround = (obj, parentPos = new THREE.Vector3()) => {
  for (const c of obj.children) {
    const wx = parentPos.x + obj.position.x + c.position.x;
    const wz = parentPos.z + obj.position.z + c.position.z;
    c.position.y = groundHeight(wx, wz) - obj.position.y;
  }
};

// their castle from five of their days (the best day stands in the middle as the keep)
const days = [sampleDaily(rand, 17), sampleDaily(rand, 12), sampleDaily(rand, 11), sampleDaily(rand, 13), sampleDaily(rand, 10)];
const castle = buildCastle({ at: new THREE.Vector3(0, 0, -DIST), days, team: 'red', mats, rand });
scene.add(castle.group);
// their defence: archers on the front wall and the tower tops, spearmen at the gate
for (const p of castle.spots.wall) { const a = soldier('boog', 'red', rand); a.position.copy(p); castle.group.add(a); crew.push(a); }
const topGuards = castle.spots.towers.map((p, i) => { const a = soldier(i % 2 ? 'spies' : 'boog', 'red', rand); a.position.copy(p); castle.group.add(a); crew.push(a); return a; });
for (const s of [-1, 1]) { const g = soldier('ridder', 'red', rand); g.position.set(s * 3.4, 0, 15 + 3.2); castle.group.add(g); crew.push(g); }
const perfects = days.flat().filter((b) => b.rating === 'P').length;

if (SHOT !== 'kasteel') {
  // the fight so far: the front-left tower has lost its top, rubble and dust below it
  const fl = castle.towers[1];
  const blocks = fl.group.children.filter((o) => o.userData.block).slice(-3);
  blocks.forEach((b, i) => {
    fl.group.remove(b);
    b.position.set(-1.5 + i * 2.6, 0.2, 5.5 + rand() * 2);
    b.rotation.set((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 1.6);
    fl.group.add(b);
  });
  fl.group.children.filter((o) => o.position.y > fl.top - 3 && !o.userData.block && o.type === 'Mesh').forEach((o) => { o.visible = false; });
  if (fl.flag) fl.flag.visible = false;
  topGuards[1].visible = false;   // (he was standing on what fell)
  const dustM = new THREE.MeshStandardMaterial({ color: '#9c8770', transparent: true, opacity: 0.32, depthWrite: false, roughness: 1 });
  for (let i = 0; i < 16; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), dustM);
    d.position.set(fl.pos.x + (rand() - 0.5) * 7, 1 + rand() * 6, fl.pos.z + 4 + (rand() - 0.5) * 6);
    d.scale.setScalar(1.2 + rand() * 2.4);
    castle.group.add(d);
  }
  for (let i = 0; i < 24; i++) {
    const r = shot(0.2 + rand() * 0.35);
    r.position.set(fl.pos.x + (rand() - 0.5) * 9, 0.15, fl.pos.z + 3 + rand() * 7);
    castle.group.add(r);
  }
  // your army on the field, heading for their gate
  const parts = [
    [formation('swaard', 'blue', 4, 6, 1.5, rand), -5, -32],
    [formation('spies', 'blue', 3, 6, 1.45, rand), 9, -44],
    [formation('boog', 'blue', 3, 5, 1.5, rand), -16, -22],
    [formation('ridder', 'blue', 2, 4, 1.9, rand), 2, -58],
  ];
  for (const [f, x, z] of parts) { f.position.set(x, 0, z); onGround(f); scene.add(f); crew.push(...f.userData.men); }
  const rm = ram(mats, 'blue');
  rm.position.set(0, groundHeight(0, -DIST + 27), -DIST + 27);
  scene.add(rm);
  const pushers = formation('swaard', 'blue', 2, 2, 1.2, rand);
  pushers.position.set(0, 0, -DIST + 31);
  onGround(pushers);
  scene.add(pushers);
  crew.push(...pushers.userData.men);
  // your trebuchet, and a stone on its way to their keep
  const tr = trebuchet(mats, 'blue', SHOT === 'beleg' ? { arm: -1.95, fired: true } : { arm: 0.85 });
  tr.position.set(8, groundHeight(8, -4), -4);
  scene.add(tr);
  if (SHOT === 'beleg') {
    const S = new THREE.Vector3(8, 14, -9);
    const E = new THREE.Vector3(0, 16, -DIST - 5);
    const at = (t) => S.clone().lerp(E, t).add(new THREE.Vector3(0, 4 * 24 * t * (1 - t), 0));
    const st = shot(0.6);
    st.position.copy(at(0.74));
    scene.add(st);
    const trailM = new THREE.MeshBasicMaterial({ color: '#e9dccb', transparent: true, depthWrite: false });
    for (let i = 1; i <= 10; i++) {
      const tm = trailM.clone();
      tm.opacity = 0.4 * (1 - i / 11);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.34 * (1 - i / 14), 8, 6), tm);
      p.position.copy(at(0.74 - i * 0.012));
      scene.add(p);
    }
  }
}

// the camera for each picture
const look = new THREE.Vector3();
if (SHOT === 'kasteel') {
  camera.position.set(-58, 36, -84);
  look.set(-1, 8, -DIST - 2);
} else if (SHOT === 'visier') {
  camera.position.set(8, 10.5, -1);
  const k = castle.keep;
  look.set(k.pos.x - 1.2, k.top * 0.74, -DIST + k.pos.z);
  camera.fov = 11;
} else {
  camera.position.set(14.8, 4.2, 7.5);
  look.set(-4, 9, -DIST);
  camera.fov = 36;
  // shadows across the whole field
  const sun = world.sun;
  sun.target.position.set(0, 0, -76);
  sun.position.set(-100, 72, -6);
  const sc = sun.shadow.camera;
  sc.left = -95; sc.right = 95; sc.top = 100; sc.bottom = -100; sc.near = 10; sc.far = 320;
  sc.updateProjectionMatrix();
}
camera.lookAt(look);
camera.updateProjectionMatrix();

const hudEl = document.getElementById('k-hud');
if (SHOT === 'kasteel') {
  scoutHud(hudEl, { name: 'Kippie', towers: castle.towers.length, perfects, defenders: crew.length, goals: ['Breek die hek', 'Helfte plat', 'Hul vlag val'], coins: 120, trophies: 28 });
} else {
  siegeHud(hudEl, { clock: '2:31', stars: 1, damage: 38, name: 'Kippie se kasteel', army: { swaard: 12, spies: 8, boog: 10, ridder: 4, ram: 1 }, scope: SHOT === 'visier', wind: '1.8' });
}

const wavers = [];
scene.traverse((o) => { if (o.userData.wave) wavers.push(o); });
const clock = new THREE.Clock();
let frames = 0;
function frame() {
  const t = clock.getElapsedTime();
  for (const p of crew) idle(p, t);
  for (const w of wavers) w.userData.wave(t);
  for (const tch of castle.torches) {
    const f = 0.85 + Math.sin(t * 17 + tch.position.x) * 0.08 + Math.sin(t * 29) * 0.06;
    tch.userData.flame.scale.set(f, f * 1.1, f);
  }
  renderer.render(scene, camera);
  if (++frames === 40) window.__kasteelReady = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => {
  const [w, h] = size();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
});
window.__kasteel = { THREE, scene, camera, renderer, castle };
