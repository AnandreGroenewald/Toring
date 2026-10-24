// (1.16-1.18) Going live: Jou dorp's towns and the castles on the Worker (one TownHall Durable Object), the friends'
// Blokbotsing rooms (SlagRoom), their routes, and the code-review fixes on the town server: raids one at a time (one
// Wraak can't be spent twice), Robot Rikus's refill at its real speed, writes only when a town changed, a cap on raids
// on one town an hour, an hour's people from reports, new towns per address, a castle more than half down never "held",
// and the carry-over of the home server's towns. Fake Durable Object state and sockets, as in match.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TownHall, storeOn, NEW_TOWNS_PER_HOUR, IMPORT_MAX } from '../src/towns.js';
import { SlagRoom, ROOM_TTL_MS } from '../src/slagroom.js';
import { RAIDED_PER_HOUR, GAIN_PEOPLE_PER_HOUR, createDorp } from '../src/dorp.js';
import { createKasteel } from '../src/kasteel.js';
import { DORP, RIKUS, newTownId, newTownKey } from '../../js/core/dorp.js';
import { isRoomCode } from '../../js/core/duel.js';
import { ORIGIN, T0, ADMIN, createHarness } from './support/harness.js';

// ---------------------------------------------------------------- fakes
function fakeState() {
  const store = new Map();
  const sockets = [];
  const st = {
    writes: 0,
    reads: 0,
    alarm: null,
    storage: {
      async get(k) {
        st.reads++;
        return store.has(k) ? structuredClone(store.get(k)) : undefined;
      },
      async put(k, v) {
        st.writes++;
        store.set(k, structuredClone(v));
      },
      async delete(k) {
        return store.delete(k);
      },
      async deleteAll() {
        store.clear();
      },
      async list({ prefix = '' } = {}) {
        return new Map([...store].filter(([k]) => k.startsWith(prefix)));
      },
      async setAlarm(t) {
        st.alarm = t;
      },
    },
    acceptWebSocket(ws, tags = []) {
      sockets.push({ ws, tags });
    },
    getWebSockets(tag) {
      return sockets.filter((s) => !s.ws.closed && (!tag || s.tags.includes(tag))).map((s) => s.ws);
    },
    store,
  };
  return st;
}

function fakeSocket() {
  return {
    sent: [],
    closed: false,
    att: null,
    send(s) {
      if (this.closed) throw new Error('closed');
      this.sent.push(JSON.parse(s));
    },
    close() {
      this.closed = true;
    },
    serializeAttachment(v) {
      this.att = structuredClone(v);
    },
    deserializeAttachment() {
      return this.att ? structuredClone(this.att) : null;
    },
    of(t) {
      return this.sent.filter((m) => m.t === t);
    },
  };
}

const town = () => ({ id: newTownId(), key: newTownKey() });

/** A TownHall and a way to call it as the Worker does: call(method, path, body, who) -> [status, json]. */
function hall({ now = () => T0, rand = () => 0.99 } = {}) {
  const state = fakeState();
  const h = new TownHall(state, {}, { now, rand });
  const call = async (method, path, body = null, who = 'addr1') => {
    const res = await h.fetch(new Request('https://towns/handle', { method: 'POST', headers: { 'X-Stapel-Addr': who }, body: JSON.stringify({ method, path, body }) }));
    return [res.status, await res.json()];
  };
  return { h, state, call };
}

