import { upsertRegisteredTelegramChat } from "@/db/renewal-campaigns";
import {
  areEqualInTimingSafeWay,
  isPayloadTooLarge,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { logSafeError } from "@/lib/safe-error-log";
import {
  getBuyerPurchaseLine,
  shouldShowOfferToBuyerByOfferId,
} from "@/lib/sellable-products-localization";
import { syncTelegramChannelMembership } from "@/lib/telegram/access";
import {
  copyTelegramMessage,
  getTelegramChatMember,
  sendTelegramMessage,
  type TelegramChatMember,
} from "@/lib/telegram/bot-api";
import {
  activateTelegramStartToken,
  getActivatedPaymentsByTelegramUserId,
} from "@/lib/telegram/bot-start-access";
import { isActiveTelegramMember } from "@/lib/telegram/chat-membership";
import {
  getTelegramLessonSourceByOfferId,
  getTelegramWebhookSecret,
  isTelegramBotConfigured,
} from "@/lib/telegram/config";
import { syncOnlineGroupMembership } from "@/lib/telegram/online-group-access";

import { BOT_COPY, type BotLocale, resolvePurchaseBotLocale } from "./_lib/bot-copy";

export const runtime = "nodejs";

const MAX_TELEGRAM_WEBHOOK_BODY_BYTES = 512 * 1024;

type TelegramIncomingMessage = {
  chat?: {
    id?: number;
    title?: string;
    type?: string;
  };
  from?: {
    id?: number;
    language_code?: string;
    username?: string;
  };
  text?: string;
};

type TelegramChatMemberUpdate = {
  chat?: {
    id?: number;
    type?: string;
  };
  invite_link?: {
    invite_link?: string;
  };
  new_chat_member?: TelegramChatMember;
  old_chat_member?: TelegramChatMember;
};

type TelegramUpdate = {
  chat_member?: TelegramChatMemberUpdate;
  message?: TelegramIncomingMessage;
};

type TelegramWebhookFallback = {
  chatId: number | null;
  locale: BotLocale;
};

type TelegramMessageContext = {
  chatId: number;
  chatType: string;
  commandPayload: string;
  message: TelegramIncomingMessage;
  normalizedCommand: string;
  preferredLocale: BotLocale;
  telegramUserId: string;
  telegramUsername: string;
};

type TelegramMessageEnvelope = Pick<
  TelegramMessageContext,
  "chatId" | "chatType" | "message" | "telegramUserId"
>;

type TelegramMembershipStatus = "joined" | "left";

const BOT_COMMANDS = {
  help: "/help",
  myLessons: "/my_lessons",
  registerChat: "/register_chat",
  start: "/start",
} as const;

const resolveBotLocale = (candidateLocale: string | null | undefined): BotLocale => {
  const normalizedLocale = (candidateLocale ?? "").trim().toLowerCase();

  if (normalizedLocale.startsWith("en")) {
    return "en";
  }

  if (normalizedLocale.startsWith("pl")) {
    return "pl";
  }

  return "ru";
};

const getBotCopy = (locale: BotLocale) => BOT_COPY[locale];

const buildHelpText = (locale: BotLocale) => {
  const copy = getBotCopy(locale);

  return [copy.helpTitle, copy.startCommand, copy.myLessonsCommand].join("\n");
};

const sendPurchasedLessons = async ({
  chatId,
  preferredLocale,
  telegramUserId,
}: {
  chatId: number;
  preferredLocale: BotLocale;
  telegramUserId: string;
}) => {
  const baseCopy = getBotCopy(preferredLocale);
  const payments = await getActivatedPaymentsByTelegramUserId(telegramUserId);

  if (payments.length === 0) {
    await sendTelegramMessage({
      chatId,
      text: baseCopy.noPurchases,
    });
    return;
  }

  for (const payment of payments) {
    const locale = resolvePurchaseBotLocale({
      checkoutLocale: payment.checkout_locale,
      lessonLanguage: payment.lesson_language,
    });
    const copy = getBotCopy(locale);
    // The stored purchase line is Russian for the admin; the buyer gets her own language.
    const purchaseLine =
      getBuyerPurchaseLine({
        locale,
        offerId: payment.offer_id,
        showOfferLabel: shouldShowOfferToBuyerByOfferId(payment.offer_id),
      }) ||
      payment.product_title ||
      payment.purchase_item;
    const lessonSource = getTelegramLessonSourceByOfferId({
      lessonLanguage: payment.lesson_language,
      locale,
      offerId: payment.offer_id,
    });

    if (!lessonSource) {
      await sendTelegramMessage({
        chatId,
        text: `${copy.sourceMissing}\n\n${purchaseLine}`,
      });
      continue;
    }

    await sendTelegramMessage({
      chatId,
      text: `${copy.lessonPrefix} ${lessonSource.lessonTitle}`,
    });

    try {
      await copyTelegramMessage({
        sourceChatId: lessonSource.sourceChatId,
        sourceMessageId: lessonSource.sourceMessageId,
        targetChatId: chatId,
      });
    } catch (error) {
      // No Telegram user id in the log: the payment intent names the purchase.
      logSafeError("Failed to copy Telegram lesson message", error, {
        reference: payment.payment_intent_id,
      });
      await sendTelegramMessage({
        chatId,
        text: `${copy.lessonDeliveryFailed}\n\n${purchaseLine}`,
      });
    }
  }
};

const handleStartCommand = async ({
  chatId,
  commandPayload,
  preferredLocale,
  telegramUserId,
  telegramUsername,
}: {
  chatId: number;
  commandPayload: string;
  preferredLocale: BotLocale;
  telegramUserId: string;
  telegramUsername: string;
}) => {
  const preferredCopy = getBotCopy(preferredLocale);

  if (!commandPayload) {
    await sendTelegramMessage({
      chatId,
      text: [
        preferredCopy.intro,
        preferredCopy.startHint,
        "",
        buildHelpText(preferredLocale),
      ].join("\n"),
    });
    return;
  }

  await sendTelegramMessage({
    chatId,
    text: preferredCopy.checkingAccess,
  });

  const activationResult = await activateTelegramStartToken({
    telegramUserId,
    telegramUsername,
    tokenValue: commandPayload,
  });

  switch (activationResult.status) {
    case "activated": {
      const locale = resolvePurchaseBotLocale({
        checkoutLocale: activationResult.paymentRecord.checkout_locale,
        lessonLanguage: activationResult.paymentRecord.lesson_language,
      });
      const copy = getBotCopy(locale);

      await sendTelegramMessage({
        chatId,
        text: copy.accessConfirmed,
      });
      await sendPurchasedLessons({
        chatId,
        preferredLocale: locale,
        telegramUserId,
      });
      return;
    }
    case "already_activated": {
      const locale = resolvePurchaseBotLocale({
        checkoutLocale: activationResult.paymentRecord.checkout_locale,
        lessonLanguage: activationResult.paymentRecord.lesson_language,
      });
      const copy = getBotCopy(locale);

      await sendTelegramMessage({
        chatId,
        text: copy.alreadyActivated,
      });
      await sendPurchasedLessons({
        chatId,
        preferredLocale: locale,
        telegramUserId,
      });
      return;
    }
    case "expired":
      await sendTelegramMessage({
        chatId,
        text: preferredCopy.expired,
      });
      return;
    case "token_claimed_by_another_user":
      await sendTelegramMessage({
        chatId,
        text: preferredCopy.tokenClaimedByAnotherUser,
      });
      return;
    case "token_already_used":
      await sendTelegramMessage({
        chatId,
        text: preferredCopy.tokenAlreadyUsed,
      });
      return;
    case "not_available":
      await sendTelegramMessage({
        chatId,
        text: preferredCopy.notAvailable,
      });
      return;
    case "invalid_token":
    default:
      await sendTelegramMessage({
        chatId,
        text: preferredCopy.invalidToken,
      });
  }
};

const getOkWebhookResponse = () =>
  jsonNoStore({
    ok: true,
  });

const validateTelegramWebhookRequest = (request: Request): Response | null => {
  if (isPayloadTooLarge(request, MAX_TELEGRAM_WEBHOOK_BODY_BYTES)) {
    return jsonErrorNoStore("payload_too_large", { status: 413 });
  }

  if (!isTelegramBotConfigured()) {
    return jsonNoStore({
      ignored: true,
      ok: true,
      reason: "telegram_bot_not_configured",
    });
  }

  const webhookSecret = getTelegramWebhookSecret();
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && !webhookSecret) {
    console.error("TELEGRAM_WEBHOOK_SECRET is required in production");

    return jsonErrorNoStore("missing_webhook_secret", { status: 500 });
  }

  if (!webhookSecret) {
    return null;
  }

  const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";

  if (!areEqualInTimingSafeWay(receivedSecret, webhookSecret)) {
    return jsonErrorNoStore("invalid_webhook_secret", { status: 401 });
  }

  return null;
};

