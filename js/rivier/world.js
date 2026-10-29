// (1.20) Die Rivier's world: a South African river canyon in the late afternoon (sandstone cliffs in layers, bush on top,
// a deep green river with white water at its edges), drawn for a phone. The owner wanted the town grown-up, not
// childish, and its colours and light right (24 Oct 2026): real light, a warm low sun, haze in the distance, no cartoon
// outlines. The river runs straight for the game (three lanes) but the world bends ahead of you, so it winds.
//
// Course space: z = metres downstream from the start, x = metres across (0 = the middle lane). The rider stays at the
// world's origin looking down -z; a thing `d` metres ahead stands at world z = -d, moved across by bendX(d).
import * as THREE from '../../lib/three.module.min.js';
import { mergeGeometries } from '../../lib/three-addons/utils/BufferGeometryUtils.js';

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
// (1.22: the day's sun a little higher, 26° instead of 20°: the shadows on the water were long dark streaks, about three
// times the height of what made them, the rider's running away behind him)
const DAY = {
  zenith: COLORS.zenith, horizon: COLORS.horizon, haze: COLORS.haze, sun: COLORS.sun, sunDir: [-0.45, 0.46, -0.83], sunI: 2.6,
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
// (28 Oct 2026, the owner: "it needs to have more twists and turns") a turn every ~370 m (was ~750), sharper (up to ~30 m
// across 160 m ahead, was 9), on a slow sweep so no two stretches turn alike, and a short S-wiggle; still straight under
// the rider (a = 0 there), so the lanes stay where they are. The GLSL twin below must stay the same sum.
export function bendX(d, z) {
  if (!bendK) return 0;
  const a = Math.max(0, d) / 160;
  return (Math.sin(z * 0.0085 + 0.6) * 20 + Math.sin(z * 0.0031 + 1.7) * 10) * a * a + Math.sin(z * 0.023 + 2.1) * 3 * a;
}
/**
 * The same bend for every lit thing in the river: its material's vertex shader moves each vertex across by bendX (from
 * its world position: `ahead` = -z), so what's placed straight in course space winds with the water. One shared clock.
 */
export const bendUniforms = { uDist: { value: 0 }, uBendK: { value: 1 } };
const BEND_GLSL = `uniform float uDist;
uniform float uBendK;
float rvBend(float d, float z) { float a = max(0.0, d) / 160.0; return uBendK * ((sin(z * 0.0085 + 0.6) * 20.0 + sin(z * 0.0031 + 1.7) * 10.0) * a * a + sin(z * 0.023 + 2.1) * 3.0 * a); }`;
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

/**
 * The canyon walls' finish on top of their picture (on a bent material): ledges that face the sky gather red dust and a
 * little grass, the stone's tone drifts in big soft patches (no two walls alike), and the foot is wet, dark and glossy
 * up to a wavy tide line. Works in the wall's own coordinates (x out, y up from the water, z along the river).
 */
const rkClock = { value: 0 };   // (the walls' and stones' own clock: the light dancing off the water)
const rkSun = { value: 1 };     // (how strong that light is: the look's sun)
function rockDetail(m, noise, bank, { tri = false, wall = false, wet = 1.15, triS = [0.11, 0.08] } = {}) {
  const bend = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    bend(sh, r);
    sh.uniforms.uRkNoise = { value: noise };
    sh.uniforms.uRkWet = { value: wet };
    sh.uniforms.uRkTriS = { value: new THREE.Vector2(triS[0], triS[1]) };
    sh.uniforms.uRkT = rkClock;
    sh.uniforms.uRkSun = rkSun;
    Object.assign(sh.uniforms, bank);
    // (the walls follow the bank smoothly, vertex by vertex: out to the pool and the lake and low there, no steps
    // between the pieces; the same curve as halfAt() below)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vRkL; varying vec3 vRkN;
uniform float uPoolTo; uniform float uLakeFrom; uniform float uLakeTo; uniform float uLakeW;
float rkOpen(float z) {
  float k = clamp((z - uLakeFrom) / 40.0, 0.0, 1.0) * (1.0 - clamp((z - uLakeTo) / 30.0, 0.0, 1.0));
  k = max(k, 1.0 - clamp((z - uPoolTo) / 40.0, 0.0, 1.0));
  return k * k * (3.0 - 2.0 * k);
}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec4 rkW0 = modelMatrix * vec4(transformed, 1.0);
    float rkK = rkOpen(uDist - rkW0.z);
    transformed.x += sign(modelMatrix[3][0]) * uLakeW * rkK;
    transformed.y *= 1.0 - 0.78 * rkK;
  }
  vRkL = transformed;
  vRkN = objectNormal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRkL;\nvarying vec3 vRkN;\nuniform sampler2D uRkNoise;\nuniform float uRkWet;\nuniform float uRkT;\nuniform float uRkSun;\nuniform vec2 uRkTriS;')
      // (a stone in the river: the picture wrapped round it from three sides, no seams)
      // (1.22, the walls: the layers by height, the picture along the wall by how far along and how far out, one picture
      // for every face: wherever the face turned along the river, or lay flat on a ledge, the other ways of laying it on
      // dragged it into upright streaks and comb teeth)
      .replace('#include <map_fragment>', wall ? `#ifdef USE_MAP
  diffuseColor *= texture2D(map, vec2(vRkL.z + vRkL.x, vRkL.y) * uRkTriS);
#endif` : tri ? `#ifdef USE_MAP
  vec3 rkB = pow(abs(normalize(vRkN)), vec3(4.0));
  rkB /= (rkB.x + rkB.y + rkB.z);
  // (1.22: stones four times larger than before: a 3 m stone showed four or five layers, which the three sides blended
  // into rings like wood grain; now one or two layers of sandstone. The walls their own size: see rockMat)
  vec2 rkS = uRkTriS;
  vec4 sampledDiffuseColor = texture2D(map, vRkL.zy * rkS) * rkB.x + texture2D(map, vRkL.xz * rkS * 1.3) * rkB.y + texture2D(map, vRkL.xy * rkS) * rkB.z;
  diffuseColor *= sampledDiffuseColor;
#endif` : '#include <map_fragment>')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec3 rkUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float rkFlat = smoothstep(0.5, 0.85, dot(normal, rkUp)) * step(1.6, vRkL.y);
    float rkN = texture2D(uRkNoise, vRkL.zy * 0.011).r;
    float rkN2 = texture2D(uRkNoise, vRkL.zy * 0.06 + 0.3).g;
    diffuseColor.rgb *= 0.88 + rkN * 0.26;
    vec3 rkDust = mix(vec3(0.5, 0.27, 0.13), vec3(0.2, 0.25, 0.07), smoothstep(0.5, 0.68, rkN2));
    float rkFlatK = rkFlat * 0.7;
    #ifdef USE_COLOR
      // (the plateau: savanna grass, dry gold and green in patches, all over it)
      float rkPlain = smoothstep(0.05, 0.2, vColor.g - vColor.r);
      rkDust = mix(rkDust, mix(vec3(0.36, 0.33, 0.12), vec3(0.16, 0.24, 0.07), smoothstep(0.42, 0.62, rkN)), rkPlain);
      rkFlatK = mix(rkFlatK, 0.92, rkPlain);
    #endif
    diffuseColor.rgb = mix(diffuseColor.rgb, rkDust * (0.8 + rkN2 * 0.4), rkFlatK);
    float rkLine = uRkWet + (rkN2 - 0.5) * min(1.4, uRkWet * 1.2 + 0.2);
    float rkWet = 1.0 - smoothstep(rkLine - 0.35, rkLine + 0.2, vRkL.y);
    diffuseColor.rgb *= 1.0 - rkWet * 0.32;
    roughnessFactor = mix(roughnessFactor, 0.3, rkWet);
  }`)
      // the sunlight thrown up off the water: bright wavy lines dancing on the rock just above the river
      .replace('#include <opaque_fragment>', `{
    float rkH = vRkL.y - uRkWet;
    float rkBand = smoothstep(-0.3, 0.4, rkH) * (1.0 - smoothstep(1.0, 4.5 + uRkWet * 0.5, rkH));
    if (rkBand > 0.001) {
      vec2 cp = vec2(vRkL.z + vRkL.x, vRkL.y * 1.6) * 0.13;
      float c1 = texture2D(uRkNoise, cp + vec2(uRkT * 0.045, uRkT * 0.02)).r;
      float c2 = texture2D(uRkNoise, cp * 1.37 + vec2(-uRkT * 0.035, uRkT * 0.03) + 0.41).g;
      float ca = pow(max(0.0, 1.0 - abs(c1 - c2) * 2.2), 7.0);
      // (1.22: softer: at 0.2 the dancing light read as white scribbles along the foot of every wall)
      outgoingLight += vec3(1.0, 0.92, 0.74) * ca * rkBand * 0.085 * uRkSun * (1.0 - 0.6 * step(uRkWet, 0.5));
    }
  }
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => (wall ? 'rivier-bend-rock-wall' : tri ? 'rivier-bend-rock-tri' : 'rivier-bend-rock');   // (the size is a uniform)
  return m;
}

/**
 * The rim light on the characters and creatures: a glow along their edges in the low sun's colour (they're mostly seen
 * against the light), so they stand out from the water and the rock. One colour for all, set by each world's look.
 */
export const rimUniform = { value: new THREE.Color(0, 0, 0) };
export function rimMaterial(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uRim = rimUniform;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <opaque_fragment>', `{
    float rimK = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    outgoingLight += uRim * (pow(rimK, 4.0) * 0.7 + pow(rimK, 10.0) * 1.1);
  }
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'rivier-bend-rim';
  return m;
}

/**
 * Wet to just over the water: whatever floats (a block in the river) is darker and glossy where the river washes it,
 * fading out above. On a bent material; by the thing's height in the world.
 */
export function wetMaterial(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWetY;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWetY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWetY;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat wetK = 1.0 - smoothstep(0.08, 0.55, vWetY);\ndiffuseColor.rgb *= 1.0 - 0.3 * wetK;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, wetK);');
  };
  m.customProgramCacheKey = () => 'rivier-bend-wet';
  return m;
}

