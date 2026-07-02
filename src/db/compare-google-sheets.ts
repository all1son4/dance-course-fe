import { loadEnvConfig } from "@next/env";

import {
  listEmailCampaignLeadRecords,
  listMonthlySalesReportRunRecords,
  listPaymentRecords,
  listStripeEventRecords,
  listTelegramAccessTokenRecords,
  listTelegramUserBindingRecords,
} from "@/lib/google-sheets";

import { getDatabase, getDatabaseClient } from "./client";
import { purchases } from "./schema";

loadEnvConfig(process.cwd());

const DEFAULT_LIMIT = 20;

type CompareEntry = {
  databaseCount: number;
  duplicateSheetKeys: string[];
  extraInDatabase: string[];
  missingInDatabase: string[];
  sheetCount: number;
  sheetUniqueCount: number;
  status: "ok" | "mismatch";
};

const getLimit = () => {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const parsedLimit = Number.parseInt(limitArg?.split("=")[1] ?? "", 10);

  return Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT;
};

const trim = (value: string | null | undefined) => value?.trim() ?? "";

const getDuplicateKeys = (keys: string[]) => {
  const seenKeys = new Set<string>();
  const duplicateKeys = new Set<string>();

  for (const key of keys) {
    if (seenKeys.has(key)) {
      duplicateKeys.add(key);
    } else {
      seenKeys.add(key);
    }
  }

  return Array.from(duplicateKeys).sort();
};

const compareKeys = ({
  databaseKeys,
  limit,
  sheetKeys,
}: {
  databaseKeys: string[];
  limit: number;
  sheetKeys: string[];
}): CompareEntry => {
  const normalizedSheetKeys = sheetKeys.map(trim).filter(Boolean);
  const normalizedDatabaseKeys = databaseKeys.map(trim).filter(Boolean);
  const sheetKeySet = new Set(normalizedSheetKeys);
  const databaseKeySet = new Set(normalizedDatabaseKeys);
  const missingInDatabase = Array.from(sheetKeySet)
    .filter((key) => !databaseKeySet.has(key))
    .sort();
  const extraInDatabase = Array.from(databaseKeySet)
    .filter((key) => !sheetKeySet.has(key))
    .sort();

  return {
    databaseCount: normalizedDatabaseKeys.length,
    duplicateSheetKeys: getDuplicateKeys(normalizedSheetKeys).slice(0, limit),
    extraInDatabase: extraInDatabase.slice(0, limit),
    missingInDatabase: missingInDatabase.slice(0, limit),
    sheetCount: normalizedSheetKeys.length,
    sheetUniqueCount: sheetKeySet.size,
    status: missingInDatabase.length === 0 ? "ok" : "mismatch",
  };
};

const getBindingKey = ({
  chatId,
  paymentIntentId,
}: {
  chatId: string;
  paymentIntentId: string;
}) => `${paymentIntentId.trim()}::${chatId.trim()}`;

const getSettlementAudit = async (limit: number) => {
  const db = getDatabase();
  const purchaseRows = await db
    .select({
      amountMinor: purchases.amountMinor,
      checkoutCurrency: purchases.checkoutCurrency,
      currency: purchases.currency,
      outcome: purchases.outcome,
      paymentIntentId: purchases.paymentIntentId,
      settlementAmountMinor: purchases.settlementAmountMinor,
      settlementCurrency: purchases.settlementCurrency,
      stripeBalanceTransactionId: purchases.stripeBalanceTransactionId,
    })
    .from(purchases);
  const eurSucceededRows = purchaseRows.filter(
    (row) =>
      row.outcome === "succeeded" &&
      (row.currency.trim().toLowerCase() === "eur" ||
        row.checkoutCurrency?.trim().toLowerCase() === "eur"),
  );
  const missingSettlementRows = eurSucceededRows.filter(
    (row) =>
      row.settlementAmountMinor === null ||
      !row.settlementCurrency?.trim() ||
      !row.stripeBalanceTransactionId?.trim(),
  );

  return {
    checkedEurSucceededPurchases: eurSucceededRows.length,
    missingSettlement: missingSettlementRows.slice(0, limit).map((row) => ({
      amountMinor: row.amountMinor,
      checkoutCurrency: row.checkoutCurrency,
      currency: row.currency,
      paymentIntentId: row.paymentIntentId,
      settlementAmountMinor: row.settlementAmountMinor,
      settlementCurrency: row.settlementCurrency,
      stripeBalanceTransactionId: row.stripeBalanceTransactionId,
    })),
    status: missingSettlementRows.length === 0 ? ("ok" as const) : ("mismatch" as const),
  };
};

