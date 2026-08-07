# Google Sheets dependency inventory

Status: baseline complete
Captured: 2026-07-30
Call-site audit refreshed: 2026-08-06
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

- singleton reads in `auto` mode try PostgreSQL first and fall back to Sheets after
  either a database error or a missing database row;
- collection reads try PostgreSQL first and fall back to Sheets only after a database
  error;
- writes commit to PostgreSQL first and then synchronously mirror to Sheets;
- `upsertPaymentRecord` can disable the mirror, but no runtime caller does so;
- Stripe webhook processing also performs explicit `source: "sheets"` reads for
  deduplication, merging, and side-effect coordination.

PostgreSQL is therefore already first for most writes, but Sheets can still affect
runtime availability and business decisions. A successful database commit followed by
a failed Sheets call can also be reported as a failed operation.

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

| Domain                                   | Current classifications | Main call sites                                                                                                                                                                                                                              | Target PostgreSQL owner                                                                         | Removal point                                                                               |
| ---------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Payments projection                      | `R/W/M/F`               | Stripe sync and reconciliation, payment-status leases, Telegram access, invoice numbering, admin invite/history                                                                                                                              | Purchase commands plus a dedicated `PurchaseReadModel`                                          | Remove the generic Sheet-shaped facade after all callers use domain repositories            |
| Stripe events                            | `R/W/M/F/C`             | [`webhook/_lib/sync.ts`](../../src/app/api/stripe/webhook/_lib/sync.ts)                                                                                                                                                                      | Immutable `stripe_event_inbox` with unique provider/event ID and a tested projection worker     | Replace as the first runtime cutover slice; do not perform a one-for-one adapter swap       |
| Successful customers                     | `W/M/X/C`               | Stripe success sync and manual admin invite                                                                                                                                                                                                  | Derivable query over succeeded purchases; temporary export through the outbox if still required | Remove the separate runtime side effect at full Sheets retirement                           |
| Telegram access tokens                   | `R/W/M/F/C`             | [`telegram/access.ts`](../../src/lib/telegram/access.ts), admin history, maintenance                                                                                                                                                         | Telegram access repository with atomic issue, claim, revoke, and hash lookup commands           | Remove after token operations and history use PostgreSQL transactions and projections       |
| Telegram user bindings                   | `R/W/M/F/C`             | [`telegram/access.ts`](../../src/lib/telegram/access.ts), maintenance                                                                                                                                                                        | Binding and entitlement repositories with explicit identity rules                               | Remove after the existing behavior contract is covered and PostgreSQL operations are atomic |
| Admin invite history                     | `R/F`                   | [`admin/api/invite-links/history/route.ts`](../../src/app/admin/api/invite-links/history/route.ts)                                                                                                                                           | Paginated SQL read model joining purchases, tokens, and entitlements                            | Remove the in-memory composite loader after the read-model cutover                          |
| Invoice numbering                        | `R/W/M/F/C`             | [`invoices/invoice-numbering.ts`](../../src/lib/invoices/invoice-numbering.ts)                                                                                                                                                               | Transactional database counter or advisory lock plus unique invoice constraints                 | Replace before disabling payment-record fallback                                            |
| Purchase email and alert leases          | `R/W/M/F/C`             | [`payment-status-lease.ts`](../../src/app/api/stripe/webhook/_lib/side-effects/payment-status-lease.ts)                                                                                                                                      | `purchase_side_effects` with a unique purchase/kind key and atomic lease updates                | Replace with the outbox/lease slice                                                         |
| Monthly reports                          | `R/W/M/F/C`             | [`monthly-sales-report.ts`](../../src/lib/monthly-sales-report.ts)                                                                                                                                                                           | `monthly_report_runs` repository and idempotent outbox delivery                                 | Remove synchronous mirror after repository cutover                                          |
| Email campaigns                          | `R/W/M/F`               | [`email-campaigns.ts`](../../src/lib/email-campaigns.ts), course signup                                                                                                                                                                      | `email_campaign_leads` with a unique campaign/email key and outbox delivery                     | Remove Sheets error handling after repository cutover                                       |
| Google-specific configuration and errors | `E`                     | Stripe webhook, course signup, Telegram routes, admin invite routes, Telegram side effects                                                                                                                                                   | Database/domain errors and separate health reporting                                            | Remove from business requests at runtime cutover                                            |
| Sheet-shaped records                     | `T`                     | Telegram, invoices, Stripe sync and alerts, database adapters                                                                                                                                                                                | Domain commands and purpose-specific read DTOs                                                  | Remove after all callers stop using the flattened aggregate                                 |
| Backfill and comparison                  | `R/MT`                  | [`db/backfill-google-sheets.ts`](../../src/db/backfill-google-sheets.ts), [`db/compare-google-sheets.ts`](../../src/db/compare-google-sheets.ts), [`db/capture-reconciliation-baseline.ts`](../../src/db/capture-reconciliation-baseline.ts) | Isolated, read-only legacy Sheets adapter                                                       | Keep through reconciliation and rollback observation; then archive or delete                |

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

