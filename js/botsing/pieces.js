// (1.18 3D) Blokbotsing: the things on the stacks — Stapel's own blocks in 3D, their faces painted by the game's own block
// art in the skin each player bought in the Winkel (the owner: "can we implement the type of block they have purched"),
// each with its element's emblem (🔥 🌿 💧 💣); the crown in its glass cabinet; a yellow tower crane per side with its
// team's cab and flag, whose jib swings aside when it isn't working (the owner: "it looks like its going through the
// crane"); the throw's direction pin; and the marks of what happened to a block: cracks, soot, vines, a spring.
import * as THREE from '../../lib/three.module.min.js';
import { castleMaterials, banner, TEAM } from '../kasteel/castle.js';
import { rng } from '../kasteel/world.js';
import { blockFaceCanvas, blockPanelCanvas } from '../game/blocks.js';
import { shapeInfo } from './sim.js';
import { PX, sideX, towardFoe, SHAPE_COLOR, ELEMENT } from './rules.js';
import { merge, STACK_TOP } from './world.js';

export const DEPTH = 3.2;   // every block is this deep (m)
const BOX = new Set(['cube', 'plank', 'slab', 'brick', 'crate', 'pillar']);   // (the wedge is the one that isn't a box)
const EDGE_R = 0.17;   // how round a block's edges are (m): they catch the light
const SIDE_TEAM = ['blue', 'red'];
export const EMOJI = { vuur: '🔥', gras: '🌿', water: '💧', plof: '💣' };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
/**
 * A box with rounded edges and one square of UVs on each face (+x, -x, +y, -y, +z, -z: six material groups), the arcs
 * of its edges sharing their faces' pictures. After three.js's RoundedBoxGeometry (MIT, examples/jsm/geometries).
 */
