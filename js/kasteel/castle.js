// (1.17 3D) Die Kasteelreeks: a castle built from Daily Towers (the owner, 16 Oct 2026: "the CASTLE Series, which is
// made out of the tower you build with your daily challenge"; his pick: stone and timber). Every block of a day's tower
// keeps its exact shape and place: a Perfek block becomes dressed granite, a good one rough sandstone, a sloppy one a
// timber patch, so a castle shows how well its owner stacks. Corner towers and the keep stand joined by walls, a gate
// of timber and iron, battlements, banners in the owner's colour.
import * as THREE from '../../lib/three.module.min.js';
import { rng } from './world.js';

const PX = 25;   // game px per metre (js/config.js PX_PER_M)
// The Stapel blocks (js/game/blocks.js SHAPES, game px; outlines with a top-left origin, y down)
export const SHAPES = {
  plank: { w: 200, h: 40 }, slab: { w: 160, h: 48 }, brick: { w: 128, h: 56 }, crate: { w: 84, h: 84, u: true }, cube: { w: 60, h: 60, u: true },
  floor: { w: 300, h: 96, u: true }, log: { w: 260, h: 50 },
  pillar: { w: 52, h: 128 },
  wedge: { w: 150, h: 60, outline: [[30, 0], [120, 0], [150, 60], [0, 60]] },
  arch: { w: 132, h: 88, outline: [[0, 0], [56, 0], [56, 26], [76, 26], [76, 0], [132, 0], [132, 88], [0, 88]] },
  L: { w: 132, h: 88, outline: [[0, 0], [44, 0], [44, 44], [132, 44], [132, 88], [0, 88]] },
  J: { w: 132, h: 88, outline: [[88, 0], [132, 0], [132, 88], [0, 88], [0, 44], [88, 44]] },
  T: { w: 132, h: 88, outline: [[0, 0], [132, 0], [132, 44], [88, 44], [88, 88], [44, 88], [44, 44], [0, 44]] },
};
export const TEAM = {
  blue: { main: '#2f6fd0', dark: '#1b3f7e', light: '#8fb8ff' },
  red: { main: '#b3261e', dark: '#6f1410', light: '#ff9c8f' },
};

// --------------------------------------------------------------------------------------------- the materials
function canvas(w = 512, h = 512) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return `#${c.getHexString()}`;
};
/** Masonry: courses of stones with mortar between, every stone its own tint and grain; tiles seamlessly (2 m square). */
function masonry({ base, vary = 0.07, mortar, courses = 5, minLen = 150, maxLen = 290, seed = 1, chisel = 0.5 }) {
  const rand = rng(seed);
  const c = canvas();
  const g = c.getContext('2d');
  g.fillStyle = mortar;
  g.fillRect(0, 0, 512, 512);
  const rowH = 512 / courses;
  for (let r = 0; r < courses; r++) {
    const y = r * rowH;
    let x = -rand() * maxLen;
    while (x < 512) {
      const w = minLen + rand() * (maxLen - minLen);
      const col = shade(base, (rand() - 0.5) * vary * 2);
      for (const ox of [0, -512, 512]) {
        const sx = x + ox;
        if (sx + w < 0 || sx > 512) continue;
        const grd = g.createLinearGradient(0, y, 0, y + rowH);
        grd.addColorStop(0, shade(col, 0.04));
        grd.addColorStop(1, shade(col, -0.05));
        g.fillStyle = grd;
        g.beginPath();
        g.roundRect(sx + 3, y + 3, w - 6, rowH - 6, 7);
        g.fill();
      }
      x += w;
    }
  }
  // grain: speckles and chisel marks
  const img = g.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 26 * chisel;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 900; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
    g.fillRect(rand() * 512, rand() * 512, 1 + rand() * 3, 1 + rand() * 2);
  }
  return c;
}
/** Timber: boards running along u, with grain lines and knots. */
function timberCanvas(seed = 3) {
  const rand = rng(seed);
  const c = canvas();
  const g = c.getContext('2d');
  const boards = 6;
  const bh = 512 / boards;
  for (let b = 0; b < boards; b++) {
    const base = shade('#6e4a2c', (rand() - 0.5) * 0.12);
    g.fillStyle = base;
    g.fillRect(0, b * bh, 512, bh);
    for (let k = 0; k < 26; k++) {
      g.strokeStyle = `rgba(30,15,5,${0.08 + rand() * 0.14})`;
      g.lineWidth = 1 + rand() * 2;
      g.beginPath();
      const y0 = b * bh + rand() * bh;
      g.moveTo(0, y0);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y0 + Math.sin(x * 0.02 + k) * 3);
      g.stroke();
    }
    if (rand() < 0.6) {
      g.fillStyle = 'rgba(40,20,8,0.5)';
      g.beginPath();
      g.ellipse(rand() * 512, b * bh + bh / 2, 10, 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, b * bh, 512, 3);
  }
  return c;
}
function texture(c, renderer, repeat = 0.5) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function bump(c, repeat = 0.5) {
  const b = canvas();
  const g = b.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.6)';
  g.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(b);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}
