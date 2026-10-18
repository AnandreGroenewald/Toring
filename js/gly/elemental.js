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
/** Fire's crystal: a dark crust with molten veins flowing up it, hottest at the foot. */
const MOLTEN = /* glsl */ `
  float fl = efbm(vec2(atan(vOP.z, vOP.x) * 1.3 + vOP.y * 0.7, vOP.y * 1.5 - uT * 0.9));
  float vein = smoothstep(0.44, 0.7, fl);
  diffuseColor.rgb = mix(vec3(0.06, 0.018, 0.01), diffuseColor.rgb, vein);
  totalEmissiveRadiance *= (0.18 + 2.7 * vein) * (1.15 - 0.35 * smoothstep(0.0, 2.8, vOP.y));`;
/** Grass: a lattice of vines woven over every face of its block (the rest cut away, so it reads as a cage from any side,
 *  the top too), light travelling up them. */
const LATTICE = /* glsl */ `
  vec3 an = abs(vON);
  vec2 q = an.x > max(an.y, an.z) ? vOP.zy : (an.y > an.z ? vOP.xz : vOP.xy);
  q += 0.06 * vec2(enoise(q * 3.0 + 1.7), enoise(q * 3.0 + 5.3));
  float l1 = abs(fract((q.x + q.y) * 1.25) - 0.5);
  float l2 = abs(fract((q.x - q.y) * 1.25) - 0.5);
  if (min(l1, l2) > 0.1) discard;
  float run = smoothstep(0.45, 0.85, efbm(vec2(vOP.y * 2.4 - uT * 1.3, vOP.x * 1.7 + vOP.z)));
  totalEmissiveRadiance *= 0.5 + 1.3 * run;`;
const SWAY = /* glsl */ `
  transformed.x += sin(uT * 1.6 + position.y * 1.3) * 0.022 * position.y;
  transformed.z += cos(uT * 1.3 + position.y * 1.1) * 0.018 * position.y;`;
