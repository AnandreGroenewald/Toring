// Stapel — boot + wiring: Phaser game, storage, DOM UI, audio, bus events,
// pause/visibility, settings, service worker and debug hooks.
// First of all: the language, before any other module reads a string (js/core/langboot.js).
import { SAVED_LANG, PREVIEW_LANG } from './core/langboot.js';
import { GAME_W, computeGameHeight, SITE_URL_FALLBACK, STORAGE_KEY, DUEL, TESTER_GIFT, REFILL, AUTH, VERSION, KASTEEL, GLYBAAN } from './config.js';
import { bus } from './core/bus.js';
import { S, POWERUP_INFO, COSMETIC_INFO, RANK_INFO } from './core/strings.js';
import { fmtDateKey, fmtM, fmtInt } from './core/format.js';
import { createStore } from './core/storage.js';
import { dateKeyFor, dayNumber, seedFor, nextDayTimestamp, parseDebugDate, isDateKey, addDays, daysBetween } from './core/daily.js';
import { createSequence } from './core/sequence.js';
import { buildShareText, buildDuelShareText } from './core/share.js';
import { parseChallengeQuery, parseRoomQuery, defaultNicknameFor } from './core/duel.js';
import { coinsForGame, cosmetic, POWERUP_IDS, POWERUPS, rankShortOf, SKINS, TRIBE_PRICE } from './core/economy.js';
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
import { LewendeScene } from './scenes/LewendeScene.js';
import { DorpScene } from './scenes/DorpScene.js';
import { SlagScene } from './scenes/SlagScene.js';
import { makeCastle, castlePeople, battleFruit, battleReward, harvest, addFruit, cleanBasket, newBasket, SLAG } from './core/slag.js';
import { createSlagNet } from './slagNet.js';
import { createLewendeUi } from './ui/lewendeUi.js';
import { createLivingStore, CAST_IDS } from './core/living.js';
import { createDorpClient } from './dorp.js';
import { createSpan } from './span.js';
import { DORP, RIKUS_ID, markOf, isTownId, isRaidId } from './core/dorp.js';
import { castOf, portraitDataUrl } from './game/residents.js';
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
// (1.17) Vrugteslag is set aside (the owner, 17 Oct 2026: "lets forget about the fruit, lets bring in troops and
// machinary"): Die Kasteelreeks (kasteel.html) takes its place in the menu. Its code stays, switched off.
const SLAG_ON = false;

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
// (1.20) Ons dorp: your crew's week on this phone (the Weektoring, build turns, today's ride, the town's people)
const span = createSpan({
  debug: DEBUG,   // (a debug session keeps its own week)
  castIds: CAST_IDS,
  // (rescued people count towards the day's coin cap; Saturday's prize doesn't)
  earn: (n, o) => store.earnCoins(n, { capped: !o?.prize }).added,
  today: () => todayKey(),
  api: () => matchApiUrl(),
  who: () => ({ name: duelNick(), skin: store.getSkins().wear.blocks || 'kleur' }),
});
let settings = store.getSettings();
// (1.16) Die Lewende Toring in every tower: the player's tribe, record and the people they have met (its own store)
const livingStore = createLivingStore();
// (1.16) Jou dorp (Steel en Wraak): the town's id, key and the server's last word (js/dorp.js); the rest is below
const dorp = createDorpClient({ api: matchApiUrl() });
let dorpOn = false;
let dorpSyncAt = 0;
let dorpBusy = false;
let dorpMenuKey = '';
let dorpNameAsked = false;
const DORP_POLL_MS = 15000;
let dorpPic = '';           // the town as it last stood in the game world (DorpScene's picture), for the menu's button
let dorpRaid = null;        // the raid on screen: { target, wraak, them, share }
/** (1.16) The tribe the player wears (the wallet keeps it: the first one free, the others for coins); Vuur until chosen. */
const tribeNow = () => store.getTribes().wear || 'vuur';
/** What the screens show of the tribes: the one worn, the ones owned, the coins. */
const tribesView = () => ({ tribe: tribeNow(), owned: store.getTribes().owned, coins: store.getEconomy().coins });
/** What a game needs for the Living Tower (null when Instellings has it off; a battle match has it always). */
function livingFor(mode, force = false) {
  if (settings.living === false && !force) return null;
  return {
    tribe: tribeNow(),
    best: livingStore.best(),
    known: (id, gold) => livingStore.known(id, gold),
    firstTown: !Object.keys(livingStore.get().met).length,
    intro: mode !== 'idle' && !livingStore.introSeen(),
    onIntro: () => livingStore.markIntro(),
    dorp: dorpOn && mode === 'daily',   // (1.16) Jou dorp: 3 Perfeks in a row earn a strooptog (1.18: only the Daily feeds the town)
  };
}
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
  scene: [BgScene, GameScene, LewendeScene, DorpScene, SlagScene, HudScene],
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
let screen = 'menu';   // 'menu' | 'game' | 'pause' | 'results' | 'duel' | (1.16) 'lewende'
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
  ui.setLiving(tribesView());   // (1.16) the tribes the account brought (owned, worn) for Instellings and its sheet
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
ui.setLiving(tribesView());   // (1.16) the Living Tower's tribe for Instellings and the results
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
    dorp: (() => { const d = dorpView(); dorpMenuKey = JSON.stringify(d); return d; })(),   // (1.16) Jou dorp
    slag: SLAG_ON ? slagMenuView() : null,   // (1.17) Vrugteslag (set aside)
    gly: GLYBAAN.on ? glyMenuView() : null,   // (1.19) Glybaan, the slide
    span: span.view(),   // (1.20) Ons dorp
    kasteel: KASTEEL.on ? kasteelMenuView() : null,   // (1.17) Die Kasteelreeks (off since 18 Oct: config KASTEEL)
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
    living: livingFor(data.mode),
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
// Power-ups (1.8; js/core/economy.js): in Oefen from the player's stock; never in a match. (1.15.3, the owner: "Make
// the player choose the one they want to use before the match", then "it shows what you have purchased already and then
// you can also purchase new once in this meny, which you then decide on one") the Daily Tower: one power-up from the
// player's stock per tower (bought with earned coins, also on the sheet), chosen before it starts; it is used up only
// when tapped (was a free Fondamentblok at 55 m)
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
    const have = id ? store.getEconomy().stock[id] > 0 : false;
    const active = (id === 'slow' && e.slowLeft > 0) || (id === 'shield' && !!e.shield) || (id === 'foundation' && !!e.foundation);
    const full = id === 'heart' && e.heartRoom === false;
    const enabled = pw.free && have && !active && !full;
    if (id && ((pw.free && have) || active)) items.push({ id, count: pw.free ? 1 : 0, active, glow: enabled, enabled, full: full && pw.free && have });
  } else {
    const stock = store.getEconomy().stock;
    for (const id of POWERUP_IDS) {
      const active = (id === 'slow' && e.slowLeft > 0) || (id === 'shield' && !!e.shield) || (id === 'foundation' && !!e.foundation);
      if (!(stock[id] > 0) && !active) continue;
      const full = id === 'heart' && e.heartRoom === false;
      const enabled = !active && stock[id] > 0 && !full;
      items.push({ id, count: stock[id], active, enabled, full: full && stock[id] > 0 });
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
    if (id !== pw.pick || !pw.free || !(store.getEconomy().stock[id] > 0)) return;
    if (gs.applyPowerup(id)) {
      store.usePowerup(id);
      pw.free = false;
    }
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

/**
 * (1.15.3, the owner: "the chest should open everyday you login not when you play the daily challenge") the day's box of
 * the weekkis opens on the day's first visit: its coins go in now, the menu's chest says "Tik!" until it is tapped open
 * (stapel.v1.chestSeen). Signed in: after the account's towers came in (another device may have opened it today).
 */
let chestWaiting = false;
function openTodaysChest() {
  if (chestWaiting) return false;
  if (account.stale()) {
    chestWaiting = true;
    account.settle(3000).then(() => {
      chestWaiting = false;
      if (openTodaysChest() && screen === 'menu') ui.showMenu(menuModel());
    });
    return false;
  }
  const box = store.openWeekBox(todayKey());
  if (!box) return false;
  coinsChanged();
  return true;
}

let boardAskedFor = null;   // (1.12) the day whose place the menu's 🏆 asked for this session
function showMenu() {
  openTodaysChest();
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
 * (1.15.3) The Daily Tower's power-up: undefined while not chosen yet (playDaily asks first), null for none. Test runs
 * (?auto=, or window.__stapelPick set by the QA scripts) skip the sheet.
 */
function presetPick() {
  const t = AUTO ? 'none' : globalThis.__stapelPick;
  if (typeof t !== 'string') return undefined;
  return POWERUP_IDS.includes(t) ? t : null;
}
/** A Daily Tower starts with its pick: the tray shows it at once, glowing, and a toast says where it is. */
/** What the power-up sheet shows: the player's stock and coins. */
function pickModel() {
  const e = store.getEconomy();
  return { stock: { ...e.stock }, coins: e.coins };
}
/**
 * (1.15.4, the game-tester: a new player's first sheet had every row and every Koop greyed out) the sheet only when there
 * is something to choose: a power-up the player has, or the coins for one. Otherwise the tower starts without one.
 */
function pickHasChoice() {
  const e = store.getEconomy();
  return POWERUP_IDS.some((id) => e.stock[id] > 0 || e.coins >= POWERUPS[id].price);
}
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
      if (pick === undefined && pickHasChoice()) {
        ui.showPowerPick(pickModel());
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
  if (pick === undefined && pickHasChoice()) {
    ui.showPowerPick(pickModel());
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

/**
 * (1.15.4, the owner via Alfred, Theo's photo: "Kan nie na jou wen toring kyk nie") a picture of a finished Daily Tower,
 * kept for this session: a result opened again later (by then the game behind it is the menu's tower) shows it under
 * "Toring"; without one (the app was closed meanwhile) the button stays away instead of showing an empty platform.
 */
const towerShots = new Map();   // dateKey -> { src, heightM } (the day's best try)
function keepTowerShot(r) {
  if (!r || r.mode !== 'daily' || !r.dateKey || typeof game.renderer?.snapshot !== 'function') return;
  const prev = towerShots.get(r.dateKey);
  if (prev && prev.heightM > (r.heightM || 0)) return;
  setTimeout(() => {
    try {
      game.renderer.snapshot((img) => {
        if (img?.src) towerShots.set(r.dateKey, { src: img.src, heightM: r.heightM || 0 });
      }, 'image/jpeg', 0.85);
    } catch {
      // the picture is a nice-to-have
    }
  }, 500);
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
    revisit: !!gs?.idle,                               // (1.15.4) the finished tower isn't behind it any more...
    towerShot: towerShots.get(dateKey)?.src || null,   // ...its picture, when this session took one
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
  // (1.20) today's rescue ride, while it waits: who's in the river, how many of them fell off your tower
  const rd = r.dateKey === todayKey() ? span.ride(r.dateKey) : null;
  const rivier = rd ? { n: rd.who.length, mine: rd.mine, who: rd.who } : null;
  return { city: skylineFor(r.dateKey), teaser: tomorrowTeaser(r.dateKey), install: installMode(), rivier, ...dayTriesExtras(r) };
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
bus.on('ui:pick-closed', () => {
  if (screen === 'menu') showMenu();   // (the daily card shows a try that was taken as ready to play)
});
bus.on('ui:power-pick', (id) => {
  if (screen !== 'menu' && screen !== 'results') return;
  // one the player has (or none)
  const pick = POWERUP_IDS.includes(id) && store.getEconomy().stock[id] > 0 ? id : null;
  playDaily(pick);
});
// (1.15.3) "Koop" on the power-up sheet: one more in the player's stock, then the sheet again with it
bus.on('ui:pick-buy', (id) => {
  const r = store.buyPowerup(id);
  if (r.ok) {
    audio.play('heart');
    ui.toast(S.bought(POWERUP_INFO[id]?.name || ''), 1800);
    coinsChanged();
  }
  if (screen === 'menu' || screen === 'results') ui.showPowerPick(pickModel());
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
  const wasLiving = settings.living;
  settings = store.setSettings(partial || {});
  audio.setEnabled(settings.sound);
  haptics.setEnabled(settings.vibration);
  // (1.16) the menu's tower shows the Living Tower switched on or off at once
  if (settings.living !== wasLiving && run.mode === 'idle' && screen === 'menu' && !duel.searching) startIdle();
});
// (1.16) the residents album (the results card's town, Instellings)
bus.on('ui:lv-album', () => ui.showAlbum(livingStore.get()));
// (1.16) a tribe chosen (Instellings, the results card): the next towers' people, and the menu's tower at once
bus.on('ui:lv-tribe', (t, { price = 0 } = {}) => {
  // (the sheet showed an older wallet, e.g. before an account's tribes arrived: it shows the real price first)
  const had = store.getTribes().owned;
  if (!had.includes(t) && had.length && price < TRIBE_PRICE) {
    ui.setLiving(tribesView());
    ui.showTribe?.();
    return;
  }
  const r = store.chooseTribe(t);
  if (!r.ok) {
    if (r.why === 'coins') ui.toast(S.lvTribeNoCoins(TRIBE_PRICE), 3200);
    return;
  }
  ui.setLiving(tribesView());
  ui.setMenuCoins(r.coins);
  ui.toast(`${S.lvTribeChosen(S.lvTribeNames[r.tribes.wear])}${r.paid ? `  ·  −${fmtInt(r.paid)} 🪙` : ''}`, 2600);
  coinsChanged();   // (signed in: the tribe and the coins go to the account)
  // (only on the menu: a new idle tower ends any match or friend's invite waiting)
  if (run.mode === 'idle' && screen === 'menu' && !duel.searching) startIdle();
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
  // (1.16) the card carries the Living Tower's tribe (the other phone shows your people and sends your mission)
  card: (mode) => ({ ...store.getCard(mode), tr: tribeNow(), ...(dorpOn ? { dt: dorp.id } : {}) }),
  living: () => (settings.living !== false ? { tribe: tribeNow() } : null),
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
  // (1.16) Jou dorp: a match with a friend (their link) makes your towns neighbours, both ways
  if (dorpOn && m.kind === 'live' && m.roomKind === 'friend' && isTownId(m.oppCard?.dt)) {
    dorp.buur(m.oppCard.dt).then((r) => { if (r?.ok) dorpSync({ force: true }).then(refreshMenuDorp); });
  }
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
      lv: m.lv === true, oppTribe: m.oppTribe || null,   // (1.16) Die Lewende Toring's battles
      // (1.12) both ranks in this mode, in front of the names at the top ('🥇II'); a recording has none
      oppRank: m.kind === 'live' || m.kind === 'bot' ? rankShortOf(m.oppCard?.rl) : '', youRank: rankShortOf(store.getCard(m.mode).rl) },
    autoplay: AUTO,
    // (1.16) a Living Tower battle needs the people, whatever Instellings says
    ...(m.lv ? { living: livingFor('duel', true) } : {}),
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

// (1.16, the owner 15-16 Oct: "Please create the premium look for all three ideas") Die Lewende Toring: its three ideas
// start from the Uitdagersreeks ('ui:lewende'); the match is LewendeScene over the world (BgScene), the menu's tower sleeps.
let lewendeEnd = null;
const lewende = createLewendeUi({
  root: document.getElementById('ui'),
  name: () => store.getDuel()?.name || '',
  apiUrl: () => matchApiUrl(),
  start: ({ onEnd, ...data }) => {
    lewendeEnd = onEnd;
    // a match: the loop never sleeps (the menu's battery saver would freeze it while the robot plays)
    screen = 'lewende';
    wakeLoop();
    ui.hideAll();
    if (game.scene.isActive('Game')) game.scene.sleep('Game');
    if (game.scene.isActive('Hud')) game.scene.sleep('Hud');
    game.scene.start('Lewende', { ...data, reducedMotion: !!settings.reducedMotion, seed: Math.floor(Math.random() * 1e9), onEnd: (r) => { const f = lewendeEnd; lewendeEnd = null; f?.(r); } });
  },
  stop: () => { if (game.scene.isActive('Lewende')) game.scene.stop('Lewende'); },
  quit: () => {
    const f = lewendeEnd;
    lewendeEnd = null;
    if (game.scene.isActive('Lewende')) game.scene.stop('Lewende');
    f?.(null);
  },
  back: () => {
    if (game.scene.isSleeping('Game')) game.scene.wake('Game');
    wakeLoop();
    bus.emit('ui:duel');
  },
});
bus.on('ui:lewende', (o) => {
  screen = 'lewende';   // (its sheets too: no menu sleep behind them)
  wakeLoop();
  lewende.open(o?.idea || 0);
});
if (DEBUG) window.__stapel.lewende = lewende;
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
    dorpSync({ force: true }).then(refreshMenuDorp);   // (1.16) the town's neighbours see the new name
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
  // (1.15.3, the owner's screenshot: "Play your extra try first." and nothing started) a try already taken and still to
  // play (its power-up sheet was closed, or the menu drawn before it) just starts, the sheet first
  const ready = store.getDailyRetry(dateKey);
  if (ready && ready.status === 'ready') {
    playDaily();
    return;
  }
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
  // (1.16) the Living Tower's town: the record and who lived there (kept apart from the tower's own result)
  // (1.20) a Weektoring turn: its floors join the tower (a turn left before its first drop is still there)
  if (result.mode === 'week') {
    const aborted = !(result.blocksDropped > 0);
    const lease = weekLease;
    weekLease = null;
    const out = aborted ? null : span.turnDone(result.week || [], { skin: store.getSkins().wear.blocks || 'kleur', day: todayKey(), lease });
    run.final = { result, weekOut: Promise.resolve(out), stats: null, isNewBest: false, aborted };
    return run.final;
  }
  const town = result.living ? recordTown(result.living) : null;
  const dorpGain = dorpGainFor(result);   // (1.16) Jou dorp: what this tower sent to the town
  if (result.mode === 'duel') {
    // a match keeps its own wins and losses (recorded by js/duel.js once it is decided)
    run.final = { result: { ...(town ? { ...result, living: town } : result), ...(dorpGain ? { dorp: dorpGain } : {}) }, stats: null, isNewBest: false, aborted: false };
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
  // (1.20) Ons dorp: a finished Daily counts for the week (its height: bombs; the weekday: the ticket), gives a build turn
  // and today's rescue ride (who fell off your tower is in the river)
  if (result.mode === 'daily' && result.dateKey && !aborted) {
    try { span.dailyDone(result.dateKey, shown.heightM || 0, result.living?.fell || []); } catch (e) { console.warn('[span]', e); }
  }
  // coins: the daily tower pays in full (once); Oefen counts towards the day's cap
  let coins = null;
  let week = null;
  let slagGain = null;
  if (result.mode === 'daily' && stats?.applied && !run.retry) {   // (the second try was bought: it pays nothing)
    coins = awardCoins({ mode: 'daily', heightM: shown.heightM, perfects: shown.perfects, streak: stats.currentStreak });
    // (1.17) the fruit basket fills from the Daily Tower: a banana per 5 Perfeks, a juice box per 10, a watermelon per 3 days
    const g = SLAG_ON ? harvest({ perfects: shown.perfects, streak: stats.currentStreak }) : {};
    if (g.piesang || g.sap || g.waatlemoen) {
      const sd = slagLoad();
      sd.basket = addFruit(sd.basket, g);
      slagSave(sd);
      slagGain = g;
    }
    // (1.15.3, the owner: "the chest should open everyday you login not when you play the daily challenge") the
    // weekkis opens on the day's first visit (openTodaysChest), no longer here
  } else if (result.mode === 'practice') {
    coins = awardCoins({ mode: 'practice', heightM: result.heightM, perfects: result.perfects });
  }
  run.final = { result: { ...(town && !aborted ? { ...shown, living: town } : shown), ...(dorpGain && !aborted ? { dorp: dorpGain } : {}), ...(slagGain ? { slagGain } : {}) }, stats, isNewBest, aborted, coins, week };
  return run.final;
}

/** (1.16) A game's town into the Living Tower's store: the record (people) and everyone who lived there. */
function recordTown(t) {
  try {
    if (!(t.movedIn > 0)) return { ...t, best: livingStore.best(), newBest: false };
    const rec = livingStore.record({ people: t.people, peak: t.peak, met: t.met, gold: t.gold });   // (the record is the most at once, as its toast said)
    const a = livingStore.get();
    const album = { met: Object.keys(a.met).length, gold: Object.keys(a.gold).length, total: CAST_IDS.length };
    return { ...t, best: rec.best, newBest: rec.newBest && rec.was > 0, fresh: rec.first ? [] : t.fresh, album };
  } catch {
    return null;
  }
}

bus.on('game:final', (result) => {
  if (!result || run.mode === 'idle') return;
  finalize(result);
  // the first real game is the tutorial: once it got somewhere, the hints and the menu nudge are done
  if (tutorialDone(result.blocksDropped)) store.markTutorialSeen();
});

// (1.17) Die Kasteelreeks: every Daily Tower is kept as a tower of the player's castle (each day's best try, 7 days)
// ---------------------------------------------------------------------------
// (1.20) Ons dorp: the day's ride down the river (js/rivier/view.js over Stapel's page) and the Weektoring's build turn
// (GameScene mode 'week'). The owner, 24 Oct 2026: "The river can be part of a rescue mission for the men you lost on the
// towers", "use a crane to build ontop of the weekly tower". The plan: docs/RIVIER-PLAN-2026-10-24.md.
// ---------------------------------------------------------------------------
let ride = null;          // the ride's controller while it's open
let rideSeq = 0;
Object.defineProperty(window.__stapel, 'ride', { get: () => ride, configurable: true });   // (tests)
window.__stapel.span = span;
Object.defineProperty(window.__stapel, 'where', { get: () => ({ screen, mode: run.mode, over: run.over }), configurable: true });   // (tests)
/** The Daily tower as it stood at the end of the day's best try (the river starts at its top), or []. */
function dayLayout(dateKey) {
  try {
    const all = JSON.parse(localStorage.getItem('stapel.v1.kasteeldae') || '{}') || {};
    return Array.isArray(all[dateKey]?.b) ? all[dateKey].b : [];
  } catch {
    return [];
  }
}
function closeRide() {
  rideSeq += 1;
  ride?.close();
  ride = null;
  wakeLoop();
}
async function startRide() {
  const day = todayKey();
  const rd = span.ride(day);
  if (!rd) {
    showMenu();
    return;
  }
  const seq = ++rideSeq;
  screen = 'rivier';
  ui.hideAll();
  wakeLoop();
  try {
    const mod = await import('./rivier/view.js');
    if (seq !== rideSeq) return;
    const v = span.view();
    const r = await mod.openRiver({
      seed: day, who: rd.who, mine: rd.mine, floors: v.floors, crew: v.name || '', canBuild: v.turns > 0,
      daily: dayLayout(day), skin: store.getSkins().wear.blocks || 'kleur',
      reducedMotion: !!settings.reducedMotion, autopilot: DEBUG && params.has('rvauto'),
      onResult: (res) => {
        span.rideDone(day, res.rescued || [], rd.fromRiver || 0).then((out) => { if (out.coins) coinsChanged(); });
      },
      onDone: (res, next) => {
        closeRide();
        if (next === 'build') startWeekTurn();
        else openSpanTown();
      },
    });
    if (seq !== rideSeq) { r.close(); return; }
    ride = r;
    // (Stapel's own drawing rests while the river is open: one picture on the screen at a time)
    if (!loopAsleep && game.loop?.running) { loopAsleep = true; game.loop.sleep(); }
  } catch (e) {
    console.error('[rivier]', e);
    closeRide();
    startIdle();
    showMenu();
  }
}
let weekLease = null;      // the crane's lease for this build turn (with the server)
let weekTurnBusy = false;
const TURN_ERRORS = { busy: (r) => S.twBusy(r.by), noturn: () => S.twNoTurn, ticket: () => S.twTicketNeeded, kroning: () => S.twKroning, norepair: () => S.twNoRepair, crane: () => S.twCraneShut };
async function startWeekTurn({ repair = false } = {}) {
  if (weekTurnBusy) return;
  weekTurnBusy = true;
  let tt;
  try {
    tt = await span.turn(todayKey(), { repair });
  } finally {
    weekTurnBusy = false;
  }
  if (!tt || tt.error) {
    ui.toast((TURN_ERRORS[tt?.error] || (() => S.twOffline))(tt || {}), 3200);
    if (screen !== 'menu') {
      startIdle();
      showMenu();
    }
    return;
  }
  weekLease = tt.lease || null;
  resetRun('week');
  startGame({ mode: 'week', seed: tt.seed, autoplay: AUTO, week: { floors: tt.floors, blocks: tt.blocks, title: tt.repair ? S.weekRepairName : S.weekTowerName } });
  screen = 'game';
  ui.showInGame();
}
let spanLinkCode = null;
/** (1.20) The server's Ons dorp (if it's there), then a friend's invite link (?span=CODE). */
async function spanStart() {
  const code = params.get('span');
  if (/^[A-HJ-NP-Z2-9]{6}$/.test(code || '')) {
    spanLinkCode = code;
    try { history.replaceState(history.state, '', location.pathname + location.hash); } catch { /* the address stays */ }
  }
  const ok = await span.start();
  if (screen === 'menu') ui.showMenu(menuModel());
  if (spanLinkCode) {
    const c = spanLinkCode;
    spanLinkCode = null;
    if (!ok) {
      ui.toast(S.spanOffline, 3200);
      return;
    }
    const inv = await span.invite(c);
    if (inv.error) {
      ui.toast(S.spanJoinGone, 3200);
      return;
    }
    if (inv.full) {
      ui.toast(S.spanJoinFull, 3200);
      return;
    }
    ui.showSpanJoin({ code: c, name: inv.name, n: inv.n, of: 3, names: inv.names || [] });
  }
}
bus.on('ui:span-join', async (code) => {
  const r = await span.join(code);
  if (r.error) {
    ui.toast(r.error === 'full' ? S.spanJoinFull : r.error === 'locked' ? S.spanJoinLocked : r.error === 'crew' ? S.spanJoinGone : S.spanOffline, 3600);
    return;
  }
  ui.toast(S.spanJoined(r.crew?.name || ''), 3000);
  openSpanTown();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && span.online) span.sync().then(() => { if (screen === 'menu') ui.showMenu(menuModel()); });
});
bus.on('ui:rivier', startRide);
bus.on('ui:week-build', startWeekTurn);
/** Ons dorp's own screen: your crew's island and its Weektoring in 3D (js/rivier/view.js openTown), your week. */
async function openSpanTown() {
  const seq = ++rideSeq;
  screen = 'rivier';
  ui.hideAll();
  wakeLoop();
  try {
    const mod = await import('./rivier/view.js');
    if (seq !== rideSeq) return;
    const v = span.view();
    span.newsSeen();
    if (span.online) span.sync().then(() => { if (ride?.refresh && screen === 'rivier') ride.refresh(span.view()); span.newsSeen(); });
    const r = await mod.openTown({
      ...v, myId: span.id, reducedMotion: !!settings.reducedMotion,
      onRide: () => { closeRide(); startRide(); },
      onBuild: () => { closeRide(); startWeekTurn(); },
      onRepair: () => { closeRide(); startWeekTurn({ repair: true }); },
      onBomb: () => { closeRide(); startRaid(); },
      onInvite: () => shareInvite(),
      onLeave: async () => {
        const res = await span.leave();
        ui.toast(res.error ? (res.error === 'locked' ? S.spanJoinLocked : S.spanOffline) : S.spanLeft, 3200);
        if (!res.error) { closeRide(); openSpanTown(); }
      },
      onBack: () => { closeRide(); startIdle(); showMenu(); },
    });
    if (seq !== rideSeq) { r.close(); return; }
    ride = r;
    if (!loopAsleep && game.loop?.running) { loopAsleep = true; game.loop.sleep(); }
  } catch (e) {
    console.error('[ons dorp]', e);
    closeRide();
    startIdle();
    showMenu();
  }
}
bus.on('ui:span', openSpanTown);
/** The crew's invite link on WhatsApp (or the phone's share sheet): the crew's name, the tower's height, ?span=CODE. */
function shareInvite() {
  const v = span.view();
  if (!v.crew?.invite) {
    ui.toast(S.spanOffline, 3000);
    return;
  }
  const url = `${siteUrl()}?span=${v.crew.invite}`;
  ui.shareText(S.spanInviteText(v.crew.name, fmtM(v.heightM || 0), url), 'whatsapp');
}
/** (1.20) Saturday's bomb run: down the river past the four islands; bombs on the tallest tower. */
async function startRaid() {
  const v = span.view();
  if (!v.river || v.phase !== 'uitdaging') {
    ui.toast(S.twKroning, 3000);
    openSpanTown();
    return;
  }
  if (!v.ticket) { ui.toast(S.twTicketNeeded, 3600); openSpanTown(); return; }
  if (!(v.bombs > 0)) { ui.toast(S.twNoBombs, 3600); openSpanTown(); return; }
  if (v.river.leader === v.crew?.id) { ui.toast(S.twYouLead, 3600); openSpanTown(); return; }
  const seq = ++rideSeq;
  screen = 'rivier';
  ui.hideAll();
  wakeLoop();
  try {
    const mod = await import('./rivier/view.js');
    if (seq !== rideSeq) return;
    const r = await mod.openRaid({
      river: v.river, crewId: v.crew.id, bombs: Math.min(v.bombs, 3), skin: store.getSkins().wear.blocks || 'kleur',
      reducedMotion: !!settings.reducedMotion, autopilot: DEBUG && params.has('rvauto'),
      onBomb: (target, hit) => span.bomb(target, [hit]),
      onDone: () => { closeRide(); openSpanTown(); },
    });
    if (seq !== rideSeq) { r.close(); return; }
    ride = r;
    if (!loopAsleep && game.loop?.running) { loopAsleep = true; game.loop.sleep(); }
  } catch (e) {
    console.error('[aanval]', e);
    closeRide();
    openSpanTown();
  }
}
// (Android's Back during a ride: its pause card, with "Klim uit")
window.addEventListener('stapel:back', (e) => {
  if (!ride) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  ride.pause();
}, true);

bus.on('game:castle', (c) => {
  try {
    const KEY = 'stapel.v1.kasteeldae';
    const all = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    const old = all[c.dateKey];
    // (the day's castle tower is the try that STANDS tallest: its blocks as they stood at the end, not its best moment)
    const stands = (b) => (Array.isArray(b) ? b.reduce((m, x) => Math.max(m, Number(x?.y) || 0), 0) : 0);
    const a = stands(c.layout);
    const was = old ? stands(old.b) : -1;
    if (a > was || (a === was && (c.heightM || 0) >= (old?.h || 0))) all[c.dateKey] = { h: c.heightM, p: c.perfects, b: c.layout };
    const keep = {};
    for (const k of Object.keys(all).sort().slice(-7)) keep[k] = all[k];
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch { /* the castle is a bonus: never in the game's way */ }
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
  if (result.mode === 'week') {
    // (1.20) the Weektoring's turn: its sheet over the tower's reveal, once the floors are in (the server's answer)
    screen = 'results';
    f.weekOut.then((o) => {
      if (o?.error) ui.toast(S.twOffline, 3600);
      const v = span.view();
      ui.showWeekResult({ heightM: o?.heightM ?? v.heightM, gain: o?.gain || 0, added: o?.added || 0, people: v.people, perfects: f.result.perfects | 0, turns: v.turns });
      sleepLoop(RESULTS_SLEEP_MS);
    });
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
  keepTowerShot(r);
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
    // (1.15.5) back from Google's sign-in (the phone's sheet, or its tab on the website): the sign-in parts show where it stands
    ui.setAccount(accountStatus());
    if (account.status().signedIn) ui.hideSigninOffer();
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
// ---------------------------------------------------------------------------
// (1.16) Jou dorp: Steel en Wraak (js/core/dorp.js; the owner, 16 Oct 2026: "everyone who plays this game wants their
// friends to play, that is the aim" and "it needs to be so good that no one wants to leave"). Every tower's people move
// into the player's own town on the match server; 3 Perfeks in a row (a joker in Blok vir Blok) earn a strooptog; the
// day's first tower builds a wall; a raid takes some of a neighbour's people, even while they're away, and its WhatsApp
// taunt carries the link to their free Wraak. Only where the server knows the towns (GET /dorp/ping): else no button.
// ---------------------------------------------------------------------------

/** What the menu shows of the town (null without the server): the server's word plus what waits to be sent. */
function dorpView() {
  if (!dorpOn) return null;
  const v = dorp.view();
  const t = v.last?.town;
  const p = v.pending;
  const me = t
    ? { ...t, people: t.people + p.people, raids: Math.min(DORP.raidsMax, t.raids + p.raids), walls: Math.min(DORP.wallsMax, t.walls + p.walls), gold: (t.gold | 0) + p.gold }
    : { id: v.id, name: duelNick(), tribe: tribeNow(), people: p.people, raids: DORP.startRaids + p.raids, walls: p.walls, gold: p.gold };
  const seen = Math.max(v.shownN | 0, t?.seenN | 0);
  const bure = v.last?.bure || [];
  return { on: true, me, unseen: (v.last?.news || []).filter((n) => n.n > seen).length, bure: bure.length, wraak: bure.some((b) => b.wraak), pic: dorpPic };
}

/** The town's own screen (over DorpScene): its numbers, the neighbours, the news. */
function dorpScreenModel(mode = 'town', extra = {}) {
  const v = dorp.view();
  const m = dorpView();
  return { mode, me: { ...(m?.me || {}), name: duelNick() }, bure: v.last?.bure || [], news: v.last?.news || [], ...extra };
}

/** Sends what the games brought and fetches the town (at most every few seconds unless `force`). */
async function dorpSync({ seen = null, force = false, collect = null } = {}) {
  if (!dorpOn) return null;
  if (!force && Date.now() - dorpSyncAt < 4000) return null;
  dorpSyncAt = Date.now();
  return dorp.sync({ name: duelNick(), tribe: tribeNow(), seen, collect });
}

/** The menu again, only when what it shows of the town changed. */
function refreshMenuDorp() {
  if (JSON.stringify(dorpView()) === dorpMenuKey) return;
  if (screen === 'menu') ui.showMenu(menuModel());
}

/** The screen's two panels in game pixels (the town is framed between them). */
function dorpBarsGame() {
  const b = ui.dorpBars();
  const k = b.height ? game.scale.height / b.height : 1;
  return { top: Math.round(b.top * k), bottom: Math.round(b.bottom * k) };
}

// (1.18, the owner 18 Oct 2026: "Yes, build it fully") the town in 3D (js/dorp3d/view.js), over Stapel's own canvas,
// with DorpScene's contract; DorpScene (2D) stays for a phone that can't draw 3D.
let dorp3d = null;          // the 3D town's controller while it's open
let dorp3dFailed = false;   // (no 3D here: the 2D town from now on)
let dorp3dSeq = 0;
Object.defineProperty(window.__stapel, 'dorp3d', { get: () => dorp3d, configurable: true });   // (tests)
let dorp3dMod = null;        // js/dorp3d/view.js once loaded
function stopDorpScene() {
  dorp3dSeq += 1;
  if (dorp3d) { dorp3d.close(); dorp3d = null; }
  dorp3dMod?.town3D()?.close();   // (one still being built)
  if (game.scene.isActive('Dorp') || game.scene.isPaused('Dorp') || game.scene.isSleeping('Dorp')) game.scene.stop('Dorp');
  if (game.scene.isSleeping('Game')) game.scene.wake('Game');
  wakeLoop();
}

/**
 * Into the town, in the game world: the menu's tower sleeps, DorpScene runs (view 'town' | 'raid' | 'news'), and the
 * town's screen goes over it. `screenExtra`: the screen's model; `scene`: the scene's (the other town, the callbacks).
 */
function enterDorp(view = 'town', { mode = view, screenExtra = {}, scene = {} } = {}) {
  screen = 'dorp';
  wakeLoop();
  ui.hideAll();
  if (game.scene.isActive('Game')) game.scene.sleep('Game');
  if (game.scene.isActive('Hud')) game.scene.sleep('Hud');
  if (game.scene.isActive('Dorp') || game.scene.isPaused('Dorp')) game.scene.stop('Dorp');
  const sm = dorpScreenModel(mode, screenExtra);
  ui.showDorpScreen(sm);
  if (!dorp3dFailed) {
    enterDorp3D(view, sm, scene);
    return;
  }
  const bars = dorpBarsGame();
  game.scene.start('Dorp', {
    view, me: sm.me, reducedMotion: !!settings.reducedMotion, topBar: bars.top, bottomBar: bars.bottom, covered: dorpCovered,
    onPicture: (url) => {
      dorpPic = url;
    },
    ...scene,
  });
  // the panels as drawn (fonts, the phone's size): the town framed between them
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const b = dorpBarsGame();
    game.scene.getScene('Dorp')?.setBars?.(b.top, b.bottom);
  }));
}

/** (18 Oct) The town can't be seen: the phone is sideways ("Draai jou foon regop" covers it) or the app is away. A raid's
 *  aim waits meanwhile: it never throws by itself while he can't see it. */
const dorpCovered = () => landscape() || document.hidden;

/** The 3D town (js/dorp3d/view.js), loaded the first time; if this phone can't draw it, the 2D town instead. */
async function enterDorp3D(view, sm, scene) {
  const seq = ++dorp3dSeq;
  const b = ui.dorpBars();
  try {
    dorp3dMod = await import('./dorp3d/view.js');
    const { openTown3D } = dorp3dMod;
    if (seq !== dorp3dSeq || screen !== 'dorp') return;
    dorp3d?.close();
    dorp3d = null;
    const v = await openTown3D({
      view, me: sm.me, reducedMotion: !!settings.reducedMotion, topBar: b.top, bottomBar: b.bottom, covered: dorpCovered,
      onPicture: (url) => { dorpPic = url; },
      onAimStep: (step) => ui.setDorpMode({ mode: 'aim', step }),
      ...scene,
    });
    if (seq !== dorp3dSeq || screen !== 'dorp') { v.close(); return; }
    dorp3d = v;
    // (Stapel's own drawing rests while the town is open: one picture on the screen at a time)
    if (!loopAsleep && game.loop?.running) { loopAsleep = true; game.loop.sleep(); }
    requestAnimationFrame(() => requestAnimationFrame(() => { const bb = ui.dorpBars(); dorp3d?.setBars(bb.top, bb.bottom); }));
  } catch (e) {
    console.error(e);
    if (seq !== dorp3dSeq) return;
    dorp3dFailed = true;   // (the 2D town from now on)
    if (screen === 'dorp') enterDorp(view, { mode: sm.mode, screenExtra: sm, scene });
  }
}

/** The screen's panels changed (a result, the news): the town framed between them again. */
function dorpReframe() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (dorp3d) { const b = ui.dorpBars(); dorp3d.setBars(b.top, b.bottom, 600); return; }
    if (!game.scene.isActive('Dorp')) return;   // (a 3D town still being built frames itself once it's there)
    const b = dorpBarsGame();
    game.scene.getScene('Dorp')?.setBars?.(b.top, b.bottom, 600);
  }));
}

/** Out of the town, back to the menu (its tower wakes). */
function leaveDorp() {
  stopDorpScene();
  dorpRaid = null;
  dorpBusy = false;
  bus.emit('ui:home');
}

/** "Terwyl jy weg was": raids on this town not shown yet play in the town (only from the menu, nothing else open). */
function dorpNewsCheck() {
  if (!dorpOn || screen !== 'menu' || ui.modalOpen()) return;
  const v = dorp.view();
  const t = v.last?.town;
  if (!t) return;
  const seen = Math.max(v.shownN | 0, t.seenN | 0);
  const items = (v.last.news || []).filter((n) => n.n > seen);
  if (!items.length) return;
  const top = Math.max(...items.map((n) => n.n));
  dorp.markShown(top);
  dorpSync({ seen: top, force: true });
  const latest = items[items.length - 1];
  const owed = [...items].reverse().find((n) => n.took > 0 && !n.blocked && !n.wraaked) || null;
  const raider = (v.last.bure || []).find((b) => b.id === latest.from);
  const took = items.reduce((s, n) => s + (n.blocked ? 0 : n.took | 0), 0);
  enterDorp('news', {
    mode: 'news',
    screenExtra: { them: { name: latest.name, people: raider?.people ?? 0 }, items, owed },
    scene: {
      news: { took, tribe: latest.tribe, blocked: items.every((n) => n.blocked), goldTook: items.reduce((s, n) => s + (n.goldTook | 0), 0) },
      onCount: (c) => ui.setDorpCounts(c),
      onDone: () => { ui.setDorpMode({ mode: 'newsDone' }); dorpReframe(); },
      onFail: () => { ui.setDorpMode({ mode: 'newsDone' }); dorpReframe(); },
    },
  });
}

/** A finished tower's gifts to the town: its people, strooptogte, golden people, the day's first wall (results line). */
function dorpGainFor(result) {
  // (the owner, 18 Oct 2026: "your town should only be build with the daily challenge else the town will grow way to
  // quick": only the Daily Tower's tries feed the town; Oefen and matches build towers, not towns)
  if (!dorpOn || result?.mode !== 'daily' || !result?.living || !(result.blocksDropped > 0)) return null;
  const g = dorp.queue({
    people: result.living.people | 0, raids: result.raids | 0, gold: (result.living.gold || []).length,
    dayKey: result.blocksDropped >= 3 ? todayKey() : null,
  });
  if (!g) return null;
  dorpSync({ force: true }).then(refreshMenuDorp);
  const v = dorpView();
  return { people: g.people, raids: g.raids, walls: g.walls, canRaid: !!v && (v.me.raids > 0 || v.wraak) && v.bure > 0 };
}

/** A friend's link: ?buur=<town> (their invite) or ?wraak=<raid> (their taunt: yours to avenge, or a new neighbour). */
async function dorpLinks() {
  const q = new URLSearchParams(location.search);
  const buur = q.get('buur');
  const wraak = q.get('wraak');
  if (!buur && !wraak) return;
  try {
    q.delete('buur');
    q.delete('wraak');
    const rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
  } catch {
    // sandboxed frames: the parameters simply stay
  }
  let open = false;
  if (isTownId(buur) && buur !== dorp.id) {
    const r = await dorp.buur(buur);
    if (r.ok && r.them) {
      ui.toast(S.dorpBuurAdded(r.them.name), 3600);
      open = true;
    }
  }
  if (isRaidId(wraak)) {
    const info = await dorp.raidInfo(wraak);
    if (info.ok && info.to !== dorp.id && info.from !== dorp.id) {
      // someone else's raid (a new phone, a friend's forward): their town comes next to this one, with a raid to spend
      const r = await dorp.buur(info.from);
      if (r.ok) {
        ui.toast(S.dorpWelcome(info.name), 4200);
        open = true;
      }
    }
  }
  await dorpSync({ force: true });
  if (open) {
    dorpOpenPending = true;   // (a new player's first sheets come first: the town opens once they're closed)
    dorpWhenFree();
  }
}

let dorpOpenPending = false;
/** Whatever waits for the menu with nothing open: a friend's town (their link), then "Terwyl jy weg was". */
function dorpWhenFree() {
  if (!dorpOn || screen !== 'menu' || ui.modalOpen()) return;
  if (dorpOpenPending) {
    dorpOpenPending = false;
    enterDorp('town');
    return;
  }
  dorpNewsCheck();
}
bus.on('ui:view', () => setTimeout(dorpWhenFree, 0));

let dorpAsking = false;
let dorpAskAgain = false;
// (1.20) Jou dorp's Steel en Wraak is gone (the owner, 24 Oct 2026: "I like the dorp scenario but I do not like the steal");
// Ons dorp takes its place (js/span.js). Its code stays, switched off here.
const DORP_ON = false;
async function dorpStart() {
  if (!DORP_ON || dorpOn || dorpAsking) return;
  dorpAsking = true;
  dorpOn = await dorp.ping();
  dorpAsking = false;
  if (!dorpOn) {
    // (no answer at the start, e.g. a phone without signal: asked again each time the game comes back on screen)
    if (!dorpAskAgain) {
      dorpAskAgain = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !dorpOn) dorpStart(); });
    }
    return;
  }
  await dorpSync({ force: true });
  refreshMenuDorp();
  await dorpLinks();
  refreshMenuDorp();
  dorpNewsCheck();
  kasteelNewsCheck();   // (1.17) your castle's news: the menu button's 😱
  setInterval(() => {
    if (!dorpOn || document.visibilityState !== 'visible' || (screen !== 'menu' && screen !== 'results' && screen !== 'dorp')) return;
    dorpSync().then((r) => {
      if (!r?.ok) return;
      refreshMenuDorp();
      dorpNewsCheck();
      kasteelNewsCheck(r.kasteel);
      if (screen === 'dorp' && !dorpBusy && ui.dorpMode?.() === 'town') ui.setDorpMode(dorpScreenModel('town'));
    });
  }, DORP_POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !dorpOn) return;
    dorpSync({ force: true }).then(() => {
      refreshMenuDorp();
      dorpNewsCheck();
    });
  });
}

