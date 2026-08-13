# Reliability and PostgreSQL-only roadmap

Version: 2.3
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

Status: `DONE`

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

Status: `DONE`. Next.js and its matching ESLint configuration were upgraded
from 16.2.12 to 16.3.0, replacing the vulnerable production chain with
`sharp 0.35.3` and `nanoid 3.3.18`; the temporary Next.js PostCSS override is no
longer needed because 16.3.0 depends on PostCSS 8.5.23 directly. A clean `npm ci`,
format, lint, TypeScript, all 36 unit tests, and the 62-route production build pass.
`npm audit --omit=dev` reports zero advisories. The four remaining moderate findings
are confined to the development-only legacy `drizzle-kit`/`@esbuild-kit` chain;
npm's proposed remediation is an unsafe downgrade from drizzle-kit 0.31.10 to
0.18.1 and is intentionally not applied. The exact dependency revision passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31302111979),
including isolated PostgreSQL integration tests, and all six deployed
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31302162402).

### Gate G1

Status: `PASSED` (terminal; the gate equivalent of `DONE`)

SAFE-01 through SAFE-11 are complete. The behavior contract is protected by unit,
PostgreSQL integration, and deployed browser tests; monotonic Stripe projection,
atomic Telegram claims, fail-closed catalog authorization, server-side consent,
formula-safe CSV exports, and migration-free builds all pass on the exact SAFE-11
revision. The dependency-only change did not alter application routes or healthy-path
product behavior, and the production dependency audit is clear.

- All documented user journeys remain unchanged on the healthy path.
- A stale Stripe event cannot regress a successful payment.
- A Telegram token has exactly one winner under concurrent claims.
- Inactive commercial data cannot be sold unintentionally.
- Invalid server input and missing required consent are rejected.
- CSV exports cannot execute customer-controlled formulas.
- CI and migration-free builds are mandatory.

## Phase DB: target PostgreSQL primitives

Status: `DONE`

Current-state audit (2026-08-09): the phase order remains correct. The implementation
already contains several target primitives: a monotonic payment projection, atomic
Telegram token claims, a DB-authoritative catalog, immutable consent evidence,
`stripe_events`, and `purchase_side_effects`. The work below completes and separates
those primitives; it must extend them rather than create parallel replacements.

### DB-01 — Define domain ownership

Create explicit PostgreSQL ownership boundaries for catalog, customers, payments,
Stripe events, consent evidence, entitlements, Telegram access, invoices, side
effects, campaigns, and reports.

Status: `DONE`. The accepted ownership, repository, transaction, cutover, and rollback
boundaries are recorded in [`domain-ownership.md`](domain-ownership.md). This is a
documentation-only boundary and does not change a user journey.

### DB-02 — Add database invariants

Audit the existing foreign keys, checks, unique and partial indexes first, then add only
the missing status, currency, positive amount, valid-range, invoice, outbox, and inbox
invariants. Preserve the consent, token-claim, catalog, and monotonic-projection
constraints already introduced by the SAFE phase. Clean and validate existing data
before enforcing a new hard constraint.

