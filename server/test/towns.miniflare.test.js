// (1.18) Going live, in the real Workers runtime (workerd via Miniflare): the front door, Jou dorp's towns and the
// castles through the TownHall Durable Object (SQLite-backed, as on the Free plan), a Blokbotsing room with two real
// WebSockets through SlagRoom, and the carry-over route. Skipped when the dev dependencies aren't installed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { baseEnv, ORIGIN, ADMIN } from './support/harness.js';
import { workerModules, repoRoot } from './support/modules.js';
import { createDorp } from '../src/dorp.js';
import { newTownId, newTownKey } from '../../js/core/dorp.js';

let Miniflare = null;
let toOptions = (o) => o;
try {
  const mod = await import('miniflare');
  Miniflare = mod.Miniflare;
  if (typeof mod.convertV4MiniflareOptions === 'function') toOptions = mod.convertV4MiniflareOptions;
} catch {
  Miniflare = null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('workerd: the towns, the castles and a Blokbotsing room on the real runtime', { skip: Miniflare ? false : 'miniflare not installed (run npm install in server/)', timeout: 90_000 }, async (t) => {
  const { DB: _unused, ...vars } = baseEnv(null);
  let mf;
  try {
    mf = new Miniflare(toOptions({
      modules: workerModules().map((path) => ({ type: 'ESModule', path })),
      modulesRoot: repoRoot,
      compatibilityDate: '2026-09-01',
      d1Databases: { DB: 'stapel-towns-smoke' },
      durableObjects: {
        MATCH_LOBBY: { className: 'MatchLobby', useSQLite: true },
        MATCH_ROOM: { className: 'MatchRoom', useSQLite: true },
        TOWNS: { className: 'TownHall', useSQLite: true },
        SLAG_ROOM: { className: 'SlagRoom', useSQLite: true },
      },
      bindings: vars,
    }));
    await mf.ready;
  } catch (err) {
    await mf?.dispose().catch(() => {});
    t.skip(`workerd could not start here: ${err.message.split('\n')[0]}`);
    return;
  }
  try {
    const call = async (method, path, body, headers = {}) => {
      const res = await mf.dispatchFetch(`https://api.test${path}`, {
        method,
        headers: { Origin: ORIGIN, 'CF-Connecting-IP': '198.51.100.30', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      return [res.status, await res.json().catch(() => null), res];
    };
    // the front door
    let [st, r] = await call('GET', '/');
    assert.deepEqual(r, { ok: true, service: 'stapel-borge', dorp: 1, kasteel: 1, slag: 1 });

    // two towns, neighbours, a raid, the news
    const a = { id: newTownId(), key: newTownKey() };
    const b = { id: newTownId(), key: newTownKey() };
    [st, r] = await call('POST', '/dorp/sync', { ...a, name: 'Anandre', tribe: 'vuur', gains: [{ seq: 1, people: 100, raids: 1 }] });
    assert.equal(st, 200, JSON.stringify(r));
    assert.equal(r.town.people, 100);
    const [, , res] = await call('POST', '/dorp/sync', { ...b, name: 'Anna', tribe: 'gras', gains: [{ seq: 1, people: 100 }] });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.equal((await call('POST', '/dorp/buur', { ...b, buur: a.id }))[0], 200);
    [st, r] = await call('POST', '/dorp/raid', { ...a, target: b.id, hit: 'P' });
    assert.equal(st, 200);
    assert.ok(r.took > 0);
    [st, r] = await call('POST', '/dorp/sync', { ...b });
    assert.equal(r.news.length, 1);
    assert.equal((await call('POST', '/dorp/sync', { ...b }, { Origin: 'https://evil.example' }))[0], 403);

    // a castle, a siege, its news
    assert.equal((await call('POST', '/kasteel/save', { ...a, castle: { seed: 4242, keep: 0, place: { w0: 'boog' }, days: [] } }))[0], 200);
    [st, r] = await call('GET', `/kasteel/c/${a.id}`);
    assert.equal(r.castle.seed, 4242);
    assert.equal((await call('POST', '/kasteel/siege', { ...b, target: a.id, stars: 2, destroyed: 64 }))[0], 200);
    [st, r] = await call('POST', '/kasteel/home', { ...a });
    assert.deepEqual(r.news.map((n) => [n.stars, n.destroyed]), [[2, 64]]);

    // a Blokbotsing room: two real sockets
    [st, r] = await call('POST', '/slag/room');
    assert.equal(st, 200);
    const { code } = r;
    const seat = async () => {
      const res2 = await mf.dispatchFetch(`https://api.test/slag/room/${code}`, { headers: { Upgrade: 'websocket', Origin: ORIGIN } });
      assert.equal(res2.status, 101);
      const ws = res2.webSocket;
      ws.got = [];
      ws.addEventListener('message', (e) => ws.got.push(JSON.parse(e.data)));
      ws.accept();
      return ws;
    };
    const host = await seat();
    await wait(100);
    host.send(JSON.stringify({ t: 'hello', name: 'Anandre', seed: 7 }));
    await wait(100);
    const friend = await seat();
    await wait(200);
    friend.send(JSON.stringify({ t: 'hello', name: 'Anna' }));
    host.send(JSON.stringify({ t: 'throw', i: 1, theta: 0.6, power: 0.8 }));
    await wait(300);
    assert.deepEqual(host.got, [{ t: 'seat', seat: 0 }, { t: 'ready' }, { t: 'hello', name: 'Anna' }]);
    assert.deepEqual(friend.got, [{ t: 'seat', seat: 1 }, { t: 'hello', name: 'Anandre', seed: 7 }, { t: 'ready' }, { t: 'throw', i: 1, theta: 0.6, power: 0.8 }]);
    friend.close(1000, 'bye');
    await wait(300);
    assert.deepEqual(host.got.at(-1), { t: 'gone' });
    assert.equal(host.got.filter((m) => m.t === 'gone').length, 1);
    host.close(1000, 'bye');

    // the carry-over: a home town comes over, opens with its own key
    const mem = new Map();
    const home = createDorp({ async get(k) { return mem.get(k); }, async put(k, v) { mem.set(k, structuredClone(v)); } });
    const c = { id: newTownId(), key: newTownKey() };
    await home.handle('POST', '/dorp/sync', { ...c, name: 'Tuis', gains: [{ seq: 1, people: 77 }] });
    assert.equal((await call('POST', '/admin/dorp/import', { data: Object.fromEntries(mem) }, { Authorization: 'Bearer nope' }))[0], 401);
    [st, r] = await call('POST', '/admin/dorp/import', { data: Object.fromEntries(mem) }, { Authorization: `Bearer ${ADMIN}` });
    assert.deepEqual([st, r.added], [200, 1]);
    [st, r] = await call('GET', '/admin/dorp', null, { Authorization: `Bearer ${ADMIN}` });
    assert.deepEqual([r.towns, r.castles, r.raids], [3, 1, 1]);
    [st, r] = await call('POST', '/dorp/sync', { ...c });
    assert.equal(r.town.people, 77);
  } finally {
    await mf.dispose();
  }
});
