import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import type {
  EmailCampaignLeadSheetRecord,
  MonthlySalesReportRunSheetRecord,
  StripeEventSheetRecord,
  SuccessfulCustomersSheetRecord,
  TelegramAccessTokenSheetRecord,
  TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

import { getDatabase } from "./client";
import {
  accessEntitlements,
  emailCampaignLeads,
  monthlyReportRuns,
  purchases,
  purchaseSideEffects,
  stripeEvents,
  telegramAccessTokens,
  telegramUserBindings,
} from "./schema";

const trim = (value: string | null | undefined) => value?.trim() ?? "";
const nullIfEmpty = (value: string | null | undefined) => trim(value) || null;
const normalizeEmail = (value: string | null | undefined) => trim(value).toLowerCase();

const parseInteger = (value: string | null | undefined, fallback = 0) => {
  const parsedValue = Number.parseInt(trim(value), 10);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const parseDate = (value: string | null | undefined) => {
  const timestamp = Date.parse(trim(value));

  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

const parseRequiredDate = (
  value: string | null | undefined,
  fallback: Date = new Date(),
) => parseDate(value) ?? fallback;

const toIso = (date: Date | null | undefined) => date?.toISOString() ?? "";

const normalizeStripeProcessingStatus = (
  value: string,
): "processed" | "skipped" | "failed" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "processed" ||
    normalizedValue === "skipped" ||
    normalizedValue === "failed"
  ) {
    return normalizedValue;
  }

  return "processed";
};

const normalizeTelegramTokenStatus = (
  value: string,
): "issued" | "used" | "expired" | "revoked" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "issued" ||
    normalizedValue === "used" ||
    normalizedValue === "expired" ||
    normalizedValue === "revoked"
  ) {
    return normalizedValue;
  }

  return "issued";
};

const normalizeTelegramBindingStatus = (value: string): "active" | "left" | "revoked" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "active" ||
    normalizedValue === "left" ||
    normalizedValue === "revoked"
  ) {
    return normalizedValue;
  }

  return "active";
};

const normalizeTokenLinkKind = (value: string): "channel_invite" | "start_token" => {
  const normalizedValue = trim(value);

  if (normalizedValue === "channel_invite" || normalizedValue === "start_token") {
    return normalizedValue;
  }

  return "channel_invite";
};

const normalizeDeliveryStatus = (value: string): "sent" | "skipped" | "failed" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "sent" ||
    normalizedValue === "skipped" ||
    normalizedValue === "failed"
  ) {
    return normalizedValue;
  }

  return "failed";
};

const normalizeEmailSendStatus = (
  value: string,
): "blocked" | "excluded" | "failed" | "pending" | "sent" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "blocked" ||
    normalizedValue === "excluded" ||
    normalizedValue === "pending" ||
    normalizedValue === "sent" ||
    normalizedValue === "failed"
  ) {
    return normalizedValue;
  }

  return "pending";
};

const getPurchaseByPaymentIntentId = async (paymentIntentId: string) => {
  const normalizedPaymentIntentId = paymentIntentId.trim();

  if (!normalizedPaymentIntentId) {
    return null;
  }

  const [purchase] = await getDatabase()
    .select()
    .from(purchases)
    .where(eq(purchases.paymentIntentId, normalizedPaymentIntentId))
    .limit(1);

  return purchase ?? null;
};

const getPurchaseByIds = async (purchaseIds: string[]) => {
  const uniquePurchaseIds = Array.from(new Set(purchaseIds.filter(Boolean)));

  if (uniquePurchaseIds.length === 0) {
    return new Map<string, typeof purchases.$inferSelect>();
  }

  const rows = await getDatabase()
    .select()
    .from(purchases)
    .where(inArray(purchases.id, uniquePurchaseIds));

  return new Map(rows.map((row) => [row.id, row] as const));
};

