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
  function ring(p, { s0 = 1, s1 = 6, life = 1.6, gold = false, flat = true, y = 0.08, color = null, add = false } = {}) {
    const r = rings[ri++ % rings.length];
    r.m.visible = true;
    r.m.position.set(p.x, flat ? y : p.y, p.z || 0);
    r.m.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
    r.m.material.color.set(color || (gold ? '#ffcf5a' : '#f4f0ea'));
    r.m.material.blending = gold || add ? THREE.AdditiveBlending : THREE.NormalBlending;
    r.age = 0;
    r.life = life;
    r.s0 = s0;
    r.s1 = s1;
    r.flat = flat;
  }
  // a block's pieces: splinters and shards in its own colour that fly, spin, and drop into the sea
  const chunkGeo = new THREE.BoxGeometry(1, 0.5, 0.7);
  const chunkPool = Array.from({ length: 48 }, () => {
    const m = new THREE.Mesh(chunkGeo, null);
    m.castShadow = true;
    m.visible = false;
    scene.add(m);
    return { m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, wet: false, rest: null };
  });
  let ki = 0;
  function chunks(p, material, { n = 10, size = 1, speed = 9, dir = null } = {}) {
    for (let i = 0; i < n; i++) {
      const c = chunkPool[ki++ % chunkPool.length];
      c.m.material = Array.isArray(material) ? material[1] : material;
      c.m.visible = true;
      c.m.position.set(p.x + (R() - 0.5) * size, p.y + (R() - 0.5) * size, (R() - 0.5) * 2.4);
      const cs = size * (0.3 + R() * 0.45);
      c.m.scale.set(cs * (0.7 + R() * 0.9), cs * (0.45 + R() * 0.5), cs * (0.6 + R() * 0.6));
      c.v.set((R() - 0.5) * speed, R() * speed * 0.9 + 2, (R() - 0.5) * speed * 0.8);
      if (dir) c.v.addScaledVector(dir, speed * 0.6);
      c.w.set(R() * 8, R() * 8, R() * 8);
      c.life = 4;
      c.wet = false;
      c.rest = null;
    }
  }
  /**
   * A piece meeting the rock (the world's `scene.userData.solids`: a sea stack or an island, { x, z, top,
   * radiusAt(y, angle) }): from above it lands on the top, bounces a little and lies there; against a cliff it glances
   * off and drops on into the sea. (It never falls through the rock to splash unseen inside it.)
   */
  function meetRock(c, wasY, solids) {
    const p = c.m.position;
    for (const s of solids) {
      if (p.y > s.top + 0.6) continue;
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      const r = s.radiusAt(Math.min(p.y, s.top), Math.atan2(dx, dz));
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const half = 0.25 * c.m.scale.y;
      if (wasY >= s.top - 0.1) {   // (from above: on to the top)
        if (p.y > s.top + half) return;
        p.y = s.top + half;
        if (c.v.y < -3) {
          c.v.set(c.v.x * 0.5, -c.v.y * 0.3, c.v.z * 0.5);
          c.w.multiplyScalar(0.5);
        } else {
          c.v.set(0, 0, 0);
          c.m.rotation.x = 0;
          c.m.rotation.z = 0;
          c.rest = c.m.scale.clone();
        }
      } else {   // (against the cliff: out to its face, its push turned away from it)
        const d = Math.sqrt(d2) || 0.001;
        p.x = s.x + (dx / d) * r;
        p.z = s.z + (dz / d) * r;
        const into = (c.v.x * dx + c.v.z * dz) / d;
        if (into < 0) {
          c.v.x -= 1.5 * into * (dx / d);
          c.v.z -= 1.5 * into * (dz / d);
        }
      }
      return;
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

  // 🌿 vines: they climb over the rock's edge (where they drag to), loop round the block and pull; each a tube made once
  // and bent in place as its end moves (every other frame), growing in, fading out; a lasso round each block they hold
  const VINE_N = 8;
  const TUBE_SEG = 48;   // (rings along a vine)
  const TUBE_RAD = 6;    // (sides round it)
  const TWIST_N = 22;    // (points on its twisting path)
  /** A tube's geometry, made once: its points and normals rewritten as the vine moves (TubeGeometry's layout). */
  function tubeGeometry() {
    const g = new THREE.BufferGeometry();
    const n = (TUBE_SEG + 1) * (TUBE_RAD + 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = [];
    for (let i = 0; i <= TUBE_SEG; i++) for (let j = 0; j <= TUBE_RAD; j++) uv.push(i / TUBE_SEG, j / TUBE_RAD);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const idx = [];
    for (let j = 1; j <= TUBE_SEG; j++) {
      for (let i = 1; i <= TUBE_RAD; i++) {
        const a = (TUBE_RAD + 1) * (j - 1) + (i - 1);
        const b = (TUBE_RAD + 1) * j + (i - 1);
        const c = (TUBE_RAD + 1) * j + i;
        const d = (TUBE_RAD + 1) * (j - 1) + i;
        idx.push(a, b, d, b, c, d);
      }
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    return g;
  }
  // (the frames along a tube: tangent, normal, binormal at each ring, carried along without twisting)
  const tR = Array.from({ length: TUBE_SEG + 1 }, () => new THREE.Vector3());
  const tT = Array.from({ length: TUBE_SEG + 1 }, () => new THREE.Vector3());
  const tN = Array.from({ length: TUBE_SEG + 1 }, () => new THREE.Vector3());
  const tB = Array.from({ length: TUBE_SEG + 1 }, () => new THREE.Vector3());
  const tP = new THREE.Vector3();
  const tV = new THREE.Vector3();
  const RING_SIN = Array.from({ length: TUBE_RAD + 1 }, (_, j) => Math.sin((j / TUBE_RAD) * Math.PI * 2));
  const RING_COS = Array.from({ length: TUBE_RAD + 1 }, (_, j) => -Math.cos((j / TUBE_RAD) * Math.PI * 2));
  /**
   * Bends a tube geometry along `curve`, `radius` thick: its rings evenly along the curve's own parameter (the points
   * it runs through are evenly spaced already: no arc-length tables to remake every time it moves), each ring's
   * direction from its neighbours.
   */
  function bendTube(geo, curve, radius) {
    for (let i = 0; i <= TUBE_SEG; i++) curve.getPoint(i / TUBE_SEG, tR[i]);
    for (let i = 0; i <= TUBE_SEG; i++) tT[i].subVectors(tR[Math.min(TUBE_SEG, i + 1)], tR[Math.max(0, i - 1)]).normalize();
    // (the first normal: across the tangent's smallest direction, as three.js picks it; then each ring's, turned with it)
    const t0 = tT[0];
    let min = Infinity;
    if (Math.abs(t0.x) <= min) { min = Math.abs(t0.x); tV.set(1, 0, 0); }
    if (Math.abs(t0.y) <= min) { min = Math.abs(t0.y); tV.set(0, 1, 0); }
    if (Math.abs(t0.z) <= min) tV.set(0, 0, 1);
    tP.crossVectors(t0, tV).normalize();
    tN[0].crossVectors(t0, tP);
    tB[0].crossVectors(t0, tN[0]);
    for (let i = 1; i <= TUBE_SEG; i++) {
      tN[i].copy(tN[i - 1]).addScaledVector(tT[i], -tN[i - 1].dot(tT[i]));
      if (tN[i].lengthSq() < 1e-10) tN[i].copy(tN[i - 1]);
      tN[i].normalize();
      tB[i].crossVectors(tT[i], tN[i]);
    }
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    let q = 0;
    for (let i = 0; i <= TUBE_SEG; i++) {
      const P = tR[i];
      const N = tN[i];
      const B = tB[i];
      for (let j = 0; j <= TUBE_RAD; j++) {
        const sin = RING_SIN[j];
        const cos = RING_COS[j];
        const nx = cos * N.x + sin * B.x;
        const ny = cos * N.y + sin * B.y;
        const nz = cos * N.z + sin * B.z;
        nor[q] = nx;
        nor[q + 1] = ny;
        nor[q + 2] = nz;
        pos[q] = P.x + radius * nx;
        pos[q + 1] = P.y + radius * ny;
        pos[q + 2] = P.z + radius * nz;
        q += 3;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }
  const vineMat = new THREE.MeshStandardMaterial({ color: '#4cbb36', emissive: '#16420f', emissiveIntensity: 0.35, roughness: 0.6, transparent: true, opacity: 1 });
  // (their leaves: one instanced mesh, eight leaves along each vine, opening as it grows)
  const LEAVES = 12;
  const leafTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 64, 32);
    grd.addColorStop(0, '#a6ec62');
    grd.addColorStop(1, '#2c8a22');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(2, 16);
    g.quadraticCurveTo(28, -6, 62, 16);
    g.quadraticCurveTo(28, 38, 2, 16);
    g.fill();
    g.strokeStyle = 'rgba(22,72,16,0.75)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(4, 16);
    g.lineTo(58, 16);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.55, emissive: '#1d4f14', emissiveIntensity: 0.3 }), VINE_N * LEAVES);
  leafMesh.frustumCulled = false;
  const noLeaf = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < VINE_N * LEAVES; i++) leafMesh.setMatrixAt(i, noLeaf);
  scene.add(leafMesh);
  const lm = new THREE.Matrix4();
  const lq = new THREE.Quaternion();
  const le = new THREE.Euler();
  const ls = new THREE.Vector3();
  const lp = new THREE.Vector3();
  const vinePool = Array.from({ length: VINE_N }, () => {
    const mesh = new THREE.Mesh(tubeGeometry(), vineMat.clone());
    mesh.visible = false;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    // (its two curves, made once and moved: the way it climbs, and that way twisted)
    const base = new THREE.CatmullRomCurve3(Array.from({ length: 5 }, () => new THREE.Vector3()));
    base.arcLengthDivisions = 60;   // (five points: plenty to space the twist evenly along it)
    const path = new THREE.CatmullRomCurve3(Array.from({ length: TWIST_N + 1 }, () => new THREE.Vector3()));
    return { mesh, base, path, from: new THREE.Vector3(), rim: new THREE.Vector3(), target: null, t: 0, hold: null, fade: 0, seed: 0, tick: 0, side: 1, lasso: null };
  });
  let vi = 0;
  const vEnd = new THREE.Vector3();
  const vTmp = new THREE.Vector3();
  const lassoGeo = new THREE.TorusGeometry(1, 0.11, 6, 28);
  lassoGeo.rotateX(Math.PI / 2);   // (round the block, level)
  const lassoPool = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(lassoGeo, vineMat);
    m.castShadow = true;
    m.visible = false;
    return m;
  });
  let lsi = 0;
  function updateVines(dt) {
    let leavesMoved = false;
    vinePool.forEach((vn, idx) => {
      if (!vn.mesh.visible) return;
      vn.t += dt;
      const holding = vn.hold ? vn.hold(vn.target) : vn.t < 1.2;
      if (!holding || !vn.target?.visible) vn.fade += dt;
      if (vn.fade > 0.6) {
        vn.mesh.visible = false;
        if (vn.lasso) { vn.lasso.parent?.remove(vn.lasso); vn.lasso.visible = false; vn.lasso = null; }
        for (let L = 0; L < LEAVES; L++) leafMesh.setMatrixAt(idx * LEAVES + L, noLeaf);
        leavesMoved = true;
        return;
      }
      if (vn.lasso) vn.lasso.scale.set(vn.lasso.userData.rx * (1 - vn.fade * 0.4), 1, vn.lasso.userData.rz * (1 - vn.fade * 0.4));
      if ((vn.tick = (vn.tick + 1) % 2) !== 0 && vn.t > 0.05) return;
      vn.target.getWorldPosition(vEnd);
      const tw = (vn.target.userData.w || 2) / 2;
      vEnd.x -= vn.side * tw * 0.7;   // (it takes hold on the block's side towards the edge)
      vEnd.z += vn.zo * 0.6;
      const grow = Math.min(1, vn.t / 0.4);
      // from the cliff, over the rim, a loop up and across, down onto the block
      const [b0, b1, over, mid, b4] = vn.base.points;
      b0.copy(vn.from);
      b1.copy(vn.rim);
      over.copy(vn.rim).add(vTmp.set(-vn.side * 0.6, 0.9, 0));
      mid.copy(over).lerp(vEnd, 0.5).add(vTmp.set(0, 1.2 + Math.sin(vn.seed) * 0.5, 0.3 * vn.zo));
      b4.copy(vEnd);
      vn.base.updateArcLengths();
      // (a vine, not a pipe: it twists round its path as it climbs, more at the tip, and sways while it pulls)
      const pts = vn.path.points;
      const N = TWIST_N;
      const sway = Math.sin(vn.t * 5 + vn.seed) * 0.12;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = vn.base.getPointAt(t, pts[i]);
        if (i > 0 && i < N) {
          const a = t * Math.PI * 2 * 3.2 + vn.seed;
          const amp = 0.18 + 0.22 * t;
          p.x += Math.cos(a) * amp * 0.6 + sway * t;
          p.y += Math.sin(a * 0.5) * amp * 0.35;
          p.z += Math.sin(a) * amp;
        }
      }
      const curve = vn.path;
      bendTube(vn.mesh.geometry, curve, 0.15 * (1 - vn.fade));
      vn.mesh.geometry.setDrawRange(0, Math.floor(vn.mesh.geometry.index.count * grow));
      vn.mesh.material.opacity = 1 - vn.fade / 0.6;
      for (let L = 0; L < LEAVES; L++) {
        const tt = 0.1 + (L / (LEAVES - 1)) * 0.82;
        if (tt > grow) { leafMesh.setMatrixAt(idx * LEAVES + L, noLeaf); continue; }
        curve.getPoint(tt, lp);
        le.set(vn.seed * 3 + L * 1.9, vn.seed + L * 2.3, L * 0.7 + vn.seed);
        lq.setFromEuler(le);
        const sc = (1 - vn.fade / 0.6) * (0.95 + ((L * 37 + Math.floor(vn.seed * 10)) % 5) * 0.14);
        ls.set(sc, sc, sc);
        lm.compose(lp, lq, ls);
        leafMesh.setMatrixAt(idx * LEAVES + L, lm);
      }
      leavesMoved = true;
    });
    if (leavesMoved) leafMesh.instanceMatrix.needsUpdate = true;
  }
  // 💧 the flood wave: a curling sheet of water that rears up, rushes along the rock and crashes down, spray off its lip
  const waveGeo = (() => {
    const prof = [[0, 0], [0.3, 0.9], [0.8, 1.8], [1.5, 2.45], [2.25, 2.6], [2.85, 2.2], [3.1, 1.6]].map(([x, y]) => new THREE.Vector2(x, y));
    const pts = new THREE.SplineCurve(prof).getPoints(24);
    const NZ = 8;
    const W = 5;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let j = 0; j <= NZ; j++) for (let i = 0; i < pts.length; i++) { pos.push(pts[i].x, pts[i].y, (j / NZ - 0.5) * W); uv.push(i / (pts.length - 1), j / NZ); }
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = j * pts.length + i;
        idx.push(a, a + pts.length, a + 1, a + 1, a + pts.length, a + pts.length + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const waveTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 256, 0);   // (from its foot to its lip)
    grd.addColorStop(0, 'rgba(22,96,150,0)');
    grd.addColorStop(0.08, 'rgba(22,96,150,0.92)');
    grd.addColorStop(0.5, 'rgba(58,170,232,0.9)');
    grd.addColorStop(0.8, 'rgba(170,230,255,0.95)');
    grd.addColorStop(0.92, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0.85)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 64);
    for (let k = 0; k < 40; k++) {   // streaks running up its face
      g.strokeStyle = `rgba(255,255,255,${0.12 + Math.random() * 0.2})`;
      g.lineWidth = 1 + Math.random() * 1.5;
      const y = Math.random() * 64;
      g.beginPath();
      g.moveTo(40 + Math.random() * 60, y);
      g.lineTo(150 + Math.random() * 100, y + (Math.random() - 0.5) * 4);
      g.stroke();
    }
    g.globalCompositeOperation = 'destination-in';   // (soft at both sides)
    const side = g.createLinearGradient(0, 0, 0, 64);
    side.addColorStop(0, 'rgba(0,0,0,0)');
    side.addColorStop(0.16, 'rgba(0,0,0,1)');
    side.addColorStop(0.84, 'rgba(0,0,0,1)');
    side.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = side;
    g.fillRect(0, 0, 256, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const wavePool = [0, 1].map(() => {
    const m = new THREE.Mesh(waveGeo, new THREE.MeshStandardMaterial({ map: waveTex, transparent: true, opacity: 0.92, roughness: 0.1, metalness: 0, side: THREE.DoubleSide, depthWrite: false, emissive: '#0b3a5c', emissiveIntensity: 0.45, envMapIntensity: 1.6 }));
    m.visible = false;
    m.renderOrder = 2;
    scene.add(m);
    return { m, t: 0, life: 1.7, dir: 1, size: 1, p: new THREE.Vector3(), x0: 0, x1: 0, poured: 0, splashed: false };
  });
  let wvi = 0;
  // the foam it leaves on the rock: white lace on a soft round mask, flat on the rock top, sliding and draining away
  const foamTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let k = 0; k < 420; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 118;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r;
      g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
      g.beginPath();
      g.arc(x, y, 3 + Math.random() * 9, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(128, 128, 30, 128, 128, 128);
    m.addColorStop(0, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const foamPool = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, color: '#eef8ff', opacity: 0 }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.renderOrder = 1;
    scene.add(m);
    return { m, t: 0, life: 2.6, x: 0, dir: 1, size: 1, y: 0 };
  });
  let fmi = 0;
  function updateWaves(dt) {
    for (const w of wavePool) {
      if (!w.m.visible) continue;
      w.t += dt;
      const k = w.t / w.life;
      if (k >= 1) { w.m.visible = false; continue; }
      // it rears up in a moment, rushes across the rock to its edge, and pours over it
      const reach = Math.min(1, k / 0.62);
      const front = w.x0 + (w.x1 - w.x0) * (1 - (1 - reach) ** 1.6);
      const rise = Math.sin(Math.min(1, k * 4) * (Math.PI / 2));
      const over = k > 0.62 ? Math.max(0.02, 1 - (k - 0.62) / 0.38) : 1;
      const sx = w.size * 1.15;
      w.m.position.set(front - w.dir * 2.6 * sx, w.p.y - (k > 0.62 ? (k - 0.62) * 6 : 0), 0);
      w.m.scale.set(w.dir * sx, w.size * 1.35 * rise * over + 0.01, w.size * 1.25);
      w.m.material.opacity = 0.94 * Math.min(1, over * 1.6);
      const lx = front;
      const ly = w.p.y + 2.45 * w.m.scale.y;
      for (let i = 0; i < 3; i++) {
        spray.spawn(tmp.set(lx + (R() - 0.5), ly, (R() - 0.5) * 5 * w.size), v.set(w.dir * (3 + R() * 5), 1 + R() * 4, (R() - 0.5) * 2),
          { life: 0.6 + R() * 0.4, size: 0.4 + R() * 0.5, size1: 1, color: R() < 0.6 ? '#ffffff' : '#bfe6ff', alpha: 0.9, g: 14, drag: 0.6 });
      }
      // over the edge: a waterfall down the cliff, then a splash at its foot
      if (k > 0.55 && w.poured < 1) {
        w.poured += dt / 0.9;
        for (let i = 0; i < 6; i++) {
          spray.spawn(tmp.set(w.x1 + w.dir * (0.2 + R() * 0.5), w.p.y + R() * 0.6, (R() - 0.5) * 5.5 * w.size), v.set(w.dir * (1.5 + R() * 2.2), (R() - 0.3) * 1.5, (R() - 0.5) * 0.8),
            { life: 1.1 + R() * 0.5, size: 0.55 + R() * 0.8, size1: 1.4, color: R() < 0.5 ? '#f2fbff' : '#8fd2f6', alpha: 0.88, g: 20, drag: 0.15 });
        }
      }
      if (k > 0.85 && !w.splashed) { w.splashed = true; api.splash(w.x1 + w.dir * 2.4, { size: 1.6 * w.size }); }
    }
    for (const f of foamPool) {
      if (!f.m.visible) continue;
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { f.m.visible = false; continue; }
      f.m.position.set(f.x + f.dir * 3 * Math.min(1, k * 1.5), f.y, 0);
      const s = f.size * (5.5 + 3 * k);
      f.m.scale.set(s, s * 0.75, 1);
      f.m.material.opacity = 0.9 * Math.min(1, k * 6) * (1 - k) ** 1.2;
      f.m.rotation.z = k * 0.4 * f.dir;
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
  let flashPeak = 900;
  let flashDur = 0.45;
  const fireAtV = new THREE.Vector3();
  let fireAt = null;

  const api = {
    /** Where a block meets the sea: spray (bigger for a heavier, faster block), foam rings (`rings`: 1 for a small piece). */
    splash(x, { size = 1, z = 0, rings: nRings = 2 } = {}) {
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
      if (nRings > 1) ring({ x, z }, { s0: 0.8 * s, s1: 5 * s, life: 1.4 });
    },
    /** The crate's explosion at p (metres). */
    /**
     * 💣 The explosion at p (metres): a short white-hot core, a fireball of orange and red rolling out and up (in plain
     * colour, so it stays orange against the sky instead of burning out to white), black smoke billowing after it,
     * sparks and burning bits, and a shockwave racing out.
     */
    boom(p, r = 9) {
      for (let i = 0; i < 12; i++) {
        v.set(R() - 0.5, R() - 0.3, R() - 0.5).normalize().multiplyScalar(2 + R() * 5);
        glow.spawn(p, v, { life: 0.16 + R() * 0.12, size: 2 + R() * 1.4, size1: 0.6, color: R() < 0.5 ? '#fff0b0' : '#ffbe55', alpha: 0.85, drag: 3 });
      }
      for (let i = 0; i < 44; i++) {
        v.set(R() - 0.5, R() * 0.8 - 0.1, R() - 0.5).normalize().multiplyScalar(3 + R() * 9);
        const c = R();
        spray.spawn(tmp.set(p.x + (R() - 0.5) * 1.5, p.y + (R() - 0.5) * 1.2, (p.z || 0) + (R() - 0.5) * 1.2), v,
          { life: 0.5 + R() * 0.5, size: 1.8 + R() * 1.5, size1: 3.2 + R() * 2.2, color: c < 0.3 ? '#ffb347' : c < 0.72 ? '#ff6a1f' : '#c4301a', alpha: 1, g: -3, drag: 2.4 });
      }
      // (smoke rising off it, behind the tower and up: the tower stays in sight)
      base.dust({ x: p.x, y: p.y + 1.8, z: (p.z || 0) - 1.6 }, { n: 8, size: 2.4, color: '#2e2826', up: 6.5, spread: 1.8, life: 1.6 });
      base.dust({ x: p.x, y: p.y + 0.6, z: (p.z || 0) - 1.2 }, { n: 4, size: 1.8, color: '#5a4a44', up: 3.5, spread: 1.6, life: 1.2 });
      for (let i = 0; i < 46; i++) {
        v.set(R() - 0.5, R() * 0.7 - 0.05, R() - 0.5).normalize().multiplyScalar(12 + R() * 16);
        glow.spawn(p, v, { life: 0.5 + R() * 0.7, size: 0.22 + R() * 0.12, size1: 0.05, color: R() < 0.6 ? '#ffd27a' : '#ff8a3a', alpha: 1, g: 16, drag: 0.4 });
      }
      ring({ x: p.x, z: 0 }, { s0: 1, s1: r * 2.2, life: 0.55, color: '#ffb066', add: true, y: p.y - 0.6 });
      ring({ x: p.x, y: p.y, z: 0.5 }, { s0: 1, s1: r * 1.6, life: 0.4, color: '#ffe2b8', add: true, flat: false });
      flash.position.copy(p).add(new THREE.Vector3(0, 1, 3));
      flashPeak = 520;
      flashDur = 0.32;
      flashT = flashDur;
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
    /**
     * The wind made visible: a few motes of spray and dust drifting through the picture round `around` (metres),
     * `k` from -1 (blowing left) to 1 (right). Called every frame while the wind blows.
     */
    breeze(around, k) {
      if (R() > Math.abs(k) * 0.9 + 0.15) return;
      const dir = Math.sign(k);
      spray.spawn(tmp.set(around.x - dir * (14 + R() * 10), around.y + (R() - 0.3) * 18, (R() - 0.5) * 14),
        v.set(dir * (5 + Math.abs(k) * 14) * (0.7 + R() * 0.6), (R() - 0.5) * 0.8, 0),
        { life: 2.4 + R(), size: 0.1 + R() * 0.12, size1: 0.06, color: R() < 0.5 ? '#ffffff' : '#ffe8d2', alpha: 0.5, drag: 0 });
    },
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
    wave(p, dir, size = 1, base = null, edgeX = null) {
      if (base != null) {   // (the wall of water itself, across the rock's top to its edge, and its foam)
        const w = wavePool[wvi++ % wavePool.length];
        w.p.set(p.x, base, 0);
        w.dir = dir;
        w.size = size;
        w.t = 0;
        w.x0 = p.x - dir * 1.5;
        w.x1 = edgeX ?? p.x + dir * 6;
        w.poured = 0;
        w.splashed = false;
        w.m.visible = true;
        const f = foamPool[fmi++ % foamPool.length];
        f.x = p.x;
        f.y = base + 0.07;
        f.dir = dir;
        f.size = size;
        f.t = 0;
        f.m.visible = true;
      }
      for (let i = 0; i < 70 * Math.min(size, 1.4); i++) {
        const sp = 6 + R() * 12;
        v.set(dir * sp * (0.6 + R() * 0.6), 3 + R() * 9, (R() - 0.5) * 5);
        spray.spawn(tmp.set(p.x + (R() - 0.5) * 2, p.y + R() * 1.5, (R() - 0.5) * 2.4), v, { life: 0.9 + R() * 0.7, size: 0.5 + R() * 0.9, size1: 1.4, color: R() < 0.6 ? '#e9f6ff' : '#7cc8f2', alpha: 0.92, g: 16, drag: 0.5 });
      }
      for (let i = 0; i < 16; i++) {
        spray.spawn(tmp.set(p.x + dir * R() * 4, p.y + 0.5, (R() - 0.5) * 3), v.set(dir * (2 + R() * 3), 1 + R(), 0), { life: 1.8, size: 2.2, size1: 4.2, color: '#eef7ff', alpha: 0.4, drag: 1 });
      }
    },
    /**
     * 🌿 Vines for each block in `items` ({ target: its mesh, side: +1/-1 the way it's dragged, edgeX, rimY }): two climb
     * over the rock's edge at `edgeX`, loop round the block and pull while `hold(target)` says so, then fade.
     */
    vines(items, hold) {
      for (const it of items.slice(0, VINE_N / 2)) {
        let first = true;
        for (const zo of [-1, 1]) {
          const vn = vinePool[vi++ % VINE_N];
          if (vn.lasso) { vn.lasso.parent?.remove(vn.lasso); vn.lasso.visible = false; vn.lasso = null; }
          vn.side = it.side;
          vn.zo = zo + (R() - 0.5) * 0.4;
          vn.rim.set(it.edgeX, it.rimY + 0.15, vn.zo * 0.9);
          vn.from.set(it.edgeX + it.side * 0.5, it.rimY - 2.2 - R(), vn.zo * 1.1);
          vn.target = it.target;
          vn.t = 0;
          vn.hold = hold;
          vn.fade = 0;
          vn.mesh.visible = true;
          vn.seed = R() * 10;
          if (first) {   // (the lasso: one round the block, on the block itself so it moves and tumbles with it)
            first = false;
            const L = lassoPool[lsi++ % lassoPool.length];
            L.parent?.remove(L);
            const u = it.target.userData;
            L.userData.rx = (u.w || 2) / 2 + 0.12;
            L.userData.rz = 1.72;
            L.scale.set(L.userData.rx, 1, L.userData.rz);
            L.position.set(0, (u.h || 2) * 0.12, 0);
            L.visible = true;
            it.target.add(L);
            vn.lasso = L;
          }
        }
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
      updateWaves(dt);
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
        if (!r.flat && camera) r.m.quaternion.copy(camera.quaternion);   // (a standing shockwave faces you)
        r.m.material.opacity = (1 - k) ** 1.4 * 0.9;
      }
      const solids = scene.userData.solids;
      for (const c of chunkPool) {
        if (!c.m.visible) continue;
        c.life -= dt;
        const p = c.m.position;
        if (c.rest) {   // (lying on the rock: at its end it shrinks away)
          if (c.life < 0.4) c.m.scale.copy(c.rest).multiplyScalar(Math.max(0.001, c.life / 0.4));
          if (c.life <= 0) c.m.visible = false;
          continue;
        }
        c.v.y -= 22 * dt;
        const wasY = p.y;
        if (p.y < 0) {
          if (!c.wet) { c.wet = true; c.v.multiplyScalar(0.2); this.splash(p.x, { size: 0.25, z: p.z, rings: 1 }); }
          c.v.y = Math.max(c.v.y, -2.5);
        }
        p.addScaledVector(c.v, dt);
        c.m.rotation.x += c.w.x * dt;
        c.m.rotation.y += c.w.y * dt;
        if (solids && p.y > 0) meetRock(c, wasY, solids);
        if (c.life <= 0 || p.y < -6) c.m.visible = false;
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
        flash.intensity = Math.max(0, flashT / flashDur) ** 2 * flashPeak;
      } else if (fireAt) {
        const t = performance.now();
        flash.position.copy(fireAt);
        flash.intensity = 240 + 80 * Math.sin(t / 47) * Math.sin(t / 113) + 40 * Math.sin(t / 29);
      } else flash.intensity = 0;
    },
  };
  return api;
}
