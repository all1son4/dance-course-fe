import type { PaymentRecordSnapshot } from "@/lib/payment-record";
import { toUtcIso } from "@/lib/time";

import { isIsoExpired } from "./access";
import {
  claimTelegramAccessTokenRecord,
  findPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenHash,
  findTelegramUserBindingByPaymentIntentId,
  findTelegramUserBindingsByTelegramUserId,
  persistTelegramPaymentAccess,
  upsertTelegramAccessTokenRecord,
  upsertTelegramUserBindingRecord,
} from "./access-persistence";
import { hashAccessToken } from "./access-records";
import { isWithoutMentorOfferId } from "./offer-access";

/*
 * The bot's /start and /lessons flow for tokens issued before invite links: a start
 * token is activated once for one Telegram account, and the account's activated
 * payments list the lessons the bot can send.
 */

type ActivateTelegramStartTokenResult =
  | {
      paymentRecord: PaymentRecordSnapshot;
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

const pendingTelegramStartTokenActivations = new Map<string, Promise<void>>();

const isOfferEligibleForTelegramBotAccess = (offerId: string) =>
  isWithoutMentorOfferId(offerId);

const activateTelegramStartTokenInternal = async ({
  telegramUserId,
  telegramUsername,
  tokenValue,
}: {
  telegramUserId: string;
  telegramUsername: string;
  tokenValue: string;
}): Promise<ActivateTelegramStartTokenResult> => {
  const tokenHash = hashAccessToken(tokenValue);
  const tokenRecord = await findTelegramAccessTokenRecordByTokenHash(tokenHash);

  if (!tokenRecord) {
    return {
      status: "invalid_token",
    };
  }

  if (tokenRecord.status === "used") {
    if (tokenRecord.telegram_user_id !== telegramUserId) {
      return {
        status: "token_claimed_by_another_user",
      };
    }
  }

  if (tokenRecord.status !== "issued" && tokenRecord.status !== "used") {
    return {
      status: "token_already_used",
    };
  }

  if (tokenRecord.status === "issued" && isIsoExpired(tokenRecord.expires_at)) {
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
  const claimResult = await claimTelegramAccessTokenRecord({
    claimedAt: now,
    telegramUserId,
    telegramUsername: normalizedUsername,
    tokenHash,
  });

  if (claimResult.status === "not_found") {
    return {
      status: "invalid_token",
    };
  }

  if (claimResult.status === "claimed_by_another_user") {
    return {
      status: "token_claimed_by_another_user",
    };
  }

  if (claimResult.status === "expired") {
    return {
      status: "expired",
    };
  }

  if (claimResult.status === "unavailable") {
    return {
      status: "token_already_used",
    };
  }

  await Promise.all([
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
    persistTelegramPaymentAccess({
      patch: {
        telegram_access_status: "activated",
        telegram_token_id: tokenRecord.token_id,
        telegram_token_used_at: now,
        telegram_user_id: telegramUserId,
        telegram_username: normalizedUsername,
        updated_at: now,
      },
      paymentRecord,
    }),
  ]);

  return {
    paymentRecord,
    status:
      existingBinding || claimResult.status === "already_claimed_by_user"
        ? "already_activated"
        : "activated",
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
  const tokenHash = hashAccessToken(tokenValue);
  const previousActivation =
    pendingTelegramStartTokenActivations.get(tokenHash) ?? Promise.resolve();
  let releaseActivation!: () => void;
  const activationReleasePromise = new Promise<void>((resolve) => {
    releaseActivation = resolve;
  });
  const activationQueueEntry = previousActivation.then(() => activationReleasePromise);

  pendingTelegramStartTokenActivations.set(tokenHash, activationQueueEntry);

  await previousActivation;

  try {
    return await activateTelegramStartTokenInternal({
      telegramUserId,
      telegramUsername,
      tokenValue,
    });
  } finally {
    releaseActivation();

    if (pendingTelegramStartTokenActivations.get(tokenHash) === activationQueueEntry) {
      pendingTelegramStartTokenActivations.delete(tokenHash);
    }
  }
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
    (payment): payment is PaymentRecordSnapshot =>
      payment !== null &&
      payment.outcome === "succeeded" &&
      isOfferEligibleForTelegramBotAccess(payment.offer_id),
  );
};
