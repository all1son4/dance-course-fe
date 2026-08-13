import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
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

const getDatabaseTransport = () => {
  const transport = getArgumentValue("transport") || "postgres";

  if (transport !== "postgres" && transport !== "http") {
    throw new Error('The --transport value must be either "postgres" or "http".');
  }

  return transport;
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
  { setReadOnlyTransaction = true }: { setReadOnlyTransaction?: boolean } = {},
): Promise<DatabaseReconciliationSnapshot> => {
  if (setReadOnlyTransaction) {
    await transaction.execute(
      sql`set transaction isolation level repeatable read, read only`,
    );
  }

  const purchaseRows = await transaction
    .select({
      amountMinor: purchases.amountMinor,
      catalogProductExternalId: sql<string>`coalesce(
        ${products.externalProductId},
        ''
      )`,
      checkoutCurrency: purchases.checkoutCurrency,
      currency: purchases.currency,
      customerAddressLineSnapshot: purchases.customerAddressLineSnapshot,
      customerCitySnapshot: purchases.customerCitySnapshot,
      customerCountrySnapshot: purchases.customerCountrySnapshot,
      customerEmailSnapshot: purchases.customerEmailSnapshot,
      customerFullNameSnapshot: purchases.customerFullNameSnapshot,
      customerPostalCodeSnapshot: purchases.customerPostalCodeSnapshot,
      customerTelegramUsernameSnapshot: purchases.customerTelegramUsernameSnapshot,
      firstSeenAt: purchases.firstSeenAt,
      id: purchases.id,
      latestEventId: purchases.latestEventId,
      latestEventType: purchases.latestEventType,
      lessonLanguage: purchases.lessonLanguage,
      offerExternalId: sql<string>`coalesce(
        ${purchases.offerExternalId},
        ${productOffers.externalOfferId},
        ''
      )`,
      offerLabelSnapshot: purchases.offerLabelSnapshot,
      outcome: purchases.outcome,
      paymentIntentId: purchases.paymentIntentId,
      productExternalId: sql<string>`coalesce(
        ${purchases.productExternalId},
        ${products.externalProductId},
        ''
      )`,
      productTitleSnapshot: purchases.productTitleSnapshot,
      purchaseItemSnapshot: purchases.purchaseItemSnapshot,
      source: purchases.source,
      stripeStatus: purchases.stripeStatus,
      succeededAt: purchases.succeededAt,
    })
    .from(purchases)
    .leftJoin(products, eq(purchases.productId, products.id))
    .leftJoin(productOffers, eq(purchases.offerId, productOffers.id));
  const paymentIntentIdByPurchaseId = new Map(
    purchaseRows.map((row) => [row.id, row.paymentIntentId] as const),
  );
  const productExternalIdByPurchaseId = new Map(
    purchaseRows.map((row) => [row.id, row.productExternalId] as const),
  );
  const offerExternalIdByPurchaseId = new Map(
    purchaseRows.map((row) => [row.id, row.offerExternalId] as const),
  );
  const stripeEventRows = await transaction
    .select({
      eventType: stripeEvents.eventType,
      key: stripeEvents.stripeEventId,
      outcome: sql<string>`coalesce(${stripeEvents.outcomeSnapshot}, '')`,
      paymentIntentId: sql<string>`coalesce(${stripeEvents.paymentIntentId}, '')`,
      source: sql<string>`coalesce(${stripeEvents.payload} ->> 'source', 'runtime')`,
      status: sql<string>`coalesce(
        ${stripeEvents.paymentStatusSnapshot},
        ${stripeEvents.processingStatus}
      )`,
    })
    .from(stripeEvents);
  const telegramTokenRows = await transaction
    .select({
      accessExpiresAt: telegramAccessTokens.accessExpiresAt,
      chatId: telegramAccessTokens.chatId,
      expiresAt: telegramAccessTokens.expiresAt,
      key: telegramAccessTokens.tokenId,
      linkKind: telegramAccessTokens.linkKind,
      paymentIntentId: purchases.paymentIntentId,
      purchaseId: telegramAccessTokens.purchaseId,
      status: telegramAccessTokens.status,
      telegramUserId: telegramAccessTokens.telegramUserId,
      usedAt: telegramAccessTokens.usedAt,
    })
    .from(telegramAccessTokens)
    .innerJoin(purchases, eq(telegramAccessTokens.purchaseId, purchases.id));
  const telegramBindingRows = await transaction
    .select({
      accessExpiresAt: telegramUserBindings.accessExpiresAt,
      boundAt: telegramUserBindings.boundAt,
      chatId: telegramUserBindings.chatId,
      purchaseId: telegramUserBindings.purchaseId,
      revokedAt: telegramUserBindings.revokedAt,
      status: telegramUserBindings.status,
      telegramUserId: telegramUserBindings.telegramUserId,
    })
    .from(telegramUserBindings)
    .innerJoin(purchases, eq(telegramUserBindings.purchaseId, purchases.id));
  const entitlementRows = await transaction
    .select({
      accessKey: accessEntitlements.accessKey,
      accessWorkflow: accessEntitlements.accessWorkflow,
      currentTokenId: accessEntitlements.currentTokenId,
      deliveryChannel: accessEntitlements.deliveryChannel,
      expiresAt: accessEntitlements.expiresAt,
      purchaseId: accessEntitlements.purchaseId,
      revokedAt: accessEntitlements.revokedAt,
      startsAt: accessEntitlements.startsAt,
      status: accessEntitlements.status,
      telegramChatId: accessEntitlements.telegramChatId,
      telegramUserId: accessEntitlements.telegramUserId,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(accessEntitlements.purchaseId, purchases.id));
  const invoiceRows = await transaction
    .select({
      amountMinor: invoices.amountMinor,
      currency: invoices.currency,
      issuedAt: invoices.issuedAt,
      key: invoices.invoiceNumber,
      paymentIntentId: purchases.paymentIntentId,
    })
    .from(invoices)
    .innerJoin(purchases, eq(invoices.purchaseId, purchases.id));
  const sideEffectRows = await transaction
    .select({
      kind: purchaseSideEffects.kind,
      paymentIntentId: purchases.paymentIntentId,
      status: purchaseSideEffects.status,
    })
    .from(purchaseSideEffects)
    .leftJoin(purchases, eq(purchaseSideEffects.purchaseId, purchases.id));
  const monthlyRunRows = await transaction
    .select({
      csvSha256: monthlyReportRuns.csvSha256,
      key: monthlyReportRuns.reportKey,
      reportFamily: monthlyReportRuns.reportFamily,
      rowCount: monthlyReportRuns.rowCount,
      status: monthlyReportRuns.deliveryStatus,
    })
    .from(monthlyReportRuns);
  const emailLeadRows = await transaction
    .select({
      campaignKey: emailCampaignLeads.campaignKey,
      emailSendAttempts: emailCampaignLeads.emailSendAttempts,
      key: emailCampaignLeads.leadId,
      locale: emailCampaignLeads.locale,
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
    entitlements: entitlementRows.map((row) => ({
      ...row,
      key: `${paymentIntentIdByPurchaseId.get(row.purchaseId) ?? ""}::${row.accessKey}`,
      offerExternalId: offerExternalIdByPurchaseId.get(row.purchaseId) ?? "",
      productExternalId: productExternalIdByPurchaseId.get(row.purchaseId) ?? "",
    })),
    invoices: invoiceRows,
    monthlyReportRuns: monthlyRunRows,
    onlineGroupCampaigns: onlineGroupCampaignRows,
    purchases: purchaseRows.map((row) => ({
      amountMinor: row.amountMinor,
      catalogProductExternalId: row.catalogProductExternalId,
      checkoutCurrency: row.checkoutCurrency,
      currency: row.currency,
      customerAddressLineSnapshot: row.customerAddressLineSnapshot,
      customerCitySnapshot: row.customerCitySnapshot,
      customerCountrySnapshot: row.customerCountrySnapshot,
      customerEmailSnapshot: row.customerEmailSnapshot,
      customerFullNameSnapshot: row.customerFullNameSnapshot,
      customerPostalCodeSnapshot: row.customerPostalCodeSnapshot,
      customerTelegramUsernameSnapshot: row.customerTelegramUsernameSnapshot,
      firstSeenAt: row.firstSeenAt,
      key: row.paymentIntentId,
      latestEventId: row.latestEventId,
      latestEventType: row.latestEventType,
      lessonLanguage: row.lessonLanguage,
      offerExternalId: row.offerExternalId,
      offerLabelSnapshot: row.offerLabelSnapshot,
      outcome: row.outcome,
      productExternalId: row.productExternalId,
      productTitleSnapshot: row.productTitleSnapshot,
      purchaseItemSnapshot: row.purchaseItemSnapshot,
      source: row.source,
      stripeStatus: row.stripeStatus,
      succeededAt: row.succeededAt,
    })),
    purchaseSideEffects: sideEffectRows.map((row) => ({
      key: `${row.paymentIntentId ?? ""}::${row.kind}`,
      kind: row.kind,
      status: row.status,
    })),
    renewalCampaigns: renewalCampaignRows,
    renewalVerifications: renewalVerificationRows,
    stripeEvents: stripeEventRows,
    telegramAccessTokens: telegramTokenRows.map((row) => ({
      ...row,
      offerExternalId: offerExternalIdByPurchaseId.get(row.purchaseId) ?? "",
      productExternalId: productExternalIdByPurchaseId.get(row.purchaseId) ?? "",
    })),
    telegramUserBindings: telegramBindingRows.map((row) => ({
      accessExpiresAt: row.accessExpiresAt,
      boundAt: row.boundAt,
      key: `${paymentIntentIdByPurchaseId.get(row.purchaseId) ?? ""}::${
        row.chatId ?? ""
      }`,
      offerExternalId: offerExternalIdByPurchaseId.get(row.purchaseId) ?? "",
      productExternalId: productExternalIdByPurchaseId.get(row.purchaseId) ?? "",
      revokedAt: row.revokedAt,
      status: row.status,
      telegramUserId: row.telegramUserId,
    })),
  };
};

const loadDatabaseSnapshot = async () => {
  const databaseUrl = getRequiredDatabaseUrlFromEnv({
    kind: "unpooled",
    purpose: "read-only reconciliation baseline",
  });

  if (getDatabaseTransport() === "http") {
    const database = drizzleNeonHttp(neon(databaseUrl));

    return loadDatabaseSnapshotInTransaction(database as unknown as DatabaseTransaction, {
      setReadOnlyTransaction: false,
    });
  }

  const client = postgres(databaseUrl, {
    connect_timeout: 15,
    max: 1,
    prepare: false,
  });
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

export const runReconciliationBaseline = async ({
  strict = process.argv.includes("--strict"),
}: {
  strict?: boolean;
} = {}) => {
  const captureStartedAt = new Date().toISOString();
  const databaseSelection = getDatabaseEnvSelection("unpooled");
  const [database, sheets] = await Promise.all([
    loadDatabaseSnapshot(),
    loadSheetsSnapshot(),
  ]);
  const captureCompletedAt = new Date().toISOString();
  const report = buildReconciliationBaseline({
    database,
    options: {
      captureCompletedAt,
      captureStartedAt,
      capturedAt: captureCompletedAt,
      databaseEnvironment: databaseSelection.deploymentEnvironment,
      databaseVariableName: databaseSelection.variableName,
      sampleLimit: getSampleLimit(),
    },
    sheets,
  });
  const serializedReport = JSON.stringify(report, null, 2);

  await writeReport(serializedReport);

  if (strict && report.status !== "ok") {
    process.exitCode = 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runReconciliationBaseline().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown baseline error";
    console.error(`Failed to capture reconciliation baseline: ${message}`);
    process.exitCode = 1;
  });
}
