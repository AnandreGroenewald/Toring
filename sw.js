// Stapel service worker: precache the whole app for offline play, but always try
// the network first so a new version reaches players on their next visit.
// Bump VERSION (and VERSION in js/config.js) when shipping; old caches are deleted on activate.

const VERSION = 'stapel-v1.7.0';

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
  'js/duel.js',
  'sponsors.json',
  'js/audio.js',
  'js/core/bus.js',
  'js/core/format.js',
  'js/core/strings.js',
  'js/core/rng.js',
  'js/core/daily.js',
  'js/core/sequence.js',
  'js/core/weatherplan.js',
  'js/core/visitorplan.js',
  'js/core/visitorrules.js',
  'js/core/duel.js',
  'js/core/storage.js',
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
  'js/game/blocks.js',
  'js/game/weather.js',
  'js/game/visitors.js',
  'js/game/crane.js',
  'js/game/water.js',
  'js/game/effects.js',
  'js/game/island.js',
  'js/game/billboard.js',
  'js/scenes/BgScene.js',
  'js/scenes/GameScene.js',
  'js/scenes/HudScene.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  // the 512 px icons are only for installing; the browser fetches them itself
];

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
        if (res.ok) await cache.put(path, res);
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
      .filter((key) => key.startsWith('stapel-') && key !== VERSION)
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

async function fromCache(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === 'navigate') {
    return (await cache.match('index.html')) || (await cache.match('./')) || undefined;
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
    return hit || new Response('', { status: 504, statusText: 'Offline' });
  }
}
