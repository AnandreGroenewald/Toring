// All SQL lives here. Every statement uses bound parameters — never string-built values.

import { computePaidUntil } from './entitlement.js';

async function rows(stmt) {
  const res = await stmt.all();
  return res.results || [];
}

async function count(stmt) {
  const row = await stmt.first();
  return row ? Number(row.n) : 0;
}

// ---------------------------------------------------------------- sponsors

export function getSponsor(db, id) {
  return db.prepare('SELECT * FROM sponsors WHERE id = ?1').bind(id).first();
}

export function findBySubscription(db, code) {
  return db.prepare('SELECT * FROM sponsors WHERE paystack_subscription = ?1 ORDER BY created_at DESC LIMIT 1')
    .bind(code).first();
}

// Prefer the sponsorship that is running, then the one due soonest.
const STATUS_PRIORITY = `CASE status WHEN 'active' THEN 0 WHEN 'cancelling' THEN 1 WHEN 'pending' THEN 2
  WHEN 'ended' THEN 3 ELSE 4 END`;

/**
 * Renewal without our metadata: same Paystack customer on the same plan.
 * `unlinkedOnly` skips sponsorships already tied to a (different) known subscription.
 */
export function findByCustomerPlan(db, customerCode, planCode, { unlinkedOnly = false } = {}) {
  return db.prepare(`SELECT * FROM sponsors
      WHERE paystack_customer = ?1 AND plan_code = ?2 AND status <> 'abandoned'
        ${unlinkedOnly ? 'AND paystack_subscription IS NULL' : ''}
      ORDER BY ${STATUS_PRIORITY}, COALESCE(paid_until, 0) ASC, created_at ASC LIMIT 1`)
    .bind(customerCode, planCode).first();
}

/**
 * Owner of a new subscription. Normally the charge already stored the customer code; if
 * subscription.create arrives first we fall back to the e-mail the checkout was started with.
 */
export function findSubscriptionOwner(db, { customerCode, email, planCode }) {
  return db.prepare(`SELECT * FROM sponsors
      WHERE paystack_subscription IS NULL AND plan_code = ?1
        AND status IN ('pending', 'active', 'cancelling')
        AND (paystack_customer = ?2 OR (paystack_customer IS NULL AND email = ?3))
      ORDER BY (paystack_customer = ?2) DESC, ${STATUS_PRIORITY}, created_at DESC LIMIT 1`)
    .bind(planCode, customerCode || '', email || '').first();
}

/**
 * A never-paid sibling (double-clicked checkout, same customer/plan) that grabbed this
 * sponsor's subscription because subscription.create arrived before the charge.
 */
export function findMisassignedSubscription(db, sponsor) {
  return db.prepare(`SELECT s.* FROM sponsors s
      WHERE s.id <> ?1 AND s.plan_code = ?2 AND s.paystack_subscription IS NOT NULL
        AND s.status IN ('pending', 'abandoned')
        AND (s.paystack_customer = ?3 OR s.email = ?4)
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.sponsor_id = s.id)
      ORDER BY s.created_at DESC LIMIT 1`)
    .bind(sponsor.id, sponsor.plan_code || '', sponsor.paystack_customer || '', sponsor.email || '').first();
}

export async function moveSubscription(db, from, to, now) {
  await db.batch([
    db.prepare(`UPDATE sponsors SET paystack_subscription = NULL, paystack_email_token = NULL, updated_at = ?2
        WHERE id = ?1`).bind(from.id, now),
    db.prepare(`UPDATE sponsors SET paystack_subscription = ?2, paystack_email_token = COALESCE(?3, paystack_email_token),
        paystack_customer = COALESCE(paystack_customer, ?4), updated_at = ?5 WHERE id = ?1`)
      .bind(to.id, from.paystack_subscription, from.paystack_email_token, from.paystack_customer, now),
  ]);
}

export function setSubscription(db, id, { code, emailToken, customerCode, status, now }) {
  return db.prepare(`UPDATE sponsors SET paystack_subscription = ?2,
        paystack_email_token = COALESCE(?3, paystack_email_token),
        paystack_customer = COALESCE(paystack_customer, ?4),
        status = COALESCE(?5, status), updated_at = ?6
      WHERE id = ?1`)
    .bind(id, code, emailToken ?? null, customerCode ?? null, status ?? null, now).run();
}

