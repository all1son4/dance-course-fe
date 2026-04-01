import { createHash, randomBytes } from "node:crypto";

import {
  findActiveTelegramUserBindings,
  findLatestTelegramAccessTokenRecordByPaymentIntentId,
  findPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenHash,
  findTelegramAccessTokenRecordByTokenValue,
  findTelegramUserBindingByPaymentIntentId,
  findTelegramUserBindingsByCustomerEmail,
  findTelegramUserBindingsByTelegramUserId,
  findTelegramUserBindingsByTelegramUserIdAndChatId,
  isGoogleSheetsRateLimitError,
  type PaymentSheetRecord,
  upsertPaymentRecord,
  upsertTelegramAccessTokenRecord,
  upsertTelegramUserBindingRecord,
} from "@/lib/google-sheets";
import { toUtcIso } from "@/lib/time";

import { isAdminOfferAccessWorkflow } from "./admin-offer-access";
import { banTelegramChatMember, createTelegramChatInviteLink } from "./bot-api";
import {
  buildTelegramBotStartLink,
  getTelegramChannelTargetByOfferId,
  getTelegramStartTokenTtlHours,
} from "./config";
import {
  isChoreoChannelOfferId,
  isFirstTouchOfferId,
  isWithoutMentorOfferId,
} from "./offer-access";

type TelegramAccessTokenStatus = "expired" | "issued" | "revoked" | "used";

type TelegramAccessLinkResult =
  | {
      accessUrl: string;
      status: "ready";
      tokenExpiresAt: string;
      tokenId: string;
    }
  | {
      accessUrl: null;
      reason:
        | "access_window_expired"
        | "already_activated"
        | "channel_not_configured"
        | "not_succeeded_payment"
        | "offer_not_supported"
        | "telegram_api_failed";
      status: "not_available";
      tokenExpiresAt: null;
      tokenId: null;
    };

type ActivateTelegramStartTokenResult =
  | {
      paymentRecord: PaymentSheetRecord;
      status: "activated" | "already_activated";
    }
  | {
      status:
        | "expired"
        | "invalid_token"
        | "not_available"
        | "token_already_used"
        | "token_claimed_by_another_user";
    };

type SyncTelegramChannelMembershipResult = {
  handled: boolean;
  reason?: string;
};

type RevokeExpiredTelegramAccessResult = {
  failedGroups: number;
  processedGroups: number;
  revokedBindings: number;
  revokedGroups: number;
};

type TelegramAccessLinkCacheEntry = {
  accessUrl: string;
  chatId: string;
  tokenExpiresAt: string;
  tokenId: string;
};

const DEFAULT_TELEGRAM_CHANNEL_ACCESS_DAYS = 30;
const TELEGRAM_START_TOKEN_BYTES = 24;
const TELEGRAM_TEMP_KICK_SECONDS = 60;
const pendingTelegramAccessLinkEnsures = new Map<
  string,
  Promise<TelegramAccessLinkResult>
>();
const telegramAccessLinkCache = new Map<string, TelegramAccessLinkCacheEntry>();

const getTelegramChannelAccessDurationMs = () => {
  // TELEGRAM_CHANNEL_ACCESS_DAYS controls how long user access is valid after purchase.
  // Example: 30 -> 30 days (production), 0.01 -> ~14.4 minutes (testing).
  const parsedDays = Number.parseFloat(
    process.env.TELEGRAM_CHANNEL_ACCESS_DAYS?.trim() ?? "",
  );
  const resolvedDays =
    Number.isFinite(parsedDays) && parsedDays > 0
      ? parsedDays
      : DEFAULT_TELEGRAM_CHANNEL_ACCESS_DAYS;

  return resolvedDays * 24 * 60 * 60 * 1000;
};

const parseTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const hashToken = (tokenValue: string) =>
  createHash("sha256").update(tokenValue).digest("hex");

const createTelegramStartToken = () =>
  randomBytes(TELEGRAM_START_TOKEN_BYTES).toString("base64url");

const createTelegramTokenId = (prefix: "tga" | "tgi" = "tgi") =>
  `${prefix}_${randomBytes(8).toString("hex")}`;

