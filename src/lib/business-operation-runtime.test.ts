import assert from "node:assert/strict";
import test from "node:test";

import { getEmailCampaignRuntime } from "@/lib/email-campaigns";
import { getInvoiceNumberingRuntime } from "@/lib/invoices/invoice-numbering";
import { getMonthlySalesReportRuntime } from "@/lib/monthly-sales-report";

const runtimeSelectors = [
  getEmailCampaignRuntime,
  getInvoiceNumberingRuntime,
  getMonthlySalesReportRuntime,
];

test("business operations preserve legacy behavior until the database cutover", () => {
  for (const selectRuntime of runtimeSelectors) {
    assert.equal(selectRuntime({}), "legacy");
    assert.equal(selectRuntime({ DB_BUSINESS_OPERATIONS_MODE: "legacy" }), "legacy");
    assert.equal(selectRuntime({ DB_BUSINESS_OPERATIONS_MODE: "shadow" }), "legacy");
  }
});

test("business operations switch together only in explicit database mode", () => {
  for (const selectRuntime of runtimeSelectors) {
    assert.equal(selectRuntime({ DB_BUSINESS_OPERATIONS_MODE: "database" }), "database");
  }
});

test("business operation selectors fail closed on an invalid mode", () => {
  for (const selectRuntime of runtimeSelectors) {
    assert.throws(
      () => selectRuntime({ DB_BUSINESS_OPERATIONS_MODE: "fallback" }),
      /DB_BUSINESS_OPERATIONS_MODE must be one of/u,
    );
  }
});
