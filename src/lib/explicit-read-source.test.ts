import assert from "node:assert/strict";
import test from "node:test";

import { resolveExplicitRead } from "./explicit-read-source";

test("an explicit Sheets read never probes PostgreSQL", async () => {
  let databaseCalls = 0;
  const resolution = await resolveExplicitRead({
    read: async () => {
      databaseCalls += 1;
      return "database";
    },
    source: "sheets",
  });

  assert.deepEqual(resolution, { kind: "sheets" });
  assert.equal(databaseCalls, 0);
});

test("an explicit database read preserves missing records without fallback", async () => {
  const resolution = await resolveExplicitRead({
    read: async () => null,
    source: "database",
  });

  assert.deepEqual(resolution, { kind: "database", value: null });
});

test("an explicit database read propagates failures without fallback", async () => {
  await assert.rejects(
    resolveExplicitRead({
      read: async () => {
        throw new Error("database unavailable");
      },
      source: "database",
    }),
    /database unavailable/u,
  );
});
