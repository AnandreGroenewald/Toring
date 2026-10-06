// POST /paystack/webhook — signature check, dedupe, and the event handlers.
// Every handler is idempotent and tolerant of events arriving out of order or more than once.

import * as db from './db.js';
import { applyCharge, matchCharge, parseTime, planCodeOf, subscriptionCodeOf, isOurPlan } from './billing.js';
import { sha256Hex, verifyPaystackSignature } from './crypto.js';
import { statusAfterDisable, statusAfterNotRenew } from './entitlement.js';
import { HttpError, json, readBody, clientIp } from './http.js';

const MAX_BODY = 512 * 1024;
// Published by Paystack; only enforced when PAYSTACK_IP_ALLOWLIST=true.
export const PAYSTACK_IPS = ['52.31.139.75', '52.49.173.169', '52.214.14.220'];

/** Stable id for dedupe: the same delivery (or a retry) always hashes the same. */
export async function eventId(evt) {
  const d = evt.data || {};
  const parts = [
    evt.event,
    d.id ?? '',
    d.reference ?? d.transaction?.reference ?? '',
    d.invoice_code ?? '',
    subscriptionCodeOf(d) ?? '',
    d.status ?? '',
    d.paid ?? '',
  ];
  return sha256Hex(parts.map(String).join('|'));
}

/** Drops card details and Paystack's internal logs before we store a copy for the admin page. */
export function redactPayload(evt) {
  const copy = JSON.parse(JSON.stringify(evt));
  const d = copy.data || {};
  delete d.authorization;
  delete d.log;
  delete d.fees_split;
  delete d.source;
  if (d.customer) {
    delete d.customer.phone;
    delete d.customer.metadata;
  }
  if (d.subscription && typeof d.subscription === 'object') delete d.subscription.authorization;
  return JSON.stringify(copy).slice(0, 16000);
}

function customerOf(data) {
  return {
    customerCode: typeof data.customer?.customer_code === 'string' ? data.customer.customer_code : null,
    email: typeof data.customer?.email === 'string' ? data.customer.email.trim().toLowerCase() : null,
  };
}

async function onChargeSuccess(ctx, data) {
  if (data.status && data.status !== 'success') return { note: 'not_success', related: false };
  if (typeof data.reference !== 'string' || !data.reference) return { note: 'no_reference', related: false };
  const m = await matchCharge(ctx, data);
  if (!m.sponsor) return { note: 'unmatched', related: m.related };
  const r = await applyCharge(ctx, m.sponsor, {
    reference: data.reference,
    amount: Number(data.amount),
    currency: data.currency || null,
    paidAt: parseTime(data.paid_at ?? data.paidAt ?? data.transaction_date, ctx.now),
    planCode: m.planCode,
    customerCode: m.customerCode,
    matchedBy: m.matchedBy,
    source: 'webhook',
  });
  return { ...r, related: true };
}

/** invoice.update / invoice.create: a paid invoice is a renewal charge we can tie to a subscription. */
async function onInvoice(ctx, data) {
  const reference = data.transaction?.reference;
  const paid = data.paid === true || data.paid === 1 || data.status === 'success';
  if (!paid || typeof reference !== 'string' || !reference) return { note: 'not_paid', related: false };
  if (data.transaction?.status && data.transaction.status !== 'success') return { note: 'not_success', related: false };
  const m = await matchCharge(ctx, { ...data, metadata: null, reference });
  if (!m.sponsor) return { note: 'unmatched', related: m.related };
  const r = await applyCharge(ctx, m.sponsor, {
    reference,
    amount: Number(data.transaction?.amount ?? data.amount),
    currency: data.transaction?.currency || data.currency || null,
    paidAt: parseTime(data.paid_at ?? data.paidAt ?? data.transaction?.paid_at, ctx.now),
    planCode: m.planCode,
    customerCode: m.customerCode,
    matchedBy: m.matchedBy,
    source: 'webhook-invoice',
  });
  return { ...r, related: true };
}

async function onPaymentFailed(ctx, data) {
  const s = await findSubscriptionSponsor(ctx, data);
  // No extension: the sponsorship simply runs out at paid_until unless a retry succeeds.
  return s ? { sponsorId: s.id, note: 'payment_failed', related: true } : { note: 'unmatched', related: false };
}

async function findSubscriptionSponsor(ctx, data) {
  const code = subscriptionCodeOf(data);
  if (code) {
    const s = await db.findBySubscription(ctx.db, code);
    if (s) return s;
  }
  const { customerCode } = customerOf(data);
  const planCode = planCodeOf(data);
  if (customerCode && planCode) return db.findByCustomerPlan(ctx.db, customerCode, planCode);
  return null;
}

