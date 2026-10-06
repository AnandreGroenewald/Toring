// Sponsor logic that is shared by the game, the sign-up page and the tests.
// Pure (no DOM, no Phaser, no network), so node can test all of it.
//
//   * name rules ........ sanitizeName / sanitizeTagline / isNameAllowed / isTaglineAllowed.
//                         They wrap js/core/nameRules.js, the SAME module the Cloudflare Worker
//                         enforces, so instant feedback and the server can never disagree.
//   * the feed .......... normalizeFeed merges sponsors.json with the API answer and cleans it.
//   * the billboard ..... pickPremium: which premium sponsor is on the island today.
//   * the blocks ........ createBlockNamer: which sponsor's name is printed on which block.

import { createRng } from './rng.js';
import { dateKeyFor, dayNumber, isDateKey } from './daily.js';
import {
  NAME_MAX, TAGLINE_MAX, normalizeText, isAllowedChar, softFix, lengthOf, checkName, checkTagline, checkUrl,
} from './nameRules.js';

export { NAME_MAX, TAGLINE_MAX };

// ---------------------------------------------------------------------------
// Name rules
// ---------------------------------------------------------------------------

function clip(text, max) {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max).join('').trimEnd();
}

function sanitizeText(input, max, kind) {
  if (typeof input !== 'string') return '';
  const kept = [...normalizeText(input)].filter((ch) => isAllowedChar(ch, kind)).join('');
  return clip(softFix(kept.replace(/\s+/g, ' ').trim()).value, Math.max(0, Math.floor(max) || 0));
}

/**
 * The text as it would be stored and shown: normalised (NFKC, no invisible or direction-control
 * characters, tidy spaces), characters that can't be shown dropped, shouting capitals softened,
 * cut at `max` characters. For valid input this equals the server's stored value.
 * @returns {string} '' when nothing usable is left
 */
export function sanitizeName(input, max = NAME_MAX) {
  return sanitizeText(input, max, 'name');
}

/** Same for the billboard tagline (a few more punctuation marks are allowed). */
export function sanitizeTagline(input, max = TAGLINE_MAX) {
  return sanitizeText(input, max, 'tagline');
}

/**
 * Is this a business name we would put on the blocks?
 * `reason` (when not ok): too_short | too_long | bad_chars | symbols | contact | reserved | blocked.
 * `{ admin: true }` skips the word lists (the owner's own call), as the server's admin page does.
 * @returns {{ ok: true, reason: null, value: string } | { ok: false, reason: string, code: string }}
 */
export function isNameAllowed(input, opts) {
  const r = checkName(input, opts);
  return r.ok ? { ok: true, reason: null, value: r.value } : { ok: false, reason: r.reason, code: r.code };
}

/** Same for the optional tagline (empty is fine). `value` is null for an empty tagline. */
export function isTaglineAllowed(input, opts) {
  const r = checkTagline(input, opts);
  return r.ok ? { ok: true, reason: null, value: r.value } : { ok: false, reason: r.reason, code: r.code };
}

