// (1.20) Die Rivier's world: a South African river canyon in the late afternoon (sandstone cliffs in layers, bush on top,
// a deep green river with white water at its edges), drawn for a phone. The owner wanted the town grown-up, not
// childish, and its colours and light right (24 Oct 2026): real light, a warm low sun, haze in the distance, no cartoon
// outlines. The river runs straight for the game (three lanes) but the world bends ahead of you, so it winds.
//
// Course space: z = metres downstream from the start, x = metres across (0 = the middle lane). The rider stays at the
// world's origin looking down -z; a thing `d` metres ahead stands at world z = -d, moved across by bendX(d).
import * as THREE from '../../lib/three.module.min.js';

export const SUN = new THREE.Vector3(-0.45, 0.34, -0.83).normalize();   // low, ahead and a little left: rim light on what comes
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
export const COLORS = {
  zenith: '#4f86c6', horizon: '#f2d3a7', haze: '#e6c9a1', sun: '#ffe3b8',
  deep: '#0f3b3a', shallow: '#2e7a6b', foam: '#f4f1e8',
  rock: ['#c9824f', '#e0b27a', '#a85f3c', '#d99b62', '#8e4f33', '#e8c592'],
  bush: '#4d6b2f', bushL: '#6f8f3a', grass: '#8a9a4a',
};
export const BANK = { half: 8.2, lake: 46, fogNear: 90, fogFar: 520 };

/** How far across the world bends `d` metres ahead (m): a gentle winding that changes with the course. */
export function bendX(d, z) {
  const a = Math.max(0, d) / 160;
  return Math.sin(z * 0.0042 + 0.6) * 9 * a * a + Math.sin(z * 0.011 + 2.1) * 2.2 * a;
}
/**
 * The same bend for every lit thing in the river: its material's vertex shader moves each vertex across by bendX (from
 * its world position: `ahead` = -z), so what's placed straight in course space winds with the water. One shared clock.
 */
export const bendUniforms = { uDist: { value: 0 } };
const BEND_GLSL = `uniform float uDist;
float rvBend(float d, float z) { float a = max(0.0, d) / 160.0; return sin(z * 0.0042 + 0.6) * 9.0 * a * a + sin(z * 0.011 + 2.1) * 2.2 * a; }`;
export function bendMaterial(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDist = bendUniforms.uDist;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${BEND_GLSL}`)
      .replace('#include <project_vertex>', `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
  vec4 rvW = modelMatrix * mvPosition;
  rvW.x += rvBend(-rvW.z, uDist - rvW.z);
  mvPosition = viewMatrix * rvW;
  gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'rivier-bend';
  return m;
}

// ------------------------------------------------------------------------------------------------ textures
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
/** A tileable two-channel noise (value noise, four octaves): the water's ripples. */
function noiseTexture(n = 128) {
  const c = canvas(n, n);
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const grid = (cells) => Array.from({ length: cells * cells }, () => [rnd(), rnd()]);
  const octs = [[4, 0.5], [8, 0.26], [16, 0.15], [32, 0.09]].map(([cells, w]) => ({ cells, w, g: grid(cells) }));
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let r = 0;
      let b = 0;
      for (const o of octs) {
        const fx = (x / n) * o.cells;
        const fy = (y / n) * o.cells;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        const at = (i, j) => o.g[((j % o.cells) + o.cells) % o.cells * o.cells + (((i % o.cells) + o.cells) % o.cells)];
        for (const ch of [0, 1]) {
          const v = (at(x0, y0)[ch] * (1 - tx) + at(x0 + 1, y0)[ch] * tx) * (1 - ty) + (at(x0, y0 + 1)[ch] * (1 - tx) + at(x0 + 1, y0 + 1)[ch] * tx) * ty;
          if (ch === 0) r += v * o.w; else b += v * o.w;
        }
      }
      const k = (y * n + x) * 4;
      img.data[k] = Math.round(r * 255);
      img.data[k + 1] = Math.round(b * 255);
      img.data[k + 2] = 128;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}
