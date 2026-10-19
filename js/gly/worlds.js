// (1.19 3D) Glybaan's worlds. The owner (18 Oct 2026): "It feels a little bland ... I really need it to be exceptional", then
// "adjust the theme, the type of looks". Every 600 m the slide runs into another world, and everything turns with it in a
// couple of seconds: the slide's glaze and its glowing lines, its walls and rails, the light, the haze, the ground far below
// (the sunset sea, a jungle's canopy, rivers of lava, a field of ice, the stars) and the air (leaves, embers, snow,
// sparkles). Then round again. Going further means seeing something new.
import * as THREE from '../../lib/three.module.min.js';

/** (m) each world's length. */
export const WORLD_LEN = 600;
/** The worlds in order (names in text.js). Colours: the slide's glaze, its lines, walls, rails; the light; the haze. */
export const WORLDS = Object.freeze([
  // (the elemental look, 18 Oct 2026: a dark glossy slide in every world, its lines and kerbs the world's own light; 19 Oct,
  // the owner's picture: a twilight over a dark sea, so each world has its own sky (zen above, hor the haze on the horizon,
  // glow the pale light) and sea)
  { id: 'sononder', floor: '#151a30', line: '#2ff5dc', wall: '#0c0f1e', rail: '#3ff0dc', sky: '#a8b4d8', ground: '#2a3048', sun: '#ccd6f4', fog: '#46557f', zen: '#111c48', hor: '#6e7ab0', glow: '#e4ecff', sea: '#06122a', seaHi: '#142f58', below: 0, air: 0 },
  { id: 'oerwoud', floor: '#132219', line: '#9dff5a', wall: '#0a120c', rail: '#9dff5a', sky: '#b4f5a0', ground: '#102010', sun: '#e6ffd0', fog: '#1d3b2b', zen: '#04140c', hor: '#2c6a48', glow: '#dcffc4', sea: '#03140e', seaHi: '#0c3a26', below: 1, air: 1 },
  { id: 'vulkaan', floor: '#24120e', line: '#ff7a2a', wall: '#140806', rail: '#ff5a1a', sky: '#ff9a6a', ground: '#300c06', sun: '#ffb27a', fog: '#3e1610', zen: '#12040a', hor: '#8a2c1a', glow: '#ffbe80', sea: '#160604', seaHi: '#3a1206', below: 2, air: 2 },
  { id: 'ys', floor: '#1c2a3c', line: '#7fe3ff', wall: '#0f1822', rail: '#bff3ff', sky: '#d8f0ff', ground: '#34485c', sun: '#eef6ff', fog: '#4a6a8e', zen: '#0a1a33', hor: '#6390c0', glow: '#f0f8ff', sea: '#08203a', seaHi: '#1d4f7a', below: 3, air: 3 },
  { id: 'sterre', floor: '#1a1430', line: '#ff6bd6', wall: '#0b0818', rail: '#7af7ff', sky: '#8a7aff', ground: '#100820', sun: '#c8b8ff', fog: '#160e34', zen: '#02010a', hor: '#2c1a5c', glow: '#e4ccff', sea: '#06031a', seaHi: '#1a0f44', below: 4, air: 4 },
]);
/** The world at `d` metres (round and round) and how far into it (0-1). */
export const worldAt = (d) => ({ i: Math.floor(Math.max(0, d) / WORLD_LEN) % WORLDS.length, into: (Math.max(0, d) % WORLD_LEN) / WORLD_LEN });

