/*
 * «В календарь» on «Мой доступ»: one iCalendar event per file (RFC 5545). A start
 * with a time is a one-hour event; a day (the Hub opening, the last day of an
 * access) is an all-day event in Warsaw, where every date on the page is shown.
 */

import { toWarsawDay } from "@/lib/inspiration-hub/calendar";
import { HOUR_MS } from "@/lib/time";

/** The calendar event id of «Дальше»; any other id is a card's. */
export const NEXT_CYCLE_EVENT = "next";

/** The link of one calendar file, behind the same personal token as the page. */
export const buildMyAccessCalendarHref = (
  token: string,
  eventId: string,
  locale: string,
) => `/api/access/calendar?${new URLSearchParams({ event: eventId, k: token, locale })}`;

/** The subscription path, behind the dates-only calendar key. */
export const buildMyAccessCalendarFeedPath = (calendarToken: string, locale: string) =>
  `/api/access/calendar/feed?${new URLSearchParams({ c: calendarToken, locale })}`;

/**
 * How a calendar app subscribes: `webcal:` opens Apple Calendar and Outlook, Google
 * adds a calendar by address through its own page; the https address is for the rest.
 */
export const buildMyAccessCalendarSubscription = (siteUrl: string, feedPath: string) => {
  const https = `${siteUrl.replace(/\/+$/u, "")}${feedPath}`;
  const webcal = https.replace(/^https?:/u, "webcal:");

  return {
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    https,
    webcal,
  };
};

export type MyAccessCalendarEvent = {
  /** Stable per event, so a second download updates the entry instead of doubling it. */
  uid: string;
  summary: string;
  when: { allDay: true; day: Date } | { allDay: false; start: Date };
};

/** An all-day event on the Warsaw day of `date`; its DTEND is exclusive, the next day. */
const allDayLines = (date: Date) => {
  const day = toWarsawDay(date);
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, dayOfMonth + 1)).toISOString();
  return [
    `DTSTART;VALUE=DATE:${day.replaceAll("-", "")}`,
    `DTEND;VALUE=DATE:${next.slice(0, 10).replaceAll("-", "")}`,
  ];
};

const utcStamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** The last day of an access that ends at `end` (an end at midnight belongs to the day before). */
export const lastAccessDay = (end: Date) => new Date(end.getTime() - 1);

const escapeText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets continue on the next line after a space (§3.1). */
const fold = (line: string) => {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let octets = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);

  return parts.join("\r\n ");
};

const eventLines = (event: MyAccessCalendarEvent, now: Date) => [
  "BEGIN:VEVENT",
  `UID:${event.uid}`,
  `DTSTAMP:${utcStamp(now)}`,
  ...(event.when.allDay
    ? allDayLines(event.when.day)
    : [
        `DTSTART:${utcStamp(event.when.start)}`,
        `DTEND:${utcStamp(new Date(event.when.start.getTime() + HOUR_MS))}`,
      ]),
  `SUMMARY:${escapeText(event.summary)}`,
  "TRANSP:TRANSPARENT",
  "END:VEVENT",
];

const calendarFile = (head: string[], events: MyAccessCalendarEvent[], now: Date) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Anna Strok//My access//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...head,
    ...events.flatMap((event) => eventLines(event, now)),
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n") + "\r\n";

export const buildCalendarFile = (event: MyAccessCalendarEvent, now: Date) =>
  calendarFile([], [event], now);

/** How often a subscribed calendar is asked to look again. */
const FEED_REFRESH = "PT6H";

/**
 * The subscription: every date the page shows right now. Events keep the UIDs of
 * the single files, and a date that moves or disappears does so on the next refresh.
 */
export const buildCalendarFeed = (
  events: MyAccessCalendarEvent[],
  now: Date,
  name: string,
) =>
  calendarFile(
    [
      `X-WR-CALNAME:${escapeText(name)}`,
      `REFRESH-INTERVAL;VALUE=DURATION:${FEED_REFRESH}`,
      `X-PUBLISHED-TTL:${FEED_REFRESH}`,
    ],
    events,
    now,
  );
