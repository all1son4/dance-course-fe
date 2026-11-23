import { SUPPORT_TELEGRAM_URL } from "@/constants/links";

/** What the Telegram bot says, in the three languages, and which language a purchase reads. */

export type BotLocale = "en" | "pl" | "ru";

export const BOT_COPY = {
  en: {
    accessConfirmed: "Access confirmed. Sending your lesson.",
    alreadyActivated:
      "Access is already activated for this account. Sending your materials again.",
    checkingAccess: "Checking access, please wait a few seconds...",
    expired: `This link has expired. Go back to the payment confirmation page or message support for a new link: ${SUPPORT_TELEGRAM_URL}`,
    helpTitle: "Bot commands:",
    invalidToken:
      "Invalid activation code. Open the bot using the personal link from your purchase email.",
    intro: "Hi! This bot sends you the lessons you bought without a mentor.",
    lessonPrefix: "Your material:",
    lessonDeliveryFailed: `We could not send the lesson automatically. Please contact support and we will help: ${SUPPORT_TELEGRAM_URL}`,
    myLessonsCommand: "/my_lessons - get your lessons again",
    noPurchases:
      "No activated purchases found yet. Make sure you opened the bot via your personal email link.",
    notAvailable: `Could not confirm access with this link. Please contact support and we will help: ${SUPPORT_TELEGRAM_URL}`,
    sourceMissing: `Access is active, but we couldn't send the lesson automatically. Message support and we'll help: ${SUPPORT_TELEGRAM_URL}`,
    startCommand: "/start <code> - activate access after purchase",
    startHint:
      "Open the personal link from the email after payment to activate your access.",
    tokenAlreadyUsed:
      "This link was already used. If this is your account, use /my_lessons.",
    tokenClaimedByAnotherUser:
      "This link has already been activated by another Telegram account.",
    temporaryIssue:
      "Temporary technical issue while checking access. In a minute, open the link from your email again.",
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
    expired: `Link wygasł. Wróć na stronę potwierdzenia płatności albo napisz do nas po nowy link: ${SUPPORT_TELEGRAM_URL}`,
    helpTitle: "Komendy bota:",
    invalidToken:
      "Nieprawidłowy kod aktywacyjny. Otwórz bota z osobistego linku w e-mailu po zakupie.",
    intro: "Cześć! Ten bot wysyła lekcje kupione bez mentora.",
    lessonPrefix: "Twój materiał:",
    lessonDeliveryFailed: `Nie udało się automatycznie wysłać lekcji. Skontaktuj się ze wsparciem, pomożemy: ${SUPPORT_TELEGRAM_URL}`,
    myLessonsCommand: "/my_lessons - pobierz swoje lekcje ponownie",
    noPurchases:
      "Nie znaleziono jeszcze aktywowanych zakupów. Upewnij się, że otwierasz bota przez osobisty link z e-maila.",
    notAvailable: `Nie udało się potwierdzić dostępu tym linkiem. Skontaktuj się ze wsparciem: ${SUPPORT_TELEGRAM_URL}`,
    sourceMissing: `Dostęp jest aktywny, ale nie udało się automatycznie wysłać lekcji. Napisz do nas — pomożemy: ${SUPPORT_TELEGRAM_URL}`,
    startCommand: "/start <kod> - aktywuj dostęp po zakupie",
    startHint: "Otwórz osobisty link z e-maila po płatności, aby aktywować dostęp.",
    tokenAlreadyUsed:
      "Ten link został już użyty. Jeśli to Twoje konto, użyj /my_lessons.",
    tokenClaimedByAnotherUser:
      "Ten link został już aktywowany przez inne konto Telegram.",
    temporaryIssue:
      "Wystąpił chwilowy problem techniczny podczas weryfikacji dostępu. Za minutę otwórz ponownie link z e-maila.",
    unknownCommand: "Nie rozpoznano polecenia.",
    groupRegistered: "Czat zapisany dla kampanii kontynuacji.",
    groupRegistrationForbidden:
      "Tylko właściciel lub administrator może zarejestrować ten czat.",
  },
  ru: {
    accessConfirmed: "Доступ подтверждён. Отправляю твой урок.",
    alreadyActivated:
      "Доступ для этого аккаунта уже активирован. Отправляю материалы ещё раз.",
    checkingAccess: "Проверяю доступ, подожди пару секунд...",
    expired: `Срок действия ссылки истёк. Вернись на страницу подтверждения оплаты или напиши в поддержку — поможем: ${SUPPORT_TELEGRAM_URL}`,
    helpTitle: "Команды бота:",
    invalidToken:
      "Неверный код активации. Открой бота по персональной ссылке из письма после оплаты.",
    intro: "Привет! Этот бот присылает уроки, купленные без куратора.",
    lessonPrefix: "Твой материал:",
    lessonDeliveryFailed: `Не удалось отправить урок автоматически. Напиши в поддержку, пожалуйста: ${SUPPORT_TELEGRAM_URL}`,
    myLessonsCommand: "/my_lessons — получить свои уроки ещё раз",
    noPurchases:
      "Активированных покупок пока нет. Открой бота по персональной ссылке из письма — так доступ привяжется к твоему аккаунту.",
    notAvailable: `Не удалось подтвердить доступ по этой ссылке. Напиши в поддержку, пожалуйста: ${SUPPORT_TELEGRAM_URL}`,
    sourceMissing: `Доступ активирован, но урок не получилось отправить автоматически. Напиши в поддержку — поможем: ${SUPPORT_TELEGRAM_URL}`,
    startCommand: "/start <код> — активировать доступ после покупки",
    startHint:
      "Открой персональную ссылку из письма после оплаты, чтобы активировать доступ.",
    tokenAlreadyUsed:
      "Эта ссылка уже была использована. Если это твой аккаунт, используй /my_lessons.",
    tokenClaimedByAnotherUser: "Эта ссылка уже активирована другим Telegram-аккаунтом.",
    temporaryIssue:
      "Временная техническая ошибка при проверке доступа. Через минуту снова открой ссылку из письма.",
    unknownCommand: "Команда не распознана.",
    groupRegistered: "Чат зарегистрирован для продлений.",
    groupRegistrationForbidden:
      "Зарегистрировать чат может только его владелец или администратор.",
  },
} as const;

export const resolvePurchaseBotLocale = ({
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
