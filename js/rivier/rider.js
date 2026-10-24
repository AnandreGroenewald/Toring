// (1.20) Die Rivier's rider: the builder (yellow hard hat, orange hi-vis vest with its silver stripes, jeans, work boots)
// surfing the river on a long board, side-on like a surfer with his upper body turned down the river, arms out for
// balance. He carves into every lane change (board tilts, knees bend, spray), crouches and wobbles after a knock, and
// rides the swell. Built from simple shapes (it reads at phone size from behind and costs a few draw calls).
import * as THREE from '../../lib/three.module.min.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...o });

/** The vest: orange with the reflective silver stripes (an X on the back, bands round the middle). */
function vestTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ff6f12';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 128; i += 6) g.fillRect(0, i, 128, 2);
  g.fillStyle = '#dfe6ec';
  g.fillRect(0, 70, 128, 10);
  g.fillRect(0, 92, 128, 10);
  // (the back's X: the capsule's UV runs round it; the back is the middle of the picture)
  g.save();
  g.translate(64, 40);
  g.rotate(0.6);
  g.fillRect(-4, -34, 8, 68);
  g.rotate(-1.2);
  g.fillRect(-4, -34, 8, 68);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function boardTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, '#e9e2d4');
  grad.addColorStop(0.5, '#fbf7ef');
  grad.addColorStop(1, '#e9e2d4');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#ffbf1a';
  g.fillRect(26, 0, 12, 256);
  g.fillStyle = '#1d2b45';
  g.fillRect(24, 0, 2, 256);
  g.fillRect(38, 0, 2, 256);
  g.fillStyle = '#e8462f';
  g.fillRect(0, 214, 64, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A limb (capsule) hanging from its top end: a joint to turn it by. */
function limb(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  m.geometry.translate(0, -len / 2 - r * 0.5, 0);
  return m;
}

/**
 * The rider: { group, update(dt, { lean -1..1, crouch 0..1, speed }), setBlink(on) }. `bend(mat)` patches each material
 * so the rider winds with the river like everything else (he stands at its start: he barely moves).
 */
export function createRider(bend = (m) => m, model = null) {
  const group = new THREE.Group();
  const skin = bend(std('#b98159', { roughness: 0.6 }));
  const vest = bend(std('#ffffff', { map: vestTexture(), roughness: 0.55 }));
  const shirt = bend(std('#2b3f5c', { roughness: 0.8 }));
  const jeans = bend(std('#3a4f73', { roughness: 0.85 }));
  const boot = bend(std('#4a2f1a', { roughness: 0.75 }));
  const hat = bend(std('#ffc21a', { roughness: 0.32, metalness: 0.08 }));
  const boardM = bend(std('#ffffff', { map: boardTexture(), roughness: 0.28, metalness: 0.05 }));
  const glove = bend(std('#e7c35a', { roughness: 0.7 }));

  // the board: long, slim, its nose up a little
  const tilt = new THREE.Group();   // (the carve: the board and everything on it roll together)
  group.add(tilt);
  const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.55, 6, 16), boardM);
  board.rotation.x = Math.PI / 2;
  board.scale.set(1, 1, 0.13);
  board.position.y = 0.07;
  tilt.add(board);

  // the stance: feet along the board, knees bent; hips square to the side (+x), the chest turned down the river
  const body = new THREE.Group();
  body.position.y = 0.12;
  tilt.add(body);
  const hips = new THREE.Group();
  body.add(hips);
  const legF = limb(0.105, 0.42, jeans);
  const legB = limb(0.105, 0.42, jeans);
  const shinF = limb(0.09, 0.4, jeans);
  const shinB = limb(0.09, 0.4, jeans);
  legF.add(shinF);
  legB.add(shinB);
  shinF.position.y = -0.56;
  shinB.position.y = -0.56;
  for (const s of [shinF, shinB]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.3), boot);
    b.position.set(0, -0.56, 0.04);
    s.add(b);
  }
  hips.add(legF, legB);
  legF.position.set(0, 0, -0.2);
  legB.position.set(0, 0, 0.2);
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.22, 4, 8), jeans);
  pelvis.rotation.x = Math.PI / 2;
  hips.add(pelvis);
  const torso = new THREE.Group();
  torso.position.y = 0.08;
  hips.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.38, 6, 12), vest);
  chest.position.y = 0.36;
  chest.scale.set(0.78, 1, 1.05);
  chest.rotation.y = Math.PI;   // (the picture's middle, the X, on his back)
  torso.add(chest);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skin);
  neck.position.y = 0.72;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.86;
  torso.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.175, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), hat);
  dome.position.y = 0.035;
  dome.scale.set(1, 0.92, 1.08);
  head.add(dome);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.025, 20), hat);
  brim.position.set(0.03, 0.04, 0);
  head.add(brim);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), hat);
  ridge.position.set(0, 0.19, 0);
  head.add(ridge);
  const armF = limb(0.065, 0.24, shirt);
  const armB = limb(0.065, 0.24, shirt);
  const foreF = limb(0.055, 0.22, skin);
  const foreB = limb(0.055, 0.22, skin);
  armF.add(foreF);
  armB.add(foreB);
  foreF.position.y = -0.33;
  foreB.position.y = -0.33;
  for (const f of [foreF, foreB]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), glove);
    h.position.y = -0.33;
    f.add(h);
  }
  armF.position.set(0, 0.62, -0.22);
  armB.position.set(0, 0.62, 0.22);
  torso.add(armF, armB);
  // he faces the side (+x); the chest turns down the river (-z), the head further, looking where he goes
  body.rotation.y = 0;
  torso.rotation.y = 0.75;
  head.rotation.y = 0.8;

  // (Saturday) the bazooka on his right shoulder: an olive tube with a flared back, a sight, a grip and a warning band;
  // it turns to where he aims, kicks back when it fires (a flash at the front, smoke out of the back)
  const gunMat = bend(std('#6f7f45', { roughness: 0.5, metalness: 0.25 }));
  const gunDark = bend(std('#2a2f22', { roughness: 0.5, metalness: 0.4 }));
  const gunBand = bend(std('#ffc21a', { roughness: 0.4 }));
  const gun = new THREE.Group();   // (its own pivot on the shoulder: yaw on the group, pitch on the tube)
  gun.position.set(0.02, 0.76, 0.27);   // (on top of his back shoulder, in the chest's own turn)
  gun.scale.setScalar(1.2);
  const tube = new THREE.Group();
  gun.add(tube);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 1.2, 14), gunMat);
  barrel.rotation.x = Math.PI / 2;
  tube.add(barrel);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.13, 0.22, 14, 1, true), gunDark);
  bell.rotation.x = Math.PI / 2;
  bell.position.z = 0.7;
  tube.add(bell);
  const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.022, 6, 16), gunDark);
  muzzleRing.position.z = -0.6;
  tube.add(muzzleRing);
  for (const z of [-0.18, -0.08]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.089, 0.089, 0.05, 14), gunBand);
    b.rotation.x = Math.PI / 2;
    b.position.z = z;
    tube.add(b);
  }
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.08), gunDark);
  sight.position.set(-0.06, 0.1, -0.25);
  tube.add(sight);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), gunDark);
  grip.position.set(0, -0.13, -0.12);
  grip.rotation.x = 0.25;
  tube.add(grip);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, fog: false }));
  flash.position.z = -0.78;
  tube.add(flash);
  gun.visible = false;
  torso.add(gun);
  let kick = 0;
  let flashT = 0;
  const aimYaw = { v: 0, to: 0 };
  const aimPitch = { v: 0.08, to: 0.08 };

  const mats = [skin, vest, shirt, jeans, boot, hat, boardM, glove, gunMat, gunDark, gunBand];
  // (the Blender builder when it's there: each joint keeps its place and its turn; its simple shape gives way to the
  // model's part, made in the same frame: art/blender/builder.py)
  if (model) {
    const EMPTY = new THREE.BufferGeometry();
    const part = (name) => {
      const src = model.getObjectByName(name);
      if (!src) return null;
      const c = src.clone(true);
      c.position.set(0, 0, 0);
      c.traverse((o) => { if (o.isMesh && !mats.includes(o.material)) mats.push(o.material); });
      return c;
    };
    /** `joint` keeps turning; what it showed goes (and the meshes hung on it that `drop` names). */
    const dress = (joint, name, drop = []) => {
      const p = part(name);
      if (!p) return;
      if (joint.isMesh) joint.geometry = EMPTY;
      for (const d of drop) { d.removeFromParent(); }
      joint.add(p);
    };
    dress(legF, 'thigh');
    dress(legB, 'thigh');
    dress(shinF, 'shin', shinF.children.filter((c) => c.isMesh));
    dress(shinB, 'shin', shinB.children.filter((c) => c.isMesh));
    pelvis.geometry = EMPTY;
    dress(hips, 'pelvis');
    chest.geometry = EMPTY;
    neck.geometry = EMPTY;
    dress(torso, 'torso');
    dress(head, 'head', head.children.filter((c) => c.isMesh));
    dress(armF, 'upperarm');
    dress(armB, 'upperarm');
    dress(foreF, 'forearm', foreF.children.filter((c) => c.isMesh));
    dress(foreB, 'forearm', foreB.children.filter((c) => c.isMesh));
    board.geometry = EMPTY;
    const bp = part('board');
    if (bp) tilt.add(bp);
    const gp = part('bazooka');
    if (gp) {
      for (const m of [barrel, muzzleRing, sight, grip, ...tube.children.filter((c) => c.isMesh && c.geometry.type === 'CylinderGeometry' && c !== barrel)]) m.visible = false;
      bell.visible = false;   // (kept: where the back-blast comes out)
      tube.add(gp);
    }
  }
  group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  let t0 = 0;
  return {
    group,
    /** `lean`: -1 (carving left) .. 1 (right); `crouch` 0..1 (a knock); `speed` m/s. */
    update(dt, { lean = 0, crouch = 0, speed = 15 } = {}) {
      t0 += dt;
      const swell = Math.sin(t0 * 2.6) * 0.045 + Math.sin(t0 * 4.3) * 0.02;
      // the carve: the board rolls into the turn, the nose lifts a little with speed
      tilt.rotation.z = -lean * 0.38 + Math.sin(t0 * 1.7) * 0.03;
      tilt.rotation.x = -0.04 - Math.min(0.06, speed / 400) + crouch * 0.08;
      tilt.position.y = swell + 0.03;   // (the group's own place is the ride's: the dive moves it)
      // knees bend with the speed, more in a carve and after a knock
      const knee = 0.45 + Math.abs(lean) * 0.25 + crouch * 0.5 + Math.min(0.15, speed / 140);
      hips.position.y = 1.0 - knee * 0.38;
      legF.rotation.x = knee * 0.55;
      legB.rotation.x = -knee * 0.45;
      shinF.rotation.x = -knee * 1.0;
      shinB.rotation.x = knee * 0.85;
      // upper body: leans into the carve, ducks after a knock, breathes with the swell
      torso.rotation.z = -0.16 - crouch * 0.45 + lean * 0.22;
      torso.rotation.x = Math.sin(t0 * 2.6) * 0.03;
      // arms out for balance: the front one forward and low, the back one up behind; they swing with the carve
      armF.rotation.x = -1.25 - lean * 0.35 + Math.sin(t0 * 2.1) * 0.06;
      armF.rotation.z = 0.35 + crouch * 0.4;
      foreF.rotation.x = -0.35;
      armB.rotation.x = 1.15 - lean * 0.35 + Math.sin(t0 * 2.4) * 0.07;
      armB.rotation.z = 0.5 + crouch * 0.3;
      foreB.rotation.x = 0.45;
      head.rotation.z = lean * 0.18 - (torso.rotation.z + 0.16) * 0.6;
      if (gun.visible) {
        // the tube swings to its aim; he holds it up with the back arm, the front hand on the grip
        const k = 1 - Math.exp(-dt * 12);
        aimYaw.v += (aimYaw.to - aimYaw.v) * k;
        aimPitch.v += (aimPitch.to - aimPitch.v) * k;
        gun.rotation.y = aimYaw.v - torso.rotation.y;   // (the chest is turned: the tube's aim is the world's)
        tube.rotation.x = aimPitch.v;
        kick = Math.max(0, kick - dt * 3.2);
        tube.position.z = kick * 0.32;
        torso.rotation.z -= kick * 0.25;
        armB.rotation.x = -0.4 + aimPitch.v * 0.5;
        armB.rotation.z = 1.9;
        foreB.rotation.x = -1.6;
        armF.rotation.x = -1.45 + aimPitch.v * 0.4;
        armF.rotation.z = 0.9;
        flashT = Math.max(0, flashT - dt);
        flash.material.opacity = flashT > 0 ? Math.min(1, flashT / 0.06) : 0;
        flash.scale.setScalar(1 + (0.12 - flashT) * 8);
      }
    },
    /** (Saturday) the bazooka on his shoulder, or not. */
    setGun(on) {
      gun.visible = !!on;
    },
    /** Points the bazooka along `dir` (a world direction; the rider's group isn't turned). */
    aim(dir) {
      const h = Math.hypot(dir.x, dir.z) || 1;
      aimYaw.to = Math.atan2(-dir.x, -dir.z);
      aimPitch.to = Math.max(-0.2, Math.min(1.1, Math.atan2(dir.y, h)));
    },
    /** Fires: the flash, the kick. Returns where the shot leaves the tube (world). */
    fire() {
      kick = 1;
      flashT = 0.12;
      return this.muzzle();
    },
    /** The tube's front and back ends (world): where a shot leaves, where the back-blast comes out. */
    muzzle(out = new THREE.Vector3()) {
      group.updateMatrixWorld(true);
      return flash.getWorldPosition(out);
    },
    breech(out = new THREE.Vector3()) {
      group.updateMatrixWorld(true);
      return bell.getWorldPosition(out);
    },
    /** A knock: he blinks while he can't be knocked again. */
    setBlink(on) {
      for (const m of mats) {
        m.transparent = on;
        m.opacity = on ? 0.5 : 1;
      }
    },
  };
}
