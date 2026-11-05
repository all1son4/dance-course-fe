import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { buildPageMetadata, PAGE_OG_IMAGE_PATHS } from "./seo";

type PageTranslator = (key: "title" | "description" | "ogImageAlt") => string;

/** The pure part of a page's metadata: everything except the translation lookup. */
export const resolvePageMetadata = ({
  locale,
  ogImagePath,
  pageT,
  path,
  siteName,
}: {
  locale: string;
  ogImagePath?: string;
  pageT: PageTranslator;
  path: string;
  siteName: string;
}): Metadata =>
  buildPageMetadata({
    locale,
    path,
    title: pageT("title"),
    description: pageT("description"),
    siteName,
    ogImageAlt: pageT("ogImageAlt"),
    ogImagePath,
  });

/**
 * `generateMetadata` for a public page: the request locale's
 * `Metadata.pages.<key>` strings plus the shared site name, shaped by
 * `buildPageMetadata`. URLs carry no locale, so a crawler that sends no
 * language gets the default locale and a Russian visitor gets a Russian tab
 * title - the same language as the page body in both cases.
 */
export const buildLocalizedPageMetadata = async ({
  pageKey,
  path,
}: {
  pageKey: string;
  path: string;
}): Promise<Metadata> => {
  const locale = await getLocale();
  const [metadataT, pageT] = await Promise.all([
    getTranslations({ locale, namespace: "Metadata" }),
    getTranslations({ locale, namespace: `Metadata.pages.${pageKey}` }),
  ]);

  return resolvePageMetadata({
    locale,
    ogImagePath: PAGE_OG_IMAGE_PATHS[pageKey],
    pageT,
    path,
    siteName: metadataT("siteName"),
  });
};
