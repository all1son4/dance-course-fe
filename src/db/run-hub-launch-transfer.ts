import { readFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseEnvSelection, getRequiredDatabaseUrlFromEnv } from "./env";
import { type HubLaunchTransferInput, runHubLaunchTransfer } from "./hub-launch-transfer";
import { loadDatabaseEnvConfig } from "./load-env";
import * as schema from "./schema";

/**
 * Usage: DATABASE_ENV=production tsx src/db/run-hub-launch-transfer.ts --input <file.json>
 * Prints what would change and keeps nothing. Add --write to keep the changes.
 */
const parseArgs = (argv: string[]) => {
  let inputPath = "";
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write" && !write) write = true;
    else if (arg === "--input" && !inputPath && argv[index + 1])
      inputPath = argv[++index];
    else throw new Error("hub_launch_transfer_usage: --input <file.json> [--write]");
  }
  if (!inputPath)
    throw new Error("hub_launch_transfer_usage: --input <file.json> [--write]");
  return { inputPath, write };
};

async function main(): Promise<void> {
  const dbEnv = process.env.DATABASE_ENV;

  if (dbEnv !== "development" && dbEnv !== "production") {
    throw new Error("hub_launch_transfer_explicit_database_env_required");
  }

  const { inputPath, write } = parseArgs(process.argv.slice(2));
  const input = JSON.parse(readFileSync(inputPath, "utf8")) as HubLaunchTransferInput;

  loadDatabaseEnvConfig();
  const selection = getDatabaseEnvSelection("unpooled");
  const expectedScope = dbEnv === "development" ? "DEV" : "PROD";

  // The scoped variable proves which database is meant; a bare DATABASE_URL does not.
  if (
    selection.variableName === null ||
    !selection.variableName.split("_").includes(expectedScope)
  ) {
    throw new Error("hub_launch_transfer_scoped_connection_required");
  }

  const client = postgres(
    getRequiredDatabaseUrlFromEnv({ kind: "unpooled", purpose: "Hub launch transfer" }),
    { connect_timeout: 5, max: 1, prepare: false },
  );

  try {
    const report = await runHubLaunchTransfer(drizzle(client, { schema }), {
      input,
      write,
    });
    process.stdout.write(`${JSON.stringify({ database: selection, report }, null, 2)}\n`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  // Our own codes are safe to print; driver errors can carry URLs or credentials.
  const message = error instanceof Error ? error.message : "";
  console.error(
    /^hub_launch_transfer_|^cohort_closure_/u.test(message)
      ? message
      : "hub_launch_transfer_failed; verify DATABASE_ENV, the scoped connection and the schema",
  );
  process.exitCode = 1;
});
