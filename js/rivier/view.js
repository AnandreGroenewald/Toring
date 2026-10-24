// (1.20) Afgly, the rescue ride (the owner, 24 Oct 2026: "The river can be part of a rescue mission for the men you lost
// on the towers", "it needs to a river with the blocks and you need to slide left and right to dodge them", the slide
// "needs to integrate with the blocks"). After the Daily your builder dives off the top of the tower into the river and
// surfs it down to your crew's island: swipe ⟵ ⟶ (or tap a side) past Stapel's blocks floating down and the rocks, and
// scoop up the people who fell off your tower (and a few strays). Whoever you save moves into the crew's Weektoring.
// A knock never ends the ride: you stumble, and the last person you saved slips back into the water.
//
// Opened over Stapel's page like the 3D town was (main.js): one stage made the first time and kept, a ride built for each
// visit and taken down after. Course rules: js/core/rivier.js; the world: world.js; the rider: rider.js; things: things.js.
import * as THREE from '../../lib/three.module.min.js';
import { createStage, pickQuality } from '../kasteel/stage.js';
import { createPieces } from '../botsing/pieces.js';
import { buildRiverWorld, bendMaterial, BANK } from './world.js';
import { createRider } from './rider.js';
import { createThings, createIsland } from './things.js';
import { RIVER, rescueCourse, speedAt, laneX } from '../core/rivier.js';
import { portraitDataUrl, portraitsReady, CAST } from '../game/residents.js';
import { S } from '../core/strings.js';
import { audio, haptics } from '../audio.js';

const AHEAD = 230;       // m: things are made this far ahead...
const BEHIND = 14;       // ...and taken away this far behind
const DIVE_S = 1.5;      // the dive off the tower into the river
const FINISH_S = 2.6;    // the ride in to the jetty
const HIT_R = 0.62;      // m: the rider's half width for a knock (smaller than he looks: Game Brain, "hitboxes smaller than the art")
const GRAB_R = 1.55;     // m: how near a person must be to be scooped up (more than he looks: generous)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => k * k * (3 - 2 * k);

