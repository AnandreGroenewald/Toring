// (1.22) The river's first seconds frame by frame (the dive off the tower into the run), real game, phone size.
// usage: node dive122.mjs <outdir> [secs=7] [step ms=250] [extra url]   (GPU=1)
import { launch, openPage, sleep } from './lib.mjs';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || '/tmp/stapel-shots/dive122';
const secs = Number(process.argv[3]) || 7;
const step = Number(process.argv[4]) || 250;
const extra = process.argv[5] || '';
mkdirSync(out, { recursive: true });
const browser = await launch({ gpu: process.env.GPU === '1' });
const { page } = await openPage(browser, 'tall', `index.html?nosw=1&debug=1&date=2026-10-27&rvauto=1${extra}`);
await sleep(2000);
await page.evaluate(() => window.__stapel.bus.emit('ui:rivier'));
await page.waitForFunction(() => !!window.__stapel.ride, null, { timeout: 60000 });
const t0 = Date.now();
let i = 0;
while (Date.now() - t0 < secs * 1000) {
  const s = await page.evaluate(() => window.__stapel.ride?.state?.());
  await page.screenshot({ path: `${out}/d${String(i++).padStart(3, '0')}.jpg`, quality: 75 });
  console.log(i, ((Date.now() - t0) / 1000).toFixed(2), s?.phase, s?.dist);
  await sleep(step);
}
await browser.close();
