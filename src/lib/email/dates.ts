import { resolveSellableProductsLocale } from "@/lib/sellable-products-localization";

/** Customer-facing dates use month names and one explicit, stable time zone. */
export const formatEmailDate = (
  value: Date | string,
  locale: string | null | undefined,
  { includeTime = false }: { includeTime?: boolean } = {},
) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("email_date_invalid");
  const dateLocale = { ru: "ru-RU", en: "en-GB", pl: "pl-PL" }[
    resolveSellableProductsLocale(locale)
  ];
  return new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "long",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: "Europe/Warsaw",
  }).format(date);
};
