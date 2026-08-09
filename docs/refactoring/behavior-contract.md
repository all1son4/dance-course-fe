# Current product behavior contract

Status: code baseline recorded; owner acceptance recorded in the 2026-07-30 discussion
Captured: 2026-07-30
Scope: healthy user journeys and their externally visible results

## How to use this document

This document describes how the product works now. It is not a redesign proposal.
Refactoring, reliability fixes, and the PostgreSQL migration must preserve these
journeys unless the owner explicitly approves a product change.

An implementation weakness can be fixed without approval only when the healthy path
and externally visible result remain the same. If that is not possible, the change
must stop at a decision record.

## Global invariants

- Do not add Telegram Login or Telegram identity verification to ordinary purchases.
- Telegram Login and source-chat membership verification remain specific to an Online
  Group renewal checkout opened through a renewal campaign link.
- Do not change the active product, offer, price, currency, duration, or delivery
  matrix as part of technical refactoring.
- Do not add, remove, or reorder checkout fields and agreements as part of technical
  refactoring.
- Do not change which successful purchases receive Telegram access, mentor follow-up,
  email, invoice, or receipt information.
- Do not change the visible successful, in-progress, failed, unavailable, or
  support-contact outcomes.
- Do not change admin operator workflows while their storage implementation is moved.
- Storage failure handling may become safer, but a healthy journey must retain the
  same steps and result.

## Catalog and checkout entry

Checkout selection is controlled by the `product`, `offer`, and optional `currency`
query parameters. An invalid or absent product falls back to First Touch; an invalid
or absent offer falls back to the selected product's default offer.

The default currency is:

- `EUR` for an English locale;
- `PLN` for other locales;
- an explicit supported `currency` query parameter overrides the locale default.

The browser loads the sellable catalog from
[`/api/catalog/sellable-products`](../../src/app/api/catalog/sellable-products/route.ts).
Since `SAFE-07`, runtime checkout is authorized only by the PostgreSQL catalog and
fails closed when that authoritative state cannot be established. Code constants are
presentation and seed/recovery inputs only; they cannot authorize a purchase. The
healthy catalog, selection, price, and currency behavior remains unchanged.

## Public entry journeys

The public landing pages do not all enter checkout in the same way:

- choreography offer buttons open the internal checkout for the selected product and
  offer;
- the First Touch landing CTA opens the existing lead form for name, email, social
  contact, and consent; it submits a campaign lead rather than opening checkout;
- the Online Group landing tariff cards open the internal checkout for the current
  Standard and Plus offers;
- direct First Touch and new Online Group checkout URLs are technically supported.
  New Online Group PaymentIntent creation additionally requires an active Online Group
  campaign.

Refactoring must not silently replace the lead or external-registration entry points
with direct payment. That would be a product change even though the internal checkout
already supports those products.

## Commercial and delivery matrix

The following values are the code baseline in
[`sellable-products.ts`](../../src/constants/sellable-products.ts). The data-baseline
phase must also verify that active PostgreSQL catalog rows match it.

| Product                       | Offer          | PLN | EUR | Successful-purchase delivery                                                                                                               |
| ----------------------------- | -------------- | --: | --: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| First Touch                   | Standard       | 250 |  50 | Personal one-use invite to a private Telegram chat; 120 days of lesson access from joining                                                 |
| Still Alive                   | Without mentor |  60 |  15 | Personal one-use invite to the language-specific private Telegram channel; 60 days from joining                                            |
| Still Alive                   | With mentor    | 100 |  25 | Same channel access plus separate mentor/admin follow-up                                                                                   |
| Her Lies                      | Without mentor |  60 |  15 | Personal one-use invite to the language-specific private Telegram channel; 60 days from joining                                            |
| Her Lies                      | With mentor    | 100 |  25 | Same channel access plus separate mentor/admin follow-up                                                                                   |
| Still Alive + Her Lies bundle | Without mentor |  85 |  20 | Personal one-use invite to the language-specific private Telegram channel with both choreographies; 60 days from joining                   |
| Still Alive + Her Lies bundle | With mentor    | 170 |  40 | Same bundle access plus separate mentor/admin follow-up                                                                                    |
| Online Group                  | Standard       | 220 |  50 | Personal one-use invite to the current main Telegram group                                                                                 |
| Online Group                  | Plus           | 280 |  65 | Main group plus Inspiration Hub; the main group has no automatic deadline and Inspiration Hub lasts until the configured next-stream start |
| Online Group renewal          | Standard       | 175 |  40 | Renewal of main-group access after renewal-only Telegram verification                                                                      |
| Online Group renewal          | Plus           | 220 |  50 | Renewal of main-group access plus Inspiration Hub under the current campaign rules                                                         |

For choreography products, the selected material language is `RU` or `EN` and controls
the Telegram target. First Touch and Online Group do not show the material-language
field.

The normal invite lifetime is 30 days unless changed by the existing environment
configuration or capped by an earlier access deadline. The purchased 60-day or
120-day timed-access window starts when the buyer joins, not when payment succeeds.

