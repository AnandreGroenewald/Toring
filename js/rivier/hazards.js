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
export const CLOWN_SCALE = 1.55;
/** His head turned towards you from his three-quarter seat (rad, in his own frame: the mirror flips it for the right bank). */
const HEAD_TO_YOU = 0.45;
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

  // ------------------------------------------------------------------------------------------- the whirlpool (1.21.3)
  /** A whirlpool's picture: the hollow (`foam` false: dark in the middle, lighter out to the rim), or its foam: three
   * thick arms spiralling in and a broken white rim. */
  function whirlTexture(foam) {
    const N = 512;
    const C = N / 2;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    if (!foam) {
      const gr = g.createRadialGradient(C, C, 0, C, C, C);
      gr.addColorStop(0, 'rgba(0,6,8,1)');
      gr.addColorStop(0.22, 'rgba(2,16,20,0.97)');
      gr.addColorStop(0.5, 'rgba(8,40,46,0.8)');
      gr.addColorStop(0.8, 'rgba(18,70,76,0.4)');
      gr.addColorStop(1, 'rgba(30,90,96,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, N, N);
    } else {
      // (three arms of foam: wide at the rim, curling round and thinning into the hollow)
      for (let arm = 0; arm < 3; arm++) {
        g.beginPath();
        const pts = [];
        for (let k = 0; k <= 60; k++) {
          const u = k / 60;
          const r = C * 0.94 * Math.exp(-2.1 * u);
          const a = arm * (Math.PI * 2 / 3) + u * Math.PI * 2.4;
          const w = C * 0.11 * (1 - u * 0.85);
          pts.push([a, r, w]);
        }
        pts.forEach(([a, r, w], i) => { const x = C + Math.cos(a) * (r + w); const y = C + Math.sin(a) * (r + w); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        for (let i = pts.length - 1; i >= 0; i--) { const [a, r, w] = pts[i]; g.lineTo(C + Math.cos(a) * (r - w), C + Math.sin(a) * (r - w)); }
        g.closePath();
        const gr = g.createRadialGradient(C, C, C * 0.1, C, C, C);
        gr.addColorStop(0, 'rgba(235,248,248,0.35)');
        gr.addColorStop(1, 'rgba(250,255,255,0.92)');
        g.fillStyle = gr;
        g.fill();
      }
      // (the rim: a broken ring of white water)
      g.lineCap = 'round';
      for (let k = 0; k < 14; k++) {
        const a0 = k * (Math.PI * 2 / 14);
        g.strokeStyle = `rgba(255,255,255,${(0.55 + (k % 3) * 0.15).toFixed(2)})`;
        g.lineWidth = 10 + (k % 4) * 3;
        g.beginPath();
        g.arc(C, C, C * 0.9, a0, a0 + 0.32);
        g.stroke();
      }
      let sd = 5;
      const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      g.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 300; i++) {
        const r = C * (0.2 + rnd() * 0.75);
        const a = rnd() * Math.PI * 2;
        g.beginPath();
        g.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, 1 + rnd() * 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const whirlGeo = geo(new THREE.CircleGeometry(1, 40));
  whirlGeo.rotateX(-Math.PI / 2);
  const whirlCore = bend(new THREE.MeshBasicMaterial({ map: whirlTexture(false), transparent: true, depthWrite: false, fog: true }));
  const whirlFoam = bend(new THREE.MeshBasicMaterial({ map: whirlTexture(true), transparent: true, depthWrite: false, fog: true }));
  for (const m of [whirlCore, whirlFoam]) { m.userData.shared = true; own.push(m, m.map); }
  const whirlPlankGeo = geo(new THREE.BoxGeometry(1.4, 0.12, 0.32));
  const whirlPlank = std('#9a6a3c', { roughness: 0.8 });
  /**
   * A whirlpool (from 5 km), in a side lane: a dark hollow and foam spiralling in, wide enough to reach the middle lane
   * (its pull does). userData: { kind 'whirl', w, d, update(t) }.
   */
  function whirl() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(whirlGeo, whirlCore);
    core.scale.setScalar(4.2);
    core.position.y = 0.05;
    core.renderOrder = 2;
    const foam = new THREE.Mesh(whirlGeo, whirlFoam);
    foam.scale.setScalar(4.6);
    foam.position.y = 0.07;
    foam.renderOrder = 3;
    // (a plank going round and round, spiralling in: you see what it does)
    const plank = new THREE.Mesh(whirlPlankGeo, whirlPlank);
    plank.position.y = 0.1;
    g.add(core, foam, plank);
    noCull(g);
    g.traverse((o) => { o.castShadow = false; });   // (flat on the water: no shadow of its own)
    plank.castShadow = true;
    g.userData = {
      kind: 'whirl', w: 3.2, d: 3.2, phase: 0,
      update(t) {
        foam.rotation.y = t * 2.2;
        core.rotation.y = t * 0.8;
        const u = (t * 0.22) % 1;
        const r = 3.6 * (1 - u * 0.85);
        const a = t * (1.6 + u * 3);
        plank.position.set(Math.cos(a) * r, 0.1 - u * 0.4, Math.sin(a) * r);
        plank.rotation.set(0, -a, u * 0.6);
      },
    };
    return g;
  }
  // ------------------------------------------------------------------------------------------- coins (1.21.3)
  const coinGeo = geo(new THREE.CylinderGeometry(0.44, 0.44, 0.09, 24));
  coinGeo.rotateX(Math.PI / 2);   // (standing up, its face to you)
  const coinMat = std('#ffd23f', { metalness: 0.55, roughness: 0.24, emissive: '#a86e00', emissiveIntensity: 0.62 });
  // (1.23, the owner 27 Oct 2026: "the coins, it looks really bland ... really make this special") both faces wear the game's
  // minted coin (the Stapel tower engraved in it, a reeded rim: css/style.css --coin-img), drawn once into a texture, turned a
  // quarter so it stands upright on the cap; the edge stays polished gold (coinMat). Plain gold until the picture is in.
  const coinFaceTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const g = c.getContext('2d');
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, 256, 256);
    const raw = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue('--coin-img') : '';
    // (the picture's own words hold ' and ) (url(#r)): read up to the quote that opened it)
    const src = /url\(\s*(["'])(data:image\/svg\+xml,.*?)\1\s*\)/s.exec(raw || '')?.[2];
    if (src) {
      const img = new Image();
      img.onload = () => {
        g.clearRect(0, 0, 256, 256);
        g.save();
        g.translate(128, 128);
        g.rotate(-Math.PI / 2);   // (a cylinder's cap maps the picture a quarter turn round: this puts the tower upright)
        g.drawImage(img, -128, -128, 256, 256);
        g.restore();
        t.needsUpdate = true;
      };
      img.src = src;
    }
    return t;
  })();
  own.push(coinFaceTex);
  const coinFaceMat = std('#ffffff', { map: coinFaceTex, metalness: 0.5, roughness: 0.28, emissive: '#ffffff', emissiveMap: coinFaceTex, emissiveIntensity: 0.42 });
  const coinMats = [coinMat, coinFaceMat, coinFaceMat];   // (a cylinder's groups: the edge, then its two faces)
  // (a warm glow behind each: a coin shows on any water, by day or night, and apart from gold blocks)
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,236,150,0.9)');
    gr.addColorStop(0.35, 'rgba(255,210,90,0.45)');
    gr.addColorStop(1, 'rgba(255,190,60,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const glowGeo = geo(new THREE.PlaneGeometry(1, 1));
  const coinGlow = bend(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  const gemGlow = bend(new THREE.MeshBasicMaterial({ map: glowTex, color: '#7fe6ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  for (const m of [coinGlow, gemGlow]) { m.userData.shared = true; own.push(m); }
  own.push(glowTex);
  const gemGeo = geo(new THREE.OctahedronGeometry(0.46, 0));
  const gemMat = std('#8ff6ff', { metalness: 0.15, roughness: 0.08, emissive: '#22b8d6', emissiveIntensity: 0.75 });
  /** Where a coin line hangs: on the water, in the air over a log (a jump), low under a tree. */
  const COIN_Y = [0.85, 2.05, 0.7];
  /**
   * A line of coins (or a stack of ten, or the diamond) for a 'coins' item: userData { kind 'coins', coins: [{ m, taken }],
   * update(t) } — each coin turns; the stack is a pile that turns; the diamond turns and bobs.
   */
  function coins(it) {
    const g = new THREE.Group();
    const list = [];
    const y = COIN_Y[it.y | 0] ?? COIN_Y[0];
    const glow = (at, size, mat = coinGlow) => {
      const q = new THREE.Mesh(glowGeo, mat);
      q.scale.setScalar(size);
      q.position.copy(at);
      q.position.z += 0.05;
      q.renderOrder = 4;
      g.add(q);
      return q;
    };
    if (it.gem) {
      const m = new THREE.Mesh(gemGeo, gemMat);
      m.scale.set(1, 1.35, 1);
      m.position.set(0, y + 0.2, -(it.dz || 0));
      g.add(m);
      list.push({ m, taken: false, glow: glow(m.position, 2.4, gemGlow) });
    } else if (it.stack) {
      const m = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const c = new THREE.Mesh(coinGeo, coinMats);
        c.rotation.x = Math.PI / 2;
        c.position.set((k % 2) * 0.05, k * 0.08, (k % 3) * 0.04);
        c.scale.setScalar(1.25);
        m.add(c);
      }
      m.position.set(0, y - 0.3, -(it.dz || 0));
      g.add(m);
      list.push({ m, taken: false, glow: glow(new THREE.Vector3(0, y, -(it.dz || 0)), 2.6) });
    } else {
      for (let k = 0; k < (it.n | 0); k++) {
        const m = new THREE.Mesh(coinGeo, coinMats);
        m.position.set(0, y, -((it.dz || 0) + k * (it.sp || 0)));
        g.add(m);
        list.push({ m, taken: false, glow: glow(m.position, 1.5) });
      }
    }
    noCull(g);
    g.traverse((o) => { o.castShadow = false; });
    g.userData = {
      kind: 'coins', coins: list, phase: 0, w: 0, d: 0,
      update(t) {
        list.forEach((c, k) => {
          if (c.taken) {
            if (c.glow) c.glow.visible = false;
            return;
          }
          // (they sway rather than spin: their faces stay to you; the diamond turns)
          c.m.rotation.y = it.gem ? t * 1.6 : it.stack ? t * 1.2 : Math.sin(t * 3 + k * 0.7) * 0.9;
          if (it.gem) c.m.position.y = y + 0.2 + Math.sin(t * 2.4) * 0.12;
        });
      },
    };
    return g;
  }
  /** Tints the whirlpool's foam with the scene's light (white by day, dim at night), as the river's other foam. */
  function tint(c) {
    whirlFoam.color.copy(c);
  }
  function dispose() {
    for (const x of own) x.dispose();
    own.length = 0;
  }
  return { log, branch, clown, pie, whirl, coins, tint, dispose };
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
  // (its drop shadow comes from the page's own filter on the picture: one shadow round the whole splat, none inside it)
  g.save();
  g.fillStyle = '#fff8ec';
  blob(256, 222, 148, 18, 0.42);
  g.fill();
  // (drips: thin necks running down from the blob's lower edge into a round bead, each its own length)
  const drips = [[176, 0.55], [214, 1], [262, 0.4], [300, 0.8], [340, 0.3]];
  const beads = [];
  for (const [dx, dl] of drips) {
    const x = dx + (rnd() - 0.5) * 16;
    const top = 222 + Math.sqrt(Math.max(0, 148 * 148 - (x - 256) * (x - 256))) * 0.86 - 26;
    const len = 30 + dl * (70 + rnd() * 50);
    const w = 11 + rnd() * 6;
    const bead = w * (0.85 + rnd() * 0.25);
    g.beginPath();
    g.moveTo(x - w * 1.4, top - 14);
    g.quadraticCurveTo(x - w * 0.5, top + 6, x - w * 0.42, top + len * 0.6);
    g.quadraticCurveTo(x - w * 0.5, top + len - bead * 0.5, x - bead * 0.95, top + len);
    g.arc(x, top + len, bead, Math.PI, 0, true);
    g.quadraticCurveTo(x + w * 0.5, top + len - bead * 0.5, x + w * 0.42, top + len * 0.6);
    g.quadraticCurveTo(x + w * 0.5, top + 6, x + w * 1.4, top - 14);
    g.closePath();
    g.fill();
    beads.push([x, top + len, bead]);
  }
  for (let k = 0; k < 14; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 168 + rnd() * 66;
    blob(256 + Math.cos(a) * d, 222 + Math.sin(a) * d * 0.85, 5 + rnd() * 13, 8, 0.5);
    g.fill();
  }
  g.restore();
  // whipped, not flat: soft peaks over the top, each a highlight with its shade below-right (no outlines; on the cream only)
  g.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 16; k++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 105;
    const px = 256 + Math.cos(a) * d;
    const py = 222 + Math.sin(a) * d * 0.85;
    const r = 18 + rnd() * 16;
    const sd = g.createRadialGradient(px + r * 0.3, py + r * 0.35, 0, px + r * 0.3, py + r * 0.35, r);
    sd.addColorStop(0, 'rgba(196,170,132,.28)');
    sd.addColorStop(1, 'rgba(196,170,132,0)');
    g.fillStyle = sd;
    g.fillRect(px - r, py - r, r * 2.7, r * 2.7);
    const pk = g.createRadialGradient(px - r * 0.25, py - r * 0.3, 0, px - r * 0.25, py - r * 0.3, r * 0.8);
    pk.addColorStop(0, 'rgba(255,255,255,.95)');
    pk.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = pk;
    g.fillRect(px - r * 1.1, py - r * 1.1, r * 1.8, r * 1.8);
  }
  // its shine and shade
  const sh = g.createRadialGradient(200, 160, 10, 256, 222, 170);
  sh.addColorStop(0, 'rgba(255,255,255,.75)');
  sh.addColorStop(0.5, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(206,182,148,.38)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = sh;
  g.fillRect(0, 0, 512, 512);
  g.globalCompositeOperation = 'source-over';
  // (a shine on every bead)
  g.fillStyle = 'rgba(255,255,255,.9)';
  for (const [bx, by, br] of beads) {
    g.beginPath();
    g.ellipse(bx - br * 0.35, by - br * 0.3, br * 0.32, br * 0.2, -0.6, 0, Math.PI * 2);
    g.fill();
  }
  // bits of the golden crust flung out with it
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * (0.9 + rnd() * 1.2) + (k % 2 ? Math.PI : 0) * 0.15;
    const d = 120 + rnd() * 110;
    const cx = 256 + Math.cos(a) * d;
    const cy = 222 + Math.sin(a) * d * 0.8;
    g.fillStyle = rnd() < 0.5 ? '#d9954a' : '#b8732f';
    g.save();
    g.translate(cx, cy);
    g.rotate(rnd() * Math.PI);
    g.beginPath();
    g.moveTo(-8 - rnd() * 6, -4);
    g.lineTo(6 + rnd() * 6, -6 - rnd() * 3);
    g.lineTo(9, 5);
    g.lineTo(-5, 7);
    g.closePath();
    g.fill();
    g.restore();
  }
  // the cherry on top (glossy, a shine and its stem), the same as the pie's own
  const ch = g.createRadialGradient(270, 186, 4, 280, 200, 34);
  ch.addColorStop(0, '#ff9a9a');
  ch.addColorStop(0.35, '#e3262b');
  ch.addColorStop(1, '#7d0a10');
  g.fillStyle = ch;
  g.beginPath();
  g.arc(280, 200, 31, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.beginPath();
  g.ellipse(268, 186, 8, 5, -0.6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#4f8a2a';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(283, 171);
  g.quadraticCurveTo(290, 142, 312, 132);
  g.stroke();
  return c.toDataURL('image/png');
}