Status: `DONE`. The read-only
[`invariant audit`](../../src/db/audit-invariants.ts) found zero violations in both
development and production before enforcement. Expand migration
[`0011_database_invariants.sql`](../../drizzle/0011_database_invariants.sql) adds and
validates the missing scalar and ownership constraints. It passed
[CI](https://github.com/all1son4/dance-course-fe/actions/runs/31313560174), the controlled
[development migration](https://github.com/all1son4/dance-course-fe/actions/runs/31313645443),
a zero-difference post-migration audit, and the post-migration
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31313585992).
The bundled production expand migration and zero-violation post-migration audit are
recorded under Gate G2.

### DB-03 — Add an immutable webhook inbox

Evolve the existing `stripe_events` table in place, preserving and backfilling its
rows. A verified provider event has a unique provider/event ID, immutable payload and
provider timestamp, processing state, lease, attempts, retry time, and error/dead-letter
information.

Status: `DONE`. Expand migration
[`0012_stripe_event_inbox.sql`](../../drizzle/0012_stripe_event_inbox.sql) evolves the
existing rows in place and adds lifecycle, lease, retry, dead-letter, claim-index, and
verified-evidence immutability primitives. The repository safely deduplicates concurrent
receipts and can promote a legacy row without replaying completed work. It passed
[CI](https://github.com/all1son4/dance-course-fe/actions/runs/31315492127), the controlled
[development migration](https://github.com/all1son4/dance-course-fe/actions/runs/31315585734),
a zero-difference post-migration audit, and the post-migration
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31315520197).
The bundled production migration is recorded under Gate G2. The live webhook is
intentionally not switched to durable pre-acknowledgement persistence until
`WRITE-01`/`WRITE-02`.

### DB-04 — Add explicit payment projection

Extract and reuse the tested monotonic reducer already used by `database-sync.ts`.
Process inbox rows through it and update purchases, access, event state, and required
outbox entries transactionally; do not create a competing payment projection.

Status: `DONE`. The purpose-specific
[`payment projection`](../../src/db/payment-projection.ts) owns the single monotonic
purchase reducer and its customer, access, invoice, and outbox writes. The current
webhook's isolated Sheet adapter now invokes that same projector rather than keeping a
second implementation. The inbox worker claims verified rows with expiring leases and
commits projection, deterministic outbox entries, and event completion atomically;
projection failure rolls the transaction back before scheduling retry/dead-letter.
Stripe settlement enrichment was moved before the database transaction. The live
webhook acknowledgement flow remains unchanged until `WRITE-01`/`WRITE-02`.

### DB-05 — Add a transactional outbox

Evolve the existing `purchase_side_effects` proto-outbox into the general transactional
outbox. Represent email, Telegram, reports, campaigns, and the transitional Sheets
export as retryable jobs with deterministic deduplication keys, leases, attempts, and
dead-letter state.

Status: `DONE`. Expand migration
[`0013_transactional_outbox_and_invoice_sequences.sql`](../../drizzle/0013_transactional_outbox_and_invoice_sequences.sql)
evolves `purchase_side_effects` in place with deterministic keys, JSON job input,
retry time, attempt evidence, claim leases, dead letters, and claim indexes. Existing
application inserts remain compatible through a deterministic trigger. Only jobs
versioned by the new [`outbox repository`](../../src/db/transactional-outbox.ts) are
claimable, so historical proto-outbox rows cannot be delivered accidentally. Provider
I/O happens after claim commit and receives the stable deduplication key.

### DB-06 — Add atomic claims and counters

Keep the completed atomic Telegram token claim and add the remaining database
primitives for entitlement allocation, invoice numbering, campaign recipients, report
delivery, and outbox deduplication.

Status: `DONE`. Inbox and outbox selection use bounded
`FOR UPDATE SKIP LOCKED` claims. Entitlements retain their unique purchase/access-key
allocation and the completed Telegram compare-and-set claim. Reports and campaign
recipients use typed outbox kinds and deterministic keys. The
[`invoice repository`](../../src/db/invoice-repository.ts) serializes purchase and
monthly allocation with transaction-scoped advisory locks, seeds its counter from
existing invoices, and relies on purchase, invoice-number, and sequence uniqueness.
Concurrent tests prove one outbox claimant, one invoice per purchase, and unique
monthly sequences.

### DB-07 — Add repositories and domain feature flags

Make domain code depend on PostgreSQL repositories rather than Google Sheets record
shapes. Allow controlled, manual domain cutover without automatic fallback.

Status: `DONE`. New database-domain code is composed through
[`domain-repositories.ts`](../../src/db/domain-repositories.ts) and accepts
purpose-specific commands rather than Sheet records. The remaining Sheet-shaped code
is an explicit legacy adapter/backfill/reconciliation boundary scheduled for the
WRITE/READ/DROP phases. Independent validated flags expose `legacy`, `shadow`, and
`database` modes for payment events, side effects, Telegram access, business
operations, and the temporary Sheets export. Missing flags preserve `legacy`; invalid
values fail configuration and there is no automatic database-to-Sheets fallback.

### DB-08 — Add operational visibility

Add lightweight structured logs, SQL health queries, and an operator runbook for inbox
and outbox age, retries, dead letters, stale and duplicate events, access failures,
reconciliation differences, report totals, and transitional export lag. A separate
enterprise monitoring platform is not required.

Status: `DONE`. `npm run db:operations:status` emits only aggregate,
PII-free inbox/outbox age, retry, lease, dead-letter, access, projection/export, and
report totals. The versioned worker queues are separated from historical migration
evidence. A reusable read-only
[`SQL query`](sql/db-queue-health.sql) and the lightweight
[`operator runbook`](db-operations-runbook.md) define investigation and replay rules.
The post-migration development snapshot reported zero ready worker jobs, stale leases,
dead letters, and retries; the invariant audit reported zero violations.

### Gate G2

- Additive schema works with both the current and next application releases.
- Inbox replay and outbox retry are idempotent.
- Backup and restore have been rehearsed outside production.
- External API calls do not hold long database transactions.

Status: `DONE`. The exact revision passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31318090643)
with 39 unit tests, 22 PostgreSQL integration tests, a fresh migration, and a real
PostgreSQL 17 logical dump/restore comparison. The controlled
[development expand migration](https://github.com/all1son4/dance-course-fe/actions/runs/31317259357)
advanced the database from 13 to 14 migrations; the zero-violation invariant audit,
PII-free queue snapshot, and all
[deployed critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31318115237)
passed on the expanded schema. Tests cover replay suppression, transactional rollback,
uncertain provider-response retry with one visible delivery, concurrent claims, and
invoice allocation. Provider enrichment/delivery is explicitly outside the bounded
projection/claim transactions.

PR [#9](https://github.com/all1son4/dance-course-fe/pull/9) was merged as
`709459b`. The exact merge commit passed production
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31318491171), then the
controlled
[production expand migration](https://github.com/all1son4/dance-course-fe/actions/runs/31321100354)
applied `0011` through `0013` and advanced production from 11 to 14 migrations. The
post-migration invariant audit reported zero violations; versioned inbox/outbox queues
reported zero ready jobs, stale leases, retries, and dead letters; transitional Sheets
export lag was zero. The exact production deployment then passed the repeated
[post-migration critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31318520921).
No DB worker flag was enabled and no user journey changed.

## Phase DATA: backfill and reconciliation

Status: `DONE`

### DATA-01 — Produce protected source snapshots

Create a database backup, a controlled Sheets export, checksums, and a cut-off time.

Status: `DONE`. The read-only capture, checksum manifest, explicit cross-source capture
window, AES-256-GCM/RSA protection, and authenticated recovery command are implemented.
No credential was copied to GitHub; the existing local environment was used with a
`spreadsheets.readonly` OAuth token. Development and production captures were created
with PostgreSQL 17.10, decrypted with the owner-held key, and restored into separate
disposable PostgreSQL 17 clusters. Aggregate verification passed, and every plaintext
file and temporary cluster was deleted. The implementation does not change schema,
runtime flags, or user flows; rollback is removal of maintenance tooling only.
Capture IDs, cut-off times, checksums, counts, and recovery evidence are in
[`data-source-snapshots.md`](./data-source-snapshots.md).

### DATA-02 — Build a resumable backfill

Harden the existing dry-run-by-default, idempotent backfill instead of replacing it.
Use bounded batches rather than one large transaction; add checkpoints, restartability,
and insert, update, skip, and conflict counts.

Status: `DONE`. The implementation consumes the immutable `DATA-01` source,
validates its target/schema/checksum/private files, and requires explicit write
confirmation. Migration `0014` adds one checkpoint per target and source fingerprint.
Each bounded batch and checkpoint are atomic; the same command resumes after a pause,
while a completed fingerprint is a replay no-op. Duplicate keys, missing required
dependencies, and database rows newer than the source are counted as conflicts instead
of being silently overwritten. Unit tests, a real development-snapshot dry-run, all 26
local PostgreSQL integration tests, and a pause/resume/replay integration scenario pass.
No runtime flag or user flow changes. Development and production migrations,
one-batch pauses, resumes, and replay no-ops passed. The production backfill accounted
for all 258 source rows and retained newer database projections. Its post-run audit
found one supporting invoice counter behind an existing invoice; allocation was
already duplicate-safe through `max(invoices)`. Expand migration `0015` now keeps the
counter monotonic for every imported invoice and repairs existing lag. CI, its
development migration, a zero-violation development audit, and deployed critical
journeys passed. The exact production merge passed Quality and deployed smoke;
controlled production migration `0015` then succeeded, and the final production audit
reported zero violations for all 32 invariants. Full evidence is documented in
[`google-sheets-backfill.md`](./google-sheets-backfill.md).

### DATA-03 — Reconcile domain data

Extend the existing baseline and comparison tools to compare PaymentIntent IDs, Stripe
event IDs, money by currency and month, terminal payment state, active access, Telegram
bindings, invoices, delivery statuses, catalog data, and customer snapshots.

Status: `DONE`. Schema-v3 reconciliation uses one repeatable-read PostgreSQL snapshot,
records the cross-provider capture window, and compares matching domain rows as well as
keys and aggregates. Mismatch output contains only counts, field names, safe categories,
and hashed canonical keys. The old raw-ID comparison command now invokes the same
privacy-safe engine in strict mode. Forty-eight unit tests, full CI, deployed critical
journeys, and two stable read-only captures per environment passed. Production money,
catalog references, customer snapshots, invoices, reports, leads, side effects, and
Stripe event rows match; the stable access/Telegram/product-reference differences are
explicit input to DATA-04. Evidence:
[`data-reconciliation.md`](./data-reconciliation.md).

### DATA-04 — Resolve and record conflicts

Every conflict records its canonical source, decision, correction, owner, and time.
Do not invent historical consent evidence.

Status: `DONE`. Schema-v4 reconciliation classified value presence, safe status
transitions, timestamp drift, catalog evidence, and active access without exposing raw
identifiers. It removed two comparison false positives: an output-only `unknown`
product placeholder and sub-second timestamp precision that Sheets cannot preserve.
No production row was rewritten. The remaining production differences are expected,
newer PostgreSQL access state and expanded database-only Stripe/Online Group scope.
All 213 DATA-02 retained-row conflicts have an explicit canonical-source decision;
historical consent was not inferred. Evidence:
[`data-conflict-register.md`](./data-conflict-register.md).

### Gate G3

- Financial differences are zero.
- Every active access record is accounted for.
- Invoice identifiers are unique and explained.
- Re-running the backfill makes no additional changes.

Status: `PASSED`. Two stable production captures have zero financial differences,
zero active legacy access records missing from PostgreSQL, 23 matching unique invoice
identifiers, and an identical schema-v4 body fingerprint. The completed DATA-02 source
already replayed as `already_completed`; DATA-04 did not change backfill code, so no
private archive/key was reopened. A fresh production audit passed all 32 invariants.
No runtime flag or user journey changed.

## Phase WRITE: PostgreSQL-only authoritative writes

Status: `DONE`

### WRITE-01 — Persist Stripe events before acknowledging

Verify the signature, durably insert the inbox event, then return success. Return a
retryable error if the inbox cannot be written.

Status: `DONE`. The webhook now verifies the Stripe signature before making an
idempotent, awaited insert into the existing immutable PostgreSQL inbox. The inbox
write precedes both the Google Sheets configuration check and every legacy processor or
side effect. A rejected inbox write returns `500 stripe_webhook_inbox_failed`, so Stripe
can retry; an invalid signature returns `400` without creating a row. Duplicate delivery
keeps one verified provider record.

This is intentionally an ingress-only cut. The current synchronous Sheets processor,
database projection, and delivery side effects still run after the inbox gate until
`WRITE-02`/`WRITE-03`, preserving response bodies, checkout outcomes, and all user
journeys. No worker or feature flag is enabled by this task. Verified ignored and
charge-only events may remain `pending` during this short transition and must not be
manually replayed before the event-type policy in `WRITE-02` is deployed. Rollback is a
DB-compatible application revert: already recorded rows remain valid immutable
evidence, and no schema rollback is required.

The exact implementation revision `947796a` passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31500631054)
with 50 unit tests, 30 PostgreSQL integration tests, a fresh migration, logical
backup/restore, and a production build. Its Vercel development deployment passed all
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31500683969).
No production promotion was performed as part of this task.

### WRITE-02 — Process Stripe events asynchronously

Use leases, retry, backoff, dead-letter handling, replay, and the tested projection
state machine.

Status: `DONE`. Database write mode now acknowledges a verified Stripe event
immediately after its durable inbox insert and schedules bounded processing after the
response. The worker claims the existing row with an expiring lease, performs Stripe
enrichment outside the projection transaction, and then commits the purchase/access
projection, deterministic outbox jobs, and inbox completion atomically. Retryable
failures use bounded backoff; exhausted and explicitly non-retryable failures become
dead letters. Unsupported event types are completed as `skipped`, while supported
charge events settle against the same canonical purchase projection.

The immediate after-response run is supplemented by recovery from successful payment
status polling, the existing daily maintenance schedule, and an explicit bounded
operator command. Failed/dead-letter rows can be replayed without replacing immutable
provider evidence or resetting attempt counters. `DB_PAYMENT_EVENTS_MODE` and
`DB_SIDE_EFFECTS_MODE` must both be `database`; a mixed configuration fails closed and
the unset/default configuration preserves the synchronous legacy path. Enabling these
flags remains an explicit `CUT-03` operation, not part of this implementation task.

### WRITE-03 — Deliver side effects through the outbox

Use provider idempotency for email and Telegram delivery and persist final delivery
state.

Status: `DONE`. A successful purchase projection now creates versioned email,
Telegram-alert, and transitional `SuccessfulCustomers` export jobs in the same
transaction. Workers claim only those versioned jobs, load their immutable Stripe
event and canonical database payment record, and persist `sent`, `skipped`, retry, or
dead-letter state. Purchase email retains its stable Resend idempotency key. The
Sheets export is an idempotent upsert by payment-intent ID and does not mirror delivery
state back into the job it is currently executing.

Telegram Bot API does not accept a provider idempotency key for `sendMessage`.
Consequently the worker makes one provider attempt per claim: configuration failures
remain retryable, but an uncertain send response is dead-lettered for deliberate
operator review instead of risking a duplicate visible alert. Test-mode notification
suppression, recipient rules, access preparation, invoice behavior, and all existing
user-visible journeys remain unchanged.

The exact implementation revision `799fd54` passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31504924679)
with 59 unit tests, 37 PostgreSQL integration tests, a fresh PostgreSQL 17 migration,
logical backup/restore, and a production build. Its Vercel development deployment
passed all six
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31504988260).
The default legacy runtime and all production flags remain unchanged; actual domain
enablement is reserved for `CUT-03`.

