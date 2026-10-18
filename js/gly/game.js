// (1.19 3D) Glybaan, Stapel's downhill runner (the owner, 18 Oct 2026: Block Clash "Its not working ... The gameplay will
// be a slide going downwards and also it needs to be four lanes"; his picks: four lanes, a 3D chute, a playable test of the
// core first; after his first look: "can't we make it that it slides from top to bottom", bags of coins in the blocks of
// your own element, the menu's coins). Your block slides down a chute high over the sunset sea, always faster:
// swipe ⟵ ⟶ for a lane, tap to turn it (the Rectangle lies two lanes wide, or stands one lane wide and two high), swipe ⬆
// with a ✨ to clear your view. The rules (elements, gates, the track) are in rules.js; the look reuses Block Clash's
// world (sky, sea, islands), its painted blocks in the player's own skin (the hazards are Stapel blocks too: lava 🔥, ice
// 💧, moss 🌿, stone 🪨) and its effects. The feel test: no shop, continues, XP or unlocks yet (they come once it's fun).
import * as THREE from '../../lib/three.module.min.js';
import { createStage } from '../kasteel/stage.js';
import { buildWorld, SUN_DIR } from '../botsing/world.js';
import { createPieces } from '../botsing/pieces.js';
import { createRunFx } from './fx.js';
import { createHazards, VARIANTS } from './hazards.js';
import { audio, haptics } from '../audio.js';
import { fmtInt } from '../core/format.js';
import { T, PREFS, goBack, EMOJI } from './text.js';
import { LANES, LANE_W, UNIT_H, ELEMENTS, SHAPES, XP_K, laneX, sizeOf, lanesOf, moveLane, turn, effectOf, gateFit, speedAt, createTrack, killerOf, victimOf } from './rules.js';

// (the slide runs from the top of the screen to the bottom, the camera turned to look down it: a lane's place across the
// chute is mirrored so lane 0 is still on the left of the screen and a swipe right goes right)
const LX = (l) => -laneX(l);
const q = new URLSearchParams(location.search);
const calm = PREFS.reducedMotion;
audio.setEnabled(PREFS.sound);
haptics.setEnabled(PREFS.vibration);
const sfx = (n, o) => { try { audio.play(n, o); } catch { /* sound off */ } };
const buzz = (k) => { try { haptics[k]?.(); } catch { /* no haptics */ } };
const metres = (d) => `${fmtInt(Math.floor(d))} m`;

// ------------------------------------------------------------------------------------------- the player's own things
// (their Living Tower tribe as the first element, the block skin they wear in Stapel; the runner's own record)
const STORE_KEY = 'stapel.v1.gly';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const econ = read('stapel.v1.econ') || {};
const mySkin = typeof econ?.skins?.wear?.blocks === 'string' ? econ.skins.wear.blocks : 'kleur';
const saved = read(STORE_KEY) || {};
let element = [q.get('el'), saved.element, econ?.tribes?.wear].find((e) => ELEMENTS.includes(e)) || 'water';
let shape = [q.get('shape'), saved.shape].find((s) => SHAPES.includes(s)) || 'square';
let best = Math.max(0, Number(saved.best) || 0);
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ element, shape, best })); } catch { /* private window */ } };

// ------------------------------------------------------------------------------------------- the stage and the world
const stage = createStage({ fov: 60 });
const { scene, camera, renderer } = stage;
const stageEl = document.getElementById('k-stage');
const world = buildWorld(stage, { stacks: false, isles: [[0, -999, 0], [0, -999, 0]] });
const pieces = createPieces(renderer);
const fx = createRunFx(scene);

// the chute: high over the sea, running down and away from the low sun (it lights the faces coming at you)
const SLOPE = 0.2;           // (rad) its fall, about 11°
const BEHIND = 26;           // (m) chute drawn behind the block (the camera sits in it)
const LEN = 230;             // (m) chute drawn in all
const AHEAD = 150;           // (m) rows come this far ahead
const WIDTH = LANES * LANE_W;
const trk = new THREE.Group();
const sunH = new THREE.Vector3(SUN_DIR.x, 0, SUN_DIR.z).normalize();
const fwd = sunH.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.85);
trk.rotation.set(-SLOPE, Math.atan2(-fwd.x, -fwd.z), 0, 'YXZ');
trk.position.set(0, 34, 0);
scene.add(trk);

