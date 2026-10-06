// The island billboard: a world-space sign on the rocks right of the base for the
// premium sponsor (label "ADVERTENSIE", name, tagline, web address). Without a
// premium sponsor it invites one (sales on) or shows the Stapel logo (sales off).
// Drawn once into a canvas texture; no physics body. It stands behind the island
// rocks (they hide its feet) and right of the base, clear of the drop column.
import { DEPTH, FONT, GAME_W, LAYOUT, PALETTE, WATER } from '../config.js';
import { S } from '../core/strings.js';
import { hostnameOf } from '../core/sponsors.js';

const RES = 2;                 // texture px per world px (crisp on phones)
const W = 176;                 // panel width (world px)
const H = 128;                 // panel height
const LIP = 6;                 // pressed-card lip under the panel
const POST = 96;               // post length below the panel (the feet end in the water)
const M = 4;                   // texture margin
const MT = 14;                 // top margin: room for the "ADVERTENSIE" tab
const TW = W + 2 * M;
const TH = MT + H + LIP + POST;
const LEFT = GAME_W / 2 + LAYOUT.baseWidth / 2 + 18;   // panel's left edge: 18 px clear of the base
/** World x where the board starts (labels near the base keep left of it). */
export const BILLBOARD_LEFT = LEFT;
const FOOT_Y = 52;             // world y of the post feet (below the resting sea level)
const FEET_UNDER = FOOT_Y - (LAYOUT.baseTopY + WATER.startOffsetPx);   // how deep the feet stand in the sea
const REVEAL_MAX_SCALE = 1.8;

const INK = '#1d2b45';
const INK_SOFT = '#3c4d6e';
const LINK = '#2563b0';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Words wrapped into at most `maxLines` lines of `width` at the largest size in [min, max]. */
function fitLines(ctx, text, width, max, min, maxLines, weight = 'bold') {
  const words = String(text).split(/\s+/).filter(Boolean);
  for (let px = max; px >= min; px--) {
    ctx.font = `${weight} ${px}px ${FONT}`;
    const lines = [];
    let cur = '';
    let ok = true;
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(next).width <= width) cur = next;
      else if (!cur) { ok = false; break; } else {
        lines.push(cur);
        cur = w;
        if (ctx.measureText(cur).width > width) { ok = false; break; }
      }
    }
    if (cur) lines.push(cur);
    if (ok && lines.length <= maxLines) return { px, lines };
  }
  // last resort: one line at the minimum size, squeezed to fit
  ctx.font = `${weight} ${min}px ${FONT}`;
  const line = words.join(' ');
  return { px: min, lines: [line], squeeze: Math.max(0.55, width / Math.max(1, ctx.measureText(line).width)) };
}

function drawLines(ctx, block, x, y, color, weight = 'bold') {
  ctx.font = `${weight} ${block.px}px ${FONT}`;
  ctx.fillStyle = color;
  const lh = block.px * 1.12;
  block.lines.forEach((line, i) => {
    ctx.save();
    ctx.translate(x, y + i * lh + lh / 2);
    if (block.squeeze) ctx.scale(block.squeeze, 1);
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });
  return block.lines.length * lh;
}

function drawPosts(ctx) {
  for (const px of [W * 0.24, W * 0.76]) {
    const x = M + px - 6;
    const y = MT + H;
    ctx.fillStyle = '#7a5236';
    ctx.fillRect(x, y, 12, LIP + POST);
    ctx.fillStyle = '#9b6c48';
    ctx.fillRect(x, y, 5, LIP + POST);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y, 12, LIP + 6);   // shade under the panel
  }
}

function drawPanel(ctx, dashed) {
  const x = M;
  const y = MT;
  // lip (the chunky pressed-card edge the menu buttons use)
  roundRect(ctx, x, y + LIP, W, H, 16);
  ctx.fillStyle = '#c9d7ea';
  ctx.fill();
  roundRect(ctx, x, y, W, H, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (dashed) {
    ctx.save();
    roundRect(ctx, x + 8, y + 8, W - 16, H - 16, 10);
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#86b9f7';
    ctx.stroke();
    ctx.restore();
  }
}

/** Small yellow "ADVERTENSIE" tab across the top edge (ads must say they are ads). */
function drawAdTab(ctx) {
  const text = S.adLabel.toUpperCase();
  ctx.font = `900 12px ${FONT}`;
  const spaced = 'letterSpacing' in ctx;
  if (spaced) ctx.letterSpacing = '1px';
  const tw = ctx.measureText(text).width + 18;
  const x = M + W / 2 - tw / 2;
  const y = MT - 2;
  roundRect(ctx, x, y - 10, tw, 22, 11);
  ctx.fillStyle = '#f7c948';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, M + W / 2 + (spaced ? 0.5 : 0), y + 1.5);
  if (spaced) ctx.letterSpacing = '0px';
}

