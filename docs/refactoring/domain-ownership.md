# PostgreSQL domain ownership

Status: accepted implementation boundary for `DB-01`
Captured: 2026-08-09
Scope: target ownership, repository boundaries, and transaction boundaries

## Purpose

This document defines which PostgreSQL model owns each piece of runtime state before
the remaining dual-write code is changed. It is an implementation boundary, not a
product redesign. The journeys in the
[`behavior contract`](behavior-contract.md) remain authoritative.

PostgreSQL is the only target source of truth. Google Sheets may temporarily receive
an asynchronous projection for operational use, but it must not authorize a purchase,
coordinate work, or become a runtime fallback.

## Ownership rules

1. Each business fact has one authoritative PostgreSQL owner.
2. A repository changes only the tables owned by its domain. Cross-domain read models
   are read-only projections, not generic update surfaces.
3. `PaymentSheetRecord` and the other flattened Sheet records are migration DTOs, not
   domain models. New domain code must not depend on them.
4. Provider payloads are immutable evidence. Derived application state is updated by
   an explicit, replayable projection.
5. A database transaction may persist an inbox item, update a projection, or enqueue
   an outbox item. It must not contain a Stripe, Telegram, Resend, or Google HTTP call.
6. Cutover is manual and domain-specific. A PostgreSQL failure is visible or
   fail-closed; it never triggers an automatic fallback to Sheets.

## Domain owners

| Domain                             | Authoritative PostgreSQL owner                                                                                                                                                      | Boundary and remaining work                                                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog and checkout authorization | `products`, `product_offers`, `offer_prices`, `online_group_campaigns`                                                                                                              | [`sellable-products.ts`](../../src/db/sellable-products.ts) is already authoritative and fail-closed. Code constants are presentation and seed/recovery inputs only. No Sheets cutover remains for this domain.                                                                   |
| Customers and purchases            | `customers`, `purchases`                                                                                                                                                            | Purchase commands own customer snapshots, commercial selection, money, provider identifiers, and projected payment state. Replace the flattened `Payments` facade with purpose-specific commands and read models.                                                                 |
| Checkout consent                   | `checkout_consent_evidence`                                                                                                                                                         | Immutable, versioned evidence belongs to the purchase. Never synthesize historical acceptance during backfill.                                                                                                                                                                    |
| Stripe event inbox                 | Evolve `stripe_events` in place                                                                                                                                                     | Preserve existing rows and unique Stripe event IDs. Add pending/lease/attempt/retry/dead-letter lifecycle fields instead of creating a parallel event store. The verified payload and provider time are immutable.                                                                |
| Payment projection                 | `purchases` plus domain-owned dependent rows                                                                                                                                        | Extract and reuse the monotonic reducer already exercised by [`database-sync.ts`](../../src/app/api/stripe/webhook/_lib/database-sync.ts). One inbox event transactionally updates the projection and enqueues required effects; it does not call providers.                      |
| Access and Telegram identity       | `access_entitlements`, `telegram_access_tokens`, `telegram_user_bindings`, `telegram_chats`, `renewal_campaigns`, `renewal_campaign_source_chats`, `telegram_renewal_verifications` | Atomic token claiming is already implemented. Online Group access persistence is already database-native; the remaining timed/legacy access paths and Sheet-shaped DTO coupling move behind explicit access repositories without changing identity reuse or renewal verification. |
| Invoices                           | `invoices` plus an atomic PostgreSQL sequence/counter                                                                                                                               | Invoice identity and delivery state belong here. Replace scanning `Payments` for the next number with transactional allocation protected by a uniqueness invariant.                                                                                                               |
| External side effects              | Evolve `purchase_side_effects` into the general outbox                                                                                                                              | The current table is a proto-outbox for purchase effects. Extend its deterministic keys, leases, attempts, retry scheduling, and dead-letter state for email, Telegram, reports, campaigns, and any temporary Sheets export rather than adding an unrelated queue.                |
| Monthly reports                    | `monthly_report_runs` plus SQL projections and outbox delivery                                                                                                                      | Report totals come from PostgreSQL. A run and its delivery are idempotent; Sheets is at most a temporary export target.                                                                                                                                                           |
| Email campaigns                    | `email_campaign_leads` plus recipient claims and outbox delivery                                                                                                                    | Lead uniqueness and campaign membership stay in PostgreSQL. Delivery uses durable per-recipient claims and deterministic effect keys.                                                                                                                                             |
| Renewal campaigns                  | `renewal_campaigns`, `renewal_campaign_source_chats`, `telegram_renewal_verifications`                                                                                              | These tables own renewal configuration and the renewal-only Telegram verification flow. This verification is not added to ordinary purchases.                                                                                                                                     |
| Admin views and actions            | Purpose-specific repositories and SQL read models over the owners above                                                                                                             | Preserve current operator workflows. Manual invite actions issue domain commands; history is a paginated read projection and cannot update a flattened payment aggregate.                                                                                                         |
| Successful customers               | Derivable query over succeeded `purchases`                                                                                                                                          | `SuccessfulCustomers` is not an independent domain. If still needed during transition, generate it through the outbox as a one-way projection.                                                                                                                                    |

