import {
  getAccountingCalendarDateValue,
  getAccountingMonthRange,
  getAccountingMonthValue,
} from "@/lib/accounting-month";

const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;

const shiftCalendarDate = (dateValue: string, days: number) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * CALENDAR_DAY_MS);

  return shifted.toISOString().slice(0, 10);
};

export type PolishTerminalReminderPeriod = {
  endUtcIso: string;
  monthValue: string;
  reminderDateValue: string;
  startUtcIso: string;
};

/**
 * Opens the reminder window seven calendar days before the month's last day in
 * Europe/Warsaw. The window stays open through month-end so a missed daily cron
 * can recover; the outbox's month key still permits only one notification.
 */
export const getScheduledPolishTerminalReminderPeriod = (
  now: Date,
): PolishTerminalReminderPeriod | null => {
  const monthValue = getAccountingMonthValue(now);
  const range = getAccountingMonthRange(monthValue);

  if (!range) {
    return null;
  }

  const lastDayValue = shiftCalendarDate(range.endDateValue, -1);
  const reminderDateValue = shiftCalendarDate(lastDayValue, -7);
  const currentDateValue = getAccountingCalendarDateValue(now);

  if (currentDateValue < reminderDateValue) {
    return null;
  }

  return {
    endUtcIso: range.end.toISOString(),
    monthValue,
    reminderDateValue,
    startUtcIso: range.start.toISOString(),
  };
};