## Ordinary checkout journey

This journey applies to First Touch, choreography products, the choreography bundle,
and a new Online Group purchase.

1. The selected product, offer, price, currency, description, and access note are
   shown.
2. The buyer enters:
   - full name;
   - email;
   - Telegram username in `@username` form;
   - street address;
   - city;
   - postal code;
   - country;
   - material language for choreography products only.
3. The buyer accepts all four existing agreements:
   - immediate access consent;
   - withdrawal notice acknowledgement;
   - privacy policy acknowledgement;
   - digital-content agreement.
4. Stripe payment controls become available only after the visible customer data is
   valid and all four agreements are accepted.
5. A PaymentIntent is prepared for the chosen product, offer, and currency. Changing
   billable checkout context invalidates the previous prepared intent.
6. The buyer completes payment with the payment methods presented by Stripe.

There is no Telegram Login, Telegram ID-token validation, or source-chat membership
check in this ordinary journey. Collecting the Telegram username is not equivalent to
verifying Telegram identity.

On a browser reload, a checkout draft may be restored when functional storage consent
allows it. A fresh visit starts a fresh checkout session.

## Online Group renewal journey

This is the only checkout journey that requires Telegram verification.

1. An admin creates an active renewal campaign for a Standard or Plus renewal offer,
   one or more source chats, and the current Online Group target.
2. The buyer opens a checkout URL containing the campaign's `renewal` slug.
3. The checkout loads the active campaign and a Telegram Login nonce. The Telegram
   username is the first active input; other customer fields, agreements, and Stripe
   controls remain unavailable until verification succeeds.
4. The buyer enters the claimed Telegram username and starts Telegram Login.
5. The server verifies:
   - the Telegram Login ID token and nonce;
   - the authenticated Telegram username matches the claimed username;
   - the authenticated Telegram user is an active member of at least one configured
     source chat;
   - the renewal campaign is active and still targets the current main Online Group.
6. On success, the verified Telegram identity is bound to the checkout session.
   Existing customer data may be prefilled, the remaining fields and agreements become
   available, and Stripe payment controls can be prepared.
7. PaymentIntent creation independently requires a still-valid verification and a
   matching campaign/product/offer context.
8. After successful payment, the buyer receives the appropriate current-group access;
   Plus also follows the Inspiration Hub rules.

The stored renewal verification is valid for one hour under the current policy.

`not_member`, username mismatch, campaign inactivity, membership-check failure, and
Telegram Login failure remain distinct blocked/error outcomes. Refactoring may improve
their reliability and wording only through a separately approved product change.

## Payment result journey

- A confirmed `succeeded` PaymentIntent navigates to the success result with the
  checkout, product, offer, currency, and PaymentIntent context.
- A confirmed `failed` or `canceled` PaymentIntent navigates to the failure result.
- After a non-redirect confirmation, a `processing` or `requires_action` outcome
  remains on checkout with the current confirmed/in-progress text rather than
  navigating to the failure page.
- The failure page lets the buyer return to the same product/offer/currency checkout
  or contact support.
- Missing or mismatched success-page context returns the buyer to checkout.

The success page is intended only for a successful payment. Preventing a transient
false-success render is a behavior-preserving correctness fix, not a new journey.

## Successful purchase and access delivery

After Stripe confirms success:

- the purchase is recorded and later duplicate provider events must not duplicate
  externally visible effects;
- the success page resolves access from the matching succeeded purchase;
- the page polls while payment projection or Telegram access is still being prepared;
- a ready one-use Telegram invite is shown for First Touch and choreography access;
- Online Group shows the main-group access and, for Plus, Inspiration Hub access;
- already active access is shown as active instead of issuing a misleading new link;
- expired or unavailable access is shown as unavailable and offers a support path;
- a success email is sent to the buyer when email delivery is configured;
- the email contains the appropriate Telegram access link or current status;
- a PDF invoice is attached;
- Stripe receipt information is included when available, otherwise it is described as
  pending;
- a with-mentor choreography purchase includes the separate mentor follow-up note.

Success-page polling and success-email preparation can race. They must converge on the
same access instead of generating two usable invitations.

## Telegram membership behavior

For timed First Touch and choreography access:

- the invite is personal and single-use;
- joining binds the purchase/access to the Telegram user observed by the Telegram
  membership webhook;
- the access clock begins on the first valid join;
- leaving, expiry, conflicting claims, and revocation are tracked and enforced by the
  existing membership-maintenance flow.

For Online Group:

- a purchase can have main-group and Inspiration Hub access targets;
- sibling invites for one purchase are tied to the same Telegram identity after the
  first valid use;
- a claimant that conflicts with an already known identity is not granted access;
- expiration applies to the configured Inspiration Hub deadline, while the main group
  follows the current no-automatic-deadline policy;
- membership join/leave updates and scheduled expiration enforcement remain active.

## Administrative journeys

The authenticated admin workspace currently supports:

