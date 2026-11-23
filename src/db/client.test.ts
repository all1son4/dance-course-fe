import assert from "node:assert/strict";
import test from "node:test";

test("every call shares one Drizzle wrapper of the one pooled client", async () => {
  process.env.DATABASE_ENV = "development";
  process.env.DATABASE_DEV_DATABASE_URL ||=
    "postgres://user:pass@127.0.0.1:5/client_test";
  const { getDatabase, getDatabaseClient } = await import("./client");

  try {
    assert.equal(getDatabase(), getDatabase());
    assert.equal(getDatabaseClient(), getDatabaseClient());
  } finally {
    await getDatabaseClient().end();
  }
});
