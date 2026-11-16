import { sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";

import { accessEntitlements } from "./schema";

type AccessEntitlementSet = PgUpdateSetSource<typeof accessEntitlements>;

const PERIOD_FIELDS = {
  startsAt: "starts_at",
  expiresAt: "expires_at",
  revokedAt: "revoked_at",
  revokedReason: "revoked_reason",
} as const satisfies Partial<Record<keyof AccessEntitlementSet, string>>;

/** Terminal statuses of a period-model right; only the Hub services write them. */
const TERMINAL_STATUSES = sql`('expired', 'revoked')`;

/**
 * Wraps the conflict update of a legacy delivery or payment writer.
 *
 * A row with source_kind set belongs to the Hub period model: its dates and business
 * revocation are written only by the Hub services. A legacy writer may still move its
 * delivery status (token_issued, activated, left_channel), but never to or from
 * expired/revoked, and it may fill an empty Telegram owner but never replace one.
 * Rows without source_kind update exactly as before. Each wrapped field must also be
 * present in the insert values, because the new value is read from EXCLUDED.
 */
export function keepClassifiedAccessPeriod(
  set: AccessEntitlementSet,
): AccessEntitlementSet {
  const guarded: AccessEntitlementSet = { ...set };

  for (const [field, column] of Object.entries(PERIOD_FIELDS) as [
    keyof typeof PERIOD_FIELDS,
    string,
  ][]) {
    // Drizzle skips undefined values, so only fields the writer really sets are wrapped.
    if (set[field] !== undefined) {
      guarded[field] = sql`CASE WHEN ${accessEntitlements.sourceKind} IS NULL
        THEN excluded.${sql.identifier(column)}
        ELSE ${accessEntitlements[field]} END`;
    }
  }

  if (set.status !== undefined) {
    guarded.status = sql`CASE
      WHEN ${accessEntitlements.sourceKind} IS NOT NULL
        AND (${accessEntitlements.revokedAt} IS NOT NULL
          OR ${accessEntitlements.status} IN ${TERMINAL_STATUSES}
          OR excluded.status IN ${TERMINAL_STATUSES})
      THEN ${accessEntitlements.status}
      ELSE excluded.status END`;
  }

  if (set.telegramUserId !== undefined) {
    guarded.telegramUserId = sql`CASE
      WHEN ${accessEntitlements.sourceKind} IS NOT NULL
        AND ${accessEntitlements.telegramUserId} IS NOT NULL
      THEN ${accessEntitlements.telegramUserId}
      ELSE excluded.telegram_user_id END`;
  }

  return guarded;
}
