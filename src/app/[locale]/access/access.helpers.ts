import {
  CHOREO_CATALOGUE_PRODUCT_CODES,
  getSellableProductById,
  getSellableProductOfferById,
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  INSPIRATION_HUB_PRODUCT_ID,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  isOfferSaleOpen,
  SELLABLE_PRODUCTS,
  type SellableProductCode,
} from "@/constants/sellable-products";
import { getDatabase } from "@/db/client";
import { readMyAccessNextCohort } from "@/db/my-access";
import { shouldNameOfferAtCheckout } from "@/lib/choreo-offer-presentation";
import {
  lastAccessDay,
  type MyAccessCalendarEvent,
  NEXT_CYCLE_EVENT,
} from "@/lib/my-access/calendar";
import {
  buildMyAccessCards,
  type MyAccessCard,
  type MyAccessSnapshot,
} from "@/lib/my-access/cards";
import {
  buildMyAccessNextStep,
  getMyAccessMemberCohortIds,
  type MyAccessNextStep,
} from "@/lib/my-access/next-step";
import { getOnlineGroupSale } from "@/lib/online-group-sale";
import { logSafeError } from "@/lib/safe-error-log";
import {
  getProductsSaleState,
  getStorefrontSellableProducts,
} from "@/lib/sales-availability";

import { getCompactSummaryTitle } from "../payment/payment.helpers";

/* Shared by the page and its calendar files, so both name things the same way. */

type Translate = (key: string) => string;

/** The product as the checkout names it, or null for a product not in the catalogue. */
export const getAccessProductTitle = (productId: string, productT: Translate) => {
  const product = getSellableProductById(productId);
  if (!product) return null;

  return product.checkoutTitleKey
    ? productT(product.checkoutTitleKey)
    : getCompactSummaryTitle(productT(product.titleKey));
};

/** The public page of a product, to share; none for a product without one. */
const PRODUCT_PAGE_PATHS: Partial<Record<SellableProductCode, string>> = {
  "first-touch": "/online/first-touch",
  "inspiration-hub": "/online/inspiration-hub",
  "online-group-anna-strok": "/online/group",
  ...Object.fromEntries(
    CHOREO_CATALOGUE_PRODUCT_CODES.map((code) => [code, "/online/choreo"]),
  ),
};

export const getAccessProductPagePath = (productId: string) => {
  const product = getSellableProductById(productId);
  return product ? (PRODUCT_PAGE_PATHS[product.code] ?? null) : null;
};

export const getAccessCardTitle = (
  card: MyAccessCard,
  t: Translate,
  productT: Translate,
) => {
  if (card.title === "hub") return t("cards.hubTitle");

  const product = getSellableProductById(card.title.productExternalId);
  // A cycle goes by its own name, «Online Group 3.0», not just the product.
  const title =
    card.title.cohortName ??
    getAccessProductTitle(card.title.productExternalId, productT);
  if (!product || !title) return t("cards.fallbackTitle");

  const offer = getSellableProductOfferById(product, card.title.offerExternalId);
  return offer && shouldNameOfferAtCheckout(product, offer.id)
    ? `${title} · ${productT(offer.labelKey)}`
    : title;
};

const ONLINE_GROUP_PRODUCT_ID = SELLABLE_PRODUCTS["online-group-anna-strok"].id;

/** The sale switches of the catalogue, as the checkout reads them. */
export async function readMyAccessSales() {
  const products = await getStorefrontSellableProducts();
  const isOpen = (productId: string, offerId: string) => {
    const product = products.find((candidate) => candidate.id === productId);
    const offer = product?.offers.find((candidate) => candidate.id === offerId);
    return Boolean(product && offer && isOfferSaleOpen(product, offer));
  };

  return {
    hubPurchase: isOpen(INSPIRATION_HUB_PRODUCT_ID, INSPIRATION_HUB_ACCESS_OFFER_ID),
    hubRenewal: isOpen(INSPIRATION_HUB_PRODUCT_ID, INSPIRATION_HUB_RENEWAL_OFFER_ID),
    isOpen,
    openProductIds: new Set(
      products.filter((product) => product.salesEnabled).map((product) => product.id),
    ),
  };
}

/**
 * «Дальше» only while the Online Group is on sale by the rule the payment applies
 * (product switch, campaign, cohort). «Продлить» only for a member of record of a
 * cycle the renewal campaign comes from, and only while its offer is on sale;
 * anyone else gets the group page. Any failure hides the block.
 */
export async function readMyAccessNextStep(
  snapshot: MyAccessSnapshot,
  now: Date,
  isOfferOpen?: (productId: string, offerId: string) => boolean,
) {
  try {
    const [productState, sale] = await Promise.all([
      getProductsSaleState([ONLINE_GROUP_PRODUCT_ID]),
      getOnlineGroupSale(),
    ]);
    if (productState !== "open" || !sale.open) return null;

    const next = await readMyAccessNextCohort(getDatabase(), {
      cohortIds: getMyAccessMemberCohortIds(snapshot, now),
      mainChatId: sale.campaign.regularChatId,
      now,
    });
    const openNext = next && {
      ...next,
      renewalCampaigns: isOfferOpen
        ? next.renewalCampaigns.filter((campaign) =>
            isOfferOpen(campaign.productExternalId, campaign.offerExternalId),
          )
        : next.renewalCampaigns,
    };

    return buildMyAccessNextStep(snapshot, openNext, now);
  } catch (error) {
    logSafeError("Failed to read the next Online Group cycle for «Мой доступ»", error);
    return null;
  }
}

type TranslateWith = (key: string, values?: Record<string, string>) => string;

/**
 * Every date the page offers for a calendar, keyed by the id its «В календарь»
 * link carries: the cards' own dates and the start of «Дальше».
 */
export const buildMyAccessCalendarEvents = ({
  next,
  now,
  productT,
  snapshot,
  t,
}: {
  next: MyAccessNextStep | null;
  now: Date;
  productT: Translate;
  snapshot: MyAccessSnapshot;
  t: TranslateWith;
}): { id: string; event: MyAccessCalendarEvent }[] => {
  const cardEvents = buildMyAccessCards(snapshot, now).flatMap((card) => {
    const date = card.calendar;
    if (!date) return [];

    const title = getAccessCardTitle(card, t, productT);
    const event: MyAccessCalendarEvent =
      date.kind === "end"
        ? {
            summary: t("calendar.lastDay", { title }),
            uid: `end-${card.id}@annastrok.com`,
            when: { allDay: true, day: lastAccessDay(new Date(date.at)) },
          }
        : {
            // A start is a day, never an hour: the page shows dates only.
            summary: t("calendar.start", { title }),
            uid: `start-${card.id}@annastrok.com`,
            when: { allDay: true, day: new Date(date.at) },
          };

    return [{ event, id: card.id }];
  });

  return next && !next.started
    ? [
        ...cardEvents,
        {
          event: {
            summary: t("calendar.nextStart"),
            uid: `start-${next.cohortId}@annastrok.com`,
            when: { allDay: true, day: new Date(next.startsAt) },
          },
          id: NEXT_CYCLE_EVENT,
        },
      ]
    : cardEvents;
};
