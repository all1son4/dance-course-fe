import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { PURCHASES_LIST_LIMIT } from "@/app/admin/lib/admin.constants";
import { formatMinorAmount } from "@/lib/minor-amount";

import { getDatabase } from "./client";
import { invoices, purchases } from "./schema";

const PRODUCT_BREAKDOWN_LIMIT = 8;

type PurchaseOutcome = typeof purchases.$inferSelect.outcome;

export type AdminPurchaseListEntry = {
  amountLabel: string;
  customerEmail: string;
  customerName: string;
  invoiceNumber: string;
  outcome: PurchaseOutcome;
  paymentIntentId: string;
  purchaseItem: string;
  soldAtIso: string;
};

export type AdminPurchasesSummary = {
  eurTotalLabel: string;
  eurTotalMinor: number;
  failedAttempts: number;
  feeTotalLabel: string;
  monthValue: string;
  netTotalLabel: string;
  plnTotalLabel: string;
  plnTotalMinor: number;
  salesCount: number;
  settledCount: number;
};

export type AdminPurchasesPreviousSummary = {
  eurTotalMinor: number;
  monthValue: string;
  plnTotalMinor: number;
  salesCount: number;
};

export type AdminProductBreakdownEntry = {
  amountLabels: string[];
  itemTitle: string;
  salesCount: number;
};

const getUtcMonthRange = (monthValue: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return {
    end: new Date(Date.UTC(year, month, 1)),
    start: new Date(Date.UTC(year, month - 1, 1)),
  };
};

