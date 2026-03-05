import type { Metadata } from "next";

export const siteUrl =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
export const normalizedSiteUrl = siteUrl.replace(/\/+$/u, "");
export const seoImagePath = "/images/seo_photo.jpg";
export const instagramUrl = "https://www.instagram.com/anna.strok_dance";
export const telegramUrl = "https://t.me/annastrok_dance";

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
