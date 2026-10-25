// (1.21.2) Saam gly on phones: a socket that comes back with its phone's key takes over its own seat (the old one,
// dead or alive, goes quietly; both hear ready again), and the lobby pairs two players looking for anyone to ride with.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SlagRoom, LOBBY_NAME } from '../src/slagroom.js';
import { isRoomCode } from '../../js/core/duel.js';
import { createHarness } from './support/harness.js';

function fakeState() {
  const store = new Map();
  const sockets = [];
  return {
    storage: {
      async get(k) { return store.has(k) ? structuredClone(store.get(k)) : undefined; },
      async put(k, v) { store.set(k, structuredClone(v)); },
      async delete(k) { return store.delete(k); },
      async deleteAll() { store.clear(); },
      async setAlarm() {},
    },
    acceptWebSocket(ws) { sockets.push(ws); },
    getWebSockets() { return sockets.filter((ws) => !ws.closed); },
    store,
  };
}
function fakeSocket() {
  return {
    sent: [],
    closed: false,
    att: null,
    send(s) { if (this.closed) throw new Error('closed'); this.sent.push(JSON.parse(s)); },
    close() { this.closed = true; },
    serializeAttachment(v) { this.att = structuredClone(v); },
    deserializeAttachment() { return this.att ? structuredClone(this.att) : null; },
    of(t) { return this.sent.filter((m) => m.t === t); },
  };
}
/** The rooms as the Worker keeps them: one SlagRoom per name, made on first use. */
function rooms(now = () => 1e12) {
  const all = new Map();
  const made = [];
  const ns = {
    idFromName: (n) => n,
    get: (name) => ({
      fetch: async (req, init) => {
        if (!all.has(name)) all.set(name, new SlagRoom(fakeState(), { SLAG_ROOM: ns }, { now, upgrade: () => { const ws = fakeSocket(); made.push(ws); return [new Response(null, { status: 200 }), ws]; } }));
        return all.get(name).fetch(typeof req === 'string' ? new Request(req, init) : req);
      },
    }),
  };
  return { ns, all, made };
}
const up = (url) => new Request(url, { headers: { Upgrade: 'websocket' } });
const say = (r, ws, o) => r.webSocketMessage(ws, JSON.stringify(o));

test('a phone back with its key takes its own seat again, even while the room still holds its old socket', async () => {
  const { ns, all } = rooms();
  await ns.get('ABC234').fetch('https://room/init', { method: 'POST' });
  const r = all.get('ABC234');
  const host = fakeSocket();
  const friend = fakeSocket();
  await r.join(host, 'hostkey123');
  await r.join(friend, 'friendkey99');
  assert.deepEqual(host.of('ready').length, 1);
  // the host's phone went to WhatsApp: its socket lingers (not closed); it comes back on a new one
  const host2 = fakeSocket();
  await r.join(host2, 'hostkey123');
  assert.deepEqual(host2.sent[0], { t: 'seat', seat: 0 }, 'its own seat');
  assert.equal(host.closed, true, 'the old socket is let go');
  assert.equal(friend.of('gone').length, 0, 'the friend is not told the host went');
  assert.equal(friend.of('ready').length, 2, 'both hear ready again');
  await say(r, friend, { t: 'hi', name: 'Vrou' });
  assert.deepEqual(host2.of('hi'), [{ t: 'hi', name: 'Vrou' }]);
  // the old socket's close comes late: nobody hears a thing
  await r.webSocketClose(host);
  assert.equal(friend.of('gone').length, 0);
  // without the key, a third phone still finds no seat
  const third = fakeSocket();
  await r.join(third, 'otherkey77');
  assert.deepEqual(third.sent, [{ t: 'gone' }]);
});

test('the friend joins while the host is away; the host comes back to the other seat', async () => {
  const { ns, all } = rooms();
  await ns.get('QRS234').fetch('https://room/init', { method: 'POST' });
  const r = all.get('QRS234');
  const host = fakeSocket();
  await r.join(host, 'hostkey123');
  host.closed = true;
  await r.webSocketClose(host);
  const friend = fakeSocket();
  await r.join(friend, 'friendkey99');
  assert.deepEqual(friend.sent[0], { t: 'seat', seat: 0 });
  const host2 = fakeSocket();
  await r.join(host2, 'hostkey123');
  assert.deepEqual(host2.sent[0], { t: 'seat', seat: 1 });
  assert.equal(friend.of('ready').length, 1);
  assert.equal(host2.of('ready').length, 1);
});

test('the lobby pairs two looking: a new room, its code to both, the longest waiting makes it; then it lets them go', async () => {
  let t = 1e12;
  const { ns, all, made } = rooms(() => t);
  const lobby = () => all.get(LOBBY_NAME);
  await ns.get(LOBBY_NAME).fetch(up('https://room/lobby?n=Anandre&k=akey12345'));
  const a = made.at(-1);
  assert.deepEqual(a.sent, [{ t: 'wait', n: 1 }]);
  t += 5000;
  await ns.get(LOBBY_NAME).fetch(up('https://room/lobby?n=%3Cb%3EVrou&k=bkey12345'));
  const b = made.at(-1);
  const am = a.of('match')[0];
  const bm = b.of('match')[0];
  assert.ok(am && isRoomCode(am.code), 'a room code');
  assert.deepEqual(bm, { t: 'match', code: am.code, host: false, name: 'Anandre' });
  assert.equal(am.host, true, 'the one who waited longest makes the room');
  assert.equal(am.name, 'bVrou', 'no markup in a name');
  assert.ok((await all.get(am.code).state.storage.get('made')) > 0, 'the room was made');
  assert.ok(a.closed && b.closed, 'the lobby lets both go');
  // the same phone looking twice (back from another app): its old place goes, nobody is matched with it
  await ns.get(LOBBY_NAME).fetch(up('https://room/lobby?n=Een&k=ckey12345'));
  const c1 = made.at(-1);
  await ns.get(LOBBY_NAME).fetch(up('https://room/lobby?n=Een&k=ckey12345'));
  const c2 = made.at(-1);
  assert.equal(c1.closed, true, 'one place per phone');
  assert.equal(c2.of('match').length, 0);
  assert.deepEqual(c2.sent, [{ t: 'wait', n: 1 }]);
  // a lobby socket's messages go nowhere; its close tells nobody
  await say(lobby(), c2, { t: 'hi' });
  await lobby().webSocketClose(c2);
});

test('routes: /slag/seek is a socket into the lobby (the game\'s own pages only)', async () => {
  const { ns, all } = rooms();
  const h = createHarness({ SLAG_ROOM: ns });
  await h.request('GET', '/slag/seek?n=Anandre&k=akey12345', { headers: { Upgrade: 'websocket' } });
  assert.ok(all.get(LOBBY_NAME), 'into the lobby');
  const bad = await h.request('GET', '/slag/seek', { headers: { Upgrade: 'websocket' }, origin: 'https://evil.example' });
  assert.equal(bad.status, 403);
  const plain = await h.request('GET', '/slag/seek');
  assert.equal(plain.status, 426);
});
