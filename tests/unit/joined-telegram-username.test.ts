import assert from "node:assert/strict";
import test from "node:test";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { rememberJoinedTelegramUsername } from "@/db/buyer-contacts";

const recordQueries = () => {
  const params: unknown[][] = [];
  const dialect = new PgDialect();
  const database = {
    execute: async (query: SQL) => {
      params.push(dialect.sqlToQuery(query).params);
      return [];
    },
  } as unknown as Parameters<typeof rememberJoinedTelegramUsername>[0];
  return { database, params };
};

test("a join without a Telegram handle writes nothing to the buyer", async () => {
  const { database, params } = recordQueries();

  for (const telegramUsername of ["", "   ", "@"]) {
    await rememberJoinedTelegramUsername(database, { purchaseId: "p", telegramUsername });
  }

  assert.equal(params.length, 0);
});

test("the handle is stored the way checkouts stored it, with one leading @", async () => {
  const { database, params } = recordQueries();

  await rememberJoinedTelegramUsername(database, {
    purchaseId: "purchase-1",
    telegramUsername: " @@Fresh_Handle ",
  });

  assert.deepEqual(params, [["@Fresh_Handle", "purchase-1", "@Fresh_Handle"]]);
});
