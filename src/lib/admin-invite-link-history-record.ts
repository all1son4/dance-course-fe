/**
 * Independent invite-link history projection shared by the PostgreSQL reader and the
 * admin history route. Independent of the archive source shape; all nine values retain
 * their string representation. Missing timestamps stay empty strings, never null, so
 * `tokenUsedAt` keeps distinguishing an active link from a used one.
 */
export type AdminInviteLinkHistoryRecord = {
  accessUrl: string;
  adminLabel: string;
  createdAt: string;
  lessonLanguage: string;
  offerLabel: string;
  productTitle: string;
  purchaseItem: string;
  tokenExpiresAt: string;
  tokenUsedAt: string;
};
