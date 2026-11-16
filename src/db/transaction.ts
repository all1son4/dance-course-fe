import type { getDatabase } from "./client";

export type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

/** A database or an open transaction: both run the same queries. */
export type DatabaseExecutor = Pick<
  ReturnType<typeof getDatabase>,
  "insert" | "select" | "update"
>;
