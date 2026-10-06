export const meta = {
  name: 'stapel-sponsors-backend',
  description: 'Build the Paystack + Cloudflare sponsorship backend, sign-up/admin/legal pages and sponsor logic; then adversarial review and fix',
  phases: [
    { title: 'Build', detail: 'backend worker, pages, core sponsor logic (new files only)' },
    { title: 'Review', detail: 'security, payment-state correctness, pages UX/Afrikaans/legal' },
    { title: 'Fix', detail: 'verify findings and fix' },
  ],
}

const SP = '<SCRATCH>'
const BASE = `You are building the sponsorship system for "Stapel", a free Afrikaans block-stacking phone game (static site at /home/user/Toring served by GitHub Pages under /Toring/).
Read the sponsorship spec FIRST: ${SP}/SPONSORS-SPEC.md (authoritative). Skim ${SP}/SPEC.md for the game's conventions. Look at the existing site files for visual style: index.html, css/style.css, js/ui/dom.js, js/core/strings.js, js/core/format.js, js/core/rng.js, js/core/daily.js.
IMPORTANT concurrency rule: another agent is currently editing the GAME files (js/config.js, js/core/*.js except new ones, js/scenes/*, js/game/*, js/main.js, js/ui/dom.js, css/style.css, index.html, sw.js, tests/storage.test.js etc.). You must NOT edit any existing file. Only create the NEW files you own (listed below). No state-changing git commands.
Testing: node 22 (node:test; node:sqlite DatabaseSync works), npm registry reachable (you may add devDependencies ONLY inside server/package.json and install into server/node_modules, which is gitignored). Paystack/Cloudflare docs websites are blocked by the egress proxy, but the WebSearch tool works — use it to confirm Paystack API/webhook payload details and Cloudflare Worker/D1 APIs when unsure. Playwright: import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs' with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']; serve with npx --no-install http-server -p <PORT> -s -c-1 /home/user/Toring & (kill when done). Scratch files only in ${SP}/<your-name>/.
Quality: production-grade — real money and real businesses depend on this. Security first (never trust input, verify webhook signatures, constant-time token compares, no secrets in the repo, never expose contact data publicly, textContent not innerHTML for user data). Clear small modules, comments only where they explain why.`

const REPORT = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    apiNotes: { type: 'string', description: 'Exact API/contract details other parts rely on (endpoints, payloads, exports), incl. any deviation from the spec' },
    testing: { type: 'string' },
    openIssues: { type: 'string' },
  },
  required: ['files', 'apiNotes', 'testing', 'openIssues'],
}

