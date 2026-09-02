import { getSellableProductsWithDatabaseCommercialData } from "@/db/sellable-products";
import { jsonErrorNoStore, jsonNoStore } from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * The checkout no longer fetches this - it receives the catalogue with its
 * server render. The route stays because the deployment smoke tests read it as
 * the authoritative sales state of the environment under test, and it doubles
 * as an external database health probe. Nothing in the app depends on it, so
 * the rate limit only has to keep it from being a free database-load lever.
 */
export async function GET(request: Request) {
  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "catalog-read",
    limit: 30,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonErrorNoStore("rate_limited", {
      headers: {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
      status: 429,
    });
  }

  try {
    const products = await getSellableProductsWithDatabaseCommercialData();

    if (products.length === 0) {
      console.error("Authoritative sellable product catalog is empty");

      return jsonErrorNoStore("catalog_unavailable", { status: 503 });
    }

    return jsonNoStore({
      products,
    });
  } catch (error) {
    console.error("Failed to load authoritative sellable product catalog", { error });

    return jsonErrorNoStore("catalog_unavailable", { status: 503 });
  }
}
