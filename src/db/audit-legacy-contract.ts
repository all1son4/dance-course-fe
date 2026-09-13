import postgres from "postgres";

import { getDatabaseEnvSelection, getRequiredDatabaseUrlFromEnv } from "./env";
import { readLegacyContractPreflight } from "./legacy-contract-preflight";
import { loadDatabaseEnvConfig } from "./load-env";

const main = async () => {
  // Require an explicit target before loading files; never infer production from
  // NODE_ENV or VERCEL_ENV for a contract preflight.
  if (!["development", "production"].includes(process.env.DATABASE_ENV ?? "")) {
    throw new Error("legacy_contract_explicit_database_env_required");
  }

  loadDatabaseEnvConfig();
  const client = postgres(
    getRequiredDatabaseUrlFromEnv({ purpose: "read-only legacy contract preflight" }),
    { connect_timeout: 5, max: 1, prepare: false },
  );

  try {
    const result = await readLegacyContractPreflight(client);
    console.warn(
      JSON.stringify({ database: getDatabaseEnvSelection(), ...result }, null, 2),
    );
    process.exitCode = result.dataChecksPassed ? 0 : 2;
  } finally {
    await client.end({ timeout: 5 });
  }
};

void main().catch(() => {
  // Driver errors may include connection details or query values. Keep CLI
  // failures redacted; an error is never converted into an empty inventory.
  console.error(
    "legacy_contract_preflight_failed; verify explicit DATABASE_ENV, connection and pre-contract schema",
  );
  process.exitCode = 1;
});
