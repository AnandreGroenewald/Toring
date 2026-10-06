// Owner-only endpoints (Authorization: Bearer <ADMIN_TOKEN>). Used by admin.html.

import * as db from './db.js';
import { TIERS } from './config.js';
import { newSponsorId, safeEqual } from './crypto.js';
import { isLive } from './entitlement.js';
import { HttpError, json, readJsonObject } from './http.js';
import { isUuid, validateAdminFields } from './validate.js';

export async function requireAdmin(request, cfg) {
  if (!cfg.adminToken) throw new HttpError(503, 'admin_disabled');
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  // Always run the comparison so a missing header takes as long as a wrong one.
  const ok = await safeEqual(match ? match[1] : '', cfg.adminToken);
  if (!match || !ok) throw new HttpError(401, 'unauthorized');
}

function withLive(s, now) {
  return { ...s, live: isLive(s, now) };
}

function intParam(url, name, fallback, max) {
  const n = Number.parseInt(url.searchParams.get(name) ?? '', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

async function loadSponsor(ctx, id) {
  if (!isUuid(id)) throw new HttpError(404, 'not_found');
  const s = await db.getSponsor(ctx.db, id);
  if (!s) throw new HttpError(404, 'not_found');
  return s;
}

/** GET /admin/sponsors */
export async function listSponsors(ctx) {
  const sponsors = (await db.listSponsors(ctx.db)).map((s) => withLive(s, ctx.now));
  return json(200, { sponsors, now: ctx.now });
}

/** POST /admin/sponsors — a manual deal (quote/EFT) with an explicit end date. */
export async function createSponsor(request, ctx) {
  const body = await readJsonObject(request, 16 * 1024);
  if (!TIERS.includes(body.tier)) throw new HttpError(400, 'invalid_tier', { field: 'tier' });
  const f = validateAdminFields(body, { tier: body.tier, partial: false });
  if (f.admin_until === null) throw new HttpError(400, 'invalid_field', { field: 'paid_until' });
  const id = newSponsorId();
  await db.insertManualSponsor(ctx.db, {
    id,
    tier: body.tier,
    name: f.name,
    tagline: f.tagline ?? null,
    url: f.url ?? null,
    contactName: f.contact_name ?? null,
    email: f.email ?? '',
    phone: f.phone ?? null,
    approved: f.approved ?? 1,
    paidUntil: f.admin_until,
    notes: f.notes ?? null,
    now: ctx.now,
  });
  if (f.hidden === 1) await db.updateSponsorFields(ctx.db, id, { hidden: 1 }, ctx.now);
  ctx.invalidate();
  ctx.log('info', 'admin_create', { sponsorId: id, tier: body.tier });
  return json(201, { sponsor: withLive(await db.getSponsor(ctx.db, id), ctx.now) });
}

/** PATCH /admin/sponsors/:id */
export async function updateSponsor(request, ctx, id) {
  const sponsor = await loadSponsor(ctx, id);
  const body = await readJsonObject(request, 16 * 1024);
  const f = validateAdminFields(body, { tier: sponsor.tier, partial: true });
  if (Object.keys(f).length === 0) throw new HttpError(400, 'invalid_field');
  await db.updateSponsorFields(ctx.db, id, f, ctx.now);
  // paid_until is derived: payments + grace, with the admin date as a minimum.
  if (Object.prototype.hasOwnProperty.call(f, 'admin_until')) {
    await db.refreshEntitlement(ctx.db, id, { graceDays: ctx.cfg.graceDays, now: ctx.now });
  }
  ctx.invalidate();
  ctx.log('info', 'admin_update', { sponsorId: id, fields: Object.keys(f) });
  return json(200, { sponsor: withLive(await db.getSponsor(ctx.db, id), ctx.now) });
}

/** DELETE /admin/sponsors/:id — refuses while Paystack would keep billing, unless ?force=1. */
export async function deleteSponsor(url, ctx, id) {
  const sponsor = await loadSponsor(ctx, id);
  // An active subscription would keep charging a sponsor we no longer show.
  const billing = Boolean(sponsor.paystack_subscription) && sponsor.status === 'active';
  if (billing && url.searchParams.get('force') !== '1') {
    throw new HttpError(409, 'cancel_first');
  }
  await db.deleteSponsor(ctx.db, id);
  ctx.invalidate();
  ctx.log('info', 'admin_delete', { sponsorId: id });
  return json(200, { ok: true });
}

async function emailToken(ctx, sponsor) {
  if (sponsor.paystack_email_token) return sponsor.paystack_email_token;
  const sub = await ctx.paystack.getSubscription(sponsor.paystack_subscription);
  return typeof sub?.email_token === 'string' ? sub.email_token : null;
}

function paystackFailure(ctx, err, what) {
  ctx.log('error', what, { code: err?.code || 'error', status: err?.status || 0 });
  return new HttpError(502, 'paystack_error', { detail: err?.code || 'error' });
}

/**
 * POST /admin/sponsors/:id/cancel { immediate?: boolean }
 * Stops future billing at Paystack. By default the sponsor stays live until paid_until
 * (the terms promise the paid month); immediate=true ends it now (e.g. a content breach).
 */
export async function cancelSponsor(request, ctx, id) {
  const sponsor = await loadSponsor(ctx, id);
  let immediate = false;
  if ((request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    const body = await readJsonObject(request, 4 * 1024);
    immediate = body.immediate === true;
  }
  if (sponsor.paystack_subscription) {
    try {
      const token = await emailToken(ctx, sponsor);
      if (!token) throw Object.assign(new Error('no token'), { code: 'no_email_token' });
      await ctx.paystack.disableSubscription(sponsor.paystack_subscription, token);
    } catch (err) {
      // Already disabled at Paystack is fine; anything else must not look like success.
      if (!(err?.code === 'rejected' && /already|inactive|not active/i.test(err.message || ''))) {
        throw paystackFailure(ctx, err, 'paystack_disable_failed');
      }
    }
  }
  const stillPaid = Number.isFinite(sponsor.paid_until) && sponsor.paid_until > ctx.now;
  const next = immediate || !stillPaid ? 'ended' : 'cancelling';
  if (sponsor.status !== 'ended' && sponsor.status !== next) await db.setStatus(ctx.db, id, next, ctx.now);
  ctx.invalidate();
  ctx.log('info', 'admin_cancel', { sponsorId: id, status: next });
  return json(200, { ok: true, sponsor: withLive(await db.getSponsor(ctx.db, id), ctx.now) });
}

/** POST /admin/sponsors/:id/manage-link — Paystack page where the sponsor updates their card or cancels. */
export async function manageLink(ctx, id) {
  const sponsor = await loadSponsor(ctx, id);
  if (!sponsor.paystack_subscription) throw new HttpError(409, 'no_subscription');
  try {
    return json(200, { link: await ctx.paystack.manageLink(sponsor.paystack_subscription) });
  } catch (err) {
    throw paystackFailure(ctx, err, 'paystack_manage_link_failed');
  }
}

/** GET /admin/payments?limit= */
export async function listPayments(url, ctx) {
  return json(200, { payments: await db.listPayments(ctx.db, intParam(url, 'limit', 200, 1000)) });
}

/** GET /admin/events?limit= */
export async function listEvents(url, ctx) {
  const events = (await db.listEvents(ctx.db, intParam(url, 'limit', 50, 200))).map((e) => {
    let payload = null;
    try {
      payload = e.payload ? JSON.parse(e.payload) : null;
    } catch {
      payload = null;
    }
    return { ...e, payload };
  });
  return json(200, { events });
}
