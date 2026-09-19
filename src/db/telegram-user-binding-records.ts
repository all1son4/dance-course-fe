import { and, eq, isNull, or, sql } from "drizzle-orm";

import type { TelegramUserBindingRecord } from "@/lib/telegram/access-records";

import { getDatabase } from "./client";
import {
  getEntitlementByPurchaseId,
  getPurchaseByIds,
  getPurchaseByPaymentIntentId,
} from "./purchase-lookups";
import {
  normalizeEmail,
  nullIfEmpty,
  parseDate,
  parseRequiredDate,
  toIso,
  trim,
} from "./record-values";
import { purchases, telegramUserBindings } from "./schema";

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

const mapTelegramUserBindingRecordFromDatabase = (
  row: typeof telegramUserBindings.$inferSelect,
  purchaseById: Map<string, typeof purchases.$inferSelect>,
): TelegramUserBindingRecord => {
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
    return [] as TelegramUserBindingRecord[];
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
  record: TelegramUserBindingRecord,
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
