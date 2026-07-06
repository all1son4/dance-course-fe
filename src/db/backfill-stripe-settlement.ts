import { and, eq, isNull, or } from "drizzle-orm";
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

  if (
    paymentIntent.status !== "succeeded" ||
    !latestCharge ||
    typeof latestCharge === "string" ||
    latestCharge.status !== "succeeded" ||
    !latestCharge.paid
  ) {
    return {
      settlementAmountMinor: null,
      settlementCurrency: null,
      succeededAt: null,
      stripeBalanceTransactionId: null,
      stripeExchangeRate: null,
      stripeFeeAmountMinor: null,
      stripeNetAmountMinor: null,
    };
  }

  const balanceTransaction = latestCharge.balance_transaction;

  if (!balanceTransaction || typeof balanceTransaction === "string") {
    return {
      settlementAmountMinor: null,
      settlementCurrency: null,
      succeededAt: null,
      stripeBalanceTransactionId:
        typeof balanceTransaction === "string" ? balanceTransaction : null,
      stripeExchangeRate: null,
      stripeFeeAmountMinor: null,
      stripeNetAmountMinor: null,
    };
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
    .where(
      and(
        eq(purchases.outcome, "succeeded"),
        or(
          isNull(purchases.settlementAmountMinor),
          isNull(purchases.succeededAt),
          isNull(purchases.stripeFeeAmountMinor),
          isNull(purchases.stripeNetAmountMinor),
        ),
      ),
    )
    .limit(limit ?? 10_000);
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

      if (
        settlementSnapshot.settlementAmountMinor === null ||
        !settlementSnapshot.settlementCurrency
      ) {
        stats.skipped += 1;
        continue;
      }

      if (!dryRun) {
        await db.transaction(async (tx) => {
          await tx
            .update(purchases)
            .set({
              settlementAmountMinor: settlementSnapshot.settlementAmountMinor,
              settlementCurrency: settlementSnapshot.settlementCurrency,
              succeededAt: settlementSnapshot.succeededAt,
              stripeBalanceTransactionId: settlementSnapshot.stripeBalanceTransactionId,
              stripeExchangeRate: settlementSnapshot.stripeExchangeRate,
              stripeFeeAmountMinor: settlementSnapshot.stripeFeeAmountMinor,
              stripeNetAmountMinor: settlementSnapshot.stripeNetAmountMinor,
              updatedAt: new Date(),
            })
            .where(eq(purchases.id, row.id));

          if (settlementSnapshot.succeededAt) {
            await tx
              .insert(stripeEvents)
              .values({
                eventType: "payment_intent.succeeded",
                outcomeSnapshot: "succeeded",
                paymentIntentId: row.paymentIntentId,
                paymentStatusSnapshot: "succeeded",
                payload: {
                  source: "stripe_settlement_backfill",
                },
                processedAt: new Date(),
                processingStatus: "processed",
                purchaseId: row.id,
                stripeCreatedAt: settlementSnapshot.succeededAt,
                stripeEventId: `backfill:payment_intent.succeeded:${row.paymentIntentId}`,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                set: {
                  outcomeSnapshot: "succeeded",
                  paymentIntentId: row.paymentIntentId,
                  paymentStatusSnapshot: "succeeded",
                  processedAt: new Date(),
                  processingStatus: "processed",
                  purchaseId: row.id,
                  stripeCreatedAt: settlementSnapshot.succeededAt,
                  updatedAt: new Date(),
                },
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
