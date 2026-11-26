import { randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";

import { isInspirationHubOfferId } from "@/constants/sellable-products";
import { getDatabase } from "@/db/client";
import { findInspirationHubChatId } from "@/db/hub-access-coverage";
import {
  accessEntitlements,
  purchases,
  telegramAccessTokens,
  telegramUserBindings,
} from "@/db/schema";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { isStartDayReached } from "@/lib/inspiration-hub/calendar";
import type { PaymentRecordSnapshot } from "@/lib/payment-record";
import { logSafeError } from "@/lib/safe-error-log";
import { DAY_MS } from "@/lib/time";

import { hashAccessToken } from "./access-records";
import {
  createTelegramChatInviteLink,
  isUnknownChatParticipantError,
  revokeTelegramChatInviteLink,
  unbanTelegramChatMember,
} from "./bot-api";
import { getOnlineGroupIdentityReuseLookup } from "./identity-reuse-policy";
import {
  findStandaloneHubRight,
  getPlusAccessTargets,
  getPurchase,
  isGroupInviteOfferId,
  type OnlineGroupAccessKey,
  type OnlineGroupPurchase,
  toPersistedAccessKey,
  upsertBinding,
  upsertEntitlement,
} from "./online-group-access-records";

const INVITE_TTL_MS = 30 * DAY_MS;

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
const pendingOnlineGroupAccessEnsures = new Map<
  string,
  Promise<OnlineGroupAccessItem[] | null>
>();

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

/** A renewal invitation gives no invite before its page has confirmed the Telegram account. */
const isUnconfirmedRenewalInvitation = (purchase: OnlineGroupPurchase) =>
  purchase.source === "admin_offer_link" &&
  purchase.invitationKind === "renewal" &&
  !purchase.telegramUserId?.trim();

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

  // Only lifts an old short ban so the new invite works. Telegram refuses it for an
  // account it does not find in this chat (PARTICIPANT_ID_INVALID, 2026-11-20), and
  // such an account has no ban to lift: the invite must not depend on it.
  try {
    await unbanTelegramChatMember({
      chatId,
      onlyIfBanned: true,
      userId: telegramUserId,
    });
  } catch (error) {
    // Every first invite into a chat gets this answer: not a failure (2026-11-23).
    if (isUnknownChatParticipantError(error)) return;
    logSafeError("Failed to unban a member before an Online Group invite", error);
  }
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
    tokenHash: hashAccessToken(invite.invite_link),
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
    (accessStartsAt === null || !isStartDayReached(accessStartsAt, now))
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
  const right = await findStandaloneHubRight(purchase.id);

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

  if (!purchase || isUnconfirmedRenewalInvitation(purchase)) {
    return [];
  }

  if (isInspirationHubOfferId(paymentRecord.offer_id)) {
    return ensureHubPurchaseAccess(paymentRecord, purchase, reissue);
  }

  const targets = await getPlusAccessTargets(paymentRecord, purchase);

  // HUB-D49 (replaces HUB-D43): Plus opens the library right at payment; the days
  // before the cohort starts are a gift, so both invites go out at once.
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
