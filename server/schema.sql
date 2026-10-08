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

-- Refunds and chargebacks of a charge (Paystack refund.processed / charge.dispute.*).
-- A payment buys nothing once refunds add up to its amount, or while a dispute about it is open
-- or was lost (see db.js ENTITLED_PAYMENTS). Kept for accounting, like `payments`.
-- id: 'refund:<refund id>' or 'dispute:<dispute id>'; reference: payments.reference of the charge.
-- state: refunds 'processed'; disputes 'open' | 'won' | 'lost'.
CREATE TABLE IF NOT EXISTS payment_reversals (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('refund', 'dispute')),
  amount INTEGER,
  state TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reversals_reference ON payment_reversals (reference);

-- Things the owner must act on, shown at the top of admin.html until marked as handled.
-- kind: slot_taken (paid for a full tier: refund) | charge_on_ended (paid after it ended: refund
-- or revive) | dispute (chargeback opened: the ad is stopped). id = kind + ':' + reference.
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  sponsor_id TEXT,
  reference TEXT,
  amount INTEGER,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts (resolved_at, created_at);

-- Die daaglikse ranglys (POST/GET /board, src/board.js): one row per player per day. `player` is a
-- random number made on the phone (linked to nothing else); `name` the Uitdagersreeks nickname (name
-- rules applied); `blocks` and `duration_s` only serve the plausibility check; `hidden` is the player's
-- own choice, `blocked` the owner's (a post can't undo it). Kept 30 days (cron), like the two tables
-- after it: the number of players a day, and how many results each whole metre holds (so a place far
-- below the top is added up without reading every row: D1 counts rows read).
CREATE TABLE IF NOT EXISTS daily_board (
  date_key TEXT NOT NULL,
  player TEXT NOT NULL,
  name TEXT NOT NULL,
  height_dm INTEGER NOT NULL,
  blocks INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (date_key, player)
);

CREATE INDEX IF NOT EXISTS idx_daily_board_rank ON daily_board (date_key, height_dm DESC, created_at, player);

CREATE TABLE IF NOT EXISTS daily_board_days (
  date_key TEXT PRIMARY KEY,
  players INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_board_hist (
  date_key TEXT NOT NULL,
  metre INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date_key, metre)
);
