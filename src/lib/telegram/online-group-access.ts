import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { isOnlineGroupLibraryOfferId } from "@/constants/sellable-products";
import { getDatabase } from "@/db/client";
import {
  accessEntitlements,
  purchases,
  telegramAccessTokens,
  telegramUserBindings,
} from "@/db/schema";
import type { PaymentSheetRecord } from "@/lib/google-sheets";

import {
  banTelegramChatMember,
  createTelegramChatInviteLink,
  revokeTelegramChatInviteLink,
  unbanTelegramChatMember,
} from "./bot-api";
import { getOnlineGroupIdentityReuseLookup } from "./identity-reuse-policy";
import { isOnlineGroupAccessOfferId } from "./offer-access";

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TEMP_KICK_SECONDS = 35;

export type OnlineGroupAccessKey = "inspiration-hub" | "main-group";
export type OnlineGroupAccessState = {
  accessKey: OnlineGroupAccessKey;
  status: typeof accessEntitlements.$inferSelect.status;
};
type OnlineGroupAccessItem = {
  accessExpiresAt: string;
  accessKey: OnlineGroupAccessKey;
  accessUrl: string;
  status: "active" | "expired" | "ready" | "unavailable";
  tokenExpiresAt: string;
};
type DatabaseExecutor = Pick<
  ReturnType<typeof getDatabase>,
  "insert" | "select" | "update"
>;
type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type OnlineGroupMembershipResult = {
  handled: boolean;
  shouldKick: boolean;
  shouldRevokeInvite: boolean;
};
type OnlineGroupMembershipIdentity = {
  chatId: string;
  telegramUserId: string;
  telegramUsername: string;
};
const pendingOnlineGroupAccessEnsures = new Map<
  string,
  Promise<OnlineGroupAccessItem[] | null>
>();

const hashInvite = (value: string) => createHash("sha256").update(value).digest("hex");

const createAccessItem = ({
  accessExpiresAt,
  accessKey,
  accessUrl = "",
  status,
  tokenExpiresAt = "",
}: {
  accessExpiresAt: string;
  accessKey: OnlineGroupAccessKey;
  accessUrl?: string;
  status: OnlineGroupAccessItem["status"];
  tokenExpiresAt?: string;
}): OnlineGroupAccessItem => ({
  accessExpiresAt,
  accessKey,
  accessUrl,
  status,
  tokenExpiresAt,
});

const getAccessTargets = (
  paymentRecord: PaymentSheetRecord,
  purchaseSnapshot?: {
    inspirationAccessExpiresAt: Date | null;
    inspirationChatId: string | null;
  },
) => {
  const mainChatId = paymentRecord.telegram_channel_chat_id.trim();
  const inspirationChatId =
    purchaseSnapshot?.inspirationChatId?.trim() ||
    paymentRecord.telegram_inspiration_chat_id.trim();
  const inspirationAccessExpiresAt =
    purchaseSnapshot?.inspirationAccessExpiresAt?.toISOString() ?? "";
  const targets: Array<{
    accessExpiresAt: string;
    accessKey: OnlineGroupAccessKey;
    chatId: string;
  }> = mainChatId
    ? [
        {
          accessExpiresAt: "",
          accessKey: "main-group" as const,
          chatId: mainChatId,
        },
      ]
    : [];

  if (isOnlineGroupLibraryOfferId(paymentRecord.offer_id) && inspirationChatId) {
    targets.push({
      accessExpiresAt: inspirationAccessExpiresAt,
      accessKey: "inspiration-hub",
      chatId: inspirationChatId,
    });
  }

  return targets;
};

const getPurchase = async (paymentIntentId: string) => {
  const [purchase] = await getDatabase()
    .select()
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntentId.trim()))
    .limit(1);

  return purchase ?? null;
};

