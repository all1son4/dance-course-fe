import { randomBytes } from "node:crypto";

import type { PaymentRecordSnapshot } from "@/lib/payment-record";
import { logSafeError } from "@/lib/safe-error-log";
import { toUtcIso } from "@/lib/time";

import {
  claimTelegramAccessTokenRecord,
  findLatestTelegramAccessTokenRecordByPaymentIntentId,
  findPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenHash,
  findTelegramUserBindingByPaymentIntentId,
  findTelegramUserBindingsByCustomerEmail,
  findTelegramUserBindingsByTelegramUserIdAndChatId,
  persistTelegramPaymentAccess,
  upsertTelegramAccessTokenRecord,
  upsertTelegramUserBindingRecord,
} from "./access-persistence";
import { hashAccessToken } from "./access-records";
import {
  createTelegramChatInviteLink,
  kickUnexpectedMember,
  shouldIgnoreKickFailure,
} from "./bot-api";
import {
  getPaymentAccessExpiresAtIso,
  isIsoExpired,
  isOfferEligibleForTelegramAccessLink,
  isPaymentTimedTelegramAccess,
  parseTimestamp,
} from "./channel-access-rules";
import { getTelegramChannelTargetByOfferId } from "./config";
import { getReusableTimedAccessTelegramBindings } from "./identity-reuse-policy";
import { parsePositiveEnvNumber } from "./offer-access";

type TelegramAccessUnavailableReason =
  | "access_window_expired"
  | "already_activated"
  | "channel_not_configured"
  | "not_succeeded_payment"
  | "offer_not_supported"
  | "telegram_api_failed";

type TelegramAccessLinkResult =
  | {
      accessUrl: string;
      status: "ready";
      tokenExpiresAt: string;
      tokenId: string;
    }
  | {
      accessUrl: null;
      reason: TelegramAccessUnavailableReason;
      status: "not_available";
      tokenExpiresAt: null;
      tokenId: null;
    };

type SyncTelegramChannelMembershipResult = {
  handled: boolean;
  reason?: string;
};

type TelegramAccessLinkCacheEntry = {
  accessUrl: string;
  chatId: string;
  tokenExpiresAt: string;
  tokenId: string;
};

type TelegramAccessTokenRecord = NonNullable<
  Awaited<ReturnType<typeof findLatestTelegramAccessTokenRecordByPaymentIntentId>>
>;

type TelegramUserBindingRecord = NonNullable<
  Awaited<ReturnType<typeof findTelegramUserBindingByPaymentIntentId>>
>;

type TelegramAccessLinkContext = {
  accessExpiresAt: string;
  hasTimedAccess: boolean;
  normalizedChatId: string;
};

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

const DEFAULT_TELEGRAM_ACCESS_LINK_TTL_DAYS = 30;
const pendingTelegramAccessLinkEnsures = new Map<
  string,
  Promise<TelegramAccessLinkResult>
>();
const telegramAccessLinkCache = new Map<string, TelegramAccessLinkCacheEntry>();

const getReadyTelegramAccessLinkResult = ({
  accessUrl,
  tokenExpiresAt,
  tokenId,
}: TelegramAccessLinkCacheEntry): TelegramAccessLinkResult => ({
  accessUrl,
  status: "ready",
  tokenExpiresAt,
  tokenId,
});

const getUnavailableTelegramAccessLinkResult = (
  reason: TelegramAccessUnavailableReason,
): TelegramAccessLinkResult => ({
  accessUrl: null,
  reason,
  status: "not_available",
  tokenExpiresAt: null,
  tokenId: null,
});

const getTelegramAccessLinkTtlDays = () =>
  parsePositiveEnvNumber("TELEGRAM_ACCESS_LINK_TTL_DAYS") ??
  DEFAULT_TELEGRAM_ACCESS_LINK_TTL_DAYS;

const getTelegramAccessLinkTtlMs = () =>
  getTelegramAccessLinkTtlDays() * 24 * 60 * 60 * 1000;

const createTelegramTokenId = () => `tgi_${randomBytes(8).toString("hex")}`;

const getTelegramAccessLinkExpiryIso = (issuedAtIso: string) => {
  const issuedAtTs = parseTimestamp(issuedAtIso) || Date.now();
  const expiresAt = issuedAtTs + getTelegramAccessLinkTtlMs();

  return toUtcIso(new Date(expiresAt));
};

const getUnixSeconds = (value: string) => Math.floor(parseTimestamp(value) / 1000);

