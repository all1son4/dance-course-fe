import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, gt, lte, sql } from "drizzle-orm";

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
import { isOnlineGroupAccessOfferId } from "./offer-access";

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TEMP_KICK_SECONDS = 35;

type OnlineGroupAccessKey = "inspiration-hub" | "main-group";
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
const pendingOnlineGroupAccessEnsures = new Map<
  string,
  Promise<OnlineGroupAccessItem[] | null>
>();

const hashInvite = (value: string) => createHash("sha256").update(value).digest("hex");

const getAccessTargets = (paymentRecord: PaymentSheetRecord) => {
  const mainChatId = paymentRecord.telegram_channel_chat_id.trim();
  const inspirationChatId = paymentRecord.telegram_inspiration_chat_id.trim();
  const inspirationAccessExpiresAt =
    paymentRecord.telegram_inspiration_access_expires_at.trim();
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

  if (
    isOnlineGroupLibraryOfferId(paymentRecord.offer_id) &&
    inspirationChatId &&
    inspirationAccessExpiresAt
  ) {
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
  purchase: NonNullable<Awaited<ReturnType<typeof getPurchase>>>;
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
  purchase: NonNullable<Awaited<ReturnType<typeof getPurchase>>>;
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
        gt(telegramUserBindings.accessExpiresAt, new Date()),
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
  purchase: NonNullable<Awaited<ReturnType<typeof getPurchase>>>;
  telegramUserId: string;
  telegramUsername: string;
}) => {
  if (telegramUserId) {
    return {
      telegramUserId,
      telegramUsername,
    };
  }

  const customerMatch = purchase.customerId
    ? eq(purchases.customerId, purchase.customerId)
    : purchase.customerEmailSnapshot
      ? eq(purchases.customerEmailSnapshot, purchase.customerEmailSnapshot)
      : null;

  if (!customerMatch) {
    return null;
  }

  const [knownBinding] = await getDatabase()
    .select({
      telegramUserId: telegramUserBindings.telegramUserId,
      telegramUsername: telegramUserBindings.telegramUsername,
    })
    .from(telegramUserBindings)
    .innerJoin(purchases, eq(telegramUserBindings.purchaseId, purchases.id))
    .where(and(eq(telegramUserBindings.chatId, chatId), customerMatch))
    .orderBy(desc(telegramUserBindings.lastSeenAt))
    .limit(1);
  const knownTelegramUserId = knownBinding?.telegramUserId.trim() ?? "";

  if (!knownTelegramUserId) {
    return null;
  }

  return {
    telegramUserId: knownTelegramUserId,
    telegramUsername: knownBinding?.telegramUsername?.trim() ?? "",
  };
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
  purchase: NonNullable<Awaited<ReturnType<typeof getPurchase>>>;
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

    return {
      accessExpiresAt,
      accessKey,
      accessUrl: "",
      status: "expired",
      tokenExpiresAt: "",
    };
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

      return {
        accessExpiresAt,
        accessKey,
        accessUrl: "",
        status: "active",
        tokenExpiresAt: "",
      };
    }
  }

  const inviteLockKey = `online-group-invite:${purchase.id}:${chatId}`;
  let generatedInviteLink = "";

  try {
    return await getDatabase().transaction(async (tx) => {
      // Email delivery and the success page can request the same invite concurrently.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${inviteLockKey}, 0))`,
      );

      const currentToken = await findCurrentToken({
        chatId,
        database: tx,
        purchaseId: purchase.id,
      });

      if (currentToken) {
        if (currentToken.status === "used") {
          return {
            accessExpiresAt,
            accessKey,
            accessUrl: "",
            status: "active",
            tokenExpiresAt: currentToken.expiresAt.toISOString(),
          };
        }

        const isExpired =
          currentToken.status === "expired" ||
          currentToken.expiresAt.getTime() <= Date.now();

        if (isExpired) {
          if (currentToken.status !== "expired") {
            await tx
              .update(telegramAccessTokens)
              .set({ status: "expired", updatedAt: now })
              .where(eq(telegramAccessTokens.id, currentToken.id));
          }

          return {
            accessExpiresAt,
            accessKey,
            accessUrl: "",
            status: "expired",
            tokenExpiresAt: currentToken.expiresAt.toISOString(),
          };
        }

        if (currentToken.status === "issued" && currentToken.tokenValue) {
          if (accessTelegramUserId) {
            await unbanTelegramChatMember({
              chatId,
              onlyIfBanned: true,
              userId: accessTelegramUserId,
            });
          }

          return {
            accessExpiresAt,
            accessKey,
            accessUrl: currentToken.tokenValue,
            status: "ready",
            tokenExpiresAt: currentToken.expiresAt.toISOString(),
          };
        }

        return {
          accessExpiresAt,
          accessKey,
          accessUrl: "",
          status: "unavailable",
          tokenExpiresAt: currentToken.expiresAt.toISOString(),
        };
      }

      if (accessTelegramUserId) {
        await unbanTelegramChatMember({
          chatId,
          onlyIfBanned: true,
          userId: accessTelegramUserId,
        });
      }

      const tokenId = `tgi_${randomBytes(8).toString("hex")}`;
      const inviteExpiresAt = Date.now() + INVITE_TTL_MS;
      const accessExpiryTime = accessExpiresAt
        ? Date.parse(accessExpiresAt)
        : Number.POSITIVE_INFINITY;
      const expiresAt = new Date(Math.min(inviteExpiresAt, accessExpiryTime));

      let invite: Awaited<ReturnType<typeof createTelegramChatInviteLink>>;

      try {
        invite = await createTelegramChatInviteLink({
          chatId,
          expireDateUnix: Math.floor(expiresAt.getTime() / 1000),
          memberLimit: 1,
          name: tokenId,
        });
        generatedInviteLink = invite.invite_link;
      } catch (error) {
        console.error("Failed to create Online Group Telegram invite", {
          accessKey,
          chatId,
          error,
          paymentIntentId: purchase.paymentIntentId,
        });
        await upsertEntitlement({
          accessExpiresAt,
          accessKey,
          chatId,
          database: tx,
          purchase,
          status: "link_failed",
          telegramUserId: accessTelegramUserId,
          telegramUsername: accessTelegramUsername,
        });

        return {
          accessExpiresAt,
          accessKey,
          accessUrl: "",
          status: "unavailable",
          tokenExpiresAt: "",
        };
      }

      const entitlement = await upsertEntitlement({
        accessExpiresAt,
        accessKey,
        chatId,
        database: tx,
        purchase,
        status: "token_issued",
        telegramUserId: accessTelegramUserId,
        telegramUsername: accessTelegramUsername,
        tokenId,
      });

      await tx.insert(telegramAccessTokens).values({
        accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
        chatId,
        customerEmailSnapshot: purchase.customerEmailSnapshot,
        entitlementId: entitlement?.id ?? null,
        expiresAt,
        lastError: null,
        linkKind: "channel_invite",
        offerId: purchase.offerId,
        productId: purchase.productId,
        purchaseId: purchase.id,
        status: "issued",
        telegramUserId: accessTelegramUserId || null,
        telegramUsername: accessTelegramUsername || null,
        tokenHash: hashInvite(invite.invite_link),
        tokenId,
        tokenValue: invite.invite_link,
      });

      return {
        accessExpiresAt,
        accessKey,
        accessUrl: invite.invite_link,
        status: "ready",
        tokenExpiresAt: expiresAt.toISOString(),
      };
    });
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

  const targets = getAccessTargets(paymentRecord);

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

