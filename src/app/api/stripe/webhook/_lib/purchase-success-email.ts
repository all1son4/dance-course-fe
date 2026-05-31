import { getResolvedCheckoutLocale } from "@/app/api/stripe/payment-intent/lib";
import { DEFAULT_SITE_HOME_URL, SUPPORT_TELEGRAM_URL } from "@/constants/links";

const SITE_HOME_URL =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  DEFAULT_SITE_HOME_URL;

const EMAIL_COPY = {
  en: {
    amountLabel: "Amount",
    autoReplyNote:
      "This is an automatic email. If you have any questions, contact support",
    backToSite: "Back to website",
    defaultOfferLabel: "Standard access",
    heading: "Thank you, your payment was successful",
    intro: "We have prepared your course access and receipt details.",
    invoiceAttached: "The PDF invoice is attached to this email.",
    offerLabel: "Offer",
    paymentSucceededText: "Payment successful",
    productLabel: "Product",
    receiptLinkCta: "Open Stripe receipt",
    receiptLinkValidity:
      "This receipt link is temporary and usually remains active for up to 30 days.",
    receiptPdfCta: "Download PDF receipt",
    receiptPending:
      "Stripe receipt is being prepared. We will send it as soon as it is available.",
    receiptTitle: "Your payment receipt",
    siteLabel: "Website",
    subjectPrefix: "Payment confirmed",
    summaryTitle: "Purchase summary",
    access: {
      manualAdmin: {
        title: "Next step",
        body: "The admin will contact you and add you to the online group manually. No Telegram access link is required for this purchase.",
      },
      support: {
        title: "Access details",
        body: "We have received your payment. If access is not delivered shortly, contact support and we will help.",
      },
      telegramChannel: {
        title: "Access your materials",
        ready:
          "Use the button below to open your personal one-use invite link to the private Telegram channel. Access to the materials is provided for 2 months.",
        pending:
          "Your personal Telegram channel invite link is being prepared. If the button is missing, contact support and we will send access manually.",
        cta: "Open Telegram channel",
        mentorNote:
          "For the mentor option, the admin will also contact you separately about feedback.",
      },
      telegramChat: {
        title: "Access your course",
        ready:
          "Use the button below to open your personal one-use invite link to the private Telegram chat with the course materials. Access to the lessons is provided for 4 months.",
        pending:
          "Your personal Telegram chat invite link is being prepared. If the button is missing, contact support and we will send access manually.",
        cta: "Open Telegram chat",
      },
    },
  },
  pl: {
    amountLabel: "Kwota",
    autoReplyNote:
      "To wiadomość automatyczna. Jeśli masz pytania, skontaktuj się ze wsparciem",
    backToSite: "Wróć na stronę",
    defaultOfferLabel: "Dostęp standardowy",
    heading: "Dziękujemy, płatność zakończyła się sukcesem",
    intro: "Przygotowaliśmy dostęp do kursu oraz dane dotyczące rachunku.",
    invoiceAttached: "Faktura PDF jest załączona do tej wiadomości.",
    offerLabel: "Pakiet",
    paymentSucceededText: "Płatność zakończyła się sukcesem",
    productLabel: "Produkt",
    receiptLinkCta: "Otwórz paragon Stripe",
    receiptLinkValidity: "Link do paragonu jest tymczasowy i zwykle działa do 30 dni.",
    receiptPdfCta: "Pobierz paragon PDF",
    receiptPending:
      "Paragon Stripe jest jeszcze przygotowywany. Wyślemy go, gdy tylko będzie dostępny.",
    receiptTitle: "Rachunek za płatność",
    siteLabel: "Strona",
    subjectPrefix: "Płatność potwierdzona",
    summaryTitle: "Podsumowanie zakupu",
    access: {
      manualAdmin: {
        title: "Następny krok",
        body: "Administrator skontaktuje się z Tobą i ręcznie doda Cię do grupy online. Ta płatność nie wymaga linku dostępu do Telegrama.",
      },
      support: {
        title: "Szczegóły dostępu",
        body: "Otrzymaliśmy płatność. Jeśli dostęp nie zostanie wkrótce dostarczony, skontaktuj się ze wsparciem, a pomożemy.",
      },
      telegramChannel: {
        title: "Dostęp do materiałów",
        ready:
          "Użyj przycisku poniżej, aby otworzyć osobisty jednorazowy link zaproszenia do prywatnego kanału Telegram. Dostęp do materiałów otrzymujesz na 2 miesiące.",
        pending:
          "Twój osobisty link zaproszenia do kanału Telegram jest przygotowywany. Jeśli brakuje przycisku, skontaktuj się ze wsparciem, a wyślemy dostęp ręcznie.",
        cta: "Otwórz kanał Telegram",
        mentorNote:
          "W opcji z mentorem administrator skontaktuje się z Tobą osobno w sprawie feedbacku.",
      },
      telegramChat: {
        title: "Dostęp do kursu",
        ready:
          "Użyj przycisku poniżej, aby otworzyć osobisty jednorazowy link zaproszenia do prywatnego czatu Telegram z materiałami kursu. Dostęp do lekcji otrzymujesz na 4 miesiące.",
        pending:
          "Twój osobisty link zaproszenia do czatu Telegram jest przygotowywany. Jeśli brakuje przycisku, skontaktuj się ze wsparciem, a wyślemy dostęp ręcznie.",
        cta: "Otwórz czat Telegram",
      },
    },
  },
  ru: {
    amountLabel: "Сумма",
    autoReplyNote:
      "Это автоматическое письмо. Если у вас есть вопросы, свяжитесь с поддержкой",
    backToSite: "Вернуться на сайт",
    defaultOfferLabel: "Стандартный доступ",
    heading: "Спасибо, оплата прошла успешно",
    intro: "Мы подготовили доступ к материалам и данные по чеку.",
    invoiceAttached: "PDF-инвойс прикреплен к этому письму.",
    offerLabel: "Тариф",
    paymentSucceededText: "Оплата прошла успешно",
    productLabel: "Продукт",
    receiptLinkCta: "Открыть чек Stripe",
    receiptLinkValidity:
      "Ссылка на чек действует ограниченное время (обычно до 30 дней по правилам Stripe).",
    receiptPdfCta: "Скачать PDF-чек",
    receiptPending:
      "Чек Stripe еще формируется. Отправим его, как только он станет доступен.",
    receiptTitle: "Чек по оплате",
    siteLabel: "Сайт",
    subjectPrefix: "Оплата подтверждена",
    summaryTitle: "Кратко о покупке",
    access: {
      manualAdmin: {
        title: "Следующий шаг",
        body: "Администратор свяжется с вами и вручную добавит вас в онлайн-группу. Для этой покупки ссылка доступа в Telegram не нужна.",
      },
      support: {
        title: "Детали доступа",
        body: "Мы получили оплату. Если доступ не придет в ближайшее время, свяжитесь с поддержкой, и мы поможем.",
      },
      telegramChannel: {
        title: "Доступ к материалам",
        ready:
          "Нажмите кнопку ниже, чтобы открыть личную одноразовую ссылку-приглашение в приватный Telegram-канал. Доступ к материалам предоставляется на 2 месяца.",
        pending:
          "Личная ссылка-приглашение в Telegram-канал подготавливается. Если кнопки нет, свяжитесь с поддержкой, и мы отправим доступ вручную.",
        cta: "Открыть Telegram-канал",
        mentorNote:
          "Для тарифа с куратором администратор также отдельно свяжется с вами по поводу обратной связи.",
      },
      telegramChat: {
        title: "Доступ к курсу",
        ready:
          "Нажмите кнопку ниже, чтобы открыть личную одноразовую ссылку-приглашение в приватный Telegram-чат с материалами курса. Доступ к урокам предоставляется на 4 месяца.",
        pending:
          "Личная ссылка-приглашение в Telegram-чат подготавливается. Если кнопки нет, свяжитесь с поддержкой, и мы отправим доступ вручную.",
        cta: "Открыть Telegram-чат",
      },
    },
  },
} as const;

