// (1.20) Die Rivier's animals (the owner, 24 Oct 2026: "their needs to be obstacles in the river, for example a crocadile
// also the monkey needs to sit on one of the "blocks""): a crocodile lying in your lane that snaps as you come, a hippo
// that surfaces in front of you (its bubbles warn you first), and Blouaap (Stapel's own 🐒) paddling one of the day's
// blocks across the river. Each is built from simple shapes, faces you as you come down the river (+z), and animates
// itself: `update(t, ahead)` with `ahead` = metres between you and it.
import * as THREE from '../../lib/three.module.min.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
const noCull = (g) => { g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); return g; };

function eye(white, pupil, r = 0.07) {
  const g = new THREE.Group();
  const w = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), white);
  g.add(w);
  const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 8, 6), pupil);
  p.position.z = r * 0.62;
  g.add(p);
  return g;
}

/** The animals' kit: materials made once for a ride (each bent with the river by `bend`). */
export function createBeasts(bend = (m) => m, models = {}) {
  const M = {
    croc: bend(std('#5a8a37', { roughness: 0.5 })),
    crocDark: bend(std('#2b3a1b', { roughness: 0.7 })),
    crocBelly: bend(std('#c9c47c', { roughness: 0.65 })),
    tooth: bend(std('#f2efe2', { roughness: 0.4 })),
    mouth: bend(std('#b5545a', { roughness: 0.6 })),
    eyeY: bend(std('#ffd33a', { roughness: 0.25, emissive: '#7a5200', emissiveIntensity: 0.9 })),
    black: bend(std('#141414', { roughness: 0.4 })),
    white: bend(std('#ffffff', { roughness: 0.35 })),
    hippo: bend(std('#76636f', { roughness: 0.55 })),
    hippoDark: bend(std('#5b4b57', { roughness: 0.6 })),
    hippoPink: bend(std('#d78f99', { roughness: 0.6 })),
    ele: bend(std('#6c6864', { roughness: 0.8 })),   // (1.22: darker: in the low sun the stand-in read as white clay)
    fur: bend(std('#8a5a2e', { roughness: 0.9 })),
    furDark: bend(std('#6b4220', { roughness: 0.9 })),
    face: bend(std('#e7c49a', { roughness: 0.75 })),
    bandana: bend(std('#2f7be0', { roughness: 0.6 })),
    paddle: bend(std('#a87445', { roughness: 0.7 })),
    banana: bend(std('#ffd84a', { roughness: 0.5 })),
  };
  const bubbleGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const bubbleMat = bend(new THREE.MeshStandardMaterial({ color: '#e9f6f4', roughness: 0.1, transparent: true, opacity: 0.75 }));

  // ------------------------------------------------------------------------------------------- the crocodile
  /** Lies low in the water facing you, tail swishing; its jaws open and snap when you are close. w across, d along. */
  function croc(side = 1) {
    if (models.croc) return crocModel(side);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 2.3, 6, 12), M.croc);
    body.rotation.x = Math.PI / 2;
    body.scale.set(1.25, 1, 0.42);
    // its pale belly line along the water at both sides
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 2.2, 4, 8), M.crocBelly);
      side.rotation.x = Math.PI / 2;
      side.scale.set(1, 1, 0.5);
      side.position.set(s * 0.5, -0.05, 0);
      g.add(side);
      for (const zz of [-0.7, 0.75]) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 6), M.croc);
        leg.rotation.z = s * 1.2;
        leg.position.set(s * 0.62, -0.06, zz);
        g.add(leg);
      }
    }
    body.position.y = 0.02;
    g.add(body);
    // the scutes: two rows of ridges down the back
    const sc = new THREE.ConeGeometry(0.075, 0.16, 4);
    for (let i = 0; i < 9; i++) {
      for (const s of [-1, 1]) {
        const c = new THREE.Mesh(sc, M.crocDark);
        c.position.set(s * 0.15, 0.2, -1.15 + i * 0.28);
        g.add(c);
      }
    }
    // the tail: three segments behind (upstream of you), swishing
    const tail = new THREE.Group();
    tail.position.z = -1.6;
    g.add(tail);
    let seg = tail;
    const segs = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.28 - i * 0.07, 0.55, 4, 8), M.croc);
      m.rotation.x = Math.PI / 2;
      m.scale.set(1, 1, 0.55);
      m.position.z = -0.38;
      s.add(m);
      const ridge = new THREE.Mesh(sc, M.crocDark);
      ridge.position.set(0, 0.16 - i * 0.03, -0.3);
      s.add(ridge);
      s.position.z = i === 0 ? 0 : -0.72;
      seg.add(s);
      segs.push(s);
      seg = s;
    }
    // the head: a long snout, upper jaw on a hinge, teeth, eyes on top
    const head = new THREE.Group();
    head.position.set(0, 0.04, 1.45);
    g.add(head);
    const jawShape = (w, h, l) => {
      const geo = new THREE.BoxGeometry(w, h, l, 2, 1, 3);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i) / l + 0.5;   // 0 at the back, 1 at the nose
        p.setX(i, p.getX(i) * (1 - z * 0.45));
      }
      geo.computeVertexNormals();
      geo.translate(0, 0, l / 2);
      return geo;
    };
    const upper = new THREE.Group();
    head.add(upper);
    const up = new THREE.Mesh(jawShape(0.62, 0.17, 1.15), M.croc);
    up.position.y = 0.09;
    upper.add(up);
    const lower = new THREE.Mesh(jawShape(0.58, 0.12, 1.08), M.crocBelly);
    lower.position.y = -0.06;
    head.add(lower);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.9), M.mouth);
    inner.position.set(0, 0.0, 0.5);
    head.add(inner);
    const tooth = new THREE.ConeGeometry(0.03, 0.09, 4);
    for (let i = 0; i < 6; i++) {
      for (const s of [-1, 1]) {
        const tt = new THREE.Mesh(tooth, M.tooth);
        const z = 0.18 + i * 0.16;
        tt.position.set(s * (0.29 - z * 0.12), 0.01, z);
        tt.rotation.x = Math.PI;
        upper.add(tt);
      }
    }
    for (const s of [-1, 1]) {
      const bump = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), M.croc);
      bump.position.set(s * 0.17, 0.2, 0.12);
      upper.add(bump);
      const e = new THREE.Group();
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.eyeY);
      e.add(w);
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.02), M.black);
      slit.position.z = 0.065;
      e.add(slit);
      e.position.set(s * 0.17, 0.25, 0.17);
      upper.add(e);
      const nost = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), M.crocDark);
      nost.position.set(s * 0.07, 0.19, 1.05);
      upper.add(nost);
    }
    noCull(g);
    // (lying across the river, the way the camera behind you sees it whole; 3.3 m long, it fills its lane)
    const holder = new THREE.Group();
    holder.add(g);
    g.scale.setScalar(0.74);
    g.rotation.y = side * Math.PI / 2;
    let snapT = -1;
    holder.userData = {
      w: 3.0, d: 1.5, kind: 'croc',
      update(t, ahead, dt) {
        const swish = Math.sin(t * 3.1 + g.id) * 0.35;
        segs.forEach((s, i) => { s.rotation.y = swish * (0.5 + i * 0.35); });
        g.position.y = 0.02 + Math.sin(t * 1.7 + g.id) * 0.03;
        // the jaws: slowly open as you come, snap shut when you're level
        let open = 0;
        if (ahead < 16 && ahead > 2) open = Math.min(1, (16 - ahead) / 8) * 0.34;
        if (ahead <= 2 && snapT < 0) snapT = 0;
        if (snapT >= 0) {
          snapT += dt;
          open = snapT < 0.08 ? 0.38 : Math.max(0, 0.38 - (snapT - 0.08) * 5);
        }
        upper.rotation.x = -open;
        head.rotation.y = Math.sin(t * 1.3 + g.id) * 0.08;
      },
      snapped: () => snapT >= 0,
    };
    return holder;
  }

  /** The Blender crocodile (img/models/croc.glb): low in the water, the back and eyes out, its lower jaw opening. */
  function crocModel(side) {
    const m = models.croc.clone(true);
    const jaw = m.getObjectByName('jaw');
    // (the tail in two: the tip hangs on the root so it swings after it, a whip)
    const tail1 = m.getObjectByName('tail1');
    const tail2 = m.getObjectByName('tail2');
    if (tail1 && tail2) tail1.attach(tail2);
    const g = new THREE.Group();
    g.add(m);
    // (3.7 m long in the model; 3 m here, across its lane, snout to the side it came from; the waterline just under
    // the scutes)
    // (a little taller than life: a flat crocodile reads at a glance from 40 m too)
    m.scale.set(0.84, 1.25, 0.95);
    m.position.y = -0.04;
    m.rotation.y = side > 0 ? 0 : Math.PI;
    const holder = new THREE.Group();
    holder.add(g);
    let snapT = -1;
    holder.userData = {
      w: 3.0, d: 1.5, kind: 'croc',
      update(t, ahead, dt) {
        // the tail swishes (the tip a beat after the root), the body sways and rocks a little on the current
        const ph = t * 2.3 + g.id;
        m.rotation.y = (side > 0 ? 0 : Math.PI) + Math.sin(ph) * 0.05;
        if (tail1) tail1.rotation.y = Math.sin(ph - 0.6) * 0.22;
        if (tail2) tail2.rotation.y = Math.sin(ph - 1.5) * 0.38;
        g.position.y = Math.sin(t * 1.7 + g.id) * 0.03;
        let open = 0;
        if (ahead < 16 && ahead > 2) open = Math.min(1, (16 - ahead) / 8) * 0.42;
        if (ahead <= 2 && snapT < 0) snapT = 0;
        if (snapT >= 0) {
          snapT += dt;
          open = snapT < 0.08 ? 0.48 : Math.max(0, 0.48 - (snapT - 0.08) * 6);
        }
        if (jaw) jaw.rotation.z = -open;
      },
      snapped: () => snapT >= 0,
    };
    return holder;
  }

  // ------------------------------------------------------------------------------------------- the hippo
  /** Waits under the water; its bubbles rise first, then it surfaces in your lane and yawns. */
  function hippo() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    // (the Blender hippo when it's there: its body turns a little, its own jaw yawns)
    let head;
    let jaw;
    let ears = [];
    if (models.hippo) {
      const m = models.hippo.clone(true);
      m.scale.setScalar(1.3);
      m.position.y = 0.05;
      inner.add(m);
      head = m;
      jaw = m.getObjectByName('jaw') || new THREE.Group();
      ears = ['earL', 'earR'].map((n) => m.getObjectByName(n)).filter(Boolean);
    } else {
      ({ head, jaw } = hippoShapes(inner));
    }
    return hippoLife(g, inner, head, jaw, ears);
  }
  /** The simple hippo (no model): body, head, jaw from spheres. */
  function hippoShapes(inner) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), M.hippo);
    body.scale.set(1.25, 0.8, 1.55);
    body.position.set(0, -0.35, -0.6);
    inner.add(body);
    const head = new THREE.Group();
    head.position.set(0, 0.25, 0.75);
    inner.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12), M.hippo);
    skull.scale.set(1.05, 0.8, 1.0);
    head.add(skull);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), M.hippo);
    muzzle.scale.set(1.15, 0.55, 0.85);
    muzzle.position.set(0, -0.08, 0.55);
    head.add(muzzle);
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.22, 0.25);
    head.add(jaw);
    const low = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), M.hippoDark);
    low.scale.set(1.1, 0.35, 0.95);
    low.position.set(0, -0.05, 0.35);
    jaw.add(low);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8), M.hippoPink);
    tongue.scale.set(1, 0.25, 1);
    tongue.position.set(0, 0.06, 0.36);
    jaw.add(tongue);
    for (const s of [-1, 1]) {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 6), M.tooth);
      tusk.position.set(s * 0.32, 0.18, 0.62);
      jaw.add(tusk);
      const e = eye(M.white, M.black, 0.09);
      e.position.set(s * 0.32, 0.36, 0.28);
      head.add(e);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), M.hippoDark);
      ear.scale.set(0.7, 1, 0.5);
      ear.position.set(s * 0.42, 0.5, -0.1);
      head.add(ear);
      const nos = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M.black);
      nos.position.set(s * 0.18, 0.17, 0.95);
      head.add(nos);
    }
    return { head, jaw };
  }
  /** The hippo's life in the river: under the water, bubbles, up in your lane, a yawn as you come. */
  function hippoLife(g, inner, head, jaw, ears = []) {
    // its bubbles
    const bubbles = [];
    for (let i = 0; i < 10; i++) {
      const b = new THREE.Mesh(bubbleGeo, bubbleMat);
      b.visible = false;
      g.add(b);
      bubbles.push({ m: b, ph: i * 0.37, x: (Math.sin(i * 7.3) * 0.9), z: Math.cos(i * 3.1) * 0.9 });
    }
    noCull(g);
    let rise = 0;
    g.userData = {
      w: 2.3, d: 2.6, kind: 'hippo', hardFrom: 30,
      update(t, ahead, dt) {
        // bubbles from 52 m, up from 34 m (it is in your way from 30 m: `hardFrom`)
        const want = ahead < 34 ? 1 : 0;
        rise = Math.max(0, Math.min(1, rise + (want ? dt * 1.6 : -dt)));
        const k = rise * rise * (3 - 2 * rise);
        inner.position.y = -2.4 + 2.4 * k + Math.sin(t * 1.4) * 0.05 * k;
        inner.rotation.x = (1 - k) * 0.4;
        const showB = ahead < 52 && rise < 0.95;
        for (const b of bubbles) {
          b.m.visible = showB;
          if (!showB) continue;
          const life = ((t * 1.3 + b.ph) % 1);
          b.m.position.set(b.x, -0.05 + life * 0.25, b.z);
          b.m.scale.setScalar(0.6 + life * 0.9);
        }
        // a big yawn when you're near; (29 Oct 2026) its head lifts, nose up, the way a hippo yawns, so the open mouth
        // (the pink, the tongue, the tusks) shows over the water instead of the jaw dropping into it
        const yawn = ahead < 14 && ahead > -2 ? Math.min(1, (14 - ahead) / 6) : 0;
        jaw.rotation.x = yawn ? 0.75 * yawn : 0.05 + Math.sin(t * 0.8) * 0.03;
        inner.position.y += 0.3 * yawn * k;
        inner.rotation.x -= 0.36 * yawn * k;
        head.rotation.y = Math.sin(t * 0.9 + g.id) * 0.1;
        // its ears flick now and then (a quick double twitch)
        const fl = (t * 0.7 + g.id * 0.37) % 2.3;
        ears.forEach((e, i) => { e.rotation.y = (fl < 0.25 ? Math.sin(fl * 25 + i) * 0.5 : 0) * (i ? -1 : 1); });
      },
      surfaced: () => rise > 0.5,
    };
    return g;
  }

  // ------------------------------------------------------------------------------------------- Blouaap on a block
  /**
   * Stapel's monkey (🐒) on one of the day's blocks (`blockObj`, from things.floating), paddling it across the river:
   * `paddleDir` -1 / 1 is the way he goes (the block drifts; the game moves it). He chatters as you come.
   */
  function monkeyOn(blockObj, paddleDir = 1, top = 1.2) {
    if (models.monkey) return monkeyModelOn(blockObj, paddleDir, top);
    const g = new THREE.Group();
    g.add(blockObj);
    const mk = new THREE.Group();
    mk.position.y = top;
    g.add(mk);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), M.fur);
    body.scale.set(1, 1.15, 0.9);
    body.position.y = 0.32;
    mk.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), M.face);
    belly.scale.set(1, 1.2, 0.6);
    belly.position.set(0, 0.28, 0.17);
    mk.add(belly);
    const head = new THREE.Group();
    head.position.set(0, 0.82, 0.04);
    mk.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), M.fur);
    head.add(skull);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12), M.face);
    face.scale.set(1.1, 0.95, 0.65);
    face.position.set(0, -0.04, 0.17);
    head.add(face);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), M.face);
    muzzle.scale.set(1.25, 0.8, 0.8);
    muzzle.position.set(0, -0.12, 0.3);
    head.add(muzzle);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 12, Math.PI), M.black);
    mouth.position.set(0, -0.15, 0.39);
    mouth.rotation.z = Math.PI;
    head.add(mouth);
    for (const s of [-1, 1]) {
      const e = eye(M.white, M.black, 0.055);
      e.position.set(s * 0.09, 0.03, 0.32);
      head.add(e);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.face);
      ear.scale.set(0.5, 1, 1);
      ear.position.set(s * 0.3, 0.02, 0);
      head.add(ear);
    }
    // a blue bandana: he's Blouaap
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 20), M.bandana);
    band.rotation.x = Math.PI / 2 - 0.25;
    band.position.y = 0.12;
    head.add(band);
    // the tail, curled up behind
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.045, 6, 18, Math.PI * 1.5), M.furDark);
    tail.position.set(0, 0.35, -0.38);
    tail.rotation.y = Math.PI / 2;
    mk.add(tail);
    // arms and the paddle
    const arms = new THREE.Group();
    arms.position.set(0, 0.5, 0.05);
    mk.add(arms);
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 4, 6), M.fur);
      a.position.set(s * 0.26, -0.05, 0.12);
      a.rotation.z = s * 0.8;
      a.rotation.x = -0.6;
      arms.add(a);
    }
    const paddle = new THREE.Group();
    paddle.position.set(0, 0.0, 0.32);
    arms.add(paddle);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), M.paddle);
    shaft.rotation.z = Math.PI / 2;
    paddle.add(shaft);
    for (const s of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.2), M.paddle);
      blade.position.set(s * 0.82, 0, 0);
      paddle.add(blade);
    }
    noCull(g);
    let jumped = 0;
    g.userData = {
      ...blockObj.userData, kind: 'monkey', block: blockObj.userData.block,
      update(t, ahead) {
        // paddling: the paddle rocks side to side, dipping on the side he paddles; he bobs and looks at you
        const stroke = Math.sin(t * 6.5);
        paddle.rotation.z = stroke * 0.7 * paddleDir;
        paddle.rotation.x = 0.2;
        arms.rotation.z = stroke * 0.25;
        mk.position.y = top + Math.abs(Math.sin(t * 6.5)) * 0.05 + jumped;
        head.rotation.y = ahead < 30 ? 0 : Math.sin(t * 1.2) * 0.5;
        head.rotation.z = Math.sin(t * 3.2) * 0.1;
        // he's cheeky: a little jump of joy when you're close
        jumped = ahead < 9 && ahead > 0 ? Math.abs(Math.sin((9 - ahead) * 0.7)) * 0.35 : 0;
        mk.rotation.y = Math.PI * (ahead < 30 ? 0 : 0.15);
      },
    };
    return g;
  }

  /** The Blender Blouaap (img/models/monkey.glb) on his block: the paddle rocks with each stroke; he looks at you. */
  function monkeyModelOn(blockObj, paddleDir, top) {
    const g = new THREE.Group();
    g.add(blockObj);
    const mk = models.monkey.clone(true);
    mk.scale.setScalar(1.0);
    mk.position.y = top;
    g.add(mk);
    const head = mk.getObjectByName('head') || new THREE.Group();
    const arms = mk.getObjectByName('arms') || new THREE.Group();
    let jumped = 0;
    g.userData = {
      ...blockObj.userData, kind: 'monkey', block: blockObj.userData.block,
      update(t, ahead) {
        const stroke = Math.sin(t * 6.5);
        arms.rotation.z = stroke * 0.45 * paddleDir;
        arms.rotation.x = 0.12 + Math.abs(stroke) * 0.12;
        mk.position.y = top + Math.abs(stroke) * 0.04 + jumped;
        head.rotation.y = ahead < 30 ? 0 : Math.sin(t * 1.2) * 0.5;
        head.rotation.z = Math.sin(t * 3.2) * 0.1;
        jumped = ahead < 9 && ahead > 0 ? Math.abs(Math.sin((9 - ahead) * 0.7)) * 0.35 : 0;
        mk.rotation.y = Math.PI * (ahead < 30 ? 0 : 0.15);
      },
    };
    return g;
  }

  // ------------------------------------------------------------------------------------------- the elephants (1.21.3)
  /**
   * An elephant wading across the river (from 10 km): the cow, or her calf (`calf`: the same, smaller). Turned to walk
   * toward -`from` across the river (`from` +1: she comes from the right). userData: { kind 'ele', w, d, walking (the
   * ride says), update(t) } — her legs step while she walks, her trunk swings, her ears flap.
   */
  function elephant({ from = 1, calf = false } = {}) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const k = calf ? 0.56 : 1;
    let trunk = null;
    let ears = [];
    let legs = [];
    let body = null;
    if (models.elephant) {
      const m = models.elephant.clone(true);
      inner.add(m);
      body = m;
      trunk = m.getObjectByName('trunk');
      ears = ['earL', 'earR'].map((n) => m.getObjectByName(n)).filter(Boolean);
      legs = ['legFL', 'legBR', 'legFR', 'legBL'].map((n) => m.getObjectByName(n)).filter(Boolean);
    } else {
      // (no model: a grey body, a head, a trunk and four legs)
      body = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), M.ele);
      torso.scale.set(1.2, 1.15, 1.9);
      torso.position.set(0, 2.2, -0.2);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 10), M.ele);
      head.position.set(0, 2.8, 1.9);
      body.add(torso, head);
      trunk = new THREE.Group();
      trunk.position.set(0, 2.4, 2.5);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 2.1, 10), M.ele);
      tr.position.set(0, -1.0, 0.25);
      tr.rotation.x = 0.2;
      trunk.add(tr);
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 10), M.ele);
        ear.scale.set(0.08, 1.1, 0.8);
        ear.position.set(sx * 0.8, 2.6, 1.4);
        body.add(ear);
        ears.push(ear);
      }
      for (const [x, z] of [[0.58, 0.75], [-0.55, -1.15], [-0.58, 0.75], [0.55, -1.15]]) {
        const leg = new THREE.Group();
        leg.position.set(x, 1.7, z);
        const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 2.2, 10), M.ele);
        lm.position.y = -1.1;
        leg.add(lm);
        body.add(leg);
        legs.push(leg);
      }
      body.add(trunk);
      inner.add(body);
    }
    inner.scale.setScalar(k);
    // (her head toward where she walks: across the river, away from the side she came from)
    inner.rotation.y = from > 0 ? -Math.PI / 2 : Math.PI / 2;
    noCull(g);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const ph = Math.random() * 6;
    const base = legs.map((l) => l.rotation.x);
    let step = 0;
    g.userData = {
      kind: 'ele', calf, from, phase: ph, walking: false,
      // (across the river her length; along it her width: what knocks you)
      w: 4.4 * k, d: 2.2 * k,
      update(t, ahead, dt = 1 / 60) {
        const u = g.userData;
        step += (dt || 1 / 60) * (u.walking ? (calf ? 3.4 : 2.4) : 0.35);
        // (the diagonal pairs swing together: front left with back right)
        legs.forEach((l, i) => { l.rotation.x = base[i] + Math.sin(step * Math.PI + (i < 2 ? 0 : Math.PI)) * (u.walking ? 0.32 : 0.04); });
        if (trunk) {
          trunk.rotation.x = Math.sin(t * 1.3 + ph) * 0.12 + (u.walking ? 0.05 : 0);
          trunk.rotation.z = Math.sin(t * 0.9 + ph * 2) * 0.1;
        }
        // (29 Oct 2026, the new model: each ear fans out from her head about its front edge and back, never into her
        // shoulders)
        ears.forEach((e, i) => { e.rotation.y = (i ? 1 : -1) * 0.26 * (0.5 + 0.5 * Math.sin(t * 1.7 + ph + i * 0.5)); });
        if (body) body.position.y = Math.abs(Math.sin(step * Math.PI)) * (u.walking ? 0.05 : 0.01);
      },
    };
    return g;
  }
  function dispose() {
    for (const m of [...Object.values(M), bubbleMat]) m.dispose();
    bubbleGeo.dispose();
  }
  return { croc, hippo, monkeyOn, elephant, dispose };
}