const kickUnexpectedMember = async (chatId: string, telegramUserId: string) => {
  await banTelegramChatMember({
    chatId,
    untilDateUnix: Math.floor(Date.now() / 1000) + TEMP_KICK_SECONDS,
    userId: telegramUserId,
  });
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
}) => {
  const db = getDatabase();
  const normalizedChatId = chatId.trim();
  const normalizedUserId = telegramUserId.trim();
  const normalizedUsername = telegramUsername?.trim() ?? "";
  const now = new Date();

  if (membershipStatus === "left") {
    const bindings = await db
      .select({ binding: telegramUserBindings, purchase: purchases })
      .from(telegramUserBindings)
      .innerJoin(purchases, eq(telegramUserBindings.purchaseId, purchases.id))
      .where(
        and(
          eq(telegramUserBindings.chatId, normalizedChatId),
          eq(telegramUserBindings.telegramUserId, normalizedUserId),
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
      onlineGroupBindings.map(async ({ binding }) => {
        await db
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
          await db
            .update(accessEntitlements)
            .set({ status: "left_channel", updatedAt: now })
            .where(eq(accessEntitlements.id, binding.entitlementId));
        }
      }),
    );

    return true;
  }

  const normalizedInviteLink = inviteLink?.trim() ?? "";

  if (!normalizedInviteLink) {
    return false;
  }

  const inviteHash = hashInvite(normalizedInviteLink);
  const membershipLockKey = `online-group-membership:${inviteHash}`;
  const membershipResult = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${membershipLockKey}, 0))`,
    );

    const [row] = await tx
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
    const siblingBindings = await tx
      .select()
      .from(telegramUserBindings)
      .where(eq(telegramUserBindings.purchaseId, purchase.id));
    const expectedUserId =
      token.telegramUserId?.trim() ||
      siblingBindings.find((binding) => binding.telegramUserId.trim())?.telegramUserId ||
      "";
    const accessExpired =
      token.accessExpiresAt && token.accessExpiresAt.getTime() <= now.getTime();
    const isFirstUse = token.status === "issued";
    const isRepeatForBoundUser =
      token.status === "used" &&
      Boolean(expectedUserId) &&
      expectedUserId === normalizedUserId;

    if (
      purchase.outcome !== "succeeded" ||
      token.chatId !== normalizedChatId ||
      token.expiresAt.getTime() <= now.getTime() ||
      accessExpired ||
      (!isFirstUse && !isRepeatForBoundUser) ||
      (expectedUserId && expectedUserId !== normalizedUserId)
    ) {
      return {
        handled: true,
        shouldKick: true,
        shouldRevokeInvite: false,
      };
    }

    if (isFirstUse) {
      await tx
        .update(telegramAccessTokens)
        .set({
          status: "used",
          telegramUserId: normalizedUserId,
          telegramUsername: normalizedUsername || null,
          updatedAt: now,
          usedAt: now,
        })
        .where(
          and(
            eq(telegramAccessTokens.id, token.id),
            eq(telegramAccessTokens.status, "issued"),
          ),
        );
      await tx
        .update(telegramAccessTokens)
        .set({
          telegramUserId: normalizedUserId,
          telegramUsername: normalizedUsername || null,
          updatedAt: now,
        })
        .where(
          and(
            eq(telegramAccessTokens.purchaseId, purchase.id),
            eq(telegramAccessTokens.status, "issued"),
          ),
        );
    }

    const accessKey =
      token.entitlementId &&
      (
        await tx
          .select()
          .from(accessEntitlements)
          .where(eq(accessEntitlements.id, token.entitlementId))
          .limit(1)
      )[0]?.accessKey === "inspiration-hub"
        ? "inspiration-hub"
        : "main-group";
    await upsertEntitlement({
      accessExpiresAt: token.accessExpiresAt?.toISOString() ?? "",
      accessKey,
      chatId: normalizedChatId,
      database: tx,
      purchase,
      status: "activated",
      telegramUserId: normalizedUserId,
      telegramUsername: normalizedUsername,
      tokenId: token.tokenId,
    });
    await upsertBinding({
      accessExpiresAt: token.accessExpiresAt?.toISOString() ?? "",
      chatId: normalizedChatId,
      database: tx,
      inviteLink: normalizedInviteLink,
      purchase,
      telegramUserId: normalizedUserId,
      telegramUsername: normalizedUsername,
    });

    return {
      handled: true,
      shouldKick: false,
      shouldRevokeInvite: isFirstUse,
    };
  });

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

export const revokeExpiredOnlineGroupHubAccess = async () => {
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
          gt(telegramUserBindings.accessExpiresAt, now),
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