const getCachedAccessLink = ({
  chatId,
  paymentIntentId,
}: {
  chatId: string;
  paymentIntentId: string;
}) => {
  const cached = telegramAccessLinkCache.get(paymentIntentId);

  if (!cached) {
    return null;
  }

  if (cached.chatId !== chatId) {
    telegramAccessLinkCache.delete(paymentIntentId);
    return null;
  }

  if (cached.tokenExpiresAt && isIsoExpired(cached.tokenExpiresAt)) {
    telegramAccessLinkCache.delete(paymentIntentId);
    return null;
  }

  return cached;
};

const setCachedAccessLink = ({
  accessUrl,
  chatId,
  paymentIntentId,
  tokenExpiresAt,
  tokenId,
}: {
  accessUrl: string;
  chatId: string;
  paymentIntentId: string;
  tokenExpiresAt: string;
  tokenId: string;
}) => {
  if (!paymentIntentId || !accessUrl) {
    return;
  }

  telegramAccessLinkCache.set(paymentIntentId, {
    accessUrl,
    chatId,
    tokenExpiresAt,
    tokenId,
  });
};

const markTokenAsExpired = async ({
  tokenRecord,
}: {
  tokenRecord: Awaited<ReturnType<typeof findTelegramAccessTokenRecordByTokenHash>>;
}) => {
  if (!tokenRecord || tokenRecord.status === "expired") {
    return;
  }

  await upsertTelegramAccessTokenRecord({
    ...tokenRecord,
    last_error: "",
    status: "expired",
  });
};

