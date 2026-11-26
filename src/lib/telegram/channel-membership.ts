import type { PaymentRecordSnapshot } from "@/lib/payment-record";
import { logSafeError } from "@/lib/safe-error-log";
import { toUtcIso } from "@/lib/time";

import {
  claimTelegramAccessTokenRecord,
  findLatestTelegramAccessTokenRecordByPaymentIntentId,
  findPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenHash,
  findTelegramUserBindingByPaymentIntentId,
  findTelegramUserBindingsByTelegramUserIdAndChatId,
  persistTelegramPaymentAccess,
  upsertTelegramAccessTokenRecord,
  upsertTelegramUserBindingRecord,
} from "./access-persistence";
import { hashAccessToken } from "./access-records";
import { kickUnexpectedMember, shouldIgnoreKickFailure } from "./bot-api";
import {
  getPaymentAccessExpiresAtIso,
  isIsoExpired,
  isOfferEligibleForTelegramAccessLink,
  isPaymentTimedTelegramAccess,
} from "./channel-access-rules";

type SyncTelegramChannelMembershipResult = {
  handled: boolean;
  reason?: string;
};

type TelegramAccessTokenRecord = NonNullable<
  Awaited<ReturnType<typeof findLatestTelegramAccessTokenRecordByPaymentIntentId>>
>;

type TelegramUserBindingRecord = NonNullable<
  Awaited<ReturnType<typeof findTelegramUserBindingByPaymentIntentId>>
>;

type TelegramMembershipIdentity = {
  normalizedChatId: string;
  normalizedUserId: string;
  normalizedUsername: string;
  now: string;
};

type TelegramJoinAccessContext = {
  accessExpiresAt: string;
  existingBinding: TelegramUserBindingRecord | null;
  hasTimedAccess: boolean;
  paymentRecord: PaymentRecordSnapshot;
  paymentRecordWithWindow: PaymentRecordSnapshot;
};

const updatePaymentAccessWindow = async (
  paymentRecord: PaymentRecordSnapshot,
  now: string,
) => {
  const computedAccessExpiresAt = getPaymentAccessExpiresAtIso(paymentRecord);

  if (!computedAccessExpiresAt) {
    return {
      accessExpiresAt: "",
      paymentRecord,
    };
  }

  if (paymentRecord.telegram_access_expires_at === computedAccessExpiresAt) {
    return {
      accessExpiresAt: computedAccessExpiresAt,
      paymentRecord,
    };
  }

  const nextPaymentRecord = await persistTelegramPaymentAccess({
    patch: {
      telegram_access_expires_at: computedAccessExpiresAt,
      updated_at: now,
    },
    paymentRecord,
  });

  return {
    accessExpiresAt: computedAccessExpiresAt,
    paymentRecord: nextPaymentRecord,
  };
};

const startTimedAccessWindowOnJoin = async (
  paymentRecord: PaymentRecordSnapshot,
  now: string,
) => {
  if (!isPaymentTimedTelegramAccess(paymentRecord)) {
    return {
      accessExpiresAt: "",
      paymentRecord,
    };
  }

  if (paymentRecord.telegram_access_expires_at.trim()) {
    return {
      accessExpiresAt: paymentRecord.telegram_access_expires_at.trim(),
      paymentRecord,
    };
  }

  // Choreo channel access starts when the buyer actually joins, not when they pay.
  // That keeps the purchased access window fair if they open the invite later.
  const joinedAt = paymentRecord.telegram_token_used_at.trim() || now;
  const paymentRecordWithJoinTimestamp = paymentRecord.telegram_token_used_at.trim()
    ? paymentRecord
    : await persistTelegramPaymentAccess({
        patch: {
          telegram_token_used_at: joinedAt,
          updated_at: joinedAt,
        },
        paymentRecord,
      });

  if (paymentRecordWithJoinTimestamp.telegram_access_expires_at.trim()) {
    return {
      accessExpiresAt: paymentRecordWithJoinTimestamp.telegram_access_expires_at.trim(),
      paymentRecord: paymentRecordWithJoinTimestamp,
    };
  }

  return updatePaymentAccessWindow(paymentRecordWithJoinTimestamp, now);
};