export const listOnlineGroupAccessStatesForPayment = async (
  paymentIntentId: string,
): Promise<OnlineGroupAccessState[]> => {
  const purchase = await getPurchase(paymentIntentId);

  if (!purchase) {
    return [];
  }

  const rows = await getDatabase()
    .select({
      accessKey: accessEntitlements.accessKey,
      status: accessEntitlements.status,
    })
    .from(accessEntitlements)
    .where(eq(accessEntitlements.purchaseId, purchase.id));

  return rows
    .flatMap((row): OnlineGroupAccessState[] => {
      if (row.accessKey === "inspiration-hub") {
        return [{ accessKey: "inspiration-hub", status: row.status }];
      }

      if (row.accessKey === "primary") {
        return [{ accessKey: "main-group", status: row.status }];
      }

      return [];
    })
    .sort(
      (left, right) =>
        Number(right.accessKey === "main-group") -
        Number(left.accessKey === "main-group"),
    );
};

type OnlineGroupPurchase = NonNullable<Awaited<ReturnType<typeof getPurchase>>>;

const upsertEntitlement = async ({
  accessExpiresAt,
  accessKey,
  chatId,
  database = getDatabase(),
  purchase,
  status,
  telegramUserId,
  telegramUsername,
  tokenId,
}: {
  accessExpiresAt: string;
  accessKey: OnlineGroupAccessKey;
  chatId: string;
  database?: DatabaseExecutor;
  purchase: OnlineGroupPurchase;
  status: typeof accessEntitlements.$inferInsert.status;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  tokenId?: string | null;
}) => {
  const now = new Date();
  const expiresAt = accessExpiresAt ? new Date(accessExpiresAt) : null;
  const persistedAccessKey = accessKey === "main-group" ? "primary" : accessKey;
  const values = {
    accessWorkflow: "telegram-online-group",
    currentTokenId: tokenId?.trim() || null,
    customerId: purchase.customerId,
    deliveryChannel: "telegram",
    expiresAt,
    externalTargetType: "telegram_chat" as const,
    offerId: purchase.offerId,
    productId: purchase.productId,
    revokedAt: null,
    status,
    telegramChatId: chatId,
    telegramUserId: telegramUserId?.trim() || null,
    telegramUsername: telegramUsername?.trim() || null,
    updatedAt: now,
  };
  const [entitlement] = await database
    .insert(accessEntitlements)
    .values({
      ...values,
      accessKey: persistedAccessKey,
      purchaseId: purchase.id,
    })
    .onConflictDoUpdate({
      set: values,
      target: [accessEntitlements.purchaseId, accessEntitlements.accessKey],
    })
    .returning();

  return entitlement;
};

const upsertBinding = async ({
  accessExpiresAt,
  chatId,
  database = getDatabase(),
  inviteLink,
  purchase,
  telegramUserId,
  telegramUsername,
}: {
  accessExpiresAt: string;
  chatId: string;
  database?: DatabaseExecutor;
  inviteLink: string;
  purchase: OnlineGroupPurchase;
  telegramUserId: string;
  telegramUsername: string;
}) => {
  const now = new Date();
  const [entitlement] = await database
    .select()
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchase.id),
        eq(accessEntitlements.telegramChatId, chatId),
      ),
    )
    .limit(1);
  const values = {
    accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
    chatId,
    customerEmailSnapshot: purchase.customerEmailSnapshot,
    entitlementId: entitlement?.id ?? null,
    inviteLink: inviteLink || null,
    lastSeenAt: now,
    offerId: purchase.offerId,
    productId: purchase.productId,
    revokedAt: null,
    revokedReason: null,
    status: "active" as const,
    telegramUserId,
    telegramUsername: telegramUsername || null,
    updatedAt: now,
  };
  const [binding] = await database
    .insert(telegramUserBindings)
    .values({
      ...values,
      boundAt: now,
      purchaseId: purchase.id,
    })
    .onConflictDoUpdate({
      set: values,
      target: [telegramUserBindings.purchaseId, telegramUserBindings.chatId],
    })
    .returning();

  return binding;
};