export type PurchaseSuccessEmailAccessKind =
  | "manual-admin"
  | "support"
  | "telegram-channel"
  | "telegram-chat";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCheckoutAmount = ({
  amountMinor,
  currency,
  locale,
}: {
  amountMinor: string;
  currency: string;
  locale: "ru" | "en" | "pl";
}) => {
  const parsedAmountMinor = Number.parseInt(amountMinor, 10);

  if (!Number.isFinite(parsedAmountMinor)) {
    return `${amountMinor} ${currency.toUpperCase()}`;
  }

  const intlLocale = locale === "pl" ? "pl-PL" : locale === "en" ? "en-US" : "ru-RU";

  return new Intl.NumberFormat(intlLocale, {
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(parsedAmountMinor / 100);
};

export type BuildPurchaseSuccessEmailInput = {
  amountMinor: string;
  checkoutCurrency: string;
  checkoutLocale?: string | null;
  offerLabel: string;
  productTitle: string;
  receiptKind?: "pdf" | "receipt" | null;
  receiptLink: string | null;
  showMentorFollowupNote?: boolean;
  accessKind: PurchaseSuccessEmailAccessKind;
  telegramAccessUrl?: string | null;
};

export const buildPurchaseSuccessEmail = ({
  accessKind,
  amountMinor,
  checkoutCurrency,
  checkoutLocale,
  offerLabel,
  productTitle,
  receiptKind,
  receiptLink,
  showMentorFollowupNote = false,
  telegramAccessUrl,
}: BuildPurchaseSuccessEmailInput) => {
  const locale = getResolvedCheckoutLocale(checkoutLocale);
  const copy = EMAIL_COPY[locale];
  const telegramLink = telegramAccessUrl ?? null;
  const amountLabel = formatCheckoutAmount({
    amountMinor,
    currency: checkoutCurrency,
    locale,
  });
  const safeProductTitle = escapeHtml(productTitle);
  const safeOfferLabel = escapeHtml(offerLabel || copy.defaultOfferLabel);
  const safeAmountLabel = escapeHtml(amountLabel);
  const safeReceiptLink = receiptLink ? escapeHtml(receiptLink) : "";
  const safeSupportTelegramUrl = escapeHtml(SUPPORT_TELEGRAM_URL);
  const safeTelegramLink = telegramLink ? escapeHtml(telegramLink) : "";
  const safeSiteHomeUrl = escapeHtml(SITE_HOME_URL);

  let accessTitle = "";
  let accessDescription = "";
  let accessCta = "";
  let mentorFollowupNote = "";

  switch (accessKind) {
    case "telegram-channel":
      accessTitle = copy.access.telegramChannel.title;
      accessDescription = telegramLink
        ? copy.access.telegramChannel.ready
        : copy.access.telegramChannel.pending;
      accessCta = copy.access.telegramChannel.cta;
      mentorFollowupNote = showMentorFollowupNote
        ? copy.access.telegramChannel.mentorNote
        : "";
      break;
    case "telegram-chat":
      accessTitle = copy.access.telegramChat.title;
      accessDescription = telegramLink
        ? copy.access.telegramChat.ready
        : copy.access.telegramChat.pending;
      accessCta = copy.access.telegramChat.cta;
      break;
    case "manual-admin":
      accessTitle = copy.access.manualAdmin.title;
      accessDescription = copy.access.manualAdmin.body;
      break;
    case "support":
      accessTitle = copy.access.support.title;
      accessDescription = copy.access.support.body;
      break;
  }

  const resolvedReceiptKind =
    receiptKind ??
    (receiptLink && /\.pdf(?:[?#].*)?$/i.test(receiptLink) ? "pdf" : "receipt");
  const receiptButtonLabel =
    resolvedReceiptKind === "pdf" ? copy.receiptPdfCta : copy.receiptLinkCta;
  const subject = `${copy.subjectPrefix}: ${productTitle}`;
  const receiptButton = receiptLink
    ? `
      <a href="${safeReceiptLink}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#ffffff;color:#121212;text-decoration:none;font-weight:600;font-size:14px;line-height:20px;border:1px solid rgba(18,18,18,0.16);">
        ${receiptButtonLabel}
      </a>
      ${
        resolvedReceiptKind === "receipt"
          ? `<p style="margin:10px 0 0 0;color:#6f6f6f;font-size:13px;line-height:20px;">${copy.receiptLinkValidity}</p>`
          : ""
      }
    `
    : `
      <p style="margin:0;color:#5f5f5f;font-size:14px;line-height:22px;">
        ${copy.receiptPending}
      </p>
    `;
  const accessButton =
    (accessKind === "telegram-channel" || accessKind === "telegram-chat") && telegramLink
      ? `
        <a href="${safeTelegramLink}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#7c0002;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;line-height:20px;border:1px solid #7c0002;">
          ${accessCta}
        </a>
      `
      : "";
  const mentorFollowupParagraph = mentorFollowupNote
    ? `
      <p style="margin:10px 0 0 0;color:#5f5f5f;font-size:14px;line-height:22px;">
        ${mentorFollowupNote}
      </p>
    `
    : "";

  const html = `
    <div style="margin:0;padding:32px 12px;background:#f3f2ef;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#121212;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid rgba(18,18,18,0.08);border-radius:28px;padding:32px;">
        <p style="margin:0 0 10px 0;font-size:12px;line-height:18px;letter-spacing:0.1em;text-transform:uppercase;color:#7a7064;font-weight:700;">Frame Up Strip</p>
        <h1 style="margin:0 0 12px 0;font-size:28px;line-height:34px;font-weight:700;color:#121212;">
          ${copy.heading}
        </h1>
        <p style="margin:0 0 26px 0;font-size:15px;line-height:24px;color:#444444;">
          ${copy.intro}
        </p>

        <div style="background:#faf9f7;border:1px solid rgba(18,18,18,0.08);border-radius:18px;padding:18px;margin-bottom:22px;">
          <p style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:#6f6f6f;font-weight:700;">${copy.summaryTitle}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:0 14px 8px 0;color:#6f6f6f;font-size:14px;line-height:22px;width:92px;vertical-align:top;">${copy.productLabel}</td>
              <td style="padding:0 0 8px 0;color:#121212;font-size:14px;line-height:22px;font-weight:700;vertical-align:top;">${safeProductTitle}</td>
            </tr>
            <tr>
              <td style="padding:0 14px 8px 0;color:#6f6f6f;font-size:14px;line-height:22px;width:92px;vertical-align:top;">${copy.offerLabel}</td>
              <td style="padding:0 0 8px 0;color:#121212;font-size:14px;line-height:22px;font-weight:700;vertical-align:top;">${safeOfferLabel}</td>
            </tr>
            <tr>
              <td style="padding:0 14px 0 0;color:#6f6f6f;font-size:14px;line-height:22px;width:92px;vertical-align:top;">${copy.amountLabel}</td>
              <td style="padding:0;color:#121212;font-size:14px;line-height:22px;font-weight:700;vertical-align:top;">${safeAmountLabel}</td>
            </tr>
          </table>
        </div>

        <div style="border-top:1px solid rgba(18,18,18,0.08);padding-top:22px;margin:0 0 22px 0;">
          <p style="margin:0 0 10px 0;font-size:16px;line-height:24px;color:#121212;font-weight:700;">${accessTitle}</p>
          <p style="margin:0 0 12px 0;color:#5f5f5f;font-size:14px;line-height:22px;">
            ${accessDescription}
          </p>
          ${accessButton}
          ${mentorFollowupParagraph}
        </div>

        <div style="background:#f7f7f5;border-radius:16px;padding:16px 18px;margin:0 0 22px 0;">
          <p style="margin:0 0 8px 0;font-size:15px;line-height:22px;color:#121212;font-weight:700;">${copy.receiptTitle}</p>
          <p style="margin:0 0 12px 0;color:#5f5f5f;font-size:14px;line-height:22px;">
            ${copy.invoiceAttached}
          </p>
          ${receiptButton}
        </div>

        <a href="${safeSiteHomeUrl}" style="display:inline-block;color:#121212;text-decoration:underline;font-size:13px;line-height:20px;font-weight:600;">
          ${copy.backToSite}
        </a>

        <p style="margin:24px 0 0 0;padding-top:18px;border-top:1px solid rgba(18,18,18,0.08);font-size:12px;line-height:18px;color:#8a8a8a;">
          ${copy.autoReplyNote}: <a href="${safeSupportTelegramUrl}" style="color:#8a8a8a;text-decoration:underline;">${safeSupportTelegramUrl}</a>.
        </p>
      </div>
    </div>
  `;

  const textParts = [
    copy.paymentSucceededText,
    `${copy.productLabel}: ${productTitle}`,
    `${copy.offerLabel}: ${offerLabel || copy.defaultOfferLabel}`,
    `${copy.amountLabel}: ${amountLabel}`,
    accessTitle,
    accessDescription,
    telegramLink && (accessKind === "telegram-channel" || accessKind === "telegram-chat")
      ? `${accessCta}: ${telegramLink}`
      : "",
    mentorFollowupNote,
    copy.invoiceAttached,
    receiptLink
      ? `${receiptButtonLabel}: ${receiptLink}${
          resolvedReceiptKind === "receipt" ? `\n${copy.receiptLinkValidity}` : ""
        }`
      : copy.receiptPending,
    `${copy.siteLabel}: ${SITE_HOME_URL}`,
  ];

  return {
    html,
    subject,
    text: textParts.filter(Boolean).join("\n"),
  };
};
