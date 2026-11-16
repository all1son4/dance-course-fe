import type { TelegramChatMember } from "./bot-api";

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
