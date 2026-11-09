#!/usr/bin/env bash
# Runs migrations + seed against a throwaway local Postgres (16+) with a stub of Supabase's auth schema,
# then checks totals, RLS and merge_birds. Usage: scripts/test-db.sh   (needs initdb/pg_ctl on PATH or PG_BIN)
set -euo pipefail
PG_BIN=${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DIR=$(mktemp -d)
PORT=${PORT:-55432}
RUN_AS=""
if [ "$(id -u)" = 0 ]; then chown -R postgres "$DIR"; RUN_AS="runuser -u postgres --"; fi
trap '$RUN_AS "$PG_BIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
$RUN_AS "$PG_BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN_AS "$PG_BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL="psql -h $DIR -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"

$PSQL <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth, public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
SQL
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$f"; done
$PSQL -f "$ROOT/supabase/seed.sql"
$PSQL -f "$ROOT/scripts/test-db.sql"
echo "DB tests passed"
