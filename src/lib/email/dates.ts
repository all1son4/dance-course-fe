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
