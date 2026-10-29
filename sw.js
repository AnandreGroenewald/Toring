// Stapel service worker: precache the whole app for offline play, but always try
// the network first so a new version reaches players on their next visit.
// Bump VERSION (and VERSION in js/config.js) when shipping; old caches are deleted on activate.

const VERSION = 'stapel-v1.24.3';
const MODELS = 'stapel-models';   // (1.20) the 3D models' own cache: kept when VERSION changes

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'lib/phaser.min.js',
  'js/main.js',
  'js/config.js',
  'js/sponsorConfig.js',
  'js/sponsorsFeed.js',
  'js/audience.js',
  'js/board.js',
  'js/account.js',
  'js/duel.js',
  'sponsors.json',
  'js/audio.js',
  'js/core/bus.js',
  'js/core/format.js',
  'js/core/strings.js',
  'js/core/strings.en.js',
  'js/core/i18n.js',
  'js/core/langboot.js',
  'js/core/rng.js',
  'js/core/daily.js',
  'js/core/sequence.js',
  'js/core/weatherplan.js',
  'js/core/zones.js',
  'js/core/visitorplan.js',
  'js/core/visitorrules.js',
  'js/core/duel.js',
  'js/core/economy.js',
  'js/core/week.js',
  'js/core/tries.js',
  'js/core/turns.js',
  'js/moved.js',
  'js/core/emojifit.js',
  'js/core/storage.js',
  'js/core/cloudsave.js',
  'js/core/launch.js',
  'js/core/share.js',
  'js/core/nameRules.js',
  'js/core/sponsors.js',
  'js/core/audience.js',
  'js/core/coach.js',
  'js/core/sayings.js',
  'js/core/skyline.js',
  'js/core/challenge.js',
  'js/core/teaser.js',
  'js/core/install.js',
  'js/ui/dom.js',
  'js/ui/celebrate.js',
  'js/game/blocks.js',
  'js/game/residents.js',
  'js/game/floors.js',
  'js/game/living.js',
  'js/core/living.js',
  'js/scenes/LewendeScene.js',
  'js/ui/lewendeUi.js',
  'js/dorp.js',
  'js/span.js',
  'js/ui/spannews.js',
  'js/core/span.js',
  'js/core/weektower.js',
  'js/core/dorp.js',
  'js/scenes/DorpScene.js',
  'js/scenes/SlagScene.js',
  'js/core/slag.js',
  'js/slagNet.js',
  'js/rivier/duel.js',
  'js/rivier/saamNet.js',
  'js/game/weather.js',
  'js/game/visitors.js',
  'js/game/crane.js',
  'js/game/water.js',
  'js/game/effects.js',
  'js/game/emojitex.js',
  'js/game/island.js',
  'js/game/billboard.js',
  'js/scenes/BgScene.js',
  'js/scenes/bgskins.js',
  'js/scenes/GameScene.js',
  'js/scenes/HudScene.js',
  'icons/icon.svg',
  // (1.15) the Winkel's world photos
  ...['dag', 'sonsondergang', 'lekkergoed', 'nag', 'kersieblom', 'noorderlig', 'ruimte', 'akwarium', 'sintgolf'].map((id) => `img/worlds/${id}.jpg`),
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  // the 512 px icons are only for installing; the browser fetches them itself
  // (1.17, 1.18, 1.19) the pages of their own (the castle, the battle, the slide): their pages only; their 3D files are
  // kept on the first visit (see PAGES below)
  'kasteel.html',
  'botsing.html',
  'glybaan.html',
];

// (1.17, 1.18) Pages of their own: a visit to one is never answered with the game's page (offline or slow, its own kept
// copy opens, or the browser says it's offline). Cloudflare Pages serves them without '.html' (it redirects
// /kasteel.html to /kasteel), so a kept copy may sit under either name.
const PAGES = ['kasteel', 'botsing', 'glybaan'];

// On a flaky connection, don't make the player stare at a blank screen: if the
// page itself is this slow, open the cached copy instead.
const NETWORK_TIMEOUT_MS = 4000;

