// Coins, power-ups, looks, ranks and seasons (js/core/economy.js) and how the store keeps them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POWERUPS, POWERUP_IDS, COSMETICS, COSMETIC_KINDS, DEFAULT_LOOK, RANKS, EARN, FOUNDATION_FREE_M, BOT_CARD,
  coinsForGame, earnCoins, buyPowerup, usePowerup, buyCosmetic, wearCosmetic, grantRankLooks, defaultEconomy,
  cleanEconomy, cleanCard, cardOf, rankFor, rankAfterMatch, rolloverSeason, seasonOf, cosmetic,
} from '../js/core/economy.js';
import { createStore, memoryBackend } from '../js/core/storage.js';
import { POWERUP_INFO, COSMETIC_INFO, RANK_INFO } from '../js/core/strings.js';

test('earning: Oefen pays for height and Perfeks; the daily adds a bonus and the streak; duels pay for playing', () => {
  assert.deepEqual(coinsForGame({ mode: 'practice', heightM: 42, perfects: 11 }), {
    coins: 8 + 2, capped: true, parts: [{ id: 'height', coins: 8 }, { id: 'perfects', coins: 2 }],
  });
  const daily = coinsForGame({ mode: 'daily', heightM: 40, perfects: 5, streak: 3 });
  assert.equal(daily.capped, false, 'the daily tower always pays in full');
  assert.deepEqual(daily.parts, [{ id: 'height', coins: 10 }, { id: 'daily', coins: EARN.dailyBonus }, { id: 'streak', coins: 6 }, { id: 'perfects', coins: 1 }]);
  assert.equal(coinsForGame({ mode: 'daily', heightM: 0, streak: 30 }).parts.find((p) => p.id === 'streak').coins, EARN.streakMax);
  assert.equal(coinsForGame({ mode: 'duel', outcome: 'won', live: true }).coins, EARN.duel.liveWin);
  assert.equal(coinsForGame({ mode: 'duel', outcome: 'lost', live: true }).coins, EARN.duel.liveLoss);
  assert.equal(coinsForGame({ mode: 'duel', outcome: 'won', live: false }).coins, EARN.duel.otherWin);
  assert.equal(coinsForGame({ mode: 'duel', outcome: 'lost', live: false, perfects: 50 }).coins, EARN.duel.otherLoss, 'no Perfek coins in a duel');
  assert.deepEqual(coinsForGame(null), { coins: 0, capped: true, parts: [] });
  assert.equal(coinsForGame({ mode: 'practice', heightM: -5, perfects: NaN }).coins, 0);
});

test('the day cap: Oefen and duels earn at most EARN.dayCap coins a day; the daily tower is never capped', () => {
  let e = defaultEconomy();
  let r = earnCoins(e, 100, { dayKey: '2026-10-08' });
  assert.equal(r.added, 100);
  r = earnCoins(r.economy, 100, { dayKey: '2026-10-08' });
  assert.equal(r.added, EARN.dayCap - 100);
  r = earnCoins(r.economy, 25, { capped: false, dayKey: '2026-10-08' });
  assert.equal(r.added, 25, 'the daily tower pays even after the cap');
  r = earnCoins(r.economy, 30, { dayKey: '2026-10-09' });
  assert.equal(r.added, 30, 'a new day, a new cap');
  e = r.economy;
  assert.equal(e.coins, 100 + 50 + 25 + 30);
});

test('power-ups: buy with coins, use from stock; never without the coins or the stock', () => {
  let e = earnCoins(defaultEconomy(), 100, { capped: false }).economy;
  let r = buyPowerup(e, 'foundation');
  assert.ok(r.ok);
  assert.equal(r.economy.coins, 100 - POWERUPS.foundation.price);
  assert.equal(r.economy.stock.foundation, 1);
  r = buyPowerup(r.economy, 'nope');
  assert.equal(r.ok, false);
  r = buyPowerup(r.economy, 'foundation');
  assert.equal(r.economy.stock.foundation, 2);
  r = buyPowerup(r.economy, 'foundation');
  assert.equal(r.ok, false, 'not enough coins left');
  r = usePowerup(r.economy, 'foundation');
  assert.ok(r.ok);
  assert.equal(r.economy.stock.foundation, 1);
  assert.equal(usePowerup(defaultEconomy(), 'shield').ok, false, 'nothing in stock');
  assert.equal(FOUNDATION_FREE_M, 55);
  for (const id of POWERUP_IDS) assert.ok(POWERUP_INFO[id]?.name && POWERUP_INFO[id]?.what, `${id}: name and description`);
});