/** The chute's floor: four lanes of deep glaze, glowing lines between them, cross marks that rush past. */
function floorTextures() {
  const W = 512;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const lane = W / LANES;
  for (let i = 0; i < LANES; i++) {
    const grd = g.createLinearGradient(i * lane, 0, (i + 1) * lane, 0);
    grd.addColorStop(0, '#16206a'); grd.addColorStop(0.5, i % 2 ? '#2a46b8' : '#2f50c6'); grd.addColorStop(1, '#16206a');
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
  // the lane lines (dashed) and the chute's edges (solid), only these glow
  for (let i = 0; i <= LANES; i++) {
    const x = i * lane;
    const edge = i === 0 || i === LANES;
    ge.fillStyle = edge ? '#ffb347' : '#bff3ff';
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
const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, LEN),
  new THREE.MeshStandardMaterial({ map: floorTex.map, emissive: '#ffffff', emissiveMap: floorTex.emi, emissiveIntensity: 0.9, roughness: 0.32, metalness: 0.15 }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, BEHIND - LEN / 2);
floor.receiveShadow = true;
trk.add(floor);
// the side walls with a glowing rail along their tops, and the chute's underside (it hangs in the air)
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
// lamps on the rails and the struts under the chute, rushing past (one draw each)
const LAMP_SP = 9;
const LAMPS = Math.ceil(LEN / LAMP_SP) + 1;
const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), new THREE.MeshStandardMaterial({ color: '#fff3d1', emissive: '#ffd27a', emissiveIntensity: 2.2 }), LAMPS * 2);
const STRUT_SP = 36;
const STRUTS = Math.ceil(LEN / STRUT_SP) + 1;
const struts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.9, 60, 8), wallMat, STRUTS * 2);
lamps.frustumCulled = struts.frustumCulled = false;
trk.add(lamps, struts);
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
    // (straight down in the world: the chute leans, its struts don't; their middle half their length below the chute)
    for (const s of [0, 1]) struts.setMatrixAt(k * 2 + s, m4.compose(v3.set((s ? 1 : -1) * (WIDTH / 2 - 0.6), -0.9 - STRUT_HALF * Math.cos(SLOPE), z - STRUT_HALF * Math.sin(SLOPE)), strutQ, one));
  }
  struts.instanceMatrix.needsUpdate = true;
  floorTex.map.offset.y = floorTex.emi.offset.y = (d / WIDTH) % 1;
}

// ------------------------------------------------------------------------------------------- the block and the things
const blockGroup = new THREE.Group();
trk.add(blockGroup);
let blockMesh = null;
// (the camera looks down on the block's top, so its element's medallion lies there, and stays on top through every turn:
// it waits out the quarter roll, then shows on the new top face; its emblem upright on the screen)
let badge = null;
const BADGE_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
function makeBlock() {
  if (blockMesh) blockGroup.remove(blockMesh);
  blockMesh = pieces.block(shape === 'rect' ? 'brick' : 'cube', 0, element, mySkin);
  blockGroup.add(blockMesh);
  blockMesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (badge) trk.remove(badge);
  badge = pieces.medallion(element);
  badge.quaternion.copy(BADGE_Q);
  badge.scale.setScalar(0.74);
  trk.add(badge);
}
// (the blocks' tops face the camera, where the low sunset sun only grazes: a soft light from over the camera's shoulder)
const fill = new THREE.DirectionalLight('#fff0dc', 1.15);
fill.position.set(0, 60, -45);
trk.add(fill, fill.target);
/** A hazard: a piece of its element's nature (hazards.js: a whirlpool or a waterfall, a fire pit or lava, thorny vines, a
 *  boulder), with a ring on the floor in what it does to you. */
