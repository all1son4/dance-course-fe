import { getResolvedCheckoutLocale } from "@/app/api/stripe/payment-intent/lib";
import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";

const TELEGRAM_ACCESS_LINK_BY_PRODUCT_ID: Record<string, string> = {
  [SELLABLE_PRODUCTS["first-touch"].id]: "https://t.me/+YSmcfQx7nYhhOTgy",
};

const SITE_HOME_URL =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://frameupstrip.com";

const EMAIL_COPY = {
  en: {
    accessTitle: "Access your materials",
    amountLabel: "Amount",
    autoReplyNote:
      "This is an automatic email. If you have any questions, just reply to this message.",
    backToSite: "Back to website",
    defaultOfferLabel: "Standard access",
    heading: "Thank you, your payment was successful",
    intro: "We have prepared your course access and receipt details.",
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
    telegramCta: "Open Telegram channel",
    telegramPending: "Telegram access link will be sent in a separate message.",
  },
  pl: {
    accessTitle: "Dostęp do materiałów",
    amountLabel: "Kwota",
    autoReplyNote:
      "To wiadomość automatyczna. Jeśli masz pytania, po prostu odpowiedz na ten e-mail.",
    backToSite: "Wróć na stronę",
    defaultOfferLabel: "Dostęp standardowy",
    heading: "Dziękujemy, płatność zakończyła się sukcesem",
    intro: "Przygotowaliśmy dostęp do kursu oraz dane dotyczące rachunku.",
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
    telegramCta: "Otwórz Telegram",
    telegramPending: "Link dostępu do Telegrama zostanie wysłany osobno.",
  },
  ru: {
    accessTitle: "Доступ к материалам",
    amountLabel: "Сумма",
    autoReplyNote:
      "Это автоматическое письмо. Если у вас есть вопросы, просто ответьте на него.",
    backToSite: "Вернуться на сайт",
    defaultOfferLabel: "Стандартный доступ",
    heading: "Спасибо, оплата прошла успешно",
    intro: "Мы подготовили доступ к материалам и данные по чеку.",
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
    telegramCta: "Открыть Telegram-канал",
    telegramPending: "Ссылка на доступ в Telegram будет отправлена отдельным сообщением.",
  },
} as const;

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
  productId: string;
  productTitle: string;
  receiptKind?: "pdf" | "receipt" | null;
  receiptLink: string | null;
};

export const getTelegramAccessLinkByProductId = (productId: string) =>
  TELEGRAM_ACCESS_LINK_BY_PRODUCT_ID[productId] ?? null;

