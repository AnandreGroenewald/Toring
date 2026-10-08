// Uitdagersreeks on the device (docs/CHALLENGE-SPEC.md): finds an opponent (live through the Worker,
// a recording of a real match, or the computer), runs the match against it and tells the game what
// happens: attacks ('duel:attack'), the result ('duel:end') and the race track ('hud:duel'). The first
// to a height mark chooses the punishment ('duel:choose' -> 'ui:duel-punish' -> 'duel:chosen'). The rules
// are js/core/duel.js; for a live match the server runs the same referee (server/src/match.js).
// Both players' cards (js/core/economy.js: frame, badge, title, celebration, visitor style, rank) travel
// with the hello and the start, so each side sees the other's looks.

import { DUEL } from './config.js';
import { S, PUNISH_INFO } from './core/strings.js';
import {
  createReferee, createRecorder, createGhost, botRun, newMatchSeed, isMatchSeed, decodeChallenge,
  encodeChallenge, isRoomCode, cleanNickname, attackFor, PUNISHMENTS, isPunishment, botPunishment,
} from './core/duel.js';
import { cleanCard, cosmetic, BOT_CARD } from './core/economy.js';

const YOU = 0;
const THEM = 1;
const RESULT_WAIT_MS = 2500;   // live: after our tower fell, wait this long for the server's verdict
const PROTOCOL = 2;            // 2: the first to a height mark chooses the punishment ('choose' / 'punish')
const DEFAULT_CARD = cleanCard(null);   // a recording or a link carries no card
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

const ROOM_RETRY_MS = [1000, 2000, 4000, 8000];   // a dropped room wait reconnects after these (then every 8 s)
const SEARCH_PING_MS = 25000;   // a searching phone says something now and then, so its network keeps the line open

/**
 * @param {{ bus, apiUrl?: string, nickname: () => string, card?: () => object, onDecided?: (outcome) => void,
 *   WebSocketImpl?, fetchImpl?, timers? }} deps
 */
