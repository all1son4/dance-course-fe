import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { BLACK_FRIDAY_ENDS_AT, isBlackFridayActive } from "@/lib/black-friday";

import BlackFridayRibbon from "./BlackFridayRibbon";
import { BLACK_FRIDAY_SECTION_ID } from "./BlackFridaySection";

/** Decides per request, so the ribbon appears and disappears on time without a deploy. */
export default async function BlackFridayRibbonGate() {
  await connection();
  const now = new Date();

  if (!isBlackFridayActive(now)) return null;

  const t = await getTranslations("BlackFriday");

  return (
    <BlackFridayRibbon
      ariaLabel={t("ribbon.ariaLabel")}
      countdownLabel={t("countdown.label")}
      cta={t("ribbon.cta")}
      endsAt={BLACK_FRIDAY_ENDS_AT.toISOString()}
      labels={{
        days: t("countdown.shortDays"),
        hours: t("countdown.hours"),
        minutes: t("countdown.minutes"),
        seconds: t("countdown.seconds"),
      }}
      sectionId={BLACK_FRIDAY_SECTION_ID}
      serverNow={now.getTime()}
      title={t("ribbon.title")}
    />
  );
}
