// (1.16) Jou dorp: Steel en Wraak. The rules (js/core/dorp.js), the server's towns and raids (server/src/dorp.js) and the
// phone's side (js/dorp.js: reports sent once each, the day's wall, the server's word kept).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DORP, raidTake, goldTake, cleanHit, dorpTitle, raidsFromRatings, cleanGain, newTownId, newTownKey, isTownId, isTownKey, cleanTownName } from '../js/core/dorp.js';
import { createDorp } from '../server/src/dorp.js';
import { createDorpClient } from '../js/dorp.js';

const memStore = () => {
  const m = new Map();
  return { m, async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; }, async put(k, v) { m.set(k, structuredClone(v)); } };
};
const town = () => ({ id: newTownId(), key: newTownKey() });

test('a raid takes 12% (3 at least, 40 at most), more for a beating tribe and a Wraak, never more than they have', () => {
  assert.equal(raidTake({ people: 0 }), 0);
  assert.equal(raidTake({ people: 2 }), 2);
  assert.equal(raidTake({ people: 10 }), 3);
  assert.equal(raidTake({ people: 100, mine: 'vuur', theirs: 'vuur' }), 12);
  assert.equal(raidTake({ people: 100, mine: 'vuur', theirs: 'gras' }), 18);   // vuur beats gras
  assert.equal(raidTake({ people: 100, mine: 'gras', theirs: 'vuur' }), 12);
  assert.equal(raidTake({ people: 100, mine: 'water', theirs: 'vuur', wraak: true }), 27);
  assert.equal(raidTake({ people: 5000 }), DORP.max);
});

test('titles, ids, names, reports and strooptogte from a run of Perfeks', () => {
  assert.equal(dorpTitle(0).now.id, 'plasie');
  assert.equal(dorpTitle(120).now.id, 'dorpie');
  assert.equal(dorpTitle(120).next.id, 'dorp');
  assert.equal(dorpTitle(99999).next, null);
  for (let k = 0; k < 20; k++) {
    assert.ok(isTownId(newTownId()));
    assert.ok(isTownKey(newTownKey()));
  }
  assert.equal(cleanTownName('  Anna  '), 'Anna');
  assert.equal(cleanTownName(''), null);
  assert.equal(raidsFromRatings(['P', 'P', 'P', 'G', 'P', 'P', 'P', 'P', 'P', 'P']), 3);
  assert.equal(raidsFromRatings(['P', 'P', 'G', 'P']), 0);
  assert.deepEqual(cleanGain({ seq: 2, people: 9999, raids: -3, walls: 5, gold: 99 }), { seq: 2, people: DORP.gainPeople, raids: 0, walls: 1, gold: DORP.gainGold });
  assert.equal(cleanGain({ seq: 0, people: 3 }), null);
});

test('the server: a town is made by its first sync and opened only by its key; reports count once each', async () => {
  const d = createDorp(memStore());
  const a = town();
  let [st, r] = await d.handle('POST', '/dorp/sync', { ...a, name: 'Anna', tribe: 'water', gains: [{ seq: 1, people: 40, raids: 2, walls: 1 }] });
  assert.equal(st, 200);
  assert.equal(r.town.people, 40);
  assert.equal(r.town.raids, DORP.startRaids + 2);
  assert.equal(r.town.walls, 1);
  assert.equal(r.town.name, 'Anna');
  // the same report again (its answer was lost) and a new one
  [st, r] = await d.handle('POST', '/dorp/sync', { ...a, gains: [{ seq: 1, people: 40, raids: 2, walls: 1 }, { seq: 2, people: 5, raids: 9, walls: 1 }] });
  assert.equal(r.town.people, 45);
  assert.equal(r.town.raids, DORP.raidsMax);
  assert.equal(r.town.walls, 2);
  // a wrong key never opens it
  [st] = await d.handle('POST', '/dorp/sync', { id: a.id, key: newTownKey(), gains: [{ seq: 3, people: 999 }] });
  assert.equal(st, 403);
  [st, r] = await d.handle('GET', `/dorp/town/${a.id}`);
  assert.equal(r.people, 45);
  assert.equal(r.keyHash, undefined);
});

