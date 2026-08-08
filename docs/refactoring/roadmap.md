# Reliability and PostgreSQL-only roadmap

Version: 1.8
Status: active
Started: 2026-07-30

## Goal

Improve reliability, security, testability, and maintainability without changing the
existing product behavior. Then move all authoritative runtime data from the current
PostgreSQL and Google Sheets dual-write model to PostgreSQL only.

The target runtime architecture is:

```text
Browser / Stripe / Telegram / Admin
                    |
                    v
        PostgreSQL (only source of truth)
                    |
              inbox / outbox
                    |
                    v
       Email / Telegram / reports
```

Google Sheets may temporarily remain as a one-way asynchronous export during the
migration. It must not remain an authoritative read or write source.

## Non-negotiable product contract

The current user journeys are intentional unless the owner explicitly approves a
change. Refactoring may improve implementation and failure handling, but must not
silently change:

- available products, offers, currencies, prices, or access durations;
- the fields and agreements shown during checkout;
- the order and meaning of checkout actions;
- which products deliver access by email, Telegram channel, Telegram group, or mentor;
- the existing post-payment success, pending, and failure journeys;
- the Online Group new-purchase journey;
- the Online Group renewal journey and its Telegram verification and membership checks;
- the way users normally claim, retain, renew, or lose access;
- existing admin workflows and reports.

An audit finding is not, by itself, authorization to redesign a journey. If a safety
fix cannot preserve observable behavior, work stops at a documented decision record
and requires explicit owner approval.

## Change rules

1. Characterize the affected behavior before changing it.
2. Add regression coverage for the intended behavior.
3. Separate behavior-preserving reliability work from product changes.
4. Prefer additive and backward-compatible database migrations.
5. Never combine a source-of-truth cutover with a large UI or module refactor.
6. Never fall back from a PostgreSQL error to a new Google Sheets write.
7. After PostgreSQL-only writes begin, rollback is only to a DB-compatible release.
8. Do not make destructive schema changes during the rollback window.
9. Do not run external Stripe, Telegram, Resend, or Google HTTP calls inside a long
   database transaction.
10. A phase is complete only when its exit gate passes, not when code is merged.

## Sequencing decision

Do not complete every audit refactor before the PostgreSQL-only transition, and do not
perform an unprotected database cutover first.

The sequence is:

1. record behavior and data baselines;
2. add the minimum safety net and behavior-preserving critical fixes;
3. add the target PostgreSQL inbox, projection, outbox, constraints, and repositories;
4. backfill, reconcile, and switch writes and reads domain by domain;
5. remove Google Sheets after observation;
6. perform large module cleanup, UI polish, and non-blocking technical-debt work after
   the storage boundary is stable.

This avoids refactoring the current dual-write architecture into a cleaner form that
will immediately be deleted, while also avoiding a high-risk migration without tests,
idempotency, rollback compatibility, or reconciliation.

## Working protocol

For every future implementation session:

1. Read this roadmap, the linked behavior contract, and the status of the current gate.
2. Select the next eligible task ID; do not mix unrelated domains in one change.
3. Name the behavior-contract cases that protect the change before editing production
   code.
4. For database work, state expand/contract compatibility, rollback behavior, and
   reconciliation evidence before cutover.
5. Run the applicable quality checks and update the task status, execution log, and
   evidence links in this file.

The owner can resume work by asking to continue the next eligible roadmap task. A task
may be reordered only when its prerequisites still hold and the reason is recorded.

## Status vocabulary

- `TODO`: not started.
- `IN_PROGRESS`: active work.
- `BLOCKED`: cannot proceed without a decision or external change.
- `DONE`: implementation and the acceptance gate are complete.
- `DEFERRED`: intentionally postponed with a recorded reason.

## Global definition of done

A task can be marked `DONE` only when all applicable conditions hold:

- the existing behavior contract still passes;
- new failure, concurrency, or security behavior is covered by tests;
- format, lint, TypeScript, tests, and build pass;
- database changes are backward-compatible with the previous release;
- rollback or forward-fix behavior is documented;
- monitoring is sufficient to identify failure after deployment;
- no new runtime dependency on Google Sheets is introduced;
- logs do not expose secrets or unnecessary personal data.

## Phase BASE: behavior and data baseline

Status: `DONE`