### WRITE-04 — Move Telegram access writes to PostgreSQL only

Move the remaining timed/legacy Telegram paths to PostgreSQL-only writes and remove
their synchronous mirrors. Preserve the already database-native Online Group access
persistence and do not change the bot, renewal verification, identity reuse, or other
user flows.

Status: `DONE`. Timed channel access and legacy bot-start access now use an
explicit persistence boundary. With `DB_TELEGRAM_ACCESS_MODE=database`, token,
binding, entitlement, identity-reuse, membership, and revocation reads and writes go
directly to PostgreSQL; no write calls the Google Sheets facade or mutates the generic
flattened payment aggregate. The default and `shadow` modes retain the existing
database-first synchronous legacy mirror until the controlled `CUT-03` switch.

The DB command changes only the primary access entitlement and access-owned token or
binding rows. Binding writes use a PostgreSQL advisory transaction lock, including the
legacy `chat_id IS NULL` bot binding, so same-user retries and concurrent writers keep
one binding. Tests preserve start-token activation, same-user replay, timed access
starting on actual join, join/leave state, and immutable purchase money/outcome while
Google credentials are absent. Online Group access remains on its existing DB-native
implementation. Its renewal-only Telegram verification and membership checks are not
reused by ordinary purchases. Enabling the flag remains a `CUT-03` operation.

