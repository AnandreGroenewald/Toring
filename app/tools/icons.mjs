// Makes the Android launcher icons, the launch-screen logo and the Play Store icon from the game's
// icons/icon.svg, drawn by headless Chrome (playwright-core + Google Chrome; nothing else to install).
// usage: node tools/icons.mjs     (from app/)
//
// The artwork is split in two for Android's adaptive icon: the sky, clouds and sea are the
// background layer (filled out to the edges), the base, tower, rope and falling block the
// foreground. The artwork is drawn 64 dp wide in the 108 dp layers, so the tower stays inside the
// 66 dp circle that every launcher shape shows.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const res = join(app, 'android/app/src/main/res');
const store = join(app, 'store');
const svg = readFileSync(join(app, '../icons/icon.svg'), 'utf8');

const cut = (from, to, start = 0) => {
  const a = svg.indexOf(from, start);
  const b = svg.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`icon.svg changed: can't find ${from}`);
  return svg.slice(a, b + to.length);
};
const defs = cut('<defs>', '</defs>');
const sky = defs.replace('<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">',
  '<linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512">');
const cloudsAt = svg.indexOf('<g fill="#fff" opacity=".6">');
const seaAt = svg.indexOf('<g transform="translate(0 0.0)">');
const clouds = svg.slice(cloudsAt, seaAt);
const sea = cut('<g transform="translate(0 0.0)">', '</g>');
const tower = svg.slice(svg.indexOf('<!-- base platform -->'), svg.indexOf('</g></g></g>') + '</g></g>'.length)
  // the rope comes down from the crane above the icon
  .replace('<rect x="236" y="-10" width="8" height="34" rx="4" fill="#2b2b2b"/>', '<rect x="236" y="-600" width="8" height="624" rx="4" fill="#2b2b2b"/>');
if (!clouds || !tower.includes('crane rope')) throw new Error('icon.svg changed: update tools/icons.mjs');

const BIG = '<rect x="-2000" y="-2000" width="4512" height="4512" fill="url(#sky)"/>';
const DEEP = '<rect x="-2000" y="455" width="4512" height="3000" fill="#2f86d8"/>';
const backdrop = `${BIG}${clouds}${DEEP}${sea}`;
const svgDoc = (viewBox, body, extraDefs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${sky.replace('</defs>', `${extraDefs}</defs>`)}${body}</svg>`;

// 108 dp layer = 864 units (8 per dp, the 512 artwork is 64 dp), centred on the artwork
const LAYER = '-176 -176 864 864';
// what a launcher shows: the middle 72 dp
const VIEW = '-32 -32 576 576';
const ROUND = '<clipPath id="circle"><circle cx="256" cy="256" r="288"/></clipPath>';

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const jobs = [];
for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = join(res, `mipmap-${d}`);
  jobs.push({ file: join(dir, 'ic_launcher_background.png'), size: 108 * k, svg: svgDoc(LAYER, backdrop) });
  jobs.push({ file: join(dir, 'ic_launcher_foreground.png'), size: 108 * k, svg: svgDoc(LAYER, tower) });
  // before Android 8: the game's own rounded icon, and a round one
  jobs.push({ file: join(dir, 'ic_launcher.png'), size: 48 * k, svg });
  jobs.push({ file: join(dir, 'ic_launcher_round.png'), size: 48 * k, svg: svgDoc(VIEW, `<g clip-path="url(#circle)">${backdrop}${tower}</g>`, ROUND) });
}
// launch screen: the tower alone, on the sky colour of the theme
jobs.push({ file: join(res, 'drawable-nodpi/splash_logo.png'), size: 432, svg: svgDoc(LAYER, tower) });
// Play Store: 512 × 512, square (Google rounds the corners itself)
jobs.push({ file: join(store, 'play-icon-512.png'), size: 512, svg: svgDoc('0 0 512 512', backdrop + tower) });

// one fixed window, and a screenshot of the drawing itself (resizing the window between shots can
// capture a frame that is still the old size)
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1100, height: 1100 } });
for (const j of jobs) {
  const px = Math.round(j.size);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${j.svg.replace('<svg ', `<svg width="${px}" height="${px}" style="display:block" `)}</body></html>`);
  mkdirSync(dirname(j.file), { recursive: true });
  await page.locator('svg').first().screenshot({ path: j.file, omitBackground: true });
}
await browser.close();
console.log(`${jobs.length} icons written`);
