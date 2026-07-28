import { and, eq, isNotNull, isNull, like, or } from "drizzle-orm";
import Stripe from "stripe";

import { getDatabase, getDatabaseClient } from "./client";
import { loadDatabaseEnvConfig } from "./load-env";
import { purchases, stripeEvents } from "./schema";

loadDatabaseEnvConfig();

type SettlementSnapshot = {
  settlementAmountMinor: number | null;
  settlementCurrency: string | null;
  succeededAt: Date | null;
  stripeBalanceTransactionId: string | null;
  stripeExchangeRate: string | null;
  stripeFeeAmountMinor: number | null;
  stripeNetAmountMinor: number | null;
};

const DEFAULT_BACKFILL_LIMIT = 10_000;

const createEmptySettlementSnapshot = (
  stripeBalanceTransactionId: string | null = null,
): SettlementSnapshot => ({
  settlementAmountMinor: null,
  settlementCurrency: null,
  succeededAt: null,
  stripeBalanceTransactionId,
  stripeExchangeRate: null,
  stripeFeeAmountMinor: null,
  stripeNetAmountMinor: null,
});

const hasSucceededLatestCharge = (
  paymentIntent: Stripe.PaymentIntent,
  latestCharge: Stripe.Charge | string | null,
): latestCharge is Stripe.Charge => {
  if (
    paymentIntent.status !== "succeeded" ||
    !latestCharge ||
    typeof latestCharge === "string"
  ) {
    return false;
  }

  return latestCharge.status === "succeeded" && latestCharge.paid;
};

const hasCompleteSettlement = (
  snapshot: SettlementSnapshot,
): snapshot is SettlementSnapshot & {
  settlementAmountMinor: number;
  settlementCurrency: string;
} => snapshot.settlementAmountMinor !== null && Boolean(snapshot.settlementCurrency);

const buildPurchaseSettlementUpdateValues = (snapshot: SettlementSnapshot) => ({
  settlementAmountMinor: snapshot.settlementAmountMinor,
  settlementCurrency: snapshot.settlementCurrency,
  succeededAt: snapshot.succeededAt,
  stripeBalanceTransactionId: snapshot.stripeBalanceTransactionId,
  stripeExchangeRate: snapshot.stripeExchangeRate,
  stripeFeeAmountMinor: snapshot.stripeFeeAmountMinor,
  stripeNetAmountMinor: snapshot.stripeNetAmountMinor,
  updatedAt: new Date(),
});

const buildStripeEventInsertValues = ({
  paymentIntentId,
  purchaseId,
  succeededAt,
}: {
  paymentIntentId: string;
  purchaseId: string;
  succeededAt: Date;
}) => ({
  eventType: "payment_intent.succeeded" as const,
  outcomeSnapshot: "succeeded",
  paymentIntentId,
  paymentStatusSnapshot: "succeeded",
  payload: {
    source: "stripe_settlement_backfill",
  },
  processedAt: new Date(),
  processingStatus: "processed" as const,
  purchaseId,
  stripeCreatedAt: succeededAt,
  stripeEventId: `backfill:payment_intent.succeeded:${paymentIntentId}`,
  updatedAt: new Date(),
});

const buildStripeEventUpdateValues = ({
  paymentIntentId,
  purchaseId,
  succeededAt,
}: {
  paymentIntentId: string;
  purchaseId: string;
  succeededAt: Date;
}) => ({
  outcomeSnapshot: "succeeded",
  paymentIntentId,
  paymentStatusSnapshot: "succeeded",
  processedAt: new Date(),
  processingStatus: "processed" as const,
  purchaseId,
  stripeCreatedAt: succeededAt,
  updatedAt: new Date(),
});

const getStripe = () => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";

  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY for Stripe settlement backfill.");
  }

  return new Stripe(stripeSecretKey);
};

const getLimit = () => {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const parsedLimit = Number.parseInt(limitArg?.split("=")[1] ?? "", 10);

  return Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
};

const isWriteMode = () => process.argv.includes("--write");

const isStripePaymentIntentId = (value: string) => value.trim().startsWith("pi_");

