import "../globals.css";
import "plyr/dist/plyr.css";

import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { Footer, Header, PageContainer } from "@/components";
import { routing } from "@/i18n/routing";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
    metadataBase: new URL("http://localhost:3000"),
  };
}

export default async function RootLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${manrope.variable}`}>
        <NextIntlClientProvider messages={messages}>
          <Header />
          <main>
            <PageContainer>{children}</PageContainer>
          </main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
