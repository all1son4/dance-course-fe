import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { buildPageMetadata, PAGE_OG_IMAGE_PATHS, seoTargetLocale } from "./seo";

type PageTranslator = (
  key: "title" | "description" | "ogImageAlt" | "keywords",
) => string;

/** "a, b ,c" -> ["a", "b", "c"]; empty entries dropped. */
export const splitKeywords = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** The pure part of a page's metadata: everything except the translation lookup. */
export const resolvePageMetadata = ({
  ogImagePath,
  pageT,
  path,
  siteName,
}: {
  ogImagePath?: string;
  pageT: PageTranslator;
  path: string;
  siteName: string;
}): Metadata =>
  buildPageMetadata({
    locale: seoTargetLocale,
    path,
    title: pageT("title"),
    description: pageT("description"),
    siteName,
    ogImageAlt: pageT("ogImageAlt"),
    ogImagePath,
    keywords: splitKeywords(pageT("keywords")),
  });

/**
 * `generateMetadata` for a public page: the SEO locale's `Metadata.pages.<key>`
 * strings plus the shared site name, shaped by `buildPageMetadata`. Public
 * pages are indexed in one language (see `seoTargetLocale`), so the visitor's
 * locale is deliberately not consulted here.
 */
export const buildLocalizedPageMetadata = async ({
  pageKey,
  path,
}: {
  pageKey: string;
  path: string;
}): Promise<Metadata> => {
  const [metadataT, pageT] = await Promise.all([
    getTranslations({ locale: seoTargetLocale, namespace: "Metadata" }),
    getTranslations({ locale: seoTargetLocale, namespace: `Metadata.pages.${pageKey}` }),
  ]);

  return resolvePageMetadata({
    ogImagePath: PAGE_OG_IMAGE_PATHS[pageKey],
    pageT,
    path,
    siteName: metadataT("siteName"),
  });
};
