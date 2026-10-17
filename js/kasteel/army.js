// (1.17 3D) Die Kasteelreeks: the troops and the machinery (the owner, 16 Oct 2026: "lets bring in troops and
// machinary"). Soldiers are the crew's people in mail, a tabard in their side's colour, steel helmets, shields, swords,
// spears and bows; knights in plate. The machines: a counterweight trebuchet, a covered battering ram, a stone shot.
import * as THREE from '../../lib/three.module.min.js';
import { person, mat, seg } from './crew.js';
import { TEAM, stoneBox } from './castle.js';

const steel = () => mat('#aeb5bf', 0.32, 0.85);
const darkSteel = () => mat('#5c616b', 0.4, 0.8);
const leather = () => mat('#5a3a22', 0.85);
const woodM = () => mat('#6b4a2b', 0.8);

function m(geo, material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, material);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** A round shield in the side's colour with a steel boss and rim (faces +z). */
function roundShield(team) {
  const g = new THREE.Group();
  const face = m(new THREE.CylinderGeometry(0.33, 0.33, 0.05, seg(20)), mat(TEAM[team].main, 0.6));
  face.rotation.x = Math.PI / 2;
  const rim = m(new THREE.TorusGeometry(0.33, 0.025, seg(6), seg(24)), darkSteel());
  const boss = m(new THREE.SphereGeometry(0.08, seg(12), seg(8), 0, Math.PI * 2, 0, Math.PI / 2), steel(), 0, 0, 0.02);
  boss.rotation.x = Math.PI / 2;
  const stripe = m(new THREE.BoxGeometry(0.06, 0.62, 0.055), mat('#f1ece2', 0.6));
  g.add(face, rim, boss, stripe);
  return g;
}
/** A knight's kite shield (faces +z). */
function kiteShield(team) {
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0.38);
  s.lineTo(0.3, 0.38);
  s.quadraticCurveTo(0.32, -0.1, 0, -0.55);
  s.quadraticCurveTo(-0.32, -0.1, -0.3, 0.38);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 });
  const g = new THREE.Group();
  g.add(m(geo, mat(TEAM[team].main, 0.55)));
  const cross = m(new THREE.BoxGeometry(0.08, 0.7, 0.03), mat('#f1ece2', 0.6), 0, -0.05, 0.06);
  const bar = m(new THREE.BoxGeometry(0.42, 0.08, 0.03), mat('#f1ece2', 0.6), 0, 0.12, 0.06);
  g.add(cross, bar);
  return g;
}
function sword() {
  const g = new THREE.Group();
  g.add(m(new THREE.BoxGeometry(0.045, 0.8, 0.012), mat('#dfe5ec', 0.15, 0.95), 0, -0.48, 0));
  g.add(m(new THREE.BoxGeometry(0.2, 0.03, 0.035), darkSteel(), 0, -0.07, 0));
  g.add(m(new THREE.CylinderGeometry(0.018, 0.018, 0.12, seg(8)), leather(), 0, 0, 0));
  return g;
}
function spear() {
  const g = new THREE.Group();
  g.add(m(new THREE.CylinderGeometry(0.022, 0.022, 2.6, seg(8)), woodM(), 0, 0.7, 0));
  g.add(m(new THREE.ConeGeometry(0.045, 0.28, seg(8)), steel(), 0, 2.14, 0));
  return g;
}
function bow() {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.65, 0), new THREE.Vector3(0, 0, 0.32), new THREE.Vector3(0, 0.65, 0));
  const g = new THREE.Group();
  g.add(m(new THREE.TubeGeometry(curve, seg(16), 0.018, seg(6), false), woodM()));
  const str = m(new THREE.CylinderGeometry(0.004, 0.004, 1.3, seg(4)), mat('#e8e0cc', 0.8));
  g.add(str);
  return g;
}
function quiver() {
  const g = new THREE.Group();
  g.add(m(new THREE.CylinderGeometry(0.07, 0.06, 0.55, seg(10)), leather()));
  for (let i = 0; i < 4; i++) {
    const a = m(new THREE.CylinderGeometry(0.008, 0.008, 0.3, seg(4)), woodM(), (i - 1.5) * 0.025, 0.38, 0);
    g.add(a);
    g.add(m(new THREE.BoxGeometry(0.03, 0.06, 0.004), mat('#efe9dc', 0.8), (i - 1.5) * 0.025, 0.5, 0));
  }
  return g;
}

