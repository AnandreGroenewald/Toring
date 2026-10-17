// (1.18) Jou dorp in 3D (the owner, 17 Oct 2026: "the Your town feels like childs play"; his pick: rebuilt in 3D with
// Block Clash's tech). A town's island in Block Clash's sunset sea: a wide, low island with an uneven coast (not a
// circle), sandstone cliffs banded like the battle's sea stacks, a beach where it meets the sea, a grass top with paths
// worn into it, tufts, and boulders in the surf. `islandTopAt(x, z)` is the ground's height (the town stands on it).
import * as THREE from '../../lib/three.module.min.js';
import { rng, fbm } from '../kasteel/world.js';
import { merge } from '../botsing/world.js';

const lin = (hex) => new THREE.Color(hex);

/**
 * The island's outline: its radius at angle `a` (an uneven coast from the seed), its top `top` m above the sea.
 * Returns { group, radiusAt(a), top, cx, cz }.
 */
export function makeIsle({ cx = 0, cz = 0, radius = 34, top = 6, seed = 1, mats }) {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  const r = rng(seed);
  const off = seed * 13.7;
  const radiusAt = (a) => radius * (0.84 + 0.22 * fbm(Math.cos(a) * 1.3 + off, Math.sin(a) * 1.3 + off, 3) + 0.06 * Math.sin(a * 3 + off));
  // the cliff: a ring of rock from under the sea up to the top, the coast's outline at every height, widening below
  const SEG = 160;
  const ROWS = 26;
  const BOT = -14;
  const pos = [];
  const col = [];
  const idx = [];
  const cA = lin('#c49067');
  const cB = lin('#9d6b4c');
  const cWet = lin('#3b2a26');
  const cAlg = lin('#3d4a2a');
  const cMoss = lin('#6e8040');
  const tmp = new THREE.Color();
  for (let j = 0; j <= ROWS; j++) {
    const t = j / ROWS;
    const y = BOT + (top - BOT) * t;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const fromTop = top - y;
      const n1 = fbm(a * 2.3 + off, y * 0.16, 4) - 0.5;
      const n2 = fbm(a * 7.1 + off, y * 0.55, 3) - 0.5;
      const strata = Math.sin(y * 2.1 + n1 * 5) * 0.16 + Math.sin(y * 5.3 + n2 * 3) * 0.06;
      const edge = THREE.MathUtils.smoothstep(fromTop, 0, 1.4);
      // (the cliff leans out a little lower down, a beach shelf at the waterline)
      const shelf = THREE.MathUtils.smoothstep(-y, -1.6, 0.6) * 2.6;
      const rad = radiusAt(a) + fromTop * 0.12 + shelf + (n1 * 1.4 + n2 * 0.4 + strata) * edge;
      pos.push(Math.sin(a) * rad, y, Math.cos(a) * rad);
      const band = 0.5 + 0.5 * Math.sin(y * 1.7 + n1 * 4);
      tmp.copy(cA).lerp(cB, band * 0.8 + n2 * 0.4);
      const wet = 1 - THREE.MathUtils.smoothstep(y, 0.6, 2.4);
      tmp.lerp(cWet, wet * 0.75);
      tmp.lerp(cAlg, wet * THREE.MathUtils.smoothstep(y, -1.2, 0.8) * 0.5);
      tmp.lerp(cMoss, (1 - THREE.MathUtils.smoothstep(fromTop, 0.15, 0.9)) * 0.65);
      tmp.multiplyScalar(0.9 + n2 * 0.25);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i;
      const b = a + SEG + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);   // (facing out)
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const uv = [];
  for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= SEG; i++) uv.push((i / SEG) * 12, (j / ROWS) * 2.5);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const cliff = new THREE.Mesh(geo, mats.rock);
  cliff.castShadow = cliff.receiveShadow = true;
  group.add(cliff);
  // the top: a fan over the coast's outline, grass, gently domed
  const tp = [0, top + 0.5, 0];
  const tuv = [0.5, 0.5];
  const ti = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const rad = radiusAt(a) + 0.05;
    tp.push(Math.sin(a) * rad, top, Math.cos(a) * rad);
    tuv.push(0.5 + Math.sin(a) * 0.5 * (rad / radius), 0.5 + Math.cos(a) * 0.5 * (rad / radius));
    if (i) ti.push(0, i, i + 1);
  }
  // (a ring halfway so the dome is soft)
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv.map((v) => v * 6), 2));
  tg.setIndex(ti);
  tg.computeVertexNormals();
  const ground = new THREE.Mesh(tg, mats.grass);
  ground.receiveShadow = true;
  group.add(ground);
  // tufts and boulders, as on the sea stacks
  const tuft = merge([0, 1, 2, 3, 4].map((k) => {
    const c = new THREE.ConeGeometry(0.07, 0.6 + (k % 3) * 0.2, 4, 1);
    c.translate(0, 0.3, 0);
    c.rotateZ((k - 2) * 0.22);
    c.rotateY(k * 1.3);
    c.translate((k - 2) * 0.08, 0, ((k * 7) % 5 - 2) * 0.06);
    return c;
  }));
  const tufts = new THREE.InstancedMesh(tuft, mats.tuft, 260);
  const mtx = new THREE.Matrix4();
  let n = 0;
  for (let k = 0; k < 900 && n < 260; k++) {
    const a = r() * Math.PI * 2;
    const rr = radiusAt(a) * (0.6 + r() * 0.38);
    const s = 0.7 + r() * 1.1;
    mtx.compose(new THREE.Vector3(Math.sin(a) * rr, top, Math.cos(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, 0)), new THREE.Vector3(s, s, s));
    tufts.setMatrixAt(n++, mtx);
  }
  tufts.count = n;
  group.add(tufts);
  const bgeo = new THREE.IcosahedronGeometry(1, 1);
  const bp = bgeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(bp, i);
    const k = 0.78 + fbm(v.x * 1.7 + 3, v.y * 1.7 + v.z, 3) * 0.5;
    bp.setXYZ(i, v.x * k, v.y * k * 0.75, v.z * k);
  }
  bgeo.computeVertexNormals();
  const boulders = new THREE.InstancedMesh(bgeo, mats.boulder, 40);
  let b = 0;
  for (let k = 0; k < 300 && b < 40; k++) {
    const a = r() * Math.PI * 2;
    const rr = radiusAt(a) + 3 + r() * 4;
    const s = 0.8 + r() * 2;
    mtx.compose(new THREE.Vector3(Math.sin(a) * rr, -0.5 + r() * 0.7, Math.cos(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(r(), r() * 6, r())), new THREE.Vector3(s, s, s));
    boulders.setMatrixAt(b++, mtx);
  }
  boulders.count = b;
  boulders.castShadow = boulders.receiveShadow = true;
  group.add(boulders);
  return { group, radiusAt, top, cx, cz, radius };
}
