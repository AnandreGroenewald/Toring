// Stapel — boot + wiring: Phaser game, storage, DOM UI, audio, bus events,
// pause/visibility, settings, service worker and debug hooks.
// First of all: the language, before any other module reads a string (js/core/langboot.js).
import { SAVED_LANG, PREVIEW_LANG } from './core/langboot.js';
import { GAME_W, computeGameHeight, SITE_URL_FALLBACK, STORAGE_KEY, DUEL, TESTER_GIFT, REFILL, AUTH, VERSION } from './config.js';
import { bus } from './core/bus.js';
import { S, POWERUP_INFO, COSMETIC_INFO, RANK_INFO } from './core/strings.js';
import { fmtDateKey, fmtM, fmtInt } from './core/format.js';
import { createStore } from './core/storage.js';
import { dateKeyFor, dayNumber, seedFor, nextDayTimestamp, parseDebugDate, isDateKey, addDays, daysBetween } from './core/daily.js';
import { createSequence } from './core/sequence.js';
import { buildShareText, buildDuelShareText } from './core/share.js';
import { parseChallengeQuery, parseRoomQuery, defaultNicknameFor } from './core/duel.js';
import { coinsForGame, cosmetic, POWERUP_IDS, rankShortOf, SKINS } from './core/economy.js';
import { weekView, WEEK } from './core/week.js';

const WEEK_COINS = WEEK.coins;
import { createDuel } from './duel.js';
import { loadChallenge, shareUrlFor } from './core/challenge.js';
import { buildSkyline, SKYLINE_DAYS } from './core/skyline.js';
import { tomorrowTeaser } from './core/teaser.js';
import { initInstall, installMode, promptInstall, dismissInstall, onInstallChange } from './core/install.js';
import { normalizeFeed, pickPremium } from './core/sponsors.js';
import { buildStatsBatch, percentileLine } from './core/audience.js';
import { tutorialDone } from './core/coach.js';
import { loadSponsors } from './sponsorsFeed.js';
import { sendStats, dailyPercentile, sendShareCount, request as apiRequest, base as apiBase } from './audience.js';
import { postBoard, getBoard } from './board.js';
import { createAccount } from './account.js';
import { SPONSOR_API_URL, salesEnabled, matchApiUrl } from './sponsorConfig.js';
import { createUI } from './ui/dom.js';
import { getLanguage, isLang } from './core/i18n.js';
import { audio, haptics } from './audio.js';
import { BgScene } from './scenes/BgScene.js';
import { GameScene } from './scenes/GameScene.js';
import { HudScene } from './scenes/HudScene.js';
import { setBlockSkin } from './game/blocks.js';
import { setCraneSkin } from './game/crane.js';

// ---------------------------------------------------------------------------
// Query params. The test helpers (?date, ?seed, ?auto) only work together with
// ?debug=1, and a debug session keeps its own storage: it can never touch the
// real daily, streak or stats, and nobody can autoplay a daily they share.
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
// the address as opened (challenge links are taken off it below): a new player who picks English
// starts again in English with the same link
const BOOT_URL = location.pathname + location.search + location.hash;
const DEBUG = params.get('debug') === '1';
// The Android app (Capacitor, app/): the game files ship inside it, so no service worker there.
const IN_APP = !!globalThis.Capacitor?.isNativePlatform?.();
const NO_SW = params.has('nosw') || DEBUG || IN_APP;
const DEBUG_DATE = DEBUG ? parseDebugDate(location.search) : null;
const SEED_OVERRIDE = DEBUG ? params.get('seed') : null;
const AUTO = DEBUG && params.has('auto') ? Math.min(1, Math.max(0.0001, Number(params.get('auto')) || 0)) : 0;
// ?debug=1&visitor=monkey|clown|thief: that visitor comes as soon as there is a little tower
const FORCE_VISITOR = DEBUG ? params.get('visitor') : null;

const HEARTBEAT_MS = 4000;     // a running daily says "still here" this often...
const STALE_MS = 15000;        // ...and another tab takes it over only after this long
// (1.12.1) the Android app has one game only: a tower 'being played' by another page there is the app's own, from
// before it was closed, so it counts as it stood at once (the website waits STALE_MS for a real second tab)
const STALE_AFTER_MS = IN_APP ? 0 : STALE_MS;
const RESULTS_SLEEP_MS = 1500; // results/pause: stop rendering the (static) game behind the card
const MENU_SLEEP_MS = 45000;   // menu left alone: let the attract tower rest

const randomSeed = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const todayKey = () => DEBUG_DATE || dateKeyFor();

// Friend challenge from a shared link (?klop=<dm>&d=<date>): only valid for today's date; kept for this tab in sessionStorage.
let challengeRaw = loadChallenge(location.search, todayKey());
/** The friend's challenge while it is still today's date (it lapses at midnight), else null. */
const activeChallenge = () => (challengeRaw && challengeRaw.dateKey === todayKey() ? challengeRaw : null);

// "Sit Stapel op jou tuisskerm": keep the browser's install prompt for the results screen.
initInstall();

/** Per-tab id (survives a reload of this tab, not a new tab): tells "my game" from another tab's. */
const TAB_ID = (() => {
  const make = () => Math.random().toString(36).slice(2, 10);
  try {
    let id = sessionStorage.getItem('stapel.tab');
    if (!id) {
      id = make();
      sessionStorage.setItem('stapel.tab', id);
    }
    return id;
  } catch {
    return make();
  }
})();

function siteUrl() {
  // links shared from a file:// copy, the app (https://localhost) or a home-screen copy of the old
  // address (js/moved.js leaves those there) point at the website
  if (location.protocol === 'file:' || IN_APP || location.hostname === 'anandregroenewald.github.io') return SITE_URL_FALLBACK;
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

/** The local midnight that ends `dateKey` (the attempt's day, not "today": games can cross midnight). */
function nextDayFor(dateKey) {
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  if (!y || !m || !d) return nextDayTimestamp();
  return nextDayTimestamp(new Date(y, m - 1, d, 12));
}

// ---------------------------------------------------------------------------
// Store, settings, UI
// ---------------------------------------------------------------------------
const store = createStore(undefined, DEBUG ? { key: `${STORAGE_KEY}.debug` } : {});
let settings = store.getSettings();
// Afrikaans or English (1.9). Someone who played before there was a choice stays in Afrikaans; a new
// player is asked once (onReady), unless a ?lang= link already said which.
let askLanguage = false;
if (!SAVED_LANG) {
  if (store.hasPlayed()) store.setLang('af');
  else if (PREVIEW_LANG) store.setLang(PREVIEW_LANG);
  else askLanguage = true;
}
audio.setEnabled(settings.sound);
haptics.setEnabled(settings.vibration);

const ui = createUI(bus);
ui.setLoading(true);

const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
window.addEventListener('keydown', unlock, { capture: true, passive: true });

// ---------------------------------------------------------------------------
// Phaser
// ---------------------------------------------------------------------------
// A phone opened sideways still gets a portrait game (the rotate overlay shows meanwhile).
const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const gameHeight = coarse
  ? computeGameHeight(Math.min(innerWidth, innerHeight), Math.max(innerWidth, innerHeight))
  : computeGameHeight();

// (1.13.4) the tower's skins the player wears, before the first crane and blocks are drawn (BgScene reads 'bgSkin')
{
  const w = store.getSkins().wear;
  setCraneSkin(w.crane);
  setBlockSkin(w.blocks);
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: gameHeight,
  backgroundColor: '#8fd3f4',
  banner: false,
  disableContextMenu: true,
  input: { activePointers: 2 },
  // No MSAA (sprites only need texture filtering) and no FX pipelines (unused):
  // that is ~200 MB of GPU memory a phone never has to find.
  render: { antialias: true, antialiasGL: false, powerPreference: 'default' },
  disablePreFX: true,
  disablePostFX: true,
  // Raw frame times: Phaser's smoothing would run the game in slow motion for
  // seconds after every app switch on a 30 Hz phone. GameScene clamps big steps itself.
  fps: { smoothStep: false },
  audio: { noAudio: true },   // all sound is js/audio.js; Phaser's own manager would open a 2nd AudioContext
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BgScene, GameScene, HudScene],
});

window.__stapel = Object.assign(window.__stapel || {}, { game, bus, store, ui, audio });
game.registry.set('bgSkin', store.getSkins().wear.scene);

/** Jou Stapelstad: the last 30 days of finished dailies (the background draws it once into a texture). */
const skylineFor = (dateKey) => buildSkyline(dateKey, store.getDailyHeights(dateKey, SKYLINE_DAYS), SKYLINE_DAYS);
function pushSkyline(dateKey = todayKey()) {
  try {
    game.registry.set('skyline', skylineFor(dateKey));
  } catch {
    // the skyline is decoration only
  }
}
pushSkyline();

// What the player is doing right now.
const run = {
  mode: 'idle',       // 'idle' | 'daily' | 'practice'
  dateKey: null,
  dayNumber: null,
  over: false,
  paused: false,
  started: false,     // first block dropped
  final: null,        // { result, stats, isNewBest, aborted } once the game has ended
};
let screen = 'menu';   // 'menu' | 'game' | 'pause' | 'results'
const seqCache = new Map();

// ---------------------------------------------------------------------------
// Sponsors: the feed loads in the background and never holds up the game. Until
// it arrives (or offline without a cache) the game simply runs without names.
// ---------------------------------------------------------------------------
let sponsorFeed = normalizeFeed(null, null);

function billboardFor(dateKey) {
  let premium = null;
  try {
    premium = pickPremium(sponsorFeed.premium, dateKey || todayKey());
  } catch {
    premium = null;
  }
  return { premium, salesOn: salesEnabled() };
}

function onSponsorFeed(feed) {
  if (!feed || typeof feed !== 'object') return;
  sponsorFeed = feed;
  if (ui.setMenuAd) ui.setMenuAd(menuAd());
  if (screen === 'menu') requestAnimationFrame(updateMenuAnchor);   // the card may have moved
  const gs = gameScene();
  if (gs && gs.idle && gs.setSponsors) gs.setSponsors(feed, billboardFor(todayKey()));
}

// ---------------------------------------------------------------------------
// Anonymous audience counts and the daily percentile (js/audience.js). Only with a Worker
// (MATCH_API_URL, or SPONSOR_API_URL); a debug session stays out of the real numbers unless ?audience=1.
// ---------------------------------------------------------------------------
const AUDIENCE_ON = !!matchApiUrl() && (!DEBUG || params.get('audience') === '1');
let menuCounted = false;   // the menu card is reported with the first game of a visit only

bus.on('game:audience', (a) => {
  if (!AUDIENCE_ON || !a || !(a.blocksDropped > 0)) return;
  try {
    const batch = buildStatsBatch({
      dateKey: a.dateKey || todayKey(),
      mode: a.mode,
      tally: a.tally,
      billboardId: a.billboardId,
      menu: !menuCounted && !!sponsorFeed.house?.menu,
    });
    if (batch && sendStats(matchApiUrl(), batch) && batch.menu) menuCounted = true;
  } catch {
    /* counting never gets in the way of the game */
  }
});

// The daily leaderboard (js/board.js): with the match server. A debug session stays off the real board
// (its autoplay and ?date= would post); ?board=1 lets a test on this computer use a local server.
const LOCAL_PAGE = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const BOARD_ON = !!matchApiUrl() && (!DEBUG || (params.get('board') === '1' && LOCAL_PAGE));

// (1.13) Sign in with Google: the saved progress (js/account.js). Off until js/config.js has Google's client
// ID. A debug session uses it only on this computer, with ?cloud=1 (and ?gcid= a test client ID): never the
// real accounts. A sync never runs while a tower is being built; it waits for the tower to end.
const ACCOUNT_ON = !DEBUG || (params.get('cloud') === '1' && LOCAL_PAGE);
const account = createAccount({
  store,
  bus,
  apiUrl: ACCOUNT_ON ? matchApiUrl() : '',
  clientId: DEBUG && params.get('gcid') ? params.get('gcid') : AUTH.googleClientId,
  storageKey: DEBUG ? `${STORAGE_KEY}.debug` : STORAGE_KEY,
  today: todayKey,
  canApply: () => screen !== 'game' && screen !== 'pause',
});
// (1.14, the owner: "people skipped the payment section due to login, people want it as simple as possible")
// Sign-in is never a gate: everything works as a guest. It shows only once the server says it is open
// (GET /daily/config `signin`), or for a device already signed in; a test page with ?cloud=1 has it open.
let signinOpen = ACCOUNT_ON && DEBUG && params.get('signin') !== '0';   // (a test page: ?signin=0 = the server not open yet)
/** The account's status for the screens: `on` only where sign-in can work right now. */
function accountStatus() {
  const a = account.status();
  return { ...a, on: a.on && (signinOpen || a.signedIn || a.out) };
}
ui.setAccount(accountStatus());
if (DEBUG) window.__stapel.account = account;

// (1.14) one gentle offer, at a good moment (a new best on the results, or just after a purchase in the Winkel):
// "Bêre jou vordering met Google · een tik", at most once every SIGNIN_OFFER_DAYS (shown or waved away)
const SIGNIN_OFFER_DAYS = 60;
const signinOfferKey = `${DEBUG ? `${STORAGE_KEY}.debug` : STORAGE_KEY}.signoffer`;
function signinOfferDue() {
  const a = accountStatus();
  if (!a.on || a.signedIn || a.out) return false;
  try {
    const last = JSON.parse(localStorage.getItem(signinOfferKey) || 'null')?.at;
    return !isDateKey(last) || daysBetween(last, todayKey()) >= SIGNIN_OFFER_DAYS;
  } catch {
    return false;   // (no storage: never nag)
  }
}
function signinOfferShown() {
  try {
    localStorage.setItem(signinOfferKey, JSON.stringify({ at: todayKey() }));
  } catch {
    // private mode: it may come again next visit, still at most once a visit
  }
}
let signinOfferVisit = false;   // once a visit at most, whatever storage says
function takeSigninOffer() {
  if (signinOfferVisit || !signinOfferDue()) return false;
  signinOfferVisit = true;
  signinOfferShown();
  return true;
}
bus.on('ui:signin-offer-no', () => ui.hideSigninOffer());

