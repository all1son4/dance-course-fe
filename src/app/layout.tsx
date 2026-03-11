import "./globals.css";
import "@/styles/vendor/plyr.css";

import { Analytics } from "@vercel/analytics/next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import SiteComingSoon from "@/components/maintenance/SiteComingSoon";
import StyledComponentsRegistry from "@/lib/StyledComponentsRegistry";
import { StoreProvider } from "@/stores";

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
    <html lang="ru">
      <body className={manrope.variable}>
        <Analytics />
        <StyledComponentsRegistry>
          {showSite ? <StoreProvider>{children}</StoreProvider> : <SiteComingSoon />}
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
