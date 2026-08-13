import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { AdminInviteLinkHistorySourceRecord } from "@/lib/google-sheets-schema";

import { getDatabase } from "./client";
import {
  accessEntitlements,
  purchases,
  purchaseSideEffects,
  telegramAccessTokens,
} from "./schema";

const toIso = (value: Date | null) => value?.toISOString() ?? "";

const getQueryLimit = (limit: number | undefined) => {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return null;
  }

  return Math.trunc(limit);
};

export const listAdminInviteLinkHistoryRecordsFromDatabase = async ({
  accessWorkflow,
  limit,
}: {
  accessWorkflow: string;
  limit?: number;
}): Promise<AdminInviteLinkHistorySourceRecord[]> => {
  const normalizedAccessWorkflow = accessWorkflow.trim().toLowerCase();

  if (!normalizedAccessWorkflow) {
    return [];
  }

  const database = getDatabase();
  const createdAt = sql<Date>`COALESCE(
    ${purchaseSideEffects.sentAt},
    ${purchases.firstSeenAt},
    ${purchases.updatedAt},
    ${telegramAccessTokens.createdAt}
  )`;
  const tokenUsedAt = sql<Date | null>`COALESCE(
    ${accessEntitlements.startsAt},
    ${telegramAccessTokens.usedAt}
  )`;
  const baseQuery = database
    .select({
      accessUrl: telegramAccessTokens.tokenValue,
      adminLabel: purchases.customerTelegramUsernameSnapshot,
      createdAt,
      lessonLanguage: purchases.lessonLanguage,
      offerLabel: purchases.offerLabelSnapshot,
      productTitle: purchases.productTitleSnapshot,
      purchaseItem: purchases.purchaseItemSnapshot,
      tokenExpiresAt: telegramAccessTokens.expiresAt,
      tokenUsedAt,
    })
    .from(purchases)
    .innerJoin(
      accessEntitlements,
      and(
        eq(accessEntitlements.purchaseId, purchases.id),
        eq(accessEntitlements.accessKey, "primary"),
      ),
    )
    .innerJoin(
      telegramAccessTokens,
      eq(accessEntitlements.currentTokenId, telegramAccessTokens.tokenId),
    )
    .leftJoin(
      purchaseSideEffects,
      and(
        eq(purchaseSideEffects.purchaseId, purchases.id),
        eq(purchaseSideEffects.kind, "successful_customer_export"),
      ),
    )
    .where(
      and(
        sql`LOWER(BTRIM(${accessEntitlements.accessWorkflow})) = ${normalizedAccessWorkflow}`,
        sql`NULLIF(BTRIM(${purchases.paymentIntentId}), '') IS NOT NULL`,
        sql`NULLIF(BTRIM(${telegramAccessTokens.tokenValue}), '') IS NOT NULL`,
      ),
    )
    .orderBy(desc(createdAt), asc(purchases.firstSeenAt), asc(purchases.paymentIntentId));
  const queryLimit = getQueryLimit(limit);
  const rows = queryLimit === null ? await baseQuery : await baseQuery.limit(queryLimit);

  return rows.map((row) => ({
    accessUrl: row.accessUrl?.trim() ?? "",
    adminLabel: row.adminLabel?.trim() ?? "",
    createdAt: toIso(row.createdAt),
    lessonLanguage: row.lessonLanguage?.trim() ?? "",
    offerLabel: row.offerLabel?.trim() ?? "",
    productTitle: row.productTitle?.trim() ?? "",
    purchaseItem: row.purchaseItem?.trim() ?? "",
    tokenExpiresAt: toIso(row.tokenExpiresAt),
    tokenUsedAt: toIso(row.tokenUsedAt),
  }));
};
