// Coins, power-ups, looks, ranks and seasons (js/core/economy.js) and how the store keeps them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POWERUPS, POWERUP_IDS, COSMETICS, COSMETIC_KINDS, DEFAULT_LOOK, RANKS, EARN, FOUNDATION_FREE_M, BOT_CARD,
  coinsForGame, earnCoins, buyPowerup, usePowerup, buyCosmetic, wearCosmetic, grantRankLooks, defaultEconomy,
  cleanEconomy, cleanCard, cardOf, rankAfterMatch, rolloverSeason, seasonOf, cosmetic,
  LADDER, ladderAt, rankDelta, cleanModeRank, migrateOldRank, rankShortOf, bestTier, RANK_RULES, cardForMode,
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
  // (a broken 1.11 rank migrates to Brons I in both modes)
  for (const m of ['race', 'turns']) assert.deepEqual(e.ranks[m], { season: null, points: 0, best: 'brons-1', played: 0, shield: true });
  const bad = cleanEconomy({ ranks: { race: { points: 'x', best: 'mega', season: '20-1', played: -4, shield: 0 }, turns: null } });
  assert.deepEqual(bad.ranks.race, { season: null, points: 0, best: 'brons-1', played: 0, shield: true });
  assert.deepEqual(bad.ranks.turns, { season: null, points: 0, best: 'brons-1', played: 0, shield: true });
  assert.equal(e.freeFoundation, null);
  assert.deepEqual(cleanEconomy(undefined), defaultEconomy());
});

test('ranks (1.12): a ladder of 23, a rank is 100 points shown as a percentage', () => {
  assert.equal(LADDER.length, 23);
  assert.deepEqual(LADDER.slice(0, 5).map((r) => r.id), ['brons-1', 'brons-2', 'brons-3', 'brons-m', 'silwer-1']);
  assert.deepEqual(LADDER.slice(-3).map((r) => r.id), ['meesterbouer', 'grootmeester', 'legende']);
  assert.deepEqual(RANKS.map((r) => r.id), ['brons', 'silwer', 'goud', 'platinum', 'diamant']);
  for (const r of RANKS) assert.ok(RANK_INFO[r.id]?.name, r.id);
  const g = ladderAt(870);
  assert.deepEqual([g.id, g.pct, g.next.id, g.toNext], ['goud-1', 70, 'goud-2', 30], '"Goud I, 70% till the next level"');
  assert.equal(ladderAt(0).id, 'brons-1');
  assert.equal(ladderAt(99999).id, 'legende');
  assert.equal(ladderAt(99999).next, null);
  assert.equal(rankShortOf('goud-2'), '🥇II');
  assert.equal(rankShortOf('diamant-m'), '💎M');
  assert.equal(rankShortOf('legende'), '👑');
  assert.equal(rankShortOf('nope'), '');
});

test('ranks (1.12): a win +20, a loss -15 against your own rank; more or less against a higher or lower one', () => {
  assert.equal(rankDelta({ won: true, me: 'goud-2', opp: 'goud-2', played: 20 }), 20);
  assert.equal(rankDelta({ won: false, me: 'goud-2', opp: 'goud-2', played: 20 }), -15);
  assert.equal(rankDelta({ won: true, me: 'goud-2', opp: 'platinum-1', played: 20 }), 29, 'Goud II beats Platinum I: +29');
  assert.equal(rankDelta({ won: false, me: 'goud-2', opp: 'silwer-3', played: 20 }), -21, 'Goud II loses to Silwer III: -21');
  assert.equal(rankDelta({ won: true, me: 'brons-1', opp: 'legende', played: 20 }), RANK_RULES.winMax);
  assert.equal(rankDelta({ won: false, me: 'brons-1', opp: 'legende', played: 20 }), -RANK_RULES.lossMin);
  assert.equal(rankDelta({ won: false, me: 'legende', opp: 'brons-1', played: 20 }), -RANK_RULES.lossMax);
  assert.equal(rankDelta({ won: true, me: 'goud-2', opp: null, played: 20 }), 20, 'an unknown opponent counts as your own rank');
  assert.equal(rankDelta({ won: true, me: 'goud-2', opp: 'goud-2', played: 3 }), 30, 'placement: wins count 1.5x');
  assert.equal(rankDelta({ won: false, me: 'goud-2', opp: 'goud-2', played: 3 }), -15, 'losses don\'t');
});