### BASE-00 — Persist and maintain this roadmap

Status: `DONE`

Keep stable task IDs and update status, acceptance evidence, and decision links as work
progresses.

### BASE-01 — Record the architecture decision

Status: `DONE`

Document PostgreSQL as the final source of truth, Google Sheets as a temporary
one-way export, the expand/backfill/verify/switch/observe/contract migration model,
and the rollback rules.

Evidence:
[`ADR-001`](adr/001-postgresql-source-of-truth.md).

### BASE-02 — Record the current user behavior contract

Status: `DONE`

Describe the existing checkout, payment result, access delivery, Online Group,
renewal, and admin journeys from the implementation. Mark uncertain behavior for
owner confirmation instead of guessing.

Evidence:
[`behavior-contract.md`](behavior-contract.md).

### BASE-03 — Inventory Google Sheets dependencies

Status: `DONE`

Classify every runtime and maintenance dependency as:

- read;
- authoritative write;
- DB-first mirror;
- fallback;
- lock or lease;
- cache;
- backfill or comparison tooling;
- type-only dependency.

Assign every dependency a target PostgreSQL domain and a removal phase.

Evidence:
[`google-sheets-inventory.md`](google-sheets-inventory.md).

### BASE-04 — Capture the data baseline

Status: `DONE`

Create a read-only, reproducible reconciliation report for:

- purchases by PaymentIntent ID;
- Stripe events by event ID;
- totals by currency and month;
- payment outcomes;
- invoice numbers;
- Telegram tokens, bindings, and entitlements;
- email, campaign, and report statuses;
- products, offers, prices, and active flags.

Do not expose plaintext bearer tokens or invite links in generated artifacts.

The read-only command, privacy guardrails, fixture tests, development capture, and
production capture are complete: [`data-baseline.md`](data-baseline.md). Two
consecutive captures per environment produced stable fingerprints. Production money
and user projections match; every expected technical-domain difference and every
development legacy-data difference is classified without exposing identifiers.
Accepted report fingerprints are
`a87829c51263f830a3cf999fc86aaa3c8c893e87e29cdce9f26c704ebbe2fbf3` for development
and `933043ea6ef18e64bd379ab54ea2a81cbaf8ecf6d1fd03d9d317d00adadffe72` for production
(captures at `2026-08-06T13:07:24.190Z` / `13:07:40.334Z` and
`2026-08-06T13:07:20.833Z` / `13:07:40.172Z`, respectively).

Terminal status: `DONE`. The earlier `SUPERSEDED` execution-log row records the first
blocked capture attempt, not the current task state.

### BASE-05 — Record product and policy decisions

Status: `DONE`

At minimum, record:

- which existing Telegram identity reuse behaviors are required;
- which behaviors are implementation details rather than user-visible requirements;
- the required consent evidence and retention policy;
- the rollback and observation window expected for production cutover.

Telegram verification scope is decided:
[`ADR-002`](adr/002-telegram-verification-scope.md). The owner also accepted the
behavior-preserving identity reuse, per-purchase consent evidence, fail-closed catalog
policy, and lightweight production observation windows in the
[`decision register`](decision-register.md).

### Gate G0

Status: `PASSED` (terminal; the gate equivalent of `DONE`)

