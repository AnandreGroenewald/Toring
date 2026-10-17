// (1.17 3D) Die Kasteelreeks: real physics for a siege (cannon-es). A tower stands as its Daily Tower was built: its
// blocks CEMENTED into one fixed body (in Stapel a Perfek turns everything below it to cement), so a tower no longer
// falls apart the moment anything touches it. A trebuchet stone breaks out the blocks around where it hits (granite
// holds best, timber worst) and those fly; what is left is re-cemented by what still holds together: a part still
// joined to the ground stays standing; a part cut loose falls as one piece and breaks up where it lands. Walls and the
// gatehouse are fixed; merlons and the gate's doors are loose pieces; the stone is a heavy ball. Meshes follow bodies.
// (17 Oct 2026, the owner: "the ball on the tower is way too easy it breaks to whole defence": loose stacks woke and
// collapsed under any hit, whatever the stone weighed.)
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
// how hard a block is to break out of its cement (a bite's reach is multiplied by this): granite holds, timber splinters
const TOUGH = { P: 0.62, G: 1, S: 1.3 };
export const BITE = Object.freeze({ radius: 2.1, push: 7, landShatter: 6.5 });

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
  // links: one per block / piece / stone: { body, mesh, com (its mesh's centre of mass, mesh-local), local: { p, q } (its
  // place in its body), home, homeQ (where it was built), vol, ... }. A block's world pose = its body's pose x local.
  const links = [];
  const chunks = new Set();
  const broken = new Set();   // towers a stone (or a fall) has broken into
  const queue = [];           // breaks asked for during a step (bodies can't change mid-step)
  let onBody = null;          // (each new body: the siege listens to its knocks)
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const ID_Q = new THREE.Quaternion();
  const ZERO = new THREE.Vector3();

  /** A block's world pose (its centre of mass and turn) into `p` and `q`. */
  function poseOf(l, p = new THREE.Vector3(), q = new THREE.Quaternion()) {
    const b = l.body;
    q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    p.copy(l.local.p).applyQuaternion(q);
    p.x += b.position.x;
    p.y += b.position.y;
    p.z += b.position.z;
    q.multiply(l.local.q);
    return { p, q };
  }
  const posOf = (l, out = new THREE.Vector3()) => poseOf(l, out, tmpQ).p;

  /** A block's boxes (its own frame, about its centre of mass), weight and volume. */
  function blockShape(b, S, D) {
    const def = SHAPES[b.shape] || SHAPES.plank;
    const sx = Number.isFinite(b.scale) ? b.scale : 1;
    const sy = def.u ? sx : 1;
    const W = ((def.w * sx) / PX) * S;
    const rects = (PARTS[b.shape] || [[0, 0, def.w, def.h]]).map(([x, y, w, h]) => ({
      cx: (((x + w / 2) * sx) / PX) * S - W / 2, cy: (((def.h - (y + h / 2)) * sy) / PX) * S, hw: (((w * sx) / PX) * S) / 2, hh: (((h * sy) / PX) * S) / 2,
    }));
    let area = 0;
    let ax = 0;
    let ay = 0;
    for (const r of rects) { const a = r.hw * r.hh * 4; area += a; ax += r.cx * a; ay += r.cy * a; }
    const com = new THREE.Vector3(ax / area, ay / area, 0);
    const vol = area * D;
    return {
      com, vol, mass: vol * (DENSITY[b.rating] || 2.4) * MASS,
      boxes: rects.map((r) => ({ off: new THREE.Vector3(r.cx - com.x, r.cy - com.y, 0), he: [r.hw, r.hh, D / 2] })),
    };
  }
  function newBody(mass, fixed) {
    return new CANNON.Body({
      mass: fixed ? 0 : mass, type: fixed ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC, material: stoneM,
      allowSleep: true, sleepSpeedLimit: 0.18, sleepTimeLimit: 0.6, linearDamping: 0.02, angularDamping: 0.08,
    });
  }
  function addBoxes(body, l, at, q) {
    for (const x of l.boxes) {
      const o = x.off.clone().applyQuaternion(q).add(at);
      body.addShape(new CANNON.Box(new CANNON.Vec3(...x.he)), new CANNON.Vec3(o.x, o.y, o.z), new CANNON.Quaternion(q.x, q.y, q.z, q.w));
    }
  }
  /** The velocity of `body` at world point `p` (a piece breaking off a moving body keeps its share of the motion). */
  function velAt(body, p) {
    if (!body || body.type === CANNON.Body.STATIC) return new THREE.Vector3();
    const r = new THREE.Vector3(p.x - body.position.x, p.y - body.position.y, p.z - body.position.z);
    const w = new THREE.Vector3(body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z);
    return new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z).add(w.cross(r));
  }
  function born(body) {
    world.addBody(body);
    onBody?.(body);
    return body;
  }

  /** Blocks cemented together (`fixed`: standing on the ground, never moving; else one falling piece). */
  function makeChunk(ls, fixed, tower, from = null) {
    const poses = ls.map((l) => poseOf(l, new THREE.Vector3(), new THREE.Quaternion()));
    let M = 0;
    const c = new THREE.Vector3();
    ls.forEach((l, i) => { M += l.mass; c.addScaledVector(poses[i].p, l.mass); });
    c.divideScalar(M);
    const body = newBody(M, fixed);
    body.position.set(c.x, c.y, c.z);
    ls.forEach((l, i) => {
      const off = poses[i].p.clone().sub(c);
      addBoxes(body, l, off, poses[i].q);
      l.local = { p: off, q: poses[i].q.clone() };
      l.body = body;
      l.dirty = !fixed;
    });
    body.updateMassProperties();
    if (!fixed) {
      const v = velAt(from, c);
      body.velocity.set(v.x, v.y, v.z);
      if (from && from.type !== CANNON.Body.STATIC) body.angularVelocity.copy(from.angularVelocity);
    }
    const chunk = { body, links: ls, fixed, tower };
    body.chunk = chunk;
    for (const l of ls) l.chunk = chunk;
    chunks.add(chunk);
    born(body);
    if (!fixed) {
      // a falling piece breaks up where it lands
      body.addEventListener('collide', (e) => {
        const v = Math.abs(e.contact?.getImpactVelocityAlongNormal?.() || 0);
        if (v > BITE.landShatter && chunks.has(chunk)) queue.push({ shatter: chunk });
      });
    }
    return chunk;
  }
  /** One block on its own (broken loose), moving with `vel`. */
  function makeLoose(l, vel = ZERO) {
    const { p, q } = poseOf(l, new THREE.Vector3(), new THREE.Quaternion());
    const body = newBody(l.mass, false);
    addBoxes(body, l, ZERO, ID_Q);
    body.position.set(p.x, p.y, p.z);
    body.quaternion.set(q.x, q.y, q.z, q.w);
    body.updateMassProperties();
    body.velocity.set(vel.x, vel.y, vel.z);
    body.angularVelocity.set(Math.random() * 3 - 1.5, Math.random() * 3 - 1.5, Math.random() * 3 - 1.5);
    body.link = l;
    l.local = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    l.body = body;
    l.chunk = null;
    l.loose = true;
    l.dirty = true;
    born(body);
    return body;
  }
  /** Groups of `ls` that still hold together (neighbours by touch, as they were built). */
  function groups(ls) {
    const left = new Set(ls);
    const out = [];
    for (const s of ls) {
      if (!left.has(s)) continue;
      left.delete(s);
      const g = [s];
      for (let i = 0; i < g.length; i++) for (const n of g[i].nb) if (left.has(n)) { left.delete(n); g.push(n); }
      out.push(g);
    }
    return out;
  }
  /**
   * A bite out of a cemented body at `at` (a stone's hit, soldiers' picks): the blocks within reach (by their stone)
   * fly loose; the rest is re-cemented by what holds together. Returns the blocks that broke loose.
   */
  function fracture(chunk, at, { radius = BITE.radius, push = BITE.push, dir = null, topple = null } = {}) {
    if (!chunks.has(chunk)) return [];
    const poses = chunk.links.map((l) => posOf(l));
    let out = [];
    const rest = [];
    chunk.links.forEach((l, i) => {
      const d = poses[i].distanceTo(at);
      (d < radius * (TOUGH[l.block?.rating] || 1) ? out : rest).push(l);
    });
    if (!out.length) {
      // (always the block that was hit, the nearest)
      let best = 0;
      poses.forEach((p, i) => { if (p.distanceTo(at) < poses[best].distanceTo(at)) best = i; });
      out = [chunk.links[best]];
      rest.splice(rest.indexOf(chunk.links[best]), 1);
    }
    const old = chunk.body;
    chunks.delete(chunk);
    world.removeBody(old);
    if (chunk.tower != null) broken.add(chunk.tower);
    for (const l of out) {
      const p = posOf(l);
      const v = velAt(old, p).add(p.clone().sub(at).normalize().multiplyScalar(push * 0.7));
      if (dir) v.addScaledVector(dir, push * 0.5);
      v.y += push * 0.25;
      makeLoose(l, v);
    }
    for (const g of groups(rest)) {
      const fixed = chunk.fixed && g.some((l) => l.grounded);
      if (g.length === 1 && !fixed) { makeLoose(g[0], velAt(old, posOf(g[0]))); continue; }
      const ch = makeChunk(g, fixed, chunk.tower, old);
      // (a part cut loose leans over the way it was struck, and falls)
      if (!fixed && topple) {
        const d = topple.clone().setY(0).normalize();
        const w = new THREE.Vector3(0, 1, 0).cross(d).multiplyScalar(0.75);
        ch.body.angularVelocity.set(ch.body.angularVelocity.x + w.x, ch.body.angularVelocity.y + w.y, ch.body.angularVelocity.z + w.z);
        ch.body.velocity.x += d.x * 1.2;
        ch.body.velocity.z += d.z * 1.2;
      }
    }
    wakeTower(chunk.tower);
    return out;
  }
  /** A piece breaks up into its blocks (it landed hard). */
  function shatter(chunk) {
    if (!chunks.has(chunk)) return;
    const old = chunk.body;
    chunks.delete(chunk);
    world.removeBody(old);
    for (const l of chunk.links) makeLoose(l, velAt(old, posOf(l)));
    wakeTower(chunk.tower);
  }
  /** (loose pieces resting on a tower: awake, so nothing hangs in the air where a block was) */
  function wakeTower(ti) {
    for (const l of links) if (l.tower === ti && l.body.type !== CANNON.Body.STATIC) l.body.wakeUp();
  }

  /**
   * A tower: `items` [{ mesh, b, S, D }] in world space (bottom-centre origin each), cemented into one fixed body.
   * Returns its block links (with `tower`, `home`, `vol`, `block`).
   */
  function addTower(items, tower) {
    const ls = items.map(({ mesh, b, S, D }) => {
      const sh = blockShape(b, S, D);
      mesh.updateMatrixWorld();
      const q = mesh.getWorldQuaternion(new THREE.Quaternion());
      const p = mesh.getWorldPosition(new THREE.Vector3()).add(sh.com.clone().applyQuaternion(q));
      const box = new THREE.Box3().setFromObject(mesh).expandByScalar(0.08);
      const l = {
        mesh, block: b, com: sh.com, boxes: sh.boxes, mass: sh.mass, vol: sh.vol, tower,
        home: p.clone(), homeQ: q.clone(), box, grounded: box.min.y < 0.2, nb: new Set(),
        body: { position: p, quaternion: q }, local: { p: new THREE.Vector3(), q: new THREE.Quaternion() },
      };
      return l;
    });
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
      if (ls[i].box.intersectsBox(ls[j].box)) { ls[i].nb.add(ls[j]); ls[j].nb.add(ls[i]); }
    }
    // (nothing touches the ground? the lowest block is the foundation)
    if (ls.length && !ls.some((l) => l.grounded)) ls.reduce((a, l) => (l.box.min.y < a.box.min.y ? l : a)).grounded = true;
    for (const l of ls) links.push(l);
    // (a tower in pieces that don't touch, as some Daily Towers are: each piece cemented on its own)
    for (const g of groups(ls)) makeChunk(g, g.some((l) => l.grounded), tower);
    return ls;
  }

  /** A small loose piece (a merlon, a door): a box `w x h x d` whose mesh has its origin at the bottom centre. */
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
    born(body);
    body.sleep();
    const link = { body, mesh, com, local: { p: new THREE.Vector3(), q: new THREE.Quaternion() }, home: tmpV.clone(), homeQ: tmpQ.clone(), vol: w * h * d, piece: true };
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
  /** The trebuchet's stone: a heavy ball. It bites into what it hits (at most twice) and carries on, slower. */
  function addStone(mesh, r, pos, vel) {
    const body = new CANNON.Body({ mass: 1800, material: stoneM, linearDamping: 0, angularDamping: 0.1, allowSleep: false });
    body.addShape(new CANNON.Sphere(r));
    body.position.set(pos.x, pos.y, pos.z);
    body.velocity.set(vel.x, vel.y, vel.z);
    body.angularVelocity.set(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3);
    world.addBody(body);
    const link = { body, mesh, com: new THREE.Vector3(), local: { p: new THREE.Vector3(), q: new THREE.Quaternion() }, stone: true, bites: 0, before: new THREE.Vector3(vel.x, vel.y, vel.z) };
    body.link = link;
    body.addEventListener('collide', (e) => {
      const ch = e.body.chunk;
      if (!ch || link.bites >= 2 || !chunks.has(ch)) return;
      const speed = link.before.length();
      if (speed < 8) return;
      const c = e.contact;
      const self = c.bi === body;
      const at = new THREE.Vector3(body.position.x, body.position.y, body.position.z)
        .add(new THREE.Vector3(self ? c.ri.x : c.rj.x, self ? c.ri.y : c.rj.y, self ? c.ri.z : c.rj.z));
      link.bites += 1;
      queue.push({ chunk: ch, at, stone: link, radius: BITE.radius * (link.bites === 1 ? 1 : 0.7) * Math.min(1.15, speed / 38) });
    });
    links.push(link);
    return link;
  }
  function remove(link) {
    world.removeBody(link.body);
    const i = links.indexOf(link);
    if (i >= 0) links.splice(i, 1);
  }
  /** Meshes follow their bodies (only the ones that move, and the stones). */
  function sync() {
    for (const l of links) {
      const b = l.body;
      if (!l.stone && !l.dirty && (b.type === CANNON.Body.STATIC || b.sleepState === CANNON.Body.SLEEPING)) continue;
      l.dirty = b.type !== CANNON.Body.STATIC && b.sleepState !== CANNON.Body.SLEEPING;
      const { p, q } = poseOf(l, tmpV, tmpQ);
      l.mesh.quaternion.copy(q);
      const c = l.com.clone().applyQuaternion(q);
      l.mesh.position.set(p.x - c.x, p.y - c.y, p.z - c.z);
    }
  }
  /** How far a block is from where it was built (metres moved, degrees turned). */
  function displaced(l) {
    const { p, q } = poseOf(l, tmpV, tmpQ);
    const d = p.distanceTo(l.home);
    const ang = (2 * Math.acos(Math.min(1, Math.abs(q.dot(l.homeQ))))) * (180 / Math.PI);
    return { d, ang };
  }
  /** The breaks asked for during the step: the stone's bites (it carries on through, slower) and hard landings. */
  function settle() {
    while (queue.length) {
      const job = queue.shift();
      if (job.shatter) { shatter(job.shatter); continue; }
      const dir = job.stone ? job.stone.before.clone().normalize() : null;
      fracture(job.chunk, job.at, { radius: job.radius, dir, topple: dir });
      if (job.stone) {
        const v = job.stone.before.clone().multiplyScalar(0.42);
        job.stone.body.velocity.set(v.x, v.y, v.z);
      }
    }
  }
  function step(dt) {
    for (const l of links) if (l.stone) l.before.set(l.body.velocity.x, l.body.velocity.y, l.body.velocity.z);
    world.step(1 / 60, dt, 4);
    settle();
  }
  return {
    world, CANNON, links, chunks, broken,
    addTower, addPiece, addStatic, addStone, remove, sync, displaced, posOf, poseOf, fracture, shatter, step,
    /** (each new body: `fn(body)`) */
    set onBody(fn) { onBody = fn; },
    /** Is block `l` still cemented in its standing tower? */
    standing: (l) => !!l.chunk?.fixed,
  };
}