bus.on('account:changed', ({ why } = {}) => {
  ui.setAccount(accountStatus());
  if (account.status().signedIn) ui.hideSigninOffer();
  // the account brought progress here (or this device started over): the menu shows it at once
  if ((why === 'merged' || why === 'signed-out' || why === 'deleted') && screen === 'menu') showMenu();
});
function signedIn(err, out) {
  if (!err) {
    ui.setAccountNote(null);
    // signed in, but the first save hasn't gone through yet (no internet): it goes as soon as it can
    ui.toast(out === 'saved' || out === 'same' ? S.accountWelcome : S.accountWelcomeLater, 2800);
    if (screen === 'menu') showMenu();
    return;
  }
  const note = err.message === 'canceled' ? null : err.message === 'out' ? S.accountOut : S.accountErr(err.message);
  ui.setAccountNote(note);
  // (1.14) from the gentle offer (no sheet open): a cancel shows nothing, a failure a small toast; the game goes on
  if (note && !ui.accountSheetOpen()) ui.toast(S.signinOfferFail, 2600);
}
bus.on('ui:account', () => {
  ui.showAccount(accountStatus());
  account.wake();
});
// the website: Google's own button in the sheet
bus.on('ui:account-slot', (slot) => {
  account.renderButton(slot, { lang: getLanguage(), onDone: signedIn }).catch(() => ui.setAccountNote(S.accountErr('offline')));
});
// the app: the phone's own Google sign-in
bus.on('ui:account-native', () => {
  ui.setAccountNote(null, { working: true });
  account.signInNative().then((out) => signedIn(null, out), signedIn);
});
bus.on('ui:account-signout', () => {
  ui.setAccountNote(null, { working: true });
  // (1.14) signing out keeps everything on this device; Instellings stays open, its account part shows the sign-in again
  account.signOut().then(() => {
    ui.showAccount(accountStatus());
    ui.toast(S.accountBye, 3000);
  }, (err) => ui.setAccountNote(err.message === 'out' ? S.accountOut : S.accountErr(err.message)));
});
bus.on('ui:account-delete', () => {
  ui.setAccountNote(null, { working: true });
  account.deleteAccount().then(() => {
    ui.showAccount(accountStatus());
    ui.toast(S.accountDeleted, 3000);
  }, (err) => ui.setAccountNote(err.message === 'out' ? S.accountOut : S.accountErr(err.message)));
});
ui.setBoardOn(BOARD_ON);
const BOARD_FRESH_MS = 60 * 1000;   // an answer this recent is shown again without asking the server
let boardLast = null;   // { dateKey, board, at }: the last answer, so the sheet opens on it at once
let boardDate = null;   // the day the Ranglys sheet shows
let boardBusy = Promise.resolve();   // board requests go one after the other, each with the latest choice
let boardChanges = 0;   // name or hiding changes this visit (one made while a post is out stays pending)
let boardSaving = 0;    // changes on their way to the server

/** A day's finished daily, as the board takes it (null when that day has none). */
function boardResult(dateKey) {
  const best = store.getDailyBest(dateKey);   // (1.12) the better of two tries, `retried` when there were two
  return best ? { ...best, mode: 'daily', dateKey, retry: best.retried === true } : null;
}

/**
 * One board request for a day, queued behind any other. The day's result is posted when it hasn't
 * reached the server yet, or a name or hiding change hasn't (the server keeps the first height and
 * takes the rest); otherwise the board is only read. Resolves with the answer, or null.
 */
function syncBoard(dateKey) {
  const task = async () => {
    const player = store.getBoardPlayer();
    const result = boardResult(dateKey);
    const posted = store.getBoardPosted() === dateKey;
    let board;
    if (result && (!posted || store.getBoardPending())) {
      const sent = boardChanges;
      board = await postBoard({ apiUrl: matchApiUrl(), result, player, name: duelNick(), hidden: store.getBoardHidden() });
      if (board?.you) {
        store.setBoardPosted(dateKey);
        if (boardChanges === sent) store.setBoardPending(false);
      }
    } else {
      board = await getBoard({ apiUrl: matchApiUrl(), dateKey, player });
    }
    if (board) boardLast = { dateKey, board, at: Date.now() };
    return board;
  };
  const run = boardBusy.then(task, task);
  boardBusy = run.catch(() => null);
  return run.catch(() => null);
}

/** Is the last answer for this day recent, with nothing left to send? */
function boardFresh(dateKey) {
  return boardLast?.dateKey === dateKey && Date.now() - boardLast.at < BOARD_FRESH_MS && !store.getBoardPending();
}

/**
 * A daily's results: its result goes on the leaderboard (the first time), and the card then shows
 * "Jy is #23 van 140 vandag".
 */
function showBoardPlace(result) {
  if (!BOARD_ON || !result || result.mode !== 'daily' || !result.dateKey) return;
  const dateKey = result.dateKey;
  const job = boardFresh(dateKey) ? Promise.resolve(boardLast.board) : syncBoard(dateKey);
  job.then((board) => {
    if (board && screen === 'results') ui.setResultsBoard(dateKey, board);
  });
}

/** The Ranglys sheet as it stands: the last answer for its day, the player's choice, and any change on its way. */
function renderBoard({ loading = false, refresh = true } = {}) {
  if (!boardDate) return;
  const last = boardLast?.dateKey === boardDate ? boardLast.board : null;
  const mine = store.getBoardPosted() === boardDate;
  ui.showBoard({
    board: last,
    loading: loading && !last,
    name: duelNick(),
    hidden: store.getBoardHidden(),
    tester: !!store.getTester(),
    state: boardSaving > 0 ? 'saving' : mine && store.getBoardPending() ? 'retry' : null,
    title: boardDate === todayKey() ? S.boardTitle : boardDate === addDays(todayKey(), -1) ? S.boardTitleYesterday : S.dailyN(dayNumber(boardDate)),
    refresh,
  });
}

/** The Ranglys sheet: a day's top 10 and your place (the results card's day, or today from the statistics). */
function openBoard(dateKey) {
  if (!BOARD_ON) return;
  boardDate = isDateKey(dateKey) ? dateKey : todayKey();
  renderBoard({ loading: true, refresh: false });
  if (boardFresh(boardDate)) return;
  const day = boardDate;
  syncBoard(day).then(() => {
    if (boardDate === day) renderBoard();
  });
}

/**
 * A new nickname or "show me" choice: the latest result on the board (today's or yesterday's) takes it
 * at once. Until the server has it, the change waits and goes with the next board request, also on a
 * later visit, and the sheet says so.
 */
function boardChanged() {
  const day = store.getBoardPosted();
  if (!BOARD_ON || !day || day < addDays(todayKey(), -1)) {
    renderBoard();
    return;
  }
  boardChanges++;
  store.setBoardPending(true);
  boardSaving++;
  renderBoard();
  syncBoard(day).then(() => {
    boardSaving--;
    renderBoard();
  });
}

bus.on('ui:board', openBoard);
bus.on('ui:board-hide', (hide) => {
  store.setBoardHidden(!!hide);
  boardChanged();
  account.soon();
});

/** At start: a change that didn't reach the server last time goes now (one about an older day is let go). */
function retryBoard() {
  if (!BOARD_ON || !store.getBoardPending()) return;
  const day = store.getBoardPosted();
  if (day && day >= addDays(todayKey(), -1)) syncBoard(day);
  else store.setBoardPending(false);
}

/** The results card learns how the player did against everyone else today, when (if) the server answers. */
function showPercentile(result) {
  showBoardPlace(result);
  // (1.12.1) not after a second try: the day's count holds the first try's height, so the line would describe that one
  if (!AUDIENCE_ON || !result || result.mode !== 'daily' || run.retry) return;
  dailyPercentile(result, { apiUrl: matchApiUrl(), storageKey: DEBUG ? `${STORAGE_KEY}.debug` : STORAGE_KEY })
    .then((answer) => {
      const line = percentileLine(answer);
      if (line && screen === 'results') ui.setResultsPercentile(result.dateKey, line);
    }, () => {});
}

function menuAd() {
  return { house: sponsorFeed.house?.menu || null, salesOn: salesEnabled() };
}

loadSponsors({ apiUrl: SPONSOR_API_URL, onUpdate: onSponsorFeed }).then(onSponsorFeed, () => {});

function sequenceFor(dateKey) {
  if (!seqCache.has(dateKey)) {
    seqCache.clear();
    seqCache.set(dateKey, createSequence(seedFor(dateKey)));
  }
  return seqCache.get(dateKey);
}

function menuModel() {
  const dateKey = todayKey();
  return {
    dateKey,
    dayNumber: dayNumber(dateKey),
    dateLabel: fmtDateKey(dateKey),
    forecast: sequenceFor(dateKey).forecast(4),   // about as many as a typical tower meets
    visitors: sequenceFor(dateKey).visitorForecast(),   // "Besoekers vandag: 🐒 🤡"
    today: store.getDaily(dateKey),
    best: store.getDailyBest(dateKey),      // (1.12) the try that counts (the better of two)
    boardOn: BOARD_ON,                       // (1.12) the 🏆 on the daily card, with today's place once known
    boardPlace: boardLast?.dateKey === dateKey && boardLast.board?.you ? boardLast.board.you.rank : null,
    retry: store.getDailyRetry(dateKey),    // (1.12) "Nog 'n kans": the day's extra try, if bought
    retryPrice: store.nextRetryPrice(dateKey),   // (1.13.1) 0 for a free try, then 50, 100, 200, 400; null: none now
    retryMax: store.dailyTries(dateKey).extra >= store.dailyTries(dateKey).maxExtra,
    tries: store.dailyTries(dateKey),           // (1.13.1) { free, played, extra, maxExtra }
    stats: store.getStats(dateKey),
    settings,
    nextDayAt: nextDayTimestamp(),
    ad: menuAd(),
    newPlayer: !store.tutorialSeen(),   // first visit: a one-line nudge instead of the old how-to pop-up
    challenge: activeChallenge() ? { text: S.challengeMenu(fmtM(activeChallenge().heightM)) } : null,
    city: skylineFor(dateKey),
    coins: store.getEconomy().coins,
    refill: refillActive(),   // (1.15) the wallet's + only while "Vul my munte aan" runs (coins are never sold)
    week: weekView(store.getWeek(), dateKey),   // the weekkis strip (js/core/week.js)
  };
}

// ---------------------------------------------------------------------------
// Winkel (1.8): power-ups and looks, bought with coins earned by playing
// ---------------------------------------------------------------------------
function shopModel() {
  const e = store.getEconomy();
  return { coins: e.coins, stock: e.stock, owned: e.owned, look: e.look, card: store.getCard(duelMode()), name: duelNick(), week: store.getWeek(), skins: store.getSkins(), refillTo: refillActive() ? REFILL.to : 0, refillLeft: store.refillsLeft(REFILL), refillTimes: REFILL.times, refillPerDay: REFILL.per !== 'ever', refillLast: todayKey() === refillLastDay() };
}

bus.on('ui:shop', (tab) => ui.showShop(shopModel(), typeof tab === 'string' ? tab : undefined));
// (1.13.4, the owner: "refills the account if you press it, with 2000 coins", "3 times a day for 5 days") the Winkel's
// "Vul my munte aan": on REFILL's days only (it switches itself off after the last)
const refillLastDay = () => addDays(REFILL.from, REFILL.days - 1);
const refillActive = () => REFILL.on && todayKey() >= REFILL.from && todayKey() <= refillLastDay();
bus.on('ui:shop-refill', () => {
  if (!refillActive()) return;
  const r = store.refillCoins(REFILL.to, REFILL);
  if (r.added) {
    audio.play('heart');
    ui.toast(S.refillDone(fmtInt(r.added), fmtInt(r.coins)), 3000);
    coinsChanged();
  }
  ui.showShop(shopModel());
});
// (1.13.4, the owner: backgrounds, cranes and block skins "can be purchased with coins. But you do get the default for free")
/** The skins the player wears (or `w`), now: the background at once, the crane repainted, blocks drawn from here on. */
function applySkins(w = store.getSkins().wear) {
  game.registry.set('bgSkin', w.scene);
  setCraneSkin(w.crane);
  setBlockSkin(w.blocks);
  gameScene()?.crane?.applySkin?.();
}
// (1.15, the owner: "the "try it" makes it feel more "THATS WHAT I WANT"") the Winkel's Try it: the world wears a tower
// style for a look (nothing bought or saved); null puts the worn ones back. Tried blocks restart the menu's tower in them.
let tried = null;
function settleTry() {
  const t = tried;
  tried = null;
  applySkins();
  if (t?.kind === 'blocks' && t.id !== store.getSkins().wear.blocks) gameScene()?.idleRestyle?.();
}
bus.on('ui:skin-try', (t) => {
  if (!t || !SKINS[t.kind]?.some((c) => c.id === t.id)) {
    settleTry();
    return;
  }
  tried = { kind: t.kind, id: t.id };
  applySkins({ ...store.getSkins().wear, [t.kind]: t.id });
  if (t.kind === 'blocks') gameScene()?.idleRestyle?.();
});
bus.on('ui:skin-buy', ({ kind, id } = {}) => {
  const r = store.buySkin(kind, id);
  if (r.ok) {
    audio.play('heart');
    store.wearSkin(kind, id);   // a new skin goes on at once
    ui.toast(S.bought(S.skinNames[kind]?.[id] || id));
    coinsChanged();
  }
  settleTry();
  ui.showShop({ ...shopModel(), signinOffer: r.ok && takeSigninOffer() }, 'skins');
});
bus.on('ui:skin-wear', ({ kind, id } = {}) => {
  if (store.wearSkin(kind, id).ok) account.soon();
  settleTry();
  ui.showShop(shopModel(), 'skins');
});

/** A new look from the shop shows at once on the Uitdagersreeks card underneath. */
function lookChanged() {
  if (screen !== 'duel') return;
  const card = store.getCard(duelMode());
  ui.setDuelCard(card, card.rank);
}
bus.on('ui:shop-buy', ({ kind, id } = {}) => {
  if (kind === 'weekshield') {
    const w = store.buyWeekShield();
    if (w.ok) {
      audio.play('heart');
      ui.toast(S.bought(S.weekShield));
    }
    ui.showShop(shopModel());
    if (w.ok) coinsChanged();
    return;
  }
  const r = kind === 'powerup' ? store.buyPowerup(id) : store.buyCosmetic(kind, id);
  if (r.ok) {
    audio.play('heart');
    if (kind !== 'powerup') store.wearCosmetic(kind, id);   // a new look goes on at once
    const name = kind === 'powerup' ? POWERUP_INFO[id]?.name : COSMETIC_INFO[kind]?.[id]?.name;
    if (name) ui.toast(S.bought(name));
  }
  ui.showShop({ ...shopModel(), signinOffer: r.ok && takeSigninOffer() });
  if (r.ok && kind !== 'powerup') lookChanged();
  if (r.ok) coinsChanged();
});
bus.on('ui:shop-wear', ({ kind, id } = {}) => {
  store.wearCosmetic(kind, id);
  ui.showShop(shopModel());
  lookChanged();
  account.soon();
});

function gameScene() {
  return game.scene.getScene('Game');
}

// ---------------------------------------------------------------------------
// Render loop: nothing moves behind the pause card, the finished results or a
// menu left alone, so the loop sleeps there (battery, heat).
// ---------------------------------------------------------------------------
let loopAsleep = false;
let sleepTimer = 0;

function sleepLoop(afterMs = 0) {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    if (loopAsleep || !game.loop || !game.loop.running) return;
    loopAsleep = true;
    game.loop.sleep();
    // (1.12.1) the page's own animations rest too (the logo, the weekkis): the screen can stop redrawing
    document.documentElement.classList.add('zzz');
  }, afterMs);
}

