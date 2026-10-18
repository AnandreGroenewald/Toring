// (1.18) Jou dorp in 3D, inside Stapel (the owner, 18 Oct 2026: "Yes, build it fully", raids "Aim and throw"). It
// takes DorpScene's place with the same contract (js/main.js gives it the same data and callbacks; js/ui/dom.js's town
// screen stays over it): your town on its island in Block Clash's sunset sea, built from your blocks in your skin, its
// lit windows the people who live there. A raid: across the sea to their island, your crane barge offshore; the power
// bar runs (a tap holds it), the arrow swings across their town (a tap throws), the wind pushes; your tribe's block
// lands, its element strikes (fire, a wave, vines), and the server settles it (a hit on the glowing, fullest building:
// a Perfek; another building: Goed; a miss: Skeef). Their people parachute over the sea into your dark windows.
// "Terwyl jy weg was" plays the other way round; tourists arrive by parachute; a landmark you buy drops from the sky.
// One stage, made the first time and kept (its drawing context is costly); a town is built for each visit and taken
// down after (what's shared across visits is marked `userData.shared`).
import * as THREE from '../../lib/three.module.min.js';
import { createStage, pickQuality } from '../kasteel/stage.js';
import { buildWorld, SUN_DIR } from '../botsing/world.js';
import { createPieces } from '../botsing/pieces.js';
import { createBattleFx } from '../botsing/fx.js';
import { castleMaterials } from '../kasteel/castle.js';
import { TRIBES } from '../game/residents.js';
import { S } from '../core/strings.js';
import { audio, haptics } from '../audio.js';
import { WIND, windFor } from '../botsing/rules.js';
import { makeIsle } from './isle.js';
import { planTown3D, planMaterials, buildTown } from './town.js';

const ME_ISLE = { cx: 0, cz: 0, radius: 30, top: 5 };
const THEM_ISLE = { cx: 210, cz: -150, radius: 26, top: 5 };
const MAX_FLY = 16;            // people drawn flying at most (the counts move by the true number)
const ELEMENT_OF = { vuur: 'vuur', water: 'water', gras: 'gras' };
/** The throw: the power bar there and back (s), the arrow's swing (s, radians either side), the arc, the wind's push. */
export const AIM = { powerPeriod: 1.6, dirPeriod: 2.8, maxAz: 0.42, angle: (48 * Math.PI) / 180, g: 14, wind: 2.2, autoMs: 14000 };
const ease = (k) => k * k * (3 - 2 * k);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------------------------------------- the stage
let kit = null;
function makeKit() {
  const host = document.createElement('div');
  host.id = 'dorp3d';
  host.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100px;z-index:1;display:none;overflow:hidden;touch-action:none;background:#140c24;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  host.appendChild(canvas);
  const ov = document.createElement('div');
  ov.className = 'd3-ov';
  ov.innerHTML = `<div class="d3-power"><small>${S.dorp3dPower}</small><div class="d3-pbar"><i></i><em></em></div><b>0%</b></div>
    <div class="d3-wind"><small>${S.dorp3dWind}</small><b></b><span class="d3-wbars"><i></i><i></i><i></i><i></i><i></i></span><em></em></div>
    <div class="d3-pop"></div><div class="d3-reward"><div class="d3-rays"></div><b></b><span></span></div>`;
  host.appendChild(ov);
  if (!document.getElementById('d3-style')) {
    const st = document.createElement('style');
    st.id = 'd3-style';
    st.textContent = `
#dorp3d .d3-ov { position: absolute; inset: 0; pointer-events: none; font-family: "Trebuchet MS", system-ui, sans-serif; }
#dorp3d .d3-power { position: absolute; right: 12px; top: 50%; transform: translate(30px, -50%); opacity: 0; transition: opacity .2s, transform .3s; display: grid; justify-items: center; gap: 6px; }
#dorp3d .d3-power.on { opacity: 1; transform: translate(0, -50%); }
#dorp3d .d3-power small { font-size: 10px; font-weight: 900; letter-spacing: .12em; color: #ffe7a8; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
#dorp3d .d3-pbar { position: relative; width: 22px; height: 180px; border-radius: 12px; background: rgba(18,10,28,.72); border: 2px solid rgba(255,214,120,.65); overflow: hidden; }
#dorp3d .d3-pbar i { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: linear-gradient(0deg, #5bd16a, #ffd24a 55%, #ff6a3a); }
#dorp3d .d3-pbar em { position: absolute; left: -2px; right: -2px; height: 3px; bottom: 0; background: #fff; box-shadow: 0 0 6px #fff; }
#dorp3d .d3-power.held .d3-pbar { border-color: #fff; }
#dorp3d .d3-power b { font-size: 13px; font-weight: 900; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
#dorp3d .d3-wind { position: absolute; left: 50%; top: var(--d3-top, 120px); transform: translate(-50%, -6px); opacity: 0; transition: opacity .25s, transform .25s; display: flex; align-items: center; gap: 6px;
  padding: 5px 11px; border-radius: 999px; background: rgba(18,10,28,.74); border: 1px solid rgba(160,210,255,.45); color: #dff0ff; font-size: 10px; font-weight: 900; letter-spacing: .1em; white-space: nowrap; }
#dorp3d .d3-wind.on { opacity: 1; transform: translate(-50%, 0); }
#dorp3d .d3-wind b { color: #9fd4ff; font-size: 11px; }
#dorp3d .d3-wind em { font-style: normal; color: #fff; }
#dorp3d .d3-wbars { display: flex; gap: 2px; align-items: flex-end; }
#dorp3d .d3-wbars i { width: 4px; height: 5px; border-radius: 1px; background: rgba(255,255,255,.18); }
#dorp3d .d3-wbars i:nth-child(2) { height: 7px; } #dorp3d .d3-wbars i:nth-child(3) { height: 9px; } #dorp3d .d3-wbars i:nth-child(4) { height: 11px; } #dorp3d .d3-wbars i:nth-child(5) { height: 13px; }
#dorp3d .d3-wbars i.on { background: linear-gradient(180deg, #e6f4ff, #6fbcff); }
#dorp3d .d3-wind.left .d3-wbars { flex-direction: row-reverse; }
#dorp3d .d3-pop { position: absolute; left: 50%; top: var(--d3-pop, 30%); transform: translate(-50%, -50%) scale(.6); opacity: 0; font-size: 30px; font-weight: 900; color: #ffd23f; letter-spacing: .04em;
  -webkit-text-stroke: 1.5px #5a2d00; text-shadow: 0 4px 0 rgba(90,45,0,.55), 0 8px 24px rgba(0,0,0,.45); white-space: nowrap; transition: opacity .25s, transform .35s cubic-bezier(.2,1.4,.4,1); }
#dorp3d .d3-pop.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#dorp3d .d3-reward { position: absolute; left: 50%; top: var(--d3-reward, 34%); transform: translate(-50%, -50%) scale(.3); opacity: 0; display: grid; justify-items: center; gap: 6px; transition: opacity .35s, transform .5s cubic-bezier(.2,1.4,.4,1); }
#dorp3d .d3-reward.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#dorp3d .d3-reward b { position: relative; font-size: 44px; font-weight: 900; color: #ffd23f; -webkit-text-stroke: 2px #5a2d00; text-shadow: 0 6px 0 rgba(90,45,0,.55), 0 10px 30px rgba(0,0,0,.5); white-space: nowrap; }
#dorp3d .d3-reward span { position: relative; font-size: 22px; font-weight: 900; color: #fff3b0; -webkit-text-stroke: 1px #6b4a00; white-space: nowrap; }
#dorp3d .d3-rays { position: absolute; left: 50%; top: 50%; width: 420px; height: 420px; margin: -210px 0 0 -210px; border-radius: 50%;
  background: repeating-conic-gradient(rgba(255,232,150,.32) 0 10deg, rgba(255,232,150,0) 10deg 22deg); -webkit-mask: radial-gradient(circle, #000 18%, transparent 68%); mask: radial-gradient(circle, #000 18%, transparent 68%);
  animation: d3-turn 8s linear infinite; }
@keyframes d3-turn { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { #dorp3d .d3-rays { animation: none; } }`;
    document.head.appendChild(st);
  }
  (document.getElementById('game') || document.body).appendChild(host);
  const quality = pickQuality();
  if (quality.name === 'mid' && !quality.forced) Object.assign(quality, { dpr: 1.3, shadow: 1024 });
  const stage = createStage({ fov: 38, quality, canvas, stageEl: host });
  const world = buildWorld(stage, { stacks: false, isles: [[ME_ISLE.cx, ME_ISLE.cz, ME_ISLE.radius * 0.93], [THEM_ISLE.cx, THEM_ISLE.cz, THEM_ISLE.radius * 0.93]] });
  const pieces = createPieces(stage.renderer);
  const fx = createBattleFx(stage);
  const cm = castleMaterials(stage.renderer);
  for (const m of [...Object.values(cm), ...Object.values(world.mats)]) if (m?.userData) m.userData.shared = true;   // (kept for every visit)
  return { host, ov, stage, world, pieces, fx, cm };
}

