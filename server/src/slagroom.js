// (1.18) Blokbotsing between two friends (and Vrugteslag's rooms, 1.17, while it's off): a room is two seats; each
// message goes to the other seat as it came (both games run the same rules on the same battle: js/botsing/game.js,
// js/core/slag.js); what one sends while the other isn't there waits for them. The same protocol as the home match
// server's rooms (matchhost.mjs uses this class too), as js/slagNet.js speaks it:
//   POST /init                 a new room (the Worker's POST /slag/room makes the code: 409 when it is taken)
//   GET  (WebSocket upgrade)   a seat: {t:'seat', seat} (0 the first in, 1 the second), then what waited for that seat;
//                              both in: {t:'ready'} to both; a seat that leaves: {t:'gone'} to the other, once.
//                              No room, or both seats taken: {t:'gone'} and the socket closes.
// The Hibernation API keeps the sockets while the object sleeps (a battle's turns can be minutes apart); the seat
// lives on the socket. A room goes ROOM_TTL_MS after it was made (later while someone is still in it).

export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const STILL_IN_MS = 30 * 60 * 1000;     // a room with someone in it at its end lives this much longer, and so on
const MSG_MAX = 32 * 1024;              // one message (a Blokbotsing turn's snapshot is a few KB)
const MSG_PER_SEC = 20;
const WAIT_MAX = 100;                   // messages that may wait for a seat...
const WAIT_BYTES = 256 * 1024;          // ...and how much they may hold
const RESERVED = new Set(['seat', 'ready', 'gone']);   // (the room's own words: a game can't send them)

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function send(ws, text) {
  try {
    ws.send(text);
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

/** What a socket carries through hibernation: { seat } (0 or 1; -1 none), `left` once it went. */
function att(ws) {
  try {
    return ws.deserializeAttachment() || {};
  } catch {
    return {};
  }
}

/** Accepts a WebSocket upgrade: [response for the client, server-side socket]. Injectable for tests. */
function defaultUpgrade() {
  // eslint-disable-next-line no-undef
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  return [new Response(null, { status: 101, webSocket: client }), server];
}

export class SlagRoom {
  constructor(state, env, { now = () => Date.now(), upgrade = defaultUpgrade } = {}) {
    this.state = state;
    this.env = env;
    this.now = now;
    this.upgrade = upgrade;
    this.left = new WeakSet();
    this.rate = new WeakMap();   // messages per socket per second (memory only; approximate across sleeps, fine)
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init') {
      if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
      if (await this.state.storage.get('made')) return json(409, { error: 'exists' });
      const at = this.now();
      await this.state.storage.put('made', at);
      await this.state.storage.setAlarm(at + ROOM_TTL_MS);
      return json(200, { ok: true });
    }
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json(426, { error: 'websocket_expected' });
    const [response, server] = this.upgrade();
    await this.join(server);
    return response;
  }

  /** The sockets still in the room (but `except`). */
  open(except = null) {
    return this.state.getWebSockets().filter((s) => s !== except && !this.left.has(s) && !att(s).left);
  }

  socketFor(seat, except = null) {
    return this.open(except).find((s) => att(s).seat === seat) || null;
  }

  async join(ws) {
    this.state.acceptWebSocket(ws);
    const made = await this.state.storage.get('made');
    const taken = new Set(this.open(ws).map((s) => att(s).seat));
    const seat = !taken.has(0) ? 0 : !taken.has(1) ? 1 : -1;
    if (!made || seat < 0) {
      ws.serializeAttachment({ seat: -1, left: true });
      this.left.add(ws);
      send(ws, JSON.stringify({ t: 'gone' }));
      closeWs(ws, 'gone');
      return;
    }
    ws.serializeAttachment({ seat });
    send(ws, JSON.stringify({ t: 'seat', seat }));
    // what the other sent before this seat came
    const waiting = (await this.state.storage.get(`wait${seat}`)) || [];
    if (waiting.length) {
      for (const m of waiting) send(ws, m);
      await this.state.storage.delete(`wait${seat}`);
    }
    const other = this.socketFor(1 - seat, ws);
    if (other) {
      const ready = JSON.stringify({ t: 'ready' });
      send(seat === 0 ? ws : other, ready);
      send(seat === 0 ? other : ws, ready);
    }
  }

  allow(ws) {
    const now = this.now();
    let b = this.rate.get(ws);
    if (!b || now - b.at >= 1000) {
      b = { at: now, n: 0 };
      this.rate.set(ws, b);
    }
    b.n += 1;
    return b.n <= MSG_PER_SEC;
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MSG_MAX) return;
    const { seat } = att(ws);
    if ((seat !== 0 && seat !== 1) || this.left.has(ws) || !this.allow(ws)) return;
    let m = null;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string' || RESERVED.has(m.t)) return;
    const other = this.socketFor(1 - seat, ws);
    if (other) {
      send(other, data);
      return;
    }
    // the other isn't in (yet, or for now): it waits for them
    const key = `wait${1 - seat}`;
    const waiting = (await this.state.storage.get(key)) || [];
    if (waiting.length >= WAIT_MAX || waiting.reduce((s, x) => s + x.length, data.length) > WAIT_BYTES) return;
    waiting.push(data);
    await this.state.storage.put(key, waiting);
  }

  async webSocketClose(ws) {
    this.leave(ws);
  }

  async webSocketError(ws) {
    this.leave(ws);
  }

  /** A seat's socket went: the other hears it once. */
  leave(ws) {
    if (this.left.has(ws)) return;
    this.left.add(ws);
    const a = att(ws);
    try {
      ws.serializeAttachment({ ...a, left: true });
    } catch {
      // closed already
    }
    closeWs(ws, 'bye');
    if (a.left || (a.seat !== 0 && a.seat !== 1)) return;
    const other = this.socketFor(1 - a.seat, ws);
    if (other) send(other, JSON.stringify({ t: 'gone' }));
  }

  async alarm() {
    if (this.open().length) {
      await this.state.storage.setAlarm(this.now() + STILL_IN_MS);
      return;
    }
    await this.state.storage.deleteAll();
  }
}
