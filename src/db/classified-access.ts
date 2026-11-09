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

/**
 * Wraps the conflict update of a legacy delivery or payment writer.
 *
 * A row with source_kind set belongs to the Hub period model: its dates and business
 * revocation are written only by the Hub services, and a revoked row keeps its status.
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
        AND ${accessEntitlements.revokedAt} IS NOT NULL
      THEN ${accessEntitlements.status}
      ELSE excluded.status END`;
  }

  return guarded;
}
