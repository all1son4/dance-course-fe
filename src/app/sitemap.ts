import type { MetadataRoute } from "next";

import { HERO_MEDIA, type HeroMediaAsset } from "@/constants/hero-media";
import { PAGE_VIDEOS } from "@/constants/page-videos";
import { normalizedSiteUrl } from "@/lib/seo";
// One URL serves every language and a crawler gets the default one (en), so
// the sitemap describes the English page.
import defaultMessages from "@/messages/en.json";

type SitemapRoute = {
  path: string;
  /**
   * The day the page's main content, structured data or links last changed
   * for real - bump it with such a change, never for a typo or a restyle.
   * Google trusts lastmod only while it stays accurate.
   */
  lastModified: string;
  hero?: HeroMediaAsset;
  /** Key under Metadata.pages and the video file it describes. */
  video?: { pageKey: "firstTouch" | "onlineGroup"; src: string };
};

const indexableRoutes: SitemapRoute[] = [
  { path: "/", lastModified: "2026-11-21", hero: HERO_MEDIA.home },
  { path: "/online", lastModified: "2026-11-21", hero: HERO_MEDIA.online },
  {
    path: "/online/group",
    lastModified: "2026-11-21",
    hero: HERO_MEDIA.online,
    video: { pageKey: "onlineGroup", src: "/videos/online_example.mp4" },
  },
  {
    path: "/online/inspiration-hub",
    lastModified: "2026-11-21",
    hero: HERO_MEDIA.inspirationHub,
  },
  {
    path: "/online/first-touch",
    lastModified: "2026-11-21",
    hero: HERO_MEDIA.firstTouch,
    video: { pageKey: "firstTouch", src: "/videos/introduction_first_touch_en.mp4" },
  },
  { path: "/online/choreo", lastModified: "2026-11-21", hero: HERO_MEDIA.choreo },
  // Retired with BIRTHDAY_CAMPAIGN_ENABLED; the page answers 404 meanwhile.
  // "/online/birthday-drop",
  { path: "/offline", lastModified: "2026-11-21", hero: HERO_MEDIA.offline },
  { path: "/privacy-policy", lastModified: "2026-11-21" },
  { path: "/cookie-policy", lastModified: "2026-11-21" },
];

// Next writes video fields into the XML as they are.
const escapeXml = (value: string) =>
  value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

const absoluteUrl = (path: string) =>
  // The same form as the canonical and og:url: the home page has no slash.
  path === "/" ? normalizedSiteUrl : `${normalizedSiteUrl}${path}`;

export default function sitemap(): MetadataRoute.Sitemap {
  return indexableRoutes.map(({ path, lastModified, hero, video }) => {
    const videoFile = video ? PAGE_VIDEOS[video.src] : undefined;
    const videoText = video
      ? defaultMessages.Metadata.pages[video.pageKey].video
      : undefined;

    return {
      url: absoluteUrl(path),
      lastModified,
      ...(hero ? { images: [absoluteUrl(hero.src)] } : {}),
      ...(video && videoFile && videoText
        ? {
            videos: [
              {
                title: escapeXml(videoText.name),
                description: escapeXml(videoText.description),
                thumbnail_loc: absoluteUrl(videoFile.poster),
                content_loc: absoluteUrl(video.src),
              },
            ],
          }
        : {}),
    };
  });
}
