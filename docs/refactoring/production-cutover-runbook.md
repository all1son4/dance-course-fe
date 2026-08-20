# Production PostgreSQL cutover runbook

Status: `DONE`
Prepared: 2026-08-19

This runbook covers `CUT-01` and `CUT-02`. It does not authorize a production flag
change: all runtime switches remain separate, controlled `CUT-03` operations. The
document preserves the accepted user journeys and does not add Telegram verification
outside the existing Online Group renewal flow.

## Fixed rollback release (`CUT-01`)

The DB-compatible rollback release is production revision
`3b9efddd2fb04316923ae25d4f7972be4ab84db2` (PR
[#20](https://github.com/all1son4/dance-course-fe/pull/20), deployed 2026-08-17,
production deployment `5941899827`). It contains the PostgreSQL inbox/projection,
outbox, DB-only access and business paths, explicit DB reads, and the optional
allowlisted `SuccessfulCustomers` exporter.

The release candidate passed
[push Quality](https://github.com/all1son4/dance-course-fe/actions/runs/32012375011),
[PR Quality](https://github.com/all1son4/dance-course-fe/actions/runs/32012378470), and
[preview critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/32012415426).
The merge revision then deployed successfully through Vercel. Production smoke was
green both immediately after release and after the 2026-08-18 redeployment:
[run 32012634363](https://github.com/all1son4/dance-course-fe/actions/runs/32012634363)
and
[run 32177637994](https://github.com/all1son4/dance-course-fe/actions/runs/32177637994).

This revision is the only default rollback target during CUT. Do not roll back to an
earlier application revision. The rolling draft PR
[#21](https://github.com/all1son4/dance-course-fe/pull/21) is not part of the rollback
release and must not be merged as part of CUT.

## Change freeze and operator

- Production `main` is frozen at the rollback revision above while `CUT-03` switches
  are executed and their immediate checks run. Do not merge unrelated UI, product, or
  schema work into `main` during that interval.
- Work may continue on `dev`, but it is not a cutover release. In particular,
  migration `0017_product_sales_switch` must follow its schema-before-application
  release procedure and must not be bundled into a flag switch.
- The project owner is the production operator. Use one active operator session for
  every environment change; Codex may prepare and evaluate read-only evidence, but it
  does not make a second concurrent production change.
- Record the UTC time, production revision, changed variables, Vercel deployment,
  immediate checks, and next-day checks for every switch.

## Backup and restore evidence

### Protected source snapshot

Fresh production capture:

- capture ID: `production-20260819T164037709Z-12871f9e0166`;
- capture window: `2026-08-19T16:40:37.709Z` to
  `2026-08-19T16:40:42.079Z`;
- encrypted archive SHA-256:
  `2e59a02aedf6ea3d6be2d1c55226f7a26635217ecfe8030d8545be9a55c3e8f9`;
- public-key SHA-256:
  `727e890bb14185efcb4a4d8150de5730653c19793a1ce249de1996ed5fdafa87`;
- encrypted archive, wrapped key, and public manifest are mode `0600` in the ignored
  local `.data-snapshots/production` directory.

The archive contains a PostgreSQL custom dump and a values-only export of all seven
legacy Sheet sources. Its checksums and AES-GCM authentication passed. The archive was
decrypted into a protected temporary directory and its database was restored into a
disposable PostgreSQL 17 cluster with `--exit-on-error`. Aggregate recovery checks
found 17 applied migrations, 21 public tables, 79 purchases, 185 Stripe events, 101
entitlements, 68 tokens, 63 bindings, 149 side-effect records, and zero invalid
indexes. The Sheet export contained the manifest-declared `80/148/64/20/17/5/2` rows.
The disposable cluster, plaintext database dumps, Sheet export, and decrypted archive
were deleted after verification.

### Provider-managed recovery point

The project owner created and visually verified the production Neon snapshot in
**Backup & restore**. The current Free-plan Console does not expose its internal API
ID in the snapshot card or action menu, so the recorded provider reference is the
unique project/branch/name tuple shown by the provider. This is sufficient to locate
the recovery point without weakening the backup requirement.

| Provider | Project             | Branch | Snapshot reference  | Provider state                  | Verified UTC           |
| -------- | ------------------- | ------ | ------------------- | ------------------------------- | ---------------------- |
| Neon     | `dance_course_prod` | `main` | `cut-02-2026-08-19` | 34.42 MB; expiration is `never` | `2026-08-19T16:55:29Z` |

Do not restore or delete this snapshot during CUT. Keep it through at least the
30-day destructive-cleanup boundary.

## Final read-only reconciliation

Two captures taken after the protected snapshot were stable:

| Capture | UTC window                               | Report fingerprint                                                 |
| ------- | ---------------------------------------- | ------------------------------------------------------------------ |
| 1       | `2026-08-19T16:42:35.585Z–16:42:36.720Z` | `55dbae1935b726816bafd4a17b325f3ea60b3c58c1ad67075a153acd848f98b3` |
| 2       | `2026-08-19T16:42:44.830Z–16:42:45.974Z` | `55dbae1935b726816bafd4a17b325f3ea60b3c58c1ad67075a153acd848f98b3` |

The reports were schema v4, values-only, read-only, and marked as containing neither
PII nor secrets. Temporary report files were deleted after aggregate review.

The strict command returns `mismatch`, but every difference is classified:

- PostgreSQL and Sheets contain the same 79 unique Payments keys and the same unique
  fingerprint. All 79 matched payment rows and customer snapshots compare cleanly;
  there are no DB-only, Sheet-only, keyless, or matched-data payment differences.
- Sheets contains one additional occurrence of an otherwise identical succeeded
  August EUR payment (`5,000` minor units). It is a legacy duplicate row, not a second
  sale. Raw Sheet totals therefore show one extra row and EUR 50; canonical unique
  financial data is equal. Preserve the row as migration evidence for now and never
  insert it into PostgreSQL as a second purchase. Gate G6 must continue to surface the
  duplicate explicitly until the owner approves either archival/removal of the legacy
  duplicate or a documented unique-key comparison rule.
- The 37 DB-only Stripe events are 31 accepted settlement-backfill events plus six
  runtime inbox rows: two `payment_intent.created`, two `charge.succeeded`, and two
  `charge.updated`. The worker will safely mark the unsupported `created` events as
  skipped and idempotently apply the four charge settlements. Drain and re-check these
  rows as part of the Stripe switch; do not edit their verified payloads.
- The 48 DB-only Online Group tokens and 46 DB-only active bindings are expected
  DB-native data. All Sheet-active access exists in PostgreSQL, all 23 DB-active
  entitlements are represented by the legacy payment source, and the only two
  DB-active-only issued tokens belong to the DB-native Online Group path.
- The 18 entitlement state differences are newer PostgreSQL lifecycle transitions:
  13 `pending -> activated`, one `pending -> token_issued`, and four
  `token_issued -> activated`. Shared invoices, report runs, campaign leads, catalog
  references, side-effect state, Telegram rows, Stripe rows, and customer snapshots
  have zero matched-row differences.

Production invariant audit passed all 32 invariants. The monthly-report control audit
found zero duplicate database sale events. The operational snapshot had no stale
leases, dead letters, retries, or ready outbox jobs. The six ready inbox rows are the
classified Stripe rows above; pending access rows are existing workflow state rather
than queue failures.

## `CUT-03` preflight and order

Preflight step 1 completed at `2026-08-20T07:45:25Z`:

- production `main` and deployment `5941899827` remain on rollback revision
  `3b9efddd2fb04316923ae25d4f7972be4ab84db2`;
- all 32 production invariants passed;
- queues contain zero dead letters, stale leases, retries, or ready outbox jobs;
- six ready inbox rows are unchanged and match the classified Stripe events above;
- the fresh privacy-safe reconciliation reproduced fingerprint
  `55dbae1935b726816bafd4a17b325f3ea60b3c58c1ad67075a153acd848f98b3`;
- no production runtime flag was changed.

### Scope correction and development-only rehearsal

The owner clarified on 2026-08-20 that runtime switching must remain development-only
and that production must not advance yet. Before that clarification, the four CUT
flags had briefly been applied through successive redeployments of the fixed
`3b9efddd2fb04316923ae25d4f7972be4ab84db2` release. Each deployment, invariant audit,
operational snapshot, reconciliation, and deployment smoke was green. No bounded
Stripe recovery worker was run against production.

The production changes were then fully reversed: all four CUT variables were removed,
the pre-CUT release was rebuilt without them as deployment
`dpl_2WVGsyftfUnVegHxHP6Y49NBMWj1`, and the production alias returned to that READY
deployment. The post-rollback snapshot at `2026-08-20T12:40:30.571Z` still had the
same six classified ready inbox rows, zero ready outbox rows, zero retries, stale
leases, or dead letters, and all 32 invariants passed. Production critical journeys
also passed in
[run 32370031013](https://github.com/all1son4/dance-course-fe/actions/runs/32370031013).
This transient interval is not accepted as production `CUT-03` and does not start a
`CUT-04` observation clock.

The development rehearsal is active only on Vercel Preview deployments whose Git
branch is `dev`. `DB_TELEGRAM_ACCESS_MODE`, `DB_BUSINESS_OPERATIONS_MODE`,
`DB_PAYMENT_EVENTS_MODE`, and `DB_SIDE_EFFECTS_MODE` are branch-scoped to that target;
`DB_SHEETS_EXPORT_MODE` remains unset. Dev revision `6a5369703ed6b5ace185e3181ede2d18094ee6f3`
was rebuilt as Preview deployment `dpl_AqsJ8nxrtgqyDkCgVDh29ZdBBVXA`, returned HTTP
200, and passed all six
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/32370407091).
All 32 development invariants passed.

One bounded development Stripe worker handled the five classified test inbox rows:
one was processed, three were skipped, and one old `charge.succeeded` test event was
left on normal retry because Stripe test mode still reports a pending balance
transaction. A second bounded pass reproduced that classification. There were no
dead letters, provider side effects, ready outbox jobs, or Sheets exports. The
privacy-safe post-worker reconciliation fingerprint is
`6e374054fc2959d77f3320d40c152cd9fe5b8a2c29cec706464567b4413208c3`; its remaining
development differences are the previously classified test history plus that one
retry.

Production step 2 is paused until the owner explicitly authorizes production cutover
again. Do not treat the development rehearsal as permission to change a production
environment variable or deployment.

For each step, make one environment change, wait for the production deployment, run
the named checks, and stop on an unexplained result.

1. Confirm production still runs the fixed rollback revision and no unrelated PR was
   merged. Run `db:operations:status`, the invariant audit, and a fresh reconciliation.
2. Set `DB_TELEGRAM_ACCESS_MODE=database`. Verify a non-production start token and a
   timed join/leave journey, access counts, logs, and reconciliation.
3. Set `DB_BUSINESS_OPERATIONS_MODE=database`. Verify one ordinary admin grant, one
   Online Group grant, one invoice, one report, and one campaign signup/broadcast with
   no duplicate deliveries.
4. Set `DB_PAYMENT_EVENTS_MODE=database` and
   `DB_SIDE_EFFECTS_MODE=database` together. Never deploy a mixed pair. Run bounded
   recovery, confirm the six classified inbox rows drain, then verify payment success,
   pending/failure rendering, money totals, access delivery, inbox/outbox state, and
   provider logs.
5. Keep `DB_SHEETS_EXPORT_MODE` unset/`legacy`/`shadow`. It is the optional one-way
   exporter during the rollback window, not a CUT write flag.

Repeat each critical smoke/reconciliation check the next day as required by `CUT-04`.

## Written rollback checklist

1. Stop the next flag change and record the failing domain, UTC time, deployment, and
   privacy-safe aggregate evidence. Do not make compensating Sheet edits.
2. If no PostgreSQL-only write has been accepted for that domain, its flag may be
   reverted. If this cannot be proved, treat PostgreSQL-only writes as having begun.
3. After any PostgreSQL-only write, keep the domain in database mode and redeploy only
   the fixed DB-compatible rollback revision
   `3b9efddd2fb04316923ae25d4f7972be4ab84db2`, or deploy a forward fix. Never restore
   Google Sheets as an authoritative write source.
4. Keep `DB_PAYMENT_EVENTS_MODE` and `DB_SIDE_EFFECTS_MODE` equal during every deploy.
   Keep the exporter setting unchanged unless its own later retirement procedure is
   being executed.
5. Do not replay or edit verified Stripe payloads. Replay only an explained
   failed/dead-letter durable key using the exact confirmation in
   [`db-operations-runbook.md`](./db-operations-runbook.md).
6. Use provider point-in-time recovery only for confirmed database corruption. Restore
   to a separate branch first, compare aggregates, then promote through the provider
   recovery procedure. Never import a stale Sheet snapshot over PostgreSQL.
7. After rollback or forward fix, run operational status, all invariants,
   reconciliation, the affected critical journey, and production smoke. Record both
   immediate and next-day results before resuming the cutover.

## `CUT-02` exit checklist

- [x] Fixed DB-compatible rollback revision deployed and verified.
- [x] Fresh encrypted DB + Sheets source snapshot captured.
- [x] Fresh encrypted snapshot decrypted and restored successfully.
- [x] Provider-managed production recovery point created and its Console reference
      recorded.
- [x] Two stable final read-only reconciliation captures classified.
- [x] Production invariants, report controls, and queue state reviewed.
- [x] Unrelated production changes frozen.
- [x] One production operator assigned.
- [x] Flag order, immediate checks, and written rollback procedure prepared.

`CUT-02` is complete. No production flag has been changed; runtime switching begins
only as a separate `CUT-03` operation.
