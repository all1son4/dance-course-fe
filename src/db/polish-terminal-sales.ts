import { and, eq, sql } from "drizzle-orm";

import { getAccountingMonthRange } from "@/lib/accounting-month";

import { getDatabase } from "./client";
import { purchases, purchaseSideEffects } from "./schema";

export const POLISH_TERMINAL_RECORDED_KIND = "polish_terminal_recorded" as const;

// New checkouts persist ISO `PL`. The names cover historical rows imported
// from the retired spreadsheet before the checkout country field was normalized.
export const isPolishPurchaseCountry = sql<boolean>`UPPER(BTRIM(COALESCE(${purchases.customerCountrySnapshot}, ''))) IN ('PL', 'POLAND', 'POLSKA', 'ПОЛЬША')`;

const soldAtColumn = sql<Date>`COALESCE(${purchases.succeededAt}, ${purchases.createdAt})`;

const getOutstandingFilter = (monthValue: string) => {
  const range = getAccountingMonthRange(monthValue);

  if (!range) {
    return null;
  }

  return and(
    eq(purchases.source, "stripe"),
    eq(purchases.outcome, "succeeded"),
    isPolishPurchaseCountry,
    sql`NOT EXISTS (
      SELECT 1
      FROM ${purchaseSideEffects}
      WHERE ${purchaseSideEffects.purchaseId} = ${purchases.id}
        AND ${purchaseSideEffects.kind} = ${POLISH_TERMINAL_RECORDED_KIND}
    )`,
    sql`${soldAtColumn} >= ${range.start.toISOString()}::timestamptz`,
    sql`${soldAtColumn} < ${range.end.toISOString()}::timestamptz`,
  );
};

export const countOutstandingPolishTerminalSales = async (monthValue: string) => {
  const filter = getOutstandingFilter(monthValue);

  if (!filter) {
    throw new Error("invalid_polish_terminal_sales_month");
  }

  const [row] = await getDatabase()
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(purchases)
    .where(filter);

  return row?.count ?? 0;
};

export const setPolishSaleTerminalRecorded = async ({
  now = new Date(),
  paymentIntentId,
  terminalRecorded,
}: {
  now?: Date;
  paymentIntentId: string;
  terminalRecorded: boolean;
}) => {
  const normalizedPaymentIntentId = paymentIntentId.trim();

  if (!normalizedPaymentIntentId) {
    return null;
  }

  return getDatabase().transaction(async (transaction) => {
    const [purchase] = await transaction
      .select({
        id: purchases.id,
        paymentIntentId: purchases.paymentIntentId,
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.paymentIntentId, normalizedPaymentIntentId),
          eq(purchases.source, "stripe"),
          eq(purchases.outcome, "succeeded"),
          isPolishPurchaseCountry,
        ),
      )
      .limit(1)
      .for("update");

    if (!purchase) {
      return null;
    }

    if (terminalRecorded) {
      await transaction
        .insert(purchaseSideEffects)
        .values({
          deduplicationKey: `polish-terminal-recorded:${purchase.id}`,
          kind: POLISH_TERMINAL_RECORDED_KIND,
          payload: {},
          provider: "internal",
          purchaseId: purchase.id,
          sentAt: now,
          status: "sent",
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: {
            sentAt: now,
            status: "sent",
            updatedAt: now,
          },
          target: [purchaseSideEffects.purchaseId, purchaseSideEffects.kind],
        });
    } else {
      await transaction
        .delete(purchaseSideEffects)
        .where(
          and(
            eq(purchaseSideEffects.purchaseId, purchase.id),
            eq(purchaseSideEffects.kind, POLISH_TERMINAL_RECORDED_KIND),
          ),
        );
    }

    return {
      paymentIntentId: purchase.paymentIntentId,
      terminalRecordedAt: terminalRecorded ? now : null,
    };
  });
};
