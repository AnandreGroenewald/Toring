// The punishment choice on the device (js/duel.js): the first to a height mark chooses what the
// other tower gets, within DUEL.chooseMs (else the mark's default goes). A recording or Robot Rikus
// "chooses" by the match seed. Runs with a fake bus, fake timers and a fake WebSocket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bus } from '../js/core/bus.js';
import { createDuel } from '../js/duel.js';
import { PUNISHMENTS, isPunishment, botPunishment, attackFor } from '../js/core/duel.js';
import { PUNISH_INFO } from '../js/core/strings.js';
import { DUEL } from '../js/config.js';
import { cleanCard, BOT_CARD } from '../js/core/economy.js';

function fakeTimers() {
  let id = 0;
  let t = 0;
  const due = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      due.set(++id, { fn, at: t + ms });
      return id;
    },
    clearTimer: (k) => {
      due.delete(k);
    },
    advance(ms) {
      t += ms;
      for (const [k, d] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (d.at <= t && due.has(k)) {
          due.delete(k);
          d.fn();
        }
      }
    },
  };
}

class FakeSocket {
  static last = null;
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.sent = [];
    FakeSocket.last = this;
  }
  send(s) {
    this.sent.push(JSON.parse(s));
  }
  close() {
    this.readyState = 3;
  }
  hear(o) {
    this.onmessage?.({ data: JSON.stringify(o) });
  }
}

function setup(extra = {}) {
  const bus = new Bus();
  const timers = fakeTimers();
  const seen = [];
  for (const ev of ['duel:choose', 'duel:chosen', 'duel:attack', 'hud:toast', 'hud:duel']) bus.on(ev, (p) => seen.push([ev, p]));
  const duel = createDuel({
    bus, nickname: () => 'Anna', setTimer: timers.setTimer, clearTimer: timers.clearTimer, now: timers.now, ...extra,
  });
  const of = (ev) => seen.filter(([e]) => e === ev).map(([, p]) => p);
  return { bus, timers, duel, of };
}

// a recording that climbs 0,5 m a second (10 m after 20 s): we get to the marks first
const slow = { samples: Array.from({ length: 120 }, (_, k) => k * 5), endT: 120000, end: 'stop' };
// one that climbs 2 m a second: it gets there first
const fast = { samples: Array.from({ length: 40 }, (_, k) => k * 20), endT: 40000, end: 'stop' };
const SEED = 'kiestoets1';

test('punishments: the four of them, each with a name; marks have a default; Robot Rikus picks by the seed', () => {
  assert.deepEqual(PUNISHMENTS, ['monkey', 'thief', 'fog', 'heat']);
  assert.deepEqual(Object.keys(PUNISH_INFO).sort(), [...PUNISHMENTS].sort());
  for (const k of PUNISHMENTS) assert.ok(PUNISH_INFO[k].emoji && PUNISH_INFO[k].name && PUNISH_INFO[k].what, k);
  assert.ok(isPunishment('fog') && !isPunishment('clown') && !isPunishment(undefined));
  for (const m of DUEL.marks) assert.ok(isPunishment(attackFor(m)), `default for ${m} m`);
  const picks = new Set();
  for (let k = 0; k < 200; k++) {
    const seed = `seed${k}x`;
    for (const m of DUEL.marks) {
      const p = botPunishment(seed, m);
      assert.ok(isPunishment(p));
      assert.equal(botPunishment(seed, m), p, 'the same seed and mark: the same punishment');
      picks.add(p);
    }
  }
  assert.equal(picks.size, 4, 'every punishment turns up');
});

test('first to a mark: the player chooses; the recording loses that much height; the next mark waits its turn', () => {
  const { bus, duel, of } = setup();
  duel.startLink({ seed: SEED, name: 'Sannie', run: slow });
  bus.emit('duel:self', { t: 11000, h: 20.4, best: 20.4 });   // 10 m and 20 m in one go
  assert.equal(of('duel:choose').length, 1, 'one choice at a time');
  assert.deepEqual(of('duel:choose')[0], { m: 10, opp: 'Sannie', def: attackFor(10), options: PUNISHMENTS, ms: DUEL.chooseMs });
  bus.emit('ui:duel-punish', { m: 20, kind: 'fog' });   // not the open choice
  assert.equal(of('duel:chosen').length, 0);
  bus.emit('ui:duel-punish', { m: 10, kind: 'fog' });
  assert.deepEqual(of('duel:chosen')[0], { m: 10, kind: 'fog' });
  assert.equal(duel.match.ghost.penalty, DUEL.ghostPenaltyM.fog);
  assert.match(of('hud:toast')[0].text, /Mis/);
  assert.equal(of('duel:choose')[1].m, 20, 'then the 20 m choice');
  bus.emit('ui:duel-punish', { m: 20, kind: 'thief' });
  assert.equal(duel.match.ghost.penalty, DUEL.ghostPenaltyM.fog + DUEL.ghostPenaltyM.thief);
  bus.emit('ui:duel-punish', { m: 20, kind: 'heat' });   // once only
  assert.equal(of('duel:chosen').length, 2);
  assert.equal(of('duel:attack').length, 0, 'nothing came our way');
});

