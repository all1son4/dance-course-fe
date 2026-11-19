import { getDatabase, getDatabaseClient } from "./client";
import {
  findFirstOnlineGroupCohortChat,
  recordFirstOnlineGroupCohort,
} from "./first-online-group-cohort";
import { loadDatabaseEnvConfig } from "./load-env";

/*
 * Records the first Online Group cycle once (see first-online-group-cohort.ts).
 * A dry run by default; `--apply` writes, in one transaction.
 *   npm run db:backfill:first-cohort:prod -- --starts-at=2026-06-01T17:00:00+02:00 \
 *     --closed-at=2026-07-13T12:00:00+02:00 --weeks=6 [--apply]
 */

loadDatabaseEnvConfig();

const argument = (name: string) => {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
};

const date = (name: string) => {
  const value = argument(name);
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime()))
    throw new Error(`--${name} is required (ISO time)`);
  return parsed;
};

async function main() {
  if (
    process.env.DATABASE_ENV !== "development" &&
    process.env.DATABASE_ENV !== "production"
  ) {
    throw new Error("DATABASE_ENV must be development or production");
  }
  const apply = process.argv.includes("--apply");
  const dates = {
    closedAt: date("closed-at"),
    durationWeeks: Number(argument("weeks")),
    startsAt: date("starts-at"),
  };

  const result = await getDatabase().transaction(async (tx) =>
    recordFirstOnlineGroupCohort(tx, {
      apply,
      dates,
      found: await findFirstOnlineGroupCohortChat(tx),
    }),
  );
  process.stdout.write(
    `${JSON.stringify({ database: process.env.DATABASE_ENV, ...result }, null, 2)}\n`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getDatabaseClient().end());
