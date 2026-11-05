import type { MetadataRoute } from "next";

import {
  SITE_APP_ICONS,
  SITE_BACKGROUND_COLOR,
  SITE_THEME_COLORS,
} from "@/lib/site-chrome";

/**
 * Served at /manifest.webmanifest (Next links it from every page). It names
 * the site and its icons for "Add to Home Screen"; `display: "browser"`
 * keeps that a plain bookmark that opens in the browser, with its address
 * bar and checkout flow untouched - this is deliberately not a standalone
 * PWA, and there is no service worker.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anna Strok",
    short_name: "Anna Strok",
    description:
      "Frame Up Strip with Anna Strok: online courses with feedback and Impro Room practice in Warsaw.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "browser",
    background_color: SITE_BACKGROUND_COLOR,
    theme_color: SITE_THEME_COLORS.light,
    icons: [
      { src: SITE_APP_ICONS.png192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: SITE_APP_ICONS.png512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: SITE_APP_ICONS.svg, sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