export function createDuel({
  bus, apiUrl = '', nickname = () => '', card = () => null, onDecided = () => {},
  WebSocketImpl = globalThis.WebSocket, fetchImpl = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null,
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), now = () => Date.now(),
} = {}) {
  const wsUrl = wsBase(apiUrl);
  const httpUrl = apiUrl ? String(apiUrl).replace(/\/+$/, '') : '';
  const live = !!wsUrl && typeof WebSocketImpl === 'function';
  let match = null;
  let pending = null;   // { ws, timer } while searching or waiting in a room
  const hud = { you: 0, them: 0, name: '', badge: '', claimed: {} };
  const hello = () => ({ t: 'hello', v: PROTOCOL, rules: DUEL.rules, name: nickname() || '', card: cleanCard(card()) });

  // ------------------------------------------------------------------------------- a match
  function newMatch({ kind, seed, oppName, oppCard = null, run = null, ws = null, you = YOU }) {
    if (match) dropChoice(match);
    match = {
      kind, seed, ws, you,
      oppName: oppName || S.duelSomeone,
      oppCard: oppCard ? cleanCard(oppCard) : DEFAULT_CARD,
      youName: nickname() || '',
      referee: kind === 'live' ? null : createReferee(),
      ghost: run ? createGhost(run) : null,
      recorder: createRecorder(),
      claimed: {},
      choice: null,       // { mark, def, timer } while the player chooses a punishment
      choiceQueue: [],
      youH: 0, youBest: 0, oppH: 0, oppBest: 0,
      outcome: null, reason: null,
      over: false, overAt: 0, lostConn: false,
      lastSent: -1e9, sentBest: 0, lastT: 0,
    };
    hud.name = match.oppName;
    hud.badge = cosmetic('badge', match.oppCard.badge)?.emoji || '';
    hud.claimed = match.claimed;
    hud.you = 0;
    hud.them = 0;
    return match;
  }

  function decide(outcome, reason) {
    const m = match;
    if (!m || m.outcome) return;
    dropChoice(m);
    m.outcome = outcome;
    m.reason = reason;
    if (!m.recorder.ended) m.recorder.finish(m.lastT, m.youBest >= DUEL.goalM ? 'goal' : 'stop');
    onDecided(outcome, m);
    if (!m.over) bus.emit('duel:end', { outcome });   // the tower stops here (won, or the other one got there first)
    if (m.kind === 'live') setTimer(() => { if (match === m) close(m.ws); }, 1500);
  }

  /** Referee events (a recording or the computer) and the live result, in one shape. */
  function handle(events) {
    const m = match;
    if (!m) return;
    for (const e of events) {
      if (e.type === 'attack') {
        // someone reached a height mark first: we choose, or Robot Rikus / the recording does
        const mine = e.from === m.you;
        if (!claim(m, e.m, mine)) continue;
        if (mine) askChoice(m, e.m);
        else punishIn(m, botPunishment(m.seed, e.m));
      } else if (e.type === 'result') {
        decide(e.winner === m.you ? 'won' : 'lost', e.reason);
      }
    }
  }

  /** A height mark taken: the race track colours it. False when it was already taken. */
  function claim(m, mark, mine) {
    if (m.claimed[mark]) return false;
    m.claimed[mark] = mine ? 'you' : 'them';
    return true;
  }

  /** The other tower sent us a punishment. */
  function punishIn(m, kind) {
    if (!isPunishment(kind) || m.over) return;
    bus.emit('duel:attack', { kind, from: m.oppName, style: m.oppCard.style });
  }

  /** Our punishment reached the other tower: a recording loses height, and the player hears about it. */
  function punishOut(m, kind) {
    const info = PUNISH_INFO[kind];
    if (!info) return;
    if (m.ghost) m.ghost.hit(kind);
    // a visitor wears our style (js/core/economy.js) on the other tower: the toast shows it too
    const acc = kind === 'monkey' || kind === 'thief' ? cosmetic('style', card()?.style)?.emoji || '' : '';
    bus.emit('hud:toast', { text: S.duelAttackOut(info.name, m.oppName, info.emoji + acc), color: '#ffe38c', visitor: true });
  }

  // ------------------------------------------------------------------------- choosing a punishment
  /** We were first to height mark `mark`: the player chooses, or gets the default after DUEL.chooseMs. */
  function askChoice(m, mark) {
    if (m.choice) {
      m.choiceQueue.push(mark);
      return;
    }
    const def = attackFor(mark) || PUNISHMENTS[0];
    const timer = setTimer(() => choose(mark, def), DUEL.chooseMs);
    m.choice = { mark, def, timer };
    bus.emit('duel:choose', { m: mark, opp: m.oppName, def, options: [...PUNISHMENTS], ms: DUEL.chooseMs });
  }

  /** The player's pick (or the default): to the server, or straight onto the recording. */
  function choose(mark, kind) {
    const m = match;
    const c = m && m.choice;
    if (!c || c.mark !== mark) return;
    clearTimer(c.timer);
    m.choice = null;
    const k = isPunishment(kind) ? kind : c.def;
    bus.emit('duel:chosen', { m: mark, kind: k });
    if (!m.outcome) {
      if (m.kind === 'live') send(m.ws, { t: 'punish', m: mark, kind: k });
      else punishOut(m, k);
    }
    nextChoice(m);
  }

  function nextChoice(m) {
    const next = m.choiceQueue.shift();
    if (next !== undefined && !m.outcome) askChoice(m, next);
  }

  /** The match ended (or a new one began) while the player was choosing: nothing is sent. */
  function dropChoice(m) {
    if (!m || !m.choice) return;
    clearTimer(m.choice.timer);
    bus.emit('duel:chosen', { m: m.choice.mark, kind: null });
    m.choice = null;
    m.choiceQueue.length = 0;
  }

  bus.on('ui:duel-punish', (p) => choose(Number(p && p.m), p && p.kind));

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
      case 'choose':   // we were first to a height mark: the player chooses what to send
        if (DUEL.marks.includes(msg.m) && claim(m, msg.m, true)) askChoice(m, msg.m);
        break;
      case 'attack':   // the other player's punishment
        if (DUEL.marks.includes(msg.m) && isPunishment(msg.kind)) {
          claim(m, msg.m, false);
          punishIn(m, msg.kind);
        }
        break;
      case 'sent':     // the server passed ours on (or sent the default: we were too slow, or an old server)
        if (DUEL.marks.includes(msg.m) && isPunishment(msg.kind)) {
          claim(m, msg.m, true);
          if (m.choice && m.choice.mark === msg.m) {
            clearTimer(m.choice.timer);
            m.choice = null;
            bus.emit('duel:chosen', { m: msg.m, kind: msg.kind });
            nextChoice(m);
          }
          punishOut(m, msg.kind);
        }
        break;
      case 'result':
        if (Array.isArray(msg.best)) m.oppBest = Math.max(m.oppBest, num(msg.best[1 - m.you]));
        if (msg.winner === 0 || msg.winner === 1) handle([{ type: 'result', winner: msg.winner, reason: String(msg.reason || '') }]);
        break;
      default:
        break;
    }
  }

  /**
   * Join a live room (a friend's code, or the one the lobby found). `onStart(match)` when both are in.
   * Once in the room, a dropped connection doesn't end the wait (the game went to the background to
   * share the link, the network blinked): it comes back to the same room, `onRetry` meanwhile, until
   * the room is gone. While the game is hidden (away()) the connection stays closed, so a match never
   * starts while this player isn't looking; back() reconnects.
   */
  function joinRoom(code, { onWait = () => {}, onStart = () => {}, onFail = () => {}, onRetry = () => {} } = {}) {
    if (!live || !isRoomCode(code)) {
      onFail(live ? S.duelRoomGone : S.duelOffline);
      return;
    }
    // `key`: this game's own key for the room; a reconnect brings it, so the server lets it replace our old
    // connection (which may never have closed there) instead of starting a match against it
    const key = Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    const room = { code, key, joined: false, started: false, tries: 0, retry: null, away: hidden(), connect: null, onRetry, until: now() + DUEL.roomWaitMs };
    pending = { ws: null, timer: null, room };
    const retryLater = () => {
      if (pending?.room !== room || room.retry || room.away) return;
      if (now() > room.until) {   // a room waits DUEL.roomWaitMs at most: by now it is gone
        stopPending();
        onFail(S.duelRoomGone);
        return;
      }
      const ms = ROOM_RETRY_MS[Math.min(room.tries, ROOM_RETRY_MS.length - 1)];
      room.tries++;
      onRetry();
      room.retry = setTimer(() => {
        room.retry = null;
        if (pending?.room === room && !pending.ws && !room.away) room.connect();
      }, ms);
    };
    room.connect = () => {
      let ws;
      try {
        ws = new WebSocketImpl(`${wsUrl}/match/room/${code}`);
      } catch {
        if (room.joined) retryLater();
        else {
          stopPending();
          onFail(S.duelNoServer);
        }
        return;
      }
      pending.ws = ws;
      ws.onopen = () => send(ws, { ...hello(), key: room.key });
      ws.onmessage = (e) => {
        const msg = parse(e.data);
        if (!msg) return;
        if (!room.started) {
          if (pending?.ws !== ws) return;
          if (msg.t === 'wait') {
            room.joined = true;
            room.tries = 0;
            onWait(code);
          } else if (msg.t === 'gone') {
            stopPending();
            onFail(S.duelRoomGone);
          } else if (msg.t === 'start' && isMatchSeed(msg.seed) && (msg.you === 0 || msg.you === 1)) {
            room.started = true;
            clearTimer(pending?.timer);
            pending = null;
            const m = newMatch({
              kind: 'live', seed: msg.seed, oppName: cleanNickname(msg.opp?.name) || S.duelSomeone, oppCard: msg.opp?.card, ws, you: msg.you,
            });
            onStart(m);
          }
          return;
        }
        if (match && match.ws === ws) onRoomMessage(match, msg);
      };
      ws.onclose = () => {
        if (!room.started) {
          if (pending?.ws !== ws) return;   // stopped, or replaced by a reconnect
          pending.ws = null;
          if (room.joined) {
            retryLater();   // the room is still there: come back to it
            return;
          }
          stopPending();
          onFail(S.duelNoServer);
          return;
        }
        const m = match;
        if (m && m.ws === ws && !m.outcome) m.lostConn = true;
      };
      ws.onerror = () => {};
    };
    if (room.away) room.joined = true;   // the room was made a moment ago; it is entered on back()
    else room.connect();
  }

  /** Is the game out of sight (another app, the home screen)? */
  function hidden() {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  /**
   * Random opponent: the lobby pairs two players. No time limit (1.10): the search goes on until someone
   * comes, the player cancels, or chooses to play now (playNow: a recording or Robot Rikus). A dropped
   * connection comes back (and stays closed while the game is hidden, like a room); `onRetry` meanwhile.
   * A quiet ping keeps a phone's connection open while nothing happens.
   */
  function findOpponent({ onFound = () => {}, onFallback = () => {}, onRetry = () => {} } = {}) {
    stopPending();
    if (!live) {
      fallback(onFallback);
      return;
    }
    const search = { tries: 0, retry: null, ping: null, away: hidden(), connect: null, onRetry, onFound, onFallback };
    pending = { ws: null, timer: null, search };
    const retryLater = () => {
      if (pending?.search !== search || search.retry || search.away) return;
      const ms = ROOM_RETRY_MS[Math.min(search.tries, ROOM_RETRY_MS.length - 1)];
      search.tries++;
      onRetry();
      search.retry = setTimer(() => {
        search.retry = null;
        if (pending?.search === search && !pending.ws && !search.away) search.connect();
      }, ms);
    };
    search.connect = () => {
      let ws;
      try {
        ws = new WebSocketImpl(`${wsUrl}/match/lobby`);
      } catch {
        retryLater();
        return;
      }
      pending.ws = ws;
      ws.onopen = () => {
        search.tries = 0;
        send(ws, hello());
      };
      ws.onmessage = (e) => {
        const msg = parse(e.data);
        if (!msg || msg.t !== 'match' || !isRoomCode(msg.room) || pending?.ws !== ws) return;
        stopPending();
        joinRoom(msg.room, { onStart: onFound, onFail: () => findOpponent({ onFound, onFallback, onRetry }) });
      };
      ws.onclose = () => {
        if (pending?.ws !== ws) return;   // stopped, paired, or replaced by a reconnect
        pending.ws = null;
        retryLater();
      };
      ws.onerror = () => {};
    };
    const ping = () => {
      if (pending?.search !== search) return;
      if (pending.ws && pending.ws.readyState === 1) send(pending.ws, { t: 'ping' });
      search.ping = setTimer(ping, SEARCH_PING_MS);
    };
    search.ping = setTimer(ping, SEARCH_PING_MS);
    if (!search.away) search.connect();
  }

  /** Stop looking and play now: a recording of a real match, or Robot Rikus (`onFallback` of the search). */
  function playNow() {
    const search = pending?.search;
    const onFallback = search ? search.onFallback : null;
    stopPending();
    if (onFallback) fallback(onFallback);
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
  async function createRoom({ onCode = () => {}, onStart = () => {}, onFail = () => {}, onWait = () => {}, onRetry = () => {} } = {}) {
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
    joinRoom(code, { onStart, onFail, onWait, onRetry });
    if (pending) {
      pending.timer = setTimer(() => {
        stopPending();
        onFail(S.duelRoomGone);
      }, DUEL.roomWaitMs);
    }
  }

  function startBot() {
    const seed = newMatchSeed();
    return newMatch({ kind: 'bot', seed, oppName: S.duelBotName, oppCard: BOT_CARD, run: botRun(seed) });
  }

  /** Someone's run from a link (?teen=): the same tower against their recording. */
  function startLink(challenge) {
    if (!challenge || !isMatchSeed(challenge.seed)) return null;
    return newMatch({ kind: 'link', seed: challenge.seed, oppName: challenge.name || S.duelSomeone, run: challenge.run });
  }

  function stopPending() {
    if (!pending) return;
    const { ws, timer, room, search } = pending;
    pending = null;
    clearTimer(timer);
    if (room?.retry) clearTimer(room.retry);
    if (search?.retry) clearTimer(search.retry);
    if (search?.ping) clearTimer(search.ping);
    if (ws) close(ws);
  }

  /** Searching the lobby right now? */
  function searching() {
    return !!pending?.search;
  }

  /** The game went out of sight: a room still waiting closes its connection (it reopens on back()). */
  function away() {
    const search = pending?.search;
    if (search && !search.away) {   // a search waits: its connection closes until the game is back
      search.away = true;
      if (search.retry) clearTimer(search.retry);
      search.retry = null;
      const ws = pending.ws;
      pending.ws = null;
      if (ws) close(ws);
      return;
    }
    const room = pending?.room;
    if (!room || room.started || room.away) return;
    room.away = true;
    if (room.retry) clearTimer(room.retry);
    room.retry = null;
    const ws = pending.ws;
    pending.ws = null;
    if (ws) close(ws);
  }

  /** The game is back: a waiting room reconnects at once. */
  function back() {
    const search = pending?.search;
    if (search && search.away) {
      search.away = false;
      search.tries = 0;
      if (!pending.ws) search.connect();
      return;
    }
    const room = pending?.room;
    if (!room || room.started || !room.away) return;
    room.away = false;
    room.tries = 0;
    if (!pending.ws) {
      room.onRetry();
      room.connect();
    }
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
    away,
    back,
    playNow,
    /** Searching the lobby (the waiting screen or Oefen while waiting shows it). */
    get searching() {
      return searching();
    },
    /** Leave the current match (home button, new game): closes a live room. */
    leave() {
      stopPending();
      dropChoice(match);
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
        oppCard: m.oppCard,
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
