// (1.19 3D) Glybaan's world beside the slide. The owner (18 Oct 2026), of the first elemental picture: "it is too simple now
// we need nice side projects now", then of the picture with floating islands, ruins and a waterfall: "It looks really
// good, please proceed"; and (19 Oct), of the game beside that picture: "it doesnt look close to that image". So the world
// is the picture's: islands crowned with big glowing fire crystals and ice crystals float high beside the slide, ruins
// overgrown with glowing vines stand on rocks in the sea, cliffs pour waterfalls into it, honeycomb panels of light hang in
// the air, and far behind him, where the slide begins, a ruined gate stands on its island against the light. The camera
// stands low ahead of him and looks back up the slide, so they rush at it and out of the sides of the screen; one instanced
// draw per part, so a cheap phone keeps its frames.
import * as THREE from '../../lib/three.module.min.js';

const NOISE = /* glsl */ `
float sh12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float snoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sh12(i), sh12(i + vec2(1.0, 0.0)), u.x), mix(sh12(i + vec2(0.0, 1.0)), sh12(i + vec2(1.0, 1.0)), u.x), u.y);
}`;
const clock = { value: 0 };
/** A lit material that paints its own glow (works instanced: the standard chunks place each copy). */
function painted(params, paint) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = clock;
    sh.vertexShader = `varying vec3 vOP;\nvarying vec3 vON;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vOP = position;\n  vON = normal;');
    sh.fragmentShader = `uniform float uT;\nvarying vec3 vOP;\nvarying vec3 vON;\n${NOISE}\n${sh.fragmentShader}`.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${paint}`);
  };
  m.customProgramCacheKey = () => paint;
  return m;
}
/** Lava in the cracks of a fire island's rock (the rock's own colour elsewhere). */
const LAVA = /* glsl */ `
  float n = snoise(vOP.xz * 0.9 + vOP.y * 0.6) * 0.65 + snoise(vOP.xz * 2.3 - vOP.y * 1.1) * 0.35;
  float crack = smoothstep(0.045, 0.0, abs(n - 0.5)) * smoothstep(0.1, -0.8, vOP.y);
  float heat = smoothstep(-0.6, -2.6, vOP.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.25, 0.04), max(crack, heat * 0.5));
  totalEmissiveRadiance = vec3(1.0, 0.26, 0.03) * (crack * 1.6 + heat * 0.9) * (0.85 + 0.15 * sin(uT * 1.7 + vOP.x));`;
/** A sea crag's rock: dark and streaked, wet and darker at its foot, moss on what faces up. */
const CRAG = /* glsl */ `
  float n = snoise(vOP.xz * 0.9 + vOP.y * 0.35) * 0.6 + snoise(vec2(vOP.x + vOP.z, vOP.y) * 2.4) * 0.4;
  diffuseColor.rgb *= 0.55 + 0.6 * n;
  diffuseColor.rgb *= 0.6 + 0.4 * smoothstep(-2.0, 6.0, vOP.y);
  float up = smoothstep(0.35, 0.8, normalize(vON).y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.32, 0.12) * (0.7 + 0.6 * n), up * smoothstep(0.3, 0.6, n + 0.2));`;
/** The honeycomb panel: cells of light, a few missing at its ragged edge (the walls' own pattern, the owner's favourite). */
const HEX = /* glsl */ `
  vec2 p = vOP.xy * 1.9;
  vec2 r = vec2(1.0, 1.732);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = p - g;
  if (length(id) > 2.4 + 1.2 * sh12(floor(id * 3.0 + 0.5))) discard;
  vec2 gg = abs(g);
  float edge = max(dot(gg, normalize(vec2(1.0, 1.732))), gg.x);
  float line = smoothstep(0.36, 0.46, edge);
  float pulse = 0.65 + 0.35 * sin(uT * 2.0 + id.y * 1.3 + id.x);
  diffuseColor.rgb = mix(vec3(1.0, 0.62, 0.16), vec3(0.3, 0.13, 0.02), line);
  totalEmissiveRadiance = mix(vec3(1.0, 0.55, 0.12) * (1.2 + 0.8 * pulse), vec3(0.15, 0.05, 0.0), line);`;