Evidence: the accepted [`behavior contract`](behavior-contract.md),
[`decision register`](decision-register.md), exhaustive
[`Google Sheets call-site register`](google-sheets-inventory.md#exhaustive-call-site-register),
and the reproducible [`data baseline`](data-baseline.md).

- [x] All current user journeys are documented and accepted by the owner.
- [x] Every Google Sheets facade, schema, runtime, type, and maintenance call site is
      classified with a target removal task.
- [x] Baseline comparisons are repeatable and all differences are explained.
- [x] No planned safety task implicitly redesigns a user journey.

## Phase SAFE: safety net and behavior-preserving fixes

Status: `IN_PROGRESS`

### SAFE-01 — Add remote CI

Run `npm ci`, formatting, lint, TypeScript, tests, and a migration-free production
build. Make the checks required for merging.

Status: `DONE`. The workflow passed locally from a clean temporary checkout without
environment files and remotely on GitHub. The protected `main` branch strictly
requires the app-bound `Quality` check, including for repository administrators.

### SAFE-02 — Add the test foundation

Use focused unit tests for domain rules, PostgreSQL integration tests for transactions
and concurrency, provider fakes or fixtures for Stripe, Telegram, and Resend, and a
small Playwright suite for critical journeys.

Status: `DONE`. Fourteen focused unit and characterization tests cover the accepted
catalog, consent, payment-outcome, provider-request, and purchase-side-effect rules.
Two integration tests run committed migrations against disposable PostgreSQL and
verify rollback plus concurrent duplicate-event behavior. Three Playwright journeys
passed against the exact Vercel Preview revision. Provider fixtures make no live
Stripe, Telegram, or Resend calls. The deterministic `Quality` job remains the merge
gate; a separate post-deployment smoke workflow targets successful Vercel deployment
URLs. See [`docs/testing.md`](../testing.md).

### SAFE-03 — Separate migrations from the application build

Build the artifact first. Apply migrations through a separately controlled,
single-runner release step using backward-compatible expand/contract migrations.

Status: `DONE`. Vercel builds now run `npm run build` without migrations. Shared
database migrations require a manual, branch-bound GitHub Actions release with an
exact typed confirmation, a migration phase, an environment-scoped direct database
URL, a PostgreSQL advisory lock, and strict committed-history validation. The
[production CI](https://github.com/all1son4/dance-course-fe/actions/runs/31157722651)
and
[production smoke](https://github.com/all1son4/dance-course-fe/actions/runs/31157786483)
passed after the protected merge. Controlled
[development](https://github.com/all1son4/dance-course-fe/actions/runs/31157883957)
and
[production](https://github.com/all1son4/dance-course-fe/actions/runs/31158032092)
runs both reported nine applied migrations and no pending tags, so no SQL migration
was applied. See [`docs/database-migrations.md`](../database-migrations.md).

### SAFE-04 — Make Stripe state projection monotonic

Prevent stale or out-of-order events from regressing a payment while preserving the
current successful, pending, and failed user journeys.

Status: `DONE`. PostgreSQL purchase upserts now accept payment-state transitions
atomically: retryable states remain free to move between failed, action-required, and
processing outcomes; cancellation remains terminal unless success wins; and success
cannot regress. A rejected stale write returns the preserved database projection to
the Sheets mirror and does not overwrite its dependent purchase projections. Policy
tests cover the complete transition matrix, while PostgreSQL integration tests cover
both the normal retry sequence and concurrent success/failure writes. The exact
revision passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31273762382)
and the deployed
[critical-journey smoke suite](https://github.com/all1son4/dance-course-fe/actions/runs/31273804615)
without changing checkout UI or provider calls.

### SAFE-05 — Make Telegram token claims atomic

Use a PostgreSQL compare-and-set transaction and database constraints so that only one
Telegram user can claim a token. Preserve the current claim UI and bot commands.

Status: `DONE`. Legacy start-token and channel-invite claims now use an atomic
PostgreSQL compare-and-set transaction. The first valid claimant becomes the immutable
token owner; concurrent users receive the existing conflict result, same-user retries
remain idempotent, and stale dual-writes cannot return a used token to `issued` or
replace its owner. Expand migration `0009_atomic_telegram_token_claim` rejects new
`used` rows without a Telegram user while remaining safe for unvalidated historical
rows. A disposable-PostgreSQL integration test proves exactly one winner across eight
concurrent claims and verifies both the constraint and stale-write protection. The
existing bot commands, user-visible responses, ordinary purchase flow, and Online
Group renewal verification flow are unchanged; the already-transactional Online Group
membership claim path was intentionally left intact.

### SAFE-06 — Harden Telegram identity reuse without redesigning the flow

First characterize the currently required reuse behavior. Remove unsafe trust in email
only if the replacement preserves the intended user experience. If it cannot, write a
decision record with options and stop for owner approval. Do not add Telegram Login to
ordinary purchases. Keep the existing Online Group renewal verification flow.

Status: `DONE` at the accepted decision boundary. Characterization confirmed that the
ordinary internal PaymentIntent has no authenticated account or durable Stripe
Customer and that the internal customer relation falls back to the same normalized
email. The checkout name, Telegram username, and browser session are not independent
proof of Telegram ownership, so no stronger automatic replacement can preserve the
current zero-step returning-customer outcome. Existing owner-approved `DEC-01` therefore
continues to preserve and contain the current reuse until a separate post-cutover
product/security decision. Focused tests now lock the timed-access selection and Online
Group customer/email precedence, while ambiguous multi-user matches produce diagnostic
warnings. Reuse was not expanded, ordinary checkout gained no verification step, and
the verified Online Group renewal path is unchanged.

### SAFE-07 — Make catalog failure behavior explicit

Preserve the healthy-path catalog, offer, price, and currency behavior. Ensure inactive
commercial data cannot unintentionally become sellable. Implement the accepted
`DEC-04` fail-closed policy after characterization tests; any different fallback policy
requires a new owner decision.

Status: `DONE`. Runtime sale authorization now comes exclusively from active
PostgreSQL product, offer, price, and access-duration rows. The catalog API and
PaymentIntent endpoint fail closed when that authority is unavailable, when a product
has no active authoritative default offer, or when a requested known selection is
inactive. Invalid code-only values retain the documented healthy fallback to the
active database default; an inactive known value is never silently replaced. The
browser blocks Stripe until the authoritative catalog is ready and shows an explicit
localized degraded-state message. Code constants remain available for presentation
metadata and explicit seed/recovery tooling, but cannot authorize a runtime sale.

The accepted healthy product, offer, price, duration, and currency matrix remains
unchanged. Twenty-eight unit tests and seven disposable-PostgreSQL integration tests
pass, including active/inactive product, offer, default-offer, and price authorization.
The exact revision passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31276562210)
and all four deployed
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31276598877).

### SAFE-08 — Validate checkout data and consent on the server

Reuse the existing visible fields and agreements. Add server-side enforcement and an
immutable evidence snapshot without adding user steps unless separately approved.

Status: `DONE`. Expand migration `0010_checkout_consent_evidence` is applied in
development and remains backward-compatible with the currently deployed application.
The runtime reuses the client validation contract on the server, requires all four
existing booleans on every new purchase, carries versioned evidence through
PaymentIntent metadata, uses Stripe's stable server-side creation time as the
acceptance timestamp, and records the snapshot idempotently before returning the
client secret. A retry can recover from a temporary evidence-store failure without
creating a second PaymentIntent or changing the immutable snapshot; a conflicting
snapshot for the same PaymentIntent is rejected.

No visible checkout fields, agreements, ordering, or Telegram steps changed. Invalid
customer data or missing consent is rejected by the server, while an unavailable
evidence store fails closed with an explicit localized retry message. Thirty-one unit
tests and nine disposable-PostgreSQL integration tests pass. The development expand
[migration](https://github.com/all1son4/dance-course-fe/actions/runs/31277053339),
the exact final revision's
[Quality run](https://github.com/all1son4/dance-course-fe/actions/runs/31278196379),
and all five deployed
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31278235316)
passed. Production rollout remains schema-first: apply `0010` before deploying this
runtime; the previous runtime safely ignores the additive table.

### SAFE-09 — Neutralize spreadsheet formulas in CSV exports

Preserve CSV columns and contents while making customer-controlled cells safe to open
in spreadsheet software.

Status: `DONE`. The monthly sales report is the only runtime CSV producer. Its shared
cell encoder preserves existing whitespace normalization, quoting, columns, and
ordinary values while forcing cells beginning with `=`, `+`, `-`, or `@` to
spreadsheet text. Leading whitespace and line breaks cannot bypass the check, quoted
CSV remains syntactically valid, and the original formula-like content is retained.
The admin report workflow, recipients, attachment name, and successful-report rows do
not change.

Thirty-four unit tests pass, including ordinary quoted values and every supported
formula prefix. The exact final revision passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31278465482)
and all five deployed
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31278503198).

### SAFE-10 — Correct payment-result and hidden-control behavior

Keep the same visible success, pending, and failure journeys while preventing a false
success state and keyboard access to controls that are visually unavailable.

Status: `DONE`. Success content and access-link effects are now gated on the
authoritative Stripe outcome: only `succeeded` can reveal them, while `failed` and
`canceled` keep the failure journey. `processing` and `requires_action` are polled and
then remain in an explicit localized pending state that warns against paying again;
an unavailable verification result also cannot expose success. Invalid or mismatched
checkout ownership returns to checkout in accordance with the behavior contract.

The concealed Stripe subtree retains its visual transition and mounted state, but is
marked `inert` and hidden from the accessibility tree until the existing form and
agreement conditions are satisfied. Thirty-six unit tests pass, including the
complete result-outcome policy. The exact final revision passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31278886380)
and all six deployed
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31278925817),
including a repeated `processing` response that never renders the success title.

