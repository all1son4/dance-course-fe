# Data baseline procedure

Status: complete
Implemented: 2026-07-30
Accepted: 2026-08-06

This document preserves the accepted BASE-04 schema-v2 evidence. The operational
comparison was extended by DATA-03 into a privacy-safe per-key schema-v3 report; see
[`data-reconciliation.md`](./data-reconciliation.md). The historical fingerprints
below are intentionally not rewritten.

## Purpose

`BASE-04` requires a repeatable comparison of PostgreSQL and all seven Google Sheets
without changing either source and without putting personal data, bearer tokens, or
invite links into the report.

The command is:

```bash
npm run db:baseline:sheets
```

It selects the database environment through the existing `DATABASE_ENV` rules.
Development is the default. Production is explicit:

```bash
env DATABASE_ENV=production npm run db:baseline:sheets
```

## Enforced read-only behavior

The command:

- uses an isolated unpooled PostgreSQL connection;
- starts a transaction and executes `SET TRANSACTION READ ONLY` before querying;
- performs only Google Sheets values API `GET` requests;
- disables the existing schema/header synchronization performed by normal Sheet
  readers;
- never invokes backfill, upsert, append, migration, or provider side effects.

The read-only Sheet mode is implemented as an explicit option on the maintenance list
functions. Existing runtime callers keep their current behavior.

## Report contents

The JSON report contains:

- counts, unique counts, duplicate counts, and deterministic SHA-256 fingerprints for
  purchases, Stripe events, invoice numbers, Telegram tokens, Telegram bindings,
  monthly report runs, campaign leads, and `SuccessfulCustomers`;
- missing/extra/duplicate samples as SHA-256 hashes, never raw identifiers;
- succeeded-payment totals and counts by currency and UTC month;
- outcome and delivery status summaries;
- PostgreSQL entitlement, side-effect, renewal, Online Group, and verification status
  summaries;
- an identifier-free mismatch breakdown by payment state, Stripe event source/type,
  Telegram product/link kind, and status;
- the active/inactive product, offer, currency-price, workflow, and access-duration
  catalog;
- a deterministic fingerprint of the report body.

`SuccessfulCustomers` is compared as a derivable projection against succeeded
PostgreSQL purchases. This closes its previous comparison-tooling gap without treating
the worksheet as a new authoritative domain.

## Privacy properties

The report does not include:

- customer email, name, address, social contact, or Telegram username;
- Telegram user IDs or chat IDs;
- PaymentIntent IDs, Stripe event IDs, lead IDs, or token IDs in plaintext;
- token hashes, token values, bot start parameters, or invite links;
- report recipients, provider message IDs, or raw error payloads;
- database URLs, Google credentials, or worksheet IDs.

Catalog external IDs and commercial prices remain visible because they are product
configuration rather than customer or bearer data.

Fixture tests inject known private values and assert that none appear in serialized
output.

## Options

```text
--sample-limit=N   maximum number of hashed mismatch samples per domain
--strict           exit with status 1 when any comparison or financial total differs
--output=PATH      create a mode-0600 JSON file; refuses to overwrite an existing file
```

Without `--output`, the safe report is written to stdout.

## Timestamp limitation

PostgreSQL monthly financial totals use `purchases.succeeded_at`, falling back to
`first_seen_at` only when historical data lacks the success timestamp.

The Payments worksheet has no dedicated succeeded timestamp. Its monthly grouping uses
`successful_customer_logged_at`, then `first_seen_at` or `updated_at`. Therefore:

- totals by currency are the primary financial equality check;
- a monthly mismatch must be investigated before it is treated as a money mismatch;
- future PostgreSQL-only reporting must use `succeeded_at`.

## Capture log

| Date       | Environment           | Result                                                   |
| ---------- | --------------------- | -------------------------------------------------------- |
| 2026-07-30 | development, pooled   | Connection timeout before data read                      |
| 2026-07-30 | production, pooled    | Connection timeout before data read                      |
| 2026-07-30 | development, unpooled | Connection timeout before data read                      |
| 2026-07-30 | production, unpooled  | Connection timeout before data read                      |
| 2026-08-06 | development, unpooled | Captured twice; reviewed mismatch; stable fingerprint    |
| 2026-08-06 | production, unpooled  | Captured twice; expected differences; stable fingerprint |

The accepted schema-v2 fingerprints are:

| Environment | Capture times (UTC)            | Stable report fingerprint                                          |
| ----------- | ------------------------------ | ------------------------------------------------------------------ |
| development | `13:07:24.190`, `13:07:40.334` | `a87829c51263f830a3cf999fc86aaa3c8c893e87e29cdce9f26c704ebbe2fbf3` |
| production  | `13:07:20.833`, `13:07:40.172` | `933043ea6ef18e64bd379ab54ea2a81cbaf8ecf6d1fd03d9d317d00adadffe72` |

