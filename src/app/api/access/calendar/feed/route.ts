import { createTranslator, hasLocale } from "next-intl";

import { getDatabase } from "@/db/client";
import { readMyAccessSnapshot } from "@/db/my-access";
import { routing } from "@/i18n/routing";
import {
  buildMyAccessCalendarEvents,
  readMyAccessNextStep,
} from "@/lib/my-access/access.helpers";
import { buildCalendarFeed } from "@/lib/my-access/calendar";
import {
  isMyAccessLinkConfigured,
  verifyMyAccessCalendarToken,
} from "@/lib/my-access/link";

export const runtime = "nodejs";

const notFound = () =>
  new Response("Not found", {
    headers: { "Cache-Control": "no-store" },
    status: 404,
  });

/**
 * The calendar subscription of «Мой доступ»: every date the page shows, refreshed
 * by the calendar app. Behind its own key, which opens these dates and nothing else.
 */
export async function GET(request: Request) {
  if (!isMyAccessLinkConfigured()) return notFound();

  const params = new URL(request.url).searchParams;
  const customerId = verifyMyAccessCalendarToken(params.get("c"));
  const requestedLocale = params.get("locale");
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;
  if (!customerId) return notFound();

  const snapshot = await readMyAccessSnapshot(getDatabase(), customerId);
  if (!snapshot) return notFound();

  const messages = (await import(`@/messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "MyAccessPage" });
  const productT = createTranslator({ locale, messages, namespace: "SellableProducts" });
  const now = new Date();
  const next = await readMyAccessNextStep(snapshot, now);
  const events = buildMyAccessCalendarEvents({ next, now, productT, snapshot, t }).map(
    ({ event }) => event,
  );

  return new Response(buildCalendarFeed(events, now, t("calendar.feedName")), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'inline; filename="anna-strok.ics"',
      "Content-Type": "text/calendar; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