### SAFE-11 — Resolve production dependency advisories

Upgrade or override only after compatibility tests. Do not use forced automated
downgrades or `npm audit fix --force`.

### Gate G1

- All documented user journeys remain unchanged on the healthy path.
- A stale Stripe event cannot regress a successful payment.
- A Telegram token has exactly one winner under concurrent claims.
- Inactive commercial data cannot be sold unintentionally.
- Invalid server input and missing required consent are rejected.
- CSV exports cannot execute customer-controlled formulas.
- CI and migration-free builds are mandatory.

## Phase DB: target PostgreSQL primitives

Status: `TODO`

### DB-01 — Define domain ownership

Create explicit PostgreSQL ownership boundaries for catalog, customers, payments,
Stripe events, consent evidence, entitlements, Telegram access, invoices, side
effects, campaigns, and reports.

### DB-02 — Add database invariants

Add foreign keys, unique and partial indexes, status and currency constraints, positive
amount checks, valid ranges, invoice uniqueness, token-claim uniqueness, and event
version timestamps. Clean and validate existing data before enforcing hard constraints.

### DB-03 — Add an immutable webhook inbox

Persist verified provider events with a unique provider/event ID, payload, provider
timestamp, processing state, attempts, retry time, and error information.

### DB-04 — Add explicit payment projection