test('no choice in time: the mark\'s default goes', () => {
  const { bus, timers, duel, of } = setup();
  duel.startLink({ seed: SEED, name: 'Sannie', run: slow });
  bus.emit('duel:self', { t: 11000, h: 10.2, best: 10.2 });
  timers.advance(DUEL.chooseMs - 1);
  assert.equal(of('duel:chosen').length, 0);
  timers.advance(1);
  assert.deepEqual(of('duel:chosen'), [{ m: 10, kind: attackFor(10) }]);
  assert.equal(duel.match.ghost.penalty, DUEL.ghostPenaltyM[attackFor(10)]);
  bus.emit('ui:duel-punish', { m: 10, kind: 'fog' });   // too late
  assert.equal(duel.match.ghost.penalty, DUEL.ghostPenaltyM[attackFor(10)]);
});

test('a recording that gets there first sends the seed\'s punishment; an open choice dies with the match', () => {
  const { bus, timers, duel, of } = setup();
  duel.startLink({ seed: SEED, name: 'Sannie', run: fast });
  bus.emit('duel:self', { t: 6000, h: 3, best: 3 });
  assert.deepEqual(of('duel:attack'), [{ kind: botPunishment(SEED, 10), from: 'Sannie', style: 'gewoon' }], 'a recording has no card: no style');
  assert.equal(of('duel:choose').length, 0, 'the mark was theirs');
  // we beat them to nothing else; a new link match where we do, then our tower falls mid-choice
  duel.startLink({ seed: SEED, name: 'Sannie', run: slow });
  bus.emit('duel:self', { t: 11000, h: 10.2, best: 10.2 });
  assert.equal(of('duel:choose').length, 1);
  bus.emit('duel:over', { reason: 'lives', t: 11500 });
  assert.deepEqual(of('duel:chosen').at(-1), { m: 10, kind: null }, 'the choice bar closes');
  timers.advance(DUEL.chooseMs * 2);
  assert.equal(duel.match.ghost.penalty, 0, 'nothing was sent after the end');
});

test('live: the server asks, the player\'s pick goes to the server, and both sides hear about it', () => {
  const mine = { badge: 'leeu', style: 'hoed', title: 'nope', junk: 1 };
  const { bus, duel, of } = setup({ apiUrl: 'https://borge.example', WebSocketImpl: FakeSocket, card: () => mine });
  duel.joinRoom('ABCD23');
  const ws = FakeSocket.last;
  ws.onopen();
  const { key, ...hello } = ws.sent[0];
  assert.deepEqual(hello, { t: 'hello', v: 2, rules: DUEL.rules, name: 'Anna', card: cleanCard(mine) }, 'our card, known looks only, and the rules');
  assert.match(key, /^[a-z0-9]{16}$/, 'the room key: a reconnect brings the same one');
  ws.hear({ t: 'start', seed: SEED, you: 0, opp: { name: 'Bennie', card: { badge: 'olifant', style: 'kroon', rank: 'mega' } } });
  assert.deepEqual(duel.match.oppCard, cleanCard({ badge: 'olifant', style: 'kroon' }), 'their card, cleaned');
  ws.hear({ t: 'choose', m: 10, def: 'monkey' });
  assert.deepEqual(of('duel:choose')[0], { m: 10, opp: 'Bennie', def: 'monkey', options: PUNISHMENTS, ms: DUEL.chooseMs });
  bus.emit('ui:duel-punish', { m: 10, kind: 'heat' });
  assert.deepEqual(ws.sent.at(-1), { t: 'punish', m: 10, kind: 'heat' });
  assert.deepEqual(of('duel:chosen')[0], { m: 10, kind: 'heat' });
  assert.equal(of('hud:toast').length, 0, 'the toast waits for the server');
  ws.hear({ t: 'sent', m: 10, kind: 'heat' });
  assert.match(of('hud:toast')[0].text, /Hittegolf/);
  assert.doesNotMatch(of('hud:toast')[0].text, /🎩/, 'weather wears no hat');
  // theirs: a known punishment comes through; anything else is ignored
  ws.hear({ t: 'attack', m: 20, kind: 'bomb' });
  ws.hear({ t: 'attack', m: 21, kind: 'fog' });
  assert.equal(of('duel:attack').length, 0);
  ws.hear({ t: 'attack', m: 20, kind: 'fog' });
  assert.deepEqual(of('duel:attack'), [{ kind: 'fog', from: 'Bennie', style: 'kroon' }], 'their visitors wear their style');
  // the server's default came before our pick: the choice bar closes
  ws.hear({ t: 'choose', m: 30, def: 'monkey' });
  ws.hear({ t: 'sent', m: 30, kind: 'monkey' });
  assert.deepEqual(of('duel:chosen').at(-1), { m: 30, kind: 'monkey' });
  bus.emit('ui:duel-punish', { m: 30, kind: 'fog' });
  assert.notDeepEqual(ws.sent.at(-1), { t: 'punish', m: 30, kind: 'fog' });
  assert.match(of('hud:toast').at(-1).text, /🐒🎩/, 'our monkey wears our hat');
  assert.equal(duel.summary().oppCard.badge, 'olifant', 'the results know their card');
  duel.leave();
});

test('cards: Robot Rikus wears his own; the race track shows the opponent\'s badge', () => {
  const { bus, duel, of } = setup();
  const m = duel.startBot();
  assert.deepEqual(m.oppCard, BOT_CARD);
  bus.emit('duel:self', { t: 1000, h: 1, best: 1 });
  assert.equal(of('hud:duel').at(-1).badge, '🦅');
  duel.startLink({ seed: SEED, name: 'Sannie', run: slow });
  bus.emit('duel:self', { t: 1000, h: 1, best: 1 });
  assert.equal(of('hud:duel').at(-1).badge, '', 'a link carries no card');
});
