// (1.19 3D) Glybaan's hazards. The owner (18 Oct 2026), of the painted blocks that rose in the lanes: "the blocks that pops
// up is not what I have in mind it needs to be "Cooler" ... So I want a whirlpool, Waterfalls, Fire and Lava, you get the
// idea, not just block, bleh." Each element's hazard is now a piece of nature in the chute, alive in its own shader: water
// a whirlpool or a waterfall, fire a fire pit or a pool of lava, grass a knot of thorny vines, stone a boulder. What each
// does to you is still rules.js's (the ring the game lays under it says so). One program per look, one clock for them all,
// a seed per hazard so no two move alike; the game pools them.
import * as THREE from '../../lib/three.module.min.js';

/** Each element's looks (a row's lane picks one; the rules are the same for all of an element's looks). */
export const VARIANTS = Object.freeze({
  water: Object.freeze(['whirl', 'fall']),
  vuur: Object.freeze(['fire', 'lava']),
  gras: Object.freeze(['vines']),
  stone: Object.freeze(['rock']),
});

const clock = { value: 0 };
const pxPerUnit = { value: 900 };   // (a point's size: screen pixels for 1 m at 1 m away)

const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.07 + 13.7; a *= 0.5; }
  return s / 0.875;
}
`;
const OUT = '#include <tonemapping_fragment>\n#include <colorspace_fragment>';
const HEAD = /* glsl */ `uniform float uT;\nuniform float uSeed;\nuniform float uPx;\n${NOISE}`;

/** A material of our own: the shared clock, its own seed. */
function shaderMat(vert, frag, { add = false, side = THREE.FrontSide, extra = {} } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: clock, uPx: pxPerUnit, uSeed: { value: Math.random() }, ...extra },
    vertexShader: `${HEAD}\n${vert}`,
    fragmentShader: `${HEAD}\n${frag}`,
    transparent: true,
    depthWrite: false,
    side,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// ----------------------------------------------------------------------------------------------------- shared shapes
/** A disc lying on the chute's floor (its shader gets the spot on it, -1..1). */
const DISC_VERT = /* glsl */ `
uniform float uR;
varying vec2 vP;
void main() {
  vP = position.xz / uR;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const discGeos = new Map();
function disc(r) {
  if (!discGeos.has(r)) discGeos.set(r, new THREE.CircleGeometry(r, 56).rotateX(-Math.PI / 2));
  return discGeos.get(r);
}
function floorDisc(r, frag, opts = {}, y = 0.04) {
  const m = new THREE.Mesh(disc(r), shaderMat(DISC_VERT, frag, { ...opts, extra: { uR: { value: r }, ...(opts.extra || {}) } }));
  m.position.y = y;
  m.renderOrder = opts.order ?? 1;
  return m;
}

/** A soft light on the floor (additive): a fire's light, lava's heat. */
const GLOW_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uPulse;
varying vec2 vP;
void main() {
  float r = length(vP);
  float a = 1.0 - smoothstep(0.0, 1.0, r);
  a *= a;
  a *= 1.0 + uPulse * (0.2 * sin(uT * 7.0 + uSeed * 40.0) + 0.12 * sin(uT * 13.0 + uSeed * 17.0));
  gl_FragColor = vec4(uCol, a);
  ${OUT}
}`;
function glow(r, color, pulse = 1) {
  return floorDisc(r, GLOW_FRAG, { add: true, order: 3, extra: { uCol: { value: new THREE.Color(color) }, uPulse: { value: pulse } } }, 0.05);
}

/** Quads that always face the camera, grown in the shader from an anchor (`at`) by their corners. */
function quads(list, corners) {
  const n = list.length;
  const pos = new Float32Array(n * 12);
  const cor = new Float32Array(n * 8);
  const inf = new Float32Array(n * 16);
  const idx = [];
  list.forEach((q, i) => {
    for (let k = 0; k < 4; k++) {
      pos.set(q.at, (i * 4 + k) * 3);
      cor.set(corners[k], (i * 4 + k) * 2);
      inf.set(q.info, (i * 4 + k) * 4);
    }
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(cor, 2));
  g.setAttribute('aInfo', new THREE.BufferAttribute(inf, 4));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 4.5);   // (they grow in the shader: a generous sphere)
  return g;
}
const UP_CORNERS = [[-1, 0], [1, 0], [-1, 1], [1, 1]];
const MID_CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

/** Points placed by the shader (`aE`, four numbers each); a generous sphere for culling. */
function points(n, fill) {
  const g = new THREE.BufferGeometry();
  const e = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) e.set(fill(i), i * 4);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aE', new THREE.BufferAttribute(e, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 4.5);
  return g;
}
const DOT_FRAG = /* glsl */ `
uniform vec3 uCol;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.15, 0.5, d)) * vA;
  gl_FragColor = vec4(uCol, a);
  ${OUT}
}`;

/** Several shapes in one (vertex colours kept): one draw for a pile of rocks or a knot of vines. */
function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    else col.fill(1, o * 3, (o + c) * 3);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
/** Vertex colours: one colour, or `fn(x, y, z) → THREE.Color` per vertex. */
function paint(g, c) {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const one = typeof c === 'function' ? null : new THREE.Color(c);
  for (let i = 0; i < p.count; i++) {
    const k = one || c(p.getX(i), p.getY(i), p.getZ(i));
    col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** A seeded random (the shapes are made once, the same every time). */
function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A craggy low-poly rock: an icosahedron pushed in and out, its foot flattened; darker in its hollows. */
function rockGeo(r, radius, { detail = 1, squash = 0.8, rough = 0.22, light = '#8c8478', dark = '#4a443d' } = {}) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const f = [r() * 9, r() * 9, r() * 9, r() * 9, r() * 9, r() * 9];
  const bump = (n) => Math.sin(n.x * 2.3 + f[0]) * Math.sin(n.y * 2.9 + f[1]) * Math.sin(n.z * 2.6 + f[2]) + 0.5 * Math.sin(n.x * 5.1 + f[3]) * Math.sin(n.y * 4.7 + f[4]) * Math.sin(n.z * 5.6 + f[5]);
  // (the same corner, the same push: a vertex shared by several faces stays shared)
  const cache = new Map();
  const ks = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!cache.has(key)) {
      const n = v.clone().normalize();
      const k = 1 + rough * bump(n);
      const w = n.multiplyScalar(radius * k);
      w.y *= squash;
      if (w.y < -radius * 0.25) w.y = -radius * 0.25 + (w.y + radius * 0.25) * 0.25;
      cache.set(key, [w, k]);
    }
    const [w, k] = cache.get(key);
    p.setXYZ(i, w.x, w.y, w.z);
    ks[i] = k;
  }
  g.translate(0, radius * 0.25 * squash, 0);
  g.computeVertexNormals();
  const cl = new THREE.Color(light);
  const cd = new THREE.Color(dark);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = cd.clone().lerp(cl, Math.min(1, Math.max(0, (ks[i] - (1 - rough)) / (2 * rough))) * (0.75 + 0.25 * r()));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.04 });
/** A ring of rocks round a pit (a fire's, lava's). */
function rimRocks(seed, n, radius, size) {
  const r = rand(seed);
  const gs = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const g = rockGeo(r, size * (0.75 + r() * 0.5), { detail: 0, squash: 0.6, rough: 0.3, light: '#5b524c', dark: '#272220' });
    g.rotateY(r() * 6.28);
    g.translate(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    gs.push(g);
  }
  const m = new THREE.Mesh(merge(gs), rockMat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ----------------------------------------------------------------------------------------------------- water: whirlpool
const WHIRL_FRAG = /* glsl */ `
varying vec2 vP;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float a = atan(vP.y, vP.x);
  float spin = uT * 2.2 + uSeed * 6.2832;
  // arms that wind in to the eye as it turns
  float arms = 0.5 + 0.5 * sin(a * 3.0 + 7.0 * log(r + 0.07) + spin * 3.0);
  float br = fbm(vec2(a * 2.0 + spin, r * 6.0 - uT * 2.0));
  float foam = smoothstep(0.55, 0.95, arms * 0.8 + br * 0.45) * smoothstep(0.08, 0.38, r);
  vec3 col = mix(vec3(0.0, 0.02, 0.07), vec3(0.01, 0.2, 0.4), smoothstep(0.0, 0.3, r));
  col = mix(col, vec3(0.1, 0.6, 0.86), smoothstep(0.3, 0.88, r));
  col = mix(col, vec3(0.86, 0.97, 1.0), foam * 0.7);
  // the white lip where it starts to turn, and a gleam on its slope
  float lip = smoothstep(0.74, 0.86, r) * (1.0 - smoothstep(0.9, 1.0, r));
  col = mix(col, vec3(0.95, 1.0, 1.0), lip * (0.45 + 0.55 * vnoise(vec2(a * 5.0 - spin * 1.5, uT * 1.5))));
  float gleam = smoothstep(0.7, 1.0, sin(a - 0.8 + spin * 0.5)) * smoothstep(0.25, 0.6, r) * (1.0 - smoothstep(0.7, 0.9, r));
  col += vec3(0.5, 0.8, 1.0) * gleam * 0.4;
  gl_FragColor = vec4(col * 0.92, 1.0 - smoothstep(0.93, 1.0, r));
  ${OUT}
}`;
/** Spray thrown round the whirlpool's lip (points circling and hopping). */
const SPRAY_VERT = /* glsl */ `
attribute vec4 aE;   // angle, radius, phase, size
varying float vA;
void main() {
  float t = fract(uT * 0.9 + aE.z);
  float a = aE.x + uT * 2.2;
  vec3 p = vec3(cos(a), 0.0, sin(a)) * aE.y;
  p.y = 0.08 + 0.7 * t * (1.0 - t) * 4.0 * 0.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aE.w * uPx / -mv.z;
  vA = sin(t * 3.1416) * 0.9;
}`;
function whirl() {
  const g = new THREE.Group();
  g.add(floorDisc(1.2, WHIRL_FRAG, { order: 1 }));
  const r = rand(11);
  const spray = new THREE.Points(points(26, () => [r() * 6.28, 0.95 + r() * 0.25, r(), 0.08 + r() * 0.06]), shaderMat(SPRAY_VERT, DOT_FRAG, { extra: { uCol: { value: new THREE.Color('#e9f8ff') } } }));
  spray.renderOrder = 4;
  g.add(spray);
  return g;
}

// ----------------------------------------------------------------------------------------------------- water: waterfall
const FALL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FALL_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  float s = fbm(vec2(vUv.x * 12.0 + uSeed * 9.0, vUv.y * 1.4 + uT * 2.8));
  float s2 = vnoise(vec2(vUv.x * 30.0 + uSeed * 3.0, vUv.y * 3.5 + uT * 5.4));
  float streak = smoothstep(0.3, 0.85, s * 0.75 + s2 * 0.45);
  vec3 col = mix(vec3(0.16, 0.5, 0.86), vec3(0.9, 0.97, 1.0), streak);
  float a = (0.32 + 0.48 * streak) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
  gl_FragColor = vec4(col * 0.95, a);
  ${OUT}
}`;
const SPLASH_FRAG = /* glsl */ `
varying vec2 vP;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float a = atan(vP.y, vP.x);
  float c1 = fbm(vec2(a * 2.5 + uSeed * 7.0, r * 3.5 - uT * 2.8));
  float c2 = vnoise(vec2(a * 8.0 - uSeed * 3.0, r * 9.0 - uT * 5.0));
  float foam = smoothstep(0.35, 0.8, c1 * 0.7 + c2 * 0.45);
  foam = max(foam, 1.0 - smoothstep(0.0, 0.34, r));
  vec3 col = mix(vec3(0.08, 0.4, 0.74), vec3(0.92, 0.98, 1.0), foam * 0.85);
  gl_FragColor = vec4(col * 0.92, (0.65 + 0.35 * foam) * (1.0 - smoothstep(0.7, 1.0, r)));
  ${OUT}
}`;
/** Mist rising off the fall's foot: soft puffs that grow and fade. */
const MIST_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aInfo;   // size, rise, phase, -
varying vec2 vUv;
varying float vA;
void main() {
  float t = fract(uT * 0.35 + aInfo.z);
  vec3 p = position;
  p.y += t * aInfo.y;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += aCorner * aInfo.x * (0.6 + 0.8 * t);
  vUv = aCorner;
  vA = smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(0.55, 1.0, t));
  gl_Position = projectionMatrix * mv;
}`;
const MIST_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vA;
void main() {
  float r = length(vUv);
  float n = vnoise(vUv * 2.5 + uSeed * 9.0 + uT * 0.3);
  gl_FragColor = vec4(vec3(0.92, 0.97, 1.0), (1.0 - smoothstep(0.2, 1.0, r)) * (0.6 + 0.4 * n) * vA * 0.6);
  ${OUT}
}`;
/** Drops thrown out of the fall's foot. */
const DROPS_VERT = /* glsl */ `
attribute vec4 aE;   // angle, reach, phase, size
varying float vA;
void main() {
  float t = fract(uT * 1.15 + aE.z);
  vec3 p = vec3(cos(aE.x), 0.0, sin(aE.x)) * (0.35 + aE.y * t);
  p.y = 0.2 + 3.4 * t - 4.0 * t * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aE.w * uPx / -mv.z;
  vA = 1.0 - t;
}`;
const fallColumnGeo = new THREE.CylinderGeometry(0.55, 0.85, 7.5, 22, 1, true).translate(0, 3.75, 0);
function fall() {
  const g = new THREE.Group();
  g.add(floorDisc(1.22, SPLASH_FRAG, { order: 1 }));
  const col = new THREE.Mesh(fallColumnGeo, shaderMat(FALL_VERT, FALL_FRAG, { side: THREE.DoubleSide }));
  col.renderOrder = 2;
  g.add(col);
  const r = rand(23);
  const mist = new THREE.Mesh(quads(Array.from({ length: 6 }, (_, i) => ({ at: [Math.cos(i * 1.05) * 0.8, 0.3, Math.sin(i * 1.05) * 0.8], info: [0.9 + r() * 0.5, 1.4 + r(), i / 6 + r() * 0.1, 0] })), MID_CORNERS), shaderMat(MIST_VERT, MIST_FRAG));
  mist.renderOrder = 5;
  g.add(mist);
  const drops = new THREE.Points(points(30, () => [r() * 6.28, 0.8 + r() * 1.2, r(), 0.07 + r() * 0.06]), shaderMat(DROPS_VERT, DOT_FRAG, { extra: { uCol: { value: new THREE.Color('#dff4ff') } } }));
  drops.renderOrder = 4;
  g.add(drops);
  return g;
}

