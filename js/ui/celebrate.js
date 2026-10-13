// Stapel — the win celebrations (1.15, the owner 12 Oct ~19:10: "the celebration icons is very meh, can you please make
// it so that people want to buy it with the coins ... it must be somthing a 22 year old looks at and thinks I need this").
// A celebration is a ~3.6 s canvas show over the screen (the Winkel's preview, and a live match's end: the winner sees
// their own, the loser the winner's one with "<name> vier!"), and each has its own shop tile art drawn from the same
// motifs (drawCelebrationIcon). Plain canvas 2D, nothing to download: glow dots, twinkles, coins and emoji are drawn once
// into small sprite canvases and stamped with drawImage; the particle pools are made when a show starts (the hot loops
// allocate nothing), at most ~250 particles, and a 3x phone screen draws at 2x (a 390 x 844 show is 780 x 1688 pixels).

export const CELEBRATION_IDS = Object.freeze(['konfetti', 'vuurwerk', 'vuvuzela', 'braai', 'skrum', 'weerlig', 'goudreen', 'laser', 'sterrestof']);

const DUR = 3.6;          // seconds a show lasts
const OUT = 0.55;         // its last part fades out
const MAX_DPR = 2;        // the show's canvas: 3x screens draw at 2x (a third fewer pixels to fill, the same look)
const ICON_DPR = 3;       // the shop tiles are small: full sharpness
const TAU = Math.PI * 2;
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// Each show's colours: `accent` rings the caption pill; `tint` darkens the screen behind the light (night shows make
// additive colours glow; null keeps the screen as it is); `flash` is the layer a bang lights up.
const LOOK = {
  konfetti: { accent: '#ff4f9a', tint: null, flash: 'radial-gradient(ellipse at 50% 100%, rgba(255,250,230,0.85), rgba(255,250,230,0) 70%)' },
  vuurwerk: { accent: '#ffcf4a', tint: 'radial-gradient(ellipse at 50% 30%, rgba(34,24,86,0.62), rgba(4,5,22,0.9))', flash: 'rgba(255,236,200,0.55)' },
  // (1.15.4) the id stays 'vuvuzela' (whoever owns it keeps it); it is the Protea now
  vuvuzela: { accent: '#f2709a', tint: 'radial-gradient(ellipse at 50% 90%, rgba(255,170,200,0.5), rgba(120,20,70,0.25) 55%, rgba(40,6,24,0.5))', flash: 'radial-gradient(ellipse at 50% 80%, rgba(255,226,236,0.85), rgba(255,226,236,0) 70%)' },
  braai: { accent: '#ff8a2a', tint: 'linear-gradient(to top, rgba(255,120,30,0.5), rgba(130,40,30,0.4) 38%, rgba(36,14,44,0.62))', flash: 'radial-gradient(ellipse at 50% 85%, rgba(255,190,90,0.8), rgba(255,190,90,0) 70%)' },
  skrum: { accent: '#ffc928', tint: 'radial-gradient(circle at 50% 42%, rgba(18,120,62,0.34), rgba(0,46,24,0.72))', flash: 'radial-gradient(circle at 50% 42%, rgba(255,246,200,0.9), rgba(255,246,200,0) 65%)' },
  weerlig: { accent: '#6fd0ff', tint: 'radial-gradient(ellipse at 50% 18%, rgba(40,62,150,0.6), rgba(3,6,24,0.92))', flash: 'linear-gradient(to bottom, rgba(225,240,255,0.95), rgba(170,205,255,0.55))' },
  goudreen: { accent: '#ffd23f', tint: 'radial-gradient(ellipse 90% 45% at 50% 0%, rgba(255,226,120,0.7), rgba(255,214,90,0) 100%), radial-gradient(ellipse at 50% 34%, rgba(255,184,40,0.42), rgba(96,48,0,0.82))', flash: 'radial-gradient(ellipse at 50% 30%, rgba(255,232,150,0.9), rgba(255,232,150,0) 70%)' },
  laser: { accent: '#ff3bd8', tint: 'radial-gradient(ellipse at 50% 100%, rgba(70,0,110,0.6), rgba(6,0,22,0.92))', flash: 'radial-gradient(ellipse at 50% 80%, rgba(255,140,240,0.55), rgba(90,230,255,0.18) 60%, rgba(0,0,0,0))' },
  sterrestof: { accent: '#c18bff', tint: 'radial-gradient(ellipse at 50% 42%, rgba(70,26,130,0.58), rgba(7,3,26,0.94))', flash: 'radial-gradient(circle at 50% 42%, rgba(255,246,220,0.95), rgba(200,160,255,0.35) 45%, rgba(0,0,0,0) 80%)' },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const easeOutBack = (t) => { const u = t - 1; return 1 + 2.70158 * u * u * u + 1.70158 * u * u; };
const smooth = (t) => t * t * (3 - 2 * t);
const rand = (a, b) => a + Math.random() * (b - a);

/** '#rrggbb' → 'rgba(r,g,b,a)'. */
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A tiny seeded random (mulberry32): the shop tiles look the same every time. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starPath(x, cx, cy, R, r, n = 5, rot = -Math.PI / 2) {
  x.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const d = i % 2 ? r : R;
    if (i) x.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    else x.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  x.closePath();
}

function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}

// ---------------------------------------------------------------------------
// Sprites: drawn once (per document), stamped many times
// ---------------------------------------------------------------------------
const SPRITES = new Map();
function sprite(doc, key, w, h, draw, cpu = false) {
  let c = SPRITES.get(key);
  if (!c || c.ownerDocument !== doc) {
    c = doc.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(cpu ? c.getContext('2d', { willReadFrequently: true }) : c.getContext('2d'), w, h);
    SPRITES.set(key, c);
  }
  return c;
}

