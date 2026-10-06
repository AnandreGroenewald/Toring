// Daily housekeeping (cron trigger): POPIA retention and natural expiry of cancelled sponsorships.

import { runRetentionQueries } from './db.js';
import { DAY_MS } from './entitlement.js';

export const RETENTION = {
  pendingDays: 7, // unpaid checkout -> abandoned
  scrubDays: 30, // abandoned -> contact details removed
  payloadDays: 90, // webhook payload copies removed
  eventDays: 400, // webhook log rows removed (payments are kept for accounting)
};

export function runRetention(database, now) {
  return runRetentionQueries(database, {
    now,
    pendingBefore: now - RETENTION.pendingDays * DAY_MS,
    scrubBefore: now - RETENTION.scrubDays * DAY_MS,
    payloadBefore: now - RETENTION.payloadDays * DAY_MS,
    eventsBefore: now - RETENTION.eventDays * DAY_MS,
  });
}