/** Sandstone in layers (the cliffs' picture): bands of warm colour, grain and cracks. */
function rockTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let y = 0;
  while (y < 256) {
    const h = 8 + rnd() * 26;
    g.fillStyle = COLORS.rock[Math.floor(rnd() * COLORS.rock.length)];
    g.fillRect(0, y, 256, h + 1);
    y += h;
  }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '60,30,15' : '255,240,210'},${0.05 + rnd() * 0.12})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  g.strokeStyle = 'rgba(55,25,12,0.35)';
  for (let i = 0; i < 26; i++) {
    g.lineWidth = 0.6 + rnd();
    g.beginPath();
    let x = rnd() * 256;
    let yy = rnd() * 256;
    g.moveTo(x, yy);
    for (let k = 0; k < 4; k++) {
      x += (rnd() - 0.5) * 18;
      yy += 6 + rnd() * 16;
      g.lineTo(x, yy);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------------------------------------ the sky
const SKY_VERT = `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunCol; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.62, h), 0.7));
  float s = max(dot(d, uSun), 0.0);
  col += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.32 + pow(s, 4.0) * 0.12);
  col = mix(col, uHorizon * 0.92, smoothstep(0.05, -0.2, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------------------------------------ the water
const WATER_VERT = `uniform float uDist; uniform float uBendA; uniform float uBendB;
varying vec3 vWorld; varying vec2 vRiver; varying float vAhead;
float bendX(float d, float z) { float a = max(0.0, d) / 160.0; return sin(z * 0.0042 + 0.6) * 9.0 * a * a + sin(z * 0.011 + 2.1) * 2.2 * a; }
void main() {
  vec3 p = position;
  float ahead = -p.z;
  float zc = uDist + ahead;
  p.x += bendX(ahead, zc);
  vRiver = vec2(position.x, zc);
  vAhead = ahead;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WATER_FRAG = `uniform float uT; uniform sampler2D uNoise; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uDeep; uniform vec3 uShallow;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uFoam; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
uniform float uHalf; uniform float uLakeFrom; uniform float uLakeTo; uniform float uDetail;
varying vec3 vWorld; varying vec2 vRiver; varying float vAhead;
void main() {
  vec2 p = vRiver;
  float flow = uT * 2.4;
  vec2 a = texture2D(uNoise, p * vec2(0.055, 0.032) + vec2(0.0, -flow * 0.018)).rg;
  vec2 b = texture2D(uNoise, p * vec2(0.17, 0.09) + vec2(uT * 0.013, -flow * 0.05)).rg;
  vec2 c = texture2D(uNoise, p * vec2(0.42, 0.24) + vec2(-uT * 0.03, -flow * 0.11)).rg;
  vec2 n2 = (a - 0.5) * 0.8 + (b - 0.5) * 0.55 + (c - 0.5) * 0.35 * uDetail;
  vec3 n = normalize(vec3(n2.x, 1.0, n2.y));
  vec3 v = normalize(cameraPosition - vWorld);
  // the banks (and the lake's wider shore): shallow, foamy water near them
  float lake = smoothstep(uLakeFrom, uLakeFrom + 40.0, p.y) * (1.0 - smoothstep(uLakeTo, uLakeTo + 30.0, p.y));
  float half_ = mix(uHalf, 46.0, lake);
  float edge = abs(p.x) / half_;
  vec3 base = mix(uDeep, uShallow, smoothstep(0.35, 1.0, edge) * 0.8 + 0.12 * (b.x - 0.5));
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.5, r.y));
  vec3 col = mix(base, sky, clamp(fres * 0.85, 0.0, 0.8));
  float sp = pow(max(dot(r, uSun), 0.0), 140.0);
  col += uSunCol * sp * 2.6;
  col += uSunCol * pow(max(dot(r, uSun), 0.0), 12.0) * 0.08;
  // white water: along the banks, and streaks where the current breaks
  float bankFoam = smoothstep(0.86, 1.0, edge) * smoothstep(0.35, 0.75, a.x + b.y * 0.6);
  float streak = smoothstep(0.78, 0.92, b.x * 0.6 + c.y * 0.6) * 0.35 * (1.0 - lake);
  col = mix(col, uFoam, clamp(bankFoam + streak, 0.0, 0.85));
  float f = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
  col = mix(col, uFog, f);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * The world: { group, water, update(dist, t, camera), setLake(fromZ, toZ), dispose() }. `quality` from the stage.
 */
export function buildRiverWorld(stage) {
  const { scene, renderer, quality } = stage;
  const group = new THREE.Group();
  scene.add(group);
  const fog = lin(COLORS.haze);
  scene.fog = new THREE.Fog(fog, BANK.fogNear, BANK.fogFar);
  scene.background = null;

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uZenith: { value: lin(COLORS.zenith) }, uHorizon: { value: lin(COLORS.horizon) }, uSun: { value: SUN.clone() }, uSunCol: { value: lin(COLORS.sun) } },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  group.add(sky);
  // what metal and gloss reflect: the same sky
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), skyMat.clone()));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();

  // light: the low sun ahead-left, the sky's blue from above, warm ground bounce
  const sun = new THREE.DirectionalLight(COLORS.sun, 2.6);
  sun.position.copy(SUN).multiplyScalar(120);
  group.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#ffd9b0', 0.9);   // (from behind the camera: what comes at you is lit)
  fill.position.set(6, 10, 30);
  group.add(fill);
  group.add(new THREE.HemisphereLight('#bcd6ff', '#7a5a3a', 0.75));

  // the water: a long strip that rides with the camera; its ripples run in course space
  const noise = noiseTexture(quality.name === 'low' ? 96 : 128);
  const water = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 }, uDist: { value: 0 }, uNoise: { value: noise }, uSun: { value: SUN.clone() }, uSunCol: { value: lin(COLORS.sun) },
      uDeep: { value: lin(COLORS.deep) }, uShallow: { value: lin(COLORS.shallow) }, uZenith: { value: lin(COLORS.zenith) },
      uHorizon: { value: lin(COLORS.horizon) }, uFoam: { value: lin(COLORS.foam) }, uFog: { value: fog },
      uFogNear: { value: BANK.fogNear }, uFogFar: { value: BANK.fogFar }, uHalf: { value: BANK.half },
      uLakeFrom: { value: 1e6 }, uLakeTo: { value: 1e6 }, uDetail: { value: quality.name === 'low' ? 0 : 1 },
      uBendA: { value: 0 }, uBendB: { value: 0 },
    },
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
  });
  const seg = quality.name === 'high' ? [24, 220] : [16, 150];
  const wgeo = new THREE.PlaneGeometry(120, 640, seg[0], seg[1]);
  wgeo.rotateX(-Math.PI / 2);
  wgeo.translate(0, 0, -640 / 2 + 40);   // from 40 m behind to 600 m ahead
  const waterMesh = new THREE.Mesh(wgeo, water);
  waterMesh.frustumCulled = false;
  group.add(waterMesh);

  // the canyon: cliff walls in pieces along both banks, re-used as you go; bush and boulders on them
  const rockMat = bendMaterial(new THREE.MeshStandardMaterial({ map: rockTexture(), roughness: 0.92, metalness: 0, vertexColors: true, side: THREE.DoubleSide }));
  const SEG_L = 48;
  const N_SEG = 13;
  function cliffGeometry(side, seed) {
    const g = new THREE.PlaneGeometry(SEG_L, 34, 14, 10);
    const pos = g.attributes.position;
    const col = [];
    let s = seed * 7919 + 13;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const bumps = Array.from({ length: 6 }, () => [rnd() * SEG_L - SEG_L / 2, rnd() * 30, 2 + rnd() * 3]);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);   // along the river
      const v = pos.getY(i) + 17;   // height 0..34
      let out = Math.pow(v / 34, 1.6) * 7 + Math.sin(u * 0.21 + seed) * 0.9 + Math.sin(v * 0.6 + u * 0.05) * 0.6;
      for (const [bu, bv, br] of bumps) out -= Math.exp(-((u - bu) ** 2 + (v - bv) ** 2) / (br * br * 2)) * 1.6;
      const shelf = v < 1.2 ? (1.2 - v) * 1.4 : 0;   // (a ledge at the water)
      pos.setXYZ(i, side * (out + shelf), v - 1.1, u);
      const k = 0.78 + rnd() * 0.3 - (v < 2 ? 0.25 : 0);
      col.push(k, k * 0.97, k * 0.94);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // (a wall facing the river: the left one faces +x, the right one -x)
    if (side > 0) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    }
    g.computeVertexNormals();
    return g;
  }
  const cliffGeos = { '-1': [0, 1, 2].map((k) => cliffGeometry(-1, k + 1)), 1: [0, 1, 2].map((k) => cliffGeometry(1, k + 4)) };
  const bushMat = bendMaterial(new THREE.MeshStandardMaterial({ color: COLORS.bush, roughness: 0.95, flatShading: true }));
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  const boulderGeo = new THREE.DodecahedronGeometry(1, 0);
  const boulderMat = bendMaterial(new THREE.MeshStandardMaterial({ map: rockMat.map, color: '#c99a72', roughness: 0.85, flatShading: true }));
  const segs = [];
  const BUSH_PER = quality.name === 'low' ? 6 : 12;
  const ROCK_PER = 5;
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, N_SEG * 2 * BUSH_PER);
  const boulders = new THREE.InstancedMesh(boulderGeo, boulderMat, N_SEG * 2 * ROCK_PER);
  bushes.frustumCulled = boulders.frustumCulled = false;
  group.add(bushes, boulders);
  for (let i = 0; i < N_SEG; i++) {
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(cliffGeos[side][(i + (side > 0 ? 1 : 0)) % 3], rockMat);
      m.frustumCulled = false;
      group.add(m);
      const r = (k) => { const x = Math.sin((i * 2 + (side > 0 ? 1 : 0)) * 91.7 + k * 13.1) * 43758.5; return x - Math.floor(x); };
      segs.push({ m, side, i, r, bushes: Array.from({ length: BUSH_PER }, (_, k) => [r(k) * SEG_L - SEG_L / 2, 0.9 + r(k + 40) * 1.7, r(k + 80)]), rocks: Array.from({ length: ROCK_PER }, (_, k) => [r(k + 120) * SEG_L - SEG_L / 2, 0.5 + r(k + 160) * 0.9]) });
    }
  }
  // far hills in the haze, beyond the canyon
  const hillMat = new THREE.MeshBasicMaterial({ color: lin('#c79f86'), fog: true });
  const hills = new THREE.Group();
  for (let k = 0; k < 9; k++) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(70 + (k % 3) * 30, 70 + (k % 4) * 26, 7, 1), hillMat);
    h.position.set((k - 4) * 95 + (k % 2) * 30, 10, -470 - (k % 3) * 40);
    hills.add(h);
  }
  group.add(hills);

  const tmp = new THREE.Object3D();
  let lake = { from: 1e6, to: 1e6 };
  /** The bank's distance from the middle at course z (it opens out into the lake). */
  const halfAt = (z) => {
    const k = Math.min(1, Math.max(0, (z - lake.from) / 40)) * (1 - Math.min(1, Math.max(0, (z - lake.to) / 30)));
    return BANK.half + (BANK.lake - BANK.half) * k * k * (3 - 2 * k);
  };

  function update(dist, t) {
    water.uniforms.uT.value = t;
    water.uniforms.uDist.value = dist;
    bendUniforms.uDist.value = dist;
    // the cliff pieces: each takes its slot ahead of the camera (SEG_L apart), from 40 m behind (the shader bends them)
    const first = Math.floor((dist - 40) / SEG_L);
    let bi = 0;
    let ri = 0;
    for (const s of segs) {
      const slot = first + ((s.i - first) % N_SEG + N_SEG) % N_SEG;
      const zc = slot * SEG_L + SEG_L / 2;   // course z of the piece's middle
      const ahead = zc - dist;
      const half = halfAt(zc);
      const low = (half - BANK.half) / (BANK.lake - BANK.half);   // (0 in the canyon, 1 at the lake: low shores)
      const hy = 1 - 0.78 * low;
      s.m.position.set(s.side * half, 0, -ahead);
      s.m.scale.set(1, hy, 1);
      for (const [u, sc, kk] of s.bushes) {
        tmp.position.set(s.side * (half + 6.5 + kk * 3), (33 + kk * 2) * hy - sc * 0.4, -(ahead + u));
        tmp.scale.set(sc * 1.4, sc, sc * 1.4);
        tmp.rotation.set(kk, kk * 3, 0);
        tmp.updateMatrix();
        bushes.setMatrixAt(bi++, tmp.matrix);
      }
      for (const [u, sc] of s.rocks) {
        tmp.position.set(s.side * (half - 0.3 - sc * 0.4), sc * 0.25 - 0.2, -(ahead + u));
        tmp.scale.set(sc * 1.3, sc * 0.8, sc);
        tmp.rotation.set(sc, u, 0);
        tmp.updateMatrix();
        boulders.setMatrixAt(ri++, tmp.matrix);
      }
    }
    bushes.instanceMatrix.needsUpdate = true;
    boulders.instanceMatrix.needsUpdate = true;
  }

  return {
    group, water, sun, update, halfAt,
    /** The river opens into a lake from course z `from` (and narrows again after `to`). */
    setLake(from, to = 1e6) {
      lake = { from, to };
      water.uniforms.uLakeFrom.value = from;
      water.uniforms.uLakeTo.value = to;
    },
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        o.geometry?.dispose?.();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) { m.map?.dispose?.(); m.dispose?.(); }
      });
      noise.dispose();
      scene.environment?.dispose?.();
      scene.environment = null;
      scene.fog = null;
    },
  };
}
