// (1.18 3D) Blokbotsing: what flies, splashes and glows — spray and a foam ring where a block meets the sea, a fireball
// and smoke for the explosive crate, a broken block's pieces, the gold ring of a Perfek, the shot's bright trail, and
// the throw's dotted arc with the ring where it will land (gold when it's on their crown). Every kind is a pool: nothing
// is made during a battle. Dust and stone chips are the Kasteelreeks's own (kasteel/fx.js).
import * as THREE from '../../lib/three.module.min.js';
import { createFx as createDustFx } from '../kasteel/fx.js';

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A pool of soft round particles (one draw call): spawn(p, v, opts), update(dt). */
function particles(scene, n, { additive = false, map }) {
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  const col = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uH: { value: 800 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uH;
      void main() { vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = alpha > 0.001 ? size * projectionMatrix[1][1] * uH * 0.5 / max(0.5, -mv.z) : 0.0; }`,
    fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC;
      void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const tmp = new THREE.Vector2();
  pts.onBeforeRender = (r) => { mat.uniforms.uH.value = r.getDrawingBufferSize(tmp).y; };
  scene.add(pts);
  const P = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 0, s0: 1, s1: 1, a0: 1, g: 0, drag: 0, c: new THREE.Color(), on: false }));
  let next = 0;
  let live = 0;
  let wasLive = 0;
  return {
    spawn(p, v, { life = 1, size = 1, size1 = size, color = '#ffffff', alpha: a0 = 1, g = 0, drag = 0 } = {}) {
      const q = P[next++ % n];
      q.on = true;
      live++;
      q.p.copy(p);
      q.v.copy(v);
      q.age = 0;
      q.life = life;
      q.s0 = size;
      q.s1 = size1;
      q.a0 = a0;
      q.g = g;
      q.drag = drag;
      q.c.set(color);
    },
    update(dt) {
      if (!live && !wasLive) return;
      wasLive = live;
      live = 0;
      for (let i = 0; i < n; i++) {
        const q = P[i];
        if (!q.on) { alpha[i] = 0; continue; }
        live++;
        q.age += dt;
        if (q.age >= q.life) { q.on = false; alpha[i] = 0; continue; }
        q.v.y -= q.g * dt;
        if (q.drag) q.v.multiplyScalar(Math.exp(-q.drag * dt));
        q.p.addScaledVector(q.v, dt);
        const k = q.age / q.life;
        pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
        size[i] = q.s0 + (q.s1 - q.s0) * k;
        alpha[i] = q.a0 * (1 - k) * (1 - k * 0.3) * Math.min(1, q.age * 20);
        col[i * 3] = q.c.r; col[i * 3 + 1] = q.c.g; col[i * 3 + 2] = q.c.b;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

export function createBattleFx(stage) {
  const { scene } = stage;
  const dot = softDot();
  const base = createDustFx(scene);
  const spray = particles(scene, 700, { map: dot });
  const glow = particles(scene, 640, { additive: true, map: dot });
  const tmp = new THREE.Vector3();
  const v = new THREE.Vector3();
  const R = Math.random;

  // foam rings on the water (a soft ring texture on a flat quad, growing and fading)
  const ringTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    grd.addColorStop(0.8, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const rings = Array.from({ length: 14 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, opacity: 0, color: '#f4f0ea' }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    return { m, age: 0, life: 1, s0: 1, s1: 4, gold: false };
  });
  let ri = 0;
  function ring(p, { s0 = 1, s1 = 6, life = 1.6, gold = false, flat = true, y = 0.08 } = {}) {
    const r = rings[ri++ % rings.length];
    r.m.visible = true;
    r.m.position.set(p.x, flat ? y : p.y, p.z || 0);
    r.m.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
    r.m.material.color.set(gold ? '#ffcf5a' : '#f4f0ea');
    r.m.material.blending = gold ? THREE.AdditiveBlending : THREE.NormalBlending;
    r.age = 0;
    r.life = life;
    r.s0 = s0;
    r.s1 = s1;
    r.flat = flat;
  }
  // a block's pieces: chunky stones of its own material that fly, spin, and drop into the sea
  const chunkGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const chunkPool = Array.from({ length: 48 }, () => {
    const m = new THREE.Mesh(chunkGeo, null);
    m.castShadow = true;
    m.visible = false;
    scene.add(m);
    return { m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, wet: false };
  });
  let ki = 0;
  function chunks(p, material, { n = 10, size = 1, speed = 9, dir = null } = {}) {
    for (let i = 0; i < n; i++) {
      const c = chunkPool[ki++ % chunkPool.length];
      c.m.material = Array.isArray(material) ? material[1] : material;
      c.m.visible = true;
      c.m.position.set(p.x + (R() - 0.5) * size, p.y + (R() - 0.5) * size, (R() - 0.5) * 2.4);
      c.m.scale.setScalar(size * (0.35 + R() * 0.55));
      c.v.set((R() - 0.5) * speed, R() * speed * 0.9 + 2, (R() - 0.5) * speed * 0.8);
      if (dir) c.v.addScaledVector(dir, speed * 0.6);
      c.w.set(R() * 8, R() * 8, R() * 8);
      c.life = 4;
      c.wet = false;
    }
  }
  // the shot's trail
  let trailOf = null;
  let trailT = 0;
  // the throw's arc: dots flowing along the path, the landing ring
  const ARC_N = 60;
  const arcPos = new Float32Array(ARC_N * 3);
  const arcA = new Float32Array(ARC_N);
  const arcS = new Float32Array(ARC_N);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  arcGeo.setAttribute('alpha', new THREE.BufferAttribute(arcA, 1));
  arcGeo.setAttribute('size', new THREE.BufferAttribute(arcS, 1));
  const arcMat = new THREE.ShaderMaterial({
    uniforms: { uH: { value: 800 }, uCol: { value: new THREE.Color('#ffffff') } },
    // (crisp round dots with a thin glow, never smaller than 7 px: the arc reads at any distance)
    vertexShader: `attribute float alpha; attribute float size; varying float vA; uniform float uH;
      void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(size * projectionMatrix[1][1] * uH * 0.5 / max(0.5, -mv.z), 7.0, 26.0); }`,
    fragmentShader: `uniform vec3 uCol; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); float core = smoothstep(0.34, 0.24, d); float halo = smoothstep(0.5, 0.3, d) * 0.35;
        gl_FragColor = vec4(uCol * (1.4 * core + halo), (core + halo) * vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const arc = new THREE.Points(arcGeo, arcMat);
  arc.frustumCulled = false;
  arc.renderOrder = 5;
  arc.visible = false;
  const arcTmp = new THREE.Vector2();
  arc.onBeforeRender = (r) => { arcMat.uniforms.uH.value = r.getDrawingBufferSize(arcTmp).y; };
  scene.add(arc);
  const markMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, color: '#ffffff' });
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), markMat);
  mark.renderOrder = 6;
  mark.visible = false;
  scene.add(mark);
  let arcPath = [];
  let arcFlow = 0;
  let arcPerfect = false;

  // 🌿 vines: tubes rebuilt as their ends move (a few at a time), growing in, fading out
  const VINE_N = 6;
  const vineMat = new THREE.MeshStandardMaterial({ color: '#3fa532', roughness: 0.7, transparent: true, opacity: 1 });
  const vinePool = Array.from({ length: VINE_N }, () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), vineMat.clone());
    mesh.visible = false;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, from: new THREE.Vector3(), target: null, t: 0, hold: null, fade: 0, seed: 0, tick: 0 };
  });
  let vi = 0;
  const vEnd = new THREE.Vector3();
  function updateVines(dt) {
    for (const vn of vinePool) {
      if (!vn.mesh.visible) continue;
      vn.t += dt;
      const holding = vn.hold ? vn.hold(vn.target) : vn.t < 1.2;
      if (!holding || !vn.target?.visible) vn.fade += dt;
      if (vn.fade > 0.6) { vn.mesh.visible = false; continue; }
      if ((vn.tick = (vn.tick + 1) % 2) !== 0 && vn.t > 0.05) continue;
      vn.target.getWorldPosition(vEnd);
      const grow = Math.min(1, vn.t / 0.35);
      const mid = vn.from.clone().lerp(vEnd, 0.5).add(new THREE.Vector3(0, 1.6 + Math.sin(vn.seed) * 0.6, 1.4));
      const a = vn.from.clone().lerp(mid, 0.5).add(new THREE.Vector3(Math.sin(vn.seed * 3) * 0.6, 0, 0.6));
      const curve = new THREE.CatmullRomCurve3([vn.from.clone(), a, mid, vEnd.clone()]);
      vn.mesh.geometry.dispose();
      vn.mesh.geometry = new THREE.TubeGeometry(curve, 22, 0.13 * (1 - vn.fade), 5);
      vn.mesh.geometry.setDrawRange(0, Math.floor(vn.mesh.geometry.index.count * grow));
      vn.mesh.material.opacity = 1 - vn.fade / 0.6;
    }
  }
  // your last throw's path: faint white dots
  const GHOST_N = 48;
  const ghostPos = new Float32Array(GHOST_N * 3);
  const ghostA = new Float32Array(GHOST_N);
  const ghostGeo = new THREE.BufferGeometry();
  ghostGeo.setAttribute('position', new THREE.BufferAttribute(ghostPos, 3));
  ghostGeo.setAttribute('alpha', new THREE.BufferAttribute(ghostA, 1));
  const ghostMat = new THREE.ShaderMaterial({
    uniforms: { uH: { value: 800 } },
    vertexShader: `attribute float alpha; varying float vA; uniform float uH;
      void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(0.32 * projectionMatrix[1][1] * uH * 0.5 / max(0.5, -mv.z), 4.0, 14.0); }`,
    fragmentShader: `varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.25, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const ghostPts = new THREE.Points(ghostGeo, ghostMat);
  ghostPts.frustumCulled = false;
  ghostPts.visible = false;
  ghostPts.renderOrder = 4;
  const gTmp = new THREE.Vector2();
  ghostPts.onBeforeRender = (r) => { ghostMat.uniforms.uH.value = r.getDrawingBufferSize(gTmp).y; };
  scene.add(ghostPts);

  // a fireball light for the explosion
  const flash = new THREE.PointLight('#ffb15a', 0, 60, 1.6);
  scene.add(flash);
  let flashT = 0;
  const fireAtV = new THREE.Vector3();
  let fireAt = null;

  return {
    /** Where a block meets the sea: spray (bigger for a heavier, faster block), a foam ring. */
    splash(x, { size = 1, z = 0 } = {}) {
      const s = Math.min(2.2, size);
      const n = Math.round(26 + s * 30);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2;
        const sp = (1.5 + R() * 3.5) * s;
        v.set(Math.cos(a) * sp * 0.6, (6 + R() * 9) * Math.sqrt(s), Math.sin(a) * sp * 0.6);
        spray.spawn(tmp.set(x + (R() - 0.5) * s, 0.2, z + (R() - 0.5) * s), v, { life: 0.9 + R() * 0.7, size: 0.5 + R() * 0.7 * s, size1: 1.2 * s, color: R() < 0.7 ? '#eef4f8' : '#bfe0ec', alpha: 0.9, g: 20, drag: 0.6 });
      }
      for (let i = 0; i < 8 * s; i++) {
        spray.spawn(tmp.set(x + (R() - 0.5) * 2 * s, 0.5, z + (R() - 0.5) * 2 * s), v.set((R() - 0.5) * 2, 1 + R() * 2, (R() - 0.5) * 2), { life: 2.2, size: 2.5 * s, size1: 5 * s, color: '#e9eef2', alpha: 0.45, g: 0, drag: 1 });
      }
      ring({ x, z }, { s0: 1.5 * s, s1: 9 * s, life: 2.2 });
      ring({ x, z }, { s0: 0.8 * s, s1: 5 * s, life: 1.4 });
    },
    /** The crate's explosion at p (metres). */
    boom(p, r = 9) {
      for (let i = 0; i < 70; i++) {
        v.set((R() - 0.5), (R() - 0.3), (R() - 0.5)).normalize().multiplyScalar(4 + R() * 16);
        glow.spawn(p, v, { life: 0.35 + R() * 0.45, size: 1.6 + R() * 2.2, size1: 0.4, color: R() < 0.5 ? '#ffd27a' : '#ff7a2a', alpha: 1, g: 6, drag: 2.5 });
      }
      for (let i = 0; i < 14; i++) {
        v.set((R() - 0.5) * 5, R() * 4, (R() - 0.5) * 5);
        glow.spawn(tmp.copy(p).add(new THREE.Vector3((R() - 0.5) * 2, (R() - 0.5) * 2, (R() - 0.5) * 2)), v, { life: 0.5 + R() * 0.3, size: r * 0.55, size1: r * 0.9, color: '#ff9a3c', alpha: 0.9, drag: 3 });
      }
      for (let i = 0; i < 40; i++) {
        v.set((R() - 0.5), R() * 0.5, (R() - 0.5)).normalize().multiplyScalar(14 + R() * 18);
        glow.spawn(p, v, { life: 0.6 + R() * 0.6, size: 0.25, size1: 0.05, color: '#ffe7a0', alpha: 1, g: 16, drag: 0.5 });
      }
      base.dust(p, { n: 22, size: 5, color: '#463c3a', up: 4, spread: 5, life: 3.4 });
      base.dust(p, { n: 10, size: 3.5, color: '#8a6a52', up: 2, spread: 4, life: 2.4 });
      flash.position.copy(p);
      flash.intensity = 900;
      flashT = 0.45;
    },
    /** A block broken (a spear went through it, a shot hit the spikes). */
    shatter(p, material, { n = 12, size = 0.9, dir = null } = {}) {
      chunks(p, material, { n, size, speed: 10, dir });
      base.dust(p, { n: 8, size: 2.2, color: '#b8a48c', up: 1.5, spread: 2.5, life: 1.8 });
      for (let i = 0; i < 18; i++) {
        v.set((R() - 0.5) * 14, R() * 10, (R() - 0.5) * 8);
        glow.spawn(p, v, { life: 0.35 + R() * 0.3, size: 0.2, size1: 0.05, color: '#ffe0a0', alpha: 1, g: 18 });
      }
    },
    /** A hit: dust and chips from the point, along the shot's push. */
    hit(p, dir, k = 1, material = null) {
      base.dust(p, { n: Math.round(6 + 10 * k), size: 2 + k * 1.6, color: '#b9a589', up: 1.6, spread: 2.4, life: 1.9 });
      // (a block splinters in its own colour; the rock in stone chips)
      if (material) chunks(p, material, { n: Math.round(5 + 8 * k), size: 0.42, speed: 7 + 4 * k, dir });
      else base.chips(p, dir, Math.round(6 + 12 * k), 7 + 5 * k);
    },
    /** A landing's puff (Perfek: a gold ring and sparks). */
    land(p, rating, w = 3) {
      base.dust({ x: p.x, y: p.y, z: 0 }, { n: rating === 'P' ? 10 : 5, size: 1.3, color: '#cbb89c', up: 0.6, spread: w * 0.6, life: 1.3 });
      if (rating === 'P') {
        ring({ x: p.x, z: 0 }, { s0: w * 0.6, s1: w * 2.6, life: 0.9, gold: true, y: p.y + 0.05 });
        for (let i = 0; i < 26; i++) {
          v.set((R() - 0.5) * 9, 2 + R() * 7, (R() - 0.5) * 6);
          glow.spawn(tmp.set(p.x + (R() - 0.5) * w, p.y + 0.1, (R() - 0.5) * 3), v, { life: 0.7 + R() * 0.5, size: 0.32, size1: 0.06, color: '#ffd46a', alpha: 1, g: 9 });
        }
      }
    },
    /** A burst of gold light (a Perfek throw leaving, the crown hit). */
    sparkle(p, n = 30, color = '#ffd46a', speed = 8) {
      for (let i = 0; i < n; i++) {
        v.set((R() - 0.5), (R() - 0.2), (R() - 0.5)).normalize().multiplyScalar(speed * (0.4 + R()));
        glow.spawn(p, v, { life: 0.6 + R() * 0.6, size: 0.4, size1: 0.05, color, alpha: 1, g: 4, drag: 1.2 });
      }
    },
    /** 🔥 A burning block's flames at p (world), `w` metres wide: called every frame while it burns. */
    flame(p, w = 2, k = 1) {
      // the body of the flames in plain colour (orange and red stay orange and red against a bright sky), a hot core
      // that glows on top of it, smoke, embers
      const n = Math.max(1, Math.round(2.4 * k));
      for (let i = 0; i < n; i++) {
        const x = p.x + (R() - 0.5) * w * 0.9;
        spray.spawn(tmp.set(x, p.y + R() * 0.25, (R() - 0.5) * 2.4), v.set((R() - 0.5) * 0.7, 2.6 + R() * 3, (R() - 0.5) * 0.4),
          { life: 0.45 + R() * 0.35, size: 1.1 + R() * 1.2 * k, size1: 0.25, color: R() < 0.55 ? '#ff7a1c' : '#e8401a', alpha: 0.85, drag: 0.8 });
      }
      if (R() < 0.7 * k) {
        glow.spawn(tmp.set(p.x + (R() - 0.5) * w * 0.7, p.y + R() * 0.3, (R() - 0.5) * 2), v.set((R() - 0.5) * 0.5, 2 + R() * 2, 0),
          { life: 0.35 + R() * 0.25, size: 0.9 + R() * 0.8 * k, size1: 0.2, color: R() < 0.5 ? '#ffc04a' : '#ff9a2e', alpha: 0.55, drag: 0.8 });
      }
      if (R() < 0.18 * k) base.dust({ x: p.x + (R() - 0.5) * w, y: p.y + 1.2, z: 0 }, { n: 1, size: 2, color: '#2e2420', up: 2.6, spread: 0.7, life: 2.4 });
      // embers
      if (R() < 0.3 * k) glow.spawn(tmp.set(p.x + (R() - 0.5) * w, p.y + 0.5, (R() - 0.5) * 2), v.set((R() - 0.5) * 3, 4 + R() * 5, (R() - 0.5) * 2), { life: 0.9, size: 0.2, size1: 0.05, color: '#ffd27a', alpha: 1, g: -1, drag: 0.4 });
    },
    /** The firelight over what burns (null when nothing does): the explosion's light, flickering, when it's free. */
    fireGlow(p) { fireAt = p ? fireAtV.copy(p) : null; },
    /** 💧 A Watervat brimming: a drop or two running off its edge. */
    drip(p, w = 2) {
      const side = R() < 0.5 ? -1 : 1;
      spray.spawn(tmp.set(p.x + side * w * (0.35 + R() * 0.15), p.y - R() * 0.4, (R() - 0.5) * 2.2), v.set(side * (0.3 + R() * 0.6), -0.5 - R(), 0),
        { life: 0.7 + R() * 0.4, size: 0.24 + R() * 0.12, size1: 0.12, color: R() < 0.5 ? '#9fdcff' : '#e6f6ff', alpha: 0.95, g: 12 });
    },
    /** 💧 Steam where water meets fire: white puffs rising, a few drops. */
    steam(p, w = 2) {
      base.dust({ x: p.x, y: p.y + 0.4, z: 0 }, { n: 10, size: 2.2, color: '#f2f5f8', up: 3.2, spread: w * 0.5, life: 1.8 });
      for (let i = 0; i < 14; i++) {
        spray.spawn(tmp.set(p.x + (R() - 0.5) * w, p.y + 0.3, (R() - 0.5) * 2), v.set((R() - 0.5) * 2, 2 + R() * 3, (R() - 0.5) * 2), { life: 0.6 + R() * 0.4, size: 0.3, size1: 0.1, color: '#d8efff', alpha: 0.85, g: 8 });
      }
    },
    /** 💧 The flood wave: a wall of water bursting along `dir` from p, spray falling back. */
    wave(p, dir, size = 1) {
      for (let i = 0; i < 90 * size; i++) {
        const sp = 6 + R() * 12;
        v.set(dir * sp * (0.6 + R() * 0.6), 3 + R() * 9, (R() - 0.5) * 5);
        spray.spawn(tmp.set(p.x + (R() - 0.5) * 2, p.y + R() * 1.5, (R() - 0.5) * 2.4), v, { life: 0.9 + R() * 0.7, size: 0.5 + R() * 0.9, size1: 1.4, color: R() < 0.6 ? '#e9f6ff' : '#7cc8f2', alpha: 0.92, g: 16, drag: 0.5 });
      }
      for (let i = 0; i < 16; i++) {
        spray.spawn(tmp.set(p.x + dir * R() * 4, p.y + 0.5, (R() - 0.5) * 3), v.set(dir * (2 + R() * 3), 1 + R(), 0), { life: 1.8, size: 2.2, size1: 4.2, color: '#eef7ff', alpha: 0.4, drag: 1 });
      }
    },
    /** 🌿 Vines from `from` to each object in `targets` (meshes that move): they grow, hold while `hold()` says so, fade. */
    vines(from, targets, hold) {
      for (const t of targets.slice(0, VINE_N)) {
        const vn = vinePool[vi++ % VINE_N];
        vn.from.copy(from);
        vn.target = t;
        vn.t = 0;
        vn.hold = hold;
        vn.fade = 0;
        vn.mesh.visible = true;
        vn.seed = R() * 10;
      }
    },
    /** Your last throw's path (metres: [{x, y}]), faint, while you aim again (null hides it). */
    lastTrail(path) {
      if (!path || path.length < 2) { ghostPts.visible = false; return; }
      const n = Math.min(GHOST_N, path.length);
      for (let i = 0; i < GHOST_N; i++) {
        const q = path[Math.min(path.length - 1, Math.floor((i / Math.max(1, n - 1)) * (path.length - 1)))];
        ghostPos[i * 3] = q.x; ghostPos[i * 3 + 1] = q.y; ghostPos[i * 3 + 2] = 0;
        ghostA[i] = i < n ? 0.5 : 0;
      }
      ghostGeo.attributes.position.needsUpdate = true;
      ghostGeo.attributes.alpha.needsUpdate = true;
      ghostPts.visible = true;
    },
    /** The shot's trail follows `obj`: gold for a Perfek, else in its element's colour (fire leaves embers and smoke). */
    trail(obj, perfect = false, element = null) { trailOf = obj; trailT = 0; this.trailGold = perfect; this.trailEl = element; },
    stopTrail() { trailOf = null; },
    /** The throw's arc (metres: [{x, y}]) and where it lands; `perfect` turns it gold. */
    showArc(path, hit, perfect) {
      arcPath = path;
      arcPerfect = perfect;
      arc.visible = path.length > 1;
      arcMat.uniforms.uCol.value.set(perfect ? '#ffcf4a' : '#ffffff');
      mark.visible = !!hit;
      if (hit) {
        mark.position.set(hit.x, hit.y, 1.75);
        markMat.color.set(perfect ? '#ffcf4a' : hit.sea ? '#bfe6ff' : '#ffffff');
      }
    },
    hideArc() { arc.visible = false; mark.visible = false; arcPath = []; },
    update(dt, camera) {
      updateVines(dt);
      base.update(dt, 16);
      spray.update(dt);
      glow.update(dt);
      for (const r of rings) {
        if (!r.m.visible) continue;
        r.age += dt;
        const k = r.age / r.life;
        if (k >= 1) { r.m.visible = false; continue; }
        const s = r.s0 + (r.s1 - r.s0) * (1 - (1 - k) ** 2.4);
        r.m.scale.set(s, s, s);
        r.m.material.opacity = (1 - k) ** 1.4 * 0.9;
      }
      for (const c of chunkPool) {
        if (!c.m.visible) continue;
        c.life -= dt;
        c.v.y -= 22 * dt;
        if (c.m.position.y < 0) {
          if (!c.wet) { c.wet = true; c.v.multiplyScalar(0.2); this.splash(c.m.position.x, { size: 0.25, z: c.m.position.z }); }
          c.v.y = Math.max(c.v.y, -2.5);
        }
        c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.w.x * dt;
        c.m.rotation.y += c.w.y * dt;
        if (c.life <= 0 || c.m.position.y < -6) c.m.visible = false;
      }
      if (trailOf) {
        trailT += dt;
        trailOf.getWorldPosition(tmp);
        const gold = this.trailGold;
        const el = this.trailEl;
        const col = gold ? '#ffcf5a' : el === 'vuur' ? (R() < 0.5 ? '#ff8a2a' : '#ffd25a') : el === 'gras' ? '#8bea5c' : el === 'water' ? '#8fd8ff' : el === 'plof' ? '#ff6a4a' : '#fff1d8';
        for (let i = 0; i < (el === 'vuur' ? 3 : 2); i++) {
          glow.spawn(tmp.clone().add(new THREE.Vector3((R() - 0.5) * 0.6, (R() - 0.5) * 0.6, (R() - 0.5) * 0.6)), v.set(0, el === 'vuur' ? 1.6 : 0.3, 0), { life: el === 'vuur' ? 0.7 : 0.55, size: gold ? 1.5 : 1.25, size1: 0.2, color: col, alpha: gold || el ? 0.85 : 0.55 });
        }
        if (el === 'water' && R() < 0.5) spray.spawn(tmp.clone(), v.set((R() - 0.5) * 2, -1, (R() - 0.5) * 2), { life: 0.8, size: 0.35, size1: 0.15, color: '#cfeeff', alpha: 0.9, g: 14 });
        if (trailT > 0.05) { trailT = 0; base.dust(tmp, { n: 1, size: el === 'vuur' ? 1.8 : 1.2, color: el === 'vuur' ? '#3a2a24' : '#d9cdbd', up: 0.6, spread: 0.4, life: el === 'vuur' ? 1.4 : 0.9 }); }
      }
      if (arc.visible) {
        arcFlow = (arcFlow + dt * 1.6) % 1;
        const n = arcPath.length;
        for (let i = 0; i < ARC_N; i++) {
          const f = (i + arcFlow) / ARC_N;
          const j = f * (n - 1);
          const a = Math.floor(j);
          const b = Math.min(n - 1, a + 1);
          const t = j - a;
          const pa = arcPath[a];
          const pb = arcPath[b];
          arcPos[i * 3] = pa.x + (pb.x - pa.x) * t;
          arcPos[i * 3 + 1] = pa.y + (pb.y - pa.y) * t;
          arcPos[i * 3 + 2] = 0;
          arcA[i] = 0.55 + 0.45 * Math.min(1, f * 5);
          arcS[i] = arcPerfect ? 0.42 : 0.34;
        }
        arcGeo.attributes.position.needsUpdate = true;
        arcGeo.attributes.alpha.needsUpdate = true;
        arcGeo.attributes.size.needsUpdate = true;
      }
      if (mark.visible && camera) {
        mark.quaternion.copy(camera.quaternion);
        const pulse = 1 + 0.12 * Math.sin(performance.now() / 120);
        mark.scale.setScalar((arcPerfect ? 4.2 : 3.4) * pulse);
      }
      if (flashT > 0) {
        flashT -= dt;
        flash.intensity = Math.max(0, flashT / 0.45) ** 2 * 900;
      } else if (fireAt) {
        const t = performance.now();
        flash.position.copy(fireAt);
        flash.intensity = 240 + 80 * Math.sin(t / 47) * Math.sin(t / 113) + 40 * Math.sin(t / 29);
      } else flash.intensity = 0;
    },
  };
}