function wakeLoop() {
  clearTimeout(sleepTimer);
  sleepTimer = 0;
  if (!loopAsleep) return;
  loopAsleep = false;
  document.documentElement.classList.remove('zzz');
  game.loop.wake();
  game.loop.resetDelta();
  const gs = gameScene();
  if (gs && gs.resetClock) gs.resetClock();
}

function armMenuSleep() {
  if (screen === 'menu') sleepLoop(MENU_SLEEP_MS);
}

// (1.12.1) A 120 Hz (or 144 Hz) screen drew every frame twice as often as the physics moves (60 a second): half
// the work and the battery for nothing. Measured once after the start; a 60 or 90 Hz screen keeps its rate.
function capFrames() {
  if (typeof requestAnimationFrame !== 'function') return;
  const deltas = [];
  let last = 0;
  const probe = (t) => {
    if (last) deltas.push(t - last);
    last = t;
    if (deltas.length < 40) {
      requestAnimationFrame(probe);
      return;
    }
    deltas.sort((a, b) => a - b);
    const hz = 1000 / deltas[deltas.length >> 1];
    const limit = hz >= 110 && hz <= 130 ? 61 : hz >= 135 && hz <= 150 ? 73 : 0;   // (61, not 60: two 8.3 ms frames)
    const loop = game.loop;
    if (!limit || !loop) return;
    loop.fpsLimit = limit;
    loop.hasFpsLimit = true;
    loop._limitRate = 1000 / limit;
    if (loop.running && !loopAsleep) {   // the loop picks its step function when it starts
      loop.sleep();
      loop.wake();
    }
  };
  requestAnimationFrame(probe);
}

for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => {
    if (screen !== 'menu') return;
    wakeLoop();
    armMenuSleep();
  }, { capture: true, passive: true });
}

// ---------------------------------------------------------------------------
// Scene control
// ---------------------------------------------------------------------------
const LESSON_STEPS = 4;
const LESSON_SEED = 'stapel-les';   // the short lesson's Oefen tower (see startLesson)
let lesson = null;   // { step, landings, after } while it runs

function startGame(data) {
  wakeLoop();
  if (data.seed !== LESSON_SEED || data.mode !== 'practice') {
    lesson = null;
    ui.showTutor(null);
  }
  // a new game of another kind ends any match (and its live room); an Oefen tower keeps a search going
  if (data.mode !== 'duel' && !(data.mode === 'practice' && duel.searching)) {
    leaveDuel();
    ui.setSearchChip(false);
  }
  if (run.paused) {
    audio.resume();
    run.paused = false;
  }
  game.scene.stop('Hud');
  game.scene.start('Game', {
    settings,
    autoplay: 0,
    sponsors: sponsorFeed,
    billboard: billboardFor(data.dateKey),
    // a brand-new player gets short HUD hints during the first game (text only; js/core/coach.js)
    coach: data.mode !== 'idle' && !store.tutorialSeen(),
    debug: DEBUG,
    visitor: FORCE_VISITOR,
    ...data,
  });
}

let quitHome = false;   // (1.13.4) "Terug na die hoofkieslys": this run ends on the menu instead of its results
function resetRun(mode, dateKey = null) {
  quitHome = false;
  pw.effects = {};
  pw.free = false;
  pw.pick = null;
  if (mode !== 'duel') ui.setEmotes(null);   // (1.12) emojis belong to a match
  run.mode = mode;
  run.dateKey = dateKey;
  run.dayNumber = dateKey ? dayNumber(dateKey) : null;
  run.over = false;
  run.started = false;
  run.final = null;
  run.retry = false;   // (1.12) this daily run is the day's second try ("Nog 'n kans")
}

// ---------------------------------------------------------------------------
// Power-ups (1.8; js/core/economy.js): in Oefen from the player's stock; never in a match. (1.15.3, the owner: "Lets make
// it fair, everyone get one powerup and its available immediately", "Make the player choose the one they want to use
// before the match") the Daily Tower: one free power-up per tower, picked before it starts (was a Fondamentblok at 55 m)
// ---------------------------------------------------------------------------
const pw = { effects: {}, free: false, pick: null };

function renderTray() {
  const mode = run.mode;
  if (screen !== 'game' || run.over || (mode !== 'practice' && mode !== 'daily')) {
    ui.setPowerups(null);
    return;
  }
  const e = pw.effects || {};
  const items = [];
  if (mode === 'daily') {
    const id = pw.pick;
    const active = (id === 'slow' && e.slowLeft > 0) || (id === 'shield' && !!e.shield) || (id === 'foundation' && !!e.foundation);
    const enabled = pw.free && !active && !(id === 'heart' && e.heartRoom === false);
    if (id && (pw.free || active)) items.push({ id, count: pw.free ? 1 : 0, active, glow: enabled, enabled });
  } else {
    const stock = store.getEconomy().stock;
    for (const id of POWERUP_IDS) {
      const active = (id === 'slow' && e.slowLeft > 0) || (id === 'shield' && !!e.shield) || (id === 'foundation' && !!e.foundation);
      if (!(stock[id] > 0) && !active) continue;
      const enabled = !active && stock[id] > 0 && !(id === 'heart' && e.heartRoom === false);
      items.push({ id, count: stock[id], active, enabled });
    }
  }
  ui.setPowerups(items);
}

bus.on('game:powerups', (e) => {
  pw.effects = e || {};
  renderTray();
});
bus.on('ui:powerup', (id) => {
  const gs = gameScene();
  if (!gs || run.over || screen !== 'game') return;
  if (run.mode === 'daily') {
    if (id !== pw.pick || !pw.free) return;
    if (gs.applyPowerup(id)) pw.free = false;
  } else if (run.mode === 'practice') {
    if (!(store.getEconomy().stock[id] > 0)) return;
    if (gs.applyPowerup(id)) store.usePowerup(id);
  }
  renderTray();
});

function startIdle() {
  resetRun('idle');
  startGame({ mode: 'idle', seed: randomSeed('idle') });
}

let boardAskedFor = null;   // (1.12) the day whose place the menu's 🏆 asked for this session
function showMenu() {
  screen = 'menu';
  pushSkyline();
  ui.showMenu(menuModel());
  account.soon();
  wakeLoop();
  armMenuSleep();
  requestAnimationFrame(updateMenuAnchor);
  // (1.12) the 🏆 shows today's place: asked once a session, after the day's daily was played
  const dk = todayKey();
  if (BOARD_ON && store.getDailyBest(dk) && !boardFresh(dk) && boardAskedFor !== dk) {
    boardAskedFor = dk;
    syncBoard(dk).then((b) => {
      if (b?.you && screen === 'menu') ui.setBoardPlace(b.you.rank);
    });
  }
}

/** Tells the attract tower where the menu card starts (game px), so it stays in view above it. */
function updateMenuAnchor() {
  const canvas = game.canvas;
  const top = ui.menuCardTop ? ui.menuCardTop() : null;
  if (!canvas || top == null || screen !== 'menu') return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0)) return;
  game.registry.set('menuTopGame', ((top - rect.top) * GAME_W) / rect.width);
}

/** Today's daily is being played in another tab right now (fresh heartbeat). */
function liveElsewhere(dateKey) {
  const e = store.getDaily(dateKey);
  return !!e && e.status === 'playing' && e.owner !== TAB_ID && Number.isFinite(e.beatAt) && Date.now() - e.beatAt < STALE_AFTER_MS;
}

/**
 * (1.15.3) The Daily Tower's free power-up: undefined while not picked yet (playDaily asks first), null for none. Test
 * runs (?auto=, or window.__stapelPick set by the QA scripts) skip the sheet.
 */
function presetPick() {
  const t = AUTO ? 'none' : globalThis.__stapelPick;
  if (typeof t !== 'string') return undefined;
  return POWERUP_IDS.includes(t) ? t : null;
}
/** A Daily Tower starts with its pick: the tray shows it at once, glowing, and a toast says where it is. */
function armPick(pick) {
  pw.pick = pick || null;
  pw.free = !!pw.pick;
  if (pw.pick) {
    const info = POWERUP_INFO[pw.pick];
    bus.emit('hud:toast', { text: S.pickReady(info.emoji, info.name), color: '#ffe38c' });
  }
}

function playDaily(pick = presetPick()) {
  const dateKey = todayKey();
  let entry = store.getDaily(dateKey);
  if (entry && entry.status === 'playing' && !(run.mode === 'daily' && run.dateKey === dateKey && !run.over)) {
    if (liveElsewhere(dateKey)) {
      ui.toast(S.otherTab, 3000);
      return;
    }
    // Started in a tab that is gone, or a crashed session: it counts (one try per day), and pays.
    payRecovered(store.recoverUnfinished(dateKey));
    planReminders();
    entry = store.getDaily(dateKey);
  }
  if (entry && entry.status === 'done') {
    // (1.12) "Nog 'n kans": a second try bought and not played yet starts now; one cut short in a tab
    // that is gone counts as it stood (like the first try)
    let rt = store.getDailyRetry(dateKey);
    if (rt && rt.status === 'playing' && !(run.mode === 'daily' && run.retry && !run.over)) {
      if (rt.owner !== TAB_ID && Number.isFinite(rt.beatAt) && Date.now() - rt.beatAt < STALE_AFTER_MS) {
        ui.toast(S.otherTab, 3000);
        return;
      }
      store.recoverUnfinished(dateKey);
      rt = store.getDailyRetry(dateKey);
    }
    if (rt && rt.status === 'ready') {
      if (pick === undefined) {
        ui.showPowerPick();
        return;
      }
      resetRun('daily', dateKey);
      run.retry = true;
      startGame({ mode: 'daily', seed: seedFor(dateKey), dayNumber: run.dayNumber, dateKey, autoplay: AUTO, challenge: 0 });
      screen = 'game';
      ui.showInGame();
      armPick(pick);
      renderTray();
      return;
    }
    showDoneResults(dateKey, store.getDailyBest(dateKey) || entry.result);
    return;
  }
  if (pick === undefined) {
    ui.showPowerPick();
    return;
  }
  resetRun('daily', dateKey);
  startGame({
    mode: 'daily', seed: seedFor(dateKey), dayNumber: run.dayNumber, dateKey, autoplay: AUTO,
    challenge: activeChallenge() ? activeChallenge().heightM : 0,
  });
  screen = 'game';
  ui.showInGame();
  armPick(pick);
  renderTray();
}

function playPractice() {
  resetRun('practice');
  const seed = SEED_OVERRIDE || randomSeed('oefen');
  startGame({ mode: 'practice', seed, autoplay: AUTO });
  screen = 'game';
  ui.showInGame();
  renderTray();
}

function showDoneResults(dateKey, result) {
  screen = 'results';
  // the attract tower keeps still (and its crane out of the title) behind a revisited result
  const gs = gameScene();
  if (gs && gs.idle) {
    gs.inputLocked = true;
    if (gs.crane) gs.crane.setVisible(false);
  }
  ui.showResults({
    result,
    stats: store.getStats(dateKey),
    isNewBest: false,
    shareText: shareTextFor(result),
    nextDayAt: nextDayFor(dateKey),
    mode: 'daily',
    ...resultsExtras(result),
  });
  showPercentile(result);
  sleepLoop(RESULTS_SLEEP_MS);
}

function shareTextFor(result) {
  // (1.13.1) a day with free tries: the share line says how many were played ("2/3")
  const r = result && result.mode === 'daily' && result.dateKey && !result.freeTries
    ? { ...result, freeTries: store.dailyTries(result.dateKey).free } : result;
  return buildShareText(r, { url: shareUrlFor(siteUrl(), r), highContrast: !!settings.highContrast });
}

// (1.13.1) The Daaglikse Toring's free tries from the Worker (GET /daily/config): asked at the start; the phone keeps the
// last answer for an offline start, and without one the game's own setting counts (js/config.js DAILY_TRIES).
async function loadDailyTries() {
  const root = apiBase(matchApiUrl() || '');
  if (!root || DEBUG) return;   // (a test page keeps the game's own setting, or ?tries=…)
  const cfg = await apiRequest(`${root}/daily/config`, { method: 'GET' });
  if (!cfg) return;
  // (1.14) Sign in with Google is open on the server: the button (Statistiek) and the gentle offer may show
  if (cfg.signin === true && !signinOpen) {
    signinOpen = true;
    ui.setAccount(accountStatus());
  }
  // (1.15, the owner: "Isnt there a way to do it through a app notification?") a newer app on Google Play: one card per version
  if (IN_APP && typeof cfg.app === 'string' && newerVersion(cfg.app, VERSION)) offerUpdate(cfg.app);
  const before = JSON.stringify(store.getDailyTries());
  store.setDailyTries(cfg);
  if (JSON.stringify(store.getDailyTries()) !== before && screen === 'menu') showMenu();
}
/** (1.15) True when version `a` ("1.15.2") is newer than `b`. */
function newerVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.lekkerlocal.stapel';
const UPDATE_SEEN = 'stapel.v1.updateSeen';
/** (1.15) "Nuwe weergawe!": once per version, on the menu (never during a tower or over another sheet). */
function offerUpdate(version) {
  let seen = '';
  try { seen = localStorage.getItem(UPDATE_SEEN) || ''; } catch { /* private mode: it may show again */ }
  if (seen === version || screen !== 'menu') return;
  if (ui.showUpdate(version, PLAY_URL)) {
    try { localStorage.setItem(UPDATE_SEEN, version); } catch { /* fine */ }
  }
}
// (a test page: ?debug=1&update=1.99.0 shows the card as an older app would)
if (DEBUG && /^\d+\.\d+\.\d+$/.test(params.get('update') || '')) setTimeout(() => offerUpdate(params.get('update')), 1500);
if (DEBUG && /^\d+(,\d{4}-\d{2}-\d{2})?$/.test(params.get('tries') || '')) {
  const [free, from] = params.get('tries').split(',');
  store.setDailyTries({ free: Number(free), from: from || undefined });
}

// (1.13.1, the owner: "count shares") a share from the results counts as an anonymous number per day and kind of game
bus.on('ui:share-tap', (e) => {
  if (!AUDIENCE_ON || e?.screen !== 'results') return;
  // (a daily result opened again from the menu: the game is idle then, the results screen says which day it was)
  const mode = e.daily ? 'daily' : run.mode === 'daily' || run.mode === 'practice' || run.mode === 'duel' ? run.mode : null;
  if (mode) sendShareCount(matchApiUrl(), { dateKey: e.dateKey || run.dateKey || todayKey(), mode });
});

/** What the daily results add beyond the result itself: the skyline, tomorrow's teaser and the install offer. */
function resultsExtras(r) {
  if (!r || r.mode !== 'daily' || !r.dateKey) return {};
  return { city: skylineFor(r.dateKey), teaser: tomorrowTeaser(r.dateKey), install: installMode(), ...dayTriesExtras(r) };
}

