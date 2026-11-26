import { logSafeError } from "@/lib/safe-error-log";
import { toUtcIso } from "@/lib/time";

import {
  findActiveTelegramUserBindings,
  findPaymentRecordByIntentId,
  persistTelegramPaymentAccess,
  upsertTelegramUserBindingRecord,
} from "./access-persistence";
import { kickUnexpectedMember, shouldIgnoreKickFailure } from "./bot-api";
import { isTimedAccessOfferId, parseTimestamp } from "./channel-access-rules";
import { getTelegramChannelAccessDurationMs } from "./offer-access";

type RevokeExpiredTelegramAccessResult = {
  failedGroups: number;
  processedGroups: number;
  revokedBindings: number;
  revokedGroups: number;
};

const getMaxExpiresAtTs = (values: string[]) =>
  values.reduce((maxValue, value) => Math.max(maxValue, parseTimestamp(value)), 0);

const getEffectiveBindingAccessExpiresAt = ({
  accessExpiresAt,
  boundAt,
  offerId,
}: {
  accessExpiresAt: string;
  boundAt: string;
  offerId: string;
}) => {
  const savedAccessExpiresAt = accessExpiresAt.trim();

  if (savedAccessExpiresAt) {
    return savedAccessExpiresAt;
  }

  const boundAtTimestamp = parseTimestamp(boundAt);
  const accessDurationMs = getTelegramChannelAccessDurationMs(offerId);

  if (!boundAtTimestamp || !accessDurationMs) {
    return "";
  }

  return toUtcIso(new Date(boundAtTimestamp + accessDurationMs));
};

export const revokeExpiredTelegramChannelAccess =
  async (): Promise<RevokeExpiredTelegramAccessResult> => {
    const activeBindings = (await findActiveTelegramUserBindings())
      .filter((binding) => isTimedAccessOfferId(binding.offer_id))
      .map((binding) => ({
        ...binding,
        access_expires_at: getEffectiveBindingAccessExpiresAt({
          accessExpiresAt: binding.access_expires_at,
          boundAt: binding.bound_at,
          offerId: binding.offer_id,
        }),
      }));
    const groups = new Map<
      string,
      {
        bindings: typeof activeBindings;
        chatId: string;
        telegramUserId: string;
      }
    >();
    let revokedGroups = 0;
    let processedGroups = 0;
    let revokedBindings = 0;
    let failedGroups = 0;

    activeBindings.forEach((binding) => {
      const chatId = binding.chat_id.trim();
      const telegramUserId = binding.telegram_user_id.trim();

      if (!chatId || !telegramUserId) {
        return;
      }

      const groupKey = `${telegramUserId}:${chatId}`;
      const existingGroup = groups.get(groupKey);

      if (existingGroup) {
        existingGroup.bindings.push(binding);
        return;
      }

      groups.set(groupKey, {
        bindings: [binding],
        chatId,
        telegramUserId,
      });
    });

    for (const group of groups.values()) {
      processedGroups += 1;
      const maxAccessExpiresAtTs = getMaxExpiresAtTs(
        group.bindings.map((binding) => binding.access_expires_at),
      );

      if (!maxAccessExpiresAtTs || maxAccessExpiresAtTs > Date.now()) {
        continue;
      }

      let canProceedWithRevocation = false;

      try {
        await kickUnexpectedMember(group.chatId, group.telegramUserId);
        canProceedWithRevocation = true;
      } catch (error) {
        if (shouldIgnoreKickFailure(error)) {
          canProceedWithRevocation = true;
        } else {
          failedGroups += 1;
          logSafeError("Failed to revoke Telegram access for expired member", error);
        }
      }

      if (!canProceedWithRevocation) {
        continue;
      }

      const now = toUtcIso();
      revokedGroups += 1;

      for (const binding of group.bindings) {
        revokedBindings += 1;

        await upsertTelegramUserBindingRecord({
          ...binding,
          last_seen_at: now,
          revoked_at: now,
          revoked_reason: "expired",
          status: "revoked",
        });

        const paymentRecord = await findPaymentRecordByIntentId(
          binding.payment_intent_id,
        );

        if (!paymentRecord) {
          continue;
        }

        await persistTelegramPaymentAccess({
          patch: {
            telegram_access_revoked_at: now,
            telegram_access_status: "revoked",
            updated_at: now,
          },
          paymentRecord,
        });
      }
    }

    return {
      failedGroups,
      processedGroups,
      revokedBindings,
      revokedGroups,
    };
  };
