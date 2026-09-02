import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getRequiredDatabaseUrlFromEnv } from "./env";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;

const RUNTIME_DATABASE_CONNECT_TIMEOUT_SECONDS = 5;

const globalForDb = globalThis as typeof globalThis & {
  danceCoursePostgresClient?: PostgresClient;
};

export const getDatabaseClient = () => {
  const databaseUrl = getRequiredDatabaseUrlFromEnv({
    kind: "pooled",
    purpose: "database runtime access",
  });

  if (!globalForDb.danceCoursePostgresClient) {
    globalForDb.danceCoursePostgresClient = postgres(databaseUrl, {
      // The driver default is 30 seconds. Runtime reads sit behind user-facing
      // pages, so fail quickly enough for the bounded read retry to recover on
      // another pooled connection without stalling a request for a full minute.
      connect_timeout: RUNTIME_DATABASE_CONNECT_TIMEOUT_SECONDS,
      max: 5,
      prepare: false,
    });
  }

  return globalForDb.danceCoursePostgresClient;
};

export const getDatabase = () => drizzle(getDatabaseClient(), { schema });
