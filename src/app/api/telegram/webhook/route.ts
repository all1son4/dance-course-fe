import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { upsertRegisteredTelegramChat } from "@/db/renewal-campaigns";
import { isPayloadTooLarge, jsonNoStore, parseJsonBody } from "@/lib/http-security";
import {
  activateTelegramStartToken,
  getActivatedPaymentsByTelegramUserId,
  syncTelegramChannelMembership,
} from "@/lib/telegram/access";
import {
  copyTelegramMessage,
  getTelegramChatMember,
  sendTelegramMessage,
} from "@/lib/telegram/bot-api";
import {
  getTelegramLessonSourceByOfferId,
  getTelegramWebhookSecret,
  isTelegramBotConfigured,
} from "@/lib/telegram/config";
import { syncOnlineGroupMembership } from "@/lib/telegram/online-group-access";

export const runtime = "nodejs";

const MAX_TELEGRAM_WEBHOOK_BODY_BYTES = 512 * 1024;

type BotLocale = "en" | "pl" | "ru";

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

type TelegramChatMember = {
  is_member?: boolean;
  status?: string;
  user?: {
    id?: number;
    username?: string;
  };
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

const BOT_COPY = {
  en: {
    accessConfirmed: "Access confirmed. Sending your lesson.",
    alreadyActivated:
      "Access is already activated for this account. Sending your materials again.",
    checkingAccess: "Checking access, please wait a few seconds...",
    expired: `This link has expired. Return to the success page or request a new link via support: ${SUPPORT_TELEGRAM_URL}`,
    helpTitle: "Bot commands:",
    invalidToken:
      "Invalid activation code. Open the bot using the personal link from your purchase email.",
    intro:
      "Hi! This bot delivers your lesson materials for purchases without mentor support.",
    lessonPrefix: "Your material:",
    lessonDeliveryFailed: `We could not send the lesson automatically. Please contact support and we will help: ${SUPPORT_TELEGRAM_URL}`,
    myLessonsCommand: "/my_lessons - get your lessons again",
    noPurchases:
      "No activated purchases found yet. Make sure you opened the bot via your personal email link.",
    notAvailable: `Could not confirm access with this link. Please contact support and we will help: ${SUPPORT_TELEGRAM_URL}`,
    sourceMissing: `Access is activated, but the lesson source is not configured yet. Please contact support: ${SUPPORT_TELEGRAM_URL}`,
    startCommand: "/start <code> - activate access after purchase",
    startHint:
      "Open the personal link from the email after payment to activate your access.",
    tokenAlreadyUsed:
      "This link was already used. If this is your account, use /my_lessons.",
    tokenClaimedByAnotherUser:
      "This link has already been activated by another Telegram account.",
    temporaryIssue:
      "Temporary technical issue while checking access. Please try /start again in a minute.",
    unknownCommand: "Command not recognized.",
    groupRegistered: "Chat registered for renewal campaigns.",
    groupRegistrationForbidden:
      "Only a chat owner or administrator can register this chat.",
  },
  pl: {
    accessConfirmed: "Dostęp potwierdzony. Wysyłam Twoją lekcję.",
    alreadyActivated:
      "Dostęp jest już aktywowany na tym koncie. Wysyłam materiały ponownie.",
    checkingAccess: "Sprawdzam dostęp, poczekaj kilka sekund...",
    expired: `Link wygasł. Wróć na stronę sukcesu płatności lub poproś wsparcie o nowy link: ${SUPPORT_TELEGRAM_URL}`,
    helpTitle: "Komendy bota:",
    invalidToken:
      "Nieprawidłowy kod aktywacyjny. Otwórz bota z osobistego linku w e-mailu po zakupie.",
    intro: "Cześć! Ten bot udostępnia materiały po zakupach bez wsparcia mentora.",
    lessonPrefix: "Twój materiał:",
    lessonDeliveryFailed: `Nie udało się automatycznie wysłać lekcji. Skontaktuj się ze wsparciem, pomożemy: ${SUPPORT_TELEGRAM_URL}`,
    myLessonsCommand: "/my_lessons - pobierz swoje lekcje ponownie",
    noPurchases:
      "Nie znaleziono jeszcze aktywowanych zakupów. Upewnij się, że otworzyłeś bota przez osobisty link z e-maila.",
    notAvailable: `Nie udało się potwierdzić dostępu tym linkiem. Skontaktuj się ze wsparciem: ${SUPPORT_TELEGRAM_URL}`,
    sourceMissing: `Dostęp aktywowany, ale źródło lekcji nie jest jeszcze skonfigurowane. Skontaktuj się ze wsparciem: ${SUPPORT_TELEGRAM_URL}`,
    startCommand: "/start <kod> - aktywuj dostęp po zakupie",
    startHint: "Otwórz osobisty link z e-maila po płatności, aby aktywować dostęp.",
    tokenAlreadyUsed:
      "Ten link został już użyty. Jeśli to Twoje konto, użyj /my_lessons.",
    tokenClaimedByAnotherUser:
      "Ten link został już aktywowany przez inne konto Telegram.",
    temporaryIssue:
      "Wystąpił chwilowy problem techniczny podczas weryfikacji dostępu. Spróbuj ponownie /start za minutę.",
    unknownCommand: "Nie rozpoznano polecenia.",
    groupRegistered: "Czat zapisany dla kampanii kontynuacji.",
    groupRegistrationForbidden:
      "Tylko właściciel lub administrator może zarejestrować ten czat.",
  },
  ru: {
    accessConfirmed: "Доступ подтвержден. Отправляю ваш урок.",
    alreadyActivated:
      "Доступ уже активирован на этом аккаунте. Отправляю ваши материалы повторно.",
    checkingAccess: "Проверяю доступ, подождите пару секунд...",
    expired: `Срок действия ссылки истек. Вернитесь на страницу успешной оплаты или запросите новую ссылку через поддержку: ${SUPPORT_TELEGRAM_URL}`,
    helpTitle: "Команды бота:",
    invalidToken:
      "Неверный код активации. Откройте бота по персональной ссылке из письма после оплаты.",
    intro: "Привет! Этот бот выдает материалы по покупкам без куратора.",
    lessonPrefix: "Ваш материал:",
    lessonDeliveryFailed: `Не удалось отправить урок автоматически. Напишите в поддержку, пожалуйста: ${SUPPORT_TELEGRAM_URL}`,
    myLessonsCommand: "/my_lessons - получить ваши уроки повторно",
    noPurchases:
      "У вас пока нет активированных покупок. Проверьте, что вы открыли бота по персональной ссылке из письма.",
    notAvailable: `Не удалось подтвердить доступ по этой ссылке. Напишите в поддержку, пожалуйста: ${SUPPORT_TELEGRAM_URL}`,
    sourceMissing: `Доступ активирован, но источник урока пока не настроен. Напишите в поддержку, пожалуйста: ${SUPPORT_TELEGRAM_URL}`,
    startCommand: "/start <код> - активировать доступ после покупки",
    startHint:
      "Откройте персональную ссылку из письма после оплаты, чтобы активировать доступ.",
    tokenAlreadyUsed:
      "Эта ссылка уже была использована. Если это ваш аккаунт, используйте /my_lessons.",
    tokenClaimedByAnotherUser: "Эта ссылка уже активирована другим Telegram-аккаунтом.",
    temporaryIssue:
      "Временная техническая ошибка при проверке доступа. Попробуйте /start еще раз через минуту.",
    unknownCommand: "Команда не распознана.",
    groupRegistered: "Чат зарегистрирован для продлений.",
    groupRegistrationForbidden:
      "Зарегистрировать чат может только его владелец или администратор.",
  },
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

const resolvePurchaseBotLocale = ({
  checkoutLocale,
  lessonLanguage,
}: {
  checkoutLocale: string | null | undefined;
  lessonLanguage: string | null | undefined;
}): BotLocale => {
  const normalizedLessonLanguage = (lessonLanguage ?? "").trim().toLowerCase();

  if (normalizedLessonLanguage.startsWith("en")) {
    return "en";
  }

  if (normalizedLessonLanguage.startsWith("ru")) {
    return "ru";
  }

  const normalizedCheckoutLocale = (checkoutLocale ?? "").trim().toLowerCase();

  if (normalizedCheckoutLocale.startsWith("en")) {
    return "en";
  }

  return "ru";
};

const getBotCopy = (locale: BotLocale) => BOT_COPY[locale];

const buildHelpText = (locale: BotLocale) => {
  const copy = getBotCopy(locale);

  return [copy.helpTitle, copy.startCommand, copy.myLessonsCommand].join("\n");
};

const isActiveTelegramMember = (member: TelegramChatMember | undefined) => {
  const status = member?.status?.trim() ?? "";

  if (status === "member" || status === "administrator" || status === "creator") {
    return true;
  }

  if (status === "restricted") {
    return member?.is_member === true;
  }

  return false;
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
    const lessonSource = getTelegramLessonSourceByOfferId({
      lessonLanguage: payment.lesson_language,
      locale,
      offerId: payment.offer_id,
    });

    if (!lessonSource) {
      await sendTelegramMessage({
        chatId,
        text: `${copy.sourceMissing}\n\n${payment.purchase_item || payment.product_title}`,
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
      console.error("Failed to copy Telegram lesson message", {
        error,
        offerId: payment.offer_id,
        sourceChatId: lessonSource.sourceChatId,
        sourceMessageId: lessonSource.sourceMessageId,
        telegramUserId,
      });
      await sendTelegramMessage({
        chatId,
        text: `${copy.lessonDeliveryFailed}\n\n${payment.purchase_item || payment.product_title}`,
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

export async function POST(request: Request) {
  if (isPayloadTooLarge(request, MAX_TELEGRAM_WEBHOOK_BODY_BYTES)) {
    return jsonNoStore(
      {
        errorCode: "payload_too_large",
      },
      { status: 413 },
    );
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

    return jsonNoStore(
      {
        errorCode: "missing_webhook_secret",
      },
      { status: 500 },
    );
  }

  if (webhookSecret) {
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";

    if (receivedSecret !== webhookSecret) {
      return jsonNoStore(
        {
          errorCode: "invalid_webhook_secret",
        },
        { status: 401 },
      );
    }
  }

  let fallbackChatId: number | null = null;
  let fallbackLocale: BotLocale = "ru";

  try {
    const update = await parseJsonBody<TelegramUpdate>(request);
    const chatMemberUpdate = update?.chat_member;

    if (chatMemberUpdate) {
      const chatId = chatMemberUpdate.chat?.id;
      const newMember = chatMemberUpdate.new_chat_member;
      const oldMember = chatMemberUpdate.old_chat_member;
      const telegramUserId = newMember?.user?.id ? String(newMember.user.id) : "";

      if (chatId && telegramUserId) {
        const wasActive = isActiveTelegramMember(oldMember);
        const isActive = isActiveTelegramMember(newMember);

        if (!wasActive && isActive) {
          const handledByOnlineGroup = await syncOnlineGroupMembership({
            chatId: String(chatId),
            inviteLink: chatMemberUpdate.invite_link?.invite_link ?? "",
            membershipStatus: "joined",
            telegramUserId,
            telegramUsername: newMember?.user?.username ?? "",
          });

          if (!handledByOnlineGroup) {
            await syncTelegramChannelMembership({
              chatId: String(chatId),
              inviteLink: chatMemberUpdate.invite_link?.invite_link ?? "",
              membershipStatus: "joined",
              telegramUserId,
              telegramUsername: newMember?.user?.username ?? "",
            });
          }
        } else if (wasActive && !isActive) {
          const handledByOnlineGroup = await syncOnlineGroupMembership({
            chatId: String(chatId),
            membershipStatus: "left",
            telegramUserId,
            telegramUsername: newMember?.user?.username ?? "",
          });

          if (!handledByOnlineGroup) {
            await syncTelegramChannelMembership({
              chatId: String(chatId),
              membershipStatus: "left",
              telegramUserId,
              telegramUsername: newMember?.user?.username ?? "",
            });
          }
        }
      }

      return jsonNoStore({
        ok: true,
      });
    }

    const message = update?.message;
    const chatId = message?.chat?.id;
    const chatType = message?.chat?.type ?? "";
    const telegramUserId = message?.from?.id ? String(message.from.id) : "";

    if (!message || !chatId || !telegramUserId) {
      return jsonNoStore({
        ok: true,
      });
    }

    const telegramUsername = message.from?.username?.trim() ?? "";
    const preferredLocale = resolveBotLocale(message.from?.language_code);
    fallbackChatId = chatId;
    fallbackLocale = preferredLocale;
    const text = message.text?.trim() ?? "";
    const [command = "", payload = ""] = text.split(/\s+/, 2);
    const normalizedCommand = command.split("@")[0]?.trim() ?? "";

    if (chatType !== "private") {
      if (normalizedCommand === "/register_chat") {
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

          return jsonNoStore({
            ok: true,
          });
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
      }

      return jsonNoStore({
        ok: true,
      });
    }

    if (normalizedCommand === "/start") {
      await handleStartCommand({
        chatId,
        commandPayload: payload,
        preferredLocale,
        telegramUserId,
        telegramUsername,
      });

      return jsonNoStore({
        ok: true,
      });
    }

    if (normalizedCommand === "/my_lessons") {
      await sendPurchasedLessons({
        chatId,
        preferredLocale,
        telegramUserId,
      });

      return jsonNoStore({
        ok: true,
      });
    }

    if (normalizedCommand === "/help") {
      await sendTelegramMessage({
        chatId,
        text: buildHelpText(preferredLocale),
      });

      return jsonNoStore({
        ok: true,
      });
    }

    await sendTelegramMessage({
      chatId,
      text: `${getBotCopy(preferredLocale).unknownCommand}\n\n${buildHelpText(preferredLocale)}`,
    });

    return jsonNoStore({
      ok: true,
    });
  } catch (error) {
    console.error("Failed to process Telegram webhook", error);

    if (fallbackChatId) {
      try {
        await sendTelegramMessage({
          chatId: fallbackChatId,
          text: getBotCopy(fallbackLocale).temporaryIssue,
        });
      } catch (telegramError) {
        console.error("Failed to send Telegram fallback error message", telegramError);
      }
    }

    return jsonNoStore(
      {
        errorCode: "telegram_webhook_failed",
      },
      {
        status: 500,
      },
    );
  }
}