// ------------------------------------------------------------------------------------------------ textures
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
/** A soft lumpy puff (white, alpha only): spray mist, the mist at a waterfall's foot, splashes. */
export function puffTexture(seed = 5) {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 30;
    const x = 64 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d;
    const r = 18 + rnd() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.22 + rnd() * 0.2})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
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
 * Sandstone in layers, the way the Blyde River Canyon looks (the cliffs' picture and its bumps): flat strata of warm
 * orange and cream, each layer broken into blocks by upright joints (every block its own tone), ledges with undercut
 * feet, mottled at three sizes, fresh pale spalls where a slab fell off, dark "desert varnish" running down from the
 * ledges, a little lichen, grain. Built pixel by pixel; tiles both ways. { map, bump }.
 */
function rockTextures() {
  const N = 512;
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const smooth = (x) => x * x * (3 - 2 * x);
  // tileable value noise: `cells` lattice points a side
  const lattice = (cells) => Float32Array.from({ length: cells * cells }, rnd);
  const vn = (lat, cells, x, y) => {
    const fx = (x / N) * cells;
    const fy = (y / N) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const at = (i, j) => lat[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  const L6 = lattice(6);
  const L12 = lattice(12);
  const L40 = lattice(40);
  const L128 = lattice(128);
  // the layers: thick and thin, their tones pulled toward the stone's middle tone (layers, not stripes); each broken
  // into blocks by joints
  const mid = new THREE.Color('#c27a4b');
  const bands = [];
  for (let y = 0; y < N;) {
    const thin = rnd() < 0.3;
    const h = Math.min(N - y, thin ? 6 + rnd() * 10 : 24 + rnd() * 54);
    const cc = new THREE.Color(COLORS.rock[Math.floor(rnd() * COLORS.rock.length)]).lerp(mid, thin ? 0.2 : 0.4);
    const joints = [];
    for (let k = 0, n = thin ? 0 : 1 + Math.floor(rnd() * 4); k < n; k++) joints.push(rnd() * N);
    joints.sort((a, b) => a - b);
    const tones = Array.from({ length: joints.length + 1 }, () => 0.92 + rnd() * 0.16);
    if (joints.length) tones[joints.length] = tones[0];   // (the block over the seam is one block)
    const hex = parseInt(cc.getHexString(), 16);   // (the picture's own sRGB values; the Color itself is linear)
    bands.push({ y, h, c: [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255], k: rnd(), joints, tones });
    y += h;
  }
  const rowBand = new Int16Array(N);
  bands.forEach((b, i) => { for (let y = Math.floor(b.y); y < Math.min(N, b.y + b.h + 1); y++) rowBand[y] = i; });
  const warp = Float32Array.from({ length: N }, (_, x) => (vn(L6, 6, x, 200) - 0.5) * 16 + (vn(L40, 40, x, 77) - 0.5) * 3);
  const c = canvas(N, N);
  const g = c.getContext('2d');
  const b = canvas(N, N);
  const gb = b.getContext('2d');
  const img = g.createImageData(N, N);
  const bimg = gb.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const yy = (((y + warp[x]) % N) + N) % N;
      const bi = rowBand[Math.floor(yy)];
      const bd = bands[bi];
      const tb = Math.min(1, Math.max(0, (yy - bd.y) / bd.h));
      let blk = 0;
      while (blk < bd.joints.length && x > bd.joints[blk]) blk++;
      const m1 = vn(L12, 12, x, y);
      const m2 = vn(L40, 40, x, y);
      const m3 = vn(L128, 128, x, y);
      const mott = 0.8 + m1 * 0.22 + m2 * 0.12 + (m3 - 0.5) * 0.14;
      // (the ledge: a lit lip on top, the foot of the layer undercut into shade)
      const shade = (tb > 0.78 ? 1 - ((tb - 0.78) / 0.22) * 0.3 : 1) * (tb < 0.07 ? 1.08 : 1);
      const k = mott * shade * bd.tones[blk];
      const o = (y * N + x) * 4;
      img.data[o] = Math.min(255, bd.c[0] * k);
      img.data[o + 1] = Math.min(255, bd.c[1] * k);
      img.data[o + 2] = Math.min(255, bd.c[2] * k);
      img.data[o + 3] = 255;
      const lip = tb < 0.07 ? 50 * (1 - tb / 0.07) : 0;
      const foot = tb > 0.78 ? -((tb - 0.78) / 0.22) * 80 : 0;
      const hgt = 128 + 30 * bd.k + lip + foot + (m2 - 0.5) * 50 + (m3 - 0.5) * 46;
      bimg.data[o] = bimg.data[o + 1] = bimg.data[o + 2] = Math.max(0, Math.min(255, hgt));
      bimg.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  gb.putImageData(bimg, 0, 0);
  const wrapX = (f) => { for (const dx of [-N, 0, N]) f(dx); };
  // the joints: a dark crack down each layer between its blocks, lit on one lip
  for (const bd of bands) {
    for (const jx of bd.joints) {
      wrapX((dx) => {
        let x = jx + dx;
        let y = bd.y;
        g.strokeStyle = 'rgba(48,22,10,0.32)';   // (1.22: softer: down the canyon, side-on, they squeezed into dark lines)
        gb.strokeStyle = 'rgba(10,10,10,0.9)';
        g.lineWidth = gb.lineWidth = 1.2 + rnd() * 1.2;
        g.beginPath();
        gb.beginPath();
        g.moveTo(x, y);
        gb.moveTo(x, y);
        const steps = 3;
        for (let k = 1; k <= steps; k++) {
          x += (rnd() - 0.5) * 4;
          y = bd.y + (bd.h * k) / steps;
          g.lineTo(x, y + warp[(((Math.round(x) % N) + N) % N)] * -1);
          gb.lineTo(x, y + warp[(((Math.round(x) % N) + N) % N)] * -1);
        }
        g.stroke();
        gb.stroke();
      });
    }
  }
  // fresh spalls: pale scars where a slab broke away, a raised rim
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * N;
    const cy = rnd() * N;
    const r = 6 + rnd() * 18;
    const pts = Array.from({ length: 7 }, (_, k) => { const a = (k / 7) * Math.PI * 2; const rr = r * (0.6 + rnd() * 0.5); return [Math.cos(a) * rr * 1.4, Math.sin(a) * rr * 0.8]; });
    wrapX((dx) => {
      for (const dy of [-N, 0, N]) {
        g.beginPath();
        gb.beginPath();
        pts.forEach(([px, py], k) => { const f = k ? 'lineTo' : 'moveTo'; g[f](cx + dx + px, cy + dy + py); gb[f](cx + dx + px, cy + dy + py); });
        g.closePath();
        gb.closePath();
        g.fillStyle = `rgba(236,178,120,${0.18 + rnd() * 0.16})`;
        g.fill();
        gb.fillStyle = 'rgba(90,90,90,0.5)';
        gb.fill();
        gb.strokeStyle = 'rgba(230,230,230,0.6)';
        gb.lineWidth = 1.2;
        gb.stroke();
      }
    });
  }
  // desert varnish: dark streaks running down the face from the ledges
  // (1.22: fewer and fainter: seen side-on they made the faces look like wood grain)
  for (let i = 0; i < 36; i++) {
    const bd = bands[Math.floor(rnd() * bands.length)];
    const x = rnd() * N;
    const y = bd.y + warp[Math.floor(x) % N] * -1;
    const w = 1.5 + rnd() * 6;
    const len = 30 + rnd() * 160;
    const a = (0.08 + rnd() * 0.16) * (i % 3 ? 0 : 0.6);
    wrapX((dx) => {
      for (const dy of [-N, 0]) {
        const gr = g.createLinearGradient(0, y + dy, 0, y + dy + len);
        gr.addColorStop(0, `rgba(38,22,16,${a})`);
        gr.addColorStop(1, 'rgba(38,22,16,0)');
        g.fillStyle = gr;
        g.fillRect(x + dx, y + dy, w, len);
      }
    });
  }
  // lichen: grey-green and pale patches, mostly on the lips
  for (let i = 0; i < 70; i++) {
    const bd = bands[Math.floor(rnd() * bands.length)];
    const x = rnd() * N;
    const y = bd.y + rnd() * Math.min(10, bd.h) - warp[Math.floor(x) % N];
    const r = 2 + rnd() * 8;
    wrapX((dx) => {
      const rg = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      rg.addColorStop(0, `rgba(${rnd() < 0.6 ? '128,140,108' : '200,194,156'},0.3)`);
      rg.addColorStop(1, 'rgba(128,140,108,0)');
      g.fillStyle = rg;
      g.fillRect(x + dx - r, y - r, r * 2, r * 2);
    });
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(b);
  bump.colorSpace = THREE.NoColorSpace;
  for (const tx of [map, bump]) {
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.anisotropy = 8;
    tx.repeat.set(2, 0.75);   // (a whole number along a 48 m piece: the picture runs on across the joins)
  }
  return { map, bump };
}

/** A boulder: a rough, faceted lump of sandstone, flat where it sits, a broken face or two, darker and wet at its foot. */
function boulderGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const cuts = [[0.8, 0.3, 0.5, 0.78], [-0.6, 0.5, -0.6, 0.8], [0.1, 0.9, -0.4, 0.85]].map(([x, y, z, d]) => [new THREE.Vector3(x, y, z).normalize(), d]);
  const col = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + v.y * 1.7) * 0.07 + Math.sin(v.y * 4.3 - v.z * 2.9) * 0.05 + Math.sin(v.z * 7.7 + v.x * 5.3) * 0.03;
    v.multiplyScalar(1 + n);
    // (broken faces: flat planes sliced off)
    for (const [cn, d] of cuts) { const k = v.dot(cn); if (k > d) v.addScaledVector(cn, d - k); }
    v.y = Math.max(v.y, -0.35) * 0.78;
    p.setXYZ(i, v.x * 1.15, v.y, v.z);
    const c = (v.y < -0.12 ? 0.62 : 0.82 + n * 1.4) + Math.max(0, v.y) * 0.12;
    col.push(c, c * 0.97, c * 0.93);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A shrub: a lumpy ball of leaves, flat at its foot, darker inside and below (smooth, not faceted). */
function shrubGeometry(seed = 0) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const col = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 5.1 + v.y * 2.3 + seed) * 0.5 + Math.sin(v.z * 6.7 - v.x * 1.9 + seed * 1.7) * 0.35 + Math.sin(v.y * 9.3 + v.z * 3.1 + seed * 0.6) * 0.2;
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

/**
 * An umbrella thorn's crown: a wide flat canopy in tiers, made of overlapping flattened lumps (a layered, cloudy
 * silhouette, not one blob), darker underneath. About 1 across, 0.35 high; its foot at y 0.
 */
function acaciaCrownGeometry() {
  const parts = [];
  const lumps = [[0, 0.12, 0, 0.62], [0.42, 0.08, 0.18, 0.48], [-0.38, 0.06, 0.26, 0.5], [0.14, 0.05, -0.44, 0.5], [-0.3, 0.1, -0.3, 0.44], [0.18, 0.2, 0.08, 0.4], [-0.08, 0.22, -0.1, 0.36]];
  lumps.forEach(([x, y, z, r], i) => {
    const g = shrubGeometry(i * 3.7 + 1);
    g.scale(r, r * 0.38, r);
    g.translate(x, y, z);
    parts.push(g);
  });
  const m = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return m;
}
/** An acacia's trunk: a crooked stem that forks into three limbs reaching out under the canopy. 1 high; its foot at 0. */
function acaciaTrunkGeometry() {
  const seg = (a, b, r0, r1) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(r1, r0, d.length(), 7, 1);
    g.translate(0, d.length() / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    g.applyQuaternion(q);
    g.translate(a.x, a.y, a.z);
    return g;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const fork = V(0.06, 0.55, 0.02);
  const parts = [
    seg(V(0, 0, 0), V(0.03, 0.3, 0), 0.34, 0.27), seg(V(0.03, 0.3, 0), fork, 0.27, 0.22),
    seg(fork, V(0.9, 1.0, 0.3), 0.17, 0.08), seg(fork, V(-0.8, 1.0, 0.45), 0.16, 0.07), seg(fork, V(-0.1, 1.02, -0.85), 0.15, 0.07),
  ];
  const m = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  for (const g of parts) g.dispose();
  m.computeVertexNormals();
  return m;
}
/**
 * Leaves on a bent material (the bushes, the acacias' crowns): clumps of light and shade broken up by noise in the
 * world, warmer and lighter where the clumps catch the sun, deep green in the gaps.
 */
function foliageMaterial(m, noise) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uLeafNoise = { value: noise };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLeafW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvLeafW = rvW.xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLeafW;\nuniform sampler2D uLeafNoise;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float l1 = texture2D(uLeafNoise, vLeafW.xz * 0.21 + vLeafW.y * 0.13).r;
    float l2 = texture2D(uLeafNoise, vLeafW.xy * 0.73 + vLeafW.z * 0.31).g;
    float leaf = smoothstep(0.32, 0.78, l1 * 0.55 + l2 * 0.45);
    diffuseColor.rgb *= 0.62 + 0.62 * leaf;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.1, 0.72), leaf * 0.5);
  }`);
  };
  m.customProgramCacheKey = () => 'rivier-bend-leaf';
  return m;
}

/**
 * A rondavel: the round sandstone peaks of the Blyde canyon. The drum climbs in layers (each a little ledge, the stone
 * fluted by the rain between them), narrowing upward; a skirt of fallen scree round its foot. { drum, scree } geometries.
 */
function rondavelGeometry(r, h, seed) {
  const layers = 7;
  const prof = [];
  for (let k = 0; k <= layers; k++) {
    const y = (k / layers) * h;
    const rr = r * (1.22 - 0.42 * (k / layers));
    // (the lip of each layer stands out a little over the undercut foot of the next)
    if (k) prof.push(new THREE.Vector2(rr * 0.965, y - h * 0.025));
    prof.push(new THREE.Vector2(rr, y));
  }
  prof.push(new THREE.Vector2(0.001, h));
  const g = new THREE.LatheGeometry(prof, 40);
  g.translate(0, -h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 3 + seed) * 0.06 + Math.sin(a * 7 + seed * 2) * 0.035 + Math.sin(a * 17 + y * 0.12 + seed) * 0.022 + Math.sin(y * 0.15 + a * 2) * 0.02;
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  // the scree: a rough low cone of fallen rock round the foot
  const sc = new THREE.CylinderGeometry(r * 1.25, r * 1.75, h * 0.22, 28, 2, true);
  const q = sc.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const x = q.getX(i);
    const z = q.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 5 + seed * 3) * 0.08 + Math.sin(a * 11 + seed) * 0.05;
    q.setXYZ(i, x * k, q.getY(i) + Math.sin(a * 6 + seed) * h * 0.02, z * k);
  }
  sc.computeVertexNormals();
  return { drum: g, scree: sc };
}
/** A rondavel's crown: a grassy, bushy hut-roof dome, rounded rather than a straight cone, darker in its folds. */
function rondavelCap(r, seed) {
  const prof = [[0.9, 0], [0.86, 0.12], [0.76, 0.32], [0.6, 0.55], [0.4, 0.76], [0.2, 0.92], [0.001, 1]].map(([x, y]) => new THREE.Vector2(x * r, y * r * 0.62));
  const g = new THREE.LatheGeometry(prof, 28);
  const p = g.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const n = Math.sin(a * 9 + seed + y * 0.4) * 0.5 + Math.sin(a * 23 + seed * 2) * 0.3 + Math.sin(y * 0.9 + a * 4) * 0.2;
    const k = 1 + n * 0.05;
    p.setXYZ(i, x * k, y + n * 0.25, z * k);
    const c = 0.8 + n * 0.16 + (y / (r * 0.62)) * 0.12;
    col.push(c * 0.95, c, c * 0.8);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
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
  // (1.22: haze on the horizon, a light blue over it, the deep blue high up. The ride's camera sees only the sky's lowest
  // 15°, and the old straight mix of horizon cream and deep blue made a flat grey-beige there)
  vec3 low = min(uZenith * 1.9 + uHorizon * 0.12, vec3(1.0));
  vec3 col = mix(uHorizon, low, smoothstep(-0.01, 0.15, h));
  col = mix(col, uZenith, smoothstep(0.12, 0.7, h));
  float s = max(dot(d, uSun), 0.0);
  // high soft clouds drifting, lit warm on the sun's side (none straight up, thinning to the horizon)
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.16) * 0.16 + vec2(uT * 0.0015, uT * 0.0004);
    float n = texture2D(uNoise, cp).r * 0.62 + texture2D(uNoise, cp * 2.7 + 0.37).b * 0.38;
    // (1.22: fewer, whiter clouds with the blue between them: the old cover lay over nearly all the sky the ride sees,
    // a grey-lilac overcast)
    float cl = smoothstep(0.58, 0.76, n) * smoothstep(0.02, 0.2, d.y) * (1.0 - smoothstep(0.5, 0.85, d.y));
    vec3 lit = mix(vec3(1.0, 0.96, 0.9), uSunCol, 0.3) * (1.0 + 0.5 * pow(s, 5.0));
    vec3 shade = mix(uHorizon, vec3(0.86, 0.88, 0.92), 0.5) * 0.9;
    col = mix(col, mix(shade, lit, smoothstep(0.6, 0.8, n)), cl * 0.85 * uClouds);
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
const FALL_FRAG = `uniform sampler2D uNoise; uniform float uT; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uTint;
uniform vec2 uRep; uniform float uSolid;
varying vec2 vUv; varying float vDepth;
void main() {
  float x = vUv.x;
  // (28 Oct 2026) uRep / uSolid: the walls' strips (1, 0) as before; a fall across the river (Afgly) has many more streaks
  // across its width, is fuller, and fades only at its very sides
  float edge = mix(smoothstep(0.0, 0.3, x) * smoothstep(1.0, 0.7, x), smoothstep(0.0, 0.08, x) * smoothstep(1.0, 0.92, x), uSolid);
  // streaks of falling water: the pattern runs down, faster lower down
  float n = texture2D(uNoise, vec2(x * 0.9 * uRep.x, vUv.y * 0.5 * uRep.y + uT * 0.55)).r;
  float n2 = texture2D(uNoise, vec2(x * 2.3 * uRep.x + 0.3, vUv.y * 1.4 * uRep.y + uT * 1.25)).b;
  float st = smoothstep(0.3, 0.75, n * 0.55 + n2 * 0.45);
  float a = edge * mix(0.35 + 0.65 * st, 0.6 + 0.4 * st, uSolid);
  a *= smoothstep(1.0, 0.95, vUv.y);
  // (the body of the fall a cool green-grey with bright white streaks, glossier near the lip)
  vec3 col = mix(vec3(0.5, 0.64, 0.64), vec3(1.0), smoothstep(0.38, 0.82, n2) * (0.6 + 0.4 * st));
  // white water where it lands
  float foot = smoothstep(0.14, 0.0, vUv.y);
  col = mix(col, vec3(1.0), foot);
  a = max(a, foot * edge * 0.9);
  col *= uTint;
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(col, a * 0.9);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------------------------------------ the water
const WATER_VERT = `uniform float uDist; uniform float uBendA; uniform float uBendB; uniform float uBendK; uniform mat4 uReflMat;
varying vec3 vWorld; varying vec2 vRiver; varying float vAhead; varying vec4 vRefl;
float bendX(float d, float z) { float a = max(0.0, d) / 160.0; return uBendK * ((sin(z * 0.0085 + 0.6) * 20.0 + sin(z * 0.0031 + 1.7) * 10.0) * a * a + sin(z * 0.023 + 2.1) * 3.0 * a); }
void main() {
  vec3 p = position;
  float ahead = -p.z;
  float zc = uDist + ahead;
  p.x += bendX(ahead, zc);
  vRiver = vec2(position.x, zc);
  vAhead = ahead;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vRefl = uReflMat * w;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WATER_FRAG = `uniform float uT; uniform sampler2D uNoise; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uDeep; uniform vec3 uShallow;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSkyRefl; uniform vec3 uFoam; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
uniform float uHalf; uniform float uLakeHalf; uniform float uLakeFrom; uniform float uLakeTo; uniform float uDetail; uniform vec2 uRapids; uniform float uPoolTo;
uniform vec3 uWall; uniform vec2 uRider; uniform sampler2D uRefl; uniform float uReflK;
uniform vec3 uLampPos; uniform vec3 uLampDir; uniform vec3 uLampCol; uniform vec2 uLampCos; uniform vec3 uLanes;
varying vec3 vWorld; varying vec2 vRiver; varying float vAhead; varying vec4 vRefl;
float h(vec2 p) {
  // the surface's height: long swells across, ripples and chop running with the current (stretched along it)
  float a = texture2D(uNoise, vec2(p.x * 0.07, p.y * 0.022 - uT * 0.05)).r;
  float b = texture2D(uNoise, vec2(p.x * 0.23, p.y * 0.075 - uT * 0.16)).b;
  float c = texture2D(uNoise, vec2(p.x * 0.61, p.y * 0.21 - uT * 0.42)).r;
  // (1.22: less of the long swell, more of the small chop: the swells tilted whole patches to the pale sky, creamy
  // blotches on the water; now a finer sparkle)
  return a * 0.36 + b * 0.4 + c * 0.24 * uDetail;
}
void main() {
  vec2 p = vRiver;
  float e = 0.35;
  float h0 = h(p);
  vec3 n = normalize(vec3((h0 - h(p + vec2(e, 0.0))) * 2.4, 1.0, (h0 - h(p + vec2(0.0, e))) * 2.4));
  vec3 v = normalize(cameraPosition - vWorld);
  // (1.22: fine ripples close by, smaller than the waves above can show: near the camera the water went smooth, and
  // the sky lay on it in big golden blobs)
  {
    float nearK = (1.0 - smoothstep(6.0, 26.0, length(cameraPosition - vWorld))) * uDetail;
    vec2 rp = texture2D(uNoise, vec2(p.x * 1.9, p.y * 0.9 - uT * 0.9)).rg + texture2D(uNoise, vec2(p.x * 3.7 + 0.31, p.y * 2.1 - uT * 1.6)).gb - 1.0;
    n = normalize(n + vec3(rp.x, 0.0, rp.y) * 0.32 * nearK);
  }
  float lake = smoothstep(uLakeFrom, uLakeFrom + 40.0, p.y) * (1.0 - smoothstep(uLakeTo, uLakeTo + 30.0, p.y));
  lake = max(lake, 1.0 - smoothstep(uPoolTo, uPoolTo + 40.0, p.y));
  float half_ = mix(uHalf, uLakeHalf, lake);
  float edge = clamp(abs(p.x) / half_, 0.0, 1.2);
  // the water's own colour: deep green-blue in the middle, lighter and clearer towards the banks; darker in the troughs
  vec3 base = mix(uDeep, uShallow, smoothstep(0.45, 1.0, edge) * 0.85);
  base *= 0.9 + h0 * 0.36;
  // the sky in it: more at a glancing look (Fresnel), never more than half
  // (1.22: further off, the ripples even out in the sky's reflection, as on real water: up close they tilt it patch by
  // patch, but at 20-60 m that made a repeating cream mosaic across the river. The sun's glitter keeps every ripple)
  vec3 nr = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(14.0, 60.0, length(cameraPosition - vWorld)) * 0.7));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nr, v), 0.0), 5.0);
  vec3 rr = reflect(-v, nr);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uSkyRefl, smoothstep(0.0, 0.35, rr.y));
  // (strong phones: the real mirror image, the canyon, the towers and the sky, rippled by the waves)
  if (uReflK > 0.0) {
    vec2 ruv = vRefl.xy / vRefl.w + n.xz * 0.05;
    vec3 rc = texture2D(uRefl, clamp(ruv, 0.001, 0.999)).rgb;
    sky = mix(sky, rc, uReflK);
  }
  vec3 col = mix(base, sky, clamp(fres, 0.0, 0.42 + 0.3 * uReflK));
  // light in the water itself (it's never black, even looking straight down into it)
  col += uShallow * 0.18 * (1.0 - fres);
  // the sandstone walls mirrored near the banks: warmer and darker there (not in the open lake; less with the real one)
  float wall = smoothstep(0.42, 0.95, edge) * (1.0 - lake) * (1.0 - 0.75 * uReflK);
  col = mix(col, uWall, wall * (0.22 + 0.4 * fres));
  // the low sun ahead: a path of glitter down the river
  float s = max(dot(r, uSun), 0.0);
  // (1.22: softer: at 3.2 the glints burnt to white smears down the left of the river)
  col += uSunCol * (pow(s, 260.0) * 1.7 + pow(s, 40.0) * 0.13);
  // white water: foam along the banks and streaks where the current breaks (thin, along the flow)
  float streak = texture2D(uNoise, vec2(p.x * 0.9, p.y * 0.02 - uT * 0.11)).b;
  float rap = smoothstep(uRapids.x - 12.0, uRapids.x + 8.0, p.y) * (1.0 - smoothstep(uRapids.y - 8.0, uRapids.y + 12.0, p.y));
  // (1.22: fainter outside the rapids: close to you they were big white smears down the side of the river)
  float foamLine = smoothstep(0.66 - rap * 0.2, 0.74, streak) * (1.0 - smoothstep(0.74, 0.86 + rap * 0.1, streak)) * (0.32 + rap * 0.63) * (1.0 - lake);
  foamLine += rap * smoothstep(0.55, 0.85, h0) * 0.6;
  // (lace, not a solid band: broken up by fast noise running with the current)
  float lace = smoothstep(0.42, 0.72, texture2D(uNoise, vec2(p.x * 1.3, p.y * 0.16 - uT * 0.5)).g * 0.6 + h0 * 0.4);
  float bankFoam = smoothstep(0.95, 1.0, edge) * (1.0 - smoothstep(1.0, 1.06, edge)) * lace * 0.6;
  col = mix(col, uFoam, clamp(foamLine * smoothstep(0.3, 0.6, h0) + bankFoam, 0.0, 0.9));
  // the lanes: seams of white water between them and along their outer edges (the current running in lines), broken
  // into streaks and bubbles that flow with the river, so you always see where the three lanes are
  if (uLanes.z > 0.0) {
    float ax = abs(p.x);
    float wob = (texture2D(uNoise, vec2(p.y * 0.013, 0.3)).r - 0.5) * 0.5;
    float seam = max(1.0 - smoothstep(0.04, 0.24, abs(ax + wob * 0.4 - uLanes.x)), 0.6 * (1.0 - smoothstep(0.06, 0.3, abs(ax + wob - uLanes.y))));
    float streak2 = smoothstep(0.42, 0.7, texture2D(uNoise, vec2(p.x * 0.3 + 0.37, p.y * 0.055 - uT * 0.35)).g);
    float fizz = smoothstep(0.52, 0.8, texture2D(uNoise, vec2(p.x * 2.7, p.y * 0.42 - uT * 1.3)).r);
    col = mix(col, uFoam, clamp(seam * (0.08 + 0.55 * streak2 + 0.4 * fizz) * uLanes.z, 0.0, 0.8));
  }
  // his wake: two lines of foam opening out behind the board, and the churned water right behind it
  float back = uRider.y - p.y;
  if (back > 0.2 && back < 9.0) {
    float spread = 0.4 + back * 0.2;
    float dx = abs(abs(p.x - uRider.x) - spread);
    float fade = 1.0 - back / 9.0;
    // (1.22: both fade in over the first metre behind the board: their hard start showed whenever he jumped)
    fade *= smoothstep(0.2, 1.3, back);
    float wk = (1.0 - smoothstep(0.0, 0.14 + back * 0.02, dx)) * fade * fade;
    wk *= smoothstep(0.3, 0.75, texture2D(uNoise, vec2(p.x * 0.8, p.y * 0.6 - uT * 0.6)).r);
    float tr = (1.0 - smoothstep(0.1, 0.5, abs(p.x - uRider.x))) * (1.0 - smoothstep(0.0, 5.0, back)) * smoothstep(0.2, 1.3, back);
    col = mix(col, uFoam, clamp(wk * 0.5 + tr * 0.25, 0.0, 0.6));
  }
  // (a night: his headlamp, a warm pool of light on the water ahead of him: the foam and the wave tops light up in it,
  // the steep little faces glint)
  if (uLampCol.r > 0.0) {
    vec3 lv = uLampPos - vWorld;
    float ld = length(lv);
    float cone = smoothstep(uLampCos.x, uLampCos.y, dot(-lv / ld, uLampDir));
    float fall = cone * cone / (1.0 + ld * 0.1) * (1.0 - smoothstep(26.0, 52.0, ld)) * smoothstep(1.5, 7.0, ld);
    float glint = smoothstep(0.035, 0.1, length(n.xz)) * smoothstep(0.45, 0.8, h0);
    col *= 1.0 + uLampCol * fall * 1.1;
    col += uLampCol * fall * (0.03 + 0.12 * h0 + 0.75 * glint);
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
export function buildRiverWorld(stage, lookId = 'dag', { air = true, lakeHalf = BANK.lake, town = false } = {}) {
  // (`town`: the crew's island alone in a wide lake, the camera going right round it: water all round, fading into the
  // haze; sandstone buttes in a ring on the horizon; no canyon)
  if (town) lakeHalf = 2000;
  const { scene, renderer, quality } = stage;
  const L = LOOKS[lookId] || LOOKS.dag;
  const sunDir = new THREE.Vector3(...L.sunDir).normalize();
  const exposure = renderer.toneMappingExposure;
  renderer.toneMappingExposure = L.exposure;
  const group = new THREE.Group();
  scene.add(group);
  const fog = lin(L.haze);
  rkSun.value = Math.min(1, L.sunI / 2.6);
  rimUniform.value.copy(lin(L.sun).multiplyScalar(0.22 * Math.min(1, L.sunI / 2.6))).add(lin(L.hemiSky).multiplyScalar(0.05));
  // the light on things that draw themselves unlit (foam, spray, falling water, mist): full white by day, warm and
  // dimmer at sunset, cool and dark at night
  const lightOf = (o) => lin(o.sun).multiplyScalar(o.sunI * 0.29).add(lin(o.hemiSky).multiplyScalar(o.hemiI * 0.35));
  const dayLight = lightOf(DAY);
  const fxTint = lightOf(L);
  fxTint.setRGB(Math.min(1, fxTint.r / dayLight.r), Math.min(1, fxTint.g / dayLight.g), Math.min(1, fxTint.b / dayLight.b));
  { const g = (fxTint.r + fxTint.g + fxTint.b) / 3; fxTint.lerp(new THREE.Color(g, g, g), 0.55); }   // (moonlight greys things more than it blues them)
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
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), skyMat));   // (the sky's own material: a copy would copy its noise picture too)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = L.envI;
  pmrem.dispose();
  // (the little scene it was made from is done with)
  envScene.traverse((o) => { o.geometry?.dispose(); });

  // light: the low sun ahead-left, the sky's blue from above, warm ground bounce
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  sun.position.copy(sunDir).multiplyScalar(120);
  group.add(sun, sun.target);
  // real shadows from the sun (not on the lowest quality): a box of light that follows where you look (the ride: the
  // river just ahead of you; the town: the island), its own shadow map
  const shadows = quality.name !== 'low';
  if (shadows) {
    sun.castShadow = true;
    const ms = Math.min(quality.shadow || 2048, quality.name === 'high' ? 4096 : 2048);
    sun.shadow.mapSize.set(ms, ms);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 3;
    const sc = sun.shadow.camera;
    sc.near = 1;
    sc.far = 420;
  }
  let shadowR = 0;
  /** Where the shadows are drawn: round (x, z) on the water, `r` metres either way (the box of light follows it). */
  function setShadowFocus(x, z, r = 42) {
    if (!shadows) return;
    sun.target.position.set(x, 0, z);
    sun.position.set(x, 0, z).addScaledVector(sunDir, 200);
    if (r !== shadowR) {
      shadowR = r;
      const sc = sun.shadow.camera;
      sc.left = -r;
      sc.right = r;
      sc.top = r;
      sc.bottom = -r;
      sc.updateProjectionMatrix();
    }
  }
  setShadowFocus(0, -28);
  const fill = new THREE.DirectionalLight(L.fill, L.fillI);   // (from behind the camera: what comes at you is lit)
  fill.position.set(6, 10, 30);
  group.add(fill);
  group.add(new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiI));

  // the water: a long strip that rides with the camera; its ripples run in course space
  const water = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 }, uDist: { value: 0 }, uNoise: { value: noise }, uSun: { value: sunDir.clone() }, uSunCol: { value: lin(L.sun) },
      uDeep: { value: lin(L.deep) }, uShallow: { value: lin(L.shallow) }, uZenith: { value: lin(L.zenith) },
      uHorizon: { value: lin(L.horizon) }, uSkyRefl: { value: lin(L.skyRefl) }, uFoam: { value: lin(COLORS.foam).multiply(fxTint) }, uFog: { value: fog },
      uFogNear: { value: BANK.fogNear }, uFogFar: { value: BANK.fogFar }, uHalf: { value: BANK.half }, uLakeHalf: { value: lakeHalf },
      uLakeFrom: { value: 1e6 }, uLakeTo: { value: 1e6 }, uDetail: { value: quality.name === 'low' ? 0 : 1 },
      uBendA: { value: 0 }, uBendB: { value: 0 }, uBendK: bendUniforms.uBendK, uRapids: { value: new THREE.Vector2(-1e6, -1e6) }, uPoolTo: { value: -1e6 },
      uWall: { value: lin(L.wall) }, uRider: { value: new THREE.Vector2(0, -1e6) },
      uRefl: { value: null }, uReflK: { value: 0 }, uReflMat: { value: new THREE.Matrix4() },
      uLampPos: { value: new THREE.Vector3() }, uLampDir: { value: new THREE.Vector3(0, 0, -1) }, uLampCol: { value: new THREE.Color(0, 0, 0) },
      uLampCos: { value: new THREE.Vector2(0.9, 0.97) },
      uLanes: { value: new THREE.Vector3(0, 0, 0) },
    },
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
  });
  const seg = quality.name === 'high' ? [24, 220] : [16, 150];
  // (as wide as the lake, with water under its shores; the town's lake all round its island)
  const wgeo = town ? new THREE.PlaneGeometry(1800, 1800, 30, 30) : new THREE.PlaneGeometry(Math.max(120, (lakeHalf + 16) * 2), 640, seg[0] + Math.round(Math.max(0, lakeHalf - 46) / 6), seg[1]);
  wgeo.rotateX(-Math.PI / 2);
  if (!town) wgeo.translate(0, 0, -640 / 2 + 40);   // from 40 m behind to 600 m ahead
  const waterMesh = new THREE.Mesh(wgeo, water);
  waterMesh.frustumCulled = false;
  group.add(waterMesh);
  // ---- the mirror (strong phones and computers: the quality 'high'): the scene drawn again from under the water into a
  // half-size picture each frame, which the water samples where it looks (three's Reflector, by hand: the water has its
  // own shader). The shadows aren't drawn twice (last frame's serve).
  let reflOn = quality.name === 'high';
  let reflRT = null;
  const vcam = new THREE.PerspectiveCamera();
  const _rp = new THREE.Vector3();
  const _cp = new THREE.Vector3();
  const _rm = new THREE.Matrix4();
  const _la = new THREE.Vector3();
  const _tg = new THREE.Vector3();
  const _n = new THREE.Vector3(0, 1, 0);
  const _pl = new THREE.Plane();
  const _clip = new THREE.Vector4();
  const _q = new THREE.Vector4();
  const _sz = new THREE.Vector2();
  stage.onQuality?.((q) => { reflOn = q.name === 'high'; if (!reflOn) water.uniforms.uReflK.value = 0; });
  let catcherMesh = null;
  function reflect(renderer, camera) {
    if (!reflOn) return;
    renderer.getDrawingBufferSize(_sz);
    const w = Math.max(64, Math.round(_sz.x * 0.5));
    const h = Math.max(64, Math.round(_sz.y * 0.5));
    if (!reflRT || reflRT.width !== w || reflRT.height !== h) {
      reflRT?.dispose();
      reflRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
      water.uniforms.uRefl.value = reflRT.texture;
    }
    camera.updateMatrixWorld();
    _cp.setFromMatrixPosition(camera.matrixWorld);
    if (_cp.y <= 0.05) { water.uniforms.uReflK.value = 0; return; }
    // the camera mirrored in the plane y = 0
    _rp.set(_cp.x, -_cp.y, _cp.z);
    _rm.extractRotation(camera.matrixWorld);
    _la.set(0, 0, -1).applyMatrix4(_rm).add(_cp);
    _tg.set(_la.x, -_la.y, _la.z);
    vcam.position.copy(_rp);
    vcam.up.set(0, 1, 0).applyMatrix4(_rm).reflect(_n);
    vcam.lookAt(_tg);
    vcam.far = camera.far;
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);
    // (only what is above the water: an oblique near plane on the water's surface)
    _pl.setFromNormalAndCoplanarPoint(_n, _cp.set(0, 0, 0));
    _pl.applyMatrix4(vcam.matrixWorldInverse);
    _clip.set(_pl.normal.x, _pl.normal.y, _pl.normal.z, _pl.constant);
    const pm = vcam.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + pm[8]) / pm[0], (Math.sign(_clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    pm[2] = _clip.x;
    pm[6] = _clip.y;
    pm[10] = _clip.z + 1;
    pm[14] = _clip.w;
    vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();
    water.uniforms.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
    // draw it (without the water, its shadow layer and the spray; shadows as they are)
    waterMesh.visible = false;
    if (catcherMesh) catcherMesh.visible = false;
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(reflRT);
    renderer.clear();
    renderer.render(scene, vcam);
    renderer.setRenderTarget(before);
    renderer.shadowMap.autoUpdate = auto;
    waterMesh.visible = true;
    if (catcherMesh) catcherMesh.visible = true;
    water.uniforms.uReflK.value = 0.85;
  }
  // the shadows on the water: a see-through layer just over it that shows only shade (the water's own shader stays)
  if (shadows) {
    const cg = town ? new THREE.PlaneGeometry(200, 200, 20, 20) : new THREE.PlaneGeometry(140, 260, 28, 52);
    cg.rotateX(-Math.PI / 2);
    cg.translate(0, 0.05, town ? 0 : -100);
    const catcher = new THREE.Mesh(cg, bendMaterial(new THREE.ShadowMaterial({ color: '#06262a', opacity: 0.34, depthWrite: false })));
    catcher.receiveShadow = true;
    catcher.frustumCulled = false;
    catcher.renderOrder = 1;
    group.add(catcher);
    catcherMesh = catcher;
  }

  // the canyon: cliff walls in pieces along both banks, re-used as you go; bush and boulders on them
  const rockTex = rockTextures();
  const bankU = { uPoolTo: { value: -1e6 }, uLakeFrom: { value: 1e6 }, uLakeTo: { value: 1e6 }, uLakeW: { value: lakeHalf - BANK.half } };
  // (the stones in the river: the same sandstone, wrapped round them, wet to just over the water, never moved by the
  // banks' opening)
  // (1.22: a little darker and rougher, and wet higher up: the stones looked like plastic laid on the water)
  const stoneMat = rockDetail(bendMaterial(new THREE.MeshStandardMaterial({ map: rockTex.map, roughness: 0.92, metalness: 0, color: '#cfa88a', flatShading: true })), noise, { uPoolTo: { value: -1e6 }, uLakeFrom: { value: 1e6 }, uLakeTo: { value: 1e6 }, uLakeW: { value: 0 } }, { tri: true, wet: 0.42 });
  stoneMat.userData.shared = true;
  // (1.22: the walls' picture laid on by height and distance along (rockDetail `wall`), at the old size: two along a 48 m
  // piece, three quarters of it up the 34 m face. Laid on by the piece's own along-and-up it ran into long upright
  // streaks wherever the face turned along the river, which read as wood grain; the bumps did the same, so they're off:
  // the crags and ledges are in the shape itself)
  const rockMat = rockDetail(bendMaterial(new THREE.MeshStandardMaterial({ map: rockTex.map, roughness: 0.9, metalness: 0, vertexColors: true, side: THREE.DoubleSide })), noise, bankU, { wall: true, triS: [2 / 48, 0.75 / 34] });
  const SEG_L = 48;
  const N_SEG = 13;
  function cliffGeometry(side, seed) {
    // (1.22: a finer mesh, 56 × 40 instead of 44 × 30: the ledges' edges ran in a sawtooth)
    const g = new THREE.PlaneGeometry(SEG_L, 34, 56, 52);
    const pos = g.attributes.position;
    const col = [];
    let s = seed * 7919 + 13;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // (crags: rough value noise at three sizes, calmer at the piece's ends where it meets the next one)
    const h2 = (x, y) => { const q = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return q - Math.floor(q); };
    const sm = (x) => x * x * (3 - 2 * x);
    const vn2 = (x, y) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const tx = sm(x - x0);
      const ty = sm(y - y0);
      return (h2(x0, y0) * (1 - tx) + h2(x0 + 1, y0) * tx) * (1 - ty) + (h2(x0, y0 + 1) * (1 - tx) + h2(x0 + 1, y0 + 1) * tx) * ty;
    };
    const fbm = (x, y) => vn2(x, y) * 0.55 + vn2(x * 2.1, y * 2.1) * 0.28 + vn2(x * 4.3, y * 4.3) * 0.17;
    const bumps = Array.from({ length: 6 }, () => [rnd() * SEG_L - SEG_L / 2, rnd() * 30, 2 + rnd() * 3]);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);   // along the river
      const v = pos.getY(i) + 17;   // height 0..34
      // the face leans back as it climbs, in steps: layers that stand out and undercut feet (the sandstone's ledges)
      const step = (v % 7.5) / 7.5;
      // (1.22: each layer's ledge rounded over its top 1.6 m and the layer's own lean eased into the next: both jumped at
      // the layer's edge, a step too sharp for the mesh, which shaded as a row of teeth along every ledge)
      const lay = Math.floor(v / 7.5) + sm(Math.min(1, Math.max(0, (step - 0.79) / 0.21)));
      const lip = step < 0.18 ? 1 - step / 0.18 : sm(Math.min(1, Math.max(0, (step - 0.79) / 0.21)));
      // (every piece shares one profile at its two ends, so the pieces join without a slit; their own shape grows in
      // over the last 7 m)
      const e0 = Math.min(1, Math.max(0, (SEG_L / 2 - Math.abs(u)) / 7));
      const ends = e0 * e0 * (3 - 2 * e0);
      const common = Math.pow(v / 34, 1.6) * 7 - 0.7 * lip + Math.sin(lay * 2.7) * 0.35 + Math.sin(v * 0.6) * 0.45;
      let own = Math.sin(lay * 2.7 + seed) * 0.35 - Math.sin(lay * 2.7) * 0.35 + Math.sin(u * 0.21 + seed) * 0.9 + (Math.sin(v * 0.6 + u * 0.05) - Math.sin(v * 0.6)) * 0.45 + Math.sin(u * 0.83 + v * 0.31 + seed) * 0.22;
      for (const [bu, bv, br] of bumps) own -= Math.exp(-((u - bu) ** 2 + (v - bv) ** 2) / (br * br * 2)) * 1.6;
      // (1.22: the crags without the finest size: smaller than the mesh, it zigzagged every layer's edge)
      if (v > 1.4) own += (vn2(u * 0.14 + 3, v * 0.2) * 0.66 + vn2(u * 0.294 + 3, v * 0.42) * 0.34 - 0.5) * 2.6;
      let out = common + own * ends;
      // (no deep bulge at the water: something riding along the bank, Hanswors on his duck, stays clear of the rock. The
      // limit eases off above a rider's height, and the rock eases into it rather than being cut flat)
      if (v < 6.5) {
        const lim = -0.3 - Math.max(0, v - 3.5) * 0.6;
        const dd = out - lim;
        if (dd < 0.4) out = lim + 0.4 * Math.exp(dd / 0.4 - 1);
      }
      const shelf = v < 1.2 ? (1.2 - v) * 1.4 : 0;   // (a ledge at the water)
      pos.setXYZ(i, side * (out + shelf), v - 1.1, u);
      // light varies along the wall; the foot is wet and dark, the rim sun-bleached
      const k = (0.91 + (fbm(u * 0.09 + 11, v * 0.12) - 0.5) * 0.26 * ends) * (v < 2.2 ? 0.55 + v * 0.16 : 1) * (v > 29 ? 1.06 : 1);
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
  /** The ground on top: the plateau running back from the rim (dusty scrub), so no gap shows behind the walls. */
  function plateauGeometry(side, seed) {
    const g = new THREE.PlaneGeometry(170, SEG_L, 10, 8);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const col = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const lx = side * (5.2 + 85 + x);
      const y = 32.4 + Math.sin(x * 0.07) * 0.8 + Math.sin((z / SEG_L) * Math.PI * 2 + x * 0.03) * 0.5 + Math.max(0, (Math.abs(lx) - 40) * 0.04);
      pos.setXYZ(i, lx, y, z);
      uv.setXY(i, lx / 37, z / 53);
      // (green in the vertex colour marks it as grassland for the walls' shader)
      const k = 0.78 + Math.sin(x * 0.13 + (z / SEG_L) * Math.PI * 4) * 0.08;
      col.push(k * 0.72, k, k * 0.55);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // (the left side's faces turned to face up after its x was mirrored)
    if (side < 0) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    }
    g.computeVertexNormals();
    return g;
  }
  // (where each wall's foot stands, metre by metre along it: its nearest point to the river from the water up to a rider's
  // height. Something riding beside the wall keeps clear of it: footAt)
  for (const side of [-1, 1]) {
    for (const g of cliffGeos[side]) {
      const pos = g.attributes.position;
      const raw = new Float32Array(SEG_L + 1).fill(99);
      for (let i = 0; i < pos.count; i++) {
        const v = pos.getY(i) + 1.1;
        if (v < 0 || v > 4.5) continue;
        const b = Math.round(pos.getZ(i) + SEG_L / 2);
        if (b >= 0 && b <= SEG_L) raw[b] = Math.min(raw[b], side * pos.getX(i));
      }
      // (the nearest of each metre and its neighbours: no gap between the wall's vertex rows)
      g.userData.footLine = raw.map((_, b) => Math.min(raw[Math.max(0, b - 1)], raw[b], raw[Math.min(SEG_L, b + 1)]));
    }
  }
  const wallGeos = { '-1': cliffGeos['-1'].map((g, k) => mergeGeometries([g, plateauGeometry(-1, k + 1)])), 1: cliffGeos[1].map((g, k) => mergeGeometries([g, plateauGeometry(1, k + 4)])) };
  const fallMat = new THREE.ShaderMaterial({
    uniforms: { uDist: bendUniforms.uDist, uBendK: bendUniforms.uBendK, uNoise: { value: noise }, uT: { value: 0 }, uFog: { value: fog }, uFogNear: { value: BANK.fogNear }, uFogFar: { value: BANK.fogFar }, uTint: { value: fxTint }, uRep: { value: new THREE.Vector2(1, 1) }, uSolid: { value: 0 } },
    vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  // (28 Oct 2026) Afgly's falls across the river: the same water (the walls' clock and fog: the same uniform objects), with
  // fine streaks all the way across and fuller
  const curtainMat = new THREE.ShaderMaterial({
    uniforms: { ...fallMat.uniforms, uRep: { value: new THREE.Vector2(9, 2.6) }, uSolid: { value: 1 } },
    vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  /** A strip of falling water on the wall `geo` (side ±1), 2.8 m wide, from the rim to the river, a little off the rock. */
  function fallGeometry(geo, side) {
    const pos = geo.attributes.position;
    const cols = geo.parameters.widthSegments + 1;   // (vertices a row)
    const k = Math.floor(cols / 2);
    const rows = [];
    for (let r = 0; r < pos.count / cols; r++) rows.push(new THREE.Vector3().fromBufferAttribute(pos, r * cols + k));
    rows.sort((a, b) => a.y - b.y);
    // (the water falls straight from the lip: it only moves out where rock lower down sticks out further than anything
    // above it, then smoothed)
    const clear = rows.map((q) => q.x);
    let acc = rows[rows.length - 1].x;
    for (let r = rows.length - 1; r >= 0; r--) {
      acc = side < 0 ? Math.max(acc, rows[r].x) : Math.min(acc, rows[r].x);
      clear[r] = acc;
    }
    rows.forEach((p, r) => {
      let sum = 0;
      let n = 0;
      for (let d = -2; d <= 2; d++) if (clear[r + d] !== undefined) { sum += clear[r + d]; n++; }
      p.x = sum / n;
    });
    const vtx = [];
    const uv = [];
    const idx = [];
    rows.forEach((p, r) => {
      const x = p.x - side * 0.45;
      // (wider as it falls: the water spreads out)
      const w = 2.2 + (1 - (r / (rows.length - 1))) * 2.4;
      vtx.push(x, p.y, p.z - w, x, p.y, p.z + w);
      const v = r / (rows.length - 1);
      uv.push(0, v, 1, v);
      if (r) idx.push((r - 1) * 2, r * 2, (r - 1) * 2 + 1, (r - 1) * 2 + 1, r * 2, r * 2 + 1);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vtx, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.userData.foot = new THREE.Vector3(rows[0].x - side * 0.45, 0, rows[0].z);
    return g;
  }
  // the mist where a fall lands (a soft cloud standing up, facing down the river at you) and white water round it
  const fallPuff = puffTexture(23);
  const fallMistMat = bendMaterial(new THREE.MeshBasicMaterial({ map: fallPuff, color: new THREE.Color('#f2f7f6').multiply(fxTint), transparent: true, opacity: 0.6, depthWrite: false, fog: true }));
  const fallFoamMat = bendMaterial(new THREE.MeshBasicMaterial({ map: fallPuff, color: fxTint.clone(), transparent: true, opacity: 0.75, depthWrite: false, fog: true }));
  const fallMistGeo = new THREE.PlaneGeometry(8, 5.5);
  fallMistGeo.translate(0, 2.2, 0);
  const fallFoamGeo = new THREE.PlaneGeometry(7, 6);
  fallFoamGeo.rotateX(-Math.PI / 2);
  const fallGeos = { '-1': cliffGeos['-1'].map((g) => fallGeometry(g, -1)), 1: cliffGeos[1].map((g) => fallGeometry(g, 1)) };
  const bushMat = foliageMaterial(bendMaterial(new THREE.MeshStandardMaterial({ color: COLORS.bushL, roughness: 0.92, vertexColors: true })), noise);
  const bushGeo = shrubGeometry();
  const boulderGeo = boulderGeometry();
  const segs = [];
  const BUSH_PER = quality.name === 'low' ? 6 : 12;
  const ROCK_PER = 5;
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, N_SEG * 2 * BUSH_PER);
  // acacias on the rim: a thin crooked trunk and a wide flat crown, a couple to each piece of wall
  const TREE_PER = quality.name === 'low' ? 1 : 2;
  const trunkGeo = acaciaTrunkGeometry();
  const crownGeo = acaciaCrownGeometry();
  const trunks = new THREE.InstancedMesh(trunkGeo, bendMaterial(new THREE.MeshStandardMaterial({ color: '#4a3526', roughness: 0.9 })), N_SEG * 2 * TREE_PER);
  const crowns = new THREE.InstancedMesh(crownGeo, foliageMaterial(bendMaterial(new THREE.MeshStandardMaterial({ color: '#6d8a3c', roughness: 0.9, vertexColors: true })), noise), N_SEG * 2 * TREE_PER);
  trunks.frustumCulled = crowns.frustumCulled = false;
  group.add(trunks, crowns);
  const boulders = new THREE.InstancedMesh(boulderGeo, stoneMat, N_SEG * 2 * ROCK_PER);   // (the river stones' own sandstone)
  bushes.frustumCulled = boulders.frustumCulled = false;
  boulders.castShadow = boulders.receiveShadow = shadows;
  group.add(bushes, boulders);
  for (let i = 0; i < N_SEG; i++) {
    for (const side of [-1, 1]) {
      const gi = (i + (side > 0 ? 1 : 0)) % 3;
      const m = new THREE.Mesh(wallGeos[side][gi], rockMat);
      m.frustumCulled = false;
      m.receiveShadow = shadows;
      group.add(m);
      // a waterfall down every few pieces, the sides taking turns (only where the canyon is narrow: see update)
      let fall = null;
      if (i % 4 === (side < 0 ? 1 : 3)) {
        fall = new THREE.Group();
        m.add(fall);
        const f = new THREE.Mesh(fallGeos[side][gi], fallMat);
        f.frustumCulled = false;
        f.renderOrder = 2;
        fall.add(f);
        const foot = fallGeos[side][gi].userData.foot;
        const mist = new THREE.Mesh(fallMistGeo, fallMistMat);
        mist.position.set(foot.x - side * 1.6, 0, foot.z);
        const foam = new THREE.Mesh(fallFoamGeo, fallFoamMat);
        foam.position.set(foot.x - side * 2.2, 0.08, foot.z);
        for (const o of [mist, foam]) { o.frustumCulled = false; o.renderOrder = 3; fall.add(o); }
      }
      const r = (k) => { const x = Math.sin((i * 2 + (side > 0 ? 1 : 0)) * 91.7 + k * 13.1) * 43758.5; return x - Math.floor(x); };
      segs.push({ m, fall, side, i, r, bushes: Array.from({ length: BUSH_PER }, (_, k) => [r(k) * SEG_L - SEG_L / 2, 0.9 + r(k + 40) * 1.7, r(k + 80)]), rocks: Array.from({ length: ROCK_PER }, (_, k) => [r(k + 120) * SEG_L - SEG_L / 2, 0.5 + r(k + 160) * 0.9]), trees: Array.from({ length: TREE_PER }, (_, k) => [r(k + 200) * SEG_L - SEG_L / 2, 4 + r(k + 220) * 3.5, r(k + 240)]) });
    }
  }
  if (town) for (const o of [bushes, boulders, trunks, crowns, ...segs.map((s) => s.m)]) o.visible = false;
  // far off in the haze: rondavels (round sandstone peaks with grassy tops) and a long ridge
  // (the wall's own rock picture, tiled small enough round the drums for the layers to read)
  const farMap = rockTex.map.clone();
  const farBump = rockTex.bump.clone();
  for (const tx of [farMap, farBump]) tx.repeat.set(5, 1.4);
  const ridgeMap = rockTex.map.clone();
  ridgeMap.repeat.set(28, 0.7);
  const mesaMat = new THREE.MeshStandardMaterial({ color: COLORS.mesa, roughness: 1, map: farMap, bumpMap: farBump, bumpScale: 3 });
  const mesaTopMat = new THREE.MeshStandardMaterial({ color: COLORS.mesaTop, roughness: 1, flatShading: true, vertexColors: true });
  const screeMat = new THREE.MeshStandardMaterial({ color: '#a8826a', roughness: 1, flatShading: true, map: farMap });
  const hills = new THREE.Group();
  // (three together, like the real ones, and a few more along the far rim; warm enough to read through the haze)
  // (the town: a ring of them all round the horizon, some in threes, at 300-460 m)
  const ringSpots = [];
  if (town) {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + Math.sin(k * 2.3) * 0.12;
      const d = 420 + ((k * 53) % 130);
      ringSpots.push([Math.sin(a) * d, Math.cos(a) * d, 18 + (k * 7) % 14, 30 + (k * 11) % 26, k + 1]);
      if (k % 4 === 1) ringSpots.push([Math.sin(a + 0.07) * (d + 30), Math.cos(a + 0.07) * (d + 30), 16, 44, k + 21]);
    }
  }
  for (const [x, z, r, h, s] of town ? ringSpots : [[-120, -330, 22, 44, 1], [-78, -350, 18, 52, 2], [-38, -338, 20, 40, 3], [96, -300, 24, 36, 4], [190, -360, 28, 46, 5], [-230, -360, 30, 42, 6], [300, -320, 22, 30, 7]]) {
    const geo = rondavelGeometry(r, h, s);
    const drum = new THREE.Mesh(geo.drum, mesaMat);
    drum.position.set(x, h / 2 + 6, z);
    const scree = new THREE.Mesh(geo.scree, screeMat);
    scree.position.set(x, 6 + h * 0.11, z);
    const cap = new THREE.Mesh(rondavelCap(r * 0.96, s), mesaTopMat);
    cap.position.set(x, h + 6 - r * 0.04, z);
    cap.rotation.y = s;
    hills.add(drum, scree, cap);
  }
  // the far rim of the plateau they stand on (the town: a low shore of red rock and grass all the way round)
  if (town) {
    // (from the water at 360 m up a short beach and a red rock step to the grassland behind, facing the island)
    const prof = [[360, -3], [372, 0.8], [382, 3], [392, 7.5], [405, 9], [470, 10.5], [700, 12]].map(([r, y]) => new THREE.Vector2(r, y));
    const shoreGeo = new THREE.LatheGeometry(prof, 120);
    const col = [];
    const sp = shoreGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i);
      const z = sp.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + Math.sin(a * 7) * 0.04 + Math.sin(a * 17 + 1) * 0.02;
      const y = sp.getY(i);
      sp.setXYZ(i, x * k, y * (1 + Math.sin(a * 5 + 2) * 0.35), z * k);
      // (the beach pale, the rock step red, the grassland behind green-gold)
      const r = Math.hypot(x, z);
      const c = r < 376 ? [0.86, 0.78, 0.62] : r < 400 ? [0.72, 0.42, 0.28] : [0.45, 0.5, 0.25];
      col.push(...c);
    }
    shoreGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    shoreGeo.computeVertexNormals();
    const shoreMap = rockTex.map.clone();
    shoreMap.repeat.set(60, 0.6);
    const shore = new THREE.Mesh(shoreGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, map: shoreMap, vertexColors: true, side: THREE.DoubleSide }));
    hills.add(shore);
  } else {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(1400, 30, 120), new THREE.MeshStandardMaterial({ color: '#9a6a52', roughness: 1, map: ridgeMap }));
    ridge.position.set(0, -6, -380);
    hills.add(ridge);
  }
  group.add(hills);
  // ---- the air: mist drifting low over the water (patches you ride through), shafts of sun slanting down through the
  // canyon, and dust glinting in the light near you (not on the lowest quality)
  const airOn = air && quality.name !== 'low';
  const mistTex = (() => {
    const c = canvas(256, 128);
    const g = c.getContext('2d');
    let s = 31;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const x = 30 + rnd() * 196;
      const y = 40 + rnd() * 50;
      const r = 14 + rnd() * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.05 + rnd() * 0.08})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  })();
  const mistMat = bendMaterial(new THREE.MeshBasicMaterial({ map: mistTex, color: lin(L.haze), transparent: true, opacity: 0.55, depthWrite: false, fog: true }));
  const mistGeo = new THREE.PlaneGeometry(26, 7);
  const mists = [];
  if (airOn) {
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(mistGeo, mistMat.clone());
      m.frustumCulled = false;
      m.renderOrder = 3;
      group.add(m);
      mists.push({ m, slot: k, x: (k % 3 - 1) * 4, y: 1.4 + (k % 4) * 0.5, ph: k * 1.9 });
    }
  }
  const MIST_GAP = 70;
  const rayTex = (() => {
    // (a few soft bands side by side, so a shaft reads as light through air rather than a stripe; bright near the rim,
    // fading out before the water)
    const c = canvas(128, 256);
    const g = c.getContext('2d');
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let b = 0; b < 7; b++) {
      const mid = 20 + rnd() * 88;
      const w = 10 + rnd() * 26;
      const gr = g.createLinearGradient(mid - w, 0, mid + w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, `rgba(255,255,255,${0.25 + rnd() * 0.35})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(mid - w, 0, w * 2, 256);
    }
    g.globalCompositeOperation = 'destination-in';
    const fv = g.createLinearGradient(0, 0, 0, 256);
    fv.addColorStop(0, 'rgba(0,0,0,0)');
    fv.addColorStop(0.15, 'rgba(0,0,0,1)');
    fv.addColorStop(0.55, 'rgba(0,0,0,0.5)');
    fv.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fv;
    g.fillRect(0, 0, 128, 256);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  })();
  const rayMat = bendMaterial(new THREE.MeshBasicMaterial({ map: rayTex, color: lin(L.sun), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  const rays = [];
  if (airOn && L.sunI > 1.2) {
    // shafts of sun spilling over the left rim and slanting down across the canyon (steeper than the real low sun, so
    // they cross the shade instead of lying flat); each turned about its own length to face the rider's camera
    const top = new THREE.Vector3(sunDir.x, 1.8, sunDir.z * 0.4).normalize();   // (along the shaft, upwards)
    const camP = new THREE.Vector3(0, 5, 8);
    for (let k = 0; k < 6; k++) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(4 + (k % 3) * 2.5, 46), rayMat.clone());
      r.position.set(-3 + (k % 2) * 4 + k * 0.6, 15, -34 - k * 22);
      const zc = camP.clone().sub(r.position).normalize();
      const xa = new THREE.Vector3().crossVectors(top, zc).normalize();
      const za = new THREE.Vector3().crossVectors(xa, top);
      r.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xa, top, za));
      r.renderOrder = 4;
      r.frustumCulled = false;
      group.add(r);
      rays.push({ r, ph: k * 2.1, o: 0.14 + (k % 3) * 0.04 });
    }
  }
  const dustTex = (() => {
    const c = canvas(32, 32);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  })();
  const dustN = airOn && quality.name === 'high' ? 120 : airOn ? 50 : 0;
  const dustPos = new Float32Array(Math.max(1, dustN) * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ map: dustTex, color: lin(L.sun), size: 0.07, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  const dustSeed = [];
  for (let i = 0; i < dustN; i++) dustSeed.push([Math.random() * 18 - 9, Math.random() * 7 + 1, Math.random() * 30, Math.random() * 6.28]);
  if (dustN) group.add(dust);

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
  const night = L.stars > 0 && L.sunI < 1.5;
  const _yAxis = new THREE.Vector3(0, 1, 0);
  let poolTo = -1e6;
  /** The bank's distance from the middle at course z (it opens out into the lake, and the pool at the river's head). */
  const halfAt = (z) => {
    let k = Math.min(1, Math.max(0, (z - lake.from) / 40)) * (1 - Math.min(1, Math.max(0, (z - lake.to) / 30)));
    k = Math.max(k, 1 - Math.min(1, Math.max(0, (z - poolTo) / 40)));
    return BANK.half + (lakeHalf - BANK.half) * k * k * (3 - 2 * k);
  };

  /** How far the wall's foot on `side` stands from the river's middle at course metre z (m). */
  function footAt(side, z) {
    const slot = Math.floor(z / SEG_L);
    const i = ((slot % N_SEG) + N_SEG) % N_SEG;
    const line = cliffGeos[side][(i + (side > 0 ? 1 : 0)) % 3].userData.footLine;
    const b = Math.round(slot * SEG_L + SEG_L - z);
    return halfAt(z) + line[Math.min(SEG_L, Math.max(0, b))];
  }
  let rockClear = null;
  function update(dist, t, riderX = null) {
    water.uniforms.uT.value = t;
    rkClock.value = t;
    water.uniforms.uDist.value = dist;
    skyMat.uniforms.uT.value = t;
    fallMat.uniforms.uT.value = t;
    fallMistMat.opacity = 0.55 + Math.sin(t * 1.4) * 0.08;
    water.uniforms.uRider.value.set(riderX ?? 0, riderX === null ? -1e6 : dist);
    // the air: the mist patches lie at fixed places on the river (you ride through them), the sun's shafts breathe, the
    // dust drifts and swirls near you
    for (const ms of mists) {
      const first = Math.floor((dist - 30) / MIST_GAP);
      const slot = first + ((ms.slot - first) % mists.length + mists.length) % mists.length;
      const ahead = slot * MIST_GAP + (ms.slot % 3) * 17 - dist;
      ms.m.position.set(ms.x + Math.sin(t * 0.1 + ms.ph) * 2, ms.y, -ahead);
      // (thins out as it reaches you, so you ride through it without a hard edge)
      ms.m.material.opacity = 0.55 * Math.min(1, Math.max(0, (ahead - 1) / 14));
    }
    // (shafts only while the canyon walls stand round you: they fade as the lake opens, and the open water has none)
    const inCanyon = poolTo > 1e5 ? 0 : Math.min(1, Math.max(0, (lake.from - dist - 30) / 60));
    for (const rr of rays) {
      rr.r.visible = inCanyon > 0;
      rr.r.material.opacity = rr.o * inCanyon * (0.75 + Math.sin(t * 0.35 + rr.ph) * 0.25);
    }
    for (let i = 0; i < dustN; i++) {
      const [x0, y0, z0, ph] = dustSeed[i];
      dustPos[i * 3] = x0 + Math.sin(t * 0.3 + ph) * 1.2;
      dustPos[i * 3 + 1] = y0 + Math.sin(t * 0.5 + ph * 2) * 0.6;
      // (flowing past with the river: wraps round in front of you)
      // (never right at the lens, where a mote would be a big blob)
      const z = ((z0 - dist * 0.6) % 30 + 30) % 30;
      dustPos[i * 3 + 2] = -z - 3;
    }
    if (dustN) dustGeo.attributes.position.needsUpdate = true;
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
    let ti = 0;
    for (const s of segs) {
      const slot = first + ((s.i - first) % N_SEG + N_SEG) % N_SEG;
      const zc = slot * SEG_L + SEG_L / 2;   // course z of the piece's middle
      const ahead = zc - dist;
      // (the wall's shader opens it out and lowers it vertex by vertex; the things on it follow the same curve)
      s.m.position.set(s.side * BANK.half, 0, -ahead);
      const lowAt = (z) => (halfAt(z) - BANK.half) / (lakeHalf - BANK.half);   // (0 in the canyon, 1 at the lake)
      if (s.fall) s.fall.visible = Math.max(lowAt(zc - SEG_L / 2), lowAt(zc + SEG_L / 2)) < 0.02;
      for (const [u, sc, kk] of s.bushes) {
        const half = halfAt(zc + u);
        const hy = 1 - 0.78 * lowAt(zc + u);
        tmp.position.set(s.side * (half + 6.5 + kk * 3), (33 + kk * 2) * hy - sc * 0.4, -(ahead + u));
        tmp.scale.set(sc * 1.4, sc, sc * 1.4);
        tmp.rotation.set(kk, kk * 3, 0);
        tmp.updateMatrix();
        bushes.setMatrixAt(bi++, tmp.matrix);
      }
      for (const [u, th, kk] of s.trees) {
        const half = halfAt(zc + u);
        const by = (34 + kk * 2) * (1 - 0.78 * lowAt(zc + u));
        tmp.position.set(s.side * (half + 9 + kk * 6), by - 0.6, -(ahead + u));
        tmp.rotation.set(0.05 * (kk - 0.5), kk * 6, 0.12 * (kk - 0.5));
        const tw = (3.2 + kk * 2.4) * 0.32;   // (the limbs reach out under the canopy)
        tmp.scale.set(tw, th, tw);
        tmp.updateMatrix();
        trunks.setMatrixAt(ti, tmp.matrix);
        tmp.position.y = by - 0.6 + th;
        tmp.rotation.set(0, kk * 9, 0);
        const cw = 3.2 + kk * 2.4;
        tmp.scale.set(cw, cw * 0.9, cw * (0.8 + kk * 0.3));
        tmp.updateMatrix();
        crowns.setMatrixAt(ti++, tmp.matrix);
      }
      for (const [u, sc] of s.rocks) {
        const half = halfAt(zc + u);
        // (none on a stretch of bank kept clear for something riding along it: setRockClear)
        const k = rockClear?.(s.side, zc + u) ? 1e-4 : 1;
        tmp.position.set(s.side * (half - 0.3 - sc * 0.4), sc * 0.25 - 0.2, -(ahead + u));
        tmp.scale.set(sc * 1.3 * k, sc * 0.8 * k, sc * k);
        tmp.rotation.set(sc, u, 0);
        tmp.updateMatrix();
        boulders.setMatrixAt(ri++, tmp.matrix);
      }
    }
    bushes.instanceMatrix.needsUpdate = true;
    boulders.instanceMatrix.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
  }

  return {
    group, water, sun, update, halfAt, footAt, setRockClear: (fn) => { rockClear = fn; }, setShadowFocus, shadows, reflect, fxTint, stoneMat, night,
    /**
     * (28 Oct 2026, the owner's pick: ride through a waterfall) Water pouring across the whole river from the cliff tops:
     * one sheet of the walls' own falling water (the same streaks, white where it lands, the fog, the river's bend), 30 m
     * across (its sides fade into the rock) and 34 m from the rims to the river. The ride places it (its z) and drops it
     * after (`dispose`: its shape; the material is the walls' and stays).
     */
    curtain() {
      const g = new THREE.Group();
      const geo = new THREE.PlaneGeometry(30, 34, 12, 24);
      geo.translate(0, 17, 0);
      const sheet = new THREE.Mesh(geo, curtainMat);
      sheet.renderOrder = 2;
      sheet.frustumCulled = false;   // (the bend moves it sideways in the shader: its box would cull it wrongly)
      g.add(sheet);
      g.userData.dispose = () => geo.dispose();
      return g;
    },
    /** Open water at the river's head, up to course z `to` (where your tower stands). */
    setPool(to) {
      poolTo = to;
      water.uniforms.uPoolTo.value = to;
      bankU.uPoolTo.value = to;
    },
    /** White water from course z `from` to `to`. */
    setRapids(from, to) {
      water.uniforms.uRapids.value.set(from, to);
    },
    /** The lanes' white-water seams: between the lanes at ±`div` m, along their outer edges at ±`outer` m (`k` 0 = none). */
    setLanes(div, outer, k = 1) {
      water.uniforms.uLanes.value.set(div, outer, k);
    },
    /**
     * A night: the moon's path on the water turns with the camera (`yaw` rad, + = looking right), so the moonlit water
     * stays in the picture when the camera looks round at your island (no moon is drawn in the sky to give it away).
     */
    turnMoon(yaw) {
      if (!night) return;
      water.uniforms.uSun.value.copy(sunDir).applyAxisAngle(_yAxis, -yaw);
    },
    /**
     * His headlamp on the water (a night): from `pos` along `dir` (world), a cone `angle` rad wide (soft over the outer
     * `penumbra` share), in `color` (a THREE.Color, its strength in it; null = off).
     */
    setLamp(pos, dir, color, angle = 0.42, penumbra = 0.6) {
      const u = water.uniforms;
      if (!color) { u.uLampCol.value.setRGB(0, 0, 0); return; }
      u.uLampPos.value.copy(pos);
      u.uLampDir.value.copy(dir).normalize();
      u.uLampCol.value.copy(color);
      u.uLampCos.value.set(Math.cos(angle), Math.cos(angle * (1 - penumbra)));
    },
    /** The river opens into a lake from course z `from` (and narrows again after `to`). */
    setLake(from, to = 1e6) {
      lake = { from, to };
      water.uniforms.uLakeFrom.value = from;
      water.uniforms.uLakeTo.value = to;
      bankU.uLakeFrom.value = from;
      bankU.uLakeTo.value = to;
    },
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        o.geometry?.dispose?.();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) { m.map?.dispose?.(); m.bumpMap?.dispose?.(); m.dispose?.(); }
      });
      noise.dispose();
      envRT.dispose();
      reflRT?.dispose();
      sun.dispose();   // (its shadow map too)
      stoneMat.dispose();
      curtainMat.dispose();   // (28 Oct 2026: Afgly's falls)
      for (const x of [...cliffGeos[-1], ...cliffGeos[1], mistTex, rayTex, dustTex, fallPuff, mistGeo, mistMat, rayMat, dustGeo, dustMat, fallMistGeo, fallFoamGeo, fallMistMat, fallFoamMat]) x.dispose();
      scene.environment = null;
      scene.fog = null;
      renderer.toneMappingExposure = exposure;
    },
  };
}
