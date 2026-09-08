import { eq } from "drizzle-orm";

import type { MonthlySalesReportRunRecord } from "@/lib/monthly-sales-report-record";

import { getDatabase } from "./client";
import { toIso } from "./record-values";
import { monthlyReportRuns } from "./schema";

const mapMonthlySalesReportRunRecordFromDatabase = (
  row: typeof monthlyReportRuns.$inferSelect,
): MonthlySalesReportRunRecord => ({
  csv_sha256: row.csvSha256 ?? "",
  delivered_at_utc: toIso(row.deliveredAtUtc),
  delivered_to: row.deliveredTo ?? "",
  delivery_status: row.deliveryStatus,
  generated_at_utc: toIso(row.generatedAtUtc),
  period_end_utc: toIso(row.periodEndUtc),
  period_start_utc: toIso(row.periodStartUtc),
  report_family: row.reportFamily,
  report_key: row.reportKey,
  row_count: String(row.rowCount),
});

export const findMonthlySalesReportRunByKeyFromDatabase = async (reportKey: string) => {
  const normalizedReportKey = reportKey.trim();

  if (!normalizedReportKey) {
    return null;
  }

  const [row] = await getDatabase()
    .select()
    .from(monthlyReportRuns)
    .where(eq(monthlyReportRuns.reportKey, normalizedReportKey))
    .limit(1);

  return row ? mapMonthlySalesReportRunRecordFromDatabase(row) : null;
};
