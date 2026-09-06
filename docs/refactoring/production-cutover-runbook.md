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

Production step 2 remained paused until the owner explicitly authorized production
cutover on 2026-08-24. The development rehearsal was not treated as permission to
change production before that authorization.

### Production cutover execution — 2026-08-24

PRs 21–23 advanced production to revision
`9594972f30cda1fb464ebed3f74eead4469eb6bc`. Its CI and initial production smoke were
green. The repeated preflight passed all 32 invariants; queues had the same six
classified ready inbox rows, no ready outbox rows, stale leases, dead letters, failed
links, or manual access tasks. Reconciliation showed 80 shared unique Payments and
the same one known duplicate Sheet occurrence; the additional unique Payment since
the protected snapshot was present identically in both sources.

The controlled deployments were:

1. `DB_TELEGRAM_ACCESS_MODE=database` — deployment
   `dpl_Hy9TqktqHUpu5uhVT7V6nVSsYz31`, smoke
   [32677547407](https://github.com/all1son4/dance-course-fe/actions/runs/32677547407);
2. plus `DB_BUSINESS_OPERATIONS_MODE=database` — deployment
   `dpl_HNjw4f3oWUyJ8SycTyR8dChL1jYZ`, smoke
   [32677748397](https://github.com/all1son4/dance-course-fe/actions/runs/32677748397);
3. plus the paired `DB_PAYMENT_EVENTS_MODE=database` and
   `DB_SIDE_EFFECTS_MODE=database` — deployment
   `dpl_7yAXtL2v8BGRTx2WzB23jgv1bLqd`, smoke
   [32678251575](https://github.com/all1son4/dance-course-fe/actions/runs/32678251575).

Every deployment used the same production revision, became READY with the production
aliases, passed all six browser journeys and all 32 invariants, and reproduced the
accepted reconciliation state before the next switch. `DB_SHEETS_EXPORT_MODE`
remained unset. The owner declined manufactured production purchases or deliveries
without safe test accounts and accepted automated evidence plus natural-traffic
verification during `CUT-04`.

The bounded six-row recovery processed the two `charge.updated` events, skipped the
two unsupported `payment_intent.created` events, and emitted no outbox or Sheets
export. Two older `charge.succeeded` events remain on a classified first-attempt retry
because their original balance transactions report pending. Aggregate checks, without
identifiers or payloads, confirm that both are superseded by processed
`charge.updated` events for purchases whose settlement fields are populated. Do not
force, replay, or edit their verified payloads during observation. The post-worker
operational snapshot has two ready inbox rows, no ready outbox, stale leases, dead
letters, failed links, or manual tasks. The final privacy-safe reconciliation
fingerprint is
`bede6f2b5cd50373b64f30aef0b5cde3c8da2ba1c630077dd4fbd9c4eeb4c02f`;
all 80 unique Payment keys and matched data agree, active access is fully accounted
for, and the only financial total delta is the documented duplicate Sheet occurrence.

`CUT-03` is complete. `CUT-04` observation started at
`2026-08-24T00:56:17Z`; repeat the aggregate checks the next day and track the two
classified retry rows without increasing their attempt counters manually.

The same-day independent observation at `2026-08-24T01:12Z` found the final
production deployment READY on all production aliases. Exactly the four CUT runtime
variables remain present in Production and the Sheets exporter remains unset. Pooled
and unpooled health, all 19 migrations, the 12-offer catalog, all 32 invariants, and
all six safe production browser journeys passed. The queues still contain only the
two classified superseded Stripe retries, with no outbox work, dead letters, stale
leases, failed links, manual tasks, or pending Sheets exports. The privacy-safe
reconciliation reproduced fingerprint
`bede6f2b5cd50373b64f30aef0b5cde3c8da2ba1c630077dd4fbd9c4eeb4c02f`.
No natural payment arrived during this short initial interval, so the check does not
replace the required next-day verification. The earliest elapsed checkpoints are
`2026-08-25T00:56:17Z` (next day), `2026-08-31T00:56:17Z` (seven days),
`2026-09-07T00:56:17Z` (legacy reader/exporter review), and
`2026-09-23T00:56:17Z` (destructive cleanup review); anomalies or insufficient
natural traffic extend the relevant window.

The required next-day checkpoint passed at `2026-08-25T12:08Z` with natural
production traffic. PostgreSQL accepted 22 post-cutover purchases: 14 succeeded,
seven failed, and one was canceled. The successful purchases produced 14 invoices
and 42 side-effect records. A privacy-safe Stripe Live comparison found 113 relevant
provider events and 113 verified inbox events with identical per-type counts, no
missing provider event, and no extra database event. No inbox or outbox row is ready,
working, stale, or dead-lettered. All 13 inbox retry rows ended as `processed` or
`skipped`, all seven retried outbox deliveries ended as `sent`, and the one historical
non-outbox failed admin alert is now explicitly `skipped`.

Pooled and unpooled database health, all 19 migrations, the 12-offer catalog, all 32
invariants, and six safe production browser journeys passed. The PII-safe report
control has 59 eligible purchases, 59 joined rows, 59 unique sales, and no duplicate
group. The 80 historical Payments shared with Sheets still match, no Sheet-only
Payment exists, active access remains accounted for, and the optional
successful-customer projection is aligned at 79 unique rows. The 22 DB-only Payments
and 14 DB-only invoices are expected evidence that the disabled legacy writers are no
longer authoritative. The next-day privacy-safe reconciliation fingerprint is
`0ac933d5678a4091a390b3b05b3dd9522839d835a771cc4be9b35b650b837cbc`.
This closes the next-day checkpoint only; `CUT-04` and Gate G6 stay in progress until
the seven-day observation and owner behavior confirmation.

The seven-day automated checkpoint ran after `2026-08-31T00:56:17Z`. Stripe Live and
the verified production inbox matched at 118/118 relevant events with no missing or
extra event. Production database health, the catalog, all 32 invariants, queues,
active-access coverage, the latest 28/28 report control, and the current production
CI/smoke were green. Shared historical Payments still matched 80/80 with no Sheet-only
Payment; the 23 DB-only Payments were the expected post-cutover records.

Gate G6 was not closed from those automated results alone. The owner reported that the
August monthly report was sent prematurely on August 31. The persisted run ended at
`2026-08-31T03:11:34.644Z`, contained 28 rows, and has key
`monthly_sales:2026-08-01:2026-08-31`. Daily maintenance incorrectly combined a
last-day-of-month trigger with a partial current-month end timestamp. Deploy the
calendar correction before the next cron: on the first `Europe/Warsaw` day of a new
month it must request the previous completed local accounting month, producing the
distinct August key
`monthly_sales:2026-08-01:2026-09-01`. For August 2026 this means the half-open
`Europe/Warsaw` interval `[2026-08-01 00:00, 2026-09-01 00:00)`, stored and queried as
UTC instants `[2026-07-31T22:00:00.000Z, 2026-08-31T22:00:00.000Z)`. A sale at or
after `2026-09-01 00:00 Europe/Warsaw` therefore belongs to September and must not
appear in the August report. The report CSV and the purchases workspace display sale
timestamps in the same `Europe/Warsaw` accounting timezone. Preserve the premature
run as incident evidence.
After the corrected scheduled delivery, compare its row count with the same bounded
control SQL and repeat the queue/invariant checks before closing `CUT-04` and G6.

### `CUT-04` and Gate G6 closure — 2026-09-01

The deployed correction ran naturally after the August accounting month closed. The
persisted run has key `monthly_sales:2026-08-01:2026-09-01`, generated at
`2026-09-01T03:07:22.436Z`, and uses the exact UTC interval
`[2026-07-31T22:00:00.000Z, 2026-08-31T22:00:00.000Z)`. Its 28 rows matched 28
unique sales in the same bounded control query, with zero duplicate groups. An
independent CSV regeneration produced the same SHA-256:
`cb4d1781d09562064716efdc423bd706569bc39d2e2488df58a58fc6bf848658`.
The monthly-report outbox delivery was accepted by Resend at
`2026-09-01T03:07:26.189Z` on attempt one, retained an external message ID, and has no
error. The least-privilege production Resend key permits sending but not reading a
later delivery event, so this evidence establishes provider acceptance rather than a
mailbox-open or mailbox-delivery claim.

The timezone release briefly broke the production admin sales overview with
PostgreSQL `42P10`: two independently bound copies of the accounting-month expression
made `SELECT DISTINCT` and `ORDER BY` disagree. PR 46 orders by the selected month
alias and adds an integration regression test using the production query shape. The
hotfix production CI and smoke passed.

The closure pass confirmed pooled and unpooled database health, all 19 migrations,
the 12-offer catalog, all 32 invariants, and no ready, working, stale, or dead-letter
inbox/outbox work. There are no failed access links, manual access tasks, or pending
Sheets exports. The final privacy-safe reconciliation fingerprint is
`a88542b80a0d0763462673f6ae2722481de712decf0201e5f4af44a69080fd2d`.
All 80 shared unique Payments and shared customer snapshots match, no Sheet-only
Payment exists, and all active Sheet access is represented in PostgreSQL. The 24
DB-only Payments, 14 DB-only invoices, two DB-only report runs, newer entitlement
states, one historical skipped admin alert, and one known duplicate Sheet occurrence
are expected post-cutover or previously classified differences. There is no
unexplained finance or access drift. `CUT-04` is complete and Gate G6 passed.

Operator note: `db:audit:monthly-sales-report` currently includes raw customer samples
in addition to its aggregate control totals. During observation, do not retain or
share that raw output; use only the duplicate and count summaries. Removing those
samples from routine operator output is tracked by the existing `HARD-02` PII-safe
logging item.

### DROP-01 accelerated production release — 2026-09-03

The owner explicitly shortened the original September 7 hold while keeping the DROP
sequence staged. Before release, production database health, all 19 migrations, the
12-offer catalog, all 32 invariants, queue state, classified reconciliation, and the
privacy-safe accounting control passed. The accounting control retained 28 August
sales, separated the one September sale, and found no duplicate succeeded event.

PR [52](https://github.com/all1son4/dance-course-fe/pull/52) released `DROP-01` as
merge commit `b4be69c8198e89174a65d1afe73dcfc2a757d708`. Production CI
[run 33800300748](https://github.com/all1son4/dance-course-fe/actions/runs/33800300748)
and deployment smoke
[run 33800356020](https://github.com/all1son4/dance-course-fe/actions/runs/33800356020)
passed. Immediate read-only checks reproduced reconciliation fingerprint
`d751d5f4487f2fc34d52c4f19da136a534a5fe82a94276f973e3fee31510c2f9`,
with zero Sheet-only payments/events/access, zero matched financial-row differences,
`81/81` SuccessfulCustomers, zero waiting exports, clean actionable queues, and all
32 invariants passing.

`DB_SHEETS_EXPORT_MODE` and Google credentials were deliberately left unchanged.
The earliest accelerated `DROP-02` review is 24 hours after the successful production
smoke: `2026-09-04T20:08:20Z` (`22:08:20` Europe/Warsaw). Do not combine exporter
retirement or credential revocation with this release.

### DROP-02 production exporter retirement — 2026-09-05

Status: `DONE` — morning switch followed by an owner-approved same-day verification
instead of the originally planned additional next-day hold.

The fresh preflight after the owner-approved observation window passed health,
schema, catalog, all 32 invariants, actionable queue checks, and classified
reconciliation. Counts were 105 purchases, 308 Stripe events, 81 successful-customer
projections, 42 invoices, and seven report runs. Shared financial records matched;
all active Sheet access was represented in PostgreSQL. The 25 DB-only Payments,
160 DB-only Stripe events, 15 DB-only invoices, two DB-only report runs, known legacy
duplicate, newer access states, and historical skipped alert are classified
post-cutover/history differences. No waiting Sheet export remained.

Only `DB_SHEETS_EXPORT_MODE=database` was added to Production at
`2026-09-05T10:50:29.683Z`. The source deployment
`dpl_FnQJFxRW9MbzThy226YCmpJHHbWJ` was redeployed with the same Git revision
`361fb9f48fd11488e87e9158a8f2232dd249587e` as
`dpl_CSMhzgYpoSTmjpRv3XkaH5K6Rw5m`
([deployment](https://anna-strok-ez773y8gr-dzmitrys-projects-82230603.vercel.app)).
It became ready and was assigned to the production domains at
`2026-09-05T10:52:20.568Z`. Development UI changes were not part of this deployment.
Vercel confirmed the production setting and its presence in the new deployment.
The value/metadata fingerprint of all 74 pre-existing variables across all three
environments was identical before and after the change; Google credentials and
Preview/Development configuration were unchanged.

The unchanged revision already passed production CI
[run 33910368661](https://github.com/all1son4/dance-course-fe/actions/runs/33910368661).
The new deployment passed all nine browser checks in
[run 33961802367](https://github.com/all1son4/dance-course-fe/actions/runs/33961802367),
completed at `2026-09-05T10:53:40Z`. Five exporter/flag unit tests and 12 integration
tests passed on matching persistence/exporter code in a disposable local PostgreSQL
17 database. A fetch guard blocked Google and asserted zero attempts. Successful
Stripe projection retained its purchase/email/alert jobs but created no export job;
the retired-export Online Group grant also created no export. The local database was
stopped after testing. No real production payment, grant, or outbound report email
was generated for verification.

Immediate production health, migrations, catalog, queues, and all 32 invariants
passed. The `2026-09-05T10:54:56.706Z` reconciliation reproduced the preflight
fingerprint `7c0fbaa80b83c2eda09fb937d3a87fcb66303b49411285662ab8e573db943b13`,
with no new unexplained difference and `81/81` SuccessfulCustomers. Authenticated
read-only requests to the production sales API returned HTTP 200 for August
(28 sales) and September (one sale). The August CSV download returned HTTP 200 and
the accepted SHA-256
`cb4d1781d09562064716efdc423bd706569bc39d2e2488df58a58fc6bf848658`.
The immediate Vercel log review, scoped to the new deployment since its ready time,
returned zero HTTP 5xx requests and zero error-level records.

The original next-day checkpoint at `2026-09-06T10:53:40Z` was explicitly waived
by the owner on September 5 evening. The repeat preflight passed production health,
schema/catalog, queues, and all 32 invariants. Reconciliation at
`2026-09-05T21:24:34.953Z` reproduced the fingerprint above. Authenticated sales/CSV
checks at `2026-09-05T21:24:38.284Z` returned the same 28 August / one September sale
and identical accepted August CSV. No new real purchase occurred during these checks;
the controlled non-production tests provide the no-export purchase evidence. New
DB-only SuccessfulCustomers after the switch are expected; new queued exports,
unexplained shared-row changes, or missing canonical access require investigation.
Keep the protected snapshot; the September 23 destructive-cleanup boundary remains.

The owner independently released PR 57 before this checkpoint: production revision
`ef5fcd93e5934e216eb3f38ef2d2b910762a64cf` passed
[CI](https://github.com/all1son4/dance-course-fe/actions/runs/33991999717) and
[deployment smoke](https://github.com/all1son4/dance-course-fe/actions/runs/33992036414).
Its persistence/exporter code matches the morning-tested code. The deployment log
review since `21:05Z` returned no HTTP 5xx. Preview/Development received
`DB_SHEETS_EXPORT_MODE=database` at `2026-09-05T21:25:48.546Z`; redeploying existing
dev revision `cd7b4ef` as `dpl_rvqn7HBz6NdX9wUNYKx4jQ6doWKR` passed all 11
[browser checks](https://github.com/all1son4/dance-course-fe/actions/runs/33993177599).
Both environments had no waiting exports or actionable inbox/outbox jobs. Local
development uses the same export-disabled setting.

This waiver closes `DROP-02` but is not evidence of another 24 hours, a new production
purchase, or a successful next nightly cron. Review the next natural maintenance run
as a non-blocking follow-up; no cron was forced and no customer email was sent for
these checks.

### DROP-03 credential retirement — 2026-09-05

Status: `DONE` — provider key disabled, archives restored, active Google configuration
removed, and credential-free same-revision dev/prod deployments verified.

The owner confirmed the service account has no consumers beyond this site's dev/prod.
Before disabling its key, fresh encrypted production and development source archives
were captured and successfully restored to disposable PostgreSQL 17 databases. Both
had 21 public tables, 19 migrations, valid internal checksums, and no invalid indexes.
See [archive IDs, hashes, and counts](./data-source-snapshots.md#drop-03-final-source-archives--2026-09-05).
The temporary cleartext archives, Sheets exports, and restored database cluster were
deleted after verification. Encrypted archives and their recovery key remain protected
locally; the original Google worksheets were not changed or deleted.

The configured private key was matched cryptographically to exactly one user-managed
Google key (public SPKI SHA-256
`905d7d2e4190dd8d4ee677f9102fefcf3a6b3b6b990dabff30f6420d1d280ee8`).
The initial IAM `403 SERVICE_DISABLED` was resolved by enabling only
`iam.googleapis.com` using existing permissions; no IAM roles were added. Google
confirmed key `a0ff73ed08ca3bc338f10bf0683a3c90850d7772` as `disabled: true` at
`2026-09-05T21:39:36.419Z`. A new OAuth exchange at `21:42:42.463Z` returned HTTP 400
`invalid_grant`, without issuing a token. The key is disabled, not permanently deleted.
[Google's documented behavior](https://docs.cloud.google.com/iam/docs/keys-disable-enable)
allows later administrative re-enablement; already issued short-lived tokens expire
naturally and are not immediately revoked by key disablement.

Removed `GOOGLE_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and
`GOOGLE_SHEETS_SPREADSHEET_ID` from all three Vercel environments and from
`.env.local`/`.env.production.local`. At `21:43:58.907Z`, no project-level Google
variables remained. All other 72 Vercel records, including both export-disabled
settings, retained identical values/metadata (SHA-256
`cb7ed69b0a2a51e670d1eb33e77ade624c65e820d7155bc579d44c4ee22730f6`).
Local removal preserved every unrelated setting and retained line byte-for-byte.
No replacement Google credential or extra secret copy was created.

Credential-free releases used the existing source revisions, with no dev-to-prod merge:

- Production `ef5fcd9`: `dpl_E6iPSwxs3zFqJZ8LCFNwQjgkLiZa`, ready at
  `2026-09-05T21:45:42.833Z`; all nine
  [browser checks](https://github.com/all1son4/dance-course-fe/actions/runs/33993972821)
  passed against that deployment URL.
- Preview `cd7b4ef`: `dpl_2ZDuGYo1Tk5k3uwAhmXttqv9Tm24`, ready at
  `2026-09-05T21:46:49.405Z`; all 11
  [browser checks](https://github.com/all1son4/dance-course-fe/actions/runs/33994023749)
  passed against that deployment URL.

Vercel reported no `GOOGLE_*` names and the export-disabled flag present in both
deployment environments. The existing exact-revision CI runs remained green; 200
local unit tests and TypeScript also passed after local credential removal. Read-only
health checks and all 32 DB invariants passed in each environment. Production queue
checks at `21:49:00.394Z` showed no ready/working/stale/dead-letter jobs and no waiting
exports; historical retries/imported warnings were unchanged. Authenticated
production sales/CSV checks at `21:48:59.561Z` returned HTTP 200, August 28 sales
(EUR 800.00, PLN 735.00), September one sale (EUR 15.00), and the identical accepted
August CSV SHA-256 above. Both new deployments had zero observed HTTP 5xx and zero
error-level records during the immediate post-deploy review. No real payment or
outbound report email was generated.

Older deployments may retain their captured environment. Do not promote them as a
rollback: redeploy a reviewed DB-compatible revision with current export-disabled,
Google-free configuration. Live Sheet comparison/capture tools no longer authenticate;
offline archive recovery remains available. Do not restore Google access merely to
make a stale worksheet resemble the canonical database.

### Historical CUT-03 flag sequence

The numbered flag sequence below is retained as the historical `CUT-03` execution
record. Since the `DROP-01` production release, `DB_TELEGRAM_ACCESS_MODE`,
`DB_BUSINESS_OPERATIONS_MODE`, `DB_PAYMENT_EVENTS_MODE`, and
`DB_SIDE_EFFECTS_MODE` are retired: Telegram access, the four business-operation
families, Stripe ingestion/projection, and purchase side effects are PostgreSQL-only.
Do not replay steps 2–4 after that release reaches an environment.

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
4. On revisions before `DROP-01`, keep `DB_PAYMENT_EVENTS_MODE` and
   `DB_SIDE_EFFECTS_MODE` equal. On and after `DROP-01`, both selectors are retired
   and must not be used as a rollback mechanism. Keep the exporter setting unchanged
   unless its own later retirement procedure is being executed.
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
