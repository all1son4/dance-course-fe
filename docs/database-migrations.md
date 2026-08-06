# Database migration release process

Application builds and database migrations are separate release operations. Vercel
runs `npm run build` and must never apply migrations. Normal development and
production migrations run only through the manually dispatched `Database migration`
GitHub Actions workflow.

## Required GitHub configuration

The `Preview` and `Production` GitHub Environments each require an environment secret
named `DATABASE_URL_UNPOOLED`. Each value must be the direct connection URL for the
matching development or production PostgreSQL database. Do not use a pooled runtime
URL for migrations.

The workflow maps `development` to `Preview` and `production` to `Production`, builds
the requested revision before touching a database, and serializes runs per target.
Development runs are accepted only from `dev`; production runs are accepted only from
the protected `main` branch.
The database runner also takes a PostgreSQL advisory lock, validates that the applied
history is an exact prefix of the committed history, and requires the typed
confirmation `migrate-<target>-<phase>`. Hashes must match except for the single
documented legacy development variant below.

## Expand release

1. Generate and review the Drizzle SQL in a migration-only commit.
2. Add `-- migration-phase: expand` to the new SQL file before it is ever applied.
3. Confirm that both the new and previous application revisions work with the
   expanded schema.
4. Run `Database migration` for `development` with phase `expand` and confirmation
   `migrate-development-expand`.
5. Verify the development application, then repeat for `production` with confirmation
   `migrate-production-expand`.
6. Only after the migration succeeds, deploy code that depends on the new schema.

## Contract release

Contract SQL is a separate migration-only release and must start with
`-- migration-phase: contract`. Run it only after the roadmap's cutover, observation,
rollback, and backup requirements are satisfied. Never mix pending `expand` and
`contract` files in one workflow run. A production contract run requires the exact
confirmation `migrate-production-contract`.

Committed migration files `0000` through `0008` predate this policy and remain
immutable as the legacy baseline. Bootstrapping them into a brand-new disposable
database requires the explicit `MIGRATION_ALLOW_LEGACY_BASELINE=1`; normal
shared-database releases reject a pending legacy baseline.

Development applied a pre-commit variant of `0007_online_group_entitlements` with
hash `e1aed9c07ee57fdb31e584f64724d5d9e3fcb505df125fcb6434904ccb53364c`.
Production and the committed SQL use hash
`a63aee0297fecdc9bd37862c42d7648802b286618537e4ca291282d1ca2df13a`.
The development variant is explicitly accepted because the G0 schema and data checks
already verified its resulting state. No other historical hash mismatch is accepted,
and the applied metadata is not rewritten.

## Local checks

A read-only history and pending-plan check can be run with explicit target and phase:

```bash
MIGRATION_TARGET=development \
MIGRATION_PHASE=expand \
MIGRATION_DATABASE_URL='<direct-development-url>' \
npm run db:migrate:check
```

The controlled runner deliberately ignores the application's `.env` database aliases
and accepts only `MIGRATION_DATABASE_URL`, preventing a local fallback from silently
selecting another environment. Production migrations must use the GitHub workflow.
Disposable integration tests intentionally use their isolated programmatic migrator
instead of the shared-database release runner.
