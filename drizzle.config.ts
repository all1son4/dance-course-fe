import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

import { getRequiredDatabaseUrlFromEnv } from "./src/db/env";

loadEnvConfig(process.cwd());

const databaseUrl = getRequiredDatabaseUrlFromEnv({
  kind: "unpooled",
  purpose: "Drizzle migrations",
});

export default defineConfig({
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  strict: true,
  verbose: true,
});
