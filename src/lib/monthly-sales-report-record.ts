/**
 * Internal report-run projection shared by PostgreSQL readers and report delivery.
 * Independent of archive column order; all values retain their string representation.
 * period_start_utc is inclusive and period_end_utc is exclusive. Missing delivery
 * evidence stays an empty string, and a zero row count stays "0", not an empty value.
 */
export type MonthlySalesReportRunRecord = {
  report_key: string;
  report_family: string;
  period_start_utc: string;
  period_end_utc: string;
  generated_at_utc: string;
  delivery_status: string;
  delivered_at_utc: string;
  delivered_to: string;
  row_count: string;
  csv_sha256: string;
};
