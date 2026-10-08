// Hats on emoji visitors (js/core/emojifit.js): the head is found in the glyph's own pixels, so a hat
// sits on it whichever emoji font the phone has (Apple, Google's Noto, Samsung...).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opaqueBox, headOf, accessoryPlace } from '../js/core/emojifit.js';

/** A w x h image with filled rectangles [x0, y0, x1, y1] (inclusive). */
function image(w, h, rects) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[(y * w + x) * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
}

test('the visible box of a drawing; nothing drawn is null', () => {
  assert.equal(opaqueBox(image(10, 10, [])), null);
  assert.deepEqual(opaqueBox(image(20, 20, [[3, 4, 12, 15]])), { l: 3, t: 4, r: 12, b: 15, w: 10, h: 12 });
});

test('the head is the biggest blob at the top: a tail curled up beside it does not pull the hat over', () => {
  // Noto-like monkey: head top-left (x 10-30), tail tip top-right (x 52-57), body below
  const monkey = image(80, 80, [[10, 0, 30, 20], [52, 2, 57, 9], [14, 21, 58, 70]]);
  const head = headOf(monkey);
  assert.ok(Math.abs(head.x - 20) < 0.6, `head x ${head.x}`);
  assert.equal(head.top, 0);
  assert.equal(head.w, 21);
  assert.ok(head.eyeY > head.top && head.eyeY < 21);
  // mirrored (the head right, the tail left)
  const mirrored = image(80, 80, [[49, 0, 69, 20], [22, 2, 27, 9], [21, 21, 65, 70]]);
  assert.ok(Math.abs(headOf(mirrored).x - 59) < 0.6);
  // a person: one head in the middle
  const person = image(60, 90, [[22, 4, 38, 24], [10, 25, 50, 89]]);
  assert.ok(Math.abs(headOf(person).x - 30) < 0.6);
  assert.equal(headOf(image(5, 5, [])), null);
});

test('a hat sits on the head, sunglasses on the eyes, both sized to the head', () => {
  const head = { x: 20, top: 0, w: 20, eyeY: 10 };
  const cap = accessoryPlace('pet', head, { w: 40, h: 30 });
  assert.equal(cap.scale, 0.5);
  assert.equal(cap.cx, 20);
  assert.ok(cap.cy + (30 * cap.scale) / 2 > head.top, 'the brim comes down onto the head');
  assert.ok(cap.cy < head.top + head.w * 0.25, 'but the hat stays on top');
  const glasses = accessoryPlace('sonbril', head, { w: 38, h: 14 });
  assert.equal(glasses.cy, 10);
  assert.ok(Math.abs(glasses.scale * 38 - 19) < 1e-9);
  assert.ok(accessoryPlace('kroon', head, { w: 30, h: 24 }).scale * 30 < 20, 'a crown is narrower than the head');
  assert.equal(accessoryPlace('gewoon', head, { w: 10, h: 10 }), null);
  assert.equal(accessoryPlace('pet', null, { w: 10, h: 10 }), null);
});
