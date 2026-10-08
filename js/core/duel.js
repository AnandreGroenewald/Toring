// Uitdagersreeks (head-to-head; docs/CHALLENGE-SPEC.md): the referee that decides who reached each
// height mark first and who won (the same code runs in the game and on the server), recordings of a
// run, playing a recording back as an opponent, the computer's run, nicknames and challenge links.
// Pure: importable in node (unit tested) and by the Worker (server/src/match.js).

import { createRng } from './rng.js';
import { checkName } from './nameRules.js';
import { DUEL } from '../config.js';

export const DUEL_SEED_PREFIX = 'duel/';
export const OVER_REASONS = ['lives', 'flood', 'quit'];
// How a recorded run ended: it reached the goal, it fell (hearts / flood / quit), or it simply stopped
// because the match was decided the other way (that tower still stands where it was).
const END_CODE = { goal: 'g', lives: 'l', flood: 'f', quit: 'q', stop: 's' };
const END_NAME = { g: 'goal', l: 'lives', f: 'flood', q: 'quit', s: 'stop' };
const SEED_RE = /^[a-z0-9]{4,24}$/;
const LINK_MAX = 2400;
const MAX_SAMPLES = Math.floor(DUEL.maxRunMs / DUEL.sampleMs) + 1;
const MAX_DM = DUEL.maxHeightM * 10;
const MARK_DM = [...DUEL.marks, DUEL.goalM].map((m) => m * 10);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The block sequence seed of a match: its own namespace, so a match never replays a daily or a practice. */
export const duelSeedKey = (seed) => `${DUEL_SEED_PREFIX}${seed}`;
export const isMatchSeed = (s) => typeof s === 'string' && SEED_RE.test(s);

/** A fresh match seed: 10 base-36 characters (`rand` is injectable for tests). */
export function newMatchSeed(rand = Math.random) {
  let s = '';
  for (let k = 0; k < 10; k++) s += Math.floor(rand() * 36).toString(36);
  return s;
}

/** The visitor a height mark sends ('monkey' | 'thief'), or null. */
export const attackFor = (m) => DUEL.attackFor[m] || null;

/** What the first to a height mark may send: Blouaap, Skelm Sakkie, Mis or Hittegolf (they choose). */
export const PUNISHMENTS = Object.freeze([...DUEL.punishments]);
export const isPunishment = (k) => PUNISHMENTS.includes(k);

/** Robot Rikus's (or a recording's) choice at height mark m: seeded, so a rematch on that tower is the same. */
export const botPunishment = (seed, m) => createRng(`${seed}/punish/${m}`).pick(PUNISHMENTS);

// ---------------------------------------------------------------------------------- referee
/**
 * Decides, in the order the reports arrive, who reached each height mark first (that player's
 * visitor goes to the other tower) and who won: the first to the goal, or else the player whose
 * tower is still standing when the other one falls (hearts, flood or quitting). Heights are best
 * heights: they never go down, so a tower that lost blocks has to climb back past a mark.
 * report() returns events: { type: 'attack', from, to, m, kind } and { type: 'result', winner, reason }.
 */
export function createReferee({ goalM = DUEL.goalM, marks = DUEL.marks, init = null } = {}) {
  // `init` is a snapshot() from before (a live room that slept between messages)
  const best = Array.isArray(init?.best) ? init.best.slice(0, 2).map((v) => Math.max(0, Number(v) || 0)) : [0, 0];
  const claimed = new Map(Array.isArray(init?.claimed) ? init.claimed.filter(([m, p]) => marks.includes(m) && (p === 0 || p === 1)) : []);
  let result = init?.result && (init.result.winner === 0 || init.result.winner === 1) ? { ...init.result } : null;
  const done = () => [{ type: 'result', ...result }];
  return {
    get result() {
      return result;
    },
    snapshot: () => ({ best: [...best], claimed: [...claimed], result: result ? { ...result } : null }),
    best: (p) => best[p] ?? 0,
    claimedBy: (m) => (claimed.has(m) ? claimed.get(m) : null),
    /** Player p (0 or 1) reports its best height h (m) and/or that its tower fell (`over`). */
    report(p, { h, over } = {}) {
      if (result || (p !== 0 && p !== 1)) return [];
      const ev = [];
      if (Number.isFinite(h) && h > best[p]) best[p] = Math.min(h, DUEL.maxHeightM);
      for (const m of marks) {
        if (best[p] >= m && !claimed.has(m)) {
          claimed.set(m, p);
          ev.push({ type: 'attack', from: p, to: 1 - p, m, kind: attackFor(m) });
        }
      }
      if (best[p] >= goalM) result = { winner: p, reason: 'goal' };
      else if (over) result = { winner: 1 - p, reason: OVER_REASONS.includes(over) ? over : 'quit' };
      return result ? ev.concat(done()) : ev;
    },
    /** A live player left the match: the other one wins (if nothing was decided yet). */
    leave(p) {
      if (result || (p !== 0 && p !== 1)) return [];
      result = { winner: 1 - p, reason: 'left' };
      return done();
    },
  };
}

