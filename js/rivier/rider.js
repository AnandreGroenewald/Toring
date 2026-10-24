// (1.20) Die Rivier's rider: the builder (hard hat, hi-vis vest, work boots) standing on a board, surfing down the river
// side-on like a surfer, arms out. He leans into every lane change, crouches when he hits something, and throws spray
// off the board's tail. Built from simple shapes (it reads at phone size from behind, and costs a few draw calls).
import * as THREE from '../../lib/three.module.min.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o });

function vestTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ff7417';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e9edf0';
  g.fillRect(0, 26, 64, 6);
  g.fillRect(0, 42, 64, 6);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 64; i += 4) g.fillRect(i, 0, 1, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function boardTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4efe6';
  g.fillRect(0, 0, 32, 128);
  g.fillStyle = '#ffc21a';
  g.fillRect(13, 0, 6, 128);
  g.fillStyle = '#1d2b45';
  g.fillRect(12, 0, 1, 128);
  g.fillRect(19, 0, 1, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A capsule from a to b (limbs). */
function limb(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
  m.geometry.translate(0, -len / 2, 0);   // (it hangs from its top end: a joint)
  return m;
}

/**
 * The rider: { group, update(dt, { lean (-1..1), crouch (0..1), speed, t }), setTint(on) }. `bend(mat)` patches each
 * material so the rider winds with the river like everything else (he stands at its start: barely moves).
 */
export function createRider(bend = (m) => m) {
  const group = new THREE.Group();
  const skin = bend(std('#c08a63', { roughness: 0.6 }));
  const vest = bend(std('#ffffff', { map: vestTexture(), roughness: 0.55 }));
  const shirt = bend(std('#2d4a6b', { roughness: 0.8 }));
  const pants = bend(std('#33383f', { roughness: 0.85 }));
  const boot = bend(std('#5a3a20', { roughness: 0.7 }));
  const hat = bend(std('#ffc21a', { roughness: 0.35, metalness: 0.05 }));
  const boardM = bend(std('#ffffff', { map: boardTexture(), roughness: 0.3, metalness: 0.05 }));

  // the board: a long rounded slab along the river
  const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.5, 4, 12), boardM);
  board.rotation.x = Math.PI / 2;
  board.scale.set(1, 1, 0.16);
  board.position.y = 0.06;
  group.add(board);

  // the body stands side-on (chest towards +x), facing down the river with his head
  const body = new THREE.Group();
  body.position.y = 0.14;
  group.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  const legL = limb(0.11, 0.78, pants);
  const legR = limb(0.11, 0.78, pants);
  legL.position.set(0, 0, -0.32);
  legR.position.set(0, 0, 0.3);
  hips.add(legL, legR);
  for (const leg of [legL, legR]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), boot);
    b.position.set(0.02, -0.98, 0);
    leg.add(b);
  }
  const torso = new THREE.Group();
  hips.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 4, 10), vest);
  chest.position.y = 0.38;
  chest.scale.set(0.82, 1, 1);
  torso.add(chest);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8), skin);
  neck.position.y = 0.76;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.92;
  torso.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skin));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat);
  dome.position.y = 0.04;
  head.add(dome);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 18), hat);
  brim.position.set(-0.03, 0.05, -0.02);
  head.add(brim);
  const armL = limb(0.07, 0.5, shirt);
  const armR = limb(0.07, 0.5, shirt);
  armL.position.set(0, 0.62, -0.26);
  armR.position.set(0, 0.62, 0.26);
  torso.add(armL, armR);
  for (const a of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skin);
    hand.position.y = -0.62;
    a.add(hand);
  }
  // he rides with his chest to the right and looks down the river
  body.rotation.y = -Math.PI / 2;
  head.rotation.y = Math.PI / 2 - 0.15;

  group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  let t0 = 0;
  const flash = [];
  group.traverse((o) => { if (o.isMesh) flash.push(o.material); });

  return {
    group,
    /** `lean`: -1 (moving left) .. 1 (right); `crouch` 0..1 (a knock); `bob` the water's swell. */
    update(dt, { lean = 0, crouch = 0, speed = 15 } = {}) {
      t0 += dt;
      const sway = Math.sin(t0 * 2.3) * 0.04;
      group.rotation.z = -lean * 0.32 + sway * 0.5;
      group.rotation.x = -0.06 - crouch * 0.12;
      group.position.y = Math.sin(t0 * 3.1) * 0.05 + 0.02;
      // knees bend with the speed and a knock; arms out for balance, the leading arm higher in a lean
      const knee = 0.25 + crouch * 0.5 + Math.min(0.15, speed / 160);
      hips.position.y = 0.95 - knee * 0.45;
      legL.rotation.x = knee * 0.6;
      legR.rotation.x = -knee * 0.5;
      torso.rotation.z = -0.1 - crouch * 0.4 + lean * 0.12;
      armL.rotation.x = -1.2 - lean * 0.5 + Math.sin(t0 * 2.1) * 0.08;
      armR.rotation.x = 1.2 - lean * 0.5 + Math.sin(t0 * 2.4) * 0.08;
      head.rotation.z = lean * 0.15;
    },
    /** A knock: he blinks for the grace time (the meshes fade a little). */
    setBlink(on) {
      for (const m of flash) {
        m.transparent = on;
        m.opacity = on ? 0.45 : 1;
      }
    },
  };
}
