import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import robots from "@/app/robots";
import { normalizedSiteUrl } from "@/lib/seo";

// next.config.ts is CommonJS (`module.exports`), so it cannot be imported.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require("../../next.config.ts");

const originalVercelEnv = process.env.VERCEL_ENV;

const setVercelEnv = (value: string | undefined) => {
  if (value === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = value;
  }
};

const siteWideHeaders = async () => {
  const rules = await nextConfig.headers();
  const siteWide = rules.find((rule: { source: string }) => rule.source === "/:path*");

  assert.ok(siteWide, "next.config.ts has a site-wide header rule");
  return siteWide.headers as Array<{ key: string; value: string }>;
};

const robotsHeader = async () =>
  (await siteWideHeaders()).find((header) => header.key === "X-Robots-Tag");

afterEach(() => setVercelEnv(originalVercelEnv));

describe("production deployment", () => {
  it("stays indexable: no X-Robots-Tag, robots.txt allows crawling and names the sitemap", async () => {
    setVercelEnv("production");

    assert.equal(await robotsHeader(), undefined);
    assert.deepEqual(robots(), {
      rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] }],
      sitemap: `${normalizedSiteUrl}/sitemap.xml`,
    });
  });
});

describe("non-production deployments", () => {
  for (const vercelEnv of ["preview", "development", undefined]) {
    it(`${vercelEnv ?? "local"}: every response says noindex, robots.txt keeps it crawlable and names no sitemap`, async () => {
      setVercelEnv(vercelEnv);

      assert.deepEqual(await robotsHeader(), {
        key: "X-Robots-Tag",
        value: "noindex, nofollow",
      });
      // `Disallow: /` would hide the noindex from Google, so crawling stays open.
      assert.deepEqual(robots(), {
        rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] }],
      });
    });
  }
});
