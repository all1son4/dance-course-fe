import {
  INSPIRATION_HUB_PRODUCT_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";

import type { MyAccessCard, MyAccessSnapshot } from "./cards";

const ONLINE_GROUP_PRODUCT_ID = SELLABLE_PRODUCTS["online-group-anna-strok"].id;

/*
 * «Твой путь»: the products a customer has bought, in the order she first bought
 * them, each with the day of its purchase — the latest one for the group and the
 * Hub, which are bought again cycle after cycle — and, for the group, how many of
 * its cycles are behind (read from purchase data, see `cycles`).
 */

/** Bought again and again: the path shows the latest purchase. */
const REPEATED_PRODUCTS = new Set([
  INSPIRATION_HUB_PRODUCT_ID,
  SELLABLE_PRODUCTS["online-group-anna-strok"].id,
]);

export type MyAccessJourneyStep = {
  productExternalId: string;
  /** The first purchase (ISO): the order of the path. */
  since: string;
  /** The day shown: the purchase, or the latest one of a repeated product (ISO). */
  purchasedAt: string;
  /** An access of it runs right now: the path marks it live. */
  live: boolean;
  /** The Online Group: how many of the cycles bought have already ended. */
  completedCohorts?: number;
};

const productOf = (card: MyAccessCard) =>
  card.title === "hub" ? INSPIRATION_HUB_PRODUCT_ID : card.title.productExternalId;

/** The cards whose access has not begun: a start ahead, or a channel not entered yet. */
const NOT_BEGUN = new Set([
  "group.startsOn",
  "hub.scheduled",
  "hub.afterCohort",
  "channel.startsOnJoin",
  "channel.paid",
]);

/** Where a card stands in time; an ended Hub is behind, not ahead. */
export const phaseOf = (card: MyAccessCard): "done" | "now" | "next" =>
  card.status.key === "hub.ended"
    ? "done"
    : NOT_BEGUN.has(card.status.key)
      ? "next"
      : "now";

export const buildMyAccessJourney = (
  snapshot: MyAccessSnapshot,
  cards: readonly MyAccessCard[],
): MyAccessJourneyStep[] => {
  const steps = new Map<string, MyAccessJourneyStep>();
  const live = new Set(
    cards.filter((card) => phaseOf(card) === "now").map((card) => productOf(card)),
  );

  for (const purchase of snapshot.purchases) {
    if (!purchase.productExternalId || !purchase.succeededAt) continue;
    const at = purchase.succeededAt.toISOString();
    const step = steps.get(purchase.productExternalId);

    if (!step) {
      steps.set(purchase.productExternalId, {
        live: live.has(purchase.productExternalId),
        productExternalId: purchase.productExternalId,
        purchasedAt: at,
        since: at,
      });
    } else if (
      REPEATED_PRODUCTS.has(purchase.productExternalId) &&
      at > step.purchasedAt
    ) {
      step.purchasedAt = at;
    }
  }

  // The group's step counts the cycles behind it (`lib/my-access/cycles`).
  const groupStep = steps.get(ONLINE_GROUP_PRODUCT_ID);
  const completed = snapshot.completedCohortIds?.length ?? 0;
  if (groupStep && completed > 0) groupStep.completedCohorts = completed;

  // One product is not a path yet, unless it is the group with cycles behind:
  // the count is the only place they are shown.
  return steps.size >= 2 || groupStep?.completedCohorts
    ? [...steps.values()].sort((a, b) => Date.parse(a.since) - Date.parse(b.since))
    : [];
};