const findCurrentToken = async ({
  chatId,
  database = getDatabase(),
  purchaseId,
}: {
  chatId: string;
  database?: DatabaseExecutor;
  purchaseId: string;
}) => {
  const [token] = await database
    .select()
    .from(telegramAccessTokens)
    .where(
      and(
        eq(telegramAccessTokens.purchaseId, purchaseId),
        eq(telegramAccessTokens.chatId, chatId),
      ),
    )
    .orderBy(desc(telegramAccessTokens.createdAt))
    .limit(1);

  return token ?? null;
};

const findActiveHubBinding = async ({
  chatId,
  telegramUserId,
}: {
  chatId: string;
  telegramUserId: string;
}) => {
  const [binding] = await getDatabase()
    .select()
    .from(telegramUserBindings)
    .where(
      and(
        eq(telegramUserBindings.chatId, chatId),
        eq(telegramUserBindings.telegramUserId, telegramUserId),
        eq(telegramUserBindings.status, "active"),
        or(
          isNull(telegramUserBindings.accessExpiresAt),
          gt(telegramUserBindings.accessExpiresAt, new Date()),
        ),
      ),
    )
    .orderBy(desc(telegramUserBindings.lastSeenAt))
    .limit(1);

  return binding ?? null;
};

const findKnownTelegramIdentity = async ({
  chatId,
  purchase,
  telegramUserId,
  telegramUsername,
}: {
  chatId: string;
  purchase: OnlineGroupPurchase;
  telegramUserId: string;
  telegramUsername: string;
}) => {
  if (telegramUserId) {
    return {
      telegramUserId,
      telegramUsername,
    };
  }

  const reuseLookup = getOnlineGroupIdentityReuseLookup({
    customerEmailSnapshot: purchase.customerEmailSnapshot,
    customerId: purchase.customerId,
  });

  if (!reuseLookup) {
    return null;
  }

  const customerMatch =
    reuseLookup.kind === "customer_id"
      ? eq(purchases.customerId, reuseLookup.value)
      : eq(purchases.customerEmailSnapshot, reuseLookup.value);
  const knownBindings = await getDatabase()
    .select({
      telegramUserId: telegramUserBindings.telegramUserId,
      telegramUsername: telegramUserBindings.telegramUsername,
    })
    .from(telegramUserBindings)
    .innerJoin(purchases, eq(telegramUserBindings.purchaseId, purchases.id))
    .where(and(eq(telegramUserBindings.chatId, chatId), customerMatch))
    .orderBy(desc(telegramUserBindings.lastSeenAt))
    .limit(10);
  const knownBinding = knownBindings[0];
  const knownTelegramUserId = knownBinding?.telegramUserId.trim() ?? "";

  if (!knownTelegramUserId) {
    return null;
  }

  const candidateUserIds = new Set(
    knownBindings.map((binding) => binding.telegramUserId.trim()).filter(Boolean),
  );

  if (candidateUserIds.size > 1) {
    console.warn("Multiple Telegram identities matched Online Group reuse", {
      candidateCount: candidateUserIds.size,
      chatId,
      lookupKind: reuseLookup.kind,
      paymentIntentId: purchase.paymentIntentId,
    });
  }

  return {
    telegramUserId: knownTelegramUserId,
    telegramUsername: knownBinding?.telegramUsername?.trim() ?? "",
  };
};

type EnsureTargetAccessContext = {
  accessExpiresAt: string;
  accessKey: OnlineGroupAccessKey;
  chatId: string;
  purchase: OnlineGroupPurchase;
  telegramUserId: string;
  telegramUsername: string;
};

type CreatedTargetInvite = {
  expiresAt: Date;
  invite: Awaited<ReturnType<typeof createTelegramChatInviteLink>>;
  tokenId: string;
};

const unbanKnownTelegramMember = async ({
  chatId,
  telegramUserId,
}: Pick<EnsureTargetAccessContext, "chatId" | "telegramUserId">): Promise<void> => {
  if (!telegramUserId) {
    return;
  }

  await unbanTelegramChatMember({
    chatId,
    onlyIfBanned: true,
    userId: telegramUserId,
  });
};