// ---------------------------------------------------------------- the towns' object
test('towns: made by the first sync; a poll that changes nothing writes nothing (and reads from memory)', async () => {
  const c = { t: T0 };
  const { state, call } = hall({ now: () => c.t });
  const a = town();
  let [st, r] = await call('POST', '/dorp/sync', { ...a, name: 'Anna', tribe: 'water', gains: [{ seq: 1, people: 40, raids: 1 }] });
  assert.equal(st, 200);
  assert.equal(r.town.people, 40);
  assert.equal(r.bure[0].id, 'RIKUS');
  const writes = state.writes;
  const reads = state.reads;
  // the menu polls every 15 s: nothing new, nothing written, nothing read from storage
  for (let k = 0; k < 20; k++) {
    c.t += 15_000;
    [st, r] = await call('POST', '/dorp/sync', { ...a, name: 'Anna', tribe: 'water', gains: [{ seq: 1, people: 40, raids: 1 }] });
    assert.equal(st, 200);
  }
  assert.equal(state.writes, writes, 'no change, no write');
  assert.equal(state.reads, reads, 'the town came from memory');
  // ten minutes on: its "last seen" is written once
  c.t += 10 * 60_000;
  await call('POST', '/dorp/sync', { ...a });
  assert.equal(state.writes, writes + 1);
  // news seen, a new report: written
  await call('POST', '/dorp/sync', { ...a, gains: [{ seq: 2, people: 3 }] });
  assert.equal(state.writes, writes + 2);
  // the wrong key, a bad body, an unknown path
  assert.equal((await call('POST', '/dorp/sync', { id: a.id, key: newTownKey() }))[0], 403);
  assert.equal((await call('POST', '/dorp/sync', 'nonsense'))[0], 403);
  assert.equal((await call('GET', '/dorp/nope'))[0], 404);
  assert.equal((await call('GET', '/elders'))[0], 404);
  assert.equal((await call('GET', `/dorp/town/${a.id}`))[1].people, 43);
});

test('towns: two raids at once with one Wraak spend it once (review V10), and both towns keep both updates', async () => {
  const { call } = hall({ rand: () => 0.99 });
  const a = town();
  const b = town();
  await call('POST', '/dorp/sync', { ...a, name: 'A', tribe: 'vuur', gains: [{ seq: 1, people: 100, raids: 2 }] });
  await call('POST', '/dorp/sync', { ...b, name: 'B', tribe: 'vuur', gains: [{ seq: 1, people: 100 }] });
  await call('POST', '/dorp/buur', { ...b, buur: a.id });
  const [, hit] = await call('POST', '/dorp/raid', { ...a, target: b.id });
  // B avenges three times at once with the one Wraak (a script) while syncing: one Wraak, two ordinary raids refused
  const [r1, r2, r3, s] = await Promise.all([
    call('POST', '/dorp/raid', { ...b, target: a.id, wraak: hit.raidId }),
    call('POST', '/dorp/raid', { ...b, target: a.id, wraak: hit.raidId }),
    call('POST', '/dorp/raid', { ...b, target: a.id, wraak: hit.raidId }),
    call('POST', '/dorp/sync', { ...b, gains: [{ seq: 2, people: 7 }] }),
  ]);
  const ok = [r1, r2, r3].filter(([st, r]) => st === 200 && r.wraak);
  assert.equal(ok.length, 1, 'the Wraak spent once');
  // (the others were ordinary raids: B had one strooptog (a new town's), then none)
  assert.equal([r1, r2, r3].filter(([st]) => st === 409).length, 1);
  assert.equal(s[0], 200);
  const [, bt] = await call('GET', `/dorp/town/${b.id}`);
  const took = [r1, r2, r3].filter(([st]) => st === 200).reduce((n, [, r]) => n + r.took, 0);
  assert.equal(bt.people, 100 - hit.took + took + 7, 'every raid and the sync count');
});

