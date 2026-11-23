const WARSAW = "Europe/Warsaw";

/** How «Мой доступ» writes its dates, in the reader's language and Warsaw time. */
export const createAccessDates = (locale: string) => {
  const formatDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: WARSAW,
  });
  const formatShortDate = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: WARSAW,
    year: "numeric",
  });
  const formatDayMonth = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: WARSAW,
  });
  const formatMonthShort = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: WARSAW,
  });
  const formatDayNumber = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    timeZone: WARSAW,
  });
  const formatWeekday = new Intl.DateTimeFormat(locale, {
    timeZone: WARSAW,
    weekday: "long",
  });
  const formatYear = new Intl.DateTimeFormat(locale, {
    timeZone: WARSAW,
    year: "numeric",
  });
  /** Dates never break between their words ("23 ноября" stays on one line). */
  const keepTogether = (text: string) => text.replace(/ /gu, "\u00a0");
  /**
   * The day of a purchase with a three-letter month, «18 ноя 2026», «Nov 18,
   * 2026», «18 lis 2026»: no dot, no «г.» after the year.
   */
  const purchaseDay = (iso: string) =>
    keepTogether(
      formatShortDate
        .formatToParts(new Date(iso))
        .map((part) =>
          part.type === "month"
            ? part.value.replace(/\./gu, "").slice(0, 3)
            : part.type === "literal"
              ? part.value.replace(/\s?г\.$/u, "")
              : part.value,
        )
        .join("")
        .trim(),
    );
  const dayMonth = (iso: string) => keepTogether(formatDayMonth.format(new Date(iso)));
  /** The month as it reads after a day ("марта", "listopada"). */
  const monthAfterDay = (date: Date) =>
    formatDayMonth.formatToParts(date).find((part) => part.type === "month")?.value ?? "";

  return {
    dayMonth,
    formatDate,
    formatDayNumber,
    formatMonthShort,
    formatWeekday,
    formatYear,
    keepTogether,
    monthAfterDay,
    purchaseDay,
  };
};
