// (1.20) What the endless river adds further down (js/core/rivier.js RIVER.unlock; the owner, 25 Oct 2026: "after 1000
// meters it adds a clown that tries to distract you, after 2000 meters there is a small object that you need to jump
// over"): Hanswors on his inflatable duck with his cream pies, logs to jump, a fallen tree to duck under. The Blender
// models (art/blender/hazards.py → img/models/hazards.glb) when they're there; simple shapes else.
import * as THREE from '../../lib/three.module.min.js';
import { RIVER } from '../core/rivier.js';

/** The tree's underside over the water (m): duck under it (art/blender/hazards.py `under`). */
export const TREE_UNDER = 1.5;
/** A log's top over the water (m): jump higher than this. */
export const LOG_TOP = 0.62;

/** Hanswors's size (the model is life-size: he's made big enough to read across the river). */
export const CLOWN_SCALE = 1.8;
/** His head turned towards you from his three-quarter seat (rad, in his own frame: the mirror flips it for the right bank). */
const HEAD_TO_YOU = 0.55;
/** A thrown pie's size: cartoon-big, so it reads in the air. */
export const PIE_SCALE = 2.2;

export function createHazards(bend = (m) => m, models = {}) {
  const H = models.hazards || null;
  const part = (name) => {
    const src = H?.getObjectByName(name);
    if (!src) return null;
    const c = src.clone(true);
    c.position.set(0, 0, 0);
    return c;
  };
  const own = [];   // (this ride's own geometries and materials, freed with it)
  // (shared by every copy: a passed one's clean-up leaves them; this kit frees them when the ride closes)
  const std = (color, o = {}) => { const m = bend(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o })); m.userData.shared = true; own.push(m); return m; };
  const geo = (g) => { g.userData.shared = true; own.push(g); return g; };
  // (the duck's foam: white froth that fades at its edges, drawn once for the ride)
  let foamM = null;
  let foamG = null;
  const foamMat = () => {
    if (!foamM) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const gr = x.createRadialGradient(64, 64, 8, 64, 64, 62);
      gr.addColorStop(0, 'rgba(255,255,255,0.05)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.8, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 128, 128);
      // (flecks of froth)
      let sd = 7;
      const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      x.fillStyle = 'rgba(255,255,255,0.7)';
      for (let k = 0; k < 140; k++) {
        const a = rnd() * Math.PI * 2;
        const r = 30 + rnd() * 30;
        x.beginPath();
        x.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 0.8 + rnd() * 2.2, 0, Math.PI * 2);
        x.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      own.push(tex);
      foamM = bend(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 }));
      foamM.userData.shared = true;
      own.push(foamM);
      foamG = geo(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    }
    return foamM;
  };
  const noCull = (g) => { g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; } }); return g; };

  /** A log across `span` lanes (1 or 3), lying in the water: { obj } with userData { kind 'log', w, d }. */
  function log(span = 1) {
    const g = new THREE.Group();
    const m = part(span > 1 ? 'longlog' : 'log');
    const len = span > 1 ? 10.6 : 2.9;
    if (m) {
      m.position.y = -0.08;
      g.add(m);
    } else {
      const c = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.33, 0.33, len, 14)), std('#6b4a2e', { roughness: 0.9 }));
      c.rotation.z = Math.PI / 2;
      c.position.y = 0.26;
      g.add(c);
    }
    noCull(g);
    g.userData = { kind: 'log', w: span > 1 ? RIVER.laneW * 3 : RIVER.laneW * 0.86, d: 0.7, span, phase: Math.random() * 6 };
    return g;
  }

  /** A fallen tree across the whole river, its underside at TREE_UNDER: duck under it. */
  function branch(flip = false) {
    const g = new THREE.Group();
    const m = part('tree');
    if (m) {
      g.add(m);
    } else {
      const c = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.5, 0.6, 18, 14)), std('#7a6450', { roughness: 0.9 }));
      c.rotation.z = Math.PI / 2;
      c.position.y = TREE_UNDER + 0.55;
      g.add(c);
    }
    if (flip) g.rotation.y = Math.PI;
    noCull(g);
    g.userData = { kind: 'branch', w: RIVER.laneW * 3 + 1, d: 1.2, phase: 0 };
    return g;
  }

  /** A cream pie (what he throws). */
  function pie() {
    const p = part('pie');
    if (p) {
      // (its origin is where his hand held it: centred on itself here)
      const box = new THREE.Box3().setFromObject(p);
      const c = box.getCenter(new THREE.Vector3());
      p.position.sub(c);
      const g = new THREE.Group();
      g.add(p);
      return noCull(g);
    }
    const g = new THREE.Group();
    const tin = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.17, 0.15, 0.07, 18)), std('#c9ced6', { metalness: 0.8, roughness: 0.3 }));
    const cr = new THREE.Mesh(geo(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), std('#fffaf0', { roughness: 0.5 }));
    cr.position.y = 0.03;
    g.add(tin, cr);
    return noCull(g);
  }

  /**
   * Hanswors sitting backwards on his duck, facing you, a pie held up: userData { kind 'clown', arm, head, balloons,
   * duck, pieHeld, foam } — the ride moves him; `pose(t, wind, wave, after)` animates him (wind 0..1: his arm drawn
   * back to throw; after 0..1: the throw's follow-through). Seen three-quarters on (the duck's head and beak show), his
   * face turned to you, his throwing arm on the river's side (on the right bank he's mirrored).
   */
  function clown(side = 1) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    let arm = null;
    let head = null;
    let balloons = null;
    let pieHeld = null;
    let duck = null;
    if (H) {
      duck = part('duck');
      const body = part('clown');
      head = part('clownhead');
      arm = part('clownarm');
      balloons = part('balloons');
      pieHeld = part('pie');
      for (const o of [duck, body, head, arm, balloons, pieHeld]) if (o) inner.add(o);
      // (each part's origin is its joint in the model: put back where it was)
      for (const [o, name] of [[head, 'clownhead'], [arm, 'clownarm'], [balloons, 'balloons'], [pieHeld, 'pie']]) {
        const src = H.getObjectByName(name);
        if (o && src) o.position.copy(src.position);
      }
      // (the pie rides on his hand: a child of the arm, where it was)
      if (pieHeld && arm) arm.attach(pieHeld);
    } else {
      const d = new THREE.Mesh(geo(new THREE.SphereGeometry(0.9, 18, 12)), std('#ffd21f', { roughness: 0.2 }));
      d.scale.set(0.9, 0.5, 1.2);
      d.position.y = 0.3;
      const b = new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.25, 0.5, 6, 12)), std('#22b8d6'));
      b.position.y = 1.1;
      head = new THREE.Mesh(geo(new THREE.SphereGeometry(0.24, 16, 12)), std('#ffe9dc'));
      head.position.y = 1.7;
      const nose = new THREE.Mesh(geo(new THREE.SphereGeometry(0.07, 10, 8)), std('#e8262d'));
      nose.position.set(0, 1.68, 0.24);
      arm = new THREE.Group();
      arm.position.set(0.3, 1.3, 0);
      inner.add(d, b, head, nose, arm);
    }
    // (he sits backwards facing you: the model faces +z already; the duck goes downstream. His throwing arm is on his
    // +x side: on the right bank (side 1) he's mirrored so it's on the river's side, where you see the throw)
    inner.scale.set(side > 0 ? -CLOWN_SCALE : CLOWN_SCALE, CLOWN_SCALE, CLOWN_SCALE);
    // (the duck's own foam on the water, along its body)
    foamMat();
    const foam = new THREE.Mesh(foamG, foamM);
    foam.scale.set(4.2, 1, 6.6);
    foam.position.y = 0.04;
    foam.renderOrder = 2;
    g.add(foam);
    noCull(g);
    foam.castShadow = false;
    foam.receiveShadow = false;
    const shoulderRest = arm ? arm.rotation.x : 0;
    const headRest = head ? head.rotation.y : 0;
    g.userData = {
      kind: 'clown', side, arm, head, balloons, duck, pieHeld, inner, foam, w: 0, d: 0, phase: Math.random() * 6,
      pose(t, wind = 0, wave = 0, after = 0) {
        inner.position.y = Math.sin(t * 2.1) * 0.08;
        inner.rotation.z = Math.sin(t * 1.6) * 0.06;
        // (he leans back as he winds up, and into the throw after it)
        inner.rotation.x = Math.sin(t * 1.3 + 1) * 0.04 - 0.14 * wind + 0.12 * after;
        // (his face turned to you; a cheeky wobble)
        if (head) {
          head.rotation.y = headRest + HEAD_TO_YOU;
          head.rotation.z = Math.sin(t * 2.7) * 0.15;
        }
        if (balloons) balloons.rotation.z = Math.sin(t * 1.1) * 0.12;
        // (the arm: drawn back over his shoulder, flung forward in the throw; or waving goodbye)
        if (arm) {
          arm.rotation.x = shoulderRest - 1.25 * wind + 1.35 * after;
          arm.rotation.z = wave ? Math.sin(t * 9) * 0.5 : 0;
        }
        foamM.opacity = 0.75 + Math.sin(t * 5) * 0.1;
      },
    };
    return g;
  }

  function dispose() {
    for (const x of own) x.dispose();
    own.length = 0;
  }
  return { log, branch, clown, pie, dispose };
}

