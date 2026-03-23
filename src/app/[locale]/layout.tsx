import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { CookieConsentBanner } from "@/components/common/CookieConsent";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PageContainer from "@/components/layout/PageContainer";
import { routing } from "@/i18n/routing";
import { instagramUrl, normalizedSiteUrl, seoImagePath, telegramUrl } from "@/lib/seo";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#d8dade",
  viewportFit: "cover",
};

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LocaleLayoutProps, "children">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const keywords = t("keywords")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const openGraphLocale = locale === "en" ? "en_US" : locale === "pl" ? "pl_PL" : "ru_RU";

  return {
    title: {
      default: t("title.default"),
      template: t("title.template"),
    },
    description: t("description"),
    applicationName: t("applicationName"),
    metadataBase: new URL(normalizedSiteUrl),
    keywords,
    alternates: {
      canonical: "./",
    },
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      title: t("title.default"),
      description: t("description"),
      locale: openGraphLocale,
      images: [
        {
          url: seoImagePath,
          alt: t("ogImageAlt"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title.default"),
      description: t("description"),
      images: [seoImagePath],
    },
    icons: {
      icon: [{ url: "/svg/favicon.svg", type: "image/svg+xml" }],
      shortcut: ["/svg/favicon.svg"],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    authors: [{ name: "Anna Strok" }],
    creator: "Anna Strok",
    publisher: t("siteName"),
    category: "dance",
  };
}

export default async function RootLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: t("siteName"),
      url: normalizedSiteUrl,
      description: t("description"),
      inLanguage: locale,
    },
    {
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Anna Strok",
      url: normalizedSiteUrl,
      image: `${normalizedSiteUrl}${seoImagePath}`,
      sameAs: [instagramUrl, telegramUrl],
      jobTitle: "Dance Teacher",
    },
  ];

  return (
    <NextIntlClientProvider messages={messages}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />
      <main lang={locale}>
        <PageContainer>{children}</PageContainer>
      </main>
      <Footer />
      <CookieConsentBanner />
    </NextIntlClientProvider>
  );
}
