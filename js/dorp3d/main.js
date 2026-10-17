// (1.18) Jou dorp in 3D — the look test (the owner, 17 Oct 2026: "the Your town feels like childs play", his pick:
// "Rebuilt in 3D", a look test first). Your town on its island in Block Clash's sunset sea, Robot Rikus's across the
// water. Shots (`?shot=`): 'town' (your town from the sea, the camera drifting round), 'street' (in among the
// buildings), 'raid' (a raid: up and across the sea to his town, the strike, his people parachuting over to yours),
// none: all three in turn. `?skin=` your blocks' Stapel skin. Nothing here is saved or sent: it's a picture of the idea.
import * as THREE from '../../lib/three.module.min.js';
import { createStage, pickQuality } from '../kasteel/stage.js';
import { buildWorld, SUN_DIR } from '../botsing/world.js';
import { createPieces } from '../botsing/pieces.js';
import { createBattleFx } from '../botsing/fx.js';
import { TRIBES } from '../game/residents.js';
import { makeIsle } from './isle.js';
import { planTown3D, buildTown } from './town.js';

const q = new URLSearchParams(location.search);
const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
const skin = String(q.get('skin') || readJson('stapel.v1.econ')?.skins?.wear?.blocks || 'kleur');
const quality = pickQuality();
if (quality.name === 'mid' && !quality.forced) Object.assign(quality, { dpr: 1.3, shadow: 1024 });
const stage = createStage({ fov: 40, quality });
const { scene, camera, renderer } = stage;
const pieces = createPieces(renderer);
const fx = createBattleFx(stage);

const ME = { cx: 0, cz: 0, radius: 30, top: 5, seed: 3 };
const THEM = { cx: 210, cz: -150, radius: 25, top: 5, seed: 8 };
const world = buildWorld(stage, { stacks: false, isles: [[ME.cx, ME.cz, ME.radius * 0.93], [THEM.cx, THEM.cz, THEM.radius * 0.93]] });
const mine = makeIsle({ ...ME, mats: world.mats });
const theirs = makeIsle({ ...THEM, mats: world.mats });
scene.add(mine.group, theirs.group);
const myTown = buildTown({ plan: planTown3D({ id: 'JOUDORP7', people: 140, tribe: 'vuur', gold: 3 }), isle: mine, pieces, renderer, skin, marks: ['wiel', 'fontein', 'mallemeule', 'seilboot', 'dolfyn', 'walvis'], walls: 2, seed: 3 });
const rikus = buildTown({ plan: planTown3D({ id: 'RIKUS', people: 80, tribe: 'water', gold: 1 }), isle: theirs, pieces, renderer, skin: 'kleur', marks: ['kasteel', 'vuurpyl'], walls: 1, seed: 8 });
scene.add(myTown.group, rikus.group);
// the sun's shadow follows what the camera looks at (two islands far apart)
const sun = world.sun;

