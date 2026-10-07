// Uitdagersreeks on the device (docs/CHALLENGE-SPEC.md): finds an opponent (live through the Worker,
// a recording of a real match, or the computer), runs the match against it and tells the game what
// happens: attacks ('duel:attack'), the result ('duel:end') and the race track ('hud:duel'). The rules
// are js/core/duel.js; for a live match the server runs the same referee (server/src/match.js).

import { DUEL } from './config.js';
import { S, VISITOR_INFO } from './core/strings.js';
import {
  createReferee, createRecorder, createGhost, botRun, newMatchSeed, isMatchSeed, decodeChallenge,
  encodeChallenge, isRoomCode, cleanNickname,
} from './core/duel.js';

const YOU = 0;
const THEM = 1;
const RESULT_WAIT_MS = 2500;   // live: after our tower fell, wait this long for the server's verdict
const round1 = (v) => Math.round(v * 10) / 10;
const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(DUEL.maxHeightM, Number(v))) : 0);

function parse(data) {
  try {
    const o = JSON.parse(typeof data === 'string' ? data : '');
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function send(ws, obj) {
  try {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch {
    // a closing socket: the match carries on locally
  }
}

function close(ws) {
  if (!ws) return;
  ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
  try {
    ws.close(1000);
  } catch {
    // already closed
  }
}

/** "https://x.workers.dev/" -> "wss://x.workers.dev" (null when there is no API). */
function wsBase(apiUrl) {
  if (!apiUrl) return null;
  const base = String(apiUrl).replace(/\/+$/, '');
  if (base.startsWith('https://')) return `wss://${base.slice(8)}`;
  if (base.startsWith('http://')) return `ws://${base.slice(7)}`;
  return null;
}

/**
 * @param {{ bus, apiUrl?: string, nickname: () => string, onDecided?: (outcome) => void,
 *   WebSocketImpl?, fetchImpl?, timers? }} deps
 */
export function createDuel({
  bus, apiUrl = '', nickname = () => '', onDecided = () => {},
  WebSocketImpl = globalThis.WebSocket, fetchImpl = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null,
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), now = () => Date.now(),
} = {}) {
  const wsUrl = wsBase(apiUrl);
  const httpUrl = apiUrl ? String(apiUrl).replace(/\/+$/, '') : '';
  const live = !!wsUrl && typeof WebSocketImpl === 'function';
  let match = null;
  let pending = null;   // { ws, timer } while searching or waiting in a room
  const hud = { you: 0, them: 0, name: '', claimed: {} };

  // ------------------------------------------------------------------------------- a match
  function newMatch({ kind, seed, oppName, run = null, ws = null, you = YOU }) {
    match = {
      kind, seed, ws, you,
      oppName: oppName || S.duelSomeone,
      youName: nickname() || '',
      referee: kind === 'live' ? null : createReferee(),
      ghost: run ? createGhost(run) : null,
      recorder: createRecorder(),
      claimed: {},
      youH: 0, youBest: 0, oppH: 0, oppBest: 0,
      outcome: null, reason: null,
      over: false, overAt: 0, lostConn: false,
      lastSent: -1e9, sentBest: 0, lastT: 0,
    };
    hud.name = match.oppName;
    hud.claimed = match.claimed;
    hud.you = 0;
    hud.them = 0;
    return match;
  }

  function decide(outcome, reason) {
    const m = match;
    if (!m || m.outcome) return;
    m.outcome = outcome;
    m.reason = reason;
    if (!m.recorder.ended) m.recorder.finish(m.lastT, m.youBest >= DUEL.goalM ? 'goal' : 'stop');
    onDecided(outcome, m);
    if (!m.over) bus.emit('duel:end', { outcome });   // the tower stops here (won, or the other one got there first)
    if (m.kind === 'live') setTimer(() => { if (match === m) close(m.ws); }, 1500);
  }

  /** Referee / server events, in one shape for both. */
  function handle(events) {
    const m = match;
    if (!m) return;
    for (const e of events) {
      if (e.type === 'attack') {
        const mine = e.from === m.you;
        m.claimed[e.m] = mine ? 'you' : 'them';
        const info = VISITOR_INFO[e.kind];
        if (!info) continue;
        if (mine) {
          if (m.ghost) m.ghost.hit(e.kind);
          bus.emit('hud:toast', { text: S.duelAttackOut(info.name, m.oppName, info.emoji), color: '#ffe38c', visitor: true });
        } else if (!m.over) {
          bus.emit('duel:attack', { kind: e.kind, from: m.oppName });
        }
      } else if (e.type === 'result') {
        decide(e.winner === m.you ? 'won' : 'lost', e.reason);
      }
    }
  }

  // The scene's height, every frame (sim ms since the tower started; tower top and best height in m).
  bus.on('duel:self', (s) => {
    const m = match;
    if (!m || m.over || !s) return;
    m.lastT = s.t;
    m.youH = s.h;
    m.youBest = Math.max(m.youBest, s.best);
    // the recording keeps the best height (the results' number), not the top: that counts a block still in the air
    m.recorder.add(s.t, m.youBest);
    if (!m.outcome) {
      if (m.kind === 'live') {
        const t = now();
        const crossed = [...DUEL.marks, DUEL.goalM].some((mk) => m.youBest >= mk && m.sentBest < mk);
        if (crossed || t - m.lastSent >= DUEL.stateEveryMs) {
          send(m.ws, { t: 'state', h: round1(s.h), best: round1(m.youBest) });
          m.lastSent = t;
          m.sentBest = m.youBest;
        }
      } else {
        const g = m.ghost.step(s.t);
        m.oppH = g.h;
        m.oppBest = g.best;
        handle(m.referee.report(YOU, { h: m.youBest }));
        if (!m.outcome) handle(m.referee.report(THEM, { h: g.best, over: g.over }));
      }
    }
    hud.you = m.youH;
    hud.them = m.oppH;
    bus.emit('hud:duel', hud);
  });

  // Our tower ended by itself (hearts, flood or quitting).
  bus.on('duel:over', (o) => {
    const m = match;
    if (!m || m.over) return;
    m.over = true;
    m.overAt = now();
    const reason = o && typeof o.reason === 'string' ? o.reason : 'quit';
    if (!m.recorder.ended) m.recorder.finish(o?.t ?? m.lastT, reason);
    if (m.outcome) return;
    if (m.kind === 'live') {
      send(m.ws, { t: 'over', reason, best: round1(m.youBest) });
      // quitting is always a loss; otherwise the server says (whoever fell first loses)
      if (reason === 'quit') decide('lost', 'quit');
      else setTimer(() => { if (match === m && !m.outcome) decide('lost', reason); }, RESULT_WAIT_MS);
    } else {
      handle(m.referee.report(YOU, { h: m.youBest, over: reason }));
    }
  });

  // ------------------------------------------------------------------------------- live socket
  function onRoomMessage(m, msg) {
    switch (msg.t) {
      case 'opp':
        m.oppH = num(msg.h);
        m.oppBest = Math.max(m.oppBest, num(msg.best));
        break;
      case 'attack':
        if (DUEL.attackFor[msg.m] === msg.kind) handle([{ type: 'attack', from: 1 - m.you, to: m.you, m: msg.m, kind: msg.kind }]);
        break;
      case 'sent':
        if (DUEL.attackFor[msg.m] === msg.kind) handle([{ type: 'attack', from: m.you, to: 1 - m.you, m: msg.m, kind: msg.kind }]);
        break;
      case 'result':
        if (Array.isArray(msg.best)) m.oppBest = Math.max(m.oppBest, num(msg.best[1 - m.you]));
        if (msg.winner === 0 || msg.winner === 1) handle([{ type: 'result', winner: msg.winner, reason: String(msg.reason || '') }]);
        break;
      default:
        break;
    }
  }

  /** Join a live room (a friend's code, or the one the lobby found). `onStart(match)` when both are in. */
  function joinRoom(code, { onWait = () => {}, onStart = () => {}, onFail = () => {} } = {}) {
    if (!live || !isRoomCode(code)) {
      onFail(live ? S.duelRoomGone : S.duelOffline);
      return;
    }
    let started = false;
    let ws;
    try {
      ws = new WebSocketImpl(`${wsUrl}/match/room/${code}`);
    } catch {
      onFail(S.duelNoServer);
      return;
    }
    pending = { ws, timer: null };
    ws.onopen = () => send(ws, { t: 'hello', v: 1, name: nickname() || '' });
    ws.onmessage = (e) => {
      const msg = parse(e.data);
      if (!msg) return;
      if (!started) {
        if (msg.t === 'wait') onWait(code);
        else if (msg.t === 'gone') {
          stopPending();
          onFail(S.duelRoomGone);
        } else if (msg.t === 'start' && isMatchSeed(msg.seed) && (msg.you === 0 || msg.you === 1)) {
          started = true;
          clearTimer(pending?.timer);
          pending = null;
          const m = newMatch({ kind: 'live', seed: msg.seed, oppName: cleanNickname(msg.opp?.name) || S.duelSomeone, ws, you: msg.you });
          onStart(m);
        }
        return;
      }
      if (match && match.ws === ws) onRoomMessage(match, msg);
    };
    ws.onclose = () => {
      if (!started) {
        if (pending?.ws === ws) {
          stopPending();
          onFail(S.duelNoServer);
        }
        return;
      }
      const m = match;
      if (m && m.ws === ws && !m.outcome) m.lostConn = true;
    };
    ws.onerror = () => {};
  }

  /** Random opponent: the lobby pairs two players; after DUEL.searchMs a recording or the computer instead. */
  function findOpponent({ onFound = () => {}, onFallback = () => {} } = {}) {
    stopPending();
    if (!live) {
      fallback(onFallback);
      return;
    }
    let ws;
    try {
      ws = new WebSocketImpl(`${wsUrl}/match/lobby`);
    } catch {
      fallback(onFallback);
      return;
    }
    const timer = setTimer(() => {
      if (pending?.ws !== ws) return;
      stopPending();
      fallback(onFallback);
    }, DUEL.searchMs);
    pending = { ws, timer };
    ws.onopen = () => send(ws, { t: 'hello', v: 1, name: nickname() || '' });
    ws.onmessage = (e) => {
      const msg = parse(e.data);
      if (!msg || msg.t !== 'match' || !isRoomCode(msg.room) || pending?.ws !== ws) return;
      stopPending();
      joinRoom(msg.room, { onStart: onFound, onFail: () => fallback(onFallback) });
    };
    ws.onclose = () => {
      if (pending?.ws !== ws) return;
      stopPending();
      fallback(onFallback);
    };
    ws.onerror = () => {};
  }

  /** Nobody to pair with: a recording of a real match from the server, else Robot Rikus. */
  async function fallback(onFallback) {
    let rec = null;
    if (httpUrl && fetchImpl) {
      try {
        const res = await fetchImpl(`${httpUrl}/match/ghost`, { credentials: 'omit' });
        if (res.ok) {
          const body = await res.json();
          rec = decodeChallenge(body?.payload);
        }
      } catch {
        rec = null;
      }
    }
    if (rec) {
      newMatch({ kind: 'ghost', seed: rec.seed, oppName: rec.name || S.duelSomeone, run: rec.run });
      onFallback(match, S.duelNobody);
    } else {
      startBot();
      onFallback(match, S.duelNobodyBot);
    }
  }

  /** A friend room: the server makes a code; the host waits in the room until the friend comes. */
  async function createRoom({ onCode = () => {}, onStart = () => {}, onFail = () => {} } = {}) {
    stopPending();
    if (!live || !fetchImpl) {
      onFail(S.duelOffline);
      return;
    }
    let code = null;
    try {
      const res = await fetchImpl(`${httpUrl}/match/room`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'omit',
      });
      const body = res.ok ? await res.json() : null;
      code = isRoomCode(body?.code) ? body.code : null;
    } catch {
      code = null;
    }
    if (!code) {
      onFail(S.duelNoServer);
      return;
    }
    onCode(code);
    joinRoom(code, { onStart, onFail });
    if (pending) {
      pending.timer = setTimer(() => {
        stopPending();
        onFail(S.duelRoomGone);
      }, DUEL.roomWaitMs);
    }
  }

  function startBot() {
    const seed = newMatchSeed();
    return newMatch({ kind: 'bot', seed, oppName: S.duelBotName, run: botRun(seed) });
  }

  /** Someone's run from a link (?teen=): the same tower against their recording. */
  function startLink(challenge) {
    if (!challenge || !isMatchSeed(challenge.seed)) return null;
    return newMatch({ kind: 'link', seed: challenge.seed, oppName: challenge.name || S.duelSomeone, run: challenge.run });
  }

  function stopPending() {
    if (!pending) return;
    clearTimer(pending.timer);
    close(pending.ws);
    pending = null;
  }

  return {
    get live() {
      return live;
    },
    get match() {
      return match;
    },
    findOpponent,
    createRoom,
    joinRoom,
    startBot,
    startLink,
    /** Stop searching / waiting (the match itself, if any, is left alone). */
    cancel: stopPending,
    /** Leave the current match (home button, new game): closes a live room. */
    leave() {
      stopPending();
      if (match?.ws) close(match.ws);
      match = null;
    },
    /** What the results screen needs once the tower has ended. */
    summary() {
      const m = match;
      if (!m) return null;
      if (!m.recorder.ended) m.recorder.finish(m.lastT, 'stop');
      const run = m.recorder.run();
      return {
        kind: m.kind,
        outcome: m.outcome || (m.lostConn ? 'none' : null),
        reason: m.reason,
        oppName: m.oppName,
        oppBest: round1(m.oppBest),
        youBest: round1(m.youBest),
        lostConn: m.lostConn,
        seed: m.seed,
        challenge: encodeChallenge({ seed: m.seed, name: nickname() || '', run }),
      };
    },
    /** Live: waits (up to RESULT_WAIT_MS) for the server's verdict after our tower fell. */
    whenDecided(cb) {
      const m = match;
      if (!m || m.outcome || m.kind !== 'live' || m.lostConn) {
        cb();
        return;
      }
      const t0 = now();
      const poll = () => {
        if (match !== m || m.outcome || m.lostConn || now() - t0 > RESULT_WAIT_MS + 300) cb();
        else setTimer(poll, 100);
      };
      poll();
    },
  };
}
