// (1.19 3D) Glybaan, Stapel's downhill runner. The owner (18 Oct 2026): Block Clash "Its not working ... The gameplay will
// be a slide going downwards and also it needs to be four lanes"; then "can't we make it that it slides from top to bottom"
// (a camera at 70° towards him), bags of coins in your own element, the menu's coins, nature instead of blocks ("a
// whirlpool, Waterfalls, Fire and Lava"), and "forget about the blocks here and make it small men that runs, fire man, Water
// man, and earth man ... make it so good that I will not change ONE THING!".
// Your little elemental man runs down a slide high over the sea, always faster: swipe ⟵ ⟶ for a lane, tap (or swipe ⬆) to
// jump, swipe ⬇ to slide, tap the ✨ to clear your view. The rules (elements, barriers, the track) are in rules.js, the men
// in runner.js, the hazards in hazards.js, the effects in fx.js; the sky, sea and sun are Block Clash's world.
import * as THREE from '../../lib/three.module.min.js';
import { createStage } from '../kasteel/stage.js';
import { buildWorld, SUN_DIR } from '../botsing/world.js';
import { createRunFx } from './fx.js';
import { createHazards, VARIANTS, fieldMat, rockPillar } from './hazards.js';
import { createRunner, portraits } from './runner.js';
import { createWorlds, WORLDS } from './worlds.js';
import { audio, haptics } from '../audio.js';
import { fmtInt } from '../core/format.js';
import { EARN } from '../core/economy.js';
import { dateKeyFor } from '../core/daily.js';
import { T, PREFS, goBack, EMOJI } from './text.js';
import { LANES, LANE_W, ELEMENTS, JUMP, SLIDE, laneX, moveLane, effectOf, speedAt, createTrack, killerOf, victimOf, runXp, MISSIONS, newMission, cleanMissions, levelOf, levelReward } from './rules.js';

// (the slide runs from the top of the screen to the bottom, the camera looking back up it: a lane's place across the slide
// is mirrored so lane 0 is still on the left of the screen and a swipe right goes right)
const LX = (l) => -laneX(l);
const q = new URLSearchParams(location.search);
const calm = PREFS.reducedMotion;
audio.setEnabled(PREFS.sound);
haptics.setEnabled(PREFS.vibration);
const sfx = (n, o) => { try { audio.play(n, o); } catch { /* sound off */ } };
const buzz = (k) => { try { haptics[k]?.(); } catch { /* no haptics */ } };
const metres = (d) => `${fmtInt(Math.floor(d))} m`;

// ------------------------------------------------------------------------------------------- the player's own things
// (their Living Tower tribe as the first man; the slide's own record)
const STORE_KEY = 'stapel.v1.gly';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const econ = read('stapel.v1.econ') || {};
const saved = read(STORE_KEY) || {};
let element = [q.get('el'), saved.element, econ?.tribes?.wear].find((e) => ELEMENTS.includes(e)) || 'water';
let best = Math.max(0, Number(saved.best) || 0);
// (merged into what's kept: the coins still on their way to the wallet stay)
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...(read(STORE_KEY) || {}), element, best })); } catch { /* private window */ } };
/**
 * A run's coins for Stapel's wallet (the owner, 18 Oct 2026, of paying them like the castle's: "Yes please"): they wait in
 * the slide's record (`pending`) until Stapel adds them when it opens (js/main.js claimPending: one place keeps the
 * wallet), no more than today's cap leaves (Oefen's 150, the wallet's own count less what already waits). Returns
 * { coins (what will land), capped }.
 */
function payCoins(n) {
  if (n <= 0) return { coins: 0, capped: false };
  const v = read(STORE_KEY) || {};
  const pending = Math.max(0, v.pending | 0);
  const e = read('stapel.v1.econ');
  const earned = e?.earned?.day === dateKeyFor() ? Math.max(0, e.earned.n | 0) : 0;
  const coins = Math.max(0, Math.min(n, EARN.dayCap - earned - pending));
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...v, element, best, pending: Math.min(5000, pending + coins) })); } catch { return { coins: 0, capped: false }; }
  return { coins, capped: coins < n };
}

// ------------------------------------------------------------------------------------------- missions and levels
/** What the slide keeps besides the record: all your XP, the missions done, and the three missions now. */
const prog = (() => {
  const mdone = Math.max(0, Math.min(1e6, saved.mdone | 0));
  return { xp: Math.max(0, Math.min(1e9, Math.floor(Number(saved.xp) || 0))), mdone, missions: cleanMissions(saved.missions, Math.random, mdone) };
})();
/** Into the slide's record, merged (what else it keeps stays). */
const keep = (patch) => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...(read(STORE_KEY) || {}), ...patch })); } catch { /* private window */ } };
keep({ missions: prog.missions, level: levelOf(prog.xp).level });
/** A mission's or a level's coins: into `pending` whole (Stapel pays what today's cap allows when it opens, and keeps the
 *  rest for the next time: js/main.js claimPending). */
function reward(n) {
  keep({ pending: Math.min(5000, Math.max(0, (read(STORE_KEY) || {}).pending | 0) + n) });
}

// ------------------------------------------------------------------------------------------- the stage and the world
const stage = createStage({ fov: 60 });
const { scene, camera, renderer } = stage;
const stageEl = document.getElementById('k-stage');
const world = buildWorld(stage, { stacks: false, isles: [[0, -999, 0], [0, -999, 0]] });
const fx = createRunFx(scene);

// the slide: high over the sea, running down and away from the low sun
const SLOPE = 0.2;           // (rad) its fall, about 11°
const BEHIND = 26;           // (m) slide drawn behind the runner
const LEN = 230;             // (m) slide drawn in all
const AHEAD = 150;           // (m) rows come this far ahead
const WIDTH = LANES * LANE_W;
const trk = new THREE.Group();
const sunH = new THREE.Vector3(SUN_DIR.x, 0, SUN_DIR.z).normalize();
const fwd = sunH.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.85);
trk.rotation.set(-SLOPE, Math.atan2(-fwd.x, -fwd.z), 0, 'YXZ');
trk.position.set(0, 34, 0);
scene.add(trk);

/** The slide's floor: four lanes of glaze, glowing lines between them, cross marks that rush past (drawn in grey and white:
 *  each world tints the glaze and its lines, worlds.js). */
