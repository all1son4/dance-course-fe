"use client";

import { createContext, ReactNode, useContext, useState } from "react";

import { RootStore } from "./root-store";

const StoreContext = createContext<RootStore | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new RootStore());
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
