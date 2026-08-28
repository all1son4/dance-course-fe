import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { pickMessages } from "@/i18n/client-messages";

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

// Checkout is a client component tree, so its messages are provided here (the
// locale layout only ships the global namespaces). The MobX store is mounted
// by the checkout page itself: success and failed never touch it.
const CHECKOUT_CLIENT_NAMESPACES = [
  "Common",
  "PaymentPage",
  "StripePaymentTabs",
  "SellableProducts",
  "CurrencySwitch",
] as const;

export default async function PaymentLayout({ children }: PaymentLayoutProps) {
  const messages = pickMessages(await getMessages(), CHECKOUT_CLIENT_NAMESPACES);

  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