/** A soldier: 'swaard' (sword + round shield), 'spies' (spear + shield), 'boog' (archer), 'ridder' (knight in plate). */
export function soldier(kind, team, rand) {
  const t = TEAM[team];
  const knight = kind === 'ridder';
  const p = person(rand, { top: knight ? '#9aa1ab' : '#77746d', pants: knight ? '#5c616b' : '#3d3730', hat: null, shades: false, shoe: '#2b2118' });
  const u = p.userData;
  // the tabard in the side's colour over the mail, with a pale stripe
  const tab = m(new THREE.BoxGeometry(0.46, 0.7, 0.33), mat(knight ? t.dark : t.main, 0.85), 0, 1.16, 0);
  u.body.add(tab);
  u.body.add(m(new THREE.BoxGeometry(0.08, 0.7, 0.335), mat('#ece6da', 0.85), 0, 1.16, 0));
  u.body.add(m(new THREE.CylinderGeometry(0.23, 0.23, 0.07, seg(14)), leather(), 0, 0.92, 0));
  if (knight) {
    u.body.add(m(new THREE.SphereGeometry(0.1, seg(10), seg(8)), steel(), -0.29, 1.47, 0), m(new THREE.SphereGeometry(0.1, seg(10), seg(8)), steel(), 0.29, 1.47, 0));
    const helm = m(new THREE.CylinderGeometry(0.135, 0.13, 0.27, seg(16)), steel(), 0, 0.12, 0);
    helm.add(m(new THREE.BoxGeometry(0.2, 0.022, 0.02), mat('#111', 0.5), 0, 0.02, 0.13));
    helm.add(m(new THREE.BoxGeometry(0.03, 0.14, 0.2), mat(t.main, 0.8), 0, 0.2, -0.02));
    u.neck.add(helm);
  } else {
    // a kettle hat (archers: a hood)
    if (kind === 'boog') {
      const hood = m(new THREE.SphereGeometry(0.135, seg(14), seg(10), 0, Math.PI * 2, 0, Math.PI * 0.62), mat('#4f5a3a', 0.95), 0, 0.12, -0.01);
      u.neck.add(hood);
    } else {
      u.neck.add(m(new THREE.SphereGeometry(0.13, seg(14), seg(8), 0, Math.PI * 2, 0, Math.PI / 2), steel(), 0, 0.14, 0));
      u.neck.add(m(new THREE.CylinderGeometry(0.22, 0.22, 0.02, seg(18)), steel(), 0, 0.14, 0));
    }
  }
  if (kind === 'swaard' || kind === 'ridder') {
    const sh = knight ? kiteShield(team) : roundShield(team);
    sh.position.set(-0.05, -0.38, 0.16);
    sh.rotation.y = -0.15;
    u.shL.add(sh);
    u.shL.rotation.set(-0.55, 0, -0.25);
    const sw = sword();
    sw.position.set(0, -0.6, 0.02);
    u.shR.add(sw);
    u.shR.rotation.set(knight ? -0.2 : -0.5, 0, 0.18);
  } else if (kind === 'spies') {
    const sh = roundShield(team);
    sh.position.set(-0.05, -0.38, 0.16);
    u.shL.add(sh);
    u.shL.rotation.set(-0.55, 0, -0.25);
    const sp = spear();
    sp.position.set(0, -0.58, 0.04);
    u.shR.add(sp);
    u.shR.rotation.set(-0.25, 0, 0.12);
  } else if (kind === 'boog') {
    const b = bow();
    b.position.set(0, -0.6, 0.05);
    u.shL.add(b);
    u.shL.rotation.set(-1.45, 0.25, 0.1);
    u.shR.rotation.set(-1.35, -0.5, -0.35);
    const q = quiver();
    q.position.set(0.12, 1.25, -0.22);
    q.rotation.z = -0.35;
    u.body.add(q);
  }
  u.kind = kind;
  u.pose = 'kit';
  return p;
}