// ---------------------------------------------------------------------------------- recordings
/** A height (m) in tenths for a recording: rounded, but never up onto a height mark or the goal (9,97 m stays 9,9). */
export function heightDm(h) {
  const x = clamp(Number(h) || 0, 0, DUEL.maxHeightM) * 10;
  const dm = Math.round(x);
  return dm > x && MARK_DM.includes(dm) ? dm - 1 : dm;
}

/**
 * Records a run: the tower's height once a second (stored in decimetres) and how and when it
 * ended. add() may be called every frame; the last height in each second is kept.
 */
export function createRecorder(sampleMs = DUEL.sampleMs) {
  const samples = [];
  let end = null;
  let endT = 0;
  return {
    add(tMs, h) {
      if (end || !Number.isFinite(tMs) || tMs < 0) return;
      const k = Math.floor(tMs / sampleMs);
      if (k >= MAX_SAMPLES) return;
      const dm = heightDm(h);
      while (samples.length <= k) samples.push(samples.length ? samples[samples.length - 1] : 0);
      samples[k] = dm;
    },
    finish(tMs, reason) {
      if (end) return;
      end = END_CODE[reason] ? reason : 'quit';
      endT = clamp(Math.round(Number(tMs) || 0), 0, DUEL.maxRunMs);
    },
    get ended() {
      return !!end;
    },
    run() {
      return { samples: samples.length ? [...samples] : [0], endT, end: end || 'quit' };
    },
  };
}

/**
 * A recorded tower's height (m) at match time t. Sample k is the height at the end of second k. It
 * counts from the middle of that second, so a recording is as often a little early as a little late
 * (never ahead on average); the last one counts from the moment the run ended. 0 m before the first.
 */
export function heightAt(run, tMs) {
  const s = run && Array.isArray(run.samples) ? run.samples : [];
  const n = s.length;
  if (!n) return 0;
  const S = DUEL.sampleMs;
  const t = Math.max(0, Number(tMs) || 0);
  const endT = Number(run.endT) || 0;
  // (a link keeps endT to 0,1 s, which can round it up onto the end of the last second)
  const lastAt = endT >= (n - 1) * S && endT <= n * S ? endT : (n - 0.5) * S;
  if (t >= lastAt) return s[n - 1] / 10;
  const k = Math.min(Math.floor(t / S - 0.5), n - 2);
  return k < 0 ? 0 : s[k] / 10;
}

/**
 * A recording played as an opponent. A punishment takes DUEL.ghostPenaltyM off its tower from
 * then on (Blouaap 3 m, Skelm Sakkie 4 m, Mis and Hittegolf 2 m). step(t) -> { h: its tower now, best: its best height so
 * far, over: why it fell, or null }. A run that reached the goal or simply stopped never "falls".
 */
export function createGhost(run) {
  let penalty = 0;
  let best = 0;
  return {
    run,
    get penalty() {
      return penalty;
    },
    hit(kind) {
      penalty += DUEL.ghostPenaltyM[kind] || 0;
    },
    step(tMs) {
      const h = Math.max(0, heightAt(run, tMs) - penalty);
      if (h > best) best = h;
      const over = OVER_REASONS.includes(run.end) && tMs >= run.endT ? run.end : null;
      return { h, best, over };
    },
  };
}

// ---------------------------------------------------------------------------------- the computer
/**
 * Robot Rikus's run for a match seed: a block every 3-5 s (now and then one in the sea, or a little
 * collapse), about 0,30-0,42 m/s, and about one game in four it falls before the goal. The same seed
 * always gives the same run, so a rematch on the same tower is the same race.
 */