const getStartTokenExpiryIso = () => {
  const ttlHours = getTelegramStartTokenTtlHours();
  const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;

  return toUtcIso(new Date(expiresAt));
};

const getPaymentAccessWindowStartedAtTs = (paymentRecord: PaymentSheetRecord) => {
  if (isAdminOfferAccessWorkflow(paymentRecord.access_workflow)) {
    const activatedAtTs = parseTimestamp(paymentRecord.telegram_token_used_at);

    if (activatedAtTs > 0) {
      return activatedAtTs;
    }
  }

  return (
    parseTimestamp(paymentRecord.successful_customer_logged_at) ||
    parseTimestamp(paymentRecord.updated_at) ||
    parseTimestamp(paymentRecord.first_seen_at) ||
    Date.now()
  );
};

const getComputedAccessExpiresAtIso = (paymentRecord: PaymentSheetRecord) =>
  toUtcIso(
    new Date(
      getPaymentAccessWindowStartedAtTs(paymentRecord) +
        getTelegramChannelAccessDurationMs(),
    ),
  );

const getPaymentAccessExpiresAtIso = (paymentRecord: PaymentSheetRecord) =>
  paymentRecord.telegram_access_expires_at.trim() ||
  getComputedAccessExpiresAtIso(paymentRecord);

const isIsoExpired = (value: string) => parseTimestamp(value) <= Date.now();

const getUnixSeconds = (value: string) => Math.floor(parseTimestamp(value) / 1000);

const getMaxExpiresAtTs = (values: string[]) =>
  values.reduce((maxValue, value) => Math.max(maxValue, parseTimestamp(value)), 0);

const shouldIgnoreKickFailure = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes("USER_NOT_PARTICIPANT") ||
    error.message.includes("user not found"));

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

const updatePaymentAccessWindow = async (paymentRecord: PaymentSheetRecord) => {
  const computedAccessExpiresAt = getPaymentAccessExpiresAtIso(paymentRecord);

  if (paymentRecord.telegram_access_expires_at === computedAccessExpiresAt) {
    return {
      accessExpiresAt: computedAccessExpiresAt,
      paymentRecord,
    };
  }

  const now = toUtcIso();
  const nextPaymentRecord = await upsertPaymentRecord({
    ...paymentRecord,
    telegram_access_expires_at: computedAccessExpiresAt,
    updated_at: now,
  });

  return {
    accessExpiresAt: computedAccessExpiresAt,
    paymentRecord: nextPaymentRecord,
  };
};

const tryKickTelegramMember = async ({
  chatId,
  telegramUserId,
}: {
  chatId: string;
  telegramUserId: string;
}) => {
  const untilDateUnix = Math.floor(Date.now() / 1000) + TELEGRAM_TEMP_KICK_SECONDS;

  await banTelegramChatMember({
    chatId,
    untilDateUnix,
    userId: telegramUserId,
  });
};

