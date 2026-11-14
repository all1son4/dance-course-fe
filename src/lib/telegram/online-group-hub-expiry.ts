import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  findHubAccessCoverage,
  findInspirationHubChatId,
  hasUnfinishedStandaloneHubRight,
  listEndedHubAccessRights,
  listOwnerlessHubPurchases,
  listStalledHubContinuations,
  markHubAccessRightsExpired,
} from "@/db/hub-access-coverage";
import { accessEntitlements, telegramUserBindings } from "@/db/schema";
import type { DatabaseExecutor } from "@/db/transaction";
import { logSafeError } from "@/lib/safe-error-log";

import { sendTelegramMessage, shouldIgnoreKickFailure } from "./bot-api";
import {
  getTelegramAlertsBotToken,
  getTelegramAlertsChatId,
  isTelegramAlertsConfigured,
} from "./config";
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

/** What the cron could not settle on its own; reported on every run until fixed. */
export type HubExpiryProblems = {
  /** К6: standalone rights exist but the shared Hub chat is not configured. */
  hubSettingsMissing: boolean;
  /** К5: ended rights left unmarked because nobody can be removed for them. */
  ownerlessEndedPaymentIntentIds: string[];
  /** К5: running Hub purchases whose owner is unknown for over three days. */
  ownerlessPurchasePaymentIntentIds: string[];
  /** К13: paid continuations left without dates after their cohort closed. */
  stalledContinuationPaymentIntentIds: string[];
};

type HubExpiryResult = {
  failedGroups: number;
  problems: HubExpiryProblems;
  processedGroups: number;
  revokedBindings: number;
  revokedGroups: number;
  stalledGroups: number;
};

const hasHubExpiryProblems = (problems: HubExpiryProblems) =>
  problems.hubSettingsMissing ||
  problems.ownerlessEndedPaymentIntentIds.length > 0 ||
  problems.ownerlessPurchasePaymentIntentIds.length > 0 ||
  problems.stalledContinuationPaymentIntentIds.length > 0;

const listPaymentIntents = (ids: readonly string[]) =>
  ids.map((id) => `• ${id}`).join("\n");

/** Russian, like every operator alert; states what was observed, not why. */
export const buildHubExpiryProblemsText = (problems: HubExpiryProblems): string =>
  [
    "⚠️ Inspiration Hub: крон не смог закончить работу",
    ...(problems.hubSettingsMissing
      ? [
          "",
          "Не задан общий чат хаба (inspiration_hub_settings). Самостоятельные права не помечаются истёкшими, пока его нет.",
        ]
      : []),
    ...(problems.ownerlessEndedPaymentIntentIds.length > 0
      ? [
          "",
          "Срок хаба закончился, Telegram-аккаунт покупателя не известен, удалить некого:",
          listPaymentIntents(problems.ownerlessEndedPaymentIntentIds),
        ]
      : []),
    ...(problems.ownerlessPurchasePaymentIntentIds.length > 0
      ? [
          "",
          "Хаб оплачен больше 3 дней назад, Telegram-аккаунт покупателя не известен:",
          listPaymentIntents(problems.ownerlessPurchasePaymentIntentIds),
        ]
      : []),
    ...(problems.stalledContinuationPaymentIntentIds.length > 0
      ? [
          "",
          "Поток закрыт, а оплаченное продолжение хаба так и не получило даты (человек пока остаётся в хабе):",
          listPaymentIntents(problems.stalledContinuationPaymentIntentIds),
        ]
      : []),
  ].join("\n");

const sendHubExpiryProblemsToAlerts = async (problems: HubExpiryProblems) => {
  const botToken = getTelegramAlertsBotToken();
  const chatId = getTelegramAlertsChatId();

  if (!isTelegramAlertsConfigured() || !botToken || !chatId) {
    throw new Error("telegram_alerts_not_configured");
  }

  await sendTelegramMessage({
    botToken,
    chatId,
    disableWebPagePreview: true,
    text: buildHubExpiryProblemsText(problems),
  });
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
  removeMember = kickUnexpectedMember,
  reportProblems = sendHubExpiryProblemsToAlerts,
}: {
  database?: DatabaseExecutor;
  now?: Date;
  /** Removes one member from one chat; the preview records instead of removing. */
  removeMember?: (chatId: string, telegramUserId: string) => Promise<void>;
  reportProblems?: (problems: HubExpiryProblems) => Promise<void>;
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
  const problems: HubExpiryProblems = {
    hubSettingsMissing:
      hubChatId === null && (await hasUnfinishedStandaloneHubRight(database)),
    ownerlessEndedPaymentIntentIds: [],
    ownerlessPurchasePaymentIntentIds: await listOwnerlessHubPurchases(database, {
      checkedAt: now,
    }),
    stalledContinuationPaymentIntentIds: await listStalledHubContinuations(database),
  };

  for (const row of expiredLegacyRows) {
    getGroup(row.binding.telegramUserId, row.binding.chatId ?? "").legacyRows.push(row);
  }

  // An ended right nobody can be removed for stays unmarked, so it is reported on
  // every run instead of disappearing from view (К5, К6).
  for (const right of endedRights) {
    if (!right.telegramUserId) {
      problems.ownerlessEndedPaymentIntentIds.push(right.paymentIntentId);
    } else if (right.chatId) {
      getGroup(right.telegramUserId, right.chatId).endedRightIds.push(
        right.entitlementId,
      );
    }
  }

  const result: HubExpiryResult = {
    failedGroups: 0,
    problems,
    processedGroups: 0,
    revokedBindings: 0,
    revokedGroups: 0,
    stalledGroups: 0,
  };

  if (hasHubExpiryProblems(problems)) {
    console.error("Inspiration Hub expiry needs attention", problems);
    try {
      await reportProblems(problems);
    } catch (error) {
      logSafeError("Failed to report Inspiration Hub expiry problems", error);
    }
  }

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
        await removeMember(group.chatId, group.telegramUserId);
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
