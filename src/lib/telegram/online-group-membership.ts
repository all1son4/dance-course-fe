import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm";

import { isInspirationHubOfferId } from "@/constants/sellable-products";
import { rememberJoinedTelegramUsername } from "@/db/buyer-contacts";
import { getDatabase } from "@/db/client";
import { findInspirationHubChatId } from "@/db/hub-access-coverage";
import { lockHubPeriodOwner } from "@/db/hub-period-chain-resolution";
import { findPreviousChatRemoval } from "@/db/previous-chat-removal";
import { recordPurchaseTelegramOwnerInTransaction } from "@/db/purchase-access-source";
import {
  accessEntitlements,
  purchases,
  telegramAccessTokens,
  telegramUserBindings,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";
import { enqueueOutboxJobInTransaction } from "@/db/transactional-outbox";
import { previousChatRemovalKey } from "@/lib/online-group/previous-chat-removal-key";
import type { PaymentRecordSnapshot } from "@/lib/payment-record";
import { logSafeError } from "@/lib/safe-error-log";

import { hashAccessToken } from "./access-records";
import { kickUnexpectedMember, revokeTelegramChatInviteLink } from "./bot-api";
import {
  findStandaloneHubRight,
  getPlusAccessTargets,
  getPurchase,
  isGroupInviteOfferId,
  type OnlineGroupAccessKey,
  type OnlineGroupPurchase,
  upsertBinding,
  upsertEntitlement,
} from "./online-group-access-records";

type OnlineGroupMembershipResult = {
  handled: boolean;
  /** HUB-D44: the job that removes the member from the previous cohort's chat. */
  previousChatRemovalKey?: string;
  shouldKick: boolean;
  shouldRevokeInvite: boolean;
};
type OnlineGroupMembershipIdentity = {
  chatId: string;
  telegramUserId: string;
  telegramUsername: string;
};

const markOnlineGroupBindingLeft = async ({
  binding,
  database,
  now,
}: {
  binding: typeof telegramUserBindings.$inferSelect;
  database: ReturnType<typeof getDatabase>;
  now: Date;
}): Promise<void> => {
  await database
    .update(telegramUserBindings)
    .set({
      lastSeenAt: now,
      revokedAt: now,
      revokedReason: "left_channel",
      status: "left",
      updatedAt: now,
    })
    .where(eq(telegramUserBindings.id, binding.id));

  if (binding.entitlementId) {
    // A period-model right that the cron already ended keeps its final status.
    await database
      .update(accessEntitlements)
      .set({ status: "left_channel", updatedAt: now })
      .where(
        and(
          eq(accessEntitlements.id, binding.entitlementId),
          or(
            isNull(accessEntitlements.sourceKind),
            notInArray(accessEntitlements.status, ["expired", "revoked"]),
          ),
        ),
      );
  }
};

const syncOnlineGroupMemberLeft = async ({
  database,
  identity,
  now,
}: {
  database: ReturnType<typeof getDatabase>;
  identity: OnlineGroupMembershipIdentity;
  now: Date;
}): Promise<boolean> => {
  const bindings = await database
    .select({ binding: telegramUserBindings, purchase: purchases })
    .from(telegramUserBindings)
    .innerJoin(purchases, eq(telegramUserBindings.purchaseId, purchases.id))
    .where(
      and(
        eq(telegramUserBindings.chatId, identity.chatId),
        eq(telegramUserBindings.telegramUserId, identity.telegramUserId),
        eq(telegramUserBindings.status, "active"),
      ),
    );
  const onlineGroupBindings = bindings.filter((row) =>
    isGroupInviteOfferId(row.purchase.offerExternalId ?? ""),
  );

  if (!onlineGroupBindings.length) {
    return false;
  }

  await Promise.all(
    onlineGroupBindings.map(({ binding }) =>
      markOnlineGroupBindingLeft({
        binding,
        database,
        now,
      }),
    ),
  );

  return true;
};

const getExpectedTelegramUserId = ({
  siblingBindings,
  token,
}: {
  siblingBindings: Array<typeof telegramUserBindings.$inferSelect>;
  token: typeof telegramAccessTokens.$inferSelect;
}): string =>
  token.telegramUserId?.trim() ||
  siblingBindings.find((binding) => binding.telegramUserId.trim())?.telegramUserId ||
  "";

const isRejectedOnlineGroupMembership = ({
  expectedUserId,
  identity,
  isFirstUse,
  isRepeatForBoundUser,
  now,
  purchase,
  token,
}: {
  expectedUserId: string;
  identity: OnlineGroupMembershipIdentity;
  isFirstUse: boolean;
  isRepeatForBoundUser: boolean;
  now: Date;
  purchase: OnlineGroupPurchase;
  token: typeof telegramAccessTokens.$inferSelect;
}): boolean => {
  const accessExpired =
    token.accessExpiresAt && token.accessExpiresAt.getTime() <= now.getTime();

  return (
    purchase.outcome !== "succeeded" ||
    token.chatId !== identity.chatId ||
    token.expiresAt.getTime() <= now.getTime() ||
    Boolean(accessExpired) ||
    (!isFirstUse && !isRepeatForBoundUser) ||
    Boolean(expectedUserId && expectedUserId !== identity.telegramUserId)
  );
};

const bindFirstUseTokens = async ({
  identity,
  now,
  purchaseId,
  tokenId,
  transaction,
}: {
  identity: OnlineGroupMembershipIdentity;
  now: Date;
  purchaseId: string;
  tokenId: string;
  transaction: DatabaseTransaction;
}): Promise<void> => {
  // Binding sibling invites prevents one purchase from being claimed by another account.
  await transaction
    .update(telegramAccessTokens)
    .set({
      status: "used",
      telegramUserId: identity.telegramUserId,
      telegramUsername: identity.telegramUsername || null,
      updatedAt: now,
      usedAt: now,
    })
    .where(
      and(
        eq(telegramAccessTokens.id, tokenId),
        eq(telegramAccessTokens.status, "issued"),
      ),
    );
  await transaction
    .update(telegramAccessTokens)
    .set({
      telegramUserId: identity.telegramUserId,
      telegramUsername: identity.telegramUsername || null,
      updatedAt: now,
    })
    .where(
      and(
        eq(telegramAccessTokens.purchaseId, purchaseId),
        eq(telegramAccessTokens.status, "issued"),
      ),
    );
};

const resolveMembershipAccessKey = async ({
  entitlementId,
  transaction,
}: {
  entitlementId: string | null;
  transaction: DatabaseTransaction;
}): Promise<OnlineGroupAccessKey> => {
  if (!entitlementId) {
    return "main-group";
  }

  const [entitlement] = await transaction
    .select()
    .from(accessEntitlements)
    .where(eq(accessEntitlements.id, entitlementId))
    .limit(1);

  return entitlement?.accessKey === "inspiration-hub" ? "inspiration-hub" : "main-group";
};

const syncOnlineGroupMemberJoinedInTransaction = async ({
  identity,
  inviteHash,
  inviteLink,
  now,
  transaction,
}: {
  identity: OnlineGroupMembershipIdentity;
  inviteHash: string;
  inviteLink: string;
  now: Date;
  transaction: DatabaseTransaction;
}): Promise<OnlineGroupMembershipResult> => {
  const membershipLockKey = `online-group-membership:${inviteHash}`;

  // Telegram can report the same single-use invite concurrently.
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${membershipLockKey}, 0))`,
  );

  const [row] = await transaction
    .select({ purchase: purchases, token: telegramAccessTokens })
    .from(telegramAccessTokens)
    .innerJoin(purchases, eq(telegramAccessTokens.purchaseId, purchases.id))
    .where(eq(telegramAccessTokens.tokenHash, inviteHash))
    .limit(1);

  if (!row || !isGroupInviteOfferId(row.purchase.offerExternalId ?? "")) {
    return {
      handled: false,
      shouldKick: false,
      shouldRevokeInvite: false,
    };
  }

  const { purchase, token } = row;
  const siblingBindings = await transaction
    .select()
    .from(telegramUserBindings)
    .where(eq(telegramUserBindings.purchaseId, purchase.id));
  const expectedUserId = getExpectedTelegramUserId({
    siblingBindings,
    token,
  });
  const isFirstUse = token.status === "issued";
  const isRepeatForBoundUser =
    token.status === "used" &&
    Boolean(expectedUserId) &&
    expectedUserId === identity.telegramUserId;

  if (
    isRejectedOnlineGroupMembership({
      expectedUserId,
      identity,
      isFirstUse,
      isRepeatForBoundUser,
      now,
      purchase,
      token,
    })
  ) {
    return {
      handled: true,
      shouldKick: true,
      shouldRevokeInvite: false,
    };
  }

  await recordMemberOwnerInTransaction(transaction, purchase, identity);

  if (isFirstUse) {
    await bindFirstUseTokens({
      identity,
      now,
      purchaseId: purchase.id,
      tokenId: token.id,
      transaction,
    });
  }

  const accessKey = await resolveMembershipAccessKey({
    entitlementId: token.entitlementId,
    transaction,
  });

  const removalKey = await recordMemberInChatInTransaction({
    accessExpiresAt: token.accessExpiresAt?.toISOString() ?? "",
    accessKey,
    identity,
    inviteLink,
    purchase,
    tokenId: token.tokenId,
    transaction,
  });

  return {
    handled: true,
    previousChatRemovalKey: removalKey,
    shouldKick: false,
    shouldRevokeInvite: isFirstUse,
  };
};

/**
 * А5: the purchase learns its owner at the first join, under the owner lock the Hub
 * period writers take, and only into an empty field.
 */
const recordMemberOwnerInTransaction = async (
  transaction: DatabaseTransaction,
  purchase: OnlineGroupPurchase,
  identity: OnlineGroupMembershipIdentity,
) => {
  await lockHubPeriodOwner(transaction, identity.telegramUserId);
  const ownerWrite = await recordPurchaseTelegramOwnerInTransaction(
    transaction,
    purchase.id,
    identity.telegramUserId,
  );

  if (ownerWrite === "mismatch") {
    console.error("Purchase already names another Telegram account; owner kept", {
      purchaseId: purchase.id,
    });
  }
};

/**
 * What a join writes after its owner, by an invite or found by a live check: the
 * right activated, the binding, and HUB-D44's removal from the previous cohort's chat
 * after a join into the new cohort's main chat.
 */
const recordMemberInChatInTransaction = async ({
  accessExpiresAt,
  accessKey,
  identity,
  inviteLink,
  purchase,
  tokenId,
  transaction,
}: {
  accessExpiresAt: string;
  accessKey: OnlineGroupAccessKey;
  identity: OnlineGroupMembershipIdentity;
  inviteLink: string;
  purchase: OnlineGroupPurchase;
  tokenId: string | null;
  transaction: DatabaseTransaction;
}): Promise<string | undefined> => {
  await upsertEntitlement({
    accessExpiresAt,
    accessKey,
    chatId: identity.chatId,
    database: transaction,
    purchase,
    status: "activated",
    telegramUserId: identity.telegramUserId,
    telegramUsername: identity.telegramUsername,
    tokenId,
  });
  await upsertBinding({
    accessExpiresAt,
    chatId: identity.chatId,
    database: transaction,
    inviteLink,
    purchase,
    telegramUserId: identity.telegramUserId,
    telegramUsername: identity.telegramUsername,
  });
  await rememberJoinedTelegramUsername(transaction, {
    purchaseId: purchase.id,
    telegramUsername: identity.telegramUsername,
  });

  // HUB-D44 (section 6.5): a confirmed join into the new cohort's main chat sends the
  // member out of the previous cohort's chat — by this purchase's own invite, or
  // found there by the invitation page's live check (the same renewal rule).
  const removal =
    accessKey === "main-group" && purchase.onlineGroupCohortId
      ? await findPreviousChatRemoval(transaction, {
          cohortId: purchase.onlineGroupCohortId,
          joinedChatId: identity.chatId,
        })
      : null;
  const removalKey = removal
    ? previousChatRemovalKey(purchase.id, removal.previousChatId)
    : undefined;

  if (removal && removalKey) {
    await enqueueOutboxJobInTransaction(transaction, {
      deduplicationKey: removalKey,
      kind: "online_group_previous_chat_removal",
      payload: {
        cohortId: removal.cohortId,
        previousChatId: removal.previousChatId,
        telegramUserId: identity.telegramUserId,
      },
      provider: "telegram",
      purchaseId: purchase.id,
      recipient: removal.previousChatId,
    });
  }

  return removalKey;
};

const runPreviousChatRemoval = async (removalKey: string | undefined) => {
  if (!removalKey) return;
  try {
    // Imported here: the business outbox imports this module.
    const { processBusinessOperationOutboxJob } =
      await import("@/lib/business-operation-outbox");
    await processBusinessOperationOutboxJob(removalKey);
  } catch (error) {
    // The job stays queued; the daily run retries it.
    logSafeError("Failed to remove a member from the previous cohort chat", error);
  }
};

/** The chat and the access end of one access of a purchase, as the ensure computes them. */
const findAccessTarget = async (
  paymentRecord: PaymentRecordSnapshot,
  purchase: OnlineGroupPurchase,
  accessKey: OnlineGroupAccessKey,
): Promise<{ accessExpiresAt: string; chatId: string } | null> => {
  if (isInspirationHubOfferId(paymentRecord.offer_id)) {
    if (accessKey !== "inspiration-hub") return null;
    const right = await findStandaloneHubRight(purchase.id);
    const hubChatId = right ? await findInspirationHubChatId(getDatabase()) : null;
    return hubChatId
      ? { accessExpiresAt: right?.expiresAt?.toISOString() ?? "", chatId: hubChatId }
      : null;
  }

  const target = (await getPlusAccessTargets(paymentRecord, purchase)).find(
    (candidate) => candidate.accessKey === accessKey,
  );
  return target
    ? { accessExpiresAt: target.accessExpiresAt, chatId: target.chatId }
    : null;
};

/**
 * A live Telegram check found the purchase's own account already in one of its chats
 * (added by hand, or in by another way): recorded the way a join is, without an
 * invite, so the admin journal and «Мой доступ» say what Telegram says.
 */
export const recordOnlineGroupMemberPresent = async ({
  accessKey,
  paymentRecord,
  telegramUserId,
}: {
  accessKey: OnlineGroupAccessKey;
  paymentRecord: PaymentRecordSnapshot;
  telegramUserId: string;
}): Promise<boolean> => {
  const userId = telegramUserId.trim();
  const purchase = await getPurchase(paymentRecord.payment_intent_id);
  if (!userId || !purchase || purchase.outcome !== "succeeded") return false;

  const target = await findAccessTarget(paymentRecord, purchase, accessKey);
  if (!target) return false;

  const identity = {
    chatId: target.chatId,
    telegramUserId: userId,
    telegramUsername: "",
  };
  const removalKey = await getDatabase().transaction(async (transaction) => {
    await recordMemberOwnerInTransaction(transaction, purchase, identity);
    return recordMemberInChatInTransaction({
      accessExpiresAt: target.accessExpiresAt,
      accessKey,
      identity,
      inviteLink: "",
      purchase,
      tokenId: null,
      transaction,
    });
  });
  await runPreviousChatRemoval(removalKey);
  return true;
};

export const syncOnlineGroupMembership = async ({
  chatId,
  inviteLink,
  membershipStatus,
  telegramUserId,
  telegramUsername,
}: {
  chatId: string;
  inviteLink?: string | null;
  membershipStatus: "joined" | "left";
  telegramUserId: string;
  telegramUsername?: string | null;
}): Promise<boolean> => {
  const db = getDatabase();
  const normalizedChatId = chatId.trim();
  const normalizedUserId = telegramUserId.trim();
  const normalizedUsername = telegramUsername?.trim() ?? "";
  const now = new Date();
  const identity: OnlineGroupMembershipIdentity = {
    chatId: normalizedChatId,
    telegramUserId: normalizedUserId,
    telegramUsername: normalizedUsername,
  };

  if (membershipStatus === "left") {
    return syncOnlineGroupMemberLeft({
      database: db,
      identity,
      now,
    });
  }

  const normalizedInviteLink = inviteLink?.trim() ?? "";

  if (!normalizedInviteLink) {
    return false;
  }

  const inviteHash = hashAccessToken(normalizedInviteLink);
  const membershipResult = await db.transaction((transaction) =>
    syncOnlineGroupMemberJoinedInTransaction({
      identity,
      inviteHash,
      inviteLink: normalizedInviteLink,
      now,
      transaction,
    }),
  );

  if (!membershipResult.handled) {
    return false;
  }

  if (membershipResult.shouldKick) {
    await kickUnexpectedMember(normalizedChatId, normalizedUserId);
    return true;
  }

  if (membershipResult.shouldRevokeInvite) {
    try {
      await revokeTelegramChatInviteLink({
        chatId: normalizedChatId,
        inviteLink: normalizedInviteLink,
      });
    } catch (error) {
      // Telegram's member limit already blocks reuse; revocation is defense in depth.
      logSafeError("Failed to revoke a used Online Group invite", error);
    }
  }

  await runPreviousChatRemoval(membershipResult.previousChatRemovalKey);

  return true;
};