| Component                                                                                                         | Imported surface                                                                                | Class           | Planned exit                                |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------- |
| [`admin/invite-links/history`](../../src/app/admin/api/invite-links/history/route.ts)                             | `findAdminInviteLinkHistorySourceRecords`, Google errors/rate limits                            | `R/F/E`         | `READ-05`, `DROP-01`                        |
| [`admin/invite-links`](../../src/app/admin/api/invite-links/route.ts)                                             | `upsertPaymentRecord`, `appendSuccessfulCustomerRecord`, payment DTO, Google errors/rate limits | `W/M/X/E/T`     | `WRITE-05`, `WRITE-07`, `DROP-01`           |
| [`admin/online-group-invite-links`](../../src/app/admin/api/online-group-invite-links/route.ts)                   | `upsertPaymentRecord`, `appendSuccessfulCustomerRecord`, payment DTO, Google errors/rate limits | `W/M/X/E/T`     | `WRITE-05`, `WRITE-07`, `DROP-01`           |
| [`course-signup`](../../src/app/api/course-signup/route.ts)                                                       | Google errors/rate limits propagated by the campaign repository                                 | `E`             | `WRITE-06`, `READ-04`, `DROP-01`            |
| [`stripe/database-sync`](../../src/app/api/stripe/webhook/_lib/database-sync.ts)                                  | explicit Sheet `findPaymentRecordByIntentId`, payment DTO                                       | `R/F/T`         | `READ-02`, `DROP-01`                        |
| [`stripe/purchase-alert`](../../src/app/api/stripe/webhook/_lib/purchase-alert.ts)                                | payment DTO                                                                                     | `T`             | `DB-07`, `DROP-04`                          |
| [`stripe/payment-status-lease`](../../src/app/api/stripe/webhook/_lib/side-effects/payment-status-lease.ts)       | payment read/upsert, payment DTO, rate-limit handling                                           | `R/W/M/F/C/E/T` | `WRITE-03`, `READ-02`, `DROP-01`            |
| [`stripe/purchase-telegram-alert`](../../src/app/api/stripe/webhook/_lib/side-effects/purchase-telegram-alert.ts) | Google rate-limit handling                                                                      | `E`             | `WRITE-03`, `DROP-01`                       |
| [`stripe/sync`](../../src/app/api/stripe/webhook/_lib/sync.ts)                                                    | payment/event reads and upserts, successful-customer export, payment DTO                        | `R/W/M/F/C/X/T` | `WRITE-01`–`WRITE-03`, `READ-02`, `DROP-01` |
| [`stripe/webhook`](../../src/app/api/stripe/webhook/route.ts)                                                     | Google configuration and error type                                                             | `E`             | `WRITE-01`, `DROP-01`                       |
| [`telegram/access-link`](../../src/app/api/telegram/access-link/route.ts)                                         | payment/session reads, Google errors/rate limits                                                | `R/F/E`         | `READ-02`, `READ-03`, `DROP-01`             |
| [`email-campaigns`](../../src/lib/email-campaigns.ts)                                                             | campaign lead find/list/upsert and DTO                                                          | `R/W/M/F/T`     | `WRITE-06`, `READ-04`, `DROP-01`            |
| [`invoice-numbering`](../../src/lib/invoices/invoice-numbering.ts)                                                | payment find/list/upsert and DTO                                                                | `R/W/M/F/C/T`   | `WRITE-06`, `READ-04`, `DROP-01`            |
| [`purchase-invoice`](../../src/lib/invoices/purchase-invoice.tsx)                                                 | payment DTO                                                                                     | `T`             | `DB-07`, `DROP-04`                          |
| [`monthly-sales-report`](../../src/lib/monthly-sales-report.ts)                                                   | monthly-run find/upsert and DTO                                                                 | `R/W/M/F/C/T`   | `WRITE-06`, `READ-04`, `DROP-01`            |
| [`telegram/access`](../../src/lib/telegram/access.ts)                                                             | payment/token/binding reads and upserts, DTOs, rate-limit handling                              | `R/W/M/F/C/E/T` | `WRITE-04`, `READ-03`, `DROP-01`            |
| [`telegram/online-group-access`](../../src/lib/telegram/online-group-access.ts)                                   | payment DTO only; its access persistence is already database-native                             | `T`             | `DB-07`, `DROP-04`                          |

