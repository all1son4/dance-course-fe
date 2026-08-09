import postgres from "postgres";

import { getDatabaseEnvSelection, getRequiredDatabaseUrlFromEnv } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";

loadDatabaseEnvConfig();

type ConnectionKind = "pooled" | "unpooled";

const REQUIRED_TABLES = [
  "access_entitlements",
  "customers",
  "email_campaign_leads",
  "invoices",
  "invoice_sequences",
  "monthly_report_runs",
  "offer_prices",
  "product_offers",
  "products",
  "purchase_side_effects",
  "purchases",
  "stripe_events",
  "telegram_access_tokens",
  "telegram_user_bindings",
] as const;

const checkConnection = async (kind: ConnectionKind) => {
  const selection = getDatabaseEnvSelection(kind);
  const client = postgres(
    getRequiredDatabaseUrlFromEnv({
      kind,
      purpose: `${kind} database health check`,
    }),
    {
      connect_timeout: 10,
      max: 1,
      prepare: false,
    },
  );

  try {
    const [connection] = await client<
      {
        current_database: string;
        current_user: string;
        inet_server_addr: string | null;
        inet_server_port: number | null;
      }[]
    >`
      select
        current_database(),
        current_user,
        inet_server_addr()::text as inet_server_addr,
        inet_server_port() as inet_server_port
    `;

    return {
      connection,
      selection,
      status: "ok" as const,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      selection,
      status: "failed" as const,
    };
  } finally {
    await client.end();
  }
};

const checkSchema = async () => {
  const client = postgres(
    getRequiredDatabaseUrlFromEnv({
      kind: "pooled",
      purpose: "schema health check",
    }),
    {
      connect_timeout: 10,
      max: 1,
      prepare: false,
    },
  );

  try {
    const tableRows = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ${client(REQUIRED_TABLES)}
      order by table_name
    `;
    const existingTables = new Set(tableRows.map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter((table) => !existingTables.has(table));
    const [drizzleMigrations] = await client<
      {
        migration_count: number;
        latest_created_at: string | null;
      }[]
    >`
      select
        count(*)::int as migration_count,
        max(created_at)::text as latest_created_at
      from drizzle.__drizzle_migrations
    `;

    return {
      existingTableCount: existingTables.size,
      missingTables,
      migrations: drizzleMigrations ?? {
        latest_created_at: null,
        migration_count: 0,
      },
      status: missingTables.length === 0 ? ("ok" as const) : ("failed" as const),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      status: "failed" as const,
    };
  } finally {
    await client.end();
  }
};

const main = async () => {
  const [pooled, unpooled, schema] = await Promise.all([
    checkConnection("pooled"),
    checkConnection("unpooled"),
    checkSchema(),
  ]);
  const status =
    pooled.status === "ok" && unpooled.status === "ok" && schema.status === "ok"
      ? "ok"
      : "failed";

  console.warn(
    JSON.stringify(
      {
        nodeEnv: process.env.NODE_ENV ?? null,
        pooled,
        schema,
        status,
        unpooled,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      },
      null,
      2,
    ),
  );

  if (status !== "ok") {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
