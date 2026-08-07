import assert from "node:assert/strict";
import test from "node:test";

import {
  type CommittedMigration,
  getExpectedMigrationApproval,
  getExpectedMigrationRef,
  getPendingMigrationPlan,
} from "@/db/migration-policy";

const migration = ({
  hash,
  index,
  phase,
  tag,
}: {
  hash: string;
  index: number;
  phase?: "contract" | "expand";
  tag: string;
}): CommittedMigration => ({
  createdAt: 1_000 + index,
  hash,
  index,
  source: phase ? `-- migration-phase: ${phase}\nSELECT 1;` : "SELECT 1;",
  tag,
});

test("accepts an exact applied migration prefix", () => {
  const committed = [
    migration({ hash: "hash-0", index: 0, tag: "0000_legacy" }),
    migration({ hash: "hash-9", index: 9, phase: "expand", tag: "0009_expand" }),
  ];

  assert.deepEqual(
    getPendingMigrationPlan({
      allowLegacyBaseline: false,
      applied: [{ createdAt: 1_000, hash: "hash-0" }],
      committed,
      requestedPhase: "expand",
    }).map(({ tag }) => tag),
    ["0009_expand"],
  );
});

test("rejects changed or non-prefix database migration history", () => {
  const committed = [migration({ hash: "expected", index: 0, tag: "0000_legacy" })];

  assert.throws(
    () =>
      getPendingMigrationPlan({
        allowLegacyBaseline: false,
        applied: [{ createdAt: 1_000, hash: "changed" }],
        committed,
        requestedPhase: "expand",
      }),
    /migration_history_hash_mismatch:0000_legacy/u,
  );
  assert.throws(
    () =>
      getPendingMigrationPlan({
        allowLegacyBaseline: false,
        applied: [{ createdAt: 999, hash: "expected" }],
        committed,
        requestedPhase: "expand",
      }),
    /migration_history_not_a_prefix:0000_legacy/u,
  );
});

test("accepts only the recorded development hash variant for legacy migration 0007", () => {
  const committed = [
    migration({
      hash: "production-hash",
      index: 7,
      tag: "0007_online_group_entitlements",
    }),
  ];

  assert.deepEqual(
    getPendingMigrationPlan({
      allowLegacyBaseline: false,
      applied: [
        {
          createdAt: 1_007,
          hash: "e1aed9c07ee57fdb31e584f64724d5d9e3fcb505df125fcb6434904ccb53364c",
        },
      ],
      committed,
      requestedPhase: "expand",
    }),
    [],
  );
});

test("requires an explicit phase marker on every future migration", () => {
  assert.throws(
    () =>
      getPendingMigrationPlan({
        allowLegacyBaseline: false,
        applied: [],
        committed: [migration({ hash: "hash-9", index: 9, tag: "0009_unmarked" })],
        requestedPhase: "expand",
      }),
    /migration_phase_marker_missing:0009_unmarked/u,
  );

  assert.throws(
    () =>
      getPendingMigrationPlan({
        allowLegacyBaseline: false,
        applied: [],
        committed: [
          {
            ...migration({ hash: "hash-9", index: 9, tag: "0009_late_marker" }),
            source: "SELECT 1;\n-- migration-phase: expand",
          },
        ],
        requestedPhase: "expand",
      }),
    /migration_phase_marker_missing:0009_late_marker/u,
  );
});

test("does not mix expand and contract migrations in one release", () => {
  assert.throws(
    () =>
      getPendingMigrationPlan({
        allowLegacyBaseline: false,
        applied: [],
        committed: [
          migration({ hash: "hash-9", index: 9, phase: "contract", tag: "0009_drop" }),
        ],
        requestedPhase: "expand",
      }),
    /migration_phase_mismatch:0009_drop:contract:expand/u,
  );
});

test("requires explicit bootstrap permission for pending legacy migrations", () => {
  const committed = [migration({ hash: "hash-0", index: 0, tag: "0000_legacy" })];

  assert.throws(
    () =>
      getPendingMigrationPlan({
        allowLegacyBaseline: false,
        applied: [],
        committed,
        requestedPhase: "expand",
      }),
    /pending_legacy_migration_requires_bootstrap:0000_legacy/u,
  );
  assert.equal(
    getPendingMigrationPlan({
      allowLegacyBaseline: true,
      applied: [],
      committed,
      requestedPhase: "expand",
    }).length,
    1,
  );
});

test("builds an unambiguous target and phase confirmation", () => {
  assert.equal(
    getExpectedMigrationApproval("production", "contract"),
    "migrate-production-contract",
  );
  assert.equal(getExpectedMigrationRef("development"), "dev");
  assert.equal(getExpectedMigrationRef("production"), "main");
});
