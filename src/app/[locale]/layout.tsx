import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import DeferredCookieConsentBanner from "@/components/common/CookieConsent/DeferredCookieConsentBanner";
import { RevealController } from "@/components/common/Reveal";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PageContainer from "@/components/layout/PageContainer";
import SkipLink, { MAIN_CONTENT_ID } from "@/components/layout/SkipLink";
import BirthdayPopup from "@/components/other/BirthdayPopup";
import { GLOBAL_CLIENT_NAMESPACES, pickMessages } from "@/i18n/client-messages";
import { routing } from "@/i18n/routing";
import {
  getOpenGraphLocale,
  normalizedSiteUrl,
  seoImageHeight,
  seoImagePath,
  seoImageWidth,
} from "@/lib/seo";
import { SITE_APP_ICONS, SITE_THEME_COLORS } from "@/lib/site-chrome";
import { STICKY_CTA_DOCK_ID } from "@/lib/sticky-cta";
import { LogoSymbol } from "@/svg";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Browser bar colour per scheme, matched to the page background - see
  // lib/site-chrome for the measurement and why dark stays light.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: SITE_THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: SITE_THEME_COLORS.dark },
  ],
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

  return {
    title: {
      default: t("title.default"),
      template: t("title.template"),
    },
    description: t("description"),
    applicationName: t("applicationName"),
    metadataBase: new URL(normalizedSiteUrl),
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      title: t("title.default"),
      description: t("description"),
      locale: getOpenGraphLocale(locale),
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
      icon: [
        { url: SITE_APP_ICONS.svg, type: "image/svg+xml" },
        { url: SITE_APP_ICONS.png192, sizes: "192x192", type: "image/png" },
        { url: SITE_APP_ICONS.png512, sizes: "512x512", type: "image/png" },
      ],
      shortcut: [SITE_APP_ICONS.svg],
      apple: [{ url: SITE_APP_ICONS.apple, sizes: "180x180", type: "image/png" }],
    },
    // Indexing is the default. Stating it here would sit next to the `noindex`
    // Next adds to a 404, giving such a page two conflicting robots tags.
    robots: {
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
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
        {/* Sticky CTA portal target; see STICKY_CTA_DOCK_ID. */}
        <div id={STICKY_CTA_DOCK_ID} style={{ display: "contents" }} />
      </main>
      <RevealController />
      <Footer />
      <DeferredCookieConsentBanner />
      <BirthdayPopup />
    </NextIntlClientProvider>
  );
}