test('towns: Robot Rikus refills at RIKUS.refillPerHour, not a person every 15-second poll (review V11)', async () => {
  const c = { t: T0 };
  const { call } = hall({ now: () => c.t, rand: () => 0.99 });   // (he never raids back)
  const a = town();
  // a town of 250: Rikus's goal is 200, he starts with 40 and refills 40 an hour
  await call('POST', '/dorp/sync', { ...a, name: 'A', tribe: 'vuur', gains: [{ seq: 1, people: 250 }] });
  const goal = Math.round(250 * RIKUS.share);
  let [, r] = await call('POST', '/dorp/sync', { ...a });
  const start = r.bure[0].people;
  for (let k = 0; k < 240; k++) {   // an hour of polls
    c.t += 15_000;
    [, r] = await call('POST', '/dorp/sync', { ...a });
  }
  const perHour = goal * RIKUS.refillPerHour;
  assert.ok(Math.abs(r.bure[0].people - (start + perHour)) <= 1, `${start} -> ${r.bure[0].people}, expected about +${perHour}`);
  // full: he stays at his goal; a raid on him counts his refill from the raid on (not from when he was last written)
  c.t += 10 * 3600_000;
  [, r] = await call('POST', '/dorp/sync', { ...a });
  assert.equal(r.bure[0].people, goal);
  c.t += 3 * 3600_000;
  await call('POST', '/dorp/sync', { ...a, gains: [{ seq: 2, people: 0, raids: 1 }] });
  [, r] = await call('POST', '/dorp/raid', { ...a, target: 'RIKUS' });
  const after = r.them.people;
  c.t += 15_000;
  [, r] = await call('POST', '/dorp/sync', { ...a });
  assert.ok(r.bure[0].people - after <= 1, 'no jump after the raid');
});

test(`towns: at most ${RAIDED_PER_HOUR} strooptogte on one town an hour (a Wraak still goes through)`, async () => {
  const c = { t: T0 };
  const { call } = hall({ now: () => c.t });
  const victim = town();
  await call('POST', '/dorp/sync', { ...victim, name: 'V', gains: [{ seq: 1, people: 400 }] });
  const raiders = [];
  for (let k = 0; k <= RAIDED_PER_HOUR; k++) {
    const t = town();
    await call('POST', '/dorp/sync', { ...t, name: `R${k}`, gains: [{ seq: 1, people: 1, raids: 1 }] }, `addr-r${k}`);
    await call('POST', '/dorp/buur', { ...t, buur: victim.id });
    raiders.push(t);
  }
  for (let k = 0; k < RAIDED_PER_HOUR; k++) assert.equal((await call('POST', '/dorp/raid', { ...raiders[k], target: victim.id }))[0], 200);
  const [st, r] = await call('POST', '/dorp/raid', { ...raiders[RAIDED_PER_HOUR], target: victim.id });
  assert.equal(st, 429);
  assert.equal(r.error, 'soon');
  assert.equal(r.town.raids, DORP.startRaids + 1, 'the strooptog is kept');
  // the victim's Wraak on a raider is no strooptog: it goes through
  const [, home] = await call('POST', '/dorp/sync', { ...victim });
  const owed = home.bure.find((x) => x.id === raiders[0].id).wraak;
  assert.equal((await call('POST', '/dorp/raid', { ...victim, target: raiders[0].id, wraak: owed }))[1].wraak, true);
  // an hour on, the town can be raided again
  c.t += 3600_000;
  assert.equal((await call('POST', '/dorp/raid', { ...raiders[RAIDED_PER_HOUR], target: victim.id }))[0], 200);
});

test(`towns: reports bring at most ${GAIN_PEOPLE_PER_HOUR} people an hour; the rest waits on the phone and comes later`, async () => {
  const c = { t: T0 };
  const { call } = hall({ now: () => c.t });
  const a = town();
  const gains = Array.from({ length: 10 }, (_, k) => ({ seq: k + 1, people: DORP.gainPeople }));   // 5000 people
  let [, r] = await call('POST', '/dorp/sync', { ...a, gains });
  assert.equal(r.town.people, GAIN_PEOPLE_PER_HOUR);
  assert.equal(r.town.seq, GAIN_PEOPLE_PER_HOUR / DORP.gainPeople, 'the phone keeps what has a higher seq');
  [, r] = await call('POST', '/dorp/sync', { ...a, gains: gains.filter((g) => g.seq > r.town.seq) });
  assert.equal(r.town.people, GAIN_PEOPLE_PER_HOUR, 'not this hour');
  c.t += 3600_000;
  [, r] = await call('POST', '/dorp/sync', { ...a, gains: gains.filter((g) => g.seq > r.town.seq) });
  assert.equal(r.town.people, 5000);
  assert.equal(r.town.seq, 10);
});