export const buildPurchaseSuccessEmail = ({
  amountMinor,
  checkoutCurrency,
  checkoutLocale,
  offerLabel,
  productId,
  productTitle,
  receiptKind,
  receiptLink,
}: BuildPurchaseSuccessEmailInput) => {
  const locale = getResolvedCheckoutLocale(checkoutLocale);
  const copy = EMAIL_COPY[locale];
  const telegramLink = getTelegramAccessLinkByProductId(productId);
  const amountLabel = formatCheckoutAmount({
    amountMinor,
    currency: checkoutCurrency,
    locale,
  });
  const safeProductTitle = escapeHtml(productTitle);
  const safeOfferLabel = escapeHtml(offerLabel || copy.defaultOfferLabel);
  const safeAmountLabel = escapeHtml(amountLabel);
  const safeReceiptLink = receiptLink ? escapeHtml(receiptLink) : "";
  const safeTelegramLink = telegramLink ? escapeHtml(telegramLink) : "";
  const safeSiteHomeUrl = escapeHtml(SITE_HOME_URL);

  const resolvedReceiptKind =
    receiptKind ??
    (receiptLink && /\.pdf(?:[?#].*)?$/i.test(receiptLink) ? "pdf" : "receipt");
  const receiptButtonLabel =
    resolvedReceiptKind === "pdf" ? copy.receiptPdfCta : copy.receiptLinkCta;
  const subject = `${copy.subjectPrefix}: ${productTitle}`;
  const receiptButton = receiptLink
    ? `
      <a href="${safeReceiptLink}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111111;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;line-height:20px;margin-right:8px;margin-bottom:8px;">
        ${receiptButtonLabel}
      </a>
      ${
        resolvedReceiptKind === "receipt"
          ? `<p style="margin:6px 0 0 0;color:#5f5f5f;font-size:13px;line-height:20px;">${copy.receiptLinkValidity}</p>`
          : ""
      }
    `
    : `
      <p style="margin:0;color:#666666;font-size:14px;line-height:22px;">
        ${copy.receiptPending}
      </p>
    `;
  const telegramButton = telegramLink
    ? `
      <a href="${safeTelegramLink}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#7c0002;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;line-height:20px;border:1px solid rgba(124,0,2,0.95);box-shadow:0 10px 20px rgba(124,0,2,0.2);margin-right:8px;margin-bottom:8px;">
        ${copy.telegramCta}
      </a>
    `
    : `
      <p style="margin:0;color:#666666;font-size:14px;line-height:22px;">
        ${copy.telegramPending}
      </p>
    `;

  const html = `
    <div style="margin:0;padding:32px 12px;background:#f3f2ef;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#121212;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid rgba(18,18,18,0.08);border-radius:28px;padding:28px;">
        <p style="margin:0 0 8px 0;font-size:12px;line-height:18px;letter-spacing:0.08em;text-transform:uppercase;color:#6f6253;">Frame Up Strip</p>
        <h1 style="margin:0 0 14px 0;font-size:28px;line-height:34px;font-weight:600;color:#121212;">
          ${copy.heading}
        </h1>
        <p style="margin:0 0 22px 0;font-size:15px;line-height:24px;color:#3c3c3c;">
          ${copy.intro}
        </p>

        <div style="background:#faf9f7;border:1px solid rgba(18,18,18,0.08);border-radius:18px;padding:16px 18px;margin-bottom:18px;">
          <p style="margin:0 0 10px 0;font-size:13px;line-height:20px;color:#6a6a6a;">${copy.summaryTitle}</p>
          <p style="margin:0 0 4px 0;font-size:15px;line-height:22px;"><strong>${copy.productLabel}:</strong> ${safeProductTitle}</p>
          <p style="margin:0 0 4px 0;font-size:15px;line-height:22px;"><strong>${copy.offerLabel}:</strong> ${safeOfferLabel}</p>
          <p style="margin:0;font-size:15px;line-height:22px;"><strong>${copy.amountLabel}:</strong> ${safeAmountLabel}</p>
        </div>

        <div style="margin:0 0 16px 0;">
          <p style="margin:0 0 10px 0;font-size:14px;line-height:22px;color:#4a4a4a;">${copy.accessTitle}</p>
          ${telegramButton}
        </div>

        <div style="margin:0 0 24px 0;">
          <p style="margin:0 0 10px 0;font-size:14px;line-height:22px;color:#4a4a4a;">${copy.receiptTitle}</p>
          ${receiptButton}
        </div>

        <a href="${safeSiteHomeUrl}" style="display:inline-block;padding:11px 18px;border-radius:12px;border:1px solid rgba(18,18,18,0.2);color:#121212;text-decoration:none;font-size:13px;line-height:20px;font-weight:500;">
          ${copy.backToSite}
        </a>

        <p style="margin:20px 0 0 0;font-size:12px;line-height:18px;color:#8a8a8a;">
          ${copy.autoReplyNote}
        </p>
      </div>
    </div>
  `;

  const textParts = [
    copy.paymentSucceededText,
    `${copy.productLabel}: ${productTitle}`,
    `${copy.offerLabel}: ${offerLabel || copy.defaultOfferLabel}`,
    `${copy.amountLabel}: ${amountLabel}`,
    telegramLink ? `${copy.telegramCta}: ${telegramLink}` : copy.telegramPending,
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
    text: textParts.join("\n"),
  };
};
