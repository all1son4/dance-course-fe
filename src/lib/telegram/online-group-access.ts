import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";

import {
  isInspirationHubOfferId,
  isOnlineGroupLibraryOfferId,
} from "@/constants/sellable-products";
import { keepClassifiedAccessPeriod } from "@/db/classified-access";
import { getDatabase } from "@/db/client";
import { findInspirationHubChatId } from "@/db/hub-access-coverage";
import { lockHubPeriodOwner } from "@/db/hub-period-chain-resolution";
import { recordPurchaseTelegramOwnerInTransaction } from "@/db/purchase-access-source";
import {
  accessEntitlements,
  purchases,
  telegramAccessTokens,
  telegramUserBindings,
} from "@/db/schema";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import type { PaymentRecordSnapshot } from "@/lib/payment-record";
import { logSafeError } from "@/lib/safe-error-log";

import {
  banTelegramChatMember,
  createTelegramChatInviteLink,
  revokeTelegramChatInviteLink,
  unbanTelegramChatMember,
} from "./bot-api";
import { getOnlineGroupIdentityReuseLookup } from "./identity-reuse-policy";
import { getOfferMetadataById, isOnlineGroupAccessOfferId } from "./offer-access";

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// К15: Telegram treats a ban shorter than 30 seconds as permanent. The ban end is
// computed once, and the API call may retry for about 31 seconds (three 10-second
// timeouts plus backoff), so the end must leave 30+ seconds after the last attempt.
export const TEMP_KICK_SECONDS = 90;

export type OnlineGroupAccessKey = "inspiration-hub" | "main-group";
export type OnlineGroupAccessState = {
  accessKey: OnlineGroupAccessKey;
  status: typeof accessEntitlements.$inferSelect.status;
};
type OnlineGroupAccessItem = {
  accessExpiresAt: string;
  accessKey: OnlineGroupAccessKey;
  /** Set only when the access has not begun yet ("scheduled"); "" if its start is unknown. */
  accessStartsAt: string;
  accessUrl: string;
  /** "scheduled": paid, not started; the invite comes on the start day (HUB-D37). */
  status: "active" | "expired" | "ready" | "scheduled" | "unavailable";
  tokenExpiresAt: string;
};
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

/** Offers whose access goes through personal invites to a Telegram group: Online Group and the Hub. */
const isGroupInviteOfferId = (offerId: string) =>
  isOnlineGroupAccessOfferId(offerId) || isInspirationHubOfferId(offerId);

const createAccessItem = ({
  accessExpiresAt,
  accessKey,
  accessStartsAt = "",
  accessUrl = "",
  status,
  tokenExpiresAt = "",
}: {
  accessExpiresAt: string;
  accessKey: OnlineGroupAccessKey;
  accessStartsAt?: string;
  accessUrl?: string;
  status: OnlineGroupAccessItem["status"];
  tokenExpiresAt?: string;
}): OnlineGroupAccessItem => ({
  accessExpiresAt,
  accessKey,
  accessStartsAt,
  accessUrl,
  status,
  tokenExpiresAt,
});

const getAccessTargets = (
  paymentRecord: PaymentRecordSnapshot,
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

const toPersistedAccessKey = (accessKey: OnlineGroupAccessKey) =>
  accessKey === "main-group" ? "primary" : accessKey;

// A business revocation of a Hub-model right blocks redelivery. Legacy rows keep
// their reissue behaviour, where the access date alone decides.
const isClassifiedAccessRevoked = async ({
  accessKey,
  purchaseId,
}: {
  accessKey: OnlineGroupAccessKey;
  purchaseId: string;
}): Promise<boolean> => {
  const [revoked] = await getDatabase()
    .select({ id: accessEntitlements.id })
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchaseId),
        eq(accessEntitlements.accessKey, toPersistedAccessKey(accessKey)),
        isNotNull(accessEntitlements.sourceKind),
        isNotNull(accessEntitlements.revokedAt),
      ),
    )
    .limit(1);

  return Boolean(revoked);
};

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
  const persistedAccessKey = toPersistedAccessKey(accessKey);
  const values = {
    accessWorkflow:
      getOfferMetadataById(purchase.offerExternalId ?? "")?.accessWorkflow ||
      "telegram-online-group",
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
      set: keepClassifiedAccessPeriod(values),
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
  /** The admin asks for a fresh invite in place of a used or burnt one (HUB-D38, П3). */
  reissue: boolean;
  telegramUserId: string;
  telegramUsername: string;
};

