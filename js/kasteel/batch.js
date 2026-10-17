// (1.17 3D) Die Kasteelreeks on phones (the owner, 17 Oct 2026: "it needs to be optomised for phones, it should not lag").
// A phone pays for every separate piece it draws, twice with shadows. What doesn't move is welded into one piece per
// material: the walls, battlements and gatehouse always; each tower while all its blocks sleep. The moment a block of a
// tower wakes (a stone, a falling neighbour), that tower falls apart into its own blocks again, so the physics look the
// same. The originals stay in place, hidden: the rangefinder still finds them.
import * as THREE from '../../lib/three.module.min.js';

/** One geometry per material from `meshes` (in world space): position, normal and uv (when every piece has one). */
export function mergeByMaterial(meshes) {
  const groups = new Map();
  for (const m of meshes) {
    if (!m.isMesh || !m.geometry) continue;
    const list = groups.get(m.material) || [];
    list.push(m);
    groups.set(m.material, list);
  }
  const out = [];
  for (const [material, list] of groups) {
    let n = 0;
    const geos = list.map((m) => {
      m.updateWorldMatrix(true, false);
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
      n += g.attributes.position.count;
      return g;
    });
    const withUv = geos.every((g) => g.attributes.uv);
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = withUv ? new Float32Array(n * 2) : null;
    let o = 0;
    for (const g of geos) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (uv) uv.set(g.attributes.uv.array, o * 2);
      o += c;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = list.some((m) => m.castShadow);
    mesh.receiveShadow = list.some((m) => m.receiveShadow);
    mesh.matrixAutoUpdate = false;
    out.push(mesh);
  }
  return out;
}

/**
 * Welds the still meshes under `root` (walls, battlements, gatehouse: whatever `take(mesh)` accepts) into a few pieces
 * added to `scene`; the originals are hidden. Returns the welded pieces.
 */
export function weldStill(root, scene, take) {
  const picked = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => { if (o.isMesh && o.visible && take(o)) picked.push(o); });
  const welded = mergeByMaterial(picked);
  for (const w of welded) scene.add(w);
  for (const m of picked) m.visible = false;
  return welded;
}

/**
 * Each tower as one welded piece while all its blocks sleep. `towers`: [{ meshes: [block and battlement meshes] , links }].
 * `update()` (each frame, after the physics) breaks a tower apart when any of its bodies is awake.
 */
export function towerWelds(scene, towers) {
  const state = towers.map((t) => {
    const welded = mergeByMaterial(t.meshes);
    for (const w of welded) scene.add(w);
    for (const m of t.meshes) m.visible = false;
    return { ...t, welded, apart: false };
  });
  return {
    update() {
      for (const t of state) {
        if (t.apart) continue;
        if (!t.links.some((l) => l.body.sleepState !== 2)) continue;
        t.apart = true;
        for (const w of t.welded) { scene.remove(w); w.geometry.dispose(); }
        for (const m of t.meshes) m.visible = true;
      }
    },
    apart: (i) => state[i]?.apart,
  };
}

/**
 * Welds the meshes under `group` that `take(mesh)` accepts into a few pieces inside `group` itself (its own space), so a
 * machine that moves or turns as a whole still does; the originals are removed.
 */
export function weldInto(group, take) {
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const picked = [];
  group.traverse((o) => { if (o !== group && o.isMesh && take(o)) picked.push(o); });
  const byMat = new Map();
  for (const m of picked) { const l = byMat.get(m.material) || []; l.push(m); byMat.set(m.material, l); }
  for (const [material, list] of byMat) {
    let n = 0;
    const geos = list.map((m) => {
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      n += g.attributes.position.count;
      return g;
    });
    const withUv = geos.every((g) => g.attributes.uv);
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = withUv ? new Float32Array(n * 2) : null;
    let o = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const w = new THREE.Mesh(geo, material);
    w.castShadow = list.some((m) => m.castShadow);
    w.receiveShadow = list.some((m) => m.receiveShadow);
    group.add(w);
  }
  for (const m of picked) m.parent?.remove(m);
}
