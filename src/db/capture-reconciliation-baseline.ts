import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  listEmailCampaignLeadRecords,
  listMonthlySalesReportRunRecords,
  listPaymentRecords,
  listStripeEventRecords,
  listSuccessfulCustomerRecordsFromSheets,
  listTelegramAccessTokenRecords,
  listTelegramUserBindingRecords,
} from "@/lib/google-sheets";

import { getDatabaseEnvSelection, getRequiredDatabaseUrlFromEnv } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";
import {
  buildReconciliationBaseline,
  type DatabaseReconciliationSnapshot,
} from "./reconciliation-baseline";
import {
  accessEntitlements,
  customers,
  emailCampaignLeads,
  invoices,
  monthlyReportRuns,
  offerPrices,
  onlineGroupCampaigns,
  productOffers,
  products,
  purchases,
  purchaseSideEffects,
  renewalCampaigns,
  stripeEvents,
  telegramAccessTokens,
  telegramRenewalVerifications,
  telegramUserBindings,
} from "./schema";

loadDatabaseEnvConfig();

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof drizzle>["transaction"]>[0]
>[0];

const getArgumentValue = (name: string) => {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));

  return argument?.slice(prefix.length).trim() ?? "";
};

const getSampleLimit = () => {
  const parsedValue = Number.parseInt(getArgumentValue("sample-limit"), 10);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
};

const loadSheetsSnapshot = async () => {
  const readOptions = {
    cacheTtlMs: 0,
    readOnly: true,
    source: "sheets" as const,
  };
  const [
    payments,
    stripeEventRows,
    successfulCustomers,
    telegramTokenRows,
    telegramBindingRows,
    monthlyRuns,
    emailLeads,
  ] = await Promise.all([
    listPaymentRecords(readOptions),
    listStripeEventRecords(readOptions),
    listSuccessfulCustomerRecordsFromSheets({
      cacheTtlMs: 0,
      readOnly: true,
    }),
    listTelegramAccessTokenRecords(readOptions),
    listTelegramUserBindingRecords(readOptions),
    listMonthlySalesReportRunRecords(readOptions),
    listEmailCampaignLeadRecords(readOptions),
  ]);

  return {
    emailCampaignLeads: emailLeads,
    monthlyReportRuns: monthlyRuns,
    payments,
    stripeEvents: stripeEventRows,
    successfulCustomers,
    telegramAccessTokens: telegramTokenRows,
    telegramUserBindings: telegramBindingRows,
  };
};

const loadCatalogSnapshot = async (
  transaction: DatabaseTransaction,
): Promise<DatabaseReconciliationSnapshot["catalog"]> => {
  const productRows = await transaction
    .select({
      code: products.code,
      defaultOfferExternalId: products.defaultOfferExternalId,
      externalProductId: products.externalProductId,
      id: products.id,
      isActive: products.isActive,
      slug: products.slug,
      type: products.type,
    })
    .from(products);
  const productExternalIdById = new Map(
    productRows.map((row) => [row.id, row.externalProductId] as const),
  );
  const offerRows = await transaction
    .select({
      accessWorkflow: productOffers.accessWorkflow,
      code: productOffers.code,
      deliveryChannel: productOffers.deliveryChannel,
      externalOfferId: productOffers.externalOfferId,
      id: productOffers.id,
      isActive: productOffers.isActive,
      productId: productOffers.productId,
      sortOrder: productOffers.sortOrder,
      telegramAccessDurationDays: productOffers.telegramAccessDurationDays,
    })
    .from(productOffers);
  const offerExternalIdById = new Map(
    offerRows.map((row) => [row.id, row.externalOfferId] as const),
  );
  const priceRows = await transaction
    .select({
      amountMinor: offerPrices.amountMinor,
      currency: offerPrices.currency,
      isActive: offerPrices.isActive,
      offerId: offerPrices.offerId,
    })
    .from(offerPrices);

  return {
    offers: offerRows.map((row) => ({
      accessWorkflow: row.accessWorkflow,
      code: row.code,
      deliveryChannel: row.deliveryChannel,
      externalOfferId: row.externalOfferId,
      isActive: row.isActive,
      productExternalId: productExternalIdById.get(row.productId) ?? "unknown",
      sortOrder: row.sortOrder,
      telegramAccessDurationDays: row.telegramAccessDurationDays,
    })),
    prices: priceRows.map((row) => ({
      amountMinor: row.amountMinor,
      currency: row.currency,
      externalOfferId: offerExternalIdById.get(row.offerId) ?? "unknown",
      isActive: row.isActive,
    })),
    products: productRows.map((row) => ({
      code: row.code,
      defaultOfferExternalId: row.defaultOfferExternalId,
      externalProductId: row.externalProductId,
      isActive: row.isActive,
      slug: row.slug,
      type: row.type,
    })),
  };
};

