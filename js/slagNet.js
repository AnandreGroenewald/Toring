// (1.17) Vrugteslag between two players (the owner, 16 Oct 2026: "Once done I will like to compete against you ... two
// different accounts"). A room on the match server (POST /slag/room → its code; a socket on /slag/room/<code>) passes each
// message to the other player; both games run the same rules (js/core/slag.js) on the same battle: the castles, the
// defenders and the seed are swapped first, then each shot as the shooter's game saw it land. This keeps the socket and a
// queue of what came in: `next(['shot', 'end'])` waits for the first of those. Once the friend (or the connection) is
// gone it stays gone: every waiter, now and later, hears {t:'gone'} after what came before it.

export function createSlagNet({ api = '', WS = globalThis.WebSocket, fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  const wsBase = api.replace(/^http/, 'ws');
  return {
    /** A new room's code (null: no server). */
    async create() {
      try {
        const r = await fetchImpl(`${api}/slag/room`, { method: 'POST', credentials: 'omit', cache: 'no-store' });
        const j = await r.json();
        return /^[A-Z0-9]{6}$/.test(j?.code || '') ? j.code : null;
      } catch {
        return null;
      }
    },
    /**
     * Into room `code`: { seat (a promise: 0 the one who made it, 1 the friend), ready, gone (a promise: the friend
     * or the connection gone), send, next, onGone, close }.
     */
    connect(code) {
      const queue = [];
      const waiters = [];
      let onGone = null;
      let goneMsg = null;
      let seatOk;
      let readyOk;
      let goneOk;
      const seat = new Promise((r) => { seatOk = r; });
      const ready = new Promise((r) => { readyOk = r; });
      const gone = new Promise((r) => { goneOk = r; });
      const ws = new WS(`${wsBase}/slag/room/${code}`);
      const deliver = (m) => {
        if (m.t === 'gone') {   // (once, to everyone waiting and everyone who asks later)
          if (goneMsg) return;
          goneMsg = m;
          onGone?.();
          goneOk(m);
          for (const w of waiters.splice(0)) w.resolve(m);
          return;
        }
        const i = waiters.findIndex((w) => w.types.includes(m.t));
        if (i >= 0) {
          const [w] = waiters.splice(i, 1);
          w.resolve(m);
        } else {
          queue.push(m);
        }
      };
      ws.onmessage = (e) => {
        let m = null;
        try { m = JSON.parse(e.data); } catch { return; }
        if (!m || typeof m.t !== 'string') return;
        if (m.t === 'seat') seatOk(m.seat);
        else if (m.t === 'ready') readyOk(true);
        else deliver(m.t === 'gone' ? { t: 'gone' } : m);
      };
      ws.onclose = () => deliver({ t: 'gone' });
      const sendNow = (obj) => ws.send(JSON.stringify(obj));
      return {
        seat,
        ready,
        gone,
        send(obj) {
          if (ws.readyState === 1) sendNow(obj);
          else if (ws.readyState === 0) ws.addEventListener('open', () => sendNow(obj), { once: true });
        },
        /** The first message (queued or still to come) whose type is one of `types`; {t:'gone'} once there are none. */
        next(types) {
          const list = Array.isArray(types) ? types : [types];
          const i = queue.findIndex((m) => list.includes(m.t));
          if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
          if (goneMsg) return Promise.resolve(goneMsg);
          return new Promise((resolve) => waiters.push({ types: list, resolve }));
        },
        onGone(fn) { onGone = fn; },
        close() { try { ws.close(); } catch { /* already */ } },
      };
    },
  };
}
