// adverteer.html — the sponsor sign-up page.
// Modes: "kom binnekort" (no API configured), the sign-up form, and the
// payment callback (?sponsor=…&reference=… after Paystack) which polls /status.
// The server is authoritative for every rule; the checks here only give
// instant, friendly feedback.

import { SPONSOR, salesEnabled } from '../sponsorConfig.js';
import { PALETTE, FONT } from '../config.js';
import { SHAPE_NAMES } from '../core/strings.js';
import * as moderation from '../core/sponsors.js';
import {
  $, $$, h, apiRequest, ApiError, announce, focusEl, setBusy, safeStore, isEmail,
  normaliseUrl, displayHost, wireContact, contactEmail, drawOutlinedText, fitText,
  noBreakDigits, prefersReducedMotion,
} from './common.js';

const DRAFT_KEY = 'stapel.adverteer.draft';
const PENDING_KEY = 'stapel.adverteer.pending';
const NAME_MAX = SPONSOR.maxNameLen || 22;
const TAGLINE_MAX = SPONSOR.maxTaglineLen || 40;
const PRICE_LABEL = noBreakDigits(SPONSOR.premiumPriceLabel || 'R1 499 per maand');

// Mirrors server/src/moderation.js: Latin-script letters (incl. ê ë ô ï), digits,
// space and & . - ' ’ ! — taglines may also use , : ? %
const NAME_CHARS_RE = /^(?:[0-9 &.\-'’!]|(?=\p{L})\p{Script=Latin})+$/u;
const TAGLINE_CHARS_RE = /^(?:[0-9 &.\-'’!,:?%]|(?=\p{L})\p{Script=Latin})+$/u;
const ALNUM_RE = /[0-9]|(?=\p{L})\p{Script=Latin}/gu;
const CONTACT_RE = /^(?:\p{L}|\p{M}|[ .'’-])+$/u;
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;
// "www.x.co.za", "x.com", "info@x", "082 123 4567": contact details are not names
const CONTACT_LIKE_RE = /(^|\s)www\.|\.(co|com|net|org|za|io|africa)(\.|\s|$)|@|(\d[\s-]*){7,}/i;
const ID_RE = /^[A-Za-z0-9_-]{4,80}$/;
const REF_RE = /^[A-Za-z0-9_.=-]{4,120}$/;
const PAYSTACK_HOST_RE = /(^|\.)paystack\.(com|co)$/i;

const TIERS = {
  block: { label: 'Jou naam op die blokke', price: 'Word by betaling gewys', chooseLabel: 'Kies die blokke' },
  premium: { label: 'Die groot advertensiebord', price: PRICE_LABEL, chooseLabel: 'Kies die advertensiebord' },
};

const MSG = {
  tierRequired: 'Kies asseblief ’n pakket.',
  premiumTaken: 'Die advertensiebord is tans bespreek. Jy kan steeds jou naam op die blokke sit.',
  blockFull: 'Al die plekke op die blokke is tans vol. Probeer asseblief later weer.',
  nameEmpty: 'Tik asseblief jou besigheid se naam in.',
  nameShort: 'Die naam moet minstens 2 karakters lank wees.',
  nameSymbols: 'Die naam moet minstens 2 letters of syfers hê.',
  nameLong: `Die naam mag hoogstens ${NAME_MAX} karakters lank wees.`,
  nameChars: 'Net letters, syfers, spasies en & . - ’ ! mag in die naam wees.',
  nameContact: 'Die naam mag nie ’n webwerf, e-posadres of telefoonnommer wees nie.',
  nameReserved: 'Hierdie naam is gereserveer. Kies asseblief ’n ander naam.',
  nameRejected: 'Ons kan ongelukkig nie hierdie naam in die spel wys nie. Kies asseblief ’n ander naam.',
  taglineLong: `Die slagspreuk mag hoogstens ${TAGLINE_MAX} karakters lank wees.`,
  taglineShort: 'Die slagspreuk moet minstens 2 karakters lank wees — of los dit leeg.',
  taglineChars: 'Net letters, syfers, spasies en & . - ’ ! , : ? % mag in die slagspreuk wees.',
  taglineRejected: 'Ons kan ongelukkig nie hierdie slagspreuk wys nie. Probeer iets anders.',
  urlInvalid: 'Dit lyk nie na ’n geldige webwerf nie. Probeer iets soos jouwebwerf.co.za.',
  contactEmpty: 'Tik asseblief die kontakpersoon se naam in.',
  contactShort: 'Die kontakpersoon se naam is te kort.',
  contactChars: 'Gebruik asseblief net letters in die kontakpersoon se naam.',
  emailEmpty: 'Tik asseblief jou e-posadres in.',
  emailInvalid: 'Kyk asseblief jou e-posadres — dit lyk nie reg nie.',
  phoneInvalid: 'Kyk asseblief die selfoonnommer, bv. 082 123 4567.',
  termsRequired: 'Jy moet die Borgskap-voorwaardes aanvaar om voort te gaan.',
  privacyRequired: 'Jy moet die Privaatheidsbeleid aanvaar om voort te gaan.',
  summaryTitle: 'Kyk asseblief weer na hierdie velde:',
  redirecting: 'Ons stuur jou nou na Paystack…',
  submitting: 'Net ’n oomblik…',
};

/** Server error code -> { msg, field? }. Unknown codes fall back to `generic`. */
const SERVER_ERRORS = {
  invalid_name: { field: 'name', msg: `Die naam moet 2–${NAME_MAX} karakters wees: letters, syfers, spasies en & . - ’ !` },
  name_rejected: { field: 'name', msg: MSG.nameRejected + ' Geen geld is afgetrek nie.' },
  invalid_tagline: { field: 'tagline', msg: MSG.taglineRejected },
  tagline_rejected: { field: 'tagline', msg: MSG.taglineRejected },
  invalid_url: { field: 'url', msg: MSG.urlInvalid },
  invalid_contact: { field: 'contact', msg: 'Kyk asseblief die kontakpersoon se naam: 2–60 letters.' },
  invalid_email: { field: 'email', msg: MSG.emailInvalid },
  invalid_phone: { field: 'phone', msg: MSG.phoneInvalid },
  invalid_tier: { msg: MSG.tierRequired },
  terms_required: { field: 'terms', msg: 'Merk asseblief albei blokkies om die voorwaardes en die privaatheidsbeleid te aanvaar.' },
  terms_outdated: { msg: 'Ons voorwaardes is pas bygewerk. Laai asseblief die bladsy weer en probeer dan weer.' },
  version_mismatch: { msg: 'Ons voorwaardes is pas bygewerk. Laai asseblief die bladsy weer en probeer dan weer.' },
  premium_taken: { msg: 'Jammer, iemand het pas die advertensiebord bespreek. Jy kan steeds jou naam op die blokke sit.' },
  block_full: { msg: MSG.blockFull },
  rate_limited: { msg: 'Stadig, stadig! Daar was te veel pogings. Wag asseblief ’n rukkie en probeer dan weer.' },
  payment_init_failed: { msg: 'Ons kon nie die betaling by Paystack begin nie. Geen geld is afgetrek nie. Probeer asseblief oor ’n paar minute weer.' },
  sales_disabled: { msg: 'Inskrywings vir hierdie pakket is tans gesluit. Probeer asseblief later weer.' },
  not_configured: { msg: 'Inskrywings is nog nie oop nie. Probeer asseblief later weer.' },
  network: { msg: 'Ons kon nie die bediener bereik nie. Kyk jou internetverbinding en probeer weer.' },
  timeout: { msg: 'Die bediener het te lank gevat om te antwoord. Probeer asseblief weer.' },
  server_error: { msg: 'Iets het aan ons kant skeefgeloop. Probeer asseblief oor ’n paar minute weer.' },
  bad_response: { msg: 'Ons het ’n onverwagte antwoord gekry. Probeer asseblief weer.' },
  generic: { msg: 'Iets het skeefgeloop. Probeer asseblief weer.' },
};

const COLOR_NAMES = {
  protea: 'pienk', karoo: 'oranje', sonneblom: 'geel', bosveld: 'groen',
  oseaan: 'blougroen', jakaranda: 'pers', hemel: 'blou', klei: 'rooi',
};

const session = safeStore('session');

// ===========================================================================
// Moderation (shared with the game; server is authoritative)
// ===========================================================================

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Same normalisation as the server applies before its checks. */
function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/[‘ʼ`´′]/g, '’')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}
const alnumCount = (s) => (s.match(ALNUM_RE) || []).length;

function sanitize(s, max = NAME_MAX, kind = 'name') {
  try {
    const fn = kind === 'tagline' ? moderation.sanitizeTagline : moderation.sanitizeName;
    if (typeof fn === 'function') return String(fn(s, max) ?? '');
  } catch {
    /* fall through to the plain clean-up */
  }
  return collapse(s).slice(0, max);
}

/** isNameAllowed may answer a boolean or { ok, reason }; normalise both. */
function allowed(s) {
  try {
    if (typeof moderation.isNameAllowed !== 'function') return { ok: true, reason: null };
    const r = moderation.isNameAllowed(s);
    if (r && typeof r === 'object') return { ok: !!r.ok, reason: r.reason || r.code || null };
    return { ok: !!r, reason: null };
  } catch {
    return { ok: true, reason: null };
  }
}

function rejectionMessage(reason, kind) {
  const r = String(reason || '').toLowerCase();
  if (kind === 'tagline') return MSG.taglineRejected;
  if (/url|link|email|phone|tel|contact|digits/.test(r)) return MSG.nameContact;
  if (/reserved/.test(r)) return MSG.nameReserved;
  if (/short/.test(r)) return MSG.nameShort;
  if (/long/.test(r)) return MSG.nameLong;
  if (/char|symbol/.test(r)) return MSG.nameChars;
  return MSG.nameRejected;
}

function checkName(raw) {
  const v = normalizeText(raw);
  if (!v) return MSG.nameEmpty;
  if ([...v].length > NAME_MAX) return MSG.nameLong;
  if (!NAME_CHARS_RE.test(v)) return MSG.nameChars;
  if ([...v].length < 2) return MSG.nameShort;
  if (alnumCount(v) < 2) return MSG.nameSymbols;
  if (CONTACT_LIKE_RE.test(v)) return MSG.nameContact;
  const res = allowed(v);
  return res.ok ? '' : rejectionMessage(res.reason, 'name');
}

function checkTagline(raw) {
  const v = normalizeText(raw);
  if (!v) return '';
  if ([...v].length > TAGLINE_MAX) return MSG.taglineLong;
  if ([...v].length < 2) return MSG.taglineShort;
  if (!TAGLINE_CHARS_RE.test(v)) return MSG.taglineChars;
  if (alnumCount(v) < 2) return MSG.taglineChars;
  const fn = moderation.isTaglineAllowed;
  if (typeof fn === 'function') {
    try {
      const r = fn(v);
      const ok = r && typeof r === 'object' ? !!r.ok : !!r;
      if (!ok) return MSG.taglineRejected;
    } catch {
      /* server decides */
    }
  }
  return '';
}

// ===========================================================================
// Canvas preview — blocks in the game's palette, the island and the billboard
// ===========================================================================

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const rgba = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
function mix(a, b, t) {
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
const blockFont = (size) => `900 ${size}px ${FONT}`;
const boldFont = (size) => `800 ${size}px ${FONT}`;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Block sizes in game px (js/game/blocks.js); the tiers' name-capable shapes.
const SHAPES = {
  plank: { w: 200, h: 40 },
  slab: { w: 160, h: 48 },
  brick: { w: 128, h: 56 },
  wedge: { w: 150, h: 60, poly: [[30, 0], [120, 0], [150, 60], [0, 60]] },
  crate: { w: 84, h: 84 },
};
const CLOSE_SHAPES = ['plank', 'slab', 'brick', 'wedge', 'crate'];
const CLOSE_COLORS = [1, 6, 3, 0, 5, 4, 7, 2];   // palette order for the "Ander blok" button

const bands = (bh) => ({
  top: Math.max(5, Math.min(10, Math.round(bh * 0.2))),
  bottom: Math.max(4, Math.min(8, Math.round(bh * 0.15))),
});

function polyPath(ctx, pts, r) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    if (i === 0) ctx.moveTo((prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
    const rr = Math.min(r, Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) / 2, Math.hypot(next[0] - cur[0], next[1] - cur[1]) / 2);
    ctx.arcTo(cur[0], cur[1], next[0], next[1], rr);
  }
  ctx.closePath();
}
const rectPts = (x, y, w, hh) => [[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]];

/** One block at the origin (top-left), in game px, with an optional name on it. */
function drawBlock(ctx, shapeId, pal, label, rnd) {
  const g = SHAPES[shapeId];
  const { w, h: bh } = g;
  const pts = g.poly || rectPts(0, 0, w, bh);
  const outline = mix(pal.dark, 0x000000, 0.38);
  const b = bands(bh);

  polyPath(ctx, pts, 6);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = hex(pal.fill);
  ctx.fillRect(0, 0, w, bh);
  ctx.fillStyle = hex(pal.light);
  ctx.fillRect(0, 0, w, b.top);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, 0, w, 2);
  ctx.fillStyle = hex(pal.dark);
  ctx.fillRect(0, bh - b.bottom, w, b.bottom);
  drawDetail(ctx, shapeId, g, pal, rnd, b);
  ctx.restore();

  polyPath(ctx, pts, 6);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = hex(outline);
  ctx.stroke();

  if (!label) return;
  const box = textBox(shapeId, g, b);
  ctx.save();
  if (label.placeholder) ctx.globalAlpha = 0.72;
  drawOutlinedText(ctx, label.text, box.cx, box.cy, box.w, box.h, { font: blockFont, outline: hex(outline), minSize: 5 });
  ctx.restore();
}

function textBox(shapeId, g, b) {
  const { w, h: bh } = g;
  const top = b.top;
  const bottom = bh - b.bottom;
  const avail = bottom - top;
  if (shapeId === 'wedge') return { cx: w / 2, cy: top + avail / 2 + 1, w: 98, h: avail * 0.72 };
  if (shapeId === 'crate') return { cx: w / 2, cy: bh / 2 + 1, w: w - 14, h: avail * 0.42 };
  const pad = Math.max(8, w * 0.05);
  return { cx: w / 2, cy: top + avail / 2 + 1, w: w - pad * 2, h: Math.min(avail * 0.8, 30) };
}

function drawDetail(ctx, shapeId, g, pal, rnd, b) {
  const { w, h: bh } = g;
  if (shapeId === 'plank') {
    ctx.strokeStyle = rgba(pal.dark, 0.32);
    ctx.lineWidth = 1.5;
    for (const fy of [0.4, 0.56, 0.72]) {
      const y = bh * fy;
      const x0 = 14 + rnd() * w * 0.25;
      const x1 = w - 14 - rnd() * w * 0.25;
      const ph = rnd() * 6;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 6) {
        const yy = y + Math.sin(x * 0.05 + ph) * 1.2;
        if (x === x0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.fillStyle = rgba(pal.dark, 0.85);
    for (const nx of [9, w - 9]) {
      for (const ny of [bh * 0.42, bh * 0.72]) {
        ctx.beginPath();
        ctx.arc(nx, ny, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (shapeId === 'slab') {
    for (let k = 0; k < Math.round(w / 9); k++) {
      ctx.fillStyle = rnd() < 0.5 ? rgba(pal.dark, 0.28) : 'rgba(255,255,255,0.28)';
      ctx.fillRect(6 + rnd() * (w - 12), bh * 0.3 + rnd() * bh * 0.5, 2, 2);
    }
    ctx.fillStyle = rgba(pal.dark, 0.35);
    ctx.fillRect(10, Math.round(bh * 0.56), w - 20, 2);
  } else if (shapeId === 'brick') {
    const yMid = Math.round(bh / 2);
    const groove = rgba(pal.dark, 0.6);
    ctx.fillStyle = groove;
    ctx.fillRect(0, yMid - 1.5, w, 3);
    ctx.fillRect(w * 0.5 - 1.5, b.top, 3, yMid - b.top);
    ctx.fillRect(w * 0.25 - 1.5, yMid, 3, bh - b.bottom - yMid);
    ctx.fillRect(w * 0.75 - 1.5, yMid, 3, bh - b.bottom - yMid);
  } else if (shapeId === 'crate') {
    const inset = Math.round(w * 0.12);
    ctx.fillStyle = rgba(pal.dark, 0.22);
    ctx.fillRect(inset, inset, w - 2 * inset, bh - 2 * inset);
    ctx.save();
    ctx.beginPath();
    ctx.rect(inset, inset, w - 2 * inset, bh - 2 * inset);
    ctx.clip();
    ctx.strokeStyle = rgba(pal.dark, 0.75);
    ctx.lineWidth = Math.round(w * 0.16);
    ctx.beginPath();
    ctx.moveTo(inset - 4, bh - inset + 4);
    ctx.lineTo(w - inset + 4, inset - 4);
    ctx.stroke();
    ctx.strokeStyle = hex(pal.light);
    ctx.lineWidth = Math.round(w * 0.16) - 5;
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = rgba(pal.dark, 0.75);
    ctx.lineWidth = 2.5;
    ctx.strokeRect(inset, inset, w - 2 * inset, bh - 2 * inset);
  } else if (shapeId === 'wedge') {
    ctx.fillStyle = rgba(pal.dark, 0.32);
    const span = bh - b.top - b.bottom;
    ctx.fillRect(0, Math.round(b.top + span * 0.38), w, 2);
    ctx.fillRect(0, Math.round(b.top + span * 0.72), w, 2);
  }
}

// --- scenery ---------------------------------------------------------------

const ROCK = [
  { base: '#9b8f80', light: '#c9bda8', dark: '#6c6358', line: '#4b443d' },
  { base: '#a7a39c', light: '#d3cfc6', dark: '#78746e', line: '#504d49' },
  { base: '#8c8073', light: '#b8aa96', dark: '#625a50', line: '#463f38' },
];

function drawSky(ctx, W, H, horizon) {
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, '#5ec1f5');
  g.addColorStop(1, '#c8ecfb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawCloud(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(x, y, 14 * s, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x + 16 * s, y - 12 * s, 16 * s, Math.PI, Math.PI * 2);
  ctx.arc(x + 38 * s, y - 6 * s, 13 * s, Math.PI * 1.1, Math.PI * 2.05);
  ctx.arc(x + 50 * s, y, 12 * s, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawMountain(ctx, x0, x1, base, top) {
  // a flat-topped Cape mountain on the horizon
  const w = x1 - x0;
  ctx.fillStyle = '#9cc8e6';
  ctx.beginPath();
  ctx.moveTo(x0, base);
  ctx.lineTo(x0 + w * 0.12, top + 18);
  ctx.lineTo(x0 + w * 0.22, top + 2);
  ctx.lineTo(x0 + w * 0.7, top);
  ctx.lineTo(x0 + w * 0.8, top + 14);
  ctx.lineTo(x0 + w * 0.9, top + 26);
  ctx.lineTo(x1, base);
  ctx.closePath();
  ctx.fill();
}

function drawSea(ctx, W, H, y, alpha = 1) {
  const g = ctx.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, `rgba(58,143,214,${alpha})`);
  g.addColorStop(1, `rgba(31,111,178,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, H - y);
  ctx.fillStyle = `rgba(124,196,242,${0.9 * alpha})`;
  ctx.fillRect(0, y, W, 3);
}

function drawBoulder(ctx, cx, cy, rx, ry, pal, rnd) {
  const pts = [[cx - rx, cy + ry * 0.6]];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const j = 0.84 + rnd() * 0.24;
    pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
  }
  pts.push([cx + rx, cy + ry * 0.6]);
  ctx.save();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = pal.base;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = pal.light;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 1.1, cy);
  ctx.lineTo(cx - rx * 0.5, cy - ry * 1.2);
  ctx.lineTo(cx + rx * 0.3, cy - ry * 1.2);
  ctx.lineTo(cx, cy - ry * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.dark;
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.25, cy + ry);
  ctx.lineTo(cx + rx * 0.45, cy - ry * 0.25);
  ctx.lineTo(cx + rx * 1.2, cy - ry * 0.7);
  ctx.lineTo(cx + rx * 1.2, cy + ry);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.stroke();
}

function drawIsland(ctx, x0, x1, top, sea, seed) {
  const rnd = seeded(seed);
  const n = Math.max(3, Math.round((x1 - x0) / 46));
  const step = (x1 - x0) / n;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i <= n; i++) {
      const cx = x0 + i * step + (row ? step / 2 : 0) + (rnd() - 0.5) * 10;
      if (cx > x1 + 10) continue;
      const rx = 22 + rnd() * 16;
      const ry = 14 + rnd() * 10;
      const cy = row ? sea + 4 : top + (sea - top) * 0.55 + rnd() * 6;
      drawBoulder(ctx, cx, cy, rx, ry, ROCK[Math.floor(rnd() * ROCK.length)], rnd);
    }
  }
}

function drawBase(ctx, cx, top, w, bh) {
  const x = cx - w / 2;
  polyPath(ctx, rectPts(x, top, w, bh), 4);
  ctx.fillStyle = '#c5cbd3';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#e4e8ed';
  ctx.fillRect(x, top, w, bh * 0.22);
  ctx.fillStyle = '#8f97a3';
  ctx.fillRect(x, top + bh * 0.78, w, bh * 0.22);
  ctx.fillStyle = 'rgba(80,90,105,0.35)';
  for (let k = 1; k < 4; k++) ctx.fillRect(x + (w * k) / 4 - 1, top + bh * 0.22, 2, bh * 0.56);
  ctx.restore();
  polyPath(ctx, rectPts(x, top, w, bh), 4);
  ctx.strokeStyle = '#5d6672';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawJib(ctx, W, y) {
  ctx.fillStyle = '#f5b800';
  ctx.fillRect(0, y, W, 14);
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 2;
  ctx.strokeRect(-2, y, W + 4, 14);
  ctx.beginPath();
  for (let x = 0; x < W; x += 20) {
    ctx.moveTo(x, y + 14);
    ctx.lineTo(x + 10, y);
    ctx.lineTo(x + 20, y + 14);
  }
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

/** The hanging block on its rope (scale s in game px -> logical px). */
function drawHanging(ctx, x, jibY, ropeLen, shapeId, pal, label, s, rnd) {
  const g = SHAPES[shapeId];
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(x - 12, jibY + 14, 24, 10);
  ctx.fillRect(x - 1, jibY + 24, 2, ropeLen);
  ctx.fillStyle = '#f5b800';
  ctx.fillRect(x - 6, jibY + 24 + ropeLen, 12, 6);
  ctx.save();
  ctx.translate(x - (g.w * s) / 2, jibY + 30 + ropeLen);
  ctx.scale(s, s);
  drawBlock(ctx, shapeId, pal, label, rnd);
  ctx.restore();
}

function drawStack(ctx, cx, baseTop, s, items, rnd) {
  let y = baseTop;
  for (const it of items) {
    const g = SHAPES[it.shape];
    y -= g.h * s;
    ctx.save();
    ctx.translate(cx + it.dx - (g.w * s) / 2, y);
    if (it.rot) {
      ctx.translate((g.w * s) / 2, (g.h * s) / 2);
      ctx.rotate(it.rot);
      ctx.translate((-g.w * s) / 2, (-g.h * s) / 2);
    }
    ctx.scale(s, s);
    drawBlock(ctx, it.shape, PALETTE[it.color], it.label || null, rnd);
    ctx.restore();
  }
  return y;
}

function roundRect(ctx, x, y, w, hh, r) {
  polyPath(ctx, rectPts(x, y, w, hh), r);
}

/** The island billboard: "ADVERTENSIE" strip, big name, tagline and hostname. */
function drawBillboard(ctx, x, y, w, hh, legBottom, { name, tagline, host, placeholder }) {
  const legW = Math.max(6, w * 0.05);
  for (const lx of [x + w * 0.2, x + w * 0.8]) {
    ctx.fillStyle = '#7b4f27';
    ctx.fillRect(lx - legW / 2, y + hh - 4, legW, legBottom - y - hh + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(lx - legW / 2, y + hh - 4, legW * 0.3, legBottom - y - hh + 4);
    ctx.strokeStyle = '#4a2f15';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lx - legW / 2, y + hh - 4, legW, legBottom - y - hh + 4);
  }
  // lamps on the top edge
  for (const lx of [x + w * 0.3, x + w * 0.7]) {
    ctx.fillStyle = '#3c4d6e';
    ctx.fillRect(lx - 1.5, y - w * 0.05, 3, w * 0.05);
    roundRect(ctx, lx - w * 0.04, y - w * 0.07, w * 0.08, w * 0.03, w * 0.012);
    ctx.fill();
  }

  const r = Math.max(4, w * 0.035);
  roundRect(ctx, x, y, w, hh, r);
  ctx.fillStyle = '#f39a2b';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#ffc56e';
  ctx.fillRect(x, y, w, hh * 0.08);
  ctx.fillStyle = '#b86d12';
  ctx.fillRect(x, y + hh * 0.93, w, hh * 0.07);
  ctx.restore();
  roundRect(ctx, x, y, w, hh, r);
  ctx.strokeStyle = '#7a4608';
  ctx.lineWidth = Math.max(1.5, w * 0.008);
  ctx.stroke();

  const m = Math.max(5, w * 0.04);
  const px = x + m;
  const py = y + m;
  const pw = w - m * 2;
  const ph = hh - m * 2;
  roundRect(ctx, px, py, pw, ph, r * 0.6);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#eef5fc';
  ctx.fillRect(px, py + ph * 0.86, pw, ph * 0.14);
  const stripH = ph * 0.17;
  ctx.fillStyle = '#1d2b45';
  ctx.fillRect(px, py, pw, stripH);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lab = 'ADVERTENSIE';
  const labSize = stripH * 0.58;
  ctx.font = blockFont(labSize);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(labSize * 0.18).toFixed(1)}px`;
  ctx.fillText(lab, px + pw / 2, py + stripH / 2 + 0.5);
  ctx.restore();

  const inner = pw - pw * 0.1;
  const hasTag = !!tagline;
  const hasHost = !!host;
  const bodyTop = py + stripH;
  const bodyH = ph * 0.86 - stripH;
  const nameY = bodyTop + bodyH * (hasTag || hasHost ? 0.36 : 0.5);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = placeholder ? '#93a2bb' : '#1d2b45';
  const nf = fitText(ctx, name, inner, { font: blockFont, maxSize: bodyH * (hasTag || hasHost ? 0.4 : 0.5), minSize: 4 });
  ctx.font = blockFont(nf.size);
  ctx.translate(px + pw / 2, nameY);
  ctx.scale(nf.squeeze, 1);
  ctx.fillText(name, 0, 0);
  ctx.restore();

  if (hasTag) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3c4d6e';
    const tf = fitText(ctx, tagline, inner, { font: boldFont, maxSize: bodyH * 0.17, minSize: 4 });
    ctx.font = boldFont(tf.size);
    ctx.translate(px + pw / 2, bodyTop + bodyH * 0.69);
    ctx.scale(tf.squeeze, 1);
    ctx.fillText(tagline, 0, 0);
    ctx.restore();
  }
  if (hasHost) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2563b0';
    const hf = fitText(ctx, host, inner, { font: blockFont, maxSize: ph * 0.1, minSize: 4 });
    ctx.font = blockFont(hf.size);
    ctx.translate(px + pw / 2, py + ph * 0.93);
    ctx.scale(hf.squeeze, 1);
    ctx.fillText(host, 0, 0);
    ctx.restore();
  }
}

// --- canvas plumbing -------------------------------------------------------

const CLOSE_SIZE = { block: [480, 190], premium: [480, 270] };
const SCENE_SIZE = [600, 300];

function prepCanvas(canvas, lw, lh) {
  const cssW = Math.max(1, Math.round(canvas.getBoundingClientRect().width || canvas.parentElement?.clientWidth || lw));
  const dpr = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
  const pw = Math.round(cssW * dpr);
  const ph = Math.round((cssW * lh / lw) * dpr);
  canvas.style.setProperty('aspect-ratio', `${lw} / ${lh}`);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(pw / lw, 0, 0, ph / lh, 0, 0);
  ctx.clearRect(0, 0, lw, lh);
  return ctx;
}

/**
 * Live preview controller. state: { tier, name, tagline, host }.
 * `name` is the display (sanitised) name; empty shows a placeholder.
 */
function createPreview(closeCanvas, sceneCanvas) {
  const st = { tier: 'block', name: '', tagline: '', host: '', look: 0 };
  let raf = 0;

  function label() {
    return st.name ? { text: st.name } : { text: 'Jou naam hier', placeholder: true };
  }

  function drawClose() {
    if (!closeCanvas) return;
    const [lw, lh] = CLOSE_SIZE[st.tier];
    const ctx = prepCanvas(closeCanvas, lw, lh);
    if (!ctx) return;
    drawSky(ctx, lw, lh, lh);
    drawCloud(ctx, 40, 44, 0.9);
    drawCloud(ctx, 380, 36, 0.7);
    if (st.tier === 'premium') {
      drawIsland(ctx, -20, lw + 20, lh - 40, lh - 6, 7);
      drawBillboard(ctx, 52, 34, lw - 104, lh - 98, lh, billboardData());
      return;
    }
    const shapeId = CLOSE_SHAPES[st.look % CLOSE_SHAPES.length];
    const pal = PALETTE[CLOSE_COLORS[st.look % CLOSE_COLORS.length]];
    const g = SHAPES[shapeId];
    const s = Math.min((lw - 60) / g.w, (lh - 50) / g.h);
    const bx = (lw - g.w * s) / 2;
    const by = (lh - g.h * s) / 2 - 4;
    ctx.fillStyle = 'rgba(29,43,69,0.16)';
    ctx.beginPath();
    ctx.ellipse(lw / 2, by + g.h * s + 12, g.w * s * 0.42, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(s, s);
    drawBlock(ctx, shapeId, pal, label(), seeded(st.look + 11));
    ctx.restore();
  }

  function billboardData() {
    return st.name
      ? { name: st.name, tagline: st.tagline, host: st.host }
      : { name: 'Jou naam hier', tagline: st.tagline || 'Jou slagspreuk', host: st.host || 'jouwebwerf.co.za', placeholder: true };
  }

  function drawScene() {
    if (!sceneCanvas) return;
    const [lw, lh] = SCENE_SIZE;
    const ctx = prepCanvas(sceneCanvas, lw, lh);
    if (!ctx) return;
    const s = 0.7;
    const sea = 240;
    const baseTop = 212;
    const premium = st.tier === 'premium';
    const towerX = premium ? 200 : lw / 2;
    const rnd = seeded(5);

    drawSky(ctx, lw, lh, sea);
    drawCloud(ctx, 60, 70, 0.8);
    drawCloud(ctx, 470, 92, 0.65);
    drawMountain(ctx, premium ? 330 : 380, lw + 40, sea, 168);
    drawSea(ctx, lw, lh, sea);
    drawIsland(ctx, premium ? towerX - 110 : towerX - 120, premium ? lw - 10 : towerX + 120, baseTop, sea, 3);
    drawBase(ctx, towerX, baseTop, 300 * s, 44 * s);

    const mine = premium ? null : label();
    drawStack(ctx, towerX, baseTop, s, [
      { shape: 'plank', color: 6, dx: 0 },
      { shape: 'brick', color: 1, dx: 6, label: mine },
      { shape: 'slab', color: 3, dx: -4, rot: -0.015 },
    ], rnd);
    drawJib(ctx, lw, 8);
    drawHanging(ctx, towerX + (premium ? 30 : 46), 8, 18, 'plank', PALETTE[5], mine, s, rnd);

    if (premium) drawBillboard(ctx, 372, 92, 206, 110, sea + 6, billboardData());

    drawSea(ctx, lw, lh, sea + 16, 0.55);
  }

  function draw() {
    raf = 0;
    drawClose();
    drawScene();
    const shown = st.name || 'jou naam';
    if (closeCanvas) {
      if (st.tier === 'premium') {
        closeCanvas.setAttribute('aria-label', `Voorskou van die advertensiebord met “${shown}”${st.tagline ? ` en “${st.tagline}”` : ''}${st.host ? `, ${st.host}` : ''}`);
      } else {
        const shapeId = CLOSE_SHAPES[st.look % CLOSE_SHAPES.length];
        const col = PALETTE[CLOSE_COLORS[st.look % CLOSE_COLORS.length]].id;
        closeCanvas.setAttribute('aria-label', `Voorskou: “${shown}” op ’n ${COLOR_NAMES[col] || ''} ${String(SHAPE_NAMES[shapeId] || shapeId).toLowerCase()}`);
      }
    }
    sceneCanvas?.setAttribute('aria-label', st.tier === 'premium'
      ? `Voorskou van die eiland in die spel, met die advertensiebord langs die toring`
      : `Voorskou van die toring in die spel, met “${shown}” op twee van die blokke`);
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(draw);
  }

  if (typeof ResizeObserver === 'function') {
    let lastW = 0;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width || 0);
      if (w && w !== lastW) {
        lastW = w;
        schedule();
      }
    });
    ro.observe(closeCanvas || sceneCanvas);
  } else {
    globalThis.addEventListener('resize', schedule);
  }

  return {
    set(partial) {
      Object.assign(st, partial);
      schedule();
    },
    nextLook() {
      st.look = (st.look + 1) % (CLOSE_SHAPES.length * CLOSE_COLORS.length);
      schedule();
    },
    get tier() { return st.tier; },
  };
}

// ===========================================================================
// Small UI helpers
// ===========================================================================

function show(el, on = true) {
  if (el) el.hidden = !on;
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

function setFieldError(input, errEl, msg) {
  if (!input || !errEl) return;
  const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== errEl.id);
  if (msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    ids.unshift(errEl.id);
  } else {
    errEl.textContent = '';
    errEl.hidden = true;
    input.removeAttribute('aria-invalid');
  }
  if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
  else input.removeAttribute('aria-describedby');
}

function confetti() {
  if (prefersReducedMotion()) return;
  const colors = PALETTE.map((p) => hex(p.fill));
  const box = h('div', { class: 'confetti page-confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 36; i++) {
    const piece = h('i');
    const vars = {
      '--x': `${Math.round(Math.random() * 100)}%`,
      '--w': String(16 + Math.round(Math.random() * 18)),
      '--h': String(12 + Math.round(Math.random() * 12)),
      '--c': colors[i % colors.length],
      '--t': `${(2.2 + Math.random() * 1.6).toFixed(2)}s`,
      '--d': `${(Math.random() * 0.7).toFixed(2)}s`,
      '--dx': String(Math.round((Math.random() - 0.5) * 300)),
      '--rot': `${Math.round((Math.random() - 0.5) * 900)}deg`,
    };
    for (const [k, v] of Object.entries(vars)) piece.style.setProperty(k, v);
    box.append(piece);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 4600);
}

const STROKE = { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
const ICONS = {
  check: [['path', { ...STROKE, d: 'M5 12.5l4.5 4.5L19 7.5', 'stroke-width': '3.4' }]],
  clock: [
    ['circle', { ...STROKE, cx: '12', cy: '12', r: '8.6', 'stroke-width': '2.8' }],
    ['path', { ...STROKE, d: 'M12 7.4V12l3.2 2.2', 'stroke-width': '2.8' }],
  ],
  cross: [['path', { ...STROKE, d: 'M7 7l10 10M17 7 7 17', 'stroke-width': '3.4' }]],
  card: [
    ['rect', { ...STROKE, x: '3', y: '5.5', width: '18', height: '13', rx: '2.5', 'stroke-width': '2.4' }],
    ['path', { ...STROKE, d: 'M3 10h18', 'stroke-width': '2.6' }],
  ],
};

function setIcon(el, name) {
  if (!el) return;
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs) => {
    const node = document.createElementNS(ns, tag);
    for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, val);
    return node;
  };
  const svg = make('svg', { viewBox: '0 0 24 24', class: 'ic', 'aria-hidden': 'true', focusable: 'false' });
  for (const [tag, attrs] of ICONS[name] || []) svg.append(make(tag, attrs));
  el.replaceChildren(svg);
}

// ===========================================================================
// Page
// ===========================================================================

function init() {
  wireContact();
  for (const el of $$('[data-premium-price]')) el.textContent = PRICE_LABEL;

  const callback = parseCallback(location.search);
  if (callback) {
    startStatus(callback);
    return;
  }
  const preview = createPreview($('#pv-close'), $('#pv-scene'));
  const form = setupForm(preview, { sales: salesEnabled() });
  if (!salesEnabled()) comingSoon(form);
  else openSales(form);
}

// --- coming soon -----------------------------------------------------------

function comingSoon(form) {
  show($('#soon'));
  show($('#sale-fields'), false);
  $('#form-title').textContent = 'Kyk hoe jou naam sal lyk';
  $('#form-intro').textContent = 'Kies ’n pakket en tik jou besigheid se naam in.';
  for (const chip of $$('[data-avail]')) {
    chip.dataset.state = 'soon';
    chip.textContent = 'Kom binnekort';
  }
  for (const btn of $$('[data-choose]')) {
    const label = btn.querySelector('.btn-label');
    if (label) label.textContent = 'Kyk hoe dit lyk';
  }
  form.ready();
}

// --- sales -----------------------------------------------------------------

function openSales(form) {
  form.ready();
  form.refreshAvailability();
  // after "Back" from Paystack the page may come from the bfcache mid-submit
  globalThis.addEventListener('pageshow', (e) => {
    if (e.persisted) form.resetBusy();
  });
}

function setupForm(preview, { sales }) {
  const form = $('#signup');
  const f = {
    alert: $('#form-alert'),
    tiers: $$('input[name="tier"]', form),
    name: $('#f-name'), nameErr: $('#f-name-err'), nameCount: $('#f-name-count'),
    tagline: $('#f-tagline'), taglineErr: $('#f-tagline-err'), taglineCount: $('#f-tagline-count'),
    url: $('#f-url'), urlErr: $('#f-url-err'),
    contact: $('#f-contact'), contactErr: $('#f-contact-err'),
    email: $('#f-email'), emailErr: $('#f-email-err'),
    phone: $('#f-phone'), phoneErr: $('#f-phone-err'),
    hp: $('#f-hp'),
    terms: $('#f-terms'), termsErr: $('#f-terms-err'),
    privacy: $('#f-privacy'), privacyErr: $('#f-privacy-err'),
    pay: $('#pay-btn'),
    premiumFields: $('#premium-fields'),
    shuffle: $('#pv-shuffle'),
    cap: $('#pv-cap'),
  };
  f.name.maxLength = NAME_MAX;
  f.tagline.maxLength = TAGLINE_MAX;

  const avail = { block: null, premium: null };   // true | false | null (unknown)
  let submitting = false;
  const touched = new Set();
  let draftTimer = 0;

  const tier = () => f.tiers.find((r) => r.checked)?.value || '';

  // ---- validation --------------------------------------------------------
  const FIELDS = {
    tier: {
      input: () => f.tiers.find((r) => !r.disabled) || f.tiers[0],
      check: () => {
        const t = tier();
        if (!t) return MSG.tierRequired;
        if (avail[t] === false) return t === 'premium' ? MSG.premiumTaken : MSG.blockFull;
        return '';
      },
      label: 'Pakket',
    },
    name: { input: () => f.name, err: () => f.nameErr, check: () => checkName(f.name.value), label: 'Besigheidsnaam' },
    tagline: {
      input: () => f.tagline, err: () => f.taglineErr, label: 'Slagspreuk',
      check: () => (tier() === 'premium' ? checkTagline(f.tagline.value) : ''),
    },
    url: {
      input: () => f.url, err: () => f.urlErr, label: 'Webwerf',
      check: () => (tier() === 'premium' && normaliseUrl(f.url.value) === null ? MSG.urlInvalid : ''),
    },
    contact: {
      input: () => f.contact, err: () => f.contactErr, label: 'Kontakpersoon',
      check: () => {
        const v = normalizeText(f.contact.value);
        if (!v) return MSG.contactEmpty;
        if (v.length < 2) return MSG.contactShort;
        return CONTACT_RE.test(v) ? '' : MSG.contactChars;
      },
    },
    email: {
      input: () => f.email, err: () => f.emailErr, label: 'E-posadres',
      check: () => {
        const v = f.email.value.trim();
        if (!v) return MSG.emailEmpty;
        return isEmail(v) ? '' : MSG.emailInvalid;
      },
    },
    phone: {
      input: () => f.phone, err: () => f.phoneErr, label: 'Selfoonnommer',
      check: () => {
        const v = f.phone.value.trim();
        if (!v) return '';
        const digits = v.replace(/\D/g, '').length;
        return PHONE_RE.test(v) && digits >= 9 && digits <= 15 ? '' : MSG.phoneInvalid;
      },
    },
    terms: { input: () => f.terms, err: () => f.termsErr, label: 'Borgskap-voorwaardes', check: () => (f.terms.checked ? '' : MSG.termsRequired) },
    privacy: { input: () => f.privacy, err: () => f.privacyErr, label: 'Privaatheidsbeleid', check: () => (f.privacy.checked ? '' : MSG.privacyRequired) },
  };
  const SALE_ONLY = new Set(['contact', 'email', 'phone', 'terms', 'privacy']);

  function validate(key, { show: showIt = true } = {}) {
    const def = FIELDS[key];
    const msg = def.check();
    if (showIt && def.err) setFieldError(def.input(), def.err(), msg);
    return msg;
  }

  function validateAll() {
    const errors = [];
    for (const key of Object.keys(FIELDS)) {
      if (!sales && SALE_ONLY.has(key)) continue;
      const msg = validate(key);
      if (msg) errors.push({ key, msg });
    }
    return errors;
  }

  // ---- alert box ---------------------------------------------------------
  function clearAlert() {
    f.alert.hidden = true;
    f.alert.classList.remove('is-info');
    f.alert.replaceChildren();
  }

  function showAlert(content, { info = false } = {}) {
    f.alert.replaceChildren(...[content].flat());
    f.alert.classList.toggle('is-info', info);
    f.alert.hidden = false;
    focusEl(f.alert);
  }

  function showSummary(errors) {
    const list = h('ul', null, errors.map((e) => h('li', null, h('a', {
      href: `#${FIELDS[e.key].input().id}`,
      onclick: (ev) => {
        ev.preventDefault();
        focusEl(FIELDS[e.key].input());
      },
    }, e.msg))));
    showAlert(h('div', null, h('p', { text: MSG.summaryTitle }), list));
  }

  // ---- tier & preview ----------------------------------------------------
  function applyTier({ fromUser = false } = {}) {
    const t = tier() || 'block';
    const premium = t === 'premium';
    show(f.premiumFields, premium);
    show(f.shuffle, !premium);
    f.cap.textContent = premium
      ? 'Die bord staan op die eiland langs die toring: spelers sien dit aan die begin van elke spel en weer aan die einde.'
      : 'Borge deel die blokke, so jou naam verskyn op ’n deel van die blokke in elke toring.';
    $('#sum-tier').textContent = tier() ? TIERS[t].label : '—';
    $('#sum-price').textContent = tier() ? TIERS[t].price : '—';
    preview.set({ tier: t });
    updatePreviewText();
    if (fromUser && FIELDS.tier.check() === '') clearTierError();
  }

  function clearTierError() {
    if (!f.alert.hidden && f.alert.dataset.kind === 'tier') clearAlert();
  }

  function updatePreviewText() {
    const name = sanitize(f.name.value, NAME_MAX);
    const premium = tier() === 'premium';
    const tagline = premium ? sanitize(f.tagline.value, TAGLINE_MAX, 'tagline') : '';
    const url = premium ? normaliseUrl(f.url.value) : '';
    preview.set({ name: name.length >= 1 ? name : '', tagline, host: url ? displayHost(url) : '' });
  }

  function updateCounter(input, out, max) {
    const n = input.value.length;
    out.textContent = `${n}/${max}`;
    out.classList.toggle('is-full', n >= max);
  }

  function selectTier(t, { focus = false, scroll = false } = {}) {
    const radio = f.tiers.find((r) => r.value === t);
    if (!radio || radio.disabled) return;
    radio.checked = true;
    applyTier({ fromUser: true });
    saveDraftSoon();
    if (scroll) $('#teken-in').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    if (focus) radio.focus({ preventScroll: true });
  }

  // ---- availability ------------------------------------------------------
  function applyAvailability() {
    for (const t of ['block', 'premium']) {
      const a = avail[t];
      const chip = $(`[data-avail="${t}"]`);
      const flag = $(`[data-pick-flag="${t}"]`);
      const radio = f.tiers.find((r) => r.value === t);
      const choose = $(`[data-choose="${t}"]`);
      if (chip) {
        chip.hidden = a === null;
        chip.dataset.state = a === false ? 'taken' : 'ok';
        chip.textContent = a === false
          ? (t === 'premium' ? 'Tans bespreek' : 'Tans vol')
          : (t === 'premium' ? 'Beskikbaar' : 'Plek beskikbaar');
      }
      if (flag) {
        flag.hidden = a !== false;
        flag.textContent = t === 'premium' ? 'Tans bespreek' : 'Tans vol';
      }
      if (radio) radio.disabled = a === false;
      if (choose) {
        // a booked billboard turns its button into a way to the blocks instead
        const fallback = t === 'premium' && a === false && avail.block !== false;
        choose.hidden = a === false && !fallback;
        choose.dataset.target = fallback ? 'block' : t;
        choose.classList.toggle('btn-blue', fallback);
        const label = choose.querySelector('.btn-label');
        if (label) label.textContent = fallback ? 'Kies eerder die blokke' : TIERS[t].chooseLabel;
      }
    }
    const t = tier();
    if (t && avail[t] === false) {
      const other = t === 'premium' ? 'block' : 'premium';
      f.tiers.forEach((r) => { r.checked = false; });
      if (avail[other] !== false) f.tiers.find((r) => r.value === other).checked = true;
      applyTier();
    }
    const none = avail.block === false && avail.premium === false;
    f.pay.disabled = none;
    if (none) {
      f.alert.dataset.kind = 'full';
      showAlert(h('p', { text: 'Al die plekke is tans vol. Kom asseblief later weer kyk.' }), { info: true });
    }
  }

  async function refreshAvailability() {
    for (const chip of $$('[data-avail]')) {
      chip.hidden = false;
      chip.dataset.state = 'loading';
      chip.textContent = 'Kyk tans…';
    }
    try {
      const data = await apiRequest('availability', { timeoutMs: 8000 });
      avail.block = typeof data?.block?.available === 'boolean' ? data.block.available : null;
      avail.premium = typeof data?.premium?.available === 'boolean' ? data.premium.available : null;
    } catch {
      // unknown: the server checks again on submit
      avail.block = null;
      avail.premium = null;
    }
    applyAvailability();
  }

  // ---- drafts ------------------------------------------------------------
  function readDraft() {
    const d = session.get(DRAFT_KEY);
    return d && typeof d === 'object' ? d : null;
  }

  function saveDraft() {
    session.set(DRAFT_KEY, {
      tier: tier(),
      name: f.name.value.slice(0, 60),
      tagline: f.tagline.value.slice(0, 80),
      url: f.url.value.slice(0, 200),
      contactName: f.contact.value.slice(0, 60),
      email: f.email.value.slice(0, 254),
      phone: f.phone.value.slice(0, 20),
    });
  }

  function saveDraftSoon() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 300);
  }

  function restoreDraft() {
    const d = readDraft();
    if (!d) return;
    const str = (v) => (typeof v === 'string' ? v : '');
    f.name.value = str(d.name).slice(0, NAME_MAX);
    f.tagline.value = str(d.tagline).slice(0, TAGLINE_MAX);
    f.url.value = str(d.url);
    f.contact.value = str(d.contactName);
    f.email.value = str(d.email);
    f.phone.value = str(d.phone);
    const r = f.tiers.find((x) => x.value === d.tier);
    if (r) r.checked = true;
  }

  // ---- submit ------------------------------------------------------------
  function setFormBusy(busy) {
    submitting = busy;
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
    for (const el of form.querySelectorAll('input, button')) {
      if (el === f.pay) continue;
      if (busy) {
        el.dataset.wasDisabled = el.disabled ? '1' : '';
        el.disabled = true;
      } else if (el.dataset.wasDisabled != null) {
        el.disabled = el.dataset.wasDisabled === '1';
        delete el.dataset.wasDisabled;
      }
    }
    setBusy(f.pay, busy, MSG.submitting);
  }

  function body() {
    const t = tier();
    const b = {
      tier: t,
      name: collapse(f.name.value),
      contactName: collapse(f.contact.value),
      email: f.email.value.trim(),
      acceptTerms: f.terms.checked,
      acceptPrivacy: f.privacy.checked,
      termsVersion: SPONSOR.termsVersion,
      privacyVersion: SPONSOR.privacyVersion,
      website: f.hp.value,   // honeypot: must stay empty
    };
    const phone = f.phone.value.trim();
    if (phone) b.phone = phone;
    if (t === 'premium') {
      const tagline = collapse(f.tagline.value);
      const url = normaliseUrl(f.url.value);
      if (tagline) b.tagline = tagline;
      if (url) b.url = url;
    }
    return b;
  }

  /** Only ever send the browser to Paystack's own https checkout. */
  function checkoutUrl(raw) {
    try {
      const u = new URL(String(raw));
      return u.protocol === 'https:' && PAYSTACK_HOST_RE.test(u.hostname) && !u.username && !u.password ? u.href : null;
    } catch {
      return null;
    }
  }

  function handleServerError(err) {
    const code = err instanceof ApiError ? err.code : 'generic';
    const known = SERVER_ERRORS[code] || SERVER_ERRORS.generic;
    let field = known.field || null;
    const serverField = err?.data && typeof err.data.field === 'string' ? err.data.field : null;
    if (!field && serverField) {
      field = { name: 'name', tagline: 'tagline', url: 'url', contactName: 'contact', email: 'email', phone: 'phone', acceptTerms: 'terms', acceptPrivacy: 'privacy' }[serverField] || null;
    }
    const parts = [h('p', { text: known.msg })];
    const email = contactEmail();
    if ((known === SERVER_ERRORS.generic || code === 'server_error' || code === 'payment_init_failed') && email) {
      parts.push(h('p', null, 'Hou dit aan? Stuur vir ons ’n e-pos na ', h('a', { href: `mailto:${email}`, text: email }), '.'));
    }
    f.alert.dataset.kind = 'server';
    if (field && FIELDS[field]?.err) setFieldError(FIELDS[field].input(), FIELDS[field].err(), known.msg);
    if (field === 'terms') setFieldError(f.privacy, f.privacyErr, f.privacy.checked ? '' : MSG.privacyRequired);
    showAlert(h('div', null, parts));
    if (code === 'premium_taken') {
      avail.premium = false;
      applyAvailability();
      refreshAvailability();
    } else if (code === 'block_full') {
      avail.block = false;
      applyAvailability();
      refreshAvailability();
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!sales || submitting) return;
    clearAlert();
    for (const k of Object.keys(FIELDS)) touched.add(k);
    const errors = validateAll();
    if (errors.length) {
      f.alert.dataset.kind = errors.length === 1 && errors[0].key === 'tier' ? 'tier' : 'form';
      showSummary(errors);
      return;
    }
    setFormBusy(true);
    const live = $('#pay-live');
    try {
      const data = await apiRequest('subscribe', { method: 'POST', body: body(), timeoutMs: 25000 });
      const url = checkoutUrl(data?.url);
      if (!url) throw new ApiError('bad_response');
      saveDraft();
      if (typeof data.sponsorId === 'string' && ID_RE.test(data.sponsorId)) {
        session.set(PENDING_KEY, {
          sponsorId: data.sponsorId,
          reference: typeof data.reference === 'string' && REF_RE.test(data.reference) ? data.reference : null,
          tier: tier(),
        });
      }
      setBusy(f.pay, true, MSG.redirecting);
      announce(live, MSG.redirecting);
      location.assign(url);
    } catch (err) {
      setFormBusy(false);
      handleServerError(err);
    }
  }

  // ---- events ------------------------------------------------------------
  function onInput(key, after) {
    return () => {
      if (touched.has(key) || FIELDS[key].input().getAttribute('aria-invalid') === 'true') validate(key);
      after?.();
      saveDraftSoon();
    };
  }

  f.name.addEventListener('input', onInput('name', () => {
    updateCounter(f.name, f.nameCount, NAME_MAX);
    updatePreviewText();
  }));
  f.tagline.addEventListener('input', onInput('tagline', () => {
    updateCounter(f.tagline, f.taglineCount, TAGLINE_MAX);
    updatePreviewText();
  }));
  f.url.addEventListener('input', onInput('url', updatePreviewText));
  for (const key of ['contact', 'email', 'phone']) FIELDS[key].input().addEventListener('input', onInput(key));
  // An error appearing on blur pushes the content below it down. If the blur came
  // from pressing the pay button, the button would move away before the click
  // lands, so blur checks wait until the pointer is released.
  let pointerDown = false;
  const deferred = new Set();
  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  const release = () => {
    if (!pointerDown) return;
    pointerDown = false;
    setTimeout(() => {
      for (const key of deferred) blurCheck(key);
      deferred.clear();
    }, 0);
  };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);

  function blurCheck(key) {
    const input = FIELDS[key].input();
    if (!input.value.trim() && !touched.has(key)) return;   // don't nag about a field the user only tabbed through
    touched.add(key);
    if (key === 'url' && input.value.trim()) {
      const u = normaliseUrl(input.value);
      if (u) input.value = u;
    }
    if (key === 'name' || key === 'contact' || key === 'tagline') input.value = collapse(input.value);
    if (key === 'name') updateCounter(f.name, f.nameCount, NAME_MAX);
    if (key === 'tagline') updateCounter(f.tagline, f.taglineCount, TAGLINE_MAX);
    validate(key);
  }

  for (const key of ['name', 'tagline', 'url', 'contact', 'email', 'phone']) {
    FIELDS[key].input().addEventListener('blur', () => {
      if (submitting) return;
      if (pointerDown) deferred.add(key);
      else blurCheck(key);
    });
  }
  for (const key of ['terms', 'privacy']) {
    FIELDS[key].input().addEventListener('change', () => {
      if (touched.has(key)) validate(key);
    });
  }
  for (const r of f.tiers) r.addEventListener('change', () => {
    applyTier({ fromUser: true });
    saveDraftSoon();
  });
  f.shuffle.addEventListener('click', () => preview.nextLook());
  for (const btn of $$('[data-choose]')) {
    btn.addEventListener('click', () => selectTier(btn.dataset.target || btn.dataset.choose, { focus: true, scroll: true }));
  }
  form.addEventListener('submit', onSubmit);

  // a polite live region for the redirect message
  f.pay.after(h('p', { id: 'pay-live', class: 'sr-only', role: 'status', 'aria-live': 'polite' }));

  return {
    ready() {
      restoreDraft();
      if (!tier()) selectTier('block');
      updateCounter(f.name, f.nameCount, NAME_MAX);
      updateCounter(f.tagline, f.taglineCount, TAGLINE_MAX);
      applyTier();
      form.hidden = false;
    },
    refreshAvailability,
    resetBusy() {
      if (submitting) setFormBusy(false);
    },
  };
}

