// (1.18 3D) Blokbotsing: the world — open sea at sunset (the Kasteelreeks's purple-and-gold sky), two rock sea stacks
// 80 m apart with grass on top, foam where the swell meets the rock, islands and a lighthouse far off, gulls. Units are
// metres, y up, the sea's surface at y = 0; the battle's plane is z = 0 (the physics' x-y, see rules.js).
import * as THREE from '../../lib/three.module.min.js';
import { makeSky, rng, fbm } from '../kasteel/world.js';
import { STACK, PX } from './rules.js';

export const M = (px) => px / PX;   // px → metres
export const STACK_X = M(STACK.x);
export const STACK_TOP = -M(STACK.topY);
export const STACK_R = M(STACK.w / 2);
export const SLOPE = 0.12;   // the rock widens this much (m) for every metre further down (the physics' trapezoid)
/** The rock's half-width at height y, in the battle's plane. */
export const stackR = (y) => STACK_R + Math.max(0, STACK_TOP - y) * SLOPE;
const lin = (hex) => new THREE.Color(hex);

/** Small helper: merges geometries (each made non-indexed) into one, keeping position, normal and uv. */
export function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

// ----------------------------------------------------------------------------------------------------- the sea
const SEA_VERT = `
uniform float uT;
uniform float uAmp;
varying vec3 vW;
varying vec3 vN;
varying float vH;
varying float vDist;
const int NW = 4;
void main() {
  vec3 p = position;
  float r = length(p.xz);
  float fade = uAmp * (1.0 - smoothstep(180.0, 650.0, r));
  vec2 D[4]; float A[4]; float L[4];
  D[0] = normalize(vec2(0.92, 0.39)); A[0] = 0.40; L[0] = 34.0;
  D[1] = normalize(vec2(0.60, -0.80)); A[1] = 0.26; L[1] = 19.0;
  D[2] = normalize(vec2(-0.30, 0.95)); A[2] = 0.13; L[2] = 10.5;
  D[3] = normalize(vec2(0.99, -0.12)); A[3] = 0.07; L[3] = 6.5;
  vec3 pos = p;
  vec3 n = vec3(0.0, 1.0, 0.0);
  float h = 0.0;
  for (int i = 0; i < NW; i++) {
    float k = 6.28318 / L[i];
    float c = sqrt(9.8 / k);
    float a = A[i] * fade;
    float f = k * (dot(D[i], p.xz) - c * uT);
    float Q = 0.55;
    pos.x += Q * a * D[i].x * cos(f);
    pos.z += Q * a * D[i].y * cos(f);
    pos.y += a * sin(f);
    h += a * sin(f);
    n.x -= D[i].x * k * a * cos(f);
    n.z -= D[i].y * k * a * cos(f);
    n.y -= Q * k * a * sin(f);
  }
  vec4 w = modelMatrix * vec4(pos, 1.0);
  vW = w.xyz;
  vN = normalize(n);
  vH = h / max(0.0001, 0.86 * uAmp);
  vDist = length(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SEA_FRAG = `
uniform float uT;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uIsle0;   // (x, z, radius: foam where the swell meets each island)
uniform vec3 uIsle1;
uniform float uDetail;
uniform sampler2D uNoise;
varying vec3 vW;
varying vec3 vN;
varying float vH;
varying float vDist;
void main() {
  vec3 N = normalize(vN);
  // fine ripples over the swell: two scrolling layers of a tiling normal texture, fading out with distance
  float rip = (1.0 - smoothstep(40.0, 360.0, vDist)) * uDetail;
  vec4 n1 = texture2D(uNoise, vW.xz * 0.034 + uT * vec2(0.010, 0.006));
  vec4 n2 = texture2D(uNoise, vW.xz * 0.093 - uT * vec2(0.017, -0.011));
  vec2 dr = (n1.xy * 2.0 - 1.0) + (n2.xy * 2.0 - 1.0) * 0.6;
  N = normalize(N + vec3(dr.x, 0.0, dr.y) * 0.5 * rip);
  vec3 V = normalize(cameraPosition - vW);
  float nv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  vec3 R = reflect(-V, N);
  float ry = clamp(R.y, 0.0, 1.0);
  vec3 skyRef = mix(uHorizon, uZenith, pow(ry, 0.6));
  vec3 L = normalize(uSunDir);
  float sd = max(dot(R, L), 0.0);
  vec3 spec = uSunCol * (pow(sd, 1400.0) * 9.0 + pow(sd, 120.0) * 0.55 + pow(sd, 12.0) * 0.06);
  float crest = clamp(vH * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = mix(uDeep, uShallow, crest * 0.55);
  vec3 toSunFlat = normalize(vec3(L.x, 0.0, L.z));
  float sss = pow(max(dot(-V, toSunFlat), 0.0), 4.0) * smoothstep(0.45, 1.0, crest);
  body += uShallow * sss * 0.9 + uSunCol * sss * 0.05;
  vec3 col = mix(body, skyRef, fres) + spec;
  // foam: where the swell breaks on the two stacks, and on the highest crests
  float foam = 0.0;
  for (int s = 0; s < 2; s++) {
    vec3 I = s == 0 ? uIsle0 : uIsle1;
    float d = length(vW.xz - I.xy) - I.z;
    float band = 1.0 - smoothstep(0.0, 3.4 + 1.2 * sin(uT * 1.3 + float(s) * 2.0), d);
    float lace = smoothstep(0.38, 0.7, texture2D(uNoise, vW.xz * 0.11 + vec2(uT * 0.03, -uT * 0.02)).b);
    foam += band * mix(lace, 1.0, smoothstep(1.2, 0.0, d));
  }
  foam += smoothstep(0.82, 1.0, crest) * smoothstep(0.5, 0.8, texture2D(uNoise, vW.xz * 0.05 + uT * 0.008).b) * 0.6;
  vec3 foamCol = vec3(0.92, 0.88, 0.86) * (0.55 + 0.45 * max(dot(N, L), 0.0)) + uSunCol * 0.08;
  col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.82);
  float fogK = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFog, fogK);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** A tiling noise (several octaves of periodic value noise): its slope in R/G (the ripples), its height in B (foam lace). */
