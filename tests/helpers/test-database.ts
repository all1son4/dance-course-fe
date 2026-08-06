const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export const getRequiredTestDatabaseUrl = () => {
  const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";

  if (!databaseUrl) {
    throw new Error("Missing TEST_DATABASE_URL for PostgreSQL integration tests.");
  }

  const parsedUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//u, ""));

  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing integration test database without "test" in its name: ${databaseName}`,
    );
  }

  if (
    !LOOPBACK_HOSTS.has(parsedUrl.hostname) &&
    process.env.ALLOW_REMOTE_TEST_DATABASE !== "1"
  ) {
    throw new Error(
      "Refusing remote integration database without ALLOW_REMOTE_TEST_DATABASE=1.",
    );
  }

  return databaseUrl;
};
