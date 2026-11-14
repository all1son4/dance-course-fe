import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { previewHubExpiry } from "@/lib/telegram/hub-expiry-preview";

import { getDatabaseEnvSelection, getRequiredDatabaseUrlFromEnv } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";
import * as schema from "./schema";

/**
 * Usage: DATABASE_ENV=production tsx src/db/run-hub-expiry-preview.ts [--at <ISO date>]
 * Prints whom the nightly Hub expiry would remove at that moment (now by default).
 * Its writes are rolled back and Telegram is never called.
 */
const parseAt = (argv: string[]) => {
  if (argv.length === 0) return new Date();
  if (argv.length === 2 && argv[0] === "--at") {
    const at = new Date(argv[1] ?? "");
    if (Number.isFinite(at.getTime())) return at;
  }
  throw new Error("hub_expiry_preview_usage: [--at <ISO date>]");
};

async function main(): Promise<void> {
  const dbEnv = process.env.DATABASE_ENV;

  if (dbEnv !== "development" && dbEnv !== "production") {
    throw new Error("hub_expiry_preview_explicit_database_env_required");
  }

  const at = parseAt(process.argv.slice(2));

  loadDatabaseEnvConfig();
  const selection = getDatabaseEnvSelection("unpooled");
  const expectedScope = dbEnv === "development" ? "DEV" : "PROD";

  // The scoped variable proves which database is meant; a bare DATABASE_URL does not.
  if (
    selection.variableName === null ||
    !selection.variableName.split("_").includes(expectedScope)
  ) {
    throw new Error("hub_expiry_preview_scoped_connection_required");
  }

  const client = postgres(
    getRequiredDatabaseUrlFromEnv({ kind: "unpooled", purpose: "Hub expiry preview" }),
    { connect_timeout: 5, max: 1, prepare: false },
  );

  try {
    const preview = await previewHubExpiry(drizzle(client, { schema }), { at });
    process.stdout.write(
      `${JSON.stringify({ database: selection, preview }, null, 2)}\n`,
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  // Our own codes are safe to print; driver errors can carry URLs or credentials.
  const message = error instanceof Error ? error.message : "";
  console.error(
    /^hub_expiry_preview_/u.test(message)
      ? message
      : "hub_expiry_preview_failed; verify DATABASE_ENV, the scoped connection and the schema",
  );
  process.exitCode = 1;
});
