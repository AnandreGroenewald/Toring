// (1.16 redesign, the owner 16 Oct 2026: "If I choose the block the it automatically puts it in the first empty space instead
// of where I want it. It feels like its a 2 year olds game. Please redesign it.") The Living Tower's floors: every block is a
// floor of a building, three rooms side by side, and every room is its own place: you put a person in the room you choose,
// and you aim at one room. A room is drawn in layers so each part changes on its own: the room behind the glass (walls,
// furniture, the lamp), the lights (off where nobody lives), the person, the blinds (the other side's rooms, every one
// alike), the window's frame and glass in front, broken glass after a hit, a burnt-out room after a fire, what a miss heard
// next door, and the glow while you drag someone over it or aim at it. The textures are drawn at 2x for the close-up camera.

import { floorTexture } from './blocks.js';
import { TRIBES, portraitOf } from './residents.js';

export const FLOOR = { w: 300, h: 96 };
export const ROOM = { w: 74, h: 58 };
export const COLS = 3;
/** Room `col`'s centre, from the floor's centre (world units). */
export const roomCenter = (col) => ({ x: (col - 1) * 93, y: 3 });
export const FLOOR_SKIN = { vuur: 'lawa', water: 'ys', gras: 'mos' };
// each tribe's two colours of its block skin, alternating floor by floor (one building, not a rainbow)
const FLOOR_COLORS = { vuur: [7, 1], water: [6, 2], gras: [3, 0] };
export const K = 2;   // texture pixels per world unit
const RW = ROOM.w * K;
const RH = ROOM.h * K;

