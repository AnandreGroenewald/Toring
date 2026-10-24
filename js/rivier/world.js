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
  zenith: '#3f7fc4', horizon: '#e9dcc3', haze: '#dcd2bd', sun: '#fff0d2', skyRefl: '#8fb8dc',
  deep: '#2a8a88', shallow: '#56bba8', foam: '#f6f8f4',
  rock: ['#b9693f', '#cc8452', '#d9a06c', '#a35a36', '#e2bb8a', '#c27548', '#8f4d31'],
  bush: '#3f5a2a', bushL: '#5f7a35', grass: '#8a9a4a', wall: '#6b4430', mesa: '#a9705a', mesaTop: '#6f7d4f', bird: '#241d1a',
};
export const BANK = { half: 8.2, lake: 46, fogNear: 90, fogFar: 520 };
/**
 * The sky and light for each background skin from the Winkel (the 2D game's `scene`): the same canyon at midday, at
 * sunset, under the moon and stars, the northern lights, deep space, pastel candy, cherry blossom, the aquarium and
 * retro neon. Unknown ids look like the day.
 */
const DAY = {
  zenith: COLORS.zenith, horizon: COLORS.horizon, haze: COLORS.haze, sun: COLORS.sun, sunDir: [-0.45, 0.34, -0.83], sunI: 2.6,
  fill: '#ffd9b0', fillI: 0.9, hemiSky: '#bcd6ff', hemiGround: '#7a5a3a', hemiI: 0.75, deep: COLORS.deep, shallow: COLORS.shallow,
  skyRefl: COLORS.skyRefl, wall: COLORS.wall, stars: 0, aurora: 0, clouds: 1, exposure: 1.06, envI: 0.7,
};
const NIGHT = {
  ...DAY, zenith: '#070d24', horizon: '#1d2d57', haze: '#18233f', sun: '#cfe0ff', sunDir: [0.35, 0.45, -0.82], sunI: 0.9, fill: '#8aa6ff',
  fillI: 0.35, hemiSky: '#3d5491', hemiGround: '#1a1410', hemiI: 0.6, deep: '#0c2a3c', shallow: '#1d4f62', skyRefl: '#2a3f6e', wall: '#1d1514',
  stars: 1, clouds: 0.3, exposure: 1.3, envI: 0.35,
};
export const LOOKS = {
  dag: DAY,
  sonsondergang: {
    ...DAY, zenith: '#4a5f9e', horizon: '#f1b383', haze: '#d8b2a0', sun: '#ffc48a', sunDir: [-0.3, 0.14, -0.95], sunI: 1.9, fill: '#ffb48a',
    fillI: 0.6, hemiSky: '#a9b4dc', hemiGround: '#5e3f33', hemiI: 0.75, deep: '#1f6672', shallow: '#4a9a98', skyRefl: '#c9a59a', wall: '#4e3229',
  },
  nag: NIGHT,
  noorderlig: { ...NIGHT, horizon: '#123b45', haze: '#10283a', stars: 0.8, aurora: 1 },
  ruimte: { ...NIGHT, zenith: '#05030f', horizon: '#2a1446', haze: '#1a0f2e', sun: '#e6d7ff', hemiSky: '#5a3d91', stars: 1.7, clouds: 0, aurora: 0.25 },
  kersieblom: { ...DAY, horizon: '#f6d6dc', haze: '#efd0d6', zenith: '#7fa6d9', skyRefl: '#e6b8c6' },
  lekkergoed: { ...DAY, zenith: '#8fd3f4', horizon: '#ffd1e8', haze: '#f7d6ea', sun: '#fff3c4', skyRefl: '#ffc4e1', deep: '#2f9fa0', shallow: '#7fe0c8' },
  akwarium: { ...DAY, zenith: '#1f6f8f', horizon: '#9fe0d8', haze: '#8fcfc8', skyRefl: '#7fd0d0', deep: '#13707a', shallow: '#3fc0b0' },
  sintgolf: {
    ...DAY, zenith: '#22104a', horizon: '#ff7ab5', haze: '#6a3a7a', sun: '#ffc08a', sunDir: [-0.2, 0.1, -0.97], sunI: 1.6, fill: '#c98aff',
    fillI: 0.55, hemiSky: '#8a7cff', hemiGround: '#2a1030', hemiI: 0.75, deep: '#1b2f63', shallow: '#3f5aa8', skyRefl: '#c77ab8', wall: '#2f1d3a',
    stars: 0.6, clouds: 0.4, envI: 0.5,
  },
};

