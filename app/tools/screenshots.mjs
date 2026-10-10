// Google Play phone screenshots (1080 × 1920) of the game as the app ships it (app/www, so run
// build-www.mjs first), played by the game's own debug autoplay in headless Chrome.
// usage: node tools/screenshots.mjs [numbers...]   (from app/; Afrikaans: store/screenshots/*.png)
//        LANG=en node tools/screenshots.mjs        (English: store/screenshots-en/*.png)
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const here = dirname(fileURLToPath(import.meta.url));
const www = join(here, '../www');
const LANG = process.env.LANG === 'en' ? 'en' : 'af';
const out = join(here, LANG === 'en' ? '../store/screenshots-en' : '../store/screenshots');
mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(www, p));
  try {
    if (!file.startsWith(www)) throw new Error('outside');
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// (1.12.1) Emoji as Android draws them, and art we may show in a store picture: Google's Noto Color Emoji (SIL OFL
// 1.1) stands in for this Mac's Apple Color Emoji, whose artwork has no licence for marketing. The game's emoji font
// lists name Apple's first, so that name points at Noto here. The font files are fetched once and served from
// memory, and all of them are loaded before a picture's game starts (the game draws each emoji once and keeps it).
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
// Emoji inside a sentence take the text font (--font, css/style.css), which names no emoji font, so they would come
// from this Mac's own emoji: the text font gets the Noto name at its end too (round 3 of the panel: a silver coin
// beside a gold one, two looks of Skelm Sakkie).
const notoCss = (await (await fetch('https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=block', { headers: { 'User-Agent': UA } })).text())
  .replaceAll("'Noto Color Emoji'", "'Apple Color Emoji'")
  + '\nhtml:root { --font: "Trebuchet MS", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", sans-serif; }\n';
const fontFiles = new Map();
for (const url of new Set(notoCss.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])) {
  fontFiles.set(url, Buffer.from(await (await fetch(url)).arrayBuffer()));
}
if (!fontFiles.size) throw new Error('no Noto Color Emoji files: the store pictures would show Apple emoji');

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(query) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.route('https://fonts.gstatic.com/**', (route) => {
    const body = fontFiles.get(route.request().url());
    return body ? route.fulfill({ status: 200, contentType: 'font/woff2', body, headers: { 'Access-Control-Allow-Origin': '*' } }) : route.abort();
  });
  await ctx.addInitScript(`(() => {
    const add = () => {
      const st = document.createElement('style');
      st.textContent = ${JSON.stringify(notoCss)};
      (document.head || document.documentElement).appendChild(st);
      for (const f of document.fonts) if (f.family.includes('Apple Color Emoji')) f.load().catch(() => {});
    };
    if (document.documentElement) add();
    else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); add(); } }).observe(document, { childList: true });
  })();`);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  await page.goto(`${BASE}index.html?nosw=1&debug=1&lang=${LANG}&${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stapel && window.__stapel.booted === true, null, { timeout: 30000 });
  // every Noto file in place before anything is played (an emoji drawn before its file came would stay Apple's)
  const faces = await page.evaluate(async () => {
    const list = [...document.fonts].filter((f) => f.family.includes('Apple Color Emoji'));
    await Promise.all(list.map((f) => f.load().catch(() => null)));
    return list.map((f) => f.status);
  });
  if (!faces.length || faces.some((x) => x !== 'loaded')) throw new Error(`Noto Color Emoji not loaded: ${faces}`);
  await page.evaluate(() => {
    if (document.querySelector('.modal.on')) window.__stapel.ui.closeModal();
    window.__stapel.store.setSettings({ cementSeen: true });   // (a player who knows the game: no first-time tips)
  });
  // no debug fps meter in a store picture
  await page.addStyleTag({ content: 'body > div[style*="monospace"] { display: none !important; }' });
  return page;
}
const only = process.argv.slice(2);
const want = (n) => !only.length || only.includes(String(n));
const shot = async (page, name) => {
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log('  ', name);
};
const until = (page, fn, arg, ms = 240000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 250 });

// 1. the start screen, as a player who has played a while sees it (coins, a name)
if (want(1)) {
  const page = await open('seed=winkel1');
  await page.evaluate(() => {
    const s = window.__stapel.store;
    s.markTutorialSeen();
    s.earnCoins(460, { capped: false });
    window.__stapel.bus.emit('ui:home');
  });
  await sleep(2500);
  await shot(page, '1-tuis');
  await page.context().close();
}
// 2. a tower in the rain
if (want(2)) {
  const page = await open('seed=winkel2&auto=0.05');
  await page.evaluate(() => window.__stapel.bus.emit('ui:play-practice'));
  await until(page, () => window.__stapel.scene && window.__stapel.scene.mode === 'practice' && window.__stapel.scene.maxHeightM > 12);
  // a normal shower (4 blocks long), photographed two blocks in
  const start = await page.evaluate(() => {
    const sc = window.__stapel.scene;
    sc.visitors.scheduled = false;
    sc.weather.sequence = Object.assign(Object.create(Object.getPrototypeOf(sc.weather.sequence)), sc.weather.sequence, { eventAt: () => null });
    sc.weather._startEvent({ type: 'rain', start: sc.i, end: sc.i + 4, dir: 1, strength: 1 });
    return sc.i;
  });
  await until(page, (s) => window.__stapel.scene.i >= s + 2, start);
  await sleep(900);
  await shot(page, '2-reen');
  await page.context().close();
}
// 3. Blouaap comes to visit
if (want(3)) {
  const page = await open('seed=winkel3&auto=0.05&visitor=monkey');
  await page.evaluate(() => window.__stapel.bus.emit('ui:play-practice'));
  await until(page, () => window.__stapel.scene && window.__stapel.scene.visitors.active);
  await sleep(1300);
  await shot(page, '3-blouaap');
  await page.context().close();
}
// 4. Blok vir Blok against Robot Rikus: one tower, a block each, both players' hearts at the top
if (want(4)) {
  for (const seed of ['winkel8', 'winkel9', 'winkel10']) {
    const page = await open(`seed=${seed}&auto=0.05`);
    await page.evaluate(() => {
      window.__stapel.bus.emit('ui:duel-mode', 'turns');
      window.__stapel.bus.emit('ui:duel-bot');
    });
    await until(page, () => window.__stapel.scene && window.__stapel.scene.mode === 'duel');
    await until(page, () => window.__stapel.scene.tower.length >= 9 || window.__stapel.scene.over);
    const ok = await page.evaluate(() => !window.__stapel.scene.over);
    if (ok) {
      await sleep(1200);
      await shot(page, '4-blokvirblok');
    }
    await page.context().close();
    if (ok) break;
  }
}
// 5. Wedloop against Robot Rikus
if (want(5)) {
  // past the 30 m mark: its attack toast shows, and the 50 m finish line crosses the open sky
  // (an autoplay tower can fall first: then the next seed)
  for (const seed of ['winkel4', 'winkel5', 'winkel6', 'winkel7']) {
    const page = await open(`seed=${seed}&auto=0.05`);
    await page.evaluate(() => window.__stapel.bus.emit('ui:duel-bot'));
    await until(page, () => window.__stapel.scene && window.__stapel.scene.mode === 'duel');
    await until(page, () => window.__stapel.scene.maxHeightM > 30.5 || window.__stapel.scene.over);
    const ok = await page.evaluate(() => !window.__stapel.scene.over);
    if (ok) {
      await sleep(300);
      await shot(page, '5-wedloop');
    }
    await page.context().close();
    if (ok) break;
  }
}
// 6. the daily tower's results
if (want(6)) {
  const page = await open('date=2026-10-21&auto=0.08');
  await page.evaluate(() => window.__stapel.bus.emit('ui:play-daily'));
  await until(page, () => !!document.querySelector('.screen-results.on .res-card'), null, 600000);
  await sleep(2200);
  await shot(page, '6-uitslag');
  await page.context().close();
}

await browser.close();
server.close();
console.log(problems.length ? `problems: ${problems.join(' | ')}` : 'problems: none');