// --- payment callback ------------------------------------------------------

function parseCallback(search) {
  let p;
  try {
    p = new URLSearchParams(search);
  } catch {
    return null;
  }
  if (!p.has('sponsor') && !p.has('reference') && !p.has('trxref')) return null;
  const pending = session.get(PENDING_KEY);
  const sponsor = p.get('sponsor') || (pending && typeof pending.sponsorId === 'string' ? pending.sponsorId : '');
  const reference = p.get('reference') || p.get('trxref') || (pending && typeof pending.reference === 'string' ? pending.reference : '');
  return {
    sponsor: ID_RE.test(sponsor) ? sponsor : null,
    reference: REF_RE.test(reference) ? reference : null,
  };
}

const POLL_DELAYS = [0, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12000];   // ~54 s
const RECHECK_DELAYS = [0, 3000, 5000, 8000];

function startStatus({ sponsor, reference }) {
  show($('#sales'), false);
  show($('#hero-lead'), false);
  show($('#hero-cta'), false);
  const view = $('#status-view');
  const v = {
    view,
    ic: $('#st-ic'),
    title: $('#st-title'),
    msg: $('#st-msg'),
    msg2: $('#st-msg2'),
    busy: $('#st-busy'),
    previewBox: $('#st-preview'),
    actions: $('#st-actions'),
    hint: $('#st-hint'),
  };
  show(view);
  document.title = 'Betaling — Adverteer op Stapel';

  if (!salesEnabled() || !sponsor || !reference) {
    render(v, 'invalid');
    return;
  }

  let ctrl = null;

  async function poll(delays) {
    ctrl?.abort();
    ctrl = new AbortController();
    const { signal } = ctrl;
    render(v, 'checking');
    for (const d of delays) {
      await sleep(d, signal);
      if (signal.aborted) return;
      try {
        const st = await apiRequest('status', { query: { sponsor, reference }, timeoutMs: 12000, signal });
        if (signal.aborted) return;
        if (st?.status === 'active') return render(v, 'active', st);
        if (st?.status === 'failed') return render(v, 'failed', st, { retry: () => backToForm() });
        if (st?.status === 'ended') return render(v, 'ended', st);
      } catch (err) {
        if (signal.aborted) return;
        if (err.code === 'not_found' || err.status === 400 || /^invalid_/.test(err.code || '')) return render(v, 'invalid');
        // network hiccups and 5xx: keep trying until the time is up
      }
    }
    render(v, 'pending', null, { recheck: () => poll(RECHECK_DELAYS) });
  }

  poll(POLL_DELAYS);
}

