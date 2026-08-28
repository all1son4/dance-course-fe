# Product analytics

The website uses Mixpanel Browser SDK with EU data residency. Vercel Analytics is not
required.

## Production setup

1. Create a Mixpanel project in the EU data residency region.
2. Copy its project token (not the project secret).
3. Add `NEXT_PUBLIC_MIXPANEL_TOKEN` to the Vercel Production environment and redeploy.
4. Accept the Analytics category in the site's cookie banner and confirm events in
   Mixpanel Live View.

The SDK is not loaded without the public token, outside production, or before analytics
consent. Revoking consent stops collection and clears Mixpanel browser persistence.

## Privacy boundaries

- Admin traffic is excluded from analytics.
- Payment pages receive only explicit sanitized commerce events and page paths. DOM
  autocapture and session replay are disabled there.
- Checkout field analytics contains stable field/agreement names and boolean states only;
  values, labels, validation messages, and payment identifiers are never included.
- Full URLs, query strings, referrer URLs, form values, names, emails, phone numbers,
  Telegram handles, Stripe IDs, and error messages are not sent.
- Referring domain, UTM attribution, browser, OS, device, screen size, locale, and
  approximate geography remain available.
- Session replay runs only on public pages without query parameters. All text and inputs
  are masked; console, network, canvas, images, video, and audio are not recorded.
- Autocapture collects privacy-scoped clicks, scroll depth, rage clicks, and dead clicks.
  Forms and form controls are excluded.

## Event taxonomy

Event names and properties are typed in `src/lib/mixpanel-analytics.ts`.

| Journey           | Events                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acquisition       | `$mp_web_page_view`, `language_changed`                                                                                                                                                                                         |
| Discovery         | `cta_impression`, `cta_clicked`, `card_details_toggled`, `faq_toggled`, `review_navigated`, `review_toggled`                                                                                                                    |
| Content           | `video_started`, `video_paused`, `video_completed`                                                                                                                                                                              |
| First Touch lead  | `signup_dialog_opened`, `signup_validation_failed`, `signup_submitted`, `signup_succeeded`, `signup_failed`                                                                                                                     |
| Checkout          | `checkout_viewed`, `checkout_blocked`, `checkout_field_started`, `checkout_field_completed`, `checkout_agreement_changed`, `currency_changed`, `checkout_form_submitted`, `checkout_validation_failed`, `payment_form_revealed` |
| Payment           | `payment_attempted`, `payment_failed`, `purchase_completed`                                                                                                                                                                     |
| Access            | `post_purchase_access_result`, post-purchase `cta_impression` / `cta_clicked`                                                                                                                                                   |
| Performance       | `web_vital_measured` for CLS, FCP, INP, LCP, and TTFB                                                                                                                                                                           |
| Birthday campaign | `birthday_popup_shown`, `birthday_popup_clicked`, `birthday_popup_dismissed`                                                                                                                                                    |

Commerce events use only public catalog metadata: `product_id`, `product_code`,
`offer_id`, `offer_code`, `currency`, `value`, and `is_renewal`.

## Initial Mixpanel reports

1. Acquisition: unique users on `$mp_web_page_view`, broken down by
   `$referring_domain`, UTM source, country, device, browser, locale, and `page_path`.
2. Lead funnel: First Touch page view → `signup_dialog_opened` → `signup_submitted` →
   `signup_succeeded`.
3. Purchase funnel: `checkout_viewed` → `payment_form_revealed` → `payment_attempted` →
   `purchase_completed`, broken down by product, offer, currency, locale, and device.
4. CTA efficiency: `cta_impression` → `cta_clicked`, broken down by `cta_id`, placement,
   product, and page path. An impression requires at least 50% visibility for 600 ms.
5. Checkout friction: `checkout_field_started` → `checkout_field_completed`, agreement
   changes, `checkout_validation_failed`, `payment_failed`, rage clicks, and dead clicks.
6. Delivery funnel: `purchase_completed` → `post_purchase_access_result` → access CTA
   click, with partial/unavailable delivery highlighted separately.
7. Real-user performance: p75 `metric_value` for LCP, INP, and CLS, broken down by
   `page_path`, device, browser, and conversion outcome.
8. Content quality: `video_started` → `video_completed`, FAQ expansion, reviews, and
   scroll-depth events by landing page.

Browser purchase tracking is deduplicated per tab session. Stripe remains the source of
truth for revenue and payment status; use server-side webhook ingestion in the future if
financially exact cross-device attribution becomes necessary.
