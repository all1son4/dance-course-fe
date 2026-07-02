import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
import { getSellableProductsWithDatabaseCommercialData } from "@/db/sellable-products";
import { jsonNoStore } from "@/lib/http-security";

export const runtime = "nodejs";

export async function GET() {
  try {
    const products = await getSellableProductsWithDatabaseCommercialData();

    return jsonNoStore({
      products: products.length > 0 ? products : SELLABLE_PRODUCTS_LIST,
    });
  } catch (error) {
    console.warn(
      "Failed to load sellable product catalog from database, falling back to constants",
      { error },
    );

    return jsonNoStore({
      products: SELLABLE_PRODUCTS_LIST,
    });
  }
}
