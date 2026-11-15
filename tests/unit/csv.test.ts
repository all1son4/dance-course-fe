import assert from "node:assert/strict";
import test from "node:test";

import { escapeSpreadsheetCsvCell } from "@/lib/csv";

test("keeps ordinary CSV cell formatting unchanged", () => {
  assert.equal(escapeSpreadsheetCsvCell(" Anna Test "), "Anna Test");
  assert.equal(
    escapeSpreadsheetCsvCell('Anna "Test", buyer@example.com'),
    '"Anna ""Test"", buyer@example.com"',
  );
  assert.equal(escapeSpreadsheetCsvCell("Anna\r\nTest"), "Anna Test");
});

test("neutralizes formula-like spreadsheet cells without dropping their content", () => {
  const formulaLikeValues = [
    '=HYPERLINK("https://example.com","Open")',
    "+SUM(1,2)",
    "-1+2",
    "@SUM(1,2)",
    " \t=1+1 ",
    "\r=1+1",
  ];

  for (const value of formulaLikeValues) {
    const encoded = escapeSpreadsheetCsvCell(value);
    const unquoted = encoded.startsWith('"')
      ? encoded.slice(1, -1).replaceAll('""', '"')
      : encoded;

    assert.equal(unquoted.startsWith("'"), true, value);
    assert.match(unquoted.slice(1), /^[=+\-@]/u, value);
  }
});

test("does not alter text that is already safe or only contains formula characters", () => {
  assert.equal(escapeSpreadsheetCsvCell("Customer = active"), "Customer = active");
  assert.equal(escapeSpreadsheetCsvCell("'=1+1"), "'=1+1");
});

test("a formula after a semicolon is neutralised for semicolon-separated Excel", () => {
  assert.equal(escapeSpreadsheetCsvCell("Anna;=1+1"), `"Anna;'=1+1"`);
  assert.equal(escapeSpreadsheetCsvCell("Anna; -cmd"), `"Anna; '-cmd"`);
  assert.equal(escapeSpreadsheetCsvCell("Anna;Kowalska"), `"Anna;Kowalska"`);
});
