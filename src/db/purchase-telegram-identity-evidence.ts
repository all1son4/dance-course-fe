import type {
  OnlineGroupBindingSnapshotRow,
  OnlineGroupEntitlementSnapshotRow,
  OnlineGroupPurchaseSnapshotRow,
  OnlineGroupTokenSnapshotRow,
} from "./online-group-purchase-snapshot";
import type { PurchaseTelegramIdentityEvidence } from "./purchase-telegram-identity-summary";

export type PurchaseTelegramIdentityEvidenceInput = {
  readonly purchases: readonly Pick<
    OnlineGroupPurchaseSnapshotRow,
    "id" | "telegramUserId"
  >[];
  readonly entitlements: readonly Pick<
    OnlineGroupEntitlementSnapshotRow,
    "id" | "purchaseId" | "telegramUserId"
  >[];
  readonly bindings: readonly Pick<
    OnlineGroupBindingSnapshotRow,
    "id" | "purchaseId" | "telegramUserId"
  >[];
  readonly tokens: readonly Pick<
    OnlineGroupTokenSnapshotRow,
    "id" | "purchaseId" | "status" | "usedAt" | "telegramUserId"
  >[];
};

export type PurchaseTelegramTokenIssueCode =
  | "token_use_status_conflict"
  | "token_use_timestamp_missing"
  | "token_use_user_id_missing";

export type PurchaseTelegramTokenIssue = {
  purchaseId: string;
  tokenRecordId: string;
  code: PurchaseTelegramTokenIssueCode;
};

export type PurchaseTelegramIdentityEvidenceResult = {
  evidence: PurchaseTelegramIdentityEvidence[];
  tokenIssues: PurchaseTelegramTokenIssue[];
};

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function createTokenIssue(
  token: Pick<OnlineGroupTokenSnapshotRow, "id" | "purchaseId">,
  code: PurchaseTelegramTokenIssueCode,
): PurchaseTelegramTokenIssue {
  return {
    purchaseId: token.purchaseId,
    tokenRecordId: token.id,
    code,
  };
}

/**
 * Maps recorded identity facts for the summary and reports ambiguous token use.
 * It does not verify current membership, choose an owner or update stored data.
 */
export function buildPurchaseTelegramIdentityEvidence(
  input: PurchaseTelegramIdentityEvidenceInput,
): PurchaseTelegramIdentityEvidenceResult {
  const { purchases, entitlements, bindings, tokens } = input;
  const evidence: PurchaseTelegramIdentityEvidence[] = [];
  const tokenIssues: PurchaseTelegramTokenIssue[] = [];

  for (const purchase of purchases) {
    evidence.push({
      purchaseId: purchase.id,
      source: "purchase",
      sourceRecordId: purchase.id,
      telegramUserId: purchase.telegramUserId,
    });
  }

  for (const entitlement of entitlements) {
    evidence.push({
      purchaseId: entitlement.purchaseId,
      source: "entitlement",
      sourceRecordId: entitlement.id,
      telegramUserId: entitlement.telegramUserId,
    });
  }

  for (const binding of bindings) {
    evidence.push({
      purchaseId: binding.purchaseId,
      source: "binding",
      sourceRecordId: binding.id,
      telegramUserId: binding.telegramUserId,
    });
  }

  for (const token of tokens) {
    const hasUsedAt = token.usedAt !== null;
    const normalizedTelegramUserId = token.telegramUserId?.trim();
    const hasUseMarker = hasUsedAt || token.status === "used";

    if (token.status === "issued" && hasUsedAt) {
      tokenIssues.push(createTokenIssue(token, "token_use_status_conflict"));
    }
    if (token.status === "used" && !hasUsedAt) {
      tokenIssues.push(createTokenIssue(token, "token_use_timestamp_missing"));
    }
    if (hasUseMarker && !normalizedTelegramUserId) {
      tokenIssues.push(createTokenIssue(token, "token_use_user_id_missing"));
    }
    if (hasUsedAt && token.status !== "issued" && normalizedTelegramUserId) {
      evidence.push({
        purchaseId: token.purchaseId,
        source: "used_token",
        sourceRecordId: token.id,
        telegramUserId: token.telegramUserId,
      });
    }
  }

  evidence.sort(
    (left, right) =>
      compareStrings(left.purchaseId, right.purchaseId) ||
      compareStrings(left.source, right.source) ||
      compareStrings(left.sourceRecordId, right.sourceRecordId),
  );
  tokenIssues.sort(
    (left, right) =>
      compareStrings(left.purchaseId, right.purchaseId) ||
      compareStrings(left.tokenRecordId, right.tokenRecordId) ||
      compareStrings(left.code, right.code),
  );

  return {
    evidence,
    tokenIssues,
  };
}