- manual one-use invite generation for First Touch and supported choreography offers,
  including labels and invite history;
- inspection of active Telegram chats;
- configuration of the active Online Group main chat, fixed Inspiration Hub, title,
  and next-stream start;
- creation, regeneration, activation, and archival of Standard and Plus renewal
  campaign links with one or more source chats;
- an idempotent First Touch sales-start email broadcast;
- generation and email delivery of monthly successful-sales CSV reports.

The current “Access control” section is visibly unavailable and is not an implemented
workflow to preserve.

Admin access currently uses one shared password-backed session rather than individual
users or roles. Replacing it with per-user identity, MFA, or RBAC is a separate
owner-approved security project, not an implicit part of the storage migration.

## Behavior-preserving versus product changes

The following are behavior-preserving when implemented correctly:

- moving storage, locks, deduplication, claims, counters, and retries into PostgreSQL;
- enforcing the same visible checkout validation on the server;
- persisting immutable evidence for the same four agreements;
- preventing stale Stripe events from regressing a successful purchase;
- ensuring one winner for a concurrent Telegram claim;
- making retries converge on one email, invoice, report, or invite;
- removing a transient false-success view;
- making CSV cells safe without changing their displayed values.

The following require explicit owner approval:

- Telegram verification in an ordinary purchase;
- changing fields, agreements, their order, or when Stripe becomes available;
- changing products, offers, prices, currencies, durations, or fallback sales policy;
- changing Standard/Plus membership or Inspiration Hub deadline semantics;
- changing access delivery between Telegram, email, mentor, or manual support;
- replacing any result page or admin workflow;
- changing an existing identity-reuse outcome visible to a returning customer.

## Accepted BASE-05 migration constraints

The owner classified these behaviors for the migration:

1. Timed Telegram access can reuse an active binding for the same normalized customer
   email and target chat; preserve this existing outcome.
2. Online Group can discover a previously known Telegram identity through a customer
   relation and, when that is absent, an email snapshot; preserve this existing
   outcome.
3. After characterization tests, the runtime checkout must fail closed when the
   authoritative database catalog is unavailable. Code constants remain seed/recovery
   inputs only.
4. Production observation and legacy-retention windows follow DEC-03 in the
   [`decision register`](decision-register.md).

In particular, “email is not strong identity” is a security observation, but it is not
authorization to add Telegram Login to every purchase or to break a
returning-customer path.

## Observed gaps that are not protected product behavior

The following implementation details do not satisfy the semantic journey above and
must not be captured as desired regression behavior:

- checkout agreements and the complete browser validation schema are not currently
  sent to or independently enforced by the PaymentIntent API;
- the success page renders before its client-side status guard completes; a redirected
  `processing` or `requires_action` intent can therefore remain on the success page;
- retry from the failure page preserves product, offer, and currency but currently
  drops the renewal campaign slug and verification context;
- live production prices, active flags, Telegram target IDs, and Inspiration Hub
  deadlines cannot be proven from repository code without a database/environment
  baseline.

Fixing the first three items is allowed only while preserving the intended field set,
renewal verification, payment-result meaning, and retry purpose. If the correct result
requires a new user decision or additional step, it must be approved separately.

## Initial regression IDs

| ID              | Scenario                               | Required result                                                   |
| --------------- | -------------------------------------- | ----------------------------------------------------------------- |
| BEH-CHECKOUT-01 | Each ordinary product/offer checkout   | Same fields, agreements, price, currency, and Stripe reveal point |
| BEH-CHECKOUT-02 | Choreography language selection        | Same RU/EN Telegram target                                        |
| BEH-PAY-01      | Succeeded payment                      | Success result and one set of side effects                        |
| BEH-PAY-02      | Failed or canceled payment             | Failure result with retry and support paths                       |
| BEH-PAY-03      | Processing or action-required payment  | In-progress state, not completed purchase                         |
| BEH-ENTRY-01    | First Touch landing CTA                | Existing lead form, not silent direct checkout                    |
| BEH-ENTRY-02    | Online Group landing CTA               | Existing external registration entry                              |
| BEH-TG-01       | First Touch join                       | One-use invite; 120 days start on join                            |
| BEH-TG-02       | Each choreography offer join           | One-use invite; 60 days start on join                             |
| BEH-TG-03       | With-mentor choreography               | Same access plus mentor follow-up                                 |
| BEH-OG-01       | New Online Group Standard              | Main-group access without renewal verification                    |
| BEH-OG-02       | New Online Group Plus                  | Main group plus deadline-bound Inspiration Hub                    |
| BEH-REN-01      | Valid Online Group renewal member      | Telegram verification, prefill, payment, renewed access           |
| BEH-REN-02      | Invalid renewal identity or membership | Stripe remains unavailable                                        |
| BEH-ACCESS-01   | Success page and email race            | One convergent set of invites                                     |
| BEH-ADMIN-01    | Each available admin operation         | Same inputs and externally visible result                         |

The first implementation tests should turn these IDs into executable characterization
tests before the associated production code is changed.
