-- 1.12: "Nog 'n kans" (a second Daaglikse Toring try, bought with coins): the board keeps the better of
-- the two and marks the entry, so everyone can see it was a second try.
-- Run ONCE, before the 1.12 Worker goes out (SQLite can't add a column twice):
--   ./wr.sh d1 execute stapel-borge --remote --file=./migrations/0004_board_retry.sql
ALTER TABLE daily_board ADD COLUMN retried INTEGER NOT NULL DEFAULT 0 CHECK (retried IN (0, 1));
