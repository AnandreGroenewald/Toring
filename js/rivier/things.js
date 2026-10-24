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
    root.userData = { block: g, w: W * k * 0.82, d: 3.2 * k * 0.8, phase: (it.spin || 0) * 10 };
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
  group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  let height = 0;

  function setFloors(floors) {
    for (const c of [...towerG.children]) towerG.remove(c);
    height = 0;
    for (const f of floors || []) {
      const g = things.riverBlock(f.s, f.sk || 'kleur', f.c | 0);
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
      towerG.add(g);
      height = Math.max(height, f.y + dimsOf(f).H);
    }
  }
  return { group, setFloors, get top() { return height + 3.6; }, radius };
}