test('ranks (1.12): the shield catches the first loss that would drop a rank; a win brings it back; never below Brons I', () => {
  let r = cleanModeRank({ season: '2026-10', points: 905, played: 20 });
  let m = rankAfterMatch(r, { outcome: 'lost', season: '2026-10' });
  assert.deepEqual([m.shielded, m.rank.points, m.after.id, m.down, m.rank.shield], [true, 900, 'goud-2', false, false], 'stays Goud II at 0%');
  m = rankAfterMatch(m.rank, { outcome: 'lost', season: '2026-10' });
  assert.deepEqual([m.shielded, m.rank.points, m.after.id, m.down], [false, 885, 'goud-1', true], 'then down to Goud I');
  m = rankAfterMatch(m.rank, { outcome: 'won', season: '2026-10' });
  assert.equal(m.rank.shield, true, 'a win brings the shield back');
  assert.equal(m.up, true, 'and back up to Goud II');
  m = rankAfterMatch(cleanModeRank({ season: '2026-10', points: 5, played: 20 }), { outcome: 'lost', season: '2026-10' });
  assert.equal(m.rank.points, 0, 'never below zero');
  assert.equal(m.shielded, false, 'nothing to drop to: no shield used');
  assert.equal(m.rank.shield, true);
  m = rankAfterMatch(cleanModeRank({ season: '2026-10', points: 50 }), { outcome: 'none', season: '2026-10' });
  assert.equal(m.delta, 0, 'no result, no change');
  const up = rankAfterMatch(cleanModeRank({ season: '2026-10', points: 890, played: 20 }), { outcome: 'won', season: '2026-10' });
  assert.deepEqual([up.up, up.after.id, up.rank.best], [true, 'goud-2', 'goud-2']);
  const back = rankAfterMatch(up.rank, { outcome: 'lost', season: '2026-10' });
  assert.equal(back.rank.best, 'goud-2', 'the best of the season stays');
});

test('ranks (1.12): a new month drops every rank one tier and leaves a badge for the best tier', () => {
  let m = rolloverSeason({ season: '2026-10', points: 1050, best: 'goud-3' }, '2026-11');
  assert.deepEqual([m.rank.season, m.rank.points, m.rank.best, m.reward], ['2026-11', 650, 'silwer-3', 's-goud'], 'Goud III -> Silwer III');
  assert.equal(rolloverSeason({ season: '2026-10', points: 300, best: 'brons-m' }, '2026-11').rank.points, 0, 'Brons stays Brons');
  assert.equal(rolloverSeason({ season: '2026-10', points: 2150, best: 'meesterbouer' }, '2026-11').reward, 's-diamant', 'the elite ranks leave the Diamant badge');
  assert.deepEqual(rolloverSeason({ season: null, points: 0 }, '2026-10').rank.season, '2026-10');
  // a clock set back a month changes nothing, and going forward again doesn't drop twice
  const nov = rolloverSeason({ season: '2026-10', points: 1050, best: 'goud-3' }, '2026-11');
  assert.deepEqual(rolloverSeason(nov.rank, '2026-10'), { rank: nov.rank, reward: null });
  assert.deepEqual(rolloverSeason(nov.rank, '2026-11'), { rank: nov.rank, reward: null });
  assert.equal(rolloverSeason({ season: '2026-12', points: 900 }, '2027-01').rank.points, 500, 'December to January is later');
  assert.equal(seasonOf('2026-10-08'), '2026-10');
  assert.equal(seasonOf('nope'), null);
  // rank looks: the season badge, and the Diamant frame once Diamant is reached
  let e = grantRankLooks(defaultEconomy(), 'goud', { badge: 's-goud' });
  assert.ok(e.owned.badge.includes('s-goud'));
  assert.ok(!e.owned.frame.includes('diamant'));
  e = grantRankLooks(e, 'diamant');
  assert.ok(e.owned.frame.includes('diamant'));
});

test('ranks (1.12): a wallet from before keeps its tier, as that tier\'s first rank in both modes', () => {
  const old = { coins: 40, rank: { season: '2026-10', points: 300, best: 'goud' } };   // 1.11: Goud
  const e = cleanEconomy(old);
  assert.equal(e.ranks.race.points, 800);
  assert.equal(ladderAt(e.ranks.turns.points).id, 'goud-1');
  assert.equal(e.ranks.race.played, RANK_RULES.placement, 'not a new player any more');
  assert.equal(migrateOldRank({ points: 0 }).race.played, 0);
  assert.equal(ladderAt(migrateOldRank({ points: 750 }).race.points).id, 'diamant-1');
  assert.equal(bestTier(e), 'goud');
  assert.deepEqual(Object.keys(cleanEconomy(e).ranks), ['race', 'turns'], 'and it stays that way');
});