export function setStatus(db, id, status, now) {
  return db.prepare('UPDATE sponsors SET status = ?2, updated_at = ?3 WHERE id = ?1').bind(id, status, now).run();
}

export function setLastVerify(db, id, now) {
  return db.prepare('UPDATE sponsors SET last_verify_at = ?2 WHERE id = ?1').bind(id, now).run();
}

/** Recomputes paid_until from the payments (see entitlement.js) and applies a status/customer change. */
export async function refreshEntitlement(db, id, { graceDays, now, status = null, customerCode = null }) {
  const sponsor = await getSponsor(db, id);
  if (!sponsor) return null;
  const paid = await rows(db.prepare('SELECT paid_at FROM payments WHERE sponsor_id = ?1').bind(id));
  const paidUntil = computePaidUntil(paid.map((r) => r.paid_at), { graceDays, adminUntil: sponsor.admin_until });
  await db.prepare(`UPDATE sponsors SET paid_until = ?2, status = COALESCE(?3, status),
        paystack_customer = COALESCE(paystack_customer, ?4), updated_at = ?5 WHERE id = ?1`)
    .bind(id, paidUntil, status, customerCode, now).run();
  return getSponsor(db, id);
}

const LIVE_WHERE = `status IN ('active', 'cancelling') AND approved = 1 AND hidden = 0 AND paid_until > ?1`;

export function listLive(db, now) {
  return rows(db.prepare(`SELECT id, tier, name, tagline, url FROM sponsors WHERE ${LIVE_WHERE} ORDER BY tier, id`)
    .bind(now));
}

// A slot is taken by every paid sponsorship (approved or not, hidden or not — they are paying
// for it) and, for a short while, by a checkout in progress.
const OCCUPIED_WHERE = `tier = ?1 AND (
    (status IN ('active', 'cancelling') AND paid_until > ?2)
    OR (status = 'pending' AND created_at > ?3 AND email <> ?4))`;

export function countOccupied(db, { tier, now, holdSince, exceptEmail = '' }) {
  return count(db.prepare(`SELECT COUNT(*) AS n FROM sponsors WHERE ${OCCUPIED_WHERE}`)
    .bind(tier, now, holdSince, exceptEmail));
}

/**
 * Inserts a pending sponsor + consent atomically, but only if the tier still has room.
 * The capacity check runs inside the INSERT so two simultaneous buyers can't both get the slot.
 * @returns {Promise<boolean>} false when the tier is full
 */
export async function insertPendingSponsor(db, s, consent, { max, holdSince }) {
  const insert = db.prepare(`INSERT INTO sponsors (id, tier, name, tagline, url, contact_name, email, phone,
        status, approved, hidden, manual, plan_code, init_reference, paid_until, created_at, updated_at)
      SELECT ?5, ?1, ?6, ?7, ?8, ?9, ?4, ?10, 'pending', ?11, 0, 0, ?12, ?13, NULL, ?2, ?2
      WHERE (SELECT COUNT(*) FROM sponsors WHERE ${OCCUPIED_WHERE}) < ?14`)
    .bind(s.tier, s.now, holdSince, s.email, s.id, s.name, s.tagline, s.url, s.contactName, s.phone,
      s.approved, s.planCode, s.reference, max);
  const consentStmt = db.prepare(`INSERT INTO consents (sponsor_id, terms_version, privacy_version, accepted_at, ip_hash)
      SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM sponsors WHERE id = ?1)`)
    .bind(s.id, consent.termsVersion, consent.privacyVersion, s.now, consent.ipHash);
  const [res] = await db.batch([insert, consentStmt]);
  return Number(res?.meta?.changes ?? 0) > 0;
}

export function markAbandoned(db, id, note, now) {
  return db.prepare(`UPDATE sponsors SET status = 'abandoned', notes = ?2, updated_at = ?3
      WHERE id = ?1 AND status = 'pending'`).bind(id, note, now).run();
}

export function countRecentByEmail(db, email, since) {
  return count(db.prepare('SELECT COUNT(*) AS n FROM sponsors WHERE email = ?1 AND created_at > ?2').bind(email, since));
}

export function countRecentByIp(db, ipHash, since) {
  return count(db.prepare('SELECT COUNT(*) AS n FROM consents WHERE ip_hash = ?1 AND accepted_at > ?2')
    .bind(ipHash, since));
}

export function countRecentSignups(db, since) {
  return count(db.prepare('SELECT COUNT(*) AS n FROM sponsors WHERE manual = 0 AND created_at > ?1').bind(since));
}

