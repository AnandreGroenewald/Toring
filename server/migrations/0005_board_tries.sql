-- 1.12.1: "Nog 'n kans" up to 4 times a day (50, 100, 200, 400 coins): the board counts the tries a player
-- played that day (1-5), so a post for a later try may raise the height and the same one sent again can't.
-- Run ONCE, before the 1.12.1 Worker goes out (SQLite can't add a column twice):
--   ./wr.sh d1 execute stapel-borge --remote --file=./migrations/0005_board_tries.sql
ALTER TABLE daily_board ADD COLUMN tries INTEGER NOT NULL DEFAULT 1 CHECK (tries BETWEEN 1 AND 5);
UPDATE daily_board SET tries = 2 WHERE retried = 1;
