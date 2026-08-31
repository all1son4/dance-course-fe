export const ACCOUNTING_TIME_ZONE = "Europe/Warsaw";

type AccountingCalendarParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const accountingCalendarFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: ACCOUNTING_TIME_ZONE,
  year: "numeric",
});

const getAccountingCalendarParts = (date: Date): AccountingCalendarParts => {
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_accounting_reference_date");
  }

  const formattedParts = accountingCalendarFormatter.formatToParts(date);
  const getNumericPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(formattedParts.find((part) => part.type === type)?.value ?? "", 10);
  const parts = {
    day: getNumericPart("day"),
    hour: getNumericPart("hour"),
    minute: getNumericPart("minute"),
    month: getNumericPart("month"),
    second: getNumericPart("second"),
    year: getNumericPart("year"),
  };

  if (Object.values(parts).some((value) => !Number.isSafeInteger(value))) {
    throw new Error("invalid_accounting_calendar_parts");
  }

  return parts;
};

const getAdjacentAccountingMonth = ({
  direction,
  month,
  year,
}: {
  direction: -1 | 1;
  month: number;
  year: number;
}) => {
  const normalized = new Date(Date.UTC(year, month - 1 + direction, 1));

  return {
    month: normalized.getUTCMonth() + 1,
    year: normalized.getUTCFullYear(),
  };
};

const getAccountingMonthStartUtc = ({ month, year }: { month: number; year: number }) => {
  const intendedCalendarTimestamp = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  let timestamp = intendedCalendarTimestamp;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getAccountingCalendarParts(new Date(timestamp));
    const representedCalendarTimestamp = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0,
    );
    const adjustment = intendedCalendarTimestamp - representedCalendarTimestamp;

    timestamp += adjustment;

    if (adjustment === 0) {
      break;
    }
  }

  const result = new Date(timestamp);
  const resultParts = getAccountingCalendarParts(result);

  if (
    resultParts.year !== year ||
    resultParts.month !== month ||
    resultParts.day !== 1 ||
    resultParts.hour !== 0 ||
    resultParts.minute !== 0 ||
    resultParts.second !== 0
  ) {
    throw new Error("accounting_time_zone_conversion_failed");
  }

  return result;
};

const getAccountingMonthStartDateValue = ({
  month,
  year,
}: {
  month: number;
  year: number;
}) => `${year}-${pad2(month)}-01`;

export const parseAccountingMonthValue = (monthValue: string) => {
  const match = /^(\d{4})-(\d{2})$/u.exec(monthValue.trim());

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);

  return month >= 1 && month <= 12 ? { month, year } : null;
};

export const getAccountingMonthValue = (date: Date) => {
  const { month, year } = getAccountingCalendarParts(date);

  return `${year}-${pad2(month)}`;
};

export const getAccountingCalendarDateValue = (date: Date) => {
  const { day, month, year } = getAccountingCalendarParts(date);

  return `${year}-${pad2(month)}-${pad2(day)}`;
};

export const getAccountingDateTimeValue = (date: Date) => {
  const { day, hour, minute, month, second, year } = getAccountingCalendarParts(date);

  return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
};

export const isFirstAccountingCalendarDay = (date: Date) =>
  getAccountingCalendarParts(date).day === 1;

export const getPreviousAccountingMonthValue = (monthValue: string) => {
  const parsedMonth = parseAccountingMonthValue(monthValue);

  if (!parsedMonth) {
    return null;
  }

  const previousMonth = getAdjacentAccountingMonth({
    ...parsedMonth,
    direction: -1,
  });

  return `${previousMonth.year}-${pad2(previousMonth.month)}`;
};

export const getAccountingMonthRange = (monthValue: string) => {
  const parsedMonth = parseAccountingMonthValue(monthValue);

  if (!parsedMonth) {
    return null;
  }

  const nextMonth = getAdjacentAccountingMonth({
    ...parsedMonth,
    direction: 1,
  });

  return {
    end: getAccountingMonthStartUtc(nextMonth),
    endDateValue: getAccountingMonthStartDateValue(nextMonth),
    monthValue: `${parsedMonth.year}-${pad2(parsedMonth.month)}`,
    start: getAccountingMonthStartUtc(parsedMonth),
    startDateValue: getAccountingMonthStartDateValue(parsedMonth),
  };
};
