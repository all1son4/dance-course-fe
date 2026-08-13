This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Stripe Payments

The checkout uses Stripe `PaymentIntent`s and expects these environment variables:

- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`

Optional Telegram env variables:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_LOGIN_CLIENT_ID` (required for Telegram Login on renewal checkout)
- `TELEGRAM_LOGIN_NONCE_SECRET` (optional; falls back to `TELEGRAM_WEBHOOK_SECRET`)
- `TELEGRAM_LESSON_SOURCES_JSON`
- `TELEGRAM_CHANNEL_TARGETS_JSON`
- `TELEGRAM_ACCESS_LINK_TTL_DAYS` (optional; default `30`; supports decimal values for testing, e.g. `0.01`)
- `TELEGRAM_CHOREO_ACCESS_DAYS` (optional; default `60`; supports decimal values for testing, e.g. `0.01`)
- `TELEGRAM_START_TOKEN_TTL_HOURS` (optional legacy bot-token TTL override; default matches `TELEGRAM_ACCESS_LINK_TTL_DAYS * 24`)
- `TELEGRAM_ALERT_CHAT_ID` (Telegram group chat id for purchase alerts)
- `TELEGRAM_ALERT_BOT_TOKEN` (optional; falls back to `TELEGRAM_BOT_TOKEN`)
- `ALLOW_TEST_MODE_NOTIFICATIONS` (optional; set `1` to allow Stripe test-mode emails/alerts in non-production environments like Vercel Preview)
- `SHOW_SITE` (optional; set `false`/`0`/`off`/`no` to show a "coming soon" screen instead of site pages)
- `ADMIN_PASSWORD` (required for `/admin` password access)
- `RESEND_API_KEY` (required for email delivery)
- `RESEND_FROM_EMAIL` (optional; defaults to `onboarding@resend.dev`)
- `RESEND_REPLY_TO` (optional; used as the recipient for the monthly sales report)
- `DB_PAYMENT_EVENTS_MODE` and `DB_SIDE_EFFECTS_MODE` (optional; set both to `database`
  in one deployment to enable asynchronous PostgreSQL inbox/outbox processing; leaving
  both unset preserves the legacy synchronous path)
- `DB_TELEGRAM_ACCESS_MODE` (optional; `database` enables PostgreSQL-only timed/legacy
  Telegram access persistence; leave unset until the controlled cutover)

`TELEGRAM_WEBHOOK_SECRET` is required in production (`NODE_ENV=production`).

Important production notes:

- Runtime Node.js must be `>=24.18.0 <25`.
- `.nvmrc` is set to `24.18.0` for local/dev parity.
- Next.js image optimization is enabled by default. Set `NEXT_IMAGE_UNOPTIMIZED=1` only as a temporary rollback.
- Browser-facing POST APIs validate `Origin/Referer` in production; missing headers are rejected.
- After changing `TELEGRAM_LESSON_SOURCES_JSON` or `TELEGRAM_CHANNEL_TARGETS_JSON`, restart the app process (maps are cached in-memory).
- Operational timestamps persisted by backend flows are recorded in UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- Vercel cron calls `/api/cron/daily-maintenance` by configured schedule in `vercel.json`; that handler runs Telegram access revocation daily, sends the monthly sales report on the last day of the month when there are successful payments, and performs bounded Stripe queue recovery when both DB write modes are enabled.
- The admin reports section can manually send a sales CSV for a selected UTC month. Current-month reports run from the 1st day to the click time; previous months use the full calendar month. Manual sends are forced every time the button is clicked.

`TELEGRAM_LESSON_SOURCES_JSON` supports both a single source per offer and language-specific sources:

```json
{
  "off_without_mentor_id": {
    "ru": {
      "sourceChatId": "-1001111111111",
      "sourceMessageId": 10,
      "lessonTitle": "Разбор (RU)"
    },
    "en": {
      "sourceChatId": "-1001111111111",
      "sourceMessageId": 11,
      "lessonTitle": "Tutorial (EN)"
    }
  }
}
```

The server exposes:

- `POST /api/stripe/payment-intent`
- `POST /api/stripe/payment-intent/status`
- `POST /api/stripe/payment-intent/cancel`
- `POST /api/stripe/webhook`
- `POST /api/telegram/access-link`
- `POST /api/telegram/webhook`
- `POST /admin/api/invite-links` (manual admin invite-link generator)
- `POST /admin/api/reports/monthly-sales` (manual monthly sales CSV email)
- `GET /admin/auth` (admin session status)
- `POST /admin/auth` (password -> sets admin cookie for 30 days)
- `DELETE /admin/auth` (logout and clear admin session cookie)

Admin utility page:

- `/admin` (password form + httpOnly cookie session for 30 days)
- `/admin/invite-links` (legacy path, redirects to `/admin`)

For local webhook testing with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