const trySyncPaymentByExistingActiveBinding = async ({
  accessExpiresAt,
  chatId,
  paymentRecord,
}: {
  accessExpiresAt: string;
  chatId: string;
  paymentRecord: PaymentSheetRecord;
}) => {
  const customerEmail = paymentRecord.customer_email.trim().toLowerCase();

  if (!customerEmail) {
    return;
  }

  const bindings = await findTelegramUserBindingsByCustomerEmail(customerEmail);
  const candidateBinding = bindings
    .filter(
      (binding) =>
        binding.status === "active" &&
        binding.chat_id.trim() === chatId &&
        binding.telegram_user_id.trim() &&
        parseTimestamp(binding.access_expires_at) > Date.now(),
    )
    .sort(
      (left, right) =>
        parseTimestamp(right.access_expires_at) - parseTimestamp(left.access_expires_at),
    )[0];

  if (!candidateBinding) {
    return;
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

  await upsertPaymentRecord({
    ...latestPaymentRecord,
    telegram_access_expires_at: accessExpiresAt,
    telegram_access_revoked_at: "",
    telegram_access_status: "activated",
    telegram_channel_chat_id: chatId,
    telegram_user_id: candidateBinding.telegram_user_id,
    telegram_username:
      latestPaymentRecord.telegram_username || candidateBinding.telegram_username,
    updated_at: now,
  });
};

export const isOfferEligibleForTelegramBotAccess = (offerId: string) =>
  isWithoutMentorOfferId(offerId);

export const isOfferEligibleForTelegramAccessLink = (offerId: string) =>
  isChoreoChannelOfferId(offerId) || isFirstTouchOfferId(offerId);

const isPaymentTimedTelegramAccess = (paymentRecord: PaymentSheetRecord) =>
  isChoreoChannelOfferId(paymentRecord.offer_id) ||
  isAdminOfferAccessWorkflow(paymentRecord.access_workflow);

const prepareAdminOfferAccessWindowStartOnJoin = async (
  paymentRecord: PaymentSheetRecord,
) => {
  if (
    !isAdminOfferAccessWorkflow(paymentRecord.access_workflow) ||
    paymentRecord.telegram_token_used_at.trim()
  ) {
    return paymentRecord;
  }

  const joinedAt = toUtcIso();

  return upsertPaymentRecord({
    ...paymentRecord,
    telegram_access_expires_at: "",
    telegram_token_expires_at: "",
    telegram_token_used_at: joinedAt,
    updated_at: joinedAt,
  });
};

const ensureTelegramAccessLinkForPaymentInternal = async (
  paymentRecord: PaymentSheetRecord,
): Promise<TelegramAccessLinkResult> => {
  if (!isOfferEligibleForTelegramAccessLink(paymentRecord.offer_id)) {
    return {
      accessUrl: null,
      reason: "offer_not_supported",
      status: "not_available",
      tokenExpiresAt: null,
      tokenId: null,
    };
  }

  if (paymentRecord.outcome !== "succeeded") {
    return {
      accessUrl: null,
      reason: "not_succeeded_payment",
      status: "not_available",
      tokenExpiresAt: null,
      tokenId: null,
    };
  }

  const channelTarget = getTelegramChannelTargetByOfferId({
    lessonLanguage: paymentRecord.lesson_language,
    offerId: paymentRecord.offer_id,
  });

  if (!channelTarget) {
    return {
      accessUrl: null,
      reason: "channel_not_configured",
      status: "not_available",
      tokenExpiresAt: null,
      tokenId: null,
    };
  }

  const normalizedChatId = channelTarget.chatId.trim();
  const hasTimedAccess = isPaymentTimedTelegramAccess(paymentRecord);
  const cachedAccessLink = getCachedAccessLink({
    chatId: normalizedChatId,
    paymentIntentId: paymentRecord.payment_intent_id,
  });

  if (cachedAccessLink) {
    return {
      accessUrl: cachedAccessLink.accessUrl,
      status: "ready",
      tokenExpiresAt: cachedAccessLink.tokenExpiresAt,
      tokenId: cachedAccessLink.tokenId,
    };
  }

  const paymentRecordWithWindow = hasTimedAccess
    ? (await updatePaymentAccessWindow(paymentRecord)).paymentRecord
    : paymentRecord;
  const accessExpiresAt = hasTimedAccess
    ? getPaymentAccessExpiresAtIso(paymentRecordWithWindow)
    : "";

  if (hasTimedAccess && isIsoExpired(accessExpiresAt)) {
    const now = toUtcIso();

    await upsertPaymentRecord({
      ...paymentRecordWithWindow,
      telegram_access_status: "expired",
      telegram_channel_chat_id: normalizedChatId,
      telegram_access_revoked_at: now,
      updated_at: now,
    });

    return {
      accessUrl: null,
      reason: "access_window_expired",
      status: "not_available",
      tokenExpiresAt: null,
      tokenId: null,
    };
  }

  const currentTokenRecord = await findLatestTelegramAccessTokenRecordByPaymentIntentId(
    paymentRecord.payment_intent_id,
  );
  const isCurrentTokenForTargetChat =
    currentTokenRecord?.link_kind === "channel_invite" &&
    currentTokenRecord.chat_id.trim() === normalizedChatId;
  const isIssuedTokenExpired =
    hasTimedAccess &&
    currentTokenRecord?.status === "issued" &&
    isIsoExpired(currentTokenRecord.expires_at);

  if (
    currentTokenRecord &&
    currentTokenRecord.status === "issued" &&
    isCurrentTokenForTargetChat &&
    currentTokenRecord.token_value &&
    !isIssuedTokenExpired
  ) {
    setCachedAccessLink({
      accessUrl: currentTokenRecord.token_value,
      chatId: normalizedChatId,
      paymentIntentId: paymentRecord.payment_intent_id,
      tokenExpiresAt: currentTokenRecord.expires_at,
      tokenId: currentTokenRecord.token_id,
    });

    return {
      accessUrl: currentTokenRecord.token_value,
      status: "ready",
      tokenExpiresAt: currentTokenRecord.expires_at,
      tokenId: currentTokenRecord.token_id,
    };
  }

  if (currentTokenRecord && isIssuedTokenExpired) {
    await markTokenAsExpired({
      tokenRecord: currentTokenRecord,
    });
  }

  if (
    currentTokenRecord &&
    currentTokenRecord.status === "issued" &&
    !isIssuedTokenExpired &&
    !isCurrentTokenForTargetChat
  ) {
    await upsertTelegramAccessTokenRecord({
      ...currentTokenRecord,
      last_error: "",
      status: "revoked",
    });
  }

  if (
    currentTokenRecord &&
    currentTokenRecord.status === "used" &&
    isCurrentTokenForTargetChat
  ) {
    telegramAccessLinkCache.delete(paymentRecord.payment_intent_id);

    return {
      accessUrl: null,
      reason: "already_activated",
      status: "not_available",
      tokenExpiresAt: null,
      tokenId: null,
    };
  }

  const tokenId = createTelegramTokenId("tgi");
  const createdAt = toUtcIso();

  try {
    const inviteLink = await createTelegramChatInviteLink({
      chatId: normalizedChatId,
      expireDateUnix: hasTimedAccess ? getUnixSeconds(accessExpiresAt) : undefined,
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
      access_expires_at: hasTimedAccess ? accessExpiresAt : "",
      chat_id: normalizedChatId,
      created_at: createdAt,
      customer_email: paymentRecord.customer_email,
      expires_at: hasTimedAccess ? accessExpiresAt : "",
      last_error: "",
      link_kind: "channel_invite",
      offer_id: paymentRecord.offer_id,
      payment_intent_id: paymentRecord.payment_intent_id,
      product_id: paymentRecord.product_id,
      status: "issued",
      telegram_user_id: "",
      telegram_username: "",
      token_hash: hashToken(inviteLink.invite_link),
      token_id: tokenId,
      token_value: inviteLink.invite_link,
      used_at: "",
    });

    const nextPaymentRecord = await upsertPaymentRecord({
      ...paymentRecordWithWindow,
      telegram_access_expires_at: hasTimedAccess ? accessExpiresAt : "",
      telegram_access_revoked_at: "",
      telegram_access_status: "token_issued",
      telegram_channel_chat_id: normalizedChatId,
      telegram_token_expires_at: hasTimedAccess ? accessExpiresAt : "",
      telegram_token_id: tokenId,
      telegram_token_used_at: "",
      updated_at: createdAt,
    });

    if (hasTimedAccess) {
      try {
        await trySyncPaymentByExistingActiveBinding({
          accessExpiresAt,
          chatId: normalizedChatId,
          paymentRecord: nextPaymentRecord,
        });
      } catch (syncError) {
        if (isGoogleSheetsRateLimitError(syncError)) {
          console.warn(
            "Skipped optional Telegram binding sync due to Google Sheets rate limit",
            {
              paymentIntentId: paymentRecord.payment_intent_id,
            },
          );
        } else {
          console.error("Failed to sync Telegram binding by existing active record", {
            error: syncError,
            paymentIntentId: paymentRecord.payment_intent_id,
          });
        }
      }
    }

    setCachedAccessLink({
      accessUrl: inviteLink.invite_link,
      chatId: normalizedChatId,
      paymentIntentId: paymentRecord.payment_intent_id,
      tokenExpiresAt: hasTimedAccess ? accessExpiresAt : "",
      tokenId,
    });

    return {
      accessUrl: inviteLink.invite_link,
      status: "ready",
      tokenExpiresAt: hasTimedAccess ? accessExpiresAt : "",
      tokenId,
    };
  } catch (error) {
    telegramAccessLinkCache.delete(paymentRecord.payment_intent_id);

    if (isGoogleSheetsRateLimitError(error)) {
      throw error;
    }

    console.error("Failed to create Telegram invite link", {
      chatId: normalizedChatId,
      error,
      paymentIntentId: paymentRecord.payment_intent_id,
    });

    try {
      await upsertPaymentRecord({
        ...paymentRecordWithWindow,
        telegram_access_status: "link_failed",
        telegram_channel_chat_id: normalizedChatId,
        updated_at: createdAt,
      });
    } catch (statusError) {
      console.error("Failed to persist Telegram link failure status", {
        error: statusError,
        paymentIntentId: paymentRecord.payment_intent_id,
      });
    }

    return {
      accessUrl: null,
      reason: "telegram_api_failed",
      status: "not_available",
      tokenExpiresAt: null,
      tokenId: null,
    };
  }
};

export const ensureTelegramAccessLinkForPayment = async (
  paymentRecord: PaymentSheetRecord,
) => {
  const paymentIntentId = paymentRecord.payment_intent_id.trim();

  if (!paymentIntentId) {
    return ensureTelegramAccessLinkForPaymentInternal(paymentRecord);
  }

  const pendingEnsure = pendingTelegramAccessLinkEnsures.get(paymentIntentId);

  if (pendingEnsure) {
    return pendingEnsure;
  }

  const ensurePromise = ensureTelegramAccessLinkForPaymentInternal(paymentRecord).finally(
    () => {
      pendingTelegramAccessLinkEnsures.delete(paymentIntentId);
    },
  );

  pendingTelegramAccessLinkEnsures.set(paymentIntentId, ensurePromise);

  return ensurePromise;
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

  if (!normalizedChatId || !normalizedUserId) {
    return {
      handled: false,
      reason: "missing_chat_or_user",
    };
  }

  if (membershipStatus === "left") {
    const relatedBindings = await findTelegramUserBindingsByTelegramUserIdAndChatId({
      chatId: normalizedChatId,
      telegramUserId: normalizedUserId,
    });
    const activeBindings = relatedBindings.filter(
      (binding) => binding.status === "active",
    );

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

      await upsertPaymentRecord({
        ...paymentRecord,
        telegram_access_revoked_at: now,
        telegram_access_status: "left_channel",
        updated_at: now,
      });
    }

    return {
      handled: true,
    };
  }

  const normalizedInviteLink = inviteLink?.trim() ?? "";

  if (!normalizedInviteLink) {
    return {
      handled: false,
      reason: "missing_invite_link",
    };
  }

  const tokenRecord =
    await findTelegramAccessTokenRecordByTokenValue(normalizedInviteLink);

  if (!tokenRecord || tokenRecord.link_kind !== "channel_invite") {
    return {
      handled: false,
      reason: "invite_link_not_tracked",
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
      handled: false,
      reason: "payment_not_available",
    };
  }

  const paymentRecordForAccessWindow = isAdminOfferAccessWorkflow(
    paymentRecord.access_workflow,
  )
    ? await prepareAdminOfferAccessWindowStartOnJoin(paymentRecord)
    : paymentRecord;
  const hasTimedAccess = isPaymentTimedTelegramAccess(paymentRecordForAccessWindow);
  const paymentRecordWithWindow = hasTimedAccess
    ? (await updatePaymentAccessWindow(paymentRecordForAccessWindow)).paymentRecord
    : paymentRecordForAccessWindow;
  const accessExpiresAt = hasTimedAccess
    ? getPaymentAccessExpiresAtIso(paymentRecordWithWindow)
    : "";
  const existingBinding = await findTelegramUserBindingByPaymentIntentId(
    paymentRecord.payment_intent_id,
  );

  if (
    tokenRecord.status === "used" &&
    tokenRecord.telegram_user_id.trim() &&
    tokenRecord.telegram_user_id !== normalizedUserId
  ) {
    try {
      await tryKickTelegramMember({
        chatId: normalizedChatId,
        telegramUserId: normalizedUserId,
      });
    } catch (error) {
      console.error("Failed to remove user with claimed Telegram invite", {
        chatId: normalizedChatId,
        error,
        paymentIntentId: paymentRecord.payment_intent_id,
        telegramUserId: normalizedUserId,
      });
    }

    return {
      handled: false,
      reason: "invite_claimed_by_another_user",
    };
  }

  const hasClosedBindingForSameUser =
    tokenRecord.status === "used" &&
    existingBinding?.telegram_user_id.trim() === normalizedUserId &&
    (existingBinding.status === "left" || existingBinding.status === "revoked");

  if (hasClosedBindingForSameUser) {
    try {
      await tryKickTelegramMember({
        chatId: normalizedChatId,
        telegramUserId: normalizedUserId,
      });
    } catch (error) {
      console.error("Failed to remove user with closed Telegram binding", {
        chatId: normalizedChatId,
        error,
        paymentIntentId: paymentRecord.payment_intent_id,
        telegramUserId: normalizedUserId,
      });
    }

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
    existingBinding &&
    existingBinding.telegram_user_id.trim() &&
    existingBinding.telegram_user_id !== normalizedUserId
  ) {
    try {
      await tryKickTelegramMember({
        chatId: normalizedChatId,
        telegramUserId: normalizedUserId,
      });
    } catch (error) {
      console.error("Failed to remove user with conflicting Telegram binding", {
        chatId: normalizedChatId,
        error,
        paymentIntentId: paymentRecord.payment_intent_id,
        telegramUserId: normalizedUserId,
      });
    }

    return {
      handled: false,
      reason: "binding_claimed_by_another_user",
    };
  }

  if (hasTimedAccess && isIsoExpired(accessExpiresAt)) {
    try {
      await tryKickTelegramMember({
        chatId: normalizedChatId,
        telegramUserId: normalizedUserId,
      });
    } catch (error) {
      if (!shouldIgnoreKickFailure(error)) {
        console.error("Failed to remove expired Telegram member", {
          chatId: normalizedChatId,
          error,
          paymentIntentId: paymentRecord.payment_intent_id,
          telegramUserId: normalizedUserId,
        });
      }
    }

    await upsertTelegramAccessTokenRecord({
      ...tokenRecord,
      last_error: "",
      status: "expired",
    });

    await upsertTelegramUserBindingRecord({
      access_expires_at: accessExpiresAt,
      bound_at: existingBinding?.bound_at || now,
      chat_id: normalizedChatId,
      customer_email: paymentRecord.customer_email,
      invite_link: normalizedInviteLink,
      last_seen_at: now,
      offer_id: paymentRecord.offer_id,
      payment_intent_id: paymentRecord.payment_intent_id,
      product_id: paymentRecord.product_id,
      revoked_at: now,
      revoked_reason: "expired",
      status: "revoked",
      telegram_user_id: normalizedUserId,
      telegram_username: normalizedUsername,
    });

    await upsertPaymentRecord({
      ...paymentRecordWithWindow,
      telegram_access_revoked_at: now,
      telegram_access_status: "revoked",
      telegram_channel_chat_id: normalizedChatId,
      telegram_user_id: normalizedUserId,
      telegram_username: normalizedUsername,
      updated_at: now,
    });

    return {
      handled: true,
    };
  }

  await Promise.all([
    upsertTelegramAccessTokenRecord({
      ...tokenRecord,
      access_expires_at: hasTimedAccess ? accessExpiresAt : "",
      chat_id: normalizedChatId,
      expires_at: hasTimedAccess ? accessExpiresAt : "",
      last_error: "",
      status: "used" satisfies TelegramAccessTokenStatus,
      telegram_user_id: normalizedUserId,
      telegram_username: normalizedUsername,
      used_at: now,
    }),
    upsertTelegramUserBindingRecord({
      access_expires_at: hasTimedAccess ? accessExpiresAt : "",
      bound_at: existingBinding?.bound_at || now,
      chat_id: normalizedChatId,
      customer_email: paymentRecord.customer_email,
      invite_link: normalizedInviteLink,
      last_seen_at: now,
      offer_id: paymentRecord.offer_id,
      payment_intent_id: paymentRecord.payment_intent_id,
      product_id: paymentRecord.product_id,
      revoked_at: "",
      revoked_reason: "",
      status: "active",
      telegram_user_id: normalizedUserId,
      telegram_username: normalizedUsername,
    }),
    upsertPaymentRecord({
      ...paymentRecordWithWindow,
      telegram_access_expires_at: hasTimedAccess ? accessExpiresAt : "",
      telegram_access_revoked_at: "",
      telegram_access_status: "activated",
      telegram_channel_chat_id: normalizedChatId,
      telegram_token_id: tokenRecord.token_id,
      telegram_token_used_at: now,
      telegram_user_id: normalizedUserId,
      telegram_username: normalizedUsername,
      updated_at: now,
    }),
  ]);

  return {
    handled: true,
  };
};