const GS = 64;   // a glow's sprite size: soft, so it scales up without showing pixels
/** A glowing dot: a white-hot centre in `hex`, fading out. */
function glowSprite(doc, hex) {
  return sprite(doc, `g${hex}`, GS, GS, (x) => {
    const g = x.createRadialGradient(GS / 2, GS / 2, 0, GS / 2, GS / 2, GS / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.13, rgba(hex, 1));
    g.addColorStop(0.38, rgba(hex, 0.36));
    g.addColorStop(1, rgba(hex, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, GS, GS);
  });
}
/** A soft round blob (haze, smoke, a wide glow). */
function softSprite(doc, hex, a = 0.6) {
  return sprite(doc, `s${hex}${a}`, GS, GS, (x) => {
    const g = x.createRadialGradient(GS / 2, GS / 2, 0, GS / 2, GS / 2, GS / 2);
    g.addColorStop(0, rgba(hex, a));
    g.addColorStop(0.5, rgba(hex, a * 0.42));
    g.addColorStop(1, rgba(hex, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, GS, GS);
  });
}
/** A four-pointed twinkle with a little halo. */
function sparkSprite(doc, hex) {
  const N = 96;
  const c = N / 2;
  return sprite(doc, `k${hex}`, N, N, (x) => {
    const g = x.createRadialGradient(c, c, 0, c, c, c * 0.4);
    g.addColorStop(0, rgba(hex, 0.7));
    g.addColorStop(1, rgba(hex, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, N, N);
    const k = N * 0.05;
    x.beginPath();
    x.moveTo(c, 1);
    x.quadraticCurveTo(c + k, c - k, N - 1, c);
    x.quadraticCurveTo(c + k, c + k, c, N - 1);
    x.quadraticCurveTo(c - k, c + k, 1, c);
    x.quadraticCurveTo(c - k, c - k, c, 1);
    x.closePath();
    const w = x.createRadialGradient(c, c, 0, c, c, c);
    w.addColorStop(0, '#ffffff');
    w.addColorStop(0.3, rgba(hex, 1));
    w.addColorStop(1, rgba(hex, 0.05));
    x.fillStyle = w;
    x.fill();
  });
}
/** An emoji at `px` device pixels (this phone's own emoji font). */
function emojiSprite(doc, ch, px) {
  return sprite(doc, `e${ch}${px}`, px, px, (x) => {
    x.font = `${Math.round(px * 0.8)}px ${EMOJI_FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(ch, px / 2, px / 2 + px * 0.04);
  });
}
/**
 * (1.15, the owner: "This ball does not look like a rugby ball, maybe a very old one") a modern rugby ball drawn here (the
 * 🏉 emoji is a brown laced leather ball on some phones): cream, Springbok green-and-gold bands near the ends, a seam, laces.
 */
function rugbySprite(doc, px) {
  return sprite(doc, `rugby${px}`, px, px, (x) => {
    const c = px / 2;
    const rx = px * 0.42;
    const ry = px * 0.26;
    x.translate(c, c);
    x.rotate(-0.56);
    x.beginPath();
    x.ellipse(0, 0, rx, ry, 0, 0, TAU);
    const g = x.createRadialGradient(-rx * 0.3, -ry * 0.45, ry * 0.1, 0, 0, rx);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#f4efe2');
    g.addColorStop(1, '#cfc6b0');
    x.fillStyle = g;
    x.fill();
    x.save();
    x.clip();
    for (const [x0, w, col] of [[-rx * 0.66, rx * 0.16, '#157a3f'], [-rx * 0.5, rx * 0.09, '#f7c948'], [rx * 0.41, rx * 0.09, '#f7c948'], [rx * 0.5, rx * 0.16, '#157a3f']]) {
      x.fillStyle = col;
      x.fillRect(x0, -ry, w, ry * 2);
    }
    x.restore();
    x.strokeStyle = 'rgba(120,105,80,0.55)';
    x.lineWidth = px * 0.012;
    x.beginPath();
    x.moveTo(-rx * 0.95, 0);
    x.quadraticCurveTo(0, -ry * 0.18, rx * 0.95, 0);
    x.stroke();
    x.strokeStyle = '#8a7a58';
    x.lineWidth = px * 0.016;
    x.lineCap = 'round';
    for (let k = -2; k <= 2; k++) {
      x.beginPath();
      x.moveTo(k * rx * 0.09, -ry * 0.16);
      x.lineTo(k * rx * 0.09, ry * 0.05);
      x.stroke();
    }
    x.beginPath();
    x.ellipse(0, 0, rx, ry, 0, 0, TAU);
    x.lineWidth = px * 0.02;
    x.strokeStyle = '#3b3424';
    x.stroke();
  });
}
/** A gold coin's face (`D` device pixels): a rim, a bevel, an embossed star and a shine. */
function coinFace(doc, D) {
  return sprite(doc, `cf${D}`, D, D, (x) => {
    const r = D / 2;
    const g = x.createRadialGradient(r * 0.62, r * 0.55, r * 0.05, r, r, r);
    g.addColorStop(0, '#fff7c9');
    g.addColorStop(0.32, '#ffd84a');
    g.addColorStop(0.78, '#eaa514');
    g.addColorStop(1, '#b67606');
    x.fillStyle = g;
    x.beginPath();
    x.arc(r, r, r * 0.97, 0, TAU);
    x.fill();
    x.lineWidth = r * 0.1;
    x.strokeStyle = '#c4850a';
    x.beginPath();
    x.arc(r, r, r * 0.84, 0, TAU);
    x.stroke();
    x.lineWidth = r * 0.045;
    x.strokeStyle = 'rgba(255,246,196,0.95)';
    x.beginPath();
    x.arc(r, r, r * 0.76, 0, TAU);
    x.stroke();
    starPath(x, r + r * 0.04, r + r * 0.06, r * 0.44, r * 0.19);
    x.fillStyle = 'rgba(128,74,0,0.6)';
    x.fill();
    starPath(x, r, r, r * 0.44, r * 0.19);
    const s = x.createLinearGradient(0, r * 0.55, 0, r * 1.45);
    s.addColorStop(0, '#fff6c2');
    s.addColorStop(1, '#f0b021');
    x.fillStyle = s;
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.42)';
    x.beginPath();
    x.ellipse(r * 0.68, r * 0.5, r * 0.42, r * 0.15, -0.65, 0, TAU);
    x.fill();
  });
}
/** A coin's edge (drawn just behind its face, a little to the side, so a turning coin has a thickness). */
function coinEdge(doc, D) {
  return sprite(doc, `ce${D}`, D, D, (x) => {
    const r = D / 2;
    const g = x.createLinearGradient(0, 0, D, 0);
    g.addColorStop(0, '#8c5a04');
    g.addColorStop(0.5, '#d89a18');
    g.addColorStop(1, '#7c4e02');
    x.fillStyle = g;
    x.beginPath();
    x.arc(r, r, r * 0.97, 0, TAU);
    x.fill();
  });
}
/** The legendary's big star: gold, a white-hot heart, soft round points. */
function bigStar(doc, D) {
  return sprite(doc, `bs${D}`, D, D, (x) => {
    const c = D / 2;
    const h = x.createRadialGradient(c, c, 0, c, c, c);
    h.addColorStop(0, 'rgba(255,240,200,0.9)');
    h.addColorStop(0.35, 'rgba(255,200,90,0.35)');
    h.addColorStop(1, 'rgba(255,170,60,0)');
    x.fillStyle = h;
    x.fillRect(0, 0, D, D);
    starPath(x, c, c, c * 0.6, c * 0.26);
    const g = x.createRadialGradient(c, c * 0.92, 0, c, c, c * 0.62);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, '#fff2b0');
    g.addColorStop(0.7, '#ffcc3a');
    g.addColorStop(1, '#f39a12');
    x.fillStyle = g;
    x.lineJoin = 'round';
    x.lineWidth = c * 0.06;
    x.strokeStyle = '#ffd860';
    x.fill();
    x.stroke();
    starPath(x, c, c, c * 0.6, c * 0.26);
    x.lineWidth = c * 0.025;
    x.strokeStyle = 'rgba(255,255,255,0.85)';
    x.stroke();
  });
}

// ---------------------------------------------------------------------------
// Particle kits shared by the shows
// ---------------------------------------------------------------------------

/**
 * Paper confetti: squares, strips and dots that tumble (a 2D spin plus a flip, the back a darker shade), burst out
 * fast, are braked by the air and then flutter down at their own slow speed.
 */
function confetti(env, n, palette) {
  const { W, H, s, dpr } = env;
  const P = [];
  for (let i = 0; i < n; i++) {
    P.push({ on: false, wait: 0, x: 0, y: 0, vx: 0, vy: 0, fall: 0, term: 0, k: 0, a: 0, va: 0, f: 0, vf: 0, ph: 0, swf: 0, sw: 0, w: 0, h: 0, front: '', back: '', round: false });
  }
  let next = 0;
  return {
    fire(count, x, y, ang, spread, vMin, vMax, stagger = 0) {
      for (let i = 0; i < count; i++) {
        const p = P[next];
        next = (next + 1) % n;
        const a = ang + (Math.random() * 2 - 1) * spread;
        const v = rand(vMin, vMax);
        p.on = true;
        p.wait = Math.random() * stagger;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(a) * v;
        p.vy = Math.sin(a) * v;
        p.fall = 0;
        p.term = rand(70, 150) * s;
        p.k = rand(2.3, 3.3);
        p.a = Math.random() * TAU;
        p.va = rand(-9, 9);
        p.f = Math.random() * TAU;
        p.vf = rand(5, 13);
        p.ph = Math.random() * TAU;
        p.swf = rand(2, 4.5);
        p.sw = rand(20, 60) * s;
        const c = palette[(Math.random() * palette.length) | 0];
        p.front = c[0];
        p.back = c[1];
        const kind = Math.random();
        p.round = kind > 0.88;
        if (kind < 0.6) { p.w = rand(9, 14) * s; p.h = rand(5.5, 8) * s; }        // paper squares
        else if (kind < 0.88) { p.w = rand(3.4, 4.8) * s; p.h = rand(14, 21) * s; }   // strips
        else { p.w = rand(6.5, 9) * s; p.h = p.w; }                             // dots
      }
    },
    step(ctx, dt) {
      const ease = Math.min(1, 2.2 * dt);
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (!p.on) continue;
        if (p.wait > 0) { p.wait -= dt; continue; }
        const d = Math.exp(-p.k * dt);
        p.vx *= d;
        p.vy *= d;
        p.fall += (p.term - p.fall) * ease;
        p.ph += p.swf * dt;
        p.x += (p.vx + Math.sin(p.ph) * p.sw) * dt;
        p.y += (p.vy + p.fall) * dt;
        p.a += p.va * dt;
        p.f += p.vf * dt;
        if (p.y > H + 40 && p.vy + p.fall > 0) { p.on = false; continue; }
        if (p.x < -40 || p.x > W + 40) continue;
        const sy = Math.cos(p.f);
        const ca = Math.cos(p.a) * dpr;
        const sa = Math.sin(p.a) * dpr;
        ctx.setTransform(ca, sa, -sa * sy, ca * sy, p.x * dpr, p.y * dpr);
        ctx.fillStyle = sy > 0 ? p.front : p.back;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, TAU);
          ctx.fill();
        } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
  };
}

/**
 * Party streamers: a head flies out, curls (a sideways push that swings back and forth) and drifts down, trailing a
 * fixed length of ribbon (a point is kept every SEG px) that twists (its width swells and pinches along the length).
 */
function ribbons(env, n, colors, width = 9) {
  const { W, H, s } = env;
  const HN = 13;
  const SEG = 8 * s;
  const R = [];
  for (let i = 0; i < n; i++) R.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, k: 0, fall: 0, term: 0, ph: 0, cf: 0, ca: 0, tw: 0, tws: 0, col: '', w: 0, hist: new Float32Array(HN * 2), hn: 0, hi: 0 });
  const pts = new Float32Array((HN + 1) * 2);   // one ribbon's points, head first (reused)
  let next = 0;
  return {
    fire(count, x, y, ang, spread, vMin, vMax) {
      for (let i = 0; i < count; i++) {
        const q = R[next];
        next = (next + 1) % n;
        const a = ang + (Math.random() * 2 - 1) * spread;
        const v = rand(vMin, vMax);
        q.on = true;
        q.x = x;
        q.y = y;
        q.vx = Math.cos(a) * v;
        q.vy = Math.sin(a) * v;
        q.k = rand(2.1, 2.9);
        q.fall = 0;
        q.term = rand(55, 95) * s;
        q.ph = Math.random() * TAU;
        q.cf = rand(4.5, 8);
        q.ca = rand(500, 900) * s;
        q.tw = Math.random() * TAU;
        q.tws = rand(5, 9);
        q.col = colors[(Math.random() * colors.length) | 0];
        q.w = rand(0.8, 1.2) * width * s;
        q.hn = 1;
        q.hi = 0;
        q.hist[0] = x;
        q.hist[1] = y;
      }
    },
    step(ctx, dt) {
      const ease = Math.min(1, 2 * dt);
      for (let i = 0; i < n; i++) {
        const q = R[i];
        if (!q.on) continue;
        const d = Math.exp(-q.k * dt);
        q.vx *= d;
        q.vy *= d;
        q.fall += (q.term - q.fall) * ease;
        q.ph += q.cf * dt;
        q.tw += q.tws * dt;
        const sp = Math.hypot(q.vx, q.vy) + 1;
        const c = Math.sin(q.ph) * q.ca * dt;
        const vx = q.vx;
        q.vx += (-q.vy / sp) * c;
        q.vy += (vx / sp) * c;
        q.x += (q.vx + Math.sin(q.ph * 0.5) * 28 * s) * dt;
        q.y += (q.vy + q.fall) * dt;
        if (Math.hypot(q.x - q.hist[q.hi * 2], q.y - q.hist[q.hi * 2 + 1]) >= SEG) {
          q.hi = (q.hi + 1) % HN;
          q.hist[q.hi * 2] = q.x;
          q.hist[q.hi * 2 + 1] = q.y;
          if (q.hn < HN) q.hn++;
        }
        // the points, head first
        pts[0] = q.x;
        pts[1] = q.y;
        let low = q.y;
        for (let j = 0; j < q.hn; j++) {
          const idx = ((q.hi - j + HN) % HN) * 2;
          pts[j * 2 + 2] = q.hist[idx];
          pts[j * 2 + 3] = q.hist[idx + 1];
          if (q.hist[idx + 1] < low) low = q.hist[idx + 1];
        }
        if (low > H + 20 || q.x < -W || q.x > W * 2) { q.on = false; continue; }
        const m = q.hn + 1;
        if (m < 2) continue;
        // the outline: down the left edge, back up the right one
        ctx.beginPath();
        for (let pass = 0; pass < 2; pass++) {
          for (let k = 0; k < m; k++) {
            const j = pass ? m - 1 - k : k;
            const a = j > 0 ? j - 1 : 0;
            const b = j < m - 1 ? j + 1 : m - 1;
            let nx = -(pts[b * 2 + 1] - pts[a * 2 + 1]);
            let ny = pts[b * 2] - pts[a * 2];
            const l = Math.hypot(nx, ny) || 1;
            const taper = j > m - 4 ? (m - j) / 4 : 1;
            const hw = (q.w / 2) * (0.22 + 0.78 * Math.abs(Math.cos(q.tw + j * 0.55))) * taper * (pass ? -1 : 1);
            nx = (nx / l) * hw;
            ny = (ny / l) * hw;
            if (k === 0 && pass === 0) ctx.moveTo(pts[j * 2] + nx, pts[j * 2 + 1] + ny);
            else ctx.lineTo(pts[j * 2] + nx, pts[j * 2 + 1] + ny);
          }
        }
        ctx.closePath();
        ctx.fillStyle = q.col;
        ctx.fill();
      }
    },
  };
}

/** Twinkles that blink in place (or drift down slowly with `fall`), from `from` seconds on. */
function twinkles(env, n, colors, x0, y0, x1, y1, size = 14, fall = 0) {
  const { doc, W, H, s } = env;
  const imgs = colors.map((c) => sparkSprite(doc, c));
  const T = [];
  for (let i = 0; i < n; i++) {
    T.push({ x: rand(x0, x1) * W, y: rand(y0, y1) * H, r: rand(0.5, 1.25) * size * s, ph: Math.random() * TAU, sp: rand(3, 7), img: imgs[i % imgs.length], t0: Math.random() * 0.9, v: rand(0.4, 1) * fall * s });
  }
  return {
    step(ctx, t, from = 0) {
      for (let i = 0; i < n; i++) {
        const k = T[i];
        const tt = t - from - k.t0;
        if (tt < 0) continue;
        const b = Math.sin(tt * k.sp + k.ph);
        if (b <= 0.05) continue;
        const r = k.r * b;
        const y = k.y + tt * k.v;
        ctx.globalAlpha = b;
        ctx.drawImage(k.img, k.x - r, y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    },
  };
}

/** Tiny steady night-sky stars. */
function nightSky(env, n, y1 = 0.75) {
  const { W, H, s } = env;
  const X = new Float32Array(n);
  const Y = new Float32Array(n);
  const R = new Float32Array(n);
  const F = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    X[i] = Math.random() * W;
    Y[i] = Math.random() * H * y1;
    R[i] = rand(1, 2.2) * s;
    F[i] = rand(1.5, 4);
  }
  return {
    step(ctx, t) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * F[i] + i);
        ctx.fillRect(X[i], Y[i], R[i], R[i]);
      }
      ctx.globalAlpha = 1;
    },
  };
}

/**
 * Glowing sparks (fireworks, embers, dust): flat typed arrays, a ring buffer (a new spark takes the oldest slot), air
 * drag `k` and gravity `g`. `tw` = 1: the spark crackles (blinks) in the last half of its life.
 */
function sparks(n) {
  const P = {
    n,
    next: 0,
    x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n),
    age: new Float32Array(n), life: new Float32Array(n), size: new Float32Array(n), k: new Float32Array(n),
    g: new Float32Array(n), c: new Uint8Array(n), tw: new Uint8Array(n),
  };
  P.emit = (x, y, vx, vy, life, size, k, g, c, tw = 0) => {
    const i = P.next;
    P.next = (i + 1) % n;
    P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy;
    P.age[i] = 0; P.life[i] = life; P.size[i] = size; P.k[i] = k; P.g[i] = g; P.c[i] = c; P.tw[i] = tw;
  };
  P.step = (dt) => {
    for (let i = 0; i < n; i++) {
      if (P.life[i] <= 0) continue;
      P.age[i] += dt;
      if (P.age[i] >= P.life[i]) { P.life[i] = 0; continue; }
      const d = Math.exp(-P.k[i] * dt);
      P.vx[i] *= d;
      P.vy[i] = P.vy[i] * d + P.g[i] * dt;
      P.x[i] += P.vx[i] * dt;
      P.y[i] += P.vy[i] * dt;
    }
  };
  /** Glow dots that shrink and fade over their life. */
  P.draw = (ctx, imgs) => {
    for (let i = 0; i < n; i++) {
      if (P.life[i] <= 0) continue;
      const f = 1 - P.age[i] / P.life[i];
      let a = f < 0.3 ? f / 0.3 : 1;
      if (P.tw[i] && f < 0.55 && Math.random() < 0.45) a *= 0.15;
      const r = P.size[i] * (0.4 + 0.6 * f);
      ctx.globalAlpha = a;
      ctx.drawImage(imgs[P.c[i]], P.x[i] - r, P.y[i] - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  };
  return P;
}

function ring(ctx, x, y, r, w, style, a) {
  if (a <= 0.01 || r <= 0) return;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.lineWidth = w;
  ctx.strokeStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}

/** An image centred on (x, y), turned by `a` and scaled to w x h (css px). */
function stamp(ctx, dpr, img, x, y, w, h, a = 0) {
  const c = Math.cos(a) * dpr;
  const sn = Math.sin(a) * dpr;
  ctx.setTransform(c, sn, -sn, c, x * dpr, y * dpr);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------------------------------------------------------------------------
// The shows. Each maker gets env { doc, W, H, s, dpr, ctx } and returns { step(ctx, t, dt, top), trail?, tintAt?, flash }:
// `step` draws one frame at `t` seconds; `trail` (per second) fades the canvas instead of clearing it, so moving lights
// leave streaks (`top` is then a second, cleared canvas for what must not smear); `flash` is raised on a bang and the
// runner lets it die away.
// ---------------------------------------------------------------------------
const PARTY = [['#ff3b6b', '#b8193f'], ['#ffd23f', '#d49a00'], ['#2fd27a', '#14904c'], ['#3fa9ff', '#1b62c4'], ['#a46bff', '#6a35cf'],
  ['#ff8a3d', '#cf5410'], ['#ffffff', '#c9cfdd'], ['#19d3c5', '#0c8f85'], ['#ff7ad9', '#c53b9f'], ['#fff2b0', '#e0a800']];

/** Konfetti (free): two party cannons in the bottom corners, two volleys of rich tumbling paper and glitter. */
function konfettiFx(env) {
  const { doc, W, H, s } = env;
  const paper = confetti(env, 220, PARTY);
  const curls = ribbons(env, 12, ['#ff3b6b', '#ffd23f', '#3fa9ff', '#2fd27a', '#a46bff', '#ff8a3d', '#19d3c5'], 8);
  const glitter = twinkles(env, 22, ['#fff6c8', '#ffffff', '#ffe066', '#ffd0f0'], 0.06, 0.05, 0.94, 0.62, 13, 40);
  const puff = glowSprite(doc, '#fff1b0');
  const volleys = [0, 0.82];
  let v = 0;
  let shot = -9;
  const fx = {
    flash: 0,
    step(ctx, t, dt) {
      while (v < volleys.length && t >= volleys[v]) {
        const n = v ? 42 : 68;
        paper.fire(n, -8 * s, H + 8, -1.12, 0.3, H * 1.25, H * 2.65, 0.16);        // the left cannon, up and in
        paper.fire(n, W + 8 * s, H + 8, -Math.PI + 1.12, 0.3, H * 1.25, H * 2.65, 0.16);
        if (!v) {
          curls.fire(6, -8 * s, H + 8, -1.1, 0.22, H * 1.3, H * 2.2);
          curls.fire(6, W + 8 * s, H + 8, -Math.PI + 1.1, 0.22, H * 1.3, H * 2.2);
        }
        shot = t;
        v++;
        fx.flash = v === 1 ? 0.55 : 0.35;
      }
      const age = t - shot;
      if (age < 0.4) {
        const r = (110 + 240 * age) * s;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - age / 0.4;
        ctx.drawImage(puff, -r, H - r, r * 2, r * 2);
        ctx.drawImage(puff, W - r, H - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      curls.step(ctx, dt);
      paper.step(ctx, dt);
      ctx.globalCompositeOperation = 'lighter';
      glitter.step(ctx, t, 0.25);
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  return fx;
}

const FW = ['#ff4fa3', '#ffcf4a', '#4fd8ff', '#7dff7a', '#b07cff', '#ff6a3d', '#ffffff', '#ffe9a8'];

/** Vuurwerk: rockets with glowing trails burst into peonies, a gold willow and a ring, then a double finale. */
function vuurwerkFx(env) {
  const { doc, W, H, s } = env;
  const imgs = FW.map((c) => glowSprite(doc, c));
  const head = glowSprite(doc, '#fff3c4');
  const P = sparks(270);
  const sky = nightSky(env, 36, 0.7);
  const RISE = 0.58;
  const plan = [
    { t: 0.0, x: 0.28, y: 0.3, kind: 'peony', c: 0, c2: 6 },
    { t: 0.28, x: 0.74, y: 0.2, kind: 'peony', c: 2, c2: 4 },
    { t: 0.6, x: 0.5, y: 0.37, kind: 'willow', c: 7 },
    { t: 0.95, x: 0.22, y: 0.16, kind: 'ring', c: 3, c2: 6 },
    { t: 1.28, x: 0.8, y: 0.36, kind: 'peony', c: 4, c2: 1 },
    { t: 1.72, x: 0.3, y: 0.24, kind: 'finale', c: 0, c2: 1 },
    { t: 1.84, x: 0.72, y: 0.19, kind: 'finale', c: 2, c2: 6 },
  ];
  for (const r of plan) {
    r.x0 = (r.x + rand(-0.07, 0.07)) * W;
    r.tx = r.x * W;
    r.ty = r.y * H;
    r.bt = -9;
    r.px = r.x0;
    r.py = H + 20;
  }
  function burst(r) {
    const big = r.kind === 'finale';
    const R = (big ? 0.34 : 0.29) * W;
    if (r.kind === 'willow') {
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU + rand(-0.06, 0.06);
        const v = R * 2.7 * rand(0.72, 1);
        P.emit(r.tx, r.ty, Math.cos(a) * v, Math.sin(a) * v, rand(1.7, 2.2), 7.5 * s, 2.7, 95 * s, r.c, 1);
      }
      return;
    }
    if (r.kind === 'ring') {
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU;
        P.emit(r.tx, r.ty, Math.cos(a) * R * 2.4, Math.sin(a) * R * 2.4, rand(1.05, 1.25), 7 * s, 2.4, 110 * s, r.c, 0);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        P.emit(r.tx, r.ty, Math.cos(a) * R * 1.1, Math.sin(a) * R * 1.1, rand(0.8, 1), 6 * s, 2.4, 110 * s, r.c2, 1);
      }
      return;
    }
    const n = big ? 48 : 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.05, 0.05);
      const v = R * 2.4 * rand(0.84, 1);
      P.emit(r.tx, r.ty, Math.cos(a) * v, Math.sin(a) * v, rand(1.0, 1.45), 7 * s, 2.4, 135 * s, r.c, 1);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + rand(-0.1, 0.1);
      const v = R * 2.4 * rand(0.38, 0.5);
      P.emit(r.tx, r.ty, Math.cos(a) * v, Math.sin(a) * v, rand(0.75, 1.0), 6 * s, 2.4, 120 * s, r.c2, 0);
    }
    if (big && r.c === 0) {   // the first finale also drops a curtain of gold
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * TAU + rand(-0.08, 0.08);
        const v = R * 2.7 * rand(0.55, 0.75);
        P.emit(r.tx, r.ty, Math.cos(a) * v, Math.sin(a) * v, rand(1.5, 1.9), 7 * s, 2.7, 90 * s, 7, 1);
      }
    }
  }
  const fx = {
    trail: 8,
    flash: 0,
    step(ctx, t, dt, top) {
      sky.step(top, t);
      ctx.globalCompositeOperation = 'lighter';
      top.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < plan.length; i++) {
        const r = plan[i];
        const age = t - r.t;
        if (age < 0) continue;
        if (age < RISE) {
          const p = age / RISE;
          const e = 1 - (1 - p) * (1 - p);
          const x = r.x0 + (r.tx - r.x0) * e;
          const y = H + 20 + (r.ty - H - 20) * e;
          ctx.strokeStyle = 'rgba(255,226,160,0.85)';   // a solid streak (the fade turns it into a trail)
          ctx.lineWidth = 2.6 * s;
          ctx.beginPath();
          ctx.moveTo(r.px, r.py);
          ctx.lineTo(x, y);
          ctx.stroke();
          r.px = x;
          r.py = y;
          const rr = 8 * s;
          ctx.drawImage(head, x - rr, y - rr, rr * 2, rr * 2);
          if (Math.random() < 0.7) P.emit(x, y, rand(-18, 18) * s, rand(30, 90) * s, rand(0.3, 0.55), 3.4 * s, 2, 220 * s, 7, 1);
        } else if (r.bt < 0) {
          r.bt = t;
          burst(r);
          fx.flash = Math.max(fx.flash, r.kind === 'finale' ? 0.5 : 0.3);
        }
        const ba = t - r.bt;
        if (r.bt >= 0 && ba < 0.4) {
          const R = (r.kind === 'finale' ? 0.8 : 0.6) * W * (0.55 + ba);
          top.globalAlpha = (1 - ba / 0.4) * 0.6;
          top.drawImage(imgs[r.c], r.tx - R, r.ty - R, R * 2, R * 2);
          top.globalAlpha = 1;
        }
      }
      P.step(dt);
      P.draw(ctx, imgs);
      ctx.globalCompositeOperation = 'source-over';
      top.globalCompositeOperation = 'source-over';
    },
  };
  return fx;
}

const SA_PAPER = [['#00a862', '#00703f'], ['#ffb612', '#d18e00'], ['#e8423a', '#a82520'], ['#2453e0', '#0b2a8a'], ['#1c1c1c', '#454545'], ['#ffffff', '#d5d9e2']];
const SA_STREAM = ['#00a05a', '#ffb612', '#de3831', '#1f48d6', '#ffffff', '#00a05a', '#ffb612'];   // no black: a dark ribbon reads as a string
const SA_RING = ['#00a05a', '#ffb612', '#de3831', '#1f48d6', '#ffffff'];

/** Vuvuzela: the horn blasts five times; flag-colour sound rings, twisting flag-colour streamers and flag confetti. */
function vuvuzelaFx(env) {
  const { doc, W, H, s, dpr } = env;
  const hx = W * 0.5;
  const hy = H * 0.84;
  const ry = hy - 26 * s;                       // the rings and streamers leave just above the horn
  const horn = emojiSprite(doc, '📯', Math.round(160 * s * dpr));
  const hornGlow = glowSprite(doc, '#ffd23f');
  const paper = confetti(env, 130, SA_PAPER);
  const flags = ribbons(env, 30, SA_STREAM, 13);
  const blasts = [0.05, 0.72, 1.38, 2.04, 2.66];
  let b = 0;
  let last = -9;
  const fx = {
    flash: 0,
    step(ctx, t, dt) {
      while (b < blasts.length && t >= blasts[b]) {
        const count = b === 0 ? 12 : b < 3 ? 9 : 0;
        if (count) flags.fire(count, hx, ry, -Math.PI / 2, 1.0, H * 1.1, H * 1.9);
        if (b === 0 || b === 2) {
          const n = b ? 25 : 36;
          paper.fire(n, -8 * s, H + 8, -1.1, 0.3, H * 1.2, H * 2.4, 0.14);
          paper.fire(n, W + 8 * s, H + 8, -Math.PI + 1.1, 0.3, H * 1.2, H * 2.4, 0.14);
        }
        last = blasts[b];
        b++;
        fx.flash = 0.45;
      }
      // the sound waves: three rings a blast, flag colours
      for (let k = 0; k < b; k++) {
        const age = t - blasts[k];
        if (age > 1.3) continue;
        for (let j = 0; j < 3; j++) {
          const p = (age - j * 0.09) / 1.15;
          if (p < 0 || p > 1) continue;
          ring(ctx, hx, ry, 30 * s + easeOutCubic(p) * H * 0.95, (16 * (1 - p) + 2.5) * s, SA_RING[(k + j) % SA_RING.length], (1 - p) ** 1.2 * 0.9);
        }
      }
      ctx.globalAlpha = 1;
      flags.step(ctx, dt);
      paper.step(ctx, dt);
      // the horn: rises in, then pumps on every blast
      const pump = Math.exp(-(t - last) * 7);
      const rise = t < 0.32 ? 1 - easeOutBack(t / 0.32) : 0;
      ctx.globalCompositeOperation = 'lighter';
      const gr = (130 + 80 * pump) * s;
      ctx.globalAlpha = 0.5 + 0.4 * pump;
      ctx.drawImage(hornGlow, hx - gr, hy + rise * 170 * s - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const hs = 160 * s * (1 + 0.2 * pump);
      stamp(ctx, dpr, horn, hx, hy + rise * 170 * s, hs, hs, -0.3 + 0.07 * Math.sin(t * 24) * pump);
    },
  };
  return fx;
}


/**
 * (1.15.4, the owner: "Also replace the Vuvuzela with soemthing else") a king protea, centred on (cx, cy), about R across
 * its bracts: two leaves, a crown of pointed pink bracts (the upper ones longer), the soft pink-cream dome with its silvery
 * rim on top. The shop tile and the show draw the same one (the item keeps its id, so whoever owns the Vuvuzela owns it).
 */
function drawProtea(x, cx, cy, R) {
  const k = R / 40;
  x.save();
  x.translate(cx, cy);
  x.scale(k, k);
  x.lineJoin = 'round';
  const leaf = (lx, ly, a) => {
    x.save();
    x.translate(lx, ly);
    x.rotate(a);
    const g = x.createLinearGradient(0, -6, 0, 6);
    g.addColorStop(0, '#7fbf5a');
    g.addColorStop(1, '#2f6d2a');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, 0);
    x.quadraticCurveTo(14, -9, 30, 0);
    x.quadraticCurveTo(14, 9, 0, 0);
    x.fill();
    x.strokeStyle = 'rgba(20,60,20,0.6)';
    x.lineWidth = 0.9;
    x.beginPath();
    x.moveTo(1, 0);
    x.lineTo(28, 0);
    x.stroke();
    x.restore();
  };
  leaf(-6, 22, Math.PI - 0.55);
  leaf(6, 22, 0.55);
  const bract = (a, len, w, light, dark) => {
    x.save();
    x.rotate(a);
    const g = x.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, dark);
    g.addColorStop(0.55, light);
    g.addColorStop(1, '#fff1f5');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(6, -w * 0.45);
    x.quadraticCurveTo(len * 0.55, -w, len, 0);
    x.quadraticCurveTo(len * 0.55, w, 6, w * 0.45);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(120,10,50,0.55)';
    x.lineWidth = 0.9;
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.45)';
    x.lineWidth = 0.7;
    x.beginPath();
    x.moveTo(10, 0);
    x.lineTo(len * 0.8, 0);
    x.stroke();
    x.restore();
  };
  // the back crown: long bracts fanning upwards
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI + 0.12 + (i / 10) * (Math.PI - 0.24);
    bract(a, 40 + 4 * Math.sin(i * 1.9), 11, '#f2709a', '#a3134a');
  }
  // the lower bracts, shorter, cupping the dome from below (behind it)
  for (let i = 0; i < 7; i++) {
    const a = 0.3 + (i / 6) * (Math.PI - 0.6);
    bract(a, 31, 12, '#ff86ab', '#b5175a');
  }
  // the dome: soft pink-cream florets
  const d = x.createRadialGradient(-4, -8, 2, 0, -2, 22);
  d.addColorStop(0, '#fff6ef');
  d.addColorStop(0.55, '#f6c9d4');
  d.addColorStop(1, '#c7708c');
  x.fillStyle = d;
  x.beginPath();
  x.ellipse(0, -2, 22, 19, 0, 0, TAU);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.55)';   // the dome's silvery hairs at its rim
  x.lineWidth = 0.8;
  for (let a = 0; a < TAU; a += 0.21) {
    x.beginPath();
    x.moveTo(Math.cos(a) * 19, -2 + Math.sin(a) * 16.5);
    x.lineTo(Math.cos(a) * 23.5, -2 + Math.sin(a) * 20.5);
    x.stroke();
  }
  x.fillStyle = 'rgba(160,60,90,0.35)';
  for (let r = 4; r < 18; r += 4.2) {
    for (let a = 0; a < TAU; a += 0.8 - r * 0.02) {
      x.beginPath();
      x.arc(Math.cos(a + r) * r, -2 + Math.sin(a + r) * r * 0.86, 1.1, 0, TAU);
      x.fill();
    }
  }
  x.restore();
}

/** Protea: three king proteas bloom up from the bottom, a gold glow behind; pink petals drift down all over. */
function proteaFx(env) {
  const { doc, W, H, s, dpr } = env;
  const PS = Math.round(220 * s * dpr);
  const flower = sprite(doc, `protea${PS}`, PS, PS, (x) => { x.scale(PS / 100, PS / 100); drawProtea(x, 50, 46, 44); });
  const glow = glowSprite(doc, '#ffd0e0');
  const gold = glowSprite(doc, '#ffd23f');
  const blooms = [
    { x: 0.5, y: 0.8, size: 1.25, at: 0.05 },
    { x: 0.2, y: 0.88, size: 0.85, at: 0.35 },
    { x: 0.8, y: 0.88, size: 0.85, at: 0.55 },
  ];
  const NP = 70;
  const petals = [];
  for (let i = 0; i < NP; i++) {
    petals.push({
      x: Math.random() * W, y: -Math.random() * H * 0.9 - 20 * s, vy: rand(70, 140) * s, ph: rand(0, TAU), sw: rand(18, 46) * s,
      r: rand(6, 11) * s, a: rand(0, TAU), va: rand(-2.5, 2.5), c: ['#f2709a', '#ff9fbe', '#ffd1df', '#c71f5c'][i % 4],
    });
  }
  const fx = {
    flash: 0.35,
    step(ctx, t, dt) {
      // petals behind the flowers
      for (const p of petals) {
        p.y += p.vy * dt;
        p.a += p.va * dt;
        const px = p.x + Math.sin(t * 1.6 + p.ph) * p.sw;
        ctx.save();
        ctx.translate(px, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.48, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      for (const b of blooms) {
        const f = clamp01((t - b.at) / 0.7);
        if (f <= 0) continue;
        const grow = easeOutBack(f);
        const size = 220 * s * b.size * grow;
        const bx = W * b.x;
        const by = H * b.y;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * f;
        const gr = size * 0.9;
        ctx.drawImage(b.size > 1 ? gold : glow, bx - gr, by - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        stamp(ctx, dpr, flower, bx, by, size, size, 0.06 * Math.sin(t * 2.2 + b.x * 9) * f);
      }
    },
  };
  return fx;
}

const EMBER = ['#fff3b0', '#ffb43a', '#ff6a1f', '#e2421c'];

/** A boerewors coil seen from above, centred on (cx, cy), radius R (the shop tile and the show draw the same one). */
function drawCoil(x, cx, cy, R) {
  const k = R / 31;
  const pts = [];
  const turns = 4.6 * Math.PI;
  for (let a = 0; a <= turns; a += 0.12) {
    const r = R * (0.13 + 0.87 * (a / turns));
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.86);
  }
  const coil = (w, c, dx = 0, dy = 0) => {
    x.strokeStyle = c;
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(pts[0] + dx, pts[1] + dy);
    for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i] + dx, pts[i + 1] + dy);
    x.stroke();
  };
  x.lineCap = 'round';
  x.lineJoin = 'round';
  coil(10.5 * k, '#4a1606');
  coil(8 * k, '#a8461f');
  coil(2.6 * k, 'rgba(255,170,120,0.85)', -1 * k, -1.6 * k);
  x.strokeStyle = 'rgba(60,15,4,0.85)';   // grill marks across the coil
  x.lineWidth = 1.6 * k;
  for (let i = 8; i < pts.length - 2; i += 10) {
    const dx = pts[i + 2] - pts[i];
    const dy = pts[i + 3] - pts[i + 1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * 3 * k;
    const ny = (dx / l) * 3 * k;
    x.beginPath();
    x.moveTo(pts[i] - nx, pts[i + 1] - ny);
    x.lineTo(pts[i] + nx, pts[i + 1] + ny);
    x.stroke();
  }
}

/**
 * (1.15, the owner: "This is not a braai, please change it to look like a proper SA braai") a drum braai: half a 44-gallon
 * drum on its legs, the lid open behind, the coals glowing under the grid, boerewors, tjops, sosaties and a mielie on it.
 * Drawn in a 300 x 220 design box (the grid's back edge at y 72, its front edge at y 112).
 */
const GRID_BACK = [40, 260, 72];
const GRID_FRONT = [18, 282, 112];
function drawDrumBraai(x, { coals = true } = {}) {
  const rnd = seeded(8);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  // the lid, open and leaning back: its dark inside
  let g = x.createLinearGradient(0, 14, 0, 74);
  g.addColorStop(0, '#2c2c33');
  g.addColorStop(1, '#0e0e12');
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(150, 74, 112, 58, 0, Math.PI, TAU);
  x.closePath();
  x.fill();
  x.strokeStyle = '#4a4a55';
  x.lineWidth = 4;
  x.beginPath();
  x.ellipse(150, 74, 112, 58, 0, Math.PI, TAU);
  x.stroke();
  // (1.15.4, the owner: "Improve the braai a little more") the drum's two rolling hoops on the open lid too: a 44-gallon
  // drum, not a kettle
  for (const hx of [104, 196]) {
    x.strokeStyle = 'rgba(0,0,0,0.55)';
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(hx, 74);
    x.quadraticCurveTo(hx + (hx < 150 ? -6 : 6), 40, hx + (hx < 150 ? 8 : -8), 22);
    x.stroke();
    x.strokeStyle = 'rgba(160,160,180,0.35)';
    x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(hx - 2, 74);
    x.quadraticCurveTo(hx - 2 + (hx < 150 ? -6 : 6), 40, hx - 2 + (hx < 150 ? 8 : -8), 22);
    x.stroke();
  }
  x.fillStyle = '#7a4a22';                                  // the lid's wooden handle
  x.fillRect(122, 8, 56, 8);
  x.fillStyle = '#3a3a42';
  x.fillRect(128, 14, 5, 6);
  x.fillRect(167, 14, 5, 6);
  // the fire bed seen through the grid
  x.beginPath();
  x.moveTo(GRID_BACK[0], GRID_BACK[2]);
  x.lineTo(GRID_BACK[1], GRID_BACK[2]);
  x.lineTo(GRID_FRONT[1], GRID_FRONT[2]);
  x.lineTo(GRID_FRONT[0], GRID_FRONT[2]);
  x.closePath();
  x.fillStyle = '#1c0b05';
  x.fill();
  if (coals) {
    x.save();
    x.clip();
    for (let i = 0; i < 70; i++) {
      const u = rnd();
      const v = rnd();
      const y = 72 + v * 40;
      const x0 = 40 - 22 * v;
      const cx = x0 + u * (220 + 44 * v);
      const r = 5 + rnd() * 7;
      const cg = x.createRadialGradient(cx - r * 0.3, y - r * 0.3, 0.5, cx, y, r);
      if (rnd() < 0.55) {
        cg.addColorStop(0, '#fff2a8');
        cg.addColorStop(0.35, '#ff9a2a');
        cg.addColorStop(1, 'rgba(190,40,8,0)');
      } else {
        cg.addColorStop(0, '#6a3b2a');
        cg.addColorStop(0.5, '#2a120a');
        cg.addColorStop(1, 'rgba(255,110,30,0.3)');
      }
      x.fillStyle = cg;
      x.beginPath();
      x.ellipse(cx, y, r, r * 0.6, 0, 0, TAU);
      x.fill();
    }
    x.restore();
  }
  // the grid: a frame and bars running back to front
  x.strokeStyle = '#26262b';
  x.lineWidth = 3;
  for (let i = 0; i <= 18; i++) {
    const f = i / 18;
    x.beginPath();
    x.moveTo(GRID_BACK[0] + f * (GRID_BACK[1] - GRID_BACK[0]), GRID_BACK[2]);
    x.lineTo(GRID_FRONT[0] + f * (GRID_FRONT[1] - GRID_FRONT[0]), GRID_FRONT[2]);
    x.stroke();
  }
  x.strokeStyle = 'rgba(200,200,215,0.55)';
  x.lineWidth = 0.9;
  for (let i = 0; i <= 18; i++) {
    const f = i / 18;
    x.beginPath();
    x.moveTo(GRID_BACK[0] + f * (GRID_BACK[1] - GRID_BACK[0]) - 0.8, GRID_BACK[2]);
    x.lineTo(GRID_FRONT[0] + f * (GRID_FRONT[1] - GRID_FRONT[0]) - 0.8, GRID_FRONT[2]);
    x.stroke();
  }
  x.strokeStyle = '#3d3d45';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(GRID_BACK[0], GRID_BACK[2]);
  x.lineTo(GRID_BACK[1], GRID_BACK[2]);
  x.lineTo(GRID_FRONT[1], GRID_FRONT[2]);
  x.lineTo(GRID_FRONT[0], GRID_FRONT[2]);
  x.closePath();
  x.stroke();
  // on the grid: a mielie at the back, the boerewors coil, two tjops, two sosaties
  x.save();
  x.translate(232, 80);
  x.rotate(-0.12);
  x.scale(1, 0.62);
  g = x.createLinearGradient(0, -8, 0, 8);
  g.addColorStop(0, '#ffe27a');
  g.addColorStop(1, '#d9a51c');
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(0, 0, 26, 9, 0, 0, TAU);
  x.fill();
  x.fillStyle = 'rgba(120,70,10,0.5)';
  for (let k = -20; k <= 20; k += 5) for (const dy of [-4, 0, 4]) x.fillRect(k, dy - 1, 2.5, 2);
  x.fillStyle = 'rgba(60,30,8,0.6)';                         // charred spots
  for (const [cx, cy] of [[-10, -3], [4, 3], [14, -2]]) { x.beginPath(); x.arc(cx, cy, 2.6, 0, TAU); x.fill(); }
  x.fillStyle = '#8fbf5a';                                   // the husk
  x.beginPath();
  x.moveTo(24, -6);
  x.quadraticCurveTo(40, -12, 46, -2);
  x.quadraticCurveTo(38, 0, 24, 6);
  x.fill();
  x.restore();
  x.save();
  x.translate(92, 92);
  x.scale(1, 0.62);
  drawCoil(x, 0, 0, 30);
  x.restore();
  for (const [cx, cy, a] of [[176, 84, 0.3], [206, 100, -0.4]]) {
    x.save();
    x.translate(cx, cy);
    x.scale(0.78, 0.5);
    x.rotate(a);
    drawChop(x, true);
    x.restore();
  }
  for (const [x0, y0, x1, y1] of [[136, 106, 216, 96], [150, 76, 196, 70]]) sosatie(x, x0, y0, x1, y1);
  // the drum's front: half a drum, black steel, the coals' light on its rim
  g = x.createLinearGradient(0, 112, 0, 176);
  g.addColorStop(0, '#45454f');
  g.addColorStop(0.45, '#22222a');
  g.addColorStop(1, '#0c0c10');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(GRID_FRONT[0], 112);
  x.ellipse(150, 112, 132, 64, 0, Math.PI, 0, true);
  x.closePath();
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.07)';                     // a long highlight along the drum
  x.beginPath();
  x.ellipse(150, 128, 110, 10, 0, 0, TAU);
  x.fill();
  // (1.15.4) the drum's two rolling hoops, running round it from the rim to the bottom
  for (const hx of [100, 200]) {
    const bend = hx < 150 ? -10 : 10;
    x.strokeStyle = '#0b0b0e';
    x.lineWidth = 7;
    x.beginPath();
    x.moveTo(hx, 114);
    x.quadraticCurveTo(hx + bend, 146, hx + bend * 0.4, 172);
    x.stroke();
    x.strokeStyle = 'rgba(190,190,210,0.4)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(hx - 2.5, 114);
    x.quadraticCurveTo(hx - 2.5 + bend, 146, hx - 2.5 + bend * 0.4, 171);
    x.stroke();
  }
  x.strokeStyle = '#5c5c68';                                 // the rolled rim
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(GRID_FRONT[0] - 2, 112);
  x.lineTo(GRID_FRONT[1] + 2, 112);
  x.stroke();
  x.strokeStyle = 'rgba(255,150,60,0.75)';
  x.lineWidth = 1.6;
  x.beginPath();
  x.moveTo(GRID_FRONT[0], 110);
  x.lineTo(GRID_FRONT[1], 110);
  x.stroke();
  x.fillStyle = '#6a6a76';                                   // rivets and an air vent
  for (let k = 0; k < 9; k++) {
    x.beginPath();
    x.arc(40 + k * 27.5, 120, 1.8, 0, TAU);
    x.fill();
  }
  x.fillStyle = '#0a0a0d';
  for (let k = -2; k <= 2; k++) {
    x.beginPath();
    x.ellipse(150 + k * 9, 150, 2.4, 6, 0, 0, TAU);
    x.fill();
  }
  // the legs: an A-frame at each end, a bar between
  x.strokeStyle = '#1a1a1f';
  x.lineWidth = 7;
  for (const [x0, a, b] of [[64, 34, 96], [236, 204, 266]]) {
    x.beginPath();
    x.moveTo(x0, 150);
    x.lineTo(a, 218);
    x.moveTo(x0, 150);
    x.lineTo(b, 218);
    x.stroke();
  }
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(52, 196);
  x.lineTo(248, 196);
  x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.12)';
  x.lineWidth = 1.5;
  x.beginPath();
  x.moveTo(52, 194);
  x.lineTo(248, 194);
  x.stroke();
}
/** A sosatie: a skewer of lamb, onion, red pepper and dried apricot, lying from (x0, y0) to (x1, y1). */
function sosatie(x, x0, y0, x1, y1) {
  x.strokeStyle = '#d9b77a';
  x.lineWidth = 2.4;
  x.beginPath();
  x.moveTo(x0 - (x1 - x0) * 0.08, y0 - (y1 - y0) * 0.08);
  x.lineTo(x1 + (x1 - x0) * 0.08, y1 + (y1 - y0) * 0.08);
  x.stroke();
  const cols = ['#7a3416', '#f1e3c8', '#7a3416', '#d8352a', '#7a3416', '#f39a2b', '#7a3416'];
  for (let k = 0; k < cols.length; k++) {
    const f = (k + 0.5) / cols.length;
    const cx = x0 + (x1 - x0) * f;
    const cy = y0 + (y1 - y0) * f;
    x.fillStyle = cols[k];
    x.beginPath();
    x.ellipse(cx, cy, 5.6, 4, Math.atan2(y1 - y0, x1 - x0), 0, TAU);
    x.fill();
    x.fillStyle = 'rgba(40,12,2,0.55)';
    x.fillRect(cx - 1, cy - 3, 1.6, 6);
  }
}
/** A lamb chop seen from above, about 52 x 36 round (0, 0): the eye of the meat, its fat edge, the tail and the bone. */
function drawChop(x, grilled) {
  const meat = grilled ? '#86391a' : '#d0695a';
  const meatD = grilled ? '#5a2210' : '#a8463a';
  const fat = grilled ? '#d6a25c' : '#f4ddb8';
  x.fillStyle = fat;                                         // the fat around the eye and along the tail
  x.beginPath();
  x.ellipse(7, -1, 20, 15.5, 0, 0, TAU);
  x.fill();
  x.beginPath();
  x.moveTo(-6, -8);
  x.quadraticCurveTo(-20, -6, -25, 4);
  x.quadraticCurveTo(-20, 12, -4, 12);
  x.closePath();
  x.fill();
  const g = x.createRadialGradient(4, -4, 2, 7, 0, 18);
  g.addColorStop(0, meat);
  g.addColorStop(1, meatD);
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(8, 0, 16, 12, 0, 0, TAU);
  x.fill();
  x.beginPath();
  x.moveTo(-5, -4);
  x.quadraticCurveTo(-16, -2, -19, 4);
  x.quadraticCurveTo(-15, 8, -4, 8);
  x.closePath();
  x.fill();
  x.fillStyle = grilled ? '#ead3b0' : '#fbf1e2';             // the bone
  x.beginPath();
  x.arc(-26, 4, 4.6, 0, TAU);
  x.fill();
  x.fillStyle = 'rgba(120,80,40,0.45)';
  x.beginPath();
  x.arc(-26, 4, 1.8, 0, TAU);
  x.fill();
  if (grilled) {                                             // the grill's marks
    x.strokeStyle = 'rgba(30,8,2,0.85)';
    x.lineWidth = 2.6;
    for (const dx of [-10, 2, 14]) {
      x.beginPath();
      x.moveTo(dx - 5, -11);
      x.lineTo(dx + 5, 11);
      x.stroke();
    }
  } else {
    x.fillStyle = 'rgba(255,255,255,0.35)';                  // raw: a little shine
    x.beginPath();
    x.ellipse(4, -5, 6, 2.5, -0.3, 0, TAU);
    x.fill();
  }
}
/** Braai tongs: the jaws at (tx, ty), the arms reaching up and right at `ang`, `open` how far the jaws stand apart. */
function drawTongs(ctx, tx, ty, ang, open, L) {
  const ux = Math.cos(ang);
  const uy = -Math.sin(ang);
  const nx = -uy;
  const ny = ux;
  const hx = tx + ux * L;
  const hy = ty + uy * L;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const jx = tx + nx * side * (3 + open * L * 0.12);
    const jy = ty + ny * side * (3 + open * L * 0.12);
    const mx = jx + (hx - jx) * 0.62;
    const my = jy + (hy - jy) * 0.62;
    ctx.strokeStyle = '#3a3d44';
    ctx.lineWidth = L * 0.045;
    ctx.beginPath();
    ctx.moveTo(jx, jy);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = '#c9ced6';
    ctx.lineWidth = L * 0.026;
    ctx.beginPath();
    ctx.moveTo(jx, jy);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.strokeStyle = '#7a4a22';                             // the wooden grips
    ctx.lineWidth = L * 0.06;
    ctx.beginPath();
    ctx.moveTo(mx + (hx - mx) * 0.15, my + (hy - my) * 0.15);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = '#9aa0a8';                               // the scalloped jaw
    ctx.beginPath();
    ctx.arc(jx, jy, L * 0.03, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#2a2d33';
  ctx.beginPath();
  ctx.arc(hx, hy, L * 0.035, 0, TAU);
  ctx.fill();
}

/**
 * (1.15.4) One flame tongue: a teardrop from its foot (x, y) up `h`, `w` wide, its tip leaning by `lean` (of w), yellow at the
 * core, orange to red at its edge, fading to nothing at the tip.
 */
function flameTongue(ctx, x, y, w, h, lean, alpha) {
  if (h <= 1 || alpha <= 0.01) return;
  const g = ctx.createLinearGradient(x, y, x, y - h);
  g.addColorStop(0, 'rgba(255,240,170,0.95)');
  g.addColorStop(0.35, 'rgba(255,170,50,0.85)');
  g.addColorStop(0.75, 'rgba(240,80,20,0.55)');
  g.addColorStop(1, 'rgba(200,40,10,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y + w * 0.12);
  ctx.bezierCurveTo(x - w * 0.95, y, x - w * 0.55, y - h * 0.55, x + lean * w, y - h);
  ctx.bezierCurveTo(x + w * 0.55, y - h * 0.55, x + w * 0.95, y, x, y + w * 0.12);
  ctx.closePath();
  ctx.fill();
}

/**
 * Braai: the drum braai rises at the bottom, flames lick up through the grid, the braaier's tongs bring a tjop, set it
 * down with a sizzle, click twice ("klik-klik"), then flip it to its grilled side; embers rise and smoke curls up.
 */
function braaiFx(env) {
  const { doc, W, H, s, dpr } = env;
  const BW = Math.min(W * 0.94, 540 * s);
  const k = BW / 300;
  const BH = 220 * k;
  const bx = W / 2 - BW / 2;
  const by = H - BH * 0.96;
  const pw = Math.max(1, Math.round(BW * dpr));
  const ph = Math.max(1, Math.round(BH * dpr));
  const braai = sprite(doc, `drum${pw}x${ph}`, pw, ph, (x) => { x.scale(pw / 300, ph / 220); drawDrumBraai(x); });
  const CS = Math.round(70 * k * dpr);
  const chopRaw = sprite(doc, `chopR${CS}`, CS, CS, (x) => { x.scale(CS / 70, CS / 70); x.translate(36, 35); drawChop(x, false); });
  const chopDone = sprite(doc, `chopD${CS}`, CS, CS, (x) => { x.scale(CS / 70, CS / 70); x.translate(36, 35); drawChop(x, true); });
  const E = EMBER.map((c) => glowSprite(doc, c));
  const flameA = glowSprite(doc, '#ffb43a');
  const flameB = glowSprite(doc, '#ff6a1f');
  const heat = softSprite(doc, '#ff7a1a', 0.85);
  const smoke = softSprite(doc, '#f6eee6', 0.55);
  const P = sparks(200);
  const NF = 34;
  const fl = [];
  for (let i = 0; i < NF; i++) fl.push({ x: 0, y: 0, age: 1, life: 0, r: 0, vy: 0 });
  let fi = 0;
  const NP = 16;
  const puffs = [];
  for (let i = 0; i < NP; i++) puffs.push({ x: 0, y: 0, r: 0, age: 0, life: 0, vx: 0, vy: 0 });
  let pi = 0;
  let puffAt = 0.4;
  let acc = 0;
  let flameAcc = 0;
  const P2 = (dx, dy) => [bx + dx * k, by + dy * k];          // a design point on the screen
  const [cx, cy] = P2(150, 98);                               // where the tjop lies
  const L = 210 * k;                                         // the tongs' length
  const LAND = [0.78, 2.12];
  let land = 0;
  let lastLand = -9;
  function puff(x, y, big) {
    const q = puffs[pi];
    pi = (pi + 1) % NP;
    q.x = x;
    q.y = y;
    q.r = rand(22, 40) * s * (big ? 1.35 : 1);
    q.age = 0;
    q.life = rand(1.4, 2.2);
    q.vx = rand(-20, 20) * s;
    q.vy = -rand(55, 95) * s;
  }
  // the tongs' jaw position, angle and opening at time t
  function tongs(t) {
    const home = [W + 60 * s, cy - H * 0.32];                // off screen, up on the right
    const over = [cx + 4 * k, cy - 34 * k];                 // just above the tjop
    const down = [cx + 4 * k, cy - 6 * k];                  // gripping it on the grid
    const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    if (t < 0.25) return { p: home, open: 0, hold: true };
    if (t < 0.78) return { p: mix(home, down, easeOutCubic((t - 0.25) / 0.53)), open: 0, hold: true };
    if (t < 0.95) return { p: mix(down, over, smooth((t - 0.78) / 0.17)), open: 0.35, hold: false };
    if (t < 1.4) {                                           // klik-klik
      const c = Math.abs(Math.sin(((t - 0.95) / 0.45) * Math.PI * 2));
      return { p: over, open: 0.05 + 0.4 * c, hold: false, click: true };
    }
    if (t < 1.62) return { p: mix(over, down, smooth((t - 1.4) / 0.22)), open: 0.35 * (1 - (t - 1.4) / 0.22), hold: false };
    if (t < 2.12) {                                          // lift and flip
      const f = (t - 1.62) / 0.5;
      const up = Math.sin(f * Math.PI) * 70 * k;
      return { p: [down[0], down[1] - up], open: 0, hold: true, flip: f };
    }
    if (t < 2.25) return { p: mix(down, over, (t - 2.12) / 0.13), open: 0.35, hold: false };
    return { p: mix(over, home, easeOutCubic(Math.min(1, (t - 2.25) / 0.5))), open: 0.2, hold: false };
  }
  let clicks = 0;
  const fx = {
    flash: 0,
    step(ctx, t, dt) {
      const on = Math.min(1, t / 0.3);
      const lift = (1 - easeOutCubic(on)) * BH * 0.8;       // the braai rises into view
      // the heat's glow behind it
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = on * (0.55 + 0.12 * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 13.1));
      ctx.drawImage(heat, bx - BW * 0.2, by + 20 * k - BH * 0.5 + lift, BW * 1.4, BH * 1.3);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(braai, bx, by + lift, BW, BH);
      // flames licking up through the grid
      if (t < 3.1) {
        flameAcc += dt * 70;
        while (flameAcc >= 1) {
          flameAcc -= 1;
          const q = fl[fi];
          fi = (fi + 1) % NF;
          const v = Math.random();
          const [fx0, fy0] = P2(40 - 22 * v + Math.random() * (220 + 44 * v), 74 + v * 36);
          q.x = fx0;
          q.y = fy0;
          q.age = 0;
          q.life = rand(0.28, 0.55);
          q.r = rand(9, 17) * k;
          q.vy = -rand(50, 110) * k;
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < NF; i++) {
        const q = fl[i];
        if (q.age >= q.life) continue;
        q.age += dt;
        q.y += q.vy * dt;
        const f = q.age / q.life;
        const r = q.r * (1 - 0.6 * f);
        ctx.globalAlpha = (1 - f) * 0.9;
        ctx.drawImage(f < 0.4 ? flameA : flameB, q.x - r, q.y - r * 1.6 + lift, r * 2, r * 3.2);
      }
      // (1.15.4, the owner: "Improve the braai a little more") real flame tongues licking up between the food
      if (t < 3.3) {
        ctx.globalCompositeOperation = 'lighter';
        const fade = Math.min(1, t / 0.4) * (t > 2.8 ? Math.max(0, (3.3 - t) / 0.5) : 1);
        for (let i = 0; i < 9; i++) {
          const u = (i + 0.5) / 9;
          const [fxp, fyp] = P2(30 + u * 240, 104 - 6 * Math.sin(u * Math.PI));
          const hgt = (34 + 22 * Math.sin(t * 9 + i * 1.7) + 10 * Math.sin(t * 23 + i)) * k;
          const wid = (22 + 5 * Math.sin(t * 11 + i * 2.3)) * k;
          flameTongue(ctx, fxp, fyp + lift, wid, hgt, Math.sin(t * 6 + i) * 0.25, fade * 0.85);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // the tjop and the tongs
      const tg = tongs(t);
      let chopX = cx;
      let chopY = cy;
      let sy = 1;
      let done = t >= 1.87;
      if (tg.hold) {
        chopX = tg.p[0] - 4 * k;
        chopY = tg.p[1] + 6 * k;
        if (tg.flip !== undefined) {
          sy = Math.cos(tg.flip * Math.PI);
          done = tg.flip >= 0.5;
        }
      }
      const visible = t >= 0.25;
      if (visible) {
        const e = Math.exp(-(t - lastLand) * 12);
        const cw = 70 * k * (1 + 0.15 * e);
        const ch = 70 * k * 0.55 * Math.max(0.06, Math.abs(sy)) * (1 - 0.12 * e);
        ctx.drawImage(done ? chopDone : chopRaw, chopX - cw / 2, chopY - ch / 2 + lift, cw, ch);
      }
      while (land < LAND.length && t >= LAND[land]) {         // sizzle: sparks, smoke and a warm flash
        for (let i = 0; i < 24; i++) {
          const a = -Math.PI / 2 + rand(-1.2, 1.2);
          const v = rand(240, 560) * s;
          P.emit(cx + rand(-30, 30) * k, cy, Math.cos(a) * v, Math.sin(a) * v, rand(0.45, 0.8), rand(5, 8) * s, 2.3, 520 * s, 0, 1);
        }
        for (let i = 0; i < 3; i++) puff(cx + rand(-30, 30) * k, cy - 20 * k, true);
        lastLand = LAND[land];
        land++;
        fx.flash = Math.max(fx.flash, land === 1 ? 0.45 : 0.32);
      }
      if (visible && t < 2.9) drawTongs(ctx, tg.p[0], tg.p[1] + lift, 0.95, tg.open, L);
      if (tg.click && tg.open < 0.08 && t - clicks > 0.15) {  // each close of the klik-klik: a little flash of sparks
        clicks = t;
        for (let i = 0; i < 6; i++) P.emit(tg.p[0], tg.p[1], rand(-120, 120) * s, rand(-160, -40) * s, rand(0.25, 0.4), rand(3, 5) * s, 3, 300 * s, 1, 1);
      }
      // smoke curling up off the grid
      while (t >= puffAt && puffAt < 3) {
        const [px, py] = P2(60 + Math.random() * 180, 84);
        puff(px, py, false);
        puffAt += 0.22;
      }
      for (let i = 0; i < NP; i++) {
        const q = puffs[i];
        if (q.life <= 0) continue;
        q.age += dt;
        if (q.age >= q.life) { q.life = 0; continue; }
        q.x += (q.vx + Math.sin(q.age * 2 + i) * 20 * s) * dt;
        q.y += q.vy * dt;
        const r = q.r + q.age * 55 * s;
        ctx.globalAlpha = 0.32 * Math.sin(Math.PI * (q.age / q.life));
        ctx.drawImage(smoke, q.x - r, q.y - r + lift, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      // embers rising off the coals
      if (t < 2.9) {
        acc += dt * 40;
        while (acc >= 1) {
          acc -= 1;
          const [ex, ey] = P2(50 + Math.random() * 200, 92);
          P.emit(ex, ey, rand(-25, 25) * s, -rand(150, 360) * s, rand(1.2, 2.3), rand(4, 8) * s, 0.25, -25 * s, 0, 0);
        }
      }
      P.step(dt);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < P.n; i++) {
        if (P.life[i] <= 0) continue;
        const f = P.age[i] / P.life[i];
        P.x[i] += Math.sin(P.age[i] * 4 + i) * 34 * s * dt;
        const c = f < 0.22 ? 0 : f < 0.5 ? 1 : f < 0.78 ? 2 : 3;
        const a = Math.min(1, f * 10) * (1 - f) ** 0.6 * (0.72 + 0.28 * Math.sin(P.age[i] * 26 + i));
        const r = P.size[i] * (1 - 0.45 * f);
        ctx.globalAlpha = a;
        ctx.drawImage(E[c], P.x[i] - r, P.y[i] - r + lift, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  return fx;
}

const BOK_PAPER = [['#00a862', '#006b3c'], ['#0b7d4b', '#044a2b'], ['#ffb612', '#cc8a00'], ['#ffd75e', '#e0a400'], ['#ffffff', '#d8dde6'], ['#ffe9a0', '#d9a400']];

/** Skrum: Springbok green and gold. A big 🏉 spins in on a turning gold sunburst, ripple rings and a confetti burst. */
function skrumFx(env) {
  const { doc, W, H, s, dpr, ctx: c0 } = env;
  const cx = W * 0.5;
  const cy = H * 0.42;
  const ball = rugbySprite(doc, Math.round(190 * s * dpr));
  const glow = glowSprite(doc, '#ffd23f');
  const paper = confetti(env, 220, BOK_PAPER);
  const glints = twinkles(env, 20, ['#fff3b0', '#ffffff', '#ffd23f'], 0.12, 0.2, 0.88, 0.66, 15);
  const R = Math.hypot(W, H) * 0.7;
  const rays = c0.createRadialGradient(0, 0, 0, 0, 0, R);   // made once, centred on the origin: it turns with the rays
  rays.addColorStop(0, 'rgba(255,220,100,0.6)');
  rays.addColorStop(0.45, 'rgba(255,196,40,0.22)');
  rays.addColorStop(1, 'rgba(255,196,40,0)');
  const NR = 14;
  const rings = [0.1, 0.42, 0.76, 1.45, 2.15];
  const RC = ['#ffc928', '#1fbf6a', '#ffffff'];
  let fired = 0;
  const fx = {
    flash: 0,
    step(ctx, t, dt) {
      if (fired === 0 && t >= 0.1) { paper.fire(150, cx, cy, -Math.PI / 2, Math.PI, H * 0.95, H * 2.1, 0.06); fired = 1; fx.flash = 0.6; }
      if (fired === 1 && t >= 0.8) { paper.fire(70, cx, cy, -Math.PI / 2, Math.PI, H * 0.65, H * 1.5, 0.06); fired = 2; fx.flash = 0.3; }
      // the sunburst
      const sc = easeOutCubic(Math.min(1, t / 0.5));
      const rot = t * 0.4;
      const cr = Math.cos(rot) * dpr * sc;
      const sr = Math.sin(rot) * dpr * sc;
      ctx.setTransform(cr, sr, -sr, cr, cx * dpr, cy * dpr);
      ctx.fillStyle = rays;
      ctx.beginPath();
      for (let i = 0; i < NR; i++) {
        const a0 = (i / NR) * TAU;
        const a1 = a0 + TAU / NR / 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
        ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
        ctx.closePath();
      }
      ctx.fill();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // ripple rings
      for (let k = 0; k < rings.length; k++) {
        const p = (t - rings[k]) / 1.15;
        if (p < 0 || p > 1) continue;
        const r = 60 * s + easeOutCubic(p) * R * 0.85;
        ring(ctx, cx, cy, r, (16 * (1 - p) + 2) * s, RC[k % 3], (1 - p) ** 1.3 * 0.9);
      }
      ctx.globalAlpha = 1;
      paper.step(ctx, dt);
      // the ball: pops in with a glow, spins fast, settles into a happy bob
      ctx.globalCompositeOperation = 'lighter';
      const gr = 175 * s * (0.8 + 0.08 * Math.sin(t * 5));
      ctx.globalAlpha = 0.7 * sc;
      ctx.drawImage(glow, cx - gr, cy - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      glints.step(ctx, t, 0.3);
      ctx.globalCompositeOperation = 'source-over';
      const pin = t < 0.45 ? easeOutBack(t / 0.45) : 1;
      const bs = 190 * s * pin * (1 + 0.04 * Math.sin(t * 4));
      if (bs > 1) stamp(ctx, dpr, ball, cx, cy + Math.sin(t * 3) * 6 * s, bs, bs, 7 * Math.PI * (1 - Math.exp(-2.4 * t)) - 0.4);
    },
  };
  return fx;
}

/** A jagged lightning path (midpoint displacement) from (x0, y0) to (x1, y1), its points into `pts`. */
function jag(x0, y0, x1, y1, rough, levels) {
  let pts = [x0, y0, x1, y1];
  for (let l = 0; l < levels; l++) {
    const out = [pts[0], pts[1]];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i];
      const ay = pts[i + 1];
      const bx = pts[i + 2];
      const by = pts[i + 3];
      const len = Math.hypot(bx - ax, by - ay);
      const off = (Math.random() * 2 - 1) * len * rough;
      out.push((ax + bx) / 2 + ((ay - by) / (len || 1)) * off, (ay + by) / 2 + ((bx - ax) / (len || 1)) * off, bx, by);
    }
    pts = out;
  }
  return pts;
}
function addPath(p, pts) {
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
}
function boltAlpha(age) {
  if (age < 0) return 0;
  if (age < 0.05) return 1;
  if (age < 0.09) return 0.25;
  if (age < 0.2) return 1;
  return Math.max(0, 1 - (age - 0.2) / 0.32);
}
const SPARK_A = [1, 0.62, 0.3];
const SPARK_C = ['#ffffff', '#bfe9ff', '#7fc8ff'];

/** Weerlig: the screen goes dark, branching bolts strike down with a flash, sparks fly at every impact; a big finale. */
function weerligFx(env) {
  const { doc, W, H, s } = env;
  const plan = [
    { t: 0.12, x: 0.3 }, { t: 0.55, x: 0.74 }, { t: 0.98, x: 0.45 }, { t: 1.38, x: 0.18 }, { t: 1.72, x: 0.84 }, { t: 2.15, x: 0.5, big: true },
  ];
  const imp = glowSprite(doc, '#7fc8ff');
  const cloud = softSprite(doc, '#a8c8ff', 0.75);
  const P = sparks(220);
  const zap = twinkles(env, 14, ['#bfe9ff', '#ffffff'], 0.08, 0.55, 0.92, 0.95, 12);
  function strike(b) {
    const x0 = (b.x + rand(-0.08, 0.08)) * W;
    const x1 = b.big ? W * 0.5 : (b.x + rand(-0.12, 0.12)) * W;
    const y1 = H * (b.big ? 0.9 : rand(0.84, 0.93));
    const main = jag(x0, -20, x1, y1, 0.2, 6);
    b.main = new Path2D();
    addPath(b.main, main);
    b.br = new Path2D();
    const nb = b.big ? 6 : 3 + ((Math.random() * 2) | 0);
    for (let i = 0; i < nb; i++) {
      const j = 2 * (8 + ((Math.random() * (main.length / 2 - 24)) | 0));
      const sx = main[j];
      const sy = main[j + 1];
      const dir = Math.atan2(y1 + 20, x1 - x0) + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.8);
      const len = H * rand(0.12, 0.3);
      addPath(b.br, jag(sx, sy, sx + Math.cos(dir) * len, sy + Math.sin(dir) * len, 0.25, 4));
    }
    b.x0 = x0;
    b.x1 = x1;
    b.y1 = y1;
    const n = b.big ? 70 : 36;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-1.3, 1.3);
      const v = rand(220, b.big ? 900 : 680) * s;
      P.emit(x1, y1, Math.cos(a) * v, Math.sin(a) * v, rand(0.35, 0.85), 1, 1.3, 1500 * s, 0);
    }
  }
  const fx = {
    flash: 0,
    tintAt: (t) => Math.min(1, t / 0.12),
    step(ctx, t, dt) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let i = 0; i < plan.length; i++) {
        const b = plan[i];
        if (t < b.t) continue;
        if (!b.main) strike(b);
        const age = t - b.t;
        if (age > 0.55) continue;
        const a = boltAlpha(age);
        fx.flash = Math.max(fx.flash, a * (b.big ? 0.75 : 0.5) * (age < 0.2 ? 1 : 0.3));
        if (a <= 0) continue;
        const m = b.big ? 1.6 : 1;
        ctx.globalAlpha = a * 0.7;
        ctx.drawImage(cloud, b.x0 - W * 0.55, -H * 0.2, W * 1.1, H * 0.4);
        ctx.globalAlpha = a;
        ctx.strokeStyle = 'rgba(70,130,255,0.22)';
        ctx.lineWidth = 24 * s * m;
        ctx.stroke(b.main);
        ctx.lineWidth = 12 * s * m;
        ctx.stroke(b.br);
        ctx.strokeStyle = 'rgba(130,195,255,0.55)';
        ctx.lineWidth = 8 * s * m;
        ctx.stroke(b.main);
        ctx.lineWidth = 4 * s * m;
        ctx.stroke(b.br);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.8 * s * m;
        ctx.stroke(b.main);
        ctx.lineWidth = 1.6 * s * m;
        ctx.stroke(b.br);
        // the impact: a glow and a ring along the ground
        const R = W * 0.42 * m;
        ctx.drawImage(imp, b.x1 - R, b.y1 - R * 0.7, R * 2, R * 1.4);
        const p = age / 0.55;
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.strokeStyle = '#9fdcff';
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.ellipse(b.x1, b.y1, (20 + easeOutCubic(p) * 160 * m) * s, (5 + easeOutCubic(p) * 34 * m) * s, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // the sparks: short bright streaks, three brightness buckets (three strokes a frame)
      P.step(dt);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let i = 0; i < P.n; i++) {
          if (P.life[i] <= 0) continue;
          const f = 1 - P.age[i] / P.life[i];
          if ((f > 0.66 ? 0 : f > 0.33 ? 1 : 2) !== k) continue;
          ctx.moveTo(P.x[i], P.y[i]);
          ctx.lineTo(P.x[i] - P.vx[i] * 0.024, P.y[i] - P.vy[i] * 0.024);
        }
        ctx.globalAlpha = SPARK_A[k];
        ctx.strokeStyle = SPARK_C[k];
        ctx.lineWidth = (2.8 - k * 0.6) * s;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      zap.step(ctx, t, 0.3);
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  return fx;
}

/** Goudreen: a jackpot fountain of gold coins, then a shower of them: flipping, glinting, bouncing once; gold dust. */
function goudreenFx(env) {
  const { doc, W, H, s, dpr } = env;
  const D = Math.round(64 * s * dpr);
  const face = coinFace(doc, D);
  const edge = coinEdge(doc, D);
  const glint = sparkSprite(doc, '#ffffff');
  const dust = twinkles(env, 34, ['#ffe680', '#ffffff', '#ffd23f'], 0.02, 0.02, 0.98, 0.9, 11, 60);
  const N = 92;
  const FOUNT = 30;
  const coins = [];
  for (let i = 0; i < N; i++) {
    const f = i < FOUNT;
    coins.push({
      t0: f ? rand(0, 0.3) : 0.3 + ((i - FOUNT) / (N - FOUNT)) * 1.9 + rand(0, 0.15),
      r: rand(14, 32) * s, f, live: false, dead: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, a: 0, va: 0, ph: 0, vf: 0, bounced: false,
    });
  }
  coins.sort((a, b) => a.r - b.r);   // small (far) coins first, big ones on top
  const fx = {
    flash: 0,
    step(ctx, t, dt) {
      if (t < 0.05) fx.flash = 0.6;
      const floor = H * 0.97;
      for (let i = 0; i < N; i++) {
        const c = coins[i];
        if (c.dead || t < c.t0) continue;
        if (!c.live) {
          c.live = true;
          if (c.f) {
            c.x = W * 0.5 + rand(-20, 20) * s;
            c.y = H + c.r;
            c.vx = rand(-0.55, 0.55) * W;
            c.vy = -rand(1.35, 1.95) * H;
            c.g = 1700 * s;
          } else {
            c.x = rand(0.04, 0.96) * W;
            c.y = -c.r * 1.5;
            c.vx = rand(-40, 40) * s;
            c.vy = rand(220, 420) * s;
            c.g = 760 * s;
          }
          c.a = rand(-0.5, 0.5);
          c.va = rand(-2.5, 2.5);
          c.ph = Math.random() * TAU;
          c.vf = rand(6, 13) * (Math.random() < 0.5 ? -1 : 1);
        }
        c.vy += c.g * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.a += c.va * dt;
        c.ph += c.vf * dt;
        if (!c.bounced && c.vy > 0 && c.y > floor - c.r * 0.6) {   // one bounce off the bottom, a clink
          c.y = floor - c.r * 0.6;
          c.vy *= -0.34;
          c.vx *= 0.6;
          c.vf *= 1.5;
          c.bounced = true;
        }
        if (c.y > H + c.r * 2) { c.dead = true; continue; }
        const cs = Math.cos(c.ph);
        let sx = Math.abs(cs);
        if (sx < 0.07) sx = 0.07;
        const ca = Math.cos(c.a);
        const sa = Math.sin(c.a);
        const th = c.r * 0.17 * Math.sin(c.ph);
        ctx.setTransform(dpr * ca * sx, dpr * sa * sx, -dpr * sa, dpr * ca, dpr * (c.x + ca * th), dpr * (c.y + sa * th));
        ctx.drawImage(edge, -c.r, -c.r, c.r * 2, c.r * 2);
        ctx.setTransform(dpr * ca * sx, dpr * sa * sx, -dpr * sa, dpr * ca, dpr * c.x, dpr * c.y);
        ctx.drawImage(face, -c.r, -c.r, c.r * 2, c.r * 2);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // a glint on every coin that turns its face to us
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        const c = coins[i];
        if (!c.live || c.dead) continue;
        const cs = Math.abs(Math.cos(c.ph));
        if (cs < 0.9) continue;
        const r = c.r * (cs - 0.9) * 10;
        ctx.globalAlpha = (cs - 0.9) * 10;
        ctx.drawImage(glint, c.x - c.r * 0.35 - r, c.y - c.r * 0.35 - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      dust.step(ctx, t, 0.1);
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  return fx;
}

const NEON = ['#ff2bd6', '#19f0ff', '#3dff7a'];
const NEON_WIDE = NEON.map((c) => rgba(c, 0.11));
const NEON_MID = NEON.map((c) => rgba(c, 0.38));
const NEON_CORE = ['#ffd6f7', '#d9fdff', '#dcffe6'];

/** Laser: a neon laser show from the bottom corners on a beat, flashes and haze; the beams meet in a starburst. */
function laserFx(env) {
  const { doc, W, H, s } = env;
  const BEAT = 0.45;
  const BURST = 2.7;
  const bx = W * 0.5;
  const by = H * 0.36;
  const L = Math.hypot(W, H) * 1.25;
  const em = [{ x: -4 * s, y: H + 4 * s, side: 1 }, { x: W + 4 * s, y: H + 4 * s, side: -1 }, { x: W * 0.5, y: H + 12 * s, side: 0 }];
  const hot = NEON.map((c) => glowSprite(doc, c));
  const white = glowSprite(doc, '#ffffff');
  const star = sparkSprite(doc, '#ffffff');
  const hz = [softSprite(doc, '#ff2bd6', 0.42), softSprite(doc, '#19f0ff', 0.42), softSprite(doc, '#8a3dff', 0.5)];
  const haze = [];
  for (let i = 0; i < 4; i++) haze.push({ x: rand(0.1, 0.9) * W, y: rand(0.5, 1) * H, r: rand(120, 190) * s, vx: rand(-25, 25) * s, img: hz[i % 3] });
  const dust = twinkles(env, 30, ['#ffffff', '#bff8ff', '#ffc6f2'], 0.02, 0.05, 0.98, 0.95, 8);
  const P = sparks(110);
  const imgs = [hot[0], hot[1], hot[2], white];
  let beat = -1;
  let boom = false;
  const fx = {
    flash: 0,
    step(ctx, t, dt) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < haze.length; i++) {
        const h = haze[i];
        h.x += h.vx * dt;
        ctx.globalAlpha = Math.min(1, t / 0.4) * (0.55 + 0.25 * Math.sin(t * 2 + i));
        ctx.drawImage(h.img, h.x - h.r, h.y - h.r, h.r * 2, h.r * 2);
      }
      ctx.globalAlpha = 1;
      if (t < BURST) {
        const b = Math.floor(t / BEAT);
        if (b !== beat) { beat = b; fx.flash = Math.max(fx.flash, b ? 0.22 : 0.35); }
        const inten = Math.min(1, t / 0.15) * (0.72 + 0.28 * Math.exp(-(t - b * BEAT) * 7));
        const pat = b % 3;
        const w = smooth(clamp01((t - (BURST - 0.4)) / 0.4));   // the last moments: every beam swings to the burst
        ctx.lineCap = 'round';
        for (let e = 0; e < 3; e++) {
          const o = em[e];
          if (o.side === 0 && b < 2) continue;
          const ci = (b + e) % 3;
          let base;
          let spread;
          let nb;
          if (o.side === 0) {
            base = -Math.PI / 2 + 0.55 * Math.sin(t * 2.8);
            spread = pat === 1 ? 0.5 : 0.17;
            nb = pat === 1 ? 2 : 5;
          } else if (pat === 0) {
            base = -Math.PI / 2 + o.side * (0.55 + 0.32 * Math.sin(t * 2.4));
            spread = 0.13;
            nb = 4;
          } else if (pat === 1) {
            base = -Math.PI / 2 + o.side * (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 4.4)));
            spread = 0.06;
            nb = 3;
          } else {
            base = -Math.PI / 2 + o.side * (0.62 + 0.16 * Math.sin(t * 3.1));
            spread = 0.21;
            nb = 5;
          }
          if (w > 0) {
            const aim = Math.atan2(by - o.y, bx - o.x);
            base += (aim - base) * w;
            spread *= 1 - w;
          }
          ctx.beginPath();
          for (let k = 0; k < nb; k++) {
            const a = base + (k - (nb - 1) / 2) * spread;
            ctx.moveTo(o.x, o.y);
            ctx.lineTo(o.x + Math.cos(a) * L, o.y + Math.sin(a) * L);
          }
          ctx.globalAlpha = inten;
          ctx.strokeStyle = NEON_WIDE[ci];
          ctx.lineWidth = 20 * s;
          ctx.stroke();
          ctx.strokeStyle = NEON_MID[ci];
          ctx.lineWidth = 6.5 * s;
          ctx.stroke();
          ctx.strokeStyle = NEON_CORE[ci];
          ctx.lineWidth = 2 * s;
          ctx.stroke();
          const hr = 95 * s * inten;
          ctx.drawImage(hot[ci], o.x - hr, o.y - hr, hr * 2, hr * 2);
        }
        ctx.globalAlpha = 1;
      } else {
        const age = t - BURST;
        if (!boom) {
          boom = true;
          fx.flash = 0.65;
          for (let i = 0; i < 96; i++) {
            const a = rand(0, TAU);
            const v = rand(280, 980) * s;
            P.emit(bx, by, Math.cos(a) * v, Math.sin(a) * v, rand(0.7, 1.15), rand(7, 11) * s, 2.3, 90 * s, i % 4, 1);
          }
        }
        // the starburst: rays out of the meeting point, three colours, turning
        const len = easeOutCubic(Math.min(1, age / 0.5)) * L * 0.55;
        const fade = Math.max(0, 1 - age / 0.85);
        if (fade > 0) {
          ctx.lineCap = 'round';
          for (let ci = 0; ci < 3; ci++) {
            ctx.beginPath();
            for (let k = ci; k < 24; k += 3) {
              const a = (k / 24) * TAU + age * 0.7;
              ctx.moveTo(bx + Math.cos(a) * 20 * s, by + Math.sin(a) * 20 * s);
              ctx.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len);
            }
            ctx.globalAlpha = fade;
            ctx.strokeStyle = NEON_MID[ci];
            ctx.lineWidth = 9 * s;
            ctx.stroke();
            ctx.strokeStyle = NEON_CORE[ci];
            ctx.lineWidth = 2.4 * s;
            ctx.stroke();
          }
          const gr = W * (0.2 + age * 0.4);
          ctx.globalAlpha = fade * 0.8;
          ctx.drawImage(white, bx - gr, by - gr, gr * 2, gr * 2);
          const sr = W * 0.3 * (0.6 + 0.4 * fade);
          ctx.globalAlpha = fade;
          ctx.drawImage(star, bx - sr, by - sr, sr * 2, sr * 2);
          ctx.globalAlpha = 1;
        }
        P.step(dt);
        P.draw(ctx, imgs);
      }
      dust.step(ctx, t, 0.2);
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  return fx;
}

const COSMOS = ['#ffffff', '#ffd56b', '#ff8ad8', '#b07cff', '#6f8bff', '#4fd2ff'];

/**
 * Sterrestof (the legendary): a galaxy of glowing stardust spirals in faster and faster, then bursts: a flash, shock
 * rings, a big gold star with lens flares, and the dust twinkling out across the screen.
 */
function sterrestofFx(env) {
  const { doc, W, H, s, dpr } = env;
  const cx = W * 0.5;
  const cy = H * 0.42;
  const T1 = 1.5;
  const imgs = COSMOS.map((c) => glowSprite(doc, c));
  const core = glowSprite(doc, '#e9d4ff');
  const flare = glowSprite(doc, '#ffe7b0');
  const star = bigStar(doc, 256);
  const sky = nightSky(env, 46, 1);
  const shine = twinkles(env, 16, ['#ffffff', '#ffe6a0', '#e2c8ff'], 0.18, 0.26, 0.82, 0.58, 16);
  const N = 230;
  const Rmax = Math.max(W, H) * 0.62;
  const r0 = new Float32Array(N);
  const ang = new Float32Array(N);
  const X = new Float32Array(N);
  const Y = new Float32Array(N);
  const VX = new Float32Array(N);
  const VY = new Float32Array(N);
  const C = new Uint8Array(N);
  const SZ = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const arm = i % 3;
    const q = 0.1 + 0.9 * Math.random() ** 0.8;
    r0[i] = Rmax * q;
    ang[i] = (arm * TAU) / 3 + q * 3.4 + rand(-0.28, 0.28);
    C[i] = q < 0.28 ? (Math.random() < 0.5 ? 0 : 1) : q < 0.6 ? 2 + ((Math.random() * 2) | 0) : 4 + ((Math.random() * 2) | 0);
    SZ[i] = rand(4, 8.5) * s;
  }
  let boom = false;
  const fx = {
    trail: 9,
    flash: 0,
    step(ctx, t, dt, top) {
      sky.step(top, t);
      ctx.globalCompositeOperation = 'lighter';
      top.globalCompositeOperation = 'lighter';
      if (t < T1) {
        const p = t / T1;
        const pin = p ** 1.7;
        const on = Math.min(1, t / 0.3);
        for (let i = 0; i < N; i++) {
          const rr = r0[i] * (1 - 0.94 * pin);
          ang[i] += 0.75 * (Rmax / (rr + 30 * s)) ** 0.7 * dt * (1 + 1.6 * p);
          X[i] = cx + Math.cos(ang[i]) * rr;
          Y[i] = cy + Math.sin(ang[i]) * rr * 0.58;
          const r = SZ[i] * (0.8 + 0.4 * p);
          ctx.globalAlpha = on * (0.65 + 0.35 * Math.sin(t * 6 + i));
          ctx.drawImage(imgs[C[i]], X[i] - r, Y[i] - r, r * 2, r * 2);
        }
        const g = (40 + 190 * p * p) * s;
        top.globalAlpha = on * (0.35 + 0.6 * p);
        top.drawImage(core, cx - g, cy - g * 0.75, g * 2, g * 1.5);
        top.globalAlpha = 1;
      } else {
        const age = t - T1;
        if (!boom) {
          boom = true;
          fx.flash = 0.95;
          for (let i = 0; i < N; i++) {
            const a = Math.atan2((Y[i] - cy) / 0.58, X[i] - cx) + 0.35;
            const v = rand(240, 1150) * s;
            VX[i] = Math.cos(a) * v;
            VY[i] = Math.sin(a) * v * 0.85;
          }
        }
        const d = Math.exp(-1.7 * dt);
        for (let i = 0; i < N; i++) {
          VX[i] *= d;
          VY[i] = VY[i] * d + 12 * s * dt;
          X[i] += VX[i] * dt;
          Y[i] += VY[i] * dt;
          const tw = 0.5 + 0.5 * Math.sin(t * (5 + (i % 7)) + i);
          const r = SZ[i] * (age < 0.3 ? 1.5 - age * 1.6 : 1.02) * (0.6 + 0.4 * tw);
          ctx.globalAlpha = 0.35 + 0.65 * tw;
          ctx.drawImage(imgs[C[i]], X[i] - r, Y[i] - r, r * 2, r * 2);
        }
        // shock rings
        for (let k = 0; k < 2; k++) {
          const q = (age - k * 0.13) / 1.1;
          if (q < 0 || q > 1) continue;
          ring(top, cx, cy, easeOutCubic(q) * Rmax * 1.25, (20 * (1 - q) + 1.5) * s, k ? '#b884ff' : '#ffd56b', (1 - q) ** 1.4 * 0.9);
        }
        // the big star, its glow and its lens flares
        const sc = easeOutBack(Math.min(1, age / 0.55));
        const pulse = 1 + 0.05 * Math.sin(t * 5);
        const gr = W * 0.62 * sc * pulse;
        top.globalAlpha = 0.75;
        top.drawImage(core, cx - gr, cy - gr, gr * 2, gr * 2);
        top.globalAlpha = 0.85 * Math.min(1, age / 0.3);
        const fw = W * 1.15 * sc * pulse;
        top.drawImage(flare, cx - fw / 2, cy - 9 * s, fw, 18 * s);
        top.drawImage(flare, cx - 7 * s, cy - fw * 0.36, 14 * s, fw * 0.72);
        top.globalAlpha = 1;
        top.globalCompositeOperation = 'source-over';
        const ss = W * 0.5 * sc * pulse;
        if (ss > 1) stamp(top, dpr, star, cx, cy, ss, ss, age * 0.35);
        top.globalCompositeOperation = 'lighter';
        shine.step(top, t, T1 + 0.15);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      top.globalCompositeOperation = 'source-over';
    },
  };
  return fx;
}

const FX = { konfetti: konfettiFx, vuurwerk: vuurwerkFx, vuvuzela: proteaFx, braai: braaiFx, skrum: skrumFx, weerlig: weerligFx, goudreen: goudreenFx, laser: laserFx, sterrestof: sterrestofFx };

// ---------------------------------------------------------------------------
// The shop tiles: rounded-square art in a 100 x 100 space
// ---------------------------------------------------------------------------

/** The tile: a rich gradient, a glow behind the motif; `finish` adds the gloss and the rim. */
function tile(x, top, bottom, glow) {
  roundRect(x, 0, 0, 100, 100, 22);
  x.save();
  x.clip();
  const g = x.createLinearGradient(25, 0, 75, 100);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  x.fillStyle = g;
  x.fillRect(0, 0, 100, 100);
  if (glow) {
    const [gx, gy, gr, gc, ga = 0.75] = glow;
    const r = x.createRadialGradient(gx, gy, 0, gx, gy, gr);
    r.addColorStop(0, rgba(gc, ga));
    r.addColorStop(1, rgba(gc, 0));
    x.fillStyle = r;
    x.fillRect(0, 0, 100, 100);
  }
}
function finish(x, rim) {
  const g = x.createLinearGradient(0, 0, 0, 52);
  g.addColorStop(0, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 100, 52);
  const v = x.createLinearGradient(0, 70, 0, 100);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.18)');
  x.fillStyle = v;
  x.fillRect(0, 70, 100, 30);
  x.restore();
  roundRect(x, 1.5, 1.5, 97, 97, 20.5);
  x.lineWidth = rim ? 3.2 : 2;
  x.strokeStyle = rim || 'rgba(255,255,255,0.3)';
  x.stroke();
}
function sparkle(x, cx, cy, r, color = '#ffffff') {
  x.save();
  x.globalCompositeOperation = 'lighter';
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r * 0.6);
  g.addColorStop(0, rgba(color === '#ffffff' ? '#ffffff' : color, 0.8));
  g.addColorStop(1, rgba(color === '#ffffff' ? '#ffffff' : color, 0));
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
  const k = r * 0.1;
  x.beginPath();
  x.moveTo(cx, cy - r);
  x.quadraticCurveTo(cx + k, cy - k, cx + r, cy);
  x.quadraticCurveTo(cx + k, cy + k, cx, cy + r);
  x.quadraticCurveTo(cx - k, cy + k, cx - r, cy);
  x.quadraticCurveTo(cx - k, cy - k, cx, cy - r);
  x.fillStyle = '#ffffff';
  x.fill();
  x.restore();
}
function tileDot(doc, hex) {
  return sprite(doc, `td${hex}`, 32, 32, (x) => {
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, rgba(hex, 1));
    g.addColorStop(0.35, rgba(hex, 0.75));
    g.addColorStop(1, rgba(hex, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
  }, true);
}
function iconCoin(x, cx, cy, r, sx, rot) {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(sx, 1);
  x.fillStyle = '#9a6406';
  x.beginPath();
  x.arc(r * 0.22, 0, r, 0, TAU);
  x.fill();
  const g = x.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
  g.addColorStop(0, '#fff7c9');
  g.addColorStop(0.35, '#ffd84a');
  g.addColorStop(0.8, '#eaa514');
  g.addColorStop(1, '#b67606');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, r, 0, TAU);
  x.fill();
  x.lineWidth = r * 0.12;
  x.strokeStyle = '#c4850a';
  x.beginPath();
  x.arc(0, 0, r * 0.82, 0, TAU);
  x.stroke();
  starPath(x, 0, r * 0.03, r * 0.46, r * 0.2);
  x.fillStyle = '#fff1a8';
  x.fill();
  x.lineWidth = r * 0.05;
  x.strokeStyle = 'rgba(150,90,0,0.6)';
  x.stroke();
  x.restore();
}

const ICONS = {
  konfetti(x) {
    const rnd = seeded(11);
    tile(x, '#ff5aa0', '#6a2cf0', [62, 36, 62, '#ffd23f', 0.7]);
    const cols = ['#ffffff', '#ffd23f', '#3fe0ff', '#7dff7a', '#ff8a3d', '#ff3b6b', '#b98bff'];
    // streamers curling out of the popper
    x.lineCap = 'round';
    x.lineWidth = 3.8;
    for (const [c, p] of [['#3fe0ff', [38, 58, 26, 36, 58, 44, 50, 14]], ['#ffd23f', [42, 62, 64, 62, 62, 34, 88, 30]]]) {
      x.strokeStyle = c;
      x.beginPath();
      x.moveTo(p[0], p[1]);
      x.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
      x.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const a = -1.45 + rnd() * 1.55;
      const d = 16 + rnd() * 54;
      const px = 34 + Math.cos(a) * d;
      const py = 64 + Math.sin(a) * d;
      x.save();
      x.translate(px, py);
      x.rotate(rnd() * TAU);
      x.fillStyle = cols[i % cols.length];
      const k = rnd();
      if (k < 0.55) x.fillRect(-4, -2.6, 8, 5.2);
      else if (k < 0.85) x.fillRect(-1.6, -5.5, 3.2, 11);
      else { x.beginPath(); x.arc(0, 0, 3, 0, TAU); x.fill(); }
      x.restore();
    }
    // the popper: a striped gold cone pointing up and to the right
    x.save();
    x.translate(27, 75);
    x.rotate(0.72);
    x.beginPath();
    x.moveTo(0, 22);
    x.lineTo(13, -14);
    x.lineTo(-13, -14);
    x.closePath();
    const g = x.createLinearGradient(-13, 0, 13, 0);
    g.addColorStop(0, '#ffe98a');
    g.addColorStop(0.55, '#ffc21a');
    g.addColorStop(1, '#d98a00');
    x.fillStyle = g;
    x.fill();
    x.save();
    x.clip();
    x.fillStyle = '#ff3b6b';
    for (let k = -3; k < 4; k++) {
      x.beginPath();
      x.moveTo(-20, k * 9 - 6);
      x.lineTo(20, k * 9 + 6);
      x.lineTo(20, k * 9 + 10);
      x.lineTo(-20, k * 9 - 2);
      x.closePath();
      x.fill();
    }
    x.restore();
    x.fillStyle = '#5a1030';
    x.beginPath();
    x.ellipse(0, -14, 13, 4.6, 0, 0, TAU);
    x.fill();
    x.lineWidth = 2.4;
    x.strokeStyle = '#fff1b0';
    x.stroke();
    x.restore();
    sparkle(x, 74, 22, 9);
    sparkle(x, 86, 52, 6);
    sparkle(x, 52, 14, 5);
    finish(x);
  },

  vuurwerk(x) {
    const rnd = seeded(7);
    tile(x, '#3a1f8a', '#05061c', [56, 40, 58, '#7a3cff', 0.55]);
    x.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      x.globalAlpha = 0.3 + rnd() * 0.5;
      x.fillRect(rnd() * 100, rnd() * 100, 1.2, 1.2);
    }
    x.globalAlpha = 1;
    // the rocket's trail up to the big burst
    x.save();
    x.globalCompositeOperation = 'lighter';
    const tr = x.createLinearGradient(66, 100, 58, 50);
    tr.addColorStop(0, 'rgba(255,220,140,0)');
    tr.addColorStop(1, 'rgba(255,230,170,0.9)');
    x.strokeStyle = tr;
    x.lineWidth = 2.2;
    x.beginPath();
    x.moveTo(68, 100);
    x.quadraticCurveTo(62, 76, 58, 52);
    x.stroke();
    const burst = (bx, by, R, n, c, c2) => {
      const gl = x.createRadialGradient(bx, by, 0, bx, by, R * 1.25);
      gl.addColorStop(0, rgba(c, 0.55));
      gl.addColorStop(1, rgba(c, 0));
      x.fillStyle = gl;
      x.fillRect(bx - R * 1.3, by - R * 1.3, R * 2.6, R * 2.6);
      x.lineCap = 'round';
      const rg = x.createRadialGradient(bx, by, R * 0.15, bx, by, R);   // the rays brighten towards their tips
      rg.addColorStop(0, rgba(c, 0));
      rg.addColorStop(1, rgba(c, 1));
      x.strokeStyle = rg;
      x.lineWidth = 2.4;
      x.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.2;
        x.moveTo(bx + Math.cos(a) * R * 0.2, by + Math.sin(a) * R * 0.2);
        x.lineTo(bx + Math.cos(a) * R * 0.92, by + Math.sin(a) * R * 0.92);
      }
      x.stroke();
      x.fillStyle = c2;
      x.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.2;
        x.moveTo(bx + Math.cos(a) * R + 2.1, by + Math.sin(a) * R);
        x.arc(bx + Math.cos(a) * R, by + Math.sin(a) * R, 2.1, 0, TAU);
      }
      x.fill();
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(bx, by, R * 0.12, 0, TAU);
      x.fill();
    };
    burst(58, 40, 31, 20, '#ffcf4a', '#fff4c2');
    burst(25, 26, 17, 14, '#ff4fa3', '#ffd1e8');
    burst(27, 70, 15, 12, '#4fd8ff', '#e2fbff');
    burst(84, 76, 10, 10, '#7dff7a', '#e2ffd9');
    x.restore();
    finish(x);
  },

  vuvuzela(x) {
    // (1.15.4) the Protea (the item's id stays): a king protea on a deep berry tile, a soft gold glow behind it
    tile(x, '#7a1946', '#2a0618', [50, 46, 52, '#ffd23f', 0.45]);
    drawProtea(x, 50, 48, 40);
    finish(x);
  },

  braai(x, doc) {
    // (1.15) the drum braai: dusk above, the coals' glow, flames, embers and smoke
    const rnd = seeded(5);
    tile(x, '#2c1240', '#ff6a14', [50, 70, 60, '#ffd04a', 0.9]);
    x.save();
    x.translate(4, 34);
    x.scale(0.307, 0.307);
    drawDrumBraai(x);
    x.restore();
    x.save();
    x.globalCompositeOperation = 'lighter';
    const flame = tileDot(doc, '#ff9a2a');
    const hot = tileDot(doc, '#ffa53a');
    const core = tileDot(doc, '#fff8c8');
    for (let i = 0; i < 9; i++) {                            // flames through the grid
      const fx = 18 + rnd() * 64;
      const fy = 52 + rnd() * 8;
      x.drawImage(flame, fx - 4, fy - 9, 8, 14);
    }
    for (let i = 0; i < 12; i++) {                           // embers rising into the dusk
      const ex = 10 + rnd() * 80;
      const ey = 6 + rnd() * 34;
      const er = 0.9 + rnd() * 1.2;
      x.drawImage(hot, ex - er * 3.2, ey - er * 3.2, er * 6.4, er * 6.4);
      x.drawImage(core, ex - er * 1.2, ey - er * 1.2, er * 2.4, er * 2.4);
    }
    x.restore();
    x.strokeStyle = 'rgba(255,255,255,0.8)';
    x.lineWidth = 2.6;
    x.lineCap = 'round';
    for (const sx of [30, 62]) {
      x.beginPath();
      x.moveTo(sx, 40);
      x.quadraticCurveTo(sx + 5, 33, sx, 26);
      x.quadraticCurveTo(sx - 5, 19, sx, 12);
      x.stroke();
    }
    finish(x);
  },

  skrum(x) {
    const rnd = seeded(3);
    tile(x, '#1cb867', '#03462a', [50, 50, 50, '#ffe27a', 0.6]);
    // the gold sunburst
    x.save();
    x.translate(50, 50);
    x.fillStyle = 'rgba(255,205,60,0.34)';
    x.beginPath();
    for (let i = 0; i < 14; i++) {
      const a0 = (i / 14) * TAU;
      x.moveTo(0, 0);
      x.lineTo(Math.cos(a0) * 80, Math.sin(a0) * 80);
      x.lineTo(Math.cos(a0 + TAU / 28) * 80, Math.sin(a0 + TAU / 28) * 80);
      x.closePath();
    }
    x.fill();
    x.restore();
    for (const [r, a] of [[37, 0.75], [45, 0.4]]) {
      x.globalAlpha = a;
      x.strokeStyle = '#ffd23f';
      x.lineWidth = 3;
      x.beginPath();
      x.arc(50, 50, r, 0, TAU);
      x.stroke();
    }
    x.globalAlpha = 1;
    for (let i = 0; i < 16; i++) {
      x.save();
      x.translate(6 + rnd() * 88, 6 + rnd() * 88);
      x.rotate(rnd() * TAU);
      x.fillStyle = i % 3 ? '#ffc928' : '#ffffff';
      x.fillRect(-3, -1.8, 6, 3.6);
      x.restore();
    }
    // the ball: white leather, Springbok bands, seams
    x.save();
    x.translate(50, 51);
    x.rotate(-0.62);
    x.shadowColor = 'rgba(0,0,0,0.35)';
    x.shadowBlur = 6;
    x.shadowOffsetY = 3;
    x.beginPath();
    x.ellipse(0, 0, 31, 19.5, 0, 0, TAU);
    const g = x.createRadialGradient(-9, -8, 2, 0, 0, 32);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#e9edf2');
    g.addColorStop(1, '#a9b3c0');
    x.fillStyle = g;
    x.fill();
    x.shadowColor = 'transparent';
    x.save();
    x.clip();
    for (const sx of [-1, 1]) {
      x.fillStyle = '#ffb612';
      x.fillRect(sx * 19 - 3, -22, 6, 44);
      x.fillStyle = '#007a4d';
      x.fillRect(sx * 19 + (sx > 0 ? 3 : -6), -22, 3, 44);
    }
    x.restore();
    x.strokeStyle = 'rgba(70,85,100,0.55)';
    x.lineWidth = 1.3;
    x.beginPath();
    x.moveTo(-30, 0);
    x.quadraticCurveTo(0, -3, 30, 0);
    x.stroke();
    x.beginPath();
    x.ellipse(0, 0, 31, 19.5, 0, 0, TAU);
    x.stroke();
    x.restore();
    sparkle(x, 78, 22, 8);
    sparkle(x, 20, 80, 6);
    finish(x);
  },

  weerlig(x) {
    tile(x, '#2347c7', '#040822', [50, 20, 58, '#9fd4ff', 0.7]);
    const rnd = seeded(9);
    x.save();
    x.globalCompositeOperation = 'lighter';
    // thin side branches
    x.lineCap = 'round';
    x.lineJoin = 'round';
    for (const [sx, sy, ex, ey] of [[20, 0, 8, 46], [84, 0, 94, 40]]) {
      const p = jagSeeded(rnd, sx, sy, ex, ey, 0.22, 4);
      x.strokeStyle = 'rgba(140,200,255,0.5)';
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]);
      x.stroke();
      x.strokeStyle = 'rgba(235,248,255,0.95)';
      x.lineWidth = 1.3;
      x.stroke();
    }
    // sparks at the bottom tip
    x.strokeStyle = '#d9f3ff';
    x.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.33;
      x.beginPath();
      x.moveTo(40 + Math.cos(a) * 7, 90 + Math.sin(a) * 7);
      x.lineTo(40 + Math.cos(a) * (14 + rnd() * 8), 90 + Math.sin(a) * (14 + rnd() * 8));
      x.stroke();
    }
    const gl = x.createRadialGradient(40, 92, 0, 40, 92, 24);
    gl.addColorStop(0, 'rgba(200,235,255,0.9)');
    gl.addColorStop(1, 'rgba(100,170,255,0)');
    x.fillStyle = gl;
    x.fillRect(10, 64, 60, 36);
    x.restore();
    // the bolt
    const bolt = () => {
      x.beginPath();
      x.moveTo(60, 5);
      x.lineTo(27, 53);
      x.lineTo(47, 53);
      x.lineTo(37, 93);
      x.lineTo(74, 39);
      x.lineTo(54, 39);
      x.lineTo(68, 5);
      x.closePath();
    };
    x.save();
    x.shadowColor = '#4fc3ff';
    x.shadowBlur = 16;
    bolt();
    const g = x.createLinearGradient(30, 5, 70, 93);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#d4f1ff');
    g.addColorStop(1, '#6fc8ff');
    x.fillStyle = g;
    x.fill();
    x.fill();
    x.shadowBlur = 0;
    x.lineJoin = 'round';
    x.lineWidth = 1.6;
    x.strokeStyle = '#ffffff';
    x.stroke();
    x.restore();
    finish(x, 'rgba(160,215,255,0.75)');
  },

  goudreen(x) {
    tile(x, '#8a5600', '#241200', [50, 42, 62, '#ffd25a', 0.75]);
    // the stack
    for (let k = 0; k < 4; k++) {
      const y = 86 - k * 7;
      x.fillStyle = '#9a6406';
      x.beginPath();
      x.ellipse(50, y + 4, 24, 7.5, 0, 0, TAU);
      x.fill();
      x.fillRect(26, y, 48, 4);
      const g = x.createLinearGradient(26, y - 7, 74, y + 7);
      g.addColorStop(0, '#fff3b0');
      g.addColorStop(0.5, '#ffcf3a');
      g.addColorStop(1, '#d99500');
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(50, y, 24, 7.5, 0, 0, TAU);
      x.fill();
      x.lineWidth = 1.2;
      x.strokeStyle = '#b07206';
      x.stroke();
    }
    // flying coins, turned this way and that
    iconCoin(x, 28, 30, 14, 0.62, -0.4);
    iconCoin(x, 70, 24, 13, 0.95, 0.15);
    iconCoin(x, 80, 54, 9, 0.35, 0.5);
    iconCoin(x, 50, 46, 10, 0.8, -0.2);
    sparkle(x, 36, 20, 8);
    sparkle(x, 76, 15, 6);
    sparkle(x, 62, 62, 7);
    sparkle(x, 16, 56, 5);
    finish(x, 'rgba(255,214,90,0.8)');
  },

  laser(x) {
    tile(x, '#3b0a72', '#05000f', [50, 52, 50, '#a24bff', 0.5]);
    x.save();
    x.globalCompositeOperation = 'lighter';
    const haze = (hx, hy, c) => {
      const g = x.createRadialGradient(hx, hy, 0, hx, hy, 40);
      g.addColorStop(0, rgba(c, 0.6));
      g.addColorStop(1, rgba(c, 0));
      x.fillStyle = g;
      x.fillRect(hx - 40, hy - 40, 80, 80);
    };
    haze(0, 100, '#ff2bd6');
    haze(100, 100, '#19f0ff');
    x.lineCap = 'round';
    const beam = (x0, y0, x1, y1, c) => {
      x.strokeStyle = rgba(c, 0.22);
      x.lineWidth = 8;
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(x1, y1);
      x.stroke();
      x.strokeStyle = rgba(c, 0.6);
      x.lineWidth = 3.4;
      x.stroke();
      x.strokeStyle = '#ffffff';
      x.lineWidth = 1.1;
      x.stroke();
    };
    beam(0, 100, 104, 6, '#19f0ff');
    beam(0, 100, 80, -4, '#3dff7a');
    beam(0, 100, 104, 38, '#ff2bd6');
    beam(100, 100, -4, 8, '#ff2bd6');
    beam(100, 100, 20, -4, '#19f0ff');
    beam(100, 100, -4, 40, '#3dff7a');
    const g = x.createRadialGradient(50, 52, 0, 50, 52, 26);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, 'rgba(255,150,240,0.5)');
    g.addColorStop(1, 'rgba(120,80,255,0)');
    x.fillStyle = g;
    x.fillRect(20, 22, 60, 60);
    x.restore();
    sparkle(x, 50, 53, 18);
    sparkle(x, 22, 24, 5);
    sparkle(x, 80, 18, 4);
    finish(x, 'rgba(230,140,255,0.75)');
  },

  sterrestof(x, doc) {
    const rnd = seeded(21);
    roundRect(x, 0, 0, 100, 100, 22);
    x.save();
    x.clip();
    const bg = x.createRadialGradient(50, 48, 4, 50, 50, 74);
    bg.addColorStop(0, '#5b26b8');
    bg.addColorStop(0.45, '#1f0c55');
    bg.addColorStop(1, '#04021a');
    x.fillStyle = bg;
    x.fillRect(0, 0, 100, 100);
    x.fillStyle = '#ffffff';
    for (let i = 0; i < 30; i++) {
      x.globalAlpha = 0.3 + rnd() * 0.6;
      x.fillRect(rnd() * 100, rnd() * 100, 1.1, 1.1);
    }
    x.globalAlpha = 1;
    // the galaxy: two arms of dust, tilted
    x.save();
    x.globalCompositeOperation = 'lighter';
    x.translate(50, 50);
    x.rotate(-0.42);
    const cols = ['#ffe9a8', '#ff8ad8', '#b07cff', '#6f8bff', '#4fd2ff'];
    const dots = cols.map((c) => tileDot(doc, c));
    for (let i = 0; i < 150; i++) {
      const arm = i % 2;
      const q = rnd();
      const r = 6 + q * 42;
      const a = arm * Math.PI + q * 4.4 + (rnd() - 0.5) * 0.55;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * 0.55;
      const sz = (0.7 + rnd() * 1.6) * (1 - q * 0.45);
      x.drawImage(dots[Math.min(cols.length - 1, (q * cols.length) | 0)], px - sz * 2.6, py - sz * 2.6, sz * 5.2, sz * 5.2);
    }
    x.restore();
    // the core, the star and its flares
    x.save();
    x.globalCompositeOperation = 'lighter';
    const core = x.createRadialGradient(50, 49, 0, 50, 49, 30);
    core.addColorStop(0, 'rgba(255,240,210,0.95)');
    core.addColorStop(0.4, 'rgba(210,150,255,0.45)');
    core.addColorStop(1, 'rgba(140,80,255,0)');
    x.fillStyle = core;
    x.fillRect(0, 0, 100, 100);
    for (const [w, h] of [[88, 2.6], [2.4, 64]]) {
      const f = x.createRadialGradient(50, 49, 0, 50, 49, Math.max(w, h) / 2);
      f.addColorStop(0, 'rgba(255,240,200,0.95)');
      f.addColorStop(1, 'rgba(255,220,160,0)');
      x.fillStyle = f;
      x.fillRect(50 - w / 2, 49 - h / 2, w, h);
    }
    x.restore();
    x.save();
    x.shadowColor = '#ffc94a';
    x.shadowBlur = 12;
    starPath(x, 50, 50, 20, 8.6);
    const sg = x.createRadialGradient(50, 47, 0, 50, 50, 21);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(0.35, '#fff2b0');
    sg.addColorStop(0.75, '#ffcc3a');
    sg.addColorStop(1, '#f39a12');
    x.fillStyle = sg;
    x.lineJoin = 'round';
    x.fill();
    x.shadowBlur = 0;
    x.lineWidth = 1.4;
    x.strokeStyle = '#fff6c8';
    x.stroke();
    x.restore();
    sparkle(x, 20, 22, 7);
    sparkle(x, 82, 76, 6);
    sparkle(x, 80, 20, 4);
    // the legendary's gold rim
    const g = x.createLinearGradient(0, 0, 100, 100);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.5, '#ffb612');
    g.addColorStop(1, '#fff3b0');
    finish(x, g);
  },
};

/** jag() with a seeded random (the tile art stays the same). */
function jagSeeded(rnd, x0, y0, x1, y1, rough, levels) {
  let pts = [x0, y0, x1, y1];
  for (let l = 0; l < levels; l++) {
    const out = [pts[0], pts[1]];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i];
      const ay = pts[i + 1];
      const bx = pts[i + 2];
      const by = pts[i + 3];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const off = (rnd() * 2 - 1) * len * rough;
      out.push((ax + bx) / 2 + ((ay - by) / len) * off, (ay + by) / 2 + ((bx - ax) / len) * off, bx, by);
    }
    pts = out;
  }
  return pts;
}

const ICON_CACHE = new Map();
/** The tile art for `id` at `px` device pixels, drawn once and kept (the Winkel redraws its grid on every buy). */
function iconArt(doc, id, px) {
  const key = `${id}@${px}`;
  let art = ICON_CACHE.get(key);
  if (!art || art.ownerDocument !== doc) {
    art = doc.createElement('canvas');
    art.width = px;
    art.height = px;
    const x = art.getContext('2d', { willReadFrequently: true });   // one-off art: drawn on the CPU, then only copied
    x.setTransform(px / 100, 0, 0, px / 100, 0, 0);
    ICONS[id](x, doc);
    ICON_CACHE.set(key, art);
  }
  return art;
}

/**
 * Draws celebration `id`'s shop tile on `canvas` (unknown ids: konfetti's) and returns the canvas. Size the canvas in
 * CSS (dom.js: canvas.cel-icon); its pixels are its CSS width (or `size` css px; 88 while it isn't in the page yet)
 * times the screen's pixel ratio, so the tile is sharp at any size the CSS gives it.
 */
export function drawCelebrationIcon(canvas, id, size = 0) {
  if (!canvas || typeof canvas.getContext !== 'function') return canvas;
  const key = ICONS[id] ? id : 'konfetti';
  const doc = canvas.ownerDocument || globalThis.document;
  const win = (doc && doc.defaultView) || globalThis;
  const css = size || canvas.clientWidth || 88;
  const px = Math.max(32, Math.round(css * Math.min(ICON_DPR, win.devicePixelRatio || 1)));
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(iconArt(doc, key, px), 0, 0);
  // nothing outside the tile's rounded corners (an arc or a confetti bit drawn past the edge)
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  roundRect(ctx, 0, 0, px, px, px * 0.22);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
  return canvas;
}

// ---------------------------------------------------------------------------
// Playing a show
// ---------------------------------------------------------------------------
const PLAYING = new WeakMap();   // root → the show playing in it (a new one replaces it: no stacked canvases)

function layer(doc, background, extra = '') {
  const d = doc.createElement('div');
  d.style.cssText = `position:absolute;inset:0;opacity:0;pointer-events:none;${background ? `background:${background};` : ''}${extra}`;
  return d;
}
function canvasLayer(doc, W, H, dpr) {
  const c = doc.createElement('canvas');
  c.width = Math.max(1, Math.round(W * dpr));
  c.height = Math.max(1, Math.round(H * dpr));
  c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;';
  return c;
}

/** The caption: a big white pill at the top ("Bennie vier!"); it pops in (fades in with reduced motion). */
function captionEl(doc, text, look, W, reduced) {
  const wrap = doc.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;right:0;top:max(6%, calc(env(safe-area-inset-top, 0px) + 12px));display:flex;justify-content:center;padding:0 5%;box-sizing:border-box;pointer-events:none;';
  const pill = doc.createElement('span');
  pill.className = 'cel-cap';
  pill.textContent = text;
  const fs = Math.round(Math.max(18, Math.min(40, W * 0.068)));
  pill.style.cssText = `display:block;width:auto;max-width:100%;margin:0;box-sizing:border-box;padding:0.3em 0.95em 0.34em;border-radius:1.1em;background:rgba(14,16,36,0.82);color:#fff;font:900 ${fs}px/1.18 var(--font, "Trebuchet MS", system-ui, sans-serif);text-align:center;overflow-wrap:anywhere;letter-spacing:0.01em;text-shadow:0 2px 0 rgba(0,0,0,0.35);box-shadow:0 0 0 2px ${rgba(look.accent, 0.9)},0 8px 26px rgba(0,0,0,0.35),0 0 30px ${rgba(look.accent, 0.55)};`;
  wrap.append(pill);
  if (typeof pill.animate === 'function') {
    pill.animate(reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(-24px) scale(0.6)' }, { opacity: 1, transform: 'translateY(0) scale(1.08)', offset: 0.6 }, { opacity: 1, transform: 'none' }],
    { duration: reduced ? 300 : 520, delay: reduced ? 0 : 120, easing: 'ease-out', fill: 'backwards' });
  }
  return wrap;
}

/**
 * Plays celebration `id` (unknown ids: konfetti) over `root` (a positioned element; the show fills it, above
 * everything, and takes no taps), with an optional `caption` pill at the top. `reduced` (the player's reduced motion):
 * no movement, the screen dimmed, a soft glow with the celebration's emblem and the caption, fading in and out.
 * `skip` (the Winkel's preview): a tap on the show ends it (the tap stays on the show, never reaching a button under it).
 * Removes itself after ~3.6 s; a new show in the same root replaces the old one. Returns a function that stops it at once.
 */
export function playCelebration(root, id, { caption = '', reduced = false, skip = false } = {}) {
  const noop = () => {};
  if (!root || !root.ownerDocument) return noop;
  const doc = root.ownerDocument;
  const win = doc.defaultView || globalThis;
  PLAYING.get(root)?.();
  const key = FX[id] ? id : 'konfetti';
  const look = LOOK[key];
  const box = doc.createElement('div');
  box.className = `celebrate cel-${key}`;
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:absolute;inset:0;z-index:30;pointer-events:none;overflow:hidden;';
  const tint = layer(doc, look.tint);
  const flash = layer(doc, look.flash);
  box.append(tint, flash);
  root.append(box);
  const W = box.clientWidth || win.innerWidth || 390;
  const H = box.clientHeight || win.innerHeight || 844;
  const dpr = Math.min(MAX_DPR, win.devicePixelRatio || 1);
  const s = Math.max(0.7, Math.min(2.2, Math.min(W / 390, H / 720)));
  const cv = canvasLayer(doc, W, H, dpr);
  box.append(cv);
  const ctx = cv.getContext('2d');
  let done = false;
  let raf = 0;
  let timer = 0;
  const stats = { frames: 0, workMs: 0, workMax: 0, gapMs: 0, gapMax: 0 };
  const stop = () => {
    if (done) return;
    done = true;
    if (raf && win.cancelAnimationFrame) win.cancelAnimationFrame(raf);
    clearTimeout(timer);
    box.remove();
    if (PLAYING.get(root) === stop) PLAYING.delete(root);
  };
  stop.stats = stats;
  PLAYING.set(root, stop);
  if (skip) {
    // (1.15.3) a click, not a pointerdown: the show is gone only after the finger lifts, so the click can't land on a
    // Koop button under it
    box.style.pointerEvents = 'auto';
    box.style.touchAction = 'none';
    box.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); stop(); });
  }
  timer = setTimeout(stop, DUR * 1000 + 4000);   // whatever happens (a hidden page runs no frames), the show goes away
  if (caption) box.append(captionEl(doc, String(caption), look, W, reduced));
  if (!ctx) return stop;

  if (reduced) {
    // no motion: the tint, one soft glow and the emblem (the shop tile's art), faded in and out. (1.15.3, the owner's
    // photos: the emblem alone sat on the Winkel's grid like one more tile, hiding a card's name and price) the screen
    // under it dims first, so the emblem reads as a show on top
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(8, 10, 28, 0.66)';
    ctx.fillRect(0, 0, W, H);
    const R = Math.min(W, H) * 0.55;
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, R);
    g.addColorStop(0, rgba(look.accent, 0.55));
    g.addColorStop(1, rgba(look.accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const size = Math.round(Math.min(W, H) * 0.36);
    ctx.drawImage(iconArt(doc, key, Math.round(size * dpr)), W / 2 - size / 2, H * 0.42 - size / 2, size, size);
    tint.style.opacity = look.tint ? '0.7' : '0';
    if (typeof box.animate === 'function') {
      box.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.84 }, { opacity: 0 }], { duration: DUR * 1000, easing: 'linear', fill: 'forwards' });
      flash.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
    }
    clearTimeout(timer);
    timer = setTimeout(stop, DUR * 1000);
    return stop;
  }

  const env = { doc, W, H, s, dpr, ctx };
  let fx;
  try {
    fx = FX[key](env);
  } catch (e) {
    stop();
    throw e;
  }
  let top = ctx;
  let tcv = null;
  if (fx.trail) {   // streaks: this canvas fades a little each frame; a clear one on top holds what mustn't smear
    tcv = canvasLayer(doc, W, H, dpr);
    box.insertBefore(tcv, cv.nextSibling);
    top = tcv.getContext('2d') || ctx;
  }
  let t = 0;
  let last = -1;
  let start = -1;
  let tintOp = -1;
  let flashOp = -1;
  const clock = win.performance && typeof win.performance.now === 'function' ? win.performance : null;
  const frame = (stamp) => {
    if (done) return;
    const now = clock ? clock.now() : stamp;
    if (start < 0) { start = now; last = now; }
    const gap = now - last;
    last = now;
    // a slow frame slows the show rather than skipping it; a phone that can't keep up at all still gets the whole show
    // and its fade-out, about a second late (once it lags that far behind the clock, it catches up)
    const dt = Math.min(gap, (now - start) / 1000 - t > 0.9 ? 250 : 50) / 1000;
    t += dt;
    const w0 = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (fx.trail) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1 - Math.exp(-fx.trail * Math.max(dt, 0.001));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      top.setTransform(1, 0, 0, 1, 0, 0);
      top.clearRect(0, 0, tcv.width, tcv.height);
      top.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try {
      fx.step(ctx, t, dt, top);
    } catch (e) {
      stop();   // decoration only: a broken frame takes the show away, never the screen under it
      throw e;
    }
    // the screen's tint and the bang's flash (opacity only: the compositor's cheap work)
    const ti = look.tint ? (fx.tintAt ? fx.tintAt(t) : Math.min(1, t / 0.3)) : 0;
    if (Math.abs(ti - tintOp) > 0.01) { tintOp = ti; tint.style.opacity = ti.toFixed(3); }
    const fl = fx.flash > 0.004 ? fx.flash : 0;
    if (Math.abs(fl - flashOp) > 0.01 || (fl === 0 && flashOp !== 0)) { flashOp = fl; flash.style.opacity = fl.toFixed(3); }
    fx.flash *= Math.exp(-9 * dt);
    if (t > DUR - OUT) box.style.opacity = clamp01((DUR - t) / OUT).toFixed(3);
    if (clock) {
      const w = clock.now() - w0;
      stats.frames++;
      stats.workMs += w;
      if (w > stats.workMax) stats.workMax = w;
      if (stats.frames > 1) {
        stats.gapMs += gap;
        if (gap > stats.gapMax) stats.gapMax = gap;
      }
    }
    if (t >= DUR || now - start > DUR * 1000 + 2500) { stop(); return; }
    raf = win.requestAnimationFrame(frame);
  };
  raf = win.requestAnimationFrame(frame);
  return stop;
}