test('looks: buy and wear; rank looks are never sold; you can only wear what you own', () => {
  let e = earnCoins(defaultEconomy(), 1000, { capped: false }).economy;
  let r = buyCosmetic(e, 'celebration', 'braai');
  assert.ok(r.ok);
  assert.equal(r.economy.coins, 1000 - cosmetic('celebration', 'braai').price);
  assert.equal(buyCosmetic(r.economy, 'celebration', 'braai').ok, false, 'owned already');
  assert.equal(buyCosmetic(r.economy, 'frame', 'diamant').ok, false, 'comes with the Diamant rank');
  assert.equal(buyCosmetic(r.economy, 'badge', 's-goud').ok, false, 'a season badge');
  assert.equal(wearCosmetic(r.economy, 'style', 'kroon').ok, false, 'not owned');
  r = wearCosmetic(r.economy, 'celebration', 'braai');
  assert.ok(r.ok);
  assert.equal(r.economy.look.celebration, 'braai');
  for (const kind of COSMETIC_KINDS) {
    for (const c of COSMETICS[kind]) assert.ok(COSMETIC_INFO[kind]?.[c.id]?.name, `${kind}/${c.id} has a name`);
    assert.ok(cosmetic(kind, DEFAULT_LOOK[kind]), `${kind}: the default exists`);
    assert.equal(cosmetic(kind, DEFAULT_LOOK[kind]).price, 0);
  }
});

test('the stored economy is always valid', () => {
  const junk = { coins: -5, stock: { foundation: 1e9, slow: 'x' }, owned: { frame: ['goud', 'nope'], badge: 5 }, look: { frame: 'goud', title: 'koning' }, rank: { points: -1, best: 'mega', season: 'oops' }, freeFoundation: 'yesterday' };
  const e = cleanEconomy(junk);
  assert.equal(e.coins, 0);
  assert.equal(e.stock.foundation, 99);
  assert.equal(e.stock.slow, 0);
  assert.deepEqual(e.owned.frame, ['hout', 'goud']);
  assert.deepEqual(e.owned.badge, ['geen']);
  assert.equal(e.look.frame, 'goud');
  assert.equal(e.look.title, 'bouer');
  assert.deepEqual(e.rank, { season: null, points: 0, best: 'brons' });
  assert.equal(e.freeFoundation, null);
  assert.deepEqual(cleanEconomy(undefined), defaultEconomy());
});

test('ranks: Brons to Diamant by points; duels move them; a season halves them and leaves a badge', () => {
  assert.deepEqual(RANKS.map((r) => r.id), ['brons', 'silwer', 'goud', 'platinum', 'diamant']);
  assert.equal(rankFor(0).id, 'brons');
  assert.equal(rankFor(99).toNext, 1);
  assert.equal(rankFor(100).id, 'silwer');
  assert.equal(rankFor(9999).id, 'diamant');
  assert.equal(rankFor(9999).next, null);
  for (const r of RANKS) assert.ok(RANK_INFO[r.id]?.name, r.id);
  let rank = { season: '2026-10', points: 90, best: 'brons' };
  let m = rankAfterMatch(rank, { outcome: 'won', live: true, season: '2026-10' });
  assert.equal(m.delta, 25);
  assert.equal(m.rank.best, 'silwer');
  assert.equal(m.up, true);
  m = rankAfterMatch(m.rank, { outcome: 'lost', live: true, season: '2026-10' });
  assert.equal(m.delta, -10);
  assert.equal(m.rank.best, 'silwer', 'the best rank of the season stays');
  m = rankAfterMatch({ season: '2026-10', points: 3, best: 'brons' }, { outcome: 'lost', live: false, season: '2026-10' });
  assert.equal(m.rank.points, 0, 'never below zero');
  assert.equal(m.delta, -3);
  // November: the October points halve and October leaves its badge
  m = rankAfterMatch({ season: '2026-10', points: 300, best: 'goud' }, { outcome: 'won', live: false, season: '2026-11' });
  assert.equal(m.reward, 's-goud');
  assert.equal(m.rank.season, '2026-11');
  assert.equal(m.rank.points, 150 + 10);
  assert.deepEqual(rolloverSeason({ season: null, points: 0 }, '2026-10'), { rank: { season: '2026-10', points: 0, best: 'brons' }, reward: null });
  assert.equal(seasonOf('2026-10-08'), '2026-10');
  assert.equal(seasonOf('nope'), null);
  // rank looks: the season badge, and the Diamant frame once Diamant is reached
  let e = grantRankLooks(defaultEconomy(), 'goud', { badge: 's-goud' });
  assert.ok(e.owned.badge.includes('s-goud'));
  assert.ok(!e.owned.frame.includes('diamant'));
  e = grantRankLooks(e, 'diamant');
  assert.ok(e.owned.frame.includes('diamant'));
});

