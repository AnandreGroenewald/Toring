// (1.20) Die Rivier's things: Stapel's own blocks floating down (in Stapel's art), rocks, the people on rubber rings who
// fell off your tower, the white water round all of them, the spray, and your crew's island with its Weektoring (every
// floor in the skin of whoever stacked it). Kept in pools: the river re-uses them as it goes.
import * as THREE from '../../lib/three.module.min.js';
import { bendMaterial } from './world.js';
import { portraitDataUrl } from '../game/residents.js';
import { dimsOf, PX } from '../core/weektower.js';
import { getGeometry } from '../game/blocks.js';

const RIVER_W = 2.7;   // a floating block is this wide across (m): it fills most of a lane

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
/** A soft white ring of foam (the water round a floating thing). */
function foamTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.5})`;
    g.beginPath();
    g.arc(rnd() * 128, rnd() * 128, 2 + rnd() * 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function ringTexture() {
  const c = canvas(256, 16);
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#f6f2ea' : '#e2382c';
    g.fillRect(i * 32, 0, 32, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function dotTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The things' kit for one stage: `pieces` (js/botsing/pieces.js) draws Stapel's blocks in 3D. Returns makers for each
 * kind and the shared spray.
 */
export function createThings(scene, pieces) {
  const foamMat = bendMaterial(new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, depthWrite: false, fog: true, opacity: 0.9 }));
  const foamGeo = new THREE.PlaneGeometry(1, 1);
  foamGeo.rotateX(-Math.PI / 2);
  const rockMat = bendMaterial(new THREE.MeshStandardMaterial({ color: '#9c7d62', roughness: 0.9, flatShading: true }));
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const ringMat = bendMaterial(new THREE.MeshStandardMaterial({ map: ringTexture(), roughness: 0.45 }));
  const ringGeo = new THREE.TorusGeometry(0.62, 0.2, 10, 28);
  ringGeo.rotateX(Math.PI / 2);
  const shirtGeo = new THREE.CapsuleGeometry(0.2, 0.32, 4, 8);
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.42, 3, 6);
  armGeo.translate(0, 0.21, 0);
  const SHIRTS = ['#2f6db5', '#c8321f', '#3e8f3a', '#e0a21a', '#7a4fb5', '#e05f8c'];
  const shirtMats = SHIRTS.map((c) => bendMaterial(new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })));
  const skinMat = bendMaterial(new THREE.MeshStandardMaterial({ color: '#d9a47e', roughness: 0.6 }));
  const faceTex = new Map();
  const blockMats = new Map();

  /** A block's materials for the river (copies of Stapel's 3D block's, bent with the river). */
  function riverBlock(shape, skin, color) {
    const g = pieces.block(shape, 0, null, skin, color);
    g.traverse((o) => {
      if (!o.isMesh) return;
      const key = `${shape}|${skin}|${color}|${o.material?.uuid || ''}`;
      if (!blockMats.has(key)) {
        const src = o.material;
        blockMats.set(key, Array.isArray(src) ? src.map((m) => bendMaterial(m.clone())) : bendMaterial(src.clone()));
      }
      o.material = blockMats.get(key);
      o.castShadow = o.receiveShadow = false;
      o.frustumCulled = false;
    });
    return g;
  }
  function foam(size) {
    const m = new THREE.Mesh(foamGeo, foamMat);
    m.scale.set(size, 1, size);
    m.renderOrder = 2;
    m.frustumCulled = false;
    return m;
  }

  /** A block floating down: { obj, w (m across), d (m along), top } . */
  function floating(it) {
    const root = new THREE.Group();
    const g = riverBlock(it.shape, it.skin || 'kleur', it.color ?? 0);
    const { W, H } = dimsOf({ s: it.shape, k: 1 });
    const k = RIVER_W / Math.max(W, 2.2) * (it.scale || 1);
    g.scale.setScalar(k);
    // a third of it under the water, turned a little
    g.position.y = H * k * 0.18;
    g.rotation.set(0.05, it.spin || 0, 0.04);
    root.add(g);
    const f = foam(Math.max(W, H) * k * 1.7);
    f.position.y = 0.04;
    root.add(f);
    root.userData = { block: g, w: W * k * 0.82, d: 3.2 * k * 0.8, phase: (it.spin || 0) * 10, top: H * k * 0.68 };
    return root;
  }
  function rock() {
    const root = new THREE.Group();
    const m = new THREE.Mesh(rockGeo, rockMat);
    m.scale.set(1.5, 1.3, 1.4);
    m.position.y = 0.3;
    m.rotation.set(0.4, 1.1, 0.2);
    m.frustumCulled = false;
    root.add(m);
    const f = foam(4.2);
    f.position.y = 0.05;
    root.add(f);
    root.userData = { w: 2.4, d: 2.4, phase: 0 };
    return root;
  }
  /** A person on a rubber ring, waving, their face (the Living Tower's portrait) always towards you. */
  function person(who, i = 0) {
    const root = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.12;
    ring.frustumCulled = false;
    root.add(ring);
    const shirt = new THREE.Mesh(shirtGeo, shirtMats[i % shirtMats.length]);
    shirt.position.y = 0.42;
    shirt.frustumCulled = false;
    root.add(shirt);
    const arm = new THREE.Mesh(armGeo, skinMat);
    arm.position.set(0.22, 0.55, 0);
    arm.frustumCulled = false;
    root.add(arm);
    let tex = faceTex.get(who);
    if (!tex) {
      const url = portraitDataUrl(who, 128);
      tex = new THREE.TextureLoader().load(url || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
      tex.colorSpace = THREE.SRGBColorSpace;
      faceTex.set(who, tex);
    }
    const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, fog: true }));
    face.scale.set(0.95, 0.95, 1);
    face.position.y = 1.08;
    root.add(face);
    const f = foam(2.2);
    f.position.y = 0.04;
    root.add(f);
    root.userData = { arm, face, w: 1.6, d: 1.6, phase: i * 1.7 };
    return root;
  }

  // the spray off the board and the splashes: one cloud of soft dots
  const N = 160;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sprayMat = new THREE.PointsMaterial({ map: dotTexture(), size: 0.32, transparent: true, depthWrite: false, opacity: 0.85, color: '#ffffff', sizeAttenuation: true });
  const spray = new THREE.Points(sprayGeo, sprayMat);
  spray.frustumCulled = false;
  scene.add(spray);
  let next = 0;
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50;
  function emit(x, y, z, n, spread = 1.4, up = 2.6) {
    for (let k = 0; k < n; k++) {
      const i = next++ % N;
      pos[i * 3] = x + (Math.random() - 0.5) * 0.4;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
      vel[i * 3] = (Math.random() - 0.5) * spread * 2;
      vel[i * 3 + 1] = up * (0.6 + Math.random() * 0.7);
      vel[i * 3 + 2] = 1 + Math.random() * 2.5;
      life[i] = 0.5 + Math.random() * 0.5;
    }
  }
  function updateSpray(dt) {
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      vel[i * 3 + 1] -= 9 * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (life[i] <= 0 || pos[i * 3 + 1] < -0.2) {
        life[i] = 0;
        pos[i * 3 + 1] = -50;
      }
    }
    sprayGeo.attributes.position.needsUpdate = true;
  }

  /** The ride is over: its own copies of the materials and pictures go (Stapel's 3D blocks' own stay with pieces.js). */
  function dispose() {
    for (const m of blockMats.values()) for (const x of Array.isArray(m) ? m : [m]) x.dispose();
    blockMats.clear();
    for (const tex of faceTex.values()) tex.dispose();
    faceTex.clear();
    for (const m of [foamMat, rockMat, ringMat, skinMat, ...shirtMats, sprayMat]) { m.map?.dispose?.(); m.dispose(); }
    for (const g of [foamGeo, rockGeo, ringGeo, shirtGeo, armGeo, sprayGeo]) g.dispose();
  }

  return { floating, rock, person, foam, riverBlock, emit, updateSpray, spray, dispose };
}

/**
 * Your crew's island in the lake with its Weektoring: { group, top (m), setFloors(floors) }. Floors in course metres
 * from the tower's foot (js/core/weektower.js); every floor drawn in its own skin.
 */
export function createIsland(things, { radius = 26 } = {}) {
  const group = new THREE.Group();
  const rockMat = bendMaterial(new THREE.MeshStandardMaterial({ color: '#b58a63', roughness: 0.92, flatShading: true }));
  const grassMat = bendMaterial(new THREE.MeshStandardMaterial({ color: '#7d8f43', roughness: 0.95, flatShading: true }));
  const woodMat = bendMaterial(new THREE.MeshStandardMaterial({ color: '#8a5d3b', roughness: 0.8 }));
  // the rock: a low, broken cone; grass on top; a jetty out to the river
  const base = new THREE.CylinderGeometry(radius * 0.92, radius * 1.08, 5, 24, 2);
  const p = base.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = 1 + Math.sin(a * 3 + 1) * 0.08 + Math.sin(a * 7) * 0.05;
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  base.computeVertexNormals();
  const rock = new THREE.Mesh(base, rockMat);
  rock.position.y = 0.6;
  group.add(rock);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius * 0.92, 0.6, 24), grassMat);
  top.position.y = 3.3;
  group.add(top);
  const jetty = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 16), woodMat);
  jetty.position.set(0, 1.4, radius + 6);
  group.add(jetty);
  for (const z of [radius + 1, radius + 5, radius + 9, radius + 13]) {
    for (const x of [-1.3, 1.3]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), woodMat);
      post.position.set(x, 0.2, z);
      group.add(post);
    }
  }
  const towerG = new THREE.Group();
  towerG.position.y = 3.6;
  group.add(towerG);
  const ground = new THREE.Group();
  ground.position.y = 3.6;
  group.add(ground);
  const village = addVillage(ground, { inner: 8.5, outer: radius * 0.86, people: 10 });
  group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  let height = 0;

  function setFloors(floors) {
    for (const c of [...towerG.children]) towerG.remove(c);
    height = addTower(things, towerG, floors);
  }
  return { group, setFloors, get top() { return height + 3.6; }, radius, update: (tt) => village.update(tt), dispose: () => village.dispose() };
}

/** Floors (js/core/weektower.js) as 3D blocks into `group`, each in its own skin; returns the tower's height (m). */
export function addTower(things, group, floors, skin = null) {
  let height = 0;
  for (const f of floors || []) {
    const g = things.riverBlock(f.s, skin || f.sk || 'kleur', Number.isInteger(f.c) ? f.c : 0);
    const k = f.k || 1;
    g.scale.setScalar(k);
    // the 3D block is centred on the shape's centroid; the floor is kept by its bottom edge's middle (turned by r)
    const geo = getGeometry({ shape: f.s, scale: 1 });
    const u = ((geo.w / 2 - geo.cx) / PX) * k;
    const v = (-(geo.h - geo.cy) / PX) * k;
    const c = Math.cos(f.r || 0);
    const s = Math.sin(f.r || 0);
    g.position.set(f.x - (u * c - v * s), f.y - (u * s + v * c), 0);
    g.rotation.z = f.r || 0;
    g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    group.add(g);
    height = Math.max(height, f.y + dimsOf(f).H);
  }
  return height;
}

/**
 * The tower you just built in the Daily, at the river's head on its own rock: you dive off its top. `layout`: the Daily's
 * blocks as they stood (GameScene.castleLayout: { s, k, x, y, r, c }), drawn in your skin. { group, top }.
 */
export function createStartTower(things, layout, skin = 'kleur') {
  const group = new THREE.Group();
  const rockMat = bendMaterial(new THREE.MeshStandardMaterial({ color: '#a77d58', roughness: 0.9, flatShading: true }));
  const geo = new THREE.CylinderGeometry(6.5, 8, 4, 10, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = 1 + Math.sin(a * 4 + 2) * 0.1;
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, rockMat);
  rock.position.y = 0.4;
  group.add(rock);
  const towerG = new THREE.Group();
  towerG.position.y = 2.4;
  group.add(towerG);
  const floors = (Array.isArray(layout) ? layout : []).filter((f) => f && typeof f.s === 'string').slice(0, 400);
  const h = addTower(things, towerG, floors, skin);
  group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { group, top: (floors.length ? h : 0) + 2.4 };
}

// ------------------------------------------------------------------------------------------------ the dorp on the island
/** Whitewashed walls with windows and a door (one picture for every house). */
function wallTexture() {
  const c = canvas(128, 96);
  const g = c.getContext('2d');
  g.fillStyle = '#efe8da';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = 'rgba(120,100,80,0.10)';
  for (let i = 0; i < 260; i++) g.fillRect(Math.random() * 128, Math.random() * 96, 2, 1);
  g.fillStyle = '#c9b89a';
  g.fillRect(0, 84, 128, 12);   // (the plinth)
  const win = (x, y) => {
    g.fillStyle = '#3d5a6b';
    g.fillRect(x, y, 18, 22);
    g.fillStyle = '#ffe9a8';
    g.globalAlpha = 0.55;
    g.fillRect(x + 2, y + 2, 14, 18);
    g.globalAlpha = 1;
    g.fillStyle = '#efe8da';
    g.fillRect(x + 8, y, 2, 22);
    g.fillRect(x, y + 10, 18, 2);
    g.fillStyle = '#5f7f4a';
    g.fillRect(x - 5, y, 4, 22);
    g.fillRect(x + 19, y, 4, 22);
  };
  win(16, 34);
  win(94, 34);
  g.fillStyle = '#6b3f24';
  g.fillRect(55, 44, 18, 40);   // (the door)
  g.fillStyle = '#b8894a';
  g.fillRect(69, 63, 2, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function roofTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 4) {
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(x, 0, 1.5, 64);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x + 2, 0, 1, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * A little Karoo dorp round the tower's foot: whitewashed houses with corrugated-iron roofs (red oxide, green, grey), a
 * church with its steeple, flat-topped acacias, street lamps, a boat at the jetty, and the town's people walking. Ring
 * between `inner` and `outer` (m) round the middle. Returns { group, update(t) }.
 */
export function addVillage(parent, { inner = 9, outer = 18, seed = 7, people = 10 } = {}) {
  const group = new THREE.Group();
  parent.add(group);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const wallMat = bendMaterial(new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 }));
  const roofMat = bendMaterial(new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.55, metalness: 0.25, vertexColors: false }));
  const prism = (() => {
    const sh = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 0.42)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  })();
  const HOUSES = 9;
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, HOUSES + 1);
  const roof = new THREE.InstancedMesh(prism, roofMat, HOUSES + 1);
  const ROOF = ['#9c3b2a', '#3f6b4a', '#7d8790', '#9c3b2a', '#4c6f8c'].map((c) => new THREE.Color(c));
  const m = new THREE.Object3D();
  const spots = [];
  for (let i = 0; i < HOUSES; i++) {
    const a = (i / HOUSES) * Math.PI * 2 + rnd() * 0.3;
    if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0) continue;   // (the jetty's side stays open)
    const r = inner + rnd() * (outer - inner - 3);
    const w = 3.2 + rnd() * 1.8;
    const hh = 2.3 + rnd() * 0.6;
    const dd = 3 + rnd() * 1.2;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    m.position.set(x, hh / 2, z);
    m.rotation.set(0, a + Math.PI, 0);
    m.scale.set(w, hh, dd);
    m.updateMatrix();
    body.setMatrixAt(spots.length, m.matrix);
    m.position.set(x, hh, z);
    m.scale.set(w + 0.5, (w + 0.5) * 0.8, dd + 0.4);
    m.updateMatrix();
    roof.setMatrixAt(spots.length, m.matrix);
    roof.setColorAt(spots.length, ROOF[i % ROOF.length]);
    spots.push({ x, z, a });
  }
  // the church: a long white hall and its steeple, on the far side
  {
    const a = Math.PI * 1.05;
    const r = outer - 3.5;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    m.position.set(x, 1.8, z);
    m.rotation.set(0, a, 0);
    m.scale.set(4.2, 3.6, 8);
    m.updateMatrix();
    body.setMatrixAt(spots.length, m.matrix);
    m.position.set(x, 3.6, z);
    m.scale.set(4.8, 3.6, 8.4);
    m.updateMatrix();
    roof.setMatrixAt(spots.length, m.matrix);
    roof.setColorAt(spots.length, new THREE.Color('#5a5f66'));
    spots.push({ x, z, a, church: true });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.8, 6.5, 1.8), wallMat);
    tower.position.set(x + Math.sin(a) * 4.6, 3.25, z + Math.cos(a) * 4.6);
    group.add(tower);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.35, 4.2, 4), bendMaterial(new THREE.MeshStandardMaterial({ color: '#5a5f66', roughness: 0.5, metalness: 0.3 })));
    spire.position.set(tower.position.x, 8.6, tower.position.z);
    spire.rotation.y = Math.PI / 4 + a;
    group.add(spire);
  }
  body.count = spots.length;
  roof.count = spots.length;
  body.instanceMatrix.needsUpdate = true;
  roof.instanceMatrix.needsUpdate = true;
  if (roof.instanceColor) roof.instanceColor.needsUpdate = true;
  group.add(body, roof);
  // acacias: a thin trunk and a flat, wide crown
  const TREES = 8;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 1, 6), bendMaterial(new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.9 })), TREES);
  const crown = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), bendMaterial(new THREE.MeshStandardMaterial({ color: '#5f7a32', roughness: 0.95, flatShading: true })), TREES);
  for (let i = 0; i < TREES; i++) {
    const a = rnd() * Math.PI * 2;
    const r = inner * 0.75 + rnd() * (outer + 1 - inner * 0.75);
    if (spots.some((sp) => Math.hypot(sp.x - Math.sin(a) * r, sp.z - Math.cos(a) * r) < 3.6)) continue;
    const th = 2.6 + rnd() * 1.6;
    m.rotation.set(0, rnd() * 3, 0.08);
    m.position.set(Math.sin(a) * r, th / 2, Math.cos(a) * r);
    m.scale.set(1, th, 1);
    m.updateMatrix();
    trunk.setMatrixAt(i, m.matrix);
    m.rotation.set(0, rnd() * 3, 0);
    m.position.set(Math.sin(a) * r, th + 0.2, Math.cos(a) * r);
    const cw = 1.8 + rnd() * 1.2;
    m.scale.set(cw, 0.45, cw * (0.8 + rnd() * 0.3));
    m.updateMatrix();
    crown.setMatrixAt(i, m.matrix);
  }
  group.add(trunk, crown);
  // street lamps by the houses (their light comes on as the sun sets: a warm glow)
  const lampMat = bendMaterial(new THREE.MeshStandardMaterial({ color: '#ffd98a', emissive: '#ffb347', emissiveIntensity: 1.4 }));
  const poleMat = bendMaterial(new THREE.MeshStandardMaterial({ color: '#2e3338', roughness: 0.6, metalness: 0.5 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const r = inner - 1.6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), poleMat);
    pole.position.set(Math.sin(a) * r, 1.6, Math.cos(a) * r);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lampMat);
    bulb.position.set(pole.position.x, 3.25, pole.position.z);
    group.add(pole, bulb);
  }
  // a boat at the jetty
  {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 4.2), bendMaterial(new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.5 })));
    hull.position.set(2.6, -1.0, outer + 9);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.14, 4.24), bendMaterial(new THREE.MeshStandardMaterial({ color: '#2f6fae', roughness: 0.5 })));
    stripe.position.set(2.6, -0.85, outer + 9);
    group.add(hull, stripe);
  }
  // the town's people walking round the tower (small figures in bright shirts)
  const SHIRTS = ['#2f6db5', '#c8321f', '#3e8f3a', '#e0a21a', '#7a4fb5', '#e05f8c', '#1f8f8a'];
  const walkers = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.75, 3, 6), bendMaterial(new THREE.MeshStandardMaterial({ roughness: 0.8 })), Math.max(1, people));
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6), bendMaterial(new THREE.MeshStandardMaterial({ color: '#c99773', roughness: 0.7 })), Math.max(1, people));
  const paths = [];
  for (let i = 0; i < people; i++) {
    walkers.setColorAt(i, new THREE.Color(SHIRTS[i % SHIRTS.length]));
    paths.push({ r: inner - 0.6 + rnd() * 1.4, a: rnd() * Math.PI * 2, v: (0.05 + rnd() * 0.07) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6 });
  }
  walkers.count = heads.count = people;
  if (walkers.instanceColor) walkers.instanceColor.needsUpdate = true;
  group.add(walkers, heads);
  group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return {
    group,
    update(t) {
      for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        const a = p.a + t * p.v;
        const bob = Math.abs(Math.sin(t * 6 + p.ph)) * 0.06;
        m.rotation.set(0, a + (p.v > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
        m.scale.set(1, 1, 1);
        m.position.set(Math.sin(a) * p.r, 0.6 + bob, Math.cos(a) * p.r);
        m.updateMatrix();
        walkers.setMatrixAt(i, m.matrix);
        m.position.y = 1.32 + bob;
        m.updateMatrix();
        heads.setMatrixAt(i, m.matrix);
      }
      walkers.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      group.traverse((o) => { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const mm of ms) { mm.map?.dispose?.(); mm.dispose(); } });
    },
  };
}
