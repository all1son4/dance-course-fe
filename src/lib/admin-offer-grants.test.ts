import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdminOfferGrantRuntime,
  shouldExportAdminOfferGrantToSheets,
} from "./admin-offer-grants";

test("keeps the legacy admin-offer writer until explicit cutover", () => {
  assert.equal(getAdminOfferGrantRuntime({}), "legacy");
  assert.equal(
    getAdminOfferGrantRuntime({ DB_BUSINESS_OPERATIONS_MODE: "shadow" }),
    "legacy",
  );
});

test("enables the PostgreSQL admin-offer command explicitly", () => {
  assert.equal(
    getAdminOfferGrantRuntime({ DB_BUSINESS_OPERATIONS_MODE: "database" }),
    "database",
  );
});

test("keeps the transitional export unless Sheets are explicitly retired", () => {
  assert.equal(shouldExportAdminOfferGrantToSheets({}), true);
  assert.equal(
    shouldExportAdminOfferGrantToSheets({ DB_SHEETS_EXPORT_MODE: "shadow" }),
    true,
  );
  assert.equal(
    shouldExportAdminOfferGrantToSheets({ DB_SHEETS_EXPORT_MODE: "database" }),
    false,
  );
});

test("rejects invalid admin-offer modes instead of falling back", () => {
  assert.throws(
    () =>
      getAdminOfferGrantRuntime({
        DB_BUSINESS_OPERATIONS_MODE: "automatic-fallback",
      }),
    /DB_BUSINESS_OPERATIONS_MODE must be one of/u,
  );
});