The physical table definitions are in [`schema.ts`](../../src/db/schema.ts). Additive
schema work in `DB-02` through `DB-06` may refine the structures above, but it must not
move authority back into a shared Sheet-shaped aggregate.

## Command and read boundaries

Write repositories expose intent-specific commands such as recording a verified
event, applying a payment outcome, claiming a token, allocating an invoice, and
claiming an outbox delivery. They do not expose a generic whole-record upsert.

Read APIs use the smallest projection required by the caller:

- checkout reads the sellable catalog;
- payment-result and access-link routes read a purchase/access projection;
- Telegram reads token, binding, membership, and entitlement projections;
- invoice and report jobs read financial projections;
- admin history joins purchases, access, and delivery state without owning them.

During migration, legacy Sheet DTOs stay inside the isolated adapter, backfill, and
comparison tooling. New database-domain composition is exposed by
[`domain-repositories.ts`](../../src/db/domain-repositories.ts), whose commands use
purpose-specific types rather than Sheet rows. Existing legacy callers remain isolated
until their WRITE/READ cutover; deleting those adapters is still `DROP-04` work.

## Transaction boundaries

| Operation              | Required atomic boundary                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receive Stripe webhook | Verify the signature, insert the immutable inbox row by unique event ID, commit, acknowledge.                                                               |
| Project inbox event    | Claim one inbox row, apply the monotonic payment projection, enqueue deterministic outbox effects, and mark the event processed in one bounded transaction. |
| Deliver side effect    | Claim/renew a lease in a short transaction, call the external provider after commit, then record success or retry state in another short transaction.       |
| Claim Telegram token   | One conditional PostgreSQL update with exactly one winner; already implemented by `SAFE-05`.                                                                |
| Allocate invoice       | Allocate the next number and attach it under a uniqueness constraint in one transaction.                                                                    |
| Backfill               | Bounded, restartable batches with checkpoints and conflict reporting; never one unbounded production transaction.                                           |

## Cutover states

Each remaining domain can move through three explicit states: `legacy`, `shadow`, and
`database`. The flag is changed manually after reconciliation evidence is reviewed.
`shadow` may compare results but cannot make Sheets authoritative. `database` reads and
writes PostgreSQL only; rollback after PostgreSQL-only writes is to a DB-compatible
release, never to stale Sheet data.

The catalog is already in `database` state after `SAFE-07`. Other domains remain
transitional until their WRITE and READ items pass.

[`domain-persistence.ts`](../../src/db/domain-persistence.ts) defines one validated
environment flag per domain. Missing flags deliberately mean `legacy`; invalid values
fail configuration instead of silently falling back. The DB-phase release does not set
any of these flags, so it adds no runtime cutover and changes no user journey.

## Implementation sequence enabled by this boundary

1. `DB-02`: audit and complete missing constraints around the existing schema.
2. `DB-03`: evolve `stripe_events` into the durable inbox without losing history.
3. `DB-04`: extract the existing tested payment reducer into the inbox worker.
4. `DB-05`: evolve `purchase_side_effects` into the transactional outbox.
5. `DB-06`: finish the remaining atomic counters and recipient/delivery claims.
6. `DB-07`: replace Sheet-shaped application dependencies with these repositories and
   add manual per-domain cutover flags.
7. `DB-08`: add lightweight logs, SQL health queries, and an operator runbook for the
   queues and reconciliation state.
