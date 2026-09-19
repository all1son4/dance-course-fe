export const trim = (value: string | null | undefined) => value?.trim() ?? "";

export const nullIfEmpty = (value: string | null | undefined) => trim(value) || null;

export const normalizeEmail = (value: string | null | undefined) =>
  trim(value).toLowerCase();

export const parseInteger = (value: string | null | undefined, fallback = 0) => {
  const parsedValue = Number.parseInt(trim(value), 10);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

export const parseDate = (value: string | null | undefined) => {
  const timestamp = Date.parse(trim(value));

  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

export const parseRequiredDate = (
  value: string | null | undefined,
  fallback: Date = new Date(),
) => parseDate(value) ?? fallback;

export const toIso = (date: Date | null | undefined) => date?.toISOString() ?? "";
