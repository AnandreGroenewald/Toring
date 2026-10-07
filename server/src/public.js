// Public endpoints used by the game (feed) and by adverteer.html (sign-up + status).

import * as db from './db.js';
import { applyCharge, parseMetadata, parseTime, planCodeOf } from './billing.js';
import { isOriginAllowed, salesConfigured, TIERS } from './config.js';
import { hashIp, newReference, newSponsorId, safeEqual } from './crypto.js';
import { isLive } from './entitlement.js';
import { HttpError, clientIp, json, readJsonObject } from './http.js';
import { isReference, isUuid, validateSubscribe } from './validate.js';

const HOUR_MS = 60 * 60 * 1000;
const VERIFY_THROTTLE_MS = 3000;
const PLAN_CACHE_MS = 10 * 60 * 1000;

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/** GET /sponsors — live sponsors only, public fields only. */
export async function getSponsorsFeed(ctx) {
  const live = await db.listLive(ctx.db, ctx.now);
  return {
    updatedAt: iso(ctx.now),
    block: live.filter((s) => s.tier === 'block').map((s) => ({ id: s.id, name: s.name })),
    premium: live.filter((s) => s.tier === 'premium')
      .map((s) => ({ id: s.id, name: s.name, tagline: s.tagline || '', url: s.url || '' })),
  };
}

/** GET /availability */
export async function getAvailability(ctx) {
  const holdSince = ctx.now - ctx.cfg.holdMinutes * 60 * 1000;
  const out = {};
  for (const tier of TIERS) {
    let available = false;
    if (salesConfigured(ctx.cfg, tier) && ctx.cfg.max[tier] > 0) {
      const used = await db.countOccupied(ctx.db, { tier, now: ctx.now, holdSince });
      available = used < ctx.cfg.max[tier];
    }
    out[tier] = { available };
  }
  return out;
}

