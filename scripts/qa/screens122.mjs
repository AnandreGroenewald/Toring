// (1.22 polish) Every menu screen at phone size for a look: the menu, the dock's sheets (rules, stats, shop tabs,
// settings), Saam gly, Uitdagersreeks, the 🏆 sheet, then a Daily played (autoplay) and its results scrolled through.
// usage: node screens122.mjs <outdir> [tall|short] [af|en]   Server :8317.
import { launch, openPage, sleep } from './lib.mjs';
import { mkdirSync } from 'node:fs';
const [out = '/tmp/stapel-shots/screens122', vp = 'tall', lang = 'af'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await launch({ gpu: process.env.GPU === '1' });
const { page, problems } = await openPage(browser, vp, 'index.html?nosw=1&debug=1&board=1&date=2026-10-27&auto=0.8', { lang });
let n = 0;
const shot = (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.jpg`, quality: 80 });
const close = async () => { await page.keyboard.press('Escape'); await sleep(500); };
const dock = (i) => page.evaluate((k) => document.querySelectorAll('.dock-btn')[k]?.click(), i);
await sleep(2500);
await shot('menu');
await page.evaluate(() => window.scrollTo(0, 99999));
await sleep(300);
const docks = await page.evaluate(() => [...document.querySelectorAll('.dock-btn')].map((b) => b.innerText.trim()));
console.log('dock', JSON.stringify(docks));
for (let i = 0; i < docks.length; i++) {
  await dock(i);
  await sleep(1200);
  await shot(`dock${i}`);
  const tabs = await page.$$('.shop-tab, [role=tab]');
  for (let t = 1; t < Math.min(3, tabs.length); t++) { await tabs[t].click().catch(() => {}); await sleep(700); await shot(`dock${i}-tab${t}`); }
  await close();
}
for (const [sel, name] of [['.saam-menu-btn', 'saam'], ['.board-chip', 'board']]) {
  const ok = await page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); return !!b; }, sel);
  if (!ok) { console.log('missing', sel); continue; }
  await sleep(1300);
  await shot(name);
  await close();
}
// the Uitdagersreeks screen (the wide purple tile)
const duelOk = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Uitdagersreeks|Challenge/i.test(x.innerText)); if (b) b.click(); return !!b; });
if (duelOk) { await sleep(1500); await shot('uitdagers'); await page.evaluate(() => window.__stapel.bus.emit('ui:home')); await sleep(1200); }
// a Daily, then its results from top to bottom
await page.evaluate(() => window.__stapel.bus.emit('ui:play-daily'));
await page.waitForFunction(() => window.__stapel.where.screen === 'results', null, { timeout: 180000 });
await sleep(3500);
await shot('results-top');
const H = await page.evaluate(() => { const s = document.querySelector('.results, #results, [data-screen=results]') || document.scrollingElement; return s.scrollHeight; });
for (let y = 600, k = 1; y < H && k < 5; y += 600, k++) {
  await page.evaluate((yy) => { document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = yy; }); window.scrollTo(0, yy); }, y);
  await sleep(500);
  await shot(`results-${k}`);
}
console.log('problems', JSON.stringify(problems.slice(0, 6)));
await browser.close();
