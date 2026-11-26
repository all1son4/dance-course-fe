import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { watchDatabaseConnections } from "./connection-watch";
import { getRequiredDatabaseUrlFromEnv } from "./env";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;

// The whole budget for opening a connection: TCP, TLS, auth and, on Neon, waking a
// compute that scaled to zero. A query waits in the driver's queue until then and is
// never sent before, so waiting is safe for reads, writes and transactions alike.
// Neon Free always scales to zero after 5 idle minutes (fixed on that plan), so a
// wake is a normal part of a request, not an error. Most wakes take 0.4-0.9 s, but
// the failures of 2026-11-24/25 waited about 5, 7.5 and 10 s for one (Neon logged
// a 7 s compute start at the last one), so 20 s gives the slowest wake seen twice
// its time. Only a request that would otherwise fail waits longer; the usual
// connect still takes a fraction of a second.
const RUNTIME_DATABASE_CONNECT_TIMEOUT_SECONDS = 20;

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
      // The driver default is 30 seconds: longer than any wake needs, and a visitor
      // would look at a blank page that long when the database is really down.
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
