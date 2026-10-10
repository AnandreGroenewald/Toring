// Uitdagersreeks live matches (docs/CHALLENGE-SPEC.md). MatchLobby (one instance) pairs players who are
// looking (the same mode and rules) and keeps recent runs for players nobody is around to play;
// MatchRoom (one per match, named by its code) runs one of two modes:
//  - Wedloop ('race'): relays the heights, decides the height marks and the winner with the game's own
//    referee (js/core/duel.js) and hands both runs to the lobby at the end;
//  - Blok vir Blok ('turns', 1.11): one tower, a block each in turn. The game whose turn it is plays
//    the block and reports where the tower came to rest; the room passes that on and keeps the score
//    with js/core/turns.js (whose turn, hearts, jokers, the result), and ends a match whose turn
//    never comes back.
//
// Both use WebSocket hibernation, so a quiet room costs nothing, and both keep the match in memory
// while it runs, saving only at the moments that matter (start, a height mark, the result, and at
// most every few seconds): the Workers Free plan allows 100 000 storage writes a day.
//
// Protocol 5 (1.12.1): a game whose connection went (Wi-Fi to mobile data) keeps its seat for DUEL.rejoinMs and
// comes back on a new connection (?rejoin=1, its key), and gets what it missed again; a friend who opens the
// link sees who invites and may answer "Sorry, besig nou" ('decline'); a finished friend match starts again
// when both say "Speel weer" ('again'); and in a friend match a pause stops both games ('pause' / 'resume').

import { DUEL, TURNS, EMOTES, EMOTE } from '../../js/config.js';
import {
  createReferee, cleanNickname, cleanReport, decodeChallenge, encodeChallenge, heightDm, isMatchSeed, newMatchSeed, newRoomCode,
  isPunishment,
} from '../../js/core/duel.js';
import { cleanCard } from '../../js/core/economy.js';
import { createTurnReferee, cleanPose, cleanSnap, cleanRating, snapFits, firstSeat, SABOTAGES, cleanVis } from '../../js/core/turns.js';

const MSG_MAX = 512;                   // characters per message (the lobby)
const ROOM_MSG_MAX = 2048;             // in a room: a Blok vir Blok turn's report carries the loose top
const MSG_PER_SEC = 10;                // per player
const RANDOM_ROOM_TTL_MS = 2 * 60 * 1000;
const DONE_TTL_MS = 60 * 1000;         // a finished room says goodbye and is cleared after this
const SAVE_EVERY_MS = 5000;
const MIN_RUN_MS = 20 * 1000;          // shorter matches are not kept as recordings
const RUNS_MAX = 60;
const RUN_DAYS = 7;
const SLACK_M = 5;                     // a report may run this far ahead of the climb limit (lag, bursts)
const DEFAULT_NAME = 'Bouer';
const SEAT_KEY_RE = /^[a-z0-9]{8,32}$/;   // a game's own key for one room (a reconnect brings the same)
// The first to a height mark chooses the punishment ('choose' -> 'punish'). A player who doesn't answer
// in time (or a game older than protocol 2, which never asks) gets the mark's default punishment.
const CHOOSE_WAIT_MS = DUEL.chooseMs + 1500;
const PROTOCOL_CHOOSE = 2;
const PROTOCOL_TURNS = 3;   // a game older than this can't play Blok vir Blok: such a room is "gone" for it
const PROTOCOL_ROUNDS = 4;  // 1.12: Blok vir Blok rondtes (weather and visitors), only when both games know them
const PROTOCOL_V5 = 5;      // 1.12.1: back after a dropped connection, "Sorry, besig nou", "Speel weer", a pause for both

export const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
const randFloat = () => rand32() / 4294967296;
const round1 = (v) => Math.round(v * 10) / 10;

function sendJson(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // already gone
  }
}

function closeWs(ws, reason = '') {
  try {
    ws.close(1000, reason);
  } catch {
    // already closed
  }
}

