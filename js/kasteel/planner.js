// (1.17 3D) Die Kasteelreeks: your castle and its defence plan (the owner, 16 Oct 2026: "The oponent needs to be able to
// strategize what is the best way to defend if they are offline"). Your castle (your own Daily Towers, newest first;
// a starter castle until you've played one) turns on its hill; choose which tower stands in the middle as the keep
// (your flag flies there), then
// place your defence on its spots: archers, spearmen and knights on the walls, the tower tops and behind the gate;
// boiling oil over the gate; a ballista on a tower top; spikes in front. Bêre keeps it; "Toets dit" attacks a copy.
import * as THREE from '../../lib/three.module.min.js';
import { createStage } from './stage.js';
import { buildWorld, DIST, rng, groundHeight } from './world.js';
import { castleMaterials, buildCastle, sampleDaily } from './castle.js';
import { soldier, cauldron, ballista, spikes } from './army.js';
import { idle, setDetail } from './crew.js';
import { PIECES, spotIds, defaultPlan, costOf, loadPlan, savePlan, mySeed, myDayInfo, budgetFor } from './plan.js';
import { T, fmtM, dayName } from './text.js';
import { audio } from '../audio.js';
import { ICONS } from './hud.js';
import { weldStill } from './batch.js';

const st = createStage({ fov: 46 });
const { scene, camera, renderer } = st;
setDetail(st.quality.name === 'high' ? 1 : 0.5);   // (phones: simpler round shapes)
const world = buildWorld(scene, renderer, { seed: 11, grass: st.quality.grass, detail: st.quality.name === 'high' ? 1 : 0.6 });
world.setShadow(st.quality.shadow);
st.onQuality((qq) => { world.setGrass(qq.grass); world.setShadow(qq.shadow); });
const mats = castleMaterials(renderer);
const saved = loadPlan();
const seed = saved?.seed ?? mySeed();
const r0 = rng(seed);
// your own Daily Towers when the game has kept some (the rest: low foundations, still to build); else a starter castle
const info = myDayInfo();
const real = info.map((d) => d.layout);
const BUDGET = budgetFor(real.length);
const dayLabel = (i) => {
  const d = info[i];
  if (!d) return real.length ? T.toBuild : T.starterTower(i + 1);
  const [y, m, dd] = d.dateKey.split('-').map(Number);
  return `${dayName(new Date(Date.UTC(y, m - 1, dd)).getUTCDay())} · ${fmtM(d.h || 0)}`;
};
const days = real.length
  ? [...real, ...Array.from({ length: Math.max(0, 5 - real.length) }, () => sampleDaily(r0, 2))].slice(0, 5)
  : [sampleDaily(r0, 16), sampleDaily(r0, 12), sampleDaily(r0, 11), sampleDaily(r0, 13), sampleDaily(r0, 10)];
const AT = new THREE.Vector3(0, 0, -DIST);
let castle = null;
let plan = saved?.plan ? JSON.parse(JSON.stringify(saved.plan)) : null;
let spots = [];
const rings = new Map();
const pieces = new Map();
const crew = [];
let sel = null;
let dirty = false;
const sfx = (n) => { try { audio.play(n); } catch { /* */ } };

const ringGeo = new THREE.TorusGeometry(0.9, 0.09, 8, 32);
ringGeo.rotateX(Math.PI / 2);
const ringMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });
const RING = { idle: ringMat('#ffffff', 0.35), ok: ringMat('#ffcf6b', 0.95), taken: ringMat('#8fd18a', 0.6) };
// (the ring is hollow: an unseen disc across it takes the tap, so a tap in its middle counts)
const padGeo = new THREE.CircleGeometry(1.25, 20);
padGeo.rotateX(-Math.PI / 2);
const padMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

