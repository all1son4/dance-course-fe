import { eq, inArray } from "drizzle-orm";

import type {
  SellableProduct,
  SellableProductCode,
  SellableProductOffer,
  SellableProductOfferCode,
  SupportedCheckoutCurrency,
} from "@/constants/sellable-products";
import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";

import { getDatabase } from "./client";
import { offerPrices, productOffers, products } from "./schema";

type CheckoutSelectionFromDatabaseInput = {
  currency: SupportedCheckoutCurrency;
  offerId?: string;
  productId: string;
};

type CheckoutSelectionFromDatabase = {
  amountMinor: number;
  offer: SellableProductOffer;
  product: SellableProduct;
};

type SellableProductDatabaseRow = typeof products.$inferSelect;
type SellableProductOfferDatabaseRow = typeof productOffers.$inferSelect;
type SellableProductPriceDatabaseRow = typeof offerPrices.$inferSelect;

const toMajorUnits = (amountMinor: number) => amountMinor / 100;

const fallbackProductByExternalId = new Map(
  SELLABLE_PRODUCTS_LIST.map((product) => [product.id, product] as const),
);

const fallbackOfferByExternalId = new Map(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers.map((offer) => [offer.id, offer] as const),
  ),
);

const groupPricesByOfferId = (priceRows: SellableProductPriceDatabaseRow[]) => {
  const pricesByOfferId = new Map<
    string,
    Partial<Record<SupportedCheckoutCurrency, number>>
  >();

  for (const priceRow of priceRows) {
    if (!priceRow.isActive) {
      continue;
    }

    const prices = pricesByOfferId.get(priceRow.offerId) ?? {};
    prices[priceRow.currency] = toMajorUnits(priceRow.amountMinor);
    pricesByOfferId.set(priceRow.offerId, prices);
  }

  return pricesByOfferId;
};

const mapOfferFromDatabase = ({
  offer,
  prices,
}: {
  offer: SellableProductOfferDatabaseRow;
  prices: Partial<Record<SupportedCheckoutCurrency, number>>;
}): SellableProductOffer | null => {
  const fallbackOffer = fallbackOfferByExternalId.get(offer.externalOfferId);
  const plnPrice = prices.pln;
  const eurPrice = prices.eur;

  if (!plnPrice || !eurPrice || offer.telegramAccessDurationDays === null) {
    return null;
  }

  return {
    accessWorkflow: offer.accessWorkflow ?? fallbackOffer?.accessWorkflow,
    code: offer.code as SellableProductOfferCode,
    deliveryChannel: offer.deliveryChannel ?? fallbackOffer?.deliveryChannel,
    id: offer.externalOfferId,
    label: fallbackOffer?.label ?? offer.label,
    labelKey: fallbackOffer?.labelKey ?? offer.labelKey ?? "",
    prices: {
      eur: eurPrice,
      pln: plnPrice,
    },
    telegramAccessDurationDays: offer.telegramAccessDurationDays,
  };
};