/**
 * (1.13.1, the Customer: a player who only sees the results never found the free tries) today's daily results while a
 * free try is left: { freeTry: { n, free, left, ready } } (`ready`: taken, not started); and { bestStays } (metres) when
 * this later try came in lower than the day's best.
 */
function dayTriesExtras(r) {
  const out = {};
  const dateKey = r.dateKey;
  if (r.retry) {
    const best = store.getDailyBest(dateKey);
    if (best && (best.heightM || 0) > (r.heightM || 0)) out.bestStays = best.heightM;
  }
  if (dateKey !== todayKey()) return out;   // a tower finished after midnight: today's tries are another day's
  const t = store.dailyTries(dateKey);
  if (!(t.free > 1 && t.played < t.free)) return out;
  const rt = store.getDailyRetry(dateKey);
  const ready = rt?.status === 'ready';
  if (ready ? rt.paid !== 0 : store.nextRetryPrice(dateKey) !== 0) return out;
  out.freeTry = { n: t.played + 1, free: t.free, left: t.free - t.played, ready };
  return out;
}

function canPause() {
  const gs = gameScene();
  return run.mode !== 'idle' && !run.over && !run.paused && screen === 'game' && !!gs && !gs.over;
}

function pauseGame() {
  if (!pauseLocal()) return;
  // (1.12.1, the owner: "pause from both sides if you play against a friend") a friend match: the pause stops
  // both games (the room answers both); with none left, or an older game on the other side, only this one
  if (run.mode !== 'duel') return;
  if (duel.canPauseBoth()) {
    duel.pauseBoth();
    ui.setPauseNote(S.pauseAsking);
  } else if (duel.match?.roomKind === 'friend' && duel.match.pausesLeft === 0 && !duel.match.outcome) {
    ui.setPauseNote(S.pauseNoneLeft(duel.match.oppName));
  }
}

/** This game's tower stops and the pause card shows (true when it did). */
function pauseLocal() {
  if (!canPause()) return false;
  const gs = gameScene();
  if (!gs || !gs.sys.isActive()) return false;
  run.paused = true;
  game.scene.pause('Game');
  if (game.scene.isActive('Hud')) game.scene.pause('Hud');
  audio.suspend();
  saveProgressNow();
  screen = 'pause';
  // (1.13) a coin match: the card says what "Hou op" costs
  const m = duel.match;
  const atStake = run.mode === 'duel' && m && m.stakeHeld && !m.stakeDone && m.stakeOn !== false && !m.outcome;
  // (1.15) the tower so far, on the pause card
  let now = null;
  try { now = gameScene()?.getState?.() || null; } catch { now = null; }
  ui.showPause({ mode: run.mode, started: run.started, stake: atStake ? { n: m.stake, name: m.oppName } : null,
    sofar: now && run.started ? { heightM: now.heightM, score: now.score, perfects: now.perfects } : null });
  // (1.12, the owner: "If i pause while looking for an opponent make it stop looking") a pause, or the
  // game out of sight, ends the search: nobody is paired with a player who isn't there
  if (duel.searching) {
    stopDuelFlow();
    ui.toast(S.searchStoppedPause, 2600);
  }
  sleepLoop(120);
  return true;
}

function resumeScenes() {
  pauseClock(0);
  if (!run.paused) return;
  wakeLoop();
  run.paused = false;
  if (game.scene.isPaused('Game')) game.scene.resume('Game');
  if (game.scene.isPaused('Hud')) game.scene.resume('Hud');
  audio.resume();
}

function resumeGame() {
  if (!run.paused || resumeCounting) return;   // (during the 3-2-1 both games go on together: no head start)
  if (landscape()) return;   // still sideways: stay on the pause card
  // (1.12.1) a pause for both: either player goes on; the room starts the 3-2-1 in both games ('duel:resumed').
  // No answer (the connection): it goes on here after a moment.
  if (run.mode === 'duel' && duel.pausedBoth && duel.resumeBoth()) {
    ui.setPauseNote(S.pauseResuming);
    clearTimeout(resumeFallback);
    resumeFallback = setTimeout(() => resumeCountdown(DUEL.resumeMs), 4000);
    return;
  }
  resumeNow();
}

function resumeNow() {
  resumeScenes();
  screen = 'game';
  ui.showInGame();
  renderTray();
}

let resumeFallback = 0;
let resumeCounting = false;
let pauseTick = 0;
/**
 * (1.12.1) A pause for both: the time left until the room goes on by itself, on the pause card ("Gaan aan oor
 * 0:42"). `ms` from the room's 'paused' (also after coming back from a dropped connection); 0 = hide it.
 */