const resolveCurrentTargetToken = async ({
  context,
  currentToken,
  now,
  transaction,
}: {
  context: EnsureTargetAccessContext;
  currentToken: NonNullable<Awaited<ReturnType<typeof findCurrentToken>>>;
  now: Date;
  transaction: DatabaseTransaction;
}): Promise<OnlineGroupAccessItem> => {
  if (currentToken.status === "used") {
    return createAccessItem({
      accessExpiresAt: context.accessExpiresAt,
      accessKey: context.accessKey,
      status: "active",
      tokenExpiresAt: currentToken.expiresAt.toISOString(),
    });
  }

  const isExpired =
    currentToken.status === "expired" || currentToken.expiresAt.getTime() <= Date.now();

  if (isExpired) {
    if (currentToken.status !== "expired") {
      await transaction
        .update(telegramAccessTokens)
        .set({ status: "expired", updatedAt: now })
        .where(eq(telegramAccessTokens.id, currentToken.id));
    }

    return createAccessItem({
      accessExpiresAt: context.accessExpiresAt,
      accessKey: context.accessKey,
      status: "expired",
      tokenExpiresAt: currentToken.expiresAt.toISOString(),
    });
  }

  if (currentToken.status === "issued" && currentToken.tokenValue) {
    await unbanKnownTelegramMember({
      chatId: context.chatId,
      telegramUserId: context.telegramUserId,
    });

    return createAccessItem({
      accessExpiresAt: context.accessExpiresAt,
      accessKey: context.accessKey,
      accessUrl: currentToken.tokenValue,
      status: "ready",
      tokenExpiresAt: currentToken.expiresAt.toISOString(),
    });
  }

  return createAccessItem({
    accessExpiresAt: context.accessExpiresAt,
    accessKey: context.accessKey,
    status: "unavailable",
    tokenExpiresAt: currentToken.expiresAt.toISOString(),
  });
};

const createTargetInvite = async ({
  context,
  transaction,
}: {
  context: EnsureTargetAccessContext;
  transaction: DatabaseTransaction;
}): Promise<
  | {
      accessItem: OnlineGroupAccessItem;
      invite: null;
    }
  | {
      accessItem: null;
      invite: CreatedTargetInvite;
    }
> => {
  const tokenId = `tgi_${randomBytes(8).toString("hex")}`;
  const inviteExpiresAt = Date.now() + INVITE_TTL_MS;
  const accessExpiryTime = context.accessExpiresAt
    ? Date.parse(context.accessExpiresAt)
    : Number.POSITIVE_INFINITY;
  const expiresAt = new Date(Math.min(inviteExpiresAt, accessExpiryTime));

  try {
    return {
      accessItem: null,
      invite: {
        expiresAt,
        invite: await createTelegramChatInviteLink({
          chatId: context.chatId,
          expireDateUnix: Math.floor(expiresAt.getTime() / 1000),
          memberLimit: 1,
          name: tokenId,
        }),
        tokenId,
      },
    };
  } catch (error) {
    console.error("Failed to create Online Group Telegram invite", {
      accessKey: context.accessKey,
      chatId: context.chatId,
      error,
      paymentIntentId: context.purchase.paymentIntentId,
    });
    await upsertEntitlement({
      accessExpiresAt: context.accessExpiresAt,
      accessKey: context.accessKey,
      chatId: context.chatId,
      database: transaction,
      purchase: context.purchase,
      status: "link_failed",
      telegramUserId: context.telegramUserId,
      telegramUsername: context.telegramUsername,
    });

    return {
      accessItem: createAccessItem({
        accessExpiresAt: context.accessExpiresAt,
        accessKey: context.accessKey,
        status: "unavailable",
      }),
      invite: null,
    };
  }
};

