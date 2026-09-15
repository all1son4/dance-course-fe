import { and, eq, isNotNull, sql } from "drizzle-orm";

import { getDatabase } from "./client";
import { purchases, stripeEvents } from "./schema";

// The accounting sale timestamp is owned by Stripe's immutable succeeded
// event. Taking the earliest processed event keeps one stable row per Payment
// Intent even if Stripe delivers the webhook more than once.
export const getCanonicalSucceededStripeEvents = () =>
  getDatabase()
    .select({
      paymentIntentId: stripeEvents.paymentIntentId,
      saleTimestamp: sql<Date>`MIN(${stripeEvents.stripeCreatedAt})`
        .mapWith(stripeEvents.stripeCreatedAt)
        .as("sale_timestamp"),
    })
    .from(stripeEvents)
    .where(
      and(
        eq(stripeEvents.eventType, "payment_intent.succeeded"),
        eq(stripeEvents.processingStatus, "processed"),
        eq(stripeEvents.outcomeSnapshot, "succeeded"),
        isNotNull(stripeEvents.paymentIntentId),
        isNotNull(stripeEvents.stripeCreatedAt),
      ),
    )
    .groupBy(stripeEvents.paymentIntentId)
    .as("canonical_succeeded_stripe_events");

// This mirrors the report's fail-closed validation. Financial totals may be
// shown only when every included sale has a Stripe balance transaction in PLN
// and gross = fee + net.
export const stripeFinancialDataComplete = sql<boolean>`
  ${purchases.settlementAmountMinor} IS NOT NULL
  AND LOWER(BTRIM(${purchases.settlementCurrency})) = 'pln'
  AND ${purchases.stripeFeeAmountMinor} IS NOT NULL
  AND ${purchases.stripeNetAmountMinor} IS NOT NULL
  AND ${purchases.stripeNetAmountMinor} >= 0
  AND BTRIM(${purchases.stripeBalanceTransactionId}) LIKE 'txn_%'
  AND ${purchases.settlementAmountMinor} =
    ${purchases.stripeFeeAmountMinor} + ${purchases.stripeNetAmountMinor}
  AND (
    ${purchases.currency} <> 'pln'
    OR ${purchases.amountMinor} = ${purchases.settlementAmountMinor}
  )
`;
