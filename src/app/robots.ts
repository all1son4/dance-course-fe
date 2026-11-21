import type { MetadataRoute } from "next";

import { isIndexableDeployment } from "@/lib/search-indexing";
import { normalizedSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // Crawling stays allowed everywhere: a non-production deployment says
    // `noindex` in a header, and Google only sees that on pages it may fetch.
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin"],
      },
    ],
    // Only production advertises its pages.
    ...(isIndexableDeployment() ? { sitemap: `${normalizedSiteUrl}/sitemap.xml` } : {}),
  };
}
