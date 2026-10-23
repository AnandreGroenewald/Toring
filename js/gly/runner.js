// (1.19 3D) Glybaan's runners. The owner (18 Oct 2026): "maybe we should forget about the blocks here and make it small men
// that runs, fire man, Water man, and earth man, I really need you to make this exceptional". A little round elemental man
// with big eyes that blink and a determined brow: he runs (legs and arms swinging, a bob, leaning in), jumps (knees up,
// arms up), slides (feet first, leaning back), leans into a lane change, and tumbles when a run ends. Vuurman: lava skin
// glowing in its cracks, flames for hair. Waterman: glossy water with a rim of light, a curling wave on his head, drops
// circling him. Aardman: mossy earth, leaves and a flower growing from his head. Built from simple shapes (no model
// files): each is one group the game moves; `update` poses him every frame.
import * as THREE from '../../lib/three.module.min.js';

const HIP = 0.74;   // (m) the hips' height: he stands about 2.3 m to the top of his head, his element above that

/** A seeded random (each man made the same way every time). */
function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The fire man's skin: dark lava rock, its cracks glowing (the emissive map). */
let lavaTex = null;
function lavaCracks() {
  if (lavaTex) return lavaTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = '#ff5a00';
  g.shadowBlur = 10;
  const r = rand(7);
  for (let i = 0; i < 70; i++) {
    let x = r() * 256;
    let y = r() * 256;
    g.strokeStyle = r() < 0.3 ? '#ffe08a' : '#ff9a3a';
    g.lineWidth = 2.5 + r() * 4.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 64; y += (r() - 0.5) * 64; g.lineTo(x, y); }
    g.stroke();
  }
  lavaTex = new THREE.CanvasTexture(c);
  lavaTex.colorSpace = THREE.SRGBColorSpace;
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  return lavaTex;
}
/** A rim of light round the edges as the camera sees them (water catching the light). */
function rimLight(m, color, k) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: new THREE.Color(color) };
    sh.uniforms.uRimK = { value: k };
    sh.fragmentShader = `uniform vec3 uRim;\nuniform float uRimK;\n${sh.fragmentShader}`.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rimK = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
      totalEmissiveRadiance += uRim * pow(rimK, 2.4) * uRimK;`);
  };
  m.customProgramCacheKey = () => 'gly-rim';
  return m;
}
/** The man's own skin, by element (the elemental look of 18 Oct 2026: glossy little heroes glowing from within, as in the
 *  owner's pick of the Gemini pictures). */
function skinOf(element, glass = true) {
  if (element === 'vuur') return new THREE.MeshStandardMaterial({ color: '#1d0c08', emissive: '#ff7a24', emissiveMap: lavaCracks(), emissiveIntensity: 2.7, roughness: 0.38, metalness: 0.08 });
  // (the small pictures of the start card are drawn without the sky to reflect and without a scene to look through: there the old
  // see-through blue, which reads well that small)
  if (element === 'water' && !glass) return rimLight(new THREE.MeshStandardMaterial({ color: '#4fb6ff', emissive: '#1a74d8', emissiveIntensity: 0.5, roughness: 0.03, metalness: 0.05, transparent: true, opacity: 0.66, envMapIntensity: 1.8 }), '#dff8ff', 1.6);
  // (23 Oct 2026, the owner's yes: crystal glass like the picture's, light bending through it: transmission 1, thickness .8, water's
  // ior 1.33, no roughness, a slight cyan tint and a little glow from within; the first try, .9 and a bright rim, came out milky)
  if (element === 'water') return rimLight(new THREE.MeshPhysicalMaterial({ color: '#e4f7ff', emissive: '#18b0ff', emissiveIntensity: 0.15, roughness: 0, metalness: 0, transmission: 1, thickness: 0.8, ior: 1.33, attenuationColor: new THREE.Color('#4cc4ff'), attenuationDistance: 6, envMapIntensity: 1.6, clearcoat: 0.6, clearcoatRoughness: 0 }), '#cdf7ff', 1.3);
  // (the picture's earth man: built of stacked stones, moss in their joints)
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = `varying vec3 vSP;\nvarying vec3 vNO;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSP = position;\n  vNO = objectNormal;');
    sh.fragmentShader = `varying vec3 vSP;
varying vec3 vNO;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
${sh.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
      float row = vSP.y * 4.2;
      float rid = floor(row);
      float col = (vSP.x + vSP.z) * 3.0 + rid * 0.5;
      float jr = smoothstep(0.0, 0.1, fract(row)) * smoothstep(1.0, 0.9, fract(row));
      float jc = smoothstep(0.0, 0.08, fract(col)) * smoothstep(1.0, 0.92, fract(col));
      float joint = 1.0 - jr * jc;
      float shade = fract(sin(dot(vec2(rid, floor(col)), vec2(12.9898, 78.233))) * 43758.5453);
      diffuseColor.rgb *= (0.8 + 0.35 * shade) * (1.0 - 0.12 * joint);
      float mm = vn(vSP * 5.5) * 0.65 + vn(vSP * 13.0) * 0.35;
      float moss = smoothstep(0.36, 0.56, mm * clamp(vNO.y * 0.5 + 0.7, 0.0, 1.0) + 0.16 * vNO.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.52, 0.1), moss * 0.9);`);
  };
  m.customProgramCacheKey = () => 'gly-stones';
  return m;
}
/** The earth man's shapes: a little rocky (pushed in and out), grey stone with moss on what faces up. */
function earthy(g, r, amt = 0.06) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const earth = new THREE.Color('#a8996c');
  const deep = new THREE.Color('#6b5a3a');
  const moss = new THREE.Color('#5fa83a');
  const c = new THREE.Color();
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, [(r() - 0.5) * 2 * amt, r()]);
    const [push, v] = seen.get(key);
    p.setXYZ(i, p.getX(i) + n.getX(i) * push, p.getY(i) + n.getY(i) * push, p.getZ(i) + n.getZ(i) * push);
    c.copy(deep).lerp(earth, 0.5 + v * 0.5);
    if (n.getY(i) > 0.3) c.lerp(moss, Math.min(1, (n.getY(i) - 0.3) * 2.2) * (0.6 + v * 0.4));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/** `g` coloured one colour (per vertex: the leaves share one material and still differ). */
