import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { resolveSellableProductsLocale } from "@/lib/sellable-products-localization";

import { formatEmailDate } from "./dates";

const COPY = {
  ru: {
    subject: "Твой доступ в Inspiration Hub начался",
    heading: "Доступ в Inspiration Hub начался",
    intro:
      "Сегодня начались твои оплаченные 8 недель. Нажми кнопку ниже, чтобы войти в закрытый Telegram-канал.",
    dateLabel: "Доступ до",
    deadlineLine: (deadline: string) => `Доступ открыт до ${deadline}.`,
    linkNote:
      "Ссылка персональная и одноразовая: открой её с того Telegram-аккаунта, которым будешь пользоваться.",
    button: "Открыть Inspiration Hub",
    support: "Нужна помощь? Напиши нам",
  },
  en: {
    subject: "Your Inspiration Hub access has started",
    heading: "Your Inspiration Hub access has started",
    intro:
      "Your paid 8 weeks begin today. Use the button below to join the private Telegram channel.",
    dateLabel: "Access until",
    deadlineLine: (deadline: string) => `Access until ${deadline}.`,
    linkNote:
      "The invite is personal and works once: open it from the Telegram account you will use.",
    button: "Open Inspiration Hub",
    support: "Need help? Message us",
  },
  pl: {
    subject: "Twój dostęp do Inspiration Hub się rozpoczął",
    heading: "Dostęp do Inspiration Hub się rozpoczął",
    intro:
      "Dziś zaczyna się Twoje opłacone 8 tygodni. Użyj przycisku poniżej, aby dołączyć do prywatnego kanału Telegram.",
    dateLabel: "Dostęp ważny do",
    deadlineLine: (deadline: string) => `Dostęp ważny do ${deadline}.`,
    linkNote:
      "Link jest osobisty i działa jeden raz: otwórz go z konta Telegram, z którego będziesz korzystać.",
    button: "Otwórz Inspiration Hub",
    support: "Potrzebujesz pomocy? Napisz do nas",
  },
} as const;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

/** HUB-D37: the invite of a paid Hub period, sent on the day the period begins. */
export const buildHubPeriodStartInviteEmail = ({
  accessUrl,
  expiresAt,
  locale,
}: {
  accessUrl: string;
  expiresAt: Date | null;
  locale: string | null;
}) => {
  const resolvedLocale = resolveSellableProductsLocale(locale);
  const copy = COPY[resolvedLocale];
  const deadline = expiresAt ? formatEmailDate(expiresAt, locale) : "";
  const text = [
    copy.heading,
    copy.intro,
    `${copy.button}: ${accessUrl}`,
    copy.linkNote,
    deadline ? copy.deadlineLine(deadline) : "",
    `${copy.support}: ${SUPPORT_TELEGRAM_URL}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html>
<html lang="${resolvedLocale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 12px;background:#f3f2ef;font-family:Arial,Helvetica,sans-serif;color:#121212;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e4df;border-radius:24px;padding:32px;">
    <p style="margin:0 0 20px;color:#7c0002;font-size:11px;font-weight:700;letter-spacing:1.5px;">ANNA STROK · FRAME UP STRIP</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:600;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${escapeHtml(copy.intro)}</p>
    <a href="${escapeHtml(accessUrl)}" style="display:inline-block;padding:13px 22px;background:#7c0002;border-radius:999px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(copy.button)}</a>
    <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#555;">${escapeHtml(copy.linkNote)}</p>
    ${
      deadline
        ? `<div style="margin-top:22px;padding:18px 20px;border-radius:16px;background:#f8f6f3;">
      <p style="margin:0 0 6px;font-size:12px;color:#6f6a65;">${escapeHtml(copy.dateLabel)}</p>
      <p style="margin:0;font-size:20px;line-height:1.4;font-weight:600;">${escapeHtml(deadline)}</p>
    </div>`
        : ""
    }
    <p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #ece8e3;font-size:12px;line-height:1.5;">
      <a href="${SUPPORT_TELEGRAM_URL}" style="color:#777;text-decoration:underline;">${escapeHtml(copy.support)}</a>
    </p>
  </div>
</body></html>`;

  return { subject: copy.subject, html, text };
};
