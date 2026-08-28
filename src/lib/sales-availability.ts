import { unstable_cache } from "next/cache";

import { getSellableProductsWithDatabaseCommercialData } from "@/db/sellable-products";

/** Cache tag for everything derived from the product catalogue; the admin sales switch expires it. */
export const CATALOG_CACHE_TAG = "catalog";
/** Safety net in case an invalidation is ever missed. */
const CATALOG_CACHE_REVALIDATE_SECONDS = 30;

type CatalogSalesState = {
  known: ReadonlySet<string>;
  open: ReadonlySet<string>;
};

type SerializableCatalogSalesState = {
  known: string[];
  open: string[];
};

/**
 * One read of the authoritative catalogue, split into the two questions its
 * callers ask: which products exist at all, and which of them may be paid for.
 *
 * A failed read yields two empty sets, which is exactly what each gate below
 * needs it to mean.
 */
const readCatalogSalesState = async (): Promise<SerializableCatalogSalesState> => {
  try {
    const catalogProducts = await getSellableProductsWithDatabaseCommercialData();

    return {
      known: catalogProducts.map((product) => product.id),
      open: catalogProducts
        .filter((product) => product.salesEnabled)
        .map((product) => product.id),
    };
  } catch (error) {
    console.error("Failed to read the sales state from the catalogue", { error });

    return { known: [], open: [] };
  }
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
  ["catalog-sales-state"],
  { revalidate: CATALOG_CACHE_REVALIDATE_SECONDS, tags: [CATALOG_CACHE_TAG] },
);

const loadCatalogSalesState = async (): Promise<CatalogSalesState> =>
  toCatalogSalesState(await readCatalogSalesState());

/**
 * Storefront gate for buy buttons. Fails closed: when the catalogue cannot be
 * read the checkout route would refuse the payment anyway, so offering the
 * button would only lead to an error.
 */
export const getOpenSaleProductIds = async () =>
  toCatalogSalesState(await readCatalogSalesStateCached()).open;

export const isProductSaleOpen = async (productId: string) =>
  (await getOpenSaleProductIds()).has(productId);

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
  const { known, open } = await loadCatalogSalesState();

  return known.has(productId) && !open.has(productId);
};