const main = async () => {
  const limit = getLimit();
  const [
    sheetPayments,
    databasePayments,
    sheetStripeEvents,
    databaseStripeEvents,
    sheetTelegramTokens,
    databaseTelegramTokens,
    sheetTelegramBindings,
    databaseTelegramBindings,
    sheetMonthlyRuns,
    databaseMonthlyRuns,
    sheetEmailLeads,
    databaseEmailLeads,
    settlement,
  ] = await Promise.all([
    listPaymentRecords({ cacheTtlMs: 0, source: "sheets" }),
    listPaymentRecords({ cacheTtlMs: 0, source: "database" }),
    listStripeEventRecords({ cacheTtlMs: 0, source: "sheets" }),
    listStripeEventRecords({ cacheTtlMs: 0, source: "database" }),
    listTelegramAccessTokenRecords({ cacheTtlMs: 0, source: "sheets" }),
    listTelegramAccessTokenRecords({ cacheTtlMs: 0, source: "database" }),
    listTelegramUserBindingRecords({ cacheTtlMs: 0, source: "sheets" }),
    listTelegramUserBindingRecords({ cacheTtlMs: 0, source: "database" }),
    listMonthlySalesReportRunRecords({ cacheTtlMs: 0, source: "sheets" }),
    listMonthlySalesReportRunRecords({ cacheTtlMs: 0, source: "database" }),
    listEmailCampaignLeadRecords({ cacheTtlMs: 0, source: "sheets" }),
    listEmailCampaignLeadRecords({ cacheTtlMs: 0, source: "database" }),
    getSettlementAudit(limit),
  ]);
  const comparisons = {
    emailCampaignLeads: compareKeys({
      databaseKeys: databaseEmailLeads.map((record) => record.lead_id),
      limit,
      sheetKeys: sheetEmailLeads.map((record) => record.lead_id),
    }),
    monthlyReportRuns: compareKeys({
      databaseKeys: databaseMonthlyRuns.map((record) => record.report_key),
      limit,
      sheetKeys: sheetMonthlyRuns.map((record) => record.report_key),
    }),
    payments: compareKeys({
      databaseKeys: databasePayments.map((record) => record.payment_intent_id),
      limit,
      sheetKeys: sheetPayments.map((record) => record.payment_intent_id),
    }),
    stripeEvents: compareKeys({
      databaseKeys: databaseStripeEvents.map((record) => record.event_id),
      limit,
      sheetKeys: sheetStripeEvents.map((record) => record.event_id),
    }),
    telegramAccessTokens: compareKeys({
      databaseKeys: databaseTelegramTokens.map((record) => record.token_id),
      limit,
      sheetKeys: sheetTelegramTokens.map((record) => record.token_id),
    }),
    telegramUserBindings: compareKeys({
      databaseKeys: databaseTelegramBindings.map((record) =>
        getBindingKey({
          chatId: record.chat_id,
          paymentIntentId: record.payment_intent_id,
        }),
      ),
      limit,
      sheetKeys: sheetTelegramBindings.map((record) =>
        getBindingKey({
          chatId: record.chat_id,
          paymentIntentId: record.payment_intent_id,
        }),
      ),
    }),
  };
  const status =
    Object.values(comparisons).every((comparison) => comparison.status === "ok") &&
    settlement.status === "ok"
      ? "ok"
      : "mismatch";

  console.warn(
    JSON.stringify(
      {
        comparisons,
        limit,
        settlement,
        status,
      },
      null,
      2,
    ),
  );

  if (status !== "ok") {
    process.exitCode = 1;
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
