// (1.18) Jou dorp in 3D: a town on its island (the owner, 17 Oct 2026: "the Your town feels like childs play"; his
// picks: rebuilt in 3D, the look, too simple, no weight or drama). The same town as the 2D one (its people, its
// towers, who lives in which window, its golden people, its walls, its landmarks) built for real: every building
// stacked from your Stapel blocks in your skin's material, windows lit warm with someone inside (gold for the golden
// people), a tiled roof, chimneys; the tribe's flag on the tallest; stone walls along the shore, one for every wall the
// town holds; trees, street lamps and people walking; the landmarks as models (a ferris wheel turning, a carousel, a
// fountain playing, a sailboat going round, a dolphin jumping, a whale spouting, a castle, a rocket on its pad).
import * as THREE from '../../lib/three.module.min.js';
import { rng } from '../kasteel/world.js';
import { banner, TEAM, castleMaterials } from '../kasteel/castle.js';
import { getGeometry } from '../game/blocks.js';
import { windowSlots, TRIBES } from '../game/residents.js';
import { createRng } from '../core/rng.js';
import { createCasting } from '../core/living.js';
import { PALETTE } from '../config.js';
import { PX } from '../botsing/rules.js';
import { DEPTH } from '../botsing/pieces.js';
import { merge } from '../botsing/world.js';
import { shapeInfo } from '../botsing/sim.js';

// (the tribes' flags in the castle banner's style)
for (const [id, t] of Object.entries(TRIBES)) if (!TEAM[id]) TEAM[id] = { main: t.cloth, dark: t.clothD, light: t.clothL };

const LIT_MAX = 150;   // lit windows drawn at most (as the 2D town)
// where the buildings stand, in metres from the island's middle (x across, z towards the camera); the main one first
const LOTS = [[0, 0], [-11, 3.5], [11.5, 2.5], [-6, -9], [6.5, -9.5], [-17, -5], [17.5, -4], [0, -16], [-12, -15], [12, -15.5]];
const CLASSES = { wide: ['plank', 'slab', 'plank', 'slab', 'brick'], mid: ['slab', 'brick', 'brick', 'crate'], slim: ['brick', 'crate', 'cube', 'crate'] };

/**
 * The town's buildings from its id, people and golden people (the same town always the same): how many, which blocks
 * in which colours, who lives in which window. More people: more and taller buildings. Pure data.
 */