function order(keepDay) { return [days[keepDay], ...days.filter((_, i) => i !== keepDay)]; }
let welded = [];
function build() {
  for (const w of welded) { scene.remove(w); w.geometry.dispose(); }
  welded = [];
  if (castle) {
    scene.remove(castle.group);
    for (const r of rings.values()) scene.remove(r);
    rings.clear();
    for (const p of pieces.values()) castle.group.remove(p);
    pieces.clear();
    crew.length = 0;
  }
  castle = buildCastle({ at: AT, days: order(plan?.keep ?? 0), team: 'blue', mats, rand: rng(seed + 1) });
  scene.add(castle.group);
  // (nothing moves here: the whole castle drawn as a few welded pieces; flags and torches keep their own)
  const within = (o, test) => { for (let a = o; a; a = a.parent) if (test(a)) return true; return false; };
  welded = weldStill(castle.group, scene, (m) => !within(m, (a) => a.userData.wave || a.userData.flame));
  if (!plan) plan = defaultPlan(castle);
  spots = spotIds(castle);
  for (const s of spots) {
    const r = new THREE.Mesh(ringGeo, RING.idle);
    r.add(new THREE.Mesh(padGeo, padMat));
    const tall = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 12), padMat);
    tall.position.y = 1.1;
    r.add(tall);
    r.position.copy(castle.group.localToWorld(s.p.clone())).add(new THREE.Vector3(0, 0.12, 0));
    if (s.kind === 'field') r.scale.setScalar(2.6);
    r.userData.spot = s;
    scene.add(r);
    rings.set(s.id, r);
  }
  for (const [id, kind] of Object.entries(plan.place)) put(id, kind, true);
  paint();
}
function makePiece(kind) {
  if (kind === 'olie') return cauldron(mats);
  if (kind === 'ballista') return ballista(mats, 'blue');
  if (kind === 'pieke') return spikes(mats);
  const s = soldier(kind, 'blue', rng(kind.length * 31 + crew.length));
  crew.push(s);
  return s;
}
function put(id, kind, quiet = false) {
  const s = spots.find((x) => x.id === id);
  if (!s || !PIECES[kind]?.on.includes(s.kind)) return false;
  const old = pieces.get(id);
  if (old) { castle.group.remove(old); pieces.delete(id); }
  const m = makePiece(kind);
  m.position.copy(s.p);
  castle.group.add(m);
  pieces.set(id, m);
  plan.place[id] = kind;
  if (!quiet) { sfx('drop'); dirty = true; }
  return true;
}
function take(id) {
  const old = pieces.get(id);
  if (old) castle.group.remove(old);
  pieces.delete(id);
  delete plan.place[id];
  sfx('click');
  dirty = true;
}
function paint() {
  for (const s of spots) {
    const r = rings.get(s.id);
    const can = sel && PIECES[sel].on.includes(s.kind);
    r.material = can ? RING.ok : plan.place[s.id] ? RING.taken : RING.idle;
    r.visible = !!can || !plan.place[s.id] || !sel;
  }
  hud.update();
}

// ------------------------------------------------------------------------------------------------------- the screen
const hudEl = document.getElementById('k-hud');
hudEl.innerHTML = `
  <div class="kp-title"><small><a class="k-back" href="index.html">${T.back}</a>${T.series}</small><b>${T.yourCastle}</b><p>${real.length ? T.standHere(real.length) : T.playToBuild}. ${T.planLine}</p><a class="kp-attack" href="?">${T.attackRikus}</a></div>
  <div class="kp-keep"><button type="button" class="kp-prev" aria-label="${T.prev}">‹</button><div><small>${T.keep}</small><b class="kp-day"></b></div><button type="button" class="kp-next" aria-label="${T.next}">›</button></div>
  <div class="kp-budget"><small>${T.budget}</small><b class="kp-left">0 / ${BUDGET}</b>${real.length ? `<em>${T.budgetUp(BUDGET - budgetFor(0))}</em>` : ''}</div>
  <p class="kp-hint"></p>
  <div class="kp-cards">${Object.entries(PIECES).map(([k, p]) => `<button type="button" class="kp-card" data-k="${k}"><span class="kp-ic">${ICONS[k]}</span><b>${T.pieces[k]}</b><i>${p.cost}</i></button>`).join('')}</div>
  <div class="kp-btns"><button type="button" class="kp-save">${T.save}</button><button type="button" class="kp-test">${T.test}</button></div>`;
