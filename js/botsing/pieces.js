// (1.18 3D) Blokbotsing: the things on the stacks — Stapel's blocks as dressed stone and timber (each shape its own
// material and its power's mark: iron bands on the heavy cube, spikes on the wedge, the hazard crate, the pillar's
// capital), the crown on its velvet cushion, and a yellow tower crane per side with its team's cab and flag.
import * as THREE from '../../lib/three.module.min.js';
import { castleMaterials, banner, TEAM } from '../kasteel/castle.js';
import { rng } from '../kasteel/world.js';
import { shapeInfo } from './sim.js';
import { PX, sideX, towardFoe } from './rules.js';
import { merge, STACK_TOP } from './world.js';

export const DEPTH = 3.2;   // every block is this deep (m)
const SIDE_TEAM = ['blue', 'red'];
const TINT = ['#e4edff', '#ffe6dd'];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
/** The crate's face: a timber frame, an X brace, a hazard band and a bold "!" (it explodes when thrown). */
function crateCanvas() {
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  const r = rng(21);
  g.fillStyle = '#8a5a32';
  g.fillRect(0, 0, 512, 512);
  for (let b = 0; b < 8; b++) {
    g.fillStyle = `rgba(${90 + r() * 40 | 0},${55 + r() * 25 | 0},${25 + r() * 15 | 0},0.55)`;
    g.fillRect(0, b * 64, 512, 62);
    for (let k = 0; k < 12; k++) {
      g.strokeStyle = `rgba(40,20,8,${0.1 + r() * 0.15})`;
      g.beginPath();
      const y = b * 64 + r() * 60;
      g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + k) * 2.5);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, b * 64 + 62, 512, 2);
  }
  // frame and X brace
  g.fillStyle = '#5e3b1e';
  for (const [x, y, w, h] of [[0, 0, 512, 54], [0, 458, 512, 54], [0, 0, 54, 512], [458, 0, 54, 512]]) g.fillRect(x, y, w, h);
  g.save();
  g.translate(256, 256);
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    g.save();
    g.rotate(a);
    g.fillRect(-330, -26, 660, 52);
    g.restore();
  }
  g.restore();
  // the hazard label
  g.save();
  g.beginPath();
  g.roundRect(136, 176, 240, 160, 18);
  g.clip();
  g.fillStyle = '#f2c230';
  g.fillRect(136, 176, 240, 160);
  g.fillStyle = '#1d1a16';
  for (let x = 100; x < 420; x += 44) { g.beginPath(); g.moveTo(x, 176); g.lineTo(x + 22, 176); g.lineTo(x - 18, 216); g.lineTo(x - 40, 216); g.fill(); }
  for (let x = 100; x < 420; x += 44) { g.beginPath(); g.moveTo(x, 296); g.lineTo(x + 22, 296); g.lineTo(x - 18, 336); g.lineTo(x - 40, 336); g.fill(); }
  g.fillStyle = '#c62828';
  g.font = '900 104px Arial Black, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 256, 258);
  g.restore();
  g.strokeStyle = '#1d1a16';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(136, 176, 240, 160, 18);
  g.stroke();
  // nail heads
  g.fillStyle = '#2b2b2b';
  for (const [x, y] of [[27, 27], [485, 27], [27, 485], [485, 485], [256, 27], [256, 485], [27, 256], [485, 256]]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
  return c;
}

