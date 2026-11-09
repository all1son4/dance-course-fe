import type { HubPeriodChainInput } from "@/lib/inspiration-hub/period-chain";
import { getStandaloneHubPeriodStart } from "@/lib/inspiration-hub/period-start";

import { buildPendingHubPeriodChainInput } from "./hub-period-chain-input";
import type { HubPeriodNodeSnapshot } from "./hub-period-nodes";
import {
  buildHubPeriodPredecessor,
  type HubPeriodPredecessorInput,
} from "./hub-period-predecessor";

export type HubPeriodChainSnapshotInput = {
  telegramUserId: string;
  nodes: readonly HubPeriodNodeSnapshot[];
  cohort: HubPeriodPredecessorInput["cohort"];
};

function orderHubPeriodNodes(
  nodes: readonly HubPeriodNodeSnapshot[],
): HubPeriodNodeSnapshot[] {
  const nodesByEntitlementId = new Map<string, HubPeriodNodeSnapshot>();
  const seenPurchaseIds = new Set<string>();

  if (nodes.length === 0) {
    throw new Error("hub_period_chain_invalid");
  }

  let root: HubPeriodNodeSnapshot | null = null;

  for (const node of nodes) {
    const entitlementId = node.entitlement.id;
    const purchaseId = node.purchase.id;

    if (nodesByEntitlementId.has(entitlementId) || seenPurchaseIds.has(purchaseId)) {
      throw new Error("hub_period_chain_invalid");
    }

    if (node.entitlement.startsAfterEntitlementId === null) {
      if (root !== null) {
        throw new Error("hub_period_chain_invalid");
      }

      root = node;
    }

    nodesByEntitlementId.set(entitlementId, node);
    seenPurchaseIds.add(purchaseId);
  }

  if (root === null) {
    throw new Error("hub_period_chain_invalid");
  }

  const nextByPredecessor = new Map<string, HubPeriodNodeSnapshot>();

  for (const node of nodes) {
    const predecessorId = node.entitlement.startsAfterEntitlementId;
    if (predecessorId === null) {
      continue;
    }

    if (
      predecessorId === node.entitlement.id ||
      !nodesByEntitlementId.has(predecessorId)
    ) {
      throw new Error("hub_period_chain_invalid");
    }

    if (nextByPredecessor.has(predecessorId)) {
      throw new Error("hub_period_chain_invalid");
    }

    nextByPredecessor.set(predecessorId, node);
  }

  const orderedNodes: HubPeriodNodeSnapshot[] = [];
  let currentNode: HubPeriodNodeSnapshot | undefined = root;

  while (currentNode) {
    orderedNodes.push(currentNode);
    currentNode = nextByPredecessor.get(currentNode.entitlement.id);
  }

  if (orderedNodes.length !== nodes.length) {
    throw new Error("hub_period_chain_invalid");
  }

  return orderedNodes;
}

/**
 * Validates the supplied history and adapts only its unresolved suffix.
 * The caller discovers, locks and revalidates the complete set before writing.
 */
export function buildHubPeriodChainInput(
  input: HubPeriodChainSnapshotInput,
): HubPeriodChainInput {
  const { telegramUserId, nodes, cohort } = input;
  const [root, ...remainingNodes] = orderHubPeriodNodes(nodes);
  let predecessor = buildHubPeriodPredecessor({ telegramUserId, node: root, cohort });
  const pendingNodes: HubPeriodNodeSnapshot[] = [];

  for (const node of remainingNodes) {
    const { entitlement } = node;
    if (entitlement.startsAt === null && entitlement.expiresAt === null) {
      pendingNodes.push(node);
      continue;
    }

    if (entitlement.startsAt === null || entitlement.expiresAt === null) {
      throw new Error("hub_period_chain_invalid");
    }

    if (pendingNodes.length > 0 || predecessor.expiresAt === null) {
      throw new Error("hub_period_chain_invalid");
    }

    const nextPredecessor = buildHubPeriodPredecessor({
      node,
      telegramUserId,
      cohort: null,
    });

    if (node.purchase.succeededAt === null) {
      throw new Error("hub_period_chain_invalid");
    }

    const expectedStart = getStandaloneHubPeriodStart({
      paidAt: node.purchase.succeededAt,
      currentAccessEndsAt: predecessor.expiresAt,
    });

    if (entitlement.startsAt.getTime() !== expectedStart.getTime()) {
      throw new Error("hub_period_chain_invalid");
    }

    predecessor = nextPredecessor;
  }

  return buildPendingHubPeriodChainInput({
    telegramUserId,
    predecessor,
    nodes: pendingNodes,
  });
}
