export type SourceSnapshotTarget = "development" | "production";

export const LEGACY_CONTRACT_ARCHIVE_ENTRIES = [
  "database.dump",
  "manifest.json",
] as const;

export const LEGACY_CONTRACT_ARCHIVE_TABLES = [
  "data_backfill_runs",
  "invoices",
  "purchase_side_effects",
  "purchases",
] as const;

export const assertSnapshotDatabaseEnvVariable = ({
  target,
  variableName,
}: {
  target: SourceSnapshotTarget;
  variableName: string | null;
}) => {
  const targetMarker = target === "development" ? "DEV" : "PROD";
  const markerPattern = new RegExp(`(?:^|_)${targetMarker}(?:_|$)`, "u");

  if (!variableName || !markerPattern.test(variableName)) {
    throw new Error(
      `The ${target} snapshot requires an explicit ${targetMarker}-scoped database environment variable.`,
    );
  }

  return variableName;
};

export const assertLegacyContractArchiveTables = (tableOfContents: string) => {
  const archivedTables = LEGACY_CONTRACT_ARCHIVE_TABLES.filter((table) =>
    new RegExp(`\\bTABLE DATA public ${table}\\b`, "u").test(tableOfContents),
  );

  if (archivedTables.length !== LEGACY_CONTRACT_ARCHIVE_TABLES.length) {
    const missingTables = LEGACY_CONTRACT_ARCHIVE_TABLES.filter(
      (table) => !archivedTables.includes(table),
    );

    throw new Error(
      `Snapshot is missing required contract tables: ${missingTables.join(", ")}.`,
    );
  }

  return archivedTables;
};