export const revokeExpiredTelegramChannelAccess =
  async (): Promise<RevokeExpiredTelegramAccessResult> => {
    const activeBindings = await findActiveTelegramUserBindings();
    const groups = new Map<
      string,
      {
        bindings: typeof activeBindings;
        chatId: string;
        telegramUserId: string;
      }
    >();
    let revokedGroups = 0;
    let processedGroups = 0;
    let revokedBindings = 0;
    let failedGroups = 0;

    activeBindings.forEach((binding) => {
      const chatId = binding.chat_id.trim();
      const telegramUserId = binding.telegram_user_id.trim();

      if (!chatId || !telegramUserId) {
        return;
      }

      const groupKey = `${telegramUserId}:${chatId}`;
      const existingGroup = groups.get(groupKey);

      if (existingGroup) {
        existingGroup.bindings.push(binding);
        return;
      }

      groups.set(groupKey, {
        bindings: [binding],
        chatId,
        telegramUserId,
      });
    });

    for (const group of groups.values()) {
      processedGroups += 1;
      const maxAccessExpiresAtTs = getMaxExpiresAtTs(
        group.bindings.map((binding) => binding.access_expires_at),
      );

      if (!maxAccessExpiresAtTs || maxAccessExpiresAtTs > Date.now()) {
        continue;
      }

      let canProceedWithRevocation = false;

      try {
        await tryKickTelegramMember({
          chatId: group.chatId,
          telegramUserId: group.telegramUserId,
        });
        canProceedWithRevocation = true;
      } catch (error) {
        if (shouldIgnoreKickFailure(error)) {
          canProceedWithRevocation = true;
        } else {
          failedGroups += 1;
          console.error("Failed to revoke Telegram access for expired member", {
            chatId: group.chatId,
            error,
            telegramUserId: group.telegramUserId,
          });
        }
      }

      if (!canProceedWithRevocation) {
        continue;
      }

      const now = toUtcIso();
      revokedGroups += 1;

      for (const binding of group.bindings) {
        revokedBindings += 1;

        await upsertTelegramUserBindingRecord({
          ...binding,
          last_seen_at: now,
          revoked_at: now,
          revoked_reason: "expired",
          status: "revoked",
        });

        const paymentRecord = await findPaymentRecordByIntentId(
          binding.payment_intent_id,
        );

        if (!paymentRecord) {
          continue;
        }

        await upsertPaymentRecord({
          ...paymentRecord,
          telegram_access_revoked_at: now,
          telegram_access_status: "revoked",
          updated_at: now,
        });
      }
    }

    return {
      failedGroups,
      processedGroups,
      revokedBindings,
      revokedGroups,
    };
  };

