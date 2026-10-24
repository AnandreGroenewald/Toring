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
import { buildRiverWorld, bendMaterial, setBend, BANK, puffTexture } from './world.js';
import { createRider } from './rider.js';
import { createThings, createIsland, createStartTower, labelSprite, disposeTree } from './things.js';
import { createBeasts } from './beasts.js';
import { loadModels } from './models.js';
import { RIVER, rescueCourse, raidCourse, speedAt, laneX } from '../core/rivier.js';
import { floorAt, hit as hitFloor, dimsOf } from '../core/weektower.js';
import { weekOf, plusDays } from '../core/span.js';
import { portraitDataUrl, portraitsReady, CAST } from '../game/residents.js';
import { S } from '../core/strings.js';
import { fmtM, fmtInt } from '../core/format.js';
import { spanNewsLine } from '../ui/spannews.js';
import { audio, haptics } from '../audio.js';

const AHEAD = 230;       // m: things are made this far ahead...
const BEHIND = 14;       // ...and taken away this far behind

const FINISH_S = 2.6;    // the ride in to the jetty
const HIT_R = 0.62;      // m: the rider's half width for a knock (smaller than he looks: Game Brain, "hitboxes smaller than the art")
const GRAB_R = 1.55;
const START_Z = 18;      // m: your tower stands this far upstream of where you land (the camera rides between)     // m: how near a person must be to be scooped up (more than he looks: generous)
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
#rivier .rv-faces { position: absolute; left: 12px; right: 12px; top: calc(62px + var(--sat, 0px)); display: flex; flex-wrap: wrap; gap: 4px; }
/* (eight faces on one line on any phone; more than eight wrap) */
#rivier .rv-faces img { width: min(30px, calc((100vw - 24px - 7 * 4px) / 8)); aspect-ratio: 1; height: auto; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,.35); }
#rivier .rv-faces img.out { opacity: .25; filter: grayscale(1); }
#rivier .rv-hint { position: absolute; left: 50%; top: calc(104px + var(--sat, 0px)); transform: translateX(-50%); padding: 10px 18px; border-radius: 16px; background: rgba(13,34,40,.66); font-weight: 900; font-size: 18px; white-space: nowrap; opacity: 0; transition: opacity .3s; }
#rivier .rv-hint.on { opacity: 1; }
#rivier .rv-pop { position: absolute; left: 50%; top: 34%; transform: translate(-50%, -50%) scale(.6); opacity: 0; font-size: 34px; font-weight: 900; color: #fff3c4; -webkit-text-stroke: 1.5px rgba(40,24,0,.75); text-shadow: 0 4px 0 rgba(40,24,0,.45), 0 8px 24px rgba(0,0,0,.4); width: max-content; max-width: 88%; text-align: center; line-height: 1.12; text-wrap: balance; transition: opacity .25s, transform .35s cubic-bezier(.2,1.4,.4,1); }
#rivier .rv-pop.long { font-size: 26px; }
#rivier .rv-pop.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#rivier .rv-scope { position: absolute; left: 0; top: 0; width: 132px; height: 132px; margin: -66px 0 0 -66px; opacity: 0; pointer-events: none; transition: opacity .2s; --sc: #5ff2ff; }
#rivier .rv-scope.on { opacity: 1; }
#rivier .rv-scope.miss { --sc: #ffc24a; }
#rivier .rv-scope svg { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 0 3px rgba(0,25,35,.85)) drop-shadow(0 0 10px rgba(0,25,35,.35)); }
#rivier .rv-scope .ring { fill: rgba(150,240,255,.07); stroke: var(--sc); stroke-width: 2.5; transition: stroke .15s; }
#rivier .rv-scope .ticks line, #rivier .rv-scope .cross line { stroke: var(--sc); stroke-width: 2; stroke-linecap: round; transition: stroke .15s; }
#rivier .rv-scope .brk { fill: none; stroke: var(--sc); stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; transform-origin: 66px 66px; transform: scale(1.5); opacity: .4; transition: transform .3s cubic-bezier(.2,1.5,.4,1), opacity .3s, stroke .15s; }
#rivier .rv-scope.lock .brk { transform: scale(.86); opacity: 1; }
#rivier .rv-scope .dot { fill: #ff5a3a; }
#rivier .rv-scope .rng { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 4px); padding: 2px 9px; border-radius: 999px; background: rgba(8,24,30,.72); font-weight: 900; font-size: 13px; color: #dff9ff; letter-spacing: .5px; white-space: nowrap; }
#rivier .rv-fire { pointer-events: auto; position: absolute; right: 18px; bottom: calc(24px + var(--sab, 0px)); width: 96px; height: 96px; border-radius: 50%; border: 0; padding: 0; display: none; place-items: center; cursor: pointer; color: #fff; font: inherit; font-weight: 900; font-size: 14px; letter-spacing: .6px; text-shadow: 0 2px 0 rgba(0,40,60,.6);
  background: radial-gradient(circle at 34% 28%, #e4fdff 0, #57def0 26%, #0d93b4 64%, #06566e 100%); box-shadow: 0 6px 0 #04394a, 0 14px 30px rgba(0,0,0,.45), inset 0 -8px 14px rgba(0,40,60,.5), inset 0 4px 8px rgba(255,255,255,.6);
  touch-action: none; -webkit-tap-highlight-color: transparent; transition: transform .08s, box-shadow .08s, filter .2s, opacity .2s; }
#rivier .rv-fire.show { display: grid; }
#rivier .rv-fire.off { filter: saturate(.25) brightness(.8); opacity: .75; }
#rivier .rv-fire.press { transform: translateY(5px) scale(.94); box-shadow: 0 1px 0 #04394a, 0 6px 16px rgba(0,0,0,.4), inset 0 -4px 10px rgba(0,40,60,.5), inset 0 4px 8px rgba(255,255,255,.6); }
#rivier .rv-fire .in { display: grid; place-items: center; gap: 1px; margin-top: 2px; }
#rivier .rv-fire .in svg { width: 34px; height: 34px; filter: drop-shadow(0 2px 0 rgba(0,40,60,.5)); }
#rivier .rv-fire svg.pips { position: absolute; left: -8px; top: -8px; width: 112px; height: 112px; pointer-events: none; }
#rivier .rv-fire svg.pips path { fill: none; stroke-width: 5; stroke-linecap: round; }
#rivier .rv-fire svg.pips .full { stroke: #8ff4ff; filter: drop-shadow(0 0 4px rgba(120,240,255,.9)); }
#rivier .rv-fire svg.pips .empty { stroke: rgba(10,40,52,.55); }
#rivier .rv-fire.pulse { animation: rv-firepulse 1.1s ease-in-out infinite; }
@keyframes rv-firepulse { 0%, 100% { filter: none; } 50% { filter: brightness(1.18) drop-shadow(0 0 12px rgba(110,240,255,.8)); } }
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
#rivier .rv-card ol.rv-stand { list-style: none; margin: 0 0 14px; padding: 0; text-align: left; font-size: 15px; }
#rivier .rv-card ol.rv-stand li { display: flex; justify-content: space-between; padding: 5px 10px; border-radius: 10px; }
#rivier .rv-card ol.rv-stand li.me { background: rgba(255,255,255,.1); }
#rivier .rv-card ol.rv-stand li.lead b { color: #ffd65c; }
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
  const stage = createStage({ fov: 58, quality, canvas, stageEl: host });
  const pieces = createPieces(stage.renderer);
  return { host, ov, stage, pieces };
}

let current = null;
/**
 * Opens a ride (closing any open one). `d`: { seed, who: [cast ids to rescue, yours first], mine (how many of `who` are
 * yours), floors (the Weektoring on the island), crew (its name), skin, reducedMotion, autopilot (tests),
 * onDone({ rescued, missed, hits, all }, next: 'build' | 'done'), onQuit(partial) }. Resolves its controller.
 */
/** Can this phone draw these screens (WebGL 2)? (no: nothing is downloaded or built; the game's fallbacks take over) */
let webgl2 = null;
function need3d() {
  if (webgl2 === null) {
    try { webgl2 = !!document.createElement('canvas').getContext('webgl2'); } catch { webgl2 = false; }
  }
  if (!webgl2) throw new Error('no WebGL 2');
}

export async function openRiver(d) {
  need3d();
  current?.close();
  await portraitsReady;   // (the faces on the rings)
  // (the Blender models: the animals; a ride never waits long for them, and works without)
  const models = await loadModels(['croc', 'hippo', 'monkey', 'builder', 'dorp', 'island', 'props']);
  if (!kit) kit = makeKit();
  const view = createRide(kit, { ...d, models });
  current = view;
  await view.ready;
  return view;
}
export const river = () => current;

/**
 * (1.20) Saturday's bomb run (the owner, 24 Oct 2026: "the weekly is also on a river but then you damage the openents towers
 * while you go down with bombs ... as you press to confirm the power and direction then it slows down"): down the river
 * past the four crews' islands; when the tallest tower 👑 comes by, hold (time slows), drag to aim, let go to throw. `d`:
 * { river (the server's view), crewId, bombs, skin, reducedMotion, autopilot, onBomb(target, { x, y }) → Promise, onDone() }.
 */
export async function openRaid(d) {
  return openRiver({ ...d, mode: 'raid', who: [], seed: d.seed || `${d.river?.id || 'R'}/${Date.now()}` });
}

/**
 * (1.20) Ons dorp: your crew's island in the lake, its Weektoring (every floor in its builder's skin) and the week: the
 * ticket, the bombs, the build turns, today's ride. `d`: { name, floors, heightM, people, turns, rideToday, ticket,
 * weekdays, bombs, reducedMotion, onRide, onBuild, onBack }. Resolves its controller ({ close }).
 */
export async function openTown(d) {
  need3d();
  current?.close();
  await portraitsReady;
  const models = await loadModels(['dorp', 'island', 'props']);
  if (!kit) kit = makeKit();
  const view = createTown(kit, { ...d, models });
  current = view;
  await view.ready;
  return view;
}