Process inbox rows through the tested state reducer and update purchases, events,
access, and related projections transactionally.

### DB-05 — Add a transactional outbox

Represent email, Telegram, reports, campaigns, and the transitional Sheets export as
retryable jobs with deterministic deduplication keys, leases, attempts, and dead-letter
state.

### DB-06 — Add atomic claims and counters

Use database primitives for token claims, entitlement allocation, invoice numbering,
campaign recipients, report delivery, and side-effect deduplication.

### DB-07 — Add repositories and domain feature flags

Make domain code depend on PostgreSQL repositories rather than Google Sheets record
shapes. Allow controlled, manual domain cutover without automatic fallback.

### DB-08 — Add operational visibility

Measure inbox and outbox age, retries, dead letters, stale and duplicate events,
access failures, reconciliation differences, report totals, and transitional export
lag.

### Gate G2

- Additive schema works with both the current and next application releases.
- Inbox replay and outbox retry are idempotent.
- Backup and restore have been rehearsed outside production.
- External API calls do not hold long database transactions.

## Phase DATA: backfill and reconciliation

Status: `TODO`

### DATA-01 — Produce protected source snapshots

Create a database backup, a controlled Sheets export, checksums, and a cut-off time.

### DATA-02 — Build a resumable backfill

The backfill is dry-run by default, idempotent, checkpointed, restartable, and reports
insert, update, skip, and conflict counts.

### DATA-03 — Reconcile domain data

Compare PaymentIntent IDs, Stripe event IDs, money by currency and month, terminal
payment state, active access, Telegram bindings, invoices, delivery statuses, catalog
data, and customer snapshots.

### DATA-04 — Resolve and record conflicts

Every conflict records its canonical source, decision, correction, owner, and time.
Do not invent historical consent evidence.

### Gate G3

- Financial differences are zero.
- Every active access record is accounted for.
- Invoice identifiers are unique and explained.
- Re-running the backfill makes no additional changes.

## Phase WRITE: PostgreSQL-only authoritative writes

Status: `TODO`

### WRITE-01 — Persist Stripe events before acknowledging

Verify the signature, durably insert the inbox event, then return success. Return a
retryable error if the inbox cannot be written.

### WRITE-02 — Process Stripe events asynchronously

Use leases, retry, backoff, dead-letter handling, replay, and the tested projection
state machine.

### WRITE-03 — Deliver side effects through the outbox

Use provider idempotency for email and Telegram delivery and persist final delivery
state.

### WRITE-04 — Move Telegram access writes to PostgreSQL only

Make PostgreSQL authoritative for tokens, bindings, membership, entitlement,
expiration, and revocation without changing the bot or user flows.

### WRITE-05 — Move catalog and admin writes to PostgreSQL only

