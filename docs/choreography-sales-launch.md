# Standalone choreography sales

The public catalogue at `/online/choreo` contains Her Lies and Love me in the
morning. Both are offered without a mentor for 65 PLN / 15 EUR, with the existing
60-day access policy starting when the buyer joins the Telegram channel.

Only products with sales enabled and at least one enabled tariff appear on the
public page. Each card shows only its enabled tariff buttons. If none are open,
the page uses the previous closed-sales notice and hides the catalogue and the
“Choose choreography” link. Closed sales and catalogue read failures use the same
compact customer-facing unavailable message. Their internal states remain
separate for recovery and analytics. Open sales show the original “Start —
Anytime” fact, with no additional availability paragraph.

Love me in the morning is a separate product and includes only the tutorial. The
historical Birthday Drop keeps its existing identifiers, bonus content, lifetime
access workflow, and purchase history. Its sales are closed by migration; neither
the birthday page nor its popup is reactivated.

## Admin behaviour

The Catalog workspace lists the two current tutorials first, then courses. Other
choreographies are retained in the collapsed “Другие разборы” section.

- The product switch pauses or resumes sales without changing tariff selections.
- Each choreography tariff has an independent sales switch.
- Both switches must be enabled to create a new payment. Disabled tariffs remain
  in the authoritative catalogue, so old direct links display the closed-sales
  state and old purchases retain their metadata and fulfilment rules.
- Tariffs can be configured while the product is paused. Re-seeding preserves
  both product and tariff sales switches.
- The Her Lies mentor tariff starts disabled and remains available for history.
- Love me in the morning starts closed. Admin refuses to open it while a RU or
  EN Telegram channel target is missing. Checkout independently verifies the
  selected language target before creating a PaymentIntent.

## Deployment and launch

1. Merge the separate schema PR and apply the expand migration
   `0022_choreo_offer_sales` through the **Database migration** workflow before
   merging this application PR. See [the schema release instructions](./choreo-sales-schema-release.md). It adds the offer switch, updates the Her Lies price, disables
   its mentor tariff, closes the retired choreography products, and inserts the
   new product, its offer, and both prices. It leaves the existing Her Lies
   product sales switch unchanged and does not modify purchase or access rows.
2. Deploy the application and run the existing commercial catalogue verification
   against the selected environment. A fresh environment also needs the usual
   product seed; the migration only inserts the new tutorial.
3. Add the new tutorial's own RU and EN targets to the existing
   `TELEGRAM_CHANNEL_TARGETS_JSON` configuration, preserving the other entries:

   ```json
   {
     "off_choreo_love_me_in_the_morning_without_mentor": {
       "ru": {
         "chatId": "-1004323567965",
         "materialsUrl": "https://t.me/c/4323567965/6"
       },
       "en": {
         "chatId": "-1003916204303",
         "materialsUrl": "https://t.me/c/3916204303/3"
       }
     }
   }
   ```

   These are the standalone tutorial channels supplied by the owner. Bot API
   checks confirmed administrator status and invitation/member-management rights
   in both. The optional material links open an existing post for members and are
   only used in reminders when their channel matches the buyer's active binding.
   Purchase emails continue to use personal invitations. The historical Birthday
   Drop target is separate and must be retained for existing buyers.

   Merge this entry into the matching Vercel Preview or Production environment
   configuration and preserve the other entries. Confirm
   `TELEGRAM_CHOREO_ACCESS_DAYS=60`. Environment files are not committed and must
   be configured before enabling the new product.

4. In a test environment, check both languages end to end: purchase, email,
   personal invitation, channel join, and the 60-day entitlement. Check a disabled
   mentor tariff by its direct payment link. Verify that a historical Birthday
   Drop purchase still uses lifetime access.
5. In production admin, enable only the without-mentor tariff for Her Lies and
   enable its product switch. Enable the Love me in the morning product once its
   channel configuration and delivery checks are complete. Confirm that both
   cards show 65 PLN / 15 EUR and each has one purchase button.

New product ID: `prd_choreo_love_me_in_the_morning`.
New offer ID: `off_choreo_love_me_in_the_morning_without_mentor`.

## Customer-facing unavailable states

The same short unavailable message is used on the online overview and product
pages in RU, EN, and PL. Technical failure details stay in logs. Buy buttons and
floating purchase prompts appear only for enabled public offers. Online Group
renewal offers do not make the regular public plans look available; an active
Online Group cycle is also required. Its overview card and page hero always keep
the existing next-cycle start estimate. Any unavailable-sales notice belongs in
the tariff section and does not replace that estimate.

Checkout keeps one clear recovery path for each case:

- A closed product shows its name and a catalogue link.
- A closed tariff with an available alternative links to that product's tariffs.
- An unknown or removed offer links to the current catalogue, without silently
  selecting a different purchase.
- A failed availability read offers refresh and the catalogue.
- An inactive renewal offers help renewing through support.

When checkout is blocked, the personal-data/payment form, currency selector,
order summary, and generic payment instructions are hidden. If the server reports
closure or unavailability while preparing the payment, the screen switches to the
corresponding unavailable state and retains the entered customer data in memory.
Confirmed payments and delivery remain independent of later sales closure.

## Access wording, invoices, and expiry reminders

Customer copy and purchase emails use exact durations in all three languages:
60 days from joining the Telegram channel for timed choreography tutorials and
120 days from joining the Telegram chat for First Touch. The course's teaching
duration is separate from material access. Lifetime Birthday Drop access stays
lifetime. The purchase email uses the offer's duration, including a positive
configured duration passed by the caller, rather than converting days to months.

Successful paid choreography purchases already receive a numbered PDF invoice
attached to the purchase email. The reminder adds no new invoice.

The existing daily maintenance cron at 03:00 UTC schedules expiry reminders for
active, successful, positive-value Stripe choreography purchases. This includes
already purchased tutorials even when their sales are now closed. First Touch,
Online Group, free/admin access, and lifetime Birthday Drop are excluded as
recipients. Access that has not started does not have an expiry reminder.

- The reminder becomes due on the Warsaw calendar day 14 days before expiry.
  A missed daily run is recovered within the remaining access period.
- The longest active access in the same Telegram channel controls the deadline,
  including extensions from free grants. An active lifetime grant suppresses the
  reminder for that channel.
- The database outbox deduplicates by recipient, Telegram user, channel, and
  effective expiry. The email provider receives the same idempotency key.
- Membership, expiry, recipient, and extensions are read again immediately before
  delivery. Revoked, left, expired, and superseded reminders are skipped.
- Only live purchases receive reminders in production. Other environments are
  disabled unless `ALLOW_TEST_MODE_NOTIFICATIONS=1`, and then use test purchases.
- The compact RU/EN/PL email names the tutorial, shows the exact deadline in
  Warsaw time with a written month, and links to support. A material button is
  included only when a matching private-channel post URL has been configured.

The reminder uses the existing business-operation outbox and requires no extra
migration. It appears in the admin operations workspace as “Окончание доступа к
разбору”. The offer-sales migration above is still required for the catalogue
changes. No real customer email is sent by the tests.
