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
- `TELEGRAM_LESSON_SOURCES_JSON`
- `TELEGRAM_START_TOKEN_TTL_HOURS` (e.g. `720` for 30 days)
- `TELEGRAM_CHANNEL_ACCESS_DAYS` (optional; default `30`; supports decimal values for testing, e.g. `0.01`)
- `TELEGRAM_ALERT_CHAT_ID` (Telegram group chat id for purchase alerts)
- `TELEGRAM_ALERT_BOT_TOKEN` (optional; falls back to `TELEGRAM_BOT_TOKEN`)
- `ALLOW_TEST_MODE_NOTIFICATIONS` (optional; set `1` to allow Stripe test-mode emails/alerts in non-production environments like Vercel Preview)
- `SHOW_SITE` (optional; set `false`/`0`/`off`/`no` to show a "coming soon" screen instead of site pages)

`TELEGRAM_WEBHOOK_SECRET` is required in production (`NODE_ENV=production`).

Important production notes:

- Runtime Node.js must be `>=24.13.0 <25`.
- `.nvmrc` is set to `24.13.0` for local/dev parity.
- Next.js image optimization is enabled by default. Set `NEXT_IMAGE_UNOPTIMIZED=1` only as a temporary rollback.
- Browser-facing POST APIs validate `Origin/Referer` in production; missing headers are rejected.
- After changing `TELEGRAM_LESSON_SOURCES_JSON`, restart the app process (source map is cached in-memory).
- Operational timestamps persisted by backend flows are recorded in `Europe/Warsaw` timezone format.
- Vercel cron for `/api/telegram/revoke-expired-access` runs by configured schedule in `vercel.json`.

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
