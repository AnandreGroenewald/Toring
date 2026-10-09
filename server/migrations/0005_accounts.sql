-- 1.13: Sign in with Google and the saved progress (src/account.js). Safe to run more than once.
--   ./wr.sh d1 execute stapel-borge --remote --file=./migrations/0005_accounts.sql
-- An account is a number made from the Google account's number with a secret (AUTH_SECRET); the Google
-- number, name, email and photo are never kept. A session keeps only the SHA-256 of its token.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,   -- the save's version: a store must build on the version it read
  save TEXT,                        -- the player's progress as the game sent it (JSON); NULL before the first
  saved INTEGER,                    -- when it was last stored
  last_push TEXT,                   -- the id of the store that made `rev` (account_pushes keeps them all)
  gen TEXT                          -- random, made with the account: tells it from one deleted and made anew
);
CREATE INDEX IF NOT EXISTS idx_accounts_seen ON accounts (seen);

CREATE TABLE IF NOT EXISTS account_sessions (
  hash TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_sessions_account ON account_sessions (account, seen);
CREATE INDEX IF NOT EXISTS idx_account_sessions_seen ON account_sessions (seen);

-- every store's id for 90 days, so a store whose answer was lost and is sent again counts once
CREATE TABLE IF NOT EXISTS account_pushes (
  account TEXT NOT NULL,
  push TEXT NOT NULL,
  rev INTEGER NOT NULL,             -- the version that store made
  at INTEGER NOT NULL,
  PRIMARY KEY (account, push)
);
CREATE INDEX IF NOT EXISTS idx_account_pushes_at ON account_pushes (at);