const getPreviousMonthValue = (monthValue: string) => {
  const range = getUtcMonthRange(monthValue);

  if (!range) {
    return null;
  }

  const previousMonthStart = new Date(
    Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth() - 1, 1),
  );

  return `${previousMonthStart.getUTCFullYear()}-${String(
    previousMonthStart.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
};

const escapeLikePattern = (value: string) => value.replaceAll(/([%_\\])/g, "\\$1");

// The moment a purchase counts as "sold": settlement time for succeeded
// payments, first-seen time while the payment is still in flight or failed.
const soldAtColumn = sql<Date>`COALESCE(${purchases.succeededAt}, ${purchases.createdAt})`;

// Dates compared against a raw SQL expression must be bound as ISO strings
// with an explicit cast: the driver cannot infer a parameter type from the
// expression and refuses to serialize a Date object.
const soldAtWithinRange = (monthRange: { end: Date; start: Date }) => [
  sql`${soldAtColumn} >= ${monthRange.start.toISOString()}::timestamptz`,
  sql`${soldAtColumn} < ${monthRange.end.toISOString()}::timestamptz`,
];

const succeededInMonthFilter = (monthRange: { end: Date; start: Date }) =>
  and(
    eq(purchases.source, "stripe"),
    eq(purchases.outcome, "succeeded"),
    ...soldAtWithinRange(monthRange),
  );

// Distinct sale months for the month selector — bucketed by the same soldAt
// expression as the summary and the list, so the dropdown never offers a month
// the screen would render as empty.
export const listAdminSalesMonths = async (): Promise<string[]> => {
  const monthColumn = sql<string>`to_char(date_trunc('month', COALESCE(${purchases.succeededAt}, ${purchases.createdAt}) AT TIME ZONE 'UTC'), 'YYYY-MM')`;
  const rows = await getDatabase()
    .selectDistinct({ monthValue: monthColumn })
    .from(purchases)
    .where(and(eq(purchases.source, "stripe"), eq(purchases.outcome, "succeeded")))
    .orderBy(desc(monthColumn));

  return rows.map((row) => row.monthValue);
};

export const getAdminPurchasesOverview = async ({
  monthValue,
  searchQuery,
}: {
  monthValue: string;
  searchQuery: string;
}): Promise<{
  previousSummary: AdminPurchasesPreviousSummary | null;
  products: AdminProductBreakdownEntry[];
  purchases: AdminPurchaseListEntry[];
  summary: AdminPurchasesSummary;
}> => {
  const db = getDatabase();
  const monthRange = getUtcMonthRange(monthValue);
  const previousMonthValue = getPreviousMonthValue(monthValue);
  const previousMonthRange = previousMonthValue
    ? getUtcMonthRange(previousMonthValue)
    : null;
  const normalizedSearch = searchQuery.trim();
  const likePattern = normalizedSearch ? `%${escapeLikePattern(normalizedSearch)}%` : "";

  // A search spans the whole history; without one the list shows the chosen month.
  const listFilter = likePattern
    ? and(
        eq(purchases.source, "stripe"),
        or(
          ilike(purchases.customerEmailSnapshot, likePattern),
          ilike(purchases.customerFullNameSnapshot, likePattern),
          ilike(purchases.paymentIntentId, likePattern),
          ilike(invoices.invoiceNumber, likePattern),
        ),
      )
    : and(
        eq(purchases.source, "stripe"),
        ...(monthRange ? soldAtWithinRange(monthRange) : []),
      );

  const productItemColumn = sql<string>`COALESCE(
    NULLIF(BTRIM(${purchases.purchaseItemSnapshot}), ''),
    NULLIF(BTRIM(${purchases.productTitleSnapshot}), ''),
    NULLIF(BTRIM(${purchases.offerLabelSnapshot}), ''),
    'Без названия'
  )`;

  const [listRows, summaryRows, previousSummaryRows, productRows] = await Promise.all([
    db
      .select({
        amountMinor: purchases.amountMinor,
        currency: purchases.currency,
        customerEmail: purchases.customerEmailSnapshot,
        customerName: purchases.customerFullNameSnapshot,
        invoiceNumber: invoices.invoiceNumber,
        offerLabel: purchases.offerLabelSnapshot,
        outcome: purchases.outcome,
        paymentIntentId: purchases.paymentIntentId,
        productTitle: purchases.productTitleSnapshot,
        purchaseItem: purchases.purchaseItemSnapshot,
        soldAt: soldAtColumn,
      })
      .from(purchases)
      .leftJoin(invoices, eq(invoices.purchaseId, purchases.id))
      .where(listFilter)
      .orderBy(desc(soldAtColumn), desc(purchases.paymentIntentId))
      .limit(PURCHASES_LIST_LIMIT),
    monthRange
      ? db
          .select({
            eurTotalMinor: sql<number>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.outcome} = 'succeeded' AND ${purchases.currency} = 'eur'), 0)::int`,
            failedAttempts: sql<number>`COUNT(*) FILTER (WHERE ${purchases.outcome} IN ('failed', 'canceled'))::int`,
            feeTotalMinor: sql<number>`COALESCE(SUM(${purchases.stripeFeeAmountMinor}) FILTER (WHERE ${purchases.outcome} = 'succeeded'), 0)::int`,
            netTotalMinor: sql<number>`COALESCE(SUM(${purchases.stripeNetAmountMinor}) FILTER (WHERE ${purchases.outcome} = 'succeeded'), 0)::int`,
            plnTotalMinor: sql<number>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.outcome} = 'succeeded' AND ${purchases.currency} = 'pln'), 0)::int`,
            salesCount: sql<number>`COUNT(*) FILTER (WHERE ${purchases.outcome} = 'succeeded')::int`,
            settledCount: sql<number>`COUNT(*) FILTER (WHERE ${purchases.outcome} = 'succeeded' AND ${purchases.stripeNetAmountMinor} IS NOT NULL)::int`,
            settlementCurrency: sql<
              string | null
            >`MIN(${purchases.settlementCurrency}) FILTER (WHERE ${purchases.outcome} = 'succeeded' AND ${purchases.settlementCurrency} IS NOT NULL)`,
          })
          .from(purchases)
          .where(and(eq(purchases.source, "stripe"), ...soldAtWithinRange(monthRange)))
      : Promise.resolve([]),
    previousMonthRange
      ? db
          .select({
            eurTotalMinor: sql<number>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.currency} = 'eur'), 0)::int`,
            plnTotalMinor: sql<number>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.currency} = 'pln'), 0)::int`,
            salesCount: sql<number>`COUNT(*)::int`,
          })
          .from(purchases)
          .where(succeededInMonthFilter(previousMonthRange))
      : Promise.resolve([]),
    monthRange
      ? db
          .select({
            eurTotalMinor: sql<number>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.currency} = 'eur'), 0)::int`,
            itemTitle: productItemColumn,
            plnTotalMinor: sql<number>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.currency} = 'pln'), 0)::int`,
            salesCount: sql<number>`COUNT(*)::int`,
          })
          .from(purchases)
          .where(succeededInMonthFilter(monthRange))
          .groupBy(productItemColumn)
          .orderBy(desc(sql`COUNT(*)`), desc(sql`SUM(${purchases.amountMinor})`))
          .limit(PRODUCT_BREAKDOWN_LIMIT)
      : Promise.resolve([]),
  ]);

  const summaryRow = summaryRows[0];
  const previousSummaryRow = previousSummaryRows[0];
  const settlementCurrency = summaryRow?.settlementCurrency ?? "pln";
  const settledCount = summaryRow?.settledCount ?? 0;

  return {
    previousSummary:
      previousMonthValue && previousSummaryRow
        ? {
            eurTotalMinor: previousSummaryRow.eurTotalMinor,
            monthValue: previousMonthValue,
            plnTotalMinor: previousSummaryRow.plnTotalMinor,
            salesCount: previousSummaryRow.salesCount,
          }
        : null,
    products: productRows.map((row) => ({
      amountLabels: [
        ...(row.plnTotalMinor > 0 ? [formatMinorAmount(row.plnTotalMinor, "pln")] : []),
        ...(row.eurTotalMinor > 0 ? [formatMinorAmount(row.eurTotalMinor, "eur")] : []),
      ],
      itemTitle: row.itemTitle,
      salesCount: row.salesCount,
    })),
    purchases: listRows.map((row) => ({
      amountLabel: formatMinorAmount(row.amountMinor, row.currency),
      customerEmail: row.customerEmail ?? "",
      customerName: row.customerName ?? "",
      invoiceNumber: row.invoiceNumber ?? "",
      outcome: row.outcome,
      paymentIntentId: row.paymentIntentId,
      purchaseItem:
        row.purchaseItem ??
        [row.productTitle, row.offerLabel].filter(Boolean).join(" • "),
      soldAtIso: new Date(row.soldAt).toISOString(),
    })),
    summary: {
      eurTotalLabel: formatMinorAmount(summaryRow?.eurTotalMinor ?? 0, "eur"),
      eurTotalMinor: summaryRow?.eurTotalMinor ?? 0,
      failedAttempts: summaryRow?.failedAttempts ?? 0,
      feeTotalLabel:
        settledCount > 0
          ? formatMinorAmount(summaryRow?.feeTotalMinor ?? 0, settlementCurrency)
          : "",
      monthValue,
      netTotalLabel:
        settledCount > 0
          ? formatMinorAmount(summaryRow?.netTotalMinor ?? 0, settlementCurrency)
          : "",
      plnTotalLabel: formatMinorAmount(summaryRow?.plnTotalMinor ?? 0, "pln"),
      plnTotalMinor: summaryRow?.plnTotalMinor ?? 0,
      salesCount: summaryRow?.salesCount ?? 0,
      settledCount,
    },
  };
};
