// (1.15, the owner: "lets make this point based not percentage based, for example 100 point till bronze 2 200 for bronze 3
// 400 for bronze 4, something like that") ranks shown in points that grow with the tier; the climb underneath unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LADDER, ladderAt, RANK_STEP, RANK_SCALE, shownPoints, shownDelta } from '../js/core/economy.js';

test('1.15 a rank is worth more points higher up: Brons 100, Silwer 150, Goud 200, Platinum 300, Diamant 400, elite 500', () => {
  const need = (id) => shownPoints(LADDER.find((r) => r.id === id), 0).need;
  assert.deepEqual(['brons-1', 'silwer-2', 'goud-3', 'platinum-m', 'diamant-1', 'legende'].map(need), [100, 150, 200, 300, 400, 500]);
  assert.equal(RANK_STEP, 100, 'the climb underneath is unchanged');
  assert.deepEqual(Object.keys(RANK_SCALE), ['brons', 'silwer', 'goud', 'platinum', 'diamant', 'elite']);
});

test('1.15 the points shown: have / need / left, and a match\'s points at the rank it was played from', () => {
  const at = ladderAt(4 * RANK_STEP + 40);   // Silwer I, 40 steps in
  assert.equal(at.id, 'silwer-1');
  assert.deepEqual(shownPoints(at), { have: 60, need: 150, left: 90 });
  assert.equal(shownDelta(20, at), 30, 'a +20 win in Silwer shows +30');
  assert.equal(shownDelta(-15, ladderAt(0)), -15, 'a -15 loss in Brons shows -15');
  assert.deepEqual(shownPoints(ladderAt(0)), { have: 0, need: 100, left: 100 });
});