export function planTown3D({ id = 'TOWN', people = 0, tribe = 'vuur', gold = 0 } = {}) {
  const R = createRng(`dorp3d/${id}`);
  const lit = Math.min(LIT_MAX, Math.max(0, people | 0));
  // (a village, not a row of towers: more houses as it grows, each a few floors; the main one a little taller)
  const n = Math.max(3, Math.min(LOTS.length, 3 + Math.floor(people / 16)));
  const weights = LOTS.slice(0, n).map((_, k) => (k === 0 ? 1.8 : k < 3 ? 1.2 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const casting = createCasting(`dorp/${id}`, tribe);
  const bldgs = [];
  let left = lit;
  // (the town's own three colours: a look of its own, and few block materials to paint, so it opens quickly)
  const hues = [];
  while (hues.length < 3) { const h = R.int(0, PALETTE.length - 1); if (!hues.includes(h)) hues.push(h); }
  for (let k = 0; k < n; k++) {
    const want = k === n - 1 ? left : Math.round((lit * weights[k]) / sum);
    left -= want;
    const need = Math.max(4, Math.ceil(want * 1.25) + 2);
    const maxFloors = k === 0 ? 9 : 6;
    const cls = CLASSES[k === 0 ? 'wide' : R.pick(['wide', 'wide', 'mid', 'slim'])];
    const hue = hues[R.int(0, hues.length - 1)];
    const hue2 = R.chance(0.5) ? hue : hues[R.int(0, hues.length - 1)];
    const floors = [];
    let wins = 0;
    while (wins < need || floors.length < 2) {
      const shape = R.pick(cls);
      const nW = windowSlots(getGeometry({ shape, scale: 1 })).length;
      floors.push({ shape, color: floors.length % 3 === 2 ? hue2 : hue, nW });
      wins += nW;
      if (floors.length >= maxFloors) break;
    }
    const slots = [];
    floors.forEach((f, fi) => { for (let i = 0; i < f.nW; i++) slots.push({ key: `${fi}.${i}`, o: R.next() + fi * 0.15 }); });
    slots.sort((a, b) => a.o - b.o);
    const who = new Map();
    for (const s of slots.slice(0, Math.max(0, want))) who.set(s.key, casting.next().who);
    const [lx, lz] = LOTS[k];
    bldgs.push({ lot: [lx + (R.next() - 0.5) * 1.2, lz + (R.next() - 0.5) * 1.2], yaw: (R.next() - 0.5) * 0.3, floors, who, gold: new Set(), chimney: R.chance(0.6), roofHue: R.int(0, 3) });
  }
  const litKeys = [];
  bldgs.forEach((b, bi) => { for (const key of b.who.keys()) litKeys.push([bi, key]); });
  for (let g = 0; g < Math.min(gold | 0, litKeys.length); g++) {
    const pick = litKeys.splice(R.int(0, litKeys.length - 1), 1)[0];
    bldgs[pick[0]].gold.add(pick[1]);
  }
  return { bldgs, lit, tribe, hues };
}
/** The block materials a town plan needs ([shape, colour] once each): painted ahead, a few a frame. */
export function planMaterials(plan) {
  const seen = new Set();
  const out = [];
  for (const b of plan.bldgs) for (const f of b.floors) { const k = `${f.shape}|${f.color}`; if (!seen.has(k)) { seen.add(k); out.push([f.shape, f.color]); } }
  return out;
}

// ------------------------------------------------------------------------------------------------- materials
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const ROOF_COLS = [['#8e3a26', '#5e2216'], ['#3d4a5c', '#232b36'], ['#6b4a2e', '#3e2a18'], ['#7a2f3a', '#4a1820']];
function roofTex(i) {
  const [a, b] = ROOF_COLS[i];
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = a;
  g.fillRect(0, 0, 128, 128);
  const r = rng(40 + i);
  for (let row = 0; row < 8; row++) {   // (rows of clay tiles, each shaded, staggered)
    for (let col = 0; col < 9; col++) {
      const x = col * 16 - (row % 2) * 8;
      const y = row * 16;
      const k = 0.85 + r() * 0.3;
      g.fillStyle = `rgba(0,0,0,${0.18 * (1 - k + 0.15)})`;
      g.fillRect(x, y, 15, 15);
      const grd = g.createLinearGradient(0, y, 0, y + 16);
      grd.addColorStop(0, 'rgba(255,255,255,0.10)');
      grd.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = grd;
      g.fillRect(x + 1, y, 14, 16);
      g.fillStyle = b;
      g.fillRect(x, y + 14, 16, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** A window's glass: an arched pane, warm light from inside, and inside: someone (0), curtains (1) or a plant (2). */
function windowTex(kind = 0) {
  const c = canvas(64, 96);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 52, 4, 32, 52, 60);
  grd.addColorStop(0, '#fff3d0');
  grd.addColorStop(0.55, '#ffcf80');
  grd.addColorStop(1, '#c0752e');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(4, 96);
  g.lineTo(4, 32);
  g.arc(32, 32, 28, Math.PI, 0);
  g.lineTo(60, 96);
  g.closePath();
  g.fill();
  if (kind === 0) {   // someone at the window: head and shoulders, soft
    g.fillStyle = 'rgba(70,36,18,0.55)';
    g.beginPath();
    g.arc(30, 54, 9, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(30, 84, 17, 14, 0, Math.PI, 0);
    g.fill();
  } else if (kind === 1) {   // curtains drawn half open
    for (const [x0, dir] of [[4, 1], [60, -1]]) {
      const cg = g.createLinearGradient(x0, 0, x0 + dir * 22, 0);
      cg.addColorStop(0, 'rgba(150,40,40,0.95)');
      cg.addColorStop(1, 'rgba(200,70,60,0.75)');
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(x0, 4);
      g.quadraticCurveTo(x0 + dir * 26, 50, x0 + dir * 16, 96);
      g.lineTo(x0, 96);
      g.closePath();
      g.fill();
    }
  } else {   // a pot plant on the sill
    g.fillStyle = 'rgba(40,70,30,0.8)';
    for (const [x, y, rr] of [[26, 68, 9], [36, 64, 8], [31, 58, 8], [22, 60, 6], [40, 72, 6]]) { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(120,60,30,0.9)';
    g.fillRect(22, 76, 18, 14);
  }
  // the cross bars
  g.fillStyle = 'rgba(60,34,18,0.85)';
  g.fillRect(30, 6, 4, 90);
  g.fillRect(4, 58, 56, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Builds a town on an island (`isle` from isle.js) from its plan; `skin` its blocks' Stapel skin, `pieces` Block
 * Clash's pieces (the blocks), `marks` its landmark ids, `walls` how many walls. Returns { group, update(t, dt),
 * tallest (world position of the main building's top), buildings: [{ group, top }] }.
 */
export function buildTown({ plan, isle, pieces, renderer, cm = castleMaterials(renderer), skin = 'kleur', marks = [], walls = 0, seed = 1, paintK = 1 }) {
  const group = new THREE.Group();
  group.position.set(isle.cx, isle.top, isle.cz);
  const r = rng(seed * 77 + 5);
  const updaters = [];
  const buildings = [];
  // windows (all of the town's in three instanced meshes: frames, lit glass, dark glass)
  const winGlass = windowTex();
  const frameMat = new THREE.MeshStandardMaterial({ color: '#2b1d14', roughness: 0.7 });
  const litMats = [winGlass, windowTex(1), windowTex(2)].map((m) => new THREE.MeshBasicMaterial({ map: m, alphaTest: 0.5, toneMapped: false }));
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1a2230', roughness: 0.15, metalness: 0.5, envMapIntensity: 1.4 });
  const arch = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, -0.75);
    s.lineTo(-0.5, 0.25);
    s.absarc(0, 0.25, 0.5, Math.PI, 0, true);
    s.lineTo(0.5, -0.75);
    s.closePath();
    const geo = new THREE.ShapeGeometry(s, 10);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) + 0.5, (pos.getY(i) + 0.75) / 1.5);
    return geo;
  })();
  const winList = [];
  const roofMats = ROOF_COLS.map((_, i) => new THREE.MeshStandardMaterial({ map: roofTex(i), roughness: 0.8 }));
  const chimneyMat = cm.wall;
  const doorMat = new THREE.MeshStandardMaterial({ color: '#4a2c18', roughness: 0.6 });
  const doorLamp = new THREE.MeshBasicMaterial({ color: '#ffd89a', toneMapped: false });
  plan.bldgs.forEach((b, bi) => {
    const bg = new THREE.Group();
    bg.position.set(b.lot[0], 0, b.lot[1]);
    bg.rotation.y = b.yaw;
    let y = 0;
    let topW = 4;
    b.floors.forEach((f, fi) => {
      const s = shapeInfo(f.shape);
      const blk = pieces.block(f.shape, 0, null, skin, f.color, paintK);
      const bottom = blk.userData.bottom;
      blk.position.set(0, y + bottom, 0);
      blk.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      bg.add(blk);
      // its windows, on the front and the back
      const geo = getGeometry({ shape: f.shape, scale: 1 });
      windowSlots(geo).forEach((w, i) => {
        const key = `${fi}.${i}`;
        const who = b.who.get(key);
        const gold = b.gold.has(key);
        const wx = (w.x - s.cx) / PX;
        const wy = -(w.y - s.cy) / PX;
        const ww = (w.w / PX) * 1.05;
        const wh = (w.h / PX) * 1.05;
        for (const zs of [1, -1]) winList.push({ bg, bi, x: wx, y: y + bottom + wy, z: zs * (DEPTH / 2 + 0.03), zs, w: ww, h: wh, lit: !!who && zs > 0, gold: gold && zs > 0 });
      });
      y += s.h / PX;
      topW = s.w / PX;
    });
    // the roof: a gable of clay tiles over the top floor, a chimney now and then
    const rw = topW + 0.7;
    const rd = DEPTH + 0.9;
    const rh = Math.min(3.2, rw * 0.42);
    const prof = new THREE.Shape([new THREE.Vector2(-rw / 2, 0), new THREE.Vector2(rw / 2, 0), new THREE.Vector2(0, rh)]);
    const roofGeo = new THREE.ExtrudeGeometry(prof, { depth: rd, bevelEnabled: false });
    roofGeo.translate(0, 0, -rd / 2);
    const ruv = roofGeo.attributes.uv;
    for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 0.5, ruv.getY(i) * 0.5);
    const roof = new THREE.Mesh(roofGeo, roofMats[b.roofHue]);
    roof.position.y = y;
    roof.castShadow = roof.receiveShadow = true;
    bg.add(roof);
    if (b.chimney) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), chimneyMat);
      ch.position.set(rw * 0.22, y + rh * 0.55 + 0.6, -rd * 0.15);
      ch.castShadow = true;
      bg.add(ch);
      bg.userData.smokeAt = new THREE.Vector3(rw * 0.22, y + rh * 0.55 + 1.6, -rd * 0.15);
    }
    // a door at its foot (dark wood, a frame, a warm lamp over it)
    const door = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.12), doorMat);
    leaf.position.y = 1;
    const dframe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.25, 0.1), frameMat);
    dframe.position.set(0, 1.1, -0.03);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), doorLamp);
    lamp.position.set(0, 2.45, 0.12);
    door.add(dframe, leaf, lamp);
    door.position.set(0, 0, DEPTH / 2 + 0.06);
    bg.add(door);
    group.add(bg);
    buildings.push({ group: bg, top: y + rh, width: topW, plan: b });
  });
  // the windows, instanced
  const place = (list, mat, frames) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(arch, mat, list.length);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    list.forEach((w, i) => {
      w.bg.updateMatrixWorld(true);
      p.set(w.x, w.y, w.z + (frames ? -0.012 * w.zs : 0));
      p.applyMatrix4(w.bg.matrix);
      q.setFromEuler(new THREE.Euler(0, w.bg.rotation.y, 0));
      if (w.zs < 0) q.multiply(flip);
      const k = frames ? 1.22 : 1;
      sc.set(w.w * k, (w.h / 1.5) * k, 1);
      mtx.compose(p, q, sc);
      m.setMatrixAt(i, mtx);
      if (!frames) m.setColorAt(i, new THREE.Color(w.gold && w.lit ? '#ffd84a' : '#ffffff'));
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    group.add(m);
    return m;
  };
  place(winList, frameMat, true);
  place(winList, darkMat, false);   // (every window's dark glass; a lit pane goes over it while someone is home)
  const front = winList.filter((w) => w.zs > 0);
  const kindOf = (i) => [0, 1, 0, 2, 1][(i * 7 + 3) % 5];   // (someone, curtains, a plant: mixed, the same every time)
  front.forEach((w, i) => { w.kind = kindOf(i); });
  const litMeshes = litMats.map((m, k) => {
    const list = front.filter((w) => w.kind === k);
    list.forEach((w, i) => { w.mi = i; });
    const mesh = place(list, m, false);
    if (mesh) { mesh.position.z += 0.004; mesh.userData.list = list; }
    return mesh;
  });
  const lit = front.filter((w) => w.lit);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  // (each lit pane's own place, kept to show it again)
  for (const mesh of litMeshes) {
    if (!mesh) continue;
    mesh.userData.full = mesh.userData.list.map((_, i) => { const m4 = new THREE.Matrix4(); mesh.getMatrixAt(i, m4); return m4; });
    mesh.userData.list.forEach((w, i) => { if (!w.lit) mesh.setMatrixAt(i, hidden); });
    mesh.instanceMatrix.needsUpdate = true;
  }
  /** A front window lit (someone home) or dark; gold: their pane glows golden. */
  function setLit(w, on, gold = w.gold) {
    const mesh = litMeshes[w.kind];
    if (!mesh) return;
    w.lit = !!on;
    w.gold = !!gold && !!on;
    mesh.setMatrixAt(w.mi, on ? mesh.userData.full[w.mi] : hidden);
    mesh.setColorAt(w.mi, new THREE.Color(w.gold ? '#ffd84a' : '#ffffff'));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  /** A window's place in the world (where a person leans out or lands). */
  function windowAt(w, out = new THREE.Vector3()) {
    w.bg.updateMatrixWorld(true);
    return out.set(w.x, w.y, w.z + 0.2).applyMatrix4(w.bg.matrixWorld);
  }
  // flower boxes under some lit windows (red, white, yellow flowers in a little trough)
  const boxes = lit.filter((_, i) => i % 3 === 1);
  if (boxes.length) {
    const trough = new THREE.BoxGeometry(1, 0.22, 0.3);
    const tm = new THREE.InstancedMesh(trough, new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.8 }), boxes.length);
    const flowerGeo = new THREE.IcosahedronGeometry(0.11, 0);
    const fm = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), boxes.length * 4);
    const cols = ['#e8452c', '#f4efe6', '#f2c230', '#d6457a'];
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const qy = new THREE.Quaternion();
    boxes.forEach((w, i) => {
      w.bg.updateMatrixWorld(true);
      qy.setFromEuler(new THREE.Euler(0, w.bg.rotation.y, 0));
      p.set(w.x, w.y - w.h / 2 - 0.08, w.z + 0.16).applyMatrix4(w.bg.matrix);
      m4.compose(p, qy, new THREE.Vector3(w.w * 1.1, 1, 1));
      tm.setMatrixAt(i, m4);
      for (let k = 0; k < 4; k++) {
        p.set(w.x + (k - 1.5) * w.w * 0.26, w.y - w.h / 2 + 0.06, w.z + 0.16).applyMatrix4(w.bg.matrix);
        m4.compose(p, qy, new THREE.Vector3(1, 1, 1));
        fm.setMatrixAt(i * 4 + k, m4);
        fm.setColorAt(i * 4 + k, new THREE.Color(cols[(i + k) % 4]));
      }
    });
    if (fm.instanceColor) fm.instanceColor.needsUpdate = true;
    group.add(tm, fm);
  }
  // the tribe's flag on the tallest building
  const main = buildings[0];
  const flag = banner(plan.tribe, { pole: 3.6, w: 2.4, h: 1.4 });
  flag.position.set(0, main.top - 0.4, 0);
  main.group.add(flag);
  updaters.push((t) => flag.userData.wave?.(t));
  // walls along the shore in front: one length for each wall the town holds
  const wallList = [];
  for (let k = 0; k < Math.min(3, walls); k++) {
    const a = (k - 1) * 0.55;
    const rad = isle.radiusAt(a) - 2.2;
    const len = 11;
    const wall = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 2.4, 1.1), cm.wall);
    body.position.y = 1.2;
    body.castShadow = body.receiveShadow = true;
    wall.add(body);
    for (let i = 0; i < 7; i++) {
      const mer = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.1), cm.granite);
      mer.position.set(-len / 2 + 0.6 + i * ((len - 1.2) / 6), 2.75, 0);
      mer.castShadow = true;
      wall.add(mer);
    }
    wall.position.set(Math.sin(a) * rad, 0, Math.cos(a) * rad);
    wall.rotation.y = a;
    group.add(wall);
    wallList.push(wall);
  }
  // trees and street lamps between the buildings
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a3d26', roughness: 0.9 });
  const leafMats = ['#4f7a2c', '#3d6a2a', '#6a8a34'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
  const crown = (() => {   // (three soft lumps, bumped: a tree, not a ball)
    const parts = [[0, 0, 0, 1.4], [0.8, -0.3, 0.3, 1.0], [-0.7, -0.2, -0.3, 1.05], [0.1, 0.8, -0.2, 0.9]].map(([x, y, z, s]) => {
      const gg = new THREE.IcosahedronGeometry(s, 2);
      const pp = gg.attributes.position;
      for (let k = 0; k < pp.count; k++) {
        const v = new THREE.Vector3().fromBufferAttribute(pp, k);
        const n = 1 + 0.12 * Math.sin(v.x * 5.1 + v.y * 3.3) * Math.cos(v.z * 4.7);
        pp.setXYZ(k, v.x * n + x, v.y * n + y, v.z * n + z);
      }
      gg.computeVertexNormals();   // (smooth, before the merge keeps them)
      return gg;
    });
    return merge(parts);
  })();
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.2, 6);
  const lampPost = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.5, metalness: 0.6 });
  const bulb = new THREE.MeshBasicMaterial({ color: '#ffd89a', toneMapped: false });
  const free = (x, z, clear = 4.5) => buildings.every((bb) => Math.hypot(bb.group.position.x - x, bb.group.position.z - z) > clear + bb.width / 2) && Math.hypot(x, z) < isle.radiusAt(Math.atan2(x, z)) - 3;
  for (let k = 0, n = 0; k < 160 && n < 16; k++) {
    const a = r() * Math.PI * 2;
    const rr = 6 + r() * (isle.radius - 8);
    const x = Math.sin(a) * rr;
    const z = Math.cos(a) * rr;
    if (!free(x, z)) continue;
    const tg = new THREE.Group();
    const tr = new THREE.Mesh(trunk, trunkMat);
    tr.position.y = 1.1;
    const cr = new THREE.Mesh(crown, leafMats[n % 3]);
    cr.position.y = 2.9;
    cr.scale.set(1, 0.85 + r() * 0.3, 1);
    tr.castShadow = cr.castShadow = true;
    tg.add(tr, cr);
    tg.position.set(x, 0, z);
    tg.scale.setScalar(0.8 + r() * 0.5);
    group.add(tg);
    n++;
  }
  for (let k = 0, n = 0; k < 120 && n < 8; k++) {
    const a = r() * Math.PI * 2;
    const rr = 5 + r() * (isle.radius - 9);
    const x = Math.sin(a) * rr;
    const z = Math.cos(a) * rr;
    if (!free(x, z, 3)) continue;
    const lg = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 6), lampPost);
    post.position.y = 1.7;
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bulb);
    b2.position.y = 3.5;
    lg.add(post, b2);
    lg.position.set(x, 0, z);
    group.add(lg);
    n++;
  }
  // people walking: small figures on loops between the buildings
  const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.6, 3, 6);
  bodyGeo.translate(0, 0.52, 0);
  const headGeo = new THREE.SphereGeometry(0.19, 8, 6);
  headGeo.translate(0, 1.16, 0);
  const NP = 18;
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), NP);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: '#e0b48c', roughness: 0.7 }), NP);
  const clothes = ['#c8321f', '#1f6fb8', '#2f8f2c', '#e0a62a', '#7d4bb3', '#e8e2d6', '#333a44'];
  const walkers = [];
  for (let i = 0; i < NP; i++) {
    bodies.setColorAt(i, new THREE.Color(clothes[i % clothes.length]));
    const c = buildings[i % buildings.length].group.position;
    walkers.push({ cx: c.x, cz: c.z, rad: 4 + r() * 3, sp: (0.18 + r() * 0.2) * (r() < 0.5 ? -1 : 1), ph: r() * Math.PI * 2 });
  }
  bodies.castShadow = heads.castShadow = true;
  group.add(bodies, heads);
  const wm = new THREE.Matrix4();
  const wq = new THREE.Quaternion();
  const wp = new THREE.Vector3();
  const ws = new THREE.Vector3(1, 1, 1);
  updaters.push((t) => {
    walkers.forEach((w, i) => {
      const a = w.ph + t * w.sp;
      wp.set(w.cx + Math.cos(a) * w.rad, Math.abs(Math.sin(t * 7 + i)) * 0.05, w.cz + Math.sin(a) * w.rad * 0.8);
      wq.setFromEuler(new THREE.Euler(0, -a + (w.sp > 0 ? 0 : Math.PI), 0));
      wm.compose(wp, wq, ws);
      bodies.setMatrixAt(i, wm);
      heads.setMatrixAt(i, wm);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  });
  // the landmarks (land ones on their spots in the order bought; sea ones round the island)
  const spots = [[-9, 9], [9, 9.5], [-15, 5], [15.5, 6], [0, 11], [-20, -10], [20, -11]];
  let li = 0;
  const owned = new Set();
  const drops = [];
  /** A landmark into the town; `drop`: it lands from the sky with a thud and dust (a purchase). */
  function addMark(id, { drop = false } = {}) {
    const mk = LANDMARKS[id];
    if (!mk || owned.has(id)) return null;
    owned.add(id);
    const m = mk.make(cm);
    if (mk.sea) {
      group.add(m.group);
      updaters.push((tt, dt) => m.update(tt, dt, isle));
      return m.group;
    }
    const [x, z] = spots[li++ % spots.length];
    m.group.position.set(x, 0, z);
    m.group.rotation.y = -Math.atan2(x, 26) * 0.6;
    group.add(m.group);
    if (m.update) updaters.push((tt, dt) => m.update(tt, dt));
    if (drop) { m.group.position.y = 40; drops.push({ g: m.group, v: 0 }); }
    return m.group;
  }
  for (const id of marks) addMark(id);
  updaters.push((tt, dt) => {   // (a purchase falls, bounces once, settles)
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.v -= 60 * dt;
      d.g.position.y += d.v * dt;
      if (d.g.position.y <= 0) {
        d.g.position.y = 0;
        if (d.v < -8) { d.v = -d.v * 0.22; d.landed = (d.landed || 0) + 1; group.userData.onThud?.(d.g, d.landed); } else { drops.splice(i, 1); }
      }
    }
  });
  // (each building's box in the world, for the raids' throws; the fullest one: the target)
  group.updateMatrixWorld(true);
  buildings.forEach((b, bi) => {
    b.box = new THREE.Box3().setFromObject(b.group);
    b.lit = () => front.filter((w) => w.bi === bi && w.lit).length;
  });
  return {
    group, buildings, isle,
    /** The landmarks standing (tests). */
    get marks() { return [...owned]; },
    walls: wallList,
    windows: front,
    setLit, windowAt, addMark,
    /** The main building's top in the world (the flag's foot). */
    tallestAt: () => main.group.localToWorld(new THREE.Vector3(0, main.top, 0)),
    /** The building with the most people at home. */
    fullest: () => buildings.reduce((a, b) => (b.lit() > a.lit() ? b : a), buildings[0]),
    update(tt, dt) { for (const f of updaters) f(tt, dt); },
  };
}

