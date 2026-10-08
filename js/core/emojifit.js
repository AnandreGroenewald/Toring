// Where a hat or sunglasses go on an emoji visitor (🐒, 🦹), from the glyph's own pixels. Every phone
// draws emoji differently (Apple's monkey, Google's Noto monkey with its head left and tail curled up
// right, Samsung's...), so fixed offsets put a hat beside the head on some phones. These pure functions
// read an image's alpha channel ({ data, width, height }, like ImageData) and find the head: the biggest
// blob in the top band of the glyph (a tail tip or a raised hand is smaller). Used by the game
// (js/game/visitors.js) and the shop's preview (js/ui/dom.js).

const ALPHA_MIN = 40;
const HEAD_BAND = 0.22;     // the head is looked for in the top 22 % of the glyph (deeper, the body joins head and tail)
const HATS = { pet: 1.0, hoed: 0.95, kroon: 0.8 };   // hat width as a share of the head's width
const GLASSES_W = 0.95;     // sunglasses width as a share of the head's width
const HAT_SINK = 0.22;      // a hat's brim sits this share of the head's width below the head's top
const EYES_AT = 0.5;        // the eyes are this share of the head's width below its top

/** The visible box of an image (alpha >= ALPHA_MIN), or null when nothing is drawn. */
export function opaqueBox(img) {
  const { data, width: w, height: h } = img;
  let l = w;
  let r = -1;
  let t = h;
  let b = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= ALPHA_MIN) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
  }
  return r < 0 ? null : { l, t, r, b, w: r - l + 1, h: b - t + 1 };
}

/**
 * The head of a visitor glyph: { x (centre), top, w (width), eyeY } in the image's pixels, or null.
 * The top band is split into runs of columns that hold something; the run with the most pixels is the head.
 */
export function headOf(img) {
  const box = opaqueBox(img);
  if (!box) return null;
  const { data, width: w } = img;
  const bandBottom = box.t + Math.max(1, Math.round(box.h * HEAD_BAND));
  const col = new Int32Array(box.r + 2);
  for (let y = box.t; y <= bandBottom; y++) {
    for (let x = box.l; x <= box.r; x++) if (data[(y * w + x) * 4 + 3] >= ALPHA_MIN) col[x]++;
  }
  let best = null;
  let run = null;
  for (let x = box.l; x <= box.r + 1; x++) {
    const v = x <= box.r ? col[x] : 0;
    if (v > 0) {
      if (!run) run = { a: x, z: x, area: 0, sx: 0 };
      run.z = x;
      run.area += v;
      run.sx += x * v;
    } else if (run) {
      if (!best || run.area > best.area) best = run;
      run = null;
    }
  }
  if (!best) return null;
  let top = box.t;
  for (let y = box.t; y <= bandBottom; y++) {
    let hit = false;
    for (let x = best.a; x <= best.z && !hit; x++) hit = data[(y * w + x) * 4 + 3] >= ALPHA_MIN;
    if (hit) {
      top = y;
      break;
    }
  }
  const headW = best.z - best.a + 1;
  return { x: best.sx / best.area, top, w: headW, eyeY: top + headW * EYES_AT };
}

/**
 * Where to draw an accessory, given the visitor's head (headOf) and the accessory's own visible box
 * (opaqueBox of its drawing): { scale, cx, cy }, the centre the accessory's VISIBLE box should get,
 * in the visitor image's pixels, and the scale to draw the accessory at. Null for an unknown style.
 */
export function accessoryPlace(style, head, accBox) {
  if (!head || !accBox) return null;
  if (style === 'sonbril') {
    const scale = (head.w * GLASSES_W) / accBox.w;
    return { scale, cx: head.x, cy: head.eyeY };
  }
  const share = HATS[style];
  if (!share) return null;
  const scale = (head.w * share) / accBox.w;
  const brim = head.top + head.w * HAT_SINK;
  return { scale, cx: head.x, cy: brim - (accBox.h * scale) / 2 };
}