/** The waterfall: streaks of white water falling, brighter at the lip. */
const FALL = /* glsl */ `
  float s = snoise(vec2(vOP.x * 4.0, vOP.y * 0.5 + uT * 2.4)) * 0.65 + snoise(vec2(vOP.x * 9.0, vOP.y * 1.2 + uT * 3.6)) * 0.35;
  float lip = smoothstep(-2.0, 0.0, vOP.y);
  diffuseColor.a *= smoothstep(1.0, 0.55, abs(vOP.x)) * (0.55 + 0.45 * smoothstep(0.35, 0.8, s));
  totalEmissiveRadiance *= 0.45 + 1.1 * smoothstep(0.4, 0.85, s) + lip * 0.6;`;
/** Mist at a waterfall's foot: a soft cloud, turning slowly. */
const MIST = /* glsl */ `
  float m = smoothstep(1.0, 0.0, length(vOP.xy)) * (0.55 + 0.45 * snoise(vOP.xy * 2.2 + vec2(uT * 0.25, -uT * 0.4)));
  diffuseColor.a *= m;`;

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Several shapes as one (positions and normals, no index). */
function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const arr = new Float32Array(parts.reduce((a, p) => a + p.attributes[name].array.length, 0));
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}
/** A floating rock: flat on top, broken to a point underneath. */
function rockGeo(seed, w = 1.8, deep = 1.5) {
  const r = rand(seed);
  const g = new THREE.IcosahedronGeometry(w, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const k = 0.84 + r() * 0.26;
    x *= k; z *= k;
    y = y > 0 ? y * 0.22 : y * (deep + r() * 0.5);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;   // (an icosahedron is drawn without an index already)
}
/** A craggy rock standing in the sea (`h` tall from its foot): wider at its foot, leaning a little, bumped all round. */
function cliffGeo(seed, rad, h, taper = [0.62, 1.35]) {
  const r = rand(seed);
  const g = new THREE.CylinderGeometry(rad * taper[0], rad * taper[1], h, 14, 12).translate(0, h / 2, 0);
  const p = g.attributes.position;
  const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  const lean = (r() - 0.5) * 0.18;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.16 * Math.sin(a * 3 + ph[0] + y * 0.35) + 0.1 * Math.sin(a * 7 + ph[1] - y * 0.6) + 0.07 * Math.sin(y * 1.3 + ph[2]);
    const top = y > h - 0.01 ? 0.85 : 1;
    p.setXYZ(i, x * k * top + lean * y, y + (y > h - 0.01 ? Math.sin(a * 4 + ph[3]) * 0.35 : 0), z * k * top);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}
/** Big crystal points (a hexagonal prism with a point), leaning out from the middle of their rock. */
function crystals(seed, n, h, spread, lean = 0.6) {
  const r = rand(seed);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const hh = h * (i === 0 ? 1 : 0.45 + r() * 0.5);
    const rad = (i === 0 ? 0.62 : 0.3 + r() * 0.3) * (h / 4);
    const body = new THREE.CylinderGeometry(rad, rad * 1.08, hh * 0.72, 6).translate(0, hh * 0.36, 0);
    const tip = new THREE.ConeGeometry(rad, hh * 0.32, 6).translate(0, hh * 0.72 + hh * 0.16, 0);
    const c = merge([body, tip]);
    const a = r() * Math.PI * 2;
    const tilt = i === 0 ? 0.08 : lean * (0.5 + r() * 0.6);
    c.rotateX(Math.sin(a) * tilt);
    c.rotateZ(Math.cos(a) * tilt);
    c.translate(i === 0 ? 0 : Math.cos(a) * spread * (0.35 + r() * 0.5), 0.1, i === 0 ? 0 : Math.sin(a) * spread * (0.35 + r() * 0.5));
    parts.push(c);
  }
  return merge(parts);
}
/** A ruin: columns with their bases and heads, an arch between two of them, a broken one. */
function ruinGeo() {
  const parts = [];
  const column = (x, z, h) => {
    parts.push(new THREE.BoxGeometry(0.95, 0.35, 0.95).translate(x, 0.18, z));
    parts.push(new THREE.CylinderGeometry(0.3, 0.36, h, 10).translate(x, 0.35 + h / 2, z));
    if (h > 3) parts.push(new THREE.BoxGeometry(0.9, 0.3, 0.9).translate(x, 0.5 + h, z));
  };
  column(-1.6, 0, 4.2);
  column(1.6, 0, 4.2);
  column(-1.6, -2.6, 2.1);
  column(1.4, -2.4, 4.2);
  parts.push(new THREE.TorusGeometry(1.6, 0.3, 6, 16, Math.PI).translate(0, 4.65, 0));
  parts.push(new THREE.BoxGeometry(4.2, 0.45, 1.0).translate(0, 6.4, 0));
  parts.push(new THREE.BoxGeometry(4.6, 0.5, 3.8).translate(0, -0.2, -1.2));
  return merge(parts);
}
/** Vines over the ruin: coils round its columns, a loop hanging from the arch. */
function ruinVines() {
  const parts = [];
  class Coil extends THREE.Curve {
    constructor(x, z, h, turns, ph) { super(); Object.assign(this, { x, z, h, turns, ph }); }
    getPoint(t, out = new THREE.Vector3()) { const a = this.ph + t * this.turns * Math.PI * 2; return out.set(this.x + Math.cos(a) * 0.4, 0.4 + t * this.h, this.z + Math.sin(a) * 0.4); }
  }
  parts.push(new THREE.TubeGeometry(new Coil(-1.6, 0, 3.9, 2.4, 0), 40, 0.075, 5, false));
  parts.push(new THREE.TubeGeometry(new Coil(1.6, 0, 3.4, 2.0, 1.4), 36, 0.075, 5, false));
  parts.push(new THREE.TubeGeometry(new Coil(1.4, -2.4, 4.0, 2.6, 2.4), 40, 0.07, 5, false));
  parts.push(new THREE.TorusGeometry(1.25, 0.07, 5, 20, Math.PI).rotateZ(Math.PI).translate(0, 4.7, 0.36));
  const r = rand(31);
  const leaf = new THREE.OctahedronGeometry(0.16, 0).scale(0.6, 1.3, 0.25);
  for (let i = 0; i < 34; i++) {
    const l = leaf.clone();
    const side = i % 3;
    const x = side === 0 ? -1.6 : side === 1 ? 1.6 : 1.4;
    const z = side === 2 ? -2.4 : 0;
    const a = r() * Math.PI * 2;
    l.rotateZ((r() - 0.5) * 1.6);
    l.translate(x + Math.cos(a) * 0.48, 0.5 + r() * 3.8, z + Math.sin(a) * 0.48);
    parts.push(l);
  }
  return merge(parts);
}
/** A ruined gate: two towers, a great arch between them, walls and columns to the sides (where the slide begins). */
function gateGeo() {
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(new THREE.BoxGeometry(6, 19, 6).translate(s * 10.5, 9.5, 0));
    for (let k = 0; k < 3; k++) parts.push(new THREE.BoxGeometry(1.5, 2, 6.4).translate(s * 10.5 + (k - 1) * 2.25, 20, 0));
    parts.push(new THREE.BoxGeometry(14, 9, 2.4).translate(s * 20.5, 4.5, 1.5));
    for (let k = 0; k < 4; k++) parts.push(new THREE.CylinderGeometry(0.75, 0.85, 12, 10).translate(s * (15.5 + k * 3.4), 6, -1.2));
    parts.push(new THREE.BoxGeometry(14, 1.2, 2.2).translate(s * 20.5, 12.6, -1.2));
  }
  const arch = new THREE.Shape();
  arch.moveTo(-7.5, 0); arch.lineTo(7.5, 0); arch.lineTo(7.5, 19); arch.lineTo(-7.5, 19); arch.lineTo(-7.5, 0);
  const hole = new THREE.Path();
  hole.moveTo(-6.6, 0); hole.lineTo(-6.6, 11); hole.absarc(0, 11, 6.6, Math.PI, 0, true); hole.lineTo(6.6, 0); hole.lineTo(-6.6, 0);
  arch.holes.push(hole);
  parts.push(new THREE.ExtrudeGeometry(arch, { depth: 4, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -2));
  return merge(parts);
}