export function botRun(seed) {
  const r = createRng(`${seed}/robot`);
  const pace = r.float(0.85, 1.15);
  const fallAt = r.chance(0.25) ? r.float(16, 46) : Infinity;
  const fallWhy = r.chance(0.5) ? 'lives' : 'flood';
  const rec = createRecorder();
  let h = 0;
  let next = 2600;
  rec.add(0, 0);
  for (let t = 250; t <= DUEL.maxRunMs; t += 250) {
    if (t >= next) {
      const roll = r.next();
      if (roll < 0.05) h = Math.max(0, h - r.float(1.5, 4.5));   // a small collapse
      else if (roll >= 0.15) h += r.float(1.4, 2.2);             // (0.05-0.15: the block went in the sea)
      next = t + r.float(3000, 4800) / pace;
    }
    rec.add(t, h);
    if (h >= DUEL.goalM) {
      rec.finish(t, 'goal');
      break;
    }
    if (h >= fallAt) {
      rec.finish(t, fallWhy);
      break;
    }
  }
  if (!rec.ended) rec.finish(DUEL.maxRunMs, 'quit');
  return rec.run();
}

// ---------------------------------------------------------------------------------- nicknames
/** A nickname that passes the name rules (max DUEL.nameMax characters), else null. */
export function cleanNickname(raw) {
  if (typeof raw !== 'string') return null;
  const c = checkName(raw, { max: DUEL.nameMax });
  return c.ok ? c.value : null;
}

/** The default nickname: "Bouer 123". A number the name rules refuse (455 reads as a rude word) gives way to the next. */
export function defaultNickname(rand = Math.random) {
  let n = 100 + Math.floor(rand() * 900);
  for (let k = 0; k < 900; k++) {
    const name = `Bouer ${n}`;
    if (cleanNickname(name) === name) return name;
    n = n >= 999 ? 100 : n + 1;
  }
  return 'Bouer';
}

/** The same default nickname every visit for one player number (the phone's leaderboard number). */
export function defaultNicknameFor(player) {
  const n = typeof player === 'string' ? parseInt(player.slice(0, 6), 36) : NaN;
  return Number.isFinite(n) ? defaultNickname(() => n / 36 ** 6) : defaultNickname();
}

// ---------------------------------------------------------------------------------- challenge links
// "?teen=<payload>": a whole run in the link, so a friend can play against it later without any
// server. Payload: "1.<seed>.<nickname, base64url>.<data, base64url>", where data is
// varint(endT / 100 ms), the end code, varint(sample count) and the samples as zigzag deltas.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

function toB64url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const len = Math.min(3, bytes.length - i);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (len > 1) out += B64[(n >> 6) & 63];
    if (len > 2) out += B64[n & 63];
  }
  return out;
}