const getTelegramMembershipStatus = ({
  newMember,
  oldMember,
}: {
  newMember: TelegramChatMember | undefined;
  oldMember: TelegramChatMember | undefined;
}): TelegramMembershipStatus | null => {
  const wasActive = isActiveTelegramMember(oldMember);
  const isActive = isActiveTelegramMember(newMember);

  if (!wasActive && isActive) {
    return "joined";
  }

  if (wasActive && !isActive) {
    return "left";
  }

  return null;
};

const syncTelegramMembershipProviders = async ({
  chatId,
  chatMemberUpdate,
  membershipStatus,
  telegramUserId,
  telegramUsername,
}: {
  chatId: string;
  chatMemberUpdate: TelegramChatMemberUpdate;
  membershipStatus: TelegramMembershipStatus;
  telegramUserId: string;
  telegramUsername: string;
}): Promise<void> => {
  // Only a join carries the invite link that tells whose access it was.
  const membership = {
    chatId,
    inviteLink:
      membershipStatus === "joined"
        ? (chatMemberUpdate.invite_link?.invite_link ?? "")
        : undefined,
    membershipStatus,
    telegramUserId,
    telegramUsername,
  };

  if (!(await syncOnlineGroupMembership(membership))) {
    await syncTelegramChannelMembership(membership);
  }
};

