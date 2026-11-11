#!/usr/bin/env bash
# Clean-install test: throwaway Postgres cluster → harness stub → all migrations → seed → pgTAP tests.
# Usage: scripts/test-db.sh [--keep]   (--keep leaves the cluster running for inspection)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT_TEST:-55432}"
DATA="$(mktemp -d /tmp/ppi-pg-XXXXXX)"
LOG="$DATA.log"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then chown postgres "$DATA"; RUN_AS=(runuser -u postgres --); fi

cleanup() { "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$LOG"; }
[ "${1:-}" = "--keep" ] || trap cleanup EXIT

"${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -l "$LOG" -w start >/dev/null
PSQL=("$PGBIN/psql" -h /tmp -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -d postgres -c "create database ppi_test" >/dev/null

apply() { echo "apply  $(basename "$1")"; "${PSQL[@]}" -d ppi_test -f "$1" >/dev/null; }
apply "$ROOT/supabase/tests/_harness/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do apply "$f"; done
for f in "$ROOT"/supabase/seed/*.sql; do [ -e "$f" ] && apply "$f"; done
for f in "$ROOT"/supabase/tests/_harness/1*.sql; do [ -e "$f" ] && apply "$f"; done
"${PSQL[@]}" -d ppi_test -c "create extension if not exists pgtap with schema extensions" >/dev/null

fail=0; total=0; failed_files=()
for t in "$ROOT"/supabase/tests/*.test.sql; do
  [ -e "$t" ] || continue
  out="$("${PSQL[@]}" -d ppi_test -t -A -f "$t" 2>&1)" || { echo "ERROR  $(basename "$t")"; echo "$out" | tail -5; fail=$((fail+1)); failed_files+=("$t"); continue; }
  n_ok=$(grep -c '^ok ' <<<"$out" || true); n_bad=$(grep -c '^not ok ' <<<"$out" || true)
  plan=$(grep -oE '^1\.\.[0-9]+' <<<"$out" | head -1 | cut -d. -f3)
  total=$((total + n_ok + n_bad))
  if [ "$n_bad" -gt 0 ] || [ -z "$plan" ] || [ "$plan" != "$((n_ok + n_bad))" ]; then
    echo "FAIL   $(basename "$t")  ok=$n_ok not_ok=$n_bad plan=${plan:-none}"; grep -A3 '^not ok' <<<"$out" | head -30
    fail=$((fail+1)); failed_files+=("$t")
  else
    echo "PASS   $(basename "$t")  ($n_ok assertions)"
  fi
done
echo "----"
echo "assertions run: $total; failing files: $fail"
[ "${1:-}" = "--keep" ] && echo "cluster kept: psql -h /tmp -p $PORT -U postgres ppi_test   (data: $DATA)"
exit $fail
