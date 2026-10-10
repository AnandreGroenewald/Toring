// Emoji as images (1.12.1). A big colour emoji glyph is slow to draw (a canvas, the glyph, an upload to the
// graphics chip), and several were drawn the very moment something happened (a visitor arriving, a fish, a
// paraglider, an emoji reaction): a stall in that frame, every time. Now each emoji at each size and font is
// drawn once a session into a texture, and from then on it is an image like any other. Phaser's textures belong
// to the game, so every scene shares them.

/** The texture key of `emoji` drawn at `px` in `font` (drawn now if this is the first time). */
export function emojiTexture(scene, emoji, px, { font, padding: pad = null } = {}) {
  const str = String(emoji);
  // (Android's emoji reach below the letters' line that sizes a text, Apple's past their advance: room there
  // unless the caller says)
  const padding = pad || { x: Math.ceil(px * 0.05), y: Math.ceil(px * 0.12) };
  const tag = (font || '').length.toString(36) + (padding ? `p${padding.x}_${padding.y}` : '');
  const key = `emo_${px}_${tag}_${[...str].map((ch) => ch.codePointAt(0).toString(16)).join('_')}`;
  if (scene.textures.exists(key)) return key;
  const t = scene.add.text(0, 0, str, { fontFamily: font, fontSize: `${px}px`, resolution: 1, ...(padding ? { padding } : {}) });
  const tex = scene.textures.createCanvas(key, Math.max(1, t.canvas.width), Math.max(1, t.canvas.height));
  if (tex) {
    tex.context.drawImage(t.canvas, 0, 0);
    tex.refresh();
  }
  t.destroy();
  return key;
}

/** An image of `emoji` (centred). */
export function emojiImage(scene, x, y, emoji, px, opts = {}) {
  return scene.add.image(x, y, emojiTexture(scene, emoji, px, opts)).setOrigin(0.5);
}

/** Draw these ahead of need, one every `gapMs` (quiet moments: the first seconds of a game). */
export function warmEmoji(scene, list, gapMs = 120) {
  list.forEach(([emoji, px, opts], k) => {
    scene.time.delayedCall(400 + k * gapMs, () => {
      if (scene.sys && scene.sys.isActive()) emojiTexture(scene, emoji, px, opts);
    });
  });
}
