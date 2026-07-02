import { loadEnvConfig } from "@next/env";
import { and, eq, isNull } from "drizzle-orm";
import Stripe from "stripe";

import { getDatabase, getDatabaseClient } from "./client";
import { purchases } from "./schema";

loadEnvConfig(process.cwd());

type SettlementSnapshot = {
  settlementAmountMinor: number | null;
  settlementCurrency: string | null;
  stripeBalanceTransactionId: string | null;
  stripeExchangeRate: string | null;
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

  if (!latestCharge || typeof latestCharge === "string") {
    return {
      settlementAmountMinor: null,
      settlementCurrency: null,
      stripeBalanceTransactionId: null,
      stripeExchangeRate: null,
    };
  }

  const balanceTransaction = latestCharge.balance_transaction;

  if (!balanceTransaction || typeof balanceTransaction === "string") {
    return {
      settlementAmountMinor: null,
      settlementCurrency: null,
      stripeBalanceTransactionId:
        typeof balanceTransaction === "string" ? balanceTransaction : null,
      stripeExchangeRate: null,
    };
  }

  return {
    settlementAmountMinor: balanceTransaction.amount,
    settlementCurrency: balanceTransaction.currency,
    stripeBalanceTransactionId: balanceTransaction.id,
    stripeExchangeRate:
      balanceTransaction.exchange_rate === null ||
      balanceTransaction.exchange_rate === undefined
        ? null
        : String(balanceTransaction.exchange_rate),
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
      and(eq(purchases.outcome, "succeeded"), isNull(purchases.settlementAmountMinor)),
    )
    .limit(limit ?? 10_000);
  const stats = {
    dryRun,
    failed: 0,
    planned: rows.length,
    skipped: 0,
    updated: 0,
  };

  for (const row of rows) {
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
        await db
          .update(purchases)
          .set({
            settlementAmountMinor: settlementSnapshot.settlementAmountMinor,
            settlementCurrency: settlementSnapshot.settlementCurrency,
            stripeBalanceTransactionId: settlementSnapshot.stripeBalanceTransactionId,
            stripeExchangeRate: settlementSnapshot.stripeExchangeRate,
            updatedAt: new Date(),
          })
          .where(eq(purchases.id, row.id));
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
