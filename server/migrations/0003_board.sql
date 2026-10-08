-- 1.9.2: the daily leaderboard (src/board.js). Safe to run more than once.
-- Apply with: ./wr.sh d1 execute stapel-borge --remote --file=./migrations/0003_board.sql
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
