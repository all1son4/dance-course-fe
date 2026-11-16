import type postgres from "postgres";

/**
 * `inspiration_hub_settings` holds one row for the whole database. Test files that
 * commit it run in parallel, so each holds this lock while the row is theirs. The
 * lock lives on one reserved connection, because a session lock must be released
 * by the connection that took it.
 */
export async function lockHubSettingsForTest(
  client: postgres.Sql,
): Promise<() => Promise<void>> {
  const connection = await client.reserve();
  await connection`SELECT pg_advisory_lock(hashtextextended('test:inspiration_hub_settings', 0))`;

  return async () => {
    await connection`SELECT pg_advisory_unlock(hashtextextended('test:inspiration_hub_settings', 0))`;
    connection.release();
  };
}