/** Takes a town down: its geometry, materials and pictures (all but what's shared across visits). */
function teardown(obj) {
  obj.parent?.remove(obj);
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData?.shared) continue;
      for (const k of ['map', 'alphaMap', 'emissiveMap', 'bumpMap']) if (m[k] && !m[k].userData?.shared) m[k].dispose();
      m.dispose();
    }
  });
}

// ------------------------------------------------------------------------------------------------ one visit
let current = null;

/**
 * Opens the town (closing any open one): `d` as DorpScene's data — view ('town' | 'raid' | 'news'), me, them,
 * reducedMotion, topBar / bottomBar (CSS px of the screen's panels), onPicture, onCount, onAim, onStrike(hit) →
 * Promise, onDone(r), onFail(r), news { took, tribe, blocked, goldTook }, tourists + onTourists. Resolves its controller.
 */
export async function openTown3D(d) {
  current?.close();
  if (!kit) kit = makeKit();
  const view = createView(kit, d);
  current = view;
  await view.ready;
  return view;
}
/** The open town, if any (tests, main.js). */
export const town3D = () => current;

function createView(K, d) {
  const { host, ov, stage, world, pieces, fx, cm } = K;
  const { scene, camera, renderer } = stage;
  const reduced = !!d.reducedMotion;
  const gameCanvas = document.querySelector('#game > canvas');
  let alive = true;
  let raf = 0;
  let time = 0;
  let last = performance.now();
  const bars = { top: d.topBar || 0, bottom: d.bottomBar || 0 };
  const offY = { now: 0, want: 0 };
  const cam = { pos: new THREE.Vector3(70, 40, 90), look: new THREE.Vector3(0, 8, 0), tPos: new THREE.Vector3(70, 40, 90), tLook: new THREE.Vector3(0, 8, 0), k: 2, cut: true };
  let shot = (t) => townShot(t);
  let shotT = 0;
  const updaters = [];
  const keep = [];   // (what this visit added to the scene: taken down on close)
  const skin = (() => { try { return String(JSON.parse(localStorage.getItem('stapel.v1.econ') || '{}')?.skins?.wear?.blocks || 'kleur'); } catch { return 'kleur'; } })();

  // the box over Stapel's own canvas
  function place() {
    const r = gameCanvas?.getBoundingClientRect() || { left: 0, top: 0, width: innerWidth, height: innerHeight };
    host.style.left = `${r.left}px`;
    host.style.top = `${r.top}px`;
    host.style.width = `${r.width}px`;
    host.style.height = `${r.height}px`;
    stage.resize();
    frameBars(0);
  }
  /** The panels at the top and the bottom: what's between them is where the town is framed. */
  function frameBars(ms = 600) {
    const H = host.clientHeight || innerHeight;
    const band = Math.max(80, H - bars.top - bars.bottom);
    offY.want = H / 2 - (bars.top + band / 2);
    if (!ms || reduced) offY.now = offY.want;
    ov.style.setProperty('--d3-top', `${bars.top + 10}px`);
    ov.style.setProperty('--d3-pop', `${bars.top + band * 0.22}px`);
    ov.style.setProperty('--d3-reward', `${bars.top + band * 0.3}px`);
  }
  const bandFit = () => {
    const H = host.clientHeight || innerHeight;
    return clamp(H / Math.max(80, H - bars.top - bars.bottom), 1, 1.9);
  };
  addEventListener('resize', place);

  // ---------------------------------------------------------------------------------------------- the towns
  const me = d.me || {};
  const myPlan = planTown3D({ id: me.id || 'JOU', people: me.people | 0, tribe: me.tribe || 'vuur', gold: me.gold | 0 });
  const them = d.them || null;
  const theirPlan = d.view === 'raid' && them ? planTown3D({ id: them.id || 'HULLE', people: them.people | 0, tribe: them.tribe || 'water', gold: them.gold | 0 }) : null;
  let myIsle = null;
  let myTown = null;
  let theirIsle = null;
  let theirTown = null;
  function failed(e) {
    console.error(e);
    d.onFail?.(e);
  }

  // ---------------------------------------------------------------------------------------------- the camera
  const myC = new THREE.Vector3(ME_ISLE.cx, ME_ISLE.top + 6, ME_ISLE.cz);
  const theirC = new THREE.Vector3(THEM_ISLE.cx, THEM_ISLE.top + 6, THEM_ISLE.cz);
  /** Your town from the sea, the camera drifting slowly round (framed between the screen's panels). */
  function townShot(t) {
    const a = 0.35 + (reduced ? 0 : t * 0.025);
    const f = bandFit();
    cam.tPos.set(myC.x + Math.sin(a) * 74 * f, 26 + 8 * f, myC.z + Math.cos(a) * 74 * f);
    cam.tLook.copy(myC).add(new THREE.Vector3(0, 2, 0));
    cam.k = 1.6;
  }
  function loop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    shotT += dt;
    shot(shotT, dt);
    if (cam.cut) {
      cam.pos.copy(cam.tPos);
      cam.look.copy(cam.tLook);
      cam.cut = false;
    }
    const a = 1 - Math.exp(-cam.k * dt);
    cam.pos.lerp(cam.tPos, a);
    cam.look.lerp(cam.tLook, 1 - Math.exp(-cam.k * 1.6 * dt));
    offY.now += (offY.want - offY.now) * (1 - Math.exp(-dt * 5));
    const W = host.clientWidth || 1;
    const H = host.clientHeight || 1;
    camera.setViewOffset(W, H, 0, offY.now, W, H);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    world.sun.target.position.copy(cam.look);
    world.sun.position.copy(cam.look).addScaledVector(SUN_DIR, 160);
    world.update(time);
    for (const f of updaters) f(time, dt);
    pieces.tick(time);
    fx.update(dt, camera);
    stage.render(dt);
  }
  const nextFrame = () => new Promise((res) => requestAnimationFrame(() => res()));
  function wait(ms) {
    return new Promise((res) => setTimeout(res, reduced ? Math.min(ms, 120) : ms));
  }

  // ---------------------------------------------------------------------------------------------- the words
  const popEl = ov.querySelector('.d3-pop');
  let popT = 0;
  function pop(text, color = '#ffd23f', ms = 1600) {
    popEl.textContent = text;
    popEl.style.color = color;
    popEl.classList.add('on');
    clearTimeout(popT);
    popT = setTimeout(() => popEl.classList.remove('on'), ms);
  }
  const rewardEl = ov.querySelector('.d3-reward');
  function showReward(main, sub = '') {
    rewardEl.querySelector('b').textContent = main;
    rewardEl.querySelector('span').textContent = sub;
    rewardEl.classList.add('on');
  }

  // ---------------------------------------------------------------------------------------------- people flying
  // (parachutes: a canopy in their tribe's colours over a small figure; instanced, MAX_FLY + the tourists)
  const NF = 24;
  const chuteMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.95, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide }), NF);
  const manMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.5, 3, 6), new THREE.MeshStandardMaterial({ color: '#2a3a52', roughness: 0.8 }), NF);
  for (let i = 0; i < NF; i++) chuteMesh.setColorAt(i, new THREE.Color('#ffffff'));
  chuteMesh.frustumCulled = manMesh.frustumCulled = false;
  scene.add(chuteMesh, manMesh);
  keep.push(chuteMesh, manMesh);
  const flyers = [];
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NF; i++) { chuteMesh.setMatrixAt(i, hidden); manMesh.setMatrixAt(i, hidden); }
  /** One person from `from` to `to` (world), over `secs`, on a canopy of `color`; onLand when there. */
  function fly(from, to, { secs = 2.8, color = '#e8452c', gold = false, delay = 0, arc = 12, onLand = null } = {}) {
    const slot = flyers.length % NF;
    flyers.push({ slot, from: from.clone(), to: to.clone(), t: -delay, secs: reduced ? 0.25 : secs, arc, gold, onLand, done: false });
    chuteMesh.setColorAt(slot, new THREE.Color(gold ? '#ffd84a' : color));
    chuteMesh.instanceColor.needsUpdate = true;
  }
  const fm = new THREE.Matrix4();
  const fq = new THREE.Quaternion();
  const fp = new THREE.Vector3();
  const fs = new THREE.Vector3();
  updaters.push((t, dt) => {
    let moved = false;
    for (const f of flyers) {
      if (f.done) continue;
      f.t += dt;
      if (f.t < 0) continue;
      const u = Math.min(1, f.t / f.secs);
      fp.lerpVectors(f.from, f.to, ease(u));
      fp.y += Math.sin(u * Math.PI) * f.arc;
      fq.setFromEuler(new THREE.Euler(0, 0, Math.sin(t * 2.4 + f.slot) * 0.22 * (1 - u)));
      const open = Math.min(1, f.t / 0.3);
      fs.set(open, open, open);
      fm.compose(fp.clone().add(new THREE.Vector3(0, 1.5, 0)), fq, fs);
      chuteMesh.setMatrixAt(f.slot, fm);
      fs.setScalar(1);
      fm.compose(fp, fq, fs);
      manMesh.setMatrixAt(f.slot, fm);
      moved = true;
      if (f.gold && Math.random() < 0.3) fx.sparkle(fp, 2, '#ffe9a0', 1.2);
      if (u >= 1) {
        f.done = true;
        chuteMesh.setMatrixAt(f.slot, hidden);
        manMesh.setMatrixAt(f.slot, hidden);
        f.onLand?.();
      }
    }
    if (moved || flyers.some((f) => f.done)) {
      chuteMesh.instanceMatrix.needsUpdate = true;
      manMesh.instanceMatrix.needsUpdate = true;
    }
  });
  /** Where the flyers are now (their middle): the camera rides along with them. */
  function flyersMiddle(out) {
    const live = flyers.filter((f) => !f.done && f.t >= 0);
    out.set(0, 0, 0);
    if (!live.length) return null;
    for (const f of live) {
      const u = Math.min(1, f.t / f.secs);
      out.add(new THREE.Vector3().lerpVectors(f.from, f.to, ease(u)).add(new THREE.Vector3(0, Math.sin(u * Math.PI) * f.arc, 0)));
    }
    return out.multiplyScalar(1 / live.length);
  }

  // ---------------------------------------------------------------------------------------------- the town at rest
  /** The town says hello: a sparkle runs over its lit windows. */
  function greet() {
    if (reduced || !myTown) return;
    myTown.windows.filter((w) => w.lit).slice(0, 10).forEach((w, k) => setTimeout(() => alive && fx.sparkle(myTown.windowAt(w), 6, w.gold ? '#fff1a0' : '#ffe38c', 2), 200 + k * 120));
  }
  /** A landmark bought: it drops from the sky and lands with dust. */
  function buyMark(id) {
    if (!myTown) return;
    const g = myTown.addMark(id, { drop: true });
    if (g) setTimeout(() => alive && pop(S.dorpBought(S.dorpMarkNames?.[id] || id), '#ffe38c', 2200), 900);
  }
  function thud(g, n) {
    const p = g.getWorldPosition(new THREE.Vector3());
    fx.hit(p.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, 1, 0), n === 1 ? 1.2 : 0.4);
    if (n === 1) { stage.shake(0.5); audio.play('land'); haptics.heavy(); }
  }
  /** The day's tourists: up to 8 parachute in from the sea into the town's windows, then "+12 TOERISTE!". */
  function playTourists(n) {
    const homes = myTown.windows.filter((w) => w.lit).slice(0, Math.min(8, n));
    for (const w of homes) myTown.setLit(w, false);
    if (!homes.length) { d.onTourists?.(n); return; }
    let landed = 0;
    homes.forEach((w, k) => {
      const to = myTown.windowAt(w);
      const from = new THREE.Vector3(myC.x + 60 + (k % 3) * 6, 2, myC.z + 40 - k * 3);
      fly(from, to, {
        secs: 2.6, delay: 0.3 + k * 0.16, color: ['#e8452c', '#1f8fd6', '#3fae3a', '#f2c230'][k % 4], arc: 10,
        onLand: () => {
          myTown.setLit(w, true);
          fx.sparkle(to, 10, '#ffe38c', 3);
          audio.play('room', { n: ++landed });
          if (landed === homes.length) {
            pop(S.dorpTouristsPop(n), '#ffd23f', 2600);
            audio.play('milestone');
            d.onTourists?.(n);
          }
        },
      });
    });
  }

  // ------------------------------------------------------------------------------------------------- the raid
  const aimEls = { power: ov.querySelector('.d3-power'), wind: ov.querySelector('.d3-wind') };
  let aimState = null;
  /** The crane barge offshore (your tribe's colours), and the arrow it aims with. */
  function makeBarge(tribe) {
    const g = new THREE.Group();
    const colr = TRIBES[tribe]?.cloth || '#c8321f';
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 4.6), new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.7 }));
    hull.position.y = 0.4;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.25, 4.2), new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.8 }));
    deck.position.y = 1.3;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(9.05, 0.4, 4.65), new THREE.MeshStandardMaterial({ color: colr, roughness: 0.5 }));
    stripe.position.y = 0.9;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 6, 8), new THREE.MeshStandardMaterial({ color: '#f2b51c', roughness: 0.45, metalness: 0.3 }));
    mast.position.set(-2.4, 4.3, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.32, 0.32), mast.material);
    arm.position.set(0.4, 7.1, 0);
    arm.rotation.z = 0.32;
    g.add(hull, deck, stripe, mast, arm);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const arrow = pieces.pin();
    arrow.scale.setScalar(1.4);
    g.add(arrow);
    arrow.position.set(2.5, 2.2, 0);
    return { g, arrow, arm };
  }
  /** The power bar's level at time t (s): up and down, 0.3 to 1. */
  const powerAt = (t) => { const u = (t / (AIM.powerPeriod / 2)) % 2; return 0.3 + 0.7 * (u < 1 ? u : 2 - u); };
  /** The arrow's swing at time t (s), radians either side of their town's middle. */
  const azAt = (t) => AIM.maxAz * Math.sin((t / AIM.dirPeriod) * Math.PI * 2);
  /**
   * The throw from `from` (world) along `dir` (unit, level), `range` m on level ground at 48°, pushed sideways by
   * `windK` (-1 to 1): its path and what it meets first ({ kind: 'building' | 'ground' | 'sea', at, b }).
   */
  function flight(from, dir, range, windK) {
    const v0 = Math.sqrt((range * AIM.g) / Math.sin(2 * AIM.angle));
    const vel = new THREE.Vector3(dir.x * v0 * Math.cos(AIM.angle), v0 * Math.sin(AIM.angle), dir.z * v0 * Math.cos(AIM.angle));
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const p = from.clone();
    const path = [p.clone()];
    const step = 1 / 90;
    for (let i = 0; i < 90 * 8; i++) {
      vel.y -= AIM.g * step;
      vel.addScaledVector(side, windK * AIM.wind * step);
      p.addScaledVector(vel, step);
      if (i % 3 === 0) path.push(p.clone());
      // what it meets: a building (its box), the island's grass, the sea
      for (const b of theirTown.buildings) {
        if (b.box.containsPoint(p)) { path.push(p.clone()); return { kind: 'building', at: p.clone(), b, path, secs: (i + 1) * step }; }
      }
      const dx = p.x - theirIsle.cx;
      const dz = p.z - theirIsle.cz;
      const onIsle = Math.hypot(dx, dz) < theirIsle.radiusAt(Math.atan2(dx, dz));
      if (onIsle && p.y <= theirIsle.top + 0.2) { path.push(p.clone()); return { kind: 'ground', at: p.clone(), path, secs: (i + 1) * step }; }
      if (p.y <= 0) { path.push(p.clone()); return { kind: 'sea', at: p.clone(), path, secs: (i + 1) * step }; }
    }
    return { kind: 'sea', at: p.clone(), path, secs: 8 };
  }
  const rateOf = (res, goal) => (res.kind === 'building' ? (res.b === goal ? 'P' : 'G') : 'S');

  async function playRaid() {
    if (!theirTown) { d.onDone?.(null); return; }
    const nMe = me.people | 0;
    const nThem = them.people | 0;
    d.onCount?.({ me: nMe, them: nThem });
    // 1. across the sea: up over your town, both islands in sight, down to the barge in front of theirs
    const u = new THREE.Vector3().subVectors(myC, theirC).setY(0).normalize();
    const bargeAt = theirC.clone().setY(0).addScaledVector(u, THEM_ISLE.radius + 22);
    const barge = makeBarge(me.tribe || 'vuur');
    barge.g.position.copy(bargeAt);
    barge.g.rotation.y = Math.atan2(u.z, -u.x);   // (its bow, local +x, towards their town)
    scene.add(barge.g);
    keep.push(barge.g);
    updaters.push((t) => { barge.g.position.y = Math.sin(t * 1.2) * 0.18; barge.g.rotation.z = Math.sin(t * 0.9) * 0.025; });
    audio.play('wind');
    const aimPos = bargeAt.clone().addScaledVector(u, 17).add(new THREE.Vector3(0, 10, 0));
    const aimLook = theirC.clone().add(new THREE.Vector3(0, 1, 0));
    const start = cam.pos.clone();
    const over = new THREE.Vector3((myC.x + theirC.x) / 2, 80, (myC.z + theirC.z) / 2).addScaledVector(new THREE.Vector3(-u.z, 0, u.x), 60);
    const flyT = reduced ? 0.3 : 3.6;
    shotT = 0;
    shot = (t) => {
      const k = ease(Math.min(1, t / flyT));
      const a1 = new THREE.Vector3().lerpVectors(start, over, k);
      const a2 = new THREE.Vector3().lerpVectors(over, aimPos, k);
      cam.tPos.lerpVectors(a1, a2, k);
      cam.tLook.lerpVectors(myC, aimLook, ease(Math.min(1, t / 1.2)));
      cam.k = 4;
    };
    await wait(flyT * 1000 + 200);
    if (!alive) return;
    // 2. the aim: the fullest building glows; the power bar, then the arrow; the wind
    const goal = theirTown.fullest();
    const beacon = makeBeacon(goal);
    const windK = Math.round(((windFor(Math.random) / WIND.max) || 0) * 100) / 100;
    showWind(windK);
    shot = () => { cam.tPos.copy(aimPos); cam.tLook.copy(aimLook); cam.k = 3; };
    d.onAim?.();
    const aim = await aimThrow(barge, bargeAt, u, goal, windK);
    hideAim();
    beacon.remove();
    if (!alive) return;
    // 3. the throw: the block flies (the camera with it); where it lands rates the raid; the server settles it meanwhile
    const dir = new THREE.Vector3(-u.x, 0, -u.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), aim.az);
    const from = bargeAt.clone().add(new THREE.Vector3(0, 7.2, 0));
    const D = bargeAt.distanceTo(theirC.clone().setY(0));
    const res = flight(from, dir, D * (0.42 + 1.06 * aim.power), windK);
    const hit = aim.forced || rateOf(res, goal);
    barge.arm.rotation.z = -0.4;
    audio.play('fling');
    haptics.tap();
    const answer = d.onStrike ? d.onStrike(hit) : Promise.resolve({ ok: true, took: 0 });
    await throwAlong(res, me.tribe || 'vuur');
    if (!alive) return;
    const label = { P: [`${S.perfect.toUpperCase()}`, '#ffd23f'], G: [S.good.toUpperCase(), '#ffffff'], S: [S.skew.toUpperCase(), '#ffb36b'] }[hit];
    pop(label[0], label[1], 1400);
    audio.play(hit === 'P' ? 'perfect' : hit === 'G' ? 'good' : 'skew', { combo: 3 });
    const struck = res.kind === 'building' ? res.b : goal;
    const [r] = await Promise.all([answer, strike(me.tribe || 'vuur', theirTown, struck, res.at)]);
    if (!alive) return;
    if (!r || !r.ok) {
      shot = (t) => townShot(t);
      d.onFail?.(r);
      return;
    }
    if (r.blocked) {
      wallHolds(theirTown);
      await wait(1500);
      shot = (t) => townShot(t);
      await wait(1400);
      d.onDone?.(r);
      return;
    }
    // 4. their people parachute over the sea into your dark windows (the camera rides home with them)
    const took = Math.max(0, r.took | 0);
    const goldTook = Math.max(0, r.goldTook | 0);
    const bIdx = theirTown.buildings.indexOf(struck);
    const near = theirTown.windows.filter((w) => w.lit).sort((a, b) => ((a.bi === bIdx ? 0 : 1) - (b.bi === bIdx ? 0 : 1)) || (theirTown.windowAt(a).distanceTo(res.at) - theirTown.windowAt(b).distanceTo(res.at)));
    const set = near.slice(0, Math.min(MAX_FLY, took));
    const homes = myTown.windows.filter((w) => !w.lit).slice(0, set.length);
    if (!set.length) { reward(took, goldTook, r); return; }
    let landed = 0;
    set.forEach((w, k) => {
      const gold = k < goldTook;
      const fromW = theirTown.windowAt(w);
      const home = homes[k];
      const to = home ? myTown.windowAt(home) : myC.clone().add(new THREE.Vector3((k % 5) - 2, 6, 0));
      setTimeout(() => { if (alive) theirTown.setLit(w, false); }, k * 110);
      fly(fromW, to, {
        secs: 5.5 + (k % 5) * 0.2, delay: 0.2 + k * 0.11, color: TRIBES[them.tribe]?.chute || '#1f8fd6', gold, arc: 18,
        onLand: () => {
          landed += 1;
          if (home) myTown.setLit(home, true, gold);
          fx.sparkle(to, gold ? 18 : 8, gold ? '#fff1a0' : '#ffe38c', gold ? 5 : 3);
          audio.play(gold ? 'gold' : 'room', { n: landed });
          const upTo = Math.round((landed / set.length) * took);
          d.onCount?.({ me: nMe + upTo, them: Math.max(0, nThem - upTo) });
          if (landed === set.length) reward(took, goldTook, r);
        },
      });
      if (k % 3 === 0) setTimeout(() => alive && audio.play('chute'), 200 + k * 110);
    });
    // the camera rides with them, then settles on your town
    const mid = new THREE.Vector3();
    shotT = 0;
    shot = (t) => {
      const c = flyersMiddle(mid);
      if (!c || t > 7) { townShot(t); return; }
      const toHome = new THREE.Vector3().subVectors(myC, c).setY(0).normalize();
      const ride = c.clone().addScaledVector(toHome, -36).add(new THREE.Vector3(0, 18, 0)).add(new THREE.Vector3(-toHome.z, 0, toHome.x).multiplyScalar(20));
      const w = ease(Math.min(1, t / 1.6));
      cam.tPos.lerpVectors(aimPos, ride, w);
      cam.tPos.y += Math.sin(w * Math.PI) * 16;
      cam.tLook.lerpVectors(res.at, c.clone().lerp(myC, 0.55), w);
      cam.k = 3;
    };
  }
  /** The glow on the target: a soft pillar of light round the fullest building, an arrow bobbing over it. */
  function makeBeacon(b) {
    const box = b.box;
    const size = box.getSize(new THREE.Vector3());
    const mid = box.getCenter(new THREE.Vector3());
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(size.x, size.z) * 0.7, Math.max(size.x, size.z) * 0.8, size.y + 6, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd46a', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
    pillar.position.copy(mid);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(1, 2.2, 14), new THREE.MeshBasicMaterial({ color: '#ffd23f', toneMapped: false }));
    arrow.rotation.x = Math.PI;
    scene.add(pillar, arrow);
    const f = (t) => {
      arrow.position.set(mid.x, box.max.y + 4 + Math.sin(t * 5) * 0.8, mid.z);
      pillar.material.opacity = 0.12 + 0.08 * Math.sin(t * 4);
    };
    updaters.push(f);
    return { remove: () => { updaters.splice(updaters.indexOf(f), 1); teardown(pillar); teardown(arrow); } };
  }
  function showWind(k) {
    const el = aimEls.wind;
    const n = Math.round(Math.abs(k) * 5);
    el.querySelector('b').textContent = k < 0 ? '◀' : k > 0 ? '▶' : '';
    el.classList.toggle('left', k < 0);
    [...el.querySelectorAll('.d3-wbars i')].forEach((b, i) => b.classList.toggle('on', i < n));
    el.querySelector('em').textContent = n ? `${Math.round(Math.abs(k) * 40)} km/h` : S.dorp3dCalm;
    el.classList.add('on');
  }
  function hideAim() {
    aimEls.power.classList.remove('on', 'held');
    aimEls.wind.classList.remove('on');
  }
  /**
   * The aim: the power bar runs (a tap holds it), then the arrow swings across their town (a tap throws). Untapped for
   * a while, it throws as it stands. Resolves { power, az, forced? }.
   */
  function aimThrow(barge, bargeAt, u, goal, windK) {
    return new Promise((resolve) => {
      const p = aimEls.power;
      const fill = p.querySelector('.d3-pbar i');
      const mark = p.querySelector('.d3-pbar em');
      const num = p.querySelector('b');
      p.classList.add('on');
      // (`left`: the throw goes by itself after AIM.autoMs of his aiming time; a phone turned sideways or an app away
      // stops the clock (d.covered), so a throw is never made while he can't see it. 18 Oct: it fired after 14 s regardless)
      const st = { step: 'power', t: 0, power: 0, az: 0, done: false, left: (d.autoAim != null ? d.autoAim : AIM.autoMs) / 1000 };
      aimState = st;
      const Y = new THREE.Vector3(0, 1, 0);
      const f = (t, dt) => {
        if (st.done || d.covered?.()) return;
        st.t += dt;
        st.left -= dt;
        if (st.left <= 0) { queueMicrotask(() => finish()); return; }   // (after this frame's updaters)
        if (st.step === 'power') {
          const v = powerAt(st.t);
          fill.style.height = `${Math.round(v * 100)}%`;
          mark.style.bottom = `${Math.round(v * 100)}%`;
          num.textContent = `${Math.round(v * 100)}%`;
          barge.arrow.visible = false;
        } else {
          st.az = azAt(st.t);
          barge.arrow.visible = true;
          const dv = new THREE.Vector3(-u.x, 0, -u.z).applyAxisAngle(Y, st.az);
          barge.arrow.rotation.set(0, Math.atan2(-dv.z, dv.x) - barge.g.rotation.y, 0.5);   // (along the throw, tilted up)
        }
      };
      updaters.push(f);
      const finish = (forced = null) => {
        if (st.done) return;
        st.done = true;
        updaters.splice(updaters.indexOf(f), 1);
        host.removeEventListener('pointerdown', onTap);
        barge.arrow.visible = false;
        aimState = null;
        resolve({ power: st.power || powerAt(st.t), az: st.az, forced });
      };
      const onTap = (e) => {
        if (e.target.closest?.('button')) return;
        tap();
      };
      const tap = () => {
        if (st.done) return;
        if (st.step === 'power') {
          st.power = powerAt(st.t);
          st.step = 'dir';
          st.t = 0;
          p.classList.add('held');
          audio.play('click');
          haptics.tap();
          d.onAimStep?.('dir');
          return;
        }
        st.az = azAt(st.t);
        finish();
      };
      st.tap = tap;
      st.finish = finish;
      st.goal = goal;
      st.solve = (want) => solve(bargeAt, u, goal, windK, want, st);
      setTimeout(() => { if (!st.done) host.addEventListener('pointerdown', onTap); }, 250);
    });
  }
  /**
   * (tests) an aim whose throw lands on `want` ('P', 'G', 'S'), given the power already held (or any): the middle of the
   * widest run of angles that land there (a tap a frame late still lands).
   */
  function solve(bargeAt, u, goal, windK, want, st) {
    const from = bargeAt.clone().add(new THREE.Vector3(0, 7.2, 0));
    const D = bargeAt.distanceTo(theirC.clone().setY(0));
    const powers = st.step === 'dir' ? [st.power] : Array.from({ length: 36 }, (_, i) => 0.3 + i * 0.02);
    let best = null;
    for (const pw of powers) {
      let run = null;
      for (let a = -AIM.maxAz; a <= AIM.maxAz + 1e-9; a += 0.005) {
        const dir = new THREE.Vector3(-u.x, 0, -u.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        const hit = rateOf(flight(from, dir, D * (0.42 + 1.06 * pw), windK), goal) === want;
        if (hit) run = run ? { ...run, to: a } : { from: a, to: a };
        if ((!hit || a + 0.005 > AIM.maxAz + 1e-9) && run) {
          if (!best || run.to - run.from > best.w) best = { power: pw, az: (run.from + run.to) / 2, w: run.to - run.from };
          run = null;
        }
      }
    }
    return best && { power: best.power, az: best.az };
  }
  /** The block along its path in real time (it tumbles), the camera behind it; a trail in your element's colour. */
  function throwAlong(res, tribe) {
    return new Promise((resolve) => {
      const blk = pieces.block('crate', 0, ELEMENT_OF[tribe] || 'vuur', skin);
      scene.add(blk);
      fx.trail(blk, false, ELEMENT_OF[tribe] || 'vuur');
      const secs = reduced ? 0.3 : Math.max(1.2, res.secs);
      let t = 0;
      const n = res.path.length - 1;
      const spin = new THREE.Vector3(Math.random() * 4 - 2, Math.random() * 3, Math.random() * 4 - 2);
      shotT = 0;
      const f = (tt, dt) => {
        t += dt;
        const u = Math.min(1, t / secs);
        const j = u * n;
        const a = Math.floor(j);
        const b = Math.min(n, a + 1);
        blk.position.lerpVectors(res.path[a], res.path[b], j - a);
        blk.rotation.x += spin.x * dt;
        blk.rotation.y += spin.y * dt;
        blk.rotation.z += spin.z * dt;
        if (u >= 1) {
          updaters.splice(updaters.indexOf(f), 1);
          fx.stopTrail();
          blk.parent?.remove(blk);
          fx.shatter(res.at, blk.children[0]?.material?.chip || cm.sandstone, { n: 12, size: 0.8 });
          if (res.kind === 'sea') fx.splash(res.at.x, { size: 1.4, z: res.at.z });
          stage.shake(res.kind === 'building' ? 1 : 0.5);
          resolve();
        }
      };
      updaters.push(f);
      // the camera: behind the block and a little above, looking where it's going
      shot = () => {
        const back = new THREE.Vector3().subVectors(res.path[Math.min(res.path.length - 1, 4)], res.path[0]).setY(0).normalize();
        cam.tPos.copy(blk.position).addScaledVector(back, -22).add(new THREE.Vector3(0, 9, 0));
        cam.tLook.copy(blk.position).lerp(res.at, 0.55);
        cam.k = 5;
      };
    });
  }
  /** Your tribe's strike on the building hit: fire at its windows, a wave over it, or vines pulling. */
  async function strike(tribe, town, b, at) {
    haptics.heavy();
    const box = b.box;
    const mid = box.getCenter(new THREE.Vector3());
    shot = () => {
      const u = new THREE.Vector3().subVectors(myC, mid).setY(0).normalize();
      cam.tPos.copy(mid).addScaledVector(u, 30).add(new THREE.Vector3(0, 8, 0));
      cam.tLook.copy(mid);
      cam.k = 3;
    };
    // the building rocks
    const g = b.group;
    const y0 = g.rotation.z;
    const rock = (t) => { g.rotation.z = y0 + Math.sin(t * 30) * 0.02 * Math.max(0, 1 - (t - t0) / 0.8); };
    const t0 = time;
    updaters.push(rock);
    setTimeout(() => { const i = updaters.indexOf(rock); if (i >= 0) updaters.splice(i, 1); g.rotation.z = y0; }, 900);
    const wins = town.windows.filter((w) => w.bi === town.buildings.indexOf(b)).slice(0, 8).map((w) => town.windowAt(w));
    if (tribe === 'vuur') {
      audio.play('heat');
      const f = () => { for (const p of wins.slice(0, 6)) if (Math.random() < 0.6) fx.flame(p, 1.6, 1.1); };
      updaters.push(f);
      fx.boom(at, 5);
      await wait(1500);
      updaters.splice(updaters.indexOf(f), 1);
    } else if (tribe === 'water') {
      audio.play('splash');
      fx.wave(new THREE.Vector3(mid.x, box.min.y, mid.z), 1, 1.6, box.min.y + 0.05, mid.x + 8);
      fx.splash(mid.x, { size: 1.6, z: mid.z });
      await wait(1500);
    } else {
      audio.play('creak');
      const anchors = wins.slice(0, 4).map((p) => { const o = new THREE.Object3D(); o.position.copy(p); o.userData.w = 1.2; o.userData.h = 1.4; scene.add(o); return o; });
      const until = performance.now() + 1300;
      fx.vines(anchors.map((o) => ({ target: o, side: 1, edgeX: mid.x - 6, rimY: box.min.y })), () => performance.now() < until);
      await wait(1400);
      setTimeout(() => { for (const o of anchors) scene.remove(o); }, 900);
    }
    audio.play('thunder');
  }
  /** A wall holds: it flashes, shakes, and crumbles (one wall is gone). */
  function wallHolds(town) {
    audio.play('board');
    stage.shake(0.8);
    pop(`🛡️ ${S.dorpWallHeld}`, '#bfe3ff', 2200);
    const w = town.walls[town.walls.length - 1];
    if (!w) return;
    const p = w.getWorldPosition(new THREE.Vector3());
    fx.hit(p.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3(0, 1, 0), 1.4);
    setTimeout(() => {
      if (!alive) return;
      fx.shatter(p.clone().add(new THREE.Vector3(0, 1.5, 0)), cm.wall, { n: 16, size: 1.1 });
      w.visible = false;
      town.walls.pop();
    }, 700);
  }
  /** The reward: turning light behind "+18 MENSE!" (and the golden ones), the town's lights twinkle, a fanfare. */
  function reward(took, goldTook, res) {
    showReward((took ? S.dorpTook(took) : S.dorpEmpty(them?.name || '')).toUpperCase(), goldTook ? S.dorpGoldPop(goldTook) : '');
    audio.play('record');
    if (goldTook) setTimeout(() => alive && audio.play('gold'), 420);
    haptics.perfect();
    myTown.windows.filter((w) => w.lit).slice(0, 30).forEach((w) => setTimeout(() => alive && fx.sparkle(myTown.windowAt(w), 4, '#ffe38c', 2), Math.random() * 600));
    shot = (t) => townShot(t);
    setTimeout(() => { if (alive) d.onDone?.(res); }, 900);
    setTimeout(() => rewardEl.classList.remove('on'), 3600);
  }

  // ------------------------------------------------------------------------------------- terwyl jy weg was
  /** Their barge throws at your town; your people parachute away over the sea: d.news { took, tribe, blocked, goldTook }. */
  async function playNews() {
    const n = d.news || {};
    const took = Math.max(0, n.took | 0);
    const nMe = (me.people | 0) + took;   // the town as it was before
    // the windows they emptied are lit again for the replay
    const extra = myTown.windows.filter((w) => !w.lit).slice(0, Math.min(MAX_FLY, took));
    extra.forEach((w, k) => myTown.setLit(w, true, k < (n.goldTook | 0)));
    d.onCount?.({ me: nMe });
    await wait(700);
    if (!alive) return;
    // their barge, offshore, throws at your fullest building
    const u = new THREE.Vector3(0.35, 0, 1).normalize();
    const bargeAt = myC.clone().setY(0).addScaledVector(u, ME_ISLE.radius + 22);
    const barge = makeBarge(n.tribe || 'vuur');
    barge.g.position.copy(bargeAt);
    barge.g.rotation.y = Math.atan2(u.z, -u.x);
    scene.add(barge.g);
    keep.push(barge.g);
    updaters.push((t) => { barge.g.position.y = Math.sin(t * 1.2) * 0.18; });
    const goal = myTown.fullest();
    const mid = goal.box.getCenter(new THREE.Vector3());
    shot = () => {
      cam.tPos.copy(bargeAt).addScaledVector(u, 18).add(new THREE.Vector3(12, 12, 0));
      cam.tLook.copy(mid).lerp(bargeAt, 0.3);
      cam.k = 2.5;
    };
    await wait(1200);
    if (!alive) return;
    // (the throw from their barge onto your building)
    const from = bargeAt.clone().add(new THREE.Vector3(0, 7.2, 0));
    const path = [];
    for (let i = 0; i <= 40; i++) {
      const k = i / 40;
      path.push(new THREE.Vector3().lerpVectors(from, mid, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 16, 0)));
    }
    audio.play('fling');
    await throwAlong({ path, at: mid.clone(), kind: 'building', secs: 2.2 }, n.tribe || 'vuur');
    if (!alive) return;
    if (n.blocked) {
      await strike(n.tribe || 'vuur', myTown, goal, mid);
      wallHolds(myTown);
      await wait(1300);
      shot = (t) => townShot(t);
      d.onDone?.(null);
      return;
    }
    await strike(n.tribe || 'vuur', myTown, goal, mid);
    if (!alive) return;
    if (!extra.length) { shot = (t) => townShot(t); d.onDone?.(null); return; }
    shot = (t) => townShot(t);
    let gone = 0;
    extra.forEach((w, k) => {
      const fromW = myTown.windowAt(w);
      const gold = w.gold;
      setTimeout(() => { if (alive) myTown.setLit(w, false); }, k * 120);
      const to = bargeAt.clone().add(new THREE.Vector3((k % 4) * 3 - 4, 2, 30 + (k % 3) * 6));
      fly(fromW, to, {
        secs: 3.2, delay: 0.1 + k * 0.12, color: TRIBES[me.tribe]?.chute || '#e8452c', gold, arc: 14,
        onLand: () => {
          gone += 1;
          d.onCount?.({ me: nMe - Math.round((gone / extra.length) * took) });
          if (gone === extra.length) {
            audio.play('lost');
            setTimeout(() => { if (alive) d.onDone?.(null); }, 500);
          }
        },
      });
    });
  }

  // ------------------------------------------------------------------------------------------- the menu's picture
  /** A picture of the town as it stands, for the menu's town button (d.onPicture(dataUrl)). */
  function snapshot() {
    if (!d.onPicture || !alive) return;
    try {
      stage.render(0);
      const src = renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 168;
      const x = c.getContext('2d');
      const H = src.height;
      const W = src.width;
      const k = (host.clientHeight || 1) / H;
      const top = bars.top / k;
      const bandH = Math.max(40, H - (bars.top + bars.bottom) / k);
      const sh = Math.min(bandH, W * 0.56);
      x.drawImage(src, 0, top + (bandH - sh) / 2, W, sh, 0, 0, 300, 168);
      d.onPicture(c.toDataURL('image/jpeg', 0.82));
    } catch { /* no picture this time */ }
  }

  // (everything above is in place: build and go)
  const ready = (async () => {
    host.style.display = 'block';
    place();
    loop(performance.now());
    // (the block materials, a few a frame: the screen keeps answering while they're painted)
    const jobs = [...planMaterials(myPlan).map(([s, c]) => [s, skin, c]), ...(theirPlan ? planMaterials(theirPlan).map(([s, c]) => [s, 'kleur', c]) : [])];
    for (let i = 0; i < jobs.length; i++) {
      pieces.prepare(jobs[i][0], jobs[i][1], jobs[i][2], 1);
      if (i % 2 === 1) await nextFrame();
      if (!alive) return;
    }
    myIsle = makeIsle({ ...ME_ISLE, seed: 3, mats: world.mats });
    myTown = buildTown({ plan: myPlan, isle: myIsle, pieces, renderer, cm, skin, marks: me.marks || [], walls: me.walls | 0, seed: 3 });
    scene.add(myIsle.group, myTown.group);
    keep.push(myIsle.group, myTown.group);
    updaters.push((t, dt) => myTown.update(t, dt));
    myTown.group.userData.onThud = (g, n) => thud(g, n);
    if (theirPlan) {
      theirIsle = makeIsle({ ...THEM_ISLE, seed: 8, mats: world.mats });
      theirTown = buildTown({ plan: theirPlan, isle: theirIsle, pieces, renderer, cm, skin: 'kleur', marks: them.marks || [], walls: them.walls | 0, seed: 8 });
      scene.add(theirIsle.group, theirTown.group);
      keep.push(theirIsle.group, theirTown.group);
      updaters.push((t, dt) => theirTown.update(t, dt));
    }
    world.sea.uniforms.uIsle1.value.z = theirTown ? THEM_ISLE.radius * 0.93 : -100;   // (no foam where no island stands)
    // (the islands, for what falls on them: a strike's broken pieces land on the ground and glance off the cliffs;
    // set fresh each visit, the stage is the same one)
    scene.userData.solids = [myIsle, theirIsle].filter(Boolean).map((i) => ({ x: i.cx, z: i.cz, top: i.top, radiusAt: (y, a) => i.radiusAt(a) + Math.max(0, i.top - y) * 0.12 }));
    if (!alive) return;
    // what this visit is for
    if (d.view === 'raid') wait(450).then(() => alive && playRaid().catch(failed));
    else if (d.view === 'news') wait(500).then(() => alive && playNews().catch(failed));
    else if (d.tourists > 0) wait(500).then(() => alive && playTourists(d.tourists));
    else wait(400).then(() => alive && greet());
    if (d.view === 'town' || !d.view) wait(1400).then(() => alive && snapshot());
  })();
  // --------------------------------------------------------------------------------------------- the controller
  const api = {
    ready,
    get alive() { return alive; },
    /** The screen's panels changed (CSS px): the town is framed between them again. */
    setBars(top, bottom, ms = 0) {
      bars.top = top;
      bars.bottom = bottom;
      frameBars(ms);
    },
    buyMark,
    /**
     * The day's tourists into the town on screen (or the moment it's built): the server's answer came after the town
     * opened, and the town isn't built a second time for them.
     */
    tourists(n, onTourists = null) {
      if (!alive || !(n > 0)) return;
      if (onTourists) d.onTourists = onTourists;
      ready.then(() => wait(300)).then(() => { if (alive && myTown) playTourists(n); });
    },
    /** Out of the town: everything this visit made is taken down; the stage waits, hidden, for the next one. */
    close() {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      removeEventListener('resize', place);
      hideAim();
      popEl.classList.remove('on');
      rewardEl.classList.remove('on');
      fx.stopTrail();
      for (const o of keep) teardown(o);
      host.style.display = 'none';
      if (current === api) current = null;
    },
    // (tests)
    get aim() { return aimState; },
    get towns() { return { me: myTown, them: theirTown }; },
    AIM,
  };
  return api;
}
