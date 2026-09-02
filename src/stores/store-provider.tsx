"use client";

import { createContext, ReactNode, useContext, useState } from "react";

import type { PaymentStoreInitialization } from "./payment-store";
import { RootStore } from "./root-store";

const StoreContext = createContext<RootStore | null>(null);

export function StoreProvider({
  children,
  paymentInitialization,
}: {
  children: ReactNode;
  paymentInitialization?: PaymentStoreInitialization;
}) {
  // One provider mount is one checkout session. This also makes the server HTML
  // and hydration start from the same authoritative catalogue snapshot instead
  // of reusing a browser-global store left by an earlier visit.
  const [store] = useState(() => new RootStore(paymentInitialization));

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("StoreProvider is missing in React tree.");
  }

  return store;
}

export function usePaymentStore() {
  return useStore().paymentStore;
}
