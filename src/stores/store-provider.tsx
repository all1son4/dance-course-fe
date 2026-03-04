"use client";

import { createContext, ReactNode, useContext } from "react";

import { RootStore } from "./root-store";

const StoreContext = createContext<RootStore | null>(null);
let storeSingleton: RootStore | null = null;

const isCompatibleStore = (store: RootStore) =>
  typeof store.paymentStore.getStripeClientSecret === "function" &&
  typeof store.paymentStore.getStripeIntentError === "function" &&
  typeof store.paymentStore.getStripePaymentIntentId === "function";

const getRootStore = () => {
  if (!storeSingleton || !isCompatibleStore(storeSingleton)) {
    storeSingleton = new RootStore();
  }

  return storeSingleton;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  return <StoreContext.Provider value={getRootStore()}>{children}</StoreContext.Provider>;
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
