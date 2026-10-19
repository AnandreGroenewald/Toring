// (1.19 3D) Glybaan's sky and sea. The owner (19 Oct 2026), of the game beside the picture he chose: "it doesnt look close
// to that image". The picture is a twilight over the sea: deep blue above, a violet haze on the horizon, a pale light high on
// the right with soft rays, a few first stars, a dark sea with the haze lying on it. Block Clash's sunset sky and sea are
// re-coloured to it here, and each world (worlds.js) mixes in its own colours.
import * as THREE from '../../lib/three.module.min.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uZen;
uniform vec3 uHor;
uniform vec3 uGlow;
uniform vec3 uGlowDir;
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  // the gradient: the haze on the horizon up to the deep blue
  // (the camera looks low: the sky in sight is only the lowest 12 degrees, so the deep blue comes quickly)
  vec3 col = mix(uHor, uZen, pow(clamp(y / 0.14, 0.0, 1.0), 0.8));
  col = mix(col, uHor * 1.6, smoothstep(0.05, 0.0, abs(y - 0.01)) * 0.6);
  col = mix(col, uHor * 0.7, smoothstep(0.0, -0.1, y));
  // the pale light: a small bright heart, a wide soft halo
  float g = max(dot(d, uGlowDir), 0.0);
  // (the sky in sight is only ~24 degrees across: the light falls off within a few)
  col += uGlow * (pow(g, 900.0) * 1.6 + pow(g, 90.0) * 0.38 + pow(g, 18.0) * 0.06);
  // its rays: soft streaks fanning out of it
  vec3 sx = normalize(cross(uGlowDir, vec3(0.0, 1.0, 0.0)));
  vec3 sy = cross(sx, uGlowDir);
  float a = atan(dot(d, sy), dot(d, sx));
  float rays = (0.5 + 0.5 * sin(a * 17.0 + 0.6 * sin(a * 5.0))) * (0.55 + 0.45 * sin(a * 7.0 + 1.7));
  col += uGlow * rays * pow(g, 40.0) * 0.42;   // (the rays in the top right, the deep blue elsewhere)
  // the first stars, high up
  vec2 cell = floor(vec2(atan(d.z, d.x) * 160.0, y * 260.0));
  col += vec3(0.75, 0.8, 1.0) * step(0.9965, h21(cell)) * smoothstep(0.3, 0.75, y) * 0.5;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** The sky's material (its colours are uniforms, mixed by worlds.js at a change of world). */
export function skyMaterial(glowDir) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      uZen: { value: new THREE.Color('#0e1640') },
      uHor: { value: new THREE.Color('#5c5a9e') },
      uGlow: { value: new THREE.Color('#c9d4ff') },
      uGlowDir: { value: glowDir.clone().normalize() },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
  });
}

/**
 * Turns Block Clash's world into Glybaan's twilight: the sky (its material swapped), the light the shiny things reflect, the
 * sea's colours, the haze and the lights. `glowDir` is where the pale light hangs (world space). Returns the sky's and the
 * sea's uniforms for the worlds to colour.
 */
export function twilight(stage, world, glowDir) {
  const { scene, renderer } = stage;
  const old = scene.children.find((o) => o.isMesh && o.material?.isShaderMaterial && o.material.side === THREE.BackSide && o.geometry?.parameters?.radius >= 1000);
  const mat = skyMaterial(glowDir);
  if (old) { old.material.dispose(); old.material = mat; }
  // (what glossy things reflect: the twilight sky itself)
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial(glowDir)));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment?.dispose?.();
  scene.environment = pmrem.fromScene(env, 0.02).texture;
  scene.environmentIntensity = 1.0;
  // (the picture is a bright twilight: a little more light through the lens)
  renderer.toneMappingExposure = 1.1;
  pmrem.dispose();
  // the haze lies on the far sea and wraps the far end of the slide
  scene.fog = new THREE.Fog(new THREE.Color('#46557f'), 40, 390);
  const u = world.sea.uniforms;
  u.uDeep.value.set('#04102a');
  u.uShallow.value.set('#0d2c55');
  u.uHorizon.value.set('#2a2a5a');
  u.uZenith.value.set('#0b1236');
  u.uSunCol.value.set('#7f8cc0');
  u.uAmp.value = 0.6;   // (a calmer sea under the haze)
  u.uSunDir.value.copy(glowDir).normalize();
  u.uFogNear.value = 50;
  u.uFogFar.value = 470;
  u.uFog.value = scene.fog.color;
  // the light: cool, from high over the camera's right, so what comes at him is lit from the front
  world.sun.intensity = 2.2;
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  if (hemi) hemi.intensity = 0.9;
  return { sky: mat.uniforms, sea: u };
}
