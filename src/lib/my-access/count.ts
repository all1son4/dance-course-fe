import type { MyAccessCard, MyAccessLine } from "./cards";

/*
 * The count of a «Мой доступ» card, the way dancers count: how many days to the
 * start (a count-in), which week of the cycle (1 2 3 4 5 6), how many days are
 * left. Every number comes from the card the rules built, so the count never
 * knows more than the card. Dates are days only, never hours. Pure.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WARSAW_DAY = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Warsaw",
  year: "numeric",
});

export type MyAccessCount =
  /** Days to a start; 0 is the start day itself. */
  | { kind: "startsIn"; days: number; at: string }
  /**
   * Days left of a running access. With its start known (`from`), `share` is the
   * part still ahead, 0..1, and the bar runs from start to end.
   */
  | {
      kind: "left";
      days: number;
      until: string;
      from?: string;
      share?: number;
      urgent: boolean;
    }
  /** The calendar week of a running cycle. */
  | { kind: "week"; current: number; total: number }
  /** Paid days that begin when the channel is entered. */
  | { kind: "paidDays"; days: number }
  | { kind: "ended"; at: string }
  /** Open now with no date to count to: the Hub that comes with Plus. */
  | { kind: "openNow" }
  | { kind: "lifetime" };

/** Calendar days between two instants by the Warsaw calendar (the page's dates). */
export const warsawDaysBetween = (from: Date, to: Date) => {
  const dayNumber = (date: Date) => {
    const [year, month, day] = WARSAW_DAY.format(date).split("-").map(Number);
    return Date.UTC(year, month - 1, day) / DAY_MS;
  };

  return dayNumber(to) - dayNumber(from);
};

/** Whole days still ahead of an end, as «Осталось N дней» counts them. */
const daysLeft = (end: Date, now: Date) =>
  Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));

const START_KEYS = new Set(["group.startsOn", "hub.scheduled"]);
const UNTIL_KEYS = new Set([
  "hub.activeUntil",
  "channel.until",
  "group.until",
  "group.closed",
  "plusHub.until",
  "plusHub.closed",
]);

const shareLeft = (period: { start: string; end: string }, now: Date) => {
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  if (!(end > start)) return 0;
  return Math.min(1, Math.max(0, (end - now.getTime()) / (end - start)));
};

/** The count of a card, or null where a number would only be decoration. */
export const buildMyAccessCount = (
  card: MyAccessCard,
  now: Date,
): MyAccessCount | null => {
  const key = card.status.key;

  if (card.calendar?.kind === "start" && START_KEYS.has(key)) {
    return {
      at: card.calendar.at,
      days: Math.max(0, warsawDaysBetween(now, new Date(card.calendar.at))),
      kind: "startsIn",
    };
  }

  if (card.calendar?.kind === "end" && UNTIL_KEYS.has(key)) {
    return {
      days: daysLeft(new Date(card.calendar.at), now),
      kind: "left",
      ...(card.period
        ? { from: card.period.start, share: shareLeft(card.period, now) }
        : {}),
      until: card.calendar.at,
      urgent: card.chip === "endsSoon",
    };
  }

  if (key === "group.running" && card.cycleWeek) {
    return { current: card.cycleWeek.current, kind: "week", total: card.cycleWeek.total };
  }

  if (key === "channel.startsOnJoin") {
    return { days: Number(card.status.values?.count ?? 0), kind: "paidDays" };
  }

  if (key === "hub.ended" && typeof card.status.values?.date === "string") {
    return { at: card.status.values.date, kind: "ended" };
  }

  if (key === "plusHub.included") return { kind: "openNow" };

  return key === "lifetime" ? { kind: "lifetime" } : null;
};

/**
 * The line under the title, only where it adds to the count: the count already
 * says the date, so «До {date}» and «Старт {date}» are not repeated.
 */
export const getMyAccessCardDetail = (card: MyAccessCard): MyAccessLine | null => {
  const { key, values } = card.status;

  switch (key) {
    case "hub.scheduled":
      return { key: "detail.hubUntil", values: { date: String(values?.end ?? "") } };
    case "hub.afterCohort":
      return { key: "hub.afterCohort" };
    case "plusHub.until":
      return { key: "plusHub.included" };
    case "plusHub.closed":
      return { key: "detail.plusHubAfterCohort" };
    case "group.closed":
      return { key: "detail.cohortClosed" };
    case "channel.paid":
      return { key: "detail.startsOnJoin" };
    default:
      return null;
  }
};

/** Notes the term already tells: the days left. */
const TOLD_BY_TERM = new Set(["daysLeft"]);

/** The note, minus what the term now shows. */
export const getMyAccessCardNote = (card: MyAccessCard): MyAccessLine | null =>
  !card.note || TOLD_BY_TERM.has(card.note.key) ? null : card.note;