async function planAmount(ctx, tier) {
  const fixed = ctx.cfg.priceCents[tier];
  if (fixed > 0) return fixed;
  const code = ctx.cfg.plans[tier];
  const cached = ctx.planCache.get(code);
  if (cached && ctx.now - cached.at < PLAN_CACHE_MS) return cached.amount;
  const plan = await ctx.paystack.getPlan(code);
  const amount = Number(plan?.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('plan has no amount');
  ctx.planCache.set(code, { amount, at: ctx.now });
  return amount;
}

async function enforceRateLimits(ctx, request, email) {
  const since = ctx.now - HOUR_MS;
  const ipHash = await hashIp(clientIp(request), ctx.cfg.ipSalt);
  const [byEmail, byIp, total] = await Promise.all([
    db.countRecentByEmail(ctx.db, email, since),
    ipHash ? db.countRecentByIp(ctx.db, ipHash, since) : 0,
    db.countRecentSignups(ctx.db, since),
  ]);
  const { emailPerHour, ipPerHour, globalPerHour } = ctx.cfg.rate;
  if (byEmail >= emailPerHour || byIp >= ipPerHour || total >= globalPerHour) {
    ctx.log('warn', 'rate_limited', { byEmail, byIp, total });
    throw new HttpError(429, 'rate_limited', {});
  }
  return ipHash;
}

/** POST /subscribe — validate, moderate, reserve, then hand over to Paystack checkout. */
export async function subscribe(request, ctx) {
  const { cfg } = ctx;
  const origin = request.headers.get('Origin');
  if (origin && !isOriginAllowed(origin, cfg.allowedOrigins)) throw new HttpError(403, 'forbidden_origin');

  const input = validateSubscribe(await readJsonObject(request));
  if (!salesConfigured(cfg, input.tier) || cfg.max[input.tier] <= 0) throw new HttpError(503, 'sales_disabled');

  const ipHash = await enforceRateLimits(ctx, request, input.email);
  const fullCode = input.tier === 'premium' ? 'premium_taken' : 'block_full';
  const holdSince = ctx.now - cfg.holdMinutes * 60 * 1000;
  const used = await db.countOccupied(ctx.db, { tier: input.tier, now: ctx.now, holdSince, exceptEmail: input.email });
  if (used >= cfg.max[input.tier]) throw new HttpError(409, fullCode);

  let amount;
  try {
    amount = await planAmount(ctx, input.tier);
  } catch (err) {
    ctx.log('error', 'plan_lookup_failed', { tier: input.tier, code: err?.code || 'error' });
    throw new HttpError(502, 'payment_init_failed');
  }

  const id = newSponsorId();
  const reference = newReference();
  const inserted = await db.insertPendingSponsor(ctx.db, {
    id,
    tier: input.tier,
    name: input.name,
    tagline: input.tagline,
    url: input.url,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    approved: cfg.autoApprove ? 1 : 0,
    planCode: cfg.plans[input.tier],
    reference,
    now: ctx.now,
  }, { termsVersion: input.termsVersion, privacyVersion: input.privacyVersion, ipHash },
  { max: cfg.max[input.tier], holdSince });
  if (!inserted) throw new HttpError(409, fullCode);
  ctx.invalidate();

  let init;
  try {
    init = await ctx.paystack.initialize({
      email: input.email,
      amount,
      plan: cfg.plans[input.tier],
      callbackUrl: `${cfg.siteUrl}adverteer.html?sponsor=${encodeURIComponent(id)}`,
      reference,
      metadata: {
        sponsorId: id,
        tier: input.tier,
        cancel_action: `${cfg.siteUrl}adverteer.html`,
        custom_fields: [
          { display_name: 'Borg', variable_name: 'sponsor_name', value: input.name },
          { display_name: 'Pakket', variable_name: 'tier', value: input.tier },
        ],
      },
    });
  } catch (err) {
    await db.markAbandoned(ctx.db, id, `init_failed:${err?.code || 'error'}`, ctx.now);
    ctx.invalidate();
    ctx.log('error', 'paystack_init_failed', { code: err?.code || 'error', status: err?.status || 0 });
    throw new HttpError(502, 'payment_init_failed');
  }

  ctx.log('info', 'subscribe', { sponsorId: id, tier: input.tier, nameFixed: input.nameFixed });
  return json(200, {
    url: init.authorizationUrl,
    reference,
    sponsorId: id,
    name: input.name,
    needsApproval: !cfg.autoApprove,
  });
}

function publicStatus(sponsor, now, failed) {
  if (sponsor.status === 'pending') return failed ? 'failed' : 'pending';
  if (sponsor.status === 'abandoned') return 'failed';
  if ((sponsor.status === 'active' || sponsor.status === 'cancelling') && sponsor.paid_until > now) return 'active';
  return 'ended';
}

/** GET /status?sponsor=&reference= — the checkout callback asks whether the payment went through. */
export async function status(url, ctx) {
  const id = url.searchParams.get('sponsor');
  const reference = url.searchParams.get('reference') || url.searchParams.get('trxref');
  if (!isUuid(id) || !isReference(reference)) throw new HttpError(400, 'bad_request');

  let sponsor = await db.getSponsor(ctx.db, id);
  // Same answer for "no such sponsor" and "wrong reference" so ids can't be probed.
  if (!sponsor || !sponsor.init_reference || !(await safeEqual(reference, sponsor.init_reference))) {
    throw new HttpError(404, 'not_found');
  }

  let failed = false;
  const waiting = sponsor.status === 'pending' || sponsor.status === 'abandoned';
  const throttled = Number.isFinite(sponsor.last_verify_at) && ctx.now - sponsor.last_verify_at < VERIFY_THROTTLE_MS;
  if (waiting && !throttled && ctx.cfg.paystackSecret) {
    await db.setLastVerify(ctx.db, id, ctx.now);
    try {
      const tx = await ctx.paystack.verify(reference);
      const meta = parseMetadata(tx?.metadata);
      const sameTx = (!tx?.reference || tx.reference === reference) && (!meta.sponsorId || meta.sponsorId === id);
      if (sameTx && tx?.status === 'success') {
        const r = await applyCharge(ctx, sponsor, {
          reference,
          amount: Number(tx.amount),
          currency: tx.currency || null,
          paidAt: parseTime(tx.paid_at ?? tx.paidAt ?? tx.transaction_date, ctx.now),
          planCode: planCodeOf(tx),
          customerCode: typeof tx.customer?.customer_code === 'string' ? tx.customer.customer_code : null,
          // We generated this reference for this sponsor, so the link is as strong as our metadata.
          matchedBy: 'metadata',
          source: 'verify',
          domain: tx.domain,
        });
        if (r.sponsor) sponsor = r.sponsor;
        ctx.invalidate();
      } else if (sameTx && (tx?.status === 'failed' || tx?.status === 'reversed')) {
        failed = true;
      }
    } catch (err) {
      ctx.log('warn', 'verify_failed', { code: err?.code || 'error' });
    }
  }

  const live = isLive(sponsor, ctx.now);
  const first = live ? await db.firstPaymentAt(ctx.db, id) : null;
  // Paid while the tier filled up: the page explains that the money comes back.
  const taken = sponsor.status === 'ended' && (await db.hasAlert(ctx.db, id, 'slot_taken'));
  return json(200, {
    status: taken ? 'taken' : publicStatus(sponsor, ctx.now, failed),
    tier: sponsor.tier,
    name: sponsor.name,
    needsApproval: Number(sponsor.approved) !== 1,
    liveFrom: live ? iso(Number.isFinite(first) ? first : ctx.now) : null,
    paidUntil: iso(sponsor.paid_until),
  });
}
