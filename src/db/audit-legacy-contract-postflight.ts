import postgres from "postgres";

import { getDatabaseEnvSelection, getRequiredDatabaseUrlFromEnv } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";

const main = async () => {
  if (!["development", "production"].includes(process.env.DATABASE_ENV ?? "")) {
    throw new Error("contract_postflight_explicit_database_env_required");
  }

  loadDatabaseEnvConfig();
  const client = postgres(
    getRequiredDatabaseUrlFromEnv({ purpose: "read-only contract postflight" }),
    { connect_timeout: 5, max: 1, prepare: false },
  );

  try {
    const result = await client.begin(
      "isolation level repeatable read read only",
      async (transaction) => {
        await transaction`SET LOCAL statement_timeout = '15s'`;
        const [row] = await transaction<
          {
            backfillTableAbsent: boolean;
            invoicePdfColumnAbsent: boolean;
            inviteHistoryColumnPresent: boolean;
            legacySideEffects: number;
            retiredValuesConstraintValid: boolean;
          }[]
        >`
          SELECT
            to_regclass('public.data_backfill_runs') IS NULL AS "backfillTableAbsent",
            NOT EXISTS (
              SELECT 1 FROM pg_attribute
              WHERE attrelid = 'public.invoices'::regclass
                AND attname = 'pdf_storage_key' AND NOT attisdropped
            ) AS "invoicePdfColumnAbsent",
            EXISTS (
              SELECT 1 FROM pg_attribute
              WHERE attrelid = 'public.purchases'::regclass
                AND attname = 'invite_history_created_at' AND NOT attisdropped
            ) AS "inviteHistoryColumnPresent",
            (
              SELECT count(*)::int FROM purchase_side_effects
              WHERE kind IN ('successful_customer_export', 'google_sheets_export')
                OR provider = 'google_sheets'
            ) AS "legacySideEffects",
            EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.purchase_side_effects'::regclass
                AND conname = 'purchase_side_effects_retired_values_check'
                AND convalidated
            ) AS "retiredValuesConstraintValid"
        `;

        if (!row) {
          throw new Error("contract_postflight_result_missing");
        }

        return row;
      },
    );

    const passed =
      result.backfillTableAbsent &&
      result.invoicePdfColumnAbsent &&
      result.inviteHistoryColumnPresent &&
      result.legacySideEffects === 0 &&
      result.retiredValuesConstraintValid;

    console.warn(JSON.stringify({ database: getDatabaseEnvSelection(), passed, result }));
    process.exitCode = passed ? 0 : 2;
  } finally {
    await client.end({ timeout: 5 });
  }
};

void main().catch(() => {
  console.error("contract_postflight_failed; verify explicit DATABASE_ENV and schema");
  process.exitCode = 1;
});