function pauseClock(ms) {
  clearInterval(pauseTick);
  pauseTick = 0;
  ui.setPauseTimer(null);
  if (!(ms > 0)) return;
  const endAt = Date.now() + ms;
  const show = () => {
    const left = Math.ceil((endAt - Date.now()) / 1000);
    if (!run.paused || resumeCounting || left <= 0) {
      pauseClock(0);
      return false;
    }
    ui.setPauseTimer(S.pauseGoesOn(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`));
    return true;
  };
  if (show()) pauseTick = setInterval(show, 250);
}
/** (1.12.1) The 3-2-1 back after a pause for both (the same moment in both games), then the tower goes on. */
function resumeCountdown(ms) {
  clearTimeout(resumeFallback);
  if (!run.paused || resumeCounting) return;
  pauseClock(0);
  resumeCounting = true;
  let n = Math.max(1, Math.round(ms / 1000));
  ui.setPauseCount(String(n));
  const tick = () => {
    n -= 1;
    if (!run.paused) {
      resumeCounting = false;
      ui.setPauseCount(null);
      return;
    }
    if (n > 0) {
      ui.setPauseCount(String(n));
      setTimeout(tick, 1000);
      return;
    }
    resumeCounting = false;
    ui.setPauseCount(null);
    ui.setPauseNote(null);
    // out of sight, or sideways: this game stays on its pause card ("Speel verder" goes on here alone)
    if (document.hidden || landscape()) return;
    resumeNow();
  };
  setTimeout(tick, 1000);
}

// (1.12.1) a pause for both: the other player paused (this game waits too), or ours took; the room's 3-2-1 back
bus.on('duel:paused', (e) => {
  if (run.mode !== 'duel' || !e) return;
  if (!run.paused) pauseLocal();
  if (!run.paused) return;
  ui.setPauseNote(e.mine ? S.pauseBothMine(e.left) : S.pauseBothTheirs(e.name || S.duelSomeone));
  pauseClock(e.ms);
});
bus.on('duel:nopause', (e) => {
  if (run.paused) ui.setPauseNote(e?.left === 0 ? S.pauseNoneLeft(e?.name || S.duelSomeone) : S.pauseOnlyMine(e?.name || S.duelSomeone));
});
bus.on('duel:resumed', (e) => {
  if (run.mode === 'duel') resumeCountdown(e?.ms || DUEL.resumeMs);
});
// (1.12.1, the owner: "the bloks that goes grey is pretty good but it needs to mention something about it") the
// first grey blocks this player ever sees: once, a moment later (after a first game's own hint, if any)
let cementTipAt = 0;
bus.on('game:cement', () => {
  // (read from storage each time: another tab may have shown it already)
  if (store.getSettings().cementSeen || run.mode === 'idle' || cementTipAt) return;
  cementTipAt = setTimeout(() => {
    cementTipAt = 0;
    if (store.getSettings().cementSeen || screen !== 'game' || run.paused || run.over || run.mode === 'idle') return;
    settings = store.setSettings({ cementSeen: true });
    bus.emit('hud:toast', { text: S.cementTip, color: '#e3eaf3' });
  }, 2600);
});

// (1.12.1) the match was decided during a pause (the other player chose "Hou op"): its result shows now
bus.on('duel:end', () => {
  if (run.mode === 'duel' && run.paused && !document.hidden && !landscape()) resumeNow();
});
// (1.12.1) a live match's connection went (ours: the game comes back to its room) or the other player's
bus.on('duel:conn', (e) => {
  if (!e) return;
  if (e.state === 'lost') {
    ui.setConnChip(e.mine ? S.connLost : S.connOppLost(e.name || S.duelSomeone));
    return;
  }
  ui.setConnChip(null);
  if (e.state === 'back') ui.toast(e.mine ? S.connBack : S.connOppBack(e.name || S.duelSomeone), 1800);
});

/** Snapshot of a running daily straight into storage (tab hidden, page closing). */
function saveProgressNow() {
  if (run.mode !== 'daily' || run.over || !run.started || !run.dateKey) return;
  const gs = gameScene();
  if (!gs || !gs.buildResult || gs.over) return;
  try {
    if (run.retry) store.saveDailyRetryProgress(run.dateKey, gs.buildResult('quit'));
    else store.saveDailyProgress(run.dateKey, gs.buildResult('quit'));
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------
// One try per day: heartbeat, other tabs, the Back button
// ---------------------------------------------------------------------------
let beatTimer = 0;

function startHeartbeat() {
  clearInterval(beatTimer);
  beatTimer = setInterval(() => {
    if (run.mode === 'daily' && run.started && !run.over && run.dateKey) store.touchDaily(run.dateKey);
    else stopHeartbeat();
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  clearInterval(beatTimer);
  beatTimer = 0;
}

// The finished (or recovered) daily was written by another tab: end this one and show what counts.
window.addEventListener('storage', () => {
  if (run.mode !== 'daily' || run.over || !run.started || !run.dateKey) return;
  // (1.12.1) a second try ("Nog 'n kans") ends only when that try was finished elsewhere: the day's first try is
  // always done by then, and any storage write from another tab used to stop the paid try
  const e = run.retry ? store.getDailyRetry(run.dateKey) : store.getDaily(run.dateKey);
  if (e && e.status === 'done') {
    if (run.paused) resumeScenes();
    screen = 'game';
    bus.emit('game:quit');
  }
});

// Android Back during a daily pauses instead of leaving the app (which would end the try).
let backGuard = false;
let ignorePop = false;

function armBackGuard() {
  if (backGuard || !history.pushState) return;
  try {
    history.pushState({ stapel: 'play' }, '');
    backGuard = true;
  } catch {
    // sandboxed frames
  }
}

function releaseBackGuard() {
  if (!backGuard) return;
  backGuard = false;
  if (history.state && history.state.stapel === 'play') {
    ignorePop = true;
    history.back();
  }
}

// The website's Back button (the app's comes through app/shim.js) goes one step back in the game, like
// Esc: a sheet closes, a tower pauses, a screen goes home. Only on the bare menu does it leave the page:
// everywhere else one history entry of ours stands in front of it.
let guardTimer = 0;
function syncBackGuard() {
  if (IN_APP) return;
  clearTimeout(guardTimer);
  guardTimer = setTimeout(() => {
    const v = ui.view();
    if (v.screen !== 'menu' || v.modal) armBackGuard();
    else releaseBackGuard();
  }, 0);
}
bus.on('ui:view', syncBackGuard);
// (1.12.1) a waiting screen (search, friend room, versus) shown from the results: the page wakes (its spinner moves)
bus.on('ui:view', () => {
  if (screen === 'duelwait') wakeLoop();
});

window.addEventListener('popstate', () => {
  if (ignorePop) {
    ignorePop = false;
    return;
  }
  backGuard = false;
  window.dispatchEvent(new CustomEvent('stapel:back', { cancelable: true }));
  syncBackGuard();
});

// ---------------------------------------------------------------------------
// Bus wiring
// ---------------------------------------------------------------------------
// (1.13) signed in: the towers played on another device come in first (a short wait at most), so this one never
// builds today's tower again or restarts the weekkis on an old copy
let dailyWaiting = false;
bus.on('ui:play-daily', () => {
  if (!account.stale()) {
    playDaily();
    return;
  }
  if (dailyWaiting) return;
  dailyWaiting = true;
  ui.toast(S.accountWaiting, 1600);
  account.settle(3000).then(() => {
    dailyWaiting = false;
    if (screen === 'menu') playDaily();
  });
});
bus.on('ui:install', async () => {
  await promptInstall();
  ui.setInstall(installMode());
});
bus.on('ui:install-dismiss', () => {
  dismissInstall();
  ui.setInstall(installMode());
});
onInstallChange(() => ui.setInstall(installMode()));
bus.on('ui:play-practice', playPractice);
// (1.15.3) the Daily Tower's free power-up was picked: the tower starts with it (only from the menu or results)
bus.on('ui:power-pick', (id) => {
  if (screen === 'menu' || screen === 'results') playDaily(POWERUP_IDS.includes(id) ? id : null);
});
// (1.13.1, the owner via Alfred: "Let's build!" on "How do I play?" closed it and nothing started) "Kom ons bou!" from
// the menu's "Hoe speel ek?" builds a tower: today's Daaglikse Toring while it isn't played, else an Oefen tower (it
// never takes one of the day's tries or coins)
bus.on('ui:howto-build', () => {
  if (screen !== 'menu') return;
  if (store.getDaily(todayKey())?.status === 'done') playPractice();
  else bus.emit('ui:play-daily');
});

// ---------------------------------------------------------------------------
// The short lesson (1.10): a new player's first Oefen game, four steps that follow what they do
// (tap, aim for a Perfek, Perfeks in a row, the water and the hearts), then "Jy is reg!". The usual
// first-game hints stay quiet meanwhile. Skippable; anyone can take it again from "Hoe speel ek?".
// ---------------------------------------------------------------------------
function lessonStep(step, text) {
  lesson.step = step;
  lesson.after = 0;
  ui.showTutor({ step, total: LESSON_STEPS, text });
}

function startLesson() {
  resetRun('practice');
  startGame({ mode: 'practice', seed: LESSON_SEED, autoplay: AUTO, coach: false });
  screen = 'game';
  ui.showInGame();
  renderTray();
  lesson = { step: 0, landings: 0, after: 0 };
  lessonStep(1, S.lesson1);
}

function endLesson({ done = false } = {}) {
  if (!lesson) return;
  lesson = null;
  store.markTutorialSeen();   // the basics are known: no first-game hints after this
  if (done) ui.showTutor({ done: true, daily: store.getDaily(todayKey())?.status !== 'done' });
  else ui.showTutor(null);
}

bus.on('ui:lesson', startLesson);
bus.on('game:dropped', () => {
  if (lesson?.step === 1) lessonStep(2, S.lesson2);
});
bus.on('game:rated', ({ rating } = {}) => {
  if (!lesson) return;
  lesson.landings++;
  lesson.after++;
  if (lesson.step === 2 && (rating === 'P' || lesson.after >= 5)) lessonStep(3, rating === 'P' ? S.lesson3 : S.lesson3b);
  else if (lesson.step === 3 && lesson.after >= 2) lessonStep(4, S.lesson4);
  else if (lesson.step === 4 && lesson.after >= 2) endLesson({ done: true });
});
bus.on('ui:lesson-close', () => {
  endLesson();
  ui.showTutor(null);
});
bus.on('ui:lesson-daily', () => {
  ui.showTutor(null);
  bus.emit('ui:play-daily');
});

// A challenge link opened while the app was already running (app/shim.js): straight to it, or, in the
// middle of a tower, once that tower is done (the home button).
let linkWaiting = false;
window.addEventListener('stapel:link', (e) => {
  let q = '';
  try {
    q = new URL(String(e.detail)).search;
  } catch {
    return;
  }
  // (1.13.3) the testers' gift opened in the app while it runs (App Links: …/?toetser=CODE): given at once
  const gift = new URLSearchParams(q).get('toetser');
  if (gift !== null) claimTesterGift(gift);
  // (1.14) ?rekening (the privacy page's deletion link) opened the app: the account sheet
  if (/[?&]rekening(?:[=&#]|$)/.test(q) && account.on) {
    ui.showAccount(accountStatus());
    return;
  }
  const klop = /[?&]klop=/.test(q) ? loadChallenge(q, todayKey()) : null;
  if (klop) {
    challengeRaw = klop;   // "Kan jy my klop?": on the daily card (now, or when the menu comes back)
    if (screen === 'menu') showMenu();
  }
  const link = parseChallengeQuery(q);
  const room = parseRoomQuery(q);
  if (!link && !room) return;
  duelLink = link;
  duelRoom = room;
  // a tower in progress (paused too), its game-over reveal, or a match counting down finishes first
  const busy = (run.mode !== 'idle' && screen !== 'results' && screen !== 'menu') || (screen === 'duelwait' && !!duel.match);
  if (busy) {
    linkWaiting = true;
    ui.toast(S.linkLater, 3200);
    return;
  }
  ui.closeModal();
  openDuelLink();
});

// ---------------------------------------------------------------------------
// The daily reminder (1.10; only the Android app has it: app/shim.js window.stapelApp.reminders). One
// message a day at the time the player chose, planned a week ahead, never on a day whose tower is
// built. Asked once, after the first Daily Tower; Statistiek changes it.
// ---------------------------------------------------------------------------
const REMIND = window.stapelApp?.reminders || null;
const REMIND_DAYS = 7;
const REMIND_ID = 7000;
ui.setReminderInfo(!!REMIND, store.getReminder().time);

/** The reminders of the next REMIND_DAYS days (the week chest's box if every day before is played). */
function reminderList(time, now = new Date()) {
  const [hh, mm] = time.split(':').map(Number);
  const today = todayKey();
  const week = store.getWeek();
  // the week chest's box every other day (the strongest reason to come back), the others in turn (1.12.1: a
  // friend challenge among them: a live win pays 15 coins)
  const others = [S.remind1, S.remind5, S.remind3, S.remind4];
  const texts = (day, coins, n) => (n % 2 === 0 ? S.remind2(day, coins) : others[Math.floor(n / 2) % others.length]);
  const list = [];
  for (let k = 0; k < REMIND_DAYS; k++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, hh, mm, 0, 0);
    if (at.getTime() <= now.getTime() + 60000) continue;
    if (k === 0 && store.getDaily(today)?.status === 'done') continue;   // built already
    // it only fires if the game wasn't opened since (that plans again): the box waiting that day, as is
    const day = weekView(week, dateKeyFor(at)).day;
    const n = Math.floor(at.getTime() / 86400000);   // the day's number: the same text for the same day
    list.push({ id: REMIND_ID + k, at: at.getTime(), title: 'Stapel', body: texts(day, WEEK_COINS[day - 1], n) });
  }
  return list;
}

/** (Re)plan the reminders: after a daily, at start, back in the app, or a new time. */
function planReminders() {
  if (!REMIND) return;
  const { time } = store.getReminder();
  if (!time) {
    REMIND.set([]).catch(() => {});
    return;
  }
  REMIND.permission().then((p) => (p === 'granted' ? REMIND.set(reminderList(time)) : null)).catch(() => {});
}

function askReminder() {
  if (!REMIND || store.getReminder().asked || screen !== 'results') return;
  store.setReminder({ time: null, asked: true });   // asked once, whatever the answer (✕ and Back too)
  ui.showReminder({ time: null });
}

bus.on('ui:remind', () => ui.showReminder({ time: store.getReminder().time }));
bus.on('ui:remind-pick', (time) => {
  if (!REMIND) return;
  if (!time) {
    store.setReminder({ time: null, asked: true });
    ui.setReminderInfo(true, null);
    planReminders();
    return;
  }
  REMIND.ask().then((ok) => {
    store.setReminder({ time: ok ? time : null, asked: true });
    ui.setReminderInfo(true, ok ? time : null);
    ui.toast(ok ? S.remindSet(time) : S.remindDenied, 3200);
    planReminders();
  }, () => ui.toast(S.remindDenied, 3200));
});
bus.on('ui:pause', pauseGame);
bus.on('ui:resume', resumeGame);
bus.on('ui:quit', () => {
  if (run.mode === 'idle') return;
  // (1.12.1) the match was decided while paused: "Hou op" goes on to its result, like "Speel verder"
  if (run.over) {
    if (run.paused) resumeGame();
    return;
  }
  resumeScenes();
  screen = 'game';
  ui.showInGame();
  renderTray();
  bus.emit('game:quit');
});
// (1.13.4, the owner: "Hou op" → "Terug na die hoofkieslys", straight to the menu) outside a match the tower ends and is
// saved as before (a daily's try counts; the menu's card shows its result), then the menu instead of the results.
// A match keeps "Hou op" ('ui:quit'): it goes on to the match's result.
bus.on('ui:quit-home', () => {
  if (run.mode !== 'duel' && run.mode !== 'idle' && !run.over) quitHome = true;
  bus.emit('ui:quit');
});
bus.on('ui:home', () => {
  if (lesson) endLesson();
  if (linkWaiting) {
    linkWaiting = false;
    leaveDuel();
    startIdle();
    if (openDuelLink()) return;
  }
  stopDuelFlow();
  leaveDuel();
  if (run.mode !== 'idle' || run.paused) {
    startIdle();
  } else {
    const gs = gameScene();
    if (gs && gs.idle) {
      gs.inputLocked = false;
      if (gs.crane) gs.crane.setVisible(true);
    }
  }
  showMenu();
});
// Afrikaans or English. The same language: carry on. A new one: start again in it (drawn text and
// textures keep the words they were made with). The address says which (?lang=), so it works where
// nothing can be saved too; the first start goes back to the address it was opened with (its link).
let langSwitching = false;
bus.on('ui:lang', (lang) => {
  if (!isLang(lang) || langSwitching) return;
  store.setLang(lang);
  const first = askLanguage;
  askLanguage = false;
  if (lang !== getLanguage()) {
    langSwitching = true;   // a second tap must not start a second (link-less) reload
    const u = new URL(first ? BOOT_URL : location.href, location.href);
    u.searchParams.set('lang', lang);
    location.replace(u.pathname + u.search + u.hash);
    return;
  }
  ui.closeModal();
  if (first && !openAccountLink() && !openDuelLink()) firstVisit();
});

/** (1.13) ?rekening (the privacy page's "delete your account" link, for those without the app): the account sheet. */
function openAccountLink() {
  if (!params.has('rekening') || !account.on) return false;
  ui.showAccount(accountStatus());
  return true;
}

/** A new player's first visit (no link): "Hoe speel ek?" opens by itself, once; its "Kom ons bou!" starts the lesson. */
function firstVisit() {
  if (store.hasPlayed() || settings.howtoSeen) return;
  ui.showHowTo({ lesson: true });
  settings = store.setSettings({ howtoSeen: true });
}
bus.on('ui:settings', (partial) => {
  settings = store.setSettings(partial || {});
  audio.setEnabled(settings.sound);
  haptics.setEnabled(settings.vibration);
});
bus.on('ui:day-rollover', () => {
  refundRetries();
  if (screen === 'menu') showMenu();
});

/** (1.12.1) A second try bought yesterday and never played: its coins come back, and the player hears so. */
function refundRetries() {
  const back = store.refundOldRetries(todayKey());
  if (back) ui.toast(S.retryRefund(back), 3200);
}

// ---------------------------------------------------------------------------
// Uitdagersreeks (head-to-head): js/duel.js runs the match; these are the screens around it.
// ---------------------------------------------------------------------------
// without a nickname of their own a player is "Bouer 123": the same number every visit (from the
// phone's random leaderboard number), so the board and the Uitdagersreeks show one name
const sessionNick = defaultNicknameFor(store.getBoardPlayer());
const duelNick = () => store.getDuel().name || sessionNick;
let duelReward = null;   // the decided match's coins and rank points, for its results card
const RANK_MIN_MS = 25000;   // (1.12) a live match must last this long to move a rank when it ends by a quit
const duel = createDuel({
  bus,
  apiUrl: matchApiUrl(),
  nickname: duelNick,
  card: (mode) => store.getCard(mode),
  onDecided: (outcome) => {
    if (outcome !== 'won' && outcome !== 'lost') return;
    store.recordDuel(outcome);
    // (1.12) only a live opponent moves this mode's rank, by their rank (js/core/economy.js rankAfterMatch);
    // a match that ended by someone leaving within its first RANK_MIN_MS doesn't (no farming by closing a tab)
    const m = duel.match;
    const quick = (m?.reason === 'quit' || m?.reason === 'timeout') && Date.now() - (m?.startedAt || 0) < RANK_MIN_MS;
    const live = m?.kind === 'live' && !quick;
    ui.setEmotes(null);
    // (1.13) a coin match: the room named the winner (first, so "jy het …" under the coins counts it too)
    settleMatchStake(m, outcome);
    duelReward = {
      coins: awardCoins({ mode: 'duel', outcome, live }),
      rank: store.recordDuelRank({ outcome, live, mode: m?.mode, opp: m?.oppCard?.rl }),
      quick: m?.kind === 'live' && quick,   // (1.13: its rank line says why it didn't count)
    };
    refreshResultReward(m);   // (a verdict that came after the results were drawn)
  },
});
if (DEBUG) window.__stapel.duel = duel;   // tests look at the search and the match

// ---------------------------------------------------------------------------
// (1.13, the owner: coin matches with earned coins only) A live match against a real player can be played for coins.
// Each game holds its stake when the match starts (versus) and tells the room; the match counts for coins only when
// both hold theirs (the room's 'stake' verdict; else both get theirs back). The result the room names settles it: the
// winner gets both; a loss, leaving, or a connection that doesn't come back loses it (the room gives that match to the
// other player). The stake waits in the wallet (js/core/economy.js), so a match that ended without its result (the app
// was closed, the page reloaded) is settled as lost the next time the game starts. Never against Robot Rikus or a
// recording; coins can't be bought.
// ---------------------------------------------------------------------------
// One coin match per browser at a time: the window that plays it holds a browser lock (the Web Locks API, shared by
// every tab and released when a tab closes or crashes), so two tabs of one wallet never both put coins in, and a stake
// whose lock nobody holds belongs to a match that ended without its result. Where a browser has no locks, the window
// playing a coin match says so in the wallet every STAKE_BEAT_MS instead, and a stake nobody has looked after for
// STAKE_STALE_MS (longer than a pause for both and a dropped connection's wait together) belongs to a match that ended.
const STAKE_LOCK = 'stapel.stake';
const LOCKS = typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function' ? navigator.locks : null;
const STAKE_BEAT_MS = 5000;
const STAKE_STALE_MS = 90000;
let stakeBeat = 0;
const coinsNow = () => store.getEconomy().coins;
/** The coins chosen to play the next live match for (0: none). */
const duelStake = () => {
  const n = store.getDuel().stake;
  return DUEL.stakes.includes(n) ? n : 0;
};

/**
 * The match starts: a coin match holds its stake now and tells the room (which makes it count only when both games
 * hold theirs). Resolves to a note when this player can't (another window plays a coin match, too few coins): the
 * match then plays for no coins, for both.
 */
async function holdMatchStake(m) {
  m.stakeHeld = false;
  if (m.kind !== 'live' || !m.stake) return '';
  const lost = await clearStaleStake();   // (a coin match that ended without its result, in a window gone since)
  if (lost) ui.toast(S.stakeEarlier(fmtInt(lost)), 4200);
  const release = await claimStakeLock();
  // (gone while the lock was asked for, or the room already said this match plays for no coins)
  if (duel.match !== m || m.outcome || m.lostConn || m.stakeOn === false) {
    release?.();
    return '';
  }
  if (!release) {
    duel.answerStake(false);
    return S.stakeBusy;
  }
  const r = store.holdStake(m.stake, m.room?.code || null, TAB_ID);
  if (!r.ok) {
    release();
    duel.answerStake(false);
    return r.reason === 'busy' ? S.stakeBusy : S.stakeNotHeld;
  }
  m.stakeHeld = true;
  m.stakeRelease = release;
  duel.answerStake(true);
  clearInterval(stakeBeat);
  stakeBeat = setInterval(() => {
    if (duel.match === m && !m.stakeDone) store.touchStake(m.room?.code || null);
    else stopStakeBeat();
  }, STAKE_BEAT_MS);
  return '';
}

/**
 * This window's claim on the wallet for one coin match: resolves to the function that lets it go, or null when another
 * window of this browser has it (without the Web Locks API: always granted; the wallet's own check stays).
 */
function claimStakeLock() {
  if (!LOCKS) return Promise.resolve(() => {});
  return new Promise((resolve) => {
    LOCKS.request(STAKE_LOCK, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(null);
        return undefined;
      }
      return new Promise((release) => resolve(release));   // held until the match's stake is settled
    }).catch(() => resolve(() => {}));
  });
}

/** Does any window of this browser play a coin match right now (hold the claim)? null: this browser can't tell. */
async function stakeLockHeld() {
  if (!LOCKS || typeof LOCKS.query !== 'function') return null;
  try {
    const q = await LOCKS.query();
    return (q?.held || []).some((l) => l.name === STAKE_LOCK);
  } catch {
    return null;
  }
}

function stopStakeBeat() {
  clearInterval(stakeBeat);
  stakeBeat = 0;
}

/**
 * The match's stake ends: 'won' gets both, anything else ('lost', 'none': the connection didn't come back) loses it.
 * Returns { n, paid, outcome, name } for the results, or null (no coins at stake for this player).
 */
function settleMatchStake(m, outcome) {
  if (!m || !m.stakeHeld || m.stakeDone) return null;
  m.stakeDone = true;
  stopStakeBeat();
  m.stakeRelease?.();   // (the browser lock: another coin match may start, in any window)
  m.stakeRelease = null;
  // (the room said the match plays for none: the stake goes back, whatever the outcome)
  const how = m.stakeOn === false || outcome === 'refund' ? 'refund' : outcome === 'won' ? 'won' : 'lost';
  const r = store.settleStake(how, m.room?.code || null);
  m.stakeResult = r.n ? { n: r.n, paid: r.paid, outcome: how === 'refund' ? 'refund' : outcome, name: m.oppName } : null;
  return m.stakeResult;
}

/** The match was settled after its results were drawn (a late verdict, a dropped connection): their coin line follows. */
function refreshResultReward(m) {
  if (screen === 'results' && m && duel.match === m) ui.setResultReward(matchReward(m));
}

/** What the results card shows for the match: its coins and rank (duelReward) and its stake. */
const matchReward = (m) => ({ ...(duelReward || {}), stake: m?.stakeResult || null });

/**
 * A held stake whose match is gone (the app was closed or the page reloaded mid-match): it is lost. Resolves to the
 * coins (0: none, or another window of this browser still plays that match).
 */
async function clearStaleStake() {
  if (!store.heldStake()) return 0;
  const m = duel.match;
  if (m && m.stakeHeld && !m.stakeDone) return 0;   // this window's own match, still on
  const lockHeld = await stakeLockHeld();
  const held = store.heldStake();
  if (!held || (duel.match?.stakeHeld && !duel.match.stakeDone)) return 0;
  if (lockHeld === true) return 0;   // another window holds the claim: its match is on
  // without locks: another tab may still play it (the app has one window: there it's always an old one)
  if (lockHeld === null && !IN_APP && held.tab !== TAB_ID && Date.now() - held.beat < STAKE_STALE_MS) return 0;
  return store.settleStake('lost', held.room).n;
}

/** Leave the match (and its live room). A coin match left before its result loses its stake. */
function leaveDuel() {
  const m = duel.match;
  duel.leave();
  const s = settleMatchStake(m, 'lost');
  if (s) ui.toast(S.stakeLeft(fmtInt(s.n)), 3600);
}

// (1.13) a match whose connection didn't come back (it doesn't count): a coin match's stake is lost (also when the
// tower had already ended)
bus.on('duel:dropped', (e) => {
  if (settleMatchStake(e?.match, 'none')) refreshResultReward(e.match);
});
// (1.13) the room's word: the match plays for no coins (the other game couldn't hold its stake, or a coin match ran out
// of time with level towers): this game's stake goes back
bus.on('duel:stake', (e) => {
  const m = e?.match;
  if (e?.on !== false || !m || !m.stakeHeld || m.stakeDone) return;
  const s = settleMatchStake(m, 'refund');
  if (s) ui.toast(S.stakeOff(fmtInt(s.n)), 3600);
  if (screen === 'duelwait') ui.setStakeLine(null);
  refreshResultReward(m);
});
bus.on('ui:duel-stake', (n) => ui.setDuelStake(store.setDuelStake(n), coinsNow()));

/** (1.13) The coins changed while the Uitdagersreeks screen is up (the Winkel): the stake picker follows. */
function coinsChanged() {
  account.soon();   // (1.14) the wallet goes to the account (signed in only; a guest: nothing)
  if (screen !== 'duel') return;
  const coins = coinsNow();
  ui.setDuelStake(duelStake() <= coins ? duelStake() : store.setDuelStake(0), coins);
}
// A friend's run (?teen=...) or live room (?kamer=CODE) from the link this page was opened with, and a
// language from the address (?lang=, already applied by js/core/langboot.js). They are taken off the
// address straight away, so a reload or a shared screenshot doesn't repeat them.
let duelLink = parseChallengeQuery(location.search);
let duelRoom = parseRoomQuery(location.search);
// The website on an Android phone: a challenge link can go on in the app (Chrome's intent: link; the
// app installed opens it, else the page stays). Built before the address is cleaned up below.
const APP_LINK = !IN_APP && /Android/i.test(navigator.userAgent || '') && (duelLink || duelRoom) && !params.has('noapp')
  ? (() => {
    const back = new URL(location.href);
    back.searchParams.set('noapp', '1');   // no app here: the page again, without the button
    return `intent://stapelspel.pages.dev/${location.search}#Intent;scheme=https;package=com.lekkerlocal.stapel;S.browser_fallback_url=${encodeURIComponent(back.href)};end`;
  })()
  : null;
// tapped: the app takes the room over, so this page lets go of it (else it would join it too)
bus.on('ui:app-open', () => {
  stopDuelFlow();
  duel.cancel();
});
if (params.has('teen') || params.has('kamer') || params.has('lang')) {
  try {
    const q = new URLSearchParams(location.search);
    q.delete('teen');
    q.delete('kamer');
    q.delete('lang');
    const rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
  } catch {
    // sandboxed frames: the parameters simply stay
  }
}
// (1.13.2) The testers' gift from its link (…/geskenk?toetser=CODE; the app doesn't claim that path, so it opens in the
// browser): the code's SHA-256 must match TESTER_GIFT.hash; once per device; then off the leaderboard and the ranks for
// good. Taken off the address at once (and /geskenk back to the game's own address); given once the menu is up (a slow
// phone's start would hide the thank-you), from onReady.
const testerCode = params.get('toetser');
if (testerCode !== null) {
  try {
    const q = new URLSearchParams(location.search);
    q.delete('toetser');
    const rest = q.toString();
    history.replaceState(history.state, '', location.pathname.replace(/\/geskenk\/?$/, '/') + (rest ? `?${rest}` : '') + location.hash);
  } catch {
    // sandboxed frames: the parameter simply stays
  }
}
async function claimTesterGift(code) {
  if (!TESTER_GIFT.on) return;
  let ok = false;
  try {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(code).trim().toLowerCase()));
    ok = Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('') === TESTER_GIFT.hash;
  } catch {
    ok = false;   // (no crypto.subtle outside https)
  }
  if (!ok) {
    ui.toast(S.testerGiftBad, 4000);
    return;
  }
  const shown = !store.getBoardHidden();
  const r = store.claimTesterGift(TESTER_GIFT.coins);
  if (!r.ok) {
    ui.toast(S.testerGiftAgain, 4000);
    return;
  }
  audio.play('heart');
  ui.toast(S.testerGift(fmtInt(r.added)), 7000);
  ui.setMenuCoins(r.coins);
  coinsChanged();
  if (shown) boardChanged();   // a result already on today's (or yesterday's) board goes off it too
}
let duelFlow = 0;        // bumps on every new search or cancel, so a late answer can't start a stale match
let duelTimer = 0;
let lastDuelKind = null;
let lastDuelMode = 'race';
let lastDuelRoom = null;   // (1.12.1) 'friend' or 'random' for a live match
let lastDuelStake = null;  // (1.13) the coins a live match was played for (a new invite after it plays for the same)
/** The way to play chosen on the Uitdagersreeks screen: 'race' (Wedloop) or 'turns' (Blok vir Blok, 1.11). */
const duelMode = () => (store.getDuel().mode === 'turns' ? 'turns' : 'race');
const otherMode = (mode) => (mode === 'turns' ? 'race' : 'turns');