export function firstPaymentAt(db, sponsorId) {
  return db.prepare('SELECT MIN(paid_at) AS t FROM payments WHERE sponsor_id = ?1').bind(sponsorId).first('t');
}

// ---------------------------------------------------------------- payments

export function getPayment(db, reference) {
  return db.prepare('SELECT * FROM payments WHERE reference = ?1').bind(reference).first();
}

/** Inserts a payment once (reference is the primary key). Re-sending the same charge is a no-op. */
export function insertPayment(db, p) {
  return db.prepare(`INSERT INTO payments (reference, sponsor_id, amount, currency, paid_at, source)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(reference) DO NOTHING`)
    .bind(p.reference, p.sponsorId, p.amount, p.currency, p.paidAt, p.source).run();
}

export function reassignPayment(db, reference, sponsorId) {
  return db.prepare('UPDATE payments SET sponsor_id = ?2 WHERE reference = ?1').bind(reference, sponsorId).run();
}

export function listPayments(db, limit) {
  return rows(db.prepare(`SELECT p.reference, p.sponsor_id, p.amount, p.currency, p.paid_at, p.source,
        s.name AS sponsor_name, s.tier AS sponsor_tier
      FROM payments p LEFT JOIN sponsors s ON s.id = p.sponsor_id
      ORDER BY p.paid_at DESC LIMIT ?1`).bind(limit));
}

// ---------------------------------------------------------------- webhook events

export function getEvent(db, id) {
  return db.prepare('SELECT id, handled FROM webhook_events WHERE id = ?1').bind(id).first();
}

export function insertEvent(db, id, type, now) {
  return db.prepare(`INSERT INTO webhook_events (id, type, received_at, handled) VALUES (?1, ?2, ?3, 0)
      ON CONFLICT(id) DO NOTHING`).bind(id, type, now).run();
}

export function finishEvent(db, id, { sponsorId = null, note = null, payload = null }) {
  return db.prepare('UPDATE webhook_events SET handled = 1, sponsor_id = ?2, note = ?3, payload = ?4 WHERE id = ?1')
    .bind(id, sponsorId, note, payload).run();
}

export function listEvents(db, limit) {
  return rows(db.prepare(`SELECT id, type, received_at, handled, sponsor_id, note, payload
      FROM webhook_events ORDER BY received_at DESC LIMIT ?1`).bind(limit));
}

// ---------------------------------------------------------------- admin

export function listSponsors(db) {
  return rows(db.prepare('SELECT * FROM sponsors ORDER BY created_at DESC'));
}

export function insertManualSponsor(db, s) {
  return db.prepare(`INSERT INTO sponsors (id, tier, name, tagline, url, contact_name, email, phone, status,
        approved, hidden, manual, paid_until, admin_until, created_at, updated_at, notes)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, 0, 1, ?10, ?10, ?11, ?11, ?12)`)
    .bind(s.id, s.tier, s.name, s.tagline, s.url, s.contactName, s.email, s.phone, s.approved,
      s.paidUntil, s.now, s.notes).run();
}

const EDITABLE = ['name', 'tagline', 'url', 'contact_name', 'email', 'phone', 'approved', 'hidden', 'status',
  'notes', 'admin_until'];

/** Updates whitelisted columns only (column names never come from the request). */
export function updateSponsorFields(db, id, fields, now) {
  const cols = EDITABLE.filter((c) => Object.prototype.hasOwnProperty.call(fields, c));
  if (!cols.length) return null;
  const sets = cols.map((c, i) => `${c} = ?${i + 3}`).join(', ');
  return db.prepare(`UPDATE sponsors SET ${sets}, updated_at = ?2 WHERE id = ?1`)
    .bind(id, now, ...cols.map((c) => fields[c])).run();
}

export function deleteSponsor(db, id) {
  return db.batch([
    db.prepare('DELETE FROM consents WHERE sponsor_id = ?1').bind(id),
    db.prepare('DELETE FROM sponsors WHERE id = ?1').bind(id),
  ]);
}

// ---------------------------------------------------------------- retention

// ---------------------------------------------------------------- anonymous audience counts

