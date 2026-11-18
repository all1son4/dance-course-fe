import {
  isOnlineGroupLibraryOfferId,
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
} from "@/constants/sellable-products";
import { isOnlineGroupAccessOfferId } from "@/lib/telegram/offer-access";

import type { MyAccessSnapshot } from "./cards";

/*
 * «Дальше»: the Online Group cycle on sale now, when the customer is not in it yet.
 * A member of an earlier cycle gets the renewal of her tariff (the campaign the
 * cycle's closure post links to); anyone else gets the group page. The renewal
 * checkout still checks her Telegram membership (HUB-D16): this card grants nothing.
 */

export const ONLINE_GROUP_PAGE_HREF = "/online/group";

export type MyAccessRenewalCampaign = {
  offerExternalId: string;
  productExternalId: string;
  slug: string;
};

/** The cycle on sale and the active renewal campaigns from her cycles into it. */
export type MyAccessNextCohort = {
  id: string;
  startsAt: Date;
  renewalCampaigns: MyAccessRenewalCampaign[];
};

export type MyAccessNextStep = {
  cohortId: string;
  startsAt: string;
  /** The cycle is on sale but has already begun. */
  started: boolean;
  kind: "renewal" | "join";
  href: string;
};

const renewalHref = (campaign: MyAccessRenewalCampaign) =>
  `/payment?${new URLSearchParams({
    offer: campaign.offerExternalId,
    product: campaign.productExternalId,
    renewal: campaign.slug,
  })}`;

export const buildMyAccessNextStep = (
  snapshot: MyAccessSnapshot,
  next: MyAccessNextCohort | null,
  now: Date,
): MyAccessNextStep | null => {
  if (!next) return null;

  const groupPurchases = snapshot.purchases.filter(
    (purchase) =>
      purchase.cohortId && isOnlineGroupAccessOfferId(purchase.offerExternalId),
  );
  if (groupPurchases.some((purchase) => purchase.cohortId === next.id)) return null;

  // Her latest earlier cycle decides the tariff she renews; the other one is the fallback.
  const latest = groupPurchases.at(-1);
  const preferred =
    latest && isOnlineGroupLibraryOfferId(latest.offerExternalId)
      ? [ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID, ONLINE_GROUP_RENEWAL_OFFER_ID]
      : [ONLINE_GROUP_RENEWAL_OFFER_ID, ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID];
  const campaign = latest
    ? preferred
        .map((offerId) =>
          next.renewalCampaigns.find(
            (candidate) => candidate.offerExternalId === offerId,
          ),
        )
        .find(Boolean)
    : undefined;

  return {
    cohortId: next.id,
    href: campaign ? renewalHref(campaign) : ONLINE_GROUP_PAGE_HREF,
    kind: campaign ? "renewal" : "join",
    started: next.startsAt <= now,
    startsAt: next.startsAt.toISOString(),
  };
};

/**
 * The cohorts whose chat a renewal checks (HUB-D16) and where this customer is a
 * member of record: joined, and the access not over (a member leaves with it).
 */
export const getMyAccessMemberCohortIds = (snapshot: MyAccessSnapshot, now: Date) => {
  const cohorts = new Map(snapshot.cohorts.map((cohort) => [cohort.id, cohort]));
  const joined = new Set(
    snapshot.rights
      .filter(
        (right) =>
          right.accessKey === "primary" &&
          right.status === "activated" &&
          right.revokedAt === null,
      )
      .map((right) => right.purchaseId),
  );

  return [
    ...new Set(
      snapshot.purchases.flatMap((purchase) => {
        const cohort = purchase.cohortId ? cohorts.get(purchase.cohortId) : undefined;
        const running = cohort && (!cohort.accessEndsAt || cohort.accessEndsAt > now);
        return cohort && running && joined.has(purchase.id) ? [cohort.id] : [];
      }),
    ),
  ];
};
