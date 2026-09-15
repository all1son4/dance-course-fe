import { and, desc, eq, ilike, isNull, or, sql, type SQLWrapper } from "drizzle-orm";

import { PURCHASES_LIST_LIMIT } from "@/app/admin/lib/admin.constants";
import {
  ACCOUNTING_TIME_ZONE,
  getAccountingMonthRange,
  getAccountingMonthValue,
  getPreviousAccountingMonthValue,
} from "@/lib/accounting-month";
import { formatMinorAmount } from "@/lib/minor-amount";

import { getDatabase } from "./client";
import {
  isPolishPurchaseCountry,
  POLISH_TERMINAL_RECORDED_KIND,
} from "./polish-terminal-sales";
import {
  invoices,
  productOffers,
  products,
  purchases,
  purchaseSideEffects,
} from "./schema";
import {
  getCanonicalSucceededStripeEvents,
  stripeFinancialDataComplete as stripeFinancialDataCompletePredicate,
} from "./stripe-sales";

const PRODUCT_BREAKDOWN_LIMIT = 8;

type PurchaseOutcome = typeof purchases.$inferSelect.outcome;

export type AdminPurchaseListEntry = {
  amountLabel: string;
  customerEmail: string;
  customerName: string;
  invoiceNumber: string;
  isPolish: boolean;
  outcome: PurchaseOutcome;
  paymentIntentId: string;
  purchaseItem: string;
  soldAtIso: string;
  terminalRecordedAtIso: string;
};

export type AdminPurchasesSummary = {
  eurTotalLabel: string;
  eurTotalMinor: number;
  failedAttempts: number;
  feeTotalLabel: string;
  feeTotalMinor: number | null;
  grossTotalLabel: string;
  grossTotalMinor: number | null;
  monthValue: string;
  netTotalLabel: string;
  netTotalMinor: number | null;
  plnTotalLabel: string;
  plnTotalMinor: number;
  salesCount: number;
  settledCount: number;
  stripeFinancialDataComplete: boolean;
  unconfirmedSalesCount: number;
};

export type AdminPurchasesPreviousSummary = {
  eurTotalMinor: number;
  grossTotalMinor: number | null;
  monthValue: string;
  netTotalMinor: number | null;
  plnTotalMinor: number;
  salesCount: number;
  stripeFinancialDataComplete: boolean;
};

export type AdminProductBreakdownEntry = {
  amountLabels: string[];
  itemTitle: string;
  salesCount: number;
};

const escapeLikePattern = (value: string) => value.replaceAll(/([%_\\])/g, "\\$1");

const parseMinorTotal = (value: string | number | null | undefined) => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error("admin_sales_money_total_out_of_range");
  }

  return parsed;
};

// These are the same half-open Europe/Warsaw accounting ranges used by the
// monthly report. ISO strings need an explicit cast when a raw SQL expression
// is compared because the driver cannot infer a Date parameter type from it.
const timestampWithinRange = (
  timestamp: SQLWrapper,
  monthRange: { end: Date; start: Date },
) => [
  sql`${timestamp} >= ${monthRange.start.toISOString()}::timestamptz`,
  sql`${timestamp} < ${monthRange.end.toISOString()}::timestamptz`,
];

