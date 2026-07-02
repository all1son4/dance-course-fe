import { loadEnvConfig } from "@next/env";

import { getDatabaseEnvSelection } from "./env";

loadEnvConfig(process.cwd());

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