/** "STAPEL" in the logo's coloured letter blocks. */
function drawLogo(ctx, cx, cy) {
  const letters = [...S.title.toUpperCase()];
  const size = 25;
  const gap = 2;
  const total = letters.length * size + (letters.length - 1) * gap;
  const colors = [0, 1, 2, 3, 4, 6].map((i) => PALETTE[i % PALETTE.length]);
  letters.forEach((ch, i) => {
    const x = cx - total / 2 + i * (size + gap);
    const y = cy - size / 2 + (i % 2 ? 2 : -2);
    const pal = colors[i % colors.length];
    roundRect(ctx, x, y + 3, size, size, 6);
    ctx.fillStyle = hex(pal.dark);
    ctx.fill();
    roundRect(ctx, x, y, size, size, 6);
    ctx.fillStyle = hex(pal.fill);
    ctx.fill();
    ctx.font = `900 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(29,43,69,0.45)';
    ctx.strokeText(ch, x + size / 2, y + size / 2 + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ch, x + size / 2, y + size / 2 + 1);
  });
}

/** What the board says: the premium sponsor, an invitation (sales on) or the game's own sign. */
export function billboardContent(premium, salesOn) {
  if (premium && premium.name) {
    return {
      kind: 'sponsor',
      name: String(premium.name),
      tagline: String(premium.tagline || ''),
      host: hostnameOf(premium.url || ''),
    };
  }
  if (salesOn) return { kind: 'free', name: S.boardFree, tagline: S.boardFreeSub, host: '' };
  return { kind: 'house', name: S.title, tagline: S.tagline, host: '' };
}

function drawBoard(ctx, c) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawPosts(ctx);
  drawPanel(ctx, c.kind === 'free');
  const cx = M + W / 2;
  const inner = W - 22;

  if (c.kind === 'house') {
    drawLogo(ctx, cx, MT + 44);
    const tag = fitLines(ctx, c.tagline, inner, 17, 11, 2);
    drawLines(ctx, tag, cx, MT + 70, INK, 'bold');
    return;
  }

  drawAdTab(ctx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = MT + 14;
  const bottom = MT + H - 8;
  const gap = 5;
  const height = (b) => (b ? b.lines.length * b.px * 1.12 : 0);
  // shrink everything together until name, tagline and address all fit the panel
  let name;
  let tag;
  let host;
  let total = 0;
  for (let k = 1; k >= 0.5; k -= 0.05) {
    name = fitLines(ctx, c.name, inner, Math.round((c.kind === 'free' ? 24 : 30) * k), 12, 2, '900');
    tag = c.tagline ? fitLines(ctx, c.tagline, inner, Math.round(16 * k), 10, 2) : null;
    host = c.host ? fitLines(ctx, c.host, inner, Math.round(14 * k), 10, 1) : null;
    total = height(name) + (tag ? gap + height(tag) : 0) + (host ? gap + height(host) : 0);
    if (total <= bottom - top) break;
  }
  let y = top + Math.max(0, (bottom - top - total) / 2);
  y += drawLines(ctx, name, cx, y, INK, '900');
  if (tag) y += gap + drawLines(ctx, tag, cx, y + gap, INK_SOFT, 'bold');
  if (host) drawLines(ctx, host, cx, y + gap, LINK, 'bold');
}

/**
 * Builds the billboard. `premium` is the day's premium sponsor (or null);
 * `salesOn` whether sponsorships are on sale (empty-state wording).
 */
export function createBillboard(scene, { premium = null, salesOn = false } = {}) {
  const content = billboardContent(premium, salesOn);
  const key = `bb_${hash(JSON.stringify(content))}`;
  const textures = scene.textures;
  // only one board texture at a time (the sponsor rotates daily)
  for (const k of textures.getTextureKeys()) if (k.startsWith('bb_') && k !== key) textures.remove(k);
  if (!textures.exists(key)) {
    const tex = textures.createCanvas(key, TW * RES, TH * RES);
    if (tex) {
      const ctx = tex.getContext();
      ctx.scale(RES, RES);
      drawBoard(ctx, content);
      tex.refresh();
    }
  }
  // origin at the left foot: growing for the reveal keeps it clear of the base
  const image = scene.add.image(LEFT - M, FOOT_Y, key)
    .setOrigin(0, 1)
    .setScale(1 / RES)
    .setDepth(DEPTH.island - 0.5);   // behind the rocks, which hide its feet
  let tween = null;

  return {
    image,
    content,
    /** World-space bounds of the panel (tests / layout checks). */
    bounds() {
      const s = image.scaleX * RES;
      const left = image.x + M * s;
      const top = image.y - TH * s + MT * s;
      return { left, top, right: left + W * s, bottom: top + (H + LIP) * s };
    },
    /**
     * A flood floats the board up with the water (feet always just under the surface),
     * so the sponsor stays in sight in the reveal instead of sinking. `level` is the
     * water's visual surface y, `tMs` a clock for a slow bob.
     */
    float(level, tMs = 0) {
      if (!Number.isFinite(level)) return;
      const lift = Math.min(0, level + FEET_UNDER - FOOT_Y);
      const bob = lift < -4 ? Math.sin(tMs / 650) * 1.5 : 0;
      const y = FOOT_Y + lift + bob;
      if (Math.abs(image.y - y) > 0.05) image.y = y;
    },
    /** Grow a little for the zoomed-out reveal, so the sponsor stays readable in the screenshot. */
    reveal(zoom, duration = 0) {
      const s = Math.max(1, Math.min(REVEAL_MAX_SCALE, 0.5 / Math.max(0.05, zoom)));
      if (tween) tween.stop();
      if (!(duration > 0)) image.setScale(s / RES);
      else tween = scene.tweens.add({ targets: image, scaleX: s / RES, scaleY: s / RES, duration, ease: 'Sine.easeInOut' });
    },
    destroy() {
      if (tween) tween.stop();
      tween = null;
      image.destroy();
    },
  };
}
