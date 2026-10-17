// (1.17 3D) Die Kasteelreeks: many soldiers, smoothly. Each kind of soldier (per side, in two looks) is baked once into
// a few parts, one per joint (body, head, each arm, each leg) and finish (cloth or steel), with its colours in the
// vertices; every soldier on the field is then one instance of those parts. A soldier is a small record (where, which
// way, what he is doing); each frame his joints are posed on the shared skeleton and copied into the instances, so a
// hundred men cost about a hundred draw calls in total, not thousands.
import * as THREE from '../../lib/three.module.min.js';
import { soldier } from './army.js';
import { rng } from './world.js';

const MATTE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
const METAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85 });
const BONES = ['root', 'body', 'neck', 'shL', 'shR', 'hipL', 'hipR'];

function merge(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** A soldier rig baked into per-joint parts; the rig keeps only its joints (the skeleton to pose). */
function bake(rig) {
  const u = rig.userData;
  const bones = { root: rig, body: u.body, neck: u.neck, shL: u.shL, shR: u.shR, hipL: u.hipL, hipR: u.hipR };
  const isBone = new Set(Object.values(bones));
  rig.updateMatrixWorld(true);
  const parts = [];
  for (const name of BONES) {
    const bone = bones[name];
    const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
    const lists = { matte: [], metal: [] };
    const walk = (o) => {
      for (const c of o.children) {
        if (isBone.has(c)) continue;
        if (c.isMesh) {
          const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
          const cc = c.material.color;
          const n = g.attributes.position.count;
          const arr = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { arr[i * 3] = cc.r; arr[i * 3 + 1] = cc.g; arr[i * 3 + 2] = cc.b; }
          g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
          (c.material.metalness > 0.5 ? lists.metal : lists.matte).push(g);
        }
        walk(c);
      }
    };
    walk(bone);
    for (const fin of ['matte', 'metal']) if (lists[fin].length) parts.push({ bone: name, finish: fin, geo: merge(lists[fin]) });
  }
  // the skeleton only, from here on
  for (const b of Object.values(bones)) for (const c of [...b.children]) if (!isBone.has(c)) b.remove(c);
  const base = {};
  for (const name of BONES) base[name] = { r: bones[name].rotation.clone(), p: bones[name].position.clone() };
  return { bones, parts, base };
}

const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * The crowd: `add(kind, team, x, z, opts)` puts a soldier on the field and returns his record
 * ({ kind, team, x, z, y (null: on the ground), heading, state: 'idle'|'walk'|'run'|'shoot'|'attack'|'fall'|'dead'|'gone' }).
 */
export function createCrowd(scene, groundY, { kinds = ['swaard', 'spies', 'boog', 'ridder'], teams = ['blue', 'red'], capacity = 40, looks = 2, seed = 3 } = {}) {
  const rand = rng(seed);
  const sets = new Map();
  for (const team of teams) {
    for (const kind of kinds) {
      for (let v = 0; v < looks; v++) {
        const rig = soldier(kind, team, rand);
        rig.rotation.order = 'YXZ';
        const baked = bake(rig);
        const inst = baked.parts.map((p) => {
          const im = new THREE.InstancedMesh(p.geo, p.finish === 'metal' ? METAL : MATTE, capacity);
          im.count = 0;
          im.castShadow = true;
          im.frustumCulled = false;
          scene.add(im);
          return { ...p, im };
        });
        sets.set(`${team}|${kind}|${v}`, { rig, ...baked, inst, members: [] });
      }
    }
  }
  const all = [];
  function pose(set, m, time) {
    const { rig, bones: B, base } = set;
    for (const name of BONES) { B[name].rotation.copy(base[name].r); B[name].position.copy(base[name].p); }
    const y = m.y ?? groundY(m.x, m.z);
    rig.position.set(m.x, y, m.z);
    rig.rotation.set(0, m.heading, 0);
    const ph = time * (m.state === 'run' ? 11 : 8.5) + m.t;
    if (m.state === 'walk' || m.state === 'run') {
      const a = m.state === 'run' ? 0.75 : 0.55;
      B.hipL.rotation.x = Math.sin(ph) * a;
      B.hipR.rotation.x = -Math.sin(ph) * a;
      B.body.position.y = Math.abs(Math.cos(ph)) * 0.06;
      B.body.rotation.x = m.state === 'run' ? 0.12 : 0.04;
      if (m.kind === 'boog') { B.shL.rotation.set(-0.3 - Math.sin(ph) * 0.3, 0, -0.1); B.shR.rotation.set(-0.2 + Math.sin(ph) * 0.3, 0, 0.1); }
      else B.shR.rotation.x = base.shR.r.x - Math.sin(ph) * 0.25;
    } else if (m.state === 'attack') {
      B.shR.rotation.x = -0.4 - Math.abs(Math.sin(time * 6 + m.t)) * 1.6;
      B.body.rotation.x = 0.1 + Math.sin(time * 6 + m.t) * 0.06;
    } else if (m.state === 'shoot') {
      const k = Math.max(0, 1 - (time - (m.shotAt || -9)) * 3);
      B.shR.rotation.x = base.shR.r.x + k * 0.6;
      B.neck.rotation.y = -0.15;
    } else if (m.state === 'fall') {
      // (he tumbles from the moment he fell, from upright: no jump to a turn the clock already ran up)
      const f = time - (m.fallAt ?? time);
      rig.rotation.set(m.spin * f, m.heading, m.spin * 0.6 * f);
    } else if (m.state === 'cheer') {
      // (the keep is theirs: arms up, a little hop)
      const k = Math.abs(Math.sin(time * 5.5 + m.t));
      B.shL.rotation.set(-2.75 + k * 0.3, 0, -0.35);
      B.shR.rotation.set(-2.75 + k * 0.3, 0, 0.35);
      B.body.position.y = k * 0.08;
      rig.position.y = y + k * 0.14;
    } else if (m.state === 'dead') {
      const f = Math.min(1, (time - (m.diedAt ?? time)) * 2.5);
      rig.rotation.set(1.45 * f, m.heading, 0.25 * f);
      rig.position.y = y + 0.18 * f;
      B.shL.rotation.set(-2.2 * f, 0, -0.5 * f);
      B.shR.rotation.set(-2.2 * f, 0, 0.5 * f);
    } else {
      B.body.position.y = Math.sin(time * 1.9 + m.t) * 0.012;
      B.neck.rotation.y = Math.sin(time * 0.45 + m.t) * 0.35;
    }
    rig.updateMatrixWorld(true);
  }
  return {
    all,
    add(kind, team, x, z, opts = {}) {
      const v = Math.floor(rand() * looks);
      const set = sets.get(`${team}|${kind}|${v}`) || sets.get(`${team}|${kind}|0`);
      if (!set || set.members.length >= capacity) return null;
      const m = { kind, team, x, z, y: null, heading: team === 'blue' ? Math.PI : 0, state: 'idle', t: rand() * 10, alive: true, hp: 1, ...opts };
      set.members.push(m);
      all.push(m);
      return m;
    },
    update(time) {
      for (const set of sets.values()) {
        const { members, inst, bones } = set;
        for (let i = 0; i < members.length; i++) {
          const m = members[i];
          if (m.state === 'gone') { for (const p of inst) p.im.setMatrixAt(i, HIDE); continue; }
          pose(set, m, time);
          for (const p of inst) p.im.setMatrixAt(i, bones[p.bone].matrixWorld);
        }
        for (const p of inst) { p.im.count = members.length; p.im.visible = members.length > 0; if (members.length) p.im.instanceMatrix.needsUpdate = true; }
      }
    },
  };
}
