import { runReconciliationBaseline } from "./capture-reconciliation-baseline";

void runReconciliationBaseline({ strict: true }).catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown comparison error";
  console.error(`Failed to compare Google Sheets and PostgreSQL: ${message}`);
  process.exitCode = 1;
});