const persistTargetInvite = async ({
  context,
  createdInvite,
  transaction,
}: {
  context: EnsureTargetAccessContext;
  createdInvite: CreatedTargetInvite;
  transaction: DatabaseTransaction;
}): Promise<OnlineGroupAccessItem> => {
  const { expiresAt, invite, tokenId } = createdInvite;
  const entitlement = await upsertEntitlement({
    accessExpiresAt: context.accessExpiresAt,
    accessKey: context.accessKey,
    chatId: context.chatId,
    database: transaction,
    purchase: context.purchase,
    status: "token_issued",
    telegramUserId: context.telegramUserId,
    telegramUsername: context.telegramUsername,
    tokenId,
  });

  await transaction.insert(telegramAccessTokens).values({
    accessExpiresAt: context.accessExpiresAt ? new Date(context.accessExpiresAt) : null,
    chatId: context.chatId,
    customerEmailSnapshot: context.purchase.customerEmailSnapshot,
    entitlementId: entitlement?.id ?? null,
    expiresAt,
    lastError: null,
    linkKind: "channel_invite",
    offerId: context.purchase.offerId,
    productId: context.purchase.productId,
    purchaseId: context.purchase.id,
    status: "issued",
    telegramUserId: context.telegramUserId || null,
    telegramUsername: context.telegramUsername || null,
    tokenHash: hashInvite(invite.invite_link),
    tokenId,
    tokenValue: invite.invite_link,
  });

  return createAccessItem({
    accessExpiresAt: context.accessExpiresAt,
    accessKey: context.accessKey,
    accessUrl: invite.invite_link,
    status: "ready",
    tokenExpiresAt: expiresAt.toISOString(),
  });
};

