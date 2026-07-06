import { count } from "drizzle-orm";

import { getDatabase, getDatabaseClient } from "./client";
import { loadDatabaseEnvConfig } from "./load-env";
import {
  accessEntitlements,
  customers,
  emailCampaignLeads,
  invoices,
  monthlyReportRuns,
  offerPrices,
  productOffers,
  products,
  purchases,
  purchaseSideEffects,
  stripeEvents,
  telegramAccessTokens,
  telegramUserBindings,
} from "./schema";

loadDatabaseEnvConfig();

const TABLES = {
  accessEntitlements,
  customers,
  emailCampaignLeads,
  invoices,
  monthlyReportRuns,
  offerPrices,
  productOffers,
  products,
  purchaseSideEffects,
  purchases,
  stripeEvents,
  telegramAccessTokens,
  telegramUserBindings,
};

const main = async () => {
  const db = getDatabase();
  const rows: Array<readonly [string, number | "missing"]> = [];

  for (const [name, table] of Object.entries(TABLES)) {
    try {
      const [row] = await db.select({ count: count() }).from(table);

      rows.push([name, row?.count ?? 0] as const);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "cause" in error &&
        error.cause &&
        typeof error.cause === "object" &&
        "code" in error.cause &&
        error.cause.code === "42P01"
      ) {
        rows.push([name, "missing"] as const);
        continue;
      }

      throw error;
    }
  }

  console.warn(JSON.stringify(Object.fromEntries(rows), null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDatabaseClient().end();
  });