const mapProductFromDatabase = ({
  offerRows,
  priceRows,
  productRow,
}: {
  offerRows: SellableProductOfferDatabaseRow[];
  priceRows: SellableProductPriceDatabaseRow[];
  productRow: SellableProductDatabaseRow;
}): SellableProduct | null => {
  if (!productRow.isActive) {
    return null;
  }

  const fallbackProduct = fallbackProductByExternalId.get(productRow.externalProductId);
  const pricesByOfferId = groupPricesByOfferId(priceRows);
  const offers = offerRows
    .filter((offer) => offer.productId === productRow.id && offer.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((offer) =>
      mapOfferFromDatabase({
        offer,
        prices: pricesByOfferId.get(offer.id) ?? {},
      }),
    )
    .filter((offer): offer is SellableProductOffer => Boolean(offer));

  if (offers.length === 0) {
    return null;
  }

  const defaultOfferId = offers.find(
    (offer) => offer.id === productRow.defaultOfferExternalId,
  )?.id;

  if (!defaultOfferId) {
    return null;
  }

  return {
    accessNote: fallbackProduct?.accessNote ?? productRow.accessNote ?? "",
    accessNoteKey: fallbackProduct?.accessNoteKey ?? productRow.accessNoteKey ?? "",
    code: (fallbackProduct?.code ?? productRow.code) as SellableProductCode,
    defaultOfferId,
    description: fallbackProduct?.description ?? productRow.description,
    descriptionKeys: fallbackProduct?.descriptionKeys ?? productRow.descriptionKeys,
    id: productRow.externalProductId,
    offers,
    salesEnabled: productRow.salesEnabled,
    slug: fallbackProduct?.slug ?? productRow.slug,
    title: fallbackProduct?.title ?? productRow.title,
    titleKey: fallbackProduct?.titleKey ?? productRow.titleKey ?? "",
    type: productRow.type,
  };
};

export const getSellableProductsWithDatabaseCommercialData = async () => {
  const db = getDatabase();
  const [productRows, offerRows, priceRows] = await Promise.all([
    db.select().from(products),
    db.select().from(productOffers),
    db.select().from(offerPrices),
  ]);
  const productOrder = new Map(
    SELLABLE_PRODUCTS_LIST.map((product, index) => [product.id, index] as const),
  );

  return productRows
    .map((productRow) =>
      mapProductFromDatabase({
        offerRows,
        priceRows,
        productRow,
      }),
    )
    .filter((product): product is SellableProduct => Boolean(product))
    .sort((left, right) => {
      const leftOrder = productOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = productOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;

      return leftOrder - rightOrder || left.id.localeCompare(right.id);
    });
};

export const getCheckoutSelectionFromDatabase = async ({
  currency,
  offerId,
  productId,
}: CheckoutSelectionFromDatabaseInput): Promise<CheckoutSelectionFromDatabase | null> => {
  const db = getDatabase();
  const [productRow] = await db
    .select()
    .from(products)
    .where(eq(products.externalProductId, productId.trim()))
    .limit(1);

  if (!productRow || !productRow.isActive) {
    return null;
  }

  const offerRows = await db
    .select()
    .from(productOffers)
    .where(eq(productOffers.productId, productRow.id));
  const activeOfferRows = offerRows
    .filter((offer) => offer.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (activeOfferRows.length === 0) {
    return null;
  }

  const priceRows = await db
    .select()
    .from(offerPrices)
    .where(
      inArray(
        offerPrices.offerId,
        activeOfferRows.map((offer) => offer.id),
      ),
    );
  const pricesByOfferId = groupPricesByOfferId(priceRows);

  const offers = activeOfferRows
    .map((offer) =>
      mapOfferFromDatabase({
        offer,
        prices: pricesByOfferId.get(offer.id) ?? {},
      }),
    )
    .filter((offer): offer is SellableProductOffer => Boolean(offer));

  if (offers.length === 0) {
    return null;
  }

  const defaultOffer = offers.find(
    (offer) => offer.id === productRow.defaultOfferExternalId,
  );

  if (!defaultOffer) {
    return null;
  }

  const requestedOfferId = offerId?.trim();
  const selectedOffer = requestedOfferId
    ? offers.find((offer) => offer.id === requestedOfferId)
    : defaultOffer;

  if (!selectedOffer) {
    return null;
  }
  const amountMajor = selectedOffer.prices[currency];

  if (!amountMajor) {
    return null;
  }

  return {
    amountMinor: Math.round(amountMajor * 100),
    offer: selectedOffer,
    product: {
      accessNote:
        fallbackProductByExternalId.get(productRow.externalProductId)?.accessNote ??
        productRow.accessNote ??
        "",
      accessNoteKey:
        fallbackProductByExternalId.get(productRow.externalProductId)?.accessNoteKey ??
        productRow.accessNoteKey ??
        "",
      code: (fallbackProductByExternalId.get(productRow.externalProductId)?.code ??
        productRow.code) as SellableProductCode,
      defaultOfferId: defaultOffer.id,
      description: productRow.description,
      descriptionKeys: productRow.descriptionKeys,
      id: productRow.externalProductId,
      offers,
      salesEnabled: productRow.salesEnabled,
      slug: productRow.slug,
      title: productRow.title,
      titleKey: productRow.titleKey ?? "",
      type: productRow.type,
    },
  };
};

export const setProductSalesEnabled = async ({
  productId,
  salesEnabled,
}: {
  productId: string;
  salesEnabled: boolean;
}) => {
  const db = getDatabase();
  const [updatedRow] = await db
    .update(products)
    .set({ salesEnabled, updatedAt: new Date() })
    .where(eq(products.externalProductId, productId.trim()))
    .returning({
      externalProductId: products.externalProductId,
      salesEnabled: products.salesEnabled,
      updatedAt: products.updatedAt,
    });

  return updatedRow ?? null;
};
