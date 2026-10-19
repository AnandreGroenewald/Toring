// (1.19 3D) Glybaan's elemental hazards. The owner (18 Oct 2026), of the Gemini pictures he picked ("Elemental energy"): "It
// looks really good, please proceed". One language for all of them: each element's hazard is a piece of its element
// standing in its lane like a gate, lit from inside so the bloom picks it up. Fire a swirl of molten crystal, water a block
// of liquid glass, grass a cage of glowing vines with crystal leaves, stone a block of grey basalt veined in silver (never
// orange: "the fire and lava in the same lane", so only fire glows orange). The low ones, to jump, are slabs of the same
// stuff. And the slide's rare diamond ("the diamonds is a good idea but needs to be hard and scarse"). hazards.js pools
// them and runs the clock; the game lays its outline and badge under each.
import * as THREE from '../../lib/three.module.min.js';

/** The clock the elemental materials share (hazards.js sets it every frame). */
export const elementalClock = { value: 0 };

const NOISE = /* glsl */ `
float eh12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 eh22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float enoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(eh12(i), eh12(i + vec2(1.0, 0.0)), u.x), mix(eh12(i + vec2(0.0, 1.0)), eh12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float efbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 3; i++) { s += a * enoise(p); p = p * 2.07 + 13.7; a *= 0.5; } return s / 0.875; }
// (the nearest cell's distance, and how far to the next: small where two cells meet, a vein)
vec2 ecells(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      float d = length(g + eh22(n + g) - f);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return vec2(f1, f2 - f1);
}`;

/**
 * A lit material whose body and glow a small shader of ours paints from the spot on the thing (vOP, object space) and its
 * face (vON); `move` bends it in the vertex shader. Each keeps its own program (the cache key).
 */
function liveStd(params, paint, move = '') {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = elementalClock;
    sh.vertexShader = `uniform float uT;\nvarying vec3 vOP;\nvarying vec3 vON;\n${sh.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
  vOP = position;
  vON = normal;
  ${move}`);
    sh.fragmentShader = `uniform float uT;\nvarying vec3 vOP;\nvarying vec3 vON;\n${NOISE}\n${sh.fragmentShader}`.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${paint}`);
  };
  m.customProgramCacheKey = () => `${paint}|${move}`;
  return m;
}
/** Fire (the owner's picture, 19 Oct 2026: a twisted column of molten glass, glowing from inside): orange, its flutes
 *  running yellow-hot up the twist, darker red where it turns away from you. */
const MOLTEN = /* glsl */ `
  float ang = atan(vOP.z, vOP.x);
  vec2 w = vec2(ang * 1.4 - vOP.y * 1.6, vOP.y * 1.2 - uT * 1.1);
  float n1 = efbm(w + 1.7 * vec2(efbm(w * 1.3 + 4.1), efbm(w * 1.3 + 9.3)));
  float n2 = efbm(w * 2.3 + 2.0);
  float lines = smoothstep(0.018, 0.0, abs(n1 - 0.42)) + 0.8 * smoothstep(0.014, 0.0, abs(n2 - 0.46)) + 0.6 * smoothstep(0.012, 0.0, abs(n2 - 0.56));
  float dark = smoothstep(0.45, 0.68, n1);
  float face = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  diffuseColor.rgb = vec3(0.12, 0.02, 0.0);
  vec3 hot = mix(vec3(1.0, 0.19, 0.0), vec3(0.36, 0.03, 0.0), dark);
  hot = mix(hot, vec3(1.0, 0.44, 0.04), clamp(lines, 0.0, 1.0));
  hot *= 0.8 + 0.2 * smoothstep(0.0, 3.0, vOP.y);
  totalEmissiveRadiance = hot * (0.6 + 0.35 * face) * (0.5 + 0.5 * face);`;
/** Fire, low (to jump): a slab of lava, plates of dark crust with molten cracks glowing between them. */
const LAVA = /* glsl */ `
  vec2 cc = ecells(vOP.xz * 2.2 + vec2(0.0, uT * 0.15));
  float crack = 1.0 - smoothstep(0.02, 0.12, cc.y);
  float heat = 0.75 + 0.25 * sin(uT * 2.3 + cc.x * 9.0);
  diffuseColor.rgb = mix(vec3(0.07, 0.03, 0.02), vec3(0.9, 0.3, 0.02), crack);
  totalEmissiveRadiance = mix(vec3(0.25, 0.04, 0.0) * (1.0 - cc.x), vec3(1.0, 0.36, 0.02), crack) * heat * 1.3;`;
const SWAY = /* glsl */ `
  transformed.x += sin(uT * 1.6 + position.y * 1.3) * 0.022 * position.y;
  transformed.z += cos(uT * 1.3 + position.y * 1.1) * 0.018 * position.y;`;
/** Stone (the picture: a rough block of dark grey rock run through with silver veins): branching lines of silver, shiny
 *  where the rock is dull, and no glow of its own beyond a glint. */
const BASALT = /* glsl */ `
  vec3 an = abs(vON);
  vec2 q = an.x > max(an.y, an.z) ? vOP.zy : (an.y > an.z ? vOP.xz : vOP.xy);
  vec2 cc = ecells(q * 1.35 + 3.7 + 0.3 * vec2(enoise(q * 1.7), enoise(q * 1.7 + 4.0)));
  float vein = 1.0 - smoothstep(0.012, 0.045, cc.y);
  float rim = smoothstep(0.03, 0.12, cc.y);
  float grain = enoise(q * 9.0) * 0.6 + enoise(q * 23.0) * 0.4;
  // (each plate bulges, the veins lie in cracks between them, the rock's grain rough all over: a bump on the light)
  float hgt = smoothstep(0.0, 0.32, cc.y) * 0.05 + grain * 0.012;
  vec3 sx = dFdx(-vViewPosition);
  vec3 sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  normal = normalize(abs(det) * normal - sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2));
  diffuseColor.rgb *= (0.5 + 0.5 * grain) * (0.45 + 0.55 * rim) * (0.85 + 0.3 * eh12(floor(q * 1.35 + 3.7)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.97), vein);
  metalnessFactor = mix(metalnessFactor, 0.85, vein);
  roughnessFactor = mix(roughnessFactor, 0.22, vein);
  totalEmissiveRadiance = vec3(0.62, 0.68, 0.8) * vein * 0.18;`;
/** Water: liquid glass, bright at its edges and rims (it is seen from high up: its top must read too), water falling
 *  inside it. `half` is the block's half size (its foot on y 0). */
function glassMat(half) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: elementalClock, uHalf: { value: new THREE.Vector3(...half) } },
    vertexShader: /* glsl */ `
