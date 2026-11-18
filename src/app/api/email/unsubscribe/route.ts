import { unsubscribeEmailCampaignLead } from "@/lib/cohort-invite-broadcast";
import { escapeEmailHtml } from "@/lib/email/my-access";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-link";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";

/*
 * The broadcast's unsubscribe link. GET only shows the page with a button, so a
 * mail scanner that opens every link unsubscribes nobody; POST (the button, or a
 * mail app's one-click unsubscribe, RFC 8058) blocks the address everywhere.
 * Purchase and access emails are not campaigns and keep coming.
 */

export const runtime = "nodejs";

const COPY = {
  en: {
    title: "Unsubscribe",
    ask: "Press the button and we will stop sending you these invitations. Emails about your purchases and access will keep coming as usual.",
    button: "Unsubscribe",
    done: "Done — this address will no longer receive our invitations. Emails about your purchases and access will keep coming as usual.",
    invalid:
      "This link is not valid or has expired. If you keep getting emails you do not want, message us.",
    failed: "Something went wrong. Please try again in a minute.",
  },
  pl: {
    title: "Wypisanie się",
    ask: "Naciśnij przycisk, a przestaniemy wysyłać Ci takie zaproszenia. Wiadomości o zakupach i dostępach będą przychodzić jak zwykle.",
    button: "Wypisz mnie",
    done: "Gotowe — ten adres nie będzie już otrzymywać naszych zaproszeń. Wiadomości o zakupach i dostępach będą przychodzić jak zwykle.",
    invalid:
      "Ten link jest nieprawidłowy lub wygasł. Jeśli nadal dostajesz niechciane wiadomości, napisz do nas.",
    failed: "Coś poszło nie tak. Spróbuj ponownie za minutę.",
  },
  ru: {
    title: "Отписка",
    ask: "Нажми кнопку, и мы перестанем присылать такие приглашения. Письма о покупках и доступах будут приходить как обычно.",
    button: "Отписаться",
    done: "Готово — на этот адрес больше не придут наши приглашения. Письма о покупках и доступах будут приходить как обычно.",
    invalid:
      "Ссылка недействительна или устарела. Если нежелательные письма продолжают приходить, напиши нам.",
    failed: "Что-то пошло не так. Попробуй ещё раз через минуту.",
  },
} as const;

type Locale = keyof typeof COPY;

const readLocale = (url: URL): Locale => {
  const value = url.searchParams.get("lang");
  return value === "ru" || value === "pl" ? value : "en";
};

const page = (
  locale: Locale,
  message: string,
  { action, status = 200 }: { action?: string; status?: number } = {},
) => {
  const copy = COPY[locale];
  const form = action
    ? `<form method="post" action="${escapeEmailHtml(action)}" style="margin:24px 0 0;">
        <button type="submit" style="padding:13px 22px;background:#7c0002;border:0;border-radius:999px;color:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer;">${escapeEmailHtml(copy.button)}</button>
      </form>`
    : "";

  return new Response(
    `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeEmailHtml(copy.title)} · Anna Strok</title></head>
<body style="margin:0;padding:32px 16px;background:#f3f2ef;font-family:Arial,Helvetica,sans-serif;color:#121212;">
  <main style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e8e4df;border-radius:24px;padding:32px;">
    <p style="margin:0 0 20px;color:#7c0002;font-size:11px;font-weight:700;letter-spacing:1.5px;">ANNA STROK · FRAME UP STRIP</p>
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:600;">${escapeEmailHtml(copy.title)}</h1>
    <p style="margin:0;font-size:16px;line-height:1.5;">${escapeEmailHtml(message)}</p>
    ${form}
  </main>
</body></html>`,
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
      },
      status,
    },
  );
};

const isRateLimited = async (request: Request, method: string) =>
  (
    await consumeRequestRateLimit({
      keyPrefix: `email:unsubscribe:${method}`,
      limit: 30,
      request,
      windowMs: 60_000,
    })
  ).limited;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = readLocale(url);

  if (await isRateLimited(request, "get")) {
    return page(locale, COPY[locale].failed, { status: 429 });
  }

  if (!verifyUnsubscribeToken(url.searchParams.get("t"))) {
    return page(locale, COPY[locale].invalid, { status: 404 });
  }

  return page(locale, COPY[locale].ask, { action: `${url.pathname}${url.search}` });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const locale = readLocale(url);

  if (await isRateLimited(request, "post")) {
    return page(locale, COPY[locale].failed, { status: 429 });
  }

  const leadId = verifyUnsubscribeToken(url.searchParams.get("t"));

  if (!leadId) return page(locale, COPY[locale].invalid, { status: 404 });

  try {
    const result = await unsubscribeEmailCampaignLead(leadId);

    if (result.status === "not_found") {
      return page(locale, COPY[locale].invalid, { status: 404 });
    }

    return page(locale, COPY[locale].done);
  } catch (error) {
    logSafeError("Failed to unsubscribe an email address", error);
    return page(locale, COPY[locale].failed, { status: 500 });
  }
}