test('the player card: only known looks travel; Robot Rikus has his own', () => {
  assert.deepEqual(cleanCard({ frame: 'goud', badge: '<script>', title: 'toringkoning', celebration: 'braai', style: 'pet', rank: 'goud', extra: 1 }),
    { frame: 'goud', badge: 'geen', title: 'toringkoning', celebration: 'braai', style: 'pet', rank: 'goud' });
  assert.deepEqual(cleanCard(null), { ...DEFAULT_LOOK, rank: 'brons' });
  assert.deepEqual(cleanCard(BOT_CARD), BOT_CARD);
  const e = wearCosmetic(buyCosmetic(earnCoins(defaultEconomy(), 500, { capped: false }).economy, 'badge', 'leeu').economy, 'badge', 'leeu').economy;
  assert.equal(cardOf(e).badge, 'leeu');
  assert.equal(cardOf({ ...e, rank: { points: 260 } }).rank, 'goud');
});

test('the store keeps the economy: coins, the day cap, the daily free Fondamentblok, duel ranks', () => {
  const backend = memoryBackend();
  let t = Date.UTC(2026, 9, 8, 10);
  const store = createStore(backend, { now: () => t });
  assert.equal(store.getEconomy().coins, 0);
  assert.deepEqual(store.earnCoins(120), { added: 120, coins: 120 });
  assert.deepEqual(store.earnCoins(100), { added: EARN.dayCap - 120, coins: EARN.dayCap });
  assert.ok(store.buyPowerup('shield').ok);
  assert.equal(store.getEconomy().stock.shield, 1);
  assert.ok(store.usePowerup('shield').ok);
  assert.equal(store.usePowerup('shield').ok, false);
  assert.equal(store.takeFreeFoundation('2026-10-08'), true);
  assert.equal(store.takeFreeFoundation('2026-10-08'), false, 'once per daily');
  const r = store.recordDuelRank({ outcome: 'won', live: true });
  assert.deepEqual([r.points, r.delta, r.rank], [25, 25, 'brons']);
  // a fresh store on the same storage sees it all; a new month starts a new season
  t = Date.UTC(2026, 10, 2, 10);
  const again = createStore(backend, { now: () => t });
  assert.equal(again.getEconomy().coins, EARN.dayCap - POWERUPS.shield.price);
  const r2 = again.recordDuelRank({ outcome: 'won', live: false });
  assert.equal(r2.reward, 's-brons');
  assert.equal(r2.points, Math.floor(25 / 2) + 10);
  assert.ok(again.getEconomy().owned.badge.includes('s-brons'));
  assert.equal(again.getCard().rank, 'brons');
});

test('the season on the Uitdagersreeks screen: a new month rolls over when the screen opens', () => {
  const backend = memoryBackend();
  let t = Date.UTC(2026, 9, 8, 10);
  const store = createStore(backend, { now: () => t });
  let r = store.getSeasonRank();
  assert.deepEqual([r.season, r.points, r.rank, r.next, r.toNext, r.reward], ['2026-10', 0, 'brons', 'silwer', 100, null]);
  for (let k = 0; k < 11; k++) store.recordDuelRank({ outcome: 'won', live: true });   // 275 points: Goud
  r = store.getSeasonRank();
  assert.deepEqual([r.points, r.rank, r.min, r.next, r.nextMin, r.toNext, r.best], [275, 'goud', 250, 'platinum', 450, 175, 'goud']);
  // a loss takes points; the results card shows the rank you are in now
  const lost = store.recordDuelRank({ outcome: 'lost', live: true });
  assert.deepEqual([lost.points, lost.rank], [265, 'goud']);
  for (let k = 0; k < 2; k++) store.recordDuelRank({ outcome: 'lost', live: true });
  assert.equal(store.recordDuelRank({ outcome: 'lost', live: true }).rank, 'silwer', 'down to Silwer by points');
  assert.equal(store.getSeasonRank().best, 'goud', 'the best of the season stays');
  // November, nothing played yet: the screen starts the new season and hands out the Goud badge once
  t = Date.UTC(2026, 10, 1, 9);
  r = store.getSeasonRank();
  assert.deepEqual([r.season, r.points, r.reward], ['2026-11', Math.floor(235 / 2), 's-goud']);
  assert.deepEqual(r.badges, ['s-goud']);
  assert.equal(store.getSeasonRank().reward, null, 'once');
  assert.equal(store.getCard().rank, 'silwer');
});
