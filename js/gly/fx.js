// (1.19 3D) Glybaan: its effects, anywhere along the chute (Block Clash's own work on one flat line): sparks of light,
// puffs (steam, ash, dust) and chunks of a block that breaks, each from a pool drawn in one go.
import * as THREE from '../../lib/three.module.min.js';

const R = Math.random;

/** A soft round dot, white (the colour comes per particle). */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** A pool of points: `additive` ones glow (sparks), the others are soft (steam, ash). */
function pointPool(scene, n, { size, additive }) {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: additive ? 1 : 0.7, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const parts = Array.from({ length: n }, () => ({ p: new THREE.Vector3(0, -9999, 0), v: new THREE.Vector3(), life: 0, max: 1, g: 0, drag: 0, c: new THREE.Color() }));
  let next = 0;
  return {
    spawn(at, vel, { life = 1, color = '#ffffff', g = 0, drag = 0 } = {}) {
      const q = parts[next++ % n];
      q.p.copy(at);
      q.v.copy(vel);
      q.life = q.max = life;
      q.g = g;
      q.drag = drag;
      q.c.set(color);
    },
    update(dt) {
      for (let i = 0; i < n; i++) {
        const q = parts[i];
        if (q.life <= 0) { pos[i * 3 + 1] = -9999; continue; }
        q.life -= dt;
        q.v.y -= q.g * dt;
        if (q.drag) q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
        q.p.addScaledVector(q.v, dt);
        const k = Math.max(0, q.life / q.max);
        pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
        // (fading: the colour dims to nothing, which an additive or a soft dot reads as going out)
        col[i * 3] = q.c.r * k; col[i * 3 + 1] = q.c.g * k; col[i * 3 + 2] = q.c.b * k;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

export function createRunFx(scene) {
  const sparks = pointPool(scene, 420, { size: 0.55, additive: true });
  const puffs = pointPool(scene, 160, { size: 2.6, additive: false });
  // chunks: little boxes in the colour of what broke, tumbling and falling
  const N = 48;
  const chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), N);
  chunkMesh.frustumCulled = false;
  chunkMesh.castShadow = true;
  scene.add(chunkMesh);
  const chunks = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0, life: 0 }));
  let ci = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  const v = new THREE.Vector3();
  const tmp = new THREE.Color();
  for (let i = 0; i < N; i++) { chunkMesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); chunkMesh.setColorAt(i, tmp.set('#ffffff')); }
  return {
    /** A burst of light at p (world). */
    sparkle(p, n = 24, color = '#ffd46a', speed = 7) {
      for (let i = 0; i < n; i++) {
        v.set(R() - 0.5, R() - 0.2, R() - 0.5).normalize().multiplyScalar(speed * (0.4 + R()));
        sparks.spawn(p, v, { life: 0.5 + R() * 0.6, color, g: 4, drag: 1.2 });
      }
    },
    /** One spark of the block's trail: left behind at p, carried off with `vel` (the chute going by). */
    trail(p, vel, color, life = 0.42) {
      sparks.spawn(p, vel, { life: life * (0.7 + R() * 0.6), color, g: 0, drag: 0.6 });
    },
    /** Soft puffs rising (steam white, ash grey, leaves green). */
    puff(p, n = 12, color = '#f2f5f8', up = 3) {
      for (let i = 0; i < n; i++) {
        v.set((R() - 0.5) * 3, up * (0.5 + R()), (R() - 0.5) * 3);
        puffs.spawn(sv.set(p.x + (R() - 0.5) * 2, p.y + R(), p.z + (R() - 0.5) * 2), v, { life: 1 + R() * 0.8, color, g: -0.5, drag: 1.4 });
      }
    },
    /** A block breaking: chunks of `color` flying from p, sparks with them. */
    chunks(p, n = 14, color = '#c9a27a', speed = 9) {
      for (let i = 0; i < n; i++) {
        const c = chunks[ci];
        chunkMesh.setColorAt(ci, tmp.set(color).offsetHSL(0, 0, (R() - 0.5) * 0.15));
        ci = (ci + 1) % N;
        c.p.set(p.x + (R() - 0.5) * 1.6, p.y + (R() - 0.5) * 1.6, p.z + (R() - 0.5) * 1.6);
        c.v.set((R() - 0.5) * speed, R() * speed * 0.9 + 3, (R() - 0.5) * speed);
        c.w.set(R() * 9, R() * 9, R() * 9);
        c.s = 0.25 + R() * 0.45;
        c.life = 2.2;
      }
      if (chunkMesh.instanceColor) chunkMesh.instanceColor.needsUpdate = true;
      this.sparkle(p, 16, '#ffe0a0', 9);
    },
    update(dt) {
      sparks.update(dt);
      puffs.update(dt);
      for (let i = 0; i < N; i++) {
        const c = chunks[i];
        if (c.life <= 0) { chunkMesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
        c.life -= dt;
        c.v.y -= 22 * dt;
        c.p.addScaledVector(c.v, dt);
        c.r.set(c.r.x + c.w.x * dt, c.r.y + c.w.y * dt, c.r.z + c.w.z * dt);
        const s = c.s * Math.min(1, c.life * 2);
        chunkMesh.setMatrixAt(i, m4.compose(c.p, q.setFromEuler(c.r), sv.set(s, s, s)));
      }
      chunkMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
