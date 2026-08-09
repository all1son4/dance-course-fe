#!/usr/bin/env bash

set -euo pipefail

source_database="${POSTGRES_TEST_DATABASE:-dance_course_test}"
database_user="${POSTGRES_TEST_USER:-postgres}"
container_id="${POSTGRES_TEST_CONTAINER_ID:-}"

if [[ -z "${container_id}" ]]; then
  container_id="$(docker ps \
    --filter "ancestor=postgres:17-alpine" \
    --format '{{.ID}}' \
    | head -n 1)"
fi

if [[ -z "${container_id}" ]]; then
  echo "PostgreSQL 17 test container was not found." >&2
  exit 1
fi

run_suffix="${GITHUB_RUN_ID:-local}_${GITHUB_RUN_ATTEMPT:-1}"
restore_database="dance_course_restore_${run_suffix//[^a-zA-Z0-9_]/_}"
dump_path="/tmp/${restore_database}.dump"

cleanup() {
  docker exec "${container_id}" dropdb \
    --if-exists \
    --force \
    --username "${database_user}" \
    "${restore_database}" >/dev/null 2>&1 || true
  docker exec "${container_id}" rm -f "${dump_path}" >/dev/null 2>&1 || true
}

trap cleanup EXIT
cleanup

manifest_query="
  SELECT jsonb_build_object(
    'publicTables', (
      SELECT count(*)
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    ),
    'migrations', (SELECT count(*) FROM drizzle.__drizzle_migrations),
    'purchases', (SELECT count(*) FROM public.purchases),
    'invoices', (SELECT count(*) FROM public.invoices),
    'invoiceSequences', (SELECT count(*) FROM public.invoice_sequences),
    'stripeEvents', (SELECT count(*) FROM public.stripe_events),
    'outboxJobs', (SELECT count(*) FROM public.purchase_side_effects),
    'entitlements', (SELECT count(*) FROM public.access_entitlements)
  )::text;
"

source_manifest="$(docker exec "${container_id}" psql \
  --username "${database_user}" \
  --dbname "${source_database}" \
  --tuples-only \
  --no-align \
  --command "${manifest_query}")"

docker exec "${container_id}" pg_dump \
  --username "${database_user}" \
  --format custom \
  --no-owner \
  --no-acl \
  --file "${dump_path}" \
  "${source_database}"
docker exec "${container_id}" createdb \
  --username "${database_user}" \
  "${restore_database}"
docker exec "${container_id}" pg_restore \
  --username "${database_user}" \
  --dbname "${restore_database}" \
  --exit-on-error \
  --no-owner \
  --no-acl \
  "${dump_path}"

restored_manifest="$(docker exec "${container_id}" psql \
  --username "${database_user}" \
  --dbname "${restore_database}" \
  --tuples-only \
  --no-align \
  --command "${manifest_query}")"

if [[ "${source_manifest}" != "${restored_manifest}" ]]; then
  echo "Backup/restore manifest mismatch." >&2
  echo "Source:   ${source_manifest}" >&2
  echo "Restored: ${restored_manifest}" >&2
  exit 1
fi

echo "Logical backup/restore rehearsal passed: ${restored_manifest}"
