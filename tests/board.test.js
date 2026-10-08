// The daily leaderboard on the device (js/board.js) and the player's number in the store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBoard, postBoard, getBoard } from '../js/board.js';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { defaultNicknameFor, cleanNickname } from '../js/core/duel.js';

const API = 'https://borge.example/';
const daily = { mode: 'daily', dateKey: '2026-10-08', dayNumber: 3, heightM: 37.46, blocksDropped: 20, durationMs: 90321 };
const answer = { players: 3, top: [{ rank: 1, name: 'Anna', heightM: 45, you: false }, { rank: 2, name: 'Bennie', heightM: 37.5, you: true }], you: { rank: 2, heightM: 37.5, hidden: false } };

function fakeFetch(reply, seen = []) {
  return async (url, init) => {
    seen.push({ url, init });
    return { ok: true, text: async () => JSON.stringify(reply) };
  };
}

test('the server answer is checked: odd fields dropped, names cut, junk refused', () => {
  assert.deepEqual(cleanBoard(answer), answer);
  assert.equal(cleanBoard(null), null);
  assert.equal(cleanBoard({ players: 'x', top: [] }), null);
  const odd = cleanBoard({ players: 2, top: [{ rank: 1, name: 'A'.repeat(80), heightM: -4 }, { name: 'no rank' }], you: { rank: 'x' } });
  assert.equal(odd.top.length, 1);
  assert.equal(odd.top[0].name.length, 24);
  assert.equal(odd.top[0].heightM, 0);
  assert.equal(odd.you, null);
});

test('posting a daily: the right fields, as plain text (no preflight); practice and empty games are not posted', async () => {
  const seen = [];
  const board = await postBoard({ apiUrl: API, result: daily, player: 'abcdefghijklmnop', name: 'Bennie', hidden: true, fetchImpl: fakeFetch(answer, seen) });
  assert.deepEqual(board, answer);
  assert.equal(seen[0].url, 'https://borge.example/board');
  assert.equal(seen[0].init.method, 'POST');
  assert.match(seen[0].init.headers['Content-Type'], /^text\/plain/);
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    dateKey: '2026-10-08', dayNumber: 3, player: 'abcdefghijklmnop', name: 'Bennie', heightM: 37.5, blocks: 20, durationMs: 90321, hidden: true,
  });
  const none = [];
  assert.equal(await postBoard({ apiUrl: API, result: { ...daily, mode: 'practice' }, player: 'abcdefghijklmnop', fetchImpl: fakeFetch(answer, none) }), null);
  assert.equal(await postBoard({ apiUrl: API, result: { ...daily, blocksDropped: 0 }, player: 'abcdefghijklmnop', fetchImpl: fakeFetch(answer, none) }), null);
  assert.equal(await postBoard({ apiUrl: '', result: daily, player: 'abcdefghijklmnop', fetchImpl: fakeFetch(answer, none) }), null);
  assert.equal(none.length, 0);
});

test('reading the board: with or without the player; offline is null', async () => {
  const seen = [];
  await getBoard({ apiUrl: API, dateKey: '2026-10-08', player: 'abcdefghijklmnop', fetchImpl: fakeFetch(answer, seen) });
  await getBoard({ apiUrl: API, dateKey: '2026-10-08', fetchImpl: fakeFetch(answer, seen) });
  assert.equal(seen[0].url, 'https://borge.example/board?dateKey=2026-10-08&player=abcdefghijklmnop');
  assert.equal(seen[1].url, 'https://borge.example/board?dateKey=2026-10-08');
  const offline = async () => { throw new Error('offline'); };
  assert.equal(await getBoard({ apiUrl: API, dateKey: '2026-10-08', fetchImpl: offline }), null);
  assert.equal(await getBoard({ apiUrl: API, dateKey: 'nope', fetchImpl: fakeFetch(answer) }), null);
});

test('the store: one random player number per phone, kept apart; hiding and the posted day remembered', () => {
  const backend = memoryBackend();
  const store = createStore(backend);
  const id = store.getBoardPlayer();
  assert.match(id, /^[a-z0-9]{16}$/);
  assert.equal(store.getBoardPlayer(), id, 'the same number every time');
  assert.equal(createStore(backend).getBoardPlayer(), id, 'and after a restart');
  assert.notEqual(createStore(memoryBackend()).getBoardPlayer(), id, 'another phone, another number');
  assert.equal(store.getBoardHidden(), false);
  store.setBoardHidden(true);
  assert.equal(createStore(backend).getBoardHidden(), true);
  assert.equal(store.getBoardPosted(), null);
  store.setBoardPosted('2026-10-08');
  store.setBoardPosted('nope');
  assert.equal(store.getBoardPosted(), '2026-10-08');
  // a name or hiding change the server hasn't confirmed waits, also over a restart
  assert.equal(store.getBoardPending(), false);
  store.setBoardPending(true);
  assert.equal(createStore(backend).getBoardPending(), true);
  assert.equal(createStore(backend).getBoardHidden(), true, 'the other fields stay');
  store.setBoardPending(false);
  assert.equal(store.getBoardPending(), false);
  assert.ok(backend.getItem('stapel.v1.board'), 'its own key');
  // an older version rewriting the main blob leaves it alone
  backend.setItem('stapel.v1', JSON.stringify({ v: 1 }));
  assert.equal(createStore(backend).getBoardPlayer(), id);
});

test('without a nickname of their own a player is "Bouer 123", the same every visit', () => {
  const a = defaultNicknameFor('abcdefghijklmnop');
  assert.match(a, /^Bouer \d{3}$/);
  assert.equal(defaultNicknameFor('abcdefghijklmnop'), a, 'the same number, the same name');
  assert.equal(cleanNickname(a), a, 'it passes the name rules');
  const names = new Set(['0000001234567890', 'zzzzzz1234567890', 'k3j9x0aaaaaaaaaa', 'q8w7e6r5t4y3u2i1'].map(defaultNicknameFor));
  assert.ok(names.size >= 3, 'other phones mostly get other numbers');
  assert.match(defaultNicknameFor(null), /^Bouer \d{3}$/, 'no number yet: still a name');
});