function stopDuelFlow() {
  duelFlow++;
  clearInterval(duelTimer);
  duelTimer = 0;
  duel.cancel();
  ui.setSearchChip(false);
}

function showDuelScreen() {
  stopDuelFlow();
  screen = 'duel';
  // the season first: a new month drops each rank a tier and hands out last month's badge (1.12: per mode)
  const mode = duelMode();
  const rank = store.getSeasonRank(mode);
  const coins = coinsNow();
  const stake = duelStake() <= coins ? duelStake() : store.setDuelStake(0);   // (1.13) never more than the coins
  ui.showDuel({ live: duel.live, duel: store.getDuel(), placeholder: sessionNick, rank, card: store.getCard(mode), mode, stake, coins });
  seasonToast(rank.reward);
}
bus.on('ui:duel-mode', (mode) => {
  ui.setDuelMode(store.setDuelMode(mode));
  ui.setDuelRank(store.getSeasonRank(duelMode()), store.getCard(duelMode()));   // (1.12) each mode its own rank
});

/** A new month began: "Nuwe seisoen! Jy hou ’n Goud-kenteken 🥇" (the badge of the season that ended). */
function seasonToast(reward) {
  const badge = reward ? cosmetic('badge', reward) : null;
  const r = badge ? RANK_INFO[reward.slice(2)] : null;
  if (r) ui.toast(S.seasonReward(r.name, badge.emoji), 4000);
}

/** "Teen <naam>!", 3-2-1, "Bou!", then the tower. */
function versus(m, note = '') {
  if (!m) return;
  clearInterval(duelTimer);
  const flow = ++duelFlow;
  lastDuelKind = m.kind;
  lastDuelMode = m.mode === 'turns' ? 'turns' : 'race';
  lastDuelRoom = m.roomKind || null;
  lastDuelStake = m.kind === 'live' ? m.stake || 0 : null;
  ui.setConnChip(null);
  screen = 'duelwait';
  // Blok vir Blok: who drops the first block
  const first = m.mode === 'turns' && m.turn ? (m.turn.seat === m.you ? S.turnsYouStart : S.turnsTheyStart(m.oppName)) : '';
  ui.showDuelWait({
    state: 'versus', oppName: m.oppName, oppCard: m.oppCard, youName: duelNick(), youCard: store.getCard(lastDuelMode),
    note, mode: lastDuelMode, first, stake: m.kind === 'live' ? m.stake : 0, canLeave: m.kind !== 'live',
  });
  // (1.13) a coin match: the stake leaves the wallet now; a player who can't put it in hears why (the match then
  // plays for no coins: the room tells both)
  holdMatchStake(m).then((why) => {
    if (!why || duel.match !== m) return;
    if (screen === 'duelwait') ui.setStakeLine(null);
    ui.toast(why, 3600);
  });
  let n = Math.max(1, Math.round(DUEL.countdownMs / 1000));
  ui.setDuelCount(String(n));
  duelTimer = setInterval(() => {
    if (flow !== duelFlow) return;
    n -= 1;
    if (n > 0) {
      ui.setDuelCount(String(n));
      audio.play('click');
      return;
    }
    clearInterval(duelTimer);
    ui.setDuelCount(S.duelGo);
    audio.play('banner');
    setTimeout(() => {
      if (flow === duelFlow && duel.match === m) startDuelGame(m);   // (the match must still be the one shown)
    }, 450);
  }, 1000);
}

function startDuelGame(m) {
  if (!m.outcome) duelReward = null;   // (a match decided during the 3-2-1 keeps its coins for the results)
  resetRun('duel');
  // (1.12) emoji reactions in a live match or against Robot Rikus (a recording or a friend's link can't see them)
  ui.setEmotes(m.kind === 'live' || m.kind === 'bot' ? {} : null);
  startGame({
    mode: 'duel',
    seed: m.seed,
    duel: { name: m.oppName, youName: duelNick(), mode: m.mode, you: m.you, bot: m.kind !== 'live', oppBlocks: m.kind === 'live' ? m.oppCard?.bs || '' : '', oppGo: m.kind === 'live' && (m.oppV || 1) >= 4, rounds: m.rounds === true, v7: m.v7 === true,
      // (1.12) both ranks in this mode, in front of the names at the top ('🥇II'); a recording has none
      oppRank: m.kind === 'live' || m.kind === 'bot' ? rankShortOf(m.oppCard?.rl) : '', youRank: rankShortOf(store.getCard(m.mode).rl) },
    autoplay: AUTO,
  });
  screen = 'game';
  ui.showInGame();
  renderTray();
}

function showDuelResults(r) {
  account.soon();   // (1.13) the match's coins and rank go to the account
  if (screen === 'results' || run.mode !== 'duel') return;
  ui.setEmotes(null);
  const d = duel.summary() || {};
  if (!d.outcome) d.outcome = 'none';
  // Wedloop: the share link is your run (a friend races it); Blok vir Blok: the game itself
  const link = d.challenge ? `${siteUrl()}?teen=${d.challenge}` : d.mode === 'turns' ? siteUrl() : '';
  screen = 'results';
  ui.setConnChip(null);
  ui.showResults({
    result: r,
    mode: 'duel',
    duel: d,
    again: duel.canAgain() ? { name: d.oppName || S.duelSomeone } : null,
    againStake: lastDuelStake > 0 ? lastDuelStake : 0,   // (1.13) "Speel weer" plays for the same coins
    // (1.15.3) ...or other coins, picked under the button: after a live match against a person (a friend room only when
    // both games know it); the chips above the player's coins can't be picked
    againStakes: lastDuelKind === 'live' && duel.live && (!duel.canAgain() || duel.canChangeStake()) ? { coins: coinsNow() } : null,
    reward: matchReward(duel.match),
    shareText: buildDuelShareText({ outcome: d.outcome, youBest: d.youBest, oppName: d.oppName, oppBest: d.oppBest, link, mode: d.mode }),
    nextDayAt: 0,
  });
  // the winner's celebration (js/core/economy.js): ours with the fanfare, or theirs as they see it
  if (d.outcome === 'won') ui.celebrate(store.getCard().celebration);
  else if (d.outcome === 'lost' && d.reason !== 'quit') ui.celebrate(d.oppCard?.celebration, { caption: S.duelTheyCelebrate(d.oppName || S.duelSomeone), sound: false });
  seasonToast(duelReward?.rank?.reward);   // this match began a new month
  sleepLoop(RESULTS_SLEEP_MS);
}

/**
 * A random opponent (1.10): no time limit. Wait on the screen, or build an Oefen tower meanwhile (a chip
 * at the top says the search goes on); play now against a recording or Robot Rikus at any time. When
 * someone comes: "Teen <naam>!", 3-2-1, the match.
 */
function searchOpponent() {
  const mode = duelMode();
  const stake = duelStake();
  if (stake && coinsNow() < stake) {   // (1.13) too few coins for the amount chosen: choose again
    showDuelScreen();
    ui.toast(S.stakeNeed(fmtInt(stake), fmtInt(coinsNow())), 3400);
    return;
  }
  stopDuelFlow();
  const flow = duelFlow;
  screen = 'duelwait';
  ui.showDuelWait({ state: 'lobby', mode, stake });
  duel.findOpponent({
    mode,
    stake,
    onFound: (m) => {
      if (flow === duelFlow) opponentFound(m);
    },
    // (a recording or Robot Rikus: never for coins)
    onFallback: (m, note) => {
      if (flow !== duelFlow) return;
      ui.setSearchChip(false);
      versus(m, stake ? `${note} ${S.stakeNoBot}` : note);
    },
    onRetry: () => {
      if (flow === duelFlow && screen === 'duelwait') ui.setDuelCount(S.duelReconnecting);
    },
  });
}

/** Someone came: an Oefen tower built meanwhile stands still (it doesn't count), and the match begins. */
function opponentFound(m) {
  ui.setSearchChip(false);
  if (run.mode === 'practice' && !run.over) {
    // paused, not restarted: a restart would end the match's connection with it
    if (game.scene.isActive('Game')) game.scene.pause('Game');
    if (game.scene.isActive('Hud')) game.scene.pause('Hud');
  }
  versus(m);
}