/** The kinds: their parts (a shape and its material), where they stand (`sea`: on a rock in the sea; else floating at
 *  `y` over the slide), how far out (`x`, from the slide's edge), how big. */
function kinds() {
  const stone = new THREE.MeshStandardMaterial({ color: '#4c4a62', roughness: 0.92, flatShading: true });
  const crag = painted({ color: '#5a5c6e', roughness: 0.88 }, CRAG);
  const fireRock = painted({ color: '#2a2026', roughness: 0.9 }, LAVA);
  const ruinStone = new THREE.MeshStandardMaterial({ color: '#a7a2b0', roughness: 0.85, flatShading: true });
  const fire = new THREE.MeshStandardMaterial({ color: '#d0500e', emissive: '#ff4a00', emissiveIntensity: 1.15, roughness: 0.15, flatShading: true });
  const ice = new THREE.MeshStandardMaterial({ color: '#6fbaf0', emissive: '#1f7cff', emissiveIntensity: 1.0, roughness: 0.1, flatShading: true });
  const vine = new THREE.MeshStandardMaterial({ color: '#2fae4a', emissive: '#22d04a', emissiveIntensity: 1.0, roughness: 0.5 });
  const hex = painted({ color: '#ff9d2e', emissive: '#ff9d2e', emissiveIntensity: 1, roughness: 0.4, side: THREE.DoubleSide }, HEX);
  const fall = painted({ color: '#cfeeff', emissive: '#a8e2ff', emissiveIntensity: 1.1, roughness: 0.3, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }, FALL);
  const mist = painted({ color: '#e8eeff', emissive: '#8f9cc8', emissiveIntensity: 0.7, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }, MIST);
  return [
    // fire crystals on a floating rock with lava in its cracks (high, the picture's top left)
    { w: 0.17, y: [5, 14], x: [6, 22], s: [1.1, 1.9], spin: true, parts: [[rockGeo(3, 2.0, 1.7), fireRock], [crystals(7, 6, 4.6, 1.4), fire]] },
    // an ice crystal star on its rock (the picture's top right)
    { w: 0.15, y: [5, 14], x: [6, 22], s: [1.1, 1.8], spin: true, parts: [[rockGeo(9, 1.6, 1.4), stone], [crystals(13, 9, 4.2, 0.6, 1.25), ice]] },
    // a ruin overgrown with glowing vines on its low rock in the sea
    { w: 0.33, sea: true, x: [4, 15], s: [1.3, 1.9], parts: [[cliffGeo(17, 3.4, 3.2), crag], [ruinGeo().translate(0, 3.2, 0), ruinStone], [ruinVines().translate(0, 3.2, 0), vine]] },
    // a honeycomb panel of light hanging in the air
    { w: 0.25, y: [1, 7], x: [2.5, 9], s: [0.8, 1.3], face: true, parts: [[new THREE.PlaneGeometry(6.4, 6.4).toNonIndexed(), hex]] },
    // a mossy crag pouring a waterfall into the sea, mist at its foot
    // (a broad crag, its face straight, the water falling clear of it from the lip)
    { w: 0.1, sea: true, x: [8, 20], s: [0.9, 1.15], face: true, parts: [[merge([cliffGeo(23, 5.2, 19, [0.9, 1.08]), cliffGeo(29, 3.4, 12.5).translate(5.6, 0, 1.8), cliffGeo(37, 2.8, 8).translate(-5.2, 0, 2.4)]), crag], [new THREE.PlaneGeometry(5.2, 18.6, 1, 8).translate(0, 9.6, -6.1).toNonIndexed(), fall], [new THREE.PlaneGeometry(16, 7).translate(0, 2.2, -6.8).toNonIndexed(), mist]] },
  ];
}