bus.on('ui:dorp', async () => {
  if (!dorpOn) return;
  // a town needs a name its neighbours can read: asked once (the Uitdagersreeks nickname)
  if (!store.getDuel().name && !dorpNameAsked) {
    dorpNameAsked = true;
    ui.showName({ name: '', placeholder: sessionNick, back: () => bus.emit('ui:dorp') });
    return;
  }
  const was = dorpView()?.me?.people;
  enterDorp('town');
  // (the day's first visit brings the landmarks' tourists)
  const r = await dorpSync({ force: true, collect: todayKey() });
  if (screen === 'dorp' && !dorpBusy && ui.dorpMode?.() === 'town') {
    // the server's word changed the town (tourists, a raid while away, another phone's towers): built again as it stands
    const onTourists = () => ui.setDorpCounts({ me: dorpView()?.me?.people });
    const open3D = dorp3d || dorp3dMod?.town3D?.();   // (the 3D town on screen, or still being built)
    if (r?.tourists > 0 && open3D?.tourists) {   // (into the town as it is: no second build)
      ui.setDorpMode(dorpScreenModel('town', { online: !!r?.ok }));
      open3D.tourists(r.tourists, onTourists);
    }
    else if (r?.tourists > 0) enterDorp('town', { scene: { tourists: r.tourists, onTourists } });
    else if (dorpView()?.me?.people !== was) enterDorp('town');
    else ui.setDorpMode(dorpScreenModel('town', { online: !!r?.ok }));
  }
  refreshMenuDorp();
});
// landmarks: the shop over the town, a purchase lands from the sky
bus.on('ui:dorp-marks', () => {
  if (screen !== 'dorp') return;
  ui.setDorpMode({ mode: 'marks', coins: store.getEconomy().coins });
  dorpReframe();
});
bus.on('ui:dorp-marks-close', () => {
  if (screen !== 'dorp') return;
  ui.setDorpMode(dorpScreenModel('town'));
  dorpReframe();
});
bus.on('ui:dorp-buy', async (id) => {
  const m = markOf(id);
  if (!m || !dorpOn || dorpBusy || screen !== 'dorp') return;
  if ((dorpView()?.me?.marks || []).includes(id)) return;
  const paid = store.spendCoins(m.price);
  if (!paid.ok) {
    ui.toast(S.dorpNeedCoins(m.price - paid.coins), 2600);
    return;
  }
  dorpBusy = true;
  const r = await dorp.buyMark(id);
  // (no answer at all: the server may still have built it; the town says so before the coins go back)
  if (!r.ok && !r.status) await dorpSync({ force: true });
  dorpBusy = false;
  if (!r.ok && (r.status || !(dorpView()?.me?.marks || []).includes(id))) {
    store.earnCoins(m.price, { capped: false });   // (not built: the coins go back)
    coinsChanged();
    ui.toast(S.dorpOffline, 2800);
    return;
  }
  coinsChanged();
  if (dorp3d) dorp3d.buyMark(id);
  else if (game.scene.isActive('Dorp')) game.scene.getScene('Dorp')?.buyMark?.(id);   // (the 2D town, where 3D can't run)
  ui.setDorpMode({ ...dorpScreenModel('marks'), coins: store.getEconomy().coins });
  refreshMenuDorp();
});
bus.on('ui:dorp-back', leaveDorp);
bus.on('ui:dorp-home', () => {
  dorpRaid = null;
  dorpBusy = false;
  enterDorp('town');
});
// (only the Daily Tower grows the town: "So it needs to take you to the daily challenge", as the menu's Daily button does)
bus.on('ui:dorp-play', () => {
  leaveDorp();
  bus.emit('ui:play-daily');
});
bus.on('ui:dorp-tell', () => {
  if (dorpRaid?.share) ui.shareText(dorpRaid.share, 'whatsapp');
});

