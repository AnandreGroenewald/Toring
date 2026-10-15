// (1.15.6) The testers' vote on the three Living Tower ideas: checking a vote, the lobby's store (change, count,
// forget, the cap, deleted after the date) and the routes (site only, rate limit, closed, the owner's list).

import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchLobby } from '../src/match.js';
import { validateVote, cleanReason, VOTE_CLOSE, VOTE_DELETE, VOTERS_MAX, VOTES_PER_HOUR } from '../src/ideas.js';
import { HttpError } from '../src/http.js';
import { ORIGIN, T0, ADMIN, createHarness } from './support/harness.js';

function fakeState() {
  const store = new Map();
  return {
    writes: 0,
    storage: {
      async get(k) { return store.has(k) ? structuredClone(store.get(k)) : undefined; },
      async put(k, v) { this.writes = (this.writes || 0) + 1; store.set(k, structuredClone(v)); },
      async delete(k) { return store.delete(k); },
      async deleteAll() { store.clear(); },
      async setAlarm() {},
    },
    acceptWebSocket() {},
    getWebSockets() { return []; },
    store,
  };
}
const clock = (t = T0) => { const c = { t, now: () => c.t }; return c; };
const voter = (n = 1) => `toetsfoon${String(n).padStart(6, '0')}`;
const vote = (o = {}) => ({ voter: voter(), choice: 2, name: 'Oom Piet', reason: 'Lekker om te bou!', played: [1, 2], ...o });
const code = (fn) => { try { fn(); return null; } catch (e) { return e instanceof HttpError ? `${e.status} ${e.code}` : String(e); } };

test('validateVote: a good vote, and what it refuses', () => {
  assert.deepEqual(validateVote(vote()), { voter: voter(), choice: 2, name: 'Oom Piet', reason: 'Lekker om te bou!', played: [1, 2] });
  assert.equal(code(() => validateVote(vote({ voter: 'kort' }))), '400 invalid_field');
  assert.equal(code(() => validateVote(vote({ voter: 'HOOFLETTERS1234' }))), '400 invalid_field');
  for (const choice of [0, 4, '2', null]) assert.equal(code(() => validateVote(vote({ choice }))), '400 invalid_field');
  assert.equal(code(() => validateVote(vote({ name: '' }))), '400 name_rejected');
  assert.equal(code(() => validateVote(vote({ name: 'x' }))), '400 name_rejected');
  assert.equal(code(() => validateVote(vote({ name: 'fuck' }))), '400 name_rejected');
  assert.equal(code(() => validateVote(null)), '400 invalid_field');
  // played: only 1-3, once each, sorted
  assert.deepEqual(validateVote(vote({ played: [3, 1, 3, 9, 'x'] })).played, [1, 3]);
  assert.deepEqual(validateVote(vote({ played: 'all' })).played, []);
});

test('cleanReason: emoji and brackets go, rude words and contact details are refused, nothing is fine', () => {
  assert.deepEqual(cleanReason('Baie lekker 😂 (veral die haai)!'), { ok: true, value: 'Baie lekker veral die haai !' });
  assert.deepEqual(cleanReason('   '), { ok: true, value: null });
  assert.deepEqual(cleanReason(undefined), { ok: true, value: null });
  assert.deepEqual(cleanReason(42), { ok: true, value: null });
  assert.equal(cleanReason('dit is shit').ok, false);
  assert.equal(cleanReason('bel my 082 123 4567').ok, false);
  assert.equal(cleanReason('a'.repeat(500)).value.length <= 200, true);
  assert.equal(code(() => validateVote(vote({ reason: 'dit is shit' }))), '422 reason_rejected');
});

function lobbyAt(t = T0) {
  const clk = clock(t), state = fakeState();
  const lobby = new MatchLobby(state, {}, { now: clk.now });
  const post = (body) => lobby.fetch(new Request('https://lobby/votes', { method: 'POST', body: JSON.stringify(body) }));
  const list = async () => (await lobby.fetch(new Request('https://lobby/votes/list'))).json();
  return { lobby, clk, state, post, list };
}

test('lobby: a vote, a changed mind, the counts, forgetting one', async () => {
  const L = lobbyAt();
  assert.equal((await L.post({ ...vote(), at: T0 })).status, 200);
  assert.equal((await L.post({ ...vote({ voter: voter(2), name: 'Lize', choice: 1, reason: null }), at: T0 + 1 })).status, 200);
  // the first phone changes its mind: one vote still, marked changed
  assert.equal((await L.post({ ...vote({ choice: 3 }), at: T0 + 5000 })).status, 200);
  let l = await L.list();
  assert.deepEqual(l.counts, { 1: 1, 2: 0, 3: 1 });
  assert.equal(l.total, 2);
  assert.deepEqual(l.votes.map((v) => [v.name, v.choice, v.changed]), [['Lize', 1, 0], ['Oom Piet', 3, 1]]);
  assert.equal(l.votes[1].first, T0);
  assert.equal(JSON.stringify(l).includes(voter()), false, 'the phones\' ids stay inside');
  // malformed: refused
  assert.equal((await L.post({ voter: 'x', choice: 2, name: 'A' })).status, 400);
  assert.equal((await L.lobby.fetch(new Request('https://lobby/votes/whatever'))).status, 404);
  // forget by name (a test vote)
  const f = await (await L.lobby.fetch(new Request('https://lobby/votes/forget', { method: 'POST', body: JSON.stringify({ names: ['Lize'] }) }))).json();
  assert.deepEqual([f.removed, f.left], [1, 1]);
  assert.equal((await L.lobby.fetch(new Request('https://lobby/votes/forget', { method: 'POST', body: '{}' }))).status, 400);
});

