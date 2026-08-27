import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { StoreProvider } from "@/stores";

// Checkout is noindex, so the title follows the visitor's locale rather than
// the site-wide SEO locale used by the public pages.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.pages.payment");

  return {
    title: t("title"),
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
  };
}

type PaymentLayoutProps = {
  children: ReactNode;
};

export default function PaymentLayout({ children }: PaymentLayoutProps) {
  return <StoreProvider>{children}</StoreProvider>;
}