// Pages (clients) that were opened from the cache. All of their files come from
// the same cache too, so one page load never mixes two releases (a new main.js
// with an old config.js would not even start).
const offlineClients = new Set();

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // One by one, so a single missing file can never break the install. 'no-cache'
    // revalidates with the server: files the page just loaded come back as cheap 304s.
    await Promise.all(PRECACHE.map(async (path) => {
      try {
        const res = await fetch(new Request(path, { cache: 'no-cache' }));
        if (res.ok) await cache.put(path, await unredirected(res));
      } catch {
        // offline or 404: the network-first handler will fill it in later
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('stapel-') && key !== VERSION && key !== MODELS)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Other origins (the sponsor API among them) are never touched or cached here:
  // js/sponsorsFeed.js keeps its own short-lived copy of the sponsor list.
  if (url.origin !== self.location.origin) return;
  // (1.15.6) the Living Tower preview is a page of its own: never answered with the game's cached page
  if (url.pathname.includes('/lewende-toring/')) return;
  // (1.20) the 3D models (img/models/*.glb, ~2.6 MB): downloaded once and kept across versions (mobile data); a new
  // model gets a new name (models.js asks for `name.glb?v=N`), so a kept one is never stale
  if (url.pathname.includes('/img/models/')) {
    event.respondWith(caches.open(MODELS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200) c.put(req, res.clone()).catch(() => {});
      return res;
    }));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(navigate(event));
    return;
  }
  if (event.clientId && offlineClients.has(event.clientId)) {
    event.respondWith(fromCache(req).then((hit) => hit || fetchAndStore(req, event)));
    return;
  }
  // Same release for the whole page: the network (revalidated), the cache only if the network fails.
  event.respondWith(fetchAndStore(req, event).catch(async () => {
    const hit = await fromCache(req);
    return hit || new Response('', { status: 504, statusText: 'Offline' });
  }));
});

/** Network (revalidating past the HTTP cache, so a deploy shows up), storing a fresh copy. */
function fetchAndStore(req, event) {
  // (a navigation Request can't take an init object; the browser revalidates pages anyway)
  const net = (req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' })).then((res) => {
    if (res && res.ok && res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {}));
    }
    return res;
  });
  return net;
}

/**
 * A response the server reached through a redirect (Pages sends /index.html to /, /kasteel.html to /kasteel) can't
 * answer a page visit (the browser shows an error instead): kept as a plain copy.
 */
async function unredirected(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** Which page of its own `url` is ('kasteel', 'botsing', 'glybaan'), or null (the game). */
function pageOf(url) {
  const m = /\/([a-z]+)(?:\.html)?$/.exec(url.pathname);
  return m && PAGES.includes(m[1]) ? m[1] : null;
}

async function fromCache(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit && !(req.mode === 'navigate' && hit.redirected)) return hit;
  if (req.mode === 'navigate') {
    const page = pageOf(new URL(req.url));
    if (page) {
      // its own copy under either name, never the game's page
      for (const name of [`${page}.html`, page]) {
        const own = await cache.match(name, { ignoreSearch: true });
        if (own && !own.redirected) return own;
      }
      return undefined;
    }
    for (const name of ['./', 'index.html']) {
      const own = await cache.match(name);
      if (own && !own.redirected) return own;
    }
  }
  return undefined;
}

/** The page: network first, but a slow network (or none) opens the cached copy. */
async function navigate(event) {
  const req = event.request;
  const net = fetchAndStore(req, event);
  net.catch(() => {});   // handled below; don't report it twice
  let timer = 0;
  const slow = new Promise((resolve) => {
    timer = setTimeout(resolve, NETWORK_TIMEOUT_MS, 'slow');
  });
  const useCache = async () => {
    const hit = await fromCache(req);
    if (hit && event.resultingClientId) offlineClients.add(event.resultingClientId);
    return hit;
  };
  try {
    const first = await Promise.race([net, slow]);
    if (first !== 'slow') {
      clearTimeout(timer);
      return first;
    }
    return (await useCache()) || (await net);
  } catch {
    clearTimeout(timer);
    const hit = await useCache();
    return hit || (pageOf(new URL(req.url)) ? offlinePage() : new Response('', { status: 504, statusText: 'Offline' }));
  }
}

/** (1.17) A page of its own that was never opened online: a short word and the way back to Stapel. */
function offlinePage() {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Stapel</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1c1b33;'
    + 'color:#fff;font:600 18px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box">'
    + '<div><p>📶 Jy is nie aanlyn nie.<br><span style="opacity:.7;font-weight:400">You’re offline.</span></p>'
    + '<p><a href="./" style="color:#ffd23f">‹ Stapel</a></p></div>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