const handleTelegramChatMemberUpdate = async (
  chatMemberUpdate: TelegramChatMemberUpdate,
): Promise<Response> => {
  const chatId = chatMemberUpdate.chat?.id;
  const newMember = chatMemberUpdate.new_chat_member;
  const telegramUserId = newMember?.user?.id ? String(newMember.user.id) : "";

  if (chatId && telegramUserId) {
    const membershipStatus = getTelegramMembershipStatus({
      newMember,
      oldMember: chatMemberUpdate.old_chat_member,
    });

    if (membershipStatus) {
      await syncTelegramMembershipProviders({
        chatId: String(chatId),
        chatMemberUpdate,
        membershipStatus,
        telegramUserId,
        telegramUsername: newMember?.user?.username ?? "",
      });
    }
  }

  return getOkWebhookResponse();
};

const handleTelegramGroupMessage = async ({
  chatId,
  chatType,
  message,
  normalizedCommand,
  preferredLocale,
  telegramUserId,
  telegramUsername,
}: TelegramMessageContext): Promise<Response> => {
  if (normalizedCommand !== BOT_COMMANDS.registerChat) {
    return getOkWebhookResponse();
  }

  const requestingMember = await getTelegramChatMember({
    chatId: String(chatId),
    userId: telegramUserId,
  });

  if (
    requestingMember.status !== "administrator" &&
    requestingMember.status !== "creator"
  ) {
    await sendTelegramMessage({
      chatId,
      text: getBotCopy(preferredLocale).groupRegistrationForbidden,
    });

    return getOkWebhookResponse();
  }

  const savedChat = await upsertRegisteredTelegramChat({
    chatId: String(chatId),
    registeredByTelegramUserId: telegramUserId,
    registeredByTelegramUsername: telegramUsername,
    title: message.chat?.title ?? String(chatId),
    type: chatType,
  });

  await sendTelegramMessage({
    chatId,
    text: `${getBotCopy(preferredLocale).groupRegistered}\n${savedChat.title}\nID: ${savedChat.chatId}`,
  });

  return getOkWebhookResponse();
};

