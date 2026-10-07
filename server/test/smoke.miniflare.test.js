// End-to-end smoke test in the real Workers runtime (workerd via Miniflare) with a local D1.
// Runs only when dev dependencies are installed (`npm install` in server/); otherwise skipped,
// so `npm test` works on a fresh checkout without installing anything.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fakePaystack, baseEnv, signupBody, chargeSuccess, SECRET, ADMIN, ORIGIN } from './support/harness.js';

let Miniflare = null;
let toOptions = (o) => o;
try {
  const mod = await import('miniflare');
  Miniflare = mod.Miniflare;
  // Miniflare 5 takes a new options shape and ships a converter for the classic (v3/v4) one.
  if (typeof mod.convertV4MiniflareOptions === 'function') toOptions = mod.convertV4MiniflareOptions;
} catch {
  Miniflare = null;
}

const root = fileURLToPath(new URL('..', import.meta.url));

test('smoke: real worker in workerd + local D1', { skip: Miniflare ? false : 'miniflare not installed (run npm install in server/)', timeout: 60_000 }, async (t) => {
  const paystack = fakePaystack();
  const { DB: _unused, ...vars } = baseEnv(null);
  let mf;
  try {
    // List the modules explicitly (entry first); not every Miniflare version follows imports itself.
    // The moderation rules are shared with the site (js/core/nameRules.js), so the module root is the
    // repository root and that file is listed too (wrangler's bundler follows the import by itself).
    const files = readdirSync(`${root}src`).filter((f) => f.endsWith('.js')).sort((a, b) => (a === 'worker.js' ? -1 : b === 'worker.js' ? 1 : 0));
    const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
    mf = new Miniflare(toOptions({
      // (the live matches share the game's referee: js/core/duel.js with rng.js and config.js)
      modules: [...files.map((f) => `${root}src/${f}`), ...['js/core/nameRules.js', 'js/core/duel.js', 'js/core/rng.js', 'js/config.js'].map((f) => `${repoRoot}${f}`)]
        .map((path) => ({ type: 'ESModule', path })),
      modulesRoot: repoRoot,
      compatibilityDate: '2026-09-01',
      d1Databases: { DB: 'stapel-smoke' },
      bindings: vars,
      // Every outbound fetch (i.e. Paystack) goes to the in-process fake.
      outboundService: async (req) => {
        const body = req.method === 'GET' ? undefined : await req.text();
        return paystack.fetch(req.url, {
          method: req.method,
          headers: { Authorization: req.headers.get('Authorization') },
          body: body || undefined,
          signal: new AbortController().signal,
        });
      },
    }));
    await mf.ready;
  } catch (err) {
    await mf?.dispose().catch(() => {});
    t.skip(`workerd could not start here: ${err.message.split('\n')[0]}`);
    return;
  }

  try {
    const db = await mf.getD1Database('DB');
    const schema = readFileSync(`${root}schema.sql`, 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
      .split(';').map((s) => s.trim()).filter(Boolean);
    for (const stmt of schema) await db.prepare(stmt).run();

    const call = (path, init = {}) => mf.dispatchFetch(`https://api.test${path}`, init);

    let res = await call('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '198.51.100.20' },
      body: JSON.stringify(signupBody()),
    });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    const { sponsorId, reference, url } = await res.json();
    assert.match(url, /^https:\/\/checkout\.paystack\.com\//);

    const raw = JSON.stringify(chargeSuccess({ reference, paidAt: Date.now() - 1000, metadata: { sponsorId } }));
    res = await call('/paystack/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': 'ab'.repeat(64) },
      body: raw,
    });
    assert.equal(res.status, 401);
    res = await call('/paystack/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': createHmac('sha512', SECRET).update(raw).digest('hex') },
      body: raw,
    });
    assert.equal(res.status, 200, await res.clone().text());

    res = await call('/sponsors', { headers: { Origin: 'https://elders.example' } });
    const feedText = await res.text();
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.deepEqual(JSON.parse(feedText).block, [{ id: sponsorId, name: 'Bakkery Lekker' }]);
    assert.ok(!feedText.includes('@'));

    res = await call(`/status?sponsor=${sponsorId}&reference=${reference}`, { headers: { Origin: ORIGIN } });
    assert.equal((await res.json()).status, 'active');

    res = await call('/admin/sponsors', { headers: { Authorization: `Bearer ${ADMIN}`, Origin: ORIGIN } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).sponsors[0].email, 'anna@example.co.za');
    res = await call('/admin/sponsors', { headers: { Authorization: 'Bearer nope', Origin: ORIGIN } });
    assert.equal(res.status, 401);

    const worker = await mf.getWorker();
    await worker.scheduled({ cron: '17 3 * * *' });
  } finally {
    await mf.dispose();
  }
});