const syncTelegramMemberLeft = async ({
  normalizedChatId,
  normalizedUserId,
  now,
}: Pick<
  TelegramMembershipIdentity,
  "normalizedChatId" | "normalizedUserId" | "now"
>): Promise<SyncTelegramChannelMembershipResult> => {
  const relatedBindings = await findTelegramUserBindingsByTelegramUserIdAndChatId({
    chatId: normalizedChatId,
    telegramUserId: normalizedUserId,
  });
  const activeBindings = relatedBindings.filter((binding) => binding.status === "active");

  if (activeBindings.length === 0) {
    return {
      handled: false,
      reason: "no_active_bindings",
    };
  }

  for (const binding of activeBindings) {
    await upsertTelegramUserBindingRecord({
      ...binding,
      last_seen_at: now,
      revoked_at: now,
      revoked_reason: "left_channel",
      status: "left",
    });

    const paymentRecord = await findPaymentRecordByIntentId(binding.payment_intent_id);

    if (!paymentRecord) {
      continue;
    }

    await persistTelegramPaymentAccess({
      patch: {
        telegram_access_revoked_at: now,
        telegram_access_status: "left_channel",
        updated_at: now,
      },
      paymentRecord,
    });
  }

  return {
    handled: true,
  };
};

const resolveTelegramJoinRecords = async ({
  normalizedInviteLink,
}: {
  normalizedInviteLink: string;
}): Promise<
  | {
      paymentRecord: null;
      resolvedResult: SyncTelegramChannelMembershipResult;
      tokenRecord: null;
    }
  | {
      paymentRecord: PaymentRecordSnapshot;
      resolvedResult: null;
      tokenRecord: TelegramAccessTokenRecord;
    }
> => {
  // By hash: the clear link is erased once the token is used or expires (HARD-03).
  const tokenRecord = await findTelegramAccessTokenRecordByTokenHash(
    hashAccessToken(normalizedInviteLink),
  );

  if (!tokenRecord || tokenRecord.link_kind !== "channel_invite") {
    return {
      paymentRecord: null,
      resolvedResult: {
        handled: false,
        reason: "invite_link_not_tracked",
      },
      tokenRecord: null,
    };
  }

  const paymentRecord = await findPaymentRecordByIntentId(tokenRecord.payment_intent_id);

  if (
    !paymentRecord ||
    paymentRecord.outcome !== "succeeded" ||
    !isOfferEligibleForTelegramAccessLink(paymentRecord.offer_id)
  ) {
    await upsertTelegramAccessTokenRecord({
      ...tokenRecord,
      last_error: "payment_not_available",
      status: "revoked",
    });

    return {
      paymentRecord: null,
      resolvedResult: {
        handled: false,
        reason: "payment_not_available",
      },
      tokenRecord: null,
    };
  }

  return {
    paymentRecord,
    resolvedResult: null,
    tokenRecord,
  };
};

// One moment per join: the window starts at the same time the join is stamped with.
const prepareTelegramJoinAccess = async (
  paymentRecord: PaymentRecordSnapshot,
  now: string,
): Promise<TelegramJoinAccessContext> => {
  const hasTimedAccess = isPaymentTimedTelegramAccess(paymentRecord);
  const paymentRecordWithWindow = hasTimedAccess
    ? (await startTimedAccessWindowOnJoin(paymentRecord, now)).paymentRecord
    : paymentRecord;
  const accessExpiresAt = hasTimedAccess
    ? getPaymentAccessExpiresAtIso(paymentRecordWithWindow)
    : "";
  const existingBinding = await findTelegramUserBindingByPaymentIntentId(
    paymentRecord.payment_intent_id,
  );

  return {
    accessExpiresAt,
    existingBinding,
    hasTimedAccess,
    paymentRecord,
    paymentRecordWithWindow,
  };
};

const tryRemoveRejectedTelegramMember = async ({
  errorMessage,
  ignoreMissingMember,
  normalizedChatId,
  normalizedUserId,
}: Pick<TelegramMembershipIdentity, "normalizedChatId" | "normalizedUserId"> & {
  errorMessage: string;
  ignoreMissingMember?: boolean;
}): Promise<void> => {
  try {
    await kickUnexpectedMember(normalizedChatId, normalizedUserId);
  } catch (error) {
    if (ignoreMissingMember && shouldIgnoreKickFailure(error)) {
      return;
    }

    logSafeError(errorMessage, error);
  }
};

const isInviteClaimedByAnotherUser = ({
  normalizedUserId,
  tokenRecord,
}: Pick<TelegramMembershipIdentity, "normalizedUserId"> & {
  tokenRecord: TelegramAccessTokenRecord;
}) =>
  tokenRecord.status === "used" &&
  Boolean(tokenRecord.telegram_user_id.trim()) &&
  tokenRecord.telegram_user_id !== normalizedUserId;

