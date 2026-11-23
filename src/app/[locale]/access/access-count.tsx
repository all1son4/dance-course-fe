import type { getTranslations } from "next-intl/server";

import type { MyAccessCount } from "@/lib/my-access/count";
import type { createAccessDates } from "@/lib/my-access/dates";

import {
  CalendarLeaf,
  Count,
  CountText,
  CountValue,
  WeekCounts,
} from "./access-cards.styles";
import { VisuallyHidden } from "./page.styles";

const weekState = (week: number, current: number) =>
  week < current ? "done" : week === current ? "now" : "ahead";

/** The count of a card: the number, what it counts, the date. */
export const AccessCount = ({
  count,
  dates,
  t,
}: {
  count: MyAccessCount;
  dates: ReturnType<typeof createAccessDates>;
  t: Awaited<ReturnType<typeof getTranslations<"MyAccessPage">>>;
}) => {
  const { dayMonth, formatDayNumber, formatMonthShort, formatWeekday } = dates;

  /** A date as a calendar leaf; the text next to it names the date for screen readers. */
  const calendarLeaf = (iso: string) => (
    <CalendarLeaf aria-hidden>
      <small>{formatMonthShort.format(new Date(iso)).replace(/\.$/u, "")}</small>
      <b>{formatDayNumber.format(new Date(iso))}</b>
    </CalendarLeaf>
  );

  switch (count.kind) {
    case "startsIn":
      return (
        <Count>
          {calendarLeaf(count.at)}
          <CountText>
            <b>
              {count.days === 0
                ? t("count.startsToday")
                : `${count.days} ${t("count.startsIn", { days: count.days })}`}
            </b>
            <span>
              {formatWeekday.format(new Date(count.at))}
              <VisuallyHidden>, {dayMonth(count.at)}</VisuallyHidden>
            </span>
          </CountText>
        </Count>
      );
    case "left":
      return (
        <Count $tone={count.urgent ? "urgent" : "plain"}>
          <CountValue>{count.days}</CountValue>
          <CountText>
            <b>{t("count.left", { days: count.days })}</b>
            <span>{t("count.until", { date: dayMonth(count.until) })}</span>
          </CountText>
        </Count>
      );
    case "week":
      return (
        <Count>
          <WeekCounts
            aria-label={t("count.weekOf", {
              current: count.current,
              total: count.total,
            })}
            role="img"
          >
            {Array.from({ length: count.total }, (_, index) => (
              <i data-state={weekState(index + 1, count.current)} key={index}>
                {index + 1}
              </i>
            ))}
          </WeekCounts>
          <CountText>
            <b>{t("count.week")}</b>
          </CountText>
        </Count>
      );
    case "paidDays":
      return (
        <Count>
          <CountValue>{count.days}</CountValue>
          <CountText>
            <b>{t("count.paidDays", { days: count.days })}</b>
            <span>{t("count.fromJoin")}</span>
          </CountText>
        </Count>
      );
    case "ended":
      return (
        <Count $tone="muted">
          {calendarLeaf(count.at)}
          <CountText>
            <b>{t("count.ended")}</b>
            <VisuallyHidden>{dayMonth(count.at)}</VisuallyHidden>
          </CountText>
        </Count>
      );
    case "openNow":
      return (
        <Count>
          <CountText>
            <b>{t("count.openNow")}</b>
            <span>{t("count.openNowNote")}</span>
          </CountText>
        </Count>
      );
    case "lifetime":
      return (
        <Count>
          <CountValue aria-hidden>∞</CountValue>
          <CountText>
            <b>{t("count.lifetime")}</b>
          </CountText>
        </Count>
      );
  }
};
