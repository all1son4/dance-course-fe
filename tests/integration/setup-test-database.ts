import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const main = async () => {
  const client = postgres(getRequiredTestDatabaseUrl(), {
    max: 1,
    prepare: false,
  });

  try {
    await migrate(drizzle(client), {
      migrationsFolder: "drizzle",
    });
  } finally {
    await client.end();
  }
};

void main();
