// Validation of request payloads. Returns cleaned values or throws HttpError with a stable code
// (the sign-up page maps each code to an Afrikaans message).

import { TIERS } from './config.js';
import { HttpError } from './http.js';
import { checkName, checkTagline, checkUrl, normalizeText } from './moderation.js';

const EMAIL = /^[^\s@<>()",;:\\[\]]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const CONTACT_NAME = /^(?:\p{L}|\p{M}|[ .'’-])+$/u;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;
const VERSION = /^[A-Za-z0-9._-]{1,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFERENCE = /^[A-Za-z0-9._=-]{1,100}$/;

function fail(code, field) {
  throw new HttpError(400, code, field ? { field } : {});
}

export function cleanEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function cleanContactName(raw) {
  if (typeof raw !== 'string') return null;
  const v = normalizeText(raw);
  return v.length >= 2 && v.length <= 60 && CONTACT_NAME.test(v) ? v : null;
}

/** Optional; returns '' when absent, null when invalid. */
export function cleanPhone(raw) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return '';
  if (typeof raw !== 'string') return null;
  const v = raw.trim().replace(/\s+/g, ' ');
  const digits = v.replace(/[^0-9]/g, '').length;
  return PHONE.test(v) && digits >= 9 && digits <= 15 ? v : null;
}

export function isUuid(v) {
  return typeof v === 'string' && UUID.test(v);
}

export function isReference(v) {
  return typeof v === 'string' && REFERENCE.test(v);
}

/**
 * POST /subscribe body -> cleaned sponsor fields. Throws HttpError(400, code).
 * Order matters only for which error a multi-problem form sees first.
 */
export function validateSubscribe(body) {
  // Honeypot: a hidden field real people never fill in. Generic error so bots learn nothing.
  if (body.website !== undefined && body.website !== null && String(body.website) !== '') fail('bad_request');

  const tier = body.tier;
  if (!TIERS.includes(tier)) fail('invalid_tier', 'tier');

  if (body.acceptTerms !== true || body.acceptPrivacy !== true
    || !VERSION.test(String(body.termsVersion ?? '')) || !VERSION.test(String(body.privacyVersion ?? ''))) {
    fail('terms_required', 'acceptTerms');
  }

  const name = checkName(body.name);
  if (!name.ok) fail(name.code, 'name');

  let tagline = { value: null };
  let url = { value: null };
  if (tier === 'premium') {
    tagline = checkTagline(body.tagline);
    if (!tagline.ok) fail(tagline.code, 'tagline');
    url = checkUrl(body.url);
    if (!url.ok) fail(url.code, 'url');
  }

  const contactName = cleanContactName(body.contactName);
  if (!contactName) fail('invalid_contact', 'contactName');

  const email = cleanEmail(body.email);
  if (!email) fail('invalid_email', 'email');

  const phone = cleanPhone(body.phone);
  if (phone === null) fail('invalid_phone', 'phone');

  return {
    tier,
    name: name.value,
    nameFixed: name.fixed,
    tagline: tagline.value,
    url: url.value,
    contactName,
    email,
    phone: phone || null,
    termsVersion: String(body.termsVersion),
    privacyVersion: String(body.privacyVersion),
  };
}

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

/**
 * Admin dates: epoch ms, ISO timestamp, or "YYYY-MM-DD" meaning the end of that day in
 * South Africa (UTC+2, no daylight saving). null clears. Returns undefined when invalid.
 */
export function parseAdminDate(raw) {
  if (raw === null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 && raw < 8.64e15 ? Math.round(raw) : undefined;
  if (typeof raw !== 'string') return undefined;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (day) {
    const [y, m, d] = day.slice(1).map(Number);
    const start = Date.UTC(y, m - 1, d);
    const check = new Date(start);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return undefined;
    return start + 24 * 60 * 60 * 1000 - SAST_OFFSET_MS - 1;
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : undefined;
}

function adminBool(raw, field) {
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return 1;
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return 0;
  return fail('invalid_field', field);
}

function adminNotes(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || raw.length > 2000) fail('invalid_field', 'notes');
  return raw.trim() || null;
}

const STATUSES = ['pending', 'active', 'cancelling', 'ended', 'abandoned'];

/**
 * Admin edits. The owner may use reserved words (e.g. their own brand) but formatting
 * rules still apply because the text is drawn on blocks.
 * @param {object} body
 * @param {{ tier: string, partial: boolean }} ctx  partial=false for create (required fields enforced)
 */
export function validateAdminFields(body, { tier, partial }) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('name') || !partial) {
    const r = checkName(body.name, { admin: true });
    if (!r.ok) fail(r.code, 'name');
    out.name = r.value;
  }
  if (has('tagline')) {
    const r = checkTagline(body.tagline, { admin: true });
    if (!r.ok) fail(r.code, 'tagline');
    out.tagline = tier === 'premium' ? r.value : null;
  }
  if (has('url')) {
    const r = checkUrl(body.url, { admin: true });
    if (!r.ok) fail(r.code, 'url');
    out.url = tier === 'premium' ? r.value : null;
  }
  if (has('email')) {
    if (body.email === null || body.email === '') out.email = '';
    else {
      const e = cleanEmail(body.email);
      if (!e) fail('invalid_email', 'email');
      out.email = e;
    }
  }
  const contact = has('contact_name') ? body.contact_name : body.contactName;
  if (has('contact_name') || has('contactName')) {
    if (contact === null || contact === '') out.contact_name = null;
    else {
      const c = cleanContactName(contact);
      if (!c) fail('invalid_contact', 'contact_name');
      out.contact_name = c;
    }
  }
  if (has('phone')) {
    const p = cleanPhone(body.phone);
    if (p === null) fail('invalid_phone', 'phone');
    out.phone = p || null;
  }
  if (has('approved')) out.approved = adminBool(body.approved, 'approved');
  if (has('hidden')) out.hidden = adminBool(body.hidden, 'hidden');
  if (has('notes')) out.notes = adminNotes(body.notes);
  if (has('status')) {
    if (!STATUSES.includes(body.status)) fail('invalid_field', 'status');
    out.status = body.status;
  }
  const untilKey = has('paid_until') ? 'paid_until' : has('paidUntil') ? 'paidUntil' : null;
  if (untilKey) {
    const t = parseAdminDate(body[untilKey]);
    if (t === undefined) fail('invalid_field', 'paid_until');
    out.admin_until = t;
  } else if (!partial) {
    fail('invalid_field', 'paid_until');
  }
  return out;
}
