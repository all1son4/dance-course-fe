import type { Metadata } from "next";
import type { ReactNode } from "react";

import { StoreProvider } from "@/stores";

export const metadata: Metadata = {
  title: "Secure checkout",
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

type PaymentLayoutProps = {
  children: ReactNode;
};

export default function PaymentLayout({ children }: PaymentLayoutProps) {
  return <StoreProvider>{children}</StoreProvider>;
}