/** A block of soldiers: `rows` x `cols` facing `face` (radians), spaced `gap` metres, a little ragged. */
export function formation(kind, team, rows, cols, gap, rand, face = Math.PI) {
  const g = new THREE.Group();
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = soldier(kind, team, rand);
      s.position.set((c - (cols - 1) / 2) * gap + (rand() - 0.5) * 0.35, 0, r * gap + (rand() - 0.5) * 0.35);
      s.rotation.y = face + (rand() - 0.5) * 0.15;
      g.add(s);
      out.push(s);
    }
  }
  g.userData.men = out;
  return g;
}

// ------------------------------------------------------------------------------------------------ machinery
/** A beam (timber box) between two points. */
function beam(a, b, size, material) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const o = new THREE.Mesh(new THREE.BoxGeometry(size, len, size), material);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  o.castShadow = o.receiveShadow = true;
  return o;
}

/** A counterweight trebuchet throwing towards -z. `arm`: the arm's turn (0.85 cocked: the long end low at the back, the
 * counterweight up at the front; about -2 thrown: the long end up and forward). userData: { pivot, cw, ropes, stone, axleY }. */
export function trebuchet(mats, team, { arm = 0.85, fired = false } = {}) {
  const g = new THREE.Group();
  const T = mats.timber;
  const axleY = 6.4;
  for (const x of [-1.5, 1.5]) {
    g.add(beam(new THREE.Vector3(x, 0.3, 4.2), new THREE.Vector3(x, 0.3, -4.2), 0.42, T));
    g.add(beam(new THREE.Vector3(x, 0.4, 3.4), new THREE.Vector3(x, axleY, 0), 0.34, T));
    g.add(beam(new THREE.Vector3(x, 0.4, -3.4), new THREE.Vector3(x, axleY, 0), 0.34, T));
    g.add(beam(new THREE.Vector3(x, 2.6, 2.0), new THREE.Vector3(x, 2.6, -2.0), 0.26, T));
    for (const z of [3.4, -3.4]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, seg(16)), T);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x * 1.18, 0.62, z);
      wheel.castShadow = true;
      g.add(wheel);
    }
  }
  for (const z of [3.6, -3.6, 0.9, -0.9]) g.add(beam(new THREE.Vector3(-1.5, z === 0.9 || z === -0.9 ? 2.6 : 0.42, z), new THREE.Vector3(1.5, z === 0.9 || z === -0.9 ? 2.6 : 0.42, z), 0.26, T));
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.6, seg(12)), mats.iron);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = axleY;
  g.add(axle);
  // the arm: long end to the back (+z) when cocked, the counterweight raised at the front
  const pivot = new THREE.Group();
  pivot.position.y = axleY;
  pivot.rotation.x = arm;
  g.add(pivot);
  const long = 8.4;
  const short = 2.4;
  pivot.add(beam(new THREE.Vector3(0, 0, -short), new THREE.Vector3(0, 0, long), 0.36, T));
  for (const z of [-short + 0.3, 1.5, 4.5]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.14), mats.iron);
    band.position.set(0, 0, z);
    pivot.add(band);
  }
  // the counterweight box hangs straight down from the short end
  const cw = new THREE.Group();
  cw.position.set(0, 0, -short);
  cw.rotation.x = -arm;
  const box = stoneBox(1.9, 1.7, 1.7, T);
  box.position.set(0, -2.4, 0);
  cw.add(box);
  for (const y of [-2.2, -1.2]) { const b = stoneBox(1.96, 0.12, 1.76, mats.iron); b.position.set(0, y, 0); cw.add(b); }
  for (const s of [-1, 1]) cw.add(beam(new THREE.Vector3(s * 0.8, 0, 0), new THREE.Vector3(s * 0.8, -0.75, 0), 0.12, mats.iron));
  pivot.add(cw);
  // the sling: two ropes from the long end to a pouch with the stone, lying in the trough behind (fired: hanging empty)
  const tip = new THREE.Vector3(0, 0, long).applyAxisAngle(new THREE.Vector3(1, 0, 0), arm).add(new THREE.Vector3(0, axleY, 0));
  if (fired) {
    for (const sx of [-0.12, 0.12]) g.add(beam(tip.clone().add(new THREE.Vector3(sx, 0, 0)), tip.clone().add(new THREE.Vector3(sx * 0.4, -2.6, 0.5)), 0.035, mats.rope));
    const trough = stoneBox(0.9, 0.2, 3.2, T);
    trough.position.set(0, 0.45, 5.2);
    g.add(trough);
    g.userData = { pivot, cw, ropes: [], axleY, long, short };
    return g;
  }
  const pouch = new THREE.Vector3(0, 0.9, tip.z + 1.6);
  const ropes = [-0.12, 0.12].map((s) => { const r = beam(tip.clone().add(new THREE.Vector3(s, 0, 0)), pouch.clone().add(new THREE.Vector3(s, 0.2, 0)), 0.035, mats.rope); g.add(r); return r; });
  const stone = shot(0.36);
  stone.position.copy(pouch).add(new THREE.Vector3(0, 0.35, 0));
  g.add(stone);
  const trough = stoneBox(0.9, 0.2, 3.2, T);
  trough.position.set(0, 0.45, tip.z + 1.2);
  g.add(trough);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color: TEAM[team].main, side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(1.95, 2.3, -3.4);
  const pole = beam(new THREE.Vector3(1.6, 0.5, -3.4), new THREE.Vector3(1.6, 2.8, -3.4), 0.06, T);
  g.add(flag, pole);
  g.userData = { pivot, cw, ropes, stone, axleY, long, short };
  return g;
}

