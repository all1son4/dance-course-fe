/*
 * HUB-06, plan section 9: emails 7 and 3 Warsaw calendar days before a self-paid
 * Hub ends. Pure planning: the cron and the delivery job both ask it, so a reminder
 * is sent only while it is still true (not renewed, not covered by Plus).
 */

export type HubReminderPeriod = {
  entitlementId: string;
  purchaseId: string;
  paymentIntentId: string;
  startsAt: Date | null;
  expiresAt: Date | null;
  email: string | null;
  locale: string | null;
  /** The owner's Telegram ID; periods of one owner form one paid chain. */
  telegramUserId: string | null;
};

/** A Plus Hub right of an owner: running while its end is unknown. */
export type HubReminderPlusRight = {
  telegramUserId: string;
  expiresAt: Date | null;
  /** The Plus cohort's start: a Plus starting after the Hub ends does not cover it. */
  startsAt: Date | null;
};

export type HubExpiryReminder = {
  deduplicationKey: string;
  kind: 7 | 3;
  entitlementId: string;
  paymentIntentId: string;
  endsAt: Date;
  email: string;
  locale: string | null;
};

const warsawDayNumber = (date: Date) => {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Warsaw",
    year: "numeric",
  })
    .format(date)
    .split("-")
    .map(Number);

  return Date.UTC(year!, month! - 1, day!) / 86_400_000;
};

/** Whole Warsaw calendar days from `now` to `end`: 5 January seen on 29 December is 7. */
export const warsawDaysUntil = (end: Date, now: Date) =>
  warsawDayNumber(end) - warsawDayNumber(now);

export const hubReminderDeduplicationKey = (entitlementId: string, kind: 7 | 3) =>
  `hub_expiry_reminder:${entitlementId}:${kind}`;

/**
 * One reminder per paid chain that ends soon: the 7-day one from 7 to 4 days left,
 * the 3-day one from 3 days to the end. A missed day therefore sends the current
 * reminder, never two stale ones. The key names the chain's last period, so a
 * renewal (a new last period) makes earlier reminders obsolete.
 */
export const planHubExpiryReminders = ({
  now,
  periods,
  plusRights,
}: {
  now: Date;
  periods: readonly HubReminderPeriod[];
  plusRights: readonly HubReminderPlusRight[];
}): HubExpiryReminder[] => {
  const chains = new Map<string, HubReminderPeriod[]>();

  for (const period of periods) {
    const owner = period.telegramUserId ?? `purchase:${period.purchaseId}`;
    chains.set(owner, [...(chains.get(owner) ?? []), period]);
  }

  const reminders: HubExpiryReminder[] = [];

  for (const [owner, chain] of chains) {
    // A period still waiting for its predecessor has no end yet: the chain goes on.
    if (chain.some((period) => period.startsAt === null || period.expiresAt === null)) {
      continue;
    }

    const last = chain.reduce((latest, period) =>
      period.expiresAt!.getTime() > latest.expiresAt!.getTime() ? period : latest,
    );
    const endsAt = last.expiresAt!;
    const email = last.email?.trim().toLowerCase() ?? "";

    if (endsAt <= now || !email) continue;

    const daysLeft = warsawDaysUntil(endsAt, now);
    const kind = daysLeft <= 3 ? 3 : daysLeft <= 7 ? 7 : null;

    if (!kind) continue;

    // Plus already keeps this person in the Hub past the end: no renewal pitch.
    const coveredByPlus =
      !owner.startsWith("purchase:") &&
      plusRights.some(
        (right) =>
          right.telegramUserId === owner &&
          (right.startsAt === null || right.startsAt <= endsAt) &&
          (right.expiresAt === null || right.expiresAt > endsAt),
      );

    if (coveredByPlus) continue;

    reminders.push({
      deduplicationKey: hubReminderDeduplicationKey(last.entitlementId, kind),
      email,
      endsAt,
      entitlementId: last.entitlementId,
      kind,
      locale: last.locale,
      paymentIntentId: last.paymentIntentId,
    });
  }

  return reminders;
};