// "Oefen terwyl jy wag": an Oefen tower while the search goes on
bus.on('ui:duel-practice', () => {
  if (!duel.searching) return;
  resetRun('practice');
  startGame({ mode: 'practice', seed: SEED_OVERRIDE || randomSeed('oefen'), autoplay: AUTO });
  screen = 'game';
  ui.showInGame();
  renderTray();
  ui.setSearchChip(true);
});
// (1.13.4, the owner) after an Oefen tower while a search runs: look in the other mode (the same coins) instead
bus.on('ui:duel-switch', () => {
  ui.setDuelMode(store.setDuelMode(otherMode(duelMode())));
  if (duel.searching) searchOpponent();
  else showDuelScreen();   // the search ended meanwhile: the Uitdagersreeks, the new mode chosen
});
// "Speel dadelik": stop looking, a recording of a real match or Robot Rikus now
bus.on('ui:duel-now', () => duel.playNow());
// the chip's ✕: stop looking (the Oefen tower goes on)
bus.on('ui:duel-search-stop', () => {
  stopDuelFlow();
  ui.setSearchChip(false);
});

// (1.15.3, the owner: "there is not a lot of players ... the guy playing for 100 coins should get a notification that
// there is someone willing to play for 50 coins do you accept? Also the same for wedloop and block for block") the
// lobby's offer: a question on the waiting screen (or over an Oefen tower built meanwhile); 15 s, then no
const OFFER_MS = 15000;
let offerNow = null;
function answerOffer(yes) {
  const o = offerNow;
  if (!o) return;
  clearTimeout(o.timer);
  offerNow = null;
  if (!duel.answerOffer(o.id, yes)) return;
  if (yes) ui.toast(S.offerGo(o.name), 2600);
}
bus.on('duel:offer', (o) => {
  if (!duel.searching || !o) return;
  if (o.stake && coinsNow() < o.stake) {   // (never: the one asked looked for more coins; a wallet spent meanwhile)
    duel.answerOffer(o.id, false);
    return;
  }
  if (offerNow) clearTimeout(offerNow.timer);
  offerNow = { ...o, timer: setTimeout(() => {
    if (ui.view().modal === 'offer') ui.closeModal();
    answerOffer(false);
  }, OFFER_MS) };
  ui.showOffer({ name: o.name, mode: o.mode, stake: o.stake, ms: OFFER_MS });
  audio.play('banner');
  haptics.tap();
});
bus.on('ui:offer-yes', () => answerOffer(true));
bus.on('ui:offer-no', () => answerOffer(false));
bus.on('duel:offer-gone', () => {
  if (offerNow) {
    clearTimeout(offerNow.timer);
    offerNow = null;
    if (ui.view().modal === 'offer') ui.closeModal();
  }
  ui.toast(S.offerGone, 3000);
});

bus.on('ui:duel', showDuelScreen);
// (1.12) the emoji button follows its match: the cooldown after a send, muting, and gone with the match
bus.on('duel:emotes', (s) => ui.updateEmotes({ left: s?.left || 0, spent: !!s?.spent }));
bus.on('duel:emote-muted', (muted) => ui.updateEmotes({ muted: !!muted }));
// first to a height mark: choose the punishment (js/duel.js times it out with the default)
bus.on('duel:choose', (c) => ui.showPunish(c));
bus.on('duel:chosen', () => ui.hidePunish());
const NAME_BOARD_MS = 4000;
let nameBoardTimer = 0;
bus.on('ui:duel-name', (text) => {
  const saved = store.setDuelName(text);
  ui.setDuelName(saved);
  if (saved?.ok) {
    clearTimeout(nameBoardTimer);
    nameBoardTimer = setTimeout(boardChanged, NAME_BOARD_MS);   // the latest leaderboard row takes the new name
    account.soon();
  }
});
// (1.12.1) the nickname from the ranglys or Statistiek too (before, only in the Uitdagersreeks): saved through
// 'ui:duel-name' as there, then back to the sheet it was opened from
bus.on('ui:name', (from) => {
  const back = from === 'board' ? () => bus.emit('ui:board') : from === 'stats' ? () => ui.showStats() : null;
  ui.showName({ name: store.getDuel().name || '', placeholder: sessionNick, back });
});
bus.on('ui:duel-bot', () => versus(duel.startBot(duelMode())));
bus.on('ui:duel-random', searchOpponent);
bus.on('ui:duel-friend', () => {
  const mode = duelMode();
  if (!duel.live) {
    // no server yet: play a round first; its results carry the link for the friend (Wedloop: a run to
    // race; Blok vir Blok needs two, so it's simply a game against Robot Rikus)
    versus(duel.startBot(mode), mode === 'turns' ? S.turnsBotNow : S.duelFriendLater);
    return;
  }
  const stake = duelStake();
  if (stake && coinsNow() < stake) {   // (1.13) too few coins for the amount chosen: choose again
    showDuelScreen();
    ui.toast(S.stakeNeed(fmtInt(stake), fmtInt(coinsNow())), 3400);
    return;
  }
  stopDuelFlow();
  const flow = duelFlow;
  duel.createRoom({
    mode,
    stake,
    onCode: (code) => {
      if (flow !== duelFlow) return;
      const link = `${siteUrl()}?kamer=${code}`;
      screen = 'duelwait';
      ui.showDuelWait({ state: 'room', link, shareText: S.duelRoomText(duelNick(), link, mode, stake), mode, stake });
    },
    onStart: (m) => {
      if (flow === duelFlow) versus(m);
    },
    onFail: (msg) => {
      if (flow !== duelFlow) return;
      screen = 'duelwait';
      ui.showDuelWait({ state: 'error', text: msg });
    },
    // the link was shared from another app: the room waits, and the game finds its way back to it
    onRetry: () => {
      if (flow === duelFlow) ui.setDuelWaitNote(S.duelReconnecting);
    },
    onWait: () => {
      if (flow === duelFlow) ui.setDuelWaitNote(null);
    },
    // (1.12.1) a friend answered "Sorry, besig nou" (1.13: or has too few coins): said here; the room waits on for
    // anyone else
    onDeclined: (name, why) => {
      if (flow !== duelFlow) return;
      const text = why?.old ? S.duelDeclinedOld(name) : why?.coins ? S.duelDeclinedCoins(name) : S.duelDeclined(name);
      ui.setDuelWaitNote(text);
      ui.toast(text, 3500);
    },
  });
});
bus.on('ui:duel-later', () => {
  stopDuelFlow();
  const mode = duelMode();
  versus(duel.startBot(mode), mode === 'turns' ? S.turnsBotNow : S.duelFriendLater);
});
bus.on('ui:duel-cancel', showDuelScreen);
// (1.13.3, the owner: "I cant seem to exit once I have opened it, can you fix that as well, for the bot only") the 3-2-1
// against Robot Rikus, a recording or a friend's recorded run can be left (✕, "Kanselleer", Back): back to the
// Uitdagersreeks, nothing counted (no rank, no coins: those matches never have them). A live match's 3-2-1 stays.
bus.on('ui:duel-leave', () => {
  const m = duel.match;
  if (!m || m.kind === 'live' || screen !== 'duelwait') return;
  duel.leave();
  showDuelScreen();
});
bus.on('ui:duel-accept', () => {
  const m = duelLink ? duel.startLink(duelLink) : null;
  duelLink = null;
  if (m) versus(m);
  else showDuelScreen();
});
bus.on('ui:duel-again', (o) => {
  // (1.15.3, the owner: "there is no way to change the stake after we have played") the results' coin chips: the stake
  // for the next match (undefined: as before, the same)
  const pick = Number.isFinite(o?.stake) ? o.stake : undefined;
  // (1.12.1, the owner: "if I say play again after I challenged a friend then it shows finding an opponent")
  // after a friend match: the same friend, in the same room (the match starts once both said it)
  if (duel.canAgain()) {
    const m = duel.match;
    const want = pick !== undefined && duel.canChangeStake() ? pick : m?.stake || 0;
    if (want && coinsNow() < want) {   // (1.13) a coin match again needs the coins again
      ui.toast(S.stakeAgainShort(fmtInt(want)), 3400);
      return;
    }
    duel.again(duel.canChangeStake() ? want : undefined);
    return;
  }
  leaveDuel();
  // the same way to play as the match just played (1.13: and for the same coins; 1.15.3: or the coins picked now)
  store.setDuelMode(lastDuelMode);
  if (pick !== undefined && lastDuelKind === 'live') store.setDuelStake(pick > coinsNow() ? 0 : pick);
  else if (lastDuelStake !== null) store.setDuelStake(lastDuelStake);
  if (duel.live && lastDuelKind === 'live' && lastDuelRoom === 'friend') bus.emit('ui:duel-friend');   // a new invite
  else if (duel.live && lastDuelKind !== 'bot') searchOpponent();
  else versus(duel.startBot(lastDuelMode));
});
bus.on('duel:again', (e) => ui.setAgain(e?.state, e?.name || S.duelSomeone, e?.stake));
bus.on('duel:rematch', (m) => {
  if (screen !== 'results' && screen !== 'duelwait') return;
  stopDuelFlow();
  versus(m);
});

let inviteFrom = '';   // (1.12.1) who invited, while their link's question is on screen
let inviteStake = 0;   // (1.13) ...and the coins each puts in (0: none)
bus.on('ui:invite-yes', () => {
  if (inviteStake && coinsNow() < inviteStake) {
    ui.toast(S.inviteShort(fmtInt(coinsNow())), 3200);
    return;
  }
  if (!duel.acceptInvite()) return;
  ui.showDuelWait({ state: 'search', appLink: APP_LINK });
  ui.setDuelCount(S.duelJoining);
});
bus.on('ui:invite-no', (o) => {
  const coins = o?.coins === true;   // (1.13) "Laat weet: te min munte"
  if (!duel.declineInvite({ coins })) return;
  stopDuelFlow();
  showMenu();
  ui.toast(coins ? S.inviteCoinsSent(inviteFrom || S.duelSomeone) : S.inviteBusySent(inviteFrom || S.duelSomeone), 3200);
});

/** Opened from a friend's link: their run (play it now?) or their live room (join it). */
function openDuelLink() {
  if (duelLink) {
    const best = Math.max(0, ...duelLink.run.samples) / 10;
    screen = 'duelwait';
    ui.showDuelWait({ state: 'link', oppName: duelLink.name || S.duelSomeone, height: best, appLink: APP_LINK });
    return true;
  }
  if (duelRoom) {
    const code = duelRoom;
    duelRoom = null;
    stopDuelFlow();
    const flow = duelFlow;
    screen = 'duelwait';
    if (!duel.live) {
      ui.showDuelWait({ state: 'error', text: S.duelOffline });
      return true;
    }
    ui.showDuelWait({ state: 'search', appLink: APP_LINK });
    ui.setDuelCount(S.duelJoining);
    duel.joinRoom(code, {
      // (1.12.1) who invites and which mode, then "Speel" or "Sorry, besig nou" (nothing starts before)
      invite: true,
      onInvite: (host) => {
        if (flow !== duelFlow) return;
        inviteFrom = host.name || S.duelSomeone;
        inviteStake = host.stake || 0;
        ui.showDuelWait({ state: 'invite', oppName: inviteFrom, mode: host.mode, stake: inviteStake, coins: coinsNow(), appLink: APP_LINK });
      },
      onStart: (m) => {
        if (flow === duelFlow) versus(m);
      },
      onFail: (msg) => {
        if (flow !== duelFlow) return;
        ui.showDuelWait({ state: 'error', text: msg });
      },
      onRetry: () => {
        if (flow === duelFlow) ui.setDuelCount(S.duelReconnecting);
      },
      onWait: () => {
        if (flow === duelFlow) ui.setDuelCount(S.duelJoining);
      },
    });
    return true;
  }
  return false;
}

// Game over: the pause button goes away during the reveal (results follow).
bus.on('hud:hide', () => {
  if (screen === 'game' && run.mode !== 'idle') ui.hideAll();
});

bus.on('game:started', (partial) => {
  if (run.mode === 'idle') return;
  run.started = true;
  if (run.mode === 'daily' && partial && partial.dateKey) {
    if (run.retry) store.startDailyRetry(partial.dateKey, partial, { owner: TAB_ID });
    else store.startDaily(partial.dateKey, partial, { owner: TAB_ID });
    startHeartbeat();
  }
});
bus.on('game:progress', (partial) => {
  if (run.mode !== 'daily' || !partial || !partial.dateKey || run.over) return;
  if (run.retry) store.saveDailyRetryProgress(partial.dateKey, partial);
  else store.saveDailyProgress(partial.dateKey, partial);
});

// (1.12) "See your result" on the daily card: the try that counts, never a second try's start
bus.on('ui:daily-results', () => {
  const dateKey = todayKey();
  const best = store.getDailyBest(dateKey);
  if (best) showDoneResults(dateKey, best);
  else playDaily();
});
// (1.12) "Nog 'n kans": buy the day's second try with coins, and play it at once
bus.on('ui:daily-retry', () => {
  const dateKey = todayKey();
  const r = store.buyDailyRetry(dateKey);
  if (!r.ok) {
    ui.toast(r.reason === 'coins' ? S.retryNeed(r.price - r.coins) : r.reason === 'max' ? S.retryMax : S.retryBusy, 2600);
    return;
  }
  // (1.13.1) a free try ("Poging 2 van 3: gratis!") or a bought one
  ui.toast(r.price === 0 ? S.freeTryGo(r.n + 1, store.dailyTries(dateKey).free) : S.retryBought, 2400);
  playDaily();
});

/** Coins for a finished game (js/core/economy.js): { added, total, short } (short: the day's cap held some back). */
function awardCoins(game) {
  const earned = coinsForGame(game);
  if (!earned.coins) return { added: 0, total: store.getEconomy().coins, short: false };
  const r = store.earnCoins(earned.coins, { capped: earned.capped });
  return { added: r.added, total: r.coins, short: r.added < earned.coins };
}

/**
 * Dailies that ended without their results (the page was closed, the app killed or crashed mid-game)
 * count as they were when they stopped, and pay their coins like any finished daily. Returns the coins.
 */
function payRecovered(results) {
  if (!results?.length) return 0;
  const streak = store.getStats().currentStreak;
  return results.reduce((sum, r) => {
    const paid = awardCoins({ mode: 'daily', heightM: r.heightM, perfects: r.perfects, streak }).added;
    const box = store.openWeekBox(r.dateKey);   // its try is used: its box opens
    return sum + paid + (box ? box.coins : 0);
  }, 0);
}

