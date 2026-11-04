import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { resolveSellableProductsLocale } from "@/lib/sellable-products-localization";

import { formatEmailDate } from "./dates";

const COPY = {
  ru: {
    subject: (title: string) => `Доступ к «${title}» скоро завершится`,
    heading: "Доступ скоро завершится",
    intro: (title: string) => `Ваш разбор — «${title}»`,
    dateLabel: "Доступ до",
    timeZone: "Время Варшавы",
    body: "Вернитесь к урокам, чтобы повторить хореографию.",
    button: "Открыть разбор",
    support: "Нужна помощь? Напишите нам",
  },
  en: {
    subject: (title: string) => `Your access to “${title}” ends soon`,
    heading: "Your access ends soon",
    intro: (title: string) => `Your tutorial — “${title}”`,
    dateLabel: "Access until",
    timeZone: "Warsaw time",
    body: "Come back to the lessons and practise the choreography.",
    button: "Open tutorial",
    support: "Need help? Message us",
  },
  pl: {
    subject: (title: string) => `Twój dostęp do „${title}” wkrótce się kończy`,
    heading: "Twój dostęp wkrótce się kończy",
    intro: (title: string) => `Twoja choreografia — „${title}”`,
    dateLabel: "Dostęp do",
    timeZone: "Czas warszawski",
    body: "Wróć do lekcji i powtórz choreografię.",
    button: "Otwórz choreografię",
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

export const buildChoreoAccessReminderEmail = ({
  title,
  expiresAt,
  locale,
  materialsUrl,
}: {
  title: string;
  expiresAt: Date;
  locale: string | null;
  materialsUrl?: string;
}) => {
  const materialLink =
    materialsUrl && /^https:\/\/t\.me\/c\/\d+\/[1-9]\d*$/u.test(materialsUrl)
      ? materialsUrl
      : undefined;
  const copy = COPY[resolveSellableProductsLocale(locale)];
  const deadline = formatEmailDate(expiresAt, locale, { includeTime: true });
  const intro = copy.intro(title);
  const text = [
    copy.heading,
    intro,
    `${copy.dateLabel}: ${deadline} (${copy.timeZone}).`,
    copy.body,
    materialLink ? `${copy.button}: ${materialLink}` : "",
    `${copy.support}: ${SUPPORT_TELEGRAM_URL}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html>
<html lang="${resolveSellableProductsLocale(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 12px;background:#f3f2ef;font-family:Arial,Helvetica,sans-serif;color:#121212;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e4df;border-radius:24px;padding:32px;">
    <p style="margin:0 0 20px;color:#7c0002;font-size:11px;font-weight:700;letter-spacing:1.5px;">ANNA STROK · FRAME UP STRIP</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:600;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${escapeHtml(intro)}</p>
    <div style="padding:18px 20px;border-radius:16px;background:#f8f6f3;">
      <p style="margin:0 0 6px;font-size:12px;color:#6f6a65;">${escapeHtml(copy.dateLabel)}</p>
      <p style="margin:0;font-size:20px;line-height:1.4;font-weight:600;">${escapeHtml(deadline)}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#6f6a65;">${escapeHtml(copy.timeZone)}</p>
    </div>
    <p style="margin:22px 0;font-size:14px;line-height:1.6;color:#555;">${escapeHtml(copy.body)}</p>
    ${materialLink ? `<a href="${escapeHtml(materialLink)}" style="display:inline-block;padding:13px 22px;background:#7c0002;border-radius:999px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(copy.button)}</a>` : ""}
    <p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #ece8e3;font-size:12px;line-height:1.5;">
      <a href="${SUPPORT_TELEGRAM_URL}" style="color:#777;text-decoration:underline;">${escapeHtml(copy.support)}</a>
    </p>
  </div>
</body></html>`;
  return { subject: copy.subject(title), html, text };
};
