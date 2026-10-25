// (1.21.2) Saam gly's connection to its room on the match server, made for phones (the owner, 25 Oct 2026: "if I
// invite my wife then it sends the link but as soon as I go back on my phone to stapel then mine exits automatically").
// A phone that goes to WhatsApp (or takes a call, or locks) loses its socket, or keeps one that no longer works; so this
// comes back to the same room by itself, with this phone's key (?k=) that takes its own seat again on the server
// (server/src/slagroom.js), and a fresh socket every time the game comes back on the screen. The friend's game dropping
// for a moment is "away", not gone: only their "bye" (Klaar) or a long silence ends it (js/rivier/duel.js decides).
//   connectSaam(code, { api }) -> { on(fn), send(obj), close(), drop() (tests) }: fn gets what the friend sends, and
//     {t:'ready'} both are in (again after every return), {t:'away'} the friend's game dropped, {t:'meLost'} ours did,
//     {t:'meBack'} ours is in again, {t:'fail'} the room can't be had (no such room, full, or not back in FAIL_MS).
//   seekSaam({ api, name }) -> { on(fn), close() }: Saam gly's lobby; fn gets {t:'wait', n}, {t:'match', code, host,
//     name}, {t:'fail'} (the socket went before a match).
import { cleanNickname, isRoomCode } from '../core/duel.js';

export const FAIL_MS = 120000;
const RETRY_MS = [300, 800, 1500, 2500, 4000];
const FRESH_AFTER_MS = 2500;   // (back on the screen after this long away: a new socket, the old one may be dead)

/** This phone's key for one room: 16 letters and digits, made fresh (nothing is kept on the phone). */
export function saamKey(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 16; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)];
  return s;
}

const wsUrl = (api, path) => `${String(api).replace(/^http/, 'ws')}${path}`;

export function connectSaam(code, { api = '', WS = globalThis.WebSocket, doc = globalThis.document, now = () => Date.now(), timers = globalThis, key = saamKey() } = {}) {
  const url = wsUrl(api, `/slag/room/${code}?k=${key}`);
  const fns = new Set();
  let ws = null;
  let closed = false;
  let seated = false;    // (this socket has its seat)
  let everIn = false;    // (we had a seat once: a refusal now is our old socket still holding it, or a room that went)
  let isLost = false;    // (our socket went...)
  let lostAt = 0;        // (...at this time)
  let tries = 0;
  let timer = 0;
  let hiddenAt = -1;     // (-1: on the screen)
  const emit = (m) => {
    for (const f of [...fns]) {
      try { f(m); } catch (e) { console.error('[saam]', e); }
    }
  };
  const visible = () => !doc || doc.visibilityState !== 'hidden';
  function quiet(s) {
    if (!s) return;
    s.onclose = null;
    s.onmessage = null;
    s.onerror = null;
    try { s.close(); } catch { /* already */ }
  }
  function fail() {
    if (closed) return;
    closed = true;
    timers.clearTimeout(timer);
    quiet(ws);
    ws = null;
    doc?.removeEventListener?.('visibilitychange', onVis);
    emit({ t: 'fail' });
  }
  function lost() {
    ws = null;
    seated = false;
    if (!isLost) {
      isLost = true;
      lostAt = now();
      emit({ t: 'meLost' });
    }
    retry();
  }
  function retry() {
    if (closed || timer) return;
    if (isLost && now() - lostAt > FAIL_MS) { fail(); return; }
    if (!visible()) return;   // (the phone sleeps: back on the screen, it tries at once)
    const d = RETRY_MS[Math.min(tries++, RETRY_MS.length - 1)];
    timer = timers.setTimeout(() => { timer = 0; open(); }, d);
  }
  function open() {
    if (closed) return;
    timers.clearTimeout(timer);
    timer = 0;
    seated = false;
    let s = null;
    try { s = new WS(url); } catch { s = null; }
    ws = s;
    if (!s) { lost(); return; }
    s.onmessage = (e) => {
      if (s !== ws) return;
      let m = null;
      try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'seat') {
        seated = true;
        everIn = true;
        tries = 0;
        if (isLost) {
          isLost = false;
          emit({ t: 'meBack' });
        }
        return;
      }
      if (m.t === 'ready') { emit({ t: 'ready' }); return; }
      if (m.t === 'gone') {
        // (seated: the friend's game dropped; not seated: no seat for us: never in = no such room or it's full)
        if (seated) emit({ t: 'away' });
        else if (!everIn) fail();
        return;
      }
      emit(m);
    };
    s.onerror = () => {};   // (a close follows)
    s.onclose = () => { if (s === ws && !closed) lost(); };
  }
  // (back on the screen: a fresh socket after a while away; the server gives this phone its own seat again)
  function onVis() {
    if (closed) return;
    if (!visible()) {
      hiddenAt = now();
      return;
    }
    const away = hiddenAt >= 0 ? now() - hiddenAt : 0;
    hiddenAt = -1;
    if (isLost) lostAt = now();
    if (!ws || away > FRESH_AFTER_MS) {
      const old = ws;
      tries = 0;
      open();
      if (old) timers.setTimeout(() => quiet(old), 1500);
    }
  }
  doc?.addEventListener?.('visibilitychange', onVis);
  open();
  return {
    key,
    on(fn) { fns.add(fn); return () => fns.delete(fn); },
    send(obj) {
      if (!ws || ws.readyState !== 1) return false;
      try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
    },
    get state() { return closed ? 'closed' : ws && seated ? 'in' : 'out'; },
    close() {
      if (closed) return;
      closed = true;
      timers.clearTimeout(timer);
      doc?.removeEventListener?.('visibilitychange', onVis);
      const s = ws;
      ws = null;
      // (a moment for what was just sent, e.g. the "bye", to leave)
      if (s) timers.setTimeout(() => quiet(s), 250);
      fns.clear();
    },
    /** Tests: the socket goes as a phone's does (`zombie`: it stays open on the server, the game just loses it). */
    drop({ zombie = false } = {}) {
      const s = ws;
      if (!s) return;
      if (zombie) {
        s.onclose = null;
        s.onmessage = null;
        lost();
      } else {
        try { s.close(); } catch { /* already */ }
      }
    },
  };
}

export function seekSaam({ api = '', name = '', WS = globalThis.WebSocket, key = saamKey(), timers = globalThis } = {}) {
  const fns = new Set();
  let done = false;
  const emit = (m) => {
    for (const f of [...fns]) {
      try { f(m); } catch (e) { console.error('[saam]', e); }
    }
  };
  const q = new URLSearchParams({ n: String(name || '').slice(0, 16), k: key });
  let ws = null;
  try { ws = new WS(wsUrl(api, `/slag/seek?${q}`)); } catch { ws = null; }
  if (!ws) timers.setTimeout(() => { if (!done) { done = true; emit({ t: 'fail' }); } }, 0);
  else {
    ws.onmessage = (e) => {
      let m = null;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m?.t === 'wait') emit({ t: 'wait', n: Math.max(1, Math.min(99, m.n | 0)) });
      else if (m?.t === 'match' && isRoomCode(m.code) && !done) {
        done = true;
        emit({ t: 'match', code: m.code, host: m.host === true, name: cleanNickname(m.name) || '' });
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => { if (!done) { done = true; emit({ t: 'fail' }); } };
  }
  return {
    key,
    on(fn) { fns.add(fn); return () => fns.delete(fn); },
    close() {
      done = true;
      fns.clear();
      if (ws) {
        ws.onclose = null;
        try { ws.close(); } catch { /* already */ }
      }
    },
  };
}