const handleTelegramPrivateMessage = async ({
  chatId,
  commandPayload,
  normalizedCommand,
  preferredLocale,
  telegramUserId,
  telegramUsername,
}: TelegramMessageContext): Promise<Response> => {
  if (normalizedCommand === BOT_COMMANDS.start) {
    await handleStartCommand({
      chatId,
      commandPayload,
      preferredLocale,
      telegramUserId,
      telegramUsername,
    });

    return getOkWebhookResponse();
  }

  if (normalizedCommand === BOT_COMMANDS.myLessons) {
    await sendPurchasedLessons({
      chatId,
      preferredLocale,
      telegramUserId,
    });

    return getOkWebhookResponse();
  }

  if (normalizedCommand === BOT_COMMANDS.help) {
    await sendTelegramMessage({
      chatId,
      text: buildHelpText(preferredLocale),
    });

    return getOkWebhookResponse();
  }

  await sendTelegramMessage({
    chatId,
    text: `${getBotCopy(preferredLocale).unknownCommand}\n\n${buildHelpText(preferredLocale)}`,
  });

  return getOkWebhookResponse();
};

const getTelegramMessageEnvelope = (
  update: TelegramUpdate | null,
): TelegramMessageEnvelope | null => {
  const message = update?.message;
  const chatId = message?.chat?.id;
  const chatType = message?.chat?.type ?? "";
  const telegramUserId = message?.from?.id ? String(message.from.id) : "";

  if (!message || !chatId || !telegramUserId) {
    return null;
  }

  return {
    chatId,
    chatType,
    message,
    telegramUserId,
  };
};

const handleTelegramMessage = async ({
  fallback,
  update,
}: {
  fallback: TelegramWebhookFallback;
  update: TelegramUpdate | null;
}): Promise<Response> => {
  const envelope = getTelegramMessageEnvelope(update);

  if (!envelope) {
    return getOkWebhookResponse();
  }

  const { chatId, chatType, message, telegramUserId } = envelope;
  const telegramUsername = message.from?.username?.trim() ?? "";
  const preferredLocale = resolveBotLocale(message.from?.language_code);

  // Set fallback routing before parsing commands so downstream failures notify
  // the same private or group chat as the original update.
  fallback.chatId = chatId;
  fallback.locale = preferredLocale;

  const text = message.text?.trim() ?? "";
  const [command = "", commandPayload = ""] = text.split(/\s+/, 2);
  const normalizedCommand = command.split("@")[0]?.trim() ?? "";
  const context: TelegramMessageContext = {
    chatId,
    chatType,
    commandPayload,
    message,
    normalizedCommand,
    preferredLocale,
    telegramUserId,
    telegramUsername,
  };

  return chatType === "private"
    ? handleTelegramPrivateMessage(context)
    : handleTelegramGroupMessage(context);
};

const handleTelegramWebhookError = async ({
  error,
  fallback,
}: {
  error: unknown;
  fallback: TelegramWebhookFallback;
}): Promise<Response> => {
  logSafeError("Failed to process Telegram webhook", error);

  if (fallback.chatId) {
    try {
      await sendTelegramMessage({
        chatId: fallback.chatId,
        text: getBotCopy(fallback.locale).temporaryIssue,
      });
    } catch (telegramError) {
      logSafeError("Failed to send Telegram fallback error message", telegramError);
    }
  }

  return jsonErrorNoStore("telegram_webhook_failed", {
    status: 500,
  });
};

export async function POST(request: Request) {
  const validationError = validateTelegramWebhookRequest(request);

  if (validationError) {
    return validationError;
  }

  const fallback: TelegramWebhookFallback = {
    chatId: null,
    locale: "ru",
  };

  try {
    const { body: update, errorResponse: bodyErrorResponse } =
      await parseJsonBody<TelegramUpdate>(request, MAX_TELEGRAM_WEBHOOK_BODY_BYTES);

    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }
    const chatMemberUpdate = update?.chat_member;

    if (chatMemberUpdate) {
      return await handleTelegramChatMemberUpdate(chatMemberUpdate);
    }

    return await handleTelegramMessage({
      fallback,
      update,
    });
  } catch (error) {
    return handleTelegramWebhookError({
      error,
      fallback,
    });
  }
}
