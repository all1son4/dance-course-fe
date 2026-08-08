# Refactoring decision register

Status: accepted for BASE-05
Updated: 2026-07-30

This register records owner decisions that cannot be inferred safely from
implementation alone. They preserve the current product behavior and avoid expanding
the database migration into a product redesign.

## DEC-01 — Existing Telegram identity reuse

Status: accepted

Current implementation:

- timed First Touch/choreography access can attach a new purchase to an active
  Telegram binding found by normalized customer email and target chat;
- Online Group can discover a prior Telegram identity through a customer relation and
  then an email snapshot;
- this lets a returning customer retain/extend access without Telegram Login in the
  ordinary checkout;
- email alone is not strong proof that the buyer controls the previously bound
  Telegram account.

Decision:

1. Preserve the existing returning-customer outcome through the PostgreSQL migration.
2. Do not add Telegram Login to ordinary checkout.
3. Do not broaden email reuse to new products, chats, or scenarios.
4. Cover the existing reuse paths with regression tests and useful error logs.
5. Revisit the identity mechanism only as a separate post-cutover product/security
   decision.

SAFE-06 characterization (2026-08-08):

- the ordinary internal checkout creates a PaymentIntent with `receipt_email` but no
  Stripe Customer, authenticated account, or other durable buyer identity;
- the current internal `customerId` is itself resolved by normalized email when no
  Stripe Customer exists, so replacing the email comparison with that ID would not
  strengthen identity proof;
- the checkout Telegram username, customer name, and browser checkout-session ID are
  buyer-supplied or session-scoped and cannot prove control of a previously bound
  Telegram account;
- therefore a stronger automatic replacement cannot preserve the current zero-step
  returning-customer experience. Safe alternatives require either an additional
  verification/account-linking step or removal of automatic reuse.

The accepted decision above remains in force. Current selection rules now have focused
characterization coverage, and ambiguous matches involving multiple Telegram user IDs
emit a warning without changing which existing candidate wins. No new reuse scope or
ordinary-purchase verification was added.

In plain language: when an existing customer buys again and the current implementation
can associate that purchase with the customer's existing Telegram identity, the
migration must keep that outcome. Ordinary purchases do not gain a new Telegram
verification step. Telegram verification remains mandatory only for the Online Group
renewal flow documented in ADR-002.

## DEC-02 — Consent evidence and retention

Status: accepted for migration implementation

For every new purchase, the customer must actively select all four current checkboxes
again, even if the same customer has purchased before. Acceptance is never copied from
an earlier purchase.

Store the following technical evidence with each new purchase:

- all four current agreement booleans;
- acceptance timestamp;
- immutable agreement/policy version identifiers;
- checkout locale;
- product, offer, currency, and checkout-session context;
- evidence source and schema version.

Do not:

- add new visible agreements as part of this refactor;
- infer or fabricate historical acceptance;
- store extra device or network identifiers without a documented need;
- make Stripe available before the same four current agreements are accepted.

The retention duration must follow the business jurisdiction, accounting policy, and
legal-claims policy. Until a separate legal deletion policy is supplied, consent
evidence follows the lifecycle of its purchase/invoice record and is not deleted or
retained independently. This engineering default does not invent a statutory duration.

## DEC-03 — Cutover observation and legacy-retention windows

Status: accepted

Lightweight cutover policy for the current project size:

- one domain flag per controlled cutover step;
- after each critical switch, run an immediate smoke/reconciliation check and repeat it
  the next day;
- inspect existing application/provider logs and reconciliation results; do not build a
  separate enterprise monitoring platform for this migration;
- use a 7-day stabilization window after the final runtime-read switch;
- keep the isolated legacy reader and temporary exporter available for rollback for 14
  days after the final read cutover;
- manually generate and compare the monthly report before disabling the exporter; it
  is not necessary to wait for a complete calendar month;
- apply destructive contract migrations no earlier than 30 days after final cutover,
  and only when differences are zero, all anomalies are explained, and backup/restore
  evidence is valid.

An unexplained anomaly or production traffic too low to exercise a critical path
extends the relevant window.

## DEC-04 — Catalog fallback during database failure

Status: accepted

Current implementation can sell from code constants when the database catalog is
missing or unavailable. This can preserve availability, but it can also make an offer
sellable after an operator disabled it in PostgreSQL.

Decision:

- preserve the current catalog on the healthy path;
- after characterization tests, fail closed when authoritative PostgreSQL catalog
  state cannot be established;
- keep code constants only for seed/recovery tooling, not runtime authorization to
  sell;
- provide an explicit operational degraded-state message instead of silently changing
  the selected product.

The constants remain usable by explicit seed/recovery tools, but never silently
authorize a runtime sale when PostgreSQL state is unavailable.

## DEC-05 — Hidden correctness gaps

Status: accepted as behavior-preserving by the current product contract

The following fixes do not change the intended journey:

- a success result means a succeeded payment;
- processing/action-required payments remain non-final;
- retrying a failed renewal preserves the renewal context;
- the server enforces the same fields and four agreements already required by the UI;
- concurrent retries produce one invoice, email, report, and set of access links.

If implementation requires an additional customer action, the work returns to owner
approval.

## DEC-06 — Admin authentication modernization

Status: deferred; separate owner approval required

Per-user accounts, MFA, roles, audit trails, and revocable individual sessions are
valuable but change the current shared-password admin workflow. They remain a
post-cutover security project and are not a prerequisite for PostgreSQL-only storage.

## BASE-05 resolution

The owner confirmed:

1. preserve existing Telegram identity reuse without adding it to new scenarios;
2. require all four checkboxes on every purchase and store per-purchase evidence;
3. use the lightweight cutover checks and retention windows above;
4. fail closed when authoritative PostgreSQL catalog state cannot be established.

`BASE-05` is complete. These decisions authorize later implementation only within the
behavior-preserving roadmap; they do not authorize changes to the product journeys.