function seaNoise(size = 256) {
  const h = new Float32Array(size * size);
  const r = rng(99);
  for (const [period, amp] of [[4, 1], [8, 0.55], [16, 0.3], [32, 0.16], [64, 0.08]]) {
    const grid = Float32Array.from({ length: period * period }, () => r());
    const g = (a, b) => grid[(((b % period) + period) % period) * period + (((a % period) + period) % period)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * period;
        const fy = (y / size) * period;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const top = g(ix, iy) + (g(ix + 1, iy) - g(ix, iy)) * sx;
        const bot = g(ix, iy + 1) + (g(ix + 1, iy + 1) - g(ix, iy + 1)) * sx;
        h[y * size + x] += (top + (bot - top) * sy) * amp;
      }
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => (h[(((y % size) + size) % size) * size + (((x % size) + size) % size)] - lo) / (hi - lo);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 9;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 9;
      const n = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round(((-dx / n) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((-dy / n) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(at(x, y) * 255);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
/** A grid that is fine (≈1.2 m) round the battle and coarse towards the horizon, 4 km across. */
function seaGeometry(n) {
  const half = 2000;
  const a = 0.075;
  const f = (t) => Math.sign(t) * half * (a * Math.abs(t) + (1 - a) * Math.abs(t) ** 3);
  const pos = new Float32Array((n + 1) * (n + 1) * 3);
  let k = 0;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      pos[k++] = f((i / n) * 2 - 1);
      pos[k++] = 0;
      pos[k++] = f((j / n) * 2 - 1);
    }
  }
  const idx = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = j * (n + 1) + i;
      idx.push(v, v + n + 1, v + 1, v + 1, v + n + 1, v + n + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// --------------------------------------------------------------------------------------------- the sea stacks
function rockCanvas(seed) {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  // strata: bands of sandstone, each its own tint, with darker seams
  let y = 0;
  while (y < 512) {
    const h = 10 + r() * 34;
    const t = r();
    g.fillStyle = `rgb(${190 + t * 40 | 0},${150 + t * 34 | 0},${118 + t * 30 | 0})`;
    g.fillRect(0, y, 512, h);
    g.fillStyle = 'rgba(40,20,10,0.35)';
    g.fillRect(0, y + h - 2, 512, 2);
    y += h;
  }
  const img = g.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 36;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // cracks running down, and pits
  for (let k = 0; k < 70; k++) {
    g.strokeStyle = `rgba(30,15,8,${0.15 + r() * 0.3})`;
    g.lineWidth = 0.8 + r() * 1.6;
    g.beginPath();
    let x = r() * 512;
    let yy = r() * 512;
    g.moveTo(x, yy);
    for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 18; yy += 8 + r() * 22; g.lineTo(x, yy); }
    g.stroke();
  }
  for (let k = 0; k < 600; k++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,240,220,0.10)';
    g.beginPath();
    g.arc(r() * 512, r() * 512, 0.6 + r() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
function grassCanvas(seed) {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5f7a34';
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 2600; k++) {
    const t = r();
    g.fillStyle = t < 0.5 ? `rgba(120,150,60,${0.4 + r() * 0.4})` : t < 0.8 ? `rgba(70,95,35,${0.4 + r() * 0.4})` : `rgba(170,160,90,${0.3 + r() * 0.4})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 2 + r() * 4);
  }
  for (let k = 0; k < 14; k++) {
    g.fillStyle = `rgba(150,120,90,${0.35 + r() * 0.3})`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 6 + r() * 16, 4 + r() * 10, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
const tex = (c, renderer, rep = [1, 1]) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
};

function makeStack(side, renderer, mats) {
  const group = new THREE.Group();
  const cx = side === 0 ? -STACK_X : STACK_X;
  group.position.x = cx;
  const r = rng(31 + side * 17);
  const BOT = -26;
  const H = STACK_TOP - BOT;
  const geo = new THREE.CylinderGeometry(stackR(STACK_TOP), stackR(BOT), H, 96, 64, true);
  geo.translate(0, BOT + H / 2, 0);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const cA = lin('#c49067');
  const cB = lin('#9d6b4c');
  const cWet = lin('#3b2a26');
  const cAlg = lin('#3d4a2a');
  const cMoss = lin('#6e8040');
  const tmp = new THREE.Color();
  const seedOff = side * 41.3;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const th = Math.atan2(x, z);
    const rad = Math.hypot(x, z);
    const fromTop = STACK_TOP - y;
    const edge = THREE.MathUtils.smoothstep(fromTop, 0.0, 1.6);
    const plane = THREE.MathUtils.lerp(0.25, 1, Math.abs(Math.cos(th)));   // (the battle's plane keeps the physics' outline)
    const n1 = fbm(th * 2.3 + seedOff, y * 0.16, 4) - 0.5;
    const n2 = fbm(th * 7.1 + seedOff, y * 0.55, 3) - 0.5;
    const strata = Math.sin(y * 2.1 + n1 * 5) * 0.16 + Math.sin(y * 5.3 + n2 * 3) * 0.06;
    const disp = (n1 * 1.6 + n2 * 0.5 + strata) * edge * plane;
    const k = (rad + disp) / rad;
    p.setXYZ(i, x * k, y, z * k);
    // colour: sandstone strata, a dark wet band and weed at the waterline, moss over the top edge
    const band = 0.5 + 0.5 * Math.sin(y * 1.7 + n1 * 4);
    tmp.copy(cA).lerp(cB, band * 0.8 + n2 * 0.4);
    const wet = 1 - THREE.MathUtils.smoothstep(y, 0.6, 2.4);
    tmp.lerp(cWet, wet * 0.75);
    tmp.lerp(cAlg, wet * THREE.MathUtils.smoothstep(y, -1.2, 0.8) * 0.5);
    tmp.lerp(cMoss, (1 - THREE.MathUtils.smoothstep(fromTop, 0.15, 0.9)) * 0.65);
    tmp.multiplyScalar(0.9 + n2 * 0.25);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, mats.rock);
  rock.castShadow = rock.receiveShadow = true;
  group.add(rock);
  // the flat top, grass with bare patches (the towers stand here)
  const top = new THREE.Mesh(new THREE.CircleGeometry(STACK_R + 0.02, 96), mats.grass);
  top.rotation.x = -Math.PI / 2;
  top.position.y = STACK_TOP + 0.004;
  top.receiveShadow = true;
  group.add(top);
  // tufts round the rim, clear of the battle's plane
  const tuft = merge([0, 1, 2, 3, 4].map((k) => {
    const c = new THREE.ConeGeometry(0.06, 0.5 + (k % 3) * 0.18, 4, 1);
    c.translate(0, 0.25, 0);
    c.rotateZ((k - 2) * 0.22);
    c.rotateY(k * 1.3);
    c.translate((k - 2) * 0.07, 0, ((k * 7) % 5 - 2) * 0.05);
    return c;
  }));
  const tufts = new THREE.InstancedMesh(tuft, mats.tuft, 90);
  const mtx = new THREE.Matrix4();
  let t = 0;
  for (let k = 0; k < 400 && t < 90; k++) {
    const a = r() * Math.PI * 2;
    const rr = STACK_R * (0.82 + r() * 0.2);
    const x = Math.sin(a) * rr;
    const z = Math.cos(a) * rr;
    if (Math.abs(z) < 2.3) continue;
    const s = 0.7 + r() * 0.9;
    mtx.compose(new THREE.Vector3(x, STACK_TOP, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, 0)), new THREE.Vector3(s, s, s));
    tufts.setMatrixAt(t++, mtx);
  }
  tufts.count = t;
  tufts.castShadow = false;
  group.add(tufts);
  // boulders at the foot, in the surf (clear of the plane, where falling blocks slide down)
  const bgeo = new THREE.IcosahedronGeometry(1, 1);
  const bp = bgeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(bp, i);
    const k = 0.78 + fbm(v.x * 1.7 + 3, v.y * 1.7 + v.z, 3) * 0.5;
    bp.setXYZ(i, v.x * k, v.y * k * 0.75, v.z * k);
  }
  bgeo.computeVertexNormals();
  const boulders = new THREE.InstancedMesh(bgeo, mats.boulder, 22);
  let b = 0;
  for (let k = 0; k < 200 && b < 22; k++) {
    const a = r() * Math.PI * 2;
    const rr = stackR(0) + 0.4 + r() * 3.4;
    const x = Math.sin(a) * rr;
    const z = Math.cos(a) * rr;
    if (Math.abs(z) < 2.8) continue;
    const s = 0.7 + r() * 1.6;
    mtx.compose(new THREE.Vector3(x, -0.4 + r() * 0.6, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(r(), r() * 6, r())), new THREE.Vector3(s, s, s));
    boulders.setMatrixAt(b++, mtx);
  }
  boulders.count = b;
  boulders.castShadow = boulders.receiveShadow = true;
  group.add(boulders);
  return group;
}

// ----------------------------------------------------------------------------------------- far islands, life
function farIslands(mats) {
  const g = new THREE.Group();
  const r = rng(5);
  const spots = [[-520, -760, 70, 46], [-180, -980, 120, 30], [260, -840, 60, 58], [620, -700, 90, 34], [940, -1100, 160, 52], [-900, -900, 110, 40]];
  for (const [x, z, rad, h] of spots) {
    const geo = new THREE.ConeGeometry(rad, h, 28, 6, false);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      const n = fbm(vx * 0.03 + x, vz * 0.03 + z, 4);
      const k = 0.75 + n * 0.55;
      p.setXYZ(i, vx * k, vy * (0.7 + n * 0.6), vz * k);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mats.far);
    m.position.set(x, h * 0.32 - 2, z);
    m.scale.set(1, 1, 0.5 + r() * 0.4);
    g.add(m);
  }
  // a lighthouse on the nearest headland, its lamp turning
  const lh = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 26, 20), new THREE.MeshStandardMaterial({ color: '#f1ece4', roughness: 0.6 }));
  tower.position.y = 13;
  lh.add(tower);
  for (const y of [5, 13, 21]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.95 - y * 0.012, 3.05 - y * 0.012, 3, 20), new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.6 }));
    band.position.y = y;
    lh.add(band);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 10), new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
  lamp.position.y = 28;
  lh.add(lamp);
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 170, 20, 1, true), beamMat);
  beam.geometry.translate(0, -85, 0);
  beam.rotation.z = Math.PI / 2;
  const pivot = new THREE.Group();
  pivot.position.y = 28;
  pivot.add(beam);
  lh.add(pivot);
  lh.position.set(-520, 28, -760);
  g.add(lh);
  g.userData.update = (t) => { pivot.rotation.y = t * 0.6; beamMat.opacity = 0.1 + 0.08 * Math.max(0, Math.sin(t * 0.6)); };
  return g;
}
function gulls(scene) {
  const geo = new THREE.BufferGeometry();
  // one gull: two wings as a soft V (6 triangles), body along x
  const v = new Float32Array([0, 0, 0, -0.25, 0, 1.1, 0.25, 0, 0.9, 0, 0, 0, 0.25, 0, 0.9, -0.25, 0, -1.1, 0, 0, 0, 0.25, 0, -0.9, -0.25, 0, -1.1]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: '#2a2030', side: THREE.DoubleSide });
  const list = [];
  const r = rng(12);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(0.9 + r() * 0.5);
    scene.add(m);
    list.push({ m, cx: (r() - 0.5) * 120, cz: -60 - r() * 120, rad: 25 + r() * 40, y: 34 + r() * 30, sp: (0.06 + r() * 0.05) * (r() < 0.5 ? -1 : 1), ph: r() * 6 });
  }
  return (t) => {
    for (const g of list) {
      const a = g.ph + t * g.sp;
      g.m.position.set(g.cx + Math.cos(a) * g.rad, g.y + Math.sin(t * 0.7 + g.ph) * 1.5, g.cz + Math.sin(a) * g.rad * 0.5);
      g.m.rotation.set(Math.sin(t * 6 + g.ph) * 0.35, -a + (g.sp > 0 ? 0 : Math.PI), 0);
    }
  };
}

// ----------------------------------------------------------------------------------------------- the world
export const SUN_DIR = new THREE.Vector3(-0.82, 0.19, -0.36).normalize();

/**
 * The world: the sunset sea and sky, the far islands, the gulls; the battle's two sea stacks unless `stacks` is false
 * (Jou dorp builds its own islands). `isles`: where the swell foams ([x, z, radius] each, two at most).
 */
export function buildWorld(stage, { stacks: withStacks = true, isles = null } = {}) {
  const { scene, renderer, quality } = stage;
  const sky = makeSky(SUN_DIR);
  scene.add(sky);
  // the sky as the light everything reflects (gold metal, glossy paint)
  const envScene = new THREE.Scene();
  envScene.add(makeSky(SUN_DIR));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.03).texture;
  scene.environmentIntensity = 0.62;
  pmrem.dispose();
  const fogCol = lin('#d9967a');
  scene.fog = new THREE.Fog(fogCol, 260, 1500);

  const sun = new THREE.DirectionalLight('#ffd2a1', 3.1);
  sun.position.copy(SUN_DIR).multiplyScalar(160).add(new THREE.Vector3(0, 12, 0));
  sun.target.position.set(0, 12, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  const sc = sun.shadow.camera;
  sc.left = -64; sc.right = 64; sc.top = 44; sc.bottom = -44; sc.near = 20; sc.far = 340;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#a796ff', '#4a3040', 0.55));
  stage.onQuality((q) => { sun.shadow.mapSize.set(q.shadow, q.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; });

  const sea = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 }, uAmp: { value: 1 }, uDetail: { value: quality.name === 'low' ? 0.6 : 1 }, uNoise: { value: seaNoise() },
      uSunDir: { value: SUN_DIR.clone() }, uSunCol: { value: lin('#ffd9a8') },
      uDeep: { value: lin('#0d2a48') }, uShallow: { value: lin('#1d6a86') },
      uHorizon: { value: lin('#ffcc80') }, uZenith: { value: lin('#6a3b8f') },
      uFog: { value: fogCol }, uFogNear: { value: 300 }, uFogFar: { value: 1700 },
      uIsle0: { value: new THREE.Vector3(...(isles?.[0] || [-STACK_X, 0, stackR(0) + 0.15])) },
      uIsle1: { value: new THREE.Vector3(...(isles?.[1] || [STACK_X, 0, stackR(0) + 0.15])) },
    },
    vertexShader: SEA_VERT, fragmentShader: SEA_FRAG,
  });
  const seaMesh = new THREE.Mesh(seaGeometry(quality.name === 'high' ? 300 : quality.name === 'mid' ? 190 : 150), sea);
  seaMesh.frustumCulled = false;
  scene.add(seaMesh);

  const rockC = rockCanvas(7);
  const rockT = tex(rockC, renderer, [5, 3]);
  const bumpT = new THREE.CanvasTexture(rockC);
  bumpT.wrapS = bumpT.wrapT = THREE.RepeatWrapping;
  bumpT.repeat.set(5, 3);
  const mats = {
    rock: new THREE.MeshStandardMaterial({ map: rockT, bumpMap: bumpT, bumpScale: 3, vertexColors: true, roughness: 0.93, color: '#ffffff' }),
    grass: new THREE.MeshStandardMaterial({ map: tex(grassCanvas(3), renderer, [3, 3]), roughness: 0.97 }),
    tuft: new THREE.MeshStandardMaterial({ color: '#7f9a45', roughness: 0.9 }),
    boulder: new THREE.MeshStandardMaterial({ map: rockT, color: '#7a5a48', roughness: 0.75, bumpMap: bumpT, bumpScale: 2 }),
    far: new THREE.MeshStandardMaterial({ color: '#5a4060', roughness: 1, flatShading: true }),
  };
  const stacks = withStacks ? [makeStack(0, renderer, mats), makeStack(1, renderer, mats)] : [];
  if (stacks.length) {
    scene.add(...stacks);
    // (the rock, for what falls on it: fx.js's broken pieces land on a stack's top and glance off its cliffs)
    scene.userData.solids = [...(scene.userData.solids || []), ...[-STACK_X, STACK_X].map((x) => ({ x, z: 0, top: STACK_TOP, radiusAt: (y) => stackR(y) }))];
  }
  const far = farIslands(mats);
  scene.add(far);
  const flyGulls = gulls(scene);

  return {
    sun, sea, stacks, mats,
    update(t) {
      sea.uniforms.uT.value = t;
      far.userData.update(t);
      flyGulls(t);
    },
    /** Warm-up objects (nothing else to show before the first frame). */
    extras: [],
  };
}
