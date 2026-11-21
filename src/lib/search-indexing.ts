/**
 * Only the production deployment may be indexed. `dev.annastrok.com`,
 * Vercel previews and local servers answer with `X-Robots-Tag: noindex`
 * (next.config.ts) and a robots.txt without a sitemap (app/robots.ts), so
 * they never compete with the real site in search.
 *
 * Kept free of imports: next.config.ts requires this file directly.
 */
export const isIndexableDeployment = (env: NodeJS.ProcessEnv = process.env) =>
  env.VERCEL_ENV === "production";

/** Sent with every response of a deployment that must stay out of search. */
export const NON_PRODUCTION_ROBOTS_HEADER = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow",
} as const;