varying vec3 vOP;
varying vec3 vN;
varying vec3 vV;
void main() {
  vOP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uT;
uniform vec3 uHalf;
varying vec3 vOP;
varying vec3 vN;
varying vec3 vV;
${NOISE}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float fres = pow(1.0 - abs(dot(N, V)), 2.0);
  vec3 e = uHalf - abs(vOP - vec3(0.0, uHalf.y, 0.0));
  float mid = e.x + e.y + e.z - min(e.x, min(e.y, e.z)) - max(e.x, max(e.y, e.z));
  float edge = 1.0 - smoothstep(0.02, 0.14, mid);
  float st = smoothstep(0.6, 0.92, efbm(vec2(vOP.x * 4.0 + vOP.z * 3.0, vOP.y * 0.9 + vOP.z * 2.0 + uT * 1.8)));
  float rip = efbm(vec2(vOP.x * 1.5 + vOP.z * 1.2 - uT * 0.2, vOP.y * 1.5 - vOP.z + uT * 0.6));
  // (the picture: clear water standing as a block. Its rippled faces mirror the twilight: pale sky where they turn up,
  // the dark sea where they turn down, in streaks down every fold; a glint of the light; white at its edges)
  vec3 R = reflect(-V, N);
  // (seen from above, its faces mirror the slide and the sea below: lines of light there too, in streaks down the folds)
  float streaks = 0.5 + 0.5 * sin(R.x * 7.0 + R.y * 4.0 + rip * 2.5);
  vec3 low = mix(vec3(0.03, 0.1, 0.26), vec3(0.55, 0.84, 1.0), pow(streaks, 2.2));
  vec3 high = mix(vec3(0.3, 0.46, 0.8), vec3(0.78, 0.9, 1.0), streaks);
  vec3 env = mix(low, high, smoothstep(-0.2, 0.4, R.y));
  env += vec3(1.0, 0.98, 0.94) * pow(max(dot(R, normalize(vec3(-0.3, 0.6, 0.75))), 0.0), 50.0) * 2.0;
  vec3 col = mix(vec3(0.03, 0.18, 0.48), env, 0.55 + 0.45 * fres) + vec3(0.85, 0.96, 1.0) * (edge * 0.4 + st * 0.1);
  float lum = max(col.g, col.b);
  gl_FragColor = vec4(col, clamp(0.14 + 0.5 * fres + 0.45 * smoothstep(0.35, 0.95, lum) + 0.3 * edge, 0.0, 0.96));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true,
    depthWrite: false,
  });
}