const BUILD = [
  { key: 'backend', port: 8401, prompt: `YOUR NAME: backend. YOU OWN (new files): server/** (src/*.js, schema.sql, wrangler.toml, package.json, test/*.test.js, README.md).
Implement the Cloudflare Worker exactly per the spec: router, CORS, all public + admin endpoints, Paystack client (initialize, verify, disable, manage link) with timeouts and error mapping, webhook verification (WebCrypto HMAC-SHA512 over the raw body, constant-time compare) + idempotent event handling implementing the Entitlement rule (out-of-order/duplicate safe; renewals matched by customer+plan or subscription code), moderation/validation, rate limiting (hashed IP + email), consent records, scheduled() retention, D1 schema with indexes.
Tests (node --test server/test/): build a tiny D1-compatible adapter over node:sqlite (prepare().bind().first()/all()/run(), batch) so the REAL SQL is exercised; mock fetch for Paystack; cover: subscribe happy path + every validation error code + premium_taken + rate limit + honeypot; webhook bad signature 401, good signature flows: initial charge.success activates (paid_until = +1 month + grace), subscription.create stores codes, renewal charge without metadata extends the right sponsor, duplicate event no double extension, out-of-order (subscription.create before charge.success), not_renew -> cancelling but still live until paid_until, disable -> ended, payment_failed -> lapses; /status verify path activates idempotently; /sponsors returns only live sponsors and only public fields (assert no email anywhere in the response); admin auth (missing/wrong/right token), every admin endpoint; scheduled retention. Make \`cd server && npm test\` work without installing anything (node --test test/). Optionally, if it installs cleanly, add a miniflare/wrangler-based smoke test that runs the real worker against a local D1 (skip gracefully if not installed).
server/README.md: a clear, friendly step-by-step owner guide (accounts, plans, keys, wrangler commands, webhook URL, test mode with Paystack test cards, going live, how to add a manual sponsor, how to hide a sponsor, how to cancel, cost notes: Cloudflare free tier limits, Paystack fees — say to check current fees). Never include real secrets.` },
  { key: 'pages', port: 8402, prompt: `YOUR NAME: pages. YOU OWN (new files): adverteer.html, admin.html, terme.html, privaatheid.html, js/pages/adverteer.js, js/pages/admin.js, js/pages/common.js (shared helpers), css/pages.css, js/sponsorConfig.js.
Build these per the spec. They must look like part of the game (reuse the visual language of css/style.css — colours, logo blocks, chunky buttons, cards — by importing its CSS variables/classes where sensible via a second <link>, but put all new rules in css/pages.css). Mobile-first, accessible (labels, errors announced with aria-live, focus management), Afrikaans copy that is natural and warm (you may keep page strings inside js/pages/*.js or the HTML; do NOT edit js/core/strings.js now). Use js/core/sponsors.js's sanitizeName/isNameAllowed for instant client-side feedback (another agent is writing it right now with the API in the spec — import it; if it doesn't exist yet when you test, use a temporary import-map stub in your scratch harness).
adverteer.html: all sections from the spec incl. the live canvas preview (draw a block in the game's palette with the typed name — white bold text with dark outline, auto-fit — and a billboard preview), availability from GET /availability, POST /subscribe with error-code -> Afrikaans message mapping, redirect to Paystack, callback polling of GET /status, the 'kom binnekort' state when SPONSOR_API_URL is empty, FAQ, footer links (contact hidden while SPONSOR.contactEmail is empty). Block tier shows NO price ("Die prys word by betaling gewys"); premium shows "R1 499 per maand" from SPONSOR.premiumPriceLabel.
admin.html: per spec; token in sessionStorage only; robust error display; confirmation for destructive actions; never render user data with innerHTML.
terme.html + privaatheid.html: thorough Afrikaans templates per the spec with [[placeholders]] and the visible template banner; plain, readable structure with headings; version strings matching js/sponsorConfig.js.
TEST in headless Chromium at 412x915 (DPR 2.625) and desktop: run each page against a local mock API (write a tiny node mock server in your scratch dir implementing /availability, /subscribe, /status, /sponsors and the admin endpoints per the spec — or intercept with page.route), screenshot every state (coming-soon, form, validation errors, premium taken, submitting, callback success/pending/failed, admin login, admin table, edit dialog, legal pages), view them and iterate until polished. Zero console errors.` },
  { key: 'core', port: 8403, prompt: `YOUR NAME: core-sponsors. YOU OWN (new files): js/core/sponsors.js, js/sponsorsFeed.js, sponsors.json, tests/sponsors.test.js.
Implement per the spec. js/core/sponsors.js is pure and node-testable (import createRng from './rng.js' and dayNumber from './daily.js' — read them for the exact APIs). sanitizeName/isNameAllowed must mirror the server moderation rules in the spec (Afrikaans diacritics allowed, 2–22 chars, allowed punctuation, no URLs/emails/phones, a modest EN+AF profanity list with leetspeak normalisation, reserved words) — coordinate by following the spec exactly; the server agent implements the same rules independently, and a later reviewer will diff them. createBlockNamer must be deterministic per seed and independent of call order, only for name-capable shapes (see spec; shapes and their base sizes are in js/game/blocks.js SHAPES — read it), and cycle all sponsors fairly (each sponsor gets within ±1 of the same number of named blocks over any prefix of the sequence). pickPremium deterministic daily rotation. normalizeFeed merges static + API per spec (respect 'until', drop invalid entries, sanitise). js/sponsorsFeed.js: browser loader with timeout, localStorage cache ('stapel.sponsors.v1'), never throws, background refresh; must not import Phaser.
sponsors.json: exactly the house-ad content in the spec (sportscard.co.za), empty block/premium lists.
tests/sponsors.test.js: thorough node tests (determinism, fairness, call-order independence, shape filtering, sanitisation edge cases incl. diacritics/emoji/zero-width chars/RTL override chars/very long input, profanity + leetspeak, reserved words, pickPremium rotation over 30 days, normalizeFeed with/without API, expired 'until', malformed input never throws). Run \`node --test tests/sponsors.test.js\` until green (do not touch other tests).` },
]

phase('Build')
const built = await parallel(BUILD.map(b => () =>
  agent(`${BASE}\n\nYOUR PORT: ${b.port}.\n${b.prompt}\nReturn the report.`, { label: `build:${b.key}`, phase: 'Build', schema: REPORT })
    .then(r => r ? { key: b.key, ...r } : { key: b.key, failed: true })
))
log('Build done: ' + built.map(b => b.key + (b.failed ? ' (FAILED)' : '')).join(', '))