export function castleMaterials(renderer) {
  const sand = masonry({ base: '#b8996c', mortar: '#5f4c38', courses: 5, seed: 4, vary: 0.08 });
  const gran = masonry({ base: '#c9c0b1', mortar: '#7c7468', courses: 4, minLen: 200, maxLen: 340, seed: 9, vary: 0.04, chisel: 0.3 });
  const wall = masonry({ base: '#a98d66', mortar: '#56442f', courses: 7, minLen: 90, maxLen: 200, seed: 13, vary: 0.1 });
  const wood = timberCanvas(5);
  return {
    sandstone: new THREE.MeshStandardMaterial({ map: texture(sand, renderer), bumpMap: bump(sand), bumpScale: 2.2, roughness: 0.93 }),
    granite: new THREE.MeshStandardMaterial({ map: texture(gran, renderer), bumpMap: bump(gran), bumpScale: 1.4, roughness: 0.78 }),
    wall: new THREE.MeshStandardMaterial({ map: texture(wall, renderer), bumpMap: bump(wall), bumpScale: 2.4, roughness: 0.95 }),
    timber: new THREE.MeshStandardMaterial({ map: texture(wood, renderer, 0.45), bumpMap: bump(wood, 0.45), bumpScale: 1.2, roughness: 0.85 }),
    iron: new THREE.MeshStandardMaterial({ color: '#34343a', roughness: 0.45, metalness: 0.75 }),
    rope: new THREE.MeshStandardMaterial({ color: '#b9a27a', roughness: 0.95 }),
    hide: new THREE.MeshStandardMaterial({ color: '#7a5636', roughness: 0.97 }),
  };
}

// ------------------------------------------------------------------------------------------------- geometry
const geoCache = new Map();
/** A shape (metres) pushed out `depth` deep, softly bevelled, centred on z; UVs in metres (the textures tile per 2 m). */
function extrude(key, shape, depth, bev = 0.05) {
  if (geoCache.has(key)) return geoCache.get(key);
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(depth - 2 * bev) / 2);
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}
const rect = (w, h) => new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]);
/** A stone box (bottom at y = 0), UVs in metres. */
export function stoneBox(w, h, d, mat) {
  const m = new THREE.Mesh(extrude(`box|${w}|${h}|${d}`, rect(w, h), d), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A banner on a pole (or hanging), the owner's colour with a white tower mark, waving. */
export function banner(team, { w = 2.6, h = 1.6, pole = 5, hanging = false } = {}) {
  const t = TEAM[team];
  const c = canvas(256, 160);
  const g = c.getContext('2d');
  g.fillStyle = t.main;
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = t.dark;
  g.fillRect(0, 0, 256, 14);
  g.fillRect(0, 146, 256, 14);
  g.fillStyle = '#f4efe6';
  const tx = hanging ? 128 : 118;
  g.fillRect(tx - 22, 52, 44, 66);
  for (let k = 0; k < 3; k++) g.fillRect(tx - 26 + k * 20, 40, 12, 14);
  g.fillStyle = t.main;
  g.fillRect(tx - 7, 92, 14, 26);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h, 14, 8);
  if (hanging) { geo.rotateZ(-Math.PI / 2); geo.translate(0, -w / 2, 0); } else geo.translate(w / 2, 0, 0);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.castShadow = true;
  if (!hanging) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, pole, 8), new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.8 }));
    p.position.y = pole / 2;
    p.castShadow = true;
    group.add(p);
    cloth.position.y = pole - h / 2 - 0.1;
  }
  group.add(cloth);
  const base = Float32Array.from(geo.attributes.position.array);
  group.userData.wave = (time) => {
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const k = hanging ? Math.min(1, -y / w) : x / w;
      pa.setZ(i, Math.sin((hanging ? -y : x) * 2.1 - time * (hanging ? 2 : 6)) * (hanging ? 0.08 : 0.17) * k);
    }
    pa.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return group;
}

