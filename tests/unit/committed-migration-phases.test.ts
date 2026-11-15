import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getDeclaredMigrationPhase,
  LAST_LEGACY_MIGRATION_INDEX,
} from "@/db/migration-policy";

import migrationJournal from "../../drizzle/meta/_journal.json";

// The production workflow refuses a migration without its phase marker; catch it in CI
// instead of on the release morning.
test("every committed migration after the legacy baseline declares its phase", () => {
  const missing = migrationJournal.entries
    .filter((entry) => entry.idx > LAST_LEGACY_MIGRATION_INDEX)
    .filter(
      (entry) =>
        getDeclaredMigrationPhase(
          readFileSync(path.join(process.cwd(), "drizzle", `${entry.tag}.sql`), "utf8"),
        ) === null,
    )
    .map((entry) => entry.tag);

  assert.deepEqual(missing, []);
});
