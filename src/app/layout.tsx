import "./globals.css";

import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import CheckoutDraftLifecycle from "@/components/common/CheckoutDraftLifecycle";
import ConsentAwareAnalytics from "@/components/common/ConsentAwareAnalytics";
import { CookieConsentProvider } from "@/components/common/CookieConsent";
import NavigationProgress from "@/components/common/NavigationProgress";
import SiteComingSoon from "@/components/maintenance/SiteComingSoon";
import StyledComponentsRegistry from "@/lib/StyledComponentsRegistry";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
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
          <ConsentAwareAnalytics />
          <NavigationProgress />
          <CheckoutDraftLifecycle />
          <StyledComponentsRegistry>
            {showSite ? children : <SiteComingSoon />}
          </StyledComponentsRegistry>
        </CookieConsentProvider>
      </body>
    </html>
  );
}
