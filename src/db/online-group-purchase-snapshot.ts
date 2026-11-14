import { asc, sql } from "drizzle-orm";

import type { getDatabase } from "./client";
import {
  accessEntitlements,
  purchases,
  telegramAccessTokens,
  telegramUserBindings,
} from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type OnlineGroupPurchaseSnapshotRow = Readonly<
  Pick<
    typeof purchases.$inferSelect,
    | "id"
    | "productExternalId"
    | "offerExternalId"
    | "outcome"
    | "source"
    | "livemode"
    | "firstSeenAt"
    | "inviteHistoryCreatedAt"
    | "succeededAt"
    | "onlineGroupCohortId"
    | "telegramUserId"
    | "inspirationChatIdSnapshot"
    | "inspirationAccessExpiresAtSnapshot"
  >
>;

export type OnlineGroupEntitlementSnapshotRow = Readonly<
  Pick<
    typeof accessEntitlements.$inferSelect,
    | "id"
    | "purchaseId"
    | "accessKey"
    | "deliveryChannel"
    | "accessWorkflow"
    | "status"
    | "startsAt"
    | "expiresAt"
    | "periodStartMode"
    | "paidDurationDays"
    | "startsAfterEntitlementId"
    | "revokedAt"
    | "revokedReason"
    | "externalTargetType"
    | "telegramChatId"
    | "telegramUserId"
    | "sourceKind"
  >
>;

export type OnlineGroupBindingSnapshotRow = Readonly<
  Pick<
    typeof telegramUserBindings.$inferSelect,
    | "id"
    | "purchaseId"
    | "entitlementId"
    | "telegramUserId"
    | "chatId"
    | "boundAt"
    | "lastSeenAt"
    | "accessExpiresAt"
    | "revokedAt"
    | "revokedReason"
    | "status"
  >
>;

export type OnlineGroupTokenSnapshotRow = Readonly<
  Pick<
    typeof telegramAccessTokens.$inferSelect,
    | "id"
    | "purchaseId"
    | "entitlementId"
    | "linkKind"
    | "chatId"
    | "status"
    | "expiresAt"
    | "usedAt"
    | "telegramUserId"
    | "accessExpiresAt"
    | "createdAt"
  >
>;

export type OnlineGroupPurchaseSnapshot = {
  purchases: OnlineGroupPurchaseSnapshotRow[];
  entitlements: OnlineGroupEntitlementSnapshotRow[];
  bindings: OnlineGroupBindingSnapshotRow[];
  tokens: OnlineGroupTokenSnapshotRow[];
};

/** Reads raw reconciliation facts without filtering history or inferring identity. */
export async function readOnlineGroupPurchaseSnapshotInTransaction(
  tx: Pick<DatabaseTransaction, "select">,
): Promise<OnlineGroupPurchaseSnapshot> {
  const purchaseRows = await tx
    .select({
      id: purchases.id,
      productExternalId: purchases.productExternalId,
      offerExternalId: purchases.offerExternalId,
      outcome: purchases.outcome,
      source: purchases.source,
      livemode: purchases.livemode,
      firstSeenAt: purchases.firstSeenAt,
      inviteHistoryCreatedAt: purchases.inviteHistoryCreatedAt,
      succeededAt: purchases.succeededAt,
      onlineGroupCohortId: purchases.onlineGroupCohortId,
      telegramUserId: purchases.telegramUserId,
      inspirationChatIdSnapshot: purchases.inspirationChatIdSnapshot,
      inspirationAccessExpiresAtSnapshot: purchases.inspirationAccessExpiresAtSnapshot,
    })
    .from(purchases)
    .orderBy(asc(purchases.firstSeenAt), asc(purchases.id));

  const entitlementRows = await tx
    .select({
      id: accessEntitlements.id,
      purchaseId: accessEntitlements.purchaseId,
      accessKey: accessEntitlements.accessKey,
      deliveryChannel: accessEntitlements.deliveryChannel,
      accessWorkflow: accessEntitlements.accessWorkflow,
      status: accessEntitlements.status,
      startsAt: accessEntitlements.startsAt,
      expiresAt: accessEntitlements.expiresAt,
      periodStartMode: accessEntitlements.periodStartMode,
      paidDurationDays: accessEntitlements.paidDurationDays,
      startsAfterEntitlementId: accessEntitlements.startsAfterEntitlementId,
      revokedAt: accessEntitlements.revokedAt,
      revokedReason: accessEntitlements.revokedReason,
      externalTargetType: accessEntitlements.externalTargetType,
      telegramChatId: accessEntitlements.telegramChatId,
      telegramUserId: accessEntitlements.telegramUserId,
      sourceKind: accessEntitlements.sourceKind,
    })
    .from(accessEntitlements)
    .orderBy(asc(accessEntitlements.id));

  const bindingRows = await tx
    .select({
      id: telegramUserBindings.id,
      purchaseId: telegramUserBindings.purchaseId,
      entitlementId: telegramUserBindings.entitlementId,
      telegramUserId: telegramUserBindings.telegramUserId,
      chatId: telegramUserBindings.chatId,
      boundAt: telegramUserBindings.boundAt,
      lastSeenAt: telegramUserBindings.lastSeenAt,
      accessExpiresAt: telegramUserBindings.accessExpiresAt,
      revokedAt: telegramUserBindings.revokedAt,
      revokedReason: telegramUserBindings.revokedReason,
      status: telegramUserBindings.status,
    })
    .from(telegramUserBindings)
    .orderBy(asc(telegramUserBindings.id));

  const tokenRows = await tx
    .select({
      id: telegramAccessTokens.id,
      purchaseId: telegramAccessTokens.purchaseId,
      entitlementId: telegramAccessTokens.entitlementId,
      linkKind: telegramAccessTokens.linkKind,
      chatId: telegramAccessTokens.chatId,
      status: telegramAccessTokens.status,
      expiresAt: telegramAccessTokens.expiresAt,
      usedAt: telegramAccessTokens.usedAt,
      telegramUserId: telegramAccessTokens.telegramUserId,
      accessExpiresAt: telegramAccessTokens.accessExpiresAt,
      createdAt: telegramAccessTokens.createdAt,
    })
    .from(telegramAccessTokens)
    .orderBy(asc(telegramAccessTokens.id));

  return {
    purchases: purchaseRows,
    entitlements: entitlementRows,
    bindings: bindingRows,
    tokens: tokenRows,
  };
}

/** All four lists describe the same read-only database snapshot. */
export function readOnlineGroupPurchaseSnapshot(
  db: Pick<ReturnType<typeof getDatabase>, "transaction">,
): Promise<OnlineGroupPurchaseSnapshot> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
      await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
      return readOnlineGroupPurchaseSnapshotInTransaction(tx);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