// the rooms' colours: a lamp-lit home in each tribe's own colours
const HOME = {
  vuur: { wall: '#b5603a', wallL: '#ffd59c', wallD: '#4a1d10', floor: '#4f2a17', floorL: '#86502c', rug: '#c23a24', rugL: '#ff8a4c', frame: ['#463a33', '#1c1613', '#8a6c58'], slat: '#efd3b0', rail: '#6d2a19' },
  water: { wall: '#2c6f86', wallL: '#ffe3ae', wallD: '#0f2f3d', floor: '#463d37', floorL: '#7b6a5c', rug: '#1f86c9', rugL: '#8fdcff', frame: ['#f6fbff', '#9fb6c6', '#ffffff'], slat: '#d9ebf1', rail: '#3a6f8f' },
  gras: { wall: '#677f45', wallL: '#ffe7a8', wallD: '#223018', floor: '#563820', floorL: '#8f6236', rug: '#3c8f33', rugL: '#bfe878', frame: ['#a8703a', '#5f3a1b', '#d9a466'], slat: '#ece6bf', rail: '#4d6a2a' },
};
export const VARIANTS = 5;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function canvas(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const ctx = tex.getContext();
  draw(ctx, w, h);
  tex.refresh();
  return key;
}
function rand(seed) {
  let s = seed >>> 0 || 7;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------------------------------------------------------------------------------------------- the floor (facade)
/** The facade of a tribe's floor number `i` (its block skin's material at 2x). Returns { key, scale }. */
export function facadeKey(scene, tribe, i) {
  const c = (FLOOR_COLORS[tribe] || [0, 1])[i % 2];
  const skin = FLOOR_SKIN[tribe] || 'kleur';
  return { key: floorTexture(scene, `lt_floor_${skin}_${c}`, skin, c, K), scale: 1 / K };
}

// ---------------------------------------------------------------------------------------------- a room: inside
/** The lamp of each room variant (texture px): where the light comes from. */
const LAMP = [[38, 22], [126, 34], [74, 8], [110, 26], [28, 30]];
function furniture(ctx, v, c, r) {
  const shade = 'rgba(20,10,4,0.55)';
  ctx.save();
  if (v === 0) {
    // a framed picture (a landscape) and the arm of a sofa
    ctx.fillStyle = '#3a2516';
    rr(ctx, 10, 22, 32, 26, 2);
    ctx.fill();
    const sky = ctx.createLinearGradient(0, 25, 0, 45);
    sky.addColorStop(0, '#ffcf8a');
    sky.addColorStop(1, '#d8743f');
    ctx.fillStyle = sky;
    ctx.fillRect(13, 25, 26, 20);
    ctx.fillStyle = '#5a3a2a';
    ctx.beginPath(); ctx.moveTo(13, 45); ctx.lineTo(22, 35); ctx.lineTo(29, 41); ctx.lineTo(39, 33); ctx.lineTo(39, 45); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade;
    rr(ctx, 114, 70, 40, 26, 8);
    ctx.fill();
    ctx.fillStyle = c.rug;
    rr(ctx, 116, 66, 36, 14, 6);
    ctx.fill();
  } else if (v === 1) {
    // a bookshelf and a floor lamp
    ctx.fillStyle = '#3b2414';
    ctx.fillRect(2, 16, 30, 78);
    const books = ['#e8452c', '#ffd23f', '#3f8fd6', '#f2f2f2', '#3fae3a', '#b45cff', '#ff8a4c'];
    for (let sh = 0; sh < 4; sh++) {
      const y = 20 + sh * 19;
      ctx.fillStyle = '#24150b';
      ctx.fillRect(2, y + 15, 30, 3);
      let x = 5;
      while (x < 29) {
        const bw = 2 + Math.floor(r() * 3);
        ctx.fillStyle = books[Math.floor(r() * books.length)];
        ctx.fillRect(x, y + 2 + Math.floor(r() * 3), bw, 13);
        x += bw + 1;
      }
    }
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(126, 40); ctx.lineTo(126, 94); ctx.moveTo(118, 94); ctx.lineTo(134, 94); ctx.stroke();
    ctx.fillStyle = '#fff1c9';
    ctx.beginPath(); ctx.moveTo(116, 40); ctx.lineTo(136, 40); ctx.lineTo(132, 28); ctx.lineTo(120, 28); ctx.closePath(); ctx.fill();
  } else if (v === 2) {
    // a round mirror and a big plant
    ctx.strokeStyle = '#c9a25a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(22, 40, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.arc(22, 40, 10.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a4a2a';
    rr(ctx, 120, 78, 22, 16, 3);
    ctx.fill();
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.38;
      const len = 26 + r() * 18;
      ctx.save();
      ctx.translate(131, 80);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = k % 2 ? '#2f7a2a' : '#3f9b35';
      ctx.beginPath();
      ctx.ellipse(0, -len / 2, 6, len / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (v === 3) {
    // a kitchen: a shelf with jars, a counter and a pendant lamp
    ctx.fillStyle = '#4a2c18';
    ctx.fillRect(0, 36, 42, 4);
    const jars = ['#ffd23f', '#e8452c', '#f2f2f2', '#3fae3a'];
    for (let k = 0; k < 4; k++) { ctx.fillStyle = jars[k]; rr(ctx, 4 + k * 9, 26, 7, 10, 2); ctx.fill(); }
    ctx.fillStyle = shade;
    ctx.fillRect(0, 72, 44, 22);
    ctx.fillStyle = '#d8cbb5';
    ctx.fillRect(0, 70, 46, 4);
    ctx.strokeStyle = '#1d1410';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(110, 0); ctx.lineTo(110, 18); ctx.stroke();
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); ctx.moveTo(100, 26); ctx.lineTo(120, 26); ctx.lineTo(114, 17); ctx.lineTo(106, 17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff1c9';
    ctx.beginPath(); ctx.ellipse(110, 26.5, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    // a screen on a low cabinet and a wall clock
    ctx.fillStyle = shade;
    rr(ctx, 2, 76, 40, 18, 3);
    ctx.fill();
    ctx.fillStyle = '#111520';
    rr(ctx, 4, 46, 36, 24, 2);
    ctx.fill();
    const tv = ctx.createLinearGradient(6, 48, 38, 68);
    tv.addColorStop(0, '#5fc8ff');
    tv.addColorStop(1, '#2546a8');
    ctx.fillStyle = tv;
    ctx.fillRect(6, 48, 32, 20);
    ctx.fillStyle = '#f4efe2';
    ctx.beginPath(); ctx.arc(128, 32, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a20';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(128, 32); ctx.lineTo(128, 25); ctx.moveTo(128, 32); ctx.lineTo(133, 34); ctx.stroke();
  }
  ctx.restore();
}
/** Room variant `v` of a tribe's home, lamp-lit. */
export function interiorKey(scene, tribe, v) {
  const c = HOME[tribe] || HOME.vuur;
  return canvas(scene, `lt_in_${tribe}_${v}`, RW, RH, (ctx, w, h) => {
    const r = rand(v * 977 + tribe.length * 31);
    const [lx, ly] = LAMP[v % LAMP.length];
    // the wall, a little darker under the ceiling and near the floor
    const wall = ctx.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, c.wallD);
    wall.addColorStop(0.28, c.wall);
    wall.addColorStop(0.8, c.wall);
    wall.addColorStop(1, c.wallD);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);
    // wallpaper: thin vertical stripes
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 6; x < w; x += 12) ctx.fillRect(x, 0, 4, h);
    // the lamp's light on the wall
    const lamp = ctx.createRadialGradient(lx, ly, 2, lx, ly, 120);
    lamp.addColorStop(0, `${c.wallL}f0`);
    lamp.addColorStop(0.35, `${c.wallL}88`);
    lamp.addColorStop(1, `${c.wallL}00`);
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, w, h);
    // the floor: boards in perspective, a skirting board, a rug
    const fy = 94;
    const fl = ctx.createLinearGradient(0, fy, 0, h);
    fl.addColorStop(0, c.floorL);
    fl.addColorStop(1, c.floor);
    ctx.fillStyle = fl;
    ctx.fillRect(0, fy, w, h - fy);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let k = -6; k <= 6; k++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + k * 14, fy);
      ctx.lineTo(w / 2 + k * 24, h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, fy - 3, w, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, fy - 4, w, 1);
    furniture(ctx, v % VARIANTS, c, r);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = c.rug;
    ctx.beginPath();
    ctx.ellipse(w / 2, fy + 12, 50, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.rugL;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(w / 2, fy + 12, 42, 5.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // the lamp's light on the floor, and the corners in shadow
    const pool = ctx.createRadialGradient(lx, h, 2, lx, h, 70);
    pool.addColorStop(0, 'rgba(255,220,150,0.35)');
    pool.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, fy, w, h - fy);
    const vig = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.3, w / 2, h * 0.55, w * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  });
}
/** A room after a fire: soot, a charred floor, a last glow of embers. */
export function charKey(scene) {
  return canvas(scene, 'lt_char', RW, RH, (ctx, w, h) => {
    const r = rand(4242);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#060505');
    g.addColorStop(0.7, '#1a1210');
    g.addColorStop(1, '#2a1a12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // soot streaks climbing the walls
    for (let k = 0; k < 9; k++) {
      const x = r() * w;
      const s = ctx.createLinearGradient(0, h, 0, 0);
      s.addColorStop(0, 'rgba(0,0,0,0.6)');
      s.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = s;
      ctx.beginPath();
      ctx.moveTo(x - 6, h);
      ctx.quadraticCurveTo(x + 10, h * 0.5, x - 2 + r() * 12, 0);
      ctx.lineTo(x + 8, 0);
      ctx.quadraticCurveTo(x + 18, h * 0.5, x + 10, h);
      ctx.fill();
    }
    // charred beams fallen on the floor
    ctx.fillStyle = '#0d0907';
    ctx.save();
    ctx.translate(48, 100); ctx.rotate(-0.25); ctx.fillRect(-26, -4, 52, 8);
    ctx.restore();
    ctx.save();
    ctx.translate(104, 104); ctx.rotate(0.35); ctx.fillRect(-22, -3, 44, 6);
    ctx.restore();
    // embers
    for (let k = 0; k < 14; k++) {
      const x = 8 + r() * (w - 16);
      const y = 88 + r() * 24;
      const e = ctx.createRadialGradient(x, y, 0, x, y, 4 + r() * 4);
      e.addColorStop(0, 'rgba(255,170,60,0.95)');
      e.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = e;
      ctx.fillRect(x - 8, y - 8, 16, 16);
    }
  });
}

// ---------------------------------------------------------------------------------------------- a room: the person in it
/** Person `id` standing in a room (head and shoulders, lit from the lamp of room variant `v`, a soft shadow on the wall). */
export function bustKey(scene, id, v = 0) {
  const p = portraitOf(id);
  if (!p) return null;
  const side = LAMP[v % LAMP.length][0] < RW / 2 ? -1 : 1;
  return canvas(scene, `lt_bust_${id}_${side}`, RW, RH, (ctx, w, h) => {
    const size = h * 1.18;
    const x = w / 2 - size / 2;
    const y = h - size * 0.9;
    // the shadow on the wall behind, away from the lamp
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = -side * 9;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(p, x, y, size, size);
    ctx.restore();
    // light from the lamp's side, shade on the other (on the person only)
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const lit = ctx.createLinearGradient(side < 0 ? 0 : w, 0, side < 0 ? w : 0, 0);
    lit.addColorStop(0, 'rgba(255,226,170,0.28)');
    lit.addColorStop(0.55, 'rgba(255,226,170,0)');
    lit.addColorStop(1, 'rgba(10,6,30,0.32)');
    ctx.fillStyle = lit;
    ctx.fillRect(0, 0, w, h);
    const low = ctx.createLinearGradient(0, h * 0.62, 0, h);
    low.addColorStop(0, 'rgba(20,10,0,0)');
    low.addColorStop(1, 'rgba(20,10,0,0.38)');
    ctx.fillStyle = low;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });
}

// ---------------------------------------------------------------------------------------------- a room: in front
const FM = 7;    // the frame's width around the opening (world)
const SILL = 11; // room under the opening for the sill (world)
export const FRAME = { w: ROOM.w + 2 * FM, h: ROOM.h + FM + SILL, ox: 0.5, oy: (FM + ROOM.h / 2) / (ROOM.h + FM + SILL) };
/** A window's frame, sill, the depth of the wall and the glass's sheen (the opening itself stays clear). */
export function frameKey(scene, tribe) {
  const c = HOME[tribe] || HOME.vuur;
  return canvas(scene, `lt_frame_${tribe}`, FRAME.w * K, FRAME.h * K, (ctx, w, h) => {
    const m = FM * K;
    const ox = m;
    const oy = m;
    // the frame's shadow on the facade
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    rr(ctx, 2, 2, w - 4, RH + 2 * m - 4, 6);
    ctx.fillStyle = c.frame[1];
    ctx.fill();
    ctx.restore();
    // the frame: a band round the opening, light on top, dark below
    const band = ctx.createLinearGradient(0, 0, 0, RH + 2 * m);
    band.addColorStop(0, c.frame[2]);
    band.addColorStop(0.25, c.frame[0]);
    band.addColorStop(1, c.frame[1]);
    ctx.fillStyle = band;
    rr(ctx, 2, 2, w - 4, RH + 2 * m - 4, 6);
    ctx.fill();
    if (tribe === 'gras') {
      // wood grain
      ctx.strokeStyle = 'rgba(60,30,10,0.35)';
      ctx.lineWidth = 1;
      for (let y = 6; y < RH + 2 * m - 6; y += 5) { ctx.beginPath(); ctx.moveTo(4, y); ctx.bezierCurveTo(w * 0.3, y + 2, w * 0.6, y - 2, w - 4, y + 1); ctx.stroke(); }
    }
    if (tribe === 'vuur') {
      // rivets in the iron
      ctx.fillStyle = '#9a7a62';
      for (const [x, y] of [[7, 7], [w - 7, 7], [7, RH + 2 * m - 7], [w - 7, RH + 2 * m - 7], [w / 2, 6]]) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
    }
    // cut the opening out
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(ox, oy, RW, RH);
    ctx.restore();
    // an inner bevel: light on the frame's inside edge
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox - 1.5, oy - 1.5, RW + 3, RH + 3);
    // the depth of the wall inside the opening: shadow under the top and down the left
    const top = ctx.createLinearGradient(0, oy, 0, oy + 22);
    top.addColorStop(0, 'rgba(0,0,0,0.55)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top;
    ctx.fillRect(ox, oy, RW, 22);
    const left = ctx.createLinearGradient(ox, 0, ox + 12, 0);
    left.addColorStop(0, 'rgba(0,0,0,0.32)');
    left.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = left;
    ctx.fillRect(ox, oy, 12, RH);
    // the glass: a soft sheen and two reflections across it
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, RW, RH);
    ctx.clip();
    const sheen = ctx.createLinearGradient(ox, oy, ox + RW, oy + RH);
    sheen.addColorStop(0, 'rgba(255,255,255,0.11)');
    sheen.addColorStop(0.4, 'rgba(255,255,255,0.02)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = sheen;
    ctx.fillRect(ox, oy, RW, RH);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.moveTo(ox + RW * 0.48, oy); ctx.lineTo(ox + RW * 0.66, oy); ctx.lineTo(ox + RW * 0.3, oy + RH); ctx.lineTo(ox + RW * 0.12, oy + RH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.beginPath();
    ctx.moveTo(ox + RW * 0.72, oy); ctx.lineTo(ox + RW * 0.77, oy); ctx.lineTo(ox + RW * 0.41, oy + RH); ctx.lineTo(ox + RW * 0.36, oy + RH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // the sill: a ledge standing out under the window, its shadow below
    const sy = oy + RH + m - 2;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    rr(ctx, 0, sy + 9, w, 6, 3);
    ctx.fill();
    const sill = ctx.createLinearGradient(0, sy, 0, sy + 10);
    sill.addColorStop(0, c.frame[2]);
    sill.addColorStop(0.45, c.frame[0]);
    sill.addColorStop(1, c.frame[1]);
    ctx.fillStyle = sill;
    rr(ctx, 0, sy, w, 10, 3);
    ctx.fill();
  });
}
/** Drawn blinds with the lamp on behind them: the other side's rooms. Every one looks the same, lived in or not. */
export function blindsKey(scene, tribe) {
  const c = HOME[tribe] || HOME.vuur;
  return canvas(scene, `lt_blinds_${tribe}`, RW, RH, (ctx, w, h) => {
    const n = 10;
    const sh = (h - 8) / n;
    ctx.fillStyle = c.slat;
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < n; k++) {
      const y = 8 + k * sh;
      const g = ctx.createLinearGradient(0, y, 0, y + sh);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, sh);
      // the lamp's light between two slats
      ctx.fillStyle = 'rgba(255,214,140,0.55)';
      ctx.fillRect(0, y + sh - 1.2, w, 1.2);
    }
    // the lamp behind, glowing through
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.55, 4, w * 0.5, h * 0.55, w * 0.62);
    glow.addColorStop(0, 'rgba(255,196,96,0.55)');
    glow.addColorStop(0.6, 'rgba(255,170,70,0.18)');
    glow.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // the cords and the headrail
    ctx.strokeStyle = 'rgba(60,40,20,0.45)';
    ctx.lineWidth = 1;
    for (const x of [w * 0.27, w * 0.73]) { ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.fillStyle = c.rail;
    ctx.fillRect(0, 0, w, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(0, 1, w, 1.5);
  });
}
/** Glass broken by a throw: a star of cracks round the hit. */
export function cracksKey(scene) {
  return canvas(scene, 'lt_cracks', RW, RH, (ctx, w, h) => {
    const r = rand(99);
    const cx = w * 0.56;
    const cy = h * 0.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineCap = 'round';
    const rays = 11;
    const ends = [];
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * Math.PI * 2 + r() * 0.3;
      let x = cx;
      let y = cy;
      const len = 40 + r() * 70;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 1; s <= 4; s++) {
        x = cx + Math.cos(a + (r() - 0.5) * 0.25) * (len * s) / 4;
        y = cy + Math.sin(a + (r() - 0.5) * 0.25) * (len * s) / 4;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ends.push([a, len]);
    }
    // rings of cracks between the rays
    ctx.lineWidth = 1;
    for (const f of [0.28, 0.55]) {
      ctx.beginPath();
      ends.forEach(([a, len], k) => {
        const x = cx + Math.cos(a) * len * f;
        const y = cy + Math.sin(a) * len * f;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    // the hole
    ctx.fillStyle = 'rgba(10,10,20,0.75)';
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rr2 = 7 + r() * 6;
      const x = cx + Math.cos(a) * rr2;
      const y = cy + Math.sin(a) * rr2;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  });
}
/** What a miss heard next door: `n` people in the rooms beside, above and below (a dark glass badge with sound rings). */
export function hintKey(scene, n) {
  return canvas(scene, `lt_hint_${n}`, 64, 64, (ctx, w, h) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 27, 0, Math.PI * 2);
    ctx.fillStyle = n ? 'rgba(40,18,6,0.92)' : 'rgba(12,20,44,0.9)';
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = n ? '#ffc94a' : '#8fa6d8';
    ctx.stroke();
    // the sound rings
    ctx.strokeStyle = n ? 'rgba(255,201,74,0.8)' : 'rgba(143,166,216,0.55)';
    ctx.lineWidth = 2.2;
    for (const rad of [8, 13]) { ctx.beginPath(); ctx.arc(14, h / 2, rad, -0.7, 0.7); ctx.stroke(); }
    ctx.fillStyle = n ? '#ffe08a' : '#c9d6f5';
    ctx.font = '900 30px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), w / 2 + 7, h / 2 + 1.5);
  });
}
/** A glowing ring round a window (tinted: gold where someone can go, red where an attack lands). */
export function ringKey(scene) {
  const w = (ROOM.w + 10) * K;
  const h = (ROOM.h + 10) * K;
  return canvas(scene, 'lt_ring', w + 24, h + 24, (ctx) => {
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    rr(ctx, 12, 12, w, h, 12);
    ctx.stroke();
    ctx.restore();
  });
}
/** A soft square of light over a window (tinted where it is used). */
export function glowKey(scene) {
  return canvas(scene, 'lt_glow', RW, RH, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.62);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0.25)');
    ctx.fillStyle = g;
    rr(ctx, 0, 0, w, h, 6);
    ctx.fill();
  });
}
/** The aim: a turning sight (red ring, four marks, a dot). */
export function sightKey(scene) {
  return canvas(scene, 'lt_sight', 112, 112, (ctx, w, h) => {
    const c = w / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = '#ff4d3a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(c, c, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 6;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 28, c + Math.sin(a) * 28);
      ctx.lineTo(c + Math.cos(a) * 52, c + Math.sin(a) * 52);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ---------------------------------------------------------------------------------------------- the roof and its flag
/** The roof on a tower's top floor: a parapet in the tribe's material. */
export function roofKey(scene, tribe) {
  const c = HOME[tribe] || HOME.vuur;
  const W = (FLOOR.w + 12) * K;
  const H = 16 * K;
  return canvas(scene, `lt_roof_${tribe}`, W, H, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, c.frame[2]);
    g.addColorStop(0.3, c.frame[0]);
    g.addColorStop(1, c.frame[1]);
    ctx.fillStyle = g;
    rr(ctx, 0, 6, w, h - 6, 4);
    ctx.fill();
    // the coping stones on top
    for (let x = 4; x < w - 20; x += 40) {
      ctx.fillStyle = c.frame[2];
      rr(ctx, x, 0, 34, 10, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, 8, 34, 2);
    }
    if (tribe === 'gras') {
      ctx.fillStyle = '#4fae3a';
      for (let x = 0; x < w; x += 9) { ctx.beginPath(); ctx.ellipse(x + 4, 6, 6, 4, 0, Math.PI, 0); ctx.fill(); }
    }
  });
}
/** The tribe's flag: its colour with a white mark (a flame, a wave, a leaf). */
export function flagKey(scene, tribe) {
  const t = TRIBES[tribe] || TRIBES.vuur;
  return canvas(scene, `lt_flag_${tribe}`, 120, 76, (ctx, w, h) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(w * 0.35, -4, w * 0.6, 14, w - 4, 6);
    ctx.lineTo(w - 4, h - 10);
    ctx.bezierCurveTo(w * 0.6, h - 2, w * 0.35, h - 18, 0, h - 8);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, t.chute);
    g.addColorStop(0.5, t.chuteL);
    g.addColorStop(1, t.chute);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.save();
    ctx.translate(w * 0.48, h * 0.46);
    if (tribe === 'vuur') {
      ctx.beginPath();
      ctx.moveTo(0, 18);
      ctx.bezierCurveTo(-16, 12, -12, -6, -2, -20);
      ctx.bezierCurveTo(0, -8, 8, -10, 6, -2);
      ctx.bezierCurveTo(14, 4, 12, 16, 0, 18);
      ctx.fill();
    } else if (tribe === 'water') {
      ctx.lineWidth = 6;
      for (const dy of [-8, 6]) {
        ctx.beginPath();
        ctx.moveTo(-20, dy);
        ctx.bezierCurveTo(-10, dy - 10, 0, dy + 8, 10, dy - 2);
        ctx.quadraticCurveTo(16, dy - 8, 20, dy - 2);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(-14, 16);
      ctx.bezierCurveTo(-18, -6, 4, -20, 18, -18);
      ctx.bezierCurveTo(18, 2, 4, 16, -14, 16);
      ctx.fill();
      ctx.strokeStyle = TRIBES.gras.chute;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-12, 14);
      ctx.quadraticCurveTo(0, 0, 14, -14);
      ctx.stroke();
    }
    ctx.restore();
  });
}

/** Draws every room picture up front (the first drag or hit must not stall a slow phone). */
export function prepareRooms(scene, tribes) {
  const keys = [charKey(scene), cracksKey(scene), ringKey(scene), glowKey(scene), sightKey(scene)];
  for (let n = 0; n <= 4; n++) keys.push(hintKey(scene, n));
  for (const t of tribes) {
    keys.push(frameKey(scene, t), blindsKey(scene, t), roofKey(scene, t), flagKey(scene, t));
    for (let v = 0; v < VARIANTS; v++) keys.push(interiorKey(scene, t, v));
  }
  return keys;
}
