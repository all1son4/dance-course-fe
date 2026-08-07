# ADR-002: Telegram verification is renewal-only

Date: 2026-07-30
Status: accepted

## Context

The application has two different Telegram-related journeys:

- ordinary successful purchases receive access through a personal one-use Telegram
  invite after payment;
- an Online Group renewal checkout must first prove that the buyer controls the
  claimed Telegram identity and belongs to an eligible source chat.

A security audit identified identity-reuse and concurrent-claim risks. Treating those
findings as a reason to add Telegram Login to every checkout would change a working
product journey.

## Decision

Telegram Login, ID-token verification, and source-chat membership checks remain
exclusive to Online Group renewal links.

They must not be added to:

- First Touch checkout;
- choreography or bundle checkout, with or without mentor;
- a new Online Group Standard purchase;
- a new Online Group Plus purchase.

Ordinary purchases continue to collect the existing Telegram username field and, after
a succeeded payment, deliver access through the existing one-use invite flow.

The Online Group renewal journey continues to require:

- an active renewal campaign;
- Telegram Login with a checkout-bound nonce;
- a match between the claimed and authenticated Telegram username;
- active membership in at least one configured source chat;
- a campaign target matching the current Online Group main chat;
- a still-valid, matching verification when the PaymentIntent is created.

## Reliability work allowed by this decision

The implementation may:

- make one-use token claims atomic;
- prevent two Telegram accounts from winning the same claim;
- replace Sheets-based state with PostgreSQL transactions;
- make invite generation and retries idempotent;
- improve join, leave, expiry, and revocation consistency;
- store verified renewal identity explicitly.

It may not add an authentication step to ordinary checkout or otherwise change the
healthy user journey.

## Identity reuse

Existing email- or customer-based Telegram identity reuse is a separate decision. It
must first be characterized with regression tests. If it cannot be made safe without
changing a returning customer's visible experience, implementation stops for owner
approval.

## Consequences

- Security hardening must be scoped to token ownership, atomic claims, and durable
  identity state rather than universal Telegram Login.
- Ordinary purchase tests must assert that no Telegram Login step appears.
- Renewal tests must assert that Stripe remains unavailable until verification
  succeeds.
- Any future proposal for Telegram verification outside renewal requires a new
  decision and explicit owner approval.
