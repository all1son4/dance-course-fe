import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";

import { getDatabaseClient } from "./client";
import { getDatabaseEnvSelection } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";
import { getSellableProductsWithDatabaseCommercialData } from "./sellable-products";
import { getCommercialCatalogDrift } from "./sellable-products-verification";

loadDatabaseEnvConfig();

const main = async () => {
  const client = getDatabaseClient();

  try {
    const actualProducts = await getSellableProductsWithDatabaseCommercialData();
    const drift = getCommercialCatalogDrift({
      actualProducts,
      expectedProducts: SELLABLE_PRODUCTS_LIST,
    });
    const status = drift.length === 0 ? "ok" : "failed";

    console.warn(
      JSON.stringify(
        {
          database: getDatabaseEnvSelection("pooled"),
          drift,
          offerCount: SELLABLE_PRODUCTS_LIST.reduce(
            (count, product) => count + product.offers.length,
            0,
          ),
          status,
        },
        null,
        2,
      ),
    );

    if (status === "failed") {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
