import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm";

import { planChoreoAccessReminders } from "@/lib/choreo-access-reminders";

import { getDatabase } from "./client";
import { accessEntitlements, purchases, telegramUserBindings } from "./schema";

const loadActiveBindings = async (identity?: {
  chatId: string;
  telegramUserId: string;
}) =>
  getDatabase()
    .select({
      bindingId: telegramUserBindings.id,
      chatId: telegramUserBindings.chatId,
      telegramUserId: telegramUserBindings.telegramUserId,
      boundAt: telegramUserBindings.boundAt,
      expiresAt: telegramUserBindings.accessExpiresAt,
      offerId: purchases.offerExternalId,
      email: sql<
        string | null
      >`COALESCE(NULLIF(BTRIM(${telegramUserBindings.customerEmailSnapshot}), ''), ${purchases.customerEmailSnapshot})`,
      locale: purchases.checkoutLocale,
      lessonLanguage: purchases.lessonLanguage,
      productTitle: purchases.productTitleSnapshot,
      amountMinor: purchases.amountMinor,
      source: purchases.source,
      livemode: purchases.livemode,
    })
    .from(telegramUserBindings)
    .innerJoin(purchases, eq(purchases.id, telegramUserBindings.purchaseId))
    .leftJoin(
      accessEntitlements,
      eq(accessEntitlements.id, telegramUserBindings.entitlementId),
    )
    .where(
      and(
        eq(telegramUserBindings.status, "active"),
        isNull(telegramUserBindings.revokedAt),
        eq(purchases.outcome, "succeeded"),
        isNull(accessEntitlements.revokedAt),
        or(
          isNull(accessEntitlements.id),
          notInArray(accessEntitlements.status, ["revoked", "expired", "left_channel"]),
        ),
        identity
          ? and(
              eq(telegramUserBindings.chatId, identity.chatId),
              eq(telegramUserBindings.telegramUserId, identity.telegramUserId),
            )
          : undefined,
      ),
    );

export const listDueChoreoAccessReminders = async (now: Date, livemode: boolean) =>
  planChoreoAccessReminders({ bindings: await loadActiveBindings(), now, livemode });

/** Re-read membership and extensions immediately before delivering a queued email. */
export const findCurrentChoreoAccessReminder = async ({
  bindingId,
  deduplicationKey,
  now,
  livemode,
}: {
  bindingId: string;
  deduplicationKey: string;
  now: Date;
  livemode: boolean;
}) => {
  const [binding] = await getDatabase()
    .select({
      chatId: telegramUserBindings.chatId,
      telegramUserId: telegramUserBindings.telegramUserId,
    })
    .from(telegramUserBindings)
    .where(eq(telegramUserBindings.id, bindingId))
    .limit(1);
  if (!binding?.chatId) return null;
  const bindings = await loadActiveBindings({
    chatId: binding.chatId,
    telegramUserId: binding.telegramUserId,
  });
  return (
    planChoreoAccessReminders({ bindings, now, livemode }).find(
      (reminder) => reminder.deduplicationKey === deduplicationKey,
    ) ?? null
  );
};
