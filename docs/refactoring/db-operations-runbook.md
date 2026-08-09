# DB queue operations runbook

This runbook is intentionally lightweight. It uses aggregate PostgreSQL state and the
existing application/provider logs; it does not introduce a separate monitoring
platform or expose customer payloads.

## Read-only status

Select the intended database environment explicitly, then run:

```bash
DATABASE_ENV=development npm run db:operations:status
```

For production, use `DATABASE_ENV=production` only from the approved operator
environment. The JSON contains counts and ages, never recipients, event payloads,
tokens, customer details, or error messages.

Investigate when any of these conditions persists beyond a normal worker interval:

- `inbox.oldestReadyAgeSeconds` or `outbox.oldestReadyAgeSeconds` keeps increasing;
- `staleLeases` is non-zero after at least one lease duration (two minutes);
- `deadLetters` is non-zero;
- `projection.unlinkedProcessedEvents` increases;
- `projection.waitingSheetsExports` grows during the transitional export period;
- access `linkFailed` or `manualPending` grows without an explained operator task;
- report status totals differ from the expected scheduled runs.

## Retry and replay rules

- Never edit a verified Stripe payload. Provider evidence is immutable.
- A retry must claim the existing inbox/outbox row; do not insert a replacement with a
  new deduplication key.
- Outbox adapters must pass `deduplicationKey` as the provider idempotency key. A retry
  after an uncertain response therefore cannot create another visible delivery.
- A dead-letter replay is a deliberate operator action performed only after the cause
  is understood. Record the row ID, reason, operator, and time in the release log.
- Do not reset attempt counters. They are operational evidence.

## Stale leases

Workers reclaim expired leases atomically with `FOR UPDATE SKIP LOCKED`. Do not clear a
live lease manually. If a lease remains stale after a worker run, first verify that no
old worker revision is still active, then inspect application logs by the row ID.

## Reconciliation and export lag

Use `npm run db:baseline:sheets` and `npm run db:compare:sheets` for detailed controlled
reconciliation. The operational command only reports safe aggregate warning signals.
Until `WRITE-07` is complete, a Sheets export failure is investigated but must not be
allowed to change payment or access state.

## Backup and restore

CI rehearses a logical dump and restore against disposable PostgreSQL on every exact
revision. Before a production cutover, also take the provider-managed backup required
by the DATA/CUT gates and record its identifier; this DB-phase rehearsal does not
replace that production backup.
