export type PurchaseTelegramIdentitySource =
  "purchase" | "entitlement" | "binding" | "used_token";

/** A recorded ID tied to a purchase; used_token requires evidence of prior use. */
export type PurchaseTelegramIdentityEvidence = Readonly<{
  purchaseId: string;
  source: PurchaseTelegramIdentitySource;
  sourceRecordId: string;
  telegramUserId: string | null;
}>;

export type PurchaseTelegramIdentitySummary = {
  purchaseId: string;
  status: "missing" | "consistent" | "conflict";
  telegramUserId: string | null;
  candidateUserIds: string[];
  evidence: PurchaseTelegramIdentityEvidence[];
};

/**
 * Describes agreement between recorded IDs, without proving current membership,
 * granting access, assigning an owner or authorizing a historical data update.
 */
export function summarizePurchaseTelegramIdentity(
  purchaseId: string,
  evidence: readonly PurchaseTelegramIdentityEvidence[],
): PurchaseTelegramIdentitySummary {
  const purchaseEvidence = evidence.filter((item) => purchaseId === item.purchaseId);
  const existingTelegramIds = new Set<string>();

  for (const entry of purchaseEvidence) {
    const telegramUserId = entry.telegramUserId?.trim();
    if (telegramUserId) existingTelegramIds.add(telegramUserId);
  }

  const candidateUserIds = [...existingTelegramIds].sort();

  const sortedPurchaseEvidence = purchaseEvidence.sort((left, right) => {
    if (left.source < right.source) return -1;
    if (left.source > right.source) return 1;
    if (left.sourceRecordId < right.sourceRecordId) return -1;
    if (left.sourceRecordId > right.sourceRecordId) return 1;

    return 0;
  });

  let status: PurchaseTelegramIdentitySummary["status"];

  if (candidateUserIds.length === 0) {
    status = "missing";
  } else if (candidateUserIds.length === 1) {
    status = "consistent";
  } else {
    status = "conflict";
  }

  const telegramUserId = candidateUserIds.length === 1 ? candidateUserIds[0] : null;

  return {
    purchaseId,
    status,
    telegramUserId,
    candidateUserIds,
    evidence: sortedPurchaseEvidence,
  };
}
