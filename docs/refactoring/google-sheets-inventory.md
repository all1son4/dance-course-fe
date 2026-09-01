# Google Sheets dependency inventory

Status: baseline complete
Captured: 2026-07-30
Call-site audit refreshed: 2026-09-01 (`DROP-01`, Stripe runtime slice)
Scope: runtime, maintenance tooling, and type coupling

## Purpose

This document records the current dependency on Google Sheets before any cutover work.
It is an inventory of the implementation, not a proposal to change user behavior.

PostgreSQL is the target source of truth. During migration, a one-way asynchronous
PostgreSQL-to-Sheets export may remain for operational visibility. Runtime fallback,
dual authoritative writes, and Sheets-based coordination must not remain in the final
architecture.

## Current persistence semantics

Seven worksheets are currently connected:

- `Payments`;
- `StripeEvents`;
- `SuccessfulCustomers`;
- `TelegramAccessTokens`;
- `TelegramUserBindings`;
- `MonthlySalesReports`;
- `EmailCampaignLeads`.

The shared facade in
[`src/lib/google-sheets.ts`](../../src/lib/google-sheets.ts) currently has these
semantics:

- every facade read requires an explicit `source: "database"` or `source: "sheets"`;
- database reads preserve missing results and propagate failures without consulting
  Sheets;
- runtime reads use purpose-specific PostgreSQL repositories;
- admin grants, invoice allocation, monthly reports, campaigns, and Telegram access
  use PostgreSQL commands unconditionally; the only intentional business export is
  the optional isolated `SuccessfulCustomers` outbox;
- Stripe webhook processing always uses the durable PostgreSQL inbox, atomic
  projection, and transactional outbox.

There is no automatic database-to-Sheets fallback. Sheets can no longer affect a
runtime read, authoritative write, webhook result, or side-effect lease. The isolated
exporter and offline migration tools intentionally retain provider access until their
dedicated `DROP` slices.

Catalog authorization is not a Sheets domain. Since `SAFE-07`, catalog and checkout
commercial selection read PostgreSQL only and fail closed; code constants cannot
authorize a purchase. The remaining Sheets migration must not reintroduce catalog
fallback.

## Classification legend

- `R`: read.
- `W`: write.
- `M`: synchronous PostgreSQL-to-Sheets mirror.
- `F`: fallback or an explicit Sheets read used by runtime code.
- `C`: coordination, deduplication, lock, lease, or counter.
- `X`: operational export.
- `T`: type-only coupling.
- `MT`: maintenance or migration tooling.
- `E`: Google configuration, error-type, or rate-limit coupling without a direct data
  operation in that file.

## Domain inventory

