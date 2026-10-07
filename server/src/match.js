// Uitdagersreeks live matches (docs/CHALLENGE-SPEC.md). MatchLobby (one instance) pairs players who are
// looking and keeps recent runs for players nobody is around to play; MatchRoom (one per match, named
// by its code) relays the heights, decides the height marks and the winner with the game's own
// referee (js/core/duel.js) and hands both runs to the lobby at the end.
//
// Both use WebSocket hibernation, so a quiet room costs nothing, and both keep the match in memory
// while it runs, saving only at the moments that matter (start, a height mark, the result, and at
// most every few seconds): the Workers Free plan allows 100 000 storage writes a day.

import { DUEL } from '../../js/config.js';
import {
  createReferee, cleanNickname, cleanReport, decodeChallenge, encodeChallenge, isMatchSeed, newMatchSeed, newRoomCode,
} from '../../js/core/duel.js';

const MSG_MAX = 512;                   // characters per message
const MSG_PER_SEC = 10;                // per player
const RANDOM_ROOM_TTL_MS = 2 * 60 * 1000;
const DONE_TTL_MS = 60 * 1000;         // a finished room says goodbye and is cleared after this
const SAVE_EVERY_MS = 5000;
const MIN_RUN_MS = 20 * 1000;          // shorter matches are not kept as recordings
const RUNS_MAX = 60;
const RUN_DAYS = 7;
const SLACK_M = 5;                     // a report may run this far ahead of the climb limit (lag, bursts)
const DEFAULT_NAME = 'Bouer';

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

