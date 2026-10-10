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

import { DUEL, TURNS, LIVES, EMOTES, EMOTE } from './config.js';
import { S, PUNISH_INFO, WEATHER_INFO } from './core/strings.js';
import {
  createReferee, createRecorder, createGhost, botRun, newMatchSeed, isMatchSeed, decodeChallenge,
  encodeChallenge, isRoomCode, cleanNickname, attackFor, PUNISHMENTS, isPunishment, botPunishment,
} from './core/duel.js';
import { cleanCard, cardForMode, cosmetic, BOT_CARD } from './core/economy.js';
import {
  createTurnReferee, cleanPose, cleanSnap, cleanRating, snapFits, isSabotage, botSabotage, firstSeat, SABOTAGES,
  cleanRound, cleanVis,
} from './core/turns.js';

const YOU = 0;
const THEM = 1;
const RESULT_WAIT_MS = 2500;   // live: after our tower fell, wait this long for the server's verdict
const PROTOCOL = 5;            // 2: the first to a height mark chooses the punishment ('choose' / 'punish'); 3: Blok vir Blok;
                              // 4 (1.12): Blok vir Blok 'go' (a turn began) and the report's step count, for a smooth replay;
                              // the rondtes (weather and visitors in the turn messages) and 'visit' (Skelm Sakkie's outcome);
                              // 5 (1.12.1): back on a new connection ('?rejoin=1'), "Sorry, besig nou" ('decline'),
                              // "Speel weer" in the same room ('again'), a pause for both in a friend match ('pause' / 'resume')
