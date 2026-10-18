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
  // (the elemental look, 18 Oct 2026: a dark glossy slide in every world, its lines and kerbs the world's own light)
  { id: 'sononder', floor: '#3a4462', line: '#22e3c8', wall: '#161a2a', rail: '#3ff0dc', sky: '#a796ff', ground: '#4a3040', sun: '#ffd2a1', fog: '#9a7fb8', below: 0, air: 0 },
  { id: 'oerwoud', floor: '#2c4334', line: '#9dff5a', wall: '#111c14', rail: '#9dff5a', sky: '#c4f5a8', ground: '#203018', sun: '#fff2c0', fog: '#5f8f5f', below: 1, air: 1 },
  { id: 'vulkaan', floor: '#43271f', line: '#ff7a2a', wall: '#170b08', rail: '#ff5a1a', sky: '#ff9a6a', ground: '#401008', sun: '#ff9a60', fog: '#6a2214', below: 2, air: 2 },
  { id: 'ys', floor: '#36495c', line: '#7fe3ff', wall: '#131d27', rail: '#bff3ff', sky: '#d8f0ff', ground: '#4a5a6a', sun: '#eef6ff', fog: '#a9c8e4', below: 3, air: 3 },
  { id: 'sterre', floor: '#332754', line: '#ff6bd6', wall: '#0d0a1c', rail: '#7af7ff', sky: '#8a7aff', ground: '#100820', sun: '#c0b0ff', fog: '#1d1440', below: 4, air: 4 },
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
varying vec2 vW;
${NOISE}
vec4 below(float k, vec2 w) {
  vec2 p = w * 0.045 + uScroll;
  if (k < 0.5) return vec4(0.0);
  if (k < 1.5) {
    // a jungle's canopy: round crowns of trees, lighter on top, deep shade between, a few in flower
    vec3 c = cells(p * 2.6);
    float crown = smoothstep(0.78, 0.1, c.x);
    float leafy = fbm(p * 15.0 + c.z * 7.0);
    vec3 leaf = mix(vec3(0.03, 0.16, 0.05), vec3(0.18, 0.46, 0.12), c.z);
    vec3 col = mix(vec3(0.004, 0.025, 0.01), leaf * (0.5 + 0.8 * leafy) * (0.4 + 0.6 * crown), crown);
    col += vec3(0.3, 0.45, 0.1) * smoothstep(0.6, 0.9, leafy) * crown * 0.35;   // (sunlit leaves)
    col += vec3(0.9, 0.35, 0.55) * step(0.93, c.z) * smoothstep(0.3, 0.0, c.x) * 0.7;
    return vec4(col, 1.0);
  }
  if (k < 2.5) {
    // rivers of lava between plates of dark crust, breathing
    vec3 c = cells(p * 1.2 + vec2(0.0, uT * 0.02));
    float river = 1.0 - smoothstep(0.0, 0.09, c.y);
    float heat = 0.65 + 0.35 * sin(uT * 1.6 + c.z * 6.28);
    vec3 col = mix(vec3(0.04, 0.015, 0.01), vec3(0.12, 0.04, 0.02), fbm(p * 5.0));
    col = mix(col, vec3(1.0, 0.36, 0.05) * (1.15 + 0.7 * heat), river);
    return vec4(col, 1.0);
  }
  if (k < 3.5) {
    // a field of ice and snow: pale drifts, blue cracks, glints
    vec3 c = cells(p * 1.4);
    float snow = fbm(p * 3.0);
    vec3 col = mix(vec3(0.62, 0.78, 0.92), vec3(0.93, 0.97, 1.0), snow);
    col = mix(col, vec3(0.3, 0.55, 0.85), (1.0 - smoothstep(0.0, 0.05, c.y)) * 0.8);
    col += vec3(1.0) * step(0.985, hash12(floor(p * 40.0))) * (0.5 + 0.5 * sin(uT * 4.0 + c.z * 30.0));
    return vec4(col, 1.0);
  }
  // the stars: deep space, a nebula's glow, stars twinkling
  float neb = fbm(p * 1.3 + vec2(uT * 0.01, 0.0));
  vec3 col = vec3(0.012, 0.008, 0.04) + vec3(0.22, 0.08, 0.38) * neb * neb + vec3(0.05, 0.12, 0.3) * fbm(p * 2.7 + 5.0) * 0.6;
  vec2 g = floor(p * 26.0);
  float star = step(0.975, hash12(g)) * (0.55 + 0.45 * sin(uT * 3.0 + hash12(g + 7.0) * 40.0));
  col += vec3(0.9, 0.9, 1.0) * star * smoothstep(0.5, 0.1, length(fract(p * 26.0) - 0.5));
  return vec4(col, 1.0);
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
  const cols = WORLDS.map((w) => ({ floor: C(w.floor), line: C(w.line), wall: C(w.wall), rail: C(w.rail), sky: C(w.sky), ground: C(w.ground), sun: C(w.sun), fog: C(w.fog) }));
  // the ground below: a wide plane over the sea, its picture carried along with the slide
  const belowMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uB: { value: 0 }, uMix: { value: 0 }, uScroll: { value: new THREE.Vector2() } },
    vertexShader: BELOW_VERT, fragmentShader: BELOW_FRAG, transparent: true, depthWrite: false,
  });
  const below = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), belowMat);
  below.position.set(trk.position.x, 3, trk.position.z);   // (over the sea's waves)
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