const hz = createHazards();
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
/** A row's lane picks the look of its element (the same track, the same looks). */
const lookFor = (type, n, lane) => { const v = VARIANTS[type] || VARIANTS.stone; return v[(n * 3 + lane * 5 + (n >> 2)) % v.length]; };
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
  g.scale.setScalar(1);
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
const coinMesh = () => { const m = coinPool.pop() || new THREE.Sprite(coinMat); m.scale.set(1.5, 1.5, 1); trk.add(m); m.visible = true; return m; };
const freeCoin = (m) => { trk.remove(m); coinPool.push(m); };
const itemMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshStandardMaterial({ color: '#bff7ff', emissive: '#58e6ff', emissiveIntensity: 2.4, roughness: 0.2 }));
const itemHalo = new THREE.Sprite(itemHaloMat());
itemHalo.scale.set(1.9, 1.9, 1);
itemMesh.add(itemHalo);
const gateMat = new THREE.MeshStandardMaterial({ color: '#2b2160', emissive: '#3b2c8f', emissiveIntensity: 0.45, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.8 });
const gateEdgeMat = new THREE.MeshStandardMaterial({ color: '#fff4cf', emissive: '#ffd36b', emissiveIntensity: 3 });
const gateRimMat = new THREE.MeshStandardMaterial({ color: '#b9a6ff', emissive: '#7a5cff', emissiveIntensity: 1.6 });
const gateGlowMat = new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
/** A Shadow Gate: a wall across the chute, three blocks high, with the hole's outline glowing gold. */
function makeGate(hole) {
  const g = new THREE.Group();
  const H = 3 * UNIT_H + 0.9;
  const x0 = -WIDTH / 2 - 0.5;
  const x3 = WIDTH / 2 + 0.5;
  const hx0 = LX(hole.lane + hole.w - 1) - LANE_W / 2;   // (mirrored: the hole's last lane is its left side)
  const hx1 = LX(hole.lane) + LANE_W / 2;
  const hh = hole.h * UNIT_H + 0.5;
  const D = 0.9;
  const piece = (a, b, y0, y1, m = gateMat) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return;
    const o = new THREE.Mesh(new THREE.BoxGeometry(b - a, y1 - y0, D), m);
    o.position.set((a + b) / 2, (y0 + y1) / 2, 0);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  };
  piece(x0, hx0, 0, H);
  piece(hx1, x3, 0, H);
  piece(hx0, hx1, hh, H);
  // the hole's outline glowing gold (the shape to fit, plain from far off), and the wall's own edges, on the face the
  // camera sees (it stands down the chute, looking back up at what comes)
  const e = 0.22;
  const edge = (a, b, y0, y1, m = gateEdgeMat) => { const o = new THREE.Mesh(new THREE.BoxGeometry(b - a, y1 - y0, 0.14), m); o.position.set((a + b) / 2, (y0 + y1) / 2, -D / 2 - 0.07); g.add(o); };
  edge(hx0 - e, hx0, 0, hh + e);
  edge(hx1, hx1 + e, 0, hh + e);
  edge(hx0 - e, hx1 + e, hh, hh + e);
  edge(x0, x3, H - 0.12, H, gateRimMat);
  edge(x0, x0 + 0.12, 0, H, gateRimMat);
  edge(x3 - 0.12, x3, 0, H, gateRimMat);
  // a glow on the chute's floor through the hole (where to be)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(hx1 - hx0, 6).rotateX(-Math.PI / 2), gateGlowMat);
  glow.position.set((hx0 + hx1) / 2, 0.03, 2.4);
  g.add(glow);
  trk.add(g);
  return g;
}
function freeGate(g) {
  trk.remove(g);
  g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
}
// ------------------------------------------------------------------------------------------- the screen
const hud = document.getElementById('k-hud');
hud.classList.add('bt', 'gl');
hud.innerHTML = `
  <div class="gl-top"><b class="gl-m">0&nbsp;m</b><span class="gl-sub"><span class="gl-best"></span><span class="gl-kmh"></span></span></div>
  <div class="gl-side"><span class="gl-coins"><i class="coin-ic" role="img" aria-label="🪙"></i><b>0</b></span><span class="gl-item" aria-label="✨">✨</span></div>
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
 * block for a second and a half; a bag while it shows adds to it.
 */
let bagT = null;
let bagSum = 0;
function popBag(n, local) {
  const s = toScreen(local);
  bagSum = el.bag.classList.contains('is-on') ? bagSum + n : n;
  el.bagN.textContent = `+${fmtInt(bagSum)}`;
  el.bag.style.left = `${Math.round(Math.max(80, Math.min(stageEl.clientWidth - 80, s.x)))}px`;
  el.bag.style.top = `${Math.round(Math.max(150, s.y - 24))}px`;   // (over the block and above it: what comes stays in sight)
  el.bag.classList.remove('is-on');
  void el.bag.offsetWidth;   // (its pop starts again)
  el.bag.classList.add('is-on');
  clearTimeout(bagT);
  bagT = setTimeout(() => el.bag.classList.remove('is-on'), 1600);
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
  state: 'start',            // start | run | dying | over
  paused: false,
  d: 0, v: 0, t: 0, timeScale: 1,
  lane: 1, orient: 'flat', lastDir: -1,
  x: LX(1), xv: 0, roll: 0, rollTo: 0, tumble: null,
  coins: 0, gates: 0, perfects: 0, bags: 0, holding: false,
  blindUntil: 0, blindKind: '',
  why: null, nextSpeedUp: 500,
  runs: 0, inputAt: 0,
};
let track = null;
let pending = null;   // the next row, not yet in the chute
const rows = [];

function resetBlock() {
  G.orient = 'flat';
  G.lane = shape === 'rect' ? 1 : 1;
  G.x = LX(G.lane) - (shape === 'rect' ? LANE_W / 2 : 0);
  G.xv = 0;
  G.roll = G.rollTo = 0;
  G.tumble = null;
  makeBlock();
  blockGroup.position.set(G.x, 0, 0);
  blockGroup.rotation.set(0, 0, 0);
  blockGroup.visible = true;
}
function clearRows() {
  for (const r of rows) dropRow(r);
  rows.length = 0;
  if (itemMesh.parent) trk.remove(itemMesh);
}
function startRun() {
  closeModal();
  clearRows();
  G.runs++;
  G.state = 'run';
  G.paused = false;
  G.d = 0; G.t = 0; G.timeScale = 1;
  G.coins = 0; G.gates = 0; G.perfects = 0; G.holding = false; G.bags = 0;
  G.blindUntil = 0; G.why = null; G.nextSpeedUp = 500;
  G.inputAt = performance.now() + 350;   // (GLY! tapped twice: its second tap never turns the block)
  clearBag();
  resetBlock();
  const seed = Number(q.get('seed')) ? Number(q.get('seed')) + G.runs - 1 : Math.floor(Math.random() * 1e9);
  track = createTrack(seed, { shape, element });
  pending = track.next();
  hud.classList.add('is-running');
  sfx('horn');
}

/** A row comes into the chute: its things from the pools. */
function addRow(row) {
  const r = { ...row, cells: row.cells.map((c) => ({ ...c, mesh: hazardMesh(c.type, c.look || lookFor(c.type, row.n, c.lane)), done: false })), coins: row.coins.map((c) => ({ ...c, mesh: coinMesh(), done: false })), done: false };
  if (row.kind === 'gate') r.gate = makeGate(row.hole);
  if (row.item) { r.item = { ...row.item, done: false }; trk.add(itemMesh); itemMesh.visible = true; }
  rows.push(r);
}
function dropRow(r) {
  for (const c of r.cells) freeHazard(c.mesh);
  for (const c of r.coins) freeCoin(c.mesh);
  if (r.gate) freeGate(r.gate);
  if (r.item && itemMesh.parent) trk.remove(itemMesh);
}

/** How far a thing the block is past has sunk back into the chute (seen from high over the block, what's behind it would
 *  otherwise slide up over the numbers at the top); what ended the run stays. */
const sunk = (s, after, rate) => Math.max(0, -s - after) * rate;
/** Where the things are this frame (they rise out of the chute as they come into view, and sink back once passed). */
function placeRows(time) {
  for (const r of rows) {
    const s = r.at - G.d;
    const rise = s > AHEAD - 28 ? Math.min(1, (s - (AHEAD - 28)) / 28) : 0;
    const y0 = -3.2 * rise;
    const down = r.hit ? 0 : sunk(s, 1.5, 4.5);
    for (const c of r.cells) {
      c.mesh.position.set(LX(c.lane), y0 - down, -s);
    }
    for (const c of r.coins) {
      const cs = c.at - G.d;
      c.mesh.position.set(LX(c.lane), 1.3 + y0 - sunk(cs, 1, 4) + Math.sin(time * 3 + cs) * 0.12, -cs);
      const pulse = 1.5 * (1 + 0.06 * Math.sin(time * 6 + cs));
      c.mesh.scale.set(pulse, pulse, 1);
    }
    // (a gate sinks once it is clear of the block's back, quickly: it stands three blocks high)
    if (r.gate) r.gate.position.set(0, y0 * 2.2 - (r.hit ? 0 : sunk(s, 1.7, 14)), -s);
    if (r.item && !r.item.done) {
      const is = r.item.at - G.d;
      itemMesh.position.set(LX(r.item.lane), 1.5 + y0 - sunk(is, 1, 4) + Math.sin(time * 4) * 0.2, -is);
      itemMesh.rotation.y = time * 2;
      itemMesh.rotation.x = time * 1.3;
    }
  }
}

/** The block's lanes now. */
const taken = () => lanesOf(shape, G.orient, G.lane);

function step(dt) {
  G.t += dt;
  G.v = speedAt(G.d);
  G.d += G.v * dt;
  while (pending && pending.at < G.d + AHEAD) { addRow(pending); pending = track.next(); }
  // what the block meets
  for (const r of rows) {
    for (const c of r.coins) {
      if (c.done || c.at - G.d > 0.4) continue;
      c.done = true;
      if (taken().includes(c.lane) && G.state === 'run') {
        G.coins++;
        c.mesh.visible = false;
        sfx('gold');
        if (!calm) fx.sparkle(trk.localToWorld(v3.set(LX(c.lane), 1.3, 0)), 8, '#ffd46a', 4);
      }
    }
    if (r.item && !r.item.done && r.item.at - G.d <= 0.4) {
      r.item.done = true;
      if (taken().includes(r.item.lane) && !G.holding) {
        G.holding = true;
        itemMesh.visible = false;
        sfx('rainbow');
        buzz('tap');
        callout(T.gotItem, new THREE.Vector3(LX(r.item.lane), 2.4, 0), 'is-gold');
      }
    }
    if (r.done || r.at - G.d > 0) continue;
    r.done = true;
    meet(r);
    if (G.state !== 'run') return;
  }
  // rows behind the camera go back to their pools
  while (rows.length && rows[0].at - G.d < -BEHIND + 2) dropRow(rows.shift());
  // faster: a word on it now and then
  if (G.d >= G.nextSpeedUp) {
    G.nextSpeedUp += 500;
    banner(T.speedUp, { sub: T.speed(Math.round(G.v * 3.6)), kind: 'is-small', ms: 1100 });
    sfx('milestone');
  }
  if (G.blindUntil && G.t > G.blindUntil) { G.blindUntil = 0; el.blind.classList.remove('is-on'); }
}

/** The block meets a row: a gate's hole, or the hazards in its lanes. */
function meet(r) {
  const mine = taken();
  if (r.kind === 'gate') {
    const fit = gateFit(shape, G.orient, G.lane, r.hole);
    if (fit === 'crash') { r.hit = true; die('gate'); return; }
    G.gates++;
    if (fit === 'perfect') {
      G.perfects++;
      G.coins += 5;
      callout(T.perfect, new THREE.Vector3(LX(G.lane), 3.6, -1), 'is-gold');
      sfx('perfect', { combo: 3 });
      buzz('perfect');
      if (!calm) fx.sparkle(trk.localToWorld(v3.set(G.x, 2, -0.5)), 26, '#ffe38c', 7);
    } else {
      callout(T.through, new THREE.Vector3(LX(G.lane), 3.2, -1), 'is-small');
      sfx('good');
    }
    return;
  }
  for (const c of r.cells) {
    if (!mine.includes(c.lane) || c.done) continue;
    const eff = effectOf(element, c.type);
    const at = trk.localToWorld(v3.set(LX(c.lane), 1.2, 0)).clone();
    if (eff === 'kill') { r.hit = true; die(c.type === 'stone' ? 'stone' : 'kill', c.type, c); return; }
    c.done = true;
    if (eff === 'blind') {
      // (what you beat is gone: water puts the fire out, fire burns the vines to ash, the vines drink the water)
      c.mesh.visible = false;
      blind(c.type);
      if (!calm) { fx.puff(at, 18, PUFF[c.type]); fx.sparkle(at, 14, BLOCK_COL[c.type], 6); }
    } else if (c.bag) {
      // a bag of coins in your own element's block (the owner: "it might get coins, but its random")
      G.coins += c.bag;
      G.bags++;
      popBag(c.bag, new THREE.Vector3(LX(c.lane), 2.6, 0));
      sfx('gold');
      setTimeout(() => sfx('pop'), 110);
      buzz('perfect');
      stage.shake(0.18);
      if (!calm) fx.sparkle(at, 34, '#ffd46a', 8);
    } else {
      callout(T.safe, new THREE.Vector3(LX(c.lane), 2.8, -1), 'is-small');
      sfx('pop');
      if (!calm) fx.sparkle(at, 18, c.type === 'vuur' ? '#ff9a3c' : c.type === 'water' ? '#7fd8ff' : '#8bea5c', 6);
    }
  }
}

const BLIND_KIND = { vuur: 'steam', gras: 'ash', water: 'vines' };
const PUFF = { vuur: '#f2f5f8', gras: '#5d5550', water: '#5fae45' };            // (steam, ash, leaves)
const BLOCK_COL = { stone: '#9a948a', vuur: '#ff7a2a', water: '#9fdcff', gras: '#6f9a3a' };
/** The bottom of the screen clouds over a while (steam, ash or vines); a ✨ swiped up clears it. */
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
  G.why = why === 'kill' ? T.overWhy.kill(type) : T.overWhy[why];
  G.timeScale = 0.35;
  G.dieAt = performance.now();
  const at = trk.localToWorld(v3.set(G.x, 1.4, -0.5)).clone();
  sfx('lost');
  buzz('heavy');
  stage.shake(calm ? 0 : 1.1);
  flash('#ff3b30', 260);
  if (!calm) {
    fx.chunks(at, 18, BLOCK_COL[type] || '#c9a27a', 11);
    if (type === 'vuur') fx.puff(at, 14, '#3a2a24', 4);
    else if (type === 'water') fx.sparkle(at, 30, '#9fdcff', 9);
    else if (type === 'gras') fx.puff(at, 10, '#5fae45', 3);
  }
  if (cell) cell.mesh.scale.setScalar(1.08);
  // the block tumbles up and away over what it hit
  G.tumble = { vy: 9, vz: 4, spin: (Math.random() < 0.5 ? -1 : 1) * 7 };
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
  const xp = Math.round(dist * XP_K[shape] + G.gates * 20 + G.perfects * 30);
  if (record) sfx('record'); else sfx('gameover');
  modal(`<div class="bt-res gl-res"><small>${T.title}</small><h2>${record ? T.record : T.over}</h2>
    <p>${G.why || ''}</p><p class="gl-big">${T.slid(metres(dist))}</p>
    <dl><div><dt>${T.coins}</dt><dd>${fmtInt(G.coins)}</dd></div><div><dt>${T.gates}</dt><dd>${G.gates}</dd></div>
    <div><dt>${T.perfects}</dt><dd>${G.perfects}</dd></div><div><dt>${T.xp}</dt><dd>${fmtInt(xp)}</dd></div></dl>
    <button class="bt-again" type="button">${T.again}</button><button class="bt-home" type="button">${T.toStapel}</button></div>`, {
    '.bt-again': () => { sfx('click'); showStart(); },
    '.bt-home': () => goBack(),
  });
}

// ------------------------------------------------------------------------------------------- the start card
function showStart() {
  G.state = 'start';
  clearBag();
  clearRows();
  resetBlock();
  hud.classList.remove('is-running');
  const kill = killerOf(element);
  const blindEl = victimOf(element);
  const elBtn = (e) => `<button type="button" class="gl-pick${e === element ? ' is-on' : ''}" data-el="${e}"><span>${EMOJI[e]}</span><b>${T.name(e)}</b></button>`;
  const shBtn = (s) => `<button type="button" class="gl-pick gl-shape${s === shape ? ' is-on' : ''}" data-shape="${s}"><i class="gl-sh gl-sh-${s}"></i><b>${s === 'rect' ? T.rect : T.square}</b><small>${s === 'rect' ? T.rectWhy : T.squareWhy}</small></button>`;
  modal(`<div class="gl-start"><small>STAPEL</small><h2>${T.title}</h2>
    <p class="gl-lab">${T.element}</p><div class="gl-row">${ELEMENTS.map(elBtn).join('')}</div>
    <p class="gl-rules">${T.rules(kill, blindEl, element)}</p>
    <p class="gl-how">${T.how}</p>
    <p class="gl-lab">${T.shape}</p><div class="gl-row">${SHAPES.map(shBtn).join('')}</div>
    ${best ? `<p class="gl-bestline">${T.best(metres(best))}</p>` : ''}
    <button class="bt-ok gl-go" type="button">${T.go}</button><button class="bt-home" type="button">${T.toStapel}</button></div>`, {
    '[data-el]': (e) => { element = e.currentTarget.dataset.el; save(); sfx('click'); showStart(); },
    '[data-shape]': (e) => { shape = e.currentTarget.dataset.shape; save(); sfx('click'); showStart(); },
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
    '.bt-restart': () => { G.paused = false; try { audio.resume(); } catch { /* */ } showStart(); },
    '.bt-quit': () => goBack(),
  });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) openPause(); });
// (sideways, "Draai jou foon regop" covers the slide: it waits, as Stapel's own game and Block Clash do)
const sidewaysMq = typeof matchMedia === 'function' ? matchMedia('(orientation: landscape) and (max-height: 540px) and (pointer: coarse)') : null;
$('.bt-pause').addEventListener('click', () => openPause());
$('.bt-back').addEventListener('click', () => { if (G.state === 'run') openPause(); else goBack(); });
addEventListener('stapel:back', (e) => { e.preventDefault(); if (G.state === 'run' && !G.paused) openPause(); else goBack(); });

// ------------------------------------------------------------------------------------------- the controls
/** A swipe: one lane that way. */
function swipe(dir) {
  if (G.state !== 'run' || G.paused || performance.now() < G.inputAt) return;
  const lane = moveLane(shape, G.orient, G.lane, dir);
  G.lastDir = dir < 0 ? -1 : 1;
  if (lane === G.lane) { G.xv -= dir * 6; return; }   // (the wall: a nudge, no lane)
  G.lane = lane;
  sfx('click');
}
/** A tap: the block turns a quarter (the Rectangle stands up or lies down). */
function tapTurn() {
  if (G.state !== 'run' || G.paused || performance.now() < G.inputAt) return;
  const t = turn(shape, G.orient, G.lane, G.lastDir);
  G.orient = t.orient;
  G.lane = t.lane;
  G.rollTo += Math.PI / 2;
  sfx('drop');
  buzz('tap');
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
  // (a lane swipe leans sideways; only a steep one upwards is the ✨: a slanted lane swipe never spends it)
  if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.15) { ptr.done = true; swipe(dx > 0 ? 1 : -1); }
  else if (dy < -40 && Math.abs(dy) > Math.abs(dx) * 2) { ptr.done = true; useItem(); }
});
stageEl.addEventListener('pointerup', (e) => {
  if (!ptr || e.pointerId !== ptr.id) return;
  const moved = Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y);
  if (!ptr.done && moved < 16 && performance.now() - ptr.t < 350) tapTurn();
  ptr = null;
});
stageEl.addEventListener('pointercancel', () => { ptr = null; });
addEventListener('keydown', (e) => {
  if (modalOpen()) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') swipe(-1);
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') swipe(1);
  else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); tapTurn(); }
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') useItem();
  else if (e.code === 'Escape') openPause();
});

// ------------------------------------------------------------------------------------------- the frame
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camX = LX(1);
function blockVisual(dt) {
  const { w, h } = sizeOf(shape, G.orient);
  const target = LX(G.lane) - (w - 1) * LANE_W / 2;
  if (G.tumble) {
    const t = G.tumble;
    if (badge) badge.visible = false;
    t.vy -= 22 * dt;
    blockGroup.position.y += t.vy * dt;
    blockGroup.position.z -= t.vz * dt;
    blockGroup.rotation.x += t.spin * dt;
    blockGroup.rotation.z += t.spin * 0.6 * dt;
    return;
  }
  // a quick snap with a touch of give (critically damped), the roll a quarter at a time
  const k = 520;
  const c = 2 * Math.sqrt(k);
  G.xv += ((target - G.x) * k - G.xv * c) * dt;
  G.x += G.xv * dt;
  G.roll += (G.rollTo - G.roll) * Math.min(1, dt * 18);
  const ud = blockMesh?.userData || { w: 2.4, h: 2.4 };
  const a = G.roll;
  const half = Math.abs(ud.w / 2 * Math.sin(a)) + Math.abs(ud.h / 2 * Math.cos(a));
  blockGroup.position.set(G.x, half + 0.02 + (G.state === 'run' && !calm ? Math.sin(G.t * 11) * 0.03 : 0), 0);
  blockGroup.rotation.set(0, 0, a);
  if (badge) {
    badge.visible = blockGroup.visible && Math.abs(G.rollTo - G.roll) < 0.06;
    badge.position.set(G.x, blockGroup.position.y + half + 0.03, 0);
  }
  void h;
}
const upHill = new THREE.Vector3();
/**
 * (the owner, 18 Oct: "can't we make it that it slides from top to bottom"; then, of a camera looking down the chute: "That
 * will make me nausious, I meant at an angle towards me, basically at a 70 degree upwards") The camera stands down the
 * chute from the block and looks back up it at about 70° to its floor, as you'd look at a steep slide coming towards you:
 * the chute rises away to the top of the screen, the block rides high on it and slides down towards you, and what comes
 * rises from the bottom (the bottom 30% that steam, ash or vines cloud). No roll and no swing; a little further back as it
 * gets faster, to see more of what comes.
 */
const VIEW = Object.freeze({ angle: 70 * Math.PI / 180, dist: 40, fov: 44, look: 9 });
function cameraVisual(dt) {
  const k = Math.min(1, Math.max(0, (G.v - 15) / 25));
  // (the whole chute in the picture with sea on both sides: the camera follows the block only a little)
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
  el.coinsN.textContent = fmtInt(G.coins);
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
  else if (G.state === 'start' || G.state === 'over') { G.v = 7; G.d += 7 * raw; }   // (the chute idles under the cards)
  rushPast(G.d);
  placeRows(time);
  hz.update(time, camera, renderer.domElement.height);
  ringMats.kill.opacity = 0.72 + 0.26 * Math.sin(time * 6);
  blockVisual(dt || raw * 0.0001);
  cameraVisual(raw);
  world.update(time);
  fx.update(dt || raw * 0.5);
  if ((hudT += raw) > 0.08) { hudT = 0; hudVisual(); }
  stage.render(raw);
}

// ------------------------------------------------------------------------------------------- start
(async () => {
  makeBlock();
  // every shader and every painted skin ready behind the loading screen (no stall on the first hazard or gate)
  const warm = [];
  for (const [t, looks] of Object.entries(VARIANTS)) for (const l of looks) warm.push(hazardMesh(t, l));
  const gate = makeGate({ lane: 1, w: 2, h: 1 });
  await stage.warm([]);
  for (const g of warm) freeHazard(g);
  freeGate(gate);
  resetBlock();
  showStart();
  requestAnimationFrame(frame);
  window.__glyReady = true;
})();

// (tests) the run's state and its controls
window.__gly = {
  get G() { return G; },
  get rows() { return rows; },
  get shape() { return shape; },
  get element() { return element; },
  set: (o = {}) => { if (ELEMENTS.includes(o.element)) element = o.element; if (SHAPES.includes(o.shape)) shape = o.shape; },
  start: () => { if (G.state !== 'run') startRun(); },
  swipe, turn: tapTurn, up: useItem, pause: openPause,
  taken,
  /** Where the block is on the screen (CSS px). */
  blockAt: () => toScreen(blockGroup.position),
  /** (pictures) every look of every element side by side, still: the whirlpool, the waterfall, fire, lava; vines, a boulder. */
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
  /** A bag's pop over the block (the bag rule itself is the track's: rules.js). */
  popBag: (n) => popBag(n, new THREE.Vector3(G.x, 2.6, 0)),
};
