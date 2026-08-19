import { getSellableProductsWithDatabaseCommercialData } from "@/db/sellable-products";

type CatalogSalesState = {
  known: ReadonlySet<string>;
  open: ReadonlySet<string>;
};

/**
 * One read of the authoritative catalogue, split into the two questions its
 * callers ask: which products exist at all, and which of them may be paid for.
 *
 * Read straight from the database on every call - the pages that use it are
 * dynamic on purpose, so flipping the admin switch takes effect immediately and
 * there is no cache entry that can go stale and keep offering a checkout.
 *
 * A failed read yields two empty sets, which is exactly what each gate below
 * needs it to mean.
 */
const loadCatalogSalesState = async (): Promise<CatalogSalesState> => {
  try {
    const catalogProducts = await getSellableProductsWithDatabaseCommercialData();

    return {
      known: new Set(catalogProducts.map((product) => product.id)),
      open: new Set(
        catalogProducts
          .filter((product) => product.salesEnabled)
          .map((product) => product.id),
      ),
    };
  } catch (error) {
    console.error("Failed to read the sales state from the catalogue", { error });

    return { known: new Set(), open: new Set() };
  }
};

/**
 * Storefront gate for buy buttons. Fails closed: when the catalogue cannot be
 * read the checkout route would refuse the payment anyway, so offering the
 * button would only lead to an error.
 */
export const getOpenSaleProductIds = async () => (await loadCatalogSalesState()).open;

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
