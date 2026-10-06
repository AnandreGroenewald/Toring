-- Stapel sponsorships ("Borge") — Cloudflare D1 schema.
-- Apply with: npx wrangler d1 execute stapel-borge --remote --file=./schema.sql
-- Safe to re-run: every statement is IF NOT EXISTS.
-- All times are Unix epoch milliseconds (UTC).

CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('block', 'premium')),
  name TEXT NOT NULL,
  tagline TEXT,
  url TEXT,
  contact_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  -- pending (awaiting first payment) | active | cancelling (live until paid_until) | ended | abandoned
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'cancelling', 'ended', 'abandoned')),
  approved INTEGER NOT NULL CHECK (approved IN (0, 1)),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1)),
  paystack_customer TEXT,
  paystack_subscription TEXT,
  paystack_email_token TEXT,
  plan_code TEXT,
  init_reference TEXT,
  -- Effective end of the paid period. Recomputed from `payments` on every charge:
  -- max(end of the month chain bought by the payments + grace, admin_until).
  paid_until INTEGER,
  -- Date set by the admin (manual deals, goodwill extensions). Acts as a minimum.
  admin_until INTEGER,
  -- Throttles Paystack verify calls made by GET /status.
  last_verify_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_sponsors_email ON sponsors (email);
CREATE INDEX IF NOT EXISTS idx_sponsors_customer ON sponsors (paystack_customer);
CREATE INDEX IF NOT EXISTS idx_sponsors_subscription ON sponsors (paystack_subscription);
CREATE INDEX IF NOT EXISTS idx_sponsors_status ON sponsors (status, tier, paid_until);
CREATE INDEX IF NOT EXISTS idx_sponsors_created ON sponsors (created_at);

-- One row per successful Paystack charge (kept for accounting; never pruned).
CREATE TABLE IF NOT EXISTS payments (
  reference TEXT PRIMARY KEY,
  sponsor_id TEXT,
  amount INTEGER,
  currency TEXT,
  paid_at INTEGER,
  source TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_sponsor ON payments (sponsor_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments (paid_at);

-- Webhook log + dedupe. id = sha256(event type + identifying fields).
-- payload is a redacted copy (no card details), pruned after 90 days.
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  received_at INTEGER,
  handled INTEGER,
  payload TEXT,
  sponsor_id TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_received ON webhook_events (received_at);

-- Proof that the sponsor accepted the terms and privacy policy (POPIA / ECT Act).
CREATE TABLE IF NOT EXISTS consents (
  sponsor_id TEXT,
  terms_version TEXT,
  privacy_version TEXT,
  accepted_at INTEGER,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_consents_sponsor ON consents (sponsor_id);
CREATE INDEX IF NOT EXISTS idx_consents_ip ON consents (ip_hash, accepted_at);

-- Anonymous audience counts (POST /stats). One row per day, metric and sponsor; only totals,
-- never anything about a person or a device. sponsor_id is '' for metrics that belong to nobody.
-- metric: games_daily | games_practice | block_shows | billboard_games | menu_views
-- Rows older than 13 months are deleted by the daily housekeeping.
CREATE TABLE IF NOT EXISTS stats_daily (
  date_key TEXT NOT NULL,
  metric TEXT NOT NULL,
  sponsor_id TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date_key, metric, sponsor_id)
);

-- Histogram of the Daaglikse Toring results (POST /score): one counter per day and 0.5 m bucket.
-- No player, device or time of day is stored, only "this many results landed in this bucket".
CREATE TABLE IF NOT EXISTS daily_scores (
  date_key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date_key, bucket)
);