// ------------------------------------------------------------------------------------------------ the towers
/** A Daily Tower as it might be stacked (until the real layouts are saved): blocks bottom to top, game metres. */
export function sampleDaily(rand, n) {
  const ids = ['plank', 'slab', 'brick', 'crate', 'cube', 'wedge', 'arch', 'L', 'J', 'T', 'plank', 'slab', 'brick', 'crate', 'pillar'];
  const out = [];
  let y = 0;
  let cx = 0;
  for (let i = 0; i < n; i++) {
    const id = i === 0 ? 'plank' : ids[Math.floor(rand() * ids.length)];
    const s = SHAPES[id];
    const r = rand();
    const rating = i === 0 || r < 0.38 ? 'P' : r < 0.83 ? 'G' : 'S';
    const off = rating === 'P' ? (rand() - 0.5) * 0.12 : rating === 'G' ? (rand() - 0.5) * 0.7 : (rand() - 0.5) * 1.5;
    cx = Math.max(-1.5, Math.min(1.5, cx + off));
    out.push({ shape: id, x: cx, y, rot: rating === 'S' ? (rand() - 0.5) * 0.05 : 0, rating });
    y += s.h / PX;
  }
  return out;
}

/** One tower from a day's blocks at castle scale `S` (metres per game metre). Returns { group, top, width, depth }. */
export function towerFromDaily(layout, mats, { S = 0.55, team = 'red', rand = Math.random, flag = true } = {}) {
  const group = new THREE.Group();
  let top = 0;
  let topB = null;
  for (const b of layout) {
    const def = SHAPES[b.shape] || SHAPES.plank;
    const sx = Number.isFinite(b.scale) ? b.scale : 1;   // (a block's size variant: width only, both for even shapes)
    const sy = def.u ? sx : 1;
    const W = ((def.w * sx) / PX) * S;
    const H = ((def.h * sy) / PX) * S;
    const pts = (def.outline || [[0, 0], [def.w, 0], [def.w, def.h], [0, def.h]]).map(([x, y]) => new THREE.Vector2(((x * sx) / PX) * S - W / 2, (((def.h - y) * sy) / PX) * S));
    const D = Math.max(2.6, Math.min(4.6, W * 1.02));
    const geo = extrude(`blk|${b.shape}|${sx}|${S}|${D}`, new THREE.Shape(pts), D, 0.045);
    const m = new THREE.Mesh(geo, b.rating === 'P' ? mats.granite : b.rating === 'G' ? mats.sandstone : mats.timber);
    m.position.set(b.x * S, b.y * S, 0);
    m.rotation.z = b.rot || 0;
    m.castShadow = m.receiveShadow = true;
    m.userData.block = b;
    m.userData.D = D;
    m.userData.S = S;
    group.add(m);
    if (b.y * S + H >= top) { top = b.y * S + H; topB = { x: b.x * S, W, D }; }
  }
  // battlements round the top block, and the flag
  if (topB && topB.W >= 1.5) {
    const mer = (x, z) => {
      const m = stoneBox(0.48, 0.72, 0.42, mats.granite);
      m.position.set(x, top, z);
      m.userData.merlon = [0.48, 0.72, 0.42];
      group.add(m);
    };
    const nx = Math.max(2, Math.round(topB.W / 0.95));
    for (let i = 0; i < nx; i++) {
      const x = topB.x - topB.W / 2 + 0.24 + (i * (topB.W - 0.48)) / (nx - 1);
      if (i % 2 === 0) { mer(x, topB.D / 2 - 0.21); mer(x, -topB.D / 2 + 0.21); }
    }
    const nz = Math.max(2, Math.round(topB.D / 0.95));
    for (let i = 1; i < nz - 1; i++) {
      const z = -topB.D / 2 + 0.21 + (i * (topB.D - 0.42)) / (nz - 1);
      if (i % 2 === 0) { mer(topB.x - topB.W / 2 + 0.24, z); mer(topB.x + topB.W / 2 - 0.24, z); }
    }
  }
  let fl = null;
  if (flag && topB) {
    fl = banner(team, { pole: 4.5 });
    fl.position.set(topB.x - Math.min(1, topB.W / 2 - 0.4), top, -0.4);
    group.add(fl);
  }
  return { group, top, width: topB?.W || 3, depth: topB?.D || 3, flag: fl };
}