| Domain                                   | Current classifications | Main call sites                                                                                                                                                                                                                              | Target PostgreSQL owner                                                                         | Removal point                                                                        |
| ---------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Payments projection                      | `T`                     | PostgreSQL projection/read models plus temporary Sheet-shaped compatibility DTOs                                                                                                                                                             | Purchase commands plus a dedicated `PurchaseReadModel`                                          | Runtime dependency removed in `DROP-01`; DTO moves in `DROP-04`                      |
| Stripe events                            | —                       | Immutable PostgreSQL inbox and tested projection worker                                                                                                                                                                                      | `stripe_events` immutable inbox                                                                 | Runtime dependency removed in `DROP-01`                                              |
| Successful customers                     | `X/T`                   | Optional versioned outbox exporter                                                                                                                                                                                                           | Derivable query over succeeded purchases; temporary export through the outbox if still required | Disable in `DROP-02`; adapter/schema cleanup in `DROP-04`                            |
| Telegram access tokens                   | `T`                     | PostgreSQL-only access engine plus temporary compatibility DTOs                                                                                                                                                                              | Telegram access repository with atomic issue, claim, revoke, and hash lookup commands           | Runtime dependency removed in `DROP-01`; DTO moves in `DROP-04`                      |
| Telegram user bindings                   | `T`                     | PostgreSQL-only access engine plus temporary compatibility DTOs                                                                                                                                                                              | Binding and entitlement repositories with explicit identity rules                               | Runtime dependency removed in `DROP-01`; DTO moves in `DROP-04`                      |
| Admin invite history                     | `T`                     | PostgreSQL-only read boundary plus the temporary Sheet-shaped compatibility DTO                                                                                                                                                              | Paginated SQL read model joining purchases, tokens, and entitlements                            | Runtime dependency removed in `DROP-01`; DTO moves in `DROP-04`                      |
| Invoice numbering                        | `T`                     | [`invoices/invoice-numbering.ts`](../../src/lib/invoices/invoice-numbering.ts)                                                                                                                                                               | Transactional database counter or advisory lock plus unique invoice constraints                 | Runtime read/write/lock dependency removed in `DROP-01`; DTO moves in `DROP-04`      |
| Purchase email and alert leases          | —                       | Transactional outbox with database leases                                                                                                                                                                                                    | `purchase_side_effects` with a unique purchase/kind key and atomic lease updates                | Sheet-backed leases removed in `DROP-01`                                             |
| Monthly reports                          | `T`                     | [`monthly-sales-report.ts`](../../src/lib/monthly-sales-report.ts)                                                                                                                                                                           | `monthly_report_runs` repository and idempotent outbox delivery                                 | Runtime read/write/lock dependency removed in `DROP-01`; DTO moves in `DROP-04`      |
| Email campaigns                          | `T`                     | [`email-campaigns.ts`](../../src/lib/email-campaigns.ts), course signup                                                                                                                                                                      | `email_campaign_leads` with a unique campaign/email key and outbox delivery                     | Runtime read/write/error dependency removed in `DROP-01`; DTO moves in `DROP-04`     |
| Google-specific configuration and errors | `X/MT`                  | Isolated exporter and offline migration tools                                                                                                                                                                                                | Separate exporter/tooling errors                                                                | Runtime dependency removed in `DROP-01`; remaining code exits in `DROP-02`/`DROP-04` |
| Sheet-shaped records                     | `T`                     | Telegram, invoices, Stripe sync and alerts, database adapters                                                                                                                                                                                | Domain commands and purpose-specific read DTOs                                                  | Remove after all callers stop using the flattened aggregate                          |
| Backfill and comparison                  | `R/MT`                  | [`db/backfill-google-sheets.ts`](../../src/db/backfill-google-sheets.ts), [`db/compare-google-sheets.ts`](../../src/db/compare-google-sheets.ts), [`db/capture-reconciliation-baseline.ts`](../../src/db/capture-reconciliation-baseline.ts) | Isolated, read-only legacy Sheets adapter                                                       | Keep through reconciliation and rollback observation; then archive or delete         |

## Exhaustive call-site register

This register is the evidence for Gate G0's “every call site is classified” condition.
It includes every direct import of the Sheets facade, every direct Sheet-schema type
dependency, and the facade/schema owners themselves. `rg` found no direct Google
Sheets/OAuth API endpoint outside `google-sheets.ts`; the unrelated Google Fonts URL is
not a data dependency.

All usages of the listed imported surface inside a file inherit that row's
classification. A new facade or schema import must be added here until `DROP-04`
removes the legacy boundary.

### Runtime and application modules