const hasClosedBindingForSameUser = ({
  existingBinding,
  normalizedUserId,
  tokenRecord,
}: Pick<TelegramMembershipIdentity, "normalizedUserId"> & {
  existingBinding: TelegramUserBindingRecord | null;
  tokenRecord: TelegramAccessTokenRecord;
}) =>
  tokenRecord.status === "used" &&
  existingBinding?.telegram_user_id.trim() === normalizedUserId &&
  (existingBinding.status === "left" || existingBinding.status === "revoked");

const isBindingClaimedByAnotherUser = ({
  existingBinding,
  normalizedUserId,
}: Pick<TelegramMembershipIdentity, "normalizedUserId"> & {
  existingBinding: TelegramUserBindingRecord | null;
}) =>
  Boolean(existingBinding?.telegram_user_id.trim()) &&
  existingBinding?.telegram_user_id !== normalizedUserId;

const revokeExpiredTelegramMembership = async ({
  accessContext,
  identity,
  normalizedInviteLink,
  tokenRecord,
}: {
  accessContext: TelegramJoinAccessContext;
  identity: TelegramMembershipIdentity;
  normalizedInviteLink: string;
  tokenRecord: TelegramAccessTokenRecord;
}): Promise<SyncTelegramChannelMembershipResult> => {
  await tryRemoveRejectedTelegramMember({
    errorMessage: "Failed to remove expired Telegram member",
    ignoreMissingMember: true,
    normalizedChatId: identity.normalizedChatId,
    normalizedUserId: identity.normalizedUserId,
  });

  await upsertTelegramAccessTokenRecord({
    ...tokenRecord,
    last_error: "",
    status: "expired",
  });

  await upsertTelegramUserBindingRecord({
    access_expires_at: accessContext.accessExpiresAt,
    bound_at: accessContext.existingBinding?.bound_at || identity.now,
    chat_id: identity.normalizedChatId,
    customer_email: accessContext.paymentRecord.customer_email,
    invite_link: normalizedInviteLink,
    last_seen_at: identity.now,
    offer_id: accessContext.paymentRecord.offer_id,
    payment_intent_id: accessContext.paymentRecord.payment_intent_id,
    product_id: accessContext.paymentRecord.product_id,
    revoked_at: identity.now,
    revoked_reason: "expired",
    status: "revoked",
    telegram_user_id: identity.normalizedUserId,
    telegram_username: identity.normalizedUsername,
  });

  await persistTelegramPaymentAccess({
    patch: {
      telegram_access_revoked_at: identity.now,
      telegram_access_status: "revoked",
      telegram_channel_chat_id: identity.normalizedChatId,
      telegram_user_id: identity.normalizedUserId,
      telegram_username: identity.normalizedUsername,
      updated_at: identity.now,
    },
    paymentRecord: accessContext.paymentRecordWithWindow,
  });

  return {
    handled: true,
  };
};

const activateTelegramMembership = async ({
  accessContext,
  identity,
  normalizedInviteLink,
  tokenRecord,
}: {
  accessContext: TelegramJoinAccessContext;
  identity: TelegramMembershipIdentity;
  normalizedInviteLink: string;
  tokenRecord: TelegramAccessTokenRecord;
}): Promise<SyncTelegramChannelMembershipResult> => {
  const accessExpiresAt = accessContext.hasTimedAccess
    ? accessContext.accessExpiresAt
    : "";
  const claimResult = await claimTelegramAccessTokenRecord({
    accessExpiresAt,
    chatId: identity.normalizedChatId,
    claimedAt: identity.now,
    telegramUserId: identity.normalizedUserId,
    telegramUsername: identity.normalizedUsername,
    tokenHash: tokenRecord.token_hash,
  });

  if (
    claimResult.status !== "claimed" &&
    claimResult.status !== "already_claimed_by_user"
  ) {
    await tryRemoveRejectedTelegramMember({
      errorMessage: "Failed to remove user after rejected Telegram token claim",
      ignoreMissingMember: true,
      normalizedChatId: identity.normalizedChatId,
      normalizedUserId: identity.normalizedUserId,
    });

    return {
      handled: false,
      reason:
        claimResult.status === "claimed_by_another_user"
          ? "invite_claimed_by_another_user"
          : claimResult.status === "expired"
            ? "invite_expired"
            : "invite_link_not_available",
    };
  }

  await Promise.all([
    upsertTelegramUserBindingRecord({
      access_expires_at: accessExpiresAt,
      bound_at: accessContext.existingBinding?.bound_at || identity.now,
      chat_id: identity.normalizedChatId,
      customer_email: accessContext.paymentRecord.customer_email,
      invite_link: normalizedInviteLink,
      last_seen_at: identity.now,
      offer_id: accessContext.paymentRecord.offer_id,
      payment_intent_id: accessContext.paymentRecord.payment_intent_id,
      product_id: accessContext.paymentRecord.product_id,
      revoked_at: "",
      revoked_reason: "",
      status: "active",
      telegram_user_id: identity.normalizedUserId,
      telegram_username: identity.normalizedUsername,
    }),
    persistTelegramPaymentAccess({
      patch: {
        telegram_access_expires_at: accessExpiresAt,
        telegram_access_revoked_at: "",
        telegram_access_status: "activated",
        telegram_channel_chat_id: identity.normalizedChatId,
        telegram_token_expires_at: tokenRecord.expires_at,
        telegram_token_id: tokenRecord.token_id,
        telegram_token_used_at: identity.now,
        telegram_user_id: identity.normalizedUserId,
        telegram_username: identity.normalizedUsername,
        updated_at: identity.now,
      },
      paymentRecord: accessContext.paymentRecordWithWindow,
    }),
  ]);

  return {
    handled: true,
  };
};