function tinted(g, c) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** Several geometries (each with position, normal and colour) as one: one draw instead of dozens. */
function mergeGeos(list) {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  let base = 0;
  for (const g of list) {
    const { position: p, normal: n, color: c } = g.attributes;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.getX(i), c.getY(i), c.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base); else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  o.setIndex(idx);
  return o;
}
/** A leaf: a pointed oval. */
function leafGeo(len = 0.5) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(len * 0.42, len * 0.38, 0, len);
  s.quadraticCurveTo(-len * 0.42, len * 0.38, 0, 0);
  return new THREE.ShapeGeometry(s, 5);
}

/**
 * A runner of `element` ('vuur', 'water', 'gras'): { root (move it: x across, y up for a jump), update(dt, state),
 * dispose() }. `state`: { mode: 'run'|'jump'|'slide'|'idle'|'dead', speed (m/s), lean (sideways speed), time }.
 */
/** A rounded block (a ball pushed out towards a box: `e` near 0 a box, 1 a ball), its vertices shared (the earth man's
 *  rocky push keeps it whole). */
function blockGeo(w, h, d, e = 0.34, seg = [14, 10]) {
  const g = new THREE.SphereGeometry(1, ...seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    p.setXYZ(i, Math.sign(x) * Math.abs(x) ** e * w / 2, Math.sign(y) * Math.abs(y) ** e * h / 2, Math.sign(z) * Math.abs(z) ** e * d / 2);
  }
  g.computeVertexNormals();
  return g;
}
/** The flames of his head: yellow-hot at their foot, orange, then red at their tips (how tall they are: 0-1). */
function fireTongue() {
  const m = new THREE.MeshStandardMaterial({ color: '#ff6a10', emissive: '#ffffff', roughness: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = `varying float vUpY;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vUpY = position.y;');
    sh.fragmentShader = `varying float vUpY;\n${sh.fragmentShader}`.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float faceK = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      vec3 hot = mix(vec3(1.0, 0.5, 0.08), vec3(1.0, 0.22, 0.01), smoothstep(0.1, 0.45, vUpY));
      hot = mix(hot, vec3(0.75, 0.06, 0.0), smoothstep(0.4, 0.8, vUpY));
      totalEmissiveRadiance = hot * (0.7 + 0.3 * faceK);`);
  };
  m.customProgramCacheKey = () => 'gly-firetongue';
  return m;
}
/** A tongue of flame: round at its foot, narrowing in a curve to a point, leaning over at the top. */
function flameTongueGeo(h, w, lean, radial = 20, steps = 12) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(new THREE.Vector2(Math.max(0.001, w * Math.sin(Math.PI * (0.5 + 0.5 * t)) ** 0.9 * (1 - t * 0.15)), t * h));
  }
  const g = new THREE.LatheGeometry(pts, radial);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h; p.setX(i, p.getX(i) + lean * y * y * h); }
  g.computeVertexNormals();
  return g;
}
/** A flame or a drop as one turned shape (the owner, 23 Oct 2026: "reshape them properly"): a round bulb of radius `r` that runs
 *  up into a point `h` above its middle; the sides curve by `bow` and `pw` (a flame's S, a drop's long point), `lean` bends the
 *  tip over. Light: radial x rows. */
