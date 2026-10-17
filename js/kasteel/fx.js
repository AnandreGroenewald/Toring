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
  // dust: one cloud of soft points (one draw for all of it, phones too) that rise, grow and fade
  const DN = 160;
  const dPos = new Float32Array(DN * 3);
  const dSize = new Float32Array(DN);
  const dAlpha = new Float32Array(DN);
  const dCol = new Float32Array(DN * 3);
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute('size', new THREE.BufferAttribute(dSize, 1));
  dGeo.setAttribute('alpha', new THREE.BufferAttribute(dAlpha, 1));
  dGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
  const dMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: dot }, uH: { value: 800 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uH;
      void main() { vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = alpha > 0.001 ? size * projectionMatrix[1][1] * uH * 0.5 / max(0.5, -mv.z) : 0.0; }`,
    fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC;
      void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const dPoints = new THREE.Points(dGeo, dMat);
  dPoints.frustumCulled = false;
  dPoints.onBeforeRender = (r) => { dMat.uniforms.uH.value = r.getDrawingBufferSize(tmpSize).y; };
  scene.add(dPoints);
  const tmpSize = new THREE.Vector2();
  const dust = Array.from({ length: DN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 1, grow: 1, c: new THREE.Color(), on: false }));
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
  let chipsClear = false;
  let arrowsClear = false;
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
        d.on = true;
        d.c.set(color);
        d.p.set(p.x + (Math.random() - 0.5) * spread, p.y + Math.random() * spread * 0.4, p.z + (Math.random() - 0.5) * spread);
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
      let live = false;
      for (let i = 0; i < DN; i++) {
        const d = dust[i];
        if (!d.on) { dAlpha[i] = 0; continue; }
        d.life += dt;
        const k = d.life / d.max;
        if (k >= 1) { d.on = false; dAlpha[i] = 0; continue; }
        live = true;
        d.p.addScaledVector(d.v, dt);
        d.v.multiplyScalar(Math.exp(-dt * 1.6));
        dPos[i * 3] = d.p.x; dPos[i * 3 + 1] = d.p.y; dPos[i * 3 + 2] = d.p.z;
        dSize[i] = d.size * (1 + k * d.grow);
        dAlpha[i] = 0.55 * Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k);
        dCol[i * 3] = d.c.r; dCol[i * 3 + 1] = d.c.g; dCol[i * 3 + 2] = d.c.b;
      }
      dPoints.visible = live;
      if (live) {
        dGeo.attributes.position.needsUpdate = true;
        dGeo.attributes.size.needsUpdate = true;
        dGeo.attributes.alpha.needsUpdate = true;
        dGeo.attributes.color.needsUpdate = true;
      }
      // (nothing flying: nothing to write)
      if (!chip.some((c) => c.life > 0) && chipsClear) { chips.visible = false; } else {
      chips.visible = true;
      chipsClear = !chip.some((c) => c.life > 0);
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
      }
      if (!arrow.some((r) => r.live) && arrowsClear) { arrows.visible = false; return; }
      arrows.visible = true;
      arrowsClear = !arrow.some((r) => r.live);
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