export const activateTelegramStartToken = async ({
  telegramUserId,
  telegramUsername,
  tokenValue,
}: {
  telegramUserId: string;
  telegramUsername: string;
  tokenValue: string;
}): Promise<ActivateTelegramStartTokenResult> => {
  const tokenHash = hashToken(tokenValue);
  const tokenRecord = await findTelegramAccessTokenRecordByTokenHash(tokenHash);

  if (!tokenRecord) {
    return {
      status: "invalid_token",
    };
  }

  if (tokenRecord.status === "used") {
    if (tokenRecord.telegram_user_id === telegramUserId) {
      const paymentRecord = await findPaymentRecordByIntentId(
        tokenRecord.payment_intent_id,
      );

      if (!paymentRecord) {
        return {
          status: "not_available",
        };
      }

      return {
        paymentRecord,
        status: "already_activated",
      };
    }

    return {
      status: "token_claimed_by_another_user",
    };
  }

  if (tokenRecord.status !== "issued") {
    return {
      status: "token_already_used",
    };
  }

  if (isIsoExpired(tokenRecord.expires_at)) {
    await upsertTelegramAccessTokenRecord({
      ...tokenRecord,
      status: "expired",
    });

    return {
      status: "expired",
    };
  }

  const paymentRecord = await findPaymentRecordByIntentId(tokenRecord.payment_intent_id);

  if (
    !paymentRecord ||
    paymentRecord.outcome !== "succeeded" ||
    !isOfferEligibleForTelegramBotAccess(paymentRecord.offer_id)
  ) {
    return {
      status: "not_available",
    };
  }

  const existingBinding = await findTelegramUserBindingByPaymentIntentId(
    paymentRecord.payment_intent_id,
  );

  if (existingBinding && existingBinding.telegram_user_id !== telegramUserId) {
    return {
      status: "token_claimed_by_another_user",
    };
  }

  const now = toUtcIso();
  const normalizedUsername = telegramUsername.trim();

  await Promise.all([
    upsertTelegramAccessTokenRecord({
      ...tokenRecord,
      status: "used" satisfies TelegramAccessTokenStatus,
      telegram_user_id: telegramUserId,
      telegram_username: normalizedUsername,
      used_at: now,
    }),
    upsertTelegramUserBindingRecord({
      access_expires_at: "",
      bound_at: existingBinding?.bound_at || now,
      chat_id: "",
      customer_email: paymentRecord.customer_email,
      invite_link: "",
      last_seen_at: now,
      offer_id: paymentRecord.offer_id,
      payment_intent_id: paymentRecord.payment_intent_id,
      product_id: paymentRecord.product_id,
      revoked_at: "",
      revoked_reason: "",
      status: "active",
      telegram_user_id: telegramUserId,
      telegram_username: normalizedUsername,
    }),
    upsertPaymentRecord({
      ...paymentRecord,
      telegram_access_status: "activated",
      telegram_token_id: tokenRecord.token_id,
      telegram_token_used_at: now,
      telegram_user_id: telegramUserId,
      telegram_username: normalizedUsername,
      updated_at: now,
    }),
  ]);

  return {
    paymentRecord,
    status: existingBinding ? "already_activated" : "activated",
  };
};

