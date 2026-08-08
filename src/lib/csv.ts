const SPREADSHEET_FORMULA_PREFIX_PATTERN = /^[=+\-@]/u;
const CSV_QUOTING_PATTERN = /[";,]/u;

const normalizeCsvCell = (value: string) => value.replace(/\r\n|\r|\n/gu, " ").trim();

const neutralizeSpreadsheetFormula = (value: string) =>
  SPREADSHEET_FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;

/**
 * Encodes one CSV cell for spreadsheet consumption. A leading apostrophe is
 * interpreted as a text marker by spreadsheet applications, so formula-like input
 * remains visible as text instead of being evaluated.
 */
export const escapeSpreadsheetCsvCell = (value: string) => {
  const safeValue = neutralizeSpreadsheetFormula(normalizeCsvCell(value));

  if (CSV_QUOTING_PATTERN.test(safeValue)) {
    return `"${safeValue.replaceAll('"', '""')}"`;
  }

  return safeValue;
};
