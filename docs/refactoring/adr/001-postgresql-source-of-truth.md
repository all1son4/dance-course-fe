# ADR-001: PostgreSQL as the only source of truth

Date: 2026-07-30
Status: accepted

## Context

The application currently persists and reads overlapping payment, Stripe event,
Telegram access, reporting, campaign, and administrative data through PostgreSQL and
Google Sheets. Some operations are database-first and mirror to Sheets, while other
paths still force a Sheets read or fall back to Sheets.

This creates two representations of the same business state, cross-system failure
windows, process-local coordination, and uncertainty about which copy is authoritative.

The current product journeys are working as intended and must not be redesigned as part
of the storage migration.

## Decision

PostgreSQL will become the only authoritative runtime source for all application
domains.

The migration will follow:

```text
expand -> backfill -> verify -> switch -> observe -> contract
```

During the transition, Google Sheets may receive a one-way asynchronous export from a
PostgreSQL outbox. The export is for operational visibility only:

- runtime code does not use the exported copy to make business decisions;
- export failure does not fail a user request or provider webhook;
- secrets and active bearer material are excluded;
- no application error causes a new write to fall back to Sheets.

Domain reads and writes will be switched independently behind manually controlled
feature flags. Shadow comparisons may observe both representations but must never alter
the result returned to a user.

## Product compatibility

Storage changes must preserve existing observable behavior:

- checkout fields, agreements, and action order;
- active product, offer, currency, price, and duration semantics;
- payment success, pending, and failure journeys;
- delivery and access-claim behavior for each product;
- Online Group new-purchase behavior;
- Online Group renewal Telegram verification and membership checks;
- administrative workflows and report contents.

If a security or reliability change cannot preserve an existing journey, it requires a
separate decision and explicit owner approval.

## Provider event processing

Verified Stripe events will be durably inserted into an immutable PostgreSQL inbox
before acknowledgment. Projection and side effects will run asynchronously and use
database-backed retry, deduplication, and an outbox.

Telegram, Resend, Stripe, and Google HTTP calls will not be performed while holding a
long database transaction.

## Schema evolution

- Migrations are applied separately from the application build.
- Expand migrations are deployed before code that needs them.
- Existing data is cleaned and backfilled before hard constraints are validated.
- Destructive contract migrations run only after cutover, observation, and rollback
  windows have completed.
- A release is not deployed unless the previous DB-compatible application version can
  still run against the expanded schema.

## Rollback

Before authoritative writes are switched, a domain flag may return that domain to the
previous implementation.

After PostgreSQL-only writes begin:

- rollback is only to a previous DB-compatible application release;
- Google Sheets does not become an authoritative write source again;
- database failure produces an explicit degraded or fail-closed result;
- recovery uses point-in-time restore or a forward fix, not a stale Sheets import;
- the transitional Sheets exporter may remain enabled during the rollback window.

## Consequences

Positive:

- one authoritative state;
- transactional domain invariants;
- durable provider-event replay and side-effect retry;
- simpler failure handling;
- eventual removal of Google credentials and runtime dependency.

Costs:

- a staged migration and reconciliation period;
- new inbox, outbox, worker, and observability infrastructure;
- temporary compatibility code and feature flags;
- backup, restore, and cutover rehearsals;
- legacy removal cannot happen until the observation window is complete.

## Follow-up decisions

The following are intentionally not decided by this ADR:

- changing any user journey;
- replacing existing admin authentication;
- introducing a customer account system;
- adding Telegram Login outside its current renewal use;
- exact production observation and legacy-retention durations.
