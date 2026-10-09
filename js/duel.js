// Uitdagersreeks on the device (docs/CHALLENGE-SPEC.md): finds an opponent (live through the Worker,
// a recording of a real match, or the computer), runs the match against it and tells the game what
// happens: attacks ('duel:attack'), the result ('duel:end') and the race track ('hud:duel'). The first
// to a height mark chooses the punishment ('duel:choose' -> 'ui:duel-punish' -> 'duel:chosen'). The rules
// are js/core/duel.js; for a live match the server runs the same referee (server/src/match.js).
// Both players' cards (js/core/economy.js: frame, badge, title, celebration, visitor style, rank) travel
// with the hello and the start, so each side sees the other's looks.
// Two modes (1.11): Wedloop ('race', all of the above) and Blok vir Blok ('turns'): one tower, a block
// each in turn (js/core/turns.js). In a Blok vir Blok match the game whose turn it is plays the block and
// tells the other game where it was let go ('turns:mydrop') and where the tower came to rest
// ('turns:mysettled'); this passes those on, and tells the game whose turn it is ('turns:turn'), the
// other player's drop and report ('turns:drop', 'turns:settled') and the result. Against Robot Rikus
// the game plays his turns too, and the referee runs here.

import { DUEL, TURNS, LIVES } from './config.js';
import { S, PUNISH_INFO, WEATHER_INFO } from './core/strings.js';
import {
  createReferee, createRecorder, createGhost, botRun, newMatchSeed, isMatchSeed, decodeChallenge,
  encodeChallenge, isRoomCode, cleanNickname, attackFor, PUNISHMENTS, isPunishment, botPunishment,
} from './core/duel.js';
import { cleanCard, cosmetic, BOT_CARD } from './core/economy.js';
import {
  createTurnReferee, cleanPose, cleanSnap, cleanRating, snapFits, isSabotage, botSabotage, firstSeat, SABOTAGES,
} from './core/turns.js';