function parseMsg(data) {
  if (typeof data !== 'string' || data.length > MSG_MAX) return null;
  try {
    const o = JSON.parse(data);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

/** What a socket carries through hibernation: { seat, hello, name } in a room, { at, hello } in the lobby. */
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
    await this.join(server);
    return response;
  }

  /** A new room (from the lobby or POST /match/room): its seed and how long it waits for players. */
  async init({ seed, kind } = {}) {
    if (await this.load()) return json(409, { error: 'exists' });
    const now = this.now();
    this.m = {
      seed: isMatchSeed(seed) ? seed : newMatchSeed(randFloat),
      kind: kind === 'random' ? 'random' : 'friend',
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
    return json(200, { ok: true, seed: this.m.seed });
  }

  /** A player's socket: a free seat, or "gone" (no such room, full, started or over). */
  async join(ws) {
    const m = await this.load();
    const taken = new Set(this.sockets().filter((s) => s !== ws).map(seatOf));
    const seat = !taken.has(0) ? 0 : !taken.has(1) ? 1 : -1;
    this.state.acceptWebSocket(ws);
    if (!m || m.started || m.done || seat < 0) {
      sendJson(ws, { t: 'gone' });
      closeWs(ws, 'gone');
      return;
    }
    // the hello lives on the socket: a friend room may sleep for minutes before the second player comes
    ws.serializeAttachment({ seat, hello: false, name: null });
    sendJson(ws, { t: 'wait' });
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
    const msg = parseMsg(data);
    const m = await this.load();
    const seat = seatOf(ws);
    if (!msg || !m || seat < 0 || m.done) return;

    if (msg.t === 'hello') {
      if (m.started) return;
      ws.serializeAttachment({ seat, hello: true, name: cleanNickname(msg.name) || DEFAULT_NAME });
      const both = [this.socketFor(0), this.socketFor(1)];
      if (both.every((s) => s && att(s).hello)) await this.start(now);
      return;
    }
    if (!m.started || m.result) return;
    if (msg.t !== 'state' && msg.t !== 'over') return;

    const r = cleanReport(msg.t === 'over' ? { h: msg.best, best: msg.best, over: msg.reason ?? 'quit' } : msg);
    if (!r) return;
    // nobody climbs faster than DUEL.maxClimbMps: impossible numbers are cut back
    const cap = DUEL.maxClimbMps * (Math.max(0, now - m.startAt) / 1000) + SLACK_M;
    const h = Math.min(r.h, cap);
    const best = Math.min(r.best, cap);
    this.record(seat, now, h);

    const ref = createReferee({ init: m.ref });
    const events = ref.report(seat, { h: best, over: msg.t === 'over' ? r.over : null });
    m.ref = ref.snapshot();
    const other = this.socketFor(1 - seat);
    if (other && msg.t === 'state') sendJson(other, { t: 'opp', h: round1(h), best: round1(ref.best(seat)) });
    let important = false;
    for (const e of events) {
      if (e.type === 'attack') {
        important = true;
        const to = this.socketFor(e.to);
        const from = this.socketFor(e.from);
        if (to) sendJson(to, { t: 'attack', m: e.m, kind: e.kind });
        if (from) sendJson(from, { t: 'sent', m: e.m, kind: e.kind });
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

  async onClose(ws) {
    const m = await this.load();
    const seat = seatOf(ws);
    if (!m || seat < 0) return;
    if (m.started && !m.result) {
      const ref = createReferee({ init: m.ref });
      const [e] = ref.leave(seat);
      m.ref = ref.snapshot();
      m.ends[seat] = 'quit';
      m.ends[1 - seat] = 'stop';
      if (e) await this.decided(ref, e, this.now());
      await this.save();
    }
  }

  async start(now) {
    const m = this.m;
    m.started = true;
    m.startAt = now + DUEL.countdownMs;
    for (const k of [0, 1]) m.names[k] = att(this.socketFor(k)).name || DEFAULT_NAME;
    for (const s of this.sockets()) {
      const k = seatOf(s);
      if (k >= 0) sendJson(s, { t: 'start', seed: m.seed, you: k, opp: { name: m.names[1 - k] } });
    }
    await this.save();
    await this.state.storage.setAlarm(now + DUEL.maxRunMs + DUEL.countdownMs);
  }

  record(seat, now, h) {
    const k = Math.floor(Math.max(0, now - this.m.startAt) / DUEL.sampleMs);
    if (k > DUEL.maxRunMs / DUEL.sampleMs) return;
    const s = this.m.samples[seat];
    while (s.length <= k) s.push(s.length ? s[s.length - 1] : 0);
    s[k] = Math.round(Math.max(0, h) * 10);
  }

  /** The match is decided: everyone hears it, the runs go to the lobby, and the room closes soon. */
  async decided(ref, e, now) {
    const m = this.m;
    m.result = { winner: e.winner, reason: e.reason };
    m.done = true;
    for (const s of this.sockets()) sendJson(s, { t: 'result', winner: e.winner, reason: e.reason, best: [round1(ref.best(0)), round1(ref.best(1))] });
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
    await this.state.storage.setAlarm(now + DONE_TTL_MS);
  }

  /** Time is up: a room nobody joined says "gone"; a finished one closes and forgets everything. */
  async alarm() {
    const m = await this.load();
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
    ws.serializeAttachment({ ...me, hello: true });
    const waiting = this.state.getWebSockets('wait')
      .filter((s) => s !== ws && att(s).hello && !att(s).paired)
      .sort((a, b) => (att(a).at || 0) - (att(b).at || 0));
    const other = waiting[0];
    if (!other) {
      sendJson(ws, { t: 'wait' });
      return;
    }
    const room = await this.newRoom();
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

  async newRoom() {
    for (let tries = 0; tries < 4; tries++) {
      const code = this.roomCode();
      const stub = this.env.MATCH_ROOM.get(this.env.MATCH_ROOM.idFromName(code));
      const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ kind: 'random', seed: newMatchSeed(randFloat) }) });
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

  /** A recent recording for a player nobody is around to play (404 when there is none). */
  async ghost() {
    const now = this.now();
    const runs = ((await this.state.storage.get('runs')) || []).filter((r) => now - r.at < RUN_DAYS * 864e5);
    if (!runs.length) return json(404, { error: 'none' });
    const pick = runs[Math.floor(randFloat() * runs.length)];
    return json(200, { payload: pick.payload });
  }
}
