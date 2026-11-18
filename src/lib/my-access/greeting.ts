/*
 * The greeting of «Мой доступ»: the part of the day where the reader is, and the
 * first name from the purchase when it looks like one. Pure: the page passes the
 * time zone (Vercel's IP time zone header, else Warsaw) and the stored full name.
 */

export type Daypart = "morning" | "day" | "evening" | "night";

const FALLBACK_TIME_ZONE = "Europe/Warsaw";
/** Letters of any script, inner hyphens and apostrophes ("Anna-Maria", "O'Neil"). */
const NAME_PATTERN = /^\p{L}+(?:['’-]\p{L}+)*$/u;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 24;

/** A valid IANA zone, else Warsaw, where every date on the page is shown. */
export const resolveTimeZone = (candidate: string | null | undefined) => {
  const zone = candidate?.trim();
  if (!zone) return FALLBACK_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
};

/** 5–11 morning, 12–16 day, 17–22 evening, 23–4 night, by the reader's clock. */
export const getDaypart = (now: Date, timeZone: string): Daypart => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: resolveTimeZone(timeZone),
    }).format(now),
  );

  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "day";
  if (hour >= 17 && hour < 23) return "evening";
  return "night";
};

/**
 * The first word of the stored name, written the usual way ("ANNA" and "anna" read
 * "Anna"); null for anything that is not plainly a name (emails, digits, initials).
 */
export const getFirstName = (fullName: string | null | undefined): string | null => {
  const first = fullName?.trim().split(/\s+/u)[0] ?? "";

  if (
    first.length < MIN_NAME_LENGTH ||
    first.length > MAX_NAME_LENGTH ||
    !NAME_PATTERN.test(first)
  ) {
    return null;
  }

  const isOneCase = first === first.toLowerCase() || first === first.toUpperCase();
  return isOneCase
    ? first
        .toLowerCase()
        .replace(
          /(^|['’-])(\p{L})/gu,
          (_, mark, letter) => `${mark}${letter.toUpperCase()}`,
        )
    : first;
};

export type GreetingPools = Record<Daypart | "always", readonly string[]>;

/**
 * A different greeting on every visit: one of the hour's own, or now and then one
 * that suits any hour. The hour's pool counts twice, so it comes up more often.
 */
export const pickGreeting = (
  pools: GreetingPools,
  daypart: Daypart,
  name: string | null,
  random: () => number = Math.random,
) => {
  const pool = [...pools[daypart], ...pools[daypart], ...pools.always];
  const greeting = pool[Math.floor(random() * pool.length)] ?? pools[daypart][0] ?? "";
  return name ? greeting.replaceAll("{name}", name) : greeting;
};