/** Adds to the daily counters. `items`: [{ dateKey, metric, sponsorId, n }]. One atomic batch. */
export async function addStats(db, items) {
  if (!items.length) return;
  const stmt = db.prepare(`INSERT INTO stats_daily (date_key, metric, sponsor_id, count) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (date_key, metric, sponsor_id) DO UPDATE SET count = count + excluded.count`);
  await db.batch(items.map((i) => stmt.bind(i.dateKey, i.metric, i.sponsorId || '', i.n)));
}

/** Rows of stats_daily for the days from..to (inclusive), oldest first. */
export function statsBetween(db, from, to) {
  return rows(db.prepare(`SELECT date_key, metric, sponsor_id, count FROM stats_daily
      WHERE date_key >= ?1 AND date_key <= ?2 ORDER BY date_key, metric, sponsor_id`).bind(from, to));
}

/** Names of sponsors by id (ended ones too, so old reports still say who it was). */
export async function sponsorNames(db, ids) {
  if (!ids.length) return [];
  const marks = ids.map((_, i) => `?${i + 1}`).join(',');
  return rows(db.prepare(`SELECT id, name, tier FROM sponsors WHERE id IN (${marks})`).bind(...ids));
}

const SCORE_SUMMARY = `SELECT COALESCE(SUM(count), 0) AS players,
    COALESCE(SUM(CASE WHEN bucket < ?2 THEN count ELSE 0 END), 0) AS below,
    COALESCE(SUM(CASE WHEN bucket = ?2 THEN count ELSE 0 END), 0) AS same
  FROM daily_scores WHERE date_key = ?1`;

/** Adds one result to the histogram and reads the summary in the same atomic batch. */
export async function addScore(db, dateKey, bucket) {
  const out = await db.batch([
    db.prepare(`INSERT INTO daily_scores (date_key, bucket, count) VALUES (?1, ?2, 1)
        ON CONFLICT (date_key, bucket) DO UPDATE SET count = count + 1`).bind(dateKey, bucket),
    db.prepare(SCORE_SUMMARY).bind(dateKey, bucket),
  ]);
  return summary(out[1]?.results?.[0]);
}

/** { players, below, same } for a bucket without adding anything. */
export async function scoreSummary(db, dateKey, bucket) {
  return summary(await db.prepare(SCORE_SUMMARY).bind(dateKey, bucket).first());
}

function summary(row) {
  return { players: Number(row?.players) || 0, below: Number(row?.below) || 0, same: Number(row?.same) || 0 };
}

export async function runRetentionQueries(db, { now, pendingBefore, scrubBefore, payloadBefore, eventsBefore, statsBefore }) {
  const results = await db.batch([
    db.prepare(`UPDATE sponsors SET status = 'abandoned', updated_at = ?1
        WHERE status = 'pending' AND created_at < ?2`).bind(now, pendingBefore),
    db.prepare(`UPDATE consents SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND sponsor_id IN
        (SELECT id FROM sponsors WHERE status = 'abandoned' AND created_at < ?1)`).bind(scrubBefore),
    db.prepare(`UPDATE sponsors SET contact_name = NULL, email = '', phone = NULL, updated_at = ?1
        WHERE status = 'abandoned' AND created_at < ?2
          AND (email <> '' OR contact_name IS NOT NULL OR phone IS NOT NULL)`).bind(now, scrubBefore),
    // A cancelled sponsorship runs out at paid_until. (NULL paid_until: cancelled before it was
    // ever paid; wait a day in case the first charge is still on its way.)
    db.prepare(`UPDATE sponsors SET status = 'ended', updated_at = ?1
        WHERE status = 'cancelling' AND (paid_until <= ?1 OR (paid_until IS NULL AND updated_at < ?2))`)
      .bind(now, now - 24 * 60 * 60 * 1000),
    db.prepare('UPDATE webhook_events SET payload = NULL WHERE payload IS NOT NULL AND received_at < ?1')
      .bind(payloadBefore),
    db.prepare('DELETE FROM webhook_events WHERE received_at < ?1').bind(eventsBefore),
    db.prepare('DELETE FROM stats_daily WHERE date_key < ?1').bind(statsBefore),
    db.prepare('DELETE FROM daily_scores WHERE date_key < ?1').bind(statsBefore),
  ]);
  const changes = results.map((r) => Number(r?.meta?.changes ?? 0));
  return {
    abandoned: changes[0],
    scrubbed: changes[2],
    ended: changes[3],
    payloadsPruned: changes[4],
    eventsDeleted: changes[5],
    statsDeleted: changes[6] + changes[7],
  };
}
