import assert from "node:assert/strict";
import test from "node:test";

import { buildPurchaseSuccessEmail } from "@/app/api/stripe/webhook/_lib/purchase-success-email";

test("purchase email reports the exact configured access days in every language and link state", () => {
  for (const checkoutLocale of ["ru", "en", "pl"]) {
    for (const telegramAccessUrl of [null, "https://example.com/invite"]) {
      for (const accessDurationDays of [60, 90]) {
        const email = buildPurchaseSuccessEmail({
          checkoutLocale,
          accessKind: "telegram-channel",
          accessDurationDays,
          telegramAccessUrl,
          productTitle: "Her Lies",
          offerLabel: "Without mentor",
          amountMinor: "6500",
          checkoutCurrency: "pln",
          receiptLink: null,
        });
        assert.ok(email.html.includes(String(accessDurationDays)));
        assert.ok(email.text.includes(String(accessDurationDays)));
        assert.doesNotMatch(email.text, /2 months|2 месяца|2 miesiące|\{days\}/u);
      }
    }
  }
  const course = buildPurchaseSuccessEmail({
    checkoutLocale: "ru",
    accessKind: "telegram-chat",
    accessDurationDays: 120,
    productTitle: "First Touch",
    offerLabel: "Standard",
    amountMinor: "25000",
    checkoutCurrency: "pln",
    receiptLink: null,
  });
  assert.match(course.text, /120 дней/u);
  const lifetime = buildPurchaseSuccessEmail({
    checkoutLocale: "ru",
    accessKind: "telegram-channel-lifetime",
    accessDurationDays: 0,
    productTitle: "Birthday Drop",
    offerLabel: "Standard",
    amountMinor: "6500",
    checkoutCurrency: "pln",
    receiptLink: null,
  });
  assert.match(lifetime.text, /навсегда/u);
  assert.doesNotMatch(lifetime.text, /60 дней|0 дней/u);
});
