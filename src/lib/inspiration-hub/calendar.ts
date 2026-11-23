import { DAY_MS } from "@/lib/time";

const HUB_TIME_ZONE = "Europe/Warsaw";

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
    const sample = new Date(targetCalendarTimestamp + dayOffset * DAY_MS);
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

  return toWarsawInstant(getCalendarTimestamp(date) + days * DAY_MS);
};

/** Shifts by calendar months in Warsaw, clamping to the last day of a shorter month. */
export const addWarsawCalendarMonths = (date: Date, months: number): Date => {
  if (!Number.isFinite(date.getTime()) || !Number.isSafeInteger(months)) {
    throw new RangeError("invalid_hub_calendar_input");
  }

  if (months === 0) return new Date(date.getTime());

  const calendarDate = new Date(getCalendarTimestamp(date));
  const day = calendarDate.getUTCDate();
  // Day zero of the following month is the last day of the destination month.
  calendarDate.setUTCMonth(calendarDate.getUTCMonth() + months + 1, 0);
  calendarDate.setUTCDate(Math.min(day, calendarDate.getUTCDate()));

  return toWarsawInstant(calendarDate.getTime());
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
  const startOfDay = Math.floor(calendarTimestamp / DAY_MS) * DAY_MS;

  return toWarsawInstant(startOfDay + DAY_MS);
};

/**
 * HUB-D37/D43: an access that begins on a Warsaw calendar day gets its invite from the
 * morning of that day (the daily cron runs at 03:00 UTC), even if it begins later in
 * the day — a few early hours rather than a day late. True from 00:00 Warsaw of the
 * start day on.
 */
export const isStartDayReached = (startsAt: Date, now: Date): boolean =>
  startsAt.getTime() < getStartOfNextWarsawDay(now).getTime();

const WARSAW_DAY = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Warsaw",
  year: "numeric",
});

/** The Warsaw calendar day of a moment, as YYYY-MM-DD. */
export const toWarsawDay = (date: Date) => WARSAW_DAY.format(date);

/** Calendar days between two instants by the Warsaw calendar (the page's dates). */
export const warsawDaysBetween = (from: Date, to: Date) => {
  const dayNumber = (date: Date) => {
    const [year, month, day] = WARSAW_DAY.format(date).split("-").map(Number);
    return Date.UTC(year, month - 1, day) / DAY_MS;
  };

  return dayNumber(to) - dayNumber(from);
};