const loadDatabaseSnapshotInTransaction = async (
  transaction: DatabaseTransaction,
): Promise<DatabaseReconciliationSnapshot> => {
  await transaction.execute(sql`set transaction read only`);

  const purchaseRows = await transaction
    .select({
      amountMinor: purchases.amountMinor,
      currency: purchases.currency,
      firstSeenAt: purchases.firstSeenAt,
      id: purchases.id,
      outcome: purchases.outcome,
      paymentIntentId: purchases.paymentIntentId,
      productExternalId: purchases.productExternalId,
      source: purchases.source,
      succeededAt: purchases.succeededAt,
    })
    .from(purchases);
  const paymentIntentIdByPurchaseId = new Map(
    purchaseRows.map((row) => [row.id, row.paymentIntentId] as const),
  );
  const stripeEventRows = await transaction
    .select({
      eventType: stripeEvents.eventType,
      key: stripeEvents.stripeEventId,
      source: sql<string>`coalesce(${stripeEvents.payload} ->> 'source', 'runtime')`,
      status: stripeEvents.processingStatus,
    })
    .from(stripeEvents);
  const telegramTokenRows = await transaction
    .select({
      key: telegramAccessTokens.tokenId,
      linkKind: telegramAccessTokens.linkKind,
      productExternalId: purchases.productExternalId,
      status: telegramAccessTokens.status,
    })
    .from(telegramAccessTokens)
    .innerJoin(purchases, eq(telegramAccessTokens.purchaseId, purchases.id));
  const telegramBindingRows = await transaction
    .select({
      chatId: telegramUserBindings.chatId,
      productExternalId: purchases.productExternalId,
      purchaseId: telegramUserBindings.purchaseId,
      status: telegramUserBindings.status,
    })
    .from(telegramUserBindings)
    .innerJoin(purchases, eq(telegramUserBindings.purchaseId, purchases.id));
  const entitlementRows = await transaction
    .select({
      accessKey: accessEntitlements.accessKey,
      status: accessEntitlements.status,
    })
    .from(accessEntitlements);
  const invoiceRows = await transaction
    .select({
      key: invoices.invoiceNumber,
    })
    .from(invoices);
  const sideEffectRows = await transaction
    .select({
      kind: purchaseSideEffects.kind,
      status: purchaseSideEffects.status,
    })
    .from(purchaseSideEffects);
  const monthlyRunRows = await transaction
    .select({
      key: monthlyReportRuns.reportKey,
      status: monthlyReportRuns.deliveryStatus,
    })
    .from(monthlyReportRuns);
  const emailLeadRows = await transaction
    .select({
      campaignKey: emailCampaignLeads.campaignKey,
      key: emailCampaignLeads.leadId,
      status: emailCampaignLeads.emailSendStatus,
    })
    .from(emailCampaignLeads);
  const renewalCampaignRows = await transaction
    .select({
      status: renewalCampaigns.status,
    })
    .from(renewalCampaigns);
  const onlineGroupCampaignRows = await transaction
    .select({
      status: onlineGroupCampaigns.status,
    })
    .from(onlineGroupCampaigns);
  const renewalVerificationRows = await transaction
    .select({
      status: telegramRenewalVerifications.status,
    })
    .from(telegramRenewalVerifications);
  const customerRows = await transaction.select({ id: customers.id }).from(customers);
  const catalog = await loadCatalogSnapshot(transaction);

  return {
    catalog,
    customerCount: customerRows.length,
    emailCampaignLeads: emailLeadRows,
    entitlements: entitlementRows,
    invoices: invoiceRows,
    monthlyReportRuns: monthlyRunRows,
    onlineGroupCampaigns: onlineGroupCampaignRows,
    purchases: purchaseRows.map((row) => ({
      amountMinor: row.amountMinor,
      currency: row.currency,
      firstSeenAt: row.firstSeenAt,
      key: row.paymentIntentId,
      outcome: row.outcome,
      productExternalId: row.productExternalId ?? "unknown",
      source: row.source,
      succeededAt: row.succeededAt,
    })),
    purchaseSideEffects: sideEffectRows,
    renewalCampaigns: renewalCampaignRows,
    renewalVerifications: renewalVerificationRows,
    stripeEvents: stripeEventRows,
    telegramAccessTokens: telegramTokenRows.map((row) => ({
      ...row,
      productExternalId: row.productExternalId ?? "unknown",
    })),
    telegramUserBindings: telegramBindingRows.map((row) => ({
      key: `${paymentIntentIdByPurchaseId.get(row.purchaseId) ?? ""}::${
        row.chatId ?? ""
      }`,
      productExternalId: row.productExternalId ?? "unknown",
      status: row.status,
    })),
  };
};

const loadDatabaseSnapshot = async () => {
  const client = postgres(
    getRequiredDatabaseUrlFromEnv({
      kind: "unpooled",
      purpose: "read-only reconciliation baseline",
    }),
    {
      connect_timeout: 15,
      max: 1,
      prepare: false,
    },
  );
  const database = drizzle(client);

  try {
    return await database.transaction((transaction) =>
      loadDatabaseSnapshotInTransaction(transaction),
    );
  } finally {
    await client.end();
  }
};

const writeReport = async (serializedReport: string) => {
  const outputPath = getArgumentValue("output");

  if (!outputPath) {
    process.stdout.write(`${serializedReport}\n`);
    return;
  }

  const resolvedOutputPath = resolve(process.cwd(), outputPath);

  await writeFile(resolvedOutputPath, `${serializedReport}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`Baseline written to ${resolvedOutputPath}\n`);
};

const main = async () => {
  const capturedAt = new Date().toISOString();
  const databaseSelection = getDatabaseEnvSelection("unpooled");
  const [database, sheets] = await Promise.all([
    loadDatabaseSnapshot(),
    loadSheetsSnapshot(),
  ]);
  const report = buildReconciliationBaseline({
    database,
    options: {
      capturedAt,
      databaseEnvironment: databaseSelection.deploymentEnvironment,
      databaseVariableName: databaseSelection.variableName,
      sampleLimit: getSampleLimit(),
    },
    sheets,
  });
  const serializedReport = JSON.stringify(report, null, 2);

  await writeReport(serializedReport);

  if (process.argv.includes("--strict") && report.status !== "ok") {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown baseline error";
  console.error(`Failed to capture reconciliation baseline: ${message}`);
  process.exitCode = 1;
});
