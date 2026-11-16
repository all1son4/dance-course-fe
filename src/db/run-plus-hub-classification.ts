import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseEnvSelection, getRequiredDatabaseUrlFromEnv } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";
import { classifyCohortPlusHubRights } from "./plus-hub-classification";
import * as schema from "./schema";

/**
 * Usage: DATABASE_ENV=production tsx src/db/run-plus-hub-classification.ts
 *   --main-chat <cohort main chat id> [--write]
 * Prints what would change and keeps nothing. Add --write to keep the changes.
 */
const parseArgs = (argv: string[]) => {
  let mainChatId = "";
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write" && !write) write = true;
    else if (arg === "--main-chat" && !mainChatId && argv[index + 1])
      mainChatId = argv[++index] ?? "";
    else throw new Error("plus_hub_classification_usage: --main-chat <id> [--write]");
  }
  if (!mainChatId.trim())
    throw new Error("plus_hub_classification_usage: --main-chat <id> [--write]");
  return { mainChatId, write };
};

async function main(): Promise<void> {
  const dbEnv = process.env.DATABASE_ENV;

  if (dbEnv !== "development" && dbEnv !== "production") {
    throw new Error("plus_hub_classification_explicit_database_env_required");
  }

  const { mainChatId, write } = parseArgs(process.argv.slice(2));

  loadDatabaseEnvConfig();
  const selection = getDatabaseEnvSelection("unpooled");
  const expectedScope = dbEnv === "development" ? "DEV" : "PROD";

  // The scoped variable proves which database is meant; a bare DATABASE_URL does not.
  if (
    selection.variableName === null ||
    !selection.variableName.split("_").includes(expectedScope)
  ) {
    throw new Error("plus_hub_classification_scoped_connection_required");
  }

  const client = postgres(
    getRequiredDatabaseUrlFromEnv({
      kind: "unpooled",
      purpose: "Plus Hub classification",
    }),
    { connect_timeout: 5, max: 1, prepare: false },
  );

  try {
    const report = await classifyCohortPlusHubRights(drizzle(client, { schema }), {
      mainChatId,
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
    /^plus_hub_classification_/u.test(message)
      ? message
      : "plus_hub_classification_failed; verify DATABASE_ENV, the scoped connection and the schema",
  );
  process.exitCode = 1;
});
