import { unstable_cache } from "next/cache";
import { cache } from "react";

import { getSellableProductsWithDatabaseCommercialData } from "@/db/sellable-products";

/** Cache tag for everything derived from the product catalogue; the admin sales switch expires it. */
export const CATALOG_CACHE_TAG = "catalog";
/** Safety net in case an invalidation is ever missed. */
const CATALOG_CACHE_REVALIDATE_SECONDS = 30;

type CatalogSalesState = {
  known: ReadonlySet<string>;
  open: ReadonlySet<string>;
};

type CatalogSalesReadResult = {
  available: boolean;
  state: CatalogSalesState;
};

export type ProductSaleState = "closed" | "open" | "unavailable";

type SerializableCatalogSalesState = {
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
    known: catalogProducts.map((product) => product.id),
    open: catalogProducts
      .filter((product) => product.salesEnabled)
      .map((product) => product.id),
  };
};

const toCatalogSalesState = (
  state: SerializableCatalogSalesState,
): CatalogSalesState => ({
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
  ["catalog-sales-state-v2"],
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
    console.error("Failed to read the sales state from the catalogue", { error });

    return {
      available: false,
      state: toCatalogSalesState({ known: [], open: [] }),
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

export const getProductSaleState = async (
  productId: string,
): Promise<ProductSaleState> => {
  const { available, state } = await loadStorefrontCatalogSalesState();

  if (!available) {
    return "unavailable";
  }

  return state.open.has(productId) ? "open" : "closed";
};

export const isProductSaleOpen = async (productId: string) =>
  (await getProductSaleState(productId)) === "open";

/**
 * Fulfilment backstop. A payment can still settle for a product whose sales were
 * closed a moment earlier - the buyer already paid, so access is granted as
 * usual and this only flags the purchase for review.
 *
 * Requiring the product to be *known* is what keeps this quiet when the read
 * fails: an unreadable catalogue must not raise a false alarm on an ordinary
 * purchase.
 */
export const hasClosedSalesAtFulfilment = async (productId: string) => {
  const { state } = await loadCatalogSalesState();
  const { known, open } = state;

  return known.has(productId) && !open.has(productId);
};
