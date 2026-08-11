# Data conflict register and Gate G3

Status: `DONE`
Accepted: 2026-08-11T13:43:16.828Z
Owner: application and repository owner

## Decision boundary

This register closes `DATA-04` without changing a user journey or rewriting valid
history. PostgreSQL is canonical under
[`ADR-001`](./adr/001-postgresql-source-of-truth.md); an older Sheet value is retained
as migration evidence, not used to roll back newer database state. Historical consent
is outside the legacy source schema and was neither inferred nor fabricated.

Schema-v4 reconciliation adds privacy-safe conflict evidence without exposing customer,
payment, event, token, chat, or Telegram-user identifiers. It records value-presence
shapes, safe status transitions, domain-specific active-access coverage, catalog
relationship evidence, and timestamp-difference magnitudes. Sheet timestamps are
compared at whole-second precision because values-only reads do not preserve meaningful
sub-second precision; the raw drift magnitude remains visible in the aggregate report.

Expected differences remain visible as top-level `status: mismatch`. They are recorded
here rather than silently allow-listed, so a later count or category change still
requires operator review.

## Production conflict decisions

All decisions below were recorded at `2026-08-11T13:43:16.828Z` and are owned by the
application and repository owner.

| ID          | Evidence                                                                                                                                                                                                                                                         | Canonical source                                                       | Decision                                                                                                                         | Correction                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATA04-01` | DATA-03 reported five Payments and three SuccessfulCustomers product-reference differences. Schema v4 proved that both raw sources were empty and the capture alone had substituted `unknown` in PostgreSQL output.                                              | Nullable PostgreSQL purchase snapshot and its catalog relationship     | Tooling false positive; no business-data conflict                                                                                | Preserve the raw empty value in capture. Final differences: `0` and `0`. No production write.                                                            |
| `DATA04-02` | Every legacy lifecycle timestamp difference was below one second: entitlement `starts/expires/revoked` `17/19/17`, token `access-expires/expires/used` `19/20/17`, binding `bound/access-expires/revoked` `17/17/17`.                                            | PostgreSQL lifecycle timestamp                                         | Expected representation/precision difference; business second is identical                                                       | Compare at whole-second precision and retain aggregate sub-second evidence. Final matched token and binding row differences: `0/0`. No production write. |
| `DATA04-03` | Fifteen entitlement states progressed beyond Sheets: `pending -> activated` 12, `pending -> token_issued` 1, and `token_issued -> activated` 2. Thirteen of those legacy rows also lack the token and Telegram-user references now present in PostgreSQL.        | `access_entitlements` and DB-native Telegram claim/binding transaction | Expected newer authoritative state. Copying it back to the legacy Sheet is unnecessary and would expand sensitive-data exposure. | Keep PostgreSQL state; no backward overwrite and no Sheet repair. User-visible access remains unchanged.                                                 |
| `DATA04-04` | 31 DB-only `payment_intent.succeeded` inbox rows all came from `stripe_settlement_backfill` and are succeeded evidence absent from the narrower legacy event Sheet.                                                                                              | Verified Stripe evidence in `stripe_events`                            | Expected expanded inbox scope                                                                                                    | Keep the immutable PostgreSQL events; no synthetic Sheet rows.                                                                                           |
| `DATA04-05` | 40 DB-only Online Group channel-invite tokens (`2` issued, `38` used) and 38 DB-only active bindings were created by the database-native flow. The increase from 37 bindings in DATA-03 to 38 occurred before the final pair of captures and was stable in both. | `telegram_access_tokens` and `telegram_user_bindings`                  | Expected database-native scope, not missing migration data                                                                       | Keep PostgreSQL only; do not export bearer material or Telegram identity back to Sheets.                                                                 |

## DATA-02 backfill conflicts

The protected source replay classified 213 existing production targets as conflicts
rather than overwriting them. The same canonical-source decision applies to every
stage. There were no duplicate source keys or missing required dependencies.

| Stage             | Count | Canonical source and decision                                       | Correction | Owner/time                                               |
| ----------------- | ----: | ------------------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| Payments          |    31 | Newer or already complete `purchases` projection; retain PostgreSQL | None       | application/repository owner, `2026-08-11T13:43:16.828Z` |
| Stripe events     |   140 | Existing immutable `stripe_events` evidence; retain PostgreSQL      | None       | application/repository owner, `2026-08-11T13:43:16.828Z` |
| Telegram tokens   |    20 | Existing token lifecycle; retain PostgreSQL                         | None       | application/repository owner, `2026-08-11T13:43:16.828Z` |
| Telegram bindings |    17 | Existing binding lifecycle; retain PostgreSQL                       | None       | application/repository owner, `2026-08-11T13:43:16.828Z` |
| Monthly reports   |     5 | Existing report-run/delivery state; retain PostgreSQL               | None       | application/repository owner, `2026-08-11T13:43:16.828Z` |

The completed source fingerprint already replayed as `already_completed`, making no
additional changes. DATA-04 changes only reconciliation tooling, so the protected
source archive was not decrypted again and no Google private key was requested.

## Stable acceptance capture

Two consecutive production captures were stable:

| Capture window (UTC)  | Body fingerprint                                                   |
| --------------------- | ------------------------------------------------------------------ |
| `13:43:05.100–06.545` | `2515e810e051a00f92b82b51a07c19c52c0f32e870c4efeefc4d59a630759842` |
| `13:43:15.667–16.828` | `2515e810e051a00f92b82b51a07c19c52c0f32e870c4efeefc4d59a630759842` |

The private temporary reports were deleted after aggregate review.

## Gate G3 result

Gate G3 is `PASSED`:

- finance matches exactly by currency and UTC month;
- all 7 Sheet-active entitlements have a PostgreSQL record, while all 20
  PostgreSQL-active entitlements are represented by a legacy record;
- all 2 Sheet-issued tokens have a PostgreSQL record; PostgreSQL has 4 issued tokens,
  of which 2 are intentionally DB-only;
- PostgreSQL has 38 active bindings, all intentionally DB-only Online Group state;
  there is no Sheet-active binding missing from PostgreSQL;
- all 23 invoice identifiers match, have no duplicates, and the supporting sequence is
  not behind the issued invoices;
- the DATA-02 replay is `already_completed` and made no changes;
- a fresh production audit passed all 32 schema/domain invariants with zero violations.

No database or Sheet row was modified by DATA-04, no runtime flag changed, and no user
flow changed.