// ------------------------------------------------------------------------------------------------- the stage (once)
let kit = null;
function makeKit() {
  const host = document.createElement('div');
  host.id = 'rivier';
  host.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100px;z-index:3;display:none;overflow:hidden;touch-action:none;background:#e6c9a1;user-select:none;-webkit-user-select:none;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  host.appendChild(canvas);
  const ov = document.createElement('div');
  ov.className = 'rv-ov';
  host.appendChild(ov);
  if (!document.getElementById('rv-style')) {
    const st = document.createElement('style');
    st.id = 'rv-style';
    st.textContent = `
#rivier .rv-ov { position: absolute; inset: 0; pointer-events: none; font-family: var(--font, "Trebuchet MS", system-ui, sans-serif); color: #fff; }
#rivier .rv-top { position: absolute; left: 10px; right: 10px; top: calc(10px + var(--sat, 0px)); display: flex; align-items: center; gap: 8px; }
#rivier .rv-count { display: flex; align-items: center; gap: 6px; padding: 6px 12px 6px 8px; border-radius: 999px; background: rgba(13,34,40,.62); border: 1px solid rgba(255,255,255,.28); font-weight: 900; font-size: 18px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
#rivier .rv-count .rv-ring { width: 24px; height: 24px; border-radius: 50%; background: repeating-conic-gradient(#e2382c 0 45deg, #f6f2ea 45deg 90deg); -webkit-mask: radial-gradient(circle, transparent 38%, #000 40%); mask: radial-gradient(circle, transparent 38%, #000 40%); }
#rivier .rv-count b { font-size: 20px; }
#rivier .rv-count small { font-size: 13px; opacity: .8; font-weight: 800; }
#rivier .rv-count.bump { animation: rv-bump .32s ease-out; }
@keyframes rv-bump { 40% { transform: scale(1.18); } }
#rivier .rv-bar { flex: 1; height: 8px; border-radius: 6px; background: rgba(13,34,40,.45); overflow: hidden; border: 1px solid rgba(255,255,255,.22); }
#rivier .rv-bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #8fe3d3, #fff3c4); }
#rivier .rv-pause { pointer-events: auto; width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255,255,255,.35); background: rgba(13,34,40,.62); color: #fff; font-size: 18px; font-weight: 900; }
#rivier .rv-faces { position: absolute; left: 12px; top: calc(62px + var(--sat, 0px)); display: flex; flex-wrap: wrap; gap: 4px; max-width: 70%; }
#rivier .rv-faces img { width: 30px; height: 30px; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,.35); }
#rivier .rv-faces img.out { opacity: .25; filter: grayscale(1); }
#rivier .rv-hint { position: absolute; left: 50%; bottom: calc(18% + var(--sab, 0px)); transform: translateX(-50%); padding: 10px 18px; border-radius: 16px; background: rgba(13,34,40,.66); font-weight: 900; font-size: 18px; white-space: nowrap; opacity: 0; transition: opacity .3s; }
#rivier .rv-hint.on { opacity: 1; }
#rivier .rv-pop { position: absolute; left: 50%; top: 34%; transform: translate(-50%, -50%) scale(.6); opacity: 0; font-size: 34px; font-weight: 900; color: #fff3c4; -webkit-text-stroke: 1.5px rgba(40,24,0,.75); text-shadow: 0 4px 0 rgba(40,24,0,.45), 0 8px 24px rgba(0,0,0,.4); white-space: nowrap; transition: opacity .25s, transform .35s cubic-bezier(.2,1.4,.4,1); }
#rivier .rv-pop.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#rivier .rv-hurt { position: absolute; inset: 0; box-shadow: inset 0 0 90px 20px rgba(200,40,30,.55); opacity: 0; transition: opacity .25s; }
#rivier .rv-hurt.on { opacity: 1; transition: none; }
#rivier .rv-fly { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; transition: transform .55s cubic-bezier(.4,0,.6,1), opacity .55s; }
#rivier .rv-card { pointer-events: auto; position: absolute; left: 50%; bottom: calc(20px + var(--sab, 0px)); transform: translate(-50%, 30px); opacity: 0; width: min(92%, 420px); padding: 18px 18px 16px; border-radius: 22px;
  background: rgba(16,30,36,.84); border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 18px 50px rgba(0,0,0,.45); transition: opacity .35s, transform .45s cubic-bezier(.2,1.2,.4,1); text-align: center; }
#rivier .rv-card.on { opacity: 1; transform: translate(-50%, 0); }
#rivier .rv-card h2 { margin: 0 0 4px; font-size: 24px; font-weight: 900; }
#rivier .rv-card p { margin: 0 0 12px; font-size: 15px; color: #d9ecf0; }
#rivier .rv-card .rv-row { display: flex; justify-content: center; flex-wrap: wrap; gap: 4px; margin: 0 0 14px; }
#rivier .rv-card .rv-row img { width: 34px; height: 34px; border-radius: 50%; }
#rivier .rv-card .rv-row img.out { opacity: .3; filter: grayscale(1); }
#rivier .rv-card button { display: block; width: 100%; min-height: 50px; margin-top: 8px; border-radius: 14px; border: 0; font: inherit; font-weight: 900; font-size: 18px; cursor: pointer; }
#rivier .rv-card .rv-go { background: linear-gradient(180deg, #ffd65c, #f0a81c); color: #2b1a00; box-shadow: 0 4px 0 #a86e00; }
#rivier .rv-card .rv-no { background: rgba(255,255,255,.12); color: #fff; }
#rivier .rv-paused { pointer-events: auto; position: absolute; inset: 0; display: none; place-items: center; background: rgba(8,20,24,.55); }
#rivier .rv-paused.on { display: grid; }
#rivier .rv-paused div { width: min(86%, 360px); padding: 20px; border-radius: 20px; background: rgba(16,30,36,.9); text-align: center; }
#rivier .rv-paused h2 { margin: 0 0 12px; }
#rivier .rv-paused button { display: block; width: 100%; min-height: 48px; margin-top: 8px; border-radius: 14px; border: 0; font: inherit; font-weight: 900; font-size: 17px; }
#rivier .rv-paused .rv-on { background: #ffd65c; color: #2b1a00; }
#rivier .rv-paused .rv-off { background: rgba(255,255,255,.14); color: #fff; }
@media (prefers-reduced-motion: reduce) { #rivier .rv-count.bump { animation: none; } }`;
    document.head.appendChild(st);
  }
  (document.getElementById('game') || document.body).appendChild(host);
  const quality = pickQuality();
  if (quality.name === 'mid' && !quality.forced) Object.assign(quality, { dpr: 1.35 });
  const stage = createStage({ fov: 64, quality, canvas, stageEl: host });
  const pieces = createPieces(stage.renderer);
  return { host, ov, stage, pieces };
}