| Component                                                                                                         | Imported surface                                                                               | Class | Planned exit                                              |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------- |
| [`admin/invite-links/history`](../../src/app/admin/api/invite-links/history/route.ts)                             | PostgreSQL-only history reader; no Google facade or error dependency                           | —     | Runtime dependency removed in `DROP-01`                   |
| [`admin/invite-links`](../../src/app/admin/api/invite-links/route.ts)                                             | PostgreSQL-only grant boundary plus an optional one-way export job                             | `X`   | Runtime dependency removed in `DROP-01`                   |
| [`admin/online-group-invite-links`](../../src/app/admin/api/online-group-invite-links/route.ts)                   | PostgreSQL-only grant boundary plus an optional one-way export job                             | `X`   | Runtime dependency removed in `DROP-01`                   |
| [`course-signup`](../../src/app/api/course-signup/route.ts)                                                       | PostgreSQL-only campaign command; no Google error or rate-limit dependency                     | —     | Runtime dependency removed in `DROP-01`                   |
| [`stripe/database-sync`](../../src/app/api/stripe/webhook/_lib/database-sync.ts)                                  | database projection helpers plus compatibility payment DTO                                     | `T`   | Runtime dependency removed in `DROP-01`; DTO in `DROP-04` |
| [`stripe/purchase-alert`](../../src/app/api/stripe/webhook/_lib/purchase-alert.ts)                                | payment DTO                                                                                    | `T`   | `DB-07`, `DROP-04`                                        |
| `stripe/payment-status-lease`                                                                                     | deleted; purchase delivery leases are PostgreSQL outbox state                                  | —     | Removed in `DROP-01`                                      |
| [`stripe/purchase-telegram-alert`](../../src/app/api/stripe/webhook/_lib/side-effects/purchase-telegram-alert.ts) | PostgreSQL outbox delivery only                                                                | —     | Runtime dependency removed in `DROP-01`                   |
| [`stripe/sync`](../../src/app/api/stripe/webhook/_lib/sync.ts)                                                    | Stripe-to-database mapping plus compatibility payment DTO                                      | `T`   | Runtime dependency removed in `DROP-01`; DTO in `DROP-04` |
| [`stripe/webhook`](../../src/app/api/stripe/webhook/route.ts)                                                     | durable PostgreSQL inbox only                                                                  | —     | Runtime dependency removed in `DROP-01`                   |
| [`telegram/access-link`](../../src/app/api/telegram/access-link/route.ts)                                         | PostgreSQL-only payment/session reader; no Google facade or error dependency                   | —     | Removed in `DROP-01`                                      |
| [`email-campaigns`](../../src/lib/email-campaigns.ts)                                                             | PostgreSQL reads, commands, and durable delivery plus compatibility DTO                        | `T`   | Runtime dependency removed in `DROP-01`; DTO in `DROP-04` |
| [`invoice-numbering`](../../src/lib/invoices/invoice-numbering.ts)                                                | PostgreSQL-only atomic allocation plus compatibility DTO                                       | `T`   | Runtime dependency removed in `DROP-01`; DTO in `DROP-04` |
| [`admin-offer-grants`](../../src/lib/admin-offer-grants.ts)                                                       | PostgreSQL-only grant command and optional SuccessfulCustomers export boundary                 | `X`   | Runtime dependency removed in `DROP-01`                   |
| [`purchase-invoice`](../../src/lib/invoices/purchase-invoice.tsx)                                                 | payment DTO                                                                                    | `T`   | `DB-07`, `DROP-04`                                        |
| [`monthly-sales-report`](../../src/lib/monthly-sales-report.ts)                                                   | PostgreSQL-only report state and durable delivery plus compatibility DTO                       | `T`   | Runtime dependency removed in `DROP-01`; DTO in `DROP-04` |
| [`payment-read-runtime`](../../src/lib/payment-read-runtime.ts)                                                   | PostgreSQL-only payment/session reader plus the temporary Sheet-shaped compatibility DTO       | `T`   | `DROP-01`; DTO in `DROP-04`                               |
| [`sheets-export-outbox`](../../src/lib/sheets-export-outbox.ts)                                                   | isolated allowlisted `SuccessfulCustomers` outbox delivery                                     | `X/T` | `CUT-04`, `DROP-01`, `DROP-04`                            |
| [`telegram/access`](../../src/lib/telegram/access.ts)                                                             | PostgreSQL-only access engine with unchanged user-flow orchestration                           | `T`   | Runtime dependency removed in `DROP-01`                   |
| [`telegram/access-persistence`](../../src/lib/telegram/access-persistence.ts)                                     | PostgreSQL-only token, binding, entitlement, and atomic claim commands plus compatibility DTOs | `T`   | `DROP-01`; DTOs in `DROP-04`                              |
| [`telegram/access-read-runtime`](../../src/lib/telegram/access-read-runtime.ts)                                   | PostgreSQL-only payment, token, and binding reads plus compatibility DTOs                      | `T`   | `DROP-01`; DTOs in `DROP-04`                              |
| [`telegram/online-group-access`](../../src/lib/telegram/online-group-access.ts)                                   | payment DTO only; its access persistence is already database-native                            | `T`   | `DB-07`, `DROP-04`                                        |

