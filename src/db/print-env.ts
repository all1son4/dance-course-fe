import { getDatabaseEnvSelection } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";

loadDatabaseEnvConfig();

console.warn(
  JSON.stringify(
    {
      nodeEnv: process.env.NODE_ENV ?? null,
      pooled: getDatabaseEnvSelection("pooled"),
      unpooled: getDatabaseEnvSelection("unpooled"),
      vercelEnv: process.env.VERCEL_ENV ?? null,
    },
    null,
    2,
  ),
);