/** A token whose invite can no longer let anyone in. */
const isSpentToken = (
  token: NonNullable<Awaited<ReturnType<typeof findCurrentToken>>>,
  now: Date,
) =>
  token.status === "used" ||
  token.status === "expired" ||
  token.expiresAt.getTime() <= now.getTime();

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
    logSafeError("Failed to create Online Group Telegram invite", error);
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

  if (currentToken && !(context.reissue && isSpentToken(currentToken, now))) {
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
  accessStartsAt,
  chatId,
  paymentRecord,
  purchase,
  reissue,
}: {
  accessExpiresAt: string;
  accessKey: OnlineGroupAccessKey;
  /**
   * A Hub period's start: null while it waits for its predecessor, absent for
   * accesses that begin with the payment.
   */
  accessStartsAt?: Date | null;
  chatId: string;
  paymentRecord: PaymentRecordSnapshot;
  purchase: OnlineGroupPurchase;
  reissue: boolean;
}): Promise<OnlineGroupAccessItem> => {
  if (await isClassifiedAccessRevoked({ accessKey, purchaseId: purchase.id })) {
    return createAccessItem({ accessExpiresAt, accessKey, status: "unavailable" });
  }

  const now = new Date();
  // A Hub purchase names its owner on the purchase itself (А4/А5).
  const expectedTelegramUserId =
    paymentRecord.telegram_user_id.trim() || purchase.telegramUserId?.trim() || "";
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
    reissue,
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

  // A reissue is asked for because the member is not in the chat, whatever an old
  // binding still says.
  if (accessKey === "inspiration-hub" && accessTelegramUserId && !reissue) {
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

  // HUB-D37: a paid period that has not begun gets its invite on its start day from
  // the daily job; an earlier invite would let the buyer in for free until then.
  // Someone already in the Hub on another basis was answered "active" above.
  if (
    accessStartsAt !== undefined &&
    (accessStartsAt === null || accessStartsAt.getTime() > now.getTime())
  ) {
    return createAccessItem({
      accessExpiresAt,
      accessKey,
      accessStartsAt: accessStartsAt?.toISOString() ?? "",
      status: "scheduled",
    });
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
        logSafeError("Failed to revoke an unpersisted Online Group invite", revokeError);
      }
    }

    throw error;
  }
};

/**
 * А9: a Hub purchase gets one personal invite into the shared Hub chat for the paid
 * period the access job (А4) wrote; without that period there is nothing to deliver
 * yet. The invite lives until the period ends, at most 30 days; a buyer already in
 * the Hub gets none. Expiry and revocation belong to the cron.
 */
const ensureHubPurchaseAccess = async (
  paymentRecord: PaymentRecordSnapshot,
  purchase: OnlineGroupPurchase,
  reissue: boolean,
): Promise<OnlineGroupAccessItem[]> => {
  const [right] = await getDatabase()
    .select({
      expiresAt: accessEntitlements.expiresAt,
      startsAt: accessEntitlements.startsAt,
    })
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchase.id),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        eq(accessEntitlements.sourceKind, "standalone_hub"),
      ),
    )
    .limit(1);

  if (!right) {
    return [];
  }

  const accessExpiresAt = right.expiresAt?.toISOString() ?? "";
  const hubChatId = await findInspirationHubChatId(getDatabase());

  if (!hubChatId) {
    console.error("Inspiration Hub chat is not configured; no invite issued", {
      purchaseId: purchase.id,
    });
    return [
      createAccessItem({
        accessExpiresAt,
        accessKey: "inspiration-hub",
        status: "unavailable",
      }),
    ];
  }

  return [
    await ensureTargetAccess({
      accessExpiresAt,
      accessKey: "inspiration-hub",
      accessStartsAt: right.startsAt,
      chatId: hubChatId,
      paymentRecord,
      purchase,
      reissue,
    }),
  ];
};