function fromB64url(str) {
  if (typeof str !== 'string' || str.length % 4 === 1) return null;
  const out = [];
  for (let i = 0; i < str.length; i += 4) {
    const chunk = str.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const c = chunk[k];
      const v = c === undefined ? 0 : B64_INDEX.get(c);
      if (v === undefined) return null;
      n = (n << 6) | v;
    }
    out.push((n >> 16) & 255);
    if (chunk.length > 2) out.push((n >> 8) & 255);
    if (chunk.length > 3) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

function pushVarint(out, n) {
  let v = n;
  while (v >= 128) {
    out.push((v & 127) | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

function readVarint(bytes, pos) {
  let v = 0;
  let mul = 1;
  for (let k = 0; k < 4; k++) {
    if (pos.i >= bytes.length) return null;
    const b = bytes[pos.i++];
    v += (b & 127) * mul;
    if (b < 128) return v;
    mul *= 128;
  }
  return null;   // longer than any value we write
}

const zig = (n) => (n < 0 ? -2 * n - 1 : 2 * n);
const unzig = (z) => (z % 2 ? -(z + 1) / 2 : z / 2);

/** The challenge payload for a finished run, or '' when it can't be one. */
export function encodeChallenge({ seed, name, run }) {
  if (!isMatchSeed(seed) || !run || !Array.isArray(run.samples) || !run.samples.length) return '';
  const data = [];
  pushVarint(data, Math.round(clamp(run.endT, 0, DUEL.maxRunMs) / 100));
  data.push((END_CODE[run.end] || 'q').charCodeAt(0));
  const samples = run.samples.slice(0, MAX_SAMPLES);
  pushVarint(data, samples.length);
  let prev = 0;
  for (const s of samples) {
    const v = clamp(Math.round(s), 0, MAX_DM);
    pushVarint(data, zig(v - prev));
    prev = v;
  }
  const nick = cleanNickname(name) || '';
  const payload = `1.${seed}.${toB64url(new TextEncoder().encode(nick))}.${toB64url(Uint8Array.from(data))}`;
  return payload.length <= LINK_MAX ? payload : '';
}

/** { seed, name, run } from a challenge payload, or null for anything malformed (never throws). */
export function decodeChallenge(payload) {
  try {
    if (typeof payload !== 'string' || payload.length > LINK_MAX) return null;
    const parts = payload.split('.');
    if (parts.length !== 4 || parts[0] !== '1' || !isMatchSeed(parts[1])) return null;
    const nameBytes = fromB64url(parts[2]);
    const data = fromB64url(parts[3]);
    if (!nameBytes || !data || nameBytes.length > 64) return null;
    const name = nameBytes.length ? cleanNickname(new TextDecoder('utf-8', { fatal: true }).decode(nameBytes)) : null;
    const pos = { i: 0 };
    const endT = readVarint(data, pos);
    if (endT === null || endT * 100 > DUEL.maxRunMs || pos.i >= data.length) return null;
    const end = END_NAME[String.fromCharCode(data[pos.i++])];
    const n = readVarint(data, pos);
    if (!end || n === null || n < 1 || n > MAX_SAMPLES) return null;
    const samples = [];
    let prev = 0;
    for (let k = 0; k < n; k++) {
      const z = readVarint(data, pos);
      if (z === null) return null;
      prev += unzig(z);
      if (prev < 0 || prev > MAX_DM) return null;
      samples.push(prev);
    }
    if (pos.i !== data.length) return null;
    return { seed: parts[1], name, run: { samples, endT: endT * 100, end } };
  } catch {
    return null;
  }
}

/** The challenge link: the site URL with "?teen=<payload>" (or the bare site URL when there is no run). */
export function challengeLink(baseUrl, challenge) {
  const base = String(baseUrl || '');
  const payload = encodeChallenge(challenge || {});
  if (!payload) return base;
  return `${base}${base.includes('?') ? '&' : '?'}teen=${payload}`;
}

/** The challenge from a page's query string ('?teen=...'), or null. Repeated parameters are refused. */
export function parseChallengeQuery(search) {
  if (typeof search !== 'string' || !search) return null;
  let q;
  try {
    q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return null;
  }
  const all = q.getAll('teen');
  return all.length === 1 ? decodeChallenge(all[0]) : null;
}

// ---------------------------------------------------------------------------------- live rooms
// "?kamer=<CODE>": a friend's live room. Codes avoid look-alike characters (no 0/O, 1/I/L).
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_RE = new RegExp(`^[${ROOM_ALPHABET}]{6}$`);
export const isRoomCode = (s) => typeof s === 'string' && ROOM_RE.test(s);

/** A new room code from random 32-bit numbers (`rand32` is injectable for tests). */
export function newRoomCode(rand32) {
  let s = '';
  for (let k = 0; k < 6; k++) s += ROOM_ALPHABET[rand32() % ROOM_ALPHABET.length];
  return s;
}

export function parseRoomQuery(search) {
  if (typeof search !== 'string' || !search) return null;
  let q;
  try {
    q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return null;
  }
  const all = q.getAll('kamer');
  if (all.length !== 1) return null;
  const code = all[0].toUpperCase();
  return isRoomCode(code) ? code : null;
}

/** A live height report, cleaned: { h, best, over } (heights in m, `over` a reason or null), or null. */
export function cleanReport(o) {
  if (!o || typeof o !== 'object') return null;
  const h = Number(o.h);
  const best = Number(o.best);
  if (!Number.isFinite(h) || !Number.isFinite(best) || h < 0 || best < 0) return null;
  const over = o.over == null ? null : OVER_REASONS.includes(o.over) ? o.over : 'quit';
  return { h: Math.min(h, DUEL.maxHeightM), best: Math.min(best, DUEL.maxHeightM), over };
}