// a strooptog: over the sea to their town; the tap strikes, and the server settles it then (with the aim)
bus.on('ui:dorp-raid', async ({ target, wraak = null } = {}) => {
  if (!dorpOn || dorpBusy || !(isTownId(target) || target === RIKUS_ID)) return;
  dorpBusy = true;
  await dorpSync({ force: true });   // (the strooptogte the last tower earned reach the server first)
  const v = dorp.view();
  let them = (v.last?.bure || []).find((b) => b.id === target);
  if (!them) {
    const t = await dorp.townInfo(target);
    them = t.ok ? t : null;
  }
  const me = dorpView()?.me;
  if (screen !== 'dorp') {   // (the town was left while the server was asked: no raid over another screen)
    dorpBusy = false;
    return;
  }
  if (!them || !me) {
    dorpBusy = false;
    ui.toast(S.dorpOffline, 2800);
    return;
  }
  if (!wraak && !(me.raids > 0)) {
    dorpBusy = false;
    ui.toast(S.dorpNoRaidsLeft, 2800);
    return;
  }
  // (this raid's own record: the server's answer is kept, and its golden coins paid, even if the town is left meanwhile)
  const raid = { target, wraak, them, share: '' };
  dorpRaid = raid;
  enterDorp('raid', {
    mode: 'fly',
    screenExtra: { them, wraak: !!wraak },
    scene: {
      them,
      onCount: (c) => ui.setDorpCounts(c),
      onAim: () => ui.setDorpMode({ mode: 'aim' }),
      onStrike: async (hit) => {
        if (dorpRaid === raid) ui.setDorpMode({ mode: 'fly' });
        const r = await dorp.raid(target, wraak, hit);
        if (r.ok) {
          const link = `${siteUrl()}?wraak=${r.raidId}`;
          raid.share = r.wraak ? S.dorpTauntWraak(r.took | 0, link) : S.dorpTaunt(r.took | 0, link);
          // golden people caught: coins (the wallet's own, not the day's cap)
          if (r.goldTook > 0) {
            r.goldCoins = r.goldTook * DORP.goldCoins;
            store.earnCoins(r.goldCoins, { capped: false });
            coinsChanged();
          }
        }
        return r;
      },
      onDone: (r) => {
        if (dorpRaid !== raid) return;
        dorpBusy = false;
        if (!r) {
          bus.emit('ui:dorp-home');
          return;
        }
        ui.setDorpMode({
          mode: 'result',
          me: { ...(dorpView()?.me || me), people: r.town?.people ?? me.people },
          them: { ...them, people: r.them?.people ?? them.people },
          result: { took: r.took | 0, blocked: !!r.blocked, goldTook: r.goldTook | 0, goldCoins: r.goldCoins | 0, hit: r.hit, raidsLeft: r.town?.raids | 0 },
        });
        dorpReframe();
        if (r.took > 0) ui.celebrate(store.getCard().celebration);
        dorpSync({ force: true }).then(refreshMenuDorp);
      },
      onFail: (r) => {
        if (dorpRaid !== raid) return;
        dorpBusy = false;
        // ('soon': their town was raided often this hour; the strooptog stays yours)
        ui.toast(r?.error === 'raids' ? S.dorpNoRaidsLeft : r?.error === 'soon' ? S.dorpSoon(them.name || '') : S.dorpOffline, 3200);
        bus.emit('ui:dorp-home');
      },
    },
  });
});