/** A battering ram under a roof of hides on four wheels, heading -z. */
export function ram(mats, team) {
  const g = new THREE.Group();
  const T = mats.timber;
  for (const x of [-1.25, 1.25]) {
    g.add(beam(new THREE.Vector3(x, 0.8, 3), new THREE.Vector3(x, 0.8, -3), 0.3, T));
    for (const z of [2.6, -2.6]) {
      g.add(beam(new THREE.Vector3(x, 0.8, z), new THREE.Vector3(x * 0.25, 3.3, z), 0.22, T));
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.24, seg(16)), T);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x * 1.2, 0.62, z);
      wheel.castShadow = true;
      g.add(wheel);
    }
  }
  // the roof of hides
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 6.4), mats.hide);
    roof.position.set(s * 0.72, 2.4, 0);
    roof.rotation.z = s * 0.95;
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);
  }
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 6.6, seg(12)), T);
  log.rotation.x = Math.PI / 2;
  log.position.set(0, 1.5, -0.6);
  log.castShadow = true;
  g.add(log);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, seg(10)), mats.iron);
  head.rotation.x = Math.PI;
  head.position.set(0, -3.6, 0);   // (on the log's front end: it swings with the log)
  log.add(head);
  g.userData.log = log;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), new THREE.MeshStandardMaterial({ color: TEAM[team].main, side: THREE.DoubleSide }));
  banner.position.set(0, 3.6, 2.8);
  g.add(banner, beam(new THREE.Vector3(0, 3.0, 2.9), new THREE.Vector3(0, 4.2, 2.9), 0.05, T));
  return g;
}