function floorTextures() {
  const W = 512;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const lane = W / LANES;
  for (let i = 0; i < LANES; i++) {
    const grd = g.createLinearGradient(i * lane, 0, (i + 1) * lane, 0);
    grd.addColorStop(0, '#8a8a8a'); grd.addColorStop(0.5, i % 2 ? '#ececec' : '#ffffff'); grd.addColorStop(1, '#8a8a8a');
    g.fillStyle = grd;
    g.fillRect(i * lane, 0, lane, H);
  }
  // cross marks every quarter (speed: they rush at you)
  g.fillStyle = 'rgba(255,255,255,0.07)';
  for (let y = 0; y < H; y += H / 4) g.fillRect(0, y, W, 10);
  const e = document.createElement('canvas');
  e.width = W; e.height = H;
  const ge = e.getContext('2d');
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  // the lane lines (dashed) and the slide's edges (solid), only these glow
  for (let i = 0; i <= LANES; i++) {
    const x = i * lane;
    const edge = i === 0 || i === LANES;
    ge.fillStyle = '#ffffff';
    if (edge) ge.fillRect(x - (i ? 12 : 0), 0, 12, H);
    else for (let y = 0; y < H; y += 128) ge.fillRect(x - 4, y, 8, 84);
  }
  const map = new THREE.CanvasTexture(c);
  const emi = new THREE.CanvasTexture(e);
  for (const t of [map, emi]) {
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, LEN / WIDTH);
    t.anisotropy = 4;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  emi.colorSpace = THREE.SRGBColorSpace;
  return { map, emi };
}
const floorTex = floorTextures();
const floorMat = new THREE.MeshStandardMaterial({ map: floorTex.map, emissive: '#ffffff', emissiveMap: floorTex.emi, emissiveIntensity: 0.9, roughness: 0.32, metalness: 0.15 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, LEN), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, BEHIND - LEN / 2);
floor.receiveShadow = true;
trk.add(floor);
// the side walls with a glowing rail along their tops, and the slide's underside (it hangs in the air)
const wallMat = new THREE.MeshStandardMaterial({ color: '#241a44', roughness: 0.45, metalness: 0.35 });
const railMat = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff9d2e', emissiveIntensity: 1.6, roughness: 0.4 });
for (const s of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, LEN), wallMat);
  wall.position.set(s * (WIDTH / 2 + 0.25), 0.55, BEHIND - LEN / 2);
  wall.castShadow = wall.receiveShadow = true;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, LEN), railMat);
  rail.position.set(s * (WIDTH / 2 + 0.25), 1.36, BEHIND - LEN / 2);
  trk.add(wall, rail);
}
const under = new THREE.Mesh(new THREE.BoxGeometry(WIDTH + 1, 0.9, LEN), wallMat);
under.position.set(0, -0.46, BEHIND - LEN / 2);
trk.add(under);
// lamps on the rails and the struts under the slide, rushing past (one draw each)
const LAMP_SP = 9;
const LAMPS = Math.ceil(LEN / LAMP_SP) + 1;
const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3d1', emissive: '#ffd27a', emissiveIntensity: 2.2 });
const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), lampMat, LAMPS * 2);
const STRUT_SP = 36;
const STRUTS = Math.ceil(LEN / STRUT_SP) + 1;
const struts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.9, 60, 8), wallMat, STRUTS * 2);
lamps.frustumCulled = struts.frustumCulled = false;
trk.add(lamps, struts);
/** The worlds (worlds.js): every 600 m another, the slide, the light, the ground below and the air turning with it. */
const worlds = createWorlds(scene, trk, { floor: floorMat, wall: wallMat, rail: railMat, lamp: lampMat });
const m4 = new THREE.Matrix4();
const v3 = new THREE.Vector3();
const qId = new THREE.Quaternion();
const one = new THREE.Vector3(1, 1, 1);
const strutQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), SLOPE);   // (plumb in the world)
const STRUT_HALF = 30;
function rushPast(d) {
  const b = d % LAMP_SP;
  for (let k = 0; k < LAMPS; k++) {
    const z = BEHIND - (k * LAMP_SP - b);
    for (const s of [0, 1]) lamps.setMatrixAt(k * 2 + s, m4.compose(v3.set((s ? 1 : -1) * (WIDTH / 2 + 0.25), 1.68, z), qId, one));
  }
  lamps.instanceMatrix.needsUpdate = true;
  const bs = d % STRUT_SP;
  for (let k = 0; k < STRUTS; k++) {
    const z = BEHIND - (k * STRUT_SP - bs);
    // (straight down in the world: the slide leans, its struts don't; their middle half their length below the slide)
    for (const s of [0, 1]) struts.setMatrixAt(k * 2 + s, m4.compose(v3.set((s ? 1 : -1) * (WIDTH / 2 - 0.6), -0.9 - STRUT_HALF * Math.cos(SLOPE), z - STRUT_HALF * Math.sin(SLOPE)), strutQ, one));
  }
  struts.instanceMatrix.needsUpdate = true;
  floorTex.map.offset.y = floorTex.emi.offset.y = (d / WIDTH) % 1;
}

/** Your best so far: a line of gold across the slide where it lies, its distance over it. Pass it: a new record. */
const bestMark = (() => {
  const g = new THREE.Group();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH + 1, 0.45).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.95, depthWrite: false }));
  line.position.y = 0.05;
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH + 1, 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  haze.position.y = 0.04;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  label.scale.set(6.4, 1.6, 1);
  label.position.set(0, 1.7, 0);
  label.renderOrder = 6;
  g.add(haze, line, label);
  g.visible = false;
  trk.add(g);
  return {
    g,
    text(t) {
      const x = c.getContext('2d');
      x.clearRect(0, 0, 512, 128);
      x.font = '900 70px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.lineWidth = 12;
      x.strokeStyle = 'rgba(60, 30, 0, 0.85)';
      x.strokeText(t, 256, 66);
      x.fillStyle = '#ffe27a';
      x.fillText(t, 256, 66);
      tex.needsUpdate = true;
    },
  };
})();