test(`towns: one address makes at most ${NEW_TOWNS_PER_HOUR} towns an hour; a town it has opens as always`, async () => {
  const { call } = hall();
  const first = town();
  assert.equal((await call('POST', '/dorp/sync', { ...first }, 'busy'))[0], 200);
  for (let k = 1; k < NEW_TOWNS_PER_HOUR; k++) assert.equal((await call('POST', '/dorp/sync', { ...town() }, 'busy'))[0], 200);
  const [st, r] = await call('POST', '/dorp/sync', { ...town() }, 'busy');
  assert.deepEqual([st, r.error], [429, 'soon']);
  assert.equal((await call('POST', '/dorp/sync', { ...first }, 'busy'))[0], 200);
  assert.equal((await call('POST', '/dorp/sync', { ...town() }, 'elsewhere'))[0], 200);
});

test('castles: through the same object; a castle more than half down never held; the same castle again writes nothing', async () => {
  const c = { t: T0 };
  const { state, call } = hall({ now: () => c.t });
  const anna = town();
  const jan = town();
  await call('POST', '/dorp/sync', { ...anna, name: 'Anna' });
  await call('POST', '/dorp/sync', { ...jan, name: 'Jan' });
  await call('POST', '/dorp/buur', { ...anna, buur: jan.id });
  const castle = { seed: 77, keep: 0, place: { w0: 'boog' }, days: [] };
  assert.equal((await call('POST', '/kasteel/save', { ...anna, castle }))[0], 200);
  const w = state.writes;
  assert.equal((await call('POST', '/kasteel/save', { ...anna, castle }))[0], 200);
  assert.equal(state.writes, w, 'the same castle: no write');
  // a 0-star result with 60% down (the stars counted before the last stone fell): a star, not a castle that held
  assert.equal((await call('POST', '/kasteel/siege', { ...jan, target: anna.id, stars: 0, destroyed: 60 }))[0], 200);
  c.t += 61_000;
  assert.equal((await call('POST', '/kasteel/siege', { ...jan, target: anna.id, stars: 0, destroyed: 20 }))[0], 200);
  const [, home] = await call('POST', '/kasteel/home', { ...anna });
  assert.deepEqual(home.news.map((n) => [n.stars, n.destroyed]), [[1, 60], [0, 20]]);
  const [, jans] = await call('POST', '/kasteel/home', { ...jan });
  assert.equal(jans.friends[0].wins, 1, 'only the siege it held');
  // the town's sync carries the castle's news count (the menu's badge without a second call)
  assert.deepEqual((await call('POST', '/dorp/sync', { ...anna }))[1].kasteel, { newsN: 2, seenN: 0 });
  assert.equal((await call('POST', '/dorp/sync', { ...jan }))[1].kasteel, undefined, 'no castle, no count');
  // seen: written once, then not again
  const w2 = state.writes;
  await call('POST', '/kasteel/home', { ...anna, seen: 2 });
  await call('POST', '/kasteel/home', { ...anna, seen: 2 });
  assert.equal(state.writes, w2 + 1);
  assert.equal((await call('GET', `/kasteel/c/${anna.id}`))[1].castle.seed, 77);
});

