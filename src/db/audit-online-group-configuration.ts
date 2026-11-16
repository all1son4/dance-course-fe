import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseEnvSelection, getRequiredDatabaseUrlFromEnv } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";
import { buildOnlineGroupConfigurationReport } from "./online-group-configuration-report";
import { readOnlineGroupConfigurationSnapshot } from "./online-group-configuration-snapshot";
import { buildOnlineGroupPurchaseReport } from "./online-group-purchase-report";
import { readOnlineGroupReconciliationSnapshot } from "./online-group-reconciliation-snapshot";
import * as schema from "./schema";

/** No option reads configuration only; `--include-purchases` adds purchase facts. */
function parseIncludePurchases(args: readonly string[]): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === "--include-purchases") return true;

  // An unknown or repeated option must not silently pick a mode.
  throw new Error("online_group_configuration_audit_invalid_options");
}

type Database = ReturnType<typeof drizzle<typeof schema>>;

/** Both halves of the reconciliation report come from one read-only snapshot. */
async function buildAuditReport(db: Database, includePurchases: boolean) {
  if (!includePurchases) {
    return {
      scope: "configuration_inventory_only",
      report: buildOnlineGroupConfigurationReport(
        await readOnlineGroupConfigurationSnapshot(db),
      ),
    };
  }

  const snapshot = await readOnlineGroupReconciliationSnapshot(db);
  return {
    scope: "configuration_and_purchase_inventory_only",
    report: {
      configuration: buildOnlineGroupConfigurationReport(snapshot.configuration),
      purchases: buildOnlineGroupPurchaseReport(snapshot.purchases),
    },
  };
}

async function main(): Promise<void> {
  const includePurchases = parseIncludePurchases(process.argv.slice(2));
  const dbEnv = process.env.DATABASE_ENV;

  if (dbEnv !== "development" && dbEnv !== "production") {
    throw new Error("online_group_configuration_audit_explicit_database_env_required");
  }

  loadDatabaseEnvConfig();
  const selection = getDatabaseEnvSelection("unpooled");
  const expectedScope = dbEnv === "development" ? "DEV" : "PROD";

  if (
    selection.variableName === null ||
    !selection.variableName.split("_").includes(expectedScope)
  ) {
    throw new Error("online_group_configuration_audit_scoped_connection_required");
  }

  const url = getRequiredDatabaseUrlFromEnv({
    kind: "unpooled",
    purpose: "read-only Online Group configuration audit",
  });
  const client = postgres(url, {
    connect_timeout: 5,
    max: 1,
    prepare: false,
  });

  try {
    const { scope, report } = await buildAuditReport(
      drizzle(client, { schema }),
      includePurchases,
    );

    const reportJson = JSON.stringify(
      {
        database: selection,
        capturedAt: new Date().toISOString(),
        scope,
        report,
      },
      null,
      2,
    );
    process.stdout.write(`${reportJson}\n`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main().catch(() => {
  // Connection/driver errors can contain URLs, credentials or query details.
  console.error(
    "online_group_configuration_audit_failed; verify explicit DATABASE_ENV, scoped connection and schema",
  );
  process.exitCode = 1;
});
