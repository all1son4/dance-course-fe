/** A production deployment: Vercel's own flag, or NODE_ENV where Vercel sets none. */
export const isProductionDeployment = () =>
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");

/** Customer notifications go out in production, elsewhere only when allowed outright. */
export const areNotificationsEnabled = () =>
  isProductionDeployment() || process.env.ALLOW_TEST_MODE_NOTIFICATIONS === "1";