/** A rough stone shot. */
export function shot(r = 0.36) {
  const geo = new THREE.DodecahedronGeometry(r, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.88 + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.2;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const o = new THREE.Mesh(geo, mat('#8c8478', 0.95));
  o.castShadow = true;
  return o;
}

// ------------------------------------------------------------------------------------------- the defence's pieces
/** Boiling oil over the gate: an iron pot on a timber frame, a glow under it, steam above (`pour()` tips it). */
export function cauldron(mats) {
  const g = new THREE.Group();
  const pot = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.7, seg(18), seg(12), 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), mats.iron);
  bowl.castShadow = true;
  const oil = new THREE.Mesh(new THREE.CircleGeometry(0.62, 18), new THREE.MeshBasicMaterial({ color: '#ffb547' }));
  oil.rotation.x = -Math.PI / 2;
  oil.position.y = 0.16;
  pot.add(bowl, oil);
  pot.position.set(0, 0.95, 0.4);
  g.add(pot);
  for (const s of [-1, 1]) g.add(beam(new THREE.Vector3(s * 1.0, 0, 0.4), new THREE.Vector3(s * 0.75, 1.4, 0.4), 0.14, mats.timber));
  g.add(beam(new THREE.Vector3(-0.85, 1.35, 0.4), new THREE.Vector3(0.85, 1.35, 0.4), 0.12, mats.iron));
  const glow = new THREE.PointLight('#ff8a2a', 10, 7, 1.8);
  glow.position.set(0, 0.4, 0.4);
  g.add(glow);
  g.userData = { pot, kind: 'olie' };
  return g;
}

/** A ballista: a great crossbow on a turning stand (faces +z). */
export function ballista(mats, team) {
  const g = new THREE.Group();
  const T = mats.timber;
  g.add(beam(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.1, 0), 0.3, T));
  const head = new THREE.Group();
  head.position.y = 1.15;
  head.add(beam(new THREE.Vector3(0, 0, -1.3), new THREE.Vector3(0, 0, 1.4), 0.24, T));
  for (const s of [-1, 1]) head.add(beam(new THREE.Vector3(0, 0, 1.0), new THREE.Vector3(s * 1.5, 0.12, 0.5), 0.14, T));
  head.add(beam(new THREE.Vector3(-1.5, 0.12, 0.5), new THREE.Vector3(0, 0.05, -0.9), 0.025, mats.rope));
  head.add(beam(new THREE.Vector3(1.5, 0.12, 0.5), new THREE.Vector3(0, 0.05, -0.9), 0.025, mats.rope));
  const bolt = beam(new THREE.Vector3(0, 0.18, -0.9), new THREE.Vector3(0, 0.18, 1.6), 0.06, T);
  head.add(bolt);
  const tipM = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, seg(8)), mats.iron);
  tipM.rotation.x = Math.PI / 2;
  tipM.position.set(0, 0.18, 1.75);
  head.add(tipM);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshStandardMaterial({ color: TEAM[team].main, side: THREE.DoubleSide }));
  flag.position.set(0, 0.75, -1.1);
  head.add(flag, beam(new THREE.Vector3(0, 0, -1.1), new THREE.Vector3(0, 0.95, -1.1), 0.04, T));
  g.add(head);
  g.userData = { head, kind: 'ballista' };
  return g;
}

/** Sharpened stakes in a row, leaning out towards the attacker (+z). */
export function spikes(mats) {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const st = new THREE.Mesh(new THREE.ConeGeometry(0.16, 2.2, seg(6)), mats.timber);
    st.position.set(-2.7 + i * 0.9, 0.75, 0);
    st.rotation.x = 0.75;
    st.castShadow = true;
    g.add(st);
  }
  g.add(beam(new THREE.Vector3(-3, 0.35, -0.35), new THREE.Vector3(3, 0.35, -0.35), 0.16, mats.timber));
  g.userData = { kind: 'pieke' };
  return g;
}
