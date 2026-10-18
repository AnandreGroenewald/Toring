// (1.19 3D) Glybaan's world beside the slide. The owner (18 Oct 2026), of the first elemental picture: "it is too simple now
// we need nice side projects now", then of the picture with floating islands, ruins and a waterfall: "It looks really
// good, please proceed". Floating islands rush past on both sides, each one of five kinds: fire crystals, ice crystals, a
// ruin grown over with glowing vines, a honeycomb energy panel, a rock pillar with a waterfall of light. The middle of the
// slide stays clear. (The camera looks steeply down at him, so beside the slide it sees the sea far below: the islands
// float down there, between the slide and the sea.) One instanced draw per part, so a cheap phone keeps its frames.
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
    sh.vertexShader = `varying vec3 vOP;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vOP = position;');
    sh.fragmentShader = `uniform float uT;\nvarying vec3 vOP;\n${NOISE}\n${sh.fragmentShader}`.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${paint}`);
  };
  m.customProgramCacheKey = () => paint;
  return m;
}
/** The honeycomb panel: hexagons of light (the walls' own pattern, the owner's favourite). */
const HEX = /* glsl */ `
  vec2 p = vOP.xy * 2.6;
  vec2 r = vec2(1.0, 1.732);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 gg = abs(g);
  float edge = max(dot(gg, normalize(vec2(1.0, 1.732))), gg.x);
  float line = smoothstep(0.38, 0.47, edge);
  float pulse = 0.6 + 0.4 * sin(uT * 2.0 + vOP.y * 1.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.75, 0.3), line);
  totalEmissiveRadiance *= 0.25 + 1.6 * line * pulse;`;
/** The waterfall: streaks of light falling. */
const FALL = /* glsl */ `
  float s = snoise(vec2(vOP.x * 5.0, vOP.y * 0.6 + uT * 2.6)) * 0.7 + snoise(vec2(vOP.x * 11.0, vOP.y * 1.4 + uT * 4.0)) * 0.3;
  totalEmissiveRadiance *= 0.35 + 1.4 * smoothstep(0.45, 0.9, s);`;

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
function rockGeo(seed, w = 1.8) {
  const r = rand(seed);
  const g = new THREE.IcosahedronGeometry(w, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const k = 0.82 + r() * 0.3;
    x *= k; z *= k;
    y = y > 0 ? y * 0.28 : y * (1.15 + r() * 0.5);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}
/** Crystals: long pointed shards leaning out from a middle. */
function crystals(seed, n, h, spread) {
  const r = rand(seed);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const hh = h * (0.5 + r() * 0.6);
    const c = new THREE.ConeGeometry(0.22 + r() * 0.16, hh, 5).translate(0, hh / 2, 0);
    c.rotateZ((r() - 0.5) * 0.9);
    c.rotateX((r() - 0.5) * 0.9);
    c.translate((r() - 0.5) * spread, 0.3, (r() - 0.5) * spread);
    parts.push(c);
  }
  return merge(parts);
}
function ruinGeo() {
  const parts = [];
  for (const [x, z, h] of [[-0.9, 0, 2.8], [0.9, 0, 2.8], [0.2, -0.9, 1.3]]) parts.push(new THREE.CylinderGeometry(0.26, 0.32, h, 8).translate(x, 0.3 + h / 2, z));
  parts.push(new THREE.BoxGeometry(2.6, 0.38, 0.6).translate(0, 3.25, 0));
  return merge(parts);
}
function ruinVines() {
  const parts = [];
  for (const [x, y] of [[-0.9, 0.9], [-0.9, 2.1], [0.9, 1.4], [0.9, 2.5]]) parts.push(new THREE.TorusGeometry(0.33, 0.06, 5, 14).rotateX(Math.PI / 2 + 0.25).translate(x, y, 0));
  parts.push(new THREE.TorusGeometry(1.2, 0.07, 5, 20, Math.PI).translate(0, 2.85, 0.32));
  return merge(parts);
}

