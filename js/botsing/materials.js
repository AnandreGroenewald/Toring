// (1.18) Blokbotsing and Jou dorp: a block's surface as a real material (the owner, 17 Oct 2026: "the Block Clash and
// the Your town feels like childs play"; his pick: "the look"). Stapel's flat block art (outlines, bands) gives way to
// what a block would be made of: the standard skin is painted timber, worn at the edges, grimy low down; every bought
// skin its own (gold, stone, marble, lava, ice, carbon, moss ...). Each shape keeps its character from Stapel: the
// plank a long board with nails, the crate its frame and brace, the cube a recessed panel, the pillar its flutes and
// capitals, the slab a stone with a groove, the wedge its strata. Painted per pixel once per shape and skin (a colour
// picture and a height picture laid out like pieces.js's atlas), from small noise fields made once. A skin whose look
// takes the block's colour (painted timber, carbon's trim) keeps how much of the colour each pixel takes: another
// colour of the same shape is then a quick sum per pixel, not a new painting (a town has three colours of a shape).
import * as THREE from '../../lib/three.module.min.js';
import { rng } from '../kasteel/world.js';
import { PALETTE } from '../config.js';

const PAD = 3;   // (Stapel's texture edge, in its px)

// -------------------------------------------------------------------------------------------- noise, made once
// (value noise from lattices of random numbers, octave by octave: a few times quicker than a hash per point, which
// matters on a phone at load; the same soft look as kasteel/world.js's fbm). Each lattice has a whole number of cells
// across the field and wraps, so the field tiles: a painter reaching past its edge reads on, never a smeared edge.
const NF = 512;   // (a power of two: the reads wrap with a mask)
const NM = NF - 1;
function makeField(seed, scale, oct) {
  const f = new Float32Array(NF * NF);
  const r = rng(seed * 7919 + 13);
  let amp = 1;
  let tot = 0;
  let freq = scale;
  // (a column's lattice cells and blend are the same on every row: worked out once an octave)
  const X0 = new Int32Array(NF);
  const X1 = new Int32Array(NF);
  const TX = new Float64Array(NF);
  for (let o = 0; o < oct; o++) {
    const n = Math.max(2, Math.round(NF * freq));   // (lattice cells across the field at this octave)
    const step = n / NF;
    const lat = new Float32Array(n * n);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let x = 0; x < NF; x++) {
      const fx = x * step;
      const xi = Math.floor(fx);
      const tx = fx - xi;
      X0[x] = xi;
      X1[x] = (xi + 1) % n;
      TX[x] = tx * tx * (3 - 2 * tx);
    }
    for (let y = 0; y < NF; y++) {
      const fy = y * step;
      const yi = Math.floor(fy);
      let ty = fy - yi;
      ty = ty * ty * (3 - 2 * ty);
      const row0 = yi * n;
      const row1 = ((yi + 1) % n) * n;
      const at0 = y * NF;
      for (let x = 0; x < NF; x++) {
        const tx = TX[x];
        const a = lat[row0 + X0[x]];
        const b = lat[row0 + X1[x]];
        const c = lat[row1 + X0[x]];
        const d = lat[row1 + X1[x]];
        f[at0 + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
    }
    tot += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  for (let i = 0; i < f.length; i++) f[i] /= tot;
  return f;
}
let FIELDS = null;
function fields() {
  if (!FIELDS) FIELDS = { fine: makeField(1, 0.09, 3), mid: makeField(2, 0.035, 4), big: makeField(3, 0.012, 4) };
  return FIELDS;
}
/** A field at (x, y) (its px, wrapping round: the field tiles), bilinear. */
function at(f, x, y) {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const tx = x - fx;
  const ty = y - fy;
  const x0 = fx & NM;
  const x1 = (fx + 1) & NM;
  const r0 = (fy & NM) * NF;
  const r1 = ((fy + 1) & NM) * NF;
  const a = f[r0 + x0];
  const b = f[r0 + x1];
  const c = f[r1 + x0];
  const d = f[r1 + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const sstep = (a, b, t) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k); };
const mix = (a, b, t) => a + (b - a) * t;
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
/** A paint colour from Stapel's palette, as real paint looks: a little less loud, a little deeper. */
function paintOf(hex) {
  const [r, g, b] = rgb(hex);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const k = 0.78;   // (saturation kept)
  return [mix(l, r, k) * 0.86, mix(l, g, k) * 0.86, mix(l, b, k) * 0.86];
}

// --------------------------------------------------------------------------------------------- the materials
// A painter: (u, v) in Stapel px inside a w x h side, `e` the distance to its nearest edge, `o` an offset into the noise
// (each block and side its own patch); writes colour (0-255) and height (0-1) into `out`. A skin that takes the block's
// colour writes, in `out[4]`, how much of that colour the pixel takes (the colour is then out[0..2] + out[4] x it).
const WOOD = [168, 132, 94];
const WOOD_DARK = [118, 88, 60];
function woodAt(u, v, o, along, out) {
  const F = fields();
  const a = along ? u : v;   // (the grain runs along the board)
  const c = along ? v : u;
  const warp = at(F.mid, o + a * 0.5, o + c * 2.2) * 9;
  const ring = 0.5 + 0.5 * Math.sin(c * 1.15 + warp + at(F.big, o + a * 0.3, o + c) * 6);
  const streak = at(F.fine, o + a * 0.35, o + c * 4);
  const t = clamp01(ring * 0.55 + streak * 0.6 - 0.15);
  out[0] = mix(WOOD[0], WOOD_DARK[0], t);
  out[1] = mix(WOOD[1], WOOD_DARK[1], t);
  out[2] = mix(WOOD[2], WOOD_DARK[2], t);
  out[3] = 0.55 - t * 0.25;
}
/**
 * Painted timber: the paint chipped off at the edges and in scratches, grime low down, the grain under the paint. The
 * paint is the block's colour (out[4]: how much of it shows, shaded), the bare wood where it has worn.
 */
function paintedWood() {
  const w = [0, 0, 0, 0];
  return (u, v, W, H, e, o, side, out) => {
    const F = fields();
    woodAt(u, v, o, W >= H || side === 'cap', w);
    // where the paint has worn: near the edges (ragged), in a few scratches
    const ragged = at(F.mid, o + u * 1.6, o + v * 1.6);
    const bite = at(F.fine, o + 90 + u * 1.9, o + v * 1.9);
    const chip = sstep(0.6 + ragged * 2.6, 0, e) * sstep(0.35, 0.6, bite + ragged * 0.4);
    const scratch = sstep(0.82, 0.9, at(F.fine, o + u * 0.6 + v * 0.05, o + v * 3.5)) * 0.8;
    const wear = clamp01(chip + scratch * (1 - sstep(0, 6, e) * 0.3));
    // the paint itself: brush strokes along the grain, a little sun-faded on top
    const brush = (at(F.fine, o + u * 0.25, o + v * 2.8) - 0.5) * 0.12;
    const fade = side === 'cap' ? 1.08 : 1;
    const grime = sstep(H * 0.55, H, v) * 0.22 * (side === 'cap' ? 0 : 1) + (at(F.big, o + u * 2, o + v * 2) - 0.5) * 0.14;
    const k = (1 + brush) * fade * (1 - grime);
    out[0] = w[0] * wear;
    out[1] = w[1] * wear;
    out[2] = w[2] * wear;
    out[3] = mix(0.75 + brush * 0.5, w[3] * 0.6, wear);   // (paint stands a little proud of the bare wood)
    out[4] = k * (1 - wear);
  };
}
/** Cut stone: grains of several sizes, a soft bloom of lighter mineral, darker low down. */
function stone(base, speck = 0.18) {
  return (u, v, W, H, e, o, side, out) => {
    const F = fields();
    const n1 = at(F.fine, o + u * 5.5, o + v * 5.5);
    const n2 = at(F.mid, o + u * 1.4, o + v * 1.4);
    const n3 = at(F.big, o + u, o + v);
    const s = sstep(0.66, 0.7, n1) * speck;   // (light specks)
    const d = sstep(0.7, 0.74, at(F.fine, o + 200 + u * 6.5, o + v * 6.5)) * speck * 1.4;   // (dark specks)
    const k = 0.86 + (n2 - 0.5) * 0.28 + (n3 - 0.5) * 0.2 + s - d - (side === 'cap' ? 0 : sstep(H * 0.6, H, v) * 0.12);
    const edge = sstep(2.5, 0.3, e) * 0.12;   // (a worn, lighter arris)
    out[0] = base[0] * k + 255 * edge;
    out[1] = base[1] * k + 255 * edge;
    out[2] = base[2] * k + 255 * edge;
    out[3] = 0.5 + (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.4 - edge;
  };
}
/** Brushed metal: fine streaks one way, a few scratches, brighter worn edges. */
function metal(base, brushed = 0.2) {
  return (u, v, W, H, e, o, side, out) => {
    const F = fields();
    const st = (at(F.fine, o + u * 0.08, o + v * 6) - 0.5) * brushed;
    const sc = sstep(0.86, 0.9, at(F.fine, o + 300 + u * 0.9 - v * 0.3, o + v * 0.9 + u * 0.2)) * 0.25;
    const edge = sstep(2, 0.2, e) * 0.18;
    const k = 1 + st + sc + edge - (at(F.big, o + u, o + v) - 0.5) * 0.12;
    out[0] = base[0] * k;
    out[1] = base[1] * k;
    out[2] = base[2] * k;
    out[3] = 0.5 + st * 0.6 - sc;
  };
}
/** Marble: a cream body, grey veins wandering through it. */
function marble(base, vein) {
  return (u, v, W, H, e, o, side, out) => {
    const F = fields();
    const t = at(F.mid, o + u * 0.9, o + v * 0.9) * 10 + at(F.big, o + u * 0.4, o + v * 0.4) * 6;
    const line = Math.pow(1 - Math.abs(Math.sin(t + u * 0.03)), 7);
    const fine = Math.pow(1 - Math.abs(Math.sin(t * 2.3 + v * 0.05)), 14) * 0.5;
    const cloud = (at(F.big, o + 100 + u * 1.3, o + v * 1.3) - 0.5) * 0.12;
    const k = clamp01(line * 0.75 + fine);
    out[0] = mix(base[0] * (1 + cloud), vein[0], k);
    out[1] = mix(base[1] * (1 + cloud), vein[1], k);
    out[2] = mix(base[2] * (1 + cloud), vein[2], k);
    out[3] = 0.5 - k * 0.15;
  };
}
/** Lava rock: black basalt, cracks glowing from inside (into `glow`, the emissive picture). */
function lava() {
  return (u, v, W, H, e, o, side, out, glowOut) => {
    const F = fields();
    const n = at(F.mid, o + u * 1.5, o + v * 1.5);
    const ridge = 1 - Math.abs(at(F.mid, o + 50 + u * 1.6, o + v * 1.6) * 2 - 1);
    const crack = sstep(0.955, 0.99, ridge) * (0.6 + 0.4 * at(F.big, o + u * 2, o + v * 2));
    const k = 0.5 + (n - 0.5) * 0.6 + (at(F.fine, o + u * 3, o + v * 3) - 0.5) * 0.25;
    out[0] = 38 * k;
    out[1] = 32 * k;
    out[2] = 30 * k;
    out[3] = 0.55 + (n - 0.5) * 0.6 - crack * 0.5;
    glowOut[0] = 255 * crack;
    glowOut[1] = 120 * crack * crack;
    glowOut[2] = 20 * crack;
  };
}
/** Ice: pale blue, frosted at the edges, a few fine cracks. */
function ice() {
  return (u, v, W, H, e, o, side, out) => {
    const F = fields();
    const frost = sstep(7, 0, e) * 0.6 + (at(F.fine, o + u * 2, o + v * 2) - 0.5) * 0.18;
    const ridge = 1 - Math.abs(at(F.mid, o + 70 + u * 1.2, o + v * 1.2) * 2 - 1);
    const crack = sstep(0.93, 0.97, ridge) * 0.6;
    const deep = at(F.big, o + u, o + v);
    out[0] = mix(120 + deep * 40, 235, frost) + crack * 90;
    out[1] = mix(175 + deep * 35, 245, frost) + crack * 60;
    out[2] = mix(215 + deep * 25, 252, frost) + crack * 30;
    out[3] = 0.5 + frost * 0.3 - crack * 0.3;
  };
}
/** Carbon fibre: a 2x2 twill under a clear coat, trimmed at the edges in the block's colour (out[4]). */
function carbon() {
  return (u, v, W, H, e, o, side, out) => {
    const s = 3.2;
    const cx = Math.floor((u + v) / s);
    const cy = Math.floor((u - v + 1000) / s);
    const weave = ((cx + cy) & 3) < 2 ? 1 : 0;
    const fu = ((u + v) / s) % 1;
    const sheen = weave ? 0.6 + 0.4 * Math.sin(fu * Math.PI) : 0.35 + 0.25 * Math.sin(fu * Math.PI);
    const trim = sstep(1.6, 0.4, e);
    out[0] = (26 * sheen + 10) * (1 - trim);
    out[1] = (28 * sheen + 10) * (1 - trim);
    out[2] = (32 * sheen + 12) * (1 - trim);
    out[3] = 0.5 + (weave ? 0.08 : -0.08);
    out[4] = trim;
  };
}
/** Moss on stone: green where rain and shade keep it (low and on top), the stone between. */
function mossy(stoneBase, moss) {
  const st = stone(stoneBase, 0.15);
  return (u, v, W, H, e, o, side, out) => {
    st(u, v, W, H, e, o, side, out);
    const F = fields();
    const m = at(F.mid, o + 400 + u * 1.3, o + v * 1.3) + (side === 'cap' ? 0.25 : sstep(H * 0.3, H, v) * 0.18) - 0.48;
    const k = sstep(0, 0.12, m);
    const tuft = (at(F.fine, o + u * 3, o + v * 3) - 0.5) * 0.3;
    out[0] = mix(out[0], moss[0] * (1 + tuft), k);
    out[1] = mix(out[1], moss[1] * (1 + tuft), k);
    out[2] = mix(out[2], moss[2] * (1 + tuft), k);
    out[3] = mix(out[3], 0.75 + tuft, k);
  };
}

/**
 * The skins: which material and its settings (roughness, metalness; `glow` for an emissive picture; `tint` the colour a
 * skin takes from the block's own: painted timber its paint, carbon its trim). A skin left out keeps Stapel's own
 * picture (piksel, lekkergoed, neon, holo, heelal: drawn as they're meant to be).
 */
const SKINS = {
  kleur: { make: () => paintedWood(), tint: (pal) => paintOf(pal.fill), roughness: 0.62, metalness: 0 },
  klip: { make: () => stone([150, 145, 136]), roughness: 0.86, metalness: 0 },
  goud: { make: () => metal([236, 186, 74], 0.05), roughness: 0.2, metalness: 1 },
  chroom: { make: () => metal([214, 218, 226], 0.04), roughness: 0.1, metalness: 1 },
  marmer: { make: () => marble([236, 230, 220], [120, 118, 122]), roughness: 0.18, metalness: 0 },
  lawa: { make: () => lava(), roughness: 0.8, metalness: 0, glow: true },
  ys: { make: () => ice(), roughness: 0.08, metalness: 0.1 },
  koolstof: { make: () => carbon(), tint: (pal) => rgb(pal.fill), roughness: 0.26, metalness: 0.2 },
  mos: { make: () => mossy([128, 124, 112], [92, 128, 52]), roughness: 0.9, metalness: 0 },
};
export const hasMaterial = (skin) => Object.prototype.hasOwnProperty.call(SKINS, skin);

// ------------------------------------------------------------------------------------- each shape's character
// (carved into the height, and for painted timber a touch of colour: nails, the crate's darker recesses)
function detailOf(shape) {
  switch (shape) {
    case 'plank': return { along: true, nails: [[9, 0.42], [9, 0.72]] };
    case 'crate': return { frame: 0.13, brace: true, nails: true };
    case 'cube': return { panel: 0.36 };
    case 'pillar': return { flutes: 3, caps: true };
    case 'slab': return { groove: 0.56 };
    case 'wedge': return { strata: [0.38, 0.66] };
    default: return {};
  }
}
/** How a shape's carving lifts or sinks the surface at (u, v) on its face (0 = flat): [height add, shade] into `res`. */
function carve(d, u, v, W, H, side, res) {
  res[0] = 0;
  res[1] = 0;
  if (side !== 'face') {
    if (d.caps && side === 'end') {   // (the pillar's capitals run round it)
      const t = v / H;
      res[0] = (sstep(0.07, 0.09, t) - sstep(0.91, 0.93, t)) * -0.15;
    }
    return;
  }
  let h = 0;
  let shade = 0;
  if (d.panel) {
    const s = Math.min(W, H) * d.panel;
    const dx = Math.abs(u - W / 2) - s / 2;
    const dy = Math.abs(v - H / 2) - s / 2;
    const inside = Math.max(dx, dy);
    h -= sstep(0.8, -0.8, inside) * 0.35;
    shade += sstep(0.8, -0.8, inside) * 0.08 - sstep(0.2, -1.2, Math.abs(inside)) * 0.12;
  }
  if (d.frame) {
    const f = Math.min(W, H) * d.frame;
    const inner = Math.min(u - f, W - f - u, v - f, H - f - v);
    if (inner > 0) {
      let brace = false;
      if (d.brace) {
        const t = (u - f) / (W - 2 * f);
        const y = H - f - t * (H - 2 * f);
        brace = Math.abs(v - y) < Math.min(W, H) * 0.08;
      }
      if (!brace) { h -= 0.3; shade += 0.16; }
    }
    if (Math.abs(inner) < 0.9) { h -= 0.15; shade += 0.2; }
  }
  if (d.flutes) {
    const t = v / H;
    if (t > 0.14 && t < 0.86) for (let k = 1; k <= d.flutes; k++) { const x = (W * k) / (d.flutes + 1); const g = sstep(2.2, 0.4, Math.abs(u - x)); h -= g * 0.25; shade += g * 0.1; }
    h += (sstep(0.08, 0.1, t) - sstep(0.9, 0.92, t)) * -0.12;
  }
  if (d.groove) { const g = sstep(1.6, 0.3, Math.abs(v - H * d.groove)); h -= g * 0.3; shade += g * 0.15; }
  if (d.strata) for (const s of d.strata) { const g = sstep(1.2, 0.2, Math.abs(v - H * s)); h -= g * 0.18; shade += g * 0.1; }
  res[0] = h;
  res[1] = shade;
}
/** The nail heads on a face (flat x, y pairs): the plank's at its ends, the crate's in its corners. */
function nailPoints(d, w, h) {
  return Array.isArray(d.nails) ? d.nails.flatMap(([x, fy]) => [x, h * fy, w - x, h * fy]) : [5, 5, w - 5, 5, 5, h - 5, w - 5, h - 5];
}

// -------------------------------------------------------------------------------------------------- painting
/**
 * Paints one side (w x h Stapel px, its 3 px edge round it) at `k` canvas px per Stapel px: its height into `hgt` (and
 * its glow into `glw` for an emissive picture) at (x0, y0), and returns its colour as a recipe: per pixel a colour `B`
 * and, for a skin that takes the block's colour, how much of that colour it takes (`A`; the pixel is B + A x colour).
 * `side`: 'face' (front and back), 'end' (left and right) or 'cap'.
 */
function paintSide(painter, d, w, h, k, side, o, tinted, hgt, glw, x0, y0) {
  const cw = Math.ceil((w + 2 * PAD) * k);
  const ch = Math.ceil((h + 2 * PAD) * k);
  const B = new Float32Array(cw * ch * 3);
  const A = tinted ? new Float32Array(cw * ch) : null;
  const hd = hgt.createImageData(cw, ch);
  const gd = glw ? glw.createImageData(cw, ch) : null;
  const out = [0, 0, 0, 0, 0];
  const glow = [0, 0, 0];
  const cut = [0, 0];
  const nails = d.nails && side === 'face' ? nailPoints(d, w, h) : null;
  for (let py = 0; py < ch; py++) {
    const v = Math.min(h, Math.max(0, py / k - PAD));
    for (let px = 0; px < cw; px++) {
      const u = Math.min(w, Math.max(0, px / k - PAD));
      const e = Math.min(u, w - u, v, h - v);
      glow[0] = glow[1] = glow[2] = 0;
      out[4] = 0;
      painter(u, v, w, h, e, o, side, out, glow);
      carve(d, u, v, w, h, side, cut);
      const s = 1 - cut[1];
      let r = out[0] * s;
      let g = out[1] * s;
      let b = out[2] * s;
      let a = out[4] * s;
      let hh = out[3] + cut[0];
      if (nails) {   // (nail heads: the plank's at its ends, the crate's in its corners)
        for (let j = 0; j < nails.length; j += 2) {
          const dd = Math.hypot(u - nails[j], v - nails[j + 1]);
          if (dd < 2.1) { const t = 1 - dd / 2.1; r = mix(r, 58, 0.85); g = mix(g, 54, 0.85); b = mix(b, 52, 0.85); a *= 0.15; hh += t * 0.3; }
        }
      }
      const i = py * cw + px;
      B[i * 3] = r;
      B[i * 3 + 1] = g;
      B[i * 3 + 2] = b;
      if (A) A[i] = a;
      const q = i * 4;
      const hv = clamp01(hh) * 255;
      hd.data[q] = hd.data[q + 1] = hd.data[q + 2] = hv;
      hd.data[q + 3] = 255;
      if (gd) { gd.data[q] = glow[0]; gd.data[q + 1] = glow[1]; gd.data[q + 2] = glow[2]; gd.data[q + 3] = 255; }
    }
  }
  hgt.putImageData(hd, x0, y0);
  if (gd) glw.putImageData(gd, x0, y0);
  return { x0, y0, cw, ch, B, A };
}
/** A side's colour from its recipe in colour `tint` ([r, g, b], or null for a skin that takes none) into `col`. */
function colourSide(col, side, tint) {
  const img = col.createImageData(side.cw, side.ch);
  const px = img.data;
  const { B, A } = side;
  const [tr, tg, tb] = tint || [0, 0, 0];
  for (let i = 0, n = side.cw * side.ch; i < n; i++) {
    const a = A ? A[i] : 0;
    const q = i * 4;
    px[q] = B[i * 3] + a * tr;
    px[q + 1] = B[i * 3 + 1] + a * tg;
    px[q + 2] = B[i * 3 + 2] + a * tb;
    px[q + 3] = 255;
  }
  col.putImageData(img, side.x0, side.y0);
}

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
const ctx2d = (w, h) => cv(w, h).getContext('2d', { willReadFrequently: true });

/** (tests) how many surfaces were painted in full, and how many only coloured from a painting already made */
export const paintStats = { full: 0, coloured: 0 };
/**
 * Paintings already made (a shape in a skin at a size): their height and glow pictures, and how to colour them. A skin
 * that takes no colour keeps its one colour picture; one that does keeps its recipes a few seconds (the colours a town
 * asks for come together), then lets them go (they're big: four numbers a pixel).
 */
const paintings = new Map();
const KEEP_MS = 4000;
let sweepT = 0;
function sweep() {
  sweepT = 0;
  const now = performance.now();
  for (const [key, p] of paintings) if (p.tinted && now - p.at > KEEP_MS) paintings.delete(key);
  if ([...paintings.values()].some((p) => p.tinted)) sweepT = setTimeout(sweep, KEEP_MS);
}
/**
 * A painting: `sheets` [{ W, H, sides: [[w, h, side, offset, detail, x0, y0]] }] painted in `skin` (once per key), and
 * each sheet's colour in `pal`'s colour. Returns [{ color, height, glow }] per sheet.
 */
function painting(key, skin, pal, sheets, k) {
  const sk = SKINS[skin];
  let p = paintings.get(key);
  if (!p) {
    const painter = sk.make();
    p = {
      tinted: !!sk.tint,
      sheets: sheets.map(({ W, H, sides }) => {
        const hgt = ctx2d(W, H);
        const glw = sk.glow ? ctx2d(W, H) : null;
        const done = sides.map(([w, h, side, o, d, x0, y0]) => paintSide(painter, d, w, h, k, side, o, !!sk.tint, hgt, glw, x0, y0));
        return { W, H, sides: done, height: hgt.canvas, glow: glw?.canvas || null, color: null };
      }),
    };
    paintings.set(key, p);
    paintStats.full++;
  } else paintStats.coloured++;
  p.at = performance.now();
  const tint = sk.tint ? sk.tint(pal) : null;
  const res = p.sheets.map((sh) => {
    if (sh.color) return { color: sh.color, height: sh.height, glow: sh.glow };
    const col = ctx2d(sh.W, sh.H);
    for (const side of sh.sides) colourSide(col, side, tint);
    if (!tint) { sh.color = col.canvas; sh.sides = null; }   // (one colour picture for every colour: the recipe goes)
    return { color: col.canvas, height: sh.height, glow: sh.glow };
  });
  if (p.tinted && !sweepT) sweepT = setTimeout(sweep, KEEP_MS);
  return res;
}

/**
 * A box shape's surface in skin `skin`, laid out as pieces.js's atlas (`layout`: { W, H, face, end, cap } with each
 * region's `at` corner), `k` canvas px per Stapel px, in colour `colorIndex`. Its wear and grain come from `seedColor`'s
 * patch of the noise (the shape's own colour: a shape looks the same in every colour but its paint). Returns
 * { color, height, glow, roughness, metalness } (canvases) or null when the skin keeps Stapel's own picture.
 */
export function boxSurface(shape, skin, colorIndex, w, h, D, layout, k, seedColor = colorIndex) {
  const sk = SKINS[skin];
  if (!sk) return null;
  const pal = PALETTE[colorIndex] || PALETTE[0];
  const d = detailOf(shape);
  const r = rng(seedColor * 31 + shape.length * 7);
  const off = () => 20 + r() * 260;   // (each side its own patch of the noise)
  const sides = [[w, h, 'face', off(), d, ...layout.face.at], [D, h, 'end', off(), d, ...layout.end.at], [w, D, 'cap', off(), d, ...layout.cap.at]];
  const key = `box|${shape}|${skin}|${k}|${seedColor}|${w}x${h}x${D}`;
  const [s] = painting(key, skin, pal, [{ W: Math.ceil(layout.W), H: Math.ceil(layout.H), sides }], k);
  return { ...s, roughness: sk.roughness, metalness: sk.metalness };
}
/** The wedge: its face (texW x texH like Stapel's own) and one wall panel (D x D), in skin `skin`; or null. */
export function wedgeSurface(skin, colorIndex, geo, D, k) {
  const sk = SKINS[skin];
  if (!sk) return null;
  const pal = PALETTE[colorIndex] || PALETTE[0];
  const fw = Math.ceil(geo.texW * k);
  const fh = Math.ceil(geo.texH * k);
  const ww = Math.ceil((D + 2 * PAD) * k);
  const key = `wedge|${skin}|${k}|${geo.w}x${geo.h}x${D}`;
  const [face, wall] = painting(key, skin, pal, [
    { W: fw, H: fh, sides: [[geo.w, geo.h, 'face', 90, detailOf('wedge'), 0, 0]] },
    { W: ww, H: ww, sides: [[D, D, 'cap', 170, {}, 0, 0]] },
  ], k);
  return { face, wall, roughness: sk.roughness, metalness: sk.metalness };
}

/** A material from a painted surface (a colour, a height for the light to catch, a glow where it has one). */
const textures = new WeakMap();   // (a picture shared by several colours' materials is one texture: drawn up once)
export function surfaceMaterial(s, aniso = 4) {
  const tex = (c, srgb) => {
    const k = `${srgb ? 's' : 'l'}${aniso}`;
    let byKind = textures.get(c);
    if (!byKind) textures.set(c, (byKind = {}));
    if (byKind[k]) return byKind[k];
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    t.userData.shared = true;
    byKind[k] = t;
    return t;
  };
  const m = new THREE.MeshStandardMaterial({
    map: tex(s.color, true), bumpMap: tex(s.height, false), bumpScale: 2.2,
    roughness: s.roughness, metalness: s.metalness, envMapIntensity: s.metalness > 0.5 ? 1.6 : 0.9,
  });
  if (s.glow) { m.emissiveMap = tex(s.glow, true); m.emissive = new THREE.Color('#ffffff'); m.emissiveIntensity = 1.4; }
  return m;
}