const YOU = 0;
const THEM = 1;
const RESULT_WAIT_MS = 2500;   // live: after our tower fell, wait this long for the server's verdict
const PROTOCOL = 3;            // 2: the first to a height mark chooses the punishment ('choose' / 'punish'); 3: Blok vir Blok
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
  const hud = { you: 0, them: 0, name: '', badge: '', claimed: {}, lives: null, youLives: null };
  const hello = (mode) => ({
    t: 'hello', v: PROTOCOL, rules: DUEL.rules, ...(mode === 'turns' ? { mode } : {}), name: nickname() || '', card: cleanCard(card()),
  });

  // ------------------------------------------------------------------------------- a match
  function newMatch({ kind, seed, oppName, oppCard = null, run = null, ws = null, you = YOU, mode = 'race', turn = null }) {
    if (match) dropChoice(match);
    const turns = mode === 'turns';
    match = {
      kind, seed, ws, you,
      mode: turns ? 'turns' : 'race',
      // Blok vir Blok: the referee (Robot Rikus: here; live: the server's, whose events come as messages),
      // the turn on now, the hearts, and the game's events held back until the scene is up
      tref: turns && kind !== 'live' ? createTurnReferee({ first: firstSeat() }) : null,
      turn: turns ? turn : null,
      hearts: turns ? [TURNS.hearts, TURNS.hearts] : null,
      perfects: [0, 0],
      sceneReady: false,
      queue: [],
      oppName: oppName || S.duelSomeone,
      oppCard: oppCard ? cleanCard(oppCard) : DEFAULT_CARD,
      youName: nickname() || '',
      referee: kind === 'live' || turns ? null : createReferee(),
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
    hud.lives = null;
    hud.youLives = null;
    if (match.tref) {
      const [e] = match.tref.start();
      match.turn = turnOf(e);
    }
    if (match.turn) match.hearts = [...match.turn.hearts];
    return match;
  }

  function decide(outcome, reason) {
    const m = match;
    if (!m || m.outcome) return;
    dropChoice(m);
    m.outcome = outcome;
    m.reason = reason;
    if (!m.recorder.ended) m.recorder.finish(m.lastT, m.mode === 'race' && m.youBest >= DUEL.goalM ? 'goal' : 'stop');
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
  /**
   * We were first to height mark `mark` (Wedloop), or earned a joker (Blok vir Blok: mark 0): the player
   * chooses, or gets the default after the choosing time. The game goes on meanwhile.
   */
  function askChoice(m, mark) {
    if (m.choice) {
      m.choiceQueue.push(mark);
      return;
    }
    const joker = m.mode === 'turns';
    const def = joker ? SABOTAGES[0] : attackFor(mark) || PUNISHMENTS[0];
    const ms = joker ? TURNS.chooseMs : DUEL.chooseMs;
    const timer = setTimer(() => choose(mark, def), ms);
    m.choice = { mark, def, timer, joker };
    bus.emit('duel:choose', { m: mark, opp: m.oppName, def, options: joker ? [...SABOTAGES] : [...PUNISHMENTS], ms, ...(joker ? { joker } : {}) });
  }

  /** The player's pick (or the default): to the server, or straight onto the recording. */
  function choose(mark, kind) {
    const m = match;
    const c = m && m.choice;
    if (!c || c.mark !== mark) return;
    clearTimer(c.timer);
    m.choice = null;
    if (c.joker) {
      const k = isSabotage(kind) ? kind : c.def;
      bus.emit('duel:chosen', { m: mark, kind: k });
      if (!m.outcome) {
        if (m.kind === 'live') send(m.ws, { t: 'joker', kind: k });   // the server answers 'sent'
        else turnEvents(m, m.tref.joker(m.you, k));
      }
      nextChoice(m);
      return;
    }
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
    if (!m || m.over || !s || m.mode !== 'race') return;
    m.lastT = s.t;
    if (Number.isInteger(s.lives)) hud.youLives = s.lives;
    m.youH = s.h;
    m.youBest = Math.max(m.youBest, s.best);
    // the recording keeps the best height (the results' number), not the top: that counts a block still in the air
    m.recorder.add(s.t, m.youBest);
    if (!m.outcome) {
      if (m.kind === 'live') {
        const t = now();
        const crossed = [...DUEL.marks, DUEL.goalM].some((mk) => m.youBest >= mk && m.sentBest < mk);
        if (crossed || t - m.lastSent >= DUEL.stateEveryMs) {
          send(m.ws, { t: 'state', h: round1(s.h), best: round1(m.youBest), ...(Number.isInteger(s.lives) ? { lives: s.lives } : {}) });
          m.lastSent = t;
          m.sentBest = m.youBest;
        }
      } else {
        const g = m.ghost.step(s.t);
        m.oppH = g.h;
        m.oppBest = g.best;
        // a recording (or Robot Rikus) shows full hearts, and none once its tower fell
        hud.lives = g.over === 'lives' || g.over === 'flood' ? 0 : LIVES;
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
    if (m.mode === 'turns') {
      // Blok vir Blok ends by itself only when the player quits: a loss (the server hands it on)
      if (m.kind === 'live') send(m.ws, { t: 'over', reason: 'quit' });
      decide('lost', 'quit');
      return;
    }
    if (m.kind === 'live') {
      send(m.ws, { t: 'over', reason, best: round1(m.youBest) });
      // quitting is always a loss; otherwise the server says (whoever fell first loses)
      if (reason === 'quit') decide('lost', 'quit');
      else setTimer(() => { if (match === m && !m.outcome) decide('lost', reason); }, RESULT_WAIT_MS);
    } else {
      handle(m.referee.report(YOU, { h: m.youBest, over: reason }));
    }
  });

  // ------------------------------------------------------------------------------- Blok vir Blok
  /** A referee's 'turn' event (or the server's 'turn' message) as the game takes it; null if malformed. */
  function turnOf(e) {
    if (!e || !Number.isInteger(e.n) || e.n < 1) return null;
    const pair = (a, max) => (Array.isArray(a) && a.length === 2 ? a.map((v) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0))) : null);
    return {
      n: e.n,
      seat: e.seat === 1 ? 1 : 0,
      hearts: pair(e.hearts, TURNS.hearts) || [TURNS.hearts, TURNS.hearts],
      streaks: pair(e.streaks, 1e4) || [0, 0],
      sab: isSabotage(e.sab) ? e.sab : null,
    };
  }

  /** A turn begins: the game hears whose it is (and the sabotage on this block, if any). */
  function startTurn(m, t) {
    if (!t || (m.turn && m.turn.n > t.n) || (m.turn && m.turn.n === t.n && m.turnShown)) return;
    m.turn = t;
    m.turnShown = true;
    m.hearts = [...t.hearts];
    bus.emit('turns:turn', { ...t, mine: t.seat === m.you, you: m.you, names: namesOf(m), bot: m.kind !== 'live' });
  }

  /** [seat 0's name, seat 1's name] as this game shows them ('' for this player: "Jy"). */
  function namesOf(m) {
    const n = ['', ''];
    n[1 - m.you] = m.oppName;
    return n;
  }

  /** Events of a referee that runs here (Robot Rikus): turns, jokers, sabotages and the result. */
  function turnEvents(m, events) {
    for (const e of events) {
      if (e.type === 'turn') {
        m.turnShown = false;
        startTurn(m, turnOf(e));
      } else if (e.type === 'joker') {
        if (e.seat === m.you) askChoice(m, 0);
        else turnEvents(m, m.tref.joker(e.seat, botSabotage(m.seed, m.tref.n)));   // Robot Rikus doesn't wait
      } else if (e.type === 'sent') {
        if (e.seat === m.you) sabotageOut(m, e.kind);
        else sabotageIn(m, e.kind);
      } else if (e.type === 'result') {
        m.hearts = [...e.hearts];
        decide(e.winner === m.you ? 'won' : 'lost', e.reason);
      }
    }
  }

  /** Our joker's sabotage is on its way to the other player's next block. */
  function sabotageOut(m, kind) {
    const info = WEATHER_INFO[kind];
    if (info) bus.emit('hud:toast', { text: S.turnsSabotageOut(`${info.emoji} ${info.name}`, m.oppName), color: '#ffe38c', visitor: true });
  }

  /** The other player's sabotage comes with our next block (a heads-up now; the banner when it comes). */
  function sabotageIn(m, kind) {
    const info = WEATHER_INFO[kind];
    if (info) bus.emit('hud:toast', { text: S.turnsSabotageIn(m.oppName, `${info.emoji} ${info.name}`), color: '#ffb0a8', visitor: true });
  }

  /** A live Blok vir Blok message (held back until the scene is up: the first may come during the 3-2-1). */
  function onTurnsMessage(m, msg) {
    if (!m.sceneReady) {
      m.queue.push(msg);
      return;
    }
    const theirs = m.turn && m.turn.seat !== m.you && msg.n === m.turn.n;
    switch (msg.t) {
      case 'turn':
        m.turnShown = m.turn?.n === msg.n ? m.turnShown : false;
        startTurn(m, turnOf(msg));
        break;
      case 'drop': {
        const p = cleanPose(msg.p);
        const ct = typeof msg.ct === 'number' && msg.ct >= 0 && msg.ct <= 120000 ? msg.ct : null;
        if (p && theirs) bus.emit('turns:drop', { n: msg.n, p, ct });
        break;
      }
      case 'settled': {
        const snap = cleanSnap(msg.snap);
        const r = cleanRating(msg.r);
        if (!snap || !theirs || !snapFits(snap, msg.n, r)) break;
        if (r === 'P') m.perfects[m.turn.seat] += 1;
        bus.emit('turns:settled', { n: msg.n, lost: msg.lost === true, r, snap });
        break;
      }
      case 'choose':
        askChoice(m, 0);
        break;
      case 'sent':
        if (isSabotage(msg.kind)) {
          if (m.choice && m.choice.joker) {
            clearTimer(m.choice.timer);
            m.choice = null;
            bus.emit('duel:chosen', { m: 0, kind: msg.kind });
          }
          sabotageOut(m, msg.kind);
        }
        break;
      case 'sabotage':
        if (isSabotage(msg.kind)) sabotageIn(m, msg.kind);
        break;
      case 'result':
        if (Array.isArray(msg.hearts) && msg.hearts.length === 2) m.hearts = msg.hearts.map((h) => Math.max(0, Math.floor(Number(h)) || 0));
        if (msg.winner === 0 || msg.winner === 1) decide(msg.winner === m.you ? 'won' : 'lost', String(msg.reason || ''));
        break;
      default:
        break;
    }
  }

  // the scene is up: the first turn, then whatever came meanwhile
  bus.on('turns:ready', () => {
    const m = match;
    if (!m || m.mode !== 'turns' || m.sceneReady) return;
    m.sceneReady = true;
    if (m.lostConn && !m.outcome) {   // the connection went during the 3-2-1
      bus.emit('duel:end', { outcome: 'none' });
      return;
    }
    m.turnShown = false;
    startTurn(m, m.turn);
    for (const msg of m.queue.splice(0)) onTurnsMessage(m, msg);
  });

  // our block was let go: the other game drops it from the same spot
  bus.on('turns:mydrop', (d) => {
    const m = match;
    if (!m || m.mode !== 'turns' || m.outcome || m.kind !== 'live' || !d) return;
    const p = cleanPose(d.p);
    const ct = typeof d.ct === 'number' && d.ct >= 0 && d.ct <= 120000 ? Math.round(d.ct) : null;
    if (p && m.turn && d.n === m.turn.n && m.turn.seat === m.you) send(m.ws, { t: 'drop', n: d.n, p, ...(ct !== null ? { ct } : {}) });
  });

  // a turn ended (ours; against Robot Rikus his too): where the tower came to rest, a heart, the rating
  bus.on('turns:mysettled', (d) => {
    const m = match;
    if (!m || m.mode !== 'turns' || m.outcome || !d || !m.turn || d.n !== m.turn.n) return;
    const snap = cleanSnap(d.snap);
    if (!snap) return;
    const r = cleanRating(d.r);
    if (r === 'P') m.perfects[m.turn.seat] += 1;
    if (m.kind === 'live') {
      if (m.turn.seat === m.you) send(m.ws, { t: 'settled', n: d.n, lost: d.lost === true, r, snap });
      return;
    }
    turnEvents(m, m.tref.settled(m.turn.seat, { n: d.n, lost: d.lost === true, r }));
  });

  // ------------------------------------------------------------------------------- live socket
  function onRoomMessage(m, msg) {
    if (m.mode === 'turns') {
      onTurnsMessage(m, msg);
      return;
    }
    switch (msg.t) {
      case 'opp':
        m.oppH = num(msg.h);
        m.oppBest = Math.max(m.oppBest, num(msg.best));
        if (Number.isInteger(msg.lives) && msg.lives >= 0 && msg.lives <= 9) hud.lives = msg.lives;
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
            // Blok vir Blok: the room drew who drops first; that turn comes with the start
            const turns = msg.mode === 'turns';
            const turn = turns ? turnOf(msg.turn) : null;
            if (turns && !turn) return;
            room.started = true;
            clearTimer(pending?.timer);
            pending = null;
            const m = newMatch({
              kind: 'live', seed: msg.seed, oppName: cleanNickname(msg.opp?.name) || S.duelSomeone, oppCard: msg.opp?.card, ws, you: msg.you,
              mode: turns ? 'turns' : 'race', turn,
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
        if (m && m.ws === ws && !m.outcome) {
          m.lostConn = true;
          // a Wedloop tower carries on alone; Blok vir Blok can't (the other half of the tower is theirs).
          // During the 3-2-1 there is no match scene yet: it ends the moment there is ('turns:ready').
          if (m.mode === 'turns' && !m.over) {
            dropChoice(m);
            if (m.sceneReady) bus.emit('duel:end', { outcome: 'none' });
          }
        }
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
  function findOpponent({ onFound = () => {}, onFallback = () => {}, onRetry = () => {}, mode = 'race' } = {}) {
    stopPending();
    if (!live) {
      fallback(onFallback, mode);
      return;
    }
    const search = { tries: 0, retry: null, ping: null, away: hidden(), connect: null, onRetry, onFound, onFallback, mode };
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
        send(ws, hello(mode));
      };
      ws.onmessage = (e) => {
        const msg = parse(e.data);
        if (!msg || msg.t !== 'match' || !isRoomCode(msg.room) || pending?.ws !== ws) return;
        stopPending();
        joinRoom(msg.room, { onStart: onFound, onFail: () => findOpponent({ onFound, onFallback, onRetry, mode }) });
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
    const mode = search ? search.mode : 'race';
    stopPending();
    if (onFallback) fallback(onFallback, mode);
  }

  /** Nobody to pair with: a recording of a real match from the server, else Robot Rikus (Blok vir Blok: him). */
  async function fallback(onFallback, mode = 'race') {
    if (mode === 'turns') {
      startBot('turns');
      onFallback(match, S.duelNobodyBot);
      return;
    }
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
  async function createRoom({ onCode = () => {}, onStart = () => {}, onFail = () => {}, onWait = () => {}, onRetry = () => {}, mode = 'race' } = {}) {
    stopPending();
    if (!live || !fetchImpl) {
      onFail(S.duelOffline);
      return;
    }
    let code = null;
    try {
      const res = await fetchImpl(`${httpUrl}/match/room`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'turns' ? { mode } : {}), credentials: 'omit',
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

  function startBot(mode = 'race') {
    const seed = newMatchSeed();
    if (mode === 'turns') return newMatch({ kind: 'bot', seed, oppName: S.duelBotName, oppCard: BOT_CARD, mode: 'turns' });
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
      const turns = m.mode === 'turns';
      return {
        kind: m.kind,
        mode: m.mode,
        outcome: m.outcome || (m.lostConn ? 'none' : null),
        reason: m.reason,
        oppName: m.oppName,
        oppCard: m.oppCard,
        oppBest: round1(m.oppBest),
        youBest: round1(m.youBest),
        // Blok vir Blok: the hearts left and the Perfeks of each player (no run to race later)
        youHearts: turns ? m.hearts[m.you] : null,
        oppHearts: turns ? m.hearts[1 - m.you] : null,
        youPerfects: turns ? m.perfects[m.you] : null,
        oppPerfects: turns ? m.perfects[1 - m.you] : null,
        lostConn: m.lostConn,
        seed: m.seed,
        challenge: turns ? null : encodeChallenge({ seed: m.seed, name: nickname() || '', run }),
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