function dropGeo(r, h, { bow = 1.5, pw = 0.9, lean = 0, radial = 20, rows = 18 } = {}) {
  const pts = [];
  const nb = Math.round(rows * 0.45);
  for (let i = 0; i <= nb; i++) { const a = -Math.PI / 2 + (i / nb) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(0.001, r * Math.cos(a)), r * Math.sin(a))); }
  const nt = rows - nb;
  for (let i = 1; i <= nt; i++) { const t = i / nt; pts.push(new THREE.Vector2(Math.max(0.001, r * (1 - t ** bow) ** pw), t * h)); }
  const g = new THREE.LatheGeometry(pts, radial);
  const p = g.attributes.position;
  if (lean) for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0) { const t = y / h; p.setX(i, p.getX(i) + lean * t * t * h); } }
  g.computeVertexNormals();
  return g;
}
/** A soft round glow (the fire man's heart, the water man's eyes). */
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const k = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  k.addColorStop(0, 'rgba(255,255,255,1)');
  k.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  k.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = k;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
/** A bubble seen in glass: a bright ring with a glint, the middle cut out (alpha test), so it draws with the solid things and the
 *  glass in front of it shows it (a see-through one would vanish behind the glass). */
let bubbleTex = null;
function bubbleTexture() {
  if (bubbleTex) return bubbleTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#eafcff';
  g.lineWidth = 6;
  g.beginPath(); g.arc(32, 32, 25, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 9;
  g.beginPath(); g.arc(32, 32, 25, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(42, 42, 4, 0, Math.PI * 2); g.fill();
  bubbleTex = new THREE.CanvasTexture(c);
  bubbleTex.colorSpace = THREE.SRGBColorSpace;
  return bubbleTex;
}
/** The fire man's face (the owner's picture: a face of fire): yellow-white where it looks at you, orange, then red at its
 *  edges, and brighter towards the top where it turns into his flames. */
function fireFace() {
  const m = new THREE.MeshStandardMaterial({ color: '#3a0d02', emissive: '#ffffff', roughness: 0.45 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = `varying float vUpY;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vUpY = position.y;');
    sh.fragmentShader = `varying float vUpY;\n${sh.fragmentShader}`.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float faceK = pow(clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 1.8);
      vec3 hot = mix(vec3(0.8, 0.07, 0.0), vec3(1.0, 0.38, 0.02), smoothstep(0.15, 0.7, faceK));
      hot = mix(hot, vec3(1.0, 0.5, 0.1), smoothstep(0.85, 1.0, faceK));
      hot = mix(hot, vec3(1.0, 0.3, 0.02), smoothstep(0.5, 1.0, vUpY) * 0.7);
      totalEmissiveRadiance = hot * (0.9 + 0.25 * smoothstep(-0.2, 0.5, vUpY));`);   // (glowing from within, 23 Oct 2026; 1.4 washed out to pale yellow under ACES, 0.9 stays orange)
  };
  m.customProgramCacheKey = () => 'gly-fireface';
  return m;
}
/** His element's swirl round him (the picture's three men each in a ribbon of their element): a band arcing from low
 *  behind one side up over his head and down the other, thick in the middle, light flowing along it. */
const RIBBON = {
  vuur: { a: '#ff3a00', b: '#ffc040', k: 2.0 },
  water: { a: '#2f8cff', b: '#e6fbff', k: 1.5 },
  gras: { a: '#14c040', b: '#b4ff8a', k: 1.7 },
};
function ribbon(element) {
  const N = 48;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = Math.PI * (1.18 - 1.34 * t);           // (from low on his left, over, down his right)
    const r = 1.16 + 0.12 * Math.sin(t * Math.PI);
    const cx = Math.cos(a) * r;
    const cy = 1.3 + Math.sin(a) * r * 1.08;
    const cz = 0.28 - 0.42 * Math.sin(t * Math.PI * 0.9);
    const w = 0.05 + 0.32 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    pos.push(cx - nx * w, cy - ny * w, cz, cx + nx * w, cy + ny * w, cz);
    uv.push(t, 0, t, 1);
    if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const c = RIBBON[element];
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: new THREE.Color(c.a) }, uB: { value: new THREE.Color(c.b) }, uK: { value: c.k } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform vec3 uA; uniform vec3 uB; uniform float uK; varying vec2 vUv;
      void main() {
        float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
        float flow = 0.62 + 0.38 * sin(vUv.x * 26.0 - uT * 9.0 + vUv.y * 3.0);
        float a = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.72, vUv.x) * smoothstep(0.0, 0.55, across) * flow * uK;
        vec3 col = mix(uA, uB, smoothstep(0.25, 0.95, across) * (0.4 + 0.6 * vUv.x));
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 6;
  return mesh;
}

export function createRunner(element, { glass = true } = {}) {
  const r = rand(element === 'vuur' ? 3 : element === 'water' ? 5 : 9);
  const earth = element === 'gras';
  const fire = element === 'vuur';
  const water = element === 'water';
  const skin = skinOf(element, glass);
  // (hands and feet: the fire man's charcoal, the water man's deeper glass, the earth man's own stone)
  // (the water man's hands and feet: the same clear glass as the rest of him, like the picture's)
  const accent = earth || (water && glass) ? skin
    : new THREE.MeshStandardMaterial({ color: fire ? '#1c0b06' : '#2a8ee8', roughness: 0.7, transparent: water, opacity: water ? 0.8 : 1 });
  const seg = [20, 14];
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = HIP;
  root.add(body);
  // the body: round and a little squat (the earth man a chunky boulder, rounded: 23 Oct 2026, "reshape them properly")
  const torso = mesh(earth ? earthy(blockGeo(1.0, 1.0, 0.8, 0.62, [16, 12]), r, 0.04) : new THREE.SphereGeometry(0.44, ...seg), skin);
  torso.position.y = 0.44;
  if (!earth) torso.scale.set(1, 1.1, 0.88);
  body.add(torso);
  // (the fire man's heart: a glowing core in his chest, with a halo)
  if (fire) {
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffb347' }));
    heart.position.set(0, 0.52, -0.37);
    heart.scale.set(1, 1, 0.5);
    body.add(heart);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff8a20', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    halo.scale.set(0.9, 0.9, 1);
    halo.position.set(0, 0.52, -0.42);
    body.add(halo);
  }
  // the head: big (he's little), tilted up to look at you; the fire man's one flame (a bulb that runs up into licks), the water
  // man's a drop of glass, the earth man's a rounded boulder
  const head = new THREE.Group();
  head.position.y = 1.12;
  head.rotation.x = 0.22;
  head.scale.setScalar(1.1);   // (a collectible toy's big head)
  body.add(head);
  const flick = [];   // (the fire man's flames, flickering)
  const face = fire ? fireFace() : skin;
  const headGeo = fire ? dropGeo(0.53, 1.0, { bow: 1.5, pw: 0.9, lean: 0.1 })
    : water ? dropGeo(0.53, 0.8, { bow: 1, pw: 1.5, rows: 20, radial: 22 })
    : earthy(blockGeo(1.05, 0.95, 0.95, 0.62, [16, 12]), r, 0.04);
  const headMesh = mesh(headGeo, face);
  head.add(headMesh);
  if (fire) {
    // (two licks of flame rise from the sides of his one flame; they and the tip flicker)
    const tongue = fireTongue();
    for (const [x, h, w, lean, tilt] of [[-0.3, 0.7, 0.26, -0.2, 0.42], [0.3, 0.76, 0.26, 0.22, -0.42]]) {
      const t = mesh(flameTongueGeo(h, w, lean, 14, 9), tongue);
      t.position.set(x, 0.1, 0.06);
      t.rotation.z = tilt;
      t.userData.base = tilt;
      head.add(t);
      flick.push(t);
    }
    headMesh.userData.amp = 0.03;
    flick.push(headMesh);
  }
  // eyes that blink (the picture's: dark ovals with a glint; the water man's glow), a little smile
  const eyeMat = water ? new THREE.MeshBasicMaterial({ color: '#12d2ff' }) : new THREE.MeshBasicMaterial({ color: '#16090a' });
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const eyes = new THREE.Group();
  head.add(eyes);
  const glowMat = water ? new THREE.SpriteMaterial({ map: glowTexture(), color: '#3fe6ff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }) : null;
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.19, 0.06, earth ? -0.45 : -0.47);
    eye.rotation.y = s * -0.28;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), eyeMat);
    ball.scale.set(1, 1.35, 0.5);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), white);
    glint.position.set(-s * 0.02 - 0.02, 0.05, -0.05);
    eye.add(ball);
    if (!water) eye.add(glint);
    if (glowMat) { const gl = new THREE.Sprite(glowMat); gl.scale.set(0.42, 0.5, 1); gl.position.set(0, 0, -0.08); eye.add(gl); }
    eyes.add(eye);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 5, 12, Math.PI), water ? eyeMat : new THREE.MeshBasicMaterial({ color: '#16090a' }));
  smile.position.set(0, -0.15, earth ? -0.47 : -0.49);
  smile.rotation.set(0.25, 0, Math.PI);
  head.add(smile);
  // arms (swinging from the shoulders) with round hands, legs (from the hips) with round feet (the earth man's rounded boulders)
  const limb = (side, y, len, rad, hand) => {
    const pivot = new THREE.Group();
    pivot.position.set(side, y, 0);
    const arm = mesh(earth ? earthy(blockGeo(rad * 2.7, len + rad * 2.1, rad * 2.7, 0.55, [8, 6]), r, 0.02) : new THREE.CapsuleGeometry(rad, len, 3, 10), skin);
    arm.position.y = -(len / 2 + rad * 0.6);
    const end = mesh(earth ? earthy(blockGeo(hand * 2.5, hand * 2.2, hand * 2.5, 0.6, [8, 6]), r, 0.02) : new THREE.SphereGeometry(hand, 10, 7), accent);
    end.position.y = -(len + rad * 1.4);
    pivot.add(arm, end);
    body.add(pivot);
    return { pivot, end };
  };
  const armR = limb(0.45, 0.68, 0.3, 0.11, 0.135);
  const armL = limb(-0.45, 0.68, 0.3, 0.11, 0.135);
  const legR = limb(0.2, 0.02, 0.32, 0.14, 0.16);
  const legL = limb(-0.2, 0.02, 0.32, 0.14, 0.16);
  for (const leg of [legR, legL]) { leg.end.scale.set(1, 0.68, 1.5); leg.end.position.z = -0.08; }
  // (the earth man's shoulders: a boulder each)
  if (earth) for (const sd of [-1, 1]) { const sh = mesh(earthy(blockGeo(0.46, 0.42, 0.46, 0.6, [8, 6]), r, 0.03), skin); sh.position.set(sd * 0.5, 0.78, 0); body.add(sh); }
  // his element on his head
  const crest = new THREE.Group();
  head.add(crest);
  const orbit = [];
  const sway = [];
  if (fire) {
    // (his head is his flame: nothing more on it)
  } else if (water) {
    // (his head is a drop; bubbles rise inside him, drops circle him)
    const bubble = new THREE.SpriteMaterial({ map: bubbleTexture(), alphaTest: 0.5, transparent: false, fog: false, alphaToCoverage: true });
    for (let i = 0; i < 13; i++) {
      const b = new THREE.Sprite(bubble);
      const sz = 0.07 + r() * 0.09;
      b.scale.set(sz, sz, 1);
      const inHead = i < 6;
      b.position.set((r() - 0.5) * 0.56, inHead ? (r() - 0.35) * 0.7 : (r() - 0.5) * 0.5, (r() - 0.35) * 0.4);
      (inHead ? head : body).add(b);
      if (!inHead) b.position.y += 0.4;
    }
    for (let i = 0; i < 3; i++) {
      const d = mesh(new THREE.SphereGeometry(0.075, 8, 6), skin);
      d.userData.a = (i / 3) * Math.PI * 2;
      head.add(d);
      orbit.push(d);
    }
  } else {
    // (a wreath of glowing vine and leaves, as in the picture: two vines wound round his head's top, curling tendrils, forty-four small
    // leaves leaning out in every direction, in four clumps that flutter; one bright green bead on his brow. 23 Oct 2026: the old
    // twelve leaves leaned in and stood up, a green spike crown from the front)
    const wreath = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffffff', emissive: '#15b83a', emissiveIntensity: 1.0, roughness: 0.4, side: THREE.DoubleSide });
    const tint = new THREE.Color();
    const ringY = (a) => 0.46 + 0.05 * Math.sin(a * 4);
    const vines = [];
    for (const ph of [0, Math.PI]) {
      const pts = [];
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const rr = 0.45 + 0.035 * Math.sin(a * 5 + ph);
        pts.push(new THREE.Vector3(Math.cos(a) * rr, ringY(a + ph * 0.25) + 0.03 * Math.sin(a * 7 + ph), Math.sin(a) * rr));
      }
      vines.push(tinted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 40, 0.026, 4, true), tint.set('#2fae45')));
    }
    for (let i = 0; i < 3; i++) {
      const a = 0.7 + i * 2.1;
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const rr = 0.44 - t * 0.12;
        const w = 0.09 * Math.sin(t * 7);
        pts.push(new THREE.Vector3(Math.cos(a) * rr + Math.cos(a + 1.57) * w, 0.5 + t * 0.4, Math.sin(a) * rr + Math.sin(a + 1.57) * w));
      }
      vines.push(tinted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.017, 3, false), tint.set('#3cc455')));
    }
    const clumps = [[], [], [], []];
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler(0, 0, 0, 'YXZ');
    const mat = new THREE.Matrix4();
    const one = new THREE.Vector3(1, 1, 1);
    const at = new THREE.Vector3();
    for (let i = 0; i < 44; i++) {
      const a = i * 2.399963;
      const rr = 0.45 + (r() - 0.5) * 0.04;
      const len = 0.18 + r() * 0.16;
      eu.set(0.25 + r() * 0.95, -a + Math.PI / 2 + (r() - 0.5) * 1.3, (r() - 0.5) * 0.9);
      q.setFromEuler(eu);
      at.set(Math.cos(a) * rr, ringY(a) + 0.02, Math.sin(a) * rr);
      mat.compose(at, q, one);
      clumps[i % 4].push(tinted(leafGeo(len).applyMatrix4(mat), tint.setHSL(0.33 + (r() - 0.5) * 0.05, 0.72, 0.4 + r() * 0.22)));
    }
    crest.add(mesh(mergeGeos(vines), wreath));
    for (const list of clumps) {
      const cl = mesh(mergeGeos(list), wreath);
      cl.castShadow = false;
      crest.add(cl);
      sway.push(cl);
    }
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#b9ffb4' }));
    bead.position.set(0, 0.36, -0.43);
    crest.add(bead);
  }
  // the swirl of his element round him
  const swirl = ribbon(element);
  root.add(swirl);

  // ------------------------------------------------------------------------------------------------- moving him
  let phase = r() * 6;
  let blinkIn = 1.5 + r() * 2;
  let blinking = 0;
  let lean = 0;
  const cur = { legL: 0, legR: 0, armL: 0.1, armR: 0.1, armZ: 0.14, bodyX: 0, y: HIP, headX: 0.22, headY: 0 };
  /** Poses him for this frame (the pose eases in: a jump's knees come up, a slide leans him back). */
  function update(dt, s) {
    const mode = s.mode || 'idle';
    const t = s.time || 0;
    phase += dt * Math.PI * 2 * (mode === 'run' ? Math.min(6.2, 2.4 + (s.speed || 15) * 0.1) : 1);
    const sn = Math.sin(phase);
    let tg;
    if (mode === 'run') tg = { legL: sn * 0.95, legR: -sn * 0.95, armL: -sn * 0.85, armR: sn * 0.85, armZ: 0.16, bodyX: -0.24, y: HIP + Math.abs(Math.cos(phase)) * 0.1, headX: 0.24 + sn * 0.03, headY: 0 };
    else if (mode === 'jump') tg = { legL: 1.25, legR: 0.85, armL: 2.6, armR: 2.4, armZ: 0.45, bodyX: 0.05, y: HIP, headX: 0.32, headY: 0 };
    else if (mode === 'slide') tg = { legL: 1.55, legR: 1.38, armL: -0.75, armR: -0.75, armZ: 0.75, bodyX: 1.0, y: 0.36, headX: -0.55, headY: 0 };
    else if (mode === 'dead') tg = { legL: Math.sin(t * 19) * 0.9, legR: -Math.sin(t * 19) * 0.9, armL: 2.1 + Math.sin(t * 17) * 0.9, armR: 2.1 - Math.sin(t * 17) * 0.9, armZ: 0.9, bodyX: 0, y: HIP, headX: 0.1, headY: 0 };
    else tg = { legL: 0, legR: 0, armL: 0.1, armR: 0.1, armZ: 0.13 + Math.sin(t * 1.6) * 0.04, bodyX: 0, y: HIP + Math.sin(t * 2.2) * 0.022, headX: 0.2, headY: Math.sin(t * 0.7) * 0.42 };
    const k = 1 - Math.exp(-dt * (mode === 'run' ? 34 : 15));
    for (const key in tg) cur[key] += (tg[key] - cur[key]) * k;
    legL.pivot.rotation.x = cur.legL;
    legR.pivot.rotation.x = cur.legR;
    armL.pivot.rotation.x = cur.armL;
    armR.pivot.rotation.x = cur.armR;
    armL.pivot.rotation.z = -cur.armZ;
    armR.pivot.rotation.z = cur.armZ;
    body.rotation.x = cur.bodyX;
    body.position.y = cur.y;
    head.rotation.x = cur.headX;
    head.rotation.y = cur.headY;
    // leaning into a lane change
    lean += (Math.max(-0.34, Math.min(0.34, -(s.lean || 0) * 0.028)) - lean) * Math.min(1, dt * 14);
    root.rotation.z = lean;
    // a blink now and then
    if ((blinkIn -= dt) <= 0) { blinking = 0.12; blinkIn = 2 + Math.random() * 2.6; }
    if (blinking > 0) blinking -= dt;
    eyes.scale.y = blinking > 0 ? 0.12 : 1;
    // his element alive: drops circling the water man, the earth man's leaves in the wind
    for (const d of orbit) {
      const a = d.userData.a + t * 2.6;
      d.position.set(Math.cos(a) * 0.78, 0.18 + Math.sin(t * 3 + d.userData.a) * 0.12, Math.sin(a) * 0.78);
    }
    flick.forEach((f, i) => { if (f.userData.amp) { f.scale.y = 1 + Math.sin(t * 9 + i * 1.3) * f.userData.amp; return; } f.rotation.z = (f.userData.base || 0) + Math.sin(t * (mode === 'run' ? 11 : 5) + i * 2.1) * 0.12; f.scale.y = 1 + Math.sin(t * 9 + i * 1.3) * 0.08; });
    swirl.material.uniforms.uT.value = t;
    swirl.rotation.y = Math.sin(t * 0.9) * 0.18;
    sway.forEach((cl, i) => { const k = mode === 'run' ? 9 : 2.4; cl.rotation.x = Math.sin(t * k + i * 1.7) * (mode === 'run' ? 0.07 : 0.025); cl.rotation.z = Math.cos(t * k * 0.8 + i * 2.3) * (mode === 'run' ? 0.06 : 0.02); });
  }
  function dispose() {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    });
  }
  return { root, update, dispose };
}