test('towns: the carry-over imports the home server\'s file (kept ones stay), and the count says what is there', async () => {
  const { h, call } = hall();
  // the home server: a town with a castle, a raid, made the way matchhost.mjs keeps them
  const mem = new Map();
  const homeStore = { async get(k) { return mem.has(k) ? structuredClone(mem.get(k)) : undefined; }, async put(k, v) { mem.set(k, structuredClone(v)); } };
  const homeDorp = createDorp(homeStore);
  const homeK = createKasteel(homeStore);
  const a = town();
  const b = town();
  await homeDorp.handle('POST', '/dorp/sync', { ...a, name: 'Anandre', gains: [{ seq: 1, people: 120, raids: 2 }] });
  await homeDorp.handle('POST', '/dorp/sync', { ...b, name: 'Vrou', gains: [{ seq: 1, people: 80 }] });
  await homeDorp.handle('POST', '/dorp/buur', { ...b, buur: a.id });
  await homeDorp.handle('POST', '/dorp/raid', { ...a, target: b.id });
  await homeK.handle('POST', '/kasteel/save', { ...a, castle: { seed: 9, place: {}, days: [] } });
  const file = Object.fromEntries(mem);
  const imp = async (data, overwrite = false) => (await h.fetch(new Request('https://towns/import', { method: 'POST', body: JSON.stringify({ data, overwrite }) }))).json();
  const r = await imp({ ...file, 'dorp:BAD': { id: 'x' }, 'other:1': {} });
  assert.equal(r.added, Object.keys(file).length);
  assert.deepEqual(r.bad, ['dorp:BAD', 'other:1']);
  // the towns open with their own phones' keys, as at home
  let [st, t] = await call('POST', '/dorp/sync', { ...a });
  assert.equal(st, 200);
  assert.equal(t.town.name, 'Anandre');
  assert.ok(t.town.people > 120);
  [st, t] = await call('POST', '/dorp/sync', { ...b });
  assert.equal(t.news.length, 1);
  assert.equal((await call('GET', `/kasteel/c/${a.id}`))[1].castle.seed, 9);
  // again: what is kept stays (the live towns moved on); overwrite only when asked
  assert.equal((await imp(file)).skipped, Object.keys(file).length);
  const big = Object.fromEntries(Array.from({ length: IMPORT_MAX + 1 }, (_, k) => [`raid:${String(k).padStart(10, 'A')}`, {}]));
  assert.equal((await h.fetch(new Request('https://towns/import', { method: 'POST', body: JSON.stringify({ data: big }) }))).status, 413);
  const count = await (await h.fetch(new Request('https://towns/count', { method: 'POST', body: '{}' }))).json();
  assert.deepEqual([count.towns, count.castles, count.raids], [2, 1, 1]);
});

test('storeOn: copies in and out, the oldest out of memory first', async () => {
  const st = fakeState();
  const s = storeOn(st.storage, 2);
  await s.put('a', { n: 1 });
  const x = await s.get('a');
  x.n = 99;
  assert.equal((await s.get('a')).n, 1);
  await s.put('b', { n: 2 });
  await s.put('c', { n: 3 });
  const reads = st.reads;
  await s.get('c');
  await s.get('b');
  assert.equal(st.reads, reads);
  await s.get('a');
  assert.equal(st.reads, reads + 1, '"a" had gone out of memory');
  assert.equal(await s.get('nope'), undefined);
});

// ---------------------------------------------------------------- the friends' rooms
async function room(now = () => T0) {
  const state = fakeState();
  const r = new SlagRoom(state, {}, { now, upgrade: () => { const ws = fakeSocket(); return [{ status: 101, ws }, ws]; } });
  const res = await r.fetch(new Request('https://room/init', { method: 'POST' }));
  assert.equal(res.status, 200);
  return { r, state };
}
const say = (r, ws, o) => r.webSocketMessage(ws, typeof o === 'string' ? o : JSON.stringify(o));

test('rooms: two seats, ready for both, each message to the other as it came; the room\'s own words are not passed on', async () => {
  const { r, state } = await room();
  assert.equal((await r.fetch(new Request('https://room/init', { method: 'POST' }))).status, 409, 'a room is made once');
  assert.equal(state.alarm, T0 + ROOM_TTL_MS);
  const host = fakeSocket();
  await r.join(host);
  assert.deepEqual(host.sent, [{ t: 'seat', seat: 0 }]);
  // the host speaks before the friend is in: it waits for them
  await say(r, host, { t: 'hello', name: 'Anandre', seed: 5 });
  const friend = fakeSocket();
  await r.join(friend);
  assert.deepEqual(friend.sent, [{ t: 'seat', seat: 1 }, { t: 'hello', name: 'Anandre', seed: 5 }, { t: 'ready' }]);
  assert.deepEqual(host.of('ready'), [{ t: 'ready' }]);
  await say(r, friend, { t: 'hello', name: 'Vrou' });
  await say(r, host, { t: 'build', i: 1, x: 2.5 });
  await say(r, friend, { t: 'gone' });
  await say(r, friend, { t: 'ready' });
  await say(r, friend, 'not json');
  await say(r, friend, JSON.stringify({ t: 'pick', pad: 'x'.repeat(40 * 1024) }));
  assert.deepEqual(host.sent.slice(1), [{ t: 'ready' }, { t: 'hello', name: 'Vrou' }]);
  assert.deepEqual(friend.sent.at(-1), { t: 'build', i: 1, x: 2.5 });
  // a third socket on the same link: no seat
  const third = fakeSocket();
  await r.join(third);
  assert.deepEqual(third.sent, [{ t: 'gone' }]);
  assert.equal(third.closed, true);
});