// ------------------------------------------------------------------------------------------------------------ shapes
/** Several shapes as one (positions, normals and uvs, no index). */
function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    if (!parts.every((p) => p.attributes[name])) continue;
    const size = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(parts.reduce((a, p) => a + p.attributes[name].array.length, 0));
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
/** A box `w` across, `h` high (standing on y 0), `d` deep, its edges rounded by `r`. */
function roundedBox(w, h, d, r) {
  const s = new THREE.Shape();
  const x0 = -w / 2 + r;
  const x1 = w / 2 - r;
  const y0 = r;
  const y1 = h - r;
  const c = Math.min(0.08, r);
  s.moveTo(x0 + c, y0);
  s.lineTo(x1 - c, y0); s.quadraticCurveTo(x1, y0, x1, y0 + c);
  s.lineTo(x1, y1 - c); s.quadraticCurveTo(x1, y1, x1 - c, y1);
  s.lineTo(x0 + c, y1); s.quadraticCurveTo(x0, y1, x0, y1 - c);
  s.lineTo(x0, y0 + c); s.quadraticCurveTo(x0, y0, x0 + c, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 3 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}
/** A spiral up a column: `r` out, `h` high, `turns` round (less than zero: the other way), closing in by `shrink`. */
class Helix extends THREE.Curve {
  constructor(r, h, turns, phase, shrink = 0) {
    super();
    Object.assign(this, { r, h, turns, phase, shrink });
  }
  getPoint(t, out = new THREE.Vector3()) {
    const a = this.phase + t * this.turns * Math.PI * 2;
    const r = this.r * (1 - this.shrink * t);
    return out.set(Math.cos(a) * r, t * this.h, Math.sin(a) * r);
  }
}
function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const W = 2.05;   // (m) a hazard across its 2,5 m lane
const TALL = 2.9;  // (m) the tall ones (the picture's: a little taller than wide, standing up at you)
const geos = {};
const once = (k, make) => geos[k] || (geos[k] = make());
/** Fire: an hourglass of five flutes twisting up (the picture's column of swirling molten glass), a dome on top. */
function columnGeo() {
  const H = TALL + 0.2;
  const M = 44;
  const R = 30;
  const C = 8;   // (rings of its top: the side rolls over a lip and swirls down into the eye of the vortex)
  const pos = [];
  const idx = [];
  const ring = (rad, y, tw, flute, lump, v) => {
    for (let i = 0; i <= M; i++) {
      const a = (i / M) * Math.PI * 2;
      const r = rad * (0.9 + flute * 0.1 * Math.cos(5 * (a - tw) + Math.sin(v * 7 + a) * 0.8)) * (1 + lump * (0.09 * Math.sin(a * 3 + v * 9) + 0.06 * Math.sin(v * 14 + a * 2)));
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  };
  for (let j = 0; j <= R; j++) {
    const v = j / R;
    const prof = 0.56 + 0.42 * (2 * v - 1) ** 2;
    const calm = 1 - 0.5 * Math.max(0, v - 0.8) / 0.2;
    ring(prof, v * H, v * Math.PI * 1.7, calm, calm, v);
  }
  for (let k = 1; k <= C; k++) {
    const t = k / C;
    // (over the lip, then down and in, still turning)
    ring(0.98 * (1 - t) ** 0.8 + 0.001, H + 0.12 * Math.sin(Math.min(1, t * 3) * Math.PI) - 0.42 * t * t, Math.PI * 1.7 + t * Math.PI * 1.4, 0.5 * (1 - t), 0.5 * (1 - t), 1 + t * 0.3);
  }
  for (let j = 0; j < R + C; j++) for (let i = 0; i < M; i++) {
    const a = j * (M + 1) + i;
    const b = a + M + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { body: g };
}
/** Grass: vines woven both ways round a cylinder (the picture's cage), rings at its foot and top, leaves along them. */
function cageGeos() {
  const H = TALL;
  const R = 0.98;
  const vines = [];
  for (let k = 0; k < 7; k++) for (const turn of [0.5, -0.5]) vines.push(new THREE.TubeGeometry(new Helix(R, H, turn, (k / 7) * Math.PI * 2), 36, 0.034, 5, false));
  for (const y of [0.06, H]) vines.push(new THREE.TorusGeometry(R, 0.06, 6, 30).rotateX(Math.PI / 2).translate(0, y, 0));
  const r = rand(5);
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.quadraticCurveTo(0.14, 0.12, 0, 0.34);
  sh.quadraticCurveTo(-0.14, 0.12, 0, 0);
  const leaf = new THREE.ShapeGeometry(sh, 4).rotateX(-0.35);   // (a leaf: a pointed oval, standing a little off its vine)
  const leaves = [];
  const at = new THREE.Vector3();
  for (let i = 0; i < 150; i++) {
    const turn = i % 2 ? 0.5 : -0.5;
    new Helix(R + 0.06, H, turn, (Math.floor(r() * 7) / 7) * Math.PI * 2).getPoint(r(), at);
    const l = leaf.clone();
    l.rotateZ((r() - 0.5) * 1.8);
    l.rotateY(-Math.atan2(at.z, at.x) + Math.PI / 2);
    l.translate(at.x, at.y, at.z);
    leaves.push(l);
  }
  return {
    vines: merge(vines),
    leaves: merge(leaves),
    core: new THREE.CylinderGeometry(R * 0.86, R * 0.86, H * 0.94, 18, 1, true).translate(0, H / 2, 0),
  };
}
/** Stone: a rough block of rock (a box rounded off, bumped all over), a little taller than wide. */
function rockBlockGeo() {
  const g = new THREE.SphereGeometry(1, 28, 20);
  const p = g.attributes.position;
  const e = 0.4;   // (how boxy: 1 a ball, nearer 0 a box)
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const sx = Math.sign(v.x) * Math.abs(v.x) ** e;
    const sy = Math.sign(v.y) * Math.abs(v.y) ** e;
    const sz = Math.sign(v.z) * Math.abs(v.z) ** e;
    const bump = 1 + 0.07 * Math.sin(v.x * 5.1 + v.y * 3.3) + 0.06 * Math.sin(v.z * 4.3 - v.y * 4.2 + 1.3) + 0.04 * Math.sin(v.x * 10.7 + v.z * 8.1 + v.y * 2.0);
    const foot = 1.06 - 0.12 * (sy * 0.5 + 0.5);
    const lump = 1 + 0.1 * Math.sin(v.x * 2.3 + v.z * 1.7 + 0.5) * Math.cos(v.y * 2.1);
    p.setXYZ(i, sx * (W / 2) * bump * foot * lump, (sy * 0.5 + 0.5) * TALL * (0.97 + 0.03 * bump) + (sy > 0.7 ? 0.05 * Math.sin(v.x * 4 + v.z * 3) : 0), sz * 0.74 * bump * foot * lump);
  }
  g.computeVertexNormals();
  return g;
}
/** One vertex where several sat at the same spot (a box's faces share their edges: its normals then run smooth round). */
function weld(g) {
  const p = g.attributes.position;
  const idx = g.index ? g.index.array : Array.from({ length: p.count }, (_, i) => i);
  const map = new Map();
  const pos = [];
  const remap = new Uint32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    remap[i] = j;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(Array.from(idx, (i) => remap[i]));
  return out;
}
/** Water: a block of water standing up, its edges rounded, its faces rippled in long folds running down and its top
 *  melting a little (the picture's). */
function waterGeo() {
  const g = weld(new THREE.BoxGeometry(1, 1, 1, 28, 30, 12));
  const p = g.attributes.position;
  const half = new THREE.Vector3(W / 2, TALL / 2, 0.55);
  const inner = half.clone().subScalar(0.2);
  const q = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    q.fromBufferAttribute(p, i).multiply(half).multiplyScalar(2);
    c.copy(q).clamp(inner.clone().negate(), inner);
    n.subVectors(q, c);
    if (n.lengthSq() < 1e-8) n.set(0, 0, -1); else n.normalize();
    q.copy(c).addScaledVector(n, 0.2);
    const y = q.y + half.y;
    const a = Math.atan2(q.z / half.z, q.x / half.x);
    let d = 0;
    if (Math.abs(n.y) < 0.75) d = (0.075 * Math.sin(a * 15 + y * 0.8) * (0.55 + 0.45 * Math.sin(y * 1.9 + a * 3)) + 0.03 * Math.sin(a * 33 - y * 1.7)) * (1 - Math.abs(n.y));
    else if (n.y > 0) d = 0.14 * Math.sin(q.x * 4.6 + 0.5) * Math.cos(q.z * 3.7) - 0.05;
    q.addScaledVector(n, d);
    p.setXYZ(i, q.x, q.y + half.y, q.z);
  }
  g.computeVertexNormals();
  return g;
}
/** A soft round glow (the light round a thing glowing from inside: a phone draws no bloom). */
let haloTex = null;
function halo(color, w, h, y, k = 0.8) {
  if (!haloTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.14)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, opacity: k, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.set(w, h, 1);
  s.position.y = y;
  return s;
}
/** Its mirror image in the glossy slide (the picture's reflections): its shape upside down under the floor, in its own
 *  colour, brightest at its foot and fading down, drawn onto the slide right after it (no depth test: the slide hides
 *  it nowhere, and everything drawn later still covers it). */
const MIRROR_VERT = 'varying float vY; varying float vD; varying vec3 vN; void main() { vY = position.y; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }';
// (soft: dimmer where its faces turn away, so its edges blur into the slide)
const MIRROR_FRAG = 'uniform vec3 uCol; uniform float uH; varying float vY; varying float vD; varying vec3 vN; void main() { float f = 1.0 - smoothstep(0.0, uH, vY); f *= f * (1.0 - smoothstep(55.0, 150.0, vD)) * (0.25 + 0.75 * abs(normalize(vN).z)); gl_FragColor = vec4(uCol * f, 1.0); }';
export const MIRROR_ORDER = -1;
function mirror(geo, color, h, k = 0.55) {
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color).multiplyScalar(k) }, uH: { value: h } },
    vertexShader: MIRROR_VERT, fragmentShader: MIRROR_FRAG,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.scale.y = -1;
  m.renderOrder = MIRROR_ORDER;
  m.userData.mirror = true;
  return m;
}
/** Its light on the glossy slide in front of it (towards the camera), fading away: the picture's reflections. */
let shineTex = null;
const shineGeo = new THREE.PlaneGeometry(1.9, 3.4).rotateX(-Math.PI / 2).translate(0, 0.025, -1.7);
function shine(color, depth, k = 0.5) {
  if (!shineTex) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 128; i++) {
      const a = (i / 127) ** 1.6;   // (the canvas's foot is the plane's near end: brightest at the thing, fading towards you)
      const grd = x.createLinearGradient(0, 0, 32, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = grd;
      x.fillRect(0, i, 32, 1);
    }
    shineTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(shineGeo, new THREE.MeshBasicMaterial({ map: shineTex, color, opacity: k, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.z = -depth / 2;
  m.renderOrder = 1;
  return m;
}

/** The diamond: a brilliant's crown and pavilion, cut flat, in a soft halo (one on the slide at a time). */
export function makeDiamond() {
  const pts = [new THREE.Vector2(0.001, -0.46), new THREE.Vector2(0.44, 0), new THREE.Vector2(0.3, 0.17), new THREE.Vector2(0.001, 0.17)];
  const g = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.LatheGeometry(pts, 8), new THREE.MeshStandardMaterial({ color: '#e6f6ff', emissive: '#8fd4ff', emissiveIntensity: 0.9, metalness: 0.35, roughness: 0.06, flatShading: true }));
  gem.scale.setScalar(1.35);
  g.add(gem);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(225, 246, 255, 0.9)'); grd.addColorStop(0.4, 'rgba(140, 210, 255, 0.35)'); grd.addColorStop(1, 'rgba(140, 210, 255, 0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 64);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(2.2);
  g.add(halo);
  return g;
}

/**
 * The elemental looks' makers (each builds one hazard on the slide's floor, about a lane across), with the flames, sparks
 * and floor glow hazards.js already draws.
 */
export function createElemental({ sparks, glow }) {
  const mats = {
    molten: liveStd({ color: '#ff8a3a', emissive: '#ff6a1a', emissiveIntensity: 1, roughness: 0.12, metalness: 0 }, MOLTEN),
    lava: liveStd({ color: '#ff8a3a', emissive: '#ffffff', roughness: 0.6, metalness: 0 }, LAVA),
    glass: glassMat([W / 2, TALL / 2, 0.55]),
    pool: glassMat([W / 2, 0.17, 1.1]),
    vine: liveStd({ color: '#0c7a24', emissive: '#10c038', emissiveIntensity: 0.8, roughness: 0.45 }, '', SWAY),
    leaf: liveStd({ color: '#3ae866', emissive: '#22d452', emissiveIntensity: 0.8, roughness: 0.3, side: THREE.DoubleSide }, '', SWAY),
    core: new THREE.MeshBasicMaterial({ color: '#2dff5a', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    basalt: liveStd({ color: '#8a9096', roughness: 0.82, metalness: 0.05 }, BASALT),
  };
  const solid = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; return m; };
  return {
    /** Fire, tall: a twisted column of molten glass, ribbons of light round it, its glow and its shine on the slide. */
    swirl() {
      const c = once('column', columnGeo);
      const g = new THREE.Group();
      g.add(solid(c.body, mats.molten), mirror(c.body, '#ff5a0a', 1.7, 0.55));
      g.add(glow(1.9, '#ff6a14', 1), halo('#ff4a00', 4.6, 5.6, 1.7, 0.85), shine('#ff6a14', 2.0, 0.5));
      g.add(sparks(16, 3.4, 1.6, 43));
      return g;
    },
    /** Fire, low: a slab of the same molten glass to jump. */
    molten() {
      const g = new THREE.Group();
      g.add(solid(once('molten', () => roundedBox(W, 0.3, 2.2, 0.1)), mats.lava));
      g.add(glow(2.0, '#ff5a10', 0.6), halo('#ff6a14', 3.4, 1.4, 0.3, 0.45));
      g.add(sparks(10, 2.0, 1.8, 47));
      return g;
    },
    /** Water, tall: a block of clear water standing up, bands of light down it. */
    glass() {
      const g = new THREE.Group();
      const m = new THREE.Mesh(once('glass', waterGeo), mats.glass);
      m.renderOrder = 3;
      g.add(m, mirror(once('glass', waterGeo), '#6fbfff', 1.4, 0.2), halo('#4fb0ff', 3.6, 4.4, 1.5, 0.45), shine('#7fc8ff', 1.1, 0.4));
      return g;
    },
    /** Water, low: a slab of it to jump. */
    pool() {
      const g = new THREE.Group();
      const m = new THREE.Mesh(once('pool', () => roundedBox(W, 0.34, 2.2, 0.1)), mats.pool);
      m.renderOrder = 3;
      g.add(m);
      return g;
    },
    /** Grass: a cage of glowing vines woven round, leaves on them, a green light inside, its shine on the slide. */
    cage() {
      const c = once('cage', cageGeos);
      const g = new THREE.Group();
      g.add(solid(c.vines, mats.vine), solid(c.leaves, mats.leaf), mirror(c.vines, '#22e04a', 1.6, 0.4), mirror(c.leaves, '#3aff6a', 1.6, 0.28));
      const core = new THREE.Mesh(c.core, mats.core);
      core.renderOrder = 3;
      g.add(core, halo('#2dff5a', 3.8, 4.6, 1.5, 0.45), shine('#3dff6a', 2.0, 0.4));
      return g;
    },
    /** Stone: a rough block of dark grey rock veined in silver. */
    basalt() {
      const g = new THREE.Group();
      g.add(solid(once('basalt', rockBlockGeo), mats.basalt), mirror(once('basalt', rockBlockGeo), '#8f9cb8', 1.3, 0.16));
      return g;
    },
  };
}