const getSettlementSnapshot = async ({
  paymentIntentId,
  stripe,
}: {
  paymentIntentId: string;
  stripe: Stripe;
}): Promise<SettlementSnapshot> => {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  });
  const latestCharge = paymentIntent.latest_charge;

  if (!hasSucceededLatestCharge(paymentIntent, latestCharge)) {
    return createEmptySettlementSnapshot();
  }

  const balanceTransaction = latestCharge.balance_transaction;

  if (!balanceTransaction || typeof balanceTransaction === "string") {
    return createEmptySettlementSnapshot(
      typeof balanceTransaction === "string" ? balanceTransaction : null,
    );
  }

  return {
    settlementAmountMinor: balanceTransaction.amount,
    settlementCurrency: balanceTransaction.currency,
    succeededAt: new Date(latestCharge.created * 1000),
    stripeBalanceTransactionId: balanceTransaction.id,
    stripeExchangeRate:
      balanceTransaction.exchange_rate === null ||
      balanceTransaction.exchange_rate === undefined
        ? null
        : String(balanceTransaction.exchange_rate),
    stripeFeeAmountMinor: balanceTransaction.fee,
    stripeNetAmountMinor: balanceTransaction.net,
  };
};

const main = async () => {
  const dryRun = !isWriteMode();
  const limit = getLimit();
  const db = getDatabase();
  const stripe = getStripe();
  const rows = await db
    .select({
      id: purchases.id,
      paymentIntentId: purchases.paymentIntentId,
    })
    .from(purchases)
    .leftJoin(
      stripeEvents,
      and(
        eq(stripeEvents.paymentIntentId, purchases.paymentIntentId),
        eq(stripeEvents.eventType, "payment_intent.succeeded"),
        eq(stripeEvents.processingStatus, "processed"),
        eq(stripeEvents.outcomeSnapshot, "succeeded"),
        isNotNull(stripeEvents.stripeCreatedAt),
      ),
    )
    .where(
      and(
        eq(purchases.outcome, "succeeded"),
        like(purchases.paymentIntentId, "pi_%"),
        or(
          isNull(stripeEvents.id),
          isNull(purchases.settlementAmountMinor),
          isNull(purchases.succeededAt),
          isNull(purchases.stripeFeeAmountMinor),
          isNull(purchases.stripeNetAmountMinor),
        ),
      ),
    )
    .limit(limit ?? DEFAULT_BACKFILL_LIMIT);
  const stripeRows = rows.filter((row) => isStripePaymentIntentId(row.paymentIntentId));
  const stats = {
    dryRun,
    failed: 0,
    ignoredNonStripePaymentIntentIds: rows.length - stripeRows.length,
    planned: stripeRows.length,
    skipped: 0,
    updated: 0,
  };

  for (const row of stripeRows) {
    try {
      const settlementSnapshot = await getSettlementSnapshot({
        paymentIntentId: row.paymentIntentId,
        stripe,
      });

      if (!hasCompleteSettlement(settlementSnapshot)) {
        stats.skipped += 1;
        continue;
      }

      if (!dryRun) {
        await db.transaction(async (tx) => {
          await tx
            .update(purchases)
            .set(buildPurchaseSettlementUpdateValues(settlementSnapshot))
            .where(eq(purchases.id, row.id));

          if (settlementSnapshot.succeededAt) {
            await tx
              .insert(stripeEvents)
              .values(
                buildStripeEventInsertValues({
                  paymentIntentId: row.paymentIntentId,
                  purchaseId: row.id,
                  succeededAt: settlementSnapshot.succeededAt,
                }),
              )
              .onConflictDoUpdate({
                set: buildStripeEventUpdateValues({
                  paymentIntentId: row.paymentIntentId,
                  purchaseId: row.id,
                  succeededAt: settlementSnapshot.succeededAt,
                }),
                target: stripeEvents.stripeEventId,
              });
          }
        });
      }

      stats.updated += 1;
    } catch (error) {
      stats.failed += 1;
      console.error("Failed to backfill Stripe settlement for purchase", {
        error,
        paymentIntentId: row.paymentIntentId,
      });
    }
  }

  console.warn("Stripe settlement backfill completed", stats);

  if (dryRun) {
    console.warn("Run npm run db:backfill:stripe-settlement -- --write to update rows.");
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDatabaseClient().end();
  });
