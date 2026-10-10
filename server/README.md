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

> **Live since 7 Oct 2026:** `https://stapel-borge.bonkers-bunch-online.workers.dev`, in the owner's **Lekker Local** Cloudflare account (free plan; `account_id` pinned in `wrangler.toml`; Bonkers Bunch's online Worker shares the account). D1, the match Durable Objects, `ADMIN_TOKEN` (in the owner's Mac Keychain as "Stapel admin token") and `IP_HASH_SALT` are set up. The real D1 `database_id` stays out of the repo (the security test refuses a committed one): it lives in `~/.config/stapel/cloudflare.env` (`D1_DATABASE_ID=...`), and `./wr.sh deploy` (or `./wr.sh d1 execute …`) runs wrangler with it filled in. The game uses it through `MATCH_API_URL` (live matches and the anonymous counts). Sponsorship sales are **not** on. The owner wants **PayFast** instead of Paystack, so the payment code below still has to be switched before sections 2, 4 and 6–7 apply.

---

## Contents

1. [What you need](#1-what-you-need)
2. [Paystack: account, plans and keys](#2-paystack-account-plans-and-keys)
3. [Cloudflare: database and Worker](#3-cloudflare-database-and-worker)
4. [Connect Paystack to the Worker (webhook)](#4-connect-paystack-to-the-worker-webhook)
5. [Switch the game on](#5-switch-the-game-on)
6. [Test everything with Paystack test cards](#6-test-everything-with-paystack-test-cards)
7. [Go live](#7-go-live)
8. [Everyday tasks](#8-everyday-tasks): add, hide, edit, cancel, refund, the card link, audience counts and the monthly report
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

> **Migration note (daily leaderboard, 1.9.2).** Run once: `./wr.sh d1 execute stapel-borge --remote --file=./migrations/0003_board.sql` (it only adds the tables `daily_board`, `daily_board_days` and `daily_board_hist` and an index; safe to repeat), then deploy. Until the tables exist, `/board` answers `500` and the game simply shows no place.

> **Migration note (anonymous audience counts).** If your database already exists from before the audience counts were added, run the very same command again. Because every statement is `CREATE TABLE IF NOT EXISTS`, it only adds the two new tables `stats_daily` and `daily_scores` and leaves everything else untouched. Then `wrangler deploy` the new Worker. Until the tables exist, `POST /stats` and `/score` answer `500` and the game silently ignores that; nothing else is affected.
>
> **Migration note (security update, version 1.3.1 of the game).** Run the same command once more: it adds `payment_reversals` (refunds and chargebacks) and `alerts` (the "needs attention" list on the admin page). **Do this before deploying the new Worker**, because webhooks for payments use these tables.

### 3.2 Settings (`wrangler.toml` → `[vars]`)

Open `wrangler.toml` and fill in:

| Setting | What to put |
| --- | --- |
| `PLAN_BLOCK` | Block plan code (`PLN_...`) from step 2.2 |
| `PLAN_PREMIUM` | Premium plan code |
| `PREMIUM_PRICE_CENTS` | `149900` (R1 499) |
| `BLOCK_PRICE_CENTS` | Leave empty: the price is read from the Paystack plan. |
| `SITE_URL` | Your game's address with a slash at the end, e.g. `https://stapelspel.pages.dev/` |
| `ALLOWED_ORIGINS` | Web addresses allowed to use the sign-up and admin API: your site's **origin** (no path), e.g. `https://stapelspel.pages.dev`. `http://localhost:*` is for testing on your computer. |
| `PREMIUM_MAX` / `BLOCK_MAX` | How many sponsors at once: `1` billboard and `60` block names |
| `AUTO_APPROVE` | `true`: clean names go live straight after payment. `false`: you approve each one first on the admin page. |
| `GRACE_DAYS` | `3`: extra days a sponsor stays visible after the paid month, so a renewal that's a day late doesn't make them disappear. |
| `STATS_FLUSH_SECONDS` | Optional. The Worker adds the anonymous counts up in memory and writes them to D1 at most this often (default `60`). This keeps D1's free daily write budget for payments and sign-ups. `0` writes every message straight away. |
| `RATE_LIMIT_ADMIN_FAILS_PER_HOUR` | Optional. Wrong admin tokens one address may try per hour before it has to wait (default `20`), even with the right token. |
| `RATE_LIMIT_STATS_PER_HOUR` / `RATE_LIMIT_SCORE_PER_HOUR` | Optional. How many anonymous counts (`POST /stats`) and daily-percentile requests (`/score`) one network address may send per hour: `120` and `60` by default. Generous on purpose, because a school or a mobile network can put many players behind one address. |
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

Optional: `npx wrangler secret put IP_HASH_SALT` (any long random string) to key the IP fingerprints used for rate limiting. If you don't set it, the admin token is used (or, without one, the Paystack secret key).

### 3.4 Deploy

```sh
npx wrangler deploy
```

It prints your Worker's address, e.g. `https://stapel-borge.<your-subdomain>.workers.dev`. Check that it works: opening `https://stapel-borge.<your-subdomain>.workers.dev/sponsors` in a browser shows `{"updatedAt":"…","block":[],"premium":[]}`.

Run `npx wrangler deploy` again after every change to `wrangler.toml` or `src/`.

The same deploy also sets up the **Uitdagersreeks** (live head-to-head matches): two Durable Objects, `MatchLobby` and `MatchRoom`, declared in `wrangler.toml`. The first deploy creates them through the `v1-uitdagersreeks` migration, and there is nothing else to set up. They are SQLite-backed, which the free plan allows. See [section 5](#5-switch-the-game-on) to switch them on in the game.

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

**Live Uitdagersreeks matches** use the same Worker. With `SPONSOR_API_URL` set they're on. To switch on live matches *before* sponsorship sales, leave `SPONSOR_API_URL` empty and put the Worker's address in `MATCH_API_URL` (same file) instead. Without either, the mode still works against the computer and with friend challenge links; the "Soek ’n teenstander" button and live friend rooms appear once a Worker is set.

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
7. Clear the test data (command above), then buy one block sponsorship yourself with a real card, check it appears, and cancel or refund it. (Should you forget the clean-up: with a live key, payments made in test mode never count, and the daily clean-up takes test sponsors out of the game. The admin page shows a "Toetsmodus" warning while a test key is set.)

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

**Uitdagersreeks recordings** (what lonely players get as an opponent). List them, or forget every recording by some nicknames (a test match, a rude name):

```sh
curl -H "Authorization: Bearer $TOKEN" $API/admin/runs
curl -X POST $API/admin/runs -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"names":["Toets A"]}'
```

**Live server logs:** `npx wrangler tail`. Logs never contain e-mail addresses or card details.

**Backups:** `npx wrangler d1 export stapel-borge --remote --output=borge-backup.sql`. The file contains sponsors' contact details, so store it safely.

### Audience counts and the monthly report

The game counts, anonymously, how often a sponsor was seen (see section 11 for exactly what and how). Open **`admin.html` → Statistiek**:

1. Pick a period with the quick buttons (**Laaste 30 dae**, **Hierdie maand**, **Vorige maand**) or choose your own dates and press **Wys**.
2. You get the totals (games finished, names shown on blocks, games with a billboard, menu card views), a table **per day** and a table **per sponsor**.
3. At the start of a month, press **Vorige maand**, then **Kopieer maandverslag** next to a sponsor. A friendly Afrikaans message is copied (and shown below the tables so you can adjust it): games played, how many times their name was on a block, and for the billboard how many days and games it was on the island. Paste it into an e-mail or WhatsApp.

Good to know:

- Only games that were **finished** are counted; someone who closes the page halfway isn't. The numbers are a good indication, not an audit. Say so to sponsors (the report text already does).
- Only sponsors the Worker knows (paid sign-ups and manual deals added on the admin page) are counted. The `sportscard.co.za` house ad in `sponsors.json` has no sponsor record, so only its menu views are counted (**Spyskaart**).
- Someone can send fake counts straight to the API with a script. The Worker limits each address, caps every number and only accepts known sponsors, so the damage is bounded, but treat the numbers as indicative.
- Counts are kept for about 13 months (400 days) and then deleted by the daily clean-up.

Terminal equivalent:

```sh
curl -s -H "Authorization: Bearer $TOKEN" "$API/admin/stats?from=2026-10-01&to=2026-10-31"
```

## 9. How billing works

- **Sign-up.** The page sends the form to `POST /subscribe`. The Worker checks the name, reserves the slot, stores a *pending* sponsor and the consent record, and asks Paystack for a checkout page. The sponsor pays on Paystack's page, and Paystack turns the plan into a **monthly subscription** on their card.
- **Payment confirmed.** The Worker hears about it in two ways: the webhook, and the sign-up page asking `GET /status` when the sponsor returns. Whichever comes first activates the sponsor. A payment is counted only once, however often Paystack repeats a message.
- **Who's shown.** A sponsor appears in the game while **all** of these are true:
  - the status is *active* or *cancelling*
  - the sponsor is approved
  - the sponsor is not hidden
  - **paid until** is in the future
- **Paid until.** Each successful monthly payment adds one calendar month, counted from the first payment's day (31 Jan, 28 Feb, 31 Mar: the day never drifts). A renewal that arrives a little late (within `GRACE_DAYS`) still belongs to the same month; after a real lapse, a payment starts a new month on the payment date. `GRACE_DAYS` (3) are added once at the end, so a renewal that's a few days late doesn't make the sponsor disappear. Paid until is always worked out again from all the payments, so messages that arrive late, twice or in the wrong order can't give anyone extra time.
- **Renewals** happen automatically every month. If a card fails, there's no extension, and the sponsor drops out once paid until passes. If Paystack's retry succeeds later, they come back. Depending on your plan settings, Paystack can e-mail the sponsor about the failed payment, and you can send them the card link from section 8.
- **Cancelling.** When the sponsor or you cancel (or Paystack stops the subscription for another reason), the status becomes *cancelling* and they stay visible until paid until, as the terms promise. The daily clean-up then marks them *ended*. To take an ad down at once (a breach of the terms), hide it or cancel with "immediately" on the admin page.
- **Refunds and chargebacks.** Refund in the Paystack Dashboard as usual. Once the refunds for a payment add up to the whole amount, that payment no longer buys time (a partial refund leaves the month alone). A chargeback (bank dispute) stops the ad automatically while it is open, and for good if the bank decides for the customer; if it's decided for you, the ad comes back. The admin page flags every dispute.
- **Paid but the slot is gone.** The checkout hold lasts 30 minutes. If someone pays for the billboard after that while someone else has bought it in the meantime (or pays for a sign-up that was already marked abandoned), the Worker checks the slot again when the money arrives. The late buyer is not shown, their Paystack subscription is stopped as soon as Paystack creates it, their sign-up page says the money comes back, and the admin page asks you to **refund** them in the Paystack Dashboard.
- **One billboard.** While someone is paying for it, or has been at Paystack's checkout for the last 30 minutes, the sign-up page shows the billboard as "Tans bespreek" (booked) and nobody else can buy it. (Someone could keep restarting an unpaid checkout to keep it "booked"; if that happens, set `PENDING_HOLD_MINUTES` to `0`. The slot is checked again when the money arrives, so it can never be sold twice; see "Paid but the slot is gone".)
- **Needs attention.** The top of the admin page lists what you must act on: a refund for a slot that was already taken, money that arrived for an ended sponsorship, and bank disputes. Click "Klaar" when it's dealt with.
- **Daily clean-up** (03:17 UTC):
  - unpaid sign-ups older than 7 days become *abandoned*
  - their contact details are removed after 30 days
  - stored webhook copies are removed after 90 days
  - cancelled sponsorships that have run out become *ended*
  - payment records are kept

## 10. Costs

Check current prices on the providers' pages. They change.

- **Cloudflare Workers, free plan:** 100 000 requests per day. Each game start fetches the sponsor list once, and the game also keeps its own 5-minute cache. If Stapel gets more than roughly 100 000 game starts a day, the list request starts failing (the game then falls back to its cached copy and `sponsors.json`). At that point, move to Workers Paid, currently from **US$5 per month**.
- **Cloudflare D1, free plan:** 5 million rows read and 100 000 rows written per day, and 5 GB of storage. Each Worker instance adds the anonymous counts up in memory and writes them once a minute (`STATS_FLUSH_SECONDS`), so the writes grow with the number of sponsors, not with the number of games; a Daaglikse Toring result still writes one row. Even a script flooding `/stats` can't use up the write budget that payments need. Beyond that the counts start failing quietly (the game ignores it) until the next day. Since September 2026, queries fail once a free daily limit is reached. The Worker keeps the sponsor list in memory for 30 seconds and serves the last good copy if the database is unavailable, so normal use stays far below these limits.
- **Uitdagersreeks (Durable Objects), free plan:** 100 000 requests and 100 000 storage writes per day, and the duration of the objects (13 000 GB-s per day). The rooms use WebSocket hibernation, so a quiet room costs nothing. Incoming WebSocket messages count 20 to 1 as requests, and a room saves only at the moments that matter, so a two-minute match costs roughly 20 requests and 30 writes. That is a few thousand matches a day before anything runs out; past a limit, new matches fail until 00:00 UTC (the game then offers the computer).
- **Paystack:** no monthly fee. A fee per successful payment, at the time of writing about **2.9% + R1 per local card payment** (more for international cards), **plus VAT**. Check <https://paystack.com/za/pricing>. On R1 499 that's roughly R44 + VAT per month. Refunds and chargebacks can have their own fees. Payouts go to your bank account.

## 11. Security and privacy

- **No secrets in the repository.** `wrangler.toml` only holds plan codes, the D1 id and settings. Secrets live in Cloudflare (`wrangler secret put`). `.dev.vars` (local secrets for `wrangler dev`) is git-ignored.
- **Webhooks** must carry a valid HMAC-SHA512 signature of the exact request body, made with your secret key. The Worker checks it in constant time. Unsigned or tampered messages get `401`.
- **Payments are checked**, not trusted: the plan must be the sponsor's plan, the currency must be ZAR, and premium payments can't be less than `PREMIUM_PRICE_CENTS`. This stops someone paying R1 with a copied sponsor id.
- **Paystack test keys** never pay for anything once a live key (`sk_live_...`) is set: test-mode charges are refused and old test payments stop counting.
- **Admin token:** at least 32 characters, compared in constant time, sent only in the `Authorization` header (never in a URL or the logs). After 20 wrong tokens from one address in an hour, that address has to wait. If it leaks, run `npx wrangler secret put ADMIN_TOKEN` with a new one; the old one stops working immediately.
- **Public data:** `GET /sponsors` returns only names, taglines and website addresses of live sponsors. It never returns e-mails, phone numbers or Paystack details.
- **Card details** never touch this server. Paystack's checkout handles them. Stored webhook copies have card and IP details removed.
- **POPIA:** the server stores the business name, contact name, e-mail, phone number and a consent record. The consent record holds the terms and privacy versions, the time, and a keyed hash of the IP address, never the IP itself. Retention is described in section 9. Mention Cloudflare (hosting) and Paystack (payments) as operators in `privaatheid.html`.
- **Anonymous audience counts (`POST /stats`, `POST /score`).** When a game ends, the game sends one small message: the date, daily or practice, how many times each sponsor's name was on a block the player dropped, which sponsor's billboard stood on the island, and whether the menu card was shown. The Worker validates and clamps it (known live sponsor ids only, at most 60 per sponsor, 4 KB, date within a day of today) and only **adds to totals** in `stats_daily` (per day, metric and sponsor). A Daaglikse Toring result adds one to a 0,5 m bucket in `daily_scores`, which is how the "beter as 72% van spelers" line is worked out. No IP address, name, device id, cookie, timestamp or per-player row is stored anywhere. To limit abuse, an address is hashed with your secret and the **date** (so the hash changes every day and can't be followed across days), held only in the Worker's memory for at most an hour and never written to the database or the logs. Counts older than about 13 months are deleted.
- **Names are checked before payment.** The filter blocks swear words and slurs (English and Afrikaans, including tricks like `sh1t`, `S H I T`, stretched letters, invisible characters and look-alike letters such as small capitals or other alphabets, which are refused outright), while innocent names that merely contain such a word, like "Scunthorpe", stay allowed; web addresses, e-mail addresses, phone numbers, and names that pretend to be Stapel, admin or Paystack. Nobody pays for a name that won't be shown. You can still hide anything later.
- **Content rules** come from the terms, not the code: no illegal goods, unlawful gambling, alcohol, tobacco or vaping (minors play the game), adult content, political or religious campaigning, or hateful or misleading content. Check new sponsors on the admin page, or set `AUTO_APPROVE` to `false` to approve each one yourself.

## 12. Troubleshooting

| Problem | What to check |
| --- | --- |
| The sign-up page says "kom binnekort" | `SPONSOR_API_URL` in `js/sponsorConfig.js` is empty or not deployed yet. |
| The browser console shows a CORS error | Your site's origin (e.g. `https://stapelspel.pages.dev`, without `/Toring/`) must be in `ALLOWED_ORIGINS`. Redeploy after changing it. |
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
| `GET /status?sponsor=&reference=` | site origins | `{ status: "active" \| "pending" \| "failed" \| "ended" \| "taken", tier, name, needsApproval, liveFrom, paidUntil }`. `trxref` is accepted instead of `reference`. |
| `POST /stats` | site origins | One finished game, anonymous: `{ dateKey, mode: "daily" \| "practice", blocks: { <sponsorId>: n }, billboard: <sponsorId> \| null, menu: bool }`. Body at most 4 KB, `application/json` or `text/plain` (that is what `sendBeacon` sends). Unknown sponsor ids are ignored, `n` is capped at 60, `dateKey` must be within a day of the server's date. Returns `{ ok: true }`. Rate limit: `RATE_LIMIT_STATS_PER_HOUR` per network address (`429`). |
| `POST /score` | site origins | A Daaglikse Toring result: `{ dateKey, dayNumber, heightM }` (`dayNumber` must match `dateKey`; `heightM` is clamped to 0 to 1000). Returns `{ percentile, players }`: the share (rounded) of the *other* players' results that are strictly below yours, ties counting half; `percentile` is `null` when you are the only one. Rate limit: `RATE_LIMIT_SCORE_PER_HOUR`. |
| `GET /score?dateKey=&heightM=` | site origins | The same answer without adding anything (for revisiting the results). |
| `POST /board` | site origins | The daily leaderboard (`src/board.js`): `{ dateKey, dayNumber, player, name, heightM, blocks, durationMs, hidden, retry? }` (1.12 `retry`: "Nog 'n kans", a second try bought with coins: once a day it keeps the better height and marks the entry `retried`, shown as 🔁; migration `0004_board_retry.sql`). `player` is the phone's random number (`[a-z0-9]{12,32}`); `name` goes through the name rules (else `Bouer`). `dateKey` must be the date somewhere on earth now (UTC+14 to UTC-12), or have been within the last 6 hours. The first post of a day is kept; later ones only change `name` and `hidden` (not for an entry the owner blocked). Impossible towers are refused with `422` (more than 4 m a block plus 8 blocks, faster than 700 ms a block, or more than 2 m/s after 10 m). Returns `{ dateKey, players, top: [{ rank, name, heightM, you }], you: { rank, heightM, hidden } \| null }`; ranks are true places (a hidden or blocked player keeps theirs; `you.hidden` is true for both). Rate limit: `RATE_LIMIT_BOARD_POST_PER_HOUR` (60). |
| `GET /board?dateKey=&player=` | site origins | The same answer without posting (`player` optional). Rate limit: `RATE_LIMIT_BOARD_GET_PER_HOUR` (240). |
| `POST /paystack/webhook` | Paystack only | Needs a valid `x-paystack-signature`. |
| `GET /match/lobby` | site origins, WebSocket | Uitdagersreeks: looking for a random opponent. Client sends `{ t: "hello", v: 1, name }`; the server answers `{ t: "wait" }` and, once paired, `{ t: "match", room }` and closes. |
| `POST /match/room` | site origins | A new friend room: `{ code }` (6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`). Body `{ "mode": "turns" }` for Blok vir Blok (anything else: Wedloop). Waits 10 minutes. Rate limit: 30 per network address per hour. |
| (Blok vir Blok room) | | 1.11, `docs/CHALLENGE-SPEC.md`: `start` adds `mode: "turns"` and the first `turn`; then `{ t: "turn", n, seat, hearts, streaks, sab }`, the other player's `{ t: "drop", n, p, ct }` and `{ t: "settled", n, lost, r, snap }`, `{ t: "choose" }` / `{ t: "sent", kind }` / `{ t: "sabotage", kind }` for a joker, and `{ t: "result", winner, reason, hearts }`. Client: `drop`, `settled`, `joker`, `over`. A turn not ended within 45 s loses (alarm); games older than protocol 3 get `gone`. The lobby's hello may carry `mode`; only the same mode is paired. Wedloop's `state` may carry `lives`, passed on as `opp.lives`. **1.12 (protocol 4):** `start.opp.v` is the other game's protocol; client `{ t: "go", n }` (the turn began on that screen) is passed on as is; `settled` may carry `k` (physics steps from the drop, passed on) and `vis` (`caught` / `stole`, for the referee); client `{ t: "visit", n, what, at, idx }` (the round's Skelm Sakkie: what, at which ms of his visit, the blocks he took) is passed on cleaned. When both games are protocol 4 the start says `rounds: true` and every `turn` may carry `ev` (this turn's round: `{ kind, dir, strength, side, key, first }`) and `nx` (the round the next turn begins); beating a round's visitor gives a heart back. All of it only from the player whose turn it is, for the current turn. In either mode a client may send `{ t: "emote", e }` (an id from `EMOTES` in js/config.js); it goes to the other player as is, at most one every 3 s and 20 a match per player. Cards now carry `rl`, the rank in the mode played (js/core/economy.js `LADDER`). |
| `GET /match/room/<CODE>` | site origins, WebSocket | Join a room. Server: `{ t: "wait" }`, then `{ t: "start", seed, you: 0 \| 1, opp: { name } }`, during the match `{ t: "opp", h, best }`, `{ t: "attack", m, kind }`, `{ t: "sent", m, kind }` and finally `{ t: "result", winner, reason, best: [a, b] }`; `{ t: "gone" }` for a room that is full, over or unknown. Client: `{ t: "hello", v: 1, name }`, `{ t: "state", h, best }` (about every 0,4 s) and `{ t: "over", reason, best }`. At most 10 messages a second; heights faster than 2 m/s are cut back. Protocol 5 (1.12.1, `docs/CHALLENGE-SPEC.md` "Protocol 5"): a friend room's `wait` carries `host: { name, mode }`; the friend may answer `{ t: "decline", name }` (the host hears `{ t: "declined", name }`); `?rejoin=1` with a hello `{ v: 5, key, rejoin: true }` takes a dropped player's seat back within 20 s (`{ t: "rejoined" }`, then the messages it missed; the other player hears `away` / `back`); in a friend match `pause` / `resume` (`paused`, `resumed`, `nopause`) and, after the result, `again` (a new match in the same room; `bye` when the other player went). |
| `GET /match/ghost` | site origins | A recent recording for a player nobody is around to play: `{ payload }` (the same format as a `?teen=` challenge link), or `404 { error: "none" }`. Recordings are kept at most 7 days. |
| `GET /admin/sponsors` | admin | `{ sponsors: [ {…all columns, live} ], alerts: [{ id, kind, sponsor_id, sponsor_name, reference, amount, created_at }], paystackMode: "live" \| "test" \| "unknown", now }` |
| `POST /admin/alerts/:id/resolve` | admin | Marks a "needs attention" item as dealt with. `{ ok: true }` or `404`. |
| `POST /admin/sponsors` | admin | `{ tier, name, paid_until, tagline?, url?, email?, contact_name?, phone?, notes?, approved?, hidden? }` returns `201 { sponsor }` |
| `PATCH /admin/sponsors/:id` | admin | Any of `name, tagline, url, email, contact_name, phone, approved, hidden, status, notes, paid_until`. Returns `{ sponsor }`. |
| `DELETE /admin/sponsors/:id[?force=1]` | admin | `409 cancel_first` while a subscription is active |
| `POST /admin/sponsors/:id/cancel` | admin | Optional body `{ immediate: true }`. Returns `{ ok, sponsor }`. |
| `POST /admin/sponsors/:id/manage-link` | admin | `{ link }`, or `409 no_subscription` |
| `GET /admin/payments?limit=` | admin | `{ payments: [{ reference, sponsor_id, amount, currency, paid_at, source, sponsor_name, sponsor_tier }] }` |
| `GET /admin/stats?from=&to=` | admin | `YYYY-MM-DD`, default the last 30 days, at most 400 days. `{ from, to, totals: { gamesDaily, gamesPractice, games, blockShows, billboardGames, menuViews }, days: [{ dateKey, …same }], sponsors: [{ id, name, tier, blockShows, billboardGames, blockDays, billboardDays }] }`. `400 invalid_range` for a bad period. |
| `GET /admin/events?limit=` | admin | `{ events: [{ id, type, received_at, handled, sponsor_id, note, payload }] }` |
| `GET /admin/board?dateKey=` | admin | A day's top 50 (default today, UTC) with what's needed to find a bad entry: `{ dateKey, players, entries: [{ rank, player, name, heightM, blocks, seconds, mPerBlock, hidden, blocked, at }] }`. |
| `POST /admin/board` | admin | `{ dateKey, player }` blocks one leaderboard entry for good (a rude name that slipped through, a forged result): the player's later posts can't show it again. Add `unblock: true` to undo that, or `remove: true` to delete the entry (a player who asked; the day's counts go down with it). `{ ok, changed }` |
| `GET /admin/runs` | admin | The Uitdagersreeks recordings kept for lonely players: `{ runs: [{ name, seed, best, end, at }] }` |
| `POST /admin/runs` | admin | `{ names: [...] }` (at most 20): forget every recording by these nicknames. `{ ok, removed, left }` |

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
| `rate_limited` | Too many sign-ups from this e-mail address or network, or in total, in the last hour (429). Also for too many `/stats` or `/score` requests from one network address. |
| `invalid_range` | `GET /admin/stats` got a bad or too long period (400) |
| `payment_init_failed` | Paystack couldn't start the checkout (502). Nothing was charged. |
| `sales_disabled` | That package isn't set up on the server (503) |
| `not_found` | Unknown sponsor/reference, or unknown path (404) |
| `unauthorized`, `admin_disabled` | Admin token missing or wrong / admin API not configured |
| `cancel_first`, `no_subscription`, `paystack_error`, `invalid_field` | Admin actions |

## 14. Developing and tests

```sh
npm test            # node --test: real SQL on node:sqlite + a fake Paystack; nothing to install
npm install         # optional: adds wrangler; npm test then also runs a smoke test in the real Workers runtime
npx wrangler dev    # local server on http://localhost:8787 with a local D1 database and the match objects
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
| `src/stats.js` | Anonymous audience counts (`/stats`), the daily percentile (`/score`), the in-memory rate limiter and `GET /admin/stats`. It imports `js/core/daily.js` for the date rules, so deploy from a full checkout. |
| `src/moderation.js` | Name, tagline and website rules. It re-exports `js/core/nameRules.js` (one copy, shared with the sign-up page and the game; `wrangler deploy` bundles it into the Worker, so always deploy from a full checkout of the repository) |
| `src/validate.js` | Request validation |
| `src/paystack.js` | Paystack API client |
| `src/db.js` | All SQL |
| `src/retention.js` | Daily clean-up |
| `schema.sql` | D1 tables and indexes (run it again after an update; see the migration note in 3.1) |