/** The result is saved the moment the game ends (the results screen comes a few seconds later). */
function finalize(result) {
  if (run.final) return run.final;
  run.over = true;
  stopHeartbeat();
  if (result.mode === 'duel') {
    // a match keeps its own wins and losses (recorded by js/duel.js once it is decided)
    run.final = { result, stats: null, isNewBest: false, aborted: false };
    return run.final;
  }
  let shown = result;
  let stats = null;
  let isNewBest = false;
  let aborted = false;
  if (result.mode === 'daily' && result.dateKey && run.retry) {
    // (1.12) the second try: left before its first drop, it's still there; else the better try counts
    if (result.blocksDropped === 0 && store.getDailyRetry(result.dateKey)?.status === 'ready') {
      aborted = true;
    } else {
      stats = store.finishDailyRetry(result.dateKey, result);
      pushSkyline();
      isNewBest = !!(stats.applied && (stats.isNewBestHeight || stats.isNewBestScore));
      // ("poging 3"; 1.13.1: "poging 2/3" on a day with free tries, in the chip and the share line)
      shown = { ...result, retry: true, tryNo: 1 + (store.getDailyRetry(result.dateKey)?.n || 1), freeTries: store.dailyTries(result.dateKey).free };
      store.setBoardPending(true);   // the better of the two goes on the board, marked 🔁
    }
  } else if (result.mode === 'daily' && result.dateKey) {
    if (result.blocksDropped === 0 && !store.getDaily(result.dateKey)) {
      aborted = true;   // left before the first drop: nothing was played, the try is still there
    } else {
      stats = store.finishDaily(result.dateKey, result);
      pushSkyline();   // today's tower joins the skyline behind the results
      isNewBest = !!(stats.applied && (stats.isNewBestHeight || stats.isNewBestScore));
      if (!stats.applied) {
        // finished (or taken over) elsewhere: show and share what actually counts
        const e = store.getDaily(result.dateKey);
        if (e && e.result) shown = e.result;
      }
    }
  } else {
    const rec = store.recordPractice(result);
    isNewBest = !!rec.isNewBest;
  }
  // coins: the daily tower pays in full (once); Oefen counts towards the day's cap
  let coins = null;
  let week = null;
  if (result.mode === 'daily' && stats?.applied && !run.retry) {   // (the second try was bought: it pays nothing)
    coins = awardCoins({ mode: 'daily', heightM: shown.heightM, perfects: shown.perfects, streak: stats.currentStreak });
    week = store.openWeekBox(result.dateKey);   // the day's box of the weekkis
    if (week) coins = { ...coins, total: week.total };
  } else if (result.mode === 'practice') {
    coins = awardCoins({ mode: 'practice', heightM: result.heightM, perfects: result.perfects });
  }
  run.final = { result: shown, stats, isNewBest, aborted, coins, week };
  return run.final;
}

bus.on('game:final', (result) => {
  if (!result || run.mode === 'idle') return;
  finalize(result);
  // the first real game is the tutorial: once it got somewhere, the hints and the menu nudge are done
  if (tutorialDone(result.blocksDropped)) store.markTutorialSeen();
});

bus.on('game:over', (result) => {
  if (lesson) endLesson();
  if (!result || run.mode === 'idle' || screen === 'results' || screen === 'menu') return;
  // (1.12.1) an opponent was found while this Oefen tower's fall was shown: the tower counts, but its results
  // stay away (the "Teen …! 3-2-1" is on screen and the match starts from there)
  if (screen === 'duelwait' || screen === 'duel') {
    if (result.mode !== 'duel') finalize(result);
    return;
  }
  const f = finalize(result);
  if (run.paused) resumeScenes();
  if (result.mode === 'duel') {
    duel.whenDecided(() => showDuelResults(f.result));
    return;
  }
  if (f.aborted || quitHome) {
    const home = quitHome && !f.aborted;
    const added = f.coins?.added || 0;
    startIdle();
    showMenu();
    if (home && added > 0) ui.toast(`+${fmtInt(added)} 🪙`, 2400);
    if (home && result.mode === 'daily') planReminders();   // today is built: no reminder today
    return;
  }
  if (f.isNewBest) audio.play('record');
  screen = 'results';
  const r = f.result;
  ui.showResults({
    result: r,
    stats: f.stats,
    isNewBest: f.isNewBest,
    reward: f.coins || f.week ? { coins: f.coins, week: f.week } : null,
    shareText: shareTextFor(r),
    nextDayAt: r.mode === 'daily' ? nextDayFor(r.dateKey) : 0,
    mode: r.mode,
    // (1.13.4, the owner) an Oefen tower while a search runs: "Verander na Blok vir Blok / Wedloop"
    switchTo: r.mode === 'practice' && duel.searching ? otherMode(duelMode()) : null,
    // (1.14) a new best: the one gentle "save your progress" offer (when due; never a popup)
    signinOffer: !!f.isNewBest && takeSigninOffer(),
    ...resultsExtras(r),
  });
  showPercentile(r);
  sleepLoop(RESULTS_SLEEP_MS);
  account.soon();   // (1.13) the tower goes to the account (a finished daily: done on the other devices too)
  if (r.mode === 'daily') {
    planReminders();   // today is built: no reminder today
    if (REMIND && !store.getReminder().asked) setTimeout(askReminder, 2600);
  }
});

// Tab hidden / app switched away mid-tower: pause like the button does, and save. A friend room
// still waiting lets go of its connection meanwhile (the match can't start without this player).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveProgressNow();
    duel.away();
    if (canPause()) pauseGame();
    else audio.suspend();
    account.sync();   // (1.13) what was done here goes to the account (a tower in progress waits)
  } else {
    duel.back();
    planReminders();
    if (!run.paused) audio.resume();
    account.wake();
  }
});
window.addEventListener('pagehide', saveProgressNow);

// Sideways phone: the rotate overlay covers the game, so pause it.
const landscapeMq = window.matchMedia ? matchMedia('(orientation: landscape) and (max-height: 540px) and (pointer: coarse)') : null;
const landscape = () => !!(landscapeMq && landscapeMq.matches);
function onOrientation() {
  if (landscape() && canPause()) pauseGame();
  scheduleLayout();
}
if (landscapeMq) {
  if (landscapeMq.addEventListener) landscapeMq.addEventListener('change', onOrientation);
  else if (landscapeMq.addListener) landscapeMq.addListener(onOrientation);
}

// ---------------------------------------------------------------------------
// Layout: keep the DOM overlay exactly over the canvas; expose safe-area insets
// (in game px) so the HUD can avoid notches.
// ---------------------------------------------------------------------------
const insetProbe = document.createElement('div');
insetProbe.setAttribute('aria-hidden', 'true');
insetProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
  // (the app's SystemBars plugin sets --safe-area-inset-*: older Android WebViews get env() wrong)
  + 'padding-top:var(--safe-area-inset-top,env(safe-area-inset-top,0px));'
  + 'padding-bottom:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px));';
document.body.appendChild(insetProbe);

let refitGuard = 0;
function relayout() {
  const canvas = game.canvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return;
  // A fitted canvas fills its parent in one direction. If it doesn't, Phaser re-fitted
  // with a stale size (its orientation handler can run after the resize): fit again.
  const parent = document.getElementById('game');
  const pr = parent ? parent.getBoundingClientRect() : null;
  if (pr && Math.abs(rect.width - pr.width) > 2 && Math.abs(rect.height - pr.height) > 2 && refitGuard < 3) {
    refitGuard++;
    refit();
    return;
  }
  refitGuard = 0;
  ui.layout(rect);
  const cs = getComputedStyle(insetProbe);
  const k = GAME_W / rect.width;
  const top = Math.max(0, (parseFloat(cs.paddingTop) || 0) - Math.max(0, rect.top)) * k;
  const bottom = Math.max(0, (parseFloat(cs.paddingBottom) || 0) - Math.max(0, window.innerHeight - rect.bottom)) * k;
  game.registry.set('safeTop', Math.round(top));
  game.registry.set('safeBottom', Math.round(bottom));
  updateMenuAnchor();
}

/**
 * Re-fit the canvas, then the DOM. Phaser re-fits on its own orientation event
 * while the old parent size is still cached (and then never again), so after a
 * rotation the canvas could stay sized for the other orientation.
 */
function refit() {
  try {
    game.scale.getParentBounds();
    game.scale.refresh();   // emits 'resize' -> scheduleRelayout
  } catch {
    // not booted yet
  }
}

// (1.12.1) The keyboard. In the app (and browsers that do the same) it makes the window shorter, and the game
// re-fitted to that: the whole screen shrank while a nickname was typed. While a text box has the focus and only
// the height went down, the game and the screens keep their size (the box moves up into sight, js/ui/dom.js).
const KEYBOARD_MIN_PX = 80;   // a smaller change is the system bars, not a keyboard
const gameBox = document.getElementById('game');
let roomy = { w: window.innerWidth, h: window.innerHeight };   // the window without a keyboard
let keyboardUp = false;
function typingInBox() {
  const a = document.activeElement;
  if (!a) return false;
  if (a.tagName === 'TEXTAREA' || a.isContentEditable) return true;
  return a.tagName === 'INPUT' && !/^(button|checkbox|radio|range|submit|reset|file|color|hidden|image)$/i.test(a.type || '');
}
/** Called on every resize, before anything re-fits: true while the keyboard is up (nothing re-fits then). */
function holdForKeyboard() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (typingInBox() && Math.abs(w - roomy.w) < 2 && h < roomy.h - KEYBOARD_MIN_PX) {
    keyboardUp = true;
    gameBox.style.height = `${roomy.h}px`;   // Phaser keeps fitting #game: it keeps its size
    document.documentElement.classList.add('kb-up');   // a short phone's window is wider than tall now: no "turn upright"
    ui.setKeyboard(true);
    return true;
  }
  if (keyboardUp) {
    keyboardUp = false;
    gameBox.style.height = '';
    document.documentElement.classList.remove('kb-up');
    ui.setKeyboard(false);
  }
  if (!typingInBox()) roomy = { w, h };
  return false;
}
// the size just before the keyboard comes up (the window may not have changed since it loaded)
document.addEventListener('focusin', () => {
  if (!keyboardUp && typingInBox()) roomy = { w: window.innerWidth, h: window.innerHeight };
});
// typing done, yet no resize said the keyboard went (a desktop window made shorter while typing, a keyboard
// that stays): fit the window as it is
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (keyboardUp && !typingInBox()) {
      holdForKeyboard();
      scheduleLayout();
    }
  }, 600);
});

let layoutRaf = 0;
let layoutTimer = 0;
/** Window resized or rotated: re-fit Phaser (which fires its own 'resize'), then the DOM. */
function scheduleLayout() {
  cancelAnimationFrame(layoutRaf);
  clearTimeout(layoutTimer);
  layoutRaf = requestAnimationFrame(() => {
    if (keyboardUp) return;
    refit();
    relayout();
    layoutTimer = setTimeout(() => {   // the browser settles bars/rotation a beat later
      if (keyboardUp) return;
      refit();
      relayout();
    }, 120);
  });
}
/** Phaser re-fitted the canvas: only the DOM follows (re-fitting again here would loop). */
function scheduleRelayout() {
  cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(relayout);
}
// (in the resize event itself: Phaser looks at #game's size on its next frame)
const onResize = () => {
  if (!holdForKeyboard()) scheduleLayout();
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', scheduleLayout);
if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
  window.screen.orientation.addEventListener('change', scheduleLayout);
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
// (1.15.3, the owner's photos: in the app the menu's Statistiek and the results' Deel buttons sat under the phone's Back
// and Home buttons) the app's SystemBars plugin (insetsHandling "css") writes the phone's real bar heights on <html> as
// --safe-area-inset-* once the page shows, and again when they change; no resize comes with that, so measure again then
if (typeof MutationObserver === 'function') {
  const insetVars = () => ['top', 'right', 'bottom', 'left'].map((k) => document.documentElement.style.getPropertyValue(`--safe-area-inset-${k}`)).join();
  let lastInsets = insetVars();
  new MutationObserver(() => {
    const now = insetVars();
    if (now !== lastInsets) {
      lastInsets = now;
      scheduleLayout();
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function onReady() {
  game.scale.on('resize', scheduleRelayout);
  relayout();
  watchContextLoss();

  const recovered = store.recoverUnfinished(todayKey(), { staleMs: STALE_AFTER_MS, owner: TAB_ID });
  const recoveredCoins = payRecovered(recovered);
  refundRetries();
  // (1.13) a coin match that ended without its result (the app closed mid-match, a reload): its stake is lost
  clearStaleStake().then((n) => {
    if (n) setTimeout(() => ui.toast(S.stakeEarlier(fmtInt(n)), 4200), 1200);
  });
  startIdle();
  showMenu();
  loadDailyTries();   // (1.13.1) the free tries a day: the Worker's word (the menu follows when it changes)
  account.sync();   // (1.14) signed in: the account's latest at once
  retryBoard();
  planReminders();
  // a new player chooses a language first; a challenge link waits for that choice
  if (askLanguage) ui.showLanguage({ first: true });
  else if (!openAccountLink() && !openDuelLink()) firstVisit();
  ui.setLoading(false);
  if (recovered.length) ui.toast(recoveredCoins ? `${S.unfinished} +${recoveredCoins} 🪙` : S.unfinished, 3600);
  else if (liveElsewhere(todayKey())) ui.toast(S.otherTab, 3000);
  if (testerCode !== null) setTimeout(() => claimTesterGift(testerCode), 900);   // (1.13.2) the testers' gift
  if (DEBUG) startFpsMeter();
  setTimeout(capFrames, 1500);   // (once the start-up's work is done: a busy start would measure low)
  window.__stapel.booted = true;
}

/** A GPU reset mid-tower: pause (the water must not rise unseen) and say so if it doesn't come back. */
function watchContextLoss() {
  const r = game.renderer;
  const ev = Phaser.Renderer && Phaser.Renderer.Events;
  if (!r || !r.on || !ev || !ev.LOSE_WEBGL) return;
  let lostTimer = 0;
  r.on(ev.LOSE_WEBGL, () => {
    if (canPause()) pauseGame();
    clearTimeout(lostTimer);
    lostTimer = setTimeout(() => ui.toast(S.reloadNeeded, 6000), 3000);
  });
  r.on(ev.RESTORE_WEBGL, () => clearTimeout(lostTimer));
}

if (game.isBooted) onReady();
else game.events.once('ready', onReady);

// ---------------------------------------------------------------------------
// Service worker (offline play). Not for debug sessions.
// ---------------------------------------------------------------------------
const swAllowed = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if ('serviceWorker' in navigator && swAllowed && !NO_SW) {
  const registerSw = () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  if (document.readyState === 'complete') registerSw();
  else window.addEventListener('load', registerSw, { once: true });
}

// ---------------------------------------------------------------------------
// Debug: tiny fps meter
// ---------------------------------------------------------------------------
function startFpsMeter() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:99;padding:2px 6px;border-radius:6px;'
    + 'font:12px/1.3 monospace;color:#fff;background:rgba(0,0,0,.55);pointer-events:none;';
  document.body.appendChild(el);
  setInterval(() => {
    const gs = gameScene();
    const st = gs && gs.sys.isActive() && gs.getState ? gs.getState() : null;
    el.textContent = `${Math.round(game.loop.actualFps)} fps`
      + (st ? ` · ${st.mode} #${st.i} · ${st.heightM} m · ⭐${st.score} · ❤${st.lives}${st.active ? ' · ' + st.active : ''}` : '');
  }, 500);
}