test('lobby: at most VOTERS_MAX phones, and every vote is gone after the delete date', async () => {
  const L = lobbyAt();
  const votes = {};
  for (let i = 0; i < VOTERS_MAX; i++) votes[voter(i + 10)] = { name: 'X', choice: 1, reason: '', played: [], at: T0, first: T0, changed: 0 };
  await L.state.storage.put('votes', votes);
  assert.equal((await L.post({ ...vote({ voter: voter(9999) }), at: T0 })).status, 429);
  // an existing phone may still change its mind
  assert.equal((await L.post({ ...vote({ voter: voter(10), choice: 2 }), at: T0 })).status, 200);
  L.clk.t = VOTE_DELETE;
  assert.equal((await L.list()).total, 0);
  assert.equal(L.state.store.has('votes'), false);
  assert.equal((await L.lobby.fetch(new Request('https://lobby/votes/prune', { method: 'POST' }))).status, 200);
});

function harnessWithLobby() {
  const L = lobbyAt();
  const h = createHarness({ MATCH_LOBBY: { idFromName: (n) => n, get: () => L.lobby }, MATCH_ROOM: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response('{}') }) } });
  L.clk.now = () => h.clock.now;
  return { h, L };
}

test('routes: /idees/stem takes a vote from the game\'s pages; the owner reads them at /admin/stemme', async () => {
  const { h } = harnessWithLobby();
  const ok = await h.request('POST', '/idees/stem', { body: vote() });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json, { ok: true, choice: 2 });
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  // a foreign site or a script without Origin: refused
  assert.equal((await h.request('POST', '/idees/stem', { body: vote(), origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.request('POST', '/idees/stem', { body: vote(), origin: null })).status, 403);
  // wrong method, a rude name, a rude reason
  assert.equal((await h.request('GET', '/idees/stem')).status, 405);
  assert.equal((await h.request('POST', '/idees/stem', { body: vote({ voter: voter(3), name: 'fuck' }) })).json.error, 'name_rejected');
  assert.equal((await h.request('POST', '/idees/stem', { body: vote({ voter: voter(4), reason: 'shit idee' }) })).status, 422);
  // the owner's list: only with the token
  assert.equal((await h.admin('GET', '/admin/stemme', undefined, null)).status, 401);
  const list = await h.admin('GET', '/admin/stemme');
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.counts, { 1: 0, 2: 1, 3: 0 });
  assert.equal(list.json.votes[0].name, 'Oom Piet');
  assert.equal(list.json.votes[0].reason, 'Lekker om te bou!');
  // forgetting a test vote
  const f = await h.admin('POST', '/admin/stemme', { names: ['Oom Piet'] });
  assert.deepEqual([f.status, f.json.removed], [200, 1]);
  assert.equal((await h.admin('DELETE', '/admin/stemme')).status, 405);
  // the public match routes can't reach the votes
  assert.equal((await h.request('GET', '/match/votes/list')).status, 404);
});

test('routes: a few votes an hour per address, and none after the vote closes', async () => {
  const { h } = harnessWithLobby();
  for (let i = 0; i < VOTES_PER_HOUR; i++) assert.equal((await h.request('POST', '/idees/stem', { body: vote({ choice: 1 + (i % 3) }) })).status, 200);
  assert.equal((await h.request('POST', '/idees/stem', { body: vote() })).status, 429);
  // another address is fine
  assert.equal((await h.request('POST', '/idees/stem', { body: vote({ voter: voter(7) }), ip: '203.0.113.9' })).status, 200);
  h.clock.now = VOTE_CLOSE;
  assert.equal((await h.request('POST', '/idees/stem', { body: vote({ voter: voter(8) }), ip: '203.0.113.10' })).json.error, 'vote_closed');
});

test('the daily job asks the lobby to prune the votes (and a lobby error stays its own)', async () => {
  const { h, L } = harnessWithLobby();
  let asked = 0;
  const real = L.lobby.fetch.bind(L.lobby);
  L.lobby.fetch = async (req) => { if (new URL(req.url).pathname === '/votes/prune') asked += 1; return real(req); };
  await h.worker.scheduled({}, h.env, null);
  assert.equal(asked, 1);
  L.lobby.fetch = async () => { throw new Error('lobby down'); };
  await h.worker.scheduled({}, h.env, null);
  assert.equal(h.logs.some((l) => l.event === 'votes_prune_failed'), true);
});