### Maintenance, comparison, and internal adapters

| Component                                                                            | Imported surface                                                                  | Class           | Planned exit                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------- | ------------------------------------------------- |
| [`backfill-google-sheets`](../../src/db/backfill-google-sheets.ts)                   | six legacy Sheet list readers and DTOs                                            | `R/MT/T`        | `DATA-02`–`DATA-04`, `DROP-04`                    |
| [`capture-reconciliation-baseline`](../../src/db/capture-reconciliation-baseline.ts) | all seven values-only Sheet readers                                               | `R/MT/T`        | `DATA-03`, `CUT-04`, `DROP-04`                    |
| [`capture-source-snapshot`](../../src/db/capture-source-snapshot.ts)                 | protected DATA-01 source capture through the isolated legacy readers              | `R/MT/T`        | Keep through rollback observation; then `DROP-04` |
| [`compare-google-sheets`](../../src/db/compare-google-sheets.ts)                     | six Sheet/database list readers                                                   | `R/MT/T`        | `DATA-03`, `CUT-04`, `DROP-04`                    |
| [`payment-records`](../../src/db/payment-records.ts)                                 | Sheet-shaped payment/event DTOs used by database projections                      | `T`             | `DB-07`, `DROP-04`                                |
| [`sheet-records`](../../src/db/sheet-records.ts)                                     | all Sheet-shaped DTOs used by database facade adapters                            | `T`             | `DB-07`, `DROP-04`                                |
| [`reconciliation-baseline`](../../src/db/reconciliation-baseline.ts)                 | all seven Sheet DTOs used by the pure report builder                              | `MT/T`          | `CUT-04`, `DROP-04`                               |
| [`reconciliation-baseline.test`](../../src/db/reconciliation-baseline.test.ts)       | all seven Sheet headers/DTOs used by privacy fixtures                             | `MT/T`          | Keep with the baseline tool; remove at `DROP-04`  |
| [`google-sheets`](../../src/lib/google-sheets.ts)                                    | sole Google OAuth/values API facade, explicit reads, caches, mirror, coordination | `R/W/M/F/C/X/E` | `DROP-01`, then `DROP-04`                         |
| [`google-sheets-schema`](../../src/lib/google-sheets-schema.ts)                      | seven worksheet schemas and flattened record DTOs                                 | `T`             | `DROP-04`                                         |

## Remaining legacy and read coupling after READ-06

Database writes no longer require or perform a Google call. Their only intentional
external projection is the optional versioned export through
[`sheets-export-outbox.ts`](../../src/lib/sheets-export-outbox.ts); failure is contained
in that job. Automatic read fallback, synchronous Stripe processing, and Sheet-backed
leases are gone. The following explicit dependencies remain until their later slices:

1. The optional successful-customer exporter, reconciliation tools, snapshots, and
   backfill intentionally retain isolated Google access through the observation
   window.
2. Sheet-shaped DTOs remain coupled to legacy adapters and some database projections
   until `DROP-04` replaces the generic facade types.

## Type-coupling warning

`PaymentSheetRecord` is not only a transport type. It is currently used as a flattened
aggregate containing purchase, customer, entitlement, invoice, and side-effect state.
It appears in Telegram access, Online Group access, invoice rendering and numbering,
Stripe synchronization and alerts, and admin invite handling.

Replacing `FromSheets` functions with `FromDatabase` functions while retaining a
generic `upsertPaymentRecord` would preserve the most dangerous coupling: unrelated
domains could continue overwriting one another's fields. The target must use
domain-specific commands and purpose-specific read projections.

## Transitional components

Keep temporarily:

- a frozen copy of
  [`google-sheets-schema.ts`](../../src/lib/google-sheets-schema.ts);
