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

The outbox queue counters include only versioned jobs enqueued by the new repository.
Historical `purchase_side_effects` rows remain reconciliation evidence and are not
eligible for worker claims merely because their legacy status is `pending`.

Investigate when any of these conditions persists beyond a normal worker interval:

- `inbox.oldestReadyAgeSeconds` or `outbox.oldestReadyAgeSeconds` keeps increasing;
- `staleLeases` is non-zero after at least one lease duration (two minutes);
- `deadLetters` is non-zero;
- `projection.unlinkedProcessedEvents` increases;
- `projection.waitingSheetsExports` grows during the transitional export period;
- access `linkFailed` or `manualPending` grows without an explained operator task;
- report status totals differ from the expected scheduled runs.

The asynchronous Stripe path is enabled only when both variables have the same
database value:

```bash
DB_PAYMENT_EVENTS_MODE=database
DB_SIDE_EFFECTS_MODE=database
```

An unset pair keeps the legacy synchronous behavior. A mixed pair fails closed rather
than accepting an event into a partially migrated runtime. Change both variables in
one deployment and verify that no old revision is still receiving webhooks before
interpreting queue age.

In database mode, an immediate bounded worker run is scheduled after the webhook
response. Successful payment-status polling also schedules recovery. The existing
daily maintenance request runs a final bounded recovery pass after its established
access and report tasks. The daily pass is a safety net, not the normal latency path;
the project intentionally does not require a higher-frequency Vercel cron plan.

An operator can run bounded recovery explicitly. The confirmation must exactly match
the selected environment:

```bash
DATABASE_ENV=development \
DB_JOBS_RUN_CONFIRM=development \
npm run db:jobs:run
```

Optional `DB_JOBS_INBOX_LIMIT` and `DB_JOBS_OUTBOX_LIMIT` values are capped at 100.
Use `DATABASE_ENV=production` and `DB_JOBS_RUN_CONFIRM=production` only from the
approved production operator environment. Output is aggregate and contains no event
payloads, recipients, tokens, or provider error messages.

## Telegram access write mode

Timed channel access and legacy bot-start access switch together with:

```bash
DB_TELEGRAM_ACCESS_MODE=database
```

An unset value or `shadow` retains the current synchronous legacy mirror. `database`
makes the access engine fail closed on PostgreSQL errors and removes automatic Sheets
fallback from token, binding, entitlement, membership, identity-reuse, and revocation
operations. Online Group access is already DB-native and is not switched by this flag.
Its Telegram verification remains exclusive to the renewal flow.

Do not enable this variable independently during a normal deploy. It is a controlled
`CUT-03` action after the final backup/reconciliation checklist. Immediately after a
switch, verify access `linkFailed`, pending/manual totals, application errors, and one
known non-production start-token plus timed join/leave journey. Once DB-only access
writes have begun, rollback is only to a release that understands the PostgreSQL
access rows; never restore authority to a stale Sheet mirror.

## Business-operation write mode

Admin grants, invoice allocation, monthly-report delivery, and campaign signup and
delivery switch together with:

```bash
DB_BUSINESS_OPERATIONS_MODE=database
```

An unset value or `shadow` retains the synchronous legacy paths. In `database` mode:

- admin grants create the technical zero-value purchase, primary entitlement, and at
  most one transitional `SuccessfulCustomers` export job atomically;
- invoices use the PostgreSQL monthly sequence and one-invoice-per-purchase lock;
- reports enqueue one exact CSV delivery and use a stable Resend idempotency key;
- campaign leads use the unique campaign/email key, and every recipient is claimed
  and delivered by its own durable Resend job.

Google failure no longer fails these database operations. Ordinary admin links also require
`DB_TELEGRAM_ACCESS_MODE=database`; enable Telegram access first so their downstream
token write cannot return to the legacy facade. Online Group access remains DB-native.

The admin report and broadcast buttons still wait for their bounded delivery attempts
and return the existing result shapes. The daily maintenance request additionally
recovers ready report/campaign jobs. An operator can run the same bounded recovery
without requiring a Stripe secret:

```bash
DATABASE_ENV=development \
DB_BUSINESS_JOBS_RUN_CONFIRM=development \
npm run db:business-jobs:run
```

Optional `DB_BUSINESS_JOBS_LIMIT` is capped at 100. Production requires both values to
name `production`. Output contains aggregate counts only.

The export job is enabled while `DB_SHEETS_EXPORT_MODE` is unset or `shadow`. Setting
it to `database` stops creating new Sheet export jobs and is reserved for the later
export-retirement step. Do not use that value as an admin-write cutover switch.

At `CUT-03`, verify one ordinary and one Online Group admin grant, one invoice, one
report, one signup plus broadcast, their views after the corresponding READ cutover,
and no duplicate invoice, campaign email, report email, entitlement, or export rows.
A rollback must use a DB-compatible release and must not treat the stale Sheet
projection as authoritative.

## Retry and replay rules

- Never edit a verified Stripe payload. Provider evidence is immutable.
- A retry must claim the existing inbox/outbox row; do not insert a replacement with a
  new deduplication key.
- Outbox adapters pass a stable provider idempotency key where the provider supports
  one. Resend email uses the purchase/payment, report-job, or campaign-recipient key.
  Telegram Bot API `sendMessage` does not accept such a key, so the adapter makes one
  network attempt per claim and sends an uncertain response directly to dead-letter
  review rather than risking a duplicate visible alert.
- A dead-letter replay is a deliberate operator action performed only after the cause
  is understood. Record the row ID, reason, operator, and time in the release log.
- Do not reset attempt counters. They are operational evidence.

Replay only a failed or dead-lettered row, using its exact durable key and an exact
confirmation of both queue and key:

```bash
DATABASE_ENV=development \
DB_REPLAY_QUEUE=inbox \
DB_REPLAY_KEY=evt_example \
DB_REPLAY_CONFIRM=inbox:evt_example \
npm run db:jobs:replay

DATABASE_ENV=development \
DB_REPLAY_QUEUE=outbox \
DB_REPLAY_KEY=purchase:example:purchase-email \
DB_REPLAY_CONFIRM=outbox:purchase:example:purchase-email \
npm run db:jobs:replay
```

Replay preserves the attempt counter and returns the same row to `pending`. It does
not run the worker automatically; run the bounded recovery command separately after
the cause has been corrected.

## Stale leases

Workers reclaim expired leases atomically with `FOR UPDATE SKIP LOCKED`. Do not clear a
live lease manually. If a lease remains stale after a worker run, first verify that no
old worker revision is still active, then inspect application logs by the row ID.

## Reconciliation and export lag

Use `npm run db:baseline:sheets` and `npm run db:compare:sheets` for detailed controlled
reconciliation. The operational command only reports safe aggregate warning signals.
Until `WRITE-07` is complete, a Sheets export failure is investigated but must not be
allowed to change payment or access state.

After database write mode has accepted events, do not roll back to a release that does
not understand the inbox/outbox workers. Disable only through a DB-compatible release
or deploy a forward fix; immutable inbox rows and versioned outbox jobs must remain
claimable.

The protected source backfill has its own checkpoint and recovery procedure in
[`google-sheets-backfill.md`](./google-sheets-backfill.md). Resume the same source
fingerprint; do not edit `data_backfill_runs` manually or start a second operator run.

## Backup and restore

CI rehearses a logical dump and restore against disposable PostgreSQL on every exact
revision. Before a production cutover, also take the provider-managed backup required
by the DATA/CUT gates and record its identifier; this DB-phase rehearsal does not
replace that production backup.