const $ = (q) => hudEl.querySelector(q);
const hud = {
  update() {
    const used = costOf(plan);
    $('.kp-left').textContent = `${used} / ${BUDGET}`;
    $('.kp-budget').classList.toggle('is-over', used > BUDGET);
    $('.kp-day').textContent = dayLabel(plan.keep ?? 0);
    for (const c of hudEl.querySelectorAll('.kp-card')) c.classList.toggle('is-on', c.dataset.k === sel);
    $('.kp-hint').textContent = sel ? T.placeHint(T.pieces[sel]) : T.idleHint;
    $('.kp-save').classList.toggle('is-dirty', dirty);
  },
};
for (const c of hudEl.querySelectorAll('.kp-card')) {
  c.addEventListener('click', () => { try { audio.unlock(); } catch { /* */ } sfx('click'); sel = sel === c.dataset.k ? null : c.dataset.k; paint(); });
}
$('.kp-prev').addEventListener('click', () => { plan.keep = ((plan.keep ?? 0) + days.length - 1) % days.length; dirty = true; sfx('click'); build(); });
$('.kp-next').addEventListener('click', () => { plan.keep = ((plan.keep ?? 0) + 1) % days.length; dirty = true; sfx('click'); build(); });
$('.kp-save').addEventListener('click', () => {
  if (costOf(plan) > BUDGET) { flash(T.tooDear); return; }
  savePlan({ seed, plan });
  dirty = false;
  sfx('banner');
  flash(T.saved);
  hud.update();
});
$('.kp-test').addEventListener('click', () => {
  if (costOf(plan) > BUDGET) { flash(T.tooDear); return; }
  savePlan({ seed, plan });
  location.href = `${location.pathname}?teen=my`;
});
function flash(text) {
  const h = $('.kp-hint');
  h.textContent = text;
  h.classList.add('is-flash');
  setTimeout(() => { h.classList.remove('is-flash'); hud.update(); }, 2200);
}

// --------------------------------------------------------------------------------------------- touch and the camera
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let ang = -0.55;
let drag = null;
const cv = document.getElementById('k-canvas');
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  drag.moved += Math.abs(dx) + Math.abs(e.clientY - drag.y);
  ang -= dx * 0.008;
  drag.x = e.clientX;
  drag.y = e.clientY;
});
cv.addEventListener('pointerup', (e) => {
  const was = drag;
  drag = null;
  if (!was || was.moved > 12) return;
  const r = cv.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // a ring (to place), or a piece that stands (to take it away)
  const hitRing = ray.intersectObjects([...rings.values()].filter((m) => m.visible), true)[0];
  if (hitRing) { let o = hitRing.object; while (o && !o.userData.spot) o = o.parent; hitRing.object = o; }
  if (hitRing?.object && sel) {
    const s = hitRing.object.userData.spot;
    if (PIECES[sel].on.includes(s.kind)) { put(s.id, sel); paint(); return; }
  }
  const hitPiece = ray.intersectObjects([...pieces.values()], true)[0];
  if (hitPiece) {
    let o = hitPiece.object;
    while (o && ![...pieces.values()].includes(o)) o = o.parent;
    const id = [...pieces.entries()].find(([, p]) => p === o)?.[0];
    if (id) { take(id); paint(); return; }
  }
  if (hitRing?.object && !sel) flash(T.pickFirst);
});

build();
const clock = new THREE.Clock();
// (the castle and the ground before its gate sit between the title and the cards)
const look = new THREE.Vector3(0, 1, -DIST + 7);
function frame() {
  const t = clock.getElapsedTime();
  const R = 80;
  camera.position.set(Math.sin(ang) * R, 46, -DIST + 7 + Math.cos(ang) * R);
  camera.lookAt(look);
  for (const p of crew) idle(p, t);
  for (const r of rings.values()) if (r.material === RING.ok) r.scale.setScalar((r.userData.spot.kind === 'field' ? 2.6 : 1) * (1 + Math.sin(t * 6) * 0.08));
  st.render(1 / 60);
  requestAnimationFrame(frame);
}
await st.warm();
requestAnimationFrame(frame);
window.__planner = { plan: () => plan, spots: () => spots, put: (id, k) => { const ok = put(id, k); paint(); return ok; }, take: (id) => { take(id); paint(); }, select: (k) => { sel = k; paint(); }, ringAt: (id) => { const r = rings.get(id); const v = r.position.clone().project(camera); return { x: v.x, y: v.y }; } };
window.__kasteelReady = true;
