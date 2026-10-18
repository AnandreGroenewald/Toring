// (1.19 3D) Glybaan's runners. The owner (18 Oct 2026): "maybe we should forget about the blocks here and make it small men
// that runs, fire man, Water man, and earth man, I really need you to make this exceptional". A little round elemental man
// with big eyes that blink and a determined brow: he runs (legs and arms swinging, a bob, leaning in), jumps (knees up,
// arms up), slides (feet first, leaning back), leans into a lane change, and tumbles when a run ends. Vuurman: lava skin
// glowing in its cracks, flames for hair. Waterman: glossy water with a rim of light, a curling wave on his head, drops
// circling him. Aardman: mossy earth, leaves and a flower growing from his head. Built from simple shapes (no model
// files): each is one group the game moves; `update` poses him every frame.
import * as THREE from '../../lib/three.module.min.js';
import { flameMesh } from './hazards.js';

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
  for (let i = 0; i < 48; i++) {
    let x = r() * 256;
    let y = r() * 256;
    g.strokeStyle = r() < 0.3 ? '#ffe08a' : '#ff9a3a';
    g.lineWidth = 1.5 + r() * 3;
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
function skinOf(element) {
  if (element === 'vuur') return new THREE.MeshStandardMaterial({ color: '#3a1006', emissive: '#ff7a24', emissiveMap: lavaCracks(), emissiveIntensity: 2.4, roughness: 0.38, metalness: 0.08 });
  if (element === 'water') return rimLight(new THREE.MeshStandardMaterial({ color: '#2f9cff', emissive: '#1560c0', emissiveIntensity: 0.45, roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0.86, envMapIntensity: 1.8 }), '#bff4ff', 1.3);
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 });
}
/** The earth man's shapes: a little rocky (pushed in and out), grey stone with moss on what faces up. */
function earthy(g, r, amt = 0.06) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const earth = new THREE.Color('#8b8e94');
  const deep = new THREE.Color('#5c5f66');
  const moss = new THREE.Color('#6fb04a');
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
export function createRunner(element) {
  const r = rand(element === 'vuur' ? 3 : element === 'water' ? 5 : 9);
  const earth = element === 'gras';
  const skin = skinOf(element);
  const accent = new THREE.MeshStandardMaterial({ color: element === 'vuur' ? '#1c0b06' : element === 'water' ? '#0e4f9e' : '#4a4d52', roughness: 0.7, flatShading: earth });
  const geo = (g, amt) => (earth ? earthy(g, r, amt) : g);
  const seg = earth ? [12, 9] : [24, 18];
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = HIP;
  root.add(body);
  // the body: round and a little squat; a lighter belly
  const torso = mesh(geo(new THREE.SphereGeometry(0.44, ...seg), 0.04), skin);
  torso.position.y = 0.44;
  torso.scale.set(1, 1.1, 0.88);
  body.add(torso);
  // the head: big (he's little), tilted up to look at you
  const head = new THREE.Group();
  head.position.y = 1.12;
  head.rotation.x = 0.22;
  head.scale.setScalar(1.1);   // (a collectible toy's big head)
  body.add(head);
  head.add(mesh(geo(new THREE.SphereGeometry(0.53, ...seg), 0.05), skin));
  // eyes that blink, pupils with a glint, a determined brow, a little smile
  const white = new THREE.MeshBasicMaterial({ color: element === 'vuur' ? '#fff1c2' : '#ffffff' });
  const black = new THREE.MeshBasicMaterial({ color: '#141018' });
  const eyes = new THREE.Group();
  head.add(eyes);
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.2, 0.08, -0.45);
    eye.rotation.y = s * -0.28;
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), white);
    w.scale.set(1, 1.18, 0.6);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.078, 14, 10), black);
    pupil.position.set(-s * 0.012, 0.012, -0.075);
    pupil.scale.set(1, 1.15, 0.6);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), white);
    glint.position.set(-s * 0.03 - 0.02, 0.05, -0.12);
    eye.add(w, pupil, glint);
    eyes.add(eye);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.15, 3, 8), black);
    brow.position.set(s * 0.21, 0.29, -0.43);
    brow.rotation.set(0.1, s * -0.3, Math.PI / 2 + s * 0.32);
    head.add(brow);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 14, Math.PI), black);
  smile.position.set(0, -0.15, -0.49);
  smile.rotation.set(0.25, 0, Math.PI);
  head.add(smile);
  // arms (swinging from the shoulders) with round hands, legs (from the hips) with round feet
  const limb = (side, y, len, rad, hand) => {
    const pivot = new THREE.Group();
    pivot.position.set(side, y, 0);
    const arm = mesh(geo(new THREE.CapsuleGeometry(rad, len, 4, earth ? 7 : 12), 0.02), skin);
    arm.position.y = -(len / 2 + rad * 0.6);
    const end = mesh(geo(new THREE.SphereGeometry(hand, earth ? 8 : 14, earth ? 6 : 10), 0.02), accent);
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
  // his element on his head
  const crest = new THREE.Group();
  head.add(crest);
  const orbit = [];
  const sway = [];
  if (element === 'vuur') {
    // (a big flame crest)
    crest.add(flameMesh([
      { at: [0, 0.36, 0.06], info: [0.5, 1.85, r(), 0] },
      { at: [-0.26, 0.3, 0.12], info: [0.34, 1.2, r(), -0.14] },
      { at: [0.26, 0.3, 0.12], info: [0.34, 1.25, r(), 0.14] },
      { at: [0, 0.26, 0.3], info: [0.38, 1.1, r(), 0] },
    ]));
  } else if (element === 'water') {
    // (his head runs up into a drop's point)
    const tip = mesh(new THREE.ConeGeometry(0.36, 0.78, 24, 1, true), skin);
    tip.position.set(0, 0.74, 0.04);
    crest.add(tip);
    for (let i = 0; i < 3; i++) {
      const d = mesh(new THREE.SphereGeometry(0.075, 12, 8), skin);
      d.userData.a = (i / 3) * Math.PI * 2;
      head.add(d);
      orbit.push(d);
    }
  } else {
    // (a crown of glowing leaves)
    const green = new THREE.MeshStandardMaterial({ color: '#8dff8a', emissive: '#3dff6a', emissiveIntensity: 1.1, roughness: 0.4, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = new THREE.Mesh(leafGeo(0.4 + (i % 2) * 0.1), green);
      leaf.position.set(Math.cos(a) * 0.34, 0.44, Math.sin(a) * 0.34);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.set(-0.35, -a + Math.PI / 2, 0);
      crest.add(leaf);
      sway.push(leaf);
    }
  }

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
    sway.forEach((leaf, i) => { leaf.rotation.x = -0.35 + Math.sin(t * (mode === 'run' ? 9 : 2.4) + i * 1.7) * (mode === 'run' ? 0.28 : 0.1); });
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
      const man = createRunner(el);
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