/** How far across the world bends `d` metres ahead (m): a gentle winding that changes with the course. */
export let bendK = 1;   // (Saturday's run: 0, so a bomb's aim lands where the tower is drawn)
export function setBend(k) {
  bendK = k;
  bendUniforms.uBendK.value = k;
}
export function bendX(d, z) {
  if (!bendK) return 0;
  const a = Math.max(0, d) / 160;
  return Math.sin(z * 0.0042 + 0.6) * 9 * a * a + Math.sin(z * 0.011 + 2.1) * 2.2 * a;
}
/**
 * The same bend for every lit thing in the river: its material's vertex shader moves each vertex across by bendX (from
 * its world position: `ahead` = -z), so what's placed straight in course space winds with the water. One shared clock.
 */
export const bendUniforms = { uDist: { value: 0 }, uBendK: { value: 1 } };
const BEND_GLSL = `uniform float uDist;
uniform float uBendK;
float rvBend(float d, float z) { float a = max(0.0, d) / 160.0; return uBendK * (sin(z * 0.0042 + 0.6) * 9.0 * a * a + sin(z * 0.011 + 2.1) * 2.2 * a); }`;
export function bendMaterial(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDist = bendUniforms.uDist;
    sh.uniforms.uBendK = bendUniforms.uBendK;
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
/**
 * Sandstone in layers, the way the Blyde River Canyon looks (the cliffs' picture and its bumps): wavy strata of warm
 * orange and cream with thin dark seams, dark "desert varnish" streaks running down from the ledges, grey-green lichen,
 * grain and cracks. Tiles both ways. { map, bump }.
 */
function rockTextures() {
  const N = 512;
  const c = canvas(N, N);
  const g = c.getContext('2d');
  const b = canvas(N, N);
  const gb = b.getContext('2d');
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const wave = (x) => Math.sin((x / N) * Math.PI * 4 + 0.7) * 5 + Math.sin((x / N) * Math.PI * 10) * 2;   // (tiles across)
  const bands = [];
  for (let y = 0; y < N;) {
    const h = Math.min(N - y, 26 + rnd() * 70);
    // (each layer's colour pulled toward the stone's middle tone: layers, not stripes)
    const cc = new THREE.Color(COLORS.rock[Math.floor(rnd() * COLORS.rock.length)]).lerp(new THREE.Color('#c27a4b'), 0.45);
    bands.push({ y, h, c: `#${cc.getHexString()}`, k: rnd() });
    y += h;
  }
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, N, N);
  for (let x = 0; x < N; x += 2) {
    const off = wave(x);
    for (const bd of bands) {
      for (const dy of [-N, 0, N]) {
        const y0 = bd.y + off + dy;
        if (y0 > N || y0 + bd.h < 0) continue;
        g.fillStyle = bd.c;
        g.fillRect(x, y0, 2, bd.h + 1);
        // (each layer a little ledge: its top stands out, its foot is undercut)
        const gr = gb.createLinearGradient(0, y0, 0, y0 + bd.h);
        const hi = 150 + Math.round(bd.k * 50);
        gr.addColorStop(0, `rgb(${hi},${hi},${hi})`);
        gr.addColorStop(0.75, 'rgb(118,118,118)');
        gr.addColorStop(1, 'rgb(60,60,60)');
        gb.fillStyle = gr;
        gb.fillRect(x, y0, 2, bd.h + 1);
        // the seam between layers: a thin dark line with light just under it
        g.fillStyle = 'rgba(70,34,18,0.22)';
        g.fillRect(x, y0, 2, 2);
        g.fillStyle = 'rgba(255,232,196,0.09)';
        g.fillRect(x, y0 + 2, 2, 2);
      }
    }
  }
  // soft light and shade across each layer (no flat paint)
  for (let i = 0; i < 160; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 20 + rnd() * 60;
    for (const dx of [-N, 0, N]) {
      for (const dy of [-N, 0, N]) {
        const rg = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        rg.addColorStop(0, rnd() < 0.5 ? 'rgba(255,225,185,0.10)' : 'rgba(80,38,20,0.10)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  // desert varnish: dark streaks running down the face from where water spills over
  for (let i = 0; i < 70; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const w = 2 + rnd() * 9;
    const len = 50 + rnd() * 220;
    const a = 0.12 + rnd() * 0.22;
    for (const dx of [-N, 0, N]) {
      for (const dy of [-N, 0]) {
        const gr = g.createLinearGradient(0, y + dy, 0, y + dy + len);
        gr.addColorStop(0, `rgba(40,24,18,${a})`);
        gr.addColorStop(1, 'rgba(40,24,18,0)');
        g.fillStyle = gr;
        g.fillRect(x + dx, y + dy, w, len);
        g.fillRect(x + dx + w * 0.3, y + dy + len * 0.2, w * 0.4, len * 0.9);
      }
    }
  }
  // lichen: grey-green patches
  for (let i = 0; i < 140; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 3 + rnd() * 12;
    for (const dx of [-N, 0, N]) {
      const rg = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      rg.addColorStop(0, `rgba(${rnd() < 0.6 ? '128,140,108' : '196,190,150'},0.26)`);
      rg.addColorStop(1, 'rgba(128,140,108,0)');
      g.fillStyle = rg;
      g.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
  // grain
  for (let i = 0; i < 16000; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const dark = rnd() < 0.5;
    g.fillStyle = dark ? `rgba(60,30,15,${0.05 + rnd() * 0.1})` : `rgba(255,240,210,${0.04 + rnd() * 0.08})`;
    g.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 1.5);
    gb.fillStyle = dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)';
    gb.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 1.5);
  }
  // cracks: mostly down the face
  for (let i = 0; i < 40; i++) {
    let x = rnd() * N;
    let y = rnd() * N;
    const lw = 0.6 + rnd() * 1.2;
    g.strokeStyle = 'rgba(52,24,12,0.42)';
    gb.strokeStyle = 'rgba(20,20,20,0.7)';
    g.lineWidth = gb.lineWidth = lw;
    g.beginPath();
    gb.beginPath();
    g.moveTo(x, y);
    gb.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (rnd() - 0.5) * 16;
      y += 6 + rnd() * 18;
      g.lineTo(x, y);
      gb.lineTo(x, y);
    }
    g.stroke();
    gb.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(b);
  bump.colorSpace = THREE.NoColorSpace;
  for (const tx of [map, bump]) {
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.anisotropy = 4;
    tx.repeat.set(1.2, 0.75);
  }
  return { map, bump };
}

/** A shrub: a lumpy ball of leaves, flat at its foot, darker inside and below (smooth, not faceted). */
function shrubGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const col = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 5.1 + v.y * 2.3) * 0.5 + Math.sin(v.z * 6.7 - v.x * 1.9) * 0.35 + Math.sin(v.y * 9.3 + v.z * 3.1) * 0.2;
    v.multiplyScalar(1 + n * 0.16);
    v.y = Math.max(v.y, -0.38);
    p.setXYZ(i, v.x, v.y, v.z);
    const k = 0.55 + 0.45 * Math.min(1, Math.max(0, (v.y + 0.4) / 1.3)) + n * 0.08;
    col.push(k * 0.92, k, k * 0.86);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A rondavel: the round sandstone peaks of the Blyde canyon (a drum narrowing upward under a grassy, hut-roof cone). */
function rondavelGeometry(r, h, seed) {
  const g = new THREE.CylinderGeometry(r * 0.78, r * 1.25, h, 18, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 3 + seed) * 0.05 + Math.sin(a * 7 + seed * 2) * 0.03 + Math.sin(y * 0.15 + a * 2) * 0.02;
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------ the sky
const SKY_VERT = `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunCol; uniform sampler2D uNoise; uniform float uT;
uniform float uStars; uniform float uAurora; uniform float uClouds; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.62, h), 0.7));
  float s = max(dot(d, uSun), 0.0);
  // high soft clouds drifting, lit warm on the sun's side (none straight up, thinning to the horizon)
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.16) * 0.16 + vec2(uT * 0.0015, uT * 0.0004);
    float n = texture2D(uNoise, cp).r * 0.62 + texture2D(uNoise, cp * 2.7 + 0.37).b * 0.38;
    float cl = smoothstep(0.5, 0.74, n) * smoothstep(0.02, 0.2, d.y) * (1.0 - smoothstep(0.5, 0.85, d.y));
    vec3 lit = mix(vec3(1.0, 0.95, 0.88), uSunCol, 0.35) * (0.95 + 0.5 * pow(s, 5.0));
    vec3 shade = mix(uHorizon, uZenith, 0.35) * 0.92;
    col = mix(col, mix(shade, lit, smoothstep(0.52, 0.82, n)), cl * 0.8 * uClouds);
  }
  // stars (the night skies): a fixed field, twinkling a little, fading near the horizon
  if (uStars > 0.0 && d.y > 0.0) {
    vec3 q = floor(d * 420.0);
    float hs = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float st = step(0.9968, hs) * smoothstep(0.03, 0.3, d.y) * (0.65 + 0.35 * sin(uT * 2.3 + hs * 60.0));
    col += vec3(0.9, 0.94, 1.0) * st * uStars;
  }
  // the northern lights: green curtains drifting high up, a purple edge on top
  if (uAurora > 0.0 && d.y > 0.04) {
    vec2 ap = d.xz / (d.y + 0.3);
    float band = texture2D(uNoise, vec2(ap.x * 0.22 + uT * 0.004, ap.y * 0.05 + 0.2)).r;
    float curtain = smoothstep(0.52, 0.74, band) * smoothstep(0.06, 0.28, d.y) * (1.0 - smoothstep(0.55, 0.85, d.y));
    float rays = 0.45 + texture2D(uNoise, vec2(ap.x * 1.7 + uT * 0.012, 0.37)).b;
    col += (vec3(0.2, 1.0, 0.55) * (1.0 - smoothstep(0.3, 0.6, d.y)) + vec3(0.65, 0.25, 0.95) * smoothstep(0.3, 0.6, d.y)) * curtain * rays * uAurora * 0.7;
  }
  col += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.32 + pow(s, 4.0) * 0.12);
  col = mix(col, uHorizon * 0.92, smoothstep(0.05, -0.2, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------------------------------------ waterfalls
const FALL_VERT = `${BEND_GLSL}
varying vec2 vUv; varying float vDepth;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.x += rvBend(-w.z, uDist - w.z);
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FALL_FRAG = `uniform sampler2D uNoise; uniform float uT; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
varying vec2 vUv; varying float vDepth;
void main() {
  float x = vUv.x;
  float edge = smoothstep(0.0, 0.3, x) * smoothstep(1.0, 0.7, x);
  // streaks of falling water: the pattern runs down, faster lower down
  float n = texture2D(uNoise, vec2(x * 0.9, vUv.y * 0.5 + uT * 0.55)).r;
  float n2 = texture2D(uNoise, vec2(x * 2.3 + 0.3, vUv.y * 1.4 + uT * 1.25)).b;
  float a = edge * (0.55 + 0.45 * smoothstep(0.35, 0.7, n * 0.55 + n2 * 0.45));
  a *= smoothstep(1.0, 0.95, vUv.y);
  vec3 col = mix(vec3(0.72, 0.82, 0.84), vec3(1.0), smoothstep(0.42, 0.8, n2));
  // white water where it lands
  float foot = smoothstep(0.14, 0.0, vUv.y);
  col = mix(col, vec3(1.0), foot);
  a = max(a, foot * edge * 0.9);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(col, a * 0.9);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------------------------------------ the water
const WATER_VERT = `uniform float uDist; uniform float uBendA; uniform float uBendB; uniform float uBendK;
varying vec3 vWorld; varying vec2 vRiver; varying float vAhead;
float bendX(float d, float z) { float a = max(0.0, d) / 160.0; return uBendK * (sin(z * 0.0042 + 0.6) * 9.0 * a * a + sin(z * 0.011 + 2.1) * 2.2 * a); }
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
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSkyRefl; uniform vec3 uFoam; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
uniform float uHalf; uniform float uLakeFrom; uniform float uLakeTo; uniform float uDetail; uniform vec2 uRapids; uniform float uPoolTo;
uniform vec3 uWall; uniform vec2 uRider;
varying vec3 vWorld; varying vec2 vRiver; varying float vAhead;
float h(vec2 p) {
  // the surface's height: long swells across, ripples and chop running with the current (stretched along it)
  float a = texture2D(uNoise, vec2(p.x * 0.07, p.y * 0.022 - uT * 0.05)).r;
  float b = texture2D(uNoise, vec2(p.x * 0.23, p.y * 0.075 - uT * 0.16)).b;
  float c = texture2D(uNoise, vec2(p.x * 0.61, p.y * 0.21 - uT * 0.42)).r;
  return a * 0.55 + b * 0.32 + c * 0.13 * uDetail;
}
void main() {
  vec2 p = vRiver;
  float e = 0.35;
  float h0 = h(p);
  vec3 n = normalize(vec3((h0 - h(p + vec2(e, 0.0))) * 2.4, 1.0, (h0 - h(p + vec2(0.0, e))) * 2.4));
  vec3 v = normalize(cameraPosition - vWorld);
  float lake = smoothstep(uLakeFrom, uLakeFrom + 40.0, p.y) * (1.0 - smoothstep(uLakeTo, uLakeTo + 30.0, p.y));
  lake = max(lake, 1.0 - smoothstep(uPoolTo, uPoolTo + 40.0, p.y));
  float half_ = mix(uHalf, 46.0, lake);
  float edge = clamp(abs(p.x) / half_, 0.0, 1.2);
  // the water's own colour: deep green-blue in the middle, lighter and clearer towards the banks; darker in the troughs
  vec3 base = mix(uDeep, uShallow, smoothstep(0.45, 1.0, edge) * 0.85);
  base *= 0.9 + h0 * 0.36;
  // the sky in it: more at a glancing look (Fresnel), never more than half
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uSkyRefl, smoothstep(0.0, 0.35, r.y));
  vec3 col = mix(base, sky, clamp(fres, 0.0, 0.5));
  // light in the water itself (it's never black, even looking straight down into it)
  col += uShallow * 0.18 * (1.0 - fres);
  // the sandstone walls mirrored near the banks: warmer and darker there (not in the open lake)
  float wall = smoothstep(0.42, 0.95, edge) * (1.0 - lake);
  col = mix(col, uWall, wall * (0.22 + 0.4 * fres));
  // the low sun ahead: a path of glitter down the river
  float s = max(dot(r, uSun), 0.0);
  col += uSunCol * (pow(s, 260.0) * 3.2 + pow(s, 40.0) * 0.22);
  // white water: foam along the banks and streaks where the current breaks (thin, along the flow)
  float streak = texture2D(uNoise, vec2(p.x * 0.9, p.y * 0.02 - uT * 0.11)).b;
  float rap = smoothstep(uRapids.x - 12.0, uRapids.x + 8.0, p.y) * (1.0 - smoothstep(uRapids.y - 8.0, uRapids.y + 12.0, p.y));
  float foamLine = smoothstep(0.66 - rap * 0.2, 0.74, streak) * (1.0 - smoothstep(0.74, 0.86 + rap * 0.1, streak)) * (0.55 + rap * 0.4) * (1.0 - lake);
  foamLine += rap * smoothstep(0.55, 0.85, h0) * 0.6;
  float bankFoam = smoothstep(0.94, 1.0, edge) * (1.0 - smoothstep(1.0, 1.08, edge)) * smoothstep(0.35, 0.7, h0) * 0.7;
  col = mix(col, uFoam, clamp(foamLine * smoothstep(0.3, 0.6, h0) + bankFoam, 0.0, 0.9));
  // his wake: two lines of foam opening out behind the board, and the churned water right behind it
  float back = uRider.y - p.y;
  if (back > 0.2 && back < 9.0) {
    float spread = 0.4 + back * 0.2;
    float dx = abs(abs(p.x - uRider.x) - spread);
    float fade = 1.0 - back / 9.0;
    float wk = (1.0 - smoothstep(0.0, 0.14 + back * 0.02, dx)) * fade * fade;
    wk *= smoothstep(0.3, 0.75, texture2D(uNoise, vec2(p.x * 0.8, p.y * 0.6 - uT * 0.6)).r);
    float tr = (1.0 - smoothstep(0.1, 0.5, abs(p.x - uRider.x))) * (1.0 - smoothstep(0.0, 5.0, back));
    col = mix(col, uFoam, clamp(wk * 0.5 + tr * 0.25, 0.0, 0.6));
  }
  float f = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
  col = mix(col, uFog, f);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * The world: { group, water, update(dist, t, camera), setLake(fromZ, toZ), dispose() }. `quality` from the stage.
 */
export function buildRiverWorld(stage, lookId = 'dag') {
  const { scene, renderer, quality } = stage;
  const L = LOOKS[lookId] || LOOKS.dag;
  const sunDir = new THREE.Vector3(...L.sunDir).normalize();
  const exposure = renderer.toneMappingExposure;
  renderer.toneMappingExposure = L.exposure;
  const group = new THREE.Group();
  scene.add(group);
  const fog = lin(L.haze);
  scene.fog = new THREE.Fog(fog, BANK.fogNear, BANK.fogFar);
  scene.background = null;

  const noise = noiseTexture(quality.name === 'low' ? 96 : 128);
  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: lin(L.zenith) }, uHorizon: { value: lin(L.horizon) }, uSun: { value: sunDir.clone() }, uSunCol: { value: lin(L.sun) }, uNoise: { value: noise }, uT: { value: 0 },
      uStars: { value: L.stars }, uAurora: { value: L.aurora }, uClouds: { value: L.clouds },
    },
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
  scene.environmentIntensity = L.envI;
  pmrem.dispose();

  // light: the low sun ahead-left, the sky's blue from above, warm ground bounce
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  sun.position.copy(sunDir).multiplyScalar(120);
  group.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(L.fill, L.fillI);   // (from behind the camera: what comes at you is lit)
  fill.position.set(6, 10, 30);
  group.add(fill);
  group.add(new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiI));

  // the water: a long strip that rides with the camera; its ripples run in course space
  const water = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 }, uDist: { value: 0 }, uNoise: { value: noise }, uSun: { value: sunDir.clone() }, uSunCol: { value: lin(L.sun) },
      uDeep: { value: lin(L.deep) }, uShallow: { value: lin(L.shallow) }, uZenith: { value: lin(L.zenith) },
      uHorizon: { value: lin(L.horizon) }, uSkyRefl: { value: lin(L.skyRefl) }, uFoam: { value: lin(COLORS.foam) }, uFog: { value: fog },
      uFogNear: { value: BANK.fogNear }, uFogFar: { value: BANK.fogFar }, uHalf: { value: BANK.half },
      uLakeFrom: { value: 1e6 }, uLakeTo: { value: 1e6 }, uDetail: { value: quality.name === 'low' ? 0 : 1 },
      uBendA: { value: 0 }, uBendB: { value: 0 }, uBendK: bendUniforms.uBendK, uRapids: { value: new THREE.Vector2(-1e6, -1e6) }, uPoolTo: { value: -1e6 },
      uWall: { value: lin(L.wall) }, uRider: { value: new THREE.Vector2(0, -1e6) },
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
  const rockTex = rockTextures();
  const rockMat = bendMaterial(new THREE.MeshStandardMaterial({ map: rockTex.map, bumpMap: rockTex.bump, bumpScale: 2.2, roughness: 0.9, metalness: 0, vertexColors: true, side: THREE.DoubleSide }));
  const SEG_L = 48;
  const N_SEG = 13;
  function cliffGeometry(side, seed) {
    const g = new THREE.PlaneGeometry(SEG_L, 34, 22, 16);
    const pos = g.attributes.position;
    const col = [];
    let s = seed * 7919 + 13;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const bumps = Array.from({ length: 6 }, () => [rnd() * SEG_L - SEG_L / 2, rnd() * 30, 2 + rnd() * 3]);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);   // along the river
      const v = pos.getY(i) + 17;   // height 0..34
      // the face leans back as it climbs, in steps: layers that stand out and undercut feet (the sandstone's ledges)
      const step = (v % 7.5) / 7.5;
      const ledge = (step < 0.18 ? -0.7 * (1 - step / 0.18) : 0) + Math.sin(Math.floor(v / 7.5) * 2.7 + seed) * 0.35;
      let out = Math.pow(v / 34, 1.6) * 7 + Math.sin(u * 0.21 + seed) * 0.9 + Math.sin(v * 0.6 + u * 0.05) * 0.45 + ledge + Math.sin(u * 0.83 + v * 0.31 + seed) * 0.22;
      for (const [bu, bv, br] of bumps) out -= Math.exp(-((u - bu) ** 2 + (v - bv) ** 2) / (br * br * 2)) * 1.6;
      const shelf = v < 1.2 ? (1.2 - v) * 1.4 : 0;   // (a ledge at the water)
      pos.setXYZ(i, side * (out + shelf), v - 1.1, u);
      // light varies along the wall; the foot is wet and dark, the rim sun-bleached
      const k = (0.8 + rnd() * 0.16) * (v < 2.2 ? 0.55 + v * 0.16 : 1) * (v > 29 ? 1.06 : 1);
      col.push(k, k * 0.96, k * 0.92);
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
  const fallMat = new THREE.ShaderMaterial({
    uniforms: { uDist: bendUniforms.uDist, uBendK: bendUniforms.uBendK, uNoise: { value: noise }, uT: { value: 0 }, uFog: { value: fog }, uFogNear: { value: BANK.fogNear }, uFogFar: { value: BANK.fogFar } },
    vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  /** A strip of falling water on the wall `geo` (side ±1), 2.8 m wide, from the rim to the river, a little off the rock. */
  function fallGeometry(geo, side) {
    const pos = geo.attributes.position;
    const cols = 23;   // (PlaneGeometry(SEG_L, 34, 22, 16): 23 vertices a row)
    const k = 11;
    const rows = [];
    for (let r = 0; r < pos.count / cols; r++) rows.push(new THREE.Vector3().fromBufferAttribute(pos, r * cols + k));
    rows.sort((a, b) => a.y - b.y);
    const vtx = [];
    const uv = [];
    const idx = [];
    rows.forEach((p, r) => {
      const x = p.x - side * 0.45;
      // (wider as it falls: the water spreads out)
      const w = 1.8 + (1 - (r / (rows.length - 1))) * 1.6;
      vtx.push(x, p.y, p.z - w, x, p.y, p.z + w);
      const v = r / (rows.length - 1);
      uv.push(0, v, 1, v);
      if (r) idx.push((r - 1) * 2, r * 2, (r - 1) * 2 + 1, (r - 1) * 2 + 1, r * 2, r * 2 + 1);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vtx, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  const fallGeos = { '-1': cliffGeos['-1'].map((g) => fallGeometry(g, -1)), 1: cliffGeos[1].map((g) => fallGeometry(g, 1)) };
  const bushMat = bendMaterial(new THREE.MeshStandardMaterial({ color: COLORS.bushL, roughness: 0.92, vertexColors: true }));
  const bushGeo = shrubGeometry();
  const boulderGeo = new THREE.DodecahedronGeometry(1, 1);
  const boulderMat = bendMaterial(new THREE.MeshStandardMaterial({ map: rockTex.map, bumpMap: rockTex.bump, bumpScale: 1.4, color: '#b98c6a', roughness: 0.85 }));
  const segs = [];
  const BUSH_PER = quality.name === 'low' ? 6 : 12;
  const ROCK_PER = 5;
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, N_SEG * 2 * BUSH_PER);
  const boulders = new THREE.InstancedMesh(boulderGeo, boulderMat, N_SEG * 2 * ROCK_PER);
  bushes.frustumCulled = boulders.frustumCulled = false;
  group.add(bushes, boulders);
  for (let i = 0; i < N_SEG; i++) {
    for (const side of [-1, 1]) {
      const gi = (i + (side > 0 ? 1 : 0)) % 3;
      const m = new THREE.Mesh(cliffGeos[side][gi], rockMat);
      m.frustumCulled = false;
      group.add(m);
      // a waterfall down every few pieces, the sides taking turns
      if (i % 4 === (side < 0 ? 1 : 3)) {
        const f = new THREE.Mesh(fallGeos[side][gi], fallMat);
        f.frustumCulled = false;
        f.renderOrder = 2;
        m.add(f);
      }
      const r = (k) => { const x = Math.sin((i * 2 + (side > 0 ? 1 : 0)) * 91.7 + k * 13.1) * 43758.5; return x - Math.floor(x); };
      segs.push({ m, side, i, r, bushes: Array.from({ length: BUSH_PER }, (_, k) => [r(k) * SEG_L - SEG_L / 2, 0.9 + r(k + 40) * 1.7, r(k + 80)]), rocks: Array.from({ length: ROCK_PER }, (_, k) => [r(k + 120) * SEG_L - SEG_L / 2, 0.5 + r(k + 160) * 0.9]) });
    }
  }
  // far off in the haze: rondavels (round sandstone peaks with grassy tops) and a long ridge
  const mesaMat = new THREE.MeshStandardMaterial({ color: COLORS.mesa, roughness: 1, map: rockTex.map });
  const mesaTopMat = new THREE.MeshStandardMaterial({ color: COLORS.mesaTop, roughness: 1, flatShading: true });
  const hills = new THREE.Group();
  // (three together, like the real ones, and a few more along the far rim; warm enough to read through the haze)
  for (const [x, z, r, h, s] of [[-120, -330, 22, 44, 1], [-78, -350, 18, 52, 2], [-38, -338, 20, 40, 3], [96, -300, 24, 36, 4], [190, -360, 28, 46, 5], [-230, -360, 30, 42, 6], [300, -320, 22, 30, 7]]) {
    const drum = new THREE.Mesh(rondavelGeometry(r, h, s), mesaMat);
    drum.position.set(x, h / 2 + 6, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.86, r * 0.62, 12, 1), mesaTopMat);
    cap.position.set(x, h + 6 + r * 0.3, z);
    cap.rotation.y = s;
    hills.add(drum, cap);
  }
  // the far rim of the plateau they stand on
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(1400, 30, 120), new THREE.MeshStandardMaterial({ color: '#9a6a52', roughness: 1, map: rockTex.map }));
  ridge.position.set(0, -6, -380);
  hills.add(ridge);
  group.add(hills);
  // birds: a few dark shapes gliding and flapping high over the canyon ahead
  const birdMat = new THREE.MeshBasicMaterial({ color: lin(COLORS.bird), side: THREE.DoubleSide, fog: true });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.32, 0, 0, -0.3, 1.5, 0.05, 0.05, 1.5, 0.05, 0.05, 0, 0, -0.3, 0.9, 0.0, -0.32], 3));
  wingGeo.computeVertexNormals();
  const birds = [];
  for (let k = 0; k < 7; k++) {
    const b = new THREE.Group();
    const l = new THREE.Mesh(wingGeo, birdMat);
    const r = new THREE.Mesh(wingGeo, birdMat);
    r.scale.x = -1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), birdMat);
    body.scale.set(0.8, 0.7, 2.2);
    b.add(l, r, body);
    b.scale.setScalar(1.6 + (k % 3) * 0.4);
    group.add(b);
    birds.push({ b, l, r, cx: (k % 2 ? 1 : -1) * (8 + k * 3), cy: 34 + (k * 7) % 16, cz: -110 - k * 22, rad: 14 + (k * 5) % 18, w: (k % 2 ? 1 : -1) * (0.16 + (k % 3) * 0.04), ph: k * 1.7 });
  }

  const tmp = new THREE.Object3D();
  let lake = { from: 1e6, to: 1e6 };
  let poolTo = -1e6;
  /** The bank's distance from the middle at course z (it opens out into the lake, and the pool at the river's head). */
  const halfAt = (z) => {
    let k = Math.min(1, Math.max(0, (z - lake.from) / 40)) * (1 - Math.min(1, Math.max(0, (z - lake.to) / 30)));
    k = Math.max(k, 1 - Math.min(1, Math.max(0, (z - poolTo) / 40)));
    return BANK.half + (BANK.lake - BANK.half) * k * k * (3 - 2 * k);
  };

  function update(dist, t, riderX = null) {
    water.uniforms.uT.value = t;
    water.uniforms.uDist.value = dist;
    skyMat.uniforms.uT.value = t;
    fallMat.uniforms.uT.value = t;
    water.uniforms.uRider.value.set(riderX ?? 0, riderX === null ? -1e6 : dist);
    for (const bd of birds) {
      const a = bd.ph + t * bd.w;
      bd.b.position.set(bd.cx + Math.cos(a) * bd.rad, bd.cy + Math.sin(t * 0.4 + bd.ph) * 2, bd.cz + Math.sin(a) * bd.rad);
      bd.b.rotation.set(0, -a + (bd.w > 0 ? 0 : Math.PI), Math.sin(t * 0.7 + bd.ph) * 0.25);
      // (glide, then a few beats)
      const beat = Math.sin(t * 1.3 + bd.ph) > 0.35 ? Math.sin(t * 11 + bd.ph) * 0.65 : 0.12;
      bd.l.rotation.z = beat;
      bd.r.rotation.z = -beat;
    }
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
    /** Open water at the river's head, up to course z `to` (where your tower stands). */
    setPool(to) {
      poolTo = to;
      water.uniforms.uPoolTo.value = to;
    },
    /** White water from course z `from` to `to`. */
    setRapids(from, to) {
      water.uniforms.uRapids.value.set(from, to);
    },
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
      renderer.toneMappingExposure = exposure;
    },
  };
}