/** Speed lines: thin streaks of light rushing up the slide (most along its walls), more and brighter the faster it goes. */
const STREAKS = 46;
const streaks = (() => {
  const a = new Float32Array(STREAKS * 8);
  for (let i = 0; i < STREAKS; i++) {
    const wall = Math.random() < 0.65;
    const x = wall ? (Math.random() < 0.5 ? -1 : 1) * (WIDTH / 2 - 0.15 - Math.random() * 0.35) : (Math.random() - 0.5) * (WIDTH - 1.5);
    const y = wall ? 0.35 + Math.random() * 1.3 : 3 + Math.random() * 4;
    const ph = Math.random();
    const len = 4 + Math.random() * 7;
    a.set([x, y, ph, 0, x, y, ph, len], i * 8);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(a, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, -25), 90);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOff: { value: 0 }, uK: { value: 0 } },
    vertexShader: `attribute vec4 aS; uniform float uOff; varying float vA;
      void main() {
        float L = 75.0;
        float z = mod(aS.z * L + uOff, L) - (L - 16.0);
        vA = smoothstep(-(L - 16.0), -(L - 34.0), z) * (1.0 - smoothstep(4.0, 16.0, z)) * (aS.w > 0.0 ? 0.0 : 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(aS.x, aS.y, z - aS.w, 1.0);
      }`,
    fragmentShader: `uniform float uK; varying float vA;
      void main() { gl_FragColor = vec4(vec3(0.78, 0.92, 1.0) * 1.5, vA * uK);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(geo, mat);
  trk.add(lines);
  return mat;
})();

// ------------------------------------------------------------------------------------------- the runner and the things
/** Your man (runner.js), made again when you pick another; a soft shadow under him that stays on the slide as he jumps. */
let runner = null;
const MAN = 1.5;   // (his size on the slide: the hero of the picture, still well inside his lane)
function makeRunner() {
  if (runner) { trk.remove(runner.root); runner.dispose(); }
  runner = createRunner(element);
  runner.root.scale.setScalar(MAN);
  trk.add(runner.root);
}
const shadow = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.renderOrder = 1;
  trk.add(m);
  return m;
})();
// (the camera sees the tops of things, where the low sunset sun only grazes: a soft light from over the camera's shoulder)
const fill = new THREE.DirectionalLight('#fff0dc', 1.15);
fill.position.set(0, 60, -45);
trk.add(fill, fill.target);
/** A hazard: a piece of its element's nature (hazards.js: a whirlpool or a waterfall, a fire pit or lava, thorny vines, a
 *  boulder), with a ring on the floor in what it does to you. */
const hz = createHazards();
const HZ_SCALE = 0.9;   // (a lane is 2,5 m: each hazard a little inside it)
/** What a hazard does to you, at a glance: red ends the run, amber clouds your view, green is yours (safe). */
const EFFECT_COL = { kill: '#ff3b30', blind: '#ffe14a', safe: '#3fdc6a' };
/** The ✨'s halo: the sparkle on a soft dark disc. */
function itemHaloMat() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('✨', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: t, depthWrite: false, fog: true });
}
// (true colours on the blue floor: drawn over it, not added to it; just inside the lane, so two side by side don't meet)
const ringGeo = new THREE.RingGeometry(1.2, 1.32, 48).rotateX(-Math.PI / 2);
const ringMats = Object.fromEntries(Object.entries(EFFECT_COL).map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false })]));
const pools = new Map();
/** A hazard's look: water lies low as a whirlpool or stands as a waterfall, fire as lava or a fire; vines; a boulder. */
const lookOf = (type, low) => (type === 'water' ? (low ? 'whirl' : 'fall') : type === 'vuur' ? (low ? 'lava' : 'fire') : VARIANTS[type]?.[0] || 'rock');
function hazardMesh(type, look) {
  const key = `${type}:${look}`;
  let g = pools.get(key)?.pop();
  if (!g) {
    g = hz.make(type, look);
    const ring = new THREE.Mesh(ringGeo, ringMats.kill);
    ring.position.y = 0.03;
    ring.renderOrder = 2;
    g.add(ring);
    g.userData.ring = ring;
    g.userData.key = key;
  }
  g.userData.ring.material = ringMats[effectOf(element, type)];
  g.scale.setScalar(HZ_SCALE);
  g.visible = true;
  trk.add(g);
  return g;
}
function freeHazard(g) {
  trk.remove(g);
  const key = g.userData.key;
  if (!pools.has(key)) pools.set(key, []);
  pools.get(key).push(g);
}
/** (the owner, 18 Oct: "can you make it the same look as the coins in the menu") Stapel's own gold coin (css .coin-ic): a
 *  gold face, a darker ring, a gleam and the star. */
function coinTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const disc = (r, fill) => { g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  disc(60, '#ffd23f');
  disc(36, '#f0b41a');
  disc(30, '#ffe25c');
  g.lineWidth = 5;
  g.strokeStyle = '#c98d07';
  g.beginPath(); g.arc(64, 64, 57.5, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 6;
  g.strokeStyle = '#b67b00';
  g.beginPath(); g.arc(64, 64, 55, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  const gl = g.createRadialGradient(44, 36, 0, 44, 36, 38);
  gl.addColorStop(0, 'rgba(255,251,224,1)'); gl.addColorStop(0.3, 'rgba(255,251,224,0.5)'); gl.addColorStop(1, 'rgba(255,251,224,0)');
  disc(60, gl);
  g.font = '900 64px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff2a8';
  g.fillText('★', 64, 70);
  g.fillStyle = '#d39500';
  g.fillText('★', 64, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const coinMat = new THREE.SpriteMaterial({ map: coinTexture(), depthWrite: false, fog: true });
const coinPool = [];
const coinMesh = () => { const m = coinPool.pop() || new THREE.Sprite(coinMat); m.scale.set(1.2, 1.2, 1); trk.add(m); m.visible = true; return m; };
const freeCoin = (m) => { trk.remove(m); coinPool.push(m); };
const itemMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshStandardMaterial({ color: '#bff7ff', emissive: '#58e6ff', emissiveIntensity: 2.4, roughness: 0.2 }));
const itemHalo = new THREE.Sprite(itemHaloMat());
itemHalo.scale.set(1.9, 1.9, 1);
itemMesh.add(itemHalo);

/** Arrows painted on the slide before a beam: up (jump: swipe up), or down (slide: swipe down), one a lane. */
function arrowTexture(up, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.strokeStyle = color;
  g.lineWidth = 16;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = color;
  g.shadowBlur = 14;
  for (let i = 0; i < LANES; i++) {
    const x = (i + 0.5) * (512 / LANES);
    for (const k of [0, 1]) {
      const y = up ? 58 + k * 48 : 102 - k * 48;
      g.beginPath();
      g.moveTo(x - 34, up ? y + 26 : y - 26);
      g.lineTo(x, y);
      g.lineTo(x + 34, up ? y + 26 : y - 26);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ARROWS = {
  low: new THREE.MeshBasicMaterial({ map: arrowTexture(true, '#ffc04d'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  high: new THREE.MeshBasicMaterial({ map: arrowTexture(false, '#62e6ff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
};
// (the plane turned so its picture's top points up the slide: up the screen)
const arrowGeo = new THREE.PlaneGeometry(WIDTH, 2.8).rotateX(-Math.PI / 2).rotateY(Math.PI);
const gateEdgeMat = new THREE.MeshStandardMaterial({ color: '#fff4cf', emissive: '#ffd36b', emissiveIntensity: 3 });
const lowEdgeMat = new THREE.MeshStandardMaterial({ color: '#fff0c8', emissive: '#ffb02e', emissiveIntensity: 3 });
const highEdgeMat = new THREE.MeshStandardMaterial({ color: '#d8fbff', emissive: '#3fd8ff', emissiveIntensity: 3 });
const gateGlowMat = new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
/**
 * A barrier across the slide, a field of shimmering light between rocks: a low amber beam to jump (arrows up before it), a
 * high cyan one on two pillars to slide under (arrows down), or a violet wall with a gold-lit gap to run through. It
 * flashes as you pass (gold for a perfect one).
 */
function makeBarrier(row) {
  const g = new THREE.Group();
  const x0 = -WIDTH / 2 - 0.45;
  const x1 = WIDTH / 2 + 0.45;
  const D = 0.7;
  const kind = row.kind === 'wall' ? 'wall' : row.bar;
  const field = kind === 'low' ? fieldMat({ deep: '#7a3a06', glow: '#ffc04d', bot: 0, top: 1.1 }) : kind === 'high' ? fieldMat({ deep: '#064a6a', glow: '#62e6ff', bot: 1.7, top: 3.3 }) : fieldMat({ deep: '#3d1a99', glow: '#b38cff', bot: 0, top: 5.2 });
  const box = (a, b, y0, y1) => {
    if (b - a < 0.01) return;
    const o = new THREE.Mesh(new THREE.BoxGeometry(b - a, y1 - y0, D).translate((a + b) / 2, (y0 + y1) / 2, 0), field);
    o.renderOrder = 3;
    g.add(o);
  };
  const edge = (a, b, y0, y1, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(b - a, y1 - y0, 0.12), m); o.position.set((a + b) / 2, (y0 + y1) / 2, -D / 2 - 0.06); g.add(o); };
  const pillars = (h) => { for (const [i, x] of [[0, x0 - 0.25], [1, x1 + 0.25]]) { const p = rockPillar(i, h); p.position.set(x, 0, 0); g.add(p); } };
  if (kind === 'low') {
    box(x0, x1, 0, 1.1);
    edge(x0, x1, 1.02, 1.14, lowEdgeMat);
    pillars(1.5);
  } else if (kind === 'high') {
    box(x0, x1, 1.7, 3.3);
    edge(x0, x1, 1.66, 1.78, highEdgeMat);
    pillars(3.6);
  } else {
    const hx0 = LX(row.gap) - LANE_W / 2;
    const hx1 = LX(row.gap) + LANE_W / 2;
    box(x0, hx0, 0, 5.2);
    box(hx1, x1, 0, 5.2);
    edge(hx0 - 0.2, hx0, 0, 5.2, gateEdgeMat);
    edge(hx1, hx1 + 0.2, 0, 5.2, gateEdgeMat);
    pillars(5.6);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(hx1 - hx0, 6).rotateX(-Math.PI / 2), gateGlowMat);
    glow.position.set((hx0 + hx1) / 2, 0.03, 3);
    g.add(glow);
  }
  if (kind !== 'wall') {
    const arrows = new THREE.Mesh(arrowGeo, ARROWS[kind]);
    arrows.position.set(0, 0.05, 4.2);
    arrows.renderOrder = 2;
    g.add(arrows);
  }
  g.userData = { field, flashAt: -9, flashK: 0 };
  trk.add(g);
  return g;
}
function freeBarrier(g) {
  trk.remove(g);
  g.traverse((o) => { if (o.isMesh && !o.geometry.userData.shared && o.geometry !== arrowGeo) o.geometry.dispose(); });
  g.userData.field?.dispose();
}

// ------------------------------------------------------------------------------------------- the screen
const hud = document.getElementById('k-hud');
hud.classList.add('bt', 'gl');
hud.innerHTML = `
  <div class="gl-top"><b class="gl-m">0&nbsp;m</b><span class="gl-sub"><span class="gl-best"></span><span class="gl-kmh"></span></span></div>
  <div class="gl-side"><span class="gl-coins"><i class="coin-ic" role="img" aria-label="🪙"></i><b>0</b></span><button class="gl-item" type="button" aria-label="${T.itemBtn}">✨</button></div>
  <div class="gl-blind" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="bt-flash" aria-hidden="true"></div>
  <div class="bt-banner" aria-live="polite"><b></b><span></span></div>
  <div class="bt-callouts"></div>
  <div class="gl-bag" aria-hidden="true"><i>💰</i><b></b></div>
  <div class="bt-corner"><button class="bt-back" type="button" aria-label="Stapel">‹</button><button class="bt-pause" type="button" aria-label="${T.paused}"><i></i><i></i></button></div>
  <div class="bt-modal" hidden></div>`;
const $ = (s) => hud.querySelector(s);
const el = { m: $('.gl-m'), best: $('.gl-best'), coins: $('.gl-coins'), coinsN: $('.gl-coins b'), kmh: $('.gl-kmh'), item: $('.gl-item'), blind: $('.gl-blind'), flash: $('.bt-flash'), banner: $('.bt-banner'), callouts: $('.bt-callouts'), bag: $('.gl-bag'), bagN: $('.gl-bag b'), modal: $('.bt-modal') };
hud.classList.toggle('is-calm', calm);
let bannerT = null;
function banner(text, { sub = '', kind = '', ms = 1400 } = {}) {
  el.banner.querySelector('b').textContent = text;
  el.banner.querySelector('span').textContent = sub;
  el.banner.className = `bt-banner is-on ${kind}`;
  clearTimeout(bannerT);
  bannerT = setTimeout(() => el.banner.classList.remove('is-on'), ms);
}
const toScreen = (local) => {
  const p = trk.localToWorld(local.clone()).project(camera);
  return { x: (p.x * 0.5 + 0.5) * stageEl.clientWidth, y: (-p.y * 0.5 + 0.5) * stageEl.clientHeight };
};
function callout(text, local, kind = 'is-gold') {
  const s = toScreen(local);
  const c = document.createElement('div');
  c.className = 'bt-cow';
  c.innerHTML = `<div class="bt-co ${kind}">${text}</div>`;
  c.style.transform = `translate(${Math.round(Math.max(70, Math.min(stageEl.clientWidth - 70, s.x)))}px, ${Math.round(Math.max(120, s.y))}px)`;
  el.callouts.append(c);
  setTimeout(() => c.remove(), 1300);
}
/**
 * A bag of coins, the owner's surprise (Jarvis for him: "the 💰 and the +6 big enough and long enough to see at speed, with
 * a sound and a small shake, and make sure two bags in a row don't stack into a mess"): one big 💰 and its coins over the
 * man for a second and a half; a bag while it shows adds to it.
 */
let bagT = null;
let bagSum = 0;
function popBag(n, local) {
  const s = toScreen(local);
  bagSum = el.bag.classList.contains('is-on') ? bagSum + n : n;
  el.bagN.textContent = `+${fmtInt(bagSum)}`;
  el.bag.style.left = `${Math.round(Math.max(80, Math.min(stageEl.clientWidth - 80, s.x)))}px`;
  el.bag.style.top = `${Math.round(Math.max(150, s.y - 24))}px`;   // (over the man and above him: what comes stays in sight)
  el.bag.classList.remove('is-on');
  void el.bag.offsetWidth;   // (its pop starts again)
  el.bag.classList.add('is-on');
  clearTimeout(bagT);
  bagT = setTimeout(() => el.bag.classList.remove('is-on'), 1600);
}
/** A coin picked up flies to the counter (which counts it when it lands, and jumps). */
const flyers = [];
let inFlight = 0;
function flyCoin(from) {
  let f = flyers.find((x) => !x.busy);
  if (!f) {
    if (flyers.length >= 12) return;
    f = { e: document.createElement('i'), busy: false, t: null };
    f.e.className = 'coin-ic gl-fly';
    hud.append(f.e);
    flyers.push(f);
  }
  const hb = hud.getBoundingClientRect();
  const cb = el.coins.getBoundingClientRect();
  f.busy = true;
  inFlight++;
  f.e.style.transition = 'none';
  f.e.style.opacity = '1';
  f.e.style.transform = `translate(${Math.round(from.x)}px, ${Math.round(from.y)}px) scale(1.25)`;
  void f.e.offsetWidth;   // (from where it was picked up)
  f.e.style.transition = 'transform 0.5s cubic-bezier(0.55, 0, 0.75, 0.6)';
  f.e.style.transform = `translate(${Math.round(cb.left - hb.left + 18)}px, ${Math.round(cb.top - hb.top + cb.height / 2)}px) scale(0.75)`;
  f.t = setTimeout(() => {
    f.busy = false;
    f.e.style.opacity = '0';
    inFlight = Math.max(0, inFlight - 1);
    el.coins.classList.remove('is-bump');
    void el.coins.offsetWidth;
    el.coins.classList.add('is-bump');
  }, 500);
}
function clearFlyers() {
  for (const f of flyers) { clearTimeout(f.t); f.busy = false; f.e.style.opacity = '0'; }
  inFlight = 0;
}
function clearBag() {
  clearTimeout(bagT);
  bagSum = 0;
  el.bag.classList.remove('is-on');
}
function flash(color, ms = 160) {
  if (calm) return;
  el.flash.style.background = color;
  el.flash.style.transition = 'none';
  el.flash.style.opacity = '0.55';
  requestAnimationFrame(() => { el.flash.style.transition = `opacity ${ms}ms`; el.flash.style.opacity = '0'; });
}
function modal(html, handlers = {}) {
  el.modal.innerHTML = html;
  el.modal.hidden = false;
  requestAnimationFrame(() => el.modal.classList.add('is-on'));
  for (const [sel, fn] of Object.entries(handlers)) for (const b of el.modal.querySelectorAll(sel)) b.addEventListener('click', (e) => fn(e));
}
const closeModal = () => { el.modal.classList.remove('is-on'); el.modal.hidden = true; el.modal.innerHTML = ''; };
const modalOpen = () => !el.modal.hidden;

// ------------------------------------------------------------------------------------------- the run
const G = {
  state: 'start',            // start | run | dying | over (| show: pictures)
  paused: false,
  d: 0, v: 0, t: 0, timeScale: 1,
  lane: 1, x: LX(1), xv: 0, tumble: null,
  jumpT: -1, slideT: -1, slideAfter: false,   // (time into a jump or a slide; a slide asked for in the air comes on landing)
  coins: 0, bars: 0, perfects: 0, jumps: 0, bags: 0, closes: 0, holding: false,
  blindUntil: 0, blindKind: '',
  why: null, nextSpeedUp: 500,
  runs: 0, inputAt: 0, movedAt: 0, recordAt: 0, coinRun: 0, coinAt: -9, settled: false, missionsDone: [], mcheck: 0,
};
let track = null;
let pending = null;   // the next row, not yet on the slide
const rows = [];

/** How high he is (m): a jump's arc. */
const airH = () => (G.jumpT >= 0 ? 4 * JUMP.height * (G.jumpT / JUMP.time) * (1 - G.jumpT / JUMP.time) : 0);

function resetRunner() {
  G.lane = 1;
  G.x = LX(1);
  G.xv = 0;
  G.tumble = null;
  G.jumpT = G.slideT = -1;
  G.slideAfter = false;
  if (!runner) makeRunner();
  runner.root.position.set(G.x, 0, 0);
  runner.root.rotation.set(0, 0, 0);
  runner.root.visible = true;
}
function clearRows() {
  for (const r of rows) dropRow(r);
  rows.length = 0;
  if (itemMesh.parent) trk.remove(itemMesh);
}
/** The music's key in each world (A, D, E, F, C minor); its band grows with the run, its tempo with the speed. */
const KEYS = [57, 62, 52, 65, 60];
const musicNow = () => ({ bpm: 112 + (G.v - 15) * 1.1, layers: G.d < 120 ? 0 : G.d < 400 ? 1 : G.d < 900 ? 2 : 3, key: KEYS[worlds.index] });
/** Into a new world: its name, a flash of its colour, a fanfare. */
function worldMoment(i) {
  const n = Math.floor(G.d / 600) + 1;
  banner(T.world(n), { sub: T.worldName(WORLDS[i].id), kind: 'is-gold', ms: 2300 });
  flash(WORLDS[i].line, 420);
  sfx('record');
  buzz('perfect');
}
function startRun() {
  closeModal();
  worlds.reset();
  clearRows();
  G.runs++;
  G.state = 'run';
  G.paused = false;
  G.d = 0; G.t = 0; G.timeScale = 1;
  G.coins = 0; G.bars = 0; G.perfects = 0; G.jumps = 0; G.holding = false; G.bags = 0; G.closes = 0;
  G.settled = false; G.missionsDone = []; G.mcheck = 0;
  G.blindUntil = 0; G.why = null; G.nextSpeedUp = 500; G.recordAt = 0; G.coinRun = 0; G.coinAt = -9;
  G.inputAt = performance.now() + 350;   // (GLY! tapped twice: its second tap never makes him jump)
  el.blind.classList.remove('is-on');
  clearBag();
  clearFlyers();
  resetRunner();
  const seed = Number(q.get('seed')) ? Number(q.get('seed')) + G.runs - 1 : Math.floor(Math.random() * 1e9);
  track = createTrack(seed, { element });
  pending = track.next();
  if (best) bestMark.text(T.bestMark(metres(best)));
  hud.classList.add('is-running');
  sfx('horn');
  G.v = speedAt(0);
  try { audio.music(true, musicNow()); } catch { /* music is optional */ }
}

/** A row comes onto the slide: its things from the pools. */
function addRow(row) {
  const r = { ...row, cells: row.cells.map((c) => ({ ...c, mesh: hazardMesh(c.type, c.look || lookOf(c.type, c.low)), done: false })), coins: row.coins.map((c) => ({ ...c, mesh: coinMesh(), done: false })), done: false };
  if (row.kind === 'bar' || row.kind === 'wall') r.barrier = makeBarrier(row);
  if (row.item) { r.item = { ...row.item, done: false }; trk.add(itemMesh); itemMesh.visible = true; }
  rows.push(r);
}
function dropRow(r) {
  for (const c of r.cells) freeHazard(c.mesh);
  for (const c of r.coins) freeCoin(c.mesh);
  if (r.barrier) freeBarrier(r.barrier);
  if (r.item && itemMesh.parent) trk.remove(itemMesh);
}

/** How far a thing he is past has sunk back into the slide (seen from high over him, what's behind him would otherwise
 *  slide up over the numbers at the top); what ended the run stays. */
const sunk = (s, after, rate) => Math.max(0, -s - after) * rate;
/** Where the things are this frame (they rise out of the slide as they come into view, and sink back once passed). */
function placeRows(time) {
  for (const r of rows) {
    const s = r.at - G.d;
    const rise = s > AHEAD - 28 ? Math.min(1, (s - (AHEAD - 28)) / 28) : 0;
    const y0 = -3.2 * rise;
    const down = r.hit ? 0 : sunk(s, 1.5, 4.5);
    for (const c of r.cells) c.mesh.position.set(LX(c.lane), y0 - down, -s);
    for (const c of r.coins) {
      const cs = c.at - G.d;
      // (coins in the air hang over something to jump: an arc over it)
      const h = c.high ? 2.1 + 0.9 * Math.max(0, 1 - Math.abs(c.at - r.at) / 3) : 1.25;
      c.mesh.position.set(LX(c.lane), h + y0 - sunk(cs, 1, 4) + Math.sin(time * 3 + cs) * 0.12, -cs);
      const pulse = 1.2 * (1 + 0.06 * Math.sin(time * 6 + cs));
      c.mesh.scale.set(pulse, pulse, 1);
    }
    // (a barrier sinks once it is clear of him, quickly: a wall stands five metres high)
    if (r.barrier) {
      r.barrier.position.set(0, y0 * 2.2 - (r.hit ? 0 : sunk(s, 1.4, 14)), -s);
      const gu = r.barrier.userData;
      gu.field.uniforms.uHit.value = gu.flashK * Math.max(0, 1 - (time - gu.flashAt) / 0.7);
    }
    if (r.item && !r.item.done) {
      const is = r.item.at - G.d;
      itemMesh.position.set(LX(r.item.lane), 1.5 + y0 - sunk(is, 1, 4) + Math.sin(time * 4) * 0.2, -is);
      itemMesh.rotation.y = time * 2;
      itemMesh.rotation.x = time * 1.3;
    }
  }
}

function step(dt) {
  G.t += dt;
  G.v = speedAt(G.d);
  G.d += G.v * dt;
  // a jump's arc and a slide run their time (a slide asked for in the air comes as he lands)
  if (G.jumpT >= 0 && (G.jumpT += dt) >= JUMP.time) {
    G.jumpT = -1;
    sfx('land');
    if (!calm) fx.puff(trk.localToWorld(v3.set(G.x, 0.2, 0.3)), 5, DUST[element], 1.2);
    if (G.slideAfter) { G.slideAfter = false; startSlide(); }
  }
  if (G.slideT >= 0 && (G.slideT += dt) >= SLIDE.time) G.slideT = -1;
  while (pending && pending.at < G.d + AHEAD) { addRow(pending); pending = track.next(); }
  const h = airH();
  // what he meets
  for (const r of rows) {
    for (const c of r.coins) {
      if (c.done || c.at - G.d > 0.4) continue;
      c.done = true;
      // (a coin in the air wants a jump; one on the slide is missed high in a jump)
      if (c.lane === G.lane && G.state === 'run' && (c.high ? h > 1.1 : h < 1.9)) {
        G.coins++;
        c.mesh.visible = false;
        // (a row of coins climbs the scale, a pling each)
        G.coinRun = G.t - G.coinAt < 0.6 ? G.coinRun + 1 : 0;
        G.coinAt = G.t;
        sfx('room', { n: G.coinRun });
        const cy = c.high ? 2.6 : 1.25;
        if (!calm) { fx.sparkle(trk.localToWorld(v3.set(LX(c.lane), cy, 0)), 8, '#ffd46a', 4); flyCoin(toScreen(v3.set(LX(c.lane), cy, 0))); }
      }
    }
    if (r.item && !r.item.done && r.item.at - G.d <= 0.4) {
      r.item.done = true;
      if (r.item.lane === G.lane && !G.holding) {
        G.holding = true;
        itemMesh.visible = false;
        sfx('rainbow');
        buzz('tap');
        callout(T.gotItem, new THREE.Vector3(LX(r.item.lane), 2.6, 0), 'is-gold');
      }
    }
    if (r.done || r.at - G.d > 0) continue;
    r.done = true;
    meet(r);
    if (G.state !== 'run') return;
  }
  // rows behind the camera go back to their pools
  while (rows.length && rows[0].at - G.d < -BEHIND + 2) dropRow(rows.shift());
  // a mission of this run reached: done at once, with its moment (and the music follows the run)
  if ((G.mcheck += dt) > 0.25) { G.mcheck = 0; missionsLive(); try { audio.musicSet(musicNow()); } catch { /* */ } }
  // past your best: the moment it happens
  if (best > 0 && !G.recordAt && G.d > best) {
    G.recordAt = G.d;
    banner(T.record, { kind: 'is-gold', ms: 1700 });
    sfx('record');
    buzz('perfect');
    if (!calm) fx.sparkle(trk.localToWorld(v3.set(G.x, 2.4, 0)), 44, '#ffe38c', 9);
  }
  // faster: a word on it now and then
  if (G.d >= G.nextSpeedUp) {
    G.nextSpeedUp += 500;
    banner(T.speedUp, { sub: T.speed(Math.round(G.v * 3.6)), kind: 'is-small', ms: 1100 });
    sfx('milestone');
  }
  if (G.blindUntil && G.t > G.blindUntil) { G.blindUntil = 0; el.blind.classList.remove('is-on'); }
}

/** A perfect timing: the row met in the middle of the jump or the slide (not just scraping through). */
const perfectNow = (act) => (act === 'jump' ? Math.abs(G.jumpT / JUMP.time - 0.5) < 0.2 : Math.abs(G.slideT / SLIDE.time - 0.5) < 0.25);
function perfectMoment(x) {
  G.perfects++;
  G.coins += 5;
  callout(T.perfect, new THREE.Vector3(x, 3.8, -1), 'is-gold');
  sfx('perfect', { combo: 3 });
  buzz('perfect');
  if (!calm) fx.sparkle(trk.localToWorld(v3.set(x, 2.2, -0.5)), 26, '#ffe38c', 7);
}
/** He meets a row: a barrier (the right move, or the gap), or what lies in his lane. */
function meet(r) {
  const h = airH();
  if (r.kind === 'bar' || r.kind === 'wall') {
    const ok = r.kind === 'wall' ? G.lane === r.gap : r.bar === 'low' ? h > 1.0 : G.slideT >= 0;
    if (!ok) { r.hit = true; die(r.kind === 'wall' ? 'wall' : r.bar); return; }
    G.bars++;
    const act = r.kind === 'wall' ? null : r.bar === 'low' ? 'jump' : 'slide';
    const perfect = act && perfectNow(act);
    if (r.barrier) { r.barrier.userData.flashAt = time; r.barrier.userData.flashK = perfect ? 1 : 0.5; }
    if (perfect) perfectMoment(G.x);
    else { callout(r.kind === 'wall' ? T.through : act === 'jump' ? T.overIt : T.under, new THREE.Vector3(G.x, 3.4, -1), 'is-small'); sfx('good'); }
    return;
  }
  const c = r.cells.find((x) => x.lane === G.lane && !x.done);
  if (c) {
    const eff = effectOf(element, c.type);
    const at = trk.localToWorld(v3.set(LX(c.lane), 1.2, 0)).clone();
    if (c.low && h > 0.9) {
      // over it (a whirlpool, lava): nothing touches him; a perfect jump pays
      c.done = true;
      G.jumps++;
      if (perfectNow('jump')) perfectMoment(G.x);
      else { callout(T.overIt, new THREE.Vector3(G.x, 3.4, -1), 'is-small'); sfx('good'); }
    } else if (eff === 'kill') {
      r.hit = true;
      die(c.type === 'stone' ? 'stone' : 'kill', c.type, c);
      return;
    } else if (eff === 'blind') {
      // (what you beat is gone: water puts the fire out, fire burns the vines to ash, the vines drink the water)
      c.done = true;
      c.mesh.visible = false;
      blind(c.type);
      if (!calm) { fx.puff(at, 18, PUFF[c.type], 3); fx.sparkle(at, 14, BLOCK_COL[c.type], 6); }
    } else if (c.bag) {
      // a bag of coins in your own element (the owner: "it might get coins, but its random")
      c.done = true;
      G.coins += c.bag;
      G.bags++;
      popBag(c.bag, new THREE.Vector3(LX(c.lane), 2.6, 0));
      sfx('gold');
      setTimeout(() => sfx('pop'), 110);
      buzz('perfect');
      stage.shake(0.18);
      if (!calm) fx.sparkle(at, 34, '#ffd46a', 8);
    } else {
      c.done = true;
      callout(T.safe, new THREE.Vector3(LX(c.lane), 3, -1), 'is-small');
      sfx('pop');
      if (!calm) fx.sparkle(at, 18, TRAIL_COL[element], 6);
    }
  }
  // (a close call: a lane over from what would have ended it, a moment after a swipe or a jump)
  if (performance.now() - G.movedAt < 450 && r.cells.some((x) => Math.abs(x.lane - G.lane) === 1 && effectOf(element, x.type) === 'kill')) {
    G.closes++;
    callout(T.close, new THREE.Vector3(G.x, 3.6, -1), 'is-gold');
    sfx('good');
    buzz('tap');
  }
}

const BLIND_KIND = { vuur: 'steam', gras: 'ash', water: 'vines' };
const PUFF = { vuur: '#f2f5f8', gras: '#5d5550', water: '#5fae45' };            // (steam, ash, leaves)
const BLOCK_COL = { stone: '#9a948a', vuur: '#ff7a2a', water: '#9fdcff', gras: '#6f9a3a' };
const DUST = { vuur: '#ffb27a', water: '#d8f4ff', gras: '#b9d89a' };
/** The bottom of the screen clouds over a while (steam, ash or vines); the ✨ clears it. */
function blind(type) {
  const kind = BLIND_KIND[type] || 'steam';
  G.blindUntil = G.t + 3.6;
  G.blindKind = kind;
  el.blind.dataset.kind = kind;
  el.blind.classList.add('is-on');
  banner(T.blinded[kind], { sub: G.holding ? T.item : '', kind: 'is-dmg', ms: 1200 });
  sfx(kind === 'steam' ? 'fog' : kind === 'ash' ? 'heat' : 'creak');
  buzz('heavy');
  stage.shake(0.25);
}
function useItem() {
  if (G.state !== 'run' || G.paused) return;
  if (!G.holding || !G.blindUntil) return;
  G.holding = false;
  G.blindUntil = 0;
  el.blind.classList.remove('is-on');
  banner(T.cleared, { kind: 'is-small', ms: 900 });
  sfx('rainbow');
  buzz('perfect');
  if (!calm) fx.sparkle(trk.localToWorld(v3.set(G.x, 2.4, 2)), 30, '#bff7ff', 8);
}

function die(why, type = null, cell = null) {
  G.state = 'dying';
  try { audio.music(false); } catch { /* */ }
  G.why = why === 'kill' ? T.overWhy.kill(type) : T.overWhy[why];
  G.timeScale = 0.35;
  const at = trk.localToWorld(v3.set(G.x, 1.4, -0.5)).clone();
  sfx('lost');
  buzz('heavy');
  stage.shake(calm ? 0 : 1.1);
  flash('#ff3b30', 260);
  if (!calm) {
    fx.chunks(at, 16, BLOCK_COL[type] || '#c9a27a', 10);
    if (type === 'vuur') fx.puff(at, 14, '#3a2a24', 4);
    else if (type === 'water') fx.sparkle(at, 30, '#9fdcff', 9);
    else if (type === 'gras') fx.puff(at, 10, '#5fae45', 3);
  }
  if (cell) cell.mesh.scale.setScalar(HZ_SCALE * 1.08);
  // he tumbles up and away over what he hit
  G.tumble = { vy: 9 + airH() * 0.5, vz: 4, spin: (Math.random() < 0.5 ? -1 : 1) * 7 };
  G.jumpT = G.slideT = -1;
  setTimeout(gameOver, calm ? 500 : 1300);
}
function gameOver() {
  G.state = 'over';
  G.timeScale = 1;
  hud.classList.remove('is-running');
  el.blind.classList.remove('is-on');
  const dist = Math.floor(G.d);
  const record = dist > best;
  if (record) { best = dist; save(); }
  const s = finishRun();
  const full = T.capHit.charAt(0).toUpperCase() + T.capHit.slice(1);
  const wallet = s.paid.coins ? `${T.toWallet(fmtInt(s.paid.coins))}${s.paid.capped ? ` · ${T.capHit}` : ''}` : G.coins ? full : '';
  const up = s.levels.reduce((a, l) => a + l.coins, 0);
  if (record || s.levels.length) sfx('record'); else sfx('gameover');
  modal(`<div class="bt-res gl-res"><small>${T.title}</small><h2>${record ? T.record : T.over}</h2>
    <p>${G.why || ''}</p><p class="gl-big">${T.slid(metres(dist))}</p>
    <dl><div><dt>${T.coins}</dt><dd>${fmtInt(G.coins)}</dd></div><div><dt>${T.bars}</dt><dd>${G.bars}</dd></div>
    <div><dt>${T.perfects}</dt><dd>${G.perfects}</dd></div><div><dt>${T.xp}</dt><dd>+${fmtInt(s.gained)}</dd></div></dl>
    ${wallet ? `<p class="gl-wallet"><i class="coin-ic" aria-hidden="true"></i> ${wallet}</p>` : ''}
    ${levelBar(s.after, s.before)}
    ${s.levels.length ? `<p class="gl-lvup">${T.levelUp(s.after.level)} <b>${T.plusCoins(fmtInt(up))}</b></p>` : ''}
    ${s.done.length ? missionRows(s.done, true) : ''}
    <p class="gl-lab">${T.missions}</p>${missionRows(prog.missions)}
    <button class="bt-again" type="button">${T.again}</button>
    <div class="gl-two"><button class="gl-change" type="button">${T.change}</button><button class="bt-home" type="button">${T.toStapel}</button></div></div>`, {
    // (straight back in with the same man; the start card to pick another)
    '.bt-again': () => { if (G.state !== 'over') return; sfx('click'); startRun(); },
    '.gl-change': () => { sfx('click'); showStart(); },
    '.bt-home': () => goBack(),
  });
  if (s.levels.length && !calm) fx.sparkle(trk.localToWorld(v3.set(G.x, 3, -2)), 44, '#ffe38c', 9);
}

const MICON = { coins: '<i class="coin-ic" aria-hidden="true"></i>', dist: '📏', bars: '🚧', perfects: '✨', jumps: '🦘', bags: '💰', close: '😮', total: '🏁', runs: '🔁' };
/** Missions as rows: what to do (over all runs: how far along), its coins; `done` ones ticked. */
function missionRows(list, done = false) {
  return `<ul class="gl-missions${done ? ' is-done' : ''}">${list.map((m) => `<li><i>${done ? '✓' : MICON[m.kind]}</i><span>${T.mission(m)}${!done && MISSIONS[m.kind].per === 'all' ? ` <em>${fmtInt(m.p)} / ${fmtInt(m.n)}</em>` : ''}</span><b>+${m.r}</b></li>`).join('')}</ul>`;
}
/** Your level and how far into it (from where a run began to where it ended: the bar fills). */
function levelBar(after, before = after) {
  const to = Math.round((after.into / after.need) * 100);
  const from = after.level > before.level ? 0 : Math.round((before.into / before.need) * 100);
  return `<div class="gl-level"><b>${T.level(after.level)}</b><span class="gl-bar"><i style="--from:${from}%;--to:${to}%"></i></span><small>${fmtInt(after.into)} / ${fmtInt(after.need)} XP</small></div>`;
}
/** Live: a mission of this run reached is done at once (its coins wait for the wallet), with its moment. */
function missionsLive() {
  const now = { coins: G.coins, dist: Math.floor(G.d), bars: G.bars, perfects: G.perfects, jumps: G.jumps, bags: G.bags, close: G.closes };
  for (const m of prog.missions) {
    if (!m.done && MISSIONS[m.kind].per === 'run' && now[m.kind] >= m.n) completeMission(m);
  }
}
function completeMission(m) {
  m.done = true;
  prog.mdone++;
  reward(m.r);
  G.missionsDone.push(m);
  keep({ missions: prog.missions, mdone: prog.mdone });
  if (G.state === 'run') {
    banner(T.missionDone, { sub: `${T.mission(m)} · ${T.plusCoins(m.r)}`, kind: 'is-gold', ms: 2000 });
    sfx('perfect', { combo: 4 });
    buzz('perfect');
  }
}
/**
 * A run ends (or is left halfway, from the pause card): its coins to the wallet, its XP (a level reached pays coins), the
 * missions over all runs counted, and new missions where they were done. Once a run. Returns what it brought.
 */
function finishRun() {
  if (G.settled) return null;
  G.settled = true;
  const paid = payCoins(G.coins);
  const before = levelOf(prog.xp);
  const gained = runXp({ d: G.d, bars: G.bars, perfects: G.perfects, jumps: G.jumps });
  prog.xp = Math.min(1e9, prog.xp + gained);
  const after = levelOf(prog.xp);
  const levels = [];
  for (let L = before.level + 1; L <= after.level; L++) { levels.push({ level: L, coins: levelReward(L) }); reward(levelReward(L)); }
  missionsLive();
  for (const m of prog.missions) {
    if (m.done || MISSIONS[m.kind].per !== 'all') continue;
    m.p = Math.min(m.n, m.p + (m.kind === 'total' ? Math.floor(G.d) : 1));
    if (m.p >= m.n) completeMission(m);
  }
  const next = prog.missions.map((m) => (m.done ? null : m));
  for (let i = 0; i < next.length; i++) if (!next[i]) next[i] = newMission(Math.random, next.filter(Boolean).map((x) => x.kind), prog.mdone);
  prog.missions = next;
  keep({ xp: prog.xp, level: after.level, missions: prog.missions, mdone: prog.mdone });
  return { paid, gained, before, after, levels, done: G.missionsDone.slice() };
}

// ------------------------------------------------------------------------------------------- the start card
let faces = { vuur: '', water: '', gras: '' };
function showStart() {
  G.state = 'start';
  worlds.reset();
  try { audio.music(false); } catch { /* */ }
  clearBag();
  clearFlyers();
  clearRows();
  resetRunner();
  hud.classList.remove('is-running');
  el.blind.classList.remove('is-on');
  const kill = killerOf(element);
  const blindEl = victimOf(element);
  const manBtn = (e) => `<button type="button" class="gl-pick gl-man${e === element ? ' is-on' : ''}" data-el="${e}">${faces[e] ? `<img src="${faces[e]}" alt="">` : `<span>${EMOJI[e]}</span>`}<b>${T.man(e)}</b></button>`;
  modal(`<div class="gl-start"><small>STAPEL</small><h2>${T.title}</h2>
    <p class="gl-lab">${T.pickMan}</p><div class="gl-row">${ELEMENTS.map(manBtn).join('')}</div>
    <p class="gl-rules">${T.rules(kill, blindEl, element)}</p>
    <p class="gl-how">${T.how}</p>
    ${best ? `<p class="gl-bestline">${T.best(metres(best))}</p>` : ''}
    ${levelBar(levelOf(prog.xp))}
    <p class="gl-lab">${T.missions}</p>${missionRows(prog.missions)}
    <button class="bt-ok gl-go" type="button">${T.go}</button><button class="bt-home" type="button">${T.toStapel}</button></div>`, {
    '[data-el]': (e) => { const pick = e.currentTarget.dataset.el; if (pick !== element) { element = pick; save(); makeRunner(); } sfx('click'); showStart(); },
    '.gl-go': () => { audio.unlock(); startRun(); },
    '.bt-home': () => goBack(),
  });
  el.best.textContent = best ? T.best(metres(best)) : '';
}

// ------------------------------------------------------------------------------------------- pause
function openPause() {
  if (G.state !== 'run' || G.paused) return;
  G.paused = true;
  try { audio.suspend(); } catch { /* */ }
  modal(`<div class="bt-pausecard"><small>${T.title}</small><h2>${T.paused}</h2>
    <button class="bt-resume" type="button">${T.resume}</button><button class="bt-restart" type="button">${T.restart}</button><button class="bt-quit" type="button">${T.toStapel}</button></div>`, {
    '.bt-resume': () => { closeModal(); G.paused = false; try { audio.resume(); } catch { /* */ } },
    // (leaving a run halfway: what it picked up still counts)
    '.bt-restart': () => { finishRun(); G.paused = false; try { audio.resume(); } catch { /* */ } showStart(); },
    '.bt-quit': () => { finishRun(); try { audio.music(false); } catch { /* */ } goBack(); },
  });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) openPause(); });
// (sideways, "Draai jou foon regop" covers the slide: it waits, as Stapel's own game and Block Clash do)
const sidewaysMq = typeof matchMedia === 'function' ? matchMedia('(orientation: landscape) and (max-height: 540px) and (pointer: coarse)') : null;
$('.bt-pause').addEventListener('click', () => openPause());
$('.bt-back').addEventListener('click', () => { if (G.state === 'run') openPause(); else goBack(); });
el.item.addEventListener('click', () => useItem());
addEventListener('stapel:back', (e) => { e.preventDefault(); if (G.state === 'run' && !G.paused) openPause(); else goBack(); });

// ------------------------------------------------------------------------------------------- the controls
const canAct = () => G.state === 'run' && !G.paused && performance.now() >= G.inputAt;
/** A swipe: one lane that way. */
function swipe(dir) {
  if (!canAct()) return;
  const lane = moveLane(G.lane, dir);
  if (lane === G.lane) { G.xv -= dir * 6; return; }   // (the wall: a nudge, no lane)
  G.lane = lane;
  G.movedAt = performance.now();
  sfx('click');
  if (!calm) fx.sparkle(trk.localToWorld(v3.set(G.x, 0.4 + airH(), 0.4)), 7, TRAIL_COL[element], 3.5);
}
/** A tap or a swipe up: he jumps (not again in the air; out of a slide straight up). */
function jump() {
  if (!canAct() || G.jumpT >= 0) return;
  G.slideT = -1;
  G.slideAfter = false;
  G.jumpT = 0;
  G.movedAt = performance.now();
  sfx('fling');
  buzz('tap');
}
function startSlide() {
  G.slideT = 0;
  G.movedAt = performance.now();
  sfx('chute');
  buzz('tap');
  if (!calm) fx.puff(trk.localToWorld(v3.set(G.x, 0.2, 0.6)), 6, DUST[element], 1.5);
}
/** A swipe down: he slides (in the air: he comes down fast and slides as he lands). */
function slide() {
  if (!canAct()) return;
  if (G.jumpT >= 0) { G.jumpT = Math.max(G.jumpT, JUMP.time - 0.1); G.slideAfter = true; return; }
  startSlide();
}
let ptr = null;
stageEl.addEventListener('pointerdown', (e) => {
  try { audio.unlock(); } catch { /* */ }
  if (e.target.closest('button') || modalOpen()) return;
  ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), done: false };
});
stageEl.addEventListener('pointermove', (e) => {
  if (!ptr || ptr.done || e.pointerId !== ptr.id) return;
  const dx = e.clientX - ptr.x;
  const dy = e.clientY - ptr.y;
  // (a lane swipe leans sideways; a steep one up jumps, down slides)
  if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.15) { ptr.done = true; swipe(dx > 0 ? 1 : -1); }
  else if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx) * 1.3) { ptr.done = true; if (dy < 0) jump(); else slide(); }
});
stageEl.addEventListener('pointerup', (e) => {
  if (!ptr || e.pointerId !== ptr.id) return;
  const moved = Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y);
  if (!ptr.done && moved < 16 && performance.now() - ptr.t < 350) jump();
  ptr = null;
});
stageEl.addEventListener('pointercancel', () => { ptr = null; });
addEventListener('keydown', (e) => {
  if (modalOpen()) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') swipe(-1);
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') swipe(1);
  else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') { e.preventDefault(); jump(); }
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); slide(); }
  else if (e.code === 'KeyE' || e.code === 'Enter') useItem();
  else if (e.code === 'Escape') openPause();
});

// ------------------------------------------------------------------------------------------- the frame
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camX = LX(1);
/** He follows his lane (a quick snap with a touch of give), rises in a jump; poses come from runner.js. */
function runnerVisual(dt) {
  const R = runner.root;
  if (G.tumble) {
    const t = G.tumble;
    t.vy -= 22 * dt;
    R.position.y += t.vy * dt;
    R.position.z -= t.vz * dt;
    R.rotation.x += t.spin * dt;
    R.rotation.z += t.spin * 0.6 * dt;
    runner.update(dt, { mode: 'dead', time });
    shadow.visible = false;
    return;
  }
  const k = 520;
  const c = 2 * Math.sqrt(k);
  G.xv += ((LX(G.lane) - G.x) * k - G.xv * c) * dt;
  G.x += G.xv * dt;
  const h = airH();
  R.position.set(G.x, h, 0);
  const mode = G.state === 'run' ? (G.jumpT >= 0 ? 'jump' : G.slideT >= 0 ? 'slide' : 'run') : G.state === 'show' ? 'idle' : 'run';
  runner.update(dt, { mode, speed: G.state === 'run' ? G.v : 6, lean: G.xv, time });
  shadow.visible = true;
  shadow.position.set(G.x, 0.04, 0.1);
  const sk = MAN * Math.max(0.45, 1 - h * 0.16);
  shadow.scale.set(sk, 1, sk);
  shadow.material.opacity = Math.max(0.35, 1 - h * 0.18);
}
const upHill = new THREE.Vector3();
/** His trail: sparks of his element (spray, embers, leaves) left behind as he runs, more the faster he goes. */
const TRAIL_COL = { water: '#9fe3ff', vuur: '#ff8a2a', gras: '#8fe05a' };
const slopeDir = new THREE.Vector3(0, 0, 1).applyQuaternion(trk.quaternion);
const tv = new THREE.Vector3();
let trailAcc = 0;
function trailVisual(dt) {
  if (calm || G.state !== 'run' || !dt) return;
  trailAcc += dt * (50 + G.v * 1.6);
  const h = airH();
  while (trailAcc >= 1) {
    trailAcc -= 1;
    const p = trk.localToWorld(v3.set(G.x + (Math.random() - 0.5) * 0.9, 0.15 + h + Math.random() * 0.5, 0.5));
    tv.copy(slopeDir).multiplyScalar(G.v * 0.6);
    tv.x += (Math.random() - 0.5) * 2;
    tv.y += Math.random() * 1.5;
    tv.z += (Math.random() - 0.5) * 2;
    fx.trail(p, tv, TRAIL_COL[element]);
  }
}
/**
 * (the owner, 18 Oct: "can't we make it that it slides from top to bottom"; then, of a camera looking down the slide: "That
 * will make me nausious, I meant at an angle towards me, basically at a 70 degree upwards") The camera stands down the
 * slide from the man and looks back up it at about 70° to its floor, as you'd look at a steep slide coming towards you:
 * the slide rises away to the top of the screen, he runs high on it towards you, and what comes rises from the bottom (the
 * bottom 30% that steam, ash or vines cloud). No roll and no swing; a little further back as it gets faster, to see more.
 */
const VIEW = Object.freeze({ angle: 70 * Math.PI / 180, dist: 34, fov: 44, look: 8 });
function cameraVisual(dt) {
  const k = Math.min(1, Math.max(0, (G.v - 15) / 25));
  // (the whole slide in the picture with sea on both sides: the camera follows him only a little)
  camX += (G.x * 0.12 - camX) * Math.min(1, dt * 5);
  const dist = VIEW.dist + 6 * k;
  const look = VIEW.look + 2 * k;
  camLook.set(camX, 0, -look);
  camPos.set(camX, dist * Math.sin(VIEW.angle), -look - dist * Math.cos(VIEW.angle));
  trk.localToWorld(camPos);
  trk.localToWorld(camLook);
  upHill.set(0, 0, 1).applyQuaternion(trk.quaternion);
  camera.up.copy(upHill);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (Math.abs(camera.fov - VIEW.fov) > 0.05) { camera.fov = VIEW.fov; camera.updateProjectionMatrix(); }
}
function hudVisual() {
  el.m.innerHTML = metres(G.d);
  el.coinsN.textContent = fmtInt(Math.max(0, G.coins - inFlight));
  el.kmh.textContent = G.state === 'run' ? T.speed(Math.round(G.v * 3.6)) : '';
  el.item.dataset.on = G.holding ? '1' : '0';
}
let time = 0;
let last = performance.now();
let hudT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (sidewaysMq?.matches && G.state === 'run' && !G.paused) openPause();
  const dt = G.paused ? 0 : raw * G.timeScale;
  time += dt;
  if (G.state === 'run') step(dt);
  else if (G.state === 'dying') { G.d += speedAt(G.d) * dt * 0.4; G.timeScale = Math.min(1, G.timeScale + raw * 0.5); }
  else if (G.state === 'start' || G.state === 'over') { G.v = 7; G.d += 7 * raw; }   // (the slide idles under the cards)
  rushPast(G.d);
  placeRows(time);
  hz.update(time, camera, renderer.domElement.height);
  ringMats.kill.opacity = 0.72 + 0.26 * Math.sin(time * 6);
  if (!G.paused) runnerVisual(dt || raw);
  trailVisual(dt);
  {
    const bs = best - G.d;
    const on = G.state === 'run' && best > 0 && bs > -4 && bs < 90;
    bestMark.g.visible = on;
    if (on) bestMark.g.position.set(0, -sunk(bs, 1, 4), -bs);
  }
  streaks.uniforms.uOff.value += G.v * dt * 1.5;
  streaks.uniforms.uK.value = G.state === 'run' && !calm ? Math.min(1, Math.max(0, (G.v - 17) / 16)) * 0.85 : 0;
  cameraVisual(raw);
  {
    // (the end card stays in the world where it ended; the start card is the first world)
    const entered = worlds.update(G.paused ? 0 : raw, G.state === 'start' || G.state === 'show' ? 0 : G.d, G.state === 'run' ? G.v : 0, time, camera, renderer.domElement.height);
    if (entered > 0 && G.state === 'run') worldMoment(entered);
  }
  world.update(time);
  fx.update(dt || raw * 0.5);
  if ((hudT += raw) > 0.08) { hudT = 0; hudVisual(); }
  stage.render(raw);
}

// ------------------------------------------------------------------------------------------- start
(async () => {
  makeRunner();
  // every shader ready behind the loading screen (no stall on the first hazard, barrier or man)
  const warm = [];
  for (const [t, looks] of Object.entries(VARIANTS)) for (const l of looks) warm.push(hazardMesh(t, l));
  const bars = [makeBarrier({ kind: 'bar', bar: 'low' }), makeBarrier({ kind: 'bar', bar: 'high' }), makeBarrier({ kind: 'wall', gap: 1 })];
  const others = ELEMENTS.filter((e) => e !== element).map((e) => { const m = createRunner(e); trk.add(m.root); return m; });
  await stage.warm([]);
  for (const g of warm) freeHazard(g);
  for (const b of bars) freeBarrier(b);
  for (const m of others) { trk.remove(m.root); m.dispose(); }
  faces = portraits();
  resetRunner();
  showStart();
  requestAnimationFrame(frame);
  window.__glyReady = true;
})();

// (tests) the run's state and its controls
window.__gly = {
  get G() { return G; },
  get rows() { return rows; },
  get element() { return element; },
  set: (o = {}) => { if (ELEMENTS.includes(o.element) && o.element !== element) { element = o.element; makeRunner(); } },
  start: () => { if (G.state !== 'run') startRun(); },
  swipe, jump, slide, up: useItem, pause: openPause,
  air: airH,
  /** Where the man is on the screen (CSS px). */
  runnerAt: () => toScreen(v3.set(G.x, 1, 0)),
  /** (pictures) every look side by side, still: water, fire low and tall; vines and a boulder; the three barriers. */
  showcase: () => {
    closeModal();
    clearBag();
    clearRows();
    hud.classList.remove('is-running');
    G.state = 'show';
    const looks = [['water', 'whirl'], ['water', 'fall'], ['vuur', 'fire'], ['vuur', 'lava'], ['gras', 'vines'], ['stone', 'rock']];
    addRow({ at: G.d + 8, kind: 'hazards', n: 0, coins: [], cells: looks.slice(0, 4).map(([type, look], lane) => ({ lane, type, look })) });
    addRow({ at: G.d + 17, kind: 'hazards', n: 1, coins: [], cells: looks.slice(4).map(([type, look], i) => ({ lane: i + 1, type, look })) });
  },
  /** (pictures) a barrier just ahead: 'low', 'high' or 'wall'. */
  barrier: (kind) => {
    closeModal();
    clearRows();
    hud.classList.remove('is-running');
    G.state = 'show';
    addRow(kind === 'wall' ? { at: G.d + 10, kind: 'wall', gap: 2, n: 0, cells: [], coins: [] } : { at: G.d + 10, kind: 'bar', bar: kind, n: 0, cells: [], coins: [] });
  },
  /** A bag's pop over the man (the bag rule itself is the track's: rules.js). */
  popBag: (n) => popBag(n, new THREE.Vector3(G.x, 2.6, 0)),
};
