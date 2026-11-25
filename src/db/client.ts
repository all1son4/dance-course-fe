import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { watchDatabaseConnections } from "./connection-watch";
import { getRequiredDatabaseUrlFromEnv } from "./env";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;

// The whole budget for opening a connection: TCP, TLS, auth and, on Neon, waking a
// compute that scaled to zero. A query waits in the driver's queue until then and is
// never sent before, so waiting is safe for reads, writes and transactions alike.
// 10 seconds is the value Neon's own connection examples use; a healthy wake takes
// well under a second. The CONNECT_TIMEOUTs of 2026-11-24/25 were not slow wakes but
// attempts frozen with a suspended instance (see connection-watch.ts), which no
// timeout value fixes.
const RUNTIME_DATABASE_CONNECT_TIMEOUT_SECONDS = 10;

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
      // The driver default is 30 seconds, too long for a visitor to look at a
      // blank page when the database is really down.
      connect_timeout: RUNTIME_DATABASE_CONNECT_TIMEOUT_SECONDS,
      max: 5,
      prepare: false,
    });
    watchDatabaseConnections(globalForDb.danceCoursePostgresClient);
  }

  return globalForDb.danceCoursePostgresClient;
};

const createDatabase = (client: PostgresClient) => drizzle(client, { schema });

let cachedDatabase: {
  client: PostgresClient;
  database: ReturnType<typeof createDatabase>;
} | null = null;

/** The Drizzle wrapper of the shared client, built once per client. */
export const getDatabase = () => {
  const client = getDatabaseClient();

  if (cachedDatabase?.client !== client) {
    cachedDatabase = { client, database: createDatabase(client) };
  }

  return cachedDatabase.database;
};
