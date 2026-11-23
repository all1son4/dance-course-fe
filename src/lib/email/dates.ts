import { resolveSellableProductsLocale } from "@/lib/sellable-products-localization";

/** Customer-facing dates use month names and one explicit, stable time zone. */
export const formatEmailDate = (
  value: Date | string,
  locale: string | null | undefined,
  {
    includeTime = false,
    includeYear = true,
  }: { includeTime?: boolean; includeYear?: boolean } = {},
) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("email_date_invalid");
  const dateLocale = { ru: "ru-RU", en: "en-GB", pl: "pl-PL" }[
    resolveSellableProductsLocale(locale)
  ];
  // Russian adds «г.» after the year; a sentence ending in a date then reads «г..».
  return new Intl.DateTimeFormat(dateLocale, {
    ...(includeYear
      ? { dateStyle: "long" as const }
      : { day: "numeric" as const, month: "long" as const }),
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: "Europe/Warsaw",
  })
    .format(date)
    .replace(/\s?г\./u, "");
};

/** The Russian form for a count: 1 день, 2 дня, 5 дней (11–14 take the third). */
export const getRussianPlural = (
  count: number,
  [one, few, many]: [string, string, string],
) => {
  const lastTwoDigits = Math.abs(count) % 100;
  const lastDigit = lastTwoDigits % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return many;
  }

  if (lastDigit === 1) {
    return one;
  }

  return lastDigit >= 2 && lastDigit <= 4 ? few : many;
};