const hash = (n, s) => { const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * The world beside the slide (`trk` the slide's group, `slope` its fall; `behind` how far back it is drawn, `half` half its
 * width): `update(d, time)` moves it along as he slides `d` metres.
 */
export function createScenery(trk, { behind, half, slope, seaY, bend = () => 0 }) {
  const SP = 10;                       // (m) between two places for something
  const NEAR = -42;                    // (m) past the camera: gone
  const N = Math.ceil((behind - NEAR) / SP) + 1;
  const list = kinds();
  const meshes = list.map((k) => k.parts.map(([geo, mat]) => {
    const m = new THREE.InstancedMesh(geo, mat, N);
    m.frustumCulled = false;
    m.count = 0;
    if (mat.transparent) m.renderOrder = 2;
    trk.add(m);
    return m;
  }));
  // the gate where the slide begins, on its island in the haze (it stays where it is: the horizon's landmark)
  const gate = new THREE.Group();
  const gateStone = new THREE.MeshStandardMaterial({ color: '#5d5a72', roughness: 0.9, flatShading: true });
  gate.add(new THREE.Mesh(gateGeo(), gateStone));
  const isle = new THREE.Mesh(rockGeo(41, 16, 0.9), gateStone);
  isle.scale.set(1.5, 0.7, 0.8);
  isle.position.y = -1.2;
  gate.add(isle);
  const gateVines = new THREE.Mesh(merge([0, 1, 2, 3].map((i) => new THREE.TorusGeometry(2.6 + i * 0.7, 0.12, 5, 18, Math.PI * (0.5 + i * 0.12)).rotateZ(Math.PI * (0.9 + i * 0.3)).translate((i - 1.5) * 7, 10 + i * 3, -2.2))), list[2].parts[2][1]);
  gate.add(gateVines);
  gate.scale.setScalar(0.85);
  gate.position.set(0, -2.5 + bend(behind - 6), behind - 6);
  gate.rotation.x = slope;   // (upright in the world)
  trk.add(gate);

  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const counts = list.map(() => 0);
  return {
    gate,
    update(d, time) {
      clock.value = time;
      counts.fill(0);
      const b = d % SP;
      const base = Math.floor(d / SP);
      for (let k = 0; k < N; k++) {
        const n = base + k;
        if (hash(n, 7) < 0.2) continue;   // (now and then nothing: room to breathe)
        let ki = 0;
        for (let h = hash(n, 1); ki < list.length - 1 && h > list[ki].w; ki++) h -= list[ki].w;
        const kind = list[ki];
        const side = hash(n, 2) < 0.5 ? -1 : 1;
        const z = behind - 14 - (k * SP - b);
        if (z < NEAR) continue;
        // (they grow in out of the haze far back, and keep their size coming at the camera)
        const grow = Math.min(1, Math.max(0, (behind - 14 - z) / 40));
        const sc = (kind.s[0] + hash(n, 6) * (kind.s[1] - kind.s[0])) * (0.15 + 0.85 * grow);
        const x = side * (half + kind.x[0] + hash(n, 3) * (kind.x[1] - kind.x[0]));
        // (a rock in the sea stands on the sea; the rest float, bobbing a little)
        // (floating ones keep beside the slide where it sweeps up far back)
        p.set(x, kind.sea ? seaY(z) - 0.8 : kind.y[0] + hash(n, 4) * (kind.y[1] - kind.y[0]) + bend(z) + Math.sin(time * 0.7 + n) * 0.3, z);
        // (upright in the world; a waterfall and a panel face the camera, turned a little to the slide; the rest any way)
        e.set(slope, kind.face ? side * 0.35 : hash(n, 5) * 6.283 + (kind.spin ? time * 0.15 * (hash(n, 8) - 0.5) : 0), 0, 'XYZ');
        q.setFromEuler(e);
        m4.compose(p, q, s.set(sc, sc, sc));
        for (const m of meshes[ki]) m.setMatrixAt(counts[ki], m4);
        counts[ki]++;
      }
      meshes.forEach((parts, ki) => { for (const m of parts) { m.count = counts[ki]; m.instanceMatrix.needsUpdate = true; } });
    },
  };
}
