import type { Metadata } from "next";

import { INSTAGRAM_PROFILE_URL, PERSONAL_TELEGRAM_URL } from "@/constants/links";

export const siteUrl =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
export const normalizedSiteUrl = siteUrl.replace(/\/+$/u, "");
export const seoImagePath = "/images/seo_photo.jpg";
export const instagramUrl = INSTAGRAM_PROFILE_URL;
export const telegramUrl = PERSONAL_TELEGRAM_URL;

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