test('the player card: only known looks travel; the rank in the mode played; Robot Rikus has his own', () => {
  assert.deepEqual(cleanCard({ frame: 'goud', badge: '<script>', title: 'toringkoning', celebration: 'braai', style: 'pet', rank: 'goud', rl: 'goud-3', rk: { race: 'goud-3', turns: 'mega' }, extra: 1 }),
    { frame: 'goud', badge: 'geen', title: 'toringkoning', celebration: 'braai', style: 'pet', rank: 'goud', rl: 'goud-3', rk: { race: 'goud-3', turns: 'goud-3' } });
  assert.deepEqual(cleanCard(null), { ...DEFAULT_LOOK, rank: 'brons', rl: 'brons-1', rk: { race: 'brons-1', turns: 'brons-1' } });
  assert.equal(cleanCard({ rank: 'silwer' }).rl, 'silwer-1', 'a 1.11 card (a tier only): its first rank');
  assert.deepEqual(cleanCard(BOT_CARD), BOT_CARD);
  const e = wearCosmetic(buyCosmetic(earnCoins(defaultEconomy(), 500, { capped: false }).economy, 'badge', 'leeu').economy, 'badge', 'leeu').economy;
  assert.equal(cardOf(e).badge, 'leeu');
  const ranked = { ...e, ranks: { race: { points: 1260 }, turns: { points: 120 } } };
  assert.deepEqual([cardOf(ranked, 'race').rl, cardOf(ranked, 'race').rank], ['platinum-1', 'platinum']);
  assert.equal(cardOf(ranked, 'turns').rl, 'brons-2', 'each mode its own rank');
  assert.deepEqual(cardOf(ranked).rk, { race: 'platinum-1', turns: 'brons-2' }, 'both travel (a friend\'s link learns the mode at the start)');
  const theirs = cardForMode(cardOf(ranked), 'turns');
  assert.deepEqual([theirs.rl, theirs.rank], ['brons-2', 'brons'], 'the opponent\'s game picks the mode played');
});

test('the store keeps the economy: coins, the day cap, the daily free Fondamentblok, duel ranks per mode', () => {
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
  const r = store.recordDuelRank({ outcome: 'won', live: true, mode: 'turns', opp: 'brons-1' });
  assert.deepEqual([r.counted, r.points, r.delta, r.id, r.mode], [true, 30, 30, 'brons-1', 'turns'], 'a placement win');
  const bot = store.recordDuelRank({ outcome: 'won', live: false, mode: 'turns' });
  assert.deepEqual([bot.counted, bot.points, bot.delta], [false, 30, 0], 'Robot Rikus doesn\'t count');
  assert.equal(store.getSeasonRank('race').points, 0, 'Wedloop has its own rank');
  // a fresh store on the same storage sees it all; a new month starts a new season
  t = Date.UTC(2026, 10, 2, 10);
  const again = createStore(backend, { now: () => t });
  assert.equal(again.getEconomy().coins, EARN.dayCap - POWERUPS.shield.price);
  const r2 = again.recordDuelRank({ outcome: 'won', live: true, mode: 'turns', opp: 'brons-1' });
  assert.equal(r2.reward, 's-brons');
  assert.equal(r2.points, 0 + 30, 'Brons I 30% drops a tier to 0, then a placement win');
  assert.ok(again.getEconomy().owned.badge.includes('s-brons'));
  assert.equal(again.getCard('turns').rank, 'brons');
});

test('the season on the Uitdagersreeks screen: a new month rolls over when the screen opens', () => {
  const backend = memoryBackend();
  let t = Date.UTC(2026, 9, 8, 10);
  const store = createStore(backend, { now: () => t });
  let r = store.getSeasonRank('race');
  assert.deepEqual([r.season, r.points, r.id, r.next, r.toNext, r.reward, r.placementLeft], ['2026-10', 0, 'brons-1', 'brons-2', 100, null, RANK_RULES.placement]);
  for (let k = 0; k < 40; k++) store.recordDuelRank({ outcome: 'won', live: true, mode: 'race', opp: 'goud-1' });
  r = store.getSeasonRank('race');
  assert.ok(ladderAt(r.points).index >= 8, `climbed to Goud or more (${r.id})`);
  assert.equal(r.placementLeft, 0);
  const lost = store.recordDuelRank({ outcome: 'lost', live: true, mode: 'race', opp: r.id });
  assert.ok(lost.delta < 0);
  // November, nothing played yet: the screen starts the new season and hands out the badge once
  const before = store.getSeasonRank('race');
  t = Date.UTC(2026, 10, 1, 9);
  r = store.getSeasonRank('race');
  assert.equal(r.season, '2026-11');
  assert.equal(r.points, Math.max(0, before.points - RANK_RULES.seasonDrop));
  assert.ok(r.reward && r.reward.startsWith('s-'));
  assert.equal(store.getSeasonRank('race').reward, null, 'once');
  assert.equal(store.getSeasonRank('turns').season, '2026-11', 'both modes roll over');
});

