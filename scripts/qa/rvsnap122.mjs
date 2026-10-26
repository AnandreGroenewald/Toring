// (1.22) River stills on the dev page at phone size: node rvsnap122.mjs <outdir> <z,z,...> [extra url, e.g. &q=mid&look=dag]
// One still per course distance z (jumpTo, then ~2.4 s to settle). Server :8317.   (GPU=1)
import { launch, sleep } from './lib.mjs';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || '/tmp/stapel-shots/rvsnap122';
const zs = String(process.argv[3] || '300').split(',').map(Number);
const extra = process.argv[4] || '&q=mid';
mkdirSync(out, { recursive: true });
const b = await launch({ gpu: process.env.GPU === '1' });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto(`http://127.0.0.1:8317/proto/rivier.html?auto=1&floors=24&who=8&seed=2026-11-03&pilot=20000${extra}`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__rv?.state().phase === 'run', null, { timeout: 60000 });
for (const z of zs) {
  await p.evaluate((zz) => window.__rv.jumpTo(zz), z);
  await sleep(2400);
  await p.screenshot({ path: `${out}/z${String(z).padStart(5, '0')}.jpg`, quality: 85 });
}
await b.close();
