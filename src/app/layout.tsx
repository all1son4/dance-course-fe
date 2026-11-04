import "./globals.css";

import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { CookieConsentProvider } from "@/components/common/CookieConsent/CookieConsentProvider";
import DeferredClientFeatures from "@/components/common/DeferredClientFeatures";
import PageTransition from "@/components/layout/PageTransition";
import SiteComingSoon from "@/components/maintenance/SiteComingSoon";
import StyledComponentsRegistry from "@/lib/StyledComponentsRegistry";

const manrope = Manrope({
  variable: "--font-manrope",
  // Russian is a first-class locale: preload its subset alongside Latin so
  // RU pages do not get a second, late font swap.
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const isSiteVisible = () => {
  const normalizedValue = (process.env.SHOW_SITE ?? "true").trim().toLowerCase();

  return !["0", "false", "no", "off"].includes(normalizedValue);
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const showSite = isSiteVisible();

  return (
    <html lang="en">
      <body className={manrope.variable}>
        <CookieConsentProvider>
          <DeferredClientFeatures />
          {/* In the root layout, not the locale one: a locale switch swaps the
              whole [locale] segment, and must not count as a page change. */}
          <PageTransition />
          <StyledComponentsRegistry>
            {showSite ? children : <SiteComingSoon />}
          </StyledComponentsRegistry>
        </CookieConsentProvider>
      </body>
    </html>
  );
}