// Distinct sale months come from the same canonical processed Stripe events as
// the CSV, so the selector and the report cannot disagree at month boundaries.
export const listAdminSalesMonths = async (): Promise<string[]> => {
  const db = getDatabase();
  const canonicalSucceededEvents = getCanonicalSucceededStripeEvents();
  const nowIso = new Date().toISOString();
  // Keep one SQL expression for DISTINCT and ORDER BY. Without an alias Drizzle
  // binds the timezone twice, and PostgreSQL no longer considers the ORDER BY
  // expression identical to the selected DISTINCT expression.
  const monthColumn =
    sql<string>`to_char(date_trunc('month', ${canonicalSucceededEvents.saleTimestamp} AT TIME ZONE ${ACCOUNTING_TIME_ZONE}), 'YYYY-MM')`.as(
      "accounting_month",
    );
  const rows = await db
    .selectDistinct({ monthValue: monthColumn })
    .from(purchases)
    .innerJoin(
      canonicalSucceededEvents,
      eq(canonicalSucceededEvents.paymentIntentId, purchases.paymentIntentId),
    )
    .where(
      and(
        eq(purchases.source, "stripe"),
        eq(purchases.outcome, "succeeded"),
        sql`${canonicalSucceededEvents.saleTimestamp} < ${nowIso}::timestamptz`,
      ),
    )
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
  const canonicalSucceededEvents = getCanonicalSucceededStripeEvents();
  const canonicalSoldAtColumn = canonicalSucceededEvents.saleTimestamp;
  // Non-successful attempts have no succeeded event; their operational date is
  // kept only for the attempt counter and purchase journal.
  const attemptAtColumn = sql<Date>`COALESCE(${purchases.succeededAt}, ${purchases.createdAt})`;
  const displayedAtColumn = sql<Date>`COALESCE(
    ${canonicalSoldAtColumn},
    ${purchases.succeededAt},
    ${purchases.createdAt}
  )`;
  const referenceDate = new Date();
  const fullMonthRange = getAccountingMonthRange(monthValue);
  const monthRange =
    fullMonthRange && monthValue === getAccountingMonthValue(referenceDate)
      ? { ...fullMonthRange, end: referenceDate }
      : fullMonthRange;
  const previousMonthValue = getPreviousAccountingMonthValue(monthValue);
  const previousMonthRange = previousMonthValue
    ? getAccountingMonthRange(previousMonthValue)
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
        ...(monthRange
          ? [
              or(
                and(
                  eq(purchases.outcome, "succeeded"),
                  ...timestampWithinRange(canonicalSoldAtColumn, monthRange),
                ),
                and(
                  sql`${purchases.outcome} <> 'succeeded'`,
                  ...timestampWithinRange(attemptAtColumn, monthRange),
                ),
              ),
            ]
          : []),
      );

  // Snapshots keep whatever language the buyer checked out in, so grouping by
  // them splits one offer into per-language rows. The catalogue title and offer
  // label are the canonical Russian names; snapshots remain the fallback for
  // legacy purchases that predate the catalogue link.
  const productItemColumn = sql<string>`COALESCE(
    ${products.title} || COALESCE(' — ' || NULLIF(BTRIM(${productOffers.label}), ''), ''),
    NULLIF(BTRIM(${purchases.purchaseItemSnapshot}), ''),
    NULLIF(BTRIM(${purchases.productTitleSnapshot}), ''),
    NULLIF(BTRIM(${purchases.offerLabelSnapshot}), ''),
    'Без названия'
  )`;

  const [
    listRows,
    summaryRows,
    previousSummaryRows,
    productRows,
    failedAttemptRows,
    unconfirmedSaleRows,
  ] = await Promise.all([
    db
      .select({
        amountMinor: purchases.amountMinor,
        currency: purchases.currency,
        customerEmail: purchases.customerEmailSnapshot,
        customerName: purchases.customerFullNameSnapshot,
        invoiceNumber: invoices.invoiceNumber,
        isPolish: isPolishPurchaseCountry,
        outcome: purchases.outcome,
        paymentIntentId: purchases.paymentIntentId,
        purchaseItem: productItemColumn,
        soldAt: displayedAtColumn,
        terminalRecordedAt: purchaseSideEffects.sentAt,
      })
      .from(purchases)
      .leftJoin(
        canonicalSucceededEvents,
        eq(canonicalSucceededEvents.paymentIntentId, purchases.paymentIntentId),
      )
      .leftJoin(invoices, eq(invoices.purchaseId, purchases.id))
      .leftJoin(products, eq(products.id, purchases.productId))
      .leftJoin(productOffers, eq(productOffers.id, purchases.offerId))
      .leftJoin(
        purchaseSideEffects,
        and(
          eq(purchaseSideEffects.purchaseId, purchases.id),
          eq(purchaseSideEffects.kind, POLISH_TERMINAL_RECORDED_KIND),
        ),
      )
      .where(listFilter)
      .orderBy(desc(displayedAtColumn), desc(purchases.paymentIntentId))
      .limit(PURCHASES_LIST_LIMIT),
    monthRange
      ? db
          .select({
            eurTotalMinor: sql<string>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.currency} = 'eur'), 0)::text`,
            feeTotalMinor: sql<string>`COALESCE(SUM(${purchases.stripeFeeAmountMinor}), 0)::text`,
            grossTotalMinor: sql<string>`COALESCE(SUM(${purchases.settlementAmountMinor}), 0)::text`,
            netTotalMinor: sql<string>`COALESCE(SUM(${purchases.stripeNetAmountMinor}), 0)::text`,
            plnTotalMinor: sql<string>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.currency} = 'pln'), 0)::text`,
            salesCount: sql<number>`COUNT(*)::int`,
            settledCount: sql<number>`COUNT(*) FILTER (WHERE ${stripeFinancialDataCompletePredicate})::int`,
          })
          .from(purchases)
          .innerJoin(
            canonicalSucceededEvents,
            eq(canonicalSucceededEvents.paymentIntentId, purchases.paymentIntentId),
          )
          .where(
            and(
              eq(purchases.source, "stripe"),
              eq(purchases.outcome, "succeeded"),
              ...timestampWithinRange(canonicalSoldAtColumn, monthRange),
            ),
          )
      : Promise.resolve([]),
    previousMonthRange
      ? db
          .select({
            eurTotalMinor: sql<string>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.currency} = 'eur'), 0)::text`,
            grossTotalMinor: sql<string>`COALESCE(SUM(${purchases.settlementAmountMinor}), 0)::text`,
            netTotalMinor: sql<string>`COALESCE(SUM(${purchases.stripeNetAmountMinor}), 0)::text`,
            plnTotalMinor: sql<string>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.currency} = 'pln'), 0)::text`,
            salesCount: sql<number>`COUNT(*)::int`,
            settledCount: sql<number>`COUNT(*) FILTER (WHERE ${stripeFinancialDataCompletePredicate})::int`,
          })
          .from(purchases)
          .innerJoin(
            canonicalSucceededEvents,
            eq(canonicalSucceededEvents.paymentIntentId, purchases.paymentIntentId),
          )
          .where(
            and(
              eq(purchases.source, "stripe"),
              eq(purchases.outcome, "succeeded"),
              ...timestampWithinRange(canonicalSoldAtColumn, previousMonthRange),
            ),
          )
      : Promise.resolve([]),
    monthRange
      ? db
          .select({
            eurTotalMinor: sql<string>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.currency} = 'eur'), 0)::text`,
            itemTitle: productItemColumn,
            plnTotalMinor: sql<string>`COALESCE(SUM(${purchases.amountMinor}) FILTER (WHERE ${purchases.currency} = 'pln'), 0)::text`,
            salesCount: sql<number>`COUNT(*)::int`,
          })
          .from(purchases)
          .innerJoin(
            canonicalSucceededEvents,
            eq(canonicalSucceededEvents.paymentIntentId, purchases.paymentIntentId),
          )
          .leftJoin(products, eq(products.id, purchases.productId))
          .leftJoin(productOffers, eq(productOffers.id, purchases.offerId))
          .where(
            and(
              eq(purchases.source, "stripe"),
              eq(purchases.outcome, "succeeded"),
              ...timestampWithinRange(canonicalSoldAtColumn, monthRange),
            ),
          )
          .groupBy(productItemColumn)
          .orderBy(desc(sql`COUNT(*)`), desc(sql`SUM(${purchases.amountMinor})`))
          .limit(PRODUCT_BREAKDOWN_LIMIT)
      : Promise.resolve([]),
    monthRange
      ? db
          .select({
            count: sql<number>`COUNT(*)::int`,
          })
          .from(purchases)
          .where(
            and(
              eq(purchases.source, "stripe"),
              sql`${purchases.outcome} IN ('failed', 'canceled')`,
              ...timestampWithinRange(attemptAtColumn, monthRange),
            ),
          )
      : Promise.resolve([]),
    monthRange
      ? db
          .select({
            count: sql<number>`COUNT(*)::int`,
          })
          .from(purchases)
          .leftJoin(
            canonicalSucceededEvents,
            eq(canonicalSucceededEvents.paymentIntentId, purchases.paymentIntentId),
          )
          .where(
            and(
              eq(purchases.source, "stripe"),
              eq(purchases.outcome, "succeeded"),
              isNull(canonicalSucceededEvents.paymentIntentId),
              ...timestampWithinRange(attemptAtColumn, monthRange),
            ),
          )
      : Promise.resolve([]),
  ]);

  const summaryRow = summaryRows[0];
  const previousSummaryRow = previousSummaryRows[0];
  const salesCount = summaryRow?.salesCount ?? 0;
  const settledCount = summaryRow?.settledCount ?? 0;
  const stripeFinancialDataComplete = settledCount === salesCount;
  const grossTotalMinor = stripeFinancialDataComplete
    ? parseMinorTotal(summaryRow?.grossTotalMinor)
    : null;
  const feeTotalMinor = stripeFinancialDataComplete
    ? parseMinorTotal(summaryRow?.feeTotalMinor)
    : null;
  const netTotalMinor = stripeFinancialDataComplete
    ? parseMinorTotal(summaryRow?.netTotalMinor)
    : null;

  if (
    grossTotalMinor !== null &&
    feeTotalMinor !== null &&
    netTotalMinor !== null &&
    grossTotalMinor !== feeTotalMinor + netTotalMinor
  ) {
    throw new Error("admin_sales_stripe_totals_inconsistent");
  }

  const previousSalesCount = previousSummaryRow?.salesCount ?? 0;
  const previousStripeFinancialDataComplete =
    (previousSummaryRow?.settledCount ?? 0) === previousSalesCount;

  return {
    previousSummary:
      previousMonthValue && previousSummaryRow
        ? {
            eurTotalMinor: parseMinorTotal(previousSummaryRow.eurTotalMinor),
            grossTotalMinor: previousStripeFinancialDataComplete
              ? parseMinorTotal(previousSummaryRow.grossTotalMinor)
              : null,
            monthValue: previousMonthValue,
            netTotalMinor: previousStripeFinancialDataComplete
              ? parseMinorTotal(previousSummaryRow.netTotalMinor)
              : null,
            plnTotalMinor: parseMinorTotal(previousSummaryRow.plnTotalMinor),
            salesCount: previousSalesCount,
            stripeFinancialDataComplete: previousStripeFinancialDataComplete,
          }
        : null,
    products: productRows.map((row) => {
      const plnTotalMinor = parseMinorTotal(row.plnTotalMinor);
      const eurTotalMinor = parseMinorTotal(row.eurTotalMinor);

      return {
        amountLabels: [
          ...(plnTotalMinor > 0 ? [formatMinorAmount(plnTotalMinor, "pln")] : []),
          ...(eurTotalMinor > 0 ? [formatMinorAmount(eurTotalMinor, "eur")] : []),
        ],
        itemTitle: row.itemTitle,
        salesCount: row.salesCount,
      };
    }),
    purchases: listRows.map((row) => ({
      amountLabel: formatMinorAmount(row.amountMinor, row.currency),
      customerEmail: row.customerEmail ?? "",
      customerName: row.customerName ?? "",
      invoiceNumber: row.invoiceNumber ?? "",
      isPolish: row.isPolish,
      outcome: row.outcome,
      paymentIntentId: row.paymentIntentId,
      purchaseItem: row.purchaseItem,
      soldAtIso: new Date(row.soldAt).toISOString(),
      terminalRecordedAtIso: row.terminalRecordedAt?.toISOString() ?? "",
    })),
    summary: {
      eurTotalLabel: formatMinorAmount(parseMinorTotal(summaryRow?.eurTotalMinor), "eur"),
      eurTotalMinor: parseMinorTotal(summaryRow?.eurTotalMinor),
      failedAttempts: failedAttemptRows[0]?.count ?? 0,
      feeTotalLabel:
        feeTotalMinor === null ? "" : formatMinorAmount(feeTotalMinor, "pln"),
      feeTotalMinor,
      grossTotalLabel:
        grossTotalMinor === null ? "" : formatMinorAmount(grossTotalMinor, "pln"),
      grossTotalMinor,
      monthValue,
      netTotalLabel:
        netTotalMinor === null ? "" : formatMinorAmount(netTotalMinor, "pln"),
      netTotalMinor,
      plnTotalLabel: formatMinorAmount(parseMinorTotal(summaryRow?.plnTotalMinor), "pln"),
      plnTotalMinor: parseMinorTotal(summaryRow?.plnTotalMinor),
      salesCount,
      settledCount,
      stripeFinancialDataComplete,
      unconfirmedSalesCount: unconfirmedSaleRows[0]?.count ?? 0,
    },
  };
};