The exact implementation revision `7b53f36` passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31689006275)
with 62 unit tests, 39 PostgreSQL integration tests, a fresh PostgreSQL 17 migration,
logical backup/restore, and a production build. Its Vercel development deployment
passed all six
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31689063273).
The default legacy runtime and all production flags remain unchanged; actual domain
enablement is reserved for `CUT-03`.

### WRITE-05 — Move remaining admin invite writes to PostgreSQL only

The catalog is already DB-authoritative after `SAFE-07`. Replace the remaining admin
invite writes to flattened payments and `SuccessfulCustomers` with domain commands and
an optional outbox export, preserving existing workflows and commercial semantics.

Status: `DONE`. Both admin invite POST routes now use one explicit grant
persistence boundary. With `DB_BUSINESS_OPERATIONS_MODE=database`, a purpose-specific
command validates the active PostgreSQL catalog selection and atomically creates the
zero-value `admin_offer_link` purchase, primary entitlement, and at most one versioned
`successful_customer_export` outbox job. Concurrent retries are serialized by a
transaction advisory lock and conflicting reuse of a synthetic payment ID fails
closed. The technical grant retains `succeeded_at IS NULL`, so it remains outside
commercial sales totals.

The default and `shadow` modes preserve the existing synchronous Sheets mirror.
`DB_SHEETS_EXPORT_MODE=database` independently suppresses the transitional export;
until then export failure is asynchronous and cannot fail grant creation. Ordinary
admin links require the Telegram DB mode before this flag is enabled, while Online
Group continues through its already DB-native access implementation. GET history is
intentionally unchanged until `READ-05`.

