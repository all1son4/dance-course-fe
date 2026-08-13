import { getDatabaseClient } from "./client";
import { getDatabaseEnvSelection } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";

loadDatabaseEnvConfig();

const parseLimit = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);

  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : fallback;
};

const main = async () => {
  const database = getDatabaseEnvSelection("pooled");
  const confirmation = process.env.DB_BUSINESS_JOBS_RUN_CONFIRM?.trim() ?? "";

  if (confirmation !== database.deploymentEnvironment) {
    throw new Error(
      `DB_BUSINESS_JOBS_RUN_CONFIRM must equal ${database.deploymentEnvironment}.`,
    );
  }

  const { runBusinessOperationOutboxJobs } =
    await import("@/lib/business-operation-outbox");
  const result = await runBusinessOperationOutboxJobs({
    limit: parseLimit(process.env.DB_BUSINESS_JOBS_LIMIT, 50),
  });

  console.warn(JSON.stringify({ database, result }, null, 2));
};

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "business_operation_jobs_failed",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDatabaseClient().end();
  });
