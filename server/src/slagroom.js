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
// (1.21.2, Saam gly on phones: a phone that goes to WhatsApp and back loses its socket) A socket may bring its phone's
// key (?k=, 8-32 lower-case letters and digits, made fresh for each room): coming back with the same key takes over its
// own seat, even while the room still holds the old socket (a phone's dead connection can linger), and both hear
// {t:'ready'} again. A second kind of instance, the LOBBY (named LOBBY_NAME): players looking for anyone to ride with
// (GET /slag/seek ?n=nickname&k=key) wait there; two waiting are paired at once: a new room is made for them and each
// hears {t:'match', code, host (the one who waited longest makes it), name (the other's)}, then the lobby lets them go.
// While nobody else is there: {t:'wait', n} (how many are looking).

import { newRoomCode } from '../../js/core/duel.js';

export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const STILL_IN_MS = 30 * 60 * 1000;     // a room with someone in it at its end lives this much longer, and so on
const MSG_MAX = 32 * 1024;              // one message (a Blokbotsing turn's snapshot is a few KB)
const MSG_PER_SEC = 20;
const WAIT_MAX = 100;                   // messages that may wait for a seat...
const WAIT_BYTES = 256 * 1024;          // ...and how much they may hold
const RESERVED = new Set(['seat', 'ready', 'gone']);   // (the room's own words: a game can't send them)
export const LOBBY_NAME = 'saam-lobby';   // (lower case with a dash: never a room code)
const KEY_RE = /^[a-z0-9]{8,32}$/;
const NAME_MAX = 16;
const cleanKey = (k) => (typeof k === 'string' && KEY_RE.test(k) ? k : '');
// (a nickname as the game made it: the game's own name rules ran there; here only its length and no markup)
const cleanName = (n) => (typeof n === 'string' ? n.replace(/[<>&"'`\u0000-\u001f]/g, '').trim().slice(0, NAME_MAX) : '');
const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];

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
    const key = cleanKey(url.searchParams.get('k'));
    if (url.pathname === '/lobby') await this.seek(server, cleanName(url.searchParams.get('n')), key);
    else await this.join(server, key);
    return response;
  }

  /**
   * The lobby: `ws` looks for anyone to ride with. The one who has waited longest (another phone) is its match: a new
   * room for the two, its code to both, and the lobby lets them go. Nobody there: it waits ({t:'wait', n}).
   */
  async seek(ws, name, key) {
    this.state.acceptWebSocket(ws);
    // (the same phone again, e.g. back from another app: its old place goes)
    const waiting = this.state.getWebSockets().filter((s) => s !== ws && !this.left.has(s) && att(s).lobby);
    for (const s of waiting.filter((x) => key && att(x).key === key)) this.drop(s);
    const others = waiting.filter((s) => !this.left.has(s) && !(key && att(s).key === key)).sort((a, b) => att(a).at - att(b).at);
    ws.serializeAttachment({ lobby: true, name, key, at: this.now() });
    const mate = others[0];
    if (!mate) {
      send(ws, JSON.stringify({ t: 'wait', n: 1 }));
      return;
    }
    const code = await this.newRoom();
    if (!code) {
      send(ws, JSON.stringify({ t: 'wait', n: others.length + 1 }));
      return;
    }
    send(mate, JSON.stringify({ t: 'match', code, host: true, name }));
    send(ws, JSON.stringify({ t: 'match', code, host: false, name: att(mate).name || '' }));
    this.drop(mate);
    this.drop(ws);
    for (const s of others.slice(1)) send(s, JSON.stringify({ t: 'wait', n: others.length - 1 }));
  }

  /** A new room for a lobby's pair (its code), or null when none could be made. */
  async newRoom() {
    const ns = this.env?.SLAG_ROOM;
    if (!ns) return null;
    for (let tries = 0; tries < 4; tries++) {
      const code = newRoomCode(rand32);
      const res = await ns.get(ns.idFromName(code)).fetch('https://room/init', { method: 'POST' });
      if (res.status === 200) return code;
    }
    return null;
  }

  /** A socket the room (or lobby) lets go of, quietly: nobody is told. */
  drop(ws) {
    this.left.add(ws);
    try {
      ws.serializeAttachment({ ...att(ws), left: true });
    } catch {
      // closed already
    }
    closeWs(ws, 'bye');
  }

  /** The sockets still in the room (but `except`). */
  open(except = null) {
    return this.state.getWebSockets().filter((s) => s !== except && !this.left.has(s) && !att(s).left);
  }

  socketFor(seat, except = null) {
    return this.open(except).find((s) => att(s).seat === seat) || null;
  }

  async join(ws, key = '') {
    this.state.acceptWebSocket(ws);
    const made = await this.state.storage.get('made');
    // (the same phone back with its key: its old socket, dead or alive, gives up its seat to this one, quietly)
    let back = -1;
    if (key && made) {
      for (const s of this.open(ws)) {
        if (att(s).key !== key) continue;
        back = att(s).seat;
        this.drop(s);
      }
    }
    const taken = new Set(this.open(ws).map((s) => att(s).seat));
    const seat = back >= 0 && !taken.has(back) ? back : !taken.has(0) ? 0 : !taken.has(1) ? 1 : -1;
    if (!made || seat < 0) {
      ws.serializeAttachment({ seat: -1, left: true });
      this.left.add(ws);
      send(ws, JSON.stringify({ t: 'gone' }));
      closeWs(ws, 'gone');
      return;
    }
    ws.serializeAttachment(key ? { seat, key } : { seat });
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
    const { seat, lobby } = att(ws);
    if (lobby || (seat !== 0 && seat !== 1) || this.left.has(ws) || !this.allow(ws)) return;
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
    if (a.left || a.lobby || (a.seat !== 0 && a.seat !== 1)) return;
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