// ----------------------------------------------------------------------------------------------------- fire: a fire pit
/** A flame: a tongue of fire that narrows to a tip, its edge licking (noise), white-hot at its root. */
const FLAME_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aInfo;   // width, height, seed, lean
varying vec2 vUv;
varying float vSeed;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float flick = 1.0 + 0.14 * sin(uT * 9.0 + aInfo.z * 31.0) + 0.09 * sin(uT * 14.3 + aInfo.z * 17.0);
  mv.x += aCorner.x * aInfo.x + aCorner.y * aInfo.w;
  mv.y += (aCorner.y * flick - 0.12) * aInfo.y;
  vUv = aCorner;
  vSeed = aInfo.z + uSeed;
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
void main() {
  float y = vUv.y;
  float n = fbm(vec2(vUv.x * 1.6 + vSeed * 13.0, y * 2.2 - uT * 2.7 - vSeed * 5.0));
  float n2 = vnoise(vec2(vUv.x * 4.0 + vSeed * 3.0, y * 5.0 - uT * 5.5));
  float x = vUv.x + (n - 0.5) * 0.9 * y;
  float width = mix(0.95, 0.04, pow(y, 0.85));
  float body = 1.0 - smoothstep(width * 0.5, width, abs(x));
  float f = body * (1.0 - smoothstep(0.42, 1.0, y + (n2 - 0.5) * 0.4)) * smoothstep(0.0, 0.1, y);
  vec3 col = mix(vec3(0.95, 0.12, 0.02), vec3(1.0, 0.5, 0.05), smoothstep(0.15, 0.6, f));
  col = mix(col, vec3(1.0, 0.86, 0.5), smoothstep(0.75, 0.98, f) * (1.0 - y));
  gl_FragColor = vec4(col * (0.75 + 0.95 * f), f * 0.8);
  ${OUT}
}`;
/** The bed of coals: dark, its seams glowing and breathing. */
const EMBER_FRAG = /* glsl */ `
varying vec2 vP;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float n = fbm(vP * 3.2 + uSeed * 10.0 + vec2(0.0, uT * 0.4));
  float seam = 1.0 - smoothstep(0.0, 0.13, abs(n - 0.5));
  float hot = 1.0 - smoothstep(0.0, 0.85, r);
  float pulse = 0.75 + 0.25 * sin(uT * 5.0 + n * 10.0);
  vec3 col = mix(vec3(0.06, 0.02, 0.01), mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.6, 0.12), hot) * (1.5 + 2.0 * hot) * pulse, seam * (0.4 + 0.6 * hot));
  col += vec3(1.0, 0.35, 0.05) * hot * hot * 0.9;
  gl_FragColor = vec4(col, 1.0 - smoothstep(0.8, 1.0, r));
  ${OUT}
}`;
/** Sparks rising off a fire (or lava), drifting, going out. */
const SPARK_VERT = /* glsl */ `
attribute vec4 aE;   // x, z, speed, phase
uniform float uRise;
varying float vA;
void main() {
  float t = fract(uT * aE.z * 0.3 + aE.w);
  vec3 p = vec3(aE.x, t * uRise, aE.y);
  p.x += sin(uT * 3.0 + aE.w * 20.0) * 0.3 * t;
  p.z += cos(uT * 2.3 + aE.w * 13.0) * 0.3 * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.07 + 0.07 * (1.0 - t)) * uPx / -mv.z;
  vA = (1.0 - t) * smoothstep(0.0, 0.08, t);
}`;
const SPARK_FRAG = /* glsl */ `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.1, 0.5, d)) * vA;
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.14) * 3.0, a);
  ${OUT}
}`;
function sparks(n, rise, spread, seed) {
  const r = rand(seed);
  const p = new THREE.Points(points(n, () => [(r() - 0.5) * spread, (r() - 0.5) * spread, 0.8 + r() * 1.4, r()]), shaderMat(SPARK_VERT, SPARK_FRAG, { add: true, extra: { uRise: { value: rise } } }));
  p.renderOrder = 6;
  return p;
}
function fire() {
  const g = new THREE.Group();
  g.add(glow(2.0, '#ff6a14', 1));
  g.add(floorDisc(0.92, EMBER_FRAG, { order: 1 }));
  g.add(rimRocks(5, 9, 0.98, 0.3));
  const r = rand(41);
  const tongues = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28 + r();
    const rr = i === 0 ? 0 : 0.42 + r() * 0.15;
    // (one tall tongue in the middle, four lower round it leaning out)
    tongues.push({ at: [Math.cos(a) * rr, 0.1, Math.sin(a) * rr], info: [i === 0 ? 0.62 : 0.42 + r() * 0.15, i === 0 ? 3.4 : 1.6 + r() * 0.8, r(), i === 0 ? 0 : Math.cos(a) * 0.35] });
  }
  const flames = new THREE.Mesh(quads(tongues, UP_CORNERS), shaderMat(FLAME_VERT, FLAME_FRAG, { add: true, side: THREE.DoubleSide }));
  flames.renderOrder = 5;
  g.add(flames);
  g.add(sparks(22, 3.6, 1.2, 43));
  return g;
}

// ----------------------------------------------------------------------------------------------------- fire: lava pool
const LAVA_FRAG = /* glsl */ `
varying vec2 vP;
float edge(vec2 p, float t) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = 0.5 + 0.45 * sin(t + 6.2832 * hash22(n + g));
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return f2 - f1;
}
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  vec2 q = vP * 2.4 + uSeed * 7.0;
  q += (vec2(vnoise(q * 0.9 + uT * 0.12), vnoise(q * 0.9 - uT * 0.1 + 5.0)) - 0.5) * 0.9;
  float e = edge(q, uT * 0.35 + uSeed * 6.0);
  float crack = 1.0 - smoothstep(0.02, 0.15, e);
  float heat = vnoise(vP * 3.0 + uT * 0.3);
  vec3 crust = mix(vec3(0.07, 0.025, 0.02), vec3(0.22, 0.07, 0.03), heat);
  vec3 hot = mix(vec3(1.0, 0.26, 0.02), vec3(1.0, 0.78, 0.24), crack * heat);
  vec3 col = mix(crust, hot * (2.4 + 1.6 * heat), crack);
  // open lava in the middle, cooled at the shore
  float open = 1.0 - smoothstep(0.0, 0.55, r + (heat - 0.5) * 0.35);
  col = mix(col, vec3(1.0, 0.42, 0.05) * (2.2 + 1.0 * sin(uT * 2.0 + heat * 6.0)), open * 0.6);
  col *= 1.0 - 0.6 * smoothstep(0.82, 1.0, r);
  gl_FragColor = vec4(col, 1.0 - smoothstep(0.94, 1.0, r));
  ${OUT}
}`;
function lava() {
  const g = new THREE.Group();
  g.add(glow(2.1, '#ff5a10', 0.6));
  g.add(floorDisc(1.1, LAVA_FRAG, { order: 1 }));
  g.add(rimRocks(9, 12, 1.14, 0.3));
  g.add(sparks(12, 2.2, 1.6, 47));
  return g;
}

// ----------------------------------------------------------------------------------------------------- grass: vines
/** A tube that narrows to its tip along a curve (vines), coloured dark at the root and bright at the tip. */
function taperTube(curve, r0, segs, radial, root, tip) {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const cr = new THREE.Color(root);
  const ct = new THREE.Color(tip);
  const n = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const rad = r0 * (1 - 0.85 * t);
    const c = cr.clone().lerp(ct, t);
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      n.copy(frames.normals[i]).multiplyScalar(Math.cos(v)).addScaledVector(frames.binormals[i], Math.sin(v)).normalize();
      pos.push(p.x + rad * n.x, p.y + rad * n.y, p.z + rad * n.z);
      nor.push(n.x, n.y, n.z);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
/** A leaf: a pointed oval, bent a little. */
function leafGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.2, 0.18, 0, 0.5);
  s.quadraticCurveTo(-0.2, 0.18, 0, 0);
  return new THREE.ShapeGeometry(s, 4);
}
const vineGeos = [];
function vineGeo(seed) {
  const r = rand(seed);
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2 + r() * 0.6;
    const h = 2.3 + r() * 1.4;
    const out = 0.45 + r() * 0.55;
    const turn = (r() < 0.5 ? -1 : 1) * (1.4 + r() * 1.8);
    const pts = [];
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      const ang = a0 + turn * t;
      const rad = 0.42 + out * Math.sin(t * Math.PI * 0.85) + 0.1 * t;
      pts.push(new THREE.Vector3(Math.cos(ang) * rad, h * t + 0.1, Math.sin(ang) * rad));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    parts.push(taperTube(curve, 0.21 + r() * 0.06, 26, 8, '#1d4d18', '#7bd64f'));
    // thorns along it, pointing out
    for (let k = 0; k < 6; k++) {
      const t = 0.12 + 0.72 * (k / 6) + r() * 0.04;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const side = new THREE.Vector3(r() - 0.5, r() * 0.4, r() - 0.5).cross(tan).normalize();
      const thorn = new THREE.ConeGeometry(0.06, 0.3, 5);
      thorn.translate(0, 0.12, 0);
      thorn.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, side));
      thorn.translate(p.x + side.x * 0.1 * (1 - t), p.y + side.y * 0.1 * (1 - t), p.z + side.z * 0.1 * (1 - t));
      parts.push(paint(thorn, '#5a2a14'));
    }
    // two leaves
    for (let k = 0; k < 2; k++) {
      const t = 0.35 + 0.4 * k + r() * 0.1;
      const p = curve.getPointAt(t);
      const leaf = leafGeo();
      leaf.rotateX(-0.6 - r() * 0.5);
      leaf.rotateY(r() * 6.28);
      leaf.translate(p.x, p.y, p.z);
      parts.push(paint(leaf, k ? '#58c23a' : '#3f9e2c'));
    }
  }
  // the knot of roots they burst from
  const mound = new THREE.SphereGeometry(0.85, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  mound.scale(1, 0.42, 1);
  parts.push(paint(mound, (x, y) => new THREE.Color('#24461a').lerp(new THREE.Color('#4f7a2c'), Math.min(1, y * 3))));
  return merge(parts);
}
function vineMat() {
  const seed = { value: Math.random() };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = clock;
    sh.uniforms.uSeed = seed;
    sh.vertexShader = `uniform float uT;\nuniform float uSeed;\n${sh.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hh = max(0.0, position.y);
      float k = hh * hh * 0.07;
      transformed.x += sin(uT * 1.9 + hh * 1.3 + uSeed * 6.2832) * k;
      transformed.z += cos(uT * 1.6 + hh * 1.6 + uSeed * 4.0) * k;`);
  };
  return m;
}
function vines() {
  if (!vineGeos.length) for (const s of [3, 8, 15]) vineGeos.push(vineGeo(s));
  const g = new THREE.Group();
  const m = new THREE.Mesh(vineGeos[Math.floor(Math.random() * vineGeos.length)], vineMat());
  m.rotation.y = Math.random() * 6.28;
  m.castShadow = true;
  g.add(m);
  return g;
}

// ----------------------------------------------------------------------------------------------------- stone: a boulder
const boulderGeos = [];
function rock() {
  if (!boulderGeos.length) {
    for (const s of [2, 6, 12]) {
      const r = rand(s);
      const parts = [rockGeo(r, 1.08, { detail: 1, squash: 0.85, rough: 0.24 })];
      for (let i = 0; i < 4; i++) {
        const a = r() * 6.28;
        const p = rockGeo(r, 0.16 + r() * 0.14, { detail: 0, squash: 0.7, rough: 0.3 });
        p.translate(Math.cos(a) * (0.95 + r() * 0.2), 0, Math.sin(a) * (0.95 + r() * 0.2));
        parts.push(p);
      }
      boulderGeos.push(merge(parts));
    }
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(boulderGeos[Math.floor(Math.random() * boulderGeos.length)], rockMat);
  m.rotation.y = Math.random() * 6.28;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

const MAKERS = { whirl, fall, fire, lava, vines, rock };

/**
 * The hazards: `make(type, look)` builds one (its root on the chute's floor, about a lane across); `update(time, camera,
 * height)` moves them all on (the clock, and the size of a point for this screen).
 */
export function createHazards() {
  return {
    make(type, look) {
      const looks = VARIANTS[type] || VARIANTS.stone;
      const g = (MAKERS[looks.includes(look) ? look : looks[0]])();
      g.userData = { type, look };
      return g;
    },
    update(time, camera, height) {
      clock.value = time;
      pxPerUnit.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
  };
}
