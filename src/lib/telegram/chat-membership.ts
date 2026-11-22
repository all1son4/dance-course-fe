import { logSafeError } from "@/lib/safe-error-log";

import { getTelegramChatMember, type TelegramChatMember } from "./bot-api";

/** Whether getChatMember describes someone currently in the chat. */
export const isActiveTelegramMember = (member: TelegramChatMember | undefined) => {
  const status = member?.status?.trim() ?? "";

  if (status === "member" || status === "administrator" || status === "creator") {
    return true;
  }

  if (status === "restricted") {
    return member?.is_member === true;
  }

  return false;
};

/**
 * Whether an account sits in a chat now, by Telegram itself. A failed call is not an
 * absence: it is logged under the caller's own event name and reported as checkFailed.
 */
export const checkChatMembership = async ({
  chatId,
  failureEvent,
  userId,
}: {
  chatId: string;
  failureEvent: string;
  userId: string;
}) => {
  try {
    const member = await getTelegramChatMember({ chatId, userId });
    return { checkFailed: false, isMember: isActiveTelegramMember(member) };
  } catch (error) {
    logSafeError(failureEvent, error);
    return { checkFailed: true, isMember: false };
  }
};
