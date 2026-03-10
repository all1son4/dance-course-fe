import { createHash, randomBytes } from "node:crypto";

import {
  findLatestTelegramAccessTokenRecordByPaymentIntentId,
  findPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenHash,
  findTelegramUserBindingByPaymentIntentId,
  findTelegramUserBindingsByTelegramUserId,
  type PaymentSheetRecord,
  upsertPaymentRecord,
  upsertTelegramAccessTokenRecord,
  upsertTelegramUserBindingRecord,
} from "@/lib/google-sheets";
import { toWarsawIso } from "@/lib/time";

import { buildTelegramBotStartLink, getTelegramStartTokenTtlHours } from "./config";
import { isWithoutMentorOfferId } from "./offer-access";

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
        | "already_activated"
        | "bot_link_unavailable"
        | "not_succeeded_payment"
        | "offer_not_supported";
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

const TELEGRAM_START_TOKEN_BYTES = 24;

const parseTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const hashToken = (tokenValue: string) =>
  createHash("sha256").update(tokenValue).digest("hex");

const createTelegramStartToken = () =>
  randomBytes(TELEGRAM_START_TOKEN_BYTES).toString("base64url");

const createTelegramTokenId = () => `tga_${randomBytes(8).toString("hex")}`;

const getTokenExpiryIso = () => {
  const ttlHours = getTelegramStartTokenTtlHours();
  const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;

  return toWarsawIso(new Date(expiresAt));
};

const isTokenExpired = (expiresAt: string) => parseTimestamp(expiresAt) <= Date.now();

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

export const isOfferEligibleForTelegramBotAccess = (offerId: string) =>
  isWithoutMentorOfferId(offerId);

export const ensureTelegramAccessLinkForPayment = async (
  paymentRecord: PaymentSheetRecord,
): Promise<TelegramAccessLinkResult> => {
  if (!isOfferEligibleForTelegramBotAccess(paymentRecord.offer_id)) {
    return {
      accessUrl: null,
      reason: "offer_not_supported",
      status: "not_available",
      tokenExpiresAt: null,
      tokenId: null,
    };
  }

  if (paymentRecord.telegram_user_id.trim()) {
    return {
      accessUrl: null,
      reason: "already_activated",
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

  const resolveAccessUrl = (startToken: string) => buildTelegramBotStartLink(startToken);
  const currentTokenRecord = await findLatestTelegramAccessTokenRecordByPaymentIntentId(
    paymentRecord.payment_intent_id,
  );

  if (
    currentTokenRecord &&
    currentTokenRecord.status === "issued" &&
    currentTokenRecord.token_value &&
    !currentTokenRecord.used_at &&
    !isTokenExpired(currentTokenRecord.expires_at)
  ) {
    const accessUrl = resolveAccessUrl(currentTokenRecord.token_value);

    if (accessUrl) {
      return {
        accessUrl,
        status: "ready",
        tokenExpiresAt: currentTokenRecord.expires_at,
        tokenId: currentTokenRecord.token_id,
      };
    }
  }

  if (currentTokenRecord && isTokenExpired(currentTokenRecord.expires_at)) {
    await markTokenAsExpired({
      tokenRecord: currentTokenRecord,
    });
  }

  const tokenValue = createTelegramStartToken();
  const accessUrl = resolveAccessUrl(tokenValue);

  if (!accessUrl) {
    return {
      accessUrl: null,
      reason: "bot_link_unavailable",
      status: "not_available",
      tokenExpiresAt: null,
      tokenId: null,
    };
  }

  const tokenId = createTelegramTokenId();
  const tokenHash = hashToken(tokenValue);
  const createdAt = toWarsawIso();
  const expiresAt = getTokenExpiryIso();

  if (currentTokenRecord && currentTokenRecord.status === "issued") {
    await upsertTelegramAccessTokenRecord({
      ...currentTokenRecord,
      status: "revoked",
    });
  }

  await upsertTelegramAccessTokenRecord({
    created_at: createdAt,
    customer_email: paymentRecord.customer_email,
    expires_at: expiresAt,
    last_error: "",
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

  await upsertPaymentRecord({
    ...paymentRecord,
    telegram_access_status: "token_issued",
    telegram_token_expires_at: expiresAt,
    telegram_token_id: tokenId,
    telegram_token_used_at: "",
    updated_at: createdAt,
  });

  return {
    accessUrl,
    status: "ready",
    tokenExpiresAt: expiresAt,
    tokenId,
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

  if (isTokenExpired(tokenRecord.expires_at)) {
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

  const now = toWarsawIso();
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
      bound_at: existingBinding?.bound_at || now,
      customer_email: paymentRecord.customer_email,
      last_seen_at: now,
      offer_id: paymentRecord.offer_id,
      payment_intent_id: paymentRecord.payment_intent_id,
      product_id: paymentRecord.product_id,
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
