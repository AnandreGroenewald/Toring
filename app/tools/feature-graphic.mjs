// Google Play feature graphic (1024 × 500): the game's block-letter logo and tagline on its sky,
// with the tower from the app icon. Drawn by headless Chrome from the game's own CSS.
// usage: node tools/feature-graphic.mjs     (from app/; writes store/feature-graphic.png)
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '../..');
const css = readFileSync(join(site, 'css/style.css'), 'utf8');
const icon = readFileSync(join(site, 'icons/icon.svg'), 'utf8');
const defs = icon.slice(icon.indexOf('<defs>'), icon.indexOf('</defs>') + 7);
const tower = icon.slice(icon.indexOf('<!-- base platform -->'), icon.indexOf('</g></g></g>') + '</g></g>'.length)
  .replace('<rect x="236" y="-10" width="8" height="34" rx="4" fill="#2b2b2b"/>', '<rect x="236" y="-400" width="8" height="424" rx="4" fill="#2b2b2b"/>');

const html = `<!doctype html><html lang="af"><head><meta charset="utf-8"><style>${css}
  html, body { position: static; width: 1024px; height: 500px; overflow: hidden; margin: 0; }
  * { animation: none !important; }
  .fg { position: relative; width: 1024px; height: 500px; overflow: hidden;
        background: linear-gradient(180deg, #4fb7f2 0%, #8fd3f4 62%, #c8ecfb 100%); font-family: var(--font); }
  .cloud { position: absolute; background: #fff; border-radius: 999px; opacity: .55; }
  .sea { position: absolute; left: 0; bottom: 0; width: 1024px; height: 120px; }
  .tower { position: absolute; right: 36px; bottom: 34px; width: 430px; height: 430px; }
  .words { position: absolute; left: 44px; top: 96px; width: 560px; display: flex; flex-direction: column; align-items: center; }
  .words .logo { --u: 0.86px; padding-top: 0; }
  .tag { margin-top: 30px; color: #fff; font-weight: 900; font-size: 46px; letter-spacing: .5px;
         text-shadow: 0 4px 0 #1d5fa8, 2px 0 0 #1d5fa8, -2px 0 0 #1d5fa8, 0 -2px 0 #1d5fa8; }
  .sub { margin-top: 14px; padding: 8px 22px; border-radius: 999px; background: rgba(12, 32, 66, .55);
         color: #fff; font-weight: 800; font-size: 25px; }
</style></head><body><div class="fg">
  <div class="cloud" style="left:60px;top:40px;width:120px;height:34px"></div>
  <div class="cloud" style="left:110px;top:22px;width:70px;height:46px"></div>
  <div class="cloud" style="left:520px;top:70px;width:150px;height:38px"></div>
  <div class="cloud" style="left:575px;top:46px;width:80px;height:52px"></div>
  <svg class="sea" viewBox="0 0 1024 120" preserveAspectRatio="none">
    <path d="M0 34 C 60 20, 110 48, 170 34 S 280 20, 340 34 S 450 48, 510 34 S 620 20, 680 34 S 790 48, 850 34 S 960 20, 1024 34 V 120 H 0 Z" fill="#2f86d8"/>
    <path d="M0 34 C 60 20, 110 48, 170 34 S 280 20, 340 34 S 450 48, 510 34 S 620 20, 680 34 S 790 48, 850 34 S 960 20, 1024 34" fill="none" stroke="#c8ecfb" stroke-width="6" stroke-linecap="round" opacity=".9"/>
  </svg>
  <svg class="tower" viewBox="40 0 432 512">${defs}${tower}</svg>
  <div class="words">
    <h1 class="logo" aria-label="Stapel">${[...'STAPEL'].map((c, i) => `<span class="lb${i === 5 ? ' hang' : ''}"><span>${c}</span></span>`).join('')}</h1>
    <div class="tag">Stapel hoog. Staan sterk.</div>
    <div class="sub">Gratis Afrikaanse toringspel</div>
  </div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
mkdirSync(join(here, '../store'), { recursive: true });
await page.locator('.fg').screenshot({ path: join(here, '../store/feature-graphic.png') });
await browser.close();
console.log('store/feature-graphic.png written');
