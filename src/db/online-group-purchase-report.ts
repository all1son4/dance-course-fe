import type {
  OnlineGroupBindingSnapshotRow,
  OnlineGroupEntitlementSnapshotRow,
  OnlineGroupPurchaseSnapshotRow,
  OnlineGroupTokenSnapshotRow,
} from "./online-group-purchase-snapshot";
import {
  buildPurchaseTelegramIdentityEvidence,
  type PurchaseTelegramTokenIssue,
} from "./purchase-telegram-identity-evidence";
import {
  type PurchaseTelegramIdentitySummary,
  summarizePurchaseTelegramIdentity,
} from "./purchase-telegram-identity-summary";

export type OnlineGroupPurchaseReportInput = {
  readonly purchases: readonly OnlineGroupPurchaseSnapshotRow[];
  readonly entitlements: readonly OnlineGroupEntitlementSnapshotRow[];
  readonly bindings: readonly OnlineGroupBindingSnapshotRow[];
  readonly tokens: readonly OnlineGroupTokenSnapshotRow[];
};

export type OnlineGroupPurchaseReportEntry = {
  purchase: OnlineGroupPurchaseSnapshotRow;
  entitlements: OnlineGroupEntitlementSnapshotRow[];
  bindings: OnlineGroupBindingSnapshotRow[];
  tokens: OnlineGroupTokenSnapshotRow[];
  identity: PurchaseTelegramIdentitySummary;
  tokenIssues: PurchaseTelegramTokenIssue[];
};

export type OnlineGroupPurchaseReport = {
  purchases: OnlineGroupPurchaseReportEntry[];
  recordsWithoutPurchase: {
    entitlements: OnlineGroupEntitlementSnapshotRow[];
    bindings: OnlineGroupBindingSnapshotRow[];
    tokens: OnlineGroupTokenSnapshotRow[];
    tokenIssues: PurchaseTelegramTokenIssue[];
  };
};

function groupByPurchaseId<Row extends { readonly purchaseId: string }>(
  rows: readonly Row[],
): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    const existingGroup = groups.get(row.purchaseId);

    if (existingGroup) {
      existingGroup.push(row);
    } else {
      groups.set(row.purchaseId, [row]);
    }
  }

  return groups;
}

const compareById = (
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number => {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
};

const compareByPurchaseIdThenId = (
  left: Readonly<{ purchaseId: string; id: string }>,
  right: Readonly<{ purchaseId: string; id: string }>,
): number => {
  if (left.purchaseId < right.purchaseId) return -1;
  if (left.purchaseId > right.purchaseId) return 1;
  return compareById(left, right);
};

/**
 * Joins recorded purchase facts for review, retaining unknown parent references.
 * It does not choose cohorts, verify membership or authorize historical updates.
 */
export function buildOnlineGroupPurchaseReport(
  snapshot: OnlineGroupPurchaseReportInput,
): OnlineGroupPurchaseReport {
  const { evidence, tokenIssues } = buildPurchaseTelegramIdentityEvidence(snapshot);
  const entitlementsByPurchaseId = groupByPurchaseId(snapshot.entitlements);
  const bindingsByPurchaseId = groupByPurchaseId(snapshot.bindings);
  const tokensByPurchaseId = groupByPurchaseId(snapshot.tokens);
  const evidenceByPurchaseId = groupByPurchaseId(evidence);
  const tokenIssuesByPurchaseId = groupByPurchaseId(tokenIssues);
  const purchaseIds = new Set<string>(snapshot.purchases.map((purchase) => purchase.id));

  const sortedPurchases = [...snapshot.purchases].sort((left, right) => {
    if (left.firstSeenAt.getTime() < right.firstSeenAt.getTime()) return -1;
    if (left.firstSeenAt.getTime() > right.firstSeenAt.getTime()) return 1;
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;

    return 0;
  });

  const purchaseEntries: OnlineGroupPurchaseReportEntry[] = [];

  for (const purchase of sortedPurchases) {
    const entitlements = entitlementsByPurchaseId.get(purchase.id) ?? [];
    const bindings = bindingsByPurchaseId.get(purchase.id) ?? [];
    const tokens = tokensByPurchaseId.get(purchase.id) ?? [];
    const purchaseEvidence = evidenceByPurchaseId.get(purchase.id) ?? [];
    const purchaseTokenIssues = tokenIssuesByPurchaseId.get(purchase.id) ?? [];

    const identity = summarizePurchaseTelegramIdentity(purchase.id, purchaseEvidence);

    purchaseEntries.push({
      purchase,
      entitlements: entitlements.sort(compareById),
      bindings: bindings.sort(compareById),
      tokens: tokens.sort(compareById),
      identity,
      tokenIssues: purchaseTokenIssues,
    });
  }

  const recordsWithoutPurchase = {
    entitlements: snapshot.entitlements
      .filter((item) => !purchaseIds.has(item.purchaseId))
      .sort(compareByPurchaseIdThenId),
    bindings: snapshot.bindings
      .filter((item) => !purchaseIds.has(item.purchaseId))
      .sort(compareByPurchaseIdThenId),
    tokens: snapshot.tokens
      .filter((item) => !purchaseIds.has(item.purchaseId))
      .sort(compareByPurchaseIdThenId),
    tokenIssues: tokenIssues.filter((item) => !purchaseIds.has(item.purchaseId)),
  };

  return {
    purchases: purchaseEntries,
    recordsWithoutPurchase,
  };
}
