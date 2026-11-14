import { and, eq, gt, isNotNull, isNull, lte, notExists, or } from "drizzle-orm";

import { accessEntitlements, purchases, telegramAccessTokens } from "./schema";
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
        lte(accessEntitlements.startsAt, now),
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
