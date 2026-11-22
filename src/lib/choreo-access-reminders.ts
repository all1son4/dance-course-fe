import { createHash } from "node:crypto";

import { warsawDaysBetween } from "@/lib/inspiration-hub/calendar";
import {
  getTelegramChannelAccessDurationMs,
  isChoreoChannelOfferId,
  isLifetimeChannelOfferId,
} from "@/lib/telegram/offer-access";

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

// The rule that removes the member from the channel, so the email names that day.
const getEffectiveExpiry = (binding: ChoreoReminderBinding) => {
  if (binding.expiresAt) return binding.expiresAt;
  const durationMs = getTelegramChannelAccessDurationMs(binding.offerId ?? "");
  return durationMs ? new Date(binding.boundAt.getTime() + durationMs) : null;
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
    const daysLeft = warsawDaysBetween(now, expiresAt);
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
