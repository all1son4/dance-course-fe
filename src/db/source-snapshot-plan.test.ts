import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLegacyContractArchiveTables,
  assertSnapshotDatabaseEnvVariable,
  getSourceSnapshotArchiveEntries,
  getSourceSnapshotSchemaVersion,
  LEGACY_CONTRACT_ARCHIVE_TABLES,
  parseSourceSnapshotScope,
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

test("database snapshots exclude Google data and use a distinct manifest version", () => {
  assert.equal(parseSourceSnapshotScope(" database "), "database");
  assert.equal(getSourceSnapshotSchemaVersion("database"), 2);
  assert.deepEqual(getSourceSnapshotArchiveEntries("database"), [
    "database.dump",
    "manifest.json",
  ]);
});

test("historical source snapshots retain their version and archive shape", () => {
  assert.equal(parseSourceSnapshotScope(""), "sources");
  assert.equal(parseSourceSnapshotScope("sources"), "sources");
  assert.equal(getSourceSnapshotSchemaVersion("sources"), 1);
  assert.deepEqual(getSourceSnapshotArchiveEntries("sources"), [
    "database.dump",
    "google-sheets.json",
    "manifest.json",
  ]);
  assert.throws(() => parseSourceSnapshotScope("all"), /scope=database/u);
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
