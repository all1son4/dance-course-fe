import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getRequiredDatabaseUrlFromEnv } from "./env";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;

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
      max: 5,
      prepare: false,
    });
  }

  return globalForDb.danceCoursePostgresClient;
};

export const getDatabase = () => drizzle(getDatabaseClient(), { schema });
