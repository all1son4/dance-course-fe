import { and, desc, eq, gt, isNotNull, isNull, lte, ne, or } from "drizzle-orm";

import { logSafeError } from "@/lib/safe-error-log";
import type { TelegramAccessTokenRecord } from "@/lib/telegram/access-records";

import { getDatabase } from "./client";
import { getDatabaseErrorCode } from "./database-read-retry";
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
import { purchases, telegramAccessTokens } from "./schema";

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

const normalizeTokenLinkKind = (value: string): "channel_invite" | "start_token" => {
  const normalizedValue = trim(value);

  if (normalizedValue === "channel_invite" || normalizedValue === "start_token") {
    return normalizedValue;
  }

  return "channel_invite";
};

const mapTelegramAccessTokenRecordFromDatabase = (
  row: typeof telegramAccessTokens.$inferSelect,
  purchaseById: Map<string, typeof purchases.$inferSelect>,
): TelegramAccessTokenRecord => {
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

const findTelegramAccessTokenRecordByTokenIdFromDatabase = async (tokenId: string) => {
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
      record: TelegramAccessTokenRecord;
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
        tokenValue: null,
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
          tokenValue: null,
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
  record: TelegramAccessTokenRecord,
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
  const status = normalizeTelegramTokenStatus(record.status);
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
    status,
    telegramUserId: nullIfEmpty(record.telegram_user_id),
    telegramUsername: nullIfEmpty(record.telegram_username),
    tokenHash: trim(record.token_hash),
    // HARD-03: only an issued link is kept; Telegram links are single-use and
    // time-limited, so a used, expired or revoked one is never shown again.
    tokenValue: status === "issued" ? nullIfEmpty(record.token_value) : null,
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

const isSpentTokenValue = (now: Date) =>
  and(
    isNotNull(telegramAccessTokens.tokenValue),
    or(
      ne(telegramAccessTokens.status, "issued"),
      lte(telegramAccessTokens.expiresAt, now),
    ),
  );

/**
 * HARD-03: erases the clear link of every token that can no longer be used: any
 * status other than `issued`, or an issued token past its expiry. Covers writers
 * that change the status directly, and old rows. Run daily; repeating it is a no-op.
 *
 * One row at a time: a legacy row that fails a check constraint (SQLSTATE class 23)
 * keeps its link and is counted in the event log, while all the others are erased.
 */
export const eraseSpentTelegramAccessTokenValues = async (now = new Date()) => {
  const database = getDatabase();
  const spentTokens = await database
    .select({ id: telegramAccessTokens.id, purchaseId: telegramAccessTokens.purchaseId })
    .from(telegramAccessTokens)
    .where(isSpentTokenValue(now));
  let erasedCount = 0;
  let notErasedCount = 0;

  for (const token of spentTokens) {
    try {
      const erased = await database
        .update(telegramAccessTokens)
        .set({ tokenValue: null })
        .where(and(eq(telegramAccessTokens.id, token.id), isSpentTokenValue(now)))
        .returning({ id: telegramAccessTokens.id });

      erasedCount += erased.length;
    } catch (error) {
      if (!getDatabaseErrorCode(error)?.startsWith("23")) throw error;

      notErasedCount += 1;
      logSafeError("Daily maintenance: an invite link could not be erased", error, {
        reference: token.purchaseId,
        severity: "warning",
      });
    }
  }

  return { erasedCount, notErasedCount };
};
