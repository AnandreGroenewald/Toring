// (1.17 3D) Die Kasteelreeks: the world — the savanna at sunset (the owner's style B, Sononder-slag: purple and gold),
// your siege camp at the origin, their castle DIST metres away over open ground, a river behind it, hills, acacias,
// grass, the sky with its low sun. Units are metres; the camera looks along -z towards their castle.
import * as THREE from '../../lib/three.module.min.js';

export const DIST = 150;       // your camp to their castle's middle
export const RIVER_Z = -232;   // the river behind their castle

/** A small seeded random (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let s = 0;
  let amp = 1;
  let f = 1;
  let tot = 0;
  for (let i = 0; i < oct; i++) { s += amp * noise2(x * f, y * f); tot += amp; amp *= 0.5; f *= 2.03; }
  return s / tot;
}
const smooth = (t) => t * t * (3 - 2 * t);
/** Where the river runs (its middle line's z at x). */
export const riverZ = (x) => RIVER_Z + Math.sin(x * 0.018) * 7 + Math.sin(x * 0.05 + 1.2) * 2;

/** The ground's height at (x, z): rolling savanna, flat pads under the towers, the river's valley. */
export function groundHeight(x, z) {
  let h = (fbm(x * 0.011 + 3.1, z * 0.011 + 7.7) - 0.5) * 10 + (fbm(x * 0.05 + 9.2, z * 0.05 + 1.3) - 0.5) * 1.4;
  const pad = (cz, r) => Math.max(0, 1 - Math.hypot(x, z - cz) / r);
  // the castle's ground, the camp, and the field between them: flat enough to march over
  const field = Math.max(0, Math.min(1, (60 - Math.abs(x)) / 25)) * (z < 10 && z > -DIST ? 1 : 0);
  const p = smooth(Math.max(pad(0, 34), pad(-DIST, 52), field * 0.85));
  h *= 1 - p;
  const v = Math.max(0, 1 - Math.abs(z - riverZ(x)) / 22);
  h = h * (1 - smooth(v)) - smooth(v) * 6.5;
  return h;
}