// --------------------------------------------------------------------------------------- walls, gate, castle
function wallRun(a, b, mats, { H = 7.2, T = 2.6, gap = 0 } = {}) {
  const group = new THREE.Group();
  const len = a.distanceTo(b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  group.position.copy(mid);
  group.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  const pieces = gap ? [[-len / 2, -gap / 2], [gap / 2, len / 2]] : [[-len / 2, len / 2]];
  for (const [x0, x1] of pieces) {
    const w = x1 - x0;
    const m = stoneBox(w, H, T, mats.wall);
    m.position.set((x0 + x1) / 2, 0, 0);
    m.userData.wall = [w, H, T];
    group.add(m);
    // battlements on the outer edge (+z of the run faces outwards when the castle is walked round anticlockwise)
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.1) {
      const mer = stoneBox(0.6, 0.85, 0.5, mats.wall);
      mer.position.set(x, H, T / 2 - 0.25);
      group.add(mer);
    }
    // a timber walkway inside
    const walk = stoneBox(w, 0.18, 1.2, mats.timber);
    walk.position.set((x0 + x1) / 2, H - 0.9, -T / 2 - 0.55);
    group.add(walk);
  }
  return group;
}

function gatehouse(mats, team) {
  const group = new THREE.Group();
  for (const s of [-1, 1]) {
    const jamb = stoneBox(2.2, 10.2, 3.6, mats.granite);
    jamb.position.set(s * 3.6, 0, 0);
    jamb.userData.wall = [2.2, 10.2, 3.6];
    group.add(jamb);
    for (let k = 0; k < 2; k++) {
      const mer = stoneBox(0.6, 0.9, 0.5, mats.granite);
      mer.position.set(s * 3.6 + (k ? 0.6 : -0.6), 10.2, 1.55);
      group.add(mer);
    }
    const hang = banner(team, { w: 3.4, h: 1.25, hanging: true });
    hang.position.set(s * 3.6, 9.4, 1.84);
    group.add(hang);
  }
  const lintel = stoneBox(9.4, 2.4, 3.6, mats.granite);
  lintel.position.set(0, 7.8, 0);
  lintel.userData.wall = [9.4, 2.4, 3.6];
  group.add(lintel);
  // the doors: timber with iron bands and studs
  for (const s of [-1, 1]) {
    const door = stoneBox(2.5, 7.4, 0.32, mats.timber);
    door.position.set(s * 1.27, 0.05, 0.9);
    door.userData.door = [2.5, 7.4, 0.32];
    group.add(door);
    for (const y of [1.2, 3.6, 6.0]) {
      const band = stoneBox(2.4, 0.18, 0.06, mats.iron);
      band.position.set(0, y - 0.05, 0.18);
      door.add(band);
    }
  }
  // the portcullis, half raised
  const portcullis = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const bar = stoneBox(0.12, 3.2, 0.12, mats.iron);
    bar.position.set(-2.3 + i * 0.92, 5.6, 1.45);
    portcullis.add(bar);
  }
  for (let j = 0; j < 3; j++) {
    const bar = stoneBox(5, 0.12, 0.12, mats.iron);
    bar.position.set(0, 5.9 + j * 1.1, 1.45);
    portcullis.add(bar);
  }
  group.add(portcullis);
  group.userData.portcullis = portcullis;
  return group;
}

