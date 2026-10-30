// (1.20) Afgly, the rescue ride (the owner, 24 Oct 2026: "The river can be part of a rescue mission for the men you lost
// on the towers", "it needs to a river with the blocks and you need to slide left and right to dodge them", the slide
// "needs to integrate with the blocks"). After the Daily your builder dives off the top of the tower into the river and
// surfs it down to your crew's island: swipe ⟵ ⟶ past Stapel's blocks floating down and the rocks, and
// scoop up the people who fell off your tower (and a few strays). Whoever you save moves into the crew's Weektoring.
// A knock never ends the ride: you stumble, and the last person you saved slips back into the water.
//
// Opened over Stapel's page like the 3D town was (main.js): one stage made the first time and kept, a ride built for each
// visit and taken down after. Course rules: js/core/rivier.js; the world: world.js; the rider: rider.js; things: things.js.
import * as THREE from '../../lib/three.module.min.js';
import { createStage, pickQuality } from '../kasteel/stage.js';
import { createPieces } from '../botsing/pieces.js';
import { buildRiverWorld, bendMaterial, setBend, bendX, BANK, puffTexture } from './world.js';
import { createRider } from './rider.js';
import { createThings, createIsland, createStartTower, labelSprite, disposeTree } from './things.js';
import { createBeasts } from './beasts.js';
import { createHazards, splatImage, LOG_TOP, PIE_SCALE } from './hazards.js';
import { loadModels } from './models.js';
import { RIVER, rescueCourse, raidCourse, speedAt, laneX, inRapids, rapidsWindow, PACE } from '../core/rivier.js';
import { floorAt, hit as hitFloor, dimsOf } from '../core/weektower.js';
import { weekOf, plusDays } from '../core/span.js';
import { portraitDataUrl, portraitsReady, CAST } from '../game/residents.js';
import { S, WEATHER_INFO } from '../core/strings.js';
import { fmtM, fmtInt } from '../core/format.js';
import { spanNewsLine } from '../ui/spannews.js';
import { audio, haptics } from '../audio.js';
import { STATE_HZ, COUNT_S, duelWinner } from './duel.js';

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
// (29 Oct 2026, the owner: "the loading screen is still taking too long") a ride's materials are let go only once the
// next ride has made its own: three.js keeps a compiled shader program while any material still uses it, so "Ride again"
// finds its ~70 programs ready instead of compiling them all again (most of its wait on a phone)
const retired = [];
// (29 Oct 2026, the owner: "it needs to be more upbeat") the ride's music: a bright major tune (the key had been asked
// as 2, which the band took as its lowest, E2: a bass too low for a phone to play, the tune muddy) with its bass and
// arpeggio from the start, the melody joining further down
const RIDE_MUSIC = Object.freeze({ bpm: 114, layers: 2, key: 62, mode: 'major', wx: null });
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
/* (29 Oct 2026, the owner: "if someone gets notifications it lags") the ride's pills without a blur of the river behind them: a
   blur over the 3D view is redone every frame (heavy on Android), the time a notification or a pop-up needs; a little
   darker instead */
#rivier .rv-count { display: flex; align-items: center; gap: 6px; padding: 6px 12px 6px 8px; border-radius: 999px; background: rgba(13,34,40,.74); border: 1px solid rgba(255,255,255,.28); font-weight: 900; font-size: 18px; }
#rivier .rv-count .rv-ring { width: 24px; height: 24px; border-radius: 50%; background: repeating-conic-gradient(#e2382c 0 45deg, #f6f2ea 45deg 90deg); -webkit-mask: radial-gradient(circle, transparent 38%, #000 40%); mask: radial-gradient(circle, transparent 38%, #000 40%); }
#rivier .rv-count b { font-size: 20px; }
#rivier .rv-count small { font-size: 13px; opacity: .8; font-weight: 800; }
#rivier .rv-count.bump { animation: rv-bump .32s ease-out; }
@keyframes rv-bump { 40% { transform: scale(1.18); } }
#rivier .rv-metres { flex: 1; display: flex; align-items: baseline; justify-content: center; gap: 3px; padding: 5px 12px; border-radius: 999px; background: rgba(13,34,40,.74); border: 1px solid rgba(255,255,255,.28); font-weight: 900; font-variant-numeric: tabular-nums; }
#rivier .rv-metres b { font-size: 20px; color: #fff3c4; }
#rivier .rv-metres small { font-size: 13px; opacity: .85; }
#rivier .rv-cn { display: flex; align-items: center; gap: 3px; padding: 5px 9px; border-radius: 999px; background: rgba(13,34,40,.74); border: 1px solid rgba(255,214,92,.45); font-weight: 900; color: #ffe08a; font-variant-numeric: tabular-nums; }
#rivier .rv-cn i.rv-coin-ic { width: 17px; height: 17px; border-radius: 50%; background: var(--coin-img) center / 100% 100% no-repeat; box-shadow: 0 1px 2px rgba(0,0,0,.35); }
#rivier .rv-cn b { font-size: 16px; min-width: 1ch; }
#rivier .rv-cn.bump { animation: rv-cn .3s ease-out; }
@keyframes rv-cn { 0% { transform: scale(1); } 40% { transform: scale(1.22); } 100% { transform: scale(1); } }
#rivier .rv-card p.rv-coinline { display: flex; align-items: center; justify-content: center; gap: 6px; margin: -4px 0 10px; font-size: 16px; font-weight: 900; color: #ffe08a; }
#rivier .rv-card p.rv-coinline i.rv-coin-ic { width: 20px; height: 20px; flex: none; border-radius: 50%; background: var(--coin-img) center / 100% 100% no-repeat; box-shadow: 0 1px 2px rgba(0,0,0,.35); }
#rivier .rv-hearts { display: flex; gap: 3px; padding: 6px 9px; border-radius: 999px; background: rgba(13,34,40,.62); border: 1px solid rgba(255,255,255,.28); }
#rivier .rv-hearts i { width: 18px; height: 16px; background: #ff4d5e; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 22'%3E%3Cpath d='M12 21.5 10.3 20C4.2 14.6.2 11 .2 6.6.2 3 3 .2 6.6.2c2 0 4 1 5.4 2.5C13.4 1.2 15.4.2 17.4.2 21 .2 23.8 3 23.8 6.6c0 4.4-4 8-10.1 13.4z'/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 22'%3E%3Cpath d='M12 21.5 10.3 20C4.2 14.6.2 11 .2 6.6.2 3 3 .2 6.6.2c2 0 4 1 5.4 2.5C13.4 1.2 15.4.2 17.4.2 21 .2 23.8 3 23.8 6.6c0 4.4-4 8-10.1 13.4z'/%3E%3C/svg%3E") center / contain no-repeat; transition: background .2s, transform .2s; }
#rivier .rv-hearts i.gone { background: rgba(255,255,255,.25); transform: scale(.85); }
#rivier .rv-hearts.hit { animation: rv-bump .32s ease-out; }
#rivier .rv-bar { flex: 1; height: 8px; border-radius: 6px; background: rgba(13,34,40,.45); overflow: hidden; border: 1px solid rgba(255,255,255,.22); }
#rivier .rv-bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #8fe3d3, #fff3c4); }
#rivier .rv-pause { pointer-events: auto; width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255,255,255,.35); background: rgba(13,34,40,.62); color: #fff; font-size: 18px; font-weight: 900; }
/* (29 Oct 2026, the owner's Samsung flip phone: the pause button pushed off the screen's edge, five things in one row
   wider than a narrow phone) the pills may give way, the pause button never; on a narrow phone they pack closer */
#rivier .rv-top > * { min-width: 0; }
#rivier .rv-top > .rv-pause { flex: none; }
/* (30 Oct 2026, the owner: "the graphics for this menu looks weak in comparison, also the icons on top") the top bar in the
   game's own finish: glossy deep-teal pills with a light rim, a sheen along the top and a little depth under them; the
   coins' pill rimmed in gold, the hearts glossy, the pause button a round 3D button (no blur: still light on a phone) */
#rivier .rv-metres, #rivier .rv-cn, #rivier .rv-hearts, #rivier .rv-count {
  background: linear-gradient(180deg, rgba(46,104,116,.94) 0%, rgba(17,56,68,.95) 52%, rgba(9,34,43,.97) 100%);
  border: 1.5px solid rgba(255,255,255,.5);
  box-shadow: 0 3px 0 rgba(3,16,21,.6), 0 6px 14px rgba(0,0,0,.28), inset 0 1.5px 0 rgba(255,255,255,.38);
}
#rivier .rv-cn { border-color: rgba(255,214,92,.85); }
#rivier .rv-metres b, #rivier .rv-cn b, #rivier .rv-count b { text-shadow: 0 2px 0 rgba(0,0,0,.4); }
#rivier .rv-cn i.rv-coin-ic { width: 20px; height: 20px; box-shadow: 0 1px 0 rgba(0,0,0,.4), 0 0 8px rgba(255,214,92,.55); }
#rivier .rv-hearts i { background: linear-gradient(180deg, #ff9aa4 0%, #ff4d5e 46%, #d4223a 100%); filter: drop-shadow(0 1.5px 0 rgba(0,0,0,.4)); }
#rivier .rv-hearts i.gone { background: rgba(255,255,255,.22); filter: none; }
#rivier .rv-pause {
  background: linear-gradient(180deg, #5fd0de 0%, #2c9db1 55%, #1f7f93 100%);
  border: 2px solid rgba(255,255,255,.75);
  box-shadow: 0 4px 0 #14566a, 0 7px 14px rgba(0,0,0,.3), inset 0 2px 0 rgba(255,255,255,.45);
  position: relative; font-size: 0; color: transparent; transition: transform .08s, box-shadow .08s;
}
/* (the two bars drawn, not a font's sign: on some phones it came out as a square) */
#rivier .rv-pause::before { content: ''; position: absolute; left: 50%; top: 50%; width: 14px; height: 16px; transform: translate(-50%, -50%); border-radius: 2px; background: linear-gradient(90deg, #fff 0 5px, transparent 5px 9px, #fff 9px 14px); filter: drop-shadow(0 1.5px 0 rgba(0,0,0,.35)); }
#rivier .rv-pause:active { transform: translateY(3px); box-shadow: 0 1px 0 #14566a, 0 3px 8px rgba(0,0,0,.3), inset 0 2px 0 rgba(255,255,255,.45); }
#rivier .rv-metres { white-space: nowrap; overflow: hidden; }
@media (max-width: 430px) {
  #rivier .rv-top { gap: 5px; left: 8px; right: 8px; }
  #rivier .rv-count { padding: 5px 9px 5px 6px; gap: 4px; }
  #rivier .rv-count .rv-ring { width: 20px; height: 20px; }
  #rivier .rv-count b, #rivier .rv-metres b { font-size: 17px; }
  #rivier .rv-metres { padding: 5px 8px; }
  #rivier .rv-cn { padding: 5px 7px; }
  #rivier .rv-cn b { font-size: 15px; }
  #rivier .rv-hearts { padding: 6px 7px; gap: 2px; }
  #rivier .rv-hearts i { width: 15px; height: 14px; }
  #rivier .rv-pause { width: 40px; height: 40px; }
}
@media (max-width: 345px) {
  #rivier .rv-top { gap: 4px; left: 6px; right: 6px; }
  #rivier .rv-count { padding: 4px 7px 4px 5px; gap: 3px; }
  #rivier .rv-count .rv-ring { width: 17px; height: 17px; }
  #rivier .rv-count b, #rivier .rv-metres b { font-size: 15px; }
  #rivier .rv-count small, #rivier .rv-metres small { font-size: 11px; }
  #rivier .rv-metres { padding: 4px 6px; }
  #rivier .rv-cn { padding: 4px 6px; }
  #rivier .rv-cn i.rv-coin-ic { width: 14px; height: 14px; }
  #rivier .rv-cn b { font-size: 13px; }
  #rivier .rv-hearts { padding: 5px 6px; }
  #rivier .rv-hearts i { width: 13px; height: 12px; }
  #rivier .rv-pause { width: 36px; height: 36px; }
}
#rivier .rv-faces { position: absolute; left: 12px; right: 12px; top: calc(62px + var(--sat, 0px)); display: flex; flex-wrap: wrap; gap: 4px; }
/* (eight faces on one line on any phone; more than eight wrap) */
#rivier .rv-faces img { width: min(30px, calc((100vw - 24px - 7 * 4px) / 8)); aspect-ratio: 1; height: auto; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,.35); }
/* (30 Oct 2026, the owner: "polish ... till it shines") the people still to rescue: a white ring and a dark seat behind each
   (they read as faces waiting, not as faded placeholders); one rescued lights up with a little pop */
#rivier .rv-faces img { box-sizing: border-box; border: 2px solid rgba(255,255,255,.92); background: rgba(13,34,40,.55); }
#rivier .rv-faces img.out { opacity: .6; filter: grayscale(1) brightness(.9); border-color: rgba(255,255,255,.4); }
#rivier .rv-faces img:not(.out) { animation: rv-face-pop .42s cubic-bezier(.3,1.6,.5,1); }
@keyframes rv-face-pop { 0% { transform: scale(.6); } 100% { transform: scale(1); } }
/* (and the picture itself framed a little, like a lens: the eye goes to the rider, the HUD reads on the darker edge) */
#rivier .rv-ov::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 85% 75% at 50% 56%, rgba(8,18,28,0) 60%, rgba(8,18,28,.32) 100%); }
#rivier .rv-hint { position: absolute; left: 50%; top: calc(104px + var(--sat, 0px)); transform: translateX(-50%); padding: 10px 18px; border-radius: 16px; background: rgba(13,34,40,.66); font-weight: 900; font-size: 18px; width: max-content; max-width: calc(100% - 32px); text-align: center; line-height: 1.25; text-wrap: balance; opacity: 0; transition: opacity .3s; }
#rivier .rv-hint.on { opacity: 1; }
#rivier .rv-pop { position: absolute; left: 50%; top: 34%; transform: translate(-50%, -50%) scale(.6); opacity: 0; font-size: 34px; font-weight: 900; color: #fff3c4; -webkit-text-stroke: 1.5px rgba(40,24,0,.75); text-shadow: 0 4px 0 rgba(40,24,0,.45), 0 8px 24px rgba(0,0,0,.4); width: max-content; max-width: 88%; text-align: center; line-height: 1.12; text-wrap: balance; transition: opacity .25s, transform .35s cubic-bezier(.2,1.4,.4,1); }
#rivier .rv-pop.long { font-size: 26px; }
#rivier .rv-pop.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#rivier .rv-pop.low { top: 47%; }
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
#rivier .rv-vs { position: absolute; left: 50%; top: calc(64px + var(--sat, 0px)); transform: translateX(-50%); display: none; align-items: baseline; gap: 5px; padding: 4px 12px; border-radius: 999px; background: rgba(20,60,120,.8); border: 1px solid rgba(140,200,255,.55); color: #e6f2ff; font-weight: 900; font-size: 14px; white-space: nowrap; font-variant-numeric: tabular-nums; }
#rivier .rv-vs.on { display: flex; }
#rivier .rv-vs b { font-size: 16px; color: #fff; }
#rivier .rv-vs b.rv-vs-h { font-size: 14px; letter-spacing: 1px; }
#rivier .rv-vs i { font-style: normal; font-size: 13px; padding: 1px 7px; border-radius: 999px; }
#rivier .rv-vs i.ahead { background: rgba(60,200,110,.35); color: #b9ffcf; }
#rivier .rv-vs i.behind { background: rgba(230,70,60,.35); color: #ffd0cb; }
#rivier .rv-ftag { position: absolute; left: 0; top: 0; display: none; transform: translate(-50%, -100%); padding: 3px 10px; border-radius: 999px; background: rgba(25,90,190,.85); border: 2px solid #8fd0ff; color: #fff; font-weight: 900; font-size: 14px; white-space: nowrap; pointer-events: none; box-shadow: 0 3px 10px rgba(0,0,0,.3); }
#rivier .rv-ftag.on { display: block; }
#rivier .rv-ftag.low { top: auto !important; bottom: calc(18px + var(--sab, 0px)); transform: translate(-50%, 0); }
#rivier .rv-go3 { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); font-size: 110px; font-weight: 900; color: #fff3c4; text-shadow: 0 6px 0 rgba(40,24,0,.5), 0 0 30px rgba(0,0,0,.35); pointer-events: none; display: none; }
#rivier .rv-go3.on { display: block; animation: rv-go3 .9s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes rv-go3 { 0% { transform: translate(-50%, -50%) scale(.3); opacity: 0; } 25% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; } 45% { transform: translate(-50%, -50%) scale(1); } 100% { transform: translate(-50%, -50%) scale(1); opacity: .9; } }
#rivier .rv-card h2.rv-win { margin: 2px 0 6px; color: #ffd65c; }
#rivier .rv-card p.rv-vsline { margin: 2px 0 10px; font-size: 17px; font-weight: 900; color: #bfe0ff; }
#rivier .rv-hurt { position: absolute; inset: 0; background: radial-gradient(ellipse 72% 62% at 50% 50%, rgba(200,40,30,0) 55%, rgba(200,40,30,.5) 100%); opacity: 0; transition: opacity .25s; pointer-events: none; }
#rivier .rv-hurt.on { opacity: 1; transition: none; }
#rivier .rv-flycoin { position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; pointer-events: none; background: var(--coin-img) center / 100% 100% no-repeat; box-shadow: 0 0 12px rgba(255,210,80,.8); transition: transform .5s cubic-bezier(.5,0,.75,.4), opacity .5s; }
#rivier .rv-flycoin.big { width: 40px; height: 40px; margin: -20px 0 0 -20px; }
#rivier .rv-flycoin.gem { border-radius: 6px; transform: rotate(45deg); background: linear-gradient(135deg, #e8fdff, #7fe6ff 45%, #2aa9c8); box-shadow: 0 0 16px rgba(120,230,255,.9); }
#rivier .rv-fly { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; transition: transform .55s cubic-bezier(.4,0,.6,1), opacity .55s; }
#rivier .rv-card { pointer-events: auto; position: absolute; left: 50%; bottom: calc(20px + var(--sab, 0px)); transform: translate(-50%, 30px); opacity: 0; width: min(92%, 420px); padding: 18px 18px 16px; border-radius: 22px;
  background: rgba(16,30,36,.84); border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 18px 50px rgba(0,0,0,.45); transition: opacity .35s, transform .45s cubic-bezier(.2,1.2,.4,1); text-align: center; }
