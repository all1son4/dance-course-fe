import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notInArray,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  type HubAccessRight,
  isHubAccessRightActive,
} from "@/lib/inspiration-hub/access-state";
import { addWarsawCalendarDays } from "@/lib/inspiration-hub/calendar";

import {
  accessEntitlements,
  inspirationHubSettings,
  onlineGroupCohorts,
  purchases,
} from "./schema";
import type { DatabaseExecutor } from "./transaction";

const HUB_ACCESS_KEYS = ["inspiration-hub", "inspiration-hub-bridge"];
const FINISHED_STATUSES: ("expired" | "revoked")[] = ["expired", "revoked"];

// HUB-D24: after the Hub included in Plus ends, removal waits 7 calendar days so a
// member who renews Plus in time never leaves the Hub.
const PLUS_HUB_REMOVAL_GRACE_DAYS = 7;

/** The moment a right stops keeping its owner in the Hub chat. */
function getRemovalBoundary(right: HubAccessRight): Date | null {
  if (right.sourceKind === "online_group" && right.expiresAt !== null) {
    return addWarsawCalendarDays(right.expiresAt, PLUS_HUB_REMOVAL_GRACE_DAYS);
  }
  return right.expiresAt;
}

export type HubAccessCoverage = {
  hasActiveRight: boolean;
  stalledEntitlementIds: string[];
};

export type EndedHubAccessRight = {
  entitlementId: string;
  telegramUserId: string | null;
  chatId: string | null;
};

// A paid, unrevoked Hub right of the period model. Legacy rows (no source_kind)
// keep their binding-based expiry and never match here.
const isUsableHubRight = and(
  isNotNull(accessEntitlements.sourceKind),
  inArray(accessEntitlements.accessKey, HUB_ACCESS_KEYS),
  isNull(accessEntitlements.revokedAt),
  ne(accessEntitlements.status, "revoked"),
  eq(purchases.outcome, "succeeded"),
);

export async function findInspirationHubChatId(
  database: DatabaseExecutor,
): Promise<string | null> {
  const [settings] = await database
    .select({ chatId: inspirationHubSettings.telegramChatId })
    .from(inspirationHubSettings)
    .limit(1);

  return settings?.chatId ?? null;
}

/**
 * Lists classified Hub rights whose end has passed and that are not marked yet.
 * Owner and chat fall back to the purchase owner and the shared Hub chat.
 */
export async function listEndedHubAccessRights(
  database: DatabaseExecutor,
  { checkedAt, hubChatId }: { checkedAt: Date; hubChatId: string | null },
): Promise<EndedHubAccessRight[]> {
  const rows = await database
    .select({
      entitlementId: accessEntitlements.id,
      sourceKind: accessEntitlements.sourceKind,
      periodStartMode: accessEntitlements.periodStartMode,
      startsAt: accessEntitlements.startsAt,
      expiresAt: accessEntitlements.expiresAt,
      entitlementTelegramUserId: accessEntitlements.telegramUserId,
      purchaseTelegramUserId: purchases.telegramUserId,
      telegramChatId: accessEntitlements.telegramChatId,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(accessEntitlements.purchaseId, purchases.id))
    .where(
      and(
        isUsableHubRight,
        lte(accessEntitlements.expiresAt, checkedAt),
        notInArray(accessEntitlements.status, FINISHED_STATUSES),
      ),
    );

  return rows
    .filter((row) => {
      if (row.sourceKind === null) return false;
      const boundary = getRemovalBoundary({ ...row, sourceKind: row.sourceKind });
      return boundary !== null && boundary.getTime() <= checkedAt.getTime();
    })
    .map((row) => ({
      entitlementId: row.entitlementId,
      telegramUserId: row.entitlementTelegramUserId ?? row.purchaseTelegramUserId,
      chatId: row.telegramChatId ?? hubChatId,
    }));
}

/**
 * Says whether a Telegram user still has Hub access in a chat under the period model.
 * A paid continuation still waiting although its predecessor end is known is
 * reported as stalled: the member is kept and the chain needs attention.
 */
export async function findHubAccessCoverage(
  database: DatabaseExecutor,
  {
    chatId,
    checkedAt,
    hubChatId,
    telegramUserId,
  }: {
    chatId: string;
    checkedAt: Date;
    hubChatId: string | null;
    telegramUserId: string;
  },
): Promise<HubAccessCoverage> {
  const predecessor = alias(accessEntitlements, "predecessor");
  const predecessorPurchase = alias(purchases, "predecessor_purchase");
  const isInChat =
    chatId === hubChatId
      ? or(
          eq(accessEntitlements.telegramChatId, chatId),
          isNull(accessEntitlements.telegramChatId),
        )
      : eq(accessEntitlements.telegramChatId, chatId);

  const rights = await database
    .select({
      id: accessEntitlements.id,
      sourceKind: accessEntitlements.sourceKind,
      periodStartMode: accessEntitlements.periodStartMode,
      startsAt: accessEntitlements.startsAt,
      expiresAt: accessEntitlements.expiresAt,
      predecessorSourceKind: predecessor.sourceKind,
      predecessorExpiresAt: predecessor.expiresAt,
      predecessorCohortEndsAt: onlineGroupCohorts.accessEndsAt,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(accessEntitlements.purchaseId, purchases.id))
    .leftJoin(
      predecessor,
      eq(predecessor.id, accessEntitlements.startsAfterEntitlementId),
    )
    .leftJoin(predecessorPurchase, eq(predecessorPurchase.id, predecessor.purchaseId))
    .leftJoin(
      onlineGroupCohorts,
      eq(onlineGroupCohorts.id, predecessorPurchase.onlineGroupCohortId),
    )
    .where(
      and(
        isUsableHubRight,
        isInChat,
        or(
          eq(accessEntitlements.telegramUserId, telegramUserId),
          and(
            isNull(accessEntitlements.telegramUserId),
            eq(purchases.telegramUserId, telegramUserId),
          ),
        ),
      ),
    );

  const hasActiveRight = rights.some((right) => {
    if (right.sourceKind === null) return false;
    const accessRight = { ...right, sourceKind: right.sourceKind };

    return isHubAccessRightActive(
      { ...accessRight, expiresAt: getRemovalBoundary(accessRight) },
      checkedAt,
    );
  });
  const stalledEntitlementIds = rights
    .filter((right) => {
      const isAwaiting =
        right.sourceKind === "standalone_hub" &&
        right.periodStartMode === "after_entitlement" &&
        right.startsAt === null &&
        right.expiresAt === null;
      const predecessorEndIsKnown =
        right.predecessorSourceKind === "online_group"
          ? right.predecessorCohortEndsAt !== null
          : right.predecessorExpiresAt !== null;

      return isAwaiting && predecessorEndIsKnown;
    })
    .map((right) => right.id);

  return { hasActiveRight, stalledEntitlementIds };
}

/** Records the calendar end without revoking: expiry is not a cancelled payment. */
export async function markHubAccessRightsExpired(
  database: DatabaseExecutor,
  entitlementIds: readonly string[],
  now: Date,
): Promise<void> {
  if (entitlementIds.length === 0) return;

  await database
    .update(accessEntitlements)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        inArray(accessEntitlements.id, [...entitlementIds]),
        isNull(accessEntitlements.revokedAt),
        notInArray(accessEntitlements.status, FINISHED_STATUSES),
      ),
    );
}
