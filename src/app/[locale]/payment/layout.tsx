import type { ReactNode } from "react";

import { StoreProvider } from "@/stores";

type PaymentLayoutProps = {
  children: ReactNode;
};

export default function PaymentLayout({ children }: PaymentLayoutProps) {
  return <StoreProvider>{children}</StoreProvider>;
}