const FIND = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      file: { type: 'string' }, title: { type: 'string' }, evidence: { type: 'string' }, proposedFix: { type: 'string' },
    }, required: ['id', 'severity', 'file', 'title', 'evidence', 'proposedFix'] } },
    summary: { type: 'string' },
  },
  required: ['findings', 'summary'],
}
const REVIEWS = [
  { key: 'security', port: 8411, prompt: `LENS: adversarial security review of server/** and the pages (you are a penetration tester paid per real bug). Try to: forge or replay webhooks, bypass signature checks (encoding/JSON re-serialisation/empty body/missing header/timing), activate a sponsor without paying (status endpoint abuse, reference swapping between sponsors, using another sponsor's reference, test-mode keys), extend paid_until repeatedly, get a name live that moderation should block (unicode tricks: homoglyphs, zero-width, combining marks, RTL overrides, fullwidth, leetspeak), exhaust/abuse rate limits, read contact data (public endpoints, CORS misconfig, error messages leaking data), brute-force or timing-attack the admin token, SQL injection, XSS via sponsor names in admin.html/adverteer.html/game DOM, open redirects (callback_url, url field), SSRF, oversized bodies, CORS preflight edge cases, secrets in repo. WRITE EXPLOIT TESTS (node, using the server's own test adapter) to prove each finding.` },
  { key: 'payments', port: 8412, prompt: `LENS: payment & subscription state-machine correctness (you are a billing engineer who has been burned by webhooks before). Use WebSearch to confirm Paystack's real webhook payload shapes for charge.success (first charge vs renewal — what fields identify plan/subscription/customer/metadata?), subscription.create, invoice.create/update, invoice.payment_failed, subscription.not_renew, subscription.disable, and transaction/initialize + verify responses with a plan. Then audit the implementation against reality: are renewals matched correctly when one email owns several sponsorships (two block names, or block + premium)? What if the sponsor pays, the webhook never arrives, and the user closes the tab before /status? What about refunds/chargebacks (refund.processed, charge.dispute.*)? Currency/amount checks (reject a charge with the wrong amount/plan/currency)? Premium exclusivity races (two buyers at once; one pays after the other already took the slot — what happens to their money?), pending sponsors that pay after being marked abandoned, clock/month arithmetic (31 Jan + 1 month), grace period, cancellation semantics vs what terme.html promises, manual sponsors interplay. Simulate tricky sequences with the test adapter and report concrete failures with fixes.` },
  { key: 'ux', port: 8413, prompt: `LENS: sponsor-facing UX, Afrikaans quality and legal-template completeness (you are a first-language Afrikaans UX writer who has also shipped SA e-commerce). Run adverteer.html, admin.html, terme.html, privaatheid.html in headless Chromium at 412x915 and 360x640 and desktop against a mock API (write one, or reuse any mock in ${SP}/pages/), screenshot and VIEW every state. Judge clarity of the offer, trust signals, form friction, error messages, success/pending flows, accessibility, visual consistency with the game, and the natural quality of all Afrikaans. Check the legal templates cover: ECT Act s43 disclosures, CPA-compatible cancellation & cooling-off considerations for electronic transactions (s44 ECT 7-day cooling-off for services may apply — how is that handled?), POPIA (s18 notification contents, operators, cross-border s72, retention, rights, Information Officer, Regulator contact), ad-content rules (minors, alcohol, gambling), and that every promise in the pages matches what the backend actually does (cancel timing, refunds, approval time, what is shown where). Also diff js/core/sponsors.js moderation rules against server/src/moderation.js and report any mismatch.` },
]

phase('Review')
const reviews = await parallel(REVIEWS.map(r => () =>
  agent(`${BASE}\n\nThe sponsorship system has just been built. Build reports:\n${JSON.stringify(built, null, 1)}\n\nYOUR NAME: review-${r.key}. YOUR PORT: ${r.port}. Do NOT modify repo files in this phase (scratch dir only).\n${r.prompt}\nReturn findings most-severe first, evidence-based.`, { label: `review:${r.key}`, phase: 'Review', schema: FIND })
    .then(x => x ? { lens: r.key, ...x } : { lens: r.key, findings: [], summary: 'failed' })
))
const all = reviews.flatMap(r => (r.findings || []).map(f => ({ lens: r.lens, ...f })))
const order = { critical: 0, high: 1, medium: 2, low: 3 }
all.sort((a, b) => order[a.severity] - order[b.severity])
log(`Sponsor review: ${all.length} findings (` + ['critical','high','medium','low'].map(s => `${s} ${all.filter(f => f.severity === s).length}`).join(', ') + ')')

phase('Fix')
const fix = await agent(`${BASE.replace('You must NOT edit any existing file. Only create the NEW files you own (listed below).', 'You may edit ONLY the sponsorship files: server/**, adverteer.html, admin.html, terme.html, privaatheid.html, js/pages/**, css/pages.css, js/sponsorConfig.js, js/core/sponsors.js, js/sponsorsFeed.js, sponsors.json, tests/sponsors.test.js. Do not touch any other existing file.')}

YOUR NAME: sponsor-fixer. YOUR PORT: 8420.
Build reports:\n${JSON.stringify(built, null, 1)}\n
Review findings (most severe first):\n${JSON.stringify(all, null, 1)}\n
For EACH finding: verify (reproduce with a test or prove from code) -> fix, or refute with reasoning. All critical/high must be fixed unless refuted. Add regression tests for every security and payment-state fix (exploit tests should now fail to exploit). Keep client and server moderation rules identical (consider generating both from one shared rules module if feasible without a bundler: e.g. server imports the same rule data). Then: run \`cd server && npm test\` and \`node --test tests/sponsors.test.js\` (all green), re-run the pages in headless Chromium against a mock API (zero console errors) and view screenshots of anything you changed (save to ${SP}/sponsor-fixer/).
Return: per-finding status (fixed/refuted/deferred + one line), files changed, test results, and remaining risks the owner must know (things only they can do: accounts, keys, legal review, Information Officer registration, etc.).`, { label: 'fix', phase: 'Fix' })

return { built, reviews, fix }
