# Domain data reconciliation

Status: `DONE`
Implemented: 2026-08-11

## Purpose

`DATA-03` extends the privacy-safe baseline into a per-key domain reconciliation. It
detects state differences even when both sources contain the same keys and aggregate
counts. It does not resolve or overwrite a difference; classification and correction
belong to `DATA-04`.

The two operator commands now use the same report engine:

```bash
npm run db:baseline:sheets
npm run db:compare:sheets
```

The baseline command records a report and exits successfully unless capture itself
fails. The compare command enables strict mode and exits non-zero for any key, finance,
or matched-row mismatch. Both accept `--sample-limit=N` and `--output=PATH`.

## Consistency and privacy

PostgreSQL is read inside one `REPEATABLE READ, READ ONLY` transaction. The seven
values-only Sheet reads and database snapshot are concurrent but cannot be atomic
across providers, so schema v3 records the capture start and completion times. Repeat
the capture when a relevant write may have occurred inside that window.

The report contains only counts, safe state categories, field names, aggregate money,
commercial catalog configuration, and deterministic hashes of mismatching canonical
keys. Customer identifiers, transactional provider identifiers, and compared field
values never appear. This includes customer snapshots, Telegram user/chat IDs, token
IDs, PaymentIntent IDs, event IDs, addresses, email addresses, invite links, and error
payloads. Output files are created as mode `0600` and are never overwritten.

## Covered comparisons

Schema v3 retains exact key/fingerprint comparison for payments, events, derived
successful customers, invoices, Telegram tokens/bindings, reports, and campaign leads.
For matching keys it additionally compares:

- payment outcome, provider state, amount/currency, product/offer references, and
  commercial snapshots;
- payment and successful-customer customer snapshots without emitting their values;
- Stripe event type, payment association, state, and outcome;
- primary entitlement status, workflow, target, token reference, and lifecycle;
- Telegram token/binding product, offer, owner, state, and access lifecycle;
- invoice purchase, amount, currency, and issue time;
- legacy email/admin/export side-effect status;
- report family, delivery status, row count, and CSV checksum;
- campaign, delivery status, locale, and attempt count for email leads;
- every Sheet product/offer reference against the authoritative catalog and offer
  ownership.

Any matched-row difference contributes to top-level `status: mismatch`; equal totals
can no longer hide swapped or stale row state. The old comparison implementation that
printed raw identifiers has been replaced by this same strict privacy-safe engine.

## Acceptance evidence

The exact implementation SHA `150b83d` passed 48 unit tests, format, lint, TypeScript,
the migration-free production build, full PostgreSQL CI including backup/restore, and
the deployed critical journeys:

- [Quality run `31495719123`](https://github.com/all1son4/dance-course-fe/actions/runs/31495719123)
- [deployment smoke `31495769295`](https://github.com/all1son4/dance-course-fe/actions/runs/31495769295)

Two consecutive read-only captures per environment produced stable schema-v3 body
fingerprints:

| Environment | Capture windows (UTC)                        | Stable fingerprint                                                 |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------ |
| development | `13:18:56.603–57.600`, `13:19:08.140–09.157` | `3b2548ee8d9b47adae59da24809d1a4dbf39a6215cc5d40324cd4dacfe802de9` |
| production  | `13:19:22.412–23.767`, `13:19:33.738–34.818` | `5ea67712fe6b12e8efffbc605e011f5124e27ce24b613343fcf8819f0f8fa41b` |

All four reports were stored only in a private temporary directory and deleted after
aggregate review.

## DATA-04 input

Production financial totals still match by currency and UTC month. All Sheet keys for
the expanded technical domains exist in PostgreSQL. Matching rows are already clean
for catalog references, customer snapshots in Payments, invoices, reports, email
campaign leads, purchase delivery side effects, and Stripe events.

The stable report exposes these unresolved classes without raw identifiers:

- DB-only scope: 31 Stripe events, 40 Telegram tokens, and 37 Telegram bindings;
- five matched Payments product references and three derived successful-customer
  product references;
- 34 primary entitlement rows, 20 Sheet-owned Telegram token rows, and 17 Sheet-owned
  Telegram binding rows with one or more lifecycle/state differences.

Development retains the previously accepted synthetic history, duplicate Sheet rows,
and stale test state. Its new matched-row differences are likewise stable. `DATA-04`
must classify each production class by canonical source and decide whether it is an
expected representation difference or requires a forward correction. DATA-03 itself
performs no write and changes no user journey.
