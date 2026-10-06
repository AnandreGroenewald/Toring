# Stapel sponsorships ("Borge"): owner's guide

This folder holds the small server that sells monthly sponsorships for Stapel. It takes the money, keeps track of who has paid, and gives the game a list of names to show.

| Package | Afrikaans name | What the sponsor gets | Price |
| --- | --- | --- | --- |
| `block` | **Jou naam op die blokke** | Their business name printed on blocks in the tower (daily and practice games). Up to `BLOCK_MAX` sponsors share the blocks. | Your choice. Set it in the Paystack plan. The game and the sign-up page never show this price; only Paystack's checkout does. |
| `premium` | **Die groot advertensiebord** | The large billboard on the island next to the tower, with their name and a short tagline. Players see it at the start of every game and in the zoom-out screenshot at the end. Only one at a time (`PREMIUM_MAX = 1`). | **R1 499 per month** |

Everything runs on free tiers. The server is a **Cloudflare Worker** with a **D1** database. Payments and monthly billing are done by **Paystack**.

```
 player's phone ──GET /sponsors──▶  Cloudflare Worker  ◀──webhook── Paystack
 adverteer.html ──POST /subscribe─▶   (this folder)    ──API────▶  (cards, billing)
 admin.html     ──/admin/* + token▶        │
                                       D1 database
```

You need about an hour. Do everything in **test mode** first; nothing real is charged there.

---

## Contents