/** The kinds: each has its parts (a shape and its material), how high it floats, how big it may be. */
function kinds() {
  const stone = new THREE.MeshStandardMaterial({ color: '#6e6a8c', roughness: 0.9, flatShading: true });
  const ruinStone = new THREE.MeshStandardMaterial({ color: '#8d8a96', roughness: 0.85, flatShading: true });
  const fire = new THREE.MeshStandardMaterial({ color: '#ffb06a', emissive: '#ff6a1a', emissiveIntensity: 2.3, roughness: 0.2, flatShading: true, fog: false });
  const ice = new THREE.MeshStandardMaterial({ color: '#cfefff', emissive: '#4fb8ff', emissiveIntensity: 2.1, roughness: 0.15, flatShading: true, fog: false });
  const vine = new THREE.MeshStandardMaterial({ color: '#2f8a3a', emissive: '#3dff6a', emissiveIntensity: 1.1, roughness: 0.5, fog: false });
  const hex = painted({ color: '#3a2410', emissive: '#ff9d2e', emissiveIntensity: 1, roughness: 0.4, side: THREE.DoubleSide }, HEX);
  const fall = painted({ color: '#3f8fd8', emissive: '#7fd8ff', emissiveIntensity: 1, roughness: 0.3, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }, FALL);
  const pillar = new THREE.CylinderGeometry(1.0, 1.4, 9, 9, 3).translate(0, -1.5, 0);
  return [
    { y: [-22, -14], s: [2.2, 3.4], parts: [[rockGeo(3), stone], [crystals(7, 6, 3.4, 1.8), fire]] },
    { y: [-22, -14], s: [2.2, 3.4], parts: [[rockGeo(9), stone], [crystals(13, 7, 3.0, 2.0), ice]] },
    { y: [-24, -16], s: [2.0, 2.8], parts: [[rockGeo(17, 2.1), stone], [ruinGeo(), ruinStone], [ruinVines(), vine]] },
    { y: [-20, -12], s: [2.0, 2.6], parts: [[rockGeo(23, 1.5), stone], [new THREE.CircleGeometry(1.5, 6).translate(0, 1.9, 0).toNonIndexed(), hex]] },
    { y: [-15, -13], s: [2.0, 2.4], parts: [[pillar.toNonIndexed(), stone], [new THREE.PlaneGeometry(1.5, 12).translate(0, -3, 1.3).toNonIndexed(), fall]] },
  ];
}

const hash = (n, s) => { const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * The world beside the slide (`trk` the slide's group; `behind` and `len` its stretch, `half` half its width):
 * `update(d, time)` moves it along as he slides `d` metres.
 */
export function createScenery(trk, { behind, len, half }) {
  const SP = 13;                       // (m) between two places for an island
  const N = Math.ceil(len / SP) + 1;
  const list = kinds();
  const meshes = list.map((k) => k.parts.map(([geo, mat]) => {
    const m = new THREE.InstancedMesh(geo, mat, N);
    m.frustumCulled = false;
    m.count = 0;
    if (mat.transparent) m.renderOrder = 2;
    trk.add(m);
    return m;
  }));
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const counts = list.map(() => 0);
  return {
    update(d, time) {
      clock.value = time;
      counts.fill(0);
      const b = d % SP;
      const base = Math.floor(d / SP);
      for (let k = 0; k < N; k++) {
        const n = base + k;
        if (hash(n, 7) < 0.22) continue;   // (now and then nothing: room to breathe)
        const ki = Math.floor(hash(n, 1) * list.length);
        const kind = list[ki];
        const side = hash(n, 2) < 0.5 ? -1 : 1;
        const z = behind - (k * SP - b);
        const sc = kind.s[0] + hash(n, 6) * (kind.s[1] - kind.s[0]);
        p.set(side * (half + 3 + hash(n, 3) * 6 + sc), kind.y[0] + hash(n, 4) * (kind.y[1] - kind.y[0]) + Math.sin(time * 0.8 + n) * 0.25, z);
        // (a waterfall faces the slide; the rest turn as they like)
        q.setFromAxisAngle(up, ki === 4 ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : hash(n, 5) * 6.283);
        m4.compose(p, q, s.set(sc, sc, sc));
        for (const m of meshes[ki]) m.setMatrixAt(counts[ki], m4);
        counts[ki]++;
      }
      meshes.forEach((parts, ki) => { for (const m of parts) { m.count = counts[ki]; m.instanceMatrix.needsUpdate = true; } });
    },
  };
}