Preserve the existing admin workflows and commercial semantics.

### WRITE-06 — Move invoices, reports, and campaigns to PostgreSQL jobs

Allocate invoices atomically and deliver reports and campaigns through durable claims
and idempotent jobs.

### WRITE-07 — Make Sheets a one-way optional export

Export only non-secret projections asynchronously. Export failure must not affect any
user request.

### Gate G4

Blocking the Google Sheets API in staging does not break checkout, Stripe webhooks,
Telegram access, email, reports, or admin operations.

## Phase READ: PostgreSQL-only reads

Status: `TODO`

Switch domains independently, with shadow comparison before each switch:

1. `READ-01`: catalog and checkout;
2. `READ-02`: payments and Stripe events;
3. `READ-03`: Telegram access;
4. `READ-04`: invoices, reports, and campaigns;
5. `READ-05`: admin views;
6. `READ-06`: remove automatic Sheets fallback.

### Gate G5

- Domain behavior-contract tests pass.
- Shadow comparisons have no unexplained mismatch.
- There are no automatic fallback hits.
- Expected fail-closed behavior is verified.

## Phase CUT: production cutover and observation

Status: `TODO`

### CUT-01 — Deploy a DB-compatible rollback release

The release must work without Sheets while still supporting the temporary exporter.

### CUT-02 — Rehearse and prepare cutover

Take backups, run final delta reconciliation, freeze unrelated changes, assign an
operator, and prepare a written rollback checklist.

### CUT-03 — Enable domain flags gradually

Monitor errors, inbox/outbox backlog, money totals, access delivery, stale events,
duplicate effects, and report results after each switch.

### CUT-04 — Observe

After every critical switch, run an immediate smoke/reconciliation check and repeat it
the next day. Use existing application/provider logs and reconciliation output rather
than introducing a separate enterprise monitoring platform.

After the final runtime-read switch, observe for 7 days and keep the isolated legacy
reader and temporary exporter for 14 days. Manually generate and compare the monthly
report before disabling the exporter; waiting for a complete calendar month is not
required. Destructive cleanup may begin no earlier than 30 days after final cutover,
with zero unexplained differences and valid backup/restore evidence. Extend a window
when an anomaly appears or traffic is too low to exercise a critical path.

### Gate G6

- Financial differences remain zero.
- All active access is accounted for.
- Dead-letter queues are empty or every item is explained.
- Critical paths make no Google Sheets calls.
- Reports match control SQL queries.
- The owner confirms that user behavior remains unchanged.

## Phase DROP: remove dual-write and Google Sheets

Status: `TODO`

### DROP-01 — Remove runtime reads, writes, fallback, and Sheets locks

### DROP-02 — Disable the transitional exporter after the rollback window

### DROP-03 — Revoke service-account credentials and archive Sheets securely

### DROP-04 — Remove legacy adapters, schemas, caches, and record mappings

### DROP-05 — Apply destructive contract migrations in a separate release

### Gate G7

- Runtime contains no Google Sheets network dependency.
- Credentials are revoked.
- All behavior-contract and reliability tests pass with Google access blocked.

## Phase HARD: post-cutover hardening and cleanup

Status: `TODO`

- `HARD-01`: after separate owner approval, per-user admin identity, MFA, roles, audit,
  and revocable sessions;
- `HARD-02`: mandatory distributed rate limits, bounded request bodies, and PII-safe logs;
- `HARD-03`: hash or encrypt bearer material and erase it after use or expiry;
- `HARD-04`: accessibility, locale, payment-result, polling, and navigation correctness;
- `HARD-05`: split large modules by domain responsibility;
- `HARD-06`: hermetic fonts, media delivery, dependency cleanup, and onboarding docs;
- `HARD-07`: coverage gates, SLOs, restore drills, and periodic integration tests.

## Permanent regression matrix