test('the server: neighbours by link, a raid moves people, a wall stops one, the robbed get one free and stronger Wraak', async () => {
  const d = createDorp(memStore());
  const a = town();
  const b = town();
  await d.handle('POST', '/dorp/sync', { ...a, name: 'Anandre', tribe: 'vuur', gains: [{ seq: 1, people: 100, raids: 1 }] });
  await d.handle('POST', '/dorp/sync', { ...b, name: 'Anna', tribe: 'gras', gains: [{ seq: 1, people: 100 }] });
  // not neighbours yet: no raid
  let [st, r] = await d.handle('POST', '/dorp/raid', { ...a, target: b.id });
  assert.equal(st, 403);
  [st, r] = await d.handle('POST', '/dorp/buur', { ...b, buur: a.id });
  assert.equal(st, 200);
  assert.equal(r.them.name, 'Anandre');
  // Anandre (vuur) raids Anna (gras): vuur beats gras
  [st, r] = await d.handle('POST', '/dorp/raid', { ...a, target: b.id });
  assert.equal(st, 200);
  assert.equal(r.took, 18);
  assert.equal(r.blocked, false);
  assert.equal(r.town.people, 118);
  assert.equal(r.town.raids, DORP.startRaids + 1 - 1);
  assert.equal(r.them.people, 82);
  const raidId = r.raidId;
  [st, r] = await d.handle('GET', `/dorp/raid/${raidId}`);
  assert.deepEqual([r.name, r.toName, r.took], ['Anandre', 'Anna', 18]);
  // Anna hears it, and sees her Wraak on Anandre
  [st, r] = await d.handle('POST', '/dorp/sync', { ...b });
  assert.equal(r.news.length, 1);
  assert.equal(r.news[0].took, 18);
  assert.equal(r.bure[0].wraak, raidId);
  // her Wraak costs nothing (she has her starting strooptog still) and hits harder: gras vs vuur, x1.5
  [st, r] = await d.handle('POST', '/dorp/raid', { ...b, target: a.id, wraak: raidId });
  assert.equal(st, 200);
  assert.equal(r.wraak, true);
  assert.equal(r.took, Math.round(118 * DORP.share * DORP.wraakMul));
  assert.equal(r.town.raids, DORP.startRaids);
  // once only
  [st, r] = await d.handle('POST', '/dorp/sync', { ...b });
  assert.equal(r.bure[0].wraak, null);
  [st, r] = await d.handle('POST', '/dorp/raid', { ...b, target: a.id, wraak: raidId });
  assert.equal(r.wraak, false);   // (spent: an ordinary raid, her own strooptog)
  assert.equal(r.town.raids, DORP.startRaids - 1);
  // Anandre spends his last strooptog, then has none: 409
  [st, r] = await d.handle('POST', '/dorp/raid', { ...a, target: b.id });
  assert.equal(st, 200);
  [st, r] = await d.handle('POST', '/dorp/raid', { ...a, target: b.id });
  assert.equal(st, 409);
  // Anandre builds a wall; Anna's next raid (a strooptog she earned) breaks on it
  await d.handle('POST', '/dorp/sync', { ...a, gains: [{ seq: 2, people: 0, raids: 0, walls: 1 }] });
  await d.handle('POST', '/dorp/sync', { ...b, gains: [{ seq: 2, people: 0, raids: 1 }] });
  [st, r] = await d.handle('POST', '/dorp/raid', { ...b, target: a.id });
  assert.equal(r.blocked, true);
  assert.equal(r.took, 0);
  [st, r] = await d.handle('POST', '/dorp/sync', { ...a });
  assert.equal(r.town.walls, 0);
  assert.equal(r.news.at(-1).blocked, true);
  // his Wraak waits for her last raid that took people (a raid a wall stopped is nothing to avenge)
  const owed = r.bure[0].wraak;
  assert.ok(owed && owed !== r.news.at(-1).raidId);
});

