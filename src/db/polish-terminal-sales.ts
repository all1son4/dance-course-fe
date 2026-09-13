import { and, eq, isNull, sql } from "drizzle-orm";

import { getAccountingMonthRange } from "@/lib/accounting-month";

import { getDatabase } from "./client";
import { purchases } from "./schema";

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
    isNull(purchases.terminalRecordedAt),
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

  const [updated] = await getDatabase()
    .update(purchases)
    .set({
      terminalRecordedAt: terminalRecorded ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(purchases.paymentIntentId, normalizedPaymentIntentId),
        eq(purchases.source, "stripe"),
        eq(purchases.outcome, "succeeded"),
        isPolishPurchaseCountry,
      ),
    )
    .returning({
      paymentIntentId: purchases.paymentIntentId,
      terminalRecordedAt: purchases.terminalRecordedAt,
    });

  return updated ?? null;
};
