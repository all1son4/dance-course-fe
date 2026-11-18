import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { resolveSellableProductsLocale } from "@/lib/sellable-products-localization";

/*
 * «Мой доступ» in emails (HUB-D31, plan section 8, texts 4 and 6): the button every
 * purchase and reminder email carries, and the email with the link on request.
 */

const COPY = {
  ru: {
    button: "Мой доступ",
    blockLine: "Все твои доступы и сроки — на странице «Мой доступ».",
    subject: "Твоя ссылка на «Мой доступ»",
    heading: "Твоя ссылка на «Мой доступ»",
    intro:
      "Привет! По этой кнопке откроется страница со всеми твоими доступами и сроками.",
    ignore: "Если это был не твой запрос, просто не обращай внимания на это письмо.",
    support: "Нужна помощь? Напиши нам",
  },
  en: {
    button: "My access",
    blockLine: "All your access and dates are on the “My access” page.",
    subject: "Your link to “My access”",
    heading: "Your link to “My access”",
    intro: "Hi! This button opens a page with all your access and its dates.",
    ignore: "If you did not ask for this link, simply ignore this email.",
    support: "Need help? Message us",
  },
  pl: {
    button: "Mój dostęp",
    blockLine: "Wszystkie Twoje dostępy i terminy są na stronie „Mój dostęp”.",
    subject: "Twój link do „Mój dostęp”",
    heading: "Twój link do „Mój dostęp”",
    intro:
      "Cześć! Ten przycisk otwiera stronę ze wszystkimi Twoimi dostępami i terminami.",
    ignore: "Jeśli to nie Twoja prośba, po prostu zignoruj tę wiadomość.",
    support: "Potrzebujesz pomocy? Napisz do nas",
  },
} as const;

export const escapeEmailHtml = (value: string) =>
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

const SECONDARY_BUTTON_STYLE =
  "display:inline-block;padding:12px 20px;border-radius:999px;background:#ffffff;color:#121212;text-decoration:none;font-weight:700;font-size:14px;line-height:20px;border:1px solid rgba(18,18,18,0.16);";

/** The quiet «Мой доступ» row other emails append; empty when there is no link. */
export const buildMyAccessEmailBlock = ({
  line,
  locale,
  url,
}: {
  /** Replaces the standard line above the button. */
  line?: string;
  locale: string | null | undefined;
  url: string | null | undefined;
}): { html: string; text: string } => {
  if (!url) return { html: "", text: "" };

  const copy = COPY[resolveSellableProductsLocale(locale)];
  const blockLine = line ?? copy.blockLine;

  return {
    html: `<div style="margin-top:22px;">
      <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#555;">${escapeEmailHtml(blockLine)}</p>
      <a href="${escapeEmailHtml(url)}" style="${SECONDARY_BUTTON_STYLE}">${escapeEmailHtml(copy.button)}</a>
    </div>`,
    text: `${blockLine}\n${copy.button}: ${url}`,
  };
};

/** The email sent from the /access form (text 6). */
export const buildMyAccessLinkEmail = ({
  locale,
  url,
}: {
  locale: string | null | undefined;
  url: string;
}) => {
  const resolvedLocale = resolveSellableProductsLocale(locale);
  const copy = COPY[resolvedLocale];
  const text = [
    copy.heading,
    copy.intro,
    `${copy.button}: ${url}`,
    copy.ignore,
    `${copy.support}: ${SUPPORT_TELEGRAM_URL}`,
  ].join("\n\n");
  const html = `<!doctype html>
<html lang="${resolvedLocale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 12px;background:#f3f2ef;font-family:Arial,Helvetica,sans-serif;color:#121212;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e4df;border-radius:24px;padding:32px;">
    <p style="margin:0 0 20px;color:#7c0002;font-size:11px;font-weight:700;letter-spacing:1.5px;">ANNA STROK · FRAME UP STRIP</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:600;">${escapeEmailHtml(copy.heading)}</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${escapeEmailHtml(copy.intro)}</p>
    <a href="${escapeEmailHtml(url)}" style="display:inline-block;padding:13px 22px;background:#7c0002;border-radius:999px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">${escapeEmailHtml(copy.button)}</a>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#555;">${escapeEmailHtml(copy.ignore)}</p>
    <p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #ece8e3;font-size:12px;line-height:1.5;">
      <a href="${SUPPORT_TELEGRAM_URL}" style="color:#777;text-decoration:underline;">${escapeEmailHtml(copy.support)}</a>
    </p>
  </div>
</body></html>`;

  return { subject: copy.subject, html, text };
};
