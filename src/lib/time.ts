export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export const UTC_TIME_ZONE_LABEL = "UTC";

export const toUtcIso = (value: Date | number | string = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toISOString();
};
