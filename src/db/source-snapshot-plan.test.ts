import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLegacyContractArchiveTables,
  assertSnapshotDatabaseEnvVariable,
  LEGACY_CONTRACT_ARCHIVE_ENTRIES,
  LEGACY_CONTRACT_ARCHIVE_TABLES,
} from "./source-snapshot-plan";

test("snapshot targets require an explicit environment-scoped database variable", () => {
  assert.equal(
    assertSnapshotDatabaseEnvVariable({
      target: "development",
      variableName: "DATABASE_DEV_DATABASE_URL_UNPOOLED",
    }),
    "DATABASE_DEV_DATABASE_URL_UNPOOLED",
  );
  assert.equal(
    assertSnapshotDatabaseEnvVariable({
      target: "production",
      variableName: "DATABASE_URL_PROD_UNPOOLED",
    }),
    "DATABASE_URL_PROD_UNPOOLED",
  );
  assert.throws(
    () =>
      assertSnapshotDatabaseEnvVariable({
        target: "development",
        variableName: "DATABASE_URL_UNPOOLED",
      }),
    /DEV-scoped/u,
  );
  assert.throws(
    () =>
      assertSnapshotDatabaseEnvVariable({
        target: "production",
        variableName: "DATABASE_DEV_DATABASE_URL_UNPOOLED",
      }),
    /PROD-scoped/u,
  );
});

test("contract snapshots exclude Google data", () => {
  assert.deepEqual(LEGACY_CONTRACT_ARCHIVE_ENTRIES, ["database.dump", "manifest.json"]);
});

test("legacy contract archives require every checkpoint and compatibility table", () => {
  const tableOfContents = LEGACY_CONTRACT_ARCHIVE_TABLES.map(
    (table, index) => `${index + 1}; 0 0 TABLE DATA public ${table} database_owner`,
  ).join("\n");

  assert.deepEqual(
    assertLegacyContractArchiveTables(tableOfContents),
    LEGACY_CONTRACT_ARCHIVE_TABLES,
  );
  assert.throws(
    () =>
      assertLegacyContractArchiveTables(
        tableOfContents.replace(
          "TABLE DATA public data_backfill_runs",
          "TABLE public data_backfill_runs",
        ),
      ),
    /data_backfill_runs/u,
  );
});
