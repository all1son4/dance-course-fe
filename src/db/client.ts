import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getRequiredDatabaseUrlFromEnv } from "./env";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;

// The whole budget for opening a connection: TCP, TLS, auth and, on Neon, waking a
// compute that scaled to zero. A query waits in the driver's queue until then and is
// never sent before, so waiting is safe for reads, writes and transactions alike.
// 5 seconds was not always enough for a wake (CONNECT_TIMEOUT on 2026-11-24), and a
// retry after it does not help: postgres.js fails the next queries fast during its
// reconnect backoff, and a new attempt waits for the same wake. 10 seconds is the
// value Neon's own connection examples use; a healthy wake takes well under a second.
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