/** 'https://www.example.co.za/x' -> 'example.co.za' ('' when it isn't an https address). */
export function hostnameOf(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' ? u.hostname.replace(/^www\./i, '') : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// The feed (sponsors.json + the API answer)
// ---------------------------------------------------------------------------

const MAX_BLOCK_SPONSORS = 200;
const MAX_PREMIUM_SPONSORS = 20;
const ID_OK = /^[A-Za-z0-9_-]{1,80}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const asList = (v) => (Array.isArray(v) ? v : []);

/** Case-, accent- and punctuation-insensitive identity of a name, to drop duplicates. */
function nameKey(name) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function idFor(raw, name) {
  const id = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  return ID_OK.test(id) ? id : `s-${nameKey(name) || 'x'}`;
}

/** 'YYYY-MM-DD' that the entry is shown until (inclusive). undefined = no limit, null = unusable. */
function untilOf(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return typeof raw === 'string' && isDateKey(raw.trim()) ? raw.trim() : null;
}

function cleanBlock(raw) {
  if (!isObj(raw)) return null;
  const name = sanitizeName(raw.name);
  if (!checkName(name, { admin: true }).ok) return null;
  return { id: idFor(raw.id, name), name };
}

function cleanPremium(raw) {
  if (!isObj(raw)) return null;
  const name = sanitizeName(raw.name);
  if (!checkName(name, { admin: true }).ok) return null;
  const tagline = sanitizeTagline(raw.tagline);
  const url = checkUrl(typeof raw.url === 'string' ? raw.url : '', { admin: true });
  return {
    id: idFor(raw.id, name),
    name,
    tagline: tagline.length >= 2 ? tagline : '',
    url: url.ok && url.value ? url.value : '',
  };
}

function collect(lists, clean, max) {
  const out = [];
  const ids = new Set();
  const names = new Set();
  for (const { items, until } of lists) {
    for (const raw of asList(items)) {
      if (out.length >= max) return out;
      if (until !== undefined) {
        const end = untilOf(isObj(raw) ? raw.until : undefined);
        if (end === null || (end !== undefined && end < until)) continue;
      }
      const entry = clean(raw);
      if (!entry) continue;
      const key = nameKey(entry.name);
      if (ids.has(entry.id) || names.has(key)) continue;
      ids.add(entry.id);
      names.add(key);
      out.push(entry);
    }
  }
  return out;
}

function plainText(raw, max) {
  return typeof raw === 'string' ? clip(normalizeText(raw), max) : '';
}

function cleanHouseCard(raw) {
  if (!isObj(raw)) return null;
  const title = plainText(raw.title, 60);
  const text = plainText(raw.text, 120);
  const url = checkUrl(typeof raw.url === 'string' ? raw.url : '', { admin: true });
  if (!title || !url.ok || !url.value) return null;
  return { title, text, url: url.value, label: plainText(raw.label, 20) || 'Advertensie' };
}

/**
 * The cleaned feed the game uses, from the static sponsors.json and the API answer (either may be
 * missing or broken: this never throws).
 *
 * Paid lists: the API's entries come first and win a duplicate (same id or same name); manual
 * entries from sponsors.json are added after them, so a deal made by quote never disappears when
 * the sales backend goes live. An entry whose "until" ('YYYY-MM-DD', inclusive) has passed, or is
 * not a real date, is dropped. Every name is sanitised and must pass the rules without the word
 * lists (the server already applied those). The house ad only ever comes from sponsors.json.
 *
 * @param {object|null} staticJson parsed sponsors.json
 * @param {object|null} apiJson    parsed GET /sponsors answer
 * @param {string} [todayKey]      'YYYY-MM-DD' (defaults to the device's today)
 * @returns {{ house: { menu: {title,text,url,label}|null },
 *             block: {id,name}[], premium: {id,name,tagline,url}[] }}
 */
export function normalizeFeed(staticJson, apiJson, todayKey) {
  try {
    const today = isDateKey(todayKey) ? todayKey : dateKeyFor(new Date());
    const st = isObj(staticJson) ? staticJson : {};
    const api = isObj(apiJson) ? apiJson : {};
    const lists = (key) => [{ items: api[key] }, { items: st[key], until: today }];
    return {
      house: { menu: cleanHouseCard(isObj(st.house) ? st.house.menu : null) },
      block: collect(lists('block'), cleanBlock, MAX_BLOCK_SPONSORS),
      premium: collect(lists('premium'), cleanPremium, MAX_PREMIUM_SPONSORS),
    };
  } catch {
    return { house: { menu: null }, block: [], premium: [] };
  }
}

// ---------------------------------------------------------------------------
// The island billboard
// ---------------------------------------------------------------------------

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The premium sponsor on the billboard on `dateKey`: one of them, rotating daily (sorted by id,
 * then by day number), so every player sees the same one. null when there is none.
 */
export function pickPremium(premium, dateKey) {
  const list = asList(premium).filter((p) => isObj(p) && typeof p.id === 'string').sort(byId);
  if (!list.length) return null;
  const day = isDateKey(dateKey) ? dayNumber(dateKey) : 0;
  return list[((day % list.length) + list.length) % list.length];
}

// ---------------------------------------------------------------------------
// Names on the blocks
// ---------------------------------------------------------------------------

/** Shapes with room for a horizontal name (the cube is too small, the pillar needs a short name). */
export const NAME_CAPABLE_SHAPES = Object.freeze(['plank', 'slab', 'brick', 'crate', 'wedge', 'arch', 'L', 'J', 'T']);
/** A pillar carries its name vertically, so only names up to this many characters fit. */
export const PILLAR_MAX_CHARS = 8;

const CAPABLE = new Set(NAME_CAPABLE_SHAPES);

/** Can a block of this shape carry this name? (cube: never; pillar: only short names) */
export function canNameShape(shape, name) {
  if (CAPABLE.has(shape)) return true;
  return shape === 'pillar' && lengthOf(String(name ?? '')) <= PILLAR_MAX_CHARS;
}

/**
 * Hands out sponsor names for the blocks of one tower.
 *
 * Sponsors are put in a seeded shuffle (fork 'sponsors' of the tower's seed, after sorting by id,
 * so neither the order of the feed nor anything else matters) and the name-capable blocks take
 * them in turn: over any prefix of the tower every sponsor has been given the same number of
 * names, give or take one. A pillar takes the next name only if it is short enough to fit.
 *
 * `share` (0 to 1, default 1; the game passes SPONSOR.blockShare) is the fraction of the name-capable
 * blocks that actually get a name, spread evenly (0.4 = about every 2nd or 3rd one). The starting
 * phase comes from the seed, so towers differ, but the pattern is identical for every player of
 * the same tower, and the turn-taking above is unchanged: names are handed out only to the blocks
 * that carry one, so the sponsors still get the same number of names, give or take one.
 *
 * The answer for a block never depends on which blocks were asked about before it (it is memoised
 * by block number), provided the namer can see the shapes of the blocks before it:
 *   - pass `blockAt` (e.g. `(i) => sequence.block(i)`), or
 *   - ask for the blocks in order (0, 1, 2, ...). A block number it has not seen the shape of is
 *     counted as a name-capable one.
 *
 * @param {{id: string, name: string}[]} block  the live block sponsors
 * @param {string|number} seed                   the tower's seed (the same one the sequence uses)
 * @param {(i: number) => {shape: string}} [blockAt]
 * @param {number} [share]                       fraction of name-capable blocks that carry a name
 * @returns {((spec: {i: number, shape: string}) => string|null) & {idAt: (i: number) => string|null}}
 *          null: no name on this block; `idAt(i)` is the sponsor behind the name on block i (null: none)
 */
export function createBlockNamer(block, seed, blockAt = null, share = 1) {
  const seen = new Set();
  const list = asList(block)
    .map(cleanBlock)
    .filter((s) => {
      if (!s || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    })
    .sort(byId);
  if (!list.length) return Object.assign(() => null, { idAt: () => null });

  const rate = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 1;
  const rng = createRng(seed).fork('sponsors');
  for (let k = list.length - 1; k > 0; k--) {
    const j = Math.floor(rng.next() * (k + 1));
    [list[k], list[j]] = [list[j], list[k]];
  }
  const names = list.map((s) => s.name);
  const ids = list.map((s) => s.id);
  // Evenly spread picks: every name-capable block adds `rate` to a running sum and takes a name
  // whenever it reaches 1. The seed only decides where in the cycle the tower starts.
  let phase = rate < 1 ? createRng(seed).fork('sponsors-share').next() : 0;

  const shapes = []; // shape per block number, as far as it has been seen
  const named = []; // memo: name or null per block number, always filled as a prefix
  const namedId = []; // the sponsor behind each name
  let turn = 0; // whose turn it is
  let nextAuto = 0;

  function shapeOf(i) {
    if (typeof blockAt === 'function') {
      try {
        const s = blockAt(i)?.shape;
        if (typeof s === 'string') return s;
      } catch {
        /* fall back to what has been seen */
      }
    }
    return shapes[i] ?? 'plank';
  }

  function fillUpTo(i) {
    while (named.length <= i) {
      const shape = shapeOf(named.length);
      const name = names[turn % names.length];
      let take = false;
      if (canNameShape(shape, name)) {
        phase += rate;
        if (phase >= 1 - 1e-9) {
          phase -= 1;
          take = true;
        }
      }
      named.push(take ? name : null);
      namedId.push(take ? ids[turn % ids.length] : null);
      if (take) turn++;
    }
  }

  const namer = (spec) => {
    if (!isObj(spec)) return null;
    const given = spec.i ?? spec.index;
    const i = Number.isInteger(given) && given >= 0 ? given : nextAuto;
    nextAuto = i + 1;
    if (shapes[i] === undefined && typeof spec.shape === 'string') shapes[i] = spec.shape;
    fillUpTo(i);
    return named[i];
  };
  namer.idAt = (i) => (Number.isInteger(i) && i >= 0 && i < namedId.length ? namedId[i] : null);
  return namer;
}
