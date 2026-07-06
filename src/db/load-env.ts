import { loadEnvConfig } from "@next/env";

const getDatabaseEnvironment = () =>
  (
    process.env.DATABASE_ENV ||
    process.env.DB_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  )
    .trim()
    .toLowerCase();

export const loadDatabaseEnvConfig = () => {
  const environment = getDatabaseEnvironment();
  const isDevelopment = environment !== "production" && environment !== "prod";

  return loadEnvConfig(process.cwd(), isDevelopment);
};
