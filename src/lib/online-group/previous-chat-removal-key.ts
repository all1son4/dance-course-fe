/** One removal job per purchase and previous chat (HUB-D44). */
export const previousChatRemovalKey = (purchaseId: string, previousChatId: string) =>
  `previous_chat_removal:${purchaseId}:${previousChatId}`;
