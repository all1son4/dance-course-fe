export const LAST_LEGACY_MIGRATION_INDEX = 8;

export type MigrationPhase = "contract" | "expand";
export type MigrationTarget = "development" | "production";

export type AppliedMigration = {
  createdAt: number;
  hash: string;
};

export type CommittedMigration = AppliedMigration & {
  index: number;
  source: string;
  tag: string;
};

const ACCEPTED_LEGACY_HASH_VARIANTS: Readonly<Record<string, ReadonlySet<string>>> = {
  "0007_online_group_entitlements": new Set([
    "e1aed9c07ee57fdb31e584f64724d5d9e3fcb505df125fcb6434904ccb53364c",
  ]),
};

const MIGRATION_PHASE_PATTERN = /^\s*--\s*migration-phase:\s*(contract|expand)\s*$/iu;

export const getExpectedMigrationApproval = (
  target: MigrationTarget,
  phase: MigrationPhase,
) => `migrate-${target}-${phase}`;

export const getExpectedMigrationRef = (target: MigrationTarget) =>
  target === "production" ? "main" : "dev";

export const getDeclaredMigrationPhase = (source: string): MigrationPhase | null => {
  const firstMeaningfulLine = source
    .split(/\r?\n/u)
    .find((line) => line.trim().length > 0);
  const match = firstMeaningfulLine?.match(MIGRATION_PHASE_PATTERN);

  if (match?.[1] === "contract" || match?.[1] === "expand") {
    return match[1];
  }

  return null;
};

export const assertAppliedMigrationsAreAnExactPrefix = ({
  applied,
  committed,
}: {
  applied: AppliedMigration[];
  committed: CommittedMigration[];
}) => {
  if (applied.length > committed.length) {
    throw new Error("migration_history_database_ahead_of_revision");
  }

  for (const [index, appliedMigration] of applied.entries()) {
    const committedMigration = committed[index];

    if (!committedMigration) {
      throw new Error("migration_history_database_ahead_of_revision");
    }

    if (appliedMigration.createdAt !== committedMigration.createdAt) {
      throw new Error(`migration_history_not_a_prefix:${committedMigration.tag}`);
    }

    const acceptedLegacyHashes = ACCEPTED_LEGACY_HASH_VARIANTS[committedMigration.tag];
    const isAcceptedLegacyVariant =
      committedMigration.index <= LAST_LEGACY_MIGRATION_INDEX &&
      Boolean(acceptedLegacyHashes?.has(appliedMigration.hash));

    if (appliedMigration.hash !== committedMigration.hash && !isAcceptedLegacyVariant) {
      throw new Error(`migration_history_hash_mismatch:${committedMigration.tag}`);
    }
  }
};

export const getPendingMigrationPlan = ({
  allowLegacyBaseline,
  applied,
  committed,
  requestedPhase,
}: {
  allowLegacyBaseline: boolean;
  applied: AppliedMigration[];
  committed: CommittedMigration[];
  requestedPhase: MigrationPhase;
}) => {
  assertAppliedMigrationsAreAnExactPrefix({ applied, committed });

  const pending = committed.slice(applied.length);

  for (const migration of pending) {
    if (migration.index <= LAST_LEGACY_MIGRATION_INDEX) {
      if (!allowLegacyBaseline) {
        throw new Error(`pending_legacy_migration_requires_bootstrap:${migration.tag}`);
      }

      continue;
    }

    const declaredPhase = getDeclaredMigrationPhase(migration.source);

    if (!declaredPhase) {
      throw new Error(`migration_phase_marker_missing:${migration.tag}`);
    }

    if (declaredPhase !== requestedPhase) {
      throw new Error(
        `migration_phase_mismatch:${migration.tag}:${declaredPhase}:${requestedPhase}`,
      );
    }
  }

  return pending;
};