let current = null;
/**
 * Opens a ride (closing any open one). `d`: { seed, who: [cast ids to rescue, yours first], mine (how many of `who` are
 * yours), floors (the Weektoring on the island), crew (its name), skin, reducedMotion, autopilot (tests),
 * onDone({ rescued, missed, hits, all }, next: 'build' | 'done'), onQuit(partial) }. Resolves its controller.
 */
export async function openRiver(d) {
  current?.close();
  await portraitsReady;   // (the faces on the rings)
  if (!kit) kit = makeKit();
  const view = createRide(kit, d);
  current = view;
  await view.ready;
  return view;
}
export const river = () => current;

function createRide(K, d) {
  const { host, ov, stage, pieces } = K;
  const { scene, camera } = stage;
  const reduced = !!d.reducedMotion;
  const gameCanvas = document.querySelector('#game > canvas');
  const world = buildRiverWorld(stage);
  const things = createThings(scene, pieces);
  const rider = createRider(bendMaterial);
  scene.add(rider.group);
  const who = (d.who || []).filter((id) => CAST[id]).slice(0, 24);
  const course = rescueCourse(String(d.seed || 'rivier'), who);
  const len = course.len;
  // the lake at the end, with your island and its Weektoring
  world.setLake(len - 110);
  const island = createIsland(things, { radius: 22 });
  scene.add(island.group);
  island.setFloors(d.floors || []);
  const islandZ = len + 34;   // (course z of the island's middle)

  let alive = true;
  let raf = 0;
  let last = performance.now();
  let t = 0;
  let dist = 0;
  let phase = 'dive';   // dive → run → finish → done
  let phaseT = 0;
  let paused = false;
  let lane = 1;
  let x = laneX(1);
  let laneFrom = x;
  let laneT = 1;
  let leanV = 0;
  let slowT = 0;
  let graceT = 0;
  let hits = 0;
  const rescued = [];
  const lostAgain = [];
  const live = [];   // { it, row, obj, z, x, done }
  let rowI = 0;

  // ---------------------------------------------------------------------------------------------- the overlay
  ov.innerHTML = `<div class="rv-top"><div class="rv-count"><span class="rv-ring"></span><b>0</b><small>/ ${who.length}</small></div><div class="rv-bar"><i></i></div><button class="rv-pause" aria-label="${S.pause}">❚❚</button></div>
    <div class="rv-faces"></div><div class="rv-hint"></div><div class="rv-pop"></div><div class="rv-hurt"></div>
    <div class="rv-card"></div><div class="rv-paused"><div><h2>${S.rvPaused}</h2><button class="rv-on">${S.rvResume}</button><button class="rv-off">${S.rvQuit}</button></div></div>`;
  const countEl = ov.querySelector('.rv-count');
  const countB = countEl.querySelector('b');
  const barEl = ov.querySelector('.rv-bar i');
  const facesEl = ov.querySelector('.rv-faces');
  const hintEl = ov.querySelector('.rv-hint');
  const popEl = ov.querySelector('.rv-pop');
  const hurtEl = ov.querySelector('.rv-hurt');
  const cardEl = ov.querySelector('.rv-card');
  const pausedEl = ov.querySelector('.rv-paused');
  const faceUrl = (id, n = 96) => portraitDataUrl(id, n) || '';
  facesEl.innerHTML = who.map((id, i) => `<img src="${faceUrl(id, 64)}" alt="" data-i="${i}" class="out">`).join('');
  let popT = 0;
  function pop(text, ms = 1200) {
    popEl.textContent = text;
    popEl.classList.add('on');
    clearTimeout(popT);
    popT = setTimeout(() => popEl.classList.remove('on'), ms);
  }
  function hint(text) {
    if (text) hintEl.textContent = text;
    hintEl.classList.toggle('on', !!text);
  }
  function setCount() {
    countB.textContent = String(rescued.length);
    countEl.classList.remove('bump');
    void countEl.offsetWidth;
    countEl.classList.add('bump');
    facesEl.querySelectorAll('img').forEach((im) => im.classList.toggle('out', !rescued.includes(who[Number(im.dataset.i)])));
  }
  /** A face flies from where the person was on screen up to the counter. */
  function flyFace(id, from) {
    if (reduced) return;
    const el = document.createElement('img');
    el.className = 'rv-fly';
    el.src = faceUrl(id, 96);
    el.style.left = `${from.x}px`;
    el.style.top = `${from.y}px`;
    ov.appendChild(el);
    const r = countEl.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    requestAnimationFrame(() => {
      el.style.transform = `translate(${r.left - h.left + 20 - from.x}px, ${r.top - h.top + 18 - from.y}px) scale(.55)`;
      el.style.opacity = '0.2';
    });
    setTimeout(() => el.remove(), 600);
  }
  ov.querySelector('.rv-pause').addEventListener('click', () => setPaused(true));
  pausedEl.querySelector('.rv-on').addEventListener('click', () => setPaused(false));
  pausedEl.querySelector('.rv-off').addEventListener('click', () => { if (alive) { finishNow(); } });

  function setPaused(on) {
    if (phase === 'done') return;
    paused = !!on;
    pausedEl.classList.toggle('on', paused);
    if (paused) audio.suspend?.(); else { audio.resume?.(); last = performance.now(); }
  }
  const onVis = () => { if (document.hidden) setPaused(true); };
  document.addEventListener('visibilitychange', onVis);

  // ---------------------------------------------------------------------------------------------- input
  let down = null;
  function move(dir) {
    if (phase !== 'run' || paused) return;
    const to = clamp(lane + dir, 0, RIVER.lanes - 1);
    if (to === lane) {
      // (against the bank: a little bump, so the thumb knows)
      leanV = dir * 0.4;
      return;
    }
    laneFrom = x;
    lane = to;
    laneT = 0;
    leanV = dir;
    haptics.tap?.();
    if (rowI < 6) hint(null);
  }
  const onDown = (e) => {
    if (e.target.closest?.('button')) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), used: false };
  };
  const onMoveP = (e) => {
    if (!down || down.used) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(e.clientY - down.y)) {
      down.used = true;
      move(dx > 0 ? 1 : -1);
    }
  };
  const onUp = (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (!down.used && Math.abs(dx) < 14 && performance.now() - down.t < 350) {
      const r = host.getBoundingClientRect();
      move(e.clientX - r.left < r.width / 2 ? -1 : 1);
    }
    down = null;
  };
  const onKey = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') move(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') move(1);
    else if (e.key === 'Escape' || e.key === 'p') setPaused(!paused);
  };
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMoveP);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', () => { down = null; });
  addEventListener('keydown', onKey);

  // ---------------------------------------------------------------------------------------------- the box over Stapel's page
  function place() {
    const r = gameCanvas?.getBoundingClientRect() || { left: 0, top: 0, width: innerWidth, height: innerHeight };
    host.style.left = `${r.left}px`;
    host.style.top = `${r.top}px`;
    host.style.width = `${r.width}px`;
    host.style.height = `${r.height}px`;
    stage.resize();
  }
  addEventListener('resize', place);

  // ---------------------------------------------------------------------------------------------- the river's things
  function spawn() {
    while (rowI < course.rows.length && course.rows[rowI].z < dist + AHEAD) {
      const row = course.rows[rowI++];
      for (const it of row.items) {
        let obj;
        if (it.kind === 'block') obj = things.floating({ ...it, skin: 'kleur' });
        else if (it.kind === 'rock') obj = things.rock();
        else obj = things.person(it.who, who.indexOf(it.who));
        scene.add(obj);
        live.push({ it, row, obj, z: row.z, x: laneX(it.lane), done: false, drift: it.drift || 0 });
      }
    }
  }
  function despawn(l) {
    scene.remove(l.obj);
    l.obj.traverse((o) => { if (o.isSprite) o.material.dispose(); });
  }
  const _v = new THREE.Vector3();
  function screenOf(obj) {
    obj.getWorldPosition(_v);
    _v.y += 1;
    _v.project(camera);
    return { x: (_v.x * 0.5 + 0.5) * host.clientWidth, y: (-_v.y * 0.5 + 0.5) * host.clientHeight };
  }

  function knock(l) {
    hits++;
    slowT = RIVER.hitSlowS;
    graceT = RIVER.graceS;
    stage.shake(reduced ? 0 : 0.35);
    things.emit(x, 0.4, -1.2, 26, 2, 4);
    audio.play('splash');
    audio.play('lost');
    haptics.lost?.();
    hurtEl.classList.add('on');
    setTimeout(() => hurtEl.classList.remove('on'), 120);
    const back = rescued.pop();
    if (back) {
      lostAgain.push(back);
      setCount();
      pop(S.rvSlipped(CAST[back]?.name || ''), 1400);
    } else {
      pop(S.rvOuch, 900);
    }
    void l;
  }
  function grab(l) {
    l.done = true;
    rescued.push(l.it.who);
    const k = rescued.length;
    audio.play('room', { n: Math.min(9, k) });
    haptics.tap?.();
    flyFace(l.it.who, screenOf(l.obj));
    l.obj.visible = false;
    things.emit(l.x, 0.5, -(l.z - dist), 14, 1.2, 3);
    setCount();
    if (k === who.length && who.length > 1) pop(S.rvAll, 1400);
  }

  // ---------------------------------------------------------------------------------------------- the autopilot (tests)
  function pilot() {
    if (phase !== 'run' || laneT < 1) return;
    const ahead = live.filter((l) => !l.done && l.z > dist + 1 && l.z < dist + 22);
    const blocked = (ln) => ahead.some((l) => l.it.kind !== 'person' && (l.it.lane === ln || l.it.lane + l.drift === ln) && l.z < dist + 18);
    const want = ahead.find((l) => l.it.kind === 'person' && !blocked(l.it.lane));
    let target = want ? want.it.lane : lane;
    if (blocked(target)) target = [lane, lane - 1, lane + 1, 0, 1, 2].find((ln) => ln >= 0 && ln < 3 && !blocked(ln)) ?? lane;
    if (target !== lane) move(target > lane ? 1 : -1);
  }

  // ---------------------------------------------------------------------------------------------- the camera
  const cam = { pos: new THREE.Vector3(0, 30, 30), look: new THREE.Vector3(0, 0, -20) };
  const towerTop = () => island.top;
  function cameraFor(dt) {
    let p;
    let l;
    if (phase === 'dive') {
      const k = ease(clamp(phaseT / DIVE_S, 0, 1));
      // from high over the river, looking down at the splash, round to behind him
      p = new THREE.Vector3(x * 0.5, 22 - 17.6 * k, 4 + 3.6 * k);
      l = new THREE.Vector3(x * 0.3, 2 - 0.8 * k, -6 - 8 * k);
    } else if (phase === 'finish' || phase === 'done') {
      // up and back from him until the whole Weektoring stands in the picture, above the card
      const k = ease(clamp(phaseT / FINISH_S, 0, 1));
      const iz = -(islandZ - dist);
      const h = Math.max(14, towerTop());
      const back = Math.max(30, h * 0.95);
      const from = new THREE.Vector3(x * 0.55, 4.4, 7.6);
      const to = new THREE.Vector3(10, h * 0.42 + 6, iz + back);
      p = from.lerp(to, k);
      l = new THREE.Vector3(x * 0.3, 1, -14).lerp(new THREE.Vector3(0, h * 0.36 + 2, iz), k);
    } else {
      p = new THREE.Vector3(x * 0.55, 4.4, 7.6);
      l = new THREE.Vector3(x * 0.3, 1.0, -14);
    }
    const a = phase === 'run' ? 1 - Math.exp(-dt * 9) : 1 - Math.exp(-dt * 4);
    cam.pos.lerp(p, a);
    cam.look.lerp(l, a);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
  }

  // ---------------------------------------------------------------------------------------------- the loop
  let pilotOn = !!d.autopilot;
  function step(dt) {
    t += dt;
    phaseT += dt;
    if (phase === 'dive') {
      // he falls from the top into the river: a splash, and he's up on his board
      const k = clamp(phaseT / DIVE_S, 0, 1);
      rider.group.position.y = Math.max(0, 16 * (1 - k * k) - 0.2);
      rider.group.rotation.x = -Math.PI * 1.2 * (1 - k);
      if (k >= 1) {
        phase = 'run';
        phaseT = 0;
        things.emit(0, 0.2, 0, 50, 2.4, 6);
        audio.play('splash');
        audio.music?.(true, { bpm: 104, layers: 1, key: 2 });
        hint(S.rvHint);
      }
    } else if (phase === 'run') {
      if (pilotOn) pilot();
      const sp = speedAt(dist, len) * (slowT > 0 ? RIVER.hitSlowK : 1);
      dist += sp * dt;
      slowT = Math.max(0, slowT - dt);
      graceT = Math.max(0, graceT - dt);
      rider.setBlink(graceT > 0 && Math.floor(t * 10) % 2 === 0);
      if (dist > len * 0.4) audio.musicSet?.({ layers: 2, bpm: 112 });
      if (dist >= len - RIVER.finishRun + 10) {
        phase = 'finish';
        phaseT = 0;
        hint(null);
        audio.musicSet?.({ layers: 3 });
      }
    } else if (phase === 'finish') {
      // in to the jetty, slowing down
      const k = clamp(phaseT / FINISH_S, 0, 1);
      const sp = speedAt(dist, len) * (1 - ease(k)) + 1.5;
      dist = Math.min(islandZ - 22 - 16, dist + sp * dt);
      if (k >= 1) done();
    }
    // the lane: an eased glide across
    laneT = Math.min(1, laneT + dt / RIVER.laneS);
    x = laneFrom + (laneX(lane) - laneFrom) * ease(laneT);
    leanV *= Math.exp(-dt * 6);
    rider.group.position.x = x;
    rider.update(dt, { lean: leanV, crouch: slowT > 0 ? slowT / RIVER.hitSlowS : 0, speed: speedAt(dist, len) });
    // spray off the board's tail
    if (phase === 'run' && Math.random() < 0.85) things.emit(x - leanV * 0.3, 0.12, 0.9, 1, 0.6, 1.4 + Math.abs(leanV) * 2);

    spawn();
    for (const l of live) {
      const ahead = l.z - dist;
      // a drifting block crosses as you come (it's in its own lane when it's level with you)
      let lx = laneX(l.it.lane);
      if (l.drift) lx = laneX(l.it.lane) + l.drift * RIVER.laneW * ease(clamp((ahead - 4) / 46, 0, 1));
      l.x = lx;
      const u = l.obj.userData;
      l.obj.position.set(lx, Math.sin(t * 1.9 + u.phase) * 0.08, -ahead);
      if (u.block) {
        u.block.rotation.y += dt * 0.2;
        u.block.rotation.z = Math.sin(t * 1.3 + u.phase) * 0.05;
      }
      if (u.arm) u.arm.rotation.z = -0.4 + Math.sin(t * 9 + u.phase) * 0.7;
      if (l.done || phase !== 'run') continue;
      if (Math.abs(ahead) < (u.d || 1.4) / 2 + 0.5) {
        const dx = Math.abs(l.x - x);
        if (l.it.kind === 'person') {
          if (dx < GRAB_R) grab(l);
        } else if (graceT <= 0 && dx < (u.w || 2.4) / 2 + HIT_R) {
          l.done = true;
          knock(l);
        }
      }
    }
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].z < dist - BEHIND) {
        despawn(live[i]);
        live.splice(i, 1);
      }
    }
    // the island ahead, in the lake
    island.group.position.set(0, -0.6, -(islandZ - dist));
    barEl.style.width = `${clamp(dist / (len - RIVER.finishRun), 0, 1) * 100}%`;
    world.update(dist, t);
    things.updateSpray(dt);
    cameraFor(dt);
  }
  function loop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) step(dt);
    stage.render(dt);
  }

  // ---------------------------------------------------------------------------------------------- the end
  const result = () => ({ rescued: [...rescued], missed: who.filter((id) => !rescued.includes(id)), hits, all: rescued.length === who.length && who.length > 0 });
  function done() {
    if (phase === 'done') return;
    phase = 'done';
    audio.music?.(false);
    const r = result();
    if (r.all) audio.play('record'); else audio.play('banner');
    const mine = Math.min(d.mine ?? who.length, who.length);
    const yours = rescued.filter((id) => who.indexOf(id) < mine).length;
    cardEl.innerHTML = `<h2>${r.rescued.length ? S.rvSaved(r.rescued.length, who.length) : S.rvNoneSaved}</h2>
      <p>${r.rescued.length ? S.rvMovedIn(r.rescued.length, d.crew || '') : S.rvTryTomorrow}${mine && yours < mine ? ` ${S.rvYoursLeft(mine - yours)}` : ''}</p>
      <div class="rv-row">${who.map((id) => `<img src="${faceUrl(id, 64)}" alt="" class="${rescued.includes(id) ? '' : 'out'}">`).join('')}</div>
      ${d.canBuild ? `<button class="rv-go">${S.rvBuild}</button><button class="rv-no">${S.rvLater}</button>` : `<button class="rv-go">${S.rvDone}</button>`}`;
    cardEl.classList.add('on');
    cardEl.querySelector('.rv-go').addEventListener('click', () => d.onDone?.(r, d.canBuild ? 'build' : 'done'));
    cardEl.querySelector('.rv-no')?.addEventListener('click', () => d.onDone?.(r, 'done'));
    d.onResult?.(r);
  }
  function finishNow() {
    // "Los dit": the ride ends here, with whoever was saved
    pausedEl.classList.remove('on');
    paused = false;
    audio.resume?.();
    for (const l of live) l.done = true;
    if (phase === 'dive' || phase === 'run') {
      phase = 'finish';
      phaseT = 0;
      dist = Math.max(dist, len - RIVER.finishRun + 10);
      hint(null);
    }
  }

  // ---------------------------------------------------------------------------------------------- open / close
  host.style.display = 'block';
  place();
  cameraFor(1);
  const ready = (async () => {
    // a first frame before it shows (the shaders compile behind Stapel's page)
    stage.render(0);
    await new Promise((res) => requestAnimationFrame(res));
    raf = requestAnimationFrame(loop);
  })();

  function close() {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    clearTimeout(popT);
    audio.music?.(false);
    removeEventListener('resize', place);
    removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    host.removeEventListener('pointerdown', onDown);
    host.removeEventListener('pointermove', onMoveP);
    host.removeEventListener('pointerup', onUp);
    for (const l of live) despawn(l);
    live.length = 0;
    scene.remove(rider.group, island.group, things.spray);
    things.dispose();
    world.dispose();
    ov.innerHTML = '';
    host.style.display = 'none';
    if (current === api) current = null;
  }

  const api = {
    ready, close,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    /** For tests: where the ride stands. */
    state: () => ({ phase, dist: Math.round(dist * 10) / 10, len, lane, rescued: [...rescued], hits, who: [...who], live: live.length, paused }),
    autopilot(on) { pilotOn = !!on; },
    move,
    skip: finishNow,
  };
  return api;
}
void BANK;
