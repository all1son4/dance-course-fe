import type { MetadataRoute } from "next";

import { toUtcIso } from "@/lib/time";

const siteUrl =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
const normalizedSiteUrl = siteUrl.replace(/\/+$/u, "");

const indexableRoutes = [
  "/",
  "/online",
  "/online/first-touch",
  "/online/choreo",
  "/offline",
  "/privacy-policy",
  "/cookie-policy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = toUtcIso();

  return indexableRoutes.map((route) => ({
    url: `${normalizedSiteUrl}${route}`,
    lastModified,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