1. [What you need](#1-what-you-need)
2. [Paystack: account, plans and keys](#2-paystack-account-plans-and-keys)
3. [Cloudflare: database and Worker](#3-cloudflare-database-and-worker)
4. [Connect Paystack to the Worker (webhook)](#4-connect-paystack-to-the-worker-webhook)
5. [Switch the game on](#5-switch-the-game-on)
6. [Test everything with Paystack test cards](#6-test-everything-with-paystack-test-cards)
7. [Go live](#7-go-live)
8. [Everyday tasks](#8-everyday-tasks): add, hide, edit, cancel, refund, the card link
9. [How billing works](#9-how-billing-works)
10. [Costs](#10-costs)
11. [Security and privacy](#11-security-and-privacy)
12. [Troubleshooting](#12-troubleshooting)
13. [API reference](#13-api-reference)
14. [Developing and tests](#14-developing-and-tests)

---

## 1. What you need

- A **Paystack** account for your business: <https://paystack.com/za>.
- A **Cloudflare** account. The free plan is enough: <https://dash.cloudflare.com/sign-up>.
- **Node.js 22.13 or newer** on your computer (<https://nodejs.org>). This gives you `npx`, which runs Cloudflare's `wrangler` tool.
- A terminal open in this `server/` folder. On Windows, PowerShell works.
- The legal pages filled in: `terme.html` (sponsorship terms) and `privaatheid.html` (privacy policy, POPIA). They are templates. Replace every `[[...]]` placeholder, have them checked, then delete the yellow "Sjabloon" banner.

> **Already use Paystack for another business (for example sportscard.co.za)?** Paystack allows only **one webhook URL per account** (one for test mode and one for live mode). If your other shop already uses it, add Stapel as a separate business under your Paystack login (the business menu has an *Add a business* option) so it gets its own keys and its own webhook URL. Payments for other products that reach this Worker are acknowledged and ignored, and are never stored.

## 2. Paystack: account, plans and keys

### 2.1 Account and business verification

1. Sign up at <https://paystack.com/za> and choose **South Africa**.
2. Complete **business verification** (*Settings → Business*): business details, ID and bank account for payouts. You can test before you're verified, but you can't accept live payments until Paystack approves you.

### 2.2 Create the two monthly plans (test mode first)

The **Test mode** switch is at the top of the Paystack Dashboard. Leave it **on** for now.

1. Open **Plans** in the Dashboard menu. It's under the subscriptions or recurring section; Paystack moves menu items around now and then. Click **New Plan** (or **Create plan**).
2. **Block plan:**
   - Name: `Stapel – Jou naam op die blokke`
   - Amount: your price, e.g. `R49`. This is never shown in the game.
   - Interval: **Monthly**
   - Leave the invoice limit empty, so it runs until it's cancelled.
3. **Premium plan:**
   - Name: `Stapel – Die groot advertensiebord`
   - Amount: **`R1 499`**
   - Interval: **Monthly**
4. Open each plan and copy its **plan code**, which looks like `PLN_xxxxxxxxxxxx`.

You can also create a plan from the terminal. Use your **test** secret key:

```sh
curl https://api.paystack.co/plan \
  -H "Authorization: Bearer sk_test_YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Stapel – Die groot advertensiebord","interval":"monthly","amount":149900,"currency":"ZAR"}'
```

Amounts are in **cents**: R1 499 = `149900`.

> If you ever change the premium price in Paystack, change `PREMIUM_PRICE_CENTS` in `wrangler.toml` **and** `premiumPriceLabel` in `js/sponsorConfig.js` to match. The server refuses premium payments that are below `PREMIUM_PRICE_CENTS`.

### 2.3 Copy your secret key

Go to *Settings → API Keys & Webhooks* and copy the **Test Secret Key** (`sk_test_...`).

- Never put a secret key in any file in this repository, in a screenshot or in a chat.
- The **public** key (`pk_...`) isn't needed anywhere.

## 3. Cloudflare: database and Worker

Run these in a terminal in the `server/` folder.

```sh
npm install                 # installs wrangler (Cloudflare's tool) for this folder only
npx wrangler login          # opens the browser; allow access
```

### 3.1 Create the database

```sh
npx wrangler d1 create stapel-borge
```

It prints a block with `database_id = "…"`. Paste that id into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`. The id isn't secret.

Then create the tables:

```sh
npx wrangler d1 execute stapel-borge --remote --file=./schema.sql
```

It's safe to run this again later; it only creates what is missing.

### 3.2 Settings (`wrangler.toml` → `[vars]`)

Open `wrangler.toml` and fill in:

| Setting | What to put |
| --- | --- |
| `PLAN_BLOCK` | Block plan code (`PLN_...`) from step 2.2 |
| `PLAN_PREMIUM` | Premium plan code |
| `PREMIUM_PRICE_CENTS` | `149900` (R1 499) |
| `BLOCK_PRICE_CENTS` | Leave empty: the price is read from the Paystack plan. |
| `SITE_URL` | Your game's address with a slash at the end, e.g. `https://anandregroenewald.github.io/Toring/` |
| `ALLOWED_ORIGINS` | Web addresses allowed to use the sign-up and admin API: your site's **origin** (no path), e.g. `https://anandregroenewald.github.io`. `http://localhost:*` is for testing on your computer. |
| `PREMIUM_MAX` / `BLOCK_MAX` | How many sponsors at once: `1` billboard and `60` block names |
| `AUTO_APPROVE` | `true`: clean names go live straight after payment. `false`: you approve each one first on the admin page. |
| `GRACE_DAYS` | `3`: extra days a sponsor stays visible after the paid month, so a renewal that's a day late doesn't make them disappear. |
| `PAYSTACK_IP_ALLOWLIST` | `false` by default. `true` also checks that webhooks come from Paystack's published IP addresses. The signature check is the main protection either way. |

### 3.3 Secrets (never in files)

```sh
npx wrangler secret put PAYSTACK_SECRET_KEY     # paste sk_test_... (later sk_live_...)
npx wrangler secret put ADMIN_TOKEN             # paste a long random password, see below
```

Create the admin token with either of these, and keep it in your password manager:

```sh
openssl rand -hex 32
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

It must be at least 32 characters. If it's shorter or missing, the admin API stays switched off.

Optional: `npx wrangler secret put IP_HASH_SALT` (any long random string) to key the IP fingerprints used for rate limiting. If you don't set it, the admin token is used.

### 3.4 Deploy

```sh
npx wrangler deploy
```

It prints your Worker's address, e.g. `https://stapel-borge.<your-subdomain>.workers.dev`. Check that it works: opening `https://stapel-borge.<your-subdomain>.workers.dev/sponsors` in a browser shows `{"updatedAt":"…","block":[],"premium":[]}`.

Run `npx wrangler deploy` again after every change to `wrangler.toml` or `src/`.

## 4. Connect Paystack to the Worker (webhook)

Paystack tells the Worker about every payment, renewal and cancellation by calling a **webhook** URL.

1. Go to Paystack *Settings → API Keys & Webhooks*.
2. Set **Test Webhook URL** to:

   ```
   https://stapel-borge.<your-subdomain>.workers.dev/paystack/webhook
   ```

3. Save.

Paystack signs every webhook with your secret key, and the Worker rejects anything without a valid signature. That's why the **same mode's** secret key must be in `PAYSTACK_SECRET_KEY`: test key with the test webhook, live key with the live webhook.

## 5. Switch the game on

In the repository root, open `js/sponsorConfig.js` and set:

```js
export const SPONSOR_API_URL = 'https://stapel-borge.<your-subdomain>.workers.dev';
```

Also fill in `contactEmail` when you have a public address. Commit and push. GitHub Pages updates in a minute or two.

While `SPONSOR_API_URL` is empty, the game shows only the house ad and any manual entries in `sponsors.json`, and `adverteer.html` shows a "kom binnekort" (coming soon) page.

## 6. Test everything with Paystack test cards

With test keys, nothing is really charged.

1. Open `https://<your-site>/adverteer.html`, choose a package, type a business name and your details, tick the two boxes, and pay.
2. Use a Paystack **test card**. At the time of writing, a successful card is **4084 0840 8408 4081**, CVV **408**, any future expiry date. If asked, the PIN is **0000** and the OTP is **123456**. Paystack's "Test Payments" docs page has the current list, including cards that fail on purpose.
3. You return to `adverteer.html`. It shows **"Dankie! Jou naam verskyn binne 5 minute in die spel."**
4. Check:
   - `…workers.dev/sponsors` lists the name.
   - The game shows it on the blocks (or on the billboard for premium). The game caches the list for up to 5 minutes.
   - `admin.html` shows the sponsor as live, the payment, and the webhook events.
   - In the Paystack Dashboard (test mode) there's a **customer**, a **transaction** and a **subscription**.
5. Try cancelling: on `admin.html` use the sponsor's cancel action. The subscription then shows as cancelled (not renewing) in Paystack. The sponsor stays visible until the paid month (plus grace days) is over.
6. Try a failing card, and a name the filter rejects (e.g. `test`). No sponsor should be created.

To clear test data before going live:

```sh
npx wrangler d1 execute stapel-borge --remote --command "DELETE FROM payments; DELETE FROM webhook_events; DELETE FROM consents; DELETE FROM sponsors;"
```

## 7. Go live

1. Make sure Paystack has **approved your business** (step 2.1) and that `terme.html` and `privaatheid.html` are complete.
2. Turn **Test mode off** in the Paystack Dashboard.
3. **Create the two plans again in live mode.** Test and live plans are separate and have different codes. Put the live codes in `PLAN_BLOCK` and `PLAN_PREMIUM` in `wrangler.toml`.
4. Set the live key: `npx wrangler secret put PAYSTACK_SECRET_KEY` and paste `sk_live_...`.
5. Set the **Live Webhook URL** in Paystack to the same `…/paystack/webhook` address.
6. `npx wrangler deploy`.
7. Clear the test data (command above), then buy one block sponsorship yourself with a real card, check it appears, and cancel or refund it.

## 8. Everyday tasks

Use **`admin.html`** on your site (it's not linked anywhere, and search engines are told to ignore it). Paste your `ADMIN_TOKEN` when asked. It's kept only for that browser tab. Everything below can be done there. The terminal commands are there for when you prefer them.

For the terminal, set two variables first (macOS/Linux; in PowerShell use `$env:API="…"`):

```sh
API=https://stapel-borge.<your-subdomain>.workers.dev
TOKEN=your-admin-token
```

**List all sponsors** (with contact details, Paystack codes and whether they're live):

```sh
curl -H "Authorization: Bearer $TOKEN" $API/admin/sponsors
```

**Add a sponsor by hand.** Use this for a deal paid by EFT or invoice. It's live until the date you give, which means the end of that day in South African time:

```sh
curl -X POST $API/admin/sponsors -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"tier":"block","name":"Oom Piet se Padstal","email":"piet@example.co.za","paid_until":"2026-12-31","notes":"EFT 2026-10-06, faktuur 12"}'
```

For a premium manual sponsor, add `"tagline":"…"` and `"url":"https://…"`. Owners may use words the public filter reserves (e.g. your own brand), but names still have to be 2–22 letters, digits and `& . - ' ’ !`. A manual billboard sponsor also books the billboard, so nobody can buy it on the sign-up page while yours runs. Adding by hand doesn't check the limit, though: if you add a second billboard sponsor, the game rotates between them day by day.

**Hide a sponsor now** (e.g. a complaint), and show them again:

```sh
curl -X PATCH $API/admin/sponsors/SPONSOR_ID -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"hidden":true}'
curl -X PATCH $API/admin/sponsors/SPONSOR_ID -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"hidden":false}'
```

Hiding doesn't stop billing. If they shouldn't pay any more, cancel as well.

**Approve** (when `AUTO_APPROVE` is `false`): `{"approved":true}`. **Fix a typo:** `{"name":"Nuwe Naam"}`. **Give extra days:** `{"paid_until":"2027-01-31"}`. This date acts as a minimum: you can extend a sponsorship this way but not shorten what someone paid for. To take someone off, hide or cancel them.

**Cancel a subscription.** This stops future charges at Paystack. The sponsor stays visible until the end of the month they paid for, as the terms promise:

```sh
curl -X POST $API/admin/sponsors/SPONSOR_ID/cancel -H "Authorization: Bearer $TOKEN"
```

To end it **immediately**, for example for a breach of the terms, send `-H "Content-Type: application/json" -d '{"immediate":true}'`. If you remove a sponsor for a reason that isn't their fault, refund the unused part of the month in the Paystack Dashboard (*Transactions → the payment → Refund*), as the terms promise.

**Let a sponsor update their card or cancel themselves.** This creates a Paystack link you can e-mail them:

```sh
curl -X POST $API/admin/sponsors/SPONSOR_ID/manage-link -H "Authorization: Bearer $TOKEN"
```

Depending on your plan settings, Paystack's subscription e-mails also give sponsors a link to manage or cancel. When a sponsor cancels there, the Worker hears about it and the sponsor runs until the end of their paid month.

**Delete a sponsor** (e.g. a privacy request). Cancel first; the Worker refuses to delete someone who is still being billed unless you add `?force=1`. Payment records are kept for your accounting.

```sh
curl -X DELETE $API/admin/sponsors/SPONSOR_ID -H "Authorization: Bearer $TOKEN"
```

**Payments and webhook log:**

```sh
curl -H "Authorization: Bearer $TOKEN" $API/admin/payments
curl -H "Authorization: Bearer $TOKEN" "$API/admin/events?limit=50"
```

**Live server logs:** `npx wrangler tail`. Logs never contain e-mail addresses or card details.

**Backups:** `npx wrangler d1 export stapel-borge --remote --output=borge-backup.sql`. The file contains sponsors' contact details, so store it safely.

## 9. How billing works

- **Sign-up.** The page sends the form to `POST /subscribe`. The Worker checks the name, reserves the slot, stores a *pending* sponsor and the consent record, and asks Paystack for a checkout page. The sponsor pays on Paystack's page, and Paystack turns the plan into a **monthly subscription** on their card.
- **Payment confirmed.** The Worker hears about it in two ways: the webhook, and the sign-up page asking `GET /status` when the sponsor returns. Whichever comes first activates the sponsor. A payment is counted only once, however often Paystack repeats a message.
- **Who's shown.** A sponsor appears in the game while **all** of these are true:
  - the status is *active* or *cancelling*
  - the sponsor is approved
  - the sponsor is not hidden
  - **paid until** is in the future
- **Paid until.** Each successful monthly payment adds one calendar month. A month starts when the previous one ends, or on the payment date if that's later. `GRACE_DAYS` (3) are added once at the end, so a renewal that's a few days late doesn't make the sponsor disappear. Paid until is always worked out again from all the payments, so messages that arrive late, twice or in the wrong order can't give anyone extra time.
- **Renewals** happen automatically every month. If a card fails, there's no extension, and the sponsor drops out once paid until passes. If Paystack's retry succeeds later, they come back. Depending on your plan settings, Paystack can e-mail the sponsor about the failed payment, and you can send them the card link from section 8.
- **Cancelling.** When the sponsor or you cancel, the status becomes *cancelling* and they stay visible until paid until. The daily clean-up then marks them *ended*.
- **One billboard.** While someone is paying for it, or has been at Paystack's checkout for the last 30 minutes, the sign-up page shows the billboard as "Tans bespreek" (booked) and nobody else can buy it.
- **Daily clean-up** (03:17 UTC):
  - unpaid sign-ups older than 7 days become *abandoned*
  - their contact details are removed after 30 days
  - stored webhook copies are removed after 90 days
  - cancelled sponsorships that have run out become *ended*
  - payment records are kept

## 10. Costs

Check current prices on the providers' pages. They change.

- **Cloudflare Workers, free plan:** 100 000 requests per day. Each game start fetches the sponsor list once, and the game also keeps its own 5-minute cache. If Stapel gets more than roughly 100 000 game starts a day, the list request starts failing (the game then falls back to its cached copy and `sponsors.json`). At that point, move to Workers Paid, currently from **US$5 per month**.
- **Cloudflare D1, free plan:** 5 million rows read and 100 000 rows written per day, and 5 GB of storage. Since September 2026, queries fail once a free daily limit is reached. The Worker keeps the sponsor list in memory for 30 seconds and serves the last good copy if the database is unavailable, so normal use stays far below these limits.
- **Paystack:** no monthly fee. A fee per successful payment, at the time of writing about **2.9% + R1 per local card payment** (more for international cards), **plus VAT**. Check <https://paystack.com/za/pricing>. On R1 499 that's roughly R44 + VAT per month. Refunds and chargebacks can have their own fees. Payouts go to your bank account.

## 11. Security and privacy

- **No secrets in the repository.** `wrangler.toml` only holds plan codes, the D1 id and settings. Secrets live in Cloudflare (`wrangler secret put`). `.dev.vars` (local secrets for `wrangler dev`) is git-ignored.
- **Webhooks** must carry a valid HMAC-SHA512 signature of the exact request body, made with your secret key. The Worker checks it in constant time. Unsigned or tampered messages get `401`.
- **Payments are checked**, not trusted: the plan must be the sponsor's plan, the currency must be ZAR, and premium payments can't be less than `PREMIUM_PRICE_CENTS`. This stops someone paying R1 with a copied sponsor id.
- **Admin token:** at least 32 characters, compared in constant time, sent only in the `Authorization` header. If it leaks, run `npx wrangler secret put ADMIN_TOKEN` with a new one; the old one stops working immediately.
- **Public data:** `GET /sponsors` returns only names, taglines and website addresses of live sponsors. It never returns e-mails, phone numbers or Paystack details.
- **Card details** never touch this server. Paystack's checkout handles them. Stored webhook copies have card and IP details removed.
- **POPIA:** the server stores the business name, contact name, e-mail, phone number and a consent record. The consent record holds the terms and privacy versions, the time, and a keyed hash of the IP address, never the IP itself. Retention is described in section 9. Mention Cloudflare (hosting) and Paystack (payments) as operators in `privaatheid.html`.
- **Names are checked before payment.** The filter blocks swear words and slurs (English and Afrikaans, including tricks like `sh1t` or look-alike letters), web addresses, e-mail addresses, phone numbers, and names that pretend to be Stapel, admin or Paystack. Nobody pays for a name that won't be shown. You can still hide anything later.
- **Content rules** come from the terms, not the code: no illegal goods, unlawful gambling, alcohol, tobacco or vaping (minors play the game), adult content, political or religious campaigning, or hateful or misleading content. Check new sponsors on the admin page, or set `AUTO_APPROVE` to `false` to approve each one yourself.

## 12. Troubleshooting

| Problem | What to check |
| --- | --- |
| The sign-up page says "kom binnekort" | `SPONSOR_API_URL` in `js/sponsorConfig.js` is empty or not deployed yet. |
| The browser console shows a CORS error | Your site's origin (e.g. `https://anandregroenewald.github.io`, without `/Toring/`) must be in `ALLOWED_ORIGINS`. Redeploy after changing it. |
| "Ons kon nie die betaling by Paystack begin nie" | `npx wrangler tail` shows the reason. Usually a wrong `PAYSTACK_SECRET_KEY` (test vs live) or a plan code from the other mode. |
| Paid, but the name doesn't show | 1. In `admin.html`, is the sponsor *active*, approved and not hidden? 2. Wait 5 minutes (game cache). 3. Under events, a note like `rejected:plan_mismatch` means the plan codes in `wrangler.toml` don't match Paystack. |
| Paystack shows webhook failures | The webhook URL must end in `/paystack/webhook`, and the secret key must be from the same mode (test/live). Paystack retries failed webhooks for a while. Paystack's dashboard also lets you resend them. |
| The admin page says unauthorised | Wrong token, or `ADMIN_TOKEN` is shorter than 32 characters (then the admin API is off and answers `admin_disabled`). |

## 13. API reference

All endpoints answer JSON. Errors look like `{ "error": "<code>", "field"?: "<field>" }`.

| Method and path | Who | Notes |
| --- | --- | --- |
| `GET /sponsors` | anyone (CORS `*`) | `{ updatedAt, block: [{ id, name }], premium: [{ id, name, tagline, url }] }`. Live sponsors only. `tagline` and `url` are `""` when empty. `Cache-Control: public, max-age=300`. |
| `GET /availability` | anyone (CORS `*`) | `{ premium: { available }, block: { available } }` |
| `POST /subscribe` | site origins | Body: `{ tier, name, tagline?, url?, contactName, email, phone?, acceptTerms: true, acceptPrivacy: true, termsVersion, privacyVersion, website: "" }`. Returns `{ url, reference, sponsorId, name, needsApproval }`, where `name` is the cleaned name. |
| `GET /status?sponsor=&reference=` | site origins | `{ status: "active" \| "pending" \| "failed" \| "ended", tier, name, needsApproval, liveFrom, paidUntil }`. `trxref` is accepted instead of `reference`. |
| `POST /paystack/webhook` | Paystack only | Needs a valid `x-paystack-signature`. |
| `GET /admin/sponsors` | admin | `{ sponsors: [ {…all columns, live} ], now }` |
| `POST /admin/sponsors` | admin | `{ tier, name, paid_until, tagline?, url?, email?, contact_name?, phone?, notes?, approved?, hidden? }` returns `201 { sponsor }` |
| `PATCH /admin/sponsors/:id` | admin | Any of `name, tagline, url, email, contact_name, phone, approved, hidden, status, notes, paid_until`. Returns `{ sponsor }`. |
| `DELETE /admin/sponsors/:id[?force=1]` | admin | `409 cancel_first` while a subscription is active |
| `POST /admin/sponsors/:id/cancel` | admin | Optional body `{ immediate: true }`. Returns `{ ok, sponsor }`. |
| `POST /admin/sponsors/:id/manage-link` | admin | `{ link }`, or `409 no_subscription` |
| `GET /admin/payments?limit=` | admin | `{ payments: [{ reference, sponsor_id, amount, currency, paid_at, source, sponsor_name, sponsor_tier }] }` |
| `GET /admin/events?limit=` | admin | `{ events: [{ id, type, received_at, handled, sponsor_id, note, payload }] }` |

Dates are Unix milliseconds. `paid_until` in admin requests may also be `"YYYY-MM-DD"`, meaning the end of that day in South African time.

**Error codes** (the sign-up page turns them into Afrikaans):

| Code | Meaning |
| --- | --- |
| `invalid_tier` | Unknown package |
| `terms_required` | Terms or privacy not ticked |
| `invalid_name`, `name_rejected` | Bad length or characters / blocked by the filter |
| `invalid_tagline`, `tagline_rejected` | The same checks for the tagline |
| `invalid_url` | Not a plain https website address |
| `invalid_contact`, `invalid_email`, `invalid_phone` | Contact details |
| `bad_request` | Unreadable request (also returned when the hidden anti-spam field is filled in) |
| `forbidden_origin` | Request from a website not in `ALLOWED_ORIGINS` |
| `premium_taken` | The billboard is booked (409) |
| `block_full` | All block slots are taken (409) |
| `rate_limited` | Too many sign-ups from this e-mail address or network, or in total, in the last hour (429) |
| `payment_init_failed` | Paystack couldn't start the checkout (502). Nothing was charged. |
| `sales_disabled` | That package isn't set up on the server (503) |
| `not_found` | Unknown sponsor/reference, or unknown path (404) |
| `unauthorized`, `admin_disabled` | Admin token missing or wrong / admin API not configured |
| `cancel_first`, `no_subscription`, `paystack_error`, `invalid_field` | Admin actions |

## 14. Developing and tests

```sh
npm test            # node --test: real SQL on node:sqlite + a fake Paystack; nothing to install
npm install         # optional: adds wrangler; npm test then also runs a smoke test in the real Workers runtime
npx wrangler dev    # local server on http://localhost:8787 with a local D1 database
```

For `wrangler dev`, put local test secrets in a `.dev.vars` file in this folder (it's git-ignored), then create the local tables:

```
PAYSTACK_SECRET_KEY=sk_test_...
ADMIN_TOKEN=a-long-random-local-token-of-at-least-32-chars
```

```sh
npx wrangler d1 execute stapel-borge --local --file=./schema.sql
```

Code map:

| File | What it does |
| --- | --- |
| `src/worker.js` | Router, CORS, feed cache, cron entry |
| `src/public.js` | `/sponsors`, `/availability`, `/subscribe`, `/status` |
| `src/webhook.js` | Signature check, dedupe, Paystack event handlers |
| `src/billing.js` | Applying a payment to a sponsor (shared by the webhook and `/status`) |
| `src/entitlement.js` | The "who is live" rule and the paid-until calculation |
| `src/admin.js` | Owner endpoints |
| `src/moderation.js` | Name, tagline and website rules (mirrored in the sign-up page) |
| `src/validate.js` | Request validation |
| `src/paystack.js` | Paystack API client |
| `src/db.js` | All SQL |
| `src/retention.js` | Daily clean-up |
| `schema.sql` | D1 tables and indexes |
