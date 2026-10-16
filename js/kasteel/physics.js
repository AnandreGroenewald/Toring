// (1.17 3D) Die Kasteelreeks: real physics for a siege (cannon-es). Every block of every tower is a body that sleeps
// where it was stacked until something hits it; walls and the gatehouse are fixed; the trebuchet's stone is a heavy
// ball. A block keeps its Daily Tower shape (L, J and T as two boxes; a wedge as a box of its mean width), and its
// weight follows its stone: granite (Perfek) heaviest, sandstone, timber lightest. Meshes follow their bodies.
import * as THREE from '../../lib/three.module.min.js';
import * as CANNON from '../../lib/cannon-es.js';
import { SHAPES } from './castle.js';

const PX = 25;
// the bodies' boxes per shape (game px, top-left origin, y down), as in js/game/blocks.js
const PARTS = {
  L: [[0, 44, 132, 44], [0, 0, 44, 44]],
  J: [[0, 44, 132, 44], [88, 0, 44, 44]],
  T: [[0, 0, 132, 44], [44, 44, 44, 44]],
  wedge: [[15, 0, 120, 60]],
};
const DENSITY = { P: 3.0, G: 2.4, S: 0.9 };
const MASS = 16;   // (game weight per m³ of density 1: stones knock blocks about, blocks still feel heavy)

export function createPhysics({ gravity = -16 } = {}) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, gravity, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 14;
  world.solver.tolerance = 0.0005;
  const stoneM = new CANNON.Material('stone');
  world.defaultContactMaterial.friction = 0.62;
  world.defaultContactMaterial.restitution = 0.04;
  world.addContactMaterial(new CANNON.ContactMaterial(stoneM, stoneM, { friction: 0.7, restitution: 0.03 }));
  const ground = new CANNON.Body({ mass: 0, material: stoneM });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  const links = [];   // { body, mesh, com: Vector3, home: Vector3, homeQ: Quaternion, vol }
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  /** A tower block (its mesh already in world space, bottom-centre origin). `S`: castle scale; `D`: its depth. */
  function addBlock(mesh, b, S, D) {
    const def = SHAPES[b.shape] || SHAPES.plank;
    const H = (def.h / PX) * S;
    const W = (def.w / PX) * S;
    const rects = (PARTS[b.shape] || [[0, 0, def.w, def.h]]).map(([x, y, w, h]) => ({
      cx: ((x + w / 2) / PX) * S - W / 2, cy: ((def.h - (y + h / 2)) / PX) * S, hw: ((w / PX) * S) / 2, hh: ((h / PX) * S) / 2,
    }));
    let area = 0;
    let ax = 0;
    let ay = 0;
    for (const r of rects) { const a = r.hw * r.hh * 4; area += a; ax += r.cx * a; ay += r.cy * a; }
    const com = new THREE.Vector3(ax / area, ay / area, 0);
    const vol = area * D;
    const body = new CANNON.Body({ mass: vol * (DENSITY[b.rating] || 2.4) * MASS, material: stoneM, allowSleep: true, sleepSpeedLimit: 0.18, sleepTimeLimit: 0.6, linearDamping: 0.02, angularDamping: 0.06 });
    for (const r of rects) body.addShape(new CANNON.Box(new CANNON.Vec3(r.hw, r.hh, D / 2)), new CANNON.Vec3(r.cx - com.x, r.cy - com.y, 0));
    mesh.updateMatrixWorld();
    mesh.getWorldQuaternion(tmpQ);
    mesh.getWorldPosition(tmpV);
    tmpV.add(com.clone().applyQuaternion(tmpQ));
    body.position.set(tmpV.x, tmpV.y, tmpV.z);
    body.quaternion.set(tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w);
    world.addBody(body);
    body.sleep();
    const link = { body, mesh, com, home: tmpV.clone(), homeQ: tmpQ.clone(), vol, block: b };
    body.link = link;
    links.push(link);
    return link;
  }
  /** A small loose piece (a merlon): a box `w x h x d` whose mesh has its origin at the bottom centre. */
  function addPiece(mesh, w, h, d, density = 2.4) {
    const com = new THREE.Vector3(0, h / 2, 0);
    const body = new CANNON.Body({ mass: w * h * d * density * MASS, material: stoneM, allowSleep: true, sleepSpeedLimit: 0.2, sleepTimeLimit: 0.5 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    mesh.updateMatrixWorld();
    mesh.getWorldQuaternion(tmpQ);
    mesh.getWorldPosition(tmpV);
    tmpV.add(com.clone().applyQuaternion(tmpQ));
    body.position.set(tmpV.x, tmpV.y, tmpV.z);
    body.quaternion.set(tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w);
    world.addBody(body);
    body.sleep();
    const link = { body, mesh, com, home: tmpV.clone(), homeQ: tmpQ.clone(), vol: w * h * d, piece: true };
    body.link = link;
    links.push(link);
    return link;
  }
  /** A fixed box (walls, the gatehouse): centre, half sizes, the y rotation. */
  function addStatic(cx, cy, cz, hx, hy, hz, ry = 0) {
    const body = new CANNON.Body({ mass: 0, material: stoneM });
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    body.position.set(cx, cy, cz);
    body.quaternion.setFromEuler(0, ry, 0);
    world.addBody(body);
    return body;
  }
  /** The trebuchet's stone: a heavy ball. */
  function addStone(mesh, r, pos, vel) {
    const body = new CANNON.Body({ mass: 1800, material: stoneM, linearDamping: 0, angularDamping: 0.1, allowSleep: false });
    body.addShape(new CANNON.Sphere(r));
    body.position.set(pos.x, pos.y, pos.z);
    body.velocity.set(vel.x, vel.y, vel.z);
    body.angularVelocity.set(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3);
    world.addBody(body);
    const link = { body, mesh, com: new THREE.Vector3(), stone: true };
    body.link = link;
    links.push(link);
    return link;
  }
  function remove(link) {
    world.removeBody(link.body);
    const i = links.indexOf(link);
    if (i >= 0) links.splice(i, 1);
  }
  /** Meshes follow their bodies (only the ones awake, and the stones). */
  function sync() {
    for (const l of links) {
      const b = l.body;
      if (b.sleepState === CANNON.Body.SLEEPING && !l.stone && !l.dirty) continue;
      l.dirty = b.sleepState !== CANNON.Body.SLEEPING;
      tmpQ.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      l.mesh.quaternion.copy(tmpQ);
      tmpV.copy(l.com).applyQuaternion(tmpQ);
      l.mesh.position.set(b.position.x - tmpV.x, b.position.y - tmpV.y, b.position.z - tmpV.z);
    }
  }
  /** How far a block is from where it was stacked (metres moved, degrees turned). */
  function displaced(l) {
    const b = l.body;
    const d = Math.hypot(b.position.x - l.home.x, b.position.y - l.home.y, b.position.z - l.home.z);
    tmpQ.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const ang = (2 * Math.acos(Math.min(1, Math.abs(tmpQ.dot(l.homeQ))))) * (180 / Math.PI);
    return { d, ang };
  }
  return { world, CANNON, links, addBlock, addPiece, addStatic, addStone, remove, sync, displaced, step: (dt) => world.step(1 / 60, dt, 4) };
}
