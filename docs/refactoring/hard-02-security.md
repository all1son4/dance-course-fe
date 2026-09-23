# HARD-02 — request limits, bounded bodies, safe diagnostics

Status: implementation in progress; distributed enforcement is not active until the
environment-specific Upstash databases are connected and verified.

## Behavior and rollout

The existing per-route quotas, checkout responses, admin password, and user journeys
are unchanged; sending the monthly report now also has a 10-per-minute admin limit.
JSON and Stripe webhook bodies are now capped while streaming, even
if `Content-Length` is missing or false. An oversized body returns HTTP 413.

The shared Redis counter is updated with one atomic Lua script. Keys contain an HMAC
of the route/IP key, not the plaintext IP. Provider errors and application
exceptions are logged only as fixed categories; secret-bearing error messages and
personal identifiers are not logged by the updated paths.

`UPSTASH_RATE_LIMIT_ENFORCE_ADMIN=1` is the final activation switch. Until it is
enabled, missing or failed Upstash requests retain the previous process-local
fallback. When enabled, admin login and rate-limited admin mutations return 503
(`rate_limit_unavailable`) if Upstash is missing or unavailable. Read-only admin
routes and customer-facing routes retain the local fallback, so purchases can
continue during a provider outage. When Upstash works, every rate-limited route
uses the shared counter. A 429 and `Retry-After` keep their previous meaning.

## Environment isolation

- Create separate Upstash Redis databases for `dev`/Vercel Preview and `main`/Vercel
  Production. Do not reuse one database or token across them.
- Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as server-only Vercel
  environment variables. Scope the dev credentials to the `dev` Preview branch and
  production credentials to Production. Do not add them to `NEXT_PUBLIC_*`, Git,
  screenshots, or issue comments.
- Set a distinct `UPSTASH_RATE_LIMIT_PREFIX` (for example `dance-dev` and
  `dance-prod`) as another isolation layer. Local Development may use its own
  database or stay in the local-only mode.
- First deploy and smoke-test with `UPSTASH_RATE_LIMIT_ENFORCE_ADMIN` unset. Verify
  authenticated admin login, a guarded admin mutation, catalogue, and checkout on
  dev. Verify Upstash receives opaque keys. Then set the switch to `1` for dev,
  redeploy, repeat the smoke checks, and test a temporary invalid token on dev:
  admin login/mutations must return 503, while customer checks still work. Restore
  the token immediately.
- Repeat the configuration and activation separately for Production only after dev
  passes and production deployment is explicitly approved. Never activate the flag
  before both Production credentials are present and verified. If Production
  provider access fails, clear the activation switch as an emergency rollback;
  this restores the previous local fallback without altering purchase data.

This is a deployment gate, not a request to copy existing dev or production
credentials between environments. Environment values must be checked by presence
and scope, without printing their secrets.
