// Applying Paystack facts to sponsors. Shared by the webhook and by GET /status (verify),
// so both paths go through the exact same idempotent code.

import * as db from './db.js';
import { chargeProblem, statusAfterCharge } from './entitlement.js';

/** Paystack sends metadata as an object, a JSON string, or 0/"" when empty. */
export function parseMetadata(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Plan code from a webhook (`plan` object), a verify response (`plan` string + `plan_object`) or an invoice. */
export function planCodeOf(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.plan === 'string' && data.plan.startsWith('PLN_')) return data.plan;
  for (const p of [data.plan, data.plan_object, data.subscription?.plan]) {
    if (p && typeof p === 'object' && typeof p.plan_code === 'string' && p.plan_code) return p.plan_code;
  }
  return null;
}

export function subscriptionCodeOf(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.subscription_code === 'string' && data.subscription_code) return data.subscription_code;
  const s = data.subscription;
  if (typeof s === 'string' && s.startsWith('SUB_')) return s;
  if (s && typeof s === 'object' && typeof s.subscription_code === 'string' && s.subscription_code) return s.subscription_code;
  return null;
}

/** Paystack timestamps are ISO strings; anything unparsable or from the future becomes `now`. */
export function parseTime(value, now) {
  const t = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  if (!Number.isFinite(t) || t <= 0) return now;
  return Math.min(t, now);
}

export function isOurPlan(cfg, planCode) {
  return Boolean(planCode) && Object.values(cfg.plans).includes(planCode);
}

/**
 * Records one successful charge for `sponsor` and recomputes its entitlement.
 * Safe to call any number of times, in any order, for the same reference.
 *
 * @param {object} ctx  { db, cfg, now, log }
 * @param {object} sponsor  sponsors row
 * @param {{ reference: string, amount: number, currency: string|null, paidAt: number, planCode: string|null,
 *           customerCode: string|null, matchedBy: 'metadata'|'subscription'|'customer', source: string }} charge
 * @returns {Promise<{ sponsorId: string, note: string, sponsor?: object }>}
 */
export async function applyCharge(ctx, sponsor, charge) {
  const problem = chargeProblem(ctx.cfg, sponsor, charge);
  if (problem) {
    ctx.log('warn', 'charge_rejected', { sponsorId: sponsor.id, reason: problem, matchedBy: charge.matchedBy });
    return { sponsorId: sponsor.id, note: `rejected:${problem}` };
  }

  let note = 'applied';
  const existing = await db.getPayment(ctx.db, charge.reference);
  if (!existing) {
    await db.insertPayment(ctx.db, {
      reference: charge.reference,
      sponsorId: sponsor.id,
      amount: charge.amount,
      currency: charge.currency ? String(charge.currency).toUpperCase() : 'ZAR',
      paidAt: charge.paidAt,
      source: charge.source,
    });
  } else if (existing.sponsor_id !== sponsor.id) {
    // Only an authoritative match (our metadata or the subscription code) may move a payment
    // that the customer+plan heuristic attached to a sibling sponsorship.
    if (charge.matchedBy === 'customer' && existing.sponsor_id) {
      return { sponsorId: existing.sponsor_id, note: 'duplicate' };
    }
    await db.reassignPayment(ctx.db, charge.reference, sponsor.id);
    if (existing.sponsor_id) {
      await db.refreshEntitlement(ctx.db, existing.sponsor_id, { graceDays: ctx.cfg.graceDays, now: ctx.now });
    }
    note = 'reassigned';
  } else {
    note = 'duplicate';
  }

  const nextStatus = statusAfterCharge(sponsor.status);
  if (sponsor.status === 'ended') {
    // Money arrived for a sponsorship that was already ended (late webhook or the owner ended it
    // without cancelling at Paystack). Keep it ended and flag it for the owner to refund or revive.
    ctx.log('warn', 'charge_on_ended', { sponsorId: sponsor.id });
    if (note === 'applied') note = 'applied_to_ended';
  }
  const updated = await db.refreshEntitlement(ctx.db, sponsor.id, {
    graceDays: ctx.cfg.graceDays,
    now: ctx.now,
    status: nextStatus !== sponsor.status ? nextStatus : null,
    customerCode: charge.customerCode || null,
  });

  if (!updated.paystack_subscription) await adoptMisassignedSubscription(ctx, updated);
  return { sponsorId: sponsor.id, note, sponsor: updated };
}

/**
 * Out-of-order repair: if subscription.create was matched (by e-mail) to a never-paid sibling
 * checkout before this charge arrived, move the subscription to the sponsor that actually paid.
 */
async function adoptMisassignedSubscription(ctx, sponsor) {
  const sibling = await db.findMisassignedSubscription(ctx.db, sponsor);
  if (!sibling) return;
  await db.moveSubscription(ctx.db, sibling, sponsor, ctx.now);
  ctx.log('info', 'subscription_moved', { from: sibling.id, to: sponsor.id });
}

/** Finds the sponsor a charge belongs to: our metadata, then subscription code, then customer + plan. */
export async function matchCharge(ctx, data) {
  const meta = parseMetadata(data.metadata);
  const planCode = planCodeOf(data);
  const customerCode = typeof data.customer?.customer_code === 'string' ? data.customer.customer_code : null;

  if (typeof meta.sponsorId === 'string' && meta.sponsorId.length <= 64) {
    const s = await db.getSponsor(ctx.db, meta.sponsorId);
    if (s) return { sponsor: s, matchedBy: 'metadata', planCode, customerCode };
  }
  const subCode = subscriptionCodeOf(data);
  if (subCode) {
    const s = await db.findBySubscription(ctx.db, subCode);
    if (s) return { sponsor: s, matchedBy: 'subscription', planCode, customerCode };
  }
  if (customerCode && planCode) {
    const s = await db.findByCustomerPlan(ctx.db, customerCode, planCode);
    if (s) return { sponsor: s, matchedBy: 'customer', planCode, customerCode };
  }
  const related = Boolean(meta.sponsorId) || isOurPlan(ctx.cfg, planCode);
  return { sponsor: null, related, planCode, customerCode };
}
