// (1.17 3D) Die Kasteelreeks: the stage — the renderer, the camera, and the finish over every frame: a soft glow where
// the light is strongest (the low sun, torches, steel), a gentle grade and vignette, smooth edges (multisampled), and a
// phone-shaped page on a wide screen. `render()` draws a frame; `shake(k)` jolts the camera a moment.
import * as THREE from '../../lib/three.module.min.js';
import { EffectComposer } from '../../lib/three-addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../lib/three-addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../lib/three-addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../../lib/three-addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../../lib/three-addons/postprocessing/OutputPass.js';

const GRADE = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, sat: { value: 1.08 }, contrast: { value: 1.05 }, warm: { value: 0.03 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; uniform float sat; uniform float contrast; uniform float warm; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat);
      col = max(vec3(0.0), (col - 0.18) * contrast + 0.18);
      col *= vec3(1.0 + warm, 1.0, 1.0 - warm);
      vec2 d = (vUv - 0.5) * vec2(1.0, 0.8);
      col *= mix(1.0 - vignette, 1.0, smoothstep(0.78, 0.2, length(d)));
      gl_FragColor = vec4(col, c.a);
    }`,
};

export function createStage({ fov = 50, glow = true } = {}) {
  const canvas = document.getElementById('k-canvas');
  const stageEl = document.getElementById('k-stage');
  const size = () => [stageEl.clientWidth || window.innerWidth, stageEl.clientHeight || window.innerHeight];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(...size(), false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, size()[0] / size()[1], 0.1, 4000);
  scene.add(camera);
  let composer = null;
  let bloom = null;
  if (glow) {
    const [w, h] = size();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.55, 0.92);
    composer.addPass(bloom);
    composer.addPass(new ShaderPass(GRADE));
    composer.addPass(new OutputPass());
  }
  // a jolt: the camera's view shifts a little and settles
  let shakeK = 0;
  const off = new THREE.Vector3();
  const api = {
    renderer, scene, camera, composer, bloom, size,
    shake(k) { shakeK = Math.max(shakeK, k); },
    render(dt = 1 / 60) {
      if (shakeK > 0.002) {
        off.set((Math.random() - 0.5) * shakeK, (Math.random() - 0.5) * shakeK, (Math.random() - 0.5) * shakeK * 0.5);
        camera.position.add(off);
        camera.updateMatrixWorld();
        shakeK *= Math.exp(-dt * 7);
      } else off.set(0, 0, 0);
      if (composer) composer.render(); else renderer.render(scene, camera);
      if (off.lengthSq()) { camera.position.sub(off); camera.updateMatrixWorld(); }
    },
  };
  addEventListener('resize', () => {
    const [w, h] = size();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
  });
  return api;
}