const getEntitlementByPurchaseId = async (purchaseId: string, chatId?: string) => {
  const entitlements = await getDatabase()
    .select({
      accessKey: accessEntitlements.accessKey,
      id: accessEntitlements.id,
      telegramChatId: accessEntitlements.telegramChatId,
    })
    .from(accessEntitlements)
    .where(eq(accessEntitlements.purchaseId, purchaseId));
  const normalizedChatId = chatId?.trim() ?? "";

  return (
    entitlements.find(
      (entitlement) =>
        normalizedChatId && entitlement.telegramChatId === normalizedChatId,
    ) ??
    entitlements.find((entitlement) => entitlement.accessKey === "primary") ??
    entitlements[0] ??
    null
  );
};

const mapStripeEventRecordFromDatabase = (
  row: typeof stripeEvents.$inferSelect,
): StripeEventSheetRecord => ({
  event_id: row.stripeEventId,
  event_type: row.eventType,
  outcome: row.outcomeSnapshot ?? "",
  payment_intent_id: row.paymentIntentId ?? "",
  processed_at: toIso(row.processedAt),
  status: row.paymentStatusSnapshot ?? row.processingStatus,
});

export const findStripeEventRecordByEventIdFromDatabase = async (eventId: string) => {
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    return null;
  }

  const [row] = await getDatabase()
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, normalizedEventId))
    .limit(1);

  return row ? mapStripeEventRecordFromDatabase(row) : null;
};

export const listStripeEventRecordsFromDatabase = async () => {
  const rows = await getDatabase().select().from(stripeEvents);

  return rows
    .map(mapStripeEventRecordFromDatabase)
    .sort((left, right) => left.event_id.localeCompare(right.event_id));
};

export const upsertStripeEventRecordToDatabase = async (
  record: StripeEventSheetRecord,
) => {
  const db = getDatabase();
  const paymentIntentId = nullIfEmpty(record.payment_intent_id);
  const purchase = paymentIntentId
    ? await getPurchaseByPaymentIntentId(paymentIntentId)
    : null;

  await db
    .insert(stripeEvents)
    .values({
      eventType: trim(record.event_type) || "unknown",
      outcomeSnapshot: nullIfEmpty(record.outcome),
      paymentIntentId,
      paymentStatusSnapshot: nullIfEmpty(record.status),
      payload: {},
      processedAt: parseDate(record.processed_at),
      processingStatus: normalizeStripeProcessingStatus(record.status),
      purchaseId: purchase?.id ?? null,
      stripeEventId: trim(record.event_id),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      set: {
        eventType: trim(record.event_type) || "unknown",
        outcomeSnapshot: nullIfEmpty(record.outcome),
        paymentIntentId,
        paymentStatusSnapshot: nullIfEmpty(record.status),
        processedAt: parseDate(record.processed_at),
        processingStatus: normalizeStripeProcessingStatus(record.status),
        purchaseId: purchase?.id ?? null,
        updatedAt: new Date(),
      },
      target: stripeEvents.stripeEventId,
    });

  return (await findStripeEventRecordByEventIdFromDatabase(record.event_id)) ?? record;
};

