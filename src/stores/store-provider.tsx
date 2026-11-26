"use client";

import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";

import { PaymentStore, type PaymentStoreInitialization } from "./payment-store";

const StoreContext = createContext<PaymentStore | null>(null);

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
  const [store] = useState(() => new PaymentStore(paymentInitialization));
  // A server refresh (the campaign end, a repriced offer) brings a new catalogue.
  const products = paymentInitialization?.sellableProducts;
  const appliedProducts = useRef(products);

  useEffect(() => {
    if (products === appliedProducts.current) return;

    appliedProducts.current = products;
    if (products) {
      store.setSellableProducts(products);
    } else {
      store.setCatalogUnavailable();
    }
  }, [products, store]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function usePaymentStore() {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("StoreProvider is missing in React tree.");
  }

  return store;
}
