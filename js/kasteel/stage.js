// (1.17 3D) Die Kasteelreeks: the stage — the renderer, the camera, and the finish over every frame: a soft glow where
// the light is strongest (the low sun, torches, steel), a gentle grade and vignette, smooth edges (multisampled), and a
// phone-shaped page on a wide screen. `render()` draws a frame; `shake(k)` jolts the camera a moment.
import * as THREE from '../../lib/three.module.min.js';
import { EffectComposer } from '../../lib/three-addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../lib/three-addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../lib/three-addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../../lib/three-addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../../lib/three-addons/postprocessing/OutputPass.js';
import { PREFS } from './text.js';

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

/**
 * Quality (the owner: "optomised for phones, it should not lag"). A Mac or PC draws everything; a phone starts at `mid`
 * and the stage steps down by itself if frames come slow (a three-second average under 45 fps): the glow and its finish
 * passes go first (the edges stay smooth: the screen's own anti-aliasing), then the pixel density, then the shadow's
 * detail. It climbs back (never above where it started) once frames have run smooth for nine seconds: one heavy
 * moment no longer leaves the picture soft for good (the owner, 17 Oct 2026: "once the water goes over it pixelates").
 * `?q=high|mid|low` forces one.
 */
export const QUALITY = {
  high: { name: 'high', dpr: 2, post: true, shadow: 4096, soft: true, grass: 1, looks: 2 },
  mid: { name: 'mid', dpr: 1.5, post: false, shadow: 2048, soft: false, grass: 0.55, looks: 1 },
  low: { name: 'low', dpr: 1.15, post: false, shadow: 1024, soft: false, grass: 0.3, looks: 1 },
};
const ORDER = ['high', 'mid', 'low'];
export function pickQuality() {
  const forced = new URLSearchParams(location.search).get('q');
  if (QUALITY[forced]) return { ...QUALITY[forced], forced: true };
  const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
  return { ...QUALITY[phone ? 'mid' : 'high'] };
}

export function createStage({ fov = 50, quality = pickQuality(), canvas = document.getElementById('k-canvas'), stageEl = document.getElementById('k-stage') } = {}) {
  const size = () => [stageEl.clientWidth || window.innerWidth, stageEl.clientHeight || window.innerHeight];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const q = quality;
  const prOf = () => Math.min(window.devicePixelRatio || 1, q.dpr);
  renderer.setPixelRatio(prOf());
  renderer.setSize(...size(), false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.info.autoReset = false;   // (one frame's totals over every pass)
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, size()[0] / size()[1], 0.5, 4000);
  scene.add(camera);
  let composer = null;
  let bloom = null;
  function buildPost() {
    composer?.dispose?.();
    composer = null;
    bloom = null;
    stageEl.classList.toggle('k-vignette', !q.post);   // (without the finish passes, a vignette drawn by the page)
    if (!q.post) return;
    const [w, h] = size();
    const pr = prOf();
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
  buildPost();
  // stepping down when frames come slow, back up when they run smooth again (slowly: no flicker between levels)
  const listeners = [];
  const best = { ...q };   // (where it started: never above that)
  let winT = 0;
  let winN = 0;
  let calm = 0;
  let upT = 0;
  let ups = 0;
  function apply() {
    renderer.setPixelRatio(prOf());
    renderer.setSize(...size(), false);
    renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    buildPost();
    for (const f of listeners) f(q);
  }
  function stepDown() {
    const i = ORDER.indexOf(q.name);
    if (i >= 0 && i < ORDER.length - 1) {
      Object.assign(q, QUALITY[ORDER[i + 1]], { name: ORDER[i + 1] });
    } else if (q.dpr > 0.85) {
      q.dpr = Math.max(0.85, q.dpr - 0.15);
    } else return false;
    apply();
    return true;
  }
  function stepUp() {
    const i = ORDER.indexOf(q.name);
    const bi = ORDER.indexOf(best.name);
    const levelDpr = i === bi ? best.dpr : QUALITY[q.name].dpr;
    if (q.dpr < levelDpr - 0.01) q.dpr = Math.min(levelDpr, q.dpr + 0.15);   // (the sharpness back first)
    else if (i > bi) Object.assign(q, i - 1 === bi ? best : QUALITY[ORDER[i - 1]], { name: ORDER[i - 1] });
    else return false;
    apply();
    return true;
  }
  function watch(dt) {
    if (q.forced) return;
    if (calm > 0) { calm -= dt; return; }
    winT += dt;
    winN += 1;
    if (winT < 3) return;
    const fps = winN / winT;
    winT = 0;
    winN = 0;
    if (fps < 45) {
      upT = 0;
      if (stepDown()) calm = 2.5;   // (a moment to settle before it judges again)
    } else if (fps >= 57) {
      upT += 3;
      if (upT >= 9 && ups < 8 && stepUp()) { upT = 0; ups += 1; calm = 3; }
    } else upT = 0;
  }
  // the loading screen stays until the first frames are drawn (their shaders compiled behind it)
  let drawn = 0;
  function loaded() {
    const el = document.getElementById('k-load');
    if (!el) return;
    el.classList.add('is-gone');
    setTimeout(() => el.remove(), 500);
  }
  // a jolt: the camera's view shifts a little and settles
  let shakeK = 0;
  const off = new THREE.Vector3();
  const api = {
    renderer, scene, camera, size, quality: q,
    get composer() { return composer; },
    get bloom() { return bloom; },
    /** (fn(q) when the quality steps down: the world can thin its grass, the light its shadow) */
    onQuality(fn) { listeners.push(fn); },
    shake(k) { if (!PREFS.reducedMotion) shakeK = Math.max(shakeK, k); },   // (less motion, Stapel's Instellings: no jolts)
    /**
     * Compiles every shader of the scene (and of `extra`, things that only come later: a stone, a ram) while the loading
     * screen still shows, in parallel where the phone can: no stall on the first frame or the first throw.
     */
    async warm(extra = []) {
      const g = new THREE.Group();
      for (const o of extra) g.add(o);
      scene.add(g);
      try { await renderer.compileAsync(scene, camera); } catch { /* compiled on the first frame instead */ }
      scene.remove(g);
    },
    render(dt = 1 / 60) {
      watch(dt);
      if (shakeK > 0.002) {
        off.set((Math.random() - 0.5) * shakeK, (Math.random() - 0.5) * shakeK, (Math.random() - 0.5) * shakeK * 0.5);
        camera.position.add(off);
        camera.updateMatrixWorld();
        shakeK *= Math.exp(-dt * 7);
      } else off.set(0, 0, 0);
      renderer.info.reset();
      if (composer) composer.render(); else renderer.render(scene, camera);
      if (off.lengthSq()) { camera.position.sub(off); camera.updateMatrixWorld(); }
      if (++drawn === 2) loaded();
    },
  };
  /** The stage's box changed size (a window's resize, or a stage shown again inside a page): fit the drawing to it. */
  api.resize = () => {
    const [w, h] = size();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(prOf()); composer.setSize(w, h); }
  };
  addEventListener('resize', api.resize);
  return api;
}