async function onSubscriptionCreate(ctx, data) {
  const code = subscriptionCodeOf(data);
  const planCode = planCodeOf(data);
  if (!code) return { note: 'no_subscription_code', related: false };
  const already = await db.findBySubscription(ctx.db, code);
  const emailToken = typeof data.email_token === 'string' ? data.email_token : null;
  const { customerCode, email } = customerOf(data);
  if (already) {
    await db.setSubscription(ctx.db, already.id, { code, emailToken, customerCode, now: ctx.now });
    return { sponsorId: already.id, note: 'duplicate', related: true };
  }
  // The plan must equal the sponsor's stored plan_code (checked in the query), which also
  // covers sponsors still on an older plan after the owner created new ones.
  if (!planCode) return { note: 'no_plan', related: false };
  const owner = await db.findSubscriptionOwner(ctx.db, { customerCode, email, planCode });
  if (!owner) return { note: 'unmatched', related: isOurPlan(ctx.cfg, planCode) };
  await db.setSubscription(ctx.db, owner.id, { code, emailToken, customerCode, now: ctx.now });
  return { sponsorId: owner.id, note: 'subscription_stored', related: true };
}

async function onNotRenew(ctx, data) {
  const s = await findSubscriptionSponsor(ctx, data);
  if (!s) return { note: 'unmatched', related: false };
  const next = statusAfterNotRenew(s.status);
  if (next !== s.status) await db.setStatus(ctx.db, s.id, next, ctx.now);
  return { sponsorId: s.id, note: `status:${next}`, related: true };
}

async function onDisable(ctx, data) {
  const s = await findSubscriptionSponsor(ctx, data);
  if (!s) return { note: 'unmatched', related: false };
  const next = statusAfterDisable(s, ctx.now);
  if (next !== s.status) await db.setStatus(ctx.db, s.id, next, ctx.now);
  return { sponsorId: s.id, note: `status:${next}`, related: true };
}

const HANDLERS = {
  'charge.success': onChargeSuccess,
  'invoice.update': onInvoice,
  'invoice.create': onInvoice,
  'invoice.payment_failed': onPaymentFailed,
  'subscription.create': onSubscriptionCreate,
  'subscription.not_renew': onNotRenew,
  'subscription.disable': onDisable,
};

/**
 * @param {Request} request
 * @param {{ db, cfg, now, log, invalidate }} ctx
 */
export async function handleWebhook(request, ctx) {
  const { cfg } = ctx;
  if (!cfg.paystackSecret) return json(503, { error: 'not_configured' });
  if (cfg.paystackIpAllowlist && !PAYSTACK_IPS.includes(clientIp(request))) {
    return json(401, { error: 'invalid_signature' });
  }
  let raw;
  try {
    raw = await readBody(request, MAX_BODY);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.code });
    throw err;
  }
  const signature = request.headers.get('x-paystack-signature');
  if (!(await verifyPaystackSignature(cfg.paystackSecret, raw, signature))) {
    ctx.log('warn', 'webhook_bad_signature', {});
    return json(401, { error: 'invalid_signature' });
  }

  let evt;
  try {
    evt = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (!evt || typeof evt.event !== 'string' || !evt.data || typeof evt.data !== 'object') {
    return json(200, { ok: true, ignored: true });
  }

  const id = await eventId(evt);
  const seen = await db.getEvent(ctx.db, id);
  if (seen && Number(seen.handled) === 1) return json(200, { ok: true, duplicate: true });
  if (!seen) await db.insertEvent(ctx.db, id, evt.event.slice(0, 64), ctx.now);

  const handler = HANDLERS[evt.event];
  let result;
  try {
    result = handler ? await handler(ctx, evt.data) : { note: 'ignored', related: false };
  } catch (err) {
    // Leave handled = 0 and answer 500 so Paystack retries; handlers are idempotent.
    ctx.log('error', 'webhook_handler_failed', { type: evt.event, message: String(err?.message || err) });
    return json(500, { error: 'server_error' });
  }

  await db.finishEvent(ctx.db, id, {
    sponsorId: result.sponsorId ?? null,
    note: result.note ?? null,
    // Payments for the owner's other products (same Paystack account) aren't ours to keep.
    payload: result.related ? redactPayload(evt) : null,
  });
  if (result.sponsorId) ctx.invalidate();
  ctx.log('info', 'webhook', { type: evt.event, note: result.note, sponsorId: result.sponsorId ?? null });
  return json(200, { ok: true });
}