/** Stone: grey basalt, each face cut into cells with silver veins where they meet (and no glow of its own). */
const BASALT = /* glsl */ `
  vec3 an = abs(vON);
  vec2 q = an.x > max(an.y, an.z) ? vOP.zy : (an.y > an.z ? vOP.xz : vOP.xy);
  vec2 cc = ecells(q * 2.2 + 3.7);
  float vein = 1.0 - smoothstep(0.015, 0.06, cc.y);
  diffuseColor.rgb *= 0.78 + 0.3 * enoise(q * 3.1);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.96), vein * 0.85);
  totalEmissiveRadiance = vec3(0.7, 0.78, 0.92) * vein * 0.3;`;
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
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  vec3 e = uHalf - abs(vOP - vec3(0.0, uHalf.y, 0.0));
  float mid = e.x + e.y + e.z - min(e.x, min(e.y, e.z)) - max(e.x, max(e.y, e.z));
  float edge = 1.0 - smoothstep(0.02, 0.12, mid);
  float st = smoothstep(0.55, 0.9, efbm(vec2(vOP.x * 4.0 + vOP.z * 3.0, vOP.y * 0.9 + vOP.z * 2.0 + uT * 1.8)));
  float rip = efbm(vec2(vOP.x * 1.5 + vOP.z * 1.2 - uT * 0.2, vOP.y * 1.5 - vOP.z + uT * 0.6));
  vec3 col = mix(vec3(0.02, 0.22, 0.72), vec3(0.25, 0.7, 1.0), 0.25 + 0.4 * fres + 0.3 * rip) + vec3(0.45, 0.85, 1.0) * (st * 0.35 + edge * 0.6);
  gl_FragColor = vec4(col, clamp(0.58 + 0.3 * fres + 0.15 * st + 0.3 * edge, 0.0, 0.95));
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
const geos = {};
const once = (k, make) => geos[k] || (geos[k] = make());
function swirlGeo() {
  const parts = [new THREE.CylinderGeometry(0.3, 0.52, 2.7, 14, 6).translate(0, 1.35, 0)];
  for (let k = 0; k < 3; k++) parts.push(new THREE.TubeGeometry(new Helix(0.66, 2.95, 1.15, (k * Math.PI * 2) / 3, 0.45), 56, 0.2, 8, false));
  parts.push(new THREE.TorusGeometry(0.74, 0.15, 8, 28).rotateX(Math.PI / 2).translate(0, 0.13, 0));
  return merge(parts);
}
function cageGeos() {
  const H = 2.45;
  const D = 1.0;
  const r = rand(5);
  const leaf = new THREE.OctahedronGeometry(0.13, 0).scale(0.55, 1.4, 0.25);
  const leaves = [];
  for (let i = 0; i < 44; i++) {
    // (crystal leaves on the cage's faces and its top)
    const face = Math.floor(r() * 5);
    const u = (r() - 0.5) * 0.92;
    const v = r();
    const l = leaf.clone();
    l.rotateZ((r() - 0.5) * 1.4);
    if (face < 2) l.translate(u * W, 0.1 + v * (H - 0.2), (face ? 1 : -1) * (D / 2 + 0.03));
    else if (face < 4) { l.rotateY(Math.PI / 2); l.translate((face === 3 ? 1 : -1) * (W / 2 + 0.03), 0.1 + v * (H - 0.2), u * D); }
    else { l.rotateX(Math.PI / 2); l.translate(u * W, H + 0.03, (v - 0.5) * D * 0.9); }
    leaves.push(l);
  }
  return {
    vines: new THREE.BoxGeometry(W, H, D, 4, 6, 2).translate(0, H / 2, 0),
    leaves: merge(leaves),
    core: new THREE.BoxGeometry(W * 0.86, H * 0.94, D * 0.7).translate(0, H / 2, 0),
  };
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
export function createElemental({ flameMesh, sparks, glow }) {
  const mats = {
    molten: liveStd({ color: '#ff8a3a', emissive: '#ff6a1a', emissiveIntensity: 1, roughness: 0.3, metalness: 0.15 }, MOLTEN),
    glass: glassMat([W / 2, 1.225, 0.525]),
    pool: glassMat([W / 2, 0.17, 1.1]),
    vine: liveStd({ color: '#1d5524', emissive: '#37ff66', emissiveIntensity: 0.85, roughness: 0.45, side: THREE.DoubleSide }, LATTICE, SWAY),
    leaf: liveStd({ color: '#b6ffc8', emissive: '#5dff8f', emissiveIntensity: 1.3, roughness: 0.15, metalness: 0.1, flatShading: true }, '', SWAY),
    core: new THREE.MeshBasicMaterial({ color: '#3dff6a', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    basalt: liveStd({ color: '#7b8189', roughness: 0.82, metalness: 0.04 }, BASALT),
  };
  const solid = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; return m; };
  return {
    /** Fire, tall: a swirl of molten crystal with a crown of flames. */
    swirl() {
      const g = new THREE.Group();
      g.add(solid(once('swirl', swirlGeo), mats.molten));
      g.add(glow(1.9, '#ff6a14', 1));
      g.add(flameMesh([{ at: [-0.18, 2.55, 0], info: [0.34, 0.95, 0.2, -0.1] }, { at: [0.2, 2.5, 0.05], info: [0.3, 0.8, 0.6, 0.1] }, { at: [0, 2.7, -0.08], info: [0.36, 1.1, 0.9, 0] }]));
      g.add(sparks(16, 3.2, 1.6, 43));
      return g;
    },
    /** Fire, low: a slab of the same molten crystal to jump. */
    molten() {
      const g = new THREE.Group();
      g.add(solid(once('molten', () => roundedBox(W, 0.3, 2.2, 0.1)), mats.molten));
      g.add(glow(2.0, '#ff5a10', 0.6));
      g.add(sparks(10, 2.0, 1.8, 47));
      return g;
    },
    /** Water, tall: a block of liquid glass. */
    glass() {
      const g = new THREE.Group();
      const m = new THREE.Mesh(once('glass', () => roundedBox(W, 2.45, 1.05, 0.16)), mats.glass);
      m.renderOrder = 3;
      g.add(m);
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
    /** Grass: a cage of glowing vines with crystal leaves, a green light inside it. */
    cage() {
      const c = once('cage', cageGeos);
      const g = new THREE.Group();
      g.add(solid(c.vines, mats.vine), solid(c.leaves, mats.leaf));
      const core = new THREE.Mesh(c.core, mats.core);
      core.renderOrder = 3;
      g.add(core);
      return g;
    },
    /** Stone: a block of grey basalt veined in silver. */
    basalt() {
      const g = new THREE.Group();
      g.add(solid(once('basalt', () => roundedBox(W, 2.55, 1.2, 0.14)), mats.basalt));
      return g;
    },
  };
}