export const getActivatedPaymentsByTelegramUserId = async (telegramUserId: string) => {
  const bindings = await findTelegramUserBindingsByTelegramUserId(telegramUserId);
  const activeBindings = bindings.filter((binding) => binding.status === "active");
  const payments = await Promise.all(
    activeBindings.map((binding) =>
      findPaymentRecordByIntentId(binding.payment_intent_id),
    ),
  );

  return payments.filter(
    (payment): payment is PaymentSheetRecord =>
      payment !== null &&
      payment.outcome === "succeeded" &&
      isOfferEligibleForTelegramBotAccess(payment.offer_id),
  );
};

export const ensureLegacyTelegramBotStartLinkForPayment = async (
  paymentRecord: PaymentSheetRecord,
) => {
  if (!isOfferEligibleForTelegramBotAccess(paymentRecord.offer_id)) {
    return null;
  }

  const tokenValue = createTelegramStartToken();
  const accessUrl = buildTelegramBotStartLink(tokenValue);

  if (!accessUrl) {
    return null;
  }

  const tokenId = createTelegramTokenId("tga");
  const tokenHash = hashToken(tokenValue);
  const createdAt = toUtcIso();
  const expiresAt = getStartTokenExpiryIso();

  await upsertTelegramAccessTokenRecord({
    access_expires_at: "",
    chat_id: "",
    created_at: createdAt,
    customer_email: paymentRecord.customer_email,
    expires_at: expiresAt,
    last_error: "",
    link_kind: "start_token",
    offer_id: paymentRecord.offer_id,
    payment_intent_id: paymentRecord.payment_intent_id,
    product_id: paymentRecord.product_id,
    status: "issued",
    telegram_user_id: "",
    telegram_username: "",
    token_hash: tokenHash,
    token_id: tokenId,
    token_value: tokenValue,
    used_at: "",
  });

  return accessUrl;
};