// ------------------------------------------------------------------------------------------------- landmarks
const paint = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2, ...o });
let DOT = null;
/** A soft round dot (water drops drawn as points). */
function dot() {
  if (DOT) return DOT;
  const c = canvas(32, 32);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  DOT = new THREE.CanvasTexture(c);
  return DOT;
}
const LANDMARKS = {
  // 🎡 a ferris wheel: two rims, spokes, gondolas that hang level, lights round the rim; it turns
  wiel: {
    make() {
      const g = new THREE.Group();
      const R = 5.2;
      const steel = paint('#e8e2d6', { metalness: 0.6, roughness: 0.35 });
      const wheel = new THREE.Group();
      wheel.position.y = R + 1.4;
      g.add(wheel);
      for (const z of [-0.55, 0.55]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.09, 6, 64), steel);
        rim.position.z = z;
        wheel.add(rim);
      }
      const spokes = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        for (const z of [-0.55, 0.55]) {
          const s = new THREE.CylinderGeometry(0.035, 0.035, R, 4);
          s.translate(0, R / 2, 0);
          s.rotateZ(a);
          s.translate(0, 0, z);
          spokes.push(s);
        }
      }
      wheel.add(new THREE.Mesh(merge(spokes), steel));
      const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false }), 32);
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        lights.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.sin(a) * R, Math.cos(a) * R, 0.62));
      }
      wheel.add(lights);
      const cols = ['#c8321f', '#1f6fb8', '#e0a62a', '#2f8f2c'];
      const gons = [];
      for (let i = 0; i < 8; i++) {
        const gon = new THREE.Group();
        const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.38, 0.7, 10), paint(cols[i % 4]));
        const top = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.35, 10), paint('#e8e2d6'));
        top.position.y = 0.55;
        cab.position.y = -0.2;
        gon.add(cab, top);
        wheel.add(gon);
        gons.push({ gon, a: (i / 8) * Math.PI * 2 });
      }
      const legGeo = [];
      for (const x of [-1, 1]) for (const z of [-0.9, 0.9]) {
        const l = new THREE.CylinderGeometry(0.1, 0.14, R + 1.6, 6);
        l.translate(0, (R + 1.6) / 2, 0);
        l.rotateZ(x * 0.32);
        l.translate(x * 1.1, 0, z);
        legGeo.push(l);
      }
      g.add(new THREE.Mesh(merge(legGeo), steel));
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return {
        group: g,
        update(t) {
          const rot = t * 0.18;
          wheel.rotation.z = rot;
          for (const q of gons) {
            const a = q.a;
            q.gon.position.set(Math.sin(a) * R, Math.cos(a) * R, 0);
            q.gon.rotation.z = -rot;   // (they hang level)
          }
        },
      };
    },
  },
  // 🎠 a carousel: a striped canopy, a turning floor, horses rising and falling on their poles
  mallemeule: {
    make() {
      const g = new THREE.Group();
      const c = canvas(256, 64);
      const x = c.getContext('2d');
      for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#f4efe6' : '#c8321f'; x.fillRect(i * 16, 0, 16, 64); }
      const st = new THREE.CanvasTexture(c);
      st.colorSpace = THREE.SRGBColorSpace;
      const spin = new THREE.Group();
      g.add(spin);
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.5, 0.4, 32), paint('#7a4a2a'));
      floor.position.y = 0.2;
      spin.add(floor);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 1.8, 32, 1, true), new THREE.MeshStandardMaterial({ map: st, side: THREE.DoubleSide, roughness: 0.6 }));
      roof.position.y = 4.4;
      spin.add(roof);
      const valance = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 3.9, 0.5, 32, 1, true), new THREE.MeshStandardMaterial({ map: st, side: THREE.DoubleSide, roughness: 0.6 }));
      valance.position.y = 3.3;
      spin.add(valance);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4.2, 10), paint('#e0a62a', { metalness: 0.8, roughness: 0.3 }));
      pole.position.y = 2.3;
      spin.add(pole);
      const horses = [];
      const hcols = ['#f4efe6', '#e0a62a', '#c8321f', '#1f6fb8'];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const h = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.8, 4, 8), paint(hcols[i % 4]));
        body.rotation.z = Math.PI / 2;
        const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.4, 3, 6), paint(hcols[i % 4]));
        neck.position.set(0.5, 0.35, 0);
        neck.rotation.z = -0.6;
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 6), paint('#e0a62a', { metalness: 0.8 }));
        rod.position.y = 0.5;
        h.add(body, neck, rod);
        h.position.set(Math.cos(a) * 2.6, 1.6, Math.sin(a) * 2.6);
        h.rotation.y = -a + Math.PI / 2;
        spin.add(h);
        horses.push({ h, ph: i * 0.8 });
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return { group: g, update(t) { spin.rotation.y = t * 0.6; for (const q of horses) q.h.position.y = 1.6 + Math.sin(t * 2.2 + q.ph) * 0.3; } };
    },
  },
  // ⛲ a fountain: a stone basin, a column, water playing (falling arcs of drops) and a rippling pool
  fontein: {
    make(cm) {
      const g = new THREE.Group();
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.9, 32, 1, true), cm.granite);
      basin.position.y = 0.45;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.2, 8, 40), cm.granite);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.92;
      const water = new THREE.Mesh(new THREE.CircleGeometry(2.95, 40), new THREE.MeshStandardMaterial({ color: '#2f78a8', roughness: 0.05, metalness: 0.3, envMapIntensity: 2 }));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.75;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.2, 12), cm.granite);
      col.position.y = 1.1;
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), cm.granite);
      bowl.position.y = 2.6;
      bowl.scale.set(1, 0.4, 1);
      g.add(basin, rim, water, col, bowl);
      // the drops: a ring of falling arcs, drawn as points
      const N = 260;
      const pos = new Float32Array(N * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const drops = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#d8f0ff', size: 0.14, map: dot(), transparent: true, opacity: 0.9, depthWrite: false, alphaTest: 0.05 }));
      drops.frustumCulled = false;
      g.add(drops);
      const seeds = Array.from({ length: N }, (_, i) => ({ a: (i / N) * Math.PI * 2 * 7, ph: (i * 0.618) % 1 }));
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      return {
        group: g,
        update(t) {
          for (let i = 0; i < N; i++) {
            const s = seeds[i];
            const u = (t * 0.7 + s.ph) % 1;   // (each drop's place along its arc)
            const rad = 0.3 + u * 1.9;
            pos[i * 3] = Math.cos(s.a) * rad;
            pos[i * 3 + 1] = 3.1 + u * 1.2 - u * u * 3.4;
            pos[i * 3 + 2] = Math.sin(s.a) * rad;
          }
          geo.attributes.position.needsUpdate = true;
          water.material.color.setHSL(0.56, 0.55, 0.36 + 0.03 * Math.sin(t * 3));
        },
      };
    },
  },
  // 🏰 a small castle: four round towers with conical roofs, walls between, a gate
  kasteel: {
    make(cm) {
      const g = new THREE.Group();
      const roofMat = paint('#3d4a5c', { roughness: 0.7 });
      for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) {
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 4.6, 14), cm.granite);
        tw.position.set(x, 2.3, z);
        const rf = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.8, 14), roofMat);
        rf.position.set(x, 5.5, z);
        g.add(tw, rf);
      }
      for (const [x, z, rot] of [[0, -2.4, 0], [0, 2.4, 0], [-2.4, 0, Math.PI / 2], [2.4, 0, Math.PI / 2]]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3, 0.6), cm.wall);
        w.position.set(x, 1.5, z);
        w.rotation.y = rot;
        g.add(w);
      }
      const keep = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5.2, 2.4), cm.granite);
      keep.position.y = 2.6;
      g.add(keep);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.scale.setScalar(0.9);
      return { group: g };
    },
  },
  // 🚀 a rocket on its pad, steam curling at its foot
  vuurpyl: {
    make() {
      const g = new THREE.Group();
      const white = paint('#eeeae2', { metalness: 0.4, roughness: 0.35 });
      const red = paint('#c8321f', { metalness: 0.3, roughness: 0.4 });
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 20), paint('#5a5a60'));
      pad.position.y = 0.25;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 6, 18), white);
      body.position.y = 3.6;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.8, 18), red);
      nose.position.y = 7.5;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.77, 0.77, 0.5, 18), red);
      band.position.y = 5.4;
      g.add(pad, body, nose, band);
      for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 1.2), red);
        const a = (i / 4) * Math.PI * 2;
        fin.position.set(Math.cos(a) * 0.9, 1.4, Math.sin(a) * 0.9);
        fin.rotation.y = -a;
        g.add(fin);
      }
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.5, 0.5), paint('#c8a23a', { metalness: 0.5 }));
      tower.position.set(-1.9, 3.75, 0);
      g.add(tower);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return { group: g };
    },
  },
  // ⛵ a sailboat going round the island, rocking on the swell
  seilboot: {
    sea: true,
    make() {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 4.2, 10, 1, false, 0, Math.PI), paint('#f4efe6'));
      hull.rotation.z = Math.PI / 2;
      hull.rotation.y = Math.PI / 2;
      hull.scale.set(1, 1, 0.8);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 5, 6), paint('#6b4a2e'));
      mast.position.y = 2.6;
      const sailG = new THREE.BufferGeometry();
      sailG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0, 0, 5, 0, 0, 0.6, 2.6], 3));
      sailG.computeVertexNormals();
      const sail = new THREE.Mesh(sailG, paint('#fff8ec', { side: THREE.DoubleSide, roughness: 0.8 }));
      g.add(hull, mast, sail);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return {
        group: g,
        update(t, dt, isle) {
          const a = t * 0.05 + 1;
          const rr = isle.radius + 16;
          g.position.set(Math.sin(a) * rr, Math.sin(t * 1.3) * 0.15, Math.cos(a) * rr);
          g.rotation.set(Math.sin(t * 1.1) * 0.06, a + Math.PI / 2, Math.sin(t * 0.9) * 0.08);
        },
      };
    },
  },
  // 🐬 a dolphin leaping now and then
  dolfyn: {
    sea: true,
    make() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.8, 6, 10), paint('#5f7a8c', { roughness: 0.3, metalness: 0.2 }));
      body.rotation.z = Math.PI / 2;
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 4), body.material);
      fin.position.set(0, 0.5, 0);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 1), body.material);
      tail.position.set(-1.4, 0, 0);
      g.add(body, fin, tail);
      return {
        group: g,
        update(t, dt, isle) {
          const cyc = (t * 0.25) % 1;   // (a leap a cycle, a quarter of it in the air)
          const u = Math.min(1, cyc / 0.25);
          const a = Math.floor(t * 0.25) * 2.1;
          const rr = isle.radius + 10;
          const bx = Math.sin(a) * rr;
          const bz = Math.cos(a) * rr;
          const dx = Math.cos(a);
          const dz = -Math.sin(a);
          g.visible = cyc < 0.25;
          g.position.set(bx + dx * (u - 0.5) * 7, Math.sin(u * Math.PI) * 3 - 0.4, bz + dz * (u - 0.5) * 7);
          g.rotation.set(0, Math.atan2(-dz, dx), (0.5 - u) * 1.6);
        },
      };
    },
  },
  // 🐋 a whale's back rising, and its spout
  walvis: {
    sea: true,
    make() {
      const g = new THREE.Group();
      const back = new THREE.Mesh(new THREE.SphereGeometry(2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint('#3c4a5a', { roughness: 0.4 }));
      back.scale.set(2.2, 0.6, 1);
      g.add(back);
      const N = 90;
      const pos = new Float32Array(N * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const spout = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#eef8ff', size: 0.24, map: dot(), transparent: true, opacity: 0.85, depthWrite: false, alphaTest: 0.05 }));
      spout.frustumCulled = false;
      g.add(spout);
      return {
        group: g,
        update(t, dt, isle) {
          const a = -0.9;
          const rr = isle.radius + 24;
          const rise = Math.max(0, Math.sin(t * 0.3));
          g.position.set(Math.sin(a) * rr, -1.4 + rise * 1.2, Math.cos(a) * rr);
          for (let i = 0; i < N; i++) {
            const u = (t * 0.9 + i / N) % 1;
            const s = (i * 0.618) % 1;
            pos[i * 3] = Math.cos(s * 9) * u * 0.8;
            pos[i * 3 + 1] = rise > 0.6 ? 1.2 + u * 4 - u * u * 2 : -9;
            pos[i * 3 + 2] = Math.sin(s * 9) * u * 0.8;
          }
          geo.attributes.position.needsUpdate = true;
        },
      };
    },
  },
};