/**
 * Pictures of the three men for the start card (a small renderer of its own, used once and let go): { vuur, water, gras }
 * as image URLs ('' where a phone can't draw them: the card still shows the names).
 */
export function portraits() {
  const out = { vuur: '', water: '', gras: '' };
  let rnd = null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    rnd = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: false, preserveDrawingBuffer: true });
    rnd.toneMapping = THREE.ACESFilmicToneMapping;
    rnd.toneMappingExposure = 1.1;
    rnd.outputColorSpace = THREE.SRGBColorSpace;
    rnd.setClearColor('#2a1b4e', 1);
    const sc = new THREE.Scene();
    const key = new THREE.DirectionalLight('#ffe6cc', 2.8);
    key.position.set(-3, 5, -6);
    const rim = new THREE.DirectionalLight('#9fc2ff', 1.4);
    rim.position.set(4, 3, 5);
    sc.add(key, rim, new THREE.HemisphereLight('#fff0dc', '#2a2030', 0.9));
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 2.2, -5.2);
    cam.lookAt(0, 1.55, 0);
    for (const el of Object.keys(out)) {
      const man = createRunner(el, { glass: false });
      man.root.rotation.y = 0.3;
      man.update(1, { mode: 'idle', time: 0.4 });
      sc.add(man.root);
      rnd.render(sc, cam);
      out[el] = c.toDataURL('image/png');
      sc.remove(man.root);
      man.dispose();
    }
  } catch { /* the names alone */ }
  try { rnd?.dispose(); rnd?.forceContextLoss(); } catch { /* */ }
  return out;
}