bus.on('ui:dorp-invite', () => {
  const v = dorpView();
  ui.shareText(S.dorpInviteText(v?.me?.people | 0, `${siteUrl()}?buur=${dorp.id}`), 'whatsapp');
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// (1.17) Die Kasteelreeks (the owner, 16-17 Oct 2026): a page of its own (kasteel.html, js/kasteel/), built from your
// Daily Towers. What a siege of Robot Rikus's castle wins waits in its record (stapel.v1.kasteel: `pending` coins,
// worked out there under the day's cap) until Stapel adds it to the wallet here: one place keeps the wallet.
// ---------------------------------------------------------------------------
const KASTEEL_KEY = 'stapel.v1.kasteel';
function kasteelRead() {
  try { return JSON.parse(localStorage.getItem(KASTEEL_KEY) || '{}') || {}; } catch { return {}; }
}
function kasteelMenuView() {
  const v = kasteelRead();
  return { trophies: Math.max(0, v.trophies | 0), wins: Math.max(0, v.wins | 0), played: Math.max(0, v.played | 0), news: kasteelUnseen };
}
/**
 * Friends' sieges of your castle while you were away (server/src/kasteel.js, where the towns are): the menu's castle
 * button shows how many (😱 2) until your castle has shown them. Quiet when the server keeps no castles.
 */
let kasteelUnseen = 0;
async function kasteelNewsCheck(told = null) {
  if (!dorpOn || !KASTEEL.on) return;
  // (1.18) the Worker's town answer brings the castle's count along: no second call every poll
  if (told && Number.isInteger(told.newsN) && Number.isInteger(told.seenN)) {
    const unseen = Math.max(0, told.newsN - told.seenN);
    if (unseen !== kasteelUnseen) {
      kasteelUnseen = unseen;
      if (screen === 'menu') ui.showMenu(menuModel());
    }
    return;
  }
  try {
    const d = JSON.parse(localStorage.getItem('stapel.v1.dorp') || 'null');
    if (!d?.id || !d?.key) return;
    const res = await fetch(`${matchApiUrl()}/kasteel/home`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, key: d.key }), credentials: 'omit', cache: 'no-store' });
    if (!res.ok) return;
    const r = await res.json();
    const unseen = Math.max(0, (r.newsN | 0) - (r.seenN | 0));
    if (unseen === kasteelUnseen) return;
    kasteelUnseen = unseen;
    if (screen === 'menu') ui.showMenu(menuModel());
  } catch { /* the badge waits for the next check */ }
}
/**
 * A mode's coins into the wallet (its own record's `pending`, worked out there under the day's cap: the Kasteelreeks'
 * stapel.v1.kasteel, Blokbotsing's stapel.v1.botsing), counted towards the day's cap like Oefen. What the cap can't take
 * today (Oefen filled it before this claim) waits in `pending` for the next claim: coins won are never lost.
 * Returns { added, left } or null when none waited.
 */