const _rn = new THREE.Vector3();
function arcUv(faceDir, normal, uvAxis, projAxis, radius, side) {
  const arc = (2 * Math.PI * radius) / 4;
  const mid = Math.max(side - 2 * radius, 0);
  _rn.copy(normal);
  _rn[projAxis] = 0;
  _rn.normalize();
  const arcUvRatio = (0.5 * arc) / (arc + mid);
  const arcAngleRatio = 1 - _rn.angleTo(faceDir) / (Math.PI / 4);
  if (Math.sign(_rn[uvAxis]) === 1) return arcAngleRatio * arcUvRatio;
  return mid / (arc + mid) + arcUvRatio + arcUvRatio * (1 - arcAngleRatio);
}
function roundedBox(width, height, depth, segments = 2, radius = 0.15) {
  const seg = segments * 2 + 1;
  const r = Math.min(width / 2, height / 2, depth / 2, radius);
  const geo = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed();
  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal.array;
  const uvs = geo.attributes.uv.array;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const box = new THREE.Vector3(width, height, depth).divideScalar(2).subScalar(r);
  const faceTris = pos.length / 6;
  const dir = new THREE.Vector3();
  const half = 0.5 / seg;
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
    p.fromArray(pos, i);
    n.copy(p);
    n.x -= Math.sign(n.x) * half;
    n.y -= Math.sign(n.y) * half;
    n.z -= Math.sign(n.z) * half;
    n.normalize();
    pos[i] = box.x * Math.sign(p.x) + n.x * r;
    pos[i + 1] = box.y * Math.sign(p.y) + n.y * r;
    pos[i + 2] = box.z * Math.sign(p.z) + n.z * r;
    nor[i] = n.x;
    nor[i + 1] = n.y;
    nor[i + 2] = n.z;
    switch (Math.floor(i / faceTris)) {
      case 0: dir.set(1, 0, 0); uvs[j] = arcUv(dir, n, 'z', 'y', r, depth); uvs[j + 1] = 1 - arcUv(dir, n, 'y', 'z', r, height); break;
      case 1: dir.set(-1, 0, 0); uvs[j] = 1 - arcUv(dir, n, 'z', 'y', r, depth); uvs[j + 1] = 1 - arcUv(dir, n, 'y', 'z', r, height); break;
      case 2: dir.set(0, 1, 0); uvs[j] = 1 - arcUv(dir, n, 'x', 'z', r, width); uvs[j + 1] = arcUv(dir, n, 'z', 'x', r, depth); break;
      case 3: dir.set(0, -1, 0); uvs[j] = 1 - arcUv(dir, n, 'x', 'z', r, width); uvs[j + 1] = 1 - arcUv(dir, n, 'z', 'x', r, depth); break;
      case 4: dir.set(0, 0, 1); uvs[j] = 1 - arcUv(dir, n, 'x', 'y', r, width); uvs[j + 1] = 1 - arcUv(dir, n, 'y', 'x', r, height); break;
      default: dir.set(0, 0, -1); uvs[j] = arcUv(dir, n, 'x', 'y', r, width); uvs[j + 1] = 1 - arcUv(dir, n, 'y', 'x', r, height); break;
    }
  }
  return geo;
}
/** An element's emblem: a glossy disc in its colour, a white rim, its emoji. */
function emblemCanvas(element) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const col = ELEMENT[element]?.color || '#888888';
  const grd = g.createRadialGradient(108, 96, 10, 128, 128, 124);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.18, col);
  grd.addColorStop(1, '#1a1020');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(128, 128, 118, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.stroke();
  g.font = '150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(EMOJI[element] || '', 128, 140);
  return c;
}
/** Glass: a faint blue body with two bright diagonal glare streaks and a lighter rim, so it reads as glass. */
function glareTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(200,225,255,0.35)';
  g.fillRect(0, 0, 256, 256);
  const streak = (x, w, a) => {
    g.save();
    g.translate(128, 128);
    g.rotate(-0.6);
    const grd = g.createLinearGradient(x - w, 0, x + w, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - w, -260, w * 2, 520);
    g.restore();
  };
  streak(-40, 26, 0.95);
  streak(10, 10, 0.7);
  streak(70, 6, 0.5);
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 250);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createPieces(renderer) {
  const base = castleMaterials(renderer);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const M = {
    ...base,
    gold: new THREE.MeshStandardMaterial({ color: '#ffc74a', metalness: 1, roughness: 0.24, envMapIntensity: 1.6 }),
    goldGlow: new THREE.MeshStandardMaterial({ color: '#ffd76a', emissive: '#ffb020', emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 }),
    ruby: new THREE.MeshStandardMaterial({ color: '#c0102a', roughness: 0.08, metalness: 0.2, emissive: '#400008', envMapIntensity: 2 }),
    sapphire: new THREE.MeshStandardMaterial({ color: '#1d4fd8', roughness: 0.08, metalness: 0.2, emissive: '#06123a', envMapIntensity: 2 }),
    paint: new THREE.MeshStandardMaterial({ color: '#f2b51c', roughness: 0.42, metalness: 0.35 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#a39d92', roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: '#1b2633', roughness: 0.12, metalness: 0.7, envMapIntensity: 1.5 }),
    cable: new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.55, metalness: 0.5 }),
    walnut: new THREE.MeshStandardMaterial({ color: '#3b2416', roughness: 0.45, metalness: 0.1 }),
    glassPane: new THREE.MeshStandardMaterial({ map: glareTexture(), color: '#d6ebff', roughness: 0.04, metalness: 0.7, transparent: true, opacity: 0.44, envMapIntensity: 2.8, depthWrite: false }),
    glassShard: new THREE.MeshStandardMaterial({ color: '#cfe6ff', roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.55, envMapIntensity: 2 }),
    vine: new THREE.MeshStandardMaterial({ color: '#3f9a32', roughness: 0.7 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#68c447', roughness: 0.6, side: THREE.DoubleSide }),
    spring: new THREE.MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.25, metalness: 0.9 }),
    pin: new THREE.MeshBasicMaterial({ color: '#ffc02a', transparent: true, opacity: 0.95, depthTest: false, toneMapped: false }),
    pinRim: new THREE.MeshBasicMaterial({ color: '#2a1406', transparent: true, opacity: 0.6, depthTest: false, toneMapped: false }),
  };
  const team = SIDE_TEAM.map((t) => new THREE.MeshStandardMaterial({ color: TEAM[t].main, roughness: 0.5, metalness: 0.25 }));
  const velvet = SIDE_TEAM.map((t) => new THREE.MeshStandardMaterial({ color: TEAM[t].main, roughness: 0.62, metalness: 0.05, emissive: TEAM[t].dark, emissiveIntensity: 0.18 }));

  const geoCache = new Map();
  /**
   * The shape's outline (metres, round its centroid, y up) pushed DEPTH deep. The front and back carry UVs that lay the
   * game's own block texture (blockFaceCanvas: the outline plus a 3-unit edge) exactly on the face.
   */
  function blockGeometry(shape, depth = DEPTH, bev = 0.07) {
    const k = `${shape}|${depth}`;
    if (geoCache.has(k)) return geoCache.get(k);
    const s = shapeInfo(shape);
    if (BOX.has(shape)) {   // (a box: rounded edges, each of its six faces painted)
      const g = roundedBox(s.w / PX, s.h / PX, depth, 2, EDGE_R);
      geoCache.set(k, g);
      return g;
    }
    const pts = s.outline.map((p) => new THREE.Vector2((p.x - s.cx) / PX, -(p.y - s.cy) / PX)).reverse();
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: depth - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -(depth - 2 * bev) / 2);
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const PAD = 3;
    const texW = s.w + 2 * PAD;
    const texH = s.h + 2 * PAD;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(nor.getZ(i)) < 0.7) continue;
      const px = pos.getX(i) * PX + s.cx;
      const py = s.cy - pos.getY(i) * PX;
      uv.setXY(i, (PAD + px) / texW, 1 - (PAD + py) / texH);
    }
    g.computeVertexNormals();
    geoCache.set(k, g);
    return g;
  }
  /**
   * A block's look in skin `skin` (the owner, 17 Oct 2026, on the graphics: "would you be happy with this"; the battle's
   * camera sees mostly a block's sides, which were plain colour): Stapel's own art on every face. A box gets its front
   * and back, its ends and its top and bottom each painted at their own size with the shape's detail (the plank's grain
   * and nails, the crate's brace); the wedge its face, and its sloping sides in panels of its stone.
   */
  const matCache = new Map();
  const lacquer = (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.03, envMapIntensity: 1.15 });
  function faceTexture(art, w, h) {
    const t = new THREE.CanvasTexture(art.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    // (the face's square of UVs onto the art without its 3-unit edge: the outline's stroke lies on the rounded edge)
    t.repeat.set((w + 2) / art.texW, (h + 2) / art.texH);
    t.offset.set((art.pad - 1) / art.texW, (art.pad - 1) / art.texH);
    return t;
  }
  function faceMaterials(shape, skin) {
    const k = `${shape}|${skin}`;
    if (matCache.has(k)) return matCache.get(k);
    const color = SHAPE_COLOR[shape] ?? 0;
    const s = shapeInfo(shape);
    const D = DEPTH * PX;   // (the depth in Stapel's px)
    let mats = [base.sandstone, base.sandstone];
    if (BOX.has(shape)) {
      const face = blockFaceCanvas({ shape, color }, skin, 3, true);
      const end = blockPanelCanvas(shape, skin, color, D, s.h, 3);
      const cap = blockPanelCanvas(shape, skin, color, s.w, D, 3);
      if (face && end && cap) {
        const fm = lacquer(faceTexture(face, s.w, s.h));
        const em = lacquer(faceTexture(end, D, s.h));
        const cm = lacquer(faceTexture(cap, s.w, D));
        mats = [em, em, cm, cm, fm, fm];
        mats.pal = face.pal;
      }
    } else {
      const art = blockFaceCanvas({ shape, color }, skin, 3);
      const wall = blockPanelCanvas(shape, skin, color, D, D, 3);
      if (art && wall) {
        const t = new THREE.CanvasTexture(art.canvas);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = aniso;
        const w = new THREE.CanvasTexture(wall.canvas);
        w.colorSpace = THREE.SRGBColorSpace;
        w.anisotropy = aniso;
        w.wrapS = w.wrapT = THREE.RepeatWrapping;
        w.repeat.set(1 / DEPTH, 1 / DEPTH);   // (the extruded walls' UVs are in metres: one panel every block-depth)
        mats = [lacquer(t), lacquer(w)];
        mats.pal = art.pal;
      }
    }
    // (its pieces when it breaks: plain splinters in its own colour)
    mats.chip = new THREE.MeshStandardMaterial({ color: mats.pal ? new THREE.Color(mats.pal.fill) : '#b8996c', roughness: 0.62, metalness: 0.03 });
    matCache.set(k, mats);
    return mats;
  }
  const emblemMats = new Map();
  /** The emblem on a medallion's face: its picture, lit a little from within so it reads in shadow too. */
  function emblemMaterial(element) {
    if (!emblemMats.has(element)) {
      const t = new THREE.CanvasTexture(emblemCanvas(element));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      emblemMats.set(element, new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.32, roughness: 0.28, metalness: 0.05, envMapIntensity: 1.2 }));
    }
    return emblemMats.get(element);
  }
  // a medallion: a thick disc (its face the emblem, facing +z, upright) and a gold ring round it
  const medalGeo = new THREE.CylinderGeometry(1, 1, 0.12, 40, 1);
  medalGeo.rotateX(Math.PI / 2);
  medalGeo.rotateZ(Math.PI / 2);   // (the cap's picture upright when seen from the front)
  const medalRing = new THREE.TorusGeometry(1, 0.09, 10, 48);
  const medalMetal = new THREE.MeshStandardMaterial({ color: '#d6ad55', metalness: 1, roughness: 0.3, envMapIntensity: 1.7 });
  const box = (w, h, d, m) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.castShadow = o.receiveShadow = true;
    return o;
  };

  /**
   * A block's look: `shape` on `side`, its `element`'s emblem on the front and back, painted in Stapel `skin`.
   * userData: { top, bottom, w, h } (m above/below its centroid).
   */
  function block(shape, side, element = null, skin = 'kleur') {
    if (shape === 'crown') return crown(side);
    const s = shapeInfo(shape);
    const group = new THREE.Group();
    const W = s.w / PX;
    const H = s.h / PX;
    const top = s.cy / PX;
    const bottom = (s.h - s.cy) / PX;
    const m = new THREE.Mesh(blockGeometry(shape), faceMaterials(shape, skin));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (element) {   // (a raised medallion on the front and the back: the element at a glance, from any side)
      const r = Math.max(0.42, Math.min(0.76, Math.min(W, H) * 0.33));
      for (const z of [1, -1]) {
        const md = new THREE.Group();
        const disc = new THREE.Mesh(medalGeo, [medalMetal, emblemMaterial(element), medalMetal]);
        disc.scale.set(r, r, 1);
        const ring = new THREE.Mesh(medalRing, medalMetal);
        ring.scale.setScalar(r);
        ring.position.z = 0.05;
        disc.castShadow = ring.castShadow = true;
        md.add(disc, ring);
        md.position.z = z * (DEPTH / 2 + 0.05);
        if (z < 0) md.rotation.y = Math.PI;
        group.add(md);
      }
    }
    group.userData = { shape, side, element, top, bottom, w: W, h: H };
    return group;
  }
  /** (cards) the block as Stapel draws it in that skin, its emblem in the corner: a data URL. */
  const cardCache = new Map();
  function cardImage(shape, element, skin) {
    const k = `${shape}|${element}|${skin}`;
    if (cardCache.has(k)) return cardCache.get(k);
    const art = blockFaceCanvas({ shape, color: SHAPE_COLOR[shape] ?? 0 }, skin, 2);
    const c = canvas(240, 160);
    const g = c.getContext('2d');
    if (art) {
      const k2 = Math.min(200 / art.canvas.width, 120 / art.canvas.height);
      const w = art.canvas.width * k2;
      const h = art.canvas.height * k2;
      g.shadowColor = 'rgba(0,0,0,0.45)';
      g.shadowBlur = 10;
      g.shadowOffsetY = 5;
      g.drawImage(art.canvas, (240 - w) / 2, (160 - h) / 2 + 6, w, h);
      g.shadowColor = 'transparent';
    }
    if (element) g.drawImage(emblemCanvas(element), 168, 2, 70, 70);
    const url = c.toDataURL('image/png');
    cardCache.set(k, url);
    return url;
  }

  /**
   * The crown block (its physics box: 3.0 m x 2.3 m), in a glass cabinet (the owner: "the crown aspect doesnt work for
   * me. Put it in a glass cabinet"): a dark wooden plinth with gold trim, glass on four sides and on top in a slim gold
   * frame, and inside, on a small velvet cushion, the gold crown with its rubies and sapphires. Hits crack the glass
   * (`glassCrack`), the third shatters it (`glassBreak`).
   */
  function crown(side) {
    const s = shapeInfo('crown');
    const W = s.w / PX;
    const H = s.h / PX;
    const D = 2.5;
    const group = new THREE.Group();
    const plinthH = 0.42;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(W, plinthH, D), M.walnut);
    plinth.position.y = -H / 2 + plinthH / 2;
    plinth.castShadow = plinth.receiveShadow = true;
    group.add(plinth);
    // the gold frame: trim round the plinth, four posts, the top's edges (one piece)
    {
      const g = [];
      const bar = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); g.push(b); };
      const t = 0.11;
      const y0 = -H / 2 + plinthH;
      const y1 = H / 2 - t / 2;
      bar(W + 0.04, 0.06, D + 0.04, 0, y0 - 0.03, 0);
      bar(W + 0.04, 0.05, D + 0.04, 0, -H / 2 + 0.03, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bar(t, H - plinthH, t, (x * (W - t)) / 2, (y0 + H / 2) / 2, (z * (D - t)) / 2);
      for (const z of [-1, 1]) bar(W, t, t, 0, y1, (z * (D - t)) / 2);
      for (const x of [-1, 1]) bar(t, t, D, (x * (W - t)) / 2, y1, 0);
      const frame = new THREE.Mesh(merge(g), M.gold);
      frame.castShadow = true;
      group.add(frame);
    }
    // inside: a small cushion and the crown
    const innerY = -H / 2 + plinthH;
    const cush = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.26, 1.3, 4, 2, 4), velvet[side]);
    {
      const p = cush.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) / 0.75;
        const z = p.getZ(i) / 0.65;
        if (p.getY(i) > 0) p.setY(i, p.getY(i) + 0.09 * (1 - x * x) * (1 - z * z));
      }
      cush.geometry.computeVertexNormals();
    }
    cush.position.y = innerY + 0.13;
    group.add(cush);
    const parts = { gold: [], ruby: [], sapphire: [], velvet: [] };
    const o = new THREE.Object3D();
    const put = (key, geo, { p = [0, 0, 0], r = [0, 0, 0], sc = [1, 1, 1], look = null } = {}) => {
      o.position.set(...p);
      o.rotation.set(...r);
      o.scale.set(...sc);
      if (look) o.lookAt(look);
      o.updateMatrix();
      parts[key].push(geo.clone().applyMatrix4(o.matrix));
    };
    const R = 1.12;
    put('gold', new THREE.CylinderGeometry(R, R * 1.05, 0.62, 40, 1, true), { p: [0, 0.31, 0] });
    for (const [y, sc] of [[0.02, 1.05], [0.6, 1.0]]) put('gold', new THREE.TorusGeometry(R * sc, 0.075, 6, 40), { p: [0, y, 0], r: [Math.PI / 2, 0, 0] });
    const tall = new THREE.ConeGeometry(0.21, 0.78, 8);
    const small = new THREE.ConeGeometry(0.15, 0.46, 6);
    const ball = new THREE.SphereGeometry(0.115, 10, 8);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const big = i % 2 === 0;
      const h = big ? 0.39 : 0.23;
      put('gold', big ? tall : small, { p: [Math.sin(a) * R, 0.62 + h, Math.cos(a) * R] });
      put('gold', ball, { p: [Math.sin(a) * R, 0.62 + h * 2 + 0.06, Math.cos(a) * R] });
      const gp = new THREE.Vector3(Math.sin(a + Math.PI / 10) * R * 1.03, 0.31, Math.cos(a + Math.PI / 10) * R * 1.03);
      put(big ? 'ruby' : 'sapphire', new THREE.SphereGeometry(big ? 0.17 : 0.12, 12, 8), { p: gp.toArray(), sc: [1, 1.25, 0.6], look: gp.clone().multiplyScalar(2) });
    }
    put('velvet', new THREE.SphereGeometry(R * 0.97, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), { p: [0, 0.36, 0], sc: [1, 0.52, 1] });
    for (const r of [0, Math.PI / 2]) put('gold', new THREE.TorusGeometry(R * 0.82, 0.06, 6, 28, Math.PI), { p: [0, 0.36, 0], r: [0, r, 0], sc: [1, 0.62, 1] });
    const orbY = 0.36 + R * 0.82 * 0.62 + 0.1;
    put('gold', new THREE.SphereGeometry(0.17, 14, 10), { p: [0, orbY, 0] });
    put('gold', new THREE.BoxGeometry(0.08, 0.32, 0.08), { p: [0, orbY + 0.27, 0] });
    put('gold', new THREE.BoxGeometry(0.24, 0.08, 0.08), { p: [0, orbY + 0.3, 0] });
    const c = new THREE.Group();
    for (const [key, mat] of [['gold', M.gold], ['ruby', M.ruby], ['sapphire', M.sapphire], ['velvet', velvet[side]]]) {
      const mesh = new THREE.Mesh(merge(parts[key]), mat);
      mesh.castShadow = key === 'gold';
      c.add(mesh);
    }
    c.scale.setScalar(0.62);
    c.position.y = innerY + 0.3;
    group.add(c);
    // the glass: four panes and a lid (reflecting the sky), drawn after what's inside
    const glass = new THREE.Mesh(new THREE.BoxGeometry(W - 0.09, H - plinthH - 0.06, D - 0.09), M.glassPane);
    glass.position.y = innerY + (H - plinthH - 0.06) / 2;
    glass.renderOrder = 3;
    group.add(glass);
    group.userData = { shape: 'crown', side, top: H / 2, bottom: H / 2, w: W, h: H, jewel: c, glass };
    return group;
  }
  /** The glass's cracks (0-2 lost) and its end: shattered, the panes gone, the crown open to the sky. */
  const glassCrackMats = [1, 2].map((level) => {
    const m = crackMatsOf(level, true);
    return m;
  });
  function glassCrack(group, lost) {
    const gl = group.userData.glass;
    if (!gl) return;
    let ov = group.userData.glassCrack;
    if (!ov) {
      ov = new THREE.Mesh(gl.geometry, glassCrackMats[0]);
      ov.position.copy(gl.position);
      ov.scale.setScalar(1.004);
      ov.renderOrder = 4;
      group.add(ov);
      group.userData.glassCrack = ov;
    }
    ov.visible = lost > 0;
    ov.material = glassCrackMats[Math.min(2, Math.max(1, lost)) - 1];
  }
  function glassBreak(group) {
    if (group.userData.glass) group.userData.glass.visible = false;
    if (group.userData.glassCrack) group.userData.glassCrack.visible = false;
    group.userData.broken = true;
  }

  /** Cracks, worse with every hit (levels 1-3): dark jagged lines with pale chipped edges, tiling over the block. */
  const crackMats = [1, 2, 3].map((level) => crackMatsOf(level, false));
  function crackMatsOf(level, glassy) {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    const r = rng(40 + level);
    const crackLine = (x, y, a, len, w) => {
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = glassy ? (pass ? 'rgba(255,255,255,0.95)' : 'rgba(170,210,255,0.35)') : pass ? `rgba(18,12,10,${0.85})` : 'rgba(255,240,220,0.35)';
        g.lineWidth = pass ? w : w + 2;
        g.beginPath();
        let px = x;
        let py = y;
        let aa = a;
        g.moveTo(px, py);
        const rr = rng(Math.floor(x * 7 + y * 13 + level));
        for (let k = 0; k < len; k++) { aa += (rr() - 0.5) * 0.9; px += Math.cos(aa) * 9; py += Math.sin(aa) * 9; g.lineTo(px, py); }
        g.stroke();
      }
    };
    const n = level * 3 + 1;
    for (let i = 0; i < n; i++) {
      const x = r() * 256;
      const y = r() * 256;
      const a = r() * Math.PI * 2;
      crackLine(x, y, a, 6 + level * 4, 1.4 + level * 0.5);
      if (level > 1) crackLine(x, y, a + 2.4, 3 + level * 2, 1 + level * 0.3);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(glassy ? 0.6 : 0.34, glassy ? 0.6 : 0.34);
    if (glassy) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1, 1); }
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  /** Shows a block's damage: cracks for what it has lost (0 = none). */
  function crack(group, lost) {
    const main = group.children[0];
    if (!main) return;
    let ov = group.userData.crackMesh;
    if (!lost) { if (ov) ov.visible = false; return; }
    if (!ov) {
      ov = new THREE.Mesh(main.geometry, crackMats[0]);
      ov.renderOrder = 2;
      group.add(ov);
      group.userData.crackMesh = ov;
    }
    ov.visible = true;
    ov.material = crackMats[Math.min(3, lost) - 1];
  }

  /** A Perfek block's mark: a glowing gold seam where it sits cemented. */
  function seam(group) {
    const u = group.userData;
    const s = box(u.w - 0.05, 0.08, DEPTH + 0.04, M.goldGlow);
    s.castShadow = false;
    s.position.y = -u.bottom + 0.03;
    group.add(s);
    return s;
  }

  /** A burning block's soot: a dark film over it, deeper the longer it burns (0-1). */
  function soot(group, k) {
    const main = group.children[0];
    if (!main) return;
    let ov = group.userData.soot;
    if (!ov) {
      ov = new THREE.Mesh(main.geometry, new THREE.MeshBasicMaterial({ color: '#120804', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      ov.renderOrder = 2;
      group.add(ov);
      group.userData.soot = ov;
    }
    ov.material.opacity = Math.min(0.55, k * 0.55);
  }
  /** 🌿 Rankanker: vines over the block's faces, with leaves. */
  function vineWrap(group) {
    if (group.userData.vines) return;
    const u = group.userData;
    const r = rng(Math.floor((u.w * 13 + u.h * 7) * 100));
    const g = new THREE.Group();
    for (const z of [1, -1]) {
      for (let i = 0; i < 2; i++) {
        const x0 = (r() - 0.5) * u.w * 0.7;
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          pts.push(new THREE.Vector3(x0 + Math.sin(t * 5 + i) * 0.35 + (r() - 0.5) * 0.15, u.top + 0.05 - t * (u.top + u.bottom + 0.1), z * (DEPTH / 2 + 0.06)));
        }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.075, 5), M.vine);
        tube.castShadow = true;
        g.add(tube);
        for (let k = 1; k < 6; k++) {
          const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.2, 6), M.leaf);
          leaf.position.copy(pts[k]).add(new THREE.Vector3(0.18 * (k % 2 ? 1 : -1), 0, z * 0.03));
          leaf.scale.set(1, 0.55, 1);
          leaf.rotation.set(0, z < 0 ? Math.PI : 0, (k % 2 ? 0.6 : -0.6));
          g.add(leaf);
        }
      }
    }
    group.add(g);
    u.vines = g;
  }
  /** 💣 Verrassing: a steel spring on top, ready. */
  function springCoil(group) {
    if (group.userData.coil) return;
    const u = group.userData;
    const pts = [];
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2 * 4.5;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.32, (k / 64) * 0.7, Math.sin(a) * 0.32));
    }
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.05, 6), M.spring);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), team[u.side] || M.spring);
    cap.position.y = 0.74;
    const g = new THREE.Group();
    g.add(coil, cap);
    g.position.y = u.top;
    group.add(g);
    u.coil = g;
  }
  function dropCoil(group) { if (group.userData.coil) { group.userData.coil.visible = false; } }
  /** 💧 Watervat: the block wrapped in a skin of water, shimmering (`tick`), dry once it has soaked a shot. */
  const waterSkinMat = new THREE.MeshStandardMaterial({ color: '#2f9dff', emissive: '#0d5ea0', emissiveIntensity: 0.75, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, envMapIntensity: 2.6, depthWrite: false });
  function waterSkin(group) {
    const u = group.userData;
    if (u.skin) { u.skin.visible = true; return; }
    if (!u.shape || u.shape === 'crown') return;
    const m = new THREE.Mesh(blockGeometry(u.shape), waterSkinMat);
    m.scale.set(1 + 0.24 / Math.max(1, u.w), 1 + 0.24 / Math.max(1, u.h), 1.08);
    m.renderOrder = 4;
    group.add(m);
    u.skin = m;
  }
  function drySkin(group) { if (group.userData.skin) group.userData.skin.visible = false; }
  /** What moves by itself every frame (the water's shimmer). */
  function tick(time) {
    waterSkinMat.opacity = 0.5 + 0.08 * Math.sin(time * 2.6);
    waterSkinMat.emissiveIntensity = 0.7 + 0.25 * Math.sin(time * 1.7 + 1);
  }

  // ---------------------------------------------------------------------------------------------- the crane
  const lattice = (() => {
    const W = 1.3;
    const H = 2;
    const parts = [];
    const bar = (w, h, d, x, y, z, rz = 0, rx = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateX(rx);
      g.rotateZ(rz);
      g.translate(x, y, z);
      parts.push(g);
    };
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bar(0.13, H, 0.13, (x * W) / 2, H / 2, (z * W) / 2);
    bar(W, 0.09, 0.09, 0, 0.05, W / 2); bar(W, 0.09, 0.09, 0, 0.05, -W / 2);
    bar(0.09, 0.09, W, W / 2, 0.05, 0); bar(0.09, 0.09, W, -W / 2, 0.05, 0);
    const L = Math.hypot(W, H);
    const a = Math.atan2(W, H);
    bar(0.07, L, 0.07, 0, H / 2, W / 2, a); bar(0.07, L, 0.07, 0, H / 2, -W / 2, -a);
    bar(0.07, L, 0.07, W / 2, H / 2, 0, 0, a); bar(0.07, L, 0.07, -W / 2, H / 2, 0, 0, -a);
    return merge(parts);
  })();
  /** A jib-like lattice along +x, `len` long: two bottom chords and a top chord, braced every 1.4 m. */
  function truss(len, w = 1.0, h = 1.1) {
    const parts = [];
    const bar = (L, x, y, z) => {
      const g = new THREE.BoxGeometry(L, 0.09, 0.09);
      g.translate(x, y, z);
      parts.push(g);
    };
    bar(len, len / 2, 0, w / 2); bar(len, len / 2, 0, -w / 2); bar(len, len / 2, h, 0);
    const n = Math.round(len / 1.4);
    const step = len / n;
    for (let i = 0; i < n; i++) {
      const x0 = i * step;
      for (const z of [w / 2, -w / 2]) {
        const dz = -z;
        const L = Math.hypot(step / 2, h, dz);
        const g = new THREE.BoxGeometry(0.06, L, 0.06);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(step / 2, h, dz).normalize()));
        g.translate(x0 + step / 4, h / 2, z + dz / 2);
        parts.push(g);
        const g2 = new THREE.BoxGeometry(0.06, L, 0.06);
        g2.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(step / 2, -h, -dz).normalize()));
        g2.translate(x0 + (3 * step) / 4, h / 2, z + dz / 2);
        parts.push(g2);
      }
      const rung = new THREE.BoxGeometry(0.06, 0.06, w);
      rung.translate(x0, 0, 0);
      parts.push(rung);
    }
    return merge(parts);
  }
  const JIB_OUT = 11.5;   // m the jib reaches towards the foe from the stack's middle
  const JIB_IN = 7.0;     // ...and away from it (the swing reaches both sides of the tower)
  const jibGeo = truss(JIB_OUT + JIB_IN);
  const MAST_Z = -6.2;    // the mast stands at the back of the rock; parked, the whole jib lies behind the battle
  const ease = (k) => k * k * (3 - 2 * k);
  /**
   * The crane over `side`'s stack. `set({ jibY, tx, hookY, swing })` moves it (metres, world); `park(on, fast)` swings
   * the jib half a turn round the mast (behind the battle on the way), pointing away from the foe: from the battle view
   * a parked jib never hangs over a throw's path (the owner: "it looks like its going through the crane").
   */
  function crane(side) {
    const dir = towardFoe(side);
    const sx = sideX(side) / PX;
    const g = new THREE.Group();
    const mastX = sx - dir * 3.4;
    const mast = new THREE.InstancedMesh(lattice, M.paint, 40);
    mast.castShadow = true;
    mast.frustumCulled = false;
    mast.position.set(mastX, STACK_TOP, MAST_Z);
    g.add(mast);
    const foot = box(2.6, 0.9, 2.6, M.concrete);
    foot.position.set(mastX, STACK_TOP + 0.45, MAST_Z);
    g.add(foot);
    // the head turns round the mast: everything above it lives in the head's frame (the jib's line at z = -MAST_Z)
    const head = new THREE.Group();
    g.add(head);
    const JZ = -MAST_Z;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.45, 24), M.iron);
    ring.position.set(0, 0.22, 0);
    head.add(ring);
    const neck = box(1.1, 0.7, JZ + 0.6, M.paint);
    neck.position.set(0, 0.75, JZ / 2);
    head.add(neck);
    const cab = box(1.7, 1.55, 1.7, team[side]);
    cab.position.set(dir * 1.25, 1.35, 0.2);
    head.add(cab);
    const win = box(1.2, 0.7, 0.05, M.glass);
    win.position.set(dir * 1.25, 1.6, 1.06);
    head.add(win);
    const jibPivot = new THREE.Group();
    jibPivot.position.set(0, 1.1, JZ);
    head.add(jibPivot);
    const jib = new THREE.Mesh(jibGeo, M.paint);
    jib.castShadow = true;
    jib.scale.x = dir;
    jib.position.x = (sx - dir * JIB_IN) - mastX;
    jibPivot.add(jib);
    const apexY = 5.1;
    for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) {
      const L = Math.hypot(x, apexY, z);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, L, 6), M.paint);
      leg.position.set(x / 2, apexY / 2, z / 2);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-x, apexY, -z).normalize());
      jibPivot.add(leg);
    }
    const tieTo = (x) => {
      const a = new THREE.Vector3(0, apexY, 0);
      const b = new THREE.Vector3(x, 1.1, 0);
      const L = a.distanceTo(b);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L, 5), M.cable);
      t.position.copy(a).add(b).multiplyScalar(0.5);
      t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      jibPivot.add(t);
    };
    tieTo(dir * 9.5);
    tieTo(dir * 5.0);
    const cwX = (sx - dir * (JIB_IN - 0.9)) - mastX;
    tieTo(cwX);
    for (let i = 0; i < 3; i++) {
      const cw = box(0.7, 1.7, 1.5, M.concrete);
      cw.position.set(cwX + dir * i * 0.75, -0.85, 0);
      jibPivot.add(cw);
    }
    const flag = banner(SIDE_TEAM[side], { pole: 2.4, w: 2.2, h: 1.3 });
    flag.position.set(0, apexY - 0.3, 0);
    flag.scale.x = -dir;
    jibPivot.add(flag);
    // trolley, cables, hook: on the jib (they turn with it)
    const trolley = box(1.0, 0.36, 1.25, M.iron);
    head.add(trolley);
    const cableGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 5);
    cableGeo.translate(0, -0.5, 0);
    const cables = [-0.22, 0.22].map((z) => {
      const c = new THREE.Mesh(cableGeo, M.cable);
      c.userData.z = z;
      head.add(c);
      return c;
    });
    const hook = new THREE.Group();
    hook.add(box(0.62, 0.66, 0.6, M.paint));
    const hk = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 8, 16, Math.PI * 1.5), M.iron);
    hk.position.y = -0.55;
    hk.rotation.z = Math.PI * 0.75;
    hook.add(hk);
    head.add(hook);
    const hold = new THREE.Group();   // (the hanging block goes in here)
    hook.add(hold);
    hold.position.y = -0.85;
    const st = { jibY: STACK_TOP + 16, tx: sx, hookY: STACK_TOP + 10, flex: 0, flexV: 0, swing: 0, park: 1, parkTo: 1, parkSpeed: 1.4 };
    function place() {
      // (the mast hangs from the head down: it always meets it; the lowest segment ends inside the rock)
      const H = Math.max(4, st.jibY - 1.1 - STACK_TOP);
      const n = Math.min(40, Math.ceil(H / 2));
      if (n !== mast.count || st.H !== H) {
        mast.count = n;
        const m = new THREE.Matrix4();
        for (let i = 0; i < n; i++) { m.makeTranslation(0, H - 2 - i * 2, 0); mast.setMatrixAt(i, m); }
        mast.instanceMatrix.needsUpdate = true;
        st.H = H;
      }
      head.position.set(mastX, STACK_TOP + H, MAST_Z);
      head.rotation.y = dir * Math.PI * ease(st.park);
      jibPivot.rotation.z = st.flex * dir * 0.02;
      const lx = st.tx - mastX;
      trolley.position.set(lx, 1.1 - 0.22, JZ);
      const hookTop = st.hookY - head.position.y + 0.33;
      const len = Math.max(0.3, 1.1 - 0.4 - hookTop);
      for (const c of cables) {
        c.position.set(lx, 1.1 - 0.4, JZ + c.userData.z);
        c.scale.y = len;
        c.rotation.z = st.swing;
      }
      hook.position.set(lx + Math.sin(st.swing) * len, st.hookY - head.position.y, JZ);
      hook.rotation.z = st.swing;
    }
    place();
    return {
      group: g, hold, dir, side,
      get jibY() { return head.position.y + 1.1; },
      get parked() { return st.park > 0.5; },
      get working() { return st.park < 0.02; },
      /** Moves the crane: the jib to `jibY`, the trolley to `tx`, the hook to `hookY` (m). */
      set({ jibY, tx, hookY, swing }) {
        if (jibY != null) st.jibY = jibY;
        if (tx != null) st.tx = tx;
        if (hookY != null) st.hookY = hookY;
        if (swing != null) st.swing = swing;
        place();
      },
      /** Swings the jib out of the battle (true) or back over the tower (false); `fast` right after a throw. */
      park(on, fast = false) { st.parkTo = on ? 1 : 0; st.parkSpeed = fast ? 2.4 : 1.0; },
      /** The jib's whip after a throw. */
      whip(k = 1) { st.flexV += 9 * k; },
      update(dt, time) {
        st.flexV += (-st.flex * 60 - st.flexV * 6) * dt;
        st.flex += st.flexV * dt;
        if (st.park !== st.parkTo) st.park = st.parkTo > st.park ? Math.min(st.parkTo, st.park + dt * st.parkSpeed) : Math.max(st.parkTo, st.park - dt * st.parkSpeed);
        flag.userData.wave?.(time);
        place();
      },
    };
  }

  /** The throw's direction pin: a gold arrow at the launch point, aimed with `aim(theta, dir)`. */
  function pin() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 5.4, 10), M.pin);
    shaft.rotation.z = -Math.PI / 2;
    shaft.position.x = 2.7;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 14), M.pin);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 6.0;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), M.pin);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 28), M.pinRim);
    rim.rotation.y = Math.PI / 2;
    for (const o of [shaft, head, knob, rim]) { o.renderOrder = 9; g.add(o); }
    g.visible = false;
    g.userData.aim = (theta, dir) => { g.rotation.set(0, 0, dir > 0 ? theta : Math.PI - theta); };
    return g;
  }

  const ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.26, depthWrite: false });
  const ghostGold = new THREE.MeshBasicMaterial({ color: '#ffd04a', transparent: true, opacity: 0.42, depthWrite: false });
  /** The landing guide: a see-through copy of the block where it will land (gold when it lands a Perfek). */
  function ghost(shape) {
    const m = new THREE.Mesh(blockGeometry(shape), ghostMat);
    m.renderOrder = 4;
    m.userData.gold = (on) => { m.material = on ? ghostGold : ghostMat; };
    return m;
  }

  /**
   * A badge over a crown, seen through everything (a tower stands in front of their crown): where it is, how many hits
   * its glass has left (pips), red once the glass is gone. `set(hp, hpMax)`; it stands on its point.
   */
  function crownMark(side) {
    const c = canvas(128, 168);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true, toneMapped: false }));
    s.renderOrder = 12;
    s.center.set(0.5, 0);
    let key = '';
    s.userData.set = (hp, hpMax) => {
      const k = `${hp}|${hpMax}`;
      if (k === key) return;
      key = k;
      const open = hp <= 0;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 128, 168);
      // the point
      g.fillStyle = open ? '#ff5a4a' : TEAM[SIDE_TEAM[side]].main;
      g.beginPath(); g.moveTo(50, 118); g.lineTo(78, 118); g.lineTo(64, 140); g.closePath(); g.fill();
      // the badge
      g.beginPath(); g.arc(64, 62, 52, 0, Math.PI * 2);
      g.fillStyle = 'rgba(18, 10, 28, 0.88)'; g.fill();
      g.lineWidth = 8; g.strokeStyle = open ? '#ff5a4a' : TEAM[SIDE_TEAM[side]].light; g.stroke();
      // the crown
      g.fillStyle = open ? '#ffb4a8' : '#ffd04a';
      g.beginPath();
      g.moveTo(32, 80); g.lineTo(28, 42); g.lineTo(46, 58); g.lineTo(64, 32); g.lineTo(82, 58); g.lineTo(100, 42); g.lineTo(96, 80);
      g.closePath(); g.fill();
      g.fillRect(32, 84, 64, 9);
      g.fillStyle = '#c0102a';
      for (const [x, y] of [[28, 42], [64, 32], [100, 42]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
      // the glass: a pip for every hit it can still take
      for (let i = 0; i < hpMax; i++) {
        const x = 64 + (i - (hpMax - 1) / 2) * 30;
        g.beginPath(); g.arc(x, 155, 11, 0, Math.PI * 2);
        g.fillStyle = i < hp ? '#e8f6ff' : 'rgba(255, 255, 255, 0.18)';
        g.fill();
        g.lineWidth = 3; g.strokeStyle = 'rgba(10, 6, 18, 0.8)'; g.stroke();
      }
      t.needsUpdate = true;
    };
    return s;
  }

  return { M, block, crown, seam, crack, glassCrack, glassBreak, soot, vineWrap, springCoil, dropCoil, waterSkin, drySkin, tick, crane, pin, blockGeometry, cardImage, team, velvet, ghost, crownMark };
}