// --------------------------------------------------------------------------------------------- parachutists
const NC = 16;
const chuteGeo = new THREE.SphereGeometry(0.9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const chutes = new THREE.InstancedMesh(chuteGeo, new THREE.MeshStandardMaterial({ color: TRIBES.water.chute, roughness: 0.6, side: THREE.DoubleSide }), NC);
const manGeo = new THREE.CapsuleGeometry(0.2, 0.5, 3, 6);
const men = new THREE.InstancedMesh(manGeo, new THREE.MeshStandardMaterial({ color: '#2a3a52', roughness: 0.8 }), NC);
chutes.frustumCulled = men.frustumCulled = false;
chutes.count = men.count = 0;
scene.add(chutes, men);
const jumpers = [];
function launchJumpers(from, to) {
  jumpers.length = 0;
  for (let i = 0; i < NC; i++) jumpers.push({ t0: i * 0.18, from: from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 6, (Math.random() - 0.5) * 3)), to: to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 18, 8 + Math.random() * 6, (Math.random() - 0.5) * 12)) });
  chutes.count = men.count = NC;
}
const jm = new THREE.Matrix4();
const jq = new THREE.Quaternion();
const jp = new THREE.Vector3();
const js = new THREE.Vector3(1, 1, 1);
function updateJumpers(t) {
  jumpers.forEach((j, i) => {
    const u = Math.min(1, Math.max(0, (t - j.t0) / 7));
    jp.lerpVectors(j.from, j.to, u);
    jp.y += Math.sin(u * Math.PI) * 10 - u * 2;
    const sway = Math.sin(t * 2 + i) * 0.25;
    jq.setFromEuler(new THREE.Euler(0, 0, sway));
    js.setScalar(u > 0 ? 1 : 0.001);
    jm.compose(jp.clone().add(new THREE.Vector3(0, 1.5, 0)), jq, js);
    chutes.setMatrixAt(i, jm);
    jm.compose(jp, jq, js);
    men.setMatrixAt(i, jm);
  });
  chutes.instanceMatrix.needsUpdate = true;
  men.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------- the shots
const look = new THREE.Vector3();
const pos = new THREE.Vector3();
const ease = (k) => k * k * (3 - 2 * k);
const myCentre = new THREE.Vector3(ME.cx, ME.top + 6, ME.cz);
const theirCentre = new THREE.Vector3(THEM.cx, THEM.top + 6, THEM.cz);
let shotT = 0;
let shot = q.get('shot') || 'tour';
let struck = false;
const label = document.getElementById('d3-label');
function setLabel(text) { if (label) label.textContent = text; }
function shotAt(name, t) {
  if (name === 'town') {   // (from the sea, drifting round)
    const a = 0.35 + t * 0.03;
    pos.set(myCentre.x + Math.sin(a) * 78, 30, myCentre.z + Math.cos(a) * 78);
    look.copy(myCentre).add(new THREE.Vector3(0, 2, 0));
    setLabel('JOU DORP · 140 MENSE');
  } else if (name === 'street') {   // (in among the buildings, low)
    const a = 0.5 + t * 0.05;
    pos.set(myCentre.x + Math.sin(a) * 26, 9, myCentre.z + Math.cos(a) * 26);
    look.set(myCentre.x, ME.top + 7, myCentre.z);
    setLabel('JOU DORP');
  } else if (name === 'raid') {
    // up over your town and across the sea, both islands in sight (4.5 s); down onto their tallest; the strike, fire
    // at its windows; their people jump with parachutes and the camera rides along with them home; "+16 MENSE!"
    const target = rikus.tallestAt();
    const FLY = 4.5;
    const STRIKE = FLY + 0.4;
    const k = Math.min(1, t / FLY);
    const e = ease(k);
    const start = new THREE.Vector3(myCentre.x + 26, 30, myCentre.z + 70);
    const over = new THREE.Vector3((ME.cx + THEM.cx) / 2 - 10, 90, (ME.cz + THEM.cz) / 2 + 120);
    const arrive = new THREE.Vector3(target.x - 34, target.y + 4, target.z + 30);
    if (t < FLY) {
      // (a curve through the high point: both islands in the picture on the way)
      const a1 = new THREE.Vector3().lerpVectors(start, over, e);
      const a2 = new THREE.Vector3().lerpVectors(over, arrive, e);
      pos.lerpVectors(a1, a2, e);
      // (the eye turns to their town at once and holds it: the flight is an approach, not a look at the sea)
      look.lerpVectors(myCentre, target, ease(Math.min(1, t / 1.3)));
      setLabel('STROOPTOG · ROBOT RIKUS');
    } else if (t < STRIKE + 2.2) {
      pos.copy(arrive);
      look.copy(target).add(new THREE.Vector3(0, -3, 0));
      setLabel('STROOPTOG · ROBOT RIKUS');
    }
    if (t > STRIKE && !struck) {
      struck = true;
      fx.boom(target.clone().add(new THREE.Vector3(0, -3, 2)), 9);
      stage.shake(1.4);
      strikeT = 0;
      launchJumpers(target.clone().add(new THREE.Vector3(0, -4, 1)), myCentre);
      jumpT0 = t + 0.4;
    }
    if (struck && t < STRIKE + 2.6) {   // (fire at their windows)
      for (let i = 0; i < 3; i++) fx.flame(target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, -2 - Math.random() * 6, 1.8)), 2, 1.2);
    }
    if (t >= STRIKE + 2.2) {   // (ride home with their people)
      const c = jumpCentre();
      setLabel(t > STRIKE + 8.2 ? '+16 MENSE!' : '+16 MENSE');
      // (from behind and above them, your town ahead: they float home; eased over from the strike's view)
      const toHome = new THREE.Vector3().subVectors(myCentre, c).setY(0).normalize();
      const ride = c.clone().addScaledVector(toHome, -34).add(new THREE.Vector3(0, 16, 0)).add(new THREE.Vector3(-toHome.z, 0, toHome.x).multiplyScalar(18));
      const rideLook = c.clone().lerp(myCentre, 0.55);
      const w = ease(Math.min(1, (t - STRIKE - 2.2) / 1.6));
      pos.lerpVectors(arrive, ride, w);
      pos.y += Math.sin(w * Math.PI) * 16;   // (up over their roofs on the way, never through them)
      look.lerpVectors(target.clone().add(new THREE.Vector3(0, -3, 0)), rideLook, w);
    }
  }
}
let strikeT = 0;
let jumpT0 = 0;
/** The middle of the jumpers in the air. */
function jumpCentre() {
  const c = new THREE.Vector3();
  if (!jumpers.length) return c.copy(myCentre);
  for (let i = 0; i < jumpers.length; i++) { men.getMatrixAt(i, jm); c.add(new THREE.Vector3().setFromMatrixPosition(jm)); }
  return c.multiplyScalar(1 / jumpers.length);
}
const TOUR = [['town', 9], ['street', 8], ['raid', 16]];
let tourI = 0;
let time = 0;
let last = performance.now();
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let first = true;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  shotT += dt;
  if (shot === 'tour' || window.__tour) {
    const [name, len] = TOUR[tourI];
    if (shotT > len) { shotT = 0; tourI = (tourI + 1) % TOUR.length; struck = false; }
    shotAt(TOUR[tourI][0], shotT);
  } else shotAt(shot, shotT);
  if (first) { camPos.copy(pos); camLook.copy(look); first = false; }
  const a = 1 - Math.exp(-dt * 3.2);
  camPos.lerp(pos, a);
  camLook.lerp(look, a);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sun.target.position.copy(camLook);
  sun.position.copy(camLook).addScaledVector(SUN_DIR, 160);
  world.update(time);
  myTown.update(time, dt);
  rikus.update(time, dt);
  pieces.tick(time);
  if (jumpers.length) updateJumpers(shotT - jumpT0);
  fx.update(dt, camera);
  stage.render(dt);
}
stage.warm([]).then(() => {
  requestAnimationFrame((t) => { last = t; frame(t); });
  setTimeout(() => { window.__d3Ready = true; }, 300);
});
window.__d3 = {
  /** (tests) jump to a shot at a moment */
  shot(name, t = 0) { shot = name; shotT = t; struck = false; jumpers.length = 0; chutes.count = men.count = 0; first = true; },
};
