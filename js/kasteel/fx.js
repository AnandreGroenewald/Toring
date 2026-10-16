// (1.17 3D) Die Kasteelreeks: what flies and drifts — dust clouds that bloom and fade (soft round sprites), stone chips
// thrown out by a hit, and arrows on their arcs. Each kind is a pool, reused; nothing is made during a battle.
import * as THREE from '../../lib/three.module.min.js';

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFx(scene) {
  const dot = softDot();
  // dust: sprites that rise, grow and fade
  const dust = [];
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#b79c7c', transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    scene.add(s);
    dust.push({ s, life: 0, max: 1, v: new THREE.Vector3(), grow: 1 });
  }
  let di = 0;
  // chips: small stones on ballistic paths
  const chipGeo = new THREE.DodecahedronGeometry(0.22, 0);
  const chips = new THREE.InstancedMesh(chipGeo, new THREE.MeshStandardMaterial({ color: '#9c8b74', roughness: 0.95, flatShading: true }), 120);
  chips.castShadow = true;
  chips.frustumCulled = false;
  scene.add(chips);
  const chip = Array.from({ length: 120 }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1, life: 0 }));
  let ci = 0;
  // arrows: thin shafts with a pale fletching, flying an arc from a to b in `dur` seconds
  // (a little larger than life, and pale-fletched, so they read as they fly)
  const arrowGeo = new THREE.BoxGeometry(0.07, 0.07, 1.25);
  const fletch = new THREE.BoxGeometry(0.2, 0.02, 0.28);
  fletch.translate(0, 0, -0.5);
  const arrowAll = new THREE.BufferGeometry();
  {
    const a = arrowGeo.toNonIndexed();
    const f = fletch.toNonIndexed();
    const pos = new Float32Array([...a.attributes.position.array, ...f.attributes.position.array]);
    const nor = new Float32Array([...a.attributes.normal.array, ...f.attributes.normal.array]);
    const col = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) { const pale = i >= a.attributes.position.array.length; col[i] = pale ? 0.92 : 0.25; col[i + 1] = pale ? 0.9 : 0.17; col[i + 2] = pale ? 0.85 : 0.1; }
    arrowAll.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    arrowAll.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    arrowAll.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const arrows = new THREE.InstancedMesh(arrowAll, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 160);
  arrows.frustumCulled = false;
  scene.add(arrows);
  const arrow = Array.from({ length: 160 }, () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), t: 0, dur: 1, h: 2, live: false, done: null }));
  let ai = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const fwd = new THREE.Vector3(0, 0, 1);
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  return {
    /** A dust burst at `p`: `n` puffs, `size` metres, `color`. */
    dust(p, { n = 10, size = 3, color = '#b79c7c', up = 2, spread = 3, life = 2.4 } = {}) {
      for (let k = 0; k < n; k++) {
        const d = dust[di++ % dust.length];
        d.s.visible = true;
        d.s.material.color.set(color);
        d.s.position.set(p.x + (Math.random() - 0.5) * spread, p.y + Math.random() * spread * 0.4, p.z + (Math.random() - 0.5) * spread);
        d.v.set((Math.random() - 0.5) * spread, up * (0.4 + Math.random()), (Math.random() - 0.5) * spread);
        d.life = 0;
        d.max = life * (0.7 + Math.random() * 0.6);
        d.size = size * (0.6 + Math.random() * 0.8);
        d.grow = 1.8 + Math.random();
      }
    },
    /** Stone chips thrown from `p` along `dir` (a hit's push). */
    chips(p, dir, n = 16, speed = 9) {
      for (let k = 0; k < n; k++) {
        const c = chip[ci++ % chip.length];
        c.p.copy(p);
        c.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.9, (Math.random() - 0.5) * speed).addScaledVector(dir, speed * 0.5);
        c.w.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
        c.s = 0.5 + Math.random() * 1.4;
        c.life = 3.5;
      }
    },
    /** An arrow from a to b; `done()` when it lands. */
    arrow(a, b, done) {
      const r = arrow[ai++ % arrow.length];
      r.a.copy(a);
      r.b.copy(b);
      r.t = 0;
      const dist = a.distanceTo(b);
      r.dur = 0.35 + dist / 42;
      r.h = 1 + dist * 0.11;
      r.live = true;
      r.done = done;
    },
    update(dt, gravity = 16) {
      for (const d of dust) {
        if (!d.s.visible) continue;
        d.life += dt;
        const k = d.life / d.max;
        if (k >= 1) { d.s.visible = false; continue; }
        d.s.position.addScaledVector(d.v, dt);
        d.v.multiplyScalar(Math.exp(-dt * 1.6));
        const sz = d.size * (1 + k * d.grow);
        d.s.scale.set(sz, sz, sz);
        d.s.material.opacity = 0.55 * Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k);
      }
      for (let i = 0; i < chip.length; i++) {
        const c = chip[i];
        if (c.life <= 0) { chips.setMatrixAt(i, zero); continue; }
        c.life -= dt;
        c.v.y -= gravity * dt;
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < 0.1) { c.p.y = 0.1; c.v.set(c.v.x * 0.4, -c.v.y * 0.25, c.v.z * 0.4); c.w.multiplyScalar(0.5); }
        c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
        q.setFromEuler(c.r);
        m4.compose(c.p, q, tmp.set(c.s, c.s, c.s));
        chips.setMatrixAt(i, m4);
      }
      chips.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < arrow.length; i++) {
        const r = arrow[i];
        if (!r.live) { arrows.setMatrixAt(i, zero); continue; }
        r.t += dt / r.dur;
        if (r.t >= 1) { r.live = false; arrows.setMatrixAt(i, zero); r.done?.(); continue; }
        const at = (t, out) => out.copy(r.a).lerp(r.b, t).add(tmp2.set(0, 4 * r.h * t * (1 - t), 0));
        at(r.t, tmp);
        const p = tmp.clone();
        at(Math.min(1, r.t + 0.02), tmp);
        q.setFromUnitVectors(fwd, tmp.sub(p).normalize());
        m4.compose(p, q, one);
        arrows.setMatrixAt(i, m4);
      }
      arrows.instanceMatrix.needsUpdate = true;
    },
  };
}
