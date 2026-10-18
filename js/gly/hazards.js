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
// ----------------------------------------------------------------------------------------------------- water: the whirlpool's and the waterfall's shaders
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
// ----------------------------------------------------------------------------------------------------- fire: flames and sparks
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
/** Flames (licking tongues of fire) from `tongues` ({ at, info: [width, height, seed, lean] }): a fire's, a fire man's hair. */
export function flameMesh(tongues) {
  const m = new THREE.Mesh(quads(tongues, UP_CORNERS), shaderMat(FLAME_VERT, FLAME_FRAG, { add: true, side: THREE.DoubleSide }));
  m.renderOrder = 5;
  return m;
}
function sparks(n, rise, spread, seed) {
  const r = rand(seed);
  const p = new THREE.Points(points(n, () => [(r() - 0.5) * spread, (r() - 0.5) * spread, 0.8 + r() * 1.4, r()]), shaderMat(SPARK_VERT, SPARK_FRAG, { add: true, extra: { uRise: { value: rise } } }));
  p.renderOrder = 6;
  return p;
}
// ----------------------------------------------------------------------------------------------------- grass: vines' parts
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
// ----------------------------------------------------------------------------------------------------- lane-shaped
// (the owner, 18 Oct 2026, of round props in hoops: "the rock does not fit, the round obstacles feels fake"; of the walls:
// "the walls is really good". Every hazard now fills its lane the way a wall fills the slide: grounded, edged, inside it.)
const LANE_HW = 1.1;   // (m) half a hazard's width: a lane is 2,5 m
const SD_BOX = /* glsl */ `
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }`;
const RECT_VERT = /* glsl */ `
varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
/** A rounded rectangle on the slide's floor (`w` across, `l` along), its shader told its size (uHalf, uRad). */
function floorRect(w, l, rad, frag, opts = {}, y = 0.04) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), shaderMat(RECT_VERT, frag, { ...opts, extra: { uHalf: { value: new THREE.Vector2(w / 2, l / 2) }, uRad: { value: rad }, ...(opts.extra || {}) } }));
  m.position.y = y;
  m.renderOrder = opts.order ?? 1;
  return m;
}
/** Rocks along a rectangle's edge (a trench's, a pool's shore). */
function edgeRocks(seed, hw, hl, n, size, colors = { light: '#6b6058', dark: '#2a2420' }) {
  const r = rand(seed);
  const gs = [];
  const per = 4 * hw + 4 * hl;
  for (let i = 0; i < n; i++) {
    let t = ((i + r() * 0.4) / n) * per;
    let x;
    let z;
    if (t < 2 * hw) { x = -hw + t; z = -hl; } else if ((t -= 2 * hw) < 2 * hl) { x = hw; z = -hl + t; } else if ((t -= 2 * hl) < 2 * hw) { x = hw - t; z = hl; } else { t -= 2 * hw; x = -hw; z = hl - t; }
    const g = rockGeo(r, size * (0.7 + r() * 0.6), { detail: 0, squash: 0.65, rough: 0.3, ...colors });
    g.rotateY(r() * 6.28);
    g.translate(x, 0, z);
    gs.push(g);
  }
  const m = new THREE.Mesh(merge(gs), rockMat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
/** Lava filling its rectangle: plates of crust, glowing seams, open lava deep in, cooled at the shore. */
const LAVA_RECT_FRAG = /* glsl */ `
uniform vec2 uHalf;
uniform float uRad;
varying vec2 vP;
${SD_BOX}
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
  float d = sdBox(vP, uHalf, uRad);
  if (d > 0.0) discard;
  vec2 q = vP * 1.9 + uSeed * 7.0;
  q += (vec2(vnoise(q * 0.9 + uT * 0.12), vnoise(q * 0.9 - uT * 0.1 + 5.0)) - 0.5) * 0.9;
  float e = edge(q, uT * 0.35 + uSeed * 6.0);
  float crack = 1.0 - smoothstep(0.02, 0.15, e);
  float heat = vnoise(vP * 2.2 + uT * 0.3);
  vec3 crust = mix(vec3(0.07, 0.025, 0.02), vec3(0.22, 0.07, 0.03), heat);
  vec3 hot = mix(vec3(1.0, 0.26, 0.02), vec3(1.0, 0.78, 0.24), crack * heat);
  vec3 col = mix(crust, hot * (2.4 + 1.6 * heat), crack);
  float inner = clamp(-d / 0.8, 0.0, 1.0);
  col = mix(col, vec3(1.0, 0.42, 0.05) * (2.2 + 1.0 * sin(uT * 2.0 + heat * 6.0)), smoothstep(0.45, 1.0, inner + (heat - 0.5) * 0.35) * 0.6);
  col *= 0.4 + 0.6 * smoothstep(0.0, 0.3, inner);
  gl_FragColor = vec4(col, smoothstep(0.0, 0.05, -d));
  ${OUT}
}`;
/** Coals filling a trench: dark, their seams glowing and breathing, hottest down the middle. */
const EMBER_RECT_FRAG = /* glsl */ `
uniform vec2 uHalf;
uniform float uRad;
varying vec2 vP;
${SD_BOX}
void main() {
  float d = sdBox(vP, uHalf, uRad);
  if (d > 0.0) discard;
  float inner = clamp(-d / 0.55, 0.0, 1.0);
  float n = fbm(vP * 2.6 + uSeed * 10.0 + vec2(0.0, uT * 0.4));
  float seam = 1.0 - smoothstep(0.0, 0.13, abs(n - 0.5));
  float pulse = 0.75 + 0.25 * sin(uT * 5.0 + n * 10.0);
  vec3 col = mix(vec3(0.06, 0.02, 0.01), mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.6, 0.12), inner) * (1.5 + 2.0 * inner) * pulse, seam * (0.4 + 0.6 * inner));
  col += vec3(1.0, 0.35, 0.05) * inner * inner * 0.8;
  gl_FragColor = vec4(col, smoothstep(0.0, 0.06, -d));
  ${OUT}
}`;
/** The foot of a curtain of water: churning foam, white where it lands. */
const SPLASH_RECT_FRAG = /* glsl */ `
uniform vec2 uHalf;
uniform float uRad;
varying vec2 vP;
${SD_BOX}
void main() {
  float d = sdBox(vP, uHalf, uRad);
  if (d > 0.0) discard;
  float c1 = fbm(vec2(vP.x * 2.2 + uSeed * 7.0, vP.y * 2.6 - uT * 2.8));
  float c2 = vnoise(vec2(vP.x * 6.0 - uSeed * 3.0, vP.y * 7.0 - uT * 5.0));
  float foam = smoothstep(0.35, 0.8, c1 * 0.7 + c2 * 0.45);
  foam = max(foam, 1.0 - smoothstep(0.0, 0.32, abs(vP.y)));
  vec3 col = mix(vec3(0.08, 0.4, 0.74), vec3(0.92, 0.98, 1.0), foam * 0.85);
  gl_FragColor = vec4(col * 0.92, (0.65 + 0.35 * foam) * smoothstep(0.0, 0.22, -d));
  ${OUT}
}`;
/** Water filling its rectangle, turning: a whirlpool's arms winding in to the dark eye, white water lapping at its edge. */
const WHIRL_RECT_FRAG = /* glsl */ `
uniform vec2 uHalf;
uniform float uRad;
varying vec2 vP;
${SD_BOX}
void main() {
  float d = sdBox(vP, uHalf, uRad);
  if (d > 0.0) discard;
  vec2 p = vP / uHalf;
  float r = length(p) * 0.92;
  float a = atan(p.y, p.x);
  float spin = uT * 2.2 + uSeed * 6.2832;
  float arms = 0.5 + 0.5 * sin(a * 3.0 + 7.0 * log(r + 0.07) + spin * 3.0);
  float br = fbm(vec2(a * 2.0 + spin, r * 6.0 - uT * 2.0));
  float foam = smoothstep(0.55, 0.95, arms * 0.8 + br * 0.45) * smoothstep(0.08, 0.38, r);
  vec3 col = mix(vec3(0.0, 0.02, 0.07), vec3(0.01, 0.2, 0.4), smoothstep(0.0, 0.3, r));
  col = mix(col, vec3(0.1, 0.6, 0.86), smoothstep(0.3, 0.88, r));
  col = mix(col, vec3(0.86, 0.97, 1.0), foam * 0.7);
  float gleam = smoothstep(0.7, 1.0, sin(a - 0.8 + spin * 0.5)) * smoothstep(0.25, 0.6, r) * (1.0 - smoothstep(0.7, 0.9, r));
  col += vec3(0.5, 0.8, 1.0) * gleam * 0.4;
  float lap = 1.0 - smoothstep(0.0, 0.07 + 0.08 * vnoise(vec2(a * 7.0 - spin * 1.5, uT * 1.7)), -d);
  col = mix(col, vec3(0.95, 1.0, 1.0), lap * 0.75);
  gl_FragColor = vec4(col * 0.92, smoothstep(0.0, 0.03, -d));
  ${OUT}
}`;
/** A rock's few stones (merged), the walls' own stone. */
function stones(r, list, colors) {
  return merge(list.map(([size, x, z, squash]) => {
    const g = rockGeo(r, size, { detail: size > 0.4 ? 1 : 0, squash, rough: 0.24, ...colors });
    g.rotateY(r() * 6.28);
    g.translate(x, 0, z);
    return g;
  }));
}
const STONE = { light: '#857b6e', dark: '#3b3631' };

/** Water, low: a whirlpool filling its lane (a pool the lane's shape, turning). */
function laneWhirl() {
  const g = new THREE.Group();
  g.add(floorRect(2 * LANE_HW - 0.1, 2.6, 0.5, WHIRL_RECT_FRAG, { order: 1 }));
  const r = rand(11);
  const spray = new THREE.Points(points(26, () => [r() * 6.28, 0.95 + r() * 0.2, r(), 0.08 + r() * 0.06]), shaderMat(SPRAY_VERT, DOT_FRAG, { extra: { uCol: { value: new THREE.Color('#e9f8ff') } } }));
  spray.scale.set(0.98, 1, 1.18);
  spray.renderOrder = 4;
  g.add(spray);
  return g;
}
/** Water, tall: a curtain of water falling across the lane between two stones, foaming at its foot. */
const curtainGeo = new THREE.PlaneGeometry(2 * LANE_HW - 0.1, 6.5, 1, 1).translate(0, 3.25, 0);
const curtainStones = [];
function curtain() {
  if (!curtainStones.length) for (const seed of [21, 27]) { const r = rand(seed); curtainStones.push(stones(r, [[0.3, -LANE_HW + 0.36, 0, 1.7], [0.3, LANE_HW - 0.36, 0, 1.6]], STONE)); }
  const g = new THREE.Group();
  g.add(floorRect(2 * LANE_HW, 1.6, 0.5, SPLASH_RECT_FRAG, { order: 1 }));
  const sheet = new THREE.Mesh(curtainGeo, shaderMat(FALL_VERT, FALL_FRAG, { side: THREE.DoubleSide }));
  sheet.renderOrder = 2;
  g.add(sheet);
  const rocks = new THREE.Mesh(curtainStones[Math.floor(Math.random() * curtainStones.length)], rockMat);
  rocks.castShadow = rocks.receiveShadow = true;
  g.add(rocks);
  const r = rand(23);
  const mist = new THREE.Mesh(quads(Array.from({ length: 5 }, (_, i) => ({ at: [-0.9 + i * 0.45, 0.3, -0.35], info: [0.75 + r() * 0.35, 1.3 + r(), i / 5 + r() * 0.1, 0] })), MID_CORNERS), shaderMat(MIST_VERT, MIST_FRAG));
  mist.renderOrder = 5;
  g.add(mist);
  const drops = new THREE.Points(points(26, () => [r() * 6.28, 0.6 + r() * 0.8, r(), 0.07 + r() * 0.06]), shaderMat(DROPS_VERT, DOT_FRAG, { extra: { uCol: { value: new THREE.Color('#dff4ff') } } }));
  drops.scale.set(1.2, 1, 0.6);
  drops.renderOrder = 4;
  g.add(drops);
  return g;
}
/** Fire, tall: a trench of glowing coals across the lane, a row of flames, stones along its sides. */
function trench() {
  const g = new THREE.Group();
  const lightOf = glow(1.9, '#ff6a14', 1);
  lightOf.scale.set(1, 1, 0.8);
  g.add(lightOf);
  g.add(floorRect(2 * LANE_HW, 1.5, 0.45, EMBER_RECT_FRAG, { order: 1 }));
  g.add(edgeRocks(5, LANE_HW - 0.3, 0.66, 14, 0.2));
  const r = rand(41);
  const tongues = [];
  for (let i = 0; i < 5; i++) {
    const x = -0.84 + i * 0.42;
    const mid = 1 - Math.abs(i - 2) / 2;
    tongues.push({ at: [x, 0.1, (r() - 0.5) * 0.3], info: [0.38 + r() * 0.08, 1.5 + mid * 1.2 + r() * 0.4, r(), (r() - 0.5) * 0.2] });
  }
  g.add(flameMesh(tongues));
  g.add(sparks(22, 3.4, 2.0, 43));
  return g;
}
/** Fire, low: lava filling its lane, its crust cracked and glowing, rocks along its shore. */
function lavaBed() {
  const g = new THREE.Group();
  const lightOf = glow(2.0, '#ff5a10', 0.6);
  lightOf.scale.set(1, 1, 1.15);
  g.add(lightOf);
  g.add(floorRect(2 * LANE_HW - 0.2, 2.4, 0.55, LAVA_RECT_FRAG, { order: 1 }));
  g.add(edgeRocks(9, LANE_HW - 0.28, 1.05, 16, 0.19));
  g.add(sparks(12, 2.2, 1.9, 47));
  return g;
}
/** Grass: a hedge of thorny vines grown right across the lane, swaying (three clumps on a long leafy mound). */
const thicketGeos = [];
function thicketGeo(seed) {
  const r = rand(seed);
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let cl = 0; cl < 4; cl++) {
    const cx = -0.66 + cl * 0.44;
    for (let k = 0; k < 3; k++) {
      const a0 = r() * 6.28;
      const h = 2.0 + r() * 1.5;
      const turn = (r() < 0.5 ? -1 : 1) * (1.4 + r() * 1.8);
      const out = 0.1 + r() * 0.18;
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const t = i / 7;
        const ang = a0 + turn * t;
        const rad = 0.1 + out * Math.sin(t * Math.PI * 0.9) + 0.05 * t;
        pts.push(new THREE.Vector3(cx + Math.cos(ang) * rad, h * t + 0.2, Math.sin(ang) * rad * 0.8));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      parts.push(taperTube(curve, 0.13 + r() * 0.05, 20, 7, '#1d4d18', '#7bd64f'));
      for (let n = 0; n < 4; n++) {
        const t = 0.15 + 0.7 * (n / 4) + r() * 0.04;
        const p = curve.getPointAt(t);
        const side = new THREE.Vector3(r() - 0.5, r() * 0.4, r() - 0.5).cross(curve.getTangentAt(t)).normalize();
        const thorn = new THREE.ConeGeometry(0.05, 0.24, 5);
        thorn.translate(0, 0.12, 0);
        thorn.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, side));
        thorn.translate(p.x + side.x * 0.08, p.y + side.y * 0.08, p.z + side.z * 0.08);
        parts.push(paint(thorn, '#5a2a14'));
      }
      const t = 0.5 + r() * 0.3;
      const p = curve.getPointAt(t);
      const leaf = leafGeo();
      leaf.rotateX(-0.6 - r() * 0.5);
      leaf.rotateY(r() * 6.28);
      leaf.translate(p.x, p.y, p.z);
      parts.push(paint(leaf, r() < 0.5 ? '#58c23a' : '#3f9e2c'));
    }
  }
  // the hedge they grow from: a long mound of leaves and roots across the lane, bushy on top
  const mound = new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  mound.scale(LANE_HW, 0.5, 0.6);
  parts.push(paint(mound, (x, y) => new THREE.Color('#24461a').lerp(new THREE.Color('#4f7a2c'), Math.min(1, y * 2.2))));
  for (let i = 0; i < 7; i++) {
    const bush = new THREE.IcosahedronGeometry(0.22 + r() * 0.12, 1);
    bush.translate(-0.78 + i * 0.26 + (r() - 0.5) * 0.08, 0.35 + r() * 0.1, (r() - 0.5) * 0.5);
    parts.push(paint(bush, r() < 0.5 ? '#3d8a2c' : '#58a83a'));
  }
  return merge(parts);
}
function thicket() {
  if (!thicketGeos.length) for (const s of [3, 8, 15]) thicketGeos.push(thicketGeo(s));
  const g = new THREE.Group();
  const m = new THREE.Mesh(thicketGeos[Math.floor(Math.random() * thicketGeos.length)], vineMat());
  m.castShadow = true;
  g.add(m);
  return g;
}
/** Stone: a dry-stone wall across the lane, too tall to jump: flat stones laid in courses (two, then three, like
 *  bricks), a long capstone on top, a few fallen at its foot. The gates' own stone. */
const barricadeGeos = [];
function slab(r, x, y, half, deep) {
  const g = rockGeo(r, 0.5, { detail: 0, squash: 0.62, rough: 0.16, ...STONE });
  g.scale(half / 0.5, 1, deep / 0.5);
  g.rotateY((r() - 0.5) * 0.12);
  g.translate(x, y, (r() - 0.5) * 0.06);
  return g;
}
function barricade() {
  if (!barricadeGeos.length) {
    for (const seed of [2, 6, 12]) {
      const r = rand(seed);
      const parts = [];
      let y = 0;
      for (let k = 0; k < 6; k++) {
        const n = k % 2 ? 3 : 2;
        const half = (2 * LANE_HW - 0.36) / n / 2;
        for (let i = 0; i < n; i++) parts.push(slab(r, -LANE_HW + 0.18 + half * (2 * i + 1) + (r() - 0.5) * 0.06, y, half * (0.9 + r() * 0.06), 0.42 - k * 0.025));
        y += 0.43;
      }
      parts.push(slab(r, (r() - 0.5) * 0.16, y, LANE_HW - 0.24, 0.42));
      for (let i = 0; i < 3; i++) {
        const g = rockGeo(r, 0.13 + r() * 0.06, { detail: 0, squash: 0.7, rough: 0.3, ...STONE });
        g.translate(-0.7 + i * 0.7 + (r() - 0.5) * 0.15, 0, (i % 2 ? -0.62 : 0.62) + (r() - 0.5) * 0.1);
        parts.push(g);
      }
      barricadeGeos.push(merge(parts));
    }
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(barricadeGeos[Math.floor(Math.random() * barricadeGeos.length)], rockMat);
  m.scale.x = Math.random() < 0.5 ? -1 : 1;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

// ----------------------------------------------------------------------------------------------------- the gates
/** A Shadow Gate's wall: a shimmering field of light, a honeycomb drifting up it, waves of brightness; `uHit` flashes it
 *  when a block goes through (gold). Its own material per gate (the flash), one program. */
const FIELD_VERT = /* glsl */ `
varying vec3 vPos;
void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FIELD_FRAG = /* glsl */ `
uniform float uHit;
uniform vec3 uDeep;
uniform vec3 uGlow;
uniform float uTop;
uniform float uBot;
varying vec3 vPos;
float hexEdge(vec2 p) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(g);
  return 0.5 - max(dot(q, vec2(0.5, 0.8660254)), q.x);
}
void main() {
  float e = hexEdge(vPos.xy * 0.55 + vec2(0.0, uT * 0.22));
  float line = 1.0 - smoothstep(0.0, 0.03, e);
  float sh = vnoise(vPos.xy * 0.7 + vec2(uT * 0.5, -uT * 0.35));
  // a band of light sweeping up the field, and its edges brighter (a field held at its rims)
  float sweep = smoothstep(0.85, 1.0, sin(vPos.y * 0.8 - uT * 2.4 + vPos.x * 0.15));
  float rim = smoothstep(uTop - 1.6, uTop, vPos.y) + smoothstep(uBot + 0.6, uBot, vPos.y) * 0.6;
  vec3 col = mix(uDeep * 0.4, uDeep, sh);
  col += uGlow * line * (1.0 + 0.8 * sweep) * 1.3;
  col += uGlow * 0.7 * (sweep * 0.35 + rim * 0.4);
  col += vec3(1.0, 0.82, 0.45) * uHit * (0.8 + line);
  gl_FragColor = vec4(col, min(1.0, 0.36 + 0.5 * line + 0.18 * sweep + 0.2 * rim + 0.35 * uHit));
  ${OUT}
}`;
/** A field in its colours (`deep` its body, `glow` its honeycomb and rims), from `bot` to `top` (m) for its brighter rims. */
export function fieldMat({ deep = '#3d1a99', glow = '#b38cff', bot = 0, top = 8 } = {}) {
  return shaderMat(FIELD_VERT, FIELD_FRAG, { side: THREE.DoubleSide, extra: { uHit: { value: 0 }, uDeep: { value: new THREE.Color(deep) }, uGlow: { value: new THREE.Color(glow) }, uBot: { value: bot }, uTop: { value: top } } });
}
/** A pillar of stacked rock at the chute's side, holding a gate's field (two shapes, kept). */
const pillarGeos = new Map();
export function rockPillar(i, height) {
  const key = height.toFixed(2);
  if (!pillarGeos.has(key)) {
    const list = [];
    for (const seed of [31, 37]) {
      const r = rand(seed);
      const parts = [];
      let y = 0;
      while (y < height) {
        const sz = 0.6 + r() * 0.2;
        const g = rockGeo(r, sz, { detail: 0, squash: 0.95, rough: 0.28, light: '#857b6e', dark: '#3b3631' });
        g.rotateY(r() * 6.28);
        g.translate((r() - 0.5) * 0.15, y, (r() - 0.5) * 0.15);
        parts.push(g);
        y += sz * 1.3;
      }
      const geo = merge(parts);
      geo.userData.shared = true;
      list.push(geo);
    }
    pillarGeos.set(key, list);
  }
  const list = pillarGeos.get(key);
  const m = new THREE.Mesh(list[i % list.length], rockMat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

const MAKERS = { whirl: laneWhirl, fall: curtain, fire: trench, lava: lavaBed, vines: thicket, rock: barricade };

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