// ------------------------------------------------------------------------------------------------------ the sky
const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = `
uniform vec3 sunDir;
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fb(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.1; a *= 0.5; } return s; }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  // the gradient (display colours, made linear): gold at the horizon, orange, rose, purple, deep indigo above
  vec3 cHor = lin(vec3(1.0, 0.80, 0.50));
  vec3 cLow = lin(vec3(1.0, 0.58, 0.33));
  vec3 cMid = lin(vec3(0.86, 0.36, 0.48));
  vec3 cUp  = lin(vec3(0.40, 0.22, 0.58));
  vec3 cTop = lin(vec3(0.10, 0.07, 0.24));
  vec3 cBel = lin(vec3(0.80, 0.50, 0.50));
  vec3 col = y < 0.0 ? mix(cHor, cBel, clamp(-y * 6.0, 0.0, 1.0))
    : y < 0.05 ? mix(cHor, cLow, y / 0.05)
    : y < 0.16 ? mix(cLow, cMid, (y - 0.05) / 0.11)
    : y < 0.38 ? mix(cMid, cUp, (y - 0.16) / 0.22)
    : mix(cUp, cTop, clamp((y - 0.38) / 0.62, 0.0, 1.0));
  // thin clouds in streaks, lit gold from below near the sun
  float az = atan(d.x, -d.z);
  float band = smoothstep(0.03, 0.10, y) * smoothstep(0.34, 0.14, y);
  float cl = smoothstep(0.44, 0.74, fb(vec2(az * 4.0, y * 30.0))) * band;
  float toSun = max(dot(d, normalize(sunDir)), 0.0);
  vec3 cloudCol = mix(lin(vec3(0.62, 0.30, 0.52)), lin(vec3(1.0, 0.78, 0.55)), pow(toSun, 6.0));
  col = mix(col, cloudCol, cl * 0.85);
  // the sun: a soft glow and its disc
  col += lin(vec3(1.0, 0.70, 0.40)) * pow(toSun, 9.0) * 0.55;
  col += lin(vec3(1.0, 0.86, 0.60)) * pow(toSun, 90.0) * 0.8;
  col = mix(col, lin(vec3(1.0, 0.95, 0.80)), smoothstep(0.99955, 0.99975, toSun));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
export function makeSky(sunDir) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { sunDir: { value: sunDir.clone().normalize() } },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), m);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

// ---------------------------------------------------------------------------------------------- land and life
/** Fine grain for the grass (a tiling noise, multiplied over the colours): close up the ground has texture. */
function grainTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  const r = rng(77);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + r() * 55;
    img.data[i] = v; img.data[i + 1] = v * 0.98; img.data[i + 2] = v * 0.93; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 500; k++) {
    g.strokeStyle = r() < 0.5 ? 'rgba(90,60,20,0.18)' : 'rgba(255,240,200,0.14)';
    g.lineWidth = 1;
    g.beginPath();
    const x = r() * 256;
    const y = r() * 256;
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 8);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(140, 140);
  t.anisotropy = 8;
  return t;
}

/** The ground: soft rolling savanna (smooth, not faceted), its colour from noise, a little green by the river. */
function makeGround(detail = 1) {
  const size = 900;
  const seg = detail < 1 ? 150 : 220;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -DIST / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const gA = new THREE.Color('#c39542');
  const gB = new THREE.Color('#a27a31');
  const gC = new THREE.Color('#d9b462');
  const earth = new THREE.Color('#9c5a33');
  const bank = new THREE.Color('#6f7a32');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y);
    c.copy(gA).lerp(gB, smooth(fbm(x * 0.018 + 5.3, z * 0.018 + 1.1, 3))).lerp(gC, fbm(x * 0.12, z * 0.12, 2) * 0.45);
    const dr = Math.abs(z - riverZ(x));
    if (dr < 24) c.lerp(bank, smooth(Math.max(0, 1 - dr / 24)) * 0.55);
    if (y < -2.2) c.lerp(earth, 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: grainTexture(), roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

function makeRiver() {
  const pts = [];
  for (let x = -450; x <= 450; x += 10) pts.push(x);
  const g = new THREE.BufferGeometry();
  const v = [];
  const w = 11;
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = pts[i];
    const x1 = pts[i + 1];
    const z0 = riverZ(x0);
    const z1 = riverZ(x1);
    v.push(x0, 0, z0 - w, x0, 0, z0 + w, x1, 0, z1 - w, x1, 0, z1 - w, x0, 0, z0 + w, x1, 0, z1 + w);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: '#6a4f8f', roughness: 0.06, metalness: 0.75, envMapIntensity: 1.6 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = -3.2;
  mesh.receiveShadow = true;
  return mesh;
}

/** Far hills as painted layers (no fog: they are the haze). */
function makeRidges() {
  const group = new THREE.Group();
  const layer = (r, h0, h1, color, seed) => {
    const v = [];
    const n = 140;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI * 0.95 + (i / n) * Math.PI * 1.9;
      const a1 = -Math.PI * 0.95 + ((i + 1) / n) * Math.PI * 1.9;
      const hh = (a) => h0 + (h1 - h0) * fbm(a * 4 + seed, seed, 4);
      const p = (a, y) => [Math.sin(a) * r, y, -Math.cos(a) * r - DIST / 2];
      v.push(...p(a0, -40), ...p(a1, -40), ...p(a0, hh(a0)), ...p(a0, hh(a0)), ...p(a1, -40), ...p(a1, hh(a1)));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const m = new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(g, m));
  };
  layer(1100, 40, 150, '#5c3a78', 2.3);
  layer(780, 18, 85, '#7a4a7e', 7.1);
  layer(560, 6, 42, '#9a5c78', 4.4);
  return group;
}

/** Acacias, rocks and grass tufts, scattered (never in the line of fire between the towers). */
function makeLife(rand, detail = 1) {
  const group = new THREE.Group();
  const free = (x, z) => (Math.abs(x) > 52 || z > 30 || z < -DIST - 55) && Math.hypot(x, z) > 30 && Math.hypot(x, z + DIST) > 50 && Math.abs(z - riverZ(x)) > 12;
  // acacias: a bent trunk and a wide flat crown
  const trunkG = new THREE.CylinderGeometry(0.18, 0.32, 5, 6);
  trunkG.translate(0, 2.5, 0);
  const crownG = new THREE.IcosahedronGeometry(1, 1);
  crownG.scale(4.2, 0.9, 3.6);
  const N = 70;
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#4b3326', roughness: 0.9, flatShading: true }), N);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: '#56632b', roughness: 0.95, flatShading: true }), N);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  let k = 0;
  for (let tries = 0; k < N && tries < 2000; tries++) {
    const x = (rand() - 0.5) * 520;
    const z = 40 - rand() * 380;
    if (!free(x, z)) continue;
    const y = groundHeight(x, z);
    const sc = 0.8 + rand() * 0.7;
    e.set((rand() - 0.5) * 0.25, rand() * 6.3, (rand() - 0.5) * 0.25);
    q.setFromEuler(e);
    s.set(sc, sc * (0.9 + rand() * 0.4), sc);
    m.compose(new THREE.Vector3(x, y, z), q, s);
    trunks.setMatrixAt(k, m);
    e.set(0, rand() * 6.3, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x + (rand() - 0.5), y + 5 * s.y, z), q, new THREE.Vector3(sc, sc, sc));
    crowns.setMatrixAt(k, m);
    k++;
  }
  trunks.count = k;
  crowns.count = k;
  trunks.castShadow = crowns.castShadow = true;
  group.add(trunks, crowns);
  // rocks
  const rockG = new THREE.DodecahedronGeometry(1, 0);
  const R = 90;
  const rocks = new THREE.InstancedMesh(rockG, new THREE.MeshStandardMaterial({ color: '#7d6a5a', roughness: 0.95, flatShading: true }), R);
  k = 0;
  for (let tries = 0; k < R && tries < 3000; tries++) {
    const x = (rand() - 0.5) * 420;
    const z = 30 - rand() * 330;
    if (!free(x, z) && rand() > 0.15) continue;
    if (Math.hypot(x, z) < 16 || Math.hypot(x, z + DIST) < 16) continue;
    const sc = 0.3 + rand() * rand() * 2.2;
    e.set(rand() * 3, rand() * 3, rand() * 3);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, groundHeight(x, z) + sc * 0.2, z), q, new THREE.Vector3(sc * (1 + rand()), sc * 0.7, sc));
    rocks.setMatrixAt(k++, m);
  }
  rocks.count = k;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);
  // grass tufts (thin cones), thick near both towers and along the river
  const blades = [];
  const nBlades = detail < 1 ? 3 : 5;
  for (let i = 0; i < nBlades; i++) {
    const bl = new THREE.ConeGeometry(0.035, 0.55 + (i % 3) * 0.18, 3, 1, true);
    bl.translate(0, 0.3, 0);
    bl.rotateZ((i - (nBlades - 1) / 2) * 0.22);
    bl.rotateY(i * 1.3);
    blades.push(bl);
  }
  const tuftG = mergeGeos(blades);
  const T = 7000;
  const tufts = new THREE.InstancedMesh(tuftG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), T);
  const tc = new THREE.Color();
  const shades = ['#d9b25c', '#c49a3e', '#e3c27a', '#a8862f', '#8f8a3a'];
  k = 0;
  for (let tries = 0; k < T && tries < 40000; tries++) {
    const x = (rand() - 0.5) * 300;
    const z = 30 - rand() * 330;
    if (Math.hypot(x, z + DIST) < 26 || Math.hypot(x, z) < 9) continue;
    const y = groundHeight(x, z);
    if (y < -3.0) continue;
    const sc = 0.6 + rand() * 0.9;
    e.set((rand() - 0.5) * 0.4, rand() * 6.3, (rand() - 0.5) * 0.4);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y - 0.05, z), q, new THREE.Vector3(sc, sc * (0.7 + rand() * 0.8), sc));
    tufts.setMatrixAt(k, m);
    tufts.setColorAt(k, tc.set(shades[Math.floor(rand() * shades.length)]));
    k++;
  }
  tufts.count = k;
  group.add(tufts);
  group.userData.tufts = tufts;
  group.userData.tuftsMax = k;
  return group;
}

/** Several geometries as one (positions and normals only). */
function mergeGeos(list) {
  const pos = [];
  const nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

/** The whole world into `scene`: sky, light, haze, land. Returns what the battle needs (the sun's direction). */
export function buildWorld(scene, renderer, { seed = 7, grass = 1, detail = 1 } = {}) {
  const rand = rng(seed);
  // the sun as you see it: low over the hills, left of their tower
  const sunDir = new THREE.Vector3(-0.26, 0.055, -1).normalize();
  const sky = makeSky(sunDir);
  scene.add(sky);
  // the sky lights everything a little (its own colours: purple from above, gold from the horizon)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(makeSky(sunDir));
  scene.environment = pmrem.fromScene(skyScene, 0.03).texture;
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.Fog('#e39a7c', 70, 640);
  // the key light: warm and low from the left (long shadows), a cool fill from the right
  const sun = new THREE.DirectionalLight('#ffbf86', 2.7);
  sun.position.set(-80, 55, -DIST + 70);
  sun.target.position.set(0, 6, -DIST);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -48; sc.right = 48; sc.top = 52; sc.bottom = -30; sc.near = 10; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#b8a2ff', 0.7);
  fill.position.set(60, 30, 40);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight('#9a7ad8', '#6a4a2a', 0.35));
  // the land
  const life = makeLife(rand, detail);
  scene.add(makeGround(detail), makeRiver(), makeRidges(), life);
  // (a phone gets thinner grass; `setGrass` thins it later if frames come slow)
  const setGrass = (k) => { life.userData.tufts.count = Math.floor(life.userData.tuftsMax * Math.max(0.1, Math.min(1, k))); };
  setGrass(grass);
  /** (a lighter shadow when the quality steps down) */
  const setShadow = (n) => {
    if (sun.shadow.mapSize.x === n) return;
    sun.shadow.mapSize.set(n, n);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  };
  return { sunDir, sun, setGrass, setShadow };
}
