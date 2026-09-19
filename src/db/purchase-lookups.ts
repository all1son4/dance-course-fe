import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "./client";
import { accessEntitlements, purchases } from "./schema";

export const getPurchaseByPaymentIntentId = async (paymentIntentId: string) => {
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

export const getPurchaseByIds = async (purchaseIds: string[]) => {
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

export const getEntitlementByPurchaseId = async (purchaseId: string, chatId?: string) => {
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
