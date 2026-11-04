import { createHash } from "node:crypto";

import {
  getOfferAccessDurationDaysByOfferId,
  isChoreoChannelOfferId,
  isFirstTouchOfferId,
  isLifetimeChannelOfferId,
} from "@/lib/telegram/offer-access";

const DAY_MS = 86_400_000;
export const CHOREO_REMINDER_DAYS = 14;

export type ChoreoReminderBinding = {
  bindingId: string;
  chatId: string | null;
  telegramUserId: string;
  boundAt: Date;
  expiresAt: Date | null;
  offerId: string | null;
  email: string | null;
  locale: string | null;
  lessonLanguage: string | null;
  productTitle: string | null;
  amountMinor: number;
  source: string;
  livemode: boolean;
};

export type ChoreoAccessReminder = {
  bindingId: string;
  chatId: string;
  telegramUserId: string;
  expiresAt: Date;
  offerId: string;
  email: string;
  locale: string | null;
  lessonLanguage: string | null;
  productTitle: string | null;
  deduplicationKey: string;
};

const calendarDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const getEffectiveExpiry = (binding: ChoreoReminderBinding) => {
  if (binding.expiresAt) return binding.expiresAt;
  const offerId = binding.offerId ?? "";
  if (!isChoreoChannelOfferId(offerId) && !isFirstTouchOfferId(offerId)) return null;
  const override = isChoreoChannelOfferId(offerId)
    ? Number(process.env.TELEGRAM_CHOREO_ACCESS_DAYS)
    : 0;
  const days =
    override > 0 && Number.isFinite(override)
      ? override
      : getOfferAccessDurationDaysByOfferId(offerId);
  return days ? new Date(binding.boundAt.getTime() + days * DAY_MS) : null;
};

/** Match channel revocation: the longest active binding controls actual access. */
export const planChoreoAccessReminders = ({
  bindings,
  now,
  livemode,
}: {
  bindings: readonly ChoreoReminderBinding[];
  now: Date;
  livemode: boolean;
}): ChoreoAccessReminder[] => {
  const groups = new Map<string, ChoreoReminderBinding[]>();
  for (const binding of bindings) {
    if (!binding.chatId || !binding.telegramUserId || binding.boundAt > now) continue;
    const key = `${binding.chatId}:${binding.telegramUserId}`;
    groups.set(key, [...(groups.get(key) ?? []), binding]);
  }

  const reminders: ChoreoAccessReminder[] = [];
  for (const group of groups.values()) {
    if (group.some((binding) => isLifetimeChannelOfferId(binding.offerId ?? "")))
      continue;
    const expiries = group.map(getEffectiveExpiry);
    // An unknown access deadline cannot support a truthful expiry reminder.
    if (expiries.some((expiry) => !expiry || !Number.isFinite(expiry.getTime())))
      continue;
    const expiresAt = new Date(Math.max(...expiries.map((expiry) => expiry!.getTime())));
    const daysLeft =
      (Date.parse(calendarDay(expiresAt)) - Date.parse(calendarDay(now))) / DAY_MS;
    if (expiresAt <= now || daysLeft > CHOREO_REMINDER_DAYS) continue;

    const recipients = new Set<string>();
    for (const binding of [...group].sort(
      (a, b) =>
        b.boundAt.getTime() - a.boundAt.getTime() ||
        a.bindingId.localeCompare(b.bindingId),
    )) {
      const email = binding.email?.trim().toLowerCase() ?? "";
      if (
        !email ||
        recipients.has(email) ||
        binding.source !== "stripe" ||
        binding.amountMinor <= 0 ||
        binding.livemode !== livemode ||
        !isChoreoChannelOfferId(binding.offerId ?? "")
      )
        continue;
      recipients.add(email);
      const identity = JSON.stringify([
        binding.chatId,
        binding.telegramUserId,
        email,
        expiresAt.toISOString(),
      ]);
      reminders.push({
        bindingId: binding.bindingId,
        chatId: binding.chatId!,
        telegramUserId: binding.telegramUserId,
        expiresAt,
        offerId: binding.offerId!,
        email,
        locale: binding.locale,
        lessonLanguage: binding.lessonLanguage,
        productTitle: binding.productTitle,
        deduplicationKey: `choreo-expiry-14d-v1:${createHash("sha256").update(identity).digest("hex")}`,
      });
    }
  }
  return reminders;
};