export const recordSuccessfulCustomerExportToDatabase = async (
  record: SuccessfulCustomersSheetRecord,
) => {
  const purchase = await getPurchaseByPaymentIntentId(record.payment_intent_id);

  if (!purchase) {
    return record;
  }

  const now = new Date();

  await getDatabase()
    .insert(purchaseSideEffects)
    .values({
      kind: "successful_customer_export",
      provider: null,
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

  return record;
};

const mapTelegramAccessTokenRecordFromDatabase = (
  row: typeof telegramAccessTokens.$inferSelect,
  purchaseById: Map<string, typeof purchases.$inferSelect>,
): TelegramAccessTokenSheetRecord => {
  const purchase = purchaseById.get(row.purchaseId);

  return {
    access_expires_at: toIso(row.accessExpiresAt),
    chat_id: row.chatId ?? "",
    created_at: toIso(row.createdAt),
    customer_email: row.customerEmailSnapshot ?? purchase?.customerEmailSnapshot ?? "",
    expires_at: toIso(row.expiresAt),
    last_error: row.lastError ?? "",
    link_kind: row.linkKind,
    offer_id: purchase?.offerExternalId ?? "",
    payment_intent_id: purchase?.paymentIntentId ?? "",
    product_id: purchase?.productExternalId ?? "",
    status: row.status,
    telegram_user_id: row.telegramUserId ?? "",
    telegram_username: row.telegramUsername ?? "",
    token_hash: row.tokenHash,
    token_id: row.tokenId,
    token_value: row.tokenValue ?? "",
    used_at: toIso(row.usedAt),
  };
};

const hydrateTelegramAccessTokenRecords = async (
  rows: Array<typeof telegramAccessTokens.$inferSelect>,
) => {
  const purchaseById = await getPurchaseByIds(rows.map((row) => row.purchaseId));

  return rows.map((row) => mapTelegramAccessTokenRecordFromDatabase(row, purchaseById));
};

export const findTelegramAccessTokenRecordByTokenIdFromDatabase = async (
  tokenId: string,
) => {
  const normalizedTokenId = tokenId.trim();

  if (!normalizedTokenId) {
    return null;
  }

  const [row] = await getDatabase()
    .select()
    .from(telegramAccessTokens)
    .where(eq(telegramAccessTokens.tokenId, normalizedTokenId))
    .limit(1);
  const [record] = row ? await hydrateTelegramAccessTokenRecords([row]) : [];

  return record ?? null;
};

export const findTelegramAccessTokenRecordByTokenHashFromDatabase = async (
  tokenHash: string,
) => {
  const normalizedTokenHash = tokenHash.trim();

  if (!normalizedTokenHash) {
    return null;
  }

  const [row] = await getDatabase()
    .select()
    .from(telegramAccessTokens)
    .where(eq(telegramAccessTokens.tokenHash, normalizedTokenHash))
    .limit(1);
  const [record] = row ? await hydrateTelegramAccessTokenRecords([row]) : [];

  return record ?? null;
};

export const findTelegramAccessTokenRecordByTokenValueFromDatabase = async (
  tokenValue: string,
) => {
  const normalizedTokenValue = tokenValue.trim();

  if (!normalizedTokenValue) {
    return null;
  }

  const [row] = await getDatabase()
    .select()
    .from(telegramAccessTokens)
    .where(eq(telegramAccessTokens.tokenValue, normalizedTokenValue))
    .limit(1);
  const [record] = row ? await hydrateTelegramAccessTokenRecords([row]) : [];

  return record ?? null;
};

export const listTelegramAccessTokenRecordsFromDatabase = async () => {
  const rows = await getDatabase().select().from(telegramAccessTokens);
  const records = await hydrateTelegramAccessTokenRecords(rows);

  return records.sort((left, right) => {
    const createdDiff = Date.parse(left.created_at) - Date.parse(right.created_at);

    return createdDiff || left.token_id.localeCompare(right.token_id);
  });
};

export const findLatestTelegramAccessTokenRecordByPaymentIntentIdFromDatabase = async (
  paymentIntentId: string,
) => {
  const purchase = await getPurchaseByPaymentIntentId(paymentIntentId);

  if (!purchase) {
    return null;
  }

  const rows = await getDatabase()
    .select()
    .from(telegramAccessTokens)
    .where(eq(telegramAccessTokens.purchaseId, purchase.id))
    .orderBy(desc(telegramAccessTokens.createdAt), desc(telegramAccessTokens.id))
    .limit(1);
  const records = await hydrateTelegramAccessTokenRecords(rows);

  return records[0] ?? null;
};

export type TelegramAccessTokenClaimResult =
  | {
      record: TelegramAccessTokenSheetRecord;
      status:
        | "already_claimed_by_user"
        | "claimed"
        | "claimed_by_another_user"
        | "expired"
        | "unavailable";
    }
  | {
      record: null;
      status: "not_found";
    };

export const claimTelegramAccessTokenRecordInDatabase = async ({
  accessExpiresAt,
  chatId,
  claimedAt,
  telegramUserId,
  telegramUsername,
  tokenHash,
}: {
  accessExpiresAt?: string;
  chatId?: string;
  claimedAt: string;
  telegramUserId: string;
  telegramUsername: string;
  tokenHash: string;
}): Promise<TelegramAccessTokenClaimResult> => {
  const normalizedTokenHash = tokenHash.trim();
  const normalizedUserId = telegramUserId.trim();
  const normalizedUsername = telegramUsername.trim();
  const claimTime = parseRequiredDate(claimedAt);

  if (!normalizedTokenHash || !normalizedUserId) {
    throw new Error("Telegram token claim requires a token hash and user ID.");
  }

  const claimResult = await getDatabase().transaction(async (transaction) => {
    const [claimedToken] = await transaction
      .update(telegramAccessTokens)
      .set({
        ...(accessExpiresAt === undefined
          ? {}
          : { accessExpiresAt: parseDate(accessExpiresAt) }),
        ...(chatId === undefined ? {} : { chatId: nullIfEmpty(chatId) }),
        lastError: null,
        status: "used",
        telegramUserId: normalizedUserId,
        telegramUsername: normalizedUsername || null,
        updatedAt: claimTime,
        usedAt: claimTime,
      })
      .where(
        and(
          eq(telegramAccessTokens.tokenHash, normalizedTokenHash),
          eq(telegramAccessTokens.status, "issued"),
          gt(telegramAccessTokens.expiresAt, claimTime),
          or(
            isNull(telegramAccessTokens.telegramUserId),
            eq(telegramAccessTokens.telegramUserId, ""),
            eq(telegramAccessTokens.telegramUserId, normalizedUserId),
          ),
        ),
      )
      .returning();

    if (claimedToken) {
      return {
        row: claimedToken,
        status: "claimed" as const,
      };
    }

    const [currentToken] = await transaction
      .select()
      .from(telegramAccessTokens)
      .where(eq(telegramAccessTokens.tokenHash, normalizedTokenHash))
      .limit(1);

    if (!currentToken) {
      return {
        row: null,
        status: "not_found" as const,
      };
    }

    const currentUserId = currentToken.telegramUserId?.trim() ?? "";

    if (currentToken.status === "used") {
      return {
        row: currentToken,
        status:
          currentUserId === normalizedUserId
            ? ("already_claimed_by_user" as const)
            : ("claimed_by_another_user" as const),
      };
    }

    if (
      currentToken.status === "issued" &&
      currentUserId &&
      currentUserId !== normalizedUserId
    ) {
      return {
        row: currentToken,
        status: "claimed_by_another_user" as const,
      };
    }

    if (
      currentToken.status === "issued" &&
      currentToken.expiresAt.getTime() <= claimTime.getTime()
    ) {
      const [expiredToken] = await transaction
        .update(telegramAccessTokens)
        .set({
          status: "expired",
          updatedAt: claimTime,
        })
        .where(
          and(
            eq(telegramAccessTokens.id, currentToken.id),
            eq(telegramAccessTokens.status, "issued"),
            lte(telegramAccessTokens.expiresAt, claimTime),
          ),
        )
        .returning();

      return {
        row: expiredToken ?? currentToken,
        status: "expired" as const,
      };
    }

    return {
      row: currentToken,
      status: "unavailable" as const,
    };
  });

  if (!claimResult.row) {
    return {
      record: null,
      status: claimResult.status,
    };
  }

  const [record] = await hydrateTelegramAccessTokenRecords([claimResult.row]);

  if (!record) {
    return {
      record: null,
      status: "not_found",
    };
  }

  return {
    record,
    status: claimResult.status,
  };
};

export const upsertTelegramAccessTokenRecordToDatabase = async (
  record: TelegramAccessTokenSheetRecord,
) => {
  const purchase = await getPurchaseByPaymentIntentId(record.payment_intent_id);

  if (!purchase) {
    throw new Error(
      `Cannot upsert Telegram access token without purchase ${record.payment_intent_id}.`,
    );
  }

  const entitlement = await getEntitlementByPurchaseId(purchase.id, record.chat_id);
  const now = new Date();
  const createdAt = parseRequiredDate(record.created_at, now);
  const values = {
    accessExpiresAt: parseDate(record.access_expires_at),
    chatId: nullIfEmpty(record.chat_id),
    customerEmailSnapshot:
      normalizeEmail(record.customer_email) ||
      nullIfEmpty(purchase.customerEmailSnapshot),
    entitlementId: entitlement?.id ?? null,
    expiresAt: parseRequiredDate(record.expires_at, createdAt),
    lastError: nullIfEmpty(record.last_error),
    linkKind: normalizeTokenLinkKind(record.link_kind),
    offerId: purchase.offerId,
    productId: purchase.productId,
    purchaseId: purchase.id,
    status: normalizeTelegramTokenStatus(record.status),
    telegramUserId: nullIfEmpty(record.telegram_user_id),
    telegramUsername: nullIfEmpty(record.telegram_username),
    tokenHash: trim(record.token_hash),
    tokenValue: nullIfEmpty(record.token_value),
    updatedAt: now,
    usedAt: parseDate(record.used_at),
  };
  const ownerCanBeUpdated = or(
    isNull(telegramAccessTokens.telegramUserId),
    eq(telegramAccessTokens.telegramUserId, ""),
    eq(telegramAccessTokens.telegramUserId, values.telegramUserId ?? ""),
  );

  await getDatabase()
    .insert(telegramAccessTokens)
    .values({
      ...values,
      createdAt,
      tokenId: trim(record.token_id),
    })
    .onConflictDoUpdate({
      set: values,
      setWhere:
        values.status === "issued"
          ? and(ownerCanBeUpdated, ne(telegramAccessTokens.status, "used"))
          : ownerCanBeUpdated,
      target: telegramAccessTokens.tokenId,
    });

  return (
    (await findTelegramAccessTokenRecordByTokenIdFromDatabase(record.token_id)) ?? record
  );
};

const mapTelegramUserBindingRecordFromDatabase = (
  row: typeof telegramUserBindings.$inferSelect,
  purchaseById: Map<string, typeof purchases.$inferSelect>,
): TelegramUserBindingSheetRecord => {
  const purchase = purchaseById.get(row.purchaseId);

  return {
    access_expires_at: toIso(row.accessExpiresAt),
    bound_at: toIso(row.boundAt),
    chat_id: row.chatId ?? "",
    customer_email: row.customerEmailSnapshot ?? purchase?.customerEmailSnapshot ?? "",
    invite_link: row.inviteLink ?? "",
    last_seen_at: toIso(row.lastSeenAt),
    offer_id: purchase?.offerExternalId ?? "",
    payment_intent_id: purchase?.paymentIntentId ?? "",
    product_id: purchase?.productExternalId ?? "",
    revoked_at: toIso(row.revokedAt),
    revoked_reason: row.revokedReason ?? "",
    status: row.status,
    telegram_user_id: row.telegramUserId,
    telegram_username: row.telegramUsername ?? "",
  };
};

const hydrateTelegramUserBindingRecords = async (
  rows: Array<typeof telegramUserBindings.$inferSelect>,
) => {
  const purchaseById = await getPurchaseByIds(rows.map((row) => row.purchaseId));

  return rows.map((row) => mapTelegramUserBindingRecordFromDatabase(row, purchaseById));
};

export const listTelegramUserBindingRecordsFromDatabase = async () => {
  const rows = await getDatabase().select().from(telegramUserBindings);
  const records = await hydrateTelegramUserBindingRecords(rows);

  return records.sort((left, right) => {
    const boundDiff = Date.parse(left.bound_at) - Date.parse(right.bound_at);

    return boundDiff || left.payment_intent_id.localeCompare(right.payment_intent_id);
  });
};

export const findTelegramUserBindingByPaymentIntentIdFromDatabase = async (
  paymentIntentId: string,
  chatId?: string,
) => {
  const purchase = await getPurchaseByPaymentIntentId(paymentIntentId);

  if (!purchase) {
    return null;
  }

  const rows = await getDatabase()
    .select()
    .from(telegramUserBindings)
    .where(eq(telegramUserBindings.purchaseId, purchase.id));
  const normalizedChatId = chatId?.trim() ?? "";
  const row =
    rows.find((binding) => normalizedChatId && binding.chatId === normalizedChatId) ??
    rows[0];
  const [record] = row ? await hydrateTelegramUserBindingRecords([row]) : [];

  return record ?? null;
};

export const findTelegramUserBindingsByTelegramUserIdFromDatabase = async (
  telegramUserId: string,
) => {
  const rows = await getDatabase()
    .select()
    .from(telegramUserBindings)
    .where(eq(telegramUserBindings.telegramUserId, telegramUserId.trim()));

  return hydrateTelegramUserBindingRecords(rows);
};

export const findTelegramUserBindingsByCustomerEmailFromDatabase = async (
  customerEmail: string,
) => {
  const normalizedEmail = normalizeEmail(customerEmail);

  if (!normalizedEmail) {
    return [] as TelegramUserBindingSheetRecord[];
  }

  const rows = await getDatabase()
    .select()
    .from(telegramUserBindings)
    .where(eq(telegramUserBindings.customerEmailSnapshot, normalizedEmail));

  return hydrateTelegramUserBindingRecords(rows);
};

export const findTelegramUserBindingsByTelegramUserIdAndChatIdFromDatabase = async ({
  chatId,
  telegramUserId,
}: {
  chatId: string;
  telegramUserId: string;
}) => {
  const normalizedChatId = chatId.trim();
  const rows = await getDatabase()
    .select()
    .from(telegramUserBindings)
    .where(
      and(
        eq(telegramUserBindings.telegramUserId, telegramUserId.trim()),
        normalizedChatId
          ? eq(telegramUserBindings.chatId, normalizedChatId)
          : or(isNull(telegramUserBindings.chatId), eq(telegramUserBindings.chatId, "")),
      ),
    );

  return hydrateTelegramUserBindingRecords(rows);
};

export const findActiveTelegramUserBindingsFromDatabase = async () => {
  const rows = await getDatabase()
    .select()
    .from(telegramUserBindings)
    .where(eq(telegramUserBindings.status, "active"));

  return hydrateTelegramUserBindingRecords(rows);
};

export const upsertTelegramUserBindingRecordToDatabase = async (
  record: TelegramUserBindingSheetRecord,
) => {
  const purchase = await getPurchaseByPaymentIntentId(record.payment_intent_id);

  if (!purchase) {
    throw new Error(
      `Cannot upsert Telegram user binding without purchase ${record.payment_intent_id}.`,
    );
  }

  const entitlement = await getEntitlementByPurchaseId(purchase.id, record.chat_id);
  const now = new Date();
  const boundAt = parseRequiredDate(record.bound_at, now);
  const values = {
    accessExpiresAt: parseDate(record.access_expires_at),
    chatId: nullIfEmpty(record.chat_id),
    customerEmailSnapshot:
      normalizeEmail(record.customer_email) ||
      nullIfEmpty(purchase.customerEmailSnapshot),
    entitlementId: entitlement?.id ?? null,
    inviteLink: nullIfEmpty(record.invite_link),
    lastSeenAt: parseRequiredDate(record.last_seen_at, boundAt),
    offerId: purchase.offerId,
    productId: purchase.productId,
    purchaseId: purchase.id,
    revokedAt: parseDate(record.revoked_at),
    revokedReason: nullIfEmpty(record.revoked_reason),
    status: normalizeTelegramBindingStatus(record.status),
    telegramUserId: trim(record.telegram_user_id),
    telegramUsername: nullIfEmpty(record.telegram_username),
    updatedAt: now,
  };
  const normalizedChatId = record.chat_id.trim();
  await getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${`telegram-binding:${purchase.id}:${normalizedChatId || "direct"}`},
          0
        )
      )`,
    );

    const [existingBinding] = await transaction
      .select({ id: telegramUserBindings.id })
      .from(telegramUserBindings)
      .where(
        and(
          eq(telegramUserBindings.purchaseId, purchase.id),
          normalizedChatId
            ? eq(telegramUserBindings.chatId, normalizedChatId)
            : isNull(telegramUserBindings.chatId),
        ),
      )
      .limit(1);

    if (existingBinding) {
      await transaction
        .update(telegramUserBindings)
        .set(values)
        .where(eq(telegramUserBindings.id, existingBinding.id));
      return;
    }

    await transaction.insert(telegramUserBindings).values({
      ...values,
      boundAt,
    });
  });

  return (
    (await findTelegramUserBindingByPaymentIntentIdFromDatabase(
      record.payment_intent_id,
      record.chat_id,
    )) ?? record
  );
};

const mapMonthlySalesReportRunRecordFromDatabase = (
  row: typeof monthlyReportRuns.$inferSelect,
): MonthlySalesReportRunSheetRecord => ({
  csv_sha256: row.csvSha256 ?? "",
  delivered_at_utc: toIso(row.deliveredAtUtc),
  delivered_to: row.deliveredTo ?? "",
  delivery_status: row.deliveryStatus,
  generated_at_utc: toIso(row.generatedAtUtc),
  period_end_utc: toIso(row.periodEndUtc),
  period_start_utc: toIso(row.periodStartUtc),
  report_family: row.reportFamily,
  report_key: row.reportKey,
  row_count: String(row.rowCount),
});

export const findMonthlySalesReportRunByKeyFromDatabase = async (reportKey: string) => {
  const normalizedReportKey = reportKey.trim();

  if (!normalizedReportKey) {
    return null;
  }

  const [row] = await getDatabase()
    .select()
    .from(monthlyReportRuns)
    .where(eq(monthlyReportRuns.reportKey, normalizedReportKey))
    .limit(1);

  return row ? mapMonthlySalesReportRunRecordFromDatabase(row) : null;
};

export const listMonthlySalesReportRunRecordsFromDatabase = async () => {
  const rows = await getDatabase().select().from(monthlyReportRuns);

  return rows
    .map(mapMonthlySalesReportRunRecordFromDatabase)
    .sort((left, right) => left.report_key.localeCompare(right.report_key));
};

export const upsertMonthlySalesReportRunToDatabase = async (
  record: MonthlySalesReportRunSheetRecord,
) => {
  const now = new Date();

  await getDatabase()
    .insert(monthlyReportRuns)
    .values({
      csvSha256: nullIfEmpty(record.csv_sha256),
      deliveredAtUtc: parseDate(record.delivered_at_utc),
      deliveredTo: nullIfEmpty(record.delivered_to),
      deliveryStatus: normalizeDeliveryStatus(record.delivery_status),
      generatedAtUtc: parseRequiredDate(record.generated_at_utc, now),
      periodEndUtc: parseRequiredDate(record.period_end_utc, now),
      periodStartUtc: parseRequiredDate(record.period_start_utc, now),
      reportFamily: trim(record.report_family) || "unknown",
      reportKey: trim(record.report_key),
      rowCount: parseInteger(record.row_count),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        csvSha256: nullIfEmpty(record.csv_sha256),
        deliveredAtUtc: parseDate(record.delivered_at_utc),
        deliveredTo: nullIfEmpty(record.delivered_to),
        deliveryStatus: normalizeDeliveryStatus(record.delivery_status),
        generatedAtUtc: parseRequiredDate(record.generated_at_utc, now),
        periodEndUtc: parseRequiredDate(record.period_end_utc, now),
        periodStartUtc: parseRequiredDate(record.period_start_utc, now),
        reportFamily: trim(record.report_family) || "unknown",
        rowCount: parseInteger(record.row_count),
        updatedAt: now,
      },
      target: monthlyReportRuns.reportKey,
    });

  return (await findMonthlySalesReportRunByKeyFromDatabase(record.report_key)) ?? record;
};

const mapEmailCampaignLeadRecordFromDatabase = (
  row: typeof emailCampaignLeads.$inferSelect,
): EmailCampaignLeadSheetRecord => ({
  campaign_key: row.campaignKey,
  created_at: toIso(row.createdAt),
  email: row.email,
  email_send_attempts: String(row.emailSendAttempts),
  email_send_status: row.emailSendStatus,
  email_sent_at: toIso(row.emailSentAt),
  full_name: row.fullName,
  last_email_error: row.lastEmailError,
  lead_id: row.leadId,
  locale: row.locale,
  social_contact: row.socialContact,
});

export const listEmailCampaignLeadRecordsFromDatabase = async () => {
  const rows = await getDatabase().select().from(emailCampaignLeads);

  return rows
    .map(mapEmailCampaignLeadRecordFromDatabase)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
};

export const findEmailCampaignLeadByCampaignAndEmailFromDatabase = async ({
  campaignKey,
  email,
}: {
  campaignKey: string;
  email: string;
}) => {
  const normalizedCampaignKey = campaignKey.trim();
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedCampaignKey || !normalizedEmail) {
    return null;
  }

  const [row] = await getDatabase()
    .select()
    .from(emailCampaignLeads)
    .where(
      and(
        eq(emailCampaignLeads.campaignKey, normalizedCampaignKey),
        eq(emailCampaignLeads.normalizedEmail, normalizedEmail),
      ),
    )
    .limit(1);

  return row ? mapEmailCampaignLeadRecordFromDatabase(row) : null;
};

export const upsertEmailCampaignLeadRecordToDatabase = async (
  record: EmailCampaignLeadSheetRecord,
) => {
  const now = new Date();
  const normalizedEmail = normalizeEmail(record.email);

  await getDatabase()
    .insert(emailCampaignLeads)
    .values({
      campaignKey: trim(record.campaign_key),
      createdAt: parseRequiredDate(record.created_at, now),
      email: normalizedEmail || trim(record.email),
      emailSendAttempts: parseInteger(record.email_send_attempts),
      emailSendStatus: normalizeEmailSendStatus(record.email_send_status),
      emailSentAt: parseDate(record.email_sent_at),
      fullName: trim(record.full_name),
      lastEmailError: trim(record.last_email_error),
      leadId: trim(record.lead_id),
      locale: trim(record.locale),
      normalizedEmail,
      socialContact: trim(record.social_contact),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        campaignKey: trim(record.campaign_key),
        email: normalizedEmail || trim(record.email),
        emailSendAttempts: parseInteger(record.email_send_attempts),
        emailSendStatus: normalizeEmailSendStatus(record.email_send_status),
        emailSentAt: parseDate(record.email_sent_at),
        fullName: trim(record.full_name),
        lastEmailError: trim(record.last_email_error),
        locale: trim(record.locale),
        normalizedEmail,
        socialContact: trim(record.social_contact),
        updatedAt: now,
      },
      target: emailCampaignLeads.leadId,
    });

  return (
    (await findEmailCampaignLeadByCampaignAndEmailFromDatabase({
      campaignKey: record.campaign_key,
      email: record.email,
    })) ?? record
  );
};
