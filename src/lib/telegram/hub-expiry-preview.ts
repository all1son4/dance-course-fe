import { and, desc, eq } from "drizzle-orm";

import { telegramUserBindings } from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";

import {
  type HubExpiryProblems,
  revokeExpiredOnlineGroupHubAccess,
} from "./online-group-hub-expiry";

export type HubExpiryRemoval = {
  chatId: string;
  telegramUserId: string;
  telegramUsername: string | null;
};

export type HubExpiryPreview = {
  at: string;
  removals: HubExpiryRemoval[];
  problems: HubExpiryProblems | null;
  processedGroups: number;
  stalledGroups: number;
};

const ROLLBACK = new Error("hub_expiry_preview_rollback");

/**
 * What the nightly Hub expiry would do at `at`, decided by the cron's own code: it
 * runs inside a transaction that is rolled back, records each removal instead of
 * calling Telegram, and returns its problems instead of posting them to the alerts
 * channel. Nothing is kept and nobody is touched.
 */
export async function previewHubExpiry(
  database: Pick<DatabaseTransaction, "transaction">,
  { at }: { at: Date },
): Promise<HubExpiryPreview> {
  let preview: HubExpiryPreview | null = null;

  try {
    await database.transaction(async (tx) => {
      const removals: HubExpiryRemoval[] = [];
      let problems: HubExpiryProblems | null = null;
      const result = await revokeExpiredOnlineGroupHubAccess({
        database: tx,
        now: at,
        removeMember: async (chatId, telegramUserId) => {
          removals.push({ chatId, telegramUserId, telegramUsername: null });
        },
        reportProblems: async (found) => {
          problems = found;
        },
      });

      // The @username helps the owner recognise a person; the ID is what counts.
      for (const removal of removals) {
        const [binding] = await tx
          .select({ telegramUsername: telegramUserBindings.telegramUsername })
          .from(telegramUserBindings)
          .where(
            and(
              eq(telegramUserBindings.chatId, removal.chatId),
              eq(telegramUserBindings.telegramUserId, removal.telegramUserId),
            ),
          )
          .orderBy(desc(telegramUserBindings.updatedAt))
          .limit(1);
        removal.telegramUsername = binding?.telegramUsername || null;
      }

      preview = {
        at: at.toISOString(),
        removals,
        problems,
        processedGroups: result.processedGroups,
        stalledGroups: result.stalledGroups,
      };
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }

  if (!preview) throw new Error("hub_expiry_preview_no_result");
  return preview;
}
