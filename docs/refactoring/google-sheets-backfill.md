# Resumable Google Sheets backfill

Status: implementation ready; controlled environment runs pending
Implemented: 2026-08-11

## Purpose

`DATA-02` copies the six migration-owned legacy record sets from the immutable
`DATA-01` snapshot into PostgreSQL. `SuccessfulCustomers` is deliberately not copied:
it is a derived view of succeeded purchases, not an independent domain.

The command does not change application flags, runtime reads, runtime writes, or user
journeys. Without `--write` it remains read-only.

## Safety model

Write mode requires all of the following:

- the extracted `manifest.json` and `google-sheets.json` from one protected `DATA-01`
  archive;
- private file permissions (`0600`) and a non-symlink regular file for both inputs;
- a matching manifest target and `google-sheets.json` SHA-256;
- `--target=development|production` and exact `--confirmation=backfill-<target>`;
- migration `0014_resumable_data_backfills` already applied to the selected database.

The source schema, all seven Sheet definitions, row counts, capture window, spreadsheet
fingerprint, and source checksum are validated before any database connection is used.
Only the six non-derived stages are written, in dependency order.

One PostgreSQL advisory lock prevents concurrent backfills. The default batch size is
25 source rows and the accepted range is 1–500. Each bounded domain batch and its
checkpoint commit in the same transaction. A failed transaction advances neither data
nor checkpoint; repeating the same command resumes from the stored stage and row.

Rows whose PostgreSQL primary projection is newer than the source row are classified as
conflicts and are not overwritten. Historical duplicate keys and missing required
dependencies are also conflicts rather than arbitrary winner selection.

## Counters

The checkpoint stores PII-free counts for each stage:

- `inserted`: the canonical target key did not exist;
- `updated`: the target existed and was not newer than the source row;
- `skipped`: the source row had no canonical key;
- `conflicts`: the source key was duplicated, a required dependency was absent, or the
  target row was newer than the source row.

The four outcomes are mutually exclusive per stage row. Detailed conflict decisions
belong to `DATA-04`; DATA-02 never prints customer or provider identifiers.

## Controlled run

Decrypt one protected triplet into a newly created private temporary directory, then
extract it there. The exact decrypt command is documented in
[`data-source-snapshots.md`](./data-source-snapshots.md).

```bash
snapshot_workdir="$(mktemp -d /private/tmp/dance-course-backfill.XXXXXX)"
chmod 700 "$snapshot_workdir"
# decrypt source.tar.gz into $snapshot_workdir, then:
tar -xzf "$snapshot_workdir/source.tar.gz" -C "$snapshot_workdir"
chmod 600 "$snapshot_workdir/manifest.json" "$snapshot_workdir/google-sheets.json"
```

Inspect the PII-free plan first:

```bash
npm run db:backfill:sheets -- \
  --target=development \
  --source-dir="$snapshot_workdir"
```

After the target migration and dry-run are accepted, rehearse one committed batch:

```bash
npm run db:backfill:sheets -- \
  --write \
  --target=development \
  --confirmation=backfill-development \
  --source-dir="$snapshot_workdir" \
  --batch-size=25 \
  --max-batches=1
```

Remove `--max-batches=1` and repeat the otherwise identical command to resume through
completion. Repeating it once more must report `already_completed` and make no changes.
Production uses `--target=production` and `--confirmation=backfill-production` with the
production archive only.

The deprecated `--limit=<n>` spelling remains an alias for `--batch-size=<n>` so an old
operator command cannot accidentally create one unbounded transaction.

## Read-only checkpoint inspection

```sql
SELECT
  source_capture_id,
  source_cut_off_at,
  status,
  stage,
  next_row_index,
  batch_size,
  stats,
  updated_at,
  completed_at
FROM data_backfill_runs
ORDER BY created_at DESC;
```

This output contains only capture metadata and aggregate counts. Do not query or copy
source records into an execution log.

## Cleanup and rollback

Delete the entire temporary directory immediately after dry-run/write verification:

```bash
rm -rf "$snapshot_workdir"
```

The encrypted archive and private key remain under the `DATA-01` retention policy.
Application rollback is removal of maintenance code only: the backfill adds no runtime
flag or request-path dependency. Do not delete migrated rows as a rollback; they are
reconciliation evidence for `DATA-03` and `DATA-04`.

## Acceptance evidence

| Target      | Capture | Dry-run | Pause/resume | Replay no-op | Final counts |
| ----------- | ------- | ------- | ------------ | ------------ | ------------ |
| development | pending | pending | pending      | pending      | pending      |
| production  | pending | pending | pending      | pending      | pending      |
