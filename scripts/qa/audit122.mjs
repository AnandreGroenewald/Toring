// (1.22 polish, 26 Oct 2026) The whole game in pictures at phone size, for a graphics read: the menu, a Daily tower
// (autoplay) frame by frame, its results, the River run at each world (jumpTo), and the shop. Real game, this phone
// alone. usage: node audit122.mjs <outdir> [af|en]   (GPU=1 for the 3D river)
import { launch, openPage, sleep } from './lib.mjs';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || '/tmp/stapel-shots/audit122';
const lang = process.argv[3] || 'af';
mkdirSync(out, { recursive: true });
const browser = await launch({ gpu: process.env.GPU === '1' });
const { page, problems } = await openPage(browser, 'tall', 'index.html?nosw=1&debug=1&date=2026-10-27&auto=0.8&rvauto=1', { lang });
const shot = (name) => page.screenshot({ path: `${out}/${name}.jpg`, quality: 80 });
const screen = () => page.evaluate(() => window.__stapel?.where?.screen ?? '');
await sleep(2500);
await shot('01-menu');
// the Daily tower, a frame every 2 s until the results
await page.evaluate(() => window.__stapel.bus.emit('ui:play-daily'));
const t0 = Date.now();
let n = 0;
while (Date.now() - t0 < 150000) {
  await sleep(2000);
  await shot(`10-tower-${String(++n).padStart(2, '0')}`);
  if ((await screen()) === 'results') break;
}
await sleep(2500);
await shot('20-results');
await page.evaluate(() => window.scrollTo(0, 0));
// the river from the menu
await page.evaluate(() => window.__stapel.bus.emit('ui:home'));
await sleep(1500);
await shot('21-menu-after');
await page.evaluate(() => window.__stapel.bus.emit('ui:rivier'));
for (const [i, t] of [0.6, 2.2, 4.5].entries()) { await sleep(i ? (t - [0.6, 2.2, 4.5][i - 1]) * 1000 : t * 1000); await shot(`30-river-start-${i}`); }
await sleep(4000);
await shot('31-river-run');
for (const [z, name] of [[600, '32-river-600m'], [1100, '33-river-pies'], [2100, '34-river-logs'], [3100, '35-river-trees'], [5040, '36-river-whirl'], [7400, '37-river-7k'], [9950, '38-river-ele']]) {
  await page.evaluate((zz) => window.__stapel.ride?.jumpTo(zz), z);
  await sleep(2600);
  await shot(`${name}-a`);
  await sleep(1300);
  await shot(`${name}-b`);
}
const st = await page.evaluate(() => window.__stapel.ride?.state?.());
console.log('ride', JSON.stringify(st && { phase: st.phase, dist: st.dist, hearts: st.hearts }));
// the shop
await page.evaluate(() => { window.__stapel.ride?.close?.(); window.__stapel.bus.emit('ui:home'); });
await sleep(1500);
await page.evaluate(() => window.__stapel.bus.emit('ui:shop'));
await sleep(1800);
await shot('40-shop');
console.log('problems', JSON.stringify(problems.slice(0, 12)));
await browser.close();