function backToForm() {
  // drop the callback parameters; the draft in sessionStorage refills the form
  location.assign(location.pathname + '#teken-in');
}

function render(v, state, st = null, actions = {}) {
  const email = contactEmail();
  v.view.dataset.state = state;
  show(v.busy, state === 'checking');
  show(v.previewBox, false);
  show(v.msg2, false);
  show(v.hint, false);
  v.actions.replaceChildren();
  const homeBtn = () => h('a', { class: 'btn btn-white', href: './' }, h('span', { class: 'btn-label', text: 'Terug na die spel' }));

  if (state === 'checking') {
    setIcon(v.ic, 'card');
    v.title.textContent = 'Ons bevestig jou betaling…';
    v.msg.textContent = 'Dit neem gewoonlik net ’n paar sekondes. Moenie die bladsy toemaak nie.';
    return;
  }

  if (state === 'active') {
    const tier = st?.tier === 'premium' ? 'premium' : 'block';
    const name = sanitize(st?.name || '', NAME_MAX);
    setIcon(v.ic, 'check');
    if (st?.needsApproval) {
      v.title.textContent = 'Dankie! Jou betaling is ontvang.';
      v.msg.textContent = tier === 'premium'
        ? 'Ons gaan jou advertensie gou met die hand na. Sodra dit goedgekeur is, verskyn dit op die advertensiebord in die spel.'
        : 'Ons gaan jou naam gou met die hand na. Sodra dit goedgekeur is, verskyn dit op die blokke in die spel.';
    } else {
      v.title.textContent = 'Dankie!';
      v.msg.textContent = tier === 'premium'
        ? 'Jou advertensiebord verskyn binne 5 minute in die spel.'
        : 'Jou naam verskyn binne 5 minute in die spel.';
    }
    v.msg2.textContent = 'Paystack stuur vir jou ’n kwitansie per e-pos, met ’n knoppie om jou intekening later te bestuur of te kanselleer.';
    show(v.msg2);
    if (name) {
      const draft = session.get(DRAFT_KEY);
      const fromDraft = draft && draft.tier === 'premium' && sanitize(draft.name || '', NAME_MAX) === name;
      const url = fromDraft ? normaliseUrl(draft.url) : '';
      show(v.previewBox);
      const pv = createPreview(null, $('#st-canvas'));
      pv.set({
        tier,
        name,
        tagline: fromDraft ? sanitize(draft.tagline || '', TAGLINE_MAX, 'tagline') : '',
        host: url ? displayHost(url) : '',
      });
    }
    session.remove(DRAFT_KEY);
    session.remove(PENDING_KEY);
    v.actions.append(h('a', { class: 'btn btn-big', href: './' }, h('span', { class: 'btn-label', text: 'Speel Stapel' })));
    confetti();
  } else if (state === 'failed') {
    setIcon(v.ic, 'cross');
    v.title.textContent = 'Die betaling het nie deurgegaan nie';
    v.msg.textContent = 'Paystack kon nie die betaling voltooi nie, so jou advertensie is nie geaktiveer nie. Jy kan weer probeer — dalk met ’n ander kaart.';
    v.actions.append(
      h('button', { type: 'button', class: 'btn btn-big btn-green', onclick: actions.retry }, h('span', { class: 'btn-label', text: 'Probeer weer' })),
      homeBtn(),
    );
  } else if (state === 'pending') {
    setIcon(v.ic, 'clock');
    v.title.textContent = 'Ons wag nog vir Paystack';
    v.msg.textContent = 'Ons het nog nie die bevestiging van jou betaling ontvang nie. Dit neem soms ’n paar minute — jy hoef nie weer te betaal nie.';
    v.msg2.textContent = 'Jou naam verskyn outomaties in die spel sodra die betaling bevestig is.';
    show(v.msg2);
    v.actions.append(
      h('button', { type: 'button', class: 'btn btn-big btn-blue', onclick: actions.recheck }, h('span', { class: 'btn-label', text: 'Kyk weer' })),
      homeBtn(),
    );
    v.hint.replaceChildren('Het jy die betaling op Paystack gekanselleer? ', h('a', { href: 'adverteer.html#teken-in', text: 'Begin weer' }), '.');
    show(v.hint);
  } else if (state === 'ended') {
    setIcon(v.ic, 'clock');
    v.title.textContent = 'Hierdie borgskap het verval';
    v.msg.textContent = 'Die betaalde tydperk vir hierdie inskrywing is verby. Wil jy weer adverteer? Teken sommer weer in.';
    v.actions.append(
      h('a', { class: 'btn btn-big', href: 'adverteer.html#teken-in' }, h('span', { class: 'btn-label', text: 'Teken weer in' })),
      homeBtn(),
    );
  } else {
    setIcon(v.ic, 'cross');
    v.title.textContent = 'Ons kon nie jou inskrywing vind nie';
    v.msg.textContent = 'Hierdie skakel is ongeldig of verval. As jy reeds betaal het, is jou geld veilig: Paystack stuur vir jou ’n kwitansie per e-pos.';
    if (email) {
      v.msg2.replaceChildren('Kontak ons gerus by ', h('a', { href: `mailto:${email}`, text: email }), ' as iets nie reg lyk nie.');
      show(v.msg2);
    }
    v.actions.append(
      h('a', { class: 'btn btn-big', href: 'adverteer.html#teken-in' }, h('span', { class: 'btn-label', text: 'Na die inskryfvorm' })),
      homeBtn(),
    );
  }
  focusEl(v.title, { scroll: false });
  v.view.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