test('two tabs, one wallet: a purchase starts from the latest coins; an older version can never wipe it', () => {
  const backend = memoryBackend();
  const t = Date.UTC(2026, 9, 8, 10);
  const a = createStore(backend, { now: () => t });
  const b = createStore(backend, { now: () => t });
  a.earnCoins(100, { capped: false });
  assert.equal(b.getEconomy().coins, 100, 'tab B has seen 100');
  a.earnCoins(100, { capped: false });
  a.recordDuelRank({ outcome: 'won', live: true, mode: 'race' });
  assert.ok(b.buyPowerup('slow').ok, 'tab B buys from the 200 tab A left');
  assert.equal(a.getEconomy().coins, 200 - POWERUPS.slow.price);
  assert.equal(a.getEconomy().ranks.race.points, 30, 'and tab A\'s rank points are kept');
  assert.ok(b.buyCosmetic('frame', 'see').ok);
  assert.equal(a.wearCosmetic('frame', 'see').ok, true, 'tab A can wear what tab B bought');
  // a page still on 1.7.9 rewrites the main blob from the keys it knows (no wallet in it)
  a.setSettings({ sound: false });
  const main = JSON.parse(backend.getItem('stapel.v1'));
  assert.equal(main.econ, undefined, 'the wallet is not in the main blob');
  backend.setItem('stapel.v1', JSON.stringify({ ...main, settings: { sound: true } }));
  const c = createStore(backend, { now: () => t });
  assert.equal(c.getEconomy().coins, 200 - POWERUPS.slow.price - 120);
  assert.equal(c.getCard().frame, 'see');
  assert.equal(c.getSettings().sound, true);
  // a broken wallet key starts a fresh wallet; the rest of the game is untouched (1.12: the ranks have a
  // key of their own and stay)
  backend.setItem('stapel.v1.econ', '{nope');
  const d = createStore(backend, { now: () => t });
  const { ranks, ...fresh } = d.getEconomy();
  const { ranks: _r, ...def } = defaultEconomy();
  assert.deepEqual(fresh, def);
  assert.equal(ranks.race.points, 30);
  assert.equal(d.getSettings().sound, true);
});

test('the card on the 1st of a month already shows the new season; a match that starts it says so', () => {
  const backend = memoryBackend();
  let t = Date.UTC(2026, 9, 20, 10);
  const store = createStore(backend, { now: () => t });
  for (let k = 0; k < 80; k++) store.recordDuelRank({ outcome: 'won', live: true, mode: 'race', opp: 'diamant-1' });
  const oct = store.getCard('race');
  assert.ok(['diamant', 'platinum'].includes(oct.rank), oct.rank);
  t = Date.UTC(2026, 10, 1, 9);
  const nov = store.getCard('race');
  assert.ok(LADDER.findIndex((x) => x.id === nov.rl) < LADDER.findIndex((x) => x.id === oct.rl), 'November: a tier down, before anything was played');
  const r = store.recordDuelRank({ outcome: 'won', live: true, mode: 'race', opp: nov.rl });
  assert.ok(r.reward, 'the match that starts November hands out the badge');
  assert.equal(store.recordDuelRank({ outcome: 'won', live: true, mode: 'race', opp: nov.rl }).reward, null);
});

test('ranks (1.12): a page still on 1.11 can\'t wipe them; the top caps; the old season\'s best still earns its badge', () => {
  const backend = memoryBackend();
  const t = Date.UTC(2026, 9, 8, 10);
  const store = createStore(backend, { now: () => t });
  store.recordDuelRank({ outcome: 'won', live: true, mode: 'turns', opp: 'goud-1' });
  const before = store.getSeasonRank('turns').points;
  // a 1.11 page rewrites the wallet with the old single rank (and no ranks)
  const w = JSON.parse(backend.getItem('stapel.v1.econ'));
  delete w.ranks;
  w.rank = { season: '2026-10', points: 0, best: 'brons' };
  backend.setItem('stapel.v1.econ', JSON.stringify(w));
  assert.equal(createStore(backend, { now: () => t }).getSeasonRank('turns').points, before, 'the ranks\' own key wins');
  // the top of the ladder: points stop there
  let r = cleanModeRank({ season: '2026-10', points: 99999, played: 50 });
  assert.equal(r.points, RANK_RULES.maxPoints);
  r = rankAfterMatch(r, { outcome: 'won', season: '2026-10' }).rank;
  assert.equal(r.points, RANK_RULES.maxPoints);
  assert.equal(rankAfterMatch(r, { outcome: 'lost', season: '2026-10' }).after.id, 'legende', 'a loss at the top is felt at once');
  // migration: Silwer points but a Goud best this season: November still hands out the Goud badge
  const m = migrateOldRank({ season: '2026-10', points: 120, best: 'goud' });
  assert.equal(m.race.best, 'goud-1');
  assert.equal(rolloverSeason(m.race, '2026-11').reward, 's-goud');
});
