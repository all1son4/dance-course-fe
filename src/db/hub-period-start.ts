import { and, eq, gt, inArray, isNotNull, isNull, lt, notExists, or } from "drizzle-orm";

import {
  ONLINE_GROUP_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
} from "@/constants/sellable-products";
import { getStartOfNextWarsawDay } from "@/lib/inspiration-hub/calendar";
import { DAY_MS } from "@/lib/time";

import {
  accessEntitlements,
  onlineGroupCohorts,
  purchases,
  telegramAccessTokens,
} from "./schema";
import type { DatabaseExecutor } from "./transaction";

export type StartedHubPeriodWithoutInvite = {
  email: string;
  entitlementId: string;
  paymentIntentId: string;
  startsAt: Date;
};

/**
 * HUB-D37: paid Hub periods that have begun while their buyer still has no invite.
 * Such a period was answered "scheduled" at payment; a buyer who was already in the
 * Hub was answered "active" and is no longer pending, so only the ones who need a
 * link are listed. `livemode` keeps test purchases out of production mail.
 */
export async function listStartedHubPeriodsWithoutInvite(
  database: DatabaseExecutor,
  { livemode, now }: { livemode: boolean; now: Date },
): Promise<StartedHubPeriodWithoutInvite[]> {
  const rows = await database
    .select({
      email: purchases.customerEmailSnapshot,
      entitlementId: accessEntitlements.id,
      paymentIntentId: purchases.paymentIntentId,
      startsAt: accessEntitlements.startsAt,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(accessEntitlements.sourceKind, "standalone_hub"),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        eq(accessEntitlements.status, "pending"),
        isNull(accessEntitlements.revokedAt),
        // The whole start day counts (HUB-D37): the 03:00 UTC run sends it that morning.
        lt(accessEntitlements.startsAt, getStartOfNextWarsawDay(now)),
        or(isNull(accessEntitlements.expiresAt), gt(accessEntitlements.expiresAt, now)),
        eq(purchases.outcome, "succeeded"),
        eq(purchases.livemode, livemode),
        isNotNull(purchases.customerEmailSnapshot),
        notExists(
          database
            .select({ id: telegramAccessTokens.id })
            .from(telegramAccessTokens)
            .where(eq(telegramAccessTokens.purchaseId, purchases.id)),
        ),
      ),
    )
    .orderBy(accessEntitlements.startsAt);

  return rows.flatMap((row) =>
    row.email && row.startsAt
      ? [
          {
            email: row.email.trim().toLowerCase(),
            entitlementId: row.entitlementId,
            paymentIntentId: row.paymentIntentId,
            startsAt: row.startsAt,
          },
        ]
      : [],
  );
}

export type StartedPlusHubWithoutInvite = {
  email: string;
  paymentIntentId: string;
  purchaseId: string;
  startsAt: Date;
};

/** How far back a cohort start still sends its Plus Hub invite (a missed cron run). */
const PLUS_HUB_INVITE_CATCH_UP_DAYS = 14;

/**
 * HUB-D43: Plus purchases of a cohort that has started whose buyer has no Hub invite
 * yet: at payment they were answered "scheduled". Plus bought before the rule got
 * its invite at payment and is left out by the token check; the window keeps old
 * cohorts out entirely.
 */
export async function listStartedPlusHubsWithoutInvite(
  database: DatabaseExecutor,
  { livemode, now }: { livemode: boolean; now: Date },
): Promise<StartedPlusHubWithoutInvite[]> {
  const windowStart = new Date(now.getTime() - PLUS_HUB_INVITE_CATCH_UP_DAYS * DAY_MS);
  const rows = await database
    .select({
      email: purchases.customerEmailSnapshot,
      paymentIntentId: purchases.paymentIntentId,
      purchaseId: purchases.id,
      startsAt: onlineGroupCohorts.startsAt,
    })
    .from(purchases)
    .innerJoin(
      onlineGroupCohorts,
      eq(onlineGroupCohorts.id, purchases.onlineGroupCohortId),
    )
    .where(
      and(
        inArray(purchases.offerExternalId, [
          ONLINE_GROUP_LIBRARY_OFFER_ID,
          ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
        ]),
        eq(purchases.outcome, "succeeded"),
        eq(purchases.livemode, livemode),
        isNotNull(purchases.customerEmailSnapshot),
        isNotNull(purchases.inspirationChatIdSnapshot),
        lt(onlineGroupCohorts.startsAt, getStartOfNextWarsawDay(now)),
        gt(onlineGroupCohorts.startsAt, windowStart),
        isNull(onlineGroupCohorts.closedAt),
        notExists(
          database
            .select({ id: telegramAccessTokens.id })
            .from(telegramAccessTokens)
            .where(
              and(
                eq(telegramAccessTokens.purchaseId, purchases.id),
                eq(telegramAccessTokens.chatId, purchases.inspirationChatIdSnapshot),
              ),
            ),
        ),
      ),
    )
    .orderBy(onlineGroupCohorts.startsAt);

  return rows.flatMap((row) =>
    row.email
      ? [
          {
            email: row.email.trim().toLowerCase(),
            paymentIntentId: row.paymentIntentId,
            purchaseId: row.purchaseId,
            startsAt: row.startsAt,
          },
        ]
      : [],
  );
}