- an isolated, read-only Sheets client for backfill and comparison;
- the current backfill and comparison scripts;
- if operationally required, a new PostgreSQL-outbox-to-Sheets exporter that cannot
  affect a user request or webhook result.

Remove at runtime cutover:

- all `source: "sheets"` runtime reads;
- mandatory Google configuration checks in business routes;
- Google-specific error handling in business logic;
- synchronous mirrors from every write;
- Sheets-backed deduplication, leases, and counters;
- UI and documentation that describe Sheets as a live mirror.

Completed at `READ-06`:

- the `auto` read source and all automatic database-to-Sheets fallback branches;
- implicit source selection at every shared-facade read call site.

Remove after reconciliation and the rollback observation window:

- the legacy backfill and comparison scripts;
- the shared Google Sheets facade and schema;
- Google service-account credentials and worksheet environment variables;
- the transitional exporter;
- remaining Sheet-shaped database adapters.

## SuccessfulCustomers migration rule

The legacy backfill and comparison scripts cover six of the seven worksheets.
`SuccessfulCustomers` is not backfilled by them.

The new
[`data-baseline`](data-baseline.md) command now reads `SuccessfulCustomers` in
values-only mode and compares its PaymentIntent keys with the derivable set of
succeeded PostgreSQL purchases. This closes the read-only baseline gap without
changing the legacy backfill.

Decision: `SuccessfulCustomers` is a derivable projection of succeeded purchases, not
an independent authoritative domain. Reconcile it by `payment_intent_id`; if the
operator still needs the worksheet during transition, produce it through the optional
PostgreSQL outbox exporter from `WRITE-07`. Do not backfill the worksheet into a new
source of truth.

Historical unversioned database markers with
`successful_customer_export=sent` are not proof that the Sheet write succeeded because
the legacy path stored them before the Google API call. For WRITE-07 versioned jobs,
`sent` is recorded only after the provider call returns successfully; `failed`,
`dead_letter`, and `skipped` remain distinct operational evidence.

## Recommended cutover order

1. Stripe event inbox, payment projection, and database-backed side-effect leases.
2. Telegram tokens, bindings, entitlements, and invite history.
3. Invoice allocation.
4. Monthly reports and email campaigns.
5. All remaining runtime reads, fallback branches, and synchronous mirrors.
6. A production-like verification run with Google credentials physically absent.
7. Maintenance tooling and credentials after the observation window.

This order describes storage and reliability work only. It does not change checkout,
payment-result, Telegram, renewal, access, or administrative user journeys.

## DROP-01 progress

The development-only slices on 2026-09-01 remove Google Sheets reads from admin
invite-link history, invoices, monthly reports, email campaigns, payment-access
resolution, and Telegram payment/token/binding lookups. These read boundaries now
call their PostgreSQL repositories unconditionally; their legacy/shadow selectors and
comparators are gone. The obsolete Stripe-event and Telegram shadow observers are
also removed. Admin history retains authentication, request limiting, fresh cache,
stale-on-database-failure behavior, response contract, and generic failure response.
Payment access retains payment-intent precedence, successful-checkout fallback, and
fail-closed database errors. Telegram access retains all lookup keys, missing-record
and collection semantics, and fail-closed database errors. Token, binding,
entitlement, identity-reuse, membership, and revocation writes plus atomic token
claims now also call PostgreSQL commands unconditionally. The Telegram runtime flag,
legacy mirrors, Google rate-limit branches, and obsolete admin-grant flag dependency
are removed. Online Group renewal verification remains isolated and unchanged.
Admin grants, invoice allocation, monthly-report recording/delivery, and campaign
signup, exclusion, and delivery are now PostgreSQL-only as well. Their synchronous
Sheet writes, Sheet-backed locks/counters, direct delivery branches, Google-specific
route errors, and `DB_BUSINESS_OPERATIONS_MODE` selector are removed. Daily
maintenance always recovers the business outbox.
Compatibility record types remain until `DROP-04`.

This cleanup is prepared and tested on `dev` only. The transitional exporter and
offline recovery/reconciliation readers remain intact, and no DROP code is eligible
for production before `2026-09-07T00:56:17Z`.
