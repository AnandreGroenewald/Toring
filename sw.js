// Stapel service worker: precache the whole app for offline play, but always try
// the network first so a new version reaches players on their next visit.
// Bump VERSION when shipping; old caches are deleted on activate.

const VERSION = 'stapel-v1.0.0';

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'lib/phaser.min.js',
  'js/main.js',
  'js/config.js',
  'js/audio.js',
  'js/core/bus.js',
  'js/core/format.js',
  'js/core/strings.js',
  'js/core/rng.js',
  'js/core/daily.js',
  'js/core/sequence.js',
  'js/core/storage.js',
  'js/core/share.js',
  'js/ui/dom.js',
  'js/game/blocks.js',
  'js/game/weather.js',
  'js/game/crane.js',
  'js/game/water.js',
  'js/game/effects.js',
  'js/game/island.js',
  'js/scenes/BgScene.js',
  'js/scenes/GameScene.js',
  'js/scenes/HudScene.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

// On a flaky connection, don't make the player stare at a blank screen:
// fall back to the cached copy if the network is this slow.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // One by one, so a single missing file can never break the install.
    await Promise.all(PRECACHE.map(async (path) => {
      try {
        const res = await fetch(new Request(path, { cache: 'reload' }));
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
  if (url.origin !== self.location.origin) return;

  let saved = Promise.resolve();
  const network = fetch(req).then((res) => {
    if (res && res.ok && res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      saved = caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
    }
    return res;
  });
  event.respondWith(networkFirst(req, network));
  // Keep the worker alive until the fresh copy is stored.
  event.waitUntil(network.then(() => saved, () => {}));
});

async function fromCache(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === 'navigate') {
    return (await cache.match('index.html')) || (await cache.match('./')) || undefined;
  }
  return undefined;
}

async function networkFirst(req, network) {
  let timer = 0;
  const slow = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fromCache(req)), NETWORK_TIMEOUT_MS);
  });
  try {
    // The network wins unless it is slow and we have a cached copy to show instead.
    const res = await Promise.race([network, slow.then((hit) => hit || network)]);
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    const hit = await fromCache(req);
    return hit || new Response('', { status: 504, statusText: 'Offline' });
  }
}