function createTown(K, d) {
  const { host, ov, stage, pieces } = K;
  const { scene, camera } = stage;
  const reduced = !!d.reducedMotion;
  const gameCanvas = document.querySelector('#game > canvas');
  const world = buildRiverWorld(stage, d.scene, { air: false });   // (the sky of his background skin; no river mist round the island)
  world.setPool(1e6);   // (all lake: the canyon is far off)
  const things = createThings(scene, pieces);
  things.tint(world.fxTint);
  things.models = d.models || {};   // (the Blender models, for the island's town)
  const island = createIsland(things, { radius: 22, plots: true });
  scene.add(island.group);
  world.setShadowFocus(0, 0, 62);   // (the island's own shadows: the towers', the houses', the trees')
  // (Saturday won: fireworks over the island and a gold crown on the Weektoring, until the new week)
  // (the lake's gentle sound round the island; the game's own level back on leaving)
  const ambBefore = audio.ambience ?? 0;
  audio.setAmbience?.(0.35);
  const wonOf = (v) => !!(v.river?.over && v.river.final?.order?.[0] && v.river.final.order[0] === v.crew?.id);
  let won = wonOf(d);
  let fw = won ? createFireworks(scene, reduced) : null;
  let crownTag = null;
  function setCrown() {
    if (crownTag) { island.group.remove(crownTag); crownTag.material.map?.dispose(); crownTag.material.dispose(); crownTag = null; }
    if (!won) return;
    crownTag = labelSprite(S.twWinners, { gold: true });
    // (bigger over a tall tower: the camera stands further back)
    const k = Math.max(1, island.top / 28);
    crownTag.scale.multiplyScalar(k);
    crownTag.position.set(0, island.top + 2.5 * k, 0);
    island.group.add(crownTag);
  }
  function setCrownOff() { if (crownTag) { crownTag.material.map?.dispose(); crownTag.material.dispose(); } }
  // (a night sky: warm floodlights on the towers, from where the camera stands)
  const flood = world.night ? new THREE.DirectionalLight('#ffdcae', 1.5) : null;
  if (flood) scene.add(flood, flood.target);
  island.setFloors(d.floors || []);
  island.setPlots({ towers: d.plots || [], monuments: d.monuments || [] });
  setCrown();
  const IZ = 0;   // (the island at the world's middle: nothing bends)
  let alive = true;
  let raf = 0;
  let last = performance.now();
  let t = 0;
  /** The screen over the island: the crew and its tower; Saturday's river; the week; the news; what you can do now. */
  const newsLine = (n) => spanNewsLine(n);
  // (the panel folds down to its buttons: a tap on the island or its handle; the town fills the screen)
  let folded = false;
  let renaming = false;
  let removing = null;
  let helping = !!d.help;   // (open by itself on the first visit)
  /** How Ons dorp works: the rules screen's own four lines (the ride, the crane, the crew, Saturday). */
  const helpHtml = () => `<ul class="tw-helpbox">${S.howToSteps.filter((s) => ['🛟', '🏗️', '🏝️', '💦'].includes(s.icon)).map((s) => `<li><span>${s.icon}</span>${esc(typeof s.text === 'function' ? s.text() : s.text)}</li>`).join('')}</ul>`;
  function fold(on) {
    folded = !!on;
    ov.querySelector('.tw-panel')?.classList.toggle('min', folded);
    measure?.();
  }
  function paint(v) {
    const crew = v.crew;
    const r = v.river;
    const mine = crew?.id;
    const iLead = !!(r && r.leader && r.leader === mine);
    const over = !!r?.over;
    const sat = !!(r && v.phase === 'uitdaging' && !over);
    let river = '';
    if (r) {
      const rows = [...r.rows].sort((a, b) => b.h - a.h).map((x) => `<li class="${x.id === mine ? 'me' : ''}${x.leader ? ' lead' : ''}"><span>${x.leader ? '👑 ' : ''}${esc(x.name)}${x.id === mine ? ` <i>(${S.twYou})</i>` : ''}</span><b>${fmtM(x.h)}</b></li>`).join('');
      const place = over && r.final ? r.final.order.indexOf(mine) + 1 : 0;
      river = `<div class="tw-river"><h3>${S.twRiver}</h3><ol>${rows}</ol>${over ? `<p class="tw-place">${place === 1 ? S.twPlaceFirst : place ? S.twPlace(place, r.rows.length) : ''}</p>` : `<p class="tw-sat">${iLead ? S.twYouLead : S.twWhistle}${v.craneShut ? '' : ` ${S.twCraneNoon}`}</p>`}</div>`;
    }
    const news = (crew?.news || []).slice(-3).reverse().map(newsLine).filter(Boolean).map((s) => `<li>${s}</li>`).join('');
    // (the founder may rename the crew and remove a member: a ✕ that asks once more before it acts)
    // (crews are locked on Saturday and Sunday: no leaving or removing then)
    const weekend = (v.dow | 0) >= 6;
    const boss = !!(crew && v.myId && crew.founder === v.myId && !sat);
    const canRemove = boss && !weekend;
    const memberHtml = (m) => `<span class="tw-m">${esc(m.name || '?')}${canRemove && m.id !== v.myId ? `<button class="tw-rm${removing === m.id ? ' ask' : ''}" data-id="${esc(m.id)}" aria-label="${S.twRemoveAsk(esc(m.name || '?'))}">${removing === m.id ? S.twRemoveAsk(esc(m.name || '?')) : '✕'}</button>` : ''}</span>`;
    const members = crew ? `<div class="tw-crew"><span>${S.spanMembers(crew.members.length, 3)}: </span>${crew.members.map(memberHtml).join('<span class="tw-dot">·</span>')}${crew.members.length < 3 ? `<button class="tw-invite">${S.spanInvite}</button>` : ''}</div>` : '';
    const renameForm = renaming ? `<form class="tw-rename-form"><input class="tw-name" maxlength="18" value="${esc(crew?.name || '')}" aria-label="${S.twRename}"><button type="submit" class="tw-save">${S.twRenameSave}</button><button type="button" class="tw-cancel">${S.twCancel}</button></form>` : '';
    const btns = [];
    if (v.rideToday) btns.push(`<button class="tw-ride">${S.rvResGo}</button>`);
    if (sat && !iLead && v.ticket && v.bombs > 0) btns.push(`<button class="tw-bomb">${S.twBomb(v.bombs)}</button>`);
    if (sat && v.ticket && v.repair > 0) btns.push(`<button class="tw-repair">${S.twRepair(v.repair)}</button>`);
    if (v.turns > 0 && !over) btns.push(`<button class="tw-build">${S.twBuild(v.turns)}</button>`);
    // (Saturday won: tell your friends, with the crew's invite)
    const place = over && r?.final ? r.final.order.indexOf(mine) + 1 : 0;
    if (place === 1) btns.unshift(`<button class="tw-share">${S.twShareWin}</button>`);
    if (!btns.length) btns.push(`<p class="tw-none">${over ? S.twKroning : v.craneShut ? S.twCraneShut : S.twNoTurn}</p>`);
    ov.innerHTML = `<div class="tw-top"><button class="tw-back">${S.twBack}</button><div class="tw-card"><b>🏝️ ${esc(v.name || S.spanMenu)}${boss ? `<button class="tw-rename" aria-label="${S.twRename}">✏️</button>` : ''}<button class="tw-help" aria-label="${S.howTo}">?</button></b>
        <span>${S.twHeight} <em>${fmtM(v.heightM || 0)}</em> · ${S.twPeople} <em>${fmtInt(v.people | 0)}</em></span></div></div>
      <div class="tw-panel${folded ? ' min' : ''}"><button class="tw-fold" aria-label="${S.twFold}"></button>${renameForm}${helping ? helpHtml() : ''}${river}${over || v.phase === 'kroning' ? '' : `<p>${v.ticket ? S.twTicketOk : S.twTicket(v.weekdays | 0, 3)}</p><p>${S.twBombs(v.bombs | 0)}</p>`}${r ? '' : `<p class="tw-sat">${S.twSat}</p>`}
        ${members}${news ? `<ul class="tw-news">${news}</ul>` : ''}
        <div class="tw-btns">${btns.join('')}</div>${crew && crew.members.length > 1 && !weekend ? `<button class="tw-leave">${S.spanLeave}</button>` : ''}${clockRow(v.clock)}</div>`;
    const on = (sel, fn) => ov.querySelector(sel)?.addEventListener('click', fn);
    on('.tw-fold', () => fold(!folded));
    on('.tw-help', () => { helping = !helping; fold(false); paint(v); });
    on('.tw-rename', () => { renaming = true; fold(false); paint(v); ov.querySelector('.tw-name')?.focus(); });
    on('.tw-cancel', () => { renaming = false; paint(v); });
    ov.querySelector('.tw-rename-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = ov.querySelector('.tw-name')?.value || '';
      renaming = false;
      paint(v);
      d.onRename?.(name);
    });
    ov.querySelectorAll('.tw-rm').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (removing !== id) { removing = id; paint(v); return; }
      removing = null;
      paint(v);
      d.onRemove?.(id);
    }));
    on('.tw-back', () => d.onBack?.());
    on('.tw-ride', () => d.onRide?.());
    on('.tw-build', () => d.onBuild?.());
    on('.tw-repair', () => d.onRepair?.());
    on('.tw-bomb', () => d.onBomb?.());
    on('.tw-invite', () => d.onInvite?.());
    on('.tw-share', () => d.onShareWin?.());
    on('.tw-leave', () => d.onLeave?.());
    ov.querySelectorAll('.tw-clock button').forEach((b) => b.addEventListener('click', () => v.clock.jump(b.dataset.at)));
  }
  /** (tests and his home play, ?debug=1 against a server with a test clock) the server's time and jumps through the week. */
  function clockRow(c) {
    if (!c?.sast) return '';
    const mon = weekOf(c.sast.slice(0, 10));
    const at = (k, hm) => `${plusDays(mon, k)}T${hm}`;
    const jumps = [['Ma', at(0, '08:00')], ['Wo', at(2, '18:00')], ['Vr', at(4, '18:00')], ['Sa 09', at(5, '09:00')], ['Sa 13', at(5, '13:00')], ['Sa 21:05', at(5, '21:05')], ['Ma ná', at(7, '08:00')]];
    return `<div class="tw-clock"><span>🕒 ${esc(c.sast.replace('T', ' '))}</span>${jumps.map(([l, a]) => `<button data-at="${a}">${l}</button>`).join('')}</div>`;
  }
  if (!document.getElementById('tw-style')) {
    const st = document.createElement('style');
    st.id = 'tw-style';
    st.textContent = `
#rivier .tw-top { position: absolute; left: 10px; right: 10px; top: calc(10px + var(--sat, 0px)); display: flex; gap: 8px; align-items: flex-start; pointer-events: none; }
#rivier .tw-back { pointer-events: auto; min-height: 44px; padding: 0 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,.3); background: rgba(13,34,40,.66); color: #fff; font: inherit; font-weight: 900; font-size: 16px; }
#rivier .tw-card { flex: 1; display: grid; gap: 2px; padding: 8px 14px; border-radius: 16px; background: rgba(13,34,40,.66); border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
#rivier .tw-card b { font-size: 19px; font-weight: 900; }
#rivier .tw-card span { font-size: 13px; font-weight: 800; color: #d4f3ec; }
#rivier .tw-card em { font-style: normal; color: #fff3c4; }
#rivier .tw-panel { pointer-events: auto; position: absolute; left: 50%; bottom: calc(14px + var(--sab, 0px)); transform: translateX(-50%); width: min(92%, 420px); max-height: 56%; overflow-y: auto; padding: 14px 16px; border-radius: 22px;
  background: rgba(16,30,36,.86); border: 1px solid rgba(255,255,255,.2); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 18px 50px rgba(0,0,0,.4); }
#rivier .tw-panel p { margin: 0 0 6px; font-weight: 800; font-size: 15px; color: #e3f6f1; }
#rivier .tw-panel .tw-sat { font-size: 13px; color: #b9d6e3; }
#rivier .tw-river h3 { margin: 0 0 6px; font-size: 16px; }
#rivier .tw-river ol { margin: 0 0 6px; padding: 0; list-style: none; display: grid; gap: 4px; }
#rivier .tw-river li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 10px; border-radius: 10px; background: rgba(255,255,255,.07); font-weight: 800; font-size: 14px; }
#rivier .tw-river li.me { background: rgba(143,240,216,.18); }
#rivier .tw-river li.lead b { color: #ffd65c; }
#rivier .tw-river li i { font-style: normal; color: #9fe8d3; }
#rivier .tw-place { font-size: 17px !important; color: #ffd65c !important; }
#rivier .tw-crew { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 4px 0 8px; font-size: 13px; font-weight: 800; color: #d4f3ec; }
#rivier .tw-invite { min-height: 40px; padding: 0 12px; border-radius: 12px; border: 0; background: #25d366; color: #05300f; font: inherit; font-weight: 900; font-size: 15px; }
#rivier .tw-news { margin: 0 0 6px; padding: 0; list-style: none; font-size: 13px; font-weight: 700; color: #cfe3ea; display: grid; gap: 3px; }
#rivier .tw-btns { display: grid; gap: 8px; margin-top: 10px; }
#rivier .tw-help { pointer-events: auto; margin-left: 6px; width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(255,255,255,.4); background: rgba(255,255,255,.12); color: #fff; font: inherit; font-weight: 900; font-size: 14px; line-height: 1; padding: 0; vertical-align: middle; }
#rivier .tw-helpbox { list-style: none; margin: 0 0 10px; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,.08); display: grid; gap: 8px; font-size: 13px; font-weight: 700; color: #e3f6f1; }
#rivier .tw-helpbox li { display: grid; grid-template-columns: 22px 1fr; gap: 6px; }
#rivier .tw-rename { pointer-events: auto; margin-left: 8px; border: 0; background: none; font-size: 15px; padding: 0 4px; min-height: 30px; }
#rivier .tw-rename-form { display: flex; gap: 6px; margin: 0 0 10px; }
#rivier .tw-name { flex: 1; min-width: 0; min-height: 40px; padding: 0 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.1); color: #fff; font: inherit; font-weight: 800; font-size: 16px; }
#rivier .tw-save, #rivier .tw-cancel { min-height: 40px; padding: 0 10px; border-radius: 10px; border: 0; font: inherit; font-weight: 900; }
#rivier .tw-save { background: #ffd65c; color: #2b1a00; }
#rivier .tw-cancel { background: rgba(255,255,255,.12); color: #fff; }
#rivier .tw-m { display: inline-flex; align-items: center; gap: 2px; }
#rivier .tw-dot { opacity: .6; margin: 0 2px; }
#rivier .tw-rm { min-height: 28px; min-width: 28px; padding: 0 6px; border-radius: 8px; border: 0; background: rgba(255,255,255,.1); color: #ffb3a6; font: inherit; font-weight: 900; font-size: 13px; }
#rivier .tw-rm.ask { background: #e0442a; color: #fff; }
#rivier .tw-fold { display: block; width: 64px; height: 22px; margin: -8px auto 4px; border: 0; background: none; position: relative; }
#rivier .tw-fold::before { content: ''; position: absolute; left: 14px; right: 14px; top: 9px; height: 5px; border-radius: 3px; background: rgba(255,255,255,.35); }
#rivier .tw-panel.min > :not(.tw-btns):not(.tw-fold) { display: none; }
#rivier .tw-panel.min .tw-btns { margin-top: 0; }
#rivier .tw-clock { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,.25); font: 12px/1.2 monospace; color: #b9d6e3; }
#rivier .tw-clock span { width: 100%; }
#rivier .tw-clock button { min-height: 30px; padding: 0 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.08); color: #fff; font: inherit; }
#rivier .tw-btns button { min-height: 52px; border-radius: 14px; border: 0; font: inherit; font-weight: 900; font-size: 18px; }
#rivier .tw-ride { background: linear-gradient(180deg, #8ff0d8, #2fb59c); color: #062b25; box-shadow: 0 4px 0 #18806c; }
#rivier .tw-build { background: linear-gradient(180deg, #ffd65c, #f0a81c); color: #2b1a00; box-shadow: 0 4px 0 #a86e00; }
#rivier .tw-bomb { background: linear-gradient(180deg, #ff8a6b, #e0442a); color: #2b0700; box-shadow: 0 4px 0 #8f2412; }
#rivier .tw-share { background: linear-gradient(180deg, #4ee28a, #25b864); color: #052b14; box-shadow: 0 4px 0 #157a3f; }
#rivier .tw-repair { background: linear-gradient(180deg, #b7d3ff, #5b8fe0); color: #071a3a; box-shadow: 0 4px 0 #2e5da8; }
#rivier .tw-leave { display: block; margin: 10px auto 0; min-height: 36px; padding: 0 12px; border: 0; background: none; color: #9fb6c0; font: inherit; font-weight: 800; font-size: 13px; text-decoration: underline; }
#rivier .tw-none { text-align: center; color: #b9d6e3 !important; font-size: 14px !important; }`;
    document.head.appendChild(st);
  }
  paint(d);
  function place() {
    const r = gameCanvas?.getBoundingClientRect() || { left: 0, top: 0, width: innerWidth, height: innerHeight };
    Object.assign(host.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    stage.resize();
  }
  addEventListener('resize', place);
  // a tap on the island (not a drag, not the panel): fold or unfold the panel
  let downAt = null;
  const onTownDown = (e) => { downAt = e.target.closest?.('.tw-panel, .tw-top') ? null : { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onTownUp = (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 12 && performance.now() - downAt.t < 400) fold(!folded);
    downAt = null;
  };
  host.addEventListener('pointerdown', onTownDown);
  host.addEventListener('pointerup', onTownUp);
  // the camera drifts slowly round the island; the whole tower (and the towers round it) fit the picture between the
  // card at the top and the panel (a small phone's panel takes more of it)
  let room = { f: 0.6, top: 0.1 };
  function measure() {
    const hr = host.getBoundingClientRect();
    const pr = ov.querySelector('.tw-panel')?.getBoundingClientRect();
    const tr = ov.querySelector('.tw-top')?.getBoundingClientRect();
    if (!hr.height || !pr) return;
    const top = tr ? clamp((tr.bottom - hr.top) / hr.height, 0, 0.25) : 0.1;
    const f = clamp((pr.top - hr.top) / hr.height - top, 0.25, 0.8);
    room = { f, top };
  }
  function frame(dt) {
    const h = Math.max(16, island.top, island.plotTop) + (crownTag ? 5 * Math.max(1, island.top / 28) : 6);
    t += dt;
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) measure();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // (the tower fills the free band: its middle sits at the band's middle)
    const D = Math.max(46, (h / room.f) / (2 * half));
    const a = 0.5 + (reduced ? 0 : t * 0.045);
    const bandMid = room.top + room.f / 2;   // (from the top, 0..1)
    const mid = h * 0.5 + (bandMid - 0.5) * (h / room.f);
    camera.position.set(Math.sin(a) * D, mid + D * 0.12, -IZ + Math.cos(a) * D);
    camera.lookAt(0, mid, -IZ);
    if (flood) {
      flood.position.set(camera.position.x * 0.6, camera.position.y + 30, camera.position.z * 0.6);
      flood.target.position.set(0, mid * 0.6, -IZ);
    }
    island.group.position.set(0, -0.6, -IZ);
    island.update(t);
    world.update(0, t);
    fw?.update(dt, island.top);
  }
  function loop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    world.reflect(stage.renderer, camera);
    stage.render(dt);
  }
  host.style.display = 'block';
  place();
  measure();
  frame(0);
  const ready = (async () => {
    stage.render(0);
    await new Promise((res) => requestAnimationFrame(res));
    raf = requestAnimationFrame(loop);
  })();
  function close() {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    removeEventListener('resize', place);
    host.removeEventListener('pointerdown', onTownDown);
    host.removeEventListener('pointerup', onTownUp);
    if (flood) scene.remove(flood, flood.target);
    audio.setAmbience?.(ambBefore);
    fw?.dispose();
    setCrownOff();
    scene.remove(island.group, things.spray);
    disposeTree(island.group);
    island.dispose();
    things.dispose();
    world.dispose();
    ov.innerHTML = '';
    host.style.display = 'none';
    if (current === api) current = null;
  }
  const api = {
    ready, close, state: () => ({ phase: 'town', h: Math.max(16, island.top, island.plotTop) + 6, rescued: [] }),
    gpu: () => ({ ...stage.renderer.info.memory, programs: stage.renderer.info.programs?.length | 0 }),
    /** The server's newer answer: the panel again, the tower as it stands now. */
    refresh(v) {
      if (!alive) return;
      paint({ ...d, ...v });
      island.setFloors(v.floors || []);
      island.setPlots({ towers: v.plots || d.plots || [], monuments: v.monuments || [] });
      won = wonOf({ ...d, ...v });
      if (won && !fw) fw = createFireworks(scene, reduced);
      setCrown();
    },
  };
  return api;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Fireworks over the island (Saturday's winners): a rocket's trail up, a burst of coloured sparks that fall and fade,
 * one every second or so. One cloud of points (a single draw call). { update(dt, top), dispose() }.
 */
function createFireworks(scene, reduced) {
  const N = 900;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.PointsMaterial({ size: 2.6, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -999;
  const COLS = ['#ffd65c', '#ff6a3d', '#5ce1ff', '#ff5fa8', '#8dff6a', '#ffffff'].map((h) => new THREE.Color(h));
  let next = 0;
  let wait = 0.3;
  const shells = [];
  function burst(x, y, z) {
    const a = COLS[Math.floor(Math.random() * COLS.length)];
    const b = COLS[Math.floor(Math.random() * COLS.length)];
    const n = reduced ? 40 : 110;
    for (let k = 0; k < n; k++) {
      const i = next++ % N;
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = 11 + Math.random() * 5;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = r * Math.cos(th) * sp; vel[i * 3 + 1] = u * sp; vel[i * 3 + 2] = r * Math.sin(th) * sp;
      const cc = k % 3 ? a : b;
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
      life[i] = 1.4 + Math.random() * 0.6;
    }
  }
  return {
    update(dt, top) {
      wait -= dt;
      if (wait <= 0) {
        wait = 0.8 + Math.random() * 0.9;
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 14;
        const h = Math.max(24, top);
        shells.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, y: 4, vy: 30 + Math.random() * 8, at: h * (0.45 + Math.random() * 0.4) });
      }
      for (let s = shells.length - 1; s >= 0; s--) {
        const sh = shells[s];
        sh.y += sh.vy * dt;
        // (its trail: a few sparks left behind)
        const i = next++ % N;
        pos[i * 3] = sh.x; pos[i * 3 + 1] = sh.y; pos[i * 3 + 2] = sh.z;
        vel[i * 3] = 0; vel[i * 3 + 1] = -1; vel[i * 3 + 2] = 0;
        col[i * 3] = 1; col[i * 3 + 1] = 0.8; col[i * 3 + 2] = 0.5;
        life[i] = 0.35;
        if (sh.y >= sh.at) {
          burst(sh.x, sh.y, sh.z);
          shells.splice(s, 1);
          audio.play('pop');
        }
      }
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        vel[i * 3 + 1] -= 7 * dt;
        const drag = Math.exp(-dt * 1.6);
        vel[i * 3] *= drag; vel[i * 3 + 2] *= drag;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (life[i] <= 0) pos[i * 3 + 1] = -999;
        else if (life[i] < 0.5) { col[i * 3] *= 0.95; col[i * 3 + 1] *= 0.95; col[i * 3 + 2] *= 0.95; }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    dispose() {
      scene.remove(pts);
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

function createRide(K, d) {
  const { host, ov, stage, pieces } = K;
  const { scene, camera } = stage;
  const reduced = !!d.reducedMotion;
  const gameCanvas = document.querySelector('#game > canvas');
  const world = buildRiverWorld(stage, d.scene);   // (the sky of his background skin)
  const things = createThings(scene, pieces);
  things.tint(world.fxTint);
  things.models = d.models || {};   // (the Blender models, for the island's town)
  const rider = createRider(bendMaterial, d.models?.builder || null);
  scene.add(rider.group);
  // (the board's own foam and shadow on the water, under him)
  const riderFoam = things.foam(2.6);
  riderFoam.scale.set(1.9, 1, 3.6);
  scene.add(riderFoam);
  const beasts = createBeasts(bendMaterial, d.models || {});
  // the tower you just built stands at the river's head: you dive off its top (none: a jump from a rock)
  const start = createStartTower(things, d.daily || [], d.skin || 'kleur');
  scene.add(start.group);
  const diveTop = Math.max(6, start.top);
  const DIVE = clamp(1.3 + diveTop / 70, 1.5, 2.6);
  const raid = d.mode === 'raid';
  const R = d.river || null;
  if (raid) setBend(0);   // (a straight river: a bomb's aim lands where the tower is drawn)
  const who = (d.who || []).filter((id) => CAST[id]).slice(0, 24);
  // (Saturday: the other crews' islands first, the tallest tower last, the run's big moment)
  const crewIds = (R?.rows || []).map((x) => x.id);
  const isleOrder = [...crewIds.filter((id) => id !== R?.leader), ...crewIds.filter((id) => id === R?.leader)];
  const course = raid ? raidCourse(String(d.seed || 'aanval'), isleOrder, []) : rescueCourse(String(d.seed || 'rivier'), who);
  const len = course.len;
  // the lake at the end, with your island and its Weektoring (Saturday: open water all the way, the islands in it)
  if (raid) world.setPool(1e6);
  else {
    world.setLake(len - 110);
    world.setPool(18);   // (open water round your tower at the river's head, the canyon from ~40 m)
  }
  const island = createIsland(things, { radius: 22 });
  scene.add(island.group);
  island.setFloors(d.floors || []);
  const islandZ = len + 34;   // (course z of the island's middle)

  let alive = true;
  let raf = 0;
  let last = performance.now();
  let t = 0;
  let dist = 0;
  let phase = raid ? 'run' : 'dive';   // dive → run → finish → done
  let phaseT = 0;
  let paused = false;
  let lane = 1;
  let x = laneX(1);
  // the glide across: a spring on his x (critically damped, so a quick change of mind flows on without a jerk); the
  // carve's lean and the board's heading come from how fast he's moving across
  let vx = 0;
  let aimX = x;   // (the spring's target eases toward the lane first: the glide starts softly, no kick)
  let leanV = 0;
  const LANE_W0 = 15;   // the spring's stiffness (rad/s): ~0.3 s across a lane
  const LANE_Z = 0.95;
  let slowT = 0;
  let graceT = 0;
  let hits = 0;
  const rescued = [];
  const lostAgain = [];
  let closeAt = -9;
  let streak = 0;
  /** The animals' moments, once each: Blouaap chatters, the hippo grunts as it surfaces, a crocodile snaps near you. */
  function cues(l, ahead) {
    const k = l.it.kind;
    if (k === 'monkey' && !l.said && ahead < 30) {
      l.said = true;
      audio.play('monkey');
    } else if (k === 'hippo' && !l.said && ahead < 33) {
      l.said = true;
      audio.play('hippo');
      things.emit(l.x, 0.2, -ahead, 30, 1.8, 4.5);
    } else if (k === 'croc' && !l.said && l.obj.userData.snapped?.() && Math.abs(l.x - x) < 4.5) {
      l.said = true;
      audio.play('snap');
      // (the jaws slam shut: water flies)
      things.emit(l.x, 0.3, -ahead, 22, 1.6, 3.2);
    }
  }
  const live = [];   // { it, row, obj, z, x, done }
  let rowI = 0;

  // ---------------------------------------------------------------------------------------------- Saturday: the islands
  const label = (text, gold) => labelSprite(text, { gold });   // (the crew's name and height; gold over the tallest)
  const isles = [];
  function setIsleFloors(isle, floors) {
    isle.floors = floors || [];
    isle.island.setFloors(isle.floors);
    const h = isle.island.top;
    const row = R?.rows?.find((x) => x.id === isle.crew);
    isle.tag.material.map?.dispose();
    isle.tag.material.dispose();
    isle.group.remove(isle.tag);
    isle.tag = label(`${isle.target ? '👑 ' : ''}${row?.name || ''} · ${fmtM(Math.max(0, h - 3.6))}`, isle.target);
    // (over the top of a short tower; on a tall one, low enough to stay in the picture)
    isle.tag.position.set(0, Math.min(h + 5, 24), 0);
    isle.group.add(isle.tag);
  }
  if (raid && R) {
    for (const spot of course.islands) {
      const island2 = createIsland(things, { radius: 12, jetty: false });
      island2.group.position.y = -0.6;
      const group = new THREE.Group();
      group.add(island2.group);
      scene.add(group);
      const isle = { crew: spot.crew, side: spot.side, z: spot.z, island: island2, group, floors: [], target: spot.crew === R.leader && spot.crew !== d.crewId, mine: spot.crew === d.crewId, tag: new THREE.Sprite() };
      group.add(isle.tag);
      setIsleFloors(isle, R.towers?.[spot.crew] || []);
      isles.push(isle);
    }
  }
  let bombsLeft = raid ? Math.max(0, d.bombs | 0) : 0;
  const bombs0 = bombsLeft;
  let thrown = 0;
  let bombHits = 0;
  let bombLost = 0;
  let bombCracked = 0;
  let aiming = false;   // (the scope is up: the tallest tower is in range and there's water left)
  let aimV = 0;   // how high up the tower the scope sits (m from its foot): his thumb drags it up and down
  let aimU = 0;
  let aimVv = 0;   // (where the jet would go now: the scope with the board's sway on it)
  let lockT = 0;
  let onTarget = false;
  const flights = [];
  const debris = [];
  // the burst where a jet hits: a cloud of spray that swells and fades (a soft puff, facing you)
  const burstTex = puffTexture(57);
  const flashes = [];
  const drips = [];
  // the jet: a tube along the water's arc from the nozzle to the tower, drawn between its tail and its head (both run
  // along it: the head at the jet's speed, the tail once the burst is spent); streaks of white rush along it
  const JET_N = 48;
  const JET_R = 10;
  const JET_V = 95;   // m/s
  const jetMat = new THREE.ShaderMaterial({
    uniforms: { uHead: { value: 0 }, uTail: { value: 0 }, uT: { value: 0 }, uTint: { value: world.fxTint }, uSoft: { value: 0 } },
    vertexShader: `attribute float aS; varying float vS; varying vec2 vA; varying vec3 vN; varying vec3 vV;
      void main() {
        vS = aS; vA = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `uniform float uHead; uniform float uTail; uniform float uT; uniform vec3 uTint; uniform float uSoft; varying float vS; varying vec2 vA; varying vec3 vN; varying vec3 vV;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        if (vS > uHead || vS < uTail) discard;
        float edge = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float st = vnoise(vec2(vS * 70.0 - uT * 26.0, vA.y * 9.0)) * 0.6 + vnoise(vec2(vS * 190.0 - uT * 60.0, vA.y * 21.0)) * 0.4;
        vec3 col = mix(vec3(0.42, 0.82, 0.95), vec3(1.0), smoothstep(0.35, 0.8, st) * 0.85 + (1.0 - edge) * 0.25);
        float a = mix(0.92, 0.3, edge) * (0.65 + 0.45 * st);
        // (the sleeve: a mist of spray, ragged and faint, thickest in its middle)
        if (uSoft > 0.5) {
          float m = vnoise(vec2(vS * 55.0 - uT * 18.0, vA.y * 12.0 + uT * 3.0));
          a = (1.0 - edge) * smoothstep(0.35, 0.85, m) * 0.32 * smoothstep(0.0, 0.25, vS);
          col = mix(vec3(0.78, 0.94, 1.0), vec3(1.0), m);
        }
        a *= smoothstep(uHead, uHead - 0.025, vS) * 0.6 + 0.4;
        a *= smoothstep(uTail, uTail + 0.06, vS);
        gl_FragColor = vec4(col * uTint, clamp(a, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  /** The jet's path: from `a` to `b` with the water's arc over it (`s` 0..1); `out` gets the point. */
  function jetPoint(a, b, arc, s, out) {
    return out.lerpVectors(a, b, s).setY(out.y + arc * 4 * s * (1 - s));
  }
  function jetGeometry(a, b, arc, thick = 1) {
    const pos = new Float32Array((JET_N + 1) * JET_R * 3);
    const nrm = new Float32Array((JET_N + 1) * JET_R * 3);
    const uv = new Float32Array((JET_N + 1) * JET_R * 2);
    const ss = new Float32Array((JET_N + 1) * JET_R);
    const idx = [];
    const P = new THREE.Vector3();
    const Q = new THREE.Vector3();
    const T = new THREE.Vector3();
    const N = new THREE.Vector3();
    const B = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= JET_N; i++) {
      const s = i / JET_N;
      jetPoint(a, b, arc, s, P);
      jetPoint(a, b, arc, Math.min(1, s + 0.01), Q);
      if (s >= 1) { jetPoint(a, b, arc, 0.99, Q); T.copy(P).sub(Q); } else T.copy(Q).sub(P);
      T.normalize();
      N.crossVectors(T, up).normalize();
      B.crossVectors(N, T).normalize();
      // (thin at the nozzle, opening out as it flies; a little wobble)
      const r = (0.1 + s * 0.42 + Math.sin(s * 37) * 0.02) * thick;
      for (let j = 0; j < JET_R; j++) {
        const ang = (j / JET_R) * Math.PI * 2;
        const k = i * JET_R + j;
        const nx = N.x * Math.cos(ang) + B.x * Math.sin(ang);
        const ny = N.y * Math.cos(ang) + B.y * Math.sin(ang);
        const nz = N.z * Math.cos(ang) + B.z * Math.sin(ang);
        pos.set([P.x + nx * r, P.y + ny * r, P.z + nz * r], k * 3);
        nrm.set([nx, ny, nz], k * 3);
        uv.set([s, j / JET_R], k * 2);
        ss[k] = s;
        if (i < JET_N) {
          const k2 = i * JET_R + ((j + 1) % JET_R);
          idx.push(k, k + JET_R, k2, k2, k + JET_R, k2 + JET_R);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aS', new THREE.BufferAttribute(ss, 1));
    g.setIndex(idx);
    return g;
  }
  if (raid) rider.setGun(true);
  const AIM_FAR = 115;   // m ahead: the tallest tower can be aimed at from here...
  const AIM_NEAR = 34;   // ...until it's this close (then it's beside you, out of the picture)
  /** The tallest tower, while it's ahead of you in the picture (you can aim at it): its isle, else null. */
  function targetIsle() {
    for (const isle of isles) {
      if (!isle.target) continue;
      const ahead = isle.z - dist;
      if (ahead > AIM_NEAR && ahead < AIM_FAR) return isle;
    }
    return null;
  }
  const _ray = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  /** Where a finger at (fx, fy) (host px) aims on the tower's face: { u, v } in the tower's metres, or null. */
  function aimOnTower(isle, fx, fy) {
    const rect = host.getBoundingClientRect();
    _ndc.set((fx / rect.width) * 2 - 1, -(fy / rect.height) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const O = _ray.ray.origin;
    const D = _ray.ray.direction;
    const gx = isle.group.position.x;
    if (Math.abs(D.x) < 1e-4) return null;
    const s = (gx - O.x) / D.x;
    if (!(s > 0)) return null;
    const P = O.clone().addScaledVector(D, s);
    const u = (P.z - isle.group.position.z) * (isle.side === 1 ? 1 : -1);
    const v = P.y - (isle.group.position.y + 3.0);
    return { u, v, P };
  }
  /** (tests and the autopilot) Fires where a finger at (fx, fy) (host px) points on the tallest tower. */
  function throwBomb(fx, fy) {
    const isle = targetIsle();
    if (!isle) return;
    const a = aimOnTower(isle, fx, fy);
    if (a) fireAt(isle, a.u, a.v);
  }
  /** The heights (m) of the tallest tower that are on screen now: [low, high] (under the top bar, over the button). */
  const _vs = new THREE.Vector3();
  function visibleSpan(isle) {
    const h = Math.max(2, isle.island.top - 3.6);
    const H = host.clientHeight;
    const yTop = 120;
    const yBot = H - 210;
    let lo = null;
    let hi = null;
    for (let i = 0; i <= 28; i++) {
      const v = 0.3 + (h - 0.5) * (i / 28);
      _vs.copy(towerPoint(isle, 0, v)).project(camera);
      const y = (-_vs.y * 0.5 + 0.5) * H;
      if (y < yBot && y > yTop) {
        if (lo === null) lo = v;
        hi = v;
      }
    }
    if (lo === null) return [0.3, Math.min(h - 0.2, 6)];
    return [lo, Math.max(lo, hi)];
  }
  /** The middle of the floor at height v on the tower (m across), so the scope rides on the stack as it leans. */
  function floorMidU(isle, v) {
    let best = 0;
    let bestD = Infinity;
    for (const f of isle.floors) {
      const { H } = dimsOf(f);
      const d = v < f.y ? f.y - v : v > f.y + H ? v - f.y - H : 0;
      if (d < bestD) { bestD = d; best = f.x; }
    }
    return best;
  }
  /** The water cannon fires at (u, v) on the isle's tower: the kick, a burst at the nozzle, the jet on its way. */
  function fireAt(isle, u, v) {
    if (bombsLeft <= 0) return;
    bombsLeft--;
    thrown++;
    setBombs();
    const from = rider.fire().clone();
    things.emit(from.x, from.y, from.z, 14, 0.7, 0.8);
    stage.shake(reduced ? 0 : 0.18);
    const to = towerPoint(isle, u, v);
    const len0 = from.distanceTo(to);
    const arc = Math.min(4, len0 * 0.028);
    const mesh = new THREE.Mesh(jetGeometry(from, to, arc), jetMat.clone());
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    // (the spray round it: a wider, fainter sleeve sharing the jet's run: the same head, tail and clock)
    const sleeve = new THREE.Mesh(jetGeometry(from, to, arc, 2.6), jetMat.clone());
    sleeve.material.uniforms = { ...mesh.material.uniforms, uSoft: { value: 1 } };
    sleeve.frustumCulled = false;
    sleeve.renderOrder = 4;
    mesh.add(sleeve);
    scene.add(mesh);
    flights.push({ mesh, isle, u, v, from, to, arc, t: 0, dur: Math.max(0.2, len0 / JET_V), hit: false });
    hint(null);
    audio.play('jet');
    haptics.tap?.();
  }
  /** The fire button: at the scope's spot right now (the board's sway in it), if there's a tower and water. */
  function fireNow() {
    const tgt = targetIsle();
    if (!tgt || bombsLeft <= 0 || phase !== 'run' || paused) {
      fireEl.classList.add('off');
      return;
    }
    fireAt(tgt, aimU, aimVv);
  }
  const _w = new THREE.Vector3();
  const _aimFrom = new THREE.Vector3();
  const _ahead = new THREE.Vector3(0, 0.12, -1);
  function towerPoint(isle, u, v) {
    _w.set(u, 3.6 + v, 0);
    isle.island.group.updateWorldMatrix(true, false);
    return isle.island.group.localToWorld(_w.clone());
  }
  function impact(f) {
    const isle = f.isle;
    const at = towerPoint(isle, f.u, f.v);
    // the jet bursts on the tower: a big cloud of spray, water flying off in every direction and raining down, a mist
    // that hangs a moment, and water running down the tower's face after
    const big = clamp(at.distanceTo(camera.position) / 30, 1, 3);
    things.emit(at.x, at.y, at.z, 80, 3.6, 6, big);
    things.emit(at.x, at.y + 0.5, at.z, 24, 1.8, 2.4, big * 1.3);
    if (!reduced) {
      for (const [k, life, s0, s1, op] of [[0, 0.9, 2.5, 13, 0.95], [1, 1.8, 4, 17, 0.5]]) {
        const fm = new THREE.SpriteMaterial({ map: burstTex, color: new THREE.Color(k ? '#e6f6fa' : '#f6feff').multiply(world.fxTint), transparent: true, opacity: op, depthWrite: false, fog: true });
        fm.rotation = Math.random() * 6.28;
        const fl = new THREE.Sprite(fm);
        fl.position.copy(at);
        fl.renderOrder = 6;
        scene.add(fl);
        flashes.push({ fl, t: 0, life, s0, s1, op, sink: k ? 1.6 : 0 });
      }
    }
    drips.push({ at: at.clone(), t: 0, big });
    stage.shake(reduced ? 0 : 0.45);
    audio.play('splat', { intensity: 1 });
    haptics.lost?.();
    const i = floorAt(isle.floors, f.u, f.v);
    let mine = { hit: false, lost: 0 };   // (what this side counted: the server's word corrects it)
    if (i < 0) {
      pop(S.rvMissed, 900);
      audio.play('splash');
    } else {
      const res = hitFloor(isle.floors, i);
      bombHits++;
      mine = { hit: true, lost: res.cracked ? 0 : res.lost };
      if (res.cracked) {
        setIsleFloors(isle, res.floors);
        bombCracked++;
        pop(S.rvCracked, 1200);
        audio.play('land', { intensity: 0.6, size: 0.6 });
      } else {
        // the floors knocked out fly off; the tower above drops into their place
        for (const id of res.removed) {
          const fl = isle.floors.find((x) => x.id === id);
          if (!fl) continue;
          const g = things.riverBlock(fl.s, fl.sk || 'kleur', fl.c | 0);
          g.scale.setScalar(fl.k || 1);
          const wp = towerPoint(isle, fl.x, fl.y + dimsOf(fl).H / 2);
          g.position.copy(wp);
          scene.add(g);
          debris.push({ g, v: new THREE.Vector3((Math.random() - 0.5) * 8, 6 + Math.random() * 6, (Math.random() - 0.5) * 8), w: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4), t: 0 });
        }
        bombLost += res.lost;
        setIsleFloors(isle, res.floors);
        pop(S.rvHitFloor(fmtM(res.lost)), 1200);
        audio.play('lost');
      }
    }
    // the server's word: the hit as it counts (another crew's bombs, a lead that changed)
    Promise.resolve(d.onBomb?.(isle.crew, { x: Math.round(f.u * 100) / 100, y: Math.round(f.v * 100) / 100 })).then((r) => {
      if (!alive || !r) return;
      if (r.error === 'leader' || r.error === 'phase') pop(S.rvLeadChanged, 1400);
      const sh = r.hits?.[0];
      if (sh) {
        const hit = !sh.miss;
        bombHits += (hit ? 1 : 0) - (mine.hit ? 1 : 0);
        bombLost = Math.max(0, bombLost + (hit && !sh.cracked ? sh.lost || 0 : 0) - mine.lost);
      } else if (r.error && mine.hit) {
        // (the server didn't take it: nothing happened to their tower)
        bombHits--;
        bombLost = Math.max(0, bombLost - mine.lost);
      }
      const rv = r.river;
      if (rv?.towers) {
        for (const is of isles) {
          is.target = rv.leader === is.crew && is.crew !== d.crewId;
          if (rv.towers[is.crew]) setIsleFloors(is, rv.towers[is.crew]);
        }
      } else if (r.error === 'leader' && r.leader) {
        // (the lead changed while he rode: the crown moves to the new tallest; aim there now)
        for (const is of isles) {
          const was = is.target;
          is.target = r.leader === is.crew && is.crew !== d.crewId;
          if (was !== is.target) setIsleFloors(is, is.floors);
        }
      }
    });
  }
  const _jp = new THREE.Vector3();
  function stepBombs(dt) {
    for (let k = flights.length - 1; k >= 0; k--) {
      const f = flights[k];
      f.t += dt;
      // (the head runs out at the jet's speed; the tail leaves the nozzle once the 0.35 s burst is spent)
      const head = Math.min(1, f.t / f.dur);
      const tail = clamp((f.t - 0.35) / f.dur, 0, 1);
      const U = f.mesh.material.uniforms;
      U.uHead.value = head;
      U.uTail.value = tail;
      U.uT.value = f.t;
      // spray off the jet: at its head while it flies, and here and there along it
      jetPoint(f.from, f.to, f.arc, head, _jp);
      if (head < 1) things.emit(_jp.x, _jp.y, _jp.z, 2, 0.5, 0.6);
      if (Math.random() < 0.5 && head > tail) {
        jetPoint(f.from, f.to, f.arc, tail + Math.random() * (head - tail), _jp);
        things.emit(_jp.x, _jp.y, _jp.z, 1, 0.4, 0.2);
      }
      if (head >= 1 && !f.hit) {
        f.hit = true;
        impact(f);
      }
      if (tail >= 1) {
        scene.remove(f.mesh);
        for (const m of [f.mesh, ...f.mesh.children]) { m.geometry.dispose(); m.material.dispose(); }
        flights.splice(k, 1);
      }
    }
    // (the water running down the tower after a hit: drips off its face for a moment)
    for (let k = drips.length - 1; k >= 0; k--) {
      const dr = drips[k];
      dr.t += dt;
      if (Math.random() < 0.8) things.emit(dr.at.x + (Math.random() - 0.5) * 1.6, dr.at.y - Math.random() * 2, dr.at.z + 0.6, 2, 0.15, -0.5, dr.big);
      if (dr.t > 1.6) drips.splice(k, 1);
    }
    for (let k = flashes.length - 1; k >= 0; k--) {
      const fx = flashes[k];
      fx.t += dt;
      const q = fx.t / fx.life;
      fx.fl.scale.setScalar(fx.s0 + Math.sqrt(Math.min(1, q)) * (fx.s1 - fx.s0));
      fx.fl.material.opacity = Math.max(0, fx.op * (q < 0.25 ? 1 : 1 - (q - 0.25) / 0.75));
      fx.fl.material.rotation += dt * 0.4;
      fx.fl.position.y -= fx.sink * dt;
      if (q >= 1) {
        scene.remove(fx.fl);
        fx.fl.material.dispose();
        flashes.splice(k, 1);
      }
    }
    for (let k = debris.length - 1; k >= 0; k--) {
      const b = debris[k];
      b.t += dt;
      b.v.y -= 14 * dt;
      b.g.position.addScaledVector(b.v, dt);
      b.g.rotation.x += b.w.x * dt;
      b.g.rotation.y += b.w.y * dt;
      if (b.t > 2.2 || b.g.position.y < -3) {
        if (b.g.position.y < 0.5 && b.t < 2.2) things.emit(b.g.position.x, 0.2, b.g.position.z, 16, 2, 3);
        scene.remove(b.g);
        debris.splice(k, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- the overlay
  ov.innerHTML = `<div class="rv-top"><div class="rv-count"><span class="rv-ring"></span><b>0</b><small>/ ${who.length}</small></div><div class="rv-bar"><i></i></div><button class="rv-pause" aria-label="${S.pause}">❚❚</button></div>
    <div class="rv-faces"></div><div class="rv-hint"></div><div class="rv-pop"></div><div class="rv-hurt"></div>
    <div class="rv-card"></div><div class="rv-scope"><svg viewBox="0 0 132 132" aria-hidden="true"><circle class="ring" cx="66" cy="66" r="54"/><g class="ticks">${Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; const r1 = i % 3 ? 49 : 44; return `<line x1="${(66 + Math.cos(a) * r1).toFixed(1)}" y1="${(66 + Math.sin(a) * r1).toFixed(1)}" x2="${(66 + Math.cos(a) * 54).toFixed(1)}" y2="${(66 + Math.sin(a) * 54).toFixed(1)}"/>`; }).join('')}</g><g class="cross"><line x1="66" y1="24" x2="66" y2="57"/><line x1="66" y1="75" x2="66" y2="108"/><line x1="24" y1="66" x2="57" y2="66"/><line x1="75" y1="66" x2="108" y2="66"/></g><path class="brk" d="M10 32 V10 H32 M100 10 H122 V32 M122 100 V122 H100 M32 122 H10 V100"/><circle class="dot" cx="66" cy="66" r="3.5"/></svg><div class="rng"></div></div><button class="rv-fire" aria-label="${S.rvFire}"><svg class="pips" viewBox="0 0 112 112"></svg><span class="in"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12 2.5c-.4 0-.7.2-.9.5C9.4 5.6 5.5 10.9 5.5 14.6a6.5 6.5 0 0 0 13 0c0-3.7-3.9-9-5.6-11.6-.2-.3-.5-.5-.9-.5z"/><path fill="#9feaf5" d="M9.2 14.4c.3 1.6 1.4 2.7 3 3" stroke="#0b6f8a" stroke-width="1.6" stroke-linecap="round"/></svg><span>${S.rvFire}</span></span></button><div class="rv-paused"><div><h2>${S.rvPaused}</h2><button class="rv-on">${S.rvResume}</button><button class="rv-off">${S.rvQuit}</button></div></div>`;
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
  const scopeEl = ov.querySelector('.rv-scope');
  const scopeRng = scopeEl.querySelector('.rng');
  const fireEl = ov.querySelector('.rv-fire');
  function setBombs() {
    if (!raid) return;
    countB.textContent = S.rvBombsLeft(bombsLeft);
    countEl.querySelector('small').textContent = '';
    countEl.querySelector('.rv-ring').style.display = 'none';
    // (the fire button's ring: one bead of water for each shot, lit while it's still yours)
    const n = Math.max(1, bombs0);
    const gap = n > 1 ? 0.16 : 0;
    let arcs = '';
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2 + gap / 2;
      const a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2 - gap / 2;
      const P = (a) => `${(56 + Math.cos(a) * 52).toFixed(1)} ${(56 + Math.sin(a) * 52).toFixed(1)}`;
      arcs += `<path class="${i < bombsLeft ? 'full' : 'empty'}" d="M${P(a0)} A52 52 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${P(a1)}"/>`;
    }
    fireEl.querySelector('.pips').innerHTML = arcs;
    rider.setWater?.(bombs0 ? bombsLeft / bombs0 : 0);
  }
  facesEl.innerHTML = who.map((id, i) => `<img src="${faceUrl(id, 64)}" alt="" data-i="${i}" class="out">`).join('');
  let popT = 0;
  function pop(text, ms = 1200) {
    popEl.textContent = text;
    popEl.classList.toggle('long', String(text).length > 18);
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
      vx += dir * 3.5;
      return;
    }
    lane = to;
    haptics.tap?.();
    hint(null);
  }
  const onDown = (e) => {
    if (e.target.closest?.('button')) return;
    const hp = hostXY(e);
    down = { x: e.clientX, y: e.clientY, hx: hp.x, hy: hp.y, t: performance.now(), used: false };
  };
  const hostXY = (e) => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  let aimPerPx = 0.05;   // (m of tower a pixel of thumb is worth: from the tower's size on screen, each frame)
  const onMoveP = (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (down.used === 'aim') {
      // dragging the scope up or down the tower: it follows the thumb at the tower's own scale on the screen
      aimV -= (e.clientY - down.ly) * aimPerPx;
      down.ly = e.clientY;
      return;
    }
    if (down.used) return;
    // (Saturday, the scope up: up and down aims, left and right still steers)
    if (aiming && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.1) {
      down.used = 'aim';
      down.ly = e.clientY;
      return;
    }
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) {
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
  // the fire button: fires on the touch (no wait for the finger to lift), pressed in while held
  const onFire = (e) => {
    e.preventDefault();
    e.stopPropagation();
    fireEl.classList.add('press');
    fireNow();
  };
  const onFireUp = () => fireEl.classList.remove('press');
  fireEl.addEventListener('pointerdown', onFire);
  fireEl.addEventListener('pointerup', onFireUp);
  fireEl.addEventListener('pointerleave', onFireUp);
  const onKey = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') move(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') move(1);
    else if (e.key === 'Escape' || e.key === 'p') setPaused(!paused);
  };
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMoveP);
  host.addEventListener('pointerup', onUp);
  // (the phone took the touch away, e.g. a notification: the drag ends)
  const onCancel = () => {
    down = null;
    fireEl.classList.remove('press');
  };
  host.addEventListener('pointercancel', onCancel);
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
        if (it.kind === 'block') obj = things.floating({ ...it, skin: d.skin || 'kleur' });
        else if (it.kind === 'rock') obj = things.rock();
        else if (it.kind === 'croc') obj = beasts.croc(it.drift ? Math.sign(it.drift) : (rowI % 2 ? 1 : -1));
        else if (it.kind === 'hippo') obj = beasts.hippo();
        else if (it.kind === 'monkey') {
          const blk = things.floating({ ...it, skin: d.skin || 'kleur', spin: 0 });
          obj = beasts.monkeyOn(blk, Math.sign(-(it.drift || 1)), blk.userData.top);
        } else obj = things.person(it.who, who.indexOf(it.who));
        scene.add(obj);
        live.push({ it, row, obj, z: row.z, x: laneX(it.lane), done: false, drift: it.drift || 0 });
      }
    }
  }
  function despawn(l) {
    scene.remove(l.obj);
    l.obj.traverse((o) => { if (o.isSprite) o.material.dispose(); });
    // (an animal's own shapes and materials, not the shared kit's)
    disposeTree(l.obj);
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
    streak = 0;
    const back = rescued.pop();
    if (back) {
      lostAgain.push(back);
      setCount();
      pop(S.rvSlipped(CAST[back]?.name || ''), 1400);
    } else {
      pop(({ croc: S.rvCroc, hippo: S.rvHippo, monkey: S.rvMonkey })[l.it.kind] || S.rvOuch, 1000);
    }
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
    streak++;
    if (k === who.length && who.length > 1) pop(S.rvAll, 1400);
    else if (streak === 3 || streak === 5 || streak === 8) pop(S.rvStreak(streak), 900);
  }

  // ---------------------------------------------------------------------------------------------- the autopilot (tests)
  function pilot() {
    if (phase !== 'run' || Math.abs(laneX(lane) - x) > 0.3) return;   // (tests' autopilot: one glide at a time)
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
      const k = ease(clamp(phaseT / DIVE, 0, 1));
      // out in front of your tower and to the side, watching him jump off its top and fall; round to behind him as he lands
      const y = rider.group.position.y;
      const back = Math.max(14, diveTop * 0.75);
      const front = new THREE.Vector3(7, y * 0.75 + 3, START_Z - back);
      const behind = new THREE.Vector3(x * 0.82, 6.4, 11.5);
      p = front.lerp(behind, ease(clamp((k - 0.45) / 0.55, 0, 1)));
      l = new THREE.Vector3(0, y * 0.95 + 0.5, START_Z * (1 - k)).lerp(new THREE.Vector3(x * 0.62, 0.4, -22), ease(clamp((k - 0.55) / 0.45, 0, 1)));
    } else if ((phase === 'finish' || phase === 'done') && !raid) {
      // up and back until the whole Weektoring and its island stand in the top part of the picture (the card has the
      // bottom third): the camera's distance from the tower's height and the lens
      const k = ease(clamp(phaseT / FINISH_S, 0, 1));
      const iz = -(islandZ - dist);
      const h = Math.max(16, towerTop()) + 6;
      const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const back = Math.max(40, (h / 0.62) / (2 * half));
      const mid = h * 0.5 - (h / 0.62) * 0.19;   // (the picture's middle sits lower: the tower fills its top 62 %)
      const from = new THREE.Vector3(x * 0.82, 6.4, 11.5);
      const to = new THREE.Vector3(back * 0.32, mid + back * 0.08, iz + back);
      p = from.lerp(to, k);
      l = new THREE.Vector3(x * 0.62, 0.4, -22).lerp(new THREE.Vector3(0, mid, iz), k);
    } else {
      // behind and above him, the river ahead filling the screen; he rides in the lower third, near the middle (the camera
      // follows most of a lane change, so the move still shows)
      p = new THREE.Vector3(x * 0.82, 6.4, 11.5);
      l = new THREE.Vector3(x * 0.62, 0.4, -22);
      // Saturday: the tallest tower coming by turns the camera halfway towards it (a little more while you aim), still
      // looking down a little, so he and the tower's lower part are both in the picture (a phone held upright is narrow)
      const tgt = raid ? targetIsle() : null;
      if (tgt) {
        const ahead = tgt.z - dist;
        const k = clamp((AIM_FAR + 8 - ahead) / 20, 0, 1) * clamp((ahead - AIM_NEAR + 6) / 12, 0, 1) * (aiming ? 0.6 : 0.42);
        const far = 11.5 + ahead;
        const turned = new THREE.Vector3(tgt.group.position.x, 6.4 - 0.1 * far, tgt.group.position.z);
        l.lerp(turned, k);
        p.z += 2 * k;
      }
    }
    if (phase === 'zoo') {
      p = new THREE.Vector3(Number(d.zooCam?.[0] ?? 0), Number(d.zooCam?.[1] ?? 3.2), Number(d.zooCam?.[2] ?? 2));
      l = new THREE.Vector3(0, 0.6, -12);
    } else if (d.debugCam === 'rider') {   // (tests: a close look at the rider)
      p = new THREE.Vector3(x + 2.6, 1.7, 3.4);
      l = new THREE.Vector3(x, 0.9, 0);
    } else if (d.debugCam === 'back') {
      p = new THREE.Vector3(x + 0.6, 1.9, 4.2);
      l = new THREE.Vector3(x, 0.9, 0);
    } else if (d.debugCam === 'side') {   // (tests: his gear from his right, close)
      p = new THREE.Vector3(x + 1.9, 1.75, -1.1);
      l = new THREE.Vector3(x, 1.35, 0);
    } else if (d.debugCam === 'face') {   // (tests: his face, close)
      p = new THREE.Vector3(x + 0.55, 1.95, -1.05);
      l = new THREE.Vector3(x + 0.05, 1.82, 0);
    } else if (d.debugCam === 'left') {
      p = new THREE.Vector3(x - 1.9, 1.75, -0.6);
      l = new THREE.Vector3(x, 1.35, 0);
    }
    const a = phase === 'run' ? 1 - Math.exp(-dt * 9) : phase === 'dive' ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 4);
    cam.pos.lerp(p, a);
    cam.look.lerp(l, a);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    // the feel of speed: the view widens a little as the river speeds up and in the rapids (narrower while aiming), and
    // leans a touch into each carve (none with less motion)
    if (!reduced && phase === 'run' && !d.debugCam) {
      const sp = clamp((speedAt(dist, len) - RIVER.speed0) / (RIVER.speed1 - RIVER.speed0), 0, 1);
      const want = FOV0 + sp * 5 + rapK * 3 - (aiming ? 6 : 0);
      camera.fov += (want - camera.fov) * (1 - Math.exp(-dt * 3));
      camera.updateProjectionMatrix();
      camRoll += (-leanV * 0.045 - camRoll) * (1 - Math.exp(-dt * 6));
      camera.rotateZ(camRoll);
    } else if (Math.abs(camera.fov - FOV0) > 0.01) {
      camera.fov += (FOV0 - camera.fov) * (1 - Math.exp(-dt * 4));
      camera.updateProjectionMatrix();
    }
  }
  const FOV0 = camera.fov;
  let camRoll = 0;

  // ---------------------------------------------------------------------------------------------- the loop
  let pilotOn = !!d.autopilot;
  let ambNow = -1;
  const ambBefore = audio.ambience ?? 0;   // (the game's own level, back when the ride closes)
  let aimHintSaid = false;
  const pilotThrew = new Set();
  let rapK = 0;
  let startGone = 0;
  let rapSaid = false;
  if (course.rapids) world.setRapids(course.rapids.from, course.rapids.to);
  function step(dt) {
    t += dt;
    phaseT += dt;
    if (phase === 'dive') {
      // he falls from the top into the river: a splash, and he's up on his board
      const k = clamp(phaseT / DIVE, 0, 1);
      // off the top: a little hop up, then the fall (a flip on the way), into the river ahead of the tower
      const hop = Math.sin(Math.min(1, k * 3) * Math.PI) * 1.2 * (1 - k);
      rider.group.position.y = Math.max(0, (diveTop + 0.6) * (1 - k * k) + hop - 0.2);
      rider.group.position.z = START_Z * (1 - k);
      rider.group.rotation.x = -Math.PI * 2 * ease(k);
      if (k >= 1) {
        phase = 'run';
        phaseT = 0;
        rider.group.position.z = 0;
        rider.group.rotation.x = 0;
        startGone = t;
        things.emit(0, 0.2, 0, 60, 2.6, 7);
        stage.shake(reduced ? 0 : 0.5);
        audio.play('splash');
        audio.music?.(true, { bpm: 104, layers: 1, key: 2 });
        hint(S.rvHint);
      }
    } else if (phase === 'run') {
      if (pilotOn) pilot();
      if (raid) {
        const tgt = targetIsle();
        const can = !!tgt && bombsLeft > 0;
        if (can && !aimHintSaid) {
          aimHintSaid = true;
          if (!thrown) hint(S.rvAimHint);
        } else if (!tgt && aimHintSaid) hint(null);
        // the scope comes up on the tallest tower by itself, two thirds of the way up it (his thumb moves it from there)
        if (can && !aiming) {
          aiming = true;
          lockT = 0;
          audio.play('click');
        }
        if (!can && aiming) aiming = false;
        if (pilotOn && can && tgt.z - dist < AIM_FAR - 25 - bombsLeft * 12 && !pilotThrew.has(`${tgt.crew}${bombsLeft}`)) {
          // (tests: the autopilot fires at the tower's middle)
          pilotThrew.add(`${tgt.crew}${bombsLeft}`);
          const h = Math.max(4, tgt.island.top - 3.6);
          const v = h * (0.3 + 0.2 * bombsLeft);
          fireAt(tgt, floorMidU(tgt, v), v);
        }
      }
      const rap = course.rapids && dist > course.rapids.from && dist < course.rapids.to;
      if (rap && !rapSaid) {
        rapSaid = true;
        pop(S.rvRapids, 1100);
        audio.play('splash');
      }
      rapK += ((rap ? 1 : 0) - rapK) * Math.min(1, dt * 2.5);
      if (rapK > 0.3) stage.shake(reduced ? 0 : 0.04 * rapK);
      const sp = speedAt(dist, len) * (slowT > 0 ? RIVER.hitSlowK : 1) * (1 + 0.24 * rapK);
      dist += sp * dt;
      slowT = Math.max(0, slowT - dt);
      graceT = Math.max(0, graceT - dt);
      rider.setBlink(graceT > 0 && Math.floor(t * 10) % 2 === 0);
      if (phaseT > 7) hint(null);
      if (dist > len * 0.4) audio.musicSet?.({ layers: 2, bpm: 112 });
      if (dist >= len - RIVER.finishRun + 10) {
        phase = 'finish';
        phaseT = 0;
        hint(null);
        audio.musicSet?.({ layers: 3 });
        if (raid && !flights.length) done();
      }
    } else if (phase === 'finish' && raid) {
      dist += speedAt(dist, len) * dt * 0.5;
      if (!flights.length && phaseT > 0.8) done();
    } else if (phase === 'finish') {
      // in to the jetty, slowing down
      const k = clamp(phaseT / FINISH_S, 0, 1);
      const sp = speedAt(dist, len) * (1 - ease(k)) + 1.5;
      dist = Math.min(islandZ - 22 - 16, dist + sp * dt);
      if (k >= 1) done();
    }
    // the lane: the spring glides him across (small steps: steady on a slow phone too)
    for (let left = dt; left > 1e-6;) {
      const h = Math.min(left, 1 / 120);
      aimX += (laneX(lane) - aimX) * (1 - Math.exp(-h * 20));
      vx += (LANE_W0 * LANE_W0 * (aimX - x) - 2 * LANE_Z * LANE_W0 * vx) * h;
      x += vx * h;
      left -= h;
    }
    leanV += (clamp(vx / 13, -1, 1) - leanV) * (1 - Math.exp(-dt * 14));
    rider.group.position.x = x;
    riderFoam.position.set(x, 0.03, 0.05);
    riderFoam.visible = phase !== 'dive' || rider.group.position.y < 0.3;
    rider.update(dt, { lean: leanV, yaw: Math.atan2(-vx, Math.max(4, speedAt(dist, len))) * 0.8, crouch: slowT > 0 ? slowT / RIVER.hitSlowS : 0, speed: speedAt(dist, len) });
    // spray off the board's tail
    if (phase === 'run' && Math.random() < 0.85) things.emit(x - leanV * 0.3, 0.12, 0.9, 1 + Math.round(rapK * 2), 0.6 + rapK, 1.4 + Math.abs(leanV) * 2 + rapK * 1.5);

    if (phase !== 'zoo') spawn();
    for (const l of live) {
      const ahead = phase === 'zoo' ? 12 - (t % 14) : l.z - dist;
      // a drifting block crosses as you come (it's in its own lane when it's level with you)
      let lx = l.zooX ?? laneX(l.it.lane);
      if (l.drift) lx = laneX(l.it.lane) + l.drift * RIVER.laneW * ease(clamp((ahead - 4) / 46, 0, 1));
      l.x = lx;
      const u = l.obj.userData;
      l.obj.position.set(lx, u.kind === 'croc' || u.kind === 'hippo' ? 0 : Math.sin(t * 1.9 + (u.phase || 0)) * 0.08, phase === 'zoo' ? -12 : -ahead);
      if (u.block && u.kind !== 'monkey') {
        u.block.rotation.y += dt * 0.2;
        u.block.rotation.z = Math.sin(t * 1.3 + u.phase) * 0.05;
      }
      if (u.arm) u.arm.rotation.z = -0.4 + Math.sin(t * 9 + u.phase) * 0.7;
      u.update?.(t, ahead, dt);
      if (phase === 'run') cues(l, ahead);
      if (l.done || phase !== 'run') continue;
      if (Math.abs(ahead) < (u.d || 1.4) / 2 + 0.5) {
        const dx = Math.abs(l.x - x);
        const reach = (u.w || 2.4) / 2 + HIT_R;
        if (l.it.kind === 'person') {
          if (dx < GRAB_R) grab(l);
        } else if (graceT <= 0 && dx < reach && (l.it.kind !== 'hippo' || u.surfaced?.())) {
          l.done = true;
          knock(l);
        } else if (dx < reach + 0.7 && dx >= reach) {
          l.close = true;   // (it went by within a hand's width: "Amper!" once it's behind you)
        }
      } else if (l.close && ahead < 0 && !l.done) {
        l.done = true;
        if (t - closeAt > 3) {
          closeAt = t;
          pop(S.rvClose, 700);
          audio.play('fling');
        }
      }
    }
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].z < dist - BEHIND) {
        despawn(live[i]);
        live.splice(i, 1);
      }
    }
    // the island ahead, in the lake; your tower behind, at the river's head (Saturday: the four crews' islands)
    island.group.position.set(0, -0.6, -(islandZ - dist));
    island.update(t);
    for (const isle of isles) {
      isle.group.position.set(isle.side * 22, 0, -(isle.z - dist));
      isle.group.rotation.y = -isle.side * Math.PI / 2;
      isle.island.update(t);
      isle.tag.material.opacity = 1;
    }
    // (the river's own sound under the music: louder in the rapids, quieter out on the lake)
    {
      const want = phase === 'done' ? 0.25 : phase === 'dive' ? 0.35 : 0.55 + rapK * 0.4;
      if (Math.abs(want - ambNow) > 0.04) {
        ambNow = want;
        audio.setAmbience?.(ambNow);
      }
    }
    if (raid) {
      stepBombs(dt);
      // the scope: on the tower where his thumb put it, with the board's sway on it (it drifts as he bobs and swings as
      // he carves: aim while you surf); the cannon points there (else at the tower coming up, else down the river)
      const tgt = targetIsle();
      let P = null;
      if (tgt && aiming) {
        lockT += dt;
        // (only the part of the tower on the screen: under the top bar, over the fire button)
        const [vLo, vHi] = visibleSpan(tgt);
        if (lockT === dt) aimV = vLo + (vHi - vLo) * 0.6;
        aimV = clamp(aimV, vLo, vHi);
        const su = Math.sin(t * 1.7) * 0.32 + Math.sin(t * 3.3 + 1) * 0.1 + leanV * 1.4;
        const sv = Math.sin(t * 2.2 + 0.7) * 0.28 + rapK * Math.sin(t * 9) * 0.35;
        aimU = floorMidU(tgt, aimV) + su;
        aimVv = aimV + sv;
        P = towerPoint(tgt, aimU, aimVv);
        onTarget = floorAt(tgt.floors, aimU, aimVv) >= 0;
        const s0 = P.clone().project(camera);
        const s1 = towerPoint(tgt, aimU, aimVv + 1).project(camera);
        const W = host.clientWidth;
        const Hh = host.clientHeight;
        aimPerPx = 1 / Math.max(3, Math.abs(s1.y - s0.y) * 0.5 * Hh);
        scopeEl.style.transform = `translate(${((s0.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-s0.y * 0.5 + 0.5) * Hh).toFixed(1)}px)`;
        scopeEl.classList.add('on');
        scopeEl.classList.toggle('lock', lockT > 0.12);
        scopeEl.classList.toggle('miss', !onTarget);
        scopeRng.textContent = `${Math.round(tgt.z - dist)} m`;
      } else {
        scopeEl.classList.remove('on', 'lock');
      }
      fireEl.classList.toggle('show', phase === 'run');
      fireEl.classList.toggle('off', !aiming);
      fireEl.classList.toggle('pulse', aiming && !thrown);
      if (tgt && !P) P = towerPoint(tgt, 0, Math.max(2, Math.min(18, (tgt.island.top - 3.6) * 0.5)));
      rider.aim(P ? P.clone().sub(rider.muzzle(_aimFrom)) : _ahead);
    }
    // (your tower stays upstream: behind the camera once you ride)
    start.group.position.set(0, -0.6, dist + START_Z);
    barEl.style.width = `${clamp(dist / (len - RIVER.finishRun), 0, 1) * 100}%`;
    world.update(dist, t, phase === 'dive' ? null : x);
    // (the shadows follow the action: your tower while you dive, the river just ahead while you ride)
    if (phase === 'dive') world.setShadowFocus(0, START_Z * 0.5, 46);
    else world.setShadowFocus(x * 0.6, raid ? -40 : -24, raid ? 60 : 40);
    things.updateSpray(dt);
    cameraFor(dt);
  }
  // (tests: ?zoo=1, the animals side by side in front of a still camera)
  if (d.zoo) {
    phase = 'zoo';
    rider.group.visible = false;
    start.group.visible = false;
    const kinds = [['croc', -3.4], ['hippo', 0], ['monkey', 3.4]];
    for (const [k, lx] of kinds) {
      const it = k === 'monkey' ? { kind: k, lane: 1, shape: 'crate', color: 3, scale: 1, drift: 0 } : { kind: k, lane: 1 };
      let obj;
      if (k === 'croc') obj = beasts.croc(1);
      else if (k === 'hippo') obj = beasts.hippo();
      else { const blk = things.floating({ ...it, skin: d.skin || 'kleur', spin: 0 }); obj = beasts.monkeyOn(blk, 1, blk.userData.top); }
      scene.add(obj);
      live.push({ it, row: { z: 12 }, obj, z: 12, x: lx, done: true, drift: 0, zooX: lx });
    }
  }
  if (raid) {
    start.group.visible = false;
    island.group.visible = false;
    setBombs();
    facesEl.innerHTML = '';
    audio.music?.(true, { bpm: 112, layers: 2, key: 5 });
  }
  function loop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) step(dt);
    world.reflect(stage.renderer, camera);
    stage.render(dt);
  }

  // ---------------------------------------------------------------------------------------------- the end
  const result = () => ({ rescued: [...rescued], missed: who.filter((id) => !rescued.includes(id)), hits, all: rescued.length === who.length && who.length > 0 });
  function done() {
    if (phase === 'done') return;
    phase = 'done';
    audio.music?.(false);
    if (raid) {
      audio.play(bombHits ? 'record' : 'banner');
      // what the bombs did, and the river's standings as they are now (the tallest is the one everyone aims at)
      const said = [bombLost > 0 ? S.rvRaidLost(fmtM(bombLost)) : '', bombCracked ? S.rvRaidCracked(bombCracked) : ''].filter(Boolean).join(' ');
      const stand = isles.map((i) => ({ i, h: Math.max(0, i.island.top - 3.6), name: R?.rows?.find((x) => x.id === i.crew)?.name || '' })).sort((a, b) => b.h - a.h);
      cardEl.innerHTML = `<h2>${thrown ? S.rvRaidTitle(bombHits, thrown) : S.rvRaidNoShot}</h2><p>${thrown ? said || S.rvRaidNone : S.rvRaidKept(bombsLeft)}</p>
        <ol class="rv-stand">${stand.map((s, k) => `<li class="${s.i.mine ? 'me' : ''}${k === 0 ? ' lead' : ''}"><span>${k === 0 ? '👑 ' : `${k + 1}. `}${esc(s.name)}${s.i.mine ? ` <i>(${S.twYou})</i>` : ''}</span><b>${fmtM(s.h)}</b></li>`).join('')}</ol>
        <button class="rv-go">${S.rvDone}</button>`;
      cardEl.classList.add('on');
      cardEl.querySelector('.rv-go').addEventListener('click', () => d.onDone?.({ thrown, hits: bombHits, lost: bombLost }));
      d.onResult?.({ thrown, hits: bombHits, lost: bombLost });
      return;
    }
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
  for (let i = 0; i < 30; i++) cameraFor(0.1);   // (the first frame already looks at the tower top)
  /** Every kind of thing the river brings, put out once out of sight so its shaders compile now (no stutter mid-ride). */
  function warmUp() {
    const tmp = new THREE.Group();
    const skin = d.skin || 'kleur';
    try {
      const blk = things.floating({ shape: 'cube', skin, color: 0, spin: 0 });
      const kinds = [beasts.croc(1), beasts.hippo(), things.rock(), things.person(who[0] || 'boer', 0), things.floating({ shape: 'plank', skin, color: 1 }), beasts.monkeyOn(blk, 1, blk.userData.top)];
      kinds.forEach((o, i) => { o.position.set(i * 3 - 8, 0, -30); tmp.add(o); });
      if (raid) {
        const jm = new THREE.Mesh(jetGeometry(new THREE.Vector3(0, 1, -5), new THREE.Vector3(0, 5, -40), 1), jetMat);
        tmp.add(jm);
        tmp.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex, transparent: true, depthWrite: false })));
      }
      scene.add(tmp);
      stage.renderer.compile(scene, camera);
    } catch (e) {
      console.warn?.('[rivier] warm-up', e?.message);
    }
    scene.remove(tmp);
    for (const o of tmp.children) {
      o.traverse((c) => { if (c.isSprite) c.material.dispose(); });
      if (o.isMesh && o.material === jetMat) o.geometry.dispose();
      else disposeTree(o);
    }
  }
  const ready = (async () => {
    // a first frame before it shows (the shaders compile behind Stapel's page)
    warmUp();
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
    host.removeEventListener('pointercancel', onCancel);
    for (const l of live) despawn(l);
    live.length = 0;
    scene.remove(rider.group, riderFoam, island.group, start.group, things.spray);
    // (everything this ride made goes from the graphics chip; the models and block pieces stay for the next)
    const done = new Set();
    for (const isle of isles) {
      scene.remove(isle.group);
      isle.island.dispose();
      disposeTree(isle.group, done);
    }
    for (const f of flights) { scene.remove(f.mesh); disposeTree(f.mesh, done); }
    for (const b of debris) { scene.remove(b.g); disposeTree(b.g, done); }
    for (const root of [rider.group, start.group, island.group]) disposeTree(root, done);
    for (const fx of flashes) { scene.remove(fx.fl); fx.fl.material.dispose(); }
    burstTex.dispose();
    jetMat.dispose();
    if (raid) setBend(1);
    camera.fov = FOV0;
    camera.updateProjectionMatrix();
    audio.setAmbience?.(ambBefore);
    island.dispose();
    beasts.dispose();
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
    state: () => ({ phase, dist: Math.round(dist * 10) / 10, len, lane, x: Math.round(x * 1000) / 1000, rescued: [...rescued], hits, who: [...who], live: live.length, paused, raid, bombsLeft, thrown, bombHits, bombLost: Math.round(bombLost * 10) / 10, aiming, aimV: Math.round(aimV * 100) / 100, onTarget, isles: isles.map((i) => ({ crew: i.crew, target: i.target, h: Math.round((i.island.top - 3.6) * 10) / 10, z: i.z })) }),
    autopilot(on) { pilotOn = !!on; },
    /** For tests (Saturday): where on screen (host px) the tallest tower stands at a share of its height, or null. */
    towerScreen(frac = 0.5) {
      const isle = targetIsle();
      if (!isle) return null;
      const v3 = towerPoint(isle, 0, Math.max(2, isle.island.top - 3.6) * frac).project(camera);
      return { x: (v3.x * 0.5 + 0.5) * host.clientWidth, y: (-v3.y * 0.5 + 0.5) * host.clientHeight, ahead: isle.z - dist };
    },
    /** For tests: the ride jumps to course z (what's before it is gone; the dive is skipped). */
    jumpTo(z) {
      for (const l of live) despawn(l);
      live.length = 0;
      dist = Math.max(0, z);
      rowI = course.rows.findIndex((r) => r.z > dist);
      if (rowI < 0) rowI = course.rows.length;
      if (phase === 'dive') {
        phase = 'run';
        phaseT = 8;
        rider.group.position.set(x, 0, 0);
        rider.group.rotation.set(0, 0, 0);
        hint(null);
      }
    },
    /** For tests: where the course's rows and kinds are. */
    course: () => course,
    move,
    skip: finishNow,
    /** For tests: the 3D scene and camera. */
    get scene() { return scene; },
    get camera() { return camera; },
    get stage() { return stage; },
    /** For tests: what the graphics chip holds now ({ geometries, textures, programs }). */
    gpu: () => ({ ...stage.renderer.info.memory, programs: stage.renderer.info.programs?.length | 0 }),
  };
  return api;
}
void BANK;