function claimPending(key) {
  let v = {};
  try { v = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return null; }
  const n = Math.max(0, Math.min(5000, v.pending | 0));
  if (!n) return null;
  try { localStorage.setItem(key, JSON.stringify({ ...v, pending: 0 })); } catch { return null; }   // (cleared first: never paid twice)
  const r = store.earnCoins(n, { capped: true });
  const left = n - r.added;
  if (left > 0) {
    try { localStorage.setItem(key, JSON.stringify({ ...v, pending: left })); } catch { /* this phone keeps nothing */ }
  }
  coinsChanged();
  return { added: r.added, left };
}
/**
 * The castle's and Block Clash's coins, on every return to Stapel (a fresh start, or the page brought back as it was
 * by the browser's Back), each with its toast.
 */
function claimModeCoins() {
  const say = (c, won) => (c.added ? won(fmtInt(c.added)) : S.modeLootFull(fmtInt(c.left)));
  const toasts = [[claimPending(GLY_KEY), S.glybaanLoot], [claimPending(KASTEEL_KEY), S.kasteelLoot], [claimPending('stapel.v1.botsing'), S.botsingLoot]].filter(([c]) => c);
  toasts.forEach(([c, won], i) => setTimeout(() => ui.toast(say(c, won), 4200), 1200 + i * 4400));
}
// (1.19) Glybaan, the slide (glybaan.html, js/gly/): its record keeps your best and the coins still to reach the wallet
const GLY_KEY = 'stapel.v1.gly';
function glyMenuView() {
  try {
    const v = JSON.parse(localStorage.getItem(GLY_KEY) || '{}') || {};
    return { best: Math.max(0, Math.floor(Number(v.best) || 0)), level: Math.max(1, Math.min(999, Math.floor(Number(v.level) || 1))) };
  } catch { return { best: 0, level: 1 }; }
}
// (the browser's Back from the castle or the battle can bring this page back from its memory, without a new start)
window.addEventListener('pageshow', (e) => {
  if (!e.persisted || !window.__stapel?.booted) return;
  claimModeCoins();
  if (screen === 'menu') showMenu();
});
bus.on('ui:kasteel', () => { location.href = 'kasteel.html'; });
bus.on('ui:glybaan', () => { location.href = 'glybaan.html'; });   // (1.19 3D) Glybaan
bus.on('ui:botsing', () => { location.href = 'botsing.html'; });   // (1.18 3D) Blokbotsing
bus.on('ui:botsing-friend', () => { location.href = 'botsing.html?vriend=1'; });