export function createPieces(renderer) {
  const base = castleMaterials(renderer);
  const cTex = new THREE.CanvasTexture(crateCanvas());
  cTex.colorSpace = THREE.SRGBColorSpace;
  cTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const M = {
    ...base,
    basalt: base.granite.clone(),
    crateFace: new THREE.MeshStandardMaterial({ map: cTex, roughness: 0.82 }),
    gold: new THREE.MeshStandardMaterial({ color: '#ffc74a', metalness: 1, roughness: 0.24, envMapIntensity: 1.6 }),
    goldGlow: new THREE.MeshStandardMaterial({ color: '#ffd76a', emissive: '#ffb020', emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 }),
    ruby: new THREE.MeshStandardMaterial({ color: '#c0102a', roughness: 0.08, metalness: 0.2, emissive: '#400008', envMapIntensity: 2 }),
    sapphire: new THREE.MeshStandardMaterial({ color: '#1d4fd8', roughness: 0.08, metalness: 0.2, emissive: '#06123a', envMapIntensity: 2 }),
    paint: new THREE.MeshStandardMaterial({ color: '#f2b51c', roughness: 0.42, metalness: 0.35 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#a39d92', roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: '#1b2633', roughness: 0.12, metalness: 0.7, envMapIntensity: 1.5 }),
    cable: new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.55, metalness: 0.5 }),
  };
  M.basalt.color = new THREE.Color('#7b808b');
  M.heavy = base.granite.clone();   // (the cube: dark dressed stone, iron-banded: it looks as heavy as it is)
  M.heavy.color = new THREE.Color('#7b838e');
  const team = SIDE_TEAM.map((t) => new THREE.MeshStandardMaterial({ color: TEAM[t].main, roughness: 0.5, metalness: 0.25 }));
  const velvet = SIDE_TEAM.map((t) => new THREE.MeshStandardMaterial({ color: TEAM[t].main, roughness: 0.62, metalness: 0.05, emissive: TEAM[t].dark, emissiveIntensity: 0.18 }));
  // each side's blocks carry a hint of its colour
  const tinted = new Map();
  const tint = (key, side) => {
    const k = `${key}|${side}`;
    if (!tinted.has(k)) {
      const m = M[key].clone();
      m.color = new THREE.Color(M[key].color).multiply(new THREE.Color(TINT[side]));
      tinted.set(k, m);
    }
    return tinted.get(k);
  };
  const MAT_OF = { cube: 'heavy', plank: 'timber', slab: 'sandstone', brick: 'sandstone', wedge: 'basalt', pillar: 'sandstone', crate: 'timber' };

  const geoCache = new Map();
  /** The shape's outline (metres, round its centroid, y up) pushed DEPTH deep. Caps get face UVs (0-1) for the crate. */
  function blockGeometry(shape, depth = DEPTH, bev = 0.07) {
    const k = `${shape}|${depth}`;
    if (geoCache.has(k)) return geoCache.get(k);
    const s = shapeInfo(shape);
    const pts = s.outline.map((p) => new THREE.Vector2((p.x - s.cx) / PX, -(p.y - s.cy) / PX)).reverse();
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: depth - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -(depth - 2 * bev) / 2);
    if (shape === 'crate') {
      const uv = g.attributes.uv;
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const W = s.w / PX;
      const Hh = s.h / PX;
      for (let i = 0; i < uv.count; i++) {
        if (Math.abs(nor.getZ(i)) > 0.7) uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + (s.h - s.cy) / PX) / Hh);
      }
    }
    g.computeVertexNormals();
    geoCache.set(k, g);
    return g;
  }
  const spikeGeo = new THREE.ConeGeometry(0.16, 0.72, 10);
  spikeGeo.translate(0, 0.36, 0);
  const box = (w, h, d, m) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.castShadow = o.receiveShadow = true;
    return o;
  };

  /** A block's look for `shape` on `side`: { group, top, bottom, w, h } (top/bottom: m above/below its centroid). */
  function block(shape, side) {
    const s = shapeInfo(shape);
    const group = new THREE.Group();
    const W = s.w / PX;
    const H = s.h / PX;
    const top = s.cy / PX;
    const bottom = (s.h - s.cy) / PX;
    if (shape === 'crown') return crown(side);
    const matKey = MAT_OF[shape] || 'sandstone';
    const mat = shape === 'crate' ? [M.crateFace, tint('timber', side)] : tint(matKey, side);
    const m = new THREE.Mesh(blockGeometry(shape), mat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (shape === 'cube') {
      for (const x of [-W * 0.27, W * 0.27]) {
        const band = box(0.24, H + 0.06, DEPTH + 0.06, M.iron);
        band.position.x = x;
        group.add(band);
      }
    } else if (shape === 'wedge') {
      const tw = (90 / PX) * 0.92;
      for (const z of [-0.85, 0.85]) {
        for (let i = 0; i < 4; i++) {
          const sp = new THREE.Mesh(spikeGeo, M.iron);
          sp.position.set(-tw / 2 + (i + 0.5) * (tw / 4), top, z);
          sp.castShadow = true;
          group.add(sp);
        }
      }
    } else if (shape === 'crate') {
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const c = box(0.36, 0.36, DEPTH + 0.05, M.iron);
        c.position.set((x * (W - 0.3)) / 2, (y * (H - 0.3)) / 2 + (top - bottom) / 2, 0);
        group.add(c);
      }
    } else if (shape === 'pillar') {
      for (const y of [top - 0.16, -bottom + 0.16]) {
        const cap = box(W + 0.34, 0.32, DEPTH + 0.3, tint('granite', side));
        cap.position.y = y;
        group.add(cap);
      }
    } else if (shape === 'plank') {
      for (const x of [-W / 2 + 0.35, W / 2 - 0.35]) {
        const capb = box(0.2, H + 0.05, DEPTH + 0.05, M.iron);
        capb.position.x = x;
        group.add(capb);
      }
    }
    group.userData = { shape, side, top, bottom, w: W, h: H };
    return group;
  }

  /**
   * The crown block (its physics box: 3.0 m x 2.3 m): a plump velvet cushion with gold piping and tassels, and on it a
   * big gold crown with rubies and sapphires, filling the box to its top.
   */
  function crown(side) {
    const s = shapeInfo('crown');
    const W = s.w / PX;
    const H = s.h / PX;
    const group = new THREE.Group();
    const cushH = 0.92;
    const geo = new THREE.BoxGeometry(W - 0.1, cushH, 2.6, 10, 4, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {   // (plumped: a cushion's soft dome and rounded edges)
      const x = p.getX(i) / ((W - 0.1) / 2);
      const y = p.getY(i) / (cushH / 2);
      const z = p.getZ(i) / 1.3;
      const edge = (1 - x * x) * (1 - z * z);
      p.setY(i, p.getY(i) + (y > 0 ? 0.22 * edge : -0.04 * edge));
      const pinch = 1 - 0.08 * (1 - y * y);
      p.setX(i, p.getX(i) * (y > 0 ? 1 - 0.05 * (1 - edge) : pinch));
      p.setZ(i, p.getZ(i) * pinch);
    }
    geo.translate(0, -H / 2 + cushH / 2, 0);
    geo.computeVertexNormals();
    const cushion = new THREE.Mesh(geo, velvet[side]);
    cushion.castShadow = cushion.receiveShadow = true;
    group.add(cushion);
    {
      const g = [];
      const pipe = new THREE.TorusGeometry(1, 0.045, 6, 40);
      pipe.rotateX(Math.PI / 2);
      pipe.scale((W - 0.12) / 2, 1, 1.28);
      pipe.translate(0, -H / 2 + cushH * 0.52, 0);
      g.push(pipe);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const t = new THREE.ConeGeometry(0.13, 0.42, 8);
        t.translate(x * (W / 2 - 0.12), -H / 2 + 0.12, z * 1.18);
        g.push(t);
      }
      group.add(new THREE.Mesh(merge(g), M.gold));
    }
    // the crown: every part placed, then merged by material (a phone draws 4 pieces instead of ~45)
    const parts = { gold: [], ruby: [], sapphire: [], velvet: [] };
    const o = new THREE.Object3D();
    const put = (key, geo, { p = [0, 0, 0], r = [0, 0, 0], sc = [1, 1, 1], look = null } = {}) => {
      o.position.set(...p);
      o.rotation.set(...r);
      o.scale.set(...sc);
      if (look) o.lookAt(look);
      o.updateMatrix();
      parts[key].push(geo.clone().applyMatrix4(o.matrix));
    };
    const R = 1.12;
    put('gold', new THREE.CylinderGeometry(R, R * 1.05, 0.62, 40, 1, true), { p: [0, 0.31, 0] });
    for (const [y, sc] of [[0.02, 1.05], [0.6, 1.0]]) put('gold', new THREE.TorusGeometry(R * sc, 0.075, 6, 40), { p: [0, y, 0], r: [Math.PI / 2, 0, 0] });
    const tall = new THREE.ConeGeometry(0.21, 0.78, 8);
    const small = new THREE.ConeGeometry(0.15, 0.46, 6);
    const ball = new THREE.SphereGeometry(0.115, 10, 8);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const big = i % 2 === 0;
      const h = big ? 0.39 : 0.23;
      put('gold', big ? tall : small, { p: [Math.sin(a) * R, 0.62 + h, Math.cos(a) * R] });
      put('gold', ball, { p: [Math.sin(a) * R, 0.62 + h * 2 + 0.06, Math.cos(a) * R] });
      const gp = new THREE.Vector3(Math.sin(a + Math.PI / 10) * R * 1.03, 0.31, Math.cos(a + Math.PI / 10) * R * 1.03);
      put(big ? 'ruby' : 'sapphire', new THREE.SphereGeometry(big ? 0.17 : 0.12, 12, 8), { p: gp.toArray(), sc: [1, 1.25, 0.6], look: gp.clone().multiplyScalar(2) });
    }
    put('velvet', new THREE.SphereGeometry(R * 0.97, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), { p: [0, 0.36, 0], sc: [1, 0.52, 1] });
    for (const r of [0, Math.PI / 2]) put('gold', new THREE.TorusGeometry(R * 0.82, 0.06, 6, 28, Math.PI), { p: [0, 0.36, 0], r: [0, r, 0], sc: [1, 0.62, 1] });
    const orbY = 0.36 + R * 0.82 * 0.62 + 0.1;
    put('gold', new THREE.SphereGeometry(0.17, 14, 10), { p: [0, orbY, 0] });
    put('gold', new THREE.BoxGeometry(0.08, 0.32, 0.08), { p: [0, orbY + 0.27, 0] });
    put('gold', new THREE.BoxGeometry(0.24, 0.08, 0.08), { p: [0, orbY + 0.3, 0] });
    const c = new THREE.Group();
    for (const [key, mat] of [['gold', M.gold], ['ruby', M.ruby], ['sapphire', M.sapphire], ['velvet', velvet[side]]]) {
      const mesh = new THREE.Mesh(merge(parts[key]), mat);
      mesh.castShadow = key === 'gold';
      c.add(mesh);
    }
    c.position.y = -H / 2 + cushH + 0.06;
    c.scale.setScalar(0.85);
    group.add(c);
    group.userData = { shape: 'crown', side, top: H / 2, bottom: H / 2, w: W, h: H, jewel: c };
    return group;
  }

  /** Cracks, worse with every hit (levels 1-3): dark jagged lines with pale chipped edges, tiling over the block. */
  const crackMats = [1, 2, 3].map((level) => {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    const r = rng(40 + level);
    const crackLine = (x, y, a, len, w) => {
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? `rgba(18,12,10,${0.85})` : 'rgba(255,240,220,0.35)';
        g.lineWidth = pass ? w : w + 2;
        g.beginPath();
        let px = x;
        let py = y;
        let aa = a;
        g.moveTo(px, py);
        const rr = rng(Math.floor(x * 7 + y * 13 + level));
        for (let k = 0; k < len; k++) { aa += (rr() - 0.5) * 0.9; px += Math.cos(aa) * 9; py += Math.sin(aa) * 9; g.lineTo(px, py); }
        g.stroke();
      }
    };
    const n = level * 3 + 1;
    for (let i = 0; i < n; i++) {
      const x = r() * 256;
      const y = r() * 256;
      const a = r() * Math.PI * 2;
      crackLine(x, y, a, 6 + level * 4, 1.4 + level * 0.5);
      if (level > 1) crackLine(x, y, a + 2.4, 3 + level * 2, 1 + level * 0.3);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(0.34, 0.34);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  });
  /** Shows a block's damage: cracks for what it has lost (0 = none). */
  function crack(group, lost) {
    const main = group.children[0];
    if (!main) return;
    let ov = group.userData.crackMesh;
    if (!lost) { if (ov) ov.visible = false; return; }
    if (!ov) {
      ov = new THREE.Mesh(main.geometry, crackMats[0]);
      ov.renderOrder = 2;
      group.add(ov);
      group.userData.crackMesh = ov;
    }
    ov.visible = true;
    ov.material = crackMats[Math.min(3, lost) - 1];
  }

  /** A Perfek block's mark: a glowing gold seam where it sits cemented. */
  function seam(group) {
    const u = group.userData;
    const s = box(u.w - 0.05, 0.08, DEPTH + 0.04, M.goldGlow);
    s.castShadow = false;
    s.position.y = -u.bottom + 0.03;
    group.add(s);
    return s;
  }

  // ---------------------------------------------------------------------------------------------- the crane
  const lattice = (() => {
    const W = 1.3;
    const H = 2;
    const parts = [];
    const bar = (w, h, d, x, y, z, rz = 0, rx = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateX(rx);
      g.rotateZ(rz);
      g.translate(x, y, z);
      parts.push(g);
    };
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bar(0.13, H, 0.13, (x * W) / 2, H / 2, (z * W) / 2);
    bar(W, 0.09, 0.09, 0, 0.05, W / 2); bar(W, 0.09, 0.09, 0, 0.05, -W / 2);
    bar(0.09, 0.09, W, W / 2, 0.05, 0); bar(0.09, 0.09, W, -W / 2, 0.05, 0);
    const L = Math.hypot(W, H);
    const a = Math.atan2(W, H);
    bar(0.07, L, 0.07, 0, H / 2, W / 2, a); bar(0.07, L, 0.07, 0, H / 2, -W / 2, -a);
    bar(0.07, L, 0.07, W / 2, H / 2, 0, 0, a); bar(0.07, L, 0.07, -W / 2, H / 2, 0, 0, -a);
    return merge(parts);
  })();
  /** A jib-like lattice along +x, `len` long: two bottom chords and a top chord, braced every 1.4 m. */
  function truss(len, w = 1.0, h = 1.1) {
    const parts = [];
    const bar = (L, x, y, z, rz = 0, ry = 0) => {
      const g = new THREE.BoxGeometry(L, 0.09, 0.09);
      g.rotateZ(rz);
      g.rotateY(ry);
      g.translate(x, y, z);
      parts.push(g);
    };
    bar(len, len / 2, 0, w / 2); bar(len, len / 2, 0, -w / 2); bar(len, len / 2, h, 0);
    const n = Math.round(len / 1.4);
    const step = len / n;
    for (let i = 0; i < n; i++) {
      const x0 = i * step;
      for (const z of [w / 2, -w / 2]) {
        const dz = -z;
        const L = Math.hypot(step / 2, h, dz);
        const g = new THREE.BoxGeometry(0.06, L, 0.06);
        const dir = new THREE.Vector3(step / 2, h, dz).normalize();
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
        g.translate(x0 + step / 4, h / 2, z + dz / 2);
        parts.push(g);
        const g2 = new THREE.BoxGeometry(0.06, L, 0.06);
        const dir2 = new THREE.Vector3(step / 2, -h, -dz).normalize();
        g2.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir2));
        g2.translate(x0 + (3 * step) / 4, h / 2, z + dz / 2);
        parts.push(g2);
      }
      const rung = new THREE.BoxGeometry(0.06, 0.06, w);
      rung.translate(x0, 0, 0);
      parts.push(rung);
    }
    return merge(parts);
  }
  const JIB_OUT = 11.5;   // m the jib reaches towards the foe from the stack's middle
  const JIB_IN = 10.5;    // ...and away from it (the swing reaches both sides of the tower)
  const jibGeo = truss(JIB_OUT + JIB_IN);
  const MAST_Z = -4.6;
  /** The crane over `side`'s stack. `set({ jibY, trolleyX, hookY, flex })` moves it (metres, world). */
  function crane(side) {
    const dir = towardFoe(side);
    const sx = sideX(side) / PX;
    const g = new THREE.Group();
    const mastX = sx - dir * 3.4;
    const mast = new THREE.InstancedMesh(lattice, M.paint, 40);
    mast.castShadow = true;
    mast.frustumCulled = false;
    mast.position.set(mastX, STACK_TOP, MAST_Z);
    g.add(mast);
    const foot = box(2.6, 0.9, 2.6, M.concrete);
    foot.position.set(mastX, STACK_TOP + 0.45, MAST_Z);
    g.add(foot);
    const head = new THREE.Group();
    g.add(head);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.45, 24), M.iron);
    ring.position.set(0, 0.22, MAST_Z);
    head.add(ring);
    const neck = box(1.1, 0.7, Math.abs(MAST_Z) + 0.6, M.paint);
    neck.position.set(0, 0.75, MAST_Z / 2);
    head.add(neck);
    const cab = box(1.7, 1.55, 1.7, team[side]);
    cab.position.set(dir * 1.25, 1.35, MAST_Z + 0.2);
    head.add(cab);
    const win = box(1.2, 0.7, 0.05, M.glass);
    win.position.set(dir * 1.25, 1.6, MAST_Z + 1.06);
    head.add(win);
    const jib = new THREE.Mesh(jibGeo, M.paint);
    jib.castShadow = true;
    jib.scale.x = dir;
    jib.position.y = 1.1;
    const jibPivot = new THREE.Group();
    jibPivot.add(jib);
    head.add(jibPivot);
    // the jib starts JIB_IN behind the stack's middle: place it in the head's frame (the head sits at the mast's x)
    jib.position.x = (sx - dir * JIB_IN) - mastX;
    // the A-frame over the mast and its tie bars, the counterweights at the outer end, the team flag
    const apexY = 6.2;
    for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) {
      const L = Math.hypot(x, apexY - 1.1, z);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, L, 6), M.paint);
      leg.position.set(x / 2, 1.1 + (apexY - 1.1) / 2, z / 2);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-x, apexY - 1.1, -z).normalize());
      head.add(leg);
    }
    const tieTo = (x) => {
      const a = new THREE.Vector3(0, apexY, 0);
      const b = new THREE.Vector3(x, 2.2, 0);
      const L = a.distanceTo(b);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L, 5), M.cable);
      t.position.copy(a).add(b).multiplyScalar(0.5);
      t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      head.add(t);
    };
    tieTo(dir * 9.5);
    tieTo(dir * 5.0);
    tieTo((sx - dir * (JIB_IN - 0.8)) - mastX);
    const cwX = (sx - dir * (JIB_IN - 0.9)) - mastX;
    for (let i = 0; i < 3; i++) {
      const cw = box(0.7, 1.7, 1.5, M.concrete);
      cw.position.set(cwX + dir * i * 0.75, 0.25, 0);
      head.add(cw);
    }
    const flag = banner(SIDE_TEAM[side], { pole: 2.4, w: 2.2, h: 1.3 });
    flag.position.set(0, apexY - 0.3, 0);
    flag.scale.x = -dir;
    head.add(flag);
    // trolley, cables, hook
    const trolley = box(1.0, 0.36, 1.25, M.iron);
    g.add(trolley);
    const cableGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 5);
    cableGeo.translate(0, -0.5, 0);
    const cables = [-0.22, 0.22].map((z) => {
      const c = new THREE.Mesh(cableGeo, M.cable);
      c.position.z = z;
      g.add(c);
      return c;
    });
    const hook = new THREE.Group();
    const hb = box(0.62, 0.66, 0.6, M.paint);
    hook.add(hb);
    const hk = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 8, 16, Math.PI * 1.5), M.iron);
    hk.position.y = -0.55;
    hk.rotation.z = Math.PI * 0.75;
    hook.add(hk);
    g.add(hook);
    const hold = new THREE.Group();   // (the hanging block goes in here)
    hook.add(hold);
    hold.position.y = -0.85;
    const st = { jibY: STACK_TOP + 16, tx: sx, hookY: STACK_TOP + 10, flex: 0, flexV: 0, swing: 0 };
    function place() {
      // (the mast hangs from the head down: it always meets it; the lowest segment ends inside the rock)
      const H = Math.max(4, st.jibY - 1.1 - STACK_TOP);
      const n = Math.min(40, Math.ceil(H / 2));
      if (n !== mast.count || st.H !== H) {
        mast.count = n;
        const m = new THREE.Matrix4();
        for (let i = 0; i < n; i++) { m.makeTranslation(0, H - 2 - i * 2, 0); mast.setMatrixAt(i, m); }
        mast.instanceMatrix.needsUpdate = true;
        st.H = H;
      }
      head.position.set(mastX, STACK_TOP + H, 0);
      const jy = head.position.y + 1.1;
      jibPivot.rotation.z = st.flex * dir * 0.02;
      trolley.position.set(st.tx, jy - 0.22, 0);
      const hookTop = st.hookY + 0.33;
      const len = Math.max(0.3, jy - 0.4 - hookTop);
      for (const c of cables) {
        c.position.set(st.tx, jy - 0.4, c.position.z);
        c.scale.y = len;
        c.rotation.z = st.swing;
      }
      hook.position.set(st.tx + Math.sin(st.swing) * len, st.hookY, 0);
      hook.rotation.z = st.swing;
    }
    place();
    return {
      group: g, hold, dir, side,
      get jibY() { return head.position.y + 1.1; },
      /** Moves the crane: the jib eases to `jibY`, the trolley sits at `tx`, the hook at `hookY` (m). */
      set({ jibY, tx, hookY, swing }) {
        if (jibY != null) st.jibY = jibY;
        if (tx != null) st.tx = tx;
        if (hookY != null) st.hookY = hookY;
        if (swing != null) st.swing = swing;
        place();
      },
      /** The jib's whip after a throw. */
      whip(k = 1) { st.flexV += 9 * k; },
      update(dt, time) {
        st.flexV += (-st.flex * 60 - st.flexV * 6) * dt;
        st.flex += st.flexV * dt;
        flag.userData.wave?.(time);
        place();
      },
    };
  }

  const ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.26, depthWrite: false });
  const ghostGold = new THREE.MeshBasicMaterial({ color: '#ffd04a', transparent: true, opacity: 0.42, depthWrite: false });
  /** The landing guide: a see-through copy of the block where it will land (gold when it lands a Perfek). */
  function ghost(shape) {
    const m = new THREE.Mesh(blockGeometry(shape), ghostMat);
    m.renderOrder = 4;
    m.userData.gold = (on) => { m.material = on ? ghostGold : ghostMat; };
    return m;
  }

  return { M, block, crown, seam, crack, crane, blockGeometry, tint, team, velvet, ghost };
}
