import { getDatabase } from "@/db/client";
import { isPreviousChatRemovalEnabled } from "@/db/previous-chat-removal";
import type { ClaimedOutboxJob } from "@/db/transactional-outbox";
import { getTelegramChatMember } from "@/lib/telegram/bot-api";
import { kickUnexpectedMember } from "@/lib/telegram/online-group-access";

const nonRetryable = (message: string) =>
  Object.assign(new Error(message), { retryable: false });

/**
 * HUB-D44, plan section 6.5: removes the buyer from the previous cohort's chat with
 * a short ban, so the person could come back by a valid invite later. The creator,
 * administrators and anyone already gone are left alone; a failed role check is
 * retried, never guessed (section 6.6).
 */
export const deliverPreviousChatRemoval = async (job: ClaimedOutboxJob) => {
  const cohortId = typeof job.payload.cohortId === "string" ? job.payload.cohortId : "";
  const previousChatId =
    typeof job.payload.previousChatId === "string" ? job.payload.previousChatId : "";
  const telegramUserId =
    typeof job.payload.telegramUserId === "string" ? job.payload.telegramUserId : "";

  if (!cohortId || !previousChatId || !telegramUserId) {
    throw nonRetryable("previous_chat_removal_payload_invalid");
  }

  if (!(await isPreviousChatRemovalEnabled(getDatabase(), cohortId))) {
    return { skipped: true };
  }

  const member = await getTelegramChatMember({
    chatId: previousChatId,
    userId: telegramUserId,
  });
  const status = member?.status?.trim() ?? "";

  if (status !== "member" && status !== "restricted") {
    return { skipped: true };
  }

  await kickUnexpectedMember(previousChatId, telegramUserId);

  return { externalMessageId: null };
};