The exact implementation revision `a8bdfd4` passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31694939855)
with 66 unit tests, 41 PostgreSQL integration tests, a fresh PostgreSQL 17 migration,
logical backup/restore, and a production build. Its Vercel development deployment
passed all six
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31694981774).
The default legacy runtime and all production flags remain unchanged; actual domain
enablement is reserved for `CUT-03` after the dependent READ cutovers.

### WRITE-06 — Move invoices, reports, and campaigns to PostgreSQL jobs

Allocate invoices atomically and deliver reports and campaigns through durable claims
and idempotent jobs.

Status: `DONE`. Explicit database mode now routes through the atomic invoice allocator
and purpose-specific report/campaign repositories.
Reports and each campaign recipient use versioned outbox jobs, expiring claims,
retry/dead-letter handling, and stable Resend idempotency keys; the existing admin
requests still wait for their bounded attempt, while daily maintenance and an
operator command recover unfinished jobs. Expand migration `0016` adds the campaign
`sending` state required to coordinate exclusion against delivery without provider I/O
inside a transaction. The default legacy/shadow runtime remains unchanged.

The exact implementation revision `bc9b4d5` passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31696784460)
with 69 unit tests, 45 PostgreSQL integration tests, a fresh PostgreSQL 17 migration,
logical backup/restore, and a production build. Its Vercel development deployment
passed all six
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31696847498).
The controlled development
[expand migration](https://github.com/all1son4/dance-course-fe/actions/runs/31696975280)
applied `0016`, after which all 32 invariants passed and the inbox/outbox had no ready,
stale, or dead-letter jobs. Production flags remain unchanged; actual domain
enablement is reserved for `CUT-03` after the dependent READ cutovers.

### WRITE-07 — Make Sheets a one-way optional export

Export only non-secret projections asynchronously. Export failure must not affect any
user request.

Status: `DONE`. The only database-mode runtime write to Sheets is now the isolated
[`Sheets export outbox`](../../src/lib/sheets-export-outbox.ts). It claims the existing
versioned `successful_customer_export` job independently from Stripe delivery, loads
the canonical PostgreSQL purchase projection, and crosses the provider boundary
through an explicit eleven-field allowlist. Raw Stripe payloads, outbox metadata,
credentials, Telegram access tokens, invite links, and membership identity never
enter the export DTO. The projection contains the same customer contact fields the
operator already receives in `SuccessfulCustomers`; they are not written to logs or
queue payloads.

Unset, `legacy`, and `shadow` export modes preserve the optional transitional export.
`DB_SHEETS_EXPORT_MODE=database` prevents new jobs in both Stripe and admin-grant
commands and marks an already queued versioned export `skipped` without loading its
customer projection or calling Google. Provider failure changes only the export job
to retry/dead-letter state. Stripe purchases receive an immediate bounded
after-response attempt, while daily maintenance recovers exports independently of
Stripe mode and credentials. The operational export-lag counter includes only
versioned claimable jobs, not historical legacy markers.

The exact implementation revision `283a363` passed
[Quality](https://github.com/all1son4/dance-course-fe/actions/runs/31698803709)
with 71 unit tests, 47 PostgreSQL integration tests, all 17 migrations on fresh
PostgreSQL 17, logical backup/restore, and a production build. Its Vercel development
deployment passed all six
[critical journeys](https://github.com/all1son4/dance-course-fe/actions/runs/31698847588).
A post-deployment development audit passed all 32 invariants and reported zero ready,
working, retry, stale, or dead-letter inbox/outbox jobs and zero waiting versioned
Sheets exports. No schema or production flag changed.

### Gate G4

In database write modes, blocking the Google Sheets API must not break checkout,
Stripe webhooks, Telegram access, email, reports, campaigns, or admin write operations.
Sheets-backed read views remain explicitly in `READ-02` through `READ-06` and are
verified at Gate G5, so this write-side gate does not claim that Google credentials can
already be removed from the whole runtime.

Status: `PASSED`. The provider-block PostgreSQL test completes the verified Stripe
inbox and canonical succeeded purchase, finalizes email and Telegram jobs, and leaves
only the simulated blocked export in retry. Separate credential-free database-mode
integration tests cover Telegram persistence, admin grants, invoices, reports, and
campaigns; the database-authoritative checkout is already covered by its fail-closed
catalog tests. `DB_SHEETS_EXPORT_MODE=database` is tested to enqueue no export and to
skip an existing job without a Google call. The exact tree also passed the deployed
Vercel critical journeys and the clean development database checks recorded above.
The remaining runtime Google imports were re-inventoried as legacy/read boundaries for
the next phase.

## Phase READ: PostgreSQL-only reads

Status: `IN_PROGRESS`

Switch domains independently, with shadow comparison before each switch:

1. `READ-01`: catalog and checkout — `DONE` early by `SAFE-07`;
2. `READ-02`: payments and Stripe events — `IN_PROGRESS`;
3. `READ-03`: remaining timed/legacy Telegram access; Online Group persistence is
   already DB-native;
4. `READ-04`: invoices, reports, and campaigns;
5. `READ-05`: remaining admin invite/history read models;
6. `READ-06`: remove automatic Sheets fallback.

### READ-02 — Payments and Stripe events

Status: `IN_PROGRESS`. The post-payment access endpoint now resolves its payment
context through an explicit read boundary controlled by the existing
`DB_PAYMENT_EVENTS_MODE`. Unset/`legacy` preserves the current DB-first facade and its
Sheets fallback. `shadow` still returns that exact result while independently
comparing PostgreSQL with an explicit Sheets read. `database` reads PostgreSQL only:
a missing row stays missing and a database error fails closed instead of consulting
Sheets. This changes only storage selection; PaymentIntent precedence, checkout retry
selection, succeeded gating, response states, and every Telegram access flow remain
unchanged.

The same shadow boundary compares legacy Stripe-event finality with the immutable
PostgreSQL inbox. Diagnostics contain only the record type, status, differing field
names, and a SHA-256 lookup-key hash; values, customer data, payment IDs, event IDs,
and provider payloads are not logged. The PostgreSQL checkout lookup now orders in SQL
and returns one deterministic newest row, fixing the previous bounded in-memory sort
that could inspect the ten oldest attempts instead.

No schema migration or production flag change is required. Rollback is an application
revert or `legacy` mode. Enabling `database` remains a `CUT-03` operation coupled with
the already documented Stripe write-mode switch; `shadow` can be enabled beforehand
without changing the synchronous writer. Local format, lint, TypeScript, all 78 unit
and characterization tests, and the production build pass. The credential-free
PostgreSQL integration test is committed but awaits the CI PostgreSQL 17 service
because this workstation has no configured `TEST_DATABASE_URL`.

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
- `HARD-04`: finish remaining accessibility, locale, polling, and navigation
  correctness without redoing the verified payment-result gate from `SAFE-10`;
- `HARD-05`: split large modules by domain responsibility;
- `HARD-06`: hermetic fonts, media delivery, remaining dependency cleanup, and
  onboarding docs; the production advisory fix from `SAFE-11` stays complete;
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

| Date       | Item                        | Status        | Evidence                                                      |
| ---------- | --------------------------- | ------------- | ------------------------------------------------------------- |
| 2026-07-30 | Repository-wide audit       | `DONE`        | Audit discussion and local checks                             |
| 2026-07-30 | Roadmap v1.3                | `DONE`        | This document                                                 |
| 2026-07-30 | BASE-01                     | `DONE`        | ADR-001 accepted                                              |
| 2026-07-30 | BASE-02                     | `DONE`        | Current behavior contract recorded                            |
| 2026-07-30 | BASE-03                     | `DONE`        | Seven Sheets and all dependency classes inventoried           |
| 2026-07-30 | BASE-05 Telegram scope      | `DONE`        | ADR-002 accepted                                              |
| 2026-07-30 | BASE-04 tooling             | `DONE`        | Read-only command and privacy fixture tests                   |
| 2026-07-30 | BASE-04 capture             | `SUPERSEDED`  | Initial blocked attempt; replaced by the completed capture    |
| 2026-07-30 | BASE-05 decision draft      | `DONE`        | Defaults prepared before owner confirmation                   |
| 2026-07-30 | BASE-05 owner decisions     | `DONE`        | Owner accepted all four migration decisions                   |
| 2026-08-06 | BASE-04 capture             | `DONE`        | Stable dev/prod fingerprints; differences classified          |
| 2026-08-06 | Gate G0                     | `PASSED`      | Behavior, dependency, data, and decision baselines accepted   |
| 2026-08-06 | Gate G0 formal audit        | `DONE`        | All 26 Sheets components classified; documents reconciled     |
| 2026-08-06 | SAFE-01                     | `DONE`        | Clean/local and remote CI passed; `main` requires `Quality`   |
| 2026-08-06 | SAFE-02                     | `DONE`        | 14 unit, 2 PostgreSQL, and 3 deployed browser tests passed    |
| 2026-08-07 | SAFE-03                     | `DONE`        | Migration-free release; dev/prod no-op controls passed        |
| 2026-08-08 | SAFE-04                     | `DONE`        | Atomic terminal outcomes; race and deployed smoke tests pass  |
| 2026-08-08 | SAFE-05                     | `DONE`        | Atomic claims, DB invariant, and eight-way race test passed   |
| 2026-08-08 | SAFE-06                     | `DONE`        | Reuse characterized at accepted decision boundary             |
| 2026-08-08 | SAFE-07                     | `DONE`        | DB-authorized catalog; remote CI and four browser tests pass  |
| 2026-08-08 | SAFE-08                     | `DONE`        | Versioned consent evidence; CI, PostgreSQL, 5 browser tests   |
| 2026-08-08 | SAFE-09                     | `DONE`        | Formula-safe CSV; CI and five deployed browser tests pass     |
| 2026-08-08 | SAFE-10                     | `DONE`        | Verified result gate; CI and six browser tests pass           |
| 2026-08-09 | SAFE-11                     | `DONE`        | Zero production advisories; CI and six browser tests pass     |
| 2026-08-09 | Gate G1                     | `PASSED`      | SAFE-01 through SAFE-11 acceptance criteria verified          |
| 2026-08-09 | Roadmap current-state audit | `DONE`        | Remaining phases reconciled with current code and schema      |
| 2026-08-09 | DB-01                       | `DONE`        | PostgreSQL domain and transaction ownership recorded          |
| 2026-08-09 | DB-02 development           | `DONE`        | Preflight, CI, dev migration, audit, and smoke passed         |
| 2026-08-09 | DB-03 development           | `DONE`        | Inbox migration, CI, dev apply, audit, and smoke passed       |
| 2026-08-11 | DATA-01                     | `DONE`        | Dev/prod encrypted captures and PG17 restores passed          |
| 2026-08-11 | DATA-02 implementation      | `DONE`        | Snapshot validation, atomic checkpoints, resume tests pass    |
| 2026-08-11 | DATA-02 development         | `DONE`        | Migration, pause/resume/replay, invariants, smoke passed      |
| 2026-08-11 | DATA-02 production backfill | `DONE`        | 258 rows accounted; replay no-op; plaintext removed           |
| 2026-08-11 | DATA-02 counter invariant   | `DONE`        | Dev/prod migration and zero-violation audits passed           |
| 2026-08-11 | DATA-03                     | `DONE`        | Schema-v3 per-key captures stable in dev/prod; CI/smoke pass  |
| 2026-08-11 | DATA-04                     | `DONE`        | Every production/backfill conflict classified; no data write  |
| 2026-08-11 | Gate G3                     | `PASSED`      | Stable finance/access/invoice/replay evidence; 32 audits pass |
| 2026-08-11 | WRITE-01                    | `DONE`        | Pre-ack inbox gate; CI, PG17 and deployed dev smoke pass      |
| 2026-08-11 | WRITE-02 implementation     | `DONE`        | Async inbox worker; CI, PG17 and deployed dev smoke pass      |
| 2026-08-11 | WRITE-03 implementation     | `DONE`        | Durable delivery; CI, PG17 and deployed dev smoke pass        |
| 2026-08-13 | WRITE-04 implementation     | `DONE`        | DB-only path; CI, PG17 and deployed dev smoke pass            |
| 2026-08-13 | WRITE-05 implementation     | `DONE`        | Atomic grants; CI, PG17 and deployed dev smoke pass           |
| 2026-08-13 | WRITE-06 implementation     | `DONE`        | Durable jobs; CI, PG17, dev migration and smoke pass          |
| 2026-08-13 | WRITE-07 implementation     | `DONE`        | Isolated allowlisted export; blocked-provider tests pass      |
| 2026-08-13 | Gate G4                     | `PASSED`      | DB write paths survive blocked Sheets; dev queues clean       |
| 2026-08-13 | READ-02 implementation      | `IN_PROGRESS` | Payment/Stripe read boundary; local checks pass, CI pending   |