| ID            | Scenario                                       | Required result                              |
| ------------- | ---------------------------------------------- | -------------------------------------------- |
| TEST-BEH-01   | Every documented healthy user journey          | Same visible steps and result                |
| TEST-STR-01   | Successful payment followed by an older event  | Payment remains successful                   |
| TEST-STR-02   | Duplicate provider event                       | No duplicate side effect                     |
| TEST-STR-03   | Inbox database unavailable                     | Provider receives a retryable error          |
| TEST-TG-01    | Concurrent claims of one token                 | Exactly one winner                           |
| TEST-TG-02    | Existing required identity-reuse journeys      | Same user-visible behavior                   |
| TEST-TG-03    | Online Group renewal verification              | Existing verification and membership flow    |
| TEST-CAT-01   | Healthy catalog matrix                         | Same product, offer, price, and currency     |
| TEST-CAT-02   | Inactive commercial record                     | Not unintentionally sellable                 |
| TEST-CONS-01  | Existing checkout agreements                   | Same UI plus server evidence                 |
| TEST-ENTRY-01 | First Touch and Online Group public entry CTAs | Existing lead and internal-checkout journeys |
| TEST-CSV-01   | Formula-like customer data                     | Safe non-executable CSV cell                 |
| TEST-OUT-01   | Retried outbox job                             | One externally visible delivery              |
| TEST-DATA-01  | Backfill run twice                             | Second run is a no-op                        |

## Rollback policy

- Before PostgreSQL-only writes, a domain feature flag may be reverted.
- After PostgreSQL-only writes, rollback is only to a DB-compatible release.
- Google Sheets never becomes the write source again.
- PostgreSQL failure causes an explicit degraded or fail-closed result.
- Data recovery uses point-in-time recovery or a forward fix, not a stale Sheets import.
- Destructive cleanup happens only after the rollback and observation windows.

## Execution log

| Date       | Item                    | Status       | Evidence                                                     |
| ---------- | ----------------------- | ------------ | ------------------------------------------------------------ |
| 2026-07-30 | Repository-wide audit   | `DONE`       | Audit discussion and local checks                            |
| 2026-07-30 | Roadmap v1.3            | `DONE`       | This document                                                |
| 2026-07-30 | BASE-01                 | `DONE`       | ADR-001 accepted                                             |
| 2026-07-30 | BASE-02                 | `DONE`       | Current behavior contract recorded                           |
| 2026-07-30 | BASE-03                 | `DONE`       | Seven Sheets and all dependency classes inventoried          |
| 2026-07-30 | BASE-05 Telegram scope  | `DONE`       | ADR-002 accepted                                             |
| 2026-07-30 | BASE-04 tooling         | `DONE`       | Read-only command and privacy fixture tests                  |
| 2026-07-30 | BASE-04 capture         | `SUPERSEDED` | Initial blocked attempt; replaced by the completed capture   |
| 2026-07-30 | BASE-05 decision draft  | `DONE`       | Defaults prepared before owner confirmation                  |
| 2026-07-30 | BASE-05 owner decisions | `DONE`       | Owner accepted all four migration decisions                  |
| 2026-08-06 | BASE-04 capture         | `DONE`       | Stable dev/prod fingerprints; differences classified         |
| 2026-08-06 | Gate G0                 | `PASSED`     | Behavior, dependency, data, and decision baselines accepted  |
| 2026-08-06 | Gate G0 formal audit    | `DONE`       | All 26 Sheets components classified; documents reconciled    |
| 2026-08-06 | SAFE-01                 | `DONE`       | Clean/local and remote CI passed; `main` requires `Quality`  |
| 2026-08-06 | SAFE-02                 | `DONE`       | 14 unit, 2 PostgreSQL, and 3 deployed browser tests passed   |
| 2026-08-07 | SAFE-03                 | `DONE`       | Migration-free release; dev/prod no-op controls passed       |
| 2026-08-08 | SAFE-04                 | `DONE`       | Atomic terminal outcomes; race and deployed smoke tests pass |
| 2026-08-08 | SAFE-05                 | `DONE`       | Atomic claims, DB invariant, and eight-way race test passed  |
| 2026-08-08 | SAFE-06                 | `DONE`       | Reuse characterized at accepted decision boundary            |
| 2026-08-08 | SAFE-07                 | `DONE`       | DB-authorized catalog; remote CI and four browser tests pass |
| 2026-08-08 | SAFE-08                 | `DONE`       | Versioned consent evidence; CI, PostgreSQL, 5 browser tests  |
| 2026-08-08 | SAFE-09                 | `DONE`       | Formula-safe CSV; CI and five deployed browser tests pass    |
| 2026-08-08 | SAFE-10                 | `DONE`       | Verified result gate; CI and six browser tests pass          |
