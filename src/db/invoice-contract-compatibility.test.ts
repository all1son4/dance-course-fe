import assert from "node:assert/strict";
import test from "node:test";

import { getTableColumns } from "drizzle-orm";

import { invoices } from "./schema";

test("runtime invoice queries do not address the retired PDF storage column", () => {
  const columns = getTableColumns(invoices);

  assert.equal("pdfStorageKey" in columns, false);
});
