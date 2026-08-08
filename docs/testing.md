# Testing guide

The test suite protects the behavior contract while the application moves from Google
Sheets and dual-write persistence to PostgreSQL-only ownership. Tests must not call
live Stripe, Telegram, Resend, Google Sheets, or production databases.

## Layers

- `npm test` runs fast unit and characterization tests through Node's built-in test
  runner and `tsx`.
- `npm run test:integration:setup` applies committed Drizzle migrations to the
  database named by `TEST_DATABASE_URL`.
- `npm run test:integration` checks real PostgreSQL transaction, constraint, and
  concurrency behavior.
- `PLAYWRIGHT_BASE_URL=<deployment-url> npm run test:e2e` runs the small Chromium
  journey suite from `tests/e2e` against a deployed revision.

Provider fixtures live in `tests/fixtures`. They record Stripe method calls and replace
`fetch` for Telegram and Resend without contacting provider APIs. Add deterministic
fixtures there instead of embedding live credentials or making tests depend on
provider sandboxes.

## Database safety

Integration tests require an explicit `TEST_DATABASE_URL`. The database name must
contain `test`, and the host must be loopback by default. A remote ephemeral test
database additionally requires `ALLOW_REMOTE_TEST_DATABASE=1`.

Never point integration tests at development or production. CI uses an ephemeral
PostgreSQL service named `dance_course_test` and discards it after the job.

## Browser scope

Playwright intentionally covers only stable, critical journey invariants:

- First Touch enters the lead dialog rather than direct checkout;
- Online Group Standard and Plus enter their current internal checkout contexts;
- ordinary checkout has four fresh agreements and no Telegram verification step;
- checkout sends those same four accepted agreements with the existing customer data;
- an unavailable authoritative catalog blocks Stripe and shows an explicit message.

Telegram verification remains exclusive to Online Group renewal. Provider payment,
membership, email, and Telegram delivery behavior belongs in deterministic unit or
integration tests, not live browser calls.

The mandatory `Quality` job remains deterministic and runs before deployment. Vercel
success statuses trigger the separate `Deployment smoke` workflow against the exact
deployed revision and URL. This separation avoids pretending that plain `next dev` is
equivalent to Vercel's locale rewrite layer, while still checking the real public
journeys automatically. Deployment smoke is diagnostic and is not a required merge
check.
