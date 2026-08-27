import type { Metadata } from "next";

import { INSTAGRAM_PROFILE_URL, PERSONAL_TELEGRAM_URL } from "@/constants/links";

type StructuredDataJsonValue =
  | boolean
  | null
  | number
  | string
  | StructuredDataJsonValue[]
  | { [key: string]: StructuredDataJsonValue };

export const siteUrl =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
export const normalizedSiteUrl = siteUrl.replace(/\/+$/u, "");
// 1200x630 (1.91:1) is what Telegram, WhatsApp, Facebook and X expect for a
// large-image preview; the portrait photo sits on a blurred fill of itself.
export const seoImagePath = "/images/og_default.jpg";
export const seoImageWidth = 1200;
export const seoImageHeight = 630;
const instagramUrl = INSTAGRAM_PROFILE_URL;
const telegramUrl = PERSONAL_TELEGRAM_URL;
export const seoTargetLocale = "en" as const;
export const seoTargetOpenGraphLocale = "en_US" as const;
const websiteStructuredDataId = `${normalizedSiteUrl}/#website`;
export const annaStrokStructuredDataId = `${normalizedSiteUrl}/#anna-strok`;

const getOpenGraphLocale = (locale: string) => {
  if (locale === "en") {
    return "en_US";
  }

  if (locale === "pl") {
    return "pl_PL";
  }

  return "ru_RU";
};

export const buildPageMetadata = ({
  description,
  keywords,
  locale,
  ogImageAlt,
  path,
  siteName,
  title,
}: {
  description: string;
  keywords: string[];
  locale: string;
  ogImageAlt: string;
  path: string;
  siteName: string;
  title: string;
}): Metadata => ({
  title,
  description,
  keywords,
  alternates: {
    canonical: path,
  },
  openGraph: {
    title,
    description,
    siteName,
    type: "website",
    locale: getOpenGraphLocale(locale),
    url: `${normalizedSiteUrl}${path}`,
    images: [
      {
        url: seoImagePath,
        alt: ogImageAlt,
        width: seoImageWidth,
        height: seoImageHeight,
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [seoImagePath],
  },
});

export const buildBreadcrumbStructuredData = (
  items: Array<{ name: string; path: string }>,
) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: `${normalizedSiteUrl}${item.path}`,
  })),
});

export const buildWebsiteStructuredData = (
  siteName: string,
): { [key: string]: StructuredDataJsonValue } => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": websiteStructuredDataId,
      url: `${normalizedSiteUrl}/`,
      name: "Anna Strok",
      alternateName: siteName,
      inLanguage: seoTargetLocale,
      publisher: {
        "@id": annaStrokStructuredDataId,
      },
    },
    {
      "@type": "Person",
      "@id": annaStrokStructuredDataId,
      name: "Anna Strok",
      url: `${normalizedSiteUrl}/`,
      image: `${normalizedSiteUrl}${seoImagePath}`,
      jobTitle: "Professional dancer and Frame Up Strip instructor",
      sameAs: [instagramUrl, telegramUrl],
    },
  ],
});