// (1.17) Vrugteslag: Ryk teen Ryk (js/core/slag.js, js/scenes/SlagScene.js; the owner, 16 Oct 2026: "Break your oponents
// empire before he breaks yours", his style B and his four extras). This first version: you against Robot Rikus, in the
// sunset world. The fruit basket lives on this phone (stapel.v1.slag) and fills from the Daily Tower; a battle uses at
// most SLAG.perBattle of each; the end pays coins, trophies and (a win) people for Jou dorp.
// ---------------------------------------------------------------------------
const SLAG_KEY = 'stapel.v1.slag';
function slagLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(SLAG_KEY) || 'null');
    return { v: 1, basket: cleanBasket(d?.basket), trophies: Math.max(0, d?.trophies | 0), wins: Math.max(0, d?.wins | 0), losses: Math.max(0, d?.losses | 0), played: Math.max(0, d?.played | 0) };
  } catch {
    return { v: 1, basket: newBasket(), trophies: 0, wins: 0, losses: 0, played: 0 };
  }
}
function slagSave(d) {
  try { localStorage.setItem(SLAG_KEY, JSON.stringify(d)); } catch { /* private mode: this visit only */ }
}
/** Your rank's badge by trophies (the game's own medals). */
const slagBadge = (tr) => (tr >= 600 ? '💎' : tr >= 300 ? '🥇' : tr >= 100 ? '🥈' : '🥉');
/** What the menu shows of the battle (always there: Robot Rikus needs no server). */
function slagMenuView() {
  const d = slagLoad();
  return { trophies: d.trophies, basket: d.basket };
}
/** A battle castle from your empire: more people in Jou dorp, more rows (8-12). */
function slagCastleSize() {
  const p = dorpView()?.me?.people | 0;
  const rows = Math.max(8, Math.min(12, 8 + Math.floor(Math.log2(1 + p / 50))));
  return { rows, people: Math.round(rows * 3.6) };
}
let slagRun = null;
let slagBgWas = null;
function slagBarsGame() {
  const b = ui.slagBars();
  const k = b.height ? game.scale.height / b.height : 1;
  return { top: Math.round(b.top * k), bottom: Math.round(b.bottom * k) };
}
function slagReframe() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const b = slagBarsGame();
    game.scene.getScene('Slag')?.setBars?.(b.top, b.bottom, 400);
  }));
}
function stopSlagScene() {
  for (const k of ['Slag', 'Dorp']) if (game.scene.isActive(k) || game.scene.isPaused(k) || game.scene.isSleeping(k)) game.scene.stop(k);
  if (slagBgWas != null) {
    game.registry.set('bgSkin', slagBgWas);
    slagBgWas = null;
  }
  if (game.scene.isSleeping('Game')) game.scene.wake('Game');
}
/** The screen's side of each of the battle's steps (the scene asks; the screen answers). */
function slagUi() {
  let setupCb = {};
  let cancel = null;
  return {
    counts: (c) => ui.slagCounts(c),
    setup: (o) => {
      if (o.onPick) setupCb = { onPick: o.onPick, onShuffle: o.onShuffle, onReady: () => { o.onReady(); } };
      ui.slagMode('setup', { places: o.places, pick: o.pick, ...setupCb });
    },
    mode: (m, extra = {}) => {
      ui.slagMode(m, { ...extra, onCancel: () => cancel?.() });
      slagReframe();
    },
    pick: (o) => new Promise((resolve) => {
      ui.slagMode('pick', { ...o, onPick: (k) => resolve(k) });
      slagReframe();
    }),
    mini: () => ui.slagMini(['aap', 'sap', 'emmer'][Math.floor(Math.random() * 3)]),
    aimHook: (fn) => { cancel = () => fn('cancel'); },
    used: (kind, caught) => {
      if (slagRun && kind in slagRun.used && !caught) slagRun.used[kind] += 1;
    },
    shot: () => {},
    end: (r) => slagEnd(r),
  };
}
/** Your castle for a battle (from your empire's size) and who you are in it. */
function slagMine(seed) {
  const size = slagCastleSize();
  const myId = dorp.id || `K${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  return { id: myId, name: duelNick(), tribe: tribeNow(), castle: makeCastle({ rows: size.rows, people: size.people, seed: `${myId}/${seed}` }), empire: 4 };
}
/** A castle that came from the other game (its rows only, checked). */
function slagTheirs(h) {
  const rows = (Array.isArray(h?.castle) ? h.castle : []).slice(0, SLAG.rowsMax).map((r) => {
    const cap = Math.max(SLAG.rowMin, Math.min(SLAG.rowMax, r?.cap | 0));
    return { people: Math.max(0, Math.min(cap, r?.people | 0)), cap, cracked: false };
  });
  while (rows.length < SLAG.rowsMin) rows.push({ people: SLAG.rowMin, cap: SLAG.rowMin, cracked: false });
  return { rows, defenders: {}, revealed: [], joeBig: false };
}
/** Vrugteslag's own screen: who to fight (Robot Rikus, a friend's room, a friend's code). */
let slagConn = null;
function slagLobby(note = '') {
  screen = 'slag';
  wakeLoop();
  ui.hideAll();
  ui.showSlagScreen({ theme: 'b', mode: 'lobby', note, me: { name: duelNick() }, them: {} });
}
async function slagHost() {
  const net = createSlagNet({ api: matchApiUrl() });
  const code = await net.create();
  if (!code) {
    slagLobby(S.slagNoRoom);
    return;
  }
  slagConn?.close();
  const conn = net.connect(code);
  slagConn = conn;
  ui.slagMode('lobby', { hosting: code, link: `${siteUrl()}?slag=${code}` });
  await conn.ready;
  if (slagConn === conn) slagLive(conn, 0);
}
async function slagJoin(code) {
  if (!/^[A-Z0-9]{6}$/.test(code || '')) {
    slagLobby(S.slagBadCode);
    return;
  }
  slagConn?.close();
  const conn = createSlagNet({ api: matchApiUrl() }).connect(code);
  slagConn = conn;
  slagLobby(S.slagWaiting);
  const seat = await Promise.race([conn.seat, new Promise((r) => setTimeout(() => r(null), 6000))]);
  if (seat == null) {
    slagLobby(S.slagBadCode);
    return;
  }
  await conn.ready;
  if (slagConn === conn) slagLive(conn, seat);
}
/** Both games in the room: swap who you are and your castles (the room's maker sends the battle's seed), then fight. */
async function slagLive(conn, seat) {
  const seed = seat === 0 ? Date.now().toString(36) : null;
  const me = slagMine(seed || Date.now().toString(36));
  conn.send({ t: 'hello', id: me.id, name: me.name, tribe: me.tribe, castle: me.castle.rows.map((r) => ({ people: r.people, cap: r.cap })), seed });
  const h = await conn.next(['hello']);
  if (h.t === 'gone') {
    slagLobby(S.slagLeft(''));
    return;
  }
  const them = { id: /^[A-Z0-9]{4,12}$/i.test(h.id || '') && h.id !== me.id ? h.id : `T${seat}X`, name: typeof h.name === 'string' && h.name.trim() ? h.name.slice(0, 22) : S.duelSomeone, tribe: ['vuur', 'water', 'gras'].includes(h.tribe) ? h.tribe : 'water', castle: slagTheirs(h), empire: 4 };
  enterSlag({ me, them, net: conn, seat, seed: seat === 0 ? seed : String(h.seed || 'x') });
}
/** Into a fruit battle (Robot Rikus, or `net`: a friend): the sunset world, both castles, your basket's fruit. */
function enterSlag(opts = {}) {
  const d = slagLoad();
  const seed = opts.seed || Date.now().toString(36);
  const me = opts.me || slagMine(seed);
  const rTribe = { vuur: 'gras', water: 'vuur', gras: 'water' }[tribeNow()] || 'gras';
  const size = slagCastleSize();
  const them = opts.them || { id: 'RIKUS', name: 'Robot Rikus', tribe: rTribe, castle: makeCastle({ rows: size.rows, people: size.people, seed: `rikus/${seed}` }), empire: 4, bot: true };
  slagRun = { used: { piesang: 0, sap: 0, waatlemoen: 0 }, seed, live: !!opts.net };
  screen = 'slag';
  wakeLoop();
  ui.hideAll();
  if (game.scene.isActive('Game')) game.scene.sleep('Game');
  if (game.scene.isActive('Hud')) game.scene.sleep('Hud');
  for (const k of ['Slag', 'Dorp']) if (game.scene.isActive(k) || game.scene.isPaused(k)) game.scene.stop(k);
  // (the owner's style B: the sunset over the savanna)
  if (slagBgWas == null) slagBgWas = game.registry.get('bgSkin');
  game.registry.set('bgSkin', 'sonsondergang');
  ui.showSlagScreen({
    theme: 'b',
    me: { name: me.name, badge: slagBadge(d.trophies), people: castlePeople(me.castle), max: castlePeople(me.castle) },
    them: { name: them.name, badge: them.bot ? '🤖' : '⚔️', people: castlePeople(them.castle), max: castlePeople(them.castle) },
  });
  const bars = slagBarsGame();
  game.scene.start('Slag', { me, them, seed, fruit: battleFruit(d.basket), reducedMotion: !!settings.reducedMotion, topBar: bars.top, trayBar: bars.bottom, ui: slagUi(), net: opts.net || null, seat: opts.seat ?? 0 });
}
/** The end: the fruit used leaves the basket; coins, trophies, and (a win) people for Jou dorp. */
function slagEnd(r) {
  const d = slagLoad();
  for (const k of ['piesang', 'sap', 'waatlemoen']) d.basket[k] = Math.max(0, d.basket[k] - (slagRun?.used[k] | 0));
  const rew = battleReward({ won: r.won, theirStart: r.startThem });
  d.trophies = Math.max(0, d.trophies + rew.trophies);
  d.played += 1;
  if (r.won) d.wins += 1;
  else d.losses += 1;
  slagSave(d);
  store.earnCoins(rew.coins, { capped: false });
  coinsChanged();
  const people = dorpOn && rew.people ? rew.people : 0;
  if (people) {
    dorp.queue({ people });
    dorpSync({ force: true });
  }
  ui.slagMode('end', { result: { won: r.won, coins: rew.coins, trophies: rew.trophies, people } });
  if (r.won) ui.celebrate(store.getCard().celebration);
}
bus.on('ui:slag', () => slagLobby());
bus.on('ui:slag-bot', () => enterSlag());
bus.on('ui:slag-host', slagHost);
bus.on('ui:slag-join', (code) => slagJoin(code));
bus.on('ui:slag-again', () => {
  // against a friend: back to the lobby (a new room); against Robot Rikus: at once
  if (slagRun?.live) {
    stopSlagScene();
    slagConn?.close();
    slagConn = null;
    slagLobby();
  } else {
    enterSlag();
  }
});
bus.on('ui:slag-done', () => {
  stopSlagScene();
  slagConn?.close();
  slagConn = null;
  slagRun = null;
  bus.emit('ui:home');
});

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
  claimModeCoins();   // (before the menu: its wallet shows them)
  showMenu();
  dorpStart();   // (1.16) Jou dorp: only where the server knows the towns
  spanStart();   // (1.20) Ons dorp: the crew on the server (a crew of one on this phone without it)
  if (SLAG_ON) {
    // (1.17) a friend's Vrugteslag link (?slag=CODE): into their room
    const code = new URLSearchParams(location.search).get('slag');
    if (/^[A-Z0-9]{6}$/.test(code || '')) {
      try { history.replaceState(history.state, '', location.pathname + location.hash); } catch { /* the address stays */ }
      setTimeout(() => slagJoin(code), 900);
    }
  }
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
