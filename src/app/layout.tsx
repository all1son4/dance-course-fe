import "./globals.css";
import "@/styles/vendor/plyr.css";

import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import StyledComponentsRegistry from "@/lib/StyledComponentsRegistry";
import { StoreProvider } from "@/stores";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className={manrope.variable}>
        <StyledComponentsRegistry>
          <StoreProvider>{children}</StoreProvider>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
