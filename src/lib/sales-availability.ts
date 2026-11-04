import { unstable_cache } from "next/cache";
import { cache } from "react";

import { SELLABLE_PRODUCTS, type SellableProduct } from "@/constants/sellable-products";
import { getActiveOnlineGroupCampaign } from "@/db/online-group-campaigns";
import { getSellableProductsWithDatabaseCommercialData } from "@/db/sellable-products";
import { getOpenPublicProductOffers } from "@/lib/public-sales";
import { logSafeError } from "@/lib/safe-error-log";

/** Cache tag for everything derived from the product catalogue; the admin sales switch expires it. */
export const CATALOG_CACHE_TAG = "catalog";
/** Safety net in case an invalidation is ever missed. */
const CATALOG_CACHE_REVALIDATE_SECONDS = 30;

type CatalogSalesState = {
  products: SellableProduct[];
  known: ReadonlySet<string>;
  open: ReadonlySet<string>;
};

type CatalogSalesReadResult = {
  available: boolean;
  state: CatalogSalesState;
};

export type ProductSaleState = "closed" | "open" | "unavailable";

type SerializableCatalogSalesState = {
  products: SellableProduct[];
  known: string[];
  open: string[];
};

/**
 * One read of the authoritative catalogue, split into the two questions its
 * callers ask: which products exist at all, and which of them may be paid for.
 *
 * Errors deliberately escape this function. It is wrapped in Next's persistent
 * cache below, and turning a transient database failure into an empty result
 * here would poison that shared cache with a false "sales closed" answer.
 */
const readCatalogSalesState = async (): Promise<SerializableCatalogSalesState> => {
  const catalogProducts = await getSellableProductsWithDatabaseCommercialData();

  return {
    products: catalogProducts,
    known: catalogProducts.map((product) => product.id),
    open: catalogProducts
      .filter((product) => getOpenPublicProductOffers(product).length > 0)
      .map((product) => product.id),
  };
};

const toCatalogSalesState = (
  state: SerializableCatalogSalesState,
): CatalogSalesState => ({
  products: state.products,
  known: new Set(state.known),
  open: new Set(state.open),
});

/**
 * Storefront copy of the read, shared by every visitor instead of costing a
 * database round trip per page view. The admin sales switch expires the tag
 * the moment it is flipped (see admin/api/sales), so the 30s window only ever
 * matters if that invalidation is somehow missed. Fulfilment does not use it.
 */
const readCatalogSalesStateCached = unstable_cache(
  readCatalogSalesState,
  // Versioned so deployment cannot reuse an empty value written by the old
  // implementation when a database connection timed out.
  ["catalog-sales-state-v3"],
  { revalidate: CATALOG_CACHE_REVALIDATE_SECONDS, tags: [CATALOG_CACHE_TAG] },
);

const readCatalogSalesStateFailClosed = async (
  read: () => Promise<SerializableCatalogSalesState>,
): Promise<CatalogSalesReadResult> => {
  try {
    return {
      available: true,
      state: toCatalogSalesState(await read()),
    };
  } catch (error) {
    logSafeError("Failed to read the sales state from the catalogue", error);

    return {
      available: false,
      state: toCatalogSalesState({ products: [], known: [], open: [] }),
    };
  }
};

/**
 * React memoization deduplicates the repeated gates in one render without
 * carrying a failed result into later requests. Only successful database reads
 * reach Next's persistent cache above.
 */
const loadStorefrontCatalogSalesState = cache(() =>
  readCatalogSalesStateFailClosed(readCatalogSalesStateCached),
);

const loadCatalogSalesState = async (): Promise<CatalogSalesReadResult> =>
  readCatalogSalesStateFailClosed(readCatalogSalesState);

/**
 * Storefront gate for buy buttons. Fails closed: when the catalogue cannot be
 * read the checkout route would refuse the payment anyway, so offering the
 * button would only lead to an error.
 */
export const getOpenSaleProductIds = async () =>
  (await loadStorefrontCatalogSalesState()).state.open;

export const getProductsSaleState = async (
  productIds: readonly string[],
): Promise<ProductSaleState> => {
  const { available, state } = await loadStorefrontCatalogSalesState();

  if (!available) {
    return "unavailable";
  }

  return productIds.some((productId) => state.open.has(productId)) ? "open" : "closed";
};

export const hasClosedSalesAtFulfilment = async (productId: string, offerId?: string) => {
  const { state } = await loadCatalogSalesState();
  // Renewal fulfilment is independent of which plans appear in the storefront.
  const product = state.products.find((candidate) => candidate.id === productId);
  if (product?.salesEnabled === false) return true;
  const offer = product?.offers.find((candidate) => candidate.id === offerId);
  return offer?.salesEnabled === false;
};

/** Shares the same cached commercial rows as the product sales gates. */
export const getStorefrontSellableProducts = async () =>
  (await loadStorefrontCatalogSalesState()).state.products;

export const getProductSaleState = async (
  productId: string,
): Promise<ProductSaleState> => {
  const state = await getProductsSaleState([productId]);
  if (state !== "open" || productId !== SELLABLE_PRODUCTS["online-group-anna-strok"].id)
    return state;
  try {
    return (await getActiveOnlineGroupCampaign()) ? "open" : "closed";
  } catch (error) {
    logSafeError("Failed to read Online Group availability", error);
    return "unavailable";
  }
};