The reports were written as mode-`0600` files under `/private/tmp` and were not added
to the repository. They contain no plaintext customer identifiers, Telegram IDs,
bearer tokens, invite links, or credentials.

## Evidence retention policy

Git stores the reproducible command, report schema, privacy tests, capture times,
stable fingerprints, reviewed aggregates, and explanations below. Full JSON reports
are temporary operational artifacts and are not committed because they contain
internal financial totals and complete commercial catalog configuration.

This fingerprint-and-reviewed-summary record is the accepted `BASE-04` evidence. It
can be reproduced with the same read-only command, but it is not a protected migration
snapshot and must never be used as a backfill source. Durable database backups and
controlled Sheet exports belong to `DATA-01`, where storage, access, checksum, and
cut-off handling are defined in
[`data-source-snapshots.md`](./data-source-snapshots.md).

## Accepted production baseline

Production user and financial projections match:

- `Payments`: 68 PostgreSQL rows and 68 Sheet rows with the same 68 unique
  PaymentIntent keys;
- outcomes: 54 succeeded, 11 canceled, and 3 failed in both sources;
- succeeded totals: EUR 134,500 minor units across 30 purchases and PLN 58,500 minor
  units across 24 purchases;
- totals also match for every UTC month;
- `SuccessfulCustomers`: 54/54 unique keys;
- invoices: 19/19 unique numbers;
- monthly report runs: 5/5 unique keys;
- email campaign leads: 1/1 unique key;
- no duplicate, database-only, or Sheet-only key exists in those projections.

The report remains `mismatch` in strict raw-equality mode because three technical
domains intentionally have a wider PostgreSQL scope:

| Domain                 | PostgreSQL | Sheets | Explained PostgreSQL-only rows                                           |
| ---------------------- | ---------- | ------ | ------------------------------------------------------------------------ |
| Stripe events          | 158        | 127    | 31 `payment_intent.succeeded` rows from `stripe_settlement_backfill`     |
| Telegram access tokens | 50         | 20     | 30 Online Group channel-invite rows from its database-native access flow |
| Telegram user bindings | 42         | 17     | 25 active Online Group bindings from the same database-native flow       |

Every Sheet key in these three domains exists in PostgreSQL. The additional Stripe
rows are deliberate settlement evidence and are not supposed to be exported to the
legacy `StripeEvents` worksheet. The additional Telegram rows all belong to the Online
Group product, whose current implementation persists this access state directly in
PostgreSQL. Removing them to force equality would destroy authoritative data.

The production catalog snapshot contains 5 products, 11 offers, and 22 currency-price
rows; all are active. Domain state summaries were captured for entitlements, side
effects, renewal verification/campaigns, Online Group campaigns, reports, and email
campaigns. One existing failed admin Telegram alert is visible consistently in the
database/Payments state summaries; it is an operational delivery result, not a source
reconciliation difference.

## Accepted development baseline

Development contains intentional test history and legacy duplicate rows. It is useful
as a regression fixture but is not production authority:

- PostgreSQL and `Payments` have the same 38 unique PaymentIntent keys; the Sheet has
  one duplicate keyed row and five empty legacy rows;
- one reused test PaymentIntent is currently `requires_action` in PostgreSQL but has a
  stale `succeeded` Sheet state for PLN 6,000 minor units in June 2026; the same stale
  intent explains the single Sheet-only `SuccessfulCustomers` key;
- `SuccessfulCustomers` also has three duplicate rows, while four succeeded Online
  Group purchases are database-only by design;
- the 30 database-only Stripe events are all synthetic settlement-backfill events; the
  Sheet has four historical duplicate event rows;
- the 6 database-only Telegram tokens and 5 database-only bindings all belong to the
  Online Group database-native flow; the Sheet has one historical duplicate binding.

These differences are fully classified and stable across the two accepted captures.
They were not “fixed” because editing non-authoritative development Sheets would erase
useful historical evidence and was outside this read-only baseline task.

No database or Sheet write was attempted during any capture.

## BASE-04 acceptance checklist

- [x] Command is read-only by construction.
- [x] All seven worksheets are covered.
- [x] PostgreSQL catalog and domain-status summaries are covered.
- [x] Raw customer data and bearer material are excluded.
- [x] Safe aggregation and mismatch hashing have fixture tests.
- [x] Development report captured and reviewed.
- [x] Production report captured and reviewed.
- [x] Every mismatch is explained or corrected.
- [x] Final fingerprints and capture times are recorded in the roadmap.