const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.07 + 13.7; a *= 0.5; } return s / 0.875; }
// (F1, F2-F1 and the nearest cell's id)
vec3 cells(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; id = hash12(n + g); } else if (d < f2) { f2 = d; }
    }
  }
  return vec3(f1, f2 - f1, id);
}
`;
/** The ground far below: the sea (left to show), a jungle's canopy, lava, ice, the stars; two blended in a change. */
const BELOW_VERT = /* glsl */ `
varying vec2 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const BELOW_FRAG = /* glsl */ `
uniform float uT;
uniform float uA;
uniform float uB;
uniform float uMix;
uniform vec2 uScroll;
uniform vec2 uMid;
varying vec2 vW;
${NOISE}
uniform vec3 uMist;
vec4 below(float k, vec2 w) {
  // (19 Oct 2026, the owner's picture: mist lying on the sea and drifting; its colour the world's haze. The grounds that
  // were here, a jungle's canopy, lava, ice and the stars, were for a camera looking down on them from high up.)
  vec2 p = w * 0.03 + uScroll;
  float m = fbm(p * 1.6 + vec2(uT * 0.02, 0.0)) * 0.65 + fbm(p * 4.1 - vec2(0.0, uT * 0.03)) * 0.35;
  float a = smoothstep(0.38, 0.64, m) * 0.55 * smoothstep(340.0, 180.0, length(w - uMid));
  return vec4(uMist, a);
}
void main() {
  vec4 c = mix(below(uA, vW), below(uB, vW), uMix);
  gl_FragColor = c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** The air: leaves drifting down, embers rising, snow falling, sparkles; points carried up the slide with the world. */
const AIR_VERT = /* glsl */ `
attribute vec4 aP;   // x, height, z, phase
uniform float uT;
uniform float uOff;
uniform float uKind;
uniform float uPx;
varying float vA;
varying float vK;
void main() {
  float L = 64.0;
  float z = mod(aP.z + uOff, L) - (L - 14.0);
  float h = aP.y;
  float x = aP.x;
  if (uKind < 1.5) { h = mod(aP.y - uT * 1.4, 9.0) + 0.3; x += sin(uT * 1.7 + aP.w * 20.0) * 0.8; }
  else if (uKind < 2.5) { h = mod(aP.y + uT * 2.2, 9.0); x += sin(uT * 2.3 + aP.w * 13.0) * 0.4; }
  else if (uKind < 3.5) { h = mod(aP.y - uT * 2.0, 9.0) + 0.3; x += sin(uT * 1.1 + aP.w * 9.0) * 0.6; }
  else { h = aP.y + sin(uT * 0.8 + aP.w * 6.0) * 0.6; }
  vec4 mv = modelViewMatrix * vec4(x, h, z, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = uKind < 1.5 ? 0.32 : uKind < 2.5 ? 0.16 : uKind < 3.5 ? 0.2 : 0.18;
  gl_PointSize = size * uPx / -mv.z;
  vA = smoothstep(-(L - 14.0), -(L - 26.0), z) * (1.0 - smoothstep(6.0, 14.0, z));
  vK = aP.w;
}`;
const AIR_FRAG = /* glsl */ `
uniform float uKind;
uniform float uT;
uniform float uFade;
varying float vA;
varying float vK;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  vec3 col;
  float a;
  if (uKind < 1.5) {
    // a leaf: an oval, green to gold
    float leaf = 1.0 - smoothstep(0.32, 0.5, length(q * vec2(1.0, 1.9)));
    col = mix(vec3(0.3, 0.7, 0.2), vec3(0.9, 0.75, 0.2), vK);
    a = leaf;
  } else if (uKind < 2.5) {
    col = vec3(1.0, 0.5, 0.12) * 2.4;
    a = 1.0 - smoothstep(0.1, 0.5, d);
  } else if (uKind < 3.5) {
    col = vec3(1.0);
    a = 1.0 - smoothstep(0.25, 0.5, d);
  } else {
    col = mix(vec3(1.0, 0.6, 0.95), vec3(0.6, 0.9, 1.0), vK) * 1.8;
    a = (1.0 - smoothstep(0.05, 0.5, d)) * (0.6 + 0.4 * sin(uT * 5.0 + vK * 30.0));
  }
  gl_FragColor = vec4(col, a * vA * uFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * The worlds on the slide: `mats` the slide's own ({ floor, wall, rail, lamp }), `trk` the slide's group. `update(dt, d,
 * v, time, camera, height)` moves the air and the ground on, and turns the world as `d` crosses into the next; it returns
 * the index of a world just entered (for its moment on screen), else -1. `reset()` back to the first at once.
 */
export function createWorlds(scene, trk, mats) {
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  const sun = scene.children.find((o) => o.isDirectionalLight && o.castShadow);
  const C = (h) => new THREE.Color(h);
  const cols = WORLDS.map((w) => ({ floor: C(w.floor), line: C(w.line), wall: C(w.wall), rail: C(w.rail), sky: C(w.sky), ground: C(w.ground), sun: C(w.sun), fog: C(w.fog), zen: C(w.zen), hor: C(w.hor), glow: C(w.glow), sea: C(w.sea), seaHi: C(w.seaHi) }));
  // the ground below: a wide plane over the sea, its picture carried along with the slide
  const belowMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uB: { value: 0 }, uMix: { value: 0 }, uScroll: { value: new THREE.Vector2() }, uMist: { value: new THREE.Color() }, uMid: { value: new THREE.Vector2(trk.position.x, trk.position.z) } },
    vertexShader: BELOW_VERT, fragmentShader: BELOW_FRAG, transparent: true, depthWrite: false,
  });
  const below = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), belowMat);
  below.position.set(trk.position.x, 1.6, trk.position.z);   // (just over the sea's waves)
  below.renderOrder = -1;
  scene.add(below);
  const down = new THREE.Vector3(0, 0, -1).applyQuaternion(trk.quaternion);   // (the slide's way down, flat)
  const flow = new THREE.Vector2(down.x, down.z).normalize();
  // the air
  const N = 150;
  const aP = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) aP.set([(Math.random() - 0.5) * 22, Math.random() * 9, Math.random() * 64, Math.random()], i * 4);
  const airGeo = new THREE.BufferGeometry();
  airGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  airGeo.setAttribute('aP', new THREE.BufferAttribute(aP, 4));
  airGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, -20), 60);
  const airMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uOff: { value: 0 }, uKind: { value: 0 }, uPx: { value: 900 }, uFade: { value: 0 } },
    vertexShader: AIR_VERT, fragmentShader: AIR_FRAG, transparent: true, depthWrite: false,
  });
  const air = new THREE.Points(airGeo, airMat);
  air.renderOrder = 7;
  trk.add(air);

  let cur = 0;            // the world now
  let from = 0;           // (a change: from this one, `k` of the way)
  let k = 1;
  let shown = 0;          // (the air of this world; it fades out and in at a change)
  const mixC = (a, b, t, out) => out.copy(a).lerp(b, t);
  const white = new THREE.Color(1, 1, 1);
  function paint(t) {
    const A = cols[from];
    const B = cols[cur];
    mixC(A.floor, B.floor, t, mats.floor.color);
    mixC(A.line, B.line, t, mats.floor.emissive);
    mixC(A.wall, B.wall, t, mats.wall.color);
    mixC(A.rail, B.rail, t, mats.rail.color);
    mixC(A.rail, B.rail, t, mats.rail.emissive);
    mixC(A.rail, B.rail, t, mats.lamp.emissive);
    if (hemi) { mixC(A.sky, B.sky, t, hemi.color); mixC(A.ground, B.ground, t, hemi.groundColor); }
    if (sun) mixC(A.sun, B.sun, t, sun.color);
    if (scene.fog) mixC(A.fog, B.fog, t, scene.fog.color);
    mixC(A.fog, B.fog, t, belowMat.uniforms.uMist.value).lerp(white, 0.5);   // (the mist: the haze's colour, paler)
    // (the sky and the sea, sky.js)
    if (mats.sky) { mixC(A.zen, B.zen, t, mats.sky.uZen.value); mixC(A.hor, B.hor, t, mats.sky.uHor.value); mixC(A.glow, B.glow, t, mats.sky.uGlow.value); }
    if (mats.sea) { mixC(A.sea, B.sea, t, mats.sea.uDeep.value); mixC(A.seaHi, B.seaHi, t, mats.sea.uShallow.value); mixC(A.hor, B.hor, t, mats.sea.uHorizon.value).multiplyScalar(0.55); mixC(A.zen, B.zen, t, mats.sea.uZenith.value); }
    belowMat.uniforms.uA.value = WORLDS[from].below;
    belowMat.uniforms.uB.value = WORLDS[cur].below;
    belowMat.uniforms.uMix.value = t;
  }
  function reset() {
    cur = from = 0;
    k = 1;
    shown = 0;
    airMat.uniforms.uKind.value = WORLDS[0].air;
    airMat.uniforms.uFade.value = 0;
    paint(1);
  }
  reset();
  return {
    reset,
    get index() { return cur; },
    update(dt, d, v, time, camera, height) {
      let entered = -1;
      const w = worldAt(d).i;
      if (w !== cur) { from = cur; cur = w; k = 0; entered = w; }
      if (k < 1) { k = Math.min(1, k + dt / 2.4); paint(k * k * (3 - 2 * k)); }
      // the air: the old world's fades away, then the new one's comes
      const want = WORLDS[cur].air;
      if (shown !== want) {
        airMat.uniforms.uFade.value = Math.max(0, airMat.uniforms.uFade.value - dt * 1.5);
        if (airMat.uniforms.uFade.value <= 0) { shown = want; airMat.uniforms.uKind.value = want; }
      } else airMat.uniforms.uFade.value = Math.min(want ? 1 : 0, airMat.uniforms.uFade.value + dt * 0.8);
      airMat.uniforms.uT.value = time;
      airMat.uniforms.uOff.value += v * dt;
      airMat.uniforms.uPx.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
      belowMat.uniforms.uT.value = time;
      belowMat.uniforms.uScroll.value.addScaledVector(flow, v * dt * 0.045 * 0.35);   // (far below: it passes slower)
      return entered;
    },
  };
}
