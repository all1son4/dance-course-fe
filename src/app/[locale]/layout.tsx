import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import DeferredCookieConsentBanner from "@/components/common/CookieConsent/DeferredCookieConsentBanner";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PageContainer from "@/components/layout/PageContainer";
import SkipLink, { MAIN_CONTENT_ID } from "@/components/layout/SkipLink";
import BirthdayPopup from "@/components/other/BirthdayPopup";
import { GLOBAL_CLIENT_NAMESPACES, pickMessages } from "@/i18n/client-messages";
import { routing } from "@/i18n/routing";
import {
  normalizedSiteUrl,
  seoImageHeight,
  seoImagePath,
  seoImageWidth,
  seoTargetLocale,
  seoTargetOpenGraphLocale,
} from "@/lib/seo";
import { LogoSymbol } from "@/svg";

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
  await params;
  const t = await getTranslations({ locale: seoTargetLocale, namespace: "Metadata" });
  const keywords = t("keywords")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

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
      locale: seoTargetOpenGraphLocale,
      images: [
        {
          url: seoImagePath,
          alt: t("ogImageAlt"),
          width: seoImageWidth,
          height: seoImageHeight,
          type: "image/jpeg",
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
  // Only what the layout's own client components need. Pages whose client
  // components use more wrap themselves in a provider with their namespaces
  // (a nested provider replaces, not merges, the messages).
  const messages = pickMessages(await getMessages(), GLOBAL_CLIENT_NAMESPACES);

  return (
    <NextIntlClientProvider messages={messages}>
      <LogoSymbol />
      <SkipLink />
      <Header />
      {/* tabIndex={-1} lets the skip link move focus here. */}
      <main id={MAIN_CONTENT_ID} lang={locale} tabIndex={-1}>
        <PageContainer>{children}</PageContainer>
      </main>
      <Footer />
      <DeferredCookieConsentBanner />
      <BirthdayPopup />
    </NextIntlClientProvider>
  );
}
