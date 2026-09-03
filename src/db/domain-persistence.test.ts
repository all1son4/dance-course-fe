import assert from "node:assert/strict";
import test from "node:test";

import {
  getDomainPersistenceConfiguration,
  getDomainPersistenceMode,
} from "./domain-persistence";

test("defaults the optional Sheets exporter to legacy mode", () => {
  assert.deepEqual(getDomainPersistenceConfiguration({}), {
    sheetsExport: "legacy",
  });
});

test("reads the optional Sheets exporter mode", () => {
  assert.equal(
    getDomainPersistenceMode("sheetsExport", {
      DB_SHEETS_EXPORT_MODE: "database",
    }),
    "database",
  );
});

test("rejects invalid values instead of silently falling back", () => {
  assert.throws(
    () =>
      getDomainPersistenceMode("sheetsExport", {
        DB_SHEETS_EXPORT_MODE: "automatic-fallback",
      }),
    /DB_SHEETS_EXPORT_MODE must be one of/u,
  );
});