/**
 * The cream on the camera: a picture of a splat (a big blob of whipped cream with drips and a cherry), drawn once.
 * Returns a data URL for an <img>.
 */
export function splatImage() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  let s = 17;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const blob = (cx, cy, r, n, j) => {
    g.beginPath();
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = r * (1 + (rnd() - 0.5) * j);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (k === 0) g.moveTo(x, y);
      else g.quadraticCurveTo(cx + Math.cos(a - Math.PI / n) * rr * 1.15, cy + Math.sin(a - Math.PI / n) * rr * 1.15, x, y);
    }
    g.closePath();
  };
  // the cream: a soft shadow, the body, drips running down, little flecks flung out
  g.save();
  g.shadowColor = 'rgba(80,60,40,.35)';
  g.shadowBlur = 24;
  g.shadowOffsetY = 8;
  g.fillStyle = '#fffaf0';
  blob(256, 230, 150, 18, 0.45);
  g.fill();
  // (drips: each runs down from the blob's lower edge, narrowing, with a round bead at its end)
  for (let k = 0; k < 7; k++) {
    const x = 150 + rnd() * 210;
    const top = 280 + Math.sin(((x - 256) / 150) * Math.PI / 2) * 0 + 20;
    const len = 40 + rnd() * 150;
    const w = 16 + rnd() * 18;
    const bend = (rnd() - 0.5) * 14;
    g.beginPath();
    g.moveTo(x - w * 0.8, top - 30);
    g.bezierCurveTo(x - w * 0.55, top + len * 0.3, x - w * 0.3 + bend, top + len * 0.7, x - w * 0.28 + bend, top + len);
    g.arc(x + bend, top + len, w * 0.42, Math.PI, 0, true);
    g.bezierCurveTo(x + w * 0.3 + bend, top + len * 0.7, x + w * 0.55, top + len * 0.3, x + w * 0.8, top - 30);
    g.closePath();
    g.fill();
  }
  for (let k = 0; k < 16; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 170 + rnd() * 70;
    blob(256 + Math.cos(a) * d, 230 + Math.sin(a) * d * 0.85, 6 + rnd() * 16, 8, 0.5);
    g.fill();
  }
  g.restore();
  // its shine and shade
  const sh = g.createRadialGradient(200, 170, 10, 256, 230, 170);
  sh.addColorStop(0, 'rgba(255,255,255,.9)');
  sh.addColorStop(0.5, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(210,190,160,.35)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = sh;
  g.fillRect(0, 0, 512, 512);
  g.globalCompositeOperation = 'source-over';
  // swirls in the cream, and the cherry on top
  g.strokeStyle = 'rgba(220,200,170,.55)';
  g.lineWidth = 6;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.arc(256 + (rnd() - 0.5) * 60, 230 + (rnd() - 0.5) * 50, 40 + k * 28, 0.3 + k, 2.4 + k);
    g.stroke();
  }
  const ch = g.createRadialGradient(270, 196, 4, 280, 210, 34);
  ch.addColorStop(0, '#ff8a8a');
  ch.addColorStop(0.4, '#e3262b');
  ch.addColorStop(1, '#8a0d12');
  g.fillStyle = ch;
  g.beginPath();
  g.arc(280, 210, 32, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#4a7a22';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(282, 180);
  g.quadraticCurveTo(290, 150, 312, 140);
  g.stroke();
  return c.toDataURL('image/png');
}