function torch(mats) {
  const group = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), mats.timber);
  stick.rotation.x = -0.5;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), new THREE.MeshBasicMaterial({ color: '#ffb347' }));
  flame.position.set(0, 0.45, 0.2);
  const glow = new THREE.PointLight('#ff9a3c', 14, 14, 1.8);
  glow.position.set(0, 0.6, 0.35);
  group.add(stick, flame, glow);
  group.userData.flame = flame;
  return group;
}

/**
 * A whole castle at `at` facing +z (towards the attacker): corner towers from the given days, the keep (the best day),
 * walls with battlements and a timber walk, the gatehouse in the front wall. `days`: [layout, ...] (the first is the keep).
 * Returns { group, towers: [{ group, pos, top }], keep, walls, gate, flags, spots: { wall: [Vector3], towers: [...] } }.
 */
export function buildCastle({ at = new THREE.Vector3(), days, team = 'red', mats, rand = Math.random, half = 15, S = 0.55 }) {
  const group = new THREE.Group();
  group.position.copy(at);
  const corners = [[-half, half], [half, half], [half, -half], [-half, -half]];
  const towers = [];
  const flags = [];
  // (a very tall Daily Tower keeps its shape but is scaled to stand in a castle: the keep at most 34 m, the others 24 m)
  const fit = (layout, max, s0) => {
    let h0 = 0;
    for (const b of layout) { const d = SHAPES[b.shape] || SHAPES.plank; h0 = Math.max(h0, b.y + ((d.h * (d.u && Number.isFinite(b.scale) ? b.scale : 1)) / PX)); }
    return h0 > 0 ? Math.min(s0, max / h0) : s0;
  };
  const keepT = towerFromDaily(days[0], mats, { S: fit(days[0], 34, S * 1.08), team, rand });
  keepT.group.position.set(0, 0, -half * 0.35);
  group.add(keepT.group);
  towers.push({ ...keepT, pos: keepT.group.position.clone(), keep: true });
  if (keepT.flag) flags.push(keepT.flag);
  corners.forEach(([x, z], i) => {
    const lay = days[1 + (i % (days.length - 1))];
    const t = towerFromDaily(lay, mats, { S: fit(lay, 24, S), team, rand });
    t.group.position.set(x, 0, z);
    t.group.rotation.y = i % 2 ? 0.04 : -0.04;
    group.add(t.group);
    towers.push({ ...t, pos: t.group.position.clone() });
    if (t.flag) flags.push(t.flag);
  });
  // walls between the corners (the front run has the gate)
  const P = corners.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const runs = [[P[0], P[1], 9.4], [P[1], P[2], 0], [P[2], P[3], 0], [P[3], P[0], 0]];
  const walls = runs.map(([a, b, gap]) => { const w = wallRun(a, b, mats, { gap }); group.add(w); return w; });
  const gate = gatehouse(mats, team);
  gate.position.set(0, 0, half);
  group.add(gate);
  const torches = [];
  for (const s of [-1, 1]) {
    const t = torch(mats);
    t.position.set(s * 5.1, 4.6, half + 1.9);
    group.add(t);
    torches.push(t);
  }
  // where defenders stand: along the front wall's walk, on the gatehouse, on the tower tops
  const spots = {
    wall: [],
    towers: towers.map((t) => new THREE.Vector3(t.pos.x, t.top, t.pos.z + 0.6)),
    gate: [new THREE.Vector3(-1.6, 0, half - 3.5), new THREE.Vector3(1.6, 0, half - 3.5)],
    oil: new THREE.Vector3(0, 10.2, half + 0.7),
    field: [new THREE.Vector3(-6.5, 0, half + 9), new THREE.Vector3(0, 0, half + 12), new THREE.Vector3(6.5, 0, half + 9)],
  };
  for (let x = -half + 3; x <= half - 3; x += 3.6) if (Math.abs(x) > 5.4) spots.wall.push(new THREE.Vector3(x, 7.2, half - 0.35));
  return { group, towers, keep: towers[0], walls, gate, flags, torches, spots };
}
