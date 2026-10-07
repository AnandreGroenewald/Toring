#!/bin/sh
# Runs wrangler with Stapel's real D1 database id, which stays out of the public repo (the security
# test refuses a committed id). The id lives in ~/.config/stapel/cloudflare.env as D1_DATABASE_ID=...
# usage: ./wr.sh deploy | ./wr.sh d1 execute stapel-borge --remote --file=./schema.sql | ./wr.sh tail
set -eu
cd "$(dirname "$0")"
ENV_FILE="${STAPEL_CF_ENV:-$HOME/.config/stapel/cloudflare.env}"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (D1_DATABASE_ID=...). See README.md section 3." >&2; exit 1; }
D1_DATABASE_ID=$(sed -n 's/^D1_DATABASE_ID=//p' "$ENV_FILE" | head -1)
[ -n "$D1_DATABASE_ID" ] || { echo "D1_DATABASE_ID is empty in $ENV_FILE" >&2; exit 1; }
TMP=".wrangler.local.toml"
trap 'rm -f "$TMP"' EXIT INT TERM
sed "s/REPLACE_WITH_YOUR_D1_DATABASE_ID/$D1_DATABASE_ID/" wrangler.toml > "$TMP"
npx wrangler "$@" --config "$TMP"
