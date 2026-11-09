import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  findHubAccessCoverage,
  findInspirationHubChatId,
  listEndedHubAccessRights,
  markHubAccessRightsExpired,
} from "@/db/hub-access-coverage";
import { accessEntitlements, telegramUserBindings } from "@/db/schema";
import type { DatabaseExecutor } from "@/db/transaction";
import { logSafeError } from "@/lib/safe-error-log";

import { shouldIgnoreKickFailure } from "./bot-api";
import { kickUnexpectedMember } from "./online-group-access";

type ExpiredLegacyHubRow = {
  binding: typeof telegramUserBindings.$inferSelect;
  entitlement: typeof accessEntitlements.$inferSelect;
};

type HubExpiryGroup = {
  chatId: string;
  endedRightIds: string[];
  legacyRows: ExpiredLegacyHubRow[];
  telegramUserId: string;
};

type HubExpiryResult = {
  failedGroups: number;
  processedGroups: number;
  revokedBindings: number;
  revokedGroups: number;
  stalledGroups: number;
};

// Bindings of period-model rights carry no reliable deadline copy, so only bindings of
// legacy (or unlinked) entitlements can keep a member on the legacy path.
const isLegacyBinding = sql`(
  ${telegramUserBindings.entitlementId} IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM ${accessEntitlements} classified
    WHERE classified.id = ${telegramUserBindings.entitlementId}
      AND classified.source_kind IS NOT NULL
  )
)`;

const findNewerLegacyHubBinding = async (
  database: DatabaseExecutor,
  group: HubExpiryGroup,
  now: Date,
) => {
  const [binding] = await database
    .select({ id: telegramUserBindings.id })
    .from(telegramUserBindings)
    .where(
      and(
        eq(telegramUserBindings.telegramUserId, group.telegramUserId),
        eq(telegramUserBindings.chatId, group.chatId),
        eq(telegramUserBindings.status, "active"),
        or(
          isNull(telegramUserBindings.accessExpiresAt),
          gt(telegramUserBindings.accessExpiresAt, now),
        ),
        isLegacyBinding,
      ),
    )
    .limit(1);

  return binding ?? null;
};

const hasActiveHubBinding = async (database: DatabaseExecutor, group: HubExpiryGroup) => {
  const [binding] = await database
    .select({ id: telegramUserBindings.id })
    .from(telegramUserBindings)
    .where(
      and(
        eq(telegramUserBindings.telegramUserId, group.telegramUserId),
        eq(telegramUserBindings.chatId, group.chatId),
        eq(telegramUserBindings.status, "active"),
      ),
    )
    .limit(1);

  return Boolean(binding);
};

const markLegacyHubRowsExpired = async (
  database: DatabaseExecutor,
  rows: readonly ExpiredLegacyHubRow[],
  now: Date,
) => {
  await Promise.all(
    rows.map(async ({ binding, entitlement }) => {
      await database
        .update(telegramUserBindings)
        .set({
          revokedAt: now,
          revokedReason: "expired",
          status: "revoked",
          updatedAt: now,
        })
        .where(eq(telegramUserBindings.id, binding.id));
      await database
        .update(accessEntitlements)
        .set({
          revokedAt: now,
          revokedReason: "expired",
          status: "revoked",
          updatedAt: now,
        })
        .where(eq(accessEntitlements.id, entitlement.id));
    }),
  );
};

// After removal from the chat, bindings of period-model rights stop being active too.
const markClassifiedHubBindingsRemoved = async (
  database: DatabaseExecutor,
  group: HubExpiryGroup,
  now: Date,
) => {
  await database
    .update(telegramUserBindings)
    .set({
      revokedAt: now,
      revokedReason: "expired",
      status: "revoked",
      updatedAt: now,
    })
    .where(
      and(
        eq(telegramUserBindings.telegramUserId, group.telegramUserId),
        eq(telegramUserBindings.chatId, group.chatId),
        eq(telegramUserBindings.status, "active"),
        sql`NOT ${isLegacyBinding}`,
      ),
    );
};

