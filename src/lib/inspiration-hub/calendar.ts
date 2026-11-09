const HUB_TIME_ZONE = "Europe/Warsaw";
const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;

const calendarFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  era: "short",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: HUB_TIME_ZONE,
  year: "numeric",
});

// Encodes Warsaw clock fields on a UTC calendar for date arithmetic.
// This value represents clock fields, not a real instant in Warsaw.
const getCalendarTimestamp = (date: Date): number => {
  const parts = calendarFormatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const getNumber = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(getPart(type), 10);
  const year = getNumber("year");
  const calendarDate = new Date(0);

  calendarDate.setUTCFullYear(
    getPart("era") === "BC" ? 1 - year : year,
    getNumber("month") - 1,
    getNumber("day"),
  );
  calendarDate.setUTCHours(
    getNumber("hour"),
    getNumber("minute"),
    getNumber("second"),
    date.getUTCMilliseconds(),
  );

  return calendarDate.getTime();
};

// Turns a Warsaw clock reading (encoded by getCalendarTimestamp) into an instant.
// A repeated time uses its earlier occurrence; a skipped time moves forward by the
// clock change, matching Date/Temporal "compatible" disambiguation.
const toWarsawInstant = (targetCalendarTimestamp: number): Date => {
  if (!Number.isFinite(new Date(targetCalendarTimestamp).getTime())) {
    throw new RangeError("hub_calendar_date_out_of_range");
  }

  // Warsaw's offset change is smaller than one day. Sampling both sides of
  // the target collects the offsets needed to resolve a skipped/repeated hour.
  const offsets = new Set<number>();
  for (const dayOffset of [-1, 0, 1]) {
    const sample = new Date(targetCalendarTimestamp + dayOffset * CALENDAR_DAY_MS);
    if (Number.isFinite(sample.getTime())) {
      offsets.add(getCalendarTimestamp(sample) - sample.getTime());
    }
  }

  const candidates = [...offsets]
    .map((offset) => new Date(targetCalendarTimestamp - offset))
    .filter((candidate) => Number.isFinite(candidate.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());

  const exactMatch = candidates.find(
    (candidate) => getCalendarTimestamp(candidate) === targetCalendarTimestamp,
  );
  if (exactMatch) return exactMatch;

  // No exact match means the requested clock time was skipped. Use the
  // pre-transition offset, moving that clock time forward by the gap.
  const afterGap = candidates.find(
    (candidate) => getCalendarTimestamp(candidate) > targetCalendarTimestamp,
  );
  if (afterGap) return afterGap;

  throw new RangeError("hub_calendar_time_conversion_failed");
};

/**
 * Adds whole calendar days in Europe/Warsaw without mutating date.
 * Preserves local clock time and milliseconds across offset changes.
 * A repeated time uses its earlier occurrence; a skipped time moves forward
 * by the clock change, matching Date/Temporal "compatible" disambiguation.
 */
export const addWarsawCalendarDays = (date: Date, days: number): Date => {
  if (!Number.isFinite(date.getTime()) || !Number.isSafeInteger(days)) {
    throw new RangeError("invalid_hub_calendar_input");
  }

  if (days === 0) return new Date(date.getTime());

  return toWarsawInstant(getCalendarTimestamp(date) + days * CALENDAR_DAY_MS);
};

/**
 * Returns 00:00 Europe/Warsaw of the day after date: the end of Standard/Plus
 * access for a cohort closed at date. A date exactly at midnight moves to the
 * following midnight.
 */
export const getStartOfNextWarsawDay = (date: Date): Date => {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("invalid_hub_calendar_input");
  }

  const calendarTimestamp = getCalendarTimestamp(date);
  const startOfDay = Math.floor(calendarTimestamp / CALENDAR_DAY_MS) * CALENDAR_DAY_MS;

  return toWarsawInstant(startOfDay + CALENDAR_DAY_MS);
};