#rivier .rv-card.on { opacity: 1; transform: translate(-50%, 0); }
#rivier .rv-card h2 { margin: 0 0 4px; font-size: 24px; font-weight: 900; }
#rivier .rv-card .rv-link { background: none; color: #8ff4ff; min-height: 40px; font-size: 16px; text-decoration: underline; text-underline-offset: 3px; }
#rivier .rv-splat { position: absolute; pointer-events: none; transform-origin: 50% 40%; transform: rotate(var(--r, 0deg)) scale(1.2, .86); opacity: 1; animation: rv-splat 2.9s cubic-bezier(.25,.9,.35,1) forwards; }
@keyframes rv-splat { 0% { transform: rotate(var(--r)) scale(1.2, .86); opacity: 1; } 5% { transform: rotate(var(--r)) scale(.95, 1.05); } 10% { transform: rotate(var(--r)) scale(1.02, .99); } 15% { transform: rotate(var(--r)) scale(1); } 45% { transform: rotate(var(--r)) translateY(4%) scale(1, 1.02); opacity: 1; } 100% { transform: rotate(var(--r)) translateY(34%) scale(.98, 1.1); opacity: 0; } }
#rivier .rv-arrow { position: absolute; left: 50%; top: 46%; width: 92px; height: 92px; margin: -46px 0 0 -46px; border-radius: 50%; background: rgba(13,34,40,.6); border: 3px solid #fff3c4; display: none; pointer-events: none; }
#rivier .rv-arrow.on { display: block; }
#rivier .rv-arrow::after { content: ''; position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -10px 0 0 -15px; border-left: 8px solid #fff3c4; border-top: 8px solid #fff3c4; transform: rotate(45deg); }
#rivier .rv-arrow.up::after { animation: rv-up .9s ease-in-out infinite; }
#rivier .rv-arrow.down::after { margin-top: -22px; transform: rotate(225deg); animation: rv-down .9s ease-in-out infinite; }
@keyframes rv-up { 0%, 100% { translate: 0 6px; } 50% { translate: 0 -10px; } }
@keyframes rv-down { 0%, 100% { translate: 0 -6px; } 50% { translate: 0 10px; } }
#rivier .rv-card p.rv-rank { display: none; margin: -4px 0 10px; font-size: 15px; font-weight: 900; color: #ffe08a; }
#rivier .rv-card p.rv-rank.on { display: block; }
#rivier .rv-card .rv-ranklist { display: inline; width: auto; min-height: 0; margin: 0 0 0 6px; padding: 3px 10px; border-radius: 999px; background: rgba(255,224,138,.16); color: #ffe08a; font-size: 13px; }
#rivier .rv-board { pointer-events: auto; position: absolute; inset: 0; display: none; place-items: center; background: rgba(8,20,24,.6); z-index: 5; }
#rivier .rv-board.on { display: grid; }
#rivier .rv-board > div { width: min(88%, 380px); max-height: 80%; overflow: auto; padding: 18px; border-radius: 22px; background: rgba(16,30,36,.94); border: 1px solid rgba(255,255,255,.2); box-shadow: 0 18px 50px rgba(0,0,0,.45); text-align: center; }
#rivier .rv-board h3 { margin: 0 0 10px; font-size: 20px; font-weight: 900; color: #fff3c4; }
#rivier .rv-board ol { list-style: none; margin: 0 0 8px; padding: 0; text-align: left; font-size: 15px; }
#rivier .rv-board li { display: flex; justify-content: space-between; gap: 10px; padding: 6px 10px; border-radius: 10px; }
#rivier .rv-board li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#rivier .rv-board li.me { background: rgba(143,244,255,.14); }
#rivier .rv-board li.gap { margin-top: 6px; border-top: 1px dashed rgba(255,255,255,.25); }
#rivier .rv-board li b { color: #fff3c4; font-variant-numeric: tabular-nums; }
#rivier .rv-board .rv-board-n, #rivier .rv-board .rv-board-wait { margin: 0 0 12px; font-size: 13px; color: #bfe3e8; }
#rivier .rv-board button { display: block; width: 100%; min-height: 46px; border-radius: 14px; border: 0; font: inherit; font-weight: 900; font-size: 17px; background: rgba(255,255,255,.14); color: #fff; cursor: pointer; }
#rivier .rv-card p.rv-shots { margin: -4px 0 12px; font-size: 15px; font-weight: 900; color: #8ff4ff; }
#rivier .rv-card .rv-dist { display: flex; align-items: baseline; justify-content: center; gap: 4px; margin: 0; line-height: 1; }
#rivier .rv-card .rv-dist b { font-size: 46px; font-weight: 900; color: #fff3c4; text-shadow: 0 3px 0 rgba(40,24,0,.45); font-variant-numeric: tabular-nums; }
#rivier .rv-card .rv-dist small { font-size: 20px; font-weight: 900; color: #fff3c4; opacity: .9; }
#rivier .rv-card p.rv-distline { margin: 2px 0 10px; font-size: 14px; color: #bfe3e8; }
#rivier .rv-card p { margin: 0 0 12px; font-size: 15px; color: #d9ecf0; }
#rivier .rv-card .rv-row { display: flex; justify-content: center; flex-wrap: nowrap; gap: 4px; margin: 0 0 14px; }
#rivier .rv-card .rv-row img { flex: 0 1 34px; min-width: 0; width: 34px; height: auto; aspect-ratio: 1; border-radius: 50%; }
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
#rivier .rv-paused .rv-off, #rivier .rv-paused .rv-redo { background: rgba(255,255,255,.14); color: #fff; }
/* (30 Oct 2026, the owner: "the graphics for this menu looks weak") the pause card in the game's finish: a glossy teal
   card with a rim and depth, a cream title, and chunky 3D buttons that press in, each with its sign */
#rivier .rv-paused { background: radial-gradient(ellipse at 50% 42%, rgba(6,26,34,.38), rgba(3,12,16,.8)); }
#rivier .rv-paused div {
  width: min(84%, 340px); padding: 22px 20px 22px; border-radius: 28px;
  background: linear-gradient(180deg, #2f7a88 0%, #175061 40%, #0c3341 100%);
  border: 2px solid rgba(255,255,255,.55);
  box-shadow: 0 8px 0 rgba(3,18,24,.8), 0 20px 44px rgba(0,0,0,.5), inset 0 2px 0 rgba(255,255,255,.32);
}
#rivier .rv-paused h2 { margin: 0 0 16px; font-size: 34px; font-weight: 900; letter-spacing: .02em; color: #fff3c4; text-shadow: 0 3px 0 rgba(0,0,0,.38); }
#rivier .rv-paused button {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 58px; margin-top: 14px; border-radius: 18px; font-size: 20px; letter-spacing: .01em;
  border: 2px solid rgba(255,255,255,.5); transition: transform .08s, box-shadow .08s;
}
#rivier .rv-paused button::before { font-size: 17px; line-height: 1; }
#rivier .rv-paused .rv-on {
  background: linear-gradient(180deg, #ffe58c 0%, #ffcf3f 55%, #f0ae1a 100%); color: #4a2a00; border-color: #fff4c8;
  box-shadow: 0 5px 0 #a96f00, 0 9px 16px rgba(0,0,0,.32), inset 0 2px 0 rgba(255,255,255,.65);
}
#rivier .rv-paused .rv-on::before { content: '▶'; }
#rivier .rv-paused .rv-redo {
  background: linear-gradient(180deg, #5fd0de 0%, #2c9db1 55%, #1f7f93 100%); color: #fff; text-shadow: 0 2px 0 rgba(0,0,0,.28);
  box-shadow: 0 5px 0 #14566a, 0 9px 16px rgba(0,0,0,.32), inset 0 2px 0 rgba(255,255,255,.45);
}
#rivier .rv-paused .rv-redo::before { content: '↻'; font-size: 22px; }
#rivier .rv-paused .rv-off {
  background: linear-gradient(180deg, #6e7f88 0%, #4a5b64 55%, #3a4950 100%); color: #fff; text-shadow: 0 2px 0 rgba(0,0,0,.3);
  box-shadow: 0 5px 0 #242f35, 0 9px 16px rgba(0,0,0,.32), inset 0 2px 0 rgba(255,255,255,.3);
}
#rivier .rv-paused .rv-off::before { content: '✕'; }
#rivier .rv-paused button:active { transform: translateY(4px); box-shadow: 0 1px 0 rgba(0,0,0,.45), 0 4px 8px rgba(0,0,0,.3); }
/* (29 Oct 2026) water on the lens after a waterfall: clear drops with bright rims, scattered by hand and running down,
   a wash from above (a repeating grid of white dots read as a polka-dot pattern, not water) */
