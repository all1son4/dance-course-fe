import type { MetadataRoute } from "next";

const siteUrl =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
const normalizedSiteUrl = siteUrl.replace(/\/+$/u, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin"],
      },
    ],
    sitemap: `${normalizedSiteUrl}/sitemap.xml`,
    host: normalizedSiteUrl,
  };
}