/**
 * К10: the Hub of a Plus in the period model ends where its cohort closure recorded
 * the end on the right itself; the copy on the purchase is the old campaign deadline
 * and may still lie ahead, which would hand out an invite after the access ended.
 */
const findPlusHubEnd = async (purchase: OnlineGroupPurchase): Promise<Date | null> => {
  const [right] = await getDatabase()
    .select({
      expiresAt: accessEntitlements.expiresAt,
      sourceKind: accessEntitlements.sourceKind,
    })
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchase.id),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
      ),
    )
    .limit(1);

  return right?.sourceKind === "online_group" && right.expiresAt
    ? right.expiresAt
    : purchase.inspirationAccessExpiresAtSnapshot;
};

const ensureOnlineGroupAccessForPaymentInternal = async (
  paymentRecord: PaymentRecordSnapshot,
  reissue: boolean,
): Promise<OnlineGroupAccessItem[] | null> => {
  if (
    !isGroupInviteOfferId(paymentRecord.offer_id) ||
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

  if (isInspirationHubOfferId(paymentRecord.offer_id)) {
    return ensureHubPurchaseAccess(paymentRecord, purchase, reissue);
  }

  const targets = getAccessTargets(paymentRecord, {
    inspirationAccessExpiresAt: await findPlusHubEnd(purchase),
    inspirationChatId: purchase.inspirationChatIdSnapshot,
  });

  return Promise.all(
    targets.map((target) =>
      ensureTargetAccess({
        ...target,
        paymentRecord,
        purchase,
        reissue,
      }),
    ),
  );
};

/**
 * The invites of an Online or Hub purchase. With `reissue` (admin only, HUB-D38) a
 * used or burnt invite of a still running access is replaced by a fresh one; an
 * ended or revoked access still gets none.
 */
export const ensureOnlineGroupAccessForPayment = (
  paymentRecord: PaymentRecordSnapshot,
  { reissue = false }: { reissue?: boolean } = {},
): Promise<OnlineGroupAccessItem[] | null> => {
  const paymentIntentId = paymentRecord.payment_intent_id.trim();

  // A reissue must not join a concurrent ordinary ensure, which would return the
  // spent invite again.
  if (!paymentIntentId || reissue) {
    return ensureOnlineGroupAccessForPaymentInternal(paymentRecord, reissue);
  }

  const pendingEnsure = pendingOnlineGroupAccessEnsures.get(paymentIntentId);

  if (pendingEnsure) {
    return pendingEnsure;
  }

  const ensurePromise = ensureOnlineGroupAccessForPaymentInternal(
    paymentRecord,
    false,
  ).finally(() => {
    if (pendingOnlineGroupAccessEnsures.get(paymentIntentId) === ensurePromise) {
      pendingOnlineGroupAccessEnsures.delete(paymentIntentId);
    }
  });

  pendingOnlineGroupAccessEnsures.set(paymentIntentId, ensurePromise);

  return ensurePromise;
};

/** Removes a member with a short ban so the same person can rejoin later. */
export const kickUnexpectedMember = async (
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

  // А5: the purchase learns its owner at the first join, under the owner lock the
  // Hub period writers take, and only into an empty field.
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
      logSafeError("Failed to revoke a used Online Group invite", error);
    }
  }

  return true;
};