const REJOIN_RETRY_MS = [600, 1200, 2000, 3000];   // a dropped match tries its room again after these (then every 3 s)
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
  // (1.12.1) bumped by every stop and every new match: an answer that comes back for an older request (a room
  // asked for twice, a recording asked for before Kanselleer) is let go instead of replacing what runs now
  let reqGen = 0;
  const GHOST_WAIT_MS = 6000;
  // (1.12.1) the lobby paired us, but the other player never came into the room (they stopped searching at that
  // very moment): back to the lobby after this, instead of waiting out the room (2 minutes)
  const PAIR_WAIT_MS = 20000;
  const hud = { you: 0, them: 0, name: '', badge: '', claimed: {}, lives: null, youLives: null };
  const hello = (mode) => ({
    t: 'hello', v: PROTOCOL, rules: DUEL.rules, ...(mode === 'turns' ? { mode } : {}), name: nickname() || '', card: cleanCard(card(mode)),
  });

  // ------------------------------------------------------------------------------- a match
  function newMatch({
    kind, seed, oppName, oppCard = null, run = null, ws = null, you = YOU, mode = 'race', turn = null, oppV = null, rounds = false,
    room = null, sv = 0, roomKind = null,
  }) {
    reqGen++;
    if (match) dropChoice(match);
    const turns = mode === 'turns';
    match = {
      kind, seed, ws, you,
      mode: turns ? 'turns' : 'race',
      oppV,   // the other game's protocol (live: from the room's start)
      // Blok vir Blok: the referee (Robot Rikus: here; live: the server's, whose events come as messages),
      // the turn on now, the hearts, and the game's events held back until the scene is up
      // (rondtes: against Robot Rikus always; live when the room says both games know them)
      tref: turns && kind !== 'live' ? createTurnReferee({ first: firstSeat(), seed, rounds: true }) : null,
      rounds: turns && (kind !== 'live' || rounds === true),
      turn: turns ? turn : null,
      hearts: turns ? [TURNS.hearts, TURNS.hearts] : null,
      perfects: [0, 0],
      sceneReady: false,
      queue: [],
      emotes: { at: -Infinity, sent: 0, muted: false, botAt: -Infinity },   // (1.12) emoji reactions
      startedAt: now(),   // (1.12) a match decided by a quit within its first moments doesn't move a rank
      oppName: oppName || S.duelSomeone,
      oppCard: cardForMode(oppCard || DEFAULT_CARD, turns ? 'turns' : 'race'),   // (1.12: their rank in this mode)
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
      // (1.12.1, protocol 5) a live room: its code and this game's key (to come back to it), the room's protocol and
      // kind; what this game said that may need saying again (this turn's messages, a joker, a punishment chosen,
      // how its tower ended), what it already heard (a message heard twice counts once), the pause, "Speel weer"
      room, sv, roomKind,
      rejoin: null,
      outbox: [], jokerOut: null, chosen: {}, overMsg: null,
      seen: new Set(),
      paused: null, pausesLeft: DUEL.pauses,
      again: null,
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
    if (m.rejoin) stopRejoin(m);
    // (1.12.1) a friend match of two 1.12.1 games keeps its room for "Speel weer" (closed on leaving the results)
    if (m.kind === 'live' && !canAgain(m)) setTimer(() => { if (match === m) close(m.ws); }, 1500);
  }

  /** (1.12.1) Can this live match start again in the same room ("Speel weer")? A friend room, both games 1.12.1. */
  function canAgain(m) {
    return !!m && m.kind === 'live' && m.roomKind === 'friend' && m.sv >= PROTOCOL && (m.oppV || 0) >= PROTOCOL;
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
        if (m.kind === 'live') {
          m.jokerOut = { t: 'joker', kind: k };   // (said again after coming back, until 'sent')
          send(m.ws, m.jokerOut);   // the server answers 'sent'
        } else turnEvents(m, m.tref.joker(m.you, k));
      }
      nextChoice(m);
      return;
    }
    const k = isPunishment(kind) ? kind : c.def;
    bus.emit('duel:chosen', { m: mark, kind: k });
    if (!m.outcome) {
      if (m.kind === 'live') {
        m.chosen[mark] = k;   // (said again after coming back, until 'sent')
        send(m.ws, { t: 'punish', m: mark, kind: k });
      } else punishOut(m, k);
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
      if (m.kind === 'live') send(m.ws, (m.overMsg = { t: 'over', reason: 'quit' }));
      decide('lost', 'quit');
      return;
    }
    if (m.kind === 'live') {
      send(m.ws, (m.overMsg = { t: 'over', reason, best: round1(m.youBest) }));
      // quitting is always a loss; otherwise the server says (whoever fell first loses)
      if (reason === 'quit') decide('lost', 'quit');
      // (no verdict because the connection went meanwhile: it doesn't count, as a dropped match never does; while
      // it comes back, the verdict waits for it)
      else {
        const wait = () => {
          if (match !== m || m.outcome || m.lostConn) return;
          if (m.rejoin) setTimer(wait, 500);
          else decide('lost', reason);
        };
        setTimer(wait, RESULT_WAIT_MS);
      }
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
      ev: cleanRound(e.ev),   // (1.12) this turn's round: the weather or visitor both players get
      nx: cleanRound(e.nx),   // ...and the round the next turn begins (shown coming)
    };
  }

  /** A report's physics steps from the drop to the tower at rest, or null. */
  function stepsOf(k) {
    return Number.isInteger(k) && k >= 0 && k <= 100000 ? k : null;
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
    // (1.12.1) back on a new connection, the room says this turn's and the last turn's messages again: each one
    // that was taken counts once (a message without a turn number, from an older room, always counts)
    const once = () => {
      if (!Number.isInteger(msg.n)) return true;
      const key = `${msg.t}:${msg.n}`;
      if (m.seen.has(key)) return false;
      m.seen.add(key);
      return true;
    };
    const theirs = m.turn && m.turn.seat !== m.you && msg.n === m.turn.n;
    switch (msg.t) {
      case 'turn':
        m.turnShown = m.turn?.n === msg.n ? m.turnShown : false;
        startTurn(m, turnOf(msg));
        break;
      case 'emote':
        theirEmote(m, msg.e);
        break;
      case 'go':   // their turn began on their screen (it shows here a moment later)
        if (theirs && once()) bus.emit('turns:go', { n: msg.n });
        break;
      case 'visit': {   // their round's Skelm Sakkie: caught or stole (at that moment of their visit)
        const what = cleanVis(msg.what);
        const at = typeof msg.at === 'number' && Number.isFinite(msg.at) && msg.at >= 0 && msg.at <= 120000 ? msg.at : null;
        const idx = Array.isArray(msg.idx) ? msg.idx.filter((i) => Number.isInteger(i) && i >= 0 && i <= 5000).slice(0, 8) : [];
        if (theirs && what && at !== null && once()) bus.emit('turns:visit', { n: msg.n, what, at, idx });
        break;
      }
      case 'drop': {
        const p = cleanPose(msg.p);
        const ct = typeof msg.ct === 'number' && msg.ct >= 0 && msg.ct <= 120000 ? msg.ct : null;
        if (p && theirs && once()) bus.emit('turns:drop', { n: msg.n, p, ct });
        break;
      }
      case 'settled': {
        const snap = cleanSnap(msg.snap);
        const r = cleanRating(msg.r);
        if (!snap || !theirs || !snapFits(snap, msg.n, r) || !once()) break;
        if (r === 'P') m.perfects[m.turn.seat] += 1;
        bus.emit('turns:settled', { n: msg.n, lost: msg.lost === true, r, snap, ...(stepsOf(msg.k) !== null ? { k: stepsOf(msg.k) } : {}) });
        break;
      }
      case 'choose':
        if (!m.choice?.joker && !m.jokerOut && once()) askChoice(m, 0);   // (not again while choosing, or once chosen)
        break;
      case 'sent':
        if (!isSabotage(msg.kind) || !once()) break;
        m.jokerOut = null;
        if (m.choice && m.choice.joker) {
          clearTimer(m.choice.timer);
          m.choice = null;
          bus.emit('duel:chosen', { m: 0, kind: msg.kind });
        }
        sabotageOut(m, msg.kind);
        break;
      case 'sabotage':
        if (isSabotage(msg.kind) && once()) sabotageIn(m, msg.kind);
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
    // decided during the 3-2-1 (the other player left), or the connection went then: it ends now
    if (m.outcome || m.lostConn) {
      bus.emit('duel:end', { outcome: m.outcome || 'none' });
      return;
    }
    m.turnShown = false;
    startTurn(m, m.turn);
    for (const msg of m.queue.splice(0)) onTurnsMessage(m, msg);
    // (1.12) the other player's game is older: this match has no rondtes (said once, at the start)
    if (m.kind === 'live' && !m.rounds && m.oppV !== null && m.oppV < 4) bus.emit('hud:toast', { text: S.turnsNoRounds(m.oppName), color: '#cfe9ff' });
  });

  // (1.12.1) a Wedloop scene is up: a match decided during the 3-2-1 (the other player left, the connection went)
  // ends now (before, its tower ran on with nothing to race for)
  bus.on('duel:ready', () => {
    const m = match;
    if (!m || m.mode !== 'race' || m.sceneReady) return;
    m.sceneReady = true;
    if (m.outcome || m.lostConn) bus.emit('duel:end', { outcome: m.outcome || 'none' });
  });

  /**
   * (1.12.1) One of our turn's messages: sent, and kept until the next turn (a connection that went may have lost
   * it: it goes again when the game is back; the room passes each on once and scores a report once).
   */
  function sendTurn(m, o) {
    m.outbox = m.outbox.filter((x) => x.n === o.n && x.t !== o.t);
    m.outbox.push(o);
    send(m.ws, o);
  }

  // our turn began on this screen: the other game shows it from now, a moment behind
  bus.on('turns:mygo', (d) => {
    const m = match;
    if (!m || m.mode !== 'turns' || m.outcome || m.kind !== 'live' || !d) return;
    if (m.turn && d.n === m.turn.n && m.turn.seat === m.you) sendTurn(m, { t: 'go', n: d.n });
  });

  // ------------------------------------------------------------------------------- emoji reactions (1.12)
  /** Can this player send an emoji now? { ok, left (ms of cooldown), spent (the match's allowance is used up) }. */
  function emoteState(m) {
    const e = m?.emotes;
    if (!e || m.outcome || m.kind === 'ghost' || m.kind === 'link') return { ok: false, left: 0, spent: false };
    const left = Math.max(0, EMOTE.cooldownMs - (now() - e.at));
    const spent = e.sent >= EMOTE.perMatch;
    return { ok: !left && !spent, left, spent };
  }

  /** The other player's emoji (none while muted, an unknown one, or after the match). */
  function theirEmote(m, id) {
    if (!m || m.outcome || m.emotes?.muted || !Object.hasOwn(EMOTES, id)) return;
    bus.emit('hud:emote', { side: 'them', emoji: EMOTES[id] });
  }

  // this player sends an emoji: shown at once here, passed on live; Robot Rikus sometimes answers
  bus.on('ui:emote', (id) => {
    const m = match;
    if (!m || !Object.hasOwn(EMOTES, id) || !emoteState(m).ok) return;
    m.emotes.at = now();
    m.emotes.sent += 1;
    bus.emit('hud:emote', { side: 'you', emoji: EMOTES[id] });
    bus.emit('duel:emotes', emoteState(m));
    if (m.kind === 'live') send(m.ws, { t: 'emote', e: id });
    else if (m.kind === 'bot' && now() - m.emotes.botAt > EMOTE.cooldownMs && Math.random() < EMOTE.botAnswer) {
      m.emotes.botAt = now();
      const answer = ['klap', 'koel', 'lag', 'tong'][Math.floor(Math.random() * 4)];
      setTimer(() => { if (match === m) theirEmote(m, answer); }, 900 + Math.random() * 900);
    }
  });
  // their emojis hidden (or shown again) for the rest of the match
  bus.on('ui:emote-mute', () => {
    const m = match;
    if (!m || !m.emotes) return;
    m.emotes.muted = !m.emotes.muted;
    bus.emit('duel:emote-muted', m.emotes.muted);
  });

  // our round's Skelm Sakkie was caught or stole: the other game shows the same, at the same moment
  bus.on('turns:myvisit', (d) => {
    const m = match;
    if (!m || m.mode !== 'turns' || m.outcome || m.kind !== 'live' || !d) return;
    const what = cleanVis(d.what);
    const idx = Array.isArray(d.idx) ? d.idx.filter((i) => Number.isInteger(i) && i >= 0 && i <= 5000).slice(0, 8) : [];
    if (what && Number.isFinite(d.at) && m.turn && d.n === m.turn.n && m.turn.seat === m.you) {
      sendTurn(m, { t: 'visit', n: d.n, what, at: Math.round(d.at), idx });
    }
  });

  // our block was let go: the other game drops it from the same spot
  bus.on('turns:mydrop', (d) => {
    const m = match;
    if (!m || m.mode !== 'turns' || m.outcome || m.kind !== 'live' || !d) return;
    const p = cleanPose(d.p);
    const ct = typeof d.ct === 'number' && d.ct >= 0 && d.ct <= 120000 ? Math.round(d.ct) : null;
    if (p && m.turn && d.n === m.turn.n && m.turn.seat === m.you) sendTurn(m, { t: 'drop', n: d.n, p, ...(ct !== null ? { ct } : {}) });
  });

  // a turn ended (ours; against Robot Rikus his too): where the tower came to rest, a heart, the rating
  bus.on('turns:mysettled', (d) => {
    const m = match;
    if (!m || m.mode !== 'turns' || m.outcome || !d || !m.turn || d.n !== m.turn.n) return;
    const snap = cleanSnap(d.snap);
    if (!snap) return;
    const r = cleanRating(d.r);
    if (r === 'P') m.perfects[m.turn.seat] += 1;
    const vis = cleanVis(d.vis);
    if (m.kind === 'live') {
      const k = stepsOf(d.k);
      if (m.turn.seat === m.you) sendTurn(m, { t: 'settled', n: d.n, lost: d.lost === true, r, snap, ...(k !== null ? { k } : {}), ...(vis ? { vis } : {}) });
      return;
    }
    turnEvents(m, m.tref.settled(m.turn.seat, { n: d.n, lost: d.lost === true, r, vis }));
  });

  // ------------------------------------------------------------------------------- live socket
  function onRoomMessage(m, msg) {
    if (onShared(m, msg)) return;
    if (m.mode === 'turns') {
      onTurnsMessage(m, msg);
      return;
    }
    switch (msg.t) {
      case 'emote':
        theirEmote(m, msg.e);
        break;
      case 'opp':
        m.oppH = num(msg.h);
        m.oppBest = Math.max(m.oppBest, num(msg.best));
        if (Number.isInteger(msg.lives) && msg.lives >= 0 && msg.lives <= 9) hud.lives = msg.lives;
        break;
      case 'choose':   // we were first to a height mark: the player chooses what to send
        if (DUEL.marks.includes(msg.m) && claim(m, msg.m, true)) askChoice(m, msg.m);
        break;
      case 'attack':   // the other player's punishment (heard again after coming back: once)
        if (DUEL.marks.includes(msg.m) && isPunishment(msg.kind) && claim(m, msg.m, false)) punishIn(m, msg.kind);
        break;
      case 'sent':     // the server passed ours on (or sent the default: we were too slow, or an old server)
        if (DUEL.marks.includes(msg.m) && isPunishment(msg.kind) && !m.seen.has(`sent:${msg.m}`)) {
          m.seen.add(`sent:${msg.m}`);
          delete m.chosen[msg.m];
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
   * (1.12.1) Messages of both modes: the other player's connection went or came back, a pause for both, "Speel weer",
   * and a new match in the same room. True when handled.
   */
  function onShared(m, msg) {
    switch (msg.t) {
      case 'away':
        if (!m.outcome) bus.emit('duel:conn', { state: 'lost', mine: false, name: m.oppName });
        return true;
      case 'back':
        if (!m.outcome) bus.emit('duel:conn', { state: 'back', mine: false, name: m.oppName });
        return true;
      case 'paused': {
        const ms = Math.max(0, Math.min(DUEL.pauseMs, Number(msg.ms) || 0));
        m.paused = { by: msg.by === m.you ? 'you' : 'them', until: now() + ms };
        if (Number.isInteger(msg.left)) m.pausesLeft = Math.max(0, msg.left);
        if (!m.outcome) bus.emit('duel:paused', { mine: msg.by === m.you, name: m.oppName, ms, left: m.pausesLeft });
        return true;
      }
      case 'resumed':
        m.paused = null;
        if (!m.outcome) bus.emit('duel:resumed', { ms: Math.max(0, Math.min(5000, Number(msg.ms) || 0)) });
        return true;
      case 'nopause':   // (refused: none left, one on already, the other player away, or the 3-2-1)
        if (Number.isInteger(msg.left)) m.pausesLeft = Math.max(0, msg.left);
        if (!m.paused) bus.emit('duel:nopause', { left: m.pausesLeft, name: m.oppName });
        return true;
      case 'again':   // the other player wants to play again
        if (m.outcome && m.again !== 'gone') {
          m.again = m.again === 'asked' ? 'asked' : 'they';
          bus.emit('duel:again', { state: m.again, name: m.oppName });
        }
        return true;
      case 'bye':     // ...or went: no "Speel weer" with them now
        if (m.outcome) {
          m.again = 'gone';
          bus.emit('duel:again', { state: 'gone', name: m.oppName });
        }
        return true;
      case 'start':   // both said "Speel weer": a new match in this room (the game shows it: 'duel:rematch')
        if (m.outcome && canAgain(m) && m.room) {
          const next = beginLive(m.room, m.ws, msg, { quiet: true });
          if (next) bus.emit('duel:rematch', next);
        }
        return true;
      default:
        return false;
    }
  }

  /** A live match begins (the room's 'start'): the match, then the flow's onStart (the versus screen; not `quiet`). */
  function beginLive(room, ws, msg, { quiet = false } = {}) {
    if (!isMatchSeed(msg.seed) || (msg.you !== 0 && msg.you !== 1)) return null;
    // Blok vir Blok: the room drew who drops first; that turn comes with the start
    const turns = msg.mode === 'turns';
    const turn = turns ? turnOf(msg.turn) : null;
    if (turns && !turn) return null;
    const m = newMatch({
      kind: 'live', seed: msg.seed, oppName: cleanNickname(msg.opp?.name) || S.duelSomeone, oppCard: msg.opp?.card, ws, you: msg.you,
      // (oppV: null from a Worker older than 1.12, which doesn't say)
      mode: turns ? 'turns' : 'race', turn, oppV: Number.isFinite(msg.opp?.v) ? Math.max(1, Math.min(99, Math.floor(msg.opp.v))) : null, rounds: msg.rounds === true,
      // (1.12.1: the room's protocol and kind, from a Worker of protocol 5)
      room, sv: Number.isFinite(msg.sv) ? Math.floor(msg.sv) : 0, roomKind: msg.room === 'friend' || msg.room === 'random' ? msg.room : null,
    });
    if (!quiet) room.onStart(m);
    return m;
  }

  /**
   * Join a live room (a friend's code, or the one the lobby found). `onStart(match)` when both are in.
   * Once in the room, a dropped connection doesn't end the wait (the game went to the background to
   * share the link, the network blinked): it comes back to the same room, `onRetry` meanwhile, until
   * the room is gone. While the game is hidden (away()) the connection stays closed, so a match never
   * starts while this player isn't looking; back() reconnects.
   * (1.12.1) `invite`: a friend's link. The room says who invites (`onInvite(host)`), and nothing starts until the
   * player answers: acceptInvite() ("Speel") or declineInvite() ("Sorry, besig nou"). The one who invited hears
   * such an answer through `onDeclined(name)` and keeps waiting (the link may have gone to a group).
   */
  function joinRoom(code, {
    onWait = () => {}, onStart = () => {}, onFail = () => {}, onRetry = () => {}, waitMs = 0,
    invite = false, onInvite = () => {}, onDeclined = () => {},
  } = {}) {
    stopPending();   // (1.12.1) never two rooms (or a room and a search) at once: the old one would linger
    if (!live || !isRoomCode(code)) {
      onFail(live ? S.duelRoomGone : S.duelOffline);
      return;
    }
    // `key`: this game's own key for the room; a reconnect brings it, so the server lets it replace our old
    // connection (which may never have closed there) instead of starting a match against it
    // (1.12.1: from the browser's cryptographic random numbers; it holds this player's seat)
    const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint8Array(16)) : null;
    const key = Array.from({ length: 16 }, (_, i) => ALNUM[bytes ? bytes[i] % 36 : Math.floor(Math.random() * 36)]).join('');
    const room = {
      code, key, joined: false, started: false, tries: 0, retry: null, away: hidden(), connect: null, onRetry, onStart, until: now() + DUEL.roomWaitMs,
      accepted: !invite, onInvite, onDeclined,
    };
    pending = { ws: null, timer: null, room };
    if (waitMs > 0) {
      pending.timer = setTimer(() => {
        if (pending?.room !== room || room.started) return;
        stopPending();
        onFail(S.duelRoomGone);
      }, waitMs);
    }
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
      // (a friend's link waits for "Speel" before it says hello: nothing starts before the player chose; meanwhile
      // it holds no seat, so someone else the link went to can still play)
      ws.onopen = () => {
        send(ws, room.accepted ? { ...hello(), key: room.key } : { t: 'look' });
      };
      ws.onmessage = (e) => {
        const msg = parse(e.data);
        if (!msg) return;
        if (!room.started) {
          if (pending?.ws !== ws) return;
          if (msg.t === 'wait') {
            room.joined = true;
            room.tries = 0;
            if (room.accepted) onWait(code);
            else {
              const host = msg.host && typeof msg.host === 'object' ? msg.host : null;
              room.onInvite({ name: cleanNickname(host?.name) || '', mode: host?.mode === 'turns' ? 'turns' : host ? 'race' : null });
            }
          } else if (msg.t === 'declined') {   // (1.12.1) a friend answered "Sorry, besig nou"
            room.onDeclined(cleanNickname(msg.name) || S.duelSomeone);
          } else if (msg.t === 'gone') {
            stopPending();
            onFail(S.duelRoomGone);
          } else if (msg.t === 'start' && isMatchSeed(msg.seed) && (msg.you === 0 || msg.you === 1)) {
            if (msg.mode === 'turns' && !turnOf(msg.turn)) return;
            room.started = true;
            clearTimer(pending?.timer);
            pending = null;
            beginLive(room, ws, msg);
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
        liveClosed(match, ws);
      };
      ws.onerror = () => {};
    };
    if (room.away) room.joined = true;   // the room was made a moment ago; it is entered on back()
    else room.connect();
  }

  // ------------------------------------------------------------------------------- back after a dropped connection (1.12.1)
  /**
   * A live match's connection closed. Before 1.12.1 the match ended there and didn't count. Now, when the room
   * can take this game back (protocol 5), the game tries its room again for up to DUEL.rejoinMs (Wi-Fi to mobile
   * data, a tunnel): the tower keeps going meanwhile (Blok vir Blok waits for the other player's turn).
   */
  function liveClosed(m, ws) {
    if (!m || m.ws !== ws) return;
    m.ws = null;
    if (m.outcome) {   // after the result: no "Speel weer" with this connection
      if (canAgain(m) && m.again !== 'gone') {
        m.again = 'gone';
        bus.emit('duel:again', { state: 'gone', name: m.oppName });
      }
      return;
    }
    if (m.sv >= PROTOCOL && m.room && live) {
      startRejoin(m);
      return;
    }
    lostMatch(m);
  }

  /** The match can't be decided any more: it ends here and doesn't count (the server gave it to the other player). */
  function lostMatch(m) {
    if (m.outcome) return;
    m.lostConn = true;
    // During the 3-2-1 there is no match scene yet: it ends the moment there is ('duel:ready' / 'turns:ready').
    if (!m.over) {
      dropChoice(m);
      if (m.sceneReady) bus.emit('duel:end', { outcome: 'none' });
    }
  }

  function startRejoin(m) {
    if (m.rejoin) return;
    // (a little before the room lets the seat go: after that it says "gone" anyway)
    const ms = DUEL.rejoinMs - 1500;
    const r = { until: now() + ms, tries: 0, timer: null, ws: null, waiting: false, end: null };
    r.end = setTimer(() => { if (m.rejoin === r) giveUp(m); }, ms);
    m.rejoin = r;
    bus.emit('duel:conn', { state: 'lost', mine: true });
    tryRejoin(m);
  }

  function tryRejoin(m) {
    const r = m.rejoin;
    if (!r || match !== m || m.outcome) return;
    r.timer = null;
    if (now() > r.until) {
      giveUp(m);
      return;
    }
    if (hidden()) {   // out of sight: back() tries again (if there is still time)
      r.waiting = true;
      return;
    }
    r.waiting = false;
    const later = () => {
      if (m.rejoin !== r || r.timer) return;
      const ms = REJOIN_RETRY_MS[Math.min(r.tries, REJOIN_RETRY_MS.length - 1)];
      r.tries++;
      r.timer = setTimer(() => tryRejoin(m), ms);
    };
    let ws;
    try {
      ws = new WebSocketImpl(`${wsUrl}/match/room/${m.room.code}?rejoin=1`);
    } catch {
      later();
      return;
    }
    r.ws = ws;
    ws.onopen = () => send(ws, { ...hello(m.mode), key: m.room.key, rejoin: true, have: { n: m.turn?.n || 0 } });
    ws.onmessage = (e) => {
      const msg = parse(e.data);
      if (!msg) return;
      if (match && match.ws === ws) {   // the match's connection now (also a rematch started on it)
        onRoomMessage(match, msg);
        return;
      }
      if (match !== m || m.rejoin !== r || r.ws !== ws) return;
      if (msg.t === 'rejoined') rejoined(m, ws, msg);
      else if (msg.t === 'gone') {   // the room no longer knows this game (too late, or it is gone)
        r.ws = null;
        close(ws);
        giveUp(m);
      }
    };
    ws.onclose = () => {
      if (match && match.ws === ws) {   // dropped again after coming back (this match or a rematch on it)
        liveClosed(match, ws);
        return;
      }
      if (match === m && m.rejoin === r && r.ws === ws) {
        r.ws = null;
        later();
      }
    };
    ws.onerror = () => {};
  }

  /** Back in the room: this connection is the match's again; what we said that may have been lost goes again. */
  function rejoined(m, ws, msg) {
    m.rejoin.ws = null;   // (kept: it is the match's connection now)
    stopRejoin(m);
    m.ws = ws;
    bus.emit('duel:conn', { state: 'back', mine: true });
    if (m.mode === 'race') {
      if (msg.opp && typeof msg.opp === 'object') onRoomMessage(m, { ...msg.opp, t: 'opp' });
      // where our tower is, how it ended, and the punishments we chose that the room may not have heard
      send(ws, { t: 'state', h: round1(m.youH), best: round1(m.youBest), ...(Number.isInteger(hud.youLives) ? { lives: hud.youLives } : {}) });
      for (const [mark, kind] of Object.entries(m.chosen)) send(ws, { t: 'punish', m: Number(mark), kind });
    } else {
      for (const o of m.outbox) send(ws, o);   // (the room passes each on once, and scores a report once)
      if (m.jokerOut) send(ws, m.jokerOut);
    }
    if (m.overMsg) send(ws, m.overMsg);
    if (msg.paused && typeof msg.paused === 'object') onShared(m, { t: 'paused', ...msg.paused });
    else if (m.paused) onShared(m, { t: 'resumed', ms: DUEL.resumeMs });   // (it ended while the connection was gone)
  }

  function stopRejoin(m) {
    const r = m.rejoin;
    if (!r) return;
    m.rejoin = null;
    clearTimer(r.timer);
    clearTimer(r.end);
    if (r.ws && r.ws !== m.ws) close(r.ws);
  }

  /** Not back in time: the match ends here and doesn't count, as before 1.12.1. */
  function giveUp(m) {
    stopRejoin(m);
    bus.emit('duel:conn', { state: 'gone', mine: true });
    lostMatch(m);
  }

  // ------------------------------------------------------------------------------- a friend's invite (1.12.1)
  /** "Speel": the friend's link joins the match (hello). */
  function acceptInvite() {
    const room = pending?.room;
    if (!room || room.accepted) return false;
    room.accepted = true;
    if (pending.ws && pending.ws.readyState === 1) send(pending.ws, { ...hello(), key: room.key });
    return true;
  }

  /** "Sorry, besig nou": the one who invited hears it, and this game lets the room go. */
  function declineInvite() {
    const room = pending?.room;
    if (!room || room.accepted) return false;
    if (pending.ws && pending.ws.readyState === 1) send(pending.ws, { t: 'decline', name: nickname() || '' });
    const ws = pending.ws;
    pending.ws = null;   // (closed a moment later: the answer goes first)
    stopPending();
    if (ws) setTimer(() => close(ws), 400);
    return true;
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
        joinRoom(msg.room, { onStart: onFound, onFail: () => findOpponent({ onFound, onFallback, onRetry, mode }), waitMs: PAIR_WAIT_MS });
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
    const gen = reqGen;
    let rec = null;
    if (httpUrl && fetchImpl) {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const t = setTimer(() => ctl?.abort(), GHOST_WAIT_MS);
      try {
        const res = await fetchImpl(`${httpUrl}/match/ghost`, { credentials: 'omit', signal: ctl?.signal });
        if (res.ok) {
          const body = await res.json();
          rec = decodeChallenge(body?.payload);
        }
      } catch {
        rec = null;
      }
      clearTimer(t);
    }
    if (gen !== reqGen) return;   // Kanselleer, or another match began, while the recording was on its way
    if (rec) {
      newMatch({ kind: 'ghost', seed: rec.seed, oppName: rec.name || S.duelSomeone, run: rec.run });
      onFallback(match, S.duelNobody);
    } else {
      startBot();
      onFallback(match, S.duelNobodyBot);
    }
  }

  /** A friend room: the server makes a code; the host waits in the room until the friend comes. */
  async function createRoom({
    onCode = () => {}, onStart = () => {}, onFail = () => {}, onWait = () => {}, onRetry = () => {}, onDeclined = () => {}, mode = 'race',
  } = {}) {
    stopPending();
    const gen = reqGen;
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
    if (gen !== reqGen) return;   // tapped again (or stopped) while this answer was on its way: that one counts
    if (!code) {
      onFail(S.duelNoServer);
      return;
    }
    onCode(code);
    joinRoom(code, { onStart, onFail, onWait, onRetry, onDeclined });
    const p = pending;
    if (p) {
      p.timer = setTimer(() => {
        if (pending !== p) return;
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
    reqGen++;
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

  /** The game is back: a waiting room reconnects at once (and a match that lost its connection tries its room again). */
  function back() {
    if (match?.rejoin?.waiting && !match.rejoin.timer) tryRejoin(match);
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
    /** (1.12) Can this player send an emoji now (and is the match's allowance used up)? */
    emoteState() {
      return emoteState(match);
    },
    get searching() {
      return searching();
    },
    /** Leave the current match (home button, new game): closes a live room. */
    leave() {
      stopPending();
      dropChoice(match);
      if (match) stopRejoin(match);
      if (match?.ws) close(match.ws);
      match = null;
    },
    acceptInvite,
    declineInvite,
    /** (1.12.1) A friend match of two 1.12.1 games: can a pause stop both games now? */
    canPauseBoth() {
      const m = match;
      return !!m && canAgain(m) && !m.outcome && !m.rejoin && !m.paused && !!m.ws && m.pausesLeft > 0;
    },
    /** Ask the room to pause both games (it answers 'paused' to both, or 'nopause'). */
    pauseBoth() {
      const m = match;
      if (!m || !m.ws || m.outcome) return false;
      send(m.ws, { t: 'pause' });
      return true;
    },
    /** Either player goes on: the room answers 'resumed' to both (a 3-2-1 in each game). */
    resumeBoth() {
      const m = match;
      if (!m || !m.ws || !m.paused) return false;
      send(m.ws, { t: 'resume' });
      return true;
    },
    /** Is this match paused for both right now? */
    get pausedBoth() {
      return !!match?.paused && !match.outcome;
    },
    /** (1.12.1) After a friend match: can "Speel weer" ask the same friend (the room is still open)? */
    canAgain() {
      const m = match;
      return !!m && !!m.outcome && canAgain(m) && !!m.ws && m.again !== 'gone';
    },
    /** "Speel weer": the room starts a new match once both said it ('start' -> the flow's onStart). */
    again() {
      const m = match;
      if (!m || !m.outcome || !canAgain(m) || !m.ws || m.again === 'gone') return false;
      send(m.ws, { t: 'again' });
      m.again = m.again === 'they' ? 'both' : 'asked';
      bus.emit('duel:again', { state: m.again, name: m.oppName });
      return true;
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
        // (1.12.1) while the game comes back to its room, the verdict waits for it (else the results said "doesn't
        // count" and the verdict counted a moment later)
        const late = now() - t0 > RESULT_WAIT_MS + 300 + (m.rejoin ? DUEL.rejoinMs : 0);
        if (match !== m || m.outcome || m.lostConn || late) cb();
        else setTimer(poll, 100);
      };
      poll();
    },
  };
}