test('rooms: a seat that leaves tells the other once; no room, no seat; the room ends when nobody is in it', async () => {
  const { r, state } = await room();
  const host = fakeSocket();
  const friend = fakeSocket();
  await r.join(host);
  await r.join(friend);
  host.closed = true;
  await r.webSocketClose(host);
  await r.webSocketError(host);
  await r.webSocketClose(host);
  assert.equal(friend.of('gone').length, 1, 'one gone per leave');
  // the alarm: someone still in -> later; nobody -> the room goes
  await r.alarm();
  assert.ok(state.store.has('made'));
  assert.ok(state.alarm > T0);
  friend.closed = true;
  await r.webSocketClose(friend);
  await r.alarm();
  assert.equal(state.store.size, 0);
  const late = fakeSocket();
  await r.join(late);
  assert.deepEqual(late.sent, [{ t: 'gone' }]);
  // a socket on a code nobody made
  const none = new SlagRoom(fakeState(), {}, {});
  const ws = fakeSocket();
  await none.join(ws);
  assert.deepEqual(ws.sent, [{ t: 'gone' }]);
});

test('rooms: at most 20 messages a second from one seat', async () => {
  const { r } = await room();
  const a = fakeSocket();
  const b = fakeSocket();
  await r.join(a);
  await r.join(b);
  for (let k = 0; k < 30; k++) await say(r, a, { t: 'pick', i: k });
  assert.equal(b.of('pick').length, 20);
});

// ---------------------------------------------------------------- the routes
function liveEnv(extra = {}) {
  const towns = hall();
  const rooms = new Map();
  const slag = {
    idFromName: (n) => n,
    get: (code) => ({
      fetch: async (req, init) => {
        let rm = rooms.get(code);
        if (!rm) {
          rm = new SlagRoom(fakeState(), {}, { upgrade: () => { const ws = fakeSocket(); return [{ status: 101, webSocket: ws }, ws]; } });
          rooms.set(code, rm);
        }
        return rm.fetch(typeof req === 'string' ? new Request(req, init) : req);
      },
    }),
  };
  const TOWNS = { idFromName: (n) => n, get: () => ({ fetch: (url, init) => towns.h.fetch(new Request(url, init)) }) };
  return { env: { TOWNS, SLAG_ROOM: slag, ...extra }, towns, rooms };
}

test('routes: the front door says the towns and rooms are here only when they are', async () => {
  const bare = createHarness();
  assert.deepEqual((await bare.request('GET', '/')).json, { ok: true, service: 'stapel-borge' });
  const { env } = liveEnv();
  const h = createHarness(env);
  assert.deepEqual((await h.request('GET', '/')).json, { ok: true, service: 'stapel-borge', dorp: 1, kasteel: 1, span: 1, slag: 1 });
});

