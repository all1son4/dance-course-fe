import { readFileSync } from "node:fs";
import path from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";

import migrationJournal from "../../drizzle/meta/_journal.json";
import {
  type AppliedMigration,
  type CommittedMigration,
  getExpectedMigrationApproval,
  getPendingMigrationPlan,
  type MigrationPhase,
  type MigrationTarget,
} from "./migration-policy";

const MIGRATION_FOLDER = path.join(process.cwd(), "drizzle");
const MIGRATION_LOCK_ID = 2_026_080_603;

type JournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

const parseMigrationTarget = (value: string | undefined): MigrationTarget => {
  if (value === "development" || value === "production") {
    return value;
  }

  throw new Error("MIGRATION_TARGET must be development or production.");
};

const parseMigrationPhase = (value: string | undefined): MigrationPhase => {
  if (value === "contract" || value === "expand") {
    return value;
  }

  throw new Error("MIGRATION_PHASE must be expand or contract.");
};

const getRequiredMigrationDatabaseUrl = () => {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL?.trim() ?? "";

  if (!databaseUrl) {
    throw new Error("MIGRATION_DATABASE_URL is required.");
  }

  const parsedUrl = new URL(databaseUrl);

  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error("MIGRATION_DATABASE_URL must be a PostgreSQL URL.");
  }

  return databaseUrl;
};

const getCommittedMigrations = (): CommittedMigration[] => {
  const journalEntries = migrationJournal.entries as JournalEntry[];
  const migrationMetadata = readMigrationFiles({
    migrationsFolder: MIGRATION_FOLDER,
  });

  if (journalEntries.length !== migrationMetadata.length) {
    throw new Error("migration_journal_metadata_length_mismatch");
  }

  return journalEntries.map((entry, index) => {
    const metadata = migrationMetadata[index];

    if (entry.idx !== index) {
      throw new Error(`migration_journal_index_mismatch:${entry.tag}`);
    }

    if (!metadata || metadata.folderMillis !== entry.when) {
      throw new Error(`migration_journal_metadata_mismatch:${entry.tag}`);
    }

    return {
      createdAt: metadata.folderMillis,
      hash: metadata.hash,
      index: entry.idx,
      source: readFileSync(path.join(MIGRATION_FOLDER, `${entry.tag}.sql`), "utf8"),
      tag: entry.tag,
    };
  });
};

const getAppliedMigrations = async (client: Sql): Promise<AppliedMigration[]> => {
  const [migrationTable] = await client<{ exists: boolean }[]>`
    SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists
  `;

  if (!migrationTable?.exists) {
    return [];
  }

  const rows = await client<{ created_at: string; hash: string }[]>`
    SELECT created_at::text, hash
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at ASC
  `;

  return rows.map((row) => ({
    createdAt: Number(row.created_at),
    hash: row.hash,
  }));
};

const main = async () => {
  const target = parseMigrationTarget(process.env.MIGRATION_TARGET);
  const phase = parseMigrationPhase(process.env.MIGRATION_PHASE);
  const dryRun = process.env.MIGRATION_DRY_RUN === "1";
  const allowLegacyBaseline = process.env.MIGRATION_ALLOW_LEGACY_BASELINE === "1";
  const committed = getCommittedMigrations();
  const client = postgres(getRequiredMigrationDatabaseUrl(), {
    connect_timeout: 10,
    max: 1,
    prepare: false,
  });
  let lockAcquired = false;

  try {
    if (!dryRun) {
      const expectedApproval = getExpectedMigrationApproval(target, phase);

      if (process.env.MIGRATION_APPROVAL !== expectedApproval) {
        throw new Error(`migration_approval_mismatch:expected:${expectedApproval}`);
      }

      const [lock] = await client<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_lock(${MIGRATION_LOCK_ID}) AS acquired
      `;

      lockAcquired = Boolean(lock?.acquired);

      if (!lockAcquired) {
        throw new Error("migration_lock_unavailable");
      }
    }

    const appliedBefore = await getAppliedMigrations(client);
    const pending = getPendingMigrationPlan({
      allowLegacyBaseline,
      applied: appliedBefore,
      committed,
      requestedPhase: phase,
    });

    console.warn(
      JSON.stringify({
        appliedCount: appliedBefore.length,
        dryRun,
        pendingTags: pending.map((migration) => migration.tag),
        phase,
        target,
      }),
    );

    if (dryRun || pending.length === 0) {
      return;
    }

    await migrate(drizzle(client), {
      migrationsFolder: MIGRATION_FOLDER,
    });

    const appliedAfter = await getAppliedMigrations(client);
    getPendingMigrationPlan({
      allowLegacyBaseline,
      applied: appliedAfter,
      committed,
      requestedPhase: phase,
    });

    if (appliedAfter.length !== committed.length) {
      throw new Error("migration_postflight_pending_migrations_remain");
    }

    console.warn(
      JSON.stringify({
        appliedCount: appliedAfter.length,
        phase,
        status: "migration_complete",
        target,
      }),
    );
  } finally {
    if (lockAcquired) {
      await client`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
    }

    await client.end();
  }
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
