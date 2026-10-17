// (1.17 3D) Die Kasteelreeks: people — grown-up proportions, built from simple shapes and posed with pivots at the
// shoulders, hips and neck (idle, point, cheer, duck, tumble). army.js dresses them as soldiers; the knight, the vervet,
// Groot Joe and Sarel below were the fruit battle's defenders (kept for the towns).
import * as THREE from '../../lib/three.module.min.js';

const cache = new Map();
export function mat(color, rough = 0.75, metal = 0) {
  const key = `${color}|${rough}|${metal}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return cache.get(key);
}
/** (phones: simpler shapes — fewer sides on every round part; a soldier from ~5 000 triangles to ~1 300) */
export const DETAIL = { k: 1 };
export const seg = (n) => Math.max(3, Math.round(n * DETAIL.k));
const makeG = () => ({
  leg: new THREE.CapsuleGeometry(0.078, 0.66, seg(4), seg(10)),
  arm: new THREE.CapsuleGeometry(0.06, 0.5, seg(4), seg(10)),
  torso: new THREE.CapsuleGeometry(0.2, 0.34, seg(6), seg(14)),
  hips: new THREE.CapsuleGeometry(0.17, 0.08, seg(4), seg(12)),
  head: new THREE.SphereGeometry(0.115, seg(20), seg(14)),
  neck: new THREE.CylinderGeometry(0.05, 0.06, 0.1, seg(10)),
  hand: new THREE.SphereGeometry(0.058, seg(12), seg(10)),
  shoe: new THREE.BoxGeometry(0.12, 0.085, 0.27),
  sole: new THREE.BoxGeometry(0.125, 0.03, 0.28),
  capTop: new THREE.SphereGeometry(0.122, seg(18), seg(10), 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.BoxGeometry(0.2, 0.018, 0.13),
  hair: new THREE.SphereGeometry(0.122, seg(18), seg(10), 0, Math.PI * 2, 0, Math.PI * 0.42),
  shades: new THREE.BoxGeometry(0.2, 0.045, 0.03),
});
let G = makeG();
/** Simpler shapes from now on (`k` 0.4–1); call before the soldiers are made. */
export function setDetail(k) {
  DETAIL.k = k;
  G = makeG();
}
export const SKIN = ['#f1c9a0', '#e0ac69', '#c68642', '#a0663a', '#7a4a2a', '#5a3620'];
const TOPS = ['#2f3542', '#3c6382', '#b33939', '#cd6133', '#218c74', '#706fd3', '#d1ccc0', '#40407a', '#ffb142', '#1e272e', '#84817a', '#c44569'];
const PANTS = ['#2c3e50', '#1e1e24', '#5d5d5d', '#a39274', '#3b4a6b'];
const HATS = ['#111111', '#c0392b', '#1f3a5f', '#e1b12c', '#2d3436', '#e8e8e8'];

function part(geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** A person (feet at the origin, facing +z). `look`: { skin, top, pants, hat ('cap'|'beanie'|'hair'|null), shades, scale }. */
export function person(rand, look = {}) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const skin = mat(look.skin || pick(SKIN), 0.6);
  const top = mat(look.top || pick(TOPS), 0.85);
  const pants = mat(look.pants || pick(PANTS), 0.9);
  const shoeM = mat(look.shoe || (rand() < 0.6 ? '#f5f5f5' : '#222222'), 0.6);
  const root = new THREE.Group();
  const body = new THREE.Group();   // (everything above the feet: it bends and ducks)
  root.add(body);
  const hipL = new THREE.Group();
  const hipR = new THREE.Group();
  hipL.position.set(-0.1, 0.9, 0);
  hipR.position.set(0.1, 0.9, 0);
  for (const hp of [hipL, hipR]) {
    hp.add(part(G.leg, pants, 0, -0.45, 0));
    const shoe = part(G.shoe, shoeM, 0, -0.86, 0.04);
    shoe.add(part(G.sole, mat('#e9e4da', 0.8), 0, -0.04, 0));
    hp.add(shoe);
    body.add(hp);
  }
  const torso = part(G.torso, top, 0, 1.23, 0);
  torso.scale.set(1.12, 1, 0.72);
  const hips = part(G.hips, pants, 0, 0.94, 0);
  hips.scale.set(1.05, 1, 0.72);
  body.add(torso, hips);
  body.add(part(G.neck, skin, 0, 1.53, 0));
  const shL = new THREE.Group();
  const shR = new THREE.Group();
  shL.position.set(-0.27, 1.44, 0);
  shR.position.set(0.27, 1.44, 0);
  for (const [sh, side] of [[shL, -1], [shR, 1]]) {
    const arm = part(G.arm, top, 0, -0.27, 0);
    sh.add(arm);
    const hand = part(G.hand, skin, 0, -0.58, 0);
    hand.name = 'hand';
    sh.add(hand);
    sh.rotation.z = side * 0.08;
    body.add(sh);
  }
  const neck = new THREE.Group();
  neck.position.set(0, 1.58, 0);
  const head = part(G.head, skin, 0, 0.1, 0);
  head.scale.set(0.95, 1.08, 1);
  neck.add(head);
  const hat = look.hat === undefined ? pick(['cap', 'cap', 'beanie', 'hair', 'hair', null]) : look.hat;
  if (hat === 'cap') {
    const c = mat(pick(HATS), 0.7);
    neck.add(part(G.capTop, c, 0, 0.13, 0));
    const brim = part(G.brim, c, 0, 0.135, 0.1);
    brim.rotation.y = rand() < 0.25 ? Math.PI : 0;
    if (brim.rotation.y) brim.position.z = -0.1;
    neck.add(brim);
  } else if (hat === 'beanie') {
    const b = part(G.capTop, mat(pick(HATS), 0.95), 0, 0.12, 0);
    b.scale.set(1.04, 1.25, 1.04);
    neck.add(b);
  } else if (hat === 'hair') {
    const hr = part(G.hair, mat(pick(['#1b1b1b', '#3b2416', '#6b4423', '#c8a165', '#2b1b10']), 0.9), 0, 0.13, -0.01);
    hr.scale.set(1.05, 1.1, 1.08);
    neck.add(hr);
  }
  if (look.shades ?? rand() < 0.3) neck.add(part(G.shades, mat('#0d0d12', 0.2, 0.6), 0, 0.12, 0.1));
  body.add(neck);
  root.userData = { body, shL, shR, hipL, hipR, neck, kind: 'person', phase: rand() * 10 };
  if (look.scale) root.scale.setScalar(look.scale);
  return root;
}

/** Poses: 'idle', 'point', 'cheer', 'cross', 'hips', 'wave', 'duck'. */
export function pose(p, name) {
  const u = p.userData;
  if (!u?.shL) return;
  u.pose = name;
  u.shL.rotation.set(0, 0, -0.08);
  u.shR.rotation.set(0, 0, 0.08);
  u.body.position.y = 0;
  u.body.rotation.x = 0;
  if (name === 'point') u.shR.rotation.set(-1.45, 0, 0.12);
  else if (name === 'cheer') { u.shL.rotation.set(0, 0, -2.75); u.shR.rotation.set(0, 0, 2.75); }
  else if (name === 'wave') u.shR.rotation.set(0, 0, 2.55);
  else if (name === 'cross') { u.shL.rotation.set(-1.05, 0.2, 0.75); u.shR.rotation.set(-1.05, -0.2, -0.75); }
  else if (name === 'hips') { u.shL.rotation.set(0.25, 0, -0.55); u.shR.rotation.set(0.25, 0, 0.55); }
  else if (name === 'duck') { u.body.rotation.x = 0.55; u.body.position.y = -0.35; u.shL.rotation.set(-2.6, 0, -0.5); u.shR.rotation.set(-2.6, 0, 0.5); }
}

/** A gentle idle each frame: breathing, a sway, a look around (the pose's arms kept). */
export function idle(p, t) {
  const u = p.userData;
  if (!u?.neck) return;
  const ph = u.phase + t;
  u.neck.rotation.y = Math.sin(ph * 0.45) * 0.35;
  u.neck.rotation.x = Math.sin(ph * 0.3) * 0.05;
  if (u.pose !== 'duck') u.body.rotation.z = Math.sin(ph * 0.8) * 0.025;
  if (u.pose === 'wave') u.shR.rotation.z = 2.55 + Math.sin(ph * 7) * 0.35;
  if (u.pose === 'cheer') { u.shL.rotation.z = -2.75 + Math.sin(ph * 6) * 0.2; u.shR.rotation.z = 2.75 - Math.sin(ph * 6) * 0.2; }
  if (u.kind === 'aap' && u.tail) u.tail.rotation.z = Math.sin(ph * 1.7) * 0.25;
}

// ---------------------------------------------------------------------------------------------- the defenders
/** ⚔️ The knight: steel helmet and breastplate, a long sword raised. */
export function knight(rand) {
  const p = person(rand, { top: '#3d3d46', pants: '#2b2b33', hat: null, shades: false, shoe: '#2a2a2a' });
  const u = p.userData;
  const steel = mat('#c9d1dc', 0.28, 0.85);
  const plate = part(new THREE.CapsuleGeometry(0.215, 0.3, seg(6), seg(14)), steel, 0, 1.25, 0.01);
  plate.scale.set(1.15, 1, 0.78);
  u.body.add(plate);
  const helm = part(new THREE.CylinderGeometry(0.14, 0.13, 0.22, seg(16)), steel, 0, 0.12, 0);
  helm.add(part(new THREE.SphereGeometry(0.14, seg(16), seg(8), 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 0.1, 0));
  helm.add(part(new THREE.BoxGeometry(0.2, 0.025, 0.02), mat('#111', 0.5), 0, 0.01, 0.135));
  const plume = part(new THREE.BoxGeometry(0.03, 0.12, 0.22), mat('#b8202f', 0.8), 0, 0.27, -0.02);
  helm.add(plume);
  u.neck.add(helm);
  for (const sh of [u.shL, u.shR]) sh.add(part(new THREE.SphereGeometry(0.1, seg(12), seg(8)), steel, 0, -0.02, 0));
  const sword = new THREE.Group();
  sword.add(part(new THREE.BoxGeometry(0.05, 0.95, 0.012), mat('#e8edf3', 0.15, 0.95), 0, 0.55, 0));
  sword.add(part(new THREE.BoxGeometry(0.24, 0.035, 0.04), mat('#c9a227', 0.3, 0.9), 0, 0.06, 0));
  sword.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.14, seg(8)), mat('#3b2414', 0.8), 0, -0.03, 0));
  sword.position.set(0, -0.6, 0.02);
  u.shR.add(sword);
  u.kind = 'ridder';
  pose(p, 'wave');
  u.shR.rotation.set(-0.3, 0, 2.3);
  u.pose = 'sword';
  return p;
}

/** 🥤 Groot Joe: a big man with a giant cup and its straw. */
export function bigJoe(rand) {
  const p = person(rand, { top: '#e1b12c', pants: '#2c3e50', hat: 'cap', shades: true });
  const u = p.userData;
  p.scale.set(1.35, 1.12, 1.3);
  const cup = new THREE.Group();
  cup.add(part(new THREE.CylinderGeometry(0.15, 0.11, 0.36, seg(16)), mat('#f4f1ea', 0.5), 0, 0, 0));
  cup.add(part(new THREE.CylinderGeometry(0.152, 0.152, 0.07, seg(16)), mat('#d63031', 0.5), 0, 0.06, 0));
  cup.add(part(new THREE.CylinderGeometry(0.16, 0.16, 0.025, seg(16)), mat('#ffffff', 0.4), 0, 0.19, 0));
  const straw = part(new THREE.CylinderGeometry(0.013, 0.013, 0.42, seg(8)), mat('#ff4757', 0.4), 0.03, 0.36, -0.02);
  straw.rotation.x = -0.35;
  cup.add(straw);
  cup.position.set(0, 1.22, 0.3);
  u.body.add(cup);
  u.shL.rotation.set(-0.95, 0, 0.5);
  u.shR.rotation.set(-0.95, 0, -0.5);
  u.kind = 'joe';
  u.pose = 'cup';
  return p;
}

/** 🏉 Sarel: a rugby player in green and gold with the ball under his arm. */
export function sarel(rand) {
  const p = person(rand, { top: '#1e6b3c', pants: '#f2f2f2', hat: 'hair', shades: false, shoe: '#111' });
  const u = p.userData;
  const gold = mat('#f1c40f', 0.6);
  const collar = part(new THREE.TorusGeometry(0.12, 0.022, seg(8), seg(18)), gold, 0, 1.5, 0);
  collar.rotation.x = Math.PI / 2;
  u.body.add(collar);
  const band = part(new THREE.CylinderGeometry(0.235, 0.235, 0.05, seg(18)), gold, 0, 1.05, 0);
  band.scale.set(1.1, 1, 0.78);
  u.body.add(band);
  for (const hp of [u.hipL, u.hipR]) hp.add(part(new THREE.CylinderGeometry(0.085, 0.08, 0.26, seg(10)), mat('#1e6b3c', 0.8), 0, -0.6, 0));
  const ball = part(new THREE.SphereGeometry(0.13, seg(18), seg(12)), mat('#8a4b25', 0.55), 0.29, 1.12, 0.12);
  ball.scale.set(0.85, 0.85, 1.45);
  ball.rotation.x = 0.4;
  u.body.add(ball);
  u.shR.rotation.set(-0.35, 0, 0.35);
  u.shL.rotation.set(0, 0, -0.08);
  u.kind = 'sarel';
  u.pose = 'ball';
  return p;
}

/** 🐒 Blouaap: a vervet monkey — silver-grey fur, a black face with a white brow, a long tail; crouched, ready to catch. */
export function vervet(rand) {
  const fur = mat('#8d949b', 0.95);
  const dark = mat('#1d1d22', 0.7);
  const white = mat('#e8e4dc', 0.9);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const torso = part(new THREE.SphereGeometry(0.26, seg(18), seg(14)), fur, 0, 0.55, 0);
  torso.scale.set(0.9, 1.15, 0.85);
  torso.rotation.x = 0.35;
  body.add(torso);
  const belly = part(new THREE.SphereGeometry(0.2, seg(14), seg(10)), white, 0, 0.5, 0.1);
  belly.scale.set(0.8, 1.1, 0.6);
  body.add(belly);
  const neck = new THREE.Group();
  neck.position.set(0, 0.86, 0.12);
  const head = part(new THREE.SphereGeometry(0.15, seg(18), seg(14)), fur, 0, 0.06, 0);
  neck.add(head);
  const face = part(new THREE.SphereGeometry(0.105, seg(16), seg(12)), dark, 0, 0.03, 0.08);
  face.scale.set(1, 1.1, 0.75);
  neck.add(face);
  const brow = part(new THREE.TorusGeometry(0.1, 0.022, seg(6), seg(16), Math.PI), white, 0, 0.06, 0.1);
  neck.add(brow);
  for (const s of [-1, 1]) neck.add(part(new THREE.SphereGeometry(0.045, seg(10), seg(8)), dark, s * 0.135, 0.09, -0.01));
  body.add(neck);
  const limb = new THREE.CapsuleGeometry(0.05, 0.4, seg(4), seg(8));
  const shL = new THREE.Group();
  const shR = new THREE.Group();
  shL.position.set(-0.2, 0.7, 0.08);
  shR.position.set(0.2, 0.7, 0.08);
  for (const [sh, s] of [[shL, -1], [shR, 1]]) {
    sh.add(part(limb, fur, 0, -0.22, 0));
    sh.add(part(new THREE.SphereGeometry(0.05, seg(10), seg(8)), dark, 0, -0.47, 0));
    sh.rotation.set(-0.9, 0, s * 0.5);
    body.add(sh);
  }
  for (const s of [-1, 1]) {
    const leg = part(limb, fur, s * 0.17, 0.25, 0.08);
    leg.rotation.set(-1.1, 0, s * 0.3);
    body.add(leg);
  }
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.12, -0.1, -0.35), new THREE.Vector3(0.45, 0.05, -0.55), new THREE.Vector3(0.6, 0.45, -0.45)]);
  const tail = new THREE.Group();
  tail.add(part(new THREE.TubeGeometry(curve, seg(24), 0.035, seg(8), false), fur));
  tail.position.set(0, 0.35, -0.18);
  body.add(tail);
  root.userData = { body, neck, shL, shR, tail, kind: 'aap', phase: rand() * 10, pose: 'crouch' };
  root.scale.setScalar(1.25);
  return root;
}