const updatePaymentAccessWindow = async (paymentRecord: PaymentRecordSnapshot) => {
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

  const now = toUtcIso();
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

const trySyncPaymentByExistingActiveBinding = async ({
  accessExpiresAt,
  chatId,
  paymentRecord,
}: {
  accessExpiresAt: string;
  chatId: string;
  paymentRecord: PaymentRecordSnapshot;
}) => {
  const customerEmail = paymentRecord.customer_email.trim().toLowerCase();

  if (!customerEmail) {
    return;
  }

  const bindings = await findTelegramUserBindingsByCustomerEmail(customerEmail);
  const reusableBindings = getReusableTimedAccessTelegramBindings({
    bindings,
    chatId,
    nowMs: Date.now(),
  });
  const candidateBinding = reusableBindings[0];

  if (!candidateBinding) {
    return;
  }

  const candidateUserIds = new Set(
    reusableBindings.map((binding) => binding.telegram_user_id.trim()),
  );

  if (candidateUserIds.size > 1) {
    console.warn("Multiple Telegram identities matched timed-access reuse", {
      candidateCount: candidateUserIds.size,
      chatId,
      paymentIntentId: paymentRecord.payment_intent_id,
    });
  }

  const now = toUtcIso();
  const existingBindingForPayment = await findTelegramUserBindingByPaymentIntentId(
    paymentRecord.payment_intent_id,
  );

  await upsertTelegramUserBindingRecord({
    access_expires_at: accessExpiresAt,
    bound_at: existingBindingForPayment?.bound_at || now,
    chat_id: chatId,
    customer_email: paymentRecord.customer_email,
    invite_link: existingBindingForPayment?.invite_link || "",
    last_seen_at: now,
    offer_id: paymentRecord.offer_id,
    payment_intent_id: paymentRecord.payment_intent_id,
    product_id: paymentRecord.product_id,
    revoked_at: "",
    revoked_reason: "",
    status: "active",
    telegram_user_id: candidateBinding.telegram_user_id,
    telegram_username:
      existingBindingForPayment?.telegram_username || candidateBinding.telegram_username,
  });

  const latestPaymentRecord =
    (await findPaymentRecordByIntentId(paymentRecord.payment_intent_id)) ?? paymentRecord;

  await persistTelegramPaymentAccess({
    patch: {
      telegram_access_expires_at: accessExpiresAt,
      telegram_access_revoked_at: "",
      telegram_access_status: "activated",
      telegram_channel_chat_id: chatId,
      telegram_user_id: candidateBinding.telegram_user_id,
      telegram_username:
        latestPaymentRecord.telegram_username || candidateBinding.telegram_username,
      updated_at: now,
    },
    paymentRecord: latestPaymentRecord,
  });
};

const startTimedAccessWindowOnJoin = async (paymentRecord: PaymentRecordSnapshot) => {
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
  const joinedAt = paymentRecord.telegram_token_used_at.trim() || toUtcIso();
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

  return updatePaymentAccessWindow(paymentRecordWithJoinTimestamp);
};

const prepareTelegramAccessLink = (
  paymentRecord: PaymentRecordSnapshot,
):
  | {
      context: TelegramAccessLinkContext;
      unavailableResult: null;
    }
  | {
      context: null;
      unavailableResult: TelegramAccessLinkResult;
    } => {
  if (!isOfferEligibleForTelegramAccessLink(paymentRecord.offer_id)) {
    return {
      context: null,
      unavailableResult: getUnavailableTelegramAccessLinkResult("offer_not_supported"),
    };
  }

  if (paymentRecord.outcome !== "succeeded") {
    return {
      context: null,
      unavailableResult: getUnavailableTelegramAccessLinkResult("not_succeeded_payment"),
    };
  }

  const channelTarget = getTelegramChannelTargetByOfferId({
    lessonLanguage: paymentRecord.lesson_language,
    offerId: paymentRecord.offer_id,
  });

  if (!channelTarget) {
    return {
      context: null,
      unavailableResult: getUnavailableTelegramAccessLinkResult("channel_not_configured"),
    };
  }

  const hasTimedAccess = isPaymentTimedTelegramAccess(paymentRecord);

  return {
    context: {
      accessExpiresAt: hasTimedAccess ? getPaymentAccessExpiresAtIso(paymentRecord) : "",
      hasTimedAccess,
      normalizedChatId: channelTarget.chatId.trim(),
    },
    unavailableResult: null,
  };
};

const resolveCachedOrExpiredAccessLink = async ({
  context,
  paymentRecord,
}: {
  context: TelegramAccessLinkContext;
  paymentRecord: PaymentRecordSnapshot;
}): Promise<TelegramAccessLinkResult | null> => {
  const cachedAccessLink = getCachedAccessLink({
    chatId: context.normalizedChatId,
    paymentIntentId: paymentRecord.payment_intent_id,
  });

  if (cachedAccessLink) {
    return getReadyTelegramAccessLinkResult(cachedAccessLink);
  }

  if (
    context.hasTimedAccess &&
    context.accessExpiresAt &&
    isIsoExpired(context.accessExpiresAt)
  ) {
    const now = toUtcIso();

    await persistTelegramPaymentAccess({
      patch: {
        telegram_access_status: "expired",
        telegram_channel_chat_id: context.normalizedChatId,
        telegram_access_revoked_at: now,
        updated_at: now,
      },
      paymentRecord,
    });

    return getUnavailableTelegramAccessLinkResult("access_window_expired");
  }

  return null;
};

const canReuseTelegramInvite = ({
  isCurrentTokenForTargetChat,
  isIssuedTokenExpired,
  tokenRecord,
}: {
  isCurrentTokenForTargetChat: boolean;
  isIssuedTokenExpired: boolean;
  tokenRecord: TelegramAccessTokenRecord;
}) =>
  tokenRecord.status === "issued" &&
  isCurrentTokenForTargetChat &&
  Boolean(tokenRecord.token_value) &&
  !isIssuedTokenExpired;

const shouldRevokeTelegramInvite = ({
  isCurrentTokenForTargetChat,
  isIssuedTokenExpired,
  tokenRecord,
}: {
  isCurrentTokenForTargetChat: boolean;
  isIssuedTokenExpired: boolean;
  tokenRecord: TelegramAccessTokenRecord;
}) =>
  tokenRecord.status === "issued" &&
  !isIssuedTokenExpired &&
  !isCurrentTokenForTargetChat;

const isActivatedTelegramInvite = ({
  isCurrentTokenForTargetChat,
  tokenRecord,
}: {
  isCurrentTokenForTargetChat: boolean;
  tokenRecord: TelegramAccessTokenRecord;
}) => tokenRecord.status === "used" && isCurrentTokenForTargetChat;

const resolveCurrentTelegramInvite = async ({
  normalizedChatId,
  paymentRecord,
}: {
  normalizedChatId: string;
  paymentRecord: PaymentRecordSnapshot;
}): Promise<{
  currentTokenRecord: TelegramAccessTokenRecord | null;
  resolvedResult: TelegramAccessLinkResult | null;
}> => {
  // Issued links are single-use: only an unexpired link for the same chat can
  // be reused; all other states must be persisted before a replacement is made.
  const currentTokenRecord = await findLatestTelegramAccessTokenRecordByPaymentIntentId(
    paymentRecord.payment_intent_id,
  );
  const isCurrentTokenForTargetChat =
    currentTokenRecord?.link_kind === "channel_invite" &&
    currentTokenRecord.chat_id.trim() === normalizedChatId;
  const isIssuedTokenExpired =
    currentTokenRecord?.status === "issued" &&
    isIsoExpired(currentTokenRecord.expires_at);

  if (
    currentTokenRecord &&
    canReuseTelegramInvite({
      isCurrentTokenForTargetChat,
      isIssuedTokenExpired,
      tokenRecord: currentTokenRecord,
    })
  ) {
    setCachedAccessLink({
      accessUrl: currentTokenRecord.token_value,
      chatId: normalizedChatId,
      paymentIntentId: paymentRecord.payment_intent_id,
      tokenExpiresAt: currentTokenRecord.expires_at,
      tokenId: currentTokenRecord.token_id,
    });

    return {
      currentTokenRecord,
      resolvedResult: getReadyTelegramAccessLinkResult({
        accessUrl: currentTokenRecord.token_value,
        chatId: normalizedChatId,
        tokenExpiresAt: currentTokenRecord.expires_at,
        tokenId: currentTokenRecord.token_id,
      }),
    };
  }

  if (currentTokenRecord && isIssuedTokenExpired) {
    await markTokenAsExpired({
      tokenRecord: currentTokenRecord,
    });
  }

  if (
    currentTokenRecord &&
    shouldRevokeTelegramInvite({
      isCurrentTokenForTargetChat,
      isIssuedTokenExpired,
      tokenRecord: currentTokenRecord,
    })
  ) {
    await upsertTelegramAccessTokenRecord({
      ...currentTokenRecord,
      last_error: "",
      status: "revoked",
    });
  }

  if (
    currentTokenRecord &&
    isActivatedTelegramInvite({
      isCurrentTokenForTargetChat,
      tokenRecord: currentTokenRecord,
    })
  ) {
    telegramAccessLinkCache.delete(paymentRecord.payment_intent_id);

    return {
      currentTokenRecord,
      resolvedResult: getUnavailableTelegramAccessLinkResult("already_activated"),
    };
  }

  return {
    currentTokenRecord,
    resolvedResult: null,
  };
};

const trySyncExistingTelegramBinding = async ({
  accessExpiresAt,
  normalizedChatId,
  paymentRecord,
}: {
  accessExpiresAt: string;
  normalizedChatId: string;
  paymentRecord: PaymentRecordSnapshot;
}): Promise<void> => {
  try {
    await trySyncPaymentByExistingActiveBinding({
      accessExpiresAt,
      chatId: normalizedChatId,
      paymentRecord,
    });
  } catch (syncError) {
    logSafeError("Failed to sync Telegram binding by existing active record", syncError);
  }
};

const persistTelegramAccessLinkFailure = async ({
  createdAt,
  error,
  normalizedChatId,
  paymentRecord,
}: {
  createdAt: string;
  error: unknown;
  normalizedChatId: string;
  paymentRecord: PaymentRecordSnapshot;
}): Promise<TelegramAccessLinkResult> => {
  telegramAccessLinkCache.delete(paymentRecord.payment_intent_id);

  logSafeError("Failed to create Telegram invite link", error);

  try {
    await persistTelegramPaymentAccess({
      patch: {
        telegram_access_status: "link_failed",
        telegram_channel_chat_id: normalizedChatId,
        updated_at: createdAt,
      },
      paymentRecord,
    });
  } catch (statusError) {
    logSafeError("Failed to persist Telegram link failure status", statusError);
  }

  return getUnavailableTelegramAccessLinkResult("telegram_api_failed");
};

const createTelegramAccessLink = async ({
  context,
  currentTokenRecord,
  paymentRecord,
}: {
  context: TelegramAccessLinkContext;
  currentTokenRecord: TelegramAccessTokenRecord | null;
  paymentRecord: PaymentRecordSnapshot;
}): Promise<TelegramAccessLinkResult> => {
  const tokenId = createTelegramTokenId();
  const createdAt = toUtcIso();
  const linkExpiresAt = getTelegramAccessLinkExpiryIso(createdAt);

  try {
    const inviteLink = await createTelegramChatInviteLink({
      chatId: context.normalizedChatId,
      expireDateUnix: getUnixSeconds(linkExpiresAt),
      memberLimit: 1,
      name: tokenId,
    });

    if (currentTokenRecord && currentTokenRecord.status === "issued") {
      await upsertTelegramAccessTokenRecord({
        ...currentTokenRecord,
        status: "revoked",
      });
    }

    await upsertTelegramAccessTokenRecord({
      access_expires_at: context.accessExpiresAt,
      chat_id: context.normalizedChatId,
      created_at: createdAt,
      customer_email: paymentRecord.customer_email,
      expires_at: linkExpiresAt,
      last_error: "",
      link_kind: "channel_invite",
      offer_id: paymentRecord.offer_id,
      payment_intent_id: paymentRecord.payment_intent_id,
      product_id: paymentRecord.product_id,
      status: "issued",
      telegram_user_id: "",
      telegram_username: "",
      token_hash: hashAccessToken(inviteLink.invite_link),
      token_id: tokenId,
      token_value: inviteLink.invite_link,
      used_at: "",
    });

    const nextPaymentRecord = await persistTelegramPaymentAccess({
      patch: {
        telegram_access_expires_at: context.accessExpiresAt,
        telegram_access_revoked_at: "",
        telegram_access_status: "token_issued",
        telegram_channel_chat_id: context.normalizedChatId,
        telegram_token_expires_at: linkExpiresAt,
        telegram_token_id: tokenId,
        telegram_token_used_at: paymentRecord.telegram_token_used_at,
        updated_at: createdAt,
      },
      paymentRecord,
    });

    if (context.hasTimedAccess && context.accessExpiresAt) {
      await trySyncExistingTelegramBinding({
        accessExpiresAt: context.accessExpiresAt,
        normalizedChatId: context.normalizedChatId,
        paymentRecord: nextPaymentRecord,
      });
    }

    setCachedAccessLink({
      accessUrl: inviteLink.invite_link,
      chatId: context.normalizedChatId,
      paymentIntentId: paymentRecord.payment_intent_id,
      tokenExpiresAt: linkExpiresAt,
      tokenId,
    });

    return getReadyTelegramAccessLinkResult({
      accessUrl: inviteLink.invite_link,
      chatId: context.normalizedChatId,
      tokenExpiresAt: linkExpiresAt,
      tokenId,
    });
  } catch (error) {
    return persistTelegramAccessLinkFailure({
      createdAt,
      error,
      normalizedChatId: context.normalizedChatId,
      paymentRecord,
    });
  }
};

const ensureTelegramAccessLinkForPaymentInternal = async (
  paymentRecord: PaymentRecordSnapshot,
): Promise<TelegramAccessLinkResult> => {
  const preparation = prepareTelegramAccessLink(paymentRecord);

  if (preparation.unavailableResult) {
    return preparation.unavailableResult;
  }

  const earlyResult = await resolveCachedOrExpiredAccessLink({
    context: preparation.context,
    paymentRecord,
  });

  if (earlyResult) {
    return earlyResult;
  }

  const { currentTokenRecord, resolvedResult } = await resolveCurrentTelegramInvite({
    normalizedChatId: preparation.context.normalizedChatId,
    paymentRecord,
  });

  if (resolvedResult) {
    return resolvedResult;
  }

  return createTelegramAccessLink({
    context: preparation.context,
    currentTokenRecord,
    paymentRecord,
  });
};

export const ensureTelegramAccessLinkForPayment = async (
  paymentRecord: PaymentRecordSnapshot,
) => {
  const paymentIntentId = paymentRecord.payment_intent_id.trim();

  if (!paymentIntentId) {
    return ensureTelegramAccessLinkForPaymentInternal(paymentRecord);
  }

  const pendingEnsure = pendingTelegramAccessLinkEnsures.get(paymentIntentId);

  if (pendingEnsure) {
    return pendingEnsure;
  }

  // Avoid creating two Telegram invite links when the success page and webhook
  // ask for the same payment almost simultaneously.
  const ensurePromise = ensureTelegramAccessLinkForPaymentInternal(paymentRecord).finally(
    () => {
      pendingTelegramAccessLinkEnsures.delete(paymentIntentId);
    },
  );

  pendingTelegramAccessLinkEnsures.set(paymentIntentId, ensurePromise);

  return ensurePromise;
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

const prepareTelegramJoinAccess = async (
  paymentRecord: PaymentRecordSnapshot,
): Promise<TelegramJoinAccessContext> => {
  const hasTimedAccess = isPaymentTimedTelegramAccess(paymentRecord);
  const paymentRecordWithWindow = hasTimedAccess
    ? (await startTimedAccessWindowOnJoin(paymentRecord)).paymentRecord
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
  const accessContext = await prepareTelegramJoinAccess(paymentRecord);
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
