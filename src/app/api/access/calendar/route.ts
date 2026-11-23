import { createTranslator, hasLocale } from "next-intl";

import { getDatabase } from "@/db/client";
import { readMyAccessSnapshot } from "@/db/my-access";
import { routing } from "@/i18n/routing";
import {
  buildMyAccessCalendarEvents,
  readMyAccessNextStep,
} from "@/lib/my-access/access.helpers";
import { buildCalendarFile, NEXT_CYCLE_EVENT } from "@/lib/my-access/calendar";
import { isMyAccessLinkConfigured, verifyMyAccessToken } from "@/lib/my-access/link";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";

const notFound = () =>
  new Response("Not found", {
    headers: { "Cache-Control": "no-store" },
    status: 404,
  });

/**
 * «В календарь» (.ics) of «Мой доступ»: behind the same personal link as the page,
 * and only for a date one of its cards (or «Дальше») shows right now.
 */
export async function GET(request: Request) {
  try {
    return await respond(request);
  } catch (error) {
    // A database or message failure: a plain, logged 503 instead of a bare 500,
    // so the calendar app tries again later.
    logSafeError("Failed to answer the «В календарь» file", error);
    return new Response("Temporarily unavailable", {
      headers: { "Cache-Control": "no-store", "Retry-After": "300" },
      status: 503,
    });
  }
}

async function respond(request: Request) {
  if (!isMyAccessLinkConfigured()) return notFound();

  const params = new URL(request.url).searchParams;
  const customerId = verifyMyAccessToken(params.get("k"));
  const eventId = params.get("event") ?? "";
  const requestedLocale = params.get("locale");
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;
  if (!customerId || !eventId) return notFound();

  const snapshot = await readMyAccessSnapshot(getDatabase(), customerId);
  if (!snapshot) return notFound();

  // Outside the [locale] segment: the messages of the requested locale, read directly.
  const messages = (await import(`@/messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "MyAccessPage" });
  const productT = createTranslator({ locale, messages, namespace: "SellableProducts" });
  const now = new Date();
  const next =
    eventId === NEXT_CYCLE_EVENT ? await readMyAccessNextStep(snapshot, now) : null;
  const event = buildMyAccessCalendarEvents({ next, now, productT, snapshot, t }).find(
    (candidate) => candidate.id === eventId,
  )?.event;

  if (!event) return notFound();

  return new Response(buildCalendarFile(event, now), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="anna-strok.ics"',
      "Content-Type": "text/calendar; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
