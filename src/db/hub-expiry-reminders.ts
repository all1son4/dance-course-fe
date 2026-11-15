import { and, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";

import type {
  HubReminderPeriod,
  HubReminderPlusRight,
} from "@/lib/inspiration-hub/expiry-reminders";

import { accessEntitlements, onlineGroupCohorts, purchases } from "./schema";
import type { DatabaseExecutor } from "./transaction";

/*
 * Read side of the Hub expiry reminders (HUB-06). `livemode` keeps test purchases
 * out of production mail, as for the start-day invites.
 */

/** Every self-paid Hub period that is still in force or ahead. */
export async function listHubReminderPeriods(
  database: DatabaseExecutor,
  { livemode, telegramUserId }: { livemode: boolean; telegramUserId?: string },
): Promise<HubReminderPeriod[]> {
  const rows = await database
    .select({
      email: purchases.customerEmailSnapshot,
      entitlementId: accessEntitlements.id,
      expiresAt: accessEntitlements.expiresAt,
      locale: purchases.checkoutLocale,
      paymentIntentId: purchases.paymentIntentId,
      purchaseId: purchases.id,
      startsAt: accessEntitlements.startsAt,
      telegramUserId: purchases.telegramUserId,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(accessEntitlements.sourceKind, "standalone_hub"),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        isNull(accessEntitlements.revokedAt),
        ne(accessEntitlements.status, "revoked"),
        eq(purchases.outcome, "succeeded"),
        eq(purchases.livemode, livemode),
        telegramUserId ? eq(purchases.telegramUserId, telegramUserId) : undefined,
      ),
    );

  return rows;
}

/** Plus Hub rights of these owners that have not ended. */
export async function listHubReminderPlusRights(
  database: DatabaseExecutor,
  telegramUserIds: string[],
): Promise<HubReminderPlusRight[]> {
  if (telegramUserIds.length === 0) return [];

  const rows = await database
    .select({
      cohortStartsAt: onlineGroupCohorts.startsAt,
      entitlementOwner: accessEntitlements.telegramUserId,
      expiresAt: accessEntitlements.expiresAt,
      purchaseOwner: purchases.telegramUserId,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .leftJoin(
      onlineGroupCohorts,
      eq(onlineGroupCohorts.id, purchases.onlineGroupCohortId),
    )
    .where(
      and(
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        or(
          isNull(accessEntitlements.sourceKind),
          eq(accessEntitlements.sourceKind, "online_group"),
        ),
        isNull(accessEntitlements.revokedAt),
        notInArray(accessEntitlements.status, ["expired", "revoked"]),
        eq(purchases.outcome, "succeeded"),
        or(
          inArray(purchases.telegramUserId, telegramUserIds),
          inArray(accessEntitlements.telegramUserId, telegramUserIds),
        ),
      ),
    );

  return rows.flatMap((row) => {
    const owner = row.purchaseOwner ?? row.entitlementOwner;
    return owner
      ? [
          {
            expiresAt: row.expiresAt,
            startsAt: row.cohortStartsAt,
            telegramUserId: owner,
          },
        ]
      : [];
  });
}