#rivier .rv-spray { position: absolute; inset: 0; pointer-events: none; opacity: 0; background:
  radial-gradient(4px 7px at 14% 22%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(6px 10px at 31% 9%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(3px 5px at 52% 16%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(5px 9px at 71% 7%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(4px 8px at 88% 19%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(5px 9px at 9% 46%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(3px 6px at 26% 61%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(7px 12px at 43% 38%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(4px 7px at 62% 52%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(6px 11px at 83% 41%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(3px 5px at 93% 66%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(6px 10px at 18% 79%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(4px 7px at 39% 88%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(5px 9px at 58% 74%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(4px 8px at 76% 86%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(3px 5px at 48% 63%, rgba(235,247,255,.2) 0 48%, rgba(250,253,255,.78) 72%, transparent),
  radial-gradient(130% 75% at 50% -12%, rgba(240,250,255,.62), rgba(215,238,250,.2) 58%, transparent 82%); }
#rivier .rv-spray.on { animation: rv-spray 1.3s ease-out; }
@keyframes rv-spray { 0% { opacity: 1; transform: translateY(-4px); } 100% { opacity: 0; transform: translateY(22px); } }
@keyframes rv-spray-still { 0% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { #rivier .rv-count.bump { animation: none; } #rivier .rv-faces img { animation: none; } #rivier .rv-spray.on { animation: rv-spray-still .45s ease-out; } }`;
    document.head.appendChild(st);
  }
  (document.getElementById('game') || document.body).appendChild(host);
  const quality = pickQuality();
  if (quality.name === 'mid' && !quality.forced) Object.assign(quality, { dpr: 1.35 });
  // (29 Oct 2026, the owner's Samsung A53: "it blurs": a slow phone went down to 0.85 of a pixel, blocky; the River keeps
  // at least 1:1 and lets its shadows go first, world.js)
  const stage = createStage({ fov: 58, quality, canvas, stageEl: host, minDpr: 1 });
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
  const models = await loadModels(['croc', 'hippo', 'monkey', 'builder', 'dorp', 'island', 'props', 'hazards']);
  performance.mark?.('rv:models');
  if (!kit) kit = makeKit();
  const view = createRide(kit, { ...d, models });
  performance.mark?.('rv:built');
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
  // (the sky of his background skin; no river mist round the island; the island alone in a wide lake, water all round,
  // buttes on the far horizon: the camera goes right round it. Nothing bends here.)
  setBend(0);
  const world = buildRiverWorld(stage, d.scene, { air: false, town: true });
  world.setPool(1e6);   // (all lake: the canyon is far off)
  const things = createThings(scene, pieces);
  things.tint(world.fxTint);
  things.stoneMat = world.stoneMat;
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
  let fw = won ? createFireworks(scene, reduced, world.night) : null;
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
    // (the endless river: the crew's metres down it this week, each builder's too, furthest first)
    const rideTot = crew ? crew.rideM | 0 : v.rideMetres | 0;
    const rideRank = crew && crew.members.length > 1 ? [...crew.members].map((m) => ({ name: m.name || '?', m: (crew.rideBy || {})[m.id] | 0 })).sort((a, b) => b.m - a.m) : [];
    const rideLine = rideTot > 0 ? `<p class="tw-ridem">${S.twRideM(fmtInt(rideTot))}${rideRank.length ? `<span>${rideRank.map((x, k) => `${k === 0 && x.m ? '🥇 ' : ''}${esc(x.name)} ${fmtInt(x.m)}`).join(' · ')}</span>` : ''}</p>` : '';
    const renameForm = renaming ? `<form class="tw-rename-form"><input class="tw-name" maxlength="18" value="${esc(crew?.name || '')}" aria-label="${S.twRename}"><button type="submit" class="tw-save">${S.twRenameSave}</button><button type="button" class="tw-cancel">${S.twCancel}</button></form>` : '';
    const btns = [];
    // (the river at all times: today's ride brings your people; after that it's a free ride for metres)
    btns.push(`<button class="tw-ride">${v.rideToday ? S.rvResGo : S.rvAgain}</button>`);
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
        ${rideLine}${members}${news ? `<ul class="tw-news">${news}</ul>` : ''}
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
#rivier .tw-ridem { margin: 2px 0 6px; font-size: 14px; font-weight: 900; color: #fff3c4; }
#rivier .tw-ridem span { display: block; margin-top: 2px; font-size: 12px; font-weight: 800; color: #bfe3e8; }
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
    // (never further than 250 m: the lake's far shore is at 360 m)
    const D = Math.min(250, Math.max(46, (h / room.f) / (2 * half)));
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
    setBend(1);
    scene.remove(island.group, things.spray);
    disposeTree(island.group);
    island.dispose();
    things.dispose();
    world.dispose();
    // (the block looks this screen painted: the most recent stay for the next, the rest go off the graphics chip)
    pieces.trim?.(24);
    ov.innerHTML = '';
    host.style.display = 'none';
    if (current === api) current = null;
  }
  const api = {
    ready, close, fit: place, state: () => ({ phase: 'town', h: Math.max(16, island.top, island.plotTop) + 6, rescued: [] }),
    gpu: () => ({ ...stage.renderer.info.memory, programs: stage.renderer.info.programs?.length | 0 }),
    /** The server's newer answer: the panel again, the tower as it stands now. */
    refresh(v) {
      if (!alive) return;
      paint({ ...d, ...v });
      island.setFloors(v.floors || []);
      island.setPlots({ towers: v.plots || d.plots || [], monuments: v.monuments || [] });
      won = wonOf({ ...d, ...v });
      if (won && !fw) fw = createFireworks(scene, reduced, world.night);
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
function createFireworks(scene, reduced, night = true) {
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
  // (glowing light at night; by day, solid colour that reads against a bright sky)
  const mat = new THREE.PointsMaterial({ size: night ? 2.6 : 3.4, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: night ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
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
    /** `at`: the middle of the island they go up round (the town's is at the origin). */
    update(dt, top, at = null) {
      wait -= dt;
      if (wait <= 0) {
        wait = 0.8 + Math.random() * 0.9;
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 14;
        const h = Math.max(24, top);
        shells.push({ x: (at?.x || 0) + Math.sin(a) * r, z: (at?.z || 0) + Math.cos(a) * r, y: 4, vy: 30 + Math.random() * 8, at: h * (0.45 + Math.random() * 0.4) });
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
        else if (life[i] < 0.5 && night) { col[i * 3] *= 0.95; col[i * 3 + 1] *= 0.95; col[i * 3 + 2] *= 0.95; }   // (by day a fading spark would go dark: it just ends)
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
  things.stoneMat = world.stoneMat;
  things.models = d.models || {};   // (the Blender models, for the island's town)
  const rider = createRider(bendMaterial, d.models?.builder || null);
  scene.add(rider.group);
  // (the board's own foam and shadow on the water, under him)
  const riderFoam = things.foam(2.6, { hull: true });
  riderFoam.scale.set(1.9, 1, 3.6);
  scene.add(riderFoam);
  // the lanes' edges (the owner, 25 Oct 2026: "Its just for the outter lines, where the lanes end, not for every lane ...
  // also not inbetween the canyons just if you exit a canyon"): floating pipes along both sides where the river opens
  // out (the pool at its head, the lake by your island), where the canyon walls no longer show where it ends ('pipes',
  // the default); 'foam' = white-water seams between and beside the lanes everywhere (1.21.0); 'none'
  const marks = d.laneMarks || 'pipes';
  world.setLanes(RIVER.laneW / 2, RIVER.laneW * 1.5, marks === 'foam' ? 1 : 0);
  const PIPE = { len: 5.6, every: 6, r: 0.22, x: RIVER.laneW * 1.5 + 0.45, n: 40 };
  let pipes = null;
  if (marks === 'pipes') {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#ff7a1a';
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = '#fbfbf5';
    for (let k = 0; k < 4; k++) g.fillRect(0, k * 64 + 40, 64, 18);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.CylinderGeometry(PIPE.r, PIPE.r, PIPE.len, 14, 1);
    geo.rotateX(Math.PI / 2);
    pipes = new THREE.InstancedMesh(geo, bendMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.05 })), PIPE.n * 2);
    pipes.frustumCulled = false;
    pipes.castShadow = true;
    scene.add(pipes);
  }
  const _pm = new THREE.Matrix4();
  const _pe = new THREE.Euler();
  const _hide = new THREE.Matrix4().makeScale(0, 0, 0);
  // (29 Oct 2026, the owner's pick, "wide by the walls, then closer": the noodles come out of a canyon's end floating wide,
  // by its walls, for its last ~75 m, and close in to the lanes as it opens out; across the open water at the lanes; none
  // inside a canyon's start, they stop where its walls close in. Before, they reached 75 m into both ends.)
  const PIPE_WIDE = 6.8;   // m out: by a canyon's walls (their foot stands 7.65 m out or more)
  const HEAD_POOL = 80;    // m: the pool round your tower and the first canyon's mouth (setPool(18): the canyon from ~57 m)
  const narrowAt = (z) => world.halfAt(z) <= BANK.half + 0.5;
  /** How far out the pipes float at course metre z (m), or 0 where there are none. */
  function pipeX(z) {
    if (narrowAt(z)) return [10, 30, 50, 70, 85].some((dz) => !narrowAt(z + dz)) ? PIPE_WIDE : 0;
    const h = world.halfAt(z);
    // (30 Oct 2026, the owner, at the river's head: "the pool noodles needs to flare out") from your tower to the first
    // canyon's mouth they open out like a trumpet: 10.5 m out across the pool, curving in to its walls at the mouth
    if (z < HEAD_POOL) return clamp(PIPE_WIDE + (h - BANK.half) * 0.18, PIPE_WIDE, 10.5);
    if (Math.abs(world.halfAt(z + 3) - world.halfAt(z - 3)) < 0.05) return PIPE.x;   // open water: at the lanes
    // a canyon opening out, and (30 Oct 2026, the owner: "the pool noodles needs to flare out") one closing in: they
    // follow its walls, wide by them where it's narrow and in at the lanes where it's open, so at a canyon's mouth they
    // flare out to meet its walls instead of running on into the water and stopping
    return PIPE_WIDE + (PIPE.x - PIPE_WIDE) * Math.min(1, (h - BANK.half) / (BANK.lake - BANK.half));
  }
  /**
   * The pipes float along both sides, riding on the swell, joint to joint (in course metres: they pass at the river's
   * pace) — on open water and out of the canyons' ends; a gap where something drifts in from that side (a monkey's
   * block comes through it).
   */
  function stepPipes() {
    const first = Math.floor((dist - 30) / PIPE.every);
    const gaps = [];
    for (const l of live) {
      if (!l.drift || l.done) continue;
      const from = laneX(l.it.lane) + l.drift * RIVER.laneW;
      if (Math.abs(from) > PIPE.x - 0.6) gaps.push({ z: l.z, side: Math.sign(from) });
    }
    for (let j = 0; j < PIPE.n; j++) {
      const zc = (first + j) * PIPE.every + PIPE.every / 2;
      const px = pipeX(zc);
      // (a piece lies along the line where it closes in: from where its neighbours float, either end)
      const pa = px && pipeX(zc - 3);
      const pb = px && pipeX(zc + 3);
      const yaw = pa && pb ? Math.atan2(pa - pb, 6) : 0;
      for (let sd = 0; sd < 2; sd++) {
        const side = sd ? 1 : -1;
        if (!px || gaps.some((g) => g.side === side && Math.abs(g.z - zc) < PIPE.every / 2 + 1.6)) {
          pipes.setMatrixAt(j * 2 + sd, _hide);
          continue;
        }
        const bob = Math.sin(t * 1.6 + zc * 0.7 + sd * 2) * 0.03;
        _pm.makeRotationFromEuler(_pe.set(0, side * yaw, Math.sin(t * 1.1 + zc) * 0.05, 'YXZ'));
        _pm.setPosition(side * px, 0.07 + bob, -(zc - dist));
        pipes.setMatrixAt(j * 2 + sd, _pm);
      }
    }
    pipes.instanceMatrix.needsUpdate = true;
  }
  // a night: the lamp on his hard hat, a warm beam down the river (what comes at you is lit, and the water under it), and
  // its glow round his head
  const lamp = world.night ? new THREE.SpotLight('#ffdcaa', 30, 70, 0.62, 0.55, 1) : null;
  const lampCol = new THREE.Color('#ffe2b8').multiplyScalar(0.75);
  const lampDir = new THREE.Vector3();
  let lampGlow = null;
  if (lamp) {
    scene.add(lamp, lamp.target);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,215,1)');
    gr.addColorStop(0.25, 'rgba(255,214,150,.55)');
    gr.addColorStop(1, 'rgba(255,200,130,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    lampGlow.scale.setScalar(0.85);
    scene.add(lampGlow);
  }
  const beasts = createBeasts(bendMaterial, d.models || {});
  // the tower you just built stands at the river's head: you dive off its top (none: a jump from a rock)
  const start = createStartTower(things, d.daily || [], d.skin || 'kleur');
  scene.add(start.group);
  const diveTop = Math.max(6, start.top);
  const raid = d.mode === 'raid';
  const R = d.river || null;
  if (raid) setBend(0);   // (a straight river: a bomb's aim lands where the tower is drawn)
  const who = (d.who || []).filter((id) => CAST[id]).slice(0, 24);
  // (the dive off the tower is the day's rescue ride, after the people who fell; a ride with no one to rescue (Afgly
  // from the menu, Gly weer) drops you straight onto the water behind him: a quick go again)
  const quick = !raid && (!!d.extra || who.length === 0);
  const DIVE = quick ? 0.5 : clamp(1.3 + diveTop / 70, 1.5, 2.6);
  // (Saturday: the other crews' islands first, the tallest tower last, the run's big moment)
  const crewIds = (R?.rows || []).map((x) => x.id);
  const isleOrder = [...crewIds.filter((id) => id !== R?.leader), ...crewIds.filter((id) => id === R?.leader)];
  // (the rescue ride never ends: it runs till your third knock; Saturday's run is the fixed course past the islands)
  const course = raid ? raidCourse(String(d.seed || 'aanval'), isleOrder, []) : rescueCourse(String(d.seed || 'rivier'), who, { endless: true });
  const endless = !!course.endless;
  const len = course.len;
  // the lake with your island and its Weektoring beside the river (Saturday: open water all the way, the islands in it)
  if (raid) world.setPool(1e6);
  else {
    world.setLake(course.lake.from, course.lake.to);
    world.setPool(18);   // (open water round your tower at the river's head, the canyon from ~40 m)
  }
  const island = createIsland(things, { radius: endless ? 18 : 22 });
  scene.add(island.group);
  island.setFloors(d.floors || []);
  const islandZ = endless ? course.island.z : len + 34;   // (course z of the island's middle)
  const islandX = endless ? course.island.side * 27 : 0;
  if (endless) island.group.rotation.y = -course.island.side * Math.PI / 2;   // (its jetty to the river)
  let hearts = RIVER.hearts;
  // (the endless river's later things: a jump over a log, a duck under a fallen tree, Hanswors's pies)
  const hz = createHazards(bendMaterial, d.models || {});
  hz.tint?.(world.fxTint);
  // (the elephants come from 10 km: their model is fetched on the way, from 8 km, and its shaders made ready at once)
  let eleAsked = false;
  function askElephant() {
    if (eleAsked || !endless) return;
    eleAsked = true;
    loadModels(['elephant']).then((m) => {
      if (!alive || !m?.elephant) return;
      if (d.models) d.models.elephant = m.elephant;
      const tmp = beasts.elephant({ from: 1 });
      tmp.position.set(0, -40, -60);
      scene.add(tmp);
      (stage.renderer.compileAsync ? stage.renderer.compileAsync(scene, camera) : Promise.resolve(stage.renderer.compile(scene, camera))).catch(() => {}).finally(() => {
        scene.remove(tmp);
      });
    }).catch(() => {});
  }
  const JUMP_S = 0.62;   // s in the air...
  const JUMP_H = 1.45;   // ...this high at the top
  const DUCK_S = 0.8;    // s ducked
  let jumpT = -1;        // (s into a jump; -1 on the water)
  let jumpQ = -9;        // (a jump asked for just before landing: it goes as he lands)
  let duckT = -1;
  let airY = 0;
  let duckK = 0;
  let timeK = 1;         // (a lesson slows the river right down until you do what it shows)
  let lesson = null;     // { kind, l }
  const taught = (() => { try { return JSON.parse(localStorage.getItem('stapel.v1.rvTaught') || '{}') || {}; } catch { return {}; } })();
  const teachDone = (k) => { taught[k] = 1; try { localStorage.setItem('stapel.v1.rvTaught', JSON.stringify(taught)); } catch { /* private window */ } };
  const pies = [];       // pies in the air: { mesh, shadow, from, to, t, dur, lane }
  let kmSaid = 0;
  const pieShadowGeo = new THREE.CircleGeometry(0.9, 24);
  pieShadowGeo.rotateX(-Math.PI / 2);
  // (soft: a shade on the water with a darker ring where the pie will land, not a hole in it)
  const pieShadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.75)');
    gr.addColorStop(0.62, 'rgba(255,255,255,.6)');
    gr.addColorStop(0.8, 'rgba(255,255,255,.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const pieShadowMat = new THREE.MeshBasicMaterial({ color: '#0b1d22', map: pieShadowTex, transparent: true, opacity: 0, depthWrite: false });
  const musicNow = { bpm: 0, layers: 0 };
  let runS = 0;   // (the seconds riding: the server checks no ride is faster than the river)
  let islandSaid = false;

  let alive = true;
  let raf = 0;
  let last = performance.now();
  let t = 0;
  let dist = 0;
  // (Saam gly: the count first, side by side: the room's maker on the left, the friend on the right)
  const duel = d.duel || null;
  let phase = raid ? 'run' : duel ? 'count' : 'dive';   // (count →) dive → run → finish → done
  let phaseT = 0;
  let paused = false;
  let lane = duel ? (duel.host ? 0 : 2) : 1;
  let x = laneX(lane);
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
  let monkeySaidAt = -1e9;
  function cues(l, ahead) {
    const k = l.it.kind;
    if (k === 'monkey' && !l.said && ahead < 30) {
      l.said = true;
      // (Blouaap's chatter: the first of a ride, then now and then, softer; not for every block he paddles: the owner,
      // 25 Oct 2026, "the monkey sounds gets a little irritating")
      if (t - monkeySaidAt > 30) {
        monkeySaidAt = t;
        audio.play('monkey', { intensity: 0.55 });
      }
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
    // (under the top bar, and under the hint while it shows; the scope's ring is 66 px round its middle)
    const yTop = hintEl.classList.contains('on') ? 230 : 150;
    const yBot = H - 200;
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
  ov.innerHTML = `<div class="rv-top"><div class="rv-count"><span class="rv-ring"></span><b>0</b><small>/ ${who.length}</small></div>${endless ? `<div class="rv-metres"><b>0</b><small>m</small></div><div class="rv-cn"><i class="rv-coin-ic"></i><b>0</b></div><div class="rv-hearts">${'<i></i>'.repeat(RIVER.hearts)}</div>` : '<div class="rv-bar"><i></i></div>'}<button class="rv-pause" aria-label="${S.pause}">❚❚</button></div>
    <div class="rv-faces"></div><div class="rv-hint"></div><div class="rv-pop"></div><div class="rv-hurt"></div>
    <div class="rv-vs"></div><div class="rv-ftag"></div><div class="rv-go3"></div><div class="rv-card"></div><div class="rv-scope"><svg viewBox="0 0 132 132" aria-hidden="true"><circle class="ring" cx="66" cy="66" r="54"/><g class="ticks">${Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; const r1 = i % 3 ? 49 : 44; return `<line x1="${(66 + Math.cos(a) * r1).toFixed(1)}" y1="${(66 + Math.sin(a) * r1).toFixed(1)}" x2="${(66 + Math.cos(a) * 54).toFixed(1)}" y2="${(66 + Math.sin(a) * 54).toFixed(1)}"/>`; }).join('')}</g><g class="cross"><line x1="66" y1="24" x2="66" y2="57"/><line x1="66" y1="75" x2="66" y2="108"/><line x1="24" y1="66" x2="57" y2="66"/><line x1="75" y1="66" x2="108" y2="66"/></g><path class="brk" d="M10 32 V10 H32 M100 10 H122 V32 M122 100 V122 H100 M32 122 H10 V100"/><circle class="dot" cx="66" cy="66" r="3.5"/></svg><div class="rng"></div></div><button class="rv-fire" aria-label="${S.rvFire}"><svg class="pips" viewBox="0 0 112 112"></svg><span class="in"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12 2.5c-.4 0-.7.2-.9.5C9.4 5.6 5.5 10.9 5.5 14.6a6.5 6.5 0 0 0 13 0c0-3.7-3.9-9-5.6-11.6-.2-.3-.5-.5-.9-.5z"/><path fill="#9feaf5" d="M9.2 14.4c.3 1.6 1.4 2.7 3 3" stroke="#0b6f8a" stroke-width="1.6" stroke-linecap="round"/></svg><span>${S.rvFire}</span></span></button><div class="rv-board"></div><div class="rv-arrow"></div><div class="rv-paused"><div><h2>${S.rvPaused}</h2><button class="rv-on">${S.rvResume}</button>${endless && !duel ? `<button class="rv-redo">${S.rvRestart}</button>` : ''}<button class="rv-off">${S.rvQuit}</button></div></div>`;
  const countEl = ov.querySelector('.rv-count');
  const countB = countEl.querySelector('b');
  const barEl = ov.querySelector('.rv-bar i');
  const metresEl = ov.querySelector('.rv-metres b');
  const coinEl = ov.querySelector('.rv-cn');
  const coinB = coinEl?.querySelector('b');
  if (!raid && !who.length) {
    // (a free ride: nobody of yours to count)
    for (const sel of ['.rv-count', '.rv-faces']) { const el = ov.querySelector(sel); if (el) el.style.display = 'none'; }
  }
  const heartsEl = ov.querySelector('.rv-hearts');
  function setHearts() {
    heartsEl?.querySelectorAll('i').forEach((h, k) => h.classList.toggle('gone', k >= hearts));
    heartsEl?.classList.remove('hit');
    void heartsEl?.offsetWidth;
    heartsEl?.classList.add('hit');
  }
  const facesEl = ov.querySelector('.rv-faces');
  const hintEl = ov.querySelector('.rv-hint');
  const popEl = ov.querySelector('.rv-pop');
  const hurtEl = ov.querySelector('.rv-hurt');
  const cardEl = ov.querySelector('.rv-card');

  // ---------------------------------------------------------------------------------------------- Saam gly (1.21)
  // your friend on the same river, live: their rider (in blue), the white water under their board, their name over them;
  // a pill at the top with their metres and the gap. What their game says comes a few times a second; in between they
  // ride on at the river's pace (the same river: the same speed), smoothed.
  const vsEl = ov.querySelector('.rv-vs');
  const ftagEl = ov.querySelector('.rv-ftag');
  const go3El = ov.querySelector('.rv-go3');
  const fname = duel ? duel.friend?.name || S.saamFriend : '';
  const SMOOTH_MS = 160;   // (the friend's moves are drawn this far behind: between two that came, never a guess)
  const fr = duel ? {
    rider: createRider(bendMaterial, d.models?.builder || null, { swap: true }), foam: things.foam(2.6, { hull: true }), seen: false, d: 0, sd: 0, at: 0,
    tx: laneX(duel.host ? 2 : 0), sx: laneX(duel.host ? 2 : 0), y: 0, k: 0, l: 0, h: RIVER.hearts, out: false, outT: 0, endM: 0, gone: false, blinkT: 0, blinkOn: false,
    samples: [], off: 0, away: false, md: 0, dodge: null, pj: null, mute: null, svx: 0, tvx: 0, ptx: laneX(duel.host ? 2 : 0),
  } : null;
  let meLost = false;     // (our own connection went: it comes back by itself)
  let watching = false;   // (you're out and they ride on: the camera goes down the river with them)
  let sentEnd = -1;       // (the metres your 'end' said)
  let sendT = 0;
  let sentAt = 0;   // (performance.now() of the last 'st': a swipe sends at once, but never two within 70 ms (the room's 20 a second))
  /** A swipe, a jump or a duck: tell the other phone now, not at the next tick. */
  function sendSoon() {
    if (duel) sendT = Math.min(sendT, Math.max(0, 0.07 - (performance.now() - sentAt) / 1000));
  }
  let goSaid = -1;
  let counting = false;   // (both rivers are up: the count runs)
  let goAt = 0;           // (when GLY! came: the tests check both phones start together)
  let countFrom = 0;      // (the count runs on the real clock, not the river's: a slow phone still says GLY! with the other)
  let duelDist = 0;       // (where the river is by the real clock since GLY!: both phones' rivers keep to it)
  let duelAt = 0;
  /** The duel's river on to now by the real clock (in small steps: its speed changes with the metres); the seconds. */
  function duelAdvance() {
    const now = performance.now();
    let real = Math.min(5, Math.max(0, (now - duelAt) / 1000));
    duelAt = now;
    const secs = real;
    while (real > 1e-6) {
      const h = Math.min(real, 1 / 60);
      duelDist += speedAt(duelDist, len) * (1 + 0.24 * rapK) * h;
      real -= h;
    }
    return secs;
  }
  let readySaid = false;
  let myEndM = 0;
  let duelPaintT = 0;
  let winSaid = false;
  let tagText = '';
  let vsHtml = '';
  let offDuel = null;
  if (fr) {
    fr.foam.scale.set(1.9, 1, 3.6);
    scene.add(fr.rider.group, fr.foam);
    offDuel = duel.onMsg((m) => {
      if (!alive) return;
      if (m.t === 'start') {
        counting = true;
        countFrom = performance.now();
      } else if (m.t === 'st') {
        if (fr.out) return;
        fr.seen = true;
        fr.d = m.d;
        fr.h = m.h;
        // (their lane, jump, duck and lean, smoothed: drawn a moment behind, between the last two that came)
        fr.samples.push({ at: performance.now(), d: m.d, x: m.x, a: m.a, y: m.y, k: m.k, l: m.l });
        if (fr.samples.length > 12) fr.samples.shift();
      } else if (m.t === 'ko') {
        fr.blinkT = 1;
        wayLog.kos++;
        if (phase === 'run') pop(S.saamKo(fname), 800);
      } else if (m.t === 'end') {
        if (!fr.out) {
          fr.out = true;
          fr.outT = t;
          if (phase === 'run') pop(S.saamOut(fname, fmtInt(Math.floor(m.m))), 1600);
        }
        fr.seen = true;
        fr.endM = Math.floor(m.m);
        fr.d = m.m;
        paintDuel();
      } else if (m.t === 'gone') {
        fr.gone = true;
        if (phase === 'run') pop(S.saamGone(fname), 1600);
        paintDuel();
      } else if (m.t === 'away') {
        fr.away = true;
      } else if (m.t === 'here') {
        fr.away = false;
      } else if (m.t === 'meLost') {
        meLost = true;
        hint(S.saamLost);
      } else if (m.t === 'meBack') {
        meLost = false;
        if (hintEl.textContent === S.saamLost) hint(null);
      }
    });
  }
  // (what you see of them is a moment old: the room's relay (about 0.18 s from here) and SMOOTH_MS. Level with you, a
  // dodge they made at the last moment would show as a ride straight into the rock (the owner, 25 Oct 2026: "It looks
  // like the other user is skiing into the objects"). So the board you see already takes the way past: a rock or a block
  // in their lane within SEE_S of them sends it to the free lane nearest them, it jumps the log and ducks the tree in
  // time; their own moves take over once those are behind them. A real knock still shows: their 'ko' makes them blink.)
  const SEE_S = 0.4;
  const wayBlocks = (l) => !['person', 'coins', 'log', 'branch', 'clown'].includes(l.it.kind);
  const wayReach = (l) => (l.it.kind === 'whirl' ? 2.1 : (l.obj.userData.w || 2.4) / 2 + HIT_R) + 0.2;
  /** Where to draw them this frame: { x, y (a jump), k (a duck), l (lean) }. */
  function friendWay(dt) {
    const real = { x: fr.tx, y: fr.y, k: fr.k, l: fr.l };
    if (phase === 'count' || fr.out || !fr.seen || d.noFriendWay) {
      fr.dodge = fr.pj = fr.mute = null;
      return real;
    }
    const D = fr.sd;
    const sp = speedAt(D, len) * (1 + 0.24 * rapK);
    const look = sp * SEE_S + 2;
    const free = (ln) => !live.some((o) => wayBlocks(o) && o.z - D > -2 && o.z - D < look + 8 && Math.abs(o.x - laneX(ln)) < wayReach(o));
    // (theirs again once their own board is there too; or the rock is past them and their own move isn't on its way
    // there: never back towards it first)
    fr.tvx += ((fr.tx - fr.ptx) / Math.max(dt, 1e-3) - fr.tvx) * (1 - Math.exp(-dt * 12));
    fr.ptx = fr.tx;
    const dg = fr.dodge;
    if (dg) {
      dg.t += dt;
      const there = Math.abs(fr.tx - dg.x) < 0.6;
      const past = dg.l.z - D < -((dg.l.obj.userData.d || 1.4) / 2 + 1);
      const coming = Math.abs(fr.tvx) > 0.5 && Math.sign(fr.tvx) === Math.sign(dg.x - fr.tx);
      if (there || (past && !coming) || dg.t > 1.6) {
        // (tests: did they really go round it that side?)
        if (Math.abs(fr.tx - dg.l.x) >= wayReach(dg.l) && Math.sign(fr.tx - dg.l.x) !== Math.sign(dg.x - dg.l.x)) wayLog.wrong++;
        fr.dodge = null;
      }
    }
    if (!fr.dodge) {
      const hit = live.find((l) => wayBlocks(l) && l.z - D > -0.5 && l.z - D < look && Math.abs(l.x - fr.tx) < wayReach(l));
      if (hit) {
        // (already on their way somewhere: that way; else where a swimmer or coins are coming (what people go for);
        // else the nearest free lane, the middle first)
        const going = Math.abs(fr.tvx) > 0.5 ? Math.sign(fr.tvx) : 0;
        const lure = (ln) => live.some((o) => (o.it.kind === 'person' || (o.it.kind === 'coins' && !o.done)) && o.z - D > 0 && o.z - D < look + 25 && Math.abs(o.x - laneX(ln)) < 1.2);
        const ln = [0, 1, 2].sort((a, b) => (going ? (Math.sign(laneX(b) - fr.tx) === going) - (Math.sign(laneX(a) - fr.tx) === going) : 0) || lure(b) - lure(a) || Math.abs(laneX(a) - fr.tx) - Math.abs(laneX(b) - fr.tx) || Math.abs(a - 1) - Math.abs(b - 1)).find(free);
        if (ln !== undefined) {
          fr.dodge = { l: hit, x: laneX(ln), t: 0 };
          wayLog.guesses++;
        }
      }
    }
    const wx = fr.dodge ? fr.dodge.x : fr.tx;
    // (a log or a tree across their way: up, or down, as it comes; their own jump for it (a moment later) is left out)
    if (!fr.pj) {
      const lg = live.find((l) => (l.it.kind === 'log' || l.it.kind === 'branch') && l.z - D > 0 && l.z - D < sp * 0.3 + 0.5 && Math.abs(l.x - wx) < (l.obj.userData.w || 2.4) / 2 + HIT_R * 0.4 + 0.3 && fr.mute?.z !== l.z);
      if (lg) {
        fr.pj = { jump: lg.it.kind === 'log', t: 0 };
        // (their own, a moment later, is left out until they're well past it: no second jump, no drop mid-air)
        fr.mute = { jump: fr.pj.jump, z: lg.z, end: lg.z + (fr.pj.jump ? 9 : 12) };
      }
    }
    let y = fr.y;
    let k = fr.k;
    if (fr.mute && !fr.pj && fr.md > fr.mute.end) fr.mute = null;
    if (fr.mute) {
      if (fr.mute.jump) y = 0;
      else k = 0;
    }
    if (fr.pj) {
      const pj = fr.pj;
      pj.t += dt;
      if (pj.jump) {
        const s = Math.min(1, pj.t / JUMP_S);
        y = JUMP_H * 4 * s * (1 - s);
      } else {
        k = Math.min(1, pj.t / 0.09, Math.max(0, DUCK_S - pj.t) / 0.14);
      }
      if (pj.t >= (pj.jump ? JUMP_S : DUCK_S)) fr.pj = null;
    }
    const l = fr.dodge ? clamp(fr.svx / 13, -1, 1) : fr.l;
    return { x: wx, y, k, l };
  }
  // (tests: their board on your screen against the river: a rock under it, a log or a tree it didn't clear (each thing
  // once); and frames where you or they are off the screen's edge)
  const wayLog = { clips: 0, kos: 0, offMe: 0, offFr: 0, frames: 0, seen: new Set(), kinds: [], maxV: 0, flips: 0, guesses: 0, wrong: 0, dir: 0, segX: 0, segT: 0, prev: null };
  const _wc = new THREE.Vector3();
  function wayCheck(way) {
    const D = fr.sd;
    for (const l of live) {
      const a = l.z - D;
      const u = l.obj.userData;
      let clip = false;
      if (l.it.kind === 'log' || l.it.kind === 'branch') {
        clip = Math.abs(a) < (u.d || 1) / 2 + 0.3 && Math.abs(l.x - fr.sx) < (u.w || 2.4) / 2 + HIT_R * 0.4 - 0.2 && !(l.it.kind === 'log' ? way.y > LOG_TOP - 0.2 : way.k > 0.5);
      } else if (wayBlocks(l) && l.it.kind !== 'whirl') {
        clip = Math.abs(a) < (u.d || 1.4) / 2 + 0.3 && Math.abs(l.x - fr.sx) < (u.w || 2.4) / 2 + HIT_R - 0.3 && (l.it.kind !== 'hippo' || u.surfaced?.());
      }
      if (clip && !wayLog.seen.has(l)) {
        wayLog.seen.add(l);
        wayLog.clips++;
        wayLog.kinds.push(`${l.it.kind}@${Math.round(l.z)}${fr.dodge ? ' dodging' : ''}`);
      }
    }
    wayLog.frames++;
    // (their board's own sideways speed; a swing over a metre one way and straight back over a metre the other)
    wayLog.maxV = Math.max(wayLog.maxV, Math.abs(fr.svx));
    const dir = Math.abs(fr.svx) > 1.5 ? Math.sign(fr.svx) : 0;
    if (dir && wayLog.dir && dir !== wayLog.dir) {
      const seg = { len: Math.abs(fr.sx - wayLog.segX), dur: t - wayLog.segT };
      if (wayLog.prev && wayLog.prev.len > 1 && seg.len > 1 && seg.dur < 0.6) wayLog.flips++;
      wayLog.prev = seg;
      wayLog.segX = fr.sx;
      wayLog.segT = t;
    }
    if (dir) wayLog.dir = dir;
    for (const [g, k] of [[rider.group, 'offMe'], [fr.rider.group, 'offFr']]) {
      if (!g.visible) continue;
      _wc.set(g.position.x + bendX(-g.position.z, dist - g.position.z), g.position.y + 0.9, g.position.z).project(camera);
      if (Math.abs(_wc.x) > 0.97 || _wc.y < -0.97) wayLog[k]++;
    }
  }
  /** Them on the river this frame, their tag, and the pill. */
  const _ft = new THREE.Vector3();
  function stepFriend(dt) {
    // (riding: on the same river clock as you, so level with you, however the network is; out: where they went in)
    fr.sd = phase === 'count' ? 0 : fr.out ? fr.endM : Math.max(duelDist, dist);
    // their lane, jump, duck and lean: a moment behind (SMOOTH_MS), between the two samples round that moment
    const at = performance.now() - SMOOTH_MS;
    const sm = fr.samples;
    if (sm.length) {
      let i = sm.length - 1;
      while (i > 0 && sm[i - 1].at > at) i--;
      const b = sm[i];
      const a = i > 0 ? sm[i - 1] : b;
      const k = b.at > a.at ? clamp((at - a.at) / (b.at - a.at), 0, 1) : 1;
      fr.tx = a.x + (b.x - a.x) * k;
      fr.y = a.y + (b.y - a.y) * k;
      fr.k = a.k + (b.k - a.k) * k;
      fr.l = a.l + (b.l - a.l) * k;
      fr.md = a.d + (b.d - a.d) * k;
      // (1.21.4 phones say the lane they're gliding to, at once on a swipe: that, fresh, not where they were a moment
      // ago; their board glides there on the same spring as theirs did)
      const last = sm[sm.length - 1];
      if (Number.isFinite(last.a)) fr.tx = last.a;
    }
    const way = friendWay(dt);
    // (in your lane, level with you: drawn a board's width beside you, not on top of you (the room's maker on the
    // left, the friend on the right), so you always see each other)
    const offTo = !watching && Math.abs(way.x - x) < 1.3 ? (duel.host ? 1.05 : -1.05) : 0;
    fr.off += (offTo - fr.off) * (1 - Math.exp(-dt * 6));
    // (their board glides as yours does: the same spring, about 0.3 s across a lane)
    const aim = way.x + fr.off;
    for (let rem = Math.min(dt, 0.1); rem > 1e-6; rem -= 1 / 120) {
      const h = Math.min(rem, 1 / 120);
      fr.svx += (LANE_W0 * LANE_W0 * (aim - fr.sx) - 2 * LANE_Z * LANE_W0 * fr.svx) * h;
      fr.sx += fr.svx * h;
    }
    const z = -(fr.sd - dist);
    const g = fr.rider.group;
    // (out: head over heels off the board and under, as yours goes)
    const outK = fr.out ? clamp((t - fr.outT) / 1.2, 0, 1) : 0;
    g.visible = !fr.gone && outK < 1 && z > -AHEAD && z < 16;
    g.position.set(fr.sx, fr.out ? Math.sin(outK * Math.PI) * 1.4 - outK * 1.6 : way.y, z);
    g.rotation.x = -outK * Math.PI * 1.6;
    fr.rider.update(dt, { lean: way.l, duck: way.k, speed: speedAt(fr.sd, len), tuck: way.y > 0.15 ? clamp(way.y / 1.2, 0, 1) : 0 });
    // (right on top of you: they show through, so neither hides the other; a knock: they blink)
    fr.blinkT = Math.max(0, fr.blinkT - dt);
    const blink = (!watching && Math.abs(z) < 2.4 && Math.abs(fr.sx - x) < 0.6) || (fr.blinkT > 0 && Math.floor(t * 10) % 2 === 0);
    if (blink !== fr.blinkOn) {
      fr.blinkOn = blink;
      fr.rider.setBlink(blink);
    }
    fr.foam.visible = g.visible && way.y < 0.3 && !fr.out;
    if (phase === 'run' && fr.seen && !fr.out) wayCheck(way);
    fr.foam.position.set(fr.sx, 0.03, z + 0.05);
    if (fr.foam.visible && phase !== 'count' && z > -70 && Math.random() < 0.5) things.emit(fr.sx, 0.12, z + 0.9, 1, 0.6, 1.4);
    // their name over them (it winds with the river as they do); off to the side: at that edge, pointing; behind the
    // camera: at the foot of the screen, how far back
    let text = '';
    let low = false;
    if (!fr.gone && (fr.seen || phase === 'count') && !(fr.out && t - fr.outT > 1.4)) {
      const W = host.clientWidth;
      if (z > 10 && !watching) {
        text = S.saamBehind(fname, fmtInt(Math.round(z)));
        low = true;
        ftagEl.style.left = `${clamp(W * (0.5 + (fr.sx - x) / 14), 100, W - 100)}px`;
      } else {
        _ft.set(fr.sx + bendX(-z, dist - z), (fr.out ? 0 : way.y) + 2.45, z).project(camera);
        if (_ft.z < 1) {
          const sx = (_ft.x * 0.5 + 0.5) * W;
          const side = _ft.x > 0.92 ? 1 : _ft.x < -0.92 ? -1 : 0;
          text = side > 0 ? `${fname} ▶` : side < 0 ? `◀ ${fname}` : fname;
          ftagEl.style.left = `${side ? clamp(sx, 70, W - 70) : sx}px`;
          ftagEl.style.top = `${clamp((-_ft.y * 0.5 + 0.5) * host.clientHeight, 120, host.clientHeight - 60)}px`;
        }
      }
    }
    if (text !== tagText) {
      tagText = text;
      ftagEl.textContent = text;
      ftagEl.classList.toggle('on', !!text);
    }
    ftagEl.classList.toggle('low', low);
    // the pill: their metres, and how far ahead (green) or behind (red) you are
    let html = '';
    if (!fr.gone && phase !== 'count' && (phase !== 'done' || watching)) {
      // (level all the way: their hearts say how they stand; out: where they went in)
      const hearts = '❤️'.repeat(Math.max(0, Math.min(RIVER.hearts, fr.h))) + '🤍'.repeat(Math.max(0, RIVER.hearts - fr.h));
      html = fr.out ? `<span>🔵 ${esc(fname)}</span><i class="behind">${esc(S.saamOutAt(fmtInt(fr.endM)))}</i>`
        : `<span>🔵 ${esc(fname)}</span><b class="rv-vs-h">${fr.away ? '⏳' : hearts}</b>`;
    }
    if (html !== vsHtml) {
      vsHtml = html;
      vsEl.innerHTML = html;
      vsEl.classList.toggle('on', !!html);
    }
    if (watching && phase === 'done' && (duelPaintT -= dt) <= 0) {
      duelPaintT = 0.25;
      paintDuel();
    }
  }
  /** The card's duel lines: who won (once both are out), or how far they are now. */
  function paintDuel() {
    if (!duel || phase !== 'done') return;
    const win = cardEl.querySelector('.rv-win');
    const line = cardEl.querySelector('.rv-vsline');
    const again = cardEl.querySelector('.rv-again');
    if (!win || !line) return;
    if (fr.out) {
      const w = duelWinner(myEndM, fr.endM);
      win.textContent = w === 'me' ? S.saamWin : w === 'tie' ? S.saamTie : S.saamLose(fname);
      line.textContent = S.saamTheirs(fname, fmtInt(fr.endM));
      if (!winSaid) {
        winSaid = true;
        audio.play(w === 'me' ? 'record' : 'banner');
        if (w === 'me' && !fwRide) fwRide = createFireworks(scene, reduced, world.night);
      }
    } else if (fr.gone || !fr.seen) {
      win.textContent = '';
      line.textContent = fr.gone ? S.saamGone(fname) : '';
    } else {
      win.textContent = '';
      line.textContent = S.saamWatch(fname, fmtInt(Math.floor(fr.sd)));
    }
    if (again && fr.gone) {
      again.disabled = true;
      again.textContent = S.saamGone(fname);
    }
  }
  const pausedEl = ov.querySelector('.rv-paused');
  // (28 Oct 2026) the screen through a waterfall, (29 Oct) in a shower: drops that run down and clear (updateShowers)
  const sprayEl = document.createElement('div');
  sprayEl.className = 'rv-spray';
  ov.appendChild(sprayEl);
  const faceUrl = (id, n = 96) => portraitDataUrl(id, n) || '';
  const scopeEl = ov.querySelector('.rv-scope');
  const arrowEl = ov.querySelector('.rv-arrow');
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
  /** A taken coin flies up into the counter (the stack and the diamond bigger). */
  function flyCoin(mesh, kind = '') {
    if (reduced || !coinEl) return;
    const from = screenOf(mesh);
    const el = document.createElement('i');
    el.className = `rv-flycoin ${kind}`.trim();
    el.style.left = `${from.x}px`;
    el.style.top = `${from.y - 30}px`;
    ov.appendChild(el);
    const r = coinEl.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    requestAnimationFrame(() => {
      el.style.transform = `translate(${r.left - h.left + 14 - from.x}px, ${r.top - h.top + 14 - (from.y - 30)}px) scale(.6)${kind === 'gem' ? ' rotate(45deg)' : ''}`;
      el.style.opacity = '0.3';
    });
    setTimeout(() => el.remove(), 520);
  }
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
  // (29 Oct 2026, the owner: "there are no restart button for ... Gly baan") the river run: this ride ends as "Klim uit"
  // ends it (its metres and coins count), and the next starts at once, as the card's "Gly weer" does
  pausedEl.querySelector('.rv-redo')?.addEventListener('click', () => {
    if (!alive) return;
    finishNow();
    if (lastR) d.onDone?.(lastR, 'again');
  });
  let lastR = null;   // (the ride's result once done() has it)

  // (30 Oct 2026, the owner: "can we add a 2 second continue if you have paused"): back from the pause, 2 and 1 on the
  // still river before it runs on, a moment to find your thumb and your lane
  const RESUME_S = 2;
  let resumeT = 0;     // (seconds of that count still to go)
  let resumeSaid = 0;
  function setPaused(on) {
    if (phase === 'done') return;
    const was = paused;
    paused = !!on;
    pausedEl.classList.toggle('on', paused);
    if (duel) return;   // (Saam gly: the menu is only a way out; the river and its sound run on)
    if (paused) {
      resumeT = 0;
      go3El.classList.remove('on');
      audio.suspend?.();
    } else {
      audio.resume?.();
      last = performance.now();
      if (was && phase === 'run') { resumeT = RESUME_S; resumeSaid = 0; }
    }
  }
  const onVis = () => { if (document.hidden && !duel) setPaused(true); };
  document.addEventListener('visibilitychange', onVis);
  // (a phone turned sideways: Stapel covers the screen with "turn your phone" (#rotate); the ride waits under it, paused;
  // not a duel: the friend's river doesn't stop)
  const sideMq = globalThis.matchMedia?.('(orientation: landscape) and (max-height: 540px) and (pointer: coarse)');
  const onSide = () => { if (sideMq?.matches && !duel && phase !== 'done') setPaused(true); };
  sideMq?.addEventListener?.('change', onSide);

  // ---------------------------------------------------------------------------------------------- input
  let down = null;
  // (30 Oct 2026: 1.24.8's slide-with-your-finger steering is gone again, the owner: "The new touch to move is not
  // running smoothly. Rather keep it as it was": a swipe or a tap moves him one lane, as before)
  function move(dir) {
    if (phase !== 'run' || paused || resumeT > 0) return;
    const to = clamp(lane + dir, 0, RIVER.lanes - 1);
    if (to === lane) {
      // (against the bank: a little bump, so the thumb knows)
      vx += dir * 3.5;
      return;
    }
    lane = to;
    sendSoon();
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
    } else if (endless && Math.abs(dy) > 26 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      // (the endless river: up jumps, down ducks)
      down.used = true;
      if (dy < 0) jump();
      else duck();
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
    else if (endless && (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ')) jump();
    else if (endless && (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S')) duck();
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
    if (endless && course.rows.at(-1).z < dist + AHEAD + 300) course.extend(dist + AHEAD + 1500);
    while (rowI < course.rows.length && course.rows[rowI].z < dist + AHEAD) {
      const row = course.rows[rowI++];
      if (row.fall) addShower(row.z);
      for (const it of row.items) {
        let obj;
        if (it.kind === 'block') obj = things.floating({ ...it, skin: d.skin || 'kleur' });
        else if (it.kind === 'rock') obj = things.rock();
        // (a swimming croc's snout points the way it swims: it starts at lane + drift and crosses to its lane)
        else if (it.kind === 'croc') obj = beasts.croc(it.drift ? -Math.sign(it.drift) : (rowI % 2 ? 1 : -1));
        else if (it.kind === 'hippo') obj = beasts.hippo();
        else if (it.kind === 'log') obj = hz.log(it.span || 1);
        else if (it.kind === 'branch') obj = hz.branch(!!it.flip);
        else if (it.kind === 'clown') obj = hz.clown(it.side || 1);
        else if (it.kind === 'whirl') obj = hz.whirl();
        else if (it.kind === 'coins') obj = hz.coins(it);
        else if (it.kind === 'ele') {
          obj = beasts.elephant({ from: it.from || 1, calf: !!it.calf });
          // (white water round their legs: they wade, they don't stand on the river)
          const k = it.calf ? 0.56 : 1;
          const f = things.foam(1);
          f.scale.set(5.4 * k, 1, 3.0 * k);
          f.position.y = 0.04;
          obj.add(f);
        }
        else if (it.kind === 'monkey') {
          const blk = things.floating({ ...it, skin: d.skin || 'kleur', spin: 0 });
          obj = beasts.monkeyOn(blk, Math.sign(-(it.drift || 1)), blk.userData.top);
        } else obj = things.person(it.who, who.indexOf(it.who));
        scene.add(obj);
        live.push({ it, row, obj, z: row.z, x: laneX(it.lane), done: false, drift: it.drift || 0 });
      }
    }
  }
  // (29 Oct 2026, the owner: "it looks like the waterfall comes out of thin air. Maybe we should just make it a rain
  // scene", then "can you add thunderstorms, hail, wind, basically the same weather as stapel") the endless river's
  // weather, where its falls across the river were (core/rivier.js FALLS): each spot its own kind, the same for everyone
  // (from where it is), the first ones mild as in Stapel (rain, wind, fog), from 3 km storms, hail, whirlwinds and heat
  // too. Riding in it builds over 120 m (you see it coming) and lifts over 80 m after; rain leaves a rainbow behind. (29
  // Oct, his "the rain and thunderstorms is a little too short": rain ~420 m, a storm ~540 m, ~15 and ~20 s; his "the
  // wind does not add up. Its in-between the canyons": the wind blows down the canyon, a headwind slowing you a little,
  // a tailwind pushing, gusts that come and go)
  const WX_EARLY = ['rain', 'wind', 'fog', 'rain'];
  const WX_LATE = ['rain', 'storm', 'hail', 'wind', 'gust', 'fog', 'heat'];
  const WX_SPAN = { rain: [60, 360], storm: [60, 480], hail: [50, 180], wind: [60, 260], gust: [60, 220], fog: [80, 220], heat: [60, 220] };   // (m before its spot, m after)
  function weatherAt(z) {
    if (WX_SPAN[d.wx]) return d.wx;   // (tests: ?wx=storm on the River's test page)
    const h = Math.abs(Math.sin(Math.round(z) * 12.9898) * 43758.5453) % 1;
    const list = z < 3000 ? WX_EARLY : WX_LATE;
    return list[Math.floor(h * list.length)];
  }
  const showers = [];   // (the weather spots ahead and just behind: { z, kind, obj, said, dir })
  let wxK = 0;          // (how deep in the weather you are, 0-1)
  let wxKind = null;
  let wxDir = 1;
  let wxSpeed = 0;      // (the wind's share on your speed: + a tailwind, - a headwind)
  const musicWx = { kind: null, k: 0 };   // (what the music was last told of the weather)
  let wxDropT = 0;
  let wxSplashT = 0;
  let boltT = 2;
  let flashK = 0;
  let thunderT = -1;
  let rainbowT = -1;
  function addShower(z) {
    const kind = weatherAt(z);
    const obj = kind === 'rain' || kind === 'storm' || kind === 'hail' ? world.rain(kind) : null;
    if (obj) {
      obj.scale.z = (WX_SPAN[kind][0] + WX_SPAN[kind][1]) / 100;   // (its streaks over the whole stretch)
      scene.add(obj);
    }
    showers.push({ z, kind, obj, said: false, bow: false, dir: Math.sin(z * 0.37) < 0 ? -1 : 1 });
  }
  function dropShower(c) {
    if (c.obj) scene.remove(c.obj);
  }
  function updateShowers(dt) {
    let k = 0;
    for (let i = showers.length - 1; i >= 0; i--) {
      const c = showers[i];
      const [IN, OUT] = WX_SPAN[c.kind];
      const ahead = c.z - dist;
      c.obj?.position.set(0, 0, -(ahead - IN));   // (from where it starts)
      const kin = clamp((IN + 120 - ahead) / 120, 0, 1) * clamp((ahead + OUT + 80) / 80, 0, 1);
      const kk = kin * kin * (3 - 2 * kin);
      if (kk > k || (kk > 0 && c.kind !== wxKind && wxK < 0.05)) { k = kk; wxKind = c.kind; wxDir = c.dir; }
      if (!c.said && ahead <= IN && phase === 'run') {
        c.said = true;
        const info = WEATHER_INFO[c.kind];
        pop(c.kind === 'rain' ? S.rvFall : c.kind === 'wind' ? (c.dir > 0 ? S.rvTailwind : S.rvHeadwind) : c.kind === 'gust' ? S.rvGusts : `${info.emoji} ${info.name}!`, 1300);
        if (c.kind === 'rain' || c.kind === 'storm') audio.play('thunder', { intensity: c.kind === 'storm' ? 0.75 : 0.35 });
        else if (c.kind === 'fog' || c.kind === 'heat') audio.play(c.kind, { intensity: 0.8 });
      }
      // (rain behind you: a rainbow over the far end)
      if (!c.bow && c.kind === 'rain' && ahead < -OUT - 80) {
        c.bow = true;
        rainbowT = 0;
      }
      if (ahead < -OUT - 60) {
        dropShower(c);
        showers.splice(i, 1);
      }
    }
    wxK += (k - wxK) * (1 - Math.exp(-dt * 3));
    if (wxK < 0.003 && k === 0) wxK = 0;
    const kind = wxK > 0 ? wxKind : null;
    // (a storm's lightning: one flash every few seconds, the thunder after it; none with less motion)
    if (kind === 'storm' && wxK > 0.5 && !reduced && phase === 'run' && (boltT -= dt) <= 0) {
      boltT = 2.6 + Math.random() * 3.2;
      flashK = 1;
      thunderT = 0.35 + Math.random() * 0.9;
    }
    flashK = Math.max(0, flashK - dt * 4.5);
    if (thunderT >= 0 && (thunderT -= dt) < 0) audio.play('thunder', { intensity: 0.9 });
    // (gusts come and go: the wind, its dust, its ripples and its hold on you rise and fall together)
    const gust = kind === 'gust' ? 0.5 + 0.5 * Math.sin(t * 1.2 + Math.sin(t * 0.5) * 2) : 1;
    world.setWeather(kind, wxK * (kind === 'gust' ? 0.45 + 0.55 * gust : 1), { dir: wxDir, flash: flashK * flashK });
    wxSpeed = kind === 'wind' ? wxDir * 0.08 * wxK : kind === 'gust' ? -0.12 * wxK * gust : 0;
    // (the rainbow: in over 2 s, gone after 14)
    if (rainbowT >= 0) {
      rainbowT += dt;
      world.setRainbow(clamp(rainbowT / 2, 0, 1) * clamp((14 - rainbowT) / 4, 0, 1));
      if (rainbowT > 14) rainbowT = -1;
    }
    // (29 Oct 2026, the owner: the weather's sounds should fit "all the weather and the riding ... more upbeat") the
    // weather plays in the ride's music, on its beat and in its key (js/audio.js weatherStep), not as noise over it
    const mk = phase === 'run' ? (kind && wxK > 0.05 ? kind : rainbowT >= 0 ? 'rainbow' : null) : null;
    const mv = mk === 'rainbow' ? clamp(rainbowT / 2, 0, 1) * clamp((14 - rainbowT) / 4, 0, 1) : mk ? Math.round(wxK * 10) / 10 : 0;
    if (mk !== musicWx.kind || mv !== musicWx.k) {
      musicWx.kind = mk;
      musicWx.k = mv;
      audio.musicSet?.({ wx: mk ? { kind: mk, k: mv } : null });
    }
    if (!kind || wxK < 0.3 || phase !== 'run') return;
    const wet = kind === 'rain' || kind === 'storm';
    // (drops, or hailstones bouncing, on the water round you)
    if ((wet || kind === 'hail') && !reduced && (wxSplashT -= dt) <= 0) {
      // (30 Oct 2026: hailstones bounce higher and more often, so the water round you jumps with them)
      wxSplashT = kind === 'hail' ? 0.03 : kind === 'storm' ? 0.06 : 0.09;
      things.emit(x + (Math.random() - 0.5) * 9, 0.05, -2 - Math.random() * 18, kind === 'hail' ? 3 : 2, 0.35, kind === 'hail' ? 2.2 : 0.5);
    }
    // (and on the lens, running down)
    if (wet && wxK > 0.7 && (wxDropT -= dt) <= 0) {
      wxDropT = kind === 'storm' ? 1.0 : 1.4;
      sprayEl.classList.remove('on');
      void sprayEl.offsetWidth;   // (the drops again, from the start)
      sprayEl.classList.add('on');
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

  // ---------------------------------------------------------------------------------------------- coins (1.21.3)
  let coinsGot = 0;
  let coinRun = 0;
  let coinAt = -9;
  /** A coin line as you come: in its lane at the right height you take each one (a jump for those in the air). */
  function coinStep(l, ahead) {
    if (phase !== 'run') return;
    const it = l.it;
    const u = l.obj.userData;
    if (Math.abs(l.x - x) > 1.15) return;
    const ok = it.y === 1 ? airY > 0.7 : it.y === 2 ? true : airY < 1.2;
    if (!ok) return;
    u.coins.forEach((c, k) => {
      if (c.taken) return;
      const a = ahead + (it.dz || 0) + k * (it.sp || 0);
      if (Math.abs(a) > 0.95) return;
      c.taken = true;
      c.m.visible = false;
      coinsGot += it.val || 1;
      coinRun = t - coinAt < 0.8 ? coinRun + 1 : 0;
      coinAt = t;
      audio.play(it.gem || it.stack ? 'gold' : 'coin', { n: coinRun });
      haptics.tap?.();
      things.emit(l.x, COIN_HEIGHT[it.y | 0] ?? 0.85, -a, it.gem ? 30 : it.stack ? 22 : 6, 1.2, 2.6);
      flyCoin(c.m, it.gem ? 'gem' : it.stack ? 'big' : '');
      if (it.gem) pop(S.rvGem(it.val), 1300);
      else if (it.stack) pop(S.rvStack(it.val), 1000);
      if (coinB) {
        coinB.textContent = fmtInt(coinsGot);
        coinEl.classList.remove('bump');
        void coinEl.offsetWidth;
        coinEl.classList.add('bump');
      }
    });
    if (u.coins.every((c) => c.taken)) l.done = true;
  }
  const COIN_HEIGHT = [0.85, 2.05, 0.7];

  // ---------------------------------------------------------------------------------------------- whirlpools, elephants (1.21.3)
  let pullX = 0;          // (the whirlpools' pull on your lane's middle this frame, m across)
  let pullNext = 0;
  /**
   * A whirlpool: from 26 m before it, it pulls you toward its middle, harder the nearer you are (the middle lane too;
   * the far lane hardly); in its hollow you're spun round: a knock.
   */
  function whirlStep(l, ahead) {
    const wx = l.x;
    if (phase === 'run' && ahead < 26 && ahead > -4) {
      const near = clamp((26 - ahead) / 18, 0, 1) * clamp((ahead + 4) / 4, 0, 1);
      const dx = wx - x;
      const fall = clamp(1 - (Math.abs(dx) - 1.2) / 5.4, 0, 1);
      pullNext += Math.sign(dx) * 3.3 * near * fall;
      if (!l.done && Math.abs(ahead) < 2.4 && Math.abs(dx) < 2.1) {
        l.done = true;
        if (graceT <= 0) knock(l);
      }
    }
    // (its foam and a little spray round its rim)
    if (ahead < 70 && ahead > -6 && Math.random() < 0.35) {
      const a = t * 3 + Math.random() * 6.28;
      things.emit(wx + Math.cos(a) * 3.4, 0.15, -ahead + Math.sin(a) * 3.4, 1, 0.5, 1.2);
    }
  }
  /**
   * The whirlpool's and the elephants' first coming: the river slows while they're near and the word shows (not in a
   * duel: the friend's river doesn't slow); later ones get a quick word.
   */
  let soft = null;   // { l, kind }
  function cueLater(l, ahead) {
    const k = l.it.kind;
    const sp = speedAt(dist, len);
    // (never over another lesson: a log or tree waiting for your swipe keeps its own words)
    if (!taught[k] && !l.taught && ahead < sp * 2.4 && ahead > 0 && !(k === 'ele' && l.it.calf) && !(lesson && !lesson.done)) {
      l.taught = true;
      if (!duel) soft = { l, kind: k };
      hint(k === 'whirl' ? S.rvTeachWhirl : S.rvTeachEle);
      teachDone(k);
    } else if (taught[k] && !l.taught && !l.hinted && ahead < sp * 1.8 && ahead > sp * 0.8 && !(k === 'ele' && l.it.calf)) {
      l.hinted = true;
      pop(k === 'whirl' ? S.rvWhirlShort : S.rvEleShort, 900);
    }
    if (soft?.l === l && ahead < -2) {
      soft = null;
      hint(null);
    }
  }
  /** A log or a tree coming: the first one ever stops the river nearly still and shows you; later ones get a quick word. */
  function teach(l, ahead) {
    const k = l.it.kind === 'log' ? 'jump' : 'duck';
    const sp = speedAt(dist, len);
    if (!taught[k] && !duel && !l.taught && ahead < sp * 1.25 && ahead > 0) {
      l.taught = true;
      lesson = { kind: k, l };
      hint(k === 'jump' ? S.rvTeachJump : S.rvTeachDuck);
      arrowEl.className = `rv-arrow on ${k === 'jump' ? 'up' : 'down'}`;
    } else if ((taught[k] || duel) && !l.hinted && ahead < sp * 1.7 && ahead > sp * 0.6) {
      l.hinted = true;
      pop(k === 'jump' ? S.rvJumpShort : S.rvDuckShort, 900);
    }
  }
  function endLesson() {
    lesson = null;
    hint(null);
    arrowEl.className = 'rv-arrow';
  }
  /** Over the log, under the tree. */
  function cleared(l) {
    if (lesson?.l === l) {
      lesson = null;
      pop(S.rvNice, 900);
    }
    things.emit(x, 0.3, -0.6, 10, 1, 1.4);
  }
  /** Jump (swipe up): over a log; the board leaves the water. Asked for just before landing, it goes as he lands. */
  function jump() {
    if (phase !== 'run' || paused || resumeT > 0 || raid) return;
    if (jumpT >= 0) {
      if (jumpT > JUMP_S * 0.7) jumpQ = t;
      return;
    }
    duckT = -1;
    jumpT = 0;
    sendSoon();
    things.emit(x, 0.15, 0.6, 18, 1.4, 2.6);
    audio.play('fling');
    haptics.tap?.();
    if (lesson?.kind === 'jump' && !lesson.done) { lesson.done = true; teachDone('jump'); hint(null); arrowEl.className = 'rv-arrow'; timeK = 1; }
  }
  /** Duck (swipe down): under a fallen tree. In the air, he drops back to the water first. */
  function duck() {
    if (phase !== 'run' || paused || resumeT > 0 || raid) return;
    if (jumpT >= 0) jumpT = Math.max(jumpT, JUMP_S * 0.8);
    duckT = 0;
    sendSoon();
    audio.play('click');
    haptics.tap?.();
    if (lesson?.kind === 'duck' && !lesson.done) { lesson.done = true; teachDone('duck'); hint(null); arrowEl.className = 'rv-arrow'; timeK = 1; }
  }
  /**
   * Hanswors's visit: he's met floating ahead, then rides alongside a little ahead of you on your side, winds up and lobs
   * his pies at the lane you're in (a shadow shows where each lands: move out of it), then waves and drops behind.
   */
  // Hanswors: where he rides beside you (m ahead; across, in open water outside the lanes, never nearer the wall's foot
  // than `reach`, never into the lane past `minX`) and how he sits (turned a little, so his duck's head shows)
  const CLOWN = { ahead: 15, x: 6.5, minX: 5.0, reach: 1.7, yaw: 0.4 };
  // (no boulders on the bank where he rides: from his row to well past where he's left behind, read off the course long
  // before those boulders come into view)
  const clownBanks = [];
  let clownScan = 0;
  world.setRockClear?.((side, z) => {
    for (; clownScan < course.rows.length; clownScan++) {
      const r = course.rows[clownScan];
      for (const it of r.items) {
        if (it.kind !== 'clown') continue;
        const secs = 1.1 + ((it.pies || 3) - 1) * 1.75 + 3.2;
        clownBanks.push({ side: it.side || 1, from: r.z - 40, to: r.z + secs * speedAt(r.z + 400, Infinity) * 1.25 + 30 });
      }
    }
    // (and where the pool noodles float wide, by a canyon's walls)
    return clownBanks.some((c) => c.side === side && z > c.from && z < c.to) || (!!pipes && pipeX(z) > PIPE.x + 0.3);
  });
  /** How far out he can sit at course metre z: clear of the wall's foot all along his duck and a little ahead of it. */
  function clownRoom(side, z) {
    const sp = speedAt(dist, len);
    let foot = 99;
    for (let dz = -3; dz <= 3 + sp * 0.35; dz += 1.5) foot = Math.min(foot, world.footAt?.(side, z + dz) ?? 99);
    return clamp(foot - CLOWN.reach, CLOWN.minX, CLOWN.x);
  }
  function clownStep(l, ahead, dt) {
    const u = l.obj.userData;
    const st = l.cs || (l.cs = { phase: 'coming', thrown: 0, timer: 1.1, wind: 0, after: 0, waveT: 0, off: 0, x: null });
    const side = u.side || 1;
    if (st.phase === 'coming' && ahead < CLOWN.ahead + 9 && phase === 'run') {
      st.phase = 'riding';
      st.off = ahead;
      audio.play('clown');
      pop(S.rvClown, 1100);
      if (!taught.clown) { hint(S.rvTeachClown); teachDone('clown'); setTimeout(() => { if (alive && hintEl.textContent === S.rvTeachClown) hint(null); }, 3200); }
    }
    let throwNow = false;
    if (st.phase === 'riding') {
      // (he paddles up to keep pace a little ahead of you, easing in: never a jump)
      st.off += (CLOWN.ahead - st.off) * Math.min(1, dt * 2.2);
      l.z = dist + st.off + Math.sin(t * 0.7) * 1.2;
      st.timer -= dt;
      const pies0 = l.it.pies || 3;
      if (st.timer < 0.45 && st.thrown < pies0) st.wind = Math.min(1, st.wind + dt / 0.45);
      if (st.timer <= 0 && st.thrown < pies0) {
        throwNow = true;
        st.thrown++;
        st.wind = 0;
        st.after = 1;
        const deep = clamp((dist - RIVER.unlock.clown) / 4000, 0, 1);
        st.timer = 1.75 - 0.5 * deep;
      }
      if (st.thrown >= pies0 && !pies.some((pp) => pp.from === l) && st.after <= 0) {
        st.phase = 'leaving';
        st.waveT = 0;
      }
    } else if (st.phase === 'leaving') {
      st.waveT += dt;
      // (he waves, then stops paddling: the river carries you past him)
      if (st.waveT < 1.2) l.z = dist + st.off + Math.sin(t * 0.7) * 1.2;
    }
    st.after = Math.max(0, st.after - dt * 3.2);
    const a = l.z - dist;
    // (he steers out from the wall's bulges before they reach him, and drifts back out after)
    const room = clownRoom(side, l.z);
    st.x = st.x === null ? room : st.x + (room - st.x) * Math.min(1, dt * (room < st.x ? 6 : 1.5));
    l.obj.position.set(side * st.x, 0, -a);
    l.obj.rotation.set(0, side * CLOWN.yaw, 0);
    u.pose(t, st.wind, st.phase === 'leaving' && st.waveT < 1.2 ? 1 : 0, st.after);
    // (spray off the duck's tail as he paddles)
    if (st.phase !== 'coming' && phase === 'run' && Math.random() < 0.6) {
      _pp.set(0, 0.15, 2.3).applyAxisAngle(_up, side * CLOWN.yaw);
      things.emit(side * st.x + _pp.x, 0.15, -a + _pp.z, 1, 0.6, 1.3);
    }
    // (the pie leaves his hand where it is now, after the pose)
    if (throwNow && phase === 'run') throwPie(l);
  }
  const _up = new THREE.Vector3(0, 1, 0);
  function throwPie(from) {
    const u = from.obj.userData;
    const mesh = hz.pie();
    mesh.scale.setScalar(PIE_SCALE);
    const start = new THREE.Vector3();
    from.obj.updateMatrixWorld(true);
    (u.pieHeld || u.head || from.obj).getWorldPosition(start);
    if (u.pieHeld) u.pieHeld.visible = false;
    // (the cream's picture drawn and decoded now, so it's on the lens the very frame the pie gets there)
    if (!splatSrc) {
      splatSrc = splatImage();
      splatImg.src = splatSrc;
      splatImg.decode?.().catch(() => {});
    }
    const tx = laneX(lane);
    const shadow = new THREE.Mesh(pieShadowGeo, pieShadowMat.clone());
    shadow.position.set(tx, 0.07, 0.4);
    shadow.renderOrder = 3;
    scene.add(mesh, shadow);
    pies.push({ mesh, shadow, from, start, tx, lane, t: 0, hit: null, mid: new THREE.Vector3() });
    audio.play('fling');
  }
  const _pp = new THREE.Vector3();
  const _lens = new THREE.Vector3();
  // (29 Oct 2026, the owner: "if you dodge quickly once its on your face then it disappears. So it looks like it hits you
  // but then nothing happens although it shows Pie": hit or miss was settled 0.23 s before the pie got there, so a dodge
  // in that last moment still said Pie! and its cream landed beside you. Now it is settled when the pie reaches your
  // face: still in its lane, it bursts over the screen (you can't see for a moment); swiped out, it flies on past your
  // head into the water behind you: Close one!)
  const PIE_FLY = 1.25;     // s from his hand to your face, over the lane you were in (the shadow on the water marks it)
  const PIE_AFTER = 0.14;   // s: on into the lens, or past you into the water
  function stepPies(dt) {
    for (let i = pies.length - 1; i >= 0; i--) {
      const pp = pies[i];
      pp.t += dt;
      const s = Math.min(1, pp.t / PIE_FLY);
      if (pp.t < PIE_FLY) {
        // the lob: up out of his hand, over, and down at your face
        _pp.set(pp.start.x + (pp.tx - pp.start.x) * s, pp.start.y + (1.6 - pp.start.y) * s + Math.sin(s * Math.PI) * 3.4, pp.start.z + (-0.5 - pp.start.z) * s);
        pp.mid.copy(_pp);
        // (flat, cream up, wobbling as it flies)
        pp.mesh.rotation.set(Math.sin(pp.t * 11) * 0.22, pp.t * 6, Math.sin(pp.t * 8) * 0.18);
      } else {
        // at your face: still in its lane it's a hit; swiped out of it, a dodge
        if (pp.hit === null) {
          pp.hit = phase === 'run' && lane === pp.lane && Math.abs(x - pp.tx) < 1.5;
          if (!pp.hit && phase === 'run') pop(S.rvClose, 700);
        }
        const k = Math.min(1, (pp.t - PIE_FLY) / PIE_AFTER);
        if (pp.hit) {
          camera.getWorldDirection(_lens);
          _lens.multiplyScalar(1.25).add(camera.position);
          _pp.copy(pp.mid).lerp(_lens, k * k);
          // (the cream turns to face you)
          pp.mesh.rotation.set(k * Math.PI * 0.5, pp.mesh.rotation.y, 0);
        } else {
          // (on past where your head was, down into the water behind you)
          _pp.set(pp.tx, pp.mid.y * (1 - k * k), pp.mid.z + 2.4 * k);
        }
      }
      pp.mesh.position.copy(_pp);
      pp.shadow.material.opacity = 0.15 + 0.5 * s;
      pp.shadow.scale.setScalar(0.55 + 0.65 * s);
      if (pp.t >= PIE_FLY + PIE_AFTER) {
        if (pp.hit) splat();
        else {
          things.emit(pp.tx, 0.2, 1.9, 24, 1.6, 2.4);
          audio.play('splash');
        }
        scene.remove(pp.mesh, pp.shadow);
        pp.shadow.material.dispose();
        disposeTree(pp.mesh);
        if (pp.from.obj.userData.pieHeld) pp.from.obj.userData.pieHeld.visible = true;
        pies.splice(i, 1);
      }
    }
  }
  /** Cream on the camera: it covers most of the view a moment (no heart lost), slides down and fades. */
  function splat() {
    const el = document.createElement('img');
    el.className = 'rv-splat';
    el.src = splatSrc || (splatSrc = splatImage());
    // (the pie hit the lens: the cream is big, over the middle and the rider, and slides off within three seconds)
    // (29 Oct 2026: a third bigger and a little longer: at 84 % of the width, in the middle, it read as a pie that landed
    // on the river, "nothing happens")
    const w = host.clientWidth;
    const h = host.clientHeight;
    const sw = Math.min(w * 1.25, 660);
    el.style.width = `${sw}px`;
    el.style.left = `${(w - sw) / 2 + (Math.random() - 0.5) * w * 0.08}px`;
    el.style.top = `${h * (0.5 + Math.random() * 0.05) - sw * 0.5}px`;
    el.style.setProperty('--r', `${(Math.random() - 0.5) * 30}deg`);
    ov.prepend(el);   // (under the words and buttons: Pie! reads on top of the cream)
    setTimeout(() => el.remove(), 3000);
    audio.play('splat', { intensity: 0.7 });
    stage.shake(reduced ? 0 : 0.2);
    haptics.lost?.();
    pop(S.rvPie, 900);
  }
  let splatSrc = '';
  const splatImg = new Image();
  let lastKnock = null;   // (what knocked you last: for the tests)
  function knock(l) {
    hits++;
    duel?.send({ t: 'ko' });
    lastKnock = l?.it?.kind ?? null;
    if (l?.it?.kind === 'croc' && !reduced) l.bite = 0;   // (it rears up and bites: biteStep)
    if (endless) {
      hearts = Math.max(0, hearts - 1);
      setHearts();
      if (hearts <= 0) {
        wipeout(l);
        return;
      }
    }
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
    // (once they've gone ashore at your island they're home: a knock after that costs only the heart)
    const back = endless && islandSaid ? null : rescued.pop();
    if (back) {
      lostAgain.push(back);
      setCount();
      pop(S.rvSlipped(CAST[back]?.name || ''), 1400);
    } else {
      pop(({ croc: S.rvCroc, hippo: S.rvHippo, monkey: S.rvMonkey, whirl: S.rvWhirlKo, ele: S.rvEleKo })[l.it.kind] || S.rvOuch, 1000);
    }
  }
  /**
   * (30 Oct 2026, the owner: "the crocodile once you ride over it can you make it bite the player") the croc you hit
   * rears up out of the water, jaws wide, and snaps them shut at your board; then it sinks back.
   */
  function biteStep(l, dt) {
    l.bite += dt;
    const b = l.bite;
    const up = b < 0.14 ? ease(b / 0.14) : b < 0.45 ? 1 : 1 - ease(clamp((b - 0.45) / 0.45, 0, 1));
    l.obj.position.y += 0.42 * up;
    l.obj.rotation.z = (l.obj.userData.side || 1) * 0.38 * up;
    l.jaw ??= l.obj.getObjectByName('jaw') || null;
    if (l.jaw) l.jaw.rotation.z = -(b < 0.16 ? 0.78 : Math.max(0, 0.78 - (b - 0.16) * 12));
    if (b > 0.9) {
      l.bite = -1;
      l.obj.rotation.z = 0;
    }
  }
  /** The third knock: he goes head over heels into the river, and the ride is over (the card after a moment). */
  function wipeout(l) {
    endLesson();
    if (duel) {
      sentEnd = Math.floor(dist);
      duel.send({ t: 'end', m: sentEnd });
    }
    phase = 'wipe';
    phaseT = 0;
    for (const x2 of live) x2.done = true;
    stage.shake(reduced ? 0 : 0.7);
    things.emit(x, 0.5, -0.6, 70, 3, 6, 1.4);
    audio.play('splash');
    audio.play('lost');
    audio.music?.(false);
    haptics.lost?.();
    hurtEl.classList.add('on');
    setTimeout(() => hurtEl.classList.remove('on'), 220);
    hint(null);
    pop(({ croc: S.rvCroc, hippo: S.rvHippo, monkey: S.rvMonkey, whirl: S.rvWhirlKo, ele: S.rvEleKo })[l?.it?.kind] || S.rvWipeout, 1300);
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
  // (tests: on the endless river the autopilot stops steering this far down, so a ride ends)
  const pilotStop = Number(d.pilotMetres) || 900;
  function pilot() {
    if (phase !== 'run') return;
    if (endless && dist > pilotStop) return;
    // (a log or a tree in the way: jump or duck in time, whatever the lane)
    const sp = speedAt(dist, len);
    for (const l of live) {
      if (l.done || (l.it.kind !== 'log' && l.it.kind !== 'branch')) continue;
      const a = l.z - dist;
      const u = l.obj.userData;
      // (a lesson holds time just before its log or tree: answer it there, as a player would)
      const reach = lesson && !lesson.done && lesson.l === l ? sp * (l.it.kind === 'log' ? 0.3 : 0.16) + 1.5 : sp * 0.3;
      if (a > 0 && a < reach && Math.abs(l.x - x) < u.w / 2 + HIT_R) {
        if (l.it.kind === 'log' && jumpT < 0) jump();
        if (l.it.kind === 'branch' && duckT < 0) duck();
      }
    }
    if (Math.abs(laneX(lane) + pullX - x) > 0.3) return;   // (tests' autopilot: one glide at a time)
    // (tests: `pilotLate` dodges at the last moment, as people do)
    const near = d.pilotLate ? 9 : 22;
    const ahead = live.filter((l) => !l.done && l.z > dist + 1 && l.z < dist + near);
    // (a pie coming down in a lane: that lane is out)
    const pieIn = (ln) => pies.some((pp) => Math.abs(pp.tx - laneX(ln)) < 1 && pp.t > 0.15);
    const whirls = live.filter((l) => !l.done && l.it.kind === 'whirl' && l.z > dist - 3 && l.z < dist + 45);
    const eles = live.filter((l) => l.it.kind === 'ele' && l.z > dist - 3 && l.z < dist + 45);
    const blocked = (ln) => pieIn(ln) || whirls.some((l) => l.it.lane === ln || ln === 1) || eles.some((l) => l.it.lane === ln) || ahead.some((l) => !['person', 'log', 'branch', 'clown', 'whirl'].includes(l.it.kind) && (l.it.lane === ln || l.it.lane + l.drift === ln) && l.z < dist + near - 4);
    const want = ahead.find((l) => l.it.kind === 'person' && !blocked(l.it.lane))
      || live.find((l) => l.it.kind === 'coins' && !l.done && l.z + (l.it.dz || 0) > dist + 1 && l.z + (l.it.dz || 0) < dist + 30 && !blocked(l.it.lane));
    let target = want ? want.it.lane : lane;
    if (blocked(target)) target = [lane, lane - 1, lane + 1, 0, 1, 2].find((ln) => ln >= 0 && ln < 3 && !blocked(ln)) ?? lane;
    if (target !== lane) move(target > lane ? 1 : -1);
  }

  // ---------------------------------------------------------------------------------------------- the camera
  const cam = duel ? { pos: new THREE.Vector3(0, 8.2, 17), look: new THREE.Vector3(0, 0.6, -14) }
    : quick ? { pos: new THREE.Vector3(0, 6.4, 11.5), look: new THREE.Vector3(0, 0.4, -22) } : { pos: new THREE.Vector3(0, 30, 30), look: new THREE.Vector3(0, 0, -20) };
  const towerTop = () => island.top;
  function cameraFor(dt) {
    let p;
    let l;
    if (watching) {
      // (Saam gly, you're out: the riding camera goes on down the river behind your friend)
      p = new THREE.Vector3(fr.sx * 0.15, 8.2, 17);
      l = new THREE.Vector3(fr.sx * 0.1, 0.6, -14);
    } else if (phase === 'count') {
      // (Saam gly's start line: back and up in the middle, both riders side by side in the picture)
      p = new THREE.Vector3(0, 8.2, 17);
      l = new THREE.Vector3(0, 0.6, -14);
    } else if (phase === 'dive' && quick) {
      // (dropped in: the riding camera from the start)
      p = new THREE.Vector3(x * 0.82, 6.4, 11.5);
      l = new THREE.Vector3(x * 0.62, 0.4, -22);
    } else if (phase === 'dive') {
      const k = ease(clamp(phaseT / DIVE, 0, 1));
      // out in front of your tower and to the side, watching him jump off its top and fall; round to behind him as he lands
      const y = rider.group.position.y;
      const back = Math.max(14, diveTop * 0.75);
      const front = new THREE.Vector3(7, y * 0.75 + 3, START_Z - back);
      const behind = new THREE.Vector3(x * 0.82, 6.4, 11.5);
      p = front.lerp(behind, ease(clamp((k - 0.45) / 0.55, 0, 1)));
      l = new THREE.Vector3(0, y * 0.95 + 0.5, START_Z * (1 - k)).lerp(new THREE.Vector3(x * 0.62, 0.4, -22), ease(clamp((k - 0.55) / 0.45, 0, 1)));
    } else if (endless && (phase === 'wipe' || phase === 'done')) {
      // the wipeout: the camera stops and rises, looking down at the splash, the river running on ahead
      const k = ease(clamp(phaseT / 1.6, 0, 1));
      p = new THREE.Vector3(x * 0.82, 6.4 + k * 7, 11.5 + k * 6);
      l = new THREE.Vector3(x * 0.8, 0.4 - k * 0.4, -22 + k * 16);
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
      // (Saam gly: back and up over the middle, all three lanes in the picture, so you always see each other; the
      // start line's own view, so GLY! doesn't swing the camera)
      if (duel) {
        p.set(x * 0.15, 8.2, 17);
        l.set(x * 0.1, 0.6, -14);
      }
      // (28 Oct 2026, the owner: "more twists and turns") the view looks a little into the bend ahead, and banks with it
      // below (not in Saam gly: its wide view keeps both riders in the picture). (29 Oct: the bends are real now, the
      // canyon fixed and the view turning through it; 60 m ahead lies up to ~11 m across, the bank full from 12 m)
      turnAhead = phase === 'run' && !duel && !d.debugCam ? bendX(60, dist + 60) : 0;
      // (30 Oct 2026, the owner: "the camera angle should stay on the 3 lanes, because if you go to the right then you
      // character goes out of the screen"): it looks into a bend at most 2.2 m across (about 3.8°), and when the bend
      // turns away from his side, a third of that in an outer lane, so he stays well inside a phone held upright
      const look = turnAhead * 0.35;
      const lim = look * x >= 0 ? LOOK_IN : LOOK_IN * (1 - 0.65 * clamp(Math.abs(x) / RIVER.laneW, 0, 1));
      l.x += clamp(look, -lim, lim);
      // Saturday: the tallest tower coming by turns the camera halfway towards it (a little more while you aim), still
      // looking down a little, so he and the tower's lower part are both in the picture (a phone held upright is narrow)
      const tgt = raid ? targetIsle() : null;
      // (30 Oct 2026, the owner: "the Saterday run needs to be seperate ... the camera angle should stay on the 3 lanes":
      // your crew's island no longer turns the camera towards it on the everyday ride (it did from 150 m off, with the
      // bend's look on top: a rider in the right lane went off the screen's edge). Saturday's towers still do, below)
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
    } else if (d.debugCam === 'top') {   // (tests: the river from above, the pool noodles' lines)
      p = new THREE.Vector3(0, 60, 8);
      l = new THREE.Vector3(0, 0, -50);
    } else if (d.debugCam === 'croc') {   // (trailers: low beside the next crocodile, looking back at him coming)
      const c = live.find((v) => v.it?.kind === 'croc' && v.z - dist > -1.5 && v.z - dist < 30);
      if (c) {
        const cp = c.obj.position;
        p = new THREE.Vector3(cp.x + 2.4, 1.0, cp.z - 3.2);
        l = new THREE.Vector3(cp.x - 0.4, 0.5, cp.z + 3.5);
      }
    } else if (d.debugCam === 'left') {
      p = new THREE.Vector3(x - 1.9, 1.75, -0.6);
      l = new THREE.Vector3(x, 1.35, 0);
    }
    const a = phase === 'run' ? 1 - Math.exp(-dt * 9) : phase === 'dive' ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 4);
    cam.pos.lerp(p, a);
    cam.look.lerp(l, a);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    world.turnMoon?.(Math.atan2(cam.look.x - cam.pos.x, cam.pos.z - cam.look.z));
    // the feel of speed: the view widens a little as the river speeds up and in the rapids (narrower while aiming), and
    // leans a touch into each carve (none with less motion)
    if (!reduced && phase === 'run' && !d.debugCam) {
      // (the endless river: the view keeps widening as it keeps getting faster)
      const sp = endless ? clamp((speedAt(dist, len) - PACE.start) / (PACE.max - PACE.start), 0, 1) : clamp((speedAt(dist, len) - RIVER.speed0) / (RIVER.speed1 - RIVER.speed0), 0, 1);
      const want = FOV0 + sp * 5 + rapK * 3 - (aiming ? 6 : 0);
      camera.fov += (want - camera.fov) * (1 - Math.exp(-dt * 3));
      camera.updateProjectionMatrix();
      camRoll += (-leanV * 0.045 - clamp(turnAhead / 12, -1, 1) * 0.05 - camRoll) * (1 - Math.exp(-dt * 6));
      camera.rotateZ(camRoll);
    } else if (Math.abs(camera.fov - FOV0) > 0.01) {
      camera.fov += (FOV0 - camera.fov) * (1 - Math.exp(-dt * 4));
      camera.updateProjectionMatrix();
    }
  }
  const FOV0 = camera.fov;
  let camRoll = 0;
  let turnAhead = 0;   // (28 Oct 2026) how far across the river bends 60 m ahead: the view looks and banks into it
  const LOOK_IN = 2.2;   // (30 Oct 2026) metres the view may look across into a bend: he stays well inside the picture

  // ---------------------------------------------------------------------------------------------- the loop
  let pilotOn = !!d.autopilot;
  let ambNow = -1;
  const ambBefore = audio.ambience ?? 0;   // (the game's own level, back when the ride closes)
  let aimHintSaid = false;
  let startHint = false;   // (the opening tip is up)
  const pilotThrew = new Set();
  let rapK = 0;
  let startGone = 0;
  let rapSaid = false;
  let rapNow = null;
  if (course.rapids) world.setRapids(course.rapids.from, course.rapids.to);
  function step(dt) {
    t += dt;
    phaseT += dt;
    if (phase === 'count' && !counting) {
      // (Saam gly: the river is up; the count waits for your friend's (or goes alone once they've gone))
      phaseT = 0;
      rider.group.position.set(x, 0, 0);
      if (!readySaid) {
        readySaid = true;
        duel.ready();
        hint(S.saamWaitAgain(fname));
      }
      if (fr.gone) {
        counting = true;
        countFrom = performance.now();
      }
    } else if (phase === 'count') {
      // (Saam gly: 3, 2, 1 on both phones, side by side on the still water; then GLY! and the river runs)
      const el = (performance.now() - countFrom) / 1000;
      const left = Math.ceil(COUNT_S - el);
      if (goSaid < 0) hint(null);
      if (left > 0 && left !== goSaid) {
        goSaid = left;
        go3El.textContent = String(left);
        go3El.classList.remove('on');
        void go3El.offsetWidth;
        go3El.classList.add('on');
        audio.play('click');
        haptics.tap?.();
      }
      rider.group.position.set(x, 0, 0);
      if (el >= COUNT_S) {
        go3El.textContent = S.saamGo;
        go3El.classList.remove('on');
        void go3El.offsetWidth;
        go3El.classList.add('on');
        setTimeout(() => go3El.classList.remove('on'), 800);
        // (GLY! was due a moment ago if this frame came late: the river catches up, so both rivers keep the real clock)
        const late = Math.min(1, el - COUNT_S);
        goAt = Date.now() - late * 1000;
        phase = 'run';
        phaseT = 0;
        dist += speedAt(dist, len) * late;
        runS += late;
        duelDist = dist;
        duelAt = performance.now();
        startGone = t;
        things.emit(x, 0.2, 0, 40, 2.2, 5);
        audio.play('splash');
        audio.music?.(true, { ...RIDE_MUSIC });
        hint(S.rvHintFree);
        startHint = true;
      }
    } else if (phase === 'dive') {
      // he falls from the top into the river: a splash, and he's up on his board
      const k = clamp(phaseT / DIVE, 0, 1);
      if (quick) {
        // (dropped in: onto the water from just above it, right where he rides; the river already flowing under him)
        dist += speedAt(dist, len) * dt;
        runS += dt;
        rider.group.position.y = 2.2 * (1 - k * k);
        rider.group.position.z = 0;
        rider.group.rotation.x = 0;
      } else {
        // off the top: a little hop up, then the fall (a flip on the way), into the river ahead of the tower
        const hop = Math.sin(Math.min(1, k * 3) * Math.PI) * 1.2 * (1 - k);
        rider.group.position.y = Math.max(0, (diveTop + 0.6) * (1 - k * k) + hop - 0.2);
        rider.group.position.z = START_Z * (1 - k);
        rider.group.rotation.x = -Math.PI * 2 * ease(k);
      }
      if (k >= 1) {
        phase = 'run';
        phaseT = 0;
        rider.group.position.z = 0;
        rider.group.rotation.x = 0;
        startGone = t;
        things.emit(0, 0.2, 0, 60, 2.6, 7);
        stage.shake(reduced ? 0 : 0.5);
        audio.play('splash');
        audio.music?.(true, { ...RIDE_MUSIC });
        hint(who.length ? S.rvHint : S.rvHintFree);
        startHint = true;
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
      const rap = endless ? inRapids(course, dist) : course.rapids && dist > course.rapids.from && dist < course.rapids.to;
      if (rap && !rapSaid) {
        rapSaid = true;
        pop(S.rvRapids, 1100);
        audio.play('splash');
      }
      if (endless) {
        // (the next stretch of white water ahead: the water shows it; said again each time)
        const w = rapidsWindow(course, dist - 20);
        if (w && (w.from !== rapNow?.from)) {
          rapNow = w;
          world.setRapids(w.from, w.to);
          rapSaid = false;
        }
        // your crew's island: the people you've saved go ashore as you pass it
        if (!islandSaid && dist > islandZ - 18) {
          islandSaid = true;
          if (rescued.length) {
            pop(d.town === false ? S.rvSafeIsland(rescued.length) : S.rvIslandPass(rescued.length, d.crew || ''), 1800);
            audio.play('record');
            if (rescued.length === who.length && !fwRide) fwRide = createFireworks(scene, reduced, world.night);
          }
        }
      }
      rapK += ((rap ? 1 : 0) - rapK) * Math.min(1, dt * 2.5);
      if (rapK > 0.3) stage.shake(reduced ? 0 : 0.04 * rapK);
      if (duel) {
        // (Saam gly: both rivers run on the real clock at the same speed and a knock costs no ground, so the two of
        // you ride side by side all the way (the owner: "you need to ride with eachother"); a phone that falls behind,
        // e.g. a slow frame, catches up a few metres a frame)
        runS += duelAdvance();
        dist = Math.min(duelDist, dist + 2.5);
      } else {
        runS += dt;
        // (29 Oct 2026, the owner: "if I run into an object then it lags, it doesnt feel natural": the knock's slow-down
        // came all at once and went all at once; now it dips over a tenth of a second and eases back)
        const hk = slowT > 0 ? 1 - slowT / RIVER.hitSlowS : 1;
        const dip = hk < 0.12 ? hk / 0.12 : 1 - (hk - 0.12) / 0.88 * ((hk - 0.12) / 0.88) * (3 - 2 * ((hk - 0.12) / 0.88));
        const sp = speedAt(dist, len) * (1 - (1 - RIVER.hitSlowK) * (slowT > 0 ? dip : 0)) * (1 + 0.24 * rapK) * (1 + wxSpeed);
        dist += sp * dt;
      }
      slowT = Math.max(0, slowT - dt);
      graceT = Math.max(0, graceT - dt);
      rider.setBlink(graceT > 0 && Math.floor(t * 10) % 2 === 0);
      // (the opening tip goes by itself; the lessons' and the scope's own words stay until they're done)
      if (startHint && phaseT > 7) { startHint = false; if (hintEl.textContent === (who.length ? S.rvHint : S.rvHintFree)) hint(null); }
      if (endless) {
        // (the music keeps pace with the river: a layer more early on, then faster and faster)
        const bpm = Math.round(Math.min(150, RIDE_MUSIC.bpm + (speedAt(dist, len) - PACE.start) * 2.2));
        const layers = dist > 600 ? 3 : 2;
        if (bpm !== musicNow.bpm || layers !== musicNow.layers) {
          musicNow.bpm = bpm;
          musicNow.layers = layers;
          audio.musicSet?.({ layers, bpm });
        }
      } else if (dist > len * 0.4) audio.musicSet?.({ layers: 3, bpm: RIDE_MUSIC.bpm + 6 });
      if (dist >= len - RIVER.finishRun + 10) {
        phase = 'finish';
        phaseT = 0;
        hint(null);
        audio.musicSet?.({ layers: 3 });
        if (raid && !flights.length) done();
      }
    } else if (phase === 'wipe') {
      // head over heels off the board and under; the board bobs on, slowing
      const k = clamp(phaseT / 1.2, 0, 1);
      dist += speedAt(dist, len) * dt * Math.max(0, 0.6 - k) * 0.5;
      rider.group.rotation.x = -k * Math.PI * 1.6;
      rider.group.position.y = Math.sin(k * Math.PI) * 1.4 - k * 1.6;
      if (phaseT > 0.25 && phaseT - dt <= 0.25) things.emit(x, 0.3, 0, 50, 2.4, 5, 1.3);
      if (phaseT > 1.5) done();
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
      aimX += (laneX(lane) + pullX - aimX) * (1 - Math.exp(-h * 20));
      vx += (LANE_W0 * LANE_W0 * (aimX - x) - 2 * LANE_Z * LANE_W0 * vx) * h;
      x += vx * h;
      left -= h;
    }
    leanV += (clamp(vx / 13, -1, 1) - leanV) * (1 - Math.exp(-dt * 14));
    // the jump and the duck
    if (jumpT >= 0) {
      jumpT += dt;
      if (jumpT >= JUMP_S) {
        jumpT = -1;
        things.emit(x, 0.1, 0.3, 26, 1.8, 2.4);
        audio.play('splash');
        if (t - jumpQ < 0.2) jump();
      }
    }
    if (duckT >= 0) {
      duckT += dt;
      if (duckT >= DUCK_S) duckT = -1;
    }
    const js = jumpT >= 0 ? jumpT / JUMP_S : 0;
    airY = jumpT >= 0 ? JUMP_H * 4 * js * (1 - js) : 0;
    duckK = duckT >= 0 ? Math.min(1, duckT / 0.09, (DUCK_S - duckT) / 0.14) : 0;
    if (phase === 'run') rider.group.position.y = airY;
    if (pies.length) stepPies(dt);
    if (endless && phase === 'run') {
      const km = Math.floor(dist / 1000);
      if (km > kmSaid) {
        kmSaid = km;
        pop(S.rvMilestone(km), 1200);
        audio.play('banner');
      }
    }
    if (watching) {
      duelAdvance();
      dist = duelDist;
    }
    rider.group.position.x = x;
    rider.group.visible = !watching;
    riderFoam.position.set(x, 0.03, 0.05);
    riderFoam.visible = (phase !== 'dive' || rider.group.position.y < 0.3) && airY < 0.3 && !watching;
    rider.update(dt, { lean: leanV, yaw: Math.atan2(-vx, Math.max(4, speedAt(dist, len))) * 0.8, crouch: slowT > 0 ? slowT / RIVER.hitSlowS : 0, speed: speedAt(dist, len), tuck: jumpT >= 0 ? Math.sin(js * Math.PI) : 0, duck: duckK });
    if (lamp) {
      // (from the front of his hat, aimed down the river a little towards the middle: it swings with him, not with his head)
      const hy = rider.group.position.y + rider.headY() + 0.12;
      const lx = watching ? fr.sx : x;
      lamp.position.set(lx, hy, rider.group.position.z - 0.3);
      lamp.target.position.set(lx * 0.6, 0, rider.group.position.z - 26);
      lampGlow.position.set(lx, hy, rider.group.position.z - 0.42);
      lampGlow.visible = !watching;
      world.setLamp(lamp.position, lampDir.subVectors(lamp.target.position, lamp.position), lampCol, 0.5, 0.95);
    }
    // spray off the board's tail
    if (phase === 'run' && Math.random() < 0.85) things.emit(x - leanV * 0.3, 0.12, 0.9, 1 + Math.round(rapK * 2), 0.6 + rapK, 1.4 + Math.abs(leanV) * 2 + rapK * 1.5);

    if (phase !== 'zoo') spawn();
    if (showers.length || wxK > 0 || rainbowT >= 0) updateShowers(dt);
    if (endless && dist > 8000) askElephant();
    pullNext = 0;
    for (const l of live) {
      const ahead = phase === 'zoo' ? 12 - (t % 14) : l.z - dist;
      // a drifting block crosses as you come (it's in its own lane when it's level with you)
      let lx = l.zooX ?? laneX(l.it.lane);
      if (l.drift) lx = laneX(l.it.lane) + l.drift * RIVER.laneW * ease(clamp((ahead - 4) / 46, 0, 1));
      // (the cow and her calf wade in from the side they came from as you come: where you meet them, they stand in
      // their lanes; the calf starts nearer the bank and a moment later)
      if (l.it.kind === 'ele') {
        const from = l.it.from || 1;
        const start = from * (l.it.calf ? 7.8 : 5.6);
        // (they're across by 18 m before you, and stand: the way past shows in time to take it)
        const p = ease(clamp((72 - ahead) / 54, 0, 1));
        const pk = l.it.calf ? clamp((p - 0.22) / 0.78, 0, 1) : p;
        lx = start + (laneX(l.it.lane) - start) * pk;
        l.obj.userData.walking = pk > 0.001 && pk < 0.999;
        // (the water they kick up as they walk)
        if (l.obj.userData.walking && ahead < 120 && Math.random() < (l.it.calf ? 0.25 : 0.45)) {
          const k = l.it.calf ? 0.56 : 1;
          things.emit(lx + (Math.random() - 0.5) * 3.2 * k, 0.15, -ahead + (Math.random() - 0.5) * 1.6 * k, 2, 0.8, 1.6);
        }
      }
      l.x = lx;
      const u = l.obj.userData;
      // (the animals stand or swim in the river; what floats bobs on it)
      // (30 Oct 2026: a rock stands still too, on the river bed: the owner saw rocks "vibrate")
      const still = u.kind === 'croc' || u.kind === 'hippo' || u.kind === 'ele' || l.it.kind === 'rock';
      l.obj.position.set(lx, still ? 0 : Math.sin(t * 1.9 + (u.phase || 0)) * 0.08, phase === 'zoo' ? -12 : -ahead);
      // (29 Oct 2026, the owner: the white water round a floating block "disappears as you get closer and comes back")
      // its ring lay 4 cm over the water and bobbed with it, 8 cm each way: a third of each bob under the water. It
      // stays on the water now while the block, the rock or the swimmer bobs in it
      if (u.foam) u.foam.position.y = u.foamY - l.obj.position.y;
      if (u.block && u.kind !== 'monkey') {
        // (1.22: it sways on the current instead of turning round and round: turned 40° by the time it reached you, a
        // block seemed to lie across two lanes)
        u.yaw0 ??= u.block.rotation.y;
        u.block.rotation.y = u.yaw0 + Math.sin(t * 0.8 + u.phase) * 0.09;
        u.block.rotation.z = Math.sin(t * 1.3 + u.phase) * 0.05;
        u.block.rotation.x = Math.sin(t * 1.05 + u.phase * 1.7) * 0.03;
      }
      if (u.arm && u.kind !== 'clown') u.arm.rotation.z = -0.4 + Math.sin(t * 9 + u.phase) * 0.7;
      u.update?.(t, ahead, dt);
      if (l.bite >= 0) biteStep(l, dt);
      if (phase === 'run') cues(l, ahead);
      if (u.kind === 'coins') {
        l.obj.position.y = 0;
        coinStep(l, ahead);
        continue;
      }
      if (u.kind === 'whirl') {
        l.obj.position.y = 0;
        if (phase === 'run') cueLater(l, ahead);
        whirlStep(l, ahead);
        continue;
      }
      if (u.kind === 'ele') {
        l.obj.position.y = 0;
        if (phase === 'run') cueLater(l, ahead);
      }
      if (u.kind === 'clown') {
        clownStep(l, ahead, dt);
        continue;
      }
      if (u.kind === 'log' || u.kind === 'branch') {
        // (a log lies in the water; the tree lies across at head height; both at the middle of what they cover)
        l.obj.position.set(u.kind === 'branch' ? 0 : lx, u.kind === 'log' ? Math.sin(t * 1.7 + u.phase) * 0.05 : 0, -ahead);
        if (u.kind === 'log') l.obj.rotation.z = Math.sin(t * 1.3 + u.phase) * 0.03;
        if (phase === 'run') teach(l, ahead);
        if (l.done || phase !== 'run') continue;
        if (Math.abs(ahead) < u.d / 2 + 0.45 && Math.abs(l.x - x) < u.w / 2 + HIT_R * 0.4) {
          l.done = true;
          if (lesson?.l === l && lesson.kind === (u.kind === 'log' ? 'jump' : 'duck') && !(u.kind === 'log' ? airY > LOG_TOP - 0.2 : duckK > 0.5)) endLesson();
          const clear = u.kind === 'log' ? airY > LOG_TOP - 0.2 : duckK > 0.5 && airY < 0.3;
          if (clear) cleared(l);
          else if (graceT <= 0) knock(l);
        }
        continue;
      }
      if (l.done || phase !== 'run') continue;
      if (Math.abs(ahead) < (u.d || 1.4) / 2 + 0.5) {
        const dx = Math.abs(l.x - x);
        const reach = (u.w || 2.4) / 2 + HIT_R;
        if (l.it.kind === 'person') {
          if (dx < GRAB_R) grab(l);
        } else if (l.it.kind === 'block' && dx < reach && airY > (u.top || 1) - 0.25) {
          // (30 Oct 2026, the owner: "People moan that they cant jump over these blocks": a jump clears a floating block
          // that isn't too tall for it, as it clears a log)
          l.done = true;
          cleared(l);
          pop(S.rvOver, 600);
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
    // (the whirlpools' pull, eased: it grows on you and lets go)
    pullX += (pullNext - pullX) * (1 - Math.exp(-dt * 6));
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].z < dist - BEHIND) {
        despawn(live[i]);
        live.splice(i, 1);
      }
    }
    // the island ahead, in the lake; your tower behind, at the river's head (Saturday: the four crews' islands)
    island.group.position.set(islandX, -0.6, -(islandZ - dist));
    island.update(t);
    for (const isle of isles) {
      isle.group.position.set(isle.side * 22, 0, -(isle.z - dist));
      isle.group.rotation.y = -isle.side * Math.PI / 2;
      isle.island.update(t);
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
        // (the crew's name in the scope's readout; its tag on the tower fades so the scope sits clear)
        const nm = R?.rows?.find((x) => x.id === tgt.crew)?.name || '';
        scopeRng.textContent = `${nm ? `${nm} · ` : ''}${Math.round(tgt.z - dist)} m`;
      } else {
        scopeEl.classList.remove('on', 'lock');
      }
      for (const is of isles) {
        const want = is === tgt && aiming ? 0 : 1;
        if (is.tag.material) {
          is.tag.material.transparent = true;
          is.tag.material.opacity += (want - is.tag.material.opacity) * Math.min(1, dt * 10);
          is.tag.visible = is.tag.material.opacity > 0.03;
        }
      }
      fireEl.classList.toggle('show', phase === 'run');
      popEl.classList.toggle('low', aiming);   // (the words that pop up go under the scope while it's up)
      fireEl.classList.toggle('off', !aiming);
      fireEl.classList.toggle('pulse', aiming && !thrown);
      if (tgt && !P) P = towerPoint(tgt, 0, Math.max(2, Math.min(18, (tgt.island.top - 3.6) * 0.5)));
      rider.aim(P ? P.clone().sub(rider.muzzle(_aimFrom)) : _ahead);
    }
    // (your tower stays upstream: behind the camera once you ride)
    start.group.position.set(0, -0.6, dist + START_Z);
    if (barEl) barEl.style.width = `${clamp(dist / (len - RIVER.finishRun), 0, 1) * 100}%`;
    if (metresEl && !watching) {
      const m = fmtInt(Math.floor(dist));
      if (metresEl.textContent !== m) metresEl.textContent = m;
    }
    if (fr) {
      stepFriend(dt);
      // (yours to them, a few times a second while you ride)
      if (phase === 'run' && (sendT -= dt) <= 0) {
        sendT = 1 / STATE_HZ;
        sentAt = performance.now();
        duel.send({ t: 'st', d: Math.round(dist * 10) / 10, x: Math.round(x * 100) / 100, a: Math.round((laneX(lane) + pullX) * 100) / 100, y: Math.round(airY * 100) / 100, k: Math.round(duckK * 100) / 100, l: Math.round(leanV * 100) / 100, h: hearts });
      }
    }
    world.update(dist, t, phase === 'dive' ? null : x);
    if (pipes) stepPipes();
    // (the shadows follow the action: your tower while you dive, the river just ahead while you ride)
    if (phase === 'dive' && !quick) world.setShadowFocus(0, START_Z * 0.5, 46);
    else world.setShadowFocus(x * 0.6, raid ? -40 : -24, raid ? 60 : 40);
    things.updateSpray(dt);
    fwRide?.update(dt, Math.max(24, towerTop() + 6), island.group.position);
    cameraFor(dt);
  }
  // (tests: ?zoo=1, the animals side by side in front of a still camera)
  if (d.zoo) {
    phase = 'zoo';
    rider.group.visible = false;
    start.group.visible = false;
    // (tests: ?zoo=ele, the elephant cow and her calf instead)
    const kinds = d.zoo === 'ele' ? [] : [['croc', -3.4], ['hippo', 0], ['monkey', 3.4]];
    if (d.zoo === 'ele') {
      loadModels(['elephant']).then((m) => {
        if (!alive || !m?.elephant) return;
        if (d.models) d.models.elephant = m.elephant;
        for (const [calf, lane] of [[false, 0], [true, 2]]) {
          const it = { kind: 'ele', lane, from: 1, calf };
          const obj = beasts.elephant({ from: 1, calf });
          scene.add(obj);
          live.push({ it, row: { z: 12 }, obj, z: 12, x: laneX(lane), done: true, drift: 0 });
        }
      }).catch(() => {});
    }
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
    // (a lesson: the river slows as the log (the tree) comes, and stands nearly still just where a jump (a duck) now
    // clears it, until you swipe; then it's back to full speed at once)
    let want = 1;
    if (lesson && !lesson.done) {
      const a = lesson.l.z - dist;
      const ideal = speedAt(dist, len) * (lesson.kind === 'jump' ? 0.3 : 0.16) + 1;
      want = a <= ideal ? 0.015 : Math.min(0.45, 0.015 + 0.45 * (a - ideal) / (ideal * 2.5));
    }
    // (the first whirlpool, the first elephants: the river slows while they're near, so you see what they do)
    if (soft) {
      const a = soft.l.z - dist;
      if (a > 3 && a < 55) want = Math.min(want, 0.42);
    }
    timeK += (want - timeK) * Math.min(1, dt * (want < timeK ? 7 : 14));
    if (resumeT > 0 && !paused && !duel) {
      // (the count after a pause: the river waits, 2, 1, then runs on)
      const left = Math.ceil(resumeT);
      if (left !== resumeSaid) {
        resumeSaid = left;
        go3El.textContent = String(left);
        go3El.classList.remove('on');
        void go3El.offsetWidth;
        go3El.classList.add('on');
        audio.play('click');
        haptics.tap?.();
      }
      resumeT -= dt;
      if (resumeT <= 0) { resumeT = 0; go3El.classList.remove('on'); }
    } else if (!paused || duel) step(dt * timeK);   // (Saam gly: the friend's river doesn't stop, so neither does yours)
    world.reflect(stage.renderer, camera);
    stage.render(dt);
  }

  // ---------------------------------------------------------------------------------------------- the end
  let fwRide = null;
  let rankNow = null;
  /** Afgly's daily ranking on the card: your place today and a way to the list (it comes when the server answers). */
  function setRank(board) {
    if (!endless || !board?.you) return;
    rankNow = board;
    const el = cardEl.querySelector('.rv-rank');
    if (!el) return;
    el.innerHTML = `${S.rvRank(board.you.rank, board.players)} <button class="rv-ranklist">${S.rvRankList}</button>`;
    el.classList.add('on');
    el.querySelector('.rv-ranklist').addEventListener('click', openBoard);
  }
  /** Today's top ten down the river, your own place under it when you're not in it. */
  async function openBoard() {
    const panel = ov.querySelector('.rv-board');
    panel.innerHTML = `<div><h3>${S.rvBoardTitle}</h3><p class="rv-board-wait">…</p><button class="rv-board-x">${S.rvDone}</button></div>`;
    panel.classList.add('on');
    panel.querySelector('.rv-board-x').addEventListener('click', () => panel.classList.remove('on'));
    const b = (await d.getBoard?.()) || rankNow;
    if (!alive || !panel.classList.contains('on')) return;
    const rows = (b?.top || []).map((x) => `<li class="${x.you ? 'me' : ''}"><span>${x.rank === 1 ? '🥇' : x.rank === 2 ? '🥈' : x.rank === 3 ? '🥉' : `${x.rank}.`} ${esc(x.name)}${x.you ? ` <i>(${S.rvYou})</i>` : ''}</span><b>${fmtInt(x.m)} m</b></li>`).join('');
    const mine = b?.you && !b.top.some((x) => x.you) ? `<li class="me gap"><span>${b.you.rank}. ${S.rvYou}${b.you.hidden ? ' 🙈' : ''}</span><b>${fmtInt(b.you.m)} m</b></li>` : '';
    panel.querySelector('div').innerHTML = `<h3>${S.rvBoardTitle}</h3>${rows ? `<ol>${rows}${mine}</ol><p class="rv-board-n">${S.rvBoardPlayers(b.players)}</p>` : `<p class="rv-board-wait">${S.rvBoardNone}</p>`}<button class="rv-board-x">${S.rvDone}</button>`;
    panel.querySelector('.rv-board-x').addEventListener('click', () => panel.classList.remove('on'));
  }
  /** The Saturday shots this ride earns: 1 per 100 m (with the week's earlier rides), up to what the week still has room for. */
  const shotsEarned = (m) => {
    if (!d.shots?.day) return 0;
    const w = d.shots.riverWeek | 0;
    return Math.max(0, Math.min(d.shots.room | 0, Math.floor((w + m) / 100) - Math.floor(w / 100)));
  };
  const result = () => ({ rescued: [...rescued], missed: who.filter((id) => !rescued.includes(id)), hits, all: rescued.length === who.length && who.length > 0, metres: Math.floor(dist), durationMs: Math.round((runS + (phase === 'dive' ? 0 : 2)) * 1000) });
  /** The coins of this ride into the wallet (once), and the card's line: what went in, and the day's limit if it's met. */
  let coinPaid = null;
  function coinLine() {
    if (!coinsGot) return '';
    if (!coinPaid) coinPaid = d.onCoins?.(coinsGot) || { added: coinsGot };
    const added = coinPaid.added | 0;
    return `<p class="rv-coinline"><i class="rv-coin-ic"></i><span>${esc(added < coinsGot ? S.rvCoinsCapped(fmtInt(added)) : S.rvCoinsGot(fmtInt(added)))}</span></p>`;
  }
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
    lastR = r;
    if (duel) {
      // (Saam gly: your metres, theirs (or how far they are now, the camera with them), who won, again together)
      myEndM = r.metres;
      if (sentEnd !== r.metres) {
        sentEnd = r.metres;
        duel.send({ t: 'end', m: r.metres });
      }
      cardEl.innerHTML = `<div class="rv-dist"><b>${fmtInt(r.metres)}</b><small>m</small></div>${coinLine()}<h2 class="rv-win"></h2><p class="rv-vsline"></p><p class="rv-rank"></p>
        <button class="rv-go rv-again">${S.saamAgain}</button><button class="rv-no">${S.rvDone}</button>`;
      if (rankNow) setRank(rankNow);
      cardEl.classList.add('on');
      const again = cardEl.querySelector('.rv-again');
      again.addEventListener('click', () => {
        if (again.disabled) return;
        again.disabled = true;
        again.textContent = S.saamWaitAgain(fname);
        d.onDone?.(r, 'again');
      });
      cardEl.querySelector('.rv-no').addEventListener('click', () => d.onDone?.(r, 'done'));
      watching = fr.seen && !fr.out && !fr.gone;
      hint(null);
      paintDuel();
      d.onResult?.(r);
      return;
    }
    if (r.all) audio.play('record'); else audio.play('banner');
    // (everyone saved: fireworks over the island, the way the winners get them on Saturday)
    if (r.all && !fwRide) fwRide = createFireworks(scene, reduced, world.night);
    const mine = Math.min(d.mine ?? who.length, who.length);
    const yours = rescued.filter((id) => who.indexOf(id) < mine).length;
    // (a free ride has nobody of yours in it: just the metres, the shots, and straight back in)
    const free = who.length === 0;
    const best = Math.max(d.best | 0, r.metres);
    const record = endless && r.metres > (d.best | 0) && (d.best | 0) > 0;
    const distHtml = endless ? `<div class="rv-dist"><b>${fmtInt(r.metres)}</b><small>m</small></div><p class="rv-distline">${record ? S.rvRecord : S.rvDistance}${d.best && !record ? ` · ${S.rvBest(fmtInt(best))}` : ''}</p>${coinLine()}` : '';
    const shotsHtml = endless && d.shots?.day ? `<p class="rv-shots">${shotsEarned(r.metres) > 0 ? S.rvShots(shotsEarned(r.metres)) : d.shots.room <= 0 ? S.rvShotsFull(d.shots.max || 10) : S.rvShotsNext(100 - ((d.shots.riverWeek + r.metres) % 100))}</p>` : '';
    const peopleHtml = free ? '' : `<h2>${r.rescued.length ? S.rvSaved(r.rescued.length, who.length) : S.rvNoneSaved}</h2>
      <p>${r.rescued.length ? (d.town === false ? S.rvSafeOut(r.rescued.length) : S.rvMovedIn(r.rescued.length, d.crew || '')) : S.rvTryTomorrow}${mine && yours < mine ? ` ${S.rvYoursLeft(mine - yours)}` : ''}</p>
      <div class="rv-row">${who.map((id) => `<img src="${faceUrl(id, 64)}" alt="" class="${rescued.includes(id) ? '' : 'out'}">`).join('')}</div>`;
    const btnsHtml = free
      ? `<button class="rv-go rv-again">${S.rvAgain}</button><button class="rv-no">${S.rvDone}</button>`
      : `${d.canBuild ? `<button class="rv-go">${S.rvBuild}</button><button class="rv-no">${S.rvLater}</button>` : `<button class="rv-go">${S.rvDone}</button>`}${endless ? `<button class="rv-link rv-again">${S.rvAgain}</button>` : ''}`;
    cardEl.innerHTML = `${distHtml}<p class="rv-rank"></p>${peopleHtml}${shotsHtml}${btnsHtml}`;
    if (endless && rankNow) setRank(rankNow);
    cardEl.classList.add('on');
    if (free) cardEl.querySelector('.rv-go').addEventListener('click', () => d.onDone?.(r, 'again'));
    else cardEl.querySelector('.rv-go').addEventListener('click', () => d.onDone?.(r, d.canBuild ? 'build' : 'done'));
    cardEl.querySelector('.rv-no')?.addEventListener('click', () => d.onDone?.(r, 'done'));
    cardEl.querySelector('.rv-link.rv-again')?.addEventListener('click', () => d.onDone?.(r, 'again'));
    d.onResult?.(r);
  }
  function finishNow() {
    // "Los dit": the ride ends here, with whoever was saved
    pausedEl.classList.remove('on');
    paused = false;
    audio.resume?.();
    for (const l of live) l.done = true;
    endLesson();
    if (endless && (phase === 'dive' || phase === 'run' || phase === 'wipe')) {
      phaseT = 2;
      done();
      return;
    }
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
  const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap'];
  /** Every kind of thing the river brings, put out once out of sight so its shaders compile now (no stutter mid-ride). */
  const warmMats = [];   // (their own materials stay until the ride closes: freed while still compiling, WebGL complains)
  async function warmUp() {
    performance.mark?.('rv:prewarm');
    const tmp = new THREE.Group();
    const skin = d.skin || 'kleur';
    try {
      const blk = things.floating({ shape: 'cube', skin, color: 0, spin: 0 });
      const kinds = [beasts.croc(1), beasts.hippo(), things.rock(), things.person(who[0] || 'boer', 0), things.floating({ shape: 'plank', skin, color: 1 }), beasts.monkeyOn(blk, 1, blk.userData.top)];
      if (endless) kinds.push(hz.log(1), hz.log(3), hz.branch(), hz.clown(1), hz.pie(), hz.whirl(), world.rain());
      kinds.forEach((o, i) => { o.position.set(i * 3 - 8, 0, -30); tmp.add(o); });
      if (raid) {
        const jm = new THREE.Mesh(jetGeometry(new THREE.Vector3(0, 1, -5), new THREE.Vector3(0, 5, -40), 1), jetMat);
        tmp.add(jm);
        tmp.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex, transparent: true, depthWrite: false })));
      }
      // (in three goes, a breath between: the river and its rider, the animals and blocks, the later things)
      if (stage.renderer.compileAsync) {
        const later = [...tmp.children];
        for (const o of later) tmp.remove(o);
        scene.add(tmp);
        await stage.renderer.compileAsync(scene, camera);
        for (const part of [later.slice(0, 6), later.slice(6)]) {
          await new Promise((res) => requestAnimationFrame(res));
          for (const o of part) tmp.add(o);
          await stage.renderer.compileAsync(scene, camera);
        }
        // (30 Oct 2026: and him blinking, as after a knock: his see-through look (two passes a part) was built at the
        // first knock, eight shaders at once on the phone just as he was hit)
        rider.setBlink?.(true);
        await stage.renderer.compileAsync(scene, camera);
        rider.setBlink?.(false);
        // (30 Oct 2026, the owner: "Yes please fix it": on the strongest phones the water mirrors the river, drawn into a
        // picture of its own first, and three draws into a picture with other shaders (no tone mapping): each thing's
        // mirror shaders were built mid-ride the first time it showed in the water, a hippo, a log, him blinking (nine on
        // the hail route). Built now for the mirror too, plain and blinking; the programs are made in the call itself,
        // so the screen is drawn to again before the wait)
        const rt = world.reflTarget?.(stage.renderer);
        for (const blink of rt ? [false, true] : []) {
          rider.setBlink?.(blink);
          const prev = stage.renderer.getRenderTarget();
          stage.renderer.setRenderTarget(rt);
          const ready = stage.renderer.compileAsync(scene, camera);
          stage.renderer.setRenderTarget(prev);
          await ready;
        }
        rider.setBlink?.(false);
      }
      // (in parallel where the phone can: the screen keeps moving while the shaders compile; the owner, 25 Oct 2026: "if I
      // log in then the screen freezes for a second or two, just on river run")
      if (!stage.renderer.compileAsync) {
        scene.add(tmp);
        stage.renderer.compile(scene, camera);
        rider.setBlink?.(true);
        stage.renderer.compile(scene, camera);
        rider.setBlink?.(false);
        const rt = world.reflTarget?.(stage.renderer);
        if (rt) {
          const prev = stage.renderer.getRenderTarget();
          stage.renderer.setRenderTarget(rt);
          stage.renderer.compile(scene, camera);
          rider.setBlink?.(true);
          stage.renderer.compile(scene, camera);
          rider.setBlink?.(false);
          stage.renderer.setRenderTarget(prev);
        }
      }
      // (30 Oct 2026: their pictures go up to the graphics chip now as well, the island's and the clown's too: on a phone
      // the first sight of a new thing waited for that mid-ride, one of the stalls of up to a third of a second the
      // owner filmed)
      const seen = new Set();
      scene.traverse((o) => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
          for (const k of TEX_KEYS) {
            const tx = m[k];
            if (tx?.isTexture && !seen.has(tx)) { seen.add(tx); stage.renderer.initTexture(tx); }
          }
        }
      });
    } catch (e) {
      console.warn?.('[rivier] warm-up', e?.message);
    }
    scene.remove(tmp);
    tmp.traverse((c) => {
      const ms = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
      for (const m of ms) if (!m.userData?.model && !m.userData?.shared && m !== jetMat && !warmMats.includes(m)) warmMats.push(m);
      if (c.geometry && !c.geometry.userData?.model && !c.geometry.userData?.shared) warmGeos.push(c.geometry);
    });
  }
  const warmGeos = [];
  const ready = (async () => {
    // a first frame before it shows (the shaders compile behind the river's cover); a breath between the building and the
    // compiling, so neither holds the screen long
    await new Promise((res) => requestAnimationFrame(res));
    await warmUp();
    performance.mark?.('rv:warm');
    if (!alive) return;
    // (the last ride's materials: their programs are this ride's now)
    for (const m of retired.splice(0)) m.dispose();
    place();   // (the window may have changed while it loaded)
    stage.render(0);
    performance.mark?.('rv:frame');
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
    for (const c of showers.splice(0)) dropShower(c);
    sideMq?.removeEventListener?.('change', onSide);
    host.removeEventListener('pointerdown', onDown);
    host.removeEventListener('pointermove', onMoveP);
    host.removeEventListener('pointerup', onUp);
    host.removeEventListener('pointercancel', onCancel);
    for (const l of live) despawn(l);
    live.length = 0;
    scene.remove(rider.group, riderFoam, island.group, start.group, things.spray);
    // (everything this ride made goes from the graphics chip; the models and block pieces stay for the next. Its
    // materials wait in `retired` for the next ride's warm-up; the shapes and pictures go now)
    const disposeMat = THREE.Material.prototype.dispose;
    THREE.Material.prototype.dispose = function () { retired.push(this); };
    try {
      const done = new Set();
      for (const isle of isles) {
        scene.remove(isle.group);
        isle.island.dispose();
        disposeTree(isle.group, done);
      }
      for (const f of flights) { scene.remove(f.mesh); disposeTree(f.mesh, done); }
      for (const b of debris) { scene.remove(b.g); disposeTree(b.g, done); }
      if (fr) {
        offDuel?.();
        scene.remove(fr.rider.group, fr.foam);
        disposeTree(fr.rider.group, done);
      }
      for (const root of [rider.group, start.group, island.group]) disposeTree(root, done);
      for (const fx of flashes) { scene.remove(fx.fl); fx.fl.material.dispose(); }
      for (const m of warmMats) m.dispose();
      for (const g of new Set(warmGeos)) g.dispose();
      burstTex.dispose();
      jetMat.dispose();
      for (const pp of pies) { scene.remove(pp.mesh, pp.shadow); pp.shadow.material.dispose(); disposeTree(pp.mesh, done); }
      pieShadowGeo.dispose();
      pieShadowMat.dispose();
      pieShadowTex.dispose();
      // (out of the scene too: the next ride draws in the same one)
      if (pipes) { scene.remove(pipes); pipes.geometry.dispose(); pipes.material.map.dispose(); pipes.material.dispose(); pipes.dispose(); }
      if (lampGlow) { scene.remove(lamp, lamp.target, lampGlow); lampGlow.material.map.dispose(); lampGlow.material.dispose(); lamp.dispose(); }
      hz.dispose();
      fwRide?.dispose();
      if (raid) setBend(1);
      camera.fov = FOV0;
      camera.updateProjectionMatrix();
      audio.setAmbience?.(ambBefore);
      island.dispose();
      beasts.dispose();
      things.dispose();
      world.dispose();
      // (the block looks this screen painted: the most recent stay for the next, the rest go off the graphics chip)
      pieces.trim?.(24);
    } finally {
      THREE.Material.prototype.dispose = disposeMat;
    }
    ov.innerHTML = '';
    host.style.display = 'none';
    if (current === api) current = null;
  }

  const api = {
    ready, close,
    /** Stapel re-fitted its canvas (main.js relayout): the box goes over it again. */
    fit: place,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    /**
     * (28 Oct 2026, found on the emulator: Back did nothing once the ride was over) Android's Back, one step at a time:
     * the open ranking shut, then the end card's own way out (Klaar / Later: `.rv-no`; where a card has only one
     * button, `.rv-go` is its Klaar), a pause lifted, else a pause.
     */
    back: () => {
      const board = ov.querySelector('.rv-board.on');
      if (board) { board.classList.remove('on'); return; }
      if (phase === 'done') {
        (cardEl.querySelector('.rv-no') || cardEl.querySelector('.rv-go'))?.click();
        return;
      }
      setPaused(!paused);
    },
    /** For tests: where the ride stands. */
    state: () => ({ phase, q: stage.quality?.name, dist: Math.round(dist * 10) / 10, len, endless, hearts, airY: Math.round(airY * 100) / 100, duckK: Math.round(duckK * 100) / 100, timeK: Math.round(timeK * 100) / 100, lesson: lesson && !lesson.done ? lesson.kind : null, pies: pies.length, clowns: live.filter((l) => l.obj.userData.kind === 'clown').map((l) => ({ z: Math.round(l.z * 10) / 10, x: Math.round(l.obj.position.x * 100) / 100, phase: l.cs?.phase, foot: Math.round((world.footAt?.(l.obj.userData.side || 1, l.z) ?? 0) * 100) / 100 })), pieAt: pies.map((pp) => { const v = pp.mesh.getWorldPosition(new THREE.Vector3()).project(camera); return { t: Math.round(pp.t * 100) / 100, x: Math.round(v.x * 100) / 100, y: Math.round(v.y * 100) / 100, z: Math.round(v.z * 1000) / 1000 }; }), headY: rider.headY?.(), lane, x: Math.round(x * 1000) / 1000, rescued: [...rescued], hits, lastKnock, who: [...who], live: live.length, paused, raid, bombsLeft, thrown, bombHits, bombLost: Math.round(bombLost * 10) / 10, aiming, aimV: Math.round(aimV * 100) / 100, onTarget, isles: isles.map((i) => ({ crew: i.crew, target: i.target, h: Math.round((i.island.top - 3.6) * 10) / 10, z: i.z })),
      coins: coinsGot,
      // (tests: the white water rings on the river now, and the lowest one's height over the water: never under it)
      foams: live.filter((l) => l.obj.userData.foam).length,
      foamLow: Math.round(Math.min(9, ...live.filter((l) => l.obj.userData.foam).map((l) => l.obj.position.y + l.obj.userData.foam.position.y)) * 1000) / 1000,
      // (29 Oct 2026: the rocks' rings too, his photo of near rocks without one)
      foamRocks: live.filter((l) => l.obj.userData.foam && l.it.kind === 'rock').length,
      foamLowRock: Math.round(Math.min(9, ...live.filter((l) => l.obj.userData.foam && l.it.kind === 'rock').map((l) => l.obj.position.y + l.obj.userData.foam.position.y)) * 1000) / 1000,
      coinLines: live.filter((l) => l.it.kind === 'coins').map((l) => ({ lane: l.it.lane, x: Math.round(l.x * 10) / 10, a: Math.round((l.z + (l.it.dz || 0) - dist) * 10) / 10, y: l.it.y, n: l.it.n, gem: !!l.it.gem, left: l.obj.userData.coins.filter((c) => !c.taken).length })),
      deep: live.filter((l) => l.it.kind === 'whirl' || l.it.kind === 'ele').map((l) => ({ k: l.it.kind, calf: !!l.it.calf, lane: l.it.lane, x: Math.round(l.x * 10) / 10, a: Math.round((l.z - dist) * 10) / 10, done: l.done, model: !!d.models?.elephant })), pullX: Math.round(pullX * 100) / 100, hint: hintEl.textContent, soft: !!soft,
      duel: fr ? { seen: fr.seen, d: Math.round(fr.sd * 10) / 10, x: Math.round(fr.sx * 100) / 100, out: fr.out, endM: fr.endM, gone: fr.gone, watching, counting, goAt, hits, shown: fr.rider.group.visible, tag: tagText, round: duel.round, way: { clips: wayLog.clips, kos: wayLog.kos, offMe: wayLog.offMe, offFr: wayLog.offFr, frames: wayLog.frames, kinds: wayLog.kinds.slice(0, 6), maxV: Math.round(wayLog.maxV * 10) / 10, flips: wayLog.flips, guesses: wayLog.guesses, wrong: wayLog.wrong, dodging: !!fr.dodge, up: !!fr.pj, y: Math.round((fr.rider.group.position.y) * 100) / 100, tx: Math.round(fr.tx * 100) / 100, wx: Math.round((fr.dodge ? fr.dodge.x : fr.tx) * 100) / 100, off: Math.round(fr.off * 100) / 100, me: Math.round(x * 100) / 100 } } : null }),
    autopilot(on) { pilotOn = !!on; },
    /** For tests (Saturday): where on screen (host px) the tallest tower stands at a share of its height, or null. */
    towerScreen(frac = 0.5) {
      const isle = targetIsle();
      if (!isle) return null;
      const v3 = towerPoint(isle, 0, Math.max(2, isle.island.top - 3.6) * frac).project(camera);
      return { x: (v3.x * 0.5 + 0.5) * host.clientWidth, y: (-v3.y * 0.5 + 0.5) * host.clientHeight, ahead: isle.z - dist };
    },
    /** For tests: the ride jumps to course z (what's before it is gone; the dive is skipped). */
    footAt: (side, z) => world.footAt?.(side, z),
    jumpTo(z) {
      for (const l of live) despawn(l);
      live.length = 0;
      dist = Math.max(0, z);
      if (endless) course.extend(dist + 1600);
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
    jump,
    duck,
    skip: finishNow,
    /** For tests: the 3D scene and camera. */
    get scene() { return scene; },
    get camera() { return camera; },
    get stage() { return stage; },
    /** Afgly's daily ranking for this ride (the server's answer): your place on the card. */
    setRank,
    /** For tests: what the graphics chip holds now ({ geometries, textures, programs }). */
    gpu: () => ({ ...stage.renderer.info.memory, programs: stage.renderer.info.programs?.length | 0 }),
    /** For tests (30 Oct 2026): the River's world (the water's settings, the sun, its parts: the hunt for the line). */
    world: () => world,
    /** For tests (30 Oct 2026): the river's half width and where the noodles float at course metre z. */
    widthAt: (z) => ({ half: Math.round(world.halfAt(z) * 100) / 100, pipe: Math.round(pipeX(z) * 100) / 100 }),
    /** For tests (30 Oct 2026): the shader programs built so far, by name (which ones a ride still compiles mid-way). */
    programNames: (keys) => (stage.renderer.info.programs || []).map((g) => keys ? `${g.name}#${g.id} ${g.cacheKey}` : `${g.name}#${g.id}`),
    /** For tests (30 Oct 2026): which things draw with program `id` now (a material's type and name, its object's line). */
    programUsers(id) {
      const out = [];
      scene.traverse((o) => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
          if (stage.renderer.properties.get(m).currentProgram?.id !== id) continue;
          const line = [];
          for (let q = o; q && line.length < 4; q = q.parent) line.push(q.name || q.type);
          const holder = live.find((l) => { let q = o; while (q && q !== l.obj) q = q.parent; return !!q; });
          out.push(`${m.type}:${m.name || '-'} #${m.color?.getHexString?.() || ''} ${o.geometry?.type || ''} on ${line.join('<')}${holder ? ` (${holder.it.kind})` : ''}`);
        }
      });
      return [...new Set(out)].slice(0, 6);
    },
    /** For tests (30 Oct 2026): where he shows across the screen, 0 (left edge) to 1 (right edge): his box's two sides. */
    riderOnScreen() {
      const b = new THREE.Box3();
      rider.group.updateMatrixWorld(true);
      rider.group.traverseVisible((o) => {   // (what shows: not Saturday's cannon)
        if (!o.isMesh || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      });
      const xs = [];
      const cz = (b.min.z + b.max.z) / 2;   // (across his middle: the board's near end would widen it)
      for (const px of [b.min.x, b.max.x]) for (const py of [b.min.y, b.max.y]) xs.push(new THREE.Vector3(px, py, cz).project(camera).x);
      return { min: Math.round((Math.min(...xs) + 1) * 500) / 1000, max: Math.round((Math.max(...xs) + 1) * 500) / 1000, lane, dist: Math.round(dist) };
    },
  };
  return api;
}
void BANK;
