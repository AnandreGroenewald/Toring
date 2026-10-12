// (1.13.3) The friend-room invite says the stake first (the owner: the WhatsApp challenge "doesnt show me how much coins
// I want to play for"); without a stake the words stay as they were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S as AF } from '../js/core/strings.js';
import { S_EN as EN } from '../js/core/strings.en.js';

const link = 'https://stapelspel.pages.dev/?kamer=ABC123';

test('a coin invite starts with the stake and the pot, in both languages and both modes', () => {
  for (const mode of ['race', 'turns']) {
    const af = AF.duelRoomText('Anna', link, mode, 100);
    const en = EN.duelRoomText('Anna', link, mode, 100);
    assert.ok(af.startsWith('🪙 100 speelmunte elk, die wenner kry 200! Anna daag jou uit'), af);
    assert.ok(en.startsWith('🪙 100 game coins each, the winner gets 200! Anna challenges you'), en);
    for (const t of [af, en]) assert.ok(t.endsWith(link), t);
  }
  assert.match(AF.duelRoomText('Anna', link, 'turns', 20), /Blok vir Blok/);
  // (1.15) numbers in the house style: a non-breaking space between thousands (js/core/format.js)
  assert.match(EN.duelRoomText('Anna', link, 'race', 500), /the winner gets 1\u00a0000!/);
  assert.match(AF.duelRoomText('Anna', link, 'race', 500), /die wenner kry 1\u00a0000!/);
});

test('an invite without coins reads as before', () => {
  assert.equal(AF.duelRoomText('Anna', link, 'race', 0), `Anna daag jou uit vir ’n Stapel-wedstryd! Kom bou kop aan kop: ${link}`);
  assert.equal(AF.duelRoomText('Anna', link, 'turns'), `Anna daag jou uit vir Blok vir Blok op Stapel! Kom bou saam, om die beurt, aan een toring: ${link}`);
  assert.equal(EN.duelRoomText('Anna', link, 'race', 0), `Anna challenges you to a Stapel match! Come build head-to-head: ${link}`);
});