test('the phone: reports wait for the server, the first tower of a day builds one wall, the town id stays', async () => {
  const d = createDorp(memStore());
  const backing = new Map();
  const storage = { getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => backing.set(k, String(v)) };
  let up = false;
  const fetchImpl = async (url, init) => {
    if (!up) throw new Error('offline');
    const u = new URL(url);
    if (u.pathname === '/') return { ok: true, status: 200, json: async () => ({ ok: true, dorp: 1 }) };   // (the server's front door)
    const [status, json] = await d.handle(init?.method || 'GET', u.pathname, init?.body ? JSON.parse(init.body) : null);
    return { ok: status < 400, status, json: async () => json };
  };
  const c = createDorpClient({ api: 'http://host', storage, fetchImpl });
  const id = c.id;
  assert.ok(isTownId(id));
  assert.equal(await c.ping(), false);
  assert.deepEqual(c.queue({ people: 30, raids: 1, gold: 1, dayKey: '2026-10-16' }), { seq: 1, people: 30, raids: 1, walls: 1, gold: 1 });
  assert.deepEqual(c.queue({ people: 12, raids: 0, dayKey: '2026-10-16' }), { seq: 2, people: 12, raids: 0, walls: 0, gold: 0 });
  assert.equal(c.queue({ people: 0, raids: 0, dayKey: '2026-10-16' }), null);
  assert.equal((await c.sync({ name: 'Anna' })).ok, false);
  assert.equal(c.view().pending.people, 42);
  up = true;
  assert.equal(await c.ping(), true);
  const r = await c.sync({ name: 'Anna', tribe: 'water' });
  assert.equal(r.town.people, 42);
  assert.equal(c.view().pending.people, 0);
  assert.equal(c.view().last.town.walls, 1);
  // the same phone later: the same town
  const again = createDorpClient({ api: 'http://host', storage, fetchImpl });
  assert.equal(again.id, id);
});

test('the aim: a Perfek on the glowing tower takes half again as many, a wonky tap fewer; golden people go with the raid', async () => {
  assert.equal(raidTake({ people: 100, hit: 'P' }), 18);
  assert.equal(raidTake({ people: 100, hit: 'G' }), 12);
  assert.equal(raidTake({ people: 100, hit: 'S' }), 7);
  assert.equal(cleanHit('X'), 'G');
  assert.equal(goldTake({ gold: 3, people: 100, took: 50, rand: () => 0.4 }), 3);
  assert.equal(goldTake({ gold: 3, people: 100, took: 50, rand: () => 0.6 }), 0);
  assert.equal(goldTake({ gold: 0, people: 100, took: 50 }), 0);
  // through the server: the aim counts, the gold moves (a rand that always catches)
  const d = createDorp(memStore(), { rand: () => 0 });
  const a = town();
  const b = town();
  await d.handle('POST', '/dorp/sync', { ...a, name: 'A', tribe: 'vuur', gains: [{ seq: 1, people: 10, raids: 1 }] });
  await d.handle('POST', '/dorp/sync', { ...b, name: 'B', tribe: 'vuur', gains: [{ seq: 1, people: 100, gold: 2 }] });
  await d.handle('POST', '/dorp/buur', { ...a, buur: b.id });
  const [st, r] = await d.handle('POST', '/dorp/raid', { ...a, target: b.id, hit: 'P' });
  assert.equal(st, 200);
  assert.equal(r.hit, 'P');
  assert.equal(r.took, 18);
  assert.equal(r.goldTook, 2);
  assert.equal(r.town.gold, 2);
  assert.equal(r.them.gold, 0);
});