function parseMsg(data, max = MSG_MAX) {
  if (typeof data !== 'string' || data.length > max) return null;
  try {
    const o = JSON.parse(data);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

/** What a socket carries through hibernation: { seat, hello, name, v, card } in a room, { at, hello } in the lobby. */
function att(ws) {
  try {
    return ws.deserializeAttachment() || {};
  } catch {
    return {};
  }
}

function seatOf(ws) {
  const a = att(ws);
  return a.seat === 0 || a.seat === 1 ? a.seat : -1;
}

/** The game's protocol from its hello (1: games before the punishment choice). */
const version = (ws) => att(ws).v || 1;

/** Messages per socket per second (kept in memory; approximate across hibernation, which is fine). */
function makeLimiter() {
  const seen = new WeakMap();
  return (ws, now) => {
    let b = seen.get(ws);
    if (!b || now - b.at >= 1000) {
      b = { at: now, n: 0 };
      seen.set(ws, b);
    }
    b.n += 1;
    return b.n <= MSG_PER_SEC;
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** A referee's turn event as the games hear it (the round fields only when there is a round). */
function turnMsg(e) {
  return {
    n: e.n, seat: e.seat, hearts: e.hearts, streaks: e.streaks, sab: e.sab,
    ...(e.ev ? { ev: e.ev } : {}), ...(e.nx ? { nx: e.nx } : {}),
  };
}

/** A 'visit' message's outcome: { what, at, idx } (idx: the blocks Skelm Sakkie took), or null. */
function cleanVisitMsg(msg) {
  const what = cleanVis(msg.what);
  if (!what || typeof msg.at !== 'number' || !Number.isFinite(msg.at) || msg.at < 0 || msg.at > 120000) return null;
  const idx = Array.isArray(msg.idx) ? msg.idx.filter((i) => Number.isInteger(i) && i >= 0 && i <= 5000).slice(0, 8) : [];
  return { what, at: Math.round(msg.at), idx: what === 'stole' ? idx : [] };
}

/** Accepts a WebSocket upgrade: [response for the client, server-side socket]. Injectable for tests. */
function defaultUpgrade() {
  // eslint-disable-next-line no-undef
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  return [new Response(null, { status: 101, webSocket: client }), server];
}

// ------------------------------------------------------------------------------------ the room
export class MatchRoom {
  constructor(state, env, { now = () => Date.now(), upgrade = defaultUpgrade } = {}) {
    this.state = state;
    this.env = env;
    this.now = now;
    this.upgrade = upgrade;
    this.m = null;          // the match (loaded from storage after the room slept)
    this.savedAt = 0;
    this.allow = makeLimiter();
  }

  async load() {
    if (!this.m) this.m = (await this.state.storage.get('m')) || null;
    // (a room saved before 1.12.1: its Wedloop ends as it always did)
    if (this.m && this.m.started && this.m.mode !== 'turns' && !this.m.endAt) this.m.endAt = this.m.startAt + DUEL.maxRunMs;
    return this.m;
  }

  async save() {
    this.savedAt = this.now();
    await this.state.storage.put('m', this.m);
  }

  sockets() {
    return this.state.getWebSockets();
  }

  socketFor(seat) {
    return this.sockets().find((s) => seatOf(s) === seat) || null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init') {
      if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      return this.init(body);
    }
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json(426, { error: 'websocket_expected' });
    const [response, server] = this.upgrade();
    await this.join(server, { rejoin: url.searchParams.get('rejoin') === '1' });
    return response;
  }

  /** A new room (from the lobby or POST /match/room): its seed, its mode and how long it waits for players. */
  async init({ seed, kind, mode } = {}) {
    if (await this.load()) return json(409, { error: 'exists' });
    const now = this.now();
    this.m = {
      seed: isMatchSeed(seed) ? seed : newMatchSeed(randFloat),
      kind: kind === 'random' ? 'random' : 'friend',
      mode: mode === 'turns' ? 'turns' : 'race',
      createdAt: now,
      names: [null, null],
      started: false,
      startAt: 0,
      ref: null,
      samples: [[], []],
      ends: [null, null],
      result: null,
      done: false,
    };
    await this.save();
    await this.state.storage.setAlarm(now + (this.m.kind === 'random' ? RANDOM_ROOM_TTL_MS : DUEL.roomWaitMs));
    return json(200, { ok: true, seed: this.m.seed, mode: this.m.mode });
  }

  /**
   * A player's socket: a free seat, or "gone" (no such room, full, started or over). (1.12.1) A game back
   * after its connection went (`rejoin`) waits for its hello: its key says which seat is its own.
   */
  async join(ws, { rejoin = false } = {}) {
    const m = await this.load();
    const taken = new Set(this.sockets().filter((s) => s !== ws).map(seatOf));
    const seat = !taken.has(0) ? 0 : !taken.has(1) ? 1 : -1;
    this.state.acceptWebSocket(ws);
    if (rejoin && m && m.started) {
      ws.serializeAttachment({ seat: -1, hello: false, name: null, rejoin: true });
      return;
    }
    if (!m || m.started || m.done) {
      sendJson(ws, { t: 'gone' });
      closeWs(ws, 'gone');
      return;
    }
    // the hello lives on the socket: a friend room may sleep for minutes before the second player comes.
    // Both seats taken: this may be a player back on a new connection while their old one still counts
    // (a network change closes it on the phone, not here); their hello's key decides (onMessage).
    ws.serializeAttachment({ seat, hello: false, name: null });
    // (1.12.1) a friend room says who invites, so the friend's game can ask "Speel" or "Sorry, besig nou"
    sendJson(ws, m.kind === 'friend' && m.host ? { t: 'wait', host: { name: m.host.name, mode: m.mode } } : { t: 'wait' });
  }

  async webSocketMessage(ws, data) {
    await this.onMessage(ws, typeof data === 'string' ? data : '');
  }

  async webSocketClose(ws) {
    await this.onClose(ws);
  }

  async webSocketError(ws) {
    await this.onClose(ws);
  }

  async onMessage(ws, data) {
    const now = this.now();
    if (!this.allow(ws, now)) return;
    const msg = parseMsg(data, ROOM_MSG_MAX);
    const m = await this.load();
    let seat = seatOf(ws);
    if (!msg || !m) return;
    // a finished match hears only "Speel weer" and a game back on a new connection (1.12.1)
    if (m.done && msg.t !== 'again' && !(msg.t === 'hello' && att(ws).rejoin)) return;
    if (m.mode !== 'turns' && data.length > MSG_MAX) return;   // only a Blok vir Blok report is that long

    if (msg.t === 'hello') {
      if (att(ws).rejoin) {
        await this.rejoin(ws, msg, now);
        return;
      }
      if (m.started || att(ws).replaced) {
        // (1.12.1) a friend who read the invite while someone else took the seat: the room is gone for them
        if (m.started && !att(ws).replaced && seatOf(ws) < 0) {
          sendJson(ws, { t: 'gone' });
          closeWs(ws, 'gone');
        }
        return;
      }
      // A player back on a new connection (the game's key for this room is the same): their old
      // connection goes and can never start the match, whether or not it ever closed here.
      const key = typeof msg.key === 'string' && SEAT_KEY_RE.test(msg.key) ? msg.key : null;
      if (key) {
        for (const s of this.sockets()) {
          if (s === ws || att(s).key !== key) continue;
          if (seat < 0) seat = seatOf(s);
          s.serializeAttachment({ ...att(s), seat: -1, hello: false, key: null, replaced: true });
          closeWs(s, 'replaced');
        }
      }
      // (1.12.1) a friend who read the invite first holds no seat yet: a free one now, if there is one
      if (seat < 0) {
        const held = new Set(this.sockets().filter((s) => s !== ws).map(seatOf));
        seat = !held.has(0) ? 0 : !held.has(1) ? 1 : -1;
      }
      if (seat < 0) {   // both seats are someone else's
        sendJson(ws, { t: 'gone' });
        closeWs(ws, 'gone');
        return;
      }
      const v = Math.max(1, Math.min(99, Math.floor(Number(msg.v)) || 1));
      if (m.mode === 'turns' && v < PROTOCOL_TURNS) {   // (1.10 and older would start a Wedloop here)
        ws.serializeAttachment({ ...att(ws), seat: -1, hello: false });
        sendJson(ws, { t: 'gone' });
        closeWs(ws, 'old');
        return;
      }
      // the player card (looks and rank, js/core/economy.js) goes to the other player as known ids only
      ws.serializeAttachment({ seat, hello: true, name: cleanNickname(msg.name) || DEFAULT_NAME, v, card: cleanCard(msg.card), key });
      // (1.12.1) a friend room: who invites (the friend's game shows it), and a "Sorry, besig nou" that came
      // while the host's game was away (sharing the link) is passed on now
      const isHost = !!key && m.host?.key === key;
      if (m.kind === 'friend' && (!m.host || (m.declines?.length && isHost && v >= PROTOCOL_V5))) {
        if (!m.host) m.host = { name: cleanNickname(msg.name) || DEFAULT_NAME, key };
        else {
          for (const name of m.declines || []) sendJson(ws, { t: 'declined', name });
          m.declines = [];
        }
        await this.save();
      }
      const both = [this.socketFor(0), this.socketFor(1)];
      if (both.every((s) => s && att(s).hello)) await this.start(now);
      return;
    }
    if (msg.t === 'decline') {
      await this.decline(ws, msg);
      return;
    }
    if (msg.t === 'look') {   // (1.12.1) a friend reading the invite: no seat until "Speel" (the link may be a group's)
      if (!m.started && !att(ws).hello) ws.serializeAttachment({ ...att(ws), seat: -1, look: true });
      return;
    }
    if (seat < 0) return;
    if (msg.t === 'again') {
      await this.again(seat, now);
      return;
    }
    if (!m.started || m.result) return;
    if (msg.t === 'pause') {
      await this.pause(seat, now);
      return;
    }
    if (msg.t === 'resume') {
      if (m.paused) await this.resume(now);
      return;
    }
    if (msg.t === 'emote') {   // (1.12) an emoji reaction, in either mode
      this.onEmote(seat, msg, now);
      return;
    }
    if (m.mode === 'turns') {
      await this.onTurnMessage(seat, msg, now);
      return;
    }
    // a choice nobody made in time gets the default (checked whenever either player says anything)
    if (await this.expireChoices(now)) await this.save();
    if (msg.t === 'punish') {
      const c = (m.pending || []).find((p) => p.m === msg.m && p.seat === seat);
      if (c && isPunishment(msg.kind)) {
        this.punish(c, msg.kind);
        await this.save();
      }
      return;
    }
    if (msg.t !== 'state' && msg.t !== 'over') return;

    const r = cleanReport(msg.t === 'over' ? { h: msg.best, best: msg.best, over: msg.reason ?? 'quit' } : msg);
    if (!r) return;
    // nobody climbs faster than DUEL.maxClimbMps: impossible numbers are cut back
    const cap = DUEL.maxClimbMps * (Math.max(0, now - m.startAt) / 1000) + SLACK_M;
    const h = Math.min(r.h, cap);
    const best = Math.min(r.best, cap);

    const ref = createReferee({ init: m.ref });
    const events = ref.report(seat, { h: best, over: msg.t === 'over' ? r.over : null });
    m.ref = ref.snapshot();
    // the recording keeps the best height (what decides the race), not the top with a block in the air
    this.record(seat, now, ref.best(seat));
    const other = this.socketFor(1 - seat);
    // (1.11: the player's hearts too, so the other one sees them; older games send none)
    const lives = Number.isInteger(msg.lives) && msg.lives >= 0 && msg.lives <= 9 ? msg.lives : null;
    const opp = { t: 'opp', h: round1(h), best: round1(ref.best(seat)), ...(lives !== null ? { lives } : {}) };
    if (msg.t === 'state') {
      if (other) sendJson(other, opp);
      (m.last ||= [null, null])[seat] = opp;   // (1.12.1) what the other game is told again when it comes back
    }
    let important = false;
    for (const e of events) {
      if (e.type === 'attack') {
        // first to a height mark: they choose what the other tower gets (e.kind is the default)
        important = true;
        const c = { m: e.m, seat: e.from, def: e.kind, at: now };
        const from = this.socketFor(e.from);
        // (1.12.1: a game away for a moment chooses when it's back, within the same time)
        const asks = from ? version(from) >= PROTOCOL_CHOOSE : !!m.away?.[e.from] && (m.v?.[e.from] || 1) >= PROTOCOL_V5;
        if (asks) {
          (m.pending ||= []).push(c);
          this.tell(e.from, { t: 'choose', m: e.m, def: e.kind });
        } else {
          this.punish(c, e.kind);   // an older game never asks: the default goes at once
        }
      } else if (e.type === 'result') {
        important = true;
        const loser = 1 - e.winner;
        m.ends[e.winner] = e.reason === 'goal' ? 'goal' : 'stop';
        m.ends[loser] = e.reason === 'goal' ? 'stop' : e.reason;
        await this.decided(ref, e, now);
      }
    }
    if (important || now - this.savedAt >= SAVE_EVERY_MS) await this.save();
  }

  /**
   * (1.12) An emoji reaction goes to the other player: a known one only, at most one every
   * EMOTE.serverGapMs and EMOTE.serverMax in a match per player (kept in memory: never a storage write).
   */
  onEmote(seat, msg, now) {
    const e = typeof msg.e === 'string' && Object.hasOwn(EMOTES, msg.e) ? msg.e : null;
    if (!e) return;
    const st = this.emoteState || (this.emoteState = [{ at: -Infinity, n: 0 }, { at: -Infinity, n: 0 }]);
    const mine = st[seat];
    if (now - mine.at < EMOTE.serverGapMs || mine.n >= EMOTE.serverMax) return;
    mine.at = now;
    mine.n += 1;
    const other = this.socketFor(1 - seat);
    if (other) sendJson(other, { t: 'emote', e });
  }

  /**
   * (1.12.1) A message for a seat. To a game that can come back on a new connection (protocol 5) it is also
   * kept, and sent again when it does: everything that matters in a Wedloop (choose, attack, sent, the
   * result); in Blok vir Blok the messages of this turn and the one before (a report carries the tower).
   */
  tell(seat, msg, { quiet = false } = {}) {
    const m = this.m;
    if ((m.v?.[seat] || 1) >= PROTOCOL_V5) {
      const log = (m.log ||= [[], []]);
      const n = Number.isInteger(msg.n) ? msg.n : m.tref?.n || 0;
      log[seat].push({ n, msg });
      if (m.mode === 'turns') log[seat] = log[seat].filter((x) => x.n >= (m.tref?.n || 0) - 1);
    }
    const s = quiet ? null : this.socketFor(seat);   // (quiet: kept only, it went with the start)
    if (s) sendJson(s, msg);
  }

  /** (1.12.1) The turn a joker message belongs to, for a game of protocol 5 (older ones get the message as before). */
  turnTag(seat, n) {
    return (this.m.v?.[seat] || 1) >= PROTOCOL_V5 ? { n } : {};
  }

  /** (1.12.1) True the first time a turn's 'go', 'drop' or 'visit' is passed on (a game back sends its own again). */
  firstRelay(kind, n) {
    const m = this.m;
    if (!m.relayed || m.relayed.n !== n) m.relayed = { n };
    if (m.relayed[kind]) return false;
    m.relayed[kind] = true;
    return true;
  }

  /** The chooser's punishment goes to the other player ('attack'), and back to them as 'sent'. */
  punish(c, kind) {
    const m = this.m;
    m.pending = (m.pending || []).filter((p) => p !== c);
    const to = this.socketFor(1 - c.seat);
    const from = this.socketFor(c.seat);
    // a game older than protocol 2 only takes the mark's default (and the chooser hears what went)
    const k = !to || kind === c.def || version(to) >= PROTOCOL_CHOOSE ? kind : c.def;
    this.tell(1 - c.seat, { t: 'attack', m: c.m, kind: k });
    this.tell(c.seat, { t: 'sent', m: c.m, kind: k });
  }

  /** Choices older than CHOOSE_WAIT_MS get their default. True when something changed. */
  async expireChoices(now) {
    const late = (this.m.pending || []).filter((p) => now - p.at >= CHOOSE_WAIT_MS);
    for (const c of late) this.punish(c, c.def);
    return late.length > 0;
  }

  async onClose(ws) {
    const m = await this.load();
    const seat = seatOf(ws);
    if (!m || seat < 0) return;
    const now = this.now();
    if (m.started && !m.result) {
      // (1.12.1) a game that can come back (protocol 5) keeps its seat a while: a network change, a tunnel.
      // The other game hears it; a Blok vir Blok turn of theirs waits for them.
      if (version(ws) >= PROTOCOL_V5) {
        (m.away ||= [0, 0])[seat] = now + DUEL.rejoinMs;
        const other = this.socketFor(1 - seat);
        if (other && version(other) >= PROTOCOL_V5) sendJson(other, { t: 'away' });
        if (m.mode === 'turns' && m.tref?.seat === seat) m.deadline = Math.max(m.deadline || 0, m.away[seat] + 1000);
        await this.save();
        await this.armAlarm(now);
        return;
      }
      await this.leaveSeat(seat, now);
      await this.save();
      return;
    }
    // (1.12.1) a finished friend match: the other game hears this player went (no "Speel weer" with them)
    if (m.result && m.kind === 'friend') {
      if (m.again) m.again[seat] = false;
      const other = this.socketFor(1 - seat);
      if (other && version(other) >= PROTOCOL_V5) sendJson(other, { t: 'bye' });
    }
  }

  /** A player left the match (or didn't come back in time): the other one wins. */
  async leaveSeat(seat, now) {
    const m = this.m;
    if (m.mode === 'turns') {
      const ref = createTurnReferee({ init: m.tref });
      const [e] = ref.leave(seat);
      m.tref = ref.snapshot();
      if (e) await this.decidedTurns(e, now);
      return;
    }
    const ref = createReferee({ init: m.ref });
    const [e] = ref.leave(seat);
    m.ref = ref.snapshot();
    m.ends[seat] = 'quit';
    m.ends[1 - seat] = 'stop';
    if (e) await this.decided(ref, e, now);
  }

  /**
   * (1.12.1) A game back on a new connection (its key): its seat again, where the match is now, and what it
   * may have missed. Its old connection, if this room never heard it close, goes (and never counts as leaving).
   */
  async rejoin(ws, msg, now) {
    const m = this.m;
    const key = typeof msg.key === 'string' && SEAT_KEY_RE.test(msg.key) ? msg.key : null;
    const seat = key && Array.isArray(m.keys) ? m.keys.indexOf(key) : -1;
    const v = Math.max(1, Math.min(99, Math.floor(Number(msg.v)) || 1));
    if (seat < 0 || v < PROTOCOL_V5 || (m.done && !m.result)) {
      ws.serializeAttachment({ ...att(ws), rejoin: false });
      sendJson(ws, { t: 'gone' });
      closeWs(ws, 'gone');
      return;
    }
    for (const s of this.sockets()) {
      if (s === ws || seatOf(s) !== seat) continue;
      s.serializeAttachment({ ...att(s), seat: -1, hello: false, key: null, replaced: true });
      closeWs(s, 'replaced');
    }
    ws.serializeAttachment({ seat, hello: true, name: m.names[seat] || DEFAULT_NAME, v, card: cleanCard(msg.card), key });
    const wasAway = !!m.away?.[seat];
    if (m.away) m.away[seat] = 0;
    const other = this.socketFor(1 - seat);
    if (wasAway && !m.result && other && version(other) >= PROTOCOL_V5) sendJson(other, { t: 'back' });
    const state = { t: 'rejoined', you: seat };
    if (m.mode !== 'turns') state.opp = m.last?.[1 - seat] || null;
    else if (!m.result && m.tref?.seat === seat) m.deadline = Math.max(m.deadline || 0, now + TURNS.serverTurnMs);
    if (m.paused) state.paused = { by: m.paused.by, ms: Math.max(0, m.paused.until - now), left: m.pauses?.[seat] ?? 0 };
    sendJson(ws, state);
    for (const x of m.log?.[seat] || []) sendJson(ws, x.msg);
    await this.save();
    await this.armAlarm(now);
  }

  /**
   * (1.12.1) The friend who opened the link answered "Sorry, besig nou": whoever waits in the room hears it
   * (or hears it when their game is back), and the room stays open for anyone else the link went to.
   */
  async decline(ws, msg) {
    const m = this.m;
    if (m.started || m.kind !== 'friend' || att(ws).hello) return;
    const name = cleanNickname(msg.name) || DEFAULT_NAME;
    let told = false;
    for (const s of this.sockets()) {   // (the one who invited only: not another friend already in)
      if (s === ws || !att(s).hello || !m.host?.key || att(s).key !== m.host.key) continue;
      sendJson(s, { t: 'declined', name });
      if (version(s) >= PROTOCOL_V5) told = true;
    }
    if (!told) {
      m.declines = [...(m.declines || []), name].slice(-5);
      await this.save();
    }
    ws.serializeAttachment({ ...att(ws), seat: -1 });
    closeWs(ws, 'declined');
  }

  /** (1.12.1) "Speel weer" after a friend match: once both said it, a new match in the same room. */
  async again(seat, now) {
    const m = this.m;
    if (!m.result || m.kind !== 'friend') return;
    const me = this.socketFor(seat);
    const other = this.socketFor(1 - seat);
    if (!other || version(other) < PROTOCOL_V5) {
      if (me) sendJson(me, { t: 'bye' });
      return;
    }
    (m.again ||= [false, false])[seat] = true;
    if (m.again[1 - seat]) {
      await this.restart(now);
      return;
    }
    sendJson(other, { t: 'again' });
    await this.save();
  }

  /** A new match in this room: a new seed, the same mode and players (their sockets carry name, card and key). */
  async restart(now) {
    const old = this.m;
    this.m = {
      seed: newMatchSeed(randFloat), kind: old.kind, mode: old.mode, createdAt: now, names: [null, null], started: false,
      startAt: 0, ref: null, samples: [[], []], ends: [null, null], result: null, done: false, host: old.host || null,
      declines: [], round: (old.round || 1) + 1,
    };
    this.emoteState = null;
    await this.start(now);
  }

  /**
   * (1.12.1) A friend match: a pause stops both games (each player DUEL.pauses times, at most DUEL.pauseMs
   * each). Not while one of them is away, and not with a game that doesn't know it: then 'nopause'.
   */
  async pause(seat, now) {
    const m = this.m;
    const socks = [this.socketFor(0), this.socketFor(1)];
    const pauses = (m.pauses ||= [DUEL.pauses, DUEL.pauses]);
    const ok = m.kind === 'friend' && !m.paused && now >= m.startAt && pauses[seat] > 0
      && socks.every((s) => s && version(s) >= PROTOCOL_V5) && !(m.away || []).some(Boolean);
    if (!ok) {
      if (socks[seat]) sendJson(socks[seat], { t: 'nopause', left: pauses[seat] });
      return;
    }
    pauses[seat] -= 1;
    m.paused = { by: seat, at: now, until: now + DUEL.pauseMs };
    socks.forEach((s, k) => sendJson(s, { t: 'paused', by: seat, ms: DUEL.pauseMs, left: pauses[k] }));
    await this.save();
    await this.armAlarm(now);
  }

  /** Either player goes on (or the pause ran out): a 3-2-1 in both games; the match's clocks skip the pause. */
  async resume(now) {
    const m = this.m;
    const p = m.paused;
    if (!p) return;
    m.paused = null;
    const gap = Math.max(0, now - p.at) + DUEL.resumeMs;
    if (m.mode === 'turns') m.deadline = (m.deadline || now) + gap;
    else {
      m.startAt += gap;
      m.endAt = (m.endAt || now) + gap;
    }
    for (const c of m.pending || []) c.at += gap;
    for (const s of this.sockets()) {
      if (seatOf(s) >= 0) sendJson(s, { t: 'resumed', ms: DUEL.resumeMs });
    }
    await this.save();
    await this.armAlarm(now);
  }

  /** (1.12.1) The room's one alarm at the first thing due: a turn's deadline or the race's end, a seat kept for a game that went, a pause's end; a finished room's close. */
  async armAlarm(now) {
    const m = this.m;
    if (!m || !m.started) return;
    const due = [];
    if (m.done) due.push(m.closeAt || now + DONE_TTL_MS);
    else {
      // (while paused the turn's deadline and the race's end wait: resume() moves them on)
      if (m.paused) due.push(m.paused.until);
      else due.push(m.mode === 'turns' ? m.deadline || now + TURNS.serverTurnMs : m.endAt || now + DUEL.maxRunMs);
      for (const a of m.away || []) if (a) due.push(a);
    }
    await this.state.storage.setAlarm(Math.max(now + 1, Math.min(...due)));
  }

  async start(now) {
    const m = this.m;
    m.started = true;
    m.startAt = now + DUEL.countdownMs;
    for (const k of [0, 1]) m.names[k] = att(this.socketFor(k)).name || DEFAULT_NAME;
    // (1.12.1) each game's key and protocol: a game back on a new connection is known by its key
    m.keys = [0, 1].map((k) => att(this.socketFor(k)).key || null);
    m.v = [0, 1].map((k) => version(this.socketFor(k)));
    m.away = [0, 0];
    m.log = [[], []];
    m.last = [null, null];
    m.paused = null;
    m.pauses = [DUEL.pauses, DUEL.pauses];
    m.again = [false, false];
    if (m.mode !== 'turns') m.endAt = m.startAt + DUEL.maxRunMs;
    // Blok vir Blok: who drops first is drawn here; the first turn goes with the start
    let turn = null;
    if (m.mode === 'turns') {
      // rondtes (1.12) only when both games know them: a match with a 1.11 game plays as in 1.11
      m.rounds = [0, 1].every((k) => version(this.socketFor(k)) >= PROTOCOL_ROUNDS);
      const ref = createTurnReferee({ first: firstSeat(randFloat), seed: m.seed, rounds: m.rounds });
      const [e] = ref.start();
      m.tref = ref.snapshot();
      m.deadline = m.startAt + TURNS.serverTurnMs;
      turn = turnMsg(e);
    }
    for (const s of this.sockets()) {
      const k = seatOf(s);
      if (k < 0) continue;
      // (opp.v: the other game's protocol; 1.12 shows the other player's Blok vir Blok turn behind their 'go')
      const msg = { t: 'start', seed: m.seed, you: k, opp: { name: m.names[1 - k], card: cleanCard(att(this.socketFor(1 - k)).card), v: version(this.socketFor(1 - k)) } };
      if (turn) Object.assign(msg, { mode: 'turns', turn, ...(m.rounds ? { rounds: true } : {}) });
      // (1.12.1) to a game of protocol 5: this room's protocol and kind (a friend room: "Speel weer", pauses)
      if (version(s) >= PROTOCOL_V5) Object.assign(msg, { sv: PROTOCOL_V5, room: m.kind });
      sendJson(s, msg);
    }
    if (turn) for (const k of [0, 1]) this.tell(k, { t: 'turn', ...turn }, { quiet: true });
    // (1.12.1) anyone else still reading the invite: someone else plays now
    for (const s of this.sockets()) {
      if (seatOf(s) >= 0 || att(s).rejoin) continue;
      sendJson(s, { t: 'gone' });
      closeWs(s, 'gone');
    }
    await this.save();
    await this.state.storage.setAlarm(turn ? m.deadline : now + DUEL.maxRunMs + DUEL.countdownMs);
  }

  /**
   * Blok vir Blok: 'drop' (where the block was let go: passed on so the other game shows the same fall),
   * 'settled' (where the tower came to rest, whether the turn cost a heart, how the block landed: passed
   * on, then scored), 'joker' (the chosen sabotage) and 'over' (quitting). Only the player whose turn
   * it is can drop or end it.
   */
  async onTurnMessage(seat, msg, now) {
    const m = this.m;
    const ref = createTurnReferee({ init: m.tref });
    const other = this.socketFor(1 - seat);
    let events;
    // (1.12.1) each is passed on once a turn (a game back on a new connection sends its turn's again), and kept
    // for the other game in case its connection went meanwhile
    const relay = async (kind, out) => {
      if (seat !== ref.seat || msg.n !== ref.n || !this.firstRelay(kind, ref.n)) return;
      this.tell(1 - seat, out);
      if ((m.v?.[1 - seat] || 1) >= PROTOCOL_V5) await this.save();
    };
    if (msg.t === 'go') {   // (1.12) the turn began on that player's screen: the other game shows it from now
      await relay('go', { t: 'go', n: ref.n });
      return;
    }
    if (msg.t === 'visit') {   // (1.12) the round's Skelm Sakkie was caught or stole (the other game shows the same)
      const v = cleanVisitMsg(msg);
      if (v) await relay('visit', { t: 'visit', n: ref.n, ...v });
      return;
    }
    if (msg.t === 'drop') {
      const p = cleanPose(msg.p);
      // ct: how far the crane had swung this turn (ms), so the other game shows the block let go there
      const ct = typeof msg.ct === 'number' && msg.ct >= 0 && msg.ct <= 120000 ? msg.ct : null;
      if (p) await relay('drop', { t: 'drop', n: ref.n, p, ...(ct !== null ? { ct } : {}) });
      return;
    }
    if (msg.t === 'settled') {
      const snap = cleanSnap(msg.snap);
      if (!snap || seat !== ref.seat || msg.n !== ref.n) return;
      const lost = msg.lost === true;
      const r = cleanRating(msg.r);
      if (!snapFits(snap, ref.n, r)) return;   // blocks not dropped yet, or a lost block rated otherwise
      // k (1.12): physics steps from the drop to this report (the other game applies it at that step)
      const k = Number.isInteger(msg.k) && msg.k >= 0 && msg.k <= 100000 ? msg.k : null;
      this.tell(1 - seat, { t: 'settled', n: ref.n, lost, r, snap, ...(k !== null ? { k } : {}) });
      events = ref.settled(seat, { n: ref.n, lost, r, vis: cleanVis(msg.vis) });
    } else if (msg.t === 'joker') {
      events = ref.joker(seat, msg.kind);
    } else if (msg.t === 'over') {
      events = ref.leave(seat);
    } else {
      return;
    }
    if (!events.length) return;
    m.tref = ref.snapshot();
    for (const e of events) {
      if (e.type === 'turn') {
        m.deadline = now + TURNS.serverTurnMs;
        // (1.12.1) the player whose turn it is now is away for a moment: the turn waits for them
        if (m.away?.[e.seat]) m.deadline = Math.max(m.deadline, m.away[e.seat] + 1000);
        const tm = { t: 'turn', ...turnMsg(e) };
        for (const k of [0, 1]) this.tell(k, tm);
      } else if (e.type === 'joker') {
        // (n, to a 1.12.1 game: back on a new connection it hears these again, and knows them by the turn)
        this.tell(e.seat, { t: 'choose', options: [...SABOTAGES], def: SABOTAGES[0], ...this.turnTag(e.seat, ref.n) });
      } else if (e.type === 'sent') {
        this.tell(e.seat, { t: 'sent', kind: e.kind, ...this.turnTag(e.seat, ref.n) });
        // a heads-up: it comes with their next block
        this.tell(1 - e.seat, { t: 'sabotage', kind: e.kind, ...this.turnTag(1 - e.seat, ref.n) });
      } else if (e.type === 'result') {
        await this.decidedTurns(e, now);
      }
    }
    // (the alarm set at the start fires at the first deadline and moves itself on to the latest one)
    await this.save();
  }

  /** Blok vir Blok is decided: everyone hears it, and the room closes soon (no recordings: it needs two). */
  async decidedTurns(e, now) {
    const m = this.m;
    m.result = { winner: e.winner, reason: e.reason };
    m.done = true;
    m.paused = null;
    for (const k of [0, 1]) this.tell(k, { t: 'result', winner: e.winner, reason: e.reason, hearts: e.hearts });
    m.closeAt = now + this.doneTtl();
    await this.state.storage.setAlarm(m.closeAt);
  }

  /** How long a finished room stays: a friend match of two 1.12.1 games waits for "Speel weer". */
  doneTtl() {
    const m = this.m;
    return m.kind === 'friend' && (m.v || []).length === 2 && m.v.every((v) => v >= PROTOCOL_V5) ? DUEL.againMs : DONE_TTL_MS;
  }

  record(seat, now, h) {
    const k = Math.floor(Math.max(0, now - this.m.startAt) / DUEL.sampleMs);
    if (k > DUEL.maxRunMs / DUEL.sampleMs) return;
    const s = this.m.samples[seat];
    while (s.length <= k) s.push(s.length ? s[s.length - 1] : 0);
    s[k] = heightDm(h);
  }

  /** The match is decided: everyone hears it, the runs go to the lobby, and the room closes soon. */
  async decided(ref, e, now) {
    const m = this.m;
    m.result = { winner: e.winner, reason: e.reason };
    m.pending = [];   // the match is over: no more punishments
    m.done = true;
    m.paused = null;
    for (const k of [0, 1]) this.tell(k, { t: 'result', winner: e.winner, reason: e.reason, best: [round1(ref.best(0)), round1(ref.best(1))] });
    const dur = Math.max(0, now - m.startAt);
    if (dur >= MIN_RUN_MS && this.env?.MATCH_LOBBY) {
      const payloads = [0, 1]
        .map((k) => encodeChallenge({ seed: m.seed, name: m.names[k], run: { samples: m.samples[k].length ? m.samples[k] : [0], endT: dur, end: m.ends[k] || 'stop' } }))
        .filter(Boolean);
      try {
        const lobby = this.env.MATCH_LOBBY.get(this.env.MATCH_LOBBY.idFromName('lobby'));
        await lobby.fetch('https://lobby/runs', { method: 'POST', body: JSON.stringify({ payloads }) });
      } catch {
        // the recordings are a bonus
      }
    }
    m.closeAt = now + this.doneTtl();
    await this.state.storage.setAlarm(m.closeAt);
  }

  /**
   * Time is up: a room nobody joined says "gone"; a finished one closes and forgets everything. In a
   * Blok vir Blok match it is the turn's deadline: a turn that never ends loses the match for that player.
   */
  async alarm() {
    const m = await this.load();
    const now = this.now();
    if (m && m.started && !m.done) {
      let changed = false;
      // (1.12.1) a pause that ran out: the match goes on; a player who didn't come back in time: as if they left
      if (m.paused && now >= m.paused.until) {
        await this.resume(now);
        changed = true;
      }
      for (const k of [0, 1]) {
        if (!m.done && m.away?.[k] && now >= m.away[k]) {
          m.away[k] = 0;
          await this.leaveSeat(k, now);
          changed = true;
        }
      }
      if (!m.done && m.mode === 'turns' && !m.paused && now >= (m.deadline || 0)) {
        const ref = createTurnReferee({ init: m.tref });
        const [e] = ref.timeout();
        m.tref = ref.snapshot();
        if (e) await this.decidedTurns(e, now);
        changed = true;
      }
      // a Wedloop at its longest closes (below); anything else still running waits for what is due next
      if (m.done || m.mode === 'turns' || m.paused || now < (m.endAt || 0)) {
        if (changed) await this.save();
        if (!m.done) await this.armAlarm(now);
        return;
      }
    }
    // (1.12.1) a finished friend room (two 1.12.1 games) waits for "Speel weer" until its time is up
    if (m && m.done && now < (m.closeAt || 0) && this.doneTtl() > DONE_TTL_MS) {
      await this.armAlarm(now);
      return;
    }
    for (const s of this.sockets()) {
      if (!m || !m.started) sendJson(s, { t: 'gone' });
      closeWs(s, 'done');
    }
    await this.state.storage.deleteAll();
    this.m = null;
  }
}

// ------------------------------------------------------------------------------------ the lobby
export class MatchLobby {
  constructor(state, env, { now = () => Date.now(), upgrade = defaultUpgrade, roomCode = () => newRoomCode(rand32) } = {}) {
    this.state = state;
    this.env = env;
    this.now = now;
    this.upgrade = upgrade;
    this.roomCode = roomCode;
    this.allow = makeLimiter();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/runs' && request.method === 'POST') return this.addRuns(request);
    // owner only (the Worker's /admin/runs): what recordings there are, and forgetting some
    if (url.pathname === '/runs/list' && request.method === 'GET') return this.listRuns();
    if (url.pathname === '/runs/forget' && request.method === 'POST') return this.forgetRuns(request);
    if (url.pathname === '/ghost' || url.pathname === '/match/ghost') return this.ghost();
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json(426, { error: 'websocket_expected' });
    const [response, server] = this.upgrade();
    this.state.acceptWebSocket(server, ['wait']);
    server.serializeAttachment({ at: this.now(), hello: false });
    return response;
  }

  async webSocketMessage(ws, data) {
    await this.onMessage(ws, typeof data === 'string' ? data : '');
  }

  async webSocketClose() {}

  async webSocketError() {}

  /** "hello" from a player who is looking: pair with whoever has waited longest, else wait. */
  async onMessage(ws, data) {
    if (!this.allow(ws, this.now())) return;
    const msg = parseMsg(data);
    if (!msg || msg.t !== 'hello') return;
    const me = att(ws);
    if (me.hello) return;
    // the same mode (Wedloop or Blok vir Blok; older games send none: Wedloop) and the same game rules
    // only (stages, blocks and visitors change between versions; older games send none)
    const rules = Number.isInteger(msg.rules) && msg.rules > 0 && msg.rules < 100000 ? msg.rules : 0;
    const mode = msg.mode === 'turns' ? 'turns' : 'race';
    ws.serializeAttachment({ ...me, hello: true, rules, mode });
    const waiting = this.state.getWebSockets('wait')
      .filter((s) => s !== ws && att(s).hello && !att(s).paired && (att(s).rules || 0) === rules && (att(s).mode || 'race') === mode)
      .sort((a, b) => (att(a).at || 0) - (att(b).at || 0));
    const other = waiting[0];
    if (!other) {
      sendJson(ws, { t: 'wait' });
      return;
    }
    const room = await this.newRoom(mode);
    if (!room) {
      sendJson(ws, { t: 'wait' });
      return;
    }
    for (const s of [other, ws]) {
      sendJson(s, { t: 'match', room });
      s.serializeAttachment({ at: 0, hello: false, paired: true });
      closeWs(s, 'paired');
    }
  }

  async newRoom(mode = 'race') {
    for (let tries = 0; tries < 4; tries++) {
      const code = this.roomCode();
      const stub = this.env.MATCH_ROOM.get(this.env.MATCH_ROOM.idFromName(code));
      const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ kind: 'random', seed: newMatchSeed(randFloat), mode }) });
      if (res.status === 200) return code;
    }
    return null;
  }

  /** Recordings from a finished match: kept (validated) for a week, the newest RUNS_MAX. */
  async addRuns(request) {
    let body = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const fresh = (Array.isArray(body?.payloads) ? body.payloads : []).filter((p) => decodeChallenge(p)).slice(0, 2);
    if (!fresh.length) return json(200, { ok: true, kept: 0 });
    const now = this.now();
    const runs = ((await this.state.storage.get('runs')) || []).filter((r) => now - r.at < RUN_DAYS * 864e5);
    for (const payload of fresh) runs.push({ payload, at: now });
    await this.state.storage.put('runs', runs.slice(-RUNS_MAX));
    return json(200, { ok: true, kept: fresh.length });
  }

  /** The recordings kept now, newest last: who, which tower, how high, how it ended, when. */
  async listRuns() {
    const now = this.now();
    const runs = ((await this.state.storage.get('runs')) || []).filter((r) => now - r.at < RUN_DAYS * 864e5);
    const list = runs.map((r) => {
      const c = decodeChallenge(r.payload);
      const s = c ? c.run.samples : [];
      return { name: c?.name || '', seed: c?.seed || '', best: s.length ? Math.max(...s) / 10 : 0, end: c?.run.end || '', at: r.at };
    });
    return json(200, { runs: list });
  }

  /** Forget every recording by one of these nicknames ({ names: [...] }), e.g. a test match or a rude name. */
  async forgetRuns(request) {
    let body = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const names = new Set((Array.isArray(body?.names) ? body.names : []).filter((n) => typeof n === 'string' && n).slice(0, 20));
    if (!names.size) return json(400, { error: 'names_expected' });
    const runs = (await this.state.storage.get('runs')) || [];
    const keep = runs.filter((r) => !names.has(decodeChallenge(r.payload)?.name || ''));
    if (keep.length !== runs.length) await this.state.storage.put('runs', keep);
    return json(200, { ok: true, removed: runs.length - keep.length, left: keep.length });
  }

  /** A recent recording for a player nobody is around to play (404 when there is none). */
  async ghost() {
    const now = this.now();
    const runs = ((await this.state.storage.get('runs')) || []).filter((r) => now - r.at < RUN_DAYS * 864e5);
    if (!runs.length) return json(404, { error: 'none' });
    const pick = runs[Math.floor(randFloat() * runs.length)];
    return json(200, { payload: pick.payload });
  }
}