/**
 * Removes members whose Hub access ended. Legacy rights (no source_kind) expire by
 * their binding deadline exactly as before. Period-model rights decide by their own
 * dates: their end is recorded as status "expired", never as a revocation, and a
 * member stays while any of their rights is active or a paid continuation is stalled.
 */
export const revokeExpiredOnlineGroupHubAccess = async ({
  database = getDatabase(),
  now = new Date(),
}: {
  database?: DatabaseExecutor;
  now?: Date;
} = {}): Promise<HubExpiryResult> => {
  const expiredLegacyRows = await database
    .select({ binding: telegramUserBindings, entitlement: accessEntitlements })
    .from(telegramUserBindings)
    .innerJoin(
      accessEntitlements,
      eq(telegramUserBindings.entitlementId, accessEntitlements.id),
    )
    .where(
      and(
        eq(telegramUserBindings.status, "active"),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        isNull(accessEntitlements.sourceKind),
        lte(telegramUserBindings.accessExpiresAt, now),
      ),
    );
  const hubChatId = await findInspirationHubChatId(database);
  const endedRights = await listEndedHubAccessRights(database, {
    checkedAt: now,
    hubChatId,
  });
  const groups = new Map<string, HubExpiryGroup>();
  const getGroup = (telegramUserId: string, chatId: string) => {
    const key = `${telegramUserId}:${chatId}`;
    const group = groups.get(key) ?? {
      chatId,
      endedRightIds: [],
      legacyRows: [],
      telegramUserId,
    };

    groups.set(key, group);
    return group;
  };
  const unownedEndedRightIds: string[] = [];

  for (const row of expiredLegacyRows) {
    getGroup(row.binding.telegramUserId, row.binding.chatId ?? "").legacyRows.push(row);
  }

  for (const right of endedRights) {
    if (right.telegramUserId && right.chatId) {
      getGroup(right.telegramUserId, right.chatId).endedRightIds.push(
        right.entitlementId,
      );
    } else {
      unownedEndedRightIds.push(right.entitlementId);
    }
  }

  await markHubAccessRightsExpired(database, unownedEndedRightIds, now);

  const result: HubExpiryResult = {
    failedGroups: 0,
    processedGroups: 0,
    revokedBindings: 0,
    revokedGroups: 0,
    stalledGroups: 0,
  };

  for (const group of groups.values()) {
    if (!group.chatId) {
      continue;
    }

    result.processedGroups += 1;

    if (await findNewerLegacyHubBinding(database, group, now)) {
      result.revokedBindings += group.legacyRows.length;
      await markLegacyHubRowsExpired(database, group.legacyRows, now);
      await markHubAccessRightsExpired(database, group.endedRightIds, now);
      continue;
    }

    const coverage = await findHubAccessCoverage(database, {
      chatId: group.chatId,
      checkedAt: now,
      hubChatId,
      telegramUserId: group.telegramUserId,
    });

    if (coverage.stalledEntitlementIds.length > 0 || coverage.hasActiveRight) {
      if (coverage.stalledEntitlementIds.length > 0) {
        result.stalledGroups += 1;
        console.warn("Paid Hub continuation is stalled; the member stays in the Hub", {
          entitlementIds: coverage.stalledEntitlementIds,
        });
      }

      // The expired legacy binding stays active as the membership record until the
      // period-model access that keeps this member ends.
      await markHubAccessRightsExpired(database, group.endedRightIds, now);
      continue;
    }

    if (group.legacyRows.length > 0 || (await hasActiveHubBinding(database, group))) {
      // One unreachable chat must not abort the whole run: an unrevoked group stays
      // active and is retried next run, while every other group still gets processed.
      try {
        await kickUnexpectedMember(group.chatId, group.telegramUserId);
      } catch (error) {
        if (!shouldIgnoreKickFailure(error)) {
          result.failedGroups += 1;
          logSafeError("Failed to revoke expired Online Group access", error);

          continue;
        }
      }

      result.revokedGroups += 1;
      result.revokedBindings += group.legacyRows.length;
      await markLegacyHubRowsExpired(database, group.legacyRows, now);
      await markClassifiedHubBindingsRemoved(database, group, now);
    }

    await markHubAccessRightsExpired(database, group.endedRightIds, now);
  }

  return result;
};