test('routes: /dorp and /kasteel through the object, only from the game\'s pages, with the body limits', async () => {
  const { env } = liveEnv();
  const h = createHarness(env);
  const a = town();
  let r = await h.request('POST', '/dorp/sync', { body: { ...a, name: 'Anna', gains: [{ seq: 1, people: 9 }] } });
  assert.equal(r.status, 200);
  assert.equal(r.json.town.people, 9);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  r = await h.request('GET', `/dorp/town/${a.id}`);
  assert.equal(r.json.name, 'Anna');
  assert.equal((await h.request('GET', '/dorp/ping')).json.ok, true);
  assert.equal((await h.request('GET', '/kasteel/ping')).json.ok, true);
  assert.equal((await h.request('POST', '/dorp/sync', { body: { ...a }, origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.request('POST', '/dorp/sync', { body: { ...a }, origin: null })).status, 403);
  assert.equal((await h.request('POST', '/dorp/sync', { body: { ...a, pad: 'x'.repeat(20 * 1024) } })).status, 413);
  assert.equal((await h.request('POST', '/kasteel/save', { body: { ...a, pad: 'x'.repeat(100 * 1024), castle: { seed: 4, place: {}, days: [] } } })).status, 200, 'a castle may be bigger');
  assert.equal((await h.request('POST', '/dorp/sync', { rawBody: '{broken', headers: { 'Content-Type': 'application/json' } })).status, 403);
  assert.equal((await h.request('DELETE', '/dorp/sync')).status, 405);
  // a preflight for the game's JSON posts
  const pre = await h.request('OPTIONS', '/dorp/sync', { headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  // without the object: 503, and the front door says nothing of towns
  const off = createHarness();
  assert.equal((await off.request('POST', '/dorp/sync', { body: { ...a } })).status, 503);
});

test('routes: an address\'s town calls an hour are limited', async () => {
  const { env } = liveEnv();
  const h = createHarness(env);
  let last;
  for (let k = 0; k < 3001; k++) last = await h.request('GET', '/dorp/ping', { ip: '203.0.113.9' });
  assert.equal(last.status, 429);
  assert.equal((await h.request('GET', '/dorp/ping', { ip: '203.0.113.10' })).status, 200);
});

test('routes: /slag/room makes a room (30 an hour an address); a seat needs a socket and a real code', async () => {
  const { env, rooms } = liveEnv();
  const h = createHarness(env);
  const r = await h.request('POST', '/slag/room');
  assert.equal(r.status, 200);
  assert.ok(isRoomCode(r.json.code));
  assert.ok(rooms.has(r.json.code));
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await h.request('POST', '/slag/room', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.request('GET', '/slag/room')).status, 405);
  assert.equal((await h.request('GET', `/slag/room/${r.json.code}`)).status, 426);
  assert.equal((await h.request('GET', '/slag/room/abc', { headers: { Upgrade: 'websocket' } })).status, 404);
  const ws = await h.worker.fetch(new Request(`https://api.test/slag/room/${r.json.code}`, { headers: { Origin: ORIGIN, Upgrade: 'websocket', 'CF-Connecting-IP': '1.1.1.1' } }), h.env);
  assert.equal(ws.status, 101);
  assert.deepEqual(ws.webSocket.sent, [{ t: 'seat', seat: 0 }]);
  let last;
  for (let k = 0; k < 31; k++) last = await h.request('POST', '/slag/room', { ip: '198.51.100.99' });
  assert.equal(last.status, 429);
  assert.equal((await createHarness().request('POST', '/slag/room')).status, 503);
});

test('routes: the carry-over and the count, only with the owner\'s token', async () => {
  const { env } = liveEnv();
  const h = createHarness(env);
  const a = town();
  const mem = new Map();
  const d = createDorp({ async get(k) { return mem.get(k); }, async put(k, v) { mem.set(k, structuredClone(v)); } });
  await d.handle('POST', '/dorp/sync', { ...a, name: 'Tuis', gains: [{ seq: 1, people: 33 }] });
  const data = Object.fromEntries(mem);
  assert.equal((await h.admin('POST', '/admin/dorp/import', { data }, `${ADMIN}x`)).status, 401);
  const r = await h.admin('POST', '/admin/dorp/import', { data });
  assert.equal(r.status, 200);
  assert.equal(r.json.added, 1);
  assert.deepEqual((await h.admin('GET', '/admin/dorp')).json, { ok: true, towns: 1, castles: 0, raids: 0 });
  assert.equal((await h.request('POST', '/dorp/sync', { body: { ...a } })).json.town.people, 33);
  assert.equal((await h.admin('DELETE', '/admin/dorp')).status, 405);
  assert.equal((await createHarness().admin('GET', '/admin/dorp')).status, 503);
});
