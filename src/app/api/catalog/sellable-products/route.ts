import { getSellableProductsWithDatabaseCommercialData } from "@/db/sellable-products";
import { jsonErrorNoStore, jsonNoStore } from "@/lib/http-security";

export const runtime = "nodejs";

export async function GET() {
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
