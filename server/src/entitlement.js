// The entitlement rule — the single source of truth for who is shown in the game.
//
// A sponsor is live iff status IN ('active','cancelling') AND approved = 1 AND hidden = 0
// AND paid_until > now.
//
// Each successful charge buys one calendar month: a renewal that arrives before the paid
// period (plus grace) ends extends it by one more month counted from the first charge of the chain (so
// 31 Jan -> 28 Feb -> 31 Mar, never drifting to the 28th); a charge after a lapse starts a new
// chain at the charge time. paid_until = end of that chain + GRACE_DAYS. Refunded, disputed
// and (with a live key) test-mode payments are left out before this runs (db.js). Computing it from the
// stored payments (instead of incrementing) makes it order-independent and idempotent:
// duplicate or out-of-order webhooks always produce the same answer, and the grace buffer
// is added once instead of piling up every month.

export const DAY_MS = 24 * 60 * 60 * 1000;

export const LIVE_STATUSES = ['active', 'cancelling'];

/** Adds calendar months in UTC, clamping to the last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsUTC(ms, months) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const targetY = y + Math.floor(m / 12);
  const targetM = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
  return Date.UTC(
    targetY, targetM, Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds(),
  );
}

/**
 * @param {number[]} paidAts  charge times (ms) of every payment for the sponsor
 * @param {{ graceDays: number, adminUntil?: number|null }} opts
 * @returns {number|null}
 */
export function computePaidUntil(paidAts, { graceDays, adminUntil = null }) {
  let end = null;
  let anchor = null;
  let months = 0;
  for (const t of [...paidAts].filter(Number.isFinite).sort((a, b) => a - b)) {
    // A renewal that lands a little late (still inside the grace days) belongs to the same
    // billing cycle; only a charge after a real lapse starts a new chain.
    if (end === null || t > end + graceDays * DAY_MS) {
      anchor = t;
      months = 1;
    } else {
      months += 1;
    }
    end = addMonthsUTC(anchor, months);
  }
  const fromPayments = end === null ? null : end + graceDays * DAY_MS;
  if (fromPayments === null) return Number.isFinite(adminUntil) ? adminUntil : null;
  return Number.isFinite(adminUntil) ? Math.max(fromPayments, adminUntil) : fromPayments;
}

export function isLive(sponsor, now) {
  return LIVE_STATUSES.includes(sponsor.status)
    && Number(sponsor.approved) === 1
    && Number(sponsor.hidden) === 0
    && Number.isFinite(sponsor.paid_until)
    && sponsor.paid_until > now;
}

/** Status after a successful charge. Never resurrects an ended sponsor (a late duplicate must not undo a cancel). */
export function statusAfterCharge(status) {
  return status === 'pending' || status === 'abandoned' ? 'active' : status;
}

/** Status after Paystack says the subscription won't renew. */
export function statusAfterNotRenew(status) {
  return status === 'pending' || status === 'active' || status === 'abandoned' ? 'cancelling' : status;
}

/**
 * Status after Paystack disables the subscription. Billing has stopped, but the month that
 * was paid for (plus the grace days) is honoured, as the terms promise for a cancellation
 * and a failed renewal alike: it runs out at paid_until. Removing an ad at once (a breach)
 * is the owner's call on the admin page (hide, or cancel with "immediate").
 */
export function statusAfterDisable(sponsor, now) {
  const paid = Number.isFinite(sponsor.paid_until) && sponsor.paid_until > now;
  if (paid && (sponsor.status === 'cancelling' || sponsor.status === 'active')) return 'cancelling';
  return 'ended';
}

/**
 * Why a charge must not extend this sponsor, or null if it's fine. Guards against someone
 * paying R1 through Paystack Inline with our public key and a copied sponsorId in metadata.
 */
export function chargeProblem(cfg, sponsor, charge) {
  // Paystack's test cards cost nothing: with a live key, a test-mode charge is never real money.
  if (cfg.paystackMode === 'live' && charge.domain === 'test') return 'test_mode';
  if (charge.currency ? String(charge.currency).toUpperCase() !== 'ZAR' : charge.matchedBy !== 'subscription') {
    return 'currency';
  }
  if (!Number.isFinite(charge.amount) || charge.amount <= 0) return 'amount';
  const allowedPlans = [sponsor.plan_code, cfg.plans[sponsor.tier]].filter(Boolean);
  if (charge.planCode) {
    if (!allowedPlans.includes(charge.planCode)) return 'plan_mismatch';
  } else if (charge.matchedBy !== 'subscription') {
    // Only a renewal tied to a subscription we already recorded may omit the plan.
    return 'no_plan';
  }
  const min = cfg.priceCents[sponsor.tier];
  if (min > 0 && charge.amount < min) return 'amount_too_low';
  return null;
}