const ensureTargetAccessInTransaction = async ({
  context,
  inviteLockKey,
  now,
  onInviteCreated,
  transaction,
}: {
  context: EnsureTargetAccessContext;
  inviteLockKey: string;
  now: Date;
  onInviteCreated: (inviteLink: string) => void;
  transaction: DatabaseTransaction;
}): Promise<OnlineGroupAccessItem> => {
  // Email delivery and the success page can request the same invite concurrently.
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${inviteLockKey}, 0))`,
  );

  const currentToken = await findCurrentToken({
    chatId: context.chatId,
    database: transaction,
    purchaseId: context.purchase.id,
  });

  if (currentToken) {
    return resolveCurrentTargetToken({
      context,
      currentToken,
      now,
      transaction,
    });
  }

  await unbanKnownTelegramMember({
    chatId: context.chatId,
    telegramUserId: context.telegramUserId,
  });

  const inviteResult = await createTargetInvite({
    context,
    transaction,
  });

  if (inviteResult.accessItem) {
    return inviteResult.accessItem;
  }

  onInviteCreated(inviteResult.invite.invite.invite_link);

  return persistTargetInvite({
    context,
    createdInvite: inviteResult.invite,
    transaction,
  });
};

const ensureTargetAccess = async ({
  accessExpiresAt,
  accessKey,
  chatId,
  paymentRecord,
  purchase,
}: {
  accessExpiresAt: string;
  accessKey: OnlineGroupAccessKey;
  chatId: string;
  paymentRecord: PaymentSheetRecord;
  purchase: OnlineGroupPurchase;
}): Promise<OnlineGroupAccessItem> => {
  const now = new Date();
  const expectedTelegramUserId = paymentRecord.telegram_user_id.trim();
  const expectedTelegramUsername = paymentRecord.telegram_username.trim();
  const knownTelegramIdentity = await findKnownTelegramIdentity({
    chatId,
    purchase,
    telegramUserId: expectedTelegramUserId,
    telegramUsername: expectedTelegramUsername,
  });
  const accessTelegramUserId = knownTelegramIdentity?.telegramUserId ?? "";
  const accessTelegramUsername = knownTelegramIdentity?.telegramUsername ?? "";
  const context: EnsureTargetAccessContext = {
    accessExpiresAt,
    accessKey,
    chatId,
    purchase,
    telegramUserId: accessTelegramUserId,
    telegramUsername: accessTelegramUsername,
  };

  if (accessExpiresAt && Date.parse(accessExpiresAt) <= now.getTime()) {
    await upsertEntitlement({
      accessExpiresAt,
      accessKey,
      chatId,
      purchase,
      status: "expired",
      telegramUserId: accessTelegramUserId,
      telegramUsername: accessTelegramUsername,
    });

    return createAccessItem({
      accessExpiresAt,
      accessKey,
      status: "expired",
    });
  }

  if (accessKey === "inspiration-hub" && accessTelegramUserId) {
    const activeBinding = await findActiveHubBinding({
      chatId,
      telegramUserId: accessTelegramUserId,
    });

    if (activeBinding) {
      await upsertEntitlement({
        accessExpiresAt,
        accessKey,
        chatId,
        purchase,
        status: "activated",
        telegramUserId: accessTelegramUserId,
        telegramUsername: accessTelegramUsername,
      });
      await upsertBinding({
        accessExpiresAt,
        chatId,
        inviteLink: "",
        purchase,
        telegramUserId: accessTelegramUserId,
        telegramUsername: accessTelegramUsername,
      });

      return createAccessItem({
        accessExpiresAt,
        accessKey,
        status: "active",
      });
    }
  }

  const inviteLockKey = `online-group-invite:${purchase.id}:${chatId}`;
  let generatedInviteLink = "";

  try {
    return await getDatabase().transaction((transaction) =>
      ensureTargetAccessInTransaction({
        context,
        inviteLockKey,
        now,
        onInviteCreated: (inviteLink) => {
          generatedInviteLink = inviteLink;
        },
        transaction,
      }),
    );
  } catch (error) {
    if (generatedInviteLink) {
      try {
        await revokeTelegramChatInviteLink({
          chatId,
          inviteLink: generatedInviteLink,
        });
      } catch (revokeError) {
        console.error("Failed to revoke an unpersisted Online Group invite", {
          chatId,
          error: revokeError,
          paymentIntentId: purchase.paymentIntentId,
        });
      }
    }

    throw error;
  }
};

const ensureOnlineGroupAccessForPaymentInternal = async (
  paymentRecord: PaymentSheetRecord,
): Promise<OnlineGroupAccessItem[] | null> => {
  if (
    !isOnlineGroupAccessOfferId(paymentRecord.offer_id) ||
    paymentRecord.access_workflow.trim() === "manual-admin"
  ) {
    return null;
  }

  if (paymentRecord.outcome !== "succeeded") {
    return [];
  }

  const purchase = await getPurchase(paymentRecord.payment_intent_id);

  if (!purchase) {
    return [];
  }

  const targets = getAccessTargets(paymentRecord, {
    inspirationAccessExpiresAt: purchase.inspirationAccessExpiresAtSnapshot,
    inspirationChatId: purchase.inspirationChatIdSnapshot,
  });

  return Promise.all(
    targets.map((target) =>
      ensureTargetAccess({
        ...target,
        paymentRecord,
        purchase,
      }),
    ),
  );
};

export const ensureOnlineGroupAccessForPayment = (
  paymentRecord: PaymentSheetRecord,
): Promise<OnlineGroupAccessItem[] | null> => {
  const paymentIntentId = paymentRecord.payment_intent_id.trim();

  if (!paymentIntentId) {
    return ensureOnlineGroupAccessForPaymentInternal(paymentRecord);
  }

  const pendingEnsure = pendingOnlineGroupAccessEnsures.get(paymentIntentId);

  if (pendingEnsure) {
    return pendingEnsure;
  }

  const ensurePromise = ensureOnlineGroupAccessForPaymentInternal(paymentRecord).finally(
    () => {
      if (pendingOnlineGroupAccessEnsures.get(paymentIntentId) === ensurePromise) {
        pendingOnlineGroupAccessEnsures.delete(paymentIntentId);
      }
    },
  );

  pendingOnlineGroupAccessEnsures.set(paymentIntentId, ensurePromise);

  return ensurePromise;
};

const kickUnexpectedMember = async (
  chatId: string,
  telegramUserId: string,
): Promise<void> => {
  await banTelegramChatMember({
    chatId,
    untilDateUnix: Math.floor(Date.now() / 1000) + TEMP_KICK_SECONDS,
    userId: telegramUserId,
  });
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
    await database
      .update(accessEntitlements)
      .set({ status: "left_channel", updatedAt: now })
      .where(eq(accessEntitlements.id, binding.entitlementId));
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
    isOnlineGroupAccessOfferId(row.purchase.offerExternalId ?? ""),
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

  if (!row || !isOnlineGroupAccessOfferId(row.purchase.offerExternalId ?? "")) {
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

  await upsertEntitlement({
    accessExpiresAt: token.accessExpiresAt?.toISOString() ?? "",
    accessKey,
    chatId: identity.chatId,
    database: transaction,
    purchase,
    status: "activated",
    telegramUserId: identity.telegramUserId,
    telegramUsername: identity.telegramUsername,
    tokenId: token.tokenId,
  });
  await upsertBinding({
    accessExpiresAt: token.accessExpiresAt?.toISOString() ?? "",
    chatId: identity.chatId,
    database: transaction,
    inviteLink,
    purchase,
    telegramUserId: identity.telegramUserId,
    telegramUsername: identity.telegramUsername,
  });

  return {
    handled: true,
    shouldKick: false,
    shouldRevokeInvite: isFirstUse,
  };
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

  const inviteHash = hashInvite(normalizedInviteLink);
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
      console.error("Failed to revoke a used Online Group invite", {
        chatId: normalizedChatId,
        error,
        telegramUserId: normalizedUserId,
      });
    }
  }

  return true;
};

export const revokeExpiredOnlineGroupHubAccess = async (): Promise<{
  revokedBindings: number;
  revokedGroups: number;
}> => {
  const db = getDatabase();
  const now = new Date();
  const expiredRows = await db
    .select({ binding: telegramUserBindings, entitlement: accessEntitlements })
    .from(telegramUserBindings)
    .innerJoin(
      accessEntitlements,
      eq(telegramUserBindings.entitlementId, accessEntitlements.id),
    )
    .where(
      and(
        eq(telegramUserBindings.status, "active"),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        lte(telegramUserBindings.accessExpiresAt, now),
      ),
    );
  const groups = new Map<string, typeof expiredRows>();

  for (const row of expiredRows) {
    const key = `${row.binding.telegramUserId}:${row.binding.chatId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let revokedGroups = 0;

  for (const rows of groups.values()) {
    const sample = rows[0];

    if (!sample?.binding.chatId) {
      continue;
    }

    const [newerBinding] = await db
      .select()
      .from(telegramUserBindings)
      .where(
        and(
          eq(telegramUserBindings.telegramUserId, sample.binding.telegramUserId),
          eq(telegramUserBindings.chatId, sample.binding.chatId),
          eq(telegramUserBindings.status, "active"),
          or(
            isNull(telegramUserBindings.accessExpiresAt),
            gt(telegramUserBindings.accessExpiresAt, now),
          ),
        ),
      )
      .limit(1);

    if (!newerBinding) {
      await kickUnexpectedMember(sample.binding.chatId, sample.binding.telegramUserId);
      revokedGroups += 1;
    }

    await Promise.all(
      rows.map(async ({ binding, entitlement }) => {
        await db
          .update(telegramUserBindings)
          .set({
            revokedAt: now,
            revokedReason: "expired",
            status: "revoked",
            updatedAt: now,
          })
          .where(eq(telegramUserBindings.id, binding.id));
        await db
          .update(accessEntitlements)
          .set({
            revokedAt: now,
            revokedReason: "expired",
            status: "revoked",
            updatedAt: now,
          })
          .where(eq(accessEntitlements.id, entitlement.id));
      }),
    );
  }

  return {
    revokedBindings: expiredRows.length,
    revokedGroups,
  };
};