const syncTelegramMemberJoined = async ({
  identity,
  inviteLink,
}: {
  identity: TelegramMembershipIdentity;
  inviteLink?: string | null;
}): Promise<SyncTelegramChannelMembershipResult> => {
  const normalizedInviteLink = inviteLink?.trim() ?? "";

  if (!normalizedInviteLink) {
    return {
      handled: false,
      reason: "missing_invite_link",
    };
  }

  const joinRecords = await resolveTelegramJoinRecords({
    normalizedInviteLink,
  });

  if (joinRecords.resolvedResult) {
    return joinRecords.resolvedResult;
  }

  const { paymentRecord, tokenRecord } = joinRecords;
  const accessContext = await prepareTelegramJoinAccess(paymentRecord, identity.now);
  const rejectionContext = {
    normalizedChatId: identity.normalizedChatId,
    normalizedUserId: identity.normalizedUserId,
  };

  if (
    isInviteClaimedByAnotherUser({
      normalizedUserId: identity.normalizedUserId,
      tokenRecord,
    })
  ) {
    await tryRemoveRejectedTelegramMember({
      ...rejectionContext,
      errorMessage: "Failed to remove user with claimed Telegram invite",
    });

    return {
      handled: false,
      reason: "invite_claimed_by_another_user",
    };
  }

  if (
    hasClosedBindingForSameUser({
      existingBinding: accessContext.existingBinding,
      normalizedUserId: identity.normalizedUserId,
      tokenRecord,
    })
  ) {
    await tryRemoveRejectedTelegramMember({
      ...rejectionContext,
      errorMessage: "Failed to remove user with closed Telegram binding",
    });
    await upsertTelegramAccessTokenRecord({
      ...tokenRecord,
      last_error: "rejoin_not_allowed",
      status: "used",
    });

    return {
      handled: false,
      reason: "rejoin_not_allowed",
    };
  }

  if (
    isBindingClaimedByAnotherUser({
      existingBinding: accessContext.existingBinding,
      normalizedUserId: identity.normalizedUserId,
    })
  ) {
    await tryRemoveRejectedTelegramMember({
      ...rejectionContext,
      errorMessage: "Failed to remove user with conflicting Telegram binding",
    });

    return {
      handled: false,
      reason: "binding_claimed_by_another_user",
    };
  }

  if (accessContext.hasTimedAccess && isIsoExpired(accessContext.accessExpiresAt)) {
    return revokeExpiredTelegramMembership({
      accessContext,
      identity,
      normalizedInviteLink,
      tokenRecord,
    });
  }

  return activateTelegramMembership({
    accessContext,
    identity,
    normalizedInviteLink,
    tokenRecord,
  });
};

export const syncTelegramChannelMembership = async ({
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
}): Promise<SyncTelegramChannelMembershipResult> => {
  const normalizedChatId = chatId.trim();
  const normalizedUserId = telegramUserId.trim();
  const normalizedUsername = telegramUsername?.trim() ?? "";
  const now = toUtcIso();
  const identity: TelegramMembershipIdentity = {
    normalizedChatId,
    normalizedUserId,
    normalizedUsername,
    now,
  };

  if (!normalizedChatId || !normalizedUserId) {
    return {
      handled: false,
      reason: "missing_chat_or_user",
    };
  }

  if (membershipStatus === "left") {
    return syncTelegramMemberLeft({
      normalizedChatId,
      normalizedUserId,
      now,
    });
  }

  return syncTelegramMemberJoined({
    identity,
    inviteLink,
  });
};