### Maintenance, comparison, and internal adapters

| Component                                                                            | Imported surface                                                            | Class           | Planned exit                                     |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------- | ------------------------------------------------ |
| [`backfill-google-sheets`](../../src/db/backfill-google-sheets.ts)                   | six legacy Sheet list readers and DTOs                                      | `R/MT/T`        | `DATA-02`–`DATA-04`, `DROP-04`                   |
| [`capture-reconciliation-baseline`](../../src/db/capture-reconciliation-baseline.ts) | all seven values-only Sheet readers                                         | `R/MT/T`        | `DATA-03`, `CUT-04`, `DROP-04`                   |
| [`compare-google-sheets`](../../src/db/compare-google-sheets.ts)                     | six Sheet/database list readers                                             | `R/MT/T`        | `DATA-03`, `CUT-04`, `DROP-04`                   |
| [`payment-records`](../../src/db/payment-records.ts)                                 | Sheet-shaped payment/event DTOs used by database projections                | `T`             | `DB-07`, `DROP-04`                               |
| [`sheet-records`](../../src/db/sheet-records.ts)                                     | all Sheet-shaped DTOs used by database facade adapters                      | `T`             | `DB-07`, `DROP-04`                               |
| [`reconciliation-baseline`](../../src/db/reconciliation-baseline.ts)                 | all seven Sheet DTOs used by the pure report builder                        | `MT/T`          | `CUT-04`, `DROP-04`                              |
| [`reconciliation-baseline.test`](../../src/db/reconciliation-baseline.test.ts)       | all seven Sheet headers/DTOs used by privacy fixtures                       | `MT/T`          | Keep with the baseline tool; remove at `DROP-04` |
| [`google-sheets`](../../src/lib/google-sheets.ts)                                    | sole Google OAuth/values API facade, caches, fallback, mirror, coordination | `R/W/M/F/C/X/E` | `DROP-01`, then `DROP-04`                        |
| [`google-sheets-schema`](../../src/lib/google-sheets-schema.ts)                      | seven worksheet schemas and flattened record DTOs                           | `T`             | `DROP-04`                                        |

## Critical runtime coupling

The following dependencies must be removed before Google credentials can be disabled:

1. [`stripe/webhook/route.ts`](../../src/app/api/stripe/webhook/route.ts) requires
   Google configuration before processing a webhook, including events whose durable
   state is already PostgreSQL-backed.
2. [`stripe/webhook/_lib/sync.ts`](../../src/app/api/stripe/webhook/_lib/sync.ts)
   explicitly reads payment and event rows from Sheets for successful-customer
   coordination, deduplication, and state merging.
3. [`stripe/webhook/_lib/database-sync.ts`](../../src/app/api/stripe/webhook/_lib/database-sync.ts)
   reads Sheets again after side effects to copy their statuses back into PostgreSQL.
4. [`payment-status-lease.ts`](../../src/app/api/stripe/webhook/_lib/side-effects/payment-status-lease.ts)
   stores email and alert leases inside a shared, flattened payment record.
5. [`telegram/access.ts`](../../src/lib/telegram/access.ts) uses the shared facade for
   payments, tokens, and bindings; Google rate limiting changes runtime control flow.
6. [`invoices/invoice-numbering.ts`](../../src/lib/invoices/invoice-numbering.ts)
   derives the next invoice number by scanning payment records instead of allocating
   it transactionally in PostgreSQL.
7. Reports, campaigns, and admin invite routes can still treat a Sheets failure as a
   failure of the whole request after a database write has succeeded.

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
- all automatic Sheets fallback branches;
- mandatory Google configuration checks in business routes;
- Google-specific error handling in business logic;
- synchronous mirrors from every write;
- Sheets-backed deduplication, leases, and counters;
- UI and documentation that describe Sheets as a live mirror.

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

The existing database marker `successful_customer_export=sent` is not proof that the
Sheet write succeeded because it is stored before the Google API call.

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
